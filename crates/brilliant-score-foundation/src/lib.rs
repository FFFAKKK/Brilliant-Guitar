#![forbid(unsafe_code)]

mod codec;
mod dto;
mod fraction;
mod validation;

pub use codec::{
    FoundationDecodeFailure, canonical_score_bytes, decode_score_document_value,
    finite_number_json_len,
};
pub use dto::*;
pub use fraction::{ExactFraction, ExactFractionError};
