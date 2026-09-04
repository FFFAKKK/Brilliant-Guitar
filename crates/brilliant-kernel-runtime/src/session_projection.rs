use brilliant_core_types::{DocumentVersionV1, JS_SAFE_INTEGER_MAX};
use brilliant_kernel_contracts::KernelStage4FailureV1;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum ProjectionPrepareFailureV1 {
    Capacity,
    EventSequenceOverflow,
    Invariant,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) struct PreparedProjectionTransitionV1 {
    pub(crate) content_identity: u64,
    pub(crate) event_sequence_start: u64,
    pub(crate) event_count: u64,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) struct PreparedPersistedTransitionV1 {
    pub(crate) clean_identity: u64,
    pub(crate) event_sequence_start: u64,
    pub(crate) event_count: u64,
}

#[derive(Debug)]
pub(crate) struct SessionProjectionStateV1 {
    clean_state_identity: u64,
    state_identity_by_document_version: Vec<u64>,
    next_event_sequence: u64,
}

impl SessionProjectionStateV1 {
    pub(crate) fn new() -> Result<Self, ProjectionPrepareFailureV1> {
        let mut identities = Vec::new();
        identities
            .try_reserve(1)
            .map_err(|_| ProjectionPrepareFailureV1::Capacity)?;
        identities.push(0);
        Ok(Self {
            clean_state_identity: 0,
            state_identity_by_document_version: identities,
            next_event_sequence: 1,
        })
    }

    pub(crate) fn dirty(&self, current_identity: u64) -> bool {
        current_identity != self.clean_state_identity
    }

    pub(crate) fn prepare_document_transition(
        &mut self,
        current_version: DocumentVersionV1,
        content_identity: u64,
        event_count: u64,
    ) -> Result<PreparedProjectionTransitionV1, ProjectionPrepareFailureV1> {
        self.check_invariants(current_version)?;
        if content_identity > JS_SAFE_INTEGER_MAX as u64 || event_count > 2 {
            return Err(ProjectionPrepareFailureV1::Invariant);
        }
        let event_sequence_start = self.reserve_event_interval(event_count)?;
        self.state_identity_by_document_version
            .try_reserve(1)
            .map_err(|_| ProjectionPrepareFailureV1::Capacity)?;
        Ok(PreparedProjectionTransitionV1 {
            content_identity,
            event_sequence_start,
            event_count,
        })
    }

    pub(crate) fn commit_document_transition(&mut self, prepared: PreparedProjectionTransitionV1) {
        self.state_identity_by_document_version
            .push(prepared.content_identity);
        self.next_event_sequence = prepared.event_sequence_start + prepared.event_count;
    }

    pub(crate) fn identity_for_version(
        &self,
        current_version: DocumentVersionV1,
        observed_version: DocumentVersionV1,
    ) -> Result<u64, KernelStage4FailureV1> {
        self.check_invariants(current_version)
            .map_err(|_| KernelStage4FailureV1::CheckpointInvariantViolation)?;
        let index = usize::try_from(observed_version.get())
            .map_err(|_| KernelStage4FailureV1::CheckpointVersionUnavailable)?;
        self.state_identity_by_document_version
            .get(index)
            .copied()
            .ok_or(KernelStage4FailureV1::CheckpointVersionUnavailable)
    }

    pub(crate) fn prepare_mark_persisted(
        &self,
        current_identity: u64,
        clean_identity: u64,
    ) -> Result<Option<PreparedPersistedTransitionV1>, ProjectionPrepareFailureV1> {
        if clean_identity > JS_SAFE_INTEGER_MAX as u64 {
            return Err(ProjectionPrepareFailureV1::Invariant);
        }
        if clean_identity == self.clean_state_identity {
            return Ok(None);
        }
        let dirty_before = self.dirty(current_identity);
        let dirty_after = current_identity != clean_identity;
        let event_count = u64::from(dirty_before != dirty_after);
        let event_sequence_start = self.reserve_event_interval(event_count)?;
        Ok(Some(PreparedPersistedTransitionV1 {
            clean_identity,
            event_sequence_start,
            event_count,
        }))
    }

    pub(crate) fn commit_mark_persisted(&mut self, prepared: PreparedPersistedTransitionV1) {
        self.clean_state_identity = prepared.clean_identity;
        self.next_event_sequence = prepared.event_sequence_start + prepared.event_count;
    }

    fn reserve_event_interval(&self, count: u64) -> Result<u64, ProjectionPrepareFailureV1> {
        if self.next_event_sequence == 0
            || self.next_event_sequence > JS_SAFE_INTEGER_MAX as u64 + 1
        {
            return Err(ProjectionPrepareFailureV1::Invariant);
        }
        if count == 0 {
            return Ok(self.next_event_sequence);
        }
        let last = self
            .next_event_sequence
            .checked_add(count - 1)
            .ok_or(ProjectionPrepareFailureV1::EventSequenceOverflow)?;
        if last > JS_SAFE_INTEGER_MAX as u64 {
            return Err(ProjectionPrepareFailureV1::EventSequenceOverflow);
        }
        Ok(self.next_event_sequence)
    }

    fn check_invariants(
        &self,
        current_version: DocumentVersionV1,
    ) -> Result<(), ProjectionPrepareFailureV1> {
        let expected_len = current_version
            .get()
            .checked_add(1)
            .and_then(|value| usize::try_from(value).ok())
            .ok_or(ProjectionPrepareFailureV1::Invariant)?;
        if self.state_identity_by_document_version.len() != expected_len
            || self
                .state_identity_by_document_version
                .iter()
                .any(|identity| *identity > JS_SAFE_INTEGER_MAX as u64)
            || self.clean_state_identity > JS_SAFE_INTEGER_MAX as u64
        {
            return Err(ProjectionPrepareFailureV1::Invariant);
        }
        Ok(())
    }

    #[cfg(test)]
    pub(crate) fn set_next_event_sequence_for_test(&mut self, value: u64) {
        self.next_event_sequence = value;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn initial_projection_is_clean_and_maps_revision_zero() {
        let projection = SessionProjectionStateV1::new().expect("projection");
        assert!(!projection.dirty(0));
        assert_eq!(
            projection
                .identity_for_version(DocumentVersionV1::initial(), DocumentVersionV1::initial()),
            Ok(0)
        );
    }

    #[test]
    fn event_overflow_is_detected_before_identity_reservation() {
        let mut projection = SessionProjectionStateV1::new().expect("projection");
        projection.set_next_event_sequence_for_test(JS_SAFE_INTEGER_MAX as u64);
        assert_eq!(
            projection.prepare_document_transition(DocumentVersionV1::initial(), 1, 2),
            Err(ProjectionPrepareFailureV1::EventSequenceOverflow)
        );
        assert!(!projection.dirty(0));
    }
}
