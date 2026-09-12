use super::*;
use crate::{
    candidate::tests::{id, raw_part},
    store::{build_live_score_store, tests::fixture},
};
use score::{LosslessDecode, LosslessEncode};

fn captured(value: &impl LosslessEncode) -> brilliant_core_types::LosslessJsonValue {
    let mut bytes = Vec::new();
    value.write_lossless(&mut bytes).unwrap();
    score::decode_lossless_json(std::str::from_utf8(&bytes).unwrap()).unwrap()
}

#[test]
fn virtual_final_report_matches_all_changed_fields_and_occurrence_order() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    let mut expected =
        score::ScoreDocumentV1::<JsString>::from_lossless_value(captured(&document)).unwrap();
    let mut prefix = TransactionOverlayV1::new(&store);
    let mut metadata = document.metadata.clone();
    metadata.tempo.bpm = brilliant_core_types::FiniteNumber::new(0.0).unwrap();
    prefix
        .replace_scalar(
            Scalar::DocumentMetadata {
                document_id: document.id.clone(),
            },
            Value::DocumentMetadata(metadata.clone()),
        )
        .unwrap();
    expected.metadata = metadata;
    let mut candidate = Candidate::new(prefix, document.id.clone());
    let mut part = raw_part(JsString::from_utf16(vec![0xd800]));
    part.staves[0].id = "".into();
    part.staves[0].line_count = brilliant_core_types::SafeInteger::new(0).unwrap();
    part.measure_contents[0].measure_id = "unknown-measure".into();
    part.measure_contents.push(part.measure_contents[0].clone());
    for content in &mut part.measure_contents {
        for voice in &mut content.voices {
            voice.default_staff_id = "unknown-staff".into();
            for event in &mut voice.sequence.events {
                event.staff_id = Some("".into());
                if let score::RhythmicContentV1::Notes { notes } = &mut event.content {
                    notes[0].written_pitch.octave =
                        brilliant_core_types::SafeInteger::new(100).unwrap();
                }
            }
        }
    }
    expected.parts.insert(0, part.clone());
    candidate.insert_part(part, None).unwrap();
    let reference = score::assess_score_semantics(&captured(&expected)).unwrap();
    assert!(!reference.ok);
    assert!(reference.diagnostics.len() > 10);
    assert_eq!(
        candidate.integrated_document(&|id| Ok(id.clone())).unwrap(),
        expected
    );
    assert_eq!(candidate.assess_final_semantics().unwrap(), reference);
    assert_eq!(store.export_document().unwrap(), document);
    assert_eq!(
        candidate.work.prefix_order_copies, 1,
        "only the actual Part insertion copied an order"
    );
}

#[test]
fn duplicate_inserted_before_a_prefix_staff_reports_the_later_old_occurrence() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    let mut candidate = Candidate::new(TransactionOverlayV1::new(&store), document.id.clone());
    let owner = candidate.resolve(Kind::Part, &"part-z".into()).unwrap();
    let staff = &document.parts[0].staves[0];
    candidate
        .insert_staff(
            &owner,
            score::StaffDefinitionV1 {
                id: staff.id.as_js_string().clone(),
                line_count: staff.line_count,
                default_clef: staff.default_clef.clone(),
            },
            None,
        )
        .unwrap();
    let report = candidate.assess_final_semantics().unwrap();
    assert_eq!(report.diagnostics.len(), 1);
    assert_eq!(
        report.diagnostics[0].code,
        score::CoreDiagnosticCodeV1::IdDuplicate
    );
    assert_eq!(
        report.diagnostics[0].path,
        StablePathV1::new(vec![
            StablePathSegmentV1::Field("parts".into()),
            StablePathSegmentV1::Index(0),
            StablePathSegmentV1::Field("staves".into()),
            StablePathSegmentV1::Index(1),
            StablePathSegmentV1::Field("id".into()),
        ])
        .unwrap()
    );
}

#[test]
fn every_final_view_collection_failure_is_terminal_without_a_partial_report() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    let mut baseline = Candidate::new(TransactionOverlayV1::new(&store), document.id.clone());
    assert!(baseline.assess_final_semantics().unwrap().ok);
    let attempts = baseline.reservation.attempts;
    assert!(attempts > 5);
    for fail_at in 1..=attempts {
        let mut candidate = Candidate::new(TransactionOverlayV1::new(&store), document.id.clone());
        candidate.reservation = Reservation::fail_at(fail_at);
        assert_eq!(
            candidate.assess_final_semantics(),
            Err(AssessmentFailure::InternalCapacity),
            "allocation {fail_at}"
        );
        assert_eq!(candidate.reservation.attempts, fail_at);
        assert_eq!(
            candidate.assess_final_semantics(),
            Err(AssessmentFailure::InternalCapacity)
        );
        assert_eq!(
            candidate.replace_value(
                &candidate.document.clone(),
                Value::DocumentMetadata(document.metadata.clone())
            ),
            Err(Failure::InternalError)
        );
        assert_eq!(store.export_document().unwrap(), document);
    }
}

#[test]
fn final_assessment_borrows_base_orders_and_never_detaches_opaque_payloads() {
    use crate::{
        change_set::{AnchoredExtensionBlockV1, EntityBundleV1},
        overlay::{CoreBaseReadV1, ExtensionKeyV1},
        store::LiveScoreStore,
    };
    struct Guard<'a> {
        store: &'a LiveScoreStore,
        headers_available: bool,
    }
    impl CoreBaseReadV1 for Guard<'_> {
        fn resolve_entity(&self, id: &StableId) -> Option<Entity> {
            self.store.resolve_entity(id)
        }
        fn read_owner(&self, entity: &Entity) -> Option<Owner> {
            self.store.read_owner(entity)
        }
        fn read_scalar(&self, scalar: &Scalar) -> Option<Value> {
            self.store.read_scalar(scalar)
        }
        fn detach_entity(&self, _: &Entity) -> Option<EntityBundleV1> {
            panic!("aggregate detach during final assessment")
        }
        fn read_event_content_kind(&self, id: &StableId) -> Option<EventContentKind> {
            self.store.read_event_content_kind(id)
        }
        fn read_order(&self, _: &Order) -> Option<Vec<StableId>> {
            panic!("base order clone during final assessment")
        }
        fn visit_order(
            &self,
            order: &Order,
            visitor: &mut dyn FnMut(&StableId) -> bool,
        ) -> Option<()> {
            self.store.visit_order(order, visitor)
        }
        fn read_extension(&self, _: &ExtensionKeyV1) -> Option<AnchoredExtensionBlockV1> {
            panic!("opaque payload clone during final assessment")
        }
        fn visit_extension_headers(
            &self,
            visitor: &mut dyn FnMut(&ExtensionHeaderV1) -> bool,
        ) -> Result<(), ExtensionHeaderReadFailureV1> {
            if self.headers_available {
                self.store.visit_extension_headers(visitor)
            } else {
                Err(ExtensionHeaderReadFailureV1::Unavailable)
            }
        }
        fn read_reference(&self, reference: &Reference) -> Option<ReferenceValueV1> {
            self.store.read_reference(reference)
        }
        fn list_references_to(&self, id: &StableId) -> Vec<Reference> {
            self.store.list_references_to(id)
        }
        fn read_voice_time(&self, _: &StableId) -> Option<Vec<StableId>> {
            panic!("time index clone during final assessment")
        }
    }
    let mut document = fixture();
    document.extensions[0].payload.insert(
        "large".into(),
        brilliant_core_types::JsonValue::String(JsString::from("opaque".repeat(100_000))),
    );
    let store = build_live_score_store(&document).unwrap();
    for headers_available in [false, true] {
        let base = Guard {
            store: &store,
            headers_available,
        };
        let mut candidate = Candidate::new(TransactionOverlayV1::new(&base), document.id.clone());
        let result = candidate.assess_final_semantics();
        if headers_available {
            assert!(result.unwrap().ok);
        } else {
            assert_eq!(
                result,
                Err(AssessmentFailure::InvalidCandidateShape {
                    path: StablePathV1::field("extensions")
                })
            );
        }
        assert_eq!(candidate.work.prefix_order_copies, 0);
    }
    assert_eq!(store.export_document().unwrap(), document);
    assert_eq!(document.parts[0].id, id("part-z"));
}

#[test]
fn edited_prefix_header_capacity_failure_is_internal_and_terminal() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    for fail_at in 1..=document.extensions.len() + 1 {
        let mut prefix = TransactionOverlayV1::new(&store);
        let mut added = document.extensions[0].clone();
        added.namespace = "example.added".into();
        prefix
            .insert_extension(crate::change_set::StableAnchorV1::Start, added)
            .unwrap();
        let mut candidate = Candidate::new(prefix, document.id.clone());
        crate::overlay::fail_header_reservation_at(Some(fail_at));
        let result = candidate.assess_final_semantics();
        crate::overlay::fail_header_reservation_at(None);
        assert_eq!(
            result,
            Err(AssessmentFailure::InternalCapacity),
            "fold reservation {fail_at}"
        );
        assert_eq!(
            candidate.assess_final_semantics(),
            Err(AssessmentFailure::InternalCapacity)
        );
        assert_eq!(
            candidate.replace_value(
                &candidate.document.clone(),
                Value::DocumentMetadata(document.metadata.clone())
            ),
            Err(Failure::InternalError)
        );
        assert_eq!(store.export_document().unwrap(), document);
    }
}
