use brilliant_core_types::{JS_SAFE_INTEGER_MAX, StableId};
use serde::{Deserialize, Serialize};

pub const EXTENSION_PROTOCOL_VERSION_V1: u64 = 1;

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ExtensionRuntimeRequirementV1 {
    pub protocol_version: u64,
    pub namespace: String,
    pub module_id: StableId,
    pub contribution_id: StableId,
    pub supported_schema_versions: Vec<u64>,
    pub required_for_write: bool,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ExtensionContributionDescriptorV1 {
    pub protocol_version: u64,
    pub namespace: String,
    pub module_id: StableId,
    pub contribution_id: StableId,
    pub supported_schema_versions: Vec<u64>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ProtocolContractFailure {
    UnsupportedVersion,
    InvalidNamespace,
    InvalidModuleId,
    InvalidContributionId,
    InvalidSchemaVersions,
}

impl ExtensionRuntimeRequirementV1 {
    pub fn validate(&self) -> Result<(), ProtocolContractFailure> {
        validate_common(
            self.protocol_version,
            &self.namespace,
            &self.module_id,
            &self.contribution_id,
            &self.supported_schema_versions,
        )?;
        if !self.required_for_write {
            return Err(ProtocolContractFailure::InvalidSchemaVersions);
        }
        Ok(())
    }
}

impl ExtensionContributionDescriptorV1 {
    pub fn validate(&self) -> Result<(), ProtocolContractFailure> {
        validate_common(
            self.protocol_version,
            &self.namespace,
            &self.module_id,
            &self.contribution_id,
            &self.supported_schema_versions,
        )
    }
}

fn validate_common(
    protocol_version: u64,
    namespace: &str,
    module_id: &StableId,
    contribution_id: &StableId,
    versions: &[u64],
) -> Result<(), ProtocolContractFailure> {
    if protocol_version != EXTENSION_PROTOCOL_VERSION_V1 {
        return Err(ProtocolContractFailure::UnsupportedVersion);
    }
    if !valid_registry_id(namespace.bytes().map(u16::from)) {
        return Err(ProtocolContractFailure::InvalidNamespace);
    }
    if !valid_registry_id(module_id.as_js_string().code_units().iter().copied()) {
        return Err(ProtocolContractFailure::InvalidModuleId);
    }
    if !valid_registry_id(contribution_id.as_js_string().code_units().iter().copied()) {
        return Err(ProtocolContractFailure::InvalidContributionId);
    }
    if versions.is_empty()
        || versions.len() > 256
        || versions.contains(&0)
        || versions
            .iter()
            .any(|version| *version > JS_SAFE_INTEGER_MAX as u64)
        || versions.windows(2).any(|pair| pair[0] >= pair[1])
    {
        return Err(ProtocolContractFailure::InvalidSchemaVersions);
    }
    Ok(())
}

// TS registry/strict-codec.ts is deliberately stricter than a Score StableId:
// 1..128 ASCII units, with single internal dot/hyphen separators only.
pub(crate) fn valid_registry_id(units: impl ExactSizeIterator<Item = u16>) -> bool {
    if !(1..=128).contains(&units.len()) {
        return false;
    }
    let mut separator = true;
    for unit in units {
        if (u16::from(b'a')..=u16::from(b'z')).contains(&unit)
            || (u16::from(b'0')..=u16::from(b'9')).contains(&unit)
        {
            separator = false;
        } else if (unit == u16::from(b'.') || unit == u16::from(b'-')) && !separator {
            separator = true;
        } else {
            return false;
        }
    }
    !separator
}

#[cfg(test)]
mod tests {
    use super::*;

    fn descriptor() -> ExtensionContributionDescriptorV1 {
        ExtensionContributionDescriptorV1 {
            protocol_version: 1,
            namespace: "example.domain-name".into(),
            module_id: StableId::new("module.example").unwrap(),
            contribution_id: StableId::new("contribution.example").unwrap(),
            supported_schema_versions: vec![1, JS_SAFE_INTEGER_MAX as u64],
        }
    }

    #[test]
    fn all_registry_ids_use_the_same_ascii_separator_and_length_contract() {
        assert_eq!(descriptor().validate(), Ok(()));
        for invalid in [
            ".leading",
            "trailing-",
            "two..dots",
            "mixed.-separator",
            "Upper",
            "under_score",
            "é",
        ] {
            let mut value = descriptor();
            value.namespace = invalid.into();
            assert_eq!(
                value.validate(),
                Err(ProtocolContractFailure::InvalidNamespace)
            );
            let mut value = descriptor();
            value.module_id = StableId::new(invalid).unwrap();
            assert_eq!(
                value.validate(),
                Err(ProtocolContractFailure::InvalidModuleId)
            );
            let mut value = descriptor();
            value.contribution_id = StableId::new(invalid).unwrap();
            assert_eq!(
                value.validate(),
                Err(ProtocolContractFailure::InvalidContributionId)
            );
        }
        for (length, accepted) in [(128, true), (129, false)] {
            let mut value = descriptor();
            value.namespace = "a".repeat(length);
            assert_eq!(value.validate().is_ok(), accepted);
        }
        let mut value = descriptor();
        value.module_id =
            StableId::new(brilliant_core_types::JsString::from_utf16(vec![0xd800])).unwrap();
        assert_eq!(
            value.validate(),
            Err(ProtocolContractFailure::InvalidModuleId)
        );
    }

    #[test]
    fn protocol_version_stays_first_and_schema_lists_are_bounded_safe_integers() {
        let mut value = descriptor();
        value.protocol_version = 2;
        value.namespace.clear();
        value.supported_schema_versions.clear();
        assert_eq!(
            value.validate(),
            Err(ProtocolContractFailure::UnsupportedVersion)
        );
        for versions in [
            vec![],
            vec![0],
            vec![2, 1],
            vec![1, 1],
            vec![JS_SAFE_INTEGER_MAX as u64 + 1],
            (1..=257).collect(),
        ] {
            let mut value = descriptor();
            value.supported_schema_versions = versions;
            assert_eq!(
                value.validate(),
                Err(ProtocolContractFailure::InvalidSchemaVersions)
            );
        }
        let mut value = descriptor();
        value.supported_schema_versions = (1..=256).collect();
        assert_eq!(value.validate(), Ok(()));
    }

    #[test]
    fn descriptors_are_versioned_data_only_contracts() {
        let descriptor = ExtensionContributionDescriptorV1 {
            protocol_version: 1,
            namespace: "example.rkp1".to_owned(),
            module_id: StableId::new("module.rkp1").expect("module id"),
            contribution_id: StableId::new("contribution.rkp1").expect("contribution id"),
            supported_schema_versions: vec![1, 2],
        };
        assert_eq!(descriptor.validate(), Ok(()));

        let mut future = descriptor;
        future.protocol_version = 2;
        assert_eq!(
            future.validate(),
            Err(ProtocolContractFailure::UnsupportedVersion)
        );
    }

    #[test]
    fn schema_versions_are_nonempty_sorted_and_unique() {
        let requirement = ExtensionRuntimeRequirementV1 {
            protocol_version: 1,
            namespace: "example.rkp1".to_owned(),
            module_id: StableId::new("module.rkp1").expect("module id"),
            contribution_id: StableId::new("contribution.rkp1").expect("contribution id"),
            supported_schema_versions: vec![1, 1],
            required_for_write: true,
        };
        assert_eq!(
            requirement.validate(),
            Err(ProtocolContractFailure::InvalidSchemaVersions)
        );
    }
}
