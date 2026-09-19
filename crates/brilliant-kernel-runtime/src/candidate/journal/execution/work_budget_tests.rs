use super::*;
use crate::store::{build_live_score_store, tests::fixture};
use brilliant_kernel_contracts::{
    CoreCommandEnvelopeV1, KernelStage3ResourceLimitKindV1, ScoreEntityTargetV1,
};

#[test]
fn candidate_work_limit_is_terminal_and_does_not_publish() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    let mut execution =
        CandidateExecution::new(TransactionOverlayV1::new(&store), document.id.clone()).unwrap();
    let used = execution.recorder.candidate.work_budget.used();
    execution.recorder.candidate.work_budget.set_limit(used);
    let target = ScoreEntityTargetV1::Document {
        document_id: document.id.clone(),
    };
    let mut metadata = document.metadata.clone();
    metadata.title = "bounded work".into();

    let first = execution
        .dispatch(
            CoreCommandEnvelopeV1::DocumentSetMetadata {
                target: target.clone(),
                metadata: metadata.clone(),
            },
            Some(0),
        )
        .unwrap_err();
    assert!(matches!(
        first,
        Failure::ResourceLimitExceeded {
            limit_kind: KernelStage3ResourceLimitKindV1::TransactionWorkUnits,
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
        first
    );
    assert!(matches!(
        execution.finish(&store, DocumentVersionV1::initial()),
        Err((failure, _)) if failure == first
    ));
    assert_eq!(store.export_document().unwrap(), document);

    let fresh =
        CandidateExecution::new(TransactionOverlayV1::new(&store), document.id.clone()).unwrap();
    assert!(fresh.finish(&store, DocumentVersionV1::initial()).is_ok());
}
