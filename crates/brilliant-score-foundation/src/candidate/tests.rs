use std::{cell::Cell, rc::Rc};

use super::*;
use crate::{
    ScoreFeatureProfileV1, assess_score_profile, assess_score_profile_node, assess_score_semantics,
    assess_score_semantics_node,
};

/// Separate cursor type with ephemeral scalar overrides and fallible reads.
/// It borrows the JSON fixture, never builds a second document representation.
#[derive(Clone)]
struct View<'a> {
    node: CandidateNode<'a>,
    fault: Option<&'static str>,
    tempo: Option<f64>,
    scalar: Option<f64>,
    yielded: Rc<Cell<usize>>,
}

impl<'a> View<'a> {
    fn root(value: &'a Value) -> Self {
        Self {
            node: CandidateNode::root(value),
            fault: None,
            tempo: None,
            scalar: None,
            yielded: Rc::new(Cell::new(0)),
        }
    }

    fn read(&self, operation: &str) -> Result<(), AssessmentFailureV1> {
        if self.fault == Some(operation) {
            Err(AssessmentFailureV1::InternalCapacity)
        } else {
            Ok(())
        }
    }
}

struct Items<'a> {
    source: CandidateItems<'a>,
    owner: View<'a>,
}

impl<'a> Iterator for Items<'a> {
    type Item = Result<View<'a>, AssessmentFailureV1>;

    fn next(&mut self) -> Option<Self::Item> {
        self.source.next().map(|node| {
            self.owner.read("item")?;
            self.owner.yielded.set(self.owner.yielded.get() + 1);
            Ok(View {
                node: node?,
                scalar: None,
                ..self.owner.clone()
            })
        })
    }
}

impl<'a> AssessmentNodeV1 for View<'a> {
    type Items = Items<'a>;

    fn field(&self, name: &'static str) -> Self {
        Self {
            node: self.node.field(name),
            scalar: (name == "bpm").then_some(self.tempo).flatten(),
            ..self.clone()
        }
    }

    fn optional(&self, name: &'static str) -> Result<Option<Self>, AssessmentFailureV1> {
        self.read("optional")?;
        Ok(self.node.optional(name)?.map(|_| self.field(name)))
    }

    fn items(self) -> Result<Self::Items, AssessmentFailureV1> {
        self.read("items")?;
        Ok(Items {
            source: self.node.clone().items()?,
            owner: self,
        })
    }

    fn len(&self) -> Result<usize, AssessmentFailureV1> {
        self.read("len")?;
        self.node.len()
    }

    fn string(&self) -> Result<JsString, AssessmentFailureV1> {
        self.read("string")?;
        self.node.string()
    }

    fn number(&self) -> Result<f64, AssessmentFailureV1> {
        self.read("number")?;
        self.scalar.map_or_else(|| self.node.number(), Ok)
    }

    fn exact_fields(&self, fields: &[&str]) -> Result<bool, AssessmentFailureV1> {
        self.read("exact_fields")?;
        self.node.exact_fields(fields)
    }

    fn is_array(&self) -> Result<bool, AssessmentFailureV1> {
        self.read("is_array")?;
        self.node.is_array()
    }

    fn path(&self) -> StablePathV1 {
        self.node.path()
    }
}

#[test]
fn ephemeral_virtual_scalars_match_json_reports_and_preserve_utf16_ids() {
    let input = crate::codec::SMOKE_DOCUMENT
        .replace("score-rkp1", r"\ud800")
        .replace("staff-1", r"\udc00");
    let captured = crate::decode_lossless_json(&input).unwrap();
    for tempo in [-1.0, -0.0, 120.0, 9007199254740992.0] {
        let mut view = View::root(&captured);
        view.tempo = Some(tempo);
        let expected =
            crate::decode_lossless_json(&input.replace("\"bpm\":120", &format!("\"bpm\":{tempo}")))
                .unwrap();
        assert_eq!(
            assess_score_semantics_node(view.clone()),
            assess_score_semantics(&expected),
        );
        assert_eq!(
            assess_score_profile_node(view, &ScoreFeatureProfileV1::k1()),
            assess_score_profile(&expected, &ScoreFeatureProfileV1::k1()),
        );
    }
}

#[test]
fn iterator_visits_each_score_item_once_without_reading_payload_arrays() {
    let captured = crate::decode_lossless_json(crate::codec::SMOKE_DOCUMENT).unwrap();
    let view = View::root(&captured);
    let yielded = view.yielded.clone();
    assert!(assess_score_semantics_node(view).unwrap().ok);
    // One measure, part, staff, content, voice, event, and extension. Metadata
    // authors and the opaque extension's nested array are not score children.
    assert_eq!(yielded.get(), 7);
}

#[test]
fn virtual_read_failures_propagate_without_partial_or_invalid_reports() {
    let captured = crate::decode_lossless_json(crate::codec::SMOKE_DOCUMENT).unwrap();
    for fault in [
        "optional",
        "items",
        "item",
        "len",
        "string",
        "number",
        "exact_fields",
        "is_array",
    ] {
        let mut view = View::root(&captured);
        view.fault = Some(fault);
        assert_eq!(
            assess_score_semantics_node(view.clone()),
            Err(AssessmentFailureV1::InternalCapacity),
            "{fault}",
        );
        assert_eq!(
            assess_score_profile_node(view, &ScoreFeatureProfileV1::k1()),
            Err(AssessmentFailureV1::InternalCapacity),
            "{fault}",
        );
    }
}

#[test]
fn json_cursor_keeps_missing_null_shape_and_exact_field_distinctions() {
    let captured =
        crate::decode_lossless_json(r#"{"present":null,"array":[0,-0,1.5],"object":{"x":1}}"#)
            .unwrap();
    let root = CandidateNode::root(&captured);
    assert!(root.optional("absent").unwrap().is_none());
    assert!(root.optional("present").unwrap().is_some());
    assert_eq!(
        root.field("absent").field("nested").number(),
        Err(AssessmentFailureV1::InvalidCandidateShape {
            path: StablePathV1::new(vec![
                StablePathSegmentV1::Field("absent".into()),
                StablePathSegmentV1::Field("nested".into()),
            ])
            .unwrap(),
        }),
    );
    assert!(root.field("object").exact_fields(&["x"]).unwrap());
    assert!(!root.field("object").exact_fields(&["x", "y"]).unwrap());
    assert!(!root.field("present").is_array().unwrap());
    let mut items = root.field("array").items().unwrap();
    assert_eq!(items.next().unwrap().unwrap().number().unwrap(), 0.0);
    // Captured FiniteNumber normalizes both zero signs before assessment.
    assert!(
        items
            .next()
            .unwrap()
            .unwrap()
            .number()
            .unwrap()
            .is_sign_positive()
    );
    assert_eq!(items.next().unwrap().unwrap().number().unwrap(), 1.5);
    assert!(items.next().is_none());
}
