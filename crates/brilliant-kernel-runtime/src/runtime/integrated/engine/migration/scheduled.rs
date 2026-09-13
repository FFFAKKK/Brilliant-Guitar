//! Detached migration invokes bounded callbacks individually, without sending
//! the complete source or migrated Core document to the trusted host.
use super::*;

pub(super) fn start(document: &Value, executor: &mut dyn ContributionExecutorV2) -> Result<()> {
    let reply = invoke(
        object([
            ("operation", text("migrationStart")),
            ("scheduleVersion", number(4)),
            ("documentId", field(document, "id")?.clone()),
            ("documentVersion", JsonValue::Null),
        ]),
        document,
        &JsonValue::Null,
        executor,
    )?;
    if !exact(&reply, &["ok", "scheduleVersion"])
        || integer(field(&reply, "scheduleVersion")?) != Some(4)
    {
        return Err(failure("migration.internal-error"));
    }
    Ok(())
}

fn view(
    document: &Value,
    source: &Value,
    assembly: &ResolvedHostAssemblyV1,
    reads: &[Value],
) -> Result<Value> {
    // Unlike editing's inactive reader, migration must reject incompatible
    // dependencies, in roster order, before invoking that contribution.
    for row in reads
        .iter()
        .filter(|row| field(row, "reader").ok() == Some(source))
    {
        for block in array(field(document, "extensions")?)? {
            if field(row, "namespace")? == field(block, "namespace")?
                && array(field(row, "ownerKinds")?)?
                    .contains(field(field(block, "owner")?, "kind")?)
                && !array(field(row, "supportedSchemaVersions")?)?
                    .contains(field(block, "schemaVersion")?)
            {
                return Err(owned_failure(
                    source,
                    "migration.contribution-contract-violation",
                ));
            }
        }
    }
    let mut result = scheduled_assessment::contribution_view(document, 0, source, assembly, reads)?;
    let JsonValue::Object(fields) = &mut result else {
        unreachable!()
    };
    // Detached sources have no session version. This matches guest V2 reads.
    fields.insert("documentVersion".into(), JsonValue::Null);
    Ok(result)
}

pub(super) fn prepare(
    document: &Value,
    request: &Value,
    source: &Value,
    assembly: &ResolvedHostAssemblyV1,
    reads: &[Value],
    executor: &mut dyn ContributionExecutorV2,
) -> Result<Value> {
    let view = view(document, source, assembly, reads)?;
    let contract = || owned_failure(source, "migration.contribution-contract-violation");
    let definition = field(request, "effectKind")?;
    let decoded = callback(
        "effectDecode",
        definition,
        vec![field(request, "payload")?.clone()],
        document,
        source,
        executor,
    )?;
    if !exact(&decoded, &["status", "payload"]) || !tag(&decoded, "status", "decoded") {
        return Err(contract());
    }
    let block = array(field(document, "extensions")?)?
        .iter()
        .find(|block| {
            field(block, "namespace").ok() == field(request, "namespace").ok()
                && field(block, "owner").ok() == field(request, "owner").ok()
        })
        .ok_or_else(contract)?;
    let transformed = callback(
        "effectTransform",
        definition,
        vec![object([
            ("view", view),
            ("owner", field(request, "owner")?.clone()),
            ("currentBlock", block.clone()),
            ("payload", field(&decoded, "payload")?.clone()),
        ])],
        document,
        source,
        executor,
    )?;
    // Migration admits only replacement, never edit no-op/remove/rejected forms.
    if !exact(&transformed, &["status", "schemaVersion", "payload"])
        || !tag(&transformed, "status", "replace")
    {
        return Err(contract());
    }
    Ok(object([
        ("ok", JsonValue::Bool(true)),
        (
            "schemaVersion",
            field(&transformed, "schemaVersion")?.clone(),
        ),
        ("payload", field(&transformed, "payload")?.clone()),
    ]))
}

pub(super) fn validate(
    document: &Value,
    assembly: &ResolvedHostAssemblyV1,
    reads: &[Value],
    executor: &mut dyn ContributionExecutorV2,
) -> Result<()> {
    let mut sources = std::collections::BTreeMap::new();
    for requirement in assembly.requirements() {
        if assembly.has_installed_owner(&requirement.module_id, &requirement.contribution_id)
            && array(field(document, "extensions")?)?.iter().any(|block| {
                string(field(block, "namespace").unwrap_or(&JsonValue::Null))
                    .is_ok_and(|namespace| namespace.eq_ascii(&requirement.namespace))
                    && field(block, "schemaVersion")
                        .ok()
                        .and_then(integer)
                        .is_some_and(|version| {
                            requirement.supported_schema_versions.contains(&version)
                        })
            })
        {
            sources.insert(
                (
                    requirement.module_id.clone(),
                    requirement.contribution_id.clone(),
                ),
                object([
                    ("moduleId", value(&requirement.module_id)?),
                    ("contributionId", value(&requirement.contribution_id)?),
                ]),
            );
        }
    }
    let mut issues = Vec::new();
    for source in sources.values() {
        let view = view(document, source, assembly, reads)?;
        let raw = callback(
            "validate",
            &JsonValue::Null,
            vec![view],
            document,
            source,
            executor,
        )?;
        let contract = || owned_failure(source, "migration.contribution-contract-violation");
        let rows = scheduled_assessment::checked_issues(&raw, source).map_err(|_| contract())?;
        if issues.len() + rows.len() > 4096 {
            return Err(contract());
        }
        issues.extend_from_slice(rows);
    }
    if !issues.is_empty() {
        return Err(object([
            ("code", text("migration.contribution-semantic-invalid")),
            ("issues", JsonValue::Array(issues)),
        ]));
    }
    Ok(())
}

fn callback(
    operation: &str,
    definition: &Value,
    arguments: Vec<Value>,
    document: &Value,
    source: &Value,
    executor: &mut dyn ContributionExecutorV2,
) -> Result<Value> {
    let reply = invoke(
        object([
            ("operation", text("migrationCallback")),
            ("scheduleVersion", number(4)),
            ("documentId", field(document, "id")?.clone()),
            ("documentVersion", JsonValue::Null),
            ("moduleId", field(source, "moduleId")?.clone()),
            ("contributionId", field(source, "contributionId")?.clone()),
            ("callbackOperation", text(operation)),
            ("definitionId", definition.clone()),
            ("arguments", JsonValue::Array(arguments)),
        ]),
        document,
        source,
        executor,
    )?;
    if !exact(&reply, &["ok", "value"]) {
        return Err(owned_failure(
            source,
            "migration.contribution-contract-violation",
        ));
    }
    Ok(field(&reply, "value")?.clone())
}

fn invoke(
    request: Value,
    document: &Value,
    source: &Value,
    executor: &mut dyn ContributionExecutorV2,
) -> Result<Value> {
    let mut reads = core_reads::CoreReads::from_document(Some(document), None);
    let internal = || owned_failure(source, "migration.contribution-internal-error");
    let contract = || owned_failure(source, "migration.contribution-contract-violation");
    let bytes = executor
        .execute_with_core_reads(&encode(&request)?, &mut reads)
        .map_err(|_| internal())?;
    if reads.failed() {
        return Err(internal());
    }
    let reply = decode(&bytes).map_err(|_| contract())?;
    if field(&reply, "ok").ok() != Some(&JsonValue::Bool(true)) {
        return Err(contract());
    }
    Ok(reply)
}
