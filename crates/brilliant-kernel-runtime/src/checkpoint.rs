use std::{cell::RefCell, sync::Arc};

use brilliant_core_types::DocumentVersionV1;
use brilliant_kernel_contracts::{
    CHECKPOINT_CHANGESET_BYTES_V1, CHECKPOINT_ENTRY_INTERVAL_V1, CHECKPOINT_RETAINED_COUNT_V1,
    KernelStage4MetricsV1,
};
use brilliant_score_foundation::canonical_score_bytes;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum CheckpointPrepareFailureV1 {
    CounterOverflow,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) struct PreparedCheckpointSubmitV1 {
    entries: u64,
    logical_bytes: u64,
    due: bool,
}

#[derive(Clone, Debug)]
pub(crate) struct OperationalCheckpointV1 {
    pub(crate) document_version: DocumentVersionV1,
    pub(crate) history_cursor: usize,
    pub(crate) content_identity: u64,
    pub(crate) document: Arc<brilliant_score_foundation::ScoreDocumentV1>,
}

#[derive(Debug, Default)]
struct CheckpointScheduleV1 {
    committed_entries_since_checkpoint: u64,
    changeset_bytes_since_checkpoint: u64,
    due: bool,
    latest: Option<OperationalCheckpointV1>,
    #[cfg(test)]
    fail_next_materialization: bool,
}

#[derive(Debug, Default)]
pub(crate) struct CheckpointStateV1 {
    schedule: RefCell<CheckpointScheduleV1>,
}

impl CheckpointStateV1 {
    pub(crate) fn new() -> Self {
        debug_assert_eq!(CHECKPOINT_RETAINED_COUNT_V1, 1);
        Self::default()
    }

    pub(crate) fn prepare_submit(
        &self,
        logical_bytes: u64,
    ) -> Result<PreparedCheckpointSubmitV1, CheckpointPrepareFailureV1> {
        let schedule = self.schedule.borrow();
        let entries = schedule
            .committed_entries_since_checkpoint
            .checked_add(1)
            .ok_or(CheckpointPrepareFailureV1::CounterOverflow)?;
        let logical_bytes = schedule
            .changeset_bytes_since_checkpoint
            .checked_add(logical_bytes)
            .ok_or(CheckpointPrepareFailureV1::CounterOverflow)?;
        Ok(PreparedCheckpointSubmitV1 {
            entries,
            logical_bytes,
            due: schedule.due
                || entries >= CHECKPOINT_ENTRY_INTERVAL_V1
                || logical_bytes >= CHECKPOINT_CHANGESET_BYTES_V1,
        })
    }

    pub(crate) fn commit_submit(&self, prepared: PreparedCheckpointSubmitV1) {
        let mut schedule = self.schedule.borrow_mut();
        schedule.committed_entries_since_checkpoint = prepared.entries;
        schedule.changeset_bytes_since_checkpoint = prepared.logical_bytes;
        schedule.due = prepared.due;
    }

    pub(crate) fn attempt(
        &self,
        document_version: DocumentVersionV1,
        history_cursor: usize,
        content_identity: u64,
        build_document: impl FnOnce() -> Option<Arc<brilliant_score_foundation::ScoreDocumentV1>>,
    ) -> KernelStage4MetricsV1 {
        if !self.schedule.borrow().due {
            return KernelStage4MetricsV1::default();
        }
        #[cfg(test)]
        {
            let mut schedule = self.schedule.borrow_mut();
            if schedule.fail_next_materialization {
                schedule.fail_next_materialization = false;
                return KernelStage4MetricsV1 {
                    checkpoint_attempts: 1,
                    checkpoint_failures: 1,
                    ..KernelStage4MetricsV1::default()
                };
            }
        }
        let Some(document) = build_document() else {
            return KernelStage4MetricsV1 {
                checkpoint_attempts: 1,
                checkpoint_failures: 1,
                ..KernelStage4MetricsV1::default()
            };
        };
        let Ok(bytes) = canonical_score_bytes(document.as_ref()) else {
            return KernelStage4MetricsV1 {
                checkpoint_attempts: 1,
                checkpoint_failures: 1,
                ..KernelStage4MetricsV1::default()
            };
        };
        let materialized_bytes = u64::try_from(bytes.len()).unwrap_or(u64::MAX);
        let candidate = OperationalCheckpointV1 {
            document_version,
            history_cursor,
            content_identity,
            document,
        };
        let mut schedule = self.schedule.borrow_mut();
        schedule.latest = Some(candidate);
        let retained = schedule
            .latest
            .as_ref()
            .expect("checkpoint was installed immediately above");
        debug_assert_eq!(retained.document_version, document_version);
        debug_assert_eq!(retained.history_cursor, history_cursor);
        debug_assert_eq!(retained.content_identity, content_identity);
        debug_assert!(!retained.document.id.as_js_string().is_empty());
        schedule.committed_entries_since_checkpoint = 0;
        schedule.changeset_bytes_since_checkpoint = 0;
        schedule.due = false;
        KernelStage4MetricsV1 {
            checkpoint_attempts: 1,
            checkpoint_successes: 1,
            checkpoint_materialized_bytes: materialized_bytes,
            ..KernelStage4MetricsV1::default()
        }
    }

    #[cfg(test)]
    pub(crate) fn observation(&self) -> CheckpointObservationV1 {
        let schedule = self.schedule.borrow();
        CheckpointObservationV1 {
            entries: schedule.committed_entries_since_checkpoint,
            logical_bytes: schedule.changeset_bytes_since_checkpoint,
            due: schedule.due,
            latest_version: schedule
                .latest
                .as_ref()
                .map(|checkpoint| checkpoint.document_version),
            latest_cursor: schedule
                .latest
                .as_ref()
                .map(|checkpoint| checkpoint.history_cursor),
            latest_identity: schedule
                .latest
                .as_ref()
                .map(|checkpoint| checkpoint.content_identity),
            latest_document_id: schedule
                .latest
                .as_ref()
                .map(|checkpoint| checkpoint.document.id.clone()),
        }
    }

    #[cfg(test)]
    pub(crate) fn fail_next_materialization(&self) {
        self.schedule.borrow_mut().fail_next_materialization = true;
    }

    #[cfg(test)]
    pub(crate) fn force_due_for_test(&self, entries: u64, logical_bytes: u64) {
        let mut schedule = self.schedule.borrow_mut();
        schedule.committed_entries_since_checkpoint = entries;
        schedule.changeset_bytes_since_checkpoint = logical_bytes;
        schedule.due = true;
    }
}

#[cfg(test)]
#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct CheckpointObservationV1 {
    pub(crate) entries: u64,
    pub(crate) logical_bytes: u64,
    pub(crate) due: bool,
    pub(crate) latest_version: Option<DocumentVersionV1>,
    pub(crate) latest_cursor: Option<usize>,
    pub(crate) latest_identity: Option<u64>,
    pub(crate) latest_document_id: Option<brilliant_core_types::StableId>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn entry_and_byte_thresholds_are_exact() {
        let entries = CheckpointStateV1::new();
        for index in 1..=CHECKPOINT_ENTRY_INTERVAL_V1 {
            let prepared = entries.prepare_submit(0).expect("entry counter");
            assert_eq!(prepared.due, index == CHECKPOINT_ENTRY_INTERVAL_V1);
            entries.commit_submit(prepared);
        }

        let bytes = CheckpointStateV1::new();
        let below = bytes
            .prepare_submit(CHECKPOINT_CHANGESET_BYTES_V1 - 1)
            .expect("below byte threshold");
        assert!(!below.due);
        bytes.commit_submit(below);
        let crossing = bytes.prepare_submit(1).expect("byte threshold");
        assert!(crossing.due);
    }

    #[test]
    fn counter_overflow_is_rejected_before_schedule_mutation() {
        let state = CheckpointStateV1::new();
        {
            let mut schedule = state.schedule.borrow_mut();
            schedule.changeset_bytes_since_checkpoint = u64::MAX;
        }
        assert_eq!(
            state.prepare_submit(1),
            Err(CheckpointPrepareFailureV1::CounterOverflow)
        );
        assert_eq!(state.observation().logical_bytes, u64::MAX);
        assert!(!state.observation().due);
    }
}
