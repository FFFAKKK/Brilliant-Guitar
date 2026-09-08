use super::*;
use brilliant_score_foundation::{FractionV1, PitchStepV1};

#[test]
fn prefix_field_overrides_and_event_reorder_adopt_exact_values_and_rebuilt_indices() {
    let mut document = fixture();
    // Two distinct half notes make the later reorder observable without
    // introducing an invalid initial duration or duplicate note identities.
    let sequence = &mut document.parts[0].measure_contents[0].voices[0].sequence;
    sequence.events[0].duration.base = SafeInteger::new(2).unwrap();
    let mut second = sequence.events[0].clone();
    second.id = id("event-b");
    second.content = RhythmicContentV1::Rest;
    second.staff_id = None;
    sequence.events.push(second);
    let mut store = build_live_score_store(&document).unwrap();
    let initial_handles = store.indices.entity.by_id.clone();

    let mut expected = document.clone();
    expected.metadata.title = "All candidate field overrides".into();
    expected.measure_definitions[1].meter.numerator = SafeInteger::new(3).unwrap();
    expected.parts[0].name = "Transposing part".into();
    expected.parts[0].instrument.name = "Transposing instrument".into();
    expected.parts[0]
        .instrument
        .written_to_sounding
        .diatonic_steps = SafeInteger::new(1).unwrap();
    expected.parts[0]
        .instrument
        .written_to_sounding
        .chromatic_semitones = SafeInteger::new(2).unwrap();
    expected.parts[0].staves[1].line_count = SafeInteger::new(6).unwrap();
    expected.parts[0].staves[1].default_clef.line = SafeInteger::new(3).unwrap();
    let voice = &mut expected.parts[0].measure_contents[0].voices[0];
    voice.default_staff_id = id("staff-z");
    voice.sequence.start = FractionV1 {
        numerator: SafeInteger::new(1).unwrap(),
        denominator: SafeInteger::new(4).unwrap(),
    };
    for event in &mut voice.sequence.events {
        event.duration.base = SafeInteger::new(4).unwrap();
    }
    voice.sequence.events[0].staff_id = None;
    voice.sequence.events[1].staff_id = Some(id("staff-a"));
    let RhythmicContentV1::Notes { notes } = &mut voice.sequence.events[0].content else {
        panic!("fixture chord");
    };
    notes[0].written_pitch.step = PitchStepV1::D;
    notes[0].written_pitch.alter = SafeInteger::new(1).unwrap();
    notes[0].written_pitch.octave = SafeInteger::new(5).unwrap();
    let pitch = notes[0].written_pitch.clone();
    voice.sequence.events.swap(0, 1);

    let mut candidate = Candidate::new(TransactionOverlayV1::new(&store), document.id.clone());
    let mut operations = 0;
    let part = &expected.parts[0];
    let measure = &expected.measure_definitions[1];
    let voice = &part.measure_contents[0].voices[0];
    let values = [
        (
            Kind::Document,
            "score-root",
            Value::DocumentMetadata(expected.metadata.clone()),
        ),
        (
            Kind::Measure,
            "measure-a",
            Value::MeasureDefinition {
                meter: measure.meter.clone(),
                pickup_duration: measure.pickup_duration.clone(),
            },
        ),
        (Kind::Part, "part-z", Value::PartName(part.name.clone())),
        (
            Kind::Staff,
            "staff-a",
            Value::StaffDefinition {
                line_count: part.staves[1].line_count,
                default_clef: part.staves[1].default_clef.clone(),
            },
        ),
        (
            Kind::Voice,
            "voice-a",
            Value::VoiceSequenceStart(voice.sequence.start.clone()),
        ),
        (
            Kind::Event,
            "event-a",
            Value::EventNoteValue(voice.sequence.events[1].duration.clone()),
        ),
        (
            Kind::Event,
            "event-b",
            Value::EventNoteValue(voice.sequence.events[0].duration.clone()),
        ),
        (Kind::Note, "note-a", Value::NoteWrittenPitch(pitch)),
    ];
    for (kind, name, value) in values {
        let source = candidate.resolve(kind, &name.into()).unwrap();
        assert!(
            candidate.replace_value(&source, value).unwrap(),
            "real change to {name}"
        );
        operations += 1;
    }
    let part_source = candidate.resolve(Kind::Part, &"part-z".into()).unwrap();
    assert!(
        candidate
            .replace_instrument(&part_source, part.instrument.clone())
            .unwrap()
    );
    operations += 1;
    for (kind, name, staff) in [
        (Kind::Voice, "voice-a", Some(JsString::from("staff-z"))),
        (Kind::Event, "event-a", None),
        (Kind::Event, "event-b", Some(JsString::from("staff-a"))),
    ] {
        let source = candidate.resolve(kind, &name.into()).unwrap();
        assert!(candidate.replace_staff_reference(&source, staff).unwrap());
        operations += 1;
    }
    let source = candidate.resolve(Kind::Voice, &"voice-a".into()).unwrap();
    candidate
        .move_child(
            &CandidateOrder::new(&source, Children::Events),
            &"event-b".into(),
            None,
        )
        .unwrap();
    operations += 1;
    assert_eq!(operations, 13);

    let (plan, prefix_history) = candidate
        .validate_final()
        .unwrap()
        .prepare_commit(&store, DocumentVersionV1::initial(), operations)
        .unwrap();
    assert!(prefix_history.forward.is_empty());
    assert_eq!(store.export_document().unwrap(), document);
    let mut version = DocumentVersionV1::initial();
    let mut metrics = KernelStage3MetricsV1::default();
    plan.unwrap()
        .commit(&mut store, &mut version, &mut metrics)
        .unwrap();
    assert_eq!(store.export_document().unwrap(), expected);
    assert_eq!(store.indices.entity.by_id, initial_handles);
    assert_eq!(version.get(), 1);
    assert_eq!(metrics.change_ops, operations);
    assert_eq!(
        CoreBaseReadV1::read_voice_time(&store, &id("voice-a")).unwrap(),
        [id("event-b"), id("event-a")]
    );
    assert_indices(&store);
}

#[test]
fn empty_candidate_with_zero_actual_operations_produces_no_plan() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    let initial_handles = store.indices.entity.by_id.clone();
    let candidate = Candidate::new(TransactionOverlayV1::new(&store), document.id.clone());
    let (plan, history) = candidate
        .validate_final()
        .unwrap()
        .prepare_commit(&store, DocumentVersionV1::initial(), 0)
        .unwrap();
    assert!(plan.is_none());
    assert!(history.forward.is_empty());
    assert_eq!(store.export_document().unwrap(), document);
    assert_eq!(store.indices.entity.by_id, initial_handles);
    assert_indices(&store);
}
