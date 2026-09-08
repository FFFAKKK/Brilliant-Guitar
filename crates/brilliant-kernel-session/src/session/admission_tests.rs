use super::*;
use brilliant_kernel_contracts::{KernelStage3CommandFailureLeafV1 as Leaf, decode_create_request};

const DOCUMENT: &str = r#"{"schemaVersion":"brilliant-score-1","id":"score","metadata":{"title":"Initial","authors":[],"tempo":{"bpm":120}},"measureDefinitions":[{"id":"measure","meter":{"numerator":4,"denominator":4}}],"parts":[{"id":"part","name":"Part","instrument":{"name":"Piano","writtenToSounding":{"diatonicSteps":0,"chromaticSemitones":0}},"staves":[{"id":"staff","lineCount":5,"defaultClef":{"sign":"G","line":2}}],"measureContents":[{"measureId":"measure","voices":[{"id":"voice","defaultStaffId":"staff","sequence":{"start":{"numerator":0,"denominator":1},"events":[]}}]}]}],"extensions":[]}"#;
const METADATA: &str = r#"{"commandVersion":1,"commandId":"core.document.set-metadata","target":{"kind":"document","documentId":"score"},"payload":{"metadata":{"title":"Prefix","authors":[],"tempo":{"bpm":120}}}}"#;
const INSERT: &str = r#"{"commandVersion":1,"commandId":"core.part.insert","target":{"kind":"document","documentId":"score"},"payload":{"anchor":{"kind":"start"},"part":{"id":"temporary","name":"Temporary","instrument":{"name":"Piano","writtenToSounding":{"diatonicSteps":0,"chromaticSemitones":0}},"staves":[{"id":"","lineCount":5,"defaultClef":{"sign":"G","line":2}},{"id":"temporary-staff","lineCount":5,"defaultClef":{"sign":"G","line":2}}],"measureContents":[{"measureId":"measure","voices":[{"id":"temporary-voice","defaultStaffId":"temporary-staff","sequence":{"start":{"numerator":0,"denominator":1},"events":[]}}]}]}}}"#;
const REMOVE: &str = r#"{"commandVersion":1,"commandId":"core.part.remove","target":{"kind":"part","partId":"temporary"},"payload":{}}"#;
const MISSING: &str = r#"{"commandVersion":1,"commandId":"core.part.remove","target":{"kind":"part","partId":"missing"},"payload":{}}"#;

fn session() -> KernelSession {
    let bytes = format!("{{\"apiVersion\":1,\"document\":{DOCUMENT}}}");
    KernelSession::create(decode_create_request(bytes.as_bytes()).unwrap())
        .unwrap()
        .session
}
fn batch(children: &str) -> String {
    format!(
        r#"{{"commandVersion":1,"commandId":"core.transaction.batch","target":{{"kind":"document","documentId":"score"}},"payload":{{"commands":[{children}]}}}}"#
    )
}
fn submit3(session: &mut KernelSession, command: &str) -> KernelStage3SubmitResultV1 {
    session.submit_stage3_bytes(format!("{{\"apiVersion\":1,\"command\":{command}}}").as_bytes())
}
fn submit4(session: &mut KernelSession, command: &str) -> KernelStage4CommandResultV1 {
    let result = session.operate_stage4_bytes(
        format!("{{\"apiVersion\":1,\"operation\":{{\"kind\":\"submit\",\"command\":{command}}}}}")
            .as_bytes(),
    );
    let KernelStage4OperationResultV1::Command(result) = result else {
        panic!("command result")
    };
    result
}

#[test]
fn raw_repaired_batch_is_identical_across_stage3_stage4_replay_and_history() {
    let command = batch(&format!("{METADATA},{INSERT},{REMOVE}"));
    let mut stage3 = session();
    let mut stage4 = session();
    let initial = stage3.runtime.read_state().unwrap().snapshot.document;
    let result3 = submit3(&mut stage3, &command);
    let result4 = submit4(&mut stage4, &command);
    assert_eq!(result3, stage4_command_result_to_stage3(result4.clone()));
    let KernelStage4CommandResultV1::Committed { value, .. } = result4 else {
        panic!("raw repaired batch commits")
    };
    assert_eq!(value.document_version.get(), 1);
    assert_eq!(value.history.undo_depth, 1);
    assert!(value.dirty);
    let final_document = stage4.runtime.read_state().unwrap().snapshot.document;
    assert_eq!(final_document.parts, initial.parts);
    assert_eq!(final_document.metadata.title, "Prefix");
    assert_eq!(
        stage3.runtime.read_state().unwrap().snapshot.document,
        final_document
    );
    let replay = KernelSession::replay_stage4_bytes(
        format!("{{\"apiVersion\":1,\"initialDocument\":{DOCUMENT},\"commands\":[{command}]}}")
            .as_bytes(),
    );
    let KernelStage4ReplayResultV1::Replayed {
        final_document: replayed,
        document_version,
        results,
    } = replay
    else {
        panic!("replay commits")
    };
    assert_eq!(replayed, final_document);
    assert_eq!(document_version.get(), 1);
    assert_eq!(results[0].history.undo_depth, 1);
    for (kind, expected) in [("undo", &initial), ("redo", &final_document)] {
        let result = stage4.operate_stage4_bytes(
            format!("{{\"apiVersion\":1,\"operation\":{{\"kind\":\"{kind}\"}}}}").as_bytes(),
        );
        let KernelStage4OperationResultV1::Command(KernelStage4CommandResultV1::Committed {
            value,
            ..
        }) = result
        else {
            panic!("{kind} commits")
        };
        assert_eq!(
            stage4.runtime.read_state().unwrap().snapshot.document,
            *expected
        );
        assert_eq!(value.history.undo_depth, u64::from(kind == "redo"));
        assert_eq!(value.dirty, kind == "redo");
    }
}

#[test]
fn candidate_child_failure_is_indexed_but_final_semantics_is_whole_batch() {
    let mut session = session();
    let initial = session.runtime.read_state().unwrap().snapshot.document;
    let bad_child = batch(&format!("{METADATA},{INSERT},{MISSING}"));
    let KernelStage4CommandResultV1::Rejected { failure, .. } = submit4(&mut session, &bad_child)
    else {
        panic!("child rejected")
    };
    assert!(matches!(
        failure,
        KernelStage4FailureV1::Command(KernelStage3CommandFailureV1::BatchChildRejected {
            failed_command_index: 2,
            failure: Leaf::TargetNotFound
        })
    ));
    assert_eq!(session.runtime.document_version().get(), 0);
    assert_eq!(
        session.runtime.read_state().unwrap().snapshot.document,
        initial
    );
    let bad_final = batch(&format!("{METADATA},{INSERT}"));
    let KernelStage4CommandResultV1::Rejected { failure, .. } = submit4(&mut session, &bad_final)
    else {
        panic!("final rejected")
    };
    assert!(matches!(
        failure,
        KernelStage4FailureV1::Command(KernelStage3CommandFailureV1::Leaf(
            Leaf::SemanticInvalid { .. }
        ))
    ));
    assert_eq!(session.runtime.document_version().get(), 0);
    assert_eq!(
        session.runtime.read_state().unwrap().snapshot.document,
        initial
    );
}

#[test]
fn replay_keeps_prior_commits_and_reports_outer_index_of_failed_raw_batch() {
    let repaired = batch(&format!("{METADATA},{INSERT},{REMOVE}"));
    let rejected = batch(&format!("{INSERT},{MISSING}"));
    let bytes = format!(
        "{{\"apiVersion\":1,\"initialDocument\":{DOCUMENT},\"commands\":[{repaired},{rejected},{METADATA}]}}"
    );
    let KernelStage4ReplayResultV1::Rejected {
        document_version,
        final_document,
        results,
        failed_command_index,
        failure,
    } = KernelSession::replay_stage4_bytes(bytes.as_bytes())
    else {
        panic!("replay stops")
    };
    assert_eq!(document_version.get(), 1);
    assert_eq!(failed_command_index, 1);
    assert_eq!(results.len(), 2);
    assert_eq!(results[0].status, "committed");
    assert_eq!(results[1].status, "command-rejected");
    assert_eq!(results[1].history.undo_depth, 1);
    assert_eq!(final_document.metadata.title, "Prefix");
    assert_eq!(final_document.parts.len(), 1);
    assert!(matches!(
        failure,
        KernelStage4FailureV1::Command(KernelStage3CommandFailureV1::BatchChildRejected {
            failed_command_index: 1,
            failure: Leaf::TargetNotFound
        })
    ));
}
