use super::*;
use crate::{
    CoreDiagnosticCodeV1 as Code, LosslessDecode, ScoreSupportV1, assess_score_profile_node,
};
use brilliant_core_types::{FiniteNumber, StablePathSegmentV1 as Segment, StablePathV1};
use serde_json::json;

fn fixture(events: usize) -> (ScoreDocumentV1, ScoreFeatureProfileV1) {
    let mut raw: serde_json::Value = serde_json::from_str(crate::codec::SMOKE_DOCUMENT).unwrap();
    raw["measureDefinitions"][0]["meter"] = json!({"numerator":events,"denominator":64});
    raw["parts"][0]["measureContents"][0]["voices"][0]["sequence"]["events"] = json!(
        (0..events)
            .map(|index| json!({
                "id":format!("event-{index}"),
                "duration":{"base":64,"dots":0},
                "content":{"kind":"rest"}
            }))
            .collect::<Vec<_>>()
    );
    let document = ScoreDocumentV1::from_lossless_value(
        crate::decode_js_value_json(&raw.to_string()).unwrap(),
    )
    .unwrap();
    let mut profile = ScoreFeatureProfileV1::k1();
    profile.meters =
        serde_json::from_value(json!([{"numerator":events,"denominator":64}])).unwrap();
    (document, profile)
}

#[test]
fn all_6401_diagnostics_are_delivered_in_bounded_deterministic_pages() {
    let (document, profile) = fixture(6401);
    let before = document.clone();
    assert_eq!(
        assess_score_profile_node(DocumentAssessmentNodeV1::new(&document), &profile),
        Err(AssessmentFailureV1::DiagnosticLimit {
            limit: 4096,
            actual: 4097,
        })
    );
    let mut offset = 0;
    let mut collected = Vec::new();
    loop {
        let result = assess_score_profile_page_v2(&document, &profile, offset, 1024).unwrap();
        assert_eq!(result.status, ScoreSupportStatusV2::Unsupported);
        assert_eq!(result.offset, offset);
        assert_eq!(result.total, 6401);
        assert!(result.diagnostics.len() <= 1024);
        assert_eq!(
            assess_score_profile_page_v2(&document, &profile, offset, 1024).unwrap(),
            result,
            "repeat reads do not consume a page"
        );
        collected.extend(result.diagnostics);
        match result.next_offset {
            Some(next) => {
                assert_eq!(next, collected.len());
                offset = next;
            }
            None => break,
        }
    }
    assert_eq!(collected.len(), 6401);
    // Independent expected traversal paths, not a second use of the page walk.
    for (index, diagnostic) in collected.iter().enumerate() {
        let path = StablePathV1::new(vec![
            Segment::Field("parts".into()),
            Segment::Index(0),
            Segment::Field("measureContents".into()),
            Segment::Index(0),
            Segment::Field("voices".into()),
            Segment::Index(0),
            Segment::Field("sequence".into()),
            Segment::Field("events".into()),
            Segment::Index(index as u64),
            Segment::Field("duration".into()),
            Segment::Field("base".into()),
        ])
        .unwrap();
        assert_eq!(
            diagnostic,
            &CoreDiagnosticV1::new(Code::UnsupportedNoteValueBase, path, None)
        );
    }
    let tail = assess_score_profile_page_v2(&document, &profile, 6399, 4096).unwrap();
    assert_eq!(tail.diagnostics, collected[6399..]);
    assert_eq!(tail.next_offset, None);
    assert_eq!(document, before);
}

#[test]
fn pages_match_complete_v1_reports_and_do_not_depend_on_page_size() {
    let (document, mut profile) = fixture(13);
    // Exercise multiple rule kinds in the same traversal.
    profile.part_count.maximum = FiniteNumber::new(0.0).unwrap();
    profile.meters.clear();
    let ScoreSupportV1::Unsupported { diagnostics } =
        assess_score_profile_node(DocumentAssessmentNodeV1::new(&document), &profile).unwrap()
    else {
        panic!("unsupported")
    };
    assert_eq!(diagnostics.len(), 15);
    for size in [1, 2, 7, 4096] {
        let mut actual = Vec::new();
        let mut offset = 0;
        loop {
            let result = assess_score_profile_page_v2(&document, &profile, offset, size).unwrap();
            assert_eq!(result.total, diagnostics.len());
            actual.extend(result.diagnostics);
            match result.next_offset {
                Some(next) => offset = next,
                None => break,
            }
        }
        assert_eq!(actual, diagnostics);
    }
}

#[test]
fn supported_empty_terminal_pages_and_invalid_offsets_are_unambiguous() {
    let (document, mut profile) = fixture(2);
    let end = assess_score_profile_page_v2(&document, &profile, 2, 1).unwrap();
    assert_eq!(end.status, ScoreSupportStatusV2::Unsupported);
    assert_eq!(end.total, 2);
    assert!(end.diagnostics.is_empty());
    assert_eq!(end.next_offset, None);
    for offset in [3, usize::MAX] {
        assert_eq!(
            assess_score_profile_page_v2(&document, &profile, offset, 4096),
            Err(ProfilePageFailureV2::OffsetOutOfBounds { total: 2 })
        );
    }
    profile
        .note_value_bases
        .push(FiniteNumber::new(64.0).unwrap());
    let empty = assess_score_profile_page_v2(&document, &profile, 0, 1).unwrap();
    assert_eq!(empty.status, ScoreSupportStatusV2::Supported);
    assert_eq!(empty.total, 0);
    assert!(empty.diagnostics.is_empty());
    assert_eq!(empty.next_offset, None);
    assert_eq!(
        assess_score_profile_page_v2(&document, &profile, 1, 1),
        Err(ProfilePageFailureV2::OffsetOutOfBounds { total: 0 })
    );
}

#[test]
fn invalid_semantics_suppress_profile_warnings_and_keep_the_old_failure_limit() {
    let (mut document, profile) = fixture(4097);
    document.metadata.tempo.bpm = FiniteNumber::new(-1.0).unwrap();
    let invalid = assess_score_profile_page_v2(&document, &profile, 0, 1).unwrap();
    assert_eq!(invalid.status, ScoreSupportStatusV2::Invalid);
    assert_eq!(invalid.total, 1);
    assert_eq!(invalid.diagnostics[0].code, Code::TempoInvalid);
    assert_eq!(invalid.next_offset, None);
    for event in &mut document.parts[0].measure_contents[0].voices[0]
        .sequence
        .events
    {
        event.id = brilliant_core_types::StableId::new("duplicate").unwrap();
    }
    assert_eq!(
        assess_score_profile_page_v2(&document, &profile, 0, 1),
        Err(ProfilePageFailureV2::Assessment(
            AssessmentFailureV1::DiagnosticLimit {
                limit: 4096,
                actual: 4097,
            }
        ))
    );
    for size in [0, 4097, usize::MAX] {
        assert_eq!(
            assess_score_profile_page_v2(&document, &profile, usize::MAX, size),
            Err(ProfilePageFailureV2::InvalidPageSize { maximum: 4096 }),
            "request validation precedes even failing semantic assessment"
        );
    }
}
