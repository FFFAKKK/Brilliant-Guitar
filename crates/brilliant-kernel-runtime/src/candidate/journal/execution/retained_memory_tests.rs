use super::*;
use crate::change_set::MAX_CHANGESET_LOGICAL_BYTES_V1;
use crate::store::{build_live_score_store, tests::fixture};
use brilliant_kernel_contracts::{
    CoreCommandEnvelopeV1, KernelStage3ResourceLimitKindV1, ScoreEntityTargetV1,
};

#[test]
fn ordinary_candidate_stays_inside_the_retained_envelope() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    let execution =
        CandidateExecution::new(TransactionOverlayV1::new(&store), document.id.clone()).unwrap();

    assert!(execution.retained_bytes_upper_bound() < MAX_CANDIDATE_RETAINED_BYTES_V1);
    let prepared = execution
        .finish(&store, DocumentVersionV1::initial())
        .unwrap();
    assert!(!prepared.changed);
    assert_eq!(store.export_document().unwrap(), document);
}

#[test]
fn retained_envelope_rejects_before_candidate_publication() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    let mut execution =
        CandidateExecution::new(TransactionOverlayV1::new(&store), document.id.clone()).unwrap();
    let remaining = MAX_CHANGESET_LOGICAL_BYTES_V1 - execution.accounting.logical_bytes();
    execution.accounting.charge_test_only(remaining).unwrap();
    let metrics = execution.attempt_metrics();

    let (failure, failed_metrics) = match execution.finish(&store, DocumentVersionV1::initial()) {
        Ok(_) => panic!("retained-memory envelope must reject"),
        Err(failure) => failure,
    };
    let Failure::ResourceLimitExceeded {
        limit_kind,
        limit,
        actual,
    } = failure
    else {
        panic!("expected retained-memory resource failure")
    };
    assert_eq!(
        limit_kind,
        KernelStage3ResourceLimitKindV1::CandidateRetainedBytes
    );
    assert_eq!(limit, MAX_CANDIDATE_RETAINED_BYTES_V1);
    assert!(actual > limit);
    assert_eq!(failed_metrics, metrics);
    assert_eq!(store.export_document().unwrap(), document);

    let fresh =
        CandidateExecution::new(TransactionOverlayV1::new(&store), document.id.clone()).unwrap();
    assert!(fresh.finish(&store, DocumentVersionV1::initial()).is_ok());
}

#[test]
fn retained_limit_failure_is_terminal_and_cannot_be_swallowed() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    let mut execution =
        CandidateExecution::new(TransactionOverlayV1::new(&store), document.id.clone()).unwrap();
    execution.retained_limit = execution.retained_bytes_upper_bound();
    let target = ScoreEntityTargetV1::Document {
        document_id: document.id.clone(),
    };
    let mut metadata = document.metadata.clone();
    metadata.title = "retained limit".into();

    let failure = execution
        .dispatch(
            CoreCommandEnvelopeV1::DocumentSetMetadata {
                target: target.clone(),
                metadata: metadata.clone(),
            },
            Some(0),
        )
        .unwrap_err();
    assert!(matches!(
        failure,
        Failure::ResourceLimitExceeded {
            limit_kind: KernelStage3ResourceLimitKindV1::CandidateRetainedBytes,
            ..
        }
    ));
    assert_eq!(
        execution
            .dispatch(
                CoreCommandEnvelopeV1::DocumentSetMetadata { target, metadata },
                Some(1),
            )
            .unwrap_err(),
        Failure::InternalError
    );
    assert!(
        execution
            .finish(&store, DocumentVersionV1::initial())
            .is_err()
    );
    assert_eq!(store.export_document().unwrap(), document);
}
