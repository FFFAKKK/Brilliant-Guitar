use std::collections::BTreeMap;

use brilliant_core_types::{JsString, LosslessJsonValue, StablePathV1};
use serde::Serialize;

// Architecture Reset V2's aggregate transaction diagnostic budget. Exhaustion
// is a mechanism failure, never a truncated report claiming to be complete.
pub const CORE_ASSESSMENT_DIAGNOSTIC_LIMIT_V1: usize = 4_096;

macro_rules! diagnostic_codes {
    ($($variant:ident => $wire:literal),+ $(,)?) => {
        #[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
        pub enum CoreDiagnosticCodeV1 {
            $(#[serde(rename = $wire)] $variant,)+
        }
        impl CoreDiagnosticCodeV1 {
            pub const fn as_str(self) -> &'static str {
                match self { $(Self::$variant => $wire,)+ }
            }
        }
    };
}

diagnostic_codes! {
    ExtensionDuplicate => "semantic.extension-duplicate",
    ExtensionNamespaceInvalid => "semantic.extension-namespace-invalid",
    ExtensionOwnerMissing => "semantic.extension-owner-missing",
    ExtensionPayloadInvalid => "semantic.extension-payload-invalid",
    ExtensionSchemaVersionInvalid => "semantic.extension-schema-version-invalid",
    FractionNonCanonical => "semantic.fraction-non-canonical",
    FractionSignInvalid => "semantic.fraction-sign-invalid",
    IdDuplicate => "semantic.id-duplicate",
    IdEmpty => "semantic.id-empty",
    MeasureCoverageDuplicate => "semantic.measure-coverage-duplicate",
    MeasureCoverageMissing => "semantic.measure-coverage-missing",
    MeasureDurationInvalid => "semantic.measure-duration-invalid",
    MeasureReferenceMissing => "semantic.measure-reference-missing",
    MeasureRequired => "semantic.measure-required",
    MeterDenominatorInvalid => "semantic.meter-denominator-invalid",
    MeterNumeratorInvalid => "semantic.meter-numerator-invalid",
    NoteValueInvalid => "semantic.note-value-invalid",
    NotesRequired => "semantic.notes-required",
    PartRequired => "semantic.part-required",
    PickupExceedsMeasure => "semantic.pickup-exceeds-measure",
    SequenceExceedsMeasure => "semantic.sequence-exceeds-measure",
    SequenceStartOutOfBounds => "semantic.sequence-start-out-of-bounds",
    SoundingPitchInvalid => "semantic.sounding-pitch-invalid",
    StaffLineCountInvalid => "semantic.staff-line-count-invalid",
    StaffReferenceMissing => "semantic.staff-reference-missing",
    StaffRequired => "semantic.staff-required",
    TempoInvalid => "semantic.tempo-invalid",
    TimeArithmeticOverflow => "semantic.time-arithmetic-overflow",
    TranspositionInvalid => "semantic.transposition-invalid",
    VoiceRequired => "semantic.voice-required",
    WrittenPitchInvalid => "semantic.written-pitch-invalid",
    UnsupportedChord => "unsupported.chord",
    UnsupportedDots => "unsupported.dots",
    UnsupportedMeter => "unsupported.meter",
    UnsupportedNoteValueBase => "unsupported.note-value-base",
    UnsupportedPartCount => "unsupported.part-count",
    UnsupportedPickup => "unsupported.pickup",
    UnsupportedSequenceDuration => "unsupported.sequence-duration",
    UnsupportedSequenceStart => "unsupported.sequence-start",
    UnsupportedStaffCount => "unsupported.staff-count",
    UnsupportedTimeModification => "unsupported.time-modification",
    UnsupportedVoiceCount => "unsupported.voice-count",
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CoreDiagnosticV1 {
    pub code: CoreDiagnosticCodeV1,
    pub message_key: String,
    pub path: StablePathV1,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<BTreeMap<String, LosslessJsonValue>>,
}

impl CoreDiagnosticV1 {
    pub fn new(
        code: CoreDiagnosticCodeV1,
        path: StablePathV1,
        detail: Option<(&str, &JsString)>,
    ) -> Self {
        Self {
            code,
            message_key: format!("core.{}", code.as_str()),
            path,
            details: detail.map(|(key, value)| {
                BTreeMap::from([(key.to_owned(), LosslessJsonValue::String(value.clone()))])
            }),
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
pub struct SemanticReportV1 {
    pub ok: bool,
    pub diagnostics: Vec<CoreDiagnosticV1>,
}

impl crate::LosslessEncode for CoreDiagnosticCodeV1 {
    fn write_lossless<W: std::io::Write + ?Sized>(
        &self,
        writer: &mut W,
    ) -> Result<(), crate::LosslessJsonError> {
        self.as_str().write_lossless(writer)
    }
}

impl crate::LosslessEncode for CoreDiagnosticV1 {
    fn write_lossless<W: std::io::Write + ?Sized>(
        &self,
        writer: &mut W,
    ) -> Result<(), crate::LosslessJsonError> {
        let mut object = crate::LosslessObjectWriter::new(writer)?;
        object.field("code", &self.code)?;
        object.field("messageKey", &self.message_key)?;
        object.field("path", &self.path)?;
        if let Some(details) = &self.details {
            object.field("details", &DiagnosticDetails(details))?;
        }
        object.end()
    }
}

struct DiagnosticDetails<'a>(&'a BTreeMap<String, LosslessJsonValue>);

impl crate::LosslessEncode for DiagnosticDetails<'_> {
    fn write_lossless<W: std::io::Write + ?Sized>(
        &self,
        writer: &mut W,
    ) -> Result<(), crate::LosslessJsonError> {
        let mut object = crate::LosslessObjectWriter::new(writer)?;
        for (key, value) in self.0 {
            object.field(key, value)?;
        }
        object.end()
    }
}

impl crate::LosslessEncode for SemanticReportV1 {
    fn write_lossless<W: std::io::Write + ?Sized>(
        &self,
        writer: &mut W,
    ) -> Result<(), crate::LosslessJsonError> {
        let mut object = crate::LosslessObjectWriter::new(writer)?;
        object.field("ok", &self.ok)?;
        object.field("diagnostics", &self.diagnostics)?;
        object.end()
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum AssessmentFailureV1 {
    /// The caller did not supply the structural input required by the semantic
    /// API. This is separate from an accumulated musical diagnostic report.
    InvalidCandidateShape {
        path: StablePathV1,
    },
    DiagnosticLimit {
        limit: usize,
        actual: usize,
    },
    InternalCapacity,
}

pub(crate) fn append_diagnostic(
    diagnostics: &mut Vec<CoreDiagnosticV1>,
    code: CoreDiagnosticCodeV1,
    path: StablePathV1,
    detail: Option<(&str, &JsString)>,
) -> Result<(), AssessmentFailureV1> {
    if diagnostics.len() == CORE_ASSESSMENT_DIAGNOSTIC_LIMIT_V1 {
        return Err(AssessmentFailureV1::DiagnosticLimit {
            limit: CORE_ASSESSMENT_DIAGNOSTIC_LIMIT_V1,
            actual: CORE_ASSESSMENT_DIAGNOSTIC_LIMIT_V1 + 1,
        });
    }
    diagnostics
        .try_reserve(1)
        .map_err(|_| AssessmentFailureV1::InternalCapacity)?;
    diagnostics.push(CoreDiagnosticV1::new(code, path, detail));
    Ok(())
}
