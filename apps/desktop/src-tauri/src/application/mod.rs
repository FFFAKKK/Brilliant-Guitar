use std::collections::{HashMap, VecDeque};
use std::path::{Path, PathBuf};

use brilliant_core_types::StableId;
use brilliant_kernel_contracts::{
    KernelRuleWarningReadFailureV1, KernelSelectorResultV1, KernelSelectorValueV1,
    KernelSessionCreateRequestV1, KernelSessionReadResultV1, KernelStage4CommandResultV1,
    KernelStage4FailureV1, KernelStage4MarkPersistedResultV1, KernelStage4OperationResultV1,
    MeasurePointKindV1, MeasurePointV1, ScoreRangeSelectionV1, ScoreRangeV1, SelectorRequestV1,
};
use brilliant_kernel_session::KernelSession;
use brilliant_score_foundation::{
    CoreRuleWarningV1, FractionV1, LosslessEncode, NoteValueV1, PitchStepV1, RhythmicContentV1,
    ScoreDocumentV1, decode_lossless_json, decode_lossless_score_document_value,
};
use serde_json::{Value, json};
use uuid::Uuid;

use crate::{
    dto::{
        CreateScoreRequest, EventDuration, ExactFraction, InputContent, InputSequenceAnchor, Meter,
        NativeFileResult, NewScoreInput, NotationView, PitchStep, PlaybackSourceContent,
        PlaybackSourceEvent, PlaybackSourceMeasure, PlaybackSourceProjection,
        PlaybackTransposition, ScoreEditAction, ScoreEditRequest, ScoreMeasureIndexV1,
        ScoreMeasureRangeMeasureV1, ScoreMeasureRangeV1, ScoreMetadataV1, ScoreSessionRead,
        ScoreStructureV1, ScoreSummaryV1, StaffEvent, StaffMeasure, StaffRuleWarning,
        WorkbenchIssueSource, WorkbenchIssueTarget,
    },
    error::HostError,
};

const MAX_WORKSPACES: usize = 32;
const MAX_RETAINED_REQUESTS: usize = 64;

struct SessionEntry {
    session: KernelSession,
    measure_index: ScoreMeasureIndexV1,
    create_request_id: String,
    create_input_key: String,
    edits: HashMap<String, (String, u64)>,
    edit_order: VecDeque<String>,
    file_path: Option<PathBuf>,
    saved_version: Option<u64>,
}

#[derive(Default)]
pub struct ScoreSessionService {
    sessions: HashMap<String, SessionEntry>,
}

impl ScoreSessionService {
    pub fn read_measure_index(
        &self,
        workspace_id: &str,
        expected_document_id: &str,
        expected_document_version: u64,
    ) -> Result<Option<ScoreMeasureIndexV1>, HostError> {
        validate_workspace_id(workspace_id)?;
        let Some(entry) = self.sessions.get(workspace_id) else {
            return Ok(None);
        };
        let selected = entry
            .session
            .select_stage4(SelectorRequestV1::ScoreOverview);
        let (current_document_id, current_measure_count) = match selected.selection {
            KernelSelectorResultV1::Ok(KernelSelectorValueV1::Overview(overview)) => (
                id_text(&overview.document_id)?,
                usize::try_from(overview.measure_count.get()).map_err(|_| HostError::internal())?,
            ),
            _ => return Err(HostError::internal()),
        };
        let current_document_version = selected.document_version.get();
        if current_document_id != expected_document_id
            || current_document_version != expected_document_version
            || entry.measure_index.document_id != current_document_id
            || entry.measure_index.document_version != current_document_version
            || entry.measure_index.measure_ids.len() != current_measure_count
        {
            return Err(HostError::new("小节索引与当前文档版本不一致", 409));
        }
        Ok(Some(entry.measure_index.clone()))
    }

    pub fn read_summary(&self, workspace_id: &str) -> Result<Option<ScoreSummaryV1>, HostError> {
        validate_workspace_id(workspace_id)?;
        let Some(entry) = self.sessions.get(workspace_id) else {
            return Ok(None);
        };
        let selected = entry
            .session
            .select_stage4(SelectorRequestV1::ScoreOverview);
        match selected.selection {
            KernelSelectorResultV1::Ok(KernelSelectorValueV1::Overview(overview)) => {
                Ok(Some(ScoreSummaryV1 {
                    document_id: id_text(&overview.document_id)?,
                    document_version: selected.document_version.get(),
                    title: text(&overview.title)?,
                    measure_count: usize::try_from(overview.measure_count.get())
                        .map_err(|_| HostError::internal())?,
                }))
            }
            _ => Err(HostError::internal()),
        }
    }

    pub fn read_metadata(&self, workspace_id: &str) -> Result<Option<ScoreMetadataV1>, HostError> {
        validate_workspace_id(workspace_id)?;
        let Some(entry) = self.sessions.get(workspace_id) else {
            return Ok(None);
        };
        let overview = entry
            .session
            .select_stage4(SelectorRequestV1::ScoreOverview);
        let metadata = entry
            .session
            .select_stage4(SelectorRequestV1::ScoreMetadata);
        if overview.document_version != metadata.document_version {
            return Err(HostError::internal());
        }
        let document_version = overview.document_version.get();
        match (overview.selection, metadata.selection) {
            (
                KernelSelectorResultV1::Ok(KernelSelectorValueV1::Overview(overview)),
                KernelSelectorResultV1::Ok(KernelSelectorValueV1::Metadata(metadata)),
            ) => Ok(Some(ScoreMetadataV1 {
                document_id: id_text(&overview.document_id)?,
                document_version,
                title: text(&metadata.title)?,
                authors: metadata
                    .authors
                    .iter()
                    .map(text)
                    .collect::<Result<Vec<_>, _>>()?,
                tempo_bpm: metadata.tempo.bpm.get(),
            })),
            _ => Err(HostError::internal()),
        }
    }

    pub fn read_structure(
        &self,
        workspace_id: &str,
    ) -> Result<Option<ScoreStructureV1>, HostError> {
        validate_workspace_id(workspace_id)?;
        let Some(entry) = self.sessions.get(workspace_id) else {
            return Ok(None);
        };
        let selected = entry
            .session
            .select_stage4(SelectorRequestV1::ScoreStructure);
        let document_version = selected.document_version.get();
        match selected.selection {
            KernelSelectorResultV1::Ok(KernelSelectorValueV1::Structure(structure)) => {
                Ok(Some(ScoreStructureV1 {
                    document_id: id_text(&structure.document_id)?,
                    document_version,
                    measure_count: usize::try_from(structure.measure_count.get())
                        .map_err(|_| HostError::internal())?,
                    part_count: usize::try_from(structure.part_count.get())
                        .map_err(|_| HostError::internal())?,
                    staff_count: usize::try_from(structure.staff_count.get())
                        .map_err(|_| HostError::internal())?,
                }))
            }
            _ => Err(HostError::internal()),
        }
    }

    pub fn read_measure_range(
        &self,
        workspace_id: &str,
        start_measure_id: String,
        end_measure_id: String,
        max_measures: usize,
    ) -> Result<Option<ScoreMeasureRangeV1>, HostError> {
        validate_workspace_id(workspace_id)?;
        let start_measure_id =
            StableId::new(start_measure_id).map_err(|_| HostError::new("起始小节标识无效", 422))?;
        let end_measure_id =
            StableId::new(end_measure_id).map_err(|_| HostError::new("结束小节标识无效", 422))?;
        let Some(entry) = self.sessions.get(workspace_id) else {
            return Ok(None);
        };
        let overview = entry
            .session
            .select_stage4(SelectorRequestV1::ScoreOverview);
        let selected = entry.session.select_stage4(SelectorRequestV1::ScoreRange {
            range: ScoreRangeV1::MeasureRange {
                start: MeasurePointV1 {
                    kind: MeasurePointKindV1::Measure,
                    measure_id: start_measure_id,
                },
                end: MeasurePointV1 {
                    kind: MeasurePointKindV1::Measure,
                    measure_id: end_measure_id,
                },
            },
        });
        if overview.document_version != selected.document_version {
            return Err(HostError::internal());
        }
        let document_version = selected.document_version.get();
        match (overview.selection, selected.selection) {
            (
                KernelSelectorResultV1::Ok(KernelSelectorValueV1::Overview(overview)),
                KernelSelectorResultV1::Ok(KernelSelectorValueV1::Range(
                    ScoreRangeSelectionV1::MeasureRange {
                        normalized: ScoreRangeV1::MeasureRange { start, end },
                        measures,
                    },
                )),
            ) => {
                if measures.len() > max_measures {
                    return Err(HostError::new("小节范围超过本次调用上限", 422));
                }
                let measures = measures
                    .into_iter()
                    .map(|measure| {
                        Ok(ScoreMeasureRangeMeasureV1 {
                            measure_id: id_text(&measure.id)?,
                            meter: Meter {
                                numerator: measure.meter.numerator.get(),
                                denominator: measure.meter.denominator.get(),
                            },
                            pickup_duration: measure.pickup_duration.map(|duration| {
                                ExactFraction {
                                    numerator: duration.numerator.get(),
                                    denominator: duration.denominator.get(),
                                }
                            }),
                        })
                    })
                    .collect::<Result<Vec<_>, HostError>>()?;
                Ok(Some(ScoreMeasureRangeV1 {
                    document_id: id_text(&overview.document_id)?,
                    document_version,
                    start_measure_id: id_text(&start.measure_id)?,
                    end_measure_id: id_text(&end.measure_id)?,
                    measure_count: measures.len(),
                    measures,
                }))
            }
            (
                _,
                KernelSelectorResultV1::Rejected(
                    KernelStage4FailureV1::ReadRangeEndpointNotFound
                    | KernelStage4FailureV1::ReadInvalidRange,
                ),
            ) => Err(HostError::new("小节范围端点无效", 422)),
            _ => Err(HostError::internal()),
        }
    }

    pub fn read(&self, workspace_id: &str) -> Result<Option<ScoreSessionRead>, HostError> {
        validate_workspace_id(workspace_id)?;
        self.sessions
            .get(workspace_id)
            .map(|entry| session_read(&entry.session))
            .transpose()
    }

    pub fn create(&mut self, request: CreateScoreRequest) -> Result<ScoreSessionRead, HostError> {
        validate_workspace_id(&request.workspace_id)?;
        validate_request_id(&request.request_id)?;
        validate_new_score(&request.input)?;
        let input_key = serde_json::to_string(&request.input).map_err(|_| HostError::internal())?;
        if let Some(current) = self.sessions.get(&request.workspace_id)
            && current.create_request_id == request.request_id
        {
            if current.create_input_key != input_key {
                return Err(HostError::new("创建参数已改变，请重新打开新建窗口", 409));
            }
            return session_read(&current.session);
        }
        let actual_document = self
            .sessions
            .get(&request.workspace_id)
            .map(|entry| document_id(&entry.session))
            .transpose()?;
        if actual_document != request.expected_document_id {
            return Err(HostError::new(
                "当前作品已改变，请重新打开新建窗口后重试",
                409,
            ));
        }
        if !self.sessions.contains_key(&request.workspace_id)
            && self.sessions.len() >= MAX_WORKSPACES
        {
            return Err(HostError::new(
                "工作区数量已达本轮上限，暂时无法创建新工作区",
                503,
            ));
        }
        let session = create_score_session(&request.input)?;
        let projection = session_projection(&session)?;
        self.sessions.insert(
            request.workspace_id,
            SessionEntry {
                session,
                measure_index: projection.measure_index,
                create_request_id: request.request_id,
                create_input_key: input_key,
                edits: HashMap::new(),
                edit_order: VecDeque::new(),
                file_path: None,
                saved_version: None,
            },
        );
        Ok(projection.read)
    }

    pub fn edit(&mut self, request: ScoreEditRequest) -> Result<ScoreSessionRead, HostError> {
        validate_workspace_id(&request.workspace_id)?;
        validate_request_id(&request.request_id)?;
        validate_edit(&request)?;
        let entry = self
            .sessions
            .get_mut(&request.workspace_id)
            .ok_or_else(|| {
                HostError::issue(
                    "editor.document-stale",
                    "当前乐谱已改变，请重新定位",
                    409,
                    WorkbenchIssueSource::Editor,
                    WorkbenchIssueTarget::Workbench,
                    None,
                )
            })?;
        let current = session_read(&entry.session)?;
        if current.document_id != request.document_id {
            return Err(HostError::issue(
                "editor.document-stale",
                "当前乐谱已改变，请重新定位",
                409,
                WorkbenchIssueSource::Editor,
                WorkbenchIssueTarget::Workbench,
                None,
            ));
        }
        let request_key = serde_json::to_string(&json!({
            "documentId": request.document_id,
            "expectedVersion": request.expected_version,
            "action": serde_json::to_value(&request.action).map_err(|_| HostError::internal())?,
        }))
        .map_err(|_| HostError::internal())?;
        if let Some((previous_key, version)) = entry.edits.get(&request.request_id) {
            if previous_key != &request_key || current.document_version != *version {
                return Err(HostError::new(
                    "该请求已处理，乐谱状态已变化，请重新定位",
                    409,
                ));
            }
            return Ok(current);
        }
        if current.document_version != request.expected_version {
            return Err(HostError::issue(
                "editor.version-conflict",
                "乐谱版本已更新，请重新定位后输入",
                409,
                WorkbenchIssueSource::Editor,
                action_target(&current, &request.action),
                None,
            ));
        }
        if matches!(current.notation, NotationView::Unsupported { .. }) {
            return Err(HostError::new("当前乐谱格式尚不支持编辑", 422));
        }
        execute_edit(&mut entry.session, &current, &request.action)?;
        let projection = session_projection(&entry.session)?;
        let result = projection.read;
        entry.measure_index = projection.measure_index;
        entry.edits.insert(
            request.request_id.clone(),
            (request_key, result.document_version),
        );
        entry.edit_order.push_back(request.request_id);
        while entry.edit_order.len() > MAX_RETAINED_REQUESTS {
            if let Some(expired) = entry.edit_order.pop_front() {
                entry.edits.remove(&expired);
            }
        }
        Ok(result)
    }

    pub fn export_document(&self, workspace_id: &str) -> Result<String, HostError> {
        validate_workspace_id(workspace_id)?;
        let entry = self
            .sessions
            .get(workspace_id)
            .ok_or_else(|| HostError::new("当前没有可保存的乐谱", 404))?;
        let state = read_state(&entry.session)?;
        let mut bytes = Vec::new();
        state
            .snapshot
            .document
            .write_lossless(&mut bytes)
            .map_err(|_| HostError::new("无法编码当前乐谱", 422))?;
        String::from_utf8(bytes).map_err(|_| HostError::new("无法编码当前乐谱", 422))
    }

    pub fn import_document(
        &mut self,
        workspace_id: String,
        document_json: &str,
    ) -> Result<ScoreSessionRead, HostError> {
        validate_workspace_id(&workspace_id)?;
        let value = decode_lossless_json(document_json)
            .map_err(|_| HostError::new("文件不是有效的项目 JSON", 422))?;
        let document = decode_lossless_score_document_value(value)
            .map_err(|_| HostError::new("文件不是可识别的项目乐谱", 422))?;
        let accepted = KernelSession::create(KernelSessionCreateRequestV1 {
            api_version: 1,
            document,
        })
        .map_err(|_| HostError::new("无法打开该乐谱文件", 422))?;
        let projection = session_projection(&accepted.session)?;
        self.sessions.insert(
            workspace_id,
            SessionEntry {
                session: accepted.session,
                measure_index: projection.measure_index,
                create_request_id: Uuid::new_v4().to_string(),
                create_input_key: "import".into(),
                edits: HashMap::new(),
                edit_order: VecDeque::new(),
                file_path: None,
                saved_version: None,
            },
        );
        Ok(projection.read)
    }

    pub fn close(&mut self, workspace_id: &str) -> Result<bool, HostError> {
        validate_workspace_id(workspace_id)?;
        Ok(self.sessions.remove(workspace_id).is_some())
    }

    pub fn file_path(&self, workspace_id: &str) -> Result<Option<PathBuf>, HostError> {
        validate_workspace_id(workspace_id)?;
        Ok(self
            .sessions
            .get(workspace_id)
            .and_then(|entry| entry.file_path.clone()))
    }

    pub fn export_snapshot(&self, workspace_id: &str) -> Result<(String, u64), HostError> {
        let text = self.export_document(workspace_id)?;
        let entry = self
            .sessions
            .get(workspace_id)
            .ok_or_else(|| HostError::new("当前没有可保存的乐谱", 404))?;
        Ok((text, session_read(&entry.session)?.document_version))
    }

    pub fn mark_saved(
        &mut self,
        workspace_id: &str,
        path: PathBuf,
        saved_version: u64,
    ) -> Result<NativeFileResult, HostError> {
        validate_workspace_id(workspace_id)?;
        let entry = self
            .sessions
            .get_mut(workspace_id)
            .ok_or_else(|| HostError::new("当前没有可保存的乐谱", 404))?;
        mark_persisted(&mut entry.session, saved_version)?;
        entry.file_path = Some(path.clone());
        entry.saved_version = Some(saved_version);
        Ok(NativeFileResult {
            session: session_read(&entry.session)?,
            name: file_display_name(&path),
            saved_version,
        })
    }

    pub fn import_file(
        &mut self,
        workspace_id: String,
        document_json: &str,
        path: PathBuf,
    ) -> Result<NativeFileResult, HostError> {
        let session = self.import_document(workspace_id.clone(), document_json)?;
        let entry = self
            .sessions
            .get_mut(&workspace_id)
            .ok_or_else(HostError::internal)?;
        entry.file_path = Some(path.clone());
        entry.saved_version = Some(session.document_version);
        let saved_version = session.document_version;
        Ok(NativeFileResult {
            session,
            name: file_display_name(&path),
            saved_version,
        })
    }
}

fn mark_persisted(session: &mut KernelSession, document_version: u64) -> Result<(), HostError> {
    let document_id = document_id(session)?;
    let bytes = serde_json::to_vec(&json!({
        "apiVersion": 1,
        "operation": {
            "kind": "mark-persisted",
            "checkpoint": {
                "documentId": document_id,
                "documentVersion": document_version,
            }
        }
    }))
    .map_err(|_| HostError::internal())?;
    match session.operate_stage4_bytes(&bytes) {
        KernelStage4OperationResultV1::MarkPersisted(
            KernelStage4MarkPersistedResultV1::Updated { .. }
            | KernelStage4MarkPersistedResultV1::NoOp { .. },
        ) => Ok(()),
        KernelStage4OperationResultV1::MarkPersisted(
            KernelStage4MarkPersistedResultV1::Rejected { .. },
        ) => Err(HostError::issue(
            "file.checkpoint-rejected",
            "文件已写入，但内核无法确认保存检查点，请再次保存",
            409,
            WorkbenchIssueSource::File,
            WorkbenchIssueTarget::Component {
                component_id: "navigation.file".into(),
            },
            Some(true),
        )),
        _ => Err(HostError::internal()),
    }
}

fn file_display_name(path: &Path) -> String {
    path.file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("未命名乐谱")
        .trim_end_matches(".json")
        .trim_end_matches(".bgp")
        .to_string()
}

fn validate_workspace_id(value: &str) -> Result<(), HostError> {
    Uuid::parse_str(value)
        .map(|_| ())
        .map_err(|_| HostError::new("工作区标识无效", 400))
}

fn validate_request_id(value: &str) -> Result<(), HostError> {
    Uuid::parse_str(value)
        .map(|_| ())
        .map_err(|_| HostError::new("请求标识无效", 400))
}

fn validate_new_score(input: &NewScoreInput) -> Result<(), HostError> {
    if text_length(input.title.trim()) > 120 || !(1..=128).contains(&input.measure_count) {
        return Err(HostError::new("请检查标题和小节数", 400));
    }
    Ok(())
}

fn validate_duration(value: EventDuration, rest: bool) -> bool {
    matches!(value.base, 1 | 2 | 4 | 8 | 16) && value.dots <= 1
        || rest && value.base == 32 && value.dots == 0
}

fn validate_edit(request: &ScoreEditRequest) -> Result<(), HostError> {
    if request.document_id.is_empty() {
        return Err(HostError::new("输入参数不正确", 400));
    }
    match &request.action {
        ScoreEditAction::SetTitle { title } if text_length(title.trim()) > 120 => {
            Err(HostError::new("标题最多 120 个字符", 400))
        }
        ScoreEditAction::Append {
            duration, content, ..
        } if !validate_duration(*duration, matches!(content, InputContent::Rest)) => {
            Err(HostError::new("输入时值无效", 400))
        }
        ScoreEditAction::SetEventProperties { properties, .. }
            if !validate_duration(
                properties.duration,
                matches!(properties.content, InputContent::Rest),
            ) =>
        {
            Err(HostError::new("输入时值无效", 400))
        }
        ScoreEditAction::Append {
            content: InputContent::Note { pitch },
            ..
        }
        | ScoreEditAction::SetEventProperties {
            properties:
                crate::dto::EventProperties {
                    content: InputContent::Note { pitch },
                    ..
                },
            ..
        } if !(2..=6).contains(&pitch.octave) || !(-1..=1).contains(&pitch.alter) => {
            Err(HostError::new("输入音高无效", 400))
        }
        ScoreEditAction::DeleteEvent { event_id, .. }
        | ScoreEditAction::SetEventProperties { event_id, .. }
            if event_id.is_empty() =>
        {
            Err(HostError::new("输入参数不正确", 400))
        }
        ScoreEditAction::Append {
            measure_id, anchor, ..
        } if measure_id.is_empty()
            || matches!(anchor, InputSequenceAnchor::AfterEvent { event_id } if event_id.is_empty()) =>
        {
            Err(HostError::new("输入参数不正确", 400))
        }
        _ => Ok(()),
    }
}

fn text_length(value: &str) -> usize {
    value.encode_utf16().count()
}

fn create_score_session(input: &NewScoreInput) -> Result<KernelSession, HostError> {
    let document_id = Uuid::new_v4().to_string();
    let document = json!({
        "schemaVersion": "brilliant-score-1",
        "id": document_id,
        "metadata": { "title": if input.title.trim().is_empty() { "未命名乐谱" } else { input.title.trim() }, "authors": [], "tempo": { "bpm": 96 } },
        "measureDefinitions": [{ "id": "measure-1", "meter": { "numerator": 4, "denominator": 4 } }],
        "parts": [{
            "id": "part-1", "name": "高音谱表",
            "instrument": { "name": "通用", "writtenToSounding": { "diatonicSteps": 0, "chromaticSemitones": 0 } },
            "staves": [{ "id": "staff-1", "lineCount": 5, "defaultClef": { "sign": "G", "line": 2 } }],
            "measureContents": [{ "measureId": "measure-1", "voices": [{ "id": "voice-1", "defaultStaffId": "staff-1", "sequence": { "start": { "numerator": 0, "denominator": 1 }, "events": [] } }] }]
        }],
        "extensions": []
    });
    let request = brilliant_kernel_contracts::decode_create_request(
        &serde_json::to_vec(&json!({ "apiVersion": 1, "document": document }))
            .map_err(|_| HostError::internal())?,
    )
    .map_err(|_| HostError::new("无法创建该格式的乐谱", 422))?;
    let mut session = KernelSession::create(request)
        .map_err(|_| HostError::new("无法建立乐谱编辑会话", 503))?
        .session;
    let commands: Vec<_> = (2..=input.measure_count)
        .map(|index| {
            json!({
                "commandVersion": 1,
                "commandId": "core.measure.insert",
                "target": { "kind": "document", "documentId": document_id },
                "payload": {
                    "anchor": { "kind": "after-measure", "measureId": format!("measure-{}", index - 1) },
                    "definition": { "id": format!("measure-{index}"), "meter": { "numerator": 4, "denominator": 4 } },
                    "contents": [{ "partId": "part-1", "voices": [{ "id": format!("voice-{index}"), "defaultStaffId": "staff-1", "sequence": { "start": { "numerator": 0, "denominator": 1 }, "events": [] } }] }]
                }
            })
        })
        .collect();
    for batch in commands.chunks(64) {
        submit_command(
            &mut session,
            json!({
                "commandVersion": 1,
                "commandId": "core.transaction.batch",
                "target": { "kind": "document", "documentId": document_id },
                "payload": { "commands": batch }
            }),
        )?;
    }
    let document = read_state(&session)?.snapshot.document;
    KernelSession::create(KernelSessionCreateRequestV1 {
        api_version: 1,
        document,
    })
    .map(|accepted| accepted.session)
    .map_err(|_| HostError::new("无法建立乐谱编辑会话", 503))
}

fn read_state(
    session: &KernelSession,
) -> Result<Box<brilliant_kernel_contracts::KernelReadStateV1>, HostError> {
    match session.read_state() {
        KernelSessionReadResultV1::Ok(state) => Ok(state),
        KernelSessionReadResultV1::Rejected(_) => Err(HostError::internal()),
    }
}

struct SessionProjection {
    read: ScoreSessionRead,
    measure_index: ScoreMeasureIndexV1,
}

fn session_projection(session: &KernelSession) -> Result<SessionProjection, HostError> {
    let state = read_state(session)?;
    let document = &state.snapshot.document;
    let document_id = id_text(&document.id)?;
    let document_version = state.snapshot.document_version.get();
    let measure_ids = document
        .measure_definitions
        .iter()
        .map(|measure| id_text(&measure.id))
        .collect::<Result<Vec<_>, _>>()?;
    let mut warnings = Vec::new();
    let mut offset = 0;
    loop {
        let page = session
            .read_rule_warning_page(&document.id, state.snapshot.document_version, offset, 4_096)
            .map_err(|failure| match failure {
                KernelRuleWarningReadFailureV1::DocumentMismatch
                | KernelRuleWarningReadFailureV1::StaleVersion
                | KernelRuleWarningReadFailureV1::InvalidPageSize { .. }
                | KernelRuleWarningReadFailureV1::OffsetOutOfBounds { .. }
                | KernelRuleWarningReadFailureV1::SemanticInvalid { .. }
                | KernelRuleWarningReadFailureV1::Internal => HostError::internal(),
            })?;
        warnings.extend(page.warnings);
        let Some(next) = page.next_offset else { break };
        offset = next;
    }
    Ok(SessionProjection {
        read: ScoreSessionRead {
            document_id: document_id.clone(),
            title: text(&document.metadata.title)?,
            measure_count: document.measure_definitions.len(),
            document_version,
            undo_depth: state.history.undo_depth,
            redo_depth: state.history.redo_depth,
            notation: project_notation(document, &warnings),
            playback_source: project_playback_source(document, document_version),
        },
        measure_index: ScoreMeasureIndexV1 {
            document_id,
            document_version,
            measure_ids,
        },
    })
}

fn session_read(session: &KernelSession) -> Result<ScoreSessionRead, HostError> {
    session_projection(session).map(|projection| projection.read)
}

fn document_id(session: &KernelSession) -> Result<String, HostError> {
    id_text(&read_state(session)?.snapshot.document.id)
}

fn id_text(value: &StableId) -> Result<String, HostError> {
    value
        .as_js_string()
        .to_utf8()
        .map_err(|_| HostError::new("文档包含当前界面无法显示的标识", 422))
}

fn text(value: &brilliant_core_types::JsString) -> Result<String, HostError> {
    value
        .to_utf8()
        .map_err(|_| HostError::new("文档包含当前界面无法显示的文字", 422))
}

fn duration(value: &NoteValueV1) -> Option<EventDuration> {
    let base = u8::try_from(value.base.get()).ok()?;
    let dots = u8::try_from(value.dots.get()).ok()?;
    if value.time_modification.is_some() || !validate_duration(EventDuration { base, dots }, true) {
        return None;
    }
    Some(EventDuration { base, dots })
}

fn pitch(value: brilliant_score_foundation::WrittenPitchV1) -> Option<crate::dto::InputPitch> {
    Some(crate::dto::InputPitch {
        step: match value.step {
            PitchStepV1::C => PitchStep::C,
            PitchStepV1::D => PitchStep::D,
            PitchStepV1::E => PitchStep::E,
            PitchStepV1::F => PitchStep::F,
            PitchStepV1::G => PitchStep::G,
            PitchStepV1::A => PitchStep::A,
            PitchStepV1::B => PitchStep::B,
        },
        octave: i8::try_from(value.octave.get()).ok()?,
        alter: i8::try_from(value.alter.get()).ok()?,
    })
}

fn unsupported(message: &str) -> NotationView {
    NotationView::Unsupported {
        message: message.into(),
    }
}

fn exact_fraction(value: &FractionV1) -> ExactFraction {
    ExactFraction {
        numerator: value.numerator.get(),
        denominator: value.denominator.get(),
    }
}

fn playback_unsupported(
    document: &ScoreDocumentV1,
    document_version: u64,
    code: &'static str,
    message: &str,
) -> PlaybackSourceProjection {
    PlaybackSourceProjection::Unsupported {
        projection_version: 1,
        document_id: id_text(&document.id).unwrap_or_else(|_| "unavailable".into()),
        document_version,
        code,
        message: message.into(),
    }
}

fn playback_duration(value: &NoteValueV1) -> Option<ExactFraction> {
    if value.time_modification.is_some() {
        return None;
    }
    let base = value.base.get();
    let dots = value.dots.get();
    if base <= 0 || !(0..=1).contains(&dots) {
        return None;
    }
    Some(if dots == 0 {
        ExactFraction {
            numerator: 1,
            denominator: base,
        }
    } else {
        ExactFraction {
            numerator: 3,
            denominator: base.checked_mul(2)?,
        }
    })
}

fn project_playback_source(
    document: &ScoreDocumentV1,
    document_version: u64,
) -> PlaybackSourceProjection {
    let Some(part) = document.parts.first() else {
        return playback_unsupported(
            document,
            document_version,
            "playback.structure-unsupported",
            "第一版播放暂只支持单声部乐谱",
        );
    };
    if document.parts.len() != 1 {
        return playback_unsupported(
            document,
            document_version,
            "playback.structure-unsupported",
            "第一版播放暂只支持单声部乐谱",
        );
    }
    if !document.extensions.is_empty()
        || document
            .measure_definitions
            .iter()
            .any(|measure| measure.pickup_duration.is_some())
    {
        return playback_unsupported(
            document,
            document_version,
            "playback.structure-unsupported",
            "当前乐谱结构暂不支持播放",
        );
    }
    if part.measure_contents.len() != document.measure_definitions.len() {
        return playback_unsupported(
            document,
            document_version,
            "playback.measure-content-invalid",
            "小节内容不完整，暂时无法播放",
        );
    }
    let mut measures = Vec::with_capacity(document.measure_definitions.len());
    for definition in &document.measure_definitions {
        let Some(content) = part
            .measure_contents
            .iter()
            .find(|content| content.measure_id == definition.id)
        else {
            return playback_unsupported(
                document,
                document_version,
                "playback.measure-content-invalid",
                "小节内容不完整，暂时无法播放",
            );
        };
        let Some(voice) = content.voices.first() else {
            return playback_unsupported(
                document,
                document_version,
                "playback.voice-unsupported",
                "第一版播放暂只支持每小节一个声部",
            );
        };
        if content.voices.len() != 1 {
            return playback_unsupported(
                document,
                document_version,
                "playback.voice-unsupported",
                "第一版播放暂只支持每小节一个声部",
            );
        }
        let mut events = Vec::with_capacity(voice.sequence.events.len());
        for event in &voice.sequence.events {
            let Some(event_duration) = playback_duration(&event.duration) else {
                return playback_unsupported(
                    document,
                    document_version,
                    "playback.rhythm-unsupported",
                    "当前节奏暂不支持播放",
                );
            };
            let content = match &event.content {
                RhythmicContentV1::Rest => PlaybackSourceContent::Rest,
                RhythmicContentV1::Notes { notes } if notes.len() == 1 => {
                    let Some(written_pitch) = pitch(notes[0].written_pitch.clone()) else {
                        return playback_unsupported(
                            document,
                            document_version,
                            "playback.pitch-invalid",
                            "乐谱包含无法播放的音高",
                        );
                    };
                    PlaybackSourceContent::Note { written_pitch }
                }
                _ => {
                    return playback_unsupported(
                        document,
                        document_version,
                        "playback.chord-unsupported",
                        "第一版播放暂不支持和弦",
                    );
                }
            };
            let Ok(id) = id_text(&event.id) else {
                return playback_unsupported(
                    document,
                    document_version,
                    "playback.identifier-invalid",
                    "乐谱包含无法读取的事件标识",
                );
            };
            events.push(PlaybackSourceEvent {
                id,
                duration: event_duration,
                content,
            });
        }
        let Ok(id) = id_text(&definition.id) else {
            return playback_unsupported(
                document,
                document_version,
                "playback.identifier-invalid",
                "乐谱包含无法读取的小节标识",
            );
        };
        measures.push(PlaybackSourceMeasure {
            id,
            meter: Meter {
                numerator: definition.meter.numerator.get(),
                denominator: definition.meter.denominator.get(),
            },
            voice_start: exact_fraction(&voice.sequence.start),
            events,
        });
    }
    let Ok(document_id) = id_text(&document.id) else {
        return playback_unsupported(
            document,
            document_version,
            "playback.identifier-invalid",
            "乐谱包含无法读取的文档标识",
        );
    };
    PlaybackSourceProjection::Ready {
        projection_version: 1,
        document_id,
        document_version,
        bpm: document.metadata.tempo.bpm.get(),
        written_to_sounding: PlaybackTransposition {
            diatonic_steps: part.instrument.written_to_sounding.diatonic_steps.get(),
            chromatic_semitones: part
                .instrument
                .written_to_sounding
                .chromatic_semitones
                .get(),
        },
        measures,
    }
}

fn project_notation(document: &ScoreDocumentV1, warnings: &[CoreRuleWarningV1]) -> NotationView {
    let Some(part) = document.parts.first() else {
        return unsupported("当前视图暂只支持单谱表的高音五线谱，文档已保留。");
    };
    let Some(staff) = part.staves.first() else {
        return unsupported("当前视图暂只支持单谱表的高音五线谱，文档已保留。");
    };
    if document.parts.len() != 1
        || part.staves.len() != 1
        || staff.line_count.get() != 5
        || !matches!(
            staff.default_clef.sign,
            brilliant_score_foundation::ClefSignV1::G
        )
        || staff.default_clef.line.get() != 2
    {
        return unsupported("当前视图暂只支持单谱表的高音五线谱，文档已保留。");
    }
    if !document.extensions.is_empty()
        || document
            .measure_definitions
            .iter()
            .any(|measure| measure.pickup_duration.is_some())
    {
        return unsupported("当前视图尚不能完整显示这份乐谱的内容，文档已保留。");
    }
    let mut measures = Vec::with_capacity(document.measure_definitions.len());
    for definition in &document.measure_definitions {
        let Some(content) = part
            .measure_contents
            .iter()
            .find(|content| content.measure_id == definition.id)
        else {
            return unsupported("小节内容不完整，暂时无法显示谱面。");
        };
        let Some(voice) = content.voices.first() else {
            return unsupported("当前视图暂只支持从小节起点开始的单声部，文档已保留。");
        };
        if content.voices.len() != 1
            || voice.default_staff_id != staff.id
            || voice.sequence.start.numerator.get() != 0
        {
            return unsupported("当前视图暂只支持从小节起点开始的单声部，文档已保留。");
        }
        let mut events = Vec::with_capacity(voice.sequence.events.len());
        for event in &voice.sequence.events {
            if event
                .staff_id
                .as_ref()
                .is_some_and(|event_staff| event_staff != &staff.id)
            {
                return unsupported("暂不支持该节奏或跨谱表内容，文档已保留。");
            }
            let Some(event_duration) = duration(&event.duration) else {
                return unsupported("暂只支持 C2–B6 单音、基础升降号和常用时值，文档已保留。");
            };
            let content = match &event.content {
                RhythmicContentV1::Rest => InputContent::Rest,
                RhythmicContentV1::Notes { notes } if notes.len() == 1 => {
                    let Some(pitch) = pitch(notes[0].written_pitch.clone()) else {
                        return unsupported(
                            "暂只支持 C2–B6 单音、基础升降号和常用时值，文档已保留。",
                        );
                    };
                    if !(2..=6).contains(&pitch.octave) || !(-1..=1).contains(&pitch.alter) {
                        return unsupported(
                            "暂只支持 C2–B6 单音、基础升降号和常用时值，文档已保留。",
                        );
                    }
                    InputContent::Note { pitch }
                }
                _ => {
                    return unsupported("暂只支持 C2–B6 单音、基础升降号和常用时值，文档已保留。");
                }
            };
            let Ok(id) = id_text(&event.id) else {
                return unsupported("文档包含当前界面无法显示的标识，文档已保留。");
            };
            events.push(StaffEvent {
                id,
                duration: event_duration,
                content,
            });
        }
        let (Ok(id), Ok(voice_id)) = (id_text(&definition.id), id_text(&voice.id)) else {
            return unsupported("文档包含当前界面无法显示的标识，文档已保留。");
        };
        measures.push(StaffMeasure {
            id,
            voice_id,
            meter: Meter {
                numerator: definition.meter.numerator.get(),
                denominator: definition.meter.denominator.get(),
            },
            events,
            rule_warnings: warnings
                .iter()
                .filter(|warning| {
                    warning.part_id == part.id
                        && warning.measure_id == definition.id
                        && warning.voice_id == voice.id
                })
                .map(|warning| StaffRuleWarning {
                    code: warning.code.as_str(),
                    nominal_duration: exact_fraction(&warning.nominal_duration),
                    actual_duration: exact_fraction(&warning.actual_duration),
                    overflow: exact_fraction(&warning.overflow),
                })
                .collect(),
        });
    }
    let (Ok(part_id), Ok(staff_id)) = (id_text(&part.id), id_text(&staff.id)) else {
        return unsupported("文档包含当前界面无法显示的标识，文档已保留。");
    };
    NotationView::Staff {
        part_id,
        staff_id,
        clef: "treble",
        measures,
    }
}

fn duration_units(value: EventDuration) -> Option<u16> {
    if value.base == 0 || 64 % u16::from(value.base) != 0 || value.dots > 1 {
        return None;
    }
    let base = 64 / u16::from(value.base);
    Some(if value.dots == 1 {
        base + base / 2
    } else {
        base
    })
}

fn rest_durations(mut units: u16) -> Result<Vec<EventDuration>, HostError> {
    let mut result = Vec::new();
    for base in [1_u8, 2, 4, 8, 16, 32] {
        let size = 64 / u16::from(base);
        while units >= size {
            result.push(EventDuration { base, dots: 0 });
            units -= size;
        }
    }
    if units != 0 {
        return Err(HostError::new("输入位置无法用支持的休止符表示", 422));
    }
    Ok(result)
}

fn execute_edit(
    session: &mut KernelSession,
    current: &ScoreSessionRead,
    action: &ScoreEditAction,
) -> Result<(), HostError> {
    match action {
        ScoreEditAction::Undo => execute_operation(session, json!({ "kind": "undo" })),
        ScoreEditAction::Redo => execute_operation(session, json!({ "kind": "redo" })),
        ScoreEditAction::SetTitle { title } => {
            let document = read_state(session)?.snapshot.document;
            let metadata = json!({
                "title": if title.trim().is_empty() { "未命名乐谱" } else { title.trim() },
                "authors": document.metadata.authors,
                "tempo": document.metadata.tempo,
            });
            submit_command(
                session,
                json!({
                    "commandVersion": 1,
                    "commandId": "core.document.set-metadata",
                    "target": { "kind": "document", "documentId": current.document_id },
                    "payload": { "metadata": metadata }
                }),
            )
        }
        ScoreEditAction::DeleteEvent {
            event_id,
            time_policy,
        } => delete_event(session, current, event_id, *time_policy),
        ScoreEditAction::SetEventProperties {
            event_id,
            properties,
        } => set_event_properties(session, current, event_id, properties),
        ScoreEditAction::Append {
            measure_id,
            anchor,
            offset_units,
            duration,
            content,
        } => append_event(
            session,
            current,
            measure_id,
            anchor,
            *offset_units,
            *duration,
            content,
        ),
    }
}

fn execute_operation(session: &mut KernelSession, operation: Value) -> Result<(), HostError> {
    let bytes = serde_json::to_vec(&json!({ "apiVersion": 1, "operation": operation }))
        .map_err(|_| HostError::internal())?;
    match session.operate_stage4_bytes(&bytes) {
        KernelStage4OperationResultV1::Command(result) => command_result(result),
        _ => Err(HostError::internal()),
    }
}

fn submit_command(session: &mut KernelSession, command: Value) -> Result<(), HostError> {
    execute_operation(session, json!({ "kind": "submit", "command": command }))
}

fn command_result(result: KernelStage4CommandResultV1) -> Result<(), HostError> {
    match result {
        KernelStage4CommandResultV1::Committed { .. }
        | KernelStage4CommandResultV1::NoOp { .. } => Ok(()),
        KernelStage4CommandResultV1::Rejected { failure, .. } => {
            let failure_value = serde_json::to_value(&failure).ok();
            let code = failure_value
                .as_ref()
                .and_then(failure_code)
                .unwrap_or("command-rejected");
            Err(HostError::issue(
                format!("core.{code}"),
                "内核拒绝了这次修改，乐谱保持原状",
                422,
                WorkbenchIssueSource::Core,
                WorkbenchIssueTarget::Workbench,
                None,
            ))
        }
    }
}

fn failure_code(value: &Value) -> Option<&str> {
    let code = value.get("code")?.as_str()?;
    if code == "command.batch-child-rejected" {
        return value.get("failure").and_then(failure_code).or(Some(code));
    }
    Some(code)
}

fn action_target(current: &ScoreSessionRead, action: &ScoreEditAction) -> WorkbenchIssueTarget {
    match action {
        ScoreEditAction::Append { measure_id, .. } => WorkbenchIssueTarget::Measure {
            measure_id: measure_id.clone(),
            event_id: None,
        },
        ScoreEditAction::DeleteEvent { event_id, .. }
        | ScoreEditAction::SetEventProperties { event_id, .. } => {
            if let NotationView::Staff { measures, .. } = &current.notation
                && let Some(measure) = measures
                    .iter()
                    .find(|measure| measure.events.iter().any(|event| &event.id == event_id))
            {
                return WorkbenchIssueTarget::Event {
                    measure_id: measure.id.clone(),
                    event_id: event_id.clone(),
                };
            }
            WorkbenchIssueTarget::Workbench
        }
        _ => WorkbenchIssueTarget::Workbench,
    }
}

fn find_event<'a>(
    document: &'a ScoreDocumentV1,
    event_id: &str,
) -> Option<(
    &'a brilliant_score_foundation::PartMeasureContentV1,
    &'a brilliant_score_foundation::VoiceV1,
    usize,
)> {
    for part in &document.parts {
        for content in &part.measure_contents {
            for voice in &content.voices {
                if let Some(index) = voice
                    .sequence
                    .events
                    .iter()
                    .position(|event| id_text(&event.id).ok().as_deref() == Some(event_id))
                {
                    return Some((content, voice, index));
                }
            }
        }
    }
    None
}

fn delete_event(
    session: &mut KernelSession,
    current: &ScoreSessionRead,
    event_id: &str,
    time_policy: crate::dto::DeleteTimePolicy,
) -> Result<(), HostError> {
    let document = read_state(session)?.snapshot.document;
    let Some((_content, voice, index)) = find_event(&document, event_id) else {
        return Err(HostError::issue(
            "editor.selection-stale",
            "选中内容已不存在，请重新选择",
            409,
            WorkbenchIssueSource::Editor,
            action_target(
                current,
                &ScoreEditAction::DeleteEvent {
                    event_id: event_id.into(),
                    time_policy,
                },
            ),
            None,
        ));
    };
    let event = &voice.sequence.events[index];
    let remove = json!({ "commandVersion": 1, "commandId": "core.event.remove", "target": { "kind": "event", "eventId": event_id }, "payload": {} });
    if matches!(event.content, RhythmicContentV1::Rest)
        || time_policy == crate::dto::DeleteTimePolicy::Collapse
    {
        return submit_command(session, remove);
    }
    let anchor = index.checked_sub(1).map_or_else(
        || json!({ "kind": "start" }),
        |previous| json!({ "kind": "after-event", "eventId": id_text(&voice.sequence.events[previous].id).unwrap_or_default() }),
    );
    let insert = json!({
        "commandVersion": 1,
        "commandId": "core.voice.insert-rest-event",
        "target": { "kind": "voice", "voiceId": id_text(&voice.id)? },
        "payload": { "anchor": anchor, "event": { "id": event_id, "duration": event.duration, "content": { "kind": "rest" } } }
    });
    submit_command(
        session,
        json!({
            "commandVersion": 1,
            "commandId": "core.transaction.batch",
            "target": { "kind": "document", "documentId": current.document_id },
            "payload": { "commands": [remove, insert] }
        }),
    )
}

fn set_event_properties(
    session: &mut KernelSession,
    current: &ScoreSessionRead,
    event_id: &str,
    properties: &crate::dto::EventProperties,
) -> Result<(), HostError> {
    let document = read_state(session)?.snapshot.document;
    let Some((measure_content, voice, index)) = find_event(&document, event_id) else {
        return Err(HostError::issue(
            "editor.selection-stale",
            "选中内容已不存在，请重新选择",
            409,
            WorkbenchIssueSource::Editor,
            WorkbenchIssueTarget::Workbench,
            None,
        ));
    };
    let event = &voice.sequence.events[index];
    let note = match &event.content {
        RhythmicContentV1::Notes { notes } if notes.len() == 1 => Some(&notes[0]),
        RhythmicContentV1::Rest => None,
        _ => return Err(HostError::new("当前内容暂不支持属性编辑", 422)),
    };
    if matches!(properties.content, InputContent::Note { .. }) != note.is_some() {
        return Err(editor_event_error(
            "editor.event-kind-change-unsupported",
            "属性编辑不能切换音符和休止符类型",
            measure_content,
            event_id,
        )?);
    }
    let old_units = duration(&event.duration)
        .and_then(duration_units)
        .ok_or_else(|| HostError::new("当前时值暂不支持编辑", 422))?;
    let new_units =
        duration_units(properties.duration).ok_or_else(|| HostError::new("输入时值无效", 400))?;
    let following = &voice.sequence.events[index + 1..];
    let next_note = following
        .iter()
        .position(|item| matches!(item.content, RhythmicContentV1::Notes { .. }));
    let rests = next_note.map_or(following, |offset| &following[..offset]);
    let rest_units = rests
        .iter()
        .map(|rest| duration(&rest.duration).and_then(duration_units))
        .collect::<Option<Vec<_>>>()
        .ok_or_else(|| HostError::new("当前时值暂不支持编辑", 422))?
        .into_iter()
        .sum::<u16>();
    let mut commands = Vec::new();
    for rest in rests {
        commands.push(json!({ "commandVersion": 1, "commandId": "core.event.remove", "target": { "kind": "event", "eventId": id_text(&rest.id)? }, "payload": {} }));
    }
    commands.push(json!({ "commandVersion": 1, "commandId": "core.event.set-note-value", "target": { "kind": "event", "eventId": event_id }, "payload": { "noteValue": properties.duration } }));
    let gap = if next_note.is_some() || !rests.is_empty() {
        (old_units + rest_units).saturating_sub(new_units)
    } else {
        0
    };
    let mut anchor_id = event_id.to_string();
    for (offset, rest_duration) in rest_durations(gap)?.into_iter().enumerate() {
        let id = rests
            .get(offset)
            .map(|rest| id_text(&rest.id))
            .transpose()?
            .unwrap_or_else(|| Uuid::new_v4().to_string());
        commands.push(json!({
            "commandVersion": 1, "commandId": "core.voice.insert-rest-event",
            "target": { "kind": "voice", "voiceId": id_text(&voice.id)? },
            "payload": { "anchor": { "kind": "after-event", "eventId": anchor_id }, "event": { "id": id, "duration": rest_duration, "content": { "kind": "rest" } } }
        }));
        anchor_id = id;
    }
    if let (Some(note), InputContent::Note { pitch }) = (note, &properties.content) {
        commands.push(json!({
            "commandVersion": 1, "commandId": "core.note.set-written-pitch",
            "target": { "kind": "note", "noteId": id_text(&note.id)? },
            "payload": { "writtenPitch": pitch }
        }));
    }
    submit_command(
        session,
        json!({
            "commandVersion": 1, "commandId": "core.transaction.batch",
            "target": { "kind": "document", "documentId": current.document_id },
            "payload": { "commands": commands }
        }),
    )
}

fn editor_event_error(
    code: &str,
    message: &str,
    content: &brilliant_score_foundation::PartMeasureContentV1,
    event_id: &str,
) -> Result<HostError, HostError> {
    Ok(HostError::issue(
        code,
        message,
        422,
        WorkbenchIssueSource::Editor,
        WorkbenchIssueTarget::Event {
            measure_id: id_text(&content.measure_id)?,
            event_id: event_id.into(),
        },
        None,
    ))
}

fn append_event(
    session: &mut KernelSession,
    current: &ScoreSessionRead,
    measure_id: &str,
    anchor: &InputSequenceAnchor,
    requested_offset: Option<u16>,
    event_duration: EventDuration,
    content: &InputContent,
) -> Result<(), HostError> {
    let document = read_state(session)?.snapshot.document;
    let Some(part) = document.parts.first() else {
        return Err(HostError::new("当前乐谱格式尚不支持编辑", 422));
    };
    let measure = document
        .measure_definitions
        .iter()
        .find(|item| id_text(&item.id).ok().as_deref() == Some(measure_id))
        .ok_or_else(|| {
            position_error(
                "editor.position-missing",
                "输入位置不存在，请重新选择小节",
                measure_id,
                422,
            )
        })?;
    let voice = part
        .measure_contents
        .iter()
        .find(|item| id_text(&item.measure_id).ok().as_deref() == Some(measure_id))
        .and_then(|item| item.voices.first())
        .ok_or_else(|| {
            position_error(
                "editor.position-missing",
                "输入位置不存在，请重新选择小节",
                measure_id,
                422,
            )
        })?;
    let anchor_index = match anchor {
        InputSequenceAnchor::Start => None,
        InputSequenceAnchor::AfterEvent { event_id } => Some(
            voice
                .sequence
                .events
                .iter()
                .position(|event| id_text(&event.id).ok().as_deref() == Some(event_id))
                .ok_or_else(|| {
                    position_error(
                        "editor.position-stale",
                        "输入位置已改变，请重新定位",
                        measure_id,
                        409,
                    )
                })?,
        ),
    };
    let anchor_offset = voice.sequence.events[..anchor_index.map_or(0, |index| index + 1)]
        .iter()
        .map(|event| duration(&event.duration).and_then(duration_units))
        .collect::<Option<Vec<_>>>()
        .ok_or_else(|| HostError::new("当前时值暂不支持编辑", 422))?
        .into_iter()
        .sum::<u16>();
    let used = voice
        .sequence
        .events
        .iter()
        .map(|event| duration(&event.duration).and_then(duration_units))
        .collect::<Option<Vec<_>>>()
        .ok_or_else(|| HostError::new("当前时值暂不支持编辑", 422))?
        .into_iter()
        .sum::<u16>();
    let requested_offset = requested_offset.unwrap_or(anchor_offset);
    let capacity =
        u16::try_from(64_i64 * measure.meter.numerator.get() / measure.meter.denominator.get())
            .map_err(|_| HostError::internal())?;
    let gap = requested_offset.saturating_sub(anchor_offset);
    if requested_offset < anchor_offset || gap > 0 && anchor_offset != used {
        return Err(position_error(
            "editor.position-stale",
            "输入位置不再可用，请重新选择节拍位置",
            measure_id,
            409,
        ));
    }
    let new_units =
        duration_units(event_duration).ok_or_else(|| HostError::new("输入时值无效", 400))?;
    let projected = used + gap + new_units;
    let mut commands = Vec::new();
    let mut insertion_anchor = match anchor {
        InputSequenceAnchor::Start => json!({ "kind": "start" }),
        InputSequenceAnchor::AfterEvent { event_id } => {
            json!({ "kind": "after-event", "eventId": event_id })
        }
    };
    for rest in rest_durations(gap)? {
        let id = Uuid::new_v4().to_string();
        commands.push(json!({
            "commandVersion": 1, "commandId": "core.voice.insert-rest-event",
            "target": { "kind": "voice", "voiceId": id_text(&voice.id)? },
            "payload": { "anchor": insertion_anchor, "event": { "id": id, "duration": rest, "content": { "kind": "rest" } } }
        }));
        insertion_anchor = json!({ "kind": "after-event", "eventId": id });
    }
    let event_id = Uuid::new_v4().to_string();
    let insert = match content {
        InputContent::Rest => json!({
            "commandVersion": 1, "commandId": "core.voice.insert-rest-event",
            "target": { "kind": "voice", "voiceId": id_text(&voice.id)? },
            "payload": { "anchor": insertion_anchor, "event": { "id": event_id, "duration": event_duration, "content": { "kind": "rest" } } }
        }),
        InputContent::Note { pitch } => json!({
            "commandVersion": 1, "commandId": "core.voice.insert-notes-event",
            "target": { "kind": "voice", "voiceId": id_text(&voice.id)? },
            "payload": { "anchor": insertion_anchor, "event": { "id": event_id, "duration": event_duration, "content": { "kind": "notes", "notes": [{ "id": Uuid::new_v4().to_string(), "writtenPitch": pitch }] } } }
        }),
    };
    commands.push(insert);
    if document
        .measure_definitions
        .last()
        .is_some_and(|last| last.id == measure.id)
        && projected == capacity
    {
        let next_measure = Uuid::new_v4().to_string();
        commands.push(json!({
            "commandVersion": 1, "commandId": "core.measure.insert",
            "target": { "kind": "document", "documentId": current.document_id },
            "payload": {
                "anchor": { "kind": "after-measure", "measureId": measure_id },
                "definition": { "id": next_measure, "meter": measure.meter },
                "contents": [{ "partId": id_text(&part.id)?, "voices": [{ "id": Uuid::new_v4().to_string(), "defaultStaffId": id_text(&voice.default_staff_id)?, "sequence": { "start": { "numerator": 0, "denominator": 1 }, "events": [] } }] }]
            }
        }));
    }
    if commands.len() == 1 {
        submit_command(session, commands.pop().expect("one command"))
    } else {
        submit_command(
            session,
            json!({
                "commandVersion": 1, "commandId": "core.transaction.batch",
                "target": { "kind": "document", "documentId": current.document_id },
                "payload": { "commands": commands }
            }),
        )
    }
}

fn position_error(code: &str, message: &str, measure_id: &str, status: u16) -> HostError {
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

#[cfg(test)]
mod tests;
