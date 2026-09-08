//! Structural sealing permits private typed replay through an invalid musical
//! intermediate. Only final semantic success grants access to Store preparation.
//! Each wrapper owns the candidate, so writes cannot invalidate its proof.
use super::*;
use crate::{
    change_set::ChangeSetV1,
    overlay::CoreBaseReadV1,
    store::LiveScoreStore,
    transaction::{
        FinalExtensionDeltaV1, FinalStateDeltaV1, PreparedFinalStateCommitV1,
        TransactionPrepareFailureV1, collect_frozen_prefix_delta, prepare_validated_final_state,
    },
};
use brilliant_core_types::DocumentVersionV1;
use brilliant_kernel_contracts::KernelStage3MetricsV1;
use brilliant_score_foundation::AssessmentFailureV1;
use std::{cell::RefCell, ops::Deref};

mod boundary;
mod delta;
mod view;

/// Readable strong identities do not prove musical validity. This view has no
/// commit operation; only the semantic wrapper below may prepare adoption.
pub(super) struct StableCandidateView<'a> {
    candidate: RefCell<Candidate<'a>>,
    pub(super) structural_scans: u64,
}

pub(super) struct ValidatedCandidate<'a> {
    view: StableCandidateView<'a>,
}

impl<'a> Deref for ValidatedCandidate<'a> {
    type Target = StableCandidateView<'a>;
    fn deref(&self) -> &Self::Target {
        &self.view
    }
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
            view: StableCandidateView {
                candidate: RefCell::new(self),
                structural_scans: 0,
            },
        })
    }
}

impl StableCandidateView<'_> {
    pub(super) fn replay_extension_delta(
        &self,
    ) -> Result<FinalExtensionDeltaV1, FinalizationFailure> {
        Ok(self.candidate.borrow().extension_delta()?)
    }
    pub(super) fn replay_delta(&self) -> Result<FinalStateDeltaV1, FinalizationFailure> {
        Ok(self.collect_suffix_delta()?)
    }

    pub(super) fn replay_work(&self) -> KernelStage3MetricsV1 {
        let work = self.candidate.borrow().work;
        KernelStage3MetricsV1 {
            full_document_scans: self.structural_scans,
            entities_visited: work.visited_entries,
            order_collections_copied: work.prefix_order_copies,
            ..KernelStage3MetricsV1::default()
        }
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
        self.prepare_commit_with_prior(
            store,
            version,
            suffix_operations,
            FinalStateDeltaV1::default(),
            FinalExtensionDeltaV1::Unchanged,
            KernelStage3MetricsV1::default(),
        )
    }

    /// Prior state precedes this view's frozen overlay, as in suffix-inverse
    /// followed by prefix-inverse. Merge in execution order, preserving deaths.
    pub(super) fn prepare_commit_with_prior(
        self,
        store: &LiveScoreStore,
        version: DocumentVersionV1,
        suffix_operations: u64,
        mut prior_delta: FinalStateDeltaV1,
        mut prior_extensions: FinalExtensionDeltaV1,
        mut prior_work: KernelStage3MetricsV1,
    ) -> Result<(Option<PreparedFinalStateCommitV1>, ChangeSetV1), FinalizationFailure> {
        let (delta, extensions) =
            collect_frozen_prefix_delta(store, &self.candidate.borrow().prefix)?;
        let prefix_operations = self
            .candidate
            .borrow()
            .prefix
            .borrowed_operations()
            .map_err(|_| FinalizationFailure::Command(Failure::InternalError))?
            .1
            .len() as u64;
        prior_delta.merge_suffix(delta)?;
        prior_delta.merge_suffix(self.collect_suffix_delta()?)?;
        prior_extensions.merge_suffix(extensions)?;
        prior_extensions.merge_suffix(self.candidate.borrow().extension_delta()?)?;
        let change_ops = prefix_operations
            .checked_add(suffix_operations)
            .ok_or(TransactionPrepareFailureV1::Capacity)?;
        // This path deliberately performs one full semantic assessment. It is
        // not used by ordinary typed edits. Detailed per-rule accounting remains
        // a gate before activation; these traversal counters report actual work.
        let work = self.candidate.borrow().work;
        prior_work.change_ops = change_ops;
        prior_work.full_document_scans += 1 + self.structural_scans;
        prior_work.full_semantic_validations += 1;
        prior_work.entities_visited += work.visited_entries;
        prior_work.order_collections_copied += work.prefix_order_copies;
        let plan = prepare_validated_final_state(
            store,
            version,
            &self.view,
            prior_delta,
            prior_extensions,
            change_ops != 0,
            prior_work,
        )?;
        let prefix = self
            .view
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
