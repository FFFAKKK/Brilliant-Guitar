use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

use crate::{application::ScoreSessionService, dto::CapabilityTransportRequest};

const SCORE_READ_SUMMARY_ID: &str = "score.read-summary";
const SCORE_READ_SUMMARY_VERSION: u64 = 1;

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

pub const CAPABILITY_CATALOG: &[CapabilityDescriptor] = &[SCORE_READ_SUMMARY];

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

#[derive(Clone, Debug, PartialEq, Serialize)]
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
        code: &'static str,
        message: String,
    },
    Rejected {
        invocation_id: String,
        capability_id: String,
        contract_version: u64,
        code: &'static str,
        message: String,
    },
    Failed {
        invocation_id: String,
        capability_id: String,
        contract_version: u64,
        code: &'static str,
        message: String,
    },
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
struct ReadSummaryInput {}

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
    if invocation.contract_version != descriptor.contract_version {
        return rejected(
            identity,
            "capability.unsupported-contract-version",
            "能力合同版本不受支持",
        );
    }

    match descriptor.id {
        SCORE_READ_SUMMARY_ID => {
            if serde_json::from_value::<ReadSummaryInput>(invocation.input).is_err() {
                return rejected(identity, "capability.invalid-input", "能力输入格式无效");
            }
            match service.read_summary(&invocation.workspace_id) {
                Ok(Some(summary)) => match serde_json::to_value(summary) {
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
                    code: "score.document-unavailable",
                    message: "当前工作区没有打开的乐谱".into(),
                },
                Err(_) => failed(
                    identity,
                    "capability.execution-failed",
                    "无法读取当前乐谱概要",
                ),
            }
        }
        _ => failed(identity, "capability.handler-missing", "能力处理器不可用"),
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
        code,
        message: message.into(),
    }
}

fn failed(identity: (String, String, u64), code: &'static str, message: &str) -> CapabilityResult {
    CapabilityResult::Failed {
        invocation_id: identity.0,
        capability_id: identity.1,
        contract_version: identity.2,
        code,
        message: message.into(),
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;
    use crate::dto::{CreateScoreRequest, NewScoreInput};

    fn request(workspace_id: &str, input: Value) -> CapabilityInvocation {
        CapabilityInvocation {
            invocation_id: Uuid::new_v4().to_string(),
            capability_id: SCORE_READ_SUMMARY_ID.into(),
            contract_version: SCORE_READ_SUMMARY_VERSION,
            workspace_id: workspace_id.into(),
            caller: CapabilityCaller::Test,
            input,
        }
    }

    #[test]
    fn catalog_declares_a_read_only_summary_capability() {
        assert_eq!(CAPABILITY_CATALOG, &[SCORE_READ_SUMMARY]);
        assert_eq!(SCORE_READ_SUMMARY.effects.document, "read");
        assert_eq!(SCORE_READ_SUMMARY.effects.filesystem, "none");
        assert_eq!(SCORE_READ_SUMMARY.effects.network, "none");
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

        let CapabilityResult::Completed { data, .. } =
            invoke(&service, request(&workspace_id, json!({})))
        else {
            panic!("summary capability must complete");
        };
        assert_eq!(data["title"], "能力概要");
        assert_eq!(data["measureCount"], 3);
        assert!(data.get("notation").is_none());
        assert!(data.get("playbackSource").is_none());
    }

    #[test]
    fn gateway_rejects_unknown_contracts_and_extra_input() {
        let workspace_id = Uuid::new_v4().to_string();
        let service = ScoreSessionService::default();
        let mut wrong_version = request(&workspace_id, json!({}));
        wrong_version.contract_version = 2;
        assert!(matches!(
            invoke(&service, wrong_version),
            CapabilityResult::Rejected {
                code: "capability.unsupported-contract-version",
                ..
            }
        ));
        assert!(matches!(
            invoke(&service, request(&workspace_id, json!({ "extra": true }))),
            CapabilityResult::Rejected {
                code: "capability.invalid-input",
                ..
            }
        ));
    }

    #[test]
    fn gateway_reports_a_missing_document_as_unavailable() {
        let workspace_id = Uuid::new_v4().to_string();
        assert!(matches!(
            invoke(
                &ScoreSessionService::default(),
                request(&workspace_id, json!({}))
            ),
            CapabilityResult::Unavailable {
                code: "score.document-unavailable",
                ..
            }
        ));
    }
}
