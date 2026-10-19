use super::super::*;
use super::*;

#[test]
fn native_callbacks_match_the_authentic_ts_module_including_utf16() {
    let rows = decode_js_value_json(include_str!("oracle.json")).unwrap();
    let JsonValue::Array(rows) = rows else {
        panic!("oracle array")
    };
    assert_eq!(rows.len(), 67);
    let mut executor = Executor::new().unwrap();
    for (index, row) in rows.iter().enumerate() {
        let mut bytes = Vec::new();
        field(row, "request")
            .unwrap()
            .write_lossless(&mut bytes)
            .unwrap();
        let actual = executor.execute(&bytes).unwrap();
        let actual = decode_js_value_json(std::str::from_utf8(&actual).unwrap()).unwrap();
        assert_eq!(
            Some(&actual),
            field(row, "response"),
            "oracle callback {index}"
        );
    }
}
fn fixture(count: u16) -> (ScoreSessionService, String, ScoreSessionRead) {
    let mut service = ScoreSessionService::default();
    let workspace = Uuid::new_v4().to_string();
    let current = service
        .create(CreateScoreRequest {
            workspace_id: workspace.clone(),
            request_id: Uuid::new_v4().to_string(),
            expected_document_id: None,
            input: NewScoreInput {
                title: "调号领域验收".into(),
                measure_count: count,
            },
        })
        .unwrap();
    (service, workspace, current)
}
fn apply(
    service: &mut ScoreSessionService,
    workspace: &str,
    current: &ScoreSessionRead,
    action: serde_json::Value,
) -> ScoreSessionRead {
    service
        .edit(ScoreEditRequest {
            workspace_id: workspace.into(),
            document_id: current.document_id.clone(),
            request_id: Uuid::new_v4().to_string(),
            expected_version: current.document_version,
            action: serde_json::from_value(action).unwrap(),
        })
        .unwrap()
}
fn set(
    service: &mut ScoreSessionService,
    workspace: &str,
    current: &ScoreSessionRead,
    measure: usize,
    value: serde_json::Value,
) -> ScoreSessionRead {
    apply(
        service,
        workspace,
        current,
        json!({"kind":"set-key-signature","partId":"part-1",
        "measureId":format!("measure-{}",measure+1),"change":value}),
    )
}
fn changes(read: &ScoreSessionRead) -> &Vec<crate::dto::KeySignatureChangeView> {
    let NotationView::Staff {
        key_signature_changes,
        ..
    } = &read.notation
    else {
        panic!("staff projection")
    };
    key_signature_changes
}
#[test]
fn key_changes_noop_inherit_naturals_and_core_history_share_one_session() {
    let (mut service, workspace, initial) = fixture(3);
    let positive = set(
        &mut service,
        &workspace,
        &initial,
        0,
        json!({"kind":"set","fifths":2}),
    );
    assert_eq!(positive.document_version, 1);
    assert_eq!(positive.undo_depth, 1);
    service
        .mark_saved(
            &workspace,
            std::path::PathBuf::from("test-checkpoint.bgp.json"),
            positive.document_version,
        )
        .unwrap();
    assert!(
        !read_state(&service.sessions[&workspace].session)
            .unwrap()
            .dirty
    );
    let duplicate = set(
        &mut service,
        &workspace,
        &positive,
        1,
        json!({"kind":"set","fifths":2}),
    );
    assert_eq!(duplicate, positive);
    assert!(
        !read_state(&service.sessions[&workspace].session)
            .unwrap()
            .dirty
    );
    let negative = set(
        &mut service,
        &workspace,
        &positive,
        1,
        json!({"kind":"set","fifths":-3}),
    );
    let natural = set(
        &mut service,
        &workspace,
        &negative,
        2,
        json!({"kind":"set","fifths":0}),
    );
    assert_eq!(
        changes(&natural)
            .iter()
            .map(|c| (c.measure_index, c.fifths))
            .collect::<Vec<_>>(),
        vec![(0, 2), (1, -3), (2, 0)]
    );
    let inherited = set(
        &mut service,
        &workspace,
        &natural,
        1,
        json!({"kind":"inherit"}),
    );
    assert_eq!(
        changes(&inherited)
            .iter()
            .map(|c| c.fifths)
            .collect::<Vec<_>>(),
        vec![2, 0]
    );
    let undo = apply(&mut service, &workspace, &inherited, json!({"kind":"undo"}));
    assert_eq!(undo.notation, natural.notation);
    let redone = apply(&mut service, &workspace, &undo, json!({"kind":"redo"}));
    assert_eq!(redone.notation, inherited.notation);
    let removed = set(
        &mut service,
        &workspace,
        &redone,
        0,
        json!({"kind":"inherit"}),
    );
    assert!(changes(&removed).is_empty());
    let document = decode_lossless_json(&service.export_document(&workspace).unwrap()).unwrap();
    assert_eq!(
        field(&document, "extensions"),
        Some(&JsonValue::Array(vec![]))
    );
}
#[test]
fn key_setting_keeps_existing_pitch_and_playback_and_public_reads_current() {
    let (mut service, workspace, initial) = fixture(2);
    let note = apply(
        &mut service,
        &workspace,
        &initial,
        json!({"kind":"append","measureId":"measure-1",
        "anchor":{"kind":"start"},"duration":{"base":4,"dots":0},"content":{"kind":"note","pitch":{"step":"F","octave":4,"alter":0}}}),
    );
    let changed = set(
        &mut service,
        &workspace,
        &note,
        0,
        json!({"kind":"set","fifths":1}),
    );
    let (NotationView::Staff { measures: a, .. }, NotationView::Staff { measures: b, .. }) =
        (&note.notation, &changed.notation)
    else {
        panic!("staff")
    };
    assert_eq!(a, b);
    let (
        PlaybackSourceProjection::Ready { measures: a, .. },
        PlaybackSourceProjection::Ready { measures: b, .. },
    ) = (&note.playback_source, &changed.playback_source)
    else {
        panic!("playback")
    };
    assert_eq!(a, b);
    let summary = service.read_summary(&workspace).unwrap().unwrap();
    assert_eq!(summary.document_version, changed.document_version);
    let metadata = service.read_metadata(&workspace).unwrap().unwrap();
    assert_eq!(metadata.document_version, changed.document_version);
    let index = service
        .read_measure_index(&workspace, &changed.document_id, changed.document_version)
        .unwrap()
        .unwrap();
    assert_eq!(index.measure_ids, vec!["measure-1", "measure-2"]);
    assert_eq!(
        service
            .read_measure_index(&workspace, &note.document_id, note.document_version)
            .unwrap_err()
            .status,
        409
    );
}
#[test]
fn delete_cleans_key_change_and_one_undo_restores_extension_and_content() {
    let (mut service, workspace, initial) = fixture(3);
    let key = set(
        &mut service,
        &workspace,
        &initial,
        1,
        json!({"kind":"set","fifths":-2}),
    );
    let before = service.export_document(&workspace).unwrap();
    let deleted = apply(
        &mut service,
        &workspace,
        &key,
        json!({"kind":"remove-measure","measureId":"measure-2"}),
    );
    assert_eq!(deleted.undo_depth, key.undo_depth + 1);
    assert!(changes(&deleted).is_empty());
    let undo = apply(&mut service, &workspace, &deleted, json!({"kind":"undo"}));
    assert_eq!(undo.notation, key.notation);
    assert_eq!(service.export_document(&workspace).unwrap(), before);
    let redo = apply(&mut service, &workspace, &undo, json!({"kind":"redo"}));
    assert_eq!(redo.notation, deleted.notation);
}
#[test]
fn known_invalid_blocks_reject_atomically_and_future_blocks_stay_lossless_readonly() {
    let (mut service, workspace, current) = fixture(2);
    let original = service.export_document(&workspace).unwrap();
    let mut document: serde_json::Value = serde_json::from_str(&original).unwrap();
    for payload in [
        json!({"changes":[{"measureId":"missing","fifths":1}]}),
        json!({"changes":[{"measureId":"measure-1","fifths":0}]}),
        json!({"changes":[],"extra":true}),
    ] {
        document["extensions"] = json!([{"namespace":NAMESPACE,"schemaVersion":1,"owner":{"kind":"part","partId":"part-1"},"payload":payload}]);
        assert!(
            service
                .import_document(workspace.clone(), &document.to_string())
                .is_err()
        );
        assert_eq!(service.read(&workspace).unwrap(), Some(current.clone()));
    }
    document["extensions"][0]["schemaVersion"] = json!(2);
    document["extensions"][0]["payload"] = json!({"future":[1,2,3]});
    let future = service
        .import_document(workspace.clone(), &document.to_string())
        .unwrap();
    assert!(matches!(future.notation, NotationView::Unsupported { .. }));
    let before = service.export_document(&workspace).unwrap();
    let request = ScoreEditRequest{workspace_id:workspace.clone(),request_id:Uuid::new_v4().to_string(),
        document_id:future.document_id.clone(),expected_version:future.document_version,
        action:serde_json::from_value(json!({"kind":"set-measure-meter","measureId":"measure-1","meter":{"numerator":3,"denominator":4},"scope":"measure"})).unwrap()};
    assert!(
        service
            .edit(request)
            .unwrap_err()
            .issue
            .unwrap()
            .code
            .contains("required-contribution-incompatible")
    );
    assert_eq!(service.export_document(&workspace).unwrap(), before);
}
#[test]
fn unknown_surrogate_payload_is_preserved_and_meter_history_remains_available() {
    let (mut service, workspace, _) = fixture(2);
    let original = service.export_document(&workspace).unwrap();
    let document = original.replace("\"extensions\":[]",r#""extensions":[{"namespace":"opaque.example","schemaVersion":1,"owner":{"kind":"score"},"payload":{"opaque":"\ud800"}}]"#);
    assert_ne!(document, original);
    let current = service
        .import_document(workspace.clone(), &document)
        .unwrap();
    assert!(matches!(current.notation, NotationView::Unsupported { .. }));
    let before = service.export_document(&workspace).unwrap();
    let changed = apply(
        &mut service,
        &workspace,
        &current,
        json!({"kind":"set-measure-meter","measureId":"measure-1","meter":{"numerator":3,"denominator":4},"scope":"measure"}),
    );
    assert!(
        service
            .export_document(&workspace)
            .unwrap()
            .contains("\\ud800")
    );
    apply(
        &mut service,
        &workspace,
        &changed,
        json!({"kind":"set-measure-meter","measureId":"measure-1","meter":{"numerator":4,"denominator":4},"scope":"measure"}),
    );
    assert_eq!(service.export_document(&workspace).unwrap(), before);
}
#[test]
fn dto_budget_stale_target_version_and_replay_are_guarded() {
    let (mut service, workspace, current) = fixture(2);
    for change in [
        json!({"kind":"set","fifths":128}),
        json!({"kind":"inherit","fifths":0}),
        json!({"kind":"set","fifths":1,"extra":0}),
    ] {
        assert!(serde_json::from_value::<ScoreEditAction>(json!({"kind":"set-key-signature","partId":"part-1","measureId":"measure-1","change":change})).is_err());
    }
    let mut request = ScoreEditRequest{workspace_id:workspace.clone(),request_id:Uuid::new_v4().to_string(),document_id:current.document_id.clone(),
        expected_version:current.document_version,action:serde_json::from_value(json!({"kind":"set-key-signature","partId":"part-1","measureId":"measure-1","change":{"kind":"set","fifths":8}})).unwrap()};
    assert_eq!(service.edit(request.clone()).unwrap_err().status, 400);
    request.action = serde_json::from_value(json!({"kind":"set-key-signature","partId":"part-1","measureId":"measure-1","change":{"kind":"set","fifths":1}})).unwrap();
    let changed = service.edit(request.clone()).unwrap();
    assert_eq!(service.edit(request.clone()).unwrap(), changed);
    request.request_id = Uuid::new_v4().to_string();
    assert_eq!(service.edit(request.clone()).unwrap_err().status, 409);
    request.expected_version = changed.document_version;
    request.action = serde_json::from_value(json!({"kind":"set-key-signature","partId":"missing","measureId":"measure-1","change":{"kind":"set","fifths":1}})).unwrap();
    assert!(service.edit(request).is_err());
    assert_eq!(service.read(&workspace).unwrap(), Some(changed));
}
