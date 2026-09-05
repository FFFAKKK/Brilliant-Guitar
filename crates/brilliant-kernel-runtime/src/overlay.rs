use std::collections::{HashMap, HashSet};

use brilliant_core_types::StableId;
use brilliant_score_foundation::{
    ExtensionBlockV1, ExtensionOwnerV1, PartMeasureContentV1, RhythmicEventV1, ScoreMetadataV1,
    ScoreNoteV1, StaffDefinitionV1, TranspositionV1, VoiceV1,
};

use crate::change_set::{
    AnchoredExtensionBlockV1, ChangeSetBuildFailureV1, ChangeSetBuilderV1, ChangeSetV1,
    EntityBundleV1, MeasureBundleV1, MeasurePartContentBundleV1, OpenBatchSegmentV1, PartBundleV1,
    ReferenceAddressV1, ReferenceValueV1, ScalarAddressV1, ScalarValueV1, StableAnchorV1,
    StableEntityAddressV1, StableExtensionOwnerV1, StableOrderAddressV1, StableOwnerAddressV1,
};

pub(crate) const OVERLAY_LOOKUP_LAYER_COUNT_V1: usize = 4;

/// The only base-state surface visible to transaction preparation.
///
/// Implementations resolve the stable entity through the base entity index and
/// then detach exactly one typed value from its slot. No store, handle, mutable
/// container, or whole-document traversal crosses this boundary.
pub(crate) trait CoreBaseReadV1 {
    fn resolve_entity(&self, stable_id: &StableId) -> Option<StableEntityAddressV1>;
    fn read_owner(&self, address: &StableEntityAddressV1) -> Option<StableOwnerAddressV1>;
    fn read_scalar(&self, address: &ScalarAddressV1) -> Option<ScalarValueV1>;
    fn read_transposition(&self, part_id: &StableId) -> Option<TranspositionV1> {
        match self.read_scalar(&ScalarAddressV1::PartInstrument {
            part_id: part_id.clone(),
        })? {
            ScalarValueV1::PartInstrument(instrument) => Some(instrument.written_to_sounding),
            _ => None,
        }
    }
    fn detach_entity(&self, address: &StableEntityAddressV1) -> Option<EntityBundleV1>;
    fn read_order(&self, address: &StableOrderAddressV1) -> Option<Vec<StableId>>;
    /// Visit in document order, stopping when the callback returns false.
    /// The production store overrides this to borrow IDs without copying a list.
    fn visit_order(
        &self,
        address: &StableOrderAddressV1,
        visitor: &mut dyn FnMut(&StableId) -> bool,
    ) -> Option<()> {
        for id in self.read_order(address)? {
            if !visitor(&id) {
                break;
            }
        }
        Some(())
    }
    fn read_extension(&self, key: &ExtensionKeyV1) -> Option<AnchoredExtensionBlockV1>;
    fn read_reference(&self, address: &ReferenceAddressV1) -> Option<ReferenceValueV1>;
    fn list_references_to(&self, target_id: &StableId) -> Vec<ReferenceAddressV1>;
    fn read_voice_time(&self, voice_id: &StableId) -> Option<Vec<StableId>>;
}

#[derive(Clone, Debug, Eq, Hash, PartialEq)]
pub(crate) struct ExtensionKeyV1 {
    pub(crate) namespace: String,
    pub(crate) owner: StableExtensionOwnerV1,
}

impl ExtensionKeyV1 {
    pub(crate) fn from_block(value: &ExtensionBlockV1) -> Self {
        Self {
            namespace: value.namespace.clone(),
            owner: StableExtensionOwnerV1::from(&value.owner),
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
enum OverlayRecordV1 {
    Present(EntityBundleV1),
    Tombstone,
}

#[derive(Clone, Debug, Eq, PartialEq)]
enum OverlayEntityStateV1 {
    Present(StableEntityAddressV1),
    Tombstone,
}

#[derive(Clone, Debug, Eq, PartialEq)]
enum OverlayOwnerV1 {
    Present(StableOwnerAddressV1),
    Tombstone,
}

#[derive(Clone, Debug, Eq, PartialEq)]
enum OverlayExtensionV1 {
    Present(AnchoredExtensionBlockV1),
    Tombstone,
}

#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub(crate) struct OverlayWorkMetricsV1 {
    pub(crate) base_entity_lookups: u64,
    pub(crate) base_slot_reads: u64,
    pub(crate) overlay_record_writes: u64,
    pub(crate) order_copies: u64,
    pub(crate) time_index_copies: u64,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) enum OverlayFailureV1 {
    TransactionPoisoned,
    TargetNotFound {
        address: StableEntityAddressV1,
    },
    DuplicateEntity {
        address: StableEntityAddressV1,
    },
    EntityBundleAddressMismatch {
        expected: StableEntityAddressV1,
        actual: StableEntityAddressV1,
    },
    OwnershipRouteMismatch {
        address: StableEntityAddressV1,
        owner: Box<StableOwnerAddressV1>,
        order: Box<StableOrderAddressV1>,
    },
    OwnerNotFound {
        address: StableEntityAddressV1,
    },
    OwnerMismatch {
        address: StableEntityAddressV1,
        expected: Box<StableOwnerAddressV1>,
        actual: Box<StableOwnerAddressV1>,
    },
    ScalarTypeMismatch {
        address: ScalarAddressV1,
    },
    OrderNotFound {
        order: StableOrderAddressV1,
    },
    OrderedChildNotFound {
        order: StableOrderAddressV1,
        child_id: StableId,
    },
    DuplicateOrderedChild {
        order: StableOrderAddressV1,
        child_id: StableId,
    },
    AnchorNotFound {
        order: StableOrderAddressV1,
        sibling_id: StableId,
    },
    AnchorSelfReference {
        child_id: StableId,
    },
    OrderMembershipMismatch {
        order: StableOrderAddressV1,
    },
    ExtensionNotFound {
        key: ExtensionKeyV1,
    },
    DuplicateExtension {
        key: ExtensionKeyV1,
    },
    ExtensionKeyMismatch {
        expected: ExtensionKeyV1,
        actual: ExtensionKeyV1,
    },
    ReferenceNotFound {
        address: ReferenceAddressV1,
    },
    ReferenceTypeMismatch {
        address: ReferenceAddressV1,
    },
    ChangeSet(ChangeSetBuildFailureV1),
}

impl From<ChangeSetBuildFailureV1> for OverlayFailureV1 {
    fn from(value: ChangeSetBuildFailureV1) -> Self {
        Self::ChangeSet(value)
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum OverlayMutationV1 {
    Changed,
    NoOp,
}

/// Isolated touched-state transaction. Dropping this value publishes nothing.
pub(crate) struct TransactionOverlayV1<'a> {
    base: &'a dyn CoreBaseReadV1,
    records: HashMap<StableEntityAddressV1, OverlayRecordV1>,
    entity_states: HashMap<StableId, OverlayEntityStateV1>,
    owners: HashMap<StableEntityAddressV1, OverlayOwnerV1>,
    scalar_replacements: HashMap<ScalarAddressV1, ScalarValueV1>,
    orders: HashMap<StableOrderAddressV1, Vec<StableId>>,
    order_tombstones: HashSet<StableOrderAddressV1>,
    extensions: HashMap<ExtensionKeyV1, OverlayExtensionV1>,
    references: HashMap<ReferenceAddressV1, Option<ReferenceValueV1>>,
    reference_order: Vec<ReferenceAddressV1>,
    voice_times: HashMap<StableId, Option<Vec<StableId>>>,
    builder: ChangeSetBuilderV1,
    metrics: OverlayWorkMetricsV1,
    poisoned: bool,
}

impl<'a> TransactionOverlayV1<'a> {
    pub(crate) fn new(base: &'a dyn CoreBaseReadV1) -> Self {
        Self {
            base,
            records: HashMap::new(),
            entity_states: HashMap::new(),
            owners: HashMap::new(),
            scalar_replacements: HashMap::new(),
            orders: HashMap::new(),
            order_tombstones: HashSet::new(),
            extensions: HashMap::new(),
            references: HashMap::new(),
            reference_order: Vec::new(),
            voice_times: HashMap::new(),
            builder: ChangeSetBuilderV1::new(),
            metrics: OverlayWorkMetricsV1::default(),
            poisoned: false,
        }
    }

    pub(crate) fn metrics(&self) -> &OverlayWorkMetricsV1 {
        &self.metrics
    }

    pub(crate) fn operation_count(&self) -> usize {
        self.builder.operation_count()
    }

    pub(crate) fn logical_bytes(&self) -> u64 {
        self.builder.logical_bytes()
    }

    pub(crate) fn has_valid_nonempty_containers(&self) -> bool {
        self.orders.iter().all(|(address, values)| match address {
            StableOrderAddressV1::Measures { .. } | StableOrderAddressV1::Parts { .. } => {
                !values.is_empty()
            }
            StableOrderAddressV1::Staffs { part_id } => {
                self.read_owner(&StableEntityAddressV1::Part {
                    part_id: part_id.clone(),
                })
                .is_none()
                    || !values.is_empty()
            }
            StableOrderAddressV1::Voices {
                part_id,
                measure_id,
            } => {
                self.read_owner(&StableEntityAddressV1::Part {
                    part_id: part_id.clone(),
                })
                .is_none()
                    || self
                        .read_owner(&StableEntityAddressV1::Measure {
                            measure_id: measure_id.clone(),
                        })
                        .is_none()
                    || !values.is_empty()
            }
            StableOrderAddressV1::MeasureContents { .. }
            | StableOrderAddressV1::Events { .. }
            | StableOrderAddressV1::Notes { .. }
            | StableOrderAddressV1::Extensions { .. } => true,
        })
    }

    pub(crate) fn begin_segment(&self) -> OpenBatchSegmentV1 {
        self.builder.begin_segment()
    }

    pub(crate) fn end_segment(
        &mut self,
        segment: OpenBatchSegmentV1,
    ) -> Result<(), OverlayFailureV1> {
        self.ensure_active()?;
        let result = self.builder.end_segment(segment);
        self.map_builder_result(result)
    }

    pub(crate) fn add_prepared_effects(&mut self, count: u64) -> Result<(), OverlayFailureV1> {
        self.ensure_active()?;
        let result = self.builder.add_prepared_effects(count);
        self.map_builder_result(result)
    }

    pub(crate) fn record_affected(
        &mut self,
        address: StableEntityAddressV1,
    ) -> Result<(), OverlayFailureV1> {
        self.ensure_active()?;
        let result = self.builder.record_affected(address);
        self.map_builder_result(result)
    }

    pub(crate) fn read_scalar(&mut self, address: &ScalarAddressV1) -> Option<ScalarValueV1> {
        if let Some(value) = self.scalar_replacements.get(address) {
            return Some(value.clone());
        }

        let entity_address = scalar_entity_address(address);
        match self.entity_states.get(entity_address.stable_id()) {
            Some(OverlayEntityStateV1::Present(actual)) if actual == &entity_address => {
                return self
                    .records
                    .get(&entity_address)
                    .and_then(|record| match record {
                        OverlayRecordV1::Present(entity) => scalar_from_entity(entity, address),
                        OverlayRecordV1::Tombstone => None,
                    });
            }
            Some(OverlayEntityStateV1::Present(_)) | Some(OverlayEntityStateV1::Tombstone) => {
                return None;
            }
            None => {}
        }

        let actual = self.resolve_base_entity(entity_address.stable_id())?;
        if actual != entity_address {
            return None;
        }
        self.metrics.base_slot_reads = self.metrics.base_slot_reads.saturating_add(1);
        self.base.read_scalar(address)
    }

    /// The pitch dependency is only two integers; do not clone an instrument's
    /// potentially large display name or its owning part aggregate to read it.
    pub(crate) fn read_transposition(&mut self, part_id: &StableId) -> Option<TranspositionV1> {
        let scalar = ScalarAddressV1::PartInstrument {
            part_id: part_id.clone(),
        };
        if let Some(value) = self.scalar_replacements.get(&scalar) {
            return match value {
                ScalarValueV1::PartInstrument(instrument) => {
                    Some(instrument.written_to_sounding.clone())
                }
                _ => None,
            };
        }
        let address = StableEntityAddressV1::Part {
            part_id: part_id.clone(),
        };
        match self.entity_states.get(part_id) {
            Some(OverlayEntityStateV1::Present(actual)) if actual == &address => {
                return match self.records.get(&address)? {
                    OverlayRecordV1::Present(EntityBundleV1::Part(bundle)) => {
                        Some(bundle.part.instrument.written_to_sounding.clone())
                    }
                    _ => None,
                };
            }
            Some(_) => return None,
            None => {}
        }
        if self.resolve_base_entity(part_id)? != address {
            return None;
        }
        self.metrics.base_slot_reads += 1;
        self.base.read_transposition(part_id)
    }

    pub(crate) fn read_entity(
        &mut self,
        address: &StableEntityAddressV1,
    ) -> Option<EntityBundleV1> {
        let mut entity = match self.entity_states.get(address.stable_id()) {
            Some(OverlayEntityStateV1::Present(actual)) if actual == address => {
                match self.records.get(address) {
                    Some(OverlayRecordV1::Present(entity)) => entity.clone(),
                    Some(OverlayRecordV1::Tombstone) | None => return None,
                }
            }
            Some(OverlayEntityStateV1::Present(_)) | Some(OverlayEntityStateV1::Tombstone) => {
                return None;
            }
            None => {
                let actual = self.resolve_base_entity(address.stable_id())?;
                if actual != *address {
                    return None;
                }
                self.metrics.base_slot_reads = self.metrics.base_slot_reads.saturating_add(1);
                self.base.detach_entity(address)?
            }
        };
        project_touched_orders(
            &mut entity,
            &self.orders,
            &self.entity_states,
            &self.records,
        );
        prune_hidden_descendants(&mut entity, &self.entity_states);
        apply_scalar_replacements(&mut entity, &self.scalar_replacements);
        apply_reference_replacements(&mut entity, &self.references);
        Some(entity)
    }

    pub(crate) fn read_owner(
        &self,
        address: &StableEntityAddressV1,
    ) -> Option<StableOwnerAddressV1> {
        match self.owners.get(address) {
            Some(OverlayOwnerV1::Present(owner)) => Some(owner.clone()),
            Some(OverlayOwnerV1::Tombstone) => None,
            None => self.base.read_owner(address),
        }
    }

    pub(crate) fn read_order(&self, address: &StableOrderAddressV1) -> Option<Vec<StableId>> {
        if self.order_tombstones.contains(address) {
            return None;
        }
        self.orders
            .get(address)
            .cloned()
            .or_else(|| self.base.read_order(address))
    }

    pub(crate) fn visit_order(
        &self,
        address: &StableOrderAddressV1,
        visitor: &mut dyn FnMut(&StableId) -> bool,
    ) -> Option<()> {
        if self.order_tombstones.contains(address) {
            return None;
        }
        if let Some(order) = self.orders.get(address) {
            for id in order {
                if !visitor(id) {
                    break;
                }
            }
            Some(())
        } else {
            self.base.visit_order(address, visitor)
        }
    }

    pub(crate) fn read_extension(&self, key: &ExtensionKeyV1) -> Option<AnchoredExtensionBlockV1> {
        match self.extensions.get(key) {
            Some(OverlayExtensionV1::Present(value)) => Some(value.clone()),
            Some(OverlayExtensionV1::Tombstone) => None,
            None => self.base.read_extension(key),
        }
    }

    pub(crate) fn read_reference(&self, address: &ReferenceAddressV1) -> Option<ReferenceValueV1> {
        match self.references.get(address) {
            Some(value) => value.clone(),
            None => self.base.read_reference(address),
        }
    }

    pub(crate) fn list_references_to(&self, target_id: &StableId) -> Vec<ReferenceAddressV1> {
        let mut references = self.base.list_references_to(target_id);
        for address in &self.reference_order {
            references.retain(|candidate| candidate != address);
            if self.references.get(address).is_some_and(|value| {
                value
                    .as_ref()
                    .is_some_and(|value| reference_points_to(address, value, target_id))
            }) {
                references.push(address.clone());
            }
        }
        references
    }

    pub(crate) fn read_voice_time(&self, voice_id: &StableId) -> Option<Vec<StableId>> {
        match self.voice_times.get(voice_id) {
            Some(value) => value.clone(),
            None => self.base.read_voice_time(voice_id),
        }
    }

    pub(crate) fn replace_scalar(
        &mut self,
        address: ScalarAddressV1,
        value: ScalarValueV1,
    ) -> Result<OverlayMutationV1, OverlayFailureV1> {
        self.ensure_active()?;
        if !scalar_value_matches_address(&address, &value) {
            return self.reject(OverlayFailureV1::ScalarTypeMismatch { address });
        }
        let Some(expected) = self.read_scalar(&address) else {
            return self.reject(OverlayFailureV1::TargetNotFound {
                address: scalar_entity_address(&address),
            });
        };
        if expected == value {
            return Ok(OverlayMutationV1::NoOp);
        }

        let result = self
            .builder
            .replace_scalar(address.clone(), expected, value.clone());
        self.map_builder_result(result)?;
        self.scalar_replacements.insert(address.clone(), value);
        self.record_affected(scalar_entity_address(&address))?;
        self.metrics.overlay_record_writes = self.metrics.overlay_record_writes.saturating_add(1);
        Ok(OverlayMutationV1::Changed)
    }

    pub(crate) fn insert_entity(
        &mut self,
        owner: StableOwnerAddressV1,
        order: StableOrderAddressV1,
        anchor: StableAnchorV1,
        expected_address: StableEntityAddressV1,
        entity: EntityBundleV1,
    ) -> Result<OverlayMutationV1, OverlayFailureV1> {
        self.ensure_active()?;
        let actual = entity.root_address();
        if actual != expected_address {
            return self.reject(OverlayFailureV1::EntityBundleAddressMismatch {
                expected: expected_address,
                actual,
            });
        }
        if !ownership_route_matches(&expected_address, &owner, &order) {
            return self.reject(OverlayFailureV1::OwnershipRouteMismatch {
                address: expected_address,
                owner: Box::new(owner),
                order: Box::new(order),
            });
        }
        let entity_records = flatten_entity_records(&entity);
        let owned_orders = entity_owned_orders(&entity);
        let entity_owners = entity_owner_entries(&entity, owner.clone());
        let entity_references = entity_reference_entries(&entity);
        let entity_voice_times = entity_voice_time_entries(&entity);
        let entity_extensions = entity_extension_entries(&entity);
        let mut bundle_ids = HashSet::with_capacity(entity_records.len());
        for (address, _) in &entity_records {
            if !bundle_ids.insert(address.stable_id().clone())
                || self.resolve_entity_address(address.stable_id()).is_some()
            {
                return self.reject(OverlayFailureV1::DuplicateEntity {
                    address: address.clone(),
                });
            }
        }

        self.ensure_order_for_write(&order)?;
        let current_order = self.orders.get(&order).expect("touched order");
        let insert_at = match insertion_index(current_order, &anchor) {
            Ok(index) => index,
            Err(sibling_id) => {
                return self.reject(OverlayFailureV1::AnchorNotFound { order, sibling_id });
            }
        };
        if current_order
            .iter()
            .any(|id| id == expected_address.stable_id())
        {
            return self.reject(OverlayFailureV1::DuplicateOrderedChild {
                order,
                child_id: expected_address.stable_id().clone(),
            });
        }

        let result = self
            .builder
            .insert_entity(owner, order.clone(), anchor, entity.clone());
        self.map_builder_result(result)?;
        self.orders
            .get_mut(&order)
            .expect("touched order")
            .insert(insert_at, expected_address.stable_id().clone());
        for (address, record) in entity_records {
            clear_entity_scalar_replacements(&mut self.scalar_replacements, &address);
            self.records
                .insert(address.clone(), OverlayRecordV1::Present(record));
            self.entity_states.insert(
                address.stable_id().clone(),
                OverlayEntityStateV1::Present(address),
            );
            self.metrics.overlay_record_writes =
                self.metrics.overlay_record_writes.saturating_add(1);
        }
        for (address, entity_owner) in entity_owners {
            self.owners
                .insert(address, OverlayOwnerV1::Present(entity_owner));
        }
        for (owned_order, child_ids) in owned_orders {
            self.order_tombstones.remove(&owned_order);
            self.orders.insert(owned_order, child_ids);
        }
        for (reference, value) in entity_references {
            self.set_reference_state(reference, Some(value));
        }
        for (voice_id, event_ids) in entity_voice_times {
            self.set_voice_time_state(voice_id, Some(event_ids), false);
        }
        for (key, value) in entity_extensions {
            self.extensions
                .insert(key, OverlayExtensionV1::Present(value));
        }
        self.sync_voice_time_from_order(&order);
        self.record_affected(expected_address)?;
        Ok(OverlayMutationV1::Changed)
    }

    pub(crate) fn remove_entity(
        &mut self,
        owner: StableOwnerAddressV1,
        order: StableOrderAddressV1,
        address: StableEntityAddressV1,
    ) -> Result<OverlayMutationV1, OverlayFailureV1> {
        self.ensure_active()?;
        let Some(expected) = self.read_entity(&address) else {
            return self.reject(OverlayFailureV1::TargetNotFound { address });
        };
        let Some(actual_owner) = self.read_owner(&address) else {
            return self.reject(OverlayFailureV1::OwnerNotFound { address });
        };
        if actual_owner != owner {
            return self.reject(OverlayFailureV1::OwnerMismatch {
                address,
                expected: Box::new(owner),
                actual: Box::new(actual_owner),
            });
        }
        if !ownership_route_matches(&address, &owner, &order) {
            return self.reject(OverlayFailureV1::OwnershipRouteMismatch {
                address,
                owner: Box::new(owner),
                order: Box::new(order),
            });
        }
        self.ensure_order_for_write(&order)?;
        let current_order = self.orders.get(&order).expect("touched order");
        let Some(index) = current_order
            .iter()
            .position(|child_id| child_id == address.stable_id())
        else {
            return self.reject(OverlayFailureV1::OrderedChildNotFound {
                order,
                child_id: address.stable_id().clone(),
            });
        };
        let expected_anchor = anchor_before(current_order, index);
        let removed_records = flatten_entity_records(&expected);
        let removed_orders = entity_owned_orders(&expected);
        let removed_references = entity_reference_entries(&expected);
        let removed_voice_times = entity_voice_time_entries(&expected);
        let removed_extensions = entity_extension_entries(&expected);

        let result = self
            .builder
            .remove_entity(owner, order.clone(), expected_anchor, expected);
        self.map_builder_result(result)?;
        self.orders
            .get_mut(&order)
            .expect("touched order")
            .remove(index);
        for (removed_address, _) in removed_records {
            clear_entity_scalar_replacements(&mut self.scalar_replacements, &removed_address);
            self.records
                .insert(removed_address.clone(), OverlayRecordV1::Tombstone);
            self.entity_states.insert(
                removed_address.stable_id().clone(),
                OverlayEntityStateV1::Tombstone,
            );
            self.owners
                .insert(removed_address, OverlayOwnerV1::Tombstone);
            self.metrics.overlay_record_writes =
                self.metrics.overlay_record_writes.saturating_add(1);
        }
        for (removed_order, _) in removed_orders {
            self.orders.remove(&removed_order);
            self.order_tombstones.insert(removed_order);
        }
        for (reference, _) in removed_references {
            self.set_reference_state(reference, None);
        }
        for (voice_id, _) in removed_voice_times {
            self.set_voice_time_state(voice_id, None, false);
        }
        for (key, _) in removed_extensions {
            self.extensions.insert(key, OverlayExtensionV1::Tombstone);
        }
        self.sync_voice_time_from_order(&order);
        self.record_affected(address)?;
        Ok(OverlayMutationV1::Changed)
    }

    pub(crate) fn insert_ordered_child(
        &mut self,
        order: StableOrderAddressV1,
        anchor: StableAnchorV1,
        child_id: StableId,
    ) -> Result<OverlayMutationV1, OverlayFailureV1> {
        self.ensure_active()?;
        self.ensure_order_for_write(&order)?;
        let current_order = self.orders.get(&order).expect("touched order");
        if current_order.contains(&child_id) {
            return self.reject(OverlayFailureV1::DuplicateOrderedChild { order, child_id });
        }
        let insert_at = match insertion_index(current_order, &anchor) {
            Ok(index) => index,
            Err(sibling_id) => {
                return self.reject(OverlayFailureV1::AnchorNotFound { order, sibling_id });
            }
        };
        let result = self
            .builder
            .insert_ordered_child(order.clone(), anchor, child_id.clone());
        self.map_builder_result(result)?;
        self.orders
            .get_mut(&order)
            .expect("touched order")
            .insert(insert_at, child_id);
        self.sync_voice_time_from_order(&order);
        Ok(OverlayMutationV1::Changed)
    }

    pub(crate) fn remove_ordered_child(
        &mut self,
        order: StableOrderAddressV1,
        child_id: StableId,
    ) -> Result<OverlayMutationV1, OverlayFailureV1> {
        self.ensure_active()?;
        self.ensure_order_for_write(&order)?;
        let current_order = self.orders.get(&order).expect("touched order");
        let Some(index) = current_order.iter().position(|id| id == &child_id) else {
            return self.reject(OverlayFailureV1::OrderedChildNotFound { order, child_id });
        };
        let expected_anchor = anchor_before(current_order, index);
        let result =
            self.builder
                .remove_ordered_child(order.clone(), expected_anchor, child_id.clone());
        self.map_builder_result(result)?;
        self.orders
            .get_mut(&order)
            .expect("touched order")
            .remove(index);
        self.sync_voice_time_from_order(&order);
        Ok(OverlayMutationV1::Changed)
    }

    pub(crate) fn move_ordered_child(
        &mut self,
        order: StableOrderAddressV1,
        child_id: StableId,
        anchor: StableAnchorV1,
    ) -> Result<OverlayMutationV1, OverlayFailureV1> {
        self.ensure_active()?;
        if matches!(&anchor, StableAnchorV1::After { sibling_id } if sibling_id == &child_id) {
            return self.reject(OverlayFailureV1::AnchorSelfReference { child_id });
        }
        let Some(mut next_order) = self.read_order(&order) else {
            return self.reject(OverlayFailureV1::OrderNotFound { order });
        };
        let Some(old_index) = next_order.iter().position(|id| id == &child_id) else {
            return self.reject(OverlayFailureV1::OrderedChildNotFound { order, child_id });
        };
        let expected_anchor = anchor_before(&next_order, old_index);
        if expected_anchor == anchor {
            return Ok(OverlayMutationV1::NoOp);
        }

        next_order.remove(old_index);
        let insert_at = match insertion_index(&next_order, &anchor) {
            Ok(index) => index,
            Err(sibling_id) => {
                return self.reject(OverlayFailureV1::AnchorNotFound { order, sibling_id });
            }
        };
        self.ensure_order_for_write(&order)?;
        let result = self.builder.move_ordered_child(
            order.clone(),
            child_id.clone(),
            expected_anchor,
            anchor,
        );
        self.map_builder_result(result)?;
        next_order.insert(insert_at, child_id);
        self.orders.insert(order.clone(), next_order);
        self.sync_voice_time_from_order(&order);
        Ok(OverlayMutationV1::Changed)
    }

    pub(crate) fn replace_ordered_children(
        &mut self,
        order: StableOrderAddressV1,
        value: Vec<StableId>,
    ) -> Result<OverlayMutationV1, OverlayFailureV1> {
        self.ensure_active()?;
        let Some(expected) = self.read_order(&order) else {
            return self.reject(OverlayFailureV1::OrderNotFound { order });
        };
        if expected == value {
            return Ok(OverlayMutationV1::NoOp);
        }
        if !same_unique_members(&expected, &value) {
            return self.reject(OverlayFailureV1::OrderMembershipMismatch { order });
        }
        self.ensure_order_for_write(&order)?;
        let result = self
            .builder
            .replace_ordered_children(order.clone(), expected, value.clone());
        self.map_builder_result(result)?;
        self.orders.insert(order.clone(), value);
        self.sync_voice_time_from_order(&order);
        Ok(OverlayMutationV1::Changed)
    }

    pub(crate) fn insert_extension(
        &mut self,
        anchor: StableAnchorV1,
        value: ExtensionBlockV1,
    ) -> Result<OverlayMutationV1, OverlayFailureV1> {
        self.ensure_active()?;
        let key = ExtensionKeyV1::from_block(&value);
        if self.read_extension(&key).is_some() {
            return self.reject(OverlayFailureV1::DuplicateExtension { key });
        }
        let result = self
            .builder
            .insert_extension_block(anchor.clone(), value.clone());
        self.map_builder_result(result)?;
        self.extensions.insert(
            key,
            OverlayExtensionV1::Present(AnchoredExtensionBlockV1 { anchor, value }),
        );
        Ok(OverlayMutationV1::Changed)
    }

    pub(crate) fn replace_extension(
        &mut self,
        key: ExtensionKeyV1,
        value: ExtensionBlockV1,
    ) -> Result<OverlayMutationV1, OverlayFailureV1> {
        self.ensure_active()?;
        let actual_key = ExtensionKeyV1::from_block(&value);
        if actual_key != key {
            return self.reject(OverlayFailureV1::ExtensionKeyMismatch {
                expected: key,
                actual: actual_key,
            });
        }
        let Some(expected) = self.read_extension(&key) else {
            return self.reject(OverlayFailureV1::ExtensionNotFound { key });
        };
        if expected.value == value {
            return Ok(OverlayMutationV1::NoOp);
        }
        let result = self.builder.replace_extension_block(
            key.namespace.clone(),
            key.owner.clone(),
            expected.value,
            value.clone(),
        );
        self.map_builder_result(result)?;
        self.extensions.insert(
            key,
            OverlayExtensionV1::Present(AnchoredExtensionBlockV1 {
                anchor: expected.anchor,
                value,
            }),
        );
        Ok(OverlayMutationV1::Changed)
    }

    pub(crate) fn remove_extension(
        &mut self,
        key: ExtensionKeyV1,
    ) -> Result<OverlayMutationV1, OverlayFailureV1> {
        self.ensure_active()?;
        let Some(expected) = self.read_extension(&key) else {
            return self.reject(OverlayFailureV1::ExtensionNotFound { key });
        };
        let result = self
            .builder
            .remove_extension_block(expected.anchor, expected.value);
        self.map_builder_result(result)?;
        self.extensions.insert(key, OverlayExtensionV1::Tombstone);
        Ok(OverlayMutationV1::Changed)
    }

    pub(crate) fn update_reference(
        &mut self,
        address: ReferenceAddressV1,
        value: ReferenceValueV1,
    ) -> Result<OverlayMutationV1, OverlayFailureV1> {
        self.ensure_active()?;
        if !reference_value_matches_address(&address, &value) {
            return self.reject(OverlayFailureV1::ReferenceTypeMismatch { address });
        }
        let Some(expected) = self.read_reference(&address) else {
            return self.reject(OverlayFailureV1::ReferenceNotFound { address });
        };
        if expected == value {
            return Ok(OverlayMutationV1::NoOp);
        }
        let result = self
            .builder
            .update_reference(address.clone(), expected, value.clone());
        self.map_builder_result(result)?;
        self.set_reference_state(address, Some(value));
        Ok(OverlayMutationV1::Changed)
    }

    pub(crate) fn replace_voice_time(
        &mut self,
        voice_id: StableId,
        event_ids: Vec<StableId>,
    ) -> Result<OverlayMutationV1, OverlayFailureV1> {
        self.ensure_active()?;
        let Some(expected) = self.read_voice_time(&voice_id) else {
            return self.reject(OverlayFailureV1::TargetNotFound {
                address: StableEntityAddressV1::Voice { voice_id },
            });
        };
        if expected == event_ids {
            return Ok(OverlayMutationV1::NoOp);
        }
        self.set_voice_time_state(voice_id, Some(event_ids), true);
        Ok(OverlayMutationV1::Changed)
    }

    pub(crate) fn finish(self) -> Result<ChangeSetV1, OverlayFailureV1> {
        if self.poisoned {
            Err(OverlayFailureV1::TransactionPoisoned)
        } else {
            Ok(self.builder.finish())
        }
    }

    fn ensure_active(&self) -> Result<(), OverlayFailureV1> {
        if self.poisoned {
            Err(OverlayFailureV1::TransactionPoisoned)
        } else {
            Ok(())
        }
    }

    fn reject<T>(&mut self, failure: OverlayFailureV1) -> Result<T, OverlayFailureV1> {
        self.poisoned = true;
        Err(failure)
    }

    fn map_builder_result<T>(
        &mut self,
        result: Result<T, ChangeSetBuildFailureV1>,
    ) -> Result<T, OverlayFailureV1> {
        match result {
            Ok(value) => Ok(value),
            Err(failure) => self.reject(OverlayFailureV1::ChangeSet(failure)),
        }
    }

    fn ensure_order_for_write(
        &mut self,
        address: &StableOrderAddressV1,
    ) -> Result<(), OverlayFailureV1> {
        if self.orders.contains_key(address) {
            return Ok(());
        }
        if self.order_tombstones.contains(address) {
            return self.reject(OverlayFailureV1::OrderNotFound {
                order: address.clone(),
            });
        }
        let Some(value) = self.base.read_order(address) else {
            return self.reject(OverlayFailureV1::OrderNotFound {
                order: address.clone(),
            });
        };
        self.metrics.order_copies = self.metrics.order_copies.saturating_add(1);
        self.orders.insert(address.clone(), value);
        Ok(())
    }

    fn resolve_base_entity(&mut self, stable_id: &StableId) -> Option<StableEntityAddressV1> {
        self.metrics.base_entity_lookups = self.metrics.base_entity_lookups.saturating_add(1);
        self.base.resolve_entity(stable_id)
    }

    pub(crate) fn resolve_entity_address(
        &mut self,
        stable_id: &StableId,
    ) -> Option<StableEntityAddressV1> {
        match self.entity_states.get(stable_id) {
            Some(OverlayEntityStateV1::Present(address)) => Some(address.clone()),
            Some(OverlayEntityStateV1::Tombstone) => None,
            None => self.resolve_base_entity(stable_id),
        }
    }

    fn set_reference_state(
        &mut self,
        address: ReferenceAddressV1,
        value: Option<ReferenceValueV1>,
    ) {
        if !self.references.contains_key(&address) {
            self.reference_order.push(address.clone());
        }
        self.references.insert(address, value);
    }

    fn set_voice_time_state(
        &mut self,
        voice_id: StableId,
        value: Option<Vec<StableId>>,
        count_copy: bool,
    ) {
        if count_copy && !self.voice_times.contains_key(&voice_id) {
            self.metrics.time_index_copies = self.metrics.time_index_copies.saturating_add(1);
        }
        self.voice_times.insert(voice_id, value);
    }

    fn sync_voice_time_from_order(&mut self, order: &StableOrderAddressV1) {
        let StableOrderAddressV1::Events { voice_id } = order else {
            return;
        };
        let value = self.orders.get(order).cloned();
        self.set_voice_time_state(voice_id.clone(), value, true);
    }
}

fn flatten_entity_records(entity: &EntityBundleV1) -> Vec<(StableEntityAddressV1, EntityBundleV1)> {
    let mut records = Vec::new();
    append_entity_records(entity, &mut records);
    records
}

fn append_entity_records(
    entity: &EntityBundleV1,
    records: &mut Vec<(StableEntityAddressV1, EntityBundleV1)>,
) {
    records.push((entity.root_address(), entity.clone()));
    match entity {
        EntityBundleV1::Measure(bundle) => {
            for content in &bundle.contents {
                for voice in &content.voices {
                    append_entity_records(&EntityBundleV1::Voice(voice.clone()), records);
                }
            }
        }
        EntityBundleV1::Part(bundle) => {
            for staff in &bundle.part.staves {
                append_entity_records(&EntityBundleV1::Staff(staff.clone()), records);
            }
            for content in &bundle.part.measure_contents {
                for voice in &content.voices {
                    append_entity_records(&EntityBundleV1::Voice(voice.clone()), records);
                }
            }
        }
        EntityBundleV1::Voice(voice) => {
            for event in &voice.sequence.events {
                append_entity_records(&EntityBundleV1::Event(event.clone()), records);
            }
        }
        EntityBundleV1::Event(event) => {
            if let brilliant_score_foundation::RhythmicContentV1::Notes { notes } = &event.content {
                for note in notes {
                    append_entity_records(&EntityBundleV1::Note(note.clone()), records);
                }
            }
        }
        EntityBundleV1::Staff(_) | EntityBundleV1::Note(_) => {}
    }
}

fn entity_owned_orders(entity: &EntityBundleV1) -> Vec<(StableOrderAddressV1, Vec<StableId>)> {
    let mut orders = Vec::new();
    append_entity_orders(entity, &mut orders);
    orders
}

fn append_entity_orders(
    entity: &EntityBundleV1,
    orders: &mut Vec<(StableOrderAddressV1, Vec<StableId>)>,
) {
    match entity {
        EntityBundleV1::Measure(bundle) => {
            for content in &bundle.contents {
                orders.push((
                    StableOrderAddressV1::Voices {
                        part_id: content.part_id.clone(),
                        measure_id: bundle.definition.id.clone(),
                    },
                    content
                        .voices
                        .iter()
                        .map(|voice| voice.id.clone())
                        .collect(),
                ));
                for voice in &content.voices {
                    append_entity_orders(&EntityBundleV1::Voice(voice.clone()), orders);
                }
            }
        }
        EntityBundleV1::Part(bundle) => {
            orders.push((
                StableOrderAddressV1::Staffs {
                    part_id: bundle.part.id.clone(),
                },
                bundle
                    .part
                    .staves
                    .iter()
                    .map(|staff| staff.id.clone())
                    .collect(),
            ));
            orders.push((
                StableOrderAddressV1::MeasureContents {
                    part_id: bundle.part.id.clone(),
                },
                bundle
                    .part
                    .measure_contents
                    .iter()
                    .map(|content| content.measure_id.clone())
                    .collect(),
            ));
            for content in &bundle.part.measure_contents {
                orders.push((
                    StableOrderAddressV1::Voices {
                        part_id: bundle.part.id.clone(),
                        measure_id: content.measure_id.clone(),
                    },
                    content
                        .voices
                        .iter()
                        .map(|voice| voice.id.clone())
                        .collect(),
                ));
                for voice in &content.voices {
                    append_entity_orders(&EntityBundleV1::Voice(voice.clone()), orders);
                }
            }
        }
        EntityBundleV1::Voice(voice) => {
            orders.push((
                StableOrderAddressV1::Events {
                    voice_id: voice.id.clone(),
                },
                voice
                    .sequence
                    .events
                    .iter()
                    .map(|event| event.id.clone())
                    .collect(),
            ));
            for event in &voice.sequence.events {
                append_entity_orders(&EntityBundleV1::Event(event.clone()), orders);
            }
        }
        EntityBundleV1::Event(event) => {
            let note_ids = match &event.content {
                brilliant_score_foundation::RhythmicContentV1::Rest => Vec::new(),
                brilliant_score_foundation::RhythmicContentV1::Notes { notes } => {
                    notes.iter().map(|note| note.id.clone()).collect()
                }
            };
            orders.push((
                StableOrderAddressV1::Notes {
                    event_id: event.id.clone(),
                },
                note_ids,
            ));
        }
        EntityBundleV1::Staff(_) | EntityBundleV1::Note(_) => {}
    }
}

fn entity_owner_entries(
    entity: &EntityBundleV1,
    root_owner: StableOwnerAddressV1,
) -> Vec<(StableEntityAddressV1, StableOwnerAddressV1)> {
    let mut owners = Vec::new();
    append_entity_owners(entity, root_owner, &mut owners);
    owners
}

fn entity_reference_entries(
    entity: &EntityBundleV1,
) -> Vec<(ReferenceAddressV1, ReferenceValueV1)> {
    let mut references = Vec::new();
    append_entity_references(entity, &mut references);
    references
}

fn append_entity_references(
    entity: &EntityBundleV1,
    references: &mut Vec<(ReferenceAddressV1, ReferenceValueV1)>,
) {
    match entity {
        EntityBundleV1::Measure(bundle) => {
            for content in &bundle.contents {
                references.push((
                    ReferenceAddressV1::PartMeasureLink {
                        part_id: content.part_id.clone(),
                        measure_id: bundle.definition.id.clone(),
                    },
                    ReferenceValueV1::Present(true),
                ));
                for voice in &content.voices {
                    append_entity_references(&EntityBundleV1::Voice(voice.clone()), references);
                }
            }
        }
        EntityBundleV1::Part(bundle) => {
            for content in &bundle.part.measure_contents {
                references.push((
                    ReferenceAddressV1::PartMeasureLink {
                        part_id: bundle.part.id.clone(),
                        measure_id: content.measure_id.clone(),
                    },
                    ReferenceValueV1::Present(true),
                ));
                for voice in &content.voices {
                    append_entity_references(&EntityBundleV1::Voice(voice.clone()), references);
                }
            }
            for extension in &bundle.extensions {
                references.push((
                    ReferenceAddressV1::ExtensionOwner {
                        namespace: extension.value.namespace.clone(),
                        owner: StableExtensionOwnerV1::from(&extension.value.owner),
                    },
                    ReferenceValueV1::ExtensionOwner(extension.value.owner.clone()),
                ));
            }
        }
        EntityBundleV1::Voice(voice) => {
            references.push((
                ReferenceAddressV1::VoiceDefaultStaff {
                    voice_id: voice.id.clone(),
                },
                ReferenceValueV1::StableId(voice.default_staff_id.clone()),
            ));
            for event in &voice.sequence.events {
                append_entity_references(&EntityBundleV1::Event(event.clone()), references);
            }
        }
        EntityBundleV1::Event(event) => {
            references.push((
                ReferenceAddressV1::EventStaffAssignment {
                    event_id: event.id.clone(),
                },
                ReferenceValueV1::OptionalStableId(event.staff_id.clone()),
            ));
        }
        EntityBundleV1::Staff(_) | EntityBundleV1::Note(_) => {}
    }
}

fn entity_voice_time_entries(entity: &EntityBundleV1) -> Vec<(StableId, Vec<StableId>)> {
    let mut voice_times = Vec::new();
    append_entity_voice_times(entity, &mut voice_times);
    voice_times
}

fn append_entity_voice_times(
    entity: &EntityBundleV1,
    voice_times: &mut Vec<(StableId, Vec<StableId>)>,
) {
    match entity {
        EntityBundleV1::Measure(bundle) => {
            for content in &bundle.contents {
                for voice in &content.voices {
                    append_entity_voice_times(&EntityBundleV1::Voice(voice.clone()), voice_times);
                }
            }
        }
        EntityBundleV1::Part(bundle) => {
            for content in &bundle.part.measure_contents {
                for voice in &content.voices {
                    append_entity_voice_times(&EntityBundleV1::Voice(voice.clone()), voice_times);
                }
            }
        }
        EntityBundleV1::Voice(voice) => voice_times.push((
            voice.id.clone(),
            voice
                .sequence
                .events
                .iter()
                .map(|event| event.id.clone())
                .collect(),
        )),
        EntityBundleV1::Event(_) | EntityBundleV1::Staff(_) | EntityBundleV1::Note(_) => {}
    }
}

fn entity_extension_entries(
    entity: &EntityBundleV1,
) -> Vec<(ExtensionKeyV1, AnchoredExtensionBlockV1)> {
    let EntityBundleV1::Part(bundle) = entity else {
        return Vec::new();
    };
    bundle
        .extensions
        .iter()
        .cloned()
        .map(|extension| (ExtensionKeyV1::from_block(&extension.value), extension))
        .collect()
}

fn append_entity_owners(
    entity: &EntityBundleV1,
    owner: StableOwnerAddressV1,
    owners: &mut Vec<(StableEntityAddressV1, StableOwnerAddressV1)>,
) {
    owners.push((entity.root_address(), owner));
    match entity {
        EntityBundleV1::Measure(bundle) => {
            for content in &bundle.contents {
                for voice in &content.voices {
                    append_entity_owners(
                        &EntityBundleV1::Voice(voice.clone()),
                        StableOwnerAddressV1::PartMeasure {
                            part_id: content.part_id.clone(),
                            measure_id: bundle.definition.id.clone(),
                        },
                        owners,
                    );
                }
            }
        }
        EntityBundleV1::Part(bundle) => {
            for staff in &bundle.part.staves {
                append_entity_owners(
                    &EntityBundleV1::Staff(staff.clone()),
                    StableOwnerAddressV1::Part {
                        part_id: bundle.part.id.clone(),
                    },
                    owners,
                );
            }
            for content in &bundle.part.measure_contents {
                for voice in &content.voices {
                    append_entity_owners(
                        &EntityBundleV1::Voice(voice.clone()),
                        StableOwnerAddressV1::PartMeasure {
                            part_id: bundle.part.id.clone(),
                            measure_id: content.measure_id.clone(),
                        },
                        owners,
                    );
                }
            }
        }
        EntityBundleV1::Voice(voice) => {
            for event in &voice.sequence.events {
                append_entity_owners(
                    &EntityBundleV1::Event(event.clone()),
                    StableOwnerAddressV1::Voice {
                        voice_id: voice.id.clone(),
                    },
                    owners,
                );
            }
        }
        EntityBundleV1::Event(event) => {
            if let brilliant_score_foundation::RhythmicContentV1::Notes { notes } = &event.content {
                for note in notes {
                    append_entity_owners(
                        &EntityBundleV1::Note(note.clone()),
                        StableOwnerAddressV1::Event {
                            event_id: event.id.clone(),
                        },
                        owners,
                    );
                }
            }
        }
        EntityBundleV1::Staff(_) | EntityBundleV1::Note(_) => {}
    }
}

fn ownership_route_matches(
    address: &StableEntityAddressV1,
    owner: &StableOwnerAddressV1,
    order: &StableOrderAddressV1,
) -> bool {
    match (address, owner, order) {
        (
            StableEntityAddressV1::Measure { .. },
            StableOwnerAddressV1::Document {
                document_id: owner_document_id,
            },
            StableOrderAddressV1::Measures {
                document_id: order_document_id,
            },
        )
        | (
            StableEntityAddressV1::Part { .. },
            StableOwnerAddressV1::Document {
                document_id: owner_document_id,
            },
            StableOrderAddressV1::Parts {
                document_id: order_document_id,
            },
        ) => owner_document_id == order_document_id,
        (
            StableEntityAddressV1::Staff { .. },
            StableOwnerAddressV1::Part {
                part_id: owner_part_id,
            },
            StableOrderAddressV1::Staffs {
                part_id: order_part_id,
            },
        ) => owner_part_id == order_part_id,
        (
            StableEntityAddressV1::Voice { .. },
            StableOwnerAddressV1::PartMeasure {
                part_id: owner_part_id,
                measure_id: owner_measure_id,
            },
            StableOrderAddressV1::Voices {
                part_id: order_part_id,
                measure_id: order_measure_id,
            },
        ) => owner_part_id == order_part_id && owner_measure_id == order_measure_id,
        (
            StableEntityAddressV1::Event { .. },
            StableOwnerAddressV1::Voice {
                voice_id: owner_voice_id,
            },
            StableOrderAddressV1::Events {
                voice_id: order_voice_id,
            },
        ) => owner_voice_id == order_voice_id,
        (
            StableEntityAddressV1::Note { .. },
            StableOwnerAddressV1::Event {
                event_id: owner_event_id,
            },
            StableOrderAddressV1::Notes {
                event_id: order_event_id,
            },
        ) => owner_event_id == order_event_id,
        _ => false,
    }
}

fn reference_value_matches_address(address: &ReferenceAddressV1, value: &ReferenceValueV1) -> bool {
    matches!(
        (address, value),
        (
            ReferenceAddressV1::VoiceDefaultStaff { .. },
            ReferenceValueV1::StableId(_)
        ) | (
            ReferenceAddressV1::EventStaffAssignment { .. },
            ReferenceValueV1::OptionalStableId(_)
        ) | (
            ReferenceAddressV1::PartMeasureLink { .. },
            ReferenceValueV1::Present(_)
        ) | (
            ReferenceAddressV1::ExtensionOwner { .. },
            ReferenceValueV1::ExtensionOwner(_)
        )
    )
}

fn reference_points_to(
    address: &ReferenceAddressV1,
    value: &ReferenceValueV1,
    target_id: &StableId,
) -> bool {
    match (address, value) {
        (ReferenceAddressV1::VoiceDefaultStaff { .. }, ReferenceValueV1::StableId(value)) => {
            value == target_id
        }
        (
            ReferenceAddressV1::EventStaffAssignment { .. },
            ReferenceValueV1::OptionalStableId(value),
        ) => value.as_ref() == Some(target_id),
        (
            ReferenceAddressV1::PartMeasureLink {
                part_id,
                measure_id,
            },
            ReferenceValueV1::Present(true),
        ) => part_id == target_id || measure_id == target_id,
        (
            ReferenceAddressV1::ExtensionOwner { .. },
            ReferenceValueV1::ExtensionOwner(ExtensionOwnerV1::Part { part_id }),
        ) => part_id == target_id,
        _ => false,
    }
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

fn scalar_value_matches_address(address: &ScalarAddressV1, value: &ScalarValueV1) -> bool {
    matches!(
        (address, value),
        (
            ScalarAddressV1::DocumentMetadata { .. },
            ScalarValueV1::DocumentMetadata(_)
        ) | (
            ScalarAddressV1::MeasureDefinition { .. },
            ScalarValueV1::MeasureDefinition { .. }
        ) | (ScalarAddressV1::PartName { .. }, ScalarValueV1::PartName(_))
            | (
                ScalarAddressV1::PartInstrument { .. },
                ScalarValueV1::PartInstrument(_)
            )
            | (
                ScalarAddressV1::StaffDefinition { .. },
                ScalarValueV1::StaffDefinition { .. }
            )
            | (
                ScalarAddressV1::VoiceSequenceStart { .. },
                ScalarValueV1::VoiceSequenceStart(_)
            )
            | (
                ScalarAddressV1::EventNoteValue { .. },
                ScalarValueV1::EventNoteValue(_)
            )
            | (
                ScalarAddressV1::NoteWrittenPitch { .. },
                ScalarValueV1::NoteWrittenPitch(_)
            )
    )
}

fn scalar_from_entity(entity: &EntityBundleV1, address: &ScalarAddressV1) -> Option<ScalarValueV1> {
    match (entity, address) {
        (EntityBundleV1::Measure(bundle), ScalarAddressV1::MeasureDefinition { measure_id })
            if &bundle.definition.id == measure_id =>
        {
            Some(ScalarValueV1::MeasureDefinition {
                meter: bundle.definition.meter.clone(),
                pickup_duration: bundle.definition.pickup_duration.clone(),
            })
        }
        (EntityBundleV1::Part(bundle), ScalarAddressV1::PartName { part_id })
            if &bundle.part.id == part_id =>
        {
            Some(ScalarValueV1::PartName(bundle.part.name.clone()))
        }
        (EntityBundleV1::Part(bundle), ScalarAddressV1::PartInstrument { part_id })
            if &bundle.part.id == part_id =>
        {
            Some(ScalarValueV1::PartInstrument(
                bundle.part.instrument.clone(),
            ))
        }
        (EntityBundleV1::Staff(staff), ScalarAddressV1::StaffDefinition { staff_id })
            if &staff.id == staff_id =>
        {
            Some(ScalarValueV1::StaffDefinition {
                line_count: staff.line_count,
                default_clef: staff.default_clef.clone(),
            })
        }
        (EntityBundleV1::Voice(voice), ScalarAddressV1::VoiceSequenceStart { voice_id })
            if &voice.id == voice_id =>
        {
            Some(ScalarValueV1::VoiceSequenceStart(
                voice.sequence.start.clone(),
            ))
        }
        (EntityBundleV1::Event(event), ScalarAddressV1::EventNoteValue { event_id })
            if &event.id == event_id =>
        {
            Some(ScalarValueV1::EventNoteValue(event.duration.clone()))
        }
        (EntityBundleV1::Note(note), ScalarAddressV1::NoteWrittenPitch { note_id })
            if &note.id == note_id =>
        {
            Some(ScalarValueV1::NoteWrittenPitch(note.written_pitch.clone()))
        }
        _ => None,
    }
}

fn apply_scalar_replacements(
    entity: &mut EntityBundleV1,
    replacements: &HashMap<ScalarAddressV1, ScalarValueV1>,
) {
    match entity {
        EntityBundleV1::Measure(bundle) => {
            let address = ScalarAddressV1::MeasureDefinition {
                measure_id: bundle.definition.id.clone(),
            };
            if let Some(ScalarValueV1::MeasureDefinition {
                meter,
                pickup_duration,
            }) = replacements.get(&address)
            {
                bundle.definition.meter = meter.clone();
                bundle.definition.pickup_duration = pickup_duration.clone();
            }
            for content in &mut bundle.contents {
                for voice in &mut content.voices {
                    apply_voice_scalar_replacements(voice, replacements);
                }
            }
        }
        EntityBundleV1::Part(bundle) => {
            let name = ScalarAddressV1::PartName {
                part_id: bundle.part.id.clone(),
            };
            if let Some(ScalarValueV1::PartName(value)) = replacements.get(&name) {
                bundle.part.name.clone_from(value);
            }
            let instrument = ScalarAddressV1::PartInstrument {
                part_id: bundle.part.id.clone(),
            };
            if let Some(ScalarValueV1::PartInstrument(value)) = replacements.get(&instrument) {
                bundle.part.instrument.clone_from(value);
            }
            for staff in &mut bundle.part.staves {
                apply_staff_scalar_replacements(staff, replacements);
            }
            for content in &mut bundle.part.measure_contents {
                for voice in &mut content.voices {
                    apply_voice_scalar_replacements(voice, replacements);
                }
            }
        }
        EntityBundleV1::Staff(staff) => apply_staff_scalar_replacements(staff, replacements),
        EntityBundleV1::Voice(voice) => apply_voice_scalar_replacements(voice, replacements),
        EntityBundleV1::Event(event) => apply_event_scalar_replacements(event, replacements),
        EntityBundleV1::Note(note) => apply_note_scalar_replacements(note, replacements),
    }
}

fn apply_reference_replacements(
    entity: &mut EntityBundleV1,
    replacements: &HashMap<ReferenceAddressV1, Option<ReferenceValueV1>>,
) {
    match entity {
        EntityBundleV1::Measure(bundle) => {
            for content in &mut bundle.contents {
                for voice in &mut content.voices {
                    apply_voice_reference_replacements(voice, replacements);
                }
            }
        }
        EntityBundleV1::Part(bundle) => {
            for content in &mut bundle.part.measure_contents {
                for voice in &mut content.voices {
                    apply_voice_reference_replacements(voice, replacements);
                }
            }
        }
        EntityBundleV1::Voice(voice) => apply_voice_reference_replacements(voice, replacements),
        EntityBundleV1::Event(event) => apply_event_reference_replacements(event, replacements),
        EntityBundleV1::Staff(_) | EntityBundleV1::Note(_) => {}
    }
}

fn apply_voice_reference_replacements(
    voice: &mut VoiceV1,
    replacements: &HashMap<ReferenceAddressV1, Option<ReferenceValueV1>>,
) {
    let address = ReferenceAddressV1::VoiceDefaultStaff {
        voice_id: voice.id.clone(),
    };
    if let Some(Some(ReferenceValueV1::StableId(value))) = replacements.get(&address) {
        voice.default_staff_id.clone_from(value);
    }
    for event in &mut voice.sequence.events {
        apply_event_reference_replacements(event, replacements);
    }
}

fn apply_event_reference_replacements(
    event: &mut RhythmicEventV1,
    replacements: &HashMap<ReferenceAddressV1, Option<ReferenceValueV1>>,
) {
    let address = ReferenceAddressV1::EventStaffAssignment {
        event_id: event.id.clone(),
    };
    if let Some(Some(ReferenceValueV1::OptionalStableId(value))) = replacements.get(&address) {
        event.staff_id.clone_from(value);
    }
}

fn prune_hidden_descendants(
    entity: &mut EntityBundleV1,
    states: &HashMap<StableId, OverlayEntityStateV1>,
) {
    match entity {
        EntityBundleV1::Measure(bundle) => {
            for content in &mut bundle.contents {
                content.voices.retain(|voice| {
                    entity_address_is_visible(
                        &StableEntityAddressV1::Voice {
                            voice_id: voice.id.clone(),
                        },
                        states,
                    )
                });
                for voice in &mut content.voices {
                    prune_voice_descendants(voice, states);
                }
            }
        }
        EntityBundleV1::Part(bundle) => {
            bundle.part.staves.retain(|staff| {
                entity_address_is_visible(
                    &StableEntityAddressV1::Staff {
                        staff_id: staff.id.clone(),
                    },
                    states,
                )
            });
            for content in &mut bundle.part.measure_contents {
                content.voices.retain(|voice| {
                    entity_address_is_visible(
                        &StableEntityAddressV1::Voice {
                            voice_id: voice.id.clone(),
                        },
                        states,
                    )
                });
                for voice in &mut content.voices {
                    prune_voice_descendants(voice, states);
                }
            }
        }
        EntityBundleV1::Voice(voice) => prune_voice_descendants(voice, states),
        EntityBundleV1::Event(event) => prune_event_descendants(event, states),
        EntityBundleV1::Staff(_) | EntityBundleV1::Note(_) => {}
    }
}

fn project_touched_orders(
    entity: &mut EntityBundleV1,
    orders: &HashMap<StableOrderAddressV1, Vec<StableId>>,
    states: &HashMap<StableId, OverlayEntityStateV1>,
    records: &HashMap<StableEntityAddressV1, OverlayRecordV1>,
) {
    match entity {
        EntityBundleV1::Measure(bundle) => {
            if let Some(part_order) = orders.iter().find_map(|(address, value)| {
                matches!(address, StableOrderAddressV1::Parts { .. }).then_some(value)
            }) {
                let measure_id = bundle.definition.id.clone();
                let mut existing: HashMap<StableId, MeasurePartContentBundleV1> = bundle
                    .contents
                    .drain(..)
                    .map(|content| (content.part_id.clone(), content))
                    .collect();
                bundle.contents = part_order
                    .iter()
                    .filter_map(|part_id| {
                        let part_address = StableEntityAddressV1::Part {
                            part_id: part_id.clone(),
                        };
                        if !entity_address_is_visible(&part_address, states) {
                            return None;
                        }
                        existing.remove(part_id).or_else(|| {
                            let OverlayRecordV1::Present(EntityBundleV1::Part(part)) =
                                records.get(&part_address)?
                            else {
                                return None;
                            };
                            let content = part
                                .part
                                .measure_contents
                                .iter()
                                .find(|content| content.measure_id == measure_id)?;
                            Some(MeasurePartContentBundleV1 {
                                part_id: part_id.clone(),
                                voices: content.voices.clone(),
                            })
                        })
                    })
                    .collect();
            }
            for content in &mut bundle.contents {
                project_voice_order(
                    &content.part_id,
                    &bundle.definition.id,
                    &mut content.voices,
                    orders,
                    states,
                    records,
                );
            }
        }
        EntityBundleV1::Part(bundle) => {
            project_staff_order(
                &bundle.part.id,
                &mut bundle.part.staves,
                orders,
                states,
                records,
            );
            if let Some(order) = orders.get(&StableOrderAddressV1::MeasureContents {
                part_id: bundle.part.id.clone(),
            }) {
                let part_id = bundle.part.id.clone();
                let mut existing: HashMap<StableId, _> = bundle
                    .part
                    .measure_contents
                    .drain(..)
                    .map(|content| (content.measure_id.clone(), content))
                    .collect();
                bundle.part.measure_contents = order
                    .iter()
                    .filter_map(|measure_id| {
                        let measure_address = StableEntityAddressV1::Measure {
                            measure_id: measure_id.clone(),
                        };
                        if !entity_address_is_visible(&measure_address, states) {
                            return None;
                        }
                        existing.remove(measure_id).or_else(|| {
                            orders
                                .contains_key(&StableOrderAddressV1::Voices {
                                    part_id: part_id.clone(),
                                    measure_id: measure_id.clone(),
                                })
                                .then(|| PartMeasureContentV1 {
                                    measure_id: measure_id.clone(),
                                    voices: Vec::new(),
                                })
                        })
                    })
                    .collect();
            }
            for content in &mut bundle.part.measure_contents {
                project_voice_order(
                    &bundle.part.id,
                    &content.measure_id,
                    &mut content.voices,
                    orders,
                    states,
                    records,
                );
            }
        }
        EntityBundleV1::Voice(voice) => project_event_order(voice, orders, states, records),
        EntityBundleV1::Event(event) => project_note_order(event, orders, states, records),
        EntityBundleV1::Staff(_) | EntityBundleV1::Note(_) => {}
    }
}

fn project_staff_order(
    part_id: &StableId,
    staves: &mut Vec<StaffDefinitionV1>,
    orders: &HashMap<StableOrderAddressV1, Vec<StableId>>,
    states: &HashMap<StableId, OverlayEntityStateV1>,
    records: &HashMap<StableEntityAddressV1, OverlayRecordV1>,
) {
    let Some(order) = orders.get(&StableOrderAddressV1::Staffs {
        part_id: part_id.clone(),
    }) else {
        return;
    };
    let mut existing: HashMap<StableId, StaffDefinitionV1> = staves
        .drain(..)
        .map(|staff| (staff.id.clone(), staff))
        .collect();
    *staves = order
        .iter()
        .filter_map(|staff_id| {
            let address = StableEntityAddressV1::Staff {
                staff_id: staff_id.clone(),
            };
            if !entity_address_is_visible(&address, states) {
                return None;
            }
            match records.get(&address) {
                Some(OverlayRecordV1::Present(EntityBundleV1::Staff(staff))) => Some(staff.clone()),
                _ => existing.remove(staff_id),
            }
        })
        .collect();
}

fn project_voice_order(
    part_id: &StableId,
    measure_id: &StableId,
    voices: &mut Vec<VoiceV1>,
    orders: &HashMap<StableOrderAddressV1, Vec<StableId>>,
    states: &HashMap<StableId, OverlayEntityStateV1>,
    records: &HashMap<StableEntityAddressV1, OverlayRecordV1>,
) {
    let Some(order) = orders.get(&StableOrderAddressV1::Voices {
        part_id: part_id.clone(),
        measure_id: measure_id.clone(),
    }) else {
        return;
    };
    let mut existing: HashMap<StableId, VoiceV1> = voices
        .drain(..)
        .map(|voice| (voice.id.clone(), voice))
        .collect();
    *voices = order
        .iter()
        .filter_map(|voice_id| {
            let address = StableEntityAddressV1::Voice {
                voice_id: voice_id.clone(),
            };
            if !entity_address_is_visible(&address, states) {
                return None;
            }
            let mut voice = match records.get(&address) {
                Some(OverlayRecordV1::Present(EntityBundleV1::Voice(voice))) => voice.clone(),
                _ => existing.remove(voice_id)?,
            };
            project_event_order(&mut voice, orders, states, records);
            Some(voice)
        })
        .collect();
}

fn project_event_order(
    voice: &mut VoiceV1,
    orders: &HashMap<StableOrderAddressV1, Vec<StableId>>,
    states: &HashMap<StableId, OverlayEntityStateV1>,
    records: &HashMap<StableEntityAddressV1, OverlayRecordV1>,
) {
    let Some(order) = orders.get(&StableOrderAddressV1::Events {
        voice_id: voice.id.clone(),
    }) else {
        return;
    };
    let mut existing: HashMap<StableId, RhythmicEventV1> = voice
        .sequence
        .events
        .drain(..)
        .map(|event| (event.id.clone(), event))
        .collect();
    voice.sequence.events = order
        .iter()
        .filter_map(|event_id| {
            let address = StableEntityAddressV1::Event {
                event_id: event_id.clone(),
            };
            if !entity_address_is_visible(&address, states) {
                return None;
            }
            let mut event = match records.get(&address) {
                Some(OverlayRecordV1::Present(EntityBundleV1::Event(event))) => event.clone(),
                _ => existing.remove(event_id)?,
            };
            project_note_order(&mut event, orders, states, records);
            Some(event)
        })
        .collect();
}

fn project_note_order(
    event: &mut RhythmicEventV1,
    orders: &HashMap<StableOrderAddressV1, Vec<StableId>>,
    states: &HashMap<StableId, OverlayEntityStateV1>,
    records: &HashMap<StableEntityAddressV1, OverlayRecordV1>,
) {
    let brilliant_score_foundation::RhythmicContentV1::Notes { notes } = &mut event.content else {
        return;
    };
    let Some(order) = orders.get(&StableOrderAddressV1::Notes {
        event_id: event.id.clone(),
    }) else {
        return;
    };
    let mut existing: HashMap<StableId, ScoreNoteV1> = notes
        .drain(..)
        .map(|note| (note.id.clone(), note))
        .collect();
    *notes = order
        .iter()
        .filter_map(|note_id| {
            let address = StableEntityAddressV1::Note {
                note_id: note_id.clone(),
            };
            if !entity_address_is_visible(&address, states) {
                return None;
            }
            match records.get(&address) {
                Some(OverlayRecordV1::Present(EntityBundleV1::Note(note))) => Some(note.clone()),
                _ => existing.remove(note_id),
            }
        })
        .collect();
}

fn prune_voice_descendants(voice: &mut VoiceV1, states: &HashMap<StableId, OverlayEntityStateV1>) {
    voice.sequence.events.retain(|event| {
        entity_address_is_visible(
            &StableEntityAddressV1::Event {
                event_id: event.id.clone(),
            },
            states,
        )
    });
    for event in &mut voice.sequence.events {
        prune_event_descendants(event, states);
    }
}

fn prune_event_descendants(
    event: &mut RhythmicEventV1,
    states: &HashMap<StableId, OverlayEntityStateV1>,
) {
    if let brilliant_score_foundation::RhythmicContentV1::Notes { notes } = &mut event.content {
        notes.retain(|note| {
            entity_address_is_visible(
                &StableEntityAddressV1::Note {
                    note_id: note.id.clone(),
                },
                states,
            )
        });
    }
}

fn entity_address_is_visible(
    address: &StableEntityAddressV1,
    states: &HashMap<StableId, OverlayEntityStateV1>,
) -> bool {
    match states.get(address.stable_id()) {
        Some(OverlayEntityStateV1::Present(actual)) => actual == address,
        Some(OverlayEntityStateV1::Tombstone) => false,
        None => true,
    }
}

fn apply_staff_scalar_replacements(
    staff: &mut StaffDefinitionV1,
    replacements: &HashMap<ScalarAddressV1, ScalarValueV1>,
) {
    let address = ScalarAddressV1::StaffDefinition {
        staff_id: staff.id.clone(),
    };
    if let Some(ScalarValueV1::StaffDefinition {
        line_count,
        default_clef,
    }) = replacements.get(&address)
    {
        staff.line_count = *line_count;
        staff.default_clef = default_clef.clone();
    }
}

fn apply_voice_scalar_replacements(
    voice: &mut VoiceV1,
    replacements: &HashMap<ScalarAddressV1, ScalarValueV1>,
) {
    let address = ScalarAddressV1::VoiceSequenceStart {
        voice_id: voice.id.clone(),
    };
    if let Some(ScalarValueV1::VoiceSequenceStart(value)) = replacements.get(&address) {
        voice.sequence.start.clone_from(value);
    }
    for event in &mut voice.sequence.events {
        apply_event_scalar_replacements(event, replacements);
    }
}

fn apply_event_scalar_replacements(
    event: &mut RhythmicEventV1,
    replacements: &HashMap<ScalarAddressV1, ScalarValueV1>,
) {
    let address = ScalarAddressV1::EventNoteValue {
        event_id: event.id.clone(),
    };
    if let Some(ScalarValueV1::EventNoteValue(value)) = replacements.get(&address) {
        event.duration.clone_from(value);
    }
    if let brilliant_score_foundation::RhythmicContentV1::Notes { notes } = &mut event.content {
        for note in notes {
            apply_note_scalar_replacements(note, replacements);
        }
    }
}

fn apply_note_scalar_replacements(
    note: &mut ScoreNoteV1,
    replacements: &HashMap<ScalarAddressV1, ScalarValueV1>,
) {
    let address = ScalarAddressV1::NoteWrittenPitch {
        note_id: note.id.clone(),
    };
    if let Some(ScalarValueV1::NoteWrittenPitch(value)) = replacements.get(&address) {
        note.written_pitch.clone_from(value);
    }
}

fn clear_entity_scalar_replacements(
    replacements: &mut HashMap<ScalarAddressV1, ScalarValueV1>,
    address: &StableEntityAddressV1,
) {
    replacements.retain(|scalar, _| scalar_entity_address(scalar) != *address);
}

fn insertion_index(order: &[StableId], anchor: &StableAnchorV1) -> Result<usize, StableId> {
    match anchor {
        StableAnchorV1::Start => Ok(0),
        StableAnchorV1::After { sibling_id } => order
            .iter()
            .position(|id| id == sibling_id)
            .map(|index| index + 1)
            .ok_or_else(|| sibling_id.clone()),
    }
}

fn anchor_before(order: &[StableId], index: usize) -> StableAnchorV1 {
    if index == 0 {
        StableAnchorV1::Start
    } else {
        StableAnchorV1::After {
            sibling_id: order[index - 1].clone(),
        }
    }
}

fn same_unique_members(left: &[StableId], right: &[StableId]) -> bool {
    if left.len() != right.len() {
        return false;
    }
    let left: HashSet<&StableId> = left.iter().collect();
    let right: HashSet<&StableId> = right.iter().collect();
    left.len() == right.len() && left == right
}

// C2 intentionally remains disconnected from Session/Node until command
// routing lands. This retained compile-only contract keeps every private
// transaction shape type-checked in ordinary (non-test) builds meanwhile.
type Stage3OverlayShapeValuesV1 = (
    StableId,
    ScoreMetadataV1,
    MeasureBundleV1,
    PartBundleV1,
    StaffDefinitionV1,
    VoiceV1,
    RhythmicEventV1,
    ScoreNoteV1,
    ExtensionBlockV1,
);
type Stage3OverlayShapeFnV1 = fn(&dyn CoreBaseReadV1, Stage3OverlayShapeValuesV1);

fn stage3_overlay_shape_v1(base: &dyn CoreBaseReadV1, values: Stage3OverlayShapeValuesV1) {
    let (document_id, metadata, measure, part, staff, voice, event, note, extension) = values;
    let measure_id = measure.definition.id.clone();
    let part_id = part.part.id.clone();
    let staff_id = staff.id.clone();
    let voice_id = voice.id.clone();
    let event_id = event.id.clone();
    let note_id = note.id.clone();

    let owners = [
        StableOwnerAddressV1::Document {
            document_id: document_id.clone(),
        },
        StableOwnerAddressV1::Part {
            part_id: part_id.clone(),
        },
        StableOwnerAddressV1::PartMeasure {
            part_id: part_id.clone(),
            measure_id: measure_id.clone(),
        },
        StableOwnerAddressV1::Voice {
            voice_id: voice_id.clone(),
        },
        StableOwnerAddressV1::Event {
            event_id: event_id.clone(),
        },
    ];
    let orders = [
        StableOrderAddressV1::Measures {
            document_id: document_id.clone(),
        },
        StableOrderAddressV1::Parts {
            document_id: document_id.clone(),
        },
        StableOrderAddressV1::Staffs {
            part_id: part_id.clone(),
        },
        StableOrderAddressV1::MeasureContents {
            part_id: part_id.clone(),
        },
        StableOrderAddressV1::Voices {
            part_id: part_id.clone(),
            measure_id: measure_id.clone(),
        },
        StableOrderAddressV1::Events {
            voice_id: voice_id.clone(),
        },
        StableOrderAddressV1::Notes {
            event_id: event_id.clone(),
        },
        StableOrderAddressV1::Extensions {
            document_id: document_id.clone(),
        },
    ];
    let entities = [
        EntityBundleV1::Measure(measure.clone()),
        EntityBundleV1::Part(part.clone()),
        EntityBundleV1::Staff(staff.clone()),
        EntityBundleV1::Voice(voice.clone()),
        EntityBundleV1::Event(event.clone()),
        EntityBundleV1::Note(note.clone()),
    ];
    let scalars = [
        (
            ScalarAddressV1::DocumentMetadata {
                document_id: document_id.clone(),
            },
            ScalarValueV1::DocumentMetadata(metadata),
        ),
        (
            ScalarAddressV1::MeasureDefinition {
                measure_id: measure_id.clone(),
            },
            ScalarValueV1::MeasureDefinition {
                meter: measure.definition.meter.clone(),
                pickup_duration: measure.definition.pickup_duration.clone(),
            },
        ),
        (
            ScalarAddressV1::PartName {
                part_id: part_id.clone(),
            },
            ScalarValueV1::PartName(part.part.name.clone()),
        ),
        (
            ScalarAddressV1::PartInstrument {
                part_id: part_id.clone(),
            },
            ScalarValueV1::PartInstrument(part.part.instrument.clone()),
        ),
        (
            ScalarAddressV1::StaffDefinition {
                staff_id: staff_id.clone(),
            },
            ScalarValueV1::StaffDefinition {
                line_count: staff.line_count,
                default_clef: staff.default_clef.clone(),
            },
        ),
        (
            ScalarAddressV1::VoiceSequenceStart {
                voice_id: voice_id.clone(),
            },
            ScalarValueV1::VoiceSequenceStart(voice.sequence.start.clone()),
        ),
        (
            ScalarAddressV1::EventNoteValue {
                event_id: event_id.clone(),
            },
            ScalarValueV1::EventNoteValue(event.duration.clone()),
        ),
        (
            ScalarAddressV1::NoteWrittenPitch {
                note_id: note_id.clone(),
            },
            ScalarValueV1::NoteWrittenPitch(note.written_pitch.clone()),
        ),
    ];
    let references = [
        (
            ReferenceAddressV1::VoiceDefaultStaff {
                voice_id: voice_id.clone(),
            },
            ReferenceValueV1::StableId(staff_id.clone()),
        ),
        (
            ReferenceAddressV1::EventStaffAssignment {
                event_id: event_id.clone(),
            },
            ReferenceValueV1::OptionalStableId(Some(staff_id)),
        ),
        (
            ReferenceAddressV1::PartMeasureLink {
                part_id: part_id.clone(),
                measure_id: measure_id.clone(),
            },
            ReferenceValueV1::Present(true),
        ),
        (
            ReferenceAddressV1::ExtensionOwner {
                namespace: extension.namespace.clone(),
                owner: StableExtensionOwnerV1::Part {
                    part_id: part_id.clone(),
                },
            },
            ReferenceValueV1::ExtensionOwner(ExtensionOwnerV1::Part {
                part_id: part_id.clone(),
            }),
        ),
    ];

    let extension_key = ExtensionKeyV1::from_block(&extension);
    let mut overlay = TransactionOverlayV1::new(base);
    let segment = overlay.begin_segment();
    let _ = OVERLAY_LOOKUP_LAYER_COUNT_V1;
    let _ = overlay.metrics();
    let _ = overlay.operation_count();
    let _ = overlay.logical_bytes();
    let _ = overlay.read_entity(&entities[0].root_address());
    let _ = overlay.read_owner(&entities[0].root_address());
    let _ = overlay.read_order(&orders[0]);
    let _ = overlay.read_extension(&extension_key);
    let _ = overlay.read_voice_time(&voice_id);
    let _ = overlay.list_references_to(&part_id);
    for (address, value) in scalars {
        let _ = overlay.read_scalar(&address);
        let _ = overlay.replace_scalar(address, value);
    }
    for (address, value) in references {
        let _ = overlay.read_reference(&address);
        let _ = overlay.update_reference(address, value);
    }
    for entity in entities {
        let address = entity.root_address();
        let _ = overlay.insert_entity(
            owners[0].clone(),
            orders[0].clone(),
            StableAnchorV1::Start,
            address.clone(),
            entity,
        );
        let _ = overlay.remove_entity(owners[0].clone(), orders[0].clone(), address);
    }
    let _ =
        overlay.insert_ordered_child(orders[0].clone(), StableAnchorV1::Start, measure_id.clone());
    let _ = overlay.move_ordered_child(
        orders[0].clone(),
        measure_id.clone(),
        StableAnchorV1::After {
            sibling_id: part_id.clone(),
        },
    );
    let _ = overlay.remove_ordered_child(orders[0].clone(), measure_id.clone());
    let _ = overlay.replace_ordered_children(orders[0].clone(), vec![measure_id]);
    let _ = overlay.insert_extension(StableAnchorV1::Start, extension.clone());
    let _ = overlay.replace_extension(extension_key.clone(), extension);
    let _ = overlay.remove_extension(extension_key);
    let _ = overlay.replace_voice_time(voice_id, vec![event_id]);
    let _ = overlay.add_prepared_effects(1);
    let _ = overlay.record_affected(StableEntityAddressV1::Document { document_id });
    let _ = overlay.end_segment(segment);
    let _ = overlay.finish();
    let _ = (owners, orders);
}

#[used]
static STAGE3_OVERLAY_SHAPE_V1: Stage3OverlayShapeFnV1 = stage3_overlay_shape_v1;

#[cfg(test)]
mod tests {
    use std::collections::BTreeMap;

    use brilliant_core_types::{BoundedJsonValue, SafeInteger};
    use brilliant_score_foundation::{
        ClefSignV1, ClefV1, ExtensionOwnerV1, FractionV1, MusicSequenceV1, NoteValueV1,
        PitchStepV1, RhythmicContentV1, RhythmicEventV1, ScoreMetadataV1, ScoreNoteV1,
        StaffDefinitionV1, TempoV1, VoiceV1, WrittenPitchV1,
    };

    use super::*;

    #[derive(Clone, Debug, Default, Eq, PartialEq)]
    struct FakeBaseV1 {
        entities: HashMap<StableEntityAddressV1, EntityBundleV1>,
        owners: HashMap<StableEntityAddressV1, StableOwnerAddressV1>,
        scalars: HashMap<ScalarAddressV1, ScalarValueV1>,
        orders: HashMap<StableOrderAddressV1, Vec<StableId>>,
        extensions: HashMap<ExtensionKeyV1, AnchoredExtensionBlockV1>,
        references: HashMap<ReferenceAddressV1, ReferenceValueV1>,
        voice_times: HashMap<StableId, Vec<StableId>>,
    }

    impl CoreBaseReadV1 for FakeBaseV1 {
        fn resolve_entity(&self, stable_id: &StableId) -> Option<StableEntityAddressV1> {
            self.entities
                .keys()
                .find(|address| address.stable_id() == stable_id)
                .cloned()
                .or_else(|| {
                    self.scalars.keys().find_map(|scalar| {
                        let address = scalar_entity_address(scalar);
                        (address.stable_id() == stable_id).then_some(address)
                    })
                })
        }

        fn read_owner(&self, address: &StableEntityAddressV1) -> Option<StableOwnerAddressV1> {
            self.owners.get(address).cloned()
        }

        fn read_scalar(&self, address: &ScalarAddressV1) -> Option<ScalarValueV1> {
            self.scalars.get(address).cloned().or_else(|| {
                self.entities
                    .get(&scalar_entity_address(address))
                    .and_then(|entity| scalar_from_entity(entity, address))
            })
        }

        fn detach_entity(&self, address: &StableEntityAddressV1) -> Option<EntityBundleV1> {
            self.entities.get(address).cloned()
        }

        fn read_order(&self, address: &StableOrderAddressV1) -> Option<Vec<StableId>> {
            self.orders.get(address).cloned()
        }

        fn read_extension(&self, key: &ExtensionKeyV1) -> Option<AnchoredExtensionBlockV1> {
            self.extensions.get(key).cloned()
        }

        fn read_reference(&self, address: &ReferenceAddressV1) -> Option<ReferenceValueV1> {
            self.references.get(address).cloned()
        }

        fn list_references_to(&self, target_id: &StableId) -> Vec<ReferenceAddressV1> {
            self.references
                .iter()
                .filter(|(address, value)| reference_points_to(address, value, target_id))
                .map(|(address, _)| address.clone())
                .collect()
        }

        fn read_voice_time(&self, voice_id: &StableId) -> Option<Vec<StableId>> {
            self.voice_times.get(voice_id).cloned()
        }
    }

    fn id(value: &str) -> StableId {
        StableId::new(value).expect("stable id")
    }

    fn safe(value: i64) -> SafeInteger {
        SafeInteger::new(value).expect("safe integer")
    }

    fn metadata(title: &str) -> ScalarValueV1 {
        ScalarValueV1::DocumentMetadata(ScoreMetadataV1 {
            title: title.to_owned(),
            authors: vec!["Brilliant Guitar".to_owned()],
            tempo: TempoV1 {
                bpm: safe(120).into(),
            },
        })
    }

    fn note(note_id: &str, octave: i64) -> EntityBundleV1 {
        EntityBundleV1::Note(ScoreNoteV1 {
            id: id(note_id),
            written_pitch: WrittenPitchV1 {
                step: PitchStepV1::E,
                alter: safe(0),
                octave: safe(octave),
            },
        })
    }

    fn note_pitch(note_id: &str, octave: i64) -> (ScalarAddressV1, ScalarValueV1) {
        (
            ScalarAddressV1::NoteWrittenPitch {
                note_id: id(note_id),
            },
            ScalarValueV1::NoteWrittenPitch(WrittenPitchV1 {
                step: PitchStepV1::E,
                alter: safe(0),
                octave: safe(octave),
            }),
        )
    }

    fn voice_with_one_note() -> EntityBundleV1 {
        EntityBundleV1::Voice(VoiceV1 {
            id: id("voice"),
            default_staff_id: id("staff"),
            sequence: MusicSequenceV1 {
                start: FractionV1 {
                    numerator: safe(0),
                    denominator: safe(1),
                },
                events: vec![RhythmicEventV1 {
                    id: id("event"),
                    duration: NoteValueV1 {
                        base: safe(4),
                        dots: safe(0),
                        time_modification: None,
                    },
                    staff_id: None,
                    content: RhythmicContentV1::Notes {
                        notes: vec![match note("note", 4) {
                            EntityBundleV1::Note(note) => note,
                            _ => unreachable!("note fixture"),
                        }],
                    },
                }],
            },
        })
    }

    #[test]
    fn overlay_lookup_order_has_the_four_frozen_layers() {
        assert_eq!(OVERLAY_LOOKUP_LAYER_COUNT_V1, 4);
    }

    #[test]
    fn repeated_scalar_writes_read_overlay_and_drop_leaves_base_unchanged() {
        let document_id = id("score");
        let address = ScalarAddressV1::DocumentMetadata {
            document_id: document_id.clone(),
        };
        let mut base = FakeBaseV1::default();
        base.scalars.insert(address.clone(), metadata("base"));
        let original = base.clone();

        {
            let mut overlay = TransactionOverlayV1::new(&base);
            assert_eq!(
                overlay.replace_scalar(address.clone(), metadata("first")),
                Ok(OverlayMutationV1::Changed)
            );
            assert_eq!(
                overlay.replace_scalar(address.clone(), metadata("second")),
                Ok(OverlayMutationV1::Changed)
            );
            assert_eq!(overlay.read_scalar(&address), Some(metadata("second")));
            assert_eq!(overlay.operation_count(), 2);
            assert_eq!(overlay.metrics().order_copies, 0);
        }

        assert_eq!(base, original);
    }

    #[test]
    fn insert_then_edit_then_remove_uses_overlay_bundle_and_tombstone() {
        let event_id = id("event");
        let order = StableOrderAddressV1::Notes {
            event_id: event_id.clone(),
        };
        let mut base = FakeBaseV1::default();
        base.orders.insert(order.clone(), Vec::new());
        let address = StableEntityAddressV1::Note {
            note_id: id("note"),
        };
        let mut overlay = TransactionOverlayV1::new(&base);

        assert_eq!(
            overlay.insert_entity(
                StableOwnerAddressV1::Event { event_id },
                order.clone(),
                StableAnchorV1::Start,
                address.clone(),
                note("note", 4),
            ),
            Ok(OverlayMutationV1::Changed)
        );
        let (pitch_address, pitch) = note_pitch("note", 5);
        assert_eq!(
            overlay.replace_scalar(pitch_address, pitch),
            Ok(OverlayMutationV1::Changed)
        );
        assert_eq!(
            overlay.remove_entity(
                StableOwnerAddressV1::Event {
                    event_id: id("event"),
                },
                order.clone(),
                address.clone(),
            ),
            Ok(OverlayMutationV1::Changed)
        );
        assert_eq!(overlay.read_entity(&address), None);
        assert_eq!(overlay.read_order(&order), Some(Vec::new()));
        assert_eq!(overlay.operation_count(), 3);
        assert_eq!(overlay.metrics().order_copies, 1);
    }

    #[test]
    fn inserted_bundle_descendants_are_visible_and_parent_reads_prune_removed_children() {
        let root_order = StableOrderAddressV1::Voices {
            part_id: id("part"),
            measure_id: id("measure"),
        };
        let mut base = FakeBaseV1::default();
        base.orders.insert(root_order.clone(), Vec::new());
        let mut overlay = TransactionOverlayV1::new(&base);
        overlay
            .insert_entity(
                StableOwnerAddressV1::PartMeasure {
                    part_id: id("part"),
                    measure_id: id("measure"),
                },
                root_order,
                StableAnchorV1::Start,
                StableEntityAddressV1::Voice {
                    voice_id: id("voice"),
                },
                voice_with_one_note(),
            )
            .expect("insert voice bundle");

        assert!(
            overlay
                .read_entity(&StableEntityAddressV1::Event {
                    event_id: id("event"),
                })
                .is_some()
        );
        assert!(
            overlay
                .read_entity(&StableEntityAddressV1::Note {
                    note_id: id("note"),
                })
                .is_some()
        );
        assert_eq!(
            overlay.read_owner(&StableEntityAddressV1::Note {
                note_id: id("note"),
            }),
            Some(StableOwnerAddressV1::Event {
                event_id: id("event"),
            })
        );
        let (pitch_address, pitch) = note_pitch("note", 7);
        overlay
            .replace_scalar(pitch_address, pitch)
            .expect("edit nested note");
        let voice = overlay
            .read_entity(&StableEntityAddressV1::Voice {
                voice_id: id("voice"),
            })
            .expect("voice");
        assert!(matches!(
            voice,
            EntityBundleV1::Voice(VoiceV1 {
                sequence: MusicSequenceV1 { events, .. },
                ..
            }) if matches!(
                &events[0].content,
                RhythmicContentV1::Notes { notes }
                    if notes[0].written_pitch.octave == safe(7)
            )
        ));

        overlay
            .remove_entity(
                StableOwnerAddressV1::Event {
                    event_id: id("event"),
                },
                StableOrderAddressV1::Notes {
                    event_id: id("event"),
                },
                StableEntityAddressV1::Note {
                    note_id: id("note"),
                },
            )
            .expect("remove nested note");
        let voice = overlay
            .read_entity(&StableEntityAddressV1::Voice {
                voice_id: id("voice"),
            })
            .expect("voice after nested removal");
        assert!(matches!(
            voice,
            EntityBundleV1::Voice(VoiceV1 {
                sequence: MusicSequenceV1 { events, .. },
                ..
            }) if matches!(&events[0].content, RhythmicContentV1::Notes { notes } if notes.is_empty())
        ));
    }

    #[test]
    fn inserted_bundle_references_and_time_are_visible_projected_and_tombstoned() {
        let root_order = StableOrderAddressV1::Voices {
            part_id: id("part"),
            measure_id: id("measure"),
        };
        let voice_address = StableEntityAddressV1::Voice {
            voice_id: id("voice"),
        };
        let voice_reference = ReferenceAddressV1::VoiceDefaultStaff {
            voice_id: id("voice"),
        };
        let event_reference = ReferenceAddressV1::EventStaffAssignment {
            event_id: id("event"),
        };
        let mut base = FakeBaseV1::default();
        base.orders.insert(root_order.clone(), Vec::new());
        let mut overlay = TransactionOverlayV1::new(&base);

        overlay
            .insert_entity(
                StableOwnerAddressV1::PartMeasure {
                    part_id: id("part"),
                    measure_id: id("measure"),
                },
                root_order.clone(),
                StableAnchorV1::Start,
                voice_address.clone(),
                voice_with_one_note(),
            )
            .expect("insert voice bundle");

        assert_eq!(
            overlay.read_reference(&voice_reference),
            Some(ReferenceValueV1::StableId(id("staff")))
        );
        assert_eq!(
            overlay.read_reference(&event_reference),
            Some(ReferenceValueV1::OptionalStableId(None))
        );
        assert_eq!(
            overlay.read_voice_time(&id("voice")),
            Some(vec![id("event")])
        );

        overlay
            .update_reference(
                voice_reference.clone(),
                ReferenceValueV1::StableId(id("staff-2")),
            )
            .expect("update inserted voice reference");
        let voice = overlay
            .read_entity(&voice_address)
            .expect("projected inserted voice");
        assert!(matches!(
            voice,
            EntityBundleV1::Voice(VoiceV1 { default_staff_id, .. })
                if default_staff_id == id("staff-2")
        ));

        overlay
            .remove_entity(
                StableOwnerAddressV1::PartMeasure {
                    part_id: id("part"),
                    measure_id: id("measure"),
                },
                root_order,
                voice_address,
            )
            .expect("remove projected voice bundle");

        assert_eq!(overlay.read_reference(&voice_reference), None);
        assert_eq!(overlay.read_reference(&event_reference), None);
        assert_eq!(overlay.read_voice_time(&id("voice")), None);
        assert!(overlay.list_references_to(&id("staff-2")).is_empty());
    }

    #[test]
    fn inserted_child_is_projected_into_parent_bundle_before_parent_removal() {
        let event_address = StableEntityAddressV1::Event {
            event_id: id("event"),
        };
        let note_address = StableEntityAddressV1::Note {
            note_id: id("note-a"),
        };
        let note_a = match note("note-a", 4) {
            EntityBundleV1::Note(note) => note,
            _ => unreachable!("note fixture"),
        };
        let event = EntityBundleV1::Event(RhythmicEventV1 {
            id: id("event"),
            duration: NoteValueV1 {
                base: safe(4),
                dots: safe(0),
                time_modification: None,
            },
            staff_id: None,
            content: RhythmicContentV1::Notes {
                notes: vec![note_a.clone()],
            },
        });
        let note_order = StableOrderAddressV1::Notes {
            event_id: id("event"),
        };
        let event_order = StableOrderAddressV1::Events {
            voice_id: id("voice"),
        };
        let mut base = FakeBaseV1::default();
        base.entities.insert(event_address.clone(), event);
        base.owners.insert(
            event_address.clone(),
            StableOwnerAddressV1::Voice {
                voice_id: id("voice"),
            },
        );
        base.entities
            .insert(note_address, EntityBundleV1::Note(note_a));
        base.orders.insert(note_order.clone(), vec![id("note-a")]);
        base.orders.insert(event_order.clone(), vec![id("event")]);
        let mut overlay = TransactionOverlayV1::new(&base);

        overlay
            .insert_entity(
                StableOwnerAddressV1::Event {
                    event_id: id("event"),
                },
                note_order,
                StableAnchorV1::After {
                    sibling_id: id("note-a"),
                },
                StableEntityAddressV1::Note {
                    note_id: id("note-b"),
                },
                note("note-b", 5),
            )
            .expect("insert child note");
        let projected = overlay
            .read_entity(&event_address)
            .expect("projected event");
        assert!(matches!(
            projected,
            EntityBundleV1::Event(RhythmicEventV1 {
                content: RhythmicContentV1::Notes { notes },
                ..
            }) if notes.iter().map(|note| note.id.as_str()).collect::<Vec<_>>() == ["note-a", "note-b"]
        ));

        overlay
            .remove_entity(
                StableOwnerAddressV1::Voice {
                    voice_id: id("voice"),
                },
                event_order,
                event_address,
            )
            .expect("remove projected parent");
        assert!(
            overlay
                .read_entity(&StableEntityAddressV1::Note {
                    note_id: id("note-b"),
                })
                .is_none()
        );
    }

    #[test]
    fn order_is_copied_once_and_moves_resolve_against_the_overlay() {
        let order = StableOrderAddressV1::Events {
            voice_id: id("voice"),
        };
        let mut base = FakeBaseV1::default();
        base.orders.insert(
            order.clone(),
            vec![id("event-a"), id("event-b"), id("event-c")],
        );
        let mut overlay = TransactionOverlayV1::new(&base);

        assert_eq!(
            overlay.move_ordered_child(order.clone(), id("event-c"), StableAnchorV1::Start,),
            Ok(OverlayMutationV1::Changed)
        );
        assert_eq!(
            overlay.move_ordered_child(
                order.clone(),
                id("event-b"),
                StableAnchorV1::After {
                    sibling_id: id("event-c"),
                },
            ),
            Ok(OverlayMutationV1::Changed)
        );
        assert_eq!(
            overlay.read_order(&order),
            Some(vec![id("event-c"), id("event-b"), id("event-a")])
        );
        assert_eq!(overlay.metrics().order_copies, 1);
    }

    #[test]
    fn order_no_ops_do_not_retain_a_copy_or_append_changes() {
        let order = StableOrderAddressV1::Events {
            voice_id: id("voice"),
        };
        let original = vec![id("event-a"), id("event-b")];
        let mut base = FakeBaseV1::default();
        base.orders.insert(order.clone(), original.clone());
        let mut overlay = TransactionOverlayV1::new(&base);

        assert_eq!(
            overlay.move_ordered_child(
                order.clone(),
                id("event-b"),
                StableAnchorV1::After {
                    sibling_id: id("event-a"),
                },
            ),
            Ok(OverlayMutationV1::NoOp)
        );
        assert_eq!(
            overlay.replace_ordered_children(order, original),
            Ok(OverlayMutationV1::NoOp)
        );
        assert_eq!(overlay.operation_count(), 0);
        assert_eq!(overlay.metrics().order_copies, 0);
    }

    #[test]
    fn remove_insert_replace_order_and_replace_remove_extension_cover_typed_ops() {
        let order = StableOrderAddressV1::Events {
            voice_id: id("voice"),
        };
        let extension = ExtensionBlockV1 {
            namespace: "tab".to_owned(),
            schema_version: safe(1),
            owner: ExtensionOwnerV1::Score,
            payload: BTreeMap::new(),
        };
        let key = ExtensionKeyV1::from_block(&extension);
        let mut base = FakeBaseV1::default();
        base.orders.insert(
            order.clone(),
            vec![id("event-a"), id("event-b"), id("event-c")],
        );
        base.extensions.insert(
            key.clone(),
            AnchoredExtensionBlockV1 {
                anchor: StableAnchorV1::Start,
                value: extension,
            },
        );
        let mut overlay = TransactionOverlayV1::new(&base);

        overlay
            .remove_ordered_child(order.clone(), id("event-b"))
            .expect("remove child");
        overlay
            .insert_ordered_child(
                order.clone(),
                StableAnchorV1::After {
                    sibling_id: id("event-c"),
                },
                id("event-b"),
            )
            .expect("insert child");
        overlay
            .replace_ordered_children(
                order.clone(),
                vec![id("event-b"), id("event-c"), id("event-a")],
            )
            .expect("replace order");

        let mut replacement = base.extensions[&key].value.clone();
        replacement.schema_version = safe(2);
        replacement
            .payload
            .insert("enabled".to_owned(), BoundedJsonValue::Bool(true));
        overlay
            .replace_extension(key.clone(), replacement.clone())
            .expect("replace extension");
        assert_eq!(
            overlay.read_extension(&key).map(|value| value.value),
            Some(replacement)
        );
        overlay
            .remove_extension(key.clone())
            .expect("remove extension");

        assert_eq!(
            overlay.read_order(&order),
            Some(vec![id("event-b"), id("event-c"), id("event-a")])
        );
        assert_eq!(overlay.read_extension(&key), None);
        assert_eq!(overlay.metrics().order_copies, 1);
        assert!(overlay.logical_bytes() > 0);
        assert_eq!(overlay.operation_count(), 5);
    }

    #[test]
    fn global_stable_id_collision_is_rejected_even_when_entity_kinds_differ() {
        let existing = StableEntityAddressV1::Note {
            note_id: id("shared-id"),
        };
        let mut base = FakeBaseV1::default();
        base.entities.insert(existing, note("shared-id", 4));
        let order = StableOrderAddressV1::Staffs {
            part_id: id("part"),
        };
        base.orders.insert(order.clone(), Vec::new());
        let address = StableEntityAddressV1::Staff {
            staff_id: id("shared-id"),
        };
        let staff = EntityBundleV1::Staff(StaffDefinitionV1 {
            id: id("shared-id"),
            line_count: safe(5),
            default_clef: ClefV1 {
                sign: ClefSignV1::G,
                line: safe(2),
            },
        });
        let mut overlay = TransactionOverlayV1::new(&base);

        assert_eq!(
            overlay.insert_entity(
                StableOwnerAddressV1::Part {
                    part_id: id("part"),
                },
                order,
                StableAnchorV1::Start,
                address.clone(),
                staff,
            ),
            Err(OverlayFailureV1::DuplicateEntity { address })
        );
    }

    #[test]
    fn extension_reference_time_and_segments_are_overlay_visible() {
        let extension = ExtensionBlockV1 {
            namespace: "tab".to_owned(),
            schema_version: safe(1),
            owner: ExtensionOwnerV1::Score,
            payload: BTreeMap::new(),
        };
        let key = ExtensionKeyV1::from_block(&extension);
        let reference = ReferenceAddressV1::EventStaffAssignment {
            event_id: id("event"),
        };
        let mut base = FakeBaseV1::default();
        base.references
            .insert(reference.clone(), ReferenceValueV1::OptionalStableId(None));
        base.voice_times.insert(id("voice"), vec![id("event")]);
        let mut overlay = TransactionOverlayV1::new(&base);
        let segment = overlay.begin_segment();

        assert_eq!(
            overlay.insert_extension(StableAnchorV1::Start, extension.clone()),
            Ok(OverlayMutationV1::Changed)
        );
        assert_eq!(
            overlay.update_reference(
                reference.clone(),
                ReferenceValueV1::OptionalStableId(Some(id("staff"))),
            ),
            Ok(OverlayMutationV1::Changed)
        );
        assert_eq!(
            overlay.replace_voice_time(id("voice"), vec![id("event-2")]),
            Ok(OverlayMutationV1::Changed)
        );
        overlay.add_prepared_effects(3).expect("effects");
        overlay.end_segment(segment).expect("segment");

        assert_eq!(
            overlay.read_extension(&key),
            Some(AnchoredExtensionBlockV1 {
                anchor: StableAnchorV1::Start,
                value: extension,
            })
        );
        assert_eq!(
            overlay.read_reference(&reference),
            Some(ReferenceValueV1::OptionalStableId(Some(id("staff"))))
        );
        assert_eq!(overlay.list_references_to(&id("staff")), vec![reference]);
        assert_eq!(
            overlay.read_voice_time(&id("voice")),
            Some(vec![id("event-2")])
        );
        assert_eq!(overlay.metrics().time_index_copies, 1);
        let changes = overlay.finish().expect("changes");
        assert_eq!(changes.forward.len(), 2);
        assert_eq!(changes.inverse.len(), 2);
        assert_eq!(changes.prepared_effect_count, 3);
        assert_eq!(changes.segments.len(), 1);
    }

    #[test]
    fn invalid_anchor_poison_discards_the_entire_transaction() {
        let order = StableOrderAddressV1::Events {
            voice_id: id("voice"),
        };
        let mut base = FakeBaseV1::default();
        base.orders.insert(order.clone(), vec![id("event")]);
        let mut overlay = TransactionOverlayV1::new(&base);

        assert_eq!(
            overlay.insert_ordered_child(
                order,
                StableAnchorV1::After {
                    sibling_id: id("missing"),
                },
                id("event-2"),
            ),
            Err(OverlayFailureV1::AnchorNotFound {
                order: StableOrderAddressV1::Events {
                    voice_id: id("voice"),
                },
                sibling_id: id("missing"),
            })
        );
        assert_eq!(
            overlay.add_prepared_effects(1),
            Err(OverlayFailureV1::TransactionPoisoned)
        );
        assert_eq!(overlay.finish(), Err(OverlayFailureV1::TransactionPoisoned));
    }

    #[test]
    fn entity_removal_rejects_a_different_stable_owner() {
        let address = StableEntityAddressV1::Note {
            note_id: id("note"),
        };
        let actual_owner = StableOwnerAddressV1::Event {
            event_id: id("event-a"),
        };
        let supplied_owner = StableOwnerAddressV1::Event {
            event_id: id("event-b"),
        };
        let mut base = FakeBaseV1::default();
        base.entities.insert(address.clone(), note("note", 4));
        base.owners.insert(address.clone(), actual_owner.clone());
        let mut overlay = TransactionOverlayV1::new(&base);

        assert_eq!(
            overlay.remove_entity(
                supplied_owner.clone(),
                StableOrderAddressV1::Notes {
                    event_id: id("event-b"),
                },
                address.clone(),
            ),
            Err(OverlayFailureV1::OwnerMismatch {
                address,
                expected: Box::new(supplied_owner),
                actual: Box::new(actual_owner),
            })
        );
        assert_eq!(overlay.finish(), Err(OverlayFailureV1::TransactionPoisoned));
    }

    #[test]
    fn reference_updates_reject_values_from_a_different_reference_kind() {
        let address = ReferenceAddressV1::EventStaffAssignment {
            event_id: id("event"),
        };
        let base = FakeBaseV1::default();
        let mut overlay = TransactionOverlayV1::new(&base);

        assert_eq!(
            overlay.update_reference(address.clone(), ReferenceValueV1::StableId(id("staff"))),
            Err(OverlayFailureV1::ReferenceTypeMismatch { address })
        );
        assert_eq!(overlay.finish(), Err(OverlayFailureV1::TransactionPoisoned));
    }

    #[test]
    fn scalar_replacement_is_applied_to_a_detached_entity_before_remove() {
        let address = StableEntityAddressV1::Note {
            note_id: id("note"),
        };
        let order = StableOrderAddressV1::Notes {
            event_id: id("event"),
        };
        let mut base = FakeBaseV1::default();
        base.entities.insert(address.clone(), note("note", 4));
        base.owners.insert(
            address.clone(),
            StableOwnerAddressV1::Event {
                event_id: id("event"),
            },
        );
        base.orders.insert(order.clone(), vec![id("note")]);
        let mut overlay = TransactionOverlayV1::new(&base);
        let (pitch_address, pitch) = note_pitch("note", 6);

        overlay
            .replace_scalar(pitch_address, pitch)
            .expect("replace");
        let current = overlay.read_entity(&address).expect("current note");
        assert!(matches!(
            current,
            EntityBundleV1::Note(ScoreNoteV1 {
                written_pitch: WrittenPitchV1 { octave, .. },
                ..
            }) if octave == safe(6)
        ));
        overlay
            .remove_entity(
                StableOwnerAddressV1::Event {
                    event_id: id("event"),
                },
                order,
                address,
            )
            .expect("remove");
        let changes = overlay.finish().expect("changes");
        let remove = changes.forward.last().expect("remove op");
        let crate::change_set::ChangeOpV1::RemoveEntity { expected, .. } = remove else {
            panic!("expected remove entity");
        };
        assert!(matches!(
            changes.arena.entity(*expected),
            Some(EntityBundleV1::Note(ScoreNoteV1 {
                written_pitch: WrittenPitchV1 { octave, .. },
                ..
            })) if *octave == safe(6)
        ));
    }
}
