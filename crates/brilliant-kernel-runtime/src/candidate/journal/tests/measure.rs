use super::*;
use crate::{
    candidate::adoption::FinalizationFailure,
    indices::{normalized_index_projection, rebuild_indices_from_store},
    store::LiveScoreStore,
};
use brilliant_core_types::DocumentVersionV1;
use brilliant_kernel_contracts::KernelStage3MetricsV1;
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

#[test]
fn remove_measure_restores_each_parts_distinct_content_order_and_nonempty_subtree() {
    let document = document();
    let mut expected = document.clone();
    expected
        .measure_definitions
        .retain(|value| value.id != id("measure-a"));
    for part in &mut expected.parts {
        part.measure_contents
            .retain(|content| content.measure_id != id("measure-a"));
    }
    let mut store = build_live_score_store(&document).unwrap();
    let mut recorder = Recorder::new(Candidate::new(
        TransactionOverlayV1::new(&store),
        document.id.clone(),
    ));
    recorder.remove_measure_bundle(&"measure-a".into()).unwrap();
    roundtrip!(recorder, store, document, expected, Vec::<StableId>::new());
}

#[test]
fn same_id_measure_and_descendants_rebirth_never_reuses_old_handles() {
    let mut document = document();
    document
        .measure_definitions
        .retain(|value| value.id == id("measure-a"));
    for part in &mut document.parts {
        part.measure_contents
            .retain(|content| content.measure_id == id("measure-a"));
    }
    let expected = document.clone();
    let mut reborn = vec![id("measure-a")];
    for part in &document.parts {
        for voice in &part.measure_contents[0].voices {
            reborn.push(voice.id.clone());
            for event in &voice.sequence.events {
                reborn.push(event.id.clone());
                if let RhythmicContentV1::Notes { notes } = &event.content {
                    reborn.extend(notes.iter().map(|note| note.id.clone()));
                }
            }
        }
    }
    let mut store = build_live_score_store(&document).unwrap();
    let mut recorder = Recorder::new(Candidate::new(
        TransactionOverlayV1::new(&store),
        document.id.clone(),
    ));
    recorder.remove_measure_bundle(&"measure-a".into()).unwrap();
    restore(&mut recorder, &document, "measure-a", None);
    roundtrip!(recorder, store, document, expected, reborn);
}

#[test]
fn deleting_last_measure_rejects_only_final_state_and_same_batch_can_repair_it() {
    let mut document = document();
    document
        .measure_definitions
        .retain(|value| value.id == id("measure-a"));
    for part in &mut document.parts {
        part.measure_contents
            .retain(|content| content.measure_id == id("measure-a"));
    }
    let mut store = build_live_score_store(&document).unwrap();
    let mut rejected = Recorder::new(Candidate::new(
        TransactionOverlayV1::new(&store),
        document.id.clone(),
    ));
    rejected.remove_measure_bundle(&"measure-a".into()).unwrap();
    assert!(matches!(
        rejected.prepare_combined_commit(&store, DocumentVersionV1::initial()),
        Err(FinalizationFailure::Command(
            Failure::SemanticInvalid { .. }
        ))
    ));
    assert_eq!(store.export_document().unwrap(), document);
    let expected = document.clone();
    let mut recorder = Recorder::new(Candidate::new(
        TransactionOverlayV1::new(&store),
        document.id.clone(),
    ));
    recorder.remove_measure_bundle(&"measure-a".into()).unwrap();
    restore(&mut recorder, &document, "measure-a", None);
    roundtrip!(recorder, store, document, expected, Vec::<StableId>::new());
}

#[test]
fn typed_prefix_content_order_and_note_field_then_measure_death_inverse_exactly() {
    let document = document();
    let mut expected = document.clone();
    expected
        .measure_definitions
        .retain(|value| value.id != id("measure-a"));
    for part in &mut expected.parts {
        part.measure_contents
            .retain(|content| content.measure_id != id("measure-a"));
    }
    let mut store = build_live_score_store(&document).unwrap();
    let mut prefix = TransactionOverlayV1::new(&store);
    let mut pitch = match &document.parts[0].measure_contents[0].voices[0]
        .sequence
        .events[0]
        .content
    {
        RhythmicContentV1::Notes { notes } => notes[0].written_pitch.clone(),
        _ => panic!("fixture notes"),
    };
    pitch.octave = SafeInteger::new(5).unwrap();
    prefix
        .replace_scalar(
            Scalar::NoteWrittenPitch {
                note_id: id("note-a"),
            },
            Value::NoteWrittenPitch(pitch),
        )
        .unwrap();
    prefix
        .replace_ordered_children(
            Order::MeasureContents {
                part_id: id("part-z"),
            },
            vec![id("measure-z"), id("measure-a")],
        )
        .unwrap();
    let mut recorder = Recorder::new(Candidate::new(prefix, document.id.clone()));
    recorder.remove_measure_bundle(&"measure-a".into()).unwrap();
    roundtrip!(recorder, store, document, expected, Vec::<StableId>::new());
}
