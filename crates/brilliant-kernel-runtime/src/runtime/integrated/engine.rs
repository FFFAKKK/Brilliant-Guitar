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
use brilliant_score_foundation::{
    LosslessDecode, ScoreFeatureProfileV1, ScoreSupportV1, assess_score_profile,
    assess_score_semantics,
};
mod assessment;
mod batch;
#[cfg(test)]
mod classification_cache_tests;
mod core;
mod core_reads;
mod migration;
mod module;
mod scheduled_assessment;
mod scheduled_preparation;

type CoreDispatch = fn(
    &mut KernelStage3TransactionV1<'_>,
    CoreCommandEnvelopeV1,
) -> std::result::Result<(), KernelStage3CommandFailureLeafV1>;

/// Fixed assembly and one ordinary Rust runtime. The host executor is borrowed
/// for a call; the Node owner retains its authentic callback for this lifetime.
pub struct IntegratedKernelRuntimeV2 {
    runtime: KernelRuntime,
    assembly: Arc<ResolvedHostAssemblyV1>,
    commands: Vec<Value>,
    effects: Vec<Value>,
    callback_projections: u64,
    assessment_reads: Vec<Value>,
    // Only published results for the current committed document are reusable.
    // Standalone module effects cannot change any K1 classification dependency.
    core_classification: Option<(DocumentVersionV1, Value)>,
    #[cfg(test)]
    classification_scans: u64,
}

impl IntegratedKernelRuntimeV2 {
    pub fn create(
        bytes: &[u8],
        executor: &mut dyn ContributionExecutorV2,
    ) -> std::result::Result<Self, Vec<u8>> {
        let _reads = core_reads::OperationScope::enter();
        Self::create_inner(bytes, executor).map_err(|failure| {
            encode(&failure).unwrap_or_else(|_| b"{\"code\":\"command.internal-error\"}".to_vec())
        })
    }

    fn create_inner(bytes: &[u8], executor: &mut dyn ContributionExecutorV2) -> Result<Self> {
        let request = decode(bytes)?;
        if !(exact(
            &request,
            &[
                "apiVersion",
                "document",
                "catalog",
                "commands",
                "effects",
                "inventory",
            ],
        ) || exact(
            &request,
            &[
                "apiVersion",
                "document",
                "catalog",
                "commands",
                "effects",
                "inventory",
                "assessmentReads",
            ],
        )) || integer(field(&request, "apiVersion")?) != Some(2)
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
        let assessment_reads = assessment::decode_reads(
            field(&request, "assessmentReads").unwrap_or(&JsonValue::Array(vec![])),
            &assembly,
        )
        .map_err(|_| failure("command.assembly-mismatch"))?;
        let runtime = KernelRuntime::create(document)
            .map_err(|_| failure("command.invalid-initial-document"))?;
        let mut state = Self {
            runtime,
            assembly,
            commands,
            effects,
            callback_projections: 0,
            assessment_reads,
            core_classification: None,
            #[cfg(test)]
            classification_scans: 0,
        };
        let document = state
            .runtime
            .store
            .export_document()
            .map_err(|_| internal())?;
        state
            .assess_admission(&document, executor)
            .map_err(|error| {
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

    pub fn operate(
        &mut self,
        bytes: &[u8],
        executor: &mut dyn ContributionExecutorV2,
        dispatch_core: CoreDispatch,
    ) -> Vec<u8> {
        let _reads = core_reads::OperationScope::enter();
        let result = self
            .operate_inner(bytes, executor, dispatch_core)
            .unwrap_or_else(|error| {
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
        dispatch_core: CoreDispatch,
    ) -> Result<Value> {
        let request = decode(bytes)?;
        if tag(&request, "operation", "read")
            && exact(&request, &["operation", "knownSnapshotVersion"])
        {
            let known = field(&request, "knownSnapshotVersion")?;
            let known = if known == &JsonValue::Null {
                None
            } else {
                Some(
                    DocumentVersionV1::try_from(integer(known).ok_or_else(internal)?)
                        .map_err(|_| internal())?,
                )
            };
            // Preserve checkpoint scheduling and history/dirty observations via
            // the existing Stage 4 read seam; only repeated document bytes omit.
            let state = self.runtime.read_stage4(known).map_err(|_| internal())?;
            let snapshot = object([
                ("documentId", value(&state.snapshot.document_id)?),
                ("schemaVersion", text(state.snapshot.schema_version)),
                (
                    "documentVersion",
                    number(state.snapshot.document_version.get()),
                ),
                (
                    "document",
                    match &state.snapshot.document {
                        Some(document) => value(document.as_document())?,
                        None => JsonValue::Null,
                    },
                ),
            ]);
            return Ok(object([
                ("ok", JsonValue::Bool(true)),
                (
                    "state",
                    object([
                        ("snapshot", snapshot),
                        ("history", value(&state.history)?),
                        ("dirty", JsonValue::Bool(state.dirty)),
                    ]),
                ),
                ("availability", self.availability()?),
                ("callbackProjections", number(self.callback_projections)),
            ]));
        }
        if tag(&request, "operation", "read") && exact(&request, &["operation"]) {
            let state = self.runtime.read_state().map_err(|_| internal())?;
            // Integrated views preserve opaque order; the frozen V1 snapshot
            // codec intentionally remains canonical for its old consumers.
            let snapshot = object([
                ("documentId", value(&state.snapshot.document_id)?),
                ("schemaVersion", text(state.snapshot.schema_version)),
                (
                    "documentVersion",
                    number(state.snapshot.document_version.get()),
                ),
                ("document", value(&state.snapshot.document)?),
            ]);
            return Ok(object([
                ("ok", JsonValue::Bool(true)),
                (
                    "state",
                    object([
                        ("snapshot", snapshot),
                        ("history", value(&state.history)?),
                        ("dirty", JsonValue::Bool(state.dirty)),
                    ]),
                ),
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
            let command = field(&request, "command")?;
            if field(command, "commandId")
                .ok()
                .and_then(|id| string(id).ok())
                .is_some_and(|id| id.code_units().starts_with(&[99, 111, 114, 101, 46]))
            {
                return self.submit_core(command, executor, dispatch_core);
            }
            return self.submit(command, executor);
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
        let id = self.runtime.document_id().clone();
        let mut transaction = self.runtime.begin_stage3_transaction();
        let mut projection_count = 0;
        let module = module::ModuleEnvironment {
            assembly: &self.assembly,
            assessment_reads: &self.assessment_reads,
            commands: &self.commands,
            effects: &self.effects,
            id: &id,
            version: self.runtime.document_version.get(),
        }
        .prepare(envelope, &mut transaction, &mut projection_count, executor)?;
        let affected = module.affected;
        let command_id = module.source.command_id;
        let document = transaction
            .integrated_projection(&id)
            .map_err(|_| internal())?;
        projection_count += 1;
        let changed = transaction
            .overlay
            .module_net_changed()
            .map_err(|_| internal())?;
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
        // module_net_changed above also rejects writes outside pitch/extensions.
        // Those writes still need semantic and plugin validation, but cannot
        // change the K1 feature policy result.
        let cached = self
            .core_classification
            .as_ref()
            .filter(|(version, _)| *version == self.runtime.document_version)
            .map(|(_, core)| core.clone());
        let pipeline = self.assess_with_classification(&document, next.get(), executor, cached)?;
        self.reserve_reply(
            &pipeline,
            prepared.integrated_affected.as_deref().unwrap_or(&[]),
            &KernelCommandIdentityV1::Module(command_id.clone()),
        )?;
        let prepared = if changed {
            prepared
        } else {
            self.runtime
                .begin_stage3_transaction()
                .finish()
                .map_err(|_| internal())?
        };
        let result = self
            .runtime
            .commit_integrated_transaction(command_id.clone(), prepared);
        self.completed(result, pipeline)
    }

    fn completed(&mut self, result: KernelStage4CommandResultV1, pipeline: Value) -> Result<Value> {
        if !matches!(result, KernelStage4CommandResultV1::Rejected { .. }) {
            // No fallible work after adoption. A missing report simply prevents
            // reuse; rejected candidates never replace the committed report.
            self.core_classification = field(&pipeline, "assessment")
                .and_then(|assessment| field(assessment, "core"))
                .ok()
                .cloned()
                .map(|core| (self.runtime.document_version, core));
        }
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
        document: Value,
        version: u64,
        extra: [(&str, Value); N],
        executor: &mut dyn ContributionExecutorV2,
    ) -> Result<Value> {
        self.callback_projections = self.callback_projections.saturating_add(1);
        let mut request = object([
            ("operation", text(operation)),
            ("document", document),
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
    fn assess_admission(
        &mut self,
        document: &ScoreDocumentV1,
        executor: &mut dyn ContributionExecutorV2,
    ) -> Result<()> {
        if !executor.uses_scoped_assessment() {
            // Legacy hosts receive Core assessment in their callback contract.
            return self.assess(document, 0, executor).map(|_| ());
        }
        check_typed_capture(document)?;
        let semantics = brilliant_score_foundation::assess_score_semantics_node(
            brilliant_score_foundation::DocumentAssessmentNodeV1::new(document),
        )
        .map_err(assessment_failure)?;
        if !semantics.ok {
            return Err(object([
                ("code", text("command.semantic-invalid")),
                ("diagnostics", value(&semantics.diagnostics)?),
            ]));
        }
        let sources = self.assessment_sources(document)?;
        self.candidate_availability(document)?;
        // Admission returns no feature report. Keep all semantic, availability
        // and module checks without constructing unused K1 unsupported details.
        self.scheduled_assess_modules(document, 0, sources, executor)?;
        Ok(())
    }

    fn assess(
        &mut self,
        document: &ScoreDocumentV1,
        version: u64,
        executor: &mut dyn ContributionExecutorV2,
    ) -> Result<Value> {
        self.assess_with_classification(document, version, executor, None)
    }

    fn assess_with_classification(
        &mut self,
        document: &ScoreDocumentV1,
        version: u64,
        executor: &mut dyn ContributionExecutorV2,
        cached: Option<Value>,
    ) -> Result<Value> {
        if executor.uses_scoped_assessment() {
            check_typed_capture(document)?;
            let core = if let Some(core) = cached {
                let semantic = brilliant_score_foundation::assess_score_semantics_node(
                    brilliant_score_foundation::DocumentAssessmentNodeV1::new(document),
                )
                .map_err(assessment_failure)?;
                if !semantic.ok {
                    return Err(object([
                        ("code", text("command.semantic-invalid")),
                        ("diagnostics", value(&semantic.diagnostics)?),
                    ]));
                }
                core
            } else {
                #[cfg(test)]
                {
                    self.classification_scans += 1;
                }
                let core = brilliant_score_foundation::assess_score_profile_node(
                    brilliant_score_foundation::DocumentAssessmentNodeV1::new(document),
                    &ScoreFeatureProfileV1::k1(),
                )
                .map_err(assessment_failure)?;
                if let ScoreSupportV1::Invalid { diagnostics } = &core {
                    return Err(object([
                        ("code", text("command.semantic-invalid")),
                        ("diagnostics", value(diagnostics)?),
                    ]));
                }
                value(&core)?
            };
            let sources = self.assessment_sources(document)?;
            let availability = self.candidate_availability(document)?;
            let modules = self.scheduled_assess_modules(document, version, sources, executor)?;
            return Ok(object([
                ("ok", JsonValue::Bool(true)),
                ("availability", availability),
                (
                    "assessment",
                    object([("core", core), ("modules", JsonValue::Array(modules))]),
                ),
            ]));
        }
        // Capture once for Core assessment and the subsequent plugin read source.
        // Neither stage mutates this value; do not serialize and parse it twice.
        let candidate = value(document)?;
        let core = assess_score_profile(&candidate, &ScoreFeatureProfileV1::k1())
            .map_err(assessment_failure)?;
        if let ScoreSupportV1::Invalid { diagnostics } = &core {
            return Err(object([
                ("code", text("command.semantic-invalid")),
                ("diagnostics", value(diagnostics)?),
            ]));
        }
        let core = value(&core)?;
        let sources = self.assessment_sources(document)?;
        let availability = self.candidate_availability(document)?;
        let mut reply = self
            .call(
                "assess",
                candidate,
                version,
                [("coreAssessment", core.clone())],
                executor,
            )
            .map_err(|error| assessment::validate_failure(error, &sources))?;
        assessment::validate_success(&reply, &sources, &availability)?;
        // Host callbacks can report module results, never replace Core authority.
        // Preserve our result even if an executor echoes a forged Core assessment.
        let JsonValue::Object(fields) = &mut reply else {
            unreachable!()
        };
        let Some(JsonValue::Object(assessment)) =
            fields.get_mut(&brilliant_core_types::JsString::from("assessment"))
        else {
            unreachable!()
        };
        assessment.insert("core".into(), core);
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
    let mut reads = core_reads::CoreReads::new(&request);
    if reads.failed() {
        return Err(owned_failure(source, "command.contribution-internal-error"));
    }
    let reply = executor
        .execute_with_core_reads(&encode(&request)?, &mut reads)
        .map_err(|_| owned_failure(source, "command.contribution-internal-error"))?;
    if reads.failed() {
        return Err(owned_failure(source, "command.contribution-internal-error"));
    }
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
fn check_typed_capture(document: &ScoreDocumentV1) -> Result<()> {
    brilliant_score_foundation::check_document_capture_limits(
        document,
        brilliant_kernel_contracts::REQUEST_BYTE_LIMIT,
    )
    .map_err(|error| match error {
        brilliant_score_foundation::DocumentCaptureFailureV1::Bytes => {
            failure("bridge.response-too-large")
        }
        brilliant_score_foundation::DocumentCaptureFailureV1::Invalid => internal(),
    })
}

fn assessment_failure(error: brilliant_score_foundation::AssessmentFailureV1) -> Value {
    match error {
        brilliant_score_foundation::AssessmentFailureV1::DiagnosticLimit { limit, actual } => {
            object([
                ("code", text("command.resource-limit-exceeded")),
                ("limitKind", text("diagnostics")),
                ("limit", number(limit as u64)),
                ("actual", number(actual as u64)),
            ])
        }
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
