use super::*;
use brilliant_kernel_contracts::{MeasurePointKindV1, MeasurePointV1};

fn id(value: &str) -> StableId {
    StableId::new(value).unwrap()
}

fn fixture(reverse: bool) -> ScoreDocumentV1 {
    let mut document = crate::store::tests::fixture();
    let definition = document.measure_definitions[0].clone();
    document.measure_definitions = ["A", "B", "C", "D"]
        .iter()
        .map(|raw| {
            let mut value = definition.clone();
            value.id = id(raw);
            value
        })
        .collect();
    for (index, part) in document.parts.iter_mut().enumerate() {
        let content = part.measure_contents[0].clone();
        part.measure_contents = ["A", "B", "C", "D"]
            .iter()
            .map(|raw| {
                let mut value = content.clone();
                value.measure_id = id(raw);
                value.voices.truncate(1);
                value.voices[0].id = id(&format!("range-{index}-{raw}"));
                value.voices[0].sequence.events.clear();
                value
            })
            .collect();
        if reverse {
            part.measure_contents.reverse();
        }
    }
    document
}

#[test]
fn range_deletion_preserves_survivor_order_and_single_remove_normalizes() {
    for (range, reverse, end, expected) in [
        (true, true, "B", vec!["D", "C", "A"]),
        (false, true, "B", vec!["A", "C", "D"]),
        (true, true, "C", vec!["D", "A"]),
        (true, false, "C", vec!["A", "D"]),
    ] {
        let baseline = fixture(reverse);
        let mut runtime = KernelRuntime::create(baseline.clone()).unwrap();
        let prepared = {
            let mut transaction = runtime.begin_stage3_transaction();
            if range {
                transaction
                    .delete_range(
                        baseline.id.clone(),
                        ScoreRangeV1::MeasureRange {
                            start: MeasurePointV1 {
                                kind: MeasurePointKindV1::Measure,
                                measure_id: id(end),
                            },
                            end: MeasurePointV1 {
                                kind: MeasurePointKindV1::Measure,
                                measure_id: id("B"),
                            },
                        },
                    )
                    .unwrap();
            } else {
                transaction.remove_measure(id("B")).unwrap();
            }
            transaction.finish().unwrap()
        };
        let changes = prepared.change_set.clone();
        assert_eq!(
            changes.prepared_effect_count,
            if !range || end == "C" { 2 } else { 1 }
        );
        runtime
            .commit_stage3_change_set(prepared.change_set)
            .unwrap();
        let committed = runtime.store.export_document().unwrap();
        assert_eq!(
            committed.parts[0]
                .measure_contents
                .iter()
                .map(|content| content.measure_id.as_js_string())
                .collect::<Vec<_>>(),
            expected
        );
        apply_stored_operations(
            &mut runtime.store,
            &mut runtime.document_version,
            &mut runtime.committed_metrics,
            &changes,
            &changes.inverse,
        )
        .unwrap();
        assert_eq!(runtime.store.export_document().unwrap(), baseline);
        apply_stored_operations(
            &mut runtime.store,
            &mut runtime.document_version,
            &mut runtime.committed_metrics,
            &changes,
            &changes.forward,
        )
        .unwrap();
        assert_eq!(runtime.store.export_document().unwrap(), committed);
    }
}
