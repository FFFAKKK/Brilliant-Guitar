use std::{
    collections::{HashMap, HashSet},
    hash::Hash,
};

use brilliant_core_types::StableId;
use brilliant_score_foundation::{
    ExactFraction, ExtensionBlockV1, ExtensionOwnerV1, MeasureDefinitionV1, MusicSequenceV1,
    PartMeasureContentV1, PartV1, RhythmicContentV1, RhythmicEventV1, ScoreDocumentV1, ScoreNoteV1,
    StaffDefinitionV1, VoiceV1,
};
use slotmap::{Key, SlotMap};

use crate::{
    handles::{
        EventHandle, ExtensionHandle, MeasureHandle, NoteHandle, PartHandle, RuntimeEntityRef,
        StaffHandle, VoiceHandle,
    },
    indices::{
        DerivedIndices, ExtensionIndexKey, ExtensionIndexOwner, IndexBuildFailure, IndexCapacities,
        ReferenceCapacityPlan, Rkp2StoreMetrics, event_staff_reference_path,
        extension_part_reference_path, increment, mark_index_entry, measure_reference_path,
        voice_staff_reference_path,
    },
    records::{
        DocumentHeader, EventContentKind, EventRecord, ExtensionRecord, MeasureRecord, NoteRecord,
        PartMeasureContentRecord, PartMeasureKey, PartRecord, StaffRecord, VoiceRecord,
    },
    time_index::{TimeIndexFailure, VoiceTimeEntry, VoiceTimeIndex},
    topology::ScoreTopology,
};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum StoreInvariantFailure {
    MissingRecord,
    DuplicateSemanticPosition,
    CountMismatch,
    CoverageMismatch,
    ContentRecordMismatch,
    IndexMismatch,
    InvalidExactTime,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum LiveStoreBuildFailure {
    InternalCapacity,
    DuplicateStableId,
    MissingMeasureReference,
    MissingStaffReference,
    MissingPartReference,
    DuplicatePartMeasureContent,
    LocalInvariant(StoreInvariantFailure),
}

#[derive(Debug)]
pub(crate) struct LiveScoreStore {
    pub(crate) header: DocumentHeader,
    pub(crate) measures: SlotMap<MeasureHandle, MeasureRecord>,
    pub(crate) parts: SlotMap<PartHandle, PartRecord>,
    pub(crate) staffs: SlotMap<StaffHandle, StaffRecord>,
    pub(crate) voices: SlotMap<VoiceHandle, VoiceRecord>,
    pub(crate) events: SlotMap<EventHandle, EventRecord>,
    pub(crate) notes: SlotMap<NoteHandle, NoteRecord>,
    pub(crate) extensions: SlotMap<ExtensionHandle, ExtensionRecord>,
    pub(crate) topology: ScoreTopology,
    pub(crate) indices: DerivedIndices,
    pub(crate) metrics: Rkp2StoreMetrics,
}

// This compile-only anchor keeps the private Stage 3 ownership shape checked in
// non-test builds without connecting the store to SmokeRuntime before Stage 5.
fn stage3_owned_store_shape(store: &LiveScoreStore) {
    let LiveScoreStore {
        header,
        measures,
        parts,
        staffs,
        voices,
        events,
        notes,
        extensions,
        topology,
        indices,
        metrics,
    } = store;
    let _ = (
        header, measures, parts, staffs, voices, events, notes, extensions, topology, indices,
        metrics,
    );
}

#[used]
static STAGE3_OWNED_STORE_SHAPE: fn(&LiveScoreStore) = stage3_owned_store_shape;

// Export is intentionally separate from the Stage 4 query implementation:
// export traverses canonical topology, while stable-ID queries must remain scan-free.
impl crate::store::LiveScoreStore {
    pub(crate) fn export_document(&self) -> Result<ScoreDocumentV1, LiveStoreBuildFailure> {
        let mut measure_definitions = Vec::with_capacity(self.topology.measure_order.len());
        for handle in &self.topology.measure_order {
            let record = self
                .measures
                .get(*handle)
                .ok_or(local(StoreInvariantFailure::MissingRecord))?;
            measure_definitions.push(MeasureDefinitionV1 {
                id: record.id.clone(),
                meter: record.meter.clone(),
                pickup_duration: record.pickup_duration.clone(),
            });
        }

        let mut parts = Vec::with_capacity(self.topology.part_order.len());
        for part_handle in &self.topology.part_order {
            parts.push(self.export_part(*part_handle)?);
        }

        let mut extensions = Vec::with_capacity(self.topology.extension_order.len());
        for handle in &self.topology.extension_order {
            let record = self
                .extensions
                .get(*handle)
                .ok_or(local(StoreInvariantFailure::MissingRecord))?;
            extensions.push(ExtensionBlockV1 {
                namespace: record.namespace.clone(),
                schema_version: record.schema_version,
                owner: record.owner.clone(),
                payload: record.payload.clone(),
            });
        }

        Ok(ScoreDocumentV1 {
            schema_version: "brilliant-score-1".to_owned(),
            id: self.header.id.clone(),
            metadata: self.header.metadata.clone(),
            measure_definitions,
            parts,
            extensions,
        })
    }

    fn export_part(&self, part_handle: PartHandle) -> Result<PartV1, LiveStoreBuildFailure> {
        let record = self
            .parts
            .get(part_handle)
            .ok_or(local(StoreInvariantFailure::MissingRecord))?;
        let staff_order = self
            .topology
            .staff_order
            .get(&part_handle)
            .ok_or(local(StoreInvariantFailure::MissingRecord))?;
        let mut staves = Vec::with_capacity(staff_order.len());
        for handle in staff_order {
            let staff = self
                .staffs
                .get(*handle)
                .ok_or(local(StoreInvariantFailure::MissingRecord))?;
            staves.push(StaffDefinitionV1 {
                id: staff.id.clone(),
                line_count: staff.line_count,
                default_clef: staff.default_clef.clone(),
            });
        }

        let content_order = self
            .topology
            .content_order
            .get(&part_handle)
            .ok_or(local(StoreInvariantFailure::MissingRecord))?;
        let mut measure_contents = Vec::with_capacity(content_order.len());
        for measure_handle in content_order {
            measure_contents.push(self.export_content(part_handle, *measure_handle)?);
        }

        Ok(PartV1 {
            id: record.id.clone(),
            name: record.name.clone(),
            instrument: record.instrument.clone(),
            staves,
            measure_contents,
        })
    }

    fn export_content(
        &self,
        part_handle: PartHandle,
        measure_handle: MeasureHandle,
    ) -> Result<PartMeasureContentV1, LiveStoreBuildFailure> {
        let key = PartMeasureKey {
            part: part_handle,
            measure: measure_handle,
        };
        let content = self
            .topology
            .contents
            .get(&key)
            .ok_or(local(StoreInvariantFailure::MissingRecord))?;
        if content.part != part_handle || content.measure != measure_handle {
            return Err(local(StoreInvariantFailure::ContentRecordMismatch));
        }
        let measure = self
            .measures
            .get(measure_handle)
            .ok_or(local(StoreInvariantFailure::MissingRecord))?;
        let voice_order = self
            .topology
            .voice_order
            .get(&key)
            .ok_or(local(StoreInvariantFailure::MissingRecord))?;
        let mut voices = Vec::with_capacity(voice_order.len());
        for handle in voice_order {
            voices.push(self.export_voice(*handle)?);
        }
        Ok(PartMeasureContentV1 {
            measure_id: measure.id.clone(),
            voices,
        })
    }

    fn export_voice(&self, voice_handle: VoiceHandle) -> Result<VoiceV1, LiveStoreBuildFailure> {
        let record = self
            .voices
            .get(voice_handle)
            .ok_or(local(StoreInvariantFailure::MissingRecord))?;
        let event_order = self
            .topology
            .event_order
            .get(&voice_handle)
            .ok_or(local(StoreInvariantFailure::MissingRecord))?;
        let mut events = Vec::with_capacity(event_order.len());
        for handle in event_order {
            events.push(self.export_event(*handle)?);
        }
        Ok(VoiceV1 {
            id: record.id.clone(),
            default_staff_id: record.default_staff_id.clone(),
            sequence: MusicSequenceV1 {
                start: record.sequence_start.clone(),
                events,
            },
        })
    }

    fn export_event(
        &self,
        event_handle: EventHandle,
    ) -> Result<RhythmicEventV1, LiveStoreBuildFailure> {
        let record = self
            .events
            .get(event_handle)
            .ok_or(local(StoreInvariantFailure::MissingRecord))?;
        let note_order = self
            .topology
            .note_order
            .get(&event_handle)
            .ok_or(local(StoreInvariantFailure::MissingRecord))?;
        let content = match record.content_kind {
            EventContentKind::Rest => {
                if !note_order.is_empty() {
                    return Err(local(StoreInvariantFailure::ContentRecordMismatch));
                }
                RhythmicContentV1::Rest
            }
            EventContentKind::Notes => {
                if note_order.is_empty() {
                    return Err(local(StoreInvariantFailure::ContentRecordMismatch));
                }
                let mut notes = Vec::with_capacity(note_order.len());
                for handle in note_order {
                    let note = self
                        .notes
                        .get(*handle)
                        .ok_or(local(StoreInvariantFailure::MissingRecord))?;
                    notes.push(ScoreNoteV1 {
                        id: note.id.clone(),
                        written_pitch: note.written_pitch.clone(),
                    });
                }
                RhythmicContentV1::Notes { notes }
            }
        };
        Ok(RhythmicEventV1 {
            id: record.id.clone(),
            duration: record.duration.clone(),
            staff_id: record.staff_id.clone(),
            content,
        })
    }
}

impl LiveScoreStore {
    pub(crate) fn lookup_entity(&mut self, id: &StableId) -> Option<RuntimeEntityRef> {
        let entity = self.indices.lookup_entity(id, &mut self.metrics).ok()?;
        self.entity_is_live(entity).then_some(entity)
    }

    pub(crate) fn lookup_owner(
        &mut self,
        id: &StableId,
    ) -> Option<crate::indices::RuntimeOwnerRef> {
        let entity = self.lookup_entity(id)?;
        self.indices.lookup_owner(entity, &mut self.metrics).ok()
    }

    pub(crate) fn part_measure_content(
        &mut self,
        part_id: &StableId,
        measure_id: &StableId,
    ) -> Option<&PartMeasureContentRecord> {
        let RuntimeEntityRef::Part(part) = self.lookup_entity(part_id)? else {
            return None;
        };
        let RuntimeEntityRef::Measure(measure) = self.lookup_entity(measure_id)? else {
            return None;
        };
        self.topology
            .contents
            .get(&PartMeasureKey { part, measure })
    }

    pub(crate) fn exact_voice_start(
        &mut self,
        voice_id: &StableId,
        start: ExactFraction,
    ) -> Result<&[VoiceTimeEntry], TimeIndexFailure> {
        let RuntimeEntityRef::Voice(voice) = self
            .lookup_entity(voice_id)
            .ok_or(TimeIndexFailure::MissingVoice)?
        else {
            return Err(TimeIndexFailure::MissingVoice);
        };
        self.indices
            .voice_time
            .get(&voice)
            .ok_or(TimeIndexFailure::MissingVoice)?
            .exact_start(start, &mut self.metrics.time_index_comparisons)
    }

    pub(crate) fn overlapping_voice_range(
        &mut self,
        voice_id: &StableId,
        start: ExactFraction,
        end: ExactFraction,
    ) -> Result<&[VoiceTimeEntry], TimeIndexFailure> {
        let RuntimeEntityRef::Voice(voice) = self
            .lookup_entity(voice_id)
            .ok_or(TimeIndexFailure::MissingVoice)?
        else {
            return Err(TimeIndexFailure::MissingVoice);
        };
        self.indices
            .voice_time
            .get(&voice)
            .ok_or(TimeIndexFailure::MissingVoice)?
            .overlap(start, end, &mut self.metrics.time_index_comparisons)
    }

    fn entity_is_live(&self, entity: RuntimeEntityRef) -> bool {
        match entity {
            RuntimeEntityRef::Document => true,
            RuntimeEntityRef::Measure(handle) => self.measures.get(handle).is_some(),
            RuntimeEntityRef::Part(handle) => self.parts.get(handle).is_some(),
            RuntimeEntityRef::Staff(handle) => self.staffs.get(handle).is_some(),
            RuntimeEntityRef::Voice(handle) => self.voices.get(handle).is_some(),
            RuntimeEntityRef::Event(handle) => self.events.get(handle).is_some(),
            RuntimeEntityRef::Note(handle) => self.notes.get(handle).is_some(),
        }
    }
}

fn stage4_private_query_contract(
    store: &mut LiveScoreStore,
    first_id: &StableId,
    second_id: &StableId,
    start: ExactFraction,
    end: ExactFraction,
) {
    let _ = store.lookup_entity(first_id);
    let _ = store.lookup_owner(first_id);
    let _ = store.part_measure_content(first_id, second_id);
    let _ = store.exact_voice_start(first_id, start);
    let _ = store.overlapping_voice_range(first_id, start, end);
}

#[used]
static STAGE4_PRIVATE_QUERY_CONTRACT: fn(
    &mut LiveScoreStore,
    &StableId,
    &StableId,
    ExactFraction,
    ExactFraction,
) = stage4_private_query_contract;

pub(crate) fn build_live_score_store(
    document: &ScoreDocumentV1,
) -> Result<LiveScoreStore, LiveStoreBuildFailure> {
    build_live_score_store_with_policy(document, ReservationPolicy::production())
}

#[used]
static STAGE3_ATOMIC_STORE_BUILD: fn(
    &ScoreDocumentV1,
) -> Result<LiveScoreStore, LiveStoreBuildFailure> = build_live_score_store;

fn build_live_score_store_with_policy(
    document: &ScoreDocumentV1,
    policy: ReservationPolicy,
) -> Result<LiveScoreStore, LiveStoreBuildFailure> {
    let counts = StoreCounts::checked(document)?;
    let reference_capacities =
        ReferenceCapacityPlan::from_document(document, counts.reference_edges)
            .map_err(index_failure)?;
    let mut builder =
        LiveScoreStoreBuilder::prepare(document, counts, reference_capacities, policy)?;
    builder.import(document)?;
    builder.finish()
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
struct StoreCounts {
    entity_ids: usize,
    measures: usize,
    parts: usize,
    staffs: usize,
    contents: usize,
    voices: usize,
    events: usize,
    notes: usize,
    extensions: usize,
    reference_edges: usize,
}

impl StoreCounts {
    fn checked(document: &ScoreDocumentV1) -> Result<Self, LiveStoreBuildFailure> {
        let mut counts = Self {
            entity_ids: 1,
            measures: document.measure_definitions.len(),
            parts: document.parts.len(),
            staffs: 0,
            contents: 0,
            voices: 0,
            events: 0,
            notes: 0,
            extensions: document.extensions.len(),
            reference_edges: 0,
        };
        counts.entity_ids = counts
            .entity_ids
            .checked_add(counts.measures)
            .and_then(|value| value.checked_add(counts.parts))
            .ok_or(LiveStoreBuildFailure::InternalCapacity)?;
        for part in &document.parts {
            counts.staffs = checked_add(counts.staffs, part.staves.len())?;
            counts.contents = checked_add(counts.contents, part.measure_contents.len())?;
            counts.entity_ids = checked_add(counts.entity_ids, part.staves.len())?;
            for content in &part.measure_contents {
                counts.reference_edges = checked_add(counts.reference_edges, 1)?;
                counts.voices = checked_add(counts.voices, content.voices.len())?;
                counts.entity_ids = checked_add(counts.entity_ids, content.voices.len())?;
                for voice in &content.voices {
                    counts.reference_edges = checked_add(counts.reference_edges, 1)?;
                    counts.events = checked_add(counts.events, voice.sequence.events.len())?;
                    counts.entity_ids =
                        checked_add(counts.entity_ids, voice.sequence.events.len())?;
                    for event in &voice.sequence.events {
                        if event.staff_id.is_some() {
                            counts.reference_edges = checked_add(counts.reference_edges, 1)?;
                        }
                        if let RhythmicContentV1::Notes { notes } = &event.content {
                            counts.notes = checked_add(counts.notes, notes.len())?;
                            counts.entity_ids = checked_add(counts.entity_ids, notes.len())?;
                        }
                    }
                }
            }
        }
        for extension in &document.extensions {
            if matches!(extension.owner, ExtensionOwnerV1::Part { .. }) {
                counts.reference_edges = checked_add(counts.reference_edges, 1)?;
            }
        }
        Ok(counts)
    }
}

fn checked_add(left: usize, right: usize) -> Result<usize, LiveStoreBuildFailure> {
    left.checked_add(right)
        .ok_or(LiveStoreBuildFailure::InternalCapacity)
}

#[derive(Clone, Copy, Default)]
struct ReservationPolicy {
    #[cfg(test)]
    fail: bool,
}

impl ReservationPolicy {
    fn production() -> Self {
        Self::default()
    }

    #[cfg(test)]
    fn fail_all() -> Self {
        Self { fail: true }
    }

    fn slot_map<K: Key, V>(
        &self,
        values: &mut SlotMap<K, V>,
        additional: usize,
    ) -> Result<(), LiveStoreBuildFailure> {
        #[cfg(test)]
        if self.fail {
            return Err(LiveStoreBuildFailure::InternalCapacity);
        }
        values
            .try_reserve(additional)
            .map_err(|_| LiveStoreBuildFailure::InternalCapacity)
    }

    fn hash_map<K: Eq + Hash, V>(
        &self,
        values: &mut HashMap<K, V>,
        additional: usize,
    ) -> Result<(), LiveStoreBuildFailure> {
        #[cfg(test)]
        if self.fail {
            return Err(LiveStoreBuildFailure::InternalCapacity);
        }
        values
            .try_reserve(additional)
            .map_err(|_| LiveStoreBuildFailure::InternalCapacity)
    }

    fn hash_set<T: Eq + Hash>(
        &self,
        values: &mut HashSet<T>,
        additional: usize,
    ) -> Result<(), LiveStoreBuildFailure> {
        #[cfg(test)]
        if self.fail {
            return Err(LiveStoreBuildFailure::InternalCapacity);
        }
        values
            .try_reserve(additional)
            .map_err(|_| LiveStoreBuildFailure::InternalCapacity)
    }

    fn vector<T>(
        &self,
        values: &mut Vec<T>,
        additional: usize,
    ) -> Result<(), LiveStoreBuildFailure> {
        #[cfg(test)]
        if self.fail {
            return Err(LiveStoreBuildFailure::InternalCapacity);
        }
        values
            .try_reserve_exact(additional)
            .map_err(|_| LiveStoreBuildFailure::InternalCapacity)
    }
}

struct LiveScoreStoreBuilder {
    policy: ReservationPolicy,
    counts: StoreCounts,
    header: DocumentHeader,
    measures: SlotMap<MeasureHandle, MeasureRecord>,
    parts: SlotMap<PartHandle, PartRecord>,
    staffs: SlotMap<StaffHandle, StaffRecord>,
    voices: SlotMap<VoiceHandle, VoiceRecord>,
    events: SlotMap<EventHandle, EventRecord>,
    notes: SlotMap<NoteHandle, NoteRecord>,
    extensions: SlotMap<ExtensionHandle, ExtensionRecord>,
    topology: ScoreTopology,
    indices: DerivedIndices,
    reference_capacities: ReferenceCapacityPlan,
    metrics: Rkp2StoreMetrics,
}

impl LiveScoreStoreBuilder {
    fn prepare(
        document: &ScoreDocumentV1,
        counts: StoreCounts,
        reference_capacities: ReferenceCapacityPlan,
        policy: ReservationPolicy,
    ) -> Result<Self, LiveStoreBuildFailure> {
        let mut measures = SlotMap::with_key();
        let mut parts = SlotMap::with_key();
        let mut staffs = SlotMap::with_key();
        let mut voices = SlotMap::with_key();
        let mut events = SlotMap::with_key();
        let mut notes = SlotMap::with_key();
        let mut extensions = SlotMap::with_key();
        policy.slot_map(&mut measures, counts.measures)?;
        policy.slot_map(&mut parts, counts.parts)?;
        policy.slot_map(&mut staffs, counts.staffs)?;
        policy.slot_map(&mut voices, counts.voices)?;
        policy.slot_map(&mut events, counts.events)?;
        policy.slot_map(&mut notes, counts.notes)?;
        policy.slot_map(&mut extensions, counts.extensions)?;

        let mut topology = ScoreTopology::default();
        policy.vector(&mut topology.measure_order, counts.measures)?;
        policy.vector(&mut topology.part_order, counts.parts)?;
        policy.hash_map(&mut topology.staff_order, counts.parts)?;
        policy.hash_map(&mut topology.content_order, counts.parts)?;
        policy.hash_map(&mut topology.contents, counts.contents)?;
        policy.hash_map(&mut topology.voice_order, counts.contents)?;
        policy.hash_map(&mut topology.event_order, counts.voices)?;
        policy.hash_map(&mut topology.note_order, counts.events)?;
        policy.vector(&mut topology.extension_order, counts.extensions)?;

        let mut indices = DerivedIndices::with_capacities(IndexCapacities {
            entity_ids: counts.entity_ids,
            measures: counts.measures,
            parts: counts.parts,
            staffs: counts.staffs,
            voices: counts.voices,
            events: counts.events,
            notes: counts.notes,
            extensions: counts.extensions,
            reference_edges: counts.reference_edges,
        })
        .map_err(index_failure)?;
        let mut metrics = Rkp2StoreMetrics {
            entities_visited: 1,
            ..Rkp2StoreMetrics::default()
        };
        indices
            .insert_entity(
                &document.id,
                RuntimeEntityRef::Document,
                &mut metrics,
                false,
            )
            .map_err(index_failure)?;

        Ok(Self {
            policy,
            counts,
            header: DocumentHeader {
                id: document.id.clone(),
                metadata: document.metadata.clone(),
            },
            measures,
            parts,
            staffs,
            voices,
            events,
            notes,
            extensions,
            topology,
            indices,
            reference_capacities,
            metrics,
        })
    }

    fn import(&mut self, document: &ScoreDocumentV1) -> Result<(), LiveStoreBuildFailure> {
        self.import_measures(document)?;
        for (part_ordinal, part) in document.parts.iter().enumerate() {
            self.import_part(part_ordinal, part)?;
        }
        self.import_extensions(document)?;
        self.indices.sort_reference_buckets();
        Ok(())
    }

    fn import_measures(&mut self, document: &ScoreDocumentV1) -> Result<(), LiveStoreBuildFailure> {
        for measure in &document.measure_definitions {
            self.ensure_identity_available(&measure.id)?;
            let handle = self.measures.insert(MeasureRecord {
                id: measure.id.clone(),
                meter: measure.meter.clone(),
                pickup_duration: measure.pickup_duration.clone(),
            });
            increment(&mut self.metrics.entities_visited).map_err(index_failure)?;
            increment(&mut self.metrics.records_inserted_by_type.measures)
                .map_err(index_failure)?;
            self.indices
                .insert_entity(
                    &measure.id,
                    RuntimeEntityRef::Measure(handle),
                    &mut self.metrics,
                    false,
                )
                .map_err(index_failure)?;
            self.indices
                .insert_measure_owner(handle, &mut self.metrics, false)
                .map_err(index_failure)?;
            self.topology.measure_order.push(handle);
            increment(&mut self.metrics.topology_edges_visited).map_err(index_failure)?;
        }
        Ok(())
    }

    fn import_part(
        &mut self,
        part_ordinal: usize,
        part: &brilliant_score_foundation::PartV1,
    ) -> Result<(), LiveStoreBuildFailure> {
        self.ensure_identity_available(&part.id)?;
        let part_handle = self.parts.insert(PartRecord {
            id: part.id.clone(),
            name: part.name.clone(),
            instrument: part.instrument.clone(),
        });
        increment(&mut self.metrics.entities_visited).map_err(index_failure)?;
        increment(&mut self.metrics.records_inserted_by_type.parts).map_err(index_failure)?;
        self.indices
            .insert_entity(
                &part.id,
                RuntimeEntityRef::Part(part_handle),
                &mut self.metrics,
                false,
            )
            .map_err(index_failure)?;
        self.indices
            .insert_part_owner(part_handle, &mut self.metrics, false)
            .map_err(index_failure)?;
        self.topology.part_order.push(part_handle);
        increment(&mut self.metrics.topology_edges_visited).map_err(index_failure)?;

        let mut staff_order = Vec::new();
        self.policy.vector(&mut staff_order, part.staves.len())?;
        for staff in &part.staves {
            self.ensure_identity_available(&staff.id)?;
            let handle = self.staffs.insert(StaffRecord {
                id: staff.id.clone(),
                line_count: staff.line_count,
                default_clef: staff.default_clef.clone(),
            });
            increment(&mut self.metrics.entities_visited).map_err(index_failure)?;
            increment(&mut self.metrics.records_inserted_by_type.staffs).map_err(index_failure)?;
            self.indices
                .insert_entity(
                    &staff.id,
                    RuntimeEntityRef::Staff(handle),
                    &mut self.metrics,
                    false,
                )
                .map_err(index_failure)?;
            self.indices
                .insert_staff_owner(handle, part_handle, &mut self.metrics, false)
                .map_err(index_failure)?;
            staff_order.push(handle);
            increment(&mut self.metrics.topology_edges_visited).map_err(index_failure)?;
        }
        self.topology.staff_order.insert(part_handle, staff_order);

        let mut content_order = Vec::new();
        self.policy
            .vector(&mut content_order, part.measure_contents.len())?;
        for (content_ordinal, content) in part.measure_contents.iter().enumerate() {
            let measure = self
                .indices
                .lookup_entity(&content.measure_id, &mut self.metrics)
                .map_err(|_| LiveStoreBuildFailure::MissingMeasureReference)?;
            let RuntimeEntityRef::Measure(measure_handle) = measure else {
                return Err(LiveStoreBuildFailure::MissingMeasureReference);
            };
            let key = PartMeasureKey {
                part: part_handle,
                measure: measure_handle,
            };
            if self.topology.contents.contains_key(&key) {
                return Err(LiveStoreBuildFailure::DuplicatePartMeasureContent);
            }
            content_order.push(measure_handle);
            increment(&mut self.metrics.topology_edges_visited).map_err(index_failure)?;
            self.topology.contents.insert(
                key,
                PartMeasureContentRecord {
                    part: part_handle,
                    measure: measure_handle,
                },
            );
            mark_index_entry(&mut self.metrics, false).map_err(index_failure)?;
            self.indices
                .push_reference(
                    &content.measure_id,
                    measure_reference_path(part_ordinal, content_ordinal).map_err(index_failure)?,
                    &self.reference_capacities,
                    &mut self.metrics,
                    false,
                )
                .map_err(index_failure)?;

            let mut voice_order = Vec::new();
            self.policy.vector(&mut voice_order, content.voices.len())?;
            for (voice_ordinal, voice) in content.voices.iter().enumerate() {
                let staff = self
                    .indices
                    .lookup_entity(&voice.default_staff_id, &mut self.metrics)
                    .map_err(|_| LiveStoreBuildFailure::MissingStaffReference)?;
                let RuntimeEntityRef::Staff(staff) = staff else {
                    return Err(LiveStoreBuildFailure::MissingStaffReference);
                };
                self.indices
                    .check_staff_owner(staff, part_handle, &mut self.metrics)
                    .map_err(|_| LiveStoreBuildFailure::MissingStaffReference)?;
                self.ensure_identity_available(&voice.id)?;
                let voice_handle = self.voices.insert(VoiceRecord {
                    id: voice.id.clone(),
                    default_staff_id: voice.default_staff_id.clone(),
                    sequence_start: voice.sequence.start.clone(),
                });
                increment(&mut self.metrics.entities_visited).map_err(index_failure)?;
                increment(&mut self.metrics.records_inserted_by_type.voices)
                    .map_err(index_failure)?;
                self.indices
                    .insert_entity(
                        &voice.id,
                        RuntimeEntityRef::Voice(voice_handle),
                        &mut self.metrics,
                        false,
                    )
                    .map_err(index_failure)?;
                self.indices
                    .insert_voice_owner(voice_handle, key, &mut self.metrics, false)
                    .map_err(index_failure)?;
                self.indices
                    .push_reference(
                        &voice.default_staff_id,
                        voice_staff_reference_path(part_ordinal, content_ordinal, voice_ordinal)
                            .map_err(index_failure)?,
                        &self.reference_capacities,
                        &mut self.metrics,
                        false,
                    )
                    .map_err(index_failure)?;
                voice_order.push(voice_handle);
                increment(&mut self.metrics.topology_edges_visited).map_err(index_failure)?;

                let mut event_order = Vec::new();
                self.policy
                    .vector(&mut event_order, voice.sequence.events.len())?;
                let mut voice_time = VoiceTimeIndex::with_capacity(voice.sequence.events.len())
                    .map_err(time_failure)?;
                let mut event_start = ExactFraction::from_canonical(&voice.sequence.start)
                    .map_err(|_| local(StoreInvariantFailure::InvalidExactTime))?;
                for (event_ordinal, event) in voice.sequence.events.iter().enumerate() {
                    if let Some(staff_id) = &event.staff_id {
                        let staff = self
                            .indices
                            .lookup_entity(staff_id, &mut self.metrics)
                            .map_err(|_| LiveStoreBuildFailure::MissingStaffReference)?;
                        let RuntimeEntityRef::Staff(staff) = staff else {
                            return Err(LiveStoreBuildFailure::MissingStaffReference);
                        };
                        self.indices
                            .check_staff_owner(staff, part_handle, &mut self.metrics)
                            .map_err(|_| LiveStoreBuildFailure::MissingStaffReference)?;
                        self.indices
                            .push_reference(
                                staff_id,
                                event_staff_reference_path(
                                    part_ordinal,
                                    content_ordinal,
                                    voice_ordinal,
                                    event_ordinal,
                                )
                                .map_err(index_failure)?,
                                &self.reference_capacities,
                                &mut self.metrics,
                                false,
                            )
                            .map_err(index_failure)?;
                    }
                    self.ensure_identity_available(&event.id)?;
                    let content_kind = match &event.content {
                        RhythmicContentV1::Rest => EventContentKind::Rest,
                        RhythmicContentV1::Notes { .. } => EventContentKind::Notes,
                    };
                    let event_handle = self.events.insert(EventRecord {
                        id: event.id.clone(),
                        duration: event.duration.clone(),
                        staff_id: event.staff_id.clone(),
                        content_kind,
                    });
                    increment(&mut self.metrics.entities_visited).map_err(index_failure)?;
                    increment(&mut self.metrics.records_inserted_by_type.events)
                        .map_err(index_failure)?;
                    self.indices
                        .insert_entity(
                            &event.id,
                            RuntimeEntityRef::Event(event_handle),
                            &mut self.metrics,
                            false,
                        )
                        .map_err(index_failure)?;
                    self.indices
                        .insert_event_owner(event_handle, voice_handle, &mut self.metrics, false)
                        .map_err(index_failure)?;
                    event_order.push(event_handle);
                    increment(&mut self.metrics.topology_edges_visited).map_err(index_failure)?;

                    let duration = ExactFraction::note_value_duration(&event.duration)
                        .map_err(|_| local(StoreInvariantFailure::InvalidExactTime))?;
                    let event_end = event_start
                        .checked_add(duration)
                        .map_err(|_| local(StoreInvariantFailure::InvalidExactTime))?;
                    voice_time
                        .push(
                            event_start,
                            event_end,
                            u32::try_from(event_ordinal)
                                .map_err(|_| local(StoreInvariantFailure::IndexMismatch))?,
                            event_handle,
                        )
                        .map_err(time_failure)?;
                    increment(&mut self.metrics.time_entries_built).map_err(index_failure)?;
                    mark_index_entry(&mut self.metrics, false).map_err(index_failure)?;
                    event_start = event_end;

                    let note_count = match &event.content {
                        RhythmicContentV1::Rest => 0,
                        RhythmicContentV1::Notes { notes } => notes.len(),
                    };
                    let mut note_order = Vec::new();
                    self.policy.vector(&mut note_order, note_count)?;
                    if let RhythmicContentV1::Notes { notes } = &event.content {
                        for note in notes {
                            self.ensure_identity_available(&note.id)?;
                            let note_handle = self.notes.insert(NoteRecord {
                                id: note.id.clone(),
                                written_pitch: note.written_pitch.clone(),
                            });
                            increment(&mut self.metrics.entities_visited).map_err(index_failure)?;
                            increment(&mut self.metrics.records_inserted_by_type.notes)
                                .map_err(index_failure)?;
                            self.indices
                                .insert_entity(
                                    &note.id,
                                    RuntimeEntityRef::Note(note_handle),
                                    &mut self.metrics,
                                    false,
                                )
                                .map_err(index_failure)?;
                            self.indices
                                .insert_note_owner(
                                    note_handle,
                                    event_handle,
                                    &mut self.metrics,
                                    false,
                                )
                                .map_err(index_failure)?;
                            note_order.push(note_handle);
                            increment(&mut self.metrics.topology_edges_visited)
                                .map_err(index_failure)?;
                        }
                    }
                    self.topology.note_order.insert(event_handle, note_order);
                }
                self.indices
                    .insert_voice_time(voice_handle, voice_time, &mut self.metrics, false)
                    .map_err(index_failure)?;
                self.topology.event_order.insert(voice_handle, event_order);
            }
            self.topology.voice_order.insert(key, voice_order);
        }
        self.topology
            .content_order
            .insert(part_handle, content_order);
        Ok(())
    }

    fn import_extensions(
        &mut self,
        document: &ScoreDocumentV1,
    ) -> Result<(), LiveStoreBuildFailure> {
        for (extension_ordinal, extension) in document.extensions.iter().enumerate() {
            let owner = match &extension.owner {
                ExtensionOwnerV1::Score => ExtensionIndexOwner::Score,
                ExtensionOwnerV1::Part { part_id } => {
                    let entity = self
                        .indices
                        .lookup_entity(part_id, &mut self.metrics)
                        .map_err(|_| LiveStoreBuildFailure::MissingPartReference)?;
                    let RuntimeEntityRef::Part(part) = entity else {
                        return Err(LiveStoreBuildFailure::MissingPartReference);
                    };
                    self.indices
                        .push_reference(
                            part_id,
                            extension_part_reference_path(extension_ordinal)
                                .map_err(index_failure)?,
                            &self.reference_capacities,
                            &mut self.metrics,
                            false,
                        )
                        .map_err(index_failure)?;
                    ExtensionIndexOwner::Part(part)
                }
            };
            let handle = self.extensions.insert(ExtensionRecord {
                namespace: extension.namespace.clone(),
                schema_version: extension.schema_version,
                owner: extension.owner.clone(),
                payload: extension.payload.clone(),
            });
            increment(&mut self.metrics.records_inserted_by_type.extensions)
                .map_err(index_failure)?;
            self.indices
                .insert_extension_owner(handle, owner, &mut self.metrics, false)
                .map_err(index_failure)?;
            self.indices
                .push_extension(
                    ExtensionIndexKey {
                        namespace: extension.namespace.clone(),
                        owner,
                    },
                    handle,
                    &mut self.metrics,
                    false,
                )
                .map_err(index_failure)?;
            self.topology.extension_order.push(handle);
            increment(&mut self.metrics.topology_edges_visited).map_err(index_failure)?;
        }
        Ok(())
    }

    fn ensure_identity_available(&self, id: &StableId) -> Result<(), LiveStoreBuildFailure> {
        if self.indices.entity.by_id.contains_key(id) {
            Err(LiveStoreBuildFailure::DuplicateStableId)
        } else {
            Ok(())
        }
    }

    fn finish(self) -> Result<LiveScoreStore, LiveStoreBuildFailure> {
        self.check_local_invariants()?;
        Ok(LiveScoreStore {
            header: self.header,
            measures: self.measures,
            parts: self.parts,
            staffs: self.staffs,
            voices: self.voices,
            events: self.events,
            notes: self.notes,
            extensions: self.extensions,
            topology: self.topology,
            indices: self.indices,
            metrics: self.metrics,
        })
    }

    fn check_local_invariants(&self) -> Result<(), LiveStoreBuildFailure> {
        check_root_order(
            &self.topology.measure_order,
            &self.measures,
            self.counts.measures,
            self.policy,
        )?;
        check_root_order(
            &self.topology.part_order,
            &self.parts,
            self.counts.parts,
            self.policy,
        )?;

        let mut seen_staffs = HashSet::new();
        let mut seen_voices = HashSet::new();
        let mut seen_events = HashSet::new();
        let mut seen_notes = HashSet::new();
        self.policy.hash_set(&mut seen_staffs, self.counts.staffs)?;
        self.policy.hash_set(&mut seen_voices, self.counts.voices)?;
        self.policy.hash_set(&mut seen_events, self.counts.events)?;
        self.policy.hash_set(&mut seen_notes, self.counts.notes)?;

        let mut content_count = 0_usize;
        for part in &self.topology.part_order {
            let staff_order = self
                .topology
                .staff_order
                .get(part)
                .ok_or(local(StoreInvariantFailure::MissingRecord))?;
            for staff in staff_order {
                if self.staffs.get(*staff).is_none() {
                    return Err(local(StoreInvariantFailure::MissingRecord));
                }
                if !seen_staffs.insert(*staff) {
                    return Err(local(StoreInvariantFailure::DuplicateSemanticPosition));
                }
            }

            let content_order = self
                .topology
                .content_order
                .get(part)
                .ok_or(local(StoreInvariantFailure::MissingRecord))?;
            if content_order.len() != self.topology.measure_order.len() {
                return Err(local(StoreInvariantFailure::CoverageMismatch));
            }
            let mut covered_measures = HashSet::new();
            self.policy
                .hash_set(&mut covered_measures, self.counts.measures)?;
            for measure in content_order {
                if self.measures.get(*measure).is_none() || !covered_measures.insert(*measure) {
                    return Err(local(StoreInvariantFailure::CoverageMismatch));
                }
                let key = PartMeasureKey {
                    part: *part,
                    measure: *measure,
                };
                let content = self
                    .topology
                    .contents
                    .get(&key)
                    .ok_or(local(StoreInvariantFailure::MissingRecord))?;
                if content.part != *part || content.measure != *measure {
                    return Err(local(StoreInvariantFailure::ContentRecordMismatch));
                }
                content_count = checked_add(content_count, 1)?;
                let voices = self
                    .topology
                    .voice_order
                    .get(&key)
                    .ok_or(local(StoreInvariantFailure::MissingRecord))?;
                for voice in voices {
                    if self.voices.get(*voice).is_none() {
                        return Err(local(StoreInvariantFailure::MissingRecord));
                    }
                    if !seen_voices.insert(*voice) {
                        return Err(local(StoreInvariantFailure::DuplicateSemanticPosition));
                    }
                    let events = self
                        .topology
                        .event_order
                        .get(voice)
                        .ok_or(local(StoreInvariantFailure::MissingRecord))?;
                    for event in events {
                        let event_record = self
                            .events
                            .get(*event)
                            .ok_or(local(StoreInvariantFailure::MissingRecord))?;
                        if !seen_events.insert(*event) {
                            return Err(local(StoreInvariantFailure::DuplicateSemanticPosition));
                        }
                        let notes = self
                            .topology
                            .note_order
                            .get(event)
                            .ok_or(local(StoreInvariantFailure::MissingRecord))?;
                        if matches!(event_record.content_kind, EventContentKind::Rest)
                            && !notes.is_empty()
                        {
                            return Err(local(StoreInvariantFailure::ContentRecordMismatch));
                        }
                        if matches!(event_record.content_kind, EventContentKind::Notes)
                            && notes.is_empty()
                        {
                            return Err(local(StoreInvariantFailure::ContentRecordMismatch));
                        }
                        for note in notes {
                            if self.notes.get(*note).is_none() {
                                return Err(local(StoreInvariantFailure::MissingRecord));
                            }
                            if !seen_notes.insert(*note) {
                                return Err(local(
                                    StoreInvariantFailure::DuplicateSemanticPosition,
                                ));
                            }
                        }
                    }
                }
            }
        }

        check_count(seen_staffs.len(), self.counts.staffs)?;
        check_count(seen_voices.len(), self.counts.voices)?;
        check_count(seen_events.len(), self.counts.events)?;
        check_count(seen_notes.len(), self.counts.notes)?;
        check_count(content_count, self.counts.contents)?;
        check_count(self.topology.staff_order.len(), self.counts.parts)?;
        check_count(self.topology.content_order.len(), self.counts.parts)?;
        check_count(self.topology.contents.len(), self.counts.contents)?;
        check_count(self.topology.voice_order.len(), self.counts.contents)?;
        check_count(self.topology.event_order.len(), self.counts.voices)?;
        check_count(self.topology.note_order.len(), self.counts.events)?;
        check_count(self.indices.entity.by_id.len(), self.counts.entity_ids)?;
        check_count(self.indices.ownership.measures.len(), self.counts.measures)?;
        check_count(self.indices.ownership.parts.len(), self.counts.parts)?;
        check_count(self.indices.ownership.staffs.len(), self.counts.staffs)?;
        check_count(self.indices.ownership.voices.len(), self.counts.voices)?;
        check_count(self.indices.ownership.events.len(), self.counts.events)?;
        check_count(self.indices.ownership.notes.len(), self.counts.notes)?;
        check_count(
            self.indices.ownership.extensions.len(),
            self.counts.extensions,
        )?;
        check_count(self.indices.voice_time.len(), self.counts.voices)?;
        check_count(reference_count(&self.indices)?, self.counts.reference_edges)?;
        check_count(
            extension_index_count(&self.indices)?,
            self.counts.extensions,
        )?;

        self.check_derived_index_invariants()?;

        check_root_order(
            &self.topology.extension_order,
            &self.extensions,
            self.counts.extensions,
            self.policy,
        )
    }

    fn check_derived_index_invariants(&self) -> Result<(), LiveStoreBuildFailure> {
        if self.indices.entity.by_id.get(&self.header.id) != Some(&RuntimeEntityRef::Document) {
            return Err(local(StoreInvariantFailure::IndexMismatch));
        }
        for measure in &self.topology.measure_order {
            let record = self
                .measures
                .get(*measure)
                .ok_or(local(StoreInvariantFailure::MissingRecord))?;
            if self.indices.entity.by_id.get(&record.id)
                != Some(&RuntimeEntityRef::Measure(*measure))
                || !self.indices.ownership.measures.contains_key(measure)
            {
                return Err(local(StoreInvariantFailure::IndexMismatch));
            }
        }
        for (part_ordinal, part) in self.topology.part_order.iter().enumerate() {
            let part_record = self
                .parts
                .get(*part)
                .ok_or(local(StoreInvariantFailure::MissingRecord))?;
            if self.indices.entity.by_id.get(&part_record.id)
                != Some(&RuntimeEntityRef::Part(*part))
                || !self.indices.ownership.parts.contains_key(part)
            {
                return Err(local(StoreInvariantFailure::IndexMismatch));
            }
            for staff in self
                .topology
                .staff_order
                .get(part)
                .ok_or(local(StoreInvariantFailure::MissingRecord))?
            {
                let record = self
                    .staffs
                    .get(*staff)
                    .ok_or(local(StoreInvariantFailure::MissingRecord))?;
                if self.indices.entity.by_id.get(&record.id)
                    != Some(&RuntimeEntityRef::Staff(*staff))
                    || self.indices.ownership.staffs.get(staff) != Some(part)
                {
                    return Err(local(StoreInvariantFailure::IndexMismatch));
                }
            }
            for (content_ordinal, measure) in self
                .topology
                .content_order
                .get(part)
                .ok_or(local(StoreInvariantFailure::MissingRecord))?
                .iter()
                .enumerate()
            {
                let measure_record = self
                    .measures
                    .get(*measure)
                    .ok_or(local(StoreInvariantFailure::MissingRecord))?;
                check_reference(
                    &self.indices,
                    &measure_record.id,
                    &measure_reference_path(part_ordinal, content_ordinal)
                        .map_err(index_failure)?,
                )?;
                let key = PartMeasureKey {
                    part: *part,
                    measure: *measure,
                };
                for (voice_ordinal, voice) in self
                    .topology
                    .voice_order
                    .get(&key)
                    .ok_or(local(StoreInvariantFailure::MissingRecord))?
                    .iter()
                    .enumerate()
                {
                    let voice_record = self
                        .voices
                        .get(*voice)
                        .ok_or(local(StoreInvariantFailure::MissingRecord))?;
                    if self.indices.entity.by_id.get(&voice_record.id)
                        != Some(&RuntimeEntityRef::Voice(*voice))
                        || self.indices.ownership.voices.get(voice) != Some(&key)
                    {
                        return Err(local(StoreInvariantFailure::IndexMismatch));
                    }
                    check_reference(
                        &self.indices,
                        &voice_record.default_staff_id,
                        &voice_staff_reference_path(part_ordinal, content_ordinal, voice_ordinal)
                            .map_err(index_failure)?,
                    )?;
                    let events = self
                        .topology
                        .event_order
                        .get(voice)
                        .ok_or(local(StoreInvariantFailure::MissingRecord))?;
                    let time = self
                        .indices
                        .voice_time
                        .get(voice)
                        .ok_or(local(StoreInvariantFailure::IndexMismatch))?;
                    if time.entries.len() != events.len() {
                        return Err(local(StoreInvariantFailure::IndexMismatch));
                    }
                    let mut expected_start =
                        ExactFraction::from_canonical(&voice_record.sequence_start)
                            .map_err(|_| local(StoreInvariantFailure::InvalidExactTime))?;
                    for (event_ordinal, (event, entry)) in
                        events.iter().zip(&time.entries).enumerate()
                    {
                        let event_record = self
                            .events
                            .get(*event)
                            .ok_or(local(StoreInvariantFailure::MissingRecord))?;
                        let duration =
                            ExactFraction::note_value_duration(&event_record.duration)
                                .map_err(|_| local(StoreInvariantFailure::InvalidExactTime))?;
                        let expected_end = expected_start
                            .checked_add(duration)
                            .map_err(|_| local(StoreInvariantFailure::InvalidExactTime))?;
                        if entry
                            != &(VoiceTimeEntry {
                                start: expected_start,
                                end: expected_end,
                                semantic_ordinal: u32::try_from(event_ordinal)
                                    .map_err(|_| local(StoreInvariantFailure::IndexMismatch))?,
                                event: *event,
                            })
                            || self.indices.entity.by_id.get(&event_record.id)
                                != Some(&RuntimeEntityRef::Event(*event))
                            || self.indices.ownership.events.get(event) != Some(voice)
                        {
                            return Err(local(StoreInvariantFailure::IndexMismatch));
                        }
                        if let Some(staff_id) = &event_record.staff_id {
                            check_reference(
                                &self.indices,
                                staff_id,
                                &event_staff_reference_path(
                                    part_ordinal,
                                    content_ordinal,
                                    voice_ordinal,
                                    event_ordinal,
                                )
                                .map_err(index_failure)?,
                            )?;
                        }
                        for note in self
                            .topology
                            .note_order
                            .get(event)
                            .ok_or(local(StoreInvariantFailure::MissingRecord))?
                        {
                            let record = self
                                .notes
                                .get(*note)
                                .ok_or(local(StoreInvariantFailure::MissingRecord))?;
                            if self.indices.entity.by_id.get(&record.id)
                                != Some(&RuntimeEntityRef::Note(*note))
                                || self.indices.ownership.notes.get(note) != Some(event)
                            {
                                return Err(local(StoreInvariantFailure::IndexMismatch));
                            }
                        }
                        expected_start = expected_end;
                    }
                }
            }
        }

        for (ordinal, extension) in self.topology.extension_order.iter().enumerate() {
            let record = self
                .extensions
                .get(*extension)
                .ok_or(local(StoreInvariantFailure::MissingRecord))?;
            let owner = *self
                .indices
                .ownership
                .extensions
                .get(extension)
                .ok_or(local(StoreInvariantFailure::IndexMismatch))?;
            let expected_owner = match &record.owner {
                ExtensionOwnerV1::Score => ExtensionIndexOwner::Score,
                ExtensionOwnerV1::Part { part_id } => {
                    let Some(RuntimeEntityRef::Part(part)) =
                        self.indices.entity.by_id.get(part_id).copied()
                    else {
                        return Err(local(StoreInvariantFailure::IndexMismatch));
                    };
                    ExtensionIndexOwner::Part(part)
                }
            };
            if owner != expected_owner {
                return Err(local(StoreInvariantFailure::IndexMismatch));
            }
            let key = ExtensionIndexKey {
                namespace: record.namespace.clone(),
                owner,
            };
            if self.indices.extensions.by_key.get(&key).map(Vec::as_slice)
                != Some([*extension].as_slice())
            {
                return Err(local(StoreInvariantFailure::IndexMismatch));
            }
            if let ExtensionOwnerV1::Part { part_id } = &record.owner {
                check_reference(
                    &self.indices,
                    part_id,
                    &extension_part_reference_path(ordinal).map_err(index_failure)?,
                )?;
            }
        }
        Ok(())
    }
}

fn index_failure(failure: IndexBuildFailure) -> LiveStoreBuildFailure {
    match failure {
        IndexBuildFailure::Capacity => LiveStoreBuildFailure::InternalCapacity,
        IndexBuildFailure::InvalidExactTime => local(StoreInvariantFailure::InvalidExactTime),
        IndexBuildFailure::DuplicateEntry
        | IndexBuildFailure::MissingRecord
        | IndexBuildFailure::CountOverflow
        | IndexBuildFailure::ParityMismatch => local(StoreInvariantFailure::IndexMismatch),
    }
}

fn time_failure(failure: TimeIndexFailure) -> LiveStoreBuildFailure {
    match failure {
        TimeIndexFailure::Capacity => LiveStoreBuildFailure::InternalCapacity,
        TimeIndexFailure::InvalidExactTime
        | TimeIndexFailure::OverlapOrOrder
        | TimeIndexFailure::EmptyOrReversedRange
        | TimeIndexFailure::MissingVoice
        | TimeIndexFailure::CounterOverflow => local(StoreInvariantFailure::InvalidExactTime),
    }
}

fn reference_count(indices: &DerivedIndices) -> Result<usize, LiveStoreBuildFailure> {
    indices
        .references
        .by_target
        .values()
        .try_fold(0_usize, |total, values| checked_add(total, values.len()))
}

fn extension_index_count(indices: &DerivedIndices) -> Result<usize, LiveStoreBuildFailure> {
    indices
        .extensions
        .by_key
        .values()
        .try_fold(0_usize, |total, values| checked_add(total, values.len()))
}

fn check_reference(
    indices: &DerivedIndices,
    target: &StableId,
    address: &crate::indices::StableReferenceAddress,
) -> Result<(), LiveStoreBuildFailure> {
    if indices.contains_reference(target, address) {
        Ok(())
    } else {
        Err(local(StoreInvariantFailure::IndexMismatch))
    }
}

fn check_root_order<K, V>(
    order: &[K],
    records: &SlotMap<K, V>,
    expected: usize,
    policy: ReservationPolicy,
) -> Result<(), LiveStoreBuildFailure>
where
    K: Key + Eq + Hash,
{
    if order.len() != expected || records.len() != expected {
        return Err(local(StoreInvariantFailure::CountMismatch));
    }
    let mut seen = HashSet::new();
    policy.hash_set(&mut seen, expected)?;
    for handle in order {
        if records.get(*handle).is_none() {
            return Err(local(StoreInvariantFailure::MissingRecord));
        }
        if !seen.insert(*handle) {
            return Err(local(StoreInvariantFailure::DuplicateSemanticPosition));
        }
    }
    Ok(())
}

fn check_count(actual: usize, expected: usize) -> Result<(), LiveStoreBuildFailure> {
    if actual == expected {
        Ok(())
    } else {
        Err(local(StoreInvariantFailure::CountMismatch))
    }
}

const fn local(failure: StoreInvariantFailure) -> LiveStoreBuildFailure {
    LiveStoreBuildFailure::LocalInvariant(failure)
}

#[cfg(test)]
pub(crate) mod tests {
    use std::{any::TypeId, collections::HashSet};

    use brilliant_kernel_contracts::decode_create_request;

    use super::*;

    const STORE_REQUEST: &str = r#"{"apiVersion":1,"document":{"schemaVersion":"brilliant-score-1","id":"score-root","metadata":{"title":"Store","authors":["Brilliant"],"tempo":{"bpm":120}},"measureDefinitions":[{"id":"measure-z","meter":{"numerator":4,"denominator":4}},{"id":"measure-a","meter":{"numerator":4,"denominator":4}}],"parts":[{"id":"part-z","name":"Part","instrument":{"name":"Piano","writtenToSounding":{"diatonicSteps":0,"chromaticSemitones":0}},"staves":[{"id":"staff-z","lineCount":5,"defaultClef":{"sign":"G","line":2}},{"id":"staff-a","lineCount":5,"defaultClef":{"sign":"F","line":4}}],"measureContents":[{"measureId":"measure-a","voices":[{"id":"voice-a","defaultStaffId":"staff-a","sequence":{"start":{"numerator":0,"denominator":1},"events":[{"id":"event-a","duration":{"base":1,"dots":0},"staffId":"staff-a","content":{"kind":"notes","notes":[{"id":"note-a","writtenPitch":{"step":"C","alter":0,"octave":4}}]}}]}}]},{"measureId":"measure-z","voices":[{"id":"voice-z","defaultStaffId":"staff-z","sequence":{"start":{"numerator":0,"denominator":1},"events":[{"id":"event-z","duration":{"base":1,"dots":0},"content":{"kind":"rest"}}]}}]}]}],"extensions":[{"namespace":"example.score","schemaVersion":1,"owner":{"kind":"score"},"payload":{"z":1}},{"namespace":"example.second","schemaVersion":2,"owner":{"kind":"score"},"payload":{"a":[true,null]}}]}}"#;

    pub(crate) fn fixture() -> ScoreDocumentV1 {
        decode_create_request(STORE_REQUEST.as_bytes())
            .expect("valid Stage 2 document")
            .document
    }

    fn ids_for_order<K: Key, V>(
        order: &[K],
        records: &SlotMap<K, V>,
        id: impl Fn(&V) -> &StableId,
    ) -> Vec<String> {
        order
            .iter()
            .map(|handle| {
                id(records.get(*handle).expect("live typed handle"))
                    .as_str()
                    .to_owned()
            })
            .collect()
    }

    #[test]
    fn store_build_registers_document_root_before_all_entities_and_publishes_atomically() {
        let document = fixture();
        let counts = StoreCounts::checked(&document).expect("checked counts");
        assert_eq!(counts.entity_ids, 11);
        let references = ReferenceCapacityPlan::from_document(&document, counts.reference_edges)
            .expect("reference capacities");
        let mut builder = LiveScoreStoreBuilder::prepare(
            &document,
            counts,
            references,
            ReservationPolicy::production(),
        )
        .expect("reserved builder");
        builder.import(&document).expect("canonical import");
        assert_eq!(
            builder.indices.entity.by_id.get(&document.id),
            Some(&RuntimeEntityRef::Document)
        );
        assert_eq!(builder.indices.entity.by_id.len(), counts.entity_ids);
        let store = builder.finish().expect("publishable store");
        assert_eq!(store.header.id.as_str(), "score-root");
        assert_eq!(store.measures.len(), 2);
        assert_eq!(store.parts.len(), 1);
        assert_eq!(store.staffs.len(), 2);
        assert_eq!(store.voices.len(), 2);
        assert_eq!(store.events.len(), 2);
        assert_eq!(store.notes.len(), 1);
        assert_eq!(store.extensions.len(), 2);
    }

    #[test]
    fn topology_preserves_canonical_dto_order_and_exact_part_measure_coverage() {
        let store = build_live_score_store(&fixture()).expect("store");
        assert_eq!(
            ids_for_order(&store.topology.measure_order, &store.measures, |record| {
                &record.id
            }),
            ["measure-z", "measure-a"]
        );
        assert_eq!(
            ids_for_order(&store.topology.part_order, &store.parts, |record| &record
                .id),
            ["part-z"]
        );
        let part = store.topology.part_order[0];
        assert_eq!(
            ids_for_order(
                store.topology.staff_order.get(&part).expect("staff order"),
                &store.staffs,
                |record| &record.id,
            ),
            ["staff-z", "staff-a"]
        );
        assert_eq!(
            ids_for_order(
                store
                    .topology
                    .content_order
                    .get(&part)
                    .expect("content order"),
                &store.measures,
                |record| &record.id,
            ),
            ["measure-a", "measure-z"]
        );
        assert_eq!(store.topology.contents.len(), 2);
        for measure in &store.topology.measure_order {
            let key = PartMeasureKey {
                part,
                measure: *measure,
            };
            assert_eq!(
                store.topology.contents.get(&key),
                Some(&PartMeasureContentRecord {
                    part,
                    measure: *measure,
                })
            );
        }
    }

    #[test]
    fn every_typed_record_resolves_once_without_retaining_the_document_tree() {
        let mut document = fixture();
        let store = build_live_score_store(&document).expect("store");
        let source = include_str!("store.rs").replace("\r\n", "\n");
        let declaration = source
            .split("pub(crate) struct LiveScoreStore {")
            .nth(1)
            .expect("store declaration")
            .split("}\n\n")
            .next()
            .expect("store fields");
        assert!(!declaration.contains("ScoreDocumentV1"));

        document.id = StableId::new("mutated-source").expect("id");
        document.measure_definitions.clear();
        document.parts.clear();
        document.extensions.clear();
        assert_eq!(store.header.id.as_str(), "score-root");
        assert_eq!(store.topology.measure_order.len(), 2);
        assert_eq!(store.topology.part_order.len(), 1);
        assert_eq!(store.topology.extension_order.len(), 2);
    }

    #[test]
    fn stale_generation_is_rejected_and_key_types_are_nominally_distinct() {
        let mut store = build_live_score_store(&fixture()).expect("store");
        let part = store.topology.part_order[0];
        let measure = store.topology.content_order[&part][0];
        let content = PartMeasureKey { part, measure };
        let voice = store.topology.voice_order[&content][0];
        let event = store.topology.event_order[&voice][0];
        let old_note = store
            .topology
            .note_order
            .get(&event)
            .and_then(|notes| notes.first())
            .copied()
            .expect("note");
        let record = store.notes.remove(old_note).expect("remove live note");
        let new_note = store.notes.insert(record);
        assert_ne!(old_note, new_note);
        assert!(store.notes.get(old_note).is_none());
        assert!(store.notes.get(new_note).is_some());

        let type_ids = HashSet::from([
            TypeId::of::<MeasureHandle>(),
            TypeId::of::<PartHandle>(),
            TypeId::of::<StaffHandle>(),
            TypeId::of::<VoiceHandle>(),
            TypeId::of::<EventHandle>(),
            TypeId::of::<NoteHandle>(),
            TypeId::of::<ExtensionHandle>(),
        ]);
        assert_eq!(type_ids.len(), 7);
    }

    #[test]
    fn runtime_reserve_fault_returns_internal_capacity_without_store_publication() {
        let document = fixture();
        let result = build_live_score_store_with_policy(&document, ReservationPolicy::fail_all());
        assert!(matches!(
            result,
            Err(LiveStoreBuildFailure::InternalCapacity)
        ));
    }

    #[test]
    fn export_uses_canonical_topology_and_preserves_optional_and_extension_values() {
        let mut document = fixture();
        document.measure_definitions[1].pickup_duration =
            Some(brilliant_score_foundation::FractionV1 {
                numerator: brilliant_core_types::SafeInteger::new(1).expect("safe integer"),
                denominator: brilliant_core_types::SafeInteger::new(1).expect("safe integer"),
            });
        document.parts[0].measure_contents[0].voices[0]
            .sequence
            .events[0]
            .duration
            .time_modification = Some(brilliant_score_foundation::TimeModificationV1 {
            actual_notes: brilliant_core_types::SafeInteger::new(1).expect("safe integer"),
            normal_notes: brilliant_core_types::SafeInteger::new(1).expect("safe integer"),
        });

        let store = build_live_score_store(&document).expect("store");
        let exported = store.export_document().expect("canonical export");
        assert_eq!(exported, document);
        assert_eq!(exported.measure_definitions[0].id.as_str(), "measure-z");
        assert_eq!(
            exported.parts[0].measure_contents[0].measure_id.as_str(),
            "measure-a"
        );
        assert_eq!(exported.extensions[0].namespace, "example.score");
    }
}
