//! Final semantic reports from real TS submissions, before identity sealing.
use super::*;
use brilliant_core_types::{JsonValue, LosslessJsonValue};
use brilliant_score_foundation::{
    LosslessEncode, decode_lossless_json, decode_lossless_score_document_value,
};

fn field<'a>(value: &'a LosslessJsonValue, name: &str) -> &'a LosslessJsonValue {
    let JsonValue::Object(fields) = value else {
        panic!("oracle object")
    };
    fields.get(&JsString::from(name)).unwrap()
}

fn list(value: &LosslessJsonValue) -> &[LosslessJsonValue] {
    let JsonValue::Array(values) = value else {
        panic!("oracle array")
    };
    values
}

fn text(value: &LosslessJsonValue) -> String {
    let JsonValue::String(value) = value else {
        panic!("oracle string")
    };
    // Only the outer wrapper is scalar text; its inner JSON preserves raw UTF-16.
    String::from_utf16(value.code_units()).unwrap()
}

#[test]
fn ts_final_assessment_oracle_matches_complete_reports_and_child_precedence() {
    let corpus = decode_lossless_json(include_str!(
        "../../../../../../test/core-kernel/rust-migration/fixtures/candidate-final-assessment-oracle-v1.json"
    ))
    .unwrap();
    let cases = list(field(&corpus, "cases"));
    assert_eq!(cases.len(), 12);
    let mut final_rejections = 0;
    let mut early_rejections = 0;
    let mut valid_finals = 0;
    for case in cases {
        let label = text(field(case, "label"));
        let initial = decode_lossless_score_document_value(
            decode_lossless_json(&text(field(case, "initialDocumentJson"))).unwrap(),
        )
        .unwrap();
        let mut store = build_live_score_store(&initial).unwrap();
        let mut recorder = Recorder::new(Candidate::new(
            TransactionOverlayV1::new(&store),
            initial.id.clone(),
        ));
        let mut early = None;
        for (index, command) in list(field(case, "commandsJson")).iter().enumerate() {
            if let Err(failure) = staff::execute_staff_wire(&mut recorder, &text(command)) {
                early = Some((index, failure));
                break;
            }
        }
        let expected = field(case, "expected");
        if let Some((index, failure)) = early {
            early_rejections += 1;
            assert_eq!(text(field(expected, "status")), "rejected", "{label}");
            assert_eq!(failure, Failure::InternalError, "{label}");
            let actual = decode_lossless_json(&format!(
                r#"{{"code":"command.batch-child-rejected","failedCommandIndex":{index},"failure":{{"code":"command.internal-error"}}}}"#
            ))
            .unwrap();
            assert_eq!(
                actual,
                decode_lossless_json(&text(field(expected, "failureJson"))).unwrap(),
                "{label}"
            );
            // Never run final assessment after a preparation failure.
        } else {
            // In particular, do not call Recorder::finish here: invalid final
            // identities must yield the ordered semantic report, not seal errors.
            let report = recorder
                .candidate
                .assess_final_semantics()
                .unwrap_or_else(|failure| panic!("assessment {label}: {failure:?}"));
            if text(field(expected, "status")) == "rejected" {
                final_rejections += 1;
                assert!(!report.ok, "{label}");
                let mut bytes = Vec::new();
                report.diagnostics.write_lossless(&mut bytes).unwrap();
                let diagnostics =
                    decode_lossless_json(std::str::from_utf8(&bytes).unwrap()).unwrap();
                let actual = JsonValue::Object(brilliant_core_types::JsonObject::from([
                    (
                        JsString::from("code"),
                        JsonValue::String(JsString::from("command.semantic-invalid")),
                    ),
                    (JsString::from("diagnostics"), diagnostics),
                ]));
                assert_eq!(
                    actual,
                    decode_lossless_json(&text(field(expected, "failureJson"))).unwrap(),
                    "complete diagnostic codes, paths, details and ordering: {label}"
                );
                match recorder.prepare_final_commit(
                    &store,
                    brilliant_core_types::DocumentVersionV1::initial(),
                ) {
                    Err(crate::candidate::adoption::FinalizationFailure::Command(
                        Failure::SemanticInvalid { diagnostics },
                    )) => {
                        assert_eq!(
                            diagnostics, report.diagnostics,
                            "finalization must assess before identity sealing: {label}"
                        );
                    }
                    Err(failure) => panic!("wrong finalization failure for {label}: {failure:?}"),
                    Ok(_) => panic!("invalid candidate prepared an adoption: {label}"),
                }
                assert_eq!(
                    store.export_document().unwrap(),
                    initial,
                    "rejected finalization: {label}"
                );
                continue;
            } else {
                valid_finals += 1;
                assert_eq!(text(field(expected, "status")), "committed", "{label}");
                assert!(report.ok, "{label}: {report:?}");
                assert!(report.diagnostics.is_empty(), "{label}");
                let final_document = decode_lossless_score_document_value(
                    decode_lossless_json(&text(field(expected, "finalDocumentJson"))).unwrap(),
                )
                .unwrap();
                let mut version = brilliant_core_types::DocumentVersionV1::initial();
                let (plan, prefix, journal) = recorder
                    .prepare_final_commit(&store, version)
                    .unwrap_or_else(|failure| panic!("finalize {label}: {failure:?}"));
                assert!(prefix.forward.is_empty());
                assert_eq!(
                    store.export_document().unwrap(),
                    initial,
                    "pre-adoption {label}"
                );
                let mut metrics = brilliant_kernel_contracts::KernelStage3MetricsV1::default();
                plan.expect("actual journal operations")
                    .commit(&mut store, &mut version, &mut metrics)
                    .unwrap();
                assert_eq!(
                    store.export_document().unwrap(),
                    final_document,
                    "adoption {label}"
                );
                assert_eq!(version.get(), 1);
                assert_eq!(metrics.change_ops, journal.steps.len() as u64);
                for (direction, expected_document) in [
                    (Direction::Inverse, &initial),
                    (Direction::Forward, &final_document),
                ] {
                    // Replay starts from a fresh strong Store boundary; no old
                    // candidate occurrence indices leak across transactions.
                    let mut candidate =
                        Candidate::new(TransactionOverlayV1::new(&store), initial.id.clone());
                    journal
                        .replay(&mut candidate, direction)
                        .unwrap_or_else(|failure| panic!("replay {label}: {failure:?}"));
                    let (plan, prefix) = candidate
                        .validate_final()
                        .unwrap()
                        .prepare_commit(&store, version, journal.steps.len() as u64)
                        .unwrap();
                    assert!(prefix.forward.is_empty());
                    plan.unwrap()
                        .commit(&mut store, &mut version, &mut metrics)
                        .unwrap();
                    assert_eq!(
                        store.export_document().unwrap(),
                        *expected_document,
                        "replay adoption {label}"
                    );
                    let (rebuilt, _) = crate::indices::rebuild_indices_from_store(&store).unwrap();
                    assert_eq!(
                        crate::indices::normalized_index_projection(&store, &store.indices)
                            .unwrap(),
                        crate::indices::normalized_index_projection(&store, &rebuilt).unwrap()
                    );
                }
                assert_eq!(version.get(), 3);
                continue;
            }
        }
        drop(recorder);
        assert_eq!(
            store.export_document().unwrap(),
            initial,
            "private candidate: {label}"
        );
    }
    assert_eq!(
        (final_rejections, early_rejections, valid_finals),
        (8, 1, 3)
    );
}
