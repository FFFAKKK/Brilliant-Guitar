//! Validated host metadata projection, not an SDK catalog compiler or callback authenticator.
use std::sync::{Arc, Mutex};

use brilliant_core_types::StableId;

use crate::{ExtensionRuntimeRequirementV1, contracts::valid_registry_id};

pub const HOST_MODULE_LIMIT_V1: usize = 64;
// The SDK manifest limit includes the two mandatory Core modules, which never
// appear in the projected domain-catalog contribution collection.
pub const DOMAIN_MODULE_LIMIT_V1: usize = HOST_MODULE_LIMIT_V1 - 2;
pub const HOST_CONTRIBUTION_LIMIT_V1: usize = 256;
pub const KNOWN_REQUIREMENT_LIMIT_V1: usize = 1024;

#[derive(Debug)]
pub struct HostInstalledContributionV1 {
    pub module_id: StableId,
    pub contribution_id: StableId,
    pub requirements: Vec<ExtensionRuntimeRequirementV1>,
}

#[derive(Debug)]
pub struct HostInstalledContributionsV1 {
    /// Only domain-catalog contributions, not core modules or arbitrary owners.
    pub contributions: Vec<HostInstalledContributionV1>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum HostAssemblyFailureV1 {
    InvalidHostProjection,
    InvalidInventory,
    Capacity,
    Internal,
}

#[derive(Debug)]
pub enum InventorySelectionV1 {
    Omitted,
    Explicit(Vec<ExtensionRuntimeRequirementV1>),
}

#[derive(Debug)]
struct HostData {
    owners: Vec<(StableId, StableId)>,
    requirements: Vec<ExtensionRuntimeRequirementV1>,
}

/// Each instance has its own identity cache. Like the TS catalog cache, entries are
/// retained until this catalog is dropped; no additional public inventory cap is imposed.
#[derive(Debug)]
pub struct HostCatalogV1 {
    data: Arc<HostData>,
    cache: Mutex<Vec<Arc<ResolvedHostAssemblyV1>>>,
}

/// Owns its validated host data, so dropping the source catalog cannot invalidate it.
#[derive(Debug)]
pub struct ResolvedHostAssemblyV1 {
    host: Arc<HostData>,
    requirements: Vec<ExtensionRuntimeRequirementV1>,
    key: String,
}

impl ResolvedHostAssemblyV1 {
    pub fn requirements(&self) -> &[ExtensionRuntimeRequirementV1] {
        &self.requirements
    }

    pub fn canonical_inventory_key(&self) -> &str {
        &self.key
    }

    pub(crate) fn is_installed(&self, requirement: &ExtensionRuntimeRequirementV1) -> bool {
        self.host
            .requirements
            .binary_search_by(|value| value.namespace.cmp(&requirement.namespace))
            .is_ok_and(|index| self.host.requirements[index] == *requirement)
    }
}

impl HostCatalogV1 {
    pub fn new(input: HostInstalledContributionsV1) -> Result<Self, HostAssemblyFailureV1> {
        let invalid = HostAssemblyFailureV1::InvalidHostProjection;
        if input.contributions.len() > HOST_CONTRIBUTION_LIMIT_V1 {
            return Err(invalid);
        }
        let mut owners: Vec<(StableId, StableId)> = Vec::new();
        owners
            .try_reserve(input.contributions.len())
            .map_err(|_| HostAssemblyFailureV1::Capacity)?;
        let mut requirements = Vec::new();
        for contribution in input.contributions {
            if contribution.requirements.is_empty()
                || contribution
                    .module_id
                    .as_js_string()
                    .eq_ascii("core.commands")
                || contribution
                    .module_id
                    .as_js_string()
                    .eq_ascii("core.selectors")
                || !valid_registry_id(
                    contribution
                        .module_id
                        .as_js_string()
                        .code_units()
                        .iter()
                        .copied(),
                )
                || !valid_registry_id(
                    contribution
                        .contribution_id
                        .as_js_string()
                        .code_units()
                        .iter()
                        .copied(),
                )
                || owners
                    .iter()
                    .any(|(_, id)| id == &contribution.contribution_id)
                || contribution.requirements.len() > KNOWN_REQUIREMENT_LIMIT_V1 - requirements.len()
            {
                return Err(invalid);
            }
            for requirement in &contribution.requirements {
                if requirement.validate().is_err()
                    || requirement.module_id != contribution.module_id
                    || requirement.contribution_id != contribution.contribution_id
                {
                    return Err(invalid);
                }
            }
            requirements
                .try_reserve(contribution.requirements.len())
                .map_err(|_| HostAssemblyFailureV1::Capacity)?;
            requirements.extend(contribution.requirements);
            owners.push((contribution.module_id, contribution.contribution_id));
        }
        owners.sort_unstable();
        if owners
            .iter()
            .enumerate()
            .filter(|(index, owner)| *index == 0 || owners[*index - 1].0 != owner.0)
            .count()
            > DOMAIN_MODULE_LIMIT_V1
        {
            return Err(invalid);
        }
        normalize(&mut requirements, invalid)?;
        Ok(Self {
            data: Arc::new(HostData {
                owners,
                requirements,
            }),
            cache: Mutex::new(Vec::new()),
        })
    }

    pub fn resolve_inventory(
        &self,
        selection: InventorySelectionV1,
    ) -> Result<Arc<ResolvedHostAssemblyV1>, HostAssemblyFailureV1> {
        let mut requirements = match selection {
            InventorySelectionV1::Omitted => clone_requirements(&self.data.requirements)?,
            InventorySelectionV1::Explicit(values) => values,
        };
        // Validate every request before considering identity reuse. Callers cannot
        // use a cached key to bypass shape, owner parity, or strict requirement checks.
        normalize(&mut requirements, HostAssemblyFailureV1::InvalidInventory)?;
        for installed in &self.data.requirements {
            if !requirements
                .binary_search_by(|value| value.namespace.cmp(&installed.namespace))
                .is_ok_and(|index| requirements[index] == *installed)
            {
                return Err(HostAssemblyFailureV1::InvalidInventory);
            }
        }
        for requirement in &requirements {
            let owner_installed = self.data.owners.iter().any(|(module, contribution)| {
                module == &requirement.module_id && contribution == &requirement.contribution_id
            });
            if owner_installed
                && !self
                    .data
                    .requirements
                    .binary_search_by(|value| value.namespace.cmp(&requirement.namespace))
                    .is_ok_and(|index| self.data.requirements[index] == *requirement)
            {
                return Err(HostAssemblyFailureV1::InvalidInventory);
            }
        }
        let key = canonical_key(&requirements)?;
        let mut cache = self
            .cache
            .lock()
            .map_err(|_| HostAssemblyFailureV1::Internal)?;
        if let Some(cached) = cache.iter().find(|value| value.key == key) {
            return Ok(Arc::clone(cached));
        }
        cache
            .try_reserve(1)
            .map_err(|_| HostAssemblyFailureV1::Capacity)?;
        let state = Arc::new(ResolvedHostAssemblyV1 {
            host: Arc::clone(&self.data),
            requirements,
            key,
        });
        cache.push(Arc::clone(&state));
        Ok(state)
    }
}

fn normalize(
    requirements: &mut [ExtensionRuntimeRequirementV1],
    invalid: HostAssemblyFailureV1,
) -> Result<(), HostAssemblyFailureV1> {
    if requirements.len() > KNOWN_REQUIREMENT_LIMIT_V1
        || requirements.iter().any(|value| value.validate().is_err())
    {
        return Err(invalid);
    }
    requirements.sort_unstable_by(|left, right| left.namespace.cmp(&right.namespace));
    if requirements
        .windows(2)
        .any(|pair| pair[0].namespace == pair[1].namespace)
    {
        return Err(invalid);
    }
    Ok(())
}

fn clone_requirements(
    values: &[ExtensionRuntimeRequirementV1],
) -> Result<Vec<ExtensionRuntimeRequirementV1>, HostAssemblyFailureV1> {
    let mut result = Vec::new();
    result
        .try_reserve(values.len())
        .map_err(|_| HostAssemblyFailureV1::Capacity)?;
    for value in values {
        let mut namespace = String::new();
        namespace
            .try_reserve(value.namespace.len())
            .map_err(|_| HostAssemblyFailureV1::Capacity)?;
        namespace.push_str(&value.namespace);
        let mut versions = Vec::new();
        versions
            .try_reserve(value.supported_schema_versions.len())
            .map_err(|_| HostAssemblyFailureV1::Capacity)?;
        versions.extend_from_slice(&value.supported_schema_versions);
        result.push(ExtensionRuntimeRequirementV1 {
            protocol_version: value.protocol_version,
            namespace,
            module_id: value.module_id.clone(),
            contribution_id: value.contribution_id.clone(),
            supported_schema_versions: versions,
            required_for_write: value.required_for_write,
        });
    }
    Ok(result)
}

fn canonical_key(
    values: &[ExtensionRuntimeRequirementV1],
) -> Result<String, HostAssemblyFailureV1> {
    // Valid registry IDs are ASCII, so byte length equals TS UTF-16 length.
    // Reserve a conservative exact-bound sum before any String growth.
    let capacity = values
        .iter()
        .try_fold(12usize, |size, value| {
            size.checked_add(3 * 132 + 3 + value.supported_schema_versions.len() * 19)
        })
        .ok_or(HostAssemblyFailureV1::Capacity)?;
    let mut key = String::new();
    key.try_reserve(capacity)
        .map_err(|_| HostAssemblyFailureV1::Capacity)?;
    key.push_str("inventory:1;");
    for value in values {
        append_integer(&mut key, value.namespace.len() as u64);
        key.push(':');
        key.push_str(&value.namespace);
        for id in [&value.module_id, &value.contribution_id] {
            append_integer(&mut key, id.as_js_string().code_units().len() as u64);
            key.push(':');
            for unit in id.as_js_string().code_units() {
                key.push(*unit as u8 as char);
            }
        }
        key.push_str("1:");
        for version in &value.supported_schema_versions {
            let digits = if *version == 0 {
                1
            } else {
                version.ilog10() + 1
            };
            append_integer(&mut key, u64::from(digits));
            key.push(':');
            append_integer(&mut key, *version);
        }
        key.push(';');
    }
    Ok(key)
}

fn append_integer(output: &mut String, mut value: u64) {
    let mut buffer = [0u8; 20];
    let mut offset = buffer.len();
    loop {
        offset -= 1;
        buffer[offset] = b'0' + (value % 10) as u8;
        value /= 10;
        if value == 0 {
            break;
        }
    }
    for byte in &buffer[offset..] {
        output.push(char::from(*byte));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn requirement(namespace: &str) -> ExtensionRuntimeRequirementV1 {
        ExtensionRuntimeRequirementV1 {
            protocol_version: 1,
            namespace: namespace.into(),
            module_id: StableId::new("module").unwrap(),
            contribution_id: StableId::new("domain").unwrap(),
            supported_schema_versions: vec![1, 12],
            required_for_write: true,
        }
    }

    fn catalog() -> HostCatalogV1 {
        HostCatalogV1::new(HostInstalledContributionsV1 {
            contributions: vec![HostInstalledContributionV1 {
                module_id: StableId::new("module").unwrap(),
                contribution_id: StableId::new("domain").unwrap(),
                requirements: vec![requirement("b"), requirement("a")],
            }],
        })
        .unwrap()
    }

    #[test]
    fn canonical_identity_is_scoped_to_catalog_and_retains_host_after_drop() {
        let source = catalog();
        let state = source
            .resolve_inventory(InventorySelectionV1::Omitted)
            .unwrap();
        let explicit = source
            .resolve_inventory(InventorySelectionV1::Explicit(vec![
                requirement("b"),
                requirement("a"),
            ]))
            .unwrap();
        assert!(Arc::ptr_eq(&state, &explicit));
        assert_eq!(
            state.canonical_inventory_key(),
            "inventory:1;1:a6:module6:domain1:1:12:12;1:b6:module6:domain1:1:12:12;"
        );
        let other = catalog()
            .resolve_inventory(InventorySelectionV1::Omitted)
            .unwrap();
        assert!(!Arc::ptr_eq(&state, &other));
        drop(source);
        assert!(state.is_installed(&requirement("a")));
    }

    #[test]
    fn parity_rejects_missing_installed_and_extra_namespace_for_installed_owner() {
        let source = catalog();
        assert!(matches!(
            source.resolve_inventory(InventorySelectionV1::Explicit(vec![requirement("a")])),
            Err(HostAssemblyFailureV1::InvalidInventory)
        ));
        let mut values = vec![requirement("a"), requirement("b"), requirement("c")];
        assert!(matches!(
            source.resolve_inventory(InventorySelectionV1::Explicit(values.clone())),
            Err(HostAssemblyFailureV1::InvalidInventory)
        ));
        values[2].contribution_id = StableId::new("absent").unwrap();
        assert!(
            source
                .resolve_inventory(InventorySelectionV1::Explicit(values))
                .is_ok()
        );
    }

    #[test]
    fn domain_projection_rejects_empty_owner_requirements_but_accepts_empty_catalog() {
        let empty = HostInstalledContributionsV1 {
            contributions: Vec::new(),
        };
        assert!(HostCatalogV1::new(empty).is_ok());
        assert!(matches!(
            HostCatalogV1::new(HostInstalledContributionsV1 {
                contributions: vec![HostInstalledContributionV1 {
                    module_id: StableId::new("module").unwrap(),
                    contribution_id: StableId::new("domain").unwrap(),
                    requirements: Vec::new(),
                }],
            }),
            Err(HostAssemblyFailureV1::InvalidHostProjection)
        ));
    }

    #[test]
    fn domain_module_count_reserves_the_two_mandatory_core_manifest_slots() {
        let projection = |count| HostInstalledContributionsV1 {
            contributions: (0..count)
                .map(|index| {
                    let mut value = requirement(&format!("namespace-{index}"));
                    value.module_id = StableId::new(format!("module-{index}")).unwrap();
                    value.contribution_id = StableId::new(format!("domain-{index}")).unwrap();
                    HostInstalledContributionV1 {
                        module_id: value.module_id.clone(),
                        contribution_id: value.contribution_id.clone(),
                        requirements: vec![value],
                    }
                })
                .collect(),
        };
        assert!(HostCatalogV1::new(projection(62)).is_ok());
        assert!(matches!(
            HostCatalogV1::new(projection(63)),
            Err(HostAssemblyFailureV1::InvalidHostProjection)
        ));
    }

    #[test]
    fn core_modules_cannot_own_projected_domain_contributions() {
        for module in ["core.commands", "core.selectors"] {
            let mut value = requirement("domain.namespace");
            value.module_id = StableId::new(module).unwrap();
            assert!(matches!(
                HostCatalogV1::new(HostInstalledContributionsV1 {
                    contributions: vec![HostInstalledContributionV1 {
                        module_id: value.module_id.clone(),
                        contribution_id: value.contribution_id.clone(),
                        requirements: vec![value],
                    }],
                }),
                Err(HostAssemblyFailureV1::InvalidHostProjection)
            ));
        }
    }

    #[test]
    fn poisoned_cache_is_internal_and_projection_remains_send_sync() {
        fn assert_send_sync<T: Send + Sync>() {}
        assert_send_sync::<HostCatalogV1>();
        assert_send_sync::<ResolvedHostAssemblyV1>();
        let source = catalog();
        let _ = std::panic::catch_unwind(|| {
            let _guard = source.cache.lock().unwrap();
            panic!("poison only the identity cache");
        });
        assert!(matches!(
            source.resolve_inventory(InventorySelectionV1::Omitted),
            Err(HostAssemblyFailureV1::Internal)
        ));
        // Validation still precedes accessing the cache.
        assert!(matches!(
            source.resolve_inventory(InventorySelectionV1::Explicit(Vec::new())),
            Err(HostAssemblyFailureV1::InvalidInventory)
        ));
    }
}
