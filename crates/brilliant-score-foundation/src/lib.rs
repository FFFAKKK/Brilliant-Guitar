#![forbid(unsafe_code)]

mod assessment;
mod candidate;
mod codec;
mod diagnostics;
mod dto;
mod feature_profile;
mod fraction;
mod music_rules;
mod validation;

pub use assessment::assess_score_semantics;
pub use codec::{
    FoundationDecodeFailure, canonical_score_bytes, decode_score_document_value,
    finite_number_json_len,
};
pub use diagnostics::{
    AssessmentFailureV1, CORE_ASSESSMENT_DIAGNOSTIC_LIMIT_V1, CoreDiagnosticCodeV1,
    CoreDiagnosticV1, SemanticReportV1,
};
pub use dto::*;
pub use feature_profile::{
    CardinalityConstraintV1, ProfileMeterV1, ScoreFeatureProfileV1, ScoreSupportV1,
    assess_score_profile,
};
pub use fraction::{ExactFraction, ExactFractionError};
