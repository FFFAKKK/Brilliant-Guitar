//! Detached migration. No existing session, history, version or event is mutated.
use super::*;
use brilliant_core_types::FiniteNumber;

mod scheduled;

impl IntegratedKernelRuntimeV2 {
    pub fn migrate_extension(bytes: &[u8], executor: &mut dyn ContributionExecutorV2) -> Vec<u8> {
        let _reads = super::core_reads::OperationScope::enter();
        let result = migrate(bytes, executor).unwrap_or_else(|error| {
            let error =
                if string(field(&error, "code").unwrap_or(&JsonValue::Null)).is_ok_and(|id| {
                    id.code_units()
                        .starts_with(&[109, 105, 103, 114, 97, 116, 105, 111, 110, 46])
                }) {
                    error
                } else {
                    failure("migration.internal-error")
                };
            object([("status", text("rejected")), ("failure", error)])
        });
        encode(&result).unwrap_or_else(|_| {
            b"{\"status\":\"rejected\",\"failure\":{\"code\":\"migration.internal-error\"}}"
                .to_vec()
        })
    }
}

fn semantic(document: &Value) -> Result<()> {
    let assessed =
        assess_score_semantics(document).map_err(|_| failure("migration.internal-error"))?;
    if !assessed.diagnostics.is_empty() {
        return Err(object([
            ("code", text("migration.semantic-invalid")),
            ("diagnostics", value(&assessed.diagnostics)?),
        ]));
    }
    Ok(())
}

fn validate_request(request: &Value) -> Result<ExtensionOwnerV1> {
    let invalid = || failure("migration.invalid-request");
    if !exact(
        request,
        &[
            "migrationVersion",
            "moduleId",
            "contributionId",
            "effectKind",
            "namespace",
            "owner",
            "sourceSchemaVersion",
            "targetSchemaVersion",
            "payload",
        ],
    ) || integer(field(request, "migrationVersion")?) != Some(1)
        || !matches!(field(request, "payload")?, JsonValue::Object(_))
    {
        return Err(invalid());
    }
    for key in ["moduleId", "contributionId", "effectKind", "namespace"] {
        let id = string(field(request, key)?).map_err(|_| invalid())?;
        if !brilliant_extension_protocol::valid_registry_id(id.code_units().iter().copied()) {
            return Err(invalid());
        }
    }
    let source = integer(field(request, "sourceSchemaVersion")?)
        .filter(|v| *v > 0)
        .ok_or_else(invalid)?;
    let target = integer(field(request, "targetSchemaVersion")?)
        .filter(|v| *v > 0)
        .ok_or_else(invalid)?;
    if source == target {
        return Err(invalid());
    }
    ExtensionOwnerV1::from_lossless_value(field(request, "owner")?.clone()).map_err(|_| invalid())
}

fn migrate(bytes: &[u8], executor: &mut dyn ContributionExecutorV2) -> Result<Value> {
    let input = decode(bytes)?;
    let scoped = executor.uses_scoped_preparation();
    let mut fields = vec![
        "apiVersion",
        "document",
        "request",
        "catalog",
        "commands",
        "effects",
    ];
    if scoped {
        fields.push("assessmentReads");
    }
    if !exact(&input, &fields) || integer(field(&input, "apiVersion")?) != Some(2) {
        return Err(failure("migration.invalid-request"));
    }
    let raw_document = field(&input, "document")?;
    let request = field(&input, "request")?;
    let owner = validate_request(request)?;
    // The public facade captures/shape-decodes first. Core semantics precede
    // catalog authenticity and all owner/version checks, including idempotence.
    semantic(raw_document)?;
    let document = ScoreDocumentV1::from_lossless_value(raw_document.clone()).map_err(|_| {
        object([
            ("code", text("migration.invalid-input")),
            ("diagnostics", JsonValue::Array(vec![])),
        ])
    })?;
    let catalog = decode_host_catalog_projection_v1(field(&input, "catalog")?)
        .map_err(|_| failure("migration.assembly-mismatch"))?;
    let assembly = catalog
        .resolve_inventory(InventorySelectionV1::Omitted)
        .map_err(|_| failure("migration.assembly-mismatch"))?;
    let commands = array(field(&input, "commands")?)?;
    let effects = array(field(&input, "effects")?)?;
    validate_descriptors(commands, effects, &assembly)
        .map_err(|_| failure("migration.assembly-mismatch"))?;
    let reads = if scoped {
        assessment::decode_reads(field(&input, "assessmentReads")?, &assembly)
            .map_err(|_| failure("migration.assembly-mismatch"))?
    } else {
        Vec::new()
    };
    let source = object([
        ("moduleId", field(request, "moduleId")?.clone()),
        ("contributionId", field(request, "contributionId")?.clone()),
    ]);
    let effect = effects
        .iter()
        .find(|effect| {
            field(effect, "effectKind").ok() == field(request, "effectKind").ok()
                && field(effect, "source").ok() == Some(&source)
                && field(effect, "namespace").ok() == field(request, "namespace").ok()
        })
        .ok_or_else(|| failure("migration.assembly-mismatch"))?;
    let owner_kind = match &owner {
        ExtensionOwnerV1::Score => "score",
        ExtensionOwnerV1::Part { .. } => "part",
    };
    if !array(field(effect, "ownerKinds")?)?
        .iter()
        .any(|item| string(item).is_ok_and(|item| item.eq_ascii(owner_kind)))
    {
        return Err(failure("migration.assembly-mismatch"));
    }
    let namespace = string(field(request, "namespace")?)?;
    let block = document
        .extensions
        .iter()
        .find(|block| &block.namespace == namespace && block.owner == owner)
        .ok_or_else(|| failure("migration.target-not-found"))?;
    let source_version = integer(field(request, "sourceSchemaVersion")?).ok_or_else(internal)?;
    let target_version = integer(field(request, "targetSchemaVersion")?).ok_or_else(internal)?;
    let versions = array(field(effect, "supportedSchemaVersions")?)?;
    let block_version = integer(&value(&block.schema_version)?).ok_or_else(internal)?;
    if (block_version != source_version && block_version != target_version)
        || !versions.iter().any(|v| integer(v) == Some(source_version))
    {
        return Err(failure("migration.unsupported-source-version"));
    }
    if !versions.iter().any(|v| integer(v) == Some(target_version)) {
        return Err(failure("migration.unsupported-target-version"));
    }
    if scoped {
        scheduled::start(raw_document, executor)?;
    }
    if block_version == target_version {
        return Ok(object([
            ("status", text("not-required")),
            ("document", raw_document.clone()),
        ]));
    }

    let prepared = if scoped {
        scheduled::prepare(raw_document, request, &source, &assembly, &reads, executor)?
    } else {
        callback(
            executor,
            object([
                ("operation", text("migrationPrepare")),
                ("document", raw_document.clone()),
                ("request", request.clone()),
            ]),
            &source,
        )?
    };
    if !exact(&prepared, &["ok", "schemaVersion", "payload"])
        || integer(field(&prepared, "schemaVersion")?) != Some(target_version)
        || !matches!(field(&prepared, "payload")?, JsonValue::Object(_))
    {
        return Err(owned_failure(
            &source,
            "migration.contribution-contract-violation",
        ));
    }
    let replacement = ExtensionBlockV1::from_lossless_value(object([
        ("namespace", JsonValue::String(namespace.clone())),
        ("owner", value(&owner)?),
        ("schemaVersion", number(target_version)),
        ("payload", field(&prepared, "payload")?.clone()),
    ]))
    .map_err(|_| owned_failure(&source, "migration.contribution-contract-violation"))?;
    let runtime =
        KernelRuntime::create(document).map_err(|_| failure("migration.internal-error"))?;
    let mut transaction = runtime.begin_stage3_transaction();
    transaction
        .set_integrated_extension(namespace.clone(), owner, Some(replacement))
        .map_err(|_| failure("migration.internal-error"))?;
    let candidate = transaction
        .integrated_projection(runtime.document_id())
        .map_err(|_| failure("migration.internal-error"))?;
    // Migration's existing JSON roundtrip normalizes -0, unlike ordinary edits.
    // This normalization is local to a successful migration; idempotence above
    // returns the captured input unchanged.
    let mut migrated = value(&candidate)?;
    normalize_json_zero(&mut migrated);
    semantic(&migrated)?;
    if scoped {
        scheduled::validate(&migrated, &assembly, &reads, executor)?;
    } else {
        let validated = callback(
            executor,
            object([
                ("operation", text("migrationValidate")),
                ("document", migrated.clone()),
            ]),
            &JsonValue::Null,
        )?;
        if !exact(&validated, &["ok"]) {
            return Err(failure("migration.internal-error"));
        }
    }
    // Finish the shared transaction preparation to enforce its storage/resource
    // invariants. The detached API deliberately performs no Store adoption.
    transaction
        .finish()
        .map_err(|_| failure("migration.internal-error"))?;
    Ok(object([
        ("status", text("migrated")),
        ("document", migrated),
    ]))
}

fn normalize_json_zero(value: &mut Value) {
    match value {
        JsonValue::Number(number) if number.get() == 0.0 => {
            *number = FiniteNumber::new(0.0).expect("zero is finite")
        }
        JsonValue::Array(values) => values.iter_mut().for_each(normalize_json_zero),
        JsonValue::Object(values) => values.values_mut().for_each(normalize_json_zero),
        _ => (),
    }
}

fn callback(
    executor: &mut dyn ContributionExecutorV2,
    request: Value,
    source: &Value,
) -> Result<Value> {
    let internal = || owned_failure(source, "migration.contribution-internal-error");
    let contract = || owned_failure(source, "migration.contribution-contract-violation");
    let mut reads = super::core_reads::CoreReads::new(&request);
    if reads.failed() {
        return Err(internal());
    }
    let bytes = executor
        .execute_with_core_reads(&encode(&request)?, &mut reads)
        .map_err(|_| internal())?;
    if reads.failed() {
        return Err(internal());
    }
    let reply = decode(&bytes).map_err(|_| contract())?;
    match field(&reply, "ok")? {
        JsonValue::Bool(true) => Ok(reply),
        JsonValue::Bool(false) if exact(&reply, &["ok", "failure"]) => {
            Err(field(&reply, "failure")?.clone())
        }
        _ => Err(contract()),
    }
}
