use super::*;
use crate::candidate::journal::dispatch::{AdmissionCommandFailure, LeafFacts};
use brilliant_kernel_contracts::{
    CoreCommandEnvelopeV1 as Command, CoreCommandIdV1 as CommandId, EventStaffAssignmentV1,
    InsertMeasurePartContentV1, MeasureAnchorV1, MeasurePickupV1, PartAnchorV1,
    ScoreEntityTargetV1 as Target, ScoreRangeV1, SequenceAnchorV1, StaffAnchorV1, VoiceAnchorV1,
    VoiceEventPointKindV1, VoiceEventPointV1,
};
use brilliant_score_foundation::{AdmissionMeasureDefinitionV1, ScoreDocumentV1, TranspositionV1};

fn document() -> ScoreDocumentV1 {
    let mut document = fixture();
    let mut staff = document.parts[0].staves[0].clone();
    staff.id = id("unused-staff");
    document.parts[0].staves.push(staff);
    let mut part = document.parts[0].clone();
    part.id = id("other-part");
    part.staves.truncate(1);
    part.staves[0].id = id("other-staff");
    for (index, content) in part.measure_contents.iter_mut().enumerate() {
        content.voices.truncate(1);
        content.voices[0].id = id(format!("other-voice-{index}"));
        content.voices[0].default_staff_id = part.staves[0].id.clone();
        content.voices[0].sequence.events.clear();
    }
    document.parts.push(part);
    document
}

fn event_range(document: &ScoreDocumentV1) -> ScoreRangeV1 {
    let voice = &document.parts[0].measure_contents[0].voices[0];
    let point = VoiceEventPointV1 {
        kind: VoiceEventPointKindV1::VoiceEvent,
        voice_id: voice.id.clone(),
        event_id: voice.sequence.events[0].id.clone(),
    };
    ScoreRangeV1::VoiceEventRange {
        start: point.clone(),
        end: point,
    }
}

fn commands(document: &ScoreDocumentV1) -> Vec<Command<JsString>> {
    let part = &document.parts[0];
    let voice = &part.measure_contents[0].voices[0];
    let event = &voice.sequence.events[0];
    let note = match &event.content {
        RhythmicContentV1::Notes { notes } => &notes[0],
        _ => panic!("fixture notes"),
    };
    let mut metadata = document.metadata.clone();
    metadata.title = "dispatch metadata".into();
    let mut pitch = note.written_pitch.clone();
    pitch.octave = SafeInteger::new(5).unwrap();
    let mut inserted = raw_part("inserted-part");
    // Admission intentionally permits descendant IDs reused until final semantics.
    let mut staff = inserted.staves[0].clone();
    staff.id = "inserted-staff".into();
    let mut raw_voice = inserted.measure_contents[0].voices[0].clone();
    raw_voice.id = "inserted-voice".into();
    raw_voice.sequence.events.clear();
    let mut notes_event = event.clone();
    notes_event.id = id("inserted-notes-event");
    let mut rest_event = event.clone();
    rest_event.id = id("inserted-rest-event");
    rest_event.content = RhythmicContentV1::Rest;
    let mut contents = Vec::new();
    for (index, part) in document.parts.iter().enumerate() {
        let mut voice = raw_voice.clone();
        voice.id = format!("measure-inserted-voice-{index}").into();
        voice.default_staff_id = part.staves[0].id.as_js_string().clone();
        contents.push(InsertMeasurePartContentV1 {
            part_id: part.id.as_js_string().clone(),
            voices: vec![voice],
        });
    }
    inserted.measure_contents.reverse();
    vec![
        Command::DocumentSetMetadata {
            target: Target::Document {
                document_id: document.id.clone(),
            },
            metadata,
        },
        Command::NoteSetWrittenPitch {
            target: Target::Note {
                note_id: note.id.clone(),
            },
            written_pitch: pitch,
        },
        Command::EventSetNoteValue {
            target: Target::Event {
                event_id: event.id.clone(),
            },
            note_value: event.duration.clone(),
        },
        Command::VoiceInsertNotesEvent {
            target: Target::Voice {
                voice_id: voice.id.clone(),
            },
            anchor: SequenceAnchorV1::Start,
            event: notes_event,
        },
        Command::VoiceInsertRestEvent {
            target: Target::Voice {
                voice_id: voice.id.clone(),
            },
            anchor: SequenceAnchorV1::Start,
            event: rest_event,
        },
        Command::EventRemove {
            target: Target::Event {
                event_id: event.id.clone(),
            },
        },
        Command::MeasureInsert {
            target: Target::Document {
                document_id: document.id.clone(),
            },
            anchor: MeasureAnchorV1::Start,
            definition: AdmissionMeasureDefinitionV1 {
                id: "inserted-measure".into(),
                meter: document.measure_definitions[0].meter.clone(),
                pickup_duration: None,
            },
            contents,
        },
        Command::MeasureRemove {
            target: Target::Measure {
                measure_id: document.measure_definitions[0].id.clone(),
            },
        },
        Command::MeasureMove {
            target: Target::Measure {
                measure_id: document.measure_definitions[1].id.clone(),
            },
            anchor: MeasureAnchorV1::Start,
        },
        Command::MeasureSetDefinition {
            target: Target::Measure {
                measure_id: document.measure_definitions[0].id.clone(),
            },
            meter: document.measure_definitions[0].meter.clone(),
            pickup: MeasurePickupV1::None,
        },
        Command::PartInsert {
            target: Target::Document {
                document_id: document.id.clone(),
            },
            anchor: PartAnchorV1::Start,
            part: inserted,
        },
        Command::PartRemove {
            target: Target::Part {
                part_id: part.id.clone(),
            },
        },
        Command::PartMove {
            target: Target::Part {
                part_id: document.parts[1].id.clone(),
            },
            anchor: PartAnchorV1::Start,
        },
        Command::PartSetName {
            target: Target::Part {
                part_id: part.id.clone(),
            },
            name: "dispatch name".into(),
        },
        Command::PartSetInstrument {
            target: Target::Part {
                part_id: part.id.clone(),
            },
            instrument: part.instrument.clone(),
        },
        Command::StaffInsert {
            target: Target::Part {
                part_id: part.id.clone(),
            },
            anchor: StaffAnchorV1::Start,
            staff,
        },
        Command::StaffRemove {
            target: Target::Staff {
                staff_id: id("unused-staff"),
            },
        },
        Command::StaffMove {
            target: Target::Staff {
                staff_id: id("unused-staff"),
            },
            anchor: StaffAnchorV1::Start,
        },
        Command::StaffSetDefinition {
            target: Target::Staff {
                staff_id: part.staves[0].id.clone(),
            },
            line_count: SafeInteger::new(7).unwrap(),
            default_clef: part.staves[0].default_clef.clone(),
        },
        Command::VoiceInsert {
            target: Target::Part {
                part_id: part.id.clone(),
            },
            measure_id: part.measure_contents[0].measure_id.as_js_string().clone(),
            anchor: VoiceAnchorV1::Start,
            voice: raw_voice,
        },
        Command::VoiceRemove {
            target: Target::Voice {
                voice_id: voice.id.clone(),
            },
        },
        Command::VoiceMove {
            target: Target::Voice {
                voice_id: voice.id.clone(),
            },
            anchor: VoiceAnchorV1::Start,
        },
        Command::VoiceSetDefaultStaff {
            target: Target::Voice {
                voice_id: voice.id.clone(),
            },
            staff_id: "unused-staff".into(),
        },
        Command::VoiceSetSequenceStart {
            target: Target::Voice {
                voice_id: voice.id.clone(),
            },
            start: voice.sequence.start.clone(),
        },
        Command::EventSetStaffAssignment {
            target: Target::Event {
                event_id: event.id.clone(),
            },
            assignment: EventStaffAssignmentV1::Staff {
                staff_id: "unused-staff".into(),
            },
        },
        Command::RangeDelete {
            target: Target::Document {
                document_id: document.id.clone(),
            },
            range: event_range(document),
        },
        Command::RangeTransposeWrittenPitch {
            target: Target::Document {
                document_id: document.id.clone(),
            },
            range: event_range(document),
            transposition: TranspositionV1 {
                diatonic_steps: SafeInteger::new(0).unwrap(),
                chromatic_semitones: SafeInteger::new(0).unwrap(),
            },
        },
    ]
}

#[test]
fn every_leaf_variant_has_a_dispatch_route_and_consistent_command_facts() {
    let initial = document();
    let store = build_live_score_store(&initial).unwrap();
    let cases = commands(&initial);
    assert_eq!(cases.len(), 27);
    for command in cases {
        let command_id = command.command_id();
        let mut recorder = Recorder::new(Candidate::new(
            TransactionOverlayV1::new(&store),
            initial.id.clone(),
        ));
        let facts = recorder
            .dispatch_leaf(command)
            .unwrap_or_else(|error| panic!("{command_id:?}: {error:?}"));
        assert_eq!(facts.command_id, command_id);
        if facts.changed {
            assert!(facts.effect_count > 0);
            assert!(!facts.affected.is_empty());
        } else {
            assert_eq!(facts.effect_count, 0);
            assert!(facts.affected.is_empty());
            assert!(recorder.steps.is_empty());
        }
        assert_eq!(store.export_document().unwrap(), initial);
    }
}

#[test]
fn effective_staff_noop_preserves_raw_assignment_and_never_reserves() {
    let mut initial = document();
    let voice = &mut initial.parts[0].measure_contents[0].voices[0];
    let event_id = voice.sequence.events[0].id.clone();
    voice.sequence.events[0].staff_id = Some(voice.default_staff_id.clone());
    let store = build_live_score_store(&initial).unwrap();
    let mut recorder = Recorder::new(Candidate::new(
        TransactionOverlayV1::new(&store),
        initial.id.clone(),
    ));
    recorder.candidate.reservation = Reservation::fail_at(1);
    let facts = recorder
        .dispatch_leaf(Command::EventSetStaffAssignment {
            target: Target::Event {
                event_id: event_id.clone(),
            },
            assignment: EventStaffAssignmentV1::InheritDefault,
        })
        .unwrap();
    assert!(!facts.changed);
    assert_eq!(facts.effect_count, 0);
    assert!(facts.affected.is_empty());
    assert_eq!(recorder.candidate.reservation.attempts, 0);
    let event = recorder
        .candidate
        .resolve(Kind::Event, event_id.as_js_string())
        .unwrap();
    assert_eq!(
        recorder.candidate.read_staff_reference(&event).unwrap(),
        Some(
            initial.parts[0].measure_contents[0].voices[0]
                .default_staff_id
                .as_js_string()
                .clone()
        )
    );
}

#[test]
fn target_mismatch_and_batch_are_explicit_terminal_failures() {
    let initial = document();
    let store = build_live_score_store(&initial).unwrap();
    for (command, expected) in [
        (
            Command::PartSetName {
                target: Target::Document {
                    document_id: initial.id.clone(),
                },
                name: "name".into(),
            },
            Failure::TargetMismatch,
        ),
        (
            Command::TransactionBatch {
                target: Target::Document {
                    document_id: initial.id.clone(),
                },
                commands: Vec::new(),
            },
            Failure::InternalError,
        ),
    ] {
        let mut recorder = Recorder::new(Candidate::new(
            TransactionOverlayV1::new(&store),
            initial.id.clone(),
        ));
        assert_eq!(
            recorder.dispatch_leaf(command).err(),
            Some(AdmissionCommandFailure::Leaf(expected))
        );
        assert!(recorder.candidate.reservation.ensure_active().is_err());
        assert!(recorder.steps.is_empty());
    }
}

#[test]
fn changed_commands_return_real_facts_even_when_the_batch_returns_to_its_start() {
    let initial = document();
    let store = build_live_score_store(&initial).unwrap();
    let part = &initial.parts[0];
    let mut recorder = Recorder::new(Candidate::new(
        TransactionOverlayV1::new(&store),
        initial.id.clone(),
    ));
    for name in [JsString::from("temporary name"), part.name.clone()] {
        let LeafFacts {
            changed,
            effect_count,
            affected,
            ..
        } = recorder
            .dispatch_leaf(Command::PartSetName {
                target: Target::Part {
                    part_id: part.id.clone(),
                },
                name,
            })
            .unwrap();
        assert!(changed);
        assert_eq!(effect_count, 1);
        assert_eq!(
            affected,
            vec![Target::Part {
                part_id: part.id.as_js_string().clone().into()
            }]
        );
    }
    assert_eq!(recorder.steps.len(), 2);
}

#[test]
fn measure_move_effect_count_distinguishes_local_movement_from_extra_normalization() {
    for shuffled in [false, true] {
        let mut initial = document();
        let global: Vec<_> = initial
            .measure_definitions
            .iter()
            .map(|value| value.id.clone())
            .collect();
        for part in &mut initial.parts {
            part.measure_contents.sort_by_key(|content| {
                global
                    .iter()
                    .position(|id| id == &content.measure_id)
                    .unwrap()
            });
        }
        // With only two measures every move also aligns the whole list. Add a
        // third measure so moving the already-first target leaves another pair
        // shuffled and requires the distinct TS reorder effect.
        let mut definition = initial.measure_definitions[0].clone();
        definition.id = id("third-measure");
        initial.measure_definitions.push(definition);
        for (p, part) in initial.parts.iter_mut().enumerate() {
            let mut content = part.measure_contents[0].clone();
            content.measure_id = id("third-measure");
            content.voices.truncate(1);
            content.voices[0].id = id(format!("third-voice-{p}"));
            content.voices[0].sequence.events.clear();
            part.measure_contents.push(content);
        }
        if shuffled {
            initial.parts[1].measure_contents.swap(1, 2);
        }
        let store = build_live_score_store(&initial).unwrap();
        let mut recorder = Recorder::new(Candidate::new(
            TransactionOverlayV1::new(&store),
            initial.id.clone(),
        ));
        let facts = recorder
            .dispatch_leaf(Command::MeasureMove {
                target: Target::Measure {
                    measure_id: initial.measure_definitions[0].id.clone(),
                },
                anchor: MeasureAnchorV1::Start,
            })
            .unwrap();
        assert_eq!(facts.command_id, CommandId::MeasureMove);
        assert_eq!(facts.changed, shuffled);
        assert_eq!(facts.effect_count, if shuffled { 2 } else { 0 });
        if shuffled {
            assert_eq!(
                facts.affected,
                vec![
                    Target::Measure {
                        measure_id: initial.measure_definitions[0]
                            .id
                            .as_js_string()
                            .clone()
                            .into()
                    },
                    Target::Part {
                        part_id: initial.parts[0].id.as_js_string().clone().into()
                    },
                    Target::Part {
                        part_id: initial.parts[1].id.as_js_string().clone().into()
                    }
                ]
            );
        }
    }
}

#[test]
fn every_dispatch_reservation_failure_is_terminal_including_fact_capture() {
    let initial = document();
    let store = build_live_score_store(&initial).unwrap();
    let command = Command::PartSetName {
        target: Target::Part {
            part_id: initial.parts[0].id.clone(),
        },
        name: "changed".into(),
    };
    let mut baseline = Recorder::new(Candidate::new(
        TransactionOverlayV1::new(&store),
        initial.id.clone(),
    ));
    baseline.dispatch_leaf(command.clone()).unwrap();
    let count = baseline.candidate.reservation.attempts;
    assert!(count > 0);
    for at in 1..=count {
        let mut recorder = Recorder::new(Candidate::new(
            TransactionOverlayV1::new(&store),
            initial.id.clone(),
        ));
        recorder.candidate.reservation = Reservation::fail_at(at);
        assert_eq!(
            recorder.dispatch_leaf(command.clone()).err(),
            Some(AdmissionCommandFailure::Leaf(Failure::InternalError))
        );
        assert_eq!(recorder.candidate.reservation.attempts, at);
        assert!(recorder.candidate.reservation.ensure_active().is_err());
        assert_eq!(store.export_document().unwrap(), initial);
    }
}
