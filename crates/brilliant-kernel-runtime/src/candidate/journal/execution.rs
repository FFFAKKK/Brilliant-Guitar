//! Owned results cross the runtime publication boundary; the occurrence recorder
//! and borrowed prefix remain private to command preparation.
use super::*;
use crate::change_set::accounting::{ChangeSetAccountingV1, RawAffectedKindV1, RawAffectedV1};
use crate::{
    candidate::adoption::FinalizationFailure, store::LiveScoreStore,
    transaction::PreparedFinalStateCommitV1,
};
use brilliant_core_types::DocumentVersionV1;
use brilliant_kernel_contracts::ScoreEntityTargetV1 as Target;
use brilliant_kernel_contracts::{AffectedEntityAddressV1, KernelStage3MetricsV1};
mod module;
#[cfg(test)]
mod retained_memory_tests;
#[cfg(test)]
mod work_budget_tests;
pub(crate) use module::ModuleSegmentSource;

pub(crate) const MAX_CANDIDATE_RETAINED_BYTES_V1: u64 = 512 * 1024 * 1024;
const RETAINED_DYNAMIC_PAYLOAD_MULTIPLIER_V1: u64 = 2;

pub(crate) struct CandidateExecution<'a> {
    recorder: Recorder<'a>,
    accounting: ChangeSetAccountingV1,
    affected: Vec<AffectedEntityAddressV1>,
    changed: bool,
    operation_count: u64,
    segments: Vec<CommandSegment>,
    #[cfg(test)]
    retained_limit: u64,
}

struct CommandSegment {
    child_index: usize,
    command_id: brilliant_kernel_contracts::KernelCommandIdentityV1,
    module_source: Option<ModuleSegmentSource>,
    step_start: usize,
    step_end: usize,
    affected_start: usize,
    affected_end: usize,
    effect_count: u64,
}

impl<'a> CandidateExecution<'a> {
    pub(crate) fn new(
        prefix: TransactionOverlayV1<'a>,
        document_id: StableId,
    ) -> Result<Self, Failure> {
        Self::new_with_budget(prefix, document_id, Default::default())
    }

    pub(crate) fn new_with_budget(
        mut prefix: TransactionOverlayV1<'a>,
        document_id: StableId,
        work_budget: crate::work_budget::TransactionWorkBudgetV1,
    ) -> Result<Self, Failure> {
        let mut affected = Vec::new();
        affected
            .try_reserve(prefix.affected_order().len())
            .map_err(|_| Failure::InternalError)?;
        affected.extend(
            prefix
                .affected_order()
                .iter()
                .cloned()
                .map(crate::runtime::score_target_from_stable_address),
        );
        let operation_count = prefix.operation_count() as u64;
        let accounting = prefix
            .take_accounting()
            .map_err(|_| Failure::InternalError)?;
        let execution = Self {
            recorder: Recorder::new(Candidate::new_with_budget(prefix, document_id, work_budget)),
            accounting,
            affected,
            changed: operation_count != 0,
            operation_count,
            segments: Vec::new(),
            #[cfg(test)]
            retained_limit: MAX_CANDIDATE_RETAINED_BYTES_V1,
        };
        execution.ensure_work_budget()?;
        execution.ensure_retained_bytes_within_limit()?;
        Ok(execution)
    }

    fn ensure_work_budget(&self) -> Result<(), Failure> {
        self.recorder
            .candidate
            .work_budget
            .observe_metrics(&self.attempt_metrics())?;
        self.recorder.candidate.work_budget.ensure_active()
    }

    #[cfg(test)]
    pub(crate) fn set_work_limit_for_test(&mut self, limit: u64) {
        self.recorder.candidate.work_budget.set_limit(limit);
    }

    #[cfg(test)]
    pub(crate) fn work_units_for_test(&self) -> u64 {
        self.recorder.candidate.work_budget.used()
    }

    fn conclude_operation<T>(&mut self, result: Result<T, Failure>) -> Result<T, Failure> {
        let result = match self.ensure_work_budget() {
            Ok(()) => result,
            Err(failure) => Err(failure),
        };
        if result.is_err() {
            self.recorder.candidate.reservation.abort();
        }
        result
    }

    fn retained_bytes_upper_bound(&self) -> u64 {
        let mut bound = RetainedBytesUpperBound::default();
        bound.add_value::<Self>();
        bound.add_bytes(self.recorder.retained_bytes_upper_bound());
        bound.add_bytes(self.accounting.retained_bytes_upper_bound());
        bound.add_vec(&self.affected);
        for address in &self.affected {
            bound.add_js_string(raw_affected(address).id);
        }
        bound.add_vec(&self.segments);
        for segment in &self.segments {
            if let Some(source) = &segment.module_source {
                bound.add_js_string(source.command_id.as_js_string());
                bound.add_js_string(source.module_id.as_js_string());
                bound.add_js_string(source.contribution_id.as_js_string());
            }
        }
        bound.add_bytes(
            self.accounting
                .logical_bytes()
                .saturating_mul(RETAINED_DYNAMIC_PAYLOAD_MULTIPLIER_V1),
        );
        bound.finish()
    }

    fn ensure_retained_bytes_within_limit(&self) -> Result<(), Failure> {
        let actual = self.retained_bytes_upper_bound();
        let limit = self.retained_limit();
        if actual > limit {
            Err(Failure::ResourceLimitExceeded {
                limit_kind:
                    brilliant_kernel_contracts::KernelStage3ResourceLimitKindV1::CandidateRetainedBytes,
                limit,
                actual,
            })
        } else {
            Ok(())
        }
    }

    #[cfg(not(test))]
    fn retained_limit(&self) -> u64 {
        MAX_CANDIDATE_RETAINED_BYTES_V1
    }

    #[cfg(test)]
    fn retained_limit(&self) -> u64 {
        self.retained_limit
    }

    pub(crate) fn attempt_metrics(&self) -> KernelStage3MetricsV1 {
        let mut metrics = self.recorder.candidate.attempt_metrics();
        metrics.change_ops = self.operation_count;
        metrics.changeset_logical_bytes = self.accounting.logical_bytes();
        metrics.affected_addresses = self.accounting.affected_count() as u64;
        metrics
    }

    pub(crate) fn dispatch(
        &mut self,
        command: brilliant_kernel_contracts::CoreCommandEnvelopeV1<JsString>,
        batch_child: Option<usize>,
    ) -> Result<(), Failure> {
        let result = self.dispatch_inner(command, batch_child);
        self.conclude_operation(result)
    }

    fn dispatch_inner(
        &mut self,
        command: brilliant_kernel_contracts::CoreCommandEnvelopeV1<JsString>,
        batch_child: Option<usize>,
    ) -> Result<(), Failure> {
        let first = self.recorder.steps.len();
        let affected_start = self.affected.len();
        let context = accounting::ChargeContext::for_command(&command);
        self.recorder
            .set_effect_budget(self.accounting.prepared_effect_count());
        let facts = self
            .recorder
            .dispatch_leaf(command)
            .map_err(command_failure)?;
        if !facts.changed {
            return Ok(());
        }
        let map = crate::runtime::map_change_set_build_failure;
        self.accounting
            .add_prepared_effects(facts.effect_count)
            .map_err(map)?;
        let mut raw = Vec::new();
        self.recorder.candidate.reservation.vec(
            Site::JournalOperations,
            &mut raw,
            facts.affected.len(),
        )?;
        raw.extend(facts.affected.iter().map(raw_affected));
        self.accounting.check_affected_segment(&raw).map_err(map)?;
        let operations = self
            .recorder
            .charge_segment_with_affected(
                first,
                &context,
                &facts,
                &mut self.accounting,
                &mut self.affected,
            )
            .map_err(map)?;
        self.operation_count = self
            .operation_count
            .checked_add(operations)
            .ok_or(Failure::InternalError)?;
        if let Some(child_index) = batch_child {
            self.recorder.candidate.reservation.vec(
                Site::JournalOperations,
                &mut self.segments,
                1,
            )?;
            self.accounting.charge_segment().map_err(map)?;
            self.segments.push(CommandSegment {
                child_index,
                command_id: facts.command_id.into(),
                module_source: None,
                step_start: first,
                step_end: self.recorder.steps.len(),
                affected_start,
                affected_end: self.affected.len(),
                effect_count: facts.effect_count,
            });
        }
        self.changed = true;
        self.ensure_retained_bytes_within_limit()
    }

    #[expect(
        clippy::result_large_err,
        reason = "Capacity failures retain their fixed-size metrics snapshot without another allocation"
    )]
    pub(crate) fn finish(
        self,
        store: &LiveScoreStore,
        version: DocumentVersionV1,
    ) -> Result<PreparedCandidate, (Failure, KernelStage3MetricsV1)> {
        let metrics = self.attempt_metrics();
        if let Err(failure) = self.ensure_work_budget() {
            return Err((failure, metrics));
        }
        if let Err(failure) = self.ensure_retained_bytes_within_limit() {
            return Err((failure, metrics));
        }
        let (mut plan, combined) = self
            .recorder
            .prepare_combined_commit_with_metrics(store, version)
            .map_err(|(failure, mut work)| {
                work.change_ops = metrics.change_ops;
                work.changeset_logical_bytes = metrics.changeset_logical_bytes;
                work.affected_addresses = metrics.affected_addresses;
                (finalization_failure(failure), work)
            })?;
        if let Some(plan) = &mut plan {
            plan.set_retained_metrics(metrics);
        }
        // Publication can still fail after final assessment and preparation.
        // Preserve that completed work independently of the history's ledger.
        let attempt_metrics = plan
            .as_ref()
            .map_or(metrics, PreparedFinalStateCommitV1::metrics);
        Ok(PreparedCandidate {
            plan,
            history: CandidateHistory {
                combined,
                retained_metrics: metrics,
                segments: self.segments,
            },
            changed: self.changed,
            affected: self.affected,
            logical_bytes: self.accounting.logical_bytes(),
            attempt_metrics,
        })
    }
}

fn raw_affected(value: &AffectedEntityAddressV1) -> RawAffectedV1<'_> {
    let (kind, id) = match value {
        Target::Document { document_id } => (RawAffectedKindV1::Document, document_id),
        Target::Measure { measure_id } => (RawAffectedKindV1::Measure, measure_id),
        Target::Part { part_id } => (RawAffectedKindV1::Part, part_id),
        Target::Staff { staff_id } => (RawAffectedKindV1::Staff, staff_id),
        Target::Voice { voice_id } => (RawAffectedKindV1::Voice, voice_id),
        Target::Event { event_id } => (RawAffectedKindV1::Event, event_id),
        Target::Note { note_id } => (RawAffectedKindV1::Note, note_id),
    };
    RawAffectedV1 {
        kind,
        id: id.as_js_string(),
    }
}

fn command_failure(value: dispatch::AdmissionCommandFailure) -> Failure {
    match value {
        dispatch::AdmissionCommandFailure::Leaf(value) => value,
        dispatch::AdmissionCommandFailure::MeasureDuplicate {
            insertion_index,
            id,
        } => {
            use brilliant_core_types::{StablePathSegmentV1 as Segment, StablePathV1};
            let Ok(path) = StablePathV1::new(vec![
                Segment::Field("measureDefinitions".into()),
                Segment::Index(insertion_index as u64),
                Segment::Field("id".into()),
            ]) else {
                return Failure::InternalError;
            };
            Failure::SemanticInvalid {
                diagnostics: vec![brilliant_score_foundation::CoreDiagnosticV1::new(
                    brilliant_score_foundation::CoreDiagnosticCodeV1::IdDuplicate,
                    path,
                    Some(("id", &id)),
                )],
            }
        }
        dispatch::AdmissionCommandFailure::RangeTransform { note_id, reason } => {
            Failure::RangeTransformInvalid {
                address: brilliant_kernel_contracts::NoteAddressV1::Note {
                    note_id: note_id.into(),
                },
                reason,
            }
        }
    }
}

pub(super) fn finalization_failure(value: FinalizationFailure) -> Failure {
    match value {
        FinalizationFailure::Command(value) => value,
        FinalizationFailure::Assessment(
            brilliant_score_foundation::AssessmentFailureV1::DiagnosticLimit { limit, actual },
        ) => Failure::ResourceLimitExceeded {
            limit_kind: brilliant_kernel_contracts::KernelStage3ResourceLimitKindV1::Diagnostics,
            limit: limit as u64,
            actual: actual as u64,
        },
        FinalizationFailure::Preparation(value) => crate::runtime::map_prepare_failure(value),
        FinalizationFailure::Assessment(_) => Failure::InternalError,
    }
}

pub(crate) struct PreparedCandidate {
    pub(crate) plan: Option<PreparedFinalStateCommitV1>,
    pub(crate) history: CandidateHistory,
    pub(crate) changed: bool,
    pub(crate) affected: Vec<AffectedEntityAddressV1>,
    pub(crate) logical_bytes: u64,
    pub(crate) attempt_metrics: KernelStage3MetricsV1,
}

pub(crate) struct CandidateHistory {
    pub(super) combined: combined::CombinedHistory,
    pub(super) retained_metrics: KernelStage3MetricsV1,
    segments: Vec<CommandSegment>,
}

impl std::fmt::Debug for CandidateHistory {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("CandidateHistory")
            .field("retained_metrics", &self.retained_metrics)
            .field("segments", &self.segments.len())
            .finish_non_exhaustive()
    }
}

impl CandidateHistory {
    /// Keep allocation/index preparation failures deferred until after the host
    /// assesses the preview, matching the ordinary preview-then-commit ordering.
    pub(crate) fn prepare_integrated_replay(
        &self,
        store: &LiveScoreStore,
        version: DocumentVersionV1,
        redo: bool,
    ) -> Result<Option<PreparedHistoryPreview>, Failure> {
        let Some(mut preview) = self
            .combined
            .prepare_integrated_replay(
                store,
                version,
                if redo {
                    Direction::Forward
                } else {
                    Direction::Inverse
                },
            )
            .map_err(finalization_failure)?
        else {
            return Ok(None);
        };
        preview.plan = self
            .validate_segments()
            .map_err(finalization_failure)
            .and(preview.plan);
        if let Ok(Some(plan)) = &mut preview.plan {
            plan.set_retained_metrics(self.retained_metrics);
        }
        Ok(Some(preview))
    }

    pub(crate) fn integrated_projection(
        &self,
        store: &LiveScoreStore,
        redo: bool,
    ) -> Result<brilliant_score_foundation::ScoreDocumentV1, Failure> {
        self.combined
            .project_replay(
                store,
                if redo {
                    Direction::Forward
                } else {
                    Direction::Inverse
                },
            )
            .map_err(finalization_failure)
    }

    pub(crate) fn prepare_replay(
        &self,
        store: &LiveScoreStore,
        version: DocumentVersionV1,
        redo: bool,
    ) -> Result<Option<PreparedFinalStateCommitV1>, FinalizationFailure> {
        self.validate_segments()?;
        let mut plan = self.combined.prepare_replay(
            store,
            version,
            if redo {
                Direction::Forward
            } else {
                Direction::Inverse
            },
        )?;
        if let Some(plan) = &mut plan {
            plan.set_retained_metrics(self.retained_metrics);
        }
        Ok(plan)
    }

    fn validate_segments(&self) -> Result<(), FinalizationFailure> {
        let mut previous_index = None;
        let mut previous_step = 0;
        let mut previous_affected = None;
        for segment in &self.segments {
            if previous_index.is_some_and(|index| index >= segment.child_index)
                || segment.command_id
                    == brilliant_kernel_contracts::CoreCommandIdV1::TransactionBatch
                || !match (&segment.command_id, &segment.module_source) {
                    (brilliant_kernel_contracts::KernelCommandIdentityV1::Core(_), None) => true,
                    (
                        brilliant_kernel_contracts::KernelCommandIdentityV1::Module(command_id),
                        Some(source),
                    ) => command_id == &source.command_id,
                    _ => false,
                }
                || segment.step_start != previous_step
                || segment.step_end <= segment.step_start
                || segment.effect_count == 0
                || segment.affected_end < segment.affected_start
                || segment.affected_end as u64 > self.retained_metrics.affected_addresses
                || previous_affected.is_some_and(|end| end != segment.affected_start)
            {
                return Err(FinalizationFailure::Command(Failure::InternalError));
            }
            previous_index = Some(segment.child_index);
            previous_step = segment.step_end;
            previous_affected = Some(segment.affected_end);
        }
        Ok(())
    }
}

pub(crate) struct PreparedHistoryPreview {
    pub(crate) document: brilliant_score_foundation::ScoreDocumentV1,
    pub(crate) plan: Result<Option<PreparedFinalStateCommitV1>, Failure>,
}
