//! Explicit DTO conversion. No Serde marker, type-name test or process-global
//! mode can accidentally turn an unsupported string into another JSON type.

use std::{collections::BTreeMap, io::Write};

use brilliant_core_types::{
    FiniteNumber, JsString, JsonValue, LosslessJsonValue, SafeInteger, StableId,
};

use crate::{
    LosslessJsonError,
    dto::*,
    lossless_json::{write_json_object_with, write_json_value_with},
    write_js_string_json,
};

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum LosslessValuePath {
    Field(JsString),
    Index(usize),
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum LosslessValueFailure {
    WrongType,
    InvalidValue,
    MissingField,
    ExtraField,
    NonScalarText,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct LosslessValueError {
    pub path: Vec<LosslessValuePath>,
    pub failure: LosslessValueFailure,
}

impl LosslessValueError {
    fn new(failure: LosslessValueFailure) -> Self {
        Self {
            path: Vec::new(),
            failure,
        }
    }
    fn at(mut self, segment: LosslessValuePath) -> Self {
        self.path.insert(0, segment);
        self
    }
}

/// Structural conversion of an already bounded capture. Callers enforce input
/// byte/depth/property limits before this step and semantic admission afterward.
/// This converter does not replace Contracts' shape/path failure ranking.
pub trait LosslessDecode: Sized {
    fn from_lossless_value(value: LosslessJsonValue) -> Result<Self, LosslessValueError>;
}

/// Writes DTO fields in their declared wire order; opaque map keys are ordered
/// by their text type. A caller must discard partial output on any error.
pub trait LosslessEncode {
    fn write_lossless<W: Write + ?Sized>(&self, writer: &mut W) -> Result<(), LosslessJsonError>;
}

/// String-valued DTO parameters, never a numeric/array-to-key coercion.
pub trait LosslessText: LosslessDecode + LosslessEncode + Ord {
    fn json_from_lossless(value: LosslessJsonValue) -> Result<JsonValue<Self>, LosslessValueError>;
}

impl LosslessDecode for JsString {
    fn from_lossless_value(value: LosslessJsonValue) -> Result<Self, LosslessValueError> {
        if let JsonValue::String(value) = value {
            Ok(value)
        } else {
            Err(LosslessValueError::new(LosslessValueFailure::WrongType))
        }
    }
}
impl LosslessEncode for JsString {
    fn write_lossless<W: Write + ?Sized>(&self, writer: &mut W) -> Result<(), LosslessJsonError> {
        write_js_string_json(self, writer).map_err(LosslessJsonError::Write)
    }
}
impl LosslessText for JsString {
    fn json_from_lossless(value: LosslessJsonValue) -> Result<JsonValue<Self>, LosslessValueError> {
        // Preserve the owned opaque subtree and its shared string allocations.
        Ok(value)
    }
}

impl LosslessDecode for String {
    fn from_lossless_value(value: LosslessJsonValue) -> Result<Self, LosslessValueError> {
        JsString::from_lossless_value(value)?
            .to_utf8()
            .map_err(|_| LosslessValueError::new(LosslessValueFailure::NonScalarText))
    }
}
impl LosslessEncode for str {
    fn write_lossless<W: Write + ?Sized>(&self, writer: &mut W) -> Result<(), LosslessJsonError> {
        serde_json::to_writer(writer, self).map_err(LosslessJsonError::Serialization)
    }
}
impl LosslessEncode for String {
    fn write_lossless<W: Write + ?Sized>(&self, writer: &mut W) -> Result<(), LosslessJsonError> {
        self.as_str().write_lossless(writer)
    }
}
impl LosslessText for String {
    fn json_from_lossless(value: LosslessJsonValue) -> Result<JsonValue<Self>, LosslessValueError> {
        convert_json_text(value)
    }
}

impl LosslessDecode for StableId {
    fn from_lossless_value(value: LosslessJsonValue) -> Result<Self, LosslessValueError> {
        Self::new(String::from_lossless_value(value)?)
            .map_err(|_| LosslessValueError::new(LosslessValueFailure::InvalidValue))
    }
}
impl LosslessEncode for StableId {
    fn write_lossless<W: Write + ?Sized>(&self, writer: &mut W) -> Result<(), LosslessJsonError> {
        self.as_str().write_lossless(writer)
    }
}
impl LosslessText for StableId {
    fn json_from_lossless(value: LosslessJsonValue) -> Result<JsonValue<Self>, LosslessValueError> {
        convert_json_text(value)
    }
}

fn convert_json_text<Text: LosslessText>(
    value: LosslessJsonValue,
) -> Result<JsonValue<Text>, LosslessValueError> {
    Ok(match value {
        JsonValue::Null => JsonValue::Null,
        JsonValue::Bool(value) => JsonValue::Bool(value),
        JsonValue::Number(value) => JsonValue::Number(value),
        JsonValue::String(value) => {
            JsonValue::String(Text::from_lossless_value(JsonValue::String(value))?)
        }
        JsonValue::Array(values) => JsonValue::Array(
            values
                .into_iter()
                .enumerate()
                .map(|(index, value)| {
                    convert_json_text(value)
                        .map_err(|error| error.at(LosslessValuePath::Index(index)))
                })
                .collect::<Result<_, _>>()?,
        ),
        JsonValue::Object(values) => {
            let mut result = BTreeMap::new();
            for (key, value) in values {
                let field = LosslessValuePath::Field(key.clone());
                let decoded_key = Text::from_lossless_value(JsonValue::String(key))
                    .map_err(|error| error.at(field.clone()))?;
                result.insert(
                    decoded_key,
                    convert_json_text(value).map_err(|error| error.at(field))?,
                );
            }
            JsonValue::Object(result)
        }
    })
}

impl LosslessDecode for FiniteNumber {
    fn from_lossless_value(value: LosslessJsonValue) -> Result<Self, LosslessValueError> {
        if let JsonValue::Number(value) = value {
            Ok(value)
        } else {
            Err(LosslessValueError::new(LosslessValueFailure::WrongType))
        }
    }
}
impl LosslessDecode for SafeInteger {
    fn from_lossless_value(value: LosslessJsonValue) -> Result<Self, LosslessValueError> {
        let number = FiniteNumber::from_lossless_value(value)?.get();
        if number.fract() != 0.0 || number.abs() > brilliant_core_types::JS_SAFE_INTEGER_MAX as f64
        {
            return Err(LosslessValueError::new(LosslessValueFailure::InvalidValue));
        }
        Self::new(number as i64)
            .map_err(|_| LosslessValueError::new(LosslessValueFailure::InvalidValue))
    }
}
macro_rules! scalar_encode {
    ($($ty:ty),+ $(,)?) => { $(impl LosslessEncode for $ty {
        fn write_lossless<W: Write + ?Sized>(&self, writer: &mut W) -> Result<(), LosslessJsonError> {
            serde_json::to_writer(writer, self).map_err(LosslessJsonError::Serialization)
        }
    })+ };
}
scalar_encode!(SafeInteger, FiniteNumber, bool);

impl<T: LosslessDecode> LosslessDecode for Vec<T> {
    fn from_lossless_value(value: LosslessJsonValue) -> Result<Self, LosslessValueError> {
        let JsonValue::Array(values) = value else {
            return Err(LosslessValueError::new(LosslessValueFailure::WrongType));
        };
        values
            .into_iter()
            .enumerate()
            .map(|(index, value)| {
                T::from_lossless_value(value)
                    .map_err(|error| error.at(LosslessValuePath::Index(index)))
            })
            .collect()
    }
}
impl<T: LosslessEncode> LosslessEncode for Vec<T> {
    fn write_lossless<W: Write + ?Sized>(&self, writer: &mut W) -> Result<(), LosslessJsonError> {
        writer.write_all(b"[").map_err(LosslessJsonError::Write)?;
        for (index, value) in self.iter().enumerate() {
            if index != 0 {
                writer.write_all(b",").map_err(LosslessJsonError::Write)?;
            }
            value.write_lossless(writer)?;
        }
        writer.write_all(b"]").map_err(LosslessJsonError::Write)
    }
}

impl<Text: LosslessText> LosslessDecode for JsonValue<Text> {
    fn from_lossless_value(value: LosslessJsonValue) -> Result<Self, LosslessValueError> {
        Text::json_from_lossless(value)
    }
}
impl<Text: LosslessText> LosslessDecode for BTreeMap<Text, JsonValue<Text>> {
    fn from_lossless_value(value: LosslessJsonValue) -> Result<Self, LosslessValueError> {
        let JsonValue::Object(values) = Text::json_from_lossless(value)? else {
            return Err(LosslessValueError::new(LosslessValueFailure::WrongType));
        };
        Ok(values)
    }
}
impl<Text: LosslessText> LosslessEncode for BTreeMap<Text, JsonValue<Text>> {
    fn write_lossless<W: Write + ?Sized>(&self, writer: &mut W) -> Result<(), LosslessJsonError> {
        JsonValue::validate_object_limits(self).map_err(LosslessJsonError::Limit)?;
        write_json_object_with(self, writer, &mut |text, writer| {
            text.write_lossless(writer)
        })
    }
}
impl<Text: LosslessText> LosslessEncode for JsonValue<Text> {
    fn write_lossless<W: Write + ?Sized>(&self, writer: &mut W) -> Result<(), LosslessJsonError> {
        // Validate an opaque tree once, rather than once per recursive child.
        self.validate_limits().map_err(LosslessJsonError::Limit)?;
        write_json_value_with(self, writer, &mut |text, writer| {
            text.write_lossless(writer)
        })
    }
}

struct ObjectReader(BTreeMap<JsString, LosslessJsonValue>);
impl ObjectReader {
    fn new(value: LosslessJsonValue) -> Result<Self, LosslessValueError> {
        if let JsonValue::Object(value) = value {
            Ok(Self(value))
        } else {
            Err(LosslessValueError::new(LosslessValueFailure::WrongType))
        }
    }
    fn take<T: LosslessDecode>(&mut self, field: &'static str) -> Result<T, LosslessValueError> {
        let key = JsString::from(field);
        let value = self.0.remove(&key).ok_or_else(|| {
            LosslessValueError::new(LosslessValueFailure::MissingField)
                .at(LosslessValuePath::Field(key.clone()))
        })?;
        T::from_lossless_value(value).map_err(|error| error.at(LosslessValuePath::Field(key)))
    }
    fn optional<T: LosslessDecode>(
        &mut self,
        field: &'static str,
    ) -> Result<Option<T>, LosslessValueError> {
        let key = JsString::from(field);
        self.0
            .remove(&key)
            .map(|value| {
                T::from_lossless_value(value)
                    .map_err(|error| error.at(LosslessValuePath::Field(key)))
            })
            .transpose()
    }
    fn end(self) -> Result<(), LosslessValueError> {
        if let Some((key, _)) = self.0.into_iter().next() {
            Err(LosslessValueError::new(LosslessValueFailure::ExtraField)
                .at(LosslessValuePath::Field(key)))
        } else {
            Ok(())
        }
    }
}
struct ObjectWriter<'a, W: Write + ?Sized> {
    writer: &'a mut W,
    first: bool,
}
impl<'a, W: Write + ?Sized> ObjectWriter<'a, W> {
    fn new(writer: &'a mut W) -> Result<Self, LosslessJsonError> {
        writer.write_all(b"{").map_err(LosslessJsonError::Write)?;
        Ok(Self {
            writer,
            first: true,
        })
    }
    fn field<K: LosslessEncode + ?Sized, V: LosslessEncode + ?Sized>(
        &mut self,
        key: &K,
        value: &V,
    ) -> Result<(), LosslessJsonError> {
        if !self.first {
            self.writer
                .write_all(b",")
                .map_err(LosslessJsonError::Write)?;
        }
        self.first = false;
        key.write_lossless(self.writer)?;
        self.writer
            .write_all(b":")
            .map_err(LosslessJsonError::Write)?;
        value.write_lossless(self.writer)
    }
    fn end(self) -> Result<(), LosslessJsonError> {
        self.writer
            .write_all(b"}")
            .map_err(LosslessJsonError::Write)
    }
}

macro_rules! take_field {
    ($reader:ident, required, $wire:literal) => {
        $reader.take($wire)?
    };
    ($reader:ident, optional, $wire:literal) => {
        $reader.optional($wire)?
    };
}
macro_rules! write_field {
    ($writer:ident, $this:ident, required, $field:ident, $wire:literal) => {
        $writer.field($wire, &$this.$field)?;
    };
    ($writer:ident, $this:ident, optional, $field:ident, $wire:literal) => {
        if let Some(value) = &$this.$field {
            $writer.field($wire, value)?;
        }
    };
}
macro_rules! score_codec {
    ([$($generic:ident),*] $ty:ty { $($mode:ident $field:ident => $wire:literal),* $(,)? }) => {
        impl<$($generic: LosslessText),*> LosslessDecode for $ty {
            fn from_lossless_value(value: LosslessJsonValue) -> Result<Self, LosslessValueError> {
                let mut reader = ObjectReader::new(value)?;
                let value = Self { $($field: take_field!(reader, $mode, $wire)),* };
                reader.end()?;
                Ok(value)
            }
        }
        impl<$($generic: LosslessText),*> LosslessEncode for $ty {
            fn write_lossless<W: Write + ?Sized>(&self, writer: &mut W) -> Result<(), LosslessJsonError> {
                let mut object = ObjectWriter::new(writer)?;
                $(write_field!(object, self, $mode, $field, $wire);)*
                object.end()
            }
        }
    };
}

score_codec!([Id, Text] ScoreDocumentV1<Id, Text> { required schema_version => "schemaVersion", required id => "id", required metadata => "metadata", required measure_definitions => "measureDefinitions", required parts => "parts", required extensions => "extensions" });
score_codec!([Text] ScoreMetadataV1<Text> { required title => "title", required authors => "authors", required tempo => "tempo" });
score_codec!([] TempoV1 { required bpm => "bpm" });
score_codec!([Id] MeasureDefinitionV1<Id> { required id => "id", required meter => "meter", optional pickup_duration => "pickupDuration" });
score_codec!([] MeterV1 { required numerator => "numerator", required denominator => "denominator" });
score_codec!([] FractionV1 { required numerator => "numerator", required denominator => "denominator" });
score_codec!([Id, Text] PartV1<Id, Text> { required id => "id", required name => "name", required instrument => "instrument", required staves => "staves", required measure_contents => "measureContents" });
score_codec!([Text] InstrumentDescriptorV1<Text> { required name => "name", required written_to_sounding => "writtenToSounding" });
score_codec!([] TranspositionV1 { required diatonic_steps => "diatonicSteps", required chromatic_semitones => "chromaticSemitones" });
score_codec!([Id] StaffDefinitionV1<Id> { required id => "id", required line_count => "lineCount", required default_clef => "defaultClef" });
score_codec!([] ClefV1 { required sign => "sign", required line => "line" });
score_codec!([Id] PartMeasureContentV1<Id> { required measure_id => "measureId", required voices => "voices" });
score_codec!([Id] VoiceV1<Id> { required id => "id", required default_staff_id => "defaultStaffId", required sequence => "sequence" });
score_codec!([Id] MusicSequenceV1<Id> { required start => "start", required events => "events" });
score_codec!([Id] RhythmicEventV1<Id> { required id => "id", required duration => "duration", optional staff_id => "staffId", required content => "content" });
score_codec!([] NoteValueV1 { required base => "base", required dots => "dots", optional time_modification => "timeModification" });
score_codec!([] TimeModificationV1 { required actual_notes => "actualNotes", required normal_notes => "normalNotes" });
score_codec!([Id] ScoreNoteV1<Id> { required id => "id", required written_pitch => "writtenPitch" });
score_codec!([] WrittenPitchV1 { required step => "step", required alter => "alter", required octave => "octave" });
score_codec!([Id, Text] ExtensionBlockV1<Id, Text> { required namespace => "namespace", required schema_version => "schemaVersion", required owner => "owner", required payload => "payload" });

macro_rules! string_enum {
    ($ty:ty { $($variant:ident => $wire:literal),+ $(,)? }) => {
        impl LosslessDecode for $ty {
            fn from_lossless_value(value: LosslessJsonValue) -> Result<Self, LosslessValueError> {
                let value = JsString::from_lossless_value(value)?;
                $(if value.eq_ascii($wire) { return Ok(Self::$variant); })+
                Err(LosslessValueError::new(LosslessValueFailure::InvalidValue))
            }
        }
        impl LosslessEncode for $ty {
            fn write_lossless<W: Write + ?Sized>(&self, writer: &mut W) -> Result<(), LosslessJsonError> {
                match self { $(Self::$variant => $wire.write_lossless(writer)),+ }
            }
        }
    };
}
string_enum!(ClefSignV1 { G => "G", F => "F", C => "C" });
string_enum!(PitchStepV1 { C => "C", D => "D", E => "E", F => "F", G => "G", A => "A", B => "B" });

impl<Id: LosslessText> LosslessDecode for RhythmicContentV1<Id> {
    fn from_lossless_value(value: LosslessJsonValue) -> Result<Self, LosslessValueError> {
        let mut reader = ObjectReader::new(value)?;
        let kind: JsString = reader.take("kind")?;
        let value = if kind.eq_ascii("rest") {
            Self::Rest
        } else if kind.eq_ascii("notes") {
            Self::Notes {
                notes: reader.take("notes")?,
            }
        } else {
            return Err(LosslessValueError::new(LosslessValueFailure::InvalidValue)
                .at(LosslessValuePath::Field("kind".into())));
        };
        reader.end()?;
        Ok(value)
    }
}
impl<Id: LosslessText> LosslessEncode for RhythmicContentV1<Id> {
    fn write_lossless<W: Write + ?Sized>(&self, writer: &mut W) -> Result<(), LosslessJsonError> {
        let mut object = ObjectWriter::new(writer)?;
        match self {
            Self::Rest => object.field("kind", "rest")?,
            Self::Notes { notes } => {
                object.field("kind", "notes")?;
                object.field("notes", notes)?;
            }
        }
        object.end()
    }
}
impl<Id: LosslessText> LosslessDecode for ExtensionOwnerV1<Id> {
    fn from_lossless_value(value: LosslessJsonValue) -> Result<Self, LosslessValueError> {
        let mut reader = ObjectReader::new(value)?;
        let kind: JsString = reader.take("kind")?;
        let value = if kind.eq_ascii("score") {
            Self::Score
        } else if kind.eq_ascii("part") {
            Self::Part {
                part_id: reader.take("partId")?,
            }
        } else {
            return Err(LosslessValueError::new(LosslessValueFailure::InvalidValue)
                .at(LosslessValuePath::Field("kind".into())));
        };
        reader.end()?;
        Ok(value)
    }
}
impl<Id: LosslessText> LosslessEncode for ExtensionOwnerV1<Id> {
    fn write_lossless<W: Write + ?Sized>(&self, writer: &mut W) -> Result<(), LosslessJsonError> {
        let mut object = ObjectWriter::new(writer)?;
        match self {
            Self::Score => object.field("kind", "score")?,
            Self::Part { part_id } => {
                object.field("kind", "part")?;
                object.field("partId", part_id)?;
            }
        }
        object.end()
    }
}

#[cfg(test)]
mod tests;
