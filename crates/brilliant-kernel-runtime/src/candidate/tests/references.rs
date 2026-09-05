use super::*;

fn reference_part(name: &str, target: &JsString, event_count: usize) -> AdmissionPartV1 {
    let mut part = raw_part(name);
    part.measure_contents.truncate(1);
    part.measure_contents[0].voices.truncate(1);
    let voice = &mut part.measure_contents[0].voices[0];
    voice.id = format!("{name}-voice").into();
    voice.default_staff_id = target.clone();
    let sample = voice.sequence.events[0].clone();
    voice.sequence.events = (0..event_count)
        .map(|index| RhythmicEventV1 {
            id: format!("{name}-event-{index}").into(),
            staff_id: Some(target.clone()),
            content: RhythmicContentV1::Rest,
            ..sample.clone()
        })
        .collect();
    part
}

fn reset_visits(candidate: &Candidate<'_>) {
    candidate
        .staff_reference_visits
        .set(StaffReferenceVisits::default());
}

#[test]
fn local_staff_query_visits_only_its_bucket_despite_unrelated_and_hidden_events() {
    for count in [0, 64, 4096] {
        let document = fixture();
        let store = build_live_score_store(&document).unwrap();
        let mut candidate = Candidate::new(TransactionOverlayV1::new(&store), document.id);
        let target = JsString::from("");
        let local = candidate
            .insert_part(reference_part("local", &target, 1), None)
            .unwrap();
        let expected = candidate.staff_referrers_in_part(&local, &target).unwrap();
        assert_eq!(expected.len(), 2);
        // Same raw ID in a different owner must not be traversed locally.
        let distant = candidate
            .insert_part(reference_part("distant", &target, count), None)
            .unwrap();
        candidate
            .insert_part(reference_part("other", &"unrelated".into(), count), None)
            .unwrap();
        for hidden in [false, true] {
            if hidden {
                candidate.hide(&distant).unwrap();
            }
            reset_visits(&candidate);
            for _ in 0..8 {
                assert_eq!(
                    candidate.staff_referrers_in_part(&local, &target).unwrap(),
                    expected
                );
            }
            assert_eq!(
                candidate.staff_reference_visits.get(),
                StaffReferenceVisits {
                    candidate_edges: 16,
                    prefix_addresses: 0,
                },
                "unrelated Event count {count}, hidden {hidden}"
            );
        }
    }
}

#[test]
fn local_query_does_not_scan_unrelated_prefix_reference_replacements() {
    for count in [0, 64, 2048] {
        let mut document = fixture();
        let voice = &mut document.parts[0].measure_contents[0].voices[0];
        let sample = voice.sequence.events[0].clone();
        for index in 0..count {
            voice.sequence.events.push(RhythmicEventV1 {
                id: id(format!("prefix-unrelated-{index}")),
                staff_id: None,
                content: RhythmicContentV1::Rest,
                ..sample.clone()
            });
        }
        let store = build_live_score_store(&document).unwrap();
        let mut candidate = Candidate::new(TransactionOverlayV1::new(&store), document.id);
        for index in 0..count {
            let source = Occurrence::prefix(Entity::Event {
                event_id: id(format!("prefix-unrelated-{index}")),
            });
            candidate
                .replace_staff_reference(&source, Some("unrelated-change".into()))
                .unwrap();
        }
        assert_eq!(candidate.staff_references.len(), count);
        let target = JsString::from_utf16(vec![0xd800]);
        let local = candidate
            .insert_part(reference_part("local", &target, 1), None)
            .unwrap();
        reset_visits(&candidate);
        assert_eq!(
            candidate
                .staff_referrers_in_part(&local, &target)
                .unwrap()
                .len(),
            2
        );
        assert_eq!(
            candidate.staff_reference_visits.get(),
            StaffReferenceVisits {
                candidate_edges: 2,
                prefix_addresses: 0,
            }
        );
    }
}

#[test]
fn current_edges_are_unique_preserve_raw_ids_and_survive_hidden_reassignment() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    let mut candidate = Candidate::new(TransactionOverlayV1::new(&store), document.id);
    let empty = JsString::from("");
    let high = JsString::from_utf16(vec![0xd800]);
    let low = JsString::from_utf16(vec![0xdc00]);
    let part = candidate
        .insert_part(reference_part("local", &empty, 1), None)
        .unwrap();
    let sources = candidate.staff_referrers_in_part(&part, &empty).unwrap();
    let source = sources[1].clone();
    for target in [&high, &low, &empty, &high] {
        assert!(
            candidate
                .replace_staff_reference(&source, Some(target.clone()))
                .unwrap()
        );
        let attempts = candidate.reservation.attempts;
        assert!(
            !candidate
                .replace_staff_reference(&source, Some(target.clone()))
                .unwrap()
        );
        assert_eq!(candidate.reservation.attempts, attempts);
        for queried in [&empty, &high, &low] {
            let found = candidate.staff_referrers_in_part(&part, queried).unwrap();
            assert_eq!(
                found.iter().filter(|found| **found == source).count(),
                usize::from(queried == target)
            );
            assert_eq!(found.len(), found.iter().collect::<HashSet<_>>().len());
        }
    }
    candidate.hide(&source).unwrap();
    assert!(candidate.staff_referrers(&high).is_empty());
    // Shared replay primitive must update an invisible retained occurrence too.
    let retained_low = candidate.share_id(low.clone()).unwrap();
    candidate
        .assign_shared_staff_reference(&source, Some(retained_low))
        .unwrap();
    assert!(candidate.staff_referrers(&low).is_empty());
    assert!(candidate.hidden.remove(&source));
    assert_eq!(
        candidate.staff_referrers(&low),
        std::slice::from_ref(&source)
    );
    assert!(candidate.staff_referrers(&high).is_empty());
    candidate.replace_staff_reference(&source, None).unwrap();
    assert!(candidate.staff_referrers(&low).is_empty());
    assert!(!candidate.staff_referrers_by_id.contains_key(&low));
}

#[test]
fn every_reverse_index_reservation_failure_preserves_current_edge_and_is_terminal() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    for preexisting in [false, true] {
        let prepare = || {
            let mut candidate =
                Candidate::new(TransactionOverlayV1::new(&store), document.id.clone());
            let part = candidate
                .insert_part(reference_part("local", &"old".into(), 1), None)
                .unwrap();
            if preexisting {
                candidate
                    .insert_part(reference_part("distant", &"new".into(), 0), None)
                    .unwrap();
            }
            let sources = candidate
                .staff_referrers_in_part(&part, &"old".into())
                .unwrap();
            (candidate, part, sources)
        };
        let (mut baseline, _, sources) = prepare();
        baseline.reservation = Reservation::default();
        baseline
            .replace_staff_reference(&sources[1], Some("new".into()))
            .unwrap();
        let attempts = baseline.reservation.attempts;
        assert_eq!(attempts, if preexisting { 2 } else { 4 });
        for fail_at in 1..=attempts {
            let (mut candidate, part, sources) = prepare();
            candidate.reservation = Reservation::fail_at(fail_at);
            assert_eq!(
                candidate.replace_staff_reference(&sources[1], Some("new".into())),
                Err(Failure::InternalError)
            );
            assert_eq!(
                candidate.read_staff_reference(&sources[1]),
                Some(Some("old".into()))
            );
            assert_eq!(
                candidate
                    .staff_referrers_in_part(&part, &"old".into())
                    .unwrap(),
                sources
            );
            assert!(
                candidate
                    .staff_referrers_in_part(&part, &"new".into())
                    .unwrap()
                    .is_empty()
            );
            assert_eq!(
                candidate.replace_staff_reference(&sources[1], None),
                Err(Failure::InternalError)
            );
            assert_eq!(candidate.reservation.attempts, fail_at);
        }
    }
}
