use super::*;
use crate::{
    candidate::adoption::FinalizationFailure,
    change_set::StableAnchorV1,
    indices::{normalized_index_projection, rebuild_indices_from_store},
    overlay::{CoreBaseReadV1, ExtensionKeyV1},
    store::LiveScoreStore,
};
use brilliant_core_types::{DocumentVersionV1, JsonValue};
use brilliant_kernel_contracts::KernelStage3MetricsV1;
use brilliant_score_foundation::{ExtensionOwnerV1, ScoreDocumentV1};

fn document() -> ScoreDocumentV1 {
    let mut document = fixture();
    let mut second = document.parts[0].clone();
    second.id = id("part-b");
    second.staves.truncate(1);
    second.staves[0].id = id("staff-b");
    for (index, content) in second.measure_contents.iter_mut().enumerate() {
        content.voices.truncate(1);
        content.voices[0].id = id(format!("voice-b-{index}"));
        content.voices[0].default_staff_id = id("staff-b");
        content.voices[0].sequence.events.clear();
    }
    document.parts.push(second);
    let template = document.extensions[0].clone();
    document.extensions = [
        ("example.score", ExtensionOwnerV1::Score),
        (
            "example.a-one",
            ExtensionOwnerV1::Part {
                part_id: id("part-z"),
            },
        ),
        (
            "example.b-one",
            ExtensionOwnerV1::Part {
                part_id: id("part-b"),
            },
        ),
        (
            "example.a-two",
            ExtensionOwnerV1::Part {
                part_id: id("part-z"),
            },
        ),
    ]
    .into_iter()
    .map(|(namespace, owner)| {
        let mut extension = template.clone();
        extension.namespace = namespace.into();
        extension.owner = owner;
        extension
    })
    .collect();
    document
}

fn without_a(document: &ScoreDocumentV1) -> ScoreDocumentV1 {
    let mut expected = document.clone();
    expected.parts.retain(|part| part.id != id("part-z"));
    expected.extensions.retain(|extension| !matches!(&extension.owner, ExtensionOwnerV1::Part { part_id } if part_id == &id("part-z")));
    expected
}

fn indices(store: &LiveScoreStore) {
    let (rebuilt, _) = rebuild_indices_from_store(store).unwrap();
    assert_eq!(
        normalized_index_projection(store, &store.indices).unwrap(),
        normalized_index_projection(store, &rebuilt).unwrap()
    );
}

macro_rules! roundtrip {
    ($recorder:ident, $store:ident, $initial:ident, $expected:ident) => {{
        let (plan, history) = $recorder
            .prepare_combined_commit(&$store, DocumentVersionV1::initial())
            .expect("initial prepare");
        assert_eq!($store.export_document().unwrap(), $initial);
        let mut version = DocumentVersionV1::initial();
        let mut metrics = KernelStage3MetricsV1::default();
        plan.expect("initial prepare produced a commit")
            .commit(&mut $store, &mut version, &mut metrics)
            .expect("initial commit");
        for stage in 0..3 {
            if stage != 0 {
                history
                    .prepare_replay(
                        &$store,
                        version,
                        if stage == 1 {
                            Direction::Inverse
                        } else {
                            Direction::Forward
                        },
                    )
                    .unwrap_or_else(|error| panic!("replay stage {stage}: {error:?}"))
                    .unwrap_or_else(|| panic!("replay stage {stage} produced no commit"))
                    .commit(&mut $store, &mut version, &mut metrics)
                    .unwrap_or_else(|error| panic!("replay commit stage {stage}: {error:?}"));
            }
            assert_eq!(
                $store.export_document().unwrap(),
                if stage == 1 {
                    $initial.clone()
                } else {
                    $expected.clone()
                }
            );
            assert_eq!(version.get(), stage + 1);
            assert_eq!(metrics.full_semantic_validations, 1);
            indices(&$store);
        }
    }};
}

#[test]
fn prefix_part_removal_restores_interleaved_score_and_other_part_extensions_exactly() {
    let initial = document();
    let expected = without_a(&initial);
    let mut store = build_live_score_store(&initial).unwrap();
    let mut recorder = Recorder::new(Candidate::new(
        TransactionOverlayV1::new(&store),
        initial.id.clone(),
    ));
    recorder.remove_part_command(&"part-z".into()).unwrap();
    roundtrip!(recorder, store, initial, expected);
}

#[test]
fn deleting_two_parts_recomputes_trusted_extension_predecessors_before_each_death() {
    let mut initial = document();
    let mut survivor = initial.parts[1].clone();
    survivor.id = id("part-survivor");
    survivor.staves[0].id = id("staff-survivor");
    for (index, content) in survivor.measure_contents.iter_mut().enumerate() {
        content.voices[0].id = id(format!("voice-survivor-{index}"));
        content.voices[0].default_staff_id = id("staff-survivor");
    }
    initial.parts.push(survivor.clone());
    let mut expected = initial.clone();
    expected.parts = vec![survivor];
    expected
        .extensions
        .retain(|extension| extension.owner == ExtensionOwnerV1::Score);
    let mut store = build_live_score_store(&initial).unwrap();
    let mut recorder = Recorder::new(Candidate::new(
        TransactionOverlayV1::new(&store),
        initial.id.clone(),
    ));
    // B is the old predecessor of A's second extension. A's later snapshot
    // must name its new predecessor after B's already-recorded deletion.
    recorder.remove_part_command(&"part-b".into()).unwrap();
    recorder.remove_part_command(&"part-z".into()).unwrap();
    roundtrip!(recorder, store, initial, expected);
}

#[test]
fn typed_extension_payload_order_removal_and_insertion_compose_with_suffix_part_death() {
    let initial = document();
    let mut expected = initial.clone();
    let mut store = build_live_score_store(&initial).unwrap();
    let mut prefix = TransactionOverlayV1::new(&store);
    let order = Order::Extensions {
        document_id: initial.id.clone(),
    };
    let mut ids = store.read_order(&order).unwrap();
    ids.reverse();
    prefix.replace_ordered_children(order, ids).unwrap();
    expected.extensions.reverse();
    let mut modified = initial.extensions[1].clone();
    modified.schema_version = SafeInteger::new(31).unwrap();
    modified.payload.insert(
        "new-value".into(),
        JsonValue::String("current payload".into()),
    );
    prefix
        .replace_extension(ExtensionKeyV1::from_block(&modified), modified.clone())
        .unwrap();
    *expected
        .extensions
        .iter_mut()
        .find(|value| value.namespace == modified.namespace)
        .unwrap() = modified.clone();
    prefix
        .remove_extension(ExtensionKeyV1::from_block(&initial.extensions[3]))
        .unwrap();
    expected
        .extensions
        .retain(|value| value.namespace != initial.extensions[3].namespace);
    let mut inserted = initial.extensions[1].clone();
    inserted.namespace = "example.a-three".into();
    prefix
        .insert_extension(StableAnchorV1::Start, inserted.clone())
        .unwrap();
    expected.extensions.insert(0, inserted);
    let mut predecessor = initial.extensions[0].clone();
    predecessor.namespace = "example.new-score-predecessor".into();
    prefix
        .insert_extension(StableAnchorV1::Start, predecessor.clone())
        .unwrap();
    expected.extensions.insert(0, predecessor);
    let mut recorder = Recorder::new(Candidate::new(prefix, initial.id.clone()));
    recorder.remove_part_command(&"part-z".into()).unwrap();
    expected = without_a(&expected);
    roundtrip!(recorder, store, initial, expected);
}

#[test]
fn same_id_part_rebirth_does_not_inherit_old_extensions_or_old_slot_generations() {
    let initial = document();
    let mut expected = initial.clone();
    expected.extensions = without_a(&initial).extensions;
    let mut store = build_live_score_store(&initial).unwrap();
    let old_entities = store.indices.entity.by_id.clone();
    let old_extensions = store.topology.extension_order.clone();
    let mut recorder = Recorder::new(Candidate::new(
        TransactionOverlayV1::new(&store),
        initial.id.clone(),
    ));
    recorder.remove_part_command(&"part-z".into()).unwrap();
    recorder.insert_part(raw_part("part-z"), None).unwrap();
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
                initial.clone()
            } else {
                expected.clone()
            }
        );
        assert_ne!(
            store.indices.entity.by_id[&id("part-z")],
            old_entities[&id("part-z")]
        );
        assert_ne!(
            store.indices.entity.by_id[&id("event-a")],
            old_entities[&id("event-a")]
        );
        assert_eq!(
            store.indices.entity.by_id[&id("part-b")],
            old_entities[&id("part-b")]
        );
        assert!(!store.extensions.contains_key(old_extensions[1]));
        assert!(!store.extensions.contains_key(old_extensions[3]));
        assert!(store.extensions.contains_key(old_extensions[0]));
        assert!(store.extensions.contains_key(old_extensions[2]));
        assert_eq!(version.get(), stage + 1);
        assert_eq!(metrics.full_semantic_validations, 1);
        indices(&store);
    }
}

#[test]
fn last_part_removal_is_only_semantically_rejected_and_a_later_insert_can_repair_it() {
    let mut initial = document();
    initial.parts.pop();
    initial.extensions.retain(|value| !matches!(&value.owner, ExtensionOwnerV1::Part { part_id } if part_id == &id("part-b")));
    let mut store = build_live_score_store(&initial).unwrap();
    let mut recorder = Recorder::new(Candidate::new(
        TransactionOverlayV1::new(&store),
        initial.id.clone(),
    ));
    recorder.remove_part_command(&"part-z".into()).unwrap();
    assert!(
        matches!(recorder.prepare_combined_commit(&store, DocumentVersionV1::initial()), Err(FinalizationFailure::Command(Failure::SemanticInvalid { diagnostics })) if !diagnostics.is_empty())
    );
    assert_eq!(store.export_document().unwrap(), initial);
    let mut recorder = Recorder::new(Candidate::new(
        TransactionOverlayV1::new(&store),
        initial.id.clone(),
    ));
    recorder.remove_part_command(&"part-z".into()).unwrap();
    recorder.insert_part(raw_part("part-z"), None).unwrap();
    let mut expected = initial.clone();
    expected
        .extensions
        .retain(|value| matches!(value.owner, ExtensionOwnerV1::Score));
    roundtrip!(recorder, store, initial, expected);
}

#[test]
fn part_target_errors_precede_reservations_and_coverage_errors_preserve_candidate_state() {
    let initial = document();
    let store = build_live_score_store(&initial).unwrap();
    for case in 0..5 {
        let mut candidate = Candidate::new(TransactionOverlayV1::new(&store), initial.id.clone());
        let target: JsString = if case < 2 { "part-z" } else { "bad-coverage" }.into();
        if case != 0 {
            let mut payload = raw_part(&target);
            match case {
                1 => payload.measure_contents.clear(),
                2 => {
                    payload.measure_contents.pop();
                }
                3 => {
                    payload.measure_contents[1].measure_id =
                        payload.measure_contents[0].measure_id.clone()
                }
                4 => payload.measure_contents[1].measure_id = "unknown-measure".into(),
                _ => unreachable!(),
            }
            candidate.insert_part(payload, None).unwrap();
        }
        let mut recorder = Recorder::new(candidate);
        let node_count = recorder.candidate.nodes.len();
        let orders = recorder.candidate.orders.clone();
        let hidden = recorder.candidate.hidden.clone();
        if case < 2 {
            recorder.candidate.reservation = Reservation::fail_at(1);
        }
        let target = if case == 0 { "missing".into() } else { target };
        let result = recorder.remove_part_command(&target);
        assert_eq!(
            result,
            Err(if case == 0 {
                Failure::TargetNotFound
            } else {
                Failure::InternalError
            }),
            "case {case}"
        );
        if case < 2 {
            assert_eq!(recorder.candidate.reservation.attempts, 0, "case {case}");
        }
        assert!(recorder.steps.is_empty());
        assert_eq!(recorder.candidate.nodes.len(), node_count);
        assert_eq!(recorder.candidate.orders, orders);
        assert_eq!(recorder.candidate.hidden, hidden);
        assert!(recorder.candidate.reservation.ensure_active().is_err());
        assert_eq!(store.export_document().unwrap(), initial);
    }
}

#[test]
fn added_same_id_part_does_not_capture_or_destroy_the_prefix_lifetimes_extensions() {
    let initial = document();
    let store = build_live_score_store(&initial).unwrap();
    let mut recorder = Recorder::new(Candidate::new(
        TransactionOverlayV1::new(&store),
        initial.id.clone(),
    ));
    recorder.insert_part(raw_part("part-z"), None).unwrap();
    assert_eq!(
        recorder.remove_part_command(&"part-z".into()),
        Err(Failure::InternalError)
    );

    // Keep an internally removed transient only to seal its identity manifest;
    // exercise the actual stored insertion and inverse separately below.
    let mut recorder = Recorder::new(Candidate::new(
        TransactionOverlayV1::new(&store),
        initial.id.clone(),
    ));
    let temporary = recorder.insert_part(raw_part("part-z"), None).unwrap();
    recorder.candidate.hide(&temporary).unwrap();
    let (_, journal) = recorder.finish().unwrap();
    let Operation::InsertEntity {
        bundle: StoredEntityBundle::Part(bundle),
        ..
    } = &journal.steps[0].forward
    else {
        panic!("Part insertion");
    };
    assert!(bundle.extensions.is_empty());
    let mut candidate = Candidate::new(TransactionOverlayV1::new(&store), initial.id.clone());
    let mut bindings = ReplayBindings::at(
        &journal.identities,
        BoundarySide::SuffixStart,
        &mut candidate,
    )
    .unwrap();
    journal.steps[0]
        .forward
        .apply(&mut candidate, &mut bindings)
        .unwrap();
    journal.steps[0]
        .inverse
        .apply(&mut candidate, &mut bindings)
        .unwrap();
    let mut headers = Vec::new();
    candidate
        .prefix
        .visit_extension_headers(&mut |header| {
            headers.push(header.clone());
            true
        })
        .unwrap();
    assert_eq!(headers.len(), initial.extensions.len());
    assert!(candidate.resolve(Kind::Part, &"part-z".into()).is_ok());
    let view = candidate.validate_final().unwrap();
    for extension in &initial.extensions {
        let key = ExtensionKeyV1::from_block(extension);
        assert_eq!(view.read_extension(&key), store.read_extension(&key));
    }
    assert_eq!(store.export_document().unwrap(), initial);
}

#[test]
fn every_part_extension_record_and_replay_reservation_failure_is_terminal() {
    let initial = document();
    let end = without_a(&initial);
    let store = build_live_score_store(&initial).unwrap();
    let end_store = build_live_score_store(&end).unwrap();
    let mut baseline = Recorder::new(Candidate::new(
        TransactionOverlayV1::new(&store),
        initial.id.clone(),
    ));
    baseline.remove_part_command(&"part-z".into()).unwrap();
    let attempts = baseline.candidate.reservation.attempts;
    assert!(attempts > 0);
    for at in 1..=attempts {
        let mut recorder = Recorder::new(Candidate::new(
            TransactionOverlayV1::new(&store),
            initial.id.clone(),
        ));
        recorder.candidate.reservation = Reservation::fail_at(at);
        assert_eq!(
            recorder.remove_part_command(&"part-z".into()),
            Err(Failure::InternalError),
            "record {at}"
        );
        assert_eq!(recorder.candidate.reservation.attempts, at);
        assert_eq!(
            recorder.remove_part_command(&"part-z".into()),
            Err(Failure::InternalError)
        );
        assert!(
            std::mem::take(&mut recorder.identities)
                .finish(&mut recorder.candidate)
                .is_err()
        );
        assert_eq!(store.export_document().unwrap(), initial);
    }
    let (_, journal) = baseline.finish().unwrap();
    for inverse in [false, true] {
        let source = if inverse { &end_store } else { &store };
        let direction = || {
            if inverse {
                Direction::Inverse
            } else {
                Direction::Forward
            }
        };
        let mut baseline = Candidate::new(TransactionOverlayV1::new(source), initial.id.clone());
        journal.replay(&mut baseline, direction()).unwrap();
        let attempts = baseline.reservation.attempts;
        assert!(attempts > 0);
        for at in 1..=attempts {
            let mut candidate =
                Candidate::new(TransactionOverlayV1::new(source), initial.id.clone());
            candidate.reservation = Reservation::fail_at(at);
            assert_eq!(
                journal.replay(&mut candidate, direction()),
                Err(Failure::InternalError),
                "inverse={inverse}, allocation={at}"
            );
            assert_eq!(candidate.reservation.attempts, at);
            assert_eq!(
                journal.replay(&mut candidate, direction()),
                Err(Failure::InternalError)
            );
            assert!(IdentityRecorder::default().finish(&mut candidate).is_err());
            assert_eq!(store.export_document().unwrap(), initial);
            assert_eq!(end_store.export_document().unwrap(), end);
        }
    }
}

#[test]
fn stored_part_removal_rejects_tampered_extension_payload_owner_and_anchor() {
    let initial = document();
    let store = build_live_score_store(&initial).unwrap();
    let mut recorder = Recorder::new(Candidate::new(
        TransactionOverlayV1::new(&store),
        initial.id.clone(),
    ));
    recorder.remove_part_command(&"part-z".into()).unwrap();
    let (_, journal) = recorder.finish().unwrap();
    for case in 0..3 {
        let mut operation = journal.steps[0].forward.clone();
        let Operation::RemoveEntity {
            expected: StoredEntityBundle::Part(bundle),
            ..
        } = &mut operation
        else {
            panic!("Part removal");
        };
        let extensions = Arc::make_mut(&mut Arc::make_mut(bundle).extensions);
        assert_eq!(extensions.len(), 2);
        match case {
            0 => {
                extensions[0]
                    .value
                    .payload
                    .insert("tampered".into(), JsonValue::Bool(true));
            }
            1 => {
                extensions[0].value.owner = ExtensionOwnerV1::Part {
                    part_id: id("part-b"),
                }
            }
            2 => {
                extensions[0].anchor = StableAnchorV1::After {
                    sibling_id: id("missing-anchor"),
                }
            }
            _ => unreachable!(),
        }
        let mut candidate = Candidate::new(TransactionOverlayV1::new(&store), initial.id.clone());
        let mut bindings = ReplayBindings::at(
            &journal.identities,
            BoundarySide::SuffixStart,
            &mut candidate,
        )
        .unwrap();
        let hidden = candidate.hidden.clone();
        assert_eq!(
            operation.apply(&mut candidate, &mut bindings),
            Err(Failure::InternalError),
            "case {case}"
        );
        assert_eq!(candidate.hidden, hidden);
        assert!(candidate.resolve(Kind::Part, &"part-z".into()).is_ok());
        assert_eq!(store.export_document().unwrap(), initial);
    }
}
