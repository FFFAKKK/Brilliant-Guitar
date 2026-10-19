//! Lossless callback primitives shared by official domains; no musical semantics.
use brilliant_core_types::{JsString, JsonValue, LosslessJsonValue};
use brilliant_score_foundation::{decode_js_value_json, with_json_field_key};
pub(super) type Value = LosslessJsonValue;
pub(super) type CallbackResult<T> = Result<T, Value>;
pub(super) fn field<'a>(value: &'a Value, key: &str) -> Option<&'a Value> {
    let JsonValue::Object(fields) = value else {
        return None;
    };
    with_json_field_key(key, |key| fields.get(key))
}
pub(super) fn exact(value: &Value, keys: &[&str]) -> bool {
    matches!(value, JsonValue::Object(fields) if fields.len() == keys.len() && keys.iter().all(|k| field(value,k).is_some()))
}
pub(super) fn string(value: &Value) -> Option<&JsString> {
    if let JsonValue::String(s) = value {
        Some(s)
    } else {
        None
    }
}
pub(super) fn tag(value: &Value, key: &str, text: &str) -> bool {
    field(value, key)
        .and_then(string)
        .is_some_and(|s| s.eq_ascii(text))
}
pub(super) fn literal(value: serde_json::Value) -> Value {
    decode_js_value_json(&value.to_string()).expect("static JSON value")
}
pub(super) fn object<const N: usize>(items: [(&str, Value); N]) -> Value {
    JsonValue::Object(items.into_iter().map(|(k, v)| (k.into(), v)).collect())
}
pub(super) fn internal() -> Value {
    literal(serde_json::json!({"code":"command.assembly-mismatch"}))
}
pub(super) fn invalid() -> Value {
    literal(serde_json::json!({"code":"command.invalid-envelope"}))
}
pub(super) fn integer(value: &Value, min: i64, max: i64) -> Option<i64> {
    let JsonValue::Number(n) = value else {
        return None;
    };
    let n = n.get();
    (n.fract() == 0.0 && n >= min as f64 && n <= max as f64).then_some(n as i64)
}
pub(super) fn array(value: &Value) -> Option<&[Value]> {
    if let JsonValue::Array(a) = value {
        Some(a)
    } else {
        None
    }
}
pub(super) fn entity(value: &Value) -> Option<JsString> {
    let id = string(value)?;
    (!id.is_empty() && id.code_units().len() <= 256).then(|| id.clone())
}
