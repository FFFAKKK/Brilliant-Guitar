use super::*;
use crate::change_set::StableAnchorV1;
use brilliant_score_foundation::ExtensionOwnerV1;

fn roundtrip(delete_after_birth: bool) {
    let original = fixture();
    let mut expected = original.clone();
    let mut store = build_live_score_store(&original).unwrap();
    let mut extension = original.extensions[0].clone();
    extension.namespace = "prefix.dangling-owner".into();
    extension.owner = ExtensionOwnerV1::Part {
        part_id: id("new-part"),
    };
    let mut prefix = TransactionOverlayV1::new(&store);
    prefix
        .insert_extension(StableAnchorV1::Start, extension.clone())
        .unwrap();
    let mut raw = raw_part("new-part");
    let mut strong = original.parts[0].clone();
    strong.id = id("new-part");
    for (index, (staff, expected_staff)) in
        raw.staves.iter_mut().zip(&mut strong.staves).enumerate()
    {
        let name = format!("new-staff-{index}");
        staff.id = name.clone().into();
        expected_staff.id = StableId::new(name).unwrap();
    }
    for (index, (content, expected_content)) in raw
        .measure_contents
        .iter_mut()
        .zip(&mut strong.measure_contents)
        .enumerate()
    {
        content.voices.truncate(1);
        expected_content.voices.truncate(1);
        let name = format!("new-voice-{index}");
        content.voices[0].id = name.clone().into();
        expected_content.voices[0].id = StableId::new(name).unwrap();
        content.voices[0].default_staff_id = raw.staves[0].id.clone();
        expected_content.voices[0].default_staff_id = strong.staves[0].id.clone();
        content.voices[0].sequence.events.clear();
        expected_content.voices[0].sequence.events.clear();
    }
    let mut recorder = Recorder::new(Candidate::new(prefix, original.id.clone()));
    recorder.insert_part(raw, None).unwrap();
    if delete_after_birth {
        // An explicit Part.remove consumes the current raw owner's extension;
        // its inverse must restore it before undoing the earlier Part birth.
        recorder.remove_part(&"new-part".into()).unwrap();
    } else {
        expected.parts.insert(0, strong);
        expected.extensions.insert(0, extension);
    }
    let (plan, history) = recorder
        .prepare_combined_commit(&store, DocumentVersionV1::initial())
        .unwrap();
    let mut version = DocumentVersionV1::initial();
    let mut metrics = KernelStage3MetricsV1::default();
    assert_eq!(store.export_document().unwrap(), original);
    plan.unwrap()
        .commit(&mut store, &mut version, &mut metrics)
        .unwrap();
    assert_eq!(store.export_document().unwrap(), expected);
    indices_are_complete(&store);
    // The inverse Part birth must preserve the extension introduced by prefix;
    // prefix.inverse then verifies and removes that extension itself.
    let before_inverse = store.export_document().unwrap();
    let plan = history
        .prepare_replay(&store, version, Direction::Inverse)
        .unwrap()
        .unwrap();
    assert_eq!(store.export_document().unwrap(), before_inverse);
    plan.commit(&mut store, &mut version, &mut metrics).unwrap();
    assert_eq!(store.export_document().unwrap(), original);
    assert_eq!(metrics.full_semantic_validations, 1);
    indices_are_complete(&store);
    history
        .prepare_replay(&store, version, Direction::Forward)
        .unwrap()
        .unwrap()
        .commit(&mut store, &mut version, &mut metrics)
        .unwrap();
    assert_eq!(store.export_document().unwrap(), expected);
    assert_eq!(metrics.full_semantic_validations, 1);
    assert_eq!(version.get(), 3);
    indices_are_complete(&store);
}

#[test]
fn prefix_dangling_extension_repaired_by_part_birth_survives_birth_inverse_until_prefix_inverse() {
    roundtrip(false);
}

#[test]
fn repaired_dangling_extension_explicit_part_delete_and_both_inverses_roundtrip() {
    roundtrip(true);
}

#[test]
fn dangling_owner_rebinds_across_repeated_journal_birth_and_death_lifetimes() {
    let original = fixture();
    let store = build_live_score_store(&original).unwrap();
    let mut extension = original.extensions[0].clone();
    extension.namespace = "prefix.dangling-owner".into();
    extension.owner = ExtensionOwnerV1::Part {
        part_id: id("new-part"),
    };
    let key = crate::overlay::ExtensionKeyV1::from_block(&extension);
    let mut prefix = TransactionOverlayV1::new(&store);
    prefix
        .insert_extension(StableAnchorV1::Start, extension.clone())
        .unwrap();
    let mut raw = raw_part("new-part");
    for (index, staff) in raw.staves.iter_mut().enumerate() {
        staff.id = format!("new-staff-{index}").into();
    }
    for (index, content) in raw.measure_contents.iter_mut().enumerate() {
        content.voices.truncate(1);
        content.voices[0].id = format!("new-voice-{index}").into();
        content.voices[0].default_staff_id = raw.staves[0].id.clone();
        content.voices[0].sequence.events.clear();
    }
    let mut recorder = Recorder::new(Candidate::new(prefix, original.id.clone()));
    recorder.insert_part(raw, None).unwrap();
    recorder.remove_part(&"new-part".into()).unwrap();
    let (mut candidate, journal) = recorder.finish().unwrap();
    for _ in 0..3 {
        assert!(candidate.read_extension(&key).is_none());
        journal.replay(&mut candidate, Direction::Inverse).unwrap();
        assert_eq!(
            candidate.resolve(Kind::Part, &"new-part".into()),
            Err(Failure::TargetNotFound)
        );
        assert_eq!(candidate.read_extension(&key).unwrap().value, extension);
        journal.replay(&mut candidate, Direction::Forward).unwrap();
        assert_eq!(
            candidate.resolve(Kind::Part, &"new-part".into()),
            Err(Failure::TargetNotFound)
        );
        assert!(candidate.read_extension(&key).is_none());
    }
}
