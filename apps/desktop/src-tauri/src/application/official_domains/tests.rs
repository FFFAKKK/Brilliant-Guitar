use super::super::*;
use super::*;
use crate::dto::{TablatureContent, TablatureProjection};
use serde_json::Value;
#[test]
fn native_callbacks_match_both_authentic_ts_domains() {
    let JsonValue::Array(rows) = decode_js_value_json(include_str!("oracle.json")).unwrap() else {
        panic!("oracle")
    };
    assert!(rows.len() >= 190);
    let mut executor = Executor::new().unwrap();
    for (index, row) in rows.iter().enumerate() {
        let mut bytes = vec![];
        field(row, "request")
            .unwrap()
            .write_lossless(&mut bytes)
            .unwrap();
        let actual = executor.execute(&bytes).unwrap();
        let actual = decode_js_value_json(std::str::from_utf8(&actual).unwrap()).unwrap();
        assert_eq!(Some(&actual), field(row, "response"), "callback {index}");
    }
}
fn fixture() -> (ScoreSessionService, String, ScoreSessionRead) {
    let mut service = ScoreSessionService::default();
    let workspace = Uuid::new_v4().to_string();
    let current = service
        .import_document(workspace.clone(), include_str!("guitar-document.json"))
        .unwrap();
    (service, workspace, current)
}
fn command(
    service: &mut ScoreSessionService,
    workspace: &str,
    suffix: &str,
    payload: Value,
) -> ScoreSessionRead {
    submit_command(&mut service.sessions.get_mut(workspace).unwrap().session,json!({
        "commandVersion":1,"commandId":format!("{}.{}",guitar_domain::NAMESPACE,suffix),"target":{"kind":"part","partId":"part-1"},"payload":payload
    })).unwrap();
    service.read(workspace).unwrap().unwrap()
}
fn assert_pair(read: &ScoreSessionRead, fret: i64) {
    let NotationView::Staff { measures, .. } = &read.notation else {
        panic!("staff")
    };
    let TablatureProjection::Tablature {
        measures: tab,
        string_count,
        ..
    } = &read.tablature
    else {
        panic!("tab")
    };
    assert_eq!(*string_count, 6);
    assert_eq!(measures.len(), tab.len());
    for (a, b) in measures.iter().zip(tab) {
        assert_eq!(a.id, b.id);
        assert_eq!(a.voice_id, b.voice_id);
        assert_eq!(a.events.len(), b.events.len());
        for (left, right) in a.events.iter().zip(&b.events) {
            assert_eq!(left.id, right.id);
            assert_eq!(left.duration, right.duration);
        }
    }
    let TablatureContent::Note { position, .. } = &tab[0].events[0].content else {
        panic!("note")
    };
    assert_eq!(position.fret, fret);
}
#[test]
fn real_fixed_domains_read_atomic_staff_tab_history_tuning_and_checkpoint() {
    let (mut service, workspace, initial) = fixture();
    assert_pair(&initial, 0);
    assert_eq!(initial.undo_depth, 0);
    let changed = command(
        &mut service,
        &workspace,
        "set-position",
        json!({"noteId":"note-a","position":{"stringNumber":6,"fret":12}}),
    );
    assert_pair(&changed, 12);
    assert_eq!(changed.undo_depth, 1);
    assert_eq!(changed.document_version, 1);
    let NotationView::Staff { measures, .. } = &changed.notation else {
        panic!("staff")
    };
    assert!(matches!(
        measures[0].events[0].content,
        InputContent::Note {
            pitch: crate::dto::InputPitch { octave: 4, .. }
        }
    ));
    assert_eq!(
        command(
            &mut service,
            &workspace,
            "set-position",
            json!({"noteId":"note-a","position":{"stringNumber":6,"fret":12}})
        ),
        changed
    );
    let session = &mut service.sessions.get_mut(&workspace).unwrap().session;
    execute_operation(session, json!({"kind":"undo"})).unwrap();
    let undo = service.read(&workspace).unwrap().unwrap();
    assert_pair(&undo, 0);
    assert_eq!(undo.notation, initial.notation);
    execute_operation(
        &mut service.sessions.get_mut(&workspace).unwrap().session,
        json!({"kind":"redo"}),
    )
    .unwrap();
    let redo = service.read(&workspace).unwrap().unwrap();
    assert_pair(&redo, 12);
    assert_eq!(redo.notation, changed.notation);
    service
        .mark_saved(
            &workspace,
            std::path::PathBuf::from("domain-checkpoint.bgp.json"),
            redo.document_version,
        )
        .unwrap();
    assert!(
        !read_state(&service.sessions[&workspace].session)
            .unwrap()
            .dirty
    );
    let mut tuning: Value = serde_json::from_str(include_str!("guitar-profile.json")).unwrap();
    tuning["tuning"][5]["soundingPitch"]["step"] = json!("D");
    let tuned = command(
        &mut service,
        &workspace,
        "set-tuning",
        json!({"tuning":tuning["tuning"]}),
    );
    assert_pair(&tuned, 12);
    assert_eq!(tuned.undo_depth, redo.undo_depth + 1);
    assert!(
        read_state(&service.sessions[&workspace].session)
            .unwrap()
            .dirty
    );
    let NotationView::Staff { measures, .. } = &tuned.notation else {
        panic!("staff")
    };
    assert!(matches!(
        measures[0].events[0].content,
        InputContent::Note {
            pitch: crate::dto::InputPitch {
                step: PitchStep::D,
                octave: 4,
                ..
            }
        }
    ));
}
#[test]
fn bad_known_data_rejects_import_and_mutation_without_losing_accepted_document() {
    let (mut service, workspace, initial) = fixture();
    let before = service.export_document(&workspace).unwrap();
    let source: Value = serde_json::from_str(&before).unwrap();
    for mutation in ["fret", "owner", "pitch", "technique"] {
        let mut value = source.clone();
        match mutation {
            "fret" => value["extensions"][0]["payload"]["placements"][0]["fret"] = json!(1),
            "owner" => value["extensions"][0]["owner"] = json!({"kind":"score"}),
            "pitch" => {
                value["parts"][0]["measureContents"][0]["voices"][0]["sequence"]["events"][0]["content"]
                    ["notes"][0]["writtenPitch"]["step"] = json!("D")
            }
            _ => {
                value["extensions"][0]["payload"]["techniques"] =
                    json!([{"id":"x","kind":"vibrato","noteId":"missing"}])
            }
        }
        assert!(
            service
                .import_document(workspace.clone(), &value.to_string())
                .is_err()
        );
        assert_eq!(service.read(&workspace).unwrap(), Some(initial.clone()));
    }
    for payload in [
        json!({"noteId":"missing","position":{"stringNumber":1,"fret":0}}),
        json!({"noteId":"note-a","position":{"stringNumber":6,"fret":68}}),
    ] {
        assert!(submit_command(&mut service.sessions.get_mut(&workspace).unwrap().session,
            json!({"commandVersion":1,"commandId":format!("{}.set-position",guitar_domain::NAMESPACE),"target":{"kind":"part","partId":"part-1"},"payload":payload})).is_err());
        assert_eq!(service.export_document(&workspace).unwrap(), before);
    }
    // A raw pitch mutation cannot leave an existing placement inconsistent.
    let error=submit_command(&mut service.sessions.get_mut(&workspace).unwrap().session,
        json!({"commandVersion":1,"commandId":"core.note.set-written-pitch","target":{"kind":"note","noteId":"note-a"},
            "payload":{"writtenPitch":{"step":"F","alter":0,"octave":3}}})).unwrap_err();
    assert!(
        error
            .issue
            .unwrap()
            .code
            .contains("contribution-semantic-invalid")
    );
    assert_eq!(service.export_document(&workspace).unwrap(), before);
}
#[test]
fn missing_positions_and_real_techniques_are_never_guessed_or_dropped() {
    let (mut service, workspace, _) = fixture();
    let missing = command(
        &mut service,
        &workspace,
        "set-position",
        json!({"noteId":"note-a","position":null}),
    );
    assert!(matches!(missing.notation, NotationView::Staff { .. }));
    assert!(matches!(
        missing.tablature,
        TablatureProjection::Unsupported { .. }
    ));
    let restored = command(
        &mut service,
        &workspace,
        "set-position",
        json!({"noteId":"note-a","position":{"stringNumber":6,"fret":0}}),
    );
    assert_pair(&restored, 0);
    let technique = command(
        &mut service,
        &workspace,
        "set-technique",
        json!({"technique":{"id":"vibrato-a","kind":"vibrato","noteId":"note-a"}}),
    );
    assert!(matches!(
        technique.notation,
        NotationView::Unsupported { .. }
    ));
    assert!(matches!(
        technique.tablature,
        TablatureProjection::Unsupported { .. }
    ));
    assert!(matches!(
        technique.playback_source,
        PlaybackSourceProjection::Unsupported { .. }
    ));
    let restored = command(
        &mut service,
        &workspace,
        "remove-technique",
        json!({"techniqueId":"vibrato-a"}),
    );
    assert_pair(&restored, 0);
}
#[test]
fn future_and_opaque_blocks_stay_lossless_and_incompatible_domain_is_readonly() {
    let (mut service, workspace, _) = fixture();
    let before = service.export_document(&workspace).unwrap();
    let mut future: Value = serde_json::from_str(&before).unwrap();
    future["extensions"][0]["schemaVersion"] = json!(3);
    future["extensions"][0]["payload"] = json!({"future":[1,2,3]});
    let current = service
        .import_document(workspace.clone(), &future.to_string())
        .unwrap();
    assert!(matches!(current.notation, NotationView::Unsupported { .. }));
    assert!(matches!(
        current.tablature,
        TablatureProjection::Unsupported { .. }
    ));
    let preserved = service.export_document(&workspace).unwrap();
    assert!(submit_command(&mut service.sessions.get_mut(&workspace).unwrap().session,
        json!({"commandVersion":1,"commandId":"core.measure.set-definition","target":{"kind":"measure","measureId":"measure-1"},
        "payload":{"meter":{"numerator":3,"denominator":4}}})).is_err());
    assert_eq!(service.export_document(&workspace).unwrap(), preserved);
    let opaque=before.replace("\"extensions\":[",r#""extensions":[{"namespace":"opaque.example","schemaVersion":1,"owner":{"kind":"score"},"payload":{"text":"\ud800","order":{"z":1,"a":2}}},"#);
    assert_ne!(opaque, before);
    let current = service.import_document(workspace.clone(), &opaque).unwrap();
    assert!(matches!(current.notation, NotationView::Unsupported { .. }));
    assert!(matches!(
        current.tablature,
        TablatureProjection::Unsupported { .. }
    ));
    let encoded = service.export_document(&workspace).unwrap();
    assert!(encoded.contains("\\ud800"));
    assert!(encoded.contains(r#""z":1,"a":2"#));
}
#[test]
fn staff_and_tab_share_key_warning_metadata_and_event_order_from_one_snapshot() {
    let (mut service, workspace, current) = fixture();
    let keyed=service.edit(ScoreEditRequest{workspace_id:workspace.clone(),request_id:Uuid::new_v4().to_string(),
        document_id:current.document_id.clone(),expected_version:current.document_version,
        action:serde_json::from_value(json!({"kind":"set-key-signature","partId":"part-1","measureId":"measure-1","change":{"kind":"set","fifths":2}})).unwrap()}).unwrap();
    assert_pair(&keyed, 0);
    assert_eq!(
        serde_json::to_value(&keyed).unwrap()["tablature"]["tempoBpm"],
        json!(keyed.metadata.tempo_bpm)
    );
    let mut raw: Value =
        serde_json::from_str(&service.export_document(&workspace).unwrap()).unwrap();
    raw["parts"][0]["measureContents"][0]["voices"][0]["sequence"]["events"][0]["duration"]["base"] =
        json!(1);
    let over = service
        .import_document(workspace.clone(), &raw.to_string())
        .unwrap();
    assert_pair(&over, 0);
    let NotationView::Staff { measures, .. } = &over.notation else {
        panic!("staff")
    };
    let TablatureProjection::Tablature { measures: tab, .. } = &over.tablature else {
        panic!("tab")
    };
    assert_eq!(measures[0].rule_warnings, tab[0].rule_warnings);
    assert_eq!(tab[0].rule_warnings.len(), 1);
}
