use super::*;
use brilliant_core_types::JsString;
use brilliant_extension_protocol::{ContributionCoreReadV2, ContributionExecutionFailureV2};

fn at<'a>(value: &'a Value, path: &[&str]) -> &'a Value {
    path.iter()
        .fold(value, |value, key| field(value, key).unwrap())
}
fn utf8(value: &Value) -> String {
    string(value).unwrap().to_utf8().unwrap()
}

struct Host {
    callbacks: Value,
    reject: bool,
    validations: usize,
}
impl ContributionExecutorV2 for Host {
    fn uses_scoped_assessment(&self) -> bool {
        true
    }
    fn execute(
        &mut self,
        _: &[u8],
    ) -> std::result::Result<Vec<u8>, ContributionExecutionFailureV2> {
        unreachable!()
    }
    fn execute_with_core_reads(
        &mut self,
        bytes: &[u8],
        _: &mut dyn ContributionCoreReadV2,
    ) -> std::result::Result<Vec<u8>, ContributionExecutionFailureV2> {
        let input = decode(bytes).unwrap();
        let response: &[u8] = match utf8(at(&input, &["operation"])).as_str() {
            "assessmentStart" => br#"{"ok":true,"scheduleVersion":3}"#,
            "assessmentCallback" => {
                if tag(&input, "callbackOperation", "validate") {
                    self.validations += 1;
                    if self.reject {
                        // Malformed callback results must still poison the attempt.
                        br#"{"ok":true,"value":{"invalid":true}}"#
                    } else {
                        br#"{"ok":true,"value":[]}"#
                    }
                } else {
                    br#"{"ok":true,"value":{"status":"supported","issues":[]}}"#
                }
            }
            phase @ ("prepare" | "transform") => {
                return Ok(utf8(at(&self.callbacks, &[phase])).into_bytes());
            }
            _ => panic!("unexpected callback"),
        };
        Ok(response.to_vec())
    }
}

#[test]
fn module_classification_reuse_keeps_validation_and_failed_candidates_out_of_the_cache() {
    let fixture = decode(include_bytes!(
        "../../../../../brilliant-kernel-session/src/wasm/fixtures/session.json"
    ))
    .unwrap();
    let mut host = Host {
        callbacks: at(&fixture, &["callbacks"]).clone(),
        reject: false,
        validations: 0,
    };
    let mut state =
        IntegratedKernelRuntimeV2::create(utf8(at(&fixture, &["initial"])).as_bytes(), &mut host)
            .unwrap();
    let request = array(at(&fixture, &["journey"]))
        .unwrap()
        .iter()
        .map(|step| utf8(at(step, &["request"])))
        .find(|request| tag(&decode(request.as_bytes()).unwrap(), "operation", "submit"))
        .unwrap();
    let dispatch: CoreDispatch = |_, _| panic!("module must not use Core dispatch");
    let first = state.operate(request.as_bytes(), &mut host, dispatch);
    let first = decode(&first).unwrap();
    assert!(tag(at(&first, &["result"]), "status", "committed"));
    assert_eq!(state.classification_scans, 1);
    let published = state.core_classification.clone();
    let validations = host.validations;
    host.reject = true;
    let rejected = decode(&state.operate(request.as_bytes(), &mut host, dispatch)).unwrap();
    assert_eq!(at(&rejected, &["ok"]), &JsonValue::Bool(false));
    assert_eq!(state.core_classification, published);
    assert_eq!(state.classification_scans, 1);
    assert!(host.validations > validations);
    host.reject = false;
    let repeated = decode(&state.operate(request.as_bytes(), &mut host, dispatch)).unwrap();
    assert!(tag(at(&repeated, &["result"]), "status", "no-op"));
    assert_eq!(state.classification_scans, 1);
    assert_eq!(
        at(&repeated, &["pipeline", "assessment"]),
        at(&first, &["pipeline", "assessment"])
    );

    // Even a cached supported report cannot mask invalid candidate semantics.
    let mut invalid = state.runtime.store.export_document().unwrap();
    invalid.metadata.tempo.bpm = brilliant_core_types::FiniteNumber::new(0.0).unwrap();
    let cached = state.core_classification.as_ref().unwrap().1.clone();
    let calls = host.validations;
    let error = state
        .assess_with_classification(&invalid, 2, &mut host, Some(cached))
        .unwrap_err();
    assert!(tag(&error, "code", "command.semantic-invalid"));
    assert_eq!(host.validations, calls);
    assert_eq!(state.core_classification, published);

    // A structurally different candidate can classify successfully and then
    // fail plugin validation. Its unsupported report must never be published.
    let mut candidate = state.runtime.store.export_document().unwrap();
    candidate.measure_definitions[0].meter.numerator =
        brilliant_core_types::SafeInteger::new(8).unwrap();
    candidate.measure_definitions[0].meter.denominator =
        brilliant_core_types::SafeInteger::new(8).unwrap();
    host.reject = true;
    assert!(state.assess(&candidate, 2, &mut host).is_err());
    assert_eq!(state.classification_scans, 2);
    assert_eq!(state.core_classification, published);
    host.reject = false;
    let repeated = decode(&state.operate(request.as_bytes(), &mut host, dispatch)).unwrap();
    assert_eq!(state.classification_scans, 2);
    assert_eq!(
        at(&repeated, &["pipeline", "assessment"]),
        at(&first, &["pipeline", "assessment"])
    );

    // A report belonging to any other document version is not eligible.
    state.core_classification.as_mut().unwrap().0 = DocumentVersionV1::try_from(0).unwrap();
    let repeated = decode(&state.operate(request.as_bytes(), &mut host, dispatch)).unwrap();
    assert!(tag(at(&repeated, &["result"]), "status", "no-op"));
    assert_eq!(state.classification_scans, 3);
    assert_eq!(state.core_classification, published);
}

#[test]
fn both_integrated_read_forms_preserve_opaque_order_outside_the_legacy_snapshot_codec() {
    let fixture = decode(include_bytes!(
        "../../../../../brilliant-kernel-session/src/wasm/fixtures/session.json"
    ))
    .unwrap();
    let mut input = decode(utf8(at(&fixture, &["initial"])).as_bytes()).unwrap();
    let JsonValue::Object(root) = &mut input else {
        unreachable!()
    };
    let JsonValue::Object(document) = root.get_mut(&JsString::from("document")).unwrap() else {
        unreachable!()
    };
    let JsonValue::Array(extensions) = document.get_mut(&JsString::from("extensions")).unwrap()
    else {
        unreachable!()
    };
    extensions.push(object([
        ("namespace", text("fixture.unknown")),
        ("schemaVersion", number(1)),
        ("owner", object([("kind", text("score"))])),
        ("payload", object([("z", number(1)), ("a", number(2))])),
    ]));
    let mut host = Host {
        callbacks: at(&fixture, &["callbacks"]).clone(),
        reject: false,
        validations: 0,
    };
    let mut state = IntegratedKernelRuntimeV2::create(&encode(&input).unwrap(), &mut host).unwrap();
    for request in [
        br#"{"operation":"read"}"#.as_slice(),
        br#"{"operation":"read","knownSnapshotVersion":null}"#.as_slice(),
    ] {
        let read = decode(&state.operate(request, &mut host, |_, _| unreachable!())).unwrap();
        let blocks = array(at(&read, &["state", "snapshot", "document", "extensions"])).unwrap();
        let JsonValue::Object(payload) = at(&blocks[0], &["payload"]) else {
            unreachable!()
        };
        assert_eq!(
            payload
                .keys()
                .map(|key| key.to_utf8().unwrap())
                .collect::<Vec<_>>(),
            ["z", "a"]
        );
    }
}
