use super::*;
use serde_json::{Value, json};

const NOTE: &[u8] = br#"{"readVersion":2,"selectorId":"core.selector.score-entity","address":{"kind":"note","noteId":"note-1"}}"#;

struct Reader {
    callbacks: Value,
    observations: Vec<(String, Value, String)>,
    exhaust: bool,
}
impl ContributionExecutorV2 for Reader {
    fn execute(&mut self, request: &[u8]) -> Result<Vec<u8>, ContributionExecutionFailureV2> {
        let request: Value = serde_json::from_slice(request).unwrap();
        let key = match request["operation"].as_str().unwrap() {
            "prepare" => "prepare",
            "transform" => "transform",
            "assess"
                if request["document"]["extensions"]
                    .as_array()
                    .unwrap()
                    .is_empty() =>
            {
                "assessEmpty"
            }
            "assess" => "assessPopulated",
            _ => panic!("unexpected callback"),
        };
        Ok(self.callbacks[key].as_str().unwrap().as_bytes().to_vec())
    }
    fn execute_with_core_reads(
        &mut self,
        request: &[u8],
        reads: &mut dyn ContributionCoreReadV2,
    ) -> Result<Vec<u8>, ContributionExecutionFailureV2> {
        let input: Value = serde_json::from_slice(request).unwrap();
        let reply: Value = serde_json::from_slice(&reads.read_core(NOTE).unwrap()).unwrap();
        let expected = &input["document"]["parts"][0]["measureContents"][0]["voices"][0]["sequence"]
            ["events"][0]["content"]["notes"][0];
        assert_eq!(&reply["result"]["value"]["value"], expected);
        self.observations.push((
            input["operation"].as_str().unwrap().into(),
            reply["documentVersion"].clone(),
            expected["writtenPitch"]["step"].as_str().unwrap().into(),
        ));
        if self.exhaust {
            self.exhaust = false;
            for _ in 0..128 {
                let _ = reads.read_core(NOTE);
            }
            assert_eq!(
                reads.read_core(NOTE),
                Err(ContributionReadFailureV2::ResourceLimit)
            );
        }
        // Deliberately return a valid reply even after swallowing read exhaustion.
        self.execute(request)
    }
}
fn fixture() -> Value {
    serde_json::from_str(include_str!("../wasm/fixtures/session.json")).unwrap()
}
fn reader(fixture: &Value) -> Reader {
    Reader {
        callbacks: fixture["callbacks"].clone(),
        observations: Vec::new(),
        exhaust: false,
    }
}

#[test]
fn reads_follow_prepare_transform_final_candidate_and_history_at_equal_versions() {
    let fixture = fixture();
    let mut executor = reader(&fixture);
    let mut session = IntegratedKernelSessionV2::create(
        fixture["initial"].as_str().unwrap().as_bytes(),
        &mut executor,
    )
    .unwrap();
    executor.observations.clear();
    for step in fixture["journey"].as_array().unwrap() {
        let actual: Value = serde_json::from_slice(
            &session.operate(step["request"].as_str().unwrap().as_bytes(), &mut executor),
        )
        .unwrap();
        let expected: Value = serde_json::from_str(step["response"].as_str().unwrap()).unwrap();
        assert_eq!(actual, expected);
    }
    assert_eq!(
        executor.observations[0],
        ("prepare".into(), json!(0), "C".into())
    );
    assert_eq!(
        executor.observations[1],
        ("transform".into(), json!(0), "D".into())
    );
    assert!(
        executor
            .observations
            .iter()
            .any(|(op, _, pitch)| op == "assess" && pitch == "C")
    );
    assert!(
        executor
            .observations
            .iter()
            .any(|(op, _, pitch)| op == "assess" && pitch == "D")
    );
}

#[test]
fn swallowed_read_exhaustion_rolls_back_effective_batch_and_next_operation_recovers() {
    let fixture = fixture();
    let mut executor = reader(&fixture);
    let mut session = IntegratedKernelSessionV2::create(
        fixture["initial"].as_str().unwrap().as_bytes(),
        &mut executor,
    )
    .unwrap();
    let command: Value =
        serde_json::from_str(fixture["journey"][1]["request"].as_str().unwrap()).unwrap();
    let batch = serde_json::to_vec(&json!({"operation":"submit","command":{
        "commandVersion":1,"commandId":"core.transaction.batch","target":{"kind":"document","documentId":"score-1"},
        "payload":{"commands":[{"commandVersion":1,"commandId":"core.note.set-written-pitch","target":{"kind":"note","noteId":"note-1"},
        "payload":{"writtenPitch":{"step":"E","alter":0,"octave":4}}},command["command"]]}}})).unwrap();
    let mut before: Value =
        serde_json::from_slice(&session.operate(br#"{"operation":"read"}"#, &mut executor))
            .unwrap();
    executor.exhaust = true;
    let rejected: Value = serde_json::from_slice(&session.operate(&batch, &mut executor)).unwrap();
    assert_eq!(rejected["ok"], false);
    assert!(rejected["result"]["events"].is_null());
    assert!(
        executor
            .observations
            .iter()
            .any(|(op, _, pitch)| op == "prepare" && pitch == "E")
    );
    let mut after: Value =
        serde_json::from_slice(&session.operate(br#"{"operation":"read"}"#, &mut executor))
            .unwrap();
    before
        .as_object_mut()
        .unwrap()
        .remove("callbackProjections");
    after.as_object_mut().unwrap().remove("callbackProjections");
    assert_eq!(before, after);
    let accepted: Value = serde_json::from_slice(
        &session.operate(
            fixture["journey"][1]["request"]
                .as_str()
                .unwrap()
                .as_bytes(),
            &mut executor,
        ),
    )
    .unwrap();
    assert_eq!(accepted["ok"], true);
}

#[test]
fn detached_migration_reads_are_unversioned_and_swallowed_failure_rejects_each_phase() {
    struct MigrationReader<'a> {
        fail_at: Option<&'a str>,
        phases: Vec<String>,
    }
    impl ContributionExecutorV2 for MigrationReader<'_> {
        fn execute(&mut self, _: &[u8]) -> Result<Vec<u8>, ContributionExecutionFailureV2> {
            panic!("migration must supply its candidate-bound capability")
        }
        fn execute_with_core_reads(
            &mut self,
            request: &[u8],
            reads: &mut dyn ContributionCoreReadV2,
        ) -> Result<Vec<u8>, ContributionExecutionFailureV2> {
            let input: Value = serde_json::from_slice(request).unwrap();
            let phase = input["operation"].as_str().unwrap();
            self.phases.push(phase.into());
            let reply: Value = serde_json::from_slice(&reads.read_core(NOTE).unwrap()).unwrap();
            assert_eq!(reply["documentVersion"], Value::Null);
            assert_eq!(
                reply["result"]["value"]["value"],
                input["document"]["parts"][0]["measureContents"][0]["voices"][0]["sequence"]["events"]
                    [0]["content"]["notes"][0]
            );
            if self.fail_at == Some(phase) {
                assert_eq!(
                    reads.read_core(b"invalid"),
                    Err(ContributionReadFailureV2::InvalidRequest)
                );
            }
            Ok(match phase {
                "migrationPrepare" => {
                    br#"{"ok":true,"schemaVersion":2,"payload":{"marker":"migrated"}}"#.to_vec()
                }
                "migrationValidate" => br#"{"ok":true}"#.to_vec(),
                _ => panic!("unexpected callback"),
            })
        }
    }
    let fixture = fixture();
    let mut input: Value = serde_json::from_str(fixture["initial"].as_str().unwrap()).unwrap();
    input.as_object_mut().unwrap().remove("inventory");
    input["document"]["extensions"] = json!([{
        "namespace":"fixture.score","owner":{"kind":"score"},
        "schemaVersion":1,"payload":{"marker":"old"}
    }]);
    input["request"] = json!({
        "migrationVersion":1,"moduleId":"fixture.score.module",
        "contributionId":"fixture.score.contribution.v1","effectKind":"fixture.score.replace",
        "namespace":"fixture.score","owner":{"kind":"score"},
        "sourceSchemaVersion":1,"targetSchemaVersion":2,"payload":{}
    });
    let bytes = serde_json::to_vec(&input).unwrap();
    for fail_at in [None, Some("migrationPrepare"), Some("migrationValidate")] {
        let mut executor = MigrationReader {
            fail_at,
            phases: vec![],
        };
        let result: Value = serde_json::from_slice(&IntegratedKernelSessionV2::migrate_extension(
            &bytes,
            &mut executor,
        ))
        .unwrap();
        if fail_at.is_some() {
            assert_eq!(result["status"], "rejected");
            assert_eq!(
                result["failure"]["code"],
                if fail_at == Some("migrationPrepare") {
                    "migration.contribution-internal-error"
                } else {
                    // Aggregate validation has no individual contribution source.
                    "migration.internal-error"
                }
            );
            assert!(result.get("document").is_none());
        } else {
            assert_eq!(result["status"], "migrated");
            assert_eq!(result["document"]["extensions"][0]["schemaVersion"], 2);
            assert_eq!(
                result["document"]["extensions"][0]["payload"]["marker"],
                "migrated"
            );
        }
        assert_eq!(
            executor.phases.len(),
            if fail_at == Some("migrationPrepare") {
                1
            } else {
                2
            }
        );
    }
}
