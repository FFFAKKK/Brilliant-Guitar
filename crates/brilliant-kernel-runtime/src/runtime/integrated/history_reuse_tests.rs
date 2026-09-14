use super::*;
use brilliant_kernel_contracts::decode_admission_submit_request;

const INSERT: &str = r#"{"commandVersion":1,"commandId":"core.part.insert","target":{"kind":"document","documentId":"score-root"},"payload":{"anchor":{"kind":"start"},"part":{"id":"temporary","name":"Temporary","instrument":{"name":"Piano","writtenToSounding":{"diatonicSteps":0,"chromaticSemitones":0}},"staves":[{"id":"","lineCount":5,"defaultClef":{"sign":"G","line":2}}],"measureContents":[{"measureId":"measure-z","voices":[{"id":"temporary-z","defaultStaffId":"","sequence":{"start":{"numerator":0,"denominator":1},"events":[]}}]},{"measureId":"measure-a","voices":[{"id":"temporary-a","defaultStaffId":"","sequence":{"start":{"numerator":0,"denominator":1},"events":[]}}]}]}}}"#;
const REMOVE: &str = r#"{"commandVersion":1,"commandId":"core.part.remove","target":{"kind":"part","partId":"temporary"},"payload":{}}"#;
const PITCH: &str = r#"{"commandVersion":1,"commandId":"core.note.set-written-pitch","target":{"kind":"note","noteId":"note-a"},"payload":{"writtenPitch":{"step":"D","alter":0,"octave":4}}}"#;

fn edited(children: &[&str]) -> KernelRuntime {
    let mut runtime = KernelRuntime::create(crate::store::tests::fixture()).unwrap();
    let wire = format!(
        r#"{{"apiVersion":1,"command":{{"commandVersion":1,"commandId":"core.transaction.batch","target":{{"kind":"document","documentId":"score-root"}},"payload":{{"commands":[{}]}}}}}}"#,
        children.join(",")
    );
    let command = decode_admission_submit_request(wire.as_bytes())
        .unwrap()
        .command;
    let result = runtime.submit_stage4_admission(command, |transaction, command| match command {
        CoreCommandEnvelopeV1::NoteSetWrittenPitch {
            target: ScoreEntityTargetV1::Note { note_id },
            written_pitch,
        } => transaction.set_note_written_pitch(note_id, written_pitch),
        _ => panic!("admission promotion expected"),
    });
    assert!(matches!(
        result,
        KernelStage4CommandResultV1::Committed { .. }
    ));
    runtime
}

fn assert_same_commit(actual: KernelStage4CommandResultV1, expected: KernelStage4CommandResultV1) {
    let KernelStage4CommandResultV1::Committed {
        value: mut actual,
        events,
    } = actual
    else {
        panic!("expected committed replay");
    };
    let KernelStage4CommandResultV1::Committed {
        value: expected,
        events: expected_events,
    } = expected
    else {
        panic!("expected baseline commit");
    };
    assert_eq!(events, expected_events);
    assert_eq!(actual.metrics.change_ops, expected.metrics.change_ops);
    assert_eq!(
        actual.metrics.changeset_logical_bytes,
        expected.metrics.changeset_logical_bytes
    );
    assert_eq!(
        actual.metrics.affected_addresses,
        expected.metrics.affected_addresses
    );
    assert_eq!(actual.metrics.full_semantic_validations, 1);
    // The reused plan now also accounts for the callback projection's reads.
    actual.metrics = expected.metrics;
    assert_eq!(actual, expected);
}

fn assert_rejected_unchanged(
    runtime: &mut KernelRuntime,
    redo: bool,
    token: PreparedHistoryTransition,
) {
    let before = runtime.store.export_document().unwrap();
    let version = runtime.document_version;
    let history = runtime.history.projected().unwrap();
    let metrics = runtime.committed_metrics;
    let result = runtime.apply_history_transition_prepared(redo, Some(token));
    assert!(matches!(
        result,
        KernelStage4CommandResultV1::Rejected {
            failure: KernelStage4FailureV1::HistoryInvariantViolation,
            ..
        }
    ));
    assert_eq!(runtime.store.export_document().unwrap(), before);
    assert_eq!(runtime.document_version, version);
    assert_eq!(runtime.history.projected().unwrap(), history);
    assert_eq!(runtime.committed_metrics, metrics);
}

#[test]
fn prepared_history_matches_ordinary_replay_including_operation_fact_net_zero() {
    for children in [
        vec![INSERT, REMOVE],
        vec![INSERT, REMOVE, PITCH],
        vec![PITCH, INSERT, REMOVE],
    ] {
        let mut runtime = edited(&children);
        let mut ordinary = edited(&children);
        for redo in [false, true, false] {
            let (preview, prepared) = runtime.prepare_integrated_history(redo).unwrap();
            assert_eq!(prepared.is_some(), children[0] == INSERT);
            assert_eq!(preview, runtime.preview_integrated_history(redo).unwrap());
            let result = runtime.apply_history_transition_prepared(redo, prepared);
            let expected = if redo {
                ordinary.redo()
            } else {
                ordinary.undo()
            };
            assert_same_commit(result, expected);
            assert_eq!(runtime.store.export_document().unwrap(), preview);
            let (indices, _) = crate::indices::rebuild_indices_from_store(&runtime.store).unwrap();
            assert_eq!(
                crate::indices::normalized_index_projection(&runtime.store, &runtime.store.indices)
                    .unwrap(),
                crate::indices::normalized_index_projection(&runtime.store, &indices).unwrap()
            );
        }
    }
}

#[test]
fn prepared_history_rejects_wrong_direction_foreign_entry_and_stale_version() {
    let mut runtime = edited(&[INSERT, REMOVE, PITCH]);
    let (_, token) = runtime.prepare_integrated_history(false).unwrap();
    assert_rejected_unchanged(&mut runtime, true, token.unwrap());
    let foreign = edited(&[INSERT, REMOVE, PITCH]);
    let (_, token) = foreign.prepare_integrated_history(false).unwrap();
    assert_rejected_unchanged(&mut runtime, false, token.unwrap());
    let (_, token) = runtime.prepare_integrated_history(false).unwrap();
    assert!(matches!(
        runtime.undo(),
        KernelStage4CommandResultV1::Committed { .. }
    ));
    assert!(matches!(
        runtime.redo(),
        KernelStage4CommandResultV1::Committed { .. }
    ));
    // Same current entry and document contents, but a later monotonic version.
    assert_rejected_unchanged(&mut runtime, false, token.unwrap());
}

#[test]
fn dropping_or_rejecting_preparation_leaves_history_available_for_retry() {
    let mut runtime = edited(&[INSERT, REMOVE, PITCH]);
    let before = runtime.store.export_document().unwrap();
    let (_, prepared) = runtime.prepare_integrated_history(false).unwrap();
    drop(prepared);
    assert_eq!(runtime.store.export_document().unwrap(), before);
    let (_, prepared) = runtime.prepare_integrated_history(false).unwrap();
    let mut token = prepared.unwrap();
    token.plan = Err(KernelStage3CommandFailureLeafV1::InternalError);
    assert_rejected_unchanged(&mut runtime, false, token);
    let (_, prepared) = runtime.prepare_integrated_history(false).unwrap();
    assert!(matches!(
        runtime.apply_history_transition_prepared(false, prepared),
        KernelStage4CommandResultV1::Committed { .. }
    ));
    assert_eq!(
        runtime.store.export_document().unwrap(),
        crate::store::tests::fixture()
    );
}

#[test]
fn prepared_history_uses_current_persisted_marker_and_event_sequence() {
    let mut runtime = edited(&[INSERT, REMOVE, PITCH]);
    let mut ordinary = edited(&[INSERT, REMOVE, PITCH]);
    let (_, prepared) = runtime.prepare_integrated_history(false).unwrap();
    let checkpoint = PersistedCheckpointV1 {
        document_id: runtime.document_id().clone(),
        document_version: runtime.document_version,
    };
    assert_eq!(
        runtime.mark_persisted(checkpoint.clone()),
        ordinary.mark_persisted(checkpoint)
    );
    let result = runtime.apply_history_transition_prepared(false, prepared);
    let KernelStage4CommandResultV1::Committed { value, events } = &result else {
        panic!("expected replay");
    };
    assert!(value.dirty);
    assert_eq!(events.len(), 2);
    assert_same_commit(result, ordinary.undo());
}
