#![forbid(unsafe_code)]

mod failure;
mod finite_number;
mod js_string;
mod json;
mod scalar;

pub use failure::CoreTypeFailure;
pub use finite_number::FiniteNumber;
pub use js_string::JsString;
pub use json::{
    BoundedJsonValue, JSON_DEPTH_LIMIT, JSON_PROPERTY_LIMIT, LosslessJsonValue,
    StablePathSegmentV1, StablePathV1,
};
pub use scalar::{
    API_VERSION_V1, DOCUMENT_VERSION_INITIAL, DocumentVersionV1, JS_SAFE_INTEGER_MAX, SafeInteger,
    ScoreSchemaVersionV1, StableId,
};
