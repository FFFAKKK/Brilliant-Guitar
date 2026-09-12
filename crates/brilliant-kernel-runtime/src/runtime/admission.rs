//! One session seam for decoded admission commands. Representation changes once,
//! retaining all earlier typed operations and their accounting in the prefix.
use super::*;
use crate::candidate::CandidateExecution;
use brilliant_kernel_contracts::{
    KernelStage3CommandFailureV1, MAX_BATCH_CHILDREN_V1, decode_captured_admission_command,
};

mod eligibility;
#[cfg(test)]
mod tests;

type LeafFailure = KernelStage3CommandFailureLeafV1;
type CommandFailure = KernelStage3CommandFailureV1;

#[expect(
    clippy::large_enum_variant,
    reason = "A transaction changes representation at most once; inline storage keeps ordinary typed edits allocation-free here"
)]
enum Branch<'a> {
    Typed(KernelStage3TransactionV1<'a>),
    Candidate(CandidateExecution<'a>),
}

struct AdmissionTransaction<'a> {
    branch: Option<Branch<'a>>,
    store: &'a LiveScoreStore,
    version: DocumentVersionV1,
    failed_metrics: KernelStage3MetricsV1,
}

impl KernelRuntime {
    pub fn submit_stage4_admission(
        &mut self,
        command: CoreCommandEnvelopeV1<JsString>,
        dispatch_typed: impl Fn(
            &mut KernelStage3TransactionV1<'_>,
            CoreCommandEnvelopeV1,
        ) -> Result<(), LeafFailure>,
    ) -> KernelStage4CommandResultV1 {
        let command_id = command.command_id();
        let prepared = match self.prepare_admission(command, dispatch_typed) {
            Ok(prepared) => prepared,
            Err((failure, metrics)) => {
                return self.rejected_command(KernelStage4FailureV1::Command(failure), metrics);
            }
        };
        let metrics = match &prepared {
            PreparedMutationV1::Typed(value) => value.attempt_metrics,
            PreparedMutationV1::Candidate(value) => value.attempt_metrics,
        };
        self.commit_prepared_mutation(command_id, prepared)
            .unwrap_or_else(|failure| self.rejected_command(failure, metrics))
    }

    #[expect(
        clippy::result_large_err,
        reason = "Preserve fixed-size failure metrics without allocating"
    )]
    pub(super) fn prepare_admission(
        &self,
        command: CoreCommandEnvelopeV1<JsString>,
        dispatch_typed: impl Fn(
            &mut KernelStage3TransactionV1<'_>,
            CoreCommandEnvelopeV1,
        ) -> Result<(), LeafFailure>,
    ) -> Result<PreparedMutationV1, (CommandFailure, KernelStage3MetricsV1)> {
        let command_id = command.command_id();
        if command.target().kind() != command_id.target_kind() {
            return Err((
                LeafFailure::TargetMismatch.into(),
                KernelStage3MetricsV1::default(),
            ));
        }
        {
            let mut transaction = AdmissionTransaction {
                branch: Some(Branch::Typed(self.begin_stage3_transaction())),
                store: &self.store,
                version: self.document_version,
                failed_metrics: KernelStage3MetricsV1::default(),
            };
            match transaction.dispatch(command, &dispatch_typed) {
                Ok(()) => transaction.finish(),
                Err(failure) => Err((failure, transaction.attempt_metrics())),
            }
        }
    }
}

impl AdmissionTransaction<'_> {
    fn attempt_metrics(&self) -> KernelStage3MetricsV1 {
        match &self.branch {
            Some(Branch::Typed(value)) => value.attempt_metrics(),
            Some(Branch::Candidate(value)) => value.attempt_metrics(),
            None => self.failed_metrics,
        }
    }

    fn dispatch(
        &mut self,
        command: CoreCommandEnvelopeV1<JsString>,
        dispatch_typed: &impl Fn(
            &mut KernelStage3TransactionV1<'_>,
            CoreCommandEnvelopeV1,
        ) -> Result<(), LeafFailure>,
    ) -> Result<(), CommandFailure> {
        if let CoreCommandEnvelopeV1::TransactionBatch { target, commands } = command {
            if commands.is_empty() {
                return Err(LeafFailure::BatchEmpty.into());
            }
            if commands.len() > MAX_BATCH_CHILDREN_V1 {
                return Err(LeafFailure::ResourceLimitExceeded {
                    limit_kind: KernelStage3ResourceLimitKindV1::BatchChildren,
                    limit: MAX_BATCH_CHILDREN_V1 as u64,
                    actual: commands.len() as u64,
                }
                .into());
            }
            let ScoreEntityTargetV1::Document { document_id } = target else {
                return Err(LeafFailure::TargetMismatch.into());
            };
            if document_id != self.store.header.id {
                return Err(LeafFailure::TargetNotFound.into());
            }
            for (index, captured) in commands.iter().enumerate() {
                let result = decode_captured_admission_command(captured).and_then(|child| {
                    self.dispatch_leaf(child, Some(index), dispatch_typed)
                        .map_err(Into::into)
                });
                if let Err(failure) = result {
                    let leaf = match failure {
                        CommandFailure::Leaf(leaf) => leaf,
                        CommandFailure::BatchChildRejected { .. } => LeafFailure::InternalError,
                    };
                    return Err(CommandFailure::BatchChildRejected {
                        failed_command_index: index as u64,
                        failure: leaf,
                    });
                }
            }
            Ok(())
        } else {
            self.dispatch_leaf(command, None, dispatch_typed)
                .map_err(Into::into)
        }
    }

    fn dispatch_leaf(
        &mut self,
        command: CoreCommandEnvelopeV1<JsString>,
        batch_child: Option<usize>,
        dispatch_typed: &impl Fn(
            &mut KernelStage3TransactionV1<'_>,
            CoreCommandEnvelopeV1,
        ) -> Result<(), LeafFailure>,
    ) -> Result<(), LeafFailure> {
        if command.target().kind() != command.command_id().target_kind() {
            return Err(LeafFailure::TargetMismatch);
        }
        if let Some(Branch::Candidate(value)) = &mut self.branch {
            return value.dispatch(command, batch_child);
        }
        let raw = match command.try_into_stable() {
            Ok(stable) => {
                let Some(Branch::Typed(value)) = &mut self.branch else {
                    return Err(LeafFailure::InternalError);
                };
                if !eligibility::needs_candidate(&stable, &mut value.overlay)? {
                    if batch_child.is_none() {
                        return dispatch_typed(value, stable);
                    }
                    let operation_count = value.overlay.operation_count();
                    let segment = value.overlay.begin_segment();
                    value
                        .overlay
                        .begin_deferred_segment()
                        .map_err(map_overlay_failure)?;
                    dispatch_typed(value, stable)?;
                    value
                        .overlay
                        .end_deferred_segment()
                        .map_err(map_overlay_failure)?;
                    if value.overlay.operation_count() != operation_count {
                        value
                            .overlay
                            .end_segment(segment)
                            .map_err(map_overlay_failure)?;
                    }
                    return Ok(());
                }
                stable.into_admission()
            }
            Err(raw) => raw,
        };
        self.failed_metrics = self.attempt_metrics();
        let Some(Branch::Typed(value)) = self.branch.take() else {
            return Err(LeafFailure::InternalError);
        };
        let execution = CandidateExecution::new(value.overlay, self.store.header.id.clone())?;
        self.branch = Some(Branch::Candidate(execution));
        let Some(Branch::Candidate(value)) = &mut self.branch else {
            return Err(LeafFailure::InternalError);
        };
        value.dispatch(raw, batch_child)
    }

    #[expect(
        clippy::result_large_err,
        reason = "Capacity failures retain their fixed-size metrics snapshot without another allocation"
    )]
    fn finish(self) -> Result<PreparedMutationV1, (CommandFailure, KernelStage3MetricsV1)> {
        let metrics = self.attempt_metrics();
        match self.branch {
            Some(Branch::Typed(value)) => value
                .finish()
                .map(PreparedMutationV1::Typed)
                .map_err(|failure| (failure.into(), metrics)),
            Some(Branch::Candidate(value)) => value
                .finish(self.store, self.version)
                .map(PreparedMutationV1::Candidate)
                .map_err(|(failure, metrics)| (failure.into(), metrics)),
            None => Err((LeafFailure::InternalError.into(), metrics)),
        }
    }
}
