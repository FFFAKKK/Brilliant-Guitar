//! Existing TS requirement wire mapped explicitly to the internal protocol.
//! This accepts captured lossless data, not SDK callback/catalog identities.
use brilliant_core_types::{JsString, JsonValue, LosslessJsonValue, SafeInteger, StableId};
use brilliant_extension_protocol::ExtensionRuntimeRequirementV1;
use brilliant_score_foundation::LosslessDecode;

pub fn decode_extension_runtime_requirement_v1(
    value: &LosslessJsonValue,
) -> Option<ExtensionRuntimeRequirementV1> {
    try_decode_requirement(value, RequirementReservation::default()).ok()
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum RequirementDecodeFailure {
    Invalid,
    Capacity,
}

// Keep fault injection local to these two bounded allocations. Production has
// no failure switch or shared mutable allocator state.
#[derive(Clone, Copy, Default)]
pub(crate) struct RequirementReservation {
    #[cfg(test)]
    fail_at: Option<RequirementAllocation>,
}

#[cfg(test)]
#[derive(Clone, Copy, Eq, PartialEq)]
pub(crate) enum RequirementAllocation {
    Namespace,
    Versions,
}

impl RequirementReservation {
    #[cfg(test)]
    pub(crate) fn fail_at(allocation: RequirementAllocation) -> Self {
        Self {
            fail_at: Some(allocation),
        }
    }

    fn namespace(self, value: &mut String, size: usize) -> Result<(), RequirementDecodeFailure> {
        #[cfg(test)]
        if self.fail_at == Some(RequirementAllocation::Namespace) {
            return Err(RequirementDecodeFailure::Capacity);
        }
        value
            .try_reserve(size)
            .map_err(|_| RequirementDecodeFailure::Capacity)
    }

    fn versions(self, value: &mut Vec<u64>, size: usize) -> Result<(), RequirementDecodeFailure> {
        #[cfg(test)]
        if self.fail_at == Some(RequirementAllocation::Versions) {
            return Err(RequirementDecodeFailure::Capacity);
        }
        value
            .try_reserve(size)
            .map_err(|_| RequirementDecodeFailure::Capacity)
    }
}

pub(crate) fn try_decode_requirement(
    value: &LosslessJsonValue,
    reservation: RequirementReservation,
) -> Result<ExtensionRuntimeRequirementV1, RequirementDecodeFailure> {
    let invalid = RequirementDecodeFailure::Invalid;
    let JsonValue::Object(fields) = value else {
        return Err(invalid);
    };
    if fields.len() != 6 {
        return Err(invalid);
    }
    let get = |key: &str| {
        fields
            .iter()
            .find(|(name, _)| name.eq_ascii(key))
            .map(|(_, value)| value)
            .ok_or(invalid)
    };
    if integer(get("requirementVersion")?).ok_or(invalid)? != 1 {
        return Err(invalid);
    }
    if !matches!(get("requiredForWrite")?, JsonValue::Bool(true)) {
        return Err(invalid);
    }
    let namespace = text(get("namespace")?).ok_or(invalid)?;
    // Namespace is a bounded ASCII registry ID; do not run arbitrary JS text
    // through a lossy UTF-8 conversion or allocate an unbounded temporary.
    if !(1..=128).contains(&namespace.len())
        || namespace.code_units().iter().any(|unit| *unit > 127)
    {
        return Err(invalid);
    }
    let mut namespace_text = String::new();
    reservation.namespace(&mut namespace_text, namespace.len())?;
    for unit in namespace.code_units() {
        namespace_text.push(char::from(*unit as u8));
    }
    let module_id = StableId::new(text(get("moduleId")?).ok_or(invalid)?).map_err(|_| invalid)?;
    let contribution_id =
        StableId::new(text(get("contributionId")?).ok_or(invalid)?).map_err(|_| invalid)?;
    let JsonValue::Array(versions) = get("supportedSchemaVersions")? else {
        return Err(invalid);
    };
    if !(1..=256).contains(&versions.len()) {
        return Err(invalid);
    }
    let mut supported_schema_versions = Vec::new();
    reservation.versions(&mut supported_schema_versions, versions.len())?;
    for value in versions {
        supported_schema_versions.push(integer(value).ok_or(invalid)?);
    }
    let requirement = ExtensionRuntimeRequirementV1 {
        protocol_version: 1,
        namespace: namespace_text,
        module_id,
        contribution_id,
        supported_schema_versions,
        required_for_write: true,
    };
    requirement.validate().map_err(|_| invalid)?;
    Ok(requirement)
}

fn text(value: &LosslessJsonValue) -> Option<&JsString> {
    match value {
        JsonValue::String(value) => Some(value),
        _ => None,
    }
}
pub(crate) fn integer(value: &LosslessJsonValue) -> Option<u64> {
    if !matches!(value, JsonValue::Number(_)) {
        return None;
    }
    // SafeInteger owns the exact JSON-number and JS safe-integer contract.
    let value = SafeInteger::from_lossless_value(value.clone()).ok()?.get();
    (value > 0).then_some(value as u64)
}
