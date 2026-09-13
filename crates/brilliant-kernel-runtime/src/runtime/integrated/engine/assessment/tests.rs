use super::*;

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
