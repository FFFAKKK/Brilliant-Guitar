//! Private Part-owned extension edits. Stable keys identify physical records;
//! occurrence owners prevent a new Part lifetime inheriting an old lifetime's
//! extensions merely because the raw ID is reused.
use super::*;
use crate::change_set::{AnchoredExtensionBlockV1, StableAnchorV1, StableExtensionOwnerV1};
use crate::overlay::{
    ExtensionHeaderReadFailureV1 as HeaderFailure, ExtensionHeaderV1, ExtensionKeyV1,
};
use crate::transaction::{FinalExtensionDeltaV1, TransactionPrepareFailureV1};
use brilliant_score_foundation::{ExtensionBlockV1, ExtensionOwnerV1};

#[derive(Default)]
pub(super) struct ExtensionState {
    order: Option<Vec<ExtensionHeaderV1>>,
    states: HashMap<ExtensionKeyV1, Option<Arc<ExtensionBlockV1>>>,
    owners: HashMap<ExtensionKeyV1, Occurrence>,
    // Only inverse births may restore this originally dangling ownership mode.
    // It must override a fresh replay base's now-existing Part lifetime.
    preserved_dangling: HashSet<ExtensionKeyV1>,
    removed: HashSet<ExtensionKeyV1>,
}

fn key(header: &ExtensionHeaderV1) -> ExtensionKeyV1 {
    ExtensionKeyV1 {
        namespace: header.namespace.clone(),
        owner: (&header.owner).into(),
    }
}

fn header(block: &ExtensionBlockV1) -> ExtensionHeaderV1 {
    ExtensionHeaderV1 {
        namespace: block.namespace.clone(),
        schema_version: block.schema_version,
        owner: block.owner.clone(),
    }
}

fn anchor_id(header: &ExtensionHeaderV1) -> Result<StableId, HeaderFailure> {
    let (prefix, part) = match &header.owner {
        ExtensionOwnerV1::Score => ("extension:score:", None),
        ExtensionOwnerV1::Part { part_id } => ("extension:part:", Some(part_id.as_js_string())),
    };
    let capacity = prefix
        .len()
        .checked_add(header.namespace.code_units().len())
        .and_then(|size| {
            size.checked_add(part.map_or(0, |part| part.code_units().len().saturating_add(1)))
        })
        .ok_or(HeaderFailure::Capacity)?;
    let mut units = Vec::new();
    units
        .try_reserve(capacity)
        .map_err(|_| HeaderFailure::Capacity)?;
    units.extend(prefix.encode_utf16());
    if let Some(part) = part {
        units.extend_from_slice(part.code_units());
        units.push(b':' as u16);
    }
    units.extend_from_slice(header.namespace.code_units());
    StableId::new(JsString::from_utf16(units)).map_err(|_| HeaderFailure::Invariant)
}

impl Candidate<'_> {
    pub(super) fn visit_extension_headers(
        &self,
        visitor: &mut dyn FnMut(&ExtensionHeaderV1) -> bool,
    ) -> Result<(), HeaderFailure> {
        self.reservation
            .ensure_active()
            .map_err(|_| HeaderFailure::Invariant)?;
        if let Some(order) = &self.extension_state.order {
            for header in order {
                if !visitor(header) {
                    break;
                }
            }
            Ok(())
        } else {
            self.prefix.visit_extension_headers(visitor)
        }
    }

    fn extension_owner(&self, key: &ExtensionKeyV1) -> Option<Occurrence> {
        if let Some(owner) = self.extension_state.owners.get(key) {
            return Some(owner.clone());
        }
        let StableExtensionOwnerV1::Part { part_id } = &key.owner else {
            return None;
        };
        let address = Entity::Part {
            part_id: part_id.clone(),
        };
        // A pre-existing owner is tied to its frozen lifetime. An originally
        // dangling raw owner remains in the header for final semantic checks.
        if !self.extension_state.preserved_dangling.contains(key)
            && self.prefix.frozen_resolve_entity_address(part_id) == Some(address.clone())
        {
            return Some(Occurrence::prefix(address));
        }
        // An owner absent at the prefix has no old lifetime to transfer. A
        // unique later Part can repair that raw reference; ambiguity stays raw
        // and must not let an occurrence-based delete choose an arbitrary one.
        let indices = self.added.get(&Kind::Part)?.get(part_id.as_js_string())?;
        let mut result = None;
        for index in indices {
            let source = Occurrence::Added(*index);
            if self.visible(&source) {
                if result.is_some() {
                    return None;
                }
                result = Some(source);
            }
        }
        result
    }

    pub(super) fn read_extension(
        &self,
        requested: &ExtensionKeyV1,
    ) -> Option<AnchoredExtensionBlockV1> {
        if self.extension_state.order.is_none() {
            return self.prefix.read_extension(requested);
        }
        let mut previous = StableAnchorV1::Start;
        let mut found = None;
        let mut failed = false;
        self.visit_extension_headers(&mut |header| {
            if key(header) == *requested {
                found = Some(previous.clone());
                return false;
            }
            match anchor_id(header) {
                Ok(id) => previous = StableAnchorV1::After { sibling_id: id },
                Err(_) => {
                    failed = true;
                    return false;
                }
            }
            true
        })
        .ok()?;
        if failed {
            return None;
        }
        let anchor = found?;
        let value = match self.extension_state.states.get(requested) {
            Some(Some(value)) => value.as_ref().clone(),
            Some(None) => return None,
            None => self.prefix.read_extension(requested)?.value,
        };
        Some(AnchoredExtensionBlockV1 { anchor, value })
    }

    /// Header-only ownership snapshot for a birth that repairs pre-existing
    /// dangling references without creating or taking ownership of their data.
    pub(super) fn part_extension_keys(
        &self,
        root: &Occurrence,
    ) -> Result<Vec<ExtensionKeyV1>, Failure> {
        self.reservation.ensure_active()?;
        if self.kind(root) != Some(Kind::Part) || !self.visible(root) {
            return Err(Failure::InternalError);
        }
        let mut result = Vec::new();
        let mut failed = false;
        self.visit_extension_headers(&mut |header| {
            let key = key(header);
            if self.extension_owner(&key).as_ref() != Some(root) {
                return true;
            }
            if result.try_reserve(1).is_err() {
                failed = true;
                return false;
            }
            result.push(key);
            true
        })
        .map_err(|_| Failure::InternalError)?;
        if failed {
            return Err(Failure::InternalError);
        }
        Ok(result)
    }

    /// A birth's inverse may leave explicitly named pre-existing extensions
    /// dangling for the following typed-prefix inverse. Everything else must
    /// match the removal image exactly, including current global anchors.
    pub(super) fn verify_part_extensions_preserving(
        &self,
        root: &Occurrence,
        expected: &[AnchoredExtensionBlockV1],
        preserved: &[ExtensionKeyV1],
    ) -> Result<(), Failure> {
        let actual = self.part_extension_keys(root)?;
        let count = expected
            .len()
            .checked_add(preserved.len())
            .ok_or(Failure::InternalError)?;
        if actual.len() != count {
            return Err(Failure::InternalError);
        }
        let mut allowed = HashSet::new();
        allowed
            .try_reserve(count)
            .map_err(|_| Failure::InternalError)?;
        for key in preserved {
            if !allowed.insert(key.clone()) {
                return Err(Failure::InternalError);
            }
        }
        for block in expected {
            if !allowed.insert(ExtensionKeyV1::from_block(&block.value)) {
                return Err(Failure::InternalError);
            }
        }
        let mut next = expected.iter();
        let mut preserved_order = preserved.iter();
        for key in actual {
            if !allowed.remove(&key) {
                return Err(Failure::InternalError);
            }
            if preserved.contains(&key) {
                if preserved_order.next() != Some(&key) {
                    return Err(Failure::InternalError);
                }
                continue;
            }
            let expected = next.next().ok_or(Failure::InternalError)?;
            if ExtensionKeyV1::from_block(&expected.value) != key
                || self.read_extension(&key).as_ref() != Some(expected)
            {
                return Err(Failure::InternalError);
            }
        }
        if next.next().is_some() || !allowed.is_empty() {
            return Err(Failure::InternalError);
        }
        Ok(())
    }

    pub(super) fn read_part_extensions(
        &self,
        root: &Occurrence,
    ) -> Result<Vec<AnchoredExtensionBlockV1>, Failure> {
        self.reservation.ensure_active()?;
        if self.kind(root) != Some(Kind::Part) || !self.visible(root) {
            return Err(Failure::InternalError);
        }
        let mut result = Vec::new();
        let mut failed = false;
        self.visit_extension_headers(&mut |header| {
            let key = key(header);
            if self.extension_owner(&key).as_ref() != Some(root) {
                return true;
            }
            let Some(block) = self.read_extension(&key) else {
                failed = true;
                return false;
            };
            if result.try_reserve(1).is_err() {
                failed = true;
                return false;
            }
            result.push(block);
            true
        })
        .map_err(|_| Failure::InternalError)?;
        if failed {
            return Err(Failure::InternalError);
        }
        Ok(result)
    }

    fn copy_extension_order(&mut self) -> Result<(), Failure> {
        if self.extension_state.order.is_some() {
            return Ok(());
        }
        let mut order = Vec::new();
        let mut reservation = std::mem::take(&mut self.reservation);
        let result = self.prefix.visit_extension_headers(&mut |header| {
            if reservation
                .vec(Site::JournalOperations, &mut order, 1)
                .is_err()
            {
                return false;
            }
            order.push(header.clone());
            true
        });
        self.reservation = reservation;
        self.reservation.ensure_active()?;
        result.map_err(|_| Failure::InternalError)?;
        self.extension_state.order = Some(order);
        self.mutation_work.record_writes = self.mutation_work.record_writes.saturating_add(1);
        Ok(())
    }

    pub(super) fn remove_part_extensions(
        &mut self,
        root: &Occurrence,
        expected: &[AnchoredExtensionBlockV1],
    ) -> Result<(), Failure> {
        self.remove_part_extensions_preserving(root, expected, &[])
    }

    pub(super) fn remove_part_extensions_preserving(
        &mut self,
        root: &Occurrence,
        expected: &[AnchoredExtensionBlockV1],
        preserved: &[ExtensionKeyV1],
    ) -> Result<(), Failure> {
        self.verify_part_extensions_preserving(root, expected, preserved)?;
        self.reservation.set(
            Site::JournalOperations,
            &mut self.extension_state.preserved_dangling,
            preserved.len(),
        )?;
        for key in preserved {
            // Undoing this birth restores the raw dangling reference, rather
            // than retaining a binding to the soon-hidden birth occurrence.
            self.extension_state.owners.remove(key);
            self.extension_state.preserved_dangling.insert(key.clone());
        }
        if expected.is_empty() {
            return Ok(());
        }
        self.copy_extension_order()?;
        self.reservation.map(
            Site::JournalOperations,
            &mut self.extension_state.states,
            expected.len(),
        )?;
        self.reservation.set(
            Site::JournalOperations,
            &mut self.extension_state.removed,
            expected.len(),
        )?;
        for block in expected {
            let key = ExtensionKeyV1::from_block(&block.value);
            self.extension_state
                .order
                .as_mut()
                .ok_or(Failure::InternalError)?
                .retain(|header| crate::candidate::extensions::key(header) != key);
            self.extension_state.states.insert(key.clone(), None);
            self.extension_state.removed.insert(key);
            self.mutation_work.record_writes = self.mutation_work.record_writes.saturating_add(1);
        }
        Ok(())
    }

    pub(super) fn insert_part_extensions(
        &mut self,
        root: &Occurrence,
        blocks: &[AnchoredExtensionBlockV1],
    ) -> Result<(), Failure> {
        self.reservation.ensure_active()?;
        if self.kind(root) != Some(Kind::Part) || !self.visible(root) {
            return Err(Failure::InternalError);
        }
        if blocks.is_empty() {
            return Ok(());
        }
        let raw = self.raw_id(root).ok_or(Failure::InternalError)?.clone();
        if !self.read_part_extensions(root)?.is_empty() {
            return Err(Failure::InternalError);
        }
        self.copy_extension_order()?;
        self.reservation.map(
            Site::JournalOperations,
            &mut self.extension_state.states,
            blocks.len(),
        )?;
        self.reservation.map(
            Site::JournalOperations,
            &mut self.extension_state.owners,
            blocks.len(),
        )?;
        self.reservation.vec(
            Site::JournalOperations,
            self.extension_state
                .order
                .as_mut()
                .ok_or(Failure::InternalError)?,
            blocks.len(),
        )?;
        for block in blocks {
            if !matches!(&block.value.owner, ExtensionOwnerV1::Part { part_id } if part_id.as_js_string() == &raw)
            {
                return Err(Failure::InternalError);
            }
            let key = ExtensionKeyV1::from_block(&block.value);
            if self
                .read_extension_reference(&key.namespace, &key.owner)
                .is_some()
            {
                return Err(Failure::InternalError);
            }
            let order = self
                .extension_state
                .order
                .as_mut()
                .ok_or(Failure::InternalError)?;
            if order
                .iter()
                .any(|header| crate::candidate::extensions::key(header) == key)
            {
                return Err(Failure::InternalError);
            }
            let position = match &block.anchor {
                StableAnchorV1::Start => 0,
                StableAnchorV1::After { sibling_id } => {
                    let mut found = None;
                    for (index, header) in order.iter().enumerate() {
                        if anchor_id(header).map_err(|_| Failure::InternalError)? == *sibling_id {
                            found = Some(index + 1);
                            break;
                        }
                    }
                    found.ok_or(Failure::InternalError)?
                }
            };
            order.insert(position, header(&block.value));
            self.extension_state
                .states
                .insert(key.clone(), Some(Arc::new(block.value.clone())));
            self.extension_state.owners.insert(key, root.clone());
            self.mutation_work.record_writes = self.mutation_work.record_writes.saturating_add(1);
        }
        Ok(())
    }

    pub(super) fn read_extension_reference(
        &self,
        namespace: &JsString,
        owner: &StableExtensionOwnerV1,
    ) -> Option<ReferenceValueV1> {
        let key = ExtensionKeyV1 {
            namespace: namespace.clone(),
            owner: owner.clone(),
        };
        match self.extension_state.states.get(&key) {
            Some(Some(value)) => Some(ReferenceValueV1::ExtensionOwner(value.owner.clone())),
            Some(None) => None,
            None => self.prefix.read_reference(&Reference::ExtensionOwner {
                namespace: namespace.clone(),
                owner: owner.clone(),
            }),
        }
    }

    pub(super) fn visit_extension_order(
        &self,
        visitor: &mut dyn FnMut(&StableId) -> bool,
    ) -> Option<()> {
        let mut failed = false;
        self.visit_extension_headers(&mut |header| match anchor_id(header) {
            Ok(id) => visitor(&id),
            Err(_) => {
                failed = true;
                false
            }
        })
        .ok()?;
        (!failed).then_some(())
    }

    pub(super) fn changed_extension_references_to(&self, target: &StableId) -> Vec<Reference> {
        self.extension_state
            .states
            .iter()
            .filter_map(|(key, state)| {
                let value = state.as_ref()?;
                matches!(&value.owner, ExtensionOwnerV1::Part { part_id } if part_id == target)
                    .then(|| Reference::ExtensionOwner {
                        namespace: key.namespace.clone(),
                        owner: key.owner.clone(),
                    })
            })
            .collect()
    }

    pub(super) fn extension_delta(
        &self,
    ) -> Result<FinalExtensionDeltaV1, TransactionPrepareFailureV1> {
        let Some(order) = &self.extension_state.order else {
            return Ok(FinalExtensionDeltaV1::Unchanged);
        };
        let mut final_order = Vec::new();
        final_order
            .try_reserve(order.len())
            .map_err(|_| TransactionPrepareFailureV1::Capacity)?;
        final_order.extend(order.iter().map(key));
        let mut states = HashMap::new();
        states
            .try_reserve(self.extension_state.states.len())
            .map_err(|_| TransactionPrepareFailureV1::Capacity)?;
        for (key, value) in &self.extension_state.states {
            states.insert(
                key.clone(),
                value.as_ref().map(|value| value.as_ref().clone()),
            );
        }
        let mut removed = HashSet::new();
        removed
            .try_reserve(self.extension_state.removed.len())
            .map_err(|_| TransactionPrepareFailureV1::Capacity)?;
        removed.extend(self.extension_state.removed.iter().cloned());
        Ok(FinalExtensionDeltaV1::Changed {
            final_order,
            states,
            removed,
        })
    }
}
