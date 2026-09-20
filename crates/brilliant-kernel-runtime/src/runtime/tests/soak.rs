use super::*;
use brilliant_kernel_contracts::{
    CHECKPOINT_ENTRY_INTERVAL_V1, KernelStage4CommandResultV1, KernelStage4MarkPersistedResultV1,
    PersistedCheckpointV1,
};

const REGRESSION_SUBMITS: usize = CHECKPOINT_ENTRY_INTERVAL_V1 as usize * 2 + 17;
const RELEASE_SOAK_SUBMITS: usize = 10_000;

#[test]
fn repeated_history_branches_bound_caches_and_preserve_indices() {
    run_sequence(REGRESSION_SUBMITS, 97);
}

#[test]
#[ignore = "explicit release soak: 10,000 submits plus history transitions"]
fn ten_thousand_submit_history_checkpoint_soak() {
    run_sequence(RELEASE_SOAK_SUBMITS, 257);
}

fn run_sequence(submits: usize, branch_interval: usize) {
    let mut runtime = KernelRuntime::create(crate::store::tests::fixture()).expect("runtime");
    let mut checkpoint_documents: Vec<
        std::sync::Weak<brilliant_score_foundation::ScoreDocumentV1>,
    > = Vec::new();
    let mut prior_snapshot: Option<std::sync::Weak<brilliant_score_foundation::ScoreDocumentV1>> =
        None;
    let mut maximum_history_capacity = 0;
    let mut successful_appends = 0_u64;

    for index in 1..=submits {
        let snapshot_before_mutation = prior_snapshot.take();

        let result = submit_metadata_title(&mut runtime, &format!("soak-title-{index}"));
        let KernelStage4CommandResultV1::Committed { value, .. } = result else {
            panic!("submit {index} rejected")
        };
        successful_appends += 1;
        assert_eq!(value.document_version, runtime.document_version);
        if let Some(snapshot) = snapshot_before_mutation {
            assert!(
                snapshot.upgrade().is_none(),
                "mutation {index} retained the prior projection snapshot"
            );
        }

        record_checkpoint(
            &runtime,
            value.stage4_metrics.checkpoint_successes,
            &format!("submit {index}"),
            &mut checkpoint_documents,
        );

        let history = runtime.history.observation();
        maximum_history_capacity = maximum_history_capacity.max(history.capacity);
        assert_eq!(history.cursor, history.entries);
        assert_eq!(history.next_sequence, successful_appends + 1);
        assert!(history.capacity >= history.entries);

        let projection = runtime.projection.observation();
        assert_eq!(
            projection.version_identities,
            runtime.document_version.get() as usize + 1
        );
        assert_eq!(projection.snapshot_version, None);
        assert!(projection.next_event_sequence > runtime.document_version.get());

        if index % branch_interval == 0 {
            let branch = cycle_and_branch(&mut runtime, index);
            let KernelStage4CommandResultV1::Committed { value, .. } = branch else {
                unreachable!("cycle_and_branch accepts only a committed branch")
            };
            successful_appends += 1;
            record_checkpoint(
                &runtime,
                value.stage4_metrics.checkpoint_successes,
                &format!("branch {index}"),
                &mut checkpoint_documents,
            );
            assert_index_parity(&runtime);
        }

        if index % 211 == 0 {
            let checkpoint = PersistedCheckpointV1 {
                document_id: runtime.document_id().clone(),
                document_version: runtime.document_version,
            };
            assert!(matches!(
                runtime.mark_persisted(checkpoint),
                KernelStage4MarkPersistedResultV1::Updated { .. }
            ));
            if let Some(retained) = checkpoint_documents.last() {
                assert!(
                    retained.upgrade().is_some(),
                    "persisted marker {index} released the operational checkpoint"
                );
            }
        }

        if index % 73 == 0 {
            let state = runtime.read_stage4(None).expect("snapshot read");
            assert!(state.snapshot.document.is_some());
            prior_snapshot = runtime.projection.cached_document_for_test();
            assert!(prior_snapshot.is_some());
        }
    }

    if let Some(snapshot) = prior_snapshot {
        assert!(snapshot.upgrade().is_some());
    }
    assert!(checkpoint_documents.len() >= 2);
    assert!(
        checkpoint_documents
            .iter()
            .take(checkpoint_documents.len() - 1)
            .all(|document| document.upgrade().is_none())
    );
    assert!(checkpoint_documents.last().unwrap().upgrade().is_some());

    let before_branch = runtime.history.observation();
    let discard = before_branch.cursor / 2;
    for step in 0..discard {
        assert!(matches!(
            runtime.undo(),
            KernelStage4CommandResultV1::Committed { .. }
        ));
        if step % 257 == 0 {
            assert_index_parity(&runtime);
        }
    }
    let branched_cursor = runtime.history.observation().cursor;
    assert!(matches!(
        submit_metadata_title(&mut runtime, "soak-final-branch"),
        KernelStage4CommandResultV1::Committed { .. }
    ));
    let after_branch = runtime.history.observation();
    assert_eq!(after_branch.entries, branched_cursor + 1);
    assert_eq!(after_branch.cursor, after_branch.entries);
    assert_eq!(runtime.history.projected().unwrap().redo_depth, 0);
    assert!(after_branch.capacity <= maximum_history_capacity);

    let projection = runtime.projection.observation();
    assert_eq!(
        projection.version_identities,
        runtime.document_version.get() as usize + 1
    );
    assert_index_parity(&runtime);
}

fn cycle_and_branch(runtime: &mut KernelRuntime, index: usize) -> KernelStage4CommandResultV1 {
    assert!(matches!(
        runtime.undo(),
        KernelStage4CommandResultV1::Committed { .. }
    ));
    assert!(matches!(
        runtime.redo(),
        KernelStage4CommandResultV1::Committed { .. }
    ));
    assert!(matches!(
        runtime.undo(),
        KernelStage4CommandResultV1::Committed { .. }
    ));
    let result = submit_metadata_title(runtime, &format!("soak-branch-{index}"));
    assert!(matches!(
        result,
        KernelStage4CommandResultV1::Committed { .. }
    ));
    result
}

fn record_checkpoint(
    runtime: &KernelRuntime,
    successes: u64,
    operation: &str,
    checkpoint_documents: &mut Vec<std::sync::Weak<brilliant_score_foundation::ScoreDocumentV1>>,
) {
    if successes == 0 {
        return;
    }
    assert_eq!(successes, 1, "{operation} reported multiple checkpoints");
    let retained = runtime
        .checkpoint
        .retained_document_for_test()
        .expect("successful checkpoint retains one document");
    if let Some(previous) = checkpoint_documents.last() {
        assert!(
            previous.upgrade().is_none(),
            "{operation} retained the replaced checkpoint document"
        );
    }
    checkpoint_documents.push(retained);
}

fn assert_index_parity(runtime: &KernelRuntime) {
    let (rebuilt, _) = crate::indices::rebuild_indices_from_store(&runtime.store)
        .expect("rebuild indices after long sequence");
    assert_eq!(
        crate::indices::normalized_index_projection(&runtime.store, &runtime.store.indices)
            .expect("live index projection"),
        crate::indices::normalized_index_projection(&runtime.store, &rebuilt)
            .expect("rebuilt index projection")
    );
}
