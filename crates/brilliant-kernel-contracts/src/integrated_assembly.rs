//! Wire projection for captured host assembly metadata. Catalog identity comes
//! from a trusted host, never from a field in the inventory's JSON data.
use std::{collections::HashSet, io::Write, sync::Arc};

use brilliant_core_types::{JsonValue, LosslessJsonValue, StableId};
use brilliant_extension_protocol::*;
use brilliant_score_foundation::{LosslessEncode, LosslessJsonError, LosslessObjectWriter};

use crate::{
    StableFailureV1,
    integrated_requirement::{
        RequirementDecodeFailure, RequirementReservation, try_decode_requirement,
    },
};

fn requirement_failure(
    failure: RequirementDecodeFailure,
    invalid: HostAssemblyFailureV1,
) -> HostAssemblyFailureV1 {
    match failure {
        RequirementDecodeFailure::Invalid => invalid,
        RequirementDecodeFailure::Capacity => HostAssemblyFailureV1::Capacity,
    }
}

pub enum KnownInventoryInputV1<'a> {
    Omitted,
    Explicit(&'a LosslessJsonValue),
    /// Includes an explicitly supplied JS undefined or failed host capture.
    InvalidExplicit,
}

/// Decode the data produced by the authenticated SDK host capture. This does
/// not authenticate a JS catalog; the private host bridge must do that first.
pub fn decode_host_catalog_projection_v1(
    value: &LosslessJsonValue,
) -> Result<HostCatalogV1, HostAssemblyFailureV1> {
    decode_host_projection(value, RequirementReservation::default())
}

fn decode_host_projection(
    value: &LosslessJsonValue,
    reservation: RequirementReservation,
) -> Result<HostCatalogV1, HostAssemblyFailureV1> {
    let invalid = HostAssemblyFailureV1::InvalidHostProjection;
    let JsonValue::Object(root) = value else {
        return Err(invalid);
    };
    let entries = root
        .iter()
        .find(|(name, _)| name.eq_ascii("contributions"))
        .map(|(_, value)| value);
    let Some(JsonValue::Array(entries)) = entries else {
        return Err(invalid);
    };
    if root.len() != 1 || entries.len() > HOST_CONTRIBUTION_LIMIT_V1 {
        return Err(invalid);
    }
    let mut contributions = Vec::new();
    contributions
        .try_reserve(entries.len())
        .map_err(|_| HostAssemblyFailureV1::Capacity)?;
    let mut requirement_count = 0;
    for entry in entries {
        let JsonValue::Object(fields) = entry else {
            return Err(invalid);
        };
        if fields.len() != 3 {
            return Err(invalid);
        }
        let get = |key: &str| {
            fields
                .iter()
                .find(|(name, _)| name.eq_ascii(key))
                .map(|(_, value)| value)
        };
        let Some(JsonValue::String(module_id)) = get("moduleId") else {
            return Err(invalid);
        };
        let Some(JsonValue::String(contribution_id)) = get("contributionId") else {
            return Err(invalid);
        };
        let Some(JsonValue::Array(values)) = get("requirements") else {
            return Err(invalid);
        };
        if values.is_empty() || values.len() > KNOWN_REQUIREMENT_LIMIT_V1 - requirement_count {
            return Err(invalid);
        }
        requirement_count += values.len();
        let mut requirements = Vec::new();
        requirements
            .try_reserve(values.len())
            .map_err(|_| HostAssemblyFailureV1::Capacity)?;
        for value in values {
            requirements.push(
                try_decode_requirement(value, reservation)
                    .map_err(|failure| requirement_failure(failure, invalid))?,
            );
        }
        contributions.push(HostInstalledContributionV1 {
            module_id: StableId::new(module_id).map_err(|_| invalid)?,
            contribution_id: StableId::new(contribution_id).map_err(|_| invalid)?,
            requirements,
        });
    }
    HostCatalogV1::new(HostInstalledContributionsV1 { contributions })
}

pub fn decode_known_requirement_inventory_v1(
    value: &LosslessJsonValue,
) -> Option<Vec<ExtensionRuntimeRequirementV1>> {
    decode_inventory(value, RequirementReservation::default()).ok()
}

fn decode_inventory(
    value: &LosslessJsonValue,
    reservation: RequirementReservation,
) -> Result<Vec<ExtensionRuntimeRequirementV1>, HostAssemblyFailureV1> {
    let invalid = HostAssemblyFailureV1::InvalidInventory;
    let JsonValue::Object(fields) = value else {
        return Err(invalid);
    };
    if fields.len() != 2 {
        return Err(invalid);
    }
    let get = |key: &str| {
        fields
            .iter()
            .find(|(name, _)| name.eq_ascii(key))
            .map(|(_, value)| value)
            .ok_or(invalid)
    };
    if crate::integrated_requirement::integer(get("inventoryVersion")?).ok_or(invalid)? != 1 {
        return Err(invalid);
    }
    let JsonValue::Array(values) = get("requirements")? else {
        return Err(invalid);
    };
    if values.len() > KNOWN_REQUIREMENT_LIMIT_V1 {
        return Err(invalid);
    }
    let mut requirements = Vec::new();
    requirements
        .try_reserve(values.len())
        .map_err(|_| HostAssemblyFailureV1::Capacity)?;
    for value in values {
        requirements.push(
            try_decode_requirement(value, reservation)
                .map_err(|failure| requirement_failure(failure, invalid))?,
        );
    }
    let mut namespaces = HashSet::new();
    namespaces
        .try_reserve(requirements.len())
        .map_err(|_| HostAssemblyFailureV1::Capacity)?;
    for value in &requirements {
        if !namespaces.insert(value.namespace.as_str()) {
            return Err(invalid);
        }
    }
    Ok(requirements)
}

pub fn resolve_host_assembly_v1(
    catalog: Option<&HostCatalogV1>,
    input: KnownInventoryInputV1<'_>,
) -> Result<Arc<ResolvedHostAssemblyV1>, HostAssemblyFailureV1> {
    resolve_assembly(catalog, input, RequirementReservation::default())
}

fn resolve_assembly(
    catalog: Option<&HostCatalogV1>,
    input: KnownInventoryInputV1<'_>,
    reservation: RequirementReservation,
) -> Result<Arc<ResolvedHostAssemblyV1>, HostAssemblyFailureV1> {
    // Identity failure wins even when explicit inventory capture also failed.
    let catalog = catalog.ok_or(HostAssemblyFailureV1::InvalidHostProjection)?;
    let selection = match input {
        KnownInventoryInputV1::Omitted => InventorySelectionV1::Omitted,
        KnownInventoryInputV1::Explicit(value) => {
            InventorySelectionV1::Explicit(decode_inventory(value, reservation)?)
        }
        KnownInventoryInputV1::InvalidExplicit => {
            return Err(HostAssemblyFailureV1::InvalidInventory);
        }
    };
    catalog.resolve_inventory(selection)
}

pub fn encode_known_requirement_inventory_v1(
    requirements: &[ExtensionRuntimeRequirementV1],
) -> Result<Vec<u8>, StableFailureV1> {
    crate::codec::encode_capped(&InventoryWire(requirements))
}

pub fn encode_domain_availability_result_v1(
    result: &Result<DomainAvailabilityV1, AvailabilityFailureV1>,
) -> Result<Vec<u8>, StableFailureV1> {
    match result {
        Err(AvailabilityFailureV1::Capacity | AvailabilityFailureV1::Internal) => {
            Err(StableFailureV1::BridgeInternal)
        }
        _ => crate::codec::encode_capped(&AvailabilityResultWire(result)),
    }
}

struct RequirementWire<'a>(&'a ExtensionRuntimeRequirementV1);
struct InventoryWire<'a>(&'a [ExtensionRuntimeRequirementV1]);
struct FactWire<'a>(&'a DomainAvailabilityFactV1);
struct OwnerWire<'a>(&'a DomainAvailabilityOwnerV1);
struct AvailabilityWire<'a>(&'a DomainAvailabilityV1);
struct AvailabilityResultWire<'a>(&'a Result<DomainAvailabilityV1, AvailabilityFailureV1>);
struct StatusWire<'a> {
    value: &'a DomainAvailabilityV1,
    write: bool,
}
struct WireArray<I>(I);

impl<I, T> LosslessEncode for WireArray<I>
where
    I: Clone + Iterator<Item = T>,
    T: LosslessEncode,
{
    fn write_lossless<W: Write + ?Sized>(&self, writer: &mut W) -> Result<(), LosslessJsonError> {
        writer.write_all(b"[").map_err(LosslessJsonError::Write)?;
        for (index, value) in self.0.clone().enumerate() {
            if index != 0 {
                writer.write_all(b",").map_err(LosslessJsonError::Write)?;
            }
            value.write_lossless(writer)?;
        }
        writer.write_all(b"]").map_err(LosslessJsonError::Write)
    }
}

impl LosslessEncode for RequirementWire<'_> {
    fn write_lossless<W: Write + ?Sized>(&self, writer: &mut W) -> Result<(), LosslessJsonError> {
        let value = self.0;
        let mut object = LosslessObjectWriter::new(writer)?;
        object.field("requirementVersion", &value.protocol_version)?;
        object.field("namespace", &value.namespace)?;
        object.field("moduleId", &value.module_id)?;
        object.field("contributionId", &value.contribution_id)?;
        object.field("supportedSchemaVersions", &value.supported_schema_versions)?;
        object.field("requiredForWrite", &value.required_for_write)?;
        object.end()
    }
}

impl LosslessEncode for InventoryWire<'_> {
    fn write_lossless<W: Write + ?Sized>(&self, writer: &mut W) -> Result<(), LosslessJsonError> {
        let mut object = LosslessObjectWriter::new(writer)?;
        object.field("inventoryVersion", &1_u64)?;
        object.field(
            "requirements",
            &WireArray(self.0.iter().map(RequirementWire)),
        )?;
        object.end()
    }
}

impl LosslessEncode for OwnerWire<'_> {
    fn write_lossless<W: Write + ?Sized>(&self, writer: &mut W) -> Result<(), LosslessJsonError> {
        let mut object = LosslessObjectWriter::new(writer)?;
        match self.0 {
            DomainAvailabilityOwnerV1::Score => object.field("kind", "score")?,
            DomainAvailabilityOwnerV1::Part(part_id) => {
                object.field("kind", "part")?;
                object.field("partId", part_id)?;
            }
        }
        object.end()
    }
}

impl LosslessEncode for FactWire<'_> {
    fn write_lossless<W: Write + ?Sized>(&self, writer: &mut W) -> Result<(), LosslessJsonError> {
        let value = self.0;
        let mut object = LosslessObjectWriter::new(writer)?;
        object.field(
            "reason",
            match value.reason {
                DomainAvailabilityReasonV1::RequiredContributionIncompatible => {
                    "required-contribution-incompatible"
                }
                DomainAvailabilityReasonV1::RequiredContributionUnavailable => {
                    "required-contribution-unavailable"
                }
            },
        )?;
        object.field("namespace", &value.namespace)?;
        object.field("owner", &OwnerWire(&value.owner))?;
        object.field("extensionSchemaVersion", &value.extension_schema_version)?;
        object.field("moduleId", &value.module_id)?;
        object.field("contributionId", &value.contribution_id)?;
        object.field("supportedSchemaVersions", &value.supported_schema_versions)?;
        object.end()
    }
}

impl LosslessEncode for StatusWire<'_> {
    fn write_lossless<W: Write + ?Sized>(&self, writer: &mut W) -> Result<(), LosslessJsonError> {
        let mut object = LosslessObjectWriter::new(writer)?;
        object.field(
            "status",
            match (self.write, self.value.is_complete()) {
                (true, true) => "writable",
                (true, false) => "read-only",
                (false, true) => "complete",
                (false, false) => "incomplete",
            },
        )?;
        if !self.value.is_complete() {
            if self.write {
                object.field("reason", "domain-validation-incomplete")?;
            }
            object.field("facts", &WireArray(self.value.facts.iter().map(FactWire)))?;
        }
        object.end()
    }
}

impl LosslessEncode for AvailabilityWire<'_> {
    fn write_lossless<W: Write + ?Sized>(&self, writer: &mut W) -> Result<(), LosslessJsonError> {
        let mut object = LosslessObjectWriter::new(writer)?;
        object.field("facts", &WireArray(self.0.facts.iter().map(FactWire)))?;
        object.field(
            "writeAvailability",
            &StatusWire {
                value: self.0,
                write: true,
            },
        )?;
        object.field(
            "validationAvailability",
            &StatusWire {
                value: self.0,
                write: false,
            },
        )?;
        object.end()
    }
}

impl LosslessEncode for AvailabilityResultWire<'_> {
    fn write_lossless<W: Write + ?Sized>(&self, writer: &mut W) -> Result<(), LosslessJsonError> {
        let mut object = LosslessObjectWriter::new(writer)?;
        match self.0 {
            Ok(value) => {
                object.field("ok", &true)?;
                object.field("value", &AvailabilityWire(value))?;
            }
            Err(AvailabilityFailureV1::FactLimit { limit, actual }) => {
                object.field("ok", &false)?;
                object.field("limit", limit)?;
                object.field("actual", actual)?;
            }
            Err(_) => {
                return Err(LosslessJsonError::Write(std::io::Error::other(
                    "invalid availability output",
                )));
            }
        }
        object.end()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::integrated_requirement::RequirementAllocation;
    use brilliant_score_foundation::decode_lossless_json;

    #[test]
    fn requirement_reservation_failure_stays_capacity_through_host_and_inventory() {
        let requirement = r#"{"requirementVersion":1,"namespace":"example.notes","moduleId":"example.module","contributionId":"example.contribution","supportedSchemaVersions":[1,2],"requiredForWrite":true}"#;
        let host = decode_lossless_json(&format!(
            r#"{{"contributions":[{{"moduleId":"example.module","contributionId":"example.contribution","requirements":[{requirement}]}}]}}"#
        ))
        .unwrap();
        let inventory = decode_lossless_json(&format!(
            r#"{{"inventoryVersion":1,"requirements":[{requirement}]}}"#
        ))
        .unwrap();
        let catalog = decode_host_catalog_projection_v1(&host).unwrap();
        let baseline =
            resolve_host_assembly_v1(Some(&catalog), KnownInventoryInputV1::Omitted).unwrap();
        for allocation in [
            RequirementAllocation::Namespace,
            RequirementAllocation::Versions,
        ] {
            let reservation = RequirementReservation::fail_at(allocation);
            assert!(matches!(
                decode_host_projection(&host, reservation),
                Err(HostAssemblyFailureV1::Capacity)
            ));
            // Even an already-cached inventory must be validated before reuse.
            assert!(matches!(
                resolve_assembly(
                    Some(&catalog),
                    KnownInventoryInputV1::Explicit(&inventory),
                    reservation,
                ),
                Err(HostAssemblyFailureV1::Capacity)
            ));
            assert!(matches!(
                resolve_assembly(
                    None,
                    KnownInventoryInputV1::Explicit(&inventory),
                    reservation,
                ),
                Err(HostAssemblyFailureV1::InvalidHostProjection)
            ));
            let recovered = resolve_host_assembly_v1(
                Some(&catalog),
                KnownInventoryInputV1::Explicit(&inventory),
            )
            .unwrap();
            assert!(Arc::ptr_eq(&baseline, &recovered));
        }
        let invalid = decode_lossless_json("{}").unwrap();
        assert!(matches!(
            decode_host_catalog_projection_v1(&invalid),
            Err(HostAssemblyFailureV1::InvalidHostProjection)
        ));
        assert!(matches!(
            resolve_host_assembly_v1(Some(&catalog), KnownInventoryInputV1::Explicit(&invalid)),
            Err(HostAssemblyFailureV1::InvalidInventory)
        ));
    }

    #[test]
    fn catalog_identity_precedes_inventory_and_assembly_failures_have_distinct_wire_results() {
        assert!(matches!(
            resolve_host_assembly_v1(None, KnownInventoryInputV1::InvalidExplicit),
            Err(HostAssemblyFailureV1::InvalidHostProjection)
        ));
        let empty = decode_host_catalog_projection_v1(
            &decode_lossless_json(r#"{"contributions":[]}"#).unwrap(),
        )
        .unwrap();
        assert!(matches!(
            resolve_host_assembly_v1(Some(&empty), KnownInventoryInputV1::InvalidExplicit),
            Err(HostAssemblyFailureV1::InvalidInventory)
        ));
        for invalid in [
            r#"{"contributions":[],"authenticated":true}"#,
            r#"{"contributions":null}"#,
            r#"{}"#,
        ] {
            assert!(matches!(
                decode_host_catalog_projection_v1(&decode_lossless_json(invalid).unwrap()),
                Err(HostAssemblyFailureV1::InvalidHostProjection)
            ));
        }
        let cap = Err(AvailabilityFailureV1::FactLimit {
            limit: 131_072,
            actual: 131_073,
        });
        assert_eq!(
            encode_domain_availability_result_v1(&cap).unwrap(),
            br#"{"ok":false,"limit":131072,"actual":131073}"#
        );
        for failure in [
            AvailabilityFailureV1::Capacity,
            AvailabilityFailureV1::Internal,
        ] {
            assert_eq!(
                encode_domain_availability_result_v1(&Err(failure)),
                Err(StableFailureV1::BridgeInternal)
            );
        }
    }
}
