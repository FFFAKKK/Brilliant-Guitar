use super::*;
use crate::candidate::journal::accounting::ChargeContext;
use crate::change_set::{
    ChangeSetBuilderV1, EntityBundleV1, ScalarAddressV1, StableAnchorV1, StableEntityAddressV1,
    StableOrderAddressV1, StableOwnerAddressV1, accounting::ChangeSetAccountingV1,
};
use crate::overlay::CoreBaseReadV1;
use brilliant_kernel_contracts::{
    AffectedEntityAddressV1, CoreCommandEnvelopeV1 as Command, MeasureAnchorV1,
    ScoreEntityTargetV1 as Target,
};
use brilliant_score_foundation::ExtensionOwnerV1;

#[test]
fn part_removal_charges_affected_before_primitive_at_logical_limit() {
    use crate::change_set::{
        MAX_CHANGESET_LOGICAL_BYTES_V1,
        accounting::{RawAffectedKindV1, RawAffectedV1},
    };
    let document = canonical_fixture();
    let store = build_live_score_store(&document).unwrap();
    let mut recorder = Recorder::new(Candidate::new(
        TransactionOverlayV1::new(&store),
        document.id.clone(),
    ));
    let command = Command::PartRemove {
        target: Target::Part {
            part_id: document.parts[0].id.clone(),
        },
    };
    let context = ChargeContext::for_command(&command);
    let facts = recorder.dispatch_leaf(command).unwrap();
    let raw = |address: &AffectedEntityAddressV1| {
        let (kind, id) = match address {
            Target::Document { document_id } => (RawAffectedKindV1::Document, document_id),
            Target::Measure { measure_id } => (RawAffectedKindV1::Measure, measure_id),
            Target::Part { part_id } => (RawAffectedKindV1::Part, part_id),
            Target::Staff { staff_id } => (RawAffectedKindV1::Staff, staff_id),
            Target::Voice { voice_id } => (RawAffectedKindV1::Voice, voice_id),
            Target::Event { event_id } => (RawAffectedKindV1::Event, event_id),
            Target::Note { note_id } => (RawAffectedKindV1::Note, note_id),
        };
        (kind, id.as_js_string().clone())
    };
    let mut expected = ChangeSetAccountingV1::default();
    let mut actual = ChangeSetAccountingV1::default();
    for ledger in [&mut expected, &mut actual] {
        for address in &facts.affected {
            ledger.intern(&raw(address).1).unwrap();
        }
        ledger
            .charge_test_only(MAX_CHANGESET_LOGICAL_BYTES_V1 - 128 - ledger.logical_bytes())
            .unwrap();
    }
    let mut expected_output = Vec::new();
    let expected_error = facts
        .affected
        .iter()
        .find_map(|address| {
            let (kind, id) = raw(address);
            match expected.record_affected(RawAffectedV1 { kind, id: &id }) {
                Ok(true) => {
                    expected_output.push(address.clone());
                    None
                }
                Ok(false) => None,
                Err(error) => Some(error),
            }
        })
        .expect("fixture has enough affected entries to cross the boundary");
    let mut output = Vec::new();
    let error = recorder
        .charge_segment_with_affected(0, &context, &facts, &mut actual, &mut output)
        .unwrap_err();
    assert_eq!(error, expected_error);
    assert_eq!(actual.logical_bytes(), expected.logical_bytes());
    assert_eq!(actual.affected_count(), expected.affected_count());
    assert_eq!(output, expected_output);
    assert!(recorder.candidate.reservation.ensure_active().is_err());
}

fn canonical_fixture() -> brilliant_score_foundation::ScoreDocumentV1 {
    let mut document = fixture();
    for part in &mut document.parts {
        part.measure_contents.sort_by_key(|content| {
            document
                .measure_definitions
                .iter()
                .position(|measure| measure.id == content.measure_id)
                .unwrap()
        });
    }
    document
}

#[test]
fn scalar_failure_precedes_its_affected_charge() {
    use crate::change_set::MAX_CHANGESET_LOGICAL_BYTES_V1;
    let document = canonical_fixture();
    let store = build_live_score_store(&document).unwrap();
    let mut recorder = Recorder::new(Candidate::new(
        TransactionOverlayV1::new(&store),
        document.id.clone(),
    ));
    let command = Command::PartSetName {
        target: Target::Part {
            part_id: document.parts[0].id.clone(),
        },
        name: "charge order changed".into(),
    };
    let context = ChargeContext::for_command(&command);
    let facts = recorder.dispatch_leaf(command).unwrap();
    let mut primitive = ChangeSetAccountingV1::default();
    primitive
        .charge_test_only(MAX_CHANGESET_LOGICAL_BYTES_V1 - 64)
        .unwrap();
    let expected = recorder
        .charge_segment(0, &context, &facts, &mut primitive)
        .unwrap_err();
    // Failed accounting poisons its recorder. Use an identical fresh recorder.
    let mut recorder = Recorder::new(Candidate::new(
        TransactionOverlayV1::new(&store),
        document.id.clone(),
    ));
    let command = Command::PartSetName {
        target: Target::Part {
            part_id: document.parts[0].id.clone(),
        },
        name: "charge order changed".into(),
    };
    let facts = recorder.dispatch_leaf(command).unwrap();
    let mut accounting = ChangeSetAccountingV1::default();
    accounting
        .charge_test_only(MAX_CHANGESET_LOGICAL_BYTES_V1 - 64)
        .unwrap();
    let mut output = Vec::new();
    assert_eq!(
        recorder
            .charge_segment_with_affected(0, &context, &facts, &mut accounting, &mut output)
            .unwrap_err(),
        expected
    );
    assert_eq!(accounting.logical_bytes(), primitive.logical_bytes());
    assert_eq!(accounting.affected_count(), 0);
    assert!(output.is_empty());
}

#[test]
fn scalar_segments_share_typed_interning_and_charge_both_net_zero_commands() {
    let document = canonical_fixture();
    let store = build_live_score_store(&document).unwrap();
    let part = &document.parts[0];
    let mut recorder = Recorder::new(Candidate::new(
        TransactionOverlayV1::new(&store),
        document.id.clone(),
    ));
    let mut accounting = ChangeSetAccountingV1::default();
    let mut typed = ChangeSetBuilderV1::new();
    let changed: JsString = "accounting changed name".into();
    for (old, next) in [(&part.name, &changed), (&changed, &part.name)] {
        let command = Command::PartSetName {
            target: Target::Part {
                part_id: part.id.clone(),
            },
            name: next.clone(),
        };
        let context = ChargeContext::for_command(&command);
        let start = recorder.steps.len();
        let facts = recorder.dispatch_leaf(command).unwrap();
        assert_eq!(
            recorder
                .charge_segment(start, &context, &facts, &mut accounting)
                .unwrap(),
            1
        );
        typed
            .replace_scalar(
                ScalarAddressV1::PartName {
                    part_id: part.id.clone(),
                },
                Value::PartName(old.clone()),
                Value::PartName(next.clone()),
            )
            .unwrap();
        assert_eq!(accounting.logical_bytes(), typed.logical_bytes());
    }
    let start = recorder.steps.len();
    let command = Command::PartSetName {
        target: Target::Part {
            part_id: part.id.clone(),
        },
        name: part.name.clone(),
    };
    let context = ChargeContext::for_command(&command);
    recorder.candidate.reservation = Reservation::fail_at(1);
    let facts = recorder.dispatch_leaf(command).unwrap();
    assert!(!facts.changed);
    assert_eq!(
        recorder
            .charge_segment(start, &context, &facts, &mut accounting)
            .unwrap(),
        0
    );
    assert_eq!(recorder.candidate.reservation.attempts, 0);
    assert_eq!(accounting.logical_bytes(), typed.logical_bytes());
    assert_eq!(store.export_document().unwrap(), document);
}

#[test]
fn removed_part_subtree_and_owned_opaque_extensions_match_typed_bundle_charge() {
    let mut document = canonical_fixture();
    let mut owned = document.extensions[0].clone();
    owned.namespace = "accounting.owned".into();
    owned.owner = ExtensionOwnerV1::Part {
        part_id: document.parts[0].id.clone(),
    };
    document.extensions.push(owned);
    let store = build_live_score_store(&document).unwrap();
    let part = &document.parts[0];
    let bundle = store
        .detach_entity(&StableEntityAddressV1::Part {
            part_id: part.id.clone(),
        })
        .unwrap();
    let mut recorder = Recorder::new(Candidate::new(
        TransactionOverlayV1::new(&store),
        document.id.clone(),
    ));
    let command = Command::PartRemove {
        target: Target::Part {
            part_id: part.id.clone(),
        },
    };
    let context = ChargeContext::for_command(&command);
    let facts = recorder.dispatch_leaf(command).unwrap();
    let mut accounting = ChangeSetAccountingV1::default();
    assert_eq!(
        recorder
            .charge_segment(0, &context, &facts, &mut accounting)
            .unwrap(),
        1
    );
    let mut typed = ChangeSetBuilderV1::new();
    typed
        .remove_entity(
            StableOwnerAddressV1::Document {
                document_id: document.id.clone(),
            },
            StableOrderAddressV1::Parts {
                document_id: document.id.clone(),
            },
            StableAnchorV1::Start,
            bundle,
        )
        .unwrap();
    assert_eq!(accounting.logical_bytes(), typed.logical_bytes());
    assert_eq!(store.export_document().unwrap(), document);
}

#[test]
fn measure_aggregate_counts_content_order_pairs_as_primitives() {
    let document = canonical_fixture();
    let store = build_live_score_store(&document).unwrap();
    let measure = &document.measure_definitions[0];
    let bundle = store
        .detach_entity(&StableEntityAddressV1::Measure {
            measure_id: measure.id.clone(),
        })
        .unwrap();
    let EntityBundleV1::Measure(ref contents) = bundle else {
        panic!("measure bundle")
    };
    let mut typed = ChangeSetBuilderV1::new();
    for content in &contents.contents {
        let part = document
            .parts
            .iter()
            .find(|part| part.id == content.part_id)
            .unwrap();
        let index = part
            .measure_contents
            .iter()
            .position(|content| content.measure_id == measure.id)
            .unwrap();
        let anchor = index
            .checked_sub(1)
            .map(|index| StableAnchorV1::After {
                sibling_id: part.measure_contents[index].measure_id.clone(),
            })
            .unwrap_or(StableAnchorV1::Start);
        typed
            .remove_ordered_child(
                StableOrderAddressV1::MeasureContents {
                    part_id: part.id.clone(),
                },
                anchor,
                measure.id.clone(),
            )
            .unwrap();
    }
    typed
        .remove_entity(
            StableOwnerAddressV1::Document {
                document_id: document.id.clone(),
            },
            StableOrderAddressV1::Measures {
                document_id: document.id.clone(),
            },
            StableAnchorV1::Start,
            bundle,
        )
        .unwrap();
    let mut recorder = Recorder::new(Candidate::new(
        TransactionOverlayV1::new(&store),
        document.id.clone(),
    ));
    let command = Command::MeasureRemove {
        target: Target::Measure {
            measure_id: measure.id.clone(),
        },
    };
    let context = ChargeContext::for_command(&command);
    let facts = recorder.dispatch_leaf(command).unwrap();
    assert_eq!(facts.effect_count, 1);
    let mut accounting = ChangeSetAccountingV1::default();
    assert_eq!(
        recorder
            .charge_segment(0, &context, &facts, &mut accounting)
            .unwrap(),
        1 + document.parts.len() as u64
    );
    assert_eq!(accounting.logical_bytes(), typed.logical_bytes());
}

#[test]
fn measure_move_uses_ordered_child_weights_not_journal_replacement_weights() {
    let document = canonical_fixture();
    assert!(document.measure_definitions.len() > 1);
    let store = build_live_score_store(&document).unwrap();
    let target = &document.measure_definitions[1].id;
    let previous = &document.measure_definitions[0].id;
    let mut recorder = Recorder::new(Candidate::new(
        TransactionOverlayV1::new(&store),
        document.id.clone(),
    ));
    let command = Command::MeasureMove {
        target: Target::Measure {
            measure_id: target.clone(),
        },
        anchor: MeasureAnchorV1::Start,
    };
    let context = ChargeContext::for_command(&command);
    let facts = recorder.dispatch_leaf(command).unwrap();
    assert_eq!(facts.effect_count, 1);
    let mut typed = ChangeSetBuilderV1::new();
    for order in std::iter::once(StableOrderAddressV1::Measures {
        document_id: document.id.clone(),
    })
    .chain(
        document
            .parts
            .iter()
            .map(|part| StableOrderAddressV1::MeasureContents {
                part_id: part.id.clone(),
            }),
    ) {
        typed
            .move_ordered_child(
                order,
                target.clone(),
                StableAnchorV1::After {
                    sibling_id: previous.clone(),
                },
                StableAnchorV1::Start,
            )
            .unwrap();
    }
    let mut accounting = ChangeSetAccountingV1::default();
    assert_eq!(
        recorder
            .charge_segment(0, &context, &facts, &mut accounting)
            .unwrap(),
        1 + document.parts.len() as u64
    );
    assert_eq!(accounting.logical_bytes(), typed.logical_bytes());
    let attempts = recorder.candidate.reservation.attempts;
    assert!(attempts > 0);
    // Charge allocation failures poison the recorder, and never touch Store.
    recorder.candidate.reservation = Reservation::fail_at(1);
    assert!(
        recorder
            .charge_segment(0, &context, &facts, &mut ChangeSetAccountingV1::default())
            .is_err()
    );
    assert!(recorder.candidate.reservation.ensure_active().is_err());
    assert_eq!(store.export_document().unwrap(), document);
}

#[test]
fn global_noop_local_move_then_normalize_charges_two_distinct_typed_operations() {
    let mut document = canonical_fixture();
    let mut definition = document.measure_definitions[0].clone();
    definition.id = id("accounting-third-measure");
    document.measure_definitions.push(definition);
    let third = document.measure_definitions[2].id.clone();
    let target = document.measure_definitions[0].id.clone();
    for (index, part) in document.parts.iter_mut().enumerate() {
        let mut content = part.measure_contents[0].clone();
        content.measure_id = third.clone();
        content.voices.truncate(1);
        content.voices[0].id = id(format!("accounting-third-voice-{index}"));
        content.voices[0].sequence.events.clear();
        part.measure_contents.insert(0, content);
    }
    let store = build_live_score_store(&document).unwrap();
    let mut recorder = Recorder::new(Candidate::new(
        TransactionOverlayV1::new(&store),
        document.id.clone(),
    ));
    let command = Command::MeasureMove {
        target: Target::Measure {
            measure_id: target.clone(),
        },
        anchor: MeasureAnchorV1::Start,
    };
    let context = ChargeContext::for_command(&command);
    let facts = recorder.dispatch_leaf(command).unwrap();
    assert!(facts.changed);
    assert_eq!(facts.effect_count, 2);
    let mut typed = ChangeSetBuilderV1::new();
    for part in &document.parts {
        typed
            .move_ordered_child(
                StableOrderAddressV1::MeasureContents {
                    part_id: part.id.clone(),
                },
                target.clone(),
                StableAnchorV1::After {
                    sibling_id: third.clone(),
                },
                StableAnchorV1::Start,
            )
            .unwrap();
    }
    for part in &document.parts {
        typed
            .replace_ordered_children(
                StableOrderAddressV1::MeasureContents {
                    part_id: part.id.clone(),
                },
                vec![
                    target.clone(),
                    third.clone(),
                    document.measure_definitions[1].id.clone(),
                ],
                document
                    .measure_definitions
                    .iter()
                    .map(|measure| measure.id.clone())
                    .collect(),
            )
            .unwrap();
    }
    let mut accounting = ChangeSetAccountingV1::default();
    assert_eq!(
        recorder
            .charge_segment(0, &context, &facts, &mut accounting)
            .unwrap(),
        2 * document.parts.len() as u64
    );
    assert_eq!(accounting.logical_bytes(), typed.logical_bytes());
    assert_eq!(store.export_document().unwrap(), document);
}
