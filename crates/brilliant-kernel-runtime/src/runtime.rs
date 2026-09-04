use brilliant_core_types::{DocumentVersionV1, StableId, StablePathV1};
use brilliant_kernel_contracts::{
    KernelReadStateV1, KernelStage3CommandFailureLeafV1, KernelStage3MetricsV1,
    KernelStage3ResourceLimitKindV1, ScoreEntityTargetV1, ScoreStructureViolationV1,
    SequenceAnchorV1, StableFailureV1, initial_snapshot,
};
use brilliant_score_foundation::{
    NoteValueV1, RhythmicContentV1, RhythmicEventV1, ScoreDocumentV1, ScoreMetadataV1,
    WrittenPitchV1,
};

use crate::{
    change_set::{
        ChangeSetBuildFailureV1, ChangeSetV1, EntityBundleV1, ScalarAddressV1, ScalarValueV1,
        StableAnchorV1, StableEntityAddressV1, StableOrderAddressV1, StableOwnerAddressV1,
    },
    overlay::{OverlayFailureV1, OverlayMutationV1, TransactionOverlayV1},
    store::{LiveScoreStore, LiveStoreBuildFailure, build_live_score_store},
    transaction::{TransactionPrepareFailureV1, commit_change_set},
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

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum KernelStage3RuntimeCommitV1 {
    Committed {
        document_version: DocumentVersionV1,
        affected: Vec<ScoreEntityTargetV1>,
        metrics: KernelStage3MetricsV1,
    },
    NoOp {
        document_version: DocumentVersionV1,
        metrics: KernelStage3MetricsV1,
    },
}

#[derive(Clone, Debug)]
pub struct KernelStage3PreparedV1 {
    change_set: ChangeSetV1,
    attempt_metrics: KernelStage3MetricsV1,
}

/// One isolated command transaction. Dropping it publishes no live state.
pub struct KernelStage3TransactionV1<'a> {
    overlay: TransactionOverlayV1<'a>,
}

#[derive(Clone, Copy)]
enum InsertedEventContentV1 {
    Notes,
    Rest,
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
}

impl KernelRuntime {
    pub fn create(document: ScoreDocumentV1) -> Result<Self, KernelRuntimeCreateFailure> {
        let store = build_live_score_store(&document).map_err(map_store_create_failure)?;
        Ok(Self {
            store,
            document_version: DocumentVersionV1::initial(),
            committed_metrics: KernelStage3MetricsV1::default(),
        })
    }

    pub fn document_id(&self) -> &StableId {
        &self.store.header.id
    }

    pub const fn document_version(&self) -> DocumentVersionV1 {
        self.document_version
    }

    pub fn read_state(&self) -> Result<KernelReadStateV1, KernelRuntimeReadFailure> {
        let document = self
            .store
            .export_document()
            .map_err(|_| KernelRuntimeReadFailure::InternalInvariant)?;
        let mut state = initial_snapshot(document);
        state.snapshot.document_version = self.document_version;
        Ok(state)
    }

    pub fn begin_stage3_transaction(&self) -> KernelStage3TransactionV1<'_> {
        KernelStage3TransactionV1 {
            overlay: TransactionOverlayV1::new(&self.store),
        }
    }

    pub fn commit_stage3_transaction(
        &mut self,
        prepared: KernelStage3PreparedV1,
    ) -> Result<KernelStage3RuntimeCommitV1, KernelStage3CommandFailureLeafV1> {
        if prepared.change_set.forward.is_empty() {
            return Ok(KernelStage3RuntimeCommitV1::NoOp {
                document_version: self.document_version,
                metrics: prepared.attempt_metrics,
            });
        }

        let committed = self
            .commit_stage3_change_set(prepared.change_set)
            .map_err(map_prepare_failure)?;
        let affected = committed
            .affected
            .into_iter()
            .map(score_target_from_stable_address)
            .collect();
        Ok(KernelStage3RuntimeCommitV1::Committed {
            document_version: self.document_version,
            affected,
            metrics: self.committed_metrics,
        })
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

impl KernelStage3TransactionV1<'_> {
    pub fn attempt_metrics(&self) -> KernelStage3MetricsV1 {
        overlay_attempt_metrics(&self.overlay)
    }

    pub fn finish(self) -> Result<KernelStage3PreparedV1, KernelStage3CommandFailureLeafV1> {
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

    fn record_affected(
        &mut self,
        address: StableEntityAddressV1,
    ) -> Result<(), KernelStage3CommandFailureLeafV1> {
        self.overlay
            .record_affected(address)
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
    use brilliant_kernel_contracts::decode_create_request;
    use brilliant_score_foundation::canonical_score_bytes;

    use super::*;

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
}
