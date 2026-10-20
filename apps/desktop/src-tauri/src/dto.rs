use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NewScoreInput {
    pub title: String,
    pub measure_count: u16,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CreateScoreRequest {
    pub workspace_id: String,
    pub input: NewScoreInput,
    pub request_id: String,
    pub expected_document_id: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq)]
#[serde(
    tag = "kind",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum DocumentReplacementPrecondition {
    Empty {},
    Document {
        document_id: String,
        document_version: u64,
    },
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GuardedCreateScoreRequest {
    pub workspace_id: String,
    pub input: NewScoreInput,
    pub request_id: String,
    pub expected: DocumentReplacementPrecondition,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EventDuration {
    pub base: u8,
    pub dots: u8,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub enum PitchStep {
    C,
    D,
    E,
    F,
    G,
    A,
    B,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct InputPitch {
    pub step: PitchStep,
    pub octave: i8,
    pub alter: i8,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(tag = "kind", rename_all = "kebab-case", deny_unknown_fields)]
pub enum InputContent {
    Rest,
    Note { pitch: InputPitch },
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(
    tag = "kind",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum InputSequenceAnchor {
    Start,
    AfterEvent { event_id: String },
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EventProperties {
    pub duration: EventDuration,
    pub content: InputContent,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ScoreEventRange {
    pub measure_id: String,
    pub voice_id: String,
    pub start_event_id: String,
    pub end_event_id: String,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct ScoreClipboardFragment {
    pub format: String,
    pub version: u8,
    pub events: Vec<EventProperties>,
}

#[derive(Clone, Copy, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum DeleteTimePolicy {
    #[default]
    Preserve,
    Collapse,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(
    tag = "kind",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum ScoreEditAction {
    Undo,
    Redo,
    InsertMeasure {
        measure_id: String,
        position: MeasureInsertPosition,
    },
    RemoveMeasure {
        measure_id: String,
    },
    SetMeasureMeter {
        measure_id: String,
        meter: Meter,
        scope: MeterChangeScope,
    },
    SetKeySignature {
        part_id: String,
        measure_id: String,
        change: KeySignatureChange,
    },
    SetStaffClef {
        staff_id: String,
        clef: StaffClef,
    },
    DeleteRange {
        range: ScoreEventRange,
    },
    PasteFragment {
        measure_id: String,
        voice_id: String,
        anchor: InputSequenceAnchor,
        #[serde(default)]
        offset_units: Option<u16>,
        fragment: ScoreClipboardFragment,
    },
    DeleteEvent {
        event_id: String,
        #[serde(default)]
        time_policy: DeleteTimePolicy,
    },
    SetEventProperties {
        event_id: String,
        properties: EventProperties,
    },
    SetFrettedPosition {
        part_id: String,
        event_id: String,
        position: FrettedPosition,
    },
    SetTitle {
        title: String,
    },
    SetTempo {
        tempo_bpm: f64,
    },
    SetMetadata {
        title: String,
        tempo_bpm: f64,
    },
    SetDocumentMetadata {
        metadata: DocumentMetadataInput,
    },
    Append {
        measure_id: String,
        anchor: InputSequenceAnchor,
        #[serde(default)]
        offset_units: Option<u16>,
        duration: EventDuration,
        content: InputContent,
    },
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum StaffClef {
    Treble,
    Bass,
    Alto,
    Tenor,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ScoreEditRequest {
    pub workspace_id: String,
    pub request_id: String,
    pub document_id: String,
    pub expected_version: u64,
    pub action: ScoreEditAction,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScoreSessionRead {
    pub document_id: String,
    pub title: String,
    pub measure_count: usize,
    pub document_version: u64,
    pub undo_depth: u64,
    pub redo_depth: u64,
    pub notation: NotationView,
    pub tablature: TablatureProjection,
    pub playback_source: PlaybackSourceProjection,
    pub metadata: DocumentMetadataInput,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub persistence: Option<ScorePersistenceState>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub warnings: Vec<WorkbenchIssue>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScorePersistenceState {
    pub session_id: String,
    pub saved_version: Option<u64>,
    pub dirty: bool,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DocumentMetadataInput {
    pub title: String,
    pub authors: Vec<String>,
    pub tempo_bpm: f64,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScoreSummaryV1 {
    pub document_id: String,
    pub document_version: u64,
    pub title: String,
    pub measure_count: usize,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScoreMetadataV1 {
    pub document_id: String,
    pub document_version: u64,
    pub title: String,
    pub authors: Vec<String>,
    pub tempo_bpm: f64,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScoreTitleUpdateV1 {
    pub document_id: String,
    pub document_version: u64,
    pub previous_title: String,
    pub title: String,
    pub undo_available: bool,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ScorePrepareTempoChangeInputV1 {
    pub tempo_bpm: f64,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ScorePrepareMetadataTransactionInputV1 {
    pub title: Option<String>,
    pub tempo_bpm: Option<f64>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ScoreTempoChangeSetV1 {
    pub change_set_id: String,
    pub kind: String,
    pub document_id: String,
    pub base_document_version: u64,
    pub before_tempo_bpm: f64,
    pub after_tempo_bpm: f64,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScoreTempoUpdateV1 {
    pub change_set_id: String,
    pub document_id: String,
    pub document_version: u64,
    pub previous_tempo_bpm: f64,
    pub tempo_bpm: f64,
    pub undo_available: bool,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
#[serde(rename_all = "camelCase")]
pub struct ScoreMetadataSnapshotV1 {
    pub title: String,
    pub tempo_bpm: f64,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum ScoreMetadataTransactionOperationV1 {
    SetTitle,
    SetTempo,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ScoreMetadataTransactionChangeSetV1 {
    pub change_set_id: String,
    pub kind: String,
    pub document_id: String,
    pub base_document_version: u64,
    pub operations: Vec<ScoreMetadataTransactionOperationV1>,
    pub before: ScoreMetadataSnapshotV1,
    pub after: ScoreMetadataSnapshotV1,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScoreMetadataTransactionUpdateV1 {
    pub change_set_id: String,
    pub document_id: String,
    pub document_version: u64,
    pub applied_operations: Vec<ScoreMetadataTransactionOperationV1>,
    pub previous: ScoreMetadataSnapshotV1,
    pub current: ScoreMetadataSnapshotV1,
    pub undo_available: bool,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScoreStructureV1 {
    pub document_id: String,
    pub document_version: u64,
    pub measure_count: usize,
    pub part_count: usize,
    pub staff_count: usize,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScoreMeasureIndexV1 {
    pub document_id: String,
    pub document_version: u64,
    pub measure_ids: Vec<String>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScoreMeasureRangeMeasureV1 {
    pub measure_id: String,
    pub meter: Meter,
    pub pickup_duration: Option<ExactFraction>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScoreMeasureRangeV1 {
    pub document_id: String,
    pub document_version: u64,
    pub start_measure_id: String,
    pub end_measure_id: String,
    pub measure_count: usize,
    pub measures: Vec<ScoreMeasureRangeMeasureV1>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CapabilityDocumentPrecondition {
    pub document_id: String,
    pub document_version: u64,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CapabilityTransportRequest {
    pub invocation_id: String,
    pub capability_id: String,
    pub contract_version: u64,
    pub workspace_id: String,
    #[serde(default)]
    pub document_precondition: Option<CapabilityDocumentPrecondition>,
    pub input: Value,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(
    tag = "kind",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase"
)]
pub enum PlaybackSourceProjection {
    Ready {
        projection_version: u8,
        document_id: String,
        document_version: u64,
        bpm: f64,
        written_to_sounding: PlaybackTransposition,
        measures: Vec<PlaybackSourceMeasure>,
    },
    Unsupported {
        projection_version: u8,
        document_id: String,
        document_version: u64,
        code: &'static str,
        message: String,
    },
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaybackTransposition {
    pub diatonic_steps: i64,
    pub chromatic_semitones: i64,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaybackSourceMeasure {
    pub id: String,
    pub meter: Meter,
    pub voice_start: ExactFraction,
    pub events: Vec<PlaybackSourceEvent>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
pub struct PlaybackSourceEvent {
    pub id: String,
    pub duration: ExactFraction,
    pub content: PlaybackSourceContent,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(
    tag = "kind",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase"
)]
pub enum PlaybackSourceContent {
    Rest,
    Note { written_pitch: InputPitch },
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(
    tag = "kind",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase"
)]
pub enum NotationView {
    Staff {
        part_id: String,
        staff_id: String,
        clef: &'static str,
        tempo_bpm: f64,
        key_signature_changes: Vec<KeySignatureChangeView>,
        measures: Vec<StaffMeasure>,
    },
    Unsupported {
        message: String,
    },
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(tag = "kind", rename_all = "kebab-case", rename_all_fields = "camelCase")]
pub enum TablatureProjection {
    Tablature {
        part_id: String, staff_id: String, tempo_bpm: f64,
        string_count: i64, fret_count: Option<i64>, capo_fret: i64,
        measures: Vec<TablatureMeasure>,
    },
    Unsupported { message: String },
}
#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TablatureMeasure {
    pub id: String, pub voice_id: String, pub meter: Meter,
    pub events: Vec<TablatureEvent>, pub rule_warnings: Vec<StaffRuleWarning>,
}
#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct TablatureEvent {
    pub id: String, pub duration: EventDuration, pub content: TablatureContent,
}
#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(tag = "kind", rename_all = "kebab-case", rename_all_fields = "camelCase")]
pub enum TablatureContent { Rest, Note { note_id: String, position: FrettedPosition } }
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FrettedPosition { pub string_number: i64, pub fret: i64 }

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(tag = "kind", rename_all = "kebab-case", deny_unknown_fields)]
pub enum KeySignatureChange {
    Set { fifths: i8 },
    Inherit {},
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KeySignatureChangeView {
    pub measure_id: String,
    pub measure_index: usize,
    pub fifths: i64,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StaffMeasure {
    pub id: String,
    pub voice_id: String,
    pub meter: Meter,
    pub events: Vec<StaffEvent>,
    pub rule_warnings: Vec<StaffRuleWarning>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
pub struct ExactFraction {
    pub numerator: i64,
    pub denominator: i64,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StaffRuleWarning {
    pub code: &'static str,
    pub nominal_duration: ExactFraction,
    pub actual_duration: ExactFraction,
    pub overflow: ExactFraction,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Meter {
    pub numerator: i64,
    pub denominator: i64,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum MeasureInsertPosition {
    Before,
    After,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum MeterChangeScope {
    Measure,
    MeterRun,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
pub struct StaffEvent {
    pub id: String,
    pub duration: EventDuration,
    pub content: InputContent,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeFileResult {
    pub session: ScoreSessionRead,
    pub name: String,
    pub saved_version: u64,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub warnings: Vec<WorkbenchIssue>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum WorkbenchIssueSeverity {
    Error,
    Warning,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum WorkbenchIssueSource {
    Core,
    Editor,
    Host,
    File,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(
    tag = "scope",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase"
)]
pub enum WorkbenchIssueTarget {
    Workbench,
    Measure {
        measure_id: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        event_id: Option<String>,
    },
    Event {
        measure_id: String,
        event_id: String,
    },
    Component {
        component_id: String,
    },
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbenchIssue {
    pub code: String,
    pub message: String,
    pub severity: WorkbenchIssueSeverity,
    pub source: WorkbenchIssueSource,
    pub target: WorkbenchIssueTarget,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub retryable: Option<bool>,
}
