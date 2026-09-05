use brilliant_core_types::JsString;
use std::collections::BTreeMap;

use brilliant_core_types::{LosslessJsonValue as BoundedJsonValue, SafeInteger, StableId};
use brilliant_score_foundation::{
    ClefV1, ExtensionOwnerV1, FractionV1, InstrumentDescriptorV1, MeterV1, NoteValueV1,
    ScoreMetadataV1, WrittenPitchV1,
};

use crate::handles::{MeasureHandle, PartHandle};

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct DocumentHeader {
    pub(crate) id: StableId,
    pub(crate) metadata: ScoreMetadataV1,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct MeasureRecord {
    pub(crate) id: StableId,
    pub(crate) meter: MeterV1,
    pub(crate) pickup_duration: Option<FractionV1>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct PartRecord {
    pub(crate) id: StableId,
    pub(crate) name: JsString,
    pub(crate) instrument: InstrumentDescriptorV1,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct StaffRecord {
    pub(crate) id: StableId,
    pub(crate) line_count: SafeInteger,
    pub(crate) default_clef: ClefV1,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct VoiceRecord {
    pub(crate) id: StableId,
    pub(crate) default_staff_id: StableId,
    pub(crate) sequence_start: FractionV1,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum EventContentKind {
    Rest,
    Notes,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct EventRecord {
    pub(crate) id: StableId,
    pub(crate) duration: NoteValueV1,
    pub(crate) staff_id: Option<StableId>,
    pub(crate) content_kind: EventContentKind,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct NoteRecord {
    pub(crate) id: StableId,
    pub(crate) written_pitch: WrittenPitchV1,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct ExtensionRecord {
    pub(crate) namespace: JsString,
    pub(crate) schema_version: SafeInteger,
    pub(crate) owner: ExtensionOwnerV1,
    pub(crate) payload: BTreeMap<JsString, BoundedJsonValue>,
}

#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
pub(crate) struct PartMeasureKey {
    pub(crate) part: PartHandle,
    pub(crate) measure: MeasureHandle,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) struct PartMeasureContentRecord {
    pub(crate) part: PartHandle,
    pub(crate) measure: MeasureHandle,
}
