//! Occurrence-based stored order mutations; target and anchor raw-ID resolution
//! is confined to recording preparation, never repeated during history replay.

use super::*;

#[derive(Clone)]
pub(super) struct JournalOrder {
    pub(super) owner: JournalId,
    pub(super) children: Children,
}

pub(super) fn child_orders_for(kind: Kind) -> &'static [Children] {
    match kind {
        Kind::Document => &[Children::Measures, Children::Parts],
        Kind::Part => &[Children::Staffs, Children::Contents],
        Kind::Content => &[Children::Voices],
        Kind::Voice => &[Children::Events],
        Kind::Event => &[Children::Notes],
        _ => &[],
    }
}

pub(super) fn previous(
    candidate: &mut Candidate<'_>,
    order: &CandidateOrder,
    target: &Occurrence,
) -> Result<Option<Occurrence>, Failure> {
    let mut previous = None;
    let mut found = None;
    candidate
        .visit_order(order, &mut |source, _| {
            if source == target {
                found = Some(previous.clone());
                return false;
            }
            previous = Some(source.clone());
            true
        })
        .ok_or(Failure::InternalError)?;
    found.ok_or(Failure::InternalError)
}

fn anchor_at(
    candidate: &mut Candidate<'_>,
    order: &CandidateOrder,
    target: &Occurrence,
    position: usize,
) -> Result<Option<Occurrence>, Failure> {
    if position == 0 {
        return Ok(None);
    }
    let mut index = 0;
    let mut found = None;
    candidate
        .visit_order(order, &mut |source, _| {
            if source == target {
                return true;
            }
            index += 1;
            if index == position {
                found = Some(source.clone());
                return false;
            }
            true
        })
        .ok_or(Failure::InternalError)?;
    found.map(Some).ok_or(Failure::InternalError)
}

fn position_after(
    candidate: &mut Candidate<'_>,
    order: &CandidateOrder,
    target: &Occurrence,
    anchor: Option<&Occurrence>,
) -> Result<usize, Failure> {
    let Some(anchor) = anchor else {
        return Ok(0);
    };
    if anchor == target
        || !candidate.visible(anchor)
        || candidate.owner(anchor).as_ref() != Some(&order.owner)
        || candidate.kind(anchor) != Some(order.children.child_kind())
    {
        return Err(Failure::InternalError);
    }
    let mut index = 0;
    let mut found = false;
    candidate
        .visit_order(order, &mut |source, _| {
            if source == target {
                return true;
            }
            index += 1;
            if source == anchor {
                found = true;
                return false;
            }
            true
        })
        .ok_or(Failure::InternalError)?;
    found.then_some(index).ok_or(Failure::InternalError)
}

impl Recorder<'_> {
    pub(super) fn replace_children(
        &mut self,
        order: &CandidateOrder,
        desired: &[Occurrence],
    ) -> Result<bool, Failure> {
        let result = self.replace_children_inner(order, desired);
        if result.is_err() {
            self.candidate.reservation.abort();
        }
        result
    }

    fn replace_children_inner(
        &mut self,
        order: &CandidateOrder,
        desired: &[Occurrence],
    ) -> Result<bool, Failure> {
        self.candidate.reservation.ensure_active()?;
        self.verify_recorded_node(&order.owner)?;
        self.verify_recorded_order(order)?;
        // Validate by borrowing before allocating identities or snapshots, so
        // even an unchanged request cannot admit unrecorded candidate state.
        for (index, source) in desired.iter().enumerate() {
            if desired[..index].contains(source)
                || !self.candidate.visible(source)
                || self.candidate.kind(source) != Some(order.children.child_kind())
                || self.candidate.owner(source).as_ref() != Some(&order.owner)
            {
                return Err(Failure::InternalError);
            }
            self.verify_recorded_node(source)?;
        }
        let mut count = 0;
        let mut same = true;
        let mut valid = true;
        self.candidate
            .visit_order(order, &mut |source, _| {
                valid &= desired.contains(source);
                same &= desired.get(count) == Some(source);
                count += 1;
                valid
            })
            .ok_or(Failure::InternalError)?;
        if !valid || count != desired.len() {
            return Err(Failure::InternalError);
        }
        if same {
            return Ok(false);
        }
        let owner = self.identities.record(&mut self.candidate, &order.owner)?;
        let expected = Arc::new(self.collect_ids(order)?);
        let mut next = Vec::new();
        self.candidate
            .reservation
            .vec(Site::JournalOperations, &mut next, desired.len())?;
        for source in desired {
            next.push(self.identities.record(&mut self.candidate, source)?);
        }
        let next = Arc::new(next);
        self.candidate
            .reservation
            .vec(Site::JournalOperations, &mut self.steps, 1)?;
        if !self.order_changes.contains_key(order) {
            self.candidate
                .reservation
                .map(Site::JournalOperations, &mut self.order_changes, 1)?;
        }
        publish_replacement(&mut self.candidate, order, desired)?;
        self.order_changes.insert(order.clone(), next.clone());
        let order = JournalOrder {
            owner,
            children: order.children,
        };
        self.steps.push(Step {
            forward: Operation::ReplaceOrderedChildren {
                order: order.clone(),
                expected: expected.clone(),
                next: next.clone(),
            },
            inverse: Operation::ReplaceOrderedChildren {
                order,
                expected: next,
                next: expected,
            },
        });
        Ok(true)
    }

    pub(super) fn move_child(
        &mut self,
        order: &CandidateOrder,
        target_id: &JsString,
        after: Option<&JsString>,
    ) -> Result<bool, Failure> {
        let result = self.move_child_inner(order, target_id, after);
        if result.is_err() {
            self.candidate.reservation.abort();
        }
        result
    }

    pub(super) fn collect_ids(
        &mut self,
        order: &CandidateOrder,
    ) -> Result<Vec<JournalId>, Failure> {
        let mut sources = Vec::new();
        let mut reservation = std::mem::take(&mut self.candidate.reservation);
        let visited = self.candidate.visit_order(order, &mut |source, _| {
            if reservation
                .vec(Site::JournalOperations, &mut sources, 1)
                .is_err()
            {
                return false;
            }
            sources.push(source.clone());
            true
        });
        self.candidate.reservation = reservation;
        self.candidate.reservation.ensure_active()?;
        visited.ok_or(Failure::InternalError)?;
        let mut ids = Vec::new();
        self.candidate
            .reservation
            .vec(Site::JournalOperations, &mut ids, sources.len())?;
        for source in sources {
            ids.push(self.identities.record(&mut self.candidate, &source)?);
        }
        Ok(ids)
    }

    fn move_child_inner(
        &mut self,
        order: &CandidateOrder,
        target_id: &JsString,
        after: Option<&JsString>,
    ) -> Result<bool, Failure> {
        self.candidate.reservation.ensure_active()?;
        let target = self
            .candidate
            .resolve(order.children.child_kind(), target_id)?;
        if self.candidate.owner(&target).as_ref() != Some(&order.owner) {
            return Err(Failure::TargetNotFound);
        }
        if after == Some(target_id) {
            return Err(Failure::AnchorSelfReference);
        }
        let position = self
            .candidate
            .insertion_index(order, after, Some(&target))?;
        let expected = previous(&mut self.candidate, order, &target)?;
        let anchor = anchor_at(&mut self.candidate, order, &target, position)?;
        self.verify_recorded_node(&order.owner)?;
        self.verify_recorded_node(&target)?;
        self.verify_recorded_order(order)?;
        if expected == anchor {
            return Ok(false);
        }
        self.check_effect_budget(1)?;
        let owner = self.identities.record(&mut self.candidate, &order.owner)?;
        let target_id = self.identities.record(&mut self.candidate, &target)?;
        let expected_anchor = expected
            .as_ref()
            .map(|source| self.identities.record(&mut self.candidate, source))
            .transpose()?;
        let anchor = anchor
            .as_ref()
            .map(|source| self.identities.record(&mut self.candidate, source))
            .transpose()?;
        self.candidate
            .reservation
            .vec(Site::JournalOperations, &mut self.steps, 1)?;
        let replacement = {
            if !self.order_changes.contains_key(order) {
                self.candidate.reservation.map(
                    Site::JournalOperations,
                    &mut self.order_changes,
                    1,
                )?;
            }
            let mut ids = self.recorded_order_ids(order)?;
            let from = ids
                .iter()
                .position(|id| *id == target_id)
                .ok_or(Failure::InternalError)?;
            if position >= ids.len() {
                return Err(Failure::InternalError);
            }
            ids.remove(from);
            ids.insert(position, target_id);
            Arc::new(ids)
        };
        self.candidate.move_occurrence(order, target, position)?;
        self.order_changes.insert(order.clone(), replacement);
        let order = JournalOrder {
            owner,
            children: order.children,
        };
        self.steps.push(Step {
            forward: Operation::MoveOrderedChild {
                order: order.clone(),
                target: target_id,
                expected_anchor,
                anchor,
            },
            inverse: Operation::MoveOrderedChild {
                order,
                target: target_id,
                expected_anchor: anchor,
                anchor: expected_anchor,
            },
        });
        Ok(true)
    }
}

fn publish_replacement(
    candidate: &mut Candidate<'_>,
    order: &CandidateOrder,
    desired: &[Occurrence],
) -> Result<(), Failure> {
    let mut values = Vec::new();
    candidate
        .reservation
        .vec(Site::OrderEntries, &mut values, desired.len())?;
    values.extend_from_slice(desired);
    if !candidate.orders.contains_key(order) {
        candidate
            .reservation
            .map(Site::Orders, &mut candidate.orders, 1)?;
        candidate.work.prefix_order_copies += 1;
        candidate.work.copied_entries += desired.len() as u64;
    }
    candidate.orders.insert(order.clone(), values);
    candidate.mutation_work.record_writes = candidate.mutation_work.record_writes.saturating_add(1);
    Ok(())
}

pub(super) fn apply_replace(
    candidate: &mut Candidate<'_>,
    bindings: &ReplayBindings<'_>,
    order: &JournalOrder,
    expected: &[JournalId],
    next: &[JournalId],
) -> Result<(), Failure> {
    candidate.reservation.ensure_active()?;
    let owner = bindings.resolve(order.owner, candidate)?;
    if candidate.kind(&owner) != Some(order.children.owner_kind())
        || expected == next
        || expected.len() != next.len()
    {
        return Err(Failure::InternalError);
    }
    let order = CandidateOrder::new(&owner, order.children);
    let mut sources = Vec::new();
    candidate
        .reservation
        .vec(Site::JournalOperations, &mut sources, expected.len())?;
    for (index, id) in expected.iter().enumerate() {
        if expected[..index].contains(id) || !next.contains(id) {
            return Err(Failure::InternalError);
        }
        let source = bindings.resolve(*id, candidate)?;
        if candidate.kind(&source) != Some(order.children.child_kind())
            || candidate.owner(&source).as_ref() != Some(&owner)
            || sources.contains(&source)
        {
            return Err(Failure::InternalError);
        }
        sources.push(source);
    }
    let mut index = 0;
    let mut matches = true;
    candidate
        .visit_order(&order, &mut |source, _| {
            matches &= sources.get(index) == Some(source);
            index += 1;
            matches
        })
        .ok_or(Failure::InternalError)?;
    if !matches || index != sources.len() {
        return Err(Failure::InternalError);
    }
    let mut desired = Vec::new();
    candidate
        .reservation
        .vec(Site::JournalOperations, &mut desired, next.len())?;
    for id in next {
        let index = expected
            .iter()
            .position(|expected| expected == id)
            .ok_or(Failure::InternalError)?;
        desired.push(sources[index].clone());
    }
    publish_replacement(candidate, &order, &desired)
}

pub(super) fn apply_move(
    candidate: &mut Candidate<'_>,
    bindings: &ReplayBindings<'_>,
    order: &JournalOrder,
    target: JournalId,
    expected_anchor: Option<JournalId>,
    anchor: Option<JournalId>,
) -> Result<(), Failure> {
    candidate.reservation.ensure_active()?;
    if expected_anchor == anchor {
        return Err(Failure::InternalError);
    }
    let owner = bindings.resolve(order.owner, candidate)?;
    let target = bindings.resolve(target, candidate)?;
    if candidate.kind(&owner) != Some(order.children.owner_kind())
        || candidate.kind(&target) != Some(order.children.child_kind())
        || candidate.owner(&target).as_ref() != Some(&owner)
    {
        return Err(Failure::InternalError);
    }
    let expected = expected_anchor
        .map(|id| bindings.resolve(id, candidate))
        .transpose()?;
    let anchor = anchor
        .map(|id| bindings.resolve(id, candidate))
        .transpose()?;
    let order = CandidateOrder::new(&owner, order.children);
    if previous(candidate, &order, &target)? != expected {
        return Err(Failure::InternalError);
    }
    let position = position_after(candidate, &order, &target, anchor.as_ref())?;
    candidate.move_occurrence(&order, target, position)
}
