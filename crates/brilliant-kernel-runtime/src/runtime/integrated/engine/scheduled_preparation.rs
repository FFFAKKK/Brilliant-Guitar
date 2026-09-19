//! Individual plugin preparation and transformation under Runtime control.
//! Raw candidate views preserve provisional Batch data until final validation.
use super::module::{ModuleEnvironment, ModuleTransaction};
use super::*;
use std::cell::OnceCell;

impl ModuleEnvironment<'_> {
    pub(super) fn scoped_prepare(
        &self,
        envelope: &Value,
        descriptor: &Value,
        projection_count: &mut u64,
        transaction: &mut impl ModuleTransaction,
        target: &StableEntityAddressV1,
        executor: &mut dyn ContributionExecutorV2,
    ) -> Result<Value> {
        let source = field(descriptor, "source")?;
        let definition = field(descriptor, "commandId")?;
        let contract = || owned_failure(source, "command.contribution-contract-violation");
        let mut candidate = ReadSource::new(self, transaction, projection_count)?;
        let decoded = candidate.callback(
            "commandDecode",
            source,
            definition,
            vec![object([
                ("target", field(envelope, "target")?.clone()),
                ("payload", field(envelope, "payload")?.clone()),
            ])],
            transaction,
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
            field(&candidate.context, "document")?,
            self.version,
            source,
            self.assembly,
            self.assessment_reads,
        )?;
        let prepared = candidate.callback(
            "commandPrepare",
            source,
            definition,
            vec![view, field(&decoded, "command")?.clone()],
            transaction,
            executor,
        )?;
        reject_semantic(&prepared, source)?;
        if exact(&prepared, &["status"]) && tag(&prepared, "status", "no-op") {
            return Ok(object([
                ("ok", JsonValue::Bool(true)),
                ("prepared", prepared),
            ]));
        }
        if !(exact(&prepared, &["status", "effectRequests"])
            || exact(&prepared, &["status", "effectRequests", "affected"]))
            || !tag(&prepared, "status", "changed")
        {
            return Err(contract());
        }
        module::validate_legacy_affected(&prepared, &contract)?;
        if array(field(&prepared, "effectRequests")?)
            .map_err(|_| contract())?
            .is_empty()
        {
            return Err(contract());
        }
        Ok(object([
            ("ok", JsonValue::Bool(true)),
            ("prepared", prepared),
        ]))
    }

    pub(super) fn scoped_transform(
        &self,
        request: &Value,
        source: &Value,
        transaction: &mut impl ModuleTransaction,
        projection_count: &mut u64,
        executor: &mut dyn ContributionExecutorV2,
    ) -> Result<Value> {
        let definition = field(request, "effectKind")?;
        let contract = || owned_failure(source, "command.contribution-contract-violation");
        let mut candidate = ReadSource::new(self, transaction, projection_count)?;
        let decoded = candidate.callback(
            "effectDecode",
            source,
            definition,
            vec![field(request, "payload")?.clone()],
            transaction,
            executor,
        )?;
        if !exact(&decoded, &["status", "payload"]) || !tag(&decoded, "status", "decoded") {
            return Err(contract());
        }
        let document = field(&candidate.context, "document")?;
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
        let transformed = candidate.callback(
            "effectTransform",
            source,
            definition,
            vec![input],
            transaction,
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

struct ReadSource<'a> {
    context: Value,
    full: OnceCell<Value>,
    id: &'a StableId,
    projections: &'a mut u64,
}

impl<'a> ReadSource<'a> {
    fn new(
        environment: &ModuleEnvironment<'a>,
        transaction: &mut impl ModuleTransaction,
        projections: &'a mut u64,
    ) -> Result<Self> {
        Ok(Self {
            context: object([
                (
                    "document",
                    transaction.contribution_context(environment.id)?,
                ),
                ("documentVersion", number(environment.version)),
            ]),
            full: OnceCell::new(),
            id: environment.id,
            projections,
        })
    }

    fn callback(
        &mut self,
        operation: &str,
        source: &Value,
        definition: &Value,
        arguments: Vec<Value>,
        transaction: &mut impl ModuleTransaction,
        executor: &mut dyn ContributionExecutorV2,
    ) -> Result<Value> {
        let request = object([
            ("operation", text("contributionCallback")),
            ("scheduleVersion", number(4)),
            (
                "documentId",
                field(field(&self.context, "document")?, "id")?.clone(),
            ),
            (
                "documentVersion",
                field(&self.context, "documentVersion")?.clone(),
            ),
            ("moduleId", field(source, "moduleId")?.clone()),
            ("contributionId", field(source, "contributionId")?.clone()),
            ("callbackOperation", text(operation)),
            ("definitionId", definition.clone()),
            ("arguments", JsonValue::Array(arguments)),
        ]);
        let mut load = || {
            let document = transaction.projection(self.id).map_err(|_| {
                brilliant_extension_protocol::ContributionReadFailureV2::InvalidSource
            })?;
            *self.projections = self.projections.saturating_add(1);
            Ok(document)
        };
        let mut reads = core_reads::CoreReads::lazy(&self.context, &self.full, &mut load);
        let internal = || owned_failure(source, "command.contribution-internal-error");
        let bytes = executor
            .execute_with_core_reads(&encode(&request)?, &mut reads)
            .map_err(|_| internal())?;
        if reads.failed() {
            return Err(internal());
        }
        let reply = decode(&bytes)
            .map_err(|_| owned_failure(source, "command.contribution-contract-violation"))?;
        if !exact(&reply, &["ok", "value"]) || field(&reply, "ok")? != &JsonValue::Bool(true) {
            return Err(owned_failure(
                source,
                "command.contribution-contract-violation",
            ));
        }
        Ok(field(&reply, "value")?.clone())
    }
}
