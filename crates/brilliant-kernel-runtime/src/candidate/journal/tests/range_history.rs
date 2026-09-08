use super::*;
use crate::{
    candidate::adoption::FinalizationFailure,
    indices::{normalized_index_projection, rebuild_indices_from_store},
    store::LiveScoreStore,
};
use brilliant_core_types::DocumentVersionV1;
use brilliant_kernel_contracts::{
    KernelStage3MetricsV1, MeasurePointKindV1, MeasurePointV1, ScoreRangeV1,
};
use brilliant_score_foundation::{
    AdmissionMeasureDefinitionV1, MusicSequenceV1, ScoreDocumentV1, ScoreNoteV1, VoiceV1,
};

fn document() -> ScoreDocumentV1 {
    let mut document = fixture();
    let mut part = document.parts[0].clone();
    part.id = id("part-b");
    for (index, staff) in part.staves.iter_mut().enumerate() {
        staff.id = id(format!("staff-b-{index}"));
    }
    for (index, content) in part.measure_contents.iter_mut().enumerate() {
        for (v, voice) in content.voices.iter_mut().enumerate() {
            voice.id = id(format!("voice-b-{index}-{v}"));
            voice.default_staff_id = part.staves[0].id.clone();
            for (e, event) in voice.sequence.events.iter_mut().enumerate() {
                event.id = id(format!("event-b-{index}-{v}-{e}"));
                if event.staff_id.is_some() {
                    event.staff_id = Some(part.staves[0].id.clone());
                }
                if let RhythmicContentV1::Notes { notes } = &mut event.content {
                    for (n, note) in notes.iter_mut().enumerate() {
                        note.id = id(format!("note-b-{index}-{v}-{e}-{n}"));
                    }
                }
            }
        }
    }
    part.measure_contents.reverse();
    document.parts.push(part);
    document
}

fn raw_voice(voice: &VoiceV1) -> AdmissionVoiceV1 {
    AdmissionVoiceV1 {
        id: voice.id.as_js_string().clone(),
        default_staff_id: voice.default_staff_id.as_js_string().clone(),
        sequence: MusicSequenceV1 {
            start: voice.sequence.start.clone(),
            events: voice
                .sequence
                .events
                .iter()
                .map(|event| RhythmicEventV1 {
                    id: event.id.as_js_string().clone(),
                    duration: event.duration.clone(),
                    staff_id: event.staff_id.as_ref().map(|id| id.as_js_string().clone()),
                    content: match &event.content {
                        RhythmicContentV1::Rest => RhythmicContentV1::Rest,
                        RhythmicContentV1::Notes { notes } => RhythmicContentV1::Notes {
                            notes: notes
                                .iter()
                                .map(|note| ScoreNoteV1 {
                                    id: note.id.as_js_string().clone(),
                                    written_pitch: note.written_pitch.clone(),
                                })
                                .collect(),
                        },
                    },
                })
                .collect(),
        },
    }
}

fn restore(
    recorder: &mut Recorder<'_>,
    document: &ScoreDocumentV1,
    measure: &str,
    after: Option<&JsString>,
) {
    let definition = document
        .measure_definitions
        .iter()
        .find(|value| value.id == id(measure))
        .unwrap();
    let definition = AdmissionMeasureDefinitionV1 {
        id: measure.into(),
        meter: definition.meter.clone(),
        pickup_duration: definition.pickup_duration.clone(),
    };
    let contents = document
        .parts
        .iter()
        .map(|part| {
            let owner = recorder
                .candidate
                .resolve(Kind::Part, part.id.as_js_string())
                .unwrap();
            let content = part
                .measure_contents
                .iter()
                .find(|content| content.measure_id == id(measure))
                .unwrap();
            (owner, content.voices.iter().map(raw_voice).collect())
        })
        .collect();
    recorder
        .insert_measure_bundle(definition, contents, after)
        .unwrap();
}

fn indices(store: &LiveScoreStore) {
    let (rebuilt, _) = rebuild_indices_from_store(store).unwrap();
    assert_eq!(
        normalized_index_projection(store, &store.indices).unwrap(),
        normalized_index_projection(store, &rebuilt).unwrap()
    );
}

macro_rules! roundtrip {
    ($recorder:ident, $store:ident, $document:ident, $expected:ident, $reborn:expr) => {{
        let mut old_handles = $store.indices.entity.by_id.clone();
        let (plan, history) = $recorder
            .prepare_combined_commit(&$store, DocumentVersionV1::initial())
            .expect("initial prepare");
        assert_eq!($store.export_document().unwrap(), $document);
        let mut version = DocumentVersionV1::initial();
        let mut metrics = KernelStage3MetricsV1::default();
        plan.unwrap()
            .commit(&mut $store, &mut version, &mut metrics)
            .unwrap();
        for stage in 0..3 {
            if stage > 0 {
                let before = $store.export_document().unwrap();
                let plan = history
                    .prepare_replay(
                        &$store,
                        version,
                        if stage == 1 {
                            Direction::Inverse
                        } else {
                            Direction::Forward
                        },
                    )
                    .unwrap_or_else(|error| panic!("stage {stage}: {error:?}"))
                    .unwrap();
                assert_eq!($store.export_document().unwrap(), before);
                plan.commit(&mut $store, &mut version, &mut metrics)
                    .unwrap();
            }
            assert_eq!(
                $store.export_document().unwrap(),
                if stage == 1 {
                    $document.clone()
                } else {
                    $expected.clone()
                }
            );
            for entity_id in &$reborn {
                assert_ne!(
                    $store.indices.entity.by_id.get(entity_id),
                    old_handles.get(entity_id),
                    "stale lifetime {entity_id:?} stage {stage}"
                );
            }
            old_handles = $store.indices.entity.by_id.clone();
            assert_eq!(version.get(), stage + 1);
            assert_eq!(metrics.full_semantic_validations, 1);
            indices(&$store);
        }
    }};
}

fn all_measures() -> ScoreRangeV1 {
    ScoreRangeV1::MeasureRange {
        start: MeasurePointV1 {
            kind: MeasurePointKindV1::Measure,
            measure_id: id("measure-a"),
        },
        end: MeasurePointV1 {
            kind: MeasurePointKindV1::Measure,
            measure_id: id("measure-z"),
        },
    }
}

#[test]
fn delete_all_measures_defers_semantics_and_same_batch_rebuild_closes_history() {
    let document = document();
    let mut store = build_live_score_store(&document).unwrap();
    let version = DocumentVersionV1::initial();
    let mut rejected = Recorder::new(Candidate::new(
        TransactionOverlayV1::new(&store),
        document.id.clone(),
    ));
    assert!(
        rejected
            .delete_range_command(document.id.as_js_string(), &all_measures())
            .unwrap()
    );
    assert!(matches!(
        rejected.prepare_combined_commit(&store, version),
        Err(FinalizationFailure::Command(
            Failure::SemanticInvalid { .. }
        ))
    ));
    assert_eq!(store.export_document().unwrap(), document);
    assert_eq!(version, DocumentVersionV1::initial());
    indices(&store);

    let mut recorder = Recorder::new(Candidate::new(
        TransactionOverlayV1::new(&store),
        document.id.clone(),
    ));
    assert!(
        recorder
            .delete_range_command(document.id.as_js_string(), &all_measures())
            .unwrap()
    );
    // Continue this recorder directly from its empty intermediate graph.
    restore(&mut recorder, &document, "measure-z", None);
    restore(
        &mut recorder,
        &document,
        "measure-a",
        Some(&"measure-z".into()),
    );
    let mut expected = document.clone();
    for part in &mut expected.parts {
        part.measure_contents
            .sort_by_key(|content| usize::from(content.measure_id == id("measure-a")));
    }
    let mut reborn: Vec<StableId> = document
        .measure_definitions
        .iter()
        .map(|measure| measure.id.clone())
        .collect();
    for part in &document.parts {
        for content in &part.measure_contents {
            for voice in &content.voices {
                reborn.push(voice.id.clone());
                for event in &voice.sequence.events {
                    reborn.push(event.id.clone());
                    if let RhythmicContentV1::Notes { notes } = &event.content {
                        reborn.extend(notes.iter().map(|note| note.id.clone()));
                    }
                }
            }
        }
    }
    roundtrip!(recorder, store, document, expected, reborn);
}

#[test]
fn typed_pitch_and_content_order_then_range_transpose_roundtrip_both_layers() {
    let document = document();
    let mut expected = document.clone();
    let mut store = build_live_score_store(&document).unwrap();
    let mut prefix = TransactionOverlayV1::new(&store);
    let event = &mut expected.parts[0].measure_contents[0].voices[0]
        .sequence
        .events[0];
    let RhythmicContentV1::Notes { notes } = &mut event.content else {
        panic!("fixture note")
    };
    notes[0].written_pitch.octave = SafeInteger::new(5).unwrap();
    prefix
        .replace_scalar(
            Scalar::NoteWrittenPitch {
                note_id: id("note-a"),
            },
            Value::NoteWrittenPitch(notes[0].written_pitch.clone()),
        )
        .unwrap();
    expected.parts[0].measure_contents.reverse();
    prefix
        .replace_ordered_children(
            Order::MeasureContents {
                part_id: id("part-z"),
            },
            expected.parts[0]
                .measure_contents
                .iter()
                .map(|content| content.measure_id.clone())
                .collect(),
        )
        .unwrap();
    let transposition = brilliant_score_foundation::TranspositionV1 {
        diatonic_steps: SafeInteger::new(1).unwrap(),
        chromatic_semitones: SafeInteger::new(2).unwrap(),
    };
    // Expected C -> D is stated directly; do not reuse the Rust transform under test.
    for part in &mut expected.parts {
        for content in &mut part.measure_contents {
            for voice in &mut content.voices {
                for event in &mut voice.sequence.events {
                    if let RhythmicContentV1::Notes { notes } = &mut event.content {
                        for note in notes {
                            note.written_pitch.step = brilliant_score_foundation::PitchStepV1::D;
                        }
                    }
                }
            }
        }
    }
    let mut recorder = Recorder::new(Candidate::new(prefix, document.id.clone()));
    assert!(
        recorder
            .transpose_range_command(document.id.as_js_string(), &all_measures(), &transposition)
            .unwrap()
    );
    roundtrip!(recorder, store, document, expected, Vec::<StableId>::new());
}
