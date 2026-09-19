use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

use crate::{
    application::ScoreSessionService,
    dto::{CapabilityTransportRequest, ScoreMeasureIndexV1, ScoreMeasureRangeV1},
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

pub const CAPABILITY_CATALOG: &[CapabilityDescriptor] = &[
    SCORE_READ_SUMMARY,
    SCORE_READ_METADATA,
    SCORE_READ_STRUCTURE,
    SCORE_READ_MEASURE_INDEX,
    SCORE_READ_MEASURE_RANGE,
];

#[derive(Clone, Debug)]
pub struct CapabilityInvocation {
    pub invocation_id: String,
    pub capability_id: String,
    pub contract_version: u64,
    pub workspace_id: String,
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

fn valid_stable_id(value: &str) -> bool {
    !value.is_empty() && value.encode_utf16().count() <= 256
}

pub fn invoke(service: &ScoreSessionService, invocation: CapabilityInvocation) -> CapabilityResult {
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
        _ => failed(identity, "capability.handler-missing", "能力处理器不可用"),
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
            caller: CapabilityCaller::Test,
            input,
        }
    }

    #[test]
    fn catalog_declares_five_read_only_score_capabilities() {
        assert_eq!(
            CAPABILITY_CATALOG,
            &[
                SCORE_READ_SUMMARY,
                SCORE_READ_METADATA,
                SCORE_READ_STRUCTURE,
                SCORE_READ_MEASURE_INDEX,
                SCORE_READ_MEASURE_RANGE,
            ]
        );
        for descriptor in CAPABILITY_CATALOG {
            assert_eq!(descriptor.effects.document, "read");
            assert_eq!(descriptor.effects.filesystem, "none");
            assert_eq!(descriptor.effects.network, "none");
        }
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
            &service,
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
            &service,
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
            &service,
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
            &service,
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
            &service,
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
            invoke(&service, agent_request),
            CapabilityResult::Rejected { ref code, .. } if code == "capability.unknown"
        ));
        assert!(matches!(
            invoke(
                &service,
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
    fn gateway_rejects_unknown_contracts_and_extra_input() {
        let workspace_id = Uuid::new_v4().to_string();
        let service = ScoreSessionService::default();
        let mut wrong_version = request(&workspace_id, SCORE_READ_SUMMARY_ID, json!({}));
        wrong_version.contract_version = 2;
        assert!(matches!(
            invoke(&service, wrong_version),
            CapabilityResult::Rejected { ref code, .. }
                if code == "capability.unsupported-contract-version"
        ));
        assert!(matches!(
            invoke(
                &service,
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
                &service,
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
                &ScoreSessionService::default(),
                request(&workspace_id, SCORE_READ_SUMMARY_ID, json!({}))
            ),
            CapabilityResult::Unavailable { ref code, .. }
                if code == "score.document-unavailable"
        ));
    }
}
