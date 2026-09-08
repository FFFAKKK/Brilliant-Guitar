use crate::decode_extension_runtime_requirement_v1;
use brilliant_score_foundation::decode_lossless_json;
use serde_json::{Value, json};

#[test]
fn extension_requirements_match_fixed_typescript_wire_oracle() {
    let oracle: Value = serde_json::from_str(include_str!(
        "../../../test/core-kernel/rust-migration/fixtures/extension-requirement-oracle-v1.json"
    ))
    .unwrap();
    assert_eq!(oracle["schemaVersion"], 1);
    let cases = oracle["cases"].as_array().unwrap();
    assert!(cases.len() > 100);
    let mut accepted = 0;
    let mut rejected = 0;
    for case in cases {
        let input = decode_lossless_json(case["inputJson"].as_str().unwrap());
        let actual = input
            .as_ref()
            .ok()
            .and_then(decode_extension_runtime_requirement_v1);
        if case["expected"]["status"] == "accepted" {
            accepted += 1;
            let value = actual.unwrap_or_else(|| panic!("rejected accepted case {}", case["id"]));
            // The private protocol DTO has protocolVersion; the existing TS wire
            // has requirementVersion. Compare the complete explicit projection.
            let projection = json!({
                "requirementVersion": value.protocol_version,
                "namespace": value.namespace,
                "moduleId": value.module_id,
                "contributionId": value.contribution_id,
                "supportedSchemaVersions": value.supported_schema_versions,
                "requiredForWrite": value.required_for_write,
            });
            assert_eq!(projection, case["expected"]["value"], "{}", case["id"]);
        } else {
            rejected += 1;
            assert_eq!(case["expected"]["status"], "rejected");
            assert!(actual.is_none(), "accepted rejected case {}", case["id"]);
        }
    }
    assert!(accepted > 10);
    assert!(rejected > accepted);
}
