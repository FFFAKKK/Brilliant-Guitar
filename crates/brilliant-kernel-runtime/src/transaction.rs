use std::{
    collections::{HashMap, HashSet},
    hash::Hash,
};

use brilliant_core_types::{DocumentVersionV1, StableId};
use brilliant_kernel_contracts::KernelStage3MetricsV1;
use brilliant_score_foundation::{
    ExactFraction, ExtensionBlockV1, ExtensionOwnerV1, RhythmicContentV1,
};
use slotmap::{Key, SlotMap};

use crate::{
    change_set::{
        ChangeArenaV1, ChangeOpV1, ChangeSetV1, EntityBundleV1, ReferenceAddressV1,
        ReferenceValueV1, ScalarAddressV1, ScalarValueV1, StableAnchorV1, StableEntityAddressV1,
        StableExtensionOwnerV1, StableOrderAddressV1, StableOwnerAddressV1,
    },
    handles::{
        EventHandle, ExtensionHandle, MeasureHandle, NoteHandle, PartHandle, RuntimeEntityRef,
        StaffHandle, VoiceHandle,
    },
    indices::{
        ExtensionIndexKey, ExtensionIndexOwner, StableReferenceAddress, prepared_reference_address,
        sort_prepared_reference_bucket,
    },
    overlay::{CoreBaseReadV1, ExtensionKeyV1, OverlayFailureV1, TransactionOverlayV1},
    records::{
        EventContentKind, EventRecord, ExtensionRecord, MeasureRecord, NoteRecord,
        PartMeasureContentRecord, PartMeasureKey, PartRecord, StaffRecord, VoiceRecord,
    },
    store::LiveScoreStore,
    time_index::{TimeIndexFailure, VoiceTimeIndex},
};

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) enum TransactionPrepareFailureV1 {
    Capacity,
    VersionOverflow,
    InvalidChangeSet,
    PreconditionMismatch,
    LocalInvariant,
    Overlay(OverlayFailureV1),
}

impl From<OverlayFailureV1> for TransactionPrepareFailureV1 {
    fn from(value: OverlayFailureV1) -> Self {
        Self::Overlay(value)
    }
}

impl From<TimeIndexFailure> for TransactionPrepareFailureV1 {
    fn from(_: TimeIndexFailure) -> Self {
        Self::LocalInvariant
    }
}

#[derive(Clone, Copy, Default)]
struct CommitReservationPolicyV1 {
    #[cfg(test)]
    fail: bool,
}

impl CommitReservationPolicyV1 {
    fn production() -> Self {
        Self::default()
    }

    #[cfg(test)]
    const fn fail_all() -> Self {
        Self { fail: true }
    }

    fn slot_map<K: Key, V>(
        self,
        values: &mut SlotMap<K, V>,
        additional: usize,
    ) -> Result<(), TransactionPrepareFailureV1> {
        #[cfg(test)]
        if self.fail {
            return Err(TransactionPrepareFailureV1::Capacity);
        }
        values
            .try_reserve(additional)
            .map_err(|_| TransactionPrepareFailureV1::Capacity)
    }

    fn hash_map<K: Eq + Hash, V>(
        self,
        values: &mut HashMap<K, V>,
        additional: usize,
    ) -> Result<(), TransactionPrepareFailureV1> {
        #[cfg(test)]
        if self.fail {
            return Err(TransactionPrepareFailureV1::Capacity);
        }
        values
            .try_reserve(additional)
            .map_err(|_| TransactionPrepareFailureV1::Capacity)
    }
}

pub(crate) fn commit_change_set(
    store: &mut LiveScoreStore,
    document_version: &mut DocumentVersionV1,
    committed_metrics: &mut KernelStage3MetricsV1,
    change_set: ChangeSetV1,
) -> Result<ChangeSetV1, TransactionPrepareFailureV1> {
    commit_change_set_with_policy(
        store,
        document_version,
        committed_metrics,
        change_set,
        CommitReservationPolicyV1::production(),
    )
}

fn commit_change_set_with_policy(
    store: &mut LiveScoreStore,
    document_version: &mut DocumentVersionV1,
    committed_metrics: &mut KernelStage3MetricsV1,
    change_set: ChangeSetV1,
    policy: CommitReservationPolicyV1,
) -> Result<ChangeSetV1, TransactionPrepareFailureV1> {
    if change_set.forward.is_empty() {
        return Ok(change_set);
    }
    let next_version = document_version
        .checked_next()
        .ok_or(TransactionPrepareFailureV1::VersionOverflow)?;
    let mut plan = CommitPlanV1::prepare(
        store,
        next_version,
        &change_set.arena,
        &change_set.forward,
        &change_set,
    )?;
    plan.reserve(store, policy)?;
    plan.adopt(store, document_version, committed_metrics);
    Ok(change_set)
}

pub(crate) fn apply_stored_operations(
    store: &mut LiveScoreStore,
    document_version: &mut DocumentVersionV1,
    committed_metrics: &mut KernelStage3MetricsV1,
    change_set: &ChangeSetV1,
    operations: &[ChangeOpV1],
) -> Result<(), TransactionPrepareFailureV1> {
    let next_version = document_version
        .checked_next()
        .ok_or(TransactionPrepareFailureV1::VersionOverflow)?;
    let mut plan = CommitPlanV1::prepare(
        store,
        next_version,
        &change_set.arena,
        operations,
        change_set,
    )?;
    plan.reserve(store, CommitReservationPolicyV1::production())?;
    plan.adopt(store, document_version, committed_metrics);
    Ok(())
}

#[derive(Clone, Debug)]
enum StableRecordV1 {
    Measure(MeasureRecord),
    Part(PartRecord),
    Staff(StaffRecord),
    Voice(VoiceRecord),
    Event(EventRecord),
    Note(NoteRecord),
}

impl StableRecordV1 {
    fn address(&self) -> StableEntityAddressV1 {
        match self {
            Self::Measure(value) => StableEntityAddressV1::Measure {
                measure_id: value.id.clone(),
            },
            Self::Part(value) => StableEntityAddressV1::Part {
                part_id: value.id.clone(),
            },
            Self::Staff(value) => StableEntityAddressV1::Staff {
                staff_id: value.id.clone(),
            },
            Self::Voice(value) => StableEntityAddressV1::Voice {
                voice_id: value.id.clone(),
            },
            Self::Event(value) => StableEntityAddressV1::Event {
                event_id: value.id.clone(),
            },
            Self::Note(value) => StableEntityAddressV1::Note {
                note_id: value.id.clone(),
            },
        }
    }
}

#[derive(Default)]
struct DeltaCollectorV1 {
    entity_states: HashMap<StableEntityAddressV1, Option<StableRecordV1>>,
    removed_entities: HashSet<StableEntityAddressV1>,
    order_addresses: Vec<StableOrderAddressV1>,
    order_seen: HashSet<StableOrderAddressV1>,
    scalar_values: HashMap<ScalarAddressV1, ScalarValueV1>,
    reference_states: HashMap<ReferenceAddressV1, Option<ReferenceValueV1>>,
    touched_voice_ids: HashSet<StableId>,
}

impl DeltaCollectorV1 {
    fn with_operation_capacity(count: usize) -> Result<Self, TransactionPrepareFailureV1> {
        let mut value = Self::default();
        value
            .entity_states
            .try_reserve(count)
            .map_err(|_| TransactionPrepareFailureV1::Capacity)?;
        value
            .removed_entities
            .try_reserve(count)
            .map_err(|_| TransactionPrepareFailureV1::Capacity)?;
        value
            .order_addresses
            .try_reserve(count)
            .map_err(|_| TransactionPrepareFailureV1::Capacity)?;
        value
            .order_seen
            .try_reserve(count)
            .map_err(|_| TransactionPrepareFailureV1::Capacity)?;
        value
            .scalar_values
            .try_reserve(count)
            .map_err(|_| TransactionPrepareFailureV1::Capacity)?;
        value
            .reference_states
            .try_reserve(count)
            .map_err(|_| TransactionPrepareFailureV1::Capacity)?;
        value
            .touched_voice_ids
            .try_reserve(count)
            .map_err(|_| TransactionPrepareFailureV1::Capacity)?;
        Ok(value)
    }

    fn touch_order(&mut self, address: StableOrderAddressV1) {
        if self.order_seen.insert(address.clone()) {
            if let StableOrderAddressV1::Events { voice_id } = &address {
                self.touched_voice_ids.insert(voice_id.clone());
            }
            self.order_addresses.push(address);
        }
    }

    fn insert_bundle(&mut self, bundle: &EntityBundleV1) {
        self.record_bundle(bundle, true);
    }

    fn remove_bundle(&mut self, bundle: &EntityBundleV1) {
        self.record_bundle(bundle, false);
    }

    fn record_bundle(&mut self, bundle: &EntityBundleV1, present: bool) {
        append_bundle_delta(self, bundle, present);
    }
}

fn replay_and_collect<'a>(
    store: &'a LiveScoreStore,
    arena: &ChangeArenaV1,
    operations: &[ChangeOpV1],
) -> Result<(TransactionOverlayV1<'a>, DeltaCollectorV1), TransactionPrepareFailureV1> {
    let mut overlay = TransactionOverlayV1::new(store);
    let mut collector = DeltaCollectorV1::with_operation_capacity(operations.len())?;

    for operation in operations {
        match operation {
            ChangeOpV1::ReplaceScalar {
                address,
                expected,
                value,
            } => {
                let expected = arena
                    .scalar(*expected)
                    .ok_or(TransactionPrepareFailureV1::InvalidChangeSet)?;
                if overlay.read_scalar(address).as_ref() != Some(expected) {
                    return Err(TransactionPrepareFailureV1::PreconditionMismatch);
                }
                let value = arena
                    .scalar(*value)
                    .ok_or(TransactionPrepareFailureV1::InvalidChangeSet)?
                    .clone();
                overlay.replace_scalar(address.clone(), value.clone())?;
                collector.scalar_values.insert(address.clone(), value);
                match address {
                    ScalarAddressV1::VoiceSequenceStart { voice_id } => {
                        collector.touched_voice_ids.insert(voice_id.clone());
                    }
                    ScalarAddressV1::EventNoteValue { event_id } => {
                        collect_event_owner_voice(store, &overlay, event_id, &mut collector);
                    }
                    _ => {}
                }
            }
            ChangeOpV1::InsertEntity {
                owner,
                order,
                anchor,
                entity,
            } => {
                let entity = arena
                    .entity(*entity)
                    .ok_or(TransactionPrepareFailureV1::InvalidChangeSet)?
                    .clone();
                let address = entity.root_address();
                overlay.insert_entity(
                    owner.clone(),
                    order.clone(),
                    anchor.clone(),
                    address,
                    entity.clone(),
                )?;
                collector.touch_order(order.clone());
                collector.insert_bundle(&entity);
                collect_root_owner_voice(owner, &mut collector);
            }
            ChangeOpV1::RemoveEntity {
                owner,
                order,
                expected_anchor,
                expected,
            } => {
                let expected = arena
                    .entity(*expected)
                    .ok_or(TransactionPrepareFailureV1::InvalidChangeSet)?
                    .clone();
                let address = expected.root_address();
                if overlay.read_entity(&address).as_ref() != Some(&expected)
                    || current_anchor(
                        &overlay
                            .read_order(order)
                            .ok_or(TransactionPrepareFailureV1::PreconditionMismatch)?,
                        address.stable_id(),
                    )
                    .as_ref()
                        != Some(expected_anchor)
                {
                    return Err(TransactionPrepareFailureV1::PreconditionMismatch);
                }
                overlay.remove_entity(owner.clone(), order.clone(), address)?;
                collector.touch_order(order.clone());
                collector.remove_bundle(&expected);
                collect_root_owner_voice(owner, &mut collector);
            }
            ChangeOpV1::InsertOrderedChild {
                order,
                anchor,
                child_id,
            } => {
                overlay.insert_ordered_child(order.clone(), anchor.clone(), child_id.clone())?;
                collector.touch_order(order.clone());
            }
            ChangeOpV1::RemoveOrderedChild {
                order,
                expected_anchor,
                child_id,
            } => {
                if current_anchor(
                    &overlay
                        .read_order(order)
                        .ok_or(TransactionPrepareFailureV1::PreconditionMismatch)?,
                    child_id,
                )
                .as_ref()
                    != Some(expected_anchor)
                {
                    return Err(TransactionPrepareFailureV1::PreconditionMismatch);
                }
                overlay.remove_ordered_child(order.clone(), child_id.clone())?;
                collector.touch_order(order.clone());
            }
            ChangeOpV1::MoveOrderedChild {
                order,
                child_id,
                expected_anchor,
                anchor,
            } => {
                if current_anchor(
                    &overlay
                        .read_order(order)
                        .ok_or(TransactionPrepareFailureV1::PreconditionMismatch)?,
                    child_id,
                )
                .as_ref()
                    != Some(expected_anchor)
                {
                    return Err(TransactionPrepareFailureV1::PreconditionMismatch);
                }
                overlay.move_ordered_child(order.clone(), child_id.clone(), anchor.clone())?;
                collector.touch_order(order.clone());
            }
            ChangeOpV1::ReplaceOrderedChildren {
                order,
                expected,
                value,
            } => {
                let expected = arena
                    .order(*expected)
                    .ok_or(TransactionPrepareFailureV1::InvalidChangeSet)?;
                if overlay.read_order(order).as_deref() != Some(expected) {
                    return Err(TransactionPrepareFailureV1::PreconditionMismatch);
                }
                let value = arena
                    .order(*value)
                    .ok_or(TransactionPrepareFailureV1::InvalidChangeSet)?
                    .to_vec();
                overlay.replace_ordered_children(order.clone(), value)?;
                collector.touch_order(order.clone());
            }
            ChangeOpV1::InsertExtensionBlock { anchor, value } => {
                let value = arena
                    .extension(*value)
                    .ok_or(TransactionPrepareFailureV1::InvalidChangeSet)?
                    .clone();
                overlay.insert_extension(anchor.clone(), value)?;
            }
            ChangeOpV1::ReplaceExtensionBlock {
                namespace,
                owner,
                expected,
                value,
            } => {
                let key = ExtensionKeyV1 {
                    namespace: namespace.clone(),
                    owner: owner.clone(),
                };
                let expected = arena
                    .extension(*expected)
                    .ok_or(TransactionPrepareFailureV1::InvalidChangeSet)?;
                if overlay
                    .read_extension(&key)
                    .map(|value| value.value)
                    .as_ref()
                    != Some(expected)
                {
                    return Err(TransactionPrepareFailureV1::PreconditionMismatch);
                }
                let value = arena
                    .extension(*value)
                    .ok_or(TransactionPrepareFailureV1::InvalidChangeSet)?
                    .clone();
                overlay.replace_extension(key, value)?;
            }
            ChangeOpV1::RemoveExtensionBlock {
                expected_anchor,
                expected,
            } => {
                let expected = arena
                    .extension(*expected)
                    .ok_or(TransactionPrepareFailureV1::InvalidChangeSet)?
                    .clone();
                let key = ExtensionKeyV1::from_block(&expected);
                let current = overlay
                    .read_extension(&key)
                    .ok_or(TransactionPrepareFailureV1::PreconditionMismatch)?;
                if current.value != expected || current.anchor != *expected_anchor {
                    return Err(TransactionPrepareFailureV1::PreconditionMismatch);
                }
                overlay.remove_extension(key)?;
            }
            ChangeOpV1::UpdateReference {
                address,
                expected,
                value,
            } => {
                let expected = arena
                    .reference(*expected)
                    .ok_or(TransactionPrepareFailureV1::InvalidChangeSet)?;
                if overlay.read_reference(address).as_ref() != Some(expected) {
                    return Err(TransactionPrepareFailureV1::PreconditionMismatch);
                }
                let value = arena
                    .reference(*value)
                    .ok_or(TransactionPrepareFailureV1::InvalidChangeSet)?
                    .clone();
                overlay.update_reference(address.clone(), value.clone())?;
                collector
                    .reference_states
                    .insert(address.clone(), Some(value));
            }
        }
    }
    Ok((overlay, collector))
}

fn current_anchor(values: &[StableId], child: &StableId) -> Option<StableAnchorV1> {
    let index = values.iter().position(|candidate| candidate == child)?;
    if index == 0 {
        Some(StableAnchorV1::Start)
    } else {
        Some(StableAnchorV1::After {
            sibling_id: values[index - 1].clone(),
        })
    }
}

fn collect_root_owner_voice(owner: &StableOwnerAddressV1, collector: &mut DeltaCollectorV1) {
    if let StableOwnerAddressV1::Voice { voice_id } = owner {
        collector.touched_voice_ids.insert(voice_id.clone());
    }
}

fn collect_event_owner_voice(
    store: &LiveScoreStore,
    overlay: &TransactionOverlayV1<'_>,
    event_id: &StableId,
    collector: &mut DeltaCollectorV1,
) {
    let address = StableEntityAddressV1::Event {
        event_id: event_id.clone(),
    };
    if let Some(StableOwnerAddressV1::Voice { voice_id }) = overlay
        .read_owner(&address)
        .or_else(|| store.read_owner(&address))
    {
        collector.touched_voice_ids.insert(voice_id);
    }
}

fn append_bundle_delta(collector: &mut DeltaCollectorV1, bundle: &EntityBundleV1, present: bool) {
    let record = root_record(bundle);
    let address = record.address();
    clear_collected_scalars(&mut collector.scalar_values, &address);
    if present {
        collector.entity_states.insert(address, Some(record));
    } else {
        collector.removed_entities.insert(address.clone());
        collector.entity_states.insert(address, None);
    }

    match bundle {
        EntityBundleV1::Measure(bundle) => {
            for content in &bundle.contents {
                collector.touch_order(StableOrderAddressV1::Voices {
                    part_id: content.part_id.clone(),
                    measure_id: bundle.definition.id.clone(),
                });
                collector.reference_states.insert(
                    ReferenceAddressV1::PartMeasureLink {
                        part_id: content.part_id.clone(),
                        measure_id: bundle.definition.id.clone(),
                    },
                    present.then_some(ReferenceValueV1::Present(true)),
                );
                for voice in &content.voices {
                    append_bundle_delta(collector, &EntityBundleV1::Voice(voice.clone()), present);
                }
            }
        }
        EntityBundleV1::Part(bundle) => {
            let part_id = bundle.part.id.clone();
            collector.touch_order(StableOrderAddressV1::Staffs {
                part_id: part_id.clone(),
            });
            collector.touch_order(StableOrderAddressV1::MeasureContents {
                part_id: part_id.clone(),
            });
            for staff in &bundle.part.staves {
                append_bundle_delta(collector, &EntityBundleV1::Staff(staff.clone()), present);
            }
            for content in &bundle.part.measure_contents {
                collector.touch_order(StableOrderAddressV1::Voices {
                    part_id: part_id.clone(),
                    measure_id: content.measure_id.clone(),
                });
                collector.reference_states.insert(
                    ReferenceAddressV1::PartMeasureLink {
                        part_id: part_id.clone(),
                        measure_id: content.measure_id.clone(),
                    },
                    present.then_some(ReferenceValueV1::Present(true)),
                );
                for voice in &content.voices {
                    append_bundle_delta(collector, &EntityBundleV1::Voice(voice.clone()), present);
                }
            }
        }
        EntityBundleV1::Voice(voice) => {
            collector.touched_voice_ids.insert(voice.id.clone());
            collector.touch_order(StableOrderAddressV1::Events {
                voice_id: voice.id.clone(),
            });
            collector.reference_states.insert(
                ReferenceAddressV1::VoiceDefaultStaff {
                    voice_id: voice.id.clone(),
                },
                present.then(|| ReferenceValueV1::StableId(voice.default_staff_id.clone())),
            );
            for event in &voice.sequence.events {
                append_bundle_delta(collector, &EntityBundleV1::Event(event.clone()), present);
            }
        }
        EntityBundleV1::Event(event) => {
            collector.touch_order(StableOrderAddressV1::Notes {
                event_id: event.id.clone(),
            });
            collector.reference_states.insert(
                ReferenceAddressV1::EventStaffAssignment {
                    event_id: event.id.clone(),
                },
                present.then(|| ReferenceValueV1::OptionalStableId(event.staff_id.clone())),
            );
            if let RhythmicContentV1::Notes { notes } = &event.content {
                for note in notes {
                    append_bundle_delta(collector, &EntityBundleV1::Note(note.clone()), present);
                }
            }
        }
        EntityBundleV1::Staff(_) | EntityBundleV1::Note(_) => {}
    }
}

fn clear_collected_scalars(
    scalars: &mut HashMap<ScalarAddressV1, ScalarValueV1>,
    address: &StableEntityAddressV1,
) {
    scalars.retain(|scalar, _| scalar_entity_address(scalar) != *address);
}

fn root_record(bundle: &EntityBundleV1) -> StableRecordV1 {
    match bundle {
        EntityBundleV1::Measure(bundle) => StableRecordV1::Measure(MeasureRecord {
            id: bundle.definition.id.clone(),
            meter: bundle.definition.meter.clone(),
            pickup_duration: bundle.definition.pickup_duration.clone(),
        }),
        EntityBundleV1::Part(bundle) => StableRecordV1::Part(PartRecord {
            id: bundle.part.id.clone(),
            name: bundle.part.name.clone(),
            instrument: bundle.part.instrument.clone(),
        }),
        EntityBundleV1::Staff(staff) => StableRecordV1::Staff(StaffRecord {
            id: staff.id.clone(),
            line_count: staff.line_count,
            default_clef: staff.default_clef.clone(),
        }),
        EntityBundleV1::Voice(voice) => StableRecordV1::Voice(VoiceRecord {
            id: voice.id.clone(),
            default_staff_id: voice.default_staff_id.clone(),
            sequence_start: voice.sequence.start.clone(),
        }),
        EntityBundleV1::Event(event) => StableRecordV1::Event(EventRecord {
            id: event.id.clone(),
            duration: event.duration.clone(),
            staff_id: event.staff_id.clone(),
            content_kind: match event.content {
                RhythmicContentV1::Rest => EventContentKind::Rest,
                RhythmicContentV1::Notes { .. } => EventContentKind::Notes,
            },
        }),
        EntityBundleV1::Note(note) => StableRecordV1::Note(NoteRecord {
            id: note.id.clone(),
            written_pitch: note.written_pitch.clone(),
        }),
    }
}

#[derive(Default)]
struct ExtensionSimulationV1 {
    order: Vec<ExtensionKeyV1>,
    values: HashMap<ExtensionKeyV1, ExtensionBlockV1>,
    base_handles: HashMap<ExtensionKeyV1, ExtensionHandle>,
    touched: HashSet<ExtensionKeyV1>,
    removed: HashSet<ExtensionKeyV1>,
}

impl ExtensionSimulationV1 {
    fn from_store(store: &LiveScoreStore) -> Result<Self, TransactionPrepareFailureV1> {
        let capacity = store.topology.extension_order.len();
        let mut value = Self::default();
        value
            .order
            .try_reserve_exact(capacity)
            .map_err(|_| TransactionPrepareFailureV1::Capacity)?;
        value
            .values
            .try_reserve(capacity)
            .map_err(|_| TransactionPrepareFailureV1::Capacity)?;
        value
            .base_handles
            .try_reserve(capacity)
            .map_err(|_| TransactionPrepareFailureV1::Capacity)?;
        value
            .touched
            .try_reserve(capacity)
            .map_err(|_| TransactionPrepareFailureV1::Capacity)?;
        value
            .removed
            .try_reserve(capacity)
            .map_err(|_| TransactionPrepareFailureV1::Capacity)?;
        for handle in &store.topology.extension_order {
            let record = store
                .extensions
                .get(*handle)
                .ok_or(TransactionPrepareFailureV1::LocalInvariant)?;
            let block = extension_block(record);
            let key = ExtensionKeyV1::from_block(&block);
            if value.values.insert(key.clone(), block).is_some()
                || value.base_handles.insert(key.clone(), *handle).is_some()
            {
                return Err(TransactionPrepareFailureV1::LocalInvariant);
            }
            value.order.push(key);
        }
        Ok(value)
    }

    fn apply_operations(
        &mut self,
        arena: &ChangeArenaV1,
        operations: &[ChangeOpV1],
    ) -> Result<(), TransactionPrepareFailureV1> {
        for operation in operations {
            match operation {
                ChangeOpV1::InsertEntity { entity, .. } => {
                    let entity = arena
                        .entity(*entity)
                        .ok_or(TransactionPrepareFailureV1::InvalidChangeSet)?;
                    if let EntityBundleV1::Part(bundle) = entity {
                        for extension in &bundle.extensions {
                            self.insert(extension.anchor.clone(), extension.value.clone())?;
                        }
                    }
                }
                ChangeOpV1::RemoveEntity { expected, .. } => {
                    let expected = arena
                        .entity(*expected)
                        .ok_or(TransactionPrepareFailureV1::InvalidChangeSet)?;
                    if let EntityBundleV1::Part(bundle) = expected {
                        for extension in &bundle.extensions {
                            self.remove_aggregate(&extension.value)?;
                        }
                    }
                }
                ChangeOpV1::InsertExtensionBlock { anchor, value } => {
                    let value = arena
                        .extension(*value)
                        .ok_or(TransactionPrepareFailureV1::InvalidChangeSet)?
                        .clone();
                    self.insert(anchor.clone(), value)?;
                }
                ChangeOpV1::ReplaceExtensionBlock {
                    namespace,
                    owner,
                    expected,
                    value,
                } => {
                    let key = ExtensionKeyV1 {
                        namespace: namespace.clone(),
                        owner: owner.clone(),
                    };
                    let expected = arena
                        .extension(*expected)
                        .ok_or(TransactionPrepareFailureV1::InvalidChangeSet)?;
                    if self.values.get(&key) != Some(expected) {
                        return Err(TransactionPrepareFailureV1::PreconditionMismatch);
                    }
                    let value = arena
                        .extension(*value)
                        .ok_or(TransactionPrepareFailureV1::InvalidChangeSet)?
                        .clone();
                    if ExtensionKeyV1::from_block(&value) != key {
                        return Err(TransactionPrepareFailureV1::LocalInvariant);
                    }
                    self.values.insert(key.clone(), value);
                    self.touched.insert(key);
                }
                ChangeOpV1::RemoveExtensionBlock {
                    expected_anchor,
                    expected,
                } => {
                    let expected = arena
                        .extension(*expected)
                        .ok_or(TransactionPrepareFailureV1::InvalidChangeSet)?;
                    let key = ExtensionKeyV1::from_block(expected);
                    if self.values.get(&key) != Some(expected)
                        || self.anchor_of(&key).as_ref() != Some(expected_anchor)
                    {
                        return Err(TransactionPrepareFailureV1::PreconditionMismatch);
                    }
                    self.remove_key(&key)?;
                }
                _ => {}
            }
        }
        Ok(())
    }

    fn insert(
        &mut self,
        anchor: StableAnchorV1,
        value: ExtensionBlockV1,
    ) -> Result<(), TransactionPrepareFailureV1> {
        let key = ExtensionKeyV1::from_block(&value);
        if self.values.contains_key(&key) {
            return Err(TransactionPrepareFailureV1::PreconditionMismatch);
        }
        let index = self.insertion_index(&anchor)?;
        self.order.insert(index, key.clone());
        self.values.insert(key.clone(), value);
        self.touched.insert(key);
        Ok(())
    }

    fn remove_aggregate(
        &mut self,
        expected: &ExtensionBlockV1,
    ) -> Result<(), TransactionPrepareFailureV1> {
        let key = ExtensionKeyV1::from_block(expected);
        if self.values.get(&key) != Some(expected) {
            return Err(TransactionPrepareFailureV1::PreconditionMismatch);
        }
        self.remove_key(&key)
    }

    fn remove_key(&mut self, key: &ExtensionKeyV1) -> Result<(), TransactionPrepareFailureV1> {
        let index = self
            .order
            .iter()
            .position(|candidate| candidate == key)
            .ok_or(TransactionPrepareFailureV1::PreconditionMismatch)?;
        self.order.remove(index);
        self.values
            .remove(key)
            .ok_or(TransactionPrepareFailureV1::PreconditionMismatch)?;
        self.touched.insert(key.clone());
        self.removed.insert(key.clone());
        Ok(())
    }

    fn anchor_of(&self, key: &ExtensionKeyV1) -> Option<StableAnchorV1> {
        let index = self.order.iter().position(|candidate| candidate == key)?;
        if index == 0 {
            Some(StableAnchorV1::Start)
        } else {
            Some(StableAnchorV1::After {
                sibling_id: extension_anchor_id_from_key(&self.order[index - 1]),
            })
        }
    }

    fn insertion_index(
        &self,
        anchor: &StableAnchorV1,
    ) -> Result<usize, TransactionPrepareFailureV1> {
        match anchor {
            StableAnchorV1::Start => Ok(0),
            StableAnchorV1::After { sibling_id } => self
                .order
                .iter()
                .position(|key| extension_anchor_id_from_key(key) == *sibling_id)
                .map(|index| index + 1)
                .ok_or(TransactionPrepareFailureV1::PreconditionMismatch),
        }
    }
}

fn extension_block(record: &ExtensionRecord) -> ExtensionBlockV1 {
    ExtensionBlockV1 {
        namespace: record.namespace.clone(),
        schema_version: record.schema_version,
        owner: record.owner.clone(),
        payload: record.payload.clone(),
    }
}

fn extension_record(value: ExtensionBlockV1) -> ExtensionRecord {
    ExtensionRecord {
        namespace: value.namespace,
        schema_version: value.schema_version,
        owner: value.owner,
        payload: value.payload,
    }
}

fn extension_anchor_id_from_key(key: &ExtensionKeyV1) -> StableId {
    let owner = match &key.owner {
        StableExtensionOwnerV1::Score => "score".to_owned(),
        StableExtensionOwnerV1::Part { part_id } => format!("part:{}", part_id.as_str()),
    };
    StableId::new(format!("extension:{owner}:{}", key.namespace))
        .expect("extension anchor is non-empty")
}

struct InsertRecordV1<R> {
    id: StableId,
    value: R,
}

struct ReplaceRecordV1<H, R> {
    handle: H,
    value: R,
}

#[derive(Clone)]
struct RemoveRecordV1<H> {
    id: StableId,
    handle: H,
    retain_identity: bool,
}

struct EntityRecordPlanV1 {
    insert_measures: Vec<InsertRecordV1<MeasureRecord>>,
    replace_measures: Vec<ReplaceRecordV1<MeasureHandle, MeasureRecord>>,
    remove_measures: Vec<RemoveRecordV1<MeasureHandle>>,
    insert_parts: Vec<InsertRecordV1<PartRecord>>,
    replace_parts: Vec<ReplaceRecordV1<PartHandle, PartRecord>>,
    remove_parts: Vec<RemoveRecordV1<PartHandle>>,
    insert_staffs: Vec<InsertRecordV1<StaffRecord>>,
    replace_staffs: Vec<ReplaceRecordV1<StaffHandle, StaffRecord>>,
    remove_staffs: Vec<RemoveRecordV1<StaffHandle>>,
    insert_voices: Vec<InsertRecordV1<VoiceRecord>>,
    replace_voices: Vec<ReplaceRecordV1<VoiceHandle, VoiceRecord>>,
    remove_voices: Vec<RemoveRecordV1<VoiceHandle>>,
    insert_events: Vec<InsertRecordV1<EventRecord>>,
    replace_events: Vec<ReplaceRecordV1<EventHandle, EventRecord>>,
    remove_events: Vec<RemoveRecordV1<EventHandle>>,
    insert_notes: Vec<InsertRecordV1<NoteRecord>>,
    replace_notes: Vec<ReplaceRecordV1<NoteHandle, NoteRecord>>,
    remove_notes: Vec<RemoveRecordV1<NoteHandle>>,
    inserted_ids: HashSet<StableId>,
    inserted_owners: Vec<(StableEntityAddressV1, StableOwnerAddressV1)>,
}

impl EntityRecordPlanV1 {
    fn with_capacity(capacity: usize) -> Result<Self, TransactionPrepareFailureV1> {
        let mut value = Self {
            insert_measures: Vec::new(),
            replace_measures: Vec::new(),
            remove_measures: Vec::new(),
            insert_parts: Vec::new(),
            replace_parts: Vec::new(),
            remove_parts: Vec::new(),
            insert_staffs: Vec::new(),
            replace_staffs: Vec::new(),
            remove_staffs: Vec::new(),
            insert_voices: Vec::new(),
            replace_voices: Vec::new(),
            remove_voices: Vec::new(),
            insert_events: Vec::new(),
            replace_events: Vec::new(),
            remove_events: Vec::new(),
            insert_notes: Vec::new(),
            replace_notes: Vec::new(),
            remove_notes: Vec::new(),
            inserted_ids: HashSet::new(),
            inserted_owners: Vec::new(),
        };
        value
            .inserted_ids
            .try_reserve(capacity)
            .map_err(|_| TransactionPrepareFailureV1::Capacity)?;
        value
            .inserted_owners
            .try_reserve(capacity)
            .map_err(|_| TransactionPrepareFailureV1::Capacity)?;
        reserve_vec(&mut value.insert_measures, capacity)?;
        reserve_vec(&mut value.replace_measures, capacity)?;
        reserve_vec(&mut value.remove_measures, capacity)?;
        reserve_vec(&mut value.insert_parts, capacity)?;
        reserve_vec(&mut value.replace_parts, capacity)?;
        reserve_vec(&mut value.remove_parts, capacity)?;
        reserve_vec(&mut value.insert_staffs, capacity)?;
        reserve_vec(&mut value.replace_staffs, capacity)?;
        reserve_vec(&mut value.remove_staffs, capacity)?;
        reserve_vec(&mut value.insert_voices, capacity)?;
        reserve_vec(&mut value.replace_voices, capacity)?;
        reserve_vec(&mut value.remove_voices, capacity)?;
        reserve_vec(&mut value.insert_events, capacity)?;
        reserve_vec(&mut value.replace_events, capacity)?;
        reserve_vec(&mut value.remove_events, capacity)?;
        reserve_vec(&mut value.insert_notes, capacity)?;
        reserve_vec(&mut value.replace_notes, capacity)?;
        reserve_vec(&mut value.remove_notes, capacity)?;
        Ok(value)
    }

    fn insertion_count(&self) -> usize {
        self.insert_measures.len()
            + self.insert_parts.len()
            + self.insert_staffs.len()
            + self.insert_voices.len()
            + self.insert_events.len()
            + self.insert_notes.len()
    }

    fn removal_count(&self) -> usize {
        self.remove_measures.len()
            + self.remove_parts.len()
            + self.remove_staffs.len()
            + self.remove_voices.len()
            + self.remove_events.len()
            + self.remove_notes.len()
    }
}

fn reserve_vec<T>(values: &mut Vec<T>, capacity: usize) -> Result<(), TransactionPrepareFailureV1> {
    values
        .try_reserve(capacity)
        .map_err(|_| TransactionPrepareFailureV1::Capacity)
}

struct PreparedHandleVectorV1<H> {
    values: Vec<H>,
    patches: Vec<(usize, StableId)>,
}

enum PreparedOrderMutationV1 {
    Measures(PreparedHandleVectorV1<MeasureHandle>),
    Parts(PreparedHandleVectorV1<PartHandle>),
    Staffs {
        old_owner: Option<PartHandle>,
        owner_id: StableId,
        value: Option<PreparedHandleVectorV1<StaffHandle>>,
    },
    MeasureContents {
        old_owner: Option<PartHandle>,
        owner_id: StableId,
        value: Option<PreparedHandleVectorV1<MeasureHandle>>,
    },
    Voices {
        old_key: Option<PartMeasureKey>,
        part_id: StableId,
        measure_id: StableId,
        value: Option<PreparedHandleVectorV1<VoiceHandle>>,
    },
    Events {
        old_owner: Option<VoiceHandle>,
        owner_id: StableId,
        value: Option<PreparedHandleVectorV1<EventHandle>>,
    },
    Notes {
        old_owner: Option<EventHandle>,
        owner_id: StableId,
        value: Option<PreparedHandleVectorV1<NoteHandle>>,
    },
}

struct PreparedVoiceTimeV1 {
    old_voice: Option<VoiceHandle>,
    voice_id: StableId,
    value: Option<VoiceTimeIndex>,
    patches: Vec<(usize, StableId)>,
}

struct InsertExtensionV1 {
    token: usize,
    key: ExtensionKeyV1,
    value: Option<ExtensionRecord>,
    index_bucket: Vec<ExtensionHandle>,
}

struct ReplaceExtensionV1 {
    handle: ExtensionHandle,
    value: ExtensionRecord,
}

struct RemoveExtensionV1 {
    handle: ExtensionHandle,
    index_key: ExtensionIndexKey,
}

#[derive(Default)]
struct ExtensionPlanV1 {
    insertions: Vec<InsertExtensionV1>,
    replacements: Vec<ReplaceExtensionV1>,
    removals: Vec<RemoveExtensionV1>,
    order: Option<Vec<ExtensionHandle>>,
    order_patches: Vec<(usize, usize)>,
    bindings: Vec<ExtensionHandle>,
}

struct PreparedReferenceBucketV1 {
    target: StableId,
    value: Option<Vec<StableReferenceAddress>>,
}

struct CommitPlanV1 {
    next_version: DocumentVersionV1,
    metrics: KernelStage3MetricsV1,
    header_metadata: Option<brilliant_score_foundation::ScoreMetadataV1>,
    records: EntityRecordPlanV1,
    orders: Vec<PreparedOrderMutationV1>,
    extensions: ExtensionPlanV1,
    voice_times: Vec<PreparedVoiceTimeV1>,
    reference_buckets: Vec<PreparedReferenceBucketV1>,
}

impl CommitPlanV1 {
    fn prepare(
        store: &LiveScoreStore,
        next_version: DocumentVersionV1,
        arena: &ChangeArenaV1,
        operations: &[ChangeOpV1],
        change_set: &ChangeSetV1,
    ) -> Result<Self, TransactionPrepareFailureV1> {
        let mut extension_simulation = if operations_touch_extensions(arena, operations)? {
            ExtensionSimulationV1::from_store(store)?
        } else {
            ExtensionSimulationV1::default()
        };
        extension_simulation.apply_operations(arena, operations)?;
        let (mut overlay, mut collector) = replay_and_collect(store, arena, operations)?;

        add_extension_reference_states(&extension_simulation, &mut collector);
        validate_coverage(store, &overlay, &collector)?;
        validate_reference_states(&overlay, &collector.reference_states)?;
        validate_removed_reference_targets(store, &collector)?;

        let (header_metadata, final_records) = prepare_final_records(store, &collector)?;
        let records = prepare_record_actions(store, &collector, final_records, &overlay)?;
        let orders = prepare_orders(store, &overlay, &collector, &records.inserted_ids)?;
        let extensions = prepare_extensions(store, &overlay, extension_simulation)?;
        let voice_times =
            prepare_voice_times(store, &mut overlay, &collector, &records.inserted_ids)?;
        let reference_buckets = prepare_reference_buckets(store, &collector.reference_states)?;

        let overlay_metrics = overlay.metrics().clone();
        let index_entries_removed = records
            .removal_count()
            .saturating_mul(2)
            .saturating_add(extensions.removals.len().saturating_mul(2))
            .saturating_add(
                voice_times
                    .iter()
                    .filter(|entry| entry.old_voice.is_some())
                    .count(),
            )
            .saturating_add(reference_removed_count(store, &collector.reference_states));
        let index_entries_inserted = records
            .insertion_count()
            .saturating_mul(2)
            .saturating_add(extensions.insertions.len().saturating_mul(2))
            .saturating_add(
                voice_times
                    .iter()
                    .filter(|entry| entry.value.is_some())
                    .count(),
            )
            .saturating_add(reference_inserted_count(&collector.reference_states));
        let metrics = KernelStage3MetricsV1 {
            full_document_scans: 0,
            full_document_clones: 0,
            full_semantic_validations: 0,
            full_snapshot_materializations: 0,
            entities_visited: u64::try_from(collector.entity_states.len())
                .map_err(|_| TransactionPrepareFailureV1::LocalInvariant)?,
            entity_index_lookups: overlay_metrics.base_entity_lookups,
            owner_index_lookups: 0,
            time_index_comparisons: 0,
            overlay_records: overlay_metrics.overlay_record_writes,
            order_collections_copied: overlay_metrics.order_copies,
            change_ops: u64::try_from(operations.len())
                .map_err(|_| TransactionPrepareFailureV1::LocalInvariant)?,
            changeset_logical_bytes: change_set.logical_bytes,
            affected_addresses: u64::try_from(change_set.affected.len())
                .map_err(|_| TransactionPrepareFailureV1::LocalInvariant)?,
            index_entries_removed: u64::try_from(index_entries_removed)
                .map_err(|_| TransactionPrepareFailureV1::LocalInvariant)?,
            index_entries_inserted: u64::try_from(index_entries_inserted)
                .map_err(|_| TransactionPrepareFailureV1::LocalInvariant)?,
            ffi_request_bytes: 0,
            ffi_response_bytes: 0,
        };

        Ok(Self {
            next_version,
            metrics,
            header_metadata,
            records,
            orders,
            extensions,
            voice_times,
            reference_buckets,
        })
    }
}

fn operations_touch_extensions(
    arena: &ChangeArenaV1,
    operations: &[ChangeOpV1],
) -> Result<bool, TransactionPrepareFailureV1> {
    for operation in operations {
        match operation {
            ChangeOpV1::InsertExtensionBlock { .. }
            | ChangeOpV1::ReplaceExtensionBlock { .. }
            | ChangeOpV1::RemoveExtensionBlock { .. } => return Ok(true),
            ChangeOpV1::InsertEntity { entity, .. } => {
                let entity = arena
                    .entity(*entity)
                    .ok_or(TransactionPrepareFailureV1::InvalidChangeSet)?;
                if matches!(entity, EntityBundleV1::Part(bundle) if !bundle.extensions.is_empty()) {
                    return Ok(true);
                }
            }
            ChangeOpV1::RemoveEntity { expected, .. } => {
                let entity = arena
                    .entity(*expected)
                    .ok_or(TransactionPrepareFailureV1::InvalidChangeSet)?;
                if matches!(entity, EntityBundleV1::Part(bundle) if !bundle.extensions.is_empty()) {
                    return Ok(true);
                }
            }
            _ => {}
        }
    }
    Ok(false)
}

fn patch_measure_order(
    store: &LiveScoreStore,
    mut prepared: PreparedHandleVectorV1<MeasureHandle>,
) -> Vec<MeasureHandle> {
    for (index, id) in prepared.patches {
        prepared.values[index] = committed_measure(store, &id);
    }
    prepared.values
}

fn patch_part_order(
    store: &LiveScoreStore,
    mut prepared: PreparedHandleVectorV1<PartHandle>,
) -> Vec<PartHandle> {
    for (index, id) in prepared.patches {
        prepared.values[index] = committed_part(store, &id);
    }
    prepared.values
}

fn patch_staff_order(
    store: &LiveScoreStore,
    mut prepared: PreparedHandleVectorV1<StaffHandle>,
) -> Vec<StaffHandle> {
    for (index, id) in prepared.patches {
        prepared.values[index] = committed_staff(store, &id);
    }
    prepared.values
}

fn patch_voice_order(
    store: &LiveScoreStore,
    mut prepared: PreparedHandleVectorV1<VoiceHandle>,
) -> Vec<VoiceHandle> {
    for (index, id) in prepared.patches {
        prepared.values[index] = committed_voice(store, &id);
    }
    prepared.values
}

fn patch_event_order(
    store: &LiveScoreStore,
    mut prepared: PreparedHandleVectorV1<EventHandle>,
) -> Vec<EventHandle> {
    for (index, id) in prepared.patches {
        prepared.values[index] = committed_event(store, &id);
    }
    prepared.values
}

fn patch_note_order(
    store: &LiveScoreStore,
    mut prepared: PreparedHandleVectorV1<NoteHandle>,
) -> Vec<NoteHandle> {
    for (index, id) in prepared.patches {
        prepared.values[index] = committed_note(store, &id);
    }
    prepared.values
}

fn committed_measure(store: &LiveScoreStore, id: &StableId) -> MeasureHandle {
    match store.indices.entity.by_id.get(id).copied() {
        Some(RuntimeEntityRef::Measure(handle)) if store.measures.contains_key(handle) => handle,
        _ => panic!("preflighted measure binding"),
    }
}

fn committed_part(store: &LiveScoreStore, id: &StableId) -> PartHandle {
    match store.indices.entity.by_id.get(id).copied() {
        Some(RuntimeEntityRef::Part(handle)) if store.parts.contains_key(handle) => handle,
        _ => panic!("preflighted part binding"),
    }
}

fn committed_staff(store: &LiveScoreStore, id: &StableId) -> StaffHandle {
    match store.indices.entity.by_id.get(id).copied() {
        Some(RuntimeEntityRef::Staff(handle)) if store.staffs.contains_key(handle) => handle,
        _ => panic!("preflighted staff binding"),
    }
}

fn committed_voice(store: &LiveScoreStore, id: &StableId) -> VoiceHandle {
    match store.indices.entity.by_id.get(id).copied() {
        Some(RuntimeEntityRef::Voice(handle)) if store.voices.contains_key(handle) => handle,
        _ => panic!("preflighted voice binding"),
    }
}

fn committed_event(store: &LiveScoreStore, id: &StableId) -> EventHandle {
    match store.indices.entity.by_id.get(id).copied() {
        Some(RuntimeEntityRef::Event(handle)) if store.events.contains_key(handle) => handle,
        _ => panic!("preflighted event binding"),
    }
}

fn committed_note(store: &LiveScoreStore, id: &StableId) -> NoteHandle {
    match store.indices.entity.by_id.get(id).copied() {
        Some(RuntimeEntityRef::Note(handle)) if store.notes.contains_key(handle) => handle,
        _ => panic!("preflighted note binding"),
    }
}

fn prepare_final_records(
    store: &LiveScoreStore,
    collector: &DeltaCollectorV1,
) -> Result<
    (
        Option<brilliant_score_foundation::ScoreMetadataV1>,
        HashMap<StableEntityAddressV1, StableRecordV1>,
    ),
    TransactionPrepareFailureV1,
> {
    let mut final_records = HashMap::new();
    final_records
        .try_reserve(
            collector
                .entity_states
                .len()
                .saturating_add(collector.scalar_values.len())
                .saturating_add(collector.reference_states.len()),
        )
        .map_err(|_| TransactionPrepareFailureV1::Capacity)?;
    for (address, state) in &collector.entity_states {
        if let Some(record) = state {
            final_records.insert(address.clone(), record.clone());
        }
    }

    let mut header_metadata = None;
    for (address, value) in &collector.scalar_values {
        if let (
            ScalarAddressV1::DocumentMetadata { document_id },
            ScalarValueV1::DocumentMetadata(metadata),
        ) = (address, value)
        {
            if document_id != &store.header.id {
                return Err(TransactionPrepareFailureV1::LocalInvariant);
            }
            header_metadata = Some(metadata.clone());
            continue;
        }
        let entity_address = scalar_entity_address(address);
        if matches!(collector.entity_states.get(&entity_address), Some(None)) {
            continue;
        }
        ensure_final_record(store, &mut final_records, &entity_address)?;
        apply_scalar_to_record(
            final_records
                .get_mut(&entity_address)
                .ok_or(TransactionPrepareFailureV1::LocalInvariant)?,
            address,
            value,
        )?;
    }

    for (address, state) in &collector.reference_states {
        let Some(value) = state else {
            continue;
        };
        let entity_address = match address {
            ReferenceAddressV1::VoiceDefaultStaff { voice_id } => {
                Some(StableEntityAddressV1::Voice {
                    voice_id: voice_id.clone(),
                })
            }
            ReferenceAddressV1::EventStaffAssignment { event_id } => {
                Some(StableEntityAddressV1::Event {
                    event_id: event_id.clone(),
                })
            }
            ReferenceAddressV1::PartMeasureLink { .. }
            | ReferenceAddressV1::ExtensionOwner { .. } => None,
        };
        let Some(entity_address) = entity_address else {
            continue;
        };
        if matches!(collector.entity_states.get(&entity_address), Some(None)) {
            continue;
        }
        ensure_final_record(store, &mut final_records, &entity_address)?;
        apply_reference_to_record(
            final_records
                .get_mut(&entity_address)
                .ok_or(TransactionPrepareFailureV1::LocalInvariant)?,
            address,
            value,
        )?;
    }
    Ok((header_metadata, final_records))
}

fn ensure_final_record(
    store: &LiveScoreStore,
    records: &mut HashMap<StableEntityAddressV1, StableRecordV1>,
    address: &StableEntityAddressV1,
) -> Result<(), TransactionPrepareFailureV1> {
    if records.contains_key(address) {
        return Ok(());
    }
    let record = clone_base_record(store, address)?;
    records.insert(address.clone(), record);
    Ok(())
}

fn scalar_entity_address(address: &ScalarAddressV1) -> StableEntityAddressV1 {
    match address {
        ScalarAddressV1::DocumentMetadata { document_id } => StableEntityAddressV1::Document {
            document_id: document_id.clone(),
        },
        ScalarAddressV1::MeasureDefinition { measure_id } => StableEntityAddressV1::Measure {
            measure_id: measure_id.clone(),
        },
        ScalarAddressV1::PartName { part_id } | ScalarAddressV1::PartInstrument { part_id } => {
            StableEntityAddressV1::Part {
                part_id: part_id.clone(),
            }
        }
        ScalarAddressV1::StaffDefinition { staff_id } => StableEntityAddressV1::Staff {
            staff_id: staff_id.clone(),
        },
        ScalarAddressV1::VoiceSequenceStart { voice_id } => StableEntityAddressV1::Voice {
            voice_id: voice_id.clone(),
        },
        ScalarAddressV1::EventNoteValue { event_id } => StableEntityAddressV1::Event {
            event_id: event_id.clone(),
        },
        ScalarAddressV1::NoteWrittenPitch { note_id } => StableEntityAddressV1::Note {
            note_id: note_id.clone(),
        },
    }
}

fn apply_scalar_to_record(
    record: &mut StableRecordV1,
    address: &ScalarAddressV1,
    value: &ScalarValueV1,
) -> Result<(), TransactionPrepareFailureV1> {
    match (record, address, value) {
        (
            StableRecordV1::Measure(record),
            ScalarAddressV1::MeasureDefinition { measure_id },
            ScalarValueV1::MeasureDefinition {
                meter,
                pickup_duration,
            },
        ) if &record.id == measure_id => {
            record.meter = meter.clone();
            record.pickup_duration = pickup_duration.clone();
        }
        (
            StableRecordV1::Part(record),
            ScalarAddressV1::PartName { part_id },
            ScalarValueV1::PartName(name),
        ) if &record.id == part_id => record.name = name.clone(),
        (
            StableRecordV1::Part(record),
            ScalarAddressV1::PartInstrument { part_id },
            ScalarValueV1::PartInstrument(instrument),
        ) if &record.id == part_id => record.instrument = instrument.clone(),
        (
            StableRecordV1::Staff(record),
            ScalarAddressV1::StaffDefinition { staff_id },
            ScalarValueV1::StaffDefinition {
                line_count,
                default_clef,
            },
        ) if &record.id == staff_id => {
            record.line_count = *line_count;
            record.default_clef = default_clef.clone();
        }
        (
            StableRecordV1::Voice(record),
            ScalarAddressV1::VoiceSequenceStart { voice_id },
            ScalarValueV1::VoiceSequenceStart(start),
        ) if &record.id == voice_id => record.sequence_start = start.clone(),
        (
            StableRecordV1::Event(record),
            ScalarAddressV1::EventNoteValue { event_id },
            ScalarValueV1::EventNoteValue(duration),
        ) if &record.id == event_id => record.duration = duration.clone(),
        (
            StableRecordV1::Note(record),
            ScalarAddressV1::NoteWrittenPitch { note_id },
            ScalarValueV1::NoteWrittenPitch(pitch),
        ) if &record.id == note_id => record.written_pitch = pitch.clone(),
        _ => return Err(TransactionPrepareFailureV1::LocalInvariant),
    }
    Ok(())
}

fn apply_reference_to_record(
    record: &mut StableRecordV1,
    address: &ReferenceAddressV1,
    value: &ReferenceValueV1,
) -> Result<(), TransactionPrepareFailureV1> {
    match (record, address, value) {
        (
            StableRecordV1::Voice(record),
            ReferenceAddressV1::VoiceDefaultStaff { voice_id },
            ReferenceValueV1::StableId(staff_id),
        ) if &record.id == voice_id => record.default_staff_id = staff_id.clone(),
        (
            StableRecordV1::Event(record),
            ReferenceAddressV1::EventStaffAssignment { event_id },
            ReferenceValueV1::OptionalStableId(staff_id),
        ) if &record.id == event_id => record.staff_id = staff_id.clone(),
        _ => return Err(TransactionPrepareFailureV1::LocalInvariant),
    }
    Ok(())
}

fn clone_base_record(
    store: &LiveScoreStore,
    address: &StableEntityAddressV1,
) -> Result<StableRecordV1, TransactionPrepareFailureV1> {
    let entity =
        lookup_exact_entity(store, address).ok_or(TransactionPrepareFailureV1::LocalInvariant)?;
    match entity {
        RuntimeEntityRef::Measure(handle) => store
            .measures
            .get(handle)
            .cloned()
            .map(StableRecordV1::Measure),
        RuntimeEntityRef::Part(handle) => {
            store.parts.get(handle).cloned().map(StableRecordV1::Part)
        }
        RuntimeEntityRef::Staff(handle) => {
            store.staffs.get(handle).cloned().map(StableRecordV1::Staff)
        }
        RuntimeEntityRef::Voice(handle) => {
            store.voices.get(handle).cloned().map(StableRecordV1::Voice)
        }
        RuntimeEntityRef::Event(handle) => {
            store.events.get(handle).cloned().map(StableRecordV1::Event)
        }
        RuntimeEntityRef::Note(handle) => {
            store.notes.get(handle).cloned().map(StableRecordV1::Note)
        }
        RuntimeEntityRef::Document => None,
    }
    .ok_or(TransactionPrepareFailureV1::LocalInvariant)
}

fn lookup_exact_entity(
    store: &LiveScoreStore,
    address: &StableEntityAddressV1,
) -> Option<RuntimeEntityRef> {
    let entity = store
        .indices
        .entity
        .by_id
        .get(address.stable_id())
        .copied()?;
    let matches = matches!(
        (address, entity),
        (
            StableEntityAddressV1::Document { .. },
            RuntimeEntityRef::Document
        ) | (
            StableEntityAddressV1::Measure { .. },
            RuntimeEntityRef::Measure(_)
        ) | (
            StableEntityAddressV1::Part { .. },
            RuntimeEntityRef::Part(_)
        ) | (
            StableEntityAddressV1::Staff { .. },
            RuntimeEntityRef::Staff(_)
        ) | (
            StableEntityAddressV1::Voice { .. },
            RuntimeEntityRef::Voice(_)
        ) | (
            StableEntityAddressV1::Event { .. },
            RuntimeEntityRef::Event(_)
        ) | (
            StableEntityAddressV1::Note { .. },
            RuntimeEntityRef::Note(_)
        )
    );
    matches.then_some(entity)
}

fn prepare_record_actions(
    store: &LiveScoreStore,
    collector: &DeltaCollectorV1,
    mut final_records: HashMap<StableEntityAddressV1, StableRecordV1>,
    overlay: &TransactionOverlayV1<'_>,
) -> Result<EntityRecordPlanV1, TransactionPrepareFailureV1> {
    let capacity = collector
        .entity_states
        .len()
        .saturating_add(final_records.len());
    let mut plan = EntityRecordPlanV1::with_capacity(capacity)?;

    for (address, state) in &collector.entity_states {
        let base = lookup_exact_entity(store, address);
        match state {
            Some(_) => {
                let record = final_records
                    .remove(address)
                    .ok_or(TransactionPrepareFailureV1::LocalInvariant)?;
                if collector.removed_entities.contains(address) && base.is_some() {
                    push_insert_record(&mut plan, record, overlay.read_owner(address).required())?;
                    push_remove_record(
                        &mut plan,
                        address.stable_id().clone(),
                        base.ok_or(TransactionPrepareFailureV1::LocalInvariant)?,
                        true,
                    )?;
                } else if let Some(base) = base {
                    push_replace_record(&mut plan, base, record)?;
                } else {
                    push_insert_record(&mut plan, record, overlay.read_owner(address).required())?;
                }
            }
            None => {
                if let Some(base) = base {
                    push_remove_record(&mut plan, address.stable_id().clone(), base, false)?;
                }
            }
        }
    }

    for (address, record) in final_records {
        let base = lookup_exact_entity(store, &address)
            .ok_or(TransactionPrepareFailureV1::LocalInvariant)?;
        push_replace_record(&mut plan, base, record)?;
    }
    Ok(plan)
}

trait RequiredOwnerV1 {
    fn required(self) -> Result<StableOwnerAddressV1, TransactionPrepareFailureV1>;
}

impl RequiredOwnerV1 for Option<StableOwnerAddressV1> {
    fn required(self) -> Result<StableOwnerAddressV1, TransactionPrepareFailureV1> {
        self.ok_or(TransactionPrepareFailureV1::LocalInvariant)
    }
}

fn push_insert_record(
    plan: &mut EntityRecordPlanV1,
    record: StableRecordV1,
    owner: Result<StableOwnerAddressV1, TransactionPrepareFailureV1>,
) -> Result<(), TransactionPrepareFailureV1> {
    let owner = owner?;
    let address = record.address();
    if !plan.inserted_ids.insert(address.stable_id().clone()) {
        return Err(TransactionPrepareFailureV1::LocalInvariant);
    }
    plan.inserted_owners.push((address, owner));
    match record {
        StableRecordV1::Measure(value) => plan.insert_measures.push(InsertRecordV1 {
            id: value.id.clone(),
            value,
        }),
        StableRecordV1::Part(value) => plan.insert_parts.push(InsertRecordV1 {
            id: value.id.clone(),
            value,
        }),
        StableRecordV1::Staff(value) => plan.insert_staffs.push(InsertRecordV1 {
            id: value.id.clone(),
            value,
        }),
        StableRecordV1::Voice(value) => plan.insert_voices.push(InsertRecordV1 {
            id: value.id.clone(),
            value,
        }),
        StableRecordV1::Event(value) => plan.insert_events.push(InsertRecordV1 {
            id: value.id.clone(),
            value,
        }),
        StableRecordV1::Note(value) => plan.insert_notes.push(InsertRecordV1 {
            id: value.id.clone(),
            value,
        }),
    }
    Ok(())
}

fn push_replace_record(
    plan: &mut EntityRecordPlanV1,
    base: RuntimeEntityRef,
    record: StableRecordV1,
) -> Result<(), TransactionPrepareFailureV1> {
    match (base, record) {
        (RuntimeEntityRef::Measure(handle), StableRecordV1::Measure(value)) => plan
            .replace_measures
            .push(ReplaceRecordV1 { handle, value }),
        (RuntimeEntityRef::Part(handle), StableRecordV1::Part(value)) => {
            plan.replace_parts.push(ReplaceRecordV1 { handle, value })
        }
        (RuntimeEntityRef::Staff(handle), StableRecordV1::Staff(value)) => {
            plan.replace_staffs.push(ReplaceRecordV1 { handle, value })
        }
        (RuntimeEntityRef::Voice(handle), StableRecordV1::Voice(value)) => {
            plan.replace_voices.push(ReplaceRecordV1 { handle, value })
        }
        (RuntimeEntityRef::Event(handle), StableRecordV1::Event(value)) => {
            plan.replace_events.push(ReplaceRecordV1 { handle, value })
        }
        (RuntimeEntityRef::Note(handle), StableRecordV1::Note(value)) => {
            plan.replace_notes.push(ReplaceRecordV1 { handle, value })
        }
        _ => return Err(TransactionPrepareFailureV1::LocalInvariant),
    }
    Ok(())
}

fn push_remove_record(
    plan: &mut EntityRecordPlanV1,
    id: StableId,
    base: RuntimeEntityRef,
    retain_identity: bool,
) -> Result<(), TransactionPrepareFailureV1> {
    match base {
        RuntimeEntityRef::Measure(handle) => plan.remove_measures.push(RemoveRecordV1 {
            id,
            handle,
            retain_identity,
        }),
        RuntimeEntityRef::Part(handle) => plan.remove_parts.push(RemoveRecordV1 {
            id,
            handle,
            retain_identity,
        }),
        RuntimeEntityRef::Staff(handle) => plan.remove_staffs.push(RemoveRecordV1 {
            id,
            handle,
            retain_identity,
        }),
        RuntimeEntityRef::Voice(handle) => plan.remove_voices.push(RemoveRecordV1 {
            id,
            handle,
            retain_identity,
        }),
        RuntimeEntityRef::Event(handle) => plan.remove_events.push(RemoveRecordV1 {
            id,
            handle,
            retain_identity,
        }),
        RuntimeEntityRef::Note(handle) => plan.remove_notes.push(RemoveRecordV1 {
            id,
            handle,
            retain_identity,
        }),
        RuntimeEntityRef::Document => return Err(TransactionPrepareFailureV1::LocalInvariant),
    }
    Ok(())
}

fn prepare_orders(
    store: &LiveScoreStore,
    overlay: &TransactionOverlayV1<'_>,
    collector: &DeltaCollectorV1,
    inserted_ids: &HashSet<StableId>,
) -> Result<Vec<PreparedOrderMutationV1>, TransactionPrepareFailureV1> {
    let mut result = Vec::new();
    result
        .try_reserve_exact(collector.order_addresses.len())
        .map_err(|_| TransactionPrepareFailureV1::Capacity)?;
    for address in &collector.order_addresses {
        if matches!(address, StableOrderAddressV1::Extensions { .. }) {
            continue;
        }
        let value = overlay.read_order(address);
        if let Some(ids) = &value {
            validate_order_membership(overlay, address, ids)?;
        }
        let mutation = match address {
            StableOrderAddressV1::Measures { document_id } => {
                if document_id != &store.header.id {
                    return Err(TransactionPrepareFailureV1::LocalInvariant);
                }
                PreparedOrderMutationV1::Measures(prepare_handle_vector(
                    value.ok_or(TransactionPrepareFailureV1::LocalInvariant)?,
                    inserted_ids,
                    |id| lookup_measure(store, id),
                )?)
            }
            StableOrderAddressV1::Parts { document_id } => {
                if document_id != &store.header.id {
                    return Err(TransactionPrepareFailureV1::LocalInvariant);
                }
                PreparedOrderMutationV1::Parts(prepare_handle_vector(
                    value.ok_or(TransactionPrepareFailureV1::LocalInvariant)?,
                    inserted_ids,
                    |id| lookup_part(store, id),
                )?)
            }
            StableOrderAddressV1::Staffs { part_id } => PreparedOrderMutationV1::Staffs {
                old_owner: lookup_part(store, part_id),
                owner_id: part_id.clone(),
                value: value
                    .map(|ids| {
                        prepare_handle_vector(ids, inserted_ids, |id| lookup_staff(store, id))
                    })
                    .transpose()?,
            },
            StableOrderAddressV1::MeasureContents { part_id } => {
                PreparedOrderMutationV1::MeasureContents {
                    old_owner: lookup_part(store, part_id),
                    owner_id: part_id.clone(),
                    value: value
                        .map(|ids| {
                            prepare_handle_vector(ids, inserted_ids, |id| lookup_measure(store, id))
                        })
                        .transpose()?,
                }
            }
            StableOrderAddressV1::Voices {
                part_id,
                measure_id,
            } => PreparedOrderMutationV1::Voices {
                old_key: lookup_part(store, part_id)
                    .zip(lookup_measure(store, measure_id))
                    .map(|(part, measure)| PartMeasureKey { part, measure }),
                part_id: part_id.clone(),
                measure_id: measure_id.clone(),
                value: value
                    .map(|ids| {
                        prepare_handle_vector(ids, inserted_ids, |id| lookup_voice(store, id))
                    })
                    .transpose()?,
            },
            StableOrderAddressV1::Events { voice_id } => PreparedOrderMutationV1::Events {
                old_owner: lookup_voice(store, voice_id),
                owner_id: voice_id.clone(),
                value: value
                    .map(|ids| {
                        prepare_handle_vector(ids, inserted_ids, |id| lookup_event(store, id))
                    })
                    .transpose()?,
            },
            StableOrderAddressV1::Notes { event_id } => PreparedOrderMutationV1::Notes {
                old_owner: lookup_event(store, event_id),
                owner_id: event_id.clone(),
                value: value
                    .map(|ids| {
                        prepare_handle_vector(ids, inserted_ids, |id| lookup_note(store, id))
                    })
                    .transpose()?,
            },
            StableOrderAddressV1::Extensions { .. } => unreachable!(),
        };
        result.push(mutation);
    }
    Ok(result)
}

fn prepare_handle_vector<H: Key>(
    ids: Vec<StableId>,
    inserted_ids: &HashSet<StableId>,
    mut lookup: impl FnMut(&StableId) -> Option<H>,
) -> Result<PreparedHandleVectorV1<H>, TransactionPrepareFailureV1> {
    let mut values = Vec::new();
    let mut patches = Vec::new();
    let mut seen = HashSet::new();
    values
        .try_reserve_exact(ids.len())
        .map_err(|_| TransactionPrepareFailureV1::Capacity)?;
    patches
        .try_reserve_exact(ids.len())
        .map_err(|_| TransactionPrepareFailureV1::Capacity)?;
    seen.try_reserve(ids.len())
        .map_err(|_| TransactionPrepareFailureV1::Capacity)?;
    for (index, id) in ids.into_iter().enumerate() {
        if !seen.insert(id.clone()) {
            return Err(TransactionPrepareFailureV1::LocalInvariant);
        }
        if inserted_ids.contains(&id) {
            values.push(H::null());
            patches.push((index, id));
        } else {
            values.push(lookup(&id).ok_or(TransactionPrepareFailureV1::LocalInvariant)?);
        }
    }
    Ok(PreparedHandleVectorV1 { values, patches })
}

fn validate_order_membership(
    overlay: &TransactionOverlayV1<'_>,
    order: &StableOrderAddressV1,
    ids: &[StableId],
) -> Result<(), TransactionPrepareFailureV1> {
    for id in ids {
        let (address, expected_owner) = match order {
            StableOrderAddressV1::Measures { document_id } => (
                StableEntityAddressV1::Measure {
                    measure_id: id.clone(),
                },
                StableOwnerAddressV1::Document {
                    document_id: document_id.clone(),
                },
            ),
            StableOrderAddressV1::Parts { document_id } => (
                StableEntityAddressV1::Part {
                    part_id: id.clone(),
                },
                StableOwnerAddressV1::Document {
                    document_id: document_id.clone(),
                },
            ),
            StableOrderAddressV1::Staffs { part_id } => (
                StableEntityAddressV1::Staff {
                    staff_id: id.clone(),
                },
                StableOwnerAddressV1::Part {
                    part_id: part_id.clone(),
                },
            ),
            StableOrderAddressV1::MeasureContents { part_id: _ } => (
                StableEntityAddressV1::Measure {
                    measure_id: id.clone(),
                },
                match overlay.read_owner(&StableEntityAddressV1::Measure {
                    measure_id: id.clone(),
                }) {
                    Some(owner @ StableOwnerAddressV1::Document { .. }) => owner,
                    _ => return Err(TransactionPrepareFailureV1::LocalInvariant),
                },
            ),
            StableOrderAddressV1::Voices {
                part_id,
                measure_id,
            } => (
                StableEntityAddressV1::Voice {
                    voice_id: id.clone(),
                },
                StableOwnerAddressV1::PartMeasure {
                    part_id: part_id.clone(),
                    measure_id: measure_id.clone(),
                },
            ),
            StableOrderAddressV1::Events { voice_id } => (
                StableEntityAddressV1::Event {
                    event_id: id.clone(),
                },
                StableOwnerAddressV1::Voice {
                    voice_id: voice_id.clone(),
                },
            ),
            StableOrderAddressV1::Notes { event_id } => (
                StableEntityAddressV1::Note {
                    note_id: id.clone(),
                },
                StableOwnerAddressV1::Event {
                    event_id: event_id.clone(),
                },
            ),
            StableOrderAddressV1::Extensions { .. } => continue,
        };
        if overlay.read_owner(&address) != Some(expected_owner) {
            return Err(TransactionPrepareFailureV1::LocalInvariant);
        }
    }
    Ok(())
}

fn lookup_measure(store: &LiveScoreStore, id: &StableId) -> Option<MeasureHandle> {
    match store.indices.entity.by_id.get(id).copied()? {
        RuntimeEntityRef::Measure(handle) if store.measures.contains_key(handle) => Some(handle),
        _ => None,
    }
}

fn lookup_part(store: &LiveScoreStore, id: &StableId) -> Option<PartHandle> {
    match store.indices.entity.by_id.get(id).copied()? {
        RuntimeEntityRef::Part(handle) if store.parts.contains_key(handle) => Some(handle),
        _ => None,
    }
}

fn lookup_staff(store: &LiveScoreStore, id: &StableId) -> Option<StaffHandle> {
    match store.indices.entity.by_id.get(id).copied()? {
        RuntimeEntityRef::Staff(handle) if store.staffs.contains_key(handle) => Some(handle),
        _ => None,
    }
}

fn lookup_voice(store: &LiveScoreStore, id: &StableId) -> Option<VoiceHandle> {
    match store.indices.entity.by_id.get(id).copied()? {
        RuntimeEntityRef::Voice(handle) if store.voices.contains_key(handle) => Some(handle),
        _ => None,
    }
}

fn lookup_event(store: &LiveScoreStore, id: &StableId) -> Option<EventHandle> {
    match store.indices.entity.by_id.get(id).copied()? {
        RuntimeEntityRef::Event(handle) if store.events.contains_key(handle) => Some(handle),
        _ => None,
    }
}

fn lookup_note(store: &LiveScoreStore, id: &StableId) -> Option<NoteHandle> {
    match store.indices.entity.by_id.get(id).copied()? {
        RuntimeEntityRef::Note(handle) if store.notes.contains_key(handle) => Some(handle),
        _ => None,
    }
}

fn add_extension_reference_states(
    simulation: &ExtensionSimulationV1,
    collector: &mut DeltaCollectorV1,
) {
    for key in &simulation.touched {
        let address = ReferenceAddressV1::ExtensionOwner {
            namespace: key.namespace.clone(),
            owner: key.owner.clone(),
        };
        let value = simulation
            .values
            .get(key)
            .map(|block| ReferenceValueV1::ExtensionOwner(block.owner.clone()));
        collector.reference_states.insert(address, value);
    }
}

fn prepare_extensions(
    store: &LiveScoreStore,
    overlay: &TransactionOverlayV1<'_>,
    simulation: ExtensionSimulationV1,
) -> Result<ExtensionPlanV1, TransactionPrepareFailureV1> {
    if simulation.touched.is_empty() {
        return Ok(ExtensionPlanV1::default());
    }
    let mut plan = ExtensionPlanV1::default();
    let capacity = simulation.touched.len();
    reserve_vec(&mut plan.insertions, capacity)?;
    reserve_vec(&mut plan.replacements, capacity)?;
    reserve_vec(&mut plan.removals, capacity)?;
    reserve_vec(&mut plan.order_patches, capacity)?;
    reserve_vec(&mut plan.bindings, capacity)?;

    let mut insertion_tokens = HashMap::new();
    insertion_tokens
        .try_reserve(capacity)
        .map_err(|_| TransactionPrepareFailureV1::Capacity)?;
    for key in &simulation.touched {
        let base_handle = simulation.base_handles.get(key).copied();
        let final_value = simulation.values.get(key).cloned();
        let recreate =
            simulation.removed.contains(key) && base_handle.is_some() && final_value.is_some();
        if let Some(handle) = base_handle
            && (final_value.is_none() || recreate)
        {
            let record = store
                .extensions
                .get(handle)
                .ok_or(TransactionPrepareFailureV1::LocalInvariant)?;
            plan.removals.push(RemoveExtensionV1 {
                handle,
                index_key: ExtensionIndexKey {
                    namespace: record.namespace.clone(),
                    owner: runtime_extension_owner(store, &record.owner)?,
                },
            });
        }
        match (base_handle, final_value) {
            (None, Some(value)) => {
                prepare_extension_insertion(&mut plan, &mut insertion_tokens, key, value, overlay)?
            }
            (Some(_), Some(value)) if recreate => {
                prepare_extension_insertion(&mut plan, &mut insertion_tokens, key, value, overlay)?
            }
            (Some(handle), Some(value)) => {
                validate_extension_owner(overlay, &value.owner)?;
                if extension_block(
                    store
                        .extensions
                        .get(handle)
                        .ok_or(TransactionPrepareFailureV1::LocalInvariant)?,
                ) != value
                {
                    plan.replacements.push(ReplaceExtensionV1 {
                        handle,
                        value: extension_record(value),
                    });
                }
            }
            (_, None) => {}
        }
    }

    let mut order = Vec::new();
    order
        .try_reserve_exact(simulation.order.len())
        .map_err(|_| TransactionPrepareFailureV1::Capacity)?;
    for (index, key) in simulation.order.iter().enumerate() {
        if let Some(token) = insertion_tokens.get(key).copied() {
            order.push(ExtensionHandle::null());
            plan.order_patches.push((index, token));
        } else {
            order.push(
                simulation
                    .base_handles
                    .get(key)
                    .copied()
                    .ok_or(TransactionPrepareFailureV1::LocalInvariant)?,
            );
        }
    }
    plan.order = Some(order);
    Ok(plan)
}

fn prepare_extension_insertion(
    plan: &mut ExtensionPlanV1,
    insertion_tokens: &mut HashMap<ExtensionKeyV1, usize>,
    key: &ExtensionKeyV1,
    value: ExtensionBlockV1,
    overlay: &TransactionOverlayV1<'_>,
) -> Result<(), TransactionPrepareFailureV1> {
    validate_extension_owner(overlay, &value.owner)?;
    if ExtensionKeyV1::from_block(&value) != *key {
        return Err(TransactionPrepareFailureV1::LocalInvariant);
    }
    let token = plan.bindings.len();
    plan.bindings.push(ExtensionHandle::null());
    let mut index_bucket = Vec::new();
    index_bucket
        .try_reserve_exact(1)
        .map_err(|_| TransactionPrepareFailureV1::Capacity)?;
    index_bucket.push(ExtensionHandle::null());
    plan.insertions.push(InsertExtensionV1 {
        token,
        key: key.clone(),
        value: Some(extension_record(value)),
        index_bucket,
    });
    insertion_tokens.insert(key.clone(), token);
    Ok(())
}

fn validate_extension_owner(
    overlay: &TransactionOverlayV1<'_>,
    owner: &ExtensionOwnerV1,
) -> Result<(), TransactionPrepareFailureV1> {
    if let ExtensionOwnerV1::Part { part_id } = owner {
        let address = StableEntityAddressV1::Part {
            part_id: part_id.clone(),
        };
        if !matches!(
            overlay.read_owner(&address),
            Some(StableOwnerAddressV1::Document { .. })
        ) {
            return Err(TransactionPrepareFailureV1::LocalInvariant);
        }
    }
    Ok(())
}

fn runtime_extension_owner(
    store: &LiveScoreStore,
    owner: &ExtensionOwnerV1,
) -> Result<ExtensionIndexOwner, TransactionPrepareFailureV1> {
    match owner {
        ExtensionOwnerV1::Score => Ok(ExtensionIndexOwner::Score),
        ExtensionOwnerV1::Part { part_id } => lookup_part(store, part_id)
            .map(ExtensionIndexOwner::Part)
            .ok_or(TransactionPrepareFailureV1::LocalInvariant),
    }
}

fn validate_coverage(
    store: &LiveScoreStore,
    overlay: &TransactionOverlayV1<'_>,
    collector: &DeltaCollectorV1,
) -> Result<(), TransactionPrepareFailureV1> {
    let measures_address = StableOrderAddressV1::Measures {
        document_id: store.header.id.clone(),
    };
    let parts_address = StableOrderAddressV1::Parts {
        document_id: store.header.id.clone(),
    };
    let global_changed = collector.order_seen.contains(&measures_address)
        || collector.order_seen.contains(&parts_address);
    let content_changed = collector
        .order_addresses
        .iter()
        .any(|address| matches!(address, StableOrderAddressV1::MeasureContents { .. }));
    if !global_changed && !content_changed {
        return Ok(());
    }
    let measure_ids = overlay
        .read_order(&measures_address)
        .ok_or(TransactionPrepareFailureV1::LocalInvariant)?;
    let mut part_ids = Vec::new();
    if global_changed {
        part_ids = overlay
            .read_order(&parts_address)
            .ok_or(TransactionPrepareFailureV1::LocalInvariant)?;
    } else {
        part_ids
            .try_reserve_exact(collector.order_addresses.len())
            .map_err(|_| TransactionPrepareFailureV1::Capacity)?;
        for address in &collector.order_addresses {
            if let StableOrderAddressV1::MeasureContents { part_id } = address
                && !part_ids.contains(part_id)
            {
                part_ids.push(part_id.clone());
            }
        }
    }

    for part_id in part_ids {
        let part_address = StableEntityAddressV1::Part {
            part_id: part_id.clone(),
        };
        if overlay.read_owner(&part_address).is_none() {
            continue;
        }
        let contents = overlay
            .read_order(&StableOrderAddressV1::MeasureContents {
                part_id: part_id.clone(),
            })
            .ok_or(TransactionPrepareFailureV1::LocalInvariant)?;
        if !same_unique_ids(&contents, &measure_ids)? {
            return Err(TransactionPrepareFailureV1::LocalInvariant);
        }
        for measure_id in contents {
            if overlay
                .read_order(&StableOrderAddressV1::Voices {
                    part_id: part_id.clone(),
                    measure_id,
                })
                .is_none()
            {
                return Err(TransactionPrepareFailureV1::LocalInvariant);
            }
        }
    }
    Ok(())
}

fn same_unique_ids(
    left: &[StableId],
    right: &[StableId],
) -> Result<bool, TransactionPrepareFailureV1> {
    if left.len() != right.len() {
        return Ok(false);
    }
    let mut values = HashSet::new();
    values
        .try_reserve(left.len())
        .map_err(|_| TransactionPrepareFailureV1::Capacity)?;
    for value in left {
        if !values.insert(value) {
            return Ok(false);
        }
    }
    Ok(right.iter().all(|value| values.remove(value)) && values.is_empty())
}

fn validate_reference_states(
    overlay: &TransactionOverlayV1<'_>,
    states: &HashMap<ReferenceAddressV1, Option<ReferenceValueV1>>,
) -> Result<(), TransactionPrepareFailureV1> {
    for (address, state) in states {
        let Some(value) = state else {
            continue;
        };
        match (address, value) {
            (
                ReferenceAddressV1::VoiceDefaultStaff { voice_id },
                ReferenceValueV1::StableId(staff_id),
            ) => {
                let voice_owner = overlay
                    .read_owner(&StableEntityAddressV1::Voice {
                        voice_id: voice_id.clone(),
                    })
                    .ok_or(TransactionPrepareFailureV1::LocalInvariant)?;
                let staff_owner = overlay
                    .read_owner(&StableEntityAddressV1::Staff {
                        staff_id: staff_id.clone(),
                    })
                    .ok_or(TransactionPrepareFailureV1::LocalInvariant)?;
                if !matches!(
                    (voice_owner, staff_owner),
                    (
                        StableOwnerAddressV1::PartMeasure { part_id, .. },
                        StableOwnerAddressV1::Part { part_id: staff_part }
                    ) if part_id == staff_part
                ) {
                    return Err(TransactionPrepareFailureV1::LocalInvariant);
                }
            }
            (
                ReferenceAddressV1::EventStaffAssignment { event_id },
                ReferenceValueV1::OptionalStableId(Some(staff_id)),
            ) => {
                let StableOwnerAddressV1::Voice { voice_id } = overlay
                    .read_owner(&StableEntityAddressV1::Event {
                        event_id: event_id.clone(),
                    })
                    .ok_or(TransactionPrepareFailureV1::LocalInvariant)?
                else {
                    return Err(TransactionPrepareFailureV1::LocalInvariant);
                };
                let voice_owner = overlay
                    .read_owner(&StableEntityAddressV1::Voice { voice_id })
                    .ok_or(TransactionPrepareFailureV1::LocalInvariant)?;
                let staff_owner = overlay
                    .read_owner(&StableEntityAddressV1::Staff {
                        staff_id: staff_id.clone(),
                    })
                    .ok_or(TransactionPrepareFailureV1::LocalInvariant)?;
                if !matches!(
                    (voice_owner, staff_owner),
                    (
                        StableOwnerAddressV1::PartMeasure { part_id, .. },
                        StableOwnerAddressV1::Part { part_id: staff_part }
                    ) if part_id == staff_part
                ) {
                    return Err(TransactionPrepareFailureV1::LocalInvariant);
                }
            }
            (
                ReferenceAddressV1::EventStaffAssignment { event_id },
                ReferenceValueV1::OptionalStableId(None),
            ) => {
                if overlay
                    .read_owner(&StableEntityAddressV1::Event {
                        event_id: event_id.clone(),
                    })
                    .is_none()
                {
                    return Err(TransactionPrepareFailureV1::LocalInvariant);
                }
            }
            (
                ReferenceAddressV1::PartMeasureLink {
                    part_id,
                    measure_id,
                },
                ReferenceValueV1::Present(present),
            ) => {
                let exists = overlay
                    .read_order(&StableOrderAddressV1::Voices {
                        part_id: part_id.clone(),
                        measure_id: measure_id.clone(),
                    })
                    .is_some();
                if exists != *present {
                    return Err(TransactionPrepareFailureV1::LocalInvariant);
                }
            }
            (
                ReferenceAddressV1::ExtensionOwner { owner, .. },
                ReferenceValueV1::ExtensionOwner(value),
            ) => {
                if StableExtensionOwnerV1::from(value) != *owner {
                    return Err(TransactionPrepareFailureV1::LocalInvariant);
                }
                validate_extension_owner(overlay, value)?;
            }
            _ => return Err(TransactionPrepareFailureV1::LocalInvariant),
        }
    }
    Ok(())
}

fn validate_removed_reference_targets(
    store: &LiveScoreStore,
    collector: &DeltaCollectorV1,
) -> Result<(), TransactionPrepareFailureV1> {
    for (address, state) in &collector.entity_states {
        if state.is_some() {
            continue;
        }
        if let Some(references) = store.indices.references.by_target.get(address.stable_id()) {
            for reference in references {
                if !collector.reference_states.contains_key(&reference.source) {
                    return Err(TransactionPrepareFailureV1::LocalInvariant);
                }
            }
        }
    }
    Ok(())
}

fn prepare_voice_times(
    store: &LiveScoreStore,
    overlay: &mut TransactionOverlayV1<'_>,
    collector: &DeltaCollectorV1,
    inserted_ids: &HashSet<StableId>,
) -> Result<Vec<PreparedVoiceTimeV1>, TransactionPrepareFailureV1> {
    let mut result = Vec::new();
    result
        .try_reserve_exact(collector.touched_voice_ids.len())
        .map_err(|_| TransactionPrepareFailureV1::Capacity)?;
    for voice_id in &collector.touched_voice_ids {
        let old_voice = lookup_voice(store, voice_id);
        let voice_address = StableEntityAddressV1::Voice {
            voice_id: voice_id.clone(),
        };
        if overlay.read_owner(&voice_address).is_none() {
            if old_voice.is_some() {
                result.push(PreparedVoiceTimeV1 {
                    old_voice,
                    voice_id: voice_id.clone(),
                    value: None,
                    patches: Vec::new(),
                });
            }
            continue;
        }
        let event_ids = overlay
            .read_order(&StableOrderAddressV1::Events {
                voice_id: voice_id.clone(),
            })
            .ok_or(TransactionPrepareFailureV1::LocalInvariant)?;
        let ScalarValueV1::VoiceSequenceStart(start) = overlay
            .read_scalar(&ScalarAddressV1::VoiceSequenceStart {
                voice_id: voice_id.clone(),
            })
            .ok_or(TransactionPrepareFailureV1::LocalInvariant)?
        else {
            return Err(TransactionPrepareFailureV1::LocalInvariant);
        };
        let mut exact_start = ExactFraction::from_canonical(&start)
            .map_err(|_| TransactionPrepareFailureV1::LocalInvariant)?;
        let mut time = VoiceTimeIndex::with_capacity(event_ids.len())?;
        let mut patches = Vec::new();
        patches
            .try_reserve_exact(event_ids.len())
            .map_err(|_| TransactionPrepareFailureV1::Capacity)?;
        for (ordinal, event_id) in event_ids.into_iter().enumerate() {
            if overlay.read_owner(&StableEntityAddressV1::Event {
                event_id: event_id.clone(),
            }) != Some(StableOwnerAddressV1::Voice {
                voice_id: voice_id.clone(),
            }) {
                return Err(TransactionPrepareFailureV1::LocalInvariant);
            }
            let ScalarValueV1::EventNoteValue(duration) = overlay
                .read_scalar(&ScalarAddressV1::EventNoteValue {
                    event_id: event_id.clone(),
                })
                .ok_or(TransactionPrepareFailureV1::LocalInvariant)?
            else {
                return Err(TransactionPrepareFailureV1::LocalInvariant);
            };
            let duration = ExactFraction::note_value_duration(&duration)
                .map_err(|_| TransactionPrepareFailureV1::LocalInvariant)?;
            let end = exact_start
                .checked_add(duration)
                .map_err(|_| TransactionPrepareFailureV1::LocalInvariant)?;
            let event = if inserted_ids.contains(&event_id) {
                patches.push((ordinal, event_id));
                EventHandle::null()
            } else {
                lookup_event(store, &event_id).ok_or(TransactionPrepareFailureV1::LocalInvariant)?
            };
            time.push(
                exact_start,
                end,
                u32::try_from(ordinal).map_err(|_| TransactionPrepareFailureV1::LocalInvariant)?,
                event,
            )?;
            exact_start = end;
        }
        result.push(PreparedVoiceTimeV1 {
            old_voice,
            voice_id: voice_id.clone(),
            value: Some(time),
            patches,
        });
    }
    Ok(result)
}

fn prepare_reference_buckets(
    store: &LiveScoreStore,
    states: &HashMap<ReferenceAddressV1, Option<ReferenceValueV1>>,
) -> Result<Vec<PreparedReferenceBucketV1>, TransactionPrepareFailureV1> {
    let mut affected_targets = HashSet::new();
    let mut new_sources: HashMap<StableId, Vec<ReferenceAddressV1>> = HashMap::new();
    affected_targets
        .try_reserve(states.len().saturating_mul(2))
        .map_err(|_| TransactionPrepareFailureV1::Capacity)?;
    new_sources
        .try_reserve(states.len())
        .map_err(|_| TransactionPrepareFailureV1::Capacity)?;

    for (address, state) in states {
        if let Some(old_value) = store.read_reference(address)
            && let Some(target) = reference_target(address, &old_value)?
        {
            affected_targets.insert(target);
        }
        if let Some(value) = state
            && let Some(target) = reference_target(address, value)?
        {
            affected_targets.insert(target.clone());
            let bucket = new_sources.entry(target).or_default();
            bucket
                .try_reserve(1)
                .map_err(|_| TransactionPrepareFailureV1::Capacity)?;
            bucket.push(address.clone());
        }
    }

    let mut result = Vec::new();
    result
        .try_reserve_exact(affected_targets.len())
        .map_err(|_| TransactionPrepareFailureV1::Capacity)?;
    for target in affected_targets {
        let mut bucket = store
            .indices
            .references
            .by_target
            .get(&target)
            .cloned()
            .unwrap_or_default();
        bucket.retain(|entry| !states.contains_key(&entry.source));
        if let Some(sources) = new_sources.remove(&target) {
            bucket
                .try_reserve(sources.len())
                .map_err(|_| TransactionPrepareFailureV1::Capacity)?;
            bucket.extend(sources.into_iter().map(prepared_reference_address));
        }
        sort_prepared_reference_bucket(&mut bucket);
        result.push(PreparedReferenceBucketV1 {
            target,
            value: (!bucket.is_empty()).then_some(bucket),
        });
    }
    Ok(result)
}

fn reference_target(
    address: &ReferenceAddressV1,
    value: &ReferenceValueV1,
) -> Result<Option<StableId>, TransactionPrepareFailureV1> {
    match (address, value) {
        (ReferenceAddressV1::VoiceDefaultStaff { .. }, ReferenceValueV1::StableId(target)) => {
            Ok(Some(target.clone()))
        }
        (
            ReferenceAddressV1::EventStaffAssignment { .. },
            ReferenceValueV1::OptionalStableId(target),
        ) => Ok(target.clone()),
        (
            ReferenceAddressV1::PartMeasureLink { measure_id, .. },
            ReferenceValueV1::Present(true),
        ) => Ok(Some(measure_id.clone())),
        (ReferenceAddressV1::PartMeasureLink { .. }, ReferenceValueV1::Present(false)) => Ok(None),
        (
            ReferenceAddressV1::ExtensionOwner { .. },
            ReferenceValueV1::ExtensionOwner(ExtensionOwnerV1::Part { part_id }),
        ) => Ok(Some(part_id.clone())),
        (
            ReferenceAddressV1::ExtensionOwner { .. },
            ReferenceValueV1::ExtensionOwner(ExtensionOwnerV1::Score),
        ) => Ok(None),
        _ => Err(TransactionPrepareFailureV1::LocalInvariant),
    }
}

fn reference_removed_count(
    store: &LiveScoreStore,
    states: &HashMap<ReferenceAddressV1, Option<ReferenceValueV1>>,
) -> usize {
    states
        .keys()
        .filter(|address| {
            store
                .read_reference(address)
                .and_then(|value| reference_target(address, &value).ok().flatten())
                .is_some()
        })
        .count()
}

fn reference_inserted_count(
    states: &HashMap<ReferenceAddressV1, Option<ReferenceValueV1>>,
) -> usize {
    states
        .iter()
        .filter(|(address, value)| {
            value
                .as_ref()
                .and_then(|value| reference_target(address, value).ok().flatten())
                .is_some()
        })
        .count()
}

impl CommitPlanV1 {
    fn reserve(
        &mut self,
        store: &mut LiveScoreStore,
        policy: CommitReservationPolicyV1,
    ) -> Result<(), TransactionPrepareFailureV1> {
        policy.slot_map(&mut store.measures, self.records.insert_measures.len())?;
        policy.slot_map(&mut store.parts, self.records.insert_parts.len())?;
        policy.slot_map(&mut store.staffs, self.records.insert_staffs.len())?;
        policy.slot_map(&mut store.voices, self.records.insert_voices.len())?;
        policy.slot_map(&mut store.events, self.records.insert_events.len())?;
        policy.slot_map(&mut store.notes, self.records.insert_notes.len())?;
        policy.slot_map(&mut store.extensions, self.extensions.insertions.len())?;

        let mut staff_orders = 0_usize;
        let mut content_orders = 0_usize;
        let mut voice_orders = 0_usize;
        let mut event_orders = 0_usize;
        let mut note_orders = 0_usize;
        for order in &self.orders {
            match order {
                PreparedOrderMutationV1::Staffs { value: Some(_), .. } => {
                    staff_orders = staff_orders.saturating_add(1)
                }
                PreparedOrderMutationV1::MeasureContents { value: Some(_), .. } => {
                    content_orders = content_orders.saturating_add(1)
                }
                PreparedOrderMutationV1::Voices { value: Some(_), .. } => {
                    voice_orders = voice_orders.saturating_add(1)
                }
                PreparedOrderMutationV1::Events { value: Some(_), .. } => {
                    event_orders = event_orders.saturating_add(1)
                }
                PreparedOrderMutationV1::Notes { value: Some(_), .. } => {
                    note_orders = note_orders.saturating_add(1)
                }
                _ => {}
            }
        }
        policy.hash_map(&mut store.topology.staff_order, staff_orders)?;
        policy.hash_map(&mut store.topology.content_order, content_orders)?;
        policy.hash_map(&mut store.topology.contents, voice_orders)?;
        policy.hash_map(&mut store.topology.voice_order, voice_orders)?;
        policy.hash_map(&mut store.topology.event_order, event_orders)?;
        policy.hash_map(&mut store.topology.note_order, note_orders)?;

        policy.hash_map(
            &mut store.indices.entity.by_id,
            self.records.insertion_count(),
        )?;
        policy.hash_map(
            &mut store.indices.ownership.measures,
            self.records.insert_measures.len(),
        )?;
        policy.hash_map(
            &mut store.indices.ownership.parts,
            self.records.insert_parts.len(),
        )?;
        policy.hash_map(
            &mut store.indices.ownership.staffs,
            self.records.insert_staffs.len(),
        )?;
        policy.hash_map(
            &mut store.indices.ownership.voices,
            self.records.insert_voices.len(),
        )?;
        policy.hash_map(
            &mut store.indices.ownership.events,
            self.records.insert_events.len(),
        )?;
        policy.hash_map(
            &mut store.indices.ownership.notes,
            self.records.insert_notes.len(),
        )?;
        policy.hash_map(
            &mut store.indices.ownership.extensions,
            self.extensions.insertions.len(),
        )?;
        policy.hash_map(
            &mut store.indices.voice_time,
            self.voice_times
                .iter()
                .filter(|value| value.value.is_some())
                .count(),
        )?;
        policy.hash_map(
            &mut store.indices.extensions.by_key,
            self.extensions.insertions.len(),
        )?;
        policy.hash_map(
            &mut store.indices.references.by_target,
            self.reference_buckets
                .iter()
                .filter(|bucket| bucket.value.is_some())
                .count(),
        )?;
        Ok(())
    }

    fn adopt(
        mut self,
        store: &mut LiveScoreStore,
        document_version: &mut DocumentVersionV1,
        committed_metrics: &mut KernelStage3MetricsV1,
    ) {
        self.adopt_entity_insertions(store);
        self.adopt_extension_insertions(store);
        self.adopt_record_replacements(store);
        if let Some(metadata) = self.header_metadata.take() {
            store.header.metadata = metadata;
        }
        self.adopt_orders(store);
        self.adopt_extension_order(store);
        self.adopt_entity_indices(store);
        self.adopt_extension_indices(store);
        self.adopt_voice_times(store);
        self.adopt_reference_buckets(store);
        self.remove_obsolete_slots(store);
        *document_version = self.next_version;
        *committed_metrics = self.metrics;
    }

    fn adopt_entity_insertions(&mut self, store: &mut LiveScoreStore) {
        for insertion in self.records.insert_measures.drain(..) {
            let handle = store.measures.insert(insertion.value);
            store
                .indices
                .entity
                .by_id
                .insert(insertion.id, RuntimeEntityRef::Measure(handle));
        }
        for insertion in self.records.insert_parts.drain(..) {
            let handle = store.parts.insert(insertion.value);
            store
                .indices
                .entity
                .by_id
                .insert(insertion.id, RuntimeEntityRef::Part(handle));
        }
        for insertion in self.records.insert_staffs.drain(..) {
            let handle = store.staffs.insert(insertion.value);
            store
                .indices
                .entity
                .by_id
                .insert(insertion.id, RuntimeEntityRef::Staff(handle));
        }
        for insertion in self.records.insert_voices.drain(..) {
            let handle = store.voices.insert(insertion.value);
            store
                .indices
                .entity
                .by_id
                .insert(insertion.id, RuntimeEntityRef::Voice(handle));
        }
        for insertion in self.records.insert_events.drain(..) {
            let handle = store.events.insert(insertion.value);
            store
                .indices
                .entity
                .by_id
                .insert(insertion.id, RuntimeEntityRef::Event(handle));
        }
        for insertion in self.records.insert_notes.drain(..) {
            let handle = store.notes.insert(insertion.value);
            store
                .indices
                .entity
                .by_id
                .insert(insertion.id, RuntimeEntityRef::Note(handle));
        }
    }

    fn adopt_extension_insertions(&mut self, store: &mut LiveScoreStore) {
        for insertion in &mut self.extensions.insertions {
            let handle = store
                .extensions
                .insert(insertion.value.take().expect("prepared extension record"));
            self.extensions.bindings[insertion.token] = handle;
        }
    }

    fn adopt_record_replacements(&mut self, store: &mut LiveScoreStore) {
        for replacement in self.records.replace_measures.drain(..) {
            *store
                .measures
                .get_mut(replacement.handle)
                .expect("preflighted measure") = replacement.value;
        }
        for replacement in self.records.replace_parts.drain(..) {
            *store
                .parts
                .get_mut(replacement.handle)
                .expect("preflighted part") = replacement.value;
        }
        for replacement in self.records.replace_staffs.drain(..) {
            *store
                .staffs
                .get_mut(replacement.handle)
                .expect("preflighted staff") = replacement.value;
        }
        for replacement in self.records.replace_voices.drain(..) {
            *store
                .voices
                .get_mut(replacement.handle)
                .expect("preflighted voice") = replacement.value;
        }
        for replacement in self.records.replace_events.drain(..) {
            *store
                .events
                .get_mut(replacement.handle)
                .expect("preflighted event") = replacement.value;
        }
        for replacement in self.records.replace_notes.drain(..) {
            *store
                .notes
                .get_mut(replacement.handle)
                .expect("preflighted note") = replacement.value;
        }
        for replacement in self.extensions.replacements.drain(..) {
            *store
                .extensions
                .get_mut(replacement.handle)
                .expect("preflighted extension") = replacement.value;
        }
    }

    fn adopt_orders(&mut self, store: &mut LiveScoreStore) {
        for order in self.orders.drain(..) {
            match order {
                PreparedOrderMutationV1::Measures(value) => {
                    store.topology.measure_order = patch_measure_order(store, value);
                }
                PreparedOrderMutationV1::Parts(value) => {
                    store.topology.part_order = patch_part_order(store, value);
                }
                PreparedOrderMutationV1::Staffs {
                    old_owner,
                    owner_id,
                    value,
                } => {
                    if let Some(owner) = old_owner {
                        store.topology.staff_order.remove(&owner);
                    }
                    if let Some(value) = value {
                        let owner = committed_part(store, &owner_id);
                        store
                            .topology
                            .staff_order
                            .insert(owner, patch_staff_order(store, value));
                    }
                }
                PreparedOrderMutationV1::MeasureContents {
                    old_owner,
                    owner_id,
                    value,
                } => {
                    if let Some(owner) = old_owner {
                        store.topology.content_order.remove(&owner);
                    }
                    if let Some(value) = value {
                        let owner = committed_part(store, &owner_id);
                        store
                            .topology
                            .content_order
                            .insert(owner, patch_measure_order(store, value));
                    }
                }
                PreparedOrderMutationV1::Voices {
                    old_key,
                    part_id,
                    measure_id,
                    value,
                } => {
                    if let Some(key) = old_key {
                        store.topology.voice_order.remove(&key);
                        store.topology.contents.remove(&key);
                    }
                    if let Some(value) = value {
                        let key = PartMeasureKey {
                            part: committed_part(store, &part_id),
                            measure: committed_measure(store, &measure_id),
                        };
                        store
                            .topology
                            .voice_order
                            .insert(key, patch_voice_order(store, value));
                        store.topology.contents.insert(
                            key,
                            PartMeasureContentRecord {
                                part: key.part,
                                measure: key.measure,
                            },
                        );
                    }
                }
                PreparedOrderMutationV1::Events {
                    old_owner,
                    owner_id,
                    value,
                } => {
                    if let Some(owner) = old_owner {
                        store.topology.event_order.remove(&owner);
                    }
                    if let Some(value) = value {
                        let owner = committed_voice(store, &owner_id);
                        store
                            .topology
                            .event_order
                            .insert(owner, patch_event_order(store, value));
                    }
                }
                PreparedOrderMutationV1::Notes {
                    old_owner,
                    owner_id,
                    value,
                } => {
                    if let Some(owner) = old_owner {
                        store.topology.note_order.remove(&owner);
                    }
                    if let Some(value) = value {
                        let owner = committed_event(store, &owner_id);
                        store
                            .topology
                            .note_order
                            .insert(owner, patch_note_order(store, value));
                    }
                }
            }
        }
    }

    fn adopt_extension_order(&mut self, store: &mut LiveScoreStore) {
        let Some(mut order) = self.extensions.order.take() else {
            return;
        };
        for (index, token) in self.extensions.order_patches.drain(..) {
            order[index] = self.extensions.bindings[token];
        }
        store.topology.extension_order = order;
    }

    fn adopt_entity_indices(&mut self, store: &mut LiveScoreStore) {
        for removal in &self.records.remove_measures {
            store.indices.ownership.measures.remove(&removal.handle);
            if !removal.retain_identity {
                store.indices.entity.by_id.remove(&removal.id);
            }
        }
        for removal in &self.records.remove_parts {
            store.indices.ownership.parts.remove(&removal.handle);
            if !removal.retain_identity {
                store.indices.entity.by_id.remove(&removal.id);
            }
        }
        for removal in &self.records.remove_staffs {
            store.indices.ownership.staffs.remove(&removal.handle);
            if !removal.retain_identity {
                store.indices.entity.by_id.remove(&removal.id);
            }
        }
        for removal in &self.records.remove_voices {
            store.indices.ownership.voices.remove(&removal.handle);
            if !removal.retain_identity {
                store.indices.entity.by_id.remove(&removal.id);
            }
        }
        for removal in &self.records.remove_events {
            store.indices.ownership.events.remove(&removal.handle);
            if !removal.retain_identity {
                store.indices.entity.by_id.remove(&removal.id);
            }
        }
        for removal in &self.records.remove_notes {
            store.indices.ownership.notes.remove(&removal.handle);
            if !removal.retain_identity {
                store.indices.entity.by_id.remove(&removal.id);
            }
        }

        for (address, owner) in self.records.inserted_owners.drain(..) {
            match (address, owner) {
                (
                    StableEntityAddressV1::Measure { measure_id },
                    StableOwnerAddressV1::Document { document_id },
                ) if document_id == store.header.id => {
                    store
                        .indices
                        .ownership
                        .measures
                        .insert(committed_measure(store, &measure_id), ());
                }
                (
                    StableEntityAddressV1::Part { part_id },
                    StableOwnerAddressV1::Document { document_id },
                ) if document_id == store.header.id => {
                    store
                        .indices
                        .ownership
                        .parts
                        .insert(committed_part(store, &part_id), ());
                }
                (
                    StableEntityAddressV1::Staff { staff_id },
                    StableOwnerAddressV1::Part { part_id },
                ) => {
                    store.indices.ownership.staffs.insert(
                        committed_staff(store, &staff_id),
                        committed_part(store, &part_id),
                    );
                }
                (
                    StableEntityAddressV1::Voice { voice_id },
                    StableOwnerAddressV1::PartMeasure {
                        part_id,
                        measure_id,
                    },
                ) => {
                    store.indices.ownership.voices.insert(
                        committed_voice(store, &voice_id),
                        PartMeasureKey {
                            part: committed_part(store, &part_id),
                            measure: committed_measure(store, &measure_id),
                        },
                    );
                }
                (
                    StableEntityAddressV1::Event { event_id },
                    StableOwnerAddressV1::Voice { voice_id },
                ) => {
                    store.indices.ownership.events.insert(
                        committed_event(store, &event_id),
                        committed_voice(store, &voice_id),
                    );
                }
                (
                    StableEntityAddressV1::Note { note_id },
                    StableOwnerAddressV1::Event { event_id },
                ) => {
                    store.indices.ownership.notes.insert(
                        committed_note(store, &note_id),
                        committed_event(store, &event_id),
                    );
                }
                _ => panic!("preflighted entity ownership route"),
            }
        }
    }

    fn adopt_extension_indices(&mut self, store: &mut LiveScoreStore) {
        for removal in &self.extensions.removals {
            store.indices.ownership.extensions.remove(&removal.handle);
            store.indices.extensions.by_key.remove(&removal.index_key);
        }
        for mut insertion in self.extensions.insertions.drain(..) {
            let handle = self.extensions.bindings[insertion.token];
            let owner = match insertion.key.owner {
                StableExtensionOwnerV1::Score => ExtensionIndexOwner::Score,
                StableExtensionOwnerV1::Part { part_id } => {
                    ExtensionIndexOwner::Part(committed_part(store, &part_id))
                }
            };
            insertion.index_bucket[0] = handle;
            store.indices.ownership.extensions.insert(handle, owner);
            store.indices.extensions.by_key.insert(
                ExtensionIndexKey {
                    namespace: insertion.key.namespace,
                    owner,
                },
                insertion.index_bucket,
            );
        }
    }

    fn adopt_voice_times(&mut self, store: &mut LiveScoreStore) {
        for mut prepared in self.voice_times.drain(..) {
            if let Some(old_voice) = prepared.old_voice {
                store.indices.voice_time.remove(&old_voice);
            }
            if let Some(mut value) = prepared.value.take() {
                for (index, event_id) in prepared.patches {
                    value.entries[index].event = committed_event(store, &event_id);
                }
                let voice = committed_voice(store, &prepared.voice_id);
                store.indices.voice_time.insert(voice, value);
            }
        }
    }

    fn adopt_reference_buckets(&mut self, store: &mut LiveScoreStore) {
        for bucket in self.reference_buckets.drain(..) {
            if let Some(value) = bucket.value {
                store
                    .indices
                    .references
                    .by_target
                    .insert(bucket.target, value);
            } else {
                store.indices.references.by_target.remove(&bucket.target);
            }
        }
    }

    fn remove_obsolete_slots(&mut self, store: &mut LiveScoreStore) {
        for removal in self.records.remove_notes.drain(..) {
            store.notes.remove(removal.handle);
        }
        for removal in self.records.remove_events.drain(..) {
            store.events.remove(removal.handle);
        }
        for removal in self.records.remove_voices.drain(..) {
            store.voices.remove(removal.handle);
        }
        for removal in self.records.remove_staffs.drain(..) {
            store.staffs.remove(removal.handle);
        }
        for removal in self.records.remove_parts.drain(..) {
            store.parts.remove(removal.handle);
        }
        for removal in self.records.remove_measures.drain(..) {
            store.measures.remove(removal.handle);
        }
        for removal in self.extensions.removals.drain(..) {
            store.extensions.remove(removal.handle);
        }
    }
}

#[cfg(test)]
mod tests {
    use brilliant_core_types::{SafeInteger, StableId};
    use brilliant_score_foundation::{
        ExtensionOwnerV1, PitchStepV1, RhythmicContentV1, RhythmicEventV1, WrittenPitchV1,
    };

    use super::*;
    use crate::{
        indices::{normalized_index_projection, rebuild_indices_from_store},
        overlay::OverlayMutationV1,
        store::{build_live_score_store, tests::fixture},
    };

    fn id(value: &str) -> StableId {
        StableId::new(value).expect("stable id")
    }

    fn assert_index_parity(store: &LiveScoreStore) {
        let (rebuilt, _) = rebuild_indices_from_store(store).expect("independent index rebuild");
        assert_eq!(
            normalized_index_projection(store, &store.indices).expect("live projection"),
            normalized_index_projection(store, &rebuilt).expect("rebuilt projection")
        );
    }

    fn rest_event(event_id: &str) -> RhythmicEventV1 {
        let source = &fixture().parts[0].measure_contents[1].voices[0]
            .sequence
            .events[0];
        RhythmicEventV1 {
            id: id(event_id),
            duration: source.duration.clone(),
            staff_id: None,
            content: RhythmicContentV1::Rest,
        }
    }

    #[test]
    fn transaction_forward_inverse_forward_preserves_documents_and_indices() {
        let mut store = build_live_score_store(&fixture()).expect("store");
        let baseline = store.export_document().expect("baseline");
        let mut overlay = TransactionOverlayV1::new(&store);

        assert_eq!(
            overlay
                .replace_scalar(
                    ScalarAddressV1::NoteWrittenPitch {
                        note_id: id("note-a"),
                    },
                    ScalarValueV1::NoteWrittenPitch(WrittenPitchV1 {
                        step: PitchStepV1::D,
                        alter: SafeInteger::new(0).expect("alter"),
                        octave: SafeInteger::new(4).expect("octave"),
                    }),
                )
                .expect("scalar"),
            OverlayMutationV1::Changed
        );
        overlay
            .move_ordered_child(
                StableOrderAddressV1::Staffs {
                    part_id: id("part-z"),
                },
                id("staff-z"),
                StableAnchorV1::After {
                    sibling_id: id("staff-a"),
                },
            )
            .expect("move staff");
        overlay
            .replace_ordered_children(
                StableOrderAddressV1::Measures {
                    document_id: id("score-root"),
                },
                vec![id("measure-a"), id("measure-z")],
            )
            .expect("replace measure order");
        overlay
            .remove_ordered_child(
                StableOrderAddressV1::Notes {
                    event_id: id("event-a"),
                },
                id("note-a"),
            )
            .expect("remove order child");
        overlay
            .insert_ordered_child(
                StableOrderAddressV1::Notes {
                    event_id: id("event-a"),
                },
                StableAnchorV1::Start,
                id("note-a"),
            )
            .expect("restore order child");
        overlay
            .update_reference(
                ReferenceAddressV1::VoiceDefaultStaff {
                    voice_id: id("voice-a"),
                },
                ReferenceValueV1::StableId(id("staff-z")),
            )
            .expect("voice reference");
        let inserted = rest_event("event-new");
        overlay
            .insert_entity(
                StableOwnerAddressV1::Voice {
                    voice_id: id("voice-z"),
                },
                StableOrderAddressV1::Events {
                    voice_id: id("voice-z"),
                },
                StableAnchorV1::After {
                    sibling_id: id("event-z"),
                },
                StableEntityAddressV1::Event {
                    event_id: inserted.id.clone(),
                },
                EntityBundleV1::Event(inserted),
            )
            .expect("insert event");

        let mut extension = baseline.extensions[0].clone();
        extension.namespace = "example.inserted".to_owned();
        overlay
            .insert_extension(
                StableAnchorV1::After {
                    sibling_id: extension_anchor_id_from_key(&ExtensionKeyV1::from_block(
                        &baseline.extensions[1],
                    )),
                },
                extension.clone(),
            )
            .expect("insert extension");
        extension.schema_version = SafeInteger::new(9).expect("schema version");
        overlay
            .replace_extension(ExtensionKeyV1::from_block(&extension), extension)
            .expect("replace inserted extension");

        let change_set = overlay.finish().expect("change set");
        let mut version = DocumentVersionV1::initial();
        let mut metrics = KernelStage3MetricsV1::default();
        let change_set = commit_change_set(&mut store, &mut version, &mut metrics, change_set)
            .expect("forward commit");
        let committed = store.export_document().expect("committed document");
        assert_ne!(committed, baseline);
        assert_eq!(version.get(), 1);
        assert_eq!(metrics.full_document_scans, 0);
        assert_eq!(metrics.full_document_clones, 0);
        assert_eq!(metrics.full_semantic_validations, 0);
        assert_eq!(metrics.full_snapshot_materializations, 0);
        assert_index_parity(&store);

        apply_stored_operations(
            &mut store,
            &mut version,
            &mut metrics,
            &change_set,
            &change_set.inverse,
        )
        .expect("inverse commit");
        assert_eq!(
            store.export_document().expect("restored document"),
            baseline
        );
        assert_index_parity(&store);

        apply_stored_operations(
            &mut store,
            &mut version,
            &mut metrics,
            &change_set,
            &change_set.forward,
        )
        .expect("second forward commit");
        assert_eq!(
            store.export_document().expect("recommitted document"),
            committed
        );
        assert_index_parity(&store);
    }

    #[test]
    fn aggregate_part_remove_and_inverse_restore_owned_extensions() {
        let mut document = fixture();
        let mut owned = document.extensions[0].clone();
        owned.namespace = "example.part-owned".to_owned();
        owned.owner = ExtensionOwnerV1::Part {
            part_id: id("part-z"),
        };
        document.extensions.push(owned);
        let mut store = build_live_score_store(&document).expect("store");
        let baseline = store.export_document().expect("baseline");
        let part_address = StableEntityAddressV1::Part {
            part_id: id("part-z"),
        };
        let expected = store.detach_entity(&part_address).expect("part bundle");
        let mut overlay = TransactionOverlayV1::new(&store);
        overlay
            .remove_entity(
                StableOwnerAddressV1::Document {
                    document_id: id("score-root"),
                },
                StableOrderAddressV1::Parts {
                    document_id: id("score-root"),
                },
                part_address,
            )
            .expect("remove part");
        let change_set = overlay.finish().expect("change set");
        assert!(matches!(expected, EntityBundleV1::Part(_)));

        let mut version = DocumentVersionV1::initial();
        let mut metrics = KernelStage3MetricsV1::default();
        let change_set = commit_change_set(&mut store, &mut version, &mut metrics, change_set)
            .expect("remove commit");
        let removed = store.export_document().expect("removed document");
        assert!(removed.parts.is_empty());
        assert_eq!(removed.extensions.len(), 2);
        assert_index_parity(&store);

        apply_stored_operations(
            &mut store,
            &mut version,
            &mut metrics,
            &change_set,
            &change_set.inverse,
        )
        .expect("restore part");
        assert_eq!(
            store.export_document().expect("restored document"),
            baseline
        );
        assert_index_parity(&store);
    }

    #[test]
    fn reserve_and_local_preflight_failures_are_semantic_zero_delta() {
        let mut store = build_live_score_store(&fixture()).expect("store");
        let baseline = store.export_document().expect("baseline");
        let baseline_projection =
            normalized_index_projection(&store, &store.indices).expect("baseline projection");
        let mut version = DocumentVersionV1::initial();
        let mut metrics = KernelStage3MetricsV1::default();

        let mut overlay = TransactionOverlayV1::new(&store);
        overlay
            .replace_scalar(
                ScalarAddressV1::PartName {
                    part_id: id("part-z"),
                },
                ScalarValueV1::PartName("Changed".to_owned()),
            )
            .expect("stage scalar");
        let change_set = overlay.finish().expect("change set");
        assert_eq!(
            commit_change_set_with_policy(
                &mut store,
                &mut version,
                &mut metrics,
                change_set,
                CommitReservationPolicyV1::fail_all(),
            ),
            Err(TransactionPrepareFailureV1::Capacity)
        );
        assert_eq!(
            store.export_document().expect("after reserve failure"),
            baseline
        );
        assert_eq!(version, DocumentVersionV1::initial());
        assert_eq!(metrics, KernelStage3MetricsV1::default());
        assert_eq!(
            normalized_index_projection(&store, &store.indices).expect("reserve projection"),
            baseline_projection
        );

        let mut overlay = TransactionOverlayV1::new(&store);
        overlay
            .remove_ordered_child(
                StableOrderAddressV1::MeasureContents {
                    part_id: id("part-z"),
                },
                id("measure-a"),
            )
            .expect("stage invalid coverage");
        let change_set = overlay.finish().expect("invalid change set");
        assert_eq!(
            commit_change_set(&mut store, &mut version, &mut metrics, change_set),
            Err(TransactionPrepareFailureV1::LocalInvariant)
        );
        assert_eq!(
            store.export_document().expect("after local failure"),
            baseline
        );
        assert_eq!(version, DocumentVersionV1::initial());
        assert_eq!(metrics, KernelStage3MetricsV1::default());
        assert_eq!(
            normalized_index_projection(&store, &store.indices).expect("local projection"),
            baseline_projection
        );
    }

    #[test]
    fn remove_then_reinsert_same_id_invalidates_the_old_generation() {
        let mut store = build_live_score_store(&fixture()).expect("store");
        let baseline = store.export_document().expect("baseline");
        let address = StableEntityAddressV1::Event {
            event_id: id("event-z"),
        };
        let bundle = store.detach_entity(&address).expect("event bundle");
        let old_handle = lookup_event(&store, &id("event-z")).expect("old event handle");
        let mut overlay = TransactionOverlayV1::new(&store);
        let owner = StableOwnerAddressV1::Voice {
            voice_id: id("voice-z"),
        };
        let order = StableOrderAddressV1::Events {
            voice_id: id("voice-z"),
        };
        overlay
            .remove_entity(owner.clone(), order.clone(), address.clone())
            .expect("remove event");
        overlay
            .insert_entity(owner, order, StableAnchorV1::Start, address, bundle)
            .expect("reinsert event");
        let change_set = overlay.finish().expect("change set");
        let mut version = DocumentVersionV1::initial();
        let mut metrics = KernelStage3MetricsV1::default();
        commit_change_set(&mut store, &mut version, &mut metrics, change_set)
            .expect("commit recreate");
        let new_handle = lookup_event(&store, &id("event-z")).expect("new event handle");
        assert_ne!(new_handle, old_handle);
        assert!(store.events.get(old_handle).is_none());
        assert_eq!(store.export_document().expect("same document"), baseline);
        assert_index_parity(&store);
    }
}
