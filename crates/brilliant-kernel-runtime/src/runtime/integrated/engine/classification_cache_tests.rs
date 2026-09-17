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

#[test]
fn overfull_admission_exposes_version_bound_rule_warning_page() {
    let fixture = decode(include_bytes!(
        "../../../../../brilliant-kernel-session/src/wasm/fixtures/session.json"
    ))
    .unwrap();
    let mut input = decode(utf8(at(&fixture, &["initial"])).as_bytes()).unwrap();
    let JsonValue::Array(events) = at_mut(
        &mut input,
        &[
            "document",
            "parts",
            "0",
            "measureContents",
            "0",
            "voices",
            "0",
            "sequence",
            "events",
        ],
    ) else {
        unreachable!()
    };
    events.push(object([
        ("id", text("event-5")),
        (
            "duration",
            object([("base", number(4)), ("dots", number(0))]),
        ),
        ("content", object([("kind", text("rest"))])),
    ]));
    let mut host = Host {
        callbacks: at(&fixture, &["callbacks"]).clone(),
        reject: false,
        validations: 0,
    };
    let mut state = IntegratedKernelRuntimeV2::create(&encode(&input).unwrap(), &mut host).unwrap();
    let request = br#"{"operation":"readRuleWarningPage","reportVersion":1,"documentId":"score-1","documentVersion":0,"offset":0,"limit":16}"#;
    let report = decode(&state.operate(request, &mut host, |_, _| unreachable!())).unwrap();
    assert_eq!(integer(at(&report, &["report", "total"])), Some(1));
    let warnings = array(at(&report, &["report", "warnings"])).unwrap();
    let warning = &warnings[0];
    assert!(tag(warning, "code", "rule.sequence-exceeds-measure"));
    assert_eq!(integer(at(warning, &["overflow", "numerator"])), Some(1));
    assert_eq!(integer(at(warning, &["overflow", "denominator"])), Some(4));

    let stale = br#"{"operation":"readRuleWarningPage","reportVersion":1,"documentId":"score-1","documentVersion":1,"offset":0,"limit":16}"#;
    let stale = decode(&state.operate(stale, &mut host, |_, _| unreachable!())).unwrap();
    assert!(tag(
        at(&stale, &["failure"]),
        "code",
        "report.stale-version"
    ));
}

#[test]
fn delayed_start_admission_exposes_rule_warning_instead_of_rejecting_document() {
    let fixture = decode(include_bytes!(
        "../../../../../brilliant-kernel-session/src/wasm/fixtures/session.json"
    ))
    .unwrap();
    let mut input = decode(utf8(at(&fixture, &["initial"])).as_bytes()).unwrap();
    *at_mut(
        &mut input,
        &[
            "document",
            "parts",
            "0",
            "measureContents",
            "0",
            "voices",
            "0",
            "sequence",
            "start",
        ],
    ) = object([("numerator", number(5)), ("denominator", number(4))]);
    let mut host = Host {
        callbacks: at(&fixture, &["callbacks"]).clone(),
        reject: false,
        validations: 0,
    };
    let mut state = IntegratedKernelRuntimeV2::create(&encode(&input).unwrap(), &mut host).unwrap();
    let request = br#"{"operation":"readRuleWarningPage","reportVersion":1,"documentId":"score-1","documentVersion":0,"offset":0,"limit":16}"#;
    let report = decode(&state.operate(request, &mut host, |_, _| unreachable!())).unwrap();
    assert_eq!(integer(at(&report, &["report", "total"])), Some(1));
    let warnings = array(at(&report, &["report", "warnings"])).unwrap();
    let warning = &warnings[0];
    assert!(tag(warning, "code", "rule.sequence-start-after-measure"));
    assert_eq!(
        integer(at(warning, &["actualDuration", "numerator"])),
        Some(5)
    );
    assert_eq!(
        integer(at(warning, &["actualDuration", "denominator"])),
        Some(4)
    );
    assert_eq!(integer(at(warning, &["overflow", "numerator"])), Some(1));
    assert_eq!(integer(at(warning, &["overflow", "denominator"])), Some(4));
}

fn at_mut<'a>(value: &'a mut Value, path: &[&str]) -> &'a mut Value {
    let mut current = value;
    for key in path {
        current = match current {
            JsonValue::Object(fields) => fields.get_mut(&JsString::from(*key)).unwrap(),
            JsonValue::Array(items) => &mut items[key.parse::<usize>().unwrap()],
            _ => unreachable!(),
        };
    }
    current
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
fn prepared_batch_history_plugin_rejection_keeps_state_and_allows_retry() {
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
    let module_request = array(at(&fixture, &["journey"]))
        .unwrap()
        .iter()
        .map(|step| decode(utf8(at(step, &["request"])).as_bytes()).unwrap())
        .find(|request| tag(request, "operation", "submit"))
        .unwrap();
    let dispatch: CoreDispatch = |_, _| panic!("Batch must use candidate dispatch");
    let first =
        decode(&state.operate(&encode(&module_request).unwrap(), &mut host, dispatch)).unwrap();
    assert!(tag(at(&first, &["result"]), "status", "committed"));
    assert_eq!(state.semantic_scans, 1);
    // Keep an installed extension on both sides so both undo and redo invoke
    // its validator. Undoing its initial creation correctly skips that callback.
    let mut metadata = state.runtime.store.export_document().unwrap().metadata;
    metadata.title = "history reuse".into();
    let metadata_command = object([
        ("commandVersion", number(1)),
        ("commandId", text("core.document.set-metadata")),
        (
            "target",
            object([
                ("kind", text("document")),
                ("documentId", value(state.runtime.document_id()).unwrap()),
            ]),
        ),
        ("payload", object([("metadata", value(&metadata).unwrap())])),
    ]);
    let batch = object([
        ("operation", text("submit")),
        (
            "command",
            object([
                ("commandVersion", number(1)),
                ("commandId", text("core.transaction.batch")),
                (
                    "target",
                    object([
                        ("kind", text("document")),
                        ("documentId", value(state.runtime.document_id()).unwrap()),
                    ]),
                ),
                (
                    "payload",
                    object([(
                        "commands",
                        JsonValue::Array(vec![
                            field(&module_request, "command").unwrap().clone(),
                            metadata_command,
                        ]),
                    )]),
                ),
            ]),
        ),
    ]);
    let result = decode(&state.operate(&encode(&batch).unwrap(), &mut host, dispatch)).unwrap();
    assert!(tag(at(&result, &["result"]), "status", "committed"));
    assert_eq!(state.classification_scans, 2);
    assert_eq!(
        state.semantic_scans, 1,
        "candidate finalization already proved Core semantics"
    );
    for redo in [false, true] {
        let (_, prepared) = state.runtime.prepare_integrated_history(redo).unwrap();
        assert!(prepared.is_some(), "exercise the actual reuse path");
        drop(prepared);
        let before = state.runtime.store.export_document().unwrap();
        let version = state.runtime.document_version;
        let history = state.runtime.history.projected().unwrap();
        let cached = state.core_classification.clone();
        let adjacent = state.adjacent_core_classification.clone();
        let scans = state.classification_scans;
        let calls = host.validations;
        let request = if redo {
            br#"{"operation":"redo"}"#
        } else {
            br#"{"operation":"undo"}"#
        };
        host.reject = true;
        let result = decode(&state.operate(request, &mut host, dispatch)).unwrap();
        assert_eq!(at(&result, &["ok"]), &JsonValue::Bool(false));
        assert!(field(&result, "pipeline").is_err());
        assert!(field(&result, "coreReport").is_err());
        assert!(host.validations > calls);
        assert_eq!(state.runtime.store.export_document().unwrap(), before);
        assert_eq!(state.runtime.document_version, version);
        assert_eq!(state.runtime.history.projected().unwrap(), history);
        assert_eq!(state.core_classification, cached);
        assert_eq!(state.adjacent_core_classification, adjacent);
        assert_eq!(state.classification_scans, scans);
        host.reject = false;
        let result = decode(&state.operate(request, &mut host, dispatch)).unwrap();
        assert!(tag(at(&result, &["result"]), "status", "committed"));
        assert_eq!(
            state.runtime.document_version,
            version.checked_next().unwrap()
        );
        assert_eq!(state.classification_scans, scans);
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
fn paged_rejected_completion_exposes_no_candidate_report_and_keeps_committed_cache() {
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
    // Exercise the common completion boundary for a Stage4 rejection. Full
    // transaction rollback itself is covered by the admission/history tests.
    state.paged_core_reports = true;
    let committed = state
        .core_report_summary(&state.runtime.store.export_document().unwrap())
        .unwrap();
    state.core_classification = Some((state.runtime.document_version, committed));
    let cached = state.core_classification.clone();
    let rejected = state.runtime.undo();
    assert!(matches!(
        rejected,
        KernelStage4CommandResultV1::Rejected { .. }
    ));
    let candidate = object([("assessment", object([("core", text("uncommitted"))]))]);
    let result = state.completed(rejected, candidate, None).unwrap();
    assert!(field(&result, "coreReport").is_err());
    assert!(field(&result, "pipeline").is_err());
    assert_eq!(state.core_classification, cached);
    assert_eq!(state.runtime.document_version.get(), 0);
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
