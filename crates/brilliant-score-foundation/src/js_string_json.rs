//! Lossless string-token codec. It does not parse a document, decide shape or
//! resource-failure precedence, or replace the production strict JSON codec.

use std::{
    fmt,
    io::{self, Write},
};

use brilliant_core_types::JsString;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct JsStringTokenError {
    pub byte_offset: usize,
}

impl fmt::Display for JsStringTokenError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            formatter,
            "invalid JSON string token at byte {}",
            self.byte_offset
        )
    }
}

impl std::error::Error for JsStringTokenError {}

/// Decode exactly one quoted token, without surrounding whitespace. The `str`
/// input requires valid UTF-8 wire bytes; escaped UTF-16 units need not be paired.
pub fn decode_js_string_token(token: &str) -> Result<JsString, JsStringTokenError> {
    let mut units = Vec::new();
    let end = visit_js_string_prefix(token, |unit| units.push(unit))?;
    if end != token.len() {
        return Err(JsStringTokenError { byte_offset: end });
    }
    Ok(JsString::from_utf16(units))
}

/// Recognize a bounded ASCII token without allocating discarded user text.
/// Oversized/non-ASCII text returns None, but the complete token is validated.
pub fn decode_js_string_ascii_token<'a>(
    token: &str,
    buffer: &'a mut [u8],
) -> Result<Option<&'a str>, JsStringTokenError> {
    let mut length = 0_usize;
    let mut fits = true;
    let end = visit_js_string_prefix(token, |unit| {
        if unit <= 127 && length < buffer.len() {
            buffer[length] = unit as u8;
            length += 1;
        } else {
            fits = false;
        }
    })?;
    if end != token.len() {
        return Err(JsStringTokenError { byte_offset: end });
    }
    Ok(fits.then(|| std::str::from_utf8(&buffer[..length]).expect("ASCII token")))
}

// Shared by token decoding and the streaming document lexer. An ignored string
// is still validated, but its text need not be allocated after a resource fault.
pub(crate) fn visit_js_string_prefix(
    token: &str,
    mut emit: impl FnMut(u16),
) -> Result<usize, JsStringTokenError> {
    let bytes = token.as_bytes();
    let invalid = |byte_offset| JsStringTokenError { byte_offset };
    if bytes.first() != Some(&b'"') {
        return Err(invalid(0));
    }
    let mut index = 1;
    while index < bytes.len() {
        match bytes[index] {
            b'"' => {
                return Ok(index + 1);
            }
            b'\\' => {
                index += 1;
                let escaped = *bytes.get(index).ok_or_else(|| invalid(index))?;
                let unit = match escaped {
                    b'"' | b'\\' | b'/' => u16::from(escaped),
                    b'b' => 8,
                    b'f' => 12,
                    b'n' => 10,
                    b'r' => 13,
                    b't' => 9,
                    b'u' => {
                        let mut unit = 0_u16;
                        for _ in 0..4 {
                            index += 1;
                            let digit = *bytes.get(index).ok_or_else(|| invalid(index))?;
                            let hex = match digit {
                                b'0'..=b'9' => digit - b'0',
                                b'a'..=b'f' => digit - b'a' + 10,
                                b'A'..=b'F' => digit - b'A' + 10,
                                _ => return Err(invalid(index)),
                            };
                            unit = (unit << 4) | u16::from(hex);
                        }
                        unit
                    }
                    _ => return Err(invalid(index)),
                };
                emit(unit);
                index += 1;
            }
            0..=31 => return Err(invalid(index)),
            32..=127 => {
                emit(u16::from(bytes[index]));
                index += 1;
            }
            _ => {
                let character = token[index..]
                    .chars()
                    .next()
                    .expect("UTF-8 character boundary");
                let mut buffer = [0; 2];
                for unit in character.encode_utf16(&mut buffer) {
                    emit(*unit);
                }
                index += character.len_utf8();
            }
        }
    }
    Err(invalid(index))
}

fn visit_json<E>(value: &JsString, mut emit: impl FnMut(&[u8]) -> Result<(), E>) -> Result<(), E> {
    emit(b"\"")?;
    for decoded in char::decode_utf16(value.code_units().iter().copied()) {
        match decoded {
            Ok('"') => emit(b"\\\"")?,
            Ok('\\') => emit(b"\\\\")?,
            Ok('\u{8}') => emit(b"\\b")?,
            Ok('\u{c}') => emit(b"\\f")?,
            Ok('\n') => emit(b"\\n")?,
            Ok('\r') => emit(b"\\r")?,
            Ok('\t') => emit(b"\\t")?,
            Ok(character) if character > '\u{1f}' => {
                let mut bytes = [0; 4];
                emit(character.encode_utf8(&mut bytes).as_bytes())?;
            }
            other => {
                let unit = match other {
                    Ok(character) => character as u16,
                    Err(error) => error.unpaired_surrogate(),
                };
                let hex = b"0123456789abcdef";
                emit(&[
                    b'\\',
                    b'u',
                    hex[usize::from(unit >> 12)],
                    hex[usize::from((unit >> 8) & 15)],
                    hex[usize::from((unit >> 4) & 15)],
                    hex[usize::from(unit & 15)],
                ])?;
            }
        }
    }
    emit(b"\"")
}

/// Exact JSON wire size, including quotes. Internal UTF-16 storage and original
/// request bytes are separate measures. No encoded output is allocated here.
pub fn js_string_json_len(value: &JsString) -> Option<usize> {
    let mut length = 0_usize;
    visit_json(value, |bytes| -> Result<(), ()> {
        length = length.checked_add(bytes.len()).ok_or(())?;
        Ok(())
    })
    .ok()?;
    Some(length)
}

/// Stream a JSON string with JavaScript's well-formed JSON.stringify escaping.
/// Writer errors propagate; the caller must discard any partial output.
pub fn write_js_string_json<W: Write + ?Sized>(value: &JsString, writer: &mut W) -> io::Result<()> {
    visit_json(value, |bytes| writer.write_all(bytes))
}

#[cfg(test)]
mod tests;
