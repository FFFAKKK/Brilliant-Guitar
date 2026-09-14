use super::*;
use crate::{
    candidate::tests::{id, raw_part},
    change_set::{ChangeOpV1, ReferenceAddressV1, ReferenceValueV1},
    indices::{normalized_index_projection, rebuild_indices_from_store},
    store::{build_live_score_store, tests::fixture},
    transaction::TransactionPrepareFailureV1,
};
use brilliant_core_types::FiniteNumber;
use brilliant_kernel_contracts::KernelStage3MetricsV1;

mod dangling_part_extensions;
mod typed_prefix;

#[test]
fn typed_part_death_and_suffix_rebirth_preserve_every_lifetime_through_history() {
    let original = fixture();
    let mut expected = original.clone();
    expected.parts[0].name = "new lifetime".into();
    let mut store = build_live_score_store(&original).unwrap();
    let mut previous_handles = store.indices.entity.by_id.clone();
    let mut prefix = TransactionOverlayV1::new(&store);
    prefix
        .remove_entity(
            Owner::Document {
                document_id: original.id.clone(),
            },
            Order::Parts {
                document_id: original.id.clone(),
            },
            Entity::Part {
                part_id: id("part-z"),
            },
        )
        .unwrap();
    let mut recorder = Recorder::new(Candidate::new(prefix, original.id.clone()));
    let part = recorder.insert_part(raw_part("part-z"), None).unwrap();
    recorder
        .replace_scalar(&part, Value::PartName("new lifetime".into()))
        .unwrap();
    let (plan, history) = recorder
        .prepare_combined_commit(&store, DocumentVersionV1::initial())
        .unwrap();
    let mut version = DocumentVersionV1::initial();
    let mut metrics = KernelStage3MetricsV1::default();
    plan.unwrap()
        .commit(&mut store, &mut version, &mut metrics)
        .unwrap();
    for stage in 0..3 {
        if stage != 0 {
            history
                .prepare_replay(
                    &store,
                    version,
                    if stage == 1 {
                        Direction::Inverse
                    } else {
                        Direction::Forward
                    },
                )
                .unwrap()
                .unwrap()
                .commit(&mut store, &mut version, &mut metrics)
                .unwrap();
        }
        assert_eq!(
            store.export_document().unwrap(),
            if stage == 1 {
                original.clone()
            } else {
                expected.clone()
            }
        );
        for (id, previous) in &previous_handles {
            if id != &original.id
                && !original
                    .measure_definitions
                    .iter()
                    .any(|measure| &measure.id == id)
            {
                assert_ne!(
                    store.indices.entity.by_id.get(id),
                    Some(previous),
                    "dead handle must never be reused for {id:?}"
                );
            }
        }
        previous_handles = store.indices.entity.by_id.clone();
        assert_eq!(metrics.full_semantic_validations, 1);
        indices_are_complete(&store);
    }
    assert_eq!(version.get(), 3);
}

fn indices_are_complete(store: &LiveScoreStore) {
    let (rebuilt, _) = rebuild_indices_from_store(store).unwrap();
    assert_eq!(
        normalized_index_projection(store, &store.indices).unwrap(),
        normalized_index_projection(store, &rebuilt).unwrap()
    );
}

fn invalid_prefix_history(store: &LiveScoreStore) -> (PreparedFinalStateCommitV1, CombinedHistory) {
    let document = fixture();
    let mut prefix = TransactionOverlayV1::new(store);
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
        .replace_scalar(
            Scalar::PartName {
                part_id: id("part-z"),
            },
            Value::PartName("prefix name".into()),
        )
        .unwrap();
    let mut recorder = Recorder::new(Candidate::new(prefix, document.id));
    let mut final_metadata = document.metadata;
    final_metadata.title = "final title".into();
    recorder
        .replace_scalar(
            &recorder.candidate.document.clone(),
            Value::DocumentMetadata(final_metadata),
        )
        .unwrap();
    // These nested IDs overlap the original Part until its temporary parent is removed.
    recorder.insert_part(raw_part("temporary"), None).unwrap();
    recorder.remove_part(&"temporary".into()).unwrap();
    let (plan, history) = recorder
        .prepare_combined_commit(store, DocumentVersionV1::initial())
        .unwrap();
    (plan.unwrap(), history)
}

#[test]
fn invalid_intermediate_metadata_and_duplicate_subtree_roundtrip_repeatedly() {
    let original = fixture();
    let mut expected = original.clone();
    expected.metadata.title = "final title".into();
    expected.parts[0].name = "prefix name".into();
    let mut store = build_live_score_store(&original).unwrap();
    let (plan, history) = invalid_prefix_history(&store);
    assert_eq!(store.export_document().unwrap(), original);
    let mut version = DocumentVersionV1::initial();
    let mut metrics = KernelStage3MetricsV1::default();
    plan.commit(&mut store, &mut version, &mut metrics).unwrap();
    assert_eq!(metrics.change_ops, 5);
    for step in 0..7 {
        let inverse = step % 2 == 1;
        if step != 0 {
            let before = store.export_document().unwrap();
            let plan = history
                .prepare_replay(
                    &store,
                    version,
                    if inverse {
                        Direction::Inverse
                    } else {
                        Direction::Forward
                    },
                )
                .unwrap()
                .unwrap();
            assert_eq!(store.export_document().unwrap(), before);
            plan.commit(&mut store, &mut version, &mut metrics).unwrap();
        }
        assert_eq!(
            store.export_document().unwrap(),
            if inverse {
                original.clone()
            } else {
                expected.clone()
            }
        );
        assert_eq!(version.get(), step + 1);
        assert_eq!(metrics.full_semantic_validations, 1);
        assert_eq!(metrics.full_document_scans, if inverse { 2 } else { 1 });
        assert_eq!(metrics.full_document_clones, 0);
        assert_eq!(metrics.full_snapshot_materializations, 0);
        indices_are_complete(&store);
    }
}

#[test]
fn invalid_intermediate_reference_is_restored_before_the_final_assessment() {
    let original = fixture();
    let mut store = build_live_score_store(&original).unwrap();
    let mut prefix = TransactionOverlayV1::new(&store);
    prefix
        .update_reference(
            ReferenceAddressV1::VoiceDefaultStaff {
                voice_id: id("voice-a"),
            },
            ReferenceValueV1::StableId(id("missing-staff")),
        )
        .unwrap();
    let mut recorder = Recorder::new(Candidate::new(prefix, original.id.clone()));
    let voice = recorder
        .candidate
        .resolve(Kind::Voice, &"voice-a".into())
        .unwrap();
    recorder
        .replace_reference(&voice, Some("staff-a".into()))
        .unwrap();
    let (plan, history) = recorder
        .prepare_combined_commit(&store, DocumentVersionV1::initial())
        .unwrap();
    let mut version = DocumentVersionV1::initial();
    let mut metrics = KernelStage3MetricsV1::default();
    plan.unwrap()
        .commit(&mut store, &mut version, &mut metrics)
        .unwrap();
    for direction in [Direction::Inverse, Direction::Forward] {
        history
            .prepare_replay(&store, version, direction)
            .unwrap()
            .unwrap()
            .commit(&mut store, &mut version, &mut metrics)
            .unwrap();
        assert_eq!(store.export_document().unwrap(), original);
        assert_eq!(metrics.full_semantic_validations, 1);
        indices_are_complete(&store);
    }
    assert_eq!(
        version.get(),
        3,
        "actual net-zero history still advances versions"
    );
}

#[test]
fn late_prefix_inverse_precondition_failure_leaves_store_version_and_metrics_unchanged() {
    let mut store = build_live_score_store(&fixture()).unwrap();
    let (plan, mut history) = invalid_prefix_history(&store);
    let mut version = DocumentVersionV1::initial();
    let mut metrics = KernelStage3MetricsV1::default();
    plan.commit(&mut store, &mut version, &mut metrics).unwrap();
    // PartName is reversed privately first. The later metadata check must fail.
    assert_eq!(history.prefix.inverse.len(), 2);
    match history.prefix.inverse.last_mut().unwrap() {
        ChangeOpV1::ReplaceScalar {
            expected, value, ..
        } => *expected = *value,
        _ => panic!("expected final inverse to restore metadata"),
    }
    let before = store.export_document().unwrap();
    let before_indices = normalized_index_projection(&store, &store.indices).unwrap();
    let before_version = version;
    let before_metrics = metrics;
    assert!(matches!(
        history.prepare_replay(&store, version, Direction::Inverse),
        Err(FinalizationFailure::Preparation(
            TransactionPrepareFailureV1::PreconditionMismatch
        ))
    ));
    assert_eq!(store.export_document().unwrap(), before);
    assert_eq!(
        normalized_index_projection(&store, &store.indices).unwrap(),
        before_indices
    );
    assert_eq!(version, before_version);
    assert_eq!(metrics, before_metrics);
}

#[test]
fn suffix_only_inverse_preserves_final_validation_without_an_intermediate_reader() {
    let original = fixture();
    let mut expected = original.clone();
    expected.metadata.title = "suffix title".into();
    let mut store = build_live_score_store(&original).unwrap();
    let mut recorder = Recorder::new(Candidate::new(
        TransactionOverlayV1::new(&store),
        original.id.clone(),
    ));
    let root = recorder
        .candidate
        .resolve(Kind::Document, original.id.as_js_string())
        .unwrap();
    recorder
        .replace_scalar(&root, Value::DocumentMetadata(expected.metadata.clone()))
        .unwrap();
    let (plan, mut history) = recorder
        .prepare_combined_commit(&store, DocumentVersionV1::initial())
        .unwrap();
    assert!(history.prefix.forward.is_empty());
    assert!(history.prefix.inverse.is_empty());
    assert!(!history.suffix.steps.is_empty());
    let mut version = DocumentVersionV1::initial();
    let mut metrics = KernelStage3MetricsV1::default();
    plan.unwrap()
        .commit(&mut store, &mut version, &mut metrics)
        .unwrap();
    for (direction, expected_document) in [
        (Direction::Inverse, &original),
        (Direction::Forward, &expected),
    ] {
        let before = store.export_document().unwrap();
        let preview = history.project_replay(&store, direction).unwrap();
        assert_eq!(&preview, expected_document);
        assert_eq!(
            store.export_document().unwrap(),
            before,
            "preview is detached"
        );
        let direction = if version.get() == 1 {
            Direction::Inverse
        } else {
            Direction::Forward
        };
        history
            .prepare_replay(&store, version, direction)
            .unwrap()
            .unwrap()
            .commit(&mut store, &mut version, &mut metrics)
            .unwrap();
        assert_eq!(&store.export_document().unwrap(), expected_document);
        assert_eq!(metrics.full_semantic_validations, 1);
        assert_eq!(
            metrics.full_document_scans, 1,
            "only the required final semantic walk"
        );
        indices_are_complete(&store);
    }
    let before = store.export_document().unwrap();
    let before_metrics = metrics;
    let mut invalid = original.metadata.clone();
    invalid.tempo.bpm = FiniteNumber::new(0.0).unwrap();
    match &mut history.suffix.steps[0].inverse {
        Operation::ReplaceScalar { value, .. } => {
            *value = Arc::new(Value::DocumentMetadata(invalid))
        }
        _ => panic!("metadata inverse"),
    }
    assert!(matches!(
        history.project_replay(&store, Direction::Inverse),
        Err(FinalizationFailure::Command(
            Failure::SemanticInvalid { .. }
        ))
    ));
    assert!(matches!(
        history.prepare_replay(&store, version, Direction::Inverse),
        Err(FinalizationFailure::Command(
            Failure::SemanticInvalid { .. }
        ))
    ));
    assert_eq!(store.export_document().unwrap(), before);
    assert_eq!(metrics, before_metrics);
    assert_eq!(version.get(), 3);
    indices_are_complete(&store);
}

#[test]
fn empty_and_prefix_only_histories_preserve_noop_and_fast_inverse_behavior() {
    let original = fixture();
    let mut store = build_live_score_store(&original).unwrap();
    let empty = Recorder::new(Candidate::new(
        TransactionOverlayV1::new(&store),
        original.id.clone(),
    ));
    let (plan, history) = empty
        .prepare_combined_commit(&store, DocumentVersionV1::initial())
        .unwrap();
    assert!(plan.is_none());
    assert!(
        history
            .prepare_replay(&store, DocumentVersionV1::initial(), Direction::Inverse)
            .unwrap()
            .is_none()
    );
    let mut prefix = TransactionOverlayV1::new(&store);
    prefix
        .replace_scalar(
            Scalar::PartName {
                part_id: id("part-z"),
            },
            Value::PartName("changed".into()),
        )
        .unwrap();
    let recorder = Recorder::new(Candidate::new(prefix, original.id.clone()));
    let (plan, history) = recorder
        .prepare_combined_commit(&store, DocumentVersionV1::initial())
        .unwrap();
    let mut version = DocumentVersionV1::initial();
    let mut metrics = KernelStage3MetricsV1::default();
    plan.unwrap()
        .commit(&mut store, &mut version, &mut metrics)
        .unwrap();
    history
        .prepare_replay(&store, version, Direction::Inverse)
        .unwrap()
        .unwrap()
        .commit(&mut store, &mut version, &mut metrics)
        .unwrap();
    assert_eq!(store.export_document().unwrap(), original);
    assert_eq!(metrics.full_document_scans, 1);
    assert_eq!(metrics.full_semantic_validations, 1);
    assert_eq!(version.get(), 2);
}

#[test]
fn final_semantic_failure_after_both_private_inverse_phases_cannot_publish() {
    let mut store = build_live_score_store(&fixture()).unwrap();
    let (plan, mut history) = invalid_prefix_history(&store);
    let mut version = DocumentVersionV1::initial();
    let mut metrics = KernelStage3MetricsV1::default();
    plan.commit(&mut store, &mut version, &mut metrics).unwrap();
    // Keep the correct expected intermediate value, but corrupt the inverse
    // so it no longer repairs tempo=0. All stored preconditions still match.
    match history.prefix.inverse.last_mut().unwrap() {
        ChangeOpV1::ReplaceScalar {
            expected, value, ..
        } => *value = *expected,
        _ => panic!("metadata inverse"),
    }
    let before = store.export_document().unwrap();
    let before_indices = normalized_index_projection(&store, &store.indices).unwrap();
    let before_metrics = metrics;
    assert!(matches!(
        history.prepare_replay(&store, version, Direction::Inverse),
        Err(FinalizationFailure::Command(
            Failure::SemanticInvalid { .. }
        ))
    ));
    assert_eq!(store.export_document().unwrap(), before);
    assert_eq!(
        normalized_index_projection(&store, &store.indices).unwrap(),
        before_indices
    );
    assert_eq!(metrics, before_metrics);
    assert_eq!(version.get(), 1);
}
