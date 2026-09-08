//! Staff leaves use the same stored insertion/removal operations as Part
//! subtrees. Raw target/anchor resolution belongs only to preparation.

use super::*;
use bundle::Image;

#[derive(Clone)]
pub(super) struct StaffBundle {
    pub(super) id: JournalId,
    pub(super) image: Arc<Image>,
}

impl StaffBundle {
    pub(super) fn validate(&self) -> Result<(), Failure> {
        if self.image.kind != Kind::Staff || !self.image.shape_valid() {
            return Err(Failure::InternalError);
        }
        Ok(())
    }

    fn capture(
        candidate: &mut Candidate<'_>,
        identities: &mut IdentityRecorder,
        source: &Occurrence,
    ) -> Result<Self, Failure> {
        candidate.reservation.ensure_active()?;
        if !candidate.visible(source) || candidate.kind(source) != Some(Kind::Staff) {
            return Err(Failure::InternalError);
        }
        let image = Image {
            raw_id: candidate
                .raw_id(source)
                .ok_or(Failure::InternalError)?
                .clone(),
            kind: Kind::Staff,
            value: Some(candidate.read_value(source).ok_or(Failure::InternalError)?),
            instrument: None,
            staff_id: None,
            content_kind: None,
        };
        let bundle = Self {
            id: identities.record(candidate, source)?,
            image: Arc::new(image),
        };
        bundle.validate()?;
        Ok(bundle)
    }
}

impl Recorder<'_> {
    /// Staff order traversal is local to its Part; no descendant subtree is
    /// scanned. Existing expected order prevents structural edits from adopting
    /// an earlier unrecorded member or move into the journal ledger.
    pub(super) fn expected_staff_order(
        &mut self,
        order: &CandidateOrder,
    ) -> Result<Option<Vec<JournalId>>, Failure> {
        Ok(Some(self.recorded_order_ids(order)?))
    }

    fn reserve_staff_ledger(
        &mut self,
        part: &Occurrence,
        order: &CandidateOrder,
    ) -> Result<(), Failure> {
        if let Some(active) = self.active.get_mut(part) {
            self.candidate.reservation.map(
                Site::JournalOperations,
                &mut active.staff_changes,
                1,
            )?;
        }
        if !self.order_changes.contains_key(order) {
            self.candidate
                .reservation
                .map(Site::JournalOperations, &mut self.order_changes, 1)?;
        }
        Ok(())
    }

    pub(super) fn verify_owned_staff(
        &mut self,
        part: &Occurrence,
        source: &Occurrence,
    ) -> Result<(), Failure> {
        if self.candidate.owner(source).as_ref() != Some(part) {
            return Err(Failure::InternalError);
        }
        let mut expected = if let Some(image) = self.staff_images.get(source) {
            image.as_ref().clone()
        } else {
            // Prefix scalar reads bypass candidate replacements. A first
            // recorded edit must not adopt an earlier unrecorded edit.
            let Occurrence::Prefix(entity) = source else {
                return Err(Failure::InternalError);
            };
            let Entity::Staff { staff_id } = entity.as_ref() else {
                return Err(Failure::InternalError);
            };
            let value = self
                .candidate
                .prefix
                .read_scalar(&Scalar::StaffDefinition {
                    staff_id: staff_id.clone(),
                })
                .ok_or(Failure::InternalError)?;
            // Keep frozen prefix images temporary: a genuine no-op must not
            // allocate ledger capacity or consume a reservation attempt.
            Image {
                raw_id: staff_id.as_js_string().clone(),
                kind: Kind::Staff,
                value: Some(value),
                instrument: None,
                staff_id: None,
                content_kind: None,
            }
        };
        if let Some(changes) = self.changes.get(source) {
            changes.apply_to(&mut expected)?;
        }
        if !expected.matches(&mut self.candidate, source)? {
            return Err(Failure::InternalError);
        }
        Ok(())
    }

    pub(super) fn insert_staff(
        &mut self,
        part: &Occurrence,
        staff: AdmissionStaffDefinitionV1,
        after: Option<&JsString>,
    ) -> Result<Occurrence, Failure> {
        let result = self.insert_staff_inner(part, staff, after);
        if result.is_err() {
            self.candidate.reservation.abort();
        }
        result
    }

    fn insert_staff_inner(
        &mut self,
        part: &Occurrence,
        staff: AdmissionStaffDefinitionV1,
        after: Option<&JsString>,
    ) -> Result<Occurrence, Failure> {
        self.candidate.reservation.ensure_active()?;
        let order = CandidateOrder::new(part, Children::Staffs);
        // Resolve the raw anchor before any journal reservation or mutation.
        let position = self.candidate.insertion_index(&order, after, None)?;
        self.verify_recorded_node(part)?;
        let mut expected_order = self.expected_staff_order(&order)?;
        if let Some(ids) = &mut expected_order {
            self.candidate
                .reservation
                .vec(Site::JournalOperations, ids, 1)?;
        }
        self.reserve_staff_ledger(part, &order)?;
        self.candidate
            .reservation
            .map(Site::JournalOperations, &mut self.staff_images, 1)?;
        self.candidate
            .reservation
            .vec(Site::JournalOperations, &mut self.steps, 1)?;
        let owner = self.identities.record(&mut self.candidate, part)?;
        let root = self.candidate.insert_staff(part, staff, after)?;
        let previous = orders::previous(&mut self.candidate, &order, &root)?;
        let anchor = previous
            .as_ref()
            .map(|source| self.identities.record(&mut self.candidate, source))
            .transpose()?;
        let bundle = Arc::new(StaffBundle::capture(
            &mut self.candidate,
            &mut self.identities,
            &root,
        )?);
        self.staff_images.insert(root.clone(), bundle.image.clone());
        if let Some(mut ids) = expected_order {
            if position > ids.len() {
                return Err(Failure::InternalError);
            }
            ids.insert(position, bundle.id);
            self.order_changes.insert(order, Arc::new(ids));
            if let Some(active) = self.active.get_mut(part) {
                active
                    .staff_changes
                    .insert(root.clone(), Some(bundle.clone()));
            }
        }
        self.steps.push(Step {
            forward: Operation::InsertEntity {
                owner,
                anchor,
                bundle: StoredEntityBundle::Staff(bundle.clone()),
            },
            inverse: Operation::RemoveEntity {
                owner,
                expected_anchor: anchor,
                expected: StoredEntityBundle::Staff(bundle),
            },
        });
        Ok(root)
    }

    pub(super) fn remove_staff(&mut self, raw_id: &JsString) -> Result<(), Failure> {
        let result = self.remove_staff_inner(raw_id);
        if result.is_err() {
            self.candidate.reservation.abort();
        }
        result
    }

    fn remove_staff_inner(&mut self, raw_id: &JsString) -> Result<(), Failure> {
        self.candidate.reservation.ensure_active()?;
        let root = self.candidate.resolve(Kind::Staff, raw_id)?;
        let part = self.candidate.owner(&root).ok_or(Failure::InternalError)?;
        if !self
            .candidate
            .staff_referrers_in_part(&part, raw_id)?
            .is_empty()
        {
            return Err(Failure::ReferenceConflict);
        }
        let order = CandidateOrder::new(&part, Children::Staffs);
        self.verify_owned_staff(&part, &root)?;
        let expected_order = self.expected_staff_order(&order)?;
        self.reserve_staff_ledger(&part, &order)?;
        let previous = orders::previous(&mut self.candidate, &order, &root)?;
        let anchor = previous
            .as_ref()
            .map(|source| self.identities.record(&mut self.candidate, source))
            .transpose()?;
        let owner = self.identities.record(&mut self.candidate, &part)?;
        let bundle = Arc::new(StaffBundle::capture(
            &mut self.candidate,
            &mut self.identities,
            &root,
        )?);
        self.candidate
            .reservation
            .vec(Site::JournalOperations, &mut self.steps, 1)?;
        self.candidate.hide(&root)?;
        if let Some(mut ids) = expected_order {
            let position = ids
                .iter()
                .position(|id| *id == bundle.id)
                .ok_or(Failure::InternalError)?;
            ids.remove(position);
            self.order_changes.insert(order, Arc::new(ids));
            if let Some(active) = self.active.get_mut(&part) {
                active.staff_changes.insert(root.clone(), None);
            }
        }
        self.changes.remove(&root);
        self.steps.push(Step {
            forward: Operation::RemoveEntity {
                owner,
                expected_anchor: anchor,
                expected: StoredEntityBundle::Staff(bundle.clone()),
            },
            inverse: Operation::InsertEntity {
                owner,
                anchor,
                bundle: StoredEntityBundle::Staff(bundle),
            },
        });
        Ok(())
    }
}

fn insertion_position(
    candidate: &mut Candidate<'_>,
    order: &CandidateOrder,
    anchor: Option<&Occurrence>,
) -> Result<usize, Failure> {
    let Some(anchor) = anchor else {
        return Ok(0);
    };
    if !candidate.visible(anchor)
        || candidate.kind(anchor) != Some(Kind::Staff)
        || candidate.owner(anchor).as_ref() != Some(&order.owner)
    {
        return Err(Failure::InternalError);
    }
    let mut position = 0;
    let mut found = false;
    candidate
        .visit_order(order, &mut |source, _| {
            position += 1;
            if source == anchor {
                found = true;
                return false;
            }
            true
        })
        .ok_or(Failure::InternalError)?;
    found.then_some(position).ok_or(Failure::InternalError)
}

pub(super) fn apply_staff(
    candidate: &mut Candidate<'_>,
    bindings: &mut ReplayBindings<'_>,
    owner_id: JournalId,
    anchor: Option<JournalId>,
    bundle: &StaffBundle,
    inserting: bool,
) -> Result<(), Failure> {
    candidate.reservation.ensure_active()?;
    bundle.validate()?;
    let owner = bindings.resolve(owner_id, candidate)?;
    if candidate.kind(&owner) != Some(Kind::Part) {
        return Err(Failure::InternalError);
    }
    let anchor = anchor
        .map(|id| bindings.resolve(id, candidate))
        .transpose()?;
    let order = CandidateOrder::new(&owner, Children::Staffs);
    if inserting {
        bindings.require_insert_identity(bundle.id, Kind::Staff, &bundle.image.raw_id, owner_id)?;
        let position = insertion_position(candidate, &order, anchor.as_ref())?;
        candidate.reserve_insertion(&order)?;
        let raw_id = candidate.share_existing_id(bundle.image.raw_id.clone())?;
        let source =
            candidate.add_shared_node(&owner, Kind::Staff, raw_id, bundle.image.value.clone())?;
        candidate.place_child(&order, position, source.clone())?;
        bindings.bind_inserted(candidate, &[(bundle.id, source)])?;
    } else {
        let source = bindings.resolve(bundle.id, candidate)?;
        if candidate.owner(&source).as_ref() != Some(&owner)
            || !bundle.image.matches(candidate, &source)?
            || orders::previous(candidate, &order, &source)? != anchor
        {
            return Err(Failure::InternalError);
        }
        // Do not rerun reference admission here: undo of an insertion may
        // deliberately restore an earlier temporarily unresolved raw reference.
        candidate.hide(&source)?;
        bindings.unbind_removed(candidate, bundle.id)?;
    }
    Ok(())
}
