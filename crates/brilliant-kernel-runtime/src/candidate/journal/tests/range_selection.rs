use super::*;
use brilliant_kernel_contracts::{
    MeasurePointKindV1, MeasurePointV1, PartMeasurePointKindV1, PartMeasurePointV1, ScoreRangeV1,
    VoiceEventPointKindV1, VoiceEventPointV1,
};
use brilliant_score_foundation::{AdmissionMeasureDefinitionV1, ScoreDocumentV1};

fn document() -> ScoreDocumentV1 {
    let mut document = fixture();
    let definition = document.measure_definitions[0].clone();
    document.measure_definitions = (0..3)
        .map(|index| {
            let mut value = definition.clone();
            value.id = id(format!("m{index}"));
            value
        })
        .collect();
    let template = document.parts[0].clone();
    document.parts = (0..2)
        .map(|p| {
            let mut part = template.clone();
            part.id = id(format!("p{p}"));
            part.staves.truncate(1);
            part.staves[0].id = id(format!("s{p}"));
            part.measure_contents = (0..3)
                .map(|m| {
                    let mut content = template.measure_contents[0].clone();
                    content.measure_id = id(format!("m{m}"));
                    content.voices.truncate(1);
                    let voice = &mut content.voices[0];
                    voice.id = id(format!("v{p}-{m}"));
                    voice.default_staff_id = part.staves[0].id.clone();
                    let event = voice.sequence.events[0].clone();
                    voice.sequence.events = (0..2)
                        .map(|e| {
                            let mut value = event.clone();
                            value.id = id(format!("e{p}-{m}-{e}"));
                            value.staff_id = Some(part.staves[0].id.clone());
                            if let RhythmicContentV1::Notes { notes } = &mut value.content {
                                for (n, note) in notes.iter_mut().enumerate() {
                                    note.id = id(format!("n{p}-{m}-{e}-{n}"));
                                }
                            }
                            value
                        })
                        .collect();
                    content
                })
                .collect();
            if p == 1 {
                part.measure_contents.reverse();
            }
            part
        })
        .collect();
    document.extensions.clear();
    document
}

fn measure(start: &str, end: &str) -> ScoreRangeV1 {
    let point = |raw| MeasurePointV1 {
        kind: MeasurePointKindV1::Measure,
        measure_id: id(raw),
    };
    ScoreRangeV1::MeasureRange {
        start: point(start),
        end: point(end),
    }
}
fn part_range(part: &str, start: &str, end: &str) -> ScoreRangeV1 {
    let point = |raw| PartMeasurePointV1 {
        kind: PartMeasurePointKindV1::PartMeasure,
        part_id: id(part),
        measure_id: id(raw),
    };
    ScoreRangeV1::PartMeasureRange {
        start: point(start),
        end: point(end),
    }
}
fn voice_range(voice: &str, start: &str, end: &str) -> ScoreRangeV1 {
    let point = |raw| VoiceEventPointV1 {
        kind: VoiceEventPointKindV1::VoiceEvent,
        voice_id: id(voice),
        event_id: id(raw),
    };
    ScoreRangeV1::VoiceEventRange {
        start: point(start),
        end: point(end),
    }
}
fn recorder<'a>(
    store: &'a crate::store::LiveScoreStore,
    document: &ScoreDocumentV1,
) -> Recorder<'a> {
    Recorder::new(Candidate::new(
        TransactionOverlayV1::new(store),
        document.id.clone(),
    ))
}
fn raw_ids(candidate: &Candidate<'_>, sources: &[Occurrence]) -> Vec<JsString> {
    sources
        .iter()
        .map(|source| candidate.raw_id(source).unwrap().clone())
        .collect()
}
fn event(document: &ScoreDocumentV1, raw: &str) -> RhythmicEventV1<JsString> {
    RhythmicEventV1 {
        id: raw.into(),
        duration: document.parts[0].measure_contents[0].voices[0]
            .sequence
            .events[0]
            .duration
            .clone(),
        staff_id: None,
        content: RhythmicContentV1::Rest,
    }
}

#[test]
fn all_three_ranges_normalize_endpoints_and_preserve_canonical_owner_order() {
    let initial = document();
    let store = build_live_score_store(&initial).unwrap();
    let mut recorder = recorder(&store, &initial);
    let selected = recorder
        .resolve_range_selection(initial.id.as_js_string(), &measure("m2", "m0"))
        .unwrap();
    assert_eq!(
        raw_ids(&recorder.candidate, selected.measures.as_ref().unwrap()),
        ["m0", "m1", "m2"].map(JsString::from)
    );
    let expected: Vec<JsString> = (0..3)
        .flat_map(|m| (0..2).flat_map(move |p| (0..2).map(move |e| format!("e{p}-{m}-{e}").into())))
        .collect();
    assert_eq!(raw_ids(&recorder.candidate, &selected.events), expected);
    let selected = recorder
        .resolve_range_selection(initial.id.as_js_string(), &part_range("p1", "m2", "m0"))
        .unwrap();
    assert!(selected.measures.is_none());
    assert_eq!(
        raw_ids(&recorder.candidate, &selected.events),
        (0..3)
            .flat_map(|m| (0..2).map(move |e| JsString::from(format!("e1-{m}-{e}"))))
            .collect::<Vec<_>>()
    );
    let selected = recorder
        .resolve_range_selection(
            initial.id.as_js_string(),
            &voice_range("v0-0", "e0-0-1", "e0-0-0"),
        )
        .unwrap();
    assert_eq!(
        raw_ids(&recorder.candidate, &selected.events),
        ["e0-0-0", "e0-0-1"].map(JsString::from)
    );
    assert!(recorder.steps.is_empty());
}

#[test]
fn duplicate_endpoint_overrides_missing_endpoint_in_both_directions() {
    let initial = document();
    let store = build_live_score_store(&initial).unwrap();
    for reverse in [false, true] {
        let mut recorder = recorder(&store, &initial);
        recorder
            .insert_measure_bundle(
                AdmissionMeasureDefinitionV1 {
                    id: "m0".into(),
                    meter: initial.measure_definitions[0].meter.clone(),
                    pickup_duration: None,
                },
                Vec::new(),
                None,
            )
            .unwrap();
        let range = if reverse {
            measure("m0", "missing")
        } else {
            measure("missing", "m0")
        };
        assert!(matches!(
            recorder.resolve_range_selection(initial.id.as_js_string(), &range),
            Err(Failure::InvalidRange)
        ));
        assert!(recorder.candidate.reservation.ensure_active().is_err());
    }
    for reverse in [false, true] {
        let mut recorder = recorder(&store, &initial);
        let voice = recorder
            .candidate
            .resolve(Kind::Voice, &"v0-0".into())
            .unwrap();
        recorder
            .insert_event(&voice, event(&initial, "e0-0-0"), None)
            .unwrap();
        let range = if reverse {
            voice_range("v0-0", "e0-0-0", "missing")
        } else {
            voice_range("v0-0", "missing", "e0-0-0")
        };
        assert!(matches!(
            recorder.resolve_range_selection(initial.id.as_js_string(), &range),
            Err(Failure::InvalidRange)
        ));
    }
}

#[test]
fn missing_endpoint_precedes_owner_mismatch_and_document_precedes_range() {
    let initial = document();
    let store = build_live_score_store(&initial).unwrap();
    for missing in [false, true] {
        let mut recorder = recorder(&store, &initial);
        let range = ScoreRangeV1::VoiceEventRange {
            start: VoiceEventPointV1 {
                kind: VoiceEventPointKindV1::VoiceEvent,
                voice_id: id("v0-0"),
                event_id: id("e1-0-0"),
            },
            end: VoiceEventPointV1 {
                kind: VoiceEventPointKindV1::VoiceEvent,
                voice_id: id("v0-0"),
                event_id: id(if missing { "missing" } else { "e0-0-1" }),
            },
        };
        let expected = if missing {
            Failure::RangeEndpointNotFound
        } else {
            Failure::RangeOwnerMismatch
        };
        assert_eq!(
            recorder
                .resolve_range_selection(initial.id.as_js_string(), &range)
                .err(),
            Some(expected)
        );
    }
    let mut recorder = recorder(&store, &initial);
    assert_eq!(
        recorder
            .resolve_range_selection(&"missing-doc".into(), &measure("missing", "missing"))
            .err(),
        Some(Failure::TargetNotFound)
    );
}

#[test]
fn interior_content_missing_and_duplicate_keep_selection_specific_failure_codes() {
    let initial = document();
    let store = build_live_score_store(&initial).unwrap();
    for duplicate in [false, true] {
        for part_only in [false, true] {
            let mut recorder = recorder(&store, &initial);
            let definition = AdmissionMeasureDefinitionV1 {
                id: if duplicate { "m1" } else { "inserted-gap" }.into(),
                meter: initial.measure_definitions[0].meter.clone(),
                pickup_duration: None,
            };
            let payload = if duplicate {
                let part = recorder
                    .candidate
                    .resolve(Kind::Part, &"p0".into())
                    .unwrap();
                vec![(part, Vec::new())]
            } else {
                Vec::new()
            };
            recorder
                .insert_measure_bundle(definition, payload, Some(&"m0".into()))
                .unwrap();
            let range = if part_only {
                part_range("p0", "m0", "m2")
            } else {
                measure("m0", "m2")
            };
            let expected = if part_only {
                Failure::RangeEndpointNotFound
            } else {
                Failure::InvalidRange
            };
            assert_eq!(
                recorder
                    .resolve_range_selection(initial.id.as_js_string(), &range)
                    .err(),
                Some(expected)
            );
            assert_eq!(store.export_document().unwrap(), initial);
        }
    }
}

#[test]
fn added_event_rebirth_and_recorded_order_are_selected_by_current_occurrence() {
    let initial = document();
    let store = build_live_score_store(&initial).unwrap();
    let mut recorder = recorder(&store, &initial);
    let old = recorder
        .candidate
        .resolve(Kind::Event, &"e0-0-0".into())
        .unwrap();
    recorder.remove_event(&"e0-0-0".into()).unwrap();
    let voice = recorder
        .candidate
        .resolve(Kind::Voice, &"v0-0".into())
        .unwrap();
    let new = recorder
        .insert_event(&voice, event(&initial, "e0-0-0"), Some(&"e0-0-1".into()))
        .unwrap();
    assert_ne!(old, new);
    let selected = recorder
        .resolve_range_selection(
            initial.id.as_js_string(),
            &voice_range("v0-0", "e0-0-0", "e0-0-1"),
        )
        .unwrap();
    assert_eq!(
        selected.events,
        vec![
            recorder
                .candidate
                .resolve(Kind::Event, &"e0-0-1".into())
                .unwrap(),
            new
        ]
    );
    assert!(!selected.events.contains(&old));
}

#[test]
fn selected_unrecorded_field_or_order_changes_are_terminal_but_recorded_fields_are_valid() {
    let initial = document();
    let store = build_live_score_store(&initial).unwrap();
    for recorded in [false, true] {
        let mut recorder = recorder(&store, &initial);
        let source = recorder
            .candidate
            .resolve(Kind::Event, &"e0-0-0".into())
            .unwrap();
        if recorded {
            recorder.replace_reference(&source, None).unwrap();
        } else {
            recorder
                .candidate
                .replace_staff_reference(&source, None)
                .unwrap();
        }
        let result = recorder.resolve_range_selection(
            initial.id.as_js_string(),
            &voice_range("v0-0", "e0-0-0", "e0-0-1"),
        );
        if recorded {
            assert!(result.is_ok());
        } else {
            assert_eq!(result.err(), Some(Failure::InternalError));
            assert!(recorder.candidate.reservation.ensure_active().is_err());
        }
    }
    let mut recorder = recorder(&store, &initial);
    let voice = recorder
        .candidate
        .resolve(Kind::Voice, &"v0-0".into())
        .unwrap();
    recorder
        .candidate
        .move_child(
            &CandidateOrder::new(&voice, Children::Events),
            &"e0-0-1".into(),
            None,
        )
        .unwrap();
    assert_eq!(
        recorder
            .resolve_range_selection(
                initial.id.as_js_string(),
                &voice_range("v0-0", "e0-0-0", "e0-0-1")
            )
            .err(),
        Some(Failure::InternalError)
    );
}

#[test]
fn frozen_prefix_order_is_respected_and_internal_duplicate_events_remain_selectable() {
    let initial = document();
    let store = build_live_score_store(&initial).unwrap();
    let mut prefix = TransactionOverlayV1::new(&store);
    prefix
        .move_ordered_child(
            Order::Events {
                voice_id: id("v0-0"),
            },
            id("e0-0-1"),
            crate::change_set::StableAnchorV1::Start,
        )
        .unwrap();
    let mut recorder = Recorder::new(Candidate::new(prefix, initial.id.clone()));
    let selected = recorder
        .resolve_range_selection(
            initial.id.as_js_string(),
            &voice_range("v0-0", "e0-0-0", "e0-0-1"),
        )
        .unwrap();
    assert_eq!(
        raw_ids(&recorder.candidate, &selected.events),
        ["e0-0-1", "e0-0-0"].map(JsString::from)
    );
    let voice = recorder
        .candidate
        .resolve(Kind::Voice, &"v0-0".into())
        .unwrap();
    recorder
        .insert_event(&voice, event(&initial, "e0-0-0"), None)
        .unwrap();
    // Only endpoint uniqueness is a selection precondition. Effect preparation
    // decides whether duplicate internal raw Note/Event targets can be changed.
    let selected = recorder
        .resolve_range_selection(initial.id.as_js_string(), &part_range("p0", "m0", "m0"))
        .unwrap();
    assert_eq!(selected.events.len(), 3);
    assert_ne!(selected.events[0], selected.events[2]);
    assert_eq!(
        recorder.candidate.raw_id(&selected.events[0]),
        recorder.candidate.raw_id(&selected.events[2])
    );
}

#[test]
fn every_selection_reservation_failure_is_terminal_without_store_changes() {
    let initial = document();
    let store = build_live_score_store(&initial).unwrap();
    let range = measure("m0", "m2");
    let mut baseline = recorder(&store, &initial);
    baseline
        .resolve_range_selection(initial.id.as_js_string(), &range)
        .unwrap();
    let attempts = baseline.candidate.reservation.attempts;
    assert!(attempts > 0);
    for at in 1..=attempts {
        let mut recorder = recorder(&store, &initial);
        recorder.candidate.reservation = Reservation::fail_at(at);
        assert_eq!(
            recorder
                .resolve_range_selection(initial.id.as_js_string(), &range)
                .err(),
            Some(Failure::InternalError),
            "reservation {at}"
        );
        assert_eq!(recorder.candidate.reservation.attempts, at);
        assert!(recorder.candidate.reservation.ensure_active().is_err());
        assert!(recorder.steps.is_empty());
        assert_eq!(store.export_document().unwrap(), initial);
    }
}
