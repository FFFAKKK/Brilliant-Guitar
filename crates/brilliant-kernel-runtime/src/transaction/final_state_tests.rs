use super::*;
use crate::{
    indices::{normalized_index_projection, rebuild_indices_from_store},
    store::{build_live_score_store, tests::fixture},
};

fn id(text: &str) -> StableId {
    StableId::new(text).unwrap()
}

fn prior_work(count: u64) -> KernelStage3MetricsV1 {
    KernelStage3MetricsV1 {
        change_ops: count,
        full_semantic_validations: 1,
        full_document_scans: 1,
        ..KernelStage3MetricsV1::default()
    }
}

#[test]
fn typed_cross_kind_rebirth_preserves_the_new_binding_through_forward_and_inverse() {
    let document = fixture();
    let mut store = build_live_score_store(&document).unwrap();
    let event_id = id("event-a");
    let old_event = lookup_event(&store, &event_id).unwrap();
    let mut staff = document.parts[0].staves[0].clone();
    staff.id = event_id.clone();
    let mut expected = document.clone();
    expected.parts[0].measure_contents[0].voices[0]
        .sequence
        .events
        .clear();
    expected.parts[0].staves.insert(0, staff.clone());
    let mut prefix = TransactionOverlayV1::new(&store);
    prefix
        .remove_entity(
            StableOwnerAddressV1::Voice {
                voice_id: id("voice-a"),
            },
            StableOrderAddressV1::Events {
                voice_id: id("voice-a"),
            },
            StableEntityAddressV1::Event {
                event_id: event_id.clone(),
            },
        )
        .unwrap();
    prefix
        .insert_entity(
            StableOwnerAddressV1::Part {
                part_id: id("part-z"),
            },
            StableOrderAddressV1::Staffs {
                part_id: id("part-z"),
            },
            StableAnchorV1::Start,
            StableEntityAddressV1::Staff {
                staff_id: event_id.clone(),
            },
            EntityBundleV1::Staff(staff),
        )
        .unwrap();
    let history = prefix.finish().unwrap();
    let mut version = DocumentVersionV1::initial();
    let mut metrics = KernelStage3MetricsV1::default();
    for inverse in [false, true, false] {
        let operations = if inverse {
            &history.inverse
        } else {
            &history.forward
        };
        apply_stored_operations(&mut store, &mut version, &mut metrics, &history, operations)
            .unwrap();
        assert_eq!(
            store.export_document().unwrap(),
            if inverse {
                document.clone()
            } else {
                expected.clone()
            }
        );
        assert!(matches!(
            (inverse, store.indices.entity.by_id[&event_id]),
            (true, RuntimeEntityRef::Event(_)) | (false, RuntimeEntityRef::Staff(_))
        ));
        assert!(!store.events.contains_key(old_event));
        let (rebuilt, _) = rebuild_indices_from_store(&store).unwrap();
        assert_eq!(
            normalized_index_projection(&store, &store.indices).unwrap(),
            normalized_index_projection(&store, &rebuilt).unwrap()
        );
    }
}

#[test]
fn extension_order_only_prefix_and_typed_history_preserve_payloads_and_handles() {
    for mode in 0..3 {
        let mut document = fixture();
        document.extensions.truncate(1);
        let mut second = document.extensions[0].clone();
        second.namespace = "order-only-second".into();
        document.extensions.push(second);
        let mut store = build_live_score_store(&document).unwrap();
        let base_handles = store.topology.extension_order.clone();
        let mut expected = document.clone();
        expected.extensions.reverse();
        let final_view = build_live_score_store(&expected).unwrap();
        let order = StableOrderAddressV1::Extensions {
            document_id: document.id.clone(),
        };
        let mut prefix = TransactionOverlayV1::new(&store);
        let ids = prefix.read_order(&order).unwrap();
        match mode {
            0 => {
                prefix
                    .move_ordered_child(order.clone(), ids[1].clone(), StableAnchorV1::Start)
                    .unwrap();
            }
            1 => {
                prefix
                    .replace_ordered_children(order.clone(), vec![ids[1].clone(), ids[0].clone()])
                    .unwrap();
            }
            _ => {
                prefix
                    .remove_ordered_child(order.clone(), ids[1].clone())
                    .unwrap();
                prefix
                    .insert_ordered_child(order.clone(), StableAnchorV1::Start, ids[1].clone())
                    .unwrap();
            }
        }
        let (delta, extensions) = collect_frozen_prefix_delta(&store, &prefix).unwrap();
        assert!(
            matches!(&extensions, FinalExtensionDeltaV1::Changed { states, removed, .. } if states.is_empty() && removed.is_empty())
        );
        let plan = prepare_validated_final_state(
            &store,
            DocumentVersionV1::initial(),
            &final_view,
            delta,
            extensions,
            true,
            prior_work(if mode == 2 { 2 } else { 1 }),
        )
        .unwrap()
        .unwrap();
        let history = prefix.finish().unwrap();
        let mut version = DocumentVersionV1::initial();
        let mut metrics = KernelStage3MetricsV1::default();
        plan.commit(&mut store, &mut version, &mut metrics).unwrap();
        assert_eq!(store.export_document().unwrap(), expected);
        assert_eq!(
            store.topology.extension_order,
            vec![base_handles[1], base_handles[0]]
        );

        let mut typed_store = build_live_score_store(&document).unwrap();
        let mut simulation = ExtensionSimulationV1::from_store(&typed_store).unwrap();
        assert!(
            simulation.values.is_empty(),
            "untouched opaque payloads stay in the base store"
        );
        simulation
            .apply_operations(&typed_store, &history.arena, &history.forward)
            .unwrap();
        assert!(simulation.values.is_empty());
        let mut typed_version = DocumentVersionV1::initial();
        let mut typed_metrics = KernelStage3MetricsV1::default();
        apply_stored_operations(
            &mut typed_store,
            &mut typed_version,
            &mut typed_metrics,
            &history,
            &history.forward,
        )
        .unwrap();
        assert_eq!(typed_store.export_document().unwrap(), expected);
        apply_stored_operations(
            &mut typed_store,
            &mut typed_version,
            &mut typed_metrics,
            &history,
            &history.inverse,
        )
        .unwrap();
        assert_eq!(typed_store.export_document().unwrap(), document);
    }
}

#[test]
fn extension_order_missing_or_duplicate_members_cannot_be_adopted() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    let keys: Vec<_> = document
        .extensions
        .iter()
        .map(ExtensionKeyV1::from_block)
        .collect();
    for duplicate in [false, true] {
        let mut final_order = keys.clone();
        if duplicate {
            final_order.push(keys[0].clone());
        } else {
            final_order.remove(0);
        }
        let result = prepare_validated_final_state(
            &store,
            DocumentVersionV1::initial(),
            &store,
            FinalStateDeltaV1::default(),
            FinalExtensionDeltaV1::Changed {
                final_order,
                states: HashMap::new(),
                removed: HashSet::new(),
            },
            true,
            prior_work(1),
        );
        assert!(matches!(
            result,
            Err(TransactionPrepareFailureV1::LocalInvariant)
        ));
    }
    let order = StableOrderAddressV1::Extensions {
        document_id: document.id.clone(),
    };
    let mut prefix = TransactionOverlayV1::new(&store);
    let ids = prefix.read_order(&order).unwrap();
    prefix.remove_ordered_child(order, ids[0].clone()).unwrap();
    let history = prefix.finish().unwrap();
    let mut target = build_live_score_store(&document).unwrap();
    let mut version = DocumentVersionV1::initial();
    let mut metrics = KernelStage3MetricsV1::default();
    assert!(matches!(
        apply_stored_operations(
            &mut target,
            &mut version,
            &mut metrics,
            &history,
            &history.forward
        ),
        Err(TransactionPrepareFailureV1::LocalInvariant)
    ));
    assert_eq!(target.export_document().unwrap(), document);
    assert_eq!(version, DocumentVersionV1::initial());
    assert_eq!(metrics, KernelStage3MetricsV1::default());
}

#[test]
fn frozen_prefix_scalar_and_extension_adopt_without_replaying_into_the_final_view() {
    let document = fixture();
    let mut store = build_live_score_store(&document).unwrap();
    let mut expected = document.clone();
    expected.parts[0].name = "Final name".into();
    expected.extensions[0].schema_version = brilliant_core_types::SafeInteger::new(8).unwrap();
    let final_view = build_live_score_store(&expected).unwrap();
    let mut prefix = TransactionOverlayV1::new(&store);
    prefix
        .replace_scalar(
            ScalarAddressV1::PartName {
                part_id: document.parts[0].id.clone(),
            },
            ScalarValueV1::PartName(expected.parts[0].name.clone()),
        )
        .unwrap();
    prefix
        .replace_extension(
            ExtensionKeyV1::from_block(&document.extensions[0]),
            expected.extensions[0].clone(),
        )
        .unwrap();
    let (delta, extensions) = collect_frozen_prefix_delta(&store, &prefix).unwrap();
    assert!(
        matches!(&extensions, FinalExtensionDeltaV1::Changed { states, .. } if states.len() == 1)
    );
    let plan = prepare_validated_final_state(
        &store,
        DocumentVersionV1::initial(),
        &final_view,
        delta,
        extensions,
        true,
        prior_work(2),
    )
    .unwrap()
    .unwrap();
    // Prefix remains consumable only after the plan no longer borrows it.
    let history = prefix.finish().unwrap();
    assert_eq!(history.forward.len(), 2);
    let mut version = DocumentVersionV1::initial();
    let mut metrics = KernelStage3MetricsV1::default();
    plan.commit(&mut store, &mut version, &mut metrics).unwrap();
    assert_eq!(store.export_document().unwrap(), expected);
    assert_eq!(version.get(), 1);
    assert_eq!(metrics.change_ops, 2);
    assert_eq!(metrics.full_semantic_validations, 1);
    assert_eq!(metrics.full_document_scans, 1);
    let (rebuilt, _) = rebuild_indices_from_store(&store).unwrap();
    assert_eq!(
        normalized_index_projection(&store, &store.indices).unwrap(),
        normalized_index_projection(&store, &rebuilt).unwrap()
    );
}

#[test]
fn actual_net_zero_operations_advance_version_but_no_operations_do_not() {
    let mut store = build_live_score_store(&fixture()).unwrap();
    let baseline = store.export_document().unwrap();
    assert!(
        prepare_validated_final_state(
            &store,
            DocumentVersionV1::initial(),
            &store,
            FinalStateDeltaV1::default(),
            FinalExtensionDeltaV1::Unchanged,
            false,
            KernelStage3MetricsV1::default(),
        )
        .unwrap()
        .is_none()
    );
    let plan = prepare_validated_final_state(
        &store,
        DocumentVersionV1::initial(),
        &store,
        FinalStateDeltaV1::default(),
        FinalExtensionDeltaV1::Unchanged,
        true,
        prior_work(2),
    )
    .unwrap()
    .unwrap();
    let mut version = DocumentVersionV1::initial();
    let mut metrics = KernelStage3MetricsV1::default();
    plan.commit(&mut store, &mut version, &mut metrics).unwrap();
    assert_eq!(version.get(), 1);
    assert_eq!(metrics.change_ops, 2);
    assert_eq!(store.export_document().unwrap(), baseline);
}

#[test]
fn mismatched_sparse_values_and_false_noop_claims_are_rejected_before_commit() {
    let store = build_live_score_store(&fixture()).unwrap();
    for actual in [false, true] {
        let mut delta = FinalStateDeltaV1::default();
        delta.scalar_values.insert(
            ScalarAddressV1::PartName {
                part_id: id("part-z"),
            },
            ScalarValueV1::PartName("Unvalidated".into()),
        );
        let result = prepare_validated_final_state(
            &store,
            DocumentVersionV1::initial(),
            &store,
            delta,
            FinalExtensionDeltaV1::Unchanged,
            actual,
            prior_work(u64::from(actual)),
        );
        assert!(matches!(
            result,
            Err(TransactionPrepareFailureV1::InvalidChangeSet
                | TransactionPrepareFailureV1::LocalInvariant)
        ));
    }
}

#[test]
fn prepared_plan_reservation_failure_and_stale_target_leave_values_and_metrics_unchanged() {
    let mut store = build_live_score_store(&fixture()).unwrap();
    let before = store.export_document().unwrap();
    let plan = prepare_validated_final_state(
        &store,
        DocumentVersionV1::initial(),
        &store,
        FinalStateDeltaV1::default(),
        FinalExtensionDeltaV1::Unchanged,
        true,
        prior_work(2),
    )
    .unwrap()
    .unwrap();
    let mut version = DocumentVersionV1::initial();
    let mut metrics = KernelStage3MetricsV1::default();
    assert_eq!(
        plan.commit_with_policy(
            &mut store,
            &mut version,
            &mut metrics,
            CommitReservationPolicyV1::fail_all()
        ),
        Err(TransactionPrepareFailureV1::Capacity)
    );
    assert_eq!(store.export_document().unwrap(), before);
    assert_eq!(version, DocumentVersionV1::initial());
    assert_eq!(metrics, KernelStage3MetricsV1::default());
    for different_document in [false, true] {
        let plan = prepare_validated_final_state(
            &store,
            DocumentVersionV1::initial(),
            &store,
            FinalStateDeltaV1::default(),
            FinalExtensionDeltaV1::Unchanged,
            true,
            prior_work(2),
        )
        .unwrap()
        .unwrap();
        if different_document {
            version = DocumentVersionV1::initial();
            store.header.id = id("other-document");
        } else {
            version = version.checked_next().unwrap();
        }
        assert_eq!(
            plan.commit(&mut store, &mut version, &mut metrics),
            Err(TransactionPrepareFailureV1::PreconditionMismatch)
        );
        assert_eq!(metrics, KernelStage3MetricsV1::default());
    }
}
