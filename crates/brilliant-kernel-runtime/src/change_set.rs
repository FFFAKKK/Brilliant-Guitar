use brilliant_core_types::JsString;
use std::collections::HashSet;

use brilliant_core_types::{JSON_PROPERTY_LIMIT, LosslessJsonValue as BoundedJsonValue, StableId};
use brilliant_kernel_contracts::REQUEST_BYTE_LIMIT;
use brilliant_score_foundation::{
    ClefV1, ExtensionBlockV1, ExtensionOwnerV1, FractionV1, InstrumentDescriptorV1,
    MeasureDefinitionV1, MeterV1, NoteValueV1, PartV1, RhythmicContentV1, RhythmicEventV1,
    ScoreMetadataV1, ScoreNoteV1, StaffDefinitionV1, VoiceV1, WrittenPitchV1,
};

pub(crate) const CHANGE_OPERATION_KIND_COUNT_V1: usize = 11;
pub(crate) const MAX_CHANGESET_LOGICAL_BYTES_V1: u64 = 268_435_456;
pub(crate) const MAX_PREPARED_EFFECTS_V1: u64 = 131_072;
pub(crate) const MAX_AFFECTED_ADDRESSES_V1: u64 = 131_072;

const ARENA_ENTRY_WEIGHT: u64 = 16;
const SCALAR_VALUE_WEIGHT: u64 = 16;
const CHANGE_OPERATION_WEIGHT: u64 = 64;
const ORDERED_CHILD_WEIGHT: u64 = 16;
const REFERENCE_DELTA_WEIGHT: u64 = 32;
const AFFECTED_ADDRESS_WEIGHT: u64 = 32;
const BATCH_SEGMENT_WEIGHT: u64 = 32;
const MAX_BATCH_CHILDREN_V1: u64 = 100;
const MAX_NET_FIXED_OVERHEAD_PER_WIRE_NODE_V1: u64 = 30;
const MAX_STRUCTURAL_BYTES_PER_PREPARED_EFFECT_V1: u64 = 256;

pub(crate) mod accounting;
use accounting::{ChangeSetAccountingV1, RawEntityNodeV1, node_fixed_bytes};

/// Conservative compatibility envelope for two accepted 64 MiB wire values.
///
/// Exact string/JSON payload bytes are bounded by the create plus command byte
/// limits. Every retained JSON node can contribute at most one 32-byte fixed
/// slot. Except for the root, even the shortest node consumes its byte plus a
/// collection separator, so a conservative net allowance is 30 bytes per
/// node, plus one byte for each of the two roots. The per-effect allowance independently covers two op headers, two
/// arena headers, two ordered-child entries, and two reference entries;
/// affected addresses are bounded and charged separately.
pub(crate) fn accepted_wire_logical_upper_bound_v1() -> Option<u64> {
    let wire_payload = (REQUEST_BYTE_LIMIT as u64).checked_mul(2)?;
    let wire_properties = (JSON_PROPERTY_LIMIT as u64).checked_mul(2)?;
    let property_overhead = wire_properties
        .checked_mul(MAX_NET_FIXED_OVERHEAD_PER_WIRE_NODE_V1)?
        .checked_add(2)?;
    let effect_overhead =
        MAX_PREPARED_EFFECTS_V1.checked_mul(MAX_STRUCTURAL_BYTES_PER_PREPARED_EFFECT_V1)?;
    let affected_overhead = MAX_AFFECTED_ADDRESSES_V1.checked_mul(AFFECTED_ADDRESS_WEIGHT)?;
    let segment_overhead = MAX_BATCH_CHILDREN_V1.checked_mul(BATCH_SEGMENT_WEIGHT)?;
    wire_payload
        .checked_add(property_overhead)?
        .checked_add(effect_overhead)?
        .checked_add(affected_overhead)?
        .checked_add(segment_overhead)
}

#[derive(Clone, Debug, Eq, Hash, PartialEq)]
pub(crate) enum StableEntityAddressV1 {
    Document { document_id: StableId },
    Measure { measure_id: StableId },
    Part { part_id: StableId },
    Staff { staff_id: StableId },
    Voice { voice_id: StableId },
    Event { event_id: StableId },
    Note { note_id: StableId },
}

impl StableEntityAddressV1 {
    pub(crate) fn stable_id(&self) -> &StableId {
        match self {
            Self::Document { document_id } => document_id,
            Self::Measure { measure_id } => measure_id,
            Self::Part { part_id } => part_id,
            Self::Staff { staff_id } => staff_id,
            Self::Voice { voice_id } => voice_id,
            Self::Event { event_id } => event_id,
            Self::Note { note_id } => note_id,
        }
    }
}

#[derive(Clone, Debug, Eq, Hash, PartialEq)]
pub(crate) enum StableOwnerAddressV1 {
    Document {
        document_id: StableId,
    },
    Part {
        part_id: StableId,
    },
    PartMeasure {
        part_id: StableId,
        measure_id: StableId,
    },
    Voice {
        voice_id: StableId,
    },
    Event {
        event_id: StableId,
    },
}

#[derive(Clone, Debug, Eq, Hash, PartialEq)]
pub(crate) enum StableOrderAddressV1 {
    Measures {
        document_id: StableId,
    },
    Parts {
        document_id: StableId,
    },
    Staffs {
        part_id: StableId,
    },
    MeasureContents {
        part_id: StableId,
    },
    Voices {
        part_id: StableId,
        measure_id: StableId,
    },
    Events {
        voice_id: StableId,
    },
    Notes {
        event_id: StableId,
    },
    Extensions {
        document_id: StableId,
    },
}

#[derive(Clone, Debug, Eq, Hash, PartialEq)]
pub(crate) enum StableAnchorV1 {
    Start,
    After { sibling_id: StableId },
}

#[derive(Clone, Debug, Eq, Hash, PartialEq)]
pub(crate) enum ScalarAddressV1 {
    DocumentMetadata { document_id: StableId },
    MeasureDefinition { measure_id: StableId },
    PartName { part_id: StableId },
    PartInstrument { part_id: StableId },
    StaffDefinition { staff_id: StableId },
    VoiceSequenceStart { voice_id: StableId },
    EventNoteValue { event_id: StableId },
    NoteWrittenPitch { note_id: StableId },
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) enum ScalarValueV1 {
    DocumentMetadata(ScoreMetadataV1),
    MeasureDefinition {
        meter: MeterV1,
        pickup_duration: Option<FractionV1>,
    },
    PartName(JsString),
    PartInstrument(InstrumentDescriptorV1),
    StaffDefinition {
        line_count: brilliant_core_types::SafeInteger,
        default_clef: ClefV1,
    },
    VoiceSequenceStart(FractionV1),
    EventNoteValue(NoteValueV1),
    NoteWrittenPitch(WrittenPitchV1),
}

#[derive(Clone, Debug, Eq, Hash, PartialEq)]
pub(crate) enum StableExtensionOwnerV1 {
    Score,
    Part { part_id: StableId },
}

impl From<&ExtensionOwnerV1> for StableExtensionOwnerV1 {
    fn from(value: &ExtensionOwnerV1) -> Self {
        match value {
            ExtensionOwnerV1::Score => Self::Score,
            ExtensionOwnerV1::Part { part_id } => Self::Part {
                part_id: part_id.clone(),
            },
        }
    }
}

#[derive(Clone, Debug, Eq, Hash, PartialEq)]
pub(crate) enum ReferenceAddressV1 {
    VoiceDefaultStaff {
        voice_id: StableId,
    },
    EventStaffAssignment {
        event_id: StableId,
    },
    PartMeasureLink {
        part_id: StableId,
        measure_id: StableId,
    },
    ExtensionOwner {
        namespace: JsString,
        owner: StableExtensionOwnerV1,
    },
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) enum ReferenceValueV1 {
    StableId(StableId),
    OptionalStableId(Option<StableId>),
    Present(bool),
    ExtensionOwner(ExtensionOwnerV1),
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct AnchoredExtensionBlockV1 {
    pub(crate) anchor: StableAnchorV1,
    pub(crate) value: ExtensionBlockV1,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct MeasurePartContentBundleV1 {
    pub(crate) part_id: StableId,
    pub(crate) voices: Vec<VoiceV1>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct MeasureBundleV1 {
    pub(crate) definition: MeasureDefinitionV1,
    pub(crate) contents: Vec<MeasurePartContentBundleV1>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct PartBundleV1 {
    pub(crate) part: PartV1,
    pub(crate) extensions: Vec<AnchoredExtensionBlockV1>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) enum EntityBundleV1 {
    Measure(MeasureBundleV1),
    Part(PartBundleV1),
    Staff(StaffDefinitionV1),
    Voice(VoiceV1),
    Event(RhythmicEventV1),
    Note(ScoreNoteV1),
}

impl EntityBundleV1 {
    pub(crate) fn root_address(&self) -> StableEntityAddressV1 {
        match self {
            Self::Measure(bundle) => StableEntityAddressV1::Measure {
                measure_id: bundle.definition.id.clone(),
            },
            Self::Part(bundle) => StableEntityAddressV1::Part {
                part_id: bundle.part.id.clone(),
            },
            Self::Staff(staff) => StableEntityAddressV1::Staff {
                staff_id: staff.id.clone(),
            },
            Self::Voice(voice) => StableEntityAddressV1::Voice {
                voice_id: voice.id.clone(),
            },
            Self::Event(event) => StableEntityAddressV1::Event {
                event_id: event.id.clone(),
            },
            Self::Note(note) => StableEntityAddressV1::Note {
                note_id: note.id.clone(),
            },
        }
    }
}

macro_rules! arena_reference {
    ($name:ident) => {
        #[derive(Clone, Copy, Debug, Eq, PartialEq)]
        pub(crate) struct $name(u32);
    };
}

arena_reference!(ScalarValueRefV1);
arena_reference!(EntityBundleRefV1);
arena_reference!(OrderValueRefV1);
arena_reference!(ExtensionValueRefV1);
arena_reference!(ReferenceValueRefV1);

#[derive(Clone, Debug, Eq, PartialEq)]
enum ArenaValueV1 {
    Scalar(ScalarValueV1),
    Entity(EntityBundleV1),
    Order(Vec<StableId>),
    Extension(ExtensionBlockV1),
    Reference(ReferenceValueV1),
}

#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub(crate) struct ChangeArenaV1 {
    values: Vec<ArenaValueV1>,
}

impl ChangeArenaV1 {
    fn push(&mut self, value: ArenaValueV1) -> Result<u32, ChangeSetBuildFailureV1> {
        let index = u32::try_from(self.values.len())
            .map_err(|_| ChangeSetBuildFailureV1::ArenaIndexOverflow)?;
        self.values.push(value);
        Ok(index)
    }

    pub(crate) fn scalar(&self, reference: ScalarValueRefV1) -> Option<&ScalarValueV1> {
        match self.values.get(reference.0 as usize) {
            Some(ArenaValueV1::Scalar(value)) => Some(value),
            _ => None,
        }
    }

    pub(crate) fn entity(&self, reference: EntityBundleRefV1) -> Option<&EntityBundleV1> {
        match self.values.get(reference.0 as usize) {
            Some(ArenaValueV1::Entity(value)) => Some(value),
            _ => None,
        }
    }

    pub(crate) fn order(&self, reference: OrderValueRefV1) -> Option<&[StableId]> {
        match self.values.get(reference.0 as usize) {
            Some(ArenaValueV1::Order(value)) => Some(value),
            _ => None,
        }
    }

    pub(crate) fn extension(&self, reference: ExtensionValueRefV1) -> Option<&ExtensionBlockV1> {
        match self.values.get(reference.0 as usize) {
            Some(ArenaValueV1::Extension(value)) => Some(value),
            _ => None,
        }
    }

    pub(crate) fn reference(&self, reference: ReferenceValueRefV1) -> Option<&ReferenceValueV1> {
        match self.values.get(reference.0 as usize) {
            Some(ArenaValueV1::Reference(value)) => Some(value),
            _ => None,
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) enum ChangeOpV1 {
    ReplaceScalar {
        address: ScalarAddressV1,
        expected: ScalarValueRefV1,
        value: ScalarValueRefV1,
    },
    InsertEntity {
        owner: StableOwnerAddressV1,
        order: StableOrderAddressV1,
        anchor: StableAnchorV1,
        entity: EntityBundleRefV1,
    },
    RemoveEntity {
        owner: StableOwnerAddressV1,
        order: StableOrderAddressV1,
        expected_anchor: StableAnchorV1,
        expected: EntityBundleRefV1,
    },
    InsertOrderedChild {
        order: StableOrderAddressV1,
        anchor: StableAnchorV1,
        child_id: StableId,
    },
    RemoveOrderedChild {
        order: StableOrderAddressV1,
        expected_anchor: StableAnchorV1,
        child_id: StableId,
    },
    MoveOrderedChild {
        order: StableOrderAddressV1,
        child_id: StableId,
        expected_anchor: StableAnchorV1,
        anchor: StableAnchorV1,
    },
    ReplaceOrderedChildren {
        order: StableOrderAddressV1,
        expected: OrderValueRefV1,
        value: OrderValueRefV1,
    },
    InsertExtensionBlock {
        anchor: StableAnchorV1,
        value: ExtensionValueRefV1,
    },
    ReplaceExtensionBlock {
        namespace: JsString,
        owner: StableExtensionOwnerV1,
        expected: ExtensionValueRefV1,
        value: ExtensionValueRefV1,
    },
    RemoveExtensionBlock {
        expected_anchor: StableAnchorV1,
        expected: ExtensionValueRefV1,
    },
    UpdateReference {
        address: ReferenceAddressV1,
        expected: ReferenceValueRefV1,
        value: ReferenceValueRefV1,
    },
}

impl ChangeOpV1 {
    pub(crate) const fn kind_name(&self) -> &'static str {
        match self {
            Self::ReplaceScalar { .. } => "replace-scalar",
            Self::InsertEntity { .. } => "insert-entity",
            Self::RemoveEntity { .. } => "remove-entity",
            Self::InsertOrderedChild { .. } => "insert-ordered-child",
            Self::RemoveOrderedChild { .. } => "remove-ordered-child",
            Self::MoveOrderedChild { .. } => "move-ordered-child",
            Self::ReplaceOrderedChildren { .. } => "replace-ordered-children",
            Self::InsertExtensionBlock { .. } => "insert-extension-block",
            Self::ReplaceExtensionBlock { .. } => "replace-extension-block",
            Self::RemoveExtensionBlock { .. } => "remove-extension-block",
            Self::UpdateReference { .. } => "update-reference",
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) struct BatchSegmentV1 {
    pub(crate) forward_start: usize,
    pub(crate) forward_end: usize,
    pub(crate) inverse_start: usize,
    pub(crate) inverse_end: usize,
    pub(crate) affected_start: usize,
    pub(crate) affected_end: usize,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) struct OpenBatchSegmentV1 {
    forward_start: usize,
    inverse_start: usize,
    affected_start: usize,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum ChangeSetBuildFailureV1 {
    LogicalBytesExceeded { limit: u64, actual: u64 },
    PreparedEffectsExceeded { limit: u64, actual: u64 },
    AffectedAddressesExceeded { limit: u64, actual: u64 },
    ArenaIndexOverflow,
}

#[derive(Debug)]
struct LogicalBudgetV1 {
    limit: u64,
    logical_bytes: u64,
    interned_strings: HashSet<JsString>,
}

impl Default for LogicalBudgetV1 {
    fn default() -> Self {
        debug_assert!(
            accepted_wire_logical_upper_bound_v1()
                .is_some_and(|bound| bound <= MAX_CHANGESET_LOGICAL_BYTES_V1)
        );
        Self {
            limit: MAX_CHANGESET_LOGICAL_BYTES_V1,
            logical_bytes: 0,
            interned_strings: HashSet::new(),
        }
    }
}

impl LogicalBudgetV1 {
    fn charge(&mut self, amount: u64) -> Result<(), ChangeSetBuildFailureV1> {
        let Some(actual) = self.logical_bytes.checked_add(amount) else {
            return Err(ChangeSetBuildFailureV1::LogicalBytesExceeded {
                limit: self.limit,
                actual: u64::MAX,
            });
        };
        if actual > self.limit {
            return Err(ChangeSetBuildFailureV1::LogicalBytesExceeded {
                limit: self.limit,
                actual,
            });
        }
        self.logical_bytes = actual;
        Ok(())
    }

    fn intern(&mut self, value: &JsString) -> Result<(), ChangeSetBuildFailureV1> {
        if self.interned_strings.contains(value) {
            return Ok(());
        }
        self.interned_strings
            .try_reserve(1)
            .map_err(|_| ChangeSetBuildFailureV1::ArenaIndexOverflow)?;
        self.charge(value.utf8_byte_len() as u64)?;
        self.interned_strings.insert(value.to_owned());
        Ok(())
    }
}

#[derive(Debug, Default)]
pub(crate) struct ChangeSetBuilderV1 {
    arena: ChangeArenaV1,
    forward: Vec<ChangeOpV1>,
    inverse_in_forward_order: Vec<ChangeOpV1>,
    affected_order: Vec<StableEntityAddressV1>,
    segments: Vec<BatchSegmentV1>,
    accounting: ChangeSetAccountingV1,
    frozen_accounting: Option<(u64, u64)>,
}

impl ChangeSetBuilderV1 {
    fn ensure_accounting_active(&self) -> Result<(), ChangeSetBuildFailureV1> {
        if self.frozen_accounting.is_some() {
            return Err(ChangeSetBuildFailureV1::ArenaIndexOverflow);
        }
        Ok(())
    }

    pub(crate) fn begin_deferred_segment(&mut self) -> Result<(), ChangeSetBuildFailureV1> {
        self.ensure_accounting_active()?;
        self.accounting.begin_deferred_segment()
    }

    pub(crate) fn end_deferred_segment(&mut self) -> Result<(), ChangeSetBuildFailureV1> {
        self.ensure_accounting_active()?;
        self.accounting.end_deferred_segment()
    }

    /// Promotion freezes all typed writes, while the overlay can still serve
    /// borrowed reads and finish the retained prefix with its original summary.
    pub(crate) fn take_accounting(
        &mut self,
    ) -> Result<ChangeSetAccountingV1, ChangeSetBuildFailureV1> {
        self.ensure_accounting_active()?;
        self.frozen_accounting = Some((
            self.accounting.logical_bytes(),
            self.accounting.prepared_effect_count(),
        ));
        Ok(std::mem::take(&mut self.accounting))
    }
    pub(crate) fn borrowed_operations(&self) -> (&ChangeArenaV1, &[ChangeOpV1]) {
        (&self.arena, &self.forward)
    }

    pub(crate) fn new() -> Self {
        Self::default()
    }

    #[cfg(test)]
    fn with_logical_limit(limit: u64) -> Self {
        Self {
            accounting: ChangeSetAccountingV1 {
                budget: LogicalBudgetV1 {
                    limit,
                    ..LogicalBudgetV1::default()
                },
                ..ChangeSetAccountingV1::default()
            },
            ..Self::default()
        }
    }

    pub(crate) fn begin_segment(&self) -> OpenBatchSegmentV1 {
        OpenBatchSegmentV1 {
            forward_start: self.forward.len(),
            inverse_start: self.inverse_in_forward_order.len(),
            affected_start: self.affected_order.len(),
        }
    }

    pub(crate) fn end_segment(
        &mut self,
        open: OpenBatchSegmentV1,
    ) -> Result<(), ChangeSetBuildFailureV1> {
        self.ensure_accounting_active()?;
        self.accounting.charge_segment()?;
        self.segments.push(BatchSegmentV1 {
            forward_start: open.forward_start,
            forward_end: self.forward.len(),
            inverse_start: open.inverse_start,
            inverse_end: self.inverse_in_forward_order.len(),
            affected_start: open.affected_start,
            affected_end: self.affected_order.len(),
        });
        Ok(())
    }

    pub(crate) fn add_prepared_effects(
        &mut self,
        count: u64,
    ) -> Result<(), ChangeSetBuildFailureV1> {
        self.ensure_accounting_active()?;
        self.accounting.add_prepared_effects(count)
    }

    pub(crate) fn record_affected(
        &mut self,
        address: StableEntityAddressV1,
    ) -> Result<(), ChangeSetBuildFailureV1> {
        self.ensure_accounting_active()?;
        if self.accounting.record_affected((&address).into())? {
            self.affected_order.push(address);
        }
        Ok(())
    }

    pub(crate) fn replace_scalar(
        &mut self,
        address: ScalarAddressV1,
        expected: ScalarValueV1,
        value: ScalarValueV1,
    ) -> Result<(), ChangeSetBuildFailureV1> {
        self.charge_operation_pair()?;
        visit_scalar_address_strings(&address, |value| self.accounting.budget.intern(value))?;
        let expected = self.push_scalar(expected)?;
        let value = self.push_scalar(value)?;
        self.forward.push(ChangeOpV1::ReplaceScalar {
            address: address.clone(),
            expected,
            value,
        });
        self.inverse_in_forward_order
            .push(ChangeOpV1::ReplaceScalar {
                address,
                expected: value,
                value: expected,
            });
        Ok(())
    }

    pub(crate) fn insert_entity(
        &mut self,
        owner: StableOwnerAddressV1,
        order: StableOrderAddressV1,
        anchor: StableAnchorV1,
        entity: EntityBundleV1,
    ) -> Result<(), ChangeSetBuildFailureV1> {
        self.charge_operation_pair()?;
        self.intern_owner_order_anchor(&owner, &order, &anchor)?;
        let entity = self.push_entity(entity)?;
        self.forward.push(ChangeOpV1::InsertEntity {
            owner: owner.clone(),
            order: order.clone(),
            anchor: anchor.clone(),
            entity,
        });
        self.inverse_in_forward_order
            .push(ChangeOpV1::RemoveEntity {
                owner,
                order,
                expected_anchor: anchor,
                expected: entity,
            });
        Ok(())
    }

    pub(crate) fn remove_entity(
        &mut self,
        owner: StableOwnerAddressV1,
        order: StableOrderAddressV1,
        expected_anchor: StableAnchorV1,
        expected: EntityBundleV1,
    ) -> Result<(), ChangeSetBuildFailureV1> {
        self.charge_operation_pair()?;
        self.intern_owner_order_anchor(&owner, &order, &expected_anchor)?;
        let expected = self.push_entity(expected)?;
        self.forward.push(ChangeOpV1::RemoveEntity {
            owner: owner.clone(),
            order: order.clone(),
            expected_anchor: expected_anchor.clone(),
            expected,
        });
        self.inverse_in_forward_order
            .push(ChangeOpV1::InsertEntity {
                owner,
                order,
                anchor: expected_anchor,
                entity: expected,
            });
        Ok(())
    }

    pub(crate) fn insert_ordered_child(
        &mut self,
        order: StableOrderAddressV1,
        anchor: StableAnchorV1,
        child_id: StableId,
    ) -> Result<(), ChangeSetBuildFailureV1> {
        self.charge_operation_pair()?;
        self.accounting.budget.charge(ORDERED_CHILD_WEIGHT * 2)?;
        visit_order_address_strings(&order, |value| self.accounting.budget.intern(value))?;
        visit_anchor_strings(&anchor, |value| self.accounting.budget.intern(value))?;
        self.accounting.budget.intern(child_id.as_js_string())?;
        self.forward.push(ChangeOpV1::InsertOrderedChild {
            order: order.clone(),
            anchor: anchor.clone(),
            child_id: child_id.clone(),
        });
        self.inverse_in_forward_order
            .push(ChangeOpV1::RemoveOrderedChild {
                order,
                expected_anchor: anchor,
                child_id,
            });
        Ok(())
    }

    pub(crate) fn remove_ordered_child(
        &mut self,
        order: StableOrderAddressV1,
        expected_anchor: StableAnchorV1,
        child_id: StableId,
    ) -> Result<(), ChangeSetBuildFailureV1> {
        self.charge_operation_pair()?;
        self.accounting.budget.charge(ORDERED_CHILD_WEIGHT * 2)?;
        visit_order_address_strings(&order, |value| self.accounting.budget.intern(value))?;
        visit_anchor_strings(&expected_anchor, |value| {
            self.accounting.budget.intern(value)
        })?;
        self.accounting.budget.intern(child_id.as_js_string())?;
        self.forward.push(ChangeOpV1::RemoveOrderedChild {
            order: order.clone(),
            expected_anchor: expected_anchor.clone(),
            child_id: child_id.clone(),
        });
        self.inverse_in_forward_order
            .push(ChangeOpV1::InsertOrderedChild {
                order,
                anchor: expected_anchor,
                child_id,
            });
        Ok(())
    }

    pub(crate) fn move_ordered_child(
        &mut self,
        order: StableOrderAddressV1,
        child_id: StableId,
        expected_anchor: StableAnchorV1,
        anchor: StableAnchorV1,
    ) -> Result<(), ChangeSetBuildFailureV1> {
        self.charge_operation_pair()?;
        self.accounting.budget.charge(ORDERED_CHILD_WEIGHT * 2)?;
        visit_order_address_strings(&order, |value| self.accounting.budget.intern(value))?;
        visit_anchor_strings(&expected_anchor, |value| {
            self.accounting.budget.intern(value)
        })?;
        visit_anchor_strings(&anchor, |value| self.accounting.budget.intern(value))?;
        self.accounting.budget.intern(child_id.as_js_string())?;
        self.forward.push(ChangeOpV1::MoveOrderedChild {
            order: order.clone(),
            child_id: child_id.clone(),
            expected_anchor: expected_anchor.clone(),
            anchor: anchor.clone(),
        });
        self.inverse_in_forward_order
            .push(ChangeOpV1::MoveOrderedChild {
                order,
                child_id,
                expected_anchor: anchor,
                anchor: expected_anchor,
            });
        Ok(())
    }

    pub(crate) fn replace_ordered_children(
        &mut self,
        order: StableOrderAddressV1,
        expected: Vec<StableId>,
        value: Vec<StableId>,
    ) -> Result<(), ChangeSetBuildFailureV1> {
        self.charge_operation_pair()?;
        visit_order_address_strings(&order, |value| self.accounting.budget.intern(value))?;
        let expected = self.push_order(expected)?;
        let value = self.push_order(value)?;
        self.forward.push(ChangeOpV1::ReplaceOrderedChildren {
            order: order.clone(),
            expected,
            value,
        });
        self.inverse_in_forward_order
            .push(ChangeOpV1::ReplaceOrderedChildren {
                order,
                expected: value,
                value: expected,
            });
        Ok(())
    }

    pub(crate) fn insert_extension_block(
        &mut self,
        anchor: StableAnchorV1,
        value: ExtensionBlockV1,
    ) -> Result<(), ChangeSetBuildFailureV1> {
        self.charge_operation_pair()?;
        visit_anchor_strings(&anchor, |value| self.accounting.budget.intern(value))?;
        let value = self.push_extension(value)?;
        self.forward.push(ChangeOpV1::InsertExtensionBlock {
            anchor: anchor.clone(),
            value,
        });
        self.inverse_in_forward_order
            .push(ChangeOpV1::RemoveExtensionBlock {
                expected_anchor: anchor,
                expected: value,
            });
        Ok(())
    }

    pub(crate) fn replace_extension_block(
        &mut self,
        namespace: JsString,
        owner: StableExtensionOwnerV1,
        expected: ExtensionBlockV1,
        value: ExtensionBlockV1,
    ) -> Result<(), ChangeSetBuildFailureV1> {
        self.charge_operation_pair()?;
        self.accounting.budget.intern(&namespace)?;
        visit_stable_extension_owner_strings(&owner, |value| self.accounting.budget.intern(value))?;
        let expected = self.push_extension(expected)?;
        let value = self.push_extension(value)?;
        self.forward.push(ChangeOpV1::ReplaceExtensionBlock {
            namespace: namespace.clone(),
            owner: owner.clone(),
            expected,
            value,
        });
        self.inverse_in_forward_order
            .push(ChangeOpV1::ReplaceExtensionBlock {
                namespace,
                owner,
                expected: value,
                value: expected,
            });
        Ok(())
    }

    pub(crate) fn remove_extension_block(
        &mut self,
        expected_anchor: StableAnchorV1,
        expected: ExtensionBlockV1,
    ) -> Result<(), ChangeSetBuildFailureV1> {
        self.charge_operation_pair()?;
        visit_anchor_strings(&expected_anchor, |value| {
            self.accounting.budget.intern(value)
        })?;
        let expected = self.push_extension(expected)?;
        self.forward.push(ChangeOpV1::RemoveExtensionBlock {
            expected_anchor: expected_anchor.clone(),
            expected,
        });
        self.inverse_in_forward_order
            .push(ChangeOpV1::InsertExtensionBlock {
                anchor: expected_anchor,
                value: expected,
            });
        Ok(())
    }

    pub(crate) fn update_reference(
        &mut self,
        address: ReferenceAddressV1,
        expected: ReferenceValueV1,
        value: ReferenceValueV1,
    ) -> Result<(), ChangeSetBuildFailureV1> {
        self.charge_operation_pair()?;
        self.accounting.budget.charge(REFERENCE_DELTA_WEIGHT * 2)?;
        visit_reference_address_strings(&address, |value| self.accounting.budget.intern(value))?;
        let expected = self.push_reference(expected)?;
        let value = self.push_reference(value)?;
        self.forward.push(ChangeOpV1::UpdateReference {
            address: address.clone(),
            expected,
            value,
        });
        self.inverse_in_forward_order
            .push(ChangeOpV1::UpdateReference {
                address,
                expected: value,
                value: expected,
            });
        Ok(())
    }

    pub(crate) fn operation_count(&self) -> usize {
        self.forward.len()
    }

    pub(crate) fn affected_order(&self) -> &[StableEntityAddressV1] {
        &self.affected_order
    }

    pub(crate) fn logical_bytes(&self) -> u64 {
        self.frozen_accounting
            .map_or_else(|| self.accounting.logical_bytes(), |summary| summary.0)
    }

    pub(crate) fn finish(mut self) -> ChangeSetV1 {
        let inverse_count = self.inverse_in_forward_order.len();
        self.inverse_in_forward_order.reverse();
        for segment in &mut self.segments {
            let old_start = segment.inverse_start;
            let old_end = segment.inverse_end;
            segment.inverse_start = inverse_count - old_end;
            segment.inverse_end = inverse_count - old_start;
        }
        let logical_bytes = self.logical_bytes();
        let prepared_effect_count = self.frozen_accounting.map_or_else(
            || self.accounting.prepared_effect_count(),
            |summary| summary.1,
        );
        let change_set = ChangeSetV1 {
            arena: self.arena,
            forward: self.forward,
            inverse: self.inverse_in_forward_order,
            affected: self.affected_order,
            segments: self.segments,
            prepared_effect_count,
            logical_bytes,
        };
        debug_assert!(change_set.arena_references_are_well_typed());
        change_set
    }

    fn charge_operation_pair(&mut self) -> Result<(), ChangeSetBuildFailureV1> {
        self.ensure_accounting_active()?;
        self.accounting.operation_pair()
    }

    fn intern_owner_order_anchor(
        &mut self,
        owner: &StableOwnerAddressV1,
        order: &StableOrderAddressV1,
        anchor: &StableAnchorV1,
    ) -> Result<(), ChangeSetBuildFailureV1> {
        visit_owner_address_strings(owner, |value| self.accounting.budget.intern(value))?;
        visit_order_address_strings(order, |value| self.accounting.budget.intern(value))?;
        visit_anchor_strings(anchor, |value| self.accounting.budget.intern(value))
    }

    fn push_scalar(
        &mut self,
        value: ScalarValueV1,
    ) -> Result<ScalarValueRefV1, ChangeSetBuildFailureV1> {
        self.accounting.scalar_value(&value)?;
        self.arena
            .push(ArenaValueV1::Scalar(value))
            .map(ScalarValueRefV1)
    }

    fn push_entity(
        &mut self,
        value: EntityBundleV1,
    ) -> Result<EntityBundleRefV1, ChangeSetBuildFailureV1> {
        self.accounting
            .budget
            .charge(ARENA_ENTRY_WEIGHT + entity_fixed_bytes(&value))?;
        visit_entity_strings(&value, |value| self.accounting.budget.intern(value))?;
        self.arena
            .push(ArenaValueV1::Entity(value))
            .map(EntityBundleRefV1)
    }

    fn push_order(
        &mut self,
        value: Vec<StableId>,
    ) -> Result<OrderValueRefV1, ChangeSetBuildFailureV1> {
        self.accounting
            .order_value(value.len(), value.iter().map(StableId::as_js_string))?;
        self.arena
            .push(ArenaValueV1::Order(value))
            .map(OrderValueRefV1)
    }

    fn push_extension(
        &mut self,
        value: ExtensionBlockV1,
    ) -> Result<ExtensionValueRefV1, ChangeSetBuildFailureV1> {
        self.accounting.extension_value(&value)?;
        self.arena
            .push(ArenaValueV1::Extension(value))
            .map(ExtensionValueRefV1)
    }

    fn push_reference(
        &mut self,
        value: ReferenceValueV1,
    ) -> Result<ReferenceValueRefV1, ChangeSetBuildFailureV1> {
        self.accounting
            .budget
            .charge(ARENA_ENTRY_WEIGHT + reference_fixed_bytes(&value))?;
        visit_reference_strings(&value, |value| self.accounting.budget.intern(value))?;
        self.arena
            .push(ArenaValueV1::Reference(value))
            .map(ReferenceValueRefV1)
    }

    #[cfg(test)]
    fn charge_test_only(&mut self, amount: u64) -> Result<(), ChangeSetBuildFailureV1> {
        self.accounting.budget.charge(amount)
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct ChangeSetV1 {
    pub(crate) arena: ChangeArenaV1,
    pub(crate) forward: Vec<ChangeOpV1>,
    pub(crate) inverse: Vec<ChangeOpV1>,
    pub(crate) affected: Vec<StableEntityAddressV1>,
    pub(crate) segments: Vec<BatchSegmentV1>,
    pub(crate) prepared_effect_count: u64,
    pub(crate) logical_bytes: u64,
}

impl ChangeSetV1 {
    fn arena_references_are_well_typed(&self) -> bool {
        debug_assert_eq!(CHANGE_OPERATION_KIND_COUNT_V1, 11);
        self.forward.iter().chain(&self.inverse).all(|operation| {
            let _ = operation.kind_name();
            match operation {
                ChangeOpV1::ReplaceScalar {
                    expected, value, ..
                } => self.arena.scalar(*expected).is_some() && self.arena.scalar(*value).is_some(),
                ChangeOpV1::InsertEntity { entity, .. } => self.arena.entity(*entity).is_some(),
                ChangeOpV1::RemoveEntity { expected, .. } => self.arena.entity(*expected).is_some(),
                ChangeOpV1::ReplaceOrderedChildren {
                    expected, value, ..
                } => self.arena.order(*expected).is_some() && self.arena.order(*value).is_some(),
                ChangeOpV1::InsertExtensionBlock { value, .. } => {
                    self.arena.extension(*value).is_some()
                }
                ChangeOpV1::ReplaceExtensionBlock {
                    expected, value, ..
                } => {
                    self.arena.extension(*expected).is_some()
                        && self.arena.extension(*value).is_some()
                }
                ChangeOpV1::RemoveExtensionBlock { expected, .. } => {
                    self.arena.extension(*expected).is_some()
                }
                ChangeOpV1::UpdateReference {
                    expected, value, ..
                } => {
                    self.arena.reference(*expected).is_some()
                        && self.arena.reference(*value).is_some()
                }
                ChangeOpV1::InsertOrderedChild { .. }
                | ChangeOpV1::RemoveOrderedChild { .. }
                | ChangeOpV1::MoveOrderedChild { .. } => true,
            }
        })
    }
}

fn scalar_fixed_bytes(value: &ScalarValueV1) -> u64 {
    match value {
        ScalarValueV1::DocumentMetadata(metadata) => {
            SCALAR_VALUE_WEIGHT + ORDERED_CHILD_WEIGHT.saturating_mul(metadata.authors.len() as u64)
        }
        ScalarValueV1::MeasureDefinition {
            pickup_duration, ..
        } => SCALAR_VALUE_WEIGHT * (3 + u64::from(pickup_duration.is_some()) * 2),
        ScalarValueV1::PartName(_) => 0,
        ScalarValueV1::PartInstrument(_) => SCALAR_VALUE_WEIGHT * 2,
        ScalarValueV1::StaffDefinition { .. } => SCALAR_VALUE_WEIGHT * 3,
        ScalarValueV1::VoiceSequenceStart(_) => SCALAR_VALUE_WEIGHT * 2,
        ScalarValueV1::EventNoteValue(value) => note_value_fixed_bytes(value),
        ScalarValueV1::NoteWrittenPitch(_) => SCALAR_VALUE_WEIGHT * 3,
    }
}

fn note_value_fixed_bytes(value: &NoteValueV1) -> u64 {
    SCALAR_VALUE_WEIGHT.saturating_mul(3 + u64::from(value.time_modification.is_some()) * 2)
}

fn event_fixed_bytes(event: &RhythmicEventV1) -> u64 {
    let note_bytes = match &event.content {
        RhythmicContentV1::Rest => 0,
        RhythmicContentV1::Notes { notes } => {
            (notes.len() as u64).saturating_mul(node_fixed_bytes(RawEntityNodeV1::Note))
        }
    };
    node_fixed_bytes(RawEntityNodeV1::Event(&event.duration)).saturating_add(note_bytes)
}

fn voice_fixed_bytes(voice: &VoiceV1) -> u64 {
    node_fixed_bytes(RawEntityNodeV1::Voice).saturating_add(saturating_sum(
        voice.sequence.events.iter().map(event_fixed_bytes),
    ))
}

fn staff_fixed_bytes(_: &StaffDefinitionV1) -> u64 {
    node_fixed_bytes(RawEntityNodeV1::Staff)
}

fn part_fixed_bytes(part: &PartV1) -> u64 {
    node_fixed_bytes(RawEntityNodeV1::Part)
        .saturating_add(saturating_sum(part.staves.iter().map(staff_fixed_bytes)))
        .saturating_add(saturating_sum(part.measure_contents.iter().map(
            |content| {
                node_fixed_bytes(RawEntityNodeV1::Content)
                    .saturating_add(saturating_sum(content.voices.iter().map(voice_fixed_bytes)))
            },
        )))
}

fn extension_fixed_bytes(extension: &ExtensionBlockV1) -> u64 {
    SCALAR_VALUE_WEIGHT
        .saturating_add(bounded_json_object_len(&extension.payload))
        .saturating_add(match extension.owner {
            ExtensionOwnerV1::Score => SCALAR_VALUE_WEIGHT,
            ExtensionOwnerV1::Part { .. } => {
                SCALAR_VALUE_WEIGHT.saturating_add(REFERENCE_DELTA_WEIGHT)
            }
        })
}

fn entity_fixed_bytes(value: &EntityBundleV1) -> u64 {
    match value {
        EntityBundleV1::Measure(bundle) => node_fixed_bytes(RawEntityNodeV1::Measure {
            pickup: bundle.definition.pickup_duration.is_some(),
        })
        .saturating_add(saturating_sum(bundle.contents.iter().map(|content| {
            node_fixed_bytes(RawEntityNodeV1::Content)
                .saturating_add(saturating_sum(content.voices.iter().map(voice_fixed_bytes)))
        }))),
        EntityBundleV1::Part(bundle) => part_fixed_bytes(&bundle.part).saturating_add(
            saturating_sum(bundle.extensions.iter().map(|extension| {
                node_fixed_bytes(RawEntityNodeV1::OwnedExtension(&extension.value))
            })),
        ),
        EntityBundleV1::Staff(staff) => staff_fixed_bytes(staff),
        EntityBundleV1::Voice(voice) => voice_fixed_bytes(voice),
        EntityBundleV1::Event(event) => event_fixed_bytes(event),
        EntityBundleV1::Note(_) => node_fixed_bytes(RawEntityNodeV1::Note),
    }
}

fn reference_fixed_bytes(value: &ReferenceValueV1) -> u64 {
    match value {
        ReferenceValueV1::StableId(_) => 0,
        ReferenceValueV1::OptionalStableId(_) | ReferenceValueV1::Present(_) => SCALAR_VALUE_WEIGHT,
        ReferenceValueV1::ExtensionOwner(ExtensionOwnerV1::Score) => SCALAR_VALUE_WEIGHT,
        ReferenceValueV1::ExtensionOwner(ExtensionOwnerV1::Part { .. }) => SCALAR_VALUE_WEIGHT,
    }
}

fn saturating_sum(values: impl Iterator<Item = u64>) -> u64 {
    values.fold(0_u64, u64::saturating_add)
}

fn bounded_json_object_len(values: &std::collections::BTreeMap<JsString, BoundedJsonValue>) -> u64 {
    2_u64.saturating_add(
        values
            .iter()
            .enumerate()
            .fold(0_u64, |total, (index, (key, value))| {
                total.saturating_add(
                    u64::from(index != 0)
                        .saturating_add(json_string_len(key))
                        .saturating_add(1)
                        .saturating_add(bounded_json_len(value)),
                )
            }),
    )
}

fn bounded_json_len(value: &BoundedJsonValue) -> u64 {
    match value {
        BoundedJsonValue::Null => 4,
        BoundedJsonValue::Bool(true) => 4,
        BoundedJsonValue::Bool(false) => 5,
        BoundedJsonValue::Number(value) => {
            brilliant_score_foundation::finite_number_json_len(value)
        }
        BoundedJsonValue::String(value) => json_string_len(value),
        BoundedJsonValue::Array(values) => 2_u64.saturating_add(values.iter().enumerate().fold(
            0_u64,
            |total, (index, value)| {
                total.saturating_add(u64::from(index != 0).saturating_add(bounded_json_len(value)))
            },
        )),
        BoundedJsonValue::Object(values) => bounded_json_object_len(values),
    }
}

fn json_string_len(value: &JsString) -> u64 {
    brilliant_score_foundation::js_string_json_len(value)
        .and_then(|length| u64::try_from(length).ok())
        .unwrap_or(u64::MAX)
}

fn visit_scalar_address_strings(
    address: &ScalarAddressV1,
    mut visit: impl FnMut(&JsString) -> Result<(), ChangeSetBuildFailureV1>,
) -> Result<(), ChangeSetBuildFailureV1> {
    let id = match address {
        ScalarAddressV1::DocumentMetadata { document_id } => document_id,
        ScalarAddressV1::MeasureDefinition { measure_id } => measure_id,
        ScalarAddressV1::PartName { part_id } | ScalarAddressV1::PartInstrument { part_id } => {
            part_id
        }
        ScalarAddressV1::StaffDefinition { staff_id } => staff_id,
        ScalarAddressV1::VoiceSequenceStart { voice_id } => voice_id,
        ScalarAddressV1::EventNoteValue { event_id } => event_id,
        ScalarAddressV1::NoteWrittenPitch { note_id } => note_id,
    };
    visit(id.as_js_string())
}

fn visit_owner_address_strings(
    address: &StableOwnerAddressV1,
    mut visit: impl FnMut(&JsString) -> Result<(), ChangeSetBuildFailureV1>,
) -> Result<(), ChangeSetBuildFailureV1> {
    match address {
        StableOwnerAddressV1::Document { document_id } => visit(document_id.as_js_string()),
        StableOwnerAddressV1::Part { part_id } => visit(part_id.as_js_string()),
        StableOwnerAddressV1::PartMeasure {
            part_id,
            measure_id,
        } => {
            visit(part_id.as_js_string())?;
            visit(measure_id.as_js_string())
        }
        StableOwnerAddressV1::Voice { voice_id } => visit(voice_id.as_js_string()),
        StableOwnerAddressV1::Event { event_id } => visit(event_id.as_js_string()),
    }
}

fn visit_order_address_strings(
    address: &StableOrderAddressV1,
    mut visit: impl FnMut(&JsString) -> Result<(), ChangeSetBuildFailureV1>,
) -> Result<(), ChangeSetBuildFailureV1> {
    match address {
        StableOrderAddressV1::Measures { document_id }
        | StableOrderAddressV1::Parts { document_id }
        | StableOrderAddressV1::Extensions { document_id } => visit(document_id.as_js_string()),
        StableOrderAddressV1::Staffs { part_id }
        | StableOrderAddressV1::MeasureContents { part_id } => visit(part_id.as_js_string()),
        StableOrderAddressV1::Voices {
            part_id,
            measure_id,
        } => {
            visit(part_id.as_js_string())?;
            visit(measure_id.as_js_string())
        }
        StableOrderAddressV1::Events { voice_id } => visit(voice_id.as_js_string()),
        StableOrderAddressV1::Notes { event_id } => visit(event_id.as_js_string()),
    }
}

fn visit_anchor_strings(
    anchor: &StableAnchorV1,
    mut visit: impl FnMut(&JsString) -> Result<(), ChangeSetBuildFailureV1>,
) -> Result<(), ChangeSetBuildFailureV1> {
    match anchor {
        StableAnchorV1::Start => Ok(()),
        StableAnchorV1::After { sibling_id } => visit(sibling_id.as_js_string()),
    }
}

fn visit_stable_extension_owner_strings(
    owner: &StableExtensionOwnerV1,
    mut visit: impl FnMut(&JsString) -> Result<(), ChangeSetBuildFailureV1>,
) -> Result<(), ChangeSetBuildFailureV1> {
    match owner {
        StableExtensionOwnerV1::Score => Ok(()),
        StableExtensionOwnerV1::Part { part_id } => visit(part_id.as_js_string()),
    }
}

fn visit_reference_address_strings(
    address: &ReferenceAddressV1,
    mut visit: impl FnMut(&JsString) -> Result<(), ChangeSetBuildFailureV1>,
) -> Result<(), ChangeSetBuildFailureV1> {
    match address {
        ReferenceAddressV1::VoiceDefaultStaff { voice_id } => visit(voice_id.as_js_string()),
        ReferenceAddressV1::EventStaffAssignment { event_id } => visit(event_id.as_js_string()),
        ReferenceAddressV1::PartMeasureLink {
            part_id,
            measure_id,
        } => {
            visit(part_id.as_js_string())?;
            visit(measure_id.as_js_string())
        }
        ReferenceAddressV1::ExtensionOwner { namespace, owner } => {
            visit(namespace)?;
            visit_stable_extension_owner_strings(owner, visit)
        }
    }
}

fn visit_scalar_strings(
    value: &ScalarValueV1,
    mut visit: impl FnMut(&JsString) -> Result<(), ChangeSetBuildFailureV1>,
) -> Result<(), ChangeSetBuildFailureV1> {
    match value {
        ScalarValueV1::DocumentMetadata(metadata) => {
            visit(&metadata.title)?;
            for author in &metadata.authors {
                visit(author)?;
            }
        }
        ScalarValueV1::PartName(name) => visit(name)?,
        ScalarValueV1::PartInstrument(instrument) => visit(&instrument.name)?,
        ScalarValueV1::MeasureDefinition { .. }
        | ScalarValueV1::StaffDefinition { .. }
        | ScalarValueV1::VoiceSequenceStart(_)
        | ScalarValueV1::EventNoteValue(_)
        | ScalarValueV1::NoteWrittenPitch(_) => {}
    }
    Ok(())
}

fn visit_note_strings(
    note: &ScoreNoteV1,
    visit: &mut impl FnMut(&JsString) -> Result<(), ChangeSetBuildFailureV1>,
) -> Result<(), ChangeSetBuildFailureV1> {
    visit(note.id.as_js_string())
}

fn visit_event_strings(
    event: &RhythmicEventV1,
    visit: &mut impl FnMut(&JsString) -> Result<(), ChangeSetBuildFailureV1>,
) -> Result<(), ChangeSetBuildFailureV1> {
    visit(event.id.as_js_string())?;
    if let Some(staff_id) = &event.staff_id {
        visit(staff_id.as_js_string())?;
    }
    if let RhythmicContentV1::Notes { notes } = &event.content {
        for note in notes {
            visit_note_strings(note, visit)?;
        }
    }
    Ok(())
}

fn visit_voice_strings(
    voice: &VoiceV1,
    visit: &mut impl FnMut(&JsString) -> Result<(), ChangeSetBuildFailureV1>,
) -> Result<(), ChangeSetBuildFailureV1> {
    visit(voice.id.as_js_string())?;
    visit(voice.default_staff_id.as_js_string())?;
    for event in &voice.sequence.events {
        visit_event_strings(event, visit)?;
    }
    Ok(())
}

fn visit_part_strings(
    part: &PartV1,
    visit: &mut impl FnMut(&JsString) -> Result<(), ChangeSetBuildFailureV1>,
) -> Result<(), ChangeSetBuildFailureV1> {
    visit(part.id.as_js_string())?;
    visit(&part.name)?;
    visit(&part.instrument.name)?;
    for staff in &part.staves {
        visit(staff.id.as_js_string())?;
    }
    for content in &part.measure_contents {
        visit(content.measure_id.as_js_string())?;
        for voice in &content.voices {
            visit_voice_strings(voice, visit)?;
        }
    }
    Ok(())
}

fn visit_extension_strings(
    extension: &ExtensionBlockV1,
    mut visit: impl FnMut(&JsString) -> Result<(), ChangeSetBuildFailureV1>,
) -> Result<(), ChangeSetBuildFailureV1> {
    visit(&extension.namespace)?;
    if let ExtensionOwnerV1::Part { part_id } = &extension.owner {
        visit(part_id.as_js_string())?;
    }
    Ok(())
}

fn visit_entity_strings(
    value: &EntityBundleV1,
    mut visit: impl FnMut(&JsString) -> Result<(), ChangeSetBuildFailureV1>,
) -> Result<(), ChangeSetBuildFailureV1> {
    match value {
        EntityBundleV1::Measure(bundle) => {
            visit(bundle.definition.id.as_js_string())?;
            for content in &bundle.contents {
                visit(content.part_id.as_js_string())?;
                for voice in &content.voices {
                    visit_voice_strings(voice, &mut visit)?;
                }
            }
        }
        EntityBundleV1::Part(bundle) => {
            visit_part_strings(&bundle.part, &mut visit)?;
            for extension in &bundle.extensions {
                visit_anchor_strings(&extension.anchor, &mut visit)?;
                visit_extension_strings(&extension.value, &mut visit)?;
            }
        }
        EntityBundleV1::Staff(staff) => visit(staff.id.as_js_string())?,
        EntityBundleV1::Voice(voice) => visit_voice_strings(voice, &mut visit)?,
        EntityBundleV1::Event(event) => visit_event_strings(event, &mut visit)?,
        EntityBundleV1::Note(note) => visit_note_strings(note, &mut visit)?,
    }
    Ok(())
}

fn visit_reference_strings(
    value: &ReferenceValueV1,
    mut visit: impl FnMut(&JsString) -> Result<(), ChangeSetBuildFailureV1>,
) -> Result<(), ChangeSetBuildFailureV1> {
    match value {
        ReferenceValueV1::StableId(id) | ReferenceValueV1::OptionalStableId(Some(id)) => {
            visit(id.as_js_string())
        }
        ReferenceValueV1::ExtensionOwner(ExtensionOwnerV1::Part { part_id }) => {
            visit(part_id.as_js_string())
        }
        ReferenceValueV1::OptionalStableId(None)
        | ReferenceValueV1::Present(_)
        | ReferenceValueV1::ExtensionOwner(ExtensionOwnerV1::Score) => Ok(()),
    }
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeMap;

    use brilliant_core_types::SafeInteger;
    use brilliant_score_foundation::{ExtensionOwnerV1, TempoV1};

    use super::*;

    fn id(value: &str) -> StableId {
        StableId::new(value).expect("stable id")
    }

    fn metadata(title: &str) -> ScalarValueV1 {
        ScalarValueV1::DocumentMetadata(ScoreMetadataV1 {
            title: title.into(),
            authors: vec!["Brilliant Guitar".into()],
            tempo: TempoV1 {
                bpm: SafeInteger::new(120).expect("safe bpm").into(),
            },
        })
    }

    #[test]
    fn change_set_vocabulary_has_exactly_eleven_typed_operations() {
        assert_eq!(CHANGE_OPERATION_KIND_COUNT_V1, 11);
        let names = [
            "replace-scalar",
            "insert-entity",
            "remove-entity",
            "insert-ordered-child",
            "remove-ordered-child",
            "move-ordered-child",
            "replace-ordered-children",
            "insert-extension-block",
            "replace-extension-block",
            "remove-extension-block",
            "update-reference",
        ];
        assert_eq!(names.len(), CHANGE_OPERATION_KIND_COUNT_V1);
    }

    #[test]
    fn change_set_inverse_is_reverse_safe_and_reuses_arena_values() {
        let mut builder = ChangeSetBuilderV1::new();
        let segment = builder.begin_segment();
        let address = ScalarAddressV1::DocumentMetadata {
            document_id: id("score-1"),
        };
        builder
            .replace_scalar(address.clone(), metadata("Before"), metadata("After"))
            .expect("replace scalar");
        builder
            .move_ordered_child(
                StableOrderAddressV1::Events {
                    voice_id: id("voice-1"),
                },
                id("event-2"),
                StableAnchorV1::After {
                    sibling_id: id("event-1"),
                },
                StableAnchorV1::Start,
            )
            .expect("move event");
        builder.end_segment(segment).expect("segment");
        let change_set = builder.finish();

        assert_eq!(change_set.forward.len(), 2);
        assert_eq!(change_set.inverse.len(), 2);
        assert_eq!(change_set.forward[0].kind_name(), "replace-scalar");
        assert_eq!(change_set.forward[1].kind_name(), "move-ordered-child");
        assert_eq!(change_set.inverse[0].kind_name(), "move-ordered-child");
        assert_eq!(change_set.inverse[1].kind_name(), "replace-scalar");

        let ChangeOpV1::ReplaceScalar {
            expected, value, ..
        } = &change_set.forward[0]
        else {
            panic!("forward scalar operation");
        };
        let ChangeOpV1::ReplaceScalar {
            expected: inverse_expected,
            value: inverse_value,
            ..
        } = &change_set.inverse[1]
        else {
            panic!("inverse scalar operation");
        };
        assert_eq!(expected, inverse_value);
        assert_eq!(value, inverse_expected);
        assert_eq!(
            change_set.arena.scalar(*expected),
            Some(&metadata("Before"))
        );
        assert_eq!(change_set.arena.scalar(*value), Some(&metadata("After")));
        assert_eq!(change_set.segments.len(), 1);
        assert_eq!(change_set.segments[0].inverse_start, 0);
        assert_eq!(change_set.segments[0].inverse_end, 2);
    }

    #[test]
    fn batch_segments_keep_child_order_while_inverse_ranges_point_into_reverse_order() {
        let mut builder = ChangeSetBuilderV1::new();
        let first = builder.begin_segment();
        builder
            .replace_scalar(
                ScalarAddressV1::DocumentMetadata {
                    document_id: id("score-1"),
                },
                metadata("zero"),
                metadata("one"),
            )
            .expect("first child");
        builder.end_segment(first).expect("first segment");

        let second = builder.begin_segment();
        builder
            .replace_scalar(
                ScalarAddressV1::DocumentMetadata {
                    document_id: id("score-1"),
                },
                metadata("one"),
                metadata("two"),
            )
            .expect("second child first op");
        builder
            .move_ordered_child(
                StableOrderAddressV1::Events {
                    voice_id: id("voice-1"),
                },
                id("event-2"),
                StableAnchorV1::Start,
                StableAnchorV1::After {
                    sibling_id: id("event-1"),
                },
            )
            .expect("second child second op");
        builder.end_segment(second).expect("second segment");

        let change_set = builder.finish();
        assert_eq!(change_set.segments.len(), 2);
        assert_eq!(change_set.segments[0].forward_start, 0);
        assert_eq!(change_set.segments[0].forward_end, 1);
        assert_eq!(change_set.segments[0].inverse_start, 2);
        assert_eq!(change_set.segments[0].inverse_end, 3);
        assert_eq!(change_set.segments[1].forward_start, 1);
        assert_eq!(change_set.segments[1].forward_end, 3);
        assert_eq!(change_set.segments[1].inverse_start, 0);
        assert_eq!(change_set.segments[1].inverse_end, 2);
    }

    #[test]
    fn logical_budget_accepts_the_cap_and_rejects_the_successor() {
        let mut at_cap = ChangeSetBuilderV1::with_logical_limit(64);
        at_cap.charge_test_only(64).expect("inclusive cap");
        assert_eq!(at_cap.logical_bytes(), 64);
        assert_eq!(
            at_cap.charge_test_only(1),
            Err(ChangeSetBuildFailureV1::LogicalBytesExceeded {
                limit: 64,
                actual: 65,
            })
        );

        let mut overflow = ChangeSetBuilderV1::with_logical_limit(u64::MAX);
        overflow
            .charge_test_only(u64::MAX)
            .expect("exact u64 test cap");
        assert_eq!(
            overflow.charge_test_only(1),
            Err(ChangeSetBuildFailureV1::LogicalBytesExceeded {
                limit: u64::MAX,
                actual: u64::MAX,
            })
        );
    }

    #[test]
    fn logical_interning_preserves_distinct_units_and_json_escape_costs() {
        let high = JsString::from_utf16(vec![0xd800]);
        let low = JsString::from_utf16(vec![0xdc00]);
        let replacement = JsString::from("\u{fffd}");
        let pair = JsString::from_utf16(vec![0xd800, 0xdc00]);
        let mut budget = LogicalBudgetV1 {
            limit: 13,
            ..LogicalBudgetV1::default()
        };
        for value in [&high, &low, &replacement, &pair] {
            budget.intern(value).unwrap();
            budget
                .intern(&JsString::from_utf16(value.code_units().to_vec()))
                .unwrap();
        }
        assert_eq!(budget.logical_bytes, 13);
        assert_eq!(budget.interned_strings.len(), 4);
        assert_eq!(
            budget.intern(&JsString::from("a")),
            Err(ChangeSetBuildFailureV1::LogicalBytesExceeded {
                limit: 13,
                actual: 14
            })
        );
        assert_eq!(budget.logical_bytes, 13);
        assert_eq!(budget.interned_strings.len(), 4);

        let object = BTreeMap::from([
            (high.clone(), BoundedJsonValue::String(low)),
            (replacement, BoundedJsonValue::String(pair)),
        ]);
        // JSON.stringify({[D800]: DC00, [FFFD]: D800+DC00}): 32 bytes.
        assert_eq!(bounded_json_object_len(&object), 32);
        assert_eq!(high.code_units(), [0xd800]);
    }

    #[test]
    fn accepted_wire_and_property_worst_shape_fits_the_frozen_logical_cap() {
        assert_eq!(REQUEST_BYTE_LIMIT, 67_108_864);
        assert_eq!(JSON_PROPERTY_LIMIT, 1_572_864);
        let bound = accepted_wire_logical_upper_bound_v1().expect("checked bound");
        assert_eq!(bound, 266_341_506);
        assert!(bound <= MAX_CHANGESET_LOGICAL_BYTES_V1);
        assert_eq!(MAX_CHANGESET_LOGICAL_BYTES_V1 - bound, 2_093_950);
    }

    #[test]
    fn exact_value_accounting_counts_fixed_fields_json_and_unique_strings_once() {
        let mut scalar = ChangeSetBuilderV1::new();
        scalar
            .replace_scalar(
                ScalarAddressV1::DocumentMetadata {
                    document_id: id("score"),
                },
                metadata("Before"),
                metadata("After"),
            )
            .expect("metadata replacement");
        assert_eq!(scalar.logical_bytes(), 256);

        let mut payload = BTreeMap::new();
        payload.insert("x".into(), BoundedJsonValue::String("\n".into()));
        let mut extension = ChangeSetBuilderV1::new();
        extension
            .insert_extension_block(
                StableAnchorV1::Start,
                ExtensionBlockV1 {
                    namespace: "n".into(),
                    schema_version: SafeInteger::new(1).expect("schema version"),
                    owner: ExtensionOwnerV1::Score,
                    payload,
                },
            )
            .expect("extension insert");
        assert_eq!(extension.logical_bytes(), 187);

        let mut reference = ChangeSetBuilderV1::new();
        reference
            .update_reference(
                ReferenceAddressV1::EventStaffAssignment { event_id: id("e") },
                ReferenceValueV1::OptionalStableId(None),
                ReferenceValueV1::OptionalStableId(Some(id("s"))),
            )
            .expect("reference update");
        assert_eq!(reference.logical_bytes(), 258);
    }

    #[test]
    fn effect_and_affected_caps_accept_the_boundary_and_reject_the_successor() {
        let mut effects = ChangeSetBuilderV1::new();
        effects
            .add_prepared_effects(MAX_PREPARED_EFFECTS_V1)
            .expect("effect cap");
        assert_eq!(
            effects.add_prepared_effects(1),
            Err(ChangeSetBuildFailureV1::PreparedEffectsExceeded {
                limit: MAX_PREPARED_EFFECTS_V1,
                actual: MAX_PREPARED_EFFECTS_V1 + 1,
            })
        );

        let mut affected = ChangeSetBuilderV1::new();
        for index in 0..MAX_AFFECTED_ADDRESSES_V1 {
            affected
                .record_affected(StableEntityAddressV1::Note {
                    note_id: id(&format!("n-{index}")),
                })
                .expect("affected boundary entry");
        }
        assert_eq!(
            affected.record_affected(StableEntityAddressV1::Note {
                note_id: id("overflow"),
            }),
            Err(ChangeSetBuildFailureV1::AffectedAddressesExceeded {
                limit: MAX_AFFECTED_ADDRESSES_V1,
                actual: MAX_AFFECTED_ADDRESSES_V1 + 1,
            })
        );
    }

    #[test]
    fn affected_addresses_are_first_observed_deduplicated_and_ids_are_interned() {
        let mut builder = ChangeSetBuilderV1::new();
        let note = StableEntityAddressV1::Note {
            note_id: id("note-1"),
        };
        builder.record_affected(note.clone()).expect("first note");
        let first_charge = builder.logical_bytes();
        builder.record_affected(note).expect("duplicate note");
        assert_eq!(builder.logical_bytes(), first_charge);
        let event = StableEntityAddressV1::Event {
            event_id: id("event-1"),
        };
        builder.record_affected(event).expect("event");
        let change_set = builder.finish();
        assert_eq!(change_set.affected.len(), 2);
        assert_eq!(change_set.affected[0].stable_id().as_js_string(), "note-1");
        assert_eq!(change_set.affected[1].stable_id().as_js_string(), "event-1");
    }

    #[test]
    fn prepared_effects_are_distinct_from_primitive_change_operations() {
        let mut builder = ChangeSetBuilderV1::new();
        builder.add_prepared_effects(7).expect("effects");
        builder
            .replace_scalar(
                ScalarAddressV1::DocumentMetadata {
                    document_id: id("score-1"),
                },
                metadata("Before"),
                metadata("After"),
            )
            .expect("one primitive change");
        assert_eq!(builder.operation_count(), 1);
        let change_set = builder.finish();
        assert_eq!(change_set.prepared_effect_count, 7);
        assert_eq!(change_set.forward.len(), 1);
        assert!(change_set.logical_bytes > 0);
    }
}
