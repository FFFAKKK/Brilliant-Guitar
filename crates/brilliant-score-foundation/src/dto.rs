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
pub struct MeasureDefinitionV1<Id = StableId> {
    pub id: Id,
    pub meter: MeterV1,
    #[serde(
        default = "absent",
        deserialize_with = "present",
        skip_serializing_if = "Option::is_none"
    )]
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
pub struct PartV1<Id = StableId> {
    pub id: Id,
    pub name: String,
    pub instrument: InstrumentDescriptorV1,
    pub staves: Vec<StaffDefinitionV1<Id>>,
    pub measure_contents: Vec<PartMeasureContentV1<Id>>,
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
pub struct StaffDefinitionV1<Id = StableId> {
    pub id: Id,
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
pub struct PartMeasureContentV1<Id = StableId> {
    pub measure_id: Id,
    pub voices: Vec<VoiceV1<Id>>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct VoiceV1<Id = StableId> {
    pub id: Id,
    pub default_staff_id: Id,
    pub sequence: MusicSequenceV1<Id>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MusicSequenceV1<Id = StableId> {
    pub start: FractionV1,
    pub events: Vec<RhythmicEventV1<Id>>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RhythmicEventV1<Id = StableId> {
    pub id: Id,
    pub duration: NoteValueV1,
    #[serde(
        default = "absent",
        deserialize_with = "present",
        skip_serializing_if = "Option::is_none"
    )]
    pub staff_id: Option<Id>,
    pub content: RhythmicContentV1<Id>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NoteValueV1 {
    pub base: SafeInteger,
    pub dots: SafeInteger,
    #[serde(
        default = "absent",
        deserialize_with = "present",
        skip_serializing_if = "Option::is_none"
    )]
    pub time_modification: Option<TimeModificationV1>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct TimeModificationV1 {
    pub actual_notes: SafeInteger,
    pub normal_notes: SafeInteger,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum RhythmicContentV1<Id = StableId> {
    Rest,
    Notes { notes: Vec<ScoreNoteV1<Id>> },
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ScoreNoteV1<Id = StableId> {
    pub id: Id,
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

impl<'de, Id: Deserialize<'de>> Deserialize<'de> for RhythmicContentV1<Id> {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        // serde's internally tagged unit variant ignores unknown fields even
        // with deny_unknown_fields. An empty struct variant enforces exact rest.
        #[derive(Deserialize)]
        #[serde(tag = "kind", rename_all = "kebab-case", deny_unknown_fields)]
        enum ExactContent<Id> {
            Rest {},
            Notes { notes: Vec<ScoreNoteV1<Id>> },
        }
        Ok(match ExactContent::deserialize(deserializer)? {
            ExactContent::Rest {} => Self::Rest,
            ExactContent::Notes { notes } => Self::Notes { notes },
        })
    }
}

// Optional score fields may be omitted, but an explicitly present null is not
// a score component value. Keep this rule identical for typed and admission IDs.
fn absent<T>() -> Option<T> {
    None
}

fn present<'de, T: Deserialize<'de>, D: serde::Deserializer<'de>>(
    deserializer: D,
) -> Result<Option<T>, D::Error> {
    T::deserialize(deserializer).map(Some)
}

/// Raw-ID components for command admission. The command codec applies numeric
/// and variant policies; these aliases do not establish semantic validity or
/// unique ownership, and cannot be passed to typed live-store APIs.
pub type AdmissionMeasureDefinitionV1 = MeasureDefinitionV1<String>;
pub type AdmissionPartV1 = PartV1<String>;
pub type AdmissionStaffDefinitionV1 = StaffDefinitionV1<String>;
pub type AdmissionVoiceV1 = VoiceV1<String>;
