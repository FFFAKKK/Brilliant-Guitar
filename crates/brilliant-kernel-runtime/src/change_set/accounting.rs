//! Compatibility accounting shared by typed logs and occurrence journals.
//! This owns no executable operations and does not measure physical allocation.
use super::*;

type Outcome<T = ()> = Result<T, ChangeSetBuildFailureV1>;

#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
pub(crate) enum RawAffectedKindV1 {
    Document,
    Measure,
    Part,
    Staff,
    Voice,
    Event,
    Note,
}

#[derive(Clone, Copy)]
pub(crate) struct RawAffectedV1<'a> {
    pub(crate) kind: RawAffectedKindV1,
    pub(crate) id: &'a JsString,
}

impl<'a> From<&'a StableEntityAddressV1> for RawAffectedV1<'a> {
    fn from(address: &'a StableEntityAddressV1) -> Self {
        let kind = match address {
            StableEntityAddressV1::Document { .. } => RawAffectedKindV1::Document,
            StableEntityAddressV1::Measure { .. } => RawAffectedKindV1::Measure,
            StableEntityAddressV1::Part { .. } => RawAffectedKindV1::Part,
            StableEntityAddressV1::Staff { .. } => RawAffectedKindV1::Staff,
            StableEntityAddressV1::Voice { .. } => RawAffectedKindV1::Voice,
            StableEntityAddressV1::Event { .. } => RawAffectedKindV1::Event,
            StableEntityAddressV1::Note { .. } => RawAffectedKindV1::Note,
        };
        Self {
            kind,
            id: address.stable_id().as_js_string(),
        }
    }
}

/// Emit each retained node once. Event excludes its Note children; Content is
/// emitted once per owner-scoped content, even when raw IDs are repeated.
pub(crate) enum RawEntityNodeV1<'a> {
    Measure { pickup: bool },
    Part,
    Staff,
    Content,
    Voice,
    Event(&'a NoteValueV1),
    Note,
    OwnedExtension(&'a ExtensionBlockV1),
}

/// Borrowed shape and strings, with no conversion of raw IDs to StableId.
/// Strings include node IDs, reference IDs, names, and extension anchors, in
/// the same traversal order as visit_entity_strings. Payload strings stay JSON.
pub(crate) trait RawEntityViewV1 {
    fn visit_nodes(&self, visit: &mut dyn FnMut(RawEntityNodeV1<'_>) -> Outcome) -> Outcome;
    fn visit_strings(&self, visit: &mut dyn FnMut(&JsString) -> Outcome) -> Outcome;
}

pub(crate) enum RawReferenceValueV1<'a> {
    StableId(&'a JsString),
    OptionalStableId(Option<&'a JsString>),
}

#[derive(Debug, Default)]
pub(crate) struct ChangeSetAccountingV1 {
    pub(super) budget: LogicalBudgetV1,
    pub(super) effects: u64,
    pub(super) affected: HashSet<(RawAffectedKindV1, JsString)>,
    pub(super) deferred: bool,
}

impl ChangeSetAccountingV1 {
    #[cfg(test)]
    pub(crate) fn charge_test_only(&mut self, amount: u64) -> Outcome {
        self.budget.charge(amount)
    }
    pub(crate) fn logical_bytes(&self) -> u64 {
        self.budget.logical_bytes
    }
    pub(crate) fn prepared_effect_count(&self) -> u64 {
        self.effects
    }
    pub(crate) fn affected_count(&self) -> usize {
        self.affected.len()
    }

    /// Used only by the admission Batch seam. A failed child discards the whole
    /// transaction; this is not a rollback/savepoint mechanism.
    pub(crate) fn begin_deferred_segment(&mut self) -> Outcome {
        if self.deferred {
            return Err(ChangeSetBuildFailureV1::ArenaIndexOverflow);
        }
        self.deferred = true;
        Ok(())
    }

    /// Effects precede the complete affected union, retaining full actuals.
    /// The caller charges a segment only for a successfully changed child.
    pub(crate) fn end_deferred_segment(&mut self) -> Outcome {
        if !self.deferred {
            return Err(ChangeSetBuildFailureV1::ArenaIndexOverflow);
        }
        self.check_prepared_effects(0)?;
        let actual = self.affected.len() as u64;
        if actual > MAX_AFFECTED_ADDRESSES_V1 {
            return Err(ChangeSetBuildFailureV1::AffectedAddressesExceeded {
                limit: MAX_AFFECTED_ADDRESSES_V1,
                actual,
            });
        }
        self.deferred = false;
        Ok(())
    }

    pub(crate) fn intern(&mut self, value: &JsString) -> Outcome {
        self.budget.intern(value)
    }

    pub(crate) fn charge_segment(&mut self) -> Outcome {
        self.budget.charge(BATCH_SEGMENT_WEIGHT)
    }

    pub(crate) fn check_prepared_effects(&self, count: u64) -> Outcome {
        let actual = self.effects.saturating_add(count);
        if actual > MAX_PREPARED_EFFECTS_V1 {
            return Err(ChangeSetBuildFailureV1::PreparedEffectsExceeded {
                limit: MAX_PREPARED_EFFECTS_V1,
                actual,
            });
        }
        Ok(())
    }

    pub(crate) fn add_prepared_effects(&mut self, count: u64) -> Outcome {
        if !self.deferred {
            self.check_prepared_effects(count)?;
        }
        self.effects = self.effects.saturating_add(count);
        Ok(())
    }

    /// Full child precheck preserves TS's aggregate actual rather than stopping
    /// at limit+1. Does not charge or publish any affected address.
    pub(crate) fn check_affected_segment(&self, values: &[RawAffectedV1<'_>]) -> Outcome {
        let mut pending = HashSet::new();
        pending
            .try_reserve(values.len())
            .map_err(|_| ChangeSetBuildFailureV1::ArenaIndexOverflow)?;
        for value in values {
            if !self.affected.contains(&(value.kind, value.id.clone())) {
                pending.insert((value.kind, value.id));
            }
        }
        let actual = (self.affected.len() as u64).saturating_add(pending.len() as u64);
        if !self.deferred && actual > MAX_AFFECTED_ADDRESSES_V1 {
            return Err(ChangeSetBuildFailureV1::AffectedAddressesExceeded {
                limit: MAX_AFFECTED_ADDRESSES_V1,
                actual,
            });
        }
        Ok(())
    }

    #[cfg(test)]
    pub(crate) fn record_affected_segment(&mut self, values: &[RawAffectedV1<'_>]) -> Outcome {
        self.check_affected_segment(values)?;
        for value in values {
            self.record_affected(*value)?;
        }
        Ok(())
    }

    pub(crate) fn record_affected(&mut self, value: RawAffectedV1<'_>) -> Outcome<bool> {
        let key = (value.kind, value.id.clone());
        if self.affected.contains(&key) {
            return Ok(false);
        }
        let actual = (self.affected.len() as u64).saturating_add(1);
        if !self.deferred && actual > MAX_AFFECTED_ADDRESSES_V1 {
            return Err(ChangeSetBuildFailureV1::AffectedAddressesExceeded {
                limit: MAX_AFFECTED_ADDRESSES_V1,
                actual,
            });
        }
        self.affected
            .try_reserve(1)
            .map_err(|_| ChangeSetBuildFailureV1::ArenaIndexOverflow)?;
        self.budget.charge(AFFECTED_ADDRESS_WEIGHT)?;
        self.intern(value.id)?;
        self.affected.insert(key);
        Ok(true)
    }

    pub(super) fn operation_pair(&mut self) -> Outcome {
        self.budget.charge(CHANGE_OPERATION_WEIGHT * 2)
    }
    pub(super) fn scalar_value(&mut self, value: &ScalarValueV1) -> Outcome {
        self.budget
            .charge(ARENA_ENTRY_WEIGHT + scalar_fixed_bytes(value))?;
        visit_scalar_strings(value, |value| self.intern(value))
    }
    pub(super) fn extension_value(&mut self, value: &ExtensionBlockV1) -> Outcome {
        self.budget
            .charge(ARENA_ENTRY_WEIGHT + extension_fixed_bytes(value))?;
        visit_extension_strings(value, |value| self.intern(value))
    }
    pub(super) fn order_value<'a>(
        &mut self,
        len: usize,
        strings: impl IntoIterator<Item = &'a JsString>,
    ) -> Outcome {
        self.budget.charge(
            ARENA_ENTRY_WEIGHT.saturating_add(ORDERED_CHILD_WEIGHT.saturating_mul(len as u64)),
        )?;
        self.strings(strings)
    }
    fn strings<'a>(&mut self, values: impl IntoIterator<Item = &'a JsString>) -> Outcome {
        for value in values {
            self.intern(value)?;
        }
        Ok(())
    }

    pub(crate) fn charge_scalar_pair(
        &mut self,
        target: &JsString,
        expected: &ScalarValueV1,
        next: &ScalarValueV1,
    ) -> Outcome {
        self.operation_pair()?;
        self.intern(target)?;
        for value in [expected, next] {
            self.scalar_value(value)?;
        }
        Ok(())
    }

    /// owner/order/anchor strings are supplied in existing builder order.
    pub(crate) fn charge_entity_pair<'a>(
        &mut self,
        address_strings: impl IntoIterator<Item = &'a JsString>,
        value: &impl RawEntityViewV1,
    ) -> Outcome {
        self.operation_pair()?;
        self.strings(address_strings)?;
        let mut fixed = 0_u64;
        value.visit_nodes(&mut |node| {
            fixed = fixed.saturating_add(node_fixed_bytes(node));
            Ok(())
        })?;
        self.budget
            .charge(ARENA_ENTRY_WEIGHT.saturating_add(fixed))?;
        value.visit_strings(&mut |value| self.intern(value))
    }

    /// Insert/remove/move each retain two child entries, independent of anchors.
    pub(crate) fn charge_ordered_child_pair<'a>(
        &mut self,
        address_anchor_child_strings: impl IntoIterator<Item = &'a JsString>,
    ) -> Outcome {
        self.operation_pair()?;
        self.budget.charge(ORDERED_CHILD_WEIGHT * 2)?;
        self.strings(address_anchor_child_strings)
    }

    pub(crate) fn charge_order_pair<'a>(
        &mut self,
        address_strings: impl IntoIterator<Item = &'a JsString>,
        expected: &[&JsString],
        next: &[&JsString],
    ) -> Outcome {
        self.operation_pair()?;
        self.strings(address_strings)?;
        for order in [expected, next] {
            self.order_value(order.len(), order.iter().copied())?;
        }
        Ok(())
    }

    pub(crate) fn charge_reference_pair<'a>(
        &mut self,
        address_strings: impl IntoIterator<Item = &'a JsString>,
        expected: RawReferenceValueV1<'_>,
        next: RawReferenceValueV1<'_>,
    ) -> Outcome {
        self.operation_pair()?;
        self.budget.charge(REFERENCE_DELTA_WEIGHT * 2)?;
        self.strings(address_strings)?;
        for value in [expected, next] {
            let (fixed, string) = match value {
                RawReferenceValueV1::StableId(id) => (0, Some(id)),
                RawReferenceValueV1::OptionalStableId(id) => (SCALAR_VALUE_WEIGHT, id),
            };
            self.budget.charge(ARENA_ENTRY_WEIGHT + fixed)?;
            if let Some(id) = string {
                self.intern(id)?;
            }
        }
        Ok(())
    }

    /// One value for insertion/removal, two for replacement, sharing the arena
    /// values across inverse/forward exactly as the typed builder does.
    pub(crate) fn charge_extension_pair<'a>(
        &mut self,
        address_anchor_strings: impl IntoIterator<Item = &'a JsString>,
        values: &[&ExtensionBlockV1],
    ) -> Outcome {
        self.operation_pair()?;
        self.strings(address_anchor_strings)?;
        for value in values {
            self.extension_value(value)?;
        }
        Ok(())
    }
}

pub(super) fn node_fixed_bytes(node: RawEntityNodeV1<'_>) -> u64 {
    match node {
        RawEntityNodeV1::Measure { pickup } => {
            ORDERED_CHILD_WEIGHT + SCALAR_VALUE_WEIGHT * (3 + u64::from(pickup) * 2)
        }
        RawEntityNodeV1::Part => ORDERED_CHILD_WEIGHT + SCALAR_VALUE_WEIGHT * 2,
        RawEntityNodeV1::Staff | RawEntityNodeV1::Note => {
            ORDERED_CHILD_WEIGHT + SCALAR_VALUE_WEIGHT * 3
        }
        RawEntityNodeV1::Content => ORDERED_CHILD_WEIGHT + REFERENCE_DELTA_WEIGHT,
        RawEntityNodeV1::Voice => {
            ORDERED_CHILD_WEIGHT + SCALAR_VALUE_WEIGHT * 2 + REFERENCE_DELTA_WEIGHT
        }
        RawEntityNodeV1::Event(duration) => {
            ORDERED_CHILD_WEIGHT
                + note_value_fixed_bytes(duration)
                + SCALAR_VALUE_WEIGHT
                + REFERENCE_DELTA_WEIGHT
        }
        RawEntityNodeV1::OwnedExtension(value) => {
            ORDERED_CHILD_WEIGHT.saturating_add(extension_fixed_bytes(value))
        }
    }
}

#[cfg(test)]
mod tests;
