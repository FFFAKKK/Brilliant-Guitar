use super::*;
use crate::{
    change_set::{EntityBundleV1, PartBundleV1, StableAnchorV1},
    store::{build_live_score_store, tests::fixture},
};
use brilliant_core_types::SafeInteger;
use brilliant_score_foundation::{
    MusicSequenceV1, PartMeasureContentV1, PitchStepV1, RhythmicEventV1, ScoreNoteV1,
    StaffDefinitionV1, WrittenPitchV1,
};

mod identities;
mod insertions;
mod writes;

fn id(value: &str) -> StableId {
    StableId::new(value).expect("nonempty test ID")
}

fn raw_part(part_id: &str) -> AdmissionPartV1 {
    let part = fixture().parts.remove(0);
    AdmissionPartV1 {
        id: part_id.into(),
        name: part.name,
        instrument: part.instrument,
        staves: part
            .staves
            .into_iter()
            .map(|staff| StaffDefinitionV1 {
                id: staff.id.as_str().to_owned(),
                line_count: staff.line_count,
                default_clef: staff.default_clef,
            })
            .collect(),
        measure_contents: part
            .measure_contents
            .into_iter()
            .map(|content| PartMeasureContentV1 {
                measure_id: content.measure_id.as_str().to_owned(),
                voices: content
                    .voices
                    .into_iter()
                    .map(|voice| AdmissionVoiceV1 {
                        id: voice.id.as_str().to_owned(),
                        default_staff_id: voice.default_staff_id.as_str().to_owned(),
                        sequence: MusicSequenceV1 {
                            start: voice.sequence.start,
                            events: voice
                                .sequence
                                .events
                                .into_iter()
                                .map(|event| RhythmicEventV1 {
                                    id: event.id.as_str().to_owned(),
                                    duration: event.duration,
                                    staff_id: event.staff_id.map(|id| id.as_str().to_owned()),
                                    content: match event.content {
                                        RhythmicContentV1::Rest => RhythmicContentV1::Rest,
                                        RhythmicContentV1::Notes { notes } => {
                                            RhythmicContentV1::Notes {
                                                notes: notes
                                                    .into_iter()
                                                    .map(|note| ScoreNoteV1 {
                                                        id: note.id.as_str().to_owned(),
                                                        written_pitch: note.written_pitch,
                                                    })
                                                    .collect(),
                                            }
                                        }
                                    },
                                })
                                .collect(),
                        },
                    })
                    .collect(),
            })
            .collect(),
    }
}

fn ordered(
    candidate: &mut Candidate<'_>,
    owner: &Occurrence,
    children: Children,
) -> Vec<Occurrence> {
    let mut result = Vec::new();
    candidate
        .visit_order(&CandidateOrder::new(owner, children), &mut |child, _| {
            result.push(child.clone());
            true
        })
        .expect("visible order");
    result
}

fn order_ids(candidate: &mut Candidate<'_>, order: &CandidateOrder) -> Vec<String> {
    let mut result = Vec::new();
    candidate
        .visit_order(order, &mut |_, raw_id| {
            result.push(raw_id.to_owned());
            true
        })
        .expect("visible order");
    result
}

#[test]
fn reads_frozen_overlay_prefix_values_order_references_and_accounting() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    let pitch = Value::NoteWrittenPitch(WrittenPitchV1 {
        step: PitchStepV1::D,
        alter: SafeInteger::new(1).unwrap(),
        octave: SafeInteger::new(5).unwrap(),
    });
    let prepare_prefix = || {
        let mut prefix = TransactionOverlayV1::new(&store);
        let segment = prefix.begin_segment();
        prefix
            .replace_scalar(
                Scalar::NoteWrittenPitch {
                    note_id: id("note-a"),
                },
                pitch.clone(),
            )
            .unwrap();
        prefix.add_prepared_effects(1).unwrap();
        prefix.end_segment(segment).unwrap();
        let segment = prefix.begin_segment();
        prefix
            .move_ordered_child(
                Order::Staffs {
                    part_id: id("part-z"),
                },
                id("staff-a"),
                StableAnchorV1::Start,
            )
            .unwrap();
        prefix
            .update_reference(
                Reference::VoiceDefaultStaff {
                    voice_id: id("voice-a"),
                },
                ReferenceValueV1::StableId(id("staff-z")),
            )
            .unwrap();
        prefix.add_prepared_effects(2).unwrap();
        prefix.end_segment(segment).unwrap();
        prefix
    };
    let expected = prepare_prefix().finish().unwrap();
    let prefix = prepare_prefix();
    let operation_count = prefix.operation_count();
    let logical_bytes = prefix.logical_bytes();
    let mut candidate = Candidate::new(prefix, document.id);
    let note = candidate.resolve(Kind::Note, "note-a").unwrap();
    assert_eq!(candidate.read_value(&note), Some(pitch.clone()));
    let part = candidate.resolve(Kind::Part, "part-z").unwrap();
    assert_eq!(
        order_ids(
            &mut candidate,
            &CandidateOrder::new(&part, Children::Staffs)
        ),
        ["staff-a", "staff-z"]
    );
    let voice = candidate.resolve(Kind::Voice, "voice-a").unwrap();
    assert_eq!(
        candidate.read_staff_reference(&voice),
        Some(Some("staff-z".into()))
    );
    let event = candidate.resolve(Kind::Event, "event-z").unwrap();
    assert_eq!(candidate.read_staff_reference(&event), Some(None));
    assert_eq!(
        candidate.read_content_kind(&event),
        Some(EventContentKind::Rest)
    );
    assert_eq!(
        candidate.read_instrument(&part),
        Some(document.parts[0].instrument.clone())
    );
    assert_eq!(candidate.prefix.operation_count(), operation_count);
    assert_eq!(candidate.prefix.logical_bytes(), logical_bytes);
    assert_eq!(candidate.work.prefix_order_copies, 0);
    assert!(candidate.nodes.is_empty());
    assert!(candidate.orders.is_empty());
    assert_eq!(candidate.prefix.finish().unwrap(), expected);
    assert_eq!(store.export_document().unwrap().parts, document.parts);
}

#[test]
fn same_id_prefix_rebuild_reads_new_records_and_descendant_owners() {
    let mut document = fixture();
    let store = build_live_score_store(&document).unwrap();
    let mut prefix = TransactionOverlayV1::new(&store);
    let owner = Owner::Document {
        document_id: document.id.clone(),
    };
    let order = Order::Parts {
        document_id: document.id.clone(),
    };
    let address = Entity::Part {
        part_id: id("part-z"),
    };
    prefix
        .remove_entity(owner.clone(), order.clone(), address.clone())
        .unwrap();
    let mut part = document.parts.remove(0);
    part.name = "rebuilt".into();
    part.staves.reverse();
    part.measure_contents[0].voices[0].default_staff_id = id("staff-z");
    prefix
        .insert_entity(
            owner,
            order,
            StableAnchorV1::Start,
            address,
            EntityBundleV1::Part(PartBundleV1 {
                part,
                extensions: Vec::new(),
            }),
        )
        .unwrap();
    let mut candidate = Candidate::new(prefix, document.id);
    let part = candidate.resolve(Kind::Part, "part-z").unwrap();
    assert_eq!(
        candidate.read_value(&part),
        Some(Value::PartName("rebuilt".into()))
    );
    assert_eq!(
        order_ids(
            &mut candidate,
            &CandidateOrder::new(&part, Children::Staffs)
        ),
        ["staff-a", "staff-z"]
    );
    let note = candidate.resolve(Kind::Note, "note-a").unwrap();
    assert!(candidate.visible(&note));
    let voice = candidate.resolve(Kind::Voice, "voice-a").unwrap();
    assert_eq!(
        candidate.read_staff_reference(&voice),
        Some(Some("staff-z".into()))
    );
}

#[test]
fn hiding_unexpanded_parent_blocks_descendant_lookup_and_stale_tokens() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    let mut candidate = Candidate::new(TransactionOverlayV1::new(&store), document.id);
    let part = candidate.resolve(Kind::Part, "part-z").unwrap();
    let event = Occurrence::prefix(Entity::Event {
        event_id: id("event-a"),
    });
    candidate.hide(&part).unwrap();
    for (kind, raw_id) in [
        (Kind::Staff, "staff-a"),
        (Kind::Voice, "voice-a"),
        (Kind::Event, "event-a"),
        (Kind::Note, "note-a"),
    ] {
        assert_eq!(
            candidate.resolve(kind, raw_id),
            Err(Failure::TargetNotFound)
        );
    }
    assert_eq!(candidate.read_value(&event), None);
    assert_eq!(candidate.read_staff_reference(&event), None);
    assert_eq!(candidate.read_content_kind(&event), None);
    assert_eq!(candidate.read_instrument(&part), None);
    assert_eq!(
        candidate.visit_order(
            &CandidateOrder::new(&event, Children::Notes),
            &mut |_, _| panic!("hidden descendant")
        ),
        None
    );
    assert!(candidate.nodes.is_empty());
    assert!(candidate.orders.is_empty());
    assert_eq!(candidate.work, Work::default());
    assert!(candidate.resolve(Kind::Measure, "measure-a").is_ok());
    // Reuse after removal must not resurrect the hidden prefix occurrence.
    let replacement = candidate.insert_part(raw_part("part-z"), None).unwrap();
    assert_ne!(part, replacement);
    assert_eq!(candidate.resolve(Kind::Part, "part-z"), Ok(replacement));
    assert!(matches!(
        candidate.resolve(Kind::Note, "note-a"),
        Ok(Occurrence::Added(_))
    ));
}

#[test]
fn duplicates_empty_ids_and_repeated_contents_keep_distinct_occurrences() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    let mut candidate = Candidate::new(TransactionOverlayV1::new(&store), document.id);
    let mut payload = raw_part("new-part");
    payload.staves[1].id.clear();
    payload
        .measure_contents
        .push(payload.measure_contents[0].clone());
    payload.measure_contents[2].voices[0].id = "distinct-voice".into();
    payload.measure_contents[2].voices[0]
        .default_staff_id
        .clear();
    for measure_id in ["unknown-measure", ""] {
        payload.measure_contents.push(PartMeasureContentV1 {
            measure_id: measure_id.into(),
            voices: Vec::new(),
        });
    }
    let part = candidate.insert_part(payload, None).unwrap();
    assert_eq!(
        candidate.resolve(Kind::Staff, "staff-z"),
        Err(Failure::InternalError)
    );
    let empty = candidate.resolve(Kind::Staff, "").unwrap();
    assert_eq!(candidate.raw_id(&empty), Some(""));
    let contents = ordered(&mut candidate, &part, Children::Contents);
    assert_eq!(contents.len(), 5);
    assert_eq!(
        order_ids(
            &mut candidate,
            &CandidateOrder::new(&part, Children::Contents)
        ),
        ["measure-a", "measure-z", "measure-a", "unknown-measure", ""]
    );
    assert_ne!(contents[0], contents[2]);
    assert_eq!(
        candidate.raw_id(&contents[0]),
        candidate.raw_id(&contents[2])
    );
    let voices0 = ordered(&mut candidate, &contents[0], Children::Voices);
    let voices2 = ordered(&mut candidate, &contents[2], Children::Voices);
    assert_ne!(voices0, voices2);
    assert_eq!(candidate.owner(&voices0[0]), Some(contents[0].clone()));
    assert_eq!(candidate.owner(&voices2[0]), Some(contents[2].clone()));
    assert_eq!(
        candidate.read_staff_reference(&voices2[0]),
        Some(Some("".into()))
    );
    assert!(candidate.matches(Kind::Content, "measure-a").is_empty());
    // Deleting an ambiguous child by ID fails, but its unique parent repairs it.
    candidate.hide(&part).unwrap();
    assert!(matches!(
        candidate.resolve(Kind::Staff, "staff-z"),
        Ok(Occurrence::Prefix(_))
    ));
    assert_eq!(
        candidate.resolve(Kind::Staff, ""),
        Err(Failure::TargetNotFound)
    );
    assert!(!candidate.visible(&contents[2]));
    assert!(!candidate.visible(&voices2[0]));
}

#[test]
fn typed_target_resolution_does_not_conflate_cross_kind_ids() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    let mut candidate = Candidate::new(TransactionOverlayV1::new(&store), document.id);
    let mut payload = raw_part("new-part");
    payload.staves[0].id = "note-a".into();
    payload.staves.truncate(1);
    payload.measure_contents.clear();
    candidate.insert_part(payload, None).unwrap();
    assert!(candidate.resolve(Kind::Staff, "note-a").is_ok());
    assert!(candidate.resolve(Kind::Note, "note-a").is_ok());
    assert_eq!(
        candidate.resolve(Kind::Voice, "note-a"),
        Err(Failure::TargetNotFound)
    );
}

#[test]
fn borrowed_reads_and_anchor_resolution_copy_only_a_written_sibling_order_once() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    let mut candidate = Candidate::new(TransactionOverlayV1::new(&store), document.id);
    let part = candidate.resolve(Kind::Part, "part-z").unwrap();
    let order = CandidateOrder::new(&part, Children::Staffs);
    assert_eq!(
        candidate.insertion_index(&order, Some("staff-z"), None),
        Ok(1)
    );
    assert_eq!(candidate.work.prefix_order_copies, 0);
    assert!(candidate.orders.is_empty());
    let before = candidate.work.visited_entries;
    candidate.visit_order(&order, &mut |_, _| false).unwrap();
    assert_eq!(candidate.work.visited_entries - before, 1);
    candidate
        .move_child(&order, "staff-z", Some("staff-a"))
        .unwrap();
    assert_eq!(order_ids(&mut candidate, &order), ["staff-a", "staff-z"]);
    candidate.move_child(&order, "staff-z", None).unwrap();
    assert_eq!(order_ids(&mut candidate, &order), ["staff-z", "staff-a"]);
    assert_eq!(candidate.work.prefix_order_copies, 1);
    assert_eq!(candidate.work.copied_entries, 2);
    assert_eq!(candidate.orders.len(), 1);
    assert!(candidate.nodes.is_empty());
    assert_eq!(candidate.prefix.operation_count(), 0);
    let root = candidate.document.clone();
    assert_eq!(
        order_ids(
            &mut candidate,
            &CandidateOrder::new(&root, Children::Measures)
        ),
        ["measure-z", "measure-a"]
    );
    assert_eq!(candidate.work.prefix_order_copies, 1);
}

#[test]
fn owner_local_anchors_win_and_event_global_ambiguity_is_wrong_owner() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    let mut candidate = Candidate::new(TransactionOverlayV1::new(&store), document.id);
    let part = candidate.resolve(Kind::Part, "part-z").unwrap();
    let staff_order = CandidateOrder::new(&part, Children::Staffs);
    let new_part = candidate.insert_part(raw_part("new-part"), None).unwrap();
    assert_eq!(
        candidate.insertion_index(&staff_order, Some("staff-z"), None),
        Ok(1)
    );
    let mut elsewhere = raw_part("elsewhere");
    elsewhere.staves[0].id = "remote".into();
    elsewhere.staves[1].id = "remote".into();
    elsewhere.measure_contents[0].voices[0].sequence.events[0].id = "remote-event".into();
    elsewhere.measure_contents[1].voices[0].sequence.events[0].id = "remote-event".into();
    let elsewhere = candidate.insert_part(elsewhere, None).unwrap();
    assert_eq!(
        candidate.insertion_index(&staff_order, Some("remote"), None),
        Err(Failure::InternalError)
    );
    assert_eq!(
        candidate.insertion_index(
            &CandidateOrder::new(&elsewhere, Children::Staffs),
            Some("remote"),
            None
        ),
        Err(Failure::InternalError)
    );
    assert_eq!(
        candidate.insertion_index(&staff_order, Some("note-a"), None),
        Err(Failure::AnchorNotFound)
    );
    let contents = ordered(&mut candidate, &new_part, Children::Contents);
    let voices = ordered(&mut candidate, &contents[0], Children::Voices);
    let events = CandidateOrder::new(&voices[0], Children::Events);
    assert_eq!(
        candidate.insertion_index(&events, Some("remote-event"), None),
        Err(Failure::AnchorWrongOwner)
    );
    assert_eq!(
        candidate.insertion_index(&events, Some("event-a"), None),
        Ok(1)
    );
    assert_eq!(
        candidate.insertion_index(&events, Some("missing"), None),
        Err(Failure::AnchorNotFound)
    );
    assert_eq!(
        candidate.move_child(&staff_order, "staff-z", Some("staff-z")),
        Err(Failure::InternalError)
    );
    candidate.hide(&new_part).unwrap();
    assert_eq!(
        candidate.move_child(&staff_order, "staff-z", Some("staff-z")),
        Err(Failure::AnchorSelfReference)
    );
    assert_eq!(
        candidate.move_child(&staff_order, "missing", Some("missing")),
        Err(Failure::TargetNotFound)
    );
}

#[test]
fn hidden_children_do_not_shift_insert_or_move_positions() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    let mut candidate = Candidate::new(TransactionOverlayV1::new(&store), document.id);
    let original = candidate.resolve(Kind::Part, "part-z").unwrap();
    let first = candidate.insert_part(raw_part("first"), None).unwrap();
    candidate.hide(&first).unwrap();
    let second = candidate
        .insert_part(raw_part("second"), Some("part-z"))
        .unwrap();
    let order = CandidateOrder::new(&candidate.document, Children::Parts);
    assert_eq!(order_ids(&mut candidate, &order), ["part-z", "second"]);
    candidate.hide(&original).unwrap();
    candidate.move_child(&order, "second", None).unwrap();
    assert_eq!(
        ordered(&mut candidate, &order.owner, Children::Parts),
        [second]
    );
    assert_eq!(candidate.work.prefix_order_copies, 1);
}

#[test]
fn voice_anchor_checks_content_identity_and_owner_even_for_start() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    let mut candidate = Candidate::new(TransactionOverlayV1::new(&store), document.id);
    let original = candidate.resolve(Kind::Part, "part-z").unwrap();
    // Even the Part raw ID is repeated: identity is an occurrence, not a string.
    let added = candidate.insert_part(raw_part("part-z"), None).unwrap();
    let old_contents = ordered(&mut candidate, &original, Children::Contents);
    let new_contents = ordered(&mut candidate, &added, Children::Contents);
    assert_eq!(
        candidate.raw_id(&old_contents[0]),
        candidate.raw_id(&new_contents[0])
    );
    for after in [None, Some("voice-a")] {
        assert_eq!(
            candidate.voice_insertion_index(&original, &new_contents[0], after),
            Err(Failure::InternalError)
        );
        assert_eq!(
            candidate.voice_insertion_index(&added, &old_contents[0], after),
            Err(Failure::InternalError)
        );
        assert_eq!(
            candidate.voice_insertion_index(&added, &new_contents[0], after),
            Ok(usize::from(after.is_some()))
        );
    }
    candidate.hide(&new_contents[0]).unwrap();
    assert_eq!(
        candidate.voice_insertion_index(&added, &new_contents[0], None),
        Err(Failure::InternalError)
    );
}

#[test]
fn indexed_prefix_references_and_added_raw_references_filter_hidden_sources() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    let mut prefix = TransactionOverlayV1::new(&store);
    prefix
        .update_reference(
            Reference::VoiceDefaultStaff {
                voice_id: id("voice-a"),
            },
            ReferenceValueV1::StableId(id("staff-z")),
        )
        .unwrap();
    let mut candidate = Candidate::new(prefix, document.id);
    let original_event = candidate.resolve(Kind::Event, "event-a").unwrap();
    assert_eq!(
        candidate.staff_referrers("staff-a"),
        std::slice::from_ref(&original_event)
    );
    let prefix_z = candidate.staff_referrers("staff-z");
    assert_eq!(prefix_z.len(), 2);
    let mut payload = raw_part("new-part");
    payload.measure_contents[0].voices[0]
        .default_staff_id
        .clear();
    payload.measure_contents[0].voices[0].sequence.events[0].staff_id = Some("".into());
    let added = candidate.insert_part(payload, None).unwrap();
    let empty_refs = candidate.staff_referrers("");
    assert_eq!(empty_refs.len(), 2);
    assert_ne!(empty_refs[0], empty_refs[1]);
    assert_eq!(candidate.staff_referrers("staff-z").len(), 3);
    candidate.hide(&original_event).unwrap();
    assert!(candidate.staff_referrers("staff-a").is_empty());
    candidate.hide(&added).unwrap();
    assert!(candidate.staff_referrers("").is_empty());
    assert_eq!(candidate.staff_referrers("staff-z"), prefix_z);
}

#[test]
fn read_layer_never_detaches_base_aggregates_or_copies_base_order_arrays() {
    use crate::{
        change_set::AnchoredExtensionBlockV1,
        overlay::{CoreBaseReadV1, ExtensionKeyV1},
        store::LiveScoreStore,
    };
    use std::cell::Cell;

    struct Guarded<'a> {
        store: &'a LiveScoreStore,
        visited: Cell<usize>,
        refs: Cell<usize>,
    }
    impl CoreBaseReadV1 for Guarded<'_> {
        fn resolve_entity(&self, value: &StableId) -> Option<Entity> {
            self.store.resolve_entity(value)
        }
        fn read_owner(&self, value: &Entity) -> Option<Owner> {
            self.store.read_owner(value)
        }
        fn read_scalar(&self, value: &Scalar) -> Option<Value> {
            self.store.read_scalar(value)
        }
        fn read_transposition(
            &self,
            value: &StableId,
        ) -> Option<brilliant_score_foundation::TranspositionV1> {
            self.store.read_transposition(value)
        }
        fn detach_entity(&self, _: &Entity) -> Option<EntityBundleV1> {
            panic!("candidate read detached a base aggregate")
        }
        fn read_event_content_kind(&self, value: &StableId) -> Option<EventContentKind> {
            self.store.read_event_content_kind(value)
        }
        fn read_order(&self, _: &Order) -> Option<Vec<StableId>> {
            panic!("candidate read cloned a base order")
        }
        fn visit_order(
            &self,
            value: &Order,
            visitor: &mut dyn FnMut(&StableId) -> bool,
        ) -> Option<()> {
            self.store.visit_order(value, &mut |id| {
                self.visited.set(self.visited.get() + 1);
                visitor(id)
            })
        }
        fn read_extension(&self, value: &ExtensionKeyV1) -> Option<AnchoredExtensionBlockV1> {
            self.store.read_extension(value)
        }
        fn read_reference(&self, value: &Reference) -> Option<ReferenceValueV1> {
            self.store.read_reference(value)
        }
        fn list_references_to(&self, value: &StableId) -> Vec<Reference> {
            self.refs.set(self.refs.get() + 1);
            self.store.list_references_to(value)
        }
        fn read_voice_time(&self, _: &StableId) -> Option<Vec<StableId>> {
            panic!("candidate read cloned a base time index")
        }
    }
    let mut document = fixture();
    let source = document.parts[0].staves[0].clone();
    for index in 0..4096 {
        let mut staff = source.clone();
        staff.id = id(&format!("large-staff-{index}"));
        document.parts[0].staves.push(staff);
    }
    let store = build_live_score_store(&document).unwrap();
    let guard = Guarded {
        store: &store,
        visited: Cell::new(0),
        refs: Cell::new(0),
    };
    let mut candidate = Candidate::new(TransactionOverlayV1::new(&guard), document.id.clone());
    let part = candidate.resolve(Kind::Part, "part-z").unwrap();
    let staff = candidate.resolve(Kind::Staff, "large-staff-4095").unwrap();
    assert!(candidate.read_value(&staff).is_some());
    assert_eq!(
        guard.visited.get(),
        0,
        "indexed scalar reads must not visit sibling orders"
    );
    let note = candidate.resolve(Kind::Note, "note-a").unwrap();
    let Some(Value::NoteWrittenPitch(mut pitch)) = candidate.read_value(&note) else {
        panic!("fixture pitch");
    };
    pitch.octave = SafeInteger::new(7).unwrap();
    let value = Value::NoteWrittenPitch(pitch);
    candidate.replace_value(&note, value.clone()).unwrap();
    assert_eq!(candidate.read_value(&note), Some(value));
    let voice = candidate.resolve(Kind::Voice, "voice-a").unwrap();
    candidate
        .replace_staff_reference(&voice, Some(String::new()))
        .unwrap();
    assert_eq!(
        candidate.staff_referrers_in_part(&part, "").unwrap(),
        std::slice::from_ref(&voice)
    );
    candidate
        .replace_staff_reference(&voice, Some("staff-a".into()))
        .unwrap();
    assert_eq!(
        guard.visited.get(),
        0,
        "local writes must not traverse orders"
    );
    assert!(candidate.orders.is_empty());
    let order = CandidateOrder::new(&part, Children::Staffs);
    candidate.visit_order(&order, &mut |_, _| false).unwrap();
    assert_eq!(guard.visited.get(), 1);
    assert_eq!(
        candidate.insertion_index(&order, Some("large-staff-4095"), None),
        Ok(4098)
    );
    assert_eq!(candidate.work.prefix_order_copies, 0);
    assert!(candidate.orders.is_empty());
    candidate
        .move_child(&order, "large-staff-4095", None)
        .unwrap();
    assert_eq!(candidate.work.prefix_order_copies, 1);
    assert_eq!(candidate.work.copied_entries, 4098);
    let before = guard.visited.get();
    candidate
        .move_child(&order, "large-staff-4095", Some("staff-a"))
        .unwrap();
    assert_eq!(
        guard.visited.get(),
        before,
        "later writes must reuse the candidate order"
    );
    assert_eq!(candidate.staff_referrers("staff-a").len(), 2);
    assert_eq!(guard.refs.get(), 1);
    candidate.hide(&part).unwrap();
    assert_eq!(
        candidate.resolve(Kind::Note, "note-a"),
        Err(Failure::TargetNotFound)
    );
    drop(candidate);
    assert_eq!(
        store.export_document().unwrap(),
        document,
        "dropping a candidate publishes nothing"
    );
}

#[test]
fn insertion_with_the_same_id_as_its_anchor_retains_both_occurrences() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    let mut candidate = Candidate::new(TransactionOverlayV1::new(&store), document.id);
    let original = candidate.resolve(Kind::Part, "part-z").unwrap();
    let added = candidate
        .insert_part(raw_part("part-z"), Some("part-z"))
        .unwrap();
    let order = CandidateOrder::new(&candidate.document, Children::Parts);
    assert_eq!(
        ordered(&mut candidate, &order.owner, Children::Parts),
        [original, added]
    );
    assert_eq!(
        candidate.resolve(Kind::Part, "part-z"),
        Err(Failure::InternalError)
    );
}

#[test]
fn failed_anchor_preparation_has_no_candidate_or_prefix_delta() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    let mut candidate = Candidate::new(TransactionOverlayV1::new(&store), document.id);
    assert_eq!(
        candidate.insert_part(raw_part("new-part"), Some("missing")),
        Err(Failure::AnchorNotFound)
    );
    assert!(candidate.nodes.is_empty());
    assert!(candidate.orders.is_empty());
    assert!(candidate.added.is_empty());
    let part = candidate.resolve(Kind::Part, "part-z").unwrap();
    let order = CandidateOrder::new(&part, Children::Staffs);
    assert_eq!(
        candidate.move_child(&order, "staff-a", Some("missing")),
        Err(Failure::AnchorNotFound)
    );
    assert_eq!(order_ids(&mut candidate, &order), ["staff-z", "staff-a"]);
    assert_eq!(candidate.work.prefix_order_copies, 0);
    assert_eq!(candidate.prefix.operation_count(), 0);
}

#[test]
fn long_document_owner_is_shared_by_every_added_root_and_order_key() {
    let mut document = fixture();
    document.id = id(&"long-document-id/".repeat(4096));
    let store = build_live_score_store(&document).unwrap();
    let mut candidate = Candidate::new(TransactionOverlayV1::new(&store), document.id);
    let Occurrence::Prefix(root) = candidate.document.clone() else {
        unreachable!()
    };
    for _ in 0..64 {
        let added = candidate.insert_part(raw_part("same-part"), None).unwrap();
        let Occurrence::Prefix(owner) = candidate.owner(&added).unwrap() else {
            unreachable!()
        };
        assert!(
            Arc::ptr_eq(&root, &owner),
            "owner clones must not copy the long document ID"
        );
    }
    let root_order = candidate
        .orders
        .keys()
        .find(|order| order.children == Children::Parts)
        .unwrap();
    let Occurrence::Prefix(owner) = &root_order.owner else {
        unreachable!()
    };
    assert!(Arc::ptr_eq(&root, owner));
    assert_eq!(candidate.matches(Kind::Part, "same-part").len(), 2);
    assert_eq!(
        ordered(&mut candidate, &Occurrence::Prefix(root), Children::Parts).len(),
        65
    );
}

#[test]
fn duplicate_raw_ids_share_strings_without_merging_nodes_or_refunding_hidden_data() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    let mut candidate = Candidate::new(TransactionOverlayV1::new(&store), document.id);
    let long_id = "long-raw-id/".repeat(8192);
    let mut payload = raw_part(&long_id);
    payload.staves[0].id = long_id.clone();
    payload.measure_contents[0].voices[0].default_staff_id = long_id.clone();
    let first = candidate.insert_part(payload.clone(), None).unwrap();
    let unique_bytes = candidate.id_pool.iter().map(|id| id.len()).sum::<usize>();
    let node_count = candidate.nodes.len();
    let second = candidate.insert_part(payload, None).unwrap();
    assert_ne!(first, second);
    assert_eq!(candidate.nodes.len(), node_count * 2);
    assert_eq!(
        candidate.id_pool.iter().map(|id| id.len()).sum::<usize>(),
        unique_bytes
    );
    let shared = candidate.id_pool.get(long_id.as_str()).unwrap();
    assert!(unique_bytes >= long_id.len());
    for node in &candidate.nodes {
        if node.raw_id.as_ref() == long_id {
            assert!(Arc::ptr_eq(&node.raw_id, shared));
        }
        if let Some(reference) = &node.staff_id
            && reference.as_ref() == long_id
        {
            assert!(Arc::ptr_eq(reference, shared));
        }
    }
    for by_id in candidate.added.values() {
        if let Some((key, _)) = by_id.get_key_value(long_id.as_str()) {
            assert!(Arc::ptr_eq(key, shared));
        }
    }
    assert_eq!(
        candidate.resolve(Kind::Part, &long_id),
        Err(Failure::InternalError)
    );
    candidate.hide(&first).unwrap();
    assert_eq!(candidate.resolve(Kind::Part, &long_id), Ok(second));
    assert_eq!(
        candidate.nodes.len(),
        node_count * 2,
        "hidden occurrences stay retained until transaction disposal"
    );
    assert_eq!(
        candidate.id_pool.iter().map(|id| id.len()).sum::<usize>(),
        unique_bytes
    );
}

#[test]
fn prefix_content_occurrences_share_their_long_part_owner() {
    let mut document = fixture();
    let long_part_id = "long-part-id/".repeat(4096);
    document.parts[0].id = id(&long_part_id);
    let store = build_live_score_store(&document).unwrap();
    let mut candidate = Candidate::new(TransactionOverlayV1::new(&store), document.id);
    let part = candidate.resolve(Kind::Part, &long_part_id).unwrap();
    let Occurrence::Prefix(shared_part) = &part else {
        unreachable!()
    };
    let contents = ordered(&mut candidate, &part, Children::Contents);
    for content in contents {
        let Occurrence::PrefixContent { part, .. } = &content else {
            unreachable!()
        };
        assert!(Arc::ptr_eq(part, shared_part));
        let Occurrence::Prefix(owner) = candidate.owner(&content).unwrap() else {
            unreachable!()
        };
        assert!(Arc::ptr_eq(&owner, shared_part));
    }
    assert!(
        candidate.id_pool.is_empty(),
        "borrowed prefix reads do not build a whole-document string pool"
    );
    assert!(candidate.nodes.is_empty());
}

#[test]
fn every_part_collection_reservation_failure_is_terminal_and_preserves_the_prefix() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    let prepare_prefix = || {
        let mut prefix = TransactionOverlayV1::new(&store);
        let segment = prefix.begin_segment();
        prefix
            .replace_scalar(
                Scalar::PartName {
                    part_id: id("part-z"),
                },
                Value::PartName("prefix edit".into()),
            )
            .unwrap();
        prefix.add_prepared_effects(1).unwrap();
        prefix.end_segment(segment).unwrap();
        prefix
    };
    let expected = prepare_prefix().finish().unwrap();
    let mutate = |candidate: &mut Candidate<'_>| -> Result<(), Failure> {
        let mut payload = raw_part("new-part");
        payload
            .measure_contents
            .push(payload.measure_contents[0].clone());
        payload.staves[1].id.clear();
        let inserted = candidate.insert_part(payload, Some("part-z"))?;
        candidate.hide(&inserted)
    };
    let mut baseline = Candidate::new(prepare_prefix(), document.id.clone());
    mutate(&mut baseline).unwrap();
    let attempts = baseline.reservation.attempts;
    assert!(
        attempts > 20,
        "exercise nested collection growth, not just the outer Part order"
    );
    assert_eq!(
        baseline.reservation.sites, 0xff,
        "the scenario must cover the eight original collection reservation sites"
    );
    assert_eq!(baseline.prefix.finish().unwrap(), expected);

    for fail_at in 1..=attempts {
        let mut candidate = Candidate::new(prepare_prefix(), document.id.clone());
        candidate.reservation = Reservation::fail_at(fail_at);
        let part = candidate.resolve(Kind::Part, "part-z").unwrap();
        assert_eq!(
            mutate(&mut candidate),
            Err(Failure::InternalError),
            "reservation {fail_at}"
        );
        assert_eq!(candidate.reservation.attempts, fail_at);
        assert_eq!(
            candidate.reservation.ensure_active(),
            Err(Failure::InternalError)
        );
        let retained = (
            candidate.nodes.len(),
            candidate.orders.len(),
            candidate.hidden.len(),
            candidate.id_pool.len(),
        );
        assert_eq!(
            candidate.insert_part(raw_part("cannot-continue"), None),
            Err(Failure::InternalError)
        );
        assert_eq!(
            candidate.move_child(
                &CandidateOrder::new(&part, Children::Staffs),
                "staff-a",
                None
            ),
            Err(Failure::InternalError)
        );
        assert_eq!(candidate.hide(&part), Err(Failure::InternalError));
        assert_eq!(
            candidate.reservation.attempts, fail_at,
            "a terminal candidate must not attempt another reservation"
        );
        assert_eq!(
            (
                candidate.nodes.len(),
                candidate.orders.len(),
                candidate.hidden.len(),
                candidate.id_pool.len()
            ),
            retained
        );
        assert_eq!(
            candidate.read_value(&part),
            Some(Value::PartName("prefix edit".into()))
        );
        assert_eq!(
            candidate.prefix.finish().unwrap(),
            expected,
            "prefix at reservation {fail_at}"
        );
        assert_eq!(
            store.export_document().unwrap(),
            document,
            "live Store at reservation {fail_at}"
        );
    }
}

#[test]
fn partial_order_copy_capacity_failures_cannot_publish_a_move_or_reactivate() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    let mut baseline = Candidate::new(TransactionOverlayV1::new(&store), document.id.clone());
    let part = baseline.resolve(Kind::Part, "part-z").unwrap();
    let order = CandidateOrder::new(&part, Children::Staffs);
    baseline
        .move_child(&order, "staff-z", Some("staff-a"))
        .unwrap();
    assert_eq!(order_ids(&mut baseline, &order), ["staff-a", "staff-z"]);
    let attempts = baseline.reservation.attempts;
    assert_eq!(attempts, 3);
    for fail_at in 1..=attempts {
        let mut candidate = Candidate::new(TransactionOverlayV1::new(&store), document.id.clone());
        candidate.reservation = Reservation::fail_at(fail_at);
        assert_eq!(
            candidate.move_child(&order, "staff-z", Some("staff-a")),
            Err(Failure::InternalError)
        );
        assert!(candidate.orders.is_empty());
        assert_eq!(candidate.work.prefix_order_copies, 0);
        assert_eq!(order_ids(&mut candidate, &order), ["staff-z", "staff-a"]);
        assert_eq!(
            candidate.copy_order_for_write(&order),
            Err(Failure::InternalError)
        );
        assert!(candidate.orders.is_empty());
        assert_eq!(candidate.prefix.operation_count(), 0);
    }
    assert_eq!(store.export_document().unwrap(), document);
}

#[test]
fn real_capacity_and_attempt_overflow_fail_without_allocating_or_wrapping() {
    let mut values = vec![1_u8];
    let mut reservation = Reservation::default();
    assert_eq!(
        reservation.vec(Site::Nodes, &mut values, usize::MAX),
        Err(Failure::InternalError)
    );
    assert_eq!(values, [1]);
    assert_eq!(
        reservation.vec(Site::Nodes, &mut values, 1),
        Err(Failure::InternalError)
    );
    assert_eq!(reservation.attempts, 1);

    let mut values = HashMap::<u8, u8>::new();
    let mut reservation = Reservation::default();
    assert_eq!(
        reservation.map(Site::Orders, &mut values, usize::MAX),
        Err(Failure::InternalError)
    );
    assert!(values.is_empty());
    let mut values = HashSet::<u8>::new();
    let mut reservation = Reservation::default();
    assert_eq!(
        reservation.set(Site::IdPool, &mut values, usize::MAX),
        Err(Failure::InternalError)
    );
    assert!(values.is_empty());

    let mut reservation = Reservation::default();
    reservation.attempts = usize::MAX;
    assert_eq!(
        reservation.set(Site::IdPool, &mut values, 0),
        Err(Failure::InternalError)
    );
    assert_eq!(reservation.attempts, usize::MAX);
    assert_eq!(reservation.ensure_active(), Err(Failure::InternalError));
}
