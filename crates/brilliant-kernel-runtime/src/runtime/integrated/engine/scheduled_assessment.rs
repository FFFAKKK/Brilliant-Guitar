//! Runtime owns the roster, phase ordering, views and diagnostic aggregation.
//! Only individual bounded guest invocations cross the trusted host boundary.
use super::*;

impl IntegratedKernelRuntimeV2 {
    pub(super) fn scheduled_assess(
        &mut self,
        document: &ScoreDocumentV1,
        version: u64,
        sources: Vec<Value>,
        core: Value,
        availability: Value,
        executor: &mut dyn ContributionExecutorV2,
    ) -> Result<Value> {
        // Keep the Core read source in Rust, separate from serialized requests.
        self.callback_projections = self.callback_projections.saturating_add(1);
        let candidate = object([
            ("document", value(document)?),
            ("documentVersion", number(version)),
        ]);
        let schedule_version = if executor.uses_scoped_preparation() {
            4
        } else {
            3
        };
        let start = object([
            ("operation", text("assessmentStart")),
            ("scheduleVersion", number(schedule_version)),
            ("documentId", value(&document.id)?),
            ("documentVersion", number(version)),
        ]);
        let ack = invoke(executor, &start, &candidate, &JsonValue::Null)?;
        if !exact(&ack, &["ok", "scheduleVersion"])
            || integer(field(&ack, "scheduleVersion")?) != Some(schedule_version)
        {
            return Err(internal());
        }
        let mut views = Vec::new();
        let mut semantic = Vec::new();
        for source in &sources {
            let view = contribution_view(
                field(&candidate, "document")?,
                version,
                source,
                &self.assembly,
                &self.assessment_reads,
            )?;
            let raw = self.assessment_callback("validate", source, &view, &candidate, executor)?;
            let issues = checked_issues(&raw, source)?;
            if semantic.len() + issues.len() > 4096 {
                return Err(resource("module-issues", 4096));
            }
            semantic.extend_from_slice(issues);
            views.push(view);
        }
        if !semantic.is_empty() {
            return Err(object([
                ("code", text("command.contribution-semantic-invalid")),
                ("issues", JsonValue::Array(semantic)),
            ]));
        }
        let mut modules = Vec::new();
        let mut issue_count = 0;
        for (source, view) in sources.iter().zip(&views) {
            let raw = self.assessment_callback("classify", source, view, &candidate, executor)?;
            let contract = || owned_failure(source, "command.contribution-contract-violation");
            if !exact(&raw, &["status", "issues"])
                || !(tag(&raw, "status", "supported") || tag(&raw, "status", "unsupported"))
            {
                return Err(contract());
            }
            let issues = checked_issues(field(&raw, "issues")?, source)?;
            issue_count += issues.len();
            if issue_count > 4096 {
                return Err(resource("module-issues", 4096));
            }
            modules.push(object([
                ("moduleId", field(source, "moduleId")?.clone()),
                ("contributionId", field(source, "contributionId")?.clone()),
                ("status", field(&raw, "status")?.clone()),
                ("issues", JsonValue::Array(issues.to_vec())),
            ]));
        }
        Ok(object([
            ("ok", JsonValue::Bool(true)),
            ("availability", availability),
            (
                "assessment",
                object([("core", core), ("modules", JsonValue::Array(modules))]),
            ),
        ]))
    }

    fn assessment_callback(
        &mut self,
        operation: &str,
        source: &Value,
        view: &Value,
        candidate: &Value,
        executor: &mut dyn ContributionExecutorV2,
    ) -> Result<Value> {
        let request = object([
            ("operation", text("assessmentCallback")),
            (
                "scheduleVersion",
                number(if executor.uses_scoped_preparation() {
                    4
                } else {
                    3
                }),
            ),
            ("documentId", field(view, "documentId")?.clone()),
            ("documentVersion", field(view, "documentVersion")?.clone()),
            ("moduleId", field(source, "moduleId")?.clone()),
            ("contributionId", field(source, "contributionId")?.clone()),
            ("callbackOperation", text(operation)),
            ("view", view.clone()),
        ]);
        let reply = invoke(executor, &request, candidate, source)?;
        if !exact(&reply, &["ok", "value"]) {
            return Err(owned_failure(
                source,
                "command.contribution-contract-violation",
            ));
        }
        Ok(field(&reply, "value")?.clone())
    }
}

pub(super) fn contribution_view(
    document: &Value,
    version: u64,
    source: &Value,
    assembly: &ResolvedHostAssemblyV1,
    assessment_reads: &[Value],
) -> Result<Value> {
    let module = string(field(source, "moduleId")?)?;
    let contribution = string(field(source, "contributionId")?)?;
    let mut own = Vec::new();
    for block in array(field(document, "extensions")?)? {
        let namespace = string(field(block, "namespace")?)?;
        let block_version = integer(field(block, "schemaVersion")?);
        if assembly.requirements().iter().any(|requirement| {
            requirement.module_id.as_js_string() == module
                && requirement.contribution_id.as_js_string() == contribution
                && namespace.eq_ascii(&requirement.namespace)
                && requirement
                    .supported_schema_versions
                    .iter()
                    .any(|version| Some(*version) == block_version)
        }) {
            own.push(block);
        }
    }
    let mut dependencies = Vec::new();
    for row in assessment_reads
        .iter()
        .filter(|row| field(row, "reader").ok() == Some(source))
    {
        let mut blocks = Vec::new();
        for block in array(field(document, "extensions")?)? {
            let kind = field(field(block, "owner")?, "kind")?;
            if field(row, "namespace")? == field(block, "namespace")?
                && array(field(row, "ownerKinds")?)?
                    .iter()
                    .any(|item| item == kind)
                && array(field(row, "supportedSchemaVersions")?)?
                    .iter()
                    .any(|item| {
                        integer(item) == field(block, "schemaVersion").ok().and_then(integer)
                    })
            {
                blocks.push(block);
            }
        }
        dependencies.push(object([
            ("readVersion", number(1)),
            ("provider", field(row, "provider")?.clone()),
            ("namespace", field(row, "namespace")?.clone()),
            (
                "supportedSchemaVersions",
                field(row, "supportedSchemaVersions")?.clone(),
            ),
            ("ownerKinds", field(row, "ownerKinds")?.clone()),
            ("blocks", sorted_blocks(blocks)?),
        ]));
    }
    let mut view = object([
        ("viewVersion", number(2)),
        ("documentId", field(document, "id")?.clone()),
        ("schemaVersion", field(document, "schemaVersion")?.clone()),
        ("documentVersion", number(version)),
        ("compatibleExtensions", sorted_blocks(own)?),
    ]);
    if !dependencies.is_empty() {
        let JsonValue::Object(fields) = &mut view else {
            unreachable!()
        };
        fields.insert("dependencyReads".into(), JsonValue::Array(dependencies));
    }
    Ok(view)
}

fn sorted_blocks(blocks: Vec<&Value>) -> Result<Value> {
    let mut keyed = Vec::new();
    for block in blocks {
        let namespace = string(field(block, "namespace")?)?.clone();
        let owner = field(block, "owner")?;
        let owner_key = if tag(owner, "kind", "score") {
            None
        } else {
            Some(string(field(owner, "partId")?)?.clone())
        };
        keyed.push(((namespace, owner_key), block));
    }
    keyed.sort_by(|left, right| left.0.cmp(&right.0));
    Ok(JsonValue::Array(
        keyed.into_iter().map(|(_, block)| block.clone()).collect(),
    ))
}

pub(super) fn checked_issues<'a>(input: &'a Value, source: &Value) -> Result<&'a [Value]> {
    let contract = || owned_failure(source, "command.contribution-contract-violation");
    let issues = array(input).map_err(|_| contract())?;
    if issues.len() > 1024 {
        return Err(contract());
    }
    for issue in issues {
        assessment::validate_issue(issue, source).map_err(|_| contract())?;
    }
    Ok(issues)
}

pub(super) fn invoke(
    executor: &mut dyn ContributionExecutorV2,
    request: &Value,
    candidate: &Value,
    source: &Value,
) -> Result<Value> {
    let internal = || owned_failure(source, "command.contribution-internal-error");
    let mut reads = core_reads::CoreReads::new(candidate);
    if reads.failed() {
        return Err(internal());
    }
    let bytes = executor
        .execute_with_core_reads(&encode(request)?, &mut reads)
        .map_err(|_| internal())?;
    if reads.failed() {
        return Err(internal());
    }
    let reply = decode(&bytes)
        .map_err(|_| owned_failure(source, "command.contribution-contract-violation"))?;
    if field(&reply, "ok")? != &JsonValue::Bool(true) {
        return Err(owned_failure(
            source,
            "command.contribution-contract-violation",
        ));
    }
    Ok(reply)
}
