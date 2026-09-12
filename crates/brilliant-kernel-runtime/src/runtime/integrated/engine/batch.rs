//! Core and module children prepare sequentially against one occurrence journal.
use super::*;
use crate::candidate::CandidateExecution;
use brilliant_kernel_contracts::{
    CapturedCoreCommandV1, CoreCommandIdV1, decode_captured_admission_command,
};

fn child_failure(index: usize, error: Value) -> Value {
    object([
        ("code", text("command.batch-child-rejected")),
        ("failedCommandIndex", number(index as u64)),
        ("failure", error),
    ])
}

impl IntegratedKernelRuntimeV2 {
    pub(super) fn submit_batch(
        &mut self,
        target: brilliant_kernel_contracts::ScoreEntityTargetV1,
        commands: &[CapturedCoreCommandV1],
        executor: &mut dyn ContributionExecutorV2,
    ) -> Result<Value> {
        let brilliant_kernel_contracts::ScoreEntityTargetV1::Document { document_id } = target
        else {
            return Err(failure("command.target-mismatch"));
        };
        if &document_id != self.runtime.document_id() {
            return Err(failure("command.target-not-found"));
        }
        let mut transaction = CandidateExecution::new(
            self.runtime.begin_stage3_transaction().overlay,
            document_id.clone(),
        )
        .map_err(|_| internal())?;
        let environment = module::ModuleEnvironment {
            commands: &self.commands,
            effects: &self.effects,
            id: &document_id,
            version: self.runtime.document_version.get(),
        };
        let mut projections = 0;
        for (index, captured) in commands.iter().enumerate() {
            let raw = captured.as_json();
            let result = (|| {
                // Nested Batch wins even over an otherwise malformed envelope.
                if tag(raw, "commandId", CoreCommandIdV1::TransactionBatch.as_str()) {
                    return Err(failure("command.batch-nested"));
                }
                let is_module = self.commands.iter().any(|definition| {
                    field(definition, "commandId").ok() == field(raw, "commandId").ok()
                });
                if is_module {
                    let start = transaction.begin_module();
                    let prepared =
                        environment.prepare(raw, &mut transaction, &mut projections, executor)?;
                    transaction
                        .end_module(start, index, prepared.source, &prepared.affected)
                        .map_err(|error| value(&error).unwrap_or_else(|_| internal()))
                } else {
                    let command = decode_captured_admission_command(captured)
                        .map_err(|error| value(&error).unwrap_or_else(|_| internal()))?;
                    if command.target().kind() != command.command_id().target_kind() {
                        return Err(failure("command.target-mismatch"));
                    }
                    transaction
                        .dispatch(command, Some(index))
                        .map_err(|error| value(&error).unwrap_or_else(|_| internal()))
                }
            })();
            if let Err(error) = result {
                self.callback_projections = self.callback_projections.saturating_add(projections);
                return Err(child_failure(index, error));
            }
        }
        let document = transaction.integrated_document().map_err(|_| internal())?;
        let prepared = transaction
            .finish(&self.runtime.store, self.runtime.document_version)
            .map_err(|(error, _)| value(&error).unwrap_or_else(|_| internal()))?;
        let document =
            ScoreDocumentV1::from_lossless_value(value(&document)?).map_err(|_| internal())?;
        self.callback_projections = self.callback_projections.saturating_add(projections);
        let version = if prepared.changed {
            self.runtime
                .document_version
                .checked_next()
                .ok_or_else(|| failure("command.version-overflow"))?
        } else {
            self.runtime.document_version
        };
        let pipeline = self.assess(&document, version.get(), executor)?;
        self.reserve_reply(
            &pipeline,
            &prepared.affected,
            &CoreCommandIdV1::TransactionBatch.into(),
        )?;
        let result = self
            .runtime
            .commit_prepared_mutation(
                CoreCommandIdV1::TransactionBatch,
                PreparedMutationV1::Candidate(prepared),
            )
            .map_err(|error| value(&error).unwrap_or_else(|_| internal()))?;
        self.completed(result, pipeline)
    }
}
