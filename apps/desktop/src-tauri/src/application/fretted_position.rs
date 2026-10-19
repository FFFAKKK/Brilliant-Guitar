//! Narrow event-based public edit. Only the trusted installed instrument derives pitch.
use super::*;
use crate::dto::FrettedPosition;

fn failure(code: &str, message: &str, status: u16) -> HostError {
    HostError::issue(code, message, status, WorkbenchIssueSource::Host,
        WorkbenchIssueTarget::Workbench, None)
}

pub(super) fn set(session: &mut NotationSession, part_id: &str, event_id: &str,
    position: &FrettedPosition) -> Result<(), HostError> {
    let document = read_state(session)?.snapshot.document;
    let part = document.parts.iter().find(|part| id_text(&part.id).ok().as_deref() == Some(part_id))
        .ok_or_else(|| failure("editor.part-stale", "目标声部已改变，请重新选择", 409))?;
    let state = guitar_domain::read_part(&document, part.id.as_js_string())
        .filter(|_| official_domains::can_project_plain(&document))
        .ok_or_else(|| failure("notation.tablature.domain-unavailable", "当前作品没有兼容的弦品编辑能力", 422))?;
    if !(1..=state.string_count).contains(&position.string_number)
        || position.fret < 0 || position.fret > 9_007_199_254_740_991 - state.capo_fret {
        return Err(failure("notation.tablature.invalid-position", "弦品超出当前乐器范围", 422));
    }
    let event = part.measure_contents.iter().flat_map(|measure| &measure.voices)
        .flat_map(|voice| &voice.sequence.events)
        .find(|event| id_text(&event.id).ok().as_deref() == Some(event_id))
        .ok_or_else(|| failure("editor.selection-stale", "选中事件已改变，请重新选择", 409))?;
    let RhythmicContentV1::Notes { notes } = &event.content else {
        return Err(failure("notation.tablature.single-note-required", "弦品修改需要单个音符", 422));
    };
    if notes.len() != 1 {
        return Err(failure("notation.tablature.single-note-required", "弦品修改需要单个音符", 422));
    }
    let note_id = id_text(&notes[0].id)?;
    submit_command(session, json!({
        "commandVersion": 1, "commandId": format!("{}.set-position", guitar_domain::NAMESPACE),
        "target": { "kind": "part", "partId": part_id },
        "payload": { "noteId": note_id, "position": position }
    }))
}

#[cfg(test)]
mod tests;
