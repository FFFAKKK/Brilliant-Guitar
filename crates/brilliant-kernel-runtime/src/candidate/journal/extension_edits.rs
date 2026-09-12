//! Immutable extension images and lifetime bindings for mixed-Batch effects.
//! The expected ledger is derived from recorded data, not candidate mirrors.
use super::*;
use crate::change_set::{
    AnchoredExtensionBlockV1 as Block, StableAnchorV1, StableExtensionOwnerV1,
};
use crate::overlay::{ExtensionHeaderV1, ExtensionKeyV1};
use brilliant_score_foundation::{ExtensionBlockV1, ExtensionOwnerV1};

#[derive(Clone)]
pub(super) struct StoredExtensionEdit {
    pub(super) key: ExtensionKeyV1,
    pub(super) expected: Option<Arc<Block>>,
    pub(super) expected_owner: Option<JournalId>,
    pub(super) value: Option<Arc<Block>>,
    pub(super) owner: Option<JournalId>,
}

#[cfg(test)]
mod tests;

impl StoredExtensionEdit {
    pub(super) fn apply(
        &self,
        candidate: &mut Candidate<'_>,
        bindings: &mut ReplayBindings<'_>,
    ) -> Result<(), Failure> {
        let expected_owner = self
            .expected_owner
            .map(|id| bindings.resolve(id, candidate))
            .transpose()?;
        let owner = self
            .owner
            .map(|id| bindings.resolve(id, candidate))
            .transpose()?;
        if !candidate.edit_extension(
            &self.key,
            self.expected.as_deref(),
            expected_owner.as_ref(),
            self.value.as_deref(),
            owner.as_ref(),
        )? {
            return Err(Failure::InternalError);
        }
        Ok(())
    }
}

#[derive(Clone)]
enum Origin {
    Prefix,
    Bound(Occurrence),
}
struct LedgerEntry {
    value: Arc<ExtensionBlockV1>,
    origin: Origin,
}
pub(super) struct ExtensionLedger {
    entries: Vec<LedgerEntry>,
}

fn header(value: &ExtensionBlockV1) -> ExtensionHeaderV1 {
    ExtensionHeaderV1 {
        namespace: value.namespace.clone(),
        schema_version: value.schema_version,
        owner: value.owner.clone(),
    }
}
fn anchor(entry: Option<&LedgerEntry>) -> Result<StableAnchorV1, Failure> {
    entry.map_or(Ok(StableAnchorV1::Start), |entry| {
        header(&entry.value)
            .anchor_id()
            .map(|sibling_id| StableAnchorV1::After { sibling_id })
            .map_err(|_| Failure::InternalError)
    })
}
impl ExtensionLedger {
    pub(super) fn remove(&mut self, blocks: &[Block]) {
        // Part removal already verified an ordered subset. Walk once rather
        // than comparing every retained extension with every recorded death.
        let mut next = 0;
        self.entries.retain(|entry| {
            if blocks.get(next).is_some_and(|block| {
                ExtensionKeyV1::from_block(&entry.value) == ExtensionKeyV1::from_block(&block.value)
            }) {
                next += 1;
                false
            } else {
                true
            }
        });
    }
    fn block(&self, index: usize) -> Result<Block, Failure> {
        let entry = self.entries.get(index).ok_or(Failure::InternalError)?;
        Ok(Block {
            anchor: anchor(
                index
                    .checked_sub(1)
                    .and_then(|index| self.entries.get(index)),
            )?,
            value: entry.value.as_ref().clone(),
        })
    }
}

impl Recorder<'_> {
    #[cfg_attr(
        not(test),
        expect(
            dead_code,
            reason = "Called by the next mixed-Batch dispatcher; exercised here through stored history tests"
        )
    )]
    pub(super) fn edit_extension(
        &mut self,
        namespace: JsString,
        owner: &Occurrence,
        value: Option<ExtensionBlockV1>,
    ) -> Result<bool, Failure> {
        let result = self.edit_extension_inner(namespace, owner, value);
        if result.is_err() {
            self.candidate.reservation.abort();
        }
        result
    }

    fn ensure_extension_ledger(&mut self) -> Result<(), Failure> {
        if self.extension_ledger.is_some() {
            return Ok(());
        }
        let mut entries = Vec::new();
        let mut failed = false;
        let mut reservation = std::mem::take(&mut self.candidate.reservation);
        let visited = self
            .candidate
            .prefix
            .visit_extension_headers(&mut |header| {
                let key = ExtensionKeyV1 {
                    namespace: header.namespace.clone(),
                    owner: (&header.owner).into(),
                };
                if self.recorded_extension_deaths.contains(&key) {
                    return true;
                }
                let Some(block) = self.candidate.prefix.read_extension(&key) else {
                    failed = true;
                    return false;
                };
                if reservation
                    .vec(Site::JournalOperations, &mut entries, 1)
                    .is_err()
                {
                    return false;
                }
                entries.push(LedgerEntry {
                    value: Arc::new(block.value),
                    origin: Origin::Prefix,
                });
                true
            });
        self.candidate.reservation = reservation;
        self.candidate.reservation.ensure_active()?;
        visited.map_err(|_| Failure::InternalError)?;
        if failed {
            return Err(Failure::InternalError);
        }
        self.extension_ledger = Some(ExtensionLedger { entries });
        Ok(())
    }

    fn verify_extension_order(&self) -> Result<(), Failure> {
        let ledger = self
            .extension_ledger
            .as_ref()
            .ok_or(Failure::InternalError)?;
        let mut index = 0;
        let mut valid = true;
        self.candidate
            .visit_extension_headers(&mut |actual| {
                if ledger
                    .entries
                    .get(index)
                    .is_none_or(|entry| header(&entry.value) != *actual)
                {
                    valid = false;
                    return false;
                }
                index += 1;
                true
            })
            .map_err(|_| Failure::InternalError)?;
        if !valid || index != ledger.entries.len() {
            return Err(Failure::InternalError);
        }
        Ok(())
    }

    pub(super) fn ledger_part_extensions(
        &mut self,
        root: &Occurrence,
    ) -> Result<Vec<Block>, Failure> {
        let ledger = self
            .extension_ledger
            .as_ref()
            .ok_or(Failure::InternalError)?;
        let mut expected = Vec::new();
        for (index, entry) in ledger.entries.iter().enumerate() {
            let belongs = match &entry.origin {
                Origin::Prefix => self.prefix_extension_belongs_to(&header(&entry.value), root),
                Origin::Bound(owner) => owner == root,
            };
            if belongs {
                self.candidate
                    .reservation
                    .vec(Site::JournalOperations, &mut expected, 1)?;
                expected.push(ledger.block(index)?);
            }
        }
        Ok(expected)
    }

    fn recorded_binding(&self, entry: &LedgerEntry) -> Option<Occurrence> {
        match &entry.origin {
            Origin::Bound(owner) => Some(owner.clone()),
            Origin::Prefix => match &entry.value.owner {
                ExtensionOwnerV1::Score => Some(self.candidate.document.clone()),
                ExtensionOwnerV1::Part { part_id } => {
                    let address = Entity::Part {
                        part_id: part_id.clone(),
                    };
                    (self.candidate.prefix.frozen_resolve_entity_address(part_id)
                        == Some(address.clone()))
                    .then(|| Occurrence::prefix(address))
                }
            },
        }
    }

    fn edit_extension_inner(
        &mut self,
        namespace: JsString,
        owner: &Occurrence,
        value: Option<ExtensionBlockV1>,
    ) -> Result<bool, Failure> {
        self.candidate.reservation.ensure_active()?;
        self.verify_recorded_node(owner)?;
        let owned = match self.candidate.kind(owner) {
            Some(Kind::Document) => ExtensionOwnerV1::Score,
            Some(Kind::Part) => ExtensionOwnerV1::Part {
                part_id: StableId::new(
                    self.candidate
                        .raw_id(owner)
                        .ok_or(Failure::InternalError)?
                        .clone(),
                )
                .map_err(|_| Failure::InternalError)?,
            },
            _ => return Err(Failure::InternalError),
        };
        let key = ExtensionKeyV1 {
            namespace,
            owner: StableExtensionOwnerV1::from(&owned),
        };
        if value
            .as_ref()
            .is_some_and(|value| ExtensionKeyV1::from_block(value) != key)
        {
            return Err(Failure::InternalError);
        }
        self.ensure_extension_ledger()?;
        self.verify_extension_order()?;
        let ledger = self
            .extension_ledger
            .as_ref()
            .ok_or(Failure::InternalError)?;
        let index = ledger
            .entries
            .iter()
            .position(|entry| ExtensionKeyV1::from_block(&entry.value) == key);
        let expected = index
            .map(|index| ledger.block(index).map(Arc::new))
            .transpose()?;
        let expected_owner = index.and_then(|index| self.recorded_binding(&ledger.entries[index]));
        if self.candidate.read_extension(&key).as_ref() != expected.as_deref()
            || (expected.is_some() && self.candidate.extension_binding(&key) != expected_owner)
        {
            return Err(Failure::InternalError);
        }
        if expected.as_ref().map(|block| &block.value) == value.as_ref() {
            return Ok(false);
        }
        let position = expected.as_ref().map_or_else(
            || anchor(ledger.entries.last()),
            |expected| Ok(expected.anchor.clone()),
        )?;
        self.check_effect_budget(1)?;
        let next = value.map(|value| {
            Arc::new(Block {
                anchor: position,
                value,
            })
        });
        let expected_id = expected_owner
            .as_ref()
            .map(|owner| self.identities.record(&mut self.candidate, owner))
            .transpose()?;
        let next_id = if next.is_some() {
            Some(self.identities.record(&mut self.candidate, owner)?)
        } else {
            None
        };
        self.candidate
            .reservation
            .vec(Site::JournalOperations, &mut self.steps, 1)?;
        let ledger = self
            .extension_ledger
            .as_mut()
            .ok_or(Failure::InternalError)?;
        self.candidate.reservation.vec(
            Site::JournalOperations,
            &mut ledger.entries,
            usize::from(index.is_none() && next.is_some()),
        )?;
        if !self.candidate.edit_extension(
            &key,
            expected.as_deref(),
            expected_owner.as_ref(),
            next.as_deref(),
            next.as_ref().map(|_| owner),
        )? {
            return Err(Failure::InternalError);
        }
        match (&next, index) {
            (Some(next), Some(index)) => {
                ledger.entries[index] = LedgerEntry {
                    value: Arc::new(next.value.clone()),
                    origin: Origin::Bound(owner.clone()),
                }
            }
            (Some(next), None) => ledger.entries.push(LedgerEntry {
                value: Arc::new(next.value.clone()),
                origin: Origin::Bound(owner.clone()),
            }),
            (None, Some(index)) => {
                ledger.entries.remove(index);
            }
            (None, None) => return Err(Failure::InternalError),
        }
        self.steps.push(Step {
            forward: Operation::Extension(Arc::new(StoredExtensionEdit {
                key: key.clone(),
                expected: expected.clone(),
                expected_owner: expected_id,
                value: next.clone(),
                owner: next_id,
            })),
            inverse: Operation::Extension(Arc::new(StoredExtensionEdit {
                key,
                expected: next,
                expected_owner: next_id,
                value: expected,
                owner: expected_id,
            })),
        });
        Ok(true)
    }
}
