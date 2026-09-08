use super::*;
use crate::candidate::reservation::Reservation;

fn measure_order(candidate: &mut Candidate<'_>) -> (CandidateOrder, Vec<Occurrence>) {
    let order = CandidateOrder::new(&candidate.document, Children::Measures);
    let mut sources = Vec::new();
    candidate
        .visit_order(&order, &mut |source, _| {
            sources.push(source.clone());
            true
        })
        .unwrap();
    assert!(sources.len() > 1);
    (order, sources)
}

fn assert_order(candidate: &mut Candidate<'_>, order: &CandidateOrder, expected: &[Occurrence]) {
    let mut actual = Vec::new();
    candidate
        .visit_order(order, &mut |source, _| {
            actual.push(source.clone());
            true
        })
        .unwrap();
    assert_eq!(actual, expected);
}

#[test]
fn complete_order_replacement_roundtrips_and_noop_reserves_nothing() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    let mut recorder = Recorder::new(Candidate::new(
        TransactionOverlayV1::new(&store),
        document.id.clone(),
    ));
    let (order, original) = measure_order(&mut recorder.candidate);
    let before = recorder.candidate.reservation.attempts;
    assert!(!recorder.replace_children(&order, &original).unwrap());
    assert_eq!(recorder.candidate.reservation.attempts, before);
    assert!(recorder.steps.is_empty());
    let desired: Vec<_> = original.iter().rev().cloned().collect();
    assert!(recorder.replace_children(&order, &desired).unwrap());
    recorder.verify_recorded_order(&order).unwrap();
    let before = recorder.candidate.reservation.attempts;
    assert!(!recorder.replace_children(&order, &desired).unwrap());
    assert_eq!(recorder.candidate.reservation.attempts, before);
    let (mut candidate, journal) = recorder.finish().unwrap();
    assert_eq!(journal.steps.len(), 1);
    assert_order(&mut candidate, &order, &desired);
    journal.replay(&mut candidate, Direction::Inverse).unwrap();
    assert_order(&mut candidate, &order, &original);
    journal.replay(&mut candidate, Direction::Forward).unwrap();
    assert_order(&mut candidate, &order, &desired);
    assert_eq!(store.export_document().unwrap(), document);
}

#[test]
fn missing_duplicate_foreign_and_unrecorded_order_are_rejected() {
    for case in 0..4 {
        let document = fixture();
        let store = build_live_score_store(&document).unwrap();
        let mut recorder = Recorder::new(Candidate::new(
            TransactionOverlayV1::new(&store),
            document.id.clone(),
        ));
        let (order, original) = measure_order(&mut recorder.candidate);
        let mut desired = original.clone();
        match case {
            0 => {
                desired.pop();
            }
            1 => {
                desired[1] = desired[0].clone();
            }
            2 => {
                desired[0] = recorder.candidate.document.clone();
            }
            _ => {
                desired.reverse();
                recorder
                    .candidate
                    .orders
                    .insert(order.clone(), desired.clone());
            }
        }
        assert_eq!(
            recorder.replace_children(&order, &desired),
            Err(Failure::InternalError)
        );
        assert!(recorder.steps.is_empty());
        assert!(recorder.candidate.reservation.ensure_active().is_err());
        assert_eq!(store.export_document().unwrap(), document);
    }
}

#[test]
fn replay_rejects_wrong_complete_expected_order_and_poisons() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    let mut recorder = Recorder::new(Candidate::new(
        TransactionOverlayV1::new(&store),
        document.id.clone(),
    ));
    let (order, original) = measure_order(&mut recorder.candidate);
    let desired: Vec<_> = original.iter().rev().cloned().collect();
    recorder.replace_children(&order, &desired).unwrap();
    let (mut candidate, journal) = recorder.finish().unwrap();
    candidate.orders.insert(order, original);
    assert_eq!(
        journal.replay(&mut candidate, Direction::Inverse),
        Err(Failure::InternalError)
    );
    assert!(candidate.reservation.ensure_active().is_err());
}

#[test]
fn same_kind_child_from_another_owner_is_rejected() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    let mut recorder = Recorder::new(Candidate::new(
        TransactionOverlayV1::new(&store),
        document.id.clone(),
    ));
    let mut payload = raw_part("temporary");
    for (index, staff) in payload.staves.iter_mut().enumerate() {
        let old = staff.id.clone();
        staff.id = format!("replace-order-staff-{index}").into();
        for content in &mut payload.measure_contents {
            for voice in &mut content.voices {
                if voice.default_staff_id == old {
                    voice.default_staff_id = staff.id.clone();
                }
                for event in &mut voice.sequence.events {
                    if event.staff_id.as_ref() == Some(&old) {
                        event.staff_id = Some(staff.id.clone());
                    }
                }
            }
        }
    }
    let root = recorder.insert_part(payload, None).unwrap();
    let order = CandidateOrder::new(&root, Children::Staffs);
    let mut desired = Vec::new();
    recorder
        .candidate
        .visit_order(&order, &mut |source, _| {
            desired.push(source.clone());
            true
        })
        .unwrap();
    let foreign = recorder
        .candidate
        .resolve(Kind::Staff, document.parts[0].staves[0].id.as_js_string())
        .unwrap();
    desired[0] = foreign;
    let steps = recorder.steps.len();
    assert_eq!(
        recorder.replace_children(&order, &desired),
        Err(Failure::InternalError)
    );
    assert_eq!(recorder.steps.len(), steps);
    assert!(recorder.candidate.reservation.ensure_active().is_err());
}

#[test]
fn replay_reservation_failures_poison_without_publishing_replacement() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    let mut recorder = Recorder::new(Candidate::new(
        TransactionOverlayV1::new(&store),
        document.id.clone(),
    ));
    let (order, original) = measure_order(&mut recorder.candidate);
    let desired: Vec<_> = original.iter().rev().cloned().collect();
    recorder.replace_children(&order, &desired).unwrap();
    let (mut candidate, journal) = recorder.finish().unwrap();
    candidate.reservation = Reservation::default();
    journal.replay(&mut candidate, Direction::Inverse).unwrap();
    let attempts = candidate.reservation.attempts;
    for fail_at in 1..=attempts {
        let mut candidate = Candidate::new(TransactionOverlayV1::new(&store), document.id.clone());
        candidate.orders.insert(order.clone(), desired.clone());
        candidate.reservation = Reservation::fail_at(fail_at);
        assert_eq!(
            journal.replay(&mut candidate, Direction::Inverse),
            Err(Failure::InternalError),
            "reservation {fail_at}"
        );
        assert!(candidate.reservation.ensure_active().is_err());
        assert_order(&mut candidate, &order, &desired);
    }
}

#[test]
fn every_recording_reservation_failure_keeps_the_order_unpublished() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    let mut baseline = Recorder::new(Candidate::new(
        TransactionOverlayV1::new(&store),
        document.id.clone(),
    ));
    let (order, original) = measure_order(&mut baseline.candidate);
    let desired: Vec<_> = original.iter().rev().cloned().collect();
    baseline.candidate.reservation = Reservation::default();
    baseline.replace_children(&order, &desired).unwrap();
    let attempts = baseline.candidate.reservation.attempts;
    assert!(attempts > 0);
    for fail_at in 1..=attempts {
        let mut recorder = Recorder::new(Candidate::new(
            TransactionOverlayV1::new(&store),
            document.id.clone(),
        ));
        recorder.candidate.reservation = Reservation::fail_at(fail_at);
        assert_eq!(
            recorder.replace_children(&order, &desired),
            Err(Failure::InternalError),
            "reservation {fail_at}"
        );
        assert!(recorder.steps.is_empty());
        assert!(recorder.candidate.reservation.ensure_active().is_err());
        assert_order(&mut recorder.candidate, &order, &original);
    }
    assert_eq!(store.export_document().unwrap(), document);
}
