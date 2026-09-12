use brilliant_core_types::{API_VERSION_V1, DocumentVersionV1, StableId};
use brilliant_core_types::{JsString, LosslessJsonValue};
use brilliant_score_foundation::{
    ClefV1, FractionV1, InstrumentDescriptorV1, MeasureDefinitionV1, MeterV1, NoteValueV1, PartV1,
    RhythmicEventV1, ScoreMetadataV1, StaffDefinitionV1, TranspositionV1, VoiceV1, WrittenPitchV1,
};
use serde::{Deserialize, Serialize, Serializer, ser::SerializeStruct};

use crate::{AffectedEntityIdV1, StableFailureV1};

pub const COMMAND_VERSION_V1: u64 = 1;
pub const CORE_COMMAND_COUNT_V1: usize = 28;
pub const MAX_BATCH_CHILDREN_V1: usize = 100;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum CoreCommandTargetKindV1 {
    Document,
    Measure,
    Part,
    Staff,
    Voice,
    Event,
    Note,
}

impl CoreCommandTargetKindV1 {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Document => "document",
            Self::Measure => "measure",
            Self::Part => "part",
            Self::Staff => "staff",
            Self::Voice => "voice",
            Self::Event => "event",
            Self::Note => "note",
        }
    }
}

impl Serialize for CoreCommandTargetKindV1 {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(self.as_str())
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum CoreCommandIdV1 {
    DocumentSetMetadata,
    NoteSetWrittenPitch,
    EventSetNoteValue,
    VoiceInsertNotesEvent,
    VoiceInsertRestEvent,
    EventRemove,
    MeasureInsert,
    MeasureRemove,
    MeasureMove,
    MeasureSetDefinition,
    PartInsert,
    PartRemove,
    PartMove,
    PartSetName,
    PartSetInstrument,
    StaffInsert,
    StaffRemove,
    StaffMove,
    StaffSetDefinition,
    VoiceInsert,
    VoiceRemove,
    VoiceMove,
    VoiceSetDefaultStaff,
    VoiceSetSequenceStart,
    EventSetStaffAssignment,
    RangeDelete,
    RangeTransposeWrittenPitch,
    TransactionBatch,
}

impl CoreCommandIdV1 {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::DocumentSetMetadata => "core.document.set-metadata",
            Self::NoteSetWrittenPitch => "core.note.set-written-pitch",
            Self::EventSetNoteValue => "core.event.set-note-value",
            Self::VoiceInsertNotesEvent => "core.voice.insert-notes-event",
            Self::VoiceInsertRestEvent => "core.voice.insert-rest-event",
            Self::EventRemove => "core.event.remove",
            Self::MeasureInsert => "core.measure.insert",
            Self::MeasureRemove => "core.measure.remove",
            Self::MeasureMove => "core.measure.move",
            Self::MeasureSetDefinition => "core.measure.set-definition",
            Self::PartInsert => "core.part.insert",
            Self::PartRemove => "core.part.remove",
            Self::PartMove => "core.part.move",
            Self::PartSetName => "core.part.set-name",
            Self::PartSetInstrument => "core.part.set-instrument",
            Self::StaffInsert => "core.staff.insert",
            Self::StaffRemove => "core.staff.remove",
            Self::StaffMove => "core.staff.move",
            Self::StaffSetDefinition => "core.staff.set-definition",
            Self::VoiceInsert => "core.voice.insert",
            Self::VoiceRemove => "core.voice.remove",
            Self::VoiceMove => "core.voice.move",
            Self::VoiceSetDefaultStaff => "core.voice.set-default-staff",
            Self::VoiceSetSequenceStart => "core.voice.set-sequence-start",
            Self::EventSetStaffAssignment => "core.event.set-staff-assignment",
            Self::RangeDelete => "core.range.delete",
            Self::RangeTransposeWrittenPitch => "core.range.transpose-written-pitch",
            Self::TransactionBatch => "core.transaction.batch",
        }
    }

    pub fn from_wire(value: &str) -> Option<Self> {
        CORE_COMMAND_CATALOG_V1
            .iter()
            .find(|definition| definition.command_id.as_str() == value)
            .map(|definition| definition.command_id)
    }

    pub const fn target_kind(self) -> CoreCommandTargetKindV1 {
        match self {
            Self::DocumentSetMetadata
            | Self::MeasureInsert
            | Self::PartInsert
            | Self::RangeDelete
            | Self::RangeTransposeWrittenPitch
            | Self::TransactionBatch => CoreCommandTargetKindV1::Document,
            Self::MeasureRemove | Self::MeasureMove | Self::MeasureSetDefinition => {
                CoreCommandTargetKindV1::Measure
            }
            Self::PartRemove
            | Self::PartMove
            | Self::PartSetName
            | Self::PartSetInstrument
            | Self::StaffInsert
            | Self::VoiceInsert => CoreCommandTargetKindV1::Part,
            Self::StaffRemove | Self::StaffMove | Self::StaffSetDefinition => {
                CoreCommandTargetKindV1::Staff
            }
            Self::VoiceInsertNotesEvent
            | Self::VoiceInsertRestEvent
            | Self::VoiceRemove
            | Self::VoiceMove
            | Self::VoiceSetDefaultStaff
            | Self::VoiceSetSequenceStart => CoreCommandTargetKindV1::Voice,
            Self::EventSetNoteValue | Self::EventRemove | Self::EventSetStaffAssignment => {
                CoreCommandTargetKindV1::Event
            }
            Self::NoteSetWrittenPitch => CoreCommandTargetKindV1::Note,
        }
    }
}

impl Serialize for CoreCommandIdV1 {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(self.as_str())
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CoreCommandDefinitionV1 {
    pub command_id: CoreCommandIdV1,
    pub target_kind: CoreCommandTargetKindV1,
}

const fn definition(command_id: CoreCommandIdV1) -> CoreCommandDefinitionV1 {
    CoreCommandDefinitionV1 {
        command_id,
        target_kind: command_id.target_kind(),
    }
}

pub const CORE_COMMAND_CATALOG_V1: [CoreCommandDefinitionV1; CORE_COMMAND_COUNT_V1] = [
    definition(CoreCommandIdV1::DocumentSetMetadata),
    definition(CoreCommandIdV1::NoteSetWrittenPitch),
    definition(CoreCommandIdV1::EventSetNoteValue),
    definition(CoreCommandIdV1::VoiceInsertNotesEvent),
    definition(CoreCommandIdV1::VoiceInsertRestEvent),
    definition(CoreCommandIdV1::EventRemove),
    definition(CoreCommandIdV1::MeasureInsert),
    definition(CoreCommandIdV1::MeasureRemove),
    definition(CoreCommandIdV1::MeasureMove),
    definition(CoreCommandIdV1::MeasureSetDefinition),
    definition(CoreCommandIdV1::PartInsert),
    definition(CoreCommandIdV1::PartRemove),
    definition(CoreCommandIdV1::PartMove),
    definition(CoreCommandIdV1::PartSetName),
    definition(CoreCommandIdV1::PartSetInstrument),
    definition(CoreCommandIdV1::StaffInsert),
    definition(CoreCommandIdV1::StaffRemove),
    definition(CoreCommandIdV1::StaffMove),
    definition(CoreCommandIdV1::StaffSetDefinition),
    definition(CoreCommandIdV1::VoiceInsert),
    definition(CoreCommandIdV1::VoiceRemove),
    definition(CoreCommandIdV1::VoiceMove),
    definition(CoreCommandIdV1::VoiceSetDefaultStaff),
    definition(CoreCommandIdV1::VoiceSetSequenceStart),
    definition(CoreCommandIdV1::EventSetStaffAssignment),
    definition(CoreCommandIdV1::RangeDelete),
    definition(CoreCommandIdV1::RangeTransposeWrittenPitch),
    definition(CoreCommandIdV1::TransactionBatch),
];

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "kebab-case", deny_unknown_fields)]
pub enum ScoreEntityTargetV1<Id = StableId> {
    Document {
        #[serde(rename = "documentId")]
        document_id: Id,
    },
    Measure {
        #[serde(rename = "measureId")]
        measure_id: Id,
    },
    Part {
        #[serde(rename = "partId")]
        part_id: Id,
    },
    Staff {
        #[serde(rename = "staffId")]
        staff_id: Id,
    },
    Voice {
        #[serde(rename = "voiceId")]
        voice_id: Id,
    },
    Event {
        #[serde(rename = "eventId")]
        event_id: Id,
    },
    Note {
        #[serde(rename = "noteId")]
        note_id: Id,
    },
}

pub type AffectedEntityAddressV1 = ScoreEntityTargetV1<AffectedEntityIdV1>;

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum NoteAddressV1<Id = StableId> {
    Note {
        #[serde(rename = "noteId")]
        note_id: Id,
    },
}

impl<Id> ScoreEntityTargetV1<Id> {
    pub const fn kind(&self) -> CoreCommandTargetKindV1 {
        match self {
            Self::Document { .. } => CoreCommandTargetKindV1::Document,
            Self::Measure { .. } => CoreCommandTargetKindV1::Measure,
            Self::Part { .. } => CoreCommandTargetKindV1::Part,
            Self::Staff { .. } => CoreCommandTargetKindV1::Staff,
            Self::Voice { .. } => CoreCommandTargetKindV1::Voice,
            Self::Event { .. } => CoreCommandTargetKindV1::Event,
            Self::Note { .. } => CoreCommandTargetKindV1::Note,
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "kebab-case", deny_unknown_fields)]
pub enum SequenceAnchorV1 {
    Start,
    AfterEvent {
        #[serde(rename = "eventId")]
        event_id: StableId,
    },
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "kebab-case", deny_unknown_fields)]
pub enum MeasureAnchorV1<Id = StableId> {
    Start,
    AfterMeasure {
        #[serde(rename = "measureId")]
        measure_id: Id,
    },
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "kebab-case", deny_unknown_fields)]
pub enum PartAnchorV1<Id = StableId> {
    Start,
    AfterPart {
        #[serde(rename = "partId")]
        part_id: Id,
    },
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "kebab-case", deny_unknown_fields)]
pub enum StaffAnchorV1<Id = StableId> {
    Start,
    AfterStaff {
        #[serde(rename = "staffId")]
        staff_id: Id,
    },
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "kebab-case", deny_unknown_fields)]
pub enum VoiceAnchorV1<Id = StableId> {
    Start,
    AfterVoice {
        #[serde(rename = "voiceId")]
        voice_id: Id,
    },
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MeasurePointV1 {
    pub kind: MeasurePointKindV1,
    pub measure_id: StableId,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum MeasurePointKindV1 {
    Measure,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PartMeasurePointV1 {
    pub kind: PartMeasurePointKindV1,
    pub part_id: StableId,
    pub measure_id: StableId,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum PartMeasurePointKindV1 {
    PartMeasure,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct VoiceEventPointV1 {
    pub kind: VoiceEventPointKindV1,
    pub voice_id: StableId,
    pub event_id: StableId,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum VoiceEventPointKindV1 {
    VoiceEvent,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "kebab-case", deny_unknown_fields)]
pub enum ScoreRangeV1 {
    MeasureRange {
        start: MeasurePointV1,
        end: MeasurePointV1,
    },
    PartMeasureRange {
        start: PartMeasurePointV1,
        end: PartMeasurePointV1,
    },
    VoiceEventRange {
        start: VoiceEventPointV1,
        end: VoiceEventPointV1,
    },
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "kebab-case", deny_unknown_fields)]
pub enum MeasurePickupV1 {
    None,
    Duration { duration: FractionV1 },
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "kebab-case", deny_unknown_fields)]
pub enum EventStaffAssignmentV1<Id = StableId> {
    InheritDefault,
    Staff {
        #[serde(rename = "staffId")]
        staff_id: Id,
    },
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct InsertMeasurePartContentV1<Id = StableId> {
    pub part_id: Id,
    pub voices: Vec<VoiceV1<Id>>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CapturedCoreCommandV1(LosslessJsonValue);

impl CapturedCoreCommandV1 {
    pub(crate) const fn from_json(value: LosslessJsonValue) -> Self {
        Self(value)
    }

    /// Borrow immutable captured child data for the versioned integrated router.
    /// Reading it does not decode or authorize a Core or module command.
    pub const fn as_json(&self) -> &LosslessJsonValue {
        &self.0
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum CoreCommandEnvelopeV1<Id = StableId> {
    DocumentSetMetadata {
        target: ScoreEntityTargetV1,
        metadata: ScoreMetadataV1,
    },
    NoteSetWrittenPitch {
        target: ScoreEntityTargetV1,
        written_pitch: WrittenPitchV1,
    },
    EventSetNoteValue {
        target: ScoreEntityTargetV1,
        note_value: NoteValueV1,
    },
    VoiceInsertNotesEvent {
        target: ScoreEntityTargetV1,
        anchor: SequenceAnchorV1,
        event: RhythmicEventV1,
    },
    VoiceInsertRestEvent {
        target: ScoreEntityTargetV1,
        anchor: SequenceAnchorV1,
        event: RhythmicEventV1,
    },
    EventRemove {
        target: ScoreEntityTargetV1,
    },
    MeasureInsert {
        target: ScoreEntityTargetV1,
        anchor: MeasureAnchorV1<Id>,
        definition: MeasureDefinitionV1<Id>,
        contents: Vec<InsertMeasurePartContentV1<Id>>,
    },
    MeasureRemove {
        target: ScoreEntityTargetV1,
    },
    MeasureMove {
        target: ScoreEntityTargetV1,
        anchor: MeasureAnchorV1<Id>,
    },
    MeasureSetDefinition {
        target: ScoreEntityTargetV1,
        meter: MeterV1,
        pickup: MeasurePickupV1,
    },
    PartInsert {
        target: ScoreEntityTargetV1,
        anchor: PartAnchorV1<Id>,
        part: PartV1<Id>,
    },
    PartRemove {
        target: ScoreEntityTargetV1,
    },
    PartMove {
        target: ScoreEntityTargetV1,
        anchor: PartAnchorV1<Id>,
    },
    PartSetName {
        target: ScoreEntityTargetV1,
        name: JsString,
    },
    PartSetInstrument {
        target: ScoreEntityTargetV1,
        instrument: InstrumentDescriptorV1,
    },
    StaffInsert {
        target: ScoreEntityTargetV1,
        anchor: StaffAnchorV1<Id>,
        staff: StaffDefinitionV1<Id>,
    },
    StaffRemove {
        target: ScoreEntityTargetV1,
    },
    StaffMove {
        target: ScoreEntityTargetV1,
        anchor: StaffAnchorV1<Id>,
    },
    StaffSetDefinition {
        target: ScoreEntityTargetV1,
        line_count: brilliant_core_types::SafeInteger,
        default_clef: ClefV1,
    },
    VoiceInsert {
        target: ScoreEntityTargetV1,
        measure_id: Id,
        anchor: VoiceAnchorV1<Id>,
        voice: VoiceV1<Id>,
    },
    VoiceRemove {
        target: ScoreEntityTargetV1,
    },
    VoiceMove {
        target: ScoreEntityTargetV1,
        anchor: VoiceAnchorV1<Id>,
    },
    VoiceSetDefaultStaff {
        target: ScoreEntityTargetV1,
        staff_id: Id,
    },
    VoiceSetSequenceStart {
        target: ScoreEntityTargetV1,
        start: FractionV1,
    },
    EventSetStaffAssignment {
        target: ScoreEntityTargetV1,
        assignment: EventStaffAssignmentV1<Id>,
    },
    RangeDelete {
        target: ScoreEntityTargetV1,
        range: ScoreRangeV1,
    },
    RangeTransposeWrittenPitch {
        target: ScoreEntityTargetV1,
        range: ScoreRangeV1,
        transposition: TranspositionV1,
    },
    TransactionBatch {
        target: ScoreEntityTargetV1,
        commands: Vec<CapturedCoreCommandV1>,
    },
}

impl<Id> CoreCommandEnvelopeV1<Id> {
    pub const fn command_id(&self) -> CoreCommandIdV1 {
        match self {
            Self::DocumentSetMetadata { .. } => CoreCommandIdV1::DocumentSetMetadata,
            Self::NoteSetWrittenPitch { .. } => CoreCommandIdV1::NoteSetWrittenPitch,
            Self::EventSetNoteValue { .. } => CoreCommandIdV1::EventSetNoteValue,
            Self::VoiceInsertNotesEvent { .. } => CoreCommandIdV1::VoiceInsertNotesEvent,
            Self::VoiceInsertRestEvent { .. } => CoreCommandIdV1::VoiceInsertRestEvent,
            Self::EventRemove { .. } => CoreCommandIdV1::EventRemove,
            Self::MeasureInsert { .. } => CoreCommandIdV1::MeasureInsert,
            Self::MeasureRemove { .. } => CoreCommandIdV1::MeasureRemove,
            Self::MeasureMove { .. } => CoreCommandIdV1::MeasureMove,
            Self::MeasureSetDefinition { .. } => CoreCommandIdV1::MeasureSetDefinition,
            Self::PartInsert { .. } => CoreCommandIdV1::PartInsert,
            Self::PartRemove { .. } => CoreCommandIdV1::PartRemove,
            Self::PartMove { .. } => CoreCommandIdV1::PartMove,
            Self::PartSetName { .. } => CoreCommandIdV1::PartSetName,
            Self::PartSetInstrument { .. } => CoreCommandIdV1::PartSetInstrument,
            Self::StaffInsert { .. } => CoreCommandIdV1::StaffInsert,
            Self::StaffRemove { .. } => CoreCommandIdV1::StaffRemove,
            Self::StaffMove { .. } => CoreCommandIdV1::StaffMove,
            Self::StaffSetDefinition { .. } => CoreCommandIdV1::StaffSetDefinition,
            Self::VoiceInsert { .. } => CoreCommandIdV1::VoiceInsert,
            Self::VoiceRemove { .. } => CoreCommandIdV1::VoiceRemove,
            Self::VoiceMove { .. } => CoreCommandIdV1::VoiceMove,
            Self::VoiceSetDefaultStaff { .. } => CoreCommandIdV1::VoiceSetDefaultStaff,
            Self::VoiceSetSequenceStart { .. } => CoreCommandIdV1::VoiceSetSequenceStart,
            Self::EventSetStaffAssignment { .. } => CoreCommandIdV1::EventSetStaffAssignment,
            Self::RangeDelete { .. } => CoreCommandIdV1::RangeDelete,
            Self::RangeTransposeWrittenPitch { .. } => CoreCommandIdV1::RangeTransposeWrittenPitch,
            Self::TransactionBatch { .. } => CoreCommandIdV1::TransactionBatch,
        }
    }

    pub const fn target(&self) -> &ScoreEntityTargetV1 {
        match self {
            Self::DocumentSetMetadata { target, .. }
            | Self::NoteSetWrittenPitch { target, .. }
            | Self::EventSetNoteValue { target, .. }
            | Self::VoiceInsertNotesEvent { target, .. }
            | Self::VoiceInsertRestEvent { target, .. }
            | Self::EventRemove { target }
            | Self::MeasureInsert { target, .. }
            | Self::MeasureRemove { target }
            | Self::MeasureMove { target, .. }
            | Self::MeasureSetDefinition { target, .. }
            | Self::PartInsert { target, .. }
            | Self::PartRemove { target }
            | Self::PartMove { target, .. }
            | Self::PartSetName { target, .. }
            | Self::PartSetInstrument { target, .. }
            | Self::StaffInsert { target, .. }
            | Self::StaffRemove { target }
            | Self::StaffMove { target, .. }
            | Self::StaffSetDefinition { target, .. }
            | Self::VoiceInsert { target, .. }
            | Self::VoiceRemove { target }
            | Self::VoiceMove { target, .. }
            | Self::VoiceSetDefaultStaff { target, .. }
            | Self::VoiceSetSequenceStart { target, .. }
            | Self::EventSetStaffAssignment { target, .. }
            | Self::RangeDelete { target, .. }
            | Self::RangeTransposeWrittenPitch { target, .. }
            | Self::TransactionBatch { target, .. } => target,
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct KernelStage3SubmitRequestV1<Id = StableId> {
    pub api_version: u64,
    pub command: CoreCommandEnvelopeV1<Id>,
}

/// Private admission decoding only; targets and direct event payloads retain
/// their nonempty StableId types. Runtime activation requires candidate closure.
pub type CoreAdmissionCommandV1 = CoreCommandEnvelopeV1<JsString>;
pub type KernelAdmissionSubmitRequestV1 = KernelStage3SubmitRequestV1<JsString>;

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KernelStage3MetricsV1 {
    pub semantic_rules_evaluated: u64,
    pub semantic_dependency_reads: u64,
    pub full_document_scans: u64,
    pub full_document_clones: u64,
    pub full_semantic_validations: u64,
    pub full_snapshot_materializations: u64,
    pub entities_visited: u64,
    pub entity_index_lookups: u64,
    pub owner_index_lookups: u64,
    pub time_index_comparisons: u64,
    pub overlay_records: u64,
    pub order_collections_copied: u64,
    pub change_ops: u64,
    pub changeset_logical_bytes: u64,
    pub affected_addresses: u64,
    pub index_entries_removed: u64,
    pub index_entries_inserted: u64,
    pub ffi_request_bytes: u64,
    pub ffi_response_bytes: u64,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum PitchTranspositionErrorV1 {
    WrittenPitchInvalid,
    TranspositionComponentInvalid,
    DerivedPitchAlterOutOfRange,
    DerivedPitchOctaveOutOfRange,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum KernelStage3ResourceLimitKindV1 {
    Diagnostics,
    InputDepth,
    InputProperties,
    BatchChildren,
    Effects,
    AffectedAddresses,
    ChangesetLogicalBytes,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum KernelStage3CommandFailureLeafV1 {
    SemanticInvalid {
        diagnostics: Vec<brilliant_score_foundation::CoreDiagnosticV1>,
    },
    InvalidEnvelope,
    UnsupportedVersion,
    UnknownId,
    TargetMismatch,
    TargetNotFound,
    AnchorNotFound,
    AnchorWrongOwner,
    AnchorSelfReference,
    ReferenceConflict,
    InvalidRange,
    RangeEndpointNotFound,
    RangeOwnerMismatch,
    RangeTransformInvalid {
        address: NoteAddressV1<AffectedEntityIdV1>,
        reason: PitchTranspositionErrorV1,
    },
    BatchEmpty,
    BatchNested,
    ResourceLimitExceeded {
        limit_kind: KernelStage3ResourceLimitKindV1,
        limit: u64,
        actual: u64,
    },
    VersionOverflow,
    InternalError,
    LocalInvariantRejected,
}

impl KernelStage3CommandFailureLeafV1 {
    pub const fn code(&self) -> &'static str {
        match self {
            Self::SemanticInvalid { .. } => "command.semantic-invalid",
            Self::InvalidEnvelope => "command.invalid-envelope",
            Self::UnsupportedVersion => "command.unsupported-version",
            Self::UnknownId => "command.unknown-id",
            Self::TargetMismatch => "command.target-mismatch",
            Self::TargetNotFound => "command.target-not-found",
            Self::AnchorNotFound => "command.anchor-not-found",
            Self::AnchorWrongOwner => "command.anchor-wrong-owner",
            Self::AnchorSelfReference => "command.anchor-self-reference",
            Self::ReferenceConflict => "command.reference-conflict",
            Self::InvalidRange => "command.invalid-range",
            Self::RangeEndpointNotFound => "command.range-endpoint-not-found",
            Self::RangeOwnerMismatch => "command.range-owner-mismatch",
            Self::RangeTransformInvalid { .. } => "command.range-transform-invalid",
            Self::BatchEmpty => "command.batch-empty",
            Self::BatchNested => "command.batch-nested",
            Self::ResourceLimitExceeded { .. } => "command.resource-limit-exceeded",
            Self::VersionOverflow => "command.version-overflow",
            Self::InternalError => "command.internal-error",
            Self::LocalInvariantRejected => "stage3.local-invariant-rejected",
        }
    }
}

impl Serialize for KernelStage3CommandFailureLeafV1 {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let field_count = match self {
            Self::SemanticInvalid { .. } => 2,
            Self::RangeTransformInvalid { .. } => 3,
            Self::ResourceLimitExceeded { .. } => 4,
            _ => 1,
        };
        let mut state =
            serializer.serialize_struct("KernelStage3CommandFailureLeafV1", field_count)?;
        state.serialize_field("code", self.code())?;
        match self {
            Self::SemanticInvalid { diagnostics } => {
                state.serialize_field("diagnostics", diagnostics)?;
            }
            Self::RangeTransformInvalid { address, reason } => {
                state.serialize_field("address", address)?;
                state.serialize_field("reason", reason)?;
            }
            Self::ResourceLimitExceeded {
                limit_kind,
                limit,
                actual,
            } => {
                state.serialize_field("limitKind", limit_kind)?;
                state.serialize_field("limit", limit)?;
                state.serialize_field("actual", actual)?;
            }
            _ => {}
        }
        state.end()
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum KernelStage3CommandFailureV1 {
    Leaf(KernelStage3CommandFailureLeafV1),
    BatchChildRejected {
        failed_command_index: u64,
        failure: KernelStage3CommandFailureLeafV1,
    },
}

impl From<KernelStage3CommandFailureLeafV1> for KernelStage3CommandFailureV1 {
    fn from(value: KernelStage3CommandFailureLeafV1) -> Self {
        Self::Leaf(value)
    }
}

impl Serialize for KernelStage3CommandFailureV1 {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        match self {
            Self::Leaf(failure) => failure.serialize(serializer),
            Self::BatchChildRejected {
                failed_command_index,
                failure,
            } => {
                let mut state = serializer.serialize_struct("KernelStage3CommandFailureV1", 3)?;
                state.serialize_field("code", "command.batch-child-rejected")?;
                state.serialize_field("failedCommandIndex", failed_command_index)?;
                state.serialize_field("failure", failure)?;
                state.end()
            }
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KernelStage3SubmitSuccessValueV1 {
    pub document_version: DocumentVersionV1,
    pub affected: Vec<AffectedEntityAddressV1>,
    pub metrics: KernelStage3MetricsV1,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct KernelStage3SubmitNoOpValueV1 {
    pub document_version: DocumentVersionV1,
    pub metrics: KernelStage3MetricsV1,
}

impl Serialize for KernelStage3SubmitNoOpValueV1 {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let mut state = serializer.serialize_struct("KernelStage3SubmitNoOpValueV1", 3)?;
        state.serialize_field("documentVersion", &self.document_version)?;
        state.serialize_field("affected", &[] as &[ScoreEntityTargetV1])?;
        state.serialize_field("metrics", &self.metrics)?;
        state.end()
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KernelStage3SubmitRejectedValueV1 {
    pub document_version: DocumentVersionV1,
    pub metrics: KernelStage3MetricsV1,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum KernelStage3SubmitResultV1 {
    Committed(KernelStage3SubmitSuccessValueV1),
    NoOp(KernelStage3SubmitNoOpValueV1),
    CommandRejected {
        value: KernelStage3SubmitRejectedValueV1,
        failure: KernelStage3CommandFailureV1,
    },
    Rejected(StableFailureV1),
}

impl Serialize for KernelStage3SubmitResultV1 {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        match self {
            Self::Committed(value) => {
                let mut state = serializer.serialize_struct("KernelStage3SubmitResultV1", 3)?;
                state.serialize_field("apiVersion", &API_VERSION_V1)?;
                state.serialize_field("status", "committed")?;
                state.serialize_field("value", value)?;
                state.end()
            }
            Self::NoOp(value) => {
                let mut state = serializer.serialize_struct("KernelStage3SubmitResultV1", 3)?;
                state.serialize_field("apiVersion", &API_VERSION_V1)?;
                state.serialize_field("status", "no-op")?;
                state.serialize_field("value", value)?;
                state.end()
            }
            Self::CommandRejected { value, failure } => {
                let mut state = serializer.serialize_struct("KernelStage3SubmitResultV1", 4)?;
                state.serialize_field("apiVersion", &API_VERSION_V1)?;
                state.serialize_field("status", "command-rejected")?;
                state.serialize_field("value", value)?;
                state.serialize_field("failure", failure)?;
                state.end()
            }
            Self::Rejected(failure) => {
                let mut state = serializer.serialize_struct("KernelStage3SubmitResultV1", 3)?;
                state.serialize_field("apiVersion", &API_VERSION_V1)?;
                state.serialize_field("status", "rejected")?;
                state.serialize_field("failure", failure)?;
                state.end()
            }
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum KernelStage3SubmitDecodeFailureV1 {
    Boundary(StableFailureV1),
    Command(KernelStage3CommandFailureV1),
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn core_command_catalog_has_the_frozen_order_and_target_kinds() {
        let actual = CORE_COMMAND_CATALOG_V1
            .iter()
            .map(|definition| {
                (
                    definition.command_id.as_str(),
                    definition.target_kind.as_str(),
                )
            })
            .collect::<Vec<_>>();
        assert_eq!(
            actual,
            vec![
                ("core.document.set-metadata", "document"),
                ("core.note.set-written-pitch", "note"),
                ("core.event.set-note-value", "event"),
                ("core.voice.insert-notes-event", "voice"),
                ("core.voice.insert-rest-event", "voice"),
                ("core.event.remove", "event"),
                ("core.measure.insert", "document"),
                ("core.measure.remove", "measure"),
                ("core.measure.move", "measure"),
                ("core.measure.set-definition", "measure"),
                ("core.part.insert", "document"),
                ("core.part.remove", "part"),
                ("core.part.move", "part"),
                ("core.part.set-name", "part"),
                ("core.part.set-instrument", "part"),
                ("core.staff.insert", "part"),
                ("core.staff.remove", "staff"),
                ("core.staff.move", "staff"),
                ("core.staff.set-definition", "staff"),
                ("core.voice.insert", "part"),
                ("core.voice.remove", "voice"),
                ("core.voice.move", "voice"),
                ("core.voice.set-default-staff", "voice"),
                ("core.voice.set-sequence-start", "voice"),
                ("core.event.set-staff-assignment", "event"),
                ("core.range.delete", "document"),
                ("core.range.transpose-written-pitch", "document"),
                ("core.transaction.batch", "document"),
            ]
        );
        for definition in CORE_COMMAND_CATALOG_V1 {
            assert_eq!(
                CoreCommandIdV1::from_wire(definition.command_id.as_str()),
                Some(definition.command_id)
            );
            assert_eq!(definition.command_id.target_kind(), definition.target_kind);
        }
        assert_eq!(CoreCommandIdV1::from_wire("core.unknown"), None);
    }

    #[test]
    fn stage_three_failure_and_result_wire_keys_are_closed() {
        let resource = KernelStage3CommandFailureV1::from(
            KernelStage3CommandFailureLeafV1::ResourceLimitExceeded {
                limit_kind: KernelStage3ResourceLimitKindV1::ChangesetLogicalBytes,
                limit: 268_435_456,
                actual: 268_435_457,
            },
        );
        assert_eq!(
            serde_json::to_string(&resource).expect("resource failure JSON"),
            r#"{"code":"command.resource-limit-exceeded","limitKind":"changeset-logical-bytes","limit":268435456,"actual":268435457}"#
        );

        let batch = KernelStage3CommandFailureV1::BatchChildRejected {
            failed_command_index: 1,
            failure: KernelStage3CommandFailureLeafV1::UnknownId,
        };
        assert_eq!(
            serde_json::to_string(&batch).expect("batch failure JSON"),
            r#"{"code":"command.batch-child-rejected","failedCommandIndex":1,"failure":{"code":"command.unknown-id"}}"#
        );

        let result = KernelStage3SubmitResultV1::NoOp(KernelStage3SubmitNoOpValueV1 {
            document_version: DocumentVersionV1::initial(),
            metrics: KernelStage3MetricsV1::default(),
        });
        let value = serde_json::to_value(result).expect("no-op result JSON");
        assert_eq!(
            value
                .as_object()
                .expect("result object")
                .keys()
                .map(String::as_str)
                .collect::<Vec<_>>(),
            vec!["apiVersion", "status", "value"]
        );
        assert_eq!(value["status"], "no-op");
        assert_eq!(value["value"]["affected"], serde_json::json!([]));
        assert_eq!(value["value"]["documentVersion"], 0);
    }

    #[test]
    fn stable_targets_anchors_and_ranges_use_exact_public_keys() {
        let note = ScoreEntityTargetV1::Note {
            note_id: StableId::new("note-1").expect("stable note id"),
        };
        assert_eq!(
            serde_json::to_value(note).expect("note target JSON"),
            serde_json::json!({"kind": "note", "noteId": "note-1"})
        );
        let anchor = VoiceAnchorV1::AfterVoice {
            voice_id: StableId::new("voice-1").expect("stable voice id"),
        };
        assert_eq!(
            serde_json::to_value(anchor).expect("voice anchor JSON"),
            serde_json::json!({"kind": "after-voice", "voiceId": "voice-1"})
        );
        let range = ScoreRangeV1::MeasureRange {
            start: MeasurePointV1 {
                kind: MeasurePointKindV1::Measure,
                measure_id: StableId::new("measure-1").expect("start measure id"),
            },
            end: MeasurePointV1 {
                kind: MeasurePointKindV1::Measure,
                measure_id: StableId::new("measure-2").expect("end measure id"),
            },
        };
        assert_eq!(
            serde_json::to_value(range).expect("range JSON"),
            serde_json::json!({
                "kind": "measure-range",
                "start": {"kind": "measure", "measureId": "measure-1"},
                "end": {"kind": "measure", "measureId": "measure-2"}
            })
        );
    }
}

// Command IDs are transformed in place by ownership. Targets, ranges and the
// direct sequence-event commands intentionally keep their strong types.
fn map_voice_ids<I, O>(voice: VoiceV1<I>, map: &mut impl FnMut(I) -> O) -> VoiceV1<O> {
    use brilliant_score_foundation::{MusicSequenceV1, RhythmicContentV1, ScoreNoteV1};
    VoiceV1 {
        id: map(voice.id),
        default_staff_id: map(voice.default_staff_id),
        sequence: MusicSequenceV1 {
            start: voice.sequence.start,
            events: voice
                .sequence
                .events
                .into_iter()
                .map(|event| RhythmicEventV1 {
                    id: map(event.id),
                    duration: event.duration,
                    staff_id: event.staff_id.map(&mut *map),
                    content: match event.content {
                        RhythmicContentV1::Rest => RhythmicContentV1::Rest,
                        RhythmicContentV1::Notes { notes } => RhythmicContentV1::Notes {
                            notes: notes
                                .into_iter()
                                .map(|note| ScoreNoteV1 {
                                    id: map(note.id),
                                    written_pitch: note.written_pitch,
                                })
                                .collect(),
                        },
                    },
                })
                .collect(),
        },
    }
}
fn map_staff_ids<I, O>(
    staff: StaffDefinitionV1<I>,
    map: &mut impl FnMut(I) -> O,
) -> StaffDefinitionV1<O> {
    StaffDefinitionV1 {
        id: map(staff.id),
        line_count: staff.line_count,
        default_clef: staff.default_clef,
    }
}
macro_rules! map_anchor_ids {
    ($name:ident, $ty:ident, $variant:ident, $field:ident) => {
        fn $name<I, O>(anchor: $ty<I>, map: &mut impl FnMut(I) -> O) -> $ty<O> {
            match anchor {
                $ty::Start => $ty::Start,
                $ty::$variant { $field } => $ty::$variant {
                    $field: map($field),
                },
            }
        }
    };
}
map_anchor_ids!(
    map_measure_anchor,
    MeasureAnchorV1,
    AfterMeasure,
    measure_id
);
map_anchor_ids!(map_part_anchor, PartAnchorV1, AfterPart, part_id);
map_anchor_ids!(map_staff_anchor, StaffAnchorV1, AfterStaff, staff_id);
map_anchor_ids!(map_voice_anchor, VoiceAnchorV1, AfterVoice, voice_id);

impl<I> CoreCommandEnvelopeV1<I> {
    fn map_ids<O>(self, mut map: impl FnMut(I) -> O) -> CoreCommandEnvelopeV1<O> {
        use brilliant_score_foundation::PartMeasureContentV1;
        match self {
            Self::DocumentSetMetadata { target, metadata } => {
                CoreCommandEnvelopeV1::DocumentSetMetadata { target, metadata }
            }
            Self::NoteSetWrittenPitch {
                target,
                written_pitch,
            } => CoreCommandEnvelopeV1::NoteSetWrittenPitch {
                target,
                written_pitch,
            },
            Self::EventSetNoteValue { target, note_value } => {
                CoreCommandEnvelopeV1::EventSetNoteValue { target, note_value }
            }
            Self::VoiceInsertNotesEvent {
                target,
                anchor,
                event,
            } => CoreCommandEnvelopeV1::VoiceInsertNotesEvent {
                target,
                anchor,
                event,
            },
            Self::VoiceInsertRestEvent {
                target,
                anchor,
                event,
            } => CoreCommandEnvelopeV1::VoiceInsertRestEvent {
                target,
                anchor,
                event,
            },
            Self::EventRemove { target } => CoreCommandEnvelopeV1::EventRemove { target },
            Self::MeasureInsert {
                target,
                anchor,
                definition,
                contents,
            } => CoreCommandEnvelopeV1::MeasureInsert {
                target,
                anchor: map_measure_anchor(anchor, &mut map),
                definition: MeasureDefinitionV1 {
                    id: map(definition.id),
                    meter: definition.meter,
                    pickup_duration: definition.pickup_duration,
                },
                contents: contents
                    .into_iter()
                    .map(|entry| InsertMeasurePartContentV1 {
                        part_id: map(entry.part_id),
                        voices: entry
                            .voices
                            .into_iter()
                            .map(|voice| map_voice_ids(voice, &mut map))
                            .collect(),
                    })
                    .collect(),
            },
            Self::MeasureRemove { target } => CoreCommandEnvelopeV1::MeasureRemove { target },
            Self::MeasureMove { target, anchor } => CoreCommandEnvelopeV1::MeasureMove {
                target,
                anchor: map_measure_anchor(anchor, &mut map),
            },
            Self::MeasureSetDefinition {
                target,
                meter,
                pickup,
            } => CoreCommandEnvelopeV1::MeasureSetDefinition {
                target,
                meter,
                pickup,
            },
            Self::PartInsert {
                target,
                anchor,
                part,
            } => CoreCommandEnvelopeV1::PartInsert {
                target,
                anchor: map_part_anchor(anchor, &mut map),
                part: PartV1 {
                    id: map(part.id),
                    name: part.name,
                    instrument: part.instrument,
                    staves: part
                        .staves
                        .into_iter()
                        .map(|staff| map_staff_ids(staff, &mut map))
                        .collect(),
                    measure_contents: part
                        .measure_contents
                        .into_iter()
                        .map(|content| PartMeasureContentV1 {
                            measure_id: map(content.measure_id),
                            voices: content
                                .voices
                                .into_iter()
                                .map(|voice| map_voice_ids(voice, &mut map))
                                .collect(),
                        })
                        .collect(),
                },
            },
            Self::PartRemove { target } => CoreCommandEnvelopeV1::PartRemove { target },
            Self::PartMove { target, anchor } => CoreCommandEnvelopeV1::PartMove {
                target,
                anchor: map_part_anchor(anchor, &mut map),
            },
            Self::PartSetName { target, name } => {
                CoreCommandEnvelopeV1::PartSetName { target, name }
            }
            Self::PartSetInstrument { target, instrument } => {
                CoreCommandEnvelopeV1::PartSetInstrument { target, instrument }
            }
            Self::StaffInsert {
                target,
                anchor,
                staff,
            } => CoreCommandEnvelopeV1::StaffInsert {
                target,
                anchor: map_staff_anchor(anchor, &mut map),
                staff: map_staff_ids(staff, &mut map),
            },
            Self::StaffRemove { target } => CoreCommandEnvelopeV1::StaffRemove { target },
            Self::StaffMove { target, anchor } => CoreCommandEnvelopeV1::StaffMove {
                target,
                anchor: map_staff_anchor(anchor, &mut map),
            },
            Self::StaffSetDefinition {
                target,
                line_count,
                default_clef,
            } => CoreCommandEnvelopeV1::StaffSetDefinition {
                target,
                line_count,
                default_clef,
            },
            Self::VoiceInsert {
                target,
                measure_id,
                anchor,
                voice,
            } => CoreCommandEnvelopeV1::VoiceInsert {
                target,
                measure_id: map(measure_id),
                anchor: map_voice_anchor(anchor, &mut map),
                voice: map_voice_ids(voice, &mut map),
            },
            Self::VoiceRemove { target } => CoreCommandEnvelopeV1::VoiceRemove { target },
            Self::VoiceMove { target, anchor } => CoreCommandEnvelopeV1::VoiceMove {
                target,
                anchor: map_voice_anchor(anchor, &mut map),
            },
            Self::VoiceSetDefaultStaff { target, staff_id } => {
                CoreCommandEnvelopeV1::VoiceSetDefaultStaff {
                    target,
                    staff_id: map(staff_id),
                }
            }
            Self::VoiceSetSequenceStart { target, start } => {
                CoreCommandEnvelopeV1::VoiceSetSequenceStart { target, start }
            }
            Self::EventSetStaffAssignment { target, assignment } => {
                CoreCommandEnvelopeV1::EventSetStaffAssignment {
                    target,
                    assignment: match assignment {
                        EventStaffAssignmentV1::InheritDefault => {
                            EventStaffAssignmentV1::InheritDefault
                        }
                        EventStaffAssignmentV1::Staff { staff_id } => {
                            EventStaffAssignmentV1::Staff {
                                staff_id: map(staff_id),
                            }
                        }
                    },
                }
            }
            Self::RangeDelete { target, range } => {
                CoreCommandEnvelopeV1::RangeDelete { target, range }
            }
            Self::RangeTransposeWrittenPitch {
                target,
                range,
                transposition,
            } => CoreCommandEnvelopeV1::RangeTransposeWrittenPitch {
                target,
                range,
                transposition,
            },
            Self::TransactionBatch { target, commands } => {
                CoreCommandEnvelopeV1::TransactionBatch { target, commands }
            }
        }
    }
}

fn voice_ids_nonempty(voice: &VoiceV1<JsString>) -> bool {
    use brilliant_score_foundation::RhythmicContentV1;
    !voice.id.is_empty()
        && !voice.default_staff_id.is_empty()
        && voice.sequence.events.iter().all(|event| {
            !event.id.is_empty()
                && event.staff_id.as_ref().is_none_or(|id| !id.is_empty())
                && match &event.content {
                    RhythmicContentV1::Rest => true,
                    RhythmicContentV1::Notes { notes } => {
                        notes.iter().all(|note| !note.id.is_empty())
                    }
                }
        })
}
impl CoreCommandEnvelopeV1<StableId> {
    /// Consumes the payload tree; immutable ID text remains shared.
    pub fn into_admission(self) -> CoreCommandEnvelopeV1<JsString> {
        self.map_ids(|id| id.as_js_string().clone())
    }
}
impl CoreCommandEnvelopeV1<JsString> {
    fn ids_nonempty(&self) -> bool {
        let measure_anchor = |anchor: &MeasureAnchorV1<JsString>| match anchor {
            MeasureAnchorV1::Start => true,
            MeasureAnchorV1::AfterMeasure { measure_id } => !measure_id.is_empty(),
        };
        let part_anchor = |anchor: &PartAnchorV1<JsString>| match anchor {
            PartAnchorV1::Start => true,
            PartAnchorV1::AfterPart { part_id } => !part_id.is_empty(),
        };
        let staff_anchor = |anchor: &StaffAnchorV1<JsString>| match anchor {
            StaffAnchorV1::Start => true,
            StaffAnchorV1::AfterStaff { staff_id } => !staff_id.is_empty(),
        };
        let voice_anchor = |anchor: &VoiceAnchorV1<JsString>| match anchor {
            VoiceAnchorV1::Start => true,
            VoiceAnchorV1::AfterVoice { voice_id } => !voice_id.is_empty(),
        };
        match self {
            Self::MeasureInsert {
                anchor,
                definition,
                contents,
                ..
            } => {
                measure_anchor(anchor)
                    && !definition.id.is_empty()
                    && contents.iter().all(|entry| {
                        !entry.part_id.is_empty() && entry.voices.iter().all(voice_ids_nonempty)
                    })
            }
            Self::MeasureMove { anchor, .. } => measure_anchor(anchor),
            Self::PartInsert { anchor, part, .. } => {
                part_anchor(anchor)
                    && !part.id.is_empty()
                    && part.staves.iter().all(|staff| !staff.id.is_empty())
                    && part.measure_contents.iter().all(|content| {
                        !content.measure_id.is_empty()
                            && content.voices.iter().all(voice_ids_nonempty)
                    })
            }
            Self::PartMove { anchor, .. } => part_anchor(anchor),
            Self::StaffInsert { anchor, staff, .. } => staff_anchor(anchor) && !staff.id.is_empty(),
            Self::StaffMove { anchor, .. } => staff_anchor(anchor),
            Self::VoiceInsert {
                measure_id,
                anchor,
                voice,
                ..
            } => !measure_id.is_empty() && voice_anchor(anchor) && voice_ids_nonempty(voice),
            Self::VoiceMove { anchor, .. } => voice_anchor(anchor),
            Self::VoiceSetDefaultStaff { staff_id, .. } => !staff_id.is_empty(),
            Self::EventSetStaffAssignment { assignment, .. } => match assignment {
                EventStaffAssignmentV1::InheritDefault => true,
                EventStaffAssignmentV1::Staff { staff_id } => !staff_id.is_empty(),
            },
            // Captured children are decoded individually at their original
            // batch positions; this conversion never eagerly decodes them.
            Self::DocumentSetMetadata { .. }
            | Self::NoteSetWrittenPitch { .. }
            | Self::EventSetNoteValue { .. }
            | Self::VoiceInsertNotesEvent { .. }
            | Self::VoiceInsertRestEvent { .. }
            | Self::EventRemove { .. }
            | Self::MeasureRemove { .. }
            | Self::MeasureSetDefinition { .. }
            | Self::PartRemove { .. }
            | Self::PartSetName { .. }
            | Self::PartSetInstrument { .. }
            | Self::StaffRemove { .. }
            | Self::StaffSetDefinition { .. }
            | Self::VoiceRemove { .. }
            | Self::VoiceSetSequenceStart { .. }
            | Self::RangeDelete { .. }
            | Self::RangeTransposeWrittenPitch { .. }
            | Self::TransactionBatch { .. } => true,
        }
    }
    /// Only representability is checked; semantic admission remains a separate
    /// step. On failure return the original command without cloning its tree.
    #[expect(
        clippy::result_large_err,
        reason = "Representation selection returns the owned admission command without allocating or cloning its payload"
    )]
    pub fn try_into_stable(self) -> Result<CoreCommandEnvelopeV1, Self> {
        if !self.ids_nonempty() {
            return Err(self);
        }
        Ok(self.map_ids(|id| StableId::new(id).expect("borrowed nonempty check")))
    }
}
