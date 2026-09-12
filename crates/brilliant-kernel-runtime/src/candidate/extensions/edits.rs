//! Expected-value extension writes for stored module effects. Binding is a
//! physical owner lifetime, distinct from a temporarily repaired raw reference.
use super::*;

impl Candidate<'_> {
    pub(in crate::candidate) fn extension_binding(
        &self,
        key: &ExtensionKeyV1,
    ) -> Option<Occurrence> {
        if matches!(key.owner, StableExtensionOwnerV1::Score) {
            return Some(self.document.clone());
        }
        if let Some(owner) = self.extension_state.owners.get(key) {
            return Some(owner.clone());
        }
        if self.extension_state.preserved_dangling.contains(key) {
            return None;
        }
        let StableExtensionOwnerV1::Part { part_id } = &key.owner else {
            return None;
        };
        let source = Entity::Part {
            part_id: part_id.clone(),
        };
        (self.prefix.frozen_resolve_entity_address(part_id) == Some(source.clone()))
            .then(|| Occurrence::prefix(source))
    }

    pub(in crate::candidate) fn edit_extension(
        &mut self,
        key: &ExtensionKeyV1,
        expected: Option<&AnchoredExtensionBlockV1>,
        expected_owner: Option<&Occurrence>,
        value: Option<&AnchoredExtensionBlockV1>,
        owner: Option<&Occurrence>,
    ) -> Result<bool, Failure> {
        let result = self.edit_extension_inner(key, expected, expected_owner, value, owner);
        if result.is_err() {
            self.reservation.abort();
        }
        result
    }

    fn edit_extension_inner(
        &mut self,
        key: &ExtensionKeyV1,
        expected: Option<&AnchoredExtensionBlockV1>,
        expected_owner: Option<&Occurrence>,
        value: Option<&AnchoredExtensionBlockV1>,
        owner: Option<&Occurrence>,
    ) -> Result<bool, Failure> {
        self.reservation.ensure_active()?;
        if self.read_extension(key).as_ref() != expected
            || (expected.is_some() && self.extension_binding(key).as_ref() != expected_owner)
            || (expected.is_none() && expected_owner.is_some())
            || (value.is_none() && owner.is_some())
        {
            return Err(Failure::InternalError);
        }
        if let Some(value) = value {
            if ExtensionKeyV1::from_block(&value.value) != *key {
                return Err(Failure::InternalError);
            }
            match (&value.value.owner, owner) {
                (ExtensionOwnerV1::Score, Some(source)) if source == &self.document => {}
                (ExtensionOwnerV1::Part { part_id }, Some(source))
                    if self.kind(source) == Some(Kind::Part)
                        && self.visible(source)
                        && self.raw_id(source) == Some(part_id.as_js_string()) => {}
                (ExtensionOwnerV1::Part { .. }, None) => {} // stored restoration of an originally dangling reference
                _ => return Err(Failure::InternalError),
            }
        }
        if expected == value && expected_owner == owner {
            return Ok(false);
        }
        self.copy_extension_order()?;
        self.reservation
            .map(Site::JournalOperations, &mut self.extension_state.states, 1)?;
        self.reservation
            .map(Site::JournalOperations, &mut self.extension_state.owners, 1)?;
        self.reservation.set(
            Site::JournalOperations,
            &mut self.extension_state.preserved_dangling,
            1,
        )?;
        self.reservation.set(
            Site::JournalOperations,
            &mut self.extension_state.removed,
            1,
        )?;
        let order = self
            .extension_state
            .order
            .as_mut()
            .ok_or(Failure::InternalError)?;
        self.reservation
            .vec(Site::JournalOperations, order, usize::from(value.is_some()))?;
        order.retain(|entry| super::key(entry) != *key);
        if let Some(value) = value {
            let position = match &value.anchor {
                StableAnchorV1::Start => 0,
                StableAnchorV1::After { sibling_id } => {
                    let mut position = None;
                    for (index, header) in order.iter().enumerate() {
                        if anchor_id(header).map_err(|_| Failure::InternalError)? == *sibling_id {
                            position = Some(index + 1);
                            break;
                        }
                    }
                    position.ok_or(Failure::InternalError)?
                }
            };
            order.insert(position, header(&value.value));
            self.extension_state
                .states
                .insert(key.clone(), Some(Arc::new(value.value.clone())));
            match (&value.value.owner, owner) {
                (ExtensionOwnerV1::Part { .. }, Some(source)) => {
                    self.extension_state
                        .owners
                        .insert(key.clone(), source.clone());
                    self.extension_state.preserved_dangling.remove(key);
                }
                (ExtensionOwnerV1::Part { .. }, None) => {
                    self.extension_state.owners.remove(key);
                    self.extension_state.preserved_dangling.insert(key.clone());
                }
                _ => {}
            }
        } else {
            self.extension_state.states.insert(key.clone(), None);
            self.extension_state.owners.remove(key);
            self.extension_state.preserved_dangling.remove(key);
            self.extension_state.removed.insert(key.clone());
        }
        self.mutation_work.record_writes = self.mutation_work.record_writes.saturating_add(1);
        Ok(true)
    }
}
