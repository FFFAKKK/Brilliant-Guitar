#![forbid(unsafe_code)]

mod assessment;
mod candidate;
mod codec;
mod diagnostics;
mod dto;
mod dto_assessment;
mod feature_profile;
mod fraction;
mod js_string_json;
mod lossless_dto;
mod lossless_json;
mod music_rules;
mod profile_pages;
mod rule_warnings;
mod validation;

pub use assessment::{
    assess_score_semantics, assess_score_semantics_node, assess_score_semantics_node_observed,
};
pub use candidate::AssessmentNodeV1;
pub use candidate::AssessmentWorkV1;
pub use codec::{
    FoundationDecodeFailure, canonical_score_bytes, decode_lossless_score_document_value,
    decode_score_document_value, finite_number_json_len, write_canonical_score_document,
};
pub use diagnostics::{
    AssessmentFailureV1, CORE_ASSESSMENT_DIAGNOSTIC_LIMIT_V1, CoreDiagnosticCodeV1,
    CoreDiagnosticV1, SemanticReportV1,
};
pub use dto::*;
pub use dto_assessment::{
    DocumentAssessmentNodeV1, DocumentCaptureFailureV1, check_document_capture_limits,
};
pub use feature_profile::{
    CardinalityConstraintV1, ProfileMeterV1, ScoreFeatureProfileV1, ScoreSupportV1,
    assess_score_profile, assess_score_profile_node, classify_valid_score_profile_node,
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
    decode_js_value_json, decode_lossless_json, write_lossless_json,
};
pub use music_rules::{
    assess_measure_duration, assess_note_duration, meter_denominator_is_valid, tempo_is_valid,
    written_pitch_is_valid,
};
pub use profile_pages::{
    CORE_PROFILE_PAGE_LIMIT_V2, ProfilePageFailureV2, ScoreSupportPageV2, ScoreSupportStatusV2,
    ScoreSupportSummaryV2, assess_score_profile_page_v2, assess_score_profile_summary_v2,
    classify_valid_score_profile_summary_v2,
};
pub use rule_warnings::{
    CORE_RULE_WARNING_PAGE_LIMIT_V1, CORE_RULE_WARNING_PAGE_LIMIT_V2, CoreRuleWarningCodeV1,
    CoreRuleWarningCodeV2, CoreRuleWarningDetailsV2, CoreRuleWarningLocationV2, CoreRuleWarningV1,
    CoreRuleWarningV2, CoreSoundingPitchWarningReasonV2, RuleWarningPageFailureV1,
    RuleWarningPageFailureV2, ScoreRuleWarningPageV1, ScoreRuleWarningPageV2,
    assess_score_rule_warning_page_v1, assess_score_rule_warning_page_v2,
};
