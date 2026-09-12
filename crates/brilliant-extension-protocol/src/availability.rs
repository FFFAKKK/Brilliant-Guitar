//! Header-only availability: opaque extension payloads never enter this API.
use brilliant_core_types::{JsString, StableId};

use crate::ResolvedHostAssemblyV1;

pub const DOMAIN_AVAILABILITY_FACT_LIMIT_V1: u64 = 131_072;

#[derive(Clone, Copy, Debug)]
pub enum ExtensionOwnerRefV1<'a> {
    Score,
    Part(&'a JsString),
}

#[derive(Clone, Copy, Debug)]
pub struct BorrowedExtensionHeaderV1<'a> {
    pub namespace: &'a JsString,
    pub owner: ExtensionOwnerRefV1<'a>,
    pub schema_version: u64,
}

// Variant order deliberately follows the TS UTF-16 fact comparator.
#[derive(Clone, Debug, Eq, Ord, PartialEq, PartialOrd)]
pub enum DomainAvailabilityOwnerV1 {
    Score,
    Part(JsString),
}

#[derive(Clone, Copy, Debug, Eq, Ord, PartialEq, PartialOrd)]
pub enum DomainAvailabilityReasonV1 {
    RequiredContributionIncompatible,
    RequiredContributionUnavailable,
}

#[derive(Debug, Eq, PartialEq)]
pub struct DomainAvailabilityFactV1 {
    pub reason: DomainAvailabilityReasonV1,
    pub namespace: JsString,
    pub owner: DomainAvailabilityOwnerV1,
    pub extension_schema_version: u64,
    pub module_id: StableId,
    pub contribution_id: StableId,
    pub supported_schema_versions: Vec<u64>,
}

#[derive(Debug, Eq, PartialEq)]
pub struct DomainAvailabilityV1 {
    pub facts: Vec<DomainAvailabilityFactV1>,
}

impl DomainAvailabilityV1 {
    /// Complete implies writable; otherwise TS projects read-only with reason
    /// domain-validation-incomplete and uses the same facts in both statuses.
    pub fn is_complete(&self) -> bool {
        self.facts.is_empty()
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum AvailabilityFailureV1 {
    Capacity,
    Internal,
    FactLimit { limit: u64, actual: u64 },
}

pub fn compute_domain_availability_v1<'a>(
    assembly: &ResolvedHostAssemblyV1,
    headers: impl IntoIterator<Item = BorrowedExtensionHeaderV1<'a>>,
) -> Result<DomainAvailabilityV1, AvailabilityFailureV1> {
    try_compute_domain_availability_v1(assembly, headers.into_iter().map(Ok))
}

/// A broken source traversal is an error, never an omitted header. External
/// iterators execute without holding the catalog identity-cache lock.
pub fn try_compute_domain_availability_v1<'a>(
    assembly: &ResolvedHostAssemblyV1,
    headers: impl IntoIterator<Item = Result<BorrowedExtensionHeaderV1<'a>, AvailabilityFailureV1>>,
) -> Result<DomainAvailabilityV1, AvailabilityFailureV1> {
    let mut facts = Vec::new();
    for header in headers {
        let header = header?;
        let Ok(index) = assembly.requirements().binary_search_by(|requirement| {
            requirement
                .namespace
                .bytes()
                .map(u16::from)
                .cmp(header.namespace.code_units().iter().copied())
        }) else {
            continue;
        };
        let requirement = &assembly.requirements()[index];
        let reason = if requirement
            .supported_schema_versions
            .binary_search(&header.schema_version)
            .is_err()
        {
            DomainAvailabilityReasonV1::RequiredContributionIncompatible
        } else if !assembly.is_installed(requirement) {
            DomainAvailabilityReasonV1::RequiredContributionUnavailable
        } else {
            continue;
        };
        // Count the would-be fact before allocating it: the TS observable bound
        // reports exactly limit + 1 and does not enumerate the rest of the input.
        if facts.len() as u64 == DOMAIN_AVAILABILITY_FACT_LIMIT_V1 {
            return Err(AvailabilityFailureV1::FactLimit {
                limit: DOMAIN_AVAILABILITY_FACT_LIMIT_V1,
                actual: DOMAIN_AVAILABILITY_FACT_LIMIT_V1 + 1,
            });
        }
        facts
            .try_reserve(1)
            .map_err(|_| AvailabilityFailureV1::Capacity)?;
        let mut versions = Vec::new();
        versions
            .try_reserve(requirement.supported_schema_versions.len())
            .map_err(|_| AvailabilityFailureV1::Capacity)?;
        versions.extend_from_slice(&requirement.supported_schema_versions);
        facts.push(DomainAvailabilityFactV1 {
            reason,
            namespace: header.namespace.clone(),
            owner: match header.owner {
                ExtensionOwnerRefV1::Score => DomainAvailabilityOwnerV1::Score,
                ExtensionOwnerRefV1::Part(id) => DomainAvailabilityOwnerV1::Part(id.clone()),
            },
            extension_schema_version: header.schema_version,
            module_id: requirement.module_id.clone(),
            contribution_id: requirement.contribution_id.clone(),
            supported_schema_versions: versions,
        });
    }
    facts.sort_unstable_by(|left, right| {
        left.namespace
            .cmp(&right.namespace)
            .then_with(|| left.owner.cmp(&right.owner))
            .then_with(|| {
                left.extension_schema_version
                    .cmp(&right.extension_schema_version)
            })
            .then_with(|| left.module_id.cmp(&right.module_id))
            .then_with(|| left.contribution_id.cmp(&right.contribution_id))
            .then_with(|| left.reason.cmp(&right.reason))
    });
    Ok(DomainAvailabilityV1 { facts })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        ExtensionRuntimeRequirementV1, HostCatalogV1, HostInstalledContributionsV1,
        InventorySelectionV1,
    };
    use std::sync::Arc;

    fn absent_assembly() -> Arc<ResolvedHostAssemblyV1> {
        HostCatalogV1::new(HostInstalledContributionsV1 {
            contributions: Vec::new(),
        })
        .unwrap()
        .resolve_inventory(InventorySelectionV1::Explicit(vec![
            ExtensionRuntimeRequirementV1 {
                protocol_version: 1,
                namespace: "known".into(),
                module_id: StableId::new("absent").unwrap(),
                contribution_id: StableId::new("domain").unwrap(),
                supported_schema_versions: vec![1],
                required_for_write: true,
            },
        ]))
        .unwrap()
    }

    #[test]
    fn incompatible_precedes_missing_and_owners_use_raw_utf16_order() {
        let known = JsString::from("known");
        let unknown = JsString::from("unknown");
        let part = JsString::from("part");
        let result = compute_domain_availability_v1(
            &absent_assembly(),
            [
                BorrowedExtensionHeaderV1 {
                    namespace: &known,
                    owner: ExtensionOwnerRefV1::Part(&part),
                    schema_version: 1,
                },
                BorrowedExtensionHeaderV1 {
                    namespace: &known,
                    owner: ExtensionOwnerRefV1::Score,
                    schema_version: 2,
                },
                BorrowedExtensionHeaderV1 {
                    namespace: &unknown,
                    owner: ExtensionOwnerRefV1::Score,
                    schema_version: 999,
                },
            ],
        )
        .unwrap();
        assert!(!result.is_complete());
        assert_eq!(result.facts.len(), 2);
        assert_eq!(result.facts[0].owner, DomainAvailabilityOwnerV1::Score);
        assert_eq!(
            result.facts[0].reason,
            DomainAvailabilityReasonV1::RequiredContributionIncompatible
        );
        assert_eq!(
            result.facts[1].reason,
            DomainAvailabilityReasonV1::RequiredContributionUnavailable
        );
    }

    #[test]
    fn cap_stops_at_first_excess_fact_and_source_errors_are_not_dropped() {
        let assembly = absent_assembly();
        let namespace = JsString::from("known");
        let header = BorrowedExtensionHeaderV1 {
            namespace: &namespace,
            owner: ExtensionOwnerRefV1::Score,
            schema_version: 1,
        };
        let mut visited = 0;
        let headers = std::iter::repeat_with(|| {
            visited += 1;
            header
        });
        assert_eq!(
            compute_domain_availability_v1(&assembly, headers),
            Err(AvailabilityFailureV1::FactLimit {
                limit: 131_072,
                actual: 131_073
            })
        );
        assert_eq!(visited, 131_073);
        assert_eq!(
            try_compute_domain_availability_v1(
                &assembly,
                [Ok(header), Err(AvailabilityFailureV1::Internal)]
            ),
            Err(AvailabilityFailureV1::Internal)
        );
    }
}
