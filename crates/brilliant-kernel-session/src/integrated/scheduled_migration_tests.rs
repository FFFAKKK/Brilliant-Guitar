use super::*;
use serde_json::{Value, json};

fn input() -> Value {
    let fixture: Value =
        serde_json::from_str(include_str!("../wasm/fixtures/session.json")).unwrap();
    let mut input: Value = serde_json::from_str(fixture["initial"].as_str().unwrap()).unwrap();
    input.as_object_mut().unwrap().remove("inventory");
    input["assessmentReads"] = json!([]);
    input["document"]["extensions"] = json!([{
        "namespace":"fixture.score","owner":{"kind":"score"},
        "schemaVersion":1,"payload":{"marker":"old"}
    }]);
    input["request"] = json!({
        "migrationVersion":1,"moduleId":"fixture.score.module",
        "contributionId":"fixture.score.contribution.v1","effectKind":"fixture.score.replace",
        "namespace":"fixture.score","owner":{"kind":"score"},
        "sourceSchemaVersion":1,"targetSchemaVersion":2,"payload":{"marker":"migrated"}
    });
    input
}

#[derive(Default)]
struct Host {
    phases: Vec<String>,
    fail_read: Option<&'static str>,
    bad: Option<&'static str>,
    issue_count: usize,
}
impl ContributionExecutorV2 for Host {
    fn uses_scoped_preparation(&self) -> bool {
        true
    }
    fn execute(&mut self, _: &[u8]) -> Result<Vec<u8>, ContributionExecutionFailureV2> {
        panic!("migration must bind Core reads")
    }
    fn execute_with_core_reads(
        &mut self,
        bytes: &[u8],
        reads: &mut dyn ContributionCoreReadV2,
    ) -> Result<Vec<u8>, ContributionExecutionFailureV2> {
        let request: Value = serde_json::from_slice(bytes).unwrap();
        assert!(request.get("document").is_none());
        assert_eq!(request["documentVersion"], Value::Null);
        let phase = if request["operation"] == "migrationStart" {
            "start"
        } else {
            assert_eq!(request["operation"], "migrationCallback");
            request["callbackOperation"].as_str().unwrap()
        };
        self.phases.push(phase.into());
        let reply: Value = serde_json::from_slice(&reads.read_core(
            br#"{"readVersion":2,"selectorId":"core.selector.score-entity","address":{"kind":"note","noteId":"note-1"}}"#
        ).unwrap()).unwrap();
        assert_eq!(reply["documentVersion"], Value::Null);
        assert_eq!(
            reply["result"]["value"]["value"]["writtenPitch"]["step"],
            "C"
        );
        if self.fail_read == Some(phase) {
            assert!(reads.read_core(b"invalid").is_err());
        }
        let response = match phase {
            "start" => json!({"ok":true,"scheduleVersion":if self.bad == Some("ack") {3} else {4}}),
            "effectDecode" => json!({"ok":true,"value":if self.bad == Some("decode") {
                json!({"status":"invalid"})
            } else {json!({"status":"decoded","payload":request["arguments"][0]})}}),
            "effectTransform" => {
                let arg = &request["arguments"][0];
                assert!(arg["view"].get("coreDocument").is_none());
                assert_eq!(arg["view"]["documentVersion"], Value::Null);
                assert_eq!(arg["currentBlock"]["schemaVersion"], 1);
                json!({"ok":true,"value":if self.bad == Some("transform") {json!({"status":"remove"})}
                    else {json!({"status":"replace","schemaVersion":2,"payload":{"marker":"migrated"}})}})
            }
            "validate" => {
                let view = &request["arguments"][0];
                assert_eq!(request["definitionId"], Value::Null);
                assert!(view.get("coreDocument").is_none());
                assert_eq!(view["documentVersion"], Value::Null);
                if request["moduleId"] == "fixture.score.module" {
                    assert_eq!(view["compatibleExtensions"][0]["schemaVersion"], 2);
                    assert_eq!(
                        view["compatibleExtensions"][0]["payload"]["marker"],
                        "migrated"
                    );
                }
                let module = request["moduleId"].as_str().unwrap();
                let issue = json!({"issueVersion":1,"code":format!("{module}.issue"),
                    "messageKey":format!("module.{module}.issue"),"severity":"error",
                    "source":{"kind":"module","moduleId":module,"contributionId":request["contributionId"]}});
                json!({"ok":true,"value":if self.bad == Some("forged") {json!({"ok":true})}
                    else {json!(vec![issue; self.issue_count])}})
            }
            _ => panic!("unexpected migration phase"),
        };
        Ok(serde_json::to_vec(&response).unwrap())
    }
}
fn run(input: &Value, host: &mut Host) -> Value {
    serde_json::from_slice(&IntegratedKernelSessionV2::migrate_extension(
        &serde_json::to_vec(input).unwrap(),
        host,
    ))
    .unwrap()
}

#[test]
fn scoped_migration_binds_old_and_replacement_views_and_preserves_idempotence() {
    let mut input = input();
    let original = input.clone();
    let mut host = Host::default();
    let result = run(&input, &mut host);
    assert_eq!(result["status"], "migrated");
    assert_eq!(
        host.phases,
        ["start", "effectDecode", "effectTransform", "validate"]
    );
    assert_eq!(input, original);
    input["document"] = result["document"].clone();
    host.phases.clear();
    let result = run(&input, &mut host);
    assert_eq!(result["status"], "not-required");
    assert_eq!(result["document"], input["document"]);
    assert_eq!(host.phases, ["start"]);
}

#[test]
fn scoped_migration_rejects_swallowed_reads_and_bad_results_and_recovers() {
    let input = input();
    for phase in ["start", "effectDecode", "effectTransform", "validate"] {
        let mut host = Host {
            fail_read: Some(phase),
            ..Host::default()
        };
        let result = run(&input, &mut host);
        assert_eq!(result["status"], "rejected");
        assert!(result.get("document").is_none());
        assert_eq!(host.phases.last().unwrap(), phase);
        host.fail_read = None;
        assert_eq!(run(&input, &mut host)["status"], "migrated");
    }
    for bad in ["ack", "decode", "transform", "forged"] {
        let result = run(
            &input,
            &mut Host {
                bad: Some(bad),
                ..Host::default()
            },
        );
        assert_eq!(result["status"], "rejected");
        assert!(result.get("document").is_none());
    }
    for count in [1, 1024, 1025] {
        let result = run(
            &input,
            &mut Host {
                issue_count: count,
                ..Host::default()
            },
        );
        assert_eq!(
            result["failure"]["code"],
            if count <= 1024 {
                "migration.contribution-semantic-invalid"
            } else {
                "migration.contribution-contract-violation"
            }
        );
    }
}

#[test]
fn scoped_migration_owns_cross_contribution_issue_cap() {
    for extra in [3, 4] {
        let mut input = input();
        for i in 0..extra {
            let module = format!("fixture.extra-{i}");
            let contribution = format!("fixture.extra-{i}.v1");
            input["catalog"]["contributions"].as_array_mut().unwrap().push(json!({
                "moduleId":module,"contributionId":contribution,"requirements":[{
                    "requirementVersion":1,"namespace":module,"moduleId":module,"contributionId":contribution,
                    "supportedSchemaVersions":[1],"requiredForWrite":true
                }]
            }));
            input["document"]["extensions"]
                .as_array_mut()
                .unwrap()
                .push(json!({
                    "namespace":module,"schemaVersion":1,"owner":{"kind":"score"},"payload":{}
                }));
        }
        let result = run(
            &input,
            &mut Host {
                issue_count: 1024,
                ..Host::default()
            },
        );
        assert_eq!(
            result["failure"]["code"],
            if extra == 3 {
                "migration.contribution-semantic-invalid"
            } else {
                "migration.contribution-contract-violation"
            }
        );
        if extra == 3 {
            assert_eq!(result["failure"]["issues"].as_array().unwrap().len(), 4096);
        }
    }
}
