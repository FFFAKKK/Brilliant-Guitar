//! One request capture over Foundation syntax, with Contracts' existing policy.
use super::*;
use brilliant_core_types::JsonObject;
use brilliant_core_types::{FiniteNumber, JsString, LosslessJsonValue};
use brilliant_score_foundation::{
    JsonTokenKind, LosslessJsonTokens, decode_js_string_ascii_token, decode_js_string_token,
    with_json_field_key,
};

pub(super) trait CapturedValueExt {
    fn into_object(self) -> Option<JsonObject<JsString, Self>>
    where
        Self: Sized;
    fn into_array(self) -> Option<Vec<Self>>
    where
        Self: Sized;
    fn as_object(&self) -> Option<&JsonObject<JsString, Self>>
    where
        Self: Sized;
    fn as_array(&self) -> Option<&[Self]>
    where
        Self: Sized;
    fn as_text(&self) -> Option<&JsString>;
    fn as_i64(&self) -> Option<i64>;
    fn as_u64(&self) -> Option<u64>;
    fn is_null(&self) -> bool;
    fn get_ascii(&self, field: &str) -> Option<&Self>;
}
impl CapturedValueExt for LosslessJsonValue {
    fn into_object(self) -> Option<JsonObject<JsString, Self>> {
        if let Self::Object(values) = self {
            Some(values)
        } else {
            None
        }
    }
    fn into_array(self) -> Option<Vec<Self>> {
        if let Self::Array(values) = self {
            Some(values)
        } else {
            None
        }
    }
    fn as_object(&self) -> Option<&JsonObject<JsString, Self>> {
        if let Self::Object(values) = self {
            Some(values)
        } else {
            None
        }
    }
    fn as_array(&self) -> Option<&[Self]> {
        if let Self::Array(values) = self {
            Some(values)
        } else {
            None
        }
    }
    fn as_text(&self) -> Option<&JsString> {
        if let Self::String(value) = self {
            Some(value)
        } else {
            None
        }
    }
    fn as_i64(&self) -> Option<i64> {
        if let Self::Number(number) = self {
            let value = number.get();
            (value.fract() == 0.0 && value.abs() <= JS_SAFE_INTEGER_MAX as f64)
                .then_some(value as i64)
        } else {
            None
        }
    }
    fn as_u64(&self) -> Option<u64> {
        self.as_i64().and_then(|value| u64::try_from(value).ok())
    }
    fn is_null(&self) -> bool {
        matches!(self, Self::Null)
    }
    fn get_ascii(&self, field: &str) -> Option<&Self> {
        self.as_object()?.get_ascii(field)
    }
}

pub(super) trait CapturedObjectExt<V> {
    fn get_ascii(&self, field: &str) -> Option<&V>;
    fn contains_ascii(&self, field: &str) -> bool;
    fn at_ascii(&self, field: &str) -> &V;
}
impl<V> CapturedObjectExt<V> for JsonObject<JsString, V> {
    fn get_ascii(&self, field: &str) -> Option<&V> {
        with_json_field_key(field, |key| self.get(key))
    }
    fn contains_ascii(&self, field: &str) -> bool {
        self.get_ascii(field).is_some()
    }
    fn at_ascii(&self, field: &str) -> &V {
        self.get_ascii(field).expect("validated JSON field")
    }
}

pub(super) fn known_tag(text: &JsString) -> &'static str {
    [
        "rest",
        "notes",
        "score",
        "part",
        "document",
        "measure",
        "staff",
        "voice",
        "event",
        "note",
        "submit",
        "undo",
        "redo",
        "mark-persisted",
        "read",
        "select",
        "start",
        "none",
        "inherit-default",
    ]
    .into_iter()
    .find(|literal| text.eq_ascii(literal))
    .unwrap_or("")
}

fn canonical_key(key: &JsString) -> Option<&'static str> {
    let mut buffer = [0_u8; 64];
    if key.len() > buffer.len() {
        return None;
    }
    for (out, unit) in buffer.iter_mut().zip(key.code_units()) {
        if *unit > 127 {
            return None;
        }
        *out = *unit as u8;
    }
    canonical_field(std::str::from_utf8(&buffer[..key.len()]).expect("ASCII field"))
}

struct Pending {
    key: Option<JsString>,
    path: CanonicalPath,
    retain: bool,
}
enum Container {
    Array {
        values: Vec<StrictValue>,
        next_index: usize,
    },
    Object {
        values: JsonObject<JsString, StrictValue>,
        pending: Option<Pending>,
    },
}
struct Frame {
    path: CanonicalPath,
    retain: bool,
    container: Container,
}

fn attach(
    frames: &mut [Frame],
    root: &mut Option<StrictValue>,
    value: Option<StrictValue>,
    state: &mut StrictState,
) {
    let Some(frame) = frames.last_mut() else {
        #[cfg(test)]
        if value.is_some() && !state.can_retain() {
            state.metrics.post_limit_retained += 1;
        }
        *root = value;
        return;
    };
    match &mut frame.container {
        Container::Array { values, .. } => {
            if let Some(value) = value {
                values.push(value);
                #[cfg(test)]
                {
                    state.metrics.unique_retained += 1;
                    state.metrics.post_limit_retained += u64::from(!state.can_retain());
                }
            }
        }
        Container::Object { values, pending } => {
            let pending = pending.take().expect("syntax stream has an object key");
            if let (Some(key), Some(value)) = (pending.key, value) {
                values.insert(key, value);
                #[cfg(test)]
                {
                    state.metrics.unique_retained += 1;
                    state.metrics.post_limit_retained += u64::from(!state.can_retain());
                }
            }
        }
    }
    #[cfg(not(test))]
    let _ = state;
}

pub(super) fn strict_json(
    bytes: &[u8],
) -> Result<(Option<StrictValue>, StrictState), StableFailureV1> {
    let text = std::str::from_utf8(bytes).map_err(|_| StableFailureV1::CodecInvalidUtf8)?;
    let mut state = StrictState::default();
    let mut frames: Vec<Frame> = Vec::new();
    // Only the closed protocol field vocabulary is shared. Arbitrary user
    // keys are never interned or kept alive by this request-local cache.
    let mut field_keys: std::collections::BTreeMap<&'static str, JsString> =
        std::collections::BTreeMap::new();
    let mut root = None;
    for token in LosslessJsonTokens::new(text) {
        let token = token.map_err(|_| StableFailureV1::CodecInvalidJson)?;
        match token.kind {
            JsonTokenKind::Key(raw) => {
                let frame = frames.last_mut().expect("object key owner");
                let Container::Object { values, pending } = &mut frame.container else {
                    unreachable!("syntax key owner")
                };
                #[cfg(test)]
                {
                    state.metrics.members_visited += 1;
                }
                let retain = frame.retain && state.can_retain();
                let (key, canonical) = if retain {
                    // The syntax stream already validated the complete token.
                    // An exact vocabulary literal cannot contain an escape.
                    if let Some(field) = canonical_field(&raw[1..raw.len() - 1]) {
                        let key = field_keys.entry(field).or_insert_with(|| field.into());
                        (Some(key.clone()), Some(field))
                    } else {
                        let key = decode_js_string_token(raw)
                            .map_err(|_| StableFailureV1::CodecInvalidJson)?;
                        let canonical = canonical_key(&key);
                        (Some(key), canonical)
                    }
                } else {
                    let mut buffer = [0; 64];
                    let canonical = decode_js_string_ascii_token(raw, &mut buffer)
                        .map_err(|_| StableFailureV1::CodecInvalidJson)?
                        .and_then(canonical_field);
                    (None, canonical)
                };
                let path =
                    canonical.map_or_else(|| frame.path.clone(), |field| frame.path.field(field));
                let duplicate = key.as_ref().is_some_and(|key| values.contains_key(key));
                if duplicate {
                    state.record_shape(2, path.clone(), ShapeViolationV1::DuplicateField);
                    #[cfg(test)]
                    {
                        state.metrics.duplicate_discarded += 1;
                    }
                }
                *pending = Some(Pending {
                    key,
                    path,
                    retain: retain && !duplicate,
                });
                continue;
            }
            JsonTokenKind::EndArray | JsonTokenKind::EndObject => {
                let frame = frames.pop().expect("syntax container owner");
                let value = if frame.retain && state.can_retain() {
                    Some(match frame.container {
                        Container::Array { values, .. } => StrictValue::Array(values),
                        Container::Object { values, .. } => StrictValue::Object(values),
                    })
                } else {
                    None
                };
                attach(&mut frames, &mut root, value, &mut state);
                continue;
            }
            _ => {}
        }
        let (path, parent_retain) = match frames.last_mut() {
            None => (CanonicalPath::default(), true),
            Some(Frame {
                path,
                retain,
                container: Container::Array { next_index, .. },
            }) => {
                let child = path.index(*next_index);
                *next_index = next_index.saturating_add(1);
                #[cfg(test)]
                {
                    state.metrics.members_visited += 1;
                }
                (child, *retain)
            }
            Some(Frame {
                container: Container::Object { pending, .. },
                ..
            }) => {
                let pending = pending.as_mut().expect("object value key");
                // Attachment needs only the key; move the value path instead
                // of allocating another copy for every object member.
                (std::mem::take(&mut pending.path), pending.retain)
            }
        };
        let was_retaining = state.can_retain();
        let state_retain = state.observe_value(token.depth, &path);
        if was_retaining && !state_retain {
            // Keep paths/indexes for later higher-priority faults, release data.
            for frame in &mut frames {
                match &mut frame.container {
                    Container::Array { values, .. } => values.clear(),
                    Container::Object { values, pending } => {
                        values.clear();
                        if let Some(pending) = pending {
                            pending.key = None;
                        }
                    }
                }
            }
        }
        let retain = parent_retain && state_retain;
        let value = match token.kind {
            JsonTokenKind::BeginArray => {
                frames.push(Frame {
                    path,
                    retain,
                    container: Container::Array {
                        values: Vec::new(),
                        next_index: 0,
                    },
                });
                continue;
            }
            JsonTokenKind::BeginObject => {
                frames.push(Frame {
                    path,
                    retain,
                    container: Container::Object {
                        values: JsonObject::new(),
                        pending: None,
                    },
                });
                continue;
            }
            JsonTokenKind::Null => retain.then_some(StrictValue::Null),
            JsonTokenKind::Bool(value) => retain.then_some(StrictValue::Bool(value)),
            JsonTokenKind::Number(number) => {
                if retain
                    && token.depth == 2
                    && path.0 == [CanonicalPathSegment::Field("apiVersion")]
                {
                    state.root_api_integer = number.as_u64().or_else(|| {
                        let value = number.as_f64()?;
                        (number.is_f64()
                            && value.fract() == 0.0
                            && value >= 0.0
                            && value <= JS_SAFE_INTEGER_MAX as f64)
                            .then_some(value as u64)
                    });
                }
                retain.then(|| {
                    StrictValue::Number(
                        FiniteNumber::new(number.as_f64().expect("finite syntax number"))
                            .expect("finite syntax number"),
                    )
                })
            }
            JsonTokenKind::String(raw) => {
                if retain {
                    Some(StrictValue::String(
                        decode_js_string_token(raw)
                            .map_err(|_| StableFailureV1::CodecInvalidJson)?,
                    ))
                } else {
                    None
                }
            }
            JsonTokenKind::Key(_) | JsonTokenKind::EndArray | JsonTokenKind::EndObject => {
                unreachable!("handled container token")
            }
        };
        attach(&mut frames, &mut root, value, &mut state);
    }
    Ok((root, state))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_known_unescaped_protocol_keys_share_capture_storage() {
        let (value, state) =
            strict_json(br#"[{"id":1,"arbitrary":1},{"id":2,"arbitrary":2},{"\u0069d":3}]"#)
                .unwrap();
        assert!(state.failure().is_none());
        let value = value.unwrap();
        let objects: Vec<_> = value
            .as_array()
            .unwrap()
            .iter()
            .map(|value| value.as_object().unwrap())
            .collect();
        let key = |index: usize, text: &str| {
            with_json_field_key(text, |units| objects[index].get_key_value(units).unwrap().0)
        };
        assert_eq!(
            key(0, "id").code_units().as_ptr(),
            key(1, "id").code_units().as_ptr()
        );
        assert_eq!(key(0, "id"), key(2, "id"));
        assert_ne!(
            key(0, "arbitrary").code_units().as_ptr(),
            key(1, "arbitrary").code_units().as_ptr()
        );
    }

    #[test]
    fn retained_write_metric_detects_injected_writes_after_the_limit() {
        let mut state = StrictState {
            retain_values: false,
            ..StrictState::default()
        };
        let mut root = None;
        let mut frames = vec![Frame {
            path: CanonicalPath::default(),
            retain: false,
            container: Container::Array {
                values: vec![],
                next_index: 0,
            },
        }];
        attach(&mut frames, &mut root, Some(StrictValue::Null), &mut state);
        assert_eq!(state.metrics.post_limit_retained, 1);
        attach(&mut [], &mut root, Some(StrictValue::Null), &mut state);
        assert_eq!(state.metrics.post_limit_retained, 2);
        frames[0].container = Container::Object {
            values: JsonObject::new(),
            pending: Some(Pending {
                key: Some(JsString::from("injected")),
                path: CanonicalPath::default(),
                retain: false,
            }),
        };
        attach(&mut frames, &mut root, Some(StrictValue::Null), &mut state);
        assert_eq!(state.metrics.post_limit_retained, 3);
    }

    #[test]
    fn raw_protocol_integer_spelling_is_preserved_without_changing_command_numbers() {
        for (raw, expected) in [
            ("1", Some(1)),
            ("1.0", Some(1)),
            ("1e0", Some(1)),
            ("-0", Some(0)),
            ("-1", None),
            ("9007199254740992", Some(9_007_199_254_740_992)),
            ("9007199254740992.0", None),
            ("9007199254740992e0", None),
            ("18446744073709551615", Some(u64::MAX)),
            ("18446744073709551616", None),
        ] {
            let input = format!(r#"{{"apiVersion":{raw},"command":{{"apiVersion":1}}}}"#);
            let (_, state) = strict_json(input.as_bytes()).unwrap();
            assert_eq!(state.root_api_integer, expected, "{raw}");
        }
        let (_, state) =
            strict_json(br#"{"apiVersion":"wrong","unknown":{"apiVersion":1}}"#).unwrap();
        assert_eq!(state.root_api_integer, None);
        let (_, state) = strict_json(br#"{"apiVersion":1,"apiVersion":2,"command":{}}"#).unwrap();
        assert_eq!(state.root_api_integer, Some(1));
    }

    #[test]
    fn full_score_capture_keeps_the_lossless_tree_without_a_serde_value_conversion() {
        let oracle: serde_json::Value = serde_json::from_str(include_str!(
            "../../../../test/core-kernel/rust-migration/fixtures/lossless-score-dto-oracle-v1.json"
        ))
        .unwrap();
        for sample in oracle["samples"].as_array().unwrap() {
            let input = sample["input"].as_str().unwrap();
            let (value, state) = strict_json(input.as_bytes()).unwrap();
            assert!(state.failure().is_none());
            assert_eq!(
                value.unwrap(),
                brilliant_score_foundation::decode_lossless_json(input).unwrap()
            );
        }
    }

    #[test]
    fn duplicate_surrogate_keys_keep_the_first_value_and_do_not_hide_later_shape_faults() {
        let (value, mut state) = strict_json(br#"{"\ud800":"\udc00","\uD800":{"ignored":"\ud800"},"document":{"title":"\ud800"},"x":"retained"}"#).unwrap();
        let value = value.unwrap();
        assert_eq!(state.metrics.duplicate_discarded, 1);
        let entries = value.as_object().unwrap();
        assert_eq!(
            entries[&JsString::from_utf16(vec![0xd800])]
                .as_text()
                .unwrap()
                .code_units(),
            [0xdc00]
        );
        assert_eq!(
            entries.get_ascii("x").unwrap().as_text().unwrap(),
            &JsString::from("retained")
        );
        assert!(matches!(
            state.failure(),
            Some(StableFailureV1::CodecInvalidShape {
                violation: ShapeViolationV1::DuplicateField,
                ..
            })
        ));
        validate_create_shape(&value, &mut state);
        assert_eq!(
            state.failure(),
            Some(StableFailureV1::CodecInvalidShape {
                path: StablePathV1::field("apiVersion"),
                violation: ShapeViolationV1::MissingField,
            })
        );
    }

    #[test]
    fn discarded_non_scalar_keys_keep_canonical_escaped_paths_and_later_syntax_priority() {
        let deep = format!(
            "{}0{}",
            "[".repeat(JSON_DEPTH_LIMIT + 1),
            "]".repeat(JSON_DEPTH_LIMIT + 1)
        );
        let input = format!(
            r#"{{"document":0,"document":{{"\ud800{}":{},"\u0061piVersion":{}}}}}"#,
            "x".repeat(100_000),
            deep,
            deep
        );
        let (value, state) = strict_json(input.as_bytes()).unwrap();
        assert!(value.is_none());
        assert_eq!(state.metrics.post_limit_retained, 0);
        assert_eq!(state.metrics.duplicate_discarded, 1);
        let depth = state.depth_fault.unwrap();
        assert_eq!(
            &depth.path.0[..2],
            &[
                CanonicalPathSegment::Field("document"),
                CanonicalPathSegment::Field("apiVersion")
            ]
        );
        assert_eq!(depth.actual, JSON_DEPTH_LIMIT as u64 + 1);
        let invalid = format!("{input} trailing");
        assert!(matches!(
            strict_json(invalid.as_bytes()),
            Err(StableFailureV1::CodecInvalidJson)
        ));
    }
}
