use brilliant_core_types::JS_SAFE_INTEGER_MAX;
use brilliant_kernel_contracts::{
    AffectedEntityAddressV1, KernelCommandIdentityV1, KernelHistoryStateV1,
};

use crate::change_set::ChangeSetV1;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum HistoryPrepareFailureV1 {
    Capacity,
    SequenceOverflow,
    Invariant,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) struct PreparedHistoryAppendV1 {
    pub(crate) sequence: u64,
}

#[derive(Clone, Debug)]
pub(crate) struct HistoryEntryV1 {
    pub(crate) sequence: u64,
    pub(crate) command_id: KernelCommandIdentityV1,
    pub(crate) payload: HistoryPayloadV1,
    pub(crate) affected: Vec<AffectedEntityAddressV1>,
}

#[derive(Clone, Debug)]
pub(crate) enum HistoryPayloadV1 {
    Typed(ChangeSetV1),
    Candidate(std::sync::Arc<crate::candidate::CandidateHistory>),
}

#[derive(Debug)]
pub(crate) struct HistoryStateV1 {
    entries: Vec<HistoryEntryV1>,
    cursor: usize,
    next_sequence: u64,
}

impl HistoryStateV1 {
    pub(crate) const fn new() -> Self {
        Self {
            entries: Vec::new(),
            cursor: 0,
            next_sequence: 1,
        }
    }

    pub(crate) fn projected(&self) -> Result<KernelHistoryStateV1, HistoryPrepareFailureV1> {
        self.check_invariants()?;
        let undo_depth =
            u64::try_from(self.cursor).map_err(|_| HistoryPrepareFailureV1::Invariant)?;
        let redo_depth = u64::try_from(self.entries.len() - self.cursor)
            .map_err(|_| HistoryPrepareFailureV1::Invariant)?;
        if undo_depth > JS_SAFE_INTEGER_MAX as u64 || redo_depth > JS_SAFE_INTEGER_MAX as u64 {
            return Err(HistoryPrepareFailureV1::Invariant);
        }
        Ok(KernelHistoryStateV1 {
            undo_depth,
            redo_depth,
        })
    }

    pub(crate) fn prepare_append(
        &mut self,
    ) -> Result<PreparedHistoryAppendV1, HistoryPrepareFailureV1> {
        self.check_invariants()?;
        if self.next_sequence > JS_SAFE_INTEGER_MAX as u64 {
            return Err(HistoryPrepareFailureV1::SequenceOverflow);
        }
        if self.cursor == self.entries.len() {
            self.entries
                .try_reserve(1)
                .map_err(|_| HistoryPrepareFailureV1::Capacity)?;
        }
        Ok(PreparedHistoryAppendV1 {
            sequence: self.next_sequence,
        })
    }

    pub(crate) fn commit_append(
        &mut self,
        prepared: PreparedHistoryAppendV1,
        command_id: impl Into<KernelCommandIdentityV1>,
        payload: HistoryPayloadV1,
        affected: Vec<AffectedEntityAddressV1>,
    ) {
        debug_assert!(self.check_invariants().is_ok());
        debug_assert_eq!(prepared.sequence, self.next_sequence);
        self.entries.truncate(self.cursor);
        self.entries.push(HistoryEntryV1 {
            sequence: prepared.sequence,
            command_id: command_id.into(),
            payload,
            affected,
        });
        self.cursor += 1;
        self.next_sequence = prepared.sequence + 1;
        debug_assert!(self.check_invariants().is_ok());
    }

    pub(crate) fn undo_entry(&self) -> Result<&HistoryEntryV1, HistoryPrepareFailureV1> {
        self.check_invariants()?;
        self.cursor
            .checked_sub(1)
            .and_then(|index| self.entries.get(index))
            .ok_or(HistoryPrepareFailureV1::Invariant)
    }

    pub(crate) fn redo_entry(&self) -> Result<&HistoryEntryV1, HistoryPrepareFailureV1> {
        self.check_invariants()?;
        self.entries
            .get(self.cursor)
            .ok_or(HistoryPrepareFailureV1::Invariant)
    }

    pub(crate) const fn can_undo(&self) -> bool {
        self.cursor != 0
    }

    pub(crate) fn can_redo(&self) -> bool {
        self.cursor < self.entries.len()
    }

    pub(crate) fn commit_undo(&mut self) {
        debug_assert!(self.can_undo());
        self.cursor -= 1;
        debug_assert!(self.check_invariants().is_ok());
    }

    pub(crate) fn commit_redo(&mut self) {
        debug_assert!(self.can_redo());
        self.cursor += 1;
        debug_assert!(self.check_invariants().is_ok());
    }

    pub(crate) fn current_identity(&self) -> Result<u64, HistoryPrepareFailureV1> {
        self.check_invariants()?;
        if self.cursor == 0 {
            Ok(0)
        } else {
            Ok(self.entries[self.cursor - 1].sequence)
        }
    }

    pub(crate) const fn cursor(&self) -> usize {
        self.cursor
    }

    pub(crate) fn identity_after_undo(&self) -> Result<u64, HistoryPrepareFailureV1> {
        self.check_invariants()?;
        if self.cursor == 0 {
            return Err(HistoryPrepareFailureV1::Invariant);
        }
        if self.cursor == 1 {
            Ok(0)
        } else {
            Ok(self.entries[self.cursor - 2].sequence)
        }
    }

    pub(crate) fn identity_after_redo(&self) -> Result<u64, HistoryPrepareFailureV1> {
        self.check_invariants()?;
        self.entries
            .get(self.cursor)
            .map(|entry| entry.sequence)
            .ok_or(HistoryPrepareFailureV1::Invariant)
    }

    fn check_invariants(&self) -> Result<(), HistoryPrepareFailureV1> {
        if self.cursor > self.entries.len() || self.next_sequence == 0 {
            return Err(HistoryPrepareFailureV1::Invariant);
        }
        let mut previous = 0_u64;
        for entry in &self.entries {
            if entry.sequence == 0
                || entry.sequence <= previous
                || entry.sequence > JS_SAFE_INTEGER_MAX as u64
            {
                return Err(HistoryPrepareFailureV1::Invariant);
            }
            previous = entry.sequence;
        }
        if self.next_sequence <= previous || self.next_sequence > JS_SAFE_INTEGER_MAX as u64 + 1 {
            return Err(HistoryPrepareFailureV1::Invariant);
        }
        Ok(())
    }

    #[cfg(test)]
    pub(crate) fn set_next_sequence_for_test(&mut self, value: u64) {
        self.next_sequence = value;
    }
}

impl Default for HistoryStateV1 {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn initial_history_is_empty_and_safe() {
        let history = HistoryStateV1::new();
        assert_eq!(
            history.projected().expect("history projection"),
            KernelHistoryStateV1 {
                undo_depth: 0,
                redo_depth: 0,
            }
        );
        assert_eq!(history.current_identity().expect("identity"), 0);
        assert!(!history.can_undo());
        assert!(!history.can_redo());
    }

    #[test]
    fn history_sequence_overflow_is_detected_before_append() {
        let mut history = HistoryStateV1::new();
        history.set_next_sequence_for_test(JS_SAFE_INTEGER_MAX as u64 + 1);
        assert_eq!(
            history.prepare_append(),
            Err(HistoryPrepareFailureV1::SequenceOverflow)
        );
        assert_eq!(
            history.projected(),
            Ok(KernelHistoryStateV1 {
                undo_depth: 0,
                redo_depth: 0,
            })
        );
    }
}
