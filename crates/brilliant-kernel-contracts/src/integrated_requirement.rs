//! Existing TS requirement wire mapped explicitly to the internal protocol.
//! This accepts captured lossless data, not SDK callback/catalog identities.
use brilliant_core_types::{JsString, JsonValue, LosslessJsonValue, SafeInteger, StableId};
use brilliant_extension_protocol::ExtensionRuntimeRequirementV1;
use brilliant_score_foundation::LosslessDecode;

pub fn decode_extension_runtime_requirement_v1(
    value: &LosslessJsonValue,
) -> Option<ExtensionRuntimeRequirementV1> {
    let JsonValue::Object(fields) = value else {
        return None;
    };
    if fields.len() != 6 {
        return None;
    }
    let get = |key: &str| {
        fields
            .iter()
            .find(|(name, _)| name.eq_ascii(key))
            .map(|(_, value)| value)
    };
    if integer(get("requirementVersion")?)? != 1 {
        return None;
    }
    if !matches!(get("requiredForWrite")?, JsonValue::Bool(true)) {
        return None;
    }
    let namespace = text(get("namespace")?)?;
    // Namespace is a bounded ASCII registry ID; do not run arbitrary JS text
    // through a lossy UTF-8 conversion or allocate an unbounded temporary.
    if !(1..=128).contains(&namespace.len())
        || namespace.code_units().iter().any(|unit| *unit > 127)
    {
        return None;
    }
    let mut namespace_text = String::new();
    namespace_text.try_reserve(namespace.len()).ok()?;
    for unit in namespace.code_units() {
        namespace_text.push(char::from(*unit as u8));
    }
    let module_id = StableId::new(text(get("moduleId")?)?).ok()?;
    let contribution_id = StableId::new(text(get("contributionId")?)?).ok()?;
    let JsonValue::Array(versions) = get("supportedSchemaVersions")? else {
        return None;
    };
    if !(1..=256).contains(&versions.len()) {
        return None;
    }
    let mut supported_schema_versions = Vec::new();
    supported_schema_versions.try_reserve(versions.len()).ok()?;
    for value in versions {
        supported_schema_versions.push(integer(value)?);
    }
    let requirement = ExtensionRuntimeRequirementV1 {
        protocol_version: 1,
        namespace: namespace_text,
        module_id,
        contribution_id,
        supported_schema_versions,
        required_for_write: true,
    };
    requirement.validate().ok()?;
    Some(requirement)
}

fn text(value: &LosslessJsonValue) -> Option<&JsString> {
    match value {
        JsonValue::String(value) => Some(value),
        _ => None,
    }
}
fn integer(value: &LosslessJsonValue) -> Option<u64> {
    if !matches!(value, JsonValue::Number(_)) {
        return None;
    }
    // SafeInteger owns the exact JSON-number and JS safe-integer contract.
    let value = SafeInteger::from_lossless_value(value.clone()).ok()?.get();
    (value > 0).then_some(value as u64)
}
