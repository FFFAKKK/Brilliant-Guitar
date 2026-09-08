use super::*;

fn id(raw: &str) -> StableId {
    StableId::new(raw).unwrap()
}

#[test]
fn raw_scalar_order_and_reference_pairs_match_typed_charges() {
    let target = JsString::from("part");
    let old = ScalarValueV1::PartName("old".into());
    let next = ScalarValueV1::PartName("new".into());
    let mut typed = ChangeSetBuilderV1::new();
    typed
        .replace_scalar(
            ScalarAddressV1::PartName {
                part_id: id("part"),
            },
            old.clone(),
            next.clone(),
        )
        .unwrap();
    let mut raw = ChangeSetAccountingV1::default();
    raw.charge_scalar_pair(&target, &old, &next).unwrap();
    assert_eq!(raw.logical_bytes(), typed.logical_bytes());
    let a = JsString::from("a");
    let b = JsString::from("b");
    typed
        .replace_ordered_children(
            StableOrderAddressV1::Staffs {
                part_id: id("part"),
            },
            vec![id("a"), id("b")],
            vec![id("b"), id("a")],
        )
        .unwrap();
    raw.charge_order_pair([&target], &[&a, &b], &[&b, &a])
        .unwrap();
    assert_eq!(raw.logical_bytes(), typed.logical_bytes());
    typed
        .update_reference(
            ReferenceAddressV1::EventStaffAssignment {
                event_id: id("part"),
            },
            ReferenceValueV1::OptionalStableId(Some(id("a"))),
            ReferenceValueV1::OptionalStableId(None),
        )
        .unwrap();
    raw.charge_reference_pair(
        [&target],
        RawReferenceValueV1::OptionalStableId(Some(&a)),
        RawReferenceValueV1::OptionalStableId(None),
    )
    .unwrap();
    assert_eq!(raw.logical_bytes(), typed.logical_bytes());
    let empty = JsString::from("");
    raw.charge_scalar_pair(&empty, &old, &next).unwrap();
    assert_eq!(
        raw.logical_bytes() - typed.logical_bytes(),
        CHANGE_OPERATION_WEIGHT * 2 + ARENA_ENTRY_WEIGHT * 2
    );
}

struct BorrowedEvent<'a>(&'a RhythmicEventV1);
impl RawEntityViewV1 for BorrowedEvent<'_> {
    fn visit_nodes(&self, visit: &mut dyn FnMut(RawEntityNodeV1<'_>) -> Outcome) -> Outcome {
        visit(RawEntityNodeV1::Event(&self.0.duration))?;
        if let RhythmicContentV1::Notes { notes } = &self.0.content {
            for _ in notes {
                visit(RawEntityNodeV1::Note)?;
            }
        }
        Ok(())
    }
    fn visit_strings(&self, visit: &mut dyn FnMut(&JsString) -> Outcome) -> Outcome {
        visit_event_strings(self.0, &mut |value| visit(value))
    }
}

#[test]
fn borrowed_entity_and_extension_values_match_typed_arena_charges() {
    let document = crate::store::tests::fixture();
    let voice = &document.parts[0].measure_contents[0].voices[0];
    let event = &voice.sequence.events[0];
    let mut typed = ChangeSetBuilderV1::new();
    typed
        .insert_entity(
            StableOwnerAddressV1::Voice {
                voice_id: voice.id.clone(),
            },
            StableOrderAddressV1::Events {
                voice_id: voice.id.clone(),
            },
            StableAnchorV1::Start,
            EntityBundleV1::Event(event.clone()),
        )
        .unwrap();
    let mut raw = ChangeSetAccountingV1::default();
    raw.charge_entity_pair(
        [voice.id.as_js_string(), voice.id.as_js_string()],
        &BorrowedEvent(event),
    )
    .unwrap();
    assert_eq!(raw.logical_bytes(), typed.logical_bytes());
    for extension in &document.extensions {
        typed
            .insert_extension_block(StableAnchorV1::Start, extension.clone())
            .unwrap();
        raw.charge_extension_pair(std::iter::empty(), &[extension])
            .unwrap();
        assert_eq!(raw.logical_bytes(), typed.logical_bytes());
    }
}

#[test]
fn promotion_transfers_pool_and_preserves_frozen_prefix_summary() {
    let mut typed = ChangeSetBuilderV1::new();
    typed
        .replace_scalar(
            ScalarAddressV1::PartName {
                part_id: id("part"),
            },
            ScalarValueV1::PartName("a".into()),
            ScalarValueV1::PartName("b".into()),
        )
        .unwrap();
    typed.add_prepared_effects(1).unwrap();
    let before = typed.logical_bytes();
    let mut shared = typed.take_accounting().unwrap();
    shared.intern(&JsString::from("a")).unwrap();
    assert_eq!(shared.logical_bytes(), before);
    assert!(typed.add_prepared_effects(1).is_err());
    assert!(typed.take_accounting().is_err());
    shared.add_prepared_effects(1).unwrap();
    let prefix = typed.finish();
    assert_eq!(prefix.logical_bytes, before);
    assert_eq!(prefix.prepared_effect_count, 1);
    assert_eq!(shared.prepared_effect_count(), 2);
}

#[test]
fn deferred_segment_reports_complete_effect_count_before_affected() {
    let mut shared = ChangeSetAccountingV1::default();
    shared
        .add_prepared_effects(MAX_PREPARED_EFFECTS_V1)
        .unwrap();
    shared.begin_deferred_segment().unwrap();
    shared.add_prepared_effects(3).unwrap();
    assert_eq!(
        shared.end_deferred_segment(),
        Err(ChangeSetBuildFailureV1::PreparedEffectsExceeded {
            limit: MAX_PREPARED_EFFECTS_V1,
            actual: MAX_PREPARED_EFFECTS_V1 + 3
        })
    );
}

#[test]
fn segment_affected_deduplicates_kind_and_raw_id_and_checks_full_actual() {
    let mut shared = ChangeSetAccountingV1::default();
    shared.begin_deferred_segment().unwrap();
    for index in 0..MAX_AFFECTED_ADDRESSES_V1 + 3 {
        let raw = JsString::from(format!("note-{index}"));
        shared
            .record_affected(RawAffectedV1 {
                kind: RawAffectedKindV1::Note,
                id: &raw,
            })
            .unwrap();
    }
    assert_eq!(
        shared.end_deferred_segment(),
        Err(ChangeSetBuildFailureV1::AffectedAddressesExceeded {
            limit: MAX_AFFECTED_ADDRESSES_V1,
            actual: MAX_AFFECTED_ADDRESSES_V1 + 3
        })
    );
    shared
        .add_prepared_effects(MAX_PREPARED_EFFECTS_V1 + 5)
        .unwrap();
    assert_eq!(
        shared.end_deferred_segment(),
        Err(ChangeSetBuildFailureV1::PreparedEffectsExceeded {
            limit: MAX_PREPARED_EFFECTS_V1,
            actual: MAX_PREPARED_EFFECTS_V1 + 5
        })
    );
    let mut shared = ChangeSetAccountingV1::default();
    let raw = JsString::from("");
    let note = RawAffectedV1 {
        kind: RawAffectedKindV1::Note,
        id: &raw,
    };
    shared
        .record_affected_segment(&[
            note,
            note,
            RawAffectedV1 {
                kind: RawAffectedKindV1::Event,
                id: &raw,
            },
        ])
        .unwrap();
    assert_eq!(shared.affected_count(), 2);
    assert_eq!(shared.logical_bytes(), AFFECTED_ADDRESS_WEIGHT * 2);
}
