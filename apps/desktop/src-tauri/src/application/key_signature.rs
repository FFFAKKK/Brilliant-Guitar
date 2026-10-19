//! Statically linked official notation contribution. No session or mutation authority.
//! Identity/descriptors and callback conformance cases come from the original TS module.
use brilliant_core_types::{JsString, JsonValue};
use super::domain_value::*;
#[cfg(test)]
use brilliant_extension_protocol::{
    BorrowedExtensionHeaderV1, ExtensionOwnerRefV1, InventorySelectionV1, ResolvedHostAssemblyV1,
    compute_domain_availability_v1,
};
#[cfg(test)]
use brilliant_kernel_session::{ContributionExecutionFailureV2, ContributionExecutorV2};
use brilliant_score_foundation::{ExtensionOwnerV1, ScoreDocumentV1};
#[cfg(test)]
use brilliant_score_foundation::{LosslessDecode, LosslessEncode, decode_js_value_json};
use serde_json::json;
use std::collections::BTreeMap;
#[cfg(test)]
use std::sync::Arc;

pub(super) const NAMESPACE: &str = "brilliant.notation.key-signature";
pub(super) const COMMAND: &str = "brilliant.notation.key-signature.set";
const CONTRIBUTION: &str = "brilliant.notation.key-signature.v1";
const EFFECT: &str = "brilliant.notation.key-signature.replace";

#[cfg(test)]
pub(super) fn assembly() -> Value {
    decode_js_value_json(include_str!("key_signature/assembly.json"))
        .expect("generated official assembly")
}

#[cfg(test)]
pub(super) struct Executor {
    assembly: Arc<ResolvedHostAssemblyV1>,
}
#[cfg(test)]
impl Executor {
    pub(super) fn new() -> Result<Self, ()> {
        let input = assembly();
        let catalog = brilliant_kernel_contracts::decode_host_catalog_projection_v1(
            field(&input, "catalog").ok_or(())?,
        )
        .map_err(|_| ())?;
        let assembly = catalog
            .resolve_inventory(InventorySelectionV1::Omitted)
            .map_err(|_| ())?;
        Ok(Self { assembly })
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
            return prepare(input, &document);
        }
        if tag(input, "operation", "transform") {
            return transform(input, &document);
        }
        Err(internal())
    }

    fn assess(&self, input: &Value, document: &ScoreDocumentV1) -> CallbackResult<Value> {
        let compatible: Vec<_> = document
            .extensions
            .iter()
            .filter(|b| b.namespace.eq_ascii(NAMESPACE) && b.schema_version.get() == 1)
            .collect();
        validate(document)?;
        let availability = compute_domain_availability_v1(
            &self.assembly,
            document
                .extensions
                .iter()
                .map(|block| BorrowedExtensionHeaderV1 {
                    namespace: &block.namespace,
                    schema_version: block.schema_version.get() as u64,
                    owner: match &block.owner {
                        ExtensionOwnerV1::Score => ExtensionOwnerRefV1::Score,
                        ExtensionOwnerV1::Part { part_id } => {
                            ExtensionOwnerRefV1::Part(part_id.as_js_string())
                        }
                    },
                }),
        )
        .map_err(|_| internal())?;
        let encoded =
            brilliant_kernel_contracts::encode_domain_availability_result_v1(&Ok(availability))
                .map_err(|_| internal())?;
        let decoded = decode_js_value_json(std::str::from_utf8(&encoded).map_err(|_| internal())?)
            .map_err(|_| internal())?;
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
                    (
                        "modules",
                        JsonValue::Array(if compatible.is_empty() {
                            vec![]
                        } else {
                            vec![literal(
                                json!({"moduleId":NAMESPACE,"contributionId":CONTRIBUTION,"status":"supported","issues":[]}),
                            )]
                        }),
                    ),
                ]),
            ),
        ]))
    }
}
#[cfg(test)]
impl ContributionExecutorV2 for Executor {
    fn execute(&mut self, bytes: &[u8]) -> Result<Vec<u8>, ContributionExecutionFailureV2> {
        let input = decode_js_value_json(
            std::str::from_utf8(bytes).map_err(|_| ContributionExecutionFailureV2::Callback)?,
        )
        .map_err(|_| ContributionExecutionFailureV2::Callback)?;
        let output = match self.callback(&input) {
            Ok(value) => value,
            Err(failure) => object([("ok", JsonValue::Bool(false)), ("failure", failure)]),
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

#[derive(Clone, Debug, Eq, PartialEq)]
pub(super) struct Change {
    pub measure_id: JsString,
    pub fifths: i64,
}
#[derive(Clone)]
struct Edit {
    part_id: JsString,
    measure_id: JsString,
    fifths: Option<i64>,
}

fn fifths(value: &Value) -> Option<i64> {
    let JsonValue::Number(n) = value else {
        return None;
    };
    let n = n.get();
    (n.fract() == 0.0 && (-7.0..=7.0).contains(&n)).then_some(n as i64)
}
fn semantic(reason: &str) -> Value {
    let code = format!("{NAMESPACE}.{reason}");
    literal(
        json!({"code":"command.contribution-semantic-invalid","issues":[{
            "issueVersion":1,"code":code,"severity":"error","messageKey":format!("module.{code}"),
            "source":{"kind":"module","moduleId":NAMESPACE,"contributionId":CONTRIBUTION}
        }]}),
    )
}
fn block_for_part<'a>(
    document: &'a ScoreDocumentV1,
    id: &JsString,
) -> Option<&'a brilliant_score_foundation::ExtensionBlockV1> {
    document.extensions.iter().find(|b| {
        b.namespace.eq_ascii(NAMESPACE)
            && matches!(&b.owner, ExtensionOwnerV1::Part{part_id} if part_id.as_js_string() == id)
    })
}
fn decode_changes(value: &Value) -> Option<Vec<Change>> {
    if !exact(value, &["changes"]) {
        return None;
    }
    let JsonValue::Array(items) = field(value, "changes")? else {
        return None;
    };
    let mut changes: Vec<Change> = Vec::with_capacity(items.len());
    for item in items {
        if !exact(item, &["measureId", "fifths"]) {
            return None;
        }
        let measure_id = string(field(item, "measureId")?)?.clone();
        let value = fifths(field(item, "fifths")?)?;
        if measure_id.is_empty() || changes.last().is_some_and(|c| c.measure_id >= measure_id) {
            return None;
        }
        changes.push(Change {
            measure_id,
            fifths: value,
        });
    }
    Some(changes)
}
fn normalize(document: &ScoreDocumentV1, current: Vec<Change>) -> Vec<Change> {
    let by_id: BTreeMap<_, _> = current
        .into_iter()
        .map(|c| (c.measure_id, c.fifths))
        .collect();
    let mut result = Vec::new();
    let mut effective = 0;
    for measure in &document.measure_definitions {
        if let Some(&value) = by_id.get(measure.id.as_js_string())
            && value != effective
        {
            result.push(Change {
                measure_id: measure.id.as_js_string().clone(),
                fifths: value,
            });
            effective = value;
        }
    }
    result.sort_by(|a, b| a.measure_id.cmp(&b.measure_id));
    result
}
pub(super) fn timeline(document: &ScoreDocumentV1, part_id: &JsString) -> Result<Vec<Change>, ()> {
    let Some(block) = block_for_part(document, part_id) else {
        return Ok(vec![]);
    };
    if block.schema_version.get() != 1 {
        return Err(());
    }
    let current = decode_changes(&JsonValue::Object(block.payload.clone())).ok_or(())?;
    if current.iter().any(|c| {
        !document
            .measure_definitions
            .iter()
            .any(|m| m.id.as_js_string() == &c.measure_id)
    }) || normalize(document, current.clone()) != current
    {
        return Err(());
    }
    Ok(current)
}
pub(super) fn supported_block(document: &ScoreDocumentV1, block: &brilliant_score_foundation::ExtensionBlockV1) -> bool {
    if !block.namespace.eq_ascii(NAMESPACE) { return false; }
    let ExtensionOwnerV1::Part { part_id } = &block.owner else { return false };
    document.parts.iter().any(|p| &p.id == part_id) && timeline(document, part_id.as_js_string()).is_ok()
}
pub(super) fn validate(document: &ScoreDocumentV1) -> CallbackResult<()> {
    for block in document.extensions.iter().filter(|b| b.namespace.eq_ascii(NAMESPACE) && b.schema_version.get() == 1) {
        let ExtensionOwnerV1::Part { part_id } = &block.owner else { return Err(semantic("wrong-owner")) };
        if !document.parts.iter().any(|p| &p.id == part_id) { return Err(semantic("wrong-owner")); }
        timeline(document, part_id.as_js_string()).map_err(|_| semantic("invalid-block"))?;
    }
    Ok(())
}
fn edit(value: &Value) -> Option<Edit> {
    if !exact(value, &["partId", "measureId", "change"]) {
        return None;
    }
    let part_id = string(field(value, "partId")?)?.clone();
    let measure_id = string(field(value, "measureId")?)?.clone();
    if part_id.is_empty() || measure_id.is_empty() {
        return None;
    }
    let change = field(value, "change")?;
    let fifths = if exact(change, &["kind"]) && tag(change, "kind", "inherit") {
        None
    } else if exact(change, &["kind", "fifths"]) && tag(change, "kind", "set") {
        Some(fifths(field(change, "fifths")?)?)
    } else {
        return None;
    };
    Some(Edit {
        part_id,
        measure_id,
        fifths,
    })
}
fn apply(document: &ScoreDocumentV1, current: Vec<Change>, edit: &Edit) -> Vec<Change> {
    let mut updated: Vec<_> = current
        .into_iter()
        .filter(|c| c.measure_id != edit.measure_id)
        .collect();
    if let Some(fifths) = edit.fifths {
        updated.push(Change {
            measure_id: edit.measure_id.clone(),
            fifths,
        });
    }
    normalize(document, updated)
}
pub(super) fn prepare(input: &Value, document: &ScoreDocumentV1) -> CallbackResult<Value> {
    let command = field(input, "command").ok_or_else(invalid)?;
    let target = field(command, "target").ok_or_else(invalid)?;
    let payload = field(command, "payload").ok_or_else(invalid)?;
    if !tag(command, "commandId", COMMAND)
        || !exact(target, &["kind", "partId"])
        || !tag(target, "kind", "part")
        || !exact(payload, &["measureId", "change"])
    {
        return Err(invalid());
    }
    let decoded = object([
        (
            "partId",
            field(target, "partId").ok_or_else(invalid)?.clone(),
        ),
        (
            "measureId",
            field(payload, "measureId").ok_or_else(invalid)?.clone(),
        ),
        (
            "change",
            field(payload, "change").ok_or_else(invalid)?.clone(),
        ),
    ]);
    let edit = edit(&decoded).ok_or_else(invalid)?;
    if !document
        .parts
        .iter()
        .any(|p| p.id.as_js_string() == &edit.part_id)
    {
        return Err(literal(json!({"code":"command.target-not-found"})));
    }
    if !document
        .measure_definitions
        .iter()
        .any(|m| m.id.as_js_string() == &edit.measure_id)
    {
        return Err(semantic("missing-measure"));
    }
    let current =
        match block_for_part(document, &edit.part_id).filter(|b| b.schema_version.get() == 1) {
            None => vec![],
            Some(b) => decode_changes(&JsonValue::Object(b.payload.clone()))
                .ok_or_else(|| semantic("invalid-block"))?,
        };
    let next = apply(document, current.clone(), &edit);
    if current == next {
        return Ok(literal(json!({"ok":true,"prepared":{"status":"no-op"}})));
    }
    let owner = object([
        ("kind", literal(json!("part"))),
        ("partId", JsonValue::String(edit.part_id.clone())),
    ]);
    let effect = object([
        ("requestVersion", literal(json!(1))),
        ("requestKind", literal(json!("module.extension"))),
        ("effectKind", literal(json!(EFFECT))),
        ("namespace", literal(json!(NAMESPACE))),
        ("owner", owner.clone()),
        ("payload", decoded),
    ]);
    Ok(object([
        ("ok", JsonValue::Bool(true)),
        (
            "prepared",
            object([
                ("status", literal(json!("changed"))),
                ("effectRequests", JsonValue::Array(vec![effect])),
                ("affected", JsonValue::Array(vec![owner])),
            ]),
        ),
    ]))
}
pub(super) fn transform(input: &Value, document: &ScoreDocumentV1) -> CallbackResult<Value> {
    if !tag(input, "contributionId", CONTRIBUTION) {
        return Err(internal());
    }
    let effect = field(input, "effect").ok_or_else(internal)?;
    if !tag(effect, "effectKind", EFFECT) || !tag(effect, "namespace", NAMESPACE) {
        return Err(internal());
    }
    let edit = edit(field(effect, "payload").ok_or_else(internal)?).ok_or_else(internal)?;
    let owner = field(effect, "owner").ok_or_else(internal)?;
    if !tag(owner, "kind", "part") || field(owner, "partId").and_then(string) != Some(&edit.part_id)
    {
        return Err(semantic("wrong-owner"));
    }
    let current = match block_for_part(document, &edit.part_id) {
        None => vec![],
        Some(b) => decode_changes(&JsonValue::Object(b.payload.clone()))
            .ok_or_else(|| semantic("invalid-block"))?,
    };
    let changes = apply(document, current, &edit);
    let transformed = if changes.is_empty() {
        literal(json!({"status":"remove"}))
    } else {
        object([
            ("status", literal(json!("replace"))),
            ("schemaVersion", literal(json!(1))),
            (
                "payload",
                object([(
                    "changes",
                    JsonValue::Array(
                        changes
                            .into_iter()
                            .map(|c| {
                                object([
                                    ("measureId", JsonValue::String(c.measure_id)),
                                    ("fifths", literal(json!(c.fifths))),
                                ])
                            })
                            .collect(),
                    ),
                )]),
            ),
        ])
    };
    Ok(object([
        ("ok", JsonValue::Bool(true)),
        ("transformed", transformed),
    ]))
}

#[cfg(test)]
mod tests;
