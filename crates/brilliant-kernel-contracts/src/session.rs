use brilliant_core_types::{
    API_VERSION_V1, DocumentVersionV1, ScoreSchemaVersionV1, StableId, StablePathV1,
};
use brilliant_score_foundation::ScoreDocumentV1;
use serde::{Deserialize, Serialize, Serializer, ser::SerializeStruct};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ShapeViolationV1 {
    MissingField,
    ExtraField,
    DuplicateField,
    WrongType,
    InvalidTag,
}

impl ShapeViolationV1 {
    fn as_str(self) -> &'static str {
        match self {
            Self::MissingField => "missing-field",
            Self::ExtraField => "extra-field",
            Self::DuplicateField => "duplicate-field",
            Self::WrongType => "wrong-type",
            Self::InvalidTag => "invalid-tag",
        }
    }
}

impl Serialize for ShapeViolationV1 {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(self.as_str())
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ScoreStructureViolationV1 {
    DuplicateId,
    InvalidReference,
    InvalidValue,
}

impl ScoreStructureViolationV1 {
    fn as_str(self) -> &'static str {
        match self {
            Self::DuplicateId => "duplicate-id",
            Self::InvalidReference => "invalid-reference",
            Self::InvalidValue => "invalid-value",
        }
    }
}

impl Serialize for ScoreStructureViolationV1 {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(self.as_str())
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum StableFailureV1 {
    BridgeCaptureInvalid,
    BridgeRequestTooLarge {
        limit_bytes: u64,
        actual_bytes: u64,
    },
    CodecInvalidUtf8,
    CodecInvalidJson,
    CodecInvalidShape {
        path: StablePathV1,
        violation: ShapeViolationV1,
    },
    ContractUnsupportedApiVersion {
        supported_version: u64,
    },
    ContractUnsupportedProtocolVersion {
        supported_version: u64,
    },
    ScoreUnsupportedSchema {
        supported_schema: &'static str,
    },
    ScoreInvalidStructure {
        path: StablePathV1,
        violation: ScoreStructureViolationV1,
    },
    CodecDepthLimit {
        limit: u64,
        actual: u64,
    },
    CodecPropertyLimit {
        limit: u64,
        actual: u64,
    },
    CodecNumberOutOfRange {
        path: StablePathV1,
    },
    BridgeHandleUnknown,
    BridgeHandleStale,
    BridgeHandleWrongEnvironment,
    BridgeHandleWrongThread,
    BridgeHandleReentrant,
    BridgeHandleBusy,
    BridgeHandlePoisoned,
    BridgeResponseTooLarge {
        limit_bytes: u64,
        actual_bytes: u64,
    },
    BridgePanicContained,
    BridgeInternal,
}

impl StableFailureV1 {
    pub const FAILURE_VERSION: u64 = 1;

    pub fn code(&self) -> &'static str {
        match self {
            Self::BridgeCaptureInvalid => "bridge.capture-invalid",
            Self::BridgeRequestTooLarge { .. } => "bridge.request-too-large",
            Self::CodecInvalidUtf8 => "codec.invalid-utf8",
            Self::CodecInvalidJson => "codec.invalid-json",
            Self::CodecInvalidShape { .. } => "codec.invalid-shape",
            Self::ContractUnsupportedApiVersion { .. } => "contract.unsupported-api-version",
            Self::ContractUnsupportedProtocolVersion { .. } => {
                "contract.unsupported-protocol-version"
            }
            Self::ScoreUnsupportedSchema { .. } => "score.unsupported-schema",
            Self::ScoreInvalidStructure { .. } => "score.invalid-structure",
            Self::CodecDepthLimit { .. } => "codec.depth-limit",
            Self::CodecPropertyLimit { .. } => "codec.property-limit",
            Self::CodecNumberOutOfRange { .. } => "codec.number-out-of-range",
            Self::BridgeHandleUnknown => "bridge.handle-unknown",
            Self::BridgeHandleStale => "bridge.handle-stale",
            Self::BridgeHandleWrongEnvironment => "bridge.handle-wrong-environment",
            Self::BridgeHandleWrongThread => "bridge.handle-wrong-thread",
            Self::BridgeHandleReentrant => "bridge.handle-reentrant",
            Self::BridgeHandleBusy => "bridge.handle-busy",
            Self::BridgeHandlePoisoned => "bridge.handle-poisoned",
            Self::BridgeResponseTooLarge { .. } => "bridge.response-too-large",
            Self::BridgePanicContained => "bridge.panic-contained",
            Self::BridgeInternal => "bridge.internal",
        }
    }
}

impl Serialize for StableFailureV1 {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let field_count = match self {
            Self::BridgeRequestTooLarge { .. }
            | Self::BridgeResponseTooLarge { .. }
            | Self::CodecDepthLimit { .. }
            | Self::CodecPropertyLimit { .. }
            | Self::CodecInvalidShape { .. }
            | Self::ScoreInvalidStructure { .. } => 4,
            Self::ContractUnsupportedApiVersion { .. }
            | Self::ContractUnsupportedProtocolVersion { .. }
            | Self::ScoreUnsupportedSchema { .. }
            | Self::CodecNumberOutOfRange { .. } => 3,
            _ => 2,
        };
        let mut state = serializer.serialize_struct("StableFailureV1", field_count)?;
        state.serialize_field("failureVersion", &Self::FAILURE_VERSION)?;
        state.serialize_field("code", self.code())?;
        match self {
            Self::BridgeRequestTooLarge {
                limit_bytes,
                actual_bytes,
            }
            | Self::BridgeResponseTooLarge {
                limit_bytes,
                actual_bytes,
            } => {
                state.serialize_field("limitBytes", limit_bytes)?;
                state.serialize_field("actualBytes", actual_bytes)?;
            }
            Self::CodecInvalidShape { path, violation } => {
                state.serialize_field("path", path)?;
                state.serialize_field("violation", violation)?;
            }
            Self::ContractUnsupportedApiVersion { supported_version }
            | Self::ContractUnsupportedProtocolVersion { supported_version } => {
                state.serialize_field("supportedVersion", supported_version)?;
            }
            Self::ScoreUnsupportedSchema { supported_schema } => {
                state.serialize_field("supportedSchema", supported_schema)?;
            }
            Self::ScoreInvalidStructure { path, violation } => {
                state.serialize_field("path", path)?;
                state.serialize_field("violation", violation)?;
            }
            Self::CodecDepthLimit { limit, actual }
            | Self::CodecPropertyLimit { limit, actual } => {
                state.serialize_field("limit", limit)?;
                state.serialize_field("actual", actual)?;
            }
            Self::CodecNumberOutOfRange { path } => state.serialize_field("path", path)?,
            Self::BridgeCaptureInvalid
            | Self::CodecInvalidUtf8
            | Self::CodecInvalidJson
            | Self::BridgeHandleUnknown
            | Self::BridgeHandleStale
            | Self::BridgeHandleWrongEnvironment
            | Self::BridgeHandleWrongThread
            | Self::BridgeHandleReentrant
            | Self::BridgeHandleBusy
            | Self::BridgeHandlePoisoned
            | Self::BridgePanicContained
            | Self::BridgeInternal => {}
        }
        state.end()
    }
}

#[derive(Clone, Debug, Eq, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct KernelSessionCreateRequestV1 {
    pub api_version: u64,
    pub document: ScoreDocumentV1,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KernelSessionCreateSuccessValueV1 {
    pub document_id: StableId,
    pub document_version: DocumentVersionV1,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum KernelSessionCreateResultV1 {
    Created(KernelSessionCreateSuccessValueV1),
    Rejected(StableFailureV1),
}

impl Serialize for KernelSessionCreateResultV1 {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        match self {
            Self::Created(value) => {
                let mut state = serializer.serialize_struct("KernelSessionCreateResultV1", 3)?;
                state.serialize_field("apiVersion", &API_VERSION_V1)?;
                state.serialize_field("status", "created")?;
                state.serialize_field("value", value)?;
                state.end()
            }
            Self::Rejected(failure) => {
                let mut state = serializer.serialize_struct("KernelSessionCreateResultV1", 3)?;
                state.serialize_field("apiVersion", &API_VERSION_V1)?;
                state.serialize_field("status", "rejected")?;
                state.serialize_field("failure", failure)?;
                state.end()
            }
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KernelSnapshotV1 {
    pub document_id: StableId,
    pub schema_version: &'static str,
    pub document_version: DocumentVersionV1,
    pub document: ScoreDocumentV1,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KernelHistoryStateV1 {
    pub undo_depth: u64,
    pub redo_depth: u64,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KernelReadStateV1 {
    pub snapshot: KernelSnapshotV1,
    pub history: KernelHistoryStateV1,
    pub dirty: bool,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum KernelSessionReadResultV1 {
    Ok(Box<KernelReadStateV1>),
    Rejected(StableFailureV1),
}

impl Serialize for KernelSessionReadResultV1 {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        match self {
            Self::Ok(value) => {
                let mut state = serializer.serialize_struct("KernelSessionReadResultV1", 3)?;
                state.serialize_field("apiVersion", &API_VERSION_V1)?;
                state.serialize_field("status", "ok")?;
                state.serialize_field("value", value)?;
                state.end()
            }
            Self::Rejected(failure) => {
                let mut state = serializer.serialize_struct("KernelSessionReadResultV1", 3)?;
                state.serialize_field("apiVersion", &API_VERSION_V1)?;
                state.serialize_field("status", "rejected")?;
                state.serialize_field("failure", failure)?;
                state.end()
            }
        }
    }
}

pub fn initial_snapshot(document: ScoreDocumentV1) -> KernelReadStateV1 {
    KernelReadStateV1 {
        snapshot: KernelSnapshotV1 {
            document_id: document.id.clone(),
            schema_version: ScoreSchemaVersionV1::VALUE,
            document_version: DocumentVersionV1::initial(),
            document,
        },
        history: KernelHistoryStateV1 {
            undo_depth: 0,
            redo_depth: 0,
        },
        dirty: false,
    }
}
