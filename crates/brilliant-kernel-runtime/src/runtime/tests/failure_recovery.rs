use super::*;
use brilliant_kernel_contracts::{
    KernelStage3CommandFailureLeafV1, KernelStage4CommandResultV1, decode_admission_submit_request,
};

use crate::{
    checkpoint::CheckpointObservationV1, session_projection::SessionProjectionObservationV1,
};

const INSERT: &str = r#"{"commandVersion":1,"commandId":"core.part.insert","target":{"kind":"document","documentId":"score-root"},"payload":{"anchor":{"kind":"start"},"part":{"id":"temporary","name":"Temporary","instrument":{"name":"Piano","writtenToSounding":{"diatonicSteps":0,"chromaticSemitones":0}},"staves":[{"id":"","lineCount":5,"defaultClef":{"sign":"G","line":2}}],"measureContents":[{"measureId":"measure-z","voices":[{"id":"temporary-z","defaultStaffId":"","sequence":{"start":{"numerator":0,"denominator":1},"events":[]}}]},{"measureId":"measure-a","voices":[{"id":"temporary-a","defaultStaffId":"","sequence":{"start":{"numerator":0,"denominator":1},"events":[]}}]}]}}}"#;
const REMOVE: &str = r#"{"commandVersion":1,"commandId":"core.part.remove","target":{"kind":"part","partId":"temporary"},"payload":{}}"#;
const PITCH: &str = r#"{"commandVersion":1,"commandId":"core.note.set-written-pitch","target":{"kind":"note","noteId":"note-a"},"payload":{"writtenPitch":{"step":"D","alter":0,"octave":4}}}"#;

#[derive(Debug, Eq, PartialEq)]
struct RuntimeFingerprint {
    document: ScoreDocumentV1,
    document_version: DocumentVersionV1,
    history: KernelHistoryStateV1,
    history_entries: usize,
    history_cursor: usize,
    history_next_sequence: u64,
    dirty: bool,
    committed_metrics: KernelStage3MetricsV1,
    checkpoint: CheckpointObservationV1,
    projection: SessionProjectionObservationV1,
}

#[test]
fn typed_submit_reservation_failure_is_zero_delta_and_retryable() {
    let mut runtime = KernelRuntime::create(crate::store::tests::fixture()).expect("runtime");
    commit_metadata(&mut runtime, "first").expect("first commit");
    commit_metadata(&mut runtime, "second").expect("second commit");
    assert_committed(runtime.undo());
    let cached = install_snapshot(&runtime);
    let before = fingerprint(&runtime);

    runtime.fail_next_commit_reservation_for_test();
    assert_eq!(
        commit_metadata(&mut runtime, "branch"),
        Err(internal_commit_failure())
    );
    assert_eq!(fingerprint(&runtime), before);
    assert!(cached.upgrade().is_some());

    assert_committed(commit_metadata(&mut runtime, "branch").expect("retry commit"));
    assert_eq!(
        runtime.store.header.metadata.title,
        JsString::from("branch")
    );
    assert_eq!(runtime.history.projected().expect("history").redo_depth, 0);
    assert!(cached.upgrade().is_none());
    assert_index_parity(&runtime);
}

#[test]
fn candidate_submit_reservation_failure_is_zero_delta_and_retryable() {
    let mut runtime = KernelRuntime::create(crate::store::tests::fixture()).expect("runtime");
    let cached = install_snapshot(&runtime);
    let before = fingerprint(&runtime);

    runtime.fail_next_commit_reservation_for_test();
    let failed = submit_candidate_batch(&mut runtime);
    let KernelStage4CommandResultV1::Rejected { value, failure } = failed else {
        panic!("candidate reserve fault must reject");
    };
    assert_eq!(failure, internal_commit_failure());
    assert!(value.metrics.change_ops > 0);
    assert_eq!(fingerprint(&runtime), before);
    assert!(cached.upgrade().is_some());

    assert_committed(submit_candidate_batch(&mut runtime));
    assert!(cached.upgrade().is_none());
    assert_index_parity(&runtime);
}

#[test]
fn typed_history_reservation_failures_preserve_cursor_and_recover() {
    let mut runtime = KernelRuntime::create(crate::store::tests::fixture()).expect("runtime");
    commit_metadata(&mut runtime, "first").expect("first commit");
    commit_metadata(&mut runtime, "second").expect("second commit");

    assert_history_reservation_failure(&mut runtime, false);
    assert_committed(runtime.undo());
    assert_eq!(runtime.store.header.metadata.title, JsString::from("first"));

    assert_history_reservation_failure(&mut runtime, true);
    assert_committed(runtime.redo());
    assert_eq!(
        runtime.store.header.metadata.title,
        JsString::from("second")
    );
    assert_index_parity(&runtime);
}

#[test]
fn candidate_history_reservation_failures_preserve_cursor_and_recover() {
    let mut runtime = KernelRuntime::create(crate::store::tests::fixture()).expect("runtime");
    let initial = runtime.store.export_document().expect("initial document");
    assert_committed(submit_candidate_batch(&mut runtime));
    let committed = runtime.store.export_document().expect("candidate document");

    assert_history_reservation_failure(&mut runtime, false);
    assert_committed(runtime.undo());
    assert_eq!(
        runtime.store.export_document().expect("undo document"),
        initial
    );

    assert_history_reservation_failure(&mut runtime, true);
    assert_committed(runtime.redo());
    assert_eq!(
        runtime.store.export_document().expect("redo document"),
        committed
    );
    assert_index_parity(&runtime);
}

#[test]
fn publication_sequence_failures_do_not_consume_state_and_retry() {
    let mut event_runtime =
        KernelRuntime::create(crate::store::tests::fixture()).expect("event runtime");
    let event_sequence = event_runtime.projection.observation().next_event_sequence;
    event_runtime
        .projection
        .set_next_event_sequence_for_test(JS_SAFE_INTEGER_MAX as u64);
    let event_before = fingerprint(&event_runtime);
    assert_eq!(
        commit_metadata(&mut event_runtime, "event overflow"),
        Err(KernelStage4FailureV1::EventSequenceOverflow)
    );
    assert_eq!(fingerprint(&event_runtime), event_before);
    event_runtime
        .projection
        .set_next_event_sequence_for_test(event_sequence);
    assert_committed(commit_metadata(&mut event_runtime, "event overflow").expect("event retry"));

    let mut history_runtime =
        KernelRuntime::create(crate::store::tests::fixture()).expect("history runtime");
    commit_metadata(&mut history_runtime, "first").expect("first commit");
    commit_metadata(&mut history_runtime, "second").expect("second commit");
    assert_committed(history_runtime.undo());
    let history_sequence = history_runtime.history.observation().next_sequence;
    history_runtime
        .history
        .set_next_sequence_for_test(JS_SAFE_INTEGER_MAX as u64 + 1);
    let history_before = fingerprint(&history_runtime);
    assert_eq!(
        commit_metadata(&mut history_runtime, "history overflow"),
        Err(KernelStage4FailureV1::HistoryInvariantViolation)
    );
    assert_eq!(fingerprint(&history_runtime), history_before);
    history_runtime
        .history
        .set_next_sequence_for_test(history_sequence);
    assert_committed(
        commit_metadata(&mut history_runtime, "history overflow").expect("history retry"),
    );
    assert_eq!(
        history_runtime
            .history
            .projected()
            .expect("history after retry")
            .redo_depth,
        0
    );
}

#[test]
fn checkpoint_counter_overflow_is_zero_delta_and_retryable() {
    let mut runtime = KernelRuntime::create(crate::store::tests::fixture()).expect("runtime");
    runtime.checkpoint.force_due_for_test(u64::MAX, 17);
    let before = fingerprint(&runtime);

    assert_eq!(
        commit_metadata(&mut runtime, "checkpoint overflow"),
        Err(KernelStage4FailureV1::HistoryInvariantViolation)
    );
    assert_eq!(fingerprint(&runtime), before);

    runtime.checkpoint.force_due_for_test(0, 0);
    let result = commit_metadata(&mut runtime, "checkpoint overflow").expect("checkpoint retry");
    let KernelStage4CommandResultV1::Committed { value, .. } = result else {
        panic!("checkpoint retry must commit");
    };
    assert_eq!(value.stage4_metrics.checkpoint_successes, 1);
    assert!(!runtime.checkpoint.observation().due);
    assert_index_parity(&runtime);
}

fn commit_metadata(
    runtime: &mut KernelRuntime,
    title: &str,
) -> Result<KernelStage4CommandResultV1, KernelStage4FailureV1> {
    let document_id = runtime.store.header.id.clone();
    let mut metadata = runtime.store.header.metadata.clone();
    metadata.title = title.into();
    let prepared = {
        let mut transaction = runtime.begin_stage3_transaction();
        transaction
            .set_document_metadata(document_id.clone(), metadata.clone())
            .expect("prepare metadata");
        transaction.finish().expect("finish metadata")
    };
    runtime.commit_stage4_transaction(
        CoreCommandEnvelopeV1::DocumentSetMetadata {
            target: ScoreEntityTargetV1::Document { document_id },
            metadata,
        },
        prepared,
    )
}

fn submit_candidate_batch(runtime: &mut KernelRuntime) -> KernelStage4CommandResultV1 {
    let batch = format!(
        r#"{{"commandVersion":1,"commandId":"core.transaction.batch","target":{{"kind":"document","documentId":"score-root"}},"payload":{{"commands":[{PITCH},{INSERT},{REMOVE}]}}}}"#
    );
    let wire = format!(r#"{{"apiVersion":1,"command":{batch}}}"#);
    let command = decode_admission_submit_request(wire.as_bytes())
        .expect("candidate command")
        .command;
    runtime.submit_stage4_admission(command, dispatch_typed)
}

fn dispatch_typed(
    transaction: &mut KernelStage3TransactionV1<'_>,
    command: CoreCommandEnvelopeV1,
) -> Result<(), KernelStage3CommandFailureLeafV1> {
    match command {
        CoreCommandEnvelopeV1::NoteSetWrittenPitch {
            target: ScoreEntityTargetV1::Note { note_id },
            written_pitch,
        } => transaction.set_note_written_pitch(note_id, written_pitch),
        _ => panic!("candidate promotion expected"),
    }
}

fn assert_history_reservation_failure(runtime: &mut KernelRuntime, redo: bool) {
    let cached = install_snapshot(runtime);
    let before = fingerprint(runtime);
    runtime.fail_next_commit_reservation_for_test();
    let result = if redo { runtime.redo() } else { runtime.undo() };
    let KernelStage4CommandResultV1::Rejected { failure, .. } = result else {
        panic!("history reserve fault must reject");
    };
    assert_eq!(failure, KernelStage4FailureV1::HistoryInvariantViolation);
    assert_eq!(fingerprint(runtime), before);
    assert!(cached.upgrade().is_some());
}

fn install_snapshot(
    runtime: &KernelRuntime,
) -> std::sync::Weak<brilliant_score_foundation::ScoreDocumentV1> {
    runtime.read_stage4(None).expect("snapshot read");
    runtime
        .projection
        .cached_document_for_test()
        .expect("cached snapshot")
}

fn fingerprint(runtime: &KernelRuntime) -> RuntimeFingerprint {
    let history = runtime.history.observation();
    let identity = runtime.history.current_identity().expect("identity");
    RuntimeFingerprint {
        document: runtime.store.export_document().expect("document"),
        document_version: runtime.document_version,
        history: runtime.history.projected().expect("history"),
        history_entries: history.entries,
        history_cursor: history.cursor,
        history_next_sequence: history.next_sequence,
        dirty: runtime.projection.dirty(identity),
        committed_metrics: runtime.committed_metrics,
        checkpoint: runtime.checkpoint.observation(),
        projection: runtime.projection.observation(),
    }
}

fn assert_committed(result: KernelStage4CommandResultV1) {
    assert!(
        matches!(result, KernelStage4CommandResultV1::Committed { .. }),
        "expected committed result, got {result:?}"
    );
}

fn internal_commit_failure() -> KernelStage4FailureV1 {
    KernelStage4FailureV1::Command(KernelStage3CommandFailureLeafV1::InternalError.into())
}

fn assert_index_parity(runtime: &KernelRuntime) {
    let (rebuilt, _) = crate::indices::rebuild_indices_from_store(&runtime.store)
        .expect("rebuild indices after recovery");
    assert_eq!(
        crate::indices::normalized_index_projection(&runtime.store, &runtime.store.indices)
            .expect("live index projection"),
        crate::indices::normalized_index_projection(&runtime.store, &rebuilt)
            .expect("rebuilt index projection")
    );
}
