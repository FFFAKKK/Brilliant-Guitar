use brilliant_extension_protocol::{
    AvailabilityFailureV1, BorrowedExtensionHeaderV1, DomainAvailabilityV1, ExtensionOwnerRefV1,
    ResolvedHostAssemblyV1, try_compute_domain_availability_v1,
};
use brilliant_score_foundation::ExtensionOwnerV1;

use super::KernelRuntime;

/// This explicit read walks extension headers, not the document or payloads.
/// Failed reads retain their actual visited-header count.
#[derive(Debug)]
pub struct DomainAvailabilityAssessmentV1 {
    pub result: Result<DomainAvailabilityV1, AvailabilityFailureV1>,
    pub extension_headers_visited: u64,
}

impl KernelRuntime {
    pub fn assess_domain_availability(
        &self,
        assembly: &ResolvedHostAssemblyV1,
    ) -> DomainAvailabilityAssessmentV1 {
        let mut extension_headers_visited = 0_u64;
        let headers = self.store.topology.extension_order.iter().map(|handle| {
            extension_headers_visited = extension_headers_visited.saturating_add(1);
            let record = self
                .store
                .extensions
                .get(*handle)
                .ok_or(AvailabilityFailureV1::Internal)?;
            Ok(BorrowedExtensionHeaderV1 {
                namespace: &record.namespace,
                owner: match &record.owner {
                    ExtensionOwnerV1::Score => ExtensionOwnerRefV1::Score,
                    ExtensionOwnerV1::Part { part_id } => {
                        ExtensionOwnerRefV1::Part(part_id.as_js_string())
                    }
                },
                schema_version: record.schema_version.get() as u64,
            })
        });
        let result = try_compute_domain_availability_v1(assembly, headers);
        DomainAvailabilityAssessmentV1 {
            result,
            extension_headers_visited,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use brilliant_extension_protocol::{
        HostCatalogV1, HostInstalledContributionsV1, InventorySelectionV1,
    };

    #[test]
    fn a_missing_store_header_is_an_error_with_actual_partial_work() {
        let catalog = HostCatalogV1::new(HostInstalledContributionsV1 {
            contributions: vec![],
        })
        .unwrap();
        let assembly = catalog
            .resolve_inventory(InventorySelectionV1::Omitted)
            .unwrap();
        let mut runtime = KernelRuntime::create(crate::store::tests::fixture()).unwrap();
        let first = runtime.store.topology.extension_order[0];
        runtime.store.extensions.remove(first).unwrap();
        let metrics = runtime.committed_metrics;
        let read = runtime.assess_domain_availability(&assembly);
        assert_eq!(read.result, Err(AvailabilityFailureV1::Internal));
        assert_eq!(read.extension_headers_visited, 1);
        assert_eq!(runtime.committed_metrics, metrics);
        assert_eq!(runtime.document_version().get(), 0);
    }
}
