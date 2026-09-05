use brilliant_kernel_contracts::{
    CoreCommandEnvelopeV1, KernelStage3CommandFailureLeafV1, ScoreEntityTargetV1,
};
use brilliant_kernel_runtime::KernelStage3TransactionV1;

pub(crate) fn dispatch(
    transaction: &mut KernelStage3TransactionV1<'_>,
    command: CoreCommandEnvelopeV1,
) -> Result<(), KernelStage3CommandFailureLeafV1> {
    match command {
        CoreCommandEnvelopeV1::MeasureInsert {
            target: ScoreEntityTargetV1::Document { document_id },
            anchor,
            definition,
            contents,
        } => transaction.insert_measure(document_id, anchor, definition, contents),
        CoreCommandEnvelopeV1::MeasureRemove {
            target: ScoreEntityTargetV1::Measure { measure_id },
        } => transaction.remove_measure(measure_id),
        CoreCommandEnvelopeV1::MeasureMove {
            target: ScoreEntityTargetV1::Measure { measure_id },
            anchor,
        } => transaction.move_measure(measure_id, anchor),
        CoreCommandEnvelopeV1::MeasureSetDefinition {
            target: ScoreEntityTargetV1::Measure { measure_id },
            meter,
            pickup,
        } => transaction.set_measure_definition(measure_id, meter, pickup),
        CoreCommandEnvelopeV1::MeasureInsert { .. }
        | CoreCommandEnvelopeV1::MeasureRemove { .. }
        | CoreCommandEnvelopeV1::MeasureMove { .. }
        | CoreCommandEnvelopeV1::MeasureSetDefinition { .. } => {
            Err(KernelStage3CommandFailureLeafV1::TargetMismatch)
        }
        _ => Err(KernelStage3CommandFailureLeafV1::InternalError),
    }
}

#[cfg(test)]
mod tests {
    use brilliant_kernel_contracts::{
        KernelReadStateV1, KernelSessionReadResultV1, KernelStage3CommandFailureLeafV1,
        KernelStage3CommandFailureV1, KernelStage3SubmitRequestV1, KernelStage3SubmitResultV1,
        ScoreEntityTargetV1, decode_create_request, decode_stage3_submit_request,
        encode_read_result,
    };

    use crate::KernelSession;

    const MEASURE_REQUEST: &str = r#"{"apiVersion":1,"document":{"schemaVersion":"brilliant-score-1","id":"score-measure","metadata":{"title":"Measure","authors":["Brilliant"],"tempo":{"bpm":108}},"measureDefinitions":[{"id":"m1","meter":{"numerator":4,"denominator":4}},{"id":"m2","meter":{"numerator":4,"denominator":4}}],"parts":[{"id":"pa","name":"A","instrument":{"name":"Piano","writtenToSounding":{"diatonicSteps":0,"chromaticSemitones":0}},"staves":[{"id":"sa","lineCount":5,"defaultClef":{"sign":"G","line":2}}],"measureContents":[{"measureId":"m1","voices":[{"id":"va1","defaultStaffId":"sa","sequence":{"start":{"numerator":0,"denominator":1},"events":[{"id":"ea1","duration":{"base":4,"dots":0},"content":{"kind":"rest"}}]}}]},{"measureId":"m2","voices":[{"id":"va2","defaultStaffId":"sa","sequence":{"start":{"numerator":0,"denominator":1},"events":[{"id":"ea2","duration":{"base":4,"dots":0},"content":{"kind":"rest"}}]}}]}]},{"id":"pb","name":"B","instrument":{"name":"Piano","writtenToSounding":{"diatonicSteps":0,"chromaticSemitones":0}},"staves":[{"id":"sb","lineCount":5,"defaultClef":{"sign":"G","line":2}}],"measureContents":[{"measureId":"m2","voices":[{"id":"vb2","defaultStaffId":"sb","sequence":{"start":{"numerator":0,"denominator":1},"events":[{"id":"eb2","duration":{"base":4,"dots":0},"content":{"kind":"rest"}}]}}]},{"measureId":"m1","voices":[{"id":"vb1","defaultStaffId":"sb","sequence":{"start":{"numerator":0,"denominator":1},"events":[{"id":"eb1","duration":{"base":4,"dots":0},"content":{"kind":"rest"}}]}}]}]}],"extensions":[]}}"#;

    fn session() -> KernelSession {
        KernelSession::create(
            decode_create_request(MEASURE_REQUEST.as_bytes()).expect("measure request"),
        )
        .expect("measure session")
        .session
    }

    fn command(value: &str) -> KernelStage3SubmitRequestV1 {
        decode_stage3_submit_request(value.as_bytes()).expect("measure command")
    }

    fn submit(session: &mut KernelSession, value: &str) -> KernelStage3SubmitResultV1 {
        session.submit_stage3(command(value))
    }

    fn read(session: &KernelSession) -> Box<KernelReadStateV1> {
        let KernelSessionReadResultV1::Ok(state) = session.read_state() else {
            panic!("measure read must succeed");
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

    fn assert_zero_global_work(result: &KernelStage3SubmitResultV1) {
        let metrics = match result {
            KernelStage3SubmitResultV1::Committed(value) => value.metrics,
            KernelStage3SubmitResultV1::NoOp(value) => value.metrics,
            KernelStage3SubmitResultV1::CommandRejected { value, .. } => value.metrics,
            KernelStage3SubmitResultV1::Rejected(_) => panic!("unexpected boundary rejection"),
        };
        assert_eq!(metrics.full_document_scans, 0);
        assert_eq!(metrics.full_document_clones, 0);
        assert_eq!(metrics.full_semantic_validations, 0);
        assert_eq!(metrics.full_snapshot_materializations, 0);
    }

    #[test]
    fn measure_aggregate_commands_normalize_move_remove_and_replace_definition() {
        let mut session = session();
        let insert = r#"{"apiVersion":1,"command":{"commandVersion":1,"commandId":"core.measure.insert","target":{"kind":"document","documentId":"score-measure"},"payload":{"anchor":{"kind":"after-measure","measureId":"m1"},"definition":{"id":"mx","meter":{"numerator":3,"denominator":4}},"contents":[{"partId":"pb","voices":[{"id":"vbx","defaultStaffId":"sb","sequence":{"start":{"numerator":0,"denominator":1},"events":[{"id":"ebx","duration":{"base":4,"dots":0},"content":{"kind":"rest"}}]}}]},{"partId":"pa","voices":[{"id":"vax","defaultStaffId":"sa","sequence":{"start":{"numerator":0,"denominator":1},"events":[{"id":"eax","duration":{"base":4,"dots":0},"content":{"kind":"rest"}}]}}]}]}}}"#;
        let inserted = submit(&mut session, insert);
        assert_zero_global_work(&inserted);
        let KernelStage3SubmitResultV1::Committed(value) = inserted else {
            panic!("measure insert must commit");
        };
        assert_eq!(value.document_version.get(), 1);
        assert_eq!(
            value.affected.iter().map(target_key).collect::<Vec<_>>(),
            [
                ("document", "score-measure"),
                ("measure", "mx"),
                ("part", "pa"),
                ("voice", "vax"),
                ("event", "eax"),
                ("part", "pb"),
                ("voice", "vbx"),
                ("event", "ebx"),
            ]
        );
        let state = read(&session);
        assert_eq!(
            state
                .snapshot
                .document
                .measure_definitions
                .iter()
                .map(|measure| measure.id.as_str())
                .collect::<Vec<_>>(),
            ["m1", "mx", "m2"]
        );
        for part in &state.snapshot.document.parts {
            assert_eq!(
                part.measure_contents
                    .iter()
                    .map(|content| content.measure_id.as_str())
                    .collect::<Vec<_>>(),
                ["m1", "mx", "m2"]
            );
        }

        let move_first = r#"{"apiVersion":1,"command":{"commandVersion":1,"commandId":"core.measure.move","target":{"kind":"measure","measureId":"m2"},"payload":{"anchor":{"kind":"start"}}}}"#;
        let moved = submit(&mut session, move_first);
        assert_zero_global_work(&moved);
        let KernelStage3SubmitResultV1::Committed(value) = moved else {
            panic!("measure move must commit");
        };
        assert_eq!(value.document_version.get(), 2);
        assert_eq!(
            value.affected.iter().map(target_key).collect::<Vec<_>>(),
            [("measure", "m2"), ("part", "pa"), ("part", "pb")]
        );
        let state = read(&session);
        for part in &state.snapshot.document.parts {
            assert_eq!(
                part.measure_contents
                    .iter()
                    .map(|content| content.measure_id.as_str())
                    .collect::<Vec<_>>(),
                ["m2", "m1", "mx"]
            );
        }

        let no_op = submit(&mut session, move_first);
        assert!(matches!(
            no_op,
            KernelStage3SubmitResultV1::NoOp(value) if value.document_version.get() == 2
        ));
        assert_zero_global_work(&no_op);

        let definition = r#"{"apiVersion":1,"command":{"commandVersion":1,"commandId":"core.measure.set-definition","target":{"kind":"measure","measureId":"mx"},"payload":{"meter":{"numerator":6,"denominator":8},"pickup":{"kind":"duration","duration":{"numerator":1,"denominator":4}}}}}"#;
        let replaced = submit(&mut session, definition);
        assert!(matches!(
            replaced,
            KernelStage3SubmitResultV1::Committed(value)
                if value.document_version.get() == 3
                    && value.affected.iter().map(target_key).collect::<Vec<_>>()
                        == [("measure", "mx")]
        ));
        let definition_no_op = submit(&mut session, definition);
        assert!(matches!(
            definition_no_op,
            KernelStage3SubmitResultV1::NoOp(value) if value.document_version.get() == 3
        ));

        let remove = r#"{"apiVersion":1,"command":{"commandVersion":1,"commandId":"core.measure.remove","target":{"kind":"measure","measureId":"mx"},"payload":{}}}"#;
        let removed = submit(&mut session, remove);
        assert_zero_global_work(&removed);
        let KernelStage3SubmitResultV1::Committed(value) = removed else {
            panic!("measure remove must commit");
        };
        assert_eq!(value.document_version.get(), 4);
        assert_eq!(
            value.affected.iter().map(target_key).collect::<Vec<_>>(),
            [
                ("measure", "mx"),
                ("part", "pa"),
                ("voice", "vax"),
                ("event", "eax"),
                ("part", "pb"),
                ("voice", "vbx"),
                ("event", "ebx"),
            ]
        );
        let state = read(&session);
        assert_eq!(state.snapshot.document_version.get(), 4);
        assert_eq!(
            state
                .snapshot
                .document
                .measure_definitions
                .iter()
                .map(|measure| measure.id.as_str())
                .collect::<Vec<_>>(),
            ["m2", "m1"]
        );
        for part in &state.snapshot.document.parts {
            assert_eq!(
                part.measure_contents
                    .iter()
                    .map(|content| content.measure_id.as_str())
                    .collect::<Vec<_>>(),
                ["m2", "m1"]
            );
        }
    }

    #[test]
    fn measure_failure_priority_and_coverage_rejections_are_zero_delta() {
        let mut session = session();
        let baseline = encode_read_result(&session.read_state()).expect("baseline");

        let self_anchor = r#"{"apiVersion":1,"command":{"commandVersion":1,"commandId":"core.measure.move","target":{"kind":"measure","measureId":"m1"},"payload":{"anchor":{"kind":"after-measure","measureId":"m1"}}}}"#;
        let KernelStage3SubmitResultV1::CommandRejected {
            failure: KernelStage3CommandFailureV1::Leaf(failure),
            ..
        } = submit(&mut session, self_anchor)
        else {
            panic!("self anchor must reject");
        };
        assert_eq!(
            failure,
            KernelStage3CommandFailureLeafV1::AnchorSelfReference
        );

        let missing_anchor = r#"{"apiVersion":1,"command":{"commandVersion":1,"commandId":"core.measure.move","target":{"kind":"measure","measureId":"m1"},"payload":{"anchor":{"kind":"after-measure","measureId":"missing"}}}}"#;
        let KernelStage3SubmitResultV1::CommandRejected {
            failure: KernelStage3CommandFailureV1::Leaf(failure),
            ..
        } = submit(&mut session, missing_anchor)
        else {
            panic!("missing anchor must reject");
        };
        assert_eq!(failure, KernelStage3CommandFailureLeafV1::AnchorNotFound);

        let missing_target = r#"{"apiVersion":1,"command":{"commandVersion":1,"commandId":"core.measure.remove","target":{"kind":"measure","measureId":"missing"},"payload":{}}}"#;
        let KernelStage3SubmitResultV1::CommandRejected {
            failure: KernelStage3CommandFailureV1::Leaf(failure),
            ..
        } = submit(&mut session, missing_target)
        else {
            panic!("missing target must reject");
        };
        assert_eq!(failure, KernelStage3CommandFailureLeafV1::TargetNotFound);

        let bad_coverage = r#"{"apiVersion":1,"command":{"commandVersion":1,"commandId":"core.measure.insert","target":{"kind":"document","documentId":"score-measure"},"payload":{"anchor":{"kind":"start"},"definition":{"id":"mx","meter":{"numerator":4,"denominator":4}},"contents":[{"partId":"pa","voices":[{"id":"vax","defaultStaffId":"sa","sequence":{"start":{"numerator":0,"denominator":1},"events":[{"id":"eax","duration":{"base":4,"dots":0},"content":{"kind":"rest"}}]}}]}]}}}"#;
        let KernelStage3SubmitResultV1::CommandRejected {
            value,
            failure: KernelStage3CommandFailureV1::Leaf(failure),
        } = submit(&mut session, bad_coverage)
        else {
            panic!("incomplete coverage must reject");
        };
        assert_eq!(
            failure,
            KernelStage3CommandFailureLeafV1::LocalInvariantRejected
        );
        assert_eq!(value.document_version.get(), 0);
        assert_zero_global_work(&KernelStage3SubmitResultV1::CommandRejected {
            value,
            failure: failure.into(),
        });
        assert_eq!(
            encode_read_result(&session.read_state()).expect("unchanged"),
            baseline
        );

        let cross_kind_duplicate = r#"{"apiVersion":1,"command":{"commandVersion":1,"commandId":"core.measure.insert","target":{"kind":"document","documentId":"score-measure"},"payload":{"anchor":{"kind":"start"},"definition":{"id":"pa","meter":{"numerator":4,"denominator":4}},"contents":[{"partId":"pa","voices":[{"id":"duplicate-va","defaultStaffId":"sa","sequence":{"start":{"numerator":0,"denominator":1},"events":[{"id":"duplicate-ea","duration":{"base":4,"dots":0},"content":{"kind":"rest"}}]}}]},{"partId":"pb","voices":[{"id":"duplicate-vb","defaultStaffId":"sb","sequence":{"start":{"numerator":0,"denominator":1},"events":[{"id":"duplicate-eb","duration":{"base":4,"dots":0},"content":{"kind":"rest"}}]}}]}]}}}"#;
        let KernelStage3SubmitResultV1::CommandRejected {
            value,
            failure: KernelStage3CommandFailureV1::Leaf(failure),
        } = submit(&mut session, cross_kind_duplicate)
        else {
            panic!("cross-kind duplicate id must reject");
        };
        assert_eq!(
            failure,
            KernelStage3CommandFailureLeafV1::LocalInvariantRejected
        );
        assert_eq!(value.document_version.get(), 0);
        assert_eq!(
            encode_read_result(&session.read_state()).expect("unchanged"),
            baseline
        );
    }

    #[test]
    fn final_measure_removal_returns_semantic_diagnostics_and_is_zero_delta() {
        let mut session = session();
        let remove_second = r#"{"apiVersion":1,"command":{"commandVersion":1,"commandId":"core.measure.remove","target":{"kind":"measure","measureId":"m2"},"payload":{}}}"#;
        assert!(matches!(
            submit(&mut session, remove_second),
            KernelStage3SubmitResultV1::Committed(value) if value.document_version.get() == 1
        ));
        let baseline = encode_read_result(&session.read_state()).expect("single measure baseline");

        let remove_final = r#"{"apiVersion":1,"command":{"commandVersion":1,"commandId":"core.measure.remove","target":{"kind":"measure","measureId":"m1"},"payload":{}}}"#;
        let KernelStage3SubmitResultV1::CommandRejected {
            value,
            failure: KernelStage3CommandFailureV1::Leaf(failure),
        } = submit(&mut session, remove_final)
        else {
            panic!("final measure removal must reject");
        };
        assert_eq!(
            failure,
            crate::commands::semantic_test_failure("semantic.measure-required")
        );
        assert_eq!(value.document_version.get(), 1);
        assert_zero_global_work(&KernelStage3SubmitResultV1::CommandRejected {
            value,
            failure: failure.into(),
        });
        assert_eq!(
            encode_read_result(&session.read_state()).expect("unchanged"),
            baseline
        );
    }
}
