use super::super::range::RangePreparationFailure;
use super::*;
use brilliant_kernel_contracts::{
    MeasurePointKindV1, MeasurePointV1, PartMeasurePointKindV1, PartMeasurePointV1,
    PitchTranspositionErrorV1, ScoreRangeV1, VoiceEventPointKindV1, VoiceEventPointV1,
};
use brilliant_score_foundation::{PitchStepV1, ScoreNoteV1, TranspositionV1, WrittenPitchV1};

fn transpose(steps: i64, semitones: i64) -> TranspositionV1 {
    TranspositionV1 {
        diatonic_steps: SafeInteger::new(steps).unwrap(),
        chromatic_semitones: SafeInteger::new(semitones).unwrap(),
    }
}
fn measures(first: &str, last: &str) -> ScoreRangeV1 {
    ScoreRangeV1::MeasureRange {
        start: MeasurePointV1 {
            kind: MeasurePointKindV1::Measure,
            measure_id: id(first),
        },
        end: MeasurePointV1 {
            kind: MeasurePointKindV1::Measure,
            measure_id: id(last),
        },
    }
}
fn part_measure(measure: &str) -> ScoreRangeV1 {
    let point = PartMeasurePointV1 {
        kind: PartMeasurePointKindV1::PartMeasure,
        part_id: id("part-z"),
        measure_id: id(measure),
    };
    ScoreRangeV1::PartMeasureRange {
        start: point.clone(),
        end: point,
    }
}
fn event_range(event: &str) -> ScoreRangeV1 {
    let point = VoiceEventPointV1 {
        kind: VoiceEventPointKindV1::VoiceEvent,
        voice_id: id("voice-a"),
        event_id: id(event),
    };
    ScoreRangeV1::VoiceEventRange {
        start: point.clone(),
        end: point,
    }
}
fn upper_pitch() -> WrittenPitchV1 {
    WrittenPitchV1 {
        step: PitchStepV1::B,
        alter: SafeInteger::new(0).unwrap(),
        octave: SafeInteger::new(8).unwrap(),
    }
}

#[test]
fn a_later_pitch_failure_precedes_effect_writes_and_keeps_the_first_pitch_unchanged() {
    let mut document = fixture();
    let event = &mut document.parts[0].measure_contents[0].voices[0]
        .sequence
        .events[0];
    let RhythmicContentV1::Notes { notes } = &mut event.content else {
        panic!("notes");
    };
    notes.push(ScoreNoteV1 {
        id: id("late-note"),
        written_pitch: upper_pitch(),
    });
    let store = build_live_score_store(&document).unwrap();
    for range in [
        part_measure("measure-a"),
        measures("measure-a", "measure-a"),
        event_range("event-a"),
    ] {
        let mut recorder = Recorder::new(Candidate::new(
            TransactionOverlayV1::new(&store),
            document.id.clone(),
        ));
        let first = recorder
            .candidate
            .resolve(Kind::Note, &"note-a".into())
            .unwrap();
        let pitch = recorder.candidate.read_value(&first);
        assert_eq!(
            recorder.transpose_range_command(document.id.as_js_string(), &range, &transpose(1, 2)),
            Err(RangePreparationFailure::Transform {
                note_id: "late-note".into(),
                reason: PitchTranspositionErrorV1::DerivedPitchOctaveOutOfRange
            })
        );
        assert_eq!(recorder.candidate.read_value(&first), pitch);
        assert!(recorder.steps.is_empty());
        assert!(recorder.candidate.reservation.ensure_active().is_err());
        assert_eq!(store.export_document().unwrap(), document);
    }
}

#[test]
fn raw_note_errors_preserve_empty_ids_and_transform_failure_precedes_duplicate_effect_target() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    for (empty, invalid_pitch) in [(true, true), (false, true), (false, false)] {
        let mut recorder = Recorder::new(Candidate::new(
            TransactionOverlayV1::new(&store),
            document.id.clone(),
        ));
        let voice = recorder
            .candidate
            .resolve(Kind::Voice, &"voice-a".into())
            .unwrap();
        let mut event = raw_part("unused")
            .measure_contents
            .remove(0)
            .voices
            .remove(0)
            .sequence
            .events
            .remove(0);
        event.id = "inserted-event".into();
        let RhythmicContentV1::Notes { notes } = &mut event.content else {
            panic!("notes");
        };
        if empty {
            notes[0].id = "unique-first".into();
        }
        let late_id = if empty { "" } else { "late-note" };
        notes.push(ScoreNoteV1 {
            id: late_id.into(),
            written_pitch: if invalid_pitch {
                upper_pitch()
            } else {
                notes[0].written_pitch.clone()
            },
        });
        recorder.insert_event(&voice, event, None).unwrap();
        let before = recorder.steps.len();
        let result = recorder.transpose_range_command(
            document.id.as_js_string(),
            &event_range("inserted-event"),
            &transpose(1, 2),
        );
        if invalid_pitch {
            assert_eq!(
                result,
                Err(RangePreparationFailure::Transform {
                    note_id: late_id.into(),
                    reason: PitchTranspositionErrorV1::DerivedPitchOctaveOutOfRange
                })
            );
        } else {
            assert_eq!(
                result,
                Err(RangePreparationFailure::Command(Failure::InternalError))
            );
        }
        assert_eq!(recorder.steps.len(), before);
        assert!(recorder.candidate.reservation.ensure_active().is_err());
        assert_eq!(store.export_document().unwrap(), document);
    }
}

#[test]
fn zero_and_rest_only_transposition_are_noops_only_after_valid_target_and_range() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    for (target, range, expected) in [
        (
            "missing",
            measures("missing", "measure-a"),
            Failure::TargetNotFound,
        ),
        (
            "score-root",
            measures("missing", "measure-a"),
            Failure::RangeEndpointNotFound,
        ),
    ] {
        let mut recorder = Recorder::new(Candidate::new(
            TransactionOverlayV1::new(&store),
            document.id.clone(),
        ));
        assert_eq!(
            recorder.transpose_range_command(&target.into(), &range, &transpose(0, 0)),
            Err(RangePreparationFailure::Command(expected))
        );
        assert!(recorder.steps.is_empty());
    }
    for (range, transposition) in [
        (part_measure("measure-a"), transpose(0, 0)),
        (part_measure("measure-z"), transpose(1, 2)),
    ] {
        let mut recorder = Recorder::new(Candidate::new(
            TransactionOverlayV1::new(&store),
            document.id.clone(),
        ));
        assert_eq!(
            recorder.transpose_range_command(document.id.as_js_string(), &range, &transposition),
            Ok(false)
        );
        assert!(recorder.steps.is_empty());
        assert!(recorder.candidate.reservation.ensure_active().is_ok());
    }
}

#[test]
fn part_range_deletion_retains_empty_voices_and_second_delete_is_noop() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    let mut recorder = Recorder::new(Candidate::new(
        TransactionOverlayV1::new(&store),
        document.id.clone(),
    ));
    let range = part_measure("measure-a");
    assert_eq!(
        recorder.delete_range_command(document.id.as_js_string(), &range),
        Ok(true)
    );
    let voice = recorder
        .candidate
        .resolve(Kind::Voice, &"voice-a".into())
        .unwrap();
    assert!(recorder.candidate.visible(&voice));
    let start = recorder.candidate.read_value(&voice);
    let staff = recorder.candidate.read_staff_reference(&voice);
    assert_eq!(
        recorder.delete_range_command(document.id.as_js_string(), &range),
        Ok(false)
    );
    assert_eq!(recorder.steps.len(), 1);
    assert_eq!(recorder.candidate.read_value(&voice), start);
    assert_eq!(recorder.candidate.read_staff_reference(&voice), staff);
    let (mut candidate, journal) = recorder.finish().unwrap();
    journal.replay(&mut candidate, Direction::Inverse).unwrap();
    candidate.resolve(Kind::Event, &"event-a".into()).unwrap();
    journal.replay(&mut candidate, Direction::Forward).unwrap();
    assert_eq!(
        candidate.resolve(Kind::Event, &"event-a".into()),
        Err(Failure::TargetNotFound)
    );
    candidate.validate_final().unwrap();
    assert_eq!(store.export_document().unwrap(), document);
}

#[test]
fn range_transform_then_delete_replays_without_recomputing_inverse_pitches() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    let mut recorder = Recorder::new(Candidate::new(
        TransactionOverlayV1::new(&store),
        document.id.clone(),
    ));
    let range = part_measure("measure-a");
    assert_eq!(
        recorder.transpose_range_command(document.id.as_js_string(), &range, &transpose(1, 2)),
        Ok(true)
    );
    assert_eq!(
        recorder.delete_range_command(document.id.as_js_string(), &range),
        Ok(true)
    );
    let (mut candidate, journal) = recorder.finish().unwrap();
    for _ in 0..2 {
        journal.replay(&mut candidate, Direction::Inverse).unwrap();
        let note = candidate.resolve(Kind::Note, &"note-a".into()).unwrap();
        let Value::NoteWrittenPitch(pitch) = candidate.read_value(&note).unwrap() else {
            panic!("pitch");
        };
        assert_eq!(pitch.step, PitchStepV1::C);
        assert_eq!(pitch.octave.get(), 4);
        journal.replay(&mut candidate, Direction::Forward).unwrap();
        assert_eq!(
            candidate.resolve(Kind::Note, &"note-a".into()),
            Err(Failure::TargetNotFound)
        );
    }
    candidate.validate_final().unwrap();
}

#[test]
fn every_range_record_and_replay_reservation_failure_is_terminal() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    let exercise = |recorder: &mut Recorder<'_>, mode| match mode {
        0 => recorder.delete_range_command(
            document.id.as_js_string(),
            &measures("measure-a", "measure-a"),
        ),
        1 => recorder.delete_range_command(document.id.as_js_string(), &part_measure("measure-a")),
        _ => recorder.transpose_range_command(
            document.id.as_js_string(),
            &event_range("event-a"),
            &transpose(1, 2),
        ),
    };
    for mode in 0..3 {
        let mut baseline = Recorder::new(Candidate::new(
            TransactionOverlayV1::new(&store),
            document.id.clone(),
        ));
        exercise(&mut baseline, mode).unwrap();
        let attempts = baseline.candidate.reservation.attempts;
        let (_, journal) = baseline.finish().unwrap();
        for at in 1..=attempts {
            let mut recorder = Recorder::new(Candidate::new(
                TransactionOverlayV1::new(&store),
                document.id.clone(),
            ));
            recorder.candidate.reservation = Reservation::fail_at(at);
            assert_eq!(
                exercise(&mut recorder, mode),
                Err(RangePreparationFailure::Command(Failure::InternalError)),
                "mode {mode}, record {at}"
            );
            assert!(recorder.candidate.reservation.ensure_active().is_err());
            assert_eq!(store.export_document().unwrap(), document);
        }
        for inverse in [false, true] {
            let create = || {
                let mut candidate =
                    Candidate::new(TransactionOverlayV1::new(&store), document.id.clone());
                if inverse {
                    journal.replay(&mut candidate, Direction::Forward).unwrap();
                }
                candidate.reservation = Reservation::default();
                candidate
            };
            let direction = || {
                if inverse {
                    Direction::Inverse
                } else {
                    Direction::Forward
                }
            };
            let mut baseline = create();
            journal.replay(&mut baseline, direction()).unwrap();
            for at in 1..=baseline.reservation.attempts {
                let mut candidate = create();
                candidate.reservation = Reservation::fail_at(at);
                assert_eq!(
                    journal.replay(&mut candidate, direction()),
                    Err(Failure::InternalError)
                );
                assert!(candidate.reservation.ensure_active().is_err());
                assert_eq!(store.export_document().unwrap(), document);
            }
        }
    }
}
