//! A semantic pass is the only entrance to the stable final read view. The
//! candidate is then owned here, so writes cannot invalidate that proof.
//! Preparation produces an owned plan before its frozen Store borrow ends.
use super::*;
use crate::{
    change_set::ChangeSetV1,
    overlay::CoreBaseReadV1,
    store::LiveScoreStore,
    transaction::{
        FinalStateDeltaV1, PreparedFinalStateCommitV1, TransactionPrepareFailureV1,
        collect_frozen_prefix_delta, prepare_validated_final_state,
    },
};
use brilliant_core_types::DocumentVersionV1;
use brilliant_kernel_contracts::KernelStage3MetricsV1;
use brilliant_score_foundation::AssessmentFailureV1;
use std::cell::RefCell;

mod delta;
mod view;

pub(super) struct ValidatedCandidate<'a> {
    candidate: RefCell<Candidate<'a>>,
}

#[derive(Debug)]
pub(super) enum FinalizationFailure {
    Assessment(AssessmentFailureV1),
    Command(Failure),
    Preparation(TransactionPrepareFailureV1),
}

impl From<TransactionPrepareFailureV1> for FinalizationFailure {
    fn from(value: TransactionPrepareFailureV1) -> Self {
        Self::Preparation(value)
    }
}

impl<'a> Candidate<'a> {
    pub(super) fn validate_final(mut self) -> Result<ValidatedCandidate<'a>, FinalizationFailure> {
        let report = self
            .assess_final_semantics()
            .map_err(FinalizationFailure::Assessment)?;
        if !report.ok {
            return Err(FinalizationFailure::Command(Failure::SemanticInvalid {
                diagnostics: report.diagnostics,
            }));
        }
        Ok(ValidatedCandidate {
            candidate: RefCell::new(self),
        })
    }
}

impl ValidatedCandidate<'_> {
    // Identity sealing reads semantic state and reserves the manifest; it does
    // not change values, references, visibility or order after assessment.
    pub(super) fn seal_identities(
        &mut self,
        recorder: super::identity::IdentityRecorder,
    ) -> Result<super::identity::IdentityManifest, Failure> {
        recorder.finish(&mut self.candidate.borrow_mut())
    }

    /// `suffix_operations` is the retained journal's operation count, not the
    /// size of its net physical delta. Prefix operations stay in their arena.
    pub(super) fn prepare_commit(
        self,
        store: &LiveScoreStore,
        version: DocumentVersionV1,
        suffix_operations: u64,
    ) -> Result<(Option<PreparedFinalStateCommitV1>, ChangeSetV1), FinalizationFailure> {
        let (mut delta, extensions) =
            collect_frozen_prefix_delta(store, &self.candidate.borrow().prefix)?;
        let prefix_operations = self
            .candidate
            .borrow()
            .prefix
            .borrowed_operations()
            .map_err(|_| FinalizationFailure::Command(Failure::InternalError))?
            .1
            .len() as u64;
        delta.merge_suffix(self.collect_suffix_delta()?)?;
        let change_ops = prefix_operations
            .checked_add(suffix_operations)
            .ok_or(TransactionPrepareFailureV1::Capacity)?;
        // This path deliberately performs one full semantic assessment. It is
        // not used by ordinary typed edits. Detailed per-rule accounting remains
        // a gate before activation; these traversal counters report actual work.
        let work = self.candidate.borrow().work;
        let metrics = KernelStage3MetricsV1 {
            change_ops,
            full_document_scans: 1,
            full_semantic_validations: 1,
            entities_visited: work.visited_entries,
            order_collections_copied: work.prefix_order_copies,
            ..KernelStage3MetricsV1::default()
        };
        let plan = prepare_validated_final_state(
            store,
            version,
            &self,
            delta,
            extensions,
            change_ops != 0,
            metrics,
        )?;
        let prefix = self
            .candidate
            .into_inner()
            .prefix
            .finish()
            .map_err(|_| FinalizationFailure::Command(Failure::InternalError))?;
        Ok((plan, prefix))
    }
}

#[cfg(test)]
mod tests;
