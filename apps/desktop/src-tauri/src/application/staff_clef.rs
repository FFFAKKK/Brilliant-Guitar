use super::*;
use crate::dto::StaffClef;
use brilliant_score_foundation::{ClefSignV1, ClefV1};

// Match the established TS coreClef/projectClef mapping; no new score representation.
pub(super) fn project(clef: &ClefV1) -> Option<&'static str> {
    match (clef.sign, clef.line.get()) {
        (ClefSignV1::G, 2) => Some("treble"),
        (ClefSignV1::F, 4) => Some("bass"),
        (ClefSignV1::C, 3) => Some("alto"),
        (ClefSignV1::C, 4) => Some("tenor"),
        _ => None,
    }
}

pub(super) fn set(
    session: &mut NotationSession,
    staff_id: &str,
    clef: StaffClef,
) -> Result<(), HostError> {
    let document = read_state(session)?.snapshot.document;
    let staff = document
        .parts
        .iter()
        .flat_map(|part| &part.staves)
        .find(|staff| id_text(&staff.id).ok().as_deref() == Some(staff_id))
        .ok_or_else(|| {
            HostError::issue(
                "editor.staff-stale",
                "目标谱表已改变，请重新选择",
                409,
                WorkbenchIssueSource::Editor,
                WorkbenchIssueTarget::Component {
                    component_id: "score-properties".into(),
                },
                None,
            )
        })?;
    let (sign, line) = match clef {
        StaffClef::Treble => ("G", 2),
        StaffClef::Bass => ("F", 4),
        StaffClef::Alto => ("C", 3),
        StaffClef::Tenor => ("C", 4),
    };
    submit_command(
        session,
        json!({
            "commandVersion": 1, "commandId": "core.staff.set-definition",
            "target": { "kind": "staff", "staffId": staff_id },
            "payload": { "lineCount": staff.line_count.get(), "defaultClef": { "sign": sign, "line": line } }
        }),
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
                    title: "谱号验收".into(),
                    measure_count: 2,
                },
            })
            .unwrap();
        (service, workspace, current)
    }
    fn request(workspace: &str, current: &ScoreSessionRead, action: Value) -> ScoreEditRequest {
        ScoreEditRequest {
            workspace_id: workspace.into(),
            request_id: Uuid::new_v4().to_string(),
            document_id: current.document_id.clone(),
            expected_version: current.document_version,
            action: serde_json::from_value(action).unwrap(),
        }
    }
    fn apply(
        service: &mut ScoreSessionService,
        workspace: &str,
        current: &ScoreSessionRead,
        action: Value,
    ) -> ScoreSessionRead {
        service.edit(request(workspace, current, action)).unwrap()
    }
    fn clef(current: &ScoreSessionRead) -> &str {
        let NotationView::Staff { clef, .. } = &current.notation else {
            panic!("staff")
        };
        clef
    }
    fn musical_notation(current: &ScoreSessionRead) -> Value {
        let mut value = serde_json::to_value(&current.notation).unwrap();
        value.as_object_mut().unwrap().remove("clef");
        value
    }

    #[test]
    fn four_clefs_preserve_music_metadata_extensions_and_playback() {
        let (mut service, workspace, initial) = fixture();
        let populated = apply(
            &mut service,
            &workspace,
            &initial,
            json!({"kind":"append","measureId":"measure-1",
            "anchor":{"kind":"start"},"duration":{"base":4,"dots":1},"content":{"kind":"note","pitch":{"step":"F","octave":4,"alter":-1}}}),
        );
        let original = apply(
            &mut service,
            &workspace,
            &populated,
            json!({"kind":"set-key-signature","partId":"part-1",
            "measureId":"measure-1","change":{"kind":"set","fifths":3}}),
        );
        let before: Value =
            serde_json::from_str(&service.export_document(&workspace).unwrap()).unwrap();
        let mut current = original.clone();
        for (name, sign, line) in [
            ("bass", "F", 4),
            ("alto", "C", 3),
            ("tenor", "C", 4),
            ("treble", "G", 2),
        ] {
            let next = apply(
                &mut service,
                &workspace,
                &current,
                json!({"kind":"set-staff-clef","staffId":"staff-1","clef":name}),
            );
            assert_eq!(clef(&next), name);
            assert_eq!(next.undo_depth, current.undo_depth + 1);
            assert_eq!(musical_notation(&next), musical_notation(&original));
            let mut encoded: Value =
                serde_json::from_str(&service.export_document(&workspace).unwrap()).unwrap();
            assert_eq!(
                encoded["parts"][0]["staves"][0]["defaultClef"],
                json!({"sign":sign,"line":line})
            );
            encoded["parts"][0]["staves"][0]["defaultClef"] =
                before["parts"][0]["staves"][0]["defaultClef"].clone();
            assert_eq!(
                encoded, before,
                "only the default clef changes in the physical score schema"
            );
            let mut playback = serde_json::to_value(&next.playback_source).unwrap();
            playback["documentVersion"] = json!(original.document_version);
            assert_eq!(
                playback,
                serde_json::to_value(&original.playback_source).unwrap()
            );
            current = next;
        }
    }
    #[test]
    fn all_clefs_share_history_no_op_replay_and_lossless_codec() {
        let (mut service, workspace, mut current) = fixture();
        for name in ["bass", "alto", "tenor", "treble"] {
            let before = current.clone();
            let req = request(
                &workspace,
                &before,
                json!({"kind":"set-staff-clef","staffId":"staff-1","clef":name}),
            );
            current = service.edit(req.clone()).unwrap();
            assert_eq!(
                service.edit(req).unwrap(),
                current,
                "same request replay is idempotent"
            );
            assert_eq!(
                apply(
                    &mut service,
                    &workspace,
                    &current,
                    json!({"kind":"set-staff-clef","staffId":"staff-1","clef":name})
                ),
                current
            );
            let undone = apply(&mut service, &workspace, &current, json!({"kind":"undo"}));
            assert_eq!(undone.notation, before.notation);
            let redone = apply(&mut service, &workspace, &undone, json!({"kind":"redo"}));
            assert_eq!(redone.notation, current.notation);
            current = redone;
            let imported = service
                .import_document(
                    Uuid::new_v4().to_string(),
                    &service.export_document(&workspace).unwrap(),
                )
                .unwrap();
            assert_eq!(imported.notation, current.notation);
            assert_eq!(imported.undo_depth, 0);
        }
    }
    #[test]
    fn invalid_dto_missing_staff_stale_version_and_changed_replay_are_atomic() {
        let (mut service, workspace, initial) = fixture();
        for action in [
            json!({"kind":"set-staff-clef","staffId":"staff-1","clef":"percussion"}),
            json!({"kind":"set-staff-clef","staffId":"staff-1","clef":"Bass"}),
            json!({"kind":"set-staff-clef","staffId":"staff-1","clef":"bass","extra":true}),
        ] {
            assert!(serde_json::from_value::<ScoreEditAction>(action).is_err());
        }
        for (staff, status) in [("", 400), ("missing", 409)] {
            let err = service
                .edit(request(
                    &workspace,
                    &initial,
                    json!({"kind":"set-staff-clef","staffId":staff,"clef":"bass"}),
                ))
                .unwrap_err();
            assert_eq!(err.status, status);
            assert_eq!(service.read(&workspace).unwrap().unwrap(), initial);
        }
        let req = request(
            &workspace,
            &initial,
            json!({"kind":"set-staff-clef","staffId":"staff-1","clef":"bass"}),
        );
        let accepted = service.edit(req.clone()).unwrap();
        let mut changed = req.clone();
        changed.action = ScoreEditAction::SetStaffClef {
            staff_id: "staff-1".into(),
            clef: StaffClef::Alto,
        };
        assert_eq!(service.edit(changed).unwrap_err().status, 409);
        assert_eq!(
            service
                .edit(request(
                    &workspace,
                    &initial,
                    json!({"kind":"set-staff-clef","staffId":"staff-1","clef":"tenor"})
                ))
                .unwrap_err()
                .status,
            409
        );
        assert_eq!(service.read(&workspace).unwrap().unwrap(), accepted);
    }
    #[test]
    fn foreign_document_and_unsupported_clef_cannot_write_or_destroy_preserved_files() {
        let (mut service, workspace, initial) = fixture();
        let mut foreign = request(
            &workspace,
            &initial,
            json!({"kind":"set-staff-clef","staffId":"staff-1","clef":"bass"}),
        );
        foreign.document_id = "other".into();
        assert_eq!(service.edit(foreign).unwrap_err().status, 409);
        let mut raw: Value =
            serde_json::from_str(&service.export_document(&workspace).unwrap()).unwrap();
        raw["parts"][0]["staves"][0]["defaultClef"] = json!({"sign":"G","line":1});
        let unsupported = service
            .import_document(workspace.clone(), &raw.to_string())
            .unwrap();
        assert!(matches!(
            unsupported.notation,
            NotationView::Unsupported { .. }
        ));
        let preserved = service.export_document(&workspace).unwrap();
        assert_eq!(
            service
                .edit(request(
                    &workspace,
                    &unsupported,
                    json!({"kind":"set-staff-clef","staffId":"staff-1","clef":"bass"})
                ))
                .unwrap_err()
                .status,
            422
        );
        assert_eq!(service.export_document(&workspace).unwrap(), preserved);
    }
}
