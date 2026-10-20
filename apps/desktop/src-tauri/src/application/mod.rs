use std::collections::{HashMap, VecDeque};
use std::path::{Path, PathBuf};

use brilliant_core_types::StableId;
use brilliant_kernel_contracts::{
    KernelRuleWarningReadFailureV1, KernelSelectorResultV1, KernelSelectorValueV1,
    KernelSessionCreateRequestV1, KernelSessionReadResultV1, KernelStage4FailureV1,
    MeasurePointKindV1, MeasurePointV1, ScoreRangeSelectionV1, ScoreRangeV1, SelectorRequestV1,
};
use brilliant_score_foundation::{
    CoreRuleWarningV1, FractionV1, LosslessEncode, NoteValueV1, PitchStepV1, RhythmicContentV1,
    ScoreDocumentV1, decode_lossless_json, decode_lossless_score_document_value,
};
use notation_session::NotationSession;
use serde_json::{Value, json};
use uuid::Uuid;

use crate::{
    dto::{
        CreateScoreRequest, DocumentReplacementPrecondition, EventDuration, ExactFraction,
        GuardedCreateScoreRequest, InputContent, InputSequenceAnchor, Meter, NativeFileResult,
        NewScoreInput, NotationView, PitchStep, PlaybackSourceContent, PlaybackSourceEvent,
        PlaybackSourceMeasure, PlaybackSourceProjection, PlaybackTransposition, ScoreEditAction,
        ScoreEditRequest, ScoreMeasureIndexV1, ScoreMeasureRangeMeasureV1, ScoreMeasureRangeV1,
        ScoreMetadataTransactionChangeSetV1, ScoreMetadataV1, ScoreSessionRead, ScoreStructureV1,
        ScoreSummaryV1, ScoreTempoChangeSetV1, StaffEvent, StaffMeasure, StaffRuleWarning,
        WorkbenchIssueSource, WorkbenchIssueTarget,
    },
    error::HostError,
    score_change_set,
};

const MAX_WORKSPACES: usize = 32;
mod key_signature;
mod domain_value;
mod guitar_domain;
mod official_domains;
mod tablature_projection;
mod fretted_position;
mod document_metadata;
mod measure_structure;
mod notation_session;
mod range_clipboard;
mod staff_clef;
const MAX_RETAINED_REQUESTS: usize = 64;

struct SessionEntry {
    instance_id: Uuid,
    session: NotationSession,
    measure_index: ScoreMeasureIndexV1,
    create_request_id: String,
    create_input_key: String,
    create_precondition: Option<DocumentReplacementPrecondition>,
    edits: HashMap<String, (String, u64)>,
    edit_order: VecDeque<String>,
    file_path: Option<PathBuf>,
    saved_version: Option<u64>,
}

impl SessionEntry {
    fn read(&self) -> Result<ScoreSessionRead, HostError> {
        let mut read = session_read(&self.session)?;
        self.attach_persistence(&mut read)?;
        Ok(read)
    }

    fn attach_persistence(&self, read: &mut ScoreSessionRead) -> Result<(), HostError> {
        read.persistence = Some(crate::dto::ScorePersistenceState {
            session_id: self.instance_id.to_string(),
            saved_version: self.saved_version,
            dirty: read_state(&self.session)?.dirty,
        });
        Ok(())
    }
}

/// Host-created identity and bytes captured before the save dialog opens.
/// A reopened document must not inherit an earlier session's save request.
pub struct SaveSnapshot {
    document_json: String,
    document_id: String,
    document_version: u64,
    instance_id: Uuid,
    file_path: Option<PathBuf>,
    saved_version: Option<u64>,
}

impl SaveSnapshot {
    pub fn file_path(&self) -> Option<PathBuf> {
        self.file_path.clone()
    }
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
            return Err(HostError::issue(
                "score.measure-index-stale",
                "小节索引与当前文档版本不一致",
                409,
                WorkbenchIssueSource::Host,
                WorkbenchIssueTarget::Workbench,
                Some(true),
            ));
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

    pub fn prepare_tempo_change(
        &self,
        workspace_id: &str,
        expected_document_id: &str,
        expected_document_version: u64,
        tempo_bpm: f64,
    ) -> Result<Option<ScoreTempoChangeSetV1>, HostError> {
        if !valid_change_set_document_id(expected_document_id)
            || !tempo_bpm.is_finite()
            || tempo_bpm <= 0.0
        {
            return Err(score_change_set_error(
                "capability.invalid-input",
                "作品速度格式无效",
                422,
                false,
            ));
        }
        let Some(current) = self.read_metadata(workspace_id)? else {
            return Ok(None);
        };
        if current.document_id != expected_document_id
            || current.document_version != expected_document_version
        {
            return Err(score_change_set_error(
                "score.document-version-conflict",
                "乐谱版本已经变化，请重新准备变更",
                409,
                true,
            ));
        }
        if current.tempo_bpm == tempo_bpm {
            return Err(score_change_set_error(
                "score.change-set-empty",
                "目标速度与当前速度相同，无需修改",
                422,
                false,
            ));
        }
        Ok(Some(score_change_set::tempo_change_set(
            &current, tempo_bpm,
        )))
    }

    pub fn prepare_metadata_transaction(
        &self,
        workspace_id: &str,
        expected_document_id: &str,
        expected_document_version: u64,
        title: Option<String>,
        tempo_bpm: Option<f64>,
    ) -> Result<Option<ScoreMetadataTransactionChangeSetV1>, HostError> {
        if !valid_change_set_document_id(expected_document_id)
            || title.is_none() && tempo_bpm.is_none()
            || title.as_ref().is_some_and(|value| {
                value.trim() != value || value.is_empty() || value.encode_utf16().count() > 120
            })
            || tempo_bpm.is_some_and(|value| !value.is_finite() || value <= 0.0)
        {
            return Err(score_change_set_error(
                "capability.invalid-input",
                "作品元数据格式无效",
                422,
                false,
            ));
        }
        let Some(current) = self.read_metadata(workspace_id)? else {
            return Ok(None);
        };
        if current.document_id != expected_document_id
            || current.document_version != expected_document_version
        {
            return Err(score_change_set_error(
                "score.document-version-conflict",
                "乐谱版本已经变化，请重新准备事务",
                409,
                true,
            ));
        }
        let change_set =
            score_change_set::metadata_transaction_change_set(&current, title, tempo_bpm);
        if change_set.operations.is_empty() {
            return Err(score_change_set_error(
                "score.change-set-empty",
                "目标元数据与当前内容相同，无需修改",
                422,
                false,
            ));
        }
        Ok(Some(change_set))
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
                    return Err(HostError::issue(
                        "score.measure-range-invalid",
                        "小节范围超过本次调用上限",
                        422,
                        WorkbenchIssueSource::Host,
                        WorkbenchIssueTarget::Workbench,
                        Some(false),
                    ));
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
            .map(SessionEntry::read)
            .transpose()
    }

    pub fn create(&mut self, request: CreateScoreRequest) -> Result<ScoreSessionRead, HostError> {
        self.create_checked(request, None)
    }

    pub fn create_guarded(
        &mut self,
        request: GuardedCreateScoreRequest,
    ) -> Result<ScoreSessionRead, HostError> {
        let expected_document_id = match &request.expected {
            DocumentReplacementPrecondition::Empty {} => None,
            DocumentReplacementPrecondition::Document { document_id, .. } => {
                Some(document_id.clone())
            }
        };
        self.create_checked(
            CreateScoreRequest {
                workspace_id: request.workspace_id,
                input: request.input,
                request_id: request.request_id,
                expected_document_id,
            },
            Some(request.expected),
        )
    }

    fn create_checked(
        &mut self,
        request: CreateScoreRequest,
        expected: Option<DocumentReplacementPrecondition>,
    ) -> Result<ScoreSessionRead, HostError> {
        validate_workspace_id(&request.workspace_id)?;
        validate_request_id(&request.request_id)?;
        validate_new_score(&request.input)?;
        if let Some(expected) = &expected {
            validate_replacement_precondition(expected)?;
        }
        let input_key = serde_json::to_string(&request.input).map_err(|_| HostError::internal())?;
        if let Some(current) = self.sessions.get(&request.workspace_id)
            && current.create_request_id == request.request_id
        {
            if current.create_input_key != input_key || current.create_precondition != expected {
                return Err(HostError::new("创建参数已改变，请重新打开新建窗口", 409));
            }
            return current.read();
        }
        if let Some(expected) = &expected {
            self.check_replacement(&request.workspace_id, expected)?;
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
        let entry = SessionEntry {
            instance_id: Uuid::new_v4(),
            session,
            measure_index: projection.measure_index,
            create_request_id: request.request_id,
            create_input_key: input_key,
            create_precondition: expected,
            edits: HashMap::new(),
            edit_order: VecDeque::new(),
            file_path: None,
            saved_version: None,
        };
        let mut read = projection.read;
        entry.attach_persistence(&mut read)?;
        self.sessions.insert(request.workspace_id, entry);
        Ok(read)
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
        let current = entry.read()?;
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
        if matches!(current.notation, NotationView::Unsupported { .. })
            && !matches!(request.action, ScoreEditAction::SetMeasureMeter { .. })
            && !matches!(request.action, ScoreEditAction::SetFrettedPosition { .. })
            && !(matches!(request.action, ScoreEditAction::Undo | ScoreEditAction::Redo)
                && matches!(current.tablature, crate::dto::TablatureProjection::Tablature { .. }))
        {
            return Err(HostError::new("当前乐谱格式尚不支持编辑", 422));
        }
        execute_edit(&mut entry.session, &current, &request.action)?;
        let projection = session_projection(&entry.session)?;
        let mut result = projection.read;
        entry.attach_persistence(&mut result)?;
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
        let accepted = NotationSession::create(KernelSessionCreateRequestV1 {
            api_version: 1,
            document,
        })
        .map_err(|_| HostError::new("无法打开该乐谱文件", 422))?;
        let projection = session_projection(&accepted)?;
        let entry = SessionEntry {
            instance_id: Uuid::new_v4(),
            session: accepted,
            measure_index: projection.measure_index,
            create_request_id: Uuid::new_v4().to_string(),
            create_input_key: "import".into(),
            create_precondition: None,
            edits: HashMap::new(),
            edit_order: VecDeque::new(),
            file_path: None,
            saved_version: None,
        };
        let mut read = projection.read;
        entry.attach_persistence(&mut read)?;
        self.sessions.insert(workspace_id, entry);
        Ok(read)
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

    pub fn export_snapshot(&self, workspace_id: &str) -> Result<SaveSnapshot, HostError> {
        let document_json = self.export_document(workspace_id)?;
        let entry = self
            .sessions
            .get(workspace_id)
            .ok_or_else(|| HostError::new("当前没有可保存的乐谱", 404))?;
        let read = entry.read()?;
        Ok(SaveSnapshot {
            document_json,
            document_id: read.document_id,
            document_version: read.document_version,
            instance_id: entry.instance_id,
            file_path: entry.file_path.clone(),
            saved_version: entry.saved_version,
        })
    }

    pub fn save_file(
        &mut self,
        workspace_id: &str,
        path: PathBuf,
        snapshot: &SaveSnapshot,
    ) -> Result<NativeFileResult, HostError> {
        validate_workspace_id(workspace_id)?;
        let entry = self.sessions.get(workspace_id);
        let current = entry.map(SessionEntry::read).transpose()?;
        if !matches!((entry, current.as_ref()), (Some(entry), Some(current))
            if entry.instance_id == snapshot.instance_id
                && current.document_id == snapshot.document_id
                && current.document_version == snapshot.document_version
                && entry.file_path == snapshot.file_path
                && entry.saved_version == snapshot.saved_version)
        {
            return Err(HostError::issue(
                "file.save-stale",
                "乐谱或保存位置在保存期间已改变，未写入文件，请重新保存",
                409,
                WorkbenchIssueSource::File,
                WorkbenchIssueTarget::Component {
                    component_id: "navigation.file".into(),
                },
                Some(true),
            ));
        }
        // The caller holds the service gate across validation, physical write
        // and checkpoint publication. No replacement/edit/save can split it.
        crate::document_io::atomic_write(&path, snapshot.document_json.as_bytes())?;
        self.mark_saved(workspace_id, path, snapshot.document_version)
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
            session: entry.read()?,
            name: file_display_name(&path),
            saved_version,
            warnings: vec![],
        })
    }

    pub fn import_file(
        &mut self,
        workspace_id: String,
        document_json: &str,
        path: PathBuf,
    ) -> Result<NativeFileResult, HostError> {
        let mut session = self.import_document(workspace_id.clone(), document_json)?;
        let entry = self
            .sessions
            .get_mut(&workspace_id)
            .ok_or_else(HostError::internal)?;
        entry.file_path = Some(path.clone());
        entry.saved_version = Some(session.document_version);
        let saved_version = session.document_version;
        entry.attach_persistence(&mut session)?;
        Ok(NativeFileResult {
            session,
            name: file_display_name(&path),
            saved_version,
            warnings: vec![],
        })
    }

    /// The caller holds the service mutex through this check and the original import.
    pub fn check_replacement(
        &self,
        workspace_id: &str,
        expected: &DocumentReplacementPrecondition,
    ) -> Result<(), HostError> {
        validate_workspace_id(workspace_id)?;
        validate_replacement_precondition(expected)?;
        let current = self.read(workspace_id)?;
        let matches = match (expected, current) {
            (DocumentReplacementPrecondition::Empty {}, None) => true,
            (
                DocumentReplacementPrecondition::Document {
                    document_id,
                    document_version,
                },
                Some(current),
            ) => {
                *document_id == current.document_id && *document_version == current.document_version
            }
            _ => false,
        };
        if matches {
            Ok(())
        } else {
            Err(HostError::issue(
                "document.stale",
                "当前作品已改变，请重新读取后重试",
                409,
                WorkbenchIssueSource::Host,
                WorkbenchIssueTarget::Workbench,
                Some(true),
            ))
        }
    }

    pub fn import_file_guarded(
        &mut self,
        workspace_id: String,
        document_json: &str,
        path: PathBuf,
        expected: &DocumentReplacementPrecondition,
    ) -> Result<NativeFileResult, HostError> {
        self.check_replacement(&workspace_id, expected)?;
        self.import_file(workspace_id, document_json, path)
    }
}

fn validate_replacement_precondition(
    expected: &DocumentReplacementPrecondition,
) -> Result<(), HostError> {
    if let DocumentReplacementPrecondition::Document {
        document_id,
        document_version,
    } = expected
        && (!valid_change_set_document_id(document_id) || *document_version > 9_007_199_254_740_991)
    {
        return Err(HostError::new("作品替换预条件无效", 400));
    }
    Ok(())
}

fn mark_persisted(session: &mut NotationSession, document_version: u64) -> Result<(), HostError> {
    let document_id = document_id(session)?;
    let reply = session.operate(json!({"operation":"markPersisted","checkpoint": {
        "documentId":document_id,"documentVersion":document_version
    }}))?;
    match (
        reply["ok"].as_bool(),
        reply["checkpoint"]["status"].as_str(),
    ) {
        (Some(true), Some("updated" | "no-op")) => Ok(()),
        (_, Some("rejected")) => Err(HostError::issue(
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

pub(crate) fn file_display_name(path: &Path) -> String {
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

fn score_change_set_error(code: &str, message: &str, status: u16, retryable: bool) -> HostError {
    HostError::issue(
        code,
        message,
        status,
        WorkbenchIssueSource::Host,
        WorkbenchIssueTarget::Workbench,
        Some(retryable),
    )
}

fn valid_change_set_document_id(value: &str) -> bool {
    !value.is_empty() && value.encode_utf16().count() <= 256
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
        ScoreEditAction::SetFrettedPosition { part_id, event_id, position }
            if part_id.is_empty() || event_id.is_empty()
                || !(1..=32).contains(&position.string_number) || !(0..=9_007_199_254_740_991).contains(&position.fret) => {
            Err(HostError::new("弦品参数无效", 400))
        }
        ScoreEditAction::SetDocumentMetadata { metadata } => document_metadata::validate(metadata),
        ScoreEditAction::SetStaffClef { staff_id, .. } if staff_id.is_empty() => {
            Err(HostError::new("目标谱表无效", 400))
        }
        ScoreEditAction::SetKeySignature { part_id, measure_id, change }
            if part_id.is_empty() || measure_id.is_empty()
                || matches!(change, crate::dto::KeySignatureChange::Set{fifths} if !(-7..=7).contains(fifths)) => {
            Err(HostError::new("调号参数无效",400))
        }
        ScoreEditAction::InsertMeasure { measure_id, .. }
        | ScoreEditAction::RemoveMeasure { measure_id }
        | ScoreEditAction::SetMeasureMeter { measure_id, .. } if measure_id.is_empty() => {
            Err(HostError::new("目标小节无效", 400))
        }
        ScoreEditAction::SetMeasureMeter { meter, .. }
            if !(1..=32).contains(&meter.numerator)
                || ![1, 2, 4, 8, 16, 32, 64].contains(&meter.denominator) => {
            Err(HostError::new("拍号无效", 400))
        }
        ScoreEditAction::DeleteRange { range } if [&range.measure_id, &range.voice_id,
            &range.start_event_id, &range.end_event_id].iter().any(|id| id.is_empty()) => {
            Err(HostError::new("范围参数无效", 400))
        }
        ScoreEditAction::PasteFragment { measure_id, voice_id, anchor, fragment, .. }
            if measure_id.is_empty() || voice_id.is_empty()
                || matches!(anchor, InputSequenceAnchor::AfterEvent { event_id } if event_id.is_empty())
                || fragment.format != "brilliant-guitar.score-events" || fragment.version != 1
                || fragment.events.is_empty() || fragment.events.len() > 100
                || fragment.events.iter().any(|event| !validate_duration(event.duration, matches!(event.content, InputContent::Rest))
                    || matches!(event.content, InputContent::Note { pitch } if !(2..=6).contains(&pitch.octave) || !(-1..=1).contains(&pitch.alter))) => {
            Err(HostError::new("音乐片段无效", 400))
        }
        ScoreEditAction::SetTitle { title } if text_length(title.trim()) > 120 => {
            Err(HostError::new("标题最多 120 个字符", 400))
        }
        ScoreEditAction::SetTempo { tempo_bpm } if !tempo_bpm.is_finite() || *tempo_bpm <= 0.0 => {
            Err(HostError::new("速度必须是大于 0 的有限数值", 400))
        }
        ScoreEditAction::SetMetadata { title, tempo_bpm }
            if text_length(title.trim()) > 120 || !tempo_bpm.is_finite() || *tempo_bpm <= 0.0 =>
        {
            Err(HostError::new("作品元数据无效", 400))
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

fn create_score_session(input: &NewScoreInput) -> Result<NotationSession, HostError> {
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
    let mut session = NotationSession::create(request)
        .map_err(|_| HostError::new("无法建立乐谱编辑会话", 503))?;
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
    NotationSession::create(KernelSessionCreateRequestV1 {
        api_version: 1,
        document,
    })
    .map_err(|_| HostError::new("无法建立乐谱编辑会话", 503))
}

fn read_state(
    session: &NotationSession,
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

fn session_projection(session: &NotationSession) -> Result<SessionProjection, HostError> {
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
            tablature: tablature_projection::project(document, &warnings),
            playback_source: project_playback_source(document, document_version),
            metadata: crate::dto::DocumentMetadataInput {
                title: text(&document.metadata.title)?,
                authors: document.metadata.authors.iter().map(text).collect::<Result<Vec<_>, _>>()?,
                tempo_bpm: document.metadata.tempo.bpm.get(),
            },
            persistence: None,
        },
        measure_index: ScoreMeasureIndexV1 {
            document_id,
            document_version,
            measure_ids,
        },
    })
}

fn session_read(session: &NotationSession) -> Result<ScoreSessionRead, HostError> {
    session_projection(session).map(|projection| projection.read)
}

fn document_id(session: &NotationSession) -> Result<String, HostError> {
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
    if !official_domains::can_project_plain(document)
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
        return unsupported("当前视图暂只支持单谱表五线谱，文档已保留。");
    };
    let Some(staff) = part.staves.first() else {
        return unsupported("当前视图暂只支持单谱表五线谱，文档已保留。");
    };
    if document.parts.len() != 1
        || part.staves.len() != 1
        || staff.line_count.get() != 5
    {
        return unsupported("当前视图暂只支持单谱表五线谱，文档已保留。");
    }
    let Some(clef) = staff_clef::project(&staff.default_clef) else {
        return unsupported("当前视图暂只支持高音、低音、中音或次中音谱号，文档已保留。");
    };
    if !official_domains::can_project_plain(document)
        || document
            .measure_definitions
            .iter()
            .any(|measure| measure.pickup_duration.is_some())
    {
        return unsupported("当前视图尚不能完整显示这份乐谱的内容，文档已保留。");
    }
    let Ok(changes) = key_signature::timeline(document, part.id.as_js_string()) else {
        return unsupported("调号数据不兼容，文档已保留。");
    };
    let mut key_signature_changes = Vec::with_capacity(changes.len());
    for (measure_index, definition) in document.measure_definitions.iter().enumerate() {
        if let Some(change) = changes
            .iter()
            .find(|c| &c.measure_id == definition.id.as_js_string())
        {
            let Ok(measure_id) = change.measure_id.to_utf8() else {
                return unsupported("调号标识无法显示，文档已保留。");
            };
            key_signature_changes.push(crate::dto::KeySignatureChangeView {
                measure_id,
                measure_index,
                fifths: change.fifths,
            });
        }
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
        clef,
        tempo_bpm: document.metadata.tempo.bpm.get(),
        key_signature_changes,
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
    session: &mut NotationSession,
    current: &ScoreSessionRead,
    action: &ScoreEditAction,
) -> Result<(), HostError> {
    match action {
        ScoreEditAction::SetFrettedPosition { part_id, event_id, position } =>
            fretted_position::set(session, part_id, event_id, position),
        ScoreEditAction::SetDocumentMetadata { metadata } => document_metadata::set(session, current, metadata),
        ScoreEditAction::SetStaffClef { staff_id, clef } => staff_clef::set(session, staff_id, *clef),
        ScoreEditAction::Undo => execute_operation(session, json!({ "kind": "undo" })),
        ScoreEditAction::Redo => execute_operation(session, json!({ "kind": "redo" })),
        ScoreEditAction::InsertMeasure {
            measure_id,
            position,
        } => measure_structure::insert(session, current, measure_id, *position),
        ScoreEditAction::RemoveMeasure { measure_id } => {
            measure_structure::remove(session, current, measure_id)
        }
        ScoreEditAction::SetMeasureMeter {
            measure_id,
            meter,
            scope,
        } => measure_structure::set_meter(session, current, measure_id, *meter, *scope),
        ScoreEditAction::SetKeySignature {
            part_id,
            measure_id,
            change,
        } => submit_command(
            session,
            json!({"commandVersion":1,"commandId":key_signature::COMMAND,
                "target":{"kind":"part","partId":part_id},"payload":{"measureId":measure_id,"change":change}}),
        ),
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
        ScoreEditAction::SetTempo { tempo_bpm } => {
            let document = read_state(session)?.snapshot.document;
            let metadata = json!({
                "title": document.metadata.title,
                "authors": document.metadata.authors,
                "tempo": { "bpm": tempo_bpm },
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
        ScoreEditAction::SetMetadata { title, tempo_bpm } => {
            let document = read_state(session)?.snapshot.document;
            let metadata = json!({
                "title": title,
                "authors": document.metadata.authors,
                "tempo": { "bpm": tempo_bpm },
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
        ScoreEditAction::DeleteRange { range } => {
            range_clipboard::delete_range(session, current, range)
        }
        ScoreEditAction::PasteFragment {
            measure_id,
            voice_id,
            anchor,
            offset_units,
            fragment,
        } => range_clipboard::paste_fragment(
            session,
            current,
            measure_id,
            voice_id,
            anchor,
            *offset_units,
            fragment,
        ),
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

fn execute_operation(session: &mut NotationSession, operation: Value) -> Result<(), HostError> {
    let request = match operation["kind"].as_str() {
        Some("submit") => json!({"operation":"submit","command":operation["command"]}),
        Some("undo") => json!({"operation":"undo"}),
        Some("redo") => json!({"operation":"redo"}),
        _ => return Err(HostError::internal()),
    };
    let reply = session.operate(request)?;
    if reply["ok"] == true
        && matches!(
            reply["result"]["status"].as_str(),
            Some("committed" | "no-op")
        )
    {
        return Ok(());
    }
    let failure = reply
        .get("failure")
        .or_else(|| reply.get("result").and_then(|r| r.get("failure")));
    let code = failure
        .and_then(failure_code)
        .ok_or_else(HostError::internal)?;
    Err(HostError::issue(
        format!("core.{code}"),
        "内核拒绝了这次修改，乐谱保持原状",
        422,
        WorkbenchIssueSource::Core,
        WorkbenchIssueTarget::Workbench,
        None,
    ))
}

fn submit_command(session: &mut NotationSession, command: Value) -> Result<(), HostError> {
    execute_operation(session, json!({ "kind": "submit", "command": command }))
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
        ScoreEditAction::SetStaffClef { .. } => WorkbenchIssueTarget::Component {
            component_id: "score-properties".into(),
        },
        ScoreEditAction::Append { measure_id, .. }
        | ScoreEditAction::InsertMeasure { measure_id, .. }
        | ScoreEditAction::RemoveMeasure { measure_id }
        | ScoreEditAction::SetMeasureMeter { measure_id, .. }
        | ScoreEditAction::SetKeySignature { measure_id, .. }
        | ScoreEditAction::PasteFragment { measure_id, .. } => WorkbenchIssueTarget::Measure {
            measure_id: measure_id.clone(),
            event_id: None,
        },
        ScoreEditAction::DeleteRange { range } => WorkbenchIssueTarget::Measure {
            measure_id: range.measure_id.clone(),
            event_id: None,
        },
        ScoreEditAction::DeleteEvent { event_id, .. }
        | ScoreEditAction::SetFrettedPosition { event_id, .. }
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
    session: &mut NotationSession,
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
    session: &mut NotationSession,
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
    session: &mut NotationSession,
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
    let insert = range_clipboard::insert_command(
        &id_text(&voice.id)?,
        &insertion_anchor,
        event_duration,
        content,
    );
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
