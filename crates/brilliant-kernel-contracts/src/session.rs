use std::sync::Arc;

use brilliant_core_types::{
    API_VERSION_V1, DocumentVersionV1, ScoreSchemaVersionV1, StableId, StablePathV1,
};
use brilliant_score_foundation::{
    MeasureDefinitionV1, PartMeasureContentV1, PartV1, RhythmicEventV1, ScoreDocumentV1,
    ScoreMetadataV1, ScoreNoteV1, StaffDefinitionV1, VoiceV1,
};
use serde::{Deserialize, Serialize, Serializer, ser::SerializeStruct};

use crate::{
    AffectedEntityAddressV1, CapturedCoreCommandV1, CoreCommandEnvelopeV1, CoreCommandIdV1,
    KernelStage3CommandFailureV1, KernelStage3MetricsV1, ScoreEntityTargetV1, ScoreRangeV1,
};

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

pub const CHECKPOINT_ENTRY_INTERVAL_V1: u64 = 512;
pub const CHECKPOINT_CHANGESET_BYTES_V1: u64 = 33_554_432;
pub const CHECKPOINT_RETAINED_COUNT_V1: usize = 1;

#[derive(Clone, Debug, Eq, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PersistedCheckpointV1 {
    pub document_id: StableId,
    pub document_version: DocumentVersionV1,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct KernelStage4OperationRequestV1 {
    pub api_version: u64,
    pub operation: KernelStage4OperationV1,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum KernelStage4OperationDecodeFailureV1 {
    Boundary(StableFailureV1),
    Command(KernelStage3CommandFailureV1),
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum KernelStage4OperationV1 {
    Submit {
        command: CoreCommandEnvelopeV1,
    },
    Undo,
    Redo,
    MarkPersisted {
        checkpoint: PersistedCheckpointV1,
    },
    MarkPersistedInvalid,
    Read {
        known_snapshot_version: Option<DocumentVersionV1>,
    },
    Select {
        selector: SelectorRequestV1,
    },
}

#[derive(Clone, Debug, Eq, PartialEq, Deserialize)]
#[serde(tag = "selectorId", rename_all = "kebab-case", deny_unknown_fields)]
pub enum SelectorRequestV1 {
    #[serde(rename = "core.selector.score-metadata")]
    ScoreMetadata,
    #[serde(rename = "core.selector.score-entity")]
    ScoreEntity { address: ScoreEntityTargetV1 },
    #[serde(rename = "core.selector.score-entity-ownership")]
    ScoreEntityOwnership { address: ScoreEntityTargetV1 },
    #[serde(rename = "core.selector.score-range")]
    ScoreRange { range: ScoreRangeV1 },
    #[serde(rename = "core.selector.history-state")]
    HistoryState,
    #[serde(rename = "core.selector.dirty-state")]
    DirtyState,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct KernelStage4ReplayRequestV1 {
    pub api_version: u64,
    pub initial_document: ScoreDocumentV1,
    pub commands: Vec<CapturedCoreCommandV1>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum KernelEventCauseV1 {
    Submit,
    Undo,
    Redo,
    MarkPersisted,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum KernelEventV1 {
    DocumentCommitted {
        event_sequence: u64,
        document_id: StableId,
        document_version: DocumentVersionV1,
        cause: KernelEventCauseV1,
        command_id: CoreCommandIdV1,
        affected_entities: Vec<AffectedEntityAddressV1>,
    },
    DirtyStateChanged {
        event_sequence: u64,
        document_id: StableId,
        document_version: DocumentVersionV1,
        cause: KernelEventCauseV1,
        dirty: bool,
    },
}

impl Serialize for KernelEventV1 {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        match self {
            Self::DocumentCommitted {
                event_sequence,
                document_id,
                document_version,
                cause,
                command_id,
                affected_entities,
            } => {
                let mut state = serializer.serialize_struct("KernelEventV1", 8)?;
                state.serialize_field("eventVersion", &1_u64)?;
                state.serialize_field("eventSequence", event_sequence)?;
                state.serialize_field("eventType", "core.document.committed")?;
                state.serialize_field("documentId", document_id)?;
                state.serialize_field("documentVersion", document_version)?;
                state.serialize_field("cause", cause)?;
                state.serialize_field("commandId", command_id)?;
                state.serialize_field("affectedEntities", affected_entities)?;
                state.end()
            }
            Self::DirtyStateChanged {
                event_sequence,
                document_id,
                document_version,
                cause,
                dirty,
            } => {
                let mut state = serializer.serialize_struct("KernelEventV1", 7)?;
                state.serialize_field("eventVersion", &1_u64)?;
                state.serialize_field("eventSequence", event_sequence)?;
                state.serialize_field("eventType", "core.session.dirty-state-changed")?;
                state.serialize_field("documentId", document_id)?;
                state.serialize_field("documentVersion", document_version)?;
                state.serialize_field("cause", cause)?;
                state.serialize_field("dirty", dirty)?;
                state.end()
            }
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum KernelStage4FailureV1 {
    Command(KernelStage3CommandFailureV1),
    HistoryEmptyUndo,
    HistoryEmptyRedo,
    HistoryInvariantViolation,
    CheckpointInvalid,
    CheckpointDocumentMismatch,
    CheckpointVersionUnavailable,
    CheckpointInvariantViolation,
    ReadInvalidAddress,
    ReadEntityNotFound,
    ReadInvalidRange,
    ReadRangeEndpointNotFound,
    ReadRangeOwnerMismatch,
    ReadInvalidSnapshot,
    ReadInvariantViolation,
    EventReentrantWrite,
    EventSequenceOverflow,
}

impl KernelStage4FailureV1 {
    pub const fn code(&self) -> Option<&'static str> {
        Some(match self {
            Self::Command(_) => return None,
            Self::HistoryEmptyUndo => "history.empty-undo",
            Self::HistoryEmptyRedo => "history.empty-redo",
            Self::HistoryInvariantViolation => "history.invariant-violation",
            Self::CheckpointInvalid => "checkpoint.invalid",
            Self::CheckpointDocumentMismatch => "checkpoint.document-mismatch",
            Self::CheckpointVersionUnavailable => "checkpoint.version-unavailable",
            Self::CheckpointInvariantViolation => "checkpoint.invariant-violation",
            Self::ReadInvalidAddress => "read.invalid-address",
            Self::ReadEntityNotFound => "read.entity-not-found",
            Self::ReadInvalidRange => "read.invalid-range",
            Self::ReadRangeEndpointNotFound => "read.range-endpoint-not-found",
            Self::ReadRangeOwnerMismatch => "read.range-owner-mismatch",
            Self::ReadInvalidSnapshot => "read.invalid-snapshot",
            Self::ReadInvariantViolation => "read.invariant-violation",
            Self::EventReentrantWrite => "event.reentrant-write",
            Self::EventSequenceOverflow => "event.sequence-overflow",
        })
    }
}

impl From<KernelStage3CommandFailureV1> for KernelStage4FailureV1 {
    fn from(value: KernelStage3CommandFailureV1) -> Self {
        Self::Command(value)
    }
}

impl Serialize for KernelStage4FailureV1 {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        if let Self::Command(failure) = self {
            return failure.serialize(serializer);
        }
        let mut state = serializer.serialize_struct("KernelStage4FailureV1", 1)?;
        state.serialize_field("code", self.code().expect("non-command failure has code"))?;
        state.end()
    }
}

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KernelStage4MetricsV1 {
    pub full_snapshot_materializations: u64,
    pub selector_records_visited: u64,
    pub selector_records_returned: u64,
    pub checkpoint_attempts: u64,
    pub checkpoint_successes: u64,
    pub checkpoint_failures: u64,
    pub checkpoint_materialized_bytes: u64,
    pub events_reserved: u64,
    pub events_emitted: u64,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KernelStage4MutationValueV1 {
    pub document_version: DocumentVersionV1,
    pub affected: Vec<AffectedEntityAddressV1>,
    pub history: KernelHistoryStateV1,
    pub dirty: bool,
    pub metrics: KernelStage3MetricsV1,
    pub stage4_metrics: KernelStage4MetricsV1,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KernelStage4RejectedValueV1 {
    pub document_version: DocumentVersionV1,
    pub history: KernelHistoryStateV1,
    pub dirty: bool,
    pub metrics: KernelStage3MetricsV1,
    pub stage4_metrics: KernelStage4MetricsV1,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum KernelStage4CommandResultV1 {
    Committed {
        value: KernelStage4MutationValueV1,
        events: Vec<KernelEventV1>,
    },
    NoOp {
        value: KernelStage4MutationValueV1,
    },
    Rejected {
        value: KernelStage4RejectedValueV1,
        failure: KernelStage4FailureV1,
    },
}

impl Serialize for KernelStage4CommandResultV1 {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        match self {
            Self::Committed { value, events } => {
                let mut state = serializer.serialize_struct("KernelStage4CommandResultV1", 4)?;
                state.serialize_field("apiVersion", &API_VERSION_V1)?;
                state.serialize_field("status", "committed")?;
                state.serialize_field("value", value)?;
                state.serialize_field("events", events)?;
                state.end()
            }
            Self::NoOp { value } => {
                let mut state = serializer.serialize_struct("KernelStage4CommandResultV1", 4)?;
                state.serialize_field("apiVersion", &API_VERSION_V1)?;
                state.serialize_field("status", "no-op")?;
                state.serialize_field("value", value)?;
                state.serialize_field("events", &[] as &[KernelEventV1])?;
                state.end()
            }
            Self::Rejected { value, failure } => {
                let mut state = serializer.serialize_struct("KernelStage4CommandResultV1", 5)?;
                state.serialize_field("apiVersion", &API_VERSION_V1)?;
                state.serialize_field("status", "command-rejected")?;
                state.serialize_field("value", value)?;
                state.serialize_field("failure", failure)?;
                state.serialize_field("events", &[] as &[KernelEventV1])?;
                state.end()
            }
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KernelStage4MarkPersistedValueV1 {
    pub document_version: DocumentVersionV1,
    pub dirty: bool,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum KernelStage4MarkPersistedResultV1 {
    Updated {
        value: KernelStage4MarkPersistedValueV1,
        events: Vec<KernelEventV1>,
    },
    NoOp {
        value: KernelStage4MarkPersistedValueV1,
    },
    Rejected {
        value: KernelStage4MarkPersistedValueV1,
        failure: KernelStage4FailureV1,
    },
}

impl Serialize for KernelStage4MarkPersistedResultV1 {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        match self {
            Self::Updated { value, events } => {
                let mut state =
                    serializer.serialize_struct("KernelStage4MarkPersistedResultV1", 4)?;
                state.serialize_field("apiVersion", &API_VERSION_V1)?;
                state.serialize_field("status", "updated")?;
                state.serialize_field("value", value)?;
                state.serialize_field("events", events)?;
                state.end()
            }
            Self::NoOp { value } => {
                let mut state =
                    serializer.serialize_struct("KernelStage4MarkPersistedResultV1", 4)?;
                state.serialize_field("apiVersion", &API_VERSION_V1)?;
                state.serialize_field("status", "no-op")?;
                state.serialize_field("value", value)?;
                state.serialize_field("events", &[] as &[KernelEventV1])?;
                state.end()
            }
            Self::Rejected { value, failure } => {
                let mut state =
                    serializer.serialize_struct("KernelStage4MarkPersistedResultV1", 5)?;
                state.serialize_field("apiVersion", &API_VERSION_V1)?;
                state.serialize_field("status", "checkpoint-rejected")?;
                state.serialize_field("value", value)?;
                state.serialize_field("failure", failure)?;
                state.serialize_field("events", &[] as &[KernelEventV1])?;
                state.end()
            }
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KernelStage4SnapshotV1 {
    pub document_id: StableId,
    pub schema_version: &'static str,
    pub document_version: DocumentVersionV1,
    pub document: Option<SharedScoreDocumentV1>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SharedScoreDocumentV1(Arc<ScoreDocumentV1>);

impl SharedScoreDocumentV1 {
    pub fn new(document: ScoreDocumentV1) -> Self {
        Self(Arc::new(document))
    }

    pub fn from_arc(document: Arc<ScoreDocumentV1>) -> Self {
        Self(document)
    }

    pub fn as_document(&self) -> &ScoreDocumentV1 {
        &self.0
    }

    pub fn into_arc(self) -> Arc<ScoreDocumentV1> {
        self.0
    }
}

impl Serialize for SharedScoreDocumentV1 {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        self.0.as_ref().serialize(serializer)
    }
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KernelStage4ReadStateV1 {
    pub snapshot: KernelStage4SnapshotV1,
    pub history: KernelHistoryStateV1,
    pub dirty: bool,
    pub stage4_metrics: KernelStage4MetricsV1,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum KernelStage4ReadResultV1 {
    Ok(Box<KernelStage4ReadStateV1>),
    Rejected(KernelStage4FailureV1),
}

impl Serialize for KernelStage4ReadResultV1 {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        match self {
            Self::Ok(value) => {
                let mut state = serializer.serialize_struct("KernelStage4ReadResultV1", 3)?;
                state.serialize_field("apiVersion", &API_VERSION_V1)?;
                state.serialize_field("status", "ok")?;
                state.serialize_field("value", value)?;
                state.end()
            }
            Self::Rejected(failure) => {
                let mut state = serializer.serialize_struct("KernelStage4ReadResultV1", 3)?;
                state.serialize_field("apiVersion", &API_VERSION_V1)?;
                state.serialize_field("status", "read-rejected")?;
                state.serialize_field("failure", failure)?;
                state.end()
            }
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(tag = "kind", content = "value", rename_all = "kebab-case")]
pub enum SelectedScoreEntityV1 {
    Document(ScoreDocumentV1),
    Measure(MeasureDefinitionV1),
    Part(PartV1),
    Staff(StaffDefinitionV1),
    Voice(VoiceV1),
    Event(RhythmicEventV1),
    Note(ScoreNoteV1),
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(
    tag = "entityKind",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase"
)]
pub enum ScoreEntityOwnershipV1 {
    Document {
        document_id: StableId,
    },
    Measure {
        document_id: StableId,
    },
    Part {
        document_id: StableId,
    },
    Staff {
        document_id: StableId,
        part_id: StableId,
    },
    Voice {
        document_id: StableId,
        part_id: StableId,
        measure_id: StableId,
    },
    Event {
        document_id: StableId,
        part_id: StableId,
        measure_id: StableId,
        voice_id: StableId,
    },
    Note {
        document_id: StableId,
        part_id: StableId,
        measure_id: StableId,
        voice_id: StableId,
        event_id: StableId,
    },
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(
    tag = "kind",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase"
)]
pub enum ScoreRangeSelectionV1 {
    MeasureRange {
        normalized: ScoreRangeV1,
        measures: Vec<MeasureDefinitionV1>,
    },
    PartMeasureRange {
        normalized: ScoreRangeV1,
        measure_contents: Vec<PartMeasureContentV1>,
    },
    VoiceEventRange {
        normalized: ScoreRangeV1,
        events: Vec<RhythmicEventV1>,
    },
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(untagged)]
pub enum KernelSelectorValueV1 {
    Metadata(ScoreMetadataV1),
    Entity(SelectedScoreEntityV1),
    Ownership(ScoreEntityOwnershipV1),
    Range(ScoreRangeSelectionV1),
    History(KernelHistoryStateV1),
    Dirty(bool),
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum KernelSelectorResultV1 {
    Ok(KernelSelectorValueV1),
    Rejected(KernelStage4FailureV1),
}

impl Serialize for KernelSelectorResultV1 {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        match self {
            Self::Ok(value) => {
                let mut state = serializer.serialize_struct("KernelSelectorResultV1", 2)?;
                state.serialize_field("ok", &true)?;
                state.serialize_field("value", value)?;
                state.end()
            }
            Self::Rejected(failure) => {
                let mut state = serializer.serialize_struct("KernelSelectorResultV1", 2)?;
                state.serialize_field("ok", &false)?;
                state.serialize_field("failure", failure)?;
                state.end()
            }
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KernelStage4SelectValueV1 {
    pub document_version: DocumentVersionV1,
    pub selection: KernelSelectorResultV1,
    pub stage4_metrics: KernelStage4MetricsV1,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct KernelStage4SelectResultV1 {
    pub value: KernelStage4SelectValueV1,
}

impl Serialize for KernelStage4SelectResultV1 {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let mut state = serializer.serialize_struct("KernelStage4SelectResultV1", 3)?;
        state.serialize_field("apiVersion", &API_VERSION_V1)?;
        state.serialize_field("status", "ok")?;
        state.serialize_field("value", &self.value)?;
        state.end()
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum KernelStage4OperationResultV1 {
    Command(KernelStage4CommandResultV1),
    MarkPersisted(KernelStage4MarkPersistedResultV1),
    Read(KernelStage4ReadResultV1),
    Select(KernelStage4SelectResultV1),
    Rejected(StableFailureV1),
}

impl Serialize for KernelStage4OperationResultV1 {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        match self {
            Self::Command(value) => value.serialize(serializer),
            Self::MarkPersisted(value) => value.serialize(serializer),
            Self::Read(value) => value.serialize(serializer),
            Self::Select(value) => value.serialize(serializer),
            Self::Rejected(failure) => {
                let mut state = serializer.serialize_struct("KernelStage4OperationResultV1", 3)?;
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
pub struct KernelStage4ReplayCommandResultV1 {
    pub status: &'static str,
    pub document_version: DocumentVersionV1,
    pub history: KernelHistoryStateV1,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub failure: Option<KernelStage4FailureV1>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum KernelStage4ReplayResultV1 {
    Replayed {
        final_document: ScoreDocumentV1,
        document_version: DocumentVersionV1,
        results: Vec<KernelStage4ReplayCommandResultV1>,
    },
    Rejected {
        final_document: ScoreDocumentV1,
        document_version: DocumentVersionV1,
        results: Vec<KernelStage4ReplayCommandResultV1>,
        failed_command_index: u64,
        failure: KernelStage4FailureV1,
    },
    InvalidInitialDocument(StableFailureV1),
}

impl Serialize for KernelStage4ReplayResultV1 {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        match self {
            Self::Replayed {
                final_document,
                document_version,
                results,
            } => {
                let mut state = serializer.serialize_struct("KernelStage4ReplayResultV1", 5)?;
                state.serialize_field("apiVersion", &API_VERSION_V1)?;
                state.serialize_field("status", "replayed")?;
                state.serialize_field("finalDocument", final_document)?;
                state.serialize_field("documentVersion", document_version)?;
                state.serialize_field("results", results)?;
                state.end()
            }
            Self::Rejected {
                final_document,
                document_version,
                results,
                failed_command_index,
                failure,
            } => {
                let mut state = serializer.serialize_struct("KernelStage4ReplayResultV1", 7)?;
                state.serialize_field("apiVersion", &API_VERSION_V1)?;
                state.serialize_field("status", "rejected")?;
                state.serialize_field("finalDocument", final_document)?;
                state.serialize_field("documentVersion", document_version)?;
                state.serialize_field("results", results)?;
                state.serialize_field("failedCommandIndex", failed_command_index)?;
                state.serialize_field("failure", failure)?;
                state.end()
            }
            Self::InvalidInitialDocument(failure) => {
                let mut state = serializer.serialize_struct("KernelStage4ReplayResultV1", 3)?;
                state.serialize_field("apiVersion", &API_VERSION_V1)?;
                state.serialize_field("status", "invalid-initial-document")?;
                state.serialize_field("failure", failure)?;
                state.end()
            }
        }
    }
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
