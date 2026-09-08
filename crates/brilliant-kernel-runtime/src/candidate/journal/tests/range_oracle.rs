//! Eight real TypeScript submissions, compared at actual Store adoption boundaries.
use super::*;
use crate::indices::{normalized_index_projection, rebuild_indices_from_store};
use brilliant_core_types::{DocumentVersionV1, JsonValue, LosslessJsonValue};
use brilliant_kernel_contracts::{
    CoreCommandEnvelopeV1, KernelStage3MetricsV1, ScoreEntityTargetV1,
    decode_admission_submit_request,
};
use brilliant_score_foundation::{
    ScoreDocumentV1, decode_lossless_json, decode_lossless_score_document_value,
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
    String::from_utf16(value.code_units()).unwrap()
}
fn document(value: &LosslessJsonValue) -> ScoreDocumentV1 {
    decode_lossless_score_document_value(decode_lossless_json(&text(value)).unwrap()).unwrap()
}
fn execute(recorder: &mut Recorder<'_>, wire: &str) {
    let request = format!("{{\"apiVersion\":1,\"command\":{wire}}}");
    let command = decode_admission_submit_request(request.as_bytes())
        .unwrap()
        .command;
    match command {
        CoreCommandEnvelopeV1::RangeDelete {
            target: ScoreEntityTargetV1::Document { document_id },
            range,
        } => {
            recorder
                .delete_range_command(document_id.as_js_string(), &range)
                .unwrap();
        }
        CoreCommandEnvelopeV1::RangeTransposeWrittenPitch {
            target: ScoreEntityTargetV1::Document { document_id },
            range,
            transposition,
        } => {
            recorder
                .transpose_range_command(document_id.as_js_string(), &range, &transposition)
                .unwrap();
        }
        _ => panic!("outside bounded range oracle"),
    }
}
#[test]
fn eight_ts_range_commands_match_real_store_adoption_and_combined_history() {
    let corpus = decode_lossless_json(include_str!("../../../../../../test/core-kernel/rust-migration/fixtures/candidate-range-journal-oracle-v1.json")).unwrap();
    let cases = list(field(&corpus, "cases"));
    assert_eq!(cases.len(), 8);
    for case in cases {
        let label = text(field(case, "label"));
        let initial = document(field(case, "initialDocumentJson"));
        let expected = field(case, "expected");
        let mut store = build_live_score_store(&initial).unwrap();
        let mut recorder = Recorder::new(Candidate::new(
            TransactionOverlayV1::new(&store),
            initial.id.clone(),
        ));
        for command in list(field(case, "commandsJson")) {
            execute(&mut recorder, &text(command));
        }
        let (plan, history) = recorder
            .prepare_combined_commit(&store, DocumentVersionV1::initial())
            .unwrap_or_else(|error| panic!("{label}: {error:?}"));
        assert_eq!(
            store.export_document().unwrap(),
            initial,
            "{label}: preparation atomicity"
        );
        let status = text(field(expected, "status"));
        if status == "no-op" {
            assert!(plan.is_none(), "{label}");
            assert!(
                history
                    .prepare_replay(&store, DocumentVersionV1::initial(), Direction::Inverse)
                    .unwrap()
                    .is_none()
            );
            assert!(
                history
                    .prepare_replay(&store, DocumentVersionV1::initial(), Direction::Forward)
                    .unwrap()
                    .is_none()
            );
            for name in ["finalDocumentJson", "undoDocumentJson", "redoDocumentJson"] {
                assert_eq!(
                    store.export_document().unwrap(),
                    document(field(expected, name)),
                    "{label}"
                );
            }
            continue;
        }
        assert_eq!(status, "committed", "{label}");
        let mut version = DocumentVersionV1::initial();
        let mut metrics = KernelStage3MetricsV1::default();
        plan.unwrap()
            .commit(&mut store, &mut version, &mut metrics)
            .unwrap();
        for (stage, name) in ["finalDocumentJson", "undoDocumentJson", "redoDocumentJson"]
            .iter()
            .enumerate()
        {
            if stage > 0 {
                let result_name = if stage == 1 {
                    "undoResultJson"
                } else {
                    "redoResultJson"
                };
                let observed = decode_lossless_json(&text(field(expected, result_name))).unwrap();
                assert_eq!(
                    text(field(&observed, "status")),
                    "committed",
                    "TS history failure retained: {label}"
                );
                let before = store.export_document().unwrap();
                let plan = history
                    .prepare_replay(
                        &store,
                        version,
                        if stage == 1 {
                            Direction::Inverse
                        } else {
                            Direction::Forward
                        },
                    )
                    .unwrap_or_else(|error| panic!("{label} stage {stage}: {error:?}"))
                    .unwrap();
                assert_eq!(
                    store.export_document().unwrap(),
                    before,
                    "{label}: replay atomicity"
                );
                plan.commit(&mut store, &mut version, &mut metrics).unwrap();
            }
            assert_eq!(
                store.export_document().unwrap(),
                document(field(expected, name)),
                "{label} stage {stage}"
            );
            assert_eq!(version.get(), stage as u64 + 1);
            assert_eq!(metrics.full_semantic_validations, 1);
            let (rebuilt, _) = rebuild_indices_from_store(&store).unwrap();
            assert_eq!(
                normalized_index_projection(&store, &store.indices).unwrap(),
                normalized_index_projection(&store, &rebuilt).unwrap(),
                "{label}"
            );
        }
    }
}
