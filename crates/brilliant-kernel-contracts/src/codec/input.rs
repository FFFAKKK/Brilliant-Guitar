//! Explicit input mapping after bounded lossless capture. No Serde value bridge.
use super::*;
use crate::*;
use brilliant_score_foundation::{
    LosslessObjectReader, LosslessValueError, LosslessValueFailure, LosslessValuePath,
};

macro_rules! decode_struct {
    ([$($id:ident),*] $ty:ty { $($field:ident => $wire:literal),* $(,)? }) => {
        impl<$($id: LosslessText),*> LosslessDecode for $ty {
            fn from_lossless_value(value: LosslessJsonValue) -> Result<Self, LosslessValueError> {
                let mut reader = LosslessObjectReader::new(value)?;
                let value = Self { $($field: reader.take($wire)?),* };
                reader.end()?;
                Ok(value)
            }
        }
    };
}

impl LosslessDecode for EmptyCommandPayloadV1 {
    fn from_lossless_value(value: LosslessJsonValue) -> Result<Self, LosslessValueError> {
        LosslessObjectReader::new(value)?.end()?;
        Ok(Self {})
    }
}
decode_struct!([] SetMetadataPayloadV1 { metadata => "metadata" });
decode_struct!([] SetWrittenPitchPayloadV1 { written_pitch => "writtenPitch" });
decode_struct!([] SetNoteValuePayloadV1 { note_value => "noteValue" });
decode_struct!([] InsertEventPayloadV1 { anchor => "anchor", event => "event" });
decode_struct!([Id] InsertMeasurePayloadV1<Id> { anchor => "anchor", definition => "definition", contents => "contents" });
decode_struct!([Id] MoveMeasurePayloadV1<Id> { anchor => "anchor" });
decode_struct!([] SetMeasureDefinitionPayloadV1 { meter => "meter", pickup => "pickup" });
decode_struct!([Id] InsertPartPayloadV1<Id> { anchor => "anchor", part => "part" });
decode_struct!([Id] MovePartPayloadV1<Id> { anchor => "anchor" });
decode_struct!([] SetPartNamePayloadV1 { name => "name" });
decode_struct!([] SetPartInstrumentPayloadV1 { instrument => "instrument" });
decode_struct!([Id] InsertStaffPayloadV1<Id> { anchor => "anchor", staff => "staff" });
decode_struct!([Id] MoveStaffPayloadV1<Id> { anchor => "anchor" });
decode_struct!([] SetStaffDefinitionPayloadV1 { line_count => "lineCount", default_clef => "defaultClef" });
decode_struct!([Id] InsertVoicePayloadV1<Id> { measure_id => "measureId", anchor => "anchor", voice => "voice" });
decode_struct!([Id] MoveVoicePayloadV1<Id> { anchor => "anchor" });
decode_struct!([Id] SetVoiceDefaultStaffPayloadV1<Id> { staff_id => "staffId" });
decode_struct!([] SetVoiceSequenceStartPayloadV1 { start => "start" });
decode_struct!([Id] SetEventStaffAssignmentPayloadV1<Id> { assignment => "assignment" });
decode_struct!([] DeleteRangePayloadV1 { range => "range" });
decode_struct!([] TransposeRangePayloadV1 { range => "range", transposition => "transposition" });
decode_struct!([Id] InsertMeasurePartContentV1<Id> { part_id => "partId", voices => "voices" });
decode_struct!([] PersistedCheckpointV1 { document_id => "documentId", document_version => "documentVersion" });
decode_struct!([] MeasurePointV1 { kind => "kind", measure_id => "measureId" });
decode_struct!([] PartMeasurePointV1 { kind => "kind", part_id => "partId", measure_id => "measureId" });
decode_struct!([] VoiceEventPointV1 { kind => "kind", voice_id => "voiceId", event_id => "eventId" });

macro_rules! decode_tagged {
    ([$($id:ident),*] $ty:ty, $tag:literal { $($wire:literal => $variant:ident $( { $($field:ident => $field_wire:literal),* $(,)? } )? ),* $(,)? }) => {
        impl<$($id: LosslessText),*> LosslessDecode for $ty {
            fn from_lossless_value(value: LosslessJsonValue) -> Result<Self, LosslessValueError> {
                let mut reader = LosslessObjectReader::new(value)?;
                let tag: JsString = reader.take($tag)?;
                $(if tag.eq_ascii($wire) {
                    let value = Self::$variant $( { $($field: reader.take($field_wire)?),* } )?;
                    reader.end()?;
                    return Ok(value);
                })*
                Err(LosslessValueError::new(LosslessValueFailure::InvalidValue)
                    .at(LosslessValuePath::Field($tag.into())))
            }
        }
    };
}

decode_tagged!([Id] ScoreEntityTargetV1<Id>, "kind" {
    "document" => Document { document_id => "documentId" },
    "measure" => Measure { measure_id => "measureId" },
    "part" => Part { part_id => "partId" },
    "staff" => Staff { staff_id => "staffId" },
    "voice" => Voice { voice_id => "voiceId" },
    "event" => Event { event_id => "eventId" },
    "note" => Note { note_id => "noteId" },
});
decode_tagged!([] SequenceAnchorV1, "kind" { "start" => Start, "after-event" => AfterEvent { event_id => "eventId" } });
decode_tagged!([Id] MeasureAnchorV1<Id>, "kind" { "start" => Start, "after-measure" => AfterMeasure { measure_id => "measureId" } });
decode_tagged!([Id] PartAnchorV1<Id>, "kind" { "start" => Start, "after-part" => AfterPart { part_id => "partId" } });
decode_tagged!([Id] StaffAnchorV1<Id>, "kind" { "start" => Start, "after-staff" => AfterStaff { staff_id => "staffId" } });
decode_tagged!([Id] VoiceAnchorV1<Id>, "kind" { "start" => Start, "after-voice" => AfterVoice { voice_id => "voiceId" } });
decode_tagged!([] MeasurePickupV1, "kind" { "none" => None, "duration" => Duration { duration => "duration" } });
decode_tagged!([Id] EventStaffAssignmentV1<Id>, "kind" { "inherit-default" => InheritDefault, "staff" => Staff { staff_id => "staffId" } });
decode_tagged!([] ScoreRangeV1, "kind" {
    "measure-range" => MeasureRange { start => "start", end => "end" },
    "part-measure-range" => PartMeasureRange { start => "start", end => "end" },
    "voice-event-range" => VoiceEventRange { start => "start", end => "end" },
});
decode_tagged!([] SelectorRequestV1, "selectorId" {
    "core.selector.score-overview" => ScoreOverview,
    "core.selector.score-metadata" => ScoreMetadata,
    "core.selector.score-entity" => ScoreEntity { address => "address" },
    "core.selector.score-entity-ownership" => ScoreEntityOwnership { address => "address" },
    "core.selector.score-range" => ScoreRange { range => "range" },
    "core.selector.history-state" => HistoryState,
    "core.selector.dirty-state" => DirtyState,
});

macro_rules! decode_string_enum {
    ($ty:ty, $variant:ident, $wire:literal) => {
        impl LosslessDecode for $ty {
            fn from_lossless_value(value: LosslessJsonValue) -> Result<Self, LosslessValueError> {
                if JsString::from_lossless_value(value)?.eq_ascii($wire) {
                    Ok(Self::$variant)
                } else {
                    Err(LosslessValueError::new(LosslessValueFailure::InvalidValue))
                }
            }
        }
    };
}
decode_string_enum!(MeasurePointKindV1, Measure, "measure");
decode_string_enum!(PartMeasurePointKindV1, PartMeasure, "part-measure");
decode_string_enum!(VoiceEventPointKindV1, VoiceEvent, "voice-event");
