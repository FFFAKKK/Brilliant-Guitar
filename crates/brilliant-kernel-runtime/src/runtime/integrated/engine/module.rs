//! Shared SDK preparation contract for typed standalone and occurrence Batch writes.
use super::*;
use crate::candidate::{CandidateExecution, ModuleSegmentSource};
use crate::runtime::effect::KernelEffectTransaction;

pub(super) trait ModuleTransaction: KernelEffectTransaction {
    fn projection(&mut self, id: &StableId) -> Result<Value>;
    fn contribution_context(&mut self, id: &StableId) -> Result<Value>;
    fn contains(&mut self, entity: &StableEntityAddressV1, id: &StableId) -> bool;
    fn begin_effects(&mut self) -> usize;
    fn affected_since(&mut self, start: usize) -> Result<Vec<AffectedEntityAddressV1>>;
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
    fn begin_effects(&mut self) -> usize {
        self.overlay.affected_order().len()
    }
    fn affected_since(&mut self, start: usize) -> Result<Vec<AffectedEntityAddressV1>> {
        self.overlay
            .module_affected_since(start)
            .map(|values| {
                values
                    .into_iter()
                    .map(crate::runtime::score_target_from_stable_address)
                    .collect()
            })
            .map_err(|_| internal())
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

    fn set_event_note_value(
        &mut self,
        id: StableId,
        note_value: NoteValueV1,
    ) -> std::result::Result<(), KernelStage3CommandFailureLeafV1> {
        self.module_event_note_value(&id, note_value)
    }

    fn remove_event(
        &mut self,
        id: StableId,
    ) -> std::result::Result<(), KernelStage3CommandFailureLeafV1> {
        self.module_event_remove(&id)
    }

    fn insert_notes_event(
        &mut self,
        voice_id: StableId,
        anchor: SequenceAnchorV1,
        event: RhythmicEventV1,
    ) -> std::result::Result<(), KernelStage3CommandFailureLeafV1> {
        self.module_insert_event(&voice_id, anchor, event, true)
    }

    fn insert_rest_event(
        &mut self,
        voice_id: StableId,
        anchor: SequenceAnchorV1,
        event: RhythmicEventV1,
    ) -> std::result::Result<(), KernelStage3CommandFailureLeafV1> {
        self.module_insert_event(&voice_id, anchor, event, false)
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
    fn begin_effects(&mut self) -> usize {
        self.begin_module()
    }
    fn affected_since(&mut self, start: usize) -> Result<Vec<AffectedEntityAddressV1>> {
        self.module_affected(start).map_err(|_| internal())
    }
}

pub(super) struct ModulePreparation {
    pub(super) source: ModuleSegmentSource,
    pub(super) affected: Vec<AffectedEntityAddressV1>,
    pub(super) effect_start: usize,
}

pub(super) struct ModuleEnvironment<'a> {
    pub(super) assembly: &'a ResolvedHostAssemblyV1,
    pub(super) assessment_reads: &'a [Value],
    pub(super) commands: &'a [Value],
    pub(super) effects: &'a [Value],
    pub(super) id: &'a StableId,
    pub(super) version: u64,
}

fn effect_rejected(
    source: &Value,
    effect_index: usize,
    effect_kind: &brilliant_core_types::JsString,
    target: Value,
    failure: KernelStage3CommandFailureLeafV1,
) -> Value {
    match (field(source, "moduleId"), field(source, "contributionId")) {
        (Ok(module_id), Ok(contribution_id)) => object([
            ("code", text("command.contribution-effect-rejected")),
            ("moduleId", module_id.clone()),
            ("contributionId", contribution_id.clone()),
            ("effectIndex", number(effect_index as u64)),
            ("effectKind", JsonValue::String(effect_kind.clone())),
            ("target", target),
            ("failureCode", text(failure.code())),
        ]),
        _ => internal(),
    }
}

fn effect_provenance(request: &Value) -> Option<(brilliant_core_types::JsString, Value)> {
    let request_kind = string(field(request, "requestKind").ok()?).ok()?;
    let (effect_kind, target) = if request_kind.eq_ascii("module.extension") {
        let effect_kind = string(field(request, "effectKind").ok()?).ok()?.clone();
        let owner = field(request, "owner").ok()?.clone();
        let _: ExtensionOwnerV1 = ExtensionOwnerV1::from_lossless_value(owner.clone()).ok()?;
        (effect_kind, owner)
    } else {
        let target = field(request, "target").ok()?.clone();
        decode_address(&target).ok()?;
        (request_kind.clone(), target)
    };
    if !brilliant_extension_protocol::valid_registry_id(effect_kind.code_units().iter().copied()) {
        return None;
    }
    Some((effect_kind, target))
}

fn attributed_effect_failure(
    source: &Value,
    effect_index: usize,
    request: &Value,
    failure: KernelStage3CommandFailureLeafV1,
) -> Value {
    match effect_provenance(request) {
        Some((effect_kind, target)) => {
            effect_rejected(source, effect_index, &effect_kind, target, failure)
        }
        None => owned_failure(source, "command.contribution-contract-violation"),
    }
}

fn affected_key(address: &AffectedEntityAddressV1) -> (u8, &brilliant_core_types::JsString) {
    use brilliant_kernel_contracts::ScoreEntityTargetV1 as Target;
    match address {
        Target::Document { document_id } => (0, document_id.as_js_string()),
        Target::Event { event_id } => (1, event_id.as_js_string()),
        Target::Measure { measure_id } => (2, measure_id.as_js_string()),
        Target::Note { note_id } => (3, note_id.as_js_string()),
        Target::Part { part_id } => (4, part_id.as_js_string()),
        Target::Staff { staff_id } => (5, staff_id.as_js_string()),
        Target::Voice { voice_id } => (6, voice_id.as_js_string()),
    }
}

fn canonicalize_affected(affected: &mut [AffectedEntityAddressV1]) {
    affected.sort_by(|left, right| affected_key(left).cmp(&affected_key(right)));
}

pub(super) fn validate_legacy_affected(
    prepared: &Value,
    contract: &impl Fn() -> Value,
) -> Result<()> {
    let Ok(value) = field(prepared, "affected") else {
        return Ok(());
    };
    let mut normalized = std::collections::BTreeSet::new();
    for address in array(value).map_err(|_| contract())? {
        let (key, _, _) = decode_address(address).map_err(|_| contract())?;
        normalized.insert(key);
        if normalized.len() > 131_072 {
            return Err(resource("affected-addresses", 131_072));
        }
    }
    Ok(())
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
        let effect_start = transaction.begin_effects();
        let mut affected = Vec::new();
        if tag(prepared, "status", "changed")
            && (exact(prepared, &["status", "effectRequests"])
                || exact(prepared, &["status", "effectRequests", "affected"]))
        {
            let requests = array(field(prepared, "effectRequests")?)?;
            if requests.is_empty() {
                return Err(contract());
            }
            if requests.len() > 131_072 {
                return Err(resource("effects", 131_072));
            }
            validate_legacy_affected(prepared, &contract)?;
            for (effect_index, request) in requests.iter().enumerate() {
                match crate::runtime::effect::KernelEffectV1::decode_core(request) {
                    Ok(Some(effect)) => {
                        let (effect_kind, target) =
                            effect_provenance(request).ok_or_else(&contract)?;
                        effect.apply_to(transaction).map_err(|failure| {
                            effect_rejected(source, effect_index, &effect_kind, target, failure)
                        })?;
                        continue;
                    }
                    Err(failure) => {
                        return Err(attributed_effect_failure(
                            source,
                            effect_index,
                            request,
                            failure,
                        ));
                    }
                    Ok(None) => {}
                }

                let reject =
                    |failure| attributed_effect_failure(source, effect_index, request, failure);
                if !tag(request, "requestKind", "module.extension") {
                    return Err(reject(KernelStage3CommandFailureLeafV1::UnknownId));
                }
                let request_version = integer(
                    field(request, "requestVersion")
                        .map_err(|_| reject(KernelStage3CommandFailureLeafV1::InvalidEnvelope))?,
                )
                .ok_or_else(|| reject(KernelStage3CommandFailureLeafV1::InvalidEnvelope))?;
                if request_version != 1 {
                    return Err(reject(KernelStage3CommandFailureLeafV1::UnsupportedVersion));
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
                ) || !matches!(
                    field(request, "payload")
                        .map_err(|_| reject(KernelStage3CommandFailureLeafV1::InvalidEnvelope))?,
                    JsonValue::Object(_)
                ) {
                    return Err(reject(KernelStage3CommandFailureLeafV1::InvalidEnvelope));
                }
                let effect = effects
                    .iter()
                    .find(|effect| {
                        field(effect, "source").ok() == Some(source)
                            && field(effect, "effectKind").ok() == field(request, "effectKind").ok()
                            && field(effect, "namespace").ok() == field(request, "namespace").ok()
                    })
                    .ok_or_else(|| reject(KernelStage3CommandFailureLeafV1::UnknownId))?;
                let owner: ExtensionOwnerV1 =
                    ExtensionOwnerV1::from_lossless_value(field(request, "owner")?.clone())
                        .map_err(|_| reject(KernelStage3CommandFailureLeafV1::InvalidEnvelope))?;
                let owner_kind = match &owner {
                    ExtensionOwnerV1::Score => "score",
                    ExtensionOwnerV1::Part { part_id } => {
                        if !transaction.contains(
                            &StableEntityAddressV1::Part {
                                part_id: part_id.clone(),
                            },
                            id,
                        ) {
                            return Err(reject(KernelStage3CommandFailureLeafV1::TargetNotFound));
                        }
                        "part"
                    }
                };
                if !array(field(effect, "ownerKinds")?)?
                    .iter()
                    .any(|item| string(item).is_ok_and(|value| value.eq_ascii(owner_kind)))
                {
                    return Err(reject(KernelStage3CommandFailureLeafV1::TargetMismatch));
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
                    return Err(reject(KernelStage3CommandFailureLeafV1::InvalidEnvelope));
                }
                let transformed = field(&transformed_reply, "transformed")
                    .map_err(|_| reject(KernelStage3CommandFailureLeafV1::InvalidEnvelope))?;
                let namespace = string(field(request, "namespace")?)?.clone();
                let effect = crate::runtime::effect::KernelEffectV1::decode_extension(
                    namespace,
                    owner,
                    field(effect, "supportedSchemaVersions")?,
                    transformed,
                )
                .map_err(reject)?;
                let effect_kind = string(field(request, "effectKind").map_err(|_| contract())?)
                    .map_err(|_| contract())?;
                let target = field(request, "owner").map_err(|_| contract())?.clone();
                effect.apply_to(transaction).map_err(|failure| {
                    effect_rejected(source, effect_index, effect_kind, target, failure)
                })?;
            }
            affected = transaction.affected_since(effect_start)?;
            canonicalize_affected(&mut affected);
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
            effect_start,
        })
    }
}
