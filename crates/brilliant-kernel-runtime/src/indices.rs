use std::collections::HashMap;

use brilliant_core_types::{StableId, StablePathSegmentV1, StablePathV1};
use brilliant_score_foundation::{ExactFraction, ExtensionOwnerV1, ScoreDocumentV1};

use crate::{
    change_set::{ReferenceAddressV1, StableExtensionOwnerV1},
    handles::{
        EventHandle, ExtensionHandle, MeasureHandle, NoteHandle, PartHandle, RuntimeEntityRef,
        StaffHandle, VoiceHandle,
    },
    records::PartMeasureKey,
    store::LiveScoreStore,
    time_index::{TimeIndexFailure, VoiceTimeIndex},
};

#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
pub(crate) enum ExtensionIndexOwner {
    Score,
    Part(PartHandle),
}

#[derive(Clone, Debug, Eq, Hash, PartialEq)]
pub(crate) struct ExtensionIndexKey {
    pub(crate) namespace: String,
    pub(crate) owner: ExtensionIndexOwner,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct StableReferenceAddress {
    pub(crate) path: StablePathV1,
    pub(crate) source: ReferenceAddressV1,
    sort_key: String,
}

#[derive(Clone, Debug, Default)]
pub(crate) struct EntityIndex {
    pub(crate) by_id: HashMap<StableId, RuntimeEntityRef>,
}

#[derive(Clone, Debug, Default)]
pub(crate) struct OwnershipIndex {
    pub(crate) measures: HashMap<MeasureHandle, ()>,
    pub(crate) parts: HashMap<PartHandle, ()>,
    pub(crate) staffs: HashMap<StaffHandle, PartHandle>,
    pub(crate) voices: HashMap<VoiceHandle, PartMeasureKey>,
    pub(crate) events: HashMap<EventHandle, VoiceHandle>,
    pub(crate) notes: HashMap<NoteHandle, EventHandle>,
    pub(crate) extensions: HashMap<ExtensionHandle, ExtensionIndexOwner>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum RuntimeOwnerRef {
    Document,
    Part(PartHandle),
    PartMeasure(PartMeasureKey),
    Voice(VoiceHandle),
    Event(EventHandle),
}

#[derive(Clone, Debug, Default)]
pub(crate) struct ExtensionIndex {
    pub(crate) by_key: HashMap<ExtensionIndexKey, Vec<ExtensionHandle>>,
}

#[derive(Clone, Debug, Default)]
pub(crate) struct ReferenceDependencyIndex {
    pub(crate) by_target: HashMap<StableId, Vec<StableReferenceAddress>>,
}

#[derive(Clone, Debug, Default)]
pub(crate) struct DerivedIndices {
    pub(crate) entity: EntityIndex,
    pub(crate) ownership: OwnershipIndex,
    pub(crate) voice_time: HashMap<VoiceHandle, VoiceTimeIndex>,
    pub(crate) extensions: ExtensionIndex,
    pub(crate) references: ReferenceDependencyIndex,
}

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub(crate) struct RecordsInsertedByType {
    pub(crate) measures: usize,
    pub(crate) parts: usize,
    pub(crate) staffs: usize,
    pub(crate) voices: usize,
    pub(crate) events: usize,
    pub(crate) notes: usize,
    pub(crate) extensions: usize,
}

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub(crate) struct Rkp2StoreMetrics {
    pub(crate) entities_visited: usize,
    pub(crate) records_inserted_by_type: RecordsInsertedByType,
    pub(crate) topology_edges_visited: usize,
    pub(crate) reference_edges_built: usize,
    pub(crate) time_entries_built: usize,
    pub(crate) entity_index_lookups: usize,
    pub(crate) owner_index_lookups: usize,
    pub(crate) time_index_comparisons: usize,
    pub(crate) index_entries_built: usize,
    pub(crate) index_rebuild_entries: usize,
    pub(crate) full_document_materializations: usize,
    pub(crate) canonical_encode_bytes: usize,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum IndexBuildFailure {
    Capacity,
    DuplicateEntry,
    MissingRecord,
    InvalidExactTime,
    CountOverflow,
    ParityMismatch,
}

impl From<TimeIndexFailure> for IndexBuildFailure {
    fn from(value: TimeIndexFailure) -> Self {
        match value {
            TimeIndexFailure::Capacity => Self::Capacity,
            TimeIndexFailure::CounterOverflow => Self::CountOverflow,
            TimeIndexFailure::InvalidExactTime
            | TimeIndexFailure::OverlapOrOrder
            | TimeIndexFailure::EmptyOrReversedRange
            | TimeIndexFailure::MissingVoice => Self::InvalidExactTime,
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) struct IndexCapacities {
    pub(crate) entity_ids: usize,
    pub(crate) measures: usize,
    pub(crate) parts: usize,
    pub(crate) staffs: usize,
    pub(crate) voices: usize,
    pub(crate) events: usize,
    pub(crate) notes: usize,
    pub(crate) extensions: usize,
    pub(crate) reference_edges: usize,
}

#[derive(Debug, Default)]
pub(crate) struct ReferenceCapacityPlan {
    by_target: HashMap<StableId, usize>,
}

impl ReferenceCapacityPlan {
    pub(crate) fn from_document(
        document: &ScoreDocumentV1,
        total_edges: usize,
    ) -> Result<Self, IndexBuildFailure> {
        let mut plan = Self::default();
        plan.by_target
            .try_reserve(total_edges)
            .map_err(|_| IndexBuildFailure::Capacity)?;
        for part in &document.parts {
            for content in &part.measure_contents {
                plan.increment(&content.measure_id)?;
                for voice in &content.voices {
                    plan.increment(&voice.default_staff_id)?;
                    for event in &voice.sequence.events {
                        if let Some(staff_id) = &event.staff_id {
                            plan.increment(staff_id)?;
                        }
                    }
                }
            }
        }
        for extension in &document.extensions {
            if let ExtensionOwnerV1::Part { part_id } = &extension.owner {
                plan.increment(part_id)?;
            }
        }
        Ok(plan)
    }

    fn from_store(store: &LiveScoreStore) -> Result<Self, IndexBuildFailure> {
        let total_edges = reference_edge_count(store)?;
        let mut plan = Self::default();
        plan.by_target
            .try_reserve(total_edges)
            .map_err(|_| IndexBuildFailure::Capacity)?;
        for part in &store.topology.part_order {
            for measure in store
                .topology
                .content_order
                .get(part)
                .ok_or(IndexBuildFailure::MissingRecord)?
            {
                let measure_record = store
                    .measures
                    .get(*measure)
                    .ok_or(IndexBuildFailure::MissingRecord)?;
                plan.increment(&measure_record.id)?;
                let key = PartMeasureKey {
                    part: *part,
                    measure: *measure,
                };
                for voice in store
                    .topology
                    .voice_order
                    .get(&key)
                    .ok_or(IndexBuildFailure::MissingRecord)?
                {
                    let voice_record = store
                        .voices
                        .get(*voice)
                        .ok_or(IndexBuildFailure::MissingRecord)?;
                    plan.increment(&voice_record.default_staff_id)?;
                    for event in store
                        .topology
                        .event_order
                        .get(voice)
                        .ok_or(IndexBuildFailure::MissingRecord)?
                    {
                        let event_record = store
                            .events
                            .get(*event)
                            .ok_or(IndexBuildFailure::MissingRecord)?;
                        if let Some(staff_id) = &event_record.staff_id {
                            plan.increment(staff_id)?;
                        }
                    }
                }
            }
        }
        for extension in &store.topology.extension_order {
            let record = store
                .extensions
                .get(*extension)
                .ok_or(IndexBuildFailure::MissingRecord)?;
            if let ExtensionOwnerV1::Part { part_id } = &record.owner {
                plan.increment(part_id)?;
            }
        }
        Ok(plan)
    }

    pub(crate) fn capacity(&self, target: &StableId) -> Result<usize, IndexBuildFailure> {
        self.by_target
            .get(target)
            .copied()
            .ok_or(IndexBuildFailure::MissingRecord)
    }

    fn increment(&mut self, target: &StableId) -> Result<(), IndexBuildFailure> {
        let count = self.by_target.entry(target.clone()).or_insert(0);
        *count = count
            .checked_add(1)
            .ok_or(IndexBuildFailure::CountOverflow)?;
        Ok(())
    }
}

impl DerivedIndices {
    pub(crate) fn with_capacities(capacities: IndexCapacities) -> Result<Self, IndexBuildFailure> {
        let mut value = Self::default();
        reserve_map(&mut value.entity.by_id, capacities.entity_ids)?;
        reserve_map(&mut value.ownership.measures, capacities.measures)?;
        reserve_map(&mut value.ownership.parts, capacities.parts)?;
        reserve_map(&mut value.ownership.staffs, capacities.staffs)?;
        reserve_map(&mut value.ownership.voices, capacities.voices)?;
        reserve_map(&mut value.ownership.events, capacities.events)?;
        reserve_map(&mut value.ownership.notes, capacities.notes)?;
        reserve_map(&mut value.ownership.extensions, capacities.extensions)?;
        reserve_map(&mut value.voice_time, capacities.voices)?;
        reserve_map(&mut value.extensions.by_key, capacities.extensions)?;
        reserve_map(&mut value.references.by_target, capacities.reference_edges)?;
        Ok(value)
    }

    pub(crate) fn insert_entity(
        &mut self,
        id: &StableId,
        entity: RuntimeEntityRef,
        metrics: &mut Rkp2StoreMetrics,
        rebuild: bool,
    ) -> Result<(), IndexBuildFailure> {
        if self.entity.by_id.insert(id.clone(), entity).is_some() {
            return Err(IndexBuildFailure::DuplicateEntry);
        }
        mark_index_entry(metrics, rebuild)
    }

    pub(crate) fn lookup_entity(
        &self,
        id: &StableId,
        metrics: &mut Rkp2StoreMetrics,
    ) -> Result<RuntimeEntityRef, IndexBuildFailure> {
        increment(&mut metrics.entity_index_lookups)?;
        self.entity
            .by_id
            .get(id)
            .copied()
            .ok_or(IndexBuildFailure::MissingRecord)
    }

    pub(crate) fn insert_measure_owner(
        &mut self,
        handle: MeasureHandle,
        metrics: &mut Rkp2StoreMetrics,
        rebuild: bool,
    ) -> Result<(), IndexBuildFailure> {
        insert_unique(&mut self.ownership.measures, handle, ())?;
        mark_index_entry(metrics, rebuild)
    }

    pub(crate) fn insert_part_owner(
        &mut self,
        handle: PartHandle,
        metrics: &mut Rkp2StoreMetrics,
        rebuild: bool,
    ) -> Result<(), IndexBuildFailure> {
        insert_unique(&mut self.ownership.parts, handle, ())?;
        mark_index_entry(metrics, rebuild)
    }

    pub(crate) fn insert_staff_owner(
        &mut self,
        handle: StaffHandle,
        part: PartHandle,
        metrics: &mut Rkp2StoreMetrics,
        rebuild: bool,
    ) -> Result<(), IndexBuildFailure> {
        insert_unique(&mut self.ownership.staffs, handle, part)?;
        mark_index_entry(metrics, rebuild)
    }

    pub(crate) fn insert_voice_owner(
        &mut self,
        handle: VoiceHandle,
        owner: PartMeasureKey,
        metrics: &mut Rkp2StoreMetrics,
        rebuild: bool,
    ) -> Result<(), IndexBuildFailure> {
        insert_unique(&mut self.ownership.voices, handle, owner)?;
        mark_index_entry(metrics, rebuild)
    }

    pub(crate) fn insert_event_owner(
        &mut self,
        handle: EventHandle,
        owner: VoiceHandle,
        metrics: &mut Rkp2StoreMetrics,
        rebuild: bool,
    ) -> Result<(), IndexBuildFailure> {
        insert_unique(&mut self.ownership.events, handle, owner)?;
        mark_index_entry(metrics, rebuild)
    }

    pub(crate) fn insert_note_owner(
        &mut self,
        handle: NoteHandle,
        owner: EventHandle,
        metrics: &mut Rkp2StoreMetrics,
        rebuild: bool,
    ) -> Result<(), IndexBuildFailure> {
        insert_unique(&mut self.ownership.notes, handle, owner)?;
        mark_index_entry(metrics, rebuild)
    }

    pub(crate) fn insert_extension_owner(
        &mut self,
        handle: ExtensionHandle,
        owner: ExtensionIndexOwner,
        metrics: &mut Rkp2StoreMetrics,
        rebuild: bool,
    ) -> Result<(), IndexBuildFailure> {
        insert_unique(&mut self.ownership.extensions, handle, owner)?;
        mark_index_entry(metrics, rebuild)
    }

    pub(crate) fn check_staff_owner(
        &self,
        staff: StaffHandle,
        part: PartHandle,
        metrics: &mut Rkp2StoreMetrics,
    ) -> Result<(), IndexBuildFailure> {
        increment(&mut metrics.owner_index_lookups)?;
        if self.ownership.staffs.get(&staff) == Some(&part) {
            Ok(())
        } else {
            Err(IndexBuildFailure::MissingRecord)
        }
    }

    pub(crate) fn lookup_owner(
        &self,
        entity: RuntimeEntityRef,
        metrics: &mut Rkp2StoreMetrics,
    ) -> Result<RuntimeOwnerRef, IndexBuildFailure> {
        increment(&mut metrics.owner_index_lookups)?;
        match entity {
            RuntimeEntityRef::Document => Err(IndexBuildFailure::MissingRecord),
            RuntimeEntityRef::Measure(handle) => self
                .ownership
                .measures
                .contains_key(&handle)
                .then_some(RuntimeOwnerRef::Document)
                .ok_or(IndexBuildFailure::MissingRecord),
            RuntimeEntityRef::Part(handle) => self
                .ownership
                .parts
                .contains_key(&handle)
                .then_some(RuntimeOwnerRef::Document)
                .ok_or(IndexBuildFailure::MissingRecord),
            RuntimeEntityRef::Staff(handle) => self
                .ownership
                .staffs
                .get(&handle)
                .copied()
                .map(RuntimeOwnerRef::Part)
                .ok_or(IndexBuildFailure::MissingRecord),
            RuntimeEntityRef::Voice(handle) => self
                .ownership
                .voices
                .get(&handle)
                .copied()
                .map(RuntimeOwnerRef::PartMeasure)
                .ok_or(IndexBuildFailure::MissingRecord),
            RuntimeEntityRef::Event(handle) => self
                .ownership
                .events
                .get(&handle)
                .copied()
                .map(RuntimeOwnerRef::Voice)
                .ok_or(IndexBuildFailure::MissingRecord),
            RuntimeEntityRef::Note(handle) => self
                .ownership
                .notes
                .get(&handle)
                .copied()
                .map(RuntimeOwnerRef::Event)
                .ok_or(IndexBuildFailure::MissingRecord),
        }
    }

    pub(crate) fn insert_voice_time(
        &mut self,
        voice: VoiceHandle,
        index: VoiceTimeIndex,
        metrics: &mut Rkp2StoreMetrics,
        rebuild: bool,
    ) -> Result<(), IndexBuildFailure> {
        if self.voice_time.insert(voice, index).is_some() {
            return Err(IndexBuildFailure::DuplicateEntry);
        }
        mark_index_entry(metrics, rebuild)
    }

    pub(crate) fn push_extension(
        &mut self,
        key: ExtensionIndexKey,
        handle: ExtensionHandle,
        metrics: &mut Rkp2StoreMetrics,
        rebuild: bool,
    ) -> Result<(), IndexBuildFailure> {
        let values = self.extensions.by_key.entry(key).or_default();
        if values.is_empty() {
            values
                .try_reserve_exact(1)
                .map_err(|_| IndexBuildFailure::Capacity)?;
        } else {
            return Err(IndexBuildFailure::DuplicateEntry);
        }
        values.push(handle);
        mark_index_entry(metrics, rebuild)
    }

    pub(crate) fn push_reference(
        &mut self,
        target: &StableId,
        address: StableReferenceAddress,
        capacities: &ReferenceCapacityPlan,
        metrics: &mut Rkp2StoreMetrics,
        rebuild: bool,
    ) -> Result<(), IndexBuildFailure> {
        let values = self.references.by_target.entry(target.clone()).or_default();
        if values.is_empty() {
            values
                .try_reserve_exact(capacities.capacity(target)?)
                .map_err(|_| IndexBuildFailure::Capacity)?;
        }
        values.push(address);
        increment(&mut metrics.reference_edges_built)?;
        mark_index_entry(metrics, rebuild)
    }

    pub(crate) fn sort_reference_buckets(&mut self) {
        for values in self.references.by_target.values_mut() {
            values.sort_by(|left, right| compare_reference_sources(&left.source, &right.source));
        }
    }

    pub(crate) fn contains_reference(
        &self,
        target: &StableId,
        address: &StableReferenceAddress,
    ) -> bool {
        self.references.by_target.get(target).is_some_and(|values| {
            values
                .iter()
                .any(|candidate| candidate.source == address.source)
        })
    }
}

fn compare_reference_sources(
    left: &ReferenceAddressV1,
    right: &ReferenceAddressV1,
) -> std::cmp::Ordering {
    reference_source_rank(left)
        .cmp(&reference_source_rank(right))
        .then_with(|| match (left, right) {
            (
                ReferenceAddressV1::VoiceDefaultStaff {
                    voice_id: left_voice,
                },
                ReferenceAddressV1::VoiceDefaultStaff {
                    voice_id: right_voice,
                },
            ) => left_voice.cmp(right_voice),
            (
                ReferenceAddressV1::EventStaffAssignment {
                    event_id: left_event,
                },
                ReferenceAddressV1::EventStaffAssignment {
                    event_id: right_event,
                },
            ) => left_event.cmp(right_event),
            (
                ReferenceAddressV1::PartMeasureLink {
                    part_id: left_part,
                    measure_id: left_measure,
                },
                ReferenceAddressV1::PartMeasureLink {
                    part_id: right_part,
                    measure_id: right_measure,
                },
            ) => left_part
                .cmp(right_part)
                .then_with(|| left_measure.cmp(right_measure)),
            (
                ReferenceAddressV1::ExtensionOwner {
                    namespace: left_namespace,
                    owner: left_owner,
                },
                ReferenceAddressV1::ExtensionOwner {
                    namespace: right_namespace,
                    owner: right_owner,
                },
            ) => left_namespace
                .cmp(right_namespace)
                .then_with(|| compare_extension_owners(left_owner, right_owner)),
            _ => std::cmp::Ordering::Equal,
        })
}

pub(crate) fn prepared_reference_address(source: ReferenceAddressV1) -> StableReferenceAddress {
    StableReferenceAddress {
        path: StablePathV1::root(),
        sort_key: reference_source_sort_key(&source),
        source,
    }
}

pub(crate) fn sort_prepared_reference_bucket(values: &mut [StableReferenceAddress]) {
    values.sort_by(|left, right| compare_reference_sources(&left.source, &right.source));
}

fn reference_source_sort_key(source: &ReferenceAddressV1) -> String {
    match source {
        ReferenceAddressV1::VoiceDefaultStaff { voice_id } => {
            format!("voice/{}/default-staff", voice_id.as_str())
        }
        ReferenceAddressV1::EventStaffAssignment { event_id } => {
            format!("event/{}/staff-assignment", event_id.as_str())
        }
        ReferenceAddressV1::PartMeasureLink {
            part_id,
            measure_id,
        } => format!(
            "part/{}/measure/{}/content-link",
            part_id.as_str(),
            measure_id.as_str()
        ),
        ReferenceAddressV1::ExtensionOwner { namespace, owner } => match owner {
            StableExtensionOwnerV1::Score => format!("extension/{namespace}/score-owner"),
            StableExtensionOwnerV1::Part { part_id } => {
                format!("extension/{namespace}/part/{}/owner", part_id.as_str())
            }
        },
    }
}

const fn reference_source_rank(value: &ReferenceAddressV1) -> u8 {
    match value {
        ReferenceAddressV1::PartMeasureLink { .. } => 0,
        ReferenceAddressV1::VoiceDefaultStaff { .. } => 1,
        ReferenceAddressV1::EventStaffAssignment { .. } => 2,
        ReferenceAddressV1::ExtensionOwner { .. } => 3,
    }
}

fn compare_extension_owners(
    left: &StableExtensionOwnerV1,
    right: &StableExtensionOwnerV1,
) -> std::cmp::Ordering {
    match (left, right) {
        (StableExtensionOwnerV1::Score, StableExtensionOwnerV1::Score) => std::cmp::Ordering::Equal,
        (StableExtensionOwnerV1::Score, StableExtensionOwnerV1::Part { .. }) => {
            std::cmp::Ordering::Less
        }
        (StableExtensionOwnerV1::Part { .. }, StableExtensionOwnerV1::Score) => {
            std::cmp::Ordering::Greater
        }
        (
            StableExtensionOwnerV1::Part { part_id: left_part },
            StableExtensionOwnerV1::Part {
                part_id: right_part,
            },
        ) => left_part.cmp(right_part),
    }
}

fn reserve_map<K: Eq + std::hash::Hash, V>(
    values: &mut HashMap<K, V>,
    capacity: usize,
) -> Result<(), IndexBuildFailure> {
    values
        .try_reserve(capacity)
        .map_err(|_| IndexBuildFailure::Capacity)
}

fn insert_unique<K: Eq + std::hash::Hash, V>(
    values: &mut HashMap<K, V>,
    key: K,
    value: V,
) -> Result<(), IndexBuildFailure> {
    if values.insert(key, value).is_some() {
        Err(IndexBuildFailure::DuplicateEntry)
    } else {
        Ok(())
    }
}

pub(crate) fn mark_index_entry(
    metrics: &mut Rkp2StoreMetrics,
    rebuild: bool,
) -> Result<(), IndexBuildFailure> {
    if rebuild {
        increment(&mut metrics.index_rebuild_entries)
    } else {
        increment(&mut metrics.index_entries_built)
    }
}

pub(crate) fn increment(value: &mut usize) -> Result<(), IndexBuildFailure> {
    *value = value
        .checked_add(1)
        .ok_or(IndexBuildFailure::CountOverflow)?;
    Ok(())
}

pub(crate) fn measure_reference_path(
    part_id: &StableId,
    measure_id: &StableId,
    part: usize,
    content: usize,
) -> Result<StableReferenceAddress, IndexBuildFailure> {
    reference_path(
        ReferenceAddressV1::PartMeasureLink {
            part_id: part_id.clone(),
            measure_id: measure_id.clone(),
        },
        vec![
            field("parts"),
            index(part)?,
            field("measureContents"),
            index(content)?,
            field("measureId"),
        ],
        format!("parts/{part:020}/measureContents/{content:020}/measureId"),
    )
}

pub(crate) fn voice_staff_reference_path(
    voice_id: &StableId,
    part: usize,
    content: usize,
    voice: usize,
) -> Result<StableReferenceAddress, IndexBuildFailure> {
    reference_path(
        ReferenceAddressV1::VoiceDefaultStaff {
            voice_id: voice_id.clone(),
        },
        vec![
            field("parts"),
            index(part)?,
            field("measureContents"),
            index(content)?,
            field("voices"),
            index(voice)?,
            field("defaultStaffId"),
        ],
        format!("parts/{part:020}/measureContents/{content:020}/voices/{voice:020}/defaultStaffId"),
    )
}

pub(crate) fn event_staff_reference_path(
    event_id: &StableId,
    part: usize,
    content: usize,
    voice: usize,
    event: usize,
) -> Result<StableReferenceAddress, IndexBuildFailure> {
    reference_path(
        ReferenceAddressV1::EventStaffAssignment {
            event_id: event_id.clone(),
        },
        vec![
            field("parts"),
            index(part)?,
            field("measureContents"),
            index(content)?,
            field("voices"),
            index(voice)?,
            field("sequence"),
            field("events"),
            index(event)?,
            field("staffId"),
        ],
        format!(
            "parts/{part:020}/measureContents/{content:020}/voices/{voice:020}/sequence/events/{event:020}/staffId"
        ),
    )
}

pub(crate) fn extension_part_reference_path(
    namespace: &str,
    owner: &StableExtensionOwnerV1,
    extension: usize,
) -> Result<StableReferenceAddress, IndexBuildFailure> {
    reference_path(
        ReferenceAddressV1::ExtensionOwner {
            namespace: namespace.to_owned(),
            owner: owner.clone(),
        },
        vec![
            field("extensions"),
            index(extension)?,
            field("owner"),
            field("partId"),
        ],
        format!("extensions/{extension:020}/owner/partId"),
    )
}

fn field(value: &'static str) -> StablePathSegmentV1 {
    StablePathSegmentV1::Field(value.to_owned())
}

fn index(value: usize) -> Result<StablePathSegmentV1, IndexBuildFailure> {
    Ok(StablePathSegmentV1::Index(
        u64::try_from(value).map_err(|_| IndexBuildFailure::CountOverflow)?,
    ))
}

fn reference_path(
    source: ReferenceAddressV1,
    segments: Vec<StablePathSegmentV1>,
    sort_key: String,
) -> Result<StableReferenceAddress, IndexBuildFailure> {
    Ok(StableReferenceAddress {
        path: StablePathV1::new(segments).map_err(|_| IndexBuildFailure::CountOverflow)?,
        source,
        sort_key,
    })
}

fn current_reference_address(
    store: &LiveScoreStore,
    source: &ReferenceAddressV1,
) -> Result<StableReferenceAddress, IndexBuildFailure> {
    match source {
        ReferenceAddressV1::PartMeasureLink {
            part_id,
            measure_id,
        } => {
            let RuntimeEntityRef::Part(part) = lookup_live_entity(store, part_id)? else {
                return Err(IndexBuildFailure::MissingRecord);
            };
            let RuntimeEntityRef::Measure(measure) = lookup_live_entity(store, measure_id)? else {
                return Err(IndexBuildFailure::MissingRecord);
            };
            let part_ordinal = position(&store.topology.part_order, &part)?;
            let content_ordinal = position(
                store
                    .topology
                    .content_order
                    .get(&part)
                    .ok_or(IndexBuildFailure::MissingRecord)?,
                &measure,
            )?;
            measure_reference_path(part_id, measure_id, part_ordinal, content_ordinal)
        }
        ReferenceAddressV1::VoiceDefaultStaff { voice_id } => {
            let RuntimeEntityRef::Voice(voice) = lookup_live_entity(store, voice_id)? else {
                return Err(IndexBuildFailure::MissingRecord);
            };
            let owner = store
                .indices
                .ownership
                .voices
                .get(&voice)
                .copied()
                .ok_or(IndexBuildFailure::MissingRecord)?;
            let part_ordinal = position(&store.topology.part_order, &owner.part)?;
            let content_ordinal = position(
                store
                    .topology
                    .content_order
                    .get(&owner.part)
                    .ok_or(IndexBuildFailure::MissingRecord)?,
                &owner.measure,
            )?;
            let voice_ordinal = position(
                store
                    .topology
                    .voice_order
                    .get(&owner)
                    .ok_or(IndexBuildFailure::MissingRecord)?,
                &voice,
            )?;
            voice_staff_reference_path(voice_id, part_ordinal, content_ordinal, voice_ordinal)
        }
        ReferenceAddressV1::EventStaffAssignment { event_id } => {
            let RuntimeEntityRef::Event(event) = lookup_live_entity(store, event_id)? else {
                return Err(IndexBuildFailure::MissingRecord);
            };
            let voice = store
                .indices
                .ownership
                .events
                .get(&event)
                .copied()
                .ok_or(IndexBuildFailure::MissingRecord)?;
            let owner = store
                .indices
                .ownership
                .voices
                .get(&voice)
                .copied()
                .ok_or(IndexBuildFailure::MissingRecord)?;
            let part_ordinal = position(&store.topology.part_order, &owner.part)?;
            let content_ordinal = position(
                store
                    .topology
                    .content_order
                    .get(&owner.part)
                    .ok_or(IndexBuildFailure::MissingRecord)?,
                &owner.measure,
            )?;
            let voice_ordinal = position(
                store
                    .topology
                    .voice_order
                    .get(&owner)
                    .ok_or(IndexBuildFailure::MissingRecord)?,
                &voice,
            )?;
            let event_ordinal = position(
                store
                    .topology
                    .event_order
                    .get(&voice)
                    .ok_or(IndexBuildFailure::MissingRecord)?,
                &event,
            )?;
            event_staff_reference_path(
                event_id,
                part_ordinal,
                content_ordinal,
                voice_ordinal,
                event_ordinal,
            )
        }
        ReferenceAddressV1::ExtensionOwner { namespace, owner } => {
            let runtime_owner = match owner {
                StableExtensionOwnerV1::Score => ExtensionIndexOwner::Score,
                StableExtensionOwnerV1::Part { part_id } => {
                    let RuntimeEntityRef::Part(part) = lookup_live_entity(store, part_id)? else {
                        return Err(IndexBuildFailure::MissingRecord);
                    };
                    ExtensionIndexOwner::Part(part)
                }
            };
            let handles = store
                .indices
                .extensions
                .by_key
                .get(&ExtensionIndexKey {
                    namespace: namespace.clone(),
                    owner: runtime_owner,
                })
                .ok_or(IndexBuildFailure::MissingRecord)?;
            let [extension] = handles.as_slice() else {
                return Err(IndexBuildFailure::MissingRecord);
            };
            let extension_ordinal = position(&store.topology.extension_order, extension)?;
            extension_part_reference_path(namespace, owner, extension_ordinal)
        }
    }
}

fn lookup_live_entity(
    store: &LiveScoreStore,
    id: &StableId,
) -> Result<RuntimeEntityRef, IndexBuildFailure> {
    let entity = store
        .indices
        .entity
        .by_id
        .get(id)
        .copied()
        .ok_or(IndexBuildFailure::MissingRecord)?;
    let live = match entity {
        RuntimeEntityRef::Document => id == &store.header.id,
        RuntimeEntityRef::Measure(handle) => store.measures.get(handle).is_some(),
        RuntimeEntityRef::Part(handle) => store.parts.get(handle).is_some(),
        RuntimeEntityRef::Staff(handle) => store.staffs.get(handle).is_some(),
        RuntimeEntityRef::Voice(handle) => store.voices.get(handle).is_some(),
        RuntimeEntityRef::Event(handle) => store.events.get(handle).is_some(),
        RuntimeEntityRef::Note(handle) => store.notes.get(handle).is_some(),
    };
    live.then_some(entity)
        .ok_or(IndexBuildFailure::MissingRecord)
}

fn position<T: PartialEq>(values: &[T], target: &T) -> Result<usize, IndexBuildFailure> {
    values
        .iter()
        .position(|value| value == target)
        .ok_or(IndexBuildFailure::MissingRecord)
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum NormalizedEntityKind {
    Document,
    Measure,
    Part,
    Staff,
    Voice,
    Event,
    Note,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct NormalizedEntityEntry {
    pub(crate) id: StableId,
    pub(crate) kind: NormalizedEntityKind,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) enum NormalizedOwner {
    Document,
    Entity(StableId),
    PartMeasure { part: StableId, measure: StableId },
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) enum NormalizedOwnedNode {
    Entity(StableId),
    Extension { ordinal: u64, namespace: String },
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct NormalizedOwnershipEntry {
    pub(crate) child: NormalizedOwnedNode,
    pub(crate) owner: NormalizedOwner,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct NormalizedPartMeasureEntry {
    pub(crate) part: StableId,
    pub(crate) measure: StableId,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct NormalizedVoiceTimeEntry {
    pub(crate) voice: StableId,
    pub(crate) event: StableId,
    pub(crate) start: ExactFraction,
    pub(crate) end: ExactFraction,
    pub(crate) semantic_ordinal: u32,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct NormalizedExtensionEntry {
    pub(crate) ordinal: u64,
    pub(crate) namespace: String,
    pub(crate) owner: NormalizedOwner,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct NormalizedReferenceEntry {
    pub(crate) target: StableId,
    pub(crate) path: StablePathV1,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct NormalizedIndexProjection {
    pub(crate) entities: Vec<NormalizedEntityEntry>,
    pub(crate) ownership: Vec<NormalizedOwnershipEntry>,
    pub(crate) part_measure_contents: Vec<NormalizedPartMeasureEntry>,
    pub(crate) voice_times: Vec<NormalizedVoiceTimeEntry>,
    pub(crate) extensions: Vec<NormalizedExtensionEntry>,
    pub(crate) references: Vec<NormalizedReferenceEntry>,
}

pub(crate) fn rebuild_indices_from_store(
    store: &LiveScoreStore,
) -> Result<(DerivedIndices, Rkp2StoreMetrics), IndexBuildFailure> {
    let capacities = capacities_from_store(store)?;
    let reference_capacities = ReferenceCapacityPlan::from_store(store)?;
    let mut indices = DerivedIndices::with_capacities(capacities)?;
    let mut metrics = Rkp2StoreMetrics::default();
    indices.insert_entity(
        &store.header.id,
        RuntimeEntityRef::Document,
        &mut metrics,
        true,
    )?;

    for measure in &store.topology.measure_order {
        let record = store
            .measures
            .get(*measure)
            .ok_or(IndexBuildFailure::MissingRecord)?;
        indices.insert_entity(
            &record.id,
            RuntimeEntityRef::Measure(*measure),
            &mut metrics,
            true,
        )?;
        indices.insert_measure_owner(*measure, &mut metrics, true)?;
    }

    for (part_ordinal, part) in store.topology.part_order.iter().enumerate() {
        let part_record = store
            .parts
            .get(*part)
            .ok_or(IndexBuildFailure::MissingRecord)?;
        indices.insert_entity(
            &part_record.id,
            RuntimeEntityRef::Part(*part),
            &mut metrics,
            true,
        )?;
        indices.insert_part_owner(*part, &mut metrics, true)?;
        for staff in store
            .topology
            .staff_order
            .get(part)
            .ok_or(IndexBuildFailure::MissingRecord)?
        {
            let record = store
                .staffs
                .get(*staff)
                .ok_or(IndexBuildFailure::MissingRecord)?;
            indices.insert_entity(
                &record.id,
                RuntimeEntityRef::Staff(*staff),
                &mut metrics,
                true,
            )?;
            indices.insert_staff_owner(*staff, *part, &mut metrics, true)?;
        }

        for (content_ordinal, measure) in store
            .topology
            .content_order
            .get(part)
            .ok_or(IndexBuildFailure::MissingRecord)?
            .iter()
            .enumerate()
        {
            let measure_record = store
                .measures
                .get(*measure)
                .ok_or(IndexBuildFailure::MissingRecord)?;
            indices.push_reference(
                &measure_record.id,
                measure_reference_path(
                    &part_record.id,
                    &measure_record.id,
                    part_ordinal,
                    content_ordinal,
                )?,
                &reference_capacities,
                &mut metrics,
                true,
            )?;
            mark_index_entry(&mut metrics, true)?;
            let key = PartMeasureKey {
                part: *part,
                measure: *measure,
            };
            for (voice_ordinal, voice) in store
                .topology
                .voice_order
                .get(&key)
                .ok_or(IndexBuildFailure::MissingRecord)?
                .iter()
                .enumerate()
            {
                let voice_record = store
                    .voices
                    .get(*voice)
                    .ok_or(IndexBuildFailure::MissingRecord)?;
                indices.insert_entity(
                    &voice_record.id,
                    RuntimeEntityRef::Voice(*voice),
                    &mut metrics,
                    true,
                )?;
                indices.insert_voice_owner(*voice, key, &mut metrics, true)?;
                let staff = indices.lookup_entity(&voice_record.default_staff_id, &mut metrics)?;
                let RuntimeEntityRef::Staff(staff) = staff else {
                    return Err(IndexBuildFailure::MissingRecord);
                };
                indices.check_staff_owner(staff, *part, &mut metrics)?;
                indices.push_reference(
                    &voice_record.default_staff_id,
                    voice_staff_reference_path(
                        &voice_record.id,
                        part_ordinal,
                        content_ordinal,
                        voice_ordinal,
                    )?,
                    &reference_capacities,
                    &mut metrics,
                    true,
                )?;

                let events = store
                    .topology
                    .event_order
                    .get(voice)
                    .ok_or(IndexBuildFailure::MissingRecord)?;
                let mut time = VoiceTimeIndex::with_capacity(events.len())?;
                let mut start = ExactFraction::from_canonical(&voice_record.sequence_start)
                    .map_err(|_| IndexBuildFailure::InvalidExactTime)?;
                for (event_ordinal, event) in events.iter().enumerate() {
                    let record = store
                        .events
                        .get(*event)
                        .ok_or(IndexBuildFailure::MissingRecord)?;
                    indices.insert_entity(
                        &record.id,
                        RuntimeEntityRef::Event(*event),
                        &mut metrics,
                        true,
                    )?;
                    indices.insert_event_owner(*event, *voice, &mut metrics, true)?;
                    if let Some(staff_id) = &record.staff_id {
                        let staff = indices.lookup_entity(staff_id, &mut metrics)?;
                        let RuntimeEntityRef::Staff(staff) = staff else {
                            return Err(IndexBuildFailure::MissingRecord);
                        };
                        indices.check_staff_owner(staff, *part, &mut metrics)?;
                        indices.push_reference(
                            staff_id,
                            event_staff_reference_path(
                                &record.id,
                                part_ordinal,
                                content_ordinal,
                                voice_ordinal,
                                event_ordinal,
                            )?,
                            &reference_capacities,
                            &mut metrics,
                            true,
                        )?;
                    }
                    let duration = ExactFraction::note_value_duration(&record.duration)
                        .map_err(|_| IndexBuildFailure::InvalidExactTime)?;
                    let end = start
                        .checked_add(duration)
                        .map_err(|_| IndexBuildFailure::InvalidExactTime)?;
                    time.push(
                        start,
                        end,
                        u32::try_from(event_ordinal)
                            .map_err(|_| IndexBuildFailure::CountOverflow)?,
                        *event,
                    )?;
                    increment(&mut metrics.time_entries_built)?;
                    mark_index_entry(&mut metrics, true)?;
                    start = end;

                    for note in store
                        .topology
                        .note_order
                        .get(event)
                        .ok_or(IndexBuildFailure::MissingRecord)?
                    {
                        let note_record = store
                            .notes
                            .get(*note)
                            .ok_or(IndexBuildFailure::MissingRecord)?;
                        indices.insert_entity(
                            &note_record.id,
                            RuntimeEntityRef::Note(*note),
                            &mut metrics,
                            true,
                        )?;
                        indices.insert_note_owner(*note, *event, &mut metrics, true)?;
                    }
                }
                indices.insert_voice_time(*voice, time, &mut metrics, true)?;
            }
        }
    }

    for (extension_ordinal, extension) in store.topology.extension_order.iter().enumerate() {
        let record = store
            .extensions
            .get(*extension)
            .ok_or(IndexBuildFailure::MissingRecord)?;
        let owner = match &record.owner {
            ExtensionOwnerV1::Score => ExtensionIndexOwner::Score,
            ExtensionOwnerV1::Part { part_id } => {
                let entity = indices.lookup_entity(part_id, &mut metrics)?;
                let RuntimeEntityRef::Part(part) = entity else {
                    return Err(IndexBuildFailure::MissingRecord);
                };
                indices.push_reference(
                    part_id,
                    extension_part_reference_path(
                        &record.namespace,
                        &StableExtensionOwnerV1::from(&record.owner),
                        extension_ordinal,
                    )?,
                    &reference_capacities,
                    &mut metrics,
                    true,
                )?;
                ExtensionIndexOwner::Part(part)
            }
        };
        indices.insert_extension_owner(*extension, owner, &mut metrics, true)?;
        indices.push_extension(
            ExtensionIndexKey {
                namespace: record.namespace.clone(),
                owner,
            },
            *extension,
            &mut metrics,
            true,
        )?;
    }
    indices.sort_reference_buckets();
    Ok((indices, metrics))
}

pub(crate) fn normalized_index_projection(
    store: &LiveScoreStore,
    indices: &DerivedIndices,
) -> Result<NormalizedIndexProjection, IndexBuildFailure> {
    let mut entities = Vec::new();
    let mut ownership = Vec::new();
    let mut part_measure_contents = Vec::new();
    let mut voice_times = Vec::new();
    let mut extensions = Vec::new();
    let mut references = Vec::new();
    entities
        .try_reserve_exact(indices.entity.by_id.len())
        .map_err(|_| IndexBuildFailure::Capacity)?;
    ownership
        .try_reserve_exact(ownership_len(&indices.ownership)?)
        .map_err(|_| IndexBuildFailure::Capacity)?;
    part_measure_contents
        .try_reserve_exact(store.topology.contents.len())
        .map_err(|_| IndexBuildFailure::Capacity)?;
    voice_times
        .try_reserve_exact(store.events.len())
        .map_err(|_| IndexBuildFailure::Capacity)?;
    extensions
        .try_reserve_exact(store.extensions.len())
        .map_err(|_| IndexBuildFailure::Capacity)?;
    references
        .try_reserve_exact(reference_index_len(&indices.references)?)
        .map_err(|_| IndexBuildFailure::Capacity)?;

    push_entity_projection(
        indices,
        &store.header.id,
        RuntimeEntityRef::Document,
        NormalizedEntityKind::Document,
        &mut entities,
    )?;
    for measure in &store.topology.measure_order {
        let record = store
            .measures
            .get(*measure)
            .ok_or(IndexBuildFailure::MissingRecord)?;
        push_entity_projection(
            indices,
            &record.id,
            RuntimeEntityRef::Measure(*measure),
            NormalizedEntityKind::Measure,
            &mut entities,
        )?;
        if !indices.ownership.measures.contains_key(measure) {
            return Err(IndexBuildFailure::MissingRecord);
        }
        ownership.push(NormalizedOwnershipEntry {
            child: NormalizedOwnedNode::Entity(record.id.clone()),
            owner: NormalizedOwner::Document,
        });
    }
    for part in &store.topology.part_order {
        let part_record = store
            .parts
            .get(*part)
            .ok_or(IndexBuildFailure::MissingRecord)?;
        push_entity_projection(
            indices,
            &part_record.id,
            RuntimeEntityRef::Part(*part),
            NormalizedEntityKind::Part,
            &mut entities,
        )?;
        if !indices.ownership.parts.contains_key(part) {
            return Err(IndexBuildFailure::MissingRecord);
        }
        ownership.push(NormalizedOwnershipEntry {
            child: NormalizedOwnedNode::Entity(part_record.id.clone()),
            owner: NormalizedOwner::Document,
        });
        for staff in store
            .topology
            .staff_order
            .get(part)
            .ok_or(IndexBuildFailure::MissingRecord)?
        {
            let record = store
                .staffs
                .get(*staff)
                .ok_or(IndexBuildFailure::MissingRecord)?;
            push_entity_projection(
                indices,
                &record.id,
                RuntimeEntityRef::Staff(*staff),
                NormalizedEntityKind::Staff,
                &mut entities,
            )?;
            if indices.ownership.staffs.get(staff) != Some(part) {
                return Err(IndexBuildFailure::MissingRecord);
            }
            ownership.push(NormalizedOwnershipEntry {
                child: NormalizedOwnedNode::Entity(record.id.clone()),
                owner: NormalizedOwner::Entity(part_record.id.clone()),
            });
        }
        for measure in store
            .topology
            .content_order
            .get(part)
            .ok_or(IndexBuildFailure::MissingRecord)?
        {
            let measure_record = store
                .measures
                .get(*measure)
                .ok_or(IndexBuildFailure::MissingRecord)?;
            let key = PartMeasureKey {
                part: *part,
                measure: *measure,
            };
            if !store.topology.contents.contains_key(&key) {
                return Err(IndexBuildFailure::MissingRecord);
            }
            part_measure_contents.push(NormalizedPartMeasureEntry {
                part: part_record.id.clone(),
                measure: measure_record.id.clone(),
            });
            for voice in store
                .topology
                .voice_order
                .get(&key)
                .ok_or(IndexBuildFailure::MissingRecord)?
            {
                let record = store
                    .voices
                    .get(*voice)
                    .ok_or(IndexBuildFailure::MissingRecord)?;
                push_entity_projection(
                    indices,
                    &record.id,
                    RuntimeEntityRef::Voice(*voice),
                    NormalizedEntityKind::Voice,
                    &mut entities,
                )?;
                if indices.ownership.voices.get(voice) != Some(&key) {
                    return Err(IndexBuildFailure::MissingRecord);
                }
                ownership.push(NormalizedOwnershipEntry {
                    child: NormalizedOwnedNode::Entity(record.id.clone()),
                    owner: NormalizedOwner::PartMeasure {
                        part: part_record.id.clone(),
                        measure: measure_record.id.clone(),
                    },
                });
                let time = indices
                    .voice_time
                    .get(voice)
                    .ok_or(IndexBuildFailure::MissingRecord)?;
                let event_order = store
                    .topology
                    .event_order
                    .get(voice)
                    .ok_or(IndexBuildFailure::MissingRecord)?;
                if time.entries.len() != event_order.len() {
                    return Err(IndexBuildFailure::MissingRecord);
                }
                for (ordinal, (event, time_entry)) in
                    event_order.iter().zip(&time.entries).enumerate()
                {
                    if time_entry.event != *event
                        || usize::try_from(time_entry.semantic_ordinal)
                            .map_err(|_| IndexBuildFailure::CountOverflow)?
                            != ordinal
                    {
                        return Err(IndexBuildFailure::MissingRecord);
                    }
                    let event_record = store
                        .events
                        .get(*event)
                        .ok_or(IndexBuildFailure::MissingRecord)?;
                    push_entity_projection(
                        indices,
                        &event_record.id,
                        RuntimeEntityRef::Event(*event),
                        NormalizedEntityKind::Event,
                        &mut entities,
                    )?;
                    if indices.ownership.events.get(event) != Some(voice) {
                        return Err(IndexBuildFailure::MissingRecord);
                    }
                    ownership.push(NormalizedOwnershipEntry {
                        child: NormalizedOwnedNode::Entity(event_record.id.clone()),
                        owner: NormalizedOwner::Entity(record.id.clone()),
                    });
                    voice_times.push(NormalizedVoiceTimeEntry {
                        voice: record.id.clone(),
                        event: event_record.id.clone(),
                        start: time_entry.start,
                        end: time_entry.end,
                        semantic_ordinal: time_entry.semantic_ordinal,
                    });
                    for note in store
                        .topology
                        .note_order
                        .get(event)
                        .ok_or(IndexBuildFailure::MissingRecord)?
                    {
                        let note_record = store
                            .notes
                            .get(*note)
                            .ok_or(IndexBuildFailure::MissingRecord)?;
                        push_entity_projection(
                            indices,
                            &note_record.id,
                            RuntimeEntityRef::Note(*note),
                            NormalizedEntityKind::Note,
                            &mut entities,
                        )?;
                        if indices.ownership.notes.get(note) != Some(event) {
                            return Err(IndexBuildFailure::MissingRecord);
                        }
                        ownership.push(NormalizedOwnershipEntry {
                            child: NormalizedOwnedNode::Entity(note_record.id.clone()),
                            owner: NormalizedOwner::Entity(event_record.id.clone()),
                        });
                    }
                }
            }
        }
    }

    for (ordinal, extension) in store.topology.extension_order.iter().enumerate() {
        let record = store
            .extensions
            .get(*extension)
            .ok_or(IndexBuildFailure::MissingRecord)?;
        let owner = *indices
            .ownership
            .extensions
            .get(extension)
            .ok_or(IndexBuildFailure::MissingRecord)?;
        let normalized_owner = match owner {
            ExtensionIndexOwner::Score => NormalizedOwner::Document,
            ExtensionIndexOwner::Part(part) => NormalizedOwner::Entity(
                store
                    .parts
                    .get(part)
                    .ok_or(IndexBuildFailure::MissingRecord)?
                    .id
                    .clone(),
            ),
        };
        let key = ExtensionIndexKey {
            namespace: record.namespace.clone(),
            owner,
        };
        if indices.extensions.by_key.get(&key).map(Vec::as_slice) != Some([*extension].as_slice()) {
            return Err(IndexBuildFailure::MissingRecord);
        }
        let ordinal = u64::try_from(ordinal).map_err(|_| IndexBuildFailure::CountOverflow)?;
        ownership.push(NormalizedOwnershipEntry {
            child: NormalizedOwnedNode::Extension {
                ordinal,
                namespace: record.namespace.clone(),
            },
            owner: normalized_owner.clone(),
        });
        extensions.push(NormalizedExtensionEntry {
            ordinal,
            namespace: record.namespace.clone(),
            owner: normalized_owner,
        });
    }

    let mut reference_rows = Vec::new();
    reference_rows
        .try_reserve_exact(reference_index_len(&indices.references)?)
        .map_err(|_| IndexBuildFailure::Capacity)?;
    for (target, values) in &indices.references.by_target {
        for address in values {
            reference_rows.push((
                target.clone(),
                current_reference_address(store, &address.source)?,
            ));
        }
    }
    reference_rows.sort_by(|left, right| {
        left.0
            .cmp(&right.0)
            .then_with(|| left.1.sort_key.cmp(&right.1.sort_key))
    });
    references.extend(reference_rows.into_iter().map(|(target, address)| {
        NormalizedReferenceEntry {
            target,
            path: address.path,
        }
    }));

    if entities.len() != indices.entity.by_id.len()
        || ownership.len() != ownership_len(&indices.ownership)?
        || part_measure_contents.len() != store.topology.contents.len()
        || voice_times.len() != store.events.len()
        || extensions.len() != store.extensions.len()
    {
        return Err(IndexBuildFailure::MissingRecord);
    }
    Ok(NormalizedIndexProjection {
        entities,
        ownership,
        part_measure_contents,
        voice_times,
        extensions,
        references,
    })
}

pub(crate) fn verify_index_parity(
    store: &LiveScoreStore,
    primary: &DerivedIndices,
) -> Result<Rkp2StoreMetrics, IndexBuildFailure> {
    let primary = normalized_index_projection(store, primary)?;
    let (rebuilt, metrics) = rebuild_indices_from_store(store)?;
    let rebuilt = normalized_index_projection(store, &rebuilt)?;
    if primary == rebuilt {
        Ok(metrics)
    } else {
        Err(IndexBuildFailure::ParityMismatch)
    }
}

#[used]
static STAGE4_INDEX_PARITY_REBUILD: fn(
    &LiveScoreStore,
    &DerivedIndices,
) -> Result<Rkp2StoreMetrics, IndexBuildFailure> = verify_index_parity;

fn push_entity_projection(
    indices: &DerivedIndices,
    id: &StableId,
    expected: RuntimeEntityRef,
    kind: NormalizedEntityKind,
    output: &mut Vec<NormalizedEntityEntry>,
) -> Result<(), IndexBuildFailure> {
    if indices.entity.by_id.get(id) != Some(&expected) {
        return Err(IndexBuildFailure::MissingRecord);
    }
    output.push(NormalizedEntityEntry {
        id: id.clone(),
        kind,
    });
    Ok(())
}

fn capacities_from_store(store: &LiveScoreStore) -> Result<IndexCapacities, IndexBuildFailure> {
    Ok(IndexCapacities {
        entity_ids: store
            .measures
            .len()
            .checked_add(store.parts.len())
            .and_then(|value| value.checked_add(store.staffs.len()))
            .and_then(|value| value.checked_add(store.voices.len()))
            .and_then(|value| value.checked_add(store.events.len()))
            .and_then(|value| value.checked_add(store.notes.len()))
            .and_then(|value| value.checked_add(1))
            .ok_or(IndexBuildFailure::CountOverflow)?,
        measures: store.measures.len(),
        parts: store.parts.len(),
        staffs: store.staffs.len(),
        voices: store.voices.len(),
        events: store.events.len(),
        notes: store.notes.len(),
        extensions: store.extensions.len(),
        reference_edges: reference_edge_count(store)?,
    })
}

fn reference_edge_count(store: &LiveScoreStore) -> Result<usize, IndexBuildFailure> {
    let mut count = store.topology.contents.len();
    count = count
        .checked_add(store.voices.len())
        .ok_or(IndexBuildFailure::CountOverflow)?;
    for event in &store.topology.event_order {
        for handle in event.1 {
            if store
                .events
                .get(*handle)
                .ok_or(IndexBuildFailure::MissingRecord)?
                .staff_id
                .is_some()
            {
                count = count
                    .checked_add(1)
                    .ok_or(IndexBuildFailure::CountOverflow)?;
            }
        }
    }
    for extension in &store.topology.extension_order {
        if matches!(
            store
                .extensions
                .get(*extension)
                .ok_or(IndexBuildFailure::MissingRecord)?
                .owner,
            ExtensionOwnerV1::Part { .. }
        ) {
            count = count
                .checked_add(1)
                .ok_or(IndexBuildFailure::CountOverflow)?;
        }
    }
    Ok(count)
}

fn ownership_len(index: &OwnershipIndex) -> Result<usize, IndexBuildFailure> {
    index
        .measures
        .len()
        .checked_add(index.parts.len())
        .and_then(|value| value.checked_add(index.staffs.len()))
        .and_then(|value| value.checked_add(index.voices.len()))
        .and_then(|value| value.checked_add(index.events.len()))
        .and_then(|value| value.checked_add(index.notes.len()))
        .and_then(|value| value.checked_add(index.extensions.len()))
        .ok_or(IndexBuildFailure::CountOverflow)
}

fn reference_index_len(index: &ReferenceDependencyIndex) -> Result<usize, IndexBuildFailure> {
    index.by_target.values().try_fold(0_usize, |total, values| {
        total
            .checked_add(values.len())
            .ok_or(IndexBuildFailure::CountOverflow)
    })
}

#[cfg(test)]
mod tests {
    use std::{fmt::Write as _, fs, path::Path, time::Instant};

    use brilliant_core_types::StableId;
    use brilliant_kernel_contracts::decode_create_request;
    use brilliant_score_foundation::{ExactFraction, RhythmicContentV1, canonical_score_bytes};

    use super::*;
    use crate::{
        store::{build_live_score_store, tests::fixture},
        time_index::TimeIndexFailure,
    };

    fn id(value: &str) -> StableId {
        StableId::new(value).expect("stable id")
    }

    fn fraction(numerator: i64, denominator: i64) -> ExactFraction {
        ExactFraction::from_parts(numerator, denominator).expect("exact fraction")
    }

    const SCALE_REQUEST_ENV: &str = "BRILLIANT_RKP2_SCALE_REQUEST_V1";
    const SCALE_RUST_PREFIX: &str = "BRILLIANT_RKP2_SCALE_RUST_V1:";
    const CREATE_REQUEST_PREFIX: &[u8] = br#"{"apiVersion":1,"document":"#;
    const MAX_SAFE_INTEGER: usize = 9_007_199_254_740_991;

    #[derive(Clone, Copy, Debug, Eq, PartialEq)]
    struct ScaleCounts {
        measures: usize,
        parts: usize,
        staves: usize,
        measure_contents: usize,
        voices: usize,
        events: usize,
        notes: usize,
        extensions: usize,
        part_owned_extensions: usize,
        unknown_extensions: usize,
    }

    #[derive(Clone, Copy, Debug, Eq, PartialEq)]
    struct ScaleBytes {
        canonical_score_bytes: usize,
        create_request_bytes: usize,
    }

    #[derive(Clone, Copy, Debug, Eq, PartialEq)]
    struct EntityProbe {
        entity_index_lookups_delta: usize,
        other_counter_delta: usize,
    }

    #[derive(Clone, Copy, Debug, Eq, PartialEq)]
    struct OwnerProbe {
        owner_index_lookups_delta: usize,
        other_counter_delta: usize,
    }

    #[derive(Clone, Copy, Debug, Eq, PartialEq)]
    struct PrivateScaleEvidence {
        counts: ScaleCounts,
        bytes: ScaleBytes,
        metrics: Rkp2StoreMetrics,
        entity_probe: EntityProbe,
        owner_probe: OwnerProbe,
        workload_elapsed_micros: usize,
    }

    fn push_number(output: &mut String, key: &str, value: usize, first: bool) {
        if !first {
            output.push(',');
        }
        write!(output, "\"{key}\":{value}").expect("write scale evidence JSON");
    }

    impl PrivateScaleEvidence {
        fn compact_json(self) -> String {
            let mut output = String::new();
            output.push_str(
                "{\"schemaVersion\":1,\"status\":\"ok\",\"fixtureId\":\"cvn7-stress-v1\",\"counts\":{",
            );
            push_number(&mut output, "measures", self.counts.measures, true);
            push_number(&mut output, "parts", self.counts.parts, false);
            push_number(&mut output, "staves", self.counts.staves, false);
            push_number(
                &mut output,
                "measureContents",
                self.counts.measure_contents,
                false,
            );
            push_number(&mut output, "voices", self.counts.voices, false);
            push_number(&mut output, "events", self.counts.events, false);
            push_number(&mut output, "notes", self.counts.notes, false);
            push_number(&mut output, "extensions", self.counts.extensions, false);
            push_number(
                &mut output,
                "partOwnedExtensions",
                self.counts.part_owned_extensions,
                false,
            );
            push_number(
                &mut output,
                "unknownExtensions",
                self.counts.unknown_extensions,
                false,
            );
            output.push_str("},\"bytes\":{");
            push_number(
                &mut output,
                "canonicalScoreBytes",
                self.bytes.canonical_score_bytes,
                true,
            );
            push_number(
                &mut output,
                "createRequestBytes",
                self.bytes.create_request_bytes,
                false,
            );
            output.push_str("},\"metrics\":{");
            push_number(
                &mut output,
                "entitiesVisited",
                self.metrics.entities_visited,
                true,
            );
            output.push_str(",\"records\":{");
            push_number(
                &mut output,
                "measures",
                self.metrics.records_inserted_by_type.measures,
                true,
            );
            push_number(
                &mut output,
                "parts",
                self.metrics.records_inserted_by_type.parts,
                false,
            );
            push_number(
                &mut output,
                "staves",
                self.metrics.records_inserted_by_type.staffs,
                false,
            );
            push_number(
                &mut output,
                "voices",
                self.metrics.records_inserted_by_type.voices,
                false,
            );
            push_number(
                &mut output,
                "events",
                self.metrics.records_inserted_by_type.events,
                false,
            );
            push_number(
                &mut output,
                "notes",
                self.metrics.records_inserted_by_type.notes,
                false,
            );
            push_number(
                &mut output,
                "extensions",
                self.metrics.records_inserted_by_type.extensions,
                false,
            );
            output.push('}');
            push_number(
                &mut output,
                "topologyEdgesVisited",
                self.metrics.topology_edges_visited,
                false,
            );
            push_number(
                &mut output,
                "referenceEdgesBuilt",
                self.metrics.reference_edges_built,
                false,
            );
            push_number(
                &mut output,
                "timeEntriesBuilt",
                self.metrics.time_entries_built,
                false,
            );
            push_number(
                &mut output,
                "entityIndexLookups",
                self.metrics.entity_index_lookups,
                false,
            );
            push_number(
                &mut output,
                "ownerIndexLookups",
                self.metrics.owner_index_lookups,
                false,
            );
            push_number(
                &mut output,
                "timeIndexComparisons",
                self.metrics.time_index_comparisons,
                false,
            );
            push_number(
                &mut output,
                "indexEntriesBuilt",
                self.metrics.index_entries_built,
                false,
            );
            push_number(
                &mut output,
                "indexRebuildEntries",
                self.metrics.index_rebuild_entries,
                false,
            );
            push_number(
                &mut output,
                "fullDocumentMaterializations",
                self.metrics.full_document_materializations,
                false,
            );
            push_number(
                &mut output,
                "canonicalEncodeBytes",
                self.metrics.canonical_encode_bytes,
                false,
            );
            output.push_str(
                "},\"entityProbe\":{\"stableId\":\"cvn7-e-00-0000-0-0\",\"entityKind\":\"event\"",
            );
            push_number(
                &mut output,
                "entityIndexLookupsDelta",
                self.entity_probe.entity_index_lookups_delta,
                false,
            );
            push_number(
                &mut output,
                "otherCounterDelta",
                self.entity_probe.other_counter_delta,
                false,
            );
            output.push_str(
                "},\"ownerProbe\":{\"entityKind\":\"event\",\"ownerKind\":\"voice\",\"ownerStableId\":\"cvn7-v-00-0000-0\"",
            );
            push_number(
                &mut output,
                "ownerIndexLookupsDelta",
                self.owner_probe.owner_index_lookups_delta,
                false,
            );
            push_number(
                &mut output,
                "otherCounterDelta",
                self.owner_probe.other_counter_delta,
                false,
            );
            output.push_str(
                "},\"parity\":{\"normalizedProjectionEqual\":true,\"indexEntryCountEqual\":true},\"roundTrip\":{\"semanticEqual\":true,\"canonicalBytesEqual\":true},\"ordering\":{\"topologyCanonical\":true,\"extensionsPreserved\":true}",
            );
            push_number(
                &mut output,
                "workloadElapsedMicros",
                self.workload_elapsed_micros,
                false,
            );
            output.push('}');
            output
        }
    }

    fn checked_add(total: &mut usize, value: usize) {
        *total = total.checked_add(value).expect("scale evidence count");
    }

    fn document_counts(document: &ScoreDocumentV1) -> ScaleCounts {
        let mut counts = ScaleCounts {
            measures: document.measure_definitions.len(),
            parts: document.parts.len(),
            staves: 0,
            measure_contents: 0,
            voices: 0,
            events: 0,
            notes: 0,
            extensions: document.extensions.len(),
            part_owned_extensions: 0,
            unknown_extensions: 0,
        };
        for part in &document.parts {
            checked_add(&mut counts.staves, part.staves.len());
            checked_add(&mut counts.measure_contents, part.measure_contents.len());
            for content in &part.measure_contents {
                checked_add(&mut counts.voices, content.voices.len());
                for voice in &content.voices {
                    checked_add(&mut counts.events, voice.sequence.events.len());
                    for event in &voice.sequence.events {
                        if let RhythmicContentV1::Notes { notes } = &event.content {
                            checked_add(&mut counts.notes, notes.len());
                        }
                    }
                }
            }
        }
        for extension in &document.extensions {
            if matches!(&extension.owner, ExtensionOwnerV1::Part { .. }) {
                checked_add(&mut counts.part_owned_extensions, 1);
            }
            if extension.namespace == "fixture.cvn7.unknown" {
                checked_add(&mut counts.unknown_extensions, 1);
            }
        }
        counts
    }

    fn create_request_bytes(score_bytes: &[u8]) -> Vec<u8> {
        let capacity = CREATE_REQUEST_PREFIX
            .len()
            .checked_add(score_bytes.len())
            .and_then(|value| value.checked_add(1))
            .expect("create request length");
        let mut request = Vec::new();
        request
            .try_reserve_exact(capacity)
            .expect("create request reserve");
        request.extend_from_slice(CREATE_REQUEST_PREFIX);
        request.extend_from_slice(score_bytes);
        request.push(b'}');
        request
    }

    fn metric_other_than_entity_lookup_changed(
        before: Rkp2StoreMetrics,
        after: Rkp2StoreMetrics,
    ) -> bool {
        before.entities_visited != after.entities_visited
            || before.records_inserted_by_type != after.records_inserted_by_type
            || before.topology_edges_visited != after.topology_edges_visited
            || before.reference_edges_built != after.reference_edges_built
            || before.time_entries_built != after.time_entries_built
            || before.owner_index_lookups != after.owner_index_lookups
            || before.time_index_comparisons != after.time_index_comparisons
            || before.index_entries_built != after.index_entries_built
            || before.index_rebuild_entries != after.index_rebuild_entries
            || before.full_document_materializations != after.full_document_materializations
            || before.canonical_encode_bytes != after.canonical_encode_bytes
    }

    fn assert_safe_metrics(metrics: Rkp2StoreMetrics) {
        for value in [
            metrics.entities_visited,
            metrics.records_inserted_by_type.measures,
            metrics.records_inserted_by_type.parts,
            metrics.records_inserted_by_type.staffs,
            metrics.records_inserted_by_type.voices,
            metrics.records_inserted_by_type.events,
            metrics.records_inserted_by_type.notes,
            metrics.records_inserted_by_type.extensions,
            metrics.topology_edges_visited,
            metrics.reference_edges_built,
            metrics.time_entries_built,
            metrics.entity_index_lookups,
            metrics.owner_index_lookups,
            metrics.time_index_comparisons,
            metrics.index_entries_built,
            metrics.index_rebuild_entries,
            metrics.full_document_materializations,
            metrics.canonical_encode_bytes,
        ] {
            assert!(value <= MAX_SAFE_INTEGER, "unsafe metric value");
        }
    }

    fn collect_scale_evidence(
        request_bytes: &[u8],
        entity_id: &str,
        expected_owner_id: &str,
    ) -> PrivateScaleEvidence {
        let started = Instant::now();
        assert!(request_bytes.starts_with(CREATE_REQUEST_PREFIX));
        assert_eq!(request_bytes.last(), Some(&b'}'));
        let request = decode_create_request(request_bytes).expect("decode scale create request");
        let document = request.document;
        let counts = document_counts(&document);
        let mut store = build_live_score_store(&document).expect("build scale live store");
        let import_metrics = store.metrics;

        let stable_id = StableId::new(entity_id).expect("stable evidence entity id");
        let entity_before = store.metrics;
        let entity = store
            .lookup_entity(&stable_id)
            .expect("known evidence entity");
        let entity_after = store.metrics;
        assert!(matches!(entity, RuntimeEntityRef::Event(_)));
        let entity_delta = entity_after
            .entity_index_lookups
            .checked_sub(entity_before.entity_index_lookups)
            .expect("entity lookup delta");
        assert_eq!(entity_delta, 1);
        assert!(!metric_other_than_entity_lookup_changed(
            entity_before,
            entity_after
        ));

        let mut owner_probe_metrics = Rkp2StoreMetrics::default();
        let owner = store
            .indices
            .lookup_owner(entity, &mut owner_probe_metrics)
            .expect("known evidence owner");
        let RuntimeOwnerRef::Voice(owner_handle) = owner else {
            panic!("event owner must be voice");
        };
        assert_eq!(
            store.voices.get(owner_handle).expect("owner voice").id,
            id(expected_owner_id)
        );
        assert_eq!(
            owner_probe_metrics,
            Rkp2StoreMetrics {
                owner_index_lookups: 1,
                ..Rkp2StoreMetrics::default()
            }
        );

        let rebuild_metrics =
            verify_index_parity(&store, &store.indices).expect("verify scale index parity");
        assert_eq!(
            rebuild_metrics.index_rebuild_entries,
            import_metrics.index_entries_built
        );
        let exported = store.export_document().expect("export scale document");
        assert_eq!(exported, document);
        let primary_canonical =
            canonical_score_bytes(&exported).expect("primary canonical scale encode");
        let verification_document =
            decode_create_request(&create_request_bytes(&primary_canonical))
                .expect("decode primary canonical scale document")
                .document;
        assert_eq!(verification_document, document);
        assert_eq!(verification_document, exported);
        let verification_canonical = canonical_score_bytes(&verification_document)
            .expect("verification canonical scale encode");
        assert_eq!(primary_canonical, verification_canonical);

        assert_eq!(store.metrics.full_document_materializations, 0);
        assert_eq!(store.metrics.canonical_encode_bytes, 0);
        let metrics = Rkp2StoreMetrics {
            entities_visited: import_metrics.entities_visited,
            records_inserted_by_type: import_metrics.records_inserted_by_type,
            topology_edges_visited: import_metrics.topology_edges_visited,
            reference_edges_built: import_metrics.reference_edges_built,
            time_entries_built: import_metrics.time_entries_built,
            entity_index_lookups: 0,
            owner_index_lookups: 0,
            time_index_comparisons: 0,
            index_entries_built: import_metrics.index_entries_built,
            index_rebuild_entries: rebuild_metrics.index_rebuild_entries,
            full_document_materializations: 1,
            canonical_encode_bytes: primary_canonical.len(),
        };
        assert_safe_metrics(metrics);
        let elapsed = usize::try_from(started.elapsed().as_micros()).expect("elapsed micros");
        assert!(elapsed <= MAX_SAFE_INTEGER);
        PrivateScaleEvidence {
            counts,
            bytes: ScaleBytes {
                canonical_score_bytes: primary_canonical.len(),
                create_request_bytes: request_bytes.len(),
            },
            metrics,
            entity_probe: EntityProbe {
                entity_index_lookups_delta: entity_delta,
                other_counter_delta: 0,
            },
            owner_probe: OwnerProbe {
                owner_index_lookups_delta: owner_probe_metrics.owner_index_lookups,
                other_counter_delta: 0,
            },
            workload_elapsed_micros: elapsed,
        }
    }

    #[test]
    fn private_scale_evidence_small_fixture_is_exact_and_non_persistent() {
        let document = fixture();
        let score_bytes = canonical_score_bytes(&document).expect("canonical small fixture");
        let request = create_request_bytes(&score_bytes);
        let evidence = collect_scale_evidence(&request, "event-a", "voice-a");
        assert_eq!(evidence.counts.measures, 2);
        assert_eq!(evidence.counts.events, 2);
        assert_eq!(evidence.metrics.full_document_materializations, 1);
        assert_eq!(evidence.metrics.canonical_encode_bytes, score_bytes.len());
        let elapsed = evidence.workload_elapsed_micros.to_string();
        let json = evidence.compact_json();
        let expected = [
            "{\"schemaVersion\":1,\"status\":\"ok\",\"fixtureId\":\"cvn7-stress-v1\",\"counts\":{\"measures\":2,\"parts\":1,\"staves\":2,\"measureContents\":2,\"voices\":2,\"events\":2,\"notes\":1,\"extensions\":2,\"partOwnedExtensions\":0,\"unknownExtensions\":0},\"bytes\":{\"canonicalScoreBytes\":1309,\"createRequestBytes\":1337},\"metrics\":{\"entitiesVisited\":11,\"records\":{\"measures\":2,\"parts\":1,\"staves\":2,\"voices\":2,\"events\":2,\"notes\":1,\"extensions\":2},\"topologyEdgesVisited\":14,\"referenceEdgesBuilt\":5,\"timeEntriesBuilt\":2,\"entityIndexLookups\":0,\"ownerIndexLookups\":0,\"timeIndexComparisons\":0,\"indexEntriesBuilt\":36,\"indexRebuildEntries\":36,\"fullDocumentMaterializations\":1,\"canonicalEncodeBytes\":1309},\"entityProbe\":{\"stableId\":\"cvn7-e-00-0000-0-0\",\"entityKind\":\"event\",\"entityIndexLookupsDelta\":1,\"otherCounterDelta\":0},\"ownerProbe\":{\"entityKind\":\"event\",\"ownerKind\":\"voice\",\"ownerStableId\":\"cvn7-v-00-0000-0\",\"ownerIndexLookupsDelta\":1,\"otherCounterDelta\":0},\"parity\":{\"normalizedProjectionEqual\":true,\"indexEntryCountEqual\":true},\"roundTrip\":{\"semanticEqual\":true,\"canonicalBytesEqual\":true},\"ordering\":{\"topologyCanonical\":true,\"extensionsPreserved\":true},\"workloadElapsedMicros\":",
            elapsed.as_str(),
            "}",
        ]
        .concat();
        assert_eq!(json, expected);
        assert!(json.contains("\"entitiesVisited\":11,\"records\":{"));
        let sentinel = format!("{SCALE_RUST_PREFIX}{json}");
        assert_eq!(sentinel.matches(SCALE_RUST_PREFIX).count(), 1);
        assert_eq!(
            sentinel.strip_prefix(SCALE_RUST_PREFIX),
            Some(json.as_str())
        );
        assert!(sentinel.ends_with('}'));
        assert!(!sentinel.contains("RuntimeHandle"));
    }

    #[test]
    fn private_scale_evidence_accepts_noncanonical_extension_payload_order() {
        let canonical_fixture = canonical_score_bytes(&fixture()).expect("canonical small fixture");
        let canonical_text =
            String::from_utf8(canonical_fixture).expect("utf8 canonical small fixture");
        let noncanonical_text = canonical_text.replacen(
            r#""payload":{"z":1}"#,
            r#""payload":{"marker":"small","generatorVersion":1}"#,
            1,
        );
        assert_ne!(noncanonical_text, canonical_text);
        let request = create_request_bytes(noncanonical_text.as_bytes());
        let input_document = decode_create_request(&request)
            .expect("decode noncanonical small request")
            .document;
        let primary_canonical = canonical_score_bytes(&input_document)
            .expect("canonicalize noncanonical small request");
        assert_ne!(noncanonical_text.as_bytes(), primary_canonical.as_slice());
        assert_eq!(noncanonical_text.len(), primary_canonical.len());

        let evidence = collect_scale_evidence(&request, "event-a", "voice-a");
        assert_eq!(
            evidence.bytes.canonical_score_bytes,
            primary_canonical.len()
        );
        assert_eq!(
            evidence.metrics.canonical_encode_bytes,
            primary_canonical.len()
        );
        assert_eq!(evidence.metrics.full_document_materializations, 1);
        assert!(
            evidence
                .compact_json()
                .contains(r#""roundTrip":{"semanticEqual":true,"canonicalBytesEqual":true}"#)
        );
    }

    #[test]
    #[ignore = "executed only by the isolated Stage 6 evidence worker"]
    fn rkp2_stage_6_private_scale_evidence_v1() {
        let request_path = std::env::var_os(SCALE_REQUEST_ENV).expect("scale request env");
        let request_path = Path::new(&request_path);
        assert!(
            request_path.is_absolute(),
            "scale request path must be absolute"
        );
        assert!(
            request_path.is_file(),
            "scale request path must be a regular file"
        );
        let request = fs::read(request_path).expect("read scale request");
        let evidence = collect_scale_evidence(&request, "cvn7-e-00-0000-0-0", "cvn7-v-00-0000-0");
        println!("{SCALE_RUST_PREFIX}{}", evidence.compact_json());
    }
    fn minimal_fixture() -> ScoreDocumentV1 {
        let mut document = fixture();
        document.measure_definitions.remove(0);
        let part = document.parts.first_mut().expect("part");
        part.staves.remove(0);
        part.measure_contents.truncate(1);
        document.extensions.truncate(1);
        document.extensions[0].owner = ExtensionOwnerV1::Part {
            part_id: part.id.clone(),
        };
        document
    }

    #[test]
    fn indices_cover_entity_owner_content_extension_and_core_references() {
        let mut store = build_live_score_store(&fixture()).expect("indexed store");
        assert_eq!(store.metrics.entities_visited, 11);
        assert_eq!(
            store.metrics.records_inserted_by_type,
            RecordsInsertedByType {
                measures: 2,
                parts: 1,
                staffs: 2,
                voices: 2,
                events: 2,
                notes: 1,
                extensions: 2,
            }
        );
        assert_eq!(store.metrics.topology_edges_visited, 14);
        assert_eq!(store.metrics.reference_edges_built, 5);
        assert_eq!(store.metrics.time_entries_built, 2);
        assert_eq!(store.metrics.index_entries_built, 36);
        assert_eq!(store.metrics.full_document_materializations, 0);
        assert_eq!(store.metrics.canonical_encode_bytes, 0);

        let voice_id = id("voice-a");
        let RuntimeEntityRef::Voice(voice) = store.lookup_entity(&voice_id).expect("voice lookup")
        else {
            panic!("typed voice lookup");
        };
        assert!(store.voices.get(voice).is_some());
        assert!(matches!(
            store.lookup_owner(&voice_id),
            Some(RuntimeOwnerRef::PartMeasure(_))
        ));
        assert!(
            store
                .part_measure_content(&id("part-z"), &id("measure-a"))
                .is_some()
        );
        assert_eq!(store.indices.extensions.by_key.len(), 2);
        assert!(
            store
                .indices
                .extensions
                .by_key
                .keys()
                .any(|key| key.namespace == "example.second")
        );

        let projection = normalized_index_projection(&store, &store.indices).expect("projection");
        assert_eq!(projection.entities.len(), 11);
        assert_eq!(projection.ownership.len(), 12);
        assert_eq!(projection.part_measure_contents.len(), 2);
        assert_eq!(projection.voice_times.len(), 2);
        assert_eq!(projection.extensions.len(), 2);
        assert_eq!(projection.references.len(), 5);
        assert!(
            projection
                .references
                .windows(2)
                .all(|pair| pair[0].target <= pair[1].target)
        );
        assert_eq!(
            projection
                .part_measure_contents
                .iter()
                .map(|entry| entry.measure.as_str())
                .collect::<Vec<_>>(),
            ["measure-a", "measure-z"]
        );
    }

    #[test]
    fn indices_metrics_are_exact_and_linear_for_minimal_and_representative_stores() {
        let minimal = build_live_score_store(&minimal_fixture()).expect("minimal store");
        assert_eq!(minimal.metrics.entities_visited, 7);
        assert_eq!(
            minimal.metrics.records_inserted_by_type,
            RecordsInsertedByType {
                measures: 1,
                parts: 1,
                staffs: 1,
                voices: 1,
                events: 1,
                notes: 1,
                extensions: 1,
            }
        );
        assert_eq!(minimal.metrics.topology_edges_visited, 8);
        assert_eq!(minimal.metrics.reference_edges_built, 4);
        assert_eq!(minimal.metrics.time_entries_built, 1);
        assert_eq!(minimal.metrics.index_entries_built, 22);
        assert!(matches!(
            minimal.indices.ownership.extensions.values().next(),
            Some(ExtensionIndexOwner::Part(_))
        ));

        let representative = build_live_score_store(&fixture()).expect("representative store");
        assert_eq!(representative.metrics.entities_visited, 11);
        assert_eq!(representative.metrics.topology_edges_visited, 14);
        assert_eq!(representative.metrics.reference_edges_built, 5);
        assert_eq!(representative.metrics.time_entries_built, 2);
        assert_eq!(representative.metrics.index_entries_built, 36);

        let metrics_source = include_str!("indices.rs").replace("\r\n", "\n");
        let metrics_source = metrics_source
            .split("pub(crate) struct Rkp2StoreMetrics {")
            .nth(1)
            .expect("metrics declaration")
            .split("}\n\n")
            .next()
            .expect("metrics fields");
        assert!(!metrics_source.contains("full_document_lookup_scan"));
        for field in [
            "entities_visited",
            "records_inserted_by_type",
            "topology_edges_visited",
            "reference_edges_built",
            "time_entries_built",
            "entity_index_lookups",
            "owner_index_lookups",
            "time_index_comparisons",
            "index_rebuild_entries",
        ] {
            assert!(metrics_source.contains(field), "{field}");
        }
    }

    #[test]
    fn indices_voice_lookup_then_binary_time_queries_are_exact_and_half_open() {
        let mut store = build_live_score_store(&fixture()).expect("indexed store");
        let lookup_before = store.metrics.entity_index_lookups;
        let comparisons_before = store.metrics.time_index_comparisons;
        let exact = store
            .exact_voice_start(&id("voice-a"), fraction(0, 1))
            .expect("exact start");
        assert_eq!(exact.len(), 1);
        assert_eq!(store.metrics.entity_index_lookups, lookup_before + 1);
        assert!(store.metrics.time_index_comparisons > comparisons_before);

        let overlap = store
            .overlapping_voice_range(&id("voice-a"), fraction(1, 2), fraction(2, 1))
            .expect("half-open overlap");
        assert_eq!(overlap.len(), 1);
        assert_eq!(
            store.overlapping_voice_range(&id("voice-a"), fraction(1, 1), fraction(1, 1)),
            Err(TimeIndexFailure::EmptyOrReversedRange)
        );
        assert_eq!(
            store.exact_voice_start(&id("missing-voice"), fraction(0, 1)),
            Err(TimeIndexFailure::MissingVoice)
        );

        let source = include_str!("store.rs").replace("\r\n", "\n");
        let query = source
            .split("impl LiveScoreStore {")
            .nth(1)
            .expect("query implementation")
            .split("fn stage4_private_query_contract")
            .next()
            .expect("query range");
        assert!(!query.contains(".iter().find"));
        assert!(!query.contains("for "));
        assert!(query.contains("lookup_entity"));
        assert!(query.contains("contents\n            .get"));
    }

    #[test]
    fn indices_rebuild_normalizes_without_handles_and_corruption_never_passes_parity() {
        let store = build_live_score_store(&fixture()).expect("indexed store");
        let primary = normalized_index_projection(&store, &store.indices).expect("primary");
        let (rebuilt, rebuild_metrics) = rebuild_indices_from_store(&store).expect("rebuild");
        let rebuilt_projection = normalized_index_projection(&store, &rebuilt).expect("rebuilt");
        assert_eq!(primary, rebuilt_projection);
        assert_eq!(rebuild_metrics.index_rebuild_entries, 36);
        assert_eq!(rebuild_metrics.reference_edges_built, 5);
        assert_eq!(rebuild_metrics.time_entries_built, 2);
        assert!(verify_index_parity(&store, &store.indices).is_ok());

        let mut corrupted = store.indices.clone();
        corrupted.entity.by_id.remove(&id("event-a"));
        assert_eq!(
            verify_index_parity(&store, &corrupted),
            Err(IndexBuildFailure::MissingRecord)
        );

        let source = include_str!("indices.rs").replace("\r\n", "\n");
        let projection_declaration = source
            .split("pub(crate) struct NormalizedIndexProjection {")
            .nth(1)
            .expect("projection declaration")
            .split("}\n\n")
            .next()
            .expect("projection fields");
        for forbidden in [
            "RuntimeEntityRef",
            "MeasureHandle",
            "PartHandle",
            "StaffHandle",
            "VoiceHandle",
            "EventHandle",
            "NoteHandle",
            "ExtensionHandle",
            "KeyData",
        ] {
            assert!(!projection_declaration.contains(forbidden), "{forbidden}");
        }
    }
    #[test]
    fn source_shape_normalization_is_lf_crlf_invariant() {
        let lf = "pub(crate) struct Rkp2StoreMetrics {\n    entity_index_lookups: usize,\n}\n\n";
        let crlf = lf.replace('\n', "\r\n");
        let normalized_lf = lf.replace("\r\n", "\n");
        let normalized_crlf = crlf.replace("\r\n", "\n");
        assert_eq!(normalized_lf, normalized_crlf);

        for source in [&normalized_lf, &normalized_crlf] {
            let declaration = source
                .split("pub(crate) struct Rkp2StoreMetrics {")
                .nth(1)
                .expect("metrics declaration")
                .split("}\n\n")
                .next()
                .expect("metrics fields");
            assert_eq!(declaration, "\n    entity_index_lookups: usize,\n");
        }
    }
}
