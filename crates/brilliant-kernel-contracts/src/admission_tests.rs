use super::*;

fn request(command: &Value) -> Vec<u8> {
    serde_json::to_vec(&serde_json::json!({ "apiVersion": 1, "command": command }))
        .expect("request bytes")
}

#[test]
fn admission_codec_matches_independent_ts_entrypoint_matrix() {
    let oracle: Value = serde_json::from_str(include_str!(
        "../../../test/core-kernel/rust-migration/fixtures/command-admission-oracle-v1.json"
    ))
    .expect("independent TS oracle");
    let cases = oracle["cases"].as_array().expect("cases");
    assert!(cases.len() > 250);
    let mut mismatches = Vec::new();
    for entry in cases {
        let input = &entry["input"];
        let expected = &entry["expected"];
        let result = decode_admission_submit_request(&request(input));
        match result {
            Ok(decoded) if expected["ok"] == true => {
                assert_eq!(
                    decoded.command.command_id().as_str(),
                    expected["value"]["commandId"]
                );
                assert_eq!(
                    serde_json::to_value(decoded.command.target()).expect("target"),
                    expected["value"]["target"],
                    "{}",
                    entry["id"]
                );
                let payload = &expected["value"]["payload"];
                match decoded.command {
                    CoreCommandEnvelopeV1::PartInsert { part, anchor, .. } => {
                        assert_eq!(
                            serde_json::to_value(anchor).expect("anchor"),
                            payload["anchor"]
                        );
                        assert_eq!(serde_json::to_value(part).expect("part"), payload["part"])
                    }
                    CoreCommandEnvelopeV1::StaffInsert { staff, anchor, .. } => {
                        assert_eq!(
                            serde_json::to_value(anchor).expect("anchor"),
                            payload["anchor"]
                        );
                        assert_eq!(
                            serde_json::to_value(staff).expect("staff"),
                            payload["staff"]
                        );
                    }
                    CoreCommandEnvelopeV1::VoiceInsert {
                        voice,
                        measure_id,
                        anchor,
                        ..
                    } => {
                        assert_eq!(
                            serde_json::to_value(anchor).expect("anchor"),
                            payload["anchor"]
                        );
                        assert_eq!(
                            serde_json::to_value(voice).expect("voice"),
                            payload["voice"]
                        );
                        assert_eq!(measure_id, payload["measureId"]);
                    }
                    CoreCommandEnvelopeV1::MeasureInsert {
                        definition,
                        contents,
                        anchor,
                        ..
                    } => {
                        assert_eq!(
                            serde_json::to_value(anchor).expect("anchor"),
                            payload["anchor"]
                        );
                        assert_eq!(
                            serde_json::to_value(definition).expect("definition"),
                            payload["definition"]
                        );
                        assert_eq!(
                            serde_json::to_value(contents).expect("contents"),
                            payload["contents"]
                        );
                    }
                    CoreCommandEnvelopeV1::VoiceSetDefaultStaff { staff_id, .. } => {
                        assert_eq!(staff_id, payload["staffId"])
                    }
                    CoreCommandEnvelopeV1::EventSetStaffAssignment { assignment, .. } => {
                        assert_eq!(
                            serde_json::to_value(assignment).expect("assignment"),
                            payload["assignment"]
                        )
                    }
                    CoreCommandEnvelopeV1::PartMove { anchor, .. } => assert_eq!(
                        serde_json::to_value(anchor).expect("anchor"),
                        payload["anchor"]
                    ),
                    CoreCommandEnvelopeV1::StaffMove { anchor, .. } => assert_eq!(
                        serde_json::to_value(anchor).expect("anchor"),
                        payload["anchor"]
                    ),
                    CoreCommandEnvelopeV1::VoiceMove { anchor, .. } => assert_eq!(
                        serde_json::to_value(anchor).expect("anchor"),
                        payload["anchor"]
                    ),
                    CoreCommandEnvelopeV1::MeasureMove { anchor, .. } => assert_eq!(
                        serde_json::to_value(anchor).expect("anchor"),
                        payload["anchor"]
                    ),
                    _ => {}
                }
            }
            Err(KernelStage3SubmitDecodeFailureV1::Command(failure)) if expected["ok"] == false => {
                assert_eq!(
                    serde_json::to_value(failure).expect("failure"),
                    expected["failure"],
                    "{}",
                    entry["id"]
                );
            }
            other => mismatches.push(format!(
                "{}: expected {}, got {other:?}",
                entry["id"], expected["ok"]
            )),
        }
    }
    assert!(mismatches.is_empty(), "{}", mismatches.join("\n"));
}

#[test]
fn admission_does_not_relax_typed_store_ids_or_direct_event_ids() {
    let component =
        serde_json::json!({ "id": "", "lineCount": 5, "defaultClef": { "sign": "G", "line": 2 } });
    let admission: brilliant_score_foundation::AdmissionStaffDefinitionV1 =
        serde_json::from_value(component.clone()).expect("raw ID preserved");
    assert!(admission.id.is_empty());
    assert!(serde_json::from_value::<StaffDefinitionV1>(component.clone()).is_err());
    assert_eq!(
        serde_json::to_value(admission).expect("lossless raw component"),
        component
    );
    let command = serde_json::json!({ "commandVersion": 1, "commandId": "core.staff.insert", "target": { "kind": "part", "partId": "p" }, "payload": { "anchor": { "kind": "start" }, "staff": component } });
    assert!(decode_admission_submit_request(&request(&command)).is_ok());
    assert_eq!(
        decode_stage3_submit_request(&request(&command)),
        Err(KernelStage3SubmitDecodeFailureV1::Command(
            KernelStage3CommandFailureLeafV1::InvalidEnvelope.into()
        ))
    );
    let direct = serde_json::json!({ "commandVersion": 1, "commandId": "core.voice.insert-rest-event", "target": { "kind": "voice", "voiceId": "v" }, "payload": { "anchor": { "kind": "start" }, "event": { "id": "", "duration": { "base": 4, "dots": 0 }, "content": { "kind": "rest" } } } });
    assert_eq!(
        decode_admission_submit_request(&request(&direct)),
        Err(KernelStage3SubmitDecodeFailureV1::Command(
            KernelStage3CommandFailureLeafV1::InvalidEnvelope.into()
        ))
    );
}

#[test]
fn admission_batch_keeps_child_decode_deferred_and_nested_replay_rules() {
    let child = serde_json::json!({ "commandVersion": 1, "commandId": "core.voice.set-default-staff", "target": { "kind": "voice", "voiceId": "voice-1" }, "payload": { "staffId": "" } });
    let invalid_target = serde_json::json!({ "commandVersion": 1, "commandId": "core.voice.remove", "target": { "kind": "voice", "voiceId": "" }, "payload": {} });
    let batch = serde_json::json!({ "commandVersion": 1, "commandId": "core.transaction.batch", "target": { "kind": "document", "documentId": "score-1" }, "payload": { "commands": [child, invalid_target] } });
    let decoded =
        decode_admission_submit_request(&request(&batch)).expect("capture batch before children");
    let CoreCommandEnvelopeV1::TransactionBatch { commands, .. } = decoded.command else {
        panic!("batch");
    };
    assert!(
        matches!(decode_captured_admission_command(&commands[0]), Ok(CoreCommandEnvelopeV1::VoiceSetDefaultStaff { staff_id, .. }) if staff_id.is_empty())
    );
    assert_eq!(
        decode_captured_admission_command(&commands[1]),
        Err(KernelStage3CommandFailureLeafV1::InvalidEnvelope.into())
    );
    let captured = CapturedCoreCommandV1::from_json(batch);
    assert_eq!(
        decode_captured_admission_command(&captured),
        Err(KernelStage3CommandFailureLeafV1::BatchNested.into())
    );
    assert!(matches!(
        decode_captured_admission_replay_command(&captured),
        Ok(CoreCommandEnvelopeV1::TransactionBatch { .. })
    ));
}

#[test]
fn admission_uses_existing_resource_and_duplicate_json_property_boundary() {
    for input in [
        br#"{"apiVersion":1,"command":{"commandVersion":1,"commandId":"core.voice.set-default-staff","target":{"kind":"voice","voiceId":"v"},"payload":{"staffId":"","staffId":"s"}}}"#.as_slice(),
        br#"{"apiVersion":1,"command":{"commandVersion":1,"commandId":"core.staff.insert","target":{"kind":"part","partId":"p"},"payload":{"anchor":{"kind":"start"},"staff":{"id":"","lineCount":9007199254740992,"defaultClef":{"sign":"G","line":2}}}}}"#.as_slice(),
    ] {
        assert_eq!(decode_admission_submit_request(input), Err(KernelStage3SubmitDecodeFailureV1::Command(KernelStage3CommandFailureLeafV1::InvalidEnvelope.into())));
    }
    let depth = format!(
        r#"{{"apiVersion":1,"command":{}0{}}}"#,
        "[".repeat(JSON_DEPTH_LIMIT + 2),
        "]".repeat(JSON_DEPTH_LIMIT + 2)
    );
    assert!(matches!(
        decode_admission_submit_request(depth.as_bytes()),
        Err(KernelStage3SubmitDecodeFailureV1::Command(
            KernelStage3CommandFailureV1::Leaf(
                KernelStage3CommandFailureLeafV1::ResourceLimitExceeded {
                    limit_kind: KernelStage3ResourceLimitKindV1::InputDepth,
                    ..
                }
            )
        ))
    ));
}
