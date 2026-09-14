use super::*;
use crate::store::{LiveScoreStore, build_live_score_store, tests::fixture};
use brilliant_core_types::JsonObject;
use std::cell::Cell;

fn headers(overlay: &TransactionOverlayV1<'_>) -> Vec<ExtensionHeaderV1> {
    let mut values = Vec::new();
    assert_eq!(
        overlay.visit_extension_headers(&mut |header| {
            values.push(header.clone());
            true
        }),
        Ok(())
    );
    values
}

fn after(header: &ExtensionHeaderV1) -> StableAnchorV1 {
    let owner = match &header.owner {
        ExtensionOwnerV1::Score => JsString::from("score"),
        ExtensionOwnerV1::Part { part_id } => {
            JsString::concat(&[&"part:".into(), part_id.as_js_string()])
        }
    };
    StableAnchorV1::After {
        sibling_id: StableId::new(JsString::concat(&[
            &"extension:".into(),
            &owner,
            &":".into(),
            &header.namespace,
        ]))
        .unwrap(),
    }
}

struct HeaderOnly<'a> {
    store: &'a LiveScoreStore,
    allow_owned_reads: Cell<bool>,
    header_visits: Cell<usize>,
}

impl CoreBaseReadV1 for HeaderOnly<'_> {
    fn resolve_entity(&self, _: &StableId) -> Option<StableEntityAddressV1> {
        panic!("entity lookup")
    }
    fn read_owner(&self, _: &StableEntityAddressV1) -> Option<StableOwnerAddressV1> {
        panic!("owner read")
    }
    fn read_scalar(&self, _: &ScalarAddressV1) -> Option<ScalarValueV1> {
        panic!("scalar read")
    }
    fn detach_entity(&self, _: &StableEntityAddressV1) -> Option<EntityBundleV1> {
        panic!("aggregate detach")
    }
    fn read_order(&self, _: &StableOrderAddressV1) -> Option<Vec<StableId>> {
        panic!("owned synthetic anchor order")
    }
    fn read_extension(&self, key: &ExtensionKeyV1) -> Option<AnchoredExtensionBlockV1> {
        assert!(
            self.allow_owned_reads.get(),
            "header projection cloned an opaque extension"
        );
        self.store.read_extension(key)
    }
    fn visit_extension_headers(
        &self,
        visitor: &mut dyn FnMut(&ExtensionHeaderV1) -> bool,
    ) -> Result<(), ExtensionHeaderReadFailureV1> {
        self.store.visit_extension_headers(&mut |header| {
            self.header_visits.set(self.header_visits.get() + 1);
            visitor(header)
        })
    }
    fn read_reference(&self, _: &ReferenceAddressV1) -> Option<ReferenceValueV1> {
        panic!("reference read")
    }
    fn list_references_to(&self, _: &StableId) -> Vec<ReferenceAddressV1> {
        panic!("reference index")
    }
    fn read_voice_time(&self, _: &StableId) -> Option<Vec<StableId>> {
        panic!("voice time")
    }
}

#[test]
fn store_and_untouched_overlay_visit_headers_without_owned_payload_reads() {
    let mut document = fixture();
    let raw_owner = JsString::from_utf16(vec![0x70, 0x3a, 0xd800]);
    document.parts[0].id = StableId::new(raw_owner.clone()).unwrap();
    document.extensions[0].owner = ExtensionOwnerV1::Part {
        part_id: document.parts[0].id.clone(),
    };
    document.extensions[0].namespace = JsString::from_utf16(vec![0x78, 0x2e, 0xdc00]);
    document.extensions[0].payload.insert(
        "opaque".into(),
        BoundedJsonValue::Array(vec![
            BoundedJsonValue::Object(JsonObject::from([(
                "nested".into(),
                BoundedJsonValue::Array(vec![BoundedJsonValue::Null; 512])
            )]));
            64
        ]),
    );
    let store = build_live_score_store(&document).unwrap();
    let guard = HeaderOnly {
        store: &store,
        allow_owned_reads: Cell::new(false),
        header_visits: Cell::new(0),
    };
    let overlay = TransactionOverlayV1::new(&guard);
    let projected = headers(&overlay);
    assert_eq!(
        projected,
        document
            .extensions
            .iter()
            .map(ExtensionHeaderV1::from_block)
            .collect::<Vec<_>>()
    );
    for (header, handle) in projected.iter().zip(&store.topology.extension_order) {
        let record = &store.extensions[*handle];
        assert_eq!(
            header.namespace.code_units().as_ptr(),
            record.namespace.code_units().as_ptr()
        );
        if let ExtensionOwnerV1::Part { part_id } = &header.owner {
            assert_eq!(
                part_id.as_js_string().code_units().as_ptr(),
                raw_owner.code_units().as_ptr()
            );
        }
    }
    assert_eq!(guard.header_visits.get(), 2);
    guard.header_visits.set(0);
    assert_eq!(overlay.visit_extension_headers(&mut |_| false), Ok(()));
    assert_eq!(
        guard.header_visits.get(),
        1,
        "untouched visitor stops without reading later slots"
    );
    assert_eq!(overlay.operation_count(), 0);
    assert_eq!(overlay.metrics(), &OverlayWorkMetricsV1::default());
}

#[test]
fn edited_header_view_keeps_exact_insert_replace_remove_and_reinsert_order() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    let guard = HeaderOnly {
        store: &store,
        allow_owned_reads: Cell::new(true),
        header_visits: Cell::new(0),
    };
    let mut overlay = TransactionOverlayV1::new(&guard);
    let first = ExtensionHeaderV1::from_block(&document.extensions[0]);
    let last = ExtensionHeaderV1::from_block(&document.extensions[1]);
    let mut inserted = document.extensions[0].clone();
    inserted.namespace = JsString::from_utf16(vec![0x78, 0x2e, 0xd800]);
    overlay
        .insert_extension(after(&first), inserted.clone())
        .unwrap();
    let mut replacement = document.extensions[1].clone();
    replacement.schema_version = safe(7);
    overlay
        .replace_extension(
            ExtensionKeyV1::from_block(&replacement),
            replacement.clone(),
        )
        .unwrap();
    overlay
        .remove_extension(ExtensionKeyV1::from_block(&document.extensions[0]))
        .unwrap();
    overlay
        .insert_extension(after(&last), document.extensions[0].clone())
        .unwrap();
    guard.allow_owned_reads.set(false);
    guard.header_visits.set(0);
    let operation_count = overlay.operation_count();
    assert_eq!(
        headers(&overlay),
        [
            ExtensionHeaderV1::from_block(&inserted),
            ExtensionHeaderV1::from_block(&replacement),
            first
        ]
    );
    assert_eq!(overlay.operation_count(), operation_count);
    assert_eq!(guard.header_visits.get(), 2);
}

#[test]
fn part_bundle_removal_and_restoration_keep_extension_position() {
    let mut document = fixture();
    let mut owned = document.extensions[0].clone();
    owned.namespace = "example.part".into();
    owned.owner = ExtensionOwnerV1::Part {
        part_id: document.parts[0].id.clone(),
    };
    document.extensions.insert(1, owned);
    let store = build_live_score_store(&document).unwrap();
    let mut overlay = TransactionOverlayV1::new(&store);
    let owner = StableOwnerAddressV1::Document {
        document_id: document.id.clone(),
    };
    let order = StableOrderAddressV1::Parts {
        document_id: document.id.clone(),
    };
    let part = StableEntityAddressV1::Part {
        part_id: document.parts[0].id.clone(),
    };
    let bundle = store.detach_entity(&part).unwrap();
    overlay
        .remove_entity(owner.clone(), order.clone(), part.clone())
        .unwrap();
    assert_eq!(
        headers(&overlay),
        [
            ExtensionHeaderV1::from_block(&document.extensions[0]),
            ExtensionHeaderV1::from_block(&document.extensions[2])
        ]
    );
    overlay
        .insert_entity(owner, order, StableAnchorV1::Start, part, bundle)
        .unwrap();
    assert_eq!(
        headers(&overlay),
        document
            .extensions
            .iter()
            .map(ExtensionHeaderV1::from_block)
            .collect::<Vec<_>>()
    );
}

#[test]
fn unavailable_or_unresolvable_header_views_never_report_an_empty_document() {
    let base = FakeBaseV1 {
        headers_unavailable: true,
        ..FakeBaseV1::default()
    };
    let mut overlay = TransactionOverlayV1::new(&base);
    assert_eq!(
        overlay.visit_extension_headers(&mut |_| panic!("unavailable base")),
        Err(ExtensionHeaderReadFailureV1::Unavailable)
    );
    let extension = fixture().extensions.remove(0);
    overlay
        .insert_extension(StableAnchorV1::Start, extension.clone())
        .unwrap();
    assert_eq!(
        overlay.visit_extension_headers(&mut |_| panic!("unavailable base with edits")),
        Err(ExtensionHeaderReadFailureV1::Unavailable)
    );
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    let mut overlay = TransactionOverlayV1::new(&store);
    let mut inserted = extension;
    inserted.namespace = "example.inserted".into();
    overlay
        .insert_extension(
            StableAnchorV1::After {
                sibling_id: id("absent-anchor"),
            },
            inserted,
        )
        .unwrap();
    assert_eq!(
        overlay
            .visit_extension_headers(&mut |_| panic!("invalid anchor must fail before callbacks")),
        Err(ExtensionHeaderReadFailureV1::Invariant)
    );
}

#[test]
fn header_log_capacity_failure_is_terminal_before_writes() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    let mut overlay = TransactionOverlayV1::new(&store);
    assert_eq!(
        overlay.reserve_extension_header_edits(usize::MAX),
        Err(OverlayFailureV1::TransactionPoisoned)
    );
    assert!(overlay.extension_header_edits.is_empty());
    assert_eq!(overlay.operation_count(), 0);
    assert_eq!(
        overlay.visit_extension_headers(&mut |_| panic!("poisoned")),
        Err(ExtensionHeaderReadFailureV1::Invariant)
    );
    assert_eq!(
        overlay.remove_extension(ExtensionKeyV1::from_block(&document.extensions[0])),
        Err(OverlayFailureV1::TransactionPoisoned)
    );
    assert_eq!(store.export_document().unwrap(), document);
}

#[test]
fn generic_extension_orders_merge_with_header_edits_in_execution_order() {
    let mut document = fixture();
    let mut third = document.extensions[0].clone();
    third.namespace = "example.third".into();
    document.extensions.push(third);
    let store = build_live_score_store(&document).unwrap();
    let mut overlay = TransactionOverlayV1::new(&store);
    let order = StableOrderAddressV1::Extensions {
        document_id: document.id.clone(),
    };
    let ids = store.read_order(&order).unwrap();
    let original = document
        .extensions
        .iter()
        .map(ExtensionHeaderV1::from_block)
        .collect::<Vec<_>>();
    overlay
        .move_ordered_child(order.clone(), ids[2].clone(), StableAnchorV1::Start)
        .unwrap();
    assert_eq!(
        headers(&overlay),
        [
            original[2].clone(),
            original[0].clone(),
            original[1].clone()
        ]
    );
    overlay
        .replace_ordered_children(
            order.clone(),
            vec![ids[1].clone(), ids[2].clone(), ids[0].clone()],
        )
        .unwrap();
    assert_eq!(
        headers(&overlay),
        [
            original[1].clone(),
            original[2].clone(),
            original[0].clone()
        ]
    );
    overlay
        .remove_ordered_child(order.clone(), ids[1].clone())
        .unwrap();
    let mut replacement = document.extensions[1].clone();
    replacement.schema_version = safe(9);
    overlay
        .replace_extension(
            ExtensionKeyV1::from_block(&replacement),
            replacement.clone(),
        )
        .unwrap();
    assert_eq!(
        headers(&overlay),
        [original[2].clone(), original[0].clone()]
    );
    overlay
        .insert_ordered_child(order, after(&original[2]), ids[1].clone())
        .unwrap();
    let replaced = ExtensionHeaderV1::from_block(&replacement);
    assert_eq!(
        headers(&overlay),
        [original[2].clone(), replaced.clone(), original[0].clone()]
    );
    let mut inserted = document.extensions[0].clone();
    inserted.namespace = "example.middle".into();
    overlay
        .insert_extension(after(&replaced), inserted.clone())
        .unwrap();
    assert_eq!(
        headers(&overlay),
        [
            original[2].clone(),
            replaced,
            ExtensionHeaderV1::from_block(&inserted),
            original[0].clone()
        ]
    );
}

#[test]
fn edited_header_fold_capacity_failure_never_calls_the_consumer() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    // Exercise base collection, insertion, detached collection, re-insertion,
    // and full order replacement reservations in the same fold.
    let mut overlay = TransactionOverlayV1::new(&store);
    let mut added = document.extensions[0].clone();
    added.namespace = "example.added".into();
    let order = StableOrderAddressV1::Extensions {
        document_id: document.id.clone(),
    };
    let mut ids = overlay.read_order(&order).unwrap();
    overlay
        .remove_ordered_child(order.clone(), ids[0].clone())
        .unwrap();
    overlay
        .insert_ordered_child(order.clone(), StableAnchorV1::Start, ids[0].clone())
        .unwrap();
    ids.reverse();
    overlay.replace_ordered_children(order, ids).unwrap();
    overlay
        .insert_extension(StableAnchorV1::Start, added)
        .unwrap();
    let expected = headers(&overlay);
    let count = overlay.operation_count();
    for fail_at in 1..=document.extensions.len() + 4 {
        fail_header_reservation_at(Some(fail_at));
        let result =
            overlay.visit_extension_headers(&mut |_| panic!("partial header view escaped"));
        fail_header_reservation_at(None);
        assert_eq!(
            result,
            Err(ExtensionHeaderReadFailureV1::Capacity),
            "reservation {fail_at}"
        );
        assert_eq!(overlay.operation_count(), count);
        assert_eq!(headers(&overlay), expected);
    }
    assert_eq!(store.export_document().unwrap(), document);
}

#[test]
fn part_extensions_project_current_members_payloads_and_global_predecessors() {
    let mut document = fixture();
    let part_id = document.parts[0].id.clone();
    for extension in &mut document.extensions {
        extension.owner = ExtensionOwnerV1::Part {
            part_id: part_id.clone(),
        };
    }
    let store = build_live_score_store(&document).unwrap();
    let mut overlay = TransactionOverlayV1::new(&store);
    let mut score_extension = document.extensions[0].clone();
    score_extension.namespace = "example.score-predecessor".into();
    score_extension.owner = ExtensionOwnerV1::Score;
    overlay
        .insert_extension(StableAnchorV1::Start, score_extension.clone())
        .unwrap();
    let mut replacement = document.extensions[0].clone();
    replacement.schema_version = safe(23);
    replacement
        .payload
        .insert("updated".into(), BoundedJsonValue::Bool(true));
    overlay
        .replace_extension(
            ExtensionKeyV1::from_block(&replacement),
            replacement.clone(),
        )
        .unwrap();
    overlay
        .remove_extension(ExtensionKeyV1::from_block(&document.extensions[1]))
        .unwrap();
    let expected = vec![AnchoredExtensionBlockV1 {
        anchor: after(&ExtensionHeaderV1::from_block(&score_extension)),
        value: replacement.clone(),
    }];
    assert_eq!(overlay.read_part_extensions(&part_id).unwrap(), expected);
    let EntityBundleV1::Part(bundle) = overlay
        .read_entity(&StableEntityAddressV1::Part {
            part_id: part_id.clone(),
        })
        .unwrap()
    else {
        panic!("Part bundle");
    };
    assert_eq!(bundle.extensions, expected);
    overlay
        .remove_extension(ExtensionKeyV1::from_block(&score_extension))
        .unwrap();
    let EntityBundleV1::Part(bundle) = overlay
        .read_entity(&StableEntityAddressV1::Part { part_id })
        .unwrap()
    else {
        panic!("Part bundle");
    };
    assert_eq!(
        bundle.extensions,
        vec![AnchoredExtensionBlockV1 {
            anchor: StableAnchorV1::Start,
            value: replacement
        }]
    );
    assert_eq!(store.export_document().unwrap(), document);
}

#[test]
fn part_extension_projection_capacity_failure_returns_no_partial_bundle() {
    let mut document = fixture();
    let part_id = document.parts[0].id.clone();
    for extension in &mut document.extensions {
        extension.owner = ExtensionOwnerV1::Part {
            part_id: part_id.clone(),
        };
    }
    let store = build_live_score_store(&document).unwrap();
    let overlay = TransactionOverlayV1::new(&store);
    // Two owned entries plus the second entry's synthetic predecessor ID.
    for at in 1..=3 {
        fail_header_reservation_at(Some(at));
        let result = overlay.read_part_extensions(&part_id);
        fail_header_reservation_at(None);
        assert_eq!(result, Err(ExtensionHeaderReadFailureV1::Capacity));
    }
    assert_eq!(overlay.read_part_extensions(&part_id).unwrap().len(), 2);
    assert_eq!(store.export_document().unwrap(), document);
}

#[test]
fn standalone_extension_owner_references_follow_insert_replace_and_remove() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    let mut overlay = TransactionOverlayV1::new(&store);
    let part_id = document.parts[0].id.clone();
    let mut extension = document.extensions[0].clone();
    extension.namespace = "example.owner-reference".into();
    extension.owner = ExtensionOwnerV1::Part {
        part_id: part_id.clone(),
    };
    let key = ExtensionKeyV1::from_block(&extension);
    let reference = ReferenceAddressV1::ExtensionOwner {
        namespace: key.namespace.clone(),
        owner: key.owner.clone(),
    };
    overlay
        .insert_extension(StableAnchorV1::Start, extension.clone())
        .unwrap();
    assert_eq!(
        overlay.read_reference(&reference),
        Some(ReferenceValueV1::ExtensionOwner(extension.owner.clone()))
    );
    assert!(overlay.list_references_to(&part_id).contains(&reference));
    extension.schema_version = safe(17);
    overlay
        .replace_extension(key.clone(), extension.clone())
        .unwrap();
    assert_eq!(
        overlay
            .list_references_to(&part_id)
            .iter()
            .filter(|item| *item == &reference)
            .count(),
        1
    );
    overlay.remove_extension(key).unwrap();
    assert_eq!(overlay.read_reference(&reference), None);
    assert!(!overlay.list_references_to(&part_id).contains(&reference));
    assert_eq!(store.export_document().unwrap(), document);
}

#[test]
fn standalone_extension_anchor_tracks_global_edits_and_detached_payload_survives() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    let mut overlay = TransactionOverlayV1::new(&store);
    let original = document.extensions[0].clone();
    let key = ExtensionKeyV1::from_block(&original);
    let mut predecessor = original.clone();
    predecessor.namespace = "example.new-predecessor".into();
    overlay
        .insert_extension(StableAnchorV1::Start, predecessor.clone())
        .unwrap();
    let expected_anchor = after(&ExtensionHeaderV1::from_block(&predecessor));
    assert_eq!(
        overlay.read_extension(&key).unwrap().anchor,
        expected_anchor
    );
    overlay.remove_extension(key.clone()).unwrap();
    let changes = overlay.finish().unwrap();
    let crate::change_set::ChangeOpV1::RemoveExtensionBlock {
        expected_anchor: actual,
        ..
    } = &changes.forward[1]
    else {
        panic!("remove extension operation");
    };
    assert_eq!(actual, &expected_anchor);

    let mut overlay = TransactionOverlayV1::new(&store);
    let order = StableOrderAddressV1::Extensions {
        document_id: document.id.clone(),
    };
    let ids = store.read_order(&order).unwrap();
    overlay
        .remove_ordered_child(order.clone(), ids[0].clone())
        .unwrap();
    assert_eq!(overlay.read_extension(&key).unwrap().value, original);
    let mut replacement = original;
    replacement.schema_version = safe(29);
    overlay
        .replace_extension(key.clone(), replacement.clone())
        .unwrap();
    overlay
        .insert_ordered_child(
            order,
            after(&ExtensionHeaderV1::from_block(&document.extensions[1])),
            ids[0].clone(),
        )
        .unwrap();
    assert_eq!(
        overlay.read_extension(&key).unwrap(),
        AnchoredExtensionBlockV1 {
            anchor: after(&ExtensionHeaderV1::from_block(&document.extensions[1])),
            value: replacement,
        }
    );
    assert_eq!(store.export_document().unwrap(), document);
}

#[test]
fn extension_order_reads_and_generic_writes_follow_current_standalone_membership() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    let order = StableOrderAddressV1::Extensions {
        document_id: document.id.clone(),
    };
    let original = store.read_order(&order).unwrap();
    let mut overlay = TransactionOverlayV1::new(&store);
    let mut first = document.extensions[0].clone();
    first.namespace = "example.inserted-first".into();
    let first_header = ExtensionHeaderV1::from_block(&first);
    let first_id = first_header.anchor_id().unwrap();
    let mut second = first.clone();
    second.namespace = "example.inserted-second".into();
    let second_id = ExtensionHeaderV1::from_block(&second).anchor_id().unwrap();
    let assert_order = |overlay: &TransactionOverlayV1<'_>, expected: &[StableId]| {
        assert_eq!(overlay.read_order(&order).as_deref(), Some(expected));
        let mut visited = Vec::new();
        overlay
            .visit_order(&order, &mut |id| {
                visited.push(id.clone());
                true
            })
            .unwrap();
        assert_eq!(visited, expected);
        let from_headers: Vec<_> = headers(overlay)
            .iter()
            .map(|header| header.anchor_id().unwrap())
            .collect();
        assert_eq!(from_headers, expected);
    };
    overlay
        .insert_extension(StableAnchorV1::Start, first.clone())
        .unwrap();
    assert_order(
        &overlay,
        &[first_id.clone(), original[0].clone(), original[1].clone()],
    );
    let mut visits = 0;
    overlay
        .visit_order(&order, &mut |_| {
            visits += 1;
            false
        })
        .unwrap();
    assert_eq!(visits, 1);
    assert!(
        overlay
            .read_order(&StableOrderAddressV1::Extensions {
                document_id: id("another-document")
            })
            .is_none()
    );
    overlay
        .remove_extension(ExtensionKeyV1::from_block(&document.extensions[0]))
        .unwrap();
    overlay
        .replace_ordered_children(order.clone(), vec![original[1].clone(), first_id.clone()])
        .unwrap();
    assert_order(&overlay, &[original[1].clone(), first_id.clone()]);
    overlay
        .insert_extension(
            StableAnchorV1::After {
                sibling_id: original[1].clone(),
            },
            second.clone(),
        )
        .unwrap();
    assert_order(
        &overlay,
        &[original[1].clone(), second_id, first_id.clone()],
    );
    // A generic write must refresh its previously materialized order after
    // standalone insertion. Detached payloads remain available for reinsertion.
    overlay
        .remove_ordered_child(order.clone(), first_id.clone())
        .unwrap();
    overlay
        .remove_extension(ExtensionKeyV1::from_block(&second))
        .unwrap();
    overlay
        .insert_ordered_child(order.clone(), StableAnchorV1::Start, first_id.clone())
        .unwrap();
    assert_order(&overlay, &[first_id.clone(), original[1].clone()]);
    overlay
        .move_ordered_child(
            order.clone(),
            first_id.clone(),
            StableAnchorV1::After {
                sibling_id: original[1].clone(),
            },
        )
        .unwrap();
    assert_order(&overlay, &[original[1].clone(), first_id]);
    assert_eq!(
        overlay
            .read_extension(&ExtensionKeyV1::from_block(&first))
            .unwrap()
            .value,
        first
    );
    assert_eq!(store.export_document().unwrap(), document);
}
