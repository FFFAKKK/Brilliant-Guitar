use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use uuid::Uuid;

use crate::{
    application::ScoreSessionService,
    dto::{
        CapabilityDocumentPrecondition, CapabilityTransportRequest, ScoreEditAction,
        ScoreEditRequest, ScoreMeasureIndexV1, ScoreMeasureRangeV1, ScoreMetadataSnapshotV1,
        ScoreMetadataTransactionChangeSetV1, ScoreMetadataTransactionOperationV1,
        ScoreMetadataTransactionUpdateV1, ScoreTempoChangeSetV1, ScoreTempoUpdateV1,
        ScoreTitleUpdateV1,
    },
    error::HostError,
};

const SCORE_READ_SUMMARY_ID: &str = "score.read-summary";
const SCORE_READ_SUMMARY_VERSION: u64 = 1;
const SCORE_READ_METADATA_ID: &str = "score.read-metadata";
const SCORE_READ_METADATA_VERSION: u64 = 1;
const SCORE_READ_STRUCTURE_ID: &str = "score.read-structure";
const SCORE_READ_STRUCTURE_VERSION: u64 = 1;
const SCORE_READ_MEASURE_INDEX_ID: &str = "score.read-measure-index";
const SCORE_READ_MEASURE_INDEX_VERSION: u64 = 1;
const SCORE_READ_MEASURE_RANGE_ID: &str = "score.read-measure-range";
const SCORE_READ_MEASURE_RANGE_VERSION: u64 = 1;
const SCORE_UPDATE_TITLE_ID: &str = "score.update-title";
const SCORE_UPDATE_TITLE_VERSION: u64 = 1;
const SCORE_PREPARE_TEMPO_CHANGE_ID: &str = "score.prepare-tempo-change";
const SCORE_PREPARE_TEMPO_CHANGE_VERSION: u64 = 1;
const SCORE_COMMIT_TEMPO_CHANGE_ID: &str = "score.commit-tempo-change";
const SCORE_COMMIT_TEMPO_CHANGE_VERSION: u64 = 1;
const SCORE_PREPARE_METADATA_TRANSACTION_ID: &str = "score.prepare-metadata-transaction";
const SCORE_PREPARE_METADATA_TRANSACTION_VERSION: u64 = 1;
const SCORE_COMMIT_METADATA_TRANSACTION_ID: &str = "score.commit-metadata-transaction";
const SCORE_COMMIT_METADATA_TRANSACTION_VERSION: u64 = 1;
const SCORE_TEMPO_CHANGE_KIND: &str = "score-tempo";
const SCORE_METADATA_TRANSACTION_KIND: &str = "score-metadata-transaction";
const TEMPO_CHANGE_SET_HASH_DOMAIN: &[u8] = b"brilliant-score-tempo-change-set-v1\0";
const METADATA_TRANSACTION_HASH_DOMAIN: &[u8] = b"brilliant-score-metadata-transaction-v1\0";
const MAX_MEASURE_RANGE: usize = 32;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[allow(dead_code)]
pub enum CapabilityCaller {
    Ui,
    Agent,
    Test,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum CapabilityKind {
    Query,
    Mutation,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CapabilityEffects {
    pub document: &'static str,
    pub filesystem: &'static str,
    pub network: &'static str,
    pub settings: &'static str,
    pub playback: &'static str,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CapabilityDescriptor {
    pub id: &'static str,
    pub contract_version: u64,
    pub owner: &'static str,
    pub kind: CapabilityKind,
    pub effects: CapabilityEffects,
}

pub const SCORE_READ_SUMMARY: CapabilityDescriptor = CapabilityDescriptor {
    id: SCORE_READ_SUMMARY_ID,
    contract_version: SCORE_READ_SUMMARY_VERSION,
    owner: "brilliant.score",
    kind: CapabilityKind::Query,
    effects: CapabilityEffects {
        document: "read",
        filesystem: "none",
        network: "none",
        settings: "none",
        playback: "none",
    },
};

pub const SCORE_READ_METADATA: CapabilityDescriptor = CapabilityDescriptor {
    id: SCORE_READ_METADATA_ID,
    contract_version: SCORE_READ_METADATA_VERSION,
    owner: "brilliant.score",
    kind: CapabilityKind::Query,
    effects: CapabilityEffects {
        document: "read",
        filesystem: "none",
        network: "none",
        settings: "none",
        playback: "none",
    },
};

pub const SCORE_READ_STRUCTURE: CapabilityDescriptor = CapabilityDescriptor {
    id: SCORE_READ_STRUCTURE_ID,
    contract_version: SCORE_READ_STRUCTURE_VERSION,
    owner: "brilliant.score",
    kind: CapabilityKind::Query,
    effects: CapabilityEffects {
        document: "read",
        filesystem: "none",
        network: "none",
        settings: "none",
        playback: "none",
    },
};

pub const SCORE_READ_MEASURE_INDEX: CapabilityDescriptor = CapabilityDescriptor {
    id: SCORE_READ_MEASURE_INDEX_ID,
    contract_version: SCORE_READ_MEASURE_INDEX_VERSION,
    owner: "brilliant.score",
    kind: CapabilityKind::Query,
    effects: CapabilityEffects {
        document: "read",
        filesystem: "none",
        network: "none",
        settings: "none",
        playback: "none",
    },
};

pub const SCORE_READ_MEASURE_RANGE: CapabilityDescriptor = CapabilityDescriptor {
    id: SCORE_READ_MEASURE_RANGE_ID,
    contract_version: SCORE_READ_MEASURE_RANGE_VERSION,
    owner: "brilliant.score",
    kind: CapabilityKind::Query,
    effects: CapabilityEffects {
        document: "read",
        filesystem: "none",
        network: "none",
        settings: "none",
        playback: "none",
    },
};

pub const SCORE_UPDATE_TITLE: CapabilityDescriptor = CapabilityDescriptor {
    id: SCORE_UPDATE_TITLE_ID,
    contract_version: SCORE_UPDATE_TITLE_VERSION,
    owner: "brilliant.score",
    kind: CapabilityKind::Mutation,
    effects: CapabilityEffects {
        document: "write",
        filesystem: "none",
        network: "none",
        settings: "none",
        playback: "none",
    },
};

pub const SCORE_PREPARE_TEMPO_CHANGE: CapabilityDescriptor = CapabilityDescriptor {
    id: SCORE_PREPARE_TEMPO_CHANGE_ID,
    contract_version: SCORE_PREPARE_TEMPO_CHANGE_VERSION,
    owner: "brilliant.score",
    kind: CapabilityKind::Query,
    effects: CapabilityEffects {
        document: "read",
        filesystem: "none",
        network: "none",
        settings: "none",
        playback: "none",
    },
};

pub const SCORE_COMMIT_TEMPO_CHANGE: CapabilityDescriptor = CapabilityDescriptor {
    id: SCORE_COMMIT_TEMPO_CHANGE_ID,
    contract_version: SCORE_COMMIT_TEMPO_CHANGE_VERSION,
    owner: "brilliant.score",
    kind: CapabilityKind::Mutation,
    effects: CapabilityEffects {
        document: "write",
        filesystem: "none",
        network: "none",
        settings: "none",
        playback: "none",
    },
};

pub const SCORE_PREPARE_METADATA_TRANSACTION: CapabilityDescriptor = CapabilityDescriptor {
    id: SCORE_PREPARE_METADATA_TRANSACTION_ID,
    contract_version: SCORE_PREPARE_METADATA_TRANSACTION_VERSION,
    owner: "brilliant.score",
    kind: CapabilityKind::Query,
    effects: CapabilityEffects {
        document: "read",
        filesystem: "none",
        network: "none",
        settings: "none",
        playback: "none",
    },
};

pub const SCORE_COMMIT_METADATA_TRANSACTION: CapabilityDescriptor = CapabilityDescriptor {
    id: SCORE_COMMIT_METADATA_TRANSACTION_ID,
    contract_version: SCORE_COMMIT_METADATA_TRANSACTION_VERSION,
    owner: "brilliant.score",
    kind: CapabilityKind::Mutation,
    effects: CapabilityEffects {
        document: "write",
        filesystem: "none",
        network: "none",
        settings: "none",
        playback: "none",
    },
};

pub const CAPABILITY_CATALOG: &[CapabilityDescriptor] = &[
    SCORE_READ_SUMMARY,
    SCORE_READ_METADATA,
    SCORE_READ_STRUCTURE,
    SCORE_READ_MEASURE_INDEX,
    SCORE_READ_MEASURE_RANGE,
    SCORE_UPDATE_TITLE,
    SCORE_PREPARE_TEMPO_CHANGE,
    SCORE_COMMIT_TEMPO_CHANGE,
    SCORE_PREPARE_METADATA_TRANSACTION,
    SCORE_COMMIT_METADATA_TRANSACTION,
];

#[derive(Clone, Debug)]
pub struct CapabilityInvocation {
    pub invocation_id: String,
    pub capability_id: String,
    pub contract_version: u64,
    pub workspace_id: String,
    pub document_precondition: Option<CapabilityDocumentPrecondition>,
    pub caller: CapabilityCaller,
    pub input: Value,
}

impl CapabilityInvocation {
    pub fn from_transport(request: CapabilityTransportRequest, caller: CapabilityCaller) -> Self {
        Self {
            invocation_id: request.invocation_id,
            capability_id: request.capability_id,
            contract_version: request.contract_version,
            workspace_id: request.workspace_id,
            document_precondition: request.document_precondition,
            caller,
            input: request.input,
        }
    }
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(
    tag = "status",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase"
)]
pub enum CapabilityResult {
    Completed {
        invocation_id: String,
        capability_id: String,
        contract_version: u64,
        data: Value,
    },
    Unavailable {
        invocation_id: String,
        capability_id: String,
        contract_version: u64,
        code: String,
        message: String,
    },
    Rejected {
        invocation_id: String,
        capability_id: String,
        contract_version: u64,
        code: String,
        message: String,
    },
    Failed {
        invocation_id: String,
        capability_id: String,
        contract_version: u64,
        code: String,
        message: String,
    },
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct EmptyInput {}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct MeasureIndexInput {
    expected_document_id: String,
    expected_document_version: u64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct MeasureRangeInput {
    start_measure_id: String,
    end_measure_id: String,
    max_measures: usize,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct UpdateTitleInput {
    title: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PrepareTempoChangeInput {
    tempo_bpm: f64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CommitTempoChangeInput {
    change_set: ScoreTempoChangeSetV1,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct PrepareMetadataTransactionInput {
    title: Option<String>,
    tempo_bpm: Option<f64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CommitMetadataTransactionInput {
    change_set: ScoreMetadataTransactionChangeSetV1,
}

fn valid_stable_id(value: &str) -> bool {
    !value.is_empty() && value.encode_utf16().count() <= 256
}

pub fn invoke(
    service: &mut ScoreSessionService,
    invocation: CapabilityInvocation,
) -> CapabilityResult {
    match invocation.caller {
        CapabilityCaller::Ui | CapabilityCaller::Agent | CapabilityCaller::Test => {}
    }
    let identity = (
        invocation.invocation_id.clone(),
        invocation.capability_id.clone(),
        invocation.contract_version,
    );
    if Uuid::parse_str(&invocation.invocation_id).is_err() {
        return rejected(identity, "capability.invalid-invocation-id", "调用标识无效");
    }
    if Uuid::parse_str(&invocation.workspace_id).is_err() {
        return rejected(identity, "capability.invalid-workspace", "工作区标识无效");
    }

    let Some(descriptor) = CAPABILITY_CATALOG
        .iter()
        .find(|descriptor| descriptor.id == invocation.capability_id)
    else {
        return rejected(identity, "capability.unknown", "能力不存在或未开放");
    };
    if descriptor.id == SCORE_READ_MEASURE_INDEX_ID && invocation.caller == CapabilityCaller::Agent
    {
        return rejected(identity, "capability.unknown", "能力不存在或未开放");
    }
    if matches!(
        descriptor.id,
        SCORE_UPDATE_TITLE_ID
            | SCORE_PREPARE_TEMPO_CHANGE_ID
            | SCORE_COMMIT_TEMPO_CHANGE_ID
            | SCORE_PREPARE_METADATA_TRANSACTION_ID
            | SCORE_COMMIT_METADATA_TRANSACTION_ID
    ) && invocation.caller == CapabilityCaller::Ui
    {
        return rejected(identity, "capability.unknown", "能力不存在或未开放");
    }
    if invocation.contract_version != descriptor.contract_version {
        return rejected(
            identity,
            "capability.unsupported-contract-version",
            "能力合同版本不受支持",
        );
    }

    match descriptor.id {
        SCORE_READ_SUMMARY_ID => {
            if serde_json::from_value::<EmptyInput>(invocation.input).is_err() {
                return rejected(identity, "capability.invalid-input", "能力输入格式无效");
            }
            complete_serialized(
                identity,
                service.read_summary(&invocation.workspace_id),
                "无法读取当前乐谱概要",
            )
        }
        SCORE_READ_METADATA_ID => {
            if serde_json::from_value::<EmptyInput>(invocation.input).is_err() {
                return rejected(identity, "capability.invalid-input", "能力输入格式无效");
            }
            complete_serialized(
                identity,
                service.read_metadata(&invocation.workspace_id),
                "无法读取当前乐谱元数据",
            )
        }
        SCORE_READ_STRUCTURE_ID => {
            if serde_json::from_value::<EmptyInput>(invocation.input).is_err() {
                return rejected(identity, "capability.invalid-input", "能力输入格式无效");
            }
            complete_serialized(
                identity,
                service.read_structure(&invocation.workspace_id),
                "无法读取当前乐谱结构",
            )
        }
        SCORE_READ_MEASURE_INDEX_ID => {
            let Ok(input) = serde_json::from_value::<MeasureIndexInput>(invocation.input) else {
                return rejected(identity, "capability.invalid-input", "能力输入格式无效");
            };
            if !valid_stable_id(&input.expected_document_id) {
                return rejected(identity, "capability.invalid-input", "能力输入格式无效");
            }
            complete_measure_index(
                identity,
                service.read_measure_index(
                    &invocation.workspace_id,
                    &input.expected_document_id,
                    input.expected_document_version,
                ),
            )
        }
        SCORE_READ_MEASURE_RANGE_ID => {
            let Ok(input) = serde_json::from_value::<MeasureRangeInput>(invocation.input) else {
                return rejected(identity, "capability.invalid-input", "能力输入格式无效");
            };
            if !valid_stable_id(&input.start_measure_id)
                || !valid_stable_id(&input.end_measure_id)
                || !(1..=MAX_MEASURE_RANGE).contains(&input.max_measures)
            {
                return rejected(identity, "capability.invalid-input", "能力输入格式无效");
            }
            complete_measure_range(
                identity,
                service.read_measure_range(
                    &invocation.workspace_id,
                    input.start_measure_id,
                    input.end_measure_id,
                    input.max_measures,
                ),
            )
        }
        SCORE_UPDATE_TITLE_ID => {
            let Ok(input) = serde_json::from_value::<UpdateTitleInput>(invocation.input) else {
                return rejected(identity, "capability.invalid-input", "能力输入格式无效");
            };
            if input.title.trim() != input.title
                || input.title.is_empty()
                || input.title.encode_utf16().count() > 120
            {
                return rejected(identity, "capability.invalid-input", "作品标题格式无效");
            }
            let Some(precondition) = invocation.document_precondition else {
                return rejected(
                    identity,
                    "capability.document-precondition-required",
                    "缺少文档版本前置条件",
                );
            };
            if !valid_stable_id(&precondition.document_id) {
                return rejected(identity, "capability.invalid-input", "文档标识无效");
            }
            update_title(
                service,
                identity,
                invocation.workspace_id,
                invocation.invocation_id,
                precondition,
                input.title,
            )
        }
        SCORE_PREPARE_TEMPO_CHANGE_ID => {
            let Ok(input) = serde_json::from_value::<PrepareTempoChangeInput>(invocation.input)
            else {
                return rejected(identity, "capability.invalid-input", "能力输入格式无效");
            };
            if !valid_tempo_bpm(input.tempo_bpm) {
                return rejected(identity, "capability.invalid-input", "作品速度格式无效");
            }
            let Some(precondition) = invocation.document_precondition else {
                return rejected(
                    identity,
                    "capability.document-precondition-required",
                    "缺少文档版本前置条件",
                );
            };
            if !valid_stable_id(&precondition.document_id) {
                return rejected(identity, "capability.invalid-input", "文档标识无效");
            }
            prepare_tempo_change(
                service,
                identity,
                invocation.workspace_id,
                precondition,
                input.tempo_bpm,
            )
        }
        SCORE_COMMIT_TEMPO_CHANGE_ID => {
            let Ok(input) = serde_json::from_value::<CommitTempoChangeInput>(invocation.input)
            else {
                return rejected(identity, "capability.invalid-input", "能力输入格式无效");
            };
            let Some(precondition) = invocation.document_precondition else {
                return rejected(
                    identity,
                    "capability.document-precondition-required",
                    "缺少文档版本前置条件",
                );
            };
            if !valid_stable_id(&precondition.document_id)
                || !valid_tempo_change_set(&input.change_set)
            {
                return rejected(identity, "capability.invalid-input", "变更集格式无效");
            }
            if input.change_set.document_id != precondition.document_id
                || input.change_set.base_document_version != precondition.document_version
            {
                return rejected(
                    identity,
                    "score.change-set-precondition-mismatch",
                    "变更集与文档前置条件不一致",
                );
            }
            commit_tempo_change(
                service,
                identity,
                invocation.workspace_id,
                invocation.invocation_id,
                precondition,
                input.change_set,
            )
        }
        SCORE_PREPARE_METADATA_TRANSACTION_ID => {
            let input_value = invocation.input;
            if input_value.get("title").is_some_and(Value::is_null)
                || input_value.get("tempoBpm").is_some_and(Value::is_null)
            {
                return rejected(identity, "capability.invalid-input", "作品元数据格式无效");
            }
            let Ok(input) = serde_json::from_value::<PrepareMetadataTransactionInput>(input_value)
            else {
                return rejected(identity, "capability.invalid-input", "能力输入格式无效");
            };
            if input.title.is_none() && input.tempo_bpm.is_none()
                || input.title.as_ref().is_some_and(|title| {
                    title.trim() != title || title.is_empty() || title.encode_utf16().count() > 120
                })
                || input
                    .tempo_bpm
                    .is_some_and(|tempo_bpm| !valid_tempo_bpm(tempo_bpm))
            {
                return rejected(identity, "capability.invalid-input", "作品元数据格式无效");
            }
            let Some(precondition) = invocation.document_precondition else {
                return rejected(
                    identity,
                    "capability.document-precondition-required",
                    "缺少文档版本前置条件",
                );
            };
            if !valid_stable_id(&precondition.document_id) {
                return rejected(identity, "capability.invalid-input", "文档标识无效");
            }
            prepare_metadata_transaction(
                service,
                identity,
                invocation.workspace_id,
                precondition,
                input,
            )
        }
        SCORE_COMMIT_METADATA_TRANSACTION_ID => {
            let Ok(input) =
                serde_json::from_value::<CommitMetadataTransactionInput>(invocation.input)
            else {
                return rejected(identity, "capability.invalid-input", "能力输入格式无效");
            };
            let Some(precondition) = invocation.document_precondition else {
                return rejected(
                    identity,
                    "capability.document-precondition-required",
                    "缺少文档版本前置条件",
                );
            };
            if !valid_stable_id(&precondition.document_id)
                || !valid_metadata_transaction_change_set(&input.change_set)
            {
                return rejected(identity, "capability.invalid-input", "事务变更集格式无效");
            }
            if input.change_set.document_id != precondition.document_id
                || input.change_set.base_document_version != precondition.document_version
            {
                return rejected(
                    identity,
                    "score.change-set-precondition-mismatch",
                    "事务变更集与文档前置条件不一致",
                );
            }
            commit_metadata_transaction(
                service,
                identity,
                invocation.workspace_id,
                invocation.invocation_id,
                precondition,
                input.change_set,
            )
        }
        _ => failed(identity, "capability.handler-missing", "能力处理器不可用"),
    }
}

fn valid_tempo_bpm(value: f64) -> bool {
    value.is_finite() && value > 0.0
}

fn tempo_change_set_id(
    document_id: &str,
    base_document_version: u64,
    before_tempo_bpm: f64,
    after_tempo_bpm: f64,
) -> String {
    let mut digest = Sha256::new();
    digest.update(TEMPO_CHANGE_SET_HASH_DOMAIN);
    digest.update(document_id.as_bytes());
    digest.update([0]);
    digest.update(base_document_version.to_be_bytes());
    digest.update(before_tempo_bpm.to_bits().to_be_bytes());
    digest.update(after_tempo_bpm.to_bits().to_be_bytes());
    format!("sha256:{:x}", digest.finalize())
}

fn tempo_change_set(
    document_id: String,
    base_document_version: u64,
    before_tempo_bpm: f64,
    after_tempo_bpm: f64,
) -> ScoreTempoChangeSetV1 {
    let change_set_id = tempo_change_set_id(
        &document_id,
        base_document_version,
        before_tempo_bpm,
        after_tempo_bpm,
    );
    ScoreTempoChangeSetV1 {
        change_set_id,
        kind: SCORE_TEMPO_CHANGE_KIND.into(),
        document_id,
        base_document_version,
        before_tempo_bpm,
        after_tempo_bpm,
    }
}

fn valid_tempo_change_set(value: &ScoreTempoChangeSetV1) -> bool {
    value.kind == SCORE_TEMPO_CHANGE_KIND
        && valid_stable_id(&value.document_id)
        && valid_tempo_bpm(value.before_tempo_bpm)
        && valid_tempo_bpm(value.after_tempo_bpm)
        && value.before_tempo_bpm != value.after_tempo_bpm
        && value.change_set_id
            == tempo_change_set_id(
                &value.document_id,
                value.base_document_version,
                value.before_tempo_bpm,
                value.after_tempo_bpm,
            )
}

fn prepare_tempo_change(
    service: &ScoreSessionService,
    identity: (String, String, u64),
    workspace_id: String,
    precondition: CapabilityDocumentPrecondition,
    after_tempo_bpm: f64,
) -> CapabilityResult {
    let current = match service.read_metadata(&workspace_id) {
        Ok(Some(value)) => value,
        Ok(None) => {
            return CapabilityResult::Unavailable {
                invocation_id: identity.0,
                capability_id: identity.1,
                contract_version: identity.2,
                code: "score.document-unavailable".into(),
                message: "当前工作区没有打开的乐谱".into(),
            };
        }
        Err(_) => {
            return failed(
                identity,
                "capability.execution-failed",
                "无法准备作品速度变更",
            );
        }
    };
    if current.document_id != precondition.document_id
        || current.document_version != precondition.document_version
    {
        return rejected(
            identity,
            "score.document-version-conflict",
            "乐谱版本已经变化，请重新准备变更",
        );
    }
    if current.tempo_bpm == after_tempo_bpm {
        return rejected(
            identity,
            "score.change-set-empty",
            "目标速度与当前速度相同，无需修改",
        );
    }
    complete_serialized(
        identity,
        Ok::<_, HostError>(Some(tempo_change_set(
            current.document_id,
            current.document_version,
            current.tempo_bpm,
            after_tempo_bpm,
        ))),
        "无法编码作品速度变更集",
    )
}

fn commit_tempo_change(
    service: &mut ScoreSessionService,
    identity: (String, String, u64),
    workspace_id: String,
    request_id: String,
    precondition: CapabilityDocumentPrecondition,
    change_set: ScoreTempoChangeSetV1,
) -> CapabilityResult {
    let current = match service.read_metadata(&workspace_id) {
        Ok(Some(value)) => value,
        Ok(None) => {
            return CapabilityResult::Unavailable {
                invocation_id: identity.0,
                capability_id: identity.1,
                contract_version: identity.2,
                code: "score.document-unavailable".into(),
                message: "当前工作区没有打开的乐谱".into(),
            };
        }
        Err(_) => {
            return failed(
                identity,
                "capability.execution-failed",
                "无法读取待提交的作品速度变更",
            );
        }
    };
    if current.document_id != change_set.document_id
        || current.document_version != change_set.base_document_version
        || current.tempo_bpm != change_set.before_tempo_bpm
    {
        return rejected(
            identity,
            "score.change-set-stale",
            "乐谱已变化，请重新准备并批准变更",
        );
    }

    let updated = match service.edit(ScoreEditRequest {
        workspace_id: workspace_id.clone(),
        request_id,
        document_id: precondition.document_id,
        expected_version: precondition.document_version,
        action: ScoreEditAction::SetTempo {
            tempo_bpm: change_set.after_tempo_bpm,
        },
    }) {
        Ok(value) => value,
        Err(error) if error.status == 409 => {
            return rejected(
                identity,
                "score.change-set-stale",
                "乐谱已变化，请重新准备并批准变更",
            );
        }
        Err(error) if error.status == 400 || error.status == 422 => {
            return rejected(identity, "score.tempo-update-rejected", &error.message);
        }
        Err(_) => {
            return failed(identity, "capability.execution-failed", "无法修改作品速度");
        }
    };

    let read_back = match service.read_metadata(&workspace_id) {
        Ok(Some(value)) => value,
        _ => {
            return failed(
                identity,
                "score.postcondition-unverified",
                "作品速度已提交，但无法独立确认结果",
            );
        }
    };
    let Some(expected_document_version) = change_set.base_document_version.checked_add(1) else {
        return failed(
            identity,
            "score.postcondition-failed",
            "作品速度变更的文档版本无效",
        );
    };
    if read_back.document_id != change_set.document_id
        || read_back.document_version != expected_document_version
        || read_back.tempo_bpm != change_set.after_tempo_bpm
    {
        return failed(
            identity,
            "score.postcondition-failed",
            "作品速度提交后未满足预期结果",
        );
    }

    complete_serialized(
        identity,
        Ok::<_, HostError>(Some(ScoreTempoUpdateV1 {
            change_set_id: change_set.change_set_id,
            document_id: read_back.document_id,
            document_version: read_back.document_version,
            previous_tempo_bpm: change_set.before_tempo_bpm,
            tempo_bpm: read_back.tempo_bpm,
            undo_available: updated.undo_depth > 0,
        })),
        "无法编码作品速度修改结果",
    )
}

fn hash_string(digest: &mut Sha256, value: &str) {
    digest.update((value.len() as u64).to_be_bytes());
    digest.update(value.as_bytes());
}

fn metadata_transaction_operations(
    before: &ScoreMetadataSnapshotV1,
    after: &ScoreMetadataSnapshotV1,
) -> Vec<ScoreMetadataTransactionOperationV1> {
    let mut operations = Vec::with_capacity(2);
    if before.title != after.title {
        operations.push(ScoreMetadataTransactionOperationV1::SetTitle);
    }
    if before.tempo_bpm != after.tempo_bpm {
        operations.push(ScoreMetadataTransactionOperationV1::SetTempo);
    }
    operations
}

fn metadata_transaction_change_set_id(
    document_id: &str,
    base_document_version: u64,
    before: &ScoreMetadataSnapshotV1,
    after: &ScoreMetadataSnapshotV1,
) -> String {
    let mut digest = Sha256::new();
    digest.update(METADATA_TRANSACTION_HASH_DOMAIN);
    hash_string(&mut digest, document_id);
    digest.update(base_document_version.to_be_bytes());
    hash_string(&mut digest, &before.title);
    digest.update(before.tempo_bpm.to_bits().to_be_bytes());
    hash_string(&mut digest, &after.title);
    digest.update(after.tempo_bpm.to_bits().to_be_bytes());
    format!("sha256:{:x}", digest.finalize())
}

fn metadata_transaction_change_set(
    document_id: String,
    base_document_version: u64,
    before: ScoreMetadataSnapshotV1,
    after: ScoreMetadataSnapshotV1,
) -> ScoreMetadataTransactionChangeSetV1 {
    let operations = metadata_transaction_operations(&before, &after);
    let change_set_id =
        metadata_transaction_change_set_id(&document_id, base_document_version, &before, &after);
    ScoreMetadataTransactionChangeSetV1 {
        change_set_id,
        kind: SCORE_METADATA_TRANSACTION_KIND.into(),
        document_id,
        base_document_version,
        operations,
        before,
        after,
    }
}

fn valid_metadata_snapshot(value: &ScoreMetadataSnapshotV1) -> bool {
    value.title.trim() == value.title
        && !value.title.is_empty()
        && value.title.encode_utf16().count() <= 120
        && valid_tempo_bpm(value.tempo_bpm)
}

fn valid_metadata_transaction_change_set(value: &ScoreMetadataTransactionChangeSetV1) -> bool {
    value.kind == SCORE_METADATA_TRANSACTION_KIND
        && valid_stable_id(&value.document_id)
        && valid_metadata_snapshot(&value.before)
        && valid_metadata_snapshot(&value.after)
        && !value.operations.is_empty()
        && value.operations == metadata_transaction_operations(&value.before, &value.after)
        && value.change_set_id
            == metadata_transaction_change_set_id(
                &value.document_id,
                value.base_document_version,
                &value.before,
                &value.after,
            )
}

fn prepare_metadata_transaction(
    service: &ScoreSessionService,
    identity: (String, String, u64),
    workspace_id: String,
    precondition: CapabilityDocumentPrecondition,
    input: PrepareMetadataTransactionInput,
) -> CapabilityResult {
    let current = match service.read_metadata(&workspace_id) {
        Ok(Some(value)) => value,
        Ok(None) => {
            return CapabilityResult::Unavailable {
                invocation_id: identity.0,
                capability_id: identity.1,
                contract_version: identity.2,
                code: "score.document-unavailable".into(),
                message: "当前工作区没有打开的乐谱".into(),
            };
        }
        Err(_) => {
            return failed(
                identity,
                "capability.execution-failed",
                "无法准备作品元数据事务",
            );
        }
    };
    if current.document_id != precondition.document_id
        || current.document_version != precondition.document_version
    {
        return rejected(
            identity,
            "score.document-version-conflict",
            "乐谱版本已经变化，请重新准备事务",
        );
    }

    let before = ScoreMetadataSnapshotV1 {
        title: current.title,
        tempo_bpm: current.tempo_bpm,
    };
    let after = ScoreMetadataSnapshotV1 {
        title: input.title.unwrap_or_else(|| before.title.clone()),
        tempo_bpm: input.tempo_bpm.unwrap_or(before.tempo_bpm),
    };
    if before == after {
        return rejected(
            identity,
            "score.change-set-empty",
            "目标元数据与当前内容相同，无需修改",
        );
    }
    complete_serialized(
        identity,
        Ok::<_, HostError>(Some(metadata_transaction_change_set(
            current.document_id,
            current.document_version,
            before,
            after,
        ))),
        "无法编码作品元数据事务变更集",
    )
}

fn commit_metadata_transaction(
    service: &mut ScoreSessionService,
    identity: (String, String, u64),
    workspace_id: String,
    request_id: String,
    precondition: CapabilityDocumentPrecondition,
    change_set: ScoreMetadataTransactionChangeSetV1,
) -> CapabilityResult {
    let current = match service.read_metadata(&workspace_id) {
        Ok(Some(value)) => value,
        Ok(None) => {
            return CapabilityResult::Unavailable {
                invocation_id: identity.0,
                capability_id: identity.1,
                contract_version: identity.2,
                code: "score.document-unavailable".into(),
                message: "当前工作区没有打开的乐谱".into(),
            };
        }
        Err(_) => {
            return failed(
                identity,
                "capability.execution-failed",
                "无法读取待提交的作品元数据事务",
            );
        }
    };
    if current.document_id != change_set.document_id
        || current.document_version != change_set.base_document_version
        || current.title != change_set.before.title
        || current.tempo_bpm != change_set.before.tempo_bpm
    {
        return rejected(
            identity,
            "score.change-set-stale",
            "乐谱已变化，请重新准备并批准事务",
        );
    }

    let updated = match service.edit(ScoreEditRequest {
        workspace_id: workspace_id.clone(),
        request_id,
        document_id: precondition.document_id,
        expected_version: precondition.document_version,
        action: ScoreEditAction::SetMetadata {
            title: change_set.after.title.clone(),
            tempo_bpm: change_set.after.tempo_bpm,
        },
    }) {
        Ok(value) => value,
        Err(error) if error.status == 409 => {
            return rejected(
                identity,
                "score.change-set-stale",
                "乐谱已变化，请重新准备并批准事务",
            );
        }
        Err(error) if error.status == 400 || error.status == 422 => {
            return rejected(
                identity,
                "score.metadata-transaction-rejected",
                &error.message,
            );
        }
        Err(_) => {
            return failed(
                identity,
                "capability.execution-failed",
                "无法提交作品元数据事务",
            );
        }
    };

    let read_back = match service.read_metadata(&workspace_id) {
        Ok(Some(value)) => value,
        _ => {
            return failed(
                identity,
                "score.postcondition-unverified",
                "作品元数据事务已提交，但无法独立确认结果",
            );
        }
    };
    let Some(expected_document_version) = change_set.base_document_version.checked_add(1) else {
        return failed(
            identity,
            "score.postcondition-failed",
            "作品元数据事务的文档版本无效",
        );
    };
    if read_back.document_id != change_set.document_id
        || read_back.document_version != expected_document_version
        || read_back.title != change_set.after.title
        || read_back.tempo_bpm != change_set.after.tempo_bpm
    {
        return failed(
            identity,
            "score.postcondition-failed",
            "作品元数据事务提交后未满足预期结果",
        );
    }

    complete_serialized(
        identity,
        Ok::<_, HostError>(Some(ScoreMetadataTransactionUpdateV1 {
            change_set_id: change_set.change_set_id,
            document_id: read_back.document_id,
            document_version: read_back.document_version,
            applied_operations: change_set.operations,
            previous: change_set.before,
            current: change_set.after,
            undo_available: updated.undo_depth > 0,
        })),
        "无法编码作品元数据事务结果",
    )
}

fn update_title(
    service: &mut ScoreSessionService,
    identity: (String, String, u64),
    workspace_id: String,
    request_id: String,
    precondition: CapabilityDocumentPrecondition,
    title: String,
) -> CapabilityResult {
    let previous = match service.read_summary(&workspace_id) {
        Ok(Some(value)) => value,
        Ok(None) => {
            return CapabilityResult::Unavailable {
                invocation_id: identity.0,
                capability_id: identity.1,
                contract_version: identity.2,
                code: "score.document-unavailable".into(),
                message: "当前工作区没有打开的乐谱".into(),
            };
        }
        Err(_) => {
            return failed(
                identity,
                "capability.execution-failed",
                "无法读取当前乐谱版本",
            );
        }
    };
    if previous.document_id != precondition.document_id
        || previous.document_version != precondition.document_version
    {
        return rejected(
            identity,
            "score.document-version-conflict",
            "乐谱版本已经变化，请重新发起任务",
        );
    }

    match service.edit(ScoreEditRequest {
        workspace_id,
        request_id,
        document_id: precondition.document_id,
        expected_version: precondition.document_version,
        action: ScoreEditAction::SetTitle { title },
    }) {
        Ok(result) => complete_serialized(
            identity,
            Ok::<_, HostError>(Some(ScoreTitleUpdateV1 {
                document_id: result.document_id,
                document_version: result.document_version,
                previous_title: previous.title,
                title: result.title,
                undo_available: result.undo_depth > 0,
            })),
            "无法确认标题修改结果",
        ),
        Err(error) if error.status == 409 => rejected(
            identity,
            "score.document-version-conflict",
            "乐谱版本已经变化，请重新发起任务",
        ),
        Err(error) if error.status == 400 || error.status == 422 => {
            rejected(identity, "score.title-update-rejected", &error.message)
        }
        Err(_) => failed(identity, "capability.execution-failed", "无法修改作品标题"),
    }
}

fn complete_measure_index(
    identity: (String, String, u64),
    result: Result<Option<ScoreMeasureIndexV1>, HostError>,
) -> CapabilityResult {
    match result {
        Ok(value) => {
            complete_serialized(identity, Ok::<_, HostError>(value), "无法读取当前小节索引")
        }
        Err(error) if error.status == 409 => {
            rejected(identity, "score.measure-index-stale", &error.message)
        }
        Err(_) => failed(
            identity,
            "capability.execution-failed",
            "无法读取当前小节索引",
        ),
    }
}

fn complete_measure_range(
    identity: (String, String, u64),
    result: Result<Option<ScoreMeasureRangeV1>, HostError>,
) -> CapabilityResult {
    match result {
        Ok(Some(value)) => match serde_json::to_value(value) {
            Ok(data) => CapabilityResult::Completed {
                invocation_id: identity.0,
                capability_id: identity.1,
                contract_version: identity.2,
                data,
            },
            Err(_) => failed(identity, "capability.output-invalid", "能力输出无效"),
        },
        Ok(None) => CapabilityResult::Unavailable {
            invocation_id: identity.0,
            capability_id: identity.1,
            contract_version: identity.2,
            code: "score.document-unavailable".into(),
            message: "当前工作区没有打开的乐谱".into(),
        },
        Err(error) if error.status == 422 => {
            rejected(identity, "score.measure-range-invalid", &error.message)
        }
        Err(_) => failed(
            identity,
            "capability.execution-failed",
            "无法读取当前小节范围",
        ),
    }
}

fn complete_serialized<T: Serialize, E>(
    identity: (String, String, u64),
    result: Result<Option<T>, E>,
    failure_message: &'static str,
) -> CapabilityResult {
    match result {
        Ok(Some(value)) => match serde_json::to_value(value) {
            Ok(data) => CapabilityResult::Completed {
                invocation_id: identity.0,
                capability_id: identity.1,
                contract_version: identity.2,
                data,
            },
            Err(_) => failed(identity, "capability.output-invalid", "能力输出无效"),
        },
        Ok(None) => CapabilityResult::Unavailable {
            invocation_id: identity.0,
            capability_id: identity.1,
            contract_version: identity.2,
            code: "score.document-unavailable".into(),
            message: "当前工作区没有打开的乐谱".into(),
        },
        Err(_) => failed(identity, "capability.execution-failed", failure_message),
    }
}

fn rejected(
    identity: (String, String, u64),
    code: &'static str,
    message: &str,
) -> CapabilityResult {
    CapabilityResult::Rejected {
        invocation_id: identity.0,
        capability_id: identity.1,
        contract_version: identity.2,
        code: code.into(),
        message: message.into(),
    }
}

fn failed(identity: (String, String, u64), code: &'static str, message: &str) -> CapabilityResult {
    CapabilityResult::Failed {
        invocation_id: identity.0,
        capability_id: identity.1,
        contract_version: identity.2,
        code: code.into(),
        message: message.into(),
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;
    use crate::dto::{CreateScoreRequest, NewScoreInput};

    fn request(workspace_id: &str, capability_id: &str, input: Value) -> CapabilityInvocation {
        CapabilityInvocation {
            invocation_id: Uuid::new_v4().to_string(),
            capability_id: capability_id.into(),
            contract_version: 1,
            workspace_id: workspace_id.into(),
            document_precondition: None,
            caller: CapabilityCaller::Test,
            input,
        }
    }

    #[test]
    fn catalog_declares_read_and_mutation_score_capabilities() {
        assert_eq!(
            CAPABILITY_CATALOG,
            &[
                SCORE_READ_SUMMARY,
                SCORE_READ_METADATA,
                SCORE_READ_STRUCTURE,
                SCORE_READ_MEASURE_INDEX,
                SCORE_READ_MEASURE_RANGE,
                SCORE_UPDATE_TITLE,
                SCORE_PREPARE_TEMPO_CHANGE,
                SCORE_COMMIT_TEMPO_CHANGE,
                SCORE_PREPARE_METADATA_TRANSACTION,
                SCORE_COMMIT_METADATA_TRANSACTION,
            ]
        );
        for descriptor in &CAPABILITY_CATALOG[..5] {
            assert_eq!(descriptor.effects.document, "read");
            assert_eq!(descriptor.effects.filesystem, "none");
            assert_eq!(descriptor.effects.network, "none");
        }
        assert_eq!(SCORE_UPDATE_TITLE.kind, CapabilityKind::Mutation);
        assert_eq!(SCORE_UPDATE_TITLE.effects.document, "write");
        assert_eq!(SCORE_PREPARE_TEMPO_CHANGE.kind, CapabilityKind::Query);
        assert_eq!(SCORE_PREPARE_TEMPO_CHANGE.effects.document, "read");
        assert_eq!(SCORE_COMMIT_TEMPO_CHANGE.kind, CapabilityKind::Mutation);
        assert_eq!(SCORE_COMMIT_TEMPO_CHANGE.effects.document, "write");
        assert_eq!(
            SCORE_PREPARE_METADATA_TRANSACTION.kind,
            CapabilityKind::Query
        );
        assert_eq!(SCORE_PREPARE_METADATA_TRANSACTION.effects.document, "read");
        assert_eq!(
            SCORE_COMMIT_METADATA_TRANSACTION.kind,
            CapabilityKind::Mutation
        );
        assert_eq!(SCORE_COMMIT_METADATA_TRANSACTION.effects.document, "write");
    }

    #[test]
    fn gateway_returns_a_typed_summary_without_full_session_fields() {
        let workspace_id = Uuid::new_v4().to_string();
        let mut service = ScoreSessionService::default();
        service
            .create(CreateScoreRequest {
                workspace_id: workspace_id.clone(),
                input: NewScoreInput {
                    title: "能力概要".into(),
                    measure_count: 3,
                },
                request_id: Uuid::new_v4().to_string(),
                expected_document_id: None,
            })
            .expect("create score");

        let CapabilityResult::Completed { data, .. } = invoke(
            &mut service,
            request(&workspace_id, SCORE_READ_SUMMARY_ID, json!({})),
        ) else {
            panic!("summary capability must complete");
        };
        assert_eq!(data["title"], "能力概要");
        assert_eq!(data["measureCount"], 3);
        assert!(data.get("notation").is_none());
        assert!(data.get("playbackSource").is_none());
    }

    #[test]
    fn gateway_returns_metadata_and_structure_without_notation_payloads() {
        let workspace_id = Uuid::new_v4().to_string();
        let mut service = ScoreSessionService::default();
        service
            .create(CreateScoreRequest {
                workspace_id: workspace_id.clone(),
                input: NewScoreInput {
                    title: "能力读取".into(),
                    measure_count: 4,
                },
                request_id: Uuid::new_v4().to_string(),
                expected_document_id: None,
            })
            .expect("create score");

        let CapabilityResult::Completed { data: metadata, .. } = invoke(
            &mut service,
            request(&workspace_id, SCORE_READ_METADATA_ID, json!({})),
        ) else {
            panic!("metadata capability must complete");
        };
        assert_eq!(metadata["title"], "能力读取");
        assert_eq!(metadata["authors"], json!([]));
        assert_eq!(metadata["tempoBpm"], 96.0);
        assert!(metadata.get("notation").is_none());

        let CapabilityResult::Completed {
            data: structure, ..
        } = invoke(
            &mut service,
            request(&workspace_id, SCORE_READ_STRUCTURE_ID, json!({})),
        )
        else {
            panic!("structure capability must complete");
        };
        assert_eq!(structure["measureCount"], 4);
        assert_eq!(structure["partCount"], 1);
        assert_eq!(structure["staffCount"], 1);
        assert!(structure.get("measures").is_none());
        assert!(structure.get("notation").is_none());
    }

    #[test]
    fn gateway_returns_a_bounded_normalized_measure_range() {
        let workspace_id = Uuid::new_v4().to_string();
        let mut service = ScoreSessionService::default();
        service
            .create(CreateScoreRequest {
                workspace_id: workspace_id.clone(),
                input: NewScoreInput {
                    title: "范围读取".into(),
                    measure_count: 4,
                },
                request_id: Uuid::new_v4().to_string(),
                expected_document_id: None,
            })
            .expect("create score");

        let CapabilityResult::Completed { data, .. } = invoke(
            &mut service,
            request(
                &workspace_id,
                SCORE_READ_MEASURE_RANGE_ID,
                json!({
                    "startMeasureId": "measure-4",
                    "endMeasureId": "measure-2",
                    "maxMeasures": 3,
                }),
            ),
        ) else {
            panic!("measure range capability must complete");
        };
        assert_eq!(data["startMeasureId"], "measure-2");
        assert_eq!(data["endMeasureId"], "measure-4");
        assert_eq!(data["measureCount"], 3);
        assert_eq!(data["measures"][0]["measureId"], "measure-2");
        assert!(data.get("notation").is_none());
        assert!(data["measures"][0].get("events").is_none());
    }

    #[test]
    fn gateway_keeps_the_measure_index_internal_and_version_bound() {
        let workspace_id = Uuid::new_v4().to_string();
        let mut service = ScoreSessionService::default();
        let created = service
            .create(CreateScoreRequest {
                workspace_id: workspace_id.clone(),
                input: NewScoreInput {
                    title: "内部索引".into(),
                    measure_count: 3,
                },
                request_id: Uuid::new_v4().to_string(),
                expected_document_id: None,
            })
            .expect("create score");
        let input = json!({
            "expectedDocumentId": created.document_id.clone(),
            "expectedDocumentVersion": created.document_version,
        });

        let CapabilityResult::Completed { data, .. } = invoke(
            &mut service,
            request(&workspace_id, SCORE_READ_MEASURE_INDEX_ID, input.clone()),
        ) else {
            panic!("internal measure index must complete");
        };
        assert_eq!(
            data["measureIds"],
            json!(["measure-1", "measure-2", "measure-3"])
        );
        assert!(data.get("notation").is_none());

        let mut agent_request = request(&workspace_id, SCORE_READ_MEASURE_INDEX_ID, input);
        agent_request.caller = CapabilityCaller::Agent;
        assert!(matches!(
            invoke(&mut service, agent_request),
            CapabilityResult::Rejected { ref code, .. } if code == "capability.unknown"
        ));
        assert!(matches!(
            invoke(
                &mut service,
                request(
                    &workspace_id,
                    SCORE_READ_MEASURE_INDEX_ID,
                    json!({
                        "expectedDocumentId": created.document_id.clone(),
                        "expectedDocumentVersion": created.document_version + 1,
                    }),
                ),
            ),
            CapabilityResult::Rejected { ref code, .. }
                if code == "score.measure-index-stale"
        ));
    }

    #[test]
    fn title_update_is_version_bound_and_undoable() {
        let workspace_id = Uuid::new_v4().to_string();
        let mut service = ScoreSessionService::default();
        let created = service
            .create(CreateScoreRequest {
                workspace_id: workspace_id.clone(),
                input: NewScoreInput {
                    title: "原始标题".into(),
                    measure_count: 2,
                },
                request_id: Uuid::new_v4().to_string(),
                expected_document_id: None,
            })
            .expect("create score");

        assert!(matches!(
            invoke(
                &mut service,
                request(
                    &workspace_id,
                    SCORE_UPDATE_TITLE_ID,
                    json!({ "title": "缺少版本条件" }),
                ),
            ),
            CapabilityResult::Rejected { ref code, .. }
                if code == "capability.document-precondition-required"
        ));

        let mut ui_bypass = request(
            &workspace_id,
            SCORE_UPDATE_TITLE_ID,
            json!({ "title": "不应绕过 Agent 控制面" }),
        );
        ui_bypass.caller = CapabilityCaller::Ui;
        ui_bypass.document_precondition = Some(CapabilityDocumentPrecondition {
            document_id: created.document_id.clone(),
            document_version: created.document_version,
        });
        assert!(matches!(
            invoke(&mut service, ui_bypass),
            CapabilityResult::Rejected { ref code, .. }
                if code == "capability.unknown"
        ));

        let mut update = request(
            &workspace_id,
            SCORE_UPDATE_TITLE_ID,
            json!({ "title": "新的标题" }),
        );
        update.document_precondition = Some(CapabilityDocumentPrecondition {
            document_id: created.document_id.clone(),
            document_version: created.document_version,
        });

        let CapabilityResult::Completed { data, .. } = invoke(&mut service, update) else {
            panic!("title update must complete");
        };
        assert_eq!(data["previousTitle"], "原始标题");
        assert_eq!(data["title"], "新的标题");
        assert_eq!(data["documentVersion"], created.document_version + 1);
        assert_eq!(data["undoAvailable"], true);

        let mut stale = request(
            &workspace_id,
            SCORE_UPDATE_TITLE_ID,
            json!({ "title": "不应写入" }),
        );
        stale.document_precondition = Some(CapabilityDocumentPrecondition {
            document_id: created.document_id.clone(),
            document_version: created.document_version,
        });
        assert!(matches!(
            invoke(&mut service, stale),
            CapabilityResult::Rejected { ref code, .. }
                if code == "score.document-version-conflict"
        ));

        let current = service.read_summary(&workspace_id).unwrap().unwrap();
        let undone = service
            .edit(ScoreEditRequest {
                workspace_id: workspace_id.clone(),
                request_id: Uuid::new_v4().to_string(),
                document_id: current.document_id,
                expected_version: current.document_version,
                action: ScoreEditAction::Undo,
            })
            .expect("undo title update");
        assert_eq!(undone.title, "原始标题");
    }

    #[test]
    fn tempo_change_set_is_version_bound_tamper_resistant_verified_and_undoable() {
        let workspace_id = Uuid::new_v4().to_string();
        let mut service = ScoreSessionService::default();
        let created = service
            .create(CreateScoreRequest {
                workspace_id: workspace_id.clone(),
                input: NewScoreInput {
                    title: "速度变更".into(),
                    measure_count: 2,
                },
                request_id: Uuid::new_v4().to_string(),
                expected_document_id: None,
            })
            .expect("create score");
        let precondition = CapabilityDocumentPrecondition {
            document_id: created.document_id.clone(),
            document_version: created.document_version,
        };

        let mut prepare = request(
            &workspace_id,
            SCORE_PREPARE_TEMPO_CHANGE_ID,
            json!({ "tempoBpm": 132.0 }),
        );
        prepare.document_precondition = Some(precondition.clone());
        let CapabilityResult::Completed {
            data: change_set, ..
        } = invoke(&mut service, prepare)
        else {
            panic!("tempo change preparation must complete");
        };
        assert_eq!(change_set["kind"], SCORE_TEMPO_CHANGE_KIND);
        assert_eq!(change_set["documentId"], created.document_id);
        assert_eq!(change_set["baseDocumentVersion"], created.document_version);
        assert_eq!(change_set["beforeTempoBpm"], 96.0);
        assert_eq!(change_set["afterTempoBpm"], 132.0);
        assert!(
            change_set["changeSetId"]
                .as_str()
                .is_some_and(|value| value.starts_with("sha256:") && value.len() == 71)
        );

        let mut tampered = change_set.clone();
        tampered["afterTempoBpm"] = json!(144.0);
        let mut tampered_commit = request(
            &workspace_id,
            SCORE_COMMIT_TEMPO_CHANGE_ID,
            json!({ "changeSet": tampered }),
        );
        tampered_commit.document_precondition = Some(precondition.clone());
        assert!(matches!(
            invoke(&mut service, tampered_commit),
            CapabilityResult::Rejected { ref code, .. }
                if code == "capability.invalid-input"
        ));
        assert_eq!(
            service
                .read_metadata(&workspace_id)
                .unwrap()
                .unwrap()
                .tempo_bpm,
            96.0
        );

        let mut commit = request(
            &workspace_id,
            SCORE_COMMIT_TEMPO_CHANGE_ID,
            json!({ "changeSet": change_set.clone() }),
        );
        commit.document_precondition = Some(precondition.clone());
        let CapabilityResult::Completed { data: result, .. } = invoke(&mut service, commit) else {
            panic!("approved tempo change must commit");
        };
        assert_eq!(result["changeSetId"], change_set["changeSetId"]);
        assert_eq!(result["previousTempoBpm"], 96.0);
        assert_eq!(result["tempoBpm"], 132.0);
        assert_eq!(result["documentVersion"], created.document_version + 1);
        assert_eq!(result["undoAvailable"], true);

        let read_back = service.read_metadata(&workspace_id).unwrap().unwrap();
        assert_eq!(read_back.tempo_bpm, 132.0);
        assert_eq!(read_back.document_version, created.document_version + 1);

        let mut stale_commit = request(
            &workspace_id,
            SCORE_COMMIT_TEMPO_CHANGE_ID,
            json!({ "changeSet": change_set }),
        );
        stale_commit.document_precondition = Some(precondition);
        assert!(matches!(
            invoke(&mut service, stale_commit),
            CapabilityResult::Rejected { ref code, .. }
                if code == "score.change-set-stale"
        ));

        let undone = service
            .edit(ScoreEditRequest {
                workspace_id: workspace_id.clone(),
                request_id: Uuid::new_v4().to_string(),
                document_id: read_back.document_id,
                expected_version: read_back.document_version,
                action: ScoreEditAction::Undo,
            })
            .expect("undo tempo update");
        assert_eq!(
            service
                .read_metadata(&workspace_id)
                .unwrap()
                .unwrap()
                .tempo_bpm,
            96.0
        );
        assert_eq!(undone.redo_depth, 1);
    }

    #[test]
    fn tempo_change_preparation_rejects_no_op_stale_and_ui_bypass() {
        let workspace_id = Uuid::new_v4().to_string();
        let mut service = ScoreSessionService::default();
        let created = service
            .create(CreateScoreRequest {
                workspace_id: workspace_id.clone(),
                input: NewScoreInput {
                    title: "准备约束".into(),
                    measure_count: 1,
                },
                request_id: Uuid::new_v4().to_string(),
                expected_document_id: None,
            })
            .expect("create score");

        let prepare = |tempo_bpm, version, caller| {
            let mut invocation = request(
                &workspace_id,
                SCORE_PREPARE_TEMPO_CHANGE_ID,
                json!({ "tempoBpm": tempo_bpm }),
            );
            invocation.caller = caller;
            invocation.document_precondition = Some(CapabilityDocumentPrecondition {
                document_id: created.document_id.clone(),
                document_version: version,
            });
            invocation
        };
        assert!(matches!(
            invoke(
                &mut service,
                prepare(96.0, created.document_version, CapabilityCaller::Test)
            ),
            CapabilityResult::Rejected { ref code, .. }
                if code == "score.change-set-empty"
        ));
        assert!(matches!(
            invoke(
                &mut service,
                prepare(120.0, created.document_version + 1, CapabilityCaller::Test)
            ),
            CapabilityResult::Rejected { ref code, .. }
                if code == "score.document-version-conflict"
        ));
        assert!(matches!(
            invoke(
                &mut service,
                prepare(120.0, created.document_version, CapabilityCaller::Ui)
            ),
            CapabilityResult::Rejected { ref code, .. }
                if code == "capability.unknown"
        ));
    }

    #[test]
    fn metadata_transaction_is_hash_bound_atomic_verified_and_single_step_undoable() {
        let workspace_id = Uuid::new_v4().to_string();
        let mut service = ScoreSessionService::default();
        let created = service
            .create(CreateScoreRequest {
                workspace_id: workspace_id.clone(),
                input: NewScoreInput {
                    title: "事务之前".into(),
                    measure_count: 2,
                },
                request_id: Uuid::new_v4().to_string(),
                expected_document_id: None,
            })
            .expect("create score");
        let precondition = CapabilityDocumentPrecondition {
            document_id: created.document_id.clone(),
            document_version: created.document_version,
        };

        let mut prepare = request(
            &workspace_id,
            SCORE_PREPARE_METADATA_TRANSACTION_ID,
            json!({ "title": "事务之后", "tempoBpm": 128.0 }),
        );
        prepare.document_precondition = Some(precondition.clone());
        let CapabilityResult::Completed {
            data: change_set, ..
        } = invoke(&mut service, prepare)
        else {
            panic!("metadata transaction preparation must complete");
        };
        assert_eq!(change_set["kind"], SCORE_METADATA_TRANSACTION_KIND);
        assert_eq!(change_set["documentId"], created.document_id);
        assert_eq!(change_set["baseDocumentVersion"], created.document_version);
        assert_eq!(change_set["operations"], json!(["set-title", "set-tempo"]));
        assert_eq!(change_set["before"]["title"], "事务之前");
        assert_eq!(change_set["before"]["tempoBpm"], 96.0);
        assert_eq!(change_set["after"]["title"], "事务之后");
        assert_eq!(change_set["after"]["tempoBpm"], 128.0);

        let mut tampered = change_set.clone();
        tampered["after"]["title"] = json!("篡改标题");
        let mut tampered_commit = request(
            &workspace_id,
            SCORE_COMMIT_METADATA_TRANSACTION_ID,
            json!({ "changeSet": tampered }),
        );
        tampered_commit.document_precondition = Some(precondition.clone());
        assert!(matches!(
            invoke(&mut service, tampered_commit),
            CapabilityResult::Rejected { ref code, .. } if code == "capability.invalid-input"
        ));

        let mut commit = request(
            &workspace_id,
            SCORE_COMMIT_METADATA_TRANSACTION_ID,
            json!({ "changeSet": change_set.clone() }),
        );
        commit.document_precondition = Some(precondition.clone());
        let CapabilityResult::Completed { data: result, .. } = invoke(&mut service, commit) else {
            panic!("metadata transaction must commit");
        };
        assert_eq!(result["changeSetId"], change_set["changeSetId"]);
        assert_eq!(
            result["appliedOperations"],
            json!(["set-title", "set-tempo"])
        );
        assert_eq!(result["previous"], change_set["before"]);
        assert_eq!(result["current"], change_set["after"]);
        assert_eq!(result["documentVersion"], created.document_version + 1);
        assert_eq!(result["undoAvailable"], true);

        let read_back = service.read_metadata(&workspace_id).unwrap().unwrap();
        assert_eq!(read_back.title, "事务之后");
        assert_eq!(read_back.tempo_bpm, 128.0);
        assert_eq!(read_back.document_version, created.document_version + 1);

        let mut stale_commit = request(
            &workspace_id,
            SCORE_COMMIT_METADATA_TRANSACTION_ID,
            json!({ "changeSet": change_set }),
        );
        stale_commit.document_precondition = Some(precondition);
        assert!(matches!(
            invoke(&mut service, stale_commit),
            CapabilityResult::Rejected { ref code, .. } if code == "score.change-set-stale"
        ));

        let undone = service
            .edit(ScoreEditRequest {
                workspace_id: workspace_id.clone(),
                request_id: Uuid::new_v4().to_string(),
                document_id: read_back.document_id,
                expected_version: read_back.document_version,
                action: ScoreEditAction::Undo,
            })
            .expect("undo metadata transaction");
        let restored = service.read_metadata(&workspace_id).unwrap().unwrap();
        assert_eq!(restored.title, "事务之前");
        assert_eq!(restored.tempo_bpm, 96.0);
        assert_eq!(undone.redo_depth, 1);
    }

    #[test]
    fn gateway_rejects_unknown_contracts_and_extra_input() {
        let workspace_id = Uuid::new_v4().to_string();
        let mut service = ScoreSessionService::default();
        let mut wrong_version = request(&workspace_id, SCORE_READ_SUMMARY_ID, json!({}));
        wrong_version.contract_version = 2;
        assert!(matches!(
            invoke(&mut service, wrong_version),
            CapabilityResult::Rejected { ref code, .. }
                if code == "capability.unsupported-contract-version"
        ));
        assert!(matches!(
            invoke(
                &mut service,
                request(
                    &workspace_id,
                    SCORE_READ_SUMMARY_ID,
                    json!({ "extra": true })
                )
            ),
            CapabilityResult::Rejected { ref code, .. }
                if code == "capability.invalid-input"
        ));
        assert!(matches!(
            invoke(
                &mut service,
                request(
                    &workspace_id,
                    SCORE_READ_MEASURE_RANGE_ID,
                    json!({
                        "startMeasureId": "measure-1",
                        "endMeasureId": "measure-2",
                        "maxMeasures": 33,
                    })
                )
            ),
            CapabilityResult::Rejected { ref code, .. }
                if code == "capability.invalid-input"
        ));
    }

    #[test]
    fn gateway_reports_a_missing_document_as_unavailable() {
        let workspace_id = Uuid::new_v4().to_string();
        assert!(matches!(
            invoke(
                &mut ScoreSessionService::default(),
                request(&workspace_id, SCORE_READ_SUMMARY_ID, json!({}))
            ),
            CapabilityResult::Unavailable { ref code, .. }
                if code == "score.document-unavailable"
        ));
    }
}
