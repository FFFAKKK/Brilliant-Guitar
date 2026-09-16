use serde::{Deserialize, Serialize};

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
#[serde(
    tag = "kind",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
pub enum ScoreEditAction {
    Undo,
    Redo,
    DeleteEvent {
        event_id: String,
    },
    SetEventProperties {
        event_id: String,
        properties: EventProperties,
    },
    SetTitle {
        title: String,
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

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ScoreEditRequest {
    pub workspace_id: String,
    pub request_id: String,
    pub document_id: String,
    pub expected_version: u64,
    pub action: ScoreEditAction,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScoreSessionRead {
    pub document_id: String,
    pub title: String,
    pub measure_count: usize,
    pub document_version: u64,
    pub undo_depth: u64,
    pub redo_depth: u64,
    pub notation: NotationView,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
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
        measures: Vec<StaffMeasure>,
    },
    Unsupported {
        message: String,
    },
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StaffMeasure {
    pub id: String,
    pub voice_id: String,
    pub meter: Meter,
    pub events: Vec<StaffEvent>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
pub struct Meter {
    pub numerator: i64,
    pub denominator: i64,
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
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum WorkbenchIssueSeverity {
    Error,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum WorkbenchIssueSource {
    Core,
    Editor,
    Host,
    File,
}

#[derive(Clone, Debug, Serialize)]
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

#[derive(Clone, Debug, Serialize)]
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
