use super::*;
use brilliant_kernel_contracts::{CoreCommandIdV1, decode_admission_submit_request};

const INSERT: &str = r#"{"commandVersion":1,"commandId":"core.part.insert","target":{"kind":"document","documentId":"score-root"},"payload":{"anchor":{"kind":"start"},"part":{"id":"temporary","name":"Temporary","instrument":{"name":"Piano","writtenToSounding":{"diatonicSteps":0,"chromaticSemitones":0}},"staves":[{"id":"","lineCount":5,"defaultClef":{"sign":"G","line":2}}],"measureContents":[{"measureId":"measure-z","voices":[{"id":"temporary-z","defaultStaffId":"","sequence":{"start":{"numerator":0,"denominator":1},"events":[]}}]},{"measureId":"measure-a","voices":[{"id":"temporary-a","defaultStaffId":"","sequence":{"start":{"numerator":0,"denominator":1},"events":[]}}]}]}}}"#;
const REMOVE: &str = r#"{"commandVersion":1,"commandId":"core.part.remove","target":{"kind":"part","partId":"temporary"},"payload":{}}"#;
const PITCH: &str = r#"{"commandVersion":1,"commandId":"core.note.set-written-pitch","target":{"kind":"note","noteId":"note-a"},"payload":{"writtenPitch":{"step":"D","alter":0,"octave":4}}}"#;
const MISSING: &str = r#"{"commandVersion":1,"commandId":"core.part.set-name","target":{"kind":"part","partId":"missing"},"payload":{"name":"Missing"}}"#;

fn typed(
    transaction: &mut KernelStage3TransactionV1<'_>,
    command: CoreCommandEnvelopeV1,
) -> Result<(), LeafFailure> {
    match command {
        CoreCommandEnvelopeV1::NoteSetWrittenPitch {
            target: ScoreEntityTargetV1::Note { note_id },
            written_pitch,
        } => transaction.set_note_written_pitch(note_id, written_pitch),
        _ => panic!("this command must execute after candidate promotion"),
    }
}
fn submit(runtime: &mut KernelRuntime, command: &str) -> KernelStage4CommandResultV1 {
    let wire = format!(r#"{{"apiVersion":1,"command":{command}}}"#);
    let command = decode_admission_submit_request(wire.as_bytes())
        .unwrap()
        .command;
    runtime.submit_stage4_admission(command, typed)
}
fn batch(children: &[&str]) -> String {
    format!(
        r#"{{"commandVersion":1,"commandId":"core.transaction.batch","target":{{"kind":"document","documentId":"score-root"}},"payload":{{"commands":[{}]}}}}"#,
        children.join(",")
    )
}
fn snapshot(runtime: &KernelRuntime) -> ScoreDocumentV1 {
    runtime.store.export_document().unwrap()
}

#[test]
fn batch_child_wraps_candidate_work_limit_and_cannot_continue_the_transaction() {
    let initial = crate::store::tests::fixture();
    let runtime = KernelRuntime::create(initial.clone()).unwrap();
    let mut candidate = CandidateExecution::new(
        TransactionOverlayV1::new(&runtime.store),
        initial.id.clone(),
    )
    .unwrap();
    candidate.set_work_limit_for_test(candidate.work_units_for_test());
    let mut transaction = AdmissionTransaction {
        branch: Some(Branch::Candidate(candidate)),
        store: &runtime.store,
        version: runtime.document_version,
        failed_metrics: KernelStage3MetricsV1::default(),
    };
    let command = decode_admission_submit_request(
        format!(r#"{{"apiVersion":1,"command":{}}}"#, batch(&[PITCH])).as_bytes(),
    )
    .unwrap()
    .command;

    let failure = transaction.dispatch(command, &typed).unwrap_err();
    assert!(matches!(
        failure,
        CommandFailure::BatchChildRejected {
            failed_command_index: 0,
            failure: LeafFailure::ResourceLimitExceeded {
                limit_kind: KernelStage3ResourceLimitKindV1::TransactionWorkUnits,
                ..
            }
        }
    ));
    assert_eq!(snapshot(&runtime), initial);
}

#[test]
fn typed_prefix_and_raw_suffix_publish_one_history_entry_and_replay_it() {
    let initial = crate::store::tests::fixture();
    let mut runtime = KernelRuntime::create(initial.clone()).unwrap();
    let result = submit(&mut runtime, &batch(&[PITCH, INSERT, REMOVE]));
    let KernelStage4CommandResultV1::Committed { value, events } = result else {
        panic!("{result:?}");
    };
    assert_eq!(value.document_version.get(), 1);
    assert_eq!(value.history.undo_depth, 1);
    assert!(value.dirty);
    assert!(value.metrics.semantic_rules_evaluated > 0);
    assert!(value.metrics.semantic_dependency_reads > 0);
    assert!(value.metrics.changeset_logical_bytes > 0);
    assert_eq!(value.metrics.full_document_clones, 0);
    assert_eq!(value.metrics.full_snapshot_materializations, 0);
    assert!(value.affected.iter().any(|target| matches!(target, ScoreEntityTargetV1::Staff { staff_id } if staff_id.as_js_string().is_empty())));
    assert!(matches!(
        runtime.history.undo_entry().unwrap().payload,
        HistoryPayloadV1::Candidate(_)
    ));
    assert!(matches!(
        &events[0],
        KernelEventV1::DocumentCommitted {
            command_id: KernelCommandIdentityV1::Core(CoreCommandIdV1::TransactionBatch),
            ..
        }
    ));
    let changed = snapshot(&runtime);
    assert_ne!(changed, initial);
    assert_eq!(changed.parts.len(), initial.parts.len());
    assert!(matches!(
        runtime.undo(),
        KernelStage4CommandResultV1::Committed { .. }
    ));
    assert_eq!(snapshot(&runtime), initial);
    assert!(matches!(
        runtime.redo(),
        KernelStage4CommandResultV1::Committed { .. }
    ));
    assert_eq!(snapshot(&runtime), changed);
    let (expected, _) = crate::indices::rebuild_indices_from_store(&runtime.store).unwrap();
    assert_eq!(
        crate::indices::normalized_index_projection(&runtime.store, &runtime.store.indices)
            .unwrap(),
        crate::indices::normalized_index_projection(&runtime.store, &expected).unwrap()
    );
}

#[test]
fn effective_net_zero_candidate_still_commits_and_remains_undoable() {
    let initial = crate::store::tests::fixture();
    let mut runtime = KernelRuntime::create(initial.clone()).unwrap();
    let result = submit(&mut runtime, &batch(&[INSERT, REMOVE]));
    let KernelStage4CommandResultV1::Committed { value, .. } = result else {
        panic!("{result:?}");
    };
    assert_eq!(snapshot(&runtime), initial);
    assert_eq!(value.document_version.get(), 1);
    assert_eq!(value.history.undo_depth, 1);
    assert_eq!(value.metrics.change_ops, 2);
    assert!(matches!(
        runtime.undo(),
        KernelStage4CommandResultV1::Committed { .. }
    ));
    assert_eq!(snapshot(&runtime), initial);
    assert!(matches!(
        runtime.redo(),
        KernelStage4CommandResultV1::Committed { .. }
    ));
    assert_eq!(snapshot(&runtime), initial);
}

#[test]
fn rejected_candidate_preserves_live_state_and_existing_redo() {
    let initial = crate::store::tests::fixture();
    let mut runtime = KernelRuntime::create(initial.clone()).unwrap();
    let accepted = submit(&mut runtime, PITCH);
    let KernelStage4CommandResultV1::Committed { value, .. } = accepted else {
        panic!("{accepted:?}");
    };
    assert_eq!(value.metrics.full_document_scans, 0);
    assert_eq!(value.metrics.full_semantic_validations, 0);
    assert!(matches!(
        runtime.history.undo_entry().unwrap().payload,
        HistoryPayloadV1::Typed(_)
    ));
    assert!(matches!(
        runtime.undo(),
        KernelStage4CommandResultV1::Committed { .. }
    ));
    let before = runtime.document_version;
    let rejected = submit(&mut runtime, &batch(&[PITCH, INSERT, MISSING]));
    let KernelStage4CommandResultV1::Rejected { value, failure } = rejected else {
        panic!("{rejected:?}");
    };
    assert_eq!(
        failure,
        KernelStage4FailureV1::Command(CommandFailure::BatchChildRejected {
            failed_command_index: 2,
            failure: LeafFailure::TargetNotFound
        })
    );
    assert_eq!(value.document_version, before);
    assert_eq!(value.history.redo_depth, 1);
    assert!(!value.dirty);
    assert_eq!(snapshot(&runtime), initial);
    assert!(matches!(
        runtime.redo(),
        KernelStage4CommandResultV1::Committed { .. }
    ));
}

#[test]
fn candidate_version_overflow_is_a_transaction_failure_without_child_attribution() {
    let initial = crate::store::tests::fixture();
    let mut runtime = KernelRuntime::create(initial.clone()).unwrap();
    runtime.document_version = DocumentVersionV1::try_from(JS_SAFE_INTEGER_MAX as u64).unwrap();
    let result = submit(&mut runtime, &batch(&[INSERT, REMOVE]));
    let KernelStage4CommandResultV1::Rejected { value, failure } = result else {
        panic!("{result:?}");
    };
    assert_eq!(
        failure,
        KernelStage4FailureV1::Command(LeafFailure::VersionOverflow.into())
    );
    assert_eq!(value.history.undo_depth, 0);
    assert!(value.metrics.semantic_rules_evaluated > 0);
    assert_eq!(snapshot(&runtime), initial);
}

#[test]
fn publication_failure_retains_completed_candidate_preparation_metrics() {
    let initial = crate::store::tests::fixture();
    let mut runtime = KernelRuntime::create(initial.clone()).unwrap();
    assert!(matches!(
        submit(&mut runtime, PITCH),
        KernelStage4CommandResultV1::Committed { .. }
    ));
    assert!(matches!(
        runtime.undo(),
        KernelStage4CommandResultV1::Committed { .. }
    ));
    let before_version = runtime.document_version;
    let before_history = runtime.history.projected().unwrap();
    let before_checkpoint = runtime.checkpoint.observation();
    let before_committed_metrics = runtime.committed_metrics;
    runtime
        .history
        .set_next_sequence_for_test(JS_SAFE_INTEGER_MAX as u64 + 1);

    let result = submit(&mut runtime, &batch(&[PITCH, INSERT, REMOVE]));
    let KernelStage4CommandResultV1::Rejected { value, failure } = result else {
        panic!("{result:?}");
    };
    assert_eq!(failure, KernelStage4FailureV1::HistoryInvariantViolation);
    assert_eq!(value.metrics.full_semantic_validations, 1);
    assert_eq!(value.metrics.full_document_scans, 1);
    assert!(value.metrics.semantic_rules_evaluated > 0);
    assert!(value.metrics.semantic_dependency_reads > 0);
    assert!(value.metrics.change_ops > 0);
    assert!(value.metrics.changeset_logical_bytes > 0);
    assert!(value.metrics.affected_addresses > 0);
    assert_eq!(value.document_version, before_version);
    assert_eq!(value.history, before_history);
    assert!(!value.dirty);
    assert_eq!(snapshot(&runtime), initial);
    assert_eq!(runtime.committed_metrics, before_committed_metrics);
    assert_eq!(runtime.checkpoint.observation(), before_checkpoint);
    assert!(matches!(
        runtime.redo(),
        KernelStage4CommandResultV1::Committed { .. }
    ));
}

#[test]
fn checkpoint_bytes_include_candidate_suffix_and_failed_materialization_retries() {
    let mut runtime = KernelRuntime::create(crate::store::tests::fixture()).unwrap();
    let result = submit(&mut runtime, &batch(&[PITCH, INSERT, REMOVE]));
    let KernelStage4CommandResultV1::Committed { value, .. } = result else {
        panic!("{result:?}");
    };
    let observed = runtime.checkpoint.observation();
    assert_eq!(observed.entries, 1);
    assert_eq!(
        observed.logical_bytes,
        value.metrics.changeset_logical_bytes
    );
    assert!(!observed.due);
    runtime
        .checkpoint
        .force_due_for_test(observed.entries, observed.logical_bytes);
    runtime.checkpoint.fail_next_materialization();
    let second = submit(&mut runtime, &batch(&[INSERT, REMOVE]));
    let KernelStage4CommandResultV1::Committed { value, events } = second else {
        panic!("{second:?}");
    };
    assert_eq!(value.stage4_metrics.checkpoint_failures, 1);
    assert_eq!(value.document_version.get(), 2);
    assert_eq!(value.history.undo_depth, 2);
    assert_eq!(events.len(), 1);
    assert!(runtime.checkpoint.observation().due);
    let retried = runtime.attempt_checkpoint_maintenance();
    assert_eq!(retried.checkpoint_successes, 1);
    let observed = runtime.checkpoint.observation();
    assert_eq!(observed.logical_bytes, 0);
    assert_eq!(observed.latest_version, Some(value.document_version));
    assert_eq!(observed.latest_cursor, Some(2));
}
