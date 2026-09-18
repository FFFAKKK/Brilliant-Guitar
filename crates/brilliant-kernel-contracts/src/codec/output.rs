//! Explicit streaming response encoding. Field order mirrors the public Serde
//! wire contracts; every composite delegates only to explicit LosslessEncode.
use crate::*;
use brilliant_core_types::API_VERSION_V1;
use brilliant_score_foundation::{LosslessEncode, LosslessJsonError, LosslessObjectWriter};
use std::io::Write;

#[cfg(test)]
mod tests;

macro_rules! string_enum {
    ($ty:ty { $($variant:ident => $wire:literal),+ $(,)? }) => {
        impl LosslessEncode for $ty {
            fn write_lossless<W: Write + ?Sized>(&self, writer: &mut W) -> Result<(), LosslessJsonError> {
                match self { $(Self::$variant => $wire),+ }.write_lossless(writer)
            }
        }
    };
}

macro_rules! tagged_enum {
    ($ty:ty, $tag:literal { $($variant:ident => $wire:literal { $($field:ident => $key:literal),* $(,)? }),+ $(,)? }) => {
        impl LosslessEncode for $ty {
            fn write_lossless<W: Write + ?Sized>(&self, writer: &mut W) -> Result<(), LosslessJsonError> {
                let mut state = LosslessObjectWriter::new(writer)?;
                match self {
                    $(Self::$variant { $($field),* } => {
                        state.field($tag, $wire)?;
                        $(state.field($key, $field)?;)*
                    }),+
                }
                state.end()
            }
        }
    };
}

string_enum!(ShapeViolationV1 {
    MissingField => "missing-field", ExtraField => "extra-field",
    DuplicateField => "duplicate-field", WrongType => "wrong-type", InvalidTag => "invalid-tag",
});
string_enum!(ScoreStructureViolationV1 {
    DuplicateId => "duplicate-id", InvalidReference => "invalid-reference", InvalidValue => "invalid-value",
});
string_enum!(KernelEventCauseV1 {
    Submit => "submit", Undo => "undo", Redo => "redo", MarkPersisted => "mark-persisted",
});
string_enum!(PitchTranspositionErrorV1 {
    WrittenPitchInvalid => "written-pitch-invalid",
    TranspositionComponentInvalid => "transposition-component-invalid",
    DerivedPitchAlterOutOfRange => "derived-pitch-alter-out-of-range",
    DerivedPitchOctaveOutOfRange => "derived-pitch-octave-out-of-range",
});
string_enum!(KernelStage3ResourceLimitKindV1 {
    Diagnostics => "diagnostics", InputDepth => "input-depth", InputProperties => "input-properties",
    BatchChildren => "batch-children", Effects => "effects", AffectedAddresses => "affected-addresses",
    ChangesetLogicalBytes => "changeset-logical-bytes",
});
string_enum!(MeasurePointKindV1 { Measure => "measure" });
string_enum!(PartMeasurePointKindV1 { PartMeasure => "part-measure" });
string_enum!(VoiceEventPointKindV1 { VoiceEvent => "voice-event" });

impl<Id: LosslessEncode> LosslessEncode for NoteAddressV1<Id> {
    fn write_lossless<W: Write + ?Sized>(&self, writer: &mut W) -> Result<(), LosslessJsonError> {
        let mut state = LosslessObjectWriter::new(writer)?;
        let Self::Note { note_id } = self;
        state.field("kind", "note")?;
        state.field("noteId", note_id)?;
        state.end()
    }
}
tagged_enum!(ScoreRangeV1, "kind" {
    MeasureRange => "measure-range" { start => "start", end => "end" },
    PartMeasureRange => "part-measure-range" { start => "start", end => "end" },
    VoiceEventRange => "voice-event-range" { start => "start", end => "end" },
});
tagged_enum!(ScoreEntityOwnershipV1, "entityKind" {
    Document => "document" { document_id => "documentId" },
    Measure => "measure" { document_id => "documentId" },
    Part => "part" { document_id => "documentId" },
    Staff => "staff" { document_id => "documentId", part_id => "partId" },
    Voice => "voice" { document_id => "documentId", part_id => "partId", measure_id => "measureId" },
    Event => "event" { document_id => "documentId", part_id => "partId", measure_id => "measureId", voice_id => "voiceId" },
    Note => "note" { document_id => "documentId", part_id => "partId", measure_id => "measureId", voice_id => "voiceId", event_id => "eventId" },
});
tagged_enum!(ScoreRangeSelectionV1, "kind" {
    MeasureRange => "measure-range" { normalized => "normalized", measures => "measures" },
    PartMeasureRange => "part-measure-range" { normalized => "normalized", measure_contents => "measureContents" },
    VoiceEventRange => "voice-event-range" { normalized => "normalized", events => "events" },
});

impl<Id: LosslessEncode> LosslessEncode for ScoreEntityTargetV1<Id> {
    fn write_lossless<W: Write + ?Sized>(&self, writer: &mut W) -> Result<(), LosslessJsonError> {
        let mut state = LosslessObjectWriter::new(writer)?;
        state.field("kind", self.kind().as_str())?;
        match self {
            Self::Document { document_id } => state.field("documentId", document_id)?,
            Self::Measure { measure_id } => state.field("measureId", measure_id)?,
            Self::Part { part_id } => state.field("partId", part_id)?,
            Self::Staff { staff_id } => state.field("staffId", staff_id)?,
            Self::Voice { voice_id } => state.field("voiceId", voice_id)?,
            Self::Event { event_id } => state.field("eventId", event_id)?,
            Self::Note { note_id } => state.field("noteId", note_id)?,
        }
        state.end()
    }
}

impl LosslessEncode for SelectedScoreEntityV1 {
    fn write_lossless<W: Write + ?Sized>(&self, writer: &mut W) -> Result<(), LosslessJsonError> {
        let mut state = LosslessObjectWriter::new(writer)?;
        macro_rules! selected {
            ($kind:literal, $value:expr) => {{
                state.field("kind", $kind)?;
                state.field("value", $value)?;
            }};
        }
        match self {
            Self::Document(value) => selected!("document", value),
            Self::Measure(value) => selected!("measure", value),
            Self::Part(value) => selected!("part", value),
            Self::Staff(value) => selected!("staff", value),
            Self::Voice(value) => selected!("voice", value),
            Self::Event(value) => selected!("event", value),
            Self::Note(value) => selected!("note", value),
        }
        state.end()
    }
}

impl LosslessEncode for KernelSelectorValueV1 {
    fn write_lossless<W: Write + ?Sized>(&self, writer: &mut W) -> Result<(), LosslessJsonError> {
        match self {
            Self::Overview(value) => value.write_lossless(writer),
            Self::Metadata(value) => value.write_lossless(writer),
            Self::Entity(value) => value.write_lossless(writer),
            Self::Ownership(value) => value.write_lossless(writer),
            Self::Range(value) => value.write_lossless(writer),
            Self::History(value) => value.write_lossless(writer),
            Self::Dirty(value) => value.write_lossless(writer),
        }
    }
}

impl LosslessEncode for StableFailureV1 {
    fn write_lossless<W: Write + ?Sized>(&self, writer: &mut W) -> Result<(), LosslessJsonError> {
        let mut state = LosslessObjectWriter::new(writer)?;
        state.field("failureVersion", &Self::FAILURE_VERSION)?;
        state.field("code", self.code())?;
        match self {
            Self::BridgeRequestTooLarge {
                limit_bytes,
                actual_bytes,
            }
            | Self::BridgeResponseTooLarge {
                limit_bytes,
                actual_bytes,
            } => {
                state.field("limitBytes", limit_bytes)?;
                state.field("actualBytes", actual_bytes)?;
            }
            Self::CodecInvalidShape { path, violation } => {
                state.field("path", path)?;
                state.field("violation", violation)?;
            }
            Self::ContractUnsupportedApiVersion { supported_version }
            | Self::ContractUnsupportedProtocolVersion { supported_version } => {
                state.field("supportedVersion", supported_version)?;
            }
            Self::ScoreUnsupportedSchema { supported_schema } => {
                state.field("supportedSchema", supported_schema)?;
            }
            Self::ScoreInvalidStructure { path, violation } => {
                state.field("path", path)?;
                state.field("violation", violation)?;
            }
            Self::CodecDepthLimit { limit, actual }
            | Self::CodecPropertyLimit { limit, actual } => {
                state.field("limit", limit)?;
                state.field("actual", actual)?;
            }
            Self::CodecNumberOutOfRange { path } => state.field("path", path)?,
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

impl LosslessEncode for KernelSessionCreateResultV1 {
    fn write_lossless<W: Write + ?Sized>(&self, writer: &mut W) -> Result<(), LosslessJsonError> {
        match self {
            Self::Created(value) => {
                let mut state = LosslessObjectWriter::new(writer)?;
                state.field("apiVersion", &API_VERSION_V1)?;
                state.field("status", "created")?;
                state.field("value", value)?;
                state.end()
            }
            Self::Rejected(failure) => {
                let mut state = LosslessObjectWriter::new(writer)?;
                state.field("apiVersion", &API_VERSION_V1)?;
                state.field("status", "rejected")?;
                state.field("failure", failure)?;
                state.end()
            }
        }
    }
}

impl LosslessEncode for KernelEventV1 {
    fn write_lossless<W: Write + ?Sized>(&self, writer: &mut W) -> Result<(), LosslessJsonError> {
        match self {
            Self::DocumentCommitted {
                event_sequence,
                document_id,
                document_version,
                cause,
                command_id,
                affected_entities,
            } => {
                let mut state = LosslessObjectWriter::new(writer)?;
                state.field("eventVersion", &1_u64)?;
                state.field("eventSequence", event_sequence)?;
                state.field("eventType", "core.document.committed")?;
                state.field("documentId", document_id)?;
                state.field("documentVersion", document_version)?;
                state.field("cause", cause)?;
                state.field("commandId", command_id)?;
                state.field("affectedEntities", affected_entities)?;
                state.end()
            }
            Self::DirtyStateChanged {
                event_sequence,
                document_id,
                document_version,
                cause,
                dirty,
            } => {
                let mut state = LosslessObjectWriter::new(writer)?;
                state.field("eventVersion", &1_u64)?;
                state.field("eventSequence", event_sequence)?;
                state.field("eventType", "core.session.dirty-state-changed")?;
                state.field("documentId", document_id)?;
                state.field("documentVersion", document_version)?;
                state.field("cause", cause)?;
                state.field("dirty", dirty)?;
                state.end()
            }
        }
    }
}

impl LosslessEncode for KernelStage4FailureV1 {
    fn write_lossless<W: Write + ?Sized>(&self, writer: &mut W) -> Result<(), LosslessJsonError> {
        if let Self::Command(failure) = self {
            return failure.write_lossless(writer);
        }
        let mut state = LosslessObjectWriter::new(writer)?;
        state.field("code", self.code().expect("non-command failure has code"))?;
        state.end()
    }
}

impl LosslessEncode for KernelStage4CommandResultV1 {
    fn write_lossless<W: Write + ?Sized>(&self, writer: &mut W) -> Result<(), LosslessJsonError> {
        match self {
            Self::Committed { value, events } => {
                let mut state = LosslessObjectWriter::new(writer)?;
                state.field("apiVersion", &API_VERSION_V1)?;
                state.field("status", "committed")?;
                state.field("value", value)?;
                state.field("events", events)?;
                state.end()
            }
            Self::NoOp { value } => {
                let mut state = LosslessObjectWriter::new(writer)?;
                state.field("apiVersion", &API_VERSION_V1)?;
                state.field("status", "no-op")?;
                state.field("value", value)?;
                state.field("events", &[] as &[KernelEventV1])?;
                state.end()
            }
            Self::Rejected { value, failure } => {
                let mut state = LosslessObjectWriter::new(writer)?;
                state.field("apiVersion", &API_VERSION_V1)?;
                state.field("status", "command-rejected")?;
                state.field("value", value)?;
                state.field("failure", failure)?;
                state.field("events", &[] as &[KernelEventV1])?;
                state.end()
            }
        }
    }
}

impl LosslessEncode for KernelStage4MarkPersistedResultV1 {
    fn write_lossless<W: Write + ?Sized>(&self, writer: &mut W) -> Result<(), LosslessJsonError> {
        match self {
            Self::Updated { value, events } => {
                let mut state = LosslessObjectWriter::new(writer)?;
                state.field("apiVersion", &API_VERSION_V1)?;
                state.field("status", "updated")?;
                state.field("value", value)?;
                state.field("events", events)?;
                state.end()
            }
            Self::NoOp { value } => {
                let mut state = LosslessObjectWriter::new(writer)?;
                state.field("apiVersion", &API_VERSION_V1)?;
                state.field("status", "no-op")?;
                state.field("value", value)?;
                state.field("events", &[] as &[KernelEventV1])?;
                state.end()
            }
            Self::Rejected { value, failure } => {
                let mut state = LosslessObjectWriter::new(writer)?;
                state.field("apiVersion", &API_VERSION_V1)?;
                state.field("status", "checkpoint-rejected")?;
                state.field("value", value)?;
                state.field("failure", failure)?;
                state.field("events", &[] as &[KernelEventV1])?;
                state.end()
            }
        }
    }
}

impl LosslessEncode for SharedScoreDocumentV1 {
    fn write_lossless<W: Write + ?Sized>(&self, writer: &mut W) -> Result<(), LosslessJsonError> {
        brilliant_score_foundation::write_canonical_score_document(self.as_document(), writer)
    }
}

impl LosslessEncode for ScoreOverviewV1 {
    fn write_lossless<W: Write + ?Sized>(&self, writer: &mut W) -> Result<(), LosslessJsonError> {
        let mut state = LosslessObjectWriter::new(writer)?;
        state.field("documentId", &self.document_id)?;
        state.field("title", &self.title)?;
        state.field("measureCount", &self.measure_count)?;
        state.end()
    }
}

struct CanonicalScore<'a>(&'a brilliant_score_foundation::ScoreDocumentV1);
impl LosslessEncode for CanonicalScore<'_> {
    fn write_lossless<W: Write + ?Sized>(&self, writer: &mut W) -> Result<(), LosslessJsonError> {
        brilliant_score_foundation::write_canonical_score_document(self.0, writer)
    }
}

impl LosslessEncode for KernelStage4ReadResultV1 {
    fn write_lossless<W: Write + ?Sized>(&self, writer: &mut W) -> Result<(), LosslessJsonError> {
        match self {
            Self::Ok(value) => {
                let mut state = LosslessObjectWriter::new(writer)?;
                state.field("apiVersion", &API_VERSION_V1)?;
                state.field("status", "ok")?;
                state.field("value", value)?;
                state.end()
            }
            Self::Rejected(failure) => {
                let mut state = LosslessObjectWriter::new(writer)?;
                state.field("apiVersion", &API_VERSION_V1)?;
                state.field("status", "read-rejected")?;
                state.field("failure", failure)?;
                state.end()
            }
        }
    }
}

impl LosslessEncode for KernelSelectorResultV1 {
    fn write_lossless<W: Write + ?Sized>(&self, writer: &mut W) -> Result<(), LosslessJsonError> {
        match self {
            Self::Ok(value) => {
                let mut state = LosslessObjectWriter::new(writer)?;
                state.field("ok", &true)?;
                state.field("value", value)?;
                state.end()
            }
            Self::Rejected(failure) => {
                let mut state = LosslessObjectWriter::new(writer)?;
                state.field("ok", &false)?;
                state.field("failure", failure)?;
                state.end()
            }
        }
    }
}

impl LosslessEncode for KernelStage4SelectResultV1 {
    fn write_lossless<W: Write + ?Sized>(&self, writer: &mut W) -> Result<(), LosslessJsonError> {
        let mut state = LosslessObjectWriter::new(writer)?;
        state.field("apiVersion", &API_VERSION_V1)?;
        state.field("status", "ok")?;
        state.field("value", &self.value)?;
        state.end()
    }
}

impl LosslessEncode for KernelStage4OperationResultV1 {
    fn write_lossless<W: Write + ?Sized>(&self, writer: &mut W) -> Result<(), LosslessJsonError> {
        match self {
            Self::Command(value) => value.write_lossless(writer),
            Self::MarkPersisted(value) => value.write_lossless(writer),
            Self::Read(value) => value.write_lossless(writer),
            Self::Select(value) => value.write_lossless(writer),
            Self::Rejected(failure) => {
                let mut state = LosslessObjectWriter::new(writer)?;
                state.field("apiVersion", &API_VERSION_V1)?;
                state.field("status", "rejected")?;
                state.field("failure", failure)?;
                state.end()
            }
        }
    }
}

impl LosslessEncode for KernelStage4ReplayResultV1 {
    fn write_lossless<W: Write + ?Sized>(&self, writer: &mut W) -> Result<(), LosslessJsonError> {
        match self {
            Self::Replayed {
                final_document,
                document_version,
                results,
            } => {
                let mut state = LosslessObjectWriter::new(writer)?;
                state.field("apiVersion", &API_VERSION_V1)?;
                state.field("status", "replayed")?;
                state.field("finalDocument", final_document)?;
                state.field("documentVersion", document_version)?;
                state.field("results", results)?;
                state.end()
            }
            Self::Rejected {
                final_document,
                document_version,
                results,
                failed_command_index,
                failure,
            } => {
                let mut state = LosslessObjectWriter::new(writer)?;
                state.field("apiVersion", &API_VERSION_V1)?;
                state.field("status", "rejected")?;
                state.field("finalDocument", final_document)?;
                state.field("documentVersion", document_version)?;
                state.field("results", results)?;
                state.field("failedCommandIndex", failed_command_index)?;
                state.field("failure", failure)?;
                state.end()
            }
            Self::InvalidInitialDocument(failure) => {
                let mut state = LosslessObjectWriter::new(writer)?;
                state.field("apiVersion", &API_VERSION_V1)?;
                state.field("status", "invalid-initial-document")?;
                state.field("failure", failure)?;
                state.end()
            }
        }
    }
}

impl LosslessEncode for KernelSessionReadResultV1 {
    fn write_lossless<W: Write + ?Sized>(&self, writer: &mut W) -> Result<(), LosslessJsonError> {
        match self {
            Self::Ok(value) => {
                let mut state = LosslessObjectWriter::new(writer)?;
                state.field("apiVersion", &API_VERSION_V1)?;
                state.field("status", "ok")?;
                state.field("value", value)?;
                state.end()
            }
            Self::Rejected(failure) => {
                let mut state = LosslessObjectWriter::new(writer)?;
                state.field("apiVersion", &API_VERSION_V1)?;
                state.field("status", "rejected")?;
                state.field("failure", failure)?;
                state.end()
            }
        }
    }
}

impl LosslessEncode for CoreCommandTargetKindV1 {
    fn write_lossless<W: Write + ?Sized>(&self, writer: &mut W) -> Result<(), LosslessJsonError> {
        self.as_str().write_lossless(writer)
    }
}

impl LosslessEncode for KernelCommandIdentityV1 {
    fn write_lossless<W: Write + ?Sized>(&self, writer: &mut W) -> Result<(), LosslessJsonError> {
        match self {
            Self::Core(value) => value.write_lossless(writer),
            Self::Module(value) => value.write_lossless(writer),
        }
    }
}

impl LosslessEncode for CoreCommandIdV1 {
    fn write_lossless<W: Write + ?Sized>(&self, writer: &mut W) -> Result<(), LosslessJsonError> {
        self.as_str().write_lossless(writer)
    }
}

impl LosslessEncode for KernelStage3CommandFailureLeafV1 {
    fn write_lossless<W: Write + ?Sized>(&self, writer: &mut W) -> Result<(), LosslessJsonError> {
        let mut state = LosslessObjectWriter::new(writer)?;
        state.field("code", self.code())?;
        match self {
            Self::SemanticInvalid { diagnostics } => {
                state.field("diagnostics", diagnostics)?;
            }
            Self::RangeTransformInvalid { address, reason } => {
                state.field("address", address)?;
                state.field("reason", reason)?;
            }
            Self::ResourceLimitExceeded {
                limit_kind,
                limit,
                actual,
            } => {
                state.field("limitKind", limit_kind)?;
                state.field("limit", limit)?;
                state.field("actual", actual)?;
            }
            _ => {}
        }
        state.end()
    }
}

impl LosslessEncode for KernelStage3CommandFailureV1 {
    fn write_lossless<W: Write + ?Sized>(&self, writer: &mut W) -> Result<(), LosslessJsonError> {
        match self {
            Self::Leaf(failure) => failure.write_lossless(writer),
            Self::BatchChildRejected {
                failed_command_index,
                failure,
            } => {
                let mut state = LosslessObjectWriter::new(writer)?;
                state.field("code", "command.batch-child-rejected")?;
                state.field("failedCommandIndex", failed_command_index)?;
                state.field("failure", failure)?;
                state.end()
            }
        }
    }
}

impl LosslessEncode for KernelStage3SubmitNoOpValueV1 {
    fn write_lossless<W: Write + ?Sized>(&self, writer: &mut W) -> Result<(), LosslessJsonError> {
        let mut state = LosslessObjectWriter::new(writer)?;
        state.field("documentVersion", &self.document_version)?;
        state.field("affected", &[] as &[ScoreEntityTargetV1])?;
        state.field("metrics", &self.metrics)?;
        state.end()
    }
}

impl LosslessEncode for KernelStage3SubmitResultV1 {
    fn write_lossless<W: Write + ?Sized>(&self, writer: &mut W) -> Result<(), LosslessJsonError> {
        match self {
            Self::Committed(value) => {
                let mut state = LosslessObjectWriter::new(writer)?;
                state.field("apiVersion", &API_VERSION_V1)?;
                state.field("status", "committed")?;
                state.field("value", value)?;
                state.end()
            }
            Self::NoOp(value) => {
                let mut state = LosslessObjectWriter::new(writer)?;
                state.field("apiVersion", &API_VERSION_V1)?;
                state.field("status", "no-op")?;
                state.field("value", value)?;
                state.end()
            }
            Self::CommandRejected { value, failure } => {
                let mut state = LosslessObjectWriter::new(writer)?;
                state.field("apiVersion", &API_VERSION_V1)?;
                state.field("status", "command-rejected")?;
                state.field("value", value)?;
                state.field("failure", failure)?;
                state.end()
            }
            Self::Rejected(failure) => {
                let mut state = LosslessObjectWriter::new(writer)?;
                state.field("apiVersion", &API_VERSION_V1)?;
                state.field("status", "rejected")?;
                state.field("failure", failure)?;
                state.end()
            }
        }
    }
}

impl LosslessEncode for KernelSessionCreateSuccessValueV1 {
    fn write_lossless<W: Write + ?Sized>(&self, writer: &mut W) -> Result<(), LosslessJsonError> {
        let mut state = LosslessObjectWriter::new(writer)?;
        state.field("documentId", &self.document_id)?;
        state.field("documentVersion", &self.document_version)?;
        state.end()
    }
}

impl LosslessEncode for KernelSnapshotV1 {
    fn write_lossless<W: Write + ?Sized>(&self, writer: &mut W) -> Result<(), LosslessJsonError> {
        let mut state = LosslessObjectWriter::new(writer)?;
        state.field("documentId", &self.document_id)?;
        state.field("schemaVersion", &self.schema_version)?;
        state.field("documentVersion", &self.document_version)?;
        state.field("document", &CanonicalScore(&self.document))?;
        state.end()
    }
}

impl LosslessEncode for KernelHistoryStateV1 {
    fn write_lossless<W: Write + ?Sized>(&self, writer: &mut W) -> Result<(), LosslessJsonError> {
        let mut state = LosslessObjectWriter::new(writer)?;
        state.field("undoDepth", &self.undo_depth)?;
        state.field("redoDepth", &self.redo_depth)?;
        state.end()
    }
}

impl LosslessEncode for KernelReadStateV1 {
    fn write_lossless<W: Write + ?Sized>(&self, writer: &mut W) -> Result<(), LosslessJsonError> {
        let mut state = LosslessObjectWriter::new(writer)?;
        state.field("snapshot", &self.snapshot)?;
        state.field("history", &self.history)?;
        state.field("dirty", &self.dirty)?;
        state.end()
    }
}

impl LosslessEncode for KernelStage4MetricsV1 {
    fn write_lossless<W: Write + ?Sized>(&self, writer: &mut W) -> Result<(), LosslessJsonError> {
        let mut state = LosslessObjectWriter::new(writer)?;
        state.field(
            "fullSnapshotMaterializations",
            &self.full_snapshot_materializations,
        )?;
        state.field("selectorRecordsVisited", &self.selector_records_visited)?;
        state.field("selectorRecordsReturned", &self.selector_records_returned)?;
        state.field("checkpointAttempts", &self.checkpoint_attempts)?;
        state.field("checkpointSuccesses", &self.checkpoint_successes)?;
        state.field("checkpointFailures", &self.checkpoint_failures)?;
        state.field(
            "checkpointMaterializedBytes",
            &self.checkpoint_materialized_bytes,
        )?;
        state.field("eventsReserved", &self.events_reserved)?;
        state.field("eventsEmitted", &self.events_emitted)?;
        state.end()
    }
}

impl LosslessEncode for KernelStage4MutationValueV1 {
    fn write_lossless<W: Write + ?Sized>(&self, writer: &mut W) -> Result<(), LosslessJsonError> {
        let mut state = LosslessObjectWriter::new(writer)?;
        state.field("documentVersion", &self.document_version)?;
        state.field("affected", &self.affected)?;
        state.field("history", &self.history)?;
        state.field("dirty", &self.dirty)?;
        state.field("metrics", &self.metrics)?;
        state.field("stage4Metrics", &self.stage4_metrics)?;
        state.end()
    }
}

impl LosslessEncode for KernelStage4RejectedValueV1 {
    fn write_lossless<W: Write + ?Sized>(&self, writer: &mut W) -> Result<(), LosslessJsonError> {
        let mut state = LosslessObjectWriter::new(writer)?;
        state.field("documentVersion", &self.document_version)?;
        state.field("history", &self.history)?;
        state.field("dirty", &self.dirty)?;
        state.field("metrics", &self.metrics)?;
        state.field("stage4Metrics", &self.stage4_metrics)?;
        state.end()
    }
}

impl LosslessEncode for KernelStage4MarkPersistedValueV1 {
    fn write_lossless<W: Write + ?Sized>(&self, writer: &mut W) -> Result<(), LosslessJsonError> {
        let mut state = LosslessObjectWriter::new(writer)?;
        state.field("documentVersion", &self.document_version)?;
        state.field("dirty", &self.dirty)?;
        state.end()
    }
}

impl LosslessEncode for KernelStage4SnapshotV1 {
    fn write_lossless<W: Write + ?Sized>(&self, writer: &mut W) -> Result<(), LosslessJsonError> {
        let mut state = LosslessObjectWriter::new(writer)?;
        state.field("documentId", &self.document_id)?;
        state.field("schemaVersion", &self.schema_version)?;
        state.field("documentVersion", &self.document_version)?;
        state.field("document", &self.document)?;
        state.end()
    }
}

impl LosslessEncode for KernelStage4ReadStateV1 {
    fn write_lossless<W: Write + ?Sized>(&self, writer: &mut W) -> Result<(), LosslessJsonError> {
        let mut state = LosslessObjectWriter::new(writer)?;
        state.field("snapshot", &self.snapshot)?;
        state.field("history", &self.history)?;
        state.field("dirty", &self.dirty)?;
        state.field("stage4Metrics", &self.stage4_metrics)?;
        state.end()
    }
}

impl LosslessEncode for KernelStage4SelectValueV1 {
    fn write_lossless<W: Write + ?Sized>(&self, writer: &mut W) -> Result<(), LosslessJsonError> {
        let mut state = LosslessObjectWriter::new(writer)?;
        state.field("documentVersion", &self.document_version)?;
        state.field("selection", &self.selection)?;
        state.field("stage4Metrics", &self.stage4_metrics)?;
        state.end()
    }
}

impl LosslessEncode for KernelStage4ReplayCommandResultV1 {
    fn write_lossless<W: Write + ?Sized>(&self, writer: &mut W) -> Result<(), LosslessJsonError> {
        let mut state = LosslessObjectWriter::new(writer)?;
        state.field("status", &self.status)?;
        state.field("documentVersion", &self.document_version)?;
        state.field("history", &self.history)?;
        if let Some(failure) = &self.failure {
            state.field("failure", failure)?;
        }
        state.end()
    }
}

impl LosslessEncode for KernelStage3MetricsV1 {
    fn write_lossless<W: Write + ?Sized>(&self, writer: &mut W) -> Result<(), LosslessJsonError> {
        let mut state = LosslessObjectWriter::new(writer)?;
        state.field("semanticRulesEvaluated", &self.semantic_rules_evaluated)?;
        state.field("semanticDependencyReads", &self.semantic_dependency_reads)?;
        state.field("fullDocumentScans", &self.full_document_scans)?;
        state.field("fullDocumentClones", &self.full_document_clones)?;
        state.field("fullSemanticValidations", &self.full_semantic_validations)?;
        state.field(
            "fullSnapshotMaterializations",
            &self.full_snapshot_materializations,
        )?;
        state.field("entitiesVisited", &self.entities_visited)?;
        state.field("entityIndexLookups", &self.entity_index_lookups)?;
        state.field("ownerIndexLookups", &self.owner_index_lookups)?;
        state.field("timeIndexComparisons", &self.time_index_comparisons)?;
        state.field("overlayRecords", &self.overlay_records)?;
        state.field("orderCollectionsCopied", &self.order_collections_copied)?;
        state.field("changeOps", &self.change_ops)?;
        state.field("changesetLogicalBytes", &self.changeset_logical_bytes)?;
        state.field("affectedAddresses", &self.affected_addresses)?;
        state.field("indexEntriesRemoved", &self.index_entries_removed)?;
        state.field("indexEntriesInserted", &self.index_entries_inserted)?;
        state.field("ffiRequestBytes", &self.ffi_request_bytes)?;
        state.field("ffiResponseBytes", &self.ffi_response_bytes)?;
        state.end()
    }
}

impl LosslessEncode for KernelStage3SubmitSuccessValueV1 {
    fn write_lossless<W: Write + ?Sized>(&self, writer: &mut W) -> Result<(), LosslessJsonError> {
        let mut state = LosslessObjectWriter::new(writer)?;
        state.field("documentVersion", &self.document_version)?;
        state.field("affected", &self.affected)?;
        state.field("metrics", &self.metrics)?;
        state.end()
    }
}

impl LosslessEncode for KernelStage3SubmitRejectedValueV1 {
    fn write_lossless<W: Write + ?Sized>(&self, writer: &mut W) -> Result<(), LosslessJsonError> {
        let mut state = LosslessObjectWriter::new(writer)?;
        state.field("documentVersion", &self.document_version)?;
        state.field("metrics", &self.metrics)?;
        state.end()
    }
}

impl LosslessEncode for MeasurePointV1 {
    fn write_lossless<W: Write + ?Sized>(&self, writer: &mut W) -> Result<(), LosslessJsonError> {
        let mut state = LosslessObjectWriter::new(writer)?;
        state.field("kind", &self.kind)?;
        state.field("measureId", &self.measure_id)?;
        state.end()
    }
}

impl LosslessEncode for PartMeasurePointV1 {
    fn write_lossless<W: Write + ?Sized>(&self, writer: &mut W) -> Result<(), LosslessJsonError> {
        let mut state = LosslessObjectWriter::new(writer)?;
        state.field("kind", &self.kind)?;
        state.field("partId", &self.part_id)?;
        state.field("measureId", &self.measure_id)?;
        state.end()
    }
}

impl LosslessEncode for VoiceEventPointV1 {
    fn write_lossless<W: Write + ?Sized>(&self, writer: &mut W) -> Result<(), LosslessJsonError> {
        let mut state = LosslessObjectWriter::new(writer)?;
        state.field("kind", &self.kind)?;
        state.field("voiceId", &self.voice_id)?;
        state.field("eventId", &self.event_id)?;
        state.end()
    }
}
