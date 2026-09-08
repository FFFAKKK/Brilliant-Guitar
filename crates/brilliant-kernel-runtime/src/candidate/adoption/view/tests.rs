use super::*;
use crate::{
    change_set::{StableAnchorV1, StableExtensionOwnerV1},
    store::{build_live_score_store, tests::fixture},
};
use brilliant_core_types::SafeInteger;
use brilliant_score_foundation::{ExtensionOwnerV1, PitchStepV1};

fn id(text: &str) -> StableId {
    StableId::new(text).unwrap()
}

fn roots() -> [Entity; 6] {
    [
        Entity::Measure {
            measure_id: id("measure-a"),
        },
        Entity::Part {
            part_id: id("part-z"),
        },
        Entity::Staff {
            staff_id: id("staff-a"),
        },
        Entity::Voice {
            voice_id: id("voice-a"),
        },
        Entity::Event {
            event_id: id("event-a"),
        },
        Entity::Note {
            note_id: id("note-a"),
        },
    ]
}

#[test]
fn structural_view_detaches_each_typed_root_exactly_like_store() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    let view = Candidate::new(TransactionOverlayV1::new(&store), document.id.clone())
        .seal_structural_boundary()
        .unwrap();
    for address in roots() {
        let expected = store.detach_entity(&address).expect("fixture root");
        assert_eq!(view.detach_entity(&address), Some(expected), "{address:?}");
    }
    assert_eq!(
        view.detach_entity(&Entity::Document {
            document_id: document.id
        }),
        None
    );
    assert_eq!(
        view.detach_entity(&Entity::Note {
            note_id: id("missing-note")
        }),
        None
    );
}

#[test]
fn detached_bundles_include_prefix_and_candidate_fields_and_actual_child_order() {
    let mut document = fixture();
    let events = &mut document.parts[0].measure_contents[0].voices[0]
        .sequence
        .events;
    events[0].duration.base = SafeInteger::new(2).unwrap();
    let mut second = events[0].clone();
    second.id = id("event-b");
    second.content = RhythmicContentV1::Rest;
    second.staff_id = None;
    events.push(second);
    let store = build_live_score_store(&document).unwrap();
    let mut expected = document.clone();
    expected.parts[0].name = "Prefix name".into();
    expected.parts[0].staves.reverse();
    let events = &mut expected.parts[0].measure_contents[0].voices[0]
        .sequence
        .events;
    let RhythmicContentV1::Notes { notes } = &mut events[0].content else {
        panic!("fixture note");
    };
    notes[0].written_pitch.step = PitchStepV1::F;
    notes[0].written_pitch.octave = SafeInteger::new(5).unwrap();
    let pitch = notes[0].written_pitch.clone();
    events.reverse();
    let mut prefix = TransactionOverlayV1::new(&store);
    prefix
        .replace_scalar(
            Scalar::PartName {
                part_id: id("part-z"),
            },
            Value::PartName(expected.parts[0].name.clone()),
        )
        .unwrap();
    prefix
        .move_ordered_child(
            Order::Staffs {
                part_id: id("part-z"),
            },
            id("staff-a"),
            StableAnchorV1::Start,
        )
        .unwrap();
    let mut candidate = Candidate::new(prefix, document.id.clone());
    let note = candidate.resolve(Kind::Note, &"note-a".into()).unwrap();
    assert!(
        candidate
            .replace_value(&note, Value::NoteWrittenPitch(pitch))
            .unwrap()
    );
    let voice = candidate.resolve(Kind::Voice, &"voice-a".into()).unwrap();
    candidate
        .move_child(
            &CandidateOrder::new(&voice, Children::Events),
            &"event-b".into(),
            None,
        )
        .unwrap();
    let view = candidate.seal_structural_boundary().unwrap();
    let expected_store = build_live_score_store(&expected).unwrap();
    for address in roots() {
        assert_eq!(
            view.detach_entity(&address),
            expected_store.detach_entity(&address),
            "{address:?}"
        );
    }
    assert_eq!(
        store.export_document().unwrap(),
        document,
        "read projection leaves the base untouched"
    );
}

#[test]
fn part_extensions_use_current_members_payloads_and_global_anchors_after_edits() {
    let mut document = fixture();
    let mut owned_a = document.extensions[0].clone();
    owned_a.namespace = "owned.a".into();
    owned_a.owner = ExtensionOwnerV1::Part {
        part_id: id("part-z"),
    };
    let mut owned_b = owned_a.clone();
    owned_b.namespace = "owned.b".into();
    document.extensions.insert(1, owned_a.clone());
    document.extensions.push(owned_b.clone());
    let store = build_live_score_store(&document).unwrap();
    let mut prefix = TransactionOverlayV1::new(&store);
    let mut owned_c = owned_a.clone();
    owned_c.namespace = "owned.c".into();
    prefix
        .insert_extension(StableAnchorV1::Start, owned_c.clone())
        .unwrap();
    owned_a.schema_version = SafeInteger::new(17).unwrap();
    owned_a.payload = document.extensions[2].payload.clone();
    prefix
        .replace_extension(ExtensionKeyV1::from_block(&owned_a), owned_a.clone())
        .unwrap();
    prefix
        .remove_extension(ExtensionKeyV1::from_block(&owned_b))
        .unwrap();
    // Removing the old predecessor changes owned.a's anchor to owned.c.
    prefix
        .remove_extension(ExtensionKeyV1::from_block(&document.extensions[0]))
        .unwrap();
    let mut expected = document.clone();
    expected.extensions = vec![
        owned_c.clone(),
        owned_a.clone(),
        document.extensions[2].clone(),
    ];
    let expected_store = build_live_score_store(&expected).unwrap();
    let view = Candidate::new(prefix, document.id.clone())
        .seal_structural_boundary()
        .unwrap();
    let part = Entity::Part {
        part_id: id("part-z"),
    };
    let bundle = view.detach_entity(&part).expect("current part bundle");
    assert_eq!(Some(bundle.clone()), expected_store.detach_entity(&part));
    let EntityBundleV1::Part(bundle) = bundle else {
        panic!("part bundle");
    };
    assert_eq!(bundle.extensions.len(), 2);
    assert_eq!(bundle.extensions[0].value, owned_c);
    assert_eq!(bundle.extensions[1].value, owned_a);
    assert_eq!(bundle.extensions[0].anchor, StableAnchorV1::Start);
    assert_ne!(bundle.extensions[1].anchor, StableAnchorV1::Start);
    for namespace in ["owned.a", "owned.b", "owned.c"] {
        let reference = Reference::ExtensionOwner {
            namespace: namespace.into(),
            owner: StableExtensionOwnerV1::Part {
                part_id: id("part-z"),
            },
        };
        assert_eq!(
            view.read_reference(&reference),
            expected_store.read_reference(&reference),
            "{namespace}"
        );
    }
    assert_eq!(store.export_document().unwrap(), document);
}

#[test]
fn absent_content_link_preserves_store_present_false_contract() {
    let document = fixture();
    // A structural view permits missing measure coverage. Both endpoints still
    // exist, so absence of this edge differs from an unknown endpoint.
    let store = build_live_score_store(&document).unwrap();
    let reference = Reference::PartMeasureLink {
        part_id: id("part-z"),
        measure_id: id("measure-a"),
    };
    let mut prefix = TransactionOverlayV1::new(&store);
    prefix
        .update_reference(reference.clone(), ReferenceValueV1::Present(false))
        .unwrap();
    assert_eq!(
        prefix.read_reference(&reference),
        Some(ReferenceValueV1::Present(false))
    );
    let view = Candidate::new(prefix, document.id.clone())
        .seal_structural_boundary()
        .unwrap();
    assert_eq!(
        view.read_reference(&reference),
        Some(ReferenceValueV1::Present(false))
    );
    let missing_endpoint = Reference::PartMeasureLink {
        part_id: id("unknown-part"),
        measure_id: id("measure-a"),
    };
    assert_eq!(
        view.read_reference(&missing_endpoint),
        store.read_reference(&missing_endpoint)
    );
}
