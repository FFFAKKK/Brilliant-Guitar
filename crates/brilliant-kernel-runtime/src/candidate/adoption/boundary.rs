//! An inverse suffix can end at a semantically invalid typed prefix. This seal
//! proves only that its raw identities can be represented by a strong reader;
//! it grants no final semantic proof or permission to prepare an adoption.
use super::*;

type BoundaryResult<T> = Result<T, TransactionPrepareFailureV1>;

impl<'a> Candidate<'a> {
    pub(in crate::candidate) fn seal_structural_boundary(
        mut self,
    ) -> Result<StableCandidateView<'a>, FinalizationFailure> {
        if let Err(failure) = self.scan_structural_boundary() {
            if let Err(budget) = self.ensure_work_budget() {
                self.reservation.abort();
                return Err(FinalizationFailure::Command(budget));
            }
            self.reservation.abort();
            return Err(FinalizationFailure::Preparation(failure));
        }
        self.ensure_work_budget()
            .map_err(FinalizationFailure::Command)?;
        Ok(StableCandidateView {
            candidate: RefCell::new(self),
            structural_scans: 1,
            incremental_work: IncrementalValidationWorkV1::default(),
        })
    }

    fn scan_structural_boundary(&mut self) -> BoundaryResult<()> {
        let invalid = TransactionPrepareFailureV1::LocalInvariant;
        self.reservation
            .ensure_active()
            .map_err(|_| invalid.clone())?;
        self.prefix
            .borrowed_operations()
            .map_err(|_| invalid.clone())?;
        let mut ids = HashSet::new();
        let mut pending = Vec::new();
        self.reservation
            .vec(Site::JournalBoundaries, &mut pending, 1)
            .map_err(|_| TransactionPrepareFailureV1::Capacity)?;
        pending.push((self.document.clone(), Kind::Document, None));
        // visit_order already accounts for every child delivered to this scan.
        self.work.visited_entries = self
            .work
            .visited_entries
            .checked_add(1)
            .ok_or(TransactionPrepareFailureV1::Capacity)?;
        self.observe_work_budget()
            .map_err(|_| TransactionPrepareFailureV1::Capacity)?;
        while let Some((source, expected_kind, owner)) = pending.pop() {
            if self.kind(&source) != Some(expected_kind)
                || !self.visible(&source)
                || owner
                    .as_ref()
                    .is_some_and(|owner| self.owner(&source).as_ref() != Some(owner))
            {
                return Err(invalid);
            }
            let raw = self.raw_id(&source).ok_or_else(|| invalid.clone())?.clone();
            // StableId preserves unpaired UTF-16; only empty raw IDs fail.
            StableId::new(&raw).map_err(|_| invalid.clone())?;
            if expected_kind != Kind::Content {
                self.reservation
                    .set(Site::JournalBoundaries, &mut ids, 1)
                    .map_err(|_| TransactionPrepareFailureV1::Capacity)?;
                if !ids.insert(raw) {
                    return Err(invalid);
                }
            }
            if matches!(expected_kind, Kind::Voice | Kind::Event) {
                let reference = self
                    .read_staff_reference(&source)
                    .ok_or_else(|| invalid.clone())?;
                if expected_kind == Kind::Voice && reference.is_none() {
                    return Err(invalid);
                }
                if let Some(raw) = reference {
                    StableId::new(raw).map_err(|_| invalid.clone())?;
                }
            }
            let children: &[Children] = match expected_kind {
                Kind::Document => &[Children::Measures, Children::Parts],
                Kind::Part => &[Children::Staffs, Children::Contents],
                Kind::Content => &[Children::Voices],
                Kind::Voice => &[Children::Events],
                Kind::Event => match self
                    .read_content_kind(&source)
                    .ok_or_else(|| invalid.clone())?
                {
                    EventContentKind::Rest => &[],
                    EventContentKind::Notes => &[Children::Notes],
                },
                Kind::Measure | Kind::Staff | Kind::Note => &[],
            };
            for &children in children {
                // Content IDs are unique only within this Part's content order.
                // They may be shared by another Part and by a global Measure.
                let mut contents = HashSet::new();
                let mut reservation = std::mem::take(&mut self.reservation);
                let mut failure = None;
                let visited = self.visit_order(
                    &CandidateOrder::new(&source, children),
                    &mut |child, raw| {
                        if children == Children::Contents {
                            if StableId::new(raw).is_err() {
                                failure = Some(TransactionPrepareFailureV1::LocalInvariant);
                                return false;
                            }
                            if reservation
                                .set(Site::JournalBoundaries, &mut contents, 1)
                                .is_err()
                            {
                                failure = Some(TransactionPrepareFailureV1::Capacity);
                                return false;
                            }
                            if !contents.insert(raw.clone()) {
                                failure = Some(TransactionPrepareFailureV1::LocalInvariant);
                                return false;
                            }
                        }
                        if reservation
                            .vec(Site::JournalBoundaries, &mut pending, 1)
                            .is_err()
                        {
                            failure = Some(TransactionPrepareFailureV1::Capacity);
                            return false;
                        }
                        pending.push((child.clone(), children.child_kind(), Some(source.clone())));
                        true
                    },
                );
                self.reservation = reservation;
                if let Some(failure) = failure {
                    return Err(failure);
                }
                visited.ok_or_else(|| invalid.clone())?;
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        candidate::tests::raw_part,
        store::{build_live_score_store, tests::fixture},
    };
    use brilliant_core_types::{FiniteNumber, SafeInteger};

    fn replacement(mut part: AdmissionPartV1, store: &LiveScoreStore) -> Candidate<'_> {
        let mut candidate = Candidate::new(
            TransactionOverlayV1::new(store),
            store.export_document().unwrap().id,
        );
        let old = candidate.resolve(Kind::Part, &"part-z".into()).unwrap();
        candidate.hide(&old).unwrap();
        part.id = "replacement".into();
        candidate.insert_part(part, None).unwrap();
        candidate
    }

    #[test]
    fn structural_seal_allows_repairable_semantics_and_unknown_nonempty_references() {
        let document = fixture();
        let store = build_live_score_store(&document).unwrap();
        let mut part = raw_part("replacement");
        part.staves[0].line_count = SafeInteger::new(0).unwrap();
        part.measure_contents.truncate(1);
        part.measure_contents[0].measure_id = "unknown-measure".into();
        for voice in &mut part.measure_contents[0].voices {
            voice.default_staff_id = "unknown-staff".into();
            for event in &mut voice.sequence.events {
                event.staff_id = Some("unknown-staff".into());
            }
        }
        let mut candidate = replacement(part, &store);
        let mut metadata = document.metadata.clone();
        metadata.tempo.bpm = FiniteNumber::new(0.0).unwrap();
        candidate
            .replace_value(
                &candidate.document.clone(),
                Value::DocumentMetadata(metadata),
            )
            .unwrap();
        let view = candidate.seal_structural_boundary().unwrap();
        assert_eq!(view.structural_scans, 1);
        assert!(view.candidate.borrow().work.visited_entries > 1);
        assert!(
            !view
                .candidate
                .borrow_mut()
                .assess_final_semantics()
                .unwrap()
                .ok
        );
        assert_eq!(store.export_document().unwrap(), document);
    }

    #[test]
    fn structural_seal_rejects_empty_ids_cross_kind_duplicates_and_empty_references() {
        let document = fixture();
        let store = build_live_score_store(&document).unwrap();
        for case in 0..6 {
            let mut part = raw_part("replacement");
            match case {
                0 => part.staves[0].id = "".into(),
                1 => part.staves[0].id = document.id.as_js_string().clone(),
                2 => part.measure_contents[0].measure_id = "".into(),
                3 => part.measure_contents.push(part.measure_contents[0].clone()),
                4 => part.measure_contents[0].voices[0].default_staff_id = "".into(),
                5 => {
                    part.measure_contents[0].voices[0].sequence.events[0].staff_id = Some("".into())
                }
                _ => unreachable!(),
            }
            assert!(
                matches!(
                    replacement(part, &store).seal_structural_boundary(),
                    Err(FinalizationFailure::Preparation(
                        TransactionPrepareFailureV1::LocalInvariant
                    ))
                ),
                "case {case}"
            );
        }
        assert_eq!(store.export_document().unwrap(), document);
    }

    #[test]
    fn same_measure_content_id_is_allowed_in_distinct_parts() {
        let document = fixture();
        let store = build_live_score_store(&document).unwrap();
        let mut candidate = Candidate::new(TransactionOverlayV1::new(&store), document.id.clone());
        let mut part = raw_part("other-part");
        part.staves.clear();
        for content in &mut part.measure_contents {
            content.voices.clear();
        }
        candidate.insert_part(part, None).unwrap();
        assert!(candidate.seal_structural_boundary().is_ok());
        assert_eq!(store.export_document().unwrap(), document);
    }

    #[test]
    fn every_boundary_reservation_failure_is_terminal_before_store_writes() {
        let document = fixture();
        let store = build_live_score_store(&document).unwrap();
        let mut baseline = replacement(raw_part("replacement"), &store);
        baseline.reservation = Reservation::default();
        baseline.scan_structural_boundary().unwrap();
        let attempts = baseline.reservation.attempts;
        assert!(attempts > 5);
        for at in 1..=attempts {
            let mut candidate = replacement(raw_part("replacement"), &store);
            candidate.reservation = Reservation::fail_at(at);
            assert!(
                matches!(
                    candidate.seal_structural_boundary(),
                    Err(FinalizationFailure::Preparation(
                        TransactionPrepareFailureV1::Capacity
                    ))
                ),
                "reservation {at}"
            );
        }
        let mut poisoned = replacement(raw_part("replacement"), &store);
        poisoned.reservation.abort();
        assert!(poisoned.seal_structural_boundary().is_err());
        assert_eq!(store.export_document().unwrap(), document);
    }
}
