use super::*;
use crate::candidate::tests::id;
use crate::change_set::MAX_PREPARED_EFFECTS_V1;
use crate::runtime::effect::KernelEffectV1;
use crate::store::{build_live_score_store, tests::fixture};
use brilliant_core_types::SafeInteger;
use brilliant_kernel_contracts::{
    CoreCommandEnvelopeV1, KernelStage3MetricsV1, KernelStage3ResourceLimitKindV1, SequenceAnchorV1,
};
use brilliant_score_foundation::{
    NoteValueV1, RhythmicContentV1, RhythmicEventV1, ScoreDocumentV1,
};

fn source() -> ModuleSegmentSource {
    ModuleSegmentSource {
        command_id: id("module.apply"),
        module_id: id("module.owner"),
        contribution_id: id("module.contribution"),
    }
}

fn event_removal_metrics(document: &ScoreDocumentV1) -> KernelStage3MetricsV1 {
    let store = build_live_score_store(document).unwrap();
    let mut execution =
        CandidateExecution::new(TransactionOverlayV1::new(&store), document.id.clone()).unwrap();
    let start = execution.begin_module();
    KernelEffectV1::RemoveEvent {
        event_id: id("event-a"),
    }
    .apply_to(&mut execution)
    .unwrap();
    execution.end_module(start, 0, source()).unwrap();
    execution.attempt_metrics()
}

fn pitch_edit_metrics(document: &ScoreDocumentV1) -> KernelStage3MetricsV1 {
    let store = build_live_score_store(document).unwrap();
    let mut execution =
        CandidateExecution::new(TransactionOverlayV1::new(&store), document.id.clone()).unwrap();
    let start = execution.begin_module();
    let RhythmicContentV1::Notes { notes } = &document.parts[0].measure_contents[0].voices[0]
        .sequence
        .events[0]
        .content
    else {
        panic!("fixture event-a must contain notes")
    };
    let mut pitch = notes[0].written_pitch.clone();
    pitch.octave = SafeInteger::new(5).unwrap();
    KernelEffectV1::ReplaceWrittenPitch {
        note_id: id("note-a"),
        pitch,
    }
    .apply_to(&mut execution)
    .unwrap();
    execution.end_module(start, 0, source()).unwrap();
    execution
        .finish(&store, DocumentVersionV1::initial())
        .unwrap()
        .attempt_metrics
}

fn add_unrelated_parts(document: &mut ScoreDocumentV1, count: usize) {
    let template = document.parts[0].clone();
    for part_index in 0..count {
        let mut part = template.clone();
        part.id = id(format!("unrelated-part-{part_index}"));
        let mut staff_ids = std::collections::HashMap::new();
        for (staff_index, staff) in part.staves.iter_mut().enumerate() {
            let original = staff.id.clone();
            staff.id = id(format!("unrelated-staff-{part_index}-{staff_index}"));
            staff_ids.insert(original, staff.id.clone());
        }
        for (content_index, content) in part.measure_contents.iter_mut().enumerate() {
            for (voice_index, voice) in content.voices.iter_mut().enumerate() {
                voice.id = id(format!(
                    "unrelated-voice-{part_index}-{content_index}-{voice_index}"
                ));
                voice.default_staff_id = staff_ids[&voice.default_staff_id].clone();
                for (event_index, event) in voice.sequence.events.iter_mut().enumerate() {
                    event.id = id(format!(
                        "unrelated-event-{part_index}-{content_index}-{voice_index}-{event_index}"
                    ));
                    event.staff_id = event
                        .staff_id
                        .as_ref()
                        .map(|staff_id| staff_ids[staff_id].clone());
                    if let RhythmicContentV1::Notes { notes } = &mut event.content {
                        for (note_index, note) in notes.iter_mut().enumerate() {
                            note.id = id(format!(
                                "unrelated-note-{part_index}-{content_index}-{voice_index}-{event_index}-{note_index}"
                            ));
                        }
                    }
                }
            }
        }
        document.parts.push(part);
    }
}

fn target_voice_mut(document: &mut ScoreDocumentV1) -> &mut brilliant_score_foundation::VoiceV1 {
    document.parts[0]
        .measure_contents
        .iter_mut()
        .flat_map(|content| content.voices.iter_mut())
        .find(|voice| voice.id.as_js_string().eq_ascii("voice-a"))
        .unwrap()
}

#[test]
fn module_then_core_and_core_budget_then_module_share_the_effect_cap() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    for module_last in [false, true] {
        let mut execution =
            CandidateExecution::new(TransactionOverlayV1::new(&store), document.id.clone())
                .unwrap();
        execution
            .accounting
            .add_prepared_effects(MAX_PREPARED_EFFECTS_V1 - 1)
            .unwrap();
        let start = execution.begin_module();
        let mut block = document.extensions[0].clone();
        block.schema_version = SafeInteger::new(2).unwrap();
        execution
            .module_extension(
                block.namespace.clone(),
                ExtensionOwnerV1::Score,
                Some(block.clone()),
            )
            .unwrap();
        let error = if module_last {
            block.schema_version = SafeInteger::new(3).unwrap();
            execution
                .module_extension(
                    block.namespace.clone(),
                    ExtensionOwnerV1::Score,
                    Some(block),
                )
                .unwrap();
            execution.end_module(start, 1, source()).unwrap_err()
        } else {
            execution.end_module(start, 0, source()).unwrap();
            let mut metadata = document.metadata.clone();
            metadata.title = "next core child".into();
            execution
                .dispatch(
                    CoreCommandEnvelopeV1::DocumentSetMetadata {
                        target: Target::Document {
                            document_id: document.id.clone(),
                        },
                        metadata,
                    },
                    Some(1),
                )
                .unwrap_err()
        };
        assert_eq!(
            error,
            Failure::ResourceLimitExceeded {
                limit_kind: KernelStage3ResourceLimitKindV1::Effects,
                limit: MAX_PREPARED_EFFECTS_V1,
                actual: MAX_PREPARED_EFFECTS_V1 + 1
            }
        );
        assert!(
            execution
                .finish(&store, DocumentVersionV1::initial())
                .is_err()
        );
        assert_eq!(store.export_document().unwrap(), document);
    }
}

#[test]
fn actual_module_noop_at_full_effect_budget_adds_no_affected_or_segment() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    let mut execution =
        CandidateExecution::new(TransactionOverlayV1::new(&store), document.id.clone()).unwrap();
    execution
        .accounting
        .add_prepared_effects(MAX_PREPARED_EFFECTS_V1)
        .unwrap();
    let start = execution.begin_module();
    let block = document.extensions[0].clone();
    execution
        .module_extension(
            block.namespace.clone(),
            ExtensionOwnerV1::Score,
            Some(block),
        )
        .unwrap();
    execution.end_module(start, 0, source()).unwrap();
    assert!(execution.affected.is_empty());
    assert!(execution.segments.is_empty());
    assert!(!execution.changed);
    assert_eq!(store.export_document().unwrap(), document);
}

#[test]
fn module_segment_charges_retained_source_ids_and_deduplicates_affected_with_core() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    let mut execution =
        CandidateExecution::new(TransactionOverlayV1::new(&store), document.id.clone()).unwrap();
    let target = Target::Document {
        document_id: document.id.clone(),
    };
    let mut metadata = document.metadata.clone();
    metadata.title = "core prefix".into();
    execution
        .dispatch(
            CoreCommandEnvelopeV1::DocumentSetMetadata {
                target: target.clone(),
                metadata,
            },
            Some(0),
        )
        .unwrap();
    let start = execution.begin_module();
    let mut block = document.extensions[0].clone();
    block.schema_version = SafeInteger::new(2).unwrap();
    execution
        .module_extension(
            block.namespace.clone(),
            ExtensionOwnerV1::Score,
            Some(block),
        )
        .unwrap();
    let affected = Target::Document {
        document_id: document.id.clone().into(),
    };
    execution.end_module(start, 1, source()).unwrap();
    assert_eq!(execution.affected, vec![affected]);
    assert_eq!(execution.segments.len(), 2);
    let before = execution.accounting.logical_bytes();
    for id in [
        source().command_id,
        source().module_id,
        source().contribution_id,
    ] {
        execution.accounting.intern(id.as_js_string()).unwrap();
    }
    assert_eq!(
        execution.accounting.logical_bytes(),
        before,
        "source identity strings were already charged"
    );
}

#[test]
fn structural_effects_insert_and_remove_an_event_through_candidate_history() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    let mut execution =
        CandidateExecution::new(TransactionOverlayV1::new(&store), document.id.clone()).unwrap();
    let initial = execution.integrated_document().unwrap();
    let start = execution.begin_module();
    let event_id = id("module-event");
    KernelEffectV1::InsertRestEvent {
        voice_id: id("voice-a"),
        anchor: SequenceAnchorV1::Start,
        event: RhythmicEventV1 {
            id: event_id.clone(),
            duration: NoteValueV1 {
                base: SafeInteger::new(4).unwrap(),
                dots: SafeInteger::new(0).unwrap(),
                time_modification: None,
            },
            staff_id: None,
            content: RhythmicContentV1::Rest,
        },
    }
    .apply_to(&mut execution)
    .unwrap();
    assert_eq!(
        execution.integrated_document().unwrap().parts[0].measure_contents[0].voices[0]
            .sequence
            .events[0]
            .id,
        event_id.as_js_string().clone()
    );

    KernelEffectV1::RemoveEvent {
        event_id: event_id.clone(),
    }
    .apply_to(&mut execution)
    .unwrap();
    assert_eq!(execution.integrated_document().unwrap(), initial);

    execution.end_module(start, 0, source()).unwrap();
    let prepared = execution
        .finish(&store, DocumentVersionV1::initial())
        .unwrap();
    assert!(prepared.changed);
    assert_eq!(
        prepared.affected,
        vec![
            Target::Event {
                event_id: event_id.into(),
            },
            Target::Voice {
                voice_id: id("voice-a").into(),
            },
        ]
    );
    assert_eq!(
        prepared
            .history
            .integrated_projection(&store, true)
            .unwrap(),
        document
    );
}

#[test]
fn scalar_effects_share_module_accounting_and_candidate_replay() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    let mut execution =
        CandidateExecution::new(TransactionOverlayV1::new(&store), document.id.clone()).unwrap();
    let start = execution.begin_module();
    let mut metadata = document.metadata.clone();
    metadata.title = "module metadata".into();
    KernelEffectV1::SetDocumentMetadata {
        document_id: document.id.clone(),
        metadata: metadata.clone(),
    }
    .apply_to(&mut execution)
    .unwrap();
    let event_id = id("event-a");
    let mut note_value = document.parts[0].measure_contents[0].voices[0]
        .sequence
        .events[0]
        .duration
        .clone();
    note_value.base = SafeInteger::new(8).unwrap();
    KernelEffectV1::SetEventNoteValue {
        event_id: event_id.clone(),
        note_value: note_value.clone(),
    }
    .apply_to(&mut execution)
    .unwrap();
    execution.end_module(start, 0, source()).unwrap();
    let prepared = execution
        .finish(&store, DocumentVersionV1::initial())
        .unwrap();
    assert_eq!(prepared.attempt_metrics.full_document_scans, 0);
    assert_eq!(prepared.attempt_metrics.full_semantic_validations, 0);
    assert!(prepared.attempt_metrics.semantic_rules_evaluated > 0);
    let projected = prepared
        .history
        .integrated_projection(&store, true)
        .unwrap();
    assert_eq!(projected.metadata, metadata);
    let event = projected.parts[0].measure_contents[0].voices[0]
        .sequence
        .events
        .iter()
        .find(|event| event.id == event_id)
        .unwrap();
    assert_eq!(event.duration, note_value);
}

#[test]
fn local_pitch_validation_work_is_independent_of_unrelated_document_size() {
    let baseline_document = fixture();
    let baseline = pitch_edit_metrics(&baseline_document);
    assert_eq!(baseline.full_document_scans, 0);
    assert_eq!(baseline.full_semantic_validations, 0);
    assert!(baseline.semantic_rules_evaluated > 0);

    let mut larger_document = baseline_document;
    add_unrelated_parts(&mut larger_document, 64);
    let larger = pitch_edit_metrics(&larger_document);
    assert_eq!(larger.full_document_scans, 0);
    assert_eq!(larger.full_semantic_validations, 0);
    assert_eq!(
        larger.semantic_rules_evaluated,
        baseline.semantic_rules_evaluated
    );
    assert_eq!(
        larger.semantic_dependency_reads,
        baseline.semantic_dependency_reads
    );
}

#[test]
fn event_removal_work_tracks_the_owner_order_and_removed_subtree_only() {
    let baseline_document = fixture();
    let baseline = event_removal_metrics(&baseline_document);
    assert_eq!(baseline.full_document_scans, 0);
    assert_eq!(baseline.full_document_clones, 0);
    assert_eq!(baseline.full_snapshot_materializations, 0);
    assert_eq!(baseline.order_collections_copied, 0);
    assert_eq!(baseline.change_ops, 1);

    let mut larger_document = baseline_document.clone();
    add_unrelated_parts(&mut larger_document, 32);
    let larger = event_removal_metrics(&larger_document);
    assert_eq!(larger.full_document_scans, 0);
    assert_eq!(larger.full_document_clones, 0);
    assert_eq!(larger.full_snapshot_materializations, 0);
    assert_eq!(larger.entities_visited, baseline.entities_visited);
    assert_eq!(larger.entity_index_lookups, baseline.entity_index_lookups);
    assert_eq!(larger.owner_index_lookups, baseline.owner_index_lookups);
    assert_eq!(
        larger.order_collections_copied,
        baseline.order_collections_copied
    );
    assert_eq!(larger.overlay_records, baseline.overlay_records);
    assert_eq!(larger.change_ops, baseline.change_ops);

    let mut longer_voice = baseline_document.clone();
    let voice = target_voice_mut(&mut longer_voice);
    for index in 0..256 {
        voice.sequence.events.push(RhythmicEventV1 {
            id: id(format!("sibling-event-{index}")),
            duration: NoteValueV1 {
                base: SafeInteger::new(4).unwrap(),
                dots: SafeInteger::new(0).unwrap(),
                time_modification: None,
            },
            staff_id: None,
            content: RhythmicContentV1::Rest,
        });
    }
    let longer = event_removal_metrics(&longer_voice);
    assert_eq!(longer.full_document_scans, 0);
    assert_eq!(
        longer.order_collections_copied,
        baseline.order_collections_copied
    );
    assert_eq!(longer.overlay_records, baseline.overlay_records);
    assert_eq!(longer.change_ops, baseline.change_ops);
    assert!(longer.entities_visited > baseline.entities_visited);

    let mut larger_subtree = baseline_document;
    let voice = target_voice_mut(&mut larger_subtree);
    let event = voice
        .sequence
        .events
        .iter_mut()
        .find(|event| event.id.as_js_string().eq_ascii("event-a"))
        .unwrap();
    let RhythmicContentV1::Notes { notes } = &mut event.content else {
        panic!("fixture event-a must contain notes")
    };
    let template = notes[0].clone();
    for index in 0..256 {
        let mut note = template.clone();
        note.id = id(format!("subtree-note-{index}"));
        notes.push(note);
    }
    let subtree = event_removal_metrics(&larger_subtree);
    assert_eq!(subtree.full_document_scans, 0);
    assert_eq!(
        subtree.order_collections_copied,
        baseline.order_collections_copied
    );
    assert_eq!(subtree.change_ops, baseline.change_ops);
    assert!(subtree.entities_visited > baseline.entities_visited);
    assert!(subtree.changeset_logical_bytes > baseline.changeset_logical_bytes);
}
