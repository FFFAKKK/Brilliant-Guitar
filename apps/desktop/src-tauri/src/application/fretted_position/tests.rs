use super::*;
use crate::dto::{InputPitch, TablatureContent, TablatureProjection};

fn fixture() -> (ScoreSessionService, String, ScoreSessionRead) {
    let mut service = ScoreSessionService::default();
    let workspace = Uuid::new_v4().to_string();
    let current = service.import_document(workspace.clone(),
        include_str!("../official_domains/guitar-document.json")).unwrap();
    (service, workspace, current)
}
fn action(string: i64, fret: i64) -> Value {
    json!({"kind":"set-fretted-position","partId":"part-1","eventId":"event-a",
        "position":{"stringNumber":string,"fret":fret}})
}
fn request(workspace: &str, read: &ScoreSessionRead, action: Value) -> ScoreEditRequest {
    ScoreEditRequest { workspace_id: workspace.into(), request_id: Uuid::new_v4().to_string(),
        document_id: read.document_id.clone(), expected_version: read.document_version,
        action: serde_json::from_value(action).unwrap() }
}
fn position(read: &ScoreSessionRead) -> &FrettedPosition {
    let TablatureProjection::Tablature { measures, .. } = &read.tablature else { panic!("tab") };
    let TablatureContent::Note { note_id, position } = &measures[0].events[0].content else { panic!("note") };
    assert_eq!(note_id, "note-a");
    position
}

#[test]
fn public_edit_keeps_one_note_pitch_position_history_replay_and_codec() {
    let (mut service, workspace, original) = fixture();
    let before: Value = serde_json::from_str(&service.export_document(&workspace).unwrap()).unwrap();
    let req = request(&workspace, &original, action(6, 12));
    let changed = service.edit(req.clone()).unwrap();
    assert_eq!(changed.document_version, 1);
    assert_eq!(changed.undo_depth, 1);
    assert_eq!(position(&changed), &FrettedPosition { string_number: 6, fret: 12 });
    let NotationView::Staff { measures, .. } = &changed.notation else { panic!("staff") };
    assert!(matches!(measures[0].events[0].content, InputContent::Note {
        pitch: InputPitch { step: PitchStep::E, octave: 4, alter: 0 } }));
    assert_eq!(service.edit(req).unwrap(), changed, "same request is not reapplied");
    assert_eq!(service.edit(request(&workspace, &changed, action(6, 12))).unwrap(), changed);
    let undone = service.edit(request(&workspace, &changed, json!({"kind":"undo"}))).unwrap();
    assert_eq!(undone.notation, original.notation);
    assert_eq!(undone.tablature, original.tablature);
    let redone = service.edit(request(&workspace, &undone, json!({"kind":"redo"}))).unwrap();
    assert_eq!(redone.notation, changed.notation);
    assert_eq!(redone.tablature, changed.tablature);
    let mut after: Value = serde_json::from_str(&service.export_document(&workspace).unwrap()).unwrap();
    after["parts"][0]["measureContents"][0]["voices"][0]["sequence"]["events"][0]["content"]["notes"][0]["writtenPitch"]["octave"] = json!(3);
    after["extensions"][0]["payload"]["placements"][0]["fret"] = json!(0);
    assert_eq!(after, before, "only pitch and position of the same note change");
    let imported = service.import_document(Uuid::new_v4().to_string(), &service.export_document(&workspace).unwrap()).unwrap();
    assert_eq!(imported.notation, redone.notation);
    assert_eq!(imported.tablature, redone.tablature);
    assert_eq!(imported.undo_depth, 0);
    let high = service.edit(request(&workspace, &redone, action(1, 24))).unwrap();
    assert!(matches!(high.notation, NotationView::Unsupported { .. }));
    assert_eq!(position(&high).fret, 24);
    let undo = service.edit(request(&workspace, &high, json!({"kind":"undo"}))).unwrap();
    assert_eq!(undo.tablature, redone.tablature);
    let redo = service.edit(request(&workspace, &undo, json!({"kind":"redo"}))).unwrap();
    assert_eq!(redo.tablature, high.tablature);
    let low = service.edit(request(&workspace, &redo, action(6, 0))).unwrap();
    assert_eq!(low.notation, original.notation, "Tab editing does not depend on staff pitch range");
}

#[test]
fn strict_wire_and_actual_instrument_dimensions_reject_without_mutation() {
    let (mut service, workspace, original) = fixture();
    for change in [
        json!({"kind":"set-fretted-position","partId":"part-1","eventId":"event-a","position":null}),
        json!({"kind":"set-fretted-position","partId":"part-1","eventId":"event-a","position":{"stringNumber":1.5,"fret":0}}),
        json!({"kind":"set-fretted-position","partId":"part-1","eventId":"event-a","position":{"stringNumber":6,"fret":1.5}}),
        json!({"kind":"set-fretted-position","partId":"part-1","eventId":"event-a","position":{"stringNumber":6,"fret":0,"pitch":{}}}),
        json!({"kind":"set-fretted-position","partId":"part-1","eventId":"event-a","position":{"stringNumber":6,"fret":0},"noteId":"note-b"}),
    ] { assert!(serde_json::from_value::<ScoreEditAction>(change).is_err()); }
    let before = service.export_document(&workspace).unwrap();
    for (string, fret, status) in [(0, 0, 400), (33, 0, 400), (6, -1, 400), (6, 9_007_199_254_740_992, 400),
        (7, 0, 422), (6, 68, 422)] {
        assert_eq!(service.edit(request(&workspace, &original, action(string, fret))).unwrap_err().status, status);
        assert_eq!(service.read(&workspace).unwrap().unwrap(), original);
        assert_eq!(service.export_document(&workspace).unwrap(), before);
    }
    for (field, value, status) in [("partId", "", 400), ("eventId", "", 400),
        ("partId", "missing", 409), ("eventId", "missing", 409), ("eventId", "event-rest", 422)] {
        let mut change = action(6, 1); change[field] = json!(value);
        assert_eq!(service.edit(request(&workspace, &original, change)).unwrap_err().status, status);
        assert_eq!(service.export_document(&workspace).unwrap(), before);
    }
    let mut capo: Value = serde_json::from_str(&before).unwrap();
    capo["extensions"][0]["payload"]["capoFret"] = json!(2);
    for (i, octave) in [(0, 3), (1, 4)] {
        capo["parts"][0]["measureContents"][0]["voices"][0]["sequence"]["events"][i]["content"]["notes"][0]["writtenPitch"] =
            json!({"step":"F","alter":1,"octave":octave});
    }
    let current = service.import_document(workspace.clone(), &capo.to_string()).unwrap();
    assert_eq!(service.edit(request(&workspace, &current, action(6, 66))).unwrap_err().status, 422);
    let accepted = service.edit(request(&workspace, &current, action(6, 65))).unwrap();
    assert_eq!(position(&accepted).fret, 65);
}

#[test]
fn identity_version_and_changed_request_replay_cannot_target_new_state() {
    let (mut service, workspace, original) = fixture();
    let mut foreign = request(&workspace, &original, action(6, 12));
    foreign.document_id = "other".into();
    assert_eq!(service.edit(foreign).unwrap_err().status, 409);
    assert_eq!(service.read(&workspace).unwrap().unwrap(), original);
    let req = request(&workspace, &original, action(6, 12));
    let changed = service.edit(req.clone()).unwrap();
    let before = service.export_document(&workspace).unwrap();
    let mut replay = req;
    replay.action = serde_json::from_value(action(6, 13)).unwrap();
    assert_eq!(service.edit(replay).unwrap_err().status, 409);
    assert_eq!(service.edit(request(&workspace, &original, action(6, 14))).unwrap_err().status, 409);
    assert_eq!(service.read(&workspace).unwrap().unwrap(), changed);
    assert_eq!(service.export_document(&workspace).unwrap(), before);
}

#[test]
fn unavailable_future_technique_opaque_and_chord_inputs_preserve_domain_facts() {
    let (mut service, workspace, original) = fixture();
    let source: Value = serde_json::from_str(&service.export_document(&workspace).unwrap()).unwrap();
    for kind in ["missing", "future", "technique", "opaque", "chord"] {
        let mut raw = source.clone();
        match kind {
            "missing" => raw["extensions"] = json!([]),
            "future" => { raw["extensions"][0]["schemaVersion"] = json!(3);
                raw["extensions"][0]["payload"] = json!({"future":[1,2,3]}); }
            "technique" => raw["extensions"][0]["payload"]["techniques"] =
                json!([{"id":"vibrato-a","kind":"vibrato","noteId":"note-a"}]),
            "opaque" => raw["extensions"].as_array_mut().unwrap().push(
                json!({"namespace":"opaque.example","schemaVersion":1,"owner":{"kind":"score"},"payload":{"keep":[2,1]}})),
            "chord" => raw["parts"][0]["measureContents"][0]["voices"][0]["sequence"]["events"][0]["content"]["notes"]
                .as_array_mut().unwrap().push(json!({"id":"note-extra","writtenPitch":{"step":"G","alter":0,"octave":3}})),
            _ => unreachable!(),
        }
        let current = service.import_document(workspace.clone(), &raw.to_string()).unwrap();
        let before = service.export_document(&workspace).unwrap();
        assert_eq!(service.edit(request(&workspace, &current, action(6, 12))).unwrap_err().status, 422, "{kind}");
        assert_eq!(service.read(&workspace).unwrap().unwrap(), current);
        assert_eq!(service.export_document(&workspace).unwrap(), before);
        assert_eq!(current.undo_depth, 0);
    }
    assert_eq!(position(&original).fret, 0);
}

#[test]
fn legacy_real_edit_upgrades_atomically_and_the_core_pitch_boundary_never_clamps() {
    let (mut service, workspace, _) = fixture();
    let mut legacy: Value = serde_json::from_str(&service.export_document(&workspace).unwrap()).unwrap();
    legacy["extensions"][0]["schemaVersion"] = json!(1);
    legacy["extensions"][0]["payload"]["fretCount"] = json!(24);
    let original = service.import_document(workspace.clone(), &legacy.to_string()).unwrap();
    let before: Value = serde_json::from_str(&service.export_document(&workspace).unwrap()).unwrap();
    assert_eq!(service.edit(request(&workspace, &original, action(6, 0))).unwrap(), original);
    assert_eq!(serde_json::from_str::<Value>(&service.export_document(&workspace).unwrap()).unwrap(), before);
    let changed = service.edit(request(&workspace, &original, action(6, 67))).unwrap();
    assert_eq!(position(&changed).fret, 67);
    assert_eq!(changed.undo_depth, 1);
    let after: Value = serde_json::from_str(&service.export_document(&workspace).unwrap()).unwrap();
    assert_eq!(after["extensions"][0]["schemaVersion"], json!(2));
    assert_eq!(after["extensions"][0]["payload"]["fretCount"], json!(24));
    assert_eq!(after["parts"][0]["measureContents"][0]["voices"][0]["sequence"]["events"][0]["content"]["notes"][0]["writtenPitch"],
        json!({"step":"B","alter":0,"octave":8}));
    for (string, fret) in [(1, 44), (6, 68), (6, 100), (6, 1000), (6, 9_007_199_254_740_991)] {
        let error = service.edit(request(&workspace, &changed, action(string, fret))).unwrap_err();
        assert_eq!(error.status, 422);
        assert_eq!(service.read(&workspace).unwrap(), Some(changed.clone()));
        assert_eq!(serde_json::from_str::<Value>(&service.export_document(&workspace).unwrap()).unwrap(), after);
    }
    let undo = service.edit(request(&workspace, &changed, json!({"kind":"undo"}))).unwrap();
    assert_eq!(serde_json::from_str::<Value>(&service.export_document(&workspace).unwrap()).unwrap(), before);
    let redo = service.edit(request(&workspace, &undo, json!({"kind":"redo"}))).unwrap();
    assert_eq!(serde_json::from_str::<Value>(&service.export_document(&workspace).unwrap()).unwrap(), after);
    let highest_first_string = service.edit(request(&workspace, &redo, action(1, 43))).unwrap();
    assert_eq!(position(&highest_first_string).fret, 43);
}
