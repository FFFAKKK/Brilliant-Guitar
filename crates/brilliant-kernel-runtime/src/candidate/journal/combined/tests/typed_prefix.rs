use super::*;
use crate::{
    change_set::{
        AnchoredExtensionBlockV1, ChangeOpV1, EntityBundleV1, MeasureBundleV1,
        MeasurePartContentBundleV1, PartBundleV1, ReferenceAddressV1, ReferenceValueV1,
        ScalarAddressV1, ScalarValueV1, StableAnchorV1, StableEntityAddressV1,
        StableOrderAddressV1, StableOwnerAddressV1,
    },
    indices::{normalized_index_projection, rebuild_indices_from_store},
    overlay::{ExtensionKeyV1, TransactionOverlayV1},
    store::{LiveScoreStore, build_live_score_store, tests::fixture},
    transaction::PreparedFinalStateCommitV1,
};
use brilliant_core_types::{DocumentVersionV1, SafeInteger, StableId};
use brilliant_kernel_contracts::KernelStage3MetricsV1;
use brilliant_score_foundation::{
    ExtensionOwnerV1, PartMeasureContentV1, RhythmicContentV1, ScoreDocumentV1,
};

fn id(value: &str) -> StableId {
    StableId::new(value).unwrap()
}

fn prefixed(value: &StableId) -> StableId {
    StableId::new(brilliant_core_types::JsString::concat(&[
        &"prefix-".into(),
        value.as_js_string(),
    ]))
    .unwrap()
}

fn check_roundtrip(
    store: &mut LiveScoreStore,
    plan: PreparedFinalStateCommitV1,
    history: &CombinedHistory,
    baseline: &ScoreDocumentV1,
    expected: &ScoreDocumentV1,
) {
    let mut version = DocumentVersionV1::initial();
    let mut metrics = KernelStage3MetricsV1::default();
    plan.commit(store, &mut version, &mut metrics).unwrap();
    for stage in 0..3 {
        if stage > 0 {
            let direction = if stage == 1 {
                Direction::Inverse
            } else {
                Direction::Forward
            };
            history
                .prepare_replay(store, version, direction)
                .unwrap()
                .unwrap()
                .commit(store, &mut version, &mut metrics)
                .unwrap();
        }
        assert_eq!(
            store.export_document().unwrap(),
            if stage == 1 {
                baseline.clone()
            } else {
                expected.clone()
            }
        );
        assert_eq!(version.get(), stage + 1);
        assert_eq!(metrics.full_semantic_validations, 1);
        let (rebuilt, _) = rebuild_indices_from_store(store).unwrap();
        assert_eq!(
            normalized_index_projection(store, &store.indices).unwrap(),
            normalized_index_projection(store, &rebuilt).unwrap()
        );
    }
}

fn add_metadata_suffix<'a>(
    prefix: TransactionOverlayV1<'a>,
    expected: &mut ScoreDocumentV1,
) -> Recorder<'a> {
    let mut recorder = Recorder::new(Candidate::new(prefix, expected.id.clone()));
    let root = recorder
        .candidate
        .resolve(Kind::Document, expected.id.as_js_string())
        .unwrap();
    expected.metadata.title = "Combined suffix title".into();
    recorder
        .replace_scalar(&root, Value::DocumentMetadata(expected.metadata.clone()))
        .unwrap();
    recorder
}

#[test]
fn all_eleven_typed_prefix_operations_roundtrip_through_a_nonempty_suffix() {
    let baseline = fixture();
    let mut expected = baseline.clone();
    let mut store = build_live_score_store(&baseline).unwrap();
    let mut prefix = TransactionOverlayV1::new(&store);
    prefix
        .replace_scalar(
            ScalarAddressV1::PartName {
                part_id: id("part-z"),
            },
            ScalarValueV1::PartName("Typed prefix name".into()),
        )
        .unwrap();
    expected.parts[0].name = "Typed prefix name".into();
    prefix
        .move_ordered_child(
            StableOrderAddressV1::Staffs {
                part_id: id("part-z"),
            },
            id("staff-z"),
            StableAnchorV1::After {
                sibling_id: id("staff-a"),
            },
        )
        .unwrap();
    expected.parts[0].staves.reverse();
    prefix
        .replace_ordered_children(
            StableOrderAddressV1::Measures {
                document_id: baseline.id.clone(),
            },
            vec![id("measure-a"), id("measure-z")],
        )
        .unwrap();
    expected.measure_definitions.reverse();
    let notes = StableOrderAddressV1::Notes {
        event_id: id("event-a"),
    };
    prefix
        .remove_ordered_child(notes.clone(), id("note-a"))
        .unwrap();
    prefix
        .insert_ordered_child(notes, StableAnchorV1::Start, id("note-a"))
        .unwrap();
    prefix
        .update_reference(
            ReferenceAddressV1::VoiceDefaultStaff {
                voice_id: id("voice-a"),
            },
            ReferenceValueV1::StableId(id("staff-z")),
        )
        .unwrap();
    expected.parts[0].measure_contents[0].voices[0].default_staff_id = id("staff-z");
    let address = StableEntityAddressV1::Event {
        event_id: id("event-z"),
    };
    let event = prefix.read_entity(&address).unwrap();
    let owner = StableOwnerAddressV1::Voice {
        voice_id: id("voice-z"),
    };
    let order = StableOrderAddressV1::Events {
        voice_id: id("voice-z"),
    };
    prefix
        .remove_entity(owner.clone(), order.clone(), address.clone())
        .unwrap();
    prefix
        .insert_entity(owner, order, StableAnchorV1::Start, address, event)
        .unwrap();
    let mut extension = baseline.extensions[0].clone();
    extension.namespace = "combined.prefix".into();
    prefix
        .insert_extension(StableAnchorV1::Start, extension.clone())
        .unwrap();
    extension.schema_version = SafeInteger::new(19).unwrap();
    prefix
        .replace_extension(ExtensionKeyV1::from_block(&extension), extension.clone())
        .unwrap();
    prefix
        .remove_extension(ExtensionKeyV1::from_block(&baseline.extensions[1]))
        .unwrap();
    expected.extensions = vec![extension, baseline.extensions[0].clone()];
    let recorder = add_metadata_suffix(prefix, &mut expected);
    let (plan, history) = recorder
        .prepare_combined_commit(&store, DocumentVersionV1::initial())
        .unwrap();
    let mut covered = [false; 11];
    for operation in &history.prefix.forward {
        let index = match operation {
            ChangeOpV1::ReplaceScalar { .. } => 0,
            ChangeOpV1::InsertEntity { .. } => 1,
            ChangeOpV1::RemoveEntity { .. } => 2,
            ChangeOpV1::InsertOrderedChild { .. } => 3,
            ChangeOpV1::RemoveOrderedChild { .. } => 4,
            ChangeOpV1::MoveOrderedChild { .. } => 5,
            ChangeOpV1::ReplaceOrderedChildren { .. } => 6,
            ChangeOpV1::InsertExtensionBlock { .. } => 7,
            ChangeOpV1::ReplaceExtensionBlock { .. } => 8,
            ChangeOpV1::RemoveExtensionBlock { .. } => 9,
            ChangeOpV1::UpdateReference { .. } => 10,
        };
        covered[index] = true;
    }
    assert_eq!(covered, [true; 11]);
    assert!(!history.suffix.steps.is_empty());
    check_roundtrip(&mut store, plan.unwrap(), &history, &baseline, &expected);
}

#[test]
fn inserted_part_and_measure_bundles_detach_from_the_inverse_structural_boundary() {
    let baseline = fixture();
    let mut expected = baseline.clone();
    let mut store = build_live_score_store(&baseline).unwrap();
    let mut part = baseline.parts[0].clone();
    part.id = id("prefix-part");
    for staff in &mut part.staves {
        staff.id = prefixed(&staff.id);
    }
    for content in &mut part.measure_contents {
        for voice in &mut content.voices {
            voice.id = prefixed(&voice.id);
            voice.default_staff_id = prefixed(&voice.default_staff_id);
            for event in &mut voice.sequence.events {
                event.id = prefixed(&event.id);
                event.staff_id = event.staff_id.as_ref().map(prefixed);
                if let RhythmicContentV1::Notes { notes } = &mut event.content {
                    for note in notes {
                        note.id = prefixed(&note.id);
                    }
                }
            }
        }
    }
    let mut extension = baseline.extensions[0].clone();
    extension.namespace = "combined.part-owned".into();
    extension.owner = ExtensionOwnerV1::Part {
        part_id: part.id.clone(),
    };
    let mut prefix = TransactionOverlayV1::new(&store);
    prefix
        .insert_entity(
            StableOwnerAddressV1::Document {
                document_id: baseline.id.clone(),
            },
            StableOrderAddressV1::Parts {
                document_id: baseline.id.clone(),
            },
            StableAnchorV1::Start,
            StableEntityAddressV1::Part {
                part_id: part.id.clone(),
            },
            EntityBundleV1::Part(PartBundleV1 {
                part: part.clone(),
                extensions: vec![AnchoredExtensionBlockV1 {
                    anchor: StableAnchorV1::Start,
                    value: extension.clone(),
                }],
            }),
        )
        .unwrap();
    expected.parts.insert(0, part);
    expected.extensions.insert(0, extension);
    // The frozen suffix boundary sees the Part extension after this score
    // extension. Undo removes the score extension before detaching the Part,
    // so the Part bundle must be rebuilt with its now-current Start anchor.
    let mut score_extension = baseline.extensions[0].clone();
    score_extension.namespace = "combined.before-part-owned".into();
    prefix
        .insert_extension(StableAnchorV1::Start, score_extension.clone())
        .unwrap();
    expected.extensions.insert(0, score_extension);
    let mut definition = baseline.measure_definitions[0].clone();
    definition.id = id("prefix-measure");
    let contents: Vec<_> = expected
        .parts
        .iter()
        .enumerate()
        .map(|(index, part)| {
            let mut voice = baseline.parts[0].measure_contents[1].voices[0].clone();
            voice.id = id(&format!("measure-voice-{index}"));
            voice.default_staff_id = part.staves[0].id.clone();
            voice.sequence.events[0].id = id(&format!("measure-event-{index}"));
            MeasurePartContentBundleV1 {
                part_id: part.id.clone(),
                voices: vec![voice],
            }
        })
        .collect();
    prefix
        .insert_entity(
            StableOwnerAddressV1::Document {
                document_id: baseline.id.clone(),
            },
            StableOrderAddressV1::Measures {
                document_id: baseline.id.clone(),
            },
            StableAnchorV1::Start,
            StableEntityAddressV1::Measure {
                measure_id: definition.id.clone(),
            },
            EntityBundleV1::Measure(MeasureBundleV1 {
                definition: definition.clone(),
                contents: contents.clone(),
            }),
        )
        .unwrap();
    for (part, content) in expected.parts.iter_mut().zip(contents) {
        prefix
            .insert_ordered_child(
                StableOrderAddressV1::MeasureContents {
                    part_id: part.id.clone(),
                },
                StableAnchorV1::Start,
                definition.id.clone(),
            )
            .unwrap();
        part.measure_contents.insert(
            0,
            PartMeasureContentV1 {
                measure_id: definition.id.clone(),
                voices: content.voices,
            },
        );
    }
    expected.measure_definitions.insert(0, definition);
    let recorder = add_metadata_suffix(prefix, &mut expected);
    let (plan, history) = recorder
        .prepare_combined_commit(&store, DocumentVersionV1::initial())
        .unwrap();
    assert!(!history.suffix.steps.is_empty());
    check_roundtrip(&mut store, plan.unwrap(), &history, &baseline, &expected);
}

#[test]
fn standalone_extension_remove_records_its_current_predecessor_for_combined_replay() {
    let baseline = fixture();
    let mut expected = baseline.clone();
    let mut store = build_live_score_store(&baseline).unwrap();
    let mut prefix = TransactionOverlayV1::new(&store);
    let mut inserted = baseline.extensions[0].clone();
    inserted.namespace = "combined.new-first".into();
    prefix
        .insert_extension(StableAnchorV1::Start, inserted.clone())
        .unwrap();
    // A's old anchor was Start; after inserting B it must be After B. Both
    // inverse insertion and forward removal must retain this current anchor.
    prefix
        .remove_extension(ExtensionKeyV1::from_block(&baseline.extensions[0]))
        .unwrap();
    expected.extensions[0] = inserted;
    let recorder = add_metadata_suffix(prefix, &mut expected);
    let (plan, history) = recorder
        .prepare_combined_commit(&store, DocumentVersionV1::initial())
        .unwrap();
    assert!(!history.suffix.steps.is_empty());
    check_roundtrip(&mut store, plan.unwrap(), &history, &baseline, &expected);
}
