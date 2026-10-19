//! Application adaptation of the established measure policy; Core owns all mutation/history.
use super::*;
use crate::dto::{MeasureInsertPosition, MeterChangeScope};

fn error(code: &str, message: &str, measure_id: &str, status: u16) -> HostError {
    HostError::issue(
        code,
        message,
        status,
        WorkbenchIssueSource::Editor,
        WorkbenchIssueTarget::Measure {
            measure_id: measure_id.into(),
            event_id: None,
        },
        None,
    )
}

fn index(document: &ScoreDocumentV1, measure_id: &str) -> Result<usize, HostError> {
    document
        .measure_definitions
        .iter()
        .position(|item| id_text(&item.id).is_ok_and(|id| id == measure_id))
        .ok_or_else(|| {
            error(
                "editor.measure-stale",
                "目标小节已改变，请重新选择",
                measure_id,
                409,
            )
        })
}

pub(super) fn insert(
    session: &mut NotationSession,
    current: &ScoreSessionRead,
    measure_id: &str,
    position: MeasureInsertPosition,
) -> Result<(), HostError> {
    let document = read_state(session)?.snapshot.document;
    let target_index = index(&document, measure_id)?;
    let target = &document.measure_definitions[target_index];
    let anchor = match position {
        MeasureInsertPosition::After => json!({ "kind": "after-measure", "measureId": measure_id }),
        MeasureInsertPosition::Before if target_index > 0 => json!({ "kind": "after-measure",
            "measureId": document.measure_definitions[target_index - 1].id }),
        MeasureInsertPosition::Before => json!({ "kind": "start" }),
    };
    let mut contents = Vec::new();
    for part in &document.parts {
        let source = part
            .measure_contents
            .iter()
            .find(|item| item.measure_id == target.id)
            .ok_or_else(|| {
                error(
                    "editor.measure-structure-unsupported",
                    "当前乐谱结构无法创建完整小节",
                    measure_id,
                    422,
                )
            })?;
        if source.voices.is_empty() {
            return Err(error(
                "editor.measure-structure-unsupported",
                "当前乐谱没有可复制的声部结构",
                measure_id,
                422,
            ));
        }
        let voices: Vec<_> = source
            .voices
            .iter()
            .map(|voice| {
                json!({
                    "id": Uuid::new_v4().to_string(), "defaultStaffId": voice.default_staff_id,
                    "sequence": { "start": { "numerator": 0, "denominator": 1 }, "events": [] }
                })
            })
            .collect();
        contents.push(json!({ "partId": part.id, "voices": voices }));
    }
    submit_command(
        session,
        json!({ "commandVersion": 1, "commandId": "core.measure.insert",
            "target": { "kind": "document", "documentId": current.document_id },
            "payload": { "anchor": anchor, "definition": { "id": Uuid::new_v4().to_string(), "meter": target.meter }, "contents": contents }
        }),
    )
}

pub(super) fn remove(
    session: &mut NotationSession,
    current: &ScoreSessionRead,
    measure_id: &str,
) -> Result<(), HostError> {
    let document = read_state(session)?.snapshot.document;
    index(&document, measure_id)?;
    if document.measure_definitions.len() <= 1 {
        return Err(error(
            "editor.measure-required",
            "乐谱至少需要保留一个小节",
            measure_id,
            422,
        ));
    }
    let mut commands = Vec::new();
    for part in &document.parts {
        let changes = key_signature::timeline(&document, part.id.as_js_string())
            .map_err(|_| HostError::internal())?;
        if changes.iter().any(|c| c.measure_id.eq_ascii(measure_id)) {
            commands.push(
                json!({"commandVersion":1,"commandId":key_signature::COMMAND,
                "target":{"kind":"part","partId":part.id},
                "payload":{"measureId":measure_id,"change":{"kind":"inherit"}}}),
            );
        }
    }
    commands.push(
        json!({ "commandVersion": 1, "commandId": "core.measure.remove",
        "target": { "kind": "measure", "measureId": measure_id }, "payload": {} }),
    );
    if commands.len() > 100 {
        return Err(error(
            "editor.measure-budget",
            "删除清理超过单次事务预算",
            measure_id,
            422,
        ));
    }
    let command = if commands.len() == 1 {
        commands.remove(0)
    } else {
        json!({"commandVersion":1,"commandId":"core.transaction.batch",
            "target":{"kind":"document","documentId":current.document_id},"payload":{"commands":commands}})
    };
    submit_command(session, command)
}

pub(super) fn set_meter(
    session: &mut NotationSession,
    current: &ScoreSessionRead,
    measure_id: &str,
    meter: Meter,
    scope: MeterChangeScope,
) -> Result<(), HostError> {
    let document = read_state(session)?.snapshot.document;
    let start = index(&document, measure_id)?;
    let original = &document.measure_definitions[start].meter;
    if original.numerator.get() == meter.numerator
        && original.denominator.get() == meter.denominator
    {
        return Ok(());
    }
    let mut definitions = vec![&document.measure_definitions[start]];
    if scope == MeterChangeScope::MeterRun {
        for definition in &document.measure_definitions[start + 1..] {
            if &definition.meter != original {
                break;
            }
            definitions.push(definition);
        }
    }
    if definitions.len() > 100 {
        return Err(error(
            "editor.measure-budget",
            "连续拍号修改超过单次事务的 100 小节上限，请缩小范围",
            measure_id,
            422,
        ));
    }
    let mut commands: Vec<_> = definitions
        .iter()
        .map(|definition| {
            json!({
                "commandVersion": 1, "commandId": "core.measure.set-definition",
                "target": { "kind": "measure", "measureId": definition.id },
                "payload": { "meter": meter, "pickup": match &definition.pickup_duration {
                    Some(duration) => json!({ "kind": "duration", "duration": duration }),
                    None => json!({ "kind": "none" })
                } }
            })
        })
        .collect();
    let command = if commands.len() == 1 {
        commands.remove(0)
    } else {
        json!({ "commandVersion": 1, "commandId": "core.transaction.batch",
            "target": { "kind": "document", "documentId": current.document_id }, "payload": { "commands": commands } })
    };
    submit_command(session, command)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture(count: u16) -> (ScoreSessionService, String, ScoreSessionRead) {
        let mut service = ScoreSessionService::default();
        let workspace = Uuid::new_v4().to_string();
        let current = service
            .create(CreateScoreRequest {
                workspace_id: workspace.clone(),
                request_id: Uuid::new_v4().to_string(),
                expected_document_id: None,
                input: NewScoreInput {
                    title: "结构验收".into(),
                    measure_count: count,
                },
            })
            .unwrap();
        (service, workspace, current)
    }
    fn measures(value: &ScoreSessionRead) -> &[StaffMeasure] {
        let NotationView::Staff { measures, .. } = &value.notation else {
            panic!("expected staff")
        };
        measures
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
    #[test]
    fn inserts_inherit_meter_have_new_ids_and_one_reversible_history_entry() {
        let (mut service, workspace, initial) = fixture(2);
        let target = &measures(&initial)[0];
        let changed = edit(
            &mut service,
            &workspace,
            &initial,
            json!({ "kind": "set-measure-meter", "measureId": target.id,
            "meter": { "numerator": 3, "denominator": 4 }, "scope": "measure" }),
        )
        .unwrap();
        let before = edit(
            &mut service,
            &workspace,
            &changed,
            json!({ "kind": "insert-measure", "measureId": target.id, "position": "before" }),
        )
        .unwrap();
        let list = measures(&before);
        assert_eq!(list.len(), 3);
        assert_eq!(list[1].id, target.id);
        assert_eq!(
            list[0].meter,
            Meter {
                numerator: 3,
                denominator: 4
            }
        );
        assert!(list[0].events.is_empty());
        assert_ne!(list[0].id, target.id);
        assert_ne!(list[0].voice_id, target.voice_id);
        assert_eq!(before.undo_depth, changed.undo_depth + 1);
        let after = edit(
            &mut service,
            &workspace,
            &before,
            json!({ "kind": "insert-measure", "measureId": target.id, "position": "after" }),
        )
        .unwrap();
        assert_eq!(measures(&after)[1].id, target.id);
        assert!(measures(&after)[2].events.is_empty());
        let undone = edit(&mut service, &workspace, &after, json!({ "kind": "undo" })).unwrap();
        assert_eq!(undone.notation, before.notation);
        let redone = edit(&mut service, &workspace, &undone, json!({ "kind": "redo" })).unwrap();
        assert_eq!(redone.notation, after.notation);
        assert_eq!(
            service
                .read_measure_index(&workspace, &redone.document_id, redone.document_version)
                .unwrap()
                .unwrap()
                .measure_ids,
            measures(&redone)
                .iter()
                .map(|m| m.id.clone())
                .collect::<Vec<_>>()
        );
    }
    #[test]
    fn deletion_restores_contents_and_rejects_final_stale_or_wrong_version_targets() {
        let (mut service, workspace, initial) = fixture(2);
        let target = &measures(&initial)[0];
        let populated = edit(&mut service, &workspace, &initial, json!({ "kind": "append", "measureId": target.id,
            "anchor": { "kind": "start" }, "duration": { "base": 4, "dots": 0 }, "content": { "kind": "rest" } })).unwrap();
        let deleted = edit(
            &mut service,
            &workspace,
            &populated,
            json!({ "kind": "remove-measure", "measureId": target.id }),
        )
        .unwrap();
        assert_eq!(deleted.measure_count, 1);
        assert_eq!(deleted.undo_depth, populated.undo_depth + 1);
        assert_eq!(
            edit(
                &mut service,
                &workspace,
                &deleted,
                json!({ "kind": "remove-measure", "measureId": measures(&deleted)[0].id })
            )
            .unwrap_err()
            .issue
            .unwrap()
            .code,
            "editor.measure-required"
        );
        assert_eq!(
            edit(
                &mut service,
                &workspace,
                &deleted,
                json!({ "kind": "insert-measure", "measureId": "missing", "position": "after" })
            )
            .unwrap_err()
            .status,
            409
        );
        assert_eq!(
            edit(
                &mut service,
                &workspace,
                &populated,
                json!({ "kind": "remove-measure", "measureId": target.id })
            )
            .unwrap_err()
            .status,
            409
        );
        assert_eq!(service.read(&workspace).unwrap().unwrap(), deleted);
        let restored = edit(
            &mut service,
            &workspace,
            &deleted,
            json!({ "kind": "undo" }),
        )
        .unwrap();
        assert_eq!(restored.notation, populated.notation);
    }
    #[test]
    fn meter_run_stops_at_original_change_preserves_events_and_reports_overflow() {
        let (mut service, workspace, initial) = fixture(4);
        let list = measures(&initial);
        let split = edit(
            &mut service,
            &workspace,
            &initial,
            json!({ "kind": "set-measure-meter", "measureId": list[2].id,
            "meter": { "numerator": 3, "denominator": 4 }, "scope": "measure" }),
        )
        .unwrap();
        let full = edit(&mut service, &workspace, &split, json!({ "kind": "append", "measureId": list[0].id,
            "anchor": { "kind": "start" }, "duration": { "base": 1, "dots": 0 }, "content": { "kind": "rest" } })).unwrap();
        let changed = edit(
            &mut service,
            &workspace,
            &full,
            json!({ "kind": "set-measure-meter", "measureId": list[0].id,
            "meter": { "numerator": 6, "denominator": 8 }, "scope": "meter-run" }),
        )
        .unwrap();
        assert_eq!(
            measures(&changed)
                .iter()
                .map(|m| (m.meter.numerator, m.meter.denominator))
                .collect::<Vec<_>>(),
            vec![(6, 8), (6, 8), (3, 4), (4, 4)]
        );
        assert_eq!(measures(&changed)[0].events, measures(&full)[0].events);
        assert_eq!(measures(&changed)[0].rule_warnings.len(), 1);
        assert_eq!(changed.undo_depth, full.undo_depth + 1);
        let same = edit(
            &mut service,
            &workspace,
            &changed,
            json!({ "kind": "set-measure-meter", "measureId": list[0].id,
            "meter": { "numerator": 6, "denominator": 8 }, "scope": "meter-run" }),
        )
        .unwrap();
        assert_eq!(same, changed);
        let undone = edit(&mut service, &workspace, &same, json!({ "kind": "undo" })).unwrap();
        assert_eq!(undone.notation, full.notation);
    }
    #[test]
    fn over_budget_run_is_rejected_atomically_and_exact_budget_is_undoable() {
        let (mut service, workspace, initial) = fixture(101);
        let first = &measures(&initial)[0].id;
        let action = json!({ "kind": "set-measure-meter", "measureId": first, "meter": { "numerator": 7, "denominator": 8 }, "scope": "meter-run" });
        assert_eq!(
            edit(&mut service, &workspace, &initial, action)
                .unwrap_err()
                .issue
                .unwrap()
                .code,
            "editor.measure-budget"
        );
        assert_eq!(service.read(&workspace).unwrap().unwrap(), initial);
        let changed = edit(
            &mut service,
            &workspace,
            &initial,
            json!({ "kind": "set-measure-meter", "measureId": measures(&initial)[1].id,
            "meter": { "numerator": 7, "denominator": 8 }, "scope": "meter-run" }),
        )
        .unwrap();
        assert_eq!(changed.undo_depth, initial.undo_depth + 1);
        assert_eq!(measures(&changed)[0].meter, measures(&initial)[0].meter);
        assert!(measures(&changed)[1..].iter().all(|m| m.meter
            == Meter {
                numerator: 7,
                denominator: 8
            }));
        assert_eq!(
            edit(
                &mut service,
                &workspace,
                &changed,
                json!({ "kind": "undo" })
            )
            .unwrap()
            .notation,
            initial.notation
        );
    }
    #[test]
    fn meter_preserves_pickup_and_closed_dto_rejects_invalid_values() {
        let (mut service, workspace, initial) = fixture(2);
        let mut document: Value =
            serde_json::from_str(&service.export_document(&workspace).unwrap()).unwrap();
        document["measureDefinitions"][0]["pickupDuration"] =
            json!({ "numerator": 1, "denominator": 4 });
        let imported = service
            .import_document(workspace.clone(), &document.to_string())
            .unwrap();
        let changed = edit(
            &mut service,
            &workspace,
            &imported,
            json!({ "kind": "set-measure-meter", "measureId": "measure-1",
            "meter": { "numerator": 6, "denominator": 8 }, "scope": "measure" }),
        )
        .unwrap();
        assert!(matches!(changed.notation, NotationView::Unsupported { .. }));
        let saved: Value =
            serde_json::from_str(&service.export_document(&workspace).unwrap()).unwrap();
        assert_eq!(
            saved["measureDefinitions"][0]["pickupDuration"],
            json!({ "numerator": 1, "denominator": 4 })
        );
        assert_eq!(
            saved["measureDefinitions"][0]["meter"],
            json!({ "numerator": 6, "denominator": 8 })
        );
        for meter in [
            json!({ "numerator": 0, "denominator": 4 }),
            json!({ "numerator": 4, "denominator": 3 }),
            json!({ "numerator": 33, "denominator": 4 }),
        ] {
            assert_eq!(edit(&mut service, &workspace, &changed, json!({ "kind": "set-measure-meter", "measureId": "measure-1", "meter": meter, "scope": "measure" })).unwrap_err().status, 400);
        }
        assert_eq!(service.read(&workspace).unwrap().unwrap(), changed);
        for action in [
            json!({ "kind": "insert-measure", "measureId": "m", "position": "around" }),
            json!({ "kind": "remove-measure", "measureId": "m", "extra": true }),
            json!({ "kind": "set-measure-meter", "measureId": "m", "meter": { "numerator": 4, "denominator": 4, "extra": true }, "scope": "measure" }),
        ] {
            assert!(serde_json::from_value::<ScoreEditAction>(action).is_err());
        }
        assert_eq!(initial.measure_count, 2);
    }
}
