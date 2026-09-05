//! Lossless JSON syntax and bounded data-tree encoding. Contracts can consume the
//! token stream with its own shape/path/failure ranking instead of materializing
//! a second tree or adopting this convenience decoder's error policy.

use std::{collections::BTreeMap, fmt, io::Write};

use brilliant_core_types::{
    CoreTypeFailure, FiniteNumber, JSON_DEPTH_LIMIT, JSON_PROPERTY_LIMIT, JsString,
    LosslessJsonValue,
};
use serde_json::Number;

use crate::{decode_js_string_token, js_string_json::visit_js_string_prefix, write_js_string_json};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct JsonSyntaxError {
    pub byte_offset: usize,
}

impl fmt::Display for JsonSyntaxError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "invalid JSON at byte {}", self.byte_offset)
    }
}
impl std::error::Error for JsonSyntaxError {}

#[derive(Clone, Debug, PartialEq)]
pub enum JsonTokenKind<'a> {
    Null,
    Bool(bool),
    Number(Number),
    String(&'a str),
    Key(&'a str),
    BeginArray,
    EndArray,
    BeginObject,
    EndObject,
}

#[derive(Clone, Debug, PartialEq)]
pub struct JsonToken<'a> {
    pub kind: JsonTokenKind<'a>,
    pub byte_offset: usize,
    /// Root value is depth 1. Key/end tokens have their owner's depth.
    pub depth: usize,
}

#[derive(Clone, Copy)]
enum Frame {
    ArrayFirst,
    ArrayNext,
    ArrayAfter,
    ObjectFirst,
    ObjectNext,
    ObjectColon,
    ObjectAfter,
}

/// A terminal-on-error syntax stream over already UTF-8-validated input. String
/// tokens borrow their complete quoted source; skipped strings allocate nothing.
/// The syntax nesting ceiling equals the legacy serde_json default (127 open
/// containers); the lower 64-value semantic limit is a consumer responsibility.
pub struct LosslessJsonTokens<'a> {
    text: &'a str,
    offset: usize,
    frames: Vec<Frame>,
    root_started: bool,
    terminal: bool,
}

impl<'a> LosslessJsonTokens<'a> {
    pub fn new(text: &'a str) -> Self {
        Self {
            text,
            offset: 0,
            frames: Vec::new(),
            root_started: false,
            terminal: false,
        }
    }

    fn error(&self) -> JsonSyntaxError {
        JsonSyntaxError {
            byte_offset: self.offset,
        }
    }

    fn whitespace(&mut self) {
        while self
            .text
            .as_bytes()
            .get(self.offset)
            .is_some_and(|byte| matches!(byte, b' ' | b'\t' | b'\r' | b'\n'))
        {
            self.offset += 1;
        }
    }

    fn token(&self, kind: JsonTokenKind<'a>, byte_offset: usize, depth: usize) -> JsonToken<'a> {
        JsonToken {
            kind,
            byte_offset,
            depth,
        }
    }

    fn string(&mut self) -> Result<&'a str, JsonSyntaxError> {
        let start = self.offset;
        let length = visit_js_string_prefix(&self.text[start..], |_| {}).map_err(|error| {
            JsonSyntaxError {
                byte_offset: start + error.byte_offset,
            }
        })?;
        self.offset += length;
        Ok(&self.text[start..self.offset])
    }

    fn value(&mut self) -> Result<JsonToken<'a>, JsonSyntaxError> {
        self.whitespace();
        let start = self.offset;
        let depth = self.frames.len() + 1;
        let byte = *self
            .text
            .as_bytes()
            .get(start)
            .ok_or_else(|| self.error())?;
        let kind = match byte {
            b'[' | b'{' => {
                if self.frames.len() >= 127 {
                    return Err(self.error());
                }
                self.frames.push(if byte == b'[' {
                    Frame::ArrayFirst
                } else {
                    Frame::ObjectFirst
                });
                self.offset += 1;
                if byte == b'[' {
                    JsonTokenKind::BeginArray
                } else {
                    JsonTokenKind::BeginObject
                }
            }
            b'"' => JsonTokenKind::String(self.string()?),
            b'n' | b't' | b'f' => {
                let (literal, kind) = match byte {
                    b'n' => ("null", JsonTokenKind::Null),
                    b't' => ("true", JsonTokenKind::Bool(true)),
                    _ => ("false", JsonTokenKind::Bool(false)),
                };
                if !self.text[start..].starts_with(literal) {
                    return Err(self.error());
                }
                self.offset += literal.len();
                kind
            }
            b'-' | b'0'..=b'9' => {
                while self.text.as_bytes().get(self.offset).is_some_and(|byte| {
                    matches!(byte, b'-' | b'+' | b'.' | b'e' | b'E' | b'0'..=b'9')
                }) {
                    self.offset += 1;
                }
                let number = serde_json::from_str(&self.text[start..self.offset])
                    .map_err(|_| JsonSyntaxError { byte_offset: start })?;
                JsonTokenKind::Number(number)
            }
            _ => return Err(self.error()),
        };
        Ok(self.token(kind, start, depth))
    }

    fn end_container(&mut self, array: bool) -> JsonToken<'a> {
        let start = self.offset;
        let depth = self.frames.len();
        self.offset += 1;
        self.frames.pop();
        self.token(
            if array {
                JsonTokenKind::EndArray
            } else {
                JsonTokenKind::EndObject
            },
            start,
            depth,
        )
    }

    fn next_inner(&mut self) -> Result<Option<JsonToken<'a>>, JsonSyntaxError> {
        loop {
            self.whitespace();
            let byte = self.text.as_bytes().get(self.offset).copied();
            let Some(frame) = self.frames.last().copied() else {
                if self.root_started {
                    return if byte.is_none() {
                        Ok(None)
                    } else {
                        Err(self.error())
                    };
                }
                self.root_started = true;
                return self.value().map(Some);
            };
            match frame {
                Frame::ArrayFirst | Frame::ArrayNext => {
                    if matches!(frame, Frame::ArrayFirst) && byte == Some(b']') {
                        return Ok(Some(self.end_container(true)));
                    }
                    *self.frames.last_mut().expect("array frame") = Frame::ArrayAfter;
                    return self.value().map(Some);
                }
                Frame::ObjectFirst | Frame::ObjectNext => {
                    if matches!(frame, Frame::ObjectFirst) && byte == Some(b'}') {
                        return Ok(Some(self.end_container(false)));
                    }
                    if byte != Some(b'"') {
                        return Err(self.error());
                    }
                    let start = self.offset;
                    let key = self.string()?;
                    *self.frames.last_mut().expect("object frame") = Frame::ObjectColon;
                    return Ok(Some(self.token(
                        JsonTokenKind::Key(key),
                        start,
                        self.frames.len(),
                    )));
                }
                Frame::ObjectColon => {
                    if byte != Some(b':') {
                        return Err(self.error());
                    }
                    self.offset += 1;
                    *self.frames.last_mut().expect("object frame") = Frame::ObjectAfter;
                    return self.value().map(Some);
                }
                Frame::ArrayAfter | Frame::ObjectAfter => {
                    let array = matches!(frame, Frame::ArrayAfter);
                    if byte == Some(if array { b']' } else { b'}' }) {
                        return Ok(Some(self.end_container(array)));
                    }
                    if byte != Some(b',') {
                        return Err(self.error());
                    }
                    self.offset += 1;
                    *self.frames.last_mut().expect("container frame") = if array {
                        Frame::ArrayNext
                    } else {
                        Frame::ObjectNext
                    };
                }
            }
        }
    }
}

impl<'a> Iterator for LosslessJsonTokens<'a> {
    type Item = Result<JsonToken<'a>, JsonSyntaxError>;
    fn next(&mut self) -> Option<Self::Item> {
        if self.terminal {
            return None;
        }
        match self.next_inner() {
            Ok(Some(token)) => Some(Ok(token)),
            Ok(None) => {
                self.terminal = true;
                None
            }
            Err(error) => {
                self.terminal = true;
                Some(Err(error))
            }
        }
    }
}

#[derive(Debug)]
pub enum LosslessJsonError {
    Syntax(JsonSyntaxError),
    Limit(CoreTypeFailure),
    DuplicateKey { byte_offset: usize },
    Write(std::io::Error),
    Number(serde_json::Error),
}

enum Building {
    Array(Vec<LosslessJsonValue>),
    Object {
        values: BTreeMap<JsString, LosslessJsonValue>,
        key: Option<JsString>,
    },
}

fn attach(value: LosslessJsonValue, frames: &mut [Building], root: &mut Option<LosslessJsonValue>) {
    match frames.last_mut() {
        Some(Building::Array(values)) => values.push(value),
        Some(Building::Object { values, key }) => {
            values.insert(key.take().expect("validated object key"), value);
        }
        None => {
            *root = Some(value);
        }
    }
}

/// Decode a bounded, data-only value. Syntax is checked through the full input;
/// after a resource or duplicate fault, no further data tree or string is retained.
/// Failure precedence here is syntax, depth, properties, duplicate. Contracts
/// must use the token stream for its additional canonical shape/path policy.
pub fn decode_lossless_json(text: &str) -> Result<LosslessJsonValue, LosslessJsonError> {
    decode_with_limits(text, JSON_DEPTH_LIMIT, JSON_PROPERTY_LIMIT)
}

fn decode_with_limits(
    text: &str,
    depth_limit: usize,
    property_limit: usize,
) -> Result<LosslessJsonValue, LosslessJsonError> {
    let mut frames = Vec::new();
    let mut root = None;
    let mut count = 0_usize;
    let mut depth_fault = None;
    let mut property_fault = false;
    let mut duplicate = None;
    for token in LosslessJsonTokens::new(text) {
        let token = token.map_err(LosslessJsonError::Syntax)?;
        if !matches!(
            token.kind,
            JsonTokenKind::Key(_) | JsonTokenKind::EndArray | JsonTokenKind::EndObject
        ) {
            count = count.saturating_add(1);
            if token.depth > depth_limit && depth_fault.is_none() {
                depth_fault = Some(token.depth);
            }
            property_fault |= count > property_limit;
        }
        if depth_fault.is_some() || property_fault || duplicate.is_some() {
            frames.clear();
            root = None;
            continue;
        }
        let value = match token.kind {
            JsonTokenKind::BeginArray => {
                frames.push(Building::Array(Vec::new()));
                continue;
            }
            JsonTokenKind::BeginObject => {
                frames.push(Building::Object {
                    values: BTreeMap::new(),
                    key: None,
                });
                continue;
            }
            JsonTokenKind::EndArray | JsonTokenKind::EndObject => {
                match frames.pop().expect("balanced syntax") {
                    Building::Array(values) => LosslessJsonValue::Array(values),
                    Building::Object { values, .. } => LosslessJsonValue::Object(values),
                }
            }
            JsonTokenKind::Key(raw) => {
                let decoded = decode_js_string_token(raw).expect("validated string token");
                let Some(Building::Object { values, key }) = frames.last_mut() else {
                    unreachable!("validated object key")
                };
                if values.contains_key(&decoded) {
                    duplicate = Some(token.byte_offset);
                    frames.clear();
                    root = None;
                } else {
                    *key = Some(decoded);
                }
                continue;
            }
            JsonTokenKind::String(raw) => LosslessJsonValue::String(
                decode_js_string_token(raw).expect("validated string token"),
            ),
            JsonTokenKind::Null => LosslessJsonValue::Null,
            JsonTokenKind::Bool(value) => LosslessJsonValue::Bool(value),
            JsonTokenKind::Number(value) => LosslessJsonValue::Number(
                FiniteNumber::new(value.as_f64().expect("finite JSON number"))
                    .expect("finite JSON number"),
            ),
        };
        attach(value, &mut frames, &mut root);
    }
    if let Some(actual) = depth_fault {
        return Err(LosslessJsonError::Limit(CoreTypeFailure::JsonDepthLimit {
            actual,
        }));
    }
    if property_fault {
        return Err(LosslessJsonError::Limit(
            CoreTypeFailure::JsonPropertyLimit {
                actual: property_limit.saturating_add(1),
            },
        ));
    }
    if let Some(byte_offset) = duplicate {
        return Err(LosslessJsonError::DuplicateKey { byte_offset });
    }
    Ok(root.expect("one complete syntax value"))
}

pub fn write_lossless_json<W: Write + ?Sized>(
    value: &LosslessJsonValue,
    writer: &mut W,
) -> Result<(), LosslessJsonError> {
    value.validate_limits().map_err(LosslessJsonError::Limit)?;
    write_value(value, writer)
}

fn write_value<W: Write + ?Sized>(
    value: &LosslessJsonValue,
    writer: &mut W,
) -> Result<(), LosslessJsonError> {
    match value {
        LosslessJsonValue::Null => writer.write_all(b"null").map_err(LosslessJsonError::Write),
        LosslessJsonValue::Bool(value) => writer
            .write_all(if *value { b"true" } else { b"false" })
            .map_err(LosslessJsonError::Write),
        LosslessJsonValue::Number(value) => {
            serde_json::to_writer(writer, value).map_err(LosslessJsonError::Number)
        }
        LosslessJsonValue::String(value) => {
            write_js_string_json(value, writer).map_err(LosslessJsonError::Write)
        }
        LosslessJsonValue::Array(values) => {
            writer.write_all(b"[").map_err(LosslessJsonError::Write)?;
            for (index, value) in values.iter().enumerate() {
                if index != 0 {
                    writer.write_all(b",").map_err(LosslessJsonError::Write)?;
                }
                write_value(value, writer)?;
            }
            writer.write_all(b"]").map_err(LosslessJsonError::Write)
        }
        LosslessJsonValue::Object(values) => {
            writer.write_all(b"{").map_err(LosslessJsonError::Write)?;
            for (index, (key, value)) in values.iter().enumerate() {
                if index != 0 {
                    writer.write_all(b",").map_err(LosslessJsonError::Write)?;
                }
                write_js_string_json(key, writer).map_err(LosslessJsonError::Write)?;
                writer.write_all(b":").map_err(LosslessJsonError::Write)?;
                write_value(value, writer)?;
            }
            writer.write_all(b"}").map_err(LosslessJsonError::Write)
        }
    }
}

#[cfg(test)]
mod tests;
