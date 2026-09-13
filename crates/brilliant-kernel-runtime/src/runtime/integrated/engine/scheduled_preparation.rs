//! Individual plugin preparation and transformation under Runtime control.
//! Raw candidate views preserve provisional Batch data until final validation.
use super::module::{ModuleEnvironment, ModuleTransaction};
use super::*;

impl ModuleEnvironment<'_> {
    pub(super) fn scoped_prepare(
        &self,
        envelope: &Value,
        descriptor: &Value,
        document: Value,
        transaction: &mut impl ModuleTransaction,
        target: &StableEntityAddressV1,
        executor: &mut dyn ContributionExecutorV2,
    ) -> Result<Value> {
        let source = field(descriptor, "source")?;
        let definition = field(descriptor, "commandId")?;
        let contract = || owned_failure(source, "command.contribution-contract-violation");
        let candidate = object([
            ("document", document),
            ("documentVersion", number(self.version)),
        ]);
        let decoded = callback(
            "commandDecode",
            source,
            definition,
            vec![object([
                ("target", field(envelope, "target")?.clone()),
                ("payload", field(envelope, "payload")?.clone()),
            ])],
            &candidate,
            executor,
        )?;
        if exact(&decoded, &["status"]) && tag(&decoded, "status", "invalid") {
            return Err(failure("command.invalid-envelope"));
        }
        if !exact(&decoded, &["status", "command"]) || !tag(&decoded, "status", "decoded") {
            return Err(contract());
        }
        // The decoder runs before target existence, matching the SDK contract.
        if !transaction.contains(target, self.id) {
            return Err(failure("command.target-not-found"));
        }
        let view = scheduled_assessment::contribution_view(
            field(&candidate, "document")?,
            self.version,
            source,
            self.assembly,
            self.assessment_reads,
        )?;
        let mut prepared = callback(
            "commandPrepare",
            source,
            definition,
            vec![view, field(&decoded, "command")?.clone()],
            &candidate,
            executor,
        )?;
        reject_semantic(&prepared, source)?;
        if exact(&prepared, &["status"]) && tag(&prepared, "status", "no-op") {
            return Ok(object([
                ("ok", JsonValue::Bool(true)),
                ("prepared", prepared),
            ]));
        }
        if !exact(&prepared, &["status", "effectRequests", "affected"])
            || !tag(&prepared, "status", "changed")
        {
            return Err(contract());
        }
        // Capture affected addresses before executing effects, retaining the
        // existing first-error ordering and unique-address resource boundary.
        let mut addresses = std::collections::BTreeMap::new();
        for address in array(field(&prepared, "affected")?).map_err(|_| contract())? {
            let (key, _, _) = decode_address(address).map_err(|_| contract())?;
            addresses.insert(key, address.clone());
            if addresses.len() > 131_072 {
                return Err(resource("affected-addresses", 131_072));
            }
        }
        if array(field(&prepared, "effectRequests")?)
            .map_err(|_| contract())?
            .is_empty()
        {
            return Err(contract());
        }
        let JsonValue::Object(fields) = &mut prepared else {
            unreachable!()
        };
        fields.insert(
            "affected".into(),
            JsonValue::Array(addresses.into_values().collect()),
        );
        Ok(object([
            ("ok", JsonValue::Bool(true)),
            ("prepared", prepared),
        ]))
    }

    pub(super) fn scoped_transform(
        &self,
        request: &Value,
        source: &Value,
        document: Value,
        executor: &mut dyn ContributionExecutorV2,
    ) -> Result<Value> {
        let definition = field(request, "effectKind")?;
        let contract = || owned_failure(source, "command.contribution-contract-violation");
        let candidate = object([
            ("document", document),
            ("documentVersion", number(self.version)),
        ]);
        let decoded = callback(
            "effectDecode",
            source,
            definition,
            vec![field(request, "payload")?.clone()],
            &candidate,
            executor,
        )?;
        if !exact(&decoded, &["status", "payload"]) || !tag(&decoded, "status", "decoded") {
            return Err(contract());
        }
        let document = field(&candidate, "document")?;
        let view = scheduled_assessment::contribution_view(
            document,
            self.version,
            source,
            self.assembly,
            self.assessment_reads,
        )?;
        let mut input = object([
            ("view", view),
            ("owner", field(request, "owner")?.clone()),
            ("payload", field(&decoded, "payload")?.clone()),
        ]);
        if let Some(block) = array(field(document, "extensions")?)?.iter().find(|block| {
            field(block, "namespace").ok() == field(request, "namespace").ok()
                && field(block, "owner").ok() == field(request, "owner").ok()
        }) {
            let JsonValue::Object(fields) = &mut input else {
                unreachable!()
            };
            fields.insert("currentBlock".into(), block.clone());
        }
        let transformed = callback(
            "effectTransform",
            source,
            definition,
            vec![input],
            &candidate,
            executor,
        )?;
        reject_semantic(&transformed, source)?;
        Ok(object([
            ("ok", JsonValue::Bool(true)),
            ("transformed", transformed),
        ]))
    }
}

fn reject_semantic(output: &Value, source: &Value) -> Result<()> {
    if exact(output, &["status", "issues"]) && tag(output, "status", "rejected") {
        let issues = scheduled_assessment::checked_issues(field(output, "issues")?, source)?;
        return Err(object([
            ("code", text("command.contribution-semantic-invalid")),
            ("issues", JsonValue::Array(issues.to_vec())),
        ]));
    }
    Ok(())
}

fn callback(
    operation: &str,
    source: &Value,
    definition: &Value,
    arguments: Vec<Value>,
    candidate: &Value,
    executor: &mut dyn ContributionExecutorV2,
) -> Result<Value> {
    let request = object([
        ("operation", text("contributionCallback")),
        ("scheduleVersion", number(4)),
        (
            "documentId",
            field(field(candidate, "document")?, "id")?.clone(),
        ),
        (
            "documentVersion",
            field(candidate, "documentVersion")?.clone(),
        ),
        ("moduleId", field(source, "moduleId")?.clone()),
        ("contributionId", field(source, "contributionId")?.clone()),
        ("callbackOperation", text(operation)),
        ("definitionId", definition.clone()),
        ("arguments", JsonValue::Array(arguments)),
    ]);
    let reply = scheduled_assessment::invoke(executor, &request, candidate, source)?;
    if !exact(&reply, &["ok", "value"]) {
        return Err(owned_failure(
            source,
            "command.contribution-contract-violation",
        ));
    }
    Ok(field(&reply, "value")?.clone())
}
