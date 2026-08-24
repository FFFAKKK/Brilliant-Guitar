#![forbid(unsafe_code)]

mod codec;
mod dto;
mod fraction;
mod validation;

pub use codec::{FoundationDecodeFailure, canonical_score_bytes, decode_score_document_value};
pub use dto::*;
pub use fraction::{ExactFraction, ExactFractionError};
