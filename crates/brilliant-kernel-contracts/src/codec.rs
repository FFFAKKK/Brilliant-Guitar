use brilliant_core_types::JsonObject;
use std::io::Write;

use brilliant_core_types::{
    API_VERSION_V1, JS_SAFE_INTEGER_MAX, JSON_DEPTH_LIMIT, JSON_PROPERTY_LIMIT, JsString,
    LosslessJsonValue, SafeInteger, ScoreSchemaVersionV1, StablePathSegmentV1, StablePathV1,
};
use brilliant_extension_protocol::EXTENSION_PROTOCOL_VERSION_V1;
use brilliant_score_foundation::{
    ClefV1, FoundationDecodeFailure, FractionV1, InstrumentDescriptorV1, LosslessDecode,
    LosslessText, MeasureDefinitionV1, MeterV1, NoteValueV1, PartV1, RhythmicContentV1,
    RhythmicEventV1, ScoreMetadataV1, StaffDefinitionV1, TranspositionV1, VoiceV1, WrittenPitchV1,
    decode_lossless_score_document_value,
};
#[cfg(test)]
use serde_json::Value;

mod capture;
mod input;
mod output;
use capture::{CapturedObjectExt, CapturedValueExt, known_tag, strict_json};

#[cfg(test)]
#[path = "admission_tests.rs"]
mod admission_tests;

use crate::{
    COMMAND_VERSION_V1, CapturedCoreCommandV1, CoreCommandEnvelopeV1, CoreCommandIdV1,
    CoreCommandTargetKindV1, EventStaffAssignmentV1, InsertMeasurePartContentV1,
    KernelSessionCreateRequestV1, KernelSessionCreateResultV1, KernelSessionReadResultV1,
    KernelStage3CommandFailureLeafV1, KernelStage3CommandFailureV1,
    KernelStage3ResourceLimitKindV1, KernelStage3SubmitDecodeFailureV1,
    KernelStage3SubmitRequestV1, KernelStage3SubmitResultV1, KernelStage4OperationDecodeFailureV1,
    KernelStage4OperationRequestV1, KernelStage4OperationResultV1, KernelStage4OperationV1,
    KernelStage4ReplayRequestV1, KernelStage4ReplayResultV1, MAX_BATCH_CHILDREN_V1,
    MeasureAnchorV1, MeasurePickupV1, PartAnchorV1, PersistedCheckpointV1, ScoreEntityTargetV1,
    ScoreRangeV1, ScoreStructureViolationV1, SelectorRequestV1, SequenceAnchorV1, ShapeViolationV1,
    StableFailureV1, StaffAnchorV1, VoiceAnchorV1,
};

pub const REQUEST_BYTE_LIMIT: usize = 64 * 1024 * 1024;
pub const RESPONSE_BYTE_LIMIT: usize = 64 * 1024 * 1024;

#[derive(Clone, Debug, Eq, Ord, PartialEq, PartialOrd)]
enum CanonicalPathSegment {
    Field(&'static str),
    Index(u64),
}

#[derive(Clone, Debug, Default, Eq, Ord, PartialEq, PartialOrd)]
struct CanonicalPath(Vec<CanonicalPathSegment>);

impl CanonicalPath {
    fn field(&self, field: &'static str) -> Self {
        let mut segments = self.0.clone();
        segments.push(CanonicalPathSegment::Field(field));
        Self(segments)
    }

    fn index(&self, index: usize) -> Self {
        let mut segments = self.0.clone();
        segments.push(CanonicalPathSegment::Index(index as u64));
        Self(segments)
    }

    fn stable(&self) -> StablePathV1 {
        let segments = self
            .0
            .iter()
            .map(|segment| match segment {
                CanonicalPathSegment::Field(field) => {
                    StablePathSegmentV1::Field((*field).to_owned())
                }
                CanonicalPathSegment::Index(index) => StablePathSegmentV1::Index(*index),
            })
            .collect();
        StablePathV1::new(segments).unwrap_or_else(|_| StablePathV1::root())
    }
}

fn canonical_field(field: &str) -> Option<&'static str> {
    Some(match field {
        "apiVersion" => "apiVersion",
        "command" => "command",
        "commandVersion" => "commandVersion",
        "commandId" => "commandId",
        "target" => "target",
        "document" => "document",
        "schemaVersion" => "schemaVersion",
        "id" => "id",
        "metadata" => "metadata",
        "title" => "title",
        "authors" => "authors",
        "tempo" => "tempo",
        "bpm" => "bpm",
        "measureDefinitions" => "measureDefinitions",
        "parts" => "parts",
        "extensions" => "extensions",
        "meter" => "meter",
        "numerator" => "numerator",
        "denominator" => "denominator",
        "pickupDuration" => "pickupDuration",
        "name" => "name",
        "instrument" => "instrument",
        "writtenToSounding" => "writtenToSounding",
        "diatonicSteps" => "diatonicSteps",
        "chromaticSemitones" => "chromaticSemitones",
        "staves" => "staves",
        "lineCount" => "lineCount",
        "defaultClef" => "defaultClef",
        "sign" => "sign",
        "line" => "line",
        "measureContents" => "measureContents",
        "measureId" => "measureId",
        "voices" => "voices",
        "defaultStaffId" => "defaultStaffId",
        "sequence" => "sequence",
        "start" => "start",
        "events" => "events",
        "duration" => "duration",
        "staffId" => "staffId",
        "content" => "content",
        "base" => "base",
        "dots" => "dots",
        "timeModification" => "timeModification",
        "actualNotes" => "actualNotes",
        "normalNotes" => "normalNotes",
        "kind" => "kind",
        "notes" => "notes",
        "writtenPitch" => "writtenPitch",
        "step" => "step",
        "alter" => "alter",
        "octave" => "octave",
        "namespace" => "namespace",
        "owner" => "owner",
        "payload" => "payload",
        "partId" => "partId",
        "documentId" => "documentId",
        "voiceId" => "voiceId",
        "eventId" => "eventId",
        "noteId" => "noteId",
        "anchor" => "anchor",
        "event" => "event",
        "noteValue" => "noteValue",
        "definition" => "definition",
        "contents" => "contents",
        "pickup" => "pickup",
        "staff" => "staff",
        "voice" => "voice",
        "assignment" => "assignment",
        "range" => "range",
        "end" => "end",
        "transposition" => "transposition",
        "commands" => "commands",
        "operation" => "operation",
        "checkpoint" => "checkpoint",
        "documentVersion" => "documentVersion",
        "knownSnapshotVersion" => "knownSnapshotVersion",
        "selector" => "selector",
        "selectorId" => "selectorId",
        "address" => "address",
        "initialDocument" => "initialDocument",
        _ => return None,
    })
}

type StrictValue = LosslessJsonValue;
type CapturedValue = LosslessJsonValue;

#[derive(Clone, Debug)]
struct ShapeFault {
    rank: u8,
    path: CanonicalPath,
    violation: ShapeViolationV1,
}

#[derive(Clone, Debug)]
struct DepthFault {
    actual: u64,
    path: CanonicalPath,
}

#[cfg(test)]
#[derive(Default)]
struct StrictMetrics {
    members_visited: u64,
    unique_retained: u64,
    duplicate_discarded: u64,
    post_limit_retained: u64,
    fault_slot_high_water: usize,
}

struct StrictState {
    // Raw protocol integers historically retain u64 spelling/classification.
    // Command versions instead use the JavaScript safe-integer domain.
    root_api_integer: Option<u64>,
    nodes_visited: u64,
    depth_fault: Option<DepthFault>,
    property_fault: Option<u64>,
    shape_fault: Option<ShapeFault>,
    number_fault: Option<CanonicalPath>,
    retain_values: bool,
    #[cfg(test)]
    metrics: StrictMetrics,
}

impl Default for StrictState {
    fn default() -> Self {
        Self {
            root_api_integer: None,
            nodes_visited: 0,
            depth_fault: None,
            property_fault: None,
            shape_fault: None,
            number_fault: None,
            retain_values: true,
            #[cfg(test)]
            metrics: StrictMetrics::default(),
        }
    }
}

impl StrictState {
    fn observe_value(&mut self, depth: usize, path: &CanonicalPath) -> bool {
        self.nodes_visited = self.nodes_visited.saturating_add(1);
        if depth > JSON_DEPTH_LIMIT {
            let candidate = DepthFault {
                actual: u64::try_from(depth).unwrap_or(u64::MAX),
                path: path.clone(),
            };
            if self.depth_fault.as_ref().is_none_or(|current| {
                (&candidate.path, candidate.actual) < (&current.path, current.actual)
            }) {
                self.depth_fault = Some(candidate);
            }
            self.retain_values = false;
            self.observe_fault_slots();
        }
        if self.nodes_visited > JSON_PROPERTY_LIMIT as u64 && self.property_fault.is_none() {
            self.property_fault = Some(JSON_PROPERTY_LIMIT as u64 + 1);
            self.retain_values = false;
            self.observe_fault_slots();
        }
        self.retain_values
    }

    fn can_retain(&self) -> bool {
        self.retain_values
    }

    fn record_shape(&mut self, rank: u8, path: CanonicalPath, violation: ShapeViolationV1) {
        let candidate = ShapeFault {
            rank,
            path,
            violation,
        };
        if self.shape_fault.as_ref().is_none_or(|current| {
            (&candidate.rank, &candidate.path) < (&current.rank, &current.path)
        }) {
            self.shape_fault = Some(candidate);
            self.observe_fault_slots();
        }
    }

    fn record_number(&mut self, path: CanonicalPath) {
        if self
            .number_fault
            .as_ref()
            .is_none_or(|current| path < *current)
        {
            self.number_fault = Some(path);
            self.observe_fault_slots();
        }
    }

    #[cfg(test)]
    fn observe_fault_slots(&mut self) {
        let slots = usize::from(self.depth_fault.is_some())
            + usize::from(self.property_fault.is_some())
            + usize::from(self.shape_fault.is_some())
            + usize::from(self.number_fault.is_some());
        self.metrics.fault_slot_high_water = self.metrics.fault_slot_high_water.max(slots);
    }

    #[cfg(not(test))]
    fn observe_fault_slots(&mut self) {}

    fn failure(&self) -> Option<StableFailureV1> {
        if let Some(fault) = &self.depth_fault {
            return Some(StableFailureV1::CodecDepthLimit {
                limit: JSON_DEPTH_LIMIT as u64,
                actual: fault.actual,
            });
        }
        if let Some(actual) = self.property_fault {
            return Some(StableFailureV1::CodecPropertyLimit {
                limit: JSON_PROPERTY_LIMIT as u64,
                actual,
            });
        }
        if let Some(fault) = &self.shape_fault {
            return Some(StableFailureV1::CodecInvalidShape {
                path: fault.path.stable(),
                violation: fault.violation,
            });
        }
        self.number_fault
            .as_ref()
            .map(|path| StableFailureV1::CodecNumberOutOfRange {
                path: path.stable(),
            })
    }
}

fn record_wrong_type(state: &mut StrictState, path: &CanonicalPath) {
    state.record_shape(3, path.clone(), ShapeViolationV1::WrongType);
}

fn exact_object<'a>(
    value: &'a StrictValue,
    path: &CanonicalPath,
    required: &[&'static str],
    optional: &[&'static str],
    state: &mut StrictState,
) -> Option<&'a JsonObject<JsString, StrictValue>> {
    let StrictValue::Object(entries) = value else {
        record_wrong_type(state, path);
        return None;
    };
    for field in required {
        if !entries.contains_ascii(field) {
            state.record_shape(0, path.field(field), ShapeViolationV1::MissingField);
        }
    }
    if entries.keys().any(|key| {
        !required
            .iter()
            .chain(optional)
            .any(|allowed| key.eq_ascii(allowed))
    }) {
        state.record_shape(1, path.clone(), ShapeViolationV1::ExtraField);
    }
    Some(entries)
}

fn field_values<'a>(
    entries: &'a JsonObject<JsString, StrictValue>,
    field: &'static str,
) -> impl Iterator<Item = &'a StrictValue> {
    entries.get_ascii(field).into_iter()
}

fn exact_array<'a>(
    value: &'a StrictValue,
    path: &CanonicalPath,
    state: &mut StrictState,
) -> Option<&'a [StrictValue]> {
    let StrictValue::Array(values) = value else {
        record_wrong_type(state, path);
        return None;
    };
    Some(values)
}

fn expect_string(value: &StrictValue, path: &CanonicalPath, state: &mut StrictState) {
    if !matches!(value, StrictValue::String(_)) {
        record_wrong_type(state, path);
    }
}

fn expect_number(value: &StrictValue, path: &CanonicalPath, state: &mut StrictState) {
    match value {
        StrictValue::Number(number) => {
            let safe =
                number.get().fract() == 0.0 && number.get().abs() <= JS_SAFE_INTEGER_MAX as f64;
            if !safe {
                state.record_number(path.clone());
            }
        }
        _ => record_wrong_type(state, path),
    }
}

fn expect_finite_number(value: &StrictValue, path: &CanonicalPath, state: &mut StrictState) {
    if !matches!(value, StrictValue::Number(_)) {
        record_wrong_type(state, path);
    }
}

fn expect_tag(
    value: &StrictValue,
    path: &CanonicalPath,
    allowed: &[&str],
    state: &mut StrictState,
) {
    match value {
        StrictValue::String(value) if allowed.iter().any(|literal| value.eq_ascii(literal)) => {}
        StrictValue::String(_) => {
            state.record_shape(4, path.clone(), ShapeViolationV1::InvalidTag);
        }
        _ => record_wrong_type(state, path),
    }
}

fn validate_fraction(value: &StrictValue, path: &CanonicalPath, state: &mut StrictState) {
    let Some(entries) = exact_object(value, path, &["numerator", "denominator"], &[], state) else {
        return;
    };
    for value in field_values(entries, "numerator") {
        expect_number(value, &path.field("numerator"), state);
    }
    for value in field_values(entries, "denominator") {
        expect_number(value, &path.field("denominator"), state);
    }
}

fn validate_note_value(value: &StrictValue, path: &CanonicalPath, state: &mut StrictState) {
    let Some(entries) = exact_object(value, path, &["base", "dots"], &["timeModification"], state)
    else {
        return;
    };
    for field in ["base", "dots"] {
        for value in field_values(entries, field) {
            expect_number(value, &path.field(field), state);
        }
    }
    for value in field_values(entries, "timeModification") {
        let child = path.field("timeModification");
        let Some(modification) =
            exact_object(value, &child, &["actualNotes", "normalNotes"], &[], state)
        else {
            continue;
        };
        for field in ["actualNotes", "normalNotes"] {
            for value in field_values(modification, field) {
                expect_number(value, &child.field(field), state);
            }
        }
    }
}

fn validate_written_pitch(value: &StrictValue, path: &CanonicalPath, state: &mut StrictState) {
    let Some(entries) = exact_object(value, path, &["step", "alter", "octave"], &[], state) else {
        return;
    };
    for value in field_values(entries, "step") {
        expect_tag(
            value,
            &path.field("step"),
            &["C", "D", "E", "F", "G", "A", "B"],
            state,
        );
    }
    for field in ["alter", "octave"] {
        for value in field_values(entries, field) {
            expect_number(value, &path.field(field), state);
        }
    }
}

fn validate_notes(value: &StrictValue, path: &CanonicalPath, state: &mut StrictState) {
    let Some(values) = exact_array(value, path, state) else {
        return;
    };
    for (index, value) in values.iter().enumerate() {
        let note_path = path.index(index);
        let Some(note) = exact_object(value, &note_path, &["id", "writtenPitch"], &[], state)
        else {
            continue;
        };
        for value in field_values(note, "id") {
            expect_string(value, &note_path.field("id"), state);
        }
        for value in field_values(note, "writtenPitch") {
            validate_written_pitch(value, &note_path.field("writtenPitch"), state);
        }
    }
}

fn validate_content(value: &StrictValue, path: &CanonicalPath, state: &mut StrictState) {
    let StrictValue::Object(entries) = value else {
        record_wrong_type(state, path);
        return;
    };
    let kind_values = field_values(entries, "kind").collect::<Vec<_>>();
    if kind_values.is_empty() {
        state.record_shape(0, path.field("kind"), ShapeViolationV1::MissingField);
        return;
    }
    let mut valid_kinds = Vec::new();
    for kind in kind_values {
        expect_tag(kind, &path.field("kind"), &["rest", "notes"], state);
        if let StrictValue::String(kind) = kind
            && matches!(known_tag(kind), "rest" | "notes")
        {
            valid_kinds.push(known_tag(kind));
        }
    }
    for kind in valid_kinds {
        let required: &[&'static str] = if kind == "notes" {
            &["kind", "notes"]
        } else {
            &["kind"]
        };
        let Some(exact) = exact_object(value, path, required, &[], state) else {
            continue;
        };
        if kind == "notes" {
            for notes in field_values(exact, "notes") {
                validate_notes(notes, &path.field("notes"), state);
            }
        }
    }
}

fn validate_event(value: &StrictValue, path: &CanonicalPath, state: &mut StrictState) {
    let Some(entries) = exact_object(
        value,
        path,
        &["id", "duration", "content"],
        &["staffId"],
        state,
    ) else {
        return;
    };
    for value in field_values(entries, "id") {
        expect_string(value, &path.field("id"), state);
    }
    for value in field_values(entries, "staffId") {
        expect_string(value, &path.field("staffId"), state);
    }
    for value in field_values(entries, "duration") {
        validate_note_value(value, &path.field("duration"), state);
    }
    for value in field_values(entries, "content") {
        validate_content(value, &path.field("content"), state);
    }
}

fn validate_sequence(value: &StrictValue, path: &CanonicalPath, state: &mut StrictState) {
    let Some(entries) = exact_object(value, path, &["start", "events"], &[], state) else {
        return;
    };
    for value in field_values(entries, "start") {
        validate_fraction(value, &path.field("start"), state);
    }
    for value in field_values(entries, "events") {
        let events_path = path.field("events");
        let Some(events) = exact_array(value, &events_path, state) else {
            continue;
        };
        for (index, event) in events.iter().enumerate() {
            validate_event(event, &events_path.index(index), state);
        }
    }
}

fn validate_voice(value: &StrictValue, path: &CanonicalPath, state: &mut StrictState) {
    let Some(entries) = exact_object(
        value,
        path,
        &["id", "defaultStaffId", "sequence"],
        &[],
        state,
    ) else {
        return;
    };
    for field in ["id", "defaultStaffId"] {
        for value in field_values(entries, field) {
            expect_string(value, &path.field(field), state);
        }
    }
    for value in field_values(entries, "sequence") {
        validate_sequence(value, &path.field("sequence"), state);
    }
}

fn validate_measure_content(value: &StrictValue, path: &CanonicalPath, state: &mut StrictState) {
    let Some(entries) = exact_object(value, path, &["measureId", "voices"], &[], state) else {
        return;
    };
    for value in field_values(entries, "measureId") {
        expect_string(value, &path.field("measureId"), state);
    }
    for value in field_values(entries, "voices") {
        let voices_path = path.field("voices");
        let Some(voices) = exact_array(value, &voices_path, state) else {
            continue;
        };
        for (index, voice) in voices.iter().enumerate() {
            validate_voice(voice, &voices_path.index(index), state);
        }
    }
}

fn validate_clef(value: &StrictValue, path: &CanonicalPath, state: &mut StrictState) {
    let Some(entries) = exact_object(value, path, &["sign", "line"], &[], state) else {
        return;
    };
    for value in field_values(entries, "sign") {
        expect_tag(value, &path.field("sign"), &["G", "F", "C"], state);
    }
    for value in field_values(entries, "line") {
        expect_number(value, &path.field("line"), state);
    }
}

fn validate_staff(value: &StrictValue, path: &CanonicalPath, state: &mut StrictState) {
    let Some(entries) = exact_object(value, path, &["id", "lineCount", "defaultClef"], &[], state)
    else {
        return;
    };
    for value in field_values(entries, "id") {
        expect_string(value, &path.field("id"), state);
    }
    for value in field_values(entries, "lineCount") {
        expect_number(value, &path.field("lineCount"), state);
    }
    for value in field_values(entries, "defaultClef") {
        validate_clef(value, &path.field("defaultClef"), state);
    }
}

fn validate_instrument(value: &StrictValue, path: &CanonicalPath, state: &mut StrictState) {
    let Some(entries) = exact_object(value, path, &["name", "writtenToSounding"], &[], state)
    else {
        return;
    };
    for value in field_values(entries, "name") {
        expect_string(value, &path.field("name"), state);
    }
    for value in field_values(entries, "writtenToSounding") {
        let transposition_path = path.field("writtenToSounding");
        let Some(transposition) = exact_object(
            value,
            &transposition_path,
            &["diatonicSteps", "chromaticSemitones"],
            &[],
            state,
        ) else {
            continue;
        };
        for field in ["diatonicSteps", "chromaticSemitones"] {
            for value in field_values(transposition, field) {
                expect_number(value, &transposition_path.field(field), state);
            }
        }
    }
}

fn validate_part(value: &StrictValue, path: &CanonicalPath, state: &mut StrictState) {
    let Some(entries) = exact_object(
        value,
        path,
        &["id", "name", "instrument", "staves", "measureContents"],
        &[],
        state,
    ) else {
        return;
    };
    for field in ["id", "name"] {
        for value in field_values(entries, field) {
            expect_string(value, &path.field(field), state);
        }
    }
    for value in field_values(entries, "instrument") {
        validate_instrument(value, &path.field("instrument"), state);
    }
    for value in field_values(entries, "staves") {
        let staves_path = path.field("staves");
        let Some(staves) = exact_array(value, &staves_path, state) else {
            continue;
        };
        for (index, staff) in staves.iter().enumerate() {
            validate_staff(staff, &staves_path.index(index), state);
        }
    }
    for value in field_values(entries, "measureContents") {
        let contents_path = path.field("measureContents");
        let Some(contents) = exact_array(value, &contents_path, state) else {
            continue;
        };
        for (index, content) in contents.iter().enumerate() {
            validate_measure_content(content, &contents_path.index(index), state);
        }
    }
}

fn validate_measure_definition(value: &StrictValue, path: &CanonicalPath, state: &mut StrictState) {
    let Some(entries) = exact_object(value, path, &["id", "meter"], &["pickupDuration"], state)
    else {
        return;
    };
    for value in field_values(entries, "id") {
        expect_string(value, &path.field("id"), state);
    }
    for value in field_values(entries, "meter") {
        validate_fraction(value, &path.field("meter"), state);
    }
    for value in field_values(entries, "pickupDuration") {
        validate_fraction(value, &path.field("pickupDuration"), state);
    }
}

fn validate_metadata(value: &StrictValue, path: &CanonicalPath, state: &mut StrictState) {
    let Some(entries) = exact_object(value, path, &["title", "authors", "tempo"], &[], state)
    else {
        return;
    };
    for value in field_values(entries, "title") {
        expect_string(value, &path.field("title"), state);
    }
    for value in field_values(entries, "authors") {
        let authors_path = path.field("authors");
        let Some(authors) = exact_array(value, &authors_path, state) else {
            continue;
        };
        for (index, author) in authors.iter().enumerate() {
            expect_string(author, &authors_path.index(index), state);
        }
    }
    for value in field_values(entries, "tempo") {
        let tempo_path = path.field("tempo");
        let Some(tempo) = exact_object(value, &tempo_path, &["bpm"], &[], state) else {
            continue;
        };
        for value in field_values(tempo, "bpm") {
            expect_finite_number(value, &tempo_path.field("bpm"), state);
        }
    }
}

fn validate_owner(value: &StrictValue, path: &CanonicalPath, state: &mut StrictState) {
    let StrictValue::Object(entries) = value else {
        record_wrong_type(state, path);
        return;
    };
    let kind_values = field_values(entries, "kind").collect::<Vec<_>>();
    if kind_values.is_empty() {
        state.record_shape(0, path.field("kind"), ShapeViolationV1::MissingField);
        return;
    }
    for kind in kind_values {
        expect_tag(kind, &path.field("kind"), &["score", "part"], state);
        let StrictValue::String(kind) = kind else {
            continue;
        };
        if !matches!(known_tag(kind), "score" | "part") {
            continue;
        }
        let required: &[&'static str] = if kind.eq_ascii("part") {
            &["kind", "partId"]
        } else {
            &["kind"]
        };
        let Some(owner) = exact_object(value, path, required, &[], state) else {
            continue;
        };
        if kind.eq_ascii("part") {
            for value in field_values(owner, "partId") {
                expect_string(value, &path.field("partId"), state);
            }
        }
    }
}

fn validate_extension(value: &StrictValue, path: &CanonicalPath, state: &mut StrictState) {
    let Some(entries) = exact_object(
        value,
        path,
        &["namespace", "schemaVersion", "owner", "payload"],
        &[],
        state,
    ) else {
        return;
    };
    for value in field_values(entries, "namespace") {
        expect_string(value, &path.field("namespace"), state);
    }
    for value in field_values(entries, "schemaVersion") {
        expect_number(value, &path.field("schemaVersion"), state);
    }
    for value in field_values(entries, "owner") {
        validate_owner(value, &path.field("owner"), state);
    }
    for value in field_values(entries, "payload") {
        if !matches!(value, StrictValue::Object(_)) {
            record_wrong_type(state, &path.field("payload"));
        }
    }
}

fn validate_document(value: &StrictValue, path: &CanonicalPath, state: &mut StrictState) {
    let Some(entries) = exact_object(
        value,
        path,
        &[
            "schemaVersion",
            "id",
            "metadata",
            "measureDefinitions",
            "parts",
            "extensions",
        ],
        &[],
        state,
    ) else {
        return;
    };
    for field in ["schemaVersion", "id"] {
        for value in field_values(entries, field) {
            expect_string(value, &path.field(field), state);
        }
    }
    for value in field_values(entries, "metadata") {
        validate_metadata(value, &path.field("metadata"), state);
    }
    for value in field_values(entries, "measureDefinitions") {
        let measures_path = path.field("measureDefinitions");
        let Some(measures) = exact_array(value, &measures_path, state) else {
            continue;
        };
        for (index, measure) in measures.iter().enumerate() {
            validate_measure_definition(measure, &measures_path.index(index), state);
        }
    }
    for value in field_values(entries, "parts") {
        let parts_path = path.field("parts");
        let Some(parts) = exact_array(value, &parts_path, state) else {
            continue;
        };
        for (index, part) in parts.iter().enumerate() {
            validate_part(part, &parts_path.index(index), state);
        }
    }
    for value in field_values(entries, "extensions") {
        let extensions_path = path.field("extensions");
        let Some(extensions) = exact_array(value, &extensions_path, state) else {
            continue;
        };
        for (index, extension) in extensions.iter().enumerate() {
            validate_extension(extension, &extensions_path.index(index), state);
        }
    }
}

fn validate_create_shape(value: &StrictValue, state: &mut StrictState) {
    let root = CanonicalPath::default();
    let Some(entries) = exact_object(value, &root, &["apiVersion", "document"], &[], state) else {
        return;
    };
    for value in field_values(entries, "apiVersion") {
        expect_number(value, &root.field("apiVersion"), state);
    }
    for value in field_values(entries, "document") {
        validate_document(value, &root.field("document"), state);
    }
}

pub fn validate_protocol_version(protocol_version: u64) -> Result<(), StableFailureV1> {
    if protocol_version == EXTENSION_PROTOCOL_VERSION_V1 {
        Ok(())
    } else {
        Err(StableFailureV1::ContractUnsupportedProtocolVersion {
            supported_version: EXTENSION_PROTOCOL_VERSION_V1,
        })
    }
}

pub fn decode_create_request(
    bytes: &[u8],
) -> Result<KernelSessionCreateRequestV1, StableFailureV1> {
    if bytes.len() > REQUEST_BYTE_LIMIT {
        return Err(StableFailureV1::BridgeRequestTooLarge {
            limit_bytes: REQUEST_BYTE_LIMIT as u64,
            actual_bytes: bytes.len() as u64,
        });
    }
    let (strict_value, mut state) = strict_json(bytes)?;
    if state.can_retain()
        && let Some(value) = &strict_value
    {
        validate_create_shape(value, &mut state);
    }
    if let Some(failure) = state.failure() {
        return Err(failure);
    }
    let strict_value = strict_value.ok_or(StableFailureV1::BridgeInternal)?;
    let value = strict_value;
    let mut object = value
        .into_object()
        .ok_or_else(|| StableFailureV1::CodecInvalidShape {
            path: StablePathV1::root(),
            violation: ShapeViolationV1::WrongType,
        })?;
    for required in ["apiVersion", "document"] {
        if !object.contains_ascii(required) {
            return Err(StableFailureV1::CodecInvalidShape {
                path: StablePathV1::field(required),
                violation: ShapeViolationV1::MissingField,
            });
        }
    }
    if object.len() != 2 {
        return Err(StableFailureV1::CodecInvalidShape {
            path: StablePathV1::root(),
            violation: ShapeViolationV1::ExtraField,
        });
    }
    let api_version = object.at_ascii("apiVersion").as_i64().ok_or_else(|| {
        StableFailureV1::CodecInvalidShape {
            path: StablePathV1::field("apiVersion"),
            violation: ShapeViolationV1::WrongType,
        }
    })?;
    if api_version != API_VERSION_V1 as i64 {
        return Err(StableFailureV1::ContractUnsupportedApiVersion {
            supported_version: API_VERSION_V1,
        });
    }
    let document_value = object
        .remove(&JsString::from("document"))
        .expect("validated document");
    let schema = document_value
        .as_object()
        .and_then(|document| document.get_ascii("schemaVersion"))
        .and_then(CapturedValue::as_text)
        .ok_or_else(|| StableFailureV1::CodecInvalidShape {
            path: CanonicalPath::default()
                .field("document")
                .field("schemaVersion")
                .stable(),
            violation: ShapeViolationV1::WrongType,
        })?;
    if !schema.eq_ascii(ScoreSchemaVersionV1::VALUE) {
        return Err(StableFailureV1::ScoreUnsupportedSchema {
            supported_schema: ScoreSchemaVersionV1::VALUE,
        });
    }
    let document =
        decode_lossless_score_document_value(document_value).map_err(map_foundation_failure)?;
    Ok(KernelSessionCreateRequestV1 {
        api_version: API_VERSION_V1,
        document,
    })
}

struct EmptyCommandPayloadV1 {}

struct SetMetadataPayloadV1 {
    metadata: ScoreMetadataV1,
}

struct SetWrittenPitchPayloadV1 {
    written_pitch: WrittenPitchV1,
}

struct SetNoteValuePayloadV1 {
    note_value: NoteValueV1,
}

struct InsertEventPayloadV1 {
    anchor: SequenceAnchorV1,
    event: RhythmicEventV1,
}

struct InsertMeasurePayloadV1<Id> {
    anchor: MeasureAnchorV1<Id>,
    definition: MeasureDefinitionV1<Id>,
    contents: Vec<InsertMeasurePartContentV1<Id>>,
}

struct MoveMeasurePayloadV1<Id> {
    anchor: MeasureAnchorV1<Id>,
}

struct SetMeasureDefinitionPayloadV1 {
    meter: MeterV1,
    pickup: MeasurePickupV1,
}

struct InsertPartPayloadV1<Id> {
    anchor: PartAnchorV1<Id>,
    part: PartV1<Id>,
}

struct MovePartPayloadV1<Id> {
    anchor: PartAnchorV1<Id>,
}

struct SetPartNamePayloadV1 {
    name: JsString,
}

struct SetPartInstrumentPayloadV1 {
    instrument: InstrumentDescriptorV1,
}

struct InsertStaffPayloadV1<Id> {
    anchor: StaffAnchorV1<Id>,
    staff: StaffDefinitionV1<Id>,
}

struct MoveStaffPayloadV1<Id> {
    anchor: StaffAnchorV1<Id>,
}

struct SetStaffDefinitionPayloadV1 {
    line_count: SafeInteger,
    default_clef: ClefV1,
}

struct InsertVoicePayloadV1<Id> {
    measure_id: Id,
    anchor: VoiceAnchorV1<Id>,
    voice: VoiceV1<Id>,
}

struct MoveVoicePayloadV1<Id> {
    anchor: VoiceAnchorV1<Id>,
}

struct SetVoiceDefaultStaffPayloadV1<Id> {
    staff_id: Id,
}

struct SetVoiceSequenceStartPayloadV1 {
    start: FractionV1,
}

struct SetEventStaffAssignmentPayloadV1<Id> {
    assignment: EventStaffAssignmentV1<Id>,
}

struct DeleteRangePayloadV1 {
    range: ScoreRangeV1,
}

struct TransposeRangePayloadV1 {
    range: ScoreRangeV1,
    transposition: TranspositionV1,
}

fn command_decode_failure(
    failure: KernelStage3CommandFailureLeafV1,
) -> KernelStage3SubmitDecodeFailureV1 {
    KernelStage3SubmitDecodeFailureV1::Command(failure.into())
}

fn invalid_command_envelope() -> KernelStage3CommandFailureV1 {
    KernelStage3CommandFailureLeafV1::InvalidEnvelope.into()
}

fn decode_payload<T: LosslessDecode>(
    value: &CapturedValue,
) -> Result<T, KernelStage3CommandFailureV1> {
    T::from_lossless_value(value.clone()).map_err(|_| invalid_command_envelope())
}

fn target_kind(value: &CapturedValue) -> Option<CoreCommandTargetKindV1> {
    match known_tag(value.as_object()?.get_ascii("kind")?.as_text()?) {
        "document" => Some(CoreCommandTargetKindV1::Document),
        "measure" => Some(CoreCommandTargetKindV1::Measure),
        "part" => Some(CoreCommandTargetKindV1::Part),
        "staff" => Some(CoreCommandTargetKindV1::Staff),
        "voice" => Some(CoreCommandTargetKindV1::Voice),
        "event" => Some(CoreCommandTargetKindV1::Event),
        "note" => Some(CoreCommandTargetKindV1::Note),
        _ => None,
    }
}

fn exact_json_object<'a>(
    value: &'a CapturedValue,
    required: &[&str],
) -> Option<&'a JsonObject<JsString, CapturedValue>> {
    let object = value.as_object()?;
    (object.len() == required.len() && required.iter().all(|field| object.contains_ascii(field)))
        .then_some(object)
}

fn exact_owned_object(
    value: CapturedValue,
    required: &[&str],
) -> Option<JsonObject<JsString, CapturedValue>> {
    exact_json_object(&value, required)?;
    value.into_object()
}

fn component_written_pitch_is_valid(value: &WrittenPitchV1) -> bool {
    (-2..=2).contains(&value.alter.get())
}

fn direct_written_pitch_is_valid(value: &WrittenPitchV1) -> bool {
    component_written_pitch_is_valid(value) && (0..=8).contains(&value.octave.get())
}

fn component_note_value_is_valid(value: &NoteValueV1) -> bool {
    matches!(value.base.get(), 1 | 2 | 4 | 8 | 16 | 32 | 64) && (0..=3).contains(&value.dots.get())
}

fn direct_note_value_is_valid(value: &NoteValueV1) -> bool {
    component_note_value_is_valid(value)
        && value.time_modification.as_ref().is_none_or(|modification| {
            modification.actual_notes.get() > 0 && modification.normal_notes.get() > 0
        })
}

fn component_event_is_valid<Id>(event: &RhythmicEventV1<Id>) -> bool {
    component_note_value_is_valid(&event.duration)
        && match &event.content {
            RhythmicContentV1::Rest => true,
            RhythmicContentV1::Notes { notes } => notes
                .iter()
                .all(|note| component_written_pitch_is_valid(&note.written_pitch)),
        }
}

fn direct_event_is_valid(event: &RhythmicEventV1, notes_expected: bool) -> bool {
    direct_note_value_is_valid(&event.duration)
        && match &event.content {
            RhythmicContentV1::Rest => !notes_expected,
            RhythmicContentV1::Notes { notes } => {
                notes_expected
                    && notes
                        .iter()
                        .all(|note| direct_written_pitch_is_valid(&note.written_pitch))
            }
        }
}

fn voice_is_valid<Id>(voice: &VoiceV1<Id>) -> bool {
    voice.sequence.events.iter().all(component_event_is_valid)
}

fn part_is_valid<Id>(part: &PartV1<Id>) -> bool {
    part.staves
        .iter()
        .all(|staff| clef_is_valid(&staff.default_clef))
        && part
            .measure_contents
            .iter()
            .flat_map(|content| &content.voices)
            .all(voice_is_valid)
}

fn clef_is_valid(clef: &ClefV1) -> bool {
    (1..=5).contains(&clef.line.get())
}

fn exact_payload_unit_variants(payload: &CapturedValue) -> bool {
    // Tagged serde unit variants otherwise silently ignore extra fields. This
    // bounded shape check is shared by typed and admission command decoding.
    [
        ("anchor", "start"),
        ("pickup", "none"),
        ("assignment", "inherit-default"),
    ]
    .iter()
    .all(|(field, tag)| {
        let Some(object) = payload.get_ascii(field).and_then(CapturedValue::as_object) else {
            return true; // The typed field decoder handles missing/wrong shape.
        };
        object
            .get_ascii("kind")
            .and_then(CapturedValue::as_text)
            .is_none_or(|text| !text.eq_ascii(tag))
            || object.len() == 1
    })
}

fn meter_is_valid(meter: &MeterV1) -> bool {
    matches!(meter.denominator.get(), 1 | 2 | 4 | 8 | 16 | 32 | 64)
}

fn decode_core_command_value(
    value: &CapturedValue,
    reject_nested_batch: bool,
) -> Result<CoreCommandEnvelopeV1, KernelStage3CommandFailureV1> {
    decode_command_candidate_value(value, reject_nested_batch)
}

// One field/entrypoint codec for typed and raw-ID components. Targets, ranges
// and direct Event insertion are deliberately not parameterized by Id.
fn decode_command_candidate_value<Id: LosslessText>(
    value: &CapturedValue,
    reject_nested_batch: bool,
) -> Result<CoreCommandEnvelopeV1<Id>, KernelStage3CommandFailureV1> {
    if reject_nested_batch
        && value
            .as_object()
            .and_then(|record| record.get_ascii("commandId"))
            .and_then(CapturedValue::as_text)
            .is_some_and(|text| text.eq_ascii(CoreCommandIdV1::TransactionBatch.as_str()))
    {
        return Err(KernelStage3CommandFailureLeafV1::BatchNested.into());
    }
    let envelope = exact_json_object(value, &["commandVersion", "commandId", "target", "payload"])
        .ok_or_else(invalid_command_envelope)?;
    let version = envelope
        .at_ascii("commandVersion")
        .as_i64()
        .ok_or_else(invalid_command_envelope)?;
    if version != COMMAND_VERSION_V1 as i64 {
        return Err(KernelStage3CommandFailureLeafV1::UnsupportedVersion.into());
    }
    let command_id = envelope
        .at_ascii("commandId")
        .as_text()
        .ok_or_else(invalid_command_envelope)
        .and_then(|value| {
            crate::CORE_COMMAND_CATALOG_V1
                .iter()
                .find(|definition| value.eq_ascii(definition.command_id.as_str()))
                .map(|definition| definition.command_id)
                .ok_or_else(|| KernelStage3CommandFailureLeafV1::UnknownId.into())
        })?;
    let actual_target_kind =
        target_kind(envelope.at_ascii("target")).ok_or_else(invalid_command_envelope)?;
    if actual_target_kind != command_id.target_kind() {
        return Err(KernelStage3CommandFailureLeafV1::TargetMismatch.into());
    }
    let target: ScoreEntityTargetV1 = decode_payload(envelope.at_ascii("target"))?;
    if target.kind() != actual_target_kind {
        return Err(invalid_command_envelope());
    }
    let payload = &envelope.at_ascii("payload");
    if !exact_payload_unit_variants(payload) {
        return Err(invalid_command_envelope());
    }
    let command = match command_id {
        CoreCommandIdV1::DocumentSetMetadata => {
            let payload: SetMetadataPayloadV1 = decode_payload(payload)?;
            CoreCommandEnvelopeV1::DocumentSetMetadata {
                target,
                metadata: payload.metadata,
            }
        }
        CoreCommandIdV1::NoteSetWrittenPitch => {
            let payload: SetWrittenPitchPayloadV1 = decode_payload(payload)?;
            if !direct_written_pitch_is_valid(&payload.written_pitch) {
                return Err(invalid_command_envelope());
            }
            CoreCommandEnvelopeV1::NoteSetWrittenPitch {
                target,
                written_pitch: payload.written_pitch,
            }
        }
        CoreCommandIdV1::EventSetNoteValue => {
            let payload: SetNoteValuePayloadV1 = decode_payload(payload)?;
            if !direct_note_value_is_valid(&payload.note_value) {
                return Err(invalid_command_envelope());
            }
            CoreCommandEnvelopeV1::EventSetNoteValue {
                target,
                note_value: payload.note_value,
            }
        }
        CoreCommandIdV1::VoiceInsertNotesEvent => {
            let payload: InsertEventPayloadV1 = decode_payload(payload)?;
            if !direct_event_is_valid(&payload.event, true) {
                return Err(invalid_command_envelope());
            }
            CoreCommandEnvelopeV1::VoiceInsertNotesEvent {
                target,
                anchor: payload.anchor,
                event: payload.event,
            }
        }
        CoreCommandIdV1::VoiceInsertRestEvent => {
            let payload: InsertEventPayloadV1 = decode_payload(payload)?;
            if !direct_event_is_valid(&payload.event, false) {
                return Err(invalid_command_envelope());
            }
            CoreCommandEnvelopeV1::VoiceInsertRestEvent {
                target,
                anchor: payload.anchor,
                event: payload.event,
            }
        }
        CoreCommandIdV1::EventRemove => {
            let _: EmptyCommandPayloadV1 = decode_payload(payload)?;
            CoreCommandEnvelopeV1::EventRemove { target }
        }
        CoreCommandIdV1::MeasureInsert => {
            let payload: InsertMeasurePayloadV1<Id> = decode_payload(payload)?;
            if payload.contents.is_empty()
                || payload.contents.iter().any(|content| {
                    content.voices.is_empty() || !content.voices.iter().all(voice_is_valid)
                })
                || !meter_is_valid(&payload.definition.meter)
            {
                return Err(invalid_command_envelope());
            }
            CoreCommandEnvelopeV1::MeasureInsert {
                target,
                anchor: payload.anchor,
                definition: payload.definition,
                contents: payload.contents,
            }
        }
        CoreCommandIdV1::MeasureRemove => {
            let _: EmptyCommandPayloadV1 = decode_payload(payload)?;
            CoreCommandEnvelopeV1::MeasureRemove { target }
        }
        CoreCommandIdV1::MeasureMove => {
            let payload: MoveMeasurePayloadV1<Id> = decode_payload(payload)?;
            CoreCommandEnvelopeV1::MeasureMove {
                target,
                anchor: payload.anchor,
            }
        }
        CoreCommandIdV1::MeasureSetDefinition => {
            let payload: SetMeasureDefinitionPayloadV1 = decode_payload(payload)?;
            if !meter_is_valid(&payload.meter) {
                return Err(invalid_command_envelope());
            }
            CoreCommandEnvelopeV1::MeasureSetDefinition {
                target,
                meter: payload.meter,
                pickup: payload.pickup,
            }
        }
        CoreCommandIdV1::PartInsert => {
            let payload: InsertPartPayloadV1<Id> = decode_payload(payload)?;
            if !part_is_valid(&payload.part) {
                return Err(invalid_command_envelope());
            }
            CoreCommandEnvelopeV1::PartInsert {
                target,
                anchor: payload.anchor,
                part: payload.part,
            }
        }
        CoreCommandIdV1::PartRemove => {
            let _: EmptyCommandPayloadV1 = decode_payload(payload)?;
            CoreCommandEnvelopeV1::PartRemove { target }
        }
        CoreCommandIdV1::PartMove => {
            let payload: MovePartPayloadV1<Id> = decode_payload(payload)?;
            CoreCommandEnvelopeV1::PartMove {
                target,
                anchor: payload.anchor,
            }
        }
        CoreCommandIdV1::PartSetName => {
            let payload: SetPartNamePayloadV1 = decode_payload(payload)?;
            CoreCommandEnvelopeV1::PartSetName {
                target,
                name: payload.name,
            }
        }
        CoreCommandIdV1::PartSetInstrument => {
            let payload: SetPartInstrumentPayloadV1 = decode_payload(payload)?;
            CoreCommandEnvelopeV1::PartSetInstrument {
                target,
                instrument: payload.instrument,
            }
        }
        CoreCommandIdV1::StaffInsert => {
            let payload: InsertStaffPayloadV1<Id> = decode_payload(payload)?;
            if !clef_is_valid(&payload.staff.default_clef) {
                return Err(invalid_command_envelope());
            }
            CoreCommandEnvelopeV1::StaffInsert {
                target,
                anchor: payload.anchor,
                staff: payload.staff,
            }
        }
        CoreCommandIdV1::StaffRemove => {
            let _: EmptyCommandPayloadV1 = decode_payload(payload)?;
            CoreCommandEnvelopeV1::StaffRemove { target }
        }
        CoreCommandIdV1::StaffMove => {
            let payload: MoveStaffPayloadV1<Id> = decode_payload(payload)?;
            CoreCommandEnvelopeV1::StaffMove {
                target,
                anchor: payload.anchor,
            }
        }
        CoreCommandIdV1::StaffSetDefinition => {
            let payload: SetStaffDefinitionPayloadV1 = decode_payload(payload)?;
            if !clef_is_valid(&payload.default_clef) {
                return Err(invalid_command_envelope());
            }
            CoreCommandEnvelopeV1::StaffSetDefinition {
                target,
                line_count: payload.line_count,
                default_clef: payload.default_clef,
            }
        }
        CoreCommandIdV1::VoiceInsert => {
            let payload: InsertVoicePayloadV1<Id> = decode_payload(payload)?;
            if !voice_is_valid(&payload.voice) {
                return Err(invalid_command_envelope());
            }
            CoreCommandEnvelopeV1::VoiceInsert {
                target,
                measure_id: payload.measure_id,
                anchor: payload.anchor,
                voice: payload.voice,
            }
        }
        CoreCommandIdV1::VoiceRemove => {
            let _: EmptyCommandPayloadV1 = decode_payload(payload)?;
            CoreCommandEnvelopeV1::VoiceRemove { target }
        }
        CoreCommandIdV1::VoiceMove => {
            let payload: MoveVoicePayloadV1<Id> = decode_payload(payload)?;
            CoreCommandEnvelopeV1::VoiceMove {
                target,
                anchor: payload.anchor,
            }
        }
        CoreCommandIdV1::VoiceSetDefaultStaff => {
            let payload: SetVoiceDefaultStaffPayloadV1<Id> = decode_payload(payload)?;
            CoreCommandEnvelopeV1::VoiceSetDefaultStaff {
                target,
                staff_id: payload.staff_id,
            }
        }
        CoreCommandIdV1::VoiceSetSequenceStart => {
            let payload: SetVoiceSequenceStartPayloadV1 = decode_payload(payload)?;
            CoreCommandEnvelopeV1::VoiceSetSequenceStart {
                target,
                start: payload.start,
            }
        }
        CoreCommandIdV1::EventSetStaffAssignment => {
            let payload: SetEventStaffAssignmentPayloadV1<Id> = decode_payload(payload)?;
            CoreCommandEnvelopeV1::EventSetStaffAssignment {
                target,
                assignment: payload.assignment,
            }
        }
        CoreCommandIdV1::RangeDelete => {
            let payload: DeleteRangePayloadV1 = decode_payload(payload)?;
            CoreCommandEnvelopeV1::RangeDelete {
                target,
                range: payload.range,
            }
        }
        CoreCommandIdV1::RangeTransposeWrittenPitch => {
            let payload: TransposeRangePayloadV1 = decode_payload(payload)?;
            CoreCommandEnvelopeV1::RangeTransposeWrittenPitch {
                target,
                range: payload.range,
                transposition: payload.transposition,
            }
        }
        CoreCommandIdV1::TransactionBatch => {
            let payload =
                exact_json_object(payload, &["commands"]).ok_or_else(invalid_command_envelope)?;
            let commands = payload
                .at_ascii("commands")
                .as_array()
                .ok_or_else(invalid_command_envelope)?;
            if commands.len() > MAX_BATCH_CHILDREN_V1 {
                return Err(KernelStage3CommandFailureLeafV1::ResourceLimitExceeded {
                    limit_kind: KernelStage3ResourceLimitKindV1::BatchChildren,
                    limit: MAX_BATCH_CHILDREN_V1 as u64,
                    actual: commands.len() as u64,
                }
                .into());
            }
            if commands.is_empty() {
                return Err(KernelStage3CommandFailureLeafV1::BatchEmpty.into());
            }
            CoreCommandEnvelopeV1::TransactionBatch {
                target,
                commands: commands
                    .iter()
                    .cloned()
                    .map(CapturedCoreCommandV1::from_json)
                    .collect(),
            }
        }
    };
    if reject_nested_batch && matches!(command, CoreCommandEnvelopeV1::TransactionBatch { .. }) {
        return Err(KernelStage3CommandFailureLeafV1::BatchNested.into());
    }
    Ok(command)
}

fn stage3_root_shape_failure(
    path: StablePathV1,
    violation: ShapeViolationV1,
) -> KernelStage3SubmitDecodeFailureV1 {
    KernelStage3SubmitDecodeFailureV1::Boundary(StableFailureV1::CodecInvalidShape {
        path,
        violation,
    })
}

pub fn decode_stage3_submit_request(
    bytes: &[u8],
) -> Result<KernelStage3SubmitRequestV1, KernelStage3SubmitDecodeFailureV1> {
    decode_submit_candidate_request(bytes)
}

/// Private candidate boundary. Decoding preserves ordered raw-ID components;
/// it does not publish a Session or authorize adoption into normalized storage.
pub fn decode_admission_submit_request(
    bytes: &[u8],
) -> Result<crate::KernelAdmissionSubmitRequestV1, KernelStage3SubmitDecodeFailureV1> {
    decode_submit_candidate_request(bytes)
}

fn decode_submit_candidate_request<Id: LosslessText>(
    bytes: &[u8],
) -> Result<KernelStage3SubmitRequestV1<Id>, KernelStage3SubmitDecodeFailureV1> {
    if bytes.len() > REQUEST_BYTE_LIMIT {
        return Err(KernelStage3SubmitDecodeFailureV1::Boundary(
            StableFailureV1::BridgeRequestTooLarge {
                limit_bytes: REQUEST_BYTE_LIMIT as u64,
                actual_bytes: bytes.len() as u64,
            },
        ));
    }
    let (strict_value, state) =
        strict_json(bytes).map_err(KernelStage3SubmitDecodeFailureV1::Boundary)?;
    if let Some(fault) = state.depth_fault {
        return Err(command_decode_failure(
            KernelStage3CommandFailureLeafV1::ResourceLimitExceeded {
                limit_kind: KernelStage3ResourceLimitKindV1::InputDepth,
                limit: JSON_DEPTH_LIMIT as u64,
                actual: fault.actual,
            },
        ));
    }
    if let Some(actual) = state.property_fault {
        return Err(command_decode_failure(
            KernelStage3CommandFailureLeafV1::ResourceLimitExceeded {
                limit_kind: KernelStage3ResourceLimitKindV1::InputProperties,
                limit: JSON_PROPERTY_LIMIT as u64,
                actual,
            },
        ));
    }
    if state.shape_fault.is_some() || state.number_fault.is_some() {
        return Err(command_decode_failure(
            KernelStage3CommandFailureLeafV1::InvalidEnvelope,
        ));
    }
    let value = strict_value.ok_or(KernelStage3SubmitDecodeFailureV1::Boundary(
        StableFailureV1::BridgeInternal,
    ))?;
    let root = value.as_object().ok_or_else(|| {
        stage3_root_shape_failure(StablePathV1::root(), ShapeViolationV1::WrongType)
    })?;
    for required in ["apiVersion", "command"] {
        if !root.contains_ascii(required) {
            return Err(stage3_root_shape_failure(
                StablePathV1::field(required),
                ShapeViolationV1::MissingField,
            ));
        }
    }
    if root.len() != 2 {
        return Err(stage3_root_shape_failure(
            StablePathV1::root(),
            ShapeViolationV1::ExtraField,
        ));
    }
    let api_version = state.root_api_integer.ok_or_else(|| {
        stage3_root_shape_failure(
            StablePathV1::field("apiVersion"),
            ShapeViolationV1::WrongType,
        )
    })?;
    if api_version != API_VERSION_V1 {
        return Err(KernelStage3SubmitDecodeFailureV1::Boundary(
            StableFailureV1::ContractUnsupportedApiVersion {
                supported_version: API_VERSION_V1,
            },
        ));
    }
    let command = decode_command_candidate_value(root.at_ascii("command"), false)
        .map_err(KernelStage3SubmitDecodeFailureV1::Command)?;
    Ok(KernelStage3SubmitRequestV1 {
        api_version: API_VERSION_V1,
        command,
    })
}

pub fn decode_captured_core_command(
    captured: &CapturedCoreCommandV1,
) -> Result<CoreCommandEnvelopeV1, KernelStage3CommandFailureV1> {
    decode_core_command_value(captured.as_json(), true)
}

pub fn decode_captured_admission_command(
    captured: &CapturedCoreCommandV1,
) -> Result<crate::CoreAdmissionCommandV1, KernelStage3CommandFailureV1> {
    decode_command_candidate_value(captured.as_json(), true)
}

pub fn decode_captured_admission_replay_command(
    captured: &CapturedCoreCommandV1,
) -> Result<crate::CoreAdmissionCommandV1, KernelStage3CommandFailureV1> {
    decode_command_candidate_value(captured.as_json(), false)
}

/// Decode a captured data-only top-level command on a private embedding seam.
/// Batch children still pass through the nested-command admission decoder.
pub fn decode_admission_command_value(
    value: &LosslessJsonValue,
) -> Result<crate::CoreAdmissionCommandV1, KernelStage3CommandFailureV1> {
    decode_command_candidate_value(value, false)
}

/// Replay entries occupy the same top-level position as live submissions.
/// Their batch children still use `decode_captured_core_command` to reject nesting.
pub fn decode_captured_replay_command(
    captured: &CapturedCoreCommandV1,
) -> Result<CoreCommandEnvelopeV1, KernelStage3CommandFailureV1> {
    decode_core_command_value(captured.as_json(), false)
}

fn stage4_shape_failure(
    path: StablePathV1,
    violation: ShapeViolationV1,
) -> KernelStage4OperationDecodeFailureV1 {
    KernelStage4OperationDecodeFailureV1::Boundary(StableFailureV1::CodecInvalidShape {
        path,
        violation,
    })
}

fn validate_stage4_operation_shape(value: &StrictValue, state: &mut StrictState) {
    let root = CanonicalPath::default();
    let Some(entries) = exact_object(value, &root, &["apiVersion", "operation"], &[], state) else {
        return;
    };
    for value in field_values(entries, "apiVersion") {
        expect_number(value, &root.field("apiVersion"), state);
    }
    for value in field_values(entries, "operation") {
        let operation_path = root.field("operation");
        let StrictValue::Object(operation) = value else {
            record_wrong_type(state, &operation_path);
            continue;
        };
        let Some(kind) = operation.get_ascii("kind") else {
            state.record_shape(
                0,
                operation_path.field("kind"),
                ShapeViolationV1::MissingField,
            );
            continue;
        };
        expect_tag(
            kind,
            &operation_path.field("kind"),
            &["submit", "undo", "redo", "mark-persisted", "read", "select"],
            state,
        );
        let StrictValue::String(kind) = kind else {
            continue;
        };
        let (required, optional): (&[&'static str], &[&'static str]) = match known_tag(kind) {
            "submit" => (&["kind", "command"], &[]),
            "undo" | "redo" => (&["kind"], &[]),
            "mark-persisted" => (&["kind", "checkpoint"], &[]),
            "read" => (&["kind", "knownSnapshotVersion"], &[]),
            "select" => (&["kind", "selector"], &[]),
            _ => continue,
        };
        let Some(exact) = exact_object(value, &operation_path, required, optional, state) else {
            continue;
        };
        if kind.eq_ascii("read") {
            for known in field_values(exact, "knownSnapshotVersion") {
                if !matches!(known, StrictValue::Null | StrictValue::Number(_)) {
                    record_wrong_type(state, &operation_path.field("knownSnapshotVersion"));
                }
            }
        }
    }
}

pub fn decode_stage4_operation_request(
    bytes: &[u8],
) -> Result<KernelStage4OperationRequestV1, KernelStage4OperationDecodeFailureV1> {
    decode_stage4_candidate_operation_request(bytes)
}

pub fn decode_admission_stage4_operation_request(
    bytes: &[u8],
) -> Result<KernelStage4OperationRequestV1<JsString>, KernelStage4OperationDecodeFailureV1> {
    decode_stage4_candidate_operation_request(bytes)
}

fn decode_stage4_candidate_operation_request<Id: LosslessText>(
    bytes: &[u8],
) -> Result<KernelStage4OperationRequestV1<Id>, KernelStage4OperationDecodeFailureV1> {
    if bytes.len() > REQUEST_BYTE_LIMIT {
        return Err(KernelStage4OperationDecodeFailureV1::Boundary(
            StableFailureV1::BridgeRequestTooLarge {
                limit_bytes: REQUEST_BYTE_LIMIT as u64,
                actual_bytes: bytes.len() as u64,
            },
        ));
    }
    let (strict_value, mut state) =
        strict_json(bytes).map_err(KernelStage4OperationDecodeFailureV1::Boundary)?;
    if state.can_retain()
        && let Some(value) = &strict_value
    {
        validate_stage4_operation_shape(value, &mut state);
    }
    if let Some(failure) = state.failure() {
        return Err(KernelStage4OperationDecodeFailureV1::Boundary(failure));
    }
    let value = strict_value.ok_or(KernelStage4OperationDecodeFailureV1::Boundary(
        StableFailureV1::BridgeInternal,
    ))?;
    let root = exact_json_object(&value, &["apiVersion", "operation"])
        .ok_or_else(|| stage4_shape_failure(StablePathV1::root(), ShapeViolationV1::WrongType))?;
    let api_version = root.at_ascii("apiVersion").as_u64().ok_or_else(|| {
        stage4_shape_failure(
            StablePathV1::field("apiVersion"),
            ShapeViolationV1::WrongType,
        )
    })?;
    if api_version != API_VERSION_V1 {
        return Err(KernelStage4OperationDecodeFailureV1::Boundary(
            StableFailureV1::ContractUnsupportedApiVersion {
                supported_version: API_VERSION_V1,
            },
        ));
    }
    let operation = root.at_ascii("operation").as_object().ok_or_else(|| {
        stage4_shape_failure(
            StablePathV1::field("operation"),
            ShapeViolationV1::WrongType,
        )
    })?;
    let kind = operation
        .get_ascii("kind")
        .and_then(CapturedValue::as_text)
        .ok_or_else(|| {
            stage4_shape_failure(
                CanonicalPath::default()
                    .field("operation")
                    .field("kind")
                    .stable(),
                ShapeViolationV1::WrongType,
            )
        })?;
    let operation = match known_tag(kind) {
        "submit" => {
            let command = decode_command_candidate_value(operation.at_ascii("command"), false)
                .map_err(KernelStage4OperationDecodeFailureV1::Command)?;
            KernelStage4OperationV1::Submit { command }
        }
        "undo" => KernelStage4OperationV1::Undo,
        "redo" => KernelStage4OperationV1::Redo,
        "mark-persisted" => {
            match PersistedCheckpointV1::from_lossless_value(
                operation.at_ascii("checkpoint").clone(),
            ) {
                Ok(checkpoint) => KernelStage4OperationV1::MarkPersisted { checkpoint },
                Err(_) => KernelStage4OperationV1::MarkPersistedInvalid,
            }
        }
        "read" => {
            let known_snapshot_version = if operation.at_ascii("knownSnapshotVersion").is_null() {
                None
            } else {
                Some(
                    brilliant_core_types::DocumentVersionV1::from_lossless_value(
                        operation.at_ascii("knownSnapshotVersion").clone(),
                    )
                    .map_err(|_| {
                        stage4_shape_failure(
                            CanonicalPath::default()
                                .field("operation")
                                .field("knownSnapshotVersion")
                                .stable(),
                            ShapeViolationV1::WrongType,
                        )
                    })?,
                )
            };
            KernelStage4OperationV1::Read {
                known_snapshot_version,
            }
        }
        "select" => {
            let selector =
                SelectorRequestV1::from_lossless_value(operation.at_ascii("selector").clone())
                    .map_err(|_| {
                        stage4_shape_failure(
                            CanonicalPath::default()
                                .field("operation")
                                .field("selector")
                                .stable(),
                            ShapeViolationV1::WrongType,
                        )
                    })?;
            KernelStage4OperationV1::Select { selector }
        }
        _ => {
            return Err(stage4_shape_failure(
                CanonicalPath::default()
                    .field("operation")
                    .field("kind")
                    .stable(),
                ShapeViolationV1::InvalidTag,
            ));
        }
    };
    Ok(KernelStage4OperationRequestV1 {
        api_version: API_VERSION_V1,
        operation,
    })
}

fn validate_stage4_replay_shape(value: &StrictValue, state: &mut StrictState) {
    let root = CanonicalPath::default();
    let Some(entries) = exact_object(
        value,
        &root,
        &["apiVersion", "initialDocument", "commands"],
        &[],
        state,
    ) else {
        return;
    };
    for value in field_values(entries, "apiVersion") {
        expect_number(value, &root.field("apiVersion"), state);
    }
    for value in field_values(entries, "initialDocument") {
        validate_document(value, &root.field("initialDocument"), state);
    }
    for value in field_values(entries, "commands") {
        let _ = exact_array(value, &root.field("commands"), state);
    }
}

pub fn decode_stage4_replay_request(
    bytes: &[u8],
) -> Result<KernelStage4ReplayRequestV1, StableFailureV1> {
    if bytes.len() > REQUEST_BYTE_LIMIT {
        return Err(StableFailureV1::BridgeRequestTooLarge {
            limit_bytes: REQUEST_BYTE_LIMIT as u64,
            actual_bytes: bytes.len() as u64,
        });
    }
    let (strict_value, mut state) = strict_json(bytes)?;
    if state.can_retain()
        && let Some(value) = &strict_value
    {
        validate_stage4_replay_shape(value, &mut state);
    }
    if let Some(failure) = state.failure() {
        return Err(failure);
    }
    let value = strict_value.ok_or(StableFailureV1::BridgeInternal)?;
    let mut root = exact_owned_object(value, &["apiVersion", "initialDocument", "commands"])
        .ok_or_else(|| StableFailureV1::CodecInvalidShape {
            path: StablePathV1::root(),
            violation: ShapeViolationV1::WrongType,
        })?;
    let api_version =
        root.at_ascii("apiVersion")
            .as_u64()
            .ok_or_else(|| StableFailureV1::CodecInvalidShape {
                path: StablePathV1::field("apiVersion"),
                violation: ShapeViolationV1::WrongType,
            })?;
    if api_version != API_VERSION_V1 {
        return Err(StableFailureV1::ContractUnsupportedApiVersion {
            supported_version: API_VERSION_V1,
        });
    }
    let document_value = root
        .remove(&JsString::from("initialDocument"))
        .expect("validated initial document");
    let schema = document_value
        .as_object()
        .and_then(|document| document.get_ascii("schemaVersion"))
        .and_then(CapturedValue::as_text)
        .ok_or_else(|| StableFailureV1::CodecInvalidShape {
            path: CanonicalPath::default()
                .field("initialDocument")
                .field("schemaVersion")
                .stable(),
            violation: ShapeViolationV1::WrongType,
        })?;
    if !schema.eq_ascii(ScoreSchemaVersionV1::VALUE) {
        return Err(StableFailureV1::ScoreUnsupportedSchema {
            supported_schema: ScoreSchemaVersionV1::VALUE,
        });
    }
    let initial_document =
        decode_lossless_score_document_value(document_value).map_err(map_foundation_failure)?;
    let commands = root
        .remove(&JsString::from("commands"))
        .and_then(CapturedValue::into_array)
        .ok_or_else(|| StableFailureV1::CodecInvalidShape {
            path: StablePathV1::field("commands"),
            violation: ShapeViolationV1::WrongType,
        })?
        .into_iter()
        .map(CapturedCoreCommandV1::from_json)
        .collect();
    Ok(KernelStage4ReplayRequestV1 {
        api_version: API_VERSION_V1,
        initial_document,
        commands,
    })
}

fn map_foundation_failure(failure: FoundationDecodeFailure) -> StableFailureV1 {
    match failure {
        FoundationDecodeFailure::InvalidShape { path } => StableFailureV1::CodecInvalidShape {
            path,
            violation: ShapeViolationV1::WrongType,
        },
        FoundationDecodeFailure::UnsupportedSchema => StableFailureV1::ScoreUnsupportedSchema {
            supported_schema: ScoreSchemaVersionV1::VALUE,
        },
        FoundationDecodeFailure::DuplicateId { path } => StableFailureV1::ScoreInvalidStructure {
            path,
            violation: ScoreStructureViolationV1::DuplicateId,
        },
        FoundationDecodeFailure::InvalidReference { path } => {
            StableFailureV1::ScoreInvalidStructure {
                path,
                violation: ScoreStructureViolationV1::InvalidReference,
            }
        }
        FoundationDecodeFailure::InvalidValue { path } => StableFailureV1::ScoreInvalidStructure {
            path,
            violation: ScoreStructureViolationV1::InvalidValue,
        },
        FoundationDecodeFailure::InternalCapacity => StableFailureV1::BridgeInternal,
    }
}

pub fn encode_create_result(
    result: &KernelSessionCreateResultV1,
) -> Result<Vec<u8>, StableFailureV1> {
    encode_capped(result)
}

pub fn encode_read_result(result: &KernelSessionReadResultV1) -> Result<Vec<u8>, StableFailureV1> {
    encode_capped(result)
}

pub fn encode_stage3_submit_result(
    result: &KernelStage3SubmitResultV1,
) -> Result<Vec<u8>, StableFailureV1> {
    encode_capped(result)
}

pub fn encode_stage4_operation_result(
    result: &KernelStage4OperationResultV1,
) -> Result<Vec<u8>, StableFailureV1> {
    encode_capped(result)
}

pub fn encode_stage4_replay_result(
    result: &KernelStage4ReplayResultV1,
) -> Result<Vec<u8>, StableFailureV1> {
    encode_capped(result)
}

pub(crate) fn encode_capped<T: brilliant_score_foundation::LosslessEncode>(
    value: &T,
) -> Result<Vec<u8>, StableFailureV1> {
    encode_capped_with_limit(value, RESPONSE_BYTE_LIMIT)
}

struct CappedWriter {
    retained: Vec<u8>,
    actual_bytes: u64,
    limit: usize,
}

impl CappedWriter {
    fn new(limit: usize) -> Self {
        Self {
            retained: Vec::new(),
            actual_bytes: 0,
            limit,
        }
    }
}

impl Write for CappedWriter {
    fn write(&mut self, bytes: &[u8]) -> std::io::Result<usize> {
        self.actual_bytes = self.actual_bytes.saturating_add(bytes.len() as u64);
        let remaining = self.limit.saturating_sub(self.retained.len());
        let retained = remaining.min(bytes.len());
        self.retained.extend_from_slice(&bytes[..retained]);
        Ok(bytes.len())
    }

    fn flush(&mut self) -> std::io::Result<()> {
        Ok(())
    }
}

fn encode_capped_with_limit<T: brilliant_score_foundation::LosslessEncode>(
    value: &T,
    limit: usize,
) -> Result<Vec<u8>, StableFailureV1> {
    let mut writer = CappedWriter::new(limit);
    let encoded = value.write_lossless(&mut writer);
    if writer.actual_bytes > limit as u64 {
        return Err(StableFailureV1::BridgeResponseTooLarge {
            limit_bytes: limit as u64,
            actual_bytes: writer.actual_bytes,
        });
    }
    encoded.map_err(|_| StableFailureV1::BridgeInternal)?;
    Ok(writer.retained)
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeSet;

    use brilliant_core_types::{DocumentVersionV1, StableId};

    use super::*;
    use crate::{
        CORE_COMMAND_CATALOG_V1, CORE_COMMAND_COUNT_V1, KernelEventCauseV1, KernelEventV1,
        KernelSessionCreateSuccessValueV1, KernelStage4MarkPersistedResultV1,
        KernelStage4MarkPersistedValueV1,
    };

    #[test]
    fn response_cap_counts_escaped_units_and_the_complete_unretained_tail() {
        let text = brilliant_core_types::JsString::from_utf16(vec![0xd800, 0xdc00, 0xdc00, 0]);
        // Quotes + a four-byte scalar + two six-byte escapes = 18 wire bytes.
        let bytes = encode_capped_with_limit(&text, 18).expect("inclusive wire cap");
        assert_eq!(bytes.len(), 18);
        assert_eq!(
            brilliant_score_foundation::decode_js_string_token(
                std::str::from_utf8(&bytes).unwrap()
            )
            .unwrap(),
            text
        );
        for limit in [0, 1, 4, 8, 17] {
            assert_eq!(
                encode_capped_with_limit(&text, limit),
                Err(StableFailureV1::BridgeResponseTooLarge {
                    limit_bytes: limit as u64,
                    actual_bytes: 18
                })
            );
        }
    }

    const SMOKE_REQUEST: &str = r#"{"apiVersion":1,"document":{"schemaVersion":"brilliant-score-1","id":"score-rkp1","metadata":{"title":"Smoke","authors":["Brilliant"],"tempo":{"bpm":120}},"measureDefinitions":[{"id":"measure-1","meter":{"numerator":4,"denominator":4}}],"parts":[{"id":"part-1","name":"Part","instrument":{"name":"Piano","writtenToSounding":{"diatonicSteps":0,"chromaticSemitones":0}},"staves":[{"id":"staff-1","lineCount":5,"defaultClef":{"sign":"G","line":2}}],"measureContents":[{"measureId":"measure-1","voices":[{"id":"voice-1","defaultStaffId":"staff-1","sequence":{"start":{"numerator":0,"denominator":1},"events":[{"id":"event-1","duration":{"base":1,"dots":0},"content":{"kind":"rest"}}]}}]}]}],"extensions":[]}}"#;

    #[test]
    fn stage_three_decoder_accepts_a_strict_version_one_command() {
        let request = br#"{"apiVersion":1,"command":{"commandVersion":1,"commandId":"core.document.set-metadata","target":{"kind":"document","documentId":"score-1"},"payload":{"metadata":{"title":"Updated","authors":["Brilliant"],"tempo":{"bpm":120}}}}}"#;
        let decoded = decode_stage3_submit_request(request).expect("valid stage three request");
        assert_eq!(decoded.api_version, 1);
        assert_eq!(
            decoded.command.command_id().as_str(),
            "core.document.set-metadata"
        );
    }

    #[test]
    fn stage_four_operation_and_replay_roots_are_exact_and_versioned() {
        let undo =
            decode_stage4_operation_request(br#"{"apiVersion":1,"operation":{"kind":"undo"}}"#)
                .expect("valid undo request");
        assert!(matches!(undo.operation, KernelStage4OperationV1::Undo));

        let overview = decode_stage4_operation_request(
            br#"{"apiVersion":1,"operation":{"kind":"select","selector":{"selectorId":"core.selector.score-overview"}}}"#,
        )
        .expect("valid overview selector");
        assert!(matches!(
            overview.operation,
            KernelStage4OperationV1::Select {
                selector: SelectorRequestV1::ScoreOverview
            }
        ));

        let overview_extra = decode_stage4_operation_request(
            br#"{"apiVersion":1,"operation":{"kind":"select","selector":{"selectorId":"core.selector.score-overview","extra":true}}}"#,
        );
        assert!(matches!(
            overview_extra,
            Err(KernelStage4OperationDecodeFailureV1::Boundary(
                StableFailureV1::CodecInvalidShape {
                    violation: ShapeViolationV1::WrongType,
                    ..
                }
            ))
        ));

        let overview_unknown = decode_stage4_operation_request(
            br#"{"apiVersion":1,"operation":{"kind":"select","selector":{"selectorId":"core.selector.unknown"}}}"#,
        );
        assert!(matches!(
            overview_unknown,
            Err(KernelStage4OperationDecodeFailureV1::Boundary(
                StableFailureV1::CodecInvalidShape {
                    violation: ShapeViolationV1::WrongType,
                    ..
                }
            ))
        ));

        let extra = decode_stage4_operation_request(
            br#"{"apiVersion":1,"operation":{"kind":"undo","extra":true}}"#,
        );
        assert!(matches!(
            extra,
            Err(KernelStage4OperationDecodeFailureV1::Boundary(
                StableFailureV1::CodecInvalidShape {
                    violation: ShapeViolationV1::ExtraField,
                    ..
                }
            ))
        ));

        let invalid_checkpoint = decode_stage4_operation_request(
            br#"{"apiVersion":1,"operation":{"kind":"mark-persisted","checkpoint":{"documentId":"score-rkp1"}}}"#,
        )
        .expect("malformed checkpoint remains an accepted operation");
        assert!(matches!(
            invalid_checkpoint.operation,
            KernelStage4OperationV1::MarkPersistedInvalid
        ));

        let create: Value = serde_json::from_str(SMOKE_REQUEST).expect("create fixture");
        let replay = serde_json::to_vec(&serde_json::json!({
            "apiVersion": 1,
            "initialDocument": create["document"].clone(),
            "commands": []
        }))
        .expect("replay bytes");
        let replay = decode_stage4_replay_request(&replay).expect("replay request");
        assert_eq!(replay.api_version, 1);
        assert_eq!(
            replay.initial_document.id.as_js_string(),
            &JsString::from("score-rkp1")
        );
        assert!(replay.commands.is_empty());
    }

    #[test]
    fn stage_four_event_and_checkpoint_result_wire_shapes_are_closed() {
        let event = KernelEventV1::DocumentCommitted {
            event_sequence: 1,
            document_id: StableId::new("score-rkp1").expect("id"),
            document_version: DocumentVersionV1::initial()
                .checked_next()
                .expect("version"),
            cause: KernelEventCauseV1::Submit,
            command_id: CoreCommandIdV1::DocumentSetMetadata.into(),
            affected_entities: vec![ScoreEntityTargetV1::Document {
                document_id: StableId::new("score-rkp1").expect("id").into(),
            }],
        };
        assert_eq!(
            serde_json::to_vec(&event).expect("event bytes"),
            br#"{"eventVersion":1,"eventSequence":1,"eventType":"core.document.committed","documentId":"score-rkp1","documentVersion":1,"cause":"submit","commandId":"core.document.set-metadata","affectedEntities":[{"kind":"document","documentId":"score-rkp1"}]}"#
        );

        let result =
            KernelStage4OperationResultV1::MarkPersisted(KernelStage4MarkPersistedResultV1::NoOp {
                value: KernelStage4MarkPersistedValueV1 {
                    document_version: DocumentVersionV1::initial(),
                    dirty: false,
                },
            });
        assert_eq!(
            encode_stage4_operation_result(&result).expect("checkpoint bytes"),
            br#"{"apiVersion":1,"status":"no-op","value":{"documentVersion":0,"dirty":false},"events":[]}"#
        );
    }

    fn command_value(command_id: &str, target: Value, payload: Value) -> Value {
        serde_json::json!({
            "commandVersion": 1,
            "commandId": command_id,
            "target": target,
            "payload": payload
        })
    }

    fn decode_stage_three_value(
        command: Value,
    ) -> Result<CoreCommandEnvelopeV1, KernelStage3SubmitDecodeFailureV1> {
        let request = serde_json::to_vec(&serde_json::json!({
            "apiVersion": 1,
            "command": command
        }))
        .expect("stage three request bytes");
        decode_stage3_submit_request(&request).map(|request| request.command)
    }

    #[test]
    fn stage_three_decoder_covers_all_twenty_eight_command_payloads() {
        let document = serde_json::json!({"kind": "document", "documentId": "score-1"});
        let measure = serde_json::json!({"kind": "measure", "measureId": "measure-1"});
        let part = serde_json::json!({"kind": "part", "partId": "part-1"});
        let staff = serde_json::json!({"kind": "staff", "staffId": "staff-1"});
        let voice_target = serde_json::json!({"kind": "voice", "voiceId": "voice-1"});
        let event_target = serde_json::json!({"kind": "event", "eventId": "event-1"});
        let note = serde_json::json!({"kind": "note", "noteId": "note-1"});
        let fraction = serde_json::json!({"numerator": 0, "denominator": 1});
        let note_value = serde_json::json!({"base": 4, "dots": 0});
        let rest_event = serde_json::json!({
            "id": "event-new",
            "duration": note_value,
            "content": {"kind": "rest"}
        });
        let notes_event = serde_json::json!({
            "id": "event-new",
            "duration": {"base": 4, "dots": 0},
            "content": {
                "kind": "notes",
                "notes": [{
                    "id": "note-new",
                    "writtenPitch": {"step": "C", "alter": 0, "octave": 4}
                }]
            }
        });
        let voice = serde_json::json!({
            "id": "voice-new",
            "defaultStaffId": "staff-1",
            "sequence": {"start": fraction, "events": []}
        });
        let staff_definition = serde_json::json!({
            "id": "staff-new",
            "lineCount": 5,
            "defaultClef": {"sign": "G", "line": 2}
        });
        let instrument = serde_json::json!({
            "name": "Piano",
            "writtenToSounding": {"diatonicSteps": 0, "chromaticSemitones": 0}
        });
        let part_value = serde_json::json!({
            "id": "part-new",
            "name": "Part",
            "instrument": instrument,
            "staves": [staff_definition],
            "measureContents": [{"measureId": "measure-1", "voices": [voice]}]
        });
        let range = serde_json::json!({
            "kind": "measure-range",
            "start": {"kind": "measure", "measureId": "measure-1"},
            "end": {"kind": "measure", "measureId": "measure-2"}
        });
        let metadata_command = command_value(
            "core.document.set-metadata",
            document.clone(),
            serde_json::json!({
                "metadata": {"title": "Updated", "authors": [], "tempo": {"bpm": 120}}
            }),
        );
        let cases = vec![
            metadata_command.clone(),
            command_value(
                "core.note.set-written-pitch",
                note,
                serde_json::json!({"writtenPitch": {"step": "D", "alter": 1, "octave": 5}}),
            ),
            command_value(
                "core.event.set-note-value",
                event_target.clone(),
                serde_json::json!({"noteValue": {"base": 8, "dots": 1}}),
            ),
            command_value(
                "core.voice.insert-notes-event",
                voice_target.clone(),
                serde_json::json!({"anchor": {"kind": "start"}, "event": notes_event}),
            ),
            command_value(
                "core.voice.insert-rest-event",
                voice_target.clone(),
                serde_json::json!({"anchor": {"kind": "after-event", "eventId": "event-1"}, "event": rest_event}),
            ),
            command_value(
                "core.event.remove",
                event_target.clone(),
                serde_json::json!({}),
            ),
            command_value(
                "core.measure.insert",
                document.clone(),
                serde_json::json!({
                    "anchor": {"kind": "start"},
                    "definition": {"id": "measure-new", "meter": {"numerator": 4, "denominator": 4}},
                    "contents": [{"partId": "part-1", "voices": [{
                        "id": "voice-new",
                        "defaultStaffId": "staff-1",
                        "sequence": {"start": {"numerator": 0, "denominator": 1}, "events": []}
                    }]}]
                }),
            ),
            command_value(
                "core.measure.remove",
                measure.clone(),
                serde_json::json!({}),
            ),
            command_value(
                "core.measure.move",
                measure.clone(),
                serde_json::json!({"anchor": {"kind": "after-measure", "measureId": "measure-2"}}),
            ),
            command_value(
                "core.measure.set-definition",
                measure,
                serde_json::json!({"meter": {"numerator": 3, "denominator": 4}, "pickup": {"kind": "none"}}),
            ),
            command_value(
                "core.part.insert",
                document.clone(),
                serde_json::json!({"anchor": {"kind": "start"}, "part": part_value}),
            ),
            command_value("core.part.remove", part.clone(), serde_json::json!({})),
            command_value(
                "core.part.move",
                part.clone(),
                serde_json::json!({"anchor": {"kind": "after-part", "partId": "part-2"}}),
            ),
            command_value(
                "core.part.set-name",
                part.clone(),
                serde_json::json!({"name": "Renamed"}),
            ),
            command_value(
                "core.part.set-instrument",
                part.clone(),
                serde_json::json!({"instrument": instrument}),
            ),
            command_value(
                "core.staff.insert",
                part.clone(),
                serde_json::json!({"anchor": {"kind": "start"}, "staff": staff_definition}),
            ),
            command_value("core.staff.remove", staff.clone(), serde_json::json!({})),
            command_value(
                "core.staff.move",
                staff.clone(),
                serde_json::json!({"anchor": {"kind": "after-staff", "staffId": "staff-2"}}),
            ),
            command_value(
                "core.staff.set-definition",
                staff,
                serde_json::json!({"lineCount": 6, "defaultClef": {"sign": "F", "line": 4}}),
            ),
            command_value(
                "core.voice.insert",
                part,
                serde_json::json!({"measureId": "measure-1", "anchor": {"kind": "start"}, "voice": voice}),
            ),
            command_value(
                "core.voice.remove",
                voice_target.clone(),
                serde_json::json!({}),
            ),
            command_value(
                "core.voice.move",
                voice_target.clone(),
                serde_json::json!({"anchor": {"kind": "after-voice", "voiceId": "voice-2"}}),
            ),
            command_value(
                "core.voice.set-default-staff",
                voice_target.clone(),
                serde_json::json!({"staffId": "staff-2"}),
            ),
            command_value(
                "core.voice.set-sequence-start",
                voice_target,
                serde_json::json!({"start": {"numerator": 1, "denominator": 8}}),
            ),
            command_value(
                "core.event.set-staff-assignment",
                event_target,
                serde_json::json!({"assignment": {"kind": "inherit-default"}}),
            ),
            command_value(
                "core.range.delete",
                document.clone(),
                serde_json::json!({"range": range}),
            ),
            command_value(
                "core.range.transpose-written-pitch",
                document.clone(),
                serde_json::json!({
                    "range": {
                        "kind": "voice-event-range",
                        "start": {"kind": "voice-event", "voiceId": "voice-1", "eventId": "event-1"},
                        "end": {"kind": "voice-event", "voiceId": "voice-1", "eventId": "event-2"}
                    },
                    "transposition": {"diatonicSteps": 1, "chromaticSemitones": 2}
                }),
            ),
            command_value(
                "core.transaction.batch",
                document,
                serde_json::json!({"commands": [metadata_command]}),
            ),
        ];
        assert_eq!(cases.len(), CORE_COMMAND_COUNT_V1);
        for (index, command) in cases.into_iter().enumerate() {
            let decoded = decode_stage_three_value(command)
                .unwrap_or_else(|failure| panic!("catalog command {index} failed: {failure:?}"));
            assert_eq!(
                decoded.command_id(),
                CORE_COMMAND_CATALOG_V1[index].command_id
            );
            assert_eq!(
                decoded.target().kind(),
                CORE_COMMAND_CATALOG_V1[index].target_kind
            );
        }
    }

    #[test]
    fn stage_three_route_precedence_and_batch_limits_are_stable() {
        let malformed = serde_json::json!({
            "commandVersion": 1,
            "commandId": "core.document.set-metadata",
            "target": {"kind": "document", "documentId": "score-1"}
        });
        assert_eq!(
            decode_stage_three_value(malformed),
            Err(command_decode_failure(
                KernelStage3CommandFailureLeafV1::InvalidEnvelope
            ))
        );

        let future = command_value(
            "core.unknown",
            serde_json::json!({"kind": "note", "noteId": "note-1"}),
            serde_json::json!({"extra": true}),
        );
        let mut future = future.as_object().expect("command object").clone();
        future.insert("commandVersion".to_owned(), serde_json::json!(2));
        assert_eq!(
            decode_stage_three_value(Value::Object(future)),
            Err(command_decode_failure(
                KernelStage3CommandFailureLeafV1::UnsupportedVersion
            ))
        );

        assert_eq!(
            decode_stage_three_value(command_value(
                "core.unknown",
                serde_json::json!({"kind": "note", "noteId": "note-1"}),
                serde_json::json!({})
            )),
            Err(command_decode_failure(
                KernelStage3CommandFailureLeafV1::UnknownId
            ))
        );
        assert_eq!(
            decode_stage_three_value(command_value(
                "core.document.set-metadata",
                serde_json::json!({"kind": "note", "noteId": "note-1"}),
                serde_json::json!({})
            )),
            Err(command_decode_failure(
                KernelStage3CommandFailureLeafV1::TargetMismatch
            ))
        );

        let empty_batch = command_value(
            "core.transaction.batch",
            serde_json::json!({"kind": "document", "documentId": "score-1"}),
            serde_json::json!({"commands": []}),
        );
        assert_eq!(
            decode_stage_three_value(empty_batch),
            Err(command_decode_failure(
                KernelStage3CommandFailureLeafV1::BatchEmpty
            ))
        );
        let too_many = vec![serde_json::json!({}); MAX_BATCH_CHILDREN_V1 + 1];
        let oversized_batch = command_value(
            "core.transaction.batch",
            serde_json::json!({"kind": "document", "documentId": "score-1"}),
            serde_json::json!({"commands": too_many}),
        );
        assert_eq!(
            decode_stage_three_value(oversized_batch),
            Err(command_decode_failure(
                KernelStage3CommandFailureLeafV1::ResourceLimitExceeded {
                    limit_kind: KernelStage3ResourceLimitKindV1::BatchChildren,
                    limit: 100,
                    actual: 101,
                }
            ))
        );
    }

    #[test]
    fn captured_batch_children_decode_lazily_and_reject_nesting() {
        let leaf = command_value(
            "core.event.remove",
            serde_json::json!({"kind": "event", "eventId": "event-1"}),
            serde_json::json!({}),
        );
        let nested = command_value(
            "core.transaction.batch",
            serde_json::json!({"kind": "document", "documentId": "score-1"}),
            serde_json::json!({"commands": [leaf]}),
        );
        let outer = command_value(
            "core.transaction.batch",
            serde_json::json!({"kind": "document", "documentId": "score-1"}),
            serde_json::json!({"commands": [nested]}),
        );
        let CoreCommandEnvelopeV1::TransactionBatch { commands, .. } =
            decode_stage_three_value(outer).expect("outer batch")
        else {
            panic!("expected batch command");
        };
        assert_eq!(commands.len(), 1);
        assert_eq!(
            decode_captured_core_command(&commands[0]),
            Err(KernelStage3CommandFailureLeafV1::BatchNested.into())
        );

        let malformed_nested = serde_json::json!({
            "commandId": "core.transaction.batch",
            "unrelated": true
        });
        let malformed_outer = command_value(
            "core.transaction.batch",
            serde_json::json!({"kind": "document", "documentId": "score-1"}),
            serde_json::json!({"commands": [malformed_nested]}),
        );
        let CoreCommandEnvelopeV1::TransactionBatch { commands, .. } =
            decode_stage_three_value(malformed_outer).expect("outer malformed nested batch")
        else {
            panic!("expected batch command");
        };
        assert_eq!(
            decode_captured_core_command(&commands[0]),
            Err(KernelStage3CommandFailureLeafV1::BatchNested.into())
        );
    }

    fn rejected_bytes(request: &[u8]) -> Vec<u8> {
        let failure = decode_create_request(request).expect_err("request must fail");
        encode_create_result(&KernelSessionCreateResultV1::Rejected(failure))
            .expect("failure encoding")
    }

    fn failure_variants() -> Vec<StableFailureV1> {
        let root = StablePathV1::root();
        vec![
            StableFailureV1::BridgeCaptureInvalid,
            StableFailureV1::BridgeRequestTooLarge {
                limit_bytes: 1,
                actual_bytes: 2,
            },
            StableFailureV1::CodecInvalidUtf8,
            StableFailureV1::CodecInvalidJson,
            StableFailureV1::CodecInvalidShape {
                path: root.clone(),
                violation: ShapeViolationV1::MissingField,
            },
            StableFailureV1::ContractUnsupportedApiVersion {
                supported_version: 1,
            },
            StableFailureV1::ContractUnsupportedProtocolVersion {
                supported_version: 1,
            },
            StableFailureV1::ScoreUnsupportedSchema {
                supported_schema: ScoreSchemaVersionV1::VALUE,
            },
            StableFailureV1::ScoreInvalidStructure {
                path: root.clone(),
                violation: ScoreStructureViolationV1::InvalidValue,
            },
            StableFailureV1::CodecDepthLimit {
                limit: 64,
                actual: 65,
            },
            StableFailureV1::CodecPropertyLimit {
                limit: 1_572_864,
                actual: 1_572_865,
            },
            StableFailureV1::CodecNumberOutOfRange { path: root },
            StableFailureV1::BridgeHandleUnknown,
            StableFailureV1::BridgeHandleStale,
            StableFailureV1::BridgeHandleWrongEnvironment,
            StableFailureV1::BridgeHandleWrongThread,
            StableFailureV1::BridgeHandleReentrant,
            StableFailureV1::BridgeHandleBusy,
            StableFailureV1::BridgeHandlePoisoned,
            StableFailureV1::BridgeResponseTooLarge {
                limit_bytes: 1,
                actual_bytes: 2,
            },
            StableFailureV1::BridgePanicContained,
            StableFailureV1::BridgeInternal,
        ]
    }

    #[test]
    fn stable_failure_union_has_exactly_twenty_two_unique_codes_and_no_open_keys() {
        let variants = failure_variants();
        assert_eq!(variants.len(), 22);
        let codes = variants
            .iter()
            .map(StableFailureV1::code)
            .collect::<BTreeSet<_>>();
        assert_eq!(codes.len(), 22);
        for failure in variants {
            let bytes = serde_json::to_vec(&failure).expect("failure encode");
            let value: Value = serde_json::from_slice(&bytes).expect("failure JSON");
            let object = value.as_object().expect("failure object");
            assert_eq!(object["failureVersion"], 1);
            assert_eq!(object["code"], failure.code());
            assert!(!object.contains_key("message"));
            assert!(!object.contains_key("stack"));
            assert!(!object.contains_key("cause"));
        }
    }

    #[test]
    fn canonical_result_key_order_and_bytes_are_frozen() {
        let created = KernelSessionCreateResultV1::Created(KernelSessionCreateSuccessValueV1 {
            document_id: StableId::new("score-rkp1").expect("document id"),
            document_version: DocumentVersionV1::initial(),
        });
        assert_eq!(
            encode_create_result(&created).expect("created bytes"),
            br#"{"apiVersion":1,"status":"created","value":{"documentId":"score-rkp1","documentVersion":0}}"#
        );
        let rejected = KernelSessionCreateResultV1::Rejected(StableFailureV1::CodecInvalidUtf8);
        assert_eq!(
            encode_create_result(&rejected).expect("rejected bytes"),
            br#"{"apiVersion":1,"status":"rejected","failure":{"failureVersion":1,"code":"codec.invalid-utf8"}}"#
        );
    }

    #[test]
    fn foundation_capacity_failure_maps_to_existing_internal_wire_shape() {
        let failure = map_foundation_failure(FoundationDecodeFailure::InternalCapacity);
        assert_eq!(failure, StableFailureV1::BridgeInternal);
        assert_eq!(
            encode_create_result(&KernelSessionCreateResultV1::Rejected(failure))
                .expect("capacity failure bytes"),
            br#"{"apiVersion":1,"status":"rejected","failure":{"failureVersion":1,"code":"bridge.internal"}}"#
        );
    }

    #[test]
    fn foundation_empty_collection_wire_classes_and_paths_are_frozen() {
        fn mutated_request(mutator: impl FnOnce(&mut Value)) -> Vec<u8> {
            let mut request: Value = serde_json::from_str(SMOKE_REQUEST).expect("request JSON");
            mutator(&mut request);
            serde_json::to_vec(&request).expect("mutated request bytes")
        }

        assert_eq!(
            rejected_bytes(&mutated_request(|request| {
                request["document"]["measureDefinitions"] = Value::Array(Vec::new());
            })),
            br#"{"apiVersion":1,"status":"rejected","failure":{"failureVersion":1,"code":"score.invalid-structure","path":["measureDefinitions"],"violation":"invalid-value"}}"#
        );
        assert_eq!(
            rejected_bytes(&mutated_request(|request| {
                request["document"]["parts"] = Value::Array(Vec::new());
            })),
            br#"{"apiVersion":1,"status":"rejected","failure":{"failureVersion":1,"code":"score.invalid-structure","path":["parts"],"violation":"invalid-value"}}"#
        );
        assert_eq!(
            rejected_bytes(&mutated_request(|request| {
                request["document"]["parts"][0]["staves"] = Value::Array(Vec::new());
            })),
            br#"{"apiVersion":1,"status":"rejected","failure":{"failureVersion":1,"code":"score.invalid-structure","path":["parts",0,"staves"],"violation":"invalid-reference"}}"#
        );
        assert_eq!(
            rejected_bytes(&mutated_request(|request| {
                request["document"]["parts"][0]["measureContents"][0]["voices"] =
                    Value::Array(Vec::new());
            })),
            br#"{"apiVersion":1,"status":"rejected","failure":{"failureVersion":1,"code":"score.invalid-structure","path":["parts",0,"measureContents",0,"voices"],"violation":"invalid-reference"}}"#
        );
        assert_eq!(
            rejected_bytes(&mutated_request(|request| {
                request["document"]["parts"][0]["measureContents"][0]["voices"][0]
                    ["sequence"]["events"][0]["content"] =
                    serde_json::json!({"kind": "notes", "notes": []});
            })),
            br#"{"apiVersion":1,"status":"rejected","failure":{"failureVersion":1,"code":"score.invalid-structure","path":["parts",0,"measureContents",0,"voices",0,"sequence","events",0,"content","notes"],"violation":"invalid-value"}}"#
        );
    }

    #[test]
    fn response_writer_counts_all_bytes_and_never_retains_above_cap() {
        let at_cap = "x".repeat(RESPONSE_BYTE_LIMIT - 2);
        let encoded =
            encode_capped_with_limit(&at_cap, RESPONSE_BYTE_LIMIT).expect("exact-cap response");
        assert_eq!(encoded.len(), RESPONSE_BYTE_LIMIT);
        assert_eq!(encoded.first(), Some(&b'"'));
        assert_eq!(encoded.last(), Some(&b'"'));
        drop(encoded);
        drop(at_cap);

        let over_cap = "x".repeat(RESPONSE_BYTE_LIMIT - 1);
        assert_eq!(
            encode_capped_with_limit(&over_cap, RESPONSE_BYTE_LIMIT),
            Err(StableFailureV1::BridgeResponseTooLarge {
                limit_bytes: RESPONSE_BYTE_LIMIT as u64,
                actual_bytes: RESPONSE_BYTE_LIMIT as u64 + 1,
            })
        );

        let mut writer = CappedWriter::new(8);
        writer.write_all(&[7_u8; 17]).expect("counted write");
        assert_eq!(writer.actual_bytes, 17);
        assert_eq!(writer.retained, vec![7_u8; 8]);
    }

    #[test]
    fn response_cap_precedes_encode_failure_without_changing_internal_fallback() {
        use brilliant_score_foundation::LosslessEncode;

        struct FailsImmediately;
        impl LosslessEncode for FailsImmediately {
            fn write_lossless<W: std::io::Write + ?Sized>(
                &self,
                _writer: &mut W,
            ) -> Result<(), brilliant_score_foundation::LosslessJsonError> {
                Err(brilliant_score_foundation::LosslessJsonError::Write(
                    std::io::Error::other("test-only encode failure"),
                ))
            }
        }

        struct WritesThenFails;
        impl LosslessEncode for WritesThenFails {
            fn write_lossless<W: std::io::Write + ?Sized>(
                &self,
                writer: &mut W,
            ) -> Result<(), brilliant_score_foundation::LosslessJsonError> {
                writer
                    .write_all(b"[")
                    .map_err(brilliant_score_foundation::LosslessJsonError::Write)?;
                "0123456789".write_lossless(writer)?;
                Err(brilliant_score_foundation::LosslessJsonError::Write(
                    std::io::Error::other("test-only encode failure"),
                ))
            }
        }

        assert_eq!(
            encode_capped_with_limit(&FailsImmediately, 8),
            Err(StableFailureV1::BridgeInternal)
        );
        assert_eq!(
            encode_capped_with_limit(&WritesThenFails, 13),
            Err(StableFailureV1::BridgeInternal)
        );
        assert_eq!(
            encode_capped_with_limit(&WritesThenFails, 4),
            Err(StableFailureV1::BridgeResponseTooLarge {
                limit_bytes: 4,
                actual_bytes: 13,
            })
        );
    }

    #[test]
    fn strict_request_decode_accepts_only_the_smoke_contract() {
        let decoded = decode_create_request(SMOKE_REQUEST.as_bytes()).expect("smoke request");
        assert_eq!(decoded.api_version, 1);
        assert_eq!(
            decoded.document.id.as_js_string(),
            &JsString::from("score-rkp1")
        );

        assert_eq!(
            decode_create_request(&[0xff]),
            Err(StableFailureV1::CodecInvalidUtf8)
        );
        assert_eq!(
            decode_create_request(b"{} {}"),
            Err(StableFailureV1::CodecInvalidJson)
        );
        let duplicate =
            SMOKE_REQUEST.replacen(r#""apiVersion":1,"#, r#""apiVersion":1,"apiVersion":1,"#, 1);
        assert_eq!(
            rejected_bytes(duplicate.as_bytes()),
            br#"{"apiVersion":1,"status":"rejected","failure":{"failureVersion":1,"code":"codec.invalid-shape","path":["apiVersion"],"violation":"duplicate-field"}}"#
        );
        let extra =
            SMOKE_REQUEST.replacen(r#"{"apiVersion":1,"#, r#"{"extra":true,"apiVersion":1,"#, 1);
        assert_eq!(
            rejected_bytes(extra.as_bytes()),
            br#"{"apiVersion":1,"status":"rejected","failure":{"failureVersion":1,"code":"codec.invalid-shape","path":[],"violation":"extra-field"}}"#
        );
    }

    #[test]
    fn extension_owner_public_wire_and_exact_shape_failures_are_frozen() {
        fn request_with_owner(owner: Value) -> Vec<u8> {
            let mut request: Value = serde_json::from_str(SMOKE_REQUEST).expect("request JSON");
            request["document"]["extensions"] = serde_json::json!([{
                "namespace": "unknown.example.owner",
                "schemaVersion": 1,
                "owner": owner,
                "payload": {"nested": [true, null, {"z": 1}]}
            }]);
            serde_json::to_vec(&request).expect("owner request bytes")
        }

        let decoded = decode_create_request(&request_with_owner(serde_json::json!({
            "kind": "part",
            "partId": "part-1"
        })))
        .expect("public partId owner must decode");
        assert_eq!(decoded.document.extensions.len(), 1);

        assert_eq!(
            rejected_bytes(&request_with_owner(serde_json::json!({
                "kind": "part",
                "part_id": "part-1"
            }))),
            br#"{"apiVersion":1,"status":"rejected","failure":{"failureVersion":1,"code":"codec.invalid-shape","path":["document","extensions",0,"owner","partId"],"violation":"missing-field"}}"#
        );
        for owner in [
            serde_json::json!({"kind": "part", "partId": "part-1", "part_id": "part-1"}),
            serde_json::json!({"kind": "part", "partId": "part-1", "extra": true}),
            serde_json::json!({"kind": "score", "partId": "part-1"}),
        ] {
            assert_eq!(
                rejected_bytes(&request_with_owner(owner)),
                br#"{"apiVersion":1,"status":"rejected","failure":{"failureVersion":1,"code":"codec.invalid-shape","path":["document","extensions",0,"owner"],"violation":"extra-field"}}"#
            );
        }
    }

    #[test]
    fn first_failure_precedence_is_stable() {
        let over_cap = vec![0xff; REQUEST_BYTE_LIMIT + 1];
        assert!(matches!(
            decode_create_request(&over_cap),
            Err(StableFailureV1::BridgeRequestTooLarge { .. })
        ));

        let api_and_schema = SMOKE_REQUEST
            .replacen(r#""apiVersion":1"#, r#""apiVersion":2"#, 1)
            .replacen("brilliant-score-1", "brilliant-score-2", 1);
        assert_eq!(
            decode_create_request(api_and_schema.as_bytes()),
            Err(StableFailureV1::ContractUnsupportedApiVersion {
                supported_version: 1
            })
        );

        let future_schema = SMOKE_REQUEST.replacen("brilliant-score-1", "brilliant-score-2", 1);
        assert!(matches!(
            decode_create_request(future_schema.as_bytes()),
            Err(StableFailureV1::ScoreUnsupportedSchema { .. })
        ));
    }

    #[test]
    fn depth_property_and_number_limits_follow_the_frozen_stage_four_rank() {
        let nested = format!(
            "{}0{}",
            "[".repeat(JSON_DEPTH_LIMIT),
            "]".repeat(JSON_DEPTH_LIMIT)
        );
        assert_eq!(
            decode_create_request(nested.as_bytes()),
            Err(StableFailureV1::CodecDepthLimit {
                limit: JSON_DEPTH_LIMIT as u64,
                actual: JSON_DEPTH_LIMIT as u64 + 1,
            })
        );
        let unsafe_number =
            SMOKE_REQUEST.replacen(r#""numerator":4"#, r#""numerator":9007199254740992"#, 1);
        assert_eq!(
            rejected_bytes(unsafe_number.as_bytes()),
            br#"{"apiVersion":1,"status":"rejected","failure":{"failureVersion":1,"code":"codec.number-out-of-range","path":["document","measureDefinitions",0,"meter","numerator"]}}"#
        );

        let mut too_many = String::with_capacity(JSON_PROPERTY_LIMIT * 2 + 2);
        too_many.push('[');
        for index in 0..JSON_PROPERTY_LIMIT {
            if index != 0 {
                too_many.push(',');
            }
            too_many.push('0');
        }
        too_many.push(']');
        assert_eq!(
            decode_create_request(too_many.as_bytes()),
            Err(StableFailureV1::CodecPropertyLimit {
                limit: JSON_PROPERTY_LIMIT as u64,
                actual: JSON_PROPERTY_LIMIT as u64 + 1,
            })
        );
    }

    #[test]
    fn property_limit_successor_wire_and_compatibility_boundaries_are_exact() {
        fn state_after(node_count: usize) -> StrictState {
            let mut state = StrictState::default();
            let path = CanonicalPath::default();
            for _ in 0..node_count {
                state.observe_value(1, &path);
            }
            state
        }

        assert_eq!(JSON_PROPERTY_LIMIT, 1_572_864);
        for accepted_count in [
            1_048_576,
            1_048_577,
            JSON_PROPERTY_LIMIT - 1,
            JSON_PROPERTY_LIMIT,
        ] {
            let state = state_after(accepted_count);
            assert_eq!(state.nodes_visited, accepted_count as u64);
            assert_eq!(state.property_fault, None);
            assert_eq!(state.failure(), None);
        }

        let overflow = state_after(JSON_PROPERTY_LIMIT + 1);
        assert_eq!(overflow.nodes_visited, 1_572_865);
        assert_eq!(overflow.property_fault, Some(1_572_865));
        let failure = overflow.failure().expect("successor property failure");
        assert_eq!(
            failure,
            StableFailureV1::CodecPropertyLimit {
                limit: JSON_PROPERTY_LIMIT as u64,
                actual: JSON_PROPERTY_LIMIT as u64 + 1,
            }
        );
        assert_eq!(
            encode_create_result(&KernelSessionCreateResultV1::Rejected(failure))
                .expect("successor property failure bytes"),
            br#"{"apiVersion":1,"status":"rejected","failure":{"failureVersion":1,"code":"codec.property-limit","limit":1572864,"actual":1572865}}"#
        );

        let mut saturated = StrictState {
            nodes_visited: u64::MAX,
            ..StrictState::default()
        };
        saturated.observe_value(1, &CanonicalPath::default());
        assert_eq!(saturated.nodes_visited, u64::MAX);
        assert_eq!(saturated.property_fault, Some(1_572_865));
    }

    #[test]
    fn structural_candidates_are_order_independent_and_use_canonical_paths() {
        let forward = br#"{"apiVersion":1,"document":{"schemaVersion":"brilliant-score-1","id":false,"metadata":{"title":false,"authors":[],"tempo":{"bpm":120}},"measureDefinitions":[],"parts":[],"extensions":[]}}"#;
        let reversed = br#"{"document":{"extensions":[],"parts":[],"measureDefinitions":[],"metadata":{"tempo":{"bpm":120},"authors":[],"title":false},"id":false,"schemaVersion":"brilliant-score-1"},"apiVersion":1}"#;
        let expected = br#"{"apiVersion":1,"status":"rejected","failure":{"failureVersion":1,"code":"codec.invalid-shape","path":["document","id"],"violation":"wrong-type"}}"#;
        assert_eq!(rejected_bytes(forward), expected);
        assert_eq!(rejected_bytes(reversed), expected);

        let shallow = format!("{}0{}", "[".repeat(63), "]".repeat(63));
        let deep = format!("{}0{}", "[".repeat(64), "]".repeat(64));
        let forward_depth = format!(r#"{{"z":{deep},"a":{shallow}}}"#);
        let reversed_depth = format!(r#"{{"a":{shallow},"z":{deep}}}"#);
        let expected_depth = br#"{"apiVersion":1,"status":"rejected","failure":{"failureVersion":1,"code":"codec.depth-limit","limit":64,"actual":65}}"#;
        assert_eq!(rejected_bytes(forward_depth.as_bytes()), expected_depth);
        assert_eq!(rejected_bytes(reversed_depth.as_bytes()), expected_depth);
    }

    #[test]
    fn structural_rank_beats_source_order_for_compound_faults() {
        let duplicate_and_number = SMOKE_REQUEST
            .replacen(r#""apiVersion":1,"#, r#""apiVersion":1,"apiVersion":1,"#, 1)
            .replacen("120", "9007199254740992", 1);
        assert_eq!(
            rejected_bytes(duplicate_and_number.as_bytes()),
            br#"{"apiVersion":1,"status":"rejected","failure":{"failureVersion":1,"code":"codec.invalid-shape","path":["apiVersion"],"violation":"duplicate-field"}}"#
        );

        let depth_and_number = format!(
            "{}9007199254740992{}",
            "[".repeat(JSON_DEPTH_LIMIT),
            "]".repeat(JSON_DEPTH_LIMIT)
        );
        assert_eq!(
            rejected_bytes(depth_and_number.as_bytes()),
            br#"{"apiVersion":1,"status":"rejected","failure":{"failureVersion":1,"code":"codec.depth-limit","limit":64,"actual":65}}"#
        );

        let shape_and_number = SMOKE_REQUEST
            .replacen(r#""apiVersion":1,"#, "", 1)
            .replacen("120", "9007199254740992", 1);
        assert_eq!(
            rejected_bytes(shape_and_number.as_bytes()),
            br#"{"apiVersion":1,"status":"rejected","failure":{"failureVersion":1,"code":"codec.invalid-shape","path":["apiVersion"],"violation":"missing-field"}}"#
        );

        let property_and_shape = format!(
            "[{}]",
            std::iter::repeat_n("null", JSON_PROPERTY_LIMIT)
                .collect::<Vec<_>>()
                .join(",")
        );
        assert_eq!(
            rejected_bytes(property_and_shape.as_bytes()),
            br#"{"apiVersion":1,"status":"rejected","failure":{"failureVersion":1,"code":"codec.property-limit","limit":1572864,"actual":1572865}}"#
        );
    }

    #[test]
    fn large_unique_and_duplicate_objects_have_linear_visits_and_bounded_fault_slots() {
        let unique_count = 20_000_usize;
        let unique_members = (0..unique_count)
            .map(|index| format!(r#""extra-{index:05}":0"#))
            .collect::<Vec<_>>()
            .join(",");
        let unique_request = SMOKE_REQUEST.replacen(
            r#""apiVersion":1,"#,
            &format!(r#""apiVersion":1,{unique_members},"#),
            1,
        );
        let (unique_value, mut unique_state) =
            strict_json(unique_request.as_bytes()).expect("unique object syntax");
        validate_create_shape(
            unique_value.as_ref().expect("unique object retained"),
            &mut unique_state,
        );
        assert_eq!(
            unique_state.metrics.members_visited,
            unique_state.nodes_visited - 1
        );
        assert!(unique_state.metrics.unique_retained >= unique_count as u64);
        assert_eq!(unique_state.metrics.duplicate_discarded, 0);
        assert_eq!(unique_state.metrics.post_limit_retained, 0);
        assert!(unique_state.metrics.fault_slot_high_water <= 4);
        assert_eq!(
            unique_state.failure(),
            Some(StableFailureV1::CodecInvalidShape {
                path: StablePathV1::root(),
                violation: ShapeViolationV1::ExtraField,
            })
        );

        let duplicate_count = 20_000_usize;
        let duplicate_request = format!(
            "{{{}}}",
            std::iter::repeat_n(r#""repeated":0"#, duplicate_count)
                .collect::<Vec<_>>()
                .join(",")
        );
        let (duplicate_value, duplicate_state) =
            strict_json(duplicate_request.as_bytes()).expect("duplicate object syntax");
        let StrictValue::Object(entries) =
            duplicate_value.expect("duplicate object keeps first value")
        else {
            panic!("expected duplicate object");
        };
        assert_eq!(entries.len(), 1);
        assert_eq!(
            duplicate_state.metrics.members_visited,
            duplicate_count as u64
        );
        assert_eq!(duplicate_state.metrics.unique_retained, 1);
        assert_eq!(
            duplicate_state.metrics.duplicate_discarded,
            duplicate_count as u64 - 1
        );
        assert_eq!(duplicate_state.metrics.post_limit_retained, 0);
        assert!(duplicate_state.metrics.fault_slot_high_water <= 4);
        assert_eq!(
            duplicate_state.failure(),
            Some(StableFailureV1::CodecInvalidShape {
                path: StablePathV1::root(),
                violation: ShapeViolationV1::DuplicateField,
            })
        );
    }

    #[test]
    fn property_scan_only_mode_retains_nothing_new_and_later_depth_still_wins() {
        let prefix = std::iter::repeat_n("0", JSON_PROPERTY_LIMIT)
            .collect::<Vec<_>>()
            .join(",");
        let later_depth = format!(
            "{}0{}",
            "[".repeat(JSON_DEPTH_LIMIT),
            "]".repeat(JSON_DEPTH_LIMIT)
        );
        let request = format!("[{prefix},{later_depth}]");
        let (value, state) = strict_json(request.as_bytes()).expect("scan-only syntax");
        assert!(value.is_none());
        assert_eq!(
            state.failure(),
            Some(StableFailureV1::CodecDepthLimit {
                limit: JSON_DEPTH_LIMIT as u64,
                actual: JSON_DEPTH_LIMIT as u64 + 1,
            })
        );
        assert_eq!(state.property_fault, Some(JSON_PROPERTY_LIMIT as u64 + 1));
        assert_eq!(state.metrics.post_limit_retained, 0);
        assert!(state.metrics.unique_retained <= JSON_PROPERTY_LIMIT as u64);
        assert!(state.metrics.fault_slot_high_water <= 4);
        assert_eq!(state.metrics.members_visited, state.nodes_visited - 1);
    }

    #[test]
    fn adjacent_decode_stages_have_exact_canonical_winners() {
        let over_cap = vec![0xff; REQUEST_BYTE_LIMIT + 1];
        assert_eq!(
            rejected_bytes(&over_cap),
            br#"{"apiVersion":1,"status":"rejected","failure":{"failureVersion":1,"code":"bridge.request-too-large","limitBytes":67108864,"actualBytes":67108865}}"#
        );
        assert_eq!(
            rejected_bytes(&[0xff, b'{']),
            br#"{"apiVersion":1,"status":"rejected","failure":{"failureVersion":1,"code":"codec.invalid-utf8"}}"#
        );
        assert_eq!(
            rejected_bytes(br#"{"apiVersion":2,"document":}"#),
            br#"{"apiVersion":1,"status":"rejected","failure":{"failureVersion":1,"code":"codec.invalid-json"}}"#
        );
        let shape_and_version = SMOKE_REQUEST
            .replacen(r#""apiVersion":1"#, r#""apiVersion":2"#, 1)
            .replacen(r#""id":"score-rkp1""#, r#""id":false"#, 1);
        assert_eq!(
            rejected_bytes(shape_and_version.as_bytes()),
            br#"{"apiVersion":1,"status":"rejected","failure":{"failureVersion":1,"code":"codec.invalid-shape","path":["document","id"],"violation":"wrong-type"}}"#
        );
        let version_and_schema = SMOKE_REQUEST
            .replacen(r#""apiVersion":1"#, r#""apiVersion":2"#, 1)
            .replacen("brilliant-score-1", "brilliant-score-2", 1);
        assert_eq!(
            rejected_bytes(version_and_schema.as_bytes()),
            br#"{"apiVersion":1,"status":"rejected","failure":{"failureVersion":1,"code":"contract.unsupported-api-version","supportedVersion":1}}"#
        );
        let future_schema_with_empty_parts = SMOKE_REQUEST
            .replacen("brilliant-score-1", "brilliant-score-2", 1)
            .replacen(
                r#""parts":[{"id":"part-1","name":"Part","instrument":{"name":"Piano","writtenToSounding":{"diatonicSteps":0,"chromaticSemitones":0}},"staves":[{"id":"staff-1","lineCount":5,"defaultClef":{"sign":"G","line":2}}],"measureContents":[{"measureId":"measure-1","voices":[{"id":"voice-1","defaultStaffId":"staff-1","sequence":{"start":{"numerator":0,"denominator":1},"events":[{"id":"event-1","duration":{"base":1,"dots":0},"content":{"kind":"rest"}}]}}]}]}]"#,
                r#""parts":[]"#,
                1,
            );
        assert_eq!(
            rejected_bytes(future_schema_with_empty_parts.as_bytes()),
            br#"{"apiVersion":1,"status":"rejected","failure":{"failureVersion":1,"code":"score.unsupported-schema","supportedSchema":"brilliant-score-1"}}"#
        );
    }

    #[test]
    fn protocol_version_has_its_own_closed_failure() {
        assert_eq!(validate_protocol_version(1), Ok(()));
        assert_eq!(
            validate_protocol_version(2),
            Err(StableFailureV1::ContractUnsupportedProtocolVersion {
                supported_version: 1
            })
        );
    }
}
