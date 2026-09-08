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
