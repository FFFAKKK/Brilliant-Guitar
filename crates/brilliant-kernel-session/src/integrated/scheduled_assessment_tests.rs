use super::*;
use serde_json::{Value, json};

struct Host {
    replies: Value,
    calls: Vec<String>,
    bad: Option<&'static str>,
    editing: bool,
    command_pitch: &'static str,
    extension_present: bool,
}
impl ContributionExecutorV2 for Host {
    fn uses_scoped_assessment(&self) -> bool {
        true
    }
    fn uses_scoped_preparation(&self) -> bool {
        self.editing
    }
    fn execute(&mut self, _: &[u8]) -> Result<Vec<u8>, ContributionExecutionFailureV2> {
        panic!("scheduled host requires candidate reads")
    }
    fn execute_with_core_reads(
        &mut self,
        bytes: &[u8],
        reads: &mut dyn ContributionCoreReadV2,
    ) -> Result<Vec<u8>, ContributionExecutionFailureV2> {
        let request: Value = serde_json::from_slice(bytes).unwrap();
        let operation = request["operation"].as_str().unwrap();
        if operation == "assessmentStart" {
            assert!(request.get("document").is_none());
            return Ok(serde_json::to_vec(
                &json!({"ok":true,"scheduleVersion":if self.editing { 4 } else { 3 }}),
            )
            .unwrap());
        }
        if operation == "contributionCallback" {
            assert!(self.editing);
            assert!(request.get("document").is_none());
            assert_eq!(request["scheduleVersion"], 4);
            let phase = request["callbackOperation"].as_str().unwrap();
            self.calls.push(phase.into());
            let reply: Value = serde_json::from_slice(&reads.read_core(br#"{"readVersion":2,"selectorId":"core.selector.score-entity","address":{"kind":"note","noteId":"note-1"}}"#).unwrap()).unwrap();
            assert_eq!(reply["documentVersion"], request["documentVersion"]);
            assert_eq!(
                reply["result"]["value"]["value"]["writtenPitch"]["step"],
                if phase.starts_with("command") {
                    self.command_pitch
                } else {
                    "D"
                }
            );
            let output = match phase {
                "commandDecode" => {
                    json!({"status":"decoded","command":request["arguments"][0]["payload"]})
                }
                "commandPrepare" => {
                    assert!(request["arguments"][0].get("coreDocument").is_none());
                    serde_json::from_str::<Value>(self.replies["prepare"].as_str().unwrap())
                        .unwrap()["prepared"]
                        .clone()
                }
                "effectDecode" => json!({"status":"decoded","payload":request["arguments"][0]}),
                "effectTransform" => {
                    assert!(
                        request["arguments"][0]["view"]
                            .get("coreDocument")
                            .is_none()
                    );
                    assert_eq!(
                        request["arguments"][0].get("currentBlock").is_some(),
                        self.extension_present
                    );
                    serde_json::from_str::<Value>(self.replies["transform"].as_str().unwrap())
                        .unwrap()["transformed"]
                        .clone()
                }
                _ => panic!("unexpected preparation phase"),
            };
            return Ok(serde_json::to_vec(&json!({"ok":true,"value":output})).unwrap());
        }
        if operation == "assessmentCallback" {
            assert!(request.get("document").is_none());
            assert!(request["view"].get("coreDocument").is_none());
            assert_eq!(request["view"]["viewVersion"], 2);
            assert_eq!(
                request["view"]["compatibleExtensions"][0]["namespace"],
                "fixture.score"
            );
            let phase = request["callbackOperation"].as_str().unwrap();
            self.calls.push(phase.into());
            let query = br#"{"readVersion":2,"selectorId":"core.selector.score-entity","address":{"kind":"note","noteId":"note-1"}}"#;
            let reply: Value = serde_json::from_slice(&reads.read_core(query).unwrap()).unwrap();
            assert_eq!(reply["documentVersion"], request["documentVersion"]);
            assert_eq!(
                reply["result"]["value"]["value"]["writtenPitch"]["step"],
                "D"
            );
            let issue = json!({"issueVersion":1,"code":"fixture.score.module.semantic-invalid",
                "messageKey":"module.fixture.score.module.semantic-invalid","severity":"error",
                "source":{"kind":"module","moduleId":"fixture.score.module","contributionId":"fixture.score.contribution.v1"}});
            let value = match (phase, self.bad) {
                ("validate", Some("semantic")) => json!([issue]),
                ("validate", Some("cap")) => json!(vec![issue; 1025]),
                ("validate", Some("forged")) => json!({"ok":true,"assessment":{"modules":[]}}),
                ("validate", Some("read")) => {
                    assert!(reads.read_core(b"invalid").is_err());
                    json!([])
                }
                ("validate", _) => json!([]),
                ("classify", _) => json!({"status":"supported","issues":[]}),
                _ => panic!("unexpected phase"),
            };
            return Ok(serde_json::to_vec(&json!({"ok":true,"value":value})).unwrap());
        }
        assert!(operation == "prepare" || operation == "transform");
        Ok(self.replies[operation]
            .as_str()
            .unwrap()
            .as_bytes()
            .to_vec())
    }
}
fn fixture() -> Value {
    serde_json::from_str(include_str!("../wasm/fixtures/session.json")).unwrap()
}
fn host(fixture: &Value) -> Host {
    Host {
        replies: fixture["callbacks"].clone(),
        calls: vec![],
        bad: None,
        editing: false,
        command_pitch: "C",
        extension_present: false,
    }
}
fn without_metrics(mut value: Value) -> Value {
    value.as_object_mut().unwrap().remove("callbackProjections");
    value
}
fn read(session: &mut IntegratedKernelSessionV2, host: &mut Host) -> Value {
    without_metrics(
        serde_json::from_slice(&session.operate(br#"{"operation":"read"}"#, host)).unwrap(),
    )
}

fn unsupported_admission_input(measures: usize) -> Value {
    let fixture = fixture();
    let mut input: Value = serde_json::from_str(fixture["initial"].as_str().unwrap()).unwrap();
    let template = input["document"]["parts"][0]["measureContents"][0].clone();
    input["document"]["measureDefinitions"] = json!(
        (0..measures)
            .map(|i| {
                json!({"id":format!("measure-{i}"),"meter":{"numerator":8,"denominator":8}})
            })
            .collect::<Vec<_>>()
    );
    input["document"]["parts"][0]["measureContents"] = json!(
        (0..measures)
            .map(|i| {
                let mut content = template.clone();
                content["measureId"] = json!(format!("measure-{i}"));
                content["voices"][0]["id"] = json!(format!("voice-{i}"));
                for (j, event) in content["voices"][0]["sequence"]["events"]
                    .as_array_mut()
                    .unwrap()
                    .iter_mut()
                    .enumerate()
                {
                    event["id"] = json!(format!("event-{i}-{j}"));
                    if let Some(notes) = event["content"]
                        .get_mut("notes")
                        .and_then(Value::as_array_mut)
                    {
                        notes[0]["id"] = json!(format!("note-{i}-{j}"));
                    }
                }
                content
            })
            .collect::<Vec<_>>()
    );
    input
}

fn report_request(version: u64, offset: usize, limit: usize) -> Value {
    json!({"operation":"readCoreReportPage","reportVersion":2,
        "documentId":"score-1","documentVersion":version,
        "profileId":"brilliant-guitar.k1","offset":offset,"limit":limit})
}

fn module_command(payload: Value) -> Value {
    json!({
        "commandVersion":1,
        "commandId":"fixture.score.apply",
        "target":{"kind":"document","documentId":"score-1"},
        "payload":payload
    })
}

fn module_submit(payload: Value) -> Value {
    json!({"operation":"submit","command":module_command(payload)})
}

fn set_module_prepare(host: &mut Host, effects: Value, affected: Value) {
    host.replies["prepare"] = serde_json::to_string(&json!({
        "ok":true,
        "prepared":{
            "status":"changed",
            "effectRequests":effects,
            "affected":affected
        }
    }))
    .unwrap()
    .into();
}

fn set_module_prepare_without_affected(host: &mut Host, effects: Value) {
    host.replies["prepare"] = serde_json::to_string(&json!({
        "ok":true,
        "prepared":{
            "status":"changed",
            "effectRequests":effects
        }
    }))
    .unwrap()
    .into();
}

fn module_extension_effect() -> Value {
    json!({
        "requestVersion":1,
        "requestKind":"module.extension",
        "effectKind":"fixture.score.replace",
        "namespace":"fixture.score",
        "owner":{"kind":"score"},
        "payload":{"schemaVersion":1,"marker":"wasm"}
    })
}

fn pitch_effect_with_step(step: &str) -> Value {
    json!({
        "requestVersion":1,
        "requestKind":"core.note.replace-written-pitch",
        "target":{"kind":"note","noteId":"note-1"},
        "writtenPitch":{"step":step,"alter":0,"octave":4}
    })
}

fn pitch_effect() -> Value {
    pitch_effect_with_step("D")
}

fn event_remove_effect(event_id: &str) -> Value {
    json!({
        "requestVersion":1,
        "requestKind":"core.event.remove",
        "target":{"kind":"event","eventId":event_id}
    })
}

fn rest_insert_effect(event_id: &str) -> Value {
    rest_insert_effect_at(event_id, json!({"kind":"start"}))
}

fn rest_insert_effect_at(event_id: &str, anchor: Value) -> Value {
    json!({
        "requestVersion":1,
        "requestKind":"core.voice.insert-rest-event",
        "target":{"kind":"voice","voiceId":"voice-1"},
        "anchor":anchor,
        "event":{"id":event_id,"duration":{"base":4,"dots":0},"content":{"kind":"rest"}}
    })
}

#[test]
fn plugin_core_effects_preserve_deleted_affected_addresses_and_atomic_failure() {
    let fixture = fixture();
    let mut input: Value = serde_json::from_str(fixture["initial"].as_str().unwrap()).unwrap();
    input["reportDeliveryVersion"] = json!(2);
    let mut host = host(&fixture);
    host.editing = true;
    let mut session =
        IntegratedKernelSessionV2::create(&serde_json::to_vec(&input).unwrap(), &mut host).unwrap();

    let document = json!({"kind":"document","documentId":"score-1"});
    let note = json!({"kind":"note","noteId":"note-1"});
    let voice = json!({"kind":"voice","voiceId":"voice-1"});
    let event_2 = json!({"kind":"event","eventId":"event-2"});

    set_module_prepare_without_affected(
        &mut host,
        json!([
            pitch_effect(),
            event_remove_effect("event-2"),
            module_extension_effect()
        ]),
    );
    let deleted: Value = serde_json::from_slice(&session.operate(
        &serde_json::to_vec(&module_submit(json!({"eventId":"event-2"}))).unwrap(),
        &mut host,
    ))
    .unwrap();
    assert_eq!(deleted["result"]["status"], "committed", "{deleted}");
    assert_eq!(
        deleted["result"]["value"]["affected"],
        json!([
            document.clone(),
            event_2.clone(),
            note.clone(),
            voice.clone()
        ])
    );
    let after_delete = read(&mut session, &mut host);
    let events = &after_delete["state"]["snapshot"]["document"]["parts"][0]["measureContents"][0]["voices"]
        [0]["sequence"]["events"];
    assert!(
        events
            .as_array()
            .unwrap()
            .iter()
            .all(|event| event["id"] != "event-2")
    );
    host.command_pitch = "D";
    host.extension_present = true;

    let undone: Value =
        serde_json::from_slice(&session.operate(br#"{"operation":"undo"}"#, &mut host)).unwrap();
    assert_eq!(undone["result"]["status"], "committed", "{undone}");
    let restored = read(&mut session, &mut host);
    assert!(
        restored["state"]["snapshot"]["document"]["parts"][0]["measureContents"][0]["voices"][0]
            ["sequence"]["events"]
            .as_array()
            .unwrap()
            .iter()
            .any(|event| event["id"] == "event-2")
    );

    let redone: Value =
        serde_json::from_slice(&session.operate(br#"{"operation":"redo"}"#, &mut host)).unwrap();
    assert_eq!(redone["result"]["status"], "committed", "{redone}");

    set_module_prepare(
        &mut host,
        json!([
            pitch_effect(),
            rest_insert_effect("event-2"),
            module_extension_effect()
        ]),
        json!([{"kind":"measure","measureId":"plugin-only"}]),
    );
    let rebuilt: Value = serde_json::from_slice(&session.operate(
        &serde_json::to_vec(&module_submit(json!({"eventId":"event-2"}))).unwrap(),
        &mut host,
    ))
    .unwrap();
    assert_eq!(rebuilt["result"]["status"], "committed", "{rebuilt}");
    assert_eq!(
        rebuilt["result"]["value"]["affected"],
        json!([event_2.clone(), voice.clone()])
    );
    let rebuilt_state = read(&mut session, &mut host);
    assert!(
        rebuilt_state["state"]["snapshot"]["document"]["parts"][0]["measureContents"][0]["voices"]
            [0]["sequence"]["events"]
            .as_array()
            .unwrap()
            .iter()
            .any(|event| event["id"] == "event-2")
    );

    set_module_prepare(
        &mut host,
        json!([
            pitch_effect(),
            event_remove_effect("event-2"),
            module_extension_effect()
        ]),
        json!([
            document.clone(),
            note.clone(),
            voice.clone(),
            event_2.clone()
        ]),
    );
    let removed_rebuilt: Value = serde_json::from_slice(&session.operate(
        &serde_json::to_vec(&module_submit(json!({"eventId":"event-2"}))).unwrap(),
        &mut host,
    ))
    .unwrap();
    assert_eq!(
        removed_rebuilt["result"]["status"], "committed",
        "{removed_rebuilt}"
    );

    let before_noop = read(&mut session, &mut host);
    set_module_prepare(
        &mut host,
        json!([
            rest_insert_effect("transient-event"),
            event_remove_effect("transient-event")
        ]),
        json!([voice.clone()]),
    );
    let inserted_then_removed: Value = serde_json::from_slice(&session.operate(
        &serde_json::to_vec(&module_submit(json!({"eventId":"transient-event"}))).unwrap(),
        &mut host,
    ))
    .unwrap();
    assert_eq!(
        inserted_then_removed["result"]["status"], "no-op",
        "{inserted_then_removed}"
    );
    assert_eq!(
        inserted_then_removed["result"]["value"]["affected"],
        json!([])
    );
    assert_eq!(read(&mut session, &mut host), before_noop);

    set_module_prepare(
        &mut host,
        json!([
            event_remove_effect("event-3"),
            rest_insert_effect_at("event-3", json!({"kind":"after-event","eventId":"event-1"}))
        ]),
        json!([
            voice.clone(),
            {"kind":"event","eventId":"event-3"}
        ]),
    );
    let rebuilt_same_id: Value = serde_json::from_slice(&session.operate(
        &serde_json::to_vec(&module_submit(json!({"eventId":"event-3"}))).unwrap(),
        &mut host,
    ))
    .unwrap();
    assert_eq!(
        rebuilt_same_id["result"]["status"], "no-op",
        "{rebuilt_same_id}"
    );
    assert_eq!(rebuilt_same_id["result"]["value"]["affected"], json!([]));
    assert_eq!(read(&mut session, &mut host), before_noop);

    set_module_prepare(
        &mut host,
        json!([
            pitch_effect_with_step("E"),
            event_remove_effect("missing-event")
        ]),
        json!([note]),
    );
    let before_failure = read(&mut session, &mut host);
    let rejected: Value = serde_json::from_slice(&session.operate(
        &serde_json::to_vec(&module_submit(json!({"eventId":"missing-event"}))).unwrap(),
        &mut host,
    ))
    .unwrap();
    assert_eq!(rejected["ok"], false, "{rejected}");
    assert_eq!(
        rejected["failure"],
        json!({
            "code":"command.contribution-effect-rejected",
            "moduleId":"fixture.score.module",
            "contributionId":"fixture.score.contribution.v1",
            "effectIndex":1,
            "effectKind":"core.event.remove",
            "target":{"kind":"event","eventId":"missing-event"},
            "failureCode":"command.target-not-found"
        }),
        "{rejected}"
    );
    assert_eq!(read(&mut session, &mut host), before_failure);
}

#[test]
fn effect_contract_failures_preserve_provenance_and_atomicity() {
    let fixture = fixture();
    let mut input: Value = serde_json::from_str(fixture["initial"].as_str().unwrap()).unwrap();
    input["reportDeliveryVersion"] = json!(2);
    let mut host = host(&fixture);
    host.editing = true;
    let mut session =
        IntegratedKernelSessionV2::create(&serde_json::to_vec(&input).unwrap(), &mut host).unwrap();
    let before = read(&mut session, &mut host);
    let event_target = json!({"kind":"event","eventId":"event-2"});

    let cases = [
        (
            json!({
                "requestVersion":2,
                "requestKind":"core.event.remove",
                "target":event_target.clone()
            }),
            "core.event.remove",
            event_target.clone(),
            "command.unsupported-version",
        ),
        (
            json!({
                "requestVersion":1,
                "requestKind":"core.event.future-remove",
                "target":event_target.clone()
            }),
            "core.event.future-remove",
            event_target.clone(),
            "command.unknown-id",
        ),
        (
            json!({
                "requestVersion":1,
                "requestKind":"core.event.remove",
                "target":event_target.clone(),
                "extra":true
            }),
            "core.event.remove",
            event_target.clone(),
            "command.invalid-envelope",
        ),
        (
            json!({
                "requestVersion":1,
                "requestKind":"module.extension",
                "effectKind":"fixture.score.unknown",
                "namespace":"fixture.score",
                "owner":{"kind":"score"},
                "payload":{}
            }),
            "fixture.score.unknown",
            json!({"kind":"score"}),
            "command.unknown-id",
        ),
    ];

    for (effect, effect_kind, target, failure_code) in cases {
        set_module_prepare_without_affected(
            &mut host,
            json!([pitch_effect_with_step("E"), effect]),
        );
        let rejected: Value = serde_json::from_slice(&session.operate(
            &serde_json::to_vec(&module_submit(json!({"case":effect_kind}))).unwrap(),
            &mut host,
        ))
        .unwrap();
        assert_eq!(
            rejected["failure"],
            json!({
                "code":"command.contribution-effect-rejected",
                "moduleId":"fixture.score.module",
                "contributionId":"fixture.score.contribution.v1",
                "effectIndex":1,
                "effectKind":effect_kind,
                "target":target,
                "failureCode":failure_code
            }),
            "{rejected}"
        );
        assert_eq!(read(&mut session, &mut host), before);
    }

    host.replies["transform"] = serde_json::to_string(&json!({
        "ok":true,
        "transformed":{"status":"replace","schemaVersion":3,"payload":{}}
    }))
    .unwrap()
    .into();
    set_module_prepare_without_affected(
        &mut host,
        json!([pitch_effect(), module_extension_effect()]),
    );
    let rejected: Value = serde_json::from_slice(&session.operate(
        &serde_json::to_vec(&module_submit(json!({"case":"schema-version"}))).unwrap(),
        &mut host,
    ))
    .unwrap();
    assert_eq!(
        rejected["failure"],
        json!({
            "code":"command.contribution-effect-rejected",
            "moduleId":"fixture.score.module",
            "contributionId":"fixture.score.contribution.v1",
            "effectIndex":1,
            "effectKind":"fixture.score.replace",
            "target":{"kind":"score"},
            "failureCode":"command.unsupported-version"
        }),
        "{rejected}"
    );
    assert_eq!(read(&mut session, &mut host), before);
}

#[test]
fn batch_module_effects_derive_affected_from_the_journal_and_reuse_it_for_history() {
    let fixture = fixture();
    let mut input: Value = serde_json::from_str(fixture["initial"].as_str().unwrap()).unwrap();
    input["reportDeliveryVersion"] = json!(2);
    let mut host = host(&fixture);
    host.editing = true;
    let mut session =
        IntegratedKernelSessionV2::create(&serde_json::to_vec(&input).unwrap(), &mut host).unwrap();

    let document = json!({"kind":"document","documentId":"score-1"});
    let event = json!({"kind":"event","eventId":"event-2"});
    let note = json!({"kind":"note","noteId":"note-1"});
    let voice = json!({"kind":"voice","voiceId":"voice-1"});
    let expected = json!([document.clone(), event.clone(), note.clone(), voice.clone()]);
    set_module_prepare(
        &mut host,
        json!([
            pitch_effect(),
            event_remove_effect("event-2"),
            module_extension_effect()
        ]),
        json!([{"kind":"measure","measureId":"plugin-only"}]),
    );
    let batch = json!({"operation":"submit","command":{
        "commandVersion":1,
        "commandId":"core.transaction.batch",
        "target":{"kind":"document","documentId":"score-1"},
        "payload":{"commands":[module_command(json!({"eventId":"event-2"}))]}
    }});
    let committed: Value =
        serde_json::from_slice(&session.operate(&serde_json::to_vec(&batch).unwrap(), &mut host))
            .unwrap();
    assert_eq!(committed["result"]["status"], "committed", "{committed}");
    assert_eq!(committed["result"]["value"]["affected"], expected);

    let undone: Value =
        serde_json::from_slice(&session.operate(br#"{"operation":"undo"}"#, &mut host)).unwrap();
    assert_eq!(undone["result"]["status"], "committed", "{undone}");
    assert_eq!(undone["result"]["value"]["affected"], expected);

    let redone: Value =
        serde_json::from_slice(&session.operate(br#"{"operation":"redo"}"#, &mut host)).unwrap();
    assert_eq!(redone["result"]["status"], "committed", "{redone}");
    assert_eq!(redone["result"]["value"]["affected"], expected);
}

#[test]
fn paged_report_delivery_allows_large_core_edits_noops_batch_and_history_without_truncation() {
    let fixture = fixture();
    let mut input = unsupported_admission_input(4097);
    input["reportDeliveryVersion"] = json!(2);
    let mut host = host(&fixture);
    host.editing = true;
    let mut session =
        IntegratedKernelSessionV2::create(&serde_json::to_vec(&input).unwrap(), &mut host).unwrap();
    let metadata = input["document"]["metadata"].clone();
    let command = |metadata: Value| {
        json!({"commandVersion":1,
        "commandId":"core.document.set-metadata","target":{"kind":"document","documentId":"score-1"},
        "payload":{"metadata":metadata}})
    };
    let mut changed = metadata.clone();
    changed["title"] = json!("paged editing");
    let batch = json!({"commandVersion":1,"commandId":"core.transaction.batch",
        "target":{"kind":"document","documentId":"score-1"},
        "payload":{"commands":[command(metadata.clone()),command(changed.clone())]}});
    for (operation, version, status) in [
        (
            json!({"operation":"submit","command":command(metadata.clone())}),
            0,
            "no-op",
        ),
        (
            json!({"operation":"submit","command":command(changed)}),
            1,
            "committed",
        ),
        (
            json!({"operation":"submit","command":batch}),
            2,
            "committed",
        ),
        (json!({"operation":"undo"}), 3, "committed"),
        (json!({"operation":"redo"}), 4, "committed"),
    ] {
        let output: Value = serde_json::from_slice(
            &session.operate(&serde_json::to_vec(&operation).unwrap(), &mut host),
        )
        .unwrap();
        assert_eq!(output["ok"], true, "{output}");
        assert_eq!(output["result"]["status"], status, "{output}");
        assert_eq!(output["result"]["value"]["documentVersion"], version);
        assert_eq!(
            output["pipeline"]["assessment"]["core"],
            json!({
                "reportVersion":2,"profileId":"brilliant-guitar.k1",
                "status":"unsupported","diagnosticCount":4097
            })
        );
        assert_eq!(
            output["coreReport"],
            json!({
                "reportVersion":2,"profileId":"brilliant-guitar.k1",
                "documentId":"score-1","documentVersion":version
            })
        );
        let page: Value = serde_json::from_slice(&session.operate(
            &serde_json::to_vec(&report_request(version, 4096, 4096)).unwrap(),
            &mut host,
        ))
        .unwrap();
        assert_eq!(page["report"]["total"], 4097);
        assert_eq!(page["report"]["diagnostics"].as_array().unwrap().len(), 1);
    }
    let before = read(&mut session, &mut host);
    let mut invalid = metadata;
    invalid["tempo"]["bpm"] = json!(-1);
    let rejected: Value = serde_json::from_slice(&session.operate(
        &serde_json::to_vec(&json!({"operation":"submit","command":command(invalid)})).unwrap(),
        &mut host,
    ))
    .unwrap();
    assert_eq!(rejected["ok"], false);
    assert!(rejected.get("coreReport").is_none());
    assert!(rejected.get("pipeline").is_none());
    assert_eq!(read(&mut session, &mut host), before);
    let future: Value = serde_json::from_slice(&session.operate(
        &serde_json::to_vec(&report_request(5, 0, 1)).unwrap(),
        &mut host,
    ))
    .unwrap();
    assert_eq!(future["failure"]["code"], "report.stale-version");
}

#[test]
fn report_delivery_negotiation_is_explicit_and_rejects_legacy_hosts() {
    let fixture = fixture();
    for (version, editing) in [
        (json!(2), false),
        (json!(1), true),
        (json!(null), true),
        (json!("2"), true),
    ] {
        let mut input: Value = serde_json::from_str(fixture["initial"].as_str().unwrap()).unwrap();
        input["reportDeliveryVersion"] = version;
        let mut host = host(&fixture);
        host.editing = editing;
        let failure =
            IntegratedKernelSessionV2::create(&serde_json::to_vec(&input).unwrap(), &mut host)
                .err()
                .expect("unsupported negotiation");
        assert_eq!(
            serde_json::from_slice::<Value>(&failure).unwrap(),
            json!({"code":"command.assembly-mismatch"})
        );
        assert!(host.calls.is_empty());
    }
}

#[test]
fn paged_module_validation_failure_does_not_publish_a_report_or_consume_history() {
    let fixture = fixture();
    let mut input: Value = serde_json::from_str(fixture["initial"].as_str().unwrap()).unwrap();
    input["reportDeliveryVersion"] = json!(2);
    let mut host = host(&fixture);
    host.editing = true;
    let mut session =
        IntegratedKernelSessionV2::create(&serde_json::to_vec(&input).unwrap(), &mut host).unwrap();
    let before = read(&mut session, &mut host);
    let request = fixture["journey"]
        .as_array()
        .unwrap()
        .iter()
        .map(|step| step["request"].as_str().unwrap())
        .find(|request| request.contains("\"operation\":\"submit\""))
        .unwrap();
    host.bad = Some("semantic");
    let rejected: Value =
        serde_json::from_slice(&session.operate(request.as_bytes(), &mut host)).unwrap();
    assert_eq!(
        rejected["failure"]["code"],
        "command.contribution-semantic-invalid"
    );
    assert!(rejected.get("coreReport").is_none());
    assert!(rejected.get("pipeline").is_none());
    assert_eq!(read(&mut session, &mut host), before);
    let current: Value = serde_json::from_slice(&session.operate(
        &serde_json::to_vec(&report_request(0, 0, 1)).unwrap(),
        &mut host,
    ))
    .unwrap();
    assert_eq!(current["report"]["status"], "supported");
    assert_eq!(current["report"]["total"], 0);
    host.bad = None;
    let committed: Value =
        serde_json::from_slice(&session.operate(request.as_bytes(), &mut host)).unwrap();
    assert_eq!(committed["result"]["status"], "committed");
    assert_eq!(committed["coreReport"]["documentVersion"], 1);
}

#[test]
fn report_pages_read_every_warning_without_callbacks_or_session_mutation() {
    let fixture = fixture();
    let input = unsupported_admission_input(4097);
    let mut host = host(&fixture);
    host.editing = true;
    let mut session =
        IntegratedKernelSessionV2::create(&serde_json::to_vec(&input).unwrap(), &mut host).unwrap();
    let before = read(&mut session, &mut host);
    let calls = host.calls.clone();
    let mut diagnostics = Vec::new();
    for (offset, count, next) in [(0, 4096, json!(4096)), (4096, 1, Value::Null)] {
        let output: Value = serde_json::from_slice(&session.operate(
            &serde_json::to_vec(&report_request(0, offset, 4096)).unwrap(),
            &mut host,
        ))
        .unwrap();
        assert_eq!(output["ok"], true, "{output}");
        let report = &output["report"];
        assert_eq!(report["reportVersion"], 2);
        assert_eq!(report["documentId"], "score-1");
        assert_eq!(report["documentVersion"], 0);
        assert_eq!(report["profileId"], "brilliant-guitar.k1");
        assert_eq!(report["status"], "unsupported");
        assert_eq!(report["offset"], offset);
        assert_eq!(report["total"], 4097);
        assert_eq!(report["nextOffset"], next);
        let rows = report["diagnostics"].as_array().unwrap();
        assert_eq!(rows.len(), count);
        diagnostics.extend_from_slice(rows);
    }
    for (index, diagnostic) in diagnostics.iter().enumerate() {
        assert_eq!(
            diagnostic,
            &json!({
                "code":"unsupported.meter","messageKey":"core.unsupported.meter",
                "path":["measureDefinitions",index,"meter"]
            })
        );
    }
    assert_eq!(read(&mut session, &mut host), before);
    assert_eq!(host.calls, calls);
}

#[test]
fn report_page_identity_and_bounds_fail_closed_and_stay_stale_after_undo() {
    let fixture = fixture();
    let input = unsupported_admission_input(2);
    let mut host = host(&fixture);
    host.editing = true;
    let mut session =
        IntegratedKernelSessionV2::create(&serde_json::to_vec(&input).unwrap(), &mut host).unwrap();
    let before = read(&mut session, &mut host);
    let calls = host.calls.clone();
    let request = report_request(0, 0, 1);
    let mut rejected = Vec::new();
    for (key, value, code) in [
        ("reportVersion", json!(1), "report.invalid-request"),
        ("documentVersion", json!(-1), "report.invalid-request"),
        ("documentVersion", json!(1), "report.stale-version"),
        ("documentId", json!("other"), "report.document-mismatch"),
        ("documentId", json!(false), "report.invalid-request"),
        ("profileId", json!("other"), "report.invalid-request"),
        ("limit", json!(0), "report.invalid-request"),
        ("limit", json!(4097), "report.invalid-request"),
        ("offset", json!(-1), "report.invalid-request"),
        ("offset", json!(0.5), "report.invalid-request"),
        (
            "offset",
            json!(9007199254740992_u64),
            "report.invalid-request",
        ),
        ("offset", json!(3), "report.offset-out-of-bounds"),
    ] {
        let mut candidate = request.clone();
        candidate[key] = value;
        rejected.push((candidate, code));
    }
    let mut extra = request.clone();
    extra["extra"] = json!(true);
    rejected.push((extra, "report.invalid-request"));
    for key in request
        .as_object()
        .unwrap()
        .keys()
        .filter(|key| *key != "operation")
    {
        let mut missing = request.clone();
        missing.as_object_mut().unwrap().remove(key);
        rejected.push((missing, "report.invalid-request"));
    }
    for (request, code) in rejected {
        let result: Value = serde_json::from_slice(
            &session.operate(&serde_json::to_vec(&request).unwrap(), &mut host),
        )
        .unwrap();
        assert_eq!(result["ok"], false, "{request}");
        assert_eq!(result["failure"]["code"], code, "{request}");
    }
    assert_eq!(read(&mut session, &mut host), before);
    assert_eq!(host.calls, calls);
    let mut metadata = input["document"]["metadata"].clone();
    metadata["title"] = json!("changed");
    let edit = json!({"operation":"submit","command":{"commandVersion":1,
        "commandId":"core.document.set-metadata","target":{"kind":"document","documentId":"score-1"},
        "payload":{"metadata":metadata}}});
    for (operation, version) in [(edit, 1), (json!({"operation":"undo"}), 2)] {
        let changed: Value = serde_json::from_slice(
            &session.operate(&serde_json::to_vec(&operation).unwrap(), &mut host),
        )
        .unwrap();
        assert_eq!(changed["ok"], true, "{changed}");
        let stale: Value = serde_json::from_slice(
            &session.operate(&serde_json::to_vec(&request).unwrap(), &mut host),
        )
        .unwrap();
        assert_eq!(stale["failure"]["code"], "report.stale-version");
        assert_eq!(stale["documentVersion"], version);
        let fresh: Value = serde_json::from_slice(&session.operate(
            &serde_json::to_vec(&report_request(version, 1, 1)).unwrap(),
            &mut host,
        ))
        .unwrap();
        assert_eq!(fresh["ok"], true, "{fresh}");
        assert_eq!(fresh["report"]["documentVersion"], version);
        assert_eq!(fresh["report"]["offset"], 1);
        assert_eq!(fresh["report"]["nextOffset"], Value::Null);
    }
}

#[test]
fn scoped_admission_does_not_materialize_an_unused_feature_report_but_edit_reports_stay_bounded() {
    let fixture = fixture();
    for measures in [4096, 4097] {
        let input = unsupported_admission_input(measures);
        let mut host = host(&fixture);
        host.editing = true;
        let mut session =
            IntegratedKernelSessionV2::create(&serde_json::to_vec(&input).unwrap(), &mut host)
                .unwrap_or_else(|error| {
                    panic!(
                        "valid unsupported admission: {}",
                        String::from_utf8_lossy(&error)
                    )
                });
        let before = read(&mut session, &mut host);
        assert_eq!(before["state"]["snapshot"]["document"], input["document"]);
        let mut metadata = input["document"]["metadata"].clone();
        metadata["title"] = json!("changed");
        let command = json!({"operation":"submit","command":{"commandVersion":1,
            "commandId":"core.document.set-metadata","target":{"kind":"document","documentId":"score-1"},
            "payload":{"metadata":metadata}}});
        let output: Value = serde_json::from_slice(
            &session.operate(&serde_json::to_vec(&command).unwrap(), &mut host),
        )
        .unwrap();
        if measures == 4096 {
            assert_eq!(output["ok"], true);
            assert_eq!(
                output["pipeline"]["assessment"]["core"]["status"],
                "unsupported"
            );
            assert_eq!(
                output["pipeline"]["assessment"]["core"]["diagnostics"]
                    .as_array()
                    .unwrap()
                    .len(),
                4096
            );
        } else {
            assert_eq!(output["ok"], false);
            assert_eq!(
                output["failure"],
                json!({"code":"command.resource-limit-exceeded",
                "limitKind":"diagnostics","limit":4096,"actual":4097})
            );
            assert_eq!(read(&mut session, &mut host), before);
        }
    }
}

#[test]
fn runtime_scheduled_assessment_preserves_the_recorded_edit_and_history_journey() {
    let fixture = fixture();
    let mut host = host(&fixture);
    let mut session = IntegratedKernelSessionV2::create(
        fixture["initial"].as_str().unwrap().as_bytes(),
        &mut host,
    )
    .unwrap();
    for step in fixture["journey"].as_array().unwrap() {
        let actual = serde_json::from_slice(
            &session.operate(step["request"].as_str().unwrap().as_bytes(), &mut host),
        )
        .unwrap();
        let expected = serde_json::from_str(step["response"].as_str().unwrap()).unwrap();
        assert_eq!(without_metrics(actual), without_metrics(expected));
    }
    assert_eq!(host.calls, ["validate", "classify", "validate", "classify"]);
}

#[test]
fn runtime_schedules_decode_prepare_decode_transform_against_each_exact_candidate() {
    let fixture = fixture();
    let mut host = host(&fixture);
    host.editing = true;
    let mut session = IntegratedKernelSessionV2::create(
        fixture["initial"].as_str().unwrap().as_bytes(),
        &mut host,
    )
    .unwrap();
    for step in fixture["journey"].as_array().unwrap() {
        let actual = serde_json::from_slice(
            &session.operate(step["request"].as_str().unwrap().as_bytes(), &mut host),
        )
        .unwrap();
        let expected = serde_json::from_str(step["response"].as_str().unwrap()).unwrap();
        assert_eq!(without_metrics(actual), without_metrics(expected));
    }
    assert_eq!(
        host.calls,
        [
            "commandDecode",
            "commandPrepare",
            "effectDecode",
            "effectTransform",
            "validate",
            "classify",
            "validate",
            "classify"
        ]
    );
}

#[test]
fn runtime_rejects_invalid_individual_results_and_swallowed_reads_without_history_adoption() {
    let fixture = fixture();
    let mut host = host(&fixture);
    let mut session = IntegratedKernelSessionV2::create(
        fixture["initial"].as_str().unwrap().as_bytes(),
        &mut host,
    )
    .unwrap();
    let before = read(&mut session, &mut host);
    for (bad, code) in [
        ("semantic", "command.contribution-semantic-invalid"),
        ("cap", "command.contribution-contract-violation"),
        ("forged", "command.contribution-contract-violation"),
        ("read", "command.contribution-internal-error"),
    ] {
        host.bad = Some(bad);
        host.calls.clear();
        let actual: Value = serde_json::from_slice(
            &session.operate(
                fixture["journey"][1]["request"]
                    .as_str()
                    .unwrap()
                    .as_bytes(),
                &mut host,
            ),
        )
        .unwrap();
        assert_eq!(actual["ok"], false);
        assert_eq!(actual["failure"]["code"], code);
        assert!(actual["result"].is_null());
        assert_eq!(host.calls, ["validate"]);
        assert_eq!(read(&mut session, &mut host), before);
    }
    host.bad = None;
    let actual: Value = serde_json::from_slice(
        &session.operate(
            fixture["journey"][1]["request"]
                .as_str()
                .unwrap()
                .as_bytes(),
            &mut host,
        ),
    )
    .unwrap();
    assert_eq!(actual["result"]["status"], "committed");
}

#[test]
fn runtime_owns_cross_contribution_issue_limits_in_both_assessment_phases() {
    struct ManyIssues {
        phase: &'static str,
    }
    impl ContributionExecutorV2 for ManyIssues {
        fn uses_scoped_assessment(&self) -> bool {
            true
        }
        fn execute(&mut self, bytes: &[u8]) -> Result<Vec<u8>, ContributionExecutionFailureV2> {
            let request: Value = serde_json::from_slice(bytes).unwrap();
            if request["operation"] == "assessmentStart" {
                return Ok(br#"{"ok":true,"scheduleVersion":3}"#.to_vec());
            }
            let phase = request["callbackOperation"].as_str().unwrap();
            let module = request["moduleId"].as_str().unwrap();
            let issue = json!({"issueVersion":1,"code":format!("{module}.issue"),
                "messageKey":format!("module.{module}.issue"),"severity":"warning",
                "source":{"kind":"module","moduleId":module,"contributionId":request["contributionId"]}});
            let issues = if phase == self.phase {
                vec![issue; 1024]
            } else {
                vec![]
            };
            let value = if phase == "validate" {
                json!(issues)
            } else {
                json!({"status":"unsupported","issues":issues})
            };
            Ok(serde_json::to_vec(&json!({"ok":true,"value":value})).unwrap())
        }
    }
    for phase in ["validate", "classify"] {
        for count in [4, 5] {
            let fixture = fixture();
            let mut input: Value =
                serde_json::from_str(fixture["initial"].as_str().unwrap()).unwrap();
            input["commands"] = json!([]);
            input["effects"] = json!([]);
            input["catalog"]["contributions"] = json!((0..count).map(|i| {
                let module = format!("fixture.module-{i}");
                let contribution = format!("fixture.contribution-{i}");
                json!({"moduleId":module,"contributionId":contribution,"requirements":[{
                    "requirementVersion":1,"namespace":format!("fixture.namespace-{i}"),
                    "moduleId":module,"contributionId":contribution,"supportedSchemaVersions":[1],"requiredForWrite":true
                }]})
            }).collect::<Vec<_>>());
            input["document"]["extensions"] = json!((0..count).map(|i| json!({
                "namespace":format!("fixture.namespace-{i}"),"schemaVersion":1,"owner":{"kind":"score"},"payload":{}
            })).collect::<Vec<_>>());
            let result = IntegratedKernelSessionV2::create(
                &serde_json::to_vec(&input).unwrap(),
                &mut ManyIssues { phase },
            );
            if count == 4 && phase == "classify" {
                assert!(result.is_ok());
            } else {
                let error: Value =
                    serde_json::from_slice(&result.err().expect("assessment must reject")).unwrap();
                if count == 5 {
                    assert_eq!(
                        error,
                        json!({"code":"command.resource-limit-exceeded","limitKind":"module-issues","limit":4096,"actual":4097})
                    );
                } else {
                    assert_eq!(error["code"], "command.contribution-semantic-invalid");
                    assert_eq!(error["issues"].as_array().unwrap().len(), 4096);
                }
            }
        }
    }
}
