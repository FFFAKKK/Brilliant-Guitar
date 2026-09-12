use super::*;
use crate::{
    candidate::tests::{id, raw_part},
    change_set::{ChangeSetBuilderV1, accounting::ChangeSetAccountingV1},
    store::{build_live_score_store, tests::fixture},
};
use brilliant_core_types::{DocumentVersionV1, SafeInteger};
use brilliant_kernel_contracts::{CoreCommandIdV1, KernelStage3MetricsV1};

fn verify_roundtrip(
    document: brilliant_score_foundation::ScoreDocumentV1,
    edit: impl FnOnce(&mut Recorder<'_>),
    expected: brilliant_score_foundation::ScoreDocumentV1,
) {
    let mut store = build_live_score_store(&document).unwrap();
    let mut recorder = Recorder::new(Candidate::new(
        TransactionOverlayV1::new(&store),
        document.id.clone(),
    ));
    edit(&mut recorder);
    assert_eq!(
        recorder
            .candidate
            .integrated_document(
                &|raw| StableId::new(raw.clone()).map_err(|_| Failure::InternalError)
            )
            .unwrap(),
        expected
    );
    let (plan, history) = recorder
        .prepare_combined_commit(&store, DocumentVersionV1::initial())
        .unwrap();
    let mut version = DocumentVersionV1::initial();
    let mut metrics = KernelStage3MetricsV1::default();
    plan.unwrap()
        .commit(&mut store, &mut version, &mut metrics)
        .unwrap();
    assert_eq!(store.export_document().unwrap(), expected);
    for direction in [
        Direction::Inverse,
        Direction::Forward,
        Direction::Inverse,
        Direction::Forward,
    ] {
        let expected_document = if matches!(direction, Direction::Inverse) {
            &document
        } else {
            &expected
        };
        history
            .prepare_replay(&store, version, direction)
            .unwrap()
            .unwrap()
            .commit(&mut store, &mut version, &mut metrics)
            .unwrap();
        assert_eq!(&store.export_document().unwrap(), expected_document);
    }
}

#[test]
fn score_extension_insert_replace_remove_and_net_zero_effects_replay_in_order() {
    let document = fixture();
    let mut added = document.extensions[0].clone();
    added.namespace = "module.new".into();
    added.payload.insert(
        JsString::from_utf16(vec![0xd800]),
        brilliant_core_types::JsonValue::Array(vec![
            brilliant_core_types::JsonValue::Number(
                brilliant_core_types::FiniteNumber::from_js_number(-0.0).unwrap(),
            ),
            brilliant_core_types::JsonValue::String(JsString::from_utf16(vec![0xdfff])),
        ]),
    );
    let mut replacement = document.extensions[1].clone();
    replacement.schema_version = SafeInteger::new(3).unwrap();
    let mut expected = document.clone();
    expected.extensions = vec![replacement.clone(), added.clone()];
    verify_roundtrip(
        document.clone(),
        |recorder| {
            let owner = recorder.candidate.document.clone();
            assert!(
                recorder
                    .edit_extension(added.namespace.clone(), &owner, Some(added.clone()))
                    .unwrap()
            );
            assert!(
                recorder
                    .edit_extension(replacement.namespace.clone(), &owner, Some(replacement))
                    .unwrap()
            );
            assert!(
                recorder
                    .edit_extension(document.extensions[0].namespace.clone(), &owner, None)
                    .unwrap()
            );
            assert!(
                !recorder
                    .edit_extension(added.namespace.clone(), &owner, Some(added))
                    .unwrap()
            );
            assert!(
                !recorder
                    .edit_extension("missing".into(), &owner, None)
                    .unwrap()
            );
            assert_eq!(recorder.steps.len(), 3);
        },
        expected,
    );
    verify_roundtrip(
        document.clone(),
        |recorder| {
            let owner = recorder.candidate.document.clone();
            let block = document.extensions[0].clone();
            recorder
                .edit_extension(block.namespace.clone(), &owner, None)
                .unwrap();
            recorder
                .edit_extension(block.namespace.clone(), &owner, Some(block))
                .unwrap();
        },
        {
            let mut expected = document.clone();
            expected.extensions.swap(0, 1);
            expected
        },
    );
}

#[test]
fn pure_module_net_zero_sequence_still_has_replayable_stored_operations() {
    let document = fixture();
    verify_roundtrip(
        document.clone(),
        |recorder| {
            let owner = recorder.candidate.document.clone();
            let original = document.extensions[0].clone();
            let mut modified = original.clone();
            modified.schema_version = SafeInteger::new(8).unwrap();
            recorder
                .edit_extension(modified.namespace.clone(), &owner, Some(modified))
                .unwrap();
            recorder
                .edit_extension(original.namespace.clone(), &owner, Some(original))
                .unwrap();
            assert_eq!(recorder.steps.len(), 2);
        },
        document.clone(),
    );
}

#[test]
fn stored_extension_replay_rejects_wrong_owner_and_each_reservation_failure() {
    let mut document = fixture();
    document.extensions[0].owner = ExtensionOwnerV1::Part {
        part_id: id("part-z"),
    };
    let store = build_live_score_store(&document).unwrap();
    let mut recorder = Recorder::new(Candidate::new(
        TransactionOverlayV1::new(&store),
        document.id.clone(),
    ));
    let owner = recorder
        .candidate
        .resolve(Kind::Part, &"part-z".into())
        .unwrap();
    let document_owner = recorder.candidate.document.clone();
    let document_identity = recorder
        .identities
        .record(&mut recorder.candidate, &document_owner)
        .unwrap();
    let mut modified = document.extensions[0].clone();
    modified.schema_version = SafeInteger::new(9).unwrap();
    recorder
        .edit_extension(modified.namespace.clone(), &owner, Some(modified.clone()))
        .unwrap();
    let (_, mut journal) = recorder.finish().unwrap();
    let mut expected = document.clone();
    expected.extensions[0] = modified;
    let after = build_live_score_store(&expected).unwrap();
    let mut probe = Candidate::new(TransactionOverlayV1::new(&after), document.id.clone());
    journal.replay(&mut probe, Direction::Inverse).unwrap();
    for fail_at in 1..=probe.reservation.attempts {
        let mut candidate = Candidate::new(TransactionOverlayV1::new(&after), document.id.clone());
        candidate.reservation = Reservation::fail_at(fail_at);
        assert!(
            journal.replay(&mut candidate, Direction::Inverse).is_err(),
            "replay reservation {fail_at}"
        );
        assert!(candidate.validate_final().is_err());
        assert_eq!(after.export_document().unwrap(), expected);
    }
    let Operation::Extension(inverse) = &mut journal.steps[0].inverse else {
        panic!("extension step")
    };
    Arc::make_mut(inverse).expected_owner = Some(document_identity);
    let mut candidate = Candidate::new(TransactionOverlayV1::new(&after), document.id.clone());
    assert_eq!(
        journal.replay(&mut candidate, Direction::Inverse),
        Err(Failure::InternalError)
    );
    assert!(candidate.validate_final().is_err());
    assert_eq!(after.export_document().unwrap(), expected);
}

#[test]
fn shared_effect_budget_rejects_a_changed_module_effect_but_allows_an_actual_no_op() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    let mut recorder = Recorder::new(Candidate::new(
        TransactionOverlayV1::new(&store),
        document.id.clone(),
    ));
    let owner = recorder.candidate.document.clone();
    let original = document.extensions[0].clone();
    recorder.set_effect_budget(crate::change_set::MAX_PREPARED_EFFECTS_V1);
    assert!(
        !recorder
            .edit_extension(original.namespace.clone(), &owner, Some(original.clone()))
            .unwrap()
    );
    let result = recorder.edit_extension(original.namespace.clone(), &owner, None);
    assert!(
        matches!(result, Err(Failure::ResourceLimitExceeded { limit_kind: brilliant_kernel_contracts::KernelStage3ResourceLimitKindV1::Effects, limit, actual })
        if limit == crate::change_set::MAX_PREPARED_EFFECTS_V1 && actual == limit + 1)
    );
    assert!(recorder.steps.is_empty());
    assert!(
        recorder
            .prepare_combined_commit(&store, DocumentVersionV1::initial())
            .is_err()
    );
    assert_eq!(store.export_document().unwrap(), document);
}

#[test]
fn module_write_then_part_death_and_same_id_rebirth_retains_each_extension_lifetime() {
    let mut document = fixture();
    let raw = document.parts[0].id.as_js_string().clone();
    document.extensions[0].owner = ExtensionOwnerV1::Part {
        part_id: id(raw.clone()),
    };
    let mut third = document.extensions[0].clone();
    third.namespace = "module.interleaved-owned".into();
    document.extensions.push(third);
    let mut changed = document.extensions[0].clone();
    changed.schema_version = SafeInteger::new(8).unwrap();
    let mut expected = document.clone();
    expected.parts[0].name = "new Part".into();
    expected
        .extensions
        .retain(|block| matches!(block.owner, ExtensionOwnerV1::Score));
    verify_roundtrip(
        document,
        |recorder| {
            let old = recorder.candidate.resolve(Kind::Part, &raw).unwrap();
            recorder
                .edit_extension(changed.namespace.clone(), &old, Some(changed))
                .unwrap();
            recorder.remove_part(&raw).unwrap();
            let new = recorder.insert_part(raw_part(raw.clone()), None).unwrap();
            recorder
                .replace_scalar(&new, Value::PartName("new Part".into()))
                .unwrap();
            assert!(
                recorder
                    .candidate
                    .read_part_extensions(&new)
                    .unwrap()
                    .is_empty()
            );
        },
        expected,
    );
}

#[test]
fn ambiguous_part_removal_remains_rejected_after_a_module_extension_write() {
    let mut document = fixture();
    document.extensions[0].owner = ExtensionOwnerV1::Part {
        part_id: id("part-z"),
    };
    let mut changed = document.extensions[0].clone();
    changed.schema_version = SafeInteger::new(7).unwrap();
    let store = build_live_score_store(&document).unwrap();
    let mut recorder = Recorder::new(Candidate::new(
        TransactionOverlayV1::new(&store),
        document.id.clone(),
    ));
    let added = recorder.insert_part(raw_part("part-z"), None).unwrap();
    recorder
        .edit_extension(changed.namespace.clone(), &added, Some(changed))
        .unwrap();
    // The existing TS Batch oracle rejects the ambiguous remove at child 1.
    assert_eq!(
        recorder.remove_part(&"part-z".into()),
        Err(Failure::InternalError)
    );
    assert!(
        recorder
            .prepare_combined_commit(&store, DocumentVersionV1::initial())
            .is_err()
    );
    assert_eq!(store.export_document().unwrap(), document);
}

#[test]
fn module_inserted_part_extension_and_core_part_removal_form_one_net_zero_history() {
    let document = fixture();
    let mut extension = document.extensions[0].clone();
    extension.owner = ExtensionOwnerV1::Part {
        part_id: id("temporary"),
    };
    verify_roundtrip(
        document.clone(),
        |recorder| {
            let added = recorder.insert_part(raw_part("temporary"), None).unwrap();
            recorder
                .edit_extension(extension.namespace.clone(), &added, Some(extension))
                .unwrap();
            recorder.remove_part(&"temporary".into()).unwrap();
        },
        document,
    );
}

#[test]
fn changed_candidate_payload_cannot_poison_recorded_extension_or_part_removal() {
    for remove_part in [false, true] {
        let mut document = fixture();
        document.extensions[0].owner = ExtensionOwnerV1::Part {
            part_id: id("part-z"),
        };
        let store = build_live_score_store(&document).unwrap();
        let mut recorder = Recorder::new(Candidate::new(
            TransactionOverlayV1::new(&store),
            document.id.clone(),
        ));
        let owner = recorder
            .candidate
            .resolve(Kind::Part, &"part-z".into())
            .unwrap();
        let block = document.extensions[0].clone();
        assert!(
            !recorder
                .edit_extension(block.namespace.clone(), &owner, Some(block.clone()))
                .unwrap()
        );
        let key = ExtensionKeyV1::from_block(&block);
        let expected = recorder.candidate.read_extension(&key).unwrap();
        let mut corrupt = expected.clone();
        corrupt.value.payload.insert(
            "unrecorded".into(),
            brilliant_core_types::JsonValue::Bool(true),
        );
        recorder
            .candidate
            .edit_extension(
                &key,
                Some(&expected),
                Some(&owner),
                Some(&corrupt),
                Some(&owner),
            )
            .unwrap();
        let result = if remove_part {
            recorder.remove_part(&"part-z".into()).map(|_| true)
        } else {
            recorder.edit_extension(block.namespace, &owner, None)
        };
        assert_eq!(result, Err(Failure::InternalError));
        assert!(
            recorder
                .prepare_combined_commit(&store, DocumentVersionV1::initial())
                .is_err()
        );
        assert_eq!(store.export_document().unwrap(), document);
    }
}

#[test]
fn every_module_extension_reservation_failure_poisoning_prevents_adoption() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    let mut extension = document.extensions[0].clone();
    extension.namespace = "module.added".into();
    let mut probe = Recorder::new(Candidate::new(
        TransactionOverlayV1::new(&store),
        document.id.clone(),
    ));
    let owner = probe.candidate.document.clone();
    probe
        .edit_extension(extension.namespace.clone(), &owner, Some(extension.clone()))
        .unwrap();
    for fail_at in 1..=probe.candidate.reservation.attempts {
        let mut recorder = Recorder::new(Candidate::new(
            TransactionOverlayV1::new(&store),
            document.id.clone(),
        ));
        recorder.candidate.reservation = Reservation::fail_at(fail_at);
        assert!(
            recorder
                .edit_extension(extension.namespace.clone(), &owner, Some(extension.clone()))
                .is_err(),
            "reservation {fail_at}"
        );
        assert!(
            recorder
                .prepare_combined_commit(&store, DocumentVersionV1::initial())
                .is_err()
        );
        assert_eq!(store.export_document().unwrap(), document);
    }
}

#[test]
fn candidate_extension_logical_charges_match_typed_extension_operations() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    let mut recorder = Recorder::new(Candidate::new(
        TransactionOverlayV1::new(&store),
        document.id.clone(),
    ));
    let owner = recorder.candidate.document.clone();
    let mut typed = ChangeSetBuilderV1::new();
    let mut raw = ChangeSetAccountingV1::default();
    let mut added = document.extensions[0].clone();
    added.namespace = "module.added".into();
    let mut next = added.clone();
    next.schema_version = SafeInteger::new(8).unwrap();
    for (before, after) in [
        (None, Some(added.clone())),
        (Some(added), Some(next.clone())),
        (Some(next), None),
    ] {
        let key = after
            .as_ref()
            .or(before.as_ref())
            .unwrap()
            .namespace
            .clone();
        let position = StableAnchorV1::After {
            sibling_id: header(&document.extensions[1]).anchor_id().unwrap(),
        };
        match (&before, &after) {
            (None, Some(after)) => typed
                .insert_extension_block(position.clone(), after.clone())
                .unwrap(),
            (Some(before), Some(after)) => typed
                .replace_extension_block(
                    key.clone(),
                    (&before.owner).into(),
                    before.clone(),
                    after.clone(),
                )
                .unwrap(),
            (Some(before), None) => typed
                .remove_extension_block(position, before.clone())
                .unwrap(),
            _ => unreachable!(),
        }
        let first = recorder.steps.len();
        recorder.edit_extension(key, &owner, after).unwrap();
        let facts = dispatch::LeafFacts {
            command_id: CoreCommandIdV1::DocumentSetMetadata,
            changed: true,
            effect_count: 1,
            affected: vec![],
        };
        assert_eq!(
            recorder
                .charge_segment(
                    first,
                    &accounting::ChargeContext::Ordinary,
                    &facts,
                    &mut raw
                )
                .unwrap(),
            1
        );
        assert_eq!(raw.logical_bytes(), typed.logical_bytes());
    }
}
