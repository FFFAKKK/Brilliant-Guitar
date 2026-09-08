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

struct PriorState {
    delta: FinalStateDeltaV1,
    extensions: FinalExtensionDeltaV1,
    work: KernelStage3MetricsV1,
}

impl<'a> Deref for ValidatedCandidate<'a> {
    type Target = StableCandidateView<'a>;
    fn deref(&self) -> &Self::Target {
        &self.view
    }
}

#[derive(Debug)]
pub(crate) enum FinalizationFailure {
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
    pub(super) fn validate_final(self) -> Result<ValidatedCandidate<'a>, FinalizationFailure> {
        self.validate_final_with_metrics()
            .map_err(|(failure, _)| failure)
    }

    #[expect(
        clippy::result_large_err,
        reason = "failure metrics returned without allocation, including capacity failures"
    )]
    pub(super) fn validate_final_with_metrics(
        mut self,
    ) -> Result<ValidatedCandidate<'a>, (FinalizationFailure, KernelStage3MetricsV1)> {
        let report = match self.assess_final_semantics() {
            Ok(report) => report,
            Err(failure) => {
                return Err((
                    FinalizationFailure::Assessment(failure),
                    self.attempt_metrics(),
                ));
            }
        };
        if !report.ok {
            return Err((
                FinalizationFailure::Command(Failure::SemanticInvalid {
                    diagnostics: report.diagnostics,
                }),
                self.attempt_metrics(),
            ));
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
        let mut work = self.candidate.borrow().attempt_metrics();
        work.full_document_scans = work
            .full_document_scans
            .saturating_add(self.structural_scans);
        work
    }
}

impl ValidatedCandidate<'_> {
    #[expect(
        clippy::result_large_err,
        reason = "failure metrics returned without allocation, including capacity failures"
    )]
    pub(super) fn prepare_commit_with_metrics(
        self,
        store: &LiveScoreStore,
        version: DocumentVersionV1,
        suffix_operations: u64,
    ) -> Result<
        (Option<PreparedFinalStateCommitV1>, ChangeSetV1),
        (FinalizationFailure, KernelStage3MetricsV1),
    > {
        let observed = std::cell::Cell::new(self.replay_work());
        self.prepare_commit_with_prior_observed(
            store,
            version,
            suffix_operations,
            PriorState {
                delta: FinalStateDeltaV1::default(),
                extensions: FinalExtensionDeltaV1::Unchanged,
                work: KernelStage3MetricsV1::default(),
            },
            Some(&observed),
        )
        .map_err(|failure| (failure, observed.get()))
    }
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
        prior_delta: FinalStateDeltaV1,
        prior_extensions: FinalExtensionDeltaV1,
        prior_work: KernelStage3MetricsV1,
    ) -> Result<(Option<PreparedFinalStateCommitV1>, ChangeSetV1), FinalizationFailure> {
        self.prepare_commit_with_prior_observed(
            store,
            version,
            suffix_operations,
            PriorState {
                delta: prior_delta,
                extensions: prior_extensions,
                work: prior_work,
            },
            None,
        )
    }

    fn prepare_commit_with_prior_observed(
        self,
        store: &LiveScoreStore,
        version: DocumentVersionV1,
        suffix_operations: u64,
        prior: PriorState,
        observer: Option<&std::cell::Cell<KernelStage3MetricsV1>>,
    ) -> Result<(Option<PreparedFinalStateCommitV1>, ChangeSetV1), FinalizationFailure> {
        let PriorState {
            delta: mut prior_delta,
            extensions: mut prior_extensions,
            work: mut prior_work,
        } = prior;
        let metrics_guard = PrepareMetricsGuard {
            view: &self.view,
            observer,
        };
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
        let work = self.replay_work();
        prior_work.change_ops = change_ops;
        prior_work.full_document_scans += work.full_document_scans;
        prior_work.full_semantic_validations += work.full_semantic_validations;
        prior_work.semantic_rules_evaluated += work.semantic_rules_evaluated;
        prior_work.semantic_dependency_reads += work.semantic_dependency_reads;
        prior_work.entities_visited += work.entities_visited;
        prior_work.entity_index_lookups += work.entity_index_lookups;
        prior_work.owner_index_lookups += work.owner_index_lookups;
        prior_work.overlay_records += work.overlay_records;
        prior_work.order_collections_copied += work.order_collections_copied;
        let mut plan = prepare_validated_final_state(
            store,
            version,
            &self.view,
            prior_delta,
            prior_extensions,
            change_ops != 0,
            prior_work,
        )?;
        let after = self.replay_work();
        if let Some(plan) = &mut plan {
            plan.add_read_metrics(KernelStage3MetricsV1 {
                entities_visited: after.entities_visited.saturating_sub(work.entities_visited),
                entity_index_lookups: after
                    .entity_index_lookups
                    .saturating_sub(work.entity_index_lookups),
                owner_index_lookups: after
                    .owner_index_lookups
                    .saturating_sub(work.owner_index_lookups),
                order_collections_copied: after
                    .order_collections_copied
                    .saturating_sub(work.order_collections_copied),
                ..KernelStage3MetricsV1::default()
            });
        }
        drop(metrics_guard);
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

struct PrepareMetricsGuard<'view, 'store> {
    view: &'view StableCandidateView<'store>,
    observer: Option<&'view std::cell::Cell<KernelStage3MetricsV1>>,
}

impl Drop for PrepareMetricsGuard<'_, '_> {
    fn drop(&mut self) {
        if let Some(observer) = self.observer {
            observer.set(self.view.replay_work());
        }
    }
}

#[cfg(test)]
mod tests;
