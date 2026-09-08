#![forbid(unsafe_code)]

mod assessment;
mod candidate;
mod codec;
mod diagnostics;
mod dto;
mod feature_profile;
mod fraction;
mod js_string_json;
mod lossless_dto;
mod lossless_json;
mod music_rules;
mod validation;

pub use assessment::{assess_score_semantics, assess_score_semantics_node};
pub use candidate::AssessmentNodeV1;
pub use codec::{
    FoundationDecodeFailure, canonical_score_bytes, decode_lossless_score_document_value,
    decode_score_document_value, finite_number_json_len,
};
pub use diagnostics::{
    AssessmentFailureV1, CORE_ASSESSMENT_DIAGNOSTIC_LIMIT_V1, CoreDiagnosticCodeV1,
    CoreDiagnosticV1, SemanticReportV1,
};
pub use dto::*;
pub use feature_profile::{
    CardinalityConstraintV1, ProfileMeterV1, ScoreFeatureProfileV1, ScoreSupportV1,
    assess_score_profile, assess_score_profile_node,
};
pub use fraction::{ExactFraction, ExactFractionError};
pub use js_string_json::{
    JsStringTokenError, decode_js_string_ascii_token, decode_js_string_token, js_string_json_len,
    write_js_string_json,
};
pub use lossless_dto::{
    LosslessDecode, LosslessEncode, LosslessText, LosslessValueError, LosslessValueFailure,
    LosslessValuePath, ObjectReader as LosslessObjectReader, ObjectWriter as LosslessObjectWriter,
    with_json_field_key,
};
pub use lossless_json::{
    JsonSyntaxError, JsonToken, JsonTokenKind, LosslessJsonError, LosslessJsonTokens,
    decode_lossless_json, write_lossless_json,
};
pub use music_rules::{
    assess_measure_duration, assess_note_duration, assess_sounding_pitch,
    meter_denominator_is_valid, tempo_is_valid, written_pitch_is_valid,
};
