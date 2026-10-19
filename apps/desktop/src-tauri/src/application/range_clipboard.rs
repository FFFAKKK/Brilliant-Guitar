use super::*;
use crate::dto::{ScoreClipboardFragment, ScoreEventRange};

// Same public Core commands for single input and clipboard batches; IDs belong to the host.
pub(super) fn insert_command(
    voice_id: &str,
    anchor: &Value,
    duration: EventDuration,
    content: &InputContent,
) -> Value {
    let id = Uuid::new_v4().to_string();
    let (command_id, content) = match content {
        InputContent::Rest => ("core.voice.insert-rest-event", json!({ "kind": "rest" })),
        InputContent::Note { pitch } => (
            "core.voice.insert-notes-event",
            json!({ "kind": "notes",
            "notes": [{ "id": Uuid::new_v4().to_string(), "writtenPitch": pitch }] }),
        ),
    };
    json!({ "commandVersion": 1, "commandId": command_id,
        "target": { "kind": "voice", "voiceId": voice_id },
        "payload": { "anchor": anchor, "event": { "id": id, "duration": duration, "content": content } } })
}

fn voice_at<'a>(
    document: &'a ScoreDocumentV1,
    measure_id: &str,
    voice_id: &str,
) -> Option<&'a brilliant_score_foundation::VoiceV1> {
    document
        .parts
        .first()?
        .measure_contents
        .iter()
        .find(|item| id_text(&item.measure_id).ok().as_deref() == Some(measure_id))?
        .voices
        .iter()
        .find(|voice| id_text(&voice.id).ok().as_deref() == Some(voice_id))
}

pub(super) fn delete_range(
    session: &mut NotationSession,
    current: &ScoreSessionRead,
    range: &ScoreEventRange,
) -> Result<(), HostError> {
    let document = read_state(session)?.snapshot.document;
    let voice = voice_at(&document, &range.measure_id, &range.voice_id)
        .filter(|voice| {
            [&range.start_event_id, &range.end_event_id]
                .iter()
                .all(|id| {
                    voice
                        .sequence
                        .events
                        .iter()
                        .any(|event| id_text(&event.id).ok().as_deref() == Some(id.as_str()))
                })
        })
        .ok_or_else(|| {
            position_error(
                "editor.selection-stale",
                "选择范围已改变，请重新选择",
                &range.measure_id,
                409,
            )
        })?;
    submit_command(
        session,
        json!({ "commandVersion": 1, "commandId": "core.range.delete",
        "target": { "kind": "document", "documentId": current.document_id },
        "payload": { "range": { "kind": "voice-event-range",
            "start": { "kind": "voice-event", "voiceId": id_text(&voice.id)?, "eventId": range.start_event_id },
            "end": { "kind": "voice-event", "voiceId": id_text(&voice.id)?, "eventId": range.end_event_id } } } }),
    )
}

pub(super) fn paste_fragment(
    session: &mut NotationSession,
    current: &ScoreSessionRead,
    measure_id: &str,
    voice_id: &str,
    anchor: &InputSequenceAnchor,
    offset: Option<u16>,
    fragment: &ScoreClipboardFragment,
) -> Result<(), HostError> {
    let document = read_state(session)?.snapshot.document;
    let stale = || {
        position_error(
            "editor.position-stale",
            "粘贴位置已改变，请重新定位",
            measure_id,
            409,
        )
    };
    let voice = voice_at(&document, measure_id, voice_id).ok_or_else(stale)?;
    let index = match anchor {
        InputSequenceAnchor::Start => 0,
        InputSequenceAnchor::AfterEvent { event_id } => {
            voice
                .sequence
                .events
                .iter()
                .position(|event| id_text(&event.id).ok().as_deref() == Some(event_id))
                .ok_or_else(stale)?
                + 1
        }
    };
    // Wide accumulation prevents imported overfull measures wrapping rhythmic offsets.
    let units = voice
        .sequence
        .events
        .iter()
        .map(|event| {
            duration(&event.duration)
                .and_then(duration_units)
                .map(u32::from)
        })
        .collect::<Option<Vec<_>>>()
        .ok_or_else(|| HostError::new("当前时值暂不支持编辑", 422))?;
    let used = units.iter().sum::<u32>();
    let anchor_offset = units[..index].iter().sum::<u32>();
    let requested = offset.map(u32::from).unwrap_or(anchor_offset);
    if requested < anchor_offset || (requested > anchor_offset && anchor_offset != used) {
        return Err(stale());
    }
    let gap = u16::try_from(requested - anchor_offset).map_err(|_| stale())?;
    let rests = rest_durations(gap)?;
    let mut commands = Vec::new();
    let mut insertion_anchor = serde_json::to_value(anchor).map_err(|_| HostError::internal())?;
    for rest in rests {
        let command = insert_command(voice_id, &insertion_anchor, rest, &InputContent::Rest);
        insertion_anchor =
            json!({ "kind": "after-event", "eventId": command["payload"]["event"]["id"] });
        commands.push(command);
    }
    for copied in &fragment.events {
        let command = insert_command(
            voice_id,
            &insertion_anchor,
            copied.duration,
            &copied.content,
        );
        insertion_anchor =
            json!({ "kind": "after-event", "eventId": command["payload"]["event"]["id"] });
        commands.push(command);
    }
    if commands.len() > brilliant_kernel_contracts::MAX_BATCH_CHILDREN_V1 {
        return Err(HostError::new("音乐片段及补齐休止超过单次100事件限制", 422));
    }
    submit_command(
        session,
        json!({ "commandVersion": 1, "commandId": "core.transaction.batch",
        "target": { "kind": "document", "documentId": current.document_id }, "payload": { "commands": commands } }),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture() -> (ScoreSessionService, String, ScoreSessionRead) {
        let mut service = ScoreSessionService::default();
        let workspace = Uuid::new_v4().to_string();
        let current = service
            .create(CreateScoreRequest {
                workspace_id: workspace.clone(),
                request_id: Uuid::new_v4().to_string(),
                expected_document_id: None,
                input: NewScoreInput {
                    title: "范围剪贴板".into(),
                    measure_count: 2,
                },
            })
            .unwrap();
        (service, workspace, current)
    }
    fn edit(
        service: &mut ScoreSessionService,
        workspace: &str,
        current: &ScoreSessionRead,
        action: Value,
    ) -> Result<ScoreSessionRead, HostError> {
        service.edit(ScoreEditRequest {
            workspace_id: workspace.into(),
            request_id: Uuid::new_v4().to_string(),
            document_id: current.document_id.clone(),
            expected_version: current.document_version,
            action: serde_json::from_value(action).unwrap(),
        })
    }
    fn measure(current: &ScoreSessionRead, index: usize) -> &StaffMeasure {
        let NotationView::Staff { measures, .. } = &current.notation else {
            panic!("staff")
        };
        &measures[index]
    }
    fn fragment() -> Value {
        json!({ "format": "brilliant-guitar.score-events", "version": 1, "events": [
        { "duration": { "base": 8, "dots": 1 }, "content": { "kind": "note", "pitch": { "step": "D", "octave": 5, "alter": -1 } } },
        { "duration": { "base": 32, "dots": 0 }, "content": { "kind": "rest" } },
        { "duration": { "base": 8, "dots": 0 }, "content": { "kind": "note", "pitch": { "step": "E", "octave": 4, "alter": 0 } } }
    ] })
    }
    fn paste(current: &ScoreSessionRead, index: usize) -> Value {
        let m = measure(current, index);
        json!({ "kind": "paste-fragment", "measureId": m.id, "voiceId": m.voice_id,
            "anchor": { "kind": "start" }, "fragment": fragment() })
    }
    #[test]
    fn range_clipboard_history_fresh_ids_reverse_delete_and_replay() {
        let (mut service, workspace, initial) = fixture();
        let first = edit(&mut service, &workspace, &initial, paste(&initial, 0)).unwrap();
        let m = measure(&first, 0);
        assert_eq!(m.events.len(), 3);
        assert_eq!(first.undo_depth, initial.undo_depth + 1);
        let ids: Vec<_> = m.events.iter().map(|e| e.id.clone()).collect();
        let mut action = paste(&first, 0);
        action["anchor"] = json!({ "kind": "after-event", "eventId": ids[1] });
        let request = ScoreEditRequest {
            workspace_id: workspace.clone(),
            request_id: Uuid::new_v4().to_string(),
            document_id: first.document_id.clone(),
            expected_version: first.document_version,
            action: serde_json::from_value(action).unwrap(),
        };
        let pasted = service.edit(request.clone()).unwrap();
        assert_eq!(service.edit(request).unwrap(), pasted);
        let events = &measure(&pasted, 0).events;
        assert_eq!(events.len(), 6);
        assert_eq!(events[0].id, ids[0]);
        assert_eq!(events[1].id, ids[1]);
        assert_eq!(events[5].id, ids[2]);
        for event in &events[2..5] {
            assert!(!ids.contains(&event.id));
        }
        assert_eq!(pasted.undo_depth, first.undo_depth + 1);
        let undo = edit(&mut service, &workspace, &pasted, json!({ "kind": "undo" })).unwrap();
        assert_eq!(undo.notation, first.notation);
        let redo = edit(&mut service, &workspace, &undo, json!({ "kind": "redo" })).unwrap();
        assert_eq!(redo.notation, pasted.notation);
        let m = measure(&redo, 0);
        let deleted = edit(&mut service, &workspace, &redo, json!({ "kind": "delete-range", "range": {
            "measureId": m.id, "voiceId": m.voice_id, "startEventId": m.events[4].id, "endEventId": m.events[2].id } })).unwrap();
        assert_eq!(deleted.notation, first.notation);
        assert_eq!(deleted.undo_depth, redo.undo_depth + 1);
        let restored = edit(
            &mut service,
            &workspace,
            &deleted,
            json!({ "kind": "undo" }),
        )
        .unwrap();
        assert_eq!(restored.notation, pasted.notation);
    }
    #[test]
    fn range_clipboard_gap_and_invalid_positions_are_atomic() {
        let (mut service, workspace, initial) = fixture();
        let mut action = paste(&initial, 0);
        action["offsetUnits"] = json!(32);
        let first = edit(&mut service, &workspace, &initial, action).unwrap();
        assert_eq!(measure(&first, 0).events[0].content, InputContent::Rest);
        assert_eq!(
            measure(&first, 0).events[0].duration,
            EventDuration { base: 2, dots: 0 }
        );
        let mut stale = paste(&first, 0);
        stale["offsetUnits"] = json!(16);
        assert_eq!(
            edit(&mut service, &workspace, &first, stale)
                .unwrap_err()
                .status,
            409
        );
        let m = measure(&first, 0);
        let other = measure(&first, 1);
        for range in [
            json!({ "measureId": other.id, "voiceId": m.voice_id, "startEventId": m.events[1].id, "endEventId": m.events[2].id }),
            json!({ "measureId": m.id, "voiceId": m.voice_id, "startEventId": m.events[1].id, "endEventId": "missing" }),
        ] {
            assert_eq!(
                edit(
                    &mut service,
                    &workspace,
                    &first,
                    json!({ "kind": "delete-range", "range": range })
                )
                .unwrap_err()
                .status,
                409
            );
        }
        assert_eq!(service.read(&workspace).unwrap(), Some(first));
    }
    #[test]
    fn range_clipboard_limits_and_bad_music_do_not_mutate() {
        let (mut service, workspace, initial) = fixture();
        for n in [0, 101] {
            let mut action = paste(&initial, 0);
            action["fragment"]["events"] = json!(vec![fragment()["events"][0].clone(); n]);
            assert_eq!(
                edit(&mut service, &workspace, &initial, action)
                    .unwrap_err()
                    .status,
                400
            );
        }
        for change in [
            json!({ "base": 32, "dots": 0 }),
            json!({ "base": 8, "dots": 2 }),
        ] {
            let mut action = paste(&initial, 0);
            action["fragment"]["events"][0]["duration"] = change;
            assert_eq!(
                edit(&mut service, &workspace, &initial, action)
                    .unwrap_err()
                    .status,
                400
            );
        }
        let mut action = paste(&initial, 0);
        action["fragment"]["events"] = json!(vec![fragment()["events"][0].clone(); 100]);
        action["offsetUnits"] = json!(16);
        assert_eq!(
            edit(&mut service, &workspace, &initial, action.clone())
                .unwrap_err()
                .status,
            422
        );
        assert_eq!(service.read(&workspace).unwrap(), Some(initial.clone()));
        action["offsetUnits"] = json!(0);
        let full = edit(&mut service, &workspace, &initial, action).unwrap();
        assert_eq!(measure(&full, 0).events.len(), 100);
        assert_eq!(full.undo_depth, 1);
        let mut contaminated = paste(&full, 0);
        contaminated["fragment"]["events"][0]["id"] = json!("copied-id");
        assert!(serde_json::from_value::<ScoreEditAction>(contaminated).is_err());
    }
}
