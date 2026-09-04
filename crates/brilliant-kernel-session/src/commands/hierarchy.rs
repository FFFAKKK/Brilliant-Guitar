use brilliant_kernel_contracts::{
    CoreCommandEnvelopeV1, KernelStage3CommandFailureLeafV1, ScoreEntityTargetV1,
};
use brilliant_kernel_runtime::KernelStage3TransactionV1;

pub(crate) fn dispatch(
    transaction: &mut KernelStage3TransactionV1<'_>,
    command: CoreCommandEnvelopeV1,
) -> Result<(), KernelStage3CommandFailureLeafV1> {
    match command {
        CoreCommandEnvelopeV1::PartInsert {
            target: ScoreEntityTargetV1::Document { document_id },
            anchor,
            part,
        } => transaction.insert_part(document_id, anchor, part),
        CoreCommandEnvelopeV1::PartRemove {
            target: ScoreEntityTargetV1::Part { part_id },
        } => transaction.remove_part(part_id),
        CoreCommandEnvelopeV1::PartMove {
            target: ScoreEntityTargetV1::Part { part_id },
            anchor,
        } => transaction.move_part(part_id, anchor),
        CoreCommandEnvelopeV1::PartSetName {
            target: ScoreEntityTargetV1::Part { part_id },
            name,
        } => transaction.set_part_name(part_id, name),
        CoreCommandEnvelopeV1::PartSetInstrument {
            target: ScoreEntityTargetV1::Part { part_id },
            instrument,
        } => transaction.set_part_instrument(part_id, instrument),
        CoreCommandEnvelopeV1::StaffInsert {
            target: ScoreEntityTargetV1::Part { part_id },
            anchor,
            staff,
        } => transaction.insert_staff(part_id, anchor, staff),
        CoreCommandEnvelopeV1::StaffRemove {
            target: ScoreEntityTargetV1::Staff { staff_id },
        } => transaction.remove_staff(staff_id),
        CoreCommandEnvelopeV1::StaffMove {
            target: ScoreEntityTargetV1::Staff { staff_id },
            anchor,
        } => transaction.move_staff(staff_id, anchor),
        CoreCommandEnvelopeV1::StaffSetDefinition {
            target: ScoreEntityTargetV1::Staff { staff_id },
            line_count,
            default_clef,
        } => transaction.set_staff_definition(staff_id, line_count, default_clef),
        CoreCommandEnvelopeV1::VoiceInsert {
            target: ScoreEntityTargetV1::Part { part_id },
            measure_id,
            anchor,
            voice,
        } => transaction.insert_voice(part_id, measure_id, anchor, voice),
        CoreCommandEnvelopeV1::VoiceRemove {
            target: ScoreEntityTargetV1::Voice { voice_id },
        } => transaction.remove_voice(voice_id),
        CoreCommandEnvelopeV1::VoiceMove {
            target: ScoreEntityTargetV1::Voice { voice_id },
            anchor,
        } => transaction.move_voice(voice_id, anchor),
        CoreCommandEnvelopeV1::VoiceSetDefaultStaff {
            target: ScoreEntityTargetV1::Voice { voice_id },
            staff_id,
        } => transaction.set_voice_default_staff(voice_id, staff_id),
        CoreCommandEnvelopeV1::VoiceSetSequenceStart {
            target: ScoreEntityTargetV1::Voice { voice_id },
            start,
        } => transaction.set_voice_sequence_start(voice_id, start),
        CoreCommandEnvelopeV1::EventSetStaffAssignment {
            target: ScoreEntityTargetV1::Event { event_id },
            assignment,
        } => transaction.set_event_staff_assignment(event_id, assignment),
        CoreCommandEnvelopeV1::PartInsert { .. }
        | CoreCommandEnvelopeV1::PartRemove { .. }
        | CoreCommandEnvelopeV1::PartMove { .. }
        | CoreCommandEnvelopeV1::PartSetName { .. }
        | CoreCommandEnvelopeV1::PartSetInstrument { .. }
        | CoreCommandEnvelopeV1::StaffInsert { .. }
        | CoreCommandEnvelopeV1::StaffRemove { .. }
        | CoreCommandEnvelopeV1::StaffMove { .. }
        | CoreCommandEnvelopeV1::StaffSetDefinition { .. }
        | CoreCommandEnvelopeV1::VoiceInsert { .. }
        | CoreCommandEnvelopeV1::VoiceRemove { .. }
        | CoreCommandEnvelopeV1::VoiceMove { .. }
        | CoreCommandEnvelopeV1::VoiceSetDefaultStaff { .. }
        | CoreCommandEnvelopeV1::VoiceSetSequenceStart { .. }
        | CoreCommandEnvelopeV1::EventSetStaffAssignment { .. } => {
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

    const HIERARCHY_REQUEST: &str = r#"{"apiVersion":1,"document":{"schemaVersion":"brilliant-score-1","id":"score-hierarchy","metadata":{"title":"Hierarchy","authors":["Brilliant"],"tempo":{"bpm":108}},"measureDefinitions":[{"id":"m1","meter":{"numerator":4,"denominator":4}},{"id":"m2","meter":{"numerator":4,"denominator":4}}],"parts":[{"id":"pa","name":"A","instrument":{"name":"Piano","writtenToSounding":{"diatonicSteps":0,"chromaticSemitones":0}},"staves":[{"id":"sa","lineCount":5,"defaultClef":{"sign":"G","line":2}}],"measureContents":[{"measureId":"m1","voices":[{"id":"va1","defaultStaffId":"sa","sequence":{"start":{"numerator":0,"denominator":1},"events":[{"id":"ea1","duration":{"base":4,"dots":0},"content":{"kind":"rest"}}]}}]},{"measureId":"m2","voices":[{"id":"va2","defaultStaffId":"sa","sequence":{"start":{"numerator":0,"denominator":1},"events":[{"id":"ea2","duration":{"base":4,"dots":0},"content":{"kind":"rest"}}]}}]}]},{"id":"pb","name":"B","instrument":{"name":"Piano","writtenToSounding":{"diatonicSteps":0,"chromaticSemitones":0}},"staves":[{"id":"sb","lineCount":5,"defaultClef":{"sign":"G","line":2}}],"measureContents":[{"measureId":"m2","voices":[{"id":"vb2","defaultStaffId":"sb","sequence":{"start":{"numerator":0,"denominator":1},"events":[{"id":"eb2","duration":{"base":4,"dots":0},"content":{"kind":"rest"}}]}}]},{"measureId":"m1","voices":[{"id":"vb1","defaultStaffId":"sb","sequence":{"start":{"numerator":0,"denominator":1},"events":[{"id":"eb1","duration":{"base":4,"dots":0},"content":{"kind":"rest"}}]}}]}]}],"extensions":[{"namespace":"example.score","schemaVersion":1,"owner":{"kind":"score"},"payload":{"keep":true}},{"namespace":"example.pb.first","schemaVersion":1,"owner":{"kind":"part","partId":"pb"},"payload":{"order":1}},{"namespace":"example.pa","schemaVersion":1,"owner":{"kind":"part","partId":"pa"},"payload":{"keep":"pa"}},{"namespace":"example.pb.second","schemaVersion":1,"owner":{"kind":"part","partId":"pb"},"payload":{"order":2}}]}}"#;

    fn session() -> KernelSession {
        KernelSession::create(
            decode_create_request(HIERARCHY_REQUEST.as_bytes()).expect("hierarchy request"),
        )
        .expect("hierarchy session")
        .session
    }

    fn submit(session: &mut KernelSession, value: &str) -> KernelStage3SubmitResultV1 {
        let request: KernelStage3SubmitRequestV1 =
            decode_stage3_submit_request(value.as_bytes()).expect("hierarchy command");
        session.submit_stage3(request)
    }

    fn read(session: &KernelSession) -> Box<KernelReadStateV1> {
        let KernelSessionReadResultV1::Ok(state) = session.read_state() else {
            panic!("hierarchy read must succeed");
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

    fn assert_committed(result: KernelStage3SubmitResultV1, version: u64) {
        assert!(matches!(
            result,
            KernelStage3SubmitResultV1::Committed(value)
                if value.document_version.get() == version
                    && value.metrics.full_document_scans == 0
                    && value.metrics.full_document_clones == 0
                    && value.metrics.full_semantic_validations == 0
                    && value.metrics.full_snapshot_materializations == 0
        ));
    }

    fn assert_no_op(result: KernelStage3SubmitResultV1, version: u64) {
        assert!(matches!(
            result,
            KernelStage3SubmitResultV1::NoOp(value)
                if value.document_version.get() == version
        ));
    }

    fn assert_leaf(result: KernelStage3SubmitResultV1, expected: KernelStage3CommandFailureLeafV1) {
        let KernelStage3SubmitResultV1::CommandRejected {
            failure: KernelStage3CommandFailureV1::Leaf(actual),
            ..
        } = result
        else {
            panic!("hierarchy command must reject with a leaf failure");
        };
        assert_eq!(actual, expected);
    }

    #[test]
    fn part_commands_cover_canonical_insert_scalars_move_and_aggregate_remove() {
        let mut session = session();
        let insert = r#"{"apiVersion":1,"command":{"commandVersion":1,"commandId":"core.part.insert","target":{"kind":"document","documentId":"score-hierarchy"},"payload":{"anchor":{"kind":"start"},"part":{"id":"pc","name":"C","instrument":{"name":"Piano","writtenToSounding":{"diatonicSteps":0,"chromaticSemitones":0}},"staves":[{"id":"sc","lineCount":5,"defaultClef":{"sign":"G","line":2}}],"measureContents":[{"measureId":"m2","voices":[{"id":"vc2","defaultStaffId":"sc","sequence":{"start":{"numerator":0,"denominator":1},"events":[{"id":"ec2","duration":{"base":4,"dots":0},"content":{"kind":"rest"}}]}}]},{"measureId":"m1","voices":[{"id":"vc1","defaultStaffId":"sc","sequence":{"start":{"numerator":0,"denominator":1},"events":[{"id":"ec1","duration":{"base":4,"dots":0},"content":{"kind":"rest"}}]}}]}]}}}}"#;
        let inserted = submit(&mut session, insert);
        let KernelStage3SubmitResultV1::Committed(value) = inserted else {
            panic!("part insert must commit");
        };
        assert_eq!(value.document_version.get(), 1);
        assert_eq!(
            value.affected.iter().map(target_key).collect::<Vec<_>>(),
            [
                ("document", "score-hierarchy"),
                ("part", "pc"),
                ("staff", "sc"),
                ("voice", "vc1"),
                ("event", "ec1"),
                ("voice", "vc2"),
                ("event", "ec2"),
            ]
        );
        let state = read(&session);
        let inserted_part = state
            .snapshot
            .document
            .parts
            .iter()
            .find(|part| part.id.as_str() == "pc")
            .expect("inserted part");
        assert_eq!(
            inserted_part
                .measure_contents
                .iter()
                .map(|content| content.measure_id.as_str())
                .collect::<Vec<_>>(),
            ["m1", "m2"]
        );

        let set_name = r#"{"apiVersion":1,"command":{"commandVersion":1,"commandId":"core.part.set-name","target":{"kind":"part","partId":"pc"},"payload":{"name":"Lead"}}}"#;
        assert_committed(submit(&mut session, set_name), 2);
        assert_no_op(submit(&mut session, set_name), 2);
        let set_instrument = r#"{"apiVersion":1,"command":{"commandVersion":1,"commandId":"core.part.set-instrument","target":{"kind":"part","partId":"pc"},"payload":{"instrument":{"name":"Guitar","writtenToSounding":{"diatonicSteps":-7,"chromaticSemitones":-12}}}}}"#;
        assert_committed(submit(&mut session, set_instrument), 3);
        let move_part = r#"{"apiVersion":1,"command":{"commandVersion":1,"commandId":"core.part.move","target":{"kind":"part","partId":"pc"},"payload":{"anchor":{"kind":"after-part","partId":"pb"}}}}"#;
        assert_committed(submit(&mut session, move_part), 4);
        assert_no_op(submit(&mut session, move_part), 4);

        let remove = r#"{"apiVersion":1,"command":{"commandVersion":1,"commandId":"core.part.remove","target":{"kind":"part","partId":"pc"},"payload":{}}}"#;
        let removed = submit(&mut session, remove);
        let KernelStage3SubmitResultV1::Committed(value) = removed else {
            panic!("part remove must commit");
        };
        assert_eq!(value.document_version.get(), 5);
        assert_eq!(
            value.affected.iter().map(target_key).collect::<Vec<_>>(),
            [
                ("part", "pc"),
                ("document", "score-hierarchy"),
                ("staff", "sc"),
                ("voice", "vc1"),
                ("event", "ec1"),
                ("voice", "vc2"),
                ("event", "ec2"),
            ]
        );
    }

    #[test]
    fn staff_voice_and_assignment_commands_cover_reference_and_no_op_semantics() {
        let mut session = session();
        let insert_staff = r#"{"apiVersion":1,"command":{"commandVersion":1,"commandId":"core.staff.insert","target":{"kind":"part","partId":"pa"},"payload":{"anchor":{"kind":"after-staff","staffId":"sa"},"staff":{"id":"sa2","lineCount":5,"defaultClef":{"sign":"F","line":4}}}}}"#;
        assert_committed(submit(&mut session, insert_staff), 1);
        let set_staff = r#"{"apiVersion":1,"command":{"commandVersion":1,"commandId":"core.staff.set-definition","target":{"kind":"staff","staffId":"sa2"},"payload":{"lineCount":6,"defaultClef":{"sign":"C","line":3}}}}"#;
        assert_committed(submit(&mut session, set_staff), 2);
        assert_no_op(submit(&mut session, set_staff), 2);
        let move_staff = r#"{"apiVersion":1,"command":{"commandVersion":1,"commandId":"core.staff.move","target":{"kind":"staff","staffId":"sa2"},"payload":{"anchor":{"kind":"start"}}}}"#;
        assert_committed(submit(&mut session, move_staff), 3);
        assert_no_op(submit(&mut session, move_staff), 3);

        let insert_voice = r#"{"apiVersion":1,"command":{"commandVersion":1,"commandId":"core.voice.insert","target":{"kind":"part","partId":"pa"},"payload":{"measureId":"m1","anchor":{"kind":"after-voice","voiceId":"va1"},"voice":{"id":"va-new","defaultStaffId":"sa2","sequence":{"start":{"numerator":0,"denominator":1},"events":[{"id":"ea-new","duration":{"base":4,"dots":0},"content":{"kind":"rest"}}]}}}}}"#;
        let inserted = submit(&mut session, insert_voice);
        let KernelStage3SubmitResultV1::Committed(value) = inserted else {
            panic!("voice insert must commit");
        };
        assert_eq!(value.document_version.get(), 4);
        assert_eq!(
            value.affected.iter().map(target_key).collect::<Vec<_>>(),
            [("part", "pa"), ("voice", "va-new"), ("event", "ea-new"),]
        );

        let set_start = r#"{"apiVersion":1,"command":{"commandVersion":1,"commandId":"core.voice.set-sequence-start","target":{"kind":"voice","voiceId":"va-new"},"payload":{"start":{"numerator":1,"denominator":4}}}}"#;
        assert_committed(submit(&mut session, set_start), 5);
        assert_no_op(submit(&mut session, set_start), 5);
        let effective_no_op = r#"{"apiVersion":1,"command":{"commandVersion":1,"commandId":"core.event.set-staff-assignment","target":{"kind":"event","eventId":"ea-new"},"payload":{"assignment":{"kind":"staff","staffId":"sa2"}}}}"#;
        assert_no_op(submit(&mut session, effective_no_op), 5);
        let set_event_staff = r#"{"apiVersion":1,"command":{"commandVersion":1,"commandId":"core.event.set-staff-assignment","target":{"kind":"event","eventId":"ea-new"},"payload":{"assignment":{"kind":"staff","staffId":"sa"}}}}"#;
        assert_committed(submit(&mut session, set_event_staff), 6);
        let set_default = r#"{"apiVersion":1,"command":{"commandVersion":1,"commandId":"core.voice.set-default-staff","target":{"kind":"voice","voiceId":"va-new"},"payload":{"staffId":"sa"}}}"#;
        assert_committed(submit(&mut session, set_default), 7);
        let inherit_effective_no_op = r#"{"apiVersion":1,"command":{"commandVersion":1,"commandId":"core.event.set-staff-assignment","target":{"kind":"event","eventId":"ea-new"},"payload":{"assignment":{"kind":"inherit-default"}}}}"#;
        assert_no_op(submit(&mut session, inherit_effective_no_op), 7);

        let move_voice = r#"{"apiVersion":1,"command":{"commandVersion":1,"commandId":"core.voice.move","target":{"kind":"voice","voiceId":"va-new"},"payload":{"anchor":{"kind":"start"}}}}"#;
        assert_committed(submit(&mut session, move_voice), 8);
        assert_no_op(submit(&mut session, move_voice), 8);
        let remove_voice = r#"{"apiVersion":1,"command":{"commandVersion":1,"commandId":"core.voice.remove","target":{"kind":"voice","voiceId":"va-new"},"payload":{}}}"#;
        assert_committed(submit(&mut session, remove_voice), 9);
        let remove_staff = r#"{"apiVersion":1,"command":{"commandVersion":1,"commandId":"core.staff.remove","target":{"kind":"staff","staffId":"sa2"},"payload":{}}}"#;
        assert_committed(submit(&mut session, remove_staff), 10);
    }

    #[test]
    fn owner_self_reference_and_final_container_failures_are_atomic() {
        let mut session = session();
        let baseline = encode_read_result(&session.read_state()).expect("baseline");
        let cases = [
            (
                r#"{"apiVersion":1,"command":{"commandVersion":1,"commandId":"core.staff.insert","target":{"kind":"part","partId":"pa"},"payload":{"anchor":{"kind":"after-staff","staffId":"sb"},"staff":{"id":"sa2","lineCount":5,"defaultClef":{"sign":"G","line":2}}}}}"#,
                KernelStage3CommandFailureLeafV1::AnchorWrongOwner,
            ),
            (
                r#"{"apiVersion":1,"command":{"commandVersion":1,"commandId":"core.staff.move","target":{"kind":"staff","staffId":"sa"},"payload":{"anchor":{"kind":"after-staff","staffId":"sa"}}}}"#,
                KernelStage3CommandFailureLeafV1::AnchorSelfReference,
            ),
            (
                r#"{"apiVersion":1,"command":{"commandVersion":1,"commandId":"core.voice.insert","target":{"kind":"part","partId":"pa"},"payload":{"measureId":"m1","anchor":{"kind":"after-voice","voiceId":"vb1"},"voice":{"id":"va-new","defaultStaffId":"sa","sequence":{"start":{"numerator":0,"denominator":1},"events":[]}}}}}"#,
                KernelStage3CommandFailureLeafV1::AnchorWrongOwner,
            ),
            (
                r#"{"apiVersion":1,"command":{"commandVersion":1,"commandId":"core.voice.set-default-staff","target":{"kind":"voice","voiceId":"va1"},"payload":{"staffId":"sb"}}}"#,
                KernelStage3CommandFailureLeafV1::ReferenceConflict,
            ),
            (
                r#"{"apiVersion":1,"command":{"commandVersion":1,"commandId":"core.staff.remove","target":{"kind":"staff","staffId":"sa"},"payload":{}}}"#,
                KernelStage3CommandFailureLeafV1::ReferenceConflict,
            ),
            (
                r#"{"apiVersion":1,"command":{"commandVersion":1,"commandId":"core.voice.remove","target":{"kind":"voice","voiceId":"va1"},"payload":{}}}"#,
                KernelStage3CommandFailureLeafV1::LocalInvariantRejected,
            ),
        ];
        for (command, failure) in cases {
            assert_leaf(submit(&mut session, command), failure);
            assert_eq!(
                encode_read_result(&session.read_state()).expect("unchanged"),
                baseline
            );
        }
    }

    #[test]
    fn part_owned_extensions_follow_aggregate_remove_and_final_part_is_retained() {
        let mut session = session();
        let remove_pb = r#"{"apiVersion":1,"command":{"commandVersion":1,"commandId":"core.part.remove","target":{"kind":"part","partId":"pb"},"payload":{}}}"#;
        assert_committed(submit(&mut session, remove_pb), 1);
        let state = read(&session);
        assert_eq!(
            state
                .snapshot
                .document
                .extensions
                .iter()
                .map(|extension| extension.namespace.as_str())
                .collect::<Vec<_>>(),
            ["example.score", "example.pa"]
        );
        let single_part = encode_read_result(&session.read_state()).expect("single part");
        let remove_final = r#"{"apiVersion":1,"command":{"commandVersion":1,"commandId":"core.part.remove","target":{"kind":"part","partId":"pa"},"payload":{}}}"#;
        assert_leaf(
            submit(&mut session, remove_final),
            KernelStage3CommandFailureLeafV1::LocalInvariantRejected,
        );
        assert_eq!(
            encode_read_result(&session.read_state()).expect("final part retained"),
            single_part
        );
    }
}
