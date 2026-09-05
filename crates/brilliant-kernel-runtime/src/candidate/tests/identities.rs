use super::super::identity::{BoundarySide, IdentityRecorder, JournalId, ReplayBindings};
use super::*;

// Test-only bundle traversal. Production replay must obtain this correspondence
// from the insertion record, never rediscover descendants by their raw IDs.
fn subtree(candidate: &mut Candidate<'_>, root: &Occurrence) -> Vec<Occurrence> {
    let mut result = vec![root.clone()];
    let children: &[Children] = match candidate.kind(root).unwrap() {
        Kind::Document => &[Children::Measures, Children::Parts],
        Kind::Part => &[Children::Staffs, Children::Contents],
        Kind::Content => &[Children::Voices],
        Kind::Voice => &[Children::Events],
        Kind::Event => &[Children::Notes],
        _ => &[],
    };
    for children in children {
        for child in ordered(candidate, root, *children) {
            result.extend(subtree(candidate, &child));
        }
    }
    result
}

fn record_subtree(
    recorder: &mut IdentityRecorder,
    candidate: &mut Candidate<'_>,
    root: &Occurrence,
) -> Vec<JournalId> {
    subtree(candidate, root)
        .iter()
        .map(|source| recorder.record(candidate, source).unwrap())
        .collect()
}

fn transient_part() -> AdmissionPartV1 {
    let mut part = raw_part("temporary");
    for staff in &mut part.staves {
        staff.id = JsString::from("");
    }
    for content in &mut part.measure_contents {
        for voice in &mut content.voices {
            voice.id = JsString::from("");
            voice.default_staff_id = JsString::from("");
            for event in &mut voice.sequence.events {
                event.id = JsString::from("");
                if let RhythmicContentV1::Notes { notes } = &mut event.content {
                    for note in notes {
                        note.id = JsString::from("");
                    }
                }
            }
        }
    }
    part.measure_contents.push(part.measure_contents[0].clone());
    part
}

#[test]
fn same_raw_id_rebuild_has_distinct_lifetimes_at_both_boundaries() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    let mut recording = Candidate::new(TransactionOverlayV1::new(&store), document.id.clone());
    let mut recorder = IdentityRecorder::default();
    let old = recording
        .resolve(Kind::Part, &JsString::from("part-z"))
        .unwrap();
    let old_ids = record_subtree(&mut recorder, &mut recording, &old);
    recording.hide(&old).unwrap();
    let new = recording.insert_part(raw_part("part-z"), None).unwrap();
    let new_ids = record_subtree(&mut recorder, &mut recording, &new);
    assert!(old_ids.iter().zip(&new_ids).all(|(old, new)| old != new));
    assert_eq!(recorder.record(&mut recording, &old).unwrap(), old_ids[0]);
    let manifest = recorder.finish(&mut recording).unwrap();

    let mut forward = Candidate::new(TransactionOverlayV1::new(&store), document.id.clone());
    let mut start = ReplayBindings::at(&manifest, BoundarySide::SuffixStart, &mut forward).unwrap();
    for id in &old_ids {
        start.resolve(*id, &forward).unwrap();
    }
    for id in &new_ids {
        assert_eq!(start.resolve(*id, &forward), Err(Failure::InternalError));
    }
    assert_eq!(
        start.unbind_removed(&forward, old_ids[0]),
        Err(Failure::InternalError)
    );
    forward.hide(&old).unwrap();
    start.unbind_removed(&forward, old_ids[0]).unwrap();
    let added = forward.insert_part(raw_part("part-z"), None).unwrap();
    let pairs: Vec<_> = new_ids
        .iter()
        .copied()
        .zip(subtree(&mut forward, &added))
        .collect();
    start.bind_inserted(&mut forward, &pairs).unwrap();
    assert_eq!(
        start.resolve(old_ids[0], &forward),
        Err(Failure::InternalError)
    );
    assert_eq!(start.resolve(new_ids[0], &forward).unwrap(), added);

    // The adopted end document has equal bytes, but represents the new lifetime.
    let mut inverse = Candidate::new(TransactionOverlayV1::new(&store), document.id.clone());
    let mut end = ReplayBindings::at(&manifest, BoundarySide::SuffixEnd, &mut inverse).unwrap();
    for id in &old_ids {
        assert_eq!(end.resolve(*id, &inverse), Err(Failure::InternalError));
    }
    for id in &new_ids {
        end.resolve(*id, &inverse).unwrap();
    }
    let source = end.resolve(new_ids[0], &inverse).unwrap();
    inverse.hide(&source).unwrap();
    end.unbind_removed(&inverse, new_ids[0]).unwrap();
    let restored = inverse.insert_part(raw_part("part-z"), None).unwrap();
    let pairs: Vec<_> = old_ids
        .iter()
        .copied()
        .zip(subtree(&mut inverse, &restored))
        .collect();
    end.bind_inserted(&mut inverse, &pairs).unwrap();
    assert_eq!(end.resolve(old_ids[0], &inverse).unwrap(), restored);
    assert_eq!(
        end.resolve(new_ids[0], &inverse),
        Err(Failure::InternalError)
    );
    assert_eq!(store.export_document().unwrap(), document);
}

#[test]
fn temporary_empty_duplicate_ids_and_contents_rebind_without_arena_positions() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    let mut recording = Candidate::new(TransactionOverlayV1::new(&store), document.id.clone());
    let root = recording.insert_part(transient_part(), None).unwrap();
    let recorded_sources = subtree(&mut recording, &root);
    let mut recorder = IdentityRecorder::default();
    let ids = record_subtree(&mut recorder, &mut recording, &root);
    recording.hide(&root).unwrap();
    let manifest = recorder.finish(&mut recording).unwrap();

    for side in [BoundarySide::SuffixStart, BoundarySide::SuffixEnd] {
        let mut candidate = Candidate::new(TransactionOverlayV1::new(&store), document.id.clone());
        let padding = candidate.insert_part(raw_part("padding"), None).unwrap();
        candidate.hide(&padding).unwrap();
        let mut bindings = ReplayBindings::at(&manifest, side, &mut candidate).unwrap();
        for _ in 0..2 {
            let root = candidate.insert_part(transient_part(), None).unwrap();
            let sources = subtree(&mut candidate, &root);
            assert!(
                sources
                    .iter()
                    .zip(&recorded_sources)
                    .all(|(new, old)| new != old)
            );
            for id in &ids {
                assert_eq!(
                    bindings.resolve(*id, &candidate),
                    Err(Failure::InternalError)
                );
            }
            let mut pairs: Vec<_> = ids.iter().copied().zip(sources.clone()).collect();
            pairs.reverse(); // Parent-before-child input ordering is not required.
            bindings.bind_inserted(&mut candidate, &pairs).unwrap();
            for (id, source) in ids.iter().zip(&sources) {
                assert_eq!(&bindings.resolve(*id, &candidate).unwrap(), source);
            }
            candidate.hide(&root).unwrap();
            bindings.unbind_removed(&candidate, ids[0]).unwrap();
            for id in &ids {
                assert_eq!(
                    bindings.resolve(*id, &candidate),
                    Err(Failure::InternalError)
                );
            }
        }
    }
    assert_eq!(store.export_document().unwrap(), document);
}

#[test]
fn suffix_start_is_after_the_isolated_typed_prefix() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    let prepare = || {
        let mut prefix = TransactionOverlayV1::new(&store);
        let mut part = document.parts[0].clone();
        part.id = id("prefix-part");
        part.staves.clear();
        part.measure_contents.clear();
        prefix
            .insert_entity(
                Owner::Document {
                    document_id: document.id.clone(),
                },
                Order::Parts {
                    document_id: document.id.clone(),
                },
                StableAnchorV1::Start,
                Entity::Part {
                    part_id: part.id.clone(),
                },
                EntityBundleV1::Part(PartBundleV1 {
                    part,
                    extensions: Vec::new(),
                }),
            )
            .unwrap();
        prefix
    };
    let expected = prepare().finish().unwrap();
    let mut candidate = Candidate::new(prepare(), document.id.clone());
    let root = candidate
        .resolve(Kind::Part, &JsString::from("prefix-part"))
        .unwrap();
    let mut recorder = IdentityRecorder::default();
    let journal_id = recorder.record(&mut candidate, &root).unwrap();
    candidate.hide(&root).unwrap();
    let manifest = recorder.finish(&mut candidate).unwrap();
    assert_eq!(candidate.prefix.finish().unwrap(), expected);

    let mut entry_start = Candidate::new(TransactionOverlayV1::new(&store), document.id.clone());
    assert!(matches!(
        ReplayBindings::at(&manifest, BoundarySide::SuffixStart, &mut entry_start),
        Err(Failure::InternalError)
    ));
    let mut suffix_start = Candidate::new(prepare(), document.id.clone());
    let bindings =
        ReplayBindings::at(&manifest, BoundarySide::SuffixStart, &mut suffix_start).unwrap();
    assert_eq!(bindings.resolve(journal_id, &suffix_start).unwrap(), root);
    assert_eq!(suffix_start.prefix.finish().unwrap(), expected);
    let end = ReplayBindings::at(&manifest, BoundarySide::SuffixEnd, &mut entry_start).unwrap();
    assert_eq!(
        end.resolve(journal_id, &entry_start),
        Err(Failure::InternalError)
    );
    assert_eq!(store.export_document().unwrap(), document);
}

#[test]
fn malformed_insert_bindings_are_atomic_and_cannot_alias_another_owner() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    let mut candidate = Candidate::new(TransactionOverlayV1::new(&store), document.id);
    let mut recorder = IdentityRecorder::default();
    let root = candidate.insert_part(transient_part(), None).unwrap();
    let ids = record_subtree(&mut recorder, &mut candidate, &root);
    let document_source = candidate.document.clone();
    let document_id = recorder.record(&mut candidate, &document_source).unwrap();
    candidate.hide(&root).unwrap();
    let manifest = recorder.finish(&mut candidate).unwrap();
    let mut bindings =
        ReplayBindings::at(&manifest, BoundarySide::SuffixStart, &mut candidate).unwrap();
    let root = candidate.insert_part(transient_part(), None).unwrap();
    let sources = subtree(&mut candidate, &root);
    let foreign_root = candidate.insert_part(transient_part(), None).unwrap();
    let foreign = subtree(&mut candidate, &foreign_root);
    let pairs: Vec<_> = ids.iter().copied().zip(sources.clone()).collect();
    let mut duplicate_id = pairs.clone();
    duplicate_id.push(pairs[0].clone());
    let mut duplicate_occurrence = pairs.clone();
    duplicate_occurrence[2].1 = sources[1].clone(); // Two empty Staff IDs.
    let mut wrong_owner = pairs.clone();
    wrong_owner[1].1 = foreign[1].clone();
    let mut wrong_kind = pairs.clone();
    wrong_kind[1].1 = sources[0].clone();
    for invalid in [duplicate_id, duplicate_occurrence, wrong_owner, wrong_kind] {
        assert_eq!(
            bindings.bind_inserted(&mut candidate, &invalid),
            Err(Failure::InternalError)
        );
        for id in &ids {
            assert_eq!(
                bindings.resolve(*id, &candidate),
                Err(Failure::InternalError)
            );
        }
        assert_eq!(
            bindings.resolve(document_id, &candidate).unwrap(),
            document_source
        );
    }
    bindings.bind_inserted(&mut candidate, &pairs).unwrap();
    assert_eq!(
        bindings.bind_inserted(&mut candidate, &pairs),
        Err(Failure::InternalError)
    );
    for (id, source) in pairs {
        assert_eq!(bindings.resolve(id, &candidate).unwrap(), source);
    }
}

#[test]
fn strong_boundaries_reject_empty_duplicate_wrong_owner_and_missing_measure_locators() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    for invalid in [
        "empty",
        "duplicate",
        "cross-kind",
        "content",
        "missing-measure",
    ] {
        let mut candidate = Candidate::new(TransactionOverlayV1::new(&store), document.id.clone());
        let mut recorder = IdentityRecorder::default();
        let mut payload = raw_part("part-z");
        let old = candidate
            .resolve(Kind::Part, &JsString::from("part-z"))
            .unwrap();
        candidate.hide(&old).unwrap();
        match invalid {
            "empty" => payload.id = JsString::from(""),
            "duplicate" => payload.staves[1].id = payload.staves[0].id.clone(),
            "cross-kind" => payload.staves[0].id = payload.id.clone(),
            "content" => payload
                .measure_contents
                .push(payload.measure_contents[0].clone()),
            "missing-measure" => payload.measure_contents[0].measure_id = "absent".into(),
            _ => unreachable!(),
        }
        let root = candidate.insert_part(payload, None).unwrap();
        record_subtree(&mut recorder, &mut candidate, &root);
        assert!(
            matches!(recorder.finish(&mut candidate), Err(Failure::InternalError)),
            "{invalid}"
        );
        assert_eq!(store.export_document().unwrap(), document);
    }

    let mut candidate = Candidate::new(TransactionOverlayV1::new(&store), document.id.clone());
    let mut recorder = IdentityRecorder::default();
    let voice = candidate
        .resolve(Kind::Voice, &JsString::from("voice-a"))
        .unwrap();
    recorder.record(&mut candidate, &voice).unwrap();
    let manifest = recorder.finish(&mut candidate).unwrap();
    let mut wrong_owner = document.clone();
    wrong_owner.parts[0].measure_contents[0].voices[0].id = id("voice-z");
    wrong_owner.parts[0].measure_contents[1].voices[0].id = id("voice-a");
    let wrong_store = build_live_score_store(&wrong_owner).unwrap();
    let mut wrong = Candidate::new(TransactionOverlayV1::new(&wrong_store), document.id.clone());
    assert!(matches!(
        ReplayBindings::at(&manifest, BoundarySide::SuffixStart, &mut wrong),
        Err(Failure::InternalError)
    ));
    let measure = candidate
        .resolve(Kind::Measure, &JsString::from("measure-a"))
        .unwrap();
    candidate.hide(&measure).unwrap();
    assert!(matches!(
        ReplayBindings::at(&manifest, BoundarySide::SuffixStart, &mut candidate),
        Err(Failure::InternalError)
    ));
}

#[test]
fn identity_reservation_failures_are_terminal_and_never_publish_partial_bindings() {
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
    let run = |candidate: &mut Candidate<'_>| -> Result<(), Failure> {
        let note = candidate.resolve(Kind::Note, &JsString::from("note-a"))?;
        let mut recorder = IdentityRecorder::default();
        let note_id = recorder.record(candidate, &note)?;
        let manifest = recorder.finish(candidate)?;
        let bindings = ReplayBindings::at(&manifest, BoundarySide::SuffixStart, candidate)?;
        assert_eq!(bindings.resolve(note_id, candidate)?, note);
        Ok(())
    };
    let mut baseline = Candidate::new(prepare(), document.id.clone());
    run(&mut baseline).unwrap();
    assert_eq!(baseline.reservation.sites, 0x7800);
    for fail_at in 1..=baseline.reservation.attempts {
        let mut candidate = Candidate::new(prepare(), document.id.clone());
        candidate.reservation = Reservation::fail_at(fail_at);
        assert_eq!(
            run(&mut candidate),
            Err(Failure::InternalError),
            "reservation {fail_at}"
        );
        assert_eq!(run(&mut candidate), Err(Failure::InternalError));
        assert_eq!(candidate.reservation.attempts, fail_at);
        assert_eq!(candidate.prefix.finish().unwrap(), expected);
    }

    let mut recording = Candidate::new(prepare(), document.id.clone());
    let mut recorder = IdentityRecorder::default();
    let root = recording.insert_part(transient_part(), None).unwrap();
    let ids = record_subtree(&mut recorder, &mut recording, &root);
    recording.hide(&root).unwrap();
    let manifest = recorder.finish(&mut recording).unwrap();
    for fail_at in 1..=3 {
        let mut candidate = Candidate::new(prepare(), document.id.clone());
        let mut bindings =
            ReplayBindings::at(&manifest, BoundarySide::SuffixStart, &mut candidate).unwrap();
        let root = candidate.insert_part(transient_part(), None).unwrap();
        let pairs: Vec<_> = ids
            .iter()
            .copied()
            .zip(subtree(&mut candidate, &root))
            .collect();
        candidate.reservation = Reservation::fail_at(fail_at);
        assert_eq!(
            bindings.bind_inserted(&mut candidate, &pairs),
            Err(Failure::InternalError)
        );
        for id in &ids {
            assert_eq!(
                bindings.resolve(*id, &candidate),
                Err(Failure::InternalError)
            );
        }
        assert_eq!(
            bindings.bind_inserted(&mut candidate, &pairs),
            Err(Failure::InternalError)
        );
        assert_eq!(
            bindings.unbind_removed(&candidate, ids[0]),
            Err(Failure::InternalError)
        );
        assert_eq!(candidate.reservation.attempts, fail_at);
        assert_eq!(candidate.prefix.finish().unwrap(), expected);
    }
    assert_eq!(store.export_document().unwrap(), document);
}

#[test]
fn boundary_content_lookup_indexes_each_changed_part_once_and_borrows_prefix_links() {
    let mut document = fixture();
    let part_id: JsString = "long-part-owner/".repeat(4096).into();
    document.parts[0].id = id(&part_id);
    let mut payload = raw_part(&part_id);
    let raw_content = payload.measure_contents[0].clone();
    payload.measure_contents.clear();
    let measure = document.measure_definitions[0].clone();
    let content = document.parts[0].measure_contents[0].clone();
    document.measure_definitions.clear();
    document.parts[0].measure_contents.clear();
    for index in 0..512 {
        let mut measure = measure.clone();
        measure.id = id(format!("measure-{index}"));
        let mut content = content.clone();
        content.measure_id = measure.id.clone();
        content.voices[0].id = id(format!("voice-{index}"));
        content.voices[0].sequence.events[0].id = id(format!("event-{index}"));
        let RhythmicContentV1::Notes { notes } = &mut content.voices[0].sequence.events[0].content
        else {
            panic!("notes");
        };
        notes[0].id = id(format!("note-{index}"));
        let mut raw_content = raw_content.clone();
        raw_content.measure_id = measure.id.as_js_string().into();
        raw_content.voices[0].id = format!("voice-{index}").into();
        raw_content.voices[0].sequence.events[0].id = format!("event-{index}").into();
        let RhythmicContentV1::Notes { notes } =
            &mut raw_content.voices[0].sequence.events[0].content
        else {
            panic!("notes");
        };
        notes[0].id = format!("note-{index}").into();
        payload.measure_contents.push(raw_content);
        document.measure_definitions.push(measure);
        document.parts[0].measure_contents.push(content);
    }
    let store = build_live_score_store(&document).unwrap();
    let mut candidate = Candidate::new(TransactionOverlayV1::new(&store), document.id.clone());
    let old = candidate.resolve(Kind::Part, &part_id).unwrap();
    candidate.hide(&old).unwrap();
    let root = candidate.insert_part(payload, None).unwrap();
    let mut recorder = IdentityRecorder::default();
    let ids = record_subtree(&mut recorder, &mut candidate, &root);
    let visits = candidate.work.visited_entries;
    let orders = candidate.work.order_visits;
    let manifest = recorder.finish(&mut candidate).unwrap();
    assert_eq!(candidate.work.visited_entries - visits, 512);
    assert_eq!(candidate.work.order_visits - orders, 1);
    let bindings = ReplayBindings::at(&manifest, BoundarySide::SuffixEnd, &mut candidate).unwrap();
    assert_eq!(candidate.work.visited_entries - visits, 1024);
    assert_eq!(candidate.work.order_visits - orders, 2);
    for id in &ids {
        bindings.resolve(*id, &candidate).unwrap();
    }
    let mut adopted = Candidate::new(TransactionOverlayV1::new(&store), document.id.clone());
    let bindings = ReplayBindings::at(&manifest, BoundarySide::SuffixEnd, &mut adopted).unwrap();
    for id in ids {
        bindings.resolve(id, &adopted).unwrap();
    }
    assert_eq!(adopted.work.visited_entries, 0);
    assert_eq!(adopted.work.order_visits, 0);
    assert_eq!(store.export_document().unwrap(), document);
}

#[test]
fn content_locator_reservation_failures_discard_the_incomplete_boundary() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    let prepare = || {
        let mut candidate = Candidate::new(TransactionOverlayV1::new(&store), document.id.clone());
        let old = candidate
            .resolve(Kind::Part, &JsString::from("part-z"))
            .unwrap();
        candidate.hide(&old).unwrap();
        let root = candidate.insert_part(raw_part("part-z"), None).unwrap();
        let mut recorder = IdentityRecorder::default();
        record_subtree(&mut recorder, &mut candidate, &root);
        candidate.reservation = Reservation::default();
        (candidate, recorder)
    };
    let (mut candidate, recorder) = prepare();
    let manifest = recorder.finish(&mut candidate).unwrap();
    assert_eq!(candidate.reservation.attempts, 3);
    for fail_at in 1..=3 {
        let (mut candidate, recorder) = prepare();
        candidate.reservation = Reservation::fail_at(fail_at);
        assert!(matches!(
            recorder.finish(&mut candidate),
            Err(Failure::InternalError)
        ));
        assert_eq!(
            candidate.reservation.ensure_active(),
            Err(Failure::InternalError)
        );
    }
    candidate.reservation = Reservation::default();
    ReplayBindings::at(&manifest, BoundarySide::SuffixEnd, &mut candidate).unwrap();
    assert_eq!(candidate.reservation.attempts, 4);
    for fail_at in 1..=4 {
        let (mut candidate, _) = prepare();
        candidate.reservation = Reservation::fail_at(fail_at);
        assert!(matches!(
            ReplayBindings::at(&manifest, BoundarySide::SuffixEnd, &mut candidate),
            Err(Failure::InternalError)
        ));
        assert_eq!(
            candidate.reservation.ensure_active(),
            Err(Failure::InternalError)
        );
        assert!(matches!(
            ReplayBindings::at(&manifest, BoundarySide::SuffixStart, &mut candidate),
            Err(Failure::InternalError)
        ));
        assert_eq!(candidate.reservation.attempts, fail_at);
    }
    assert_eq!(store.export_document().unwrap(), document);
}
