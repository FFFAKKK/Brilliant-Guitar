use super::*;

fn definition(raw: &str) -> AdmissionMeasureDefinitionV1 {
    let value = fixture().measure_definitions.remove(0);
    AdmissionMeasureDefinitionV1 {
        id: raw.into(),
        meter: value.meter,
        pickup_duration: value.pickup_duration,
    }
}

#[test]
fn measure_and_content_storage_preserve_raw_ids_and_independent_owner_orders() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    let mut candidate = Candidate::new(TransactionOverlayV1::new(&store), document.id.clone());
    let prefix_part = candidate.resolve(Kind::Part, &"part-z".into()).unwrap();
    let added_part = candidate.insert_part(raw_part("part-z"), None).unwrap();
    let before = ordered(&mut candidate, &added_part, Children::Contents);
    let empty = candidate.insert_measure(definition(""), None).unwrap();
    let repeated = candidate
        .insert_measure(definition("measure-a"), None)
        .unwrap();
    assert_eq!(candidate.raw_id(&empty), Some(&JsString::from("")));
    assert_eq!(candidate.kind(&repeated), Some(Kind::Measure));
    let first = candidate
        .insert_content(&prefix_part, "measure-a".into(), Vec::new(), 0)
        .unwrap();
    let second = candidate
        .insert_content(&prefix_part, "measure-a".into(), Vec::new(), 1)
        .unwrap();
    assert_ne!(first, second);
    candidate.hide(&first).unwrap();
    let replacement = candidate
        .insert_content(&prefix_part, "".into(), Vec::new(), 1)
        .unwrap();
    let visible = ordered(&mut candidate, &prefix_part, Children::Contents);
    assert_eq!(&visible[..2], &[second, replacement]);
    assert_eq!(
        ordered(&mut candidate, &added_part, Children::Contents),
        before
    );
    let voices = raw_part("unused").measure_contents.remove(0).voices;
    let content = candidate
        .insert_content(&added_part, "".into(), voices, 0)
        .unwrap();
    assert!(!ordered(&mut candidate, &content, Children::Voices).is_empty());
    assert_eq!(candidate.owner(&content), Some(added_part));
    let nodes = candidate.nodes.len();
    assert_eq!(
        candidate.insert_content(&prefix_part, "bad-position".into(), Vec::new(), usize::MAX),
        Err(Failure::InternalError)
    );
    assert_eq!(candidate.nodes.len(), nodes);
    assert_eq!(store.export_document().unwrap(), document);
}

#[test]
fn every_measure_and_content_insertion_reservation_failure_is_terminal() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    let mutate = |candidate: &mut Candidate<'_>| -> Result<(), Failure> {
        candidate.insert_measure(definition("new-measure"), None)?;
        let part = candidate.resolve(Kind::Part, &"part-z".into())?;
        let voices = raw_part("unused").measure_contents.remove(0).voices;
        candidate.insert_content(&part, "new-measure".into(), voices, 1)?;
        Ok(())
    };
    let mut baseline = Candidate::new(TransactionOverlayV1::new(&store), document.id.clone());
    mutate(&mut baseline).unwrap();
    let attempts = baseline.reservation.attempts;
    assert!(attempts > 0);
    for fail_at in 1..=attempts {
        let mut candidate = Candidate::new(TransactionOverlayV1::new(&store), document.id.clone());
        candidate.reservation = Reservation::fail_at(fail_at);
        assert_eq!(
            mutate(&mut candidate),
            Err(Failure::InternalError),
            "reservation {fail_at}"
        );
        assert_eq!(
            candidate.reservation.ensure_active(),
            Err(Failure::InternalError)
        );
        let nodes = candidate.nodes.len();
        assert_eq!(
            candidate.insert_measure(definition("cannot-continue"), None),
            Err(Failure::InternalError)
        );
        assert_eq!(candidate.nodes.len(), nodes);
        assert_eq!(candidate.reservation.attempts, fail_at);
    }
    assert_eq!(store.export_document().unwrap(), document);
}
