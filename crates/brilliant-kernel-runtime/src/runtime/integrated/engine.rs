use super::wire::*;
use super::*;
use brilliant_core_types::JsonValue;
use brilliant_extension_protocol::{
    ContributionExecutorV2, HostCatalogV1, InventorySelectionV1, ResolvedHostAssemblyV1,
};
use brilliant_kernel_contracts::{
    decode_host_catalog_projection_v1, decode_known_requirement_inventory_v1,
    encode_domain_availability_result_v1,
};
use brilliant_score_foundation::{LosslessDecode, assess_score_semantics};

/// Fixed assembly and one ordinary Rust runtime. The host executor is borrowed
/// for a call; the Node owner retains its authentic callback for this lifetime.
pub struct IntegratedKernelRuntimeV2 {
    runtime: KernelRuntime,
    assembly: Arc<ResolvedHostAssemblyV1>,
    commands: Vec<Value>,
    effects: Vec<Value>,
    callback_projections: u64,
}

impl IntegratedKernelRuntimeV2 {
    pub fn create(
        bytes: &[u8],
        executor: &mut dyn ContributionExecutorV2,
    ) -> std::result::Result<Self, Vec<u8>> {
        Self::create_inner(bytes, executor).map_err(|failure| {
            encode(&failure).unwrap_or_else(|_| b"{\"code\":\"command.internal-error\"}".to_vec())
        })
    }

    fn create_inner(bytes: &[u8], executor: &mut dyn ContributionExecutorV2) -> Result<Self> {
        let request = decode(bytes)?;
        if !exact(
            &request,
            &[
                "apiVersion",
                "document",
                "catalog",
                "commands",
                "effects",
                "inventory",
            ],
        ) || integer(field(&request, "apiVersion")?) != Some(2)
        {
            return Err(failure("command.assembly-mismatch"));
        }
        let document = ScoreDocumentV1::from_lossless_value(field(&request, "document")?.clone())
            .map_err(|_| failure("command.invalid-initial-document"))?;
        let catalog: HostCatalogV1 = decode_host_catalog_projection_v1(field(&request, "catalog")?)
            .map_err(|_| failure("command.assembly-mismatch"))?;
        let inventory = match field(&request, "inventory")? {
            JsonValue::Null => InventorySelectionV1::Omitted,
            value => InventorySelectionV1::Explicit(
                decode_known_requirement_inventory_v1(value)
                    .ok_or_else(|| failure("command.invalid-requirement-inventory"))?,
            ),
        };
        let assembly = catalog
            .resolve_inventory(inventory)
            .map_err(|_| failure("command.invalid-requirement-inventory"))?;
        let commands = array(field(&request, "commands")?)?.to_vec();
        let effects = array(field(&request, "effects")?)?.to_vec();
        validate_descriptors(&commands, &effects, &assembly)?;
        let runtime = KernelRuntime::create(document)
            .map_err(|_| failure("command.invalid-initial-document"))?;
        let mut state = Self {
            runtime,
            assembly,
            commands,
            effects,
            callback_projections: 0,
        };
        let document = state
            .runtime
            .store
            .export_document()
            .map_err(|_| internal())?;
        state.assess(&document, 0, executor).map_err(|error| {
            if tag(&error, "code", "command.semantic-invalid") {
                object([
                    ("code", text("command.invalid-initial-document")),
                    (
                        "diagnostics",
                        field(&error, "diagnostics")
                            .cloned()
                            .unwrap_or(JsonValue::Array(vec![])),
                    ),
                ])
            } else {
                error
            }
        })?;
        Ok(state)
    }

    pub fn operate(&mut self, bytes: &[u8], executor: &mut dyn ContributionExecutorV2) -> Vec<u8> {
        let result = self.operate_inner(bytes, executor).unwrap_or_else(|error| {
            object([
                ("ok", JsonValue::Bool(false)),
                ("failure", error),
                (
                    "documentVersion",
                    number(self.runtime.document_version.get()),
                ),
                (
                    "history",
                    self.runtime
                        .history
                        .projected()
                        .ok()
                        .and_then(|history| value(&history).ok())
                        .unwrap_or(JsonValue::Null),
                ),
            ])
        });
        encode(&result).unwrap_or_else(|_| {
            b"{\"ok\":false,\"failure\":{\"code\":\"bridge.response-too-large\"}}".to_vec()
        })
    }

    fn operate_inner(
        &mut self,
        bytes: &[u8],
        executor: &mut dyn ContributionExecutorV2,
    ) -> Result<Value> {
        let request = decode(bytes)?;
        if tag(&request, "operation", "read") && exact(&request, &["operation"]) {
            let state = self.runtime.read_state().map_err(|_| internal())?;
            return Ok(object([
                ("ok", JsonValue::Bool(true)),
                ("state", value(&state)?),
                ("availability", self.availability()?),
                ("callbackProjections", number(self.callback_projections)),
            ]));
        }
        if tag(&request, "operation", "markPersisted")
            && exact(&request, &["operation", "checkpoint"])
        {
            let checkpoint = field(&request, "checkpoint")?;
            if !exact(checkpoint, &["documentId", "documentVersion"]) {
                return Err(failure("checkpoint.invalid"));
            }
            let document_id = StableId::new(string(field(checkpoint, "documentId")?)?)
                .map_err(|_| failure("checkpoint.invalid"))?;
            let document_version = DocumentVersionV1::try_from(
                integer(field(checkpoint, "documentVersion")?)
                    .ok_or_else(|| failure("checkpoint.invalid"))?,
            )
            .map_err(|_| failure("checkpoint.invalid"))?;
            self.reserve_reply(
                &JsonValue::Null,
                &[],
                &KernelCommandIdentityV1::Core(
                    brilliant_kernel_contracts::CoreCommandIdV1::DocumentSetMetadata,
                ),
            )?;
            let result = self.runtime.mark_persisted(PersistedCheckpointV1 {
                document_id,
                document_version,
            });
            return Ok(object([
                ("ok", JsonValue::Bool(true)),
                ("checkpoint", value(&result)?),
            ]));
        }
        self.require_writable()?;
        if tag(&request, "operation", "submit") && exact(&request, &["operation", "command"]) {
            return self.submit(field(&request, "command")?, executor);
        }
        let redo = tag(&request, "operation", "redo");
        if (redo || tag(&request, "operation", "undo")) && exact(&request, &["operation"]) {
            if !(if redo {
                self.runtime.history.can_redo()
            } else {
                self.runtime.history.can_undo()
            }) {
                return Err(failure(if redo {
                    "history.empty-redo"
                } else {
                    "history.empty-undo"
                }));
            }
            let document = self
                .runtime
                .preview_integrated_history(redo)
                .map_err(|error| value(&error).unwrap_or_else(|_| internal()))?;
            let next = self
                .runtime
                .document_version
                .checked_next()
                .ok_or_else(|| failure("command.version-overflow"))?;
            let pipeline = self.assess(&document, next.get(), executor)?;
            let entry = if redo {
                self.runtime.history.redo_entry()
            } else {
                self.runtime.history.undo_entry()
            }
            .map_err(|_| internal())?;
            self.reserve_reply(&pipeline, &entry.affected, &entry.command_id)?;
            let result = if redo {
                self.runtime.redo()
            } else {
                self.runtime.undo()
            };
            return self.completed(result, pipeline);
        }
        Err(failure("command.invalid-envelope"))
    }

    fn submit(
        &mut self,
        envelope: &Value,
        executor: &mut dyn ContributionExecutorV2,
    ) -> Result<Value> {
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
        let descriptor = self
            .commands
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
        let initial = self
            .runtime
            .store
            .export_document()
            .map_err(|_| internal())?;
        let prepared_reply = self.call(
            "prepare",
            &initial,
            self.runtime.document_version.get(),
            [("command", envelope.clone())],
            executor,
        )?;
        if !exact(&prepared_reply, &["ok", "prepared"]) {
            return Err(contract());
        }
        let prepared = field(&prepared_reply, "prepared").map_err(|_| contract())?;
        let id = self.runtime.document_id().clone();
        let mut transaction = self.runtime.begin_stage3_transaction();
        if let StableEntityAddressV1::Document { document_id } = &target_entity {
            if document_id != &id {
                return Err(failure("command.target-not-found"));
            }
        } else if transaction.overlay.read_entity(&target_entity).is_none() {
            return Err(failure("command.target-not-found"));
        }
        let mut projection_count = 0;
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
                    if !exact(
                        request,
                        &["requestVersion", "requestKind", "target", "writtenPitch"],
                    ) || integer(field(request, "requestVersion")?) != Some(1)
                    {
                        return Err(contract());
                    }
                    let target = field(request, "target")?;
                    if !exact(target, &["kind", "noteId"]) || !tag(target, "kind", "note") {
                        return Err(contract());
                    }
                    let note_id =
                        StableId::new(string(field(target, "noteId")?)?).map_err(|_| contract())?;
                    let pitch = WrittenPitchV1::from_lossless_value(
                        field(request, "writtenPitch")?.clone(),
                    )
                    .map_err(|_| contract())?;
                    if !brilliant_score_foundation::written_pitch_is_valid(&pitch) {
                        return Err(contract());
                    }
                    transaction
                        .set_note_written_pitch(note_id, pitch)
                        .map_err(|_| contract())?;
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
                let effect = self
                    .effects
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
                        if transaction
                            .overlay
                            .read_entity(&StableEntityAddressV1::Part {
                                part_id: part_id.clone(),
                            })
                            .is_none()
                        {
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
                let document = transaction
                    .integrated_projection(&id)
                    .map_err(|_| internal())?;
                projection_count += 1;
                let transformed_reply = call(
                    executor,
                    object([
                        ("operation", text("transform")),
                        ("document", value(&document)?),
                        (
                            "documentVersion",
                            number(self.runtime.document_version.get()),
                        ),
                        ("contributionId", field(source, "contributionId")?.clone()),
                        ("effect", request.clone()),
                    ]),
                    source,
                )?;
                if !exact(&transformed_reply, &["ok", "transformed"]) {
                    return Err(contract());
                }
                let transformed =
                    field(&transformed_reply, "transformed").map_err(|_| contract())?;
                let namespace = string(field(request, "namespace")?)?.clone();
                let block =
                    if tag(transformed, "status", "remove") && exact(transformed, &["status"]) {
                        None
                    } else if tag(transformed, "status", "replace")
                        && exact(transformed, &["status", "schemaVersion", "payload"])
                    {
                        let version =
                            integer(field(transformed, "schemaVersion")?).ok_or_else(contract)?;
                        if !array(field(effect, "supportedSchemaVersions")?)?
                            .iter()
                            .any(|value| integer(value) == Some(version))
                        {
                            return Err(contract());
                        }
                        Some(
                            ExtensionBlockV1::from_lossless_value(object([
                                ("namespace", JsonValue::String(namespace.clone())),
                                ("owner", value(&owner)?),
                                (
                                    "schemaVersion",
                                    field(transformed, "schemaVersion")?.clone(),
                                ),
                                ("payload", field(transformed, "payload")?.clone()),
                            ]))
                            .map_err(|_| contract())?,
                        )
                    } else {
                        return Err(contract());
                    };
                transaction
                    .set_integrated_extension(namespace, owner, block)
                    .map_err(|_| contract())?;
            }
            let addresses = array(field(prepared, "affected")?)?;
            let mut normalized = std::collections::BTreeMap::new();
            for address in addresses {
                let (key, target, entity) = decode_address(address).map_err(|_| contract())?;
                if let StableEntityAddressV1::Document { document_id } = &entity {
                    if document_id != &id {
                        return Err(contract());
                    }
                } else if transaction.overlay.read_entity(&entity).is_none() {
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
        let document = transaction
            .integrated_projection(&id)
            .map_err(|_| internal())?;
        projection_count += 1;
        let changed = document != initial;
        let mut prepared = transaction.finish().map_err(|_| internal())?;
        prepared.integrated_affected = Some(affected);
        let next = if changed {
            self.runtime
                .document_version
                .checked_next()
                .ok_or_else(|| failure("command.version-overflow"))?
        } else {
            self.runtime.document_version
        };
        self.callback_projections = self.callback_projections.saturating_add(projection_count);
        let pipeline = self.assess(&document, next.get(), executor)?;
        self.reserve_reply(
            &pipeline,
            prepared.integrated_affected.as_deref().unwrap_or(&[]),
            &KernelCommandIdentityV1::Module(StableId::new(command_id).map_err(|_| contract())?),
        )?;
        let prepared = if changed {
            prepared
        } else {
            self.runtime
                .begin_stage3_transaction()
                .finish()
                .map_err(|_| internal())?
        };
        let result = self.runtime.commit_integrated_transaction(
            StableId::new(command_id).map_err(|_| contract())?,
            prepared,
        );
        self.completed(result, pipeline)
    }

    fn completed(&self, result: KernelStage4CommandResultV1, pipeline: Value) -> Result<Value> {
        Ok(object([
            ("ok", JsonValue::Bool(true)),
            ("result", value(&result)?),
            ("pipeline", pipeline),
            ("callbackProjections", number(self.callback_projections)),
        ]))
    }
    /// Conservatively reserve the private response before any adoption. Both
    /// copies of affected addresses and both possible event document IDs count;
    /// fixed overhead covers all scalar fields at their maximal decimal widths.
    fn reserve_reply(
        &self,
        pipeline: &Value,
        affected: &[AffectedEntityAddressV1],
        command: &KernelCommandIdentityV1,
    ) -> Result<()> {
        let required = encode(pipeline)?.len() as u64
            + 2 * encode(&affected.to_vec())?.len() as u64
            + 2 * encode(self.runtime.document_id())?.len() as u64
            + encode(command)?.len() as u64
            + 16_384;
        if required > brilliant_kernel_contracts::RESPONSE_BYTE_LIMIT as u64 {
            return Err(internal());
        }
        Ok(())
    }
    fn call<const N: usize>(
        &mut self,
        operation: &str,
        document: &ScoreDocumentV1,
        version: u64,
        extra: [(&str, Value); N],
        executor: &mut dyn ContributionExecutorV2,
    ) -> Result<Value> {
        self.callback_projections = self.callback_projections.saturating_add(1);
        let mut request = object([
            ("operation", text(operation)),
            ("document", value(document)?),
            ("documentVersion", number(version)),
        ]);
        let JsonValue::Object(fields) = &mut request else {
            unreachable!()
        };
        for (key, value) in extra {
            fields.insert(key.into(), value);
        }
        call(executor, request, &JsonValue::Null)
    }
    fn assess(
        &mut self,
        document: &ScoreDocumentV1,
        version: u64,
        executor: &mut dyn ContributionExecutorV2,
    ) -> Result<Value> {
        let semantic = assess_score_semantics(&value(document)?).map_err(|_| internal())?;
        if !semantic.diagnostics.is_empty() {
            return Err(object([
                ("code", text("command.semantic-invalid")),
                ("diagnostics", value(&semantic.diagnostics)?),
            ]));
        }
        let reply = self.call("assess", document, version, [], executor)?;
        if !exact(&reply, &["ok", "assessment", "availability"]) {
            return Err(internal());
        }
        Ok(reply)
    }
    fn availability(&self) -> Result<Value> {
        let result = self.runtime.assess_domain_availability(&self.assembly);
        decode(&encode_domain_availability_result_v1(&result.result).map_err(|_| internal())?)
    }
    fn require_writable(&self) -> Result<()> {
        let result = self
            .runtime
            .assess_domain_availability(&self.assembly)
            .result
            .map_err(|_| internal())?;
        if result.is_complete() {
            return Ok(());
        }
        let incompatible = result.facts.iter().any(|fact| matches!(fact.reason, brilliant_extension_protocol::DomainAvailabilityReasonV1::RequiredContributionIncompatible));
        let wire = self.availability()?;
        let available = field(&wire, "value")?;
        Err(object([
            (
                "code",
                text(if incompatible {
                    "command.required-contribution-incompatible"
                } else {
                    "command.required-contribution-unavailable"
                }),
            ),
            ("facts", field(available, "facts")?.clone()),
        ]))
    }
}

fn decode_address(
    address: &Value,
) -> Result<(JsString, AffectedEntityAddressV1, StableEntityAddressV1)> {
    let kind = string(field(address, "kind")?)?;
    macro_rules! address {
        ($name:literal, $field:ident, $variant:ident) => {
            if kind.eq_ascii($name) {
                let key = concat!($name, "Id");
                if !exact(address, &["kind", key]) {
                    return Err(internal());
                }
                let raw = string(field(address, key)?)?;
                if raw.is_empty() {
                    return Err(internal());
                }
                let id = StableId::new(raw).map_err(|_| internal())?;
                let key = JsString::from_utf16(
                    concat!($name, ":")
                        .encode_utf16()
                        .chain(raw.code_units().iter().copied())
                        .collect::<Vec<_>>(),
                );
                return Ok((
                    key,
                    ScoreEntityTargetV1::$variant {
                        $field: id.clone().into(),
                    },
                    StableEntityAddressV1::$variant { $field: id },
                ));
            }
        };
    }
    address!("document", document_id, Document);
    address!("measure", measure_id, Measure);
    address!("part", part_id, Part);
    address!("staff", staff_id, Staff);
    address!("voice", voice_id, Voice);
    address!("event", event_id, Event);
    address!("note", note_id, Note);
    Err(internal())
}

fn call(
    executor: &mut dyn ContributionExecutorV2,
    request: Value,
    source: &Value,
) -> Result<Value> {
    let reply = executor
        .execute(&encode(&request)?)
        .map_err(|_| owned_failure(source, "command.contribution-internal-error"))?;
    let reply = decode(&reply)
        .map_err(|_| owned_failure(source, "command.contribution-contract-violation"))?;
    match field(&reply, "ok")? {
        JsonValue::Bool(true) => Ok(reply),
        JsonValue::Bool(false) if exact(&reply, &["ok", "failure"]) => {
            Err(field(&reply, "failure")?.clone())
        }
        _ => Err(owned_failure(
            source,
            "command.contribution-contract-violation",
        )),
    }
}
fn owned_failure(source: &Value, code: &str) -> Value {
    match (field(source, "moduleId"), field(source, "contributionId")) {
        (Ok(module_id), Ok(contribution_id)) => object([
            ("code", text(code)),
            ("moduleId", module_id.clone()),
            ("contributionId", contribution_id.clone()),
        ]),
        _ => internal(),
    }
}
fn resource(kind: &str, limit: u64) -> Value {
    object([
        ("code", text("command.resource-limit-exceeded")),
        ("limitKind", text(kind)),
        ("limit", number(limit)),
        ("actual", number(limit + 1)),
    ])
}
fn validate_descriptors(
    commands: &[Value],
    effects: &[Value],
    assembly: &ResolvedHostAssemblyV1,
) -> Result<()> {
    if commands.len() > 4096 || effects.len() > 4096 {
        return Err(failure("command.assembly-mismatch"));
    }
    for (values, key) in [(commands, "commandId"), (effects, "effectKind")] {
        let mut seen = std::collections::HashSet::new();
        for descriptor in values {
            let id = string(field(descriptor, key)?)?;
            if !brilliant_extension_protocol::valid_registry_id(id.code_units().iter().copied())
                || id.code_units().starts_with(&[99, 111, 114, 101, 46])
                || !seen.insert(id)
            {
                return Err(failure("command.assembly-mismatch"));
            }
            let source = field(descriptor, "source")?;
            if !exact(source, &["moduleId", "contributionId"])
                || !assembly.has_installed_owner(
                    &StableId::new(string(field(source, "moduleId")?)?).map_err(|_| internal())?,
                    &StableId::new(string(field(source, "contributionId")?)?)
                        .map_err(|_| internal())?,
                )
            {
                return Err(failure("command.assembly-mismatch"));
            }
        }
    }
    for command in commands {
        if !exact(
            command,
            &[
                "descriptorVersion",
                "commandId",
                "commandVersion",
                "source",
                "targetKind",
                "requiredCapabilities",
                "titleKey",
            ],
        ) || ![
            "document", "measure", "part", "staff", "voice", "event", "note",
        ]
        .iter()
        .any(|kind| tag(command, "targetKind", kind))
            || integer(field(command, "descriptorVersion")?) != Some(1)
            || integer(field(command, "commandVersion")?) != Some(1)
            || array(field(command, "requiredCapabilities")?)?
                != [text("command:execute"), text("score:read")]
        {
            return Err(failure("command.assembly-mismatch"));
        }
    }
    for effect in effects {
        if !exact(
            effect,
            &[
                "descriptorVersion",
                "effectKind",
                "source",
                "namespace",
                "ownerKinds",
                "supportedSchemaVersions",
            ],
        ) || integer(field(effect, "descriptorVersion")?) != Some(1)
        {
            return Err(failure("command.assembly-mismatch"));
        }
        let owners = array(field(effect, "ownerKinds")?)?;
        if owners != [text("score")]
            && owners != [text("part")]
            && owners != [text("score"), text("part")]
        {
            return Err(failure("command.assembly-mismatch"));
        }
        let namespace = string(field(effect, "namespace")?)?;
        let requirement = assembly
            .requirements()
            .iter()
            .find(|requirement| namespace.eq_ascii(&requirement.namespace))
            .ok_or_else(internal)?;
        if field(field(effect, "source")?, "moduleId")? != &value(&requirement.module_id)?
            || field(field(effect, "source")?, "contributionId")?
                != &value(&requirement.contribution_id)?
            || array(field(effect, "supportedSchemaVersions")?)?
                .iter()
                .map(integer)
                .collect::<Vec<_>>()
                != requirement
                    .supported_schema_versions
                    .iter()
                    .map(|version| Some(*version))
                    .collect::<Vec<_>>()
        {
            return Err(failure("command.assembly-mismatch"));
        }
    }
    Ok(())
}
