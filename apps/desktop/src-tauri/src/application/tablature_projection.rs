//! Disposable Tab projection from the same accepted snapshot as the staff read.
use super::*;
use crate::dto::{
    FrettedPosition, TablatureContent, TablatureEvent, TablatureMeasure, TablatureProjection,
};
pub(super) fn project(
    document: &ScoreDocumentV1,
    warnings: &[CoreRuleWarningV1],
) -> TablatureProjection {
    let unsupported = |message: &str| TablatureProjection::Unsupported {
        message: message.into(),
    };
    let Some(part) = document.parts.first() else {
        return unsupported("当前 Tab 视图暂只支持单部、单谱表。");
    };
    let Some(staff) = part.staves.first() else {
        return unsupported("当前 Tab 视图暂只支持单部、单谱表。");
    };
    if document.parts.len() != 1 || part.staves.len() != 1 {
        return unsupported("当前 Tab 视图暂只支持单部、单谱表。");
    }
    let Some(state) = guitar_domain::read_part(document, part.id.as_js_string()) else {
        return unsupported("当前乐器尚未提供兼容的弦品数据。");
    };
    if !official_domains::can_project_plain(document) {
        return unsupported("当前 Tab 视图尚不能完整显示技巧或其他扩展。");
    }
    if part.measure_contents.len() != document.measure_definitions.len() {
        return unsupported("小节内容不完整，暂时无法显示 Tab。");
    }
    let mut measures = vec![];
    for definition in &document.measure_definitions {
        if !(1..=32).contains(&definition.meter.numerator.get())
            || ![1, 2, 4, 8, 16, 32, 64].contains(&definition.meter.denominator.get())
        {
            return unsupported("当前 Tab 视图暂不支持该拍号。");
        }
        let Some(content) = part
            .measure_contents
            .iter()
            .find(|m| m.measure_id == definition.id)
        else {
            return unsupported("小节内容不完整，暂时无法显示 Tab。");
        };
        let Some(voice) = content.voices.first() else {
            return unsupported("当前 Tab 视图暂只支持从小节起点开始的单声部。");
        };
        if definition.pickup_duration.is_some()
            || content.voices.len() != 1
            || voice.default_staff_id != staff.id
            || voice.sequence.start.numerator.get() != 0
        {
            return unsupported("当前 Tab 视图暂只支持从小节起点开始的单声部。");
        }
        let mut events = vec![];
        for event in &voice.sequence.events {
            if event.staff_id.as_ref().is_some_and(|id| id != &staff.id) {
                return unsupported("当前 Tab 视图暂不支持跨谱表内容。");
            }
            let Some(value) = duration(&event.duration) else {
                return unsupported("当前 Tab 视图暂不支持该时值。");
            };
            let content = match &event.content {
                RhythmicContentV1::Rest => TablatureContent::Rest,
                RhythmicContentV1::Notes { notes } if notes.len() == 1 && value.base != 32 => {
                    let note = &notes[0];
                    let Some(position) = state
                        .placements
                        .iter()
                        .find(|p| &p.note_id == note.id.as_js_string())
                    else {
                        return unsupported("音符尚未指定弦品，不能推测 Tab 位置。");
                    };
                    let Ok(note_id) = id_text(&note.id) else {
                        return unsupported("当前 Tab 标识无法显示。");
                    };
                    TablatureContent::Note {
                        note_id,
                        position: FrettedPosition {
                            string_number: position.string_number,
                            fret: position.fret,
                        },
                    }
                }
                _ => return unsupported("当前 Tab 视图暂不支持和弦或该时值。"),
            };
            let Ok(id) = id_text(&event.id) else {
                return unsupported("当前 Tab 标识无法显示。");
            };
            events.push(TablatureEvent {
                id,
                duration: value,
                content,
            });
        }
        let (Ok(id), Ok(voice_id)) = (id_text(&definition.id), id_text(&voice.id)) else {
            return unsupported("当前 Tab 标识无法显示。");
        };
        measures.push(TablatureMeasure {
            id,
            voice_id,
            meter: Meter {
                numerator: definition.meter.numerator.get(),
                denominator: definition.meter.denominator.get(),
            },
            events,
            rule_warnings: warnings
                .iter()
                .filter(|w| {
                    w.part_id == part.id && w.measure_id == definition.id && w.voice_id == voice.id
                })
                .map(|w| StaffRuleWarning {
                    code: w.code.as_str(),
                    nominal_duration: exact_fraction(&w.nominal_duration),
                    actual_duration: exact_fraction(&w.actual_duration),
                    overflow: exact_fraction(&w.overflow),
                })
                .collect(),
        });
    }
    let (Ok(part_id), Ok(staff_id)) = (id_text(&part.id), id_text(&staff.id)) else {
        return unsupported("当前 Tab 标识无法显示。");
    };
    TablatureProjection::Tablature {
        part_id,
        staff_id,
        tempo_bpm: document.metadata.tempo.bpm.get(),
        string_count: state.string_count,
        fret_count: state.fret_count,
        capo_fret: state.capo_fret,
        measures,
    }
}
