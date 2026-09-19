use super::*;
mod fields;
use crate::{
    candidate::tests::{id, raw_part},
    indices::{normalized_index_projection, rebuild_indices_from_store},
    overlay::ExtensionKeyV1,
    store::{build_live_score_store, tests::fixture},
};
use brilliant_core_types::{FiniteNumber, SafeInteger};
use brilliant_score_foundation::{LosslessDecode, LosslessEncode, PartV1, StaffDefinitionV1};

fn assert_indices(store: &LiveScoreStore) {
    let (rebuilt, _) = rebuild_indices_from_store(store).unwrap();
    assert_eq!(
        normalized_index_projection(store, &store.indices).unwrap(),
        normalized_index_projection(store, &rebuilt).unwrap()
    );
}

fn renamed_part() -> AdmissionPartV1 {
    let mut part = raw_part(JsString::from_utf16(vec![0xd800, 112]));
    let rename =
        |value: &JsString| JsString::from_utf16([&[0xd800, 47][..], value.code_units()].concat());
    for staff in &mut part.staves {
        staff.id = rename(&staff.id);
    }
    for content in &mut part.measure_contents {
        for voice in &mut content.voices {
            voice.id = rename(&voice.id);
            voice.default_staff_id = rename(&voice.default_staff_id);
            for event in &mut voice.sequence.events {
                event.id = rename(&event.id);
                event.staff_id = event.staff_id.as_ref().map(rename);
                if let RhythmicContentV1::Notes { notes } = &mut event.content {
                    for note in notes {
                        note.id = rename(&note.id);
                    }
                }
            }
        }
    }
    part
}

fn strong_part(part: &AdmissionPartV1) -> PartV1 {
    let mut bytes = Vec::new();
    part.write_lossless(&mut bytes).unwrap();
    PartV1::from_lossless_value(
        brilliant_score_foundation::decode_lossless_json(std::str::from_utf8(&bytes).unwrap())
            .unwrap(),
    )
    .unwrap()
}

#[test]
fn inserted_candidate_tree_adopts_lossless_records_topology_and_all_indices() {
    let document = fixture();
    let mut store = build_live_score_store(&document).unwrap();
    let payload = renamed_part();
    let mut expected = document.clone();
    expected.parts.insert(0, strong_part(&payload));
    let mut candidate = Candidate::new(TransactionOverlayV1::new(&store), document.id.clone());
    candidate.insert_part(payload, None).unwrap();
    let (plan, prefix) = candidate
        .validate_final()
        .unwrap()
        .prepare_commit(&store, DocumentVersionV1::initial(), 1)
        .unwrap();
    assert!(prefix.forward.is_empty());
    assert_eq!(store.export_document().unwrap(), document);
    let mut version = DocumentVersionV1::initial();
    let mut metrics = KernelStage3MetricsV1::default();
    plan.unwrap()
        .commit(&mut store, &mut version, &mut metrics)
        .unwrap();
    assert_eq!(store.export_document().unwrap(), expected);
    assert_eq!(version.get(), 1);
    assert_eq!(metrics.full_document_scans, 1);
    assert_eq!(metrics.full_semantic_validations, 1);
    assert_eq!(metrics.full_document_clones, 0);
    assert_eq!(metrics.full_snapshot_materializations, 0);
    assert_indices(&store);
}

#[test]
fn invalid_frozen_prefix_can_be_repaired_and_its_extension_history_is_preserved() {
    let document = fixture();
    let mut store = build_live_score_store(&document).unwrap();
    let mut expected = document.clone();
    expected.extensions[0].schema_version = SafeInteger::new(9).unwrap();
    expected.metadata.title = "repaired".into();
    let mut prefix = TransactionOverlayV1::new(&store);
    let mut invalid = document.metadata.clone();
    invalid.tempo.bpm = FiniteNumber::new(0.0).unwrap();
    prefix
        .replace_scalar(
            Scalar::DocumentMetadata {
                document_id: document.id.clone(),
            },
            Value::DocumentMetadata(invalid),
        )
        .unwrap();
    prefix
        .replace_extension(
            ExtensionKeyV1::from_block(&document.extensions[0]),
            expected.extensions[0].clone(),
        )
        .unwrap();
    let mut candidate = Candidate::new(prefix, document.id.clone());
    candidate
        .replace_value(
            &candidate.document.clone(),
            Value::DocumentMetadata(expected.metadata.clone()),
        )
        .unwrap();
    let owner = candidate.resolve(Kind::Part, &"part-z".into()).unwrap();
    let transient = candidate
        .insert_staff(
            &owner,
            StaffDefinitionV1 {
                id: "".into(),
                line_count: SafeInteger::new(0).unwrap(),
                default_clef: document.parts[0].staves[0].default_clef.clone(),
            },
            None,
        )
        .unwrap();
    candidate.hide(&transient).unwrap();
    let (plan, prefix_history) = candidate
        .validate_final()
        .unwrap()
        .prepare_commit(&store, DocumentVersionV1::initial(), 3)
        .unwrap();
    assert_eq!(prefix_history.forward.len(), 2);
    let mut version = DocumentVersionV1::initial();
    let mut metrics = KernelStage3MetricsV1::default();
    plan.unwrap()
        .commit(&mut store, &mut version, &mut metrics)
        .unwrap();
    assert_eq!(metrics.change_ops, 5);
    assert_eq!(store.export_document().unwrap(), expected);
    assert_indices(&store);
}

#[test]
fn same_id_part_rebirth_replaces_every_old_handle_even_with_identical_final_values() {
    let document = fixture();
    let mut store = build_live_score_store(&document).unwrap();
    let old_entities = store.indices.entity.by_id.clone();
    let mut candidate = Candidate::new(TransactionOverlayV1::new(&store), document.id.clone());
    let old = candidate.resolve(Kind::Part, &"part-z".into()).unwrap();
    candidate.hide(&old).unwrap();
    candidate.insert_part(raw_part("part-z"), None).unwrap();
    let (plan, _) = candidate
        .validate_final()
        .unwrap()
        .prepare_commit(&store, DocumentVersionV1::initial(), 2)
        .unwrap();
    let mut version = DocumentVersionV1::initial();
    plan.unwrap()
        .commit(
            &mut store,
            &mut version,
            &mut KernelStage3MetricsV1::default(),
        )
        .unwrap();
    assert_eq!(store.export_document().unwrap(), document);
    for name in [
        "part-z", "staff-z", "staff-a", "voice-a", "voice-z", "event-a", "event-z", "note-a",
    ] {
        assert_ne!(
            store.indices.entity.by_id[&id(name)],
            old_entities[&id(name)],
            "new lifetime for {name}"
        );
    }
    assert_eq!(
        store.indices.entity.by_id[&id("measure-z")],
        old_entities[&id("measure-z")]
    );
    assert_indices(&store);
}

#[test]
fn prefix_subtree_removal_updates_descendant_references_and_time_indices() {
    let document = fixture();
    let mut expected = document.clone();
    expected.parts[0].measure_contents[0].voices[0]
        .sequence
        .events
        .clear();
    let mut store = build_live_score_store(&document).unwrap();
    let mut candidate = Candidate::new(TransactionOverlayV1::new(&store), document.id.clone());
    let event = candidate.resolve(Kind::Event, &"event-a".into()).unwrap();
    candidate.hide(&event).unwrap();
    let (plan, _) = candidate
        .validate_final()
        .unwrap()
        .prepare_commit(&store, DocumentVersionV1::initial(), 1)
        .unwrap();
    let mut version = DocumentVersionV1::initial();
    plan.unwrap()
        .commit(
            &mut store,
            &mut version,
            &mut KernelStage3MetricsV1::default(),
        )
        .unwrap();
    assert_eq!(store.export_document().unwrap(), expected);
    assert_indices(&store);
}

#[test]
fn dead_duplicate_and_empty_temporary_ids_do_not_become_physical_records() {
    let document = fixture();
    let mut store = build_live_score_store(&document).unwrap();
    let original_handles = store.indices.entity.by_id.clone();
    let mut candidate = Candidate::new(TransactionOverlayV1::new(&store), document.id.clone());
    let transient = candidate.insert_part(raw_part(""), None).unwrap();
    candidate.hide(&transient).unwrap();
    let (plan, history) = candidate
        .validate_final()
        .unwrap()
        .prepare_commit(&store, DocumentVersionV1::initial(), 2)
        .unwrap();
    assert!(history.forward.is_empty());
    let mut version = DocumentVersionV1::initial();
    let mut metrics = KernelStage3MetricsV1::default();
    plan.unwrap()
        .commit(&mut store, &mut version, &mut metrics)
        .unwrap();
    assert_eq!(version.get(), 1);
    assert_eq!(metrics.change_ops, 2);
    assert_eq!(store.export_document().unwrap(), document);
    assert_eq!(store.indices.entity.by_id, original_handles);
    assert_indices(&store);
}

#[test]
fn invalid_or_poisoned_candidates_never_produce_a_stable_final_view() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    let mut candidate = Candidate::new(TransactionOverlayV1::new(&store), document.id.clone());
    candidate.insert_part(raw_part(""), None).unwrap();
    assert!(
        matches!(candidate.validate_final(), Err(FinalizationFailure::Command(Failure::SemanticInvalid { diagnostics })) if !diagnostics.is_empty())
    );
    let mut candidate = Candidate::new(TransactionOverlayV1::new(&store), document.id.clone());
    candidate.reservation.abort();
    assert!(matches!(
        candidate.validate_final(),
        Err(FinalizationFailure::Assessment(
            AssessmentFailureV1::InternalCapacity
        ))
    ));
    let mut candidate = Candidate::new(TransactionOverlayV1::new(&store), document.id.clone());
    candidate
        .replace_value(
            &candidate.document.clone(),
            Value::DocumentMetadata({
                let mut value = document.metadata.clone();
                value.title = "changed".into();
                value
            }),
        )
        .unwrap();
    assert!(matches!(
        candidate
            .validate_final()
            .unwrap()
            .prepare_commit(&store, DocumentVersionV1::initial(), 0),
        Err(FinalizationFailure::Preparation(
            TransactionPrepareFailureV1::InvalidChangeSet
        ))
    ));
    assert_eq!(store.export_document().unwrap(), document);
    assert_indices(&store);
}

#[test]
fn stable_scalar_candidate_uses_incremental_validation_without_a_full_scan() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    let mut candidate = Candidate::new(TransactionOverlayV1::new(&store), document.id.clone());
    let mut metadata = document.metadata.clone();
    metadata.title = "incremental candidate".into();
    metadata.tempo.bpm = FiniteNumber::new(96.0).unwrap();
    candidate
        .replace_value(
            &candidate.document.clone(),
            Value::DocumentMetadata(metadata),
        )
        .unwrap();

    let validated = candidate
        .validate_final_with_metrics_against(&store)
        .unwrap();
    let metrics = validated.replay_work();
    assert_eq!(metrics.full_document_scans, 0);
    assert_eq!(metrics.full_semantic_validations, 0);
    assert!(metrics.semantic_rules_evaluated > 0);
    assert_eq!(store.export_document().unwrap(), document);
}

#[test]
fn incremental_candidate_rejection_matches_the_full_foundation_oracle() {
    fn invalid_tempo<'a>(store: &'a LiveScoreStore) -> Candidate<'a> {
        let mut candidate =
            Candidate::new(TransactionOverlayV1::new(store), store.header.id.clone());
        let mut metadata = store.header.metadata.clone();
        metadata.tempo.bpm = FiniteNumber::new(0.0).unwrap();
        candidate
            .replace_value(
                &candidate.document.clone(),
                Value::DocumentMetadata(metadata),
            )
            .unwrap();
        candidate
    }

    fn rejection(
        result: Result<ValidatedCandidate<'_>, (FinalizationFailure, KernelStage3MetricsV1)>,
    ) -> (
        Vec<brilliant_score_foundation::CoreDiagnosticV1>,
        KernelStage3MetricsV1,
    ) {
        let Err((FinalizationFailure::Command(Failure::SemanticInvalid { diagnostics }), work)) =
            result
        else {
            panic!("invalid tempo must be rejected")
        };
        (diagnostics, work)
    }

    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    let (full_diagnostics, full_work) =
        rejection(invalid_tempo(&store).validate_final_with_metrics());
    let (incremental_diagnostics, incremental_work) =
        rejection(invalid_tempo(&store).validate_final_with_metrics_against(&store));

    assert_eq!(incremental_diagnostics, full_diagnostics);
    assert_eq!(full_work.full_semantic_validations, 1);
    assert_eq!(incremental_work.full_semantic_validations, 0);
    assert_eq!(incremental_work.full_document_scans, 0);
    assert!(incremental_work.semantic_rules_evaluated > 0);
}

#[test]
fn stable_missing_staff_reference_matches_the_oracle_and_raw_empty_reference_falls_back() {
    fn missing_staff<'a>(store: &'a LiveScoreStore, id: &str) -> Candidate<'a> {
        let mut candidate =
            Candidate::new(TransactionOverlayV1::new(store), store.header.id.clone());
        let voice = candidate.resolve(Kind::Voice, &"voice-a".into()).unwrap();
        candidate
            .replace_staff_reference(&voice, Some(id.into()))
            .unwrap();
        candidate
    }

    fn rejected(
        result: Result<ValidatedCandidate<'_>, (FinalizationFailure, KernelStage3MetricsV1)>,
    ) -> (FinalizationFailure, KernelStage3MetricsV1) {
        match result {
            Err(failure) => failure,
            Ok(_) => panic!("candidate must be rejected"),
        }
    }

    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    let full = rejected(missing_staff(&store, "missing-staff").validate_final_with_metrics());
    let incremental = rejected(
        missing_staff(&store, "missing-staff").validate_final_with_metrics_against(&store),
    );
    let (
        FinalizationFailure::Command(Failure::SemanticInvalid {
            diagnostics: full_diagnostics,
        }),
        full_work,
    ) = full
    else {
        panic!("full oracle must reject the missing staff")
    };
    let (
        FinalizationFailure::Command(Failure::SemanticInvalid {
            diagnostics: incremental_diagnostics,
        }),
        incremental_work,
    ) = incremental
    else {
        panic!("incremental validation must reject the missing staff")
    };
    assert_eq!(incremental_diagnostics, full_diagnostics);
    assert_eq!(full_work.full_semantic_validations, 1);
    assert_eq!(incremental_work.full_semantic_validations, 0);

    let (failure, fallback_work) =
        rejected(missing_staff(&store, "").validate_final_with_metrics_against(&store));
    assert!(matches!(
        failure,
        FinalizationFailure::Command(Failure::SemanticInvalid { .. })
    ));
    assert_eq!(fallback_work.full_semantic_validations, 1);
}

#[test]
fn multi_rule_incremental_report_matches_full_diagnostic_content_order_and_paths() {
    fn candidate_with_failures<'a>(
        store: &'a LiveScoreStore,
        document: &brilliant_score_foundation::ScoreDocumentV1,
    ) -> Candidate<'a> {
        let mut candidate = Candidate::new(TransactionOverlayV1::new(store), document.id.clone());

        let mut metadata = document.metadata.clone();
        metadata.tempo.bpm = FiniteNumber::new(0.0).unwrap();
        candidate
            .replace_value(
                &candidate.document.clone(),
                Value::DocumentMetadata(metadata),
            )
            .unwrap();

        let measure = &document.measure_definitions[0];
        let measure_source = candidate
            .resolve(Kind::Measure, measure.id.as_js_string())
            .unwrap();
        let mut meter = measure.meter.clone();
        meter.numerator = SafeInteger::new(0).unwrap();
        candidate
            .replace_value(
                &measure_source,
                Value::MeasureDefinition {
                    meter,
                    pickup_duration: measure.pickup_duration.clone(),
                },
            )
            .unwrap();

        let part = &document.parts[0];
        let staff = &part.staves[0];
        let staff_source = candidate
            .resolve(Kind::Staff, staff.id.as_js_string())
            .unwrap();
        candidate
            .replace_value(
                &staff_source,
                Value::StaffDefinition {
                    line_count: SafeInteger::new(0).unwrap(),
                    default_clef: staff.default_clef.clone(),
                },
            )
            .unwrap();

        let voice = &part.measure_contents[0].voices[0];
        let voice_source = candidate
            .resolve(Kind::Voice, voice.id.as_js_string())
            .unwrap();
        let mut start = voice.sequence.start.clone();
        start.numerator = SafeInteger::new(-1).unwrap();
        candidate
            .replace_value(&voice_source, Value::VoiceSequenceStart(start))
            .unwrap();
        candidate
            .replace_staff_reference(&voice_source, Some("missing-staff".into()))
            .unwrap();

        let event = &voice.sequence.events[0];
        let event_source = candidate
            .resolve(Kind::Event, event.id.as_js_string())
            .unwrap();
        let mut duration = event.duration.clone();
        duration.base = SafeInteger::new(3).unwrap();
        candidate
            .replace_value(&event_source, Value::EventNoteValue(duration))
            .unwrap();

        let RhythmicContentV1::Notes { notes } = &event.content else {
            panic!("fixture first event must contain notes")
        };
        let note = &notes[0];
        let note_source = candidate
            .resolve(Kind::Note, note.id.as_js_string())
            .unwrap();
        let mut pitch = note.written_pitch.clone();
        pitch.octave = SafeInteger::new(100).unwrap();
        candidate
            .replace_value(&note_source, Value::NoteWrittenPitch(pitch))
            .unwrap();
        candidate
    }

    fn diagnostics(
        result: Result<ValidatedCandidate<'_>, (FinalizationFailure, KernelStage3MetricsV1)>,
    ) -> (
        Vec<brilliant_score_foundation::CoreDiagnosticV1>,
        KernelStage3MetricsV1,
    ) {
        let Err((FinalizationFailure::Command(Failure::SemanticInvalid { diagnostics }), work)) =
            result
        else {
            panic!("multi-rule candidate must be rejected")
        };
        (diagnostics, work)
    }

    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    let (full, full_work) =
        diagnostics(candidate_with_failures(&store, &document).validate_final_with_metrics());
    let (incremental, incremental_work) = diagnostics(
        candidate_with_failures(&store, &document).validate_final_with_metrics_against(&store),
    );

    assert_eq!(incremental, full);
    assert!(incremental.len() >= 6);
    assert_eq!(full_work.full_semantic_validations, 1);
    assert_eq!(incremental_work.full_semantic_validations, 0);
    assert!(incremental_work.semantic_rules_evaluated > 0);
    assert!(incremental_work.semantic_dependency_reads > 0);
}

#[test]
fn structural_and_frozen_prefix_candidates_explicitly_fall_back_to_full_validation() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();

    let mut structural = Candidate::new(TransactionOverlayV1::new(&store), document.id.clone());
    let event = structural.resolve(Kind::Event, &"event-a".into()).unwrap();
    structural.hide(&event).unwrap();
    let structural_work = structural
        .validate_final_with_metrics_against(&store)
        .unwrap()
        .replay_work();
    assert_eq!(structural_work.full_document_scans, 1);
    assert_eq!(structural_work.full_semantic_validations, 1);

    let mut prefix = TransactionOverlayV1::new(&store);
    let mut metadata = document.metadata.clone();
    metadata.title = "frozen prefix".into();
    prefix
        .replace_scalar(
            Scalar::DocumentMetadata {
                document_id: document.id.clone(),
            },
            Value::DocumentMetadata(metadata),
        )
        .unwrap();
    let prefix_work = Candidate::new(prefix, document.id.clone())
        .validate_final_with_metrics_against(&store)
        .unwrap()
        .replay_work();
    assert_eq!(prefix_work.full_document_scans, 1);
    assert_eq!(prefix_work.full_semantic_validations, 1);
}

#[test]
fn removed_event_id_can_be_reborn_as_a_different_entity_kind() {
    let document = fixture();
    let mut expected = document.clone();
    expected.parts[0].measure_contents[0].voices[0]
        .sequence
        .events
        .clear();
    let mut definition = document.parts[0].staves[0].clone();
    definition.id = id("event-a");
    expected.parts[0].staves.insert(0, definition.clone());
    let mut store = build_live_score_store(&document).unwrap();
    let mut candidate = Candidate::new(TransactionOverlayV1::new(&store), document.id.clone());
    let event = candidate.resolve(Kind::Event, &"event-a".into()).unwrap();
    candidate.hide(&event).unwrap();
    let part = candidate.resolve(Kind::Part, &"part-z".into()).unwrap();
    candidate
        .insert_staff(
            &part,
            StaffDefinitionV1 {
                id: "event-a".into(),
                line_count: definition.line_count,
                default_clef: definition.default_clef,
            },
            None,
        )
        .unwrap();
    let (plan, _) = candidate
        .validate_final()
        .unwrap()
        .prepare_commit(&store, DocumentVersionV1::initial(), 2)
        .unwrap();
    plan.unwrap()
        .commit(
            &mut store,
            &mut DocumentVersionV1::initial(),
            &mut KernelStage3MetricsV1::default(),
        )
        .unwrap();
    assert_eq!(store.export_document().unwrap(), expected);
    assert!(matches!(
        store.indices.entity.by_id[&id("event-a")],
        crate::handles::RuntimeEntityRef::Staff(_)
    ));
    assert_indices(&store);
}
