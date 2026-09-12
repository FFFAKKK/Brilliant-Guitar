use super::*;
use crate::candidate::tests::id;
use crate::change_set::MAX_PREPARED_EFFECTS_V1;
use crate::store::{build_live_score_store, tests::fixture};
use brilliant_core_types::SafeInteger;
use brilliant_kernel_contracts::{CoreCommandEnvelopeV1, KernelStage3ResourceLimitKindV1};

fn source() -> ModuleSegmentSource {
    ModuleSegmentSource {
        command_id: id("module.apply"),
        module_id: id("module.owner"),
        contribution_id: id("module.contribution"),
    }
}

#[test]
fn module_then_core_and_core_budget_then_module_share_the_effect_cap() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    for module_last in [false, true] {
        let mut execution =
            CandidateExecution::new(TransactionOverlayV1::new(&store), document.id.clone())
                .unwrap();
        execution
            .accounting
            .add_prepared_effects(MAX_PREPARED_EFFECTS_V1 - 1)
            .unwrap();
        let start = execution.begin_module();
        let mut block = document.extensions[0].clone();
        block.schema_version = SafeInteger::new(2).unwrap();
        execution
            .module_extension(
                block.namespace.clone(),
                ExtensionOwnerV1::Score,
                Some(block.clone()),
            )
            .unwrap();
        let error = if module_last {
            block.schema_version = SafeInteger::new(3).unwrap();
            execution
                .module_extension(
                    block.namespace.clone(),
                    ExtensionOwnerV1::Score,
                    Some(block),
                )
                .unwrap();
            execution.end_module(start, 1, source(), &[]).unwrap_err()
        } else {
            execution.end_module(start, 0, source(), &[]).unwrap();
            let mut metadata = document.metadata.clone();
            metadata.title = "next core child".into();
            execution
                .dispatch(
                    CoreCommandEnvelopeV1::DocumentSetMetadata {
                        target: Target::Document {
                            document_id: document.id.clone(),
                        },
                        metadata,
                    },
                    Some(1),
                )
                .unwrap_err()
        };
        assert_eq!(
            error,
            Failure::ResourceLimitExceeded {
                limit_kind: KernelStage3ResourceLimitKindV1::Effects,
                limit: MAX_PREPARED_EFFECTS_V1,
                actual: MAX_PREPARED_EFFECTS_V1 + 1
            }
        );
        assert!(
            execution
                .finish(&store, DocumentVersionV1::initial())
                .is_err()
        );
        assert_eq!(store.export_document().unwrap(), document);
    }
}

#[test]
fn actual_module_noop_at_full_effect_budget_adds_no_affected_or_segment() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    let mut execution =
        CandidateExecution::new(TransactionOverlayV1::new(&store), document.id.clone()).unwrap();
    execution
        .accounting
        .add_prepared_effects(MAX_PREPARED_EFFECTS_V1)
        .unwrap();
    let start = execution.begin_module();
    let block = document.extensions[0].clone();
    execution
        .module_extension(
            block.namespace.clone(),
            ExtensionOwnerV1::Score,
            Some(block),
        )
        .unwrap();
    execution
        .end_module(
            start,
            0,
            source(),
            &[Target::Document {
                document_id: document.id.clone().into(),
            }],
        )
        .unwrap();
    assert!(execution.affected.is_empty());
    assert!(execution.segments.is_empty());
    assert!(!execution.changed);
    assert_eq!(store.export_document().unwrap(), document);
}

#[test]
fn module_segment_charges_retained_source_ids_and_deduplicates_affected_with_core() {
    let document = fixture();
    let store = build_live_score_store(&document).unwrap();
    let mut execution =
        CandidateExecution::new(TransactionOverlayV1::new(&store), document.id.clone()).unwrap();
    let target = Target::Document {
        document_id: document.id.clone(),
    };
    let mut metadata = document.metadata.clone();
    metadata.title = "core prefix".into();
    execution
        .dispatch(
            CoreCommandEnvelopeV1::DocumentSetMetadata {
                target: target.clone(),
                metadata,
            },
            Some(0),
        )
        .unwrap();
    let start = execution.begin_module();
    let mut block = document.extensions[0].clone();
    block.schema_version = SafeInteger::new(2).unwrap();
    execution
        .module_extension(
            block.namespace.clone(),
            ExtensionOwnerV1::Score,
            Some(block),
        )
        .unwrap();
    let affected = Target::Document {
        document_id: document.id.clone().into(),
    };
    execution
        .end_module(start, 1, source(), &[affected.clone(), affected.clone()])
        .unwrap();
    assert_eq!(execution.affected, vec![affected]);
    assert_eq!(execution.segments.len(), 2);
    let before = execution.accounting.logical_bytes();
    for id in [
        source().command_id,
        source().module_id,
        source().contribution_id,
    ] {
        execution.accounting.intern(id.as_js_string()).unwrap();
    }
    assert_eq!(
        execution.accounting.logical_bytes(),
        before,
        "source identity strings were already charged"
    );
}
