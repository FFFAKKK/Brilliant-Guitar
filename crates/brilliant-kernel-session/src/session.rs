use brilliant_kernel_contracts::{
    CapturedCoreCommandV1, CoreCommandEnvelopeV1, KernelSessionCreateRequestV1,
    KernelSessionCreateResultV1, KernelSessionCreateSuccessValueV1, KernelSessionReadResultV1,
    KernelStage3CommandFailureLeafV1, KernelStage3CommandFailureV1, KernelStage3MetricsV1,
    KernelStage3ResourceLimitKindV1, KernelStage3SubmitNoOpValueV1,
    KernelStage3SubmitRejectedValueV1, KernelStage3SubmitRequestV1, KernelStage3SubmitResultV1,
    KernelStage3SubmitSuccessValueV1, MAX_BATCH_CHILDREN_V1, ScoreEntityTargetV1, StableFailureV1,
    decode_captured_core_command,
};
use brilliant_kernel_runtime::{
    KernelRuntime, KernelRuntimeCreateFailure, KernelStage3RuntimeCommitV1,
    KernelStage3TransactionV1,
};

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

        let command = request.command;
        let definition = commands::catalog_definition(command.command_id());
        if command.target().kind() != definition.target_kind {
            return command_rejected(
                KernelStage3SubmitRejectedValueV1 {
                    document_version: self.runtime.document_version(),
                    metrics: KernelStage3MetricsV1::default(),
                },
                KernelStage3CommandFailureLeafV1::TargetMismatch,
            );
        }

        let mut transaction = self.runtime.begin_stage3_transaction();
        let dispatched = match command {
            CoreCommandEnvelopeV1::TransactionBatch { target, commands } => {
                dispatch_batch(&mut transaction, target, commands)
            }
            command => commands::dispatch(&mut transaction, command).map_err(Into::into),
        };
        if let Err(failure) = dispatched {
            return command_rejected(
                KernelStage3SubmitRejectedValueV1 {
                    document_version: self.runtime.document_version(),
                    metrics: transaction.attempt_metrics(),
                },
                failure,
            );
        }
        let prepared = match transaction.finish() {
            Ok(prepared) => prepared,
            Err(failure) => {
                return command_rejected(
                    KernelStage3SubmitRejectedValueV1 {
                        document_version: self.runtime.document_version(),
                        metrics: KernelStage3MetricsV1::default(),
                    },
                    failure,
                );
            }
        };

        match self.runtime.commit_stage3_transaction(prepared) {
            Ok(KernelStage3RuntimeCommitV1::Committed {
                document_version,
                affected,
                metrics,
            }) => KernelStage3SubmitResultV1::Committed(KernelStage3SubmitSuccessValueV1 {
                document_version,
                affected,
                metrics,
            }),
            Ok(KernelStage3RuntimeCommitV1::NoOp {
                document_version,
                metrics,
            }) => KernelStage3SubmitResultV1::NoOp(KernelStage3SubmitNoOpValueV1 {
                document_version,
                metrics,
            }),
            Err(failure) => command_rejected(
                KernelStage3SubmitRejectedValueV1 {
                    document_version: self.runtime.document_version(),
                    metrics: KernelStage3MetricsV1::default(),
                },
                failure,
            ),
        }
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

fn dispatch_batch(
    transaction: &mut KernelStage3TransactionV1<'_>,
    target: ScoreEntityTargetV1,
    children: Vec<CapturedCoreCommandV1>,
) -> Result<(), KernelStage3CommandFailureV1> {
    if children.is_empty() {
        return Err(KernelStage3CommandFailureLeafV1::BatchEmpty.into());
    }
    if children.len() > MAX_BATCH_CHILDREN_V1 {
        return Err(KernelStage3CommandFailureLeafV1::ResourceLimitExceeded {
            limit_kind: KernelStage3ResourceLimitKindV1::BatchChildren,
            limit: MAX_BATCH_CHILDREN_V1 as u64,
            actual: children.len() as u64,
        }
        .into());
    }
    let ScoreEntityTargetV1::Document { document_id } = target else {
        return Err(KernelStage3CommandFailureLeafV1::TargetMismatch.into());
    };
    transaction.begin_batch(&document_id)?;

    for (index, captured) in children.iter().enumerate() {
        let child = decode_captured_core_command(captured)
            .map_err(|failure| batch_child_failure(index, failure))?;
        let result = transaction.run_batch_child(|transaction| {
            let definition = commands::catalog_definition(child.command_id());
            if child.target().kind() != definition.target_kind {
                return Err(KernelStage3CommandFailureLeafV1::TargetMismatch);
            }
            commands::dispatch(transaction, child)
        });
        if let Err(failure) = result {
            return Err(KernelStage3CommandFailureV1::BatchChildRejected {
                failed_command_index: index as u64,
                failure,
            });
        }
    }
    Ok(())
}

fn batch_child_failure(
    index: usize,
    failure: KernelStage3CommandFailureV1,
) -> KernelStage3CommandFailureV1 {
    let failure = match failure {
        KernelStage3CommandFailureV1::Leaf(failure) => failure,
        KernelStage3CommandFailureV1::BatchChildRejected { .. } => {
            KernelStage3CommandFailureLeafV1::InternalError
        }
    };
    KernelStage3CommandFailureV1::BatchChildRejected {
        failed_command_index: index as u64,
        failure,
    }
}

#[cfg(test)]
mod tests {
    use brilliant_kernel_contracts::{
        KernelSessionCreateRequestV1, KernelStage3CommandFailureV1, ScoreEntityTargetV1,
        ScoreStructureViolationV1, decode_create_request, decode_stage3_submit_request,
        encode_create_result, encode_read_result,
    };

    use super::*;

    const SMOKE_REQUEST: &str = r#"{"apiVersion":1,"document":{"schemaVersion":"brilliant-score-1","id":"score-rkp1","metadata":{"title":"Smoke","authors":["Brilliant"],"tempo":{"bpm":120}},"measureDefinitions":[{"id":"measure-1","meter":{"numerator":4,"denominator":4}}],"parts":[{"id":"part-1","name":"Part","instrument":{"name":"Piano","writtenToSounding":{"diatonicSteps":0,"chromaticSemitones":0}},"staves":[{"id":"staff-1","lineCount":5,"defaultClef":{"sign":"G","line":2}}],"measureContents":[{"measureId":"measure-1","voices":[{"id":"voice-1","defaultStaffId":"staff-1","sequence":{"start":{"numerator":0,"denominator":1},"events":[{"id":"event-1","duration":{"base":1,"dots":0},"content":{"kind":"rest"}}]}}]}]}],"extensions":[]}}"#;
    const LOCAL_REQUEST: &str = r#"{"apiVersion":1,"document":{"schemaVersion":"brilliant-score-1","id":"score-local","metadata":{"title":"Local","authors":["Brilliant"],"tempo":{"bpm":120}},"measureDefinitions":[{"id":"measure-1","meter":{"numerator":4,"denominator":4}}],"parts":[{"id":"part-1","name":"Part","instrument":{"name":"Piano","writtenToSounding":{"diatonicSteps":0,"chromaticSemitones":0}},"staves":[{"id":"staff-1","lineCount":5,"defaultClef":{"sign":"G","line":2}}],"measureContents":[{"measureId":"measure-1","voices":[{"id":"voice-1","defaultStaffId":"staff-1","sequence":{"start":{"numerator":0,"denominator":1},"events":[{"id":"event-1","duration":{"base":4,"dots":0},"content":{"kind":"notes","notes":[{"id":"note-1","writtenPitch":{"step":"C","alter":0,"octave":4}}]}}]}},{"id":"voice-2","defaultStaffId":"staff-1","sequence":{"start":{"numerator":0,"denominator":1},"events":[{"id":"event-2","duration":{"base":4,"dots":0},"content":{"kind":"rest"}}]}}]}]}],"extensions":[]}}"#;

    fn local_session() -> KernelSession {
        KernelSession::create(decode_create_request(LOCAL_REQUEST.as_bytes()).expect("request"))
            .expect("session")
            .session
    }

    fn submit(session: &mut KernelSession, request: &str) -> KernelStage3SubmitResultV1 {
        session.submit_stage3(
            decode_stage3_submit_request(request.as_bytes()).expect("stage-three request"),
        )
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
                document.schema_version = "brilliant-score-2".to_owned();
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
                if document_id.as_str() == "score-local"
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
        assert_eq!(failure, KernelStage3CommandFailureLeafV1::ReferenceConflict);
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
            ] if voice_id.as_str() == "voice-1"
                && event_id.as_str() == "event-3"
                && note_id.as_str() == "note-3"
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
        assert_eq!(
            failure,
            KernelStage3CommandFailureLeafV1::LocalInvariantRejected
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
            ] if event_id.as_str() == "event-3"
                && voice_id.as_str() == "voice-1"
                && note_id.as_str() == "note-3"
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
            ] if voice_id.as_str() == "voice-1" && event_id.as_str() == "event-4"
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
                .map(|event| event.id.as_str())
                .collect::<Vec<_>>(),
            ["event-4", "event-1"]
        );
        assert_eq!(voices[1].sequence.events[0].id.as_str(), "event-2");
    }
}
