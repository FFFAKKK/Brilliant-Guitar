use std::{collections::BTreeMap, fmt, io::Write};

use brilliant_core_types::{
    API_VERSION_V1, JS_SAFE_INTEGER_MAX, JSON_DEPTH_LIMIT, JSON_PROPERTY_LIMIT,
    ScoreSchemaVersionV1, StablePathSegmentV1, StablePathV1,
};
use brilliant_extension_protocol::EXTENSION_PROTOCOL_VERSION_V1;
use brilliant_score_foundation::{FoundationDecodeFailure, decode_score_document_value};
use serde::{
    Deserializer,
    de::{self, DeserializeSeed, MapAccess, SeqAccess, Visitor},
};
use serde_json::{Map, Number, Value};

use crate::{
    KernelSessionCreateRequestV1, KernelSessionCreateResultV1, KernelSessionReadResultV1,
    ScoreStructureViolationV1, ShapeViolationV1, StableFailureV1,
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

    fn raw_field(&self, field: &str) -> Self {
        canonical_field(field).map_or_else(|| self.clone(), |field| self.field(field))
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
        _ => return None,
    })
}

#[derive(Clone, Debug)]
enum StrictValue {
    Null,
    Bool(bool),
    Number(Number),
    String(String),
    Array(Vec<Self>),
    Object(BTreeMap<String, Self>),
}

impl StrictValue {
    fn into_json(self) -> Value {
        match self {
            Self::Null => Value::Null,
            Self::Bool(value) => Value::Bool(value),
            Self::Number(value) => Value::Number(value),
            Self::String(value) => Value::String(value),
            Self::Array(values) => {
                Value::Array(values.into_iter().map(StrictValue::into_json).collect())
            }
            Self::Object(entries) => {
                let mut values = Map::new();
                for (key, value) in entries {
                    values.insert(key, value.into_json());
                }
                Value::Object(values)
            }
        }
    }
}

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

struct StrictSeed<'a> {
    state: &'a mut StrictState,
    depth: usize,
    path: CanonicalPath,
    retain: bool,
}

impl<'de> DeserializeSeed<'de> for StrictSeed<'_> {
    type Value = Option<StrictValue>;

    fn deserialize<D>(self, deserializer: D) -> Result<Self::Value, D::Error>
    where
        D: Deserializer<'de>,
    {
        let state_allows_retention = self.state.observe_value(self.depth, &self.path);
        let retain = self.retain && state_allows_retention;
        deserializer.deserialize_any(StrictVisitor {
            state: self.state,
            depth: self.depth,
            path: self.path,
            retain,
        })
    }
}

struct StrictVisitor<'a> {
    state: &'a mut StrictState,
    depth: usize,
    path: CanonicalPath,
    retain: bool,
}

impl<'de> Visitor<'de> for StrictVisitor<'_> {
    type Value = Option<StrictValue>;

    fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("one strict JSON value")
    }

    fn visit_unit<E>(self) -> Result<Self::Value, E> {
        Ok(self.retain.then_some(StrictValue::Null))
    }

    fn visit_none<E>(self) -> Result<Self::Value, E> {
        Ok(self.retain.then_some(StrictValue::Null))
    }

    fn visit_bool<E>(self, value: bool) -> Result<Self::Value, E> {
        Ok(self.retain.then_some(StrictValue::Bool(value)))
    }

    fn visit_i64<E>(self, value: i64) -> Result<Self::Value, E>
    where
        E: de::Error,
    {
        if !(-JS_SAFE_INTEGER_MAX..=JS_SAFE_INTEGER_MAX).contains(&value) {
            self.state.record_number(self.path);
            return Ok(self.retain.then_some(StrictValue::Number(Number::from(0))));
        }
        Ok(self
            .retain
            .then_some(StrictValue::Number(Number::from(value))))
    }

    fn visit_u64<E>(self, value: u64) -> Result<Self::Value, E>
    where
        E: de::Error,
    {
        if value > JS_SAFE_INTEGER_MAX as u64 {
            self.state.record_number(self.path);
            return Ok(self.retain.then_some(StrictValue::Number(Number::from(0))));
        }
        Ok(self
            .retain
            .then_some(StrictValue::Number(Number::from(value))))
    }

    fn visit_f64<E>(self, value: f64) -> Result<Self::Value, E>
    where
        E: de::Error,
    {
        if value.fract() != 0.0
            || value < -JS_SAFE_INTEGER_MAX as f64
            || value > JS_SAFE_INTEGER_MAX as f64
        {
            self.state.record_number(self.path);
            return Ok(self.retain.then_some(StrictValue::Number(Number::from(0))));
        }
        Ok(self
            .retain
            .then_some(StrictValue::Number(Number::from(value as i64))))
    }

    fn visit_str<E>(self, value: &str) -> Result<Self::Value, E> {
        Ok(self.retain.then(|| StrictValue::String(value.to_owned())))
    }

    fn visit_string<E>(self, value: String) -> Result<Self::Value, E> {
        Ok(self.retain.then_some(StrictValue::String(value)))
    }

    fn visit_seq<A>(self, mut sequence: A) -> Result<Self::Value, A::Error>
    where
        A: SeqAccess<'de>,
    {
        let mut values = Vec::new();
        let mut index = 0_usize;
        while let Some(value) = sequence.next_element_seed(StrictSeed {
            state: self.state,
            depth: self.depth + 1,
            path: self.path.index(index),
            retain: self.retain,
        })? {
            #[cfg(test)]
            {
                self.state.metrics.members_visited =
                    self.state.metrics.members_visited.saturating_add(1);
            }
            if let Some(value) = value {
                values.push(value);
                #[cfg(test)]
                {
                    self.state.metrics.unique_retained =
                        self.state.metrics.unique_retained.saturating_add(1);
                }
            }
            index = index.saturating_add(1);
        }
        Ok((self.retain && self.state.can_retain()).then_some(StrictValue::Array(values)))
    }

    fn visit_map<A>(self, mut map: A) -> Result<Self::Value, A::Error>
    where
        A: MapAccess<'de>,
    {
        let mut values = BTreeMap::new();
        loop {
            let retain_key = self.retain && self.state.can_retain();
            let Some(key) = map.next_key_seed(StrictMapKeySeed { retain: retain_key })? else {
                break;
            };
            #[cfg(test)]
            {
                self.state.metrics.members_visited =
                    self.state.metrics.members_visited.saturating_add(1);
            }
            match key {
                StrictMapKey::Retained(key) => {
                    let path = self.path.raw_field(&key);
                    let duplicate = values.contains_key(&key);
                    if duplicate {
                        self.state
                            .record_shape(2, path.clone(), ShapeViolationV1::DuplicateField);
                        #[cfg(test)]
                        {
                            self.state.metrics.duplicate_discarded =
                                self.state.metrics.duplicate_discarded.saturating_add(1);
                        }
                    }
                    let value = map.next_value_seed(StrictSeed {
                        state: self.state,
                        depth: self.depth + 1,
                        path,
                        retain: self.retain && !duplicate,
                    })?;
                    if let Some(value) = value {
                        if self.state.can_retain() {
                            values.insert(key, value);
                            #[cfg(test)]
                            {
                                self.state.metrics.unique_retained =
                                    self.state.metrics.unique_retained.saturating_add(1);
                            }
                        } else {
                            #[cfg(test)]
                            {
                                self.state.metrics.post_limit_retained =
                                    self.state.metrics.post_limit_retained.saturating_add(1);
                            }
                        }
                    }
                }
                StrictMapKey::Scanned(canonical) => {
                    let path =
                        canonical.map_or_else(|| self.path.clone(), |field| self.path.field(field));
                    let value = map.next_value_seed(StrictSeed {
                        state: self.state,
                        depth: self.depth + 1,
                        path,
                        retain: false,
                    })?;
                    debug_assert!(value.is_none());
                }
            }
        }
        Ok((self.retain && self.state.can_retain()).then_some(StrictValue::Object(values)))
    }
}

enum StrictMapKey {
    Retained(String),
    Scanned(Option<&'static str>),
}

struct StrictMapKeySeed {
    retain: bool,
}

impl<'de> DeserializeSeed<'de> for StrictMapKeySeed {
    type Value = StrictMapKey;

    fn deserialize<D>(self, deserializer: D) -> Result<Self::Value, D::Error>
    where
        D: Deserializer<'de>,
    {
        deserializer.deserialize_str(StrictMapKeyVisitor {
            retain: self.retain,
        })
    }
}

struct StrictMapKeyVisitor {
    retain: bool,
}

impl<'de> Visitor<'de> for StrictMapKeyVisitor {
    type Value = StrictMapKey;

    fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("one JSON object key")
    }

    fn visit_str<E>(self, value: &str) -> Result<Self::Value, E> {
        Ok(if self.retain {
            StrictMapKey::Retained(value.to_owned())
        } else {
            StrictMapKey::Scanned(canonical_field(value))
        })
    }

    fn visit_string<E>(self, value: String) -> Result<Self::Value, E> {
        Ok(if self.retain {
            StrictMapKey::Retained(value)
        } else {
            StrictMapKey::Scanned(canonical_field(&value))
        })
    }
}

fn strict_json(bytes: &[u8]) -> Result<(Option<StrictValue>, StrictState), StableFailureV1> {
    let text = std::str::from_utf8(bytes).map_err(|_| StableFailureV1::CodecInvalidUtf8)?;
    let mut deserializer = serde_json::Deserializer::from_str(text);
    let mut state = StrictState::default();
    let value = StrictSeed {
        state: &mut state,
        depth: 1,
        path: CanonicalPath::default(),
        retain: true,
    }
    .deserialize(&mut deserializer)
    .map_err(|_| StableFailureV1::CodecInvalidJson)?;
    deserializer
        .end()
        .map_err(|_| StableFailureV1::CodecInvalidJson)?;
    Ok((value, state))
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
) -> Option<&'a BTreeMap<String, StrictValue>> {
    let StrictValue::Object(entries) = value else {
        record_wrong_type(state, path);
        return None;
    };
    for field in required {
        if !entries.contains_key(*field) {
            state.record_shape(0, path.field(field), ShapeViolationV1::MissingField);
        }
    }
    if entries.keys().any(|key| {
        !required
            .iter()
            .chain(optional)
            .any(|allowed| key == allowed)
    }) {
        state.record_shape(1, path.clone(), ShapeViolationV1::ExtraField);
    }
    Some(entries)
}

fn field_values<'a>(
    entries: &'a BTreeMap<String, StrictValue>,
    field: &'static str,
) -> impl Iterator<Item = &'a StrictValue> {
    entries.get(field).into_iter()
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
        StrictValue::String(value) if allowed.contains(&value.as_str()) => {}
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
            && matches!(kind.as_str(), "rest" | "notes")
        {
            valid_kinds.push(kind.as_str());
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
            expect_number(value, &tempo_path.field("bpm"), state);
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
        if !matches!(kind.as_str(), "score" | "part") {
            continue;
        }
        let required: &[&'static str] = if kind == "part" {
            &["kind", "partId"]
        } else {
            &["kind"]
        };
        let Some(owner) = exact_object(value, path, required, &[], state) else {
            continue;
        };
        if kind == "part" {
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
    let value = strict_value.into_json();
    let object = value
        .as_object()
        .ok_or_else(|| StableFailureV1::CodecInvalidShape {
            path: StablePathV1::root(),
            violation: ShapeViolationV1::WrongType,
        })?;
    for required in ["apiVersion", "document"] {
        if !object.contains_key(required) {
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
    let api_version =
        object["apiVersion"]
            .as_i64()
            .ok_or_else(|| StableFailureV1::CodecInvalidShape {
                path: StablePathV1::field("apiVersion"),
                violation: ShapeViolationV1::WrongType,
            })?;
    if api_version != API_VERSION_V1 as i64 {
        return Err(StableFailureV1::ContractUnsupportedApiVersion {
            supported_version: API_VERSION_V1,
        });
    }
    let document_value = object["document"].clone();
    let schema = document_value
        .as_object()
        .and_then(|document| document.get("schemaVersion"))
        .and_then(Value::as_str)
        .ok_or_else(|| StableFailureV1::CodecInvalidShape {
            path: CanonicalPath::default()
                .field("document")
                .field("schemaVersion")
                .stable(),
            violation: ShapeViolationV1::WrongType,
        })?;
    if schema != ScoreSchemaVersionV1::VALUE {
        return Err(StableFailureV1::ScoreUnsupportedSchema {
            supported_schema: ScoreSchemaVersionV1::VALUE,
        });
    }
    let document = decode_score_document_value(document_value).map_err(map_foundation_failure)?;
    Ok(KernelSessionCreateRequestV1 {
        api_version: API_VERSION_V1,
        document,
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

fn encode_capped<T: serde::Serialize>(value: &T) -> Result<Vec<u8>, StableFailureV1> {
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

fn encode_capped_with_limit<T: serde::Serialize>(
    value: &T,
    limit: usize,
) -> Result<Vec<u8>, StableFailureV1> {
    let mut writer = CappedWriter::new(limit);
    let encoded = serde_json::to_writer(&mut writer, value);
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
    use crate::KernelSessionCreateSuccessValueV1;

    const SMOKE_REQUEST: &str = r#"{"apiVersion":1,"document":{"schemaVersion":"brilliant-score-1","id":"score-rkp1","metadata":{"title":"Smoke","authors":["Brilliant"],"tempo":{"bpm":120}},"measureDefinitions":[{"id":"measure-1","meter":{"numerator":4,"denominator":4}}],"parts":[{"id":"part-1","name":"Part","instrument":{"name":"Piano","writtenToSounding":{"diatonicSteps":0,"chromaticSemitones":0}},"staves":[{"id":"staff-1","lineCount":5,"defaultClef":{"sign":"G","line":2}}],"measureContents":[{"measureId":"measure-1","voices":[{"id":"voice-1","defaultStaffId":"staff-1","sequence":{"start":{"numerator":0,"denominator":1},"events":[{"id":"event-1","duration":{"base":1,"dots":0},"content":{"kind":"rest"}}]}}]}]}],"extensions":[]}}"#;

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
        use serde::ser::{Error as _, SerializeSeq};

        struct FailsImmediately;
        impl serde::Serialize for FailsImmediately {
            fn serialize<S>(&self, _serializer: S) -> Result<S::Ok, S::Error>
            where
                S: serde::Serializer,
            {
                Err(S::Error::custom("test-only encode failure"))
            }
        }

        struct WritesThenFails;
        impl serde::Serialize for WritesThenFails {
            fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
            where
                S: serde::Serializer,
            {
                let mut sequence = serializer.serialize_seq(None)?;
                sequence.serialize_element("0123456789")?;
                Err(S::Error::custom("test-only encode failure"))
            }
        }

        assert_eq!(
            encode_capped_with_limit(&FailsImmediately, 8),
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
        assert_eq!(decoded.document.id.as_str(), "score-rkp1");

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
        let unsafe_number = SMOKE_REQUEST.replacen("120", "9007199254740992", 1);
        assert_eq!(
            rejected_bytes(unsafe_number.as_bytes()),
            br#"{"apiVersion":1,"status":"rejected","failure":{"failureVersion":1,"code":"codec.number-out-of-range","path":["document","metadata","tempo","bpm"]}}"#
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
