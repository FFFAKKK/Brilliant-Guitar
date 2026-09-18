//! Shared SDK preparation contract for typed standalone and occurrence Batch writes.
use super::*;
use crate::candidate::{CandidateExecution, ModuleSegmentSource};
use crate::runtime::effect::KernelEffectTransaction;

pub(super) trait ModuleTransaction: KernelEffectTransaction {
    fn projection(&mut self, id: &StableId) -> Result<Value>;
    fn contribution_context(&mut self, id: &StableId) -> Result<Value>;
    fn contains(&mut self, entity: &StableEntityAddressV1, id: &StableId) -> bool;
}
impl ModuleTransaction for KernelStage3TransactionV1<'_> {
    fn contribution_context(&mut self, id: &StableId) -> Result<Value> {
        value(
            &self
                .integrated_contribution_context(id)
                .map_err(|_| internal())?,
        )
    }
    fn projection(&mut self, id: &StableId) -> Result<Value> {
        value(&self.integrated_projection(id).map_err(|_| internal())?)
    }
    fn contains(&mut self, entity: &StableEntityAddressV1, id: &StableId) -> bool {
        if let StableEntityAddressV1::Document { document_id } = entity {
            document_id == id
        } else {
            self.overlay.read_entity(entity).is_some()
        }
    }
}
impl KernelEffectTransaction for CandidateExecution<'_> {
    fn set_document_metadata(
        &mut self,
        id: StableId,
        metadata: ScoreMetadataV1,
    ) -> std::result::Result<(), KernelStage3CommandFailureLeafV1> {
        self.module_metadata(&id, metadata)
    }

    fn replace_written_pitch(
        &mut self,
        id: StableId,
        pitch: WrittenPitchV1,
    ) -> std::result::Result<(), KernelStage3CommandFailureLeafV1> {
        self.module_pitch(&id, pitch)
    }
    fn set_extension(
        &mut self,
        namespace: brilliant_core_types::JsString,
        owner: ExtensionOwnerV1,
        block: Option<ExtensionBlockV1>,
    ) -> std::result::Result<(), KernelStage3CommandFailureLeafV1> {
        self.module_extension(namespace, owner, block)
    }
}
impl ModuleTransaction for CandidateExecution<'_> {
    fn contribution_context(&mut self, _: &StableId) -> Result<Value> {
        value(
            &self
                .integrated_contribution_context()
                .map_err(|_| internal())?,
        )
    }
    fn projection(&mut self, _: &StableId) -> Result<Value> {
        value(&self.integrated_document().map_err(|_| internal())?)
    }
    fn contains(&mut self, entity: &StableEntityAddressV1, _: &StableId) -> bool {
        self.contains_entity(entity)
    }
}

pub(super) struct ModulePreparation {
    pub(super) source: ModuleSegmentSource,
    pub(super) affected: Vec<AffectedEntityAddressV1>,
}

pub(super) struct ModuleEnvironment<'a> {
    pub(super) assembly: &'a ResolvedHostAssemblyV1,
    pub(super) assessment_reads: &'a [Value],
    pub(super) commands: &'a [Value],
    pub(super) effects: &'a [Value],
    pub(super) id: &'a StableId,
    pub(super) version: u64,
}
impl ModuleEnvironment<'_> {
    pub(super) fn prepare(
        &self,
        envelope: &Value,
        transaction: &mut impl ModuleTransaction,
        projection_count: &mut u64,
        executor: &mut dyn ContributionExecutorV2,
    ) -> Result<ModulePreparation> {
        let Self {
            commands,
            effects,
            id,
            version,
            ..
        } = *self;
        if !exact(
            envelope,
            &["commandVersion", "commandId", "target", "payload"],
        ) {
            return Err(failure("command.invalid-envelope"));
        }
        if integer(field(envelope, "commandVersion")?) != Some(1) {
            return Err(failure("command.unsupported-version"));
        }
        let command_id = string(field(envelope, "commandId")?)?;
        let descriptor = commands
            .iter()
            .find(|definition| {
                field(definition, "commandId").ok() == field(envelope, "commandId").ok()
            })
            .cloned()
            .ok_or_else(|| failure("command.unknown-id"))?;
        let source = field(&descriptor, "source")?;
        let contract = || owned_failure(source, "command.contribution-contract-violation");
        let (_, target, target_entity) = decode_address(field(envelope, "target")?)
            .map_err(|_| failure("command.invalid-envelope"))?;
        if !string(field(&descriptor, "targetKind")?)?.eq_ascii(target.kind().as_str()) {
            return Err(failure("command.target-mismatch"));
        }
        let prepared_reply = if executor.uses_scoped_preparation() {
            self.scoped_prepare(
                envelope,
                &descriptor,
                projection_count,
                transaction,
                &target_entity,
                executor,
            )?
        } else {
            let initial = transaction.projection(id)?;
            *projection_count += 1;
            call(
                executor,
                object([
                    ("operation", text("prepare")),
                    ("document", initial),
                    ("documentVersion", number(version)),
                    ("command", envelope.clone()),
                ]),
                &JsonValue::Null,
            )?
        };
        if !exact(&prepared_reply, &["ok", "prepared"]) {
            return Err(contract());
        }
        let prepared = field(&prepared_reply, "prepared").map_err(|_| contract())?;
        if !transaction.contains(&target_entity, id) {
            return Err(failure("command.target-not-found"));
        }
        let mut affected = Vec::new();
        if tag(prepared, "status", "changed")
            && exact(prepared, &["status", "effectRequests", "affected"])
        {
            let requests = array(field(prepared, "effectRequests")?)?;
            if requests.is_empty() {
                return Err(contract());
            }
            if requests.len() > 131_072 {
                return Err(resource("effects", 131_072));
            }
            for request in requests {
                if tag(request, "requestKind", "core.note.replace-written-pitch") {
                    let effect = crate::runtime::effect::KernelEffectV1::decode_written_pitch(
                        request, contract,
                    )?;
                    effect.apply_to(transaction).map_err(|_| contract())?;
                    continue;
                }
                if !exact(
                    request,
                    &[
                        "requestVersion",
                        "requestKind",
                        "effectKind",
                        "namespace",
                        "owner",
                        "payload",
                    ],
                ) || !tag(request, "requestKind", "module.extension")
                    || integer(field(request, "requestVersion")?) != Some(1)
                    || !matches!(field(request, "payload")?, JsonValue::Object(_))
                {
                    return Err(contract());
                }
                let effect = effects
                    .iter()
                    .find(|effect| {
                        field(effect, "source").ok() == Some(source)
                            && field(effect, "effectKind").ok() == field(request, "effectKind").ok()
                            && field(effect, "namespace").ok() == field(request, "namespace").ok()
                    })
                    .ok_or_else(contract)?;
                let owner: ExtensionOwnerV1 =
                    ExtensionOwnerV1::from_lossless_value(field(request, "owner")?.clone())
                        .map_err(|_| contract())?;
                let owner_kind = match &owner {
                    ExtensionOwnerV1::Score => "score",
                    ExtensionOwnerV1::Part { part_id } => {
                        if !transaction.contains(
                            &StableEntityAddressV1::Part {
                                part_id: part_id.clone(),
                            },
                            id,
                        ) {
                            return Err(contract());
                        }
                        "part"
                    }
                };
                if !array(field(effect, "ownerKinds")?)?
                    .iter()
                    .any(|item| string(item).is_ok_and(|value| value.eq_ascii(owner_kind)))
                {
                    return Err(contract());
                }
                let transformed_reply = if executor.uses_scoped_preparation() {
                    self.scoped_transform(request, source, transaction, projection_count, executor)?
                } else {
                    let document = transaction.projection(id).map_err(|_| internal())?;
                    *projection_count += 1;
                    call(
                        executor,
                        object([
                            ("operation", text("transform")),
                            ("document", document),
                            ("documentVersion", number(version)),
                            ("contributionId", field(source, "contributionId")?.clone()),
                            ("effect", request.clone()),
                        ]),
                        source,
                    )?
                };
                if !exact(&transformed_reply, &["ok", "transformed"]) {
                    return Err(contract());
                }
                let transformed =
                    field(&transformed_reply, "transformed").map_err(|_| contract())?;
                let namespace = string(field(request, "namespace")?)?.clone();
                let effect = crate::runtime::effect::KernelEffectV1::decode_extension(
                    namespace,
                    owner,
                    field(effect, "supportedSchemaVersions")?,
                    transformed,
                    contract,
                )?;
                effect.apply_to(transaction).map_err(|_| contract())?;
            }
            let addresses = array(field(prepared, "affected")?)?;
            let mut normalized = std::collections::BTreeMap::new();
            for address in addresses {
                let (key, target, entity) = decode_address(address).map_err(|_| contract())?;
                if !transaction.contains(&entity, id) {
                    return Err(contract());
                }
                normalized.insert(key, target);
                if normalized.len() > 131_072 {
                    return Err(resource("affected-addresses", 131_072));
                }
            }
            affected.extend(normalized.into_values());
        } else if !tag(prepared, "status", "no-op") || !exact(prepared, &["status"]) {
            return Err(contract());
        }
        Ok(ModulePreparation {
            source: ModuleSegmentSource {
                command_id: StableId::new(command_id).map_err(|_| contract())?,
                module_id: StableId::new(string(field(source, "moduleId")?)?)
                    .map_err(|_| contract())?,
                contribution_id: StableId::new(string(field(source, "contributionId")?)?)
                    .map_err(|_| contract())?,
            },
            affected,
        })
    }
}
