use super::*;
use crate::dto::DocumentMetadataInput;

pub(super) fn validate(value: &DocumentMetadataInput) -> Result<(), HostError> {
    if text_length(value.title.trim()) > 120 || value.authors.len() > 16
        || value.authors.iter().any(|author| author.trim().is_empty() || text_length(author.trim()) > 120)
        || !value.tempo_bpm.is_finite() || value.tempo_bpm <= 0.0
    {
        return Err(HostError::new("作品信息无效", 400));
    }
    Ok(())
}

// One public Core command; the original gateway owns history, rules and replay.
pub(super) fn set(session: &mut NotationSession, current: &ScoreSessionRead,
    value: &DocumentMetadataInput) -> Result<(), HostError> {
    submit_command(session, json!({
        "commandVersion": 1, "commandId": "core.document.set-metadata",
        "target": { "kind": "document", "documentId": current.document_id },
        "payload": { "metadata": {
            "title": if value.title.trim().is_empty() { "未命名乐谱" } else { value.title.trim() },
            "authors": value.authors.iter().map(|author| author.trim()).collect::<Vec<_>>(),
            "tempo": { "bpm": value.tempo_bpm },
        } }
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture() -> (ScoreSessionService, String, ScoreSessionRead) {
        let mut service = ScoreSessionService::default();
        let workspace = Uuid::new_v4().to_string();
        let initial = service.create(CreateScoreRequest { workspace_id: workspace.clone(),
            request_id: Uuid::new_v4().to_string(), expected_document_id: None,
            input: NewScoreInput { title: "原作品".into(), measure_count: 2 } }).unwrap();
        (service, workspace, initial)
    }
    fn request(workspace: &str, current: &ScoreSessionRead, action: Value) -> ScoreEditRequest {
        ScoreEditRequest { workspace_id: workspace.into(), request_id: Uuid::new_v4().to_string(),
            document_id: current.document_id.clone(), expected_version: current.document_version,
            action: serde_json::from_value(action).unwrap() }
    }
    fn action() -> Value {
        json!({"kind":"set-document-metadata","metadata":{"title":" 练习曲 ",
            "authors":[" 作者甲 ","Doe, Jane"],"tempoBpm":132.5}})
    }
    #[test]
    fn full_metadata_uses_one_history_step_no_op_replay_and_atomic_projection() {
        let (mut service, workspace, initial) = fixture();
        let populated = service.edit(request(&workspace, &initial, json!({"kind":"append","measureId":"measure-1",
            "anchor":{"kind":"start"},"duration":{"base":4,"dots":0},"content":{"kind":"note",
            "pitch":{"step":"F","octave":4,"alter":1}}}))).unwrap();
        let keyed = service.edit(request(&workspace, &populated, json!({"kind":"set-key-signature","partId":"part-1",
            "measureId":"measure-1","change":{"kind":"set","fifths":2}}))).unwrap();
        let before: Value = serde_json::from_str(&service.export_document(&workspace).unwrap()).unwrap();
        let req = request(&workspace, &keyed, action());
        let next = service.edit(req.clone()).unwrap();
        assert_eq!(service.edit(req).unwrap(), next);
        assert_eq!(next.title, "练习曲"); assert_eq!(next.metadata.title, next.title);
        assert_eq!(next.metadata.authors, ["作者甲", "Doe, Jane"]); assert_eq!(next.metadata.tempo_bpm, 132.5);
        assert_eq!(next.undo_depth, keyed.undo_depth + 1);
        let wire = serde_json::to_value(&next).unwrap();
        assert_eq!(wire["notation"]["tempoBpm"], 132.5); assert_eq!(wire["playbackSource"]["bpm"], 132.5);
        let mut after: Value = serde_json::from_str(&service.export_document(&workspace).unwrap()).unwrap();
        after["metadata"] = before["metadata"].clone();
        assert_eq!(after, before, "all non-metadata document fields, including key extensions, survive");
        assert_eq!(service.edit(request(&workspace, &next, action())).unwrap(), next, "normalized no-op creates no history");
        let undone = service.edit(request(&workspace, &next, json!({"kind":"undo"}))).unwrap();
        assert_eq!(undone.metadata, keyed.metadata); assert_eq!(undone.notation, keyed.notation);
        let redone = service.edit(request(&workspace, &undone, json!({"kind":"redo"}))).unwrap();
        assert_eq!(redone.metadata, next.metadata); assert_eq!(redone.notation, next.notation);
        let encoded = service.export_document(&workspace).unwrap();
        let reopened = service.import_document(Uuid::new_v4().to_string(), &encoded).unwrap();
        assert_eq!(reopened.metadata, next.metadata); assert_eq!(reopened.notation, next.notation); assert_eq!(reopened.undo_depth, 0);
    }
    #[test]
    fn strict_dto_utf16_limits_and_stale_requests_do_not_mutate_the_document() {
        let (mut service, workspace, initial) = fixture();
        for value in [
            json!({"kind":"set-document-metadata","metadata":{"title":"x","authors":[],"tempoBpm":1,"extra":true}}),
            json!({"kind":"set-document-metadata","metadata":{"title":"x","authors":[],"tempoBpm":1},"extra":true}),
            json!({"kind":"set-document-metadata","metadata":{"title":"x","tempoBpm":1}}),
        ] { assert!(serde_json::from_value::<ScoreEditAction>(value).is_err()); }
        for value in [
            json!({"title":"😀".repeat(61),"authors":[],"tempoBpm":1}),
            json!({"title":"x","authors":[" "],"tempoBpm":1}),
            json!({"title":"x","authors":["😀".repeat(61)],"tempoBpm":1}),
            json!({"title":"x","authors":vec!["甲";17],"tempoBpm":1}),
            json!({"title":"x","authors":[],"tempoBpm":0}),
        ] {
            assert_eq!(service.edit(request(&workspace, &initial,
                json!({"kind":"set-document-metadata","metadata":value}))).unwrap_err().status, 400);
        }
        for foreign in [false, true] {
            let mut req = request(&workspace, &initial, action());
            if foreign { req.document_id = "other".into(); } else { req.expected_version = 99; }
            assert_eq!(service.edit(req).unwrap_err().status, 409);
        }
        assert_eq!(service.read(&workspace).unwrap().unwrap(), initial);
        let accepted = service.edit(request(&workspace, &initial,
            json!({"kind":"set-document-metadata","metadata":{"title":" ","authors":[],"tempoBpm":1}}))).unwrap();
        assert_eq!(accepted.title, "未命名乐谱"); assert!(accepted.metadata.authors.is_empty());
    }
    #[test]
    fn old_metadata_actions_preserve_full_authors_and_unsupported_files_remain_protected() {
        let (mut service, workspace, initial) = fixture();
        let mut current = service.edit(request(&workspace, &initial, action())).unwrap();
        for action in [json!({"kind":"set-title","title":"标题二"}),
            json!({"kind":"set-tempo","tempoBpm":144}),
            json!({"kind":"set-metadata","title":"标题三","tempoBpm":120})] {
            current = service.edit(request(&workspace, &current, action)).unwrap();
            assert_eq!(current.metadata.authors, ["作者甲", "Doe, Jane"]);
        }
        let mut raw: Value = serde_json::from_str(&service.export_document(&workspace).unwrap()).unwrap();
        raw["parts"][0]["staves"][0]["defaultClef"] = json!({"sign":"G","line":1});
        let unsupported = service.import_document(workspace.clone(), &raw.to_string()).unwrap();
        let preserved = service.export_document(&workspace).unwrap();
        assert_eq!(unsupported.metadata.authors, current.metadata.authors);
        assert_eq!(service.edit(request(&workspace, &unsupported, action())).unwrap_err().status, 422);
        assert_eq!(service.export_document(&workspace).unwrap(), preserved);
    }
}
