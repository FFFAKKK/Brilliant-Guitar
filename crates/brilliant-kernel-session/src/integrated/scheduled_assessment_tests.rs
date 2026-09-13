use super::*;
use serde_json::{Value, json};

struct Host {
    replies: Value,
    calls: Vec<String>,
    bad: Option<&'static str>,
    editing: bool,
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
            assert_eq!(reply["documentVersion"], 0);
            assert_eq!(
                reply["result"]["value"]["value"]["writtenPitch"]["step"],
                if phase.starts_with("command") {
                    "C"
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
                    assert!(request["arguments"][0].get("currentBlock").is_none());
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
