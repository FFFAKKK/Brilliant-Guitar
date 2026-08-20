use brilliant_core_types::StableId;
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
    InvalidSchemaVersions,
}

impl ExtensionRuntimeRequirementV1 {
    pub fn validate(&self) -> Result<(), ProtocolContractFailure> {
        validate_common(
            self.protocol_version,
            &self.namespace,
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
            &self.supported_schema_versions,
        )
    }
}

fn validate_common(
    protocol_version: u64,
    namespace: &str,
    versions: &[u64],
) -> Result<(), ProtocolContractFailure> {
    if protocol_version != EXTENSION_PROTOCOL_VERSION_V1 {
        return Err(ProtocolContractFailure::UnsupportedVersion);
    }
    if namespace.is_empty()
        || namespace
            .bytes()
            .any(|byte| !(byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'.'))
    {
        return Err(ProtocolContractFailure::InvalidNamespace);
    }
    if versions.is_empty()
        || versions.contains(&0)
        || versions.windows(2).any(|pair| pair[0] >= pair[1])
    {
        return Err(ProtocolContractFailure::InvalidSchemaVersions);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

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
