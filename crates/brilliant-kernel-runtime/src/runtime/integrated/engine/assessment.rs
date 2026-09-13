//! Validate host assessment data against the Rust-owned candidate and assembly.
//! This checks result identity/coverage, not the truth of arbitrary plugin code.
use super::*;
use brilliant_core_types::JsString;
use brilliant_extension_protocol::{
    BorrowedExtensionHeaderV1, ExtensionOwnerRefV1, compute_domain_availability_v1,
    valid_registry_id,
};
use std::collections::{BTreeMap, BTreeSet};

#[cfg(test)]
mod tests;

fn source_pair(source: &Value) -> Result<(StableId, StableId)> {
    if !exact(source, &["moduleId", "contributionId"]) {
        return Err(internal());
    }
    Ok((
        StableId::new(string(field(source, "moduleId")?)?).map_err(|_| internal())?,
        StableId::new(string(field(source, "contributionId")?)?).map_err(|_| internal())?,
    ))
}

pub(super) fn decode_reads(input: &Value, assembly: &ResolvedHostAssemblyV1) -> Result<Vec<Value>> {
    let rows = array(input)?;
    if rows.len() > 1024 {
        return Err(internal());
    }
    let mut seen = BTreeSet::new();
    for row in rows {
        if !exact(
            row,
            &[
                "readVersion",
                "reader",
                "provider",
                "namespace",
                "supportedSchemaVersions",
                "ownerKinds",
            ],
        ) || integer(field(row, "readVersion")?) != Some(1)
        {
            return Err(internal());
        }
        let reader = source_pair(field(row, "reader")?)?;
        let provider = source_pair(field(row, "provider")?)?;
        let namespace = string(field(row, "namespace")?)?;
        if reader == provider
            || !assembly.has_installed_owner(&reader.0, &reader.1)
            || !assembly.has_installed_owner(&provider.0, &provider.1)
            || !seen.insert((reader.0, reader.1, namespace.clone()))
        {
            return Err(internal());
        }
        let requirement = assembly
            .requirements()
            .iter()
            .find(|entry| {
                namespace.eq_ascii(&entry.namespace)
                    && entry.module_id == provider.0
                    && entry.contribution_id == provider.1
            })
            .ok_or_else(internal)?;
        let versions = array(field(row, "supportedSchemaVersions")?)?;
        if versions.len() != requirement.supported_schema_versions.len()
            || versions
                .iter()
                .zip(&requirement.supported_schema_versions)
                .any(|(value, version)| integer(value) != Some(*version))
        {
            return Err(internal());
        }
        let kinds = array(field(row, "ownerKinds")?)?;
        if kinds.is_empty()
            || kinds.len() > 2
            || (kinds.len() == 2 && kinds[0] == kinds[1])
            || kinds.iter().any(|kind| {
                !string(kind).is_ok_and(|kind| kind.eq_ascii("score") || kind.eq_ascii("part"))
            })
        {
            return Err(internal());
        }
    }
    Ok(rows.to_vec())
}

impl IntegratedKernelRuntimeV2 {
    pub(super) fn assessment_sources(&self, document: &ScoreDocumentV1) -> Result<Vec<Value>> {
        let mut sources = BTreeMap::new();
        for requirement in self.assembly.requirements() {
            if !self
                .assembly
                .has_installed_owner(&requirement.module_id, &requirement.contribution_id)
            {
                continue;
            }
            if !document.extensions.iter().any(|block| {
                block.namespace.eq_ascii(&requirement.namespace)
                    && requirement
                        .supported_schema_versions
                        .contains(&(block.schema_version.get() as u64))
            }) {
                continue;
            }
            let source = object([
                ("moduleId", value(&requirement.module_id)?),
                ("contributionId", value(&requirement.contribution_id)?),
            ]);
            let incompatible = self
                .assessment_reads
                .iter()
                .filter(|row| field(row, "reader").ok() == Some(&source))
                .any(|row| {
                    document.extensions.iter().any(|block| {
                        if field(row, "namespace").ok()
                            != Some(&JsonValue::String(block.namespace.clone()))
                        {
                            return false;
                        }
                        let kind = match block.owner {
                            ExtensionOwnerV1::Score => "score",
                            ExtensionOwnerV1::Part { .. } => "part",
                        };
                        // Every row was exact-decoded once during session construction.
                        array(field(row, "ownerKinds").expect("validated read"))
                            .expect("validated kinds")
                            .iter()
                            .any(|value| string(value).is_ok_and(|value| value.eq_ascii(kind)))
                            && !array(
                                field(row, "supportedSchemaVersions").expect("validated read"),
                            )
                            .expect("validated versions")
                            .iter()
                            .any(|version| {
                                integer(version) == Some(block.schema_version.get() as u64)
                            })
                    })
                });
            if !incompatible {
                sources.insert(
                    (
                        requirement.module_id.clone(),
                        requirement.contribution_id.clone(),
                    ),
                    source,
                );
            }
        }
        Ok(sources.into_values().collect())
    }

    pub(super) fn candidate_availability(&self, document: &ScoreDocumentV1) -> Result<Value> {
        let result = compute_domain_availability_v1(
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
        );
        let wire = decode(&encode_domain_availability_result_v1(&result).map_err(|_| internal())?)?;
        if field(&wire, "ok")? == &JsonValue::Bool(false) {
            return Err(field(&wire, "failure")?.clone());
        }
        Ok(field(&wire, "value")?.clone())
    }
}

pub(super) fn validate_success(
    reply: &Value,
    sources: &[Value],
    availability: &Value,
) -> Result<()> {
    if !exact(reply, &["ok", "assessment", "availability"])
        || field(reply, "availability")? != availability
    {
        return Err(internal());
    }
    let assessment = field(reply, "assessment")?;
    if !exact(assessment, &["core", "modules"]) {
        return Err(internal());
    }
    let rows = array(field(assessment, "modules")?)?;
    if rows.len() != sources.len() {
        return Err(internal());
    }
    let mut count = 0;
    for (row, source) in rows.iter().zip(sources) {
        if !exact(row, &["moduleId", "contributionId", "status", "issues"])
            || field(row, "moduleId")? != field(source, "moduleId")?
            || field(row, "contributionId")? != field(source, "contributionId")?
            || !(tag(row, "status", "supported") || tag(row, "status", "unsupported"))
        {
            return Err(internal());
        }
        let issues = array(field(row, "issues")?)?;
        if issues.len() > 1024 {
            return Err(internal());
        }
        count += issues.len();
        if count > 4096 {
            return Err(internal());
        }
        for issue in issues {
            validate_issue(issue, source)?;
        }
    }
    Ok(())
}

pub(super) fn validate_failure(error: Value, sources: &[Value]) -> Value {
    let checked = (|| -> Result<()> {
        if tag(&error, "code", "command.contribution-semantic-invalid") {
            if !exact(&error, &["code", "issues"]) {
                return Err(internal());
            }
            let issues = array(field(&error, "issues")?)?;
            if issues.is_empty() || issues.len() > 4096 {
                return Err(internal());
            }
            let mut counts = vec![0; sources.len()];
            let mut previous = 0;
            for issue in issues {
                let source = field(issue, "source")?;
                let index = sources
                    .iter()
                    .position(|candidate| {
                        field(candidate, "moduleId").ok() == field(source, "moduleId").ok()
                            && field(candidate, "contributionId").ok()
                                == field(source, "contributionId").ok()
                    })
                    .ok_or_else(internal)?;
                if index < previous {
                    return Err(internal());
                }
                previous = index;
                counts[index] += 1;
                if counts[index] > 1024 {
                    return Err(internal());
                }
                validate_issue(issue, &sources[index])?;
            }
            return Ok(());
        }
        if tag(&error, "code", "command.contribution-contract-violation")
            || tag(&error, "code", "command.contribution-internal-error")
        {
            if !exact(&error, &["code", "moduleId", "contributionId"])
                || !sources.iter().any(|source| {
                    field(source, "moduleId").ok() == field(&error, "moduleId").ok()
                        && field(source, "contributionId").ok()
                            == field(&error, "contributionId").ok()
                })
            {
                return Err(internal());
            }
            return Ok(());
        }
        if exact(&error, &["code"])
            && [
                "command.internal-error",
                "command.invalid-envelope",
                "command.assembly-mismatch",
            ]
            .iter()
            .any(|code| tag(&error, "code", code))
        {
            return Ok(());
        }
        if exact(&error, &["code", "limitKind", "limit", "actual"])
            && tag(&error, "code", "command.resource-limit-exceeded")
            && tag(&error, "limitKind", "module-issues")
            && integer(field(&error, "limit")?) == Some(4096)
            && integer(field(&error, "actual")?) == Some(4097)
        {
            return Ok(());
        }
        Err(internal())
    })();
    if checked.is_ok() { error } else { internal() }
}

pub(super) fn validate_issue(issue: &Value, source: &Value) -> Result<()> {
    let JsonValue::Object(fields) = issue else {
        return Err(internal());
    };
    let mut keys = vec!["issueVersion", "code", "severity", "messageKey", "source"];
    for key in ["location", "details"] {
        if fields.contains_key(&JsString::from(key)) {
            keys.push(key);
        }
    }
    if !exact(issue, &keys) || integer(field(issue, "issueVersion")?) != Some(1) {
        return Err(internal());
    }
    let code = string(field(issue, "code")?)?;
    let module = string(field(source, "moduleId")?)?;
    let mut prefix = module.code_units().to_vec();
    prefix.push(u16::from(b'.'));
    let mut message = JsString::from("module.").code_units().to_vec();
    message.extend_from_slice(code.code_units());
    if !valid_registry_id(code.code_units().iter().copied())
        || !code.code_units().starts_with(&prefix)
        || string(field(issue, "messageKey")?)?.code_units() != message
        || !["warning", "error", "fatal"]
            .iter()
            .any(|severity| tag(issue, "severity", severity))
    {
        return Err(internal());
    }
    let owner = field(issue, "source")?;
    if !exact(owner, &["kind", "moduleId", "contributionId"])
        || !tag(owner, "kind", "module")
        || field(owner, "moduleId")? != field(source, "moduleId")?
        || field(owner, "contributionId")? != field(source, "contributionId")?
    {
        return Err(internal());
    }
    if let Ok(details) = field(issue, "details")
        && !matches!(details, JsonValue::Object(_))
    {
        return Err(internal());
    }
    if let Ok(location) = field(issue, "location") {
        validate_location(location)?;
    }
    Ok(())
}

fn point(input: &Value, kind: &str, ids: &[&str]) -> bool {
    let mut fields = vec!["kind"];
    fields.extend_from_slice(ids);
    exact(input, &fields)
        && tag(input, "kind", kind)
        && ids.iter().all(|id| {
            field(input, id)
                .and_then(string)
                .is_ok_and(|id| !id.code_units().is_empty())
        })
}
fn validate_location(location: &Value) -> Result<()> {
    if exact(location, &["kind", "path"])
        && tag(location, "kind", "diagnostic-path")
        && array(field(location, "path")?)?
            .iter()
            .all(|part| match part {
                JsonValue::String(_) => true,
                JsonValue::Number(number) => {
                    number.get().abs() <= 9_007_199_254_740_991.0 && number.get().fract() == 0.0
                }
                _ => false,
            })
    {
        return Ok(());
    }
    if exact(location, &["kind", "address"]) && tag(location, "kind", "score-address") {
        let address = field(location, "address")?;
        if [
            ("document", "documentId"),
            ("measure", "measureId"),
            ("part", "partId"),
            ("staff", "staffId"),
            ("voice", "voiceId"),
            ("event", "eventId"),
            ("note", "noteId"),
        ]
        .iter()
        .any(|(kind, id)| point(address, kind, &[*id]))
        {
            return Ok(());
        }
    }
    if exact(location, &["kind", "range"]) && tag(location, "kind", "score-range") {
        let range = field(location, "range")?;
        if !exact(range, &["kind", "start", "end"]) {
            return Err(internal());
        }
        for (kind, ids) in [
            ("measure", &["measureId"][..]),
            ("part-measure", &["partId", "measureId"][..]),
            ("voice-event", &["voiceId", "eventId"][..]),
        ] {
            if tag(range, "kind", &format!("{kind}-range"))
                && point(field(range, "start")?, kind, ids)
                && point(field(range, "end")?, kind, ids)
            {
                return Ok(());
            }
        }
    }
    Err(internal())
}
