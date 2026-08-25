use std::cmp::Ordering;

use brilliant_score_foundation::ExactFraction;

use crate::handles::EventHandle;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) struct VoiceTimeEntry {
    pub(crate) start: ExactFraction,
    pub(crate) end: ExactFraction,
    pub(crate) semantic_ordinal: u32,
    pub(crate) event: EventHandle,
}

#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub(crate) struct VoiceTimeIndex {
    pub(crate) entries: Vec<VoiceTimeEntry>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum TimeIndexFailure {
    Capacity,
    InvalidExactTime,
    OverlapOrOrder,
    EmptyOrReversedRange,
    MissingVoice,
    CounterOverflow,
}

impl VoiceTimeIndex {
    pub(crate) fn with_capacity(capacity: usize) -> Result<Self, TimeIndexFailure> {
        let mut entries = Vec::new();
        entries
            .try_reserve_exact(capacity)
            .map_err(|_| TimeIndexFailure::Capacity)?;
        Ok(Self { entries })
    }

    pub(crate) fn push(
        &mut self,
        start: ExactFraction,
        end: ExactFraction,
        semantic_ordinal: u32,
        event: EventHandle,
    ) -> Result<(), TimeIndexFailure> {
        if start
            .checked_compare(end)
            .map_err(|_| TimeIndexFailure::InvalidExactTime)?
            != Ordering::Less
        {
            return Err(TimeIndexFailure::InvalidExactTime);
        }
        if let Some(previous) = self.entries.last()
            && (previous
                .end
                .checked_compare(start)
                .map_err(|_| TimeIndexFailure::InvalidExactTime)?
                == Ordering::Greater
                || previous
                    .start
                    .checked_compare(start)
                    .map_err(|_| TimeIndexFailure::InvalidExactTime)?
                    == Ordering::Greater)
        {
            return Err(TimeIndexFailure::OverlapOrOrder);
        }
        self.entries.push(VoiceTimeEntry {
            start,
            end,
            semantic_ordinal,
            event,
        });
        Ok(())
    }

    pub(crate) fn exact_start<'a>(
        &'a self,
        target: ExactFraction,
        comparisons: &mut usize,
    ) -> Result<&'a [VoiceTimeEntry], TimeIndexFailure> {
        let first = self.lower_bound_start(target, comparisons)?;
        let last = self.upper_bound_start(target, comparisons)?;
        Ok(&self.entries[first..last])
    }

    pub(crate) fn overlap<'a>(
        &'a self,
        start: ExactFraction,
        end: ExactFraction,
        comparisons: &mut usize,
    ) -> Result<&'a [VoiceTimeEntry], TimeIndexFailure> {
        if compare(start, end, comparisons)? != Ordering::Less {
            return Err(TimeIndexFailure::EmptyOrReversedRange);
        }
        let first = self.lower_bound_end_after(start, comparisons)?;
        let last = self.lower_bound_start(end, comparisons)?;
        Ok(&self.entries[first.min(last)..last])
    }

    fn lower_bound_start(
        &self,
        target: ExactFraction,
        comparisons: &mut usize,
    ) -> Result<usize, TimeIndexFailure> {
        binary_partition(&self.entries, comparisons, |entry, comparisons| {
            Ok(compare(entry.start, target, comparisons)? == Ordering::Less)
        })
    }

    fn upper_bound_start(
        &self,
        target: ExactFraction,
        comparisons: &mut usize,
    ) -> Result<usize, TimeIndexFailure> {
        binary_partition(&self.entries, comparisons, |entry, comparisons| {
            Ok(compare(entry.start, target, comparisons)? != Ordering::Greater)
        })
    }

    fn lower_bound_end_after(
        &self,
        target: ExactFraction,
        comparisons: &mut usize,
    ) -> Result<usize, TimeIndexFailure> {
        binary_partition(&self.entries, comparisons, |entry, comparisons| {
            Ok(compare(entry.end, target, comparisons)? != Ordering::Greater)
        })
    }
}

fn binary_partition(
    entries: &[VoiceTimeEntry],
    comparisons: &mut usize,
    mut before: impl FnMut(&VoiceTimeEntry, &mut usize) -> Result<bool, TimeIndexFailure>,
) -> Result<usize, TimeIndexFailure> {
    let mut left = 0_usize;
    let mut right = entries.len();
    while left < right {
        let middle = left + (right - left) / 2;
        if before(&entries[middle], comparisons)? {
            left = middle + 1;
        } else {
            right = middle;
        }
    }
    Ok(left)
}

fn compare(
    left: ExactFraction,
    right: ExactFraction,
    comparisons: &mut usize,
) -> Result<Ordering, TimeIndexFailure> {
    *comparisons = comparisons
        .checked_add(1)
        .ok_or(TimeIndexFailure::CounterOverflow)?;
    left.checked_compare(right)
        .map_err(|_| TimeIndexFailure::InvalidExactTime)
}

#[cfg(test)]
mod tests {
    use slotmap::SlotMap;

    use super::*;

    fn fraction(numerator: i64, denominator: i64) -> ExactFraction {
        ExactFraction::from_parts(numerator, denominator).expect("exact fraction")
    }

    fn three_event_index() -> (VoiceTimeIndex, [EventHandle; 3]) {
        let mut events = SlotMap::<EventHandle, ()>::with_key();
        let handles = [events.insert(()), events.insert(()), events.insert(())];
        let mut index = VoiceTimeIndex::with_capacity(3).expect("reserved index");
        index
            .push(fraction(0, 1), fraction(1, 4), 0, handles[0])
            .expect("entry 0");
        index
            .push(fraction(1, 4), fraction(1, 2), 1, handles[1])
            .expect("entry 1");
        index
            .push(fraction(1, 2), fraction(3, 4), 2, handles[2])
            .expect("entry 2");
        (index, handles)
    }

    #[test]
    fn time_index_exact_start_uses_binary_bounds_and_semantic_order() {
        let (index, handles) = three_event_index();
        let mut comparisons = 0;
        let result = index
            .exact_start(fraction(1, 4), &mut comparisons)
            .expect("exact query");
        assert_eq!(
            result.iter().map(|entry| entry.event).collect::<Vec<_>>(),
            [handles[1]]
        );
        assert!(
            comparisons <= 4,
            "three entries require bounded binary comparisons"
        );
    }

    #[test]
    fn time_index_overlap_is_half_open_and_logarithmic_plus_result_slice() {
        let (index, handles) = three_event_index();
        let mut comparisons = 0;
        let result = index
            .overlap(fraction(1, 8), fraction(1, 2), &mut comparisons)
            .expect("overlap query");
        assert_eq!(
            result.iter().map(|entry| entry.event).collect::<Vec<_>>(),
            [handles[0], handles[1]]
        );
        assert!(comparisons <= 5, "two binary bounds plus range slice");

        comparisons = 0;
        assert_eq!(
            index.overlap(fraction(1, 2), fraction(1, 2), &mut comparisons),
            Err(TimeIndexFailure::EmptyOrReversedRange)
        );
        assert_eq!(
            index.overlap(fraction(3, 4), fraction(1, 2), &mut comparisons),
            Err(TimeIndexFailure::EmptyOrReversedRange)
        );
    }

    #[test]
    fn time_index_rejects_nonpositive_or_overlapping_entries() {
        let mut events = SlotMap::<EventHandle, ()>::with_key();
        let first = events.insert(());
        let second = events.insert(());
        let mut index = VoiceTimeIndex::with_capacity(2).expect("reserved index");
        assert_eq!(
            index.push(fraction(0, 1), fraction(0, 1), 0, first),
            Err(TimeIndexFailure::InvalidExactTime)
        );
        index
            .push(fraction(0, 1), fraction(1, 2), 0, first)
            .expect("first interval");
        assert_eq!(
            index.push(fraction(1, 4), fraction(3, 4), 1, second),
            Err(TimeIndexFailure::OverlapOrOrder)
        );
    }
}
