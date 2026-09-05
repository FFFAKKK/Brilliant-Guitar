use std::collections::BTreeMap;

use brilliant_core_types::{BoundedJsonValue, FiniteNumber, SafeInteger, StableId};
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ScoreDocumentV1 {
    pub schema_version: String,
    pub id: StableId,
    pub metadata: ScoreMetadataV1,
    pub measure_definitions: Vec<MeasureDefinitionV1>,
    pub parts: Vec<PartV1>,
    pub extensions: Vec<ExtensionBlockV1>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ScoreMetadataV1 {
    pub title: String,
    pub authors: Vec<String>,
    pub tempo: TempoV1,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TempoV1 {
    pub bpm: FiniteNumber,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MeasureDefinitionV1 {
    pub id: StableId,
    pub meter: MeterV1,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pickup_duration: Option<FractionV1>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MeterV1 {
    pub numerator: SafeInteger,
    pub denominator: SafeInteger,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FractionV1 {
    pub numerator: SafeInteger,
    pub denominator: SafeInteger,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PartV1 {
    pub id: StableId,
    pub name: String,
    pub instrument: InstrumentDescriptorV1,
    pub staves: Vec<StaffDefinitionV1>,
    pub measure_contents: Vec<PartMeasureContentV1>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct InstrumentDescriptorV1 {
    pub name: String,
    pub written_to_sounding: TranspositionV1,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TranspositionV1 {
    pub diatonic_steps: SafeInteger,
    pub chromatic_semitones: SafeInteger,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StaffDefinitionV1 {
    pub id: StableId,
    pub line_count: SafeInteger,
    pub default_clef: ClefV1,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ClefV1 {
    pub sign: ClefSignV1,
    pub line: SafeInteger,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub enum ClefSignV1 {
    G,
    F,
    C,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PartMeasureContentV1 {
    pub measure_id: StableId,
    pub voices: Vec<VoiceV1>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct VoiceV1 {
    pub id: StableId,
    pub default_staff_id: StableId,
    pub sequence: MusicSequenceV1,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MusicSequenceV1 {
    pub start: FractionV1,
    pub events: Vec<RhythmicEventV1>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RhythmicEventV1 {
    pub id: StableId,
    pub duration: NoteValueV1,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub staff_id: Option<StableId>,
    pub content: RhythmicContentV1,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NoteValueV1 {
    pub base: SafeInteger,
    pub dots: SafeInteger,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub time_modification: Option<TimeModificationV1>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TimeModificationV1 {
    pub actual_notes: SafeInteger,
    pub normal_notes: SafeInteger,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum RhythmicContentV1 {
    Rest,
    Notes { notes: Vec<ScoreNoteV1> },
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ScoreNoteV1 {
    pub id: StableId,
    pub written_pitch: WrittenPitchV1,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct WrittenPitchV1 {
    pub step: PitchStepV1,
    pub alter: SafeInteger,
    pub octave: SafeInteger,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub enum PitchStepV1 {
    C,
    D,
    E,
    F,
    G,
    A,
    B,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ExtensionBlockV1 {
    pub namespace: String,
    pub schema_version: SafeInteger,
    pub owner: ExtensionOwnerV1,
    pub payload: BTreeMap<String, BoundedJsonValue>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "kebab-case", deny_unknown_fields)]
pub enum ExtensionOwnerV1 {
    Score,
    Part {
        #[serde(rename = "partId")]
        part_id: StableId,
    },
}
