use super::*;
use crate::{LosslessDecode, ScoreFeatureProfileV1};
use brilliant_core_types::JsonObject;

fn document() -> ScoreDocumentV1 {
    ScoreDocumentV1::from_lossless_value(
        crate::decode_js_value_json(crate::codec::SMOKE_DOCUMENT).unwrap(),
    )
    .unwrap()
}

#[test]
fn borrowed_view_preserves_lossless_ids_optional_shapes_and_reports() {
    let oracle: serde_json::Value = serde_json::from_str(include_str!(
        "../../../../test/core-kernel/rust-migration/fixtures/lossless-score-dto-oracle-v1.json"
    ))
    .unwrap();
    for sample in oracle["samples"].as_array().unwrap() {
        let value = crate::decode_js_value_json(sample["input"].as_str().unwrap()).unwrap();
        let document = ScoreDocumentV1::from_lossless_value(value.clone()).unwrap();
        let node = DocumentAssessmentNodeV1::new(&document);
        assert_eq!(
            node.field("metadata").field("title").string().unwrap(),
            document.metadata.title
        );
        assert!(node.field("absent").number().is_err());
        assert!(node.field("absent").optional("anything").is_err());
        assert_eq!(
            crate::assess_score_profile_node(node, &ScoreFeatureProfileV1::k1()),
            crate::assess_score_profile(&value, &ScoreFeatureProfileV1::k1())
        );
        assert_eq!(check_document_capture_limits(&document, usize::MAX), Ok(()));
    }
    let mut document = document();
    let payload = DocumentAssessmentNodeV1::new(&document)
        .field("extensions")
        .items()
        .unwrap()
        .next()
        .unwrap()
        .unwrap()
        .field("payload");
    assert_eq!(
        payload.field("a").field("future").string().unwrap(),
        JsString::from("kept")
    );
    assert!(payload.field("z").is_array().unwrap());
    assert!(payload.optional("missing").unwrap().is_none());
    document.metadata.tempo.bpm = FiniteNumber::from_js_number(-0.0).unwrap();
    let node = DocumentAssessmentNodeV1::new(&document);
    assert!(
        node.field("metadata")
            .field("tempo")
            .field("bpm")
            .number()
            .unwrap()
            .is_sign_negative()
    );
    assert!(
        node.field("metadata")
            .exact_fields(&["title", "authors", "tempo"])
            .unwrap()
    );
    assert!(
        !node
            .field("metadata")
            .exact_fields(&["title", "authors", "missing"])
            .unwrap()
    );
    let mut encoded = Vec::new();
    document.write_lossless(&mut encoded).unwrap();
    assert_eq!(
        check_document_capture_limits(&document, encoded.len()),
        Ok(())
    );
    assert_eq!(
        check_document_capture_limits(&document, encoded.len() - 1),
        Err(DocumentCaptureFailureV1::Bytes)
    );
}

#[test]
fn borrowed_capture_limits_include_document_overhead_for_depth_and_properties() {
    let mut document = document();
    for depth in [59, 60] {
        let mut payload = JsonValue::Null;
        for _ in 0..depth {
            payload = JsonValue::Array(vec![payload]);
        }
        document.extensions[0].payload = JsonObject::from([("deep".into(), payload)]);
        let mut bytes = Vec::new();
        document.write_lossless(&mut bytes).unwrap();
        let previous = crate::decode_js_value_json(std::str::from_utf8(&bytes).unwrap());
        assert_eq!(previous.is_ok(), depth == 59);
        assert_eq!(
            check_document_capture_limits(&document, usize::MAX).is_ok(),
            previous.is_ok()
        );
    }
    let mut value_count = 0;
    fn count(view: &dyn View, total: &mut usize) {
        *total += 1;
        view.children(&mut |child| {
            count(child, total);
            true
        });
    }
    // A null placeholder contributes one node; filling the same field with an
    // array adds one node plus its elements in place of that placeholder.
    document.extensions[0].payload = JsonObject::from([("wide".into(), JsonValue::Null)]);
    count(&document, &mut value_count);
    for additional in [0, 1] {
        document.extensions[0].payload = JsonObject::from([(
            "wide".into(),
            JsonValue::Array(vec![
                JsonValue::Null;
                JSON_PROPERTY_LIMIT - value_count + additional
            ]),
        )]);
        let mut bytes = Vec::new();
        document.write_lossless(&mut bytes).unwrap();
        let previous = crate::decode_js_value_json(std::str::from_utf8(&bytes).unwrap());
        assert_eq!(previous.is_ok(), additional == 0);
        assert_eq!(
            check_document_capture_limits(&document, usize::MAX).is_ok(),
            previous.is_ok()
        );
    }
}
