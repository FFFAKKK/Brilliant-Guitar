use brilliant_core_types::{DocumentVersionV1, StableId};
use brilliant_kernel_contracts::{
    CoreCommandEnvelopeV1, KernelReadStateV1, KernelRuleWarningPageV1,
    KernelRuleWarningReadFailureV1, KernelSessionCreateRequestV1, KernelSessionCreateResultV1,
    KernelSessionCreateSuccessValueV1, KernelSessionReadResultV1, KernelStage3CommandFailureLeafV1,
    KernelStage3CommandFailureV1, KernelStage3MetricsV1, KernelStage3SubmitDecodeFailureV1,
    KernelStage3SubmitNoOpValueV1, KernelStage3SubmitRejectedValueV1, KernelStage3SubmitRequestV1,
    KernelStage3SubmitResultV1, KernelStage3SubmitSuccessValueV1, KernelStage4CommandResultV1,
    KernelStage4FailureV1, KernelStage4OperationDecodeFailureV1, KernelStage4OperationRequestV1,
    KernelStage4OperationResultV1, KernelStage4OperationV1, KernelStage4ReadResultV1,
    KernelStage4ReplayCommandResultV1, KernelStage4ReplayRequestV1, KernelStage4ReplayResultV1,
    KernelStage4SelectResultV1, StableFailureV1, decode_admission_stage4_operation_request,
    decode_admission_submit_request, decode_captured_admission_replay_command,
    decode_stage4_replay_request,
};
use brilliant_kernel_runtime::{KernelRuntime, KernelRuntimeCreateFailure};

use crate::commands;

#[derive(Debug)]
pub struct KernelSession {
    runtime: KernelRuntime,
}

#[derive(Debug)]
pub struct KernelSessionCreateAccepted {
    pub session: KernelSession,
    pub result: KernelSessionCreateResultV1,
}

impl KernelSession {
    pub fn create(
        request: KernelSessionCreateRequestV1,
    ) -> Result<KernelSessionCreateAccepted, StableFailureV1> {
        Self::create_with_runtime_factory(request, |validated| {
            KernelRuntime::create(validated.document)
        })
    }

    fn create_with_runtime_factory<F>(
        request: KernelSessionCreateRequestV1,
        runtime_factory: F,
    ) -> Result<KernelSessionCreateAccepted, StableFailureV1>
    where
        F: FnOnce(
            KernelSessionCreateRequestV1,
        ) -> Result<KernelRuntime, KernelRuntimeCreateFailure>,
    {
        if request.api_version != 1 {
            return Err(StableFailureV1::ContractUnsupportedApiVersion {
                supported_version: 1,
            });
        }
        if request.document.schema_version != "brilliant-score-1" {
            return Err(StableFailureV1::ScoreUnsupportedSchema {
                supported_schema: "brilliant-score-1",
            });
        }

        let runtime =
            runtime_factory(request).map_err(KernelRuntimeCreateFailure::into_stable_failure)?;
        let result = KernelSessionCreateResultV1::Created(KernelSessionCreateSuccessValueV1 {
            document_id: runtime.document_id().clone(),
            document_version: runtime.document_version(),
        });
        Ok(KernelSessionCreateAccepted {
            session: Self { runtime },
            result,
        })
    }

    pub fn read_state(&self) -> KernelSessionReadResultV1 {
        match self.runtime.read_state() {
            Ok(state) => KernelSessionReadResultV1::Ok(Box::new(state)),
            Err(failure) => KernelSessionReadResultV1::Rejected(failure.into_stable_failure()),
        }
    }

    pub fn read_rule_warning_page(
        &self,
        document_id: &StableId,
        document_version: DocumentVersionV1,
        offset: usize,
        limit: usize,
    ) -> Result<KernelRuleWarningPageV1, KernelRuleWarningReadFailureV1> {
        self.runtime
            .read_rule_warning_page(document_id, document_version, offset, limit)
    }

    /// Availability for a fixed host assembly. Integrated write enforcement and
    /// module assessment remain the responsibility of the integrated gateway.
    pub fn assess_domain_availability(
        &self,
        assembly: &brilliant_extension_protocol::ResolvedHostAssemblyV1,
    ) -> brilliant_kernel_runtime::DomainAvailabilityAssessmentV1 {
        self.runtime.assess_domain_availability(assembly)
    }

    pub fn submit_stage3_bytes(&mut self, request_bytes: &[u8]) -> KernelStage3SubmitResultV1 {
        match decode_admission_submit_request(request_bytes) {
            Ok(request) => {
                stage4_command_result_to_stage3(self.submit_admission_command(request.command))
            }
            Err(KernelStage3SubmitDecodeFailureV1::Boundary(failure)) => {
                KernelStage3SubmitResultV1::Rejected(failure)
            }
            Err(KernelStage3SubmitDecodeFailureV1::Command(failure)) => command_rejected(
                KernelStage3SubmitRejectedValueV1 {
                    document_version: self.runtime.document_version(),
                    metrics: KernelStage3MetricsV1::default(),
                },
                failure,
            ),
        }
    }

    pub fn submit_stage3(
        &mut self,
        request: KernelStage3SubmitRequestV1,
    ) -> KernelStage3SubmitResultV1 {
        if request.api_version != 1 {
            return KernelStage3SubmitResultV1::Rejected(
                StableFailureV1::ContractUnsupportedApiVersion {
                    supported_version: 1,
                },
            );
        }

        stage4_command_result_to_stage3(self.submit_stage4_command(request.command))
    }

    pub fn submit_stage4_command(
        &mut self,
        command: CoreCommandEnvelopeV1,
    ) -> KernelStage4CommandResultV1 {
        self.submit_admission_command(command.into_admission())
    }

    fn submit_admission_command(
        &mut self,
        command: brilliant_kernel_contracts::CoreAdmissionCommandV1,
    ) -> KernelStage4CommandResultV1 {
        self.runtime
            .submit_stage4_admission(command, commands::dispatch)
    }
    pub fn operate_stage4_bytes(&mut self, request_bytes: &[u8]) -> KernelStage4OperationResultV1 {
        match decode_admission_stage4_operation_request(request_bytes) {
            Ok(request) => self.operate_stage4_inner(request, Self::submit_admission_command),
            Err(KernelStage4OperationDecodeFailureV1::Boundary(failure)) => {
                KernelStage4OperationResultV1::Rejected(failure)
            }
            Err(KernelStage4OperationDecodeFailureV1::Command(failure)) => {
                KernelStage4OperationResultV1::Command(self.runtime.rejected_command(
                    KernelStage4FailureV1::Command(failure),
                    KernelStage3MetricsV1::default(),
                ))
            }
        }
    }

    pub fn operate_stage4(
        &mut self,
        request: KernelStage4OperationRequestV1,
    ) -> KernelStage4OperationResultV1 {
        self.operate_stage4_inner(request, Self::submit_stage4_command)
    }

    fn operate_stage4_inner<Id>(
        &mut self,
        request: KernelStage4OperationRequestV1<Id>,
        submit: fn(&mut Self, CoreCommandEnvelopeV1<Id>) -> KernelStage4CommandResultV1,
    ) -> KernelStage4OperationResultV1 {
        if request.api_version != 1 {
            return KernelStage4OperationResultV1::Rejected(
                StableFailureV1::ContractUnsupportedApiVersion {
                    supported_version: 1,
                },
            );
        }
        match request.operation {
            KernelStage4OperationV1::Submit { command } => {
                KernelStage4OperationResultV1::Command(submit(self, command))
            }
            KernelStage4OperationV1::Undo => {
                KernelStage4OperationResultV1::Command(self.runtime.undo())
            }
            KernelStage4OperationV1::Redo => {
                KernelStage4OperationResultV1::Command(self.runtime.redo())
            }
            KernelStage4OperationV1::MarkPersisted { checkpoint } => {
                KernelStage4OperationResultV1::MarkPersisted(
                    self.runtime.mark_persisted(checkpoint),
                )
            }
            KernelStage4OperationV1::MarkPersistedInvalid => {
                KernelStage4OperationResultV1::MarkPersisted(
                    self.runtime.invalid_persisted_checkpoint(),
                )
            }
            KernelStage4OperationV1::Read {
                known_snapshot_version,
            } => match self.runtime.read_stage4(known_snapshot_version) {
                Ok(state) => KernelStage4OperationResultV1::Read(KernelStage4ReadResultV1::Ok(
                    Box::new(state),
                )),
                Err(_) => KernelStage4OperationResultV1::Read(KernelStage4ReadResultV1::Rejected(
                    KernelStage4FailureV1::ReadInvariantViolation,
                )),
            },
            KernelStage4OperationV1::Select { selector } => {
                KernelStage4OperationResultV1::Select(KernelStage4SelectResultV1 {
                    value: self.runtime.select_stage4(selector),
                })
            }
        }
    }

    pub fn replay_stage4_bytes(request_bytes: &[u8]) -> KernelStage4ReplayResultV1 {
        match decode_stage4_replay_request(request_bytes) {
            Ok(request) => Self::replay_stage4(request),
            Err(failure) => KernelStage4ReplayResultV1::InvalidInitialDocument(failure),
        }
    }

    pub fn replay_stage4(request: KernelStage4ReplayRequestV1) -> KernelStage4ReplayResultV1 {
        let accepted = match Self::create(KernelSessionCreateRequestV1 {
            api_version: request.api_version,
            document: request.initial_document,
        }) {
            Ok(accepted) => accepted,
            Err(failure) => {
                return KernelStage4ReplayResultV1::InvalidInitialDocument(failure);
            }
        };
        let mut session = accepted.session;
        let mut results = Vec::new();
        if results.try_reserve(request.commands.len()).is_err() {
            return KernelStage4ReplayResultV1::InvalidInitialDocument(
                StableFailureV1::BridgeInternal,
            );
        }

        for (index, captured) in request.commands.iter().enumerate() {
            let command_result = match decode_captured_admission_replay_command(captured) {
                Ok(command) => session.submit_admission_command(command),
                Err(failure) => session.runtime.rejected_command(
                    KernelStage4FailureV1::Command(failure),
                    KernelStage3MetricsV1::default(),
                ),
            };
            let (result, failure) = replay_command_projection(command_result);
            results.push(result);
            if let Some(failure) = failure {
                let final_state = match session.replay_final_document() {
                    Ok(final_state) => final_state,
                    Err(failure) => {
                        return KernelStage4ReplayResultV1::InvalidInitialDocument(failure);
                    }
                };
                return KernelStage4ReplayResultV1::Rejected {
                    document_version: final_state.snapshot.document_version,
                    final_document: final_state.snapshot.document,
                    results,
                    failed_command_index: index as u64,
                    failure,
                };
            }
        }

        let final_state = match session.replay_final_document() {
            Ok(final_state) => final_state,
            Err(failure) => {
                return KernelStage4ReplayResultV1::InvalidInitialDocument(failure);
            }
        };
        KernelStage4ReplayResultV1::Replayed {
            document_version: final_state.snapshot.document_version,
            final_document: final_state.snapshot.document,
            results,
        }
    }

    fn replay_final_document(&self) -> Result<KernelReadStateV1, StableFailureV1> {
        self.runtime
            .read_state()
            .map_err(|_| StableFailureV1::BridgeInternal)
    }
}

fn replay_command_projection(
    result: KernelStage4CommandResultV1,
) -> (
    KernelStage4ReplayCommandResultV1,
    Option<KernelStage4FailureV1>,
) {
    match result {
        KernelStage4CommandResultV1::Committed { value, .. } => (
            KernelStage4ReplayCommandResultV1 {
                status: "committed",
                document_version: value.document_version,
                history: value.history,
                failure: None,
            },
            None,
        ),
        KernelStage4CommandResultV1::NoOp { value } => (
            KernelStage4ReplayCommandResultV1 {
                status: "no-op",
                document_version: value.document_version,
                history: value.history,
                failure: None,
            },
            None,
        ),
        KernelStage4CommandResultV1::Rejected { value, failure } => (
            KernelStage4ReplayCommandResultV1 {
                status: "command-rejected",
                document_version: value.document_version,
                history: value.history,
                failure: Some(failure.clone()),
            },
            Some(failure),
        ),
    }
}

fn stage4_command_result_to_stage3(
    result: KernelStage4CommandResultV1,
) -> KernelStage3SubmitResultV1 {
    match result {
        KernelStage4CommandResultV1::Committed { value, .. } => {
            KernelStage3SubmitResultV1::Committed(KernelStage3SubmitSuccessValueV1 {
                document_version: value.document_version,
                affected: value.affected,
                metrics: value.metrics,
            })
        }
        KernelStage4CommandResultV1::NoOp { value } => {
            KernelStage3SubmitResultV1::NoOp(KernelStage3SubmitNoOpValueV1 {
                document_version: value.document_version,
                metrics: value.metrics,
            })
        }
        KernelStage4CommandResultV1::Rejected { value, failure } => command_rejected(
            KernelStage3SubmitRejectedValueV1 {
                document_version: value.document_version,
                metrics: value.metrics,
            },
            match failure {
                KernelStage4FailureV1::Command(failure) => failure,
                _ => KernelStage3CommandFailureLeafV1::InternalError.into(),
            },
        ),
    }
}

fn command_rejected(
    value: KernelStage3SubmitRejectedValueV1,
    failure: impl Into<KernelStage3CommandFailureV1>,
) -> KernelStage3SubmitResultV1 {
    KernelStage3SubmitResultV1::CommandRejected {
        value,
        failure: failure.into(),
    }
}

#[cfg(test)]
mod admission_tests;

#[cfg(test)]
mod tests {
    use brilliant_kernel_contracts::{
        KernelEventCauseV1, KernelEventV1, KernelSelectorResultV1, KernelSelectorValueV1,
        KernelSessionCreateRequestV1, KernelStage3CommandFailureV1,
        KernelStage4MarkPersistedResultV1, ScoreEntityTargetV1, ScoreRangeSelectionV1,
        ScoreStructureViolationV1, SelectedScoreEntityV1, decode_create_request,
        decode_stage3_submit_request, encode_create_result, encode_read_result,
    };

    use super::*;

    const SMOKE_REQUEST: &str = r#"{"apiVersion":1,"document":{"schemaVersion":"brilliant-score-1","id":"score-rkp1","metadata":{"title":"Smoke","authors":["Brilliant"],"tempo":{"bpm":120}},"measureDefinitions":[{"id":"measure-1","meter":{"numerator":4,"denominator":4}}],"parts":[{"id":"part-1","name":"Part","instrument":{"name":"Piano","writtenToSounding":{"diatonicSteps":0,"chromaticSemitones":0}},"staves":[{"id":"staff-1","lineCount":5,"defaultClef":{"sign":"G","line":2}}],"measureContents":[{"measureId":"measure-1","voices":[{"id":"voice-1","defaultStaffId":"staff-1","sequence":{"start":{"numerator":0,"denominator":1},"events":[{"id":"event-1","duration":{"base":1,"dots":0},"content":{"kind":"rest"}}]}}]}]}],"extensions":[]}}"#;
    const LOCAL_REQUEST: &str = r#"{"apiVersion":1,"document":{"schemaVersion":"brilliant-score-1","id":"score-local","metadata":{"title":"Local","authors":["Brilliant"],"tempo":{"bpm":120}},"measureDefinitions":[{"id":"measure-1","meter":{"numerator":4,"denominator":4}}],"parts":[{"id":"part-1","name":"Part","instrument":{"name":"Piano","writtenToSounding":{"diatonicSteps":0,"chromaticSemitones":0}},"staves":[{"id":"staff-1","lineCount":5,"defaultClef":{"sign":"G","line":2}}],"measureContents":[{"measureId":"measure-1","voices":[{"id":"voice-1","defaultStaffId":"staff-1","sequence":{"start":{"numerator":0,"denominator":1},"events":[{"id":"event-1","duration":{"base":4,"dots":0},"content":{"kind":"notes","notes":[{"id":"note-1","writtenPitch":{"step":"C","alter":0,"octave":4}}]}}]}},{"id":"voice-2","defaultStaffId":"staff-1","sequence":{"start":{"numerator":0,"denominator":1},"events":[{"id":"event-2","duration":{"base":4,"dots":0},"content":{"kind":"rest"}}]}}]}]}],"extensions":[]}}"#;

    fn local_session() -> KernelSession {
        KernelSession::create(decode_create_request(LOCAL_REQUEST.as_bytes()).expect("request"))
            .expect("session")
            .session
    }

    #[test]
    fn assembly_availability_reads_real_headers_without_changing_opaque_data_or_session() {
        use brilliant_extension_protocol::*;
        let request = SMOKE_REQUEST.replace(r#""extensions":[]"#, r#""extensions":[{"namespace":"known.domain","schemaVersion":1,"owner":{"kind":"score"},"payload":{"raw":"\ud800"}},{"namespace":"unknown.domain","schemaVersion":99,"owner":{"kind":"score"},"payload":{"raw":[0.125,null]}},{"namespace":"known.domain","schemaVersion":2,"owner":{"kind":"part","partId":"part-1"},"payload":{"raw":"\udc00"}}]"#);
        let request = decode_create_request(request.as_bytes()).unwrap();
        let requirement = ExtensionRuntimeRequirementV1 {
            protocol_version: 1,
            namespace: "known.domain".into(),
            module_id: request.document.id.clone(),
            contribution_id: request.document.parts[0].id.clone(),
            supported_schema_versions: vec![1, 2],
            required_for_write: true,
        };
        let session = KernelSession::create(request).unwrap().session;
        let baseline = encode_read_result(&session.read_state()).unwrap();
        let catalog = HostCatalogV1::new(HostInstalledContributionsV1 {
            contributions: vec![],
        })
        .unwrap();
        let unknown = catalog
            .resolve_inventory(InventorySelectionV1::Omitted)
            .unwrap();
        let read = session.assess_domain_availability(&unknown);
        assert_eq!(read.extension_headers_visited, 3);
        assert!(read.result.unwrap().is_complete());
        let known = catalog
            .resolve_inventory(InventorySelectionV1::Explicit(vec![requirement.clone()]))
            .unwrap();
        let read = session.assess_domain_availability(&known);
        assert_eq!(read.extension_headers_visited, 3);
        let facts = read.result.unwrap().facts;
        assert_eq!(facts.len(), 2);
        assert!(
            facts
                .iter()
                .all(|fact| fact.reason
                    == DomainAvailabilityReasonV1::RequiredContributionUnavailable)
        );
        assert_eq!(facts[0].owner, DomainAvailabilityOwnerV1::Score);
        assert!(matches!(facts[1].owner, DomainAvailabilityOwnerV1::Part(_)));
        let installed = HostCatalogV1::new(HostInstalledContributionsV1 {
            contributions: vec![HostInstalledContributionV1 {
                module_id: requirement.module_id.clone(),
                contribution_id: requirement.contribution_id.clone(),
                requirements: vec![requirement],
            }],
        })
        .unwrap();
        let ready = installed
            .resolve_inventory(InventorySelectionV1::Omitted)
            .unwrap();
        drop(installed);
        assert!(
            session
                .assess_domain_availability(&ready)
                .result
                .unwrap()
                .is_complete()
        );
        assert_eq!(encode_read_result(&session.read_state()).unwrap(), baseline);
    }

    fn submit(session: &mut KernelSession, request: &str) -> KernelStage3SubmitResultV1 {
        session.submit_stage3(
            decode_stage3_submit_request(request.as_bytes()).expect("stage-three request"),
        )
    }

    fn operate(session: &mut KernelSession, request: &str) -> KernelStage4OperationResultV1 {
        session.operate_stage4_bytes(request.as_bytes())
    }

    fn replay_bytes(commands: &str) -> Vec<u8> {
        let document = LOCAL_REQUEST
            .strip_prefix(r#"{"apiVersion":1,"document":"#)
            .and_then(|value| value.strip_suffix('}'))
            .expect("fixture document");
        format!(r#"{{"apiVersion":1,"initialDocument":{document},"commands":{commands}}}"#)
            .into_bytes()
    }

    fn assert_zero_global_work(metrics: &KernelStage3MetricsV1) {
        assert_eq!(metrics.full_document_scans, 0);
        assert_eq!(metrics.full_document_clones, 0);
        assert_eq!(metrics.full_semantic_validations, 0);
        assert_eq!(metrics.full_snapshot_materializations, 0);
    }

    #[test]
    fn create_and_read_return_exact_revision_zero_state() {
        let request = decode_create_request(SMOKE_REQUEST.as_bytes()).expect("request");
        let accepted = KernelSession::create(request).expect("session");
        assert_eq!(
            encode_create_result(&accepted.result).expect("create bytes"),
            br#"{"apiVersion":1,"status":"created","value":{"documentId":"score-rkp1","documentVersion":0}}"#
        );
        let read = accepted.session.read_state();
        let KernelSessionReadResultV1::Ok(state) = &read else {
            panic!("read must succeed");
        };
        assert_eq!(state.history.undo_depth, 0);
        assert_eq!(state.history.redo_depth, 0);
        assert!(!state.dirty);
        assert_eq!(state.snapshot.document_version.get(), 0);
        let bytes = encode_read_result(&read).expect("read bytes");
        let text = String::from_utf8(bytes).expect("UTF-8");
        assert!(
            text.starts_with(r#"{"apiVersion":1,"status":"ok","value":{"snapshot":{"documentId":"score-rkp1","schemaVersion":"brilliant-score-1","documentVersion":0,"document":{"#),
            "unexpected read prefix: {text}"
        );
    }

    #[test]
    fn overfull_commit_warning_reopen_and_history_are_version_coherent() {
        let request = decode_create_request(SMOKE_REQUEST.as_bytes()).expect("request");
        let mut session = KernelSession::create(request).expect("session").session;
        let document_id = StableId::new("score-rkp1").unwrap();
        let initial = session
            .read_rule_warning_page(&document_id, DocumentVersionV1::initial(), 0, 16)
            .expect("initial warning report");
        assert_eq!(initial.total, 0);

        let insert = r#"{"apiVersion":1,"command":{"commandVersion":1,"commandId":"core.voice.insert-rest-event","target":{"kind":"voice","voiceId":"voice-1"},"payload":{"anchor":{"kind":"after-event","eventId":"event-1"},"event":{"id":"event-2","duration":{"base":4,"dots":0},"content":{"kind":"rest"}}}}}"#;
        let KernelStage3SubmitResultV1::Committed(committed) =
            session.submit_stage3_bytes(insert.as_bytes())
        else {
            panic!("overfull insertion must commit")
        };
        assert_eq!(committed.document_version.get(), 1);
        let report = session
            .read_rule_warning_page(&document_id, committed.document_version, 0, 16)
            .expect("overfull warning report");
        assert_eq!(report.total, 1);
        assert_eq!(report.warnings[0].measure_id.as_js_string(), "measure-1");
        assert_eq!(report.warnings[0].voice_id.as_js_string(), "voice-1");
        assert_eq!(report.warnings[0].overflow.numerator.get(), 1);
        assert_eq!(report.warnings[0].overflow.denominator.get(), 4);

        let KernelSessionReadResultV1::Ok(state) = session.read_state() else {
            panic!("committed document read")
        };
        let events = &state.snapshot.document.parts[0].measure_contents[0].voices[0]
            .sequence
            .events;
        assert_eq!(events.len(), 2);
        assert_eq!(events[1].id.as_js_string(), "event-2");
        let reopened = KernelSession::create(KernelSessionCreateRequestV1 {
            api_version: 1,
            document: state.snapshot.document.clone(),
        })
        .expect("reopen overfull document")
        .session;
        let reopened_report = reopened
            .read_rule_warning_page(&document_id, DocumentVersionV1::initial(), 0, 16)
            .expect("reopened warning report");
        assert_eq!(reopened_report.warnings, report.warnings);

        let undo = operate(
            &mut session,
            r#"{"apiVersion":1,"operation":{"kind":"undo"}}"#,
        );
        let KernelStage4OperationResultV1::Command(KernelStage4CommandResultV1::Committed {
            value: undo_value,
            ..
        }) = undo
        else {
            panic!("undo overfull insertion")
        };
        assert_eq!(undo_value.document_version.get(), 2);
        assert_eq!(
            session
                .read_rule_warning_page(&document_id, undo_value.document_version, 0, 16)
                .unwrap()
                .total,
            0
        );
        assert_eq!(
            session.read_rule_warning_page(&document_id, committed.document_version, 0, 16),
            Err(KernelRuleWarningReadFailureV1::StaleVersion)
        );

        let redo = operate(
            &mut session,
            r#"{"apiVersion":1,"operation":{"kind":"redo"}}"#,
        );
        let KernelStage4OperationResultV1::Command(KernelStage4CommandResultV1::Committed {
            value: redo_value,
            ..
        }) = redo
        else {
            panic!("redo overfull insertion")
        };
        assert_eq!(redo_value.document_version.get(), 3);
        assert_eq!(
            session
                .read_rule_warning_page(&document_id, redo_value.document_version, 0, 16)
                .unwrap()
                .warnings,
            report.warnings
        );
    }

    #[test]
    fn decoded_input_is_detached_and_reads_are_repeatable() {
        let mut bytes = SMOKE_REQUEST.as_bytes().to_vec();
        let request = decode_create_request(&bytes).expect("request");
        let accepted = KernelSession::create(request).expect("session");
        bytes.fill(0);
        let first = encode_read_result(&accepted.session.read_state()).expect("first read");
        let second = encode_read_result(&accepted.session.read_state()).expect("second read");
        assert_eq!(first, second);
        assert!(
            String::from_utf8(first)
                .expect("UTF-8")
                .contains("score-rkp1")
        );
    }

    #[test]
    fn rejected_create_yields_no_session() {
        let mut request = decode_create_request(SMOKE_REQUEST.as_bytes()).expect("request");
        request.api_version = 2;
        assert_eq!(
            KernelSession::create(request).expect_err("rejected create"),
            StableFailureV1::ContractUnsupportedApiVersion {
                supported_version: 1
            }
        );

        let invalid_schema = KernelSessionCreateRequestV1 {
            api_version: 1,
            document: {
                let mut document = decode_create_request(SMOKE_REQUEST.as_bytes())
                    .expect("request")
                    .document;
                document.schema_version = "brilliant-score-2".into();
                document
            },
        };
        assert!(matches!(
            KernelSession::create(invalid_schema),
            Err(StableFailureV1::ScoreUnsupportedSchema { .. })
        ));
    }

    #[test]
    fn private_runtime_factory_failures_publish_no_session_and_use_existing_failures() {
        let capacity = KernelSession::create_with_runtime_factory(
            decode_create_request(SMOKE_REQUEST.as_bytes()).expect("request"),
            |_| Err(KernelRuntimeCreateFailure::InternalCapacity),
        );
        assert_eq!(
            capacity.expect_err("capacity rejection"),
            StableFailureV1::BridgeInternal
        );

        for violation in [
            ScoreStructureViolationV1::DuplicateId,
            ScoreStructureViolationV1::InvalidReference,
            ScoreStructureViolationV1::InvalidValue,
        ] {
            let rejected = KernelSession::create_with_runtime_factory(
                decode_create_request(SMOKE_REQUEST.as_bytes()).expect("request"),
                |_| Err(KernelRuntimeCreateFailure::InvalidDocument(violation)),
            );
            assert!(matches!(
                rejected,
                Err(StableFailureV1::ScoreInvalidStructure {
                    path,
                    violation: actual,
                }) if path == Default::default() && actual == violation
            ));
        }
    }

    #[test]
    fn local_scalar_commands_commit_noop_and_publish_the_current_version() {
        let mut session = local_session();
        let metadata = r#"{"apiVersion":1,"command":{"commandVersion":1,"commandId":"core.document.set-metadata","target":{"kind":"document","documentId":"score-local"},"payload":{"metadata":{"title":"Changed","authors":["Brilliant","Codex"],"tempo":{"bpm":96}}}}}"#;
        let committed = submit(&mut session, metadata);
        let KernelStage3SubmitResultV1::Committed(value) = committed else {
            panic!("metadata must commit");
        };
        assert_eq!(value.document_version.get(), 1);
        assert!(matches!(
            value.affected.as_slice(),
            [ScoreEntityTargetV1::Document { document_id }]
                if document_id.as_js_string() == "score-local"
        ));
        assert_zero_global_work(&value.metrics);

        let no_op = submit(&mut session, metadata);
        let KernelStage3SubmitResultV1::NoOp(value) = no_op else {
            panic!("equal metadata must be a no-op");
        };
        assert_eq!(value.document_version.get(), 1);
        assert_zero_global_work(&value.metrics);

        let pitch_no_op = r#"{"apiVersion":1,"command":{"commandVersion":1,"commandId":"core.note.set-written-pitch","target":{"kind":"note","noteId":"note-1"},"payload":{"writtenPitch":{"step":"C","alter":0,"octave":4}}}}"#;
        let KernelStage3SubmitResultV1::NoOp(value) = submit(&mut session, pitch_no_op) else {
            panic!("equal pitch must be a no-op");
        };
        assert_eq!(value.document_version.get(), 1);

        let pitch = r#"{"apiVersion":1,"command":{"commandVersion":1,"commandId":"core.note.set-written-pitch","target":{"kind":"note","noteId":"note-1"},"payload":{"writtenPitch":{"step":"D","alter":0,"octave":4}}}}"#;
        let KernelStage3SubmitResultV1::Committed(value) = submit(&mut session, pitch) else {
            panic!("pitch must commit");
        };
        assert_eq!(value.document_version.get(), 2);
        assert_zero_global_work(&value.metrics);

        let duration_no_op = r#"{"apiVersion":1,"command":{"commandVersion":1,"commandId":"core.event.set-note-value","target":{"kind":"event","eventId":"event-1"},"payload":{"noteValue":{"base":4,"dots":0}}}}"#;
        let KernelStage3SubmitResultV1::NoOp(value) = submit(&mut session, duration_no_op) else {
            panic!("equal note value must be a no-op");
        };
        assert_eq!(value.document_version.get(), 2);

        let duration = r#"{"apiVersion":1,"command":{"commandVersion":1,"commandId":"core.event.set-note-value","target":{"kind":"event","eventId":"event-1"},"payload":{"noteValue":{"base":8,"dots":0}}}}"#;
        let KernelStage3SubmitResultV1::Committed(value) = submit(&mut session, duration) else {
            panic!("note value must commit");
        };
        assert_eq!(value.document_version.get(), 3);
        assert_zero_global_work(&value.metrics);

        let read = session.read_state();
        let KernelSessionReadResultV1::Ok(state) = &read else {
            panic!("read must succeed");
        };
        assert_eq!(state.snapshot.document_version.get(), 3);
        assert_eq!(state.snapshot.document.metadata.title, "Changed");
        let encoded =
            String::from_utf8(encode_read_result(&read).expect("read bytes")).expect("UTF-8 read");
        assert!(encoded.contains(r#""writtenPitch":{"step":"D","alter":0,"octave":4}"#));
        assert!(encoded.contains(r#""duration":{"base":8,"dots":0}"#));
    }

    #[test]
    fn stage3_submit_projects_real_history_and_dirty_state() {
        let mut session = local_session();
        let metadata = r#"{"apiVersion":1,"command":{"commandVersion":1,"commandId":"core.document.set-metadata","target":{"kind":"document","documentId":"score-local"},"payload":{"metadata":{"title":"History","authors":["Brilliant"],"tempo":{"bpm":120}}}}}"#;

        let KernelStage3SubmitResultV1::Committed(value) = submit(&mut session, metadata) else {
            panic!("metadata must commit");
        };
        assert_eq!(value.document_version.get(), 1);

        let KernelSessionReadResultV1::Ok(state) = session.read_state() else {
            panic!("read must succeed");
        };
        assert_eq!(state.history.undo_depth, 1);
        assert_eq!(state.history.redo_depth, 0);
        assert!(state.dirty);
    }

    #[test]
    fn history_undo_redo_branch_and_delayed_persisted_identity_are_exact() {
        let mut session = local_session();
        let submit_a = r#"{"apiVersion":1,"operation":{"kind":"submit","command":{"commandVersion":1,"commandId":"core.document.set-metadata","target":{"kind":"document","documentId":"score-local"},"payload":{"metadata":{"title":"A","authors":["Brilliant"],"tempo":{"bpm":120}}}}}}"#;
        let submit_b = r#"{"apiVersion":1,"operation":{"kind":"submit","command":{"commandVersion":1,"commandId":"core.document.set-metadata","target":{"kind":"document","documentId":"score-local"},"payload":{"metadata":{"title":"B","authors":["Brilliant"],"tempo":{"bpm":120}}}}}}"#;
        let submit_c = r#"{"apiVersion":1,"operation":{"kind":"submit","command":{"commandVersion":1,"commandId":"core.document.set-metadata","target":{"kind":"document","documentId":"score-local"},"payload":{"metadata":{"title":"B","authors":["Brilliant"],"tempo":{"bpm":120}}}}}}"#;

        let KernelStage4OperationResultV1::Command(KernelStage4CommandResultV1::Committed {
            value,
            events,
        }) = operate(&mut session, submit_a)
        else {
            panic!("submit A must commit");
        };
        assert_eq!(value.document_version.get(), 1);
        assert_eq!((value.history.undo_depth, value.history.redo_depth), (1, 0));
        assert!(value.dirty);
        assert_eq!(events.len(), 2);

        let KernelStage4OperationResultV1::Command(KernelStage4CommandResultV1::Committed {
            value,
            events,
        }) = operate(&mut session, submit_b)
        else {
            panic!("submit B must commit");
        };
        assert_eq!(value.document_version.get(), 2);
        assert_eq!((value.history.undo_depth, value.history.redo_depth), (2, 0));
        assert!(value.dirty);
        assert_eq!(events.len(), 1);

        let mark_a = r#"{"apiVersion":1,"operation":{"kind":"mark-persisted","checkpoint":{"documentId":"score-local","documentVersion":1}}}"#;
        let KernelStage4OperationResultV1::MarkPersisted(
            KernelStage4MarkPersistedResultV1::Updated { value, events },
        ) = operate(&mut session, mark_a)
        else {
            panic!("delayed mark must update clean identity");
        };
        assert!(value.dirty);
        assert!(events.is_empty());

        let undo = r#"{"apiVersion":1,"operation":{"kind":"undo"}}"#;
        let KernelStage4OperationResultV1::Command(KernelStage4CommandResultV1::Committed {
            value,
            events,
        }) = operate(&mut session, undo)
        else {
            panic!("undo B must commit");
        };
        assert_eq!(value.document_version.get(), 3);
        assert_eq!((value.history.undo_depth, value.history.redo_depth), (1, 1));
        assert!(!value.dirty);
        assert_eq!(events.len(), 2);

        let redo = r#"{"apiVersion":1,"operation":{"kind":"redo"}}"#;
        let KernelStage4OperationResultV1::Command(KernelStage4CommandResultV1::Committed {
            value,
            events,
        }) = operate(&mut session, redo)
        else {
            panic!("redo B must commit");
        };
        assert_eq!(value.document_version.get(), 4);
        assert!(value.dirty);
        assert_eq!(events.len(), 2);

        let _ = operate(&mut session, undo);
        let KernelStage4OperationResultV1::Command(KernelStage4CommandResultV1::Committed {
            value,
            events,
        }) = operate(&mut session, submit_c)
        else {
            panic!("deep-equal branch must still commit with a fresh identity");
        };
        assert_eq!(value.document_version.get(), 6);
        assert_eq!((value.history.undo_depth, value.history.redo_depth), (2, 0));
        assert!(value.dirty);
        assert_eq!(events.len(), 2);

        let KernelStage4OperationResultV1::Command(KernelStage4CommandResultV1::Rejected {
            value,
            failure: KernelStage4FailureV1::HistoryEmptyRedo,
        }) = operate(&mut session, redo)
        else {
            panic!("truncated redo must reject");
        };
        assert_eq!(value.document_version.get(), 6);
        assert_eq!((value.history.undo_depth, value.history.redo_depth), (2, 0));
    }

    #[test]
    fn no_op_and_rejection_preserve_the_redo_tail() {
        let mut session = local_session();
        let submit_a = r#"{"apiVersion":1,"operation":{"kind":"submit","command":{"commandVersion":1,"commandId":"core.document.set-metadata","target":{"kind":"document","documentId":"score-local"},"payload":{"metadata":{"title":"A","authors":["Brilliant"],"tempo":{"bpm":120}}}}}}"#;
        let submit_b = r#"{"apiVersion":1,"operation":{"kind":"submit","command":{"commandVersion":1,"commandId":"core.document.set-metadata","target":{"kind":"document","documentId":"score-local"},"payload":{"metadata":{"title":"B","authors":["Brilliant"],"tempo":{"bpm":120}}}}}}"#;
        let rejected = r#"{"apiVersion":1,"operation":{"kind":"submit","command":{"commandVersion":1,"commandId":"core.event.remove","target":{"kind":"event","eventId":"missing"},"payload":{}}}}"#;
        let undo = r#"{"apiVersion":1,"operation":{"kind":"undo"}}"#;
        let redo = r#"{"apiVersion":1,"operation":{"kind":"redo"}}"#;

        let _ = operate(&mut session, submit_a);
        let _ = operate(&mut session, submit_b);
        let _ = operate(&mut session, undo);

        let KernelStage4OperationResultV1::Command(KernelStage4CommandResultV1::NoOp { value }) =
            operate(&mut session, submit_a)
        else {
            panic!("equal submit after undo must be a no-op");
        };
        assert_eq!((value.history.undo_depth, value.history.redo_depth), (1, 1));

        let KernelStage4OperationResultV1::Command(KernelStage4CommandResultV1::Rejected {
            value,
            ..
        }) = operate(&mut session, rejected)
        else {
            panic!("missing target must reject");
        };
        assert_eq!((value.history.undo_depth, value.history.redo_depth), (1, 1));

        let KernelStage4OperationResultV1::Command(KernelStage4CommandResultV1::Committed {
            value,
            ..
        }) = operate(&mut session, redo)
        else {
            panic!("redo tail must remain available");
        };
        assert_eq!((value.history.undo_depth, value.history.redo_depth), (2, 0));
    }

    #[test]
    fn dirty_checkpoint_failures_and_event_sequence_are_zero_delta_and_ordered() {
        let mut session = local_session();
        let initial = encode_read_result(&session.read_state()).expect("initial read");

        let malformed = r#"{"apiVersion":1,"operation":{"kind":"mark-persisted","checkpoint":{"documentId":"score-local"}}}"#;
        let KernelStage4OperationResultV1::MarkPersisted(
            KernelStage4MarkPersistedResultV1::Rejected {
                failure: KernelStage4FailureV1::CheckpointInvalid,
                ..
            },
        ) = operate(&mut session, malformed)
        else {
            panic!("malformed checkpoint must use checkpoint.invalid");
        };

        let wrong_document = r#"{"apiVersion":1,"operation":{"kind":"mark-persisted","checkpoint":{"documentId":"other","documentVersion":99}}}"#;
        let KernelStage4OperationResultV1::MarkPersisted(
            KernelStage4MarkPersistedResultV1::Rejected {
                failure: KernelStage4FailureV1::CheckpointDocumentMismatch,
                ..
            },
        ) = operate(&mut session, wrong_document)
        else {
            panic!("document mismatch must precede unavailable version");
        };

        let unavailable = r#"{"apiVersion":1,"operation":{"kind":"mark-persisted","checkpoint":{"documentId":"score-local","documentVersion":99}}}"#;
        let KernelStage4OperationResultV1::MarkPersisted(
            KernelStage4MarkPersistedResultV1::Rejected {
                failure: KernelStage4FailureV1::CheckpointVersionUnavailable,
                ..
            },
        ) = operate(&mut session, unavailable)
        else {
            panic!("unknown observed version must reject");
        };
        assert_eq!(
            encode_read_result(&session.read_state()).expect("unchanged read"),
            initial
        );

        let submit = r#"{"apiVersion":1,"operation":{"kind":"submit","command":{"commandVersion":1,"commandId":"core.document.set-metadata","target":{"kind":"document","documentId":"score-local"},"payload":{"metadata":{"title":"Saved","authors":["Brilliant"],"tempo":{"bpm":120}}}}}}"#;
        let KernelStage4OperationResultV1::Command(KernelStage4CommandResultV1::Committed {
            events,
            ..
        }) = operate(&mut session, submit)
        else {
            panic!("submit must commit");
        };
        assert!(matches!(
            events.as_slice(),
            [
                KernelEventV1::DocumentCommitted {
                    event_sequence: 1,
                    cause: KernelEventCauseV1::Submit,
                    command_id: brilliant_kernel_contracts::KernelCommandIdentityV1::Core(
                        brilliant_kernel_contracts::CoreCommandIdV1::DocumentSetMetadata
                    ),
                    ..
                },
                KernelEventV1::DirtyStateChanged {
                    event_sequence: 2,
                    cause: KernelEventCauseV1::Submit,
                    dirty: true,
                    ..
                }
            ]
        ));

        let mark_current = r#"{"apiVersion":1,"operation":{"kind":"mark-persisted","checkpoint":{"documentId":"score-local","documentVersion":1}}}"#;
        let KernelStage4OperationResultV1::MarkPersisted(
            KernelStage4MarkPersistedResultV1::Updated { value, events },
        ) = operate(&mut session, mark_current)
        else {
            panic!("current checkpoint must update");
        };
        assert!(!value.dirty);
        assert!(matches!(
            events.as_slice(),
            [KernelEventV1::DirtyStateChanged {
                event_sequence: 3,
                cause: KernelEventCauseV1::MarkPersisted,
                dirty: false,
                ..
            }]
        ));

        let KernelStage4OperationResultV1::MarkPersisted(KernelStage4MarkPersistedResultV1::NoOp {
            ..
        }) = operate(&mut session, mark_current)
        else {
            panic!("same clean identity must be a no-op");
        };

        let undo = r#"{"apiVersion":1,"operation":{"kind":"undo"}}"#;
        let KernelStage4OperationResultV1::Command(KernelStage4CommandResultV1::Committed {
            value,
            events,
        }) = operate(&mut session, undo)
        else {
            panic!("undo must commit");
        };
        assert!(value.dirty);
        assert!(matches!(
            events.as_slice(),
            [
                KernelEventV1::DocumentCommitted {
                    event_sequence: 4,
                    cause: KernelEventCauseV1::Undo,
                    ..
                },
                KernelEventV1::DirtyStateChanged {
                    event_sequence: 5,
                    cause: KernelEventCauseV1::Undo,
                    dirty: true,
                    ..
                }
            ]
        ));

        let mark_initial = r#"{"apiVersion":1,"operation":{"kind":"mark-persisted","checkpoint":{"documentId":"score-local","documentVersion":0}}}"#;
        let KernelStage4OperationResultV1::MarkPersisted(
            KernelStage4MarkPersistedResultV1::Updated { value, events },
        ) = operate(&mut session, mark_initial)
        else {
            panic!("initial observed identity must remain available");
        };
        assert!(!value.dirty);
        assert!(matches!(
            events.as_slice(),
            [KernelEventV1::DirtyStateChanged {
                event_sequence: 6,
                cause: KernelEventCauseV1::MarkPersisted,
                dirty: false,
                ..
            }]
        ));
    }

    #[test]
    fn stage4_read_cache_reuses_revision_and_preserves_old_snapshot() {
        let mut session = local_session();
        let read_cold =
            r#"{"apiVersion":1,"operation":{"kind":"read","knownSnapshotVersion":null}}"#;
        let read_zero = r#"{"apiVersion":1,"operation":{"kind":"read","knownSnapshotVersion":0}}"#;
        let KernelStage4OperationResultV1::Read(KernelStage4ReadResultV1::Ok(first)) =
            operate(&mut session, read_cold)
        else {
            panic!("cold read must succeed");
        };
        assert_eq!(first.stage4_metrics.full_snapshot_materializations, 1);
        let old_snapshot = first.snapshot.document.expect("cold read document");
        assert_eq!(old_snapshot.as_document().metadata.title, "Local");

        let KernelStage4OperationResultV1::Read(KernelStage4ReadResultV1::Ok(hit)) =
            operate(&mut session, read_zero)
        else {
            panic!("known revision read must succeed");
        };
        assert_eq!(hit.stage4_metrics.full_snapshot_materializations, 0);
        assert!(hit.snapshot.document.is_none());

        let submit = r#"{"apiVersion":1,"operation":{"kind":"submit","command":{"commandVersion":1,"commandId":"core.document.set-metadata","target":{"kind":"document","documentId":"score-local"},"payload":{"metadata":{"title":"Changed","authors":["Brilliant"],"tempo":{"bpm":120}}}}}}"#;
        let _ = operate(&mut session, submit);
        assert_eq!(old_snapshot.as_document().metadata.title, "Local");

        let KernelStage4OperationResultV1::Read(KernelStage4ReadResultV1::Ok(changed)) =
            operate(&mut session, read_zero)
        else {
            panic!("stale known revision read must succeed");
        };
        assert_eq!(changed.snapshot.document_version.get(), 1);
        assert_eq!(changed.stage4_metrics.full_snapshot_materializations, 1);
        assert_eq!(
            changed
                .snapshot
                .document
                .as_ref()
                .expect("changed document")
                .as_document()
                .metadata
                .title,
            "Changed"
        );

        let read_one = r#"{"apiVersion":1,"operation":{"kind":"read","knownSnapshotVersion":1}}"#;
        let mark = r#"{"apiVersion":1,"operation":{"kind":"mark-persisted","checkpoint":{"documentId":"score-local","documentVersion":1}}}"#;
        let _ = operate(&mut session, mark);
        let KernelStage4OperationResultV1::Read(KernelStage4ReadResultV1::Ok(after_mark)) =
            operate(&mut session, read_one)
        else {
            panic!("read after mark must succeed");
        };
        assert!(after_mark.snapshot.document.is_none());
        assert_eq!(after_mark.stage4_metrics.full_snapshot_materializations, 0);
        assert!(!after_mark.dirty);
    }

    #[test]
    fn all_six_stage4_selector_families_are_version_coherent_and_index_backed() {
        let mut session = local_session();
        let metadata = r#"{"apiVersion":1,"operation":{"kind":"select","selector":{"selectorId":"core.selector.score-metadata"}}}"#;
        let KernelStage4OperationResultV1::Select(result) = operate(&mut session, metadata) else {
            panic!("metadata selector result");
        };
        assert_eq!(result.value.document_version.get(), 0);
        assert_eq!(
            result.value.stage4_metrics.full_snapshot_materializations,
            0
        );
        assert!(matches!(
            result.value.selection,
            KernelSelectorResultV1::Ok(KernelSelectorValueV1::Metadata(metadata))
                if metadata.title == "Local"
        ));

        let entity = r#"{"apiVersion":1,"operation":{"kind":"select","selector":{"selectorId":"core.selector.score-entity","address":{"kind":"note","noteId":"note-1"}}}}"#;
        let KernelStage4OperationResultV1::Select(result) = operate(&mut session, entity) else {
            panic!("entity selector result");
        };
        assert_eq!(
            result.value.stage4_metrics.full_snapshot_materializations,
            0
        );
        assert!(matches!(
            result.value.selection,
            KernelSelectorResultV1::Ok(KernelSelectorValueV1::Entity(
                SelectedScoreEntityV1::Note(note)
            )) if note.id.as_js_string() == "note-1"
        ));

        let ownership = r#"{"apiVersion":1,"operation":{"kind":"select","selector":{"selectorId":"core.selector.score-entity-ownership","address":{"kind":"note","noteId":"note-1"}}}}"#;
        let KernelStage4OperationResultV1::Select(result) = operate(&mut session, ownership) else {
            panic!("ownership selector result");
        };
        assert_eq!(
            result.value.stage4_metrics.full_snapshot_materializations,
            0
        );
        assert!(matches!(
            result.value.selection,
            KernelSelectorResultV1::Ok(KernelSelectorValueV1::Ownership(
                brilliant_kernel_contracts::ScoreEntityOwnershipV1::Note {
                    document_id,
                    part_id,
                    measure_id,
                    voice_id,
                    event_id,
                }
            )) if document_id.as_js_string() == "score-local"
                && part_id.as_js_string() == "part-1"
                && measure_id.as_js_string() == "measure-1"
                && voice_id.as_js_string() == "voice-1"
                && event_id.as_js_string() == "event-1"
        ));

        let range = r#"{"apiVersion":1,"operation":{"kind":"select","selector":{"selectorId":"core.selector.score-range","range":{"kind":"voice-event-range","start":{"kind":"voice-event","voiceId":"voice-1","eventId":"event-1"},"end":{"kind":"voice-event","voiceId":"voice-1","eventId":"event-1"}}}}}"#;
        let KernelStage4OperationResultV1::Select(result) = operate(&mut session, range) else {
            panic!("range selector result");
        };
        assert_eq!(
            result.value.stage4_metrics.full_snapshot_materializations,
            0
        );
        assert!(matches!(
            result.value.selection,
            KernelSelectorResultV1::Ok(KernelSelectorValueV1::Range(
                ScoreRangeSelectionV1::VoiceEventRange { events, .. }
            )) if events.len() == 1 && events[0].id.as_js_string() == "event-1"
        ));

        let history = r#"{"apiVersion":1,"operation":{"kind":"select","selector":{"selectorId":"core.selector.history-state"}}}"#;
        let KernelStage4OperationResultV1::Select(result) = operate(&mut session, history) else {
            panic!("history selector result");
        };
        assert!(matches!(
            result.value.selection,
            KernelSelectorResultV1::Ok(KernelSelectorValueV1::History(history))
                if history.undo_depth == 0 && history.redo_depth == 0
        ));

        let dirty = r#"{"apiVersion":1,"operation":{"kind":"select","selector":{"selectorId":"core.selector.dirty-state"}}}"#;
        let KernelStage4OperationResultV1::Select(result) = operate(&mut session, dirty) else {
            panic!("dirty selector result");
        };
        assert!(matches!(
            result.value.selection,
            KernelSelectorResultV1::Ok(KernelSelectorValueV1::Dirty(false))
        ));

        let missing = r#"{"apiVersion":1,"operation":{"kind":"select","selector":{"selectorId":"core.selector.score-entity","address":{"kind":"note","noteId":"missing"}}}}"#;
        let KernelStage4OperationResultV1::Select(result) = operate(&mut session, missing) else {
            panic!("missing selector result");
        };
        assert!(matches!(
            result.value.selection,
            KernelSelectorResultV1::Rejected(KernelStage4FailureV1::ReadEntityNotFound)
        ));
    }

    #[test]
    fn entity_selector_covers_all_seven_stable_address_kinds() {
        let mut session = local_session();
        let cases = [
            ("document", "documentId", "score-local"),
            ("measure", "measureId", "measure-1"),
            ("part", "partId", "part-1"),
            ("staff", "staffId", "staff-1"),
            ("voice", "voiceId", "voice-1"),
            ("event", "eventId", "event-1"),
            ("note", "noteId", "note-1"),
        ];
        for (kind, id_key, id) in cases {
            let request = format!(
                r#"{{"apiVersion":1,"operation":{{"kind":"select","selector":{{"selectorId":"core.selector.score-entity","address":{{"kind":"{kind}","{id_key}":"{id}"}}}}}}}}"#
            );
            let KernelStage4OperationResultV1::Select(result) = operate(&mut session, &request)
            else {
                panic!("entity selector result for {kind}");
            };
            let KernelSelectorResultV1::Ok(KernelSelectorValueV1::Entity(entity)) =
                result.value.selection
            else {
                panic!("entity selector must resolve {kind}");
            };
            let (actual_kind, actual_id) = match &entity {
                SelectedScoreEntityV1::Document(value) => ("document", value.id.as_js_string()),
                SelectedScoreEntityV1::Measure(value) => ("measure", value.id.as_js_string()),
                SelectedScoreEntityV1::Part(value) => ("part", value.id.as_js_string()),
                SelectedScoreEntityV1::Staff(value) => ("staff", value.id.as_js_string()),
                SelectedScoreEntityV1::Voice(value) => ("voice", value.id.as_js_string()),
                SelectedScoreEntityV1::Event(value) => ("event", value.id.as_js_string()),
                SelectedScoreEntityV1::Note(value) => ("note", value.id.as_js_string()),
            };
            assert_eq!(actual_kind, kind);
            assert!(
                actual_id.eq_ascii(id),
                "entity selector must preserve the requested ID"
            );
            if kind != "document" {
                assert_eq!(
                    result.value.stage4_metrics.full_snapshot_materializations,
                    0
                );
            }
        }
    }

    #[test]
    fn local_event_commands_preserve_order_affected_and_failure_zero_delta() {
        let mut session = local_session();
        let before = encode_read_result(&session.read_state()).expect("baseline read");

        let wrong_owner = r#"{"apiVersion":1,"command":{"commandVersion":1,"commandId":"core.voice.insert-rest-event","target":{"kind":"voice","voiceId":"voice-1"},"payload":{"anchor":{"kind":"after-event","eventId":"event-2"},"event":{"id":"event-x","duration":{"base":4,"dots":0},"content":{"kind":"rest"}}}}}"#;
        let KernelStage3SubmitResultV1::CommandRejected {
            value,
            failure: KernelStage3CommandFailureV1::Leaf(failure),
        } = submit(&mut session, wrong_owner)
        else {
            panic!("wrong-owner anchor must reject");
        };
        assert_eq!(failure, KernelStage3CommandFailureLeafV1::AnchorWrongOwner);
        assert_eq!(value.document_version.get(), 0);
        assert_zero_global_work(&value.metrics);
        assert_eq!(
            encode_read_result(&session.read_state()).expect("unchanged read"),
            before
        );

        let missing_target = r#"{"apiVersion":1,"command":{"commandVersion":1,"commandId":"core.event.remove","target":{"kind":"event","eventId":"event-missing"},"payload":{}}}"#;
        let KernelStage3SubmitResultV1::CommandRejected {
            failure: KernelStage3CommandFailureV1::Leaf(failure),
            ..
        } = submit(&mut session, missing_target)
        else {
            panic!("missing target must reject");
        };
        assert_eq!(failure, KernelStage3CommandFailureLeafV1::TargetNotFound);

        let missing_anchor = r#"{"apiVersion":1,"command":{"commandVersion":1,"commandId":"core.voice.insert-rest-event","target":{"kind":"voice","voiceId":"voice-1"},"payload":{"anchor":{"kind":"after-event","eventId":"missing"},"event":{"id":"event-x","duration":{"base":4,"dots":0},"content":{"kind":"rest"}}}}}"#;
        let KernelStage3SubmitResultV1::CommandRejected {
            failure: KernelStage3CommandFailureV1::Leaf(failure),
            ..
        } = submit(&mut session, missing_anchor)
        else {
            panic!("missing anchor must reject");
        };
        assert_eq!(failure, KernelStage3CommandFailureLeafV1::AnchorNotFound);

        let bad_anchor_and_content = r#"{"apiVersion":1,"command":{"commandVersion":1,"commandId":"core.voice.insert-notes-event","target":{"kind":"voice","voiceId":"voice-1"},"payload":{"anchor":{"kind":"after-event","eventId":"missing"},"event":{"id":"event-x","duration":{"base":4,"dots":0},"staffId":"staff-missing","content":{"kind":"notes","notes":[]}}}}}"#;
        let KernelStage3SubmitResultV1::CommandRejected {
            failure: KernelStage3CommandFailureV1::Leaf(failure),
            ..
        } = submit(&mut session, bad_anchor_and_content)
        else {
            panic!("anchor failure must win over later content checks");
        };
        assert_eq!(failure, KernelStage3CommandFailureLeafV1::AnchorNotFound);

        let missing_reference = r#"{"apiVersion":1,"command":{"commandVersion":1,"commandId":"core.voice.insert-rest-event","target":{"kind":"voice","voiceId":"voice-1"},"payload":{"anchor":{"kind":"after-event","eventId":"event-1"},"event":{"id":"event-x","duration":{"base":4,"dots":0},"staffId":"staff-missing","content":{"kind":"rest"}}}}}"#;
        let KernelStage3SubmitResultV1::CommandRejected {
            failure: KernelStage3CommandFailureV1::Leaf(failure),
            ..
        } = submit(&mut session, missing_reference)
        else {
            panic!("missing staff reference must reject");
        };
        assert_eq!(
            failure,
            crate::commands::semantic_test_failure("semantic.staff-reference-missing")
        );
        assert_eq!(
            encode_read_result(&session.read_state()).expect("unchanged failure read"),
            before
        );

        let insert_notes = r#"{"apiVersion":1,"command":{"commandVersion":1,"commandId":"core.voice.insert-notes-event","target":{"kind":"voice","voiceId":"voice-1"},"payload":{"anchor":{"kind":"after-event","eventId":"event-1"},"event":{"id":"event-3","duration":{"base":4,"dots":0},"staffId":"staff-1","content":{"kind":"notes","notes":[{"id":"note-3","writtenPitch":{"step":"E","alter":0,"octave":4}}]}}}}}"#;
        let KernelStage3SubmitResultV1::Committed(value) = submit(&mut session, insert_notes)
        else {
            panic!("notes event must commit");
        };
        assert_eq!(value.document_version.get(), 1);
        assert!(matches!(
            value.affected.as_slice(),
            [
                ScoreEntityTargetV1::Voice { voice_id },
                ScoreEntityTargetV1::Event { event_id },
                ScoreEntityTargetV1::Note { note_id },
            ] if voice_id.as_js_string() == "voice-1"
                && event_id.as_js_string() == "event-3"
                && note_id.as_js_string() == "note-3"
        ));
        assert_zero_global_work(&value.metrics);
        assert_eq!(value.metrics.entities_visited, 2);

        let after_insert = encode_read_result(&session.read_state()).expect("inserted read");
        let duplicate = r#"{"apiVersion":1,"command":{"commandVersion":1,"commandId":"core.voice.insert-rest-event","target":{"kind":"voice","voiceId":"voice-1"},"payload":{"anchor":{"kind":"start"},"event":{"id":"event-1","duration":{"base":4,"dots":0},"content":{"kind":"rest"}}}}}"#;
        let KernelStage3SubmitResultV1::CommandRejected {
            value,
            failure: KernelStage3CommandFailureV1::Leaf(failure),
        } = submit(&mut session, duplicate)
        else {
            panic!("duplicate event must reject");
        };
        let encoded = brilliant_kernel_contracts::encode_stage3_submit_result(
            &KernelStage3SubmitResultV1::CommandRejected {
                value,
                failure: failure.into(),
            },
        )
        .expect("semantic rejection wire");
        let encoded = String::from_utf8(encoded).unwrap();
        assert_eq!(
            encoded.split_once(",\"failure\":").unwrap().1,
            r#"{"code":"command.semantic-invalid","diagnostics":[{"code":"semantic.id-duplicate","messageKey":"core.semantic.id-duplicate","path":["parts",0,"measureContents",0,"voices",0,"sequence","events",1,"id"],"details":{"id":"event-1"}}]}}"#
        );
        assert_eq!(value.document_version.get(), 1);
        assert_eq!(
            encode_read_result(&session.read_state()).expect("unchanged duplicate read"),
            after_insert
        );

        let remove = r#"{"apiVersion":1,"command":{"commandVersion":1,"commandId":"core.event.remove","target":{"kind":"event","eventId":"event-3"},"payload":{}}}"#;
        let KernelStage3SubmitResultV1::Committed(value) = submit(&mut session, remove) else {
            panic!("event remove must commit");
        };
        assert_eq!(value.document_version.get(), 2);
        assert!(matches!(
            value.affected.as_slice(),
            [
                ScoreEntityTargetV1::Event { event_id },
                ScoreEntityTargetV1::Voice { voice_id },
                ScoreEntityTargetV1::Note { note_id },
            ] if event_id.as_js_string() == "event-3"
                && voice_id.as_js_string() == "voice-1"
                && note_id.as_js_string() == "note-3"
        ));

        let insert_rest = r#"{"apiVersion":1,"command":{"commandVersion":1,"commandId":"core.voice.insert-rest-event","target":{"kind":"voice","voiceId":"voice-1"},"payload":{"anchor":{"kind":"start"},"event":{"id":"event-4","duration":{"base":4,"dots":0},"content":{"kind":"rest"}}}}}"#;
        let KernelStage3SubmitResultV1::Committed(value) = submit(&mut session, insert_rest) else {
            panic!("rest event must commit");
        };
        assert_eq!(value.document_version.get(), 3);
        assert!(matches!(
            value.affected.as_slice(),
            [
                ScoreEntityTargetV1::Voice { voice_id },
                ScoreEntityTargetV1::Event { event_id },
            ] if voice_id.as_js_string() == "voice-1" && event_id.as_js_string() == "event-4"
        ));
        assert_zero_global_work(&value.metrics);

        let KernelSessionReadResultV1::Ok(state) = session.read_state() else {
            panic!("read must succeed");
        };
        let voices = &state.snapshot.document.parts[0].measure_contents[0].voices;
        assert_eq!(
            voices[0]
                .sequence
                .events
                .iter()
                .map(|event| event.id.as_js_string())
                .collect::<Vec<_>>(),
            ["event-4", "event-1"]
        );
        assert_eq!(voices[1].sequence.events[0].id.as_js_string(), "event-2");
    }

    #[test]
    fn replay_uses_the_submit_pipeline_and_stops_at_the_first_rejection() {
        let bytes = replay_bytes(
            r#"[{"commandVersion":1,"commandId":"core.document.set-metadata","target":{"kind":"document","documentId":"score-local"},"payload":{"metadata":{"title":"Replayed","authors":["Brilliant"],"tempo":{"bpm":120}}}},{"commandVersion":1,"commandId":"core.document.set-metadata","target":{"kind":"document","documentId":"score-local"},"payload":{"metadata":{"title":"Rejected","authors":["Brilliant"],"tempo":{"bpm":120}}},"history":{"undoDepth":99,"redoDepth":0}},{"commandVersion":1,"commandId":"core.document.set-metadata","target":{"kind":"document","documentId":"score-local"},"payload":{"metadata":{"title":"Never","authors":["Brilliant"],"tempo":{"bpm":120}}}}]"#,
        );

        let KernelStage4ReplayResultV1::Rejected {
            final_document,
            document_version,
            results,
            failed_command_index,
            failure,
        } = KernelSession::replay_stage4_bytes(&bytes)
        else {
            panic!("replay must reject at the invalid command");
        };
        assert_eq!(document_version.get(), 1);
        assert_eq!(final_document.metadata.title, "Replayed");
        assert_eq!(failed_command_index, 1);
        assert_eq!(results.len(), 2);
        assert_eq!(results[0].status, "committed");
        assert_eq!(results[0].history.undo_depth, 1);
        assert_eq!(results[1].status, "command-rejected");
        assert_eq!(results[1].document_version.get(), 1);
        assert!(matches!(
            failure,
            KernelStage4FailureV1::Command(KernelStage3CommandFailureV1::Leaf(
                KernelStage3CommandFailureLeafV1::InvalidEnvelope
            ))
        ));
    }

    #[test]
    fn replay_is_repeatable_across_fresh_sessions_and_exports_once_at_the_end() {
        let bytes = replay_bytes(
            r#"[{"commandVersion":1,"commandId":"core.document.set-metadata","target":{"kind":"document","documentId":"score-local"},"payload":{"metadata":{"title":"Stable replay","authors":["Brilliant"],"tempo":{"bpm":120}}}}]"#,
        );

        let first = KernelSession::replay_stage4_bytes(&bytes);
        let second = KernelSession::replay_stage4_bytes(&bytes);
        assert_eq!(first, second);
        let KernelStage4ReplayResultV1::Replayed {
            final_document,
            document_version,
            results,
        } = first
        else {
            panic!("replay must succeed");
        };
        assert_eq!(document_version.get(), 1);
        assert_eq!(final_document.metadata.title, "Stable replay");
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].status, "committed");
        assert_eq!(results[0].history.undo_depth, 1);
        assert_eq!(results[0].history.redo_depth, 0);
        assert!(results[0].failure.is_none());
    }

    #[test]
    fn replay_rejects_invalid_initial_documents_before_any_command_runs() {
        let request = String::from_utf8(replay_bytes("[]"))
            .expect("UTF-8 request")
            .replacen("brilliant-score-1", "brilliant-score-2", 1);
        let result = KernelSession::replay_stage4_bytes(request.as_bytes());
        assert!(matches!(
            result,
            KernelStage4ReplayResultV1::InvalidInitialDocument(
                StableFailureV1::ScoreUnsupportedSchema { .. }
            )
        ));
    }
}
