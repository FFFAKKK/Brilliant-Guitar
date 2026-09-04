use std::{
    collections::{HashMap, HashSet},
    sync::Arc,
};

use brilliant_core_types::{
    DocumentVersionV1, JS_SAFE_INTEGER_MAX, SafeInteger, StableId, StablePathV1,
};
use brilliant_kernel_contracts::{
    CoreCommandEnvelopeV1, EventStaffAssignmentV1, InsertMeasurePartContentV1, KernelEventCauseV1,
    KernelEventV1, KernelHistoryStateV1, KernelReadStateV1, KernelSelectorResultV1,
    KernelSelectorValueV1, KernelStage3CommandFailureLeafV1, KernelStage3MetricsV1,
    KernelStage3ResourceLimitKindV1, KernelStage4CommandResultV1, KernelStage4FailureV1,
    KernelStage4MarkPersistedResultV1, KernelStage4MarkPersistedValueV1, KernelStage4MetricsV1,
    KernelStage4MutationValueV1, KernelStage4ReadStateV1, KernelStage4RejectedValueV1,
    KernelStage4SelectValueV1, KernelStage4SnapshotV1, MeasureAnchorV1, MeasurePickupV1,
    NoteAddressV1, PartAnchorV1, PersistedCheckpointV1, PitchTranspositionErrorV1,
    ScoreEntityTargetV1, ScoreRangeV1, ScoreStructureViolationV1, SelectedScoreEntityV1,
    SelectorRequestV1, SequenceAnchorV1, SharedScoreDocumentV1, StableFailureV1, StaffAnchorV1,
    VoiceAnchorV1, initial_snapshot,
};
use brilliant_score_foundation::{
    ClefV1, FractionV1, InstrumentDescriptorV1, MeasureDefinitionV1, MeterV1, NoteValueV1, PartV1,
    PitchStepV1, RhythmicContentV1, RhythmicEventV1, ScoreDocumentV1, ScoreMetadataV1,
    StaffDefinitionV1, TranspositionV1, VoiceV1, WrittenPitchV1,
};

use crate::{
    change_set::{
        ChangeSetBuildFailureV1, ChangeSetV1, EntityBundleV1, MeasureBundleV1,
        MeasurePartContentBundleV1, PartBundleV1, ReferenceAddressV1, ReferenceValueV1,
        ScalarAddressV1, ScalarValueV1, StableAnchorV1, StableEntityAddressV1,
        StableOrderAddressV1, StableOwnerAddressV1,
    },
    checkpoint::{CheckpointPrepareFailureV1, CheckpointStateV1},
    history::{HistoryPrepareFailureV1, HistoryStateV1},
    overlay::{OverlayFailureV1, OverlayMutationV1, TransactionOverlayV1},
    selectors::select_from_store,
    session_projection::{ProjectionPrepareFailureV1, SessionProjectionStateV1},
    store::{LiveScoreStore, LiveStoreBuildFailure, build_live_score_store},
    transaction::{TransactionPrepareFailureV1, apply_stored_operations, commit_change_set},
};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum KernelRuntimeCreateFailure {
    InternalCapacity,
    InvalidDocument(ScoreStructureViolationV1),
    InternalInvariant,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum KernelRuntimeReadFailure {
    InternalInvariant,
}

#[derive(Clone, Debug)]
pub struct KernelStage3PreparedV1 {
    change_set: ChangeSetV1,
    attempt_metrics: KernelStage3MetricsV1,
}

impl KernelStage3PreparedV1 {
    pub fn attempt_metrics(&self) -> KernelStage3MetricsV1 {
        self.attempt_metrics
    }
}

/// One isolated command transaction. Dropping it publishes no live state.
pub struct KernelStage3TransactionV1<'a> {
    overlay: TransactionOverlayV1<'a>,
    allow_intermediate_empty_containers: bool,
}

#[derive(Clone, Copy)]
enum InsertedEventContentV1 {
    Notes,
    Rest,
}

#[derive(Clone, Debug, Eq, PartialEq)]
enum ResolvedRangeV1 {
    Measures {
        document_id: StableId,
        measure_ids: Vec<StableId>,
    },
    PartMeasures {
        part_id: StableId,
        measure_ids: Vec<StableId>,
    },
    VoiceEvents {
        voice_id: StableId,
        event_ids: Vec<StableId>,
    },
}

#[derive(Clone, Debug, Eq, PartialEq)]
enum RangeEndpointV1<T> {
    Found(T),
    Missing,
    OwnerMismatch,
    Invalid,
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct VoiceEventEndpointV1 {
    event_index: usize,
}

impl KernelRuntimeCreateFailure {
    pub fn into_stable_failure(self) -> StableFailureV1 {
        match self {
            Self::InternalCapacity | Self::InternalInvariant => StableFailureV1::BridgeInternal,
            Self::InvalidDocument(violation) => StableFailureV1::ScoreInvalidStructure {
                path: StablePathV1::root(),
                violation,
            },
        }
    }
}

impl KernelRuntimeReadFailure {
    pub fn into_stable_failure(self) -> StableFailureV1 {
        match self {
            Self::InternalInvariant => StableFailureV1::BridgeInternal,
        }
    }
}

#[derive(Debug)]
pub struct KernelRuntime {
    store: LiveScoreStore,
    document_version: DocumentVersionV1,
    committed_metrics: KernelStage3MetricsV1,
    history: HistoryStateV1,
    projection: SessionProjectionStateV1,
    checkpoint: CheckpointStateV1,
}

impl KernelRuntime {
    pub fn create(document: ScoreDocumentV1) -> Result<Self, KernelRuntimeCreateFailure> {
        let store = build_live_score_store(&document).map_err(map_store_create_failure)?;
        let projection = SessionProjectionStateV1::new().map_err(|failure| match failure {
            ProjectionPrepareFailureV1::Capacity => KernelRuntimeCreateFailure::InternalCapacity,
            ProjectionPrepareFailureV1::EventSequenceOverflow
            | ProjectionPrepareFailureV1::Invariant => {
                KernelRuntimeCreateFailure::InternalInvariant
            }
        })?;
        Ok(Self {
            store,
            document_version: DocumentVersionV1::initial(),
            committed_metrics: KernelStage3MetricsV1::default(),
            history: HistoryStateV1::new(),
            projection,
            checkpoint: CheckpointStateV1::new(),
        })
    }

    pub fn document_id(&self) -> &StableId {
        &self.store.header.id
    }

    pub const fn document_version(&self) -> DocumentVersionV1 {
        self.document_version
    }

    pub fn read_state(&self) -> Result<KernelReadStateV1, KernelRuntimeReadFailure> {
        let (snapshot, _) = self.current_snapshot()?;
        let _ = self.attempt_checkpoint_with_snapshot(&snapshot);
        let mut state = initial_snapshot(snapshot.as_document().clone());
        state.snapshot.document_version = self.document_version;
        state.history = self
            .history
            .projected()
            .map_err(|_| KernelRuntimeReadFailure::InternalInvariant)?;
        let identity = self
            .history
            .current_identity()
            .map_err(|_| KernelRuntimeReadFailure::InternalInvariant)?;
        state.dirty = self.projection.dirty(identity);
        Ok(state)
    }

    pub fn read_stage4(
        &self,
        known_snapshot_version: Option<DocumentVersionV1>,
    ) -> Result<KernelStage4ReadStateV1, KernelRuntimeReadFailure> {
        let (snapshot, materialized) = self.current_snapshot()?;
        let checkpoint_metrics = self.attempt_checkpoint_with_snapshot(&snapshot);
        let identity = self
            .history
            .current_identity()
            .map_err(|_| KernelRuntimeReadFailure::InternalInvariant)?;
        let omit_document = !materialized && known_snapshot_version == Some(self.document_version);
        Ok(KernelStage4ReadStateV1 {
            snapshot: KernelStage4SnapshotV1 {
                document_id: self.store.header.id.clone(),
                schema_version: "brilliant-score-1",
                document_version: self.document_version,
                document: (!omit_document).then_some(snapshot),
            },
            history: self
                .history
                .projected()
                .map_err(|_| KernelRuntimeReadFailure::InternalInvariant)?,
            dirty: self.projection.dirty(identity),
            stage4_metrics: merge_stage4_metrics(
                KernelStage4MetricsV1 {
                    full_snapshot_materializations: u64::from(materialized),
                    ..KernelStage4MetricsV1::default()
                },
                checkpoint_metrics,
            ),
        })
    }

    fn current_snapshot(&self) -> Result<(SharedScoreDocumentV1, bool), KernelRuntimeReadFailure> {
        if let Some(snapshot) = self.projection.cached_snapshot(self.document_version) {
            return Ok((snapshot, false));
        }
        let document = self
            .store
            .export_document()
            .map_err(|_| KernelRuntimeReadFailure::InternalInvariant)?;
        Ok((
            self.projection
                .install_snapshot(self.document_version, document),
            true,
        ))
    }

    fn attempt_checkpoint_with_snapshot(
        &self,
        snapshot: &SharedScoreDocumentV1,
    ) -> KernelStage4MetricsV1 {
        let identity = match self.history.current_identity() {
            Ok(identity) => identity,
            Err(_) => {
                return KernelStage4MetricsV1 {
                    checkpoint_attempts: 1,
                    checkpoint_failures: 1,
                    ..KernelStage4MetricsV1::default()
                };
            }
        };
        let shared = snapshot.clone().into_arc();
        self.checkpoint.attempt(
            self.document_version,
            self.history.cursor(),
            identity,
            || Some(shared),
        )
    }

    fn attempt_checkpoint_maintenance(&self) -> KernelStage4MetricsV1 {
        let identity = match self.history.current_identity() {
            Ok(identity) => identity,
            Err(_) => {
                return KernelStage4MetricsV1 {
                    checkpoint_attempts: 1,
                    checkpoint_failures: 1,
                    ..KernelStage4MetricsV1::default()
                };
            }
        };
        let checkpoint = &self.checkpoint;
        let store = &self.store;
        checkpoint.attempt(
            self.document_version,
            self.history.cursor(),
            identity,
            || store.export_document().ok().map(Arc::new),
        )
    }

    pub fn select_stage4(&self, selector: SelectorRequestV1) -> KernelStage4SelectValueV1 {
        match selector {
            SelectorRequestV1::ScoreEntity {
                address: ScoreEntityTargetV1::Document { document_id },
            } => {
                if document_id != self.store.header.id {
                    return KernelStage4SelectValueV1 {
                        document_version: self.document_version,
                        selection: KernelSelectorResultV1::Rejected(
                            KernelStage4FailureV1::ReadEntityNotFound,
                        ),
                        stage4_metrics: KernelStage4MetricsV1::default(),
                    };
                }
                match self.current_snapshot() {
                    Ok((snapshot, materialized)) => KernelStage4SelectValueV1 {
                        document_version: self.document_version,
                        selection: KernelSelectorResultV1::Ok(KernelSelectorValueV1::Entity(
                            SelectedScoreEntityV1::Document(snapshot.as_document().clone()),
                        )),
                        stage4_metrics: KernelStage4MetricsV1 {
                            full_snapshot_materializations: u64::from(materialized),
                            selector_records_visited: 1,
                            selector_records_returned: 1,
                            ..KernelStage4MetricsV1::default()
                        },
                    },
                    Err(_) => KernelStage4SelectValueV1 {
                        document_version: self.document_version,
                        selection: KernelSelectorResultV1::Rejected(
                            KernelStage4FailureV1::ReadInvariantViolation,
                        ),
                        stage4_metrics: KernelStage4MetricsV1::default(),
                    },
                }
            }
            SelectorRequestV1::HistoryState => {
                let selection = match self.history.projected() {
                    Ok(history) => {
                        KernelSelectorResultV1::Ok(KernelSelectorValueV1::History(history))
                    }
                    Err(_) => KernelSelectorResultV1::Rejected(
                        KernelStage4FailureV1::ReadInvariantViolation,
                    ),
                };
                KernelStage4SelectValueV1 {
                    document_version: self.document_version,
                    selection,
                    stage4_metrics: KernelStage4MetricsV1 {
                        selector_records_visited: 1,
                        selector_records_returned: 1,
                        ..KernelStage4MetricsV1::default()
                    },
                }
            }
            SelectorRequestV1::DirtyState => {
                let selection = match self.history.current_identity() {
                    Ok(identity) => KernelSelectorResultV1::Ok(KernelSelectorValueV1::Dirty(
                        self.projection.dirty(identity),
                    )),
                    Err(_) => KernelSelectorResultV1::Rejected(
                        KernelStage4FailureV1::ReadInvariantViolation,
                    ),
                };
                KernelStage4SelectValueV1 {
                    document_version: self.document_version,
                    selection,
                    stage4_metrics: KernelStage4MetricsV1 {
                        selector_records_visited: 1,
                        selector_records_returned: 1,
                        ..KernelStage4MetricsV1::default()
                    },
                }
            }
            selector => {
                let evaluation = select_from_store(&self.store, &selector);
                KernelStage4SelectValueV1 {
                    document_version: self.document_version,
                    selection: evaluation.result,
                    stage4_metrics: KernelStage4MetricsV1 {
                        selector_records_visited: evaluation.records_visited,
                        selector_records_returned: evaluation.records_returned,
                        ..KernelStage4MetricsV1::default()
                    },
                }
            }
        }
    }

    pub fn begin_stage3_transaction(&self) -> KernelStage3TransactionV1<'_> {
        KernelStage3TransactionV1 {
            overlay: TransactionOverlayV1::new(&self.store),
            allow_intermediate_empty_containers: false,
        }
    }

    pub fn commit_stage4_transaction(
        &mut self,
        command: CoreCommandEnvelopeV1,
        prepared: KernelStage3PreparedV1,
    ) -> Result<KernelStage4CommandResultV1, KernelStage4FailureV1> {
        if prepared.change_set.forward.is_empty() {
            return Ok(KernelStage4CommandResultV1::NoOp {
                value: self.mutation_value(
                    Vec::new(),
                    prepared.attempt_metrics,
                    KernelStage4MetricsV1::default(),
                )?,
            });
        }

        let checkpoint_submit = self
            .checkpoint
            .prepare_submit(prepared.change_set.logical_bytes)
            .map_err(map_checkpoint_prepare_failure)?;
        let history_append = self.history.prepare_append().map_err(map_history_failure)?;
        let identity_before = self
            .history
            .current_identity()
            .map_err(map_history_failure)?;
        let dirty_before = self.projection.dirty(identity_before);
        let dirty_after = self.projection.dirty(history_append.sequence);
        let event_count = 1 + u64::from(dirty_before != dirty_after);
        let projection = self
            .projection
            .prepare_document_transition(
                self.document_version,
                history_append.sequence,
                event_count,
            )
            .map_err(map_projection_failure)?;
        let affected = targets_from_change_set(&prepared.change_set)?;
        let history_affected = clone_targets(&affected)?;
        let event_affected = clone_targets(&affected)?;
        let mut events = Vec::new();
        events
            .try_reserve(event_count as usize)
            .map_err(|_| KernelStage4FailureV1::HistoryInvariantViolation)?;
        let command_id = command.command_id();

        let committed = self
            .commit_stage3_change_set(prepared.change_set)
            .map_err(|failure| {
                KernelStage4FailureV1::Command(map_prepare_failure(failure).into())
            })?;
        self.history
            .commit_append(history_append, command, committed, history_affected);
        self.projection.commit_document_transition(projection);
        self.checkpoint.commit_submit(checkpoint_submit);
        events.push(KernelEventV1::DocumentCommitted {
            event_sequence: projection.event_sequence_start,
            document_id: self.store.header.id.clone(),
            document_version: self.document_version,
            cause: KernelEventCauseV1::Submit,
            command_id,
            affected_entities: event_affected,
        });
        if dirty_before != dirty_after {
            events.push(KernelEventV1::DirtyStateChanged {
                event_sequence: projection.event_sequence_start + 1,
                document_id: self.store.header.id.clone(),
                document_version: self.document_version,
                cause: KernelEventCauseV1::Submit,
                dirty: dirty_after,
            });
        }
        let stage4_metrics = merge_stage4_metrics(
            KernelStage4MetricsV1 {
                events_reserved: event_count,
                events_emitted: event_count,
                ..KernelStage4MetricsV1::default()
            },
            self.attempt_checkpoint_maintenance(),
        );
        Ok(KernelStage4CommandResultV1::Committed {
            value: self.mutation_value(affected, self.committed_metrics, stage4_metrics)?,
            events,
        })
    }

    pub fn undo(&mut self) -> KernelStage4CommandResultV1 {
        if !self.history.can_undo() {
            return self.rejected_command(
                KernelStage4FailureV1::HistoryEmptyUndo,
                KernelStage3MetricsV1::default(),
            );
        }
        self.apply_history_transition(false)
    }

    pub fn redo(&mut self) -> KernelStage4CommandResultV1 {
        if !self.history.can_redo() {
            return self.rejected_command(
                KernelStage4FailureV1::HistoryEmptyRedo,
                KernelStage3MetricsV1::default(),
            );
        }
        self.apply_history_transition(true)
    }

    pub fn mark_persisted(
        &mut self,
        checkpoint: PersistedCheckpointV1,
    ) -> KernelStage4MarkPersistedResultV1 {
        if checkpoint.document_id != self.store.header.id {
            return self.rejected_checkpoint(KernelStage4FailureV1::CheckpointDocumentMismatch);
        }
        let clean_identity = match self
            .projection
            .identity_for_version(self.document_version, checkpoint.document_version)
        {
            Ok(identity) => identity,
            Err(failure) => return self.rejected_checkpoint(failure),
        };
        let current_identity = match self.history.current_identity() {
            Ok(identity) => identity,
            Err(_) => {
                return self
                    .rejected_checkpoint(KernelStage4FailureV1::CheckpointInvariantViolation);
            }
        };
        let prepared = match self
            .projection
            .prepare_mark_persisted(current_identity, clean_identity)
        {
            Ok(Some(prepared)) => prepared,
            Ok(None) => {
                return KernelStage4MarkPersistedResultV1::NoOp {
                    value: KernelStage4MarkPersistedValueV1 {
                        document_version: self.document_version,
                        dirty: self.projection.dirty(current_identity),
                    },
                };
            }
            Err(ProjectionPrepareFailureV1::EventSequenceOverflow) => {
                return self.rejected_checkpoint(KernelStage4FailureV1::EventSequenceOverflow);
            }
            Err(ProjectionPrepareFailureV1::Capacity | ProjectionPrepareFailureV1::Invariant) => {
                return self
                    .rejected_checkpoint(KernelStage4FailureV1::CheckpointInvariantViolation);
            }
        };
        let mut events = Vec::new();
        if events.try_reserve(prepared.event_count as usize).is_err() {
            return self.rejected_checkpoint(KernelStage4FailureV1::CheckpointInvariantViolation);
        }
        let dirty_after = current_identity != prepared.clean_identity;
        self.projection.commit_mark_persisted(prepared);
        if prepared.event_count == 1 {
            events.push(KernelEventV1::DirtyStateChanged {
                event_sequence: prepared.event_sequence_start,
                document_id: self.store.header.id.clone(),
                document_version: self.document_version,
                cause: KernelEventCauseV1::MarkPersisted,
                dirty: dirty_after,
            });
        }
        KernelStage4MarkPersistedResultV1::Updated {
            value: KernelStage4MarkPersistedValueV1 {
                document_version: self.document_version,
                dirty: dirty_after,
            },
            events,
        }
    }

    pub fn invalid_persisted_checkpoint(&self) -> KernelStage4MarkPersistedResultV1 {
        self.rejected_checkpoint(KernelStage4FailureV1::CheckpointInvalid)
    }

    fn apply_history_transition(&mut self, redo: bool) -> KernelStage4CommandResultV1 {
        let prepared = (|| {
            let identity_before = self
                .history
                .current_identity()
                .map_err(map_history_failure)?;
            let identity_after = if redo {
                self.history.identity_after_redo()
            } else {
                self.history.identity_after_undo()
            }
            .map_err(map_history_failure)?;
            let dirty_before = self.projection.dirty(identity_before);
            let dirty_after = self.projection.dirty(identity_after);
            let event_count = 1 + u64::from(dirty_before != dirty_after);
            let projection = self
                .projection
                .prepare_document_transition(self.document_version, identity_after, event_count)
                .map_err(map_projection_failure)?;
            let entry = if redo {
                self.history.redo_entry()
            } else {
                self.history.undo_entry()
            }
            .map_err(map_history_failure)?;
            let command_id = entry.command.command_id();
            let affected = clone_targets(&entry.affected)?;
            let event_affected = clone_targets(&entry.affected)?;
            let mut events = Vec::new();
            events
                .try_reserve(event_count as usize)
                .map_err(|_| KernelStage4FailureV1::HistoryInvariantViolation)?;

            let operations = if redo {
                &entry.change_set.forward
            } else {
                &entry.change_set.inverse
            };
            apply_stored_operations(
                &mut self.store,
                &mut self.document_version,
                &mut self.committed_metrics,
                &entry.change_set,
                operations,
            )
            .map_err(|_| KernelStage4FailureV1::HistoryInvariantViolation)?;
            if redo {
                self.history.commit_redo();
            } else {
                self.history.commit_undo();
            }
            self.projection.commit_document_transition(projection);
            let cause = if redo {
                KernelEventCauseV1::Redo
            } else {
                KernelEventCauseV1::Undo
            };
            events.push(KernelEventV1::DocumentCommitted {
                event_sequence: projection.event_sequence_start,
                document_id: self.store.header.id.clone(),
                document_version: self.document_version,
                cause,
                command_id,
                affected_entities: event_affected,
            });
            if dirty_before != dirty_after {
                events.push(KernelEventV1::DirtyStateChanged {
                    event_sequence: projection.event_sequence_start + 1,
                    document_id: self.store.header.id.clone(),
                    document_version: self.document_version,
                    cause,
                    dirty: dirty_after,
                });
            }
            let stage4_metrics = merge_stage4_metrics(
                KernelStage4MetricsV1 {
                    events_reserved: event_count,
                    events_emitted: event_count,
                    ..KernelStage4MetricsV1::default()
                },
                self.attempt_checkpoint_maintenance(),
            );
            Ok(KernelStage4CommandResultV1::Committed {
                value: self.mutation_value(affected, self.committed_metrics, stage4_metrics)?,
                events,
            })
        })();
        prepared.unwrap_or_else(|failure| {
            self.rejected_command(failure, KernelStage3MetricsV1::default())
        })
    }

    fn mutation_value(
        &self,
        affected: Vec<ScoreEntityTargetV1>,
        metrics: KernelStage3MetricsV1,
        stage4_metrics: KernelStage4MetricsV1,
    ) -> Result<KernelStage4MutationValueV1, KernelStage4FailureV1> {
        let identity = self
            .history
            .current_identity()
            .map_err(map_history_failure)?;
        Ok(KernelStage4MutationValueV1 {
            document_version: self.document_version,
            affected,
            history: self.history.projected().map_err(map_history_failure)?,
            dirty: self.projection.dirty(identity),
            metrics,
            stage4_metrics,
        })
    }

    pub fn rejected_command(
        &self,
        failure: KernelStage4FailureV1,
        metrics: KernelStage3MetricsV1,
    ) -> KernelStage4CommandResultV1 {
        let history = self.history.projected().unwrap_or(KernelHistoryStateV1 {
            undo_depth: 0,
            redo_depth: 0,
        });
        let identity = self.history.current_identity().unwrap_or(0);
        KernelStage4CommandResultV1::Rejected {
            value: KernelStage4RejectedValueV1 {
                document_version: self.document_version,
                history,
                dirty: self.projection.dirty(identity),
                metrics,
                stage4_metrics: KernelStage4MetricsV1::default(),
            },
            failure,
        }
    }

    fn rejected_checkpoint(
        &self,
        failure: KernelStage4FailureV1,
    ) -> KernelStage4MarkPersistedResultV1 {
        let identity = self.history.current_identity().unwrap_or(0);
        KernelStage4MarkPersistedResultV1::Rejected {
            value: KernelStage4MarkPersistedValueV1 {
                document_version: self.document_version,
                dirty: self.projection.dirty(identity),
            },
            failure,
        }
    }

    pub(crate) fn commit_stage3_change_set(
        &mut self,
        change_set: ChangeSetV1,
    ) -> Result<ChangeSetV1, TransactionPrepareFailureV1> {
        commit_change_set(
            &mut self.store,
            &mut self.document_version,
            &mut self.committed_metrics,
            change_set,
        )
    }
}

fn targets_from_change_set(
    change_set: &ChangeSetV1,
) -> Result<Vec<ScoreEntityTargetV1>, KernelStage4FailureV1> {
    let mut values = Vec::new();
    values
        .try_reserve(change_set.affected.len())
        .map_err(|_| KernelStage4FailureV1::HistoryInvariantViolation)?;
    values.extend(
        change_set
            .affected
            .iter()
            .cloned()
            .map(score_target_from_stable_address),
    );
    Ok(values)
}

fn clone_targets(
    source: &[ScoreEntityTargetV1],
) -> Result<Vec<ScoreEntityTargetV1>, KernelStage4FailureV1> {
    let mut values = Vec::new();
    values
        .try_reserve(source.len())
        .map_err(|_| KernelStage4FailureV1::HistoryInvariantViolation)?;
    values.extend(source.iter().cloned());
    Ok(values)
}

fn map_history_failure(failure: HistoryPrepareFailureV1) -> KernelStage4FailureV1 {
    match failure {
        HistoryPrepareFailureV1::Capacity
        | HistoryPrepareFailureV1::SequenceOverflow
        | HistoryPrepareFailureV1::Invariant => KernelStage4FailureV1::HistoryInvariantViolation,
    }
}

fn map_checkpoint_prepare_failure(failure: CheckpointPrepareFailureV1) -> KernelStage4FailureV1 {
    match failure {
        CheckpointPrepareFailureV1::CounterOverflow => {
            KernelStage4FailureV1::HistoryInvariantViolation
        }
    }
}

fn merge_stage4_metrics(
    left: KernelStage4MetricsV1,
    right: KernelStage4MetricsV1,
) -> KernelStage4MetricsV1 {
    KernelStage4MetricsV1 {
        full_snapshot_materializations: left
            .full_snapshot_materializations
            .saturating_add(right.full_snapshot_materializations),
        selector_records_visited: left
            .selector_records_visited
            .saturating_add(right.selector_records_visited),
        selector_records_returned: left
            .selector_records_returned
            .saturating_add(right.selector_records_returned),
        checkpoint_attempts: left
            .checkpoint_attempts
            .saturating_add(right.checkpoint_attempts),
        checkpoint_successes: left
            .checkpoint_successes
            .saturating_add(right.checkpoint_successes),
        checkpoint_failures: left
            .checkpoint_failures
            .saturating_add(right.checkpoint_failures),
        checkpoint_materialized_bytes: left
            .checkpoint_materialized_bytes
            .saturating_add(right.checkpoint_materialized_bytes),
        events_reserved: left.events_reserved.saturating_add(right.events_reserved),
        events_emitted: left.events_emitted.saturating_add(right.events_emitted),
    }
}

fn map_projection_failure(failure: ProjectionPrepareFailureV1) -> KernelStage4FailureV1 {
    match failure {
        ProjectionPrepareFailureV1::EventSequenceOverflow => {
            KernelStage4FailureV1::EventSequenceOverflow
        }
        ProjectionPrepareFailureV1::Capacity | ProjectionPrepareFailureV1::Invariant => {
            KernelStage4FailureV1::HistoryInvariantViolation
        }
    }
}

impl KernelStage3TransactionV1<'_> {
    pub fn attempt_metrics(&self) -> KernelStage3MetricsV1 {
        overlay_attempt_metrics(&self.overlay)
    }

    pub fn begin_batch(
        &mut self,
        document_id: &StableId,
    ) -> Result<(), KernelStage3CommandFailureLeafV1> {
        self.validate_document_target(document_id)?;
        self.allow_intermediate_empty_containers = true;
        Ok(())
    }

    pub fn run_batch_child(
        &mut self,
        execute: impl FnOnce(&mut Self) -> Result<(), KernelStage3CommandFailureLeafV1>,
    ) -> Result<(), KernelStage3CommandFailureLeafV1> {
        let operation_count = self.overlay.operation_count();
        let segment = self.overlay.begin_segment();
        execute(self)?;
        if self.overlay.operation_count() == operation_count {
            return Ok(());
        }
        self.overlay
            .end_segment(segment)
            .map_err(map_overlay_failure)
    }

    pub fn finish(self) -> Result<KernelStage3PreparedV1, KernelStage3CommandFailureLeafV1> {
        if !self.overlay.has_valid_nonempty_containers() {
            return Err(KernelStage3CommandFailureLeafV1::LocalInvariantRejected);
        }
        let attempt_metrics = overlay_attempt_metrics(&self.overlay);
        let change_set = self.overlay.finish().map_err(map_overlay_failure)?;
        Ok(KernelStage3PreparedV1 {
            change_set,
            attempt_metrics,
        })
    }

    pub fn set_document_metadata(
        &mut self,
        document_id: StableId,
        metadata: ScoreMetadataV1,
    ) -> Result<(), KernelStage3CommandFailureLeafV1> {
        let mutation = self.overlay.replace_scalar(
            ScalarAddressV1::DocumentMetadata { document_id },
            ScalarValueV1::DocumentMetadata(metadata),
        );
        self.complete_single_effect(mutation)
    }

    pub fn set_note_written_pitch(
        &mut self,
        note_id: StableId,
        written_pitch: WrittenPitchV1,
    ) -> Result<(), KernelStage3CommandFailureLeafV1> {
        let mutation = self.overlay.replace_scalar(
            ScalarAddressV1::NoteWrittenPitch { note_id },
            ScalarValueV1::NoteWrittenPitch(written_pitch),
        );
        self.complete_single_effect(mutation)
    }

    pub fn set_event_note_value(
        &mut self,
        event_id: StableId,
        note_value: NoteValueV1,
    ) -> Result<(), KernelStage3CommandFailureLeafV1> {
        let mutation = self.overlay.replace_scalar(
            ScalarAddressV1::EventNoteValue { event_id },
            ScalarValueV1::EventNoteValue(note_value),
        );
        self.complete_single_effect(mutation)
    }

    pub fn insert_measure(
        &mut self,
        document_id: StableId,
        anchor: MeasureAnchorV1,
        definition: MeasureDefinitionV1,
        contents: Vec<InsertMeasurePartContentV1>,
    ) -> Result<(), KernelStage3CommandFailureLeafV1> {
        let measure_order = StableOrderAddressV1::Measures {
            document_id: document_id.clone(),
        };
        let Some(current_measures) = self.overlay.read_order(&measure_order) else {
            return Err(KernelStage3CommandFailureLeafV1::TargetNotFound);
        };
        let stable_anchor = resolve_measure_anchor(&current_measures, anchor)?;

        let part_order = StableOrderAddressV1::Parts {
            document_id: document_id.clone(),
        };
        let Some(part_ids) = self.overlay.read_order(&part_order) else {
            return Err(KernelStage3CommandFailureLeafV1::LocalInvariantRejected);
        };
        for entry in &contents {
            let address = StableEntityAddressV1::Part {
                part_id: entry.part_id.clone(),
            };
            if !matches!(
                self.overlay.read_entity(&address),
                Some(EntityBundleV1::Part(_))
            ) {
                return Err(KernelStage3CommandFailureLeafV1::TargetNotFound);
            }
        }
        if current_measures.contains(&definition.id) {
            return Err(KernelStage3CommandFailureLeafV1::LocalInvariantRejected);
        }

        let mut by_part = HashMap::with_capacity(contents.len());
        let mut duplicate_part = false;
        for entry in contents {
            let part_id = entry.part_id.clone();
            duplicate_part |= by_part.insert(part_id, entry).is_some();
        }
        if duplicate_part
            || by_part.len() != part_ids.len()
            || part_ids
                .iter()
                .any(|part_id| !by_part.contains_key(part_id))
        {
            return Err(KernelStage3CommandFailureLeafV1::LocalInvariantRejected);
        }

        let mut bundle_contents = Vec::with_capacity(part_ids.len());
        for part_id in &part_ids {
            let entry = by_part
                .remove(part_id)
                .ok_or(KernelStage3CommandFailureLeafV1::LocalInvariantRejected)?;
            if entry.voices.is_empty() {
                return Err(KernelStage3CommandFailureLeafV1::LocalInvariantRejected);
            }
            bundle_contents.push(MeasurePartContentBundleV1 {
                part_id: part_id.clone(),
                voices: entry.voices,
            });
        }

        let desired_measures =
            inserted_order(&current_measures, &stable_anchor, definition.id.clone())
                .ok_or(KernelStage3CommandFailureLeafV1::LocalInvariantRejected)?;
        let mut part_orders = Vec::with_capacity(part_ids.len());
        let mut needs_normalization = false;
        for part_id in &part_ids {
            let order = StableOrderAddressV1::MeasureContents {
                part_id: part_id.clone(),
            };
            let current = self
                .overlay
                .read_order(&order)
                .ok_or(KernelStage3CommandFailureLeafV1::LocalInvariantRejected)?;
            let predicted = inserted_order(&current, &stable_anchor, definition.id.clone())
                .ok_or(KernelStage3CommandFailureLeafV1::LocalInvariantRejected)?;
            needs_normalization |= predicted != desired_measures;
            part_orders.push((order, current));
        }

        self.record_affected(StableEntityAddressV1::Document {
            document_id: document_id.clone(),
        })?;
        let measure_id = definition.id.clone();
        let mutation = self.overlay.insert_entity(
            StableOwnerAddressV1::Document {
                document_id: document_id.clone(),
            },
            measure_order,
            stable_anchor.clone(),
            StableEntityAddressV1::Measure {
                measure_id: measure_id.clone(),
            },
            EntityBundleV1::Measure(MeasureBundleV1 {
                definition,
                contents: bundle_contents.clone(),
            }),
        );
        require_changed(mutation)?;
        for (order, _) in &part_orders {
            require_changed(self.overlay.insert_ordered_child(
                order.clone(),
                stable_anchor.clone(),
                measure_id.clone(),
            ))?;
        }
        if needs_normalization {
            for (order, _) in &part_orders {
                self.overlay
                    .replace_ordered_children(order.clone(), desired_measures.clone())
                    .map_err(map_overlay_failure)?;
            }
        }

        for content in &bundle_contents {
            self.record_affected(StableEntityAddressV1::Part {
                part_id: content.part_id.clone(),
            })?;
            self.record_voice_descendants_affected(&content.voices)?;
        }
        self.add_prepared_effects(1 + u64::from(needs_normalization))
    }

    pub fn remove_measure(
        &mut self,
        measure_id: StableId,
    ) -> Result<(), KernelStage3CommandFailureLeafV1> {
        self.remove_measure_inner(measure_id, false)
    }

    fn remove_measure_inner(
        &mut self,
        measure_id: StableId,
        range_effect_accounting: bool,
    ) -> Result<(), KernelStage3CommandFailureLeafV1> {
        let address = StableEntityAddressV1::Measure {
            measure_id: measure_id.clone(),
        };
        let bundle = match self.overlay.read_entity(&address) {
            Some(EntityBundleV1::Measure(bundle)) => bundle,
            None => return Err(KernelStage3CommandFailureLeafV1::TargetNotFound),
            Some(_) => return Err(KernelStage3CommandFailureLeafV1::InternalError),
        };
        let document_id = match self.overlay.read_owner(&address) {
            Some(StableOwnerAddressV1::Document { document_id }) => document_id,
            _ => return Err(KernelStage3CommandFailureLeafV1::LocalInvariantRejected),
        };
        let measure_order = StableOrderAddressV1::Measures {
            document_id: document_id.clone(),
        };
        let current_measures = self
            .overlay
            .read_order(&measure_order)
            .ok_or(KernelStage3CommandFailureLeafV1::LocalInvariantRejected)?;
        if current_measures.len() <= 1
            && !range_effect_accounting
            && !self.allow_intermediate_empty_containers
        {
            return Err(KernelStage3CommandFailureLeafV1::LocalInvariantRejected);
        }
        let desired_measures = removed_order(&current_measures, &measure_id)
            .ok_or(KernelStage3CommandFailureLeafV1::LocalInvariantRejected)?;

        let part_ids = self
            .overlay
            .read_order(&StableOrderAddressV1::Parts {
                document_id: document_id.clone(),
            })
            .ok_or(KernelStage3CommandFailureLeafV1::LocalInvariantRejected)?;
        let mut contents_by_part = HashMap::with_capacity(bundle.contents.len());
        let mut duplicate_part = false;
        for content in &bundle.contents {
            duplicate_part |= contents_by_part
                .insert(content.part_id.clone(), content)
                .is_some();
        }
        if duplicate_part
            || contents_by_part.len() != part_ids.len()
            || part_ids
                .iter()
                .any(|part_id| !contents_by_part.contains_key(part_id))
        {
            return Err(KernelStage3CommandFailureLeafV1::LocalInvariantRejected);
        }

        let mut part_orders = Vec::with_capacity(part_ids.len());
        let mut needs_normalization = false;
        for part_id in &part_ids {
            let order = StableOrderAddressV1::MeasureContents {
                part_id: part_id.clone(),
            };
            let current = self
                .overlay
                .read_order(&order)
                .ok_or(KernelStage3CommandFailureLeafV1::LocalInvariantRejected)?;
            let predicted = removed_order(&current, &measure_id)
                .ok_or(KernelStage3CommandFailureLeafV1::LocalInvariantRejected)?;
            needs_normalization |= predicted != desired_measures;
            part_orders.push((order, current));
        }

        self.record_affected(address.clone())?;
        for part_id in &part_ids {
            let content = contents_by_part
                .get(part_id)
                .ok_or(KernelStage3CommandFailureLeafV1::LocalInvariantRejected)?;
            self.record_affected(StableEntityAddressV1::Part {
                part_id: part_id.clone(),
            })?;
            self.record_voice_descendants_affected(&content.voices)?;
        }
        for (order, _) in &part_orders {
            require_changed(
                self.overlay
                    .remove_ordered_child(order.clone(), measure_id.clone()),
            )?;
        }
        require_changed(self.overlay.remove_entity(
            StableOwnerAddressV1::Document { document_id },
            measure_order,
            address,
        ))?;
        if needs_normalization {
            for (order, _) in part_orders {
                self.overlay
                    .replace_ordered_children(order, desired_measures.clone())
                    .map_err(map_overlay_failure)?;
            }
        }
        self.add_prepared_effects(if range_effect_accounting {
            1
        } else {
            1 + u64::from(needs_normalization)
        })
    }

    pub fn move_measure(
        &mut self,
        measure_id: StableId,
        anchor: MeasureAnchorV1,
    ) -> Result<(), KernelStage3CommandFailureLeafV1> {
        let address = StableEntityAddressV1::Measure {
            measure_id: measure_id.clone(),
        };
        if !matches!(
            self.overlay.read_entity(&address),
            Some(EntityBundleV1::Measure(_))
        ) {
            return Err(KernelStage3CommandFailureLeafV1::TargetNotFound);
        }
        let document_id = match self.overlay.read_owner(&address) {
            Some(StableOwnerAddressV1::Document { document_id }) => document_id,
            _ => return Err(KernelStage3CommandFailureLeafV1::LocalInvariantRejected),
        };
        if matches!(&anchor, MeasureAnchorV1::AfterMeasure { measure_id: anchor_id } if anchor_id == &measure_id)
        {
            return Err(KernelStage3CommandFailureLeafV1::AnchorSelfReference);
        }
        let measure_order = StableOrderAddressV1::Measures {
            document_id: document_id.clone(),
        };
        let current_measures = self
            .overlay
            .read_order(&measure_order)
            .ok_or(KernelStage3CommandFailureLeafV1::LocalInvariantRejected)?;
        let stable_anchor = resolve_measure_anchor(&current_measures, anchor)?;
        let desired_measures = moved_order(&current_measures, &measure_id, &stable_anchor)
            .ok_or(KernelStage3CommandFailureLeafV1::LocalInvariantRejected)?;
        let part_ids = self
            .overlay
            .read_order(&StableOrderAddressV1::Parts {
                document_id: document_id.clone(),
            })
            .ok_or(KernelStage3CommandFailureLeafV1::LocalInvariantRejected)?;
        let mut part_orders = Vec::with_capacity(part_ids.len());
        let mut needs_normalization = false;
        for part_id in &part_ids {
            let order = StableOrderAddressV1::MeasureContents {
                part_id: part_id.clone(),
            };
            let current = self
                .overlay
                .read_order(&order)
                .ok_or(KernelStage3CommandFailureLeafV1::LocalInvariantRejected)?;
            let predicted = moved_order(&current, &measure_id, &stable_anchor)
                .ok_or(KernelStage3CommandFailureLeafV1::LocalInvariantRejected)?;
            needs_normalization |= predicted != desired_measures;
            part_orders.push(order);
        }
        if current_measures == desired_measures
            && part_orders.iter().all(|order| {
                self.overlay
                    .read_order(order)
                    .is_some_and(|value| value == desired_measures)
            })
        {
            return Ok(());
        }

        self.record_affected(address)?;
        for part_id in &part_ids {
            self.record_affected(StableEntityAddressV1::Part {
                part_id: part_id.clone(),
            })?;
        }
        self.overlay
            .move_ordered_child(measure_order, measure_id.clone(), stable_anchor.clone())
            .map_err(map_overlay_failure)?;
        for order in &part_orders {
            self.overlay
                .move_ordered_child(order.clone(), measure_id.clone(), stable_anchor.clone())
                .map_err(map_overlay_failure)?;
        }
        if needs_normalization {
            for order in part_orders {
                self.overlay
                    .replace_ordered_children(order, desired_measures.clone())
                    .map_err(map_overlay_failure)?;
            }
        }
        self.add_prepared_effects(1 + u64::from(needs_normalization))
    }

    pub fn set_measure_definition(
        &mut self,
        measure_id: StableId,
        meter: MeterV1,
        pickup: MeasurePickupV1,
    ) -> Result<(), KernelStage3CommandFailureLeafV1> {
        let pickup_duration = match pickup {
            MeasurePickupV1::None => None,
            MeasurePickupV1::Duration { duration } => Some(duration),
        };
        let mutation = self.overlay.replace_scalar(
            ScalarAddressV1::MeasureDefinition { measure_id },
            ScalarValueV1::MeasureDefinition {
                meter,
                pickup_duration,
            },
        );
        self.complete_single_effect(mutation)
    }

    pub fn insert_part(
        &mut self,
        document_id: StableId,
        anchor: PartAnchorV1,
        mut part: PartV1,
    ) -> Result<(), KernelStage3CommandFailureLeafV1> {
        let part_order = StableOrderAddressV1::Parts {
            document_id: document_id.clone(),
        };
        let Some(current_parts) = self.overlay.read_order(&part_order) else {
            return Err(KernelStage3CommandFailureLeafV1::TargetNotFound);
        };
        let stable_anchor = resolve_part_anchor(&current_parts, anchor)?;
        let measure_ids = self
            .overlay
            .read_order(&StableOrderAddressV1::Measures {
                document_id: document_id.clone(),
            })
            .ok_or(KernelStage3CommandFailureLeafV1::LocalInvariantRejected)?;

        let mut contents_by_measure = HashMap::with_capacity(part.measure_contents.len());
        let mut duplicate_measure = false;
        for content in part.measure_contents.drain(..) {
            duplicate_measure |= contents_by_measure
                .insert(content.measure_id.clone(), content)
                .is_some();
        }
        if duplicate_measure || contents_by_measure.len() != measure_ids.len() {
            return Err(KernelStage3CommandFailureLeafV1::LocalInvariantRejected);
        }
        let mut ordered_contents = Vec::with_capacity(measure_ids.len());
        for measure_id in &measure_ids {
            ordered_contents.push(
                contents_by_measure
                    .remove(measure_id)
                    .ok_or(KernelStage3CommandFailureLeafV1::LocalInvariantRejected)?,
            );
        }
        if !contents_by_measure.is_empty() || part.staves.is_empty() {
            return Err(KernelStage3CommandFailureLeafV1::LocalInvariantRejected);
        }
        part.measure_contents = ordered_contents;

        let staff_ids: HashSet<_> = part.staves.iter().map(|staff| staff.id.clone()).collect();
        for content in &part.measure_contents {
            if content.voices.is_empty() {
                return Err(KernelStage3CommandFailureLeafV1::LocalInvariantRejected);
            }
            for voice in &content.voices {
                validate_inserted_voice_references(voice, &staff_ids)?;
            }
        }

        self.record_affected(StableEntityAddressV1::Document {
            document_id: document_id.clone(),
        })?;
        self.record_affected(StableEntityAddressV1::Part {
            part_id: part.id.clone(),
        })?;
        for staff in &part.staves {
            self.record_affected(StableEntityAddressV1::Staff {
                staff_id: staff.id.clone(),
            })?;
        }
        for content in &part.measure_contents {
            self.record_voice_descendants_affected(&content.voices)?;
        }

        let part_id = part.id.clone();
        let mutation = self.overlay.insert_entity(
            StableOwnerAddressV1::Document { document_id },
            part_order,
            stable_anchor,
            StableEntityAddressV1::Part {
                part_id: part_id.clone(),
            },
            EntityBundleV1::Part(PartBundleV1 {
                part,
                extensions: Vec::new(),
            }),
        );
        self.complete_single_effect(mutation)
    }

    pub fn remove_part(
        &mut self,
        part_id: StableId,
    ) -> Result<(), KernelStage3CommandFailureLeafV1> {
        let address = StableEntityAddressV1::Part {
            part_id: part_id.clone(),
        };
        let bundle = match self.overlay.read_entity(&address) {
            Some(EntityBundleV1::Part(bundle)) => bundle,
            None => return Err(KernelStage3CommandFailureLeafV1::TargetNotFound),
            Some(_) => return Err(KernelStage3CommandFailureLeafV1::InternalError),
        };
        let document_id = match self.overlay.read_owner(&address) {
            Some(StableOwnerAddressV1::Document { document_id }) => document_id,
            _ => return Err(KernelStage3CommandFailureLeafV1::LocalInvariantRejected),
        };
        let part_order = StableOrderAddressV1::Parts {
            document_id: document_id.clone(),
        };
        let current_parts = self
            .overlay
            .read_order(&part_order)
            .ok_or(KernelStage3CommandFailureLeafV1::LocalInvariantRejected)?;
        if current_parts.len() <= 1 && !self.allow_intermediate_empty_containers {
            return Err(KernelStage3CommandFailureLeafV1::LocalInvariantRejected);
        }
        let measure_ids = self
            .overlay
            .read_order(&StableOrderAddressV1::Measures {
                document_id: document_id.clone(),
            })
            .ok_or(KernelStage3CommandFailureLeafV1::LocalInvariantRejected)?;
        let mut contents_by_measure = HashMap::with_capacity(bundle.part.measure_contents.len());
        let mut duplicate_measure = false;
        for content in &bundle.part.measure_contents {
            duplicate_measure |= contents_by_measure
                .insert(content.measure_id.clone(), content)
                .is_some();
        }
        if duplicate_measure
            || contents_by_measure.len() != measure_ids.len()
            || measure_ids
                .iter()
                .any(|measure_id| !contents_by_measure.contains_key(measure_id))
        {
            return Err(KernelStage3CommandFailureLeafV1::LocalInvariantRejected);
        }

        self.record_affected(address.clone())?;
        self.record_affected(StableEntityAddressV1::Document {
            document_id: document_id.clone(),
        })?;
        for staff in &bundle.part.staves {
            self.record_affected(StableEntityAddressV1::Staff {
                staff_id: staff.id.clone(),
            })?;
        }
        for measure_id in &measure_ids {
            let content = contents_by_measure
                .get(measure_id)
                .ok_or(KernelStage3CommandFailureLeafV1::LocalInvariantRejected)?;
            self.record_voice_descendants_affected(&content.voices)?;
        }

        let mutation = self.overlay.remove_entity(
            StableOwnerAddressV1::Document { document_id },
            part_order,
            address,
        );
        self.complete_single_effect(mutation)
    }

    pub fn move_part(
        &mut self,
        part_id: StableId,
        anchor: PartAnchorV1,
    ) -> Result<(), KernelStage3CommandFailureLeafV1> {
        let address = StableEntityAddressV1::Part {
            part_id: part_id.clone(),
        };
        if !matches!(
            self.overlay.read_entity(&address),
            Some(EntityBundleV1::Part(_))
        ) {
            return Err(KernelStage3CommandFailureLeafV1::TargetNotFound);
        }
        let document_id = match self.overlay.read_owner(&address) {
            Some(StableOwnerAddressV1::Document { document_id }) => document_id,
            _ => return Err(KernelStage3CommandFailureLeafV1::LocalInvariantRejected),
        };
        if matches!(&anchor, PartAnchorV1::AfterPart { part_id: anchor_id } if anchor_id == &part_id)
        {
            return Err(KernelStage3CommandFailureLeafV1::AnchorSelfReference);
        }
        let order = StableOrderAddressV1::Parts {
            document_id: document_id.clone(),
        };
        let current = self
            .overlay
            .read_order(&order)
            .ok_or(KernelStage3CommandFailureLeafV1::LocalInvariantRejected)?;
        let stable_anchor = resolve_part_anchor(&current, anchor)?;
        match self
            .overlay
            .move_ordered_child(order, part_id, stable_anchor)
            .map_err(map_overlay_failure)?
        {
            OverlayMutationV1::NoOp => Ok(()),
            OverlayMutationV1::Changed => {
                self.record_affected(address)?;
                self.record_affected(StableEntityAddressV1::Document { document_id })?;
                self.add_prepared_effects(1)
            }
        }
    }

    pub fn set_part_name(
        &mut self,
        part_id: StableId,
        name: String,
    ) -> Result<(), KernelStage3CommandFailureLeafV1> {
        let mutation = self.overlay.replace_scalar(
            ScalarAddressV1::PartName { part_id },
            ScalarValueV1::PartName(name),
        );
        self.complete_single_effect(mutation)
    }

    pub fn set_part_instrument(
        &mut self,
        part_id: StableId,
        instrument: InstrumentDescriptorV1,
    ) -> Result<(), KernelStage3CommandFailureLeafV1> {
        let mutation = self.overlay.replace_scalar(
            ScalarAddressV1::PartInstrument { part_id },
            ScalarValueV1::PartInstrument(instrument),
        );
        self.complete_single_effect(mutation)
    }

    pub fn insert_staff(
        &mut self,
        part_id: StableId,
        anchor: StaffAnchorV1,
        staff: StaffDefinitionV1,
    ) -> Result<(), KernelStage3CommandFailureLeafV1> {
        let part_address = StableEntityAddressV1::Part {
            part_id: part_id.clone(),
        };
        if !matches!(
            self.overlay.read_entity(&part_address),
            Some(EntityBundleV1::Part(_))
        ) {
            return Err(KernelStage3CommandFailureLeafV1::TargetNotFound);
        }
        let order = StableOrderAddressV1::Staffs {
            part_id: part_id.clone(),
        };
        let current = self
            .overlay
            .read_order(&order)
            .ok_or(KernelStage3CommandFailureLeafV1::LocalInvariantRejected)?;
        let stable_anchor = resolve_staff_anchor(&mut self.overlay, &current, anchor)?;
        let staff_id = staff.id.clone();

        self.record_affected(part_address)?;
        let mutation = self.overlay.insert_entity(
            StableOwnerAddressV1::Part { part_id },
            order,
            stable_anchor,
            StableEntityAddressV1::Staff {
                staff_id: staff_id.clone(),
            },
            EntityBundleV1::Staff(staff),
        );
        self.complete_single_effect(mutation)
    }

    pub fn remove_staff(
        &mut self,
        staff_id: StableId,
    ) -> Result<(), KernelStage3CommandFailureLeafV1> {
        let address = StableEntityAddressV1::Staff {
            staff_id: staff_id.clone(),
        };
        if !matches!(
            self.overlay.read_entity(&address),
            Some(EntityBundleV1::Staff(_))
        ) {
            return Err(KernelStage3CommandFailureLeafV1::TargetNotFound);
        }
        let part_id = match self.overlay.read_owner(&address) {
            Some(StableOwnerAddressV1::Part { part_id }) => part_id,
            _ => return Err(KernelStage3CommandFailureLeafV1::LocalInvariantRejected),
        };
        if !self.overlay.list_references_to(&staff_id).is_empty() {
            return Err(KernelStage3CommandFailureLeafV1::ReferenceConflict);
        }
        let order = StableOrderAddressV1::Staffs {
            part_id: part_id.clone(),
        };
        let current = self
            .overlay
            .read_order(&order)
            .ok_or(KernelStage3CommandFailureLeafV1::LocalInvariantRejected)?;
        if current.len() <= 1 && !self.allow_intermediate_empty_containers {
            return Err(KernelStage3CommandFailureLeafV1::LocalInvariantRejected);
        }

        self.record_affected(address.clone())?;
        self.record_affected(StableEntityAddressV1::Part {
            part_id: part_id.clone(),
        })?;
        let mutation =
            self.overlay
                .remove_entity(StableOwnerAddressV1::Part { part_id }, order, address);
        self.complete_single_effect(mutation)
    }

    pub fn move_staff(
        &mut self,
        staff_id: StableId,
        anchor: StaffAnchorV1,
    ) -> Result<(), KernelStage3CommandFailureLeafV1> {
        let address = StableEntityAddressV1::Staff {
            staff_id: staff_id.clone(),
        };
        if !matches!(
            self.overlay.read_entity(&address),
            Some(EntityBundleV1::Staff(_))
        ) {
            return Err(KernelStage3CommandFailureLeafV1::TargetNotFound);
        }
        let part_id = match self.overlay.read_owner(&address) {
            Some(StableOwnerAddressV1::Part { part_id }) => part_id,
            _ => return Err(KernelStage3CommandFailureLeafV1::LocalInvariantRejected),
        };
        if matches!(&anchor, StaffAnchorV1::AfterStaff { staff_id: anchor_id } if anchor_id == &staff_id)
        {
            return Err(KernelStage3CommandFailureLeafV1::AnchorSelfReference);
        }
        let order = StableOrderAddressV1::Staffs {
            part_id: part_id.clone(),
        };
        let current = self
            .overlay
            .read_order(&order)
            .ok_or(KernelStage3CommandFailureLeafV1::LocalInvariantRejected)?;
        let stable_anchor = resolve_staff_anchor(&mut self.overlay, &current, anchor)?;
        match self
            .overlay
            .move_ordered_child(order, staff_id, stable_anchor)
            .map_err(map_overlay_failure)?
        {
            OverlayMutationV1::NoOp => Ok(()),
            OverlayMutationV1::Changed => {
                self.record_affected(address)?;
                self.record_affected(StableEntityAddressV1::Part { part_id })?;
                self.add_prepared_effects(1)
            }
        }
    }

    pub fn set_staff_definition(
        &mut self,
        staff_id: StableId,
        line_count: SafeInteger,
        default_clef: ClefV1,
    ) -> Result<(), KernelStage3CommandFailureLeafV1> {
        let mutation = self.overlay.replace_scalar(
            ScalarAddressV1::StaffDefinition { staff_id },
            ScalarValueV1::StaffDefinition {
                line_count,
                default_clef,
            },
        );
        self.complete_single_effect(mutation)
    }

    pub fn insert_voice(
        &mut self,
        part_id: StableId,
        measure_id: StableId,
        anchor: VoiceAnchorV1,
        voice: VoiceV1,
    ) -> Result<(), KernelStage3CommandFailureLeafV1> {
        let part_address = StableEntityAddressV1::Part {
            part_id: part_id.clone(),
        };
        if !matches!(
            self.overlay.read_entity(&part_address),
            Some(EntityBundleV1::Part(_))
        ) {
            return Err(KernelStage3CommandFailureLeafV1::TargetNotFound);
        }
        if !matches!(
            self.overlay.read_entity(&StableEntityAddressV1::Measure {
                measure_id: measure_id.clone(),
            }),
            Some(EntityBundleV1::Measure(_))
        ) {
            return Err(KernelStage3CommandFailureLeafV1::TargetNotFound);
        }
        let order = StableOrderAddressV1::Voices {
            part_id: part_id.clone(),
            measure_id: measure_id.clone(),
        };
        let current = self
            .overlay
            .read_order(&order)
            .ok_or(KernelStage3CommandFailureLeafV1::LocalInvariantRejected)?;
        let stable_anchor = resolve_voice_anchor(&mut self.overlay, &current, anchor)?;
        if !self.staff_belongs_to_part(&voice.default_staff_id, &part_id) {
            return Err(KernelStage3CommandFailureLeafV1::ReferenceConflict);
        }
        for event in &voice.sequence.events {
            if matches!(&event.content, RhythmicContentV1::Notes { notes } if notes.is_empty()) {
                return Err(KernelStage3CommandFailureLeafV1::LocalInvariantRejected);
            }
            if let Some(staff_id) = &event.staff_id
                && !self.staff_belongs_to_part(staff_id, &part_id)
            {
                return Err(KernelStage3CommandFailureLeafV1::ReferenceConflict);
            }
        }

        self.record_affected(part_address)?;
        let voice_id = voice.id.clone();
        let mutation = self.overlay.insert_entity(
            StableOwnerAddressV1::PartMeasure {
                part_id,
                measure_id,
            },
            order,
            stable_anchor,
            StableEntityAddressV1::Voice {
                voice_id: voice_id.clone(),
            },
            EntityBundleV1::Voice(voice.clone()),
        );
        require_changed(mutation)?;
        self.record_voice_descendants_affected(std::slice::from_ref(&voice))?;
        self.add_prepared_effects(1)
    }

    pub fn remove_voice(
        &mut self,
        voice_id: StableId,
    ) -> Result<(), KernelStage3CommandFailureLeafV1> {
        let address = StableEntityAddressV1::Voice {
            voice_id: voice_id.clone(),
        };
        let voice = match self.overlay.read_entity(&address) {
            Some(EntityBundleV1::Voice(voice)) => voice,
            None => return Err(KernelStage3CommandFailureLeafV1::TargetNotFound),
            Some(_) => return Err(KernelStage3CommandFailureLeafV1::InternalError),
        };
        let (part_id, measure_id) = match self.overlay.read_owner(&address) {
            Some(StableOwnerAddressV1::PartMeasure {
                part_id,
                measure_id,
            }) => (part_id, measure_id),
            _ => return Err(KernelStage3CommandFailureLeafV1::LocalInvariantRejected),
        };
        let order = StableOrderAddressV1::Voices {
            part_id: part_id.clone(),
            measure_id: measure_id.clone(),
        };
        let current = self
            .overlay
            .read_order(&order)
            .ok_or(KernelStage3CommandFailureLeafV1::LocalInvariantRejected)?;
        if current.len() <= 1 && !self.allow_intermediate_empty_containers {
            return Err(KernelStage3CommandFailureLeafV1::LocalInvariantRejected);
        }

        self.record_affected(address.clone())?;
        self.record_affected(StableEntityAddressV1::Part {
            part_id: part_id.clone(),
        })?;
        for event in &voice.sequence.events {
            self.record_affected(StableEntityAddressV1::Event {
                event_id: event.id.clone(),
            })?;
            if let RhythmicContentV1::Notes { notes } = &event.content {
                for note in notes {
                    self.record_affected(StableEntityAddressV1::Note {
                        note_id: note.id.clone(),
                    })?;
                }
            }
        }
        let mutation = self.overlay.remove_entity(
            StableOwnerAddressV1::PartMeasure {
                part_id,
                measure_id,
            },
            order,
            address,
        );
        self.complete_single_effect(mutation)
    }

    pub fn move_voice(
        &mut self,
        voice_id: StableId,
        anchor: VoiceAnchorV1,
    ) -> Result<(), KernelStage3CommandFailureLeafV1> {
        let address = StableEntityAddressV1::Voice {
            voice_id: voice_id.clone(),
        };
        if !matches!(
            self.overlay.read_entity(&address),
            Some(EntityBundleV1::Voice(_))
        ) {
            return Err(KernelStage3CommandFailureLeafV1::TargetNotFound);
        }
        let (part_id, measure_id) = match self.overlay.read_owner(&address) {
            Some(StableOwnerAddressV1::PartMeasure {
                part_id,
                measure_id,
            }) => (part_id, measure_id),
            _ => return Err(KernelStage3CommandFailureLeafV1::LocalInvariantRejected),
        };
        if matches!(&anchor, VoiceAnchorV1::AfterVoice { voice_id: anchor_id } if anchor_id == &voice_id)
        {
            return Err(KernelStage3CommandFailureLeafV1::AnchorSelfReference);
        }
        let order = StableOrderAddressV1::Voices {
            part_id: part_id.clone(),
            measure_id,
        };
        let current = self
            .overlay
            .read_order(&order)
            .ok_or(KernelStage3CommandFailureLeafV1::LocalInvariantRejected)?;
        let stable_anchor = resolve_voice_anchor(&mut self.overlay, &current, anchor)?;
        match self
            .overlay
            .move_ordered_child(order, voice_id, stable_anchor)
            .map_err(map_overlay_failure)?
        {
            OverlayMutationV1::NoOp => Ok(()),
            OverlayMutationV1::Changed => {
                self.record_affected(address)?;
                self.record_affected(StableEntityAddressV1::Part { part_id })?;
                self.add_prepared_effects(1)
            }
        }
    }

    pub fn set_voice_default_staff(
        &mut self,
        voice_id: StableId,
        staff_id: StableId,
    ) -> Result<(), KernelStage3CommandFailureLeafV1> {
        let voice_address = StableEntityAddressV1::Voice {
            voice_id: voice_id.clone(),
        };
        if !matches!(
            self.overlay.read_entity(&voice_address),
            Some(EntityBundleV1::Voice(_))
        ) {
            return Err(KernelStage3CommandFailureLeafV1::TargetNotFound);
        }
        let part_id = match self.overlay.read_owner(&voice_address) {
            Some(StableOwnerAddressV1::PartMeasure { part_id, .. }) => part_id,
            _ => return Err(KernelStage3CommandFailureLeafV1::LocalInvariantRejected),
        };
        if !self.staff_belongs_to_part(&staff_id, &part_id) {
            return Err(KernelStage3CommandFailureLeafV1::ReferenceConflict);
        }
        let mutation = self.overlay.update_reference(
            ReferenceAddressV1::VoiceDefaultStaff { voice_id },
            ReferenceValueV1::StableId(staff_id),
        );
        match mutation.map_err(map_overlay_failure)? {
            OverlayMutationV1::NoOp => Ok(()),
            OverlayMutationV1::Changed => {
                self.record_affected(voice_address)?;
                self.add_prepared_effects(1)
            }
        }
    }

    pub fn set_voice_sequence_start(
        &mut self,
        voice_id: StableId,
        start: FractionV1,
    ) -> Result<(), KernelStage3CommandFailureLeafV1> {
        let mutation = self.overlay.replace_scalar(
            ScalarAddressV1::VoiceSequenceStart { voice_id },
            ScalarValueV1::VoiceSequenceStart(start),
        );
        self.complete_single_effect(mutation)
    }

    pub fn set_event_staff_assignment(
        &mut self,
        event_id: StableId,
        assignment: EventStaffAssignmentV1,
    ) -> Result<(), KernelStage3CommandFailureLeafV1> {
        let event_address = StableEntityAddressV1::Event {
            event_id: event_id.clone(),
        };
        if !matches!(
            self.overlay.read_entity(&event_address),
            Some(EntityBundleV1::Event(_))
        ) {
            return Err(KernelStage3CommandFailureLeafV1::TargetNotFound);
        }
        let voice_id = match self.overlay.read_owner(&event_address) {
            Some(StableOwnerAddressV1::Voice { voice_id }) => voice_id,
            _ => return Err(KernelStage3CommandFailureLeafV1::LocalInvariantRejected),
        };
        let part_id = match self.overlay.read_owner(&StableEntityAddressV1::Voice {
            voice_id: voice_id.clone(),
        }) {
            Some(StableOwnerAddressV1::PartMeasure { part_id, .. }) => part_id,
            _ => return Err(KernelStage3CommandFailureLeafV1::LocalInvariantRejected),
        };
        let requested = match assignment {
            EventStaffAssignmentV1::InheritDefault => None,
            EventStaffAssignmentV1::Staff { staff_id } => {
                if !self.staff_belongs_to_part(&staff_id, &part_id) {
                    return Err(KernelStage3CommandFailureLeafV1::ReferenceConflict);
                }
                Some(staff_id)
            }
        };
        let current = match self
            .overlay
            .read_reference(&ReferenceAddressV1::EventStaffAssignment {
                event_id: event_id.clone(),
            }) {
            Some(ReferenceValueV1::OptionalStableId(value)) => value,
            _ => return Err(KernelStage3CommandFailureLeafV1::LocalInvariantRejected),
        };
        let default_staff =
            match self
                .overlay
                .read_reference(&ReferenceAddressV1::VoiceDefaultStaff {
                    voice_id: voice_id.clone(),
                }) {
                Some(ReferenceValueV1::StableId(value)) => value,
                _ => return Err(KernelStage3CommandFailureLeafV1::LocalInvariantRejected),
            };
        if current.as_ref().unwrap_or(&default_staff)
            == requested.as_ref().unwrap_or(&default_staff)
        {
            return Ok(());
        }

        let mutation = self.overlay.update_reference(
            ReferenceAddressV1::EventStaffAssignment { event_id },
            ReferenceValueV1::OptionalStableId(requested),
        );
        require_changed(mutation)?;
        self.record_affected(event_address)?;
        self.add_prepared_effects(1)
    }

    pub fn delete_range(
        &mut self,
        document_id: StableId,
        range: ScoreRangeV1,
    ) -> Result<(), KernelStage3CommandFailureLeafV1> {
        self.validate_document_target(&document_id)?;
        let selection = self.resolve_range(document_id, range)?;
        let event_ids = self.selected_event_ids(&selection)?;
        match selection {
            ResolvedRangeV1::Measures { measure_ids, .. } => {
                for measure_id in measure_ids {
                    self.remove_measure_inner(measure_id, true)?;
                }
            }
            ResolvedRangeV1::PartMeasures { .. } | ResolvedRangeV1::VoiceEvents { .. } => {
                for event_id in event_ids {
                    self.remove_event(event_id)?;
                }
            }
        }
        Ok(())
    }

    pub fn transpose_range_written_pitch(
        &mut self,
        document_id: StableId,
        range: ScoreRangeV1,
        transposition: TranspositionV1,
    ) -> Result<(), KernelStage3CommandFailureLeafV1> {
        self.validate_document_target(&document_id)?;
        let selection = self.resolve_range(document_id, range)?;
        let event_ids = self.selected_event_ids(&selection)?;
        if transposition.diatonic_steps.get() == 0 && transposition.chromatic_semitones.get() == 0 {
            return Ok(());
        }

        for note_id in self.selected_note_ids(&event_ids)? {
            let address = ScalarAddressV1::NoteWrittenPitch {
                note_id: note_id.clone(),
            };
            let Some(ScalarValueV1::NoteWrittenPitch(current)) = self.overlay.read_scalar(&address)
            else {
                return Err(KernelStage3CommandFailureLeafV1::InvalidRange);
            };
            let transformed =
                transpose_written_pitch_v1(&current, &transposition).map_err(|reason| {
                    KernelStage3CommandFailureLeafV1::RangeTransformInvalid {
                        address: NoteAddressV1::Note {
                            note_id: note_id.clone(),
                        },
                        reason,
                    }
                })?;
            if transformed != current {
                self.set_note_written_pitch(note_id, transformed)?;
            }
        }
        Ok(())
    }

    pub fn insert_notes_event(
        &mut self,
        voice_id: StableId,
        anchor: SequenceAnchorV1,
        event: RhythmicEventV1,
    ) -> Result<(), KernelStage3CommandFailureLeafV1> {
        self.insert_event(voice_id, anchor, event, InsertedEventContentV1::Notes)
    }

    pub fn insert_rest_event(
        &mut self,
        voice_id: StableId,
        anchor: SequenceAnchorV1,
        event: RhythmicEventV1,
    ) -> Result<(), KernelStage3CommandFailureLeafV1> {
        self.insert_event(voice_id, anchor, event, InsertedEventContentV1::Rest)
    }

    pub fn remove_event(
        &mut self,
        event_id: StableId,
    ) -> Result<(), KernelStage3CommandFailureLeafV1> {
        let address = StableEntityAddressV1::Event {
            event_id: event_id.clone(),
        };
        let event = match self.overlay.read_entity(&address) {
            Some(EntityBundleV1::Event(event)) => event,
            None => return Err(KernelStage3CommandFailureLeafV1::TargetNotFound),
            Some(_) => return Err(KernelStage3CommandFailureLeafV1::InternalError),
        };
        let voice_id = match self.overlay.read_owner(&address) {
            Some(StableOwnerAddressV1::Voice { voice_id }) => voice_id,
            _ => return Err(KernelStage3CommandFailureLeafV1::LocalInvariantRejected),
        };

        self.record_affected(address.clone())?;
        self.record_affected(StableEntityAddressV1::Voice {
            voice_id: voice_id.clone(),
        })?;
        if let RhythmicContentV1::Notes { notes } = &event.content {
            for note in notes {
                self.record_affected(StableEntityAddressV1::Note {
                    note_id: note.id.clone(),
                })?;
            }
        }

        let mutation = self.overlay.remove_entity(
            StableOwnerAddressV1::Voice {
                voice_id: voice_id.clone(),
            },
            StableOrderAddressV1::Events { voice_id },
            address,
        );
        self.complete_single_effect(mutation)
    }

    fn insert_event(
        &mut self,
        voice_id: StableId,
        anchor: SequenceAnchorV1,
        event: RhythmicEventV1,
        expected_content: InsertedEventContentV1,
    ) -> Result<(), KernelStage3CommandFailureLeafV1> {
        let voice_address = StableEntityAddressV1::Voice {
            voice_id: voice_id.clone(),
        };
        if !matches!(
            self.overlay.read_entity(&voice_address),
            Some(EntityBundleV1::Voice(_))
        ) {
            return Err(KernelStage3CommandFailureLeafV1::TargetNotFound);
        }
        let voice_part_id = match self.overlay.read_owner(&voice_address) {
            Some(StableOwnerAddressV1::PartMeasure { part_id, .. }) => part_id,
            _ => return Err(KernelStage3CommandFailureLeafV1::LocalInvariantRejected),
        };
        let order = StableOrderAddressV1::Events {
            voice_id: voice_id.clone(),
        };
        let stable_anchor = match anchor {
            SequenceAnchorV1::Start => StableAnchorV1::Start,
            SequenceAnchorV1::AfterEvent { event_id } => {
                let Some(events) = self.overlay.read_order(&order) else {
                    return Err(KernelStage3CommandFailureLeafV1::LocalInvariantRejected);
                };
                if !events.contains(&event_id) {
                    let anchor_address = StableEntityAddressV1::Event {
                        event_id: event_id.clone(),
                    };
                    return if matches!(
                        self.overlay.read_entity(&anchor_address),
                        Some(EntityBundleV1::Event(_))
                    ) {
                        Err(KernelStage3CommandFailureLeafV1::AnchorWrongOwner)
                    } else {
                        Err(KernelStage3CommandFailureLeafV1::AnchorNotFound)
                    };
                }
                StableAnchorV1::After {
                    sibling_id: event_id,
                }
            }
        };
        let content_matches = match expected_content {
            InsertedEventContentV1::Notes => {
                matches!(&event.content, RhythmicContentV1::Notes { notes } if !notes.is_empty())
            }
            InsertedEventContentV1::Rest => matches!(&event.content, RhythmicContentV1::Rest),
        };
        if !content_matches {
            return Err(KernelStage3CommandFailureLeafV1::LocalInvariantRejected);
        }
        if let Some(staff_id) = &event.staff_id {
            let staff_address = StableEntityAddressV1::Staff {
                staff_id: staff_id.clone(),
            };
            let same_part = matches!(
                (
                    self.overlay.read_entity(&staff_address),
                    self.overlay.read_owner(&staff_address),
                ),
                (
                    Some(EntityBundleV1::Staff(_)),
                    Some(StableOwnerAddressV1::Part { part_id })
                ) if part_id == voice_part_id
            );
            if !same_part {
                return Err(KernelStage3CommandFailureLeafV1::ReferenceConflict);
            }
        }
        let event_address = StableEntityAddressV1::Event {
            event_id: event.id.clone(),
        };
        let note_ids = match &event.content {
            RhythmicContentV1::Notes { notes } => {
                notes.iter().map(|note| note.id.clone()).collect::<Vec<_>>()
            }
            RhythmicContentV1::Rest => Vec::new(),
        };

        self.record_affected(voice_address)?;
        let mutation = self.overlay.insert_entity(
            StableOwnerAddressV1::Voice { voice_id },
            order,
            stable_anchor,
            event_address,
            EntityBundleV1::Event(event),
        );
        match mutation.map_err(map_overlay_failure)? {
            OverlayMutationV1::NoOp => Ok(()),
            OverlayMutationV1::Changed => {
                for note_id in note_ids {
                    self.record_affected(StableEntityAddressV1::Note { note_id })?;
                }
                self.overlay
                    .add_prepared_effects(1)
                    .map_err(map_overlay_failure)
            }
        }
    }

    fn validate_document_target(
        &mut self,
        document_id: &StableId,
    ) -> Result<(), KernelStage3CommandFailureLeafV1> {
        let address = StableEntityAddressV1::Document {
            document_id: document_id.clone(),
        };
        if self.overlay.resolve_entity_address(document_id).as_ref() == Some(&address) {
            Ok(())
        } else {
            Err(KernelStage3CommandFailureLeafV1::TargetNotFound)
        }
    }

    fn resolve_range(
        &mut self,
        document_id: StableId,
        range: ScoreRangeV1,
    ) -> Result<ResolvedRangeV1, KernelStage3CommandFailureLeafV1> {
        match range {
            ScoreRangeV1::MeasureRange { start, end } => {
                let measure_order = self
                    .overlay
                    .read_order(&StableOrderAddressV1::Measures {
                        document_id: document_id.clone(),
                    })
                    .ok_or(KernelStage3CommandFailureLeafV1::InvalidRange)?;
                let (start_index, end_index) = resolve_range_endpoints(
                    self.resolve_measure_endpoint(&document_id, &measure_order, &start.measure_id),
                    self.resolve_measure_endpoint(&document_id, &measure_order, &end.measure_id),
                )?;
                Ok(ResolvedRangeV1::Measures {
                    document_id,
                    measure_ids: inclusive_ids(&measure_order, start_index, end_index)?,
                })
            }
            ScoreRangeV1::PartMeasureRange { start, end } => {
                let measure_order = self
                    .overlay
                    .read_order(&StableOrderAddressV1::Measures {
                        document_id: document_id.clone(),
                    })
                    .ok_or(KernelStage3CommandFailureLeafV1::InvalidRange)?;
                let (start_index, end_index) = resolve_range_endpoints(
                    self.resolve_part_measure_endpoint(
                        &document_id,
                        &measure_order,
                        &start.part_id,
                        &start.measure_id,
                    ),
                    self.resolve_part_measure_endpoint(
                        &document_id,
                        &measure_order,
                        &end.part_id,
                        &end.measure_id,
                    ),
                )?;
                if start.part_id != end.part_id {
                    return Err(KernelStage3CommandFailureLeafV1::RangeOwnerMismatch);
                }
                Ok(ResolvedRangeV1::PartMeasures {
                    part_id: start.part_id,
                    measure_ids: inclusive_ids(&measure_order, start_index, end_index)?,
                })
            }
            ScoreRangeV1::VoiceEventRange { start, end } => {
                let (start_endpoint, end_endpoint) = resolve_range_endpoints(
                    self.resolve_voice_event_endpoint(&start.voice_id, &start.event_id),
                    self.resolve_voice_event_endpoint(&end.voice_id, &end.event_id),
                )?;
                if start.voice_id != end.voice_id {
                    return Err(KernelStage3CommandFailureLeafV1::RangeOwnerMismatch);
                }
                let event_order = self
                    .overlay
                    .read_order(&StableOrderAddressV1::Events {
                        voice_id: start.voice_id.clone(),
                    })
                    .ok_or(KernelStage3CommandFailureLeafV1::InvalidRange)?;
                Ok(ResolvedRangeV1::VoiceEvents {
                    voice_id: start.voice_id,
                    event_ids: inclusive_ids(
                        &event_order,
                        start_endpoint.event_index,
                        end_endpoint.event_index,
                    )?,
                })
            }
        }
    }

    fn resolve_measure_endpoint(
        &mut self,
        document_id: &StableId,
        measure_order: &[StableId],
        measure_id: &StableId,
    ) -> RangeEndpointV1<usize> {
        let address = StableEntityAddressV1::Measure {
            measure_id: measure_id.clone(),
        };
        if !self.entity_matches(&address) {
            return RangeEndpointV1::Missing;
        }
        if self.overlay.read_owner(&address)
            != Some(StableOwnerAddressV1::Document {
                document_id: document_id.clone(),
            })
        {
            return RangeEndpointV1::Invalid;
        }
        match unique_position(measure_order, measure_id) {
            Ok(Some(index)) => RangeEndpointV1::Found(index),
            Ok(None) => RangeEndpointV1::Missing,
            Err(()) => RangeEndpointV1::Invalid,
        }
    }

    fn resolve_part_measure_endpoint(
        &mut self,
        document_id: &StableId,
        measure_order: &[StableId],
        part_id: &StableId,
        measure_id: &StableId,
    ) -> RangeEndpointV1<usize> {
        let part_address = StableEntityAddressV1::Part {
            part_id: part_id.clone(),
        };
        if !self.entity_matches(&part_address) {
            return RangeEndpointV1::Missing;
        }
        if self.overlay.read_owner(&part_address)
            != Some(StableOwnerAddressV1::Document {
                document_id: document_id.clone(),
            })
        {
            return RangeEndpointV1::Invalid;
        }
        let Some(part_order) = self.overlay.read_order(&StableOrderAddressV1::Parts {
            document_id: document_id.clone(),
        }) else {
            return RangeEndpointV1::Invalid;
        };
        match unique_position(&part_order, part_id) {
            Ok(Some(_)) => {}
            Ok(None) => return RangeEndpointV1::Missing,
            Err(()) => return RangeEndpointV1::Invalid,
        }
        let measure_index =
            match self.resolve_measure_endpoint(document_id, measure_order, measure_id) {
                RangeEndpointV1::Found(index) => index,
                RangeEndpointV1::Missing => return RangeEndpointV1::Missing,
                RangeEndpointV1::OwnerMismatch => return RangeEndpointV1::OwnerMismatch,
                RangeEndpointV1::Invalid => return RangeEndpointV1::Invalid,
            };
        let Some(content_order) = self
            .overlay
            .read_order(&StableOrderAddressV1::MeasureContents {
                part_id: part_id.clone(),
            })
        else {
            return RangeEndpointV1::Missing;
        };
        match unique_position(&content_order, measure_id) {
            Ok(Some(_)) => RangeEndpointV1::Found(measure_index),
            Ok(None) => RangeEndpointV1::Missing,
            Err(()) => RangeEndpointV1::Invalid,
        }
    }

    fn resolve_voice_event_endpoint(
        &mut self,
        voice_id: &StableId,
        event_id: &StableId,
    ) -> RangeEndpointV1<VoiceEventEndpointV1> {
        let voice_address = StableEntityAddressV1::Voice {
            voice_id: voice_id.clone(),
        };
        let event_address = StableEntityAddressV1::Event {
            event_id: event_id.clone(),
        };
        if !self.entity_matches(&voice_address) || !self.entity_matches(&event_address) {
            return RangeEndpointV1::Missing;
        }
        if !matches!(
            self.overlay.read_owner(&voice_address),
            Some(StableOwnerAddressV1::PartMeasure { .. })
        ) {
            return RangeEndpointV1::Invalid;
        }
        match self.overlay.read_owner(&event_address) {
            Some(StableOwnerAddressV1::Voice {
                voice_id: owner_voice_id,
            }) if &owner_voice_id == voice_id => {}
            Some(StableOwnerAddressV1::Voice { .. }) => {
                return RangeEndpointV1::OwnerMismatch;
            }
            _ => return RangeEndpointV1::Invalid,
        }
        let Some(event_order) = self.overlay.read_order(&StableOrderAddressV1::Events {
            voice_id: voice_id.clone(),
        }) else {
            return RangeEndpointV1::Invalid;
        };
        match unique_position(&event_order, event_id) {
            Ok(Some(event_index)) => RangeEndpointV1::Found(VoiceEventEndpointV1 { event_index }),
            Ok(None) => RangeEndpointV1::Missing,
            Err(()) => RangeEndpointV1::Invalid,
        }
    }

    fn selected_event_ids(
        &mut self,
        selection: &ResolvedRangeV1,
    ) -> Result<Vec<StableId>, KernelStage3CommandFailureLeafV1> {
        match selection {
            ResolvedRangeV1::Measures {
                document_id,
                measure_ids,
            } => {
                let part_ids = self
                    .overlay
                    .read_order(&StableOrderAddressV1::Parts {
                        document_id: document_id.clone(),
                    })
                    .ok_or(KernelStage3CommandFailureLeafV1::InvalidRange)?;
                let mut event_ids = Vec::new();
                for measure_id in measure_ids {
                    for part_id in &part_ids {
                        self.append_part_measure_event_ids(
                            part_id,
                            measure_id,
                            false,
                            &mut event_ids,
                        )?;
                    }
                }
                Ok(event_ids)
            }
            ResolvedRangeV1::PartMeasures {
                part_id,
                measure_ids,
            } => {
                let mut event_ids = Vec::new();
                for measure_id in measure_ids {
                    self.append_part_measure_event_ids(part_id, measure_id, true, &mut event_ids)?;
                }
                Ok(event_ids)
            }
            ResolvedRangeV1::VoiceEvents {
                voice_id,
                event_ids,
            } => {
                for event_id in event_ids {
                    let address = StableEntityAddressV1::Event {
                        event_id: event_id.clone(),
                    };
                    if !self.entity_matches(&address)
                        || self.overlay.read_owner(&address)
                            != Some(StableOwnerAddressV1::Voice {
                                voice_id: voice_id.clone(),
                            })
                    {
                        return Err(KernelStage3CommandFailureLeafV1::InvalidRange);
                    }
                }
                Ok(event_ids.clone())
            }
        }
    }

    fn append_part_measure_event_ids(
        &mut self,
        part_id: &StableId,
        measure_id: &StableId,
        missing_content_is_endpoint: bool,
        event_ids: &mut Vec<StableId>,
    ) -> Result<(), KernelStage3CommandFailureLeafV1> {
        let Some(voice_ids) = self.overlay.read_order(&StableOrderAddressV1::Voices {
            part_id: part_id.clone(),
            measure_id: measure_id.clone(),
        }) else {
            return Err(if missing_content_is_endpoint {
                KernelStage3CommandFailureLeafV1::RangeEndpointNotFound
            } else {
                KernelStage3CommandFailureLeafV1::InvalidRange
            });
        };
        for voice_id in voice_ids {
            let voice_address = StableEntityAddressV1::Voice {
                voice_id: voice_id.clone(),
            };
            if !self.entity_matches(&voice_address)
                || self.overlay.read_owner(&voice_address)
                    != Some(StableOwnerAddressV1::PartMeasure {
                        part_id: part_id.clone(),
                        measure_id: measure_id.clone(),
                    })
            {
                return Err(KernelStage3CommandFailureLeafV1::InvalidRange);
            }
            let Some(voice_events) = self.overlay.read_order(&StableOrderAddressV1::Events {
                voice_id: voice_id.clone(),
            }) else {
                return Err(KernelStage3CommandFailureLeafV1::InvalidRange);
            };
            for event_id in voice_events {
                let event_address = StableEntityAddressV1::Event {
                    event_id: event_id.clone(),
                };
                if !self.entity_matches(&event_address)
                    || self.overlay.read_owner(&event_address)
                        != Some(StableOwnerAddressV1::Voice {
                            voice_id: voice_id.clone(),
                        })
                {
                    return Err(KernelStage3CommandFailureLeafV1::InvalidRange);
                }
                event_ids.push(event_id);
            }
        }
        Ok(())
    }

    fn selected_note_ids(
        &mut self,
        event_ids: &[StableId],
    ) -> Result<Vec<StableId>, KernelStage3CommandFailureLeafV1> {
        let mut note_ids = Vec::new();
        for event_id in event_ids {
            let Some(event_notes) = self.overlay.read_order(&StableOrderAddressV1::Notes {
                event_id: event_id.clone(),
            }) else {
                return Err(KernelStage3CommandFailureLeafV1::InvalidRange);
            };
            for note_id in event_notes {
                let note_address = StableEntityAddressV1::Note {
                    note_id: note_id.clone(),
                };
                if !self.entity_matches(&note_address)
                    || self.overlay.read_owner(&note_address)
                        != Some(StableOwnerAddressV1::Event {
                            event_id: event_id.clone(),
                        })
                {
                    return Err(KernelStage3CommandFailureLeafV1::InvalidRange);
                }
                note_ids.push(note_id);
            }
        }
        Ok(note_ids)
    }

    fn entity_matches(&mut self, address: &StableEntityAddressV1) -> bool {
        self.overlay
            .resolve_entity_address(address.stable_id())
            .as_ref()
            == Some(address)
    }

    fn staff_belongs_to_part(&mut self, staff_id: &StableId, part_id: &StableId) -> bool {
        let address = StableEntityAddressV1::Staff {
            staff_id: staff_id.clone(),
        };
        matches!(
            (
                self.overlay.read_entity(&address),
                self.overlay.read_owner(&address),
            ),
            (
                Some(EntityBundleV1::Staff(_)),
                Some(StableOwnerAddressV1::Part {
                    part_id: staff_part_id,
                }),
            ) if &staff_part_id == part_id
        )
    }

    fn record_affected(
        &mut self,
        address: StableEntityAddressV1,
    ) -> Result<(), KernelStage3CommandFailureLeafV1> {
        self.overlay
            .record_affected(address)
            .map_err(map_overlay_failure)
    }

    fn record_voice_descendants_affected(
        &mut self,
        voices: &[VoiceV1],
    ) -> Result<(), KernelStage3CommandFailureLeafV1> {
        for voice in voices {
            self.record_affected(StableEntityAddressV1::Voice {
                voice_id: voice.id.clone(),
            })?;
            for event in &voice.sequence.events {
                self.record_affected(StableEntityAddressV1::Event {
                    event_id: event.id.clone(),
                })?;
                if let RhythmicContentV1::Notes { notes } = &event.content {
                    for note in notes {
                        self.record_affected(StableEntityAddressV1::Note {
                            note_id: note.id.clone(),
                        })?;
                    }
                }
            }
        }
        Ok(())
    }

    fn add_prepared_effects(&mut self, count: u64) -> Result<(), KernelStage3CommandFailureLeafV1> {
        self.overlay
            .add_prepared_effects(count)
            .map_err(map_overlay_failure)
    }

    fn complete_single_effect(
        &mut self,
        mutation: Result<OverlayMutationV1, OverlayFailureV1>,
    ) -> Result<(), KernelStage3CommandFailureLeafV1> {
        match mutation.map_err(map_overlay_failure)? {
            OverlayMutationV1::NoOp => Ok(()),
            OverlayMutationV1::Changed => self
                .overlay
                .add_prepared_effects(1)
                .map_err(map_overlay_failure),
        }
    }
}

fn resolve_range_endpoints<T>(
    start: RangeEndpointV1<T>,
    end: RangeEndpointV1<T>,
) -> Result<(T, T), KernelStage3CommandFailureLeafV1> {
    if matches!(&start, RangeEndpointV1::Invalid) || matches!(&end, RangeEndpointV1::Invalid) {
        return Err(KernelStage3CommandFailureLeafV1::InvalidRange);
    }
    if matches!(&start, RangeEndpointV1::Missing) || matches!(&end, RangeEndpointV1::Missing) {
        return Err(KernelStage3CommandFailureLeafV1::RangeEndpointNotFound);
    }
    if matches!(&start, RangeEndpointV1::OwnerMismatch)
        || matches!(&end, RangeEndpointV1::OwnerMismatch)
    {
        return Err(KernelStage3CommandFailureLeafV1::RangeOwnerMismatch);
    }
    match (start, end) {
        (RangeEndpointV1::Found(start), RangeEndpointV1::Found(end)) => Ok((start, end)),
        _ => Err(KernelStage3CommandFailureLeafV1::InvalidRange),
    }
}

fn unique_position(values: &[StableId], target: &StableId) -> Result<Option<usize>, ()> {
    let mut found = None;
    for (index, value) in values.iter().enumerate() {
        if value != target {
            continue;
        }
        if found.replace(index).is_some() {
            return Err(());
        }
    }
    Ok(found)
}

fn inclusive_ids(
    values: &[StableId],
    start: usize,
    end: usize,
) -> Result<Vec<StableId>, KernelStage3CommandFailureLeafV1> {
    let lower = start.min(end);
    let upper = start.max(end);
    values
        .get(lower..=upper)
        .map(<[StableId]>::to_vec)
        .ok_or(KernelStage3CommandFailureLeafV1::InvalidRange)
}

fn transpose_written_pitch_v1(
    pitch: &WrittenPitchV1,
    transposition: &TranspositionV1,
) -> Result<WrittenPitchV1, PitchTranspositionErrorV1> {
    let alter = pitch.alter.get();
    let octave = pitch.octave.get();
    if !(-2..=2).contains(&alter) || !(0..=8).contains(&octave) {
        return Err(PitchTranspositionErrorV1::WrittenPitchInvalid);
    }
    let diatonic_steps = transposition.diatonic_steps.get();
    let chromatic_semitones = transposition.chromatic_semitones.get();
    if !(-JS_SAFE_INTEGER_MAX..=JS_SAFE_INTEGER_MAX).contains(&diatonic_steps)
        || !(-JS_SAFE_INTEGER_MAX..=JS_SAFE_INTEGER_MAX).contains(&chromatic_semitones)
    {
        return Err(PitchTranspositionErrorV1::TranspositionComponentInvalid);
    }

    let (source_step_index, source_natural) = match pitch.step {
        PitchStepV1::C => (0_i64, 0_i64),
        PitchStepV1::D => (1, 2),
        PitchStepV1::E => (2, 4),
        PitchStepV1::F => (3, 5),
        PitchStepV1::G => (4, 7),
        PitchStepV1::A => (5, 9),
        PitchStepV1::B => (6, 11),
    };
    let target_diatonic = octave
        .checked_mul(7)
        .and_then(|value| value.checked_add(source_step_index))
        .and_then(|value| value.checked_add(diatonic_steps))
        .filter(|value| (-JS_SAFE_INTEGER_MAX..=JS_SAFE_INTEGER_MAX).contains(value))
        .ok_or(PitchTranspositionErrorV1::TranspositionComponentInvalid)?;
    let target_octave = target_diatonic.div_euclid(7);
    let target_step_index = target_diatonic.rem_euclid(7) as usize;
    if !(0..=8).contains(&target_octave) {
        return Err(PitchTranspositionErrorV1::DerivedPitchOctaveOutOfRange);
    }
    let target_natural = [0_i64, 2, 4, 5, 7, 9, 11]
        .get(target_step_index)
        .copied()
        .ok_or(PitchTranspositionErrorV1::WrittenPitchInvalid)?;
    let target_step = [
        PitchStepV1::C,
        PitchStepV1::D,
        PitchStepV1::E,
        PitchStepV1::F,
        PitchStepV1::G,
        PitchStepV1::A,
        PitchStepV1::B,
    ]
    .get(target_step_index)
    .copied()
    .ok_or(PitchTranspositionErrorV1::WrittenPitchInvalid)?;
    let source_chromatic = octave
        .checked_mul(12)
        .and_then(|value| value.checked_add(source_natural))
        .and_then(|value| value.checked_add(alter))
        .ok_or(PitchTranspositionErrorV1::TranspositionComponentInvalid)?;
    let target_chromatic = source_chromatic
        .checked_add(chromatic_semitones)
        .filter(|value| (-JS_SAFE_INTEGER_MAX..=JS_SAFE_INTEGER_MAX).contains(value))
        .ok_or(PitchTranspositionErrorV1::TranspositionComponentInvalid)?;
    let target_natural_chromatic = target_octave
        .checked_mul(12)
        .and_then(|value| value.checked_add(target_natural))
        .ok_or(PitchTranspositionErrorV1::TranspositionComponentInvalid)?;
    let target_alter = target_chromatic
        .checked_sub(target_natural_chromatic)
        .ok_or(PitchTranspositionErrorV1::TranspositionComponentInvalid)?;
    if !(-2..=2).contains(&target_alter) {
        return Err(PitchTranspositionErrorV1::DerivedPitchAlterOutOfRange);
    }

    Ok(WrittenPitchV1 {
        step: target_step,
        alter: SafeInteger::new(target_alter)
            .map_err(|_| PitchTranspositionErrorV1::TranspositionComponentInvalid)?,
        octave: SafeInteger::new(target_octave)
            .map_err(|_| PitchTranspositionErrorV1::DerivedPitchOctaveOutOfRange)?,
    })
}

fn require_changed(
    mutation: Result<OverlayMutationV1, OverlayFailureV1>,
) -> Result<(), KernelStage3CommandFailureLeafV1> {
    match mutation.map_err(map_overlay_failure)? {
        OverlayMutationV1::Changed => Ok(()),
        OverlayMutationV1::NoOp => Err(KernelStage3CommandFailureLeafV1::InternalError),
    }
}

fn resolve_measure_anchor(
    current: &[StableId],
    anchor: MeasureAnchorV1,
) -> Result<StableAnchorV1, KernelStage3CommandFailureLeafV1> {
    match anchor {
        MeasureAnchorV1::Start => Ok(StableAnchorV1::Start),
        MeasureAnchorV1::AfterMeasure { measure_id } => {
            if current.contains(&measure_id) {
                Ok(StableAnchorV1::After {
                    sibling_id: measure_id,
                })
            } else {
                Err(KernelStage3CommandFailureLeafV1::AnchorNotFound)
            }
        }
    }
}

fn resolve_part_anchor(
    current: &[StableId],
    anchor: PartAnchorV1,
) -> Result<StableAnchorV1, KernelStage3CommandFailureLeafV1> {
    match anchor {
        PartAnchorV1::Start => Ok(StableAnchorV1::Start),
        PartAnchorV1::AfterPart { part_id } if current.contains(&part_id) => {
            Ok(StableAnchorV1::After {
                sibling_id: part_id,
            })
        }
        PartAnchorV1::AfterPart { .. } => Err(KernelStage3CommandFailureLeafV1::AnchorNotFound),
    }
}

fn resolve_staff_anchor(
    overlay: &mut TransactionOverlayV1<'_>,
    current: &[StableId],
    anchor: StaffAnchorV1,
) -> Result<StableAnchorV1, KernelStage3CommandFailureLeafV1> {
    match anchor {
        StaffAnchorV1::Start => Ok(StableAnchorV1::Start),
        StaffAnchorV1::AfterStaff { staff_id } if current.contains(&staff_id) => {
            Ok(StableAnchorV1::After {
                sibling_id: staff_id,
            })
        }
        StaffAnchorV1::AfterStaff { staff_id } => {
            if matches!(
                overlay.read_entity(&StableEntityAddressV1::Staff {
                    staff_id: staff_id.clone(),
                }),
                Some(EntityBundleV1::Staff(_))
            ) {
                Err(KernelStage3CommandFailureLeafV1::AnchorWrongOwner)
            } else {
                Err(KernelStage3CommandFailureLeafV1::AnchorNotFound)
            }
        }
    }
}

fn resolve_voice_anchor(
    overlay: &mut TransactionOverlayV1<'_>,
    current: &[StableId],
    anchor: VoiceAnchorV1,
) -> Result<StableAnchorV1, KernelStage3CommandFailureLeafV1> {
    match anchor {
        VoiceAnchorV1::Start => Ok(StableAnchorV1::Start),
        VoiceAnchorV1::AfterVoice { voice_id } if current.contains(&voice_id) => {
            Ok(StableAnchorV1::After {
                sibling_id: voice_id,
            })
        }
        VoiceAnchorV1::AfterVoice { voice_id } => {
            if matches!(
                overlay.read_entity(&StableEntityAddressV1::Voice {
                    voice_id: voice_id.clone(),
                }),
                Some(EntityBundleV1::Voice(_))
            ) {
                Err(KernelStage3CommandFailureLeafV1::AnchorWrongOwner)
            } else {
                Err(KernelStage3CommandFailureLeafV1::AnchorNotFound)
            }
        }
    }
}

fn validate_inserted_voice_references(
    voice: &VoiceV1,
    staff_ids: &HashSet<StableId>,
) -> Result<(), KernelStage3CommandFailureLeafV1> {
    if !staff_ids.contains(&voice.default_staff_id) {
        return Err(KernelStage3CommandFailureLeafV1::ReferenceConflict);
    }
    for event in &voice.sequence.events {
        if matches!(&event.content, RhythmicContentV1::Notes { notes } if notes.is_empty()) {
            return Err(KernelStage3CommandFailureLeafV1::LocalInvariantRejected);
        }
        if let Some(staff_id) = &event.staff_id
            && !staff_ids.contains(staff_id)
        {
            return Err(KernelStage3CommandFailureLeafV1::ReferenceConflict);
        }
    }
    Ok(())
}

fn inserted_order(
    current: &[StableId],
    anchor: &StableAnchorV1,
    child_id: StableId,
) -> Option<Vec<StableId>> {
    let index = match anchor {
        StableAnchorV1::Start => 0,
        StableAnchorV1::After { sibling_id } => current
            .iter()
            .position(|id| id == sibling_id)?
            .checked_add(1)?,
    };
    let mut value = current.to_vec();
    value.insert(index, child_id);
    Some(value)
}

fn removed_order(current: &[StableId], child_id: &StableId) -> Option<Vec<StableId>> {
    let index = current.iter().position(|id| id == child_id)?;
    if current.iter().skip(index + 1).any(|id| id == child_id) {
        return None;
    }
    let mut value = current.to_vec();
    value.remove(index);
    Some(value)
}

fn moved_order(
    current: &[StableId],
    child_id: &StableId,
    anchor: &StableAnchorV1,
) -> Option<Vec<StableId>> {
    let mut value = removed_order(current, child_id)?;
    let index = match anchor {
        StableAnchorV1::Start => 0,
        StableAnchorV1::After { sibling_id } => value
            .iter()
            .position(|id| id == sibling_id)?
            .checked_add(1)?,
    };
    value.insert(index, child_id.clone());
    Some(value)
}

fn overlay_attempt_metrics(overlay: &TransactionOverlayV1<'_>) -> KernelStage3MetricsV1 {
    let work = overlay.metrics();
    KernelStage3MetricsV1 {
        full_document_scans: 0,
        full_document_clones: 0,
        full_semantic_validations: 0,
        full_snapshot_materializations: 0,
        entities_visited: work.base_slot_reads,
        entity_index_lookups: work.base_entity_lookups,
        owner_index_lookups: 0,
        time_index_comparisons: 0,
        overlay_records: work.overlay_record_writes,
        order_collections_copied: work.order_copies,
        change_ops: u64::try_from(overlay.operation_count()).unwrap_or(u64::MAX),
        changeset_logical_bytes: overlay.logical_bytes(),
        affected_addresses: 0,
        index_entries_removed: 0,
        index_entries_inserted: 0,
        ffi_request_bytes: 0,
        ffi_response_bytes: 0,
    }
}

fn map_overlay_failure(failure: OverlayFailureV1) -> KernelStage3CommandFailureLeafV1 {
    match failure {
        OverlayFailureV1::TargetNotFound { .. } => KernelStage3CommandFailureLeafV1::TargetNotFound,
        OverlayFailureV1::AnchorNotFound { .. } => KernelStage3CommandFailureLeafV1::AnchorNotFound,
        OverlayFailureV1::AnchorSelfReference { .. } => {
            KernelStage3CommandFailureLeafV1::AnchorSelfReference
        }
        OverlayFailureV1::DuplicateEntity { .. }
        | OverlayFailureV1::DuplicateOrderedChild { .. }
        | OverlayFailureV1::OrderMembershipMismatch { .. }
        | OverlayFailureV1::OwnerNotFound { .. }
        | OverlayFailureV1::OwnerMismatch { .. }
        | OverlayFailureV1::OrderNotFound { .. }
        | OverlayFailureV1::OrderedChildNotFound { .. } => {
            KernelStage3CommandFailureLeafV1::LocalInvariantRejected
        }
        OverlayFailureV1::ReferenceNotFound { .. }
        | OverlayFailureV1::ReferenceTypeMismatch { .. }
        | OverlayFailureV1::DuplicateExtension { .. }
        | OverlayFailureV1::ExtensionKeyMismatch { .. }
        | OverlayFailureV1::ExtensionNotFound { .. } => {
            KernelStage3CommandFailureLeafV1::ReferenceConflict
        }
        OverlayFailureV1::ChangeSet(failure) => map_change_set_build_failure(failure),
        OverlayFailureV1::TransactionPoisoned
        | OverlayFailureV1::EntityBundleAddressMismatch { .. }
        | OverlayFailureV1::OwnershipRouteMismatch { .. }
        | OverlayFailureV1::ScalarTypeMismatch { .. } => {
            KernelStage3CommandFailureLeafV1::InternalError
        }
    }
}

fn map_change_set_build_failure(
    failure: ChangeSetBuildFailureV1,
) -> KernelStage3CommandFailureLeafV1 {
    match failure {
        ChangeSetBuildFailureV1::LogicalBytesExceeded { limit, actual } => {
            KernelStage3CommandFailureLeafV1::ResourceLimitExceeded {
                limit_kind: KernelStage3ResourceLimitKindV1::ChangesetLogicalBytes,
                limit,
                actual,
            }
        }
        ChangeSetBuildFailureV1::PreparedEffectsExceeded { limit, actual } => {
            KernelStage3CommandFailureLeafV1::ResourceLimitExceeded {
                limit_kind: KernelStage3ResourceLimitKindV1::Effects,
                limit,
                actual,
            }
        }
        ChangeSetBuildFailureV1::AffectedAddressesExceeded { limit, actual } => {
            KernelStage3CommandFailureLeafV1::ResourceLimitExceeded {
                limit_kind: KernelStage3ResourceLimitKindV1::AffectedAddresses,
                limit,
                actual,
            }
        }
        ChangeSetBuildFailureV1::ArenaIndexOverflow => {
            KernelStage3CommandFailureLeafV1::InternalError
        }
    }
}

fn map_prepare_failure(failure: TransactionPrepareFailureV1) -> KernelStage3CommandFailureLeafV1 {
    match failure {
        TransactionPrepareFailureV1::VersionOverflow => {
            KernelStage3CommandFailureLeafV1::VersionOverflow
        }
        TransactionPrepareFailureV1::LocalInvariant => {
            KernelStage3CommandFailureLeafV1::LocalInvariantRejected
        }
        TransactionPrepareFailureV1::Capacity
        | TransactionPrepareFailureV1::InvalidChangeSet
        | TransactionPrepareFailureV1::PreconditionMismatch
        | TransactionPrepareFailureV1::Overlay(_) => {
            KernelStage3CommandFailureLeafV1::InternalError
        }
    }
}

fn score_target_from_stable_address(address: StableEntityAddressV1) -> ScoreEntityTargetV1 {
    match address {
        StableEntityAddressV1::Document { document_id } => {
            ScoreEntityTargetV1::Document { document_id }
        }
        StableEntityAddressV1::Measure { measure_id } => {
            ScoreEntityTargetV1::Measure { measure_id }
        }
        StableEntityAddressV1::Part { part_id } => ScoreEntityTargetV1::Part { part_id },
        StableEntityAddressV1::Staff { staff_id } => ScoreEntityTargetV1::Staff { staff_id },
        StableEntityAddressV1::Voice { voice_id } => ScoreEntityTargetV1::Voice { voice_id },
        StableEntityAddressV1::Event { event_id } => ScoreEntityTargetV1::Event { event_id },
        StableEntityAddressV1::Note { note_id } => ScoreEntityTargetV1::Note { note_id },
    }
}

fn map_store_create_failure(failure: LiveStoreBuildFailure) -> KernelRuntimeCreateFailure {
    match failure {
        LiveStoreBuildFailure::InternalCapacity => KernelRuntimeCreateFailure::InternalCapacity,
        LiveStoreBuildFailure::DuplicateStableId => {
            KernelRuntimeCreateFailure::InvalidDocument(ScoreStructureViolationV1::DuplicateId)
        }
        LiveStoreBuildFailure::MissingMeasureReference
        | LiveStoreBuildFailure::MissingStaffReference
        | LiveStoreBuildFailure::MissingPartReference
        | LiveStoreBuildFailure::DuplicatePartMeasureContent => {
            KernelRuntimeCreateFailure::InvalidDocument(ScoreStructureViolationV1::InvalidReference)
        }
        LiveStoreBuildFailure::LocalInvariant(_) => KernelRuntimeCreateFailure::InternalInvariant,
    }
}

#[cfg(test)]
mod tests {
    use brilliant_kernel_contracts::{
        CHECKPOINT_CHANGESET_BYTES_V1, KernelStage4CommandResultV1,
        KernelStage4MarkPersistedResultV1, decode_create_request,
    };
    use brilliant_score_foundation::canonical_score_bytes;

    use super::*;
    use crate::transaction::apply_stored_operations;

    fn submit_metadata_title(
        runtime: &mut KernelRuntime,
        title: &str,
    ) -> KernelStage4CommandResultV1 {
        let document_id = runtime.store.header.id.clone();
        let mut metadata = runtime.store.header.metadata.clone();
        metadata.title = title.to_owned();
        let prepared = {
            let mut transaction = runtime.begin_stage3_transaction();
            transaction
                .set_document_metadata(document_id.clone(), metadata.clone())
                .expect("prepare metadata");
            transaction.finish().expect("finish metadata")
        };
        runtime
            .commit_stage4_transaction(
                CoreCommandEnvelopeV1::DocumentSetMetadata {
                    target: ScoreEntityTargetV1::Document { document_id },
                    metadata,
                },
                prepared,
            )
            .expect("commit metadata")
    }

    fn measure_payload(
        document: &ScoreDocumentV1,
        id: &str,
    ) -> (MeasureDefinitionV1, Vec<InsertMeasurePartContentV1>) {
        let mut definition = document.measure_definitions[0].clone();
        definition.id = StableId::new(id).expect("measure id");
        let contents = document
            .parts
            .iter()
            .enumerate()
            .map(|(part_index, part)| {
                let mut voices = part.measure_contents[0].voices.clone();
                for (voice_index, voice) in voices.iter_mut().enumerate() {
                    voice.id = StableId::new(format!("{id}-voice-{part_index}-{voice_index}"))
                        .expect("voice id");
                    for (event_index, event) in voice.sequence.events.iter_mut().enumerate() {
                        event.id = StableId::new(format!(
                            "{id}-event-{part_index}-{voice_index}-{event_index}"
                        ))
                        .expect("event id");
                        if let RhythmicContentV1::Notes { notes } = &mut event.content {
                            for (note_index, note) in notes.iter_mut().enumerate() {
                                note.id = StableId::new(format!(
                                    "{id}-note-{part_index}-{voice_index}-{event_index}-{note_index}"
                                ))
                                .expect("note id");
                            }
                        }
                    }
                }
                InsertMeasurePartContentV1 {
                    part_id: part.id.clone(),
                    voices,
                }
            })
            .collect();
        (definition, contents)
    }

    fn hierarchy_fixture() -> ScoreDocumentV1 {
        let mut document = crate::store::tests::fixture();
        let mut second_part = document.parts[0].clone();
        second_part.id = StableId::new("part-y").expect("part id");
        second_part.name = "Second Part".to_owned();

        let mut staff_ids = HashMap::new();
        for (index, staff) in second_part.staves.iter_mut().enumerate() {
            let old_id = staff.id.clone();
            staff.id =
                StableId::new(format!("part-y-staff-{index}")).expect("second part staff id");
            staff_ids.insert(old_id, staff.id.clone());
        }
        for (content_index, content) in second_part.measure_contents.iter_mut().enumerate() {
            for (voice_index, voice) in content.voices.iter_mut().enumerate() {
                voice.id = StableId::new(format!("part-y-voice-{content_index}-{voice_index}"))
                    .expect("second part voice id");
                voice.default_staff_id = staff_ids[&voice.default_staff_id].clone();
                for (event_index, event) in voice.sequence.events.iter_mut().enumerate() {
                    event.id = StableId::new(format!(
                        "part-y-event-{content_index}-{voice_index}-{event_index}"
                    ))
                    .expect("second part event id");
                    if let Some(staff_id) = &event.staff_id {
                        event.staff_id = Some(staff_ids[staff_id].clone());
                    }
                    if let RhythmicContentV1::Notes { notes } = &mut event.content {
                        for (note_index, note) in notes.iter_mut().enumerate() {
                            note.id = StableId::new(format!(
                                "part-y-note-{content_index}-{voice_index}-{event_index}-{note_index}"
                            ))
                            .expect("second part note id");
                        }
                    }
                }
            }
        }
        document.parts.push(second_part);

        document.extensions[0].owner = brilliant_score_foundation::ExtensionOwnerV1::Part {
            part_id: StableId::new("part-z").expect("owned extension part"),
        };
        let mut trailing_owned = document.extensions[1].clone();
        trailing_owned.namespace = "example.part.trailing".to_owned();
        trailing_owned.owner = brilliant_score_foundation::ExtensionOwnerV1::Part {
            part_id: StableId::new("part-z").expect("owned extension part"),
        };
        document.extensions.push(trailing_owned);
        document
    }

    fn commit_measure_change(
        runtime: &mut KernelRuntime,
        mutate: impl FnOnce(
            &mut KernelStage3TransactionV1<'_>,
        ) -> Result<(), KernelStage3CommandFailureLeafV1>,
    ) {
        let prepared = {
            let mut transaction = runtime.begin_stage3_transaction();
            mutate(&mut transaction).expect("stage measure change");
            transaction.finish().expect("finish measure change")
        };
        runtime
            .commit_stage3_change_set(prepared.change_set)
            .expect("commit measure change");
    }

    fn assert_measure_orders(runtime: &KernelRuntime, expected: &[&str]) {
        let document = runtime.store.export_document().expect("export document");
        assert_eq!(
            document
                .measure_definitions
                .iter()
                .map(|measure| measure.id.as_str())
                .collect::<Vec<_>>(),
            expected
        );
        for part in &document.parts {
            assert_eq!(
                part.measure_contents
                    .iter()
                    .map(|content| content.measure_id.as_str())
                    .collect::<Vec<_>>(),
                expected
            );
        }
    }

    #[test]
    fn runtime_owns_only_the_live_store_and_revision_zero() {
        let document = crate::store::tests::fixture();
        let runtime = KernelRuntime::create(document).expect("runtime");
        assert_eq!(runtime.document_id().as_str(), "score-root");
        assert_eq!(runtime.document_version(), DocumentVersionV1::initial());

        let source = include_str!("runtime.rs").replace("\r\n", "\n");
        let declaration = source
            .split("pub struct KernelRuntime {")
            .nth(1)
            .expect("runtime declaration")
            .split("}\n\n")
            .next()
            .expect("runtime fields");
        assert!(!declaration.contains("ScoreDocumentV1"));
    }

    #[test]
    fn deterministic_export_is_semantically_equal_and_canonically_stable() {
        let document = crate::store::tests::fixture();
        let expected_bytes = canonical_score_bytes(&document).expect("input canonical bytes");
        let runtime = KernelRuntime::create(document.clone()).expect("runtime");
        let first = runtime.read_state().expect("first read");
        let second = runtime.read_state().expect("second read");
        assert_eq!(first, second);
        assert_eq!(first.snapshot.document, document);

        let exported_bytes =
            canonical_score_bytes(&first.snapshot.document).expect("export canonical bytes");
        assert_eq!(exported_bytes, expected_bytes);

        let mut request_bytes = br#"{"apiVersion":1,"document":"#.to_vec();
        request_bytes.extend_from_slice(&exported_bytes);
        request_bytes.push(b'}');
        let decoded = decode_create_request(&request_bytes)
            .expect("exported document decodes")
            .document;
        assert_eq!(
            canonical_score_bytes(&decoded).expect("re-encoded canonical bytes"),
            exported_bytes
        );
    }

    #[test]
    fn event_interval_overflow_rejects_before_store_history_or_version_mutation() {
        let document = crate::store::tests::fixture();
        let document_id = document.id.clone();
        let mut metadata = document.metadata.clone();
        metadata.title = "event overflow".to_owned();
        let mut runtime = KernelRuntime::create(document).expect("runtime");
        let baseline = runtime.read_state().expect("baseline");
        runtime
            .projection
            .set_next_event_sequence_for_test(JS_SAFE_INTEGER_MAX as u64);

        let prepared = {
            let mut transaction = runtime.begin_stage3_transaction();
            transaction
                .set_document_metadata(document_id.clone(), metadata.clone())
                .expect("prepare metadata");
            transaction.finish().expect("finish metadata")
        };
        let result = runtime.commit_stage4_transaction(
            CoreCommandEnvelopeV1::DocumentSetMetadata {
                target: ScoreEntityTargetV1::Document { document_id },
                metadata,
            },
            prepared,
        );
        assert_eq!(result, Err(KernelStage4FailureV1::EventSequenceOverflow));
        assert_eq!(runtime.document_version(), DocumentVersionV1::initial());
        assert_eq!(runtime.read_state().expect("unchanged state"), baseline);
    }

    #[test]
    fn checkpoint_failure_keeps_the_commit_and_retries_on_full_read() {
        let document = crate::store::tests::fixture();
        let mut runtime = KernelRuntime::create(document).expect("runtime");
        runtime
            .checkpoint
            .force_due_for_test(511, CHECKPOINT_CHANGESET_BYTES_V1 - 1);
        runtime.checkpoint.fail_next_materialization();

        let committed = submit_metadata_title(&mut runtime, "checkpoint failure");
        let (events, metrics) = match committed {
            KernelStage4CommandResultV1::Committed { value, events } => {
                (events, value.stage4_metrics)
            }
            other => panic!("expected committed result, got {other:?}"),
        };
        assert_eq!(events.len(), 2);
        assert_eq!(metrics.checkpoint_attempts, 1);
        assert_eq!(metrics.checkpoint_successes, 0);
        assert_eq!(metrics.checkpoint_failures, 1);
        assert_eq!(runtime.document_version().get(), 1);

        let failed = runtime.checkpoint.observation();
        assert_eq!(failed.entries, 512);
        assert!(failed.logical_bytes >= CHECKPOINT_CHANGESET_BYTES_V1);
        assert!(failed.due);
        assert_eq!(failed.latest_version, None);

        let read = runtime.read_stage4(None).expect("retrying full read");
        assert_eq!(read.stage4_metrics.full_snapshot_materializations, 1);
        assert_eq!(read.stage4_metrics.checkpoint_attempts, 1);
        assert_eq!(read.stage4_metrics.checkpoint_successes, 1);
        assert_eq!(read.stage4_metrics.checkpoint_failures, 0);

        let completed = runtime.checkpoint.observation();
        assert_eq!(completed.entries, 0);
        assert_eq!(completed.logical_bytes, 0);
        assert!(!completed.due);
        assert_eq!(
            completed.latest_version,
            Some(DocumentVersionV1::initial().checked_next().unwrap())
        );
        assert_eq!(completed.latest_cursor, Some(1));
        assert_eq!(completed.latest_identity, Some(1));
        assert_eq!(
            completed.latest_document_id.as_ref().map(StableId::as_str),
            Some("score-root")
        );

        runtime.checkpoint.force_due_for_test(29, 31);
        runtime.checkpoint.fail_next_materialization();
        let second = submit_metadata_title(&mut runtime, "keep old checkpoint");
        let second_metrics = match second {
            KernelStage4CommandResultV1::Committed { value, events } => {
                assert_eq!(events.len(), 1);
                value.stage4_metrics
            }
            other => panic!("expected committed result, got {other:?}"),
        };
        assert_eq!(second_metrics.checkpoint_failures, 1);
        let retained = runtime.checkpoint.observation();
        assert!(retained.due);
        assert_eq!(retained.latest_version, completed.latest_version);
        assert_eq!(retained.latest_identity, completed.latest_identity);

        let retry = runtime.read_stage4(None).expect("second retrying read");
        assert_eq!(retry.stage4_metrics.checkpoint_successes, 1);
        let replaced = runtime.checkpoint.observation();
        assert_eq!(replaced.latest_version, Some(runtime.document_version()));
        assert_eq!(replaced.latest_cursor, Some(2));
        assert_eq!(replaced.latest_identity, Some(2));
    }

    #[test]
    fn mark_persisted_never_touches_the_operational_checkpoint() {
        let document = crate::store::tests::fixture();
        let document_id = document.id.clone();
        let mut runtime = KernelRuntime::create(document).expect("runtime");
        let _ = submit_metadata_title(&mut runtime, "persisted identity only");
        runtime.checkpoint.force_due_for_test(17, 23);
        let before = runtime.checkpoint.observation();

        let result = runtime.mark_persisted(PersistedCheckpointV1 {
            document_id,
            document_version: runtime.document_version(),
        });
        match result {
            KernelStage4MarkPersistedResultV1::Updated { events, .. } => {
                assert_eq!(events.len(), 1);
            }
            other => panic!("expected updated checkpoint, got {other:?}"),
        }
        assert_eq!(runtime.checkpoint.observation(), before);
    }

    #[test]
    fn undo_redo_and_branch_truncation_do_not_rewrite_submit_counters() {
        let document = crate::store::tests::fixture();
        let mut runtime = KernelRuntime::create(document).expect("runtime");
        let _ = submit_metadata_title(&mut runtime, "first");
        let after_first = runtime.checkpoint.observation();
        let _ = submit_metadata_title(&mut runtime, "second");
        let after_second = runtime.checkpoint.observation();
        assert_eq!(after_second.entries, after_first.entries + 1);

        let _ = runtime.undo();
        assert_eq!(runtime.checkpoint.observation(), after_second);
        let _ = runtime.redo();
        assert_eq!(runtime.checkpoint.observation(), after_second);
        let _ = runtime.undo();
        let _ = submit_metadata_title(&mut runtime, "branched");
        let branched = runtime.checkpoint.observation();
        assert_eq!(branched.entries, after_second.entries + 1);
        assert!(!runtime.history.can_redo());
    }

    #[test]
    fn measure_transaction_reads_prior_overlay_and_restores_exact_documents() {
        let document = crate::store::tests::fixture();
        let baseline = document.clone();
        let document_id = document.id.clone();
        let anchor_id = document.measure_definitions[0].id.clone();
        let inserted_id = StableId::new("inverse-measure").expect("measure id");
        let (definition, contents) = measure_payload(&document, inserted_id.as_str());

        let mut runtime = KernelRuntime::create(document).expect("runtime");
        let prepared = {
            let mut transaction = runtime.begin_stage3_transaction();
            transaction
                .insert_measure(
                    document_id,
                    MeasureAnchorV1::AfterMeasure {
                        measure_id: anchor_id,
                    },
                    definition,
                    contents,
                )
                .expect("prepare measure");
            transaction
                .move_measure(inserted_id, MeasureAnchorV1::Start)
                .expect("later command sees inserted measure in overlay");
            transaction.finish().expect("finish measure")
        };
        let change_set = prepared.change_set.clone();
        runtime
            .commit_stage3_change_set(prepared.change_set)
            .expect("commit measure");
        let committed = runtime.store.export_document().expect("committed document");
        assert_ne!(committed, baseline);

        apply_stored_operations(
            &mut runtime.store,
            &mut runtime.document_version,
            &mut runtime.committed_metrics,
            &change_set,
            &change_set.inverse,
        )
        .expect("inverse measure");
        assert_eq!(
            runtime.store.export_document().expect("restored document"),
            baseline
        );

        apply_stored_operations(
            &mut runtime.store,
            &mut runtime.document_version,
            &mut runtime.committed_metrics,
            &change_set,
            &change_set.forward,
        )
        .expect("forward measure");
        assert_eq!(
            runtime
                .store
                .export_document()
                .expect("recommitted document"),
            committed
        );
    }

    #[test]
    fn part_aggregate_inverse_restores_owned_extensions_in_exact_document_order() {
        let baseline = hierarchy_fixture();
        let mut runtime = KernelRuntime::create(baseline.clone()).expect("runtime");
        let prepared = {
            let mut transaction = runtime.begin_stage3_transaction();
            transaction
                .remove_part(StableId::new("part-z").expect("part id"))
                .expect("remove first part");
            transaction.finish().expect("finish part removal")
        };
        let change_set = prepared.change_set.clone();
        runtime
            .commit_stage3_change_set(prepared.change_set)
            .expect("commit part removal");
        let committed = runtime.store.export_document().expect("committed document");
        assert_eq!(
            committed
                .parts
                .iter()
                .map(|part| part.id.as_str())
                .collect::<Vec<_>>(),
            ["part-y"]
        );
        assert_eq!(
            committed
                .extensions
                .iter()
                .map(|extension| extension.namespace.as_str())
                .collect::<Vec<_>>(),
            ["example.second"]
        );

        apply_stored_operations(
            &mut runtime.store,
            &mut runtime.document_version,
            &mut runtime.committed_metrics,
            &change_set,
            &change_set.inverse,
        )
        .expect("inverse part removal");
        assert_eq!(
            runtime.store.export_document().expect("restored document"),
            baseline
        );

        apply_stored_operations(
            &mut runtime.store,
            &mut runtime.document_version,
            &mut runtime.committed_metrics,
            &change_set,
            &change_set.forward,
        )
        .expect("forward part removal");
        assert_eq!(
            runtime
                .store
                .export_document()
                .expect("recommitted document"),
            committed
        );
    }

    #[test]
    fn shared_transaction_can_target_inserted_staff_voice_and_references() {
        let document = crate::store::tests::fixture();
        let mut staff = document.parts[0].staves[0].clone();
        staff.id = StableId::new("staff-new").expect("staff id");
        let mut voice = document.parts[0]
            .measure_contents
            .iter()
            .find(|content| content.measure_id.as_str() == "measure-z")
            .expect("measure content")
            .voices[0]
            .clone();
        voice.id = StableId::new("voice-new").expect("voice id");
        voice.default_staff_id = staff.id.clone();
        voice.sequence.events[0].id = StableId::new("event-new").expect("event id");
        let event_id = voice.sequence.events[0].id.clone();

        let mut runtime = KernelRuntime::create(document).expect("runtime");
        let prepared = {
            let mut transaction = runtime.begin_stage3_transaction();
            transaction
                .insert_staff(
                    StableId::new("part-z").expect("part id"),
                    StaffAnchorV1::Start,
                    staff,
                )
                .expect("insert staff");
            transaction
                .insert_voice(
                    StableId::new("part-z").expect("part id"),
                    StableId::new("measure-z").expect("measure id"),
                    VoiceAnchorV1::Start,
                    voice,
                )
                .expect("insert voice using inserted staff");
            transaction
                .set_voice_sequence_start(
                    StableId::new("voice-new").expect("voice id"),
                    FractionV1 {
                        numerator: SafeInteger::new(1).expect("numerator"),
                        denominator: SafeInteger::new(4).expect("denominator"),
                    },
                )
                .expect("edit inserted voice");
            transaction
                .set_voice_default_staff(
                    StableId::new("voice-new").expect("voice id"),
                    StableId::new("staff-a").expect("staff id"),
                )
                .expect("update inserted voice reference");
            transaction
                .set_event_staff_assignment(
                    event_id,
                    EventStaffAssignmentV1::Staff {
                        staff_id: StableId::new("staff-new").expect("staff id"),
                    },
                )
                .expect("update inserted event reference");
            transaction
                .move_staff(
                    StableId::new("staff-new").expect("staff id"),
                    StaffAnchorV1::AfterStaff {
                        staff_id: StableId::new("staff-a").expect("anchor staff"),
                    },
                )
                .expect("move inserted staff");
            transaction
                .move_voice(
                    StableId::new("voice-new").expect("voice id"),
                    VoiceAnchorV1::AfterVoice {
                        voice_id: StableId::new("voice-z").expect("anchor voice"),
                    },
                )
                .expect("move inserted voice");
            transaction.finish().expect("finish shared transaction")
        };
        runtime
            .commit_stage3_change_set(prepared.change_set)
            .expect("commit shared transaction");

        let committed = runtime.store.export_document().expect("committed document");
        let part = committed
            .parts
            .iter()
            .find(|part| part.id.as_str() == "part-z")
            .expect("part");
        assert_eq!(
            part.staves
                .iter()
                .map(|staff| staff.id.as_str())
                .collect::<Vec<_>>(),
            ["staff-z", "staff-a", "staff-new"]
        );
        let content = part
            .measure_contents
            .iter()
            .find(|content| content.measure_id.as_str() == "measure-z")
            .expect("measure content");
        assert_eq!(
            content
                .voices
                .iter()
                .map(|voice| voice.id.as_str())
                .collect::<Vec<_>>(),
            ["voice-z", "voice-new"]
        );
        let inserted = content
            .voices
            .iter()
            .find(|voice| voice.id.as_str() == "voice-new")
            .expect("inserted voice");
        assert_eq!(inserted.default_staff_id.as_str(), "staff-a");
        assert_eq!(inserted.sequence.start.numerator.get(), 1);
        assert_eq!(inserted.sequence.start.denominator.get(), 4);
        assert_eq!(
            inserted.sequence.events[0]
                .staff_id
                .as_ref()
                .map(StableId::as_str),
            Some("staff-new")
        );
    }

    #[test]
    fn measure_boundaries_cover_first_middle_and_last_positions() {
        let document = crate::store::tests::fixture();
        let document_id = document.id.clone();
        let mut runtime = KernelRuntime::create(document.clone()).expect("runtime");

        for (id, anchor) in [
            ("measure-first", MeasureAnchorV1::Start),
            (
                "measure-last",
                MeasureAnchorV1::AfterMeasure {
                    measure_id: StableId::new("measure-a").expect("anchor"),
                },
            ),
            (
                "measure-middle",
                MeasureAnchorV1::AfterMeasure {
                    measure_id: StableId::new("measure-z").expect("anchor"),
                },
            ),
        ] {
            let (definition, contents) = measure_payload(&document, id);
            commit_measure_change(&mut runtime, |transaction| {
                transaction.insert_measure(document_id.clone(), anchor, definition, contents)
            });
        }
        assert_measure_orders(
            &runtime,
            &[
                "measure-first",
                "measure-z",
                "measure-middle",
                "measure-a",
                "measure-last",
            ],
        );

        commit_measure_change(&mut runtime, |transaction| {
            transaction.move_measure(
                StableId::new("measure-first").expect("measure"),
                MeasureAnchorV1::AfterMeasure {
                    measure_id: StableId::new("measure-last").expect("anchor"),
                },
            )
        });
        assert_measure_orders(
            &runtime,
            &[
                "measure-z",
                "measure-middle",
                "measure-a",
                "measure-last",
                "measure-first",
            ],
        );
        commit_measure_change(&mut runtime, |transaction| {
            transaction.move_measure(
                StableId::new("measure-first").expect("measure"),
                MeasureAnchorV1::Start,
            )
        });
        assert_measure_orders(
            &runtime,
            &[
                "measure-first",
                "measure-z",
                "measure-middle",
                "measure-a",
                "measure-last",
            ],
        );
        commit_measure_change(&mut runtime, |transaction| {
            transaction.move_measure(
                StableId::new("measure-last").expect("measure"),
                MeasureAnchorV1::AfterMeasure {
                    measure_id: StableId::new("measure-z").expect("anchor"),
                },
            )
        });
        assert_measure_orders(
            &runtime,
            &[
                "measure-first",
                "measure-z",
                "measure-last",
                "measure-middle",
                "measure-a",
            ],
        );

        for measure_id in ["measure-last", "measure-first", "measure-a"] {
            commit_measure_change(&mut runtime, |transaction| {
                transaction.remove_measure(StableId::new(measure_id).expect("measure"))
            });
        }
        assert_measure_orders(&runtime, &["measure-z", "measure-middle"]);
    }

    #[test]
    fn written_pitch_transposition_preserves_the_four_frozen_failure_reasons() {
        let pitch = WrittenPitchV1 {
            step: PitchStepV1::C,
            alter: SafeInteger::new(0).expect("alter"),
            octave: SafeInteger::new(4).expect("octave"),
        };
        let valid = TranspositionV1 {
            diatonic_steps: SafeInteger::new(1).expect("diatonic"),
            chromatic_semitones: SafeInteger::new(2).expect("chromatic"),
        };
        assert_eq!(
            transpose_written_pitch_v1(&pitch, &valid),
            Ok(WrittenPitchV1 {
                step: PitchStepV1::D,
                alter: SafeInteger::new(0).expect("alter"),
                octave: SafeInteger::new(4).expect("octave"),
            })
        );

        let invalid_pitch = WrittenPitchV1 {
            alter: SafeInteger::new(3).expect("representable invalid alter"),
            ..pitch.clone()
        };
        assert_eq!(
            transpose_written_pitch_v1(&invalid_pitch, &valid),
            Err(PitchTranspositionErrorV1::WrittenPitchInvalid)
        );
        let invalid_component = TranspositionV1 {
            diatonic_steps: SafeInteger::new(JS_SAFE_INTEGER_MAX).expect("safe maximum"),
            chromatic_semitones: SafeInteger::new(0).expect("chromatic"),
        };
        assert_eq!(
            transpose_written_pitch_v1(&pitch, &invalid_component),
            Err(PitchTranspositionErrorV1::TranspositionComponentInvalid)
        );
        let octave_overflow = WrittenPitchV1 {
            step: PitchStepV1::B,
            alter: SafeInteger::new(0).expect("alter"),
            octave: SafeInteger::new(8).expect("octave"),
        };
        assert_eq!(
            transpose_written_pitch_v1(&octave_overflow, &valid),
            Err(PitchTranspositionErrorV1::DerivedPitchOctaveOutOfRange)
        );
        let alter_overflow = TranspositionV1 {
            diatonic_steps: SafeInteger::new(0).expect("diatonic"),
            chromatic_semitones: SafeInteger::new(3).expect("chromatic"),
        };
        assert_eq!(
            transpose_written_pitch_v1(&pitch, &alter_overflow),
            Err(PitchTranspositionErrorV1::DerivedPitchAlterOutOfRange)
        );
    }
}
