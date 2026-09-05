//! Independent TS submission oracle and strong-boundary journal replay. This
//! projects the candidate's complete visible entity tree, not effects, history
//! counters, validation or adoption (those are still separate integration gates).
use super::*;
use crate::candidate::journal::orders::child_orders_for;
use brilliant_core_types::{JsonValue, LosslessJsonValue};
use brilliant_score_foundation::{
    ScoreDocumentV1, decode_lossless_json, decode_lossless_score_document_value,
};

fn document(text: &str) -> ScoreDocumentV1 {
    decode_lossless_score_document_value(decode_lossless_json(text).unwrap()).unwrap()
}

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
    // Only the outer wrapper is scalar text; all score data remains escaped
    // inside it and is decoded through the actual lossless Foundation path.
    String::from_utf16(value.code_units()).unwrap()
}

#[derive(Debug, Eq, PartialEq)]
struct Observed {
    path: Vec<(Children, usize)>,
    image: bundle::Image,
}

fn tree(candidate: &mut Candidate<'_>) -> Vec<Observed> {
    fn visit(
        candidate: &mut Candidate<'_>,
        source: &Occurrence,
        path: &mut Vec<(Children, usize)>,
        out: &mut Vec<Observed>,
    ) {
        let kind = candidate.kind(source).unwrap();
        out.push(Observed {
            path: path.clone(),
            image: bundle::Image {
                raw_id: candidate.raw_id(source).unwrap().clone(),
                kind,
                value: candidate.read_value(source),
                instrument: (kind == Kind::Part)
                    .then(|| candidate.read_instrument(source).unwrap()),
                staff_id: matches!(kind, Kind::Voice | Kind::Event)
                    .then(|| candidate.read_staff_reference(source).unwrap())
                    .flatten(),
                content_kind: (kind == Kind::Event)
                    .then(|| candidate.read_content_kind(source).unwrap()),
            },
        });
        for children in child_orders_for(kind) {
            let mut sources = Vec::new();
            candidate
                .visit_order(&CandidateOrder::new(source, *children), &mut |child, _| {
                    sources.push(child.clone());
                    true
                })
                .unwrap();
            for (index, child) in sources.into_iter().enumerate() {
                path.push((*children, index));
                visit(candidate, &child, path, out);
                path.pop();
            }
        }
    }
    let mut result = Vec::new();
    visit(
        candidate,
        &candidate.document.clone(),
        &mut Vec::new(),
        &mut result,
    );
    result
}

#[test]
fn ts_staff_oracle_matches_preparation_and_strong_boundary_replay() {
    let corpus = decode_lossless_json(include_str!(
        "../../../../../../../test/core-kernel/rust-migration/fixtures/candidate-staff-journal-oracle-v1.json"
    )).unwrap();
    assert_eq!(
        field(&corpus, "schemaVersion"),
        &decode_lossless_json("1").unwrap()
    );
    let cases = list(field(&corpus, "cases"));
    assert_eq!(cases.len(), 10);
    for case in cases {
        let label = text(field(case, "label"));
        let initial = document(&text(field(case, "initialDocumentJson")));
        let store = build_live_score_store(&initial).unwrap();
        let mut recorder = Recorder::new(Candidate::new(
            TransactionOverlayV1::new(&store),
            initial.id.clone(),
        ));
        let initial_tree = tree(&mut recorder.candidate);
        let mut rejected = None;
        for (index, command) in list(field(case, "commandsJson")).iter().enumerate() {
            if let Err(failure) = execute_staff_wire(&mut recorder, &text(command)) {
                rejected = Some((index, failure));
                break;
            }
        }
        let expected = field(case, "expected");
        if text(field(expected, "status")) == "rejected" {
            let (index, failure) =
                rejected.unwrap_or_else(|| panic!("expected preparation rejection: {label}"));
            assert_eq!(
                field(expected, "earlyFailureIndex"),
                &decode_lossless_json(&index.to_string()).unwrap(),
                "{label}"
            );
            let observed = match failure {
                Failure::InternalError => "command.internal-error",
                Failure::AnchorWrongOwner => "command.anchor-wrong-owner",
                Failure::ReferenceConflict => "command.reference-conflict",
                other => panic!("unexpected {other:?} for {label}"),
            };
            let failure = decode_lossless_json(&text(field(expected, "failureJson"))).unwrap();
            assert_eq!(
                observed,
                text(field(field(&failure, "failure"), "code")),
                "{label}"
            );
            // The candidate is private and discarded on a rejected command.
            drop(recorder);
            assert_eq!(store.export_document().unwrap(), initial, "{label}");
            continue;
        }
        assert_eq!(rejected, None, "{label}");
        assert_eq!(text(field(expected, "status")), "committed", "{label}");
        let final_document = document(&text(field(expected, "finalDocumentJson")));
        let final_store = build_live_score_store(&final_document).unwrap();
        let mut strong_final = Candidate::new(
            TransactionOverlayV1::new(&final_store),
            final_document.id.clone(),
        );
        let final_tree = tree(&mut strong_final);
        assert_eq!(
            tree(&mut recorder.candidate),
            final_tree,
            "submission {label}"
        );
        let (_, journal) = recorder.finish().unwrap_or_else(|_| panic!("seal {label}"));
        assert!(
            !journal.steps.is_empty(),
            "effective net-zero still has history: {label}"
        );

        // Replay starts from independent strong Store objects, so success cannot
        // depend on the recorder's old Added indices or hidden candidate nodes.
        let mut strong_initial =
            Candidate::new(TransactionOverlayV1::new(&store), initial.id.clone());
        journal
            .replay(&mut strong_initial, Direction::Forward)
            .unwrap_or_else(|_| panic!("forward {label}"));
        assert_eq!(
            tree(&mut strong_initial),
            final_tree,
            "fresh forward {label}"
        );
        journal
            .replay(&mut strong_final, Direction::Inverse)
            .unwrap_or_else(|_| panic!("inverse {label}"));
        assert_eq!(
            tree(&mut strong_final),
            initial_tree,
            "fresh inverse {label}"
        );
        journal
            .replay(&mut strong_final, Direction::Forward)
            .unwrap();
        assert_eq!(tree(&mut strong_final), final_tree, "redo {label}");

        // TS currently rejects undo for temporary duplicate Staff membership.
        // Its actual result stays frozen in the fixture. Stored identities must
        // repair that gap instead of copying the legacy replay failure.
        if label == "duplicate-prefix-staff-repaired-by-parent-removal" {
            let undo = decode_lossless_json(&text(field(expected, "undoResultJson"))).unwrap();
            assert_eq!(text(field(&undo, "status")), "rejected");
        }
        assert_eq!(store.export_document().unwrap(), initial, "{label}");
        assert_eq!(
            final_store.export_document().unwrap(),
            final_document,
            "{label}"
        );
    }
}
