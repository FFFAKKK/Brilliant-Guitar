//! Core commands reuse the original admission interpreter and commit boundary.
//! SDK assessment observes a detached final view before the sole Store adoption.
use super::*;
use brilliant_kernel_contracts::decode_admission_command_value;

impl IntegratedKernelRuntimeV2 {
    pub(super) fn submit_core(
        &mut self,
        envelope: &Value,
        executor: &mut dyn ContributionExecutorV2,
        dispatch: CoreDispatch,
    ) -> Result<Value> {
        // The decoder accepts the top-level Batch position; it uses the
        // ordinary child decoder internally, retaining nested-Batch rejection.
        let command = decode_admission_command_value(envelope)
            .map_err(|failure| value(&failure).unwrap_or_else(|_| internal()))?;
        if let CoreCommandEnvelopeV1::TransactionBatch { target, commands } = &command
            && commands.iter().any(|child| {
                self.commands.iter().any(|definition| {
                    field(definition, "commandId").ok() == field(child.as_json(), "commandId").ok()
                })
            })
        {
            return self.submit_batch(target.clone(), commands, executor);
        }
        let command_id = command.command_id();
        let prepared = self
            .runtime
            .prepare_admission(command, dispatch)
            .map_err(|(failure, _)| value(&failure).unwrap_or_else(|_| internal()))?;
        let id = self.runtime.document_id().clone();
        let (document, changed, affected) = match &prepared {
            PreparedMutationV1::Typed(prepared) => {
                let changes = &prepared.change_set;
                let overlay = crate::transaction::replay_overlay_on_base(
                    &self.runtime.store,
                    &changes.arena,
                    &changes.forward,
                )
                .map_err(|_| internal())?;
                let document = KernelStage3TransactionV1 { overlay }
                    .integrated_projection(&id)
                    .map_err(|failure| value(&failure).unwrap_or_else(|_| internal()))?;
                (
                    document,
                    !changes.forward.is_empty(),
                    targets_from_change_set(changes).map_err(|_| internal())?,
                )
            }
            PreparedMutationV1::Candidate(prepared) => (
                prepared
                    .history
                    .integrated_projection(&self.runtime.store, true)
                    .map_err(|failure| value(&failure).unwrap_or_else(|_| internal()))?,
                prepared.changed,
                prepared.affected.clone(),
            ),
        };
        // Core Batch retains operation-fact semantics even when its final
        // document equals the initial one; do not use module net-zero detection.
        let version = if changed {
            self.runtime
                .document_version
                .checked_next()
                .ok_or_else(|| failure("command.version-overflow"))?
        } else {
            self.runtime.document_version
        };
        let pipeline = self.assess(&document, version.get(), executor)?;
        self.reserve_reply(&pipeline, &affected, &command_id.into())?;
        let result = self
            .runtime
            .commit_prepared_mutation(command_id, prepared)
            .map_err(|failure| value(&failure).unwrap_or_else(|_| internal()))?;
        self.completed(result, pipeline)
    }
}
