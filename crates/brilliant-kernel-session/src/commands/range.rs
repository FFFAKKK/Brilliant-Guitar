use brilliant_kernel_contracts::{
    CoreCommandEnvelopeV1, KernelStage3CommandFailureLeafV1, ScoreEntityTargetV1,
};
use brilliant_kernel_runtime::KernelStage3TransactionV1;

pub(crate) fn dispatch(
    transaction: &mut KernelStage3TransactionV1<'_>,
    command: CoreCommandEnvelopeV1,
) -> Result<(), KernelStage3CommandFailureLeafV1> {
    match command {
        CoreCommandEnvelopeV1::RangeDelete {
            target: ScoreEntityTargetV1::Document { document_id },
            range,
        } => transaction.delete_range(document_id, range),
        CoreCommandEnvelopeV1::RangeTransposeWrittenPitch {
            target: ScoreEntityTargetV1::Document { document_id },
            range,
            transposition,
        } => transaction.transpose_range_written_pitch(document_id, range, transposition),
        CoreCommandEnvelopeV1::RangeDelete { .. }
        | CoreCommandEnvelopeV1::RangeTransposeWrittenPitch { .. } => {
            Err(KernelStage3CommandFailureLeafV1::TargetMismatch)
        }
        _ => Err(KernelStage3CommandFailureLeafV1::InternalError),
    }
}

#[cfg(test)]
mod tests {
    use crate::KernelSession;
    use brilliant_kernel_contracts::{
        KernelReadStateV1, KernelSessionReadResultV1, KernelStage3CommandFailureLeafV1,
        KernelStage3CommandFailureV1, KernelStage3MetricsV1, KernelStage3SubmitRequestV1,
        KernelStage3SubmitResultV1, PitchTranspositionErrorV1, ScoreEntityTargetV1,
        decode_create_request, decode_stage3_submit_request, encode_read_result,
    };

    const RANGE_REQUEST: &str = r#"{"apiVersion":1,"document":{"schemaVersion":"brilliant-score-1","id":"score-range","metadata":{"title":"Range","authors":["Brilliant"],"tempo":{"bpm":112}},"measureDefinitions":[{"id":"m1","meter":{"numerator":4,"denominator":4}},{"id":"m2","meter":{"numerator":4,"denominator":4}},{"id":"m3","meter":{"numerator":4,"denominator":4}}],"parts":[{"id":"pa","name":"A","instrument":{"name":"Piano","writtenToSounding":{"diatonicSteps":0,"chromaticSemitones":0}},"staves":[{"id":"sa","lineCount":5,"defaultClef":{"sign":"G","line":2}}],"measureContents":[{"measureId":"m1","voices":[{"id":"va1","defaultStaffId":"sa","sequence":{"start":{"numerator":0,"denominator":1},"events":[{"id":"ea1","duration":{"base":4,"dots":0},"content":{"kind":"rest"}},{"id":"ea2","duration":{"base":4,"dots":0},"content":{"kind":"notes","notes":[{"id":"n1","writtenPitch":{"step":"C","alter":0,"octave":4}},{"id":"n2","writtenPitch":{"step":"E","alter":0,"octave":4}}]}}]}}]},{"measureId":"m2","voices":[{"id":"va2","defaultStaffId":"sa","sequence":{"start":{"numerator":0,"denominator":1},"events":[{"id":"ea3","duration":{"base":4,"dots":0},"content":{"kind":"notes","notes":[{"id":"n3","writtenPitch":{"step":"G","alter":0,"octave":4}}]}}]}}]},{"measureId":"m3","voices":[{"id":"va3","defaultStaffId":"sa","sequence":{"start":{"numerator":0,"denominator":1},"events":[]}}]}]},{"id":"pb","name":"B","instrument":{"name":"Piano","writtenToSounding":{"diatonicSteps":0,"chromaticSemitones":0}},"staves":[{"id":"sb","lineCount":5,"defaultClef":{"sign":"G","line":2}}],"measureContents":[{"measureId":"m1","voices":[{"id":"vb1","defaultStaffId":"sb","sequence":{"start":{"numerator":0,"denominator":1},"events":[{"id":"eb1","duration":{"base":4,"dots":0},"content":{"kind":"notes","notes":[{"id":"nb1","writtenPitch":{"step":"D","alter":0,"octave":4}}]}}]}}]},{"measureId":"m2","voices":[{"id":"vb2","defaultStaffId":"sb","sequence":{"start":{"numerator":0,"denominator":1},"events":[{"id":"eb2","duration":{"base":4,"dots":0},"content":{"kind":"rest"}}]}}]},{"measureId":"m3","voices":[{"id":"vb3","defaultStaffId":"sb","sequence":{"start":{"numerator":0,"denominator":1},"events":[{"id":"eb3","duration":{"base":4,"dots":0},"content":{"kind":"notes","notes":[{"id":"nb3","writtenPitch":{"step":"B","alter":0,"octave":8}}]}}]}}]}]}],"extensions":[]}}"#;

    fn session() -> KernelSession {
        KernelSession::create(
            decode_create_request(RANGE_REQUEST.as_bytes()).expect("range fixture"),
        )
        .expect("range session")
        .session
    }

    fn submit(session: &mut KernelSession, request: &str) -> KernelStage3SubmitResultV1 {
        let request: KernelStage3SubmitRequestV1 =
            decode_stage3_submit_request(request.as_bytes()).expect("stage-three range command");
        session.submit_stage3(request)
    }

    fn submit_command(session: &mut KernelSession, command: &str) -> KernelStage3SubmitResultV1 {
        submit(
            session,
            &format!(r#"{{"apiVersion":1,"command":{command}}}"#),
        )
    }

    fn batch(children: &[String]) -> String {
        format!(
            r#"{{"commandVersion":1,"commandId":"core.transaction.batch","target":{{"kind":"document","documentId":"score-range"}},"payload":{{"commands":[{}]}}}}"#,
            children.join(",")
        )
    }

    fn metadata_child(title: &str) -> String {
        format!(
            r#"{{"commandVersion":1,"commandId":"core.document.set-metadata","target":{{"kind":"document","documentId":"score-range"}},"payload":{{"metadata":{{"title":"{title}","authors":["Brilliant"],"tempo":{{"bpm":112}}}}}}}}"#
        )
    }

    fn read(session: &KernelSession) -> Box<KernelReadStateV1> {
        let KernelSessionReadResultV1::Ok(state) = session.read_state() else {
            panic!("range state must be readable");
        };
        state
    }

    fn target_key(target: &ScoreEntityTargetV1) -> (&'static str, &str) {
        match target {
            ScoreEntityTargetV1::Document { document_id } => ("document", document_id.as_str()),
            ScoreEntityTargetV1::Measure { measure_id } => ("measure", measure_id.as_str()),
            ScoreEntityTargetV1::Part { part_id } => ("part", part_id.as_str()),
            ScoreEntityTargetV1::Staff { staff_id } => ("staff", staff_id.as_str()),
            ScoreEntityTargetV1::Voice { voice_id } => ("voice", voice_id.as_str()),
            ScoreEntityTargetV1::Event { event_id } => ("event", event_id.as_str()),
            ScoreEntityTargetV1::Note { note_id } => ("note", note_id.as_str()),
        }
    }

    fn assert_zero_global_work(metrics: &KernelStage3MetricsV1) {
        assert_eq!(metrics.full_document_scans, 0);
        assert_eq!(metrics.full_document_clones, 0);
        assert_eq!(metrics.full_semantic_validations, 0);
        assert_eq!(metrics.full_snapshot_materializations, 0);
    }

    #[test]
    fn range_transpose_is_ordered_reversible_on_failure_and_zero_is_no_op() {
        let mut session = session();
        let zero = r#"{"apiVersion":1,"command":{"commandVersion":1,"commandId":"core.range.transpose-written-pitch","target":{"kind":"document","documentId":"score-range"},"payload":{"range":{"kind":"voice-event-range","start":{"kind":"voice-event","voiceId":"va1","eventId":"ea2"},"end":{"kind":"voice-event","voiceId":"va1","eventId":"ea1"}},"transposition":{"diatonicSteps":0,"chromaticSemitones":0}}}}"#;
        assert!(matches!(
            submit(&mut session, zero),
            KernelStage3SubmitResultV1::NoOp(value) if value.document_version.get() == 0
        ));

        let transpose = r#"{"apiVersion":1,"command":{"commandVersion":1,"commandId":"core.range.transpose-written-pitch","target":{"kind":"document","documentId":"score-range"},"payload":{"range":{"kind":"voice-event-range","start":{"kind":"voice-event","voiceId":"va1","eventId":"ea2"},"end":{"kind":"voice-event","voiceId":"va1","eventId":"ea1"}},"transposition":{"diatonicSteps":1,"chromaticSemitones":2}}}}"#;
        let KernelStage3SubmitResultV1::Committed(value) = submit(&mut session, transpose) else {
            panic!("range transpose must commit");
        };
        assert_eq!(value.document_version.get(), 1);
        assert_zero_global_work(&value.metrics);
        assert_eq!(
            value.affected.iter().map(target_key).collect::<Vec<_>>(),
            [("note", "n1"), ("note", "n2")]
        );
        let encoded = String::from_utf8(
            encode_read_result(&session.read_state()).expect("transposed range read"),
        )
        .expect("UTF-8 range read");
        assert!(encoded.contains(r#""id":"n1","writtenPitch":{"step":"D","alter":0,"octave":4}"#));

        let before = encode_read_result(&session.read_state()).expect("before failed transpose");
        let invalid = r#"{"apiVersion":1,"command":{"commandVersion":1,"commandId":"core.range.transpose-written-pitch","target":{"kind":"document","documentId":"score-range"},"payload":{"range":{"kind":"measure-range","start":{"kind":"measure","measureId":"m1"},"end":{"kind":"measure","measureId":"m3"}},"transposition":{"diatonicSteps":1,"chromaticSemitones":2}}}}"#;
        let KernelStage3SubmitResultV1::CommandRejected {
            failure:
                KernelStage3CommandFailureV1::Leaf(
                    KernelStage3CommandFailureLeafV1::RangeTransformInvalid { address, reason },
                ),
            ..
        } = submit(&mut session, invalid)
        else {
            panic!("first invalid transformed note must reject");
        };
        assert_zero_global_work(&value.metrics);
        assert!(matches!(
            address,
            brilliant_kernel_contracts::NoteAddressV1::Note { note_id }
                if note_id.as_str() == "nb3"
        ));
        assert_eq!(
            reason,
            PitchTranspositionErrorV1::DerivedPitchOctaveOutOfRange
        );
        assert_eq!(
            encode_read_result(&session.read_state()).expect("after failed transpose"),
            before
        );
    }

    #[test]
    fn range_delete_normalizes_reversed_bounds_and_rejects_an_empty_document() {
        let mut measure_session = session();
        let delete_measures = r#"{"apiVersion":1,"command":{"commandVersion":1,"commandId":"core.range.delete","target":{"kind":"document","documentId":"score-range"},"payload":{"range":{"kind":"measure-range","start":{"kind":"measure","measureId":"m3"},"end":{"kind":"measure","measureId":"m2"}}}}}"#;
        let KernelStage3SubmitResultV1::Committed(value) =
            submit(&mut measure_session, delete_measures)
        else {
            panic!("reversed measure range must commit");
        };
        assert!(matches!(
            value.affected.first(),
            Some(ScoreEntityTargetV1::Measure { measure_id }) if measure_id.as_str() == "m2"
        ));
        let after = read(&measure_session).snapshot.document.clone();
        assert_eq!(
            after
                .measure_definitions
                .iter()
                .map(|measure| measure.id.as_str())
                .collect::<Vec<_>>(),
            ["m1"]
        );
        assert!(after.parts.iter().all(|part| {
            part.measure_contents
                .iter()
                .map(|content| content.measure_id.as_str())
                .eq(["m1"])
        }));

        let mut empty_content_session = session();
        let empty_content = r#"{"apiVersion":1,"command":{"commandVersion":1,"commandId":"core.range.delete","target":{"kind":"document","documentId":"score-range"},"payload":{"range":{"kind":"part-measure-range","start":{"kind":"part-measure","partId":"pa","measureId":"m3"},"end":{"kind":"part-measure","partId":"pa","measureId":"m3"}}}}}"#;
        assert!(matches!(
            submit(&mut empty_content_session, empty_content),
            KernelStage3SubmitResultV1::NoOp(value) if value.document_version.get() == 0
        ));

        let mut all_session = session();
        let before = encode_read_result(&all_session.read_state()).expect("before all delete");
        let delete_all = r#"{"apiVersion":1,"command":{"commandVersion":1,"commandId":"core.range.delete","target":{"kind":"document","documentId":"score-range"},"payload":{"range":{"kind":"measure-range","start":{"kind":"measure","measureId":"m1"},"end":{"kind":"measure","measureId":"m3"}}}}}"#;
        assert!(matches!(
            submit(&mut all_session, delete_all),
            KernelStage3SubmitResultV1::CommandRejected {
                failure: KernelStage3CommandFailureV1::Leaf(
                    KernelStage3CommandFailureLeafV1::LocalInvariantRejected
                ),
                ..
            }
        ));
        assert_eq!(
            encode_read_result(&all_session.read_state()).expect("after all delete"),
            before
        );
    }

    #[test]
    fn range_endpoint_and_owner_failures_are_deterministic_and_zero_delta() {
        let cases = [
            (
                r#"{"apiVersion":1,"command":{"commandVersion":1,"commandId":"core.range.delete","target":{"kind":"document","documentId":"score-range"},"payload":{"range":{"kind":"measure-range","start":{"kind":"measure","measureId":"missing"},"end":{"kind":"measure","measureId":"m1"}}}}}"#,
                KernelStage3CommandFailureLeafV1::RangeEndpointNotFound,
            ),
            (
                r#"{"apiVersion":1,"command":{"commandVersion":1,"commandId":"core.range.delete","target":{"kind":"document","documentId":"score-range"},"payload":{"range":{"kind":"part-measure-range","start":{"kind":"part-measure","partId":"pa","measureId":"m1"},"end":{"kind":"part-measure","partId":"pb","measureId":"m2"}}}}}"#,
                KernelStage3CommandFailureLeafV1::RangeOwnerMismatch,
            ),
            (
                r#"{"apiVersion":1,"command":{"commandVersion":1,"commandId":"core.range.delete","target":{"kind":"document","documentId":"score-range"},"payload":{"range":{"kind":"voice-event-range","start":{"kind":"voice-event","voiceId":"va1","eventId":"eb1"},"end":{"kind":"voice-event","voiceId":"va1","eventId":"missing"}}}}}"#,
                KernelStage3CommandFailureLeafV1::RangeEndpointNotFound,
            ),
            (
                r#"{"apiVersion":1,"command":{"commandVersion":1,"commandId":"core.range.delete","target":{"kind":"document","documentId":"missing-document"},"payload":{"range":{"kind":"measure-range","start":{"kind":"measure","measureId":"m1"},"end":{"kind":"measure","measureId":"m1"}}}}}"#,
                KernelStage3CommandFailureLeafV1::TargetNotFound,
            ),
        ];
        for (request, expected) in cases {
            let mut session = session();
            let before = encode_read_result(&session.read_state()).expect("before range rejection");
            let KernelStage3SubmitResultV1::CommandRejected {
                failure: KernelStage3CommandFailureV1::Leaf(actual),
                ..
            } = submit(&mut session, request)
            else {
                panic!("range case must reject");
            };
            assert_eq!(actual, expected);
            assert_eq!(
                encode_read_result(&session.read_state()).expect("after range rejection"),
                before
            );
        }
    }

    #[test]
    fn batch_is_sequential_atomic_segmented_and_attributes_the_lowest_child() {
        let mut batch_session = session();
        let before_document = read(&batch_session).snapshot.document.clone();
        let insert = r#"{"commandVersion":1,"commandId":"core.voice.insert-rest-event","target":{"kind":"voice","voiceId":"va1"},"payload":{"anchor":{"kind":"after-event","eventId":"ea2"},"event":{"id":"batch-event","duration":{"base":4,"dots":0},"content":{"kind":"rest"}}}}"#.to_owned();
        let remove = r#"{"commandVersion":1,"commandId":"core.event.remove","target":{"kind":"event","eventId":"batch-event"},"payload":{}}"#.to_owned();
        let KernelStage3SubmitResultV1::Committed(value) =
            submit_command(&mut batch_session, &batch(&[insert, remove]))
        else {
            panic!("insert-then-remove batch must commit");
        };
        assert_eq!(value.document_version.get(), 1);
        assert_zero_global_work(&value.metrics);
        assert_eq!(read(&batch_session).snapshot.document, before_document);
        assert_eq!(
            value.affected.iter().map(target_key).collect::<Vec<_>>(),
            [("voice", "va1"), ("event", "batch-event")]
        );

        let mut no_op_session = session();
        let no_ops = vec![metadata_child("Range"); 100];
        assert!(matches!(
            submit_command(&mut no_op_session, &batch(&no_ops)),
            KernelStage3SubmitResultV1::NoOp(value) if value.document_version.get() == 0
        ));

        let unknown = r#"{"commandVersion":1,"commandId":"core.unknown","target":{"kind":"document","documentId":"score-range"},"payload":{}}"#.to_owned();
        for failed_command_index in 0..3 {
            let mut rejected_session = session();
            let before = encode_read_result(&rejected_session.read_state()).expect("before batch");
            let mut children = vec![metadata_child("Must not leak"); 3];
            children[failed_command_index] = unknown.clone();
            assert!(matches!(
                submit_command(&mut rejected_session, &batch(&children)),
                KernelStage3SubmitResultV1::CommandRejected {
                    failure: KernelStage3CommandFailureV1::BatchChildRejected {
                        failed_command_index: actual,
                        failure: KernelStage3CommandFailureLeafV1::UnknownId,
                    },
                    ..
                } if actual == failed_command_index as u64
            ));
            assert_eq!(
                encode_read_result(&rejected_session.read_state()).expect("after batch"),
                before
            );
        }

        let mut rejected_session = session();
        let malformed_nested =
            r#"{"commandId":"core.transaction.batch","unrelated":true}"#.to_owned();
        assert!(matches!(
            submit_command(&mut rejected_session, &batch(&[malformed_nested])),
            KernelStage3SubmitResultV1::CommandRejected {
                failure: KernelStage3CommandFailureV1::BatchChildRejected {
                    failed_command_index: 0,
                    failure: KernelStage3CommandFailureLeafV1::BatchNested,
                },
                ..
            }
        ));
    }

    #[test]
    fn failed_final_batch_invariant_returns_attempt_metrics_and_is_zero_delta() {
        let mut session = session();
        let baseline = encode_read_result(&session.read_state()).expect("baseline");
        let delete_all = r#"{"commandVersion":1,"commandId":"core.range.delete","target":{"kind":"document","documentId":"score-range"},"payload":{"range":{"kind":"measure-range","start":{"kind":"measure","measureId":"m1"},"end":{"kind":"measure","measureId":"m3"}}}}"#.to_owned();

        let KernelStage3SubmitResultV1::CommandRejected {
            value,
            failure: KernelStage3CommandFailureV1::Leaf(failure),
        } = submit_command(&mut session, &batch(&[delete_all]))
        else {
            panic!("a batch ending with no measures must reject");
        };

        assert_eq!(
            failure,
            KernelStage3CommandFailureLeafV1::LocalInvariantRejected
        );
        assert_eq!(value.document_version.get(), 0);
        assert_zero_global_work(&value.metrics);
        assert!(value.metrics.change_ops > 0);
        assert!(value.metrics.changeset_logical_bytes > 0);
        assert_eq!(
            encode_read_result(&session.read_state()).expect("unchanged"),
            baseline
        );
    }

    #[test]
    fn batch_can_repair_a_temporarily_empty_measure_set_before_single_adoption() {
        let mut session = session();
        let delete_all = r#"{"commandVersion":1,"commandId":"core.range.delete","target":{"kind":"document","documentId":"score-range"},"payload":{"range":{"kind":"measure-range","start":{"kind":"measure","measureId":"m1"},"end":{"kind":"measure","measureId":"m3"}}}}"#.to_owned();
        let insert_replacement = r#"{"commandVersion":1,"commandId":"core.measure.insert","target":{"kind":"document","documentId":"score-range"},"payload":{"anchor":{"kind":"start"},"definition":{"id":"mx","meter":{"numerator":4,"denominator":4}},"contents":[{"partId":"pa","voices":[{"id":"vxa","defaultStaffId":"sa","sequence":{"start":{"numerator":0,"denominator":1},"events":[{"id":"exa","duration":{"base":1,"dots":0},"content":{"kind":"rest"}}]}}]},{"partId":"pb","voices":[{"id":"vxb","defaultStaffId":"sb","sequence":{"start":{"numerator":0,"denominator":1},"events":[{"id":"exb","duration":{"base":1,"dots":0},"content":{"kind":"rest"}}]}}]}]}}"#.to_owned();
        let KernelStage3SubmitResultV1::Committed(value) =
            submit_command(&mut session, &batch(&[delete_all, insert_replacement]))
        else {
            panic!("later batch child must repair the temporary local invariant");
        };
        assert_eq!(value.document_version.get(), 1);
        let document = read(&session).snapshot.document.clone();
        assert_eq!(
            document
                .measure_definitions
                .iter()
                .map(|measure| measure.id.as_str())
                .collect::<Vec<_>>(),
            ["mx"]
        );
        assert!(document.parts.iter().all(|part| {
            part.measure_contents
                .iter()
                .map(|content| content.measure_id.as_str())
                .eq(["mx"])
        }));
    }

    #[test]
    fn batch_range_sees_an_earlier_inserted_part_and_removes_its_measure_content() {
        let mut session = session();
        let insert_part = r#"{"commandVersion":1,"commandId":"core.part.insert","target":{"kind":"document","documentId":"score-range"},"payload":{"anchor":{"kind":"after-part","partId":"pb"},"part":{"id":"pc","name":"C","instrument":{"name":"Piano","writtenToSounding":{"diatonicSteps":0,"chromaticSemitones":0}},"staves":[{"id":"sc","lineCount":5,"defaultClef":{"sign":"G","line":2}}],"measureContents":[{"measureId":"m1","voices":[{"id":"vc1","defaultStaffId":"sc","sequence":{"start":{"numerator":0,"denominator":1},"events":[]}}]},{"measureId":"m2","voices":[{"id":"vc2","defaultStaffId":"sc","sequence":{"start":{"numerator":0,"denominator":1},"events":[]}}]},{"measureId":"m3","voices":[{"id":"vc3","defaultStaffId":"sc","sequence":{"start":{"numerator":0,"denominator":1},"events":[]}}]}]}}}"#.to_owned();
        let delete_middle = r#"{"commandVersion":1,"commandId":"core.range.delete","target":{"kind":"document","documentId":"score-range"},"payload":{"range":{"kind":"measure-range","start":{"kind":"measure","measureId":"m2"},"end":{"kind":"measure","measureId":"m2"}}}}"#.to_owned();
        let value = match submit_command(&mut session, &batch(&[insert_part, delete_middle])) {
            KernelStage3SubmitResultV1::Committed(value) => value,
            other => panic!("later range child must see the earlier inserted part: {other:?}"),
        };
        assert_eq!(value.document_version.get(), 1);
        assert_zero_global_work(&value.metrics);
        let document = read(&session).snapshot.document.clone();
        assert_eq!(
            document
                .measure_definitions
                .iter()
                .map(|measure| measure.id.as_str())
                .collect::<Vec<_>>(),
            ["m1", "m3"]
        );
        let part = document
            .parts
            .iter()
            .find(|part| part.id.as_str() == "pc")
            .expect("inserted part");
        assert_eq!(
            part.measure_contents
                .iter()
                .map(|content| content.measure_id.as_str())
                .collect::<Vec<_>>(),
            ["m1", "m3"]
        );
    }
}
