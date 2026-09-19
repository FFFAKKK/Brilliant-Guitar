use super::*;

fn requirement(
    namespace: &str,
    module: &str,
    contribution: &str,
) -> brilliant_extension_protocol::ExtensionRuntimeRequirementV1 {
    brilliant_extension_protocol::ExtensionRuntimeRequirementV1 {
        protocol_version: 1,
        namespace: namespace.into(),
        module_id: StableId::new(module).unwrap(),
        contribution_id: StableId::new(contribution).unwrap(),
        supported_schema_versions: vec![1, 2],
        required_for_write: true,
    }
}

fn read_row(namespace: &str) -> Value {
    object([
        ("readVersion", number(1)),
        (
            "reader",
            object([
                ("moduleId", text("reader.module")),
                ("contributionId", text("reader.contribution")),
            ]),
        ),
        (
            "provider",
            object([
                ("moduleId", text("provider.module")),
                ("contributionId", text("provider.contribution")),
            ]),
        ),
        ("namespace", text(namespace)),
        (
            "supportedSchemaVersions",
            JsonValue::Array(vec![number(1), number(2)]),
        ),
        ("ownerKinds", JsonValue::Array(vec![text("part")])),
    ])
}

#[test]
fn declared_reads_accept_known_missing_providers_but_reject_unknown_namespaces() {
    let reader = requirement("reader.namespace", "reader.module", "reader.contribution");
    let provider = requirement(
        "provider.namespace",
        "provider.module",
        "provider.contribution",
    );
    let catalog = HostCatalogV1::new(brilliant_extension_protocol::HostInstalledContributionsV1 {
        contributions: vec![brilliant_extension_protocol::HostInstalledContributionV1 {
            module_id: reader.module_id.clone(),
            contribution_id: reader.contribution_id.clone(),
            requirements: vec![reader.clone()],
        }],
    })
    .unwrap();
    let assembly = catalog
        .resolve_inventory(InventorySelectionV1::Explicit(vec![reader, provider]))
        .unwrap();
    assert!(
        decode_reads(
            &JsonValue::Array(vec![read_row("provider.namespace")]),
            &assembly
        )
        .is_ok()
    );
    assert!(
        decode_reads(
            &JsonValue::Array(vec![read_row("unknown.namespace")]),
            &assembly
        )
        .is_err()
    );
}

fn sources() -> Vec<Value> {
    (0..5)
        .map(|i| {
            object([
                ("moduleId", text(&format!("fixture.module-{i}"))),
                ("contributionId", text(&format!("fixture.contribution-{i}"))),
            ])
        })
        .collect()
}

fn issue(index: usize, source: &Value) -> Value {
    object([
        ("issueVersion", number(1)),
        ("code", text(&format!("fixture.module-{index}.unsupported"))),
        (
            "messageKey",
            text(&format!("module.fixture.module-{index}.unsupported")),
        ),
        ("severity", text("warning")),
        (
            "source",
            object([
                ("kind", text("module")),
                ("moduleId", field(source, "moduleId").unwrap().clone()),
                (
                    "contributionId",
                    field(source, "contributionId").unwrap().clone(),
                ),
            ]),
        ),
    ])
}

#[test]
fn successful_assessment_enforces_both_per_callback_and_aggregate_issue_limits() {
    let sources = sources();
    for (counts, accepted) in [
        ([1024, 1024, 1024, 1024, 0], true),
        ([1024, 1024, 1024, 1024, 1], false),
        ([1025, 0, 0, 0, 0], false),
    ] {
        let rows = sources
            .iter()
            .enumerate()
            .map(|(i, source)| {
                object([
                    ("moduleId", field(source, "moduleId").unwrap().clone()),
                    (
                        "contributionId",
                        field(source, "contributionId").unwrap().clone(),
                    ),
                    ("status", text("unsupported")),
                    (
                        "issues",
                        JsonValue::Array(vec![issue(i, source); counts[i]]),
                    ),
                ])
            })
            .collect();
        let result = object([
            ("ok", JsonValue::Bool(true)),
            (
                "assessment",
                object([
                    ("core", JsonValue::Null),
                    ("modules", JsonValue::Array(rows)),
                ]),
            ),
            ("availability", JsonValue::Null),
        ]);
        assert_eq!(
            validate_success(&result, &sources, &JsonValue::Null).is_ok(),
            accepted
        );
    }
}

#[test]
fn semantic_failure_checks_caps_and_canonical_source_order_without_dropping_valid_diagnostics() {
    let sources = sources();
    let issues: Vec<_> = sources
        .iter()
        .take(4)
        .enumerate()
        .flat_map(|(i, source)| vec![issue(i, source); 1024])
        .collect();
    let failure = |issues| {
        object([
            ("code", text("command.contribution-semantic-invalid")),
            ("issues", JsonValue::Array(issues)),
        ])
    };
    let valid = failure(issues.clone());
    assert_eq!(validate_failure(valid.clone(), &sources), valid);
    let mut over = issues.clone();
    over.push(issue(4, &sources[4]));
    assert_eq!(validate_failure(failure(over), &sources), internal());
    assert_eq!(
        validate_failure(failure(vec![issue(0, &sources[0]); 1025]), &sources),
        internal()
    );
    let mut reversed = issues;
    reversed.reverse();
    assert_eq!(validate_failure(failure(reversed), &sources), internal());
}

#[test]
fn effect_rejection_preserves_only_validated_execution_provenance() {
    let sources = sources();
    let source = &sources[0];
    let failure = |failure_code: &str, target: Value| {
        object([
            ("code", text("command.contribution-effect-rejected")),
            ("moduleId", field(source, "moduleId").unwrap().clone()),
            (
                "contributionId",
                field(source, "contributionId").unwrap().clone(),
            ),
            ("effectIndex", number(3)),
            ("effectKind", text("core.event.remove")),
            ("target", target),
            ("failureCode", text(failure_code)),
        ])
    };
    let valid = failure(
        "command.target-not-found",
        object([("kind", text("event")), ("eventId", text("event-1"))]),
    );
    assert_eq!(validate_failure(valid.clone(), &sources), valid);
    assert_eq!(
        validate_failure(
            failure(
                "plugin.private-stack-trace",
                object([("kind", text("event")), ("eventId", text("event-1"))]),
            ),
            &sources,
        ),
        internal()
    );
    assert_eq!(
        validate_failure(
            failure(
                "command.target-not-found",
                object([("kind", text("event")), ("payload", text("private"))]),
            ),
            &sources,
        ),
        internal()
    );
}
