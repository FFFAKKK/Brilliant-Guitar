use crate::*;
use brilliant_core_types::{JsString, LosslessJsonValue};
use brilliant_extension_protocol::*;
use brilliant_score_foundation::decode_lossless_json;
use serde_json::Value;
use std::sync::Arc;

fn field<'a>(value: &'a LosslessJsonValue, name: &str) -> &'a LosslessJsonValue {
    let LosslessJsonValue::Object(fields) = value else {
        panic!("object")
    };
    fields.get(&JsString::from(name)).unwrap()
}

fn text(value: &LosslessJsonValue) -> &JsString {
    let LosslessJsonValue::String(value) = value else {
        panic!("string")
    };
    value
}

fn array(value: &LosslessJsonValue) -> &[LosslessJsonValue] {
    let LosslessJsonValue::Array(value) = value else {
        panic!("array")
    };
    value
}

fn catalog(input: &LosslessJsonValue) -> Result<HostCatalogV1, HostAssemblyFailureV1> {
    decode_host_catalog_projection_v1(&LosslessJsonValue::Object(
        [(
            JsString::from("contributions"),
            field(input, "installed").clone(),
        )]
        .into(),
    ))
}

fn resolve(
    catalog: &HostCatalogV1,
    input: &LosslessJsonValue,
) -> Result<Arc<ResolvedHostAssemblyV1>, HostAssemblyFailureV1> {
    let inventory = field(input, "inventory");
    let kind = text(field(inventory, "kind"));
    let selection = if kind.eq_ascii("omitted") {
        KnownInventoryInputV1::Omitted
    } else if kind.eq_ascii("explicit-undefined") {
        KnownInventoryInputV1::InvalidExplicit
    } else {
        assert!(kind.eq_ascii("explicit"));
        KnownInventoryInputV1::Explicit(field(inventory, "value"))
    };
    resolve_host_assembly_v1(Some(catalog), selection)
}

#[test]
fn host_assembly_matches_real_typescript_catalog_inventory_oracle() {
    let oracle: Value = serde_json::from_str(include_str!(
        "../../../test/core-kernel/rust-migration/fixtures/extension-assembly-oracle-v1.json"
    ))
    .unwrap();
    assert_eq!(oracle["schemaVersion"], 1);
    for case in oracle["cases"].as_array().unwrap() {
        let input = decode_lossless_json(case["inputJson"].as_str().unwrap()).unwrap();
        // Preserve real TS catalog failure evidence without claiming that the
        // host projection exposes the complete public Catalog failure union.
        if case["expected"]["status"] == "catalog-rejected" {
            if case["expected"]["stage"] == "catalog-compilation" {
                assert!(case["expected"]["failure"]["code"].is_string());
            } else {
                assert_eq!(case["expected"]["stage"], "contribution-definition");
            }
            assert!(matches!(
                catalog(&input),
                Err(HostAssemblyFailureV1::InvalidHostProjection)
            ));
            continue;
        }
        let projected =
            decode_lossless_json(case["expected"]["hostProjectionJson"].as_str().unwrap()).unwrap();
        let host = decode_host_catalog_projection_v1(&projected).unwrap();
        let result = resolve(&host, &input);
        if case["expected"]["status"] == "rejected" {
            assert_eq!(case["expected"]["reason"], "inventory");
            assert!(
                matches!(result, Err(HostAssemblyFailureV1::InvalidInventory)),
                "{}",
                case["id"]
            );
            continue;
        }
        let assembly = result.unwrap_or_else(|failure| panic!("{}: {failure:?}", case["id"]));
        let inventory: Value = serde_json::from_slice(
            &encode_known_requirement_inventory_v1(assembly.requirements()).unwrap(),
        )
        .unwrap();
        assert_eq!(inventory, case["expected"]["inventory"], "{}", case["id"]);
        assert_eq!(
            assembly.canonical_inventory_key(),
            case["expected"]["canonicalInventoryKey"].as_str().unwrap(),
            "{}",
            case["id"]
        );
        assert!(
            Arc::ptr_eq(&assembly, &resolve(&host, &input).unwrap()),
            "{}",
            case["id"]
        );
        assert!(
            !Arc::ptr_eq(
                &assembly,
                &resolve(&catalog(&input).unwrap(), &input).unwrap()
            ),
            "{}",
            case["id"]
        );
        assert_eq!(case["expected"]["identity"]["sameCatalogReused"], true);
        assert_eq!(
            case["expected"]["identity"]["differentCatalogIsolated"],
            true
        );
        let headers = array(field(&input, "extensions")).iter().map(|block| {
            let owner = field(block, "owner");
            let owner = if text(field(owner, "kind")).eq_ascii("score") {
                ExtensionOwnerRefV1::Score
            } else {
                ExtensionOwnerRefV1::Part(text(field(owner, "partId")))
            };
            let LosslessJsonValue::Number(version) = field(block, "schemaVersion") else {
                panic!("version")
            };
            BorrowedExtensionHeaderV1 {
                namespace: text(field(block, "namespace")),
                owner,
                schema_version: version.get() as u64,
            }
        });
        let availability = compute_domain_availability_v1(&assembly, headers);
        let encoded = encode_domain_availability_result_v1(&availability).unwrap();
        let actual = decode_lossless_json(std::str::from_utf8(&encoded).unwrap()).unwrap();
        let expected =
            decode_lossless_json(case["expected"]["availabilityJson"].as_str().unwrap()).unwrap();
        assert_eq!(actual, expected, "{}", case["id"]);
    }
}
