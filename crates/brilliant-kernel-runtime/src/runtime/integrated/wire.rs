use brilliant_core_types::{FiniteNumber, JsString, JsonValue, LosslessJsonValue};
use brilliant_kernel_contracts::REQUEST_BYTE_LIMIT;
use brilliant_score_foundation::{LosslessEncode, decode_js_value_json, with_json_field_key};

pub(super) type Value = LosslessJsonValue;
pub(super) type Result<T> = std::result::Result<T, Value>;

pub(super) fn text(value: &str) -> Value {
    JsonValue::String(value.into())
}
pub(super) fn number(value: u64) -> Value {
    JsonValue::Number(FiniteNumber::new(value as f64).expect("bounded integer"))
}
pub(super) fn object<const N: usize>(fields: [(&str, Value); N]) -> Value {
    JsonValue::Object(
        fields
            .into_iter()
            .map(|(key, value)| (JsString::from(key), value))
            .collect(),
    )
}
pub(super) fn field<'a>(value: &'a Value, key: &str) -> Result<&'a Value> {
    let JsonValue::Object(fields) = value else {
        return Err(internal());
    };
    with_json_field_key(key, |key| fields.get(key)).ok_or_else(internal)
}
pub(super) fn exact(value: &Value, fields: &[&str]) -> bool {
    matches!(value, JsonValue::Object(values) if values.len() == fields.len() && fields.iter().all(|key| with_json_field_key(key, |key| values.contains_key(key))))
}
pub(super) fn array(value: &Value) -> Result<&[Value]> {
    match value {
        JsonValue::Array(values) => Ok(values),
        _ => Err(internal()),
    }
}
pub(super) fn string(value: &Value) -> Result<&JsString> {
    match value {
        JsonValue::String(value) => Ok(value),
        _ => Err(internal()),
    }
}
pub(super) fn tag(value: &Value, key: &str, expected: &str) -> bool {
    field(value, key)
        .ok()
        .and_then(|value| string(value).ok())
        .is_some_and(|value| value.eq_ascii(expected))
}
pub(super) fn integer(value: &Value) -> Option<u64> {
    let JsonValue::Number(number) = value else {
        return None;
    };
    let value = number.get();
    ((0.0..=9_007_199_254_740_991.0).contains(&value) && value.fract() == 0.0)
        .then_some(value as u64)
}
pub(super) fn failure(code: &str) -> Value {
    object([("code", text(code))])
}
pub(super) fn internal() -> Value {
    failure("command.internal-error")
}
pub(super) fn decode(bytes: &[u8]) -> Result<Value> {
    if bytes.len() > REQUEST_BYTE_LIMIT {
        return Err(failure("bridge.request-too-large"));
    }
    decode_js_value_json(std::str::from_utf8(bytes).map_err(|_| internal())?)
        .map_err(|_| internal())
}
pub(super) fn encode(value: &impl LosslessEncode) -> Result<Vec<u8>> {
    let mut bytes = Vec::new();
    value.write_lossless(&mut bytes).map_err(|_| internal())?;
    if bytes.len() > REQUEST_BYTE_LIMIT {
        return Err(failure("bridge.response-too-large"));
    }
    Ok(bytes)
}
pub(super) fn value(value: &impl LosslessEncode) -> Result<Value> {
    decode(&encode(value)?)
}
