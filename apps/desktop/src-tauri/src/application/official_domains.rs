//! One fixed official catalog/executor for the product's existing integrated session.
use super::{domain_value::*, guitar_domain, key_signature};
use brilliant_core_types::JsonValue;
use brilliant_extension_protocol::{
    AvailabilityFailureV1, BorrowedExtensionHeaderV1, ExtensionOwnerRefV1, InventorySelectionV1,
    ResolvedHostAssemblyV1, compute_domain_availability_v1,
};
use brilliant_kernel_session::{ContributionExecutionFailureV2, ContributionExecutorV2};
use brilliant_score_foundation::{
    ExtensionOwnerV1, LosslessDecode, LosslessEncode, ScoreDocumentV1, decode_js_value_json,
};
use serde_json::json;
use std::sync::Arc;
pub(super) fn assembly() -> Value {
    decode_js_value_json(include_str!("official_domains/assembly.json"))
        .expect("generated first-party assembly")
}
pub(super) struct Executor {
    assembly: Arc<ResolvedHostAssemblyV1>,
}
impl Executor {
    pub(super) fn new() -> Result<Self, ()> {
        let input = assembly();
        let catalog = brilliant_kernel_contracts::decode_host_catalog_projection_v1(
            field(&input, "catalog").ok_or(())?,
        )
        .map_err(|_| ())?;
        Ok(Self {
            assembly: catalog
                .resolve_inventory(InventorySelectionV1::Omitted)
                .map_err(|_| ())?,
        })
    }
    fn callback(&self, input: &Value) -> CallbackResult<Value> {
        let document = ScoreDocumentV1::from_lossless_value(
            field(input, "document").ok_or_else(internal)?.clone(),
        )
        .map_err(|_| internal())?;
        if tag(input, "operation", "assess") {
            return self.assess(input, &document);
        }
        if tag(input, "operation", "prepare") {
            let command = field(input, "command").ok_or_else(invalid)?;
            if tag(command, "commandId", key_signature::COMMAND) {
                return key_signature::prepare(input, &document);
            }
            return guitar_domain::prepare(input, &document);
        }
        if tag(input, "operation", "transform") {
            if tag(input, "contributionId", guitar_domain::CONTRIBUTION) {
                return guitar_domain::transform(input, &document);
            }
            return key_signature::transform(input, &document);
        }
        Err(internal())
    }
    fn assess(&self, input: &Value, document: &ScoreDocumentV1) -> CallbackResult<Value> {
        let availability=compute_domain_availability_v1(&self.assembly,document.extensions.iter().map(|b|BorrowedExtensionHeaderV1{
            namespace:&b.namespace,schema_version:b.schema_version.get() as u64,owner:match &b.owner {
                ExtensionOwnerV1::Score=>ExtensionOwnerRefV1::Score,
                ExtensionOwnerV1::Part{part_id}=>ExtensionOwnerRefV1::Part(part_id.as_js_string()),
            },
        })).map_err(|failure| match failure {
            AvailabilityFailureV1::FactLimit{limit,actual}=>literal(json!({"code":"command.resource-limit-exceeded","limitKind":"compatibility-facts","limit":limit,"actual":actual})),
            _=>internal(),
        })?;
        let encoded =
            brilliant_kernel_contracts::encode_domain_availability_result_v1(&Ok(availability))
                .map_err(|_| internal())?;
        let decoded = decode_js_value_json(std::str::from_utf8(&encoded).map_err(|_| internal())?)
            .map_err(|_| internal())?;
        // Canonical compiled catalog order is Guitar, then Key Signature.
        let mut issues = vec![];
        for result in [
            guitar_domain::validate(document),
            key_signature::validate(document),
        ] {
            if let Err(failure) = result {
                issues.extend(
                    array(field(&failure, "issues").ok_or_else(internal)?)
                        .ok_or_else(internal)?
                        .iter()
                        .cloned(),
                );
            }
        }
        if !issues.is_empty() {
            return Err(object([
                (
                    "code",
                    literal(json!("command.contribution-semantic-invalid")),
                ),
                ("issues", JsonValue::Array(issues)),
            ]));
        }
        let modules=[(guitar_domain::NAMESPACE,guitar_domain::CONTRIBUTION),
            (key_signature::NAMESPACE,"brilliant.notation.key-signature.v1")].into_iter()
            .filter(|(namespace,_)|document.extensions.iter().any(|b|b.namespace.eq_ascii(namespace)
                && if *namespace == guitar_domain::NAMESPACE {
                    guitar_domain::supports_schema_version(b.schema_version.get())
                } else { b.schema_version.get() == 1 }))
            .map(|(module_id,contribution_id)|literal(json!({"moduleId":module_id,"contributionId":contribution_id,"status":"supported","issues":[]}))).collect();
        Ok(object([
            ("ok", JsonValue::Bool(true)),
            (
                "availability",
                field(&decoded, "value").ok_or_else(internal)?.clone(),
            ),
            (
                "assessment",
                object([
                    (
                        "core",
                        field(input, "coreAssessment").ok_or_else(internal)?.clone(),
                    ),
                    ("modules", JsonValue::Array(modules)),
                ]),
            ),
        ]))
    }
}
impl ContributionExecutorV2 for Executor {
    fn execute(&mut self, bytes: &[u8]) -> Result<Vec<u8>, ContributionExecutionFailureV2> {
        let input = decode_js_value_json(
            std::str::from_utf8(bytes).map_err(|_| ContributionExecutionFailureV2::Callback)?,
        )
        .map_err(|_| ContributionExecutionFailureV2::Callback)?;
        let output = match self.callback(&input) {
            Ok(v) => v,
            Err(f) => object([("ok", JsonValue::Bool(false)), ("failure", f)]),
        };
        let mut bytes = Vec::new();
        output
            .write_lossless(&mut bytes)
            .map_err(|_| ContributionExecutionFailureV2::Callback)?;
        if bytes.len() > brilliant_kernel_contracts::RESPONSE_BYTE_LIMIT {
            return Err(ContributionExecutionFailureV2::Callback);
        }
        Ok(bytes)
    }
}
pub(super) fn can_project_plain(document: &ScoreDocumentV1) -> bool {
    document.extensions.iter().all(|b| {
        key_signature::supported_block(document, b) || guitar_domain::supported_block(document, b)
    })
}
#[cfg(test)]
mod tests;
