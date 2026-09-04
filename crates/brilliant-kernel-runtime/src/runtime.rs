use std::collections::HashMap;

use brilliant_core_types::{DocumentVersionV1, StableId, StablePathV1};
use brilliant_kernel_contracts::{
    InsertMeasurePartContentV1, KernelReadStateV1, KernelStage3CommandFailureLeafV1,
    KernelStage3MetricsV1, KernelStage3ResourceLimitKindV1, MeasureAnchorV1, MeasurePickupV1,
    ScoreEntityTargetV1, ScoreStructureViolationV1, SequenceAnchorV1, StableFailureV1,
    initial_snapshot,
};
use brilliant_score_foundation::{
    MeasureDefinitionV1, MeterV1, NoteValueV1, RhythmicContentV1, RhythmicEventV1, ScoreDocumentV1,
    ScoreMetadataV1, VoiceV1, WrittenPitchV1,
};

use crate::{
    change_set::{
        ChangeSetBuildFailureV1, ChangeSetV1, EntityBundleV1, MeasureBundleV1,
        MeasurePartContentBundleV1, ScalarAddressV1, ScalarValueV1, StableAnchorV1,
        StableEntityAddressV1, StableOrderAddressV1, StableOwnerAddressV1,
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
        if current_measures.len() <= 1 {
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
        self.add_prepared_effects(1 + u64::from(needs_normalization))
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
    use brilliant_kernel_contracts::decode_create_request;
    use brilliant_score_foundation::canonical_score_bytes;

    use super::*;
    use crate::transaction::apply_operations_for_test;

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
            .commit_stage3_transaction(prepared)
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
            .commit_stage3_transaction(prepared)
            .expect("commit measure");
        let committed = runtime.store.export_document().expect("committed document");
        assert_ne!(committed, baseline);

        apply_operations_for_test(
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

        apply_operations_for_test(
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
}
