use super::*;
use crate::{
    candidate::tests::{id, raw_part},
    store::{build_live_score_store, tests::fixture},
};
use brilliant_core_types::SafeInteger;

mod fields;

fn invalid_part() -> AdmissionPartV1 {
    let mut part = raw_part("temporary");
    part.name = "Raw part".into();
    part.instrument.name = "Raw instrument".into();
    for staff in &mut part.staves {
        staff.id.clear();
    }
    part.staves[0].line_count = SafeInteger::new(4).unwrap();
    part.staves[1].line_count = SafeInteger::new(6).unwrap();
    for content in &mut part.measure_contents {
        for voice in &mut content.voices {
            voice.id.clear();
            voice.default_staff_id.clear();
            for event in &mut voice.sequence.events {
                event.id.clear();
                if let Some(staff) = &mut event.staff_id {
                    staff.clear();
                }
                if let RhythmicContentV1::Notes { notes } = &mut event.content {
                    for note in notes {
                        note.id.clear();
                    }
                }
            }
        }
    }
    part.measure_contents.push(part.measure_contents[0].clone());
    part
}

fn part_ids(candidate: &mut Candidate<'_>) -> Vec<String> {
    let mut result = Vec::new();
    candidate
        .visit_order(
            &CandidateOrder::new(&candidate.document.clone(), Children::Parts),
            &mut |_, raw| {
                result.push(raw.to_owned());
                true
            },
        )
        .unwrap();
    result
}

fn net_zero(candidate: Candidate<'_>) -> (Candidate<'_>, Journal) {
    let mut recorder = Recorder::new(candidate);
    recorder.insert_part(invalid_part(), None).unwrap();
    recorder.remove_part("temporary").unwrap();
    recorder.finish().unwrap()
}

fn inserted_bundle(journal: &Journal) -> &Arc<PartBundle> {
    let Operation::InsertEntity { bundle, .. } = &journal.steps[0].forward else {
        panic!("insert operation");
    };
    bundle
}

#[test]
fn net_zero_part_journal_keeps_nonempty_forward_inverse_and_replays_from_stored_data() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    let prepare = || {
        let mut prefix = TransactionOverlayV1::new(&store);
        prefix
            .replace_scalar(
                Scalar::PartName {
                    part_id: id("part-z"),
                },
                Value::PartName("typed prefix".into()),
            )
            .unwrap();
        prefix
    };
    let expected = prepare().finish().unwrap();
    let (mut recorded, journal) = net_zero(Candidate::new(prepare(), document.id.clone()));
    assert_eq!(journal.steps.len(), 2);
    assert!(matches!(
        journal.steps[0].inverse,
        Operation::RemoveEntity { .. }
    ));
    assert!(matches!(
        journal.steps[1].inverse,
        Operation::InsertEntity { .. }
    ));
    assert_eq!(part_ids(&mut recorded), ["part-z"]);
    assert_eq!(recorded.prefix.finish().unwrap(), expected);
    let bundle = inserted_bundle(&journal);
    assert_eq!(
        bundle.nodes[0].image.value,
        Some(Value::PartName("Raw part".into()))
    );
    assert_eq!(
        bundle.nodes[0].image.instrument.as_ref().unwrap().name,
        "Raw instrument"
    );
    assert_eq!(
        bundle
            .nodes
            .iter()
            .filter(|node| node.image.kind == Kind::Content)
            .count(),
        3
    );
    assert!(
        bundle
            .nodes
            .iter()
            .filter(|node| matches!(
                node.image.kind,
                Kind::Staff | Kind::Voice | Kind::Event | Kind::Note
            ))
            .all(|node| node.image.raw_id.is_empty())
    );

    for direction in [Direction::Forward, Direction::Inverse] {
        let mut candidate = Candidate::new(prepare(), document.id.clone());
        let padding = candidate.insert_part(raw_part("padding"), None).unwrap();
        candidate.hide(&padding).unwrap();
        let old_len = candidate.nodes.len();
        let old_pool = candidate.id_pool.clone();
        journal.replay(&mut candidate, direction).unwrap();
        assert_eq!(part_ids(&mut candidate), ["part-z"]);
        assert_eq!(candidate.nodes.len() - old_len, bundle.nodes.len());
        for (node, image) in candidate.nodes[old_len..].iter().zip(&bundle.nodes) {
            let expected_id = old_pool
                .get(image.image.raw_id.as_ref())
                .unwrap_or(&image.image.raw_id);
            assert!(
                Arc::ptr_eq(&node.raw_id, expected_id),
                "replay must retain either the preexisting pool allocation or the journal allocation"
            );
            if let Some(reference) = &image.image.staff_id {
                let expected_reference = old_pool.get(reference.as_ref()).unwrap_or(reference);
                assert!(Arc::ptr_eq(
                    node.staff_id.as_ref().unwrap(),
                    expected_reference
                ));
            }
            assert_eq!(node.value, image.image.value);
            assert_eq!(node.instrument, image.image.instrument);
            assert_eq!(node.staff_id, image.image.staff_id);
            assert_eq!(node.content_kind, image.image.content_kind);
        }
        assert_eq!(candidate.prefix.finish().unwrap(), expected);
    }
    assert_eq!(store.export_document().unwrap(), document);
}

#[test]
fn replay_preserves_transient_fields_orders_and_distinct_empty_occurrences_at_each_step() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    let (_, journal) = net_zero(Candidate::new(
        TransactionOverlayV1::new(&store),
        document.id.clone(),
    ));
    let mut candidate = Candidate::new(TransactionOverlayV1::new(&store), document.id);
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
    let bundle = inserted_bundle(&journal);
    let sources: Vec<_> = bundle
        .nodes
        .iter()
        .map(|node| bindings.resolve(node.id, &candidate).unwrap())
        .collect();
    assert_eq!(part_ids(&mut candidate), ["temporary", "part-z"]);
    let staves: Vec<_> = bundle
        .nodes
        .iter()
        .enumerate()
        .filter(|(_, node)| node.image.kind == Kind::Staff)
        .map(|(index, _)| index)
        .collect();
    assert_ne!(sources[staves[0]], sources[staves[1]]);
    assert!(
        matches!(candidate.read_value(&sources[staves[0]]), Some(Value::StaffDefinition { line_count, .. }) if line_count == SafeInteger::new(4).unwrap())
    );
    assert!(
        matches!(candidate.read_value(&sources[staves[1]]), Some(Value::StaffDefinition { line_count, .. }) if line_count == SafeInteger::new(6).unwrap())
    );
    bundle
        .verify(
            &mut candidate,
            &Occurrence::prefix(Entity::Document {
                document_id: id("score-root"),
            }),
            &sources,
        )
        .unwrap();
    journal.steps[1]
        .forward
        .apply(&mut candidate, &mut bindings)
        .unwrap();
    for node in &bundle.nodes {
        assert_eq!(
            bindings.resolve(node.id, &candidate),
            Err(Failure::InternalError)
        );
    }
    journal.steps[1]
        .inverse
        .apply(&mut candidate, &mut bindings)
        .unwrap();
    for (node, old) in bundle.nodes.iter().zip(&sources) {
        assert_ne!(bindings.resolve(node.id, &candidate).unwrap(), *old);
    }
    journal.steps[0]
        .inverse
        .apply(&mut candidate, &mut bindings)
        .unwrap();
    assert_eq!(part_ids(&mut candidate), ["part-z"]);
}

#[test]
fn inverse_removal_verifies_a_valid_subtree_from_the_strong_end_store() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    let prepare = || {
        let mut prefix = TransactionOverlayV1::new(&store);
        prefix
            .remove_entity(
                Owner::Document {
                    document_id: document.id.clone(),
                },
                Order::Parts {
                    document_id: document.id.clone(),
                },
                Entity::Part {
                    part_id: id("part-z"),
                },
            )
            .unwrap();
        prefix
    };
    let mut recorder = Recorder::new(Candidate::new(prepare(), document.id.clone()));
    recorder.insert_part(raw_part("survivor"), None).unwrap();
    let (_, journal) = recorder.finish().unwrap();
    let mut forward = Candidate::new(prepare(), document.id.clone());
    journal.replay(&mut forward, Direction::Forward).unwrap();
    assert_eq!(part_ids(&mut forward), ["survivor"]);
    let mut end_document = document.clone();
    end_document.parts[0].id = id("survivor");
    let end_store = build_live_score_store(&end_document).unwrap();
    let mut inverse = Candidate::new(TransactionOverlayV1::new(&end_store), document.id);
    journal.replay(&mut inverse, Direction::Inverse).unwrap();
    assert!(
        part_ids(&mut inverse).is_empty(),
        "the strong prefix is inverted separately after the suffix"
    );
    assert_eq!(end_store.export_document().unwrap(), end_document);

    let mut extension = end_document.extensions[0].clone();
    extension.namespace = "unexpected.part-data".into();
    extension.owner = brilliant_score_foundation::ExtensionOwnerV1::Part {
        part_id: id("survivor"),
    };
    end_document.extensions.push(extension);
    let drifted_store = build_live_score_store(&end_document).unwrap();
    let mut drifted = Candidate::new(
        TransactionOverlayV1::new(&drifted_store),
        end_document.id.clone(),
    );
    assert_eq!(
        journal.replay(&mut drifted, Direction::Inverse),
        Err(Failure::InternalError)
    );
    assert_eq!(part_ids(&mut drifted), ["survivor"]);
    assert_eq!(
        drifted.reservation.ensure_active(),
        Err(Failure::InternalError)
    );
    assert_eq!(drifted_store.export_document().unwrap(), end_document);
}

#[test]
fn removal_expected_values_orders_and_predecessor_are_checked_before_hiding_or_unbinding() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    let (_, journal) = net_zero(Candidate::new(
        TransactionOverlayV1::new(&store),
        document.id.clone(),
    ));
    let bundle = inserted_bundle(&journal);
    for change in [
        "scalar",
        "reference",
        "instrument",
        "content-kind",
        "order",
        "predecessor",
    ] {
        let mut candidate = Candidate::new(TransactionOverlayV1::new(&store), document.id.clone());
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
        let root = bindings.resolve(bundle.nodes[0].id, &candidate).unwrap();
        let source = |kind| {
            bundle
                .nodes
                .iter()
                .find(|node| node.image.kind == kind)
                .unwrap()
                .id
        };
        match change {
            "scalar" => {
                candidate
                    .replace_value(&root, Value::PartName("unexpected".into()))
                    .unwrap();
            }
            "reference" => {
                let voice = bindings.resolve(source(Kind::Voice), &candidate).unwrap();
                candidate
                    .replace_staff_reference(&voice, Some("unexpected".into()))
                    .unwrap();
            }
            "instrument" => {
                let mut instrument = candidate.read_instrument(&root).unwrap();
                instrument.name = "unexpected".into();
                candidate.replace_instrument(&root, instrument).unwrap();
            }
            "content-kind" => {
                let Occurrence::Added(index) =
                    bindings.resolve(source(Kind::Event), &candidate).unwrap()
                else {
                    panic!("added");
                };
                candidate.nodes[index].content_kind = Some(EventContentKind::Rest);
            }
            "order" => {
                candidate
                    .orders
                    .get_mut(&CandidateOrder::new(&root, Children::Staffs))
                    .unwrap()
                    .reverse();
            }
            "predecessor" => {
                candidate.insert_part(raw_part("unexpected"), None).unwrap();
            }
            _ => unreachable!(),
        }
        let before = part_ids(&mut candidate);
        assert_eq!(
            journal.steps[1]
                .forward
                .apply(&mut candidate, &mut bindings),
            Err(Failure::InternalError),
            "{change}"
        );
        assert_eq!(part_ids(&mut candidate), before);
        assert!(candidate.visible(&root));
        for node in &bundle.nodes {
            bindings.resolve(node.id, &candidate).unwrap();
        }
    }
    assert_eq!(store.export_document().unwrap(), document);
}

#[test]
fn malformed_bundles_and_manifest_mismatches_fail_before_inserting_nodes() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    let (_, journal) = net_zero(Candidate::new(
        TransactionOverlayV1::new(&store),
        document.id.clone(),
    ));
    let Operation::InsertEntity {
        owner,
        anchor,
        bundle,
    } = &journal.steps[0].forward
    else {
        panic!("insert");
    };
    for change in [
        "duplicate-id",
        "missing-child",
        "double-owner",
        "external-child",
        "wrong-field",
        "wrong-raw-id",
        "wrong-root",
        "wrong-journal-owner",
    ] {
        let mut broken = bundle.as_ref().clone();
        match change {
            "duplicate-id" => broken.nodes[2].id = broken.nodes[1].id,
            "missing-child" => {
                Arc::make_mut(&mut broken.nodes[0].orders)[0].1.pop();
            }
            "double-owner" => broken.nodes[2].parent = Some(1),
            "external-child" => Arc::make_mut(&mut broken.nodes[0].orders)[0]
                .1
                .push(usize::MAX),
            "wrong-field" => {
                Arc::make_mut(&mut broken.nodes[1].image).value =
                    Some(Value::PartName("bad".into()))
            }
            "wrong-raw-id" => {
                Arc::make_mut(&mut broken.nodes[1].image).raw_id = Arc::from("unexpected")
            }
            "wrong-root" => broken.nodes[0].parent = Some(0),
            "wrong-journal-owner" => {
                let other = broken
                    .nodes
                    .iter()
                    .position(|node| node.image.kind == Kind::Content)
                    .unwrap();
                let temp = broken.nodes[1].id;
                broken.nodes[1].id = broken.nodes[other].id;
                broken.nodes[other].id = temp;
            }
            _ => unreachable!(),
        }
        let operation = Operation::InsertEntity {
            owner: *owner,
            anchor: *anchor,
            bundle: Arc::new(broken),
        };
        let mut candidate = Candidate::new(TransactionOverlayV1::new(&store), document.id.clone());
        let mut bindings = ReplayBindings::at(
            &journal.identities,
            BoundarySide::SuffixStart,
            &mut candidate,
        )
        .unwrap();
        assert_eq!(
            operation.apply(&mut candidate, &mut bindings),
            Err(Failure::InternalError),
            "{change}"
        );
        assert!(candidate.nodes.is_empty());
        assert_eq!(part_ids(&mut candidate), ["part-z"]);
    }
}

#[test]
fn recorder_rejects_prefix_or_foreign_added_parts_and_unrecorded_subtree_changes() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    for kind in ["prefix", "foreign", "modified"] {
        let mut candidate = Candidate::new(TransactionOverlayV1::new(&store), document.id.clone());
        let raw = if kind == "prefix" {
            "part-z"
        } else {
            "temporary"
        };
        if kind == "foreign" {
            candidate.insert_part(invalid_part(), None).unwrap();
        }
        let mut recorder = Recorder::new(candidate);
        if kind == "modified" {
            let root = recorder.insert_part(invalid_part(), None).unwrap();
            recorder
                .candidate
                .replace_value(&root, Value::PartName("not journaled".into()))
                .unwrap();
        }
        let before = part_ids(&mut recorder.candidate);
        assert_eq!(recorder.remove_part(raw), Err(Failure::InternalError));
        assert_eq!(part_ids(&mut recorder.candidate), before);
        assert!(recorder.finish().is_err());
    }
    assert_eq!(store.export_document().unwrap(), document);
}

#[test]
fn every_recording_reservation_failure_is_terminal_and_preserves_the_strong_prefix() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    let prepare = || {
        let mut prefix = TransactionOverlayV1::new(&store);
        prefix
            .replace_scalar(
                Scalar::PartName {
                    part_id: id("part-z"),
                },
                Value::PartName("prefix".into()),
            )
            .unwrap();
        prefix
    };
    let expected = prepare().finish().unwrap();
    let run = |recorder: &mut Recorder<'_>| -> Result<(), Failure> {
        recorder.insert_part(invalid_part(), None)?;
        recorder.remove_part("temporary")
    };
    let mut baseline = Recorder::new(Candidate::new(prepare(), document.id.clone()));
    run(&mut baseline).unwrap();
    assert!(baseline.candidate.reservation.sites & 0x8000 != 0);
    for fail_at in 1..=baseline.candidate.reservation.attempts {
        let mut recorder = Recorder::new(Candidate::new(prepare(), document.id.clone()));
        recorder.candidate.reservation = Reservation::fail_at(fail_at);
        assert_eq!(
            run(&mut recorder),
            Err(Failure::InternalError),
            "reservation {fail_at}"
        );
        assert_eq!(recorder.candidate.reservation.attempts, fail_at);
        assert_eq!(
            recorder.insert_part(invalid_part(), None),
            Err(Failure::InternalError)
        );
        let identities = std::mem::take(&mut recorder.identities);
        assert!(identities.finish(&mut recorder.candidate).is_err());
        assert_eq!(recorder.candidate.prefix.finish().unwrap(), expected);
    }
    assert_eq!(store.export_document().unwrap(), document);
}

#[test]
fn every_replay_reservation_failure_including_final_binding_forbids_sealing_and_resuming() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    let expected = TransactionOverlayV1::new(&store).finish().unwrap();
    let (_, journal) = net_zero(Candidate::new(
        TransactionOverlayV1::new(&store),
        document.id.clone(),
    ));
    for inverse in [false, true] {
        let direction = || {
            if inverse {
                Direction::Inverse
            } else {
                Direction::Forward
            }
        };
        let mut baseline = Candidate::new(TransactionOverlayV1::new(&store), document.id.clone());
        journal.replay(&mut baseline, direction()).unwrap();
        for fail_at in 1..=baseline.reservation.attempts {
            let mut candidate =
                Candidate::new(TransactionOverlayV1::new(&store), document.id.clone());
            candidate.reservation = Reservation::fail_at(fail_at);
            assert_eq!(
                journal.replay(&mut candidate, direction()),
                Err(Failure::InternalError),
                "inverse={inverse} reservation={fail_at}"
            );
            assert_eq!(candidate.reservation.attempts, fail_at);
            assert_eq!(
                candidate.reservation.ensure_active(),
                Err(Failure::InternalError)
            );
            assert_eq!(
                candidate.insert_part(invalid_part(), None),
                Err(Failure::InternalError)
            );
            assert!(IdentityRecorder::default().finish(&mut candidate).is_err());
            assert_eq!(
                journal.replay(&mut candidate, direction()),
                Err(Failure::InternalError)
            );
            assert_eq!(candidate.reservation.attempts, fail_at);
            assert_eq!(candidate.prefix.finish().unwrap(), expected);
        }
    }
    assert_eq!(store.export_document().unwrap(), document);
}

#[test]
fn multiple_part_lifetimes_replay_exact_predecessors_in_both_directions() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    let mut recorder = Recorder::new(Candidate::new(
        TransactionOverlayV1::new(&store),
        document.id.clone(),
    ));
    let payload = |raw_id: &str| {
        let mut part = invalid_part();
        part.id = raw_id.into();
        part
    };
    recorder
        .insert_part(payload("alpha"), Some("part-z"))
        .unwrap();
    recorder
        .insert_part(payload("beta"), Some("alpha"))
        .unwrap();
    recorder.remove_part("alpha").unwrap();
    recorder
        .insert_part(payload("alpha"), Some("beta"))
        .unwrap();
    recorder.remove_part("beta").unwrap();
    recorder.remove_part("alpha").unwrap();
    let (_, journal) = recorder.finish().unwrap();
    assert_eq!(journal.steps.len(), 6);
    let forward_orders: &[&[&str]] = &[
        &["part-z", "alpha"],
        &["part-z", "alpha", "beta"],
        &["part-z", "beta"],
        &["part-z", "beta", "alpha"],
        &["part-z", "alpha"],
        &["part-z"],
    ];
    let inverse_orders: &[&[&str]] = &[
        &["part-z", "alpha"],
        &["part-z", "beta", "alpha"],
        &["part-z", "beta"],
        &["part-z", "alpha", "beta"],
        &["part-z", "alpha"],
        &["part-z"],
    ];
    for inverse in [false, true] {
        let mut candidate = Candidate::new(TransactionOverlayV1::new(&store), document.id.clone());
        let side = if inverse {
            BoundarySide::SuffixEnd
        } else {
            BoundarySide::SuffixStart
        };
        let mut bindings = ReplayBindings::at(&journal.identities, side, &mut candidate).unwrap();
        for index in 0..6 {
            let operation = if inverse {
                &journal.steps[5 - index].inverse
            } else {
                &journal.steps[index].forward
            };
            operation.apply(&mut candidate, &mut bindings).unwrap();
            assert_eq!(
                part_ids(&mut candidate),
                if inverse {
                    inverse_orders[index]
                } else {
                    forward_orders[index]
                }
            );
        }
    }
    assert_eq!(store.export_document().unwrap(), document);
}

#[test]
fn invalid_anchors_are_reported_before_any_journal_capacity_attempt() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    for anchor in ["missing", ""] {
        let mut recorder = Recorder::new(Candidate::new(
            TransactionOverlayV1::new(&store),
            document.id.clone(),
        ));
        recorder.candidate.reservation = Reservation::fail_at(1);
        assert_eq!(
            recorder.insert_part(invalid_part(), Some(anchor)),
            Err(Failure::AnchorNotFound)
        );
        assert_eq!(recorder.candidate.reservation.attempts, 0);
        assert!(
            recorder.candidate.nodes.is_empty()
                && recorder.steps.is_empty()
                && recorder.active.is_empty()
        );
        assert_eq!(part_ids(&mut recorder.candidate), ["part-z"]);
        assert!(recorder.finish().is_err());
    }
}
