//! Stored admission operations retain immutable subtree images and occurrence
//! lifetimes across edits, moves and deletion. Command preparation and accounting
//! feed one final Store adoption and combined typed-prefix/candidate history.
//! These internals are shared by native session submission and stored replay.

use brilliant_core_types::JsString;

use super::identity::{
    BoundarySide, IdentityManifest, IdentityRecorder, JournalId, ReplayBindings,
};
use super::*;

mod accounting;
mod bundle;
mod combined;
mod dispatch;
mod effect_budget;
mod execution;
mod expected;
mod expected_extensions;
mod extension_edits;
mod fields;
mod measure;
mod measure_commands;
mod orders;
mod part;
mod range;
mod range_selection;
mod rhythm;
mod staff;
use bundle::PartBundle;
use fields::FieldChanges;
use orders::JournalOrder;
use staff::StaffBundle;

pub(crate) use execution::{
    CandidateExecution, CandidateHistory, ModuleSegmentSource, PreparedCandidate,
};

#[derive(Clone)]
enum StoredEntityBundle {
    Part(Arc<PartBundle>),
    Staff(Arc<StaffBundle>),
    Voice(Arc<PartBundle>),
    Event(Arc<PartBundle>),
}

#[derive(Clone)]
enum Operation {
    Extension(Arc<extension_edits::StoredExtensionEdit>),
    Measure {
        bundle: Arc<measure::MeasureBundle>,
        inserting: bool,
    },
    ReplaceOrderedChildren {
        order: JournalOrder,
        expected: Arc<Vec<JournalId>>,
        next: Arc<Vec<JournalId>>,
    },
    MoveOrderedChild {
        order: JournalOrder,
        target: JournalId,
        expected_anchor: Option<JournalId>,
        anchor: Option<JournalId>,
    },
    ReplaceScalar {
        target: JournalId,
        expected: Arc<Value>,
        value: Arc<Value>,
    },
    UpdateReference {
        target: JournalId,
        expected: Option<JsString>,
        value: Option<JsString>,
    },
    InsertEntity {
        owner: JournalId,
        anchor: Option<JournalId>,
        bundle: StoredEntityBundle,
    },
    RemoveEntity {
        owner: JournalId,
        expected_anchor: Option<JournalId>,
        expected: StoredEntityBundle,
    },
}

struct Step {
    forward: Operation,
    inverse: Operation,
}

struct ActivePart {
    #[cfg(test)]
    bundle: Arc<PartBundle>,
    #[cfg(test)]
    sources: Vec<Occurrence>,
    staff_changes: HashMap<Occurrence, Option<Arc<StaffBundle>>>,
}

struct Recorder<'a> {
    extension_ledger: Option<extension_edits::ExtensionLedger>,
    effect_budget: Option<u64>,
    candidate: Candidate<'a>,
    identities: IdentityRecorder,
    active: HashMap<Occurrence, ActivePart>,
    staff_images: HashMap<Occurrence, Arc<bundle::Image>>,
    birth_nodes: HashMap<Occurrence, expected::NodeOrigin>,
    recorded_extension_deaths: HashSet<crate::overlay::ExtensionKeyV1>,
    steps: Vec<Step>,
    changes: HashMap<Occurrence, FieldChanges>,
    order_changes: HashMap<CandidateOrder, Arc<Vec<JournalId>>>,
}

enum Direction {
    Forward,
    Inverse,
}

struct Journal {
    identities: IdentityManifest,
    steps: Vec<Step>,
}

fn predecessor(
    candidate: &mut Candidate<'_>,
    target: &Occurrence,
) -> Result<Option<Occurrence>, Failure> {
    let mut previous = None;
    let mut result = None;
    candidate
        .visit_order(
            &CandidateOrder::new(&candidate.document.clone(), Children::Parts),
            &mut |child, _| {
                if child == target {
                    result = Some(previous.clone());
                    return false;
                }
                previous = Some(child.clone());
                true
            },
        )
        .ok_or(Failure::InternalError)?;
    result.ok_or(Failure::InternalError)
}

impl<'a> Recorder<'a> {
    /// Internal finalization vertical slice: assess before sealing identities,
    /// bind actual operations to this journal, then produce an owned Store plan.
    /// Public command dispatch and resource accounting remain separate
    /// integration work before native activation.
    #[cfg(test)]
    fn prepare_final_commit(
        self,
        store: &crate::store::LiveScoreStore,
        version: brilliant_core_types::DocumentVersionV1,
    ) -> Result<
        (
            Option<crate::transaction::PreparedFinalStateCommitV1>,
            crate::change_set::ChangeSetV1,
            Journal,
        ),
        super::adoption::FinalizationFailure,
    > {
        self.prepare_final_commit_with_metrics(store, version)
            .map_err(|(failure, _)| failure)
    }

    #[expect(
        clippy::result_large_err,
        reason = "failure metrics returned without allocation, including capacity failures"
    )]
    fn prepare_final_commit_with_metrics(
        self,
        store: &crate::store::LiveScoreStore,
        version: brilliant_core_types::DocumentVersionV1,
    ) -> Result<
        (
            Option<crate::transaction::PreparedFinalStateCommitV1>,
            crate::change_set::ChangeSetV1,
            Journal,
        ),
        (
            super::adoption::FinalizationFailure,
            brilliant_kernel_contracts::KernelStage3MetricsV1,
        ),
    > {
        let mut final_view = self.candidate.validate_final_with_metrics()?;
        let identities = final_view
            .seal_identities(self.identities)
            .map_err(|failure| {
                (
                    super::adoption::FinalizationFailure::Command(failure),
                    final_view.replay_work(),
                )
            })?;
        let journal = Journal {
            identities,
            steps: self.steps,
        };
        let (plan, prefix) =
            final_view.prepare_commit_with_metrics(store, version, journal.steps.len() as u64)?;
        Ok((plan, prefix, journal))
    }

    fn new(candidate: Candidate<'a>) -> Self {
        Self {
            extension_ledger: None,
            effect_budget: None,
            candidate,
            identities: IdentityRecorder::default(),
            active: HashMap::new(),
            staff_images: HashMap::new(),
            birth_nodes: HashMap::new(),
            recorded_extension_deaths: HashSet::new(),
            steps: Vec::new(),
            changes: HashMap::new(),
            order_changes: HashMap::new(),
        }
    }

    fn insert_part(
        &mut self,
        part: AdmissionPartV1,
        after: Option<&JsString>,
    ) -> Result<Occurrence, Failure> {
        let result = self.insert_part_inner(part, after);
        if result.is_err() {
            self.candidate.reservation.abort();
        }
        result
    }

    fn insert_part_inner(
        &mut self,
        part: AdmissionPartV1,
        after: Option<&JsString>,
    ) -> Result<Occurrence, Failure> {
        self.candidate.reservation.ensure_active()?;
        let order = CandidateOrder::new(&self.candidate.document.clone(), Children::Parts);
        let position = self.candidate.insertion_index(&order, after, None)?;
        self.verify_recorded_node(&order.owner)?;
        let mut expected_order = self.recorded_order_ids(&order)?;
        self.candidate
            .reservation
            .vec(Site::JournalOperations, &mut expected_order, 1)?;
        self.candidate
            .reservation
            .map(Site::JournalOperations, &mut self.order_changes, 1)?;
        self.candidate
            .reservation
            .vec(Site::JournalOperations, &mut self.steps, 1)?;
        self.candidate
            .reservation
            .map(Site::JournalOperations, &mut self.active, 1)?;
        let root = self.candidate.insert_part(part, after)?;
        let previous = predecessor(&mut self.candidate, &root)?;
        let anchor = previous
            .as_ref()
            .map(|source| self.identities.record(&mut self.candidate, source))
            .transpose()?;
        let document = self.candidate.document.clone();
        let owner = self.identities.record(&mut self.candidate, &document)?;
        let (bundle, sources) =
            PartBundle::capture(&mut self.candidate, &mut self.identities, &root)?;
        let bundle = Arc::new(bundle);
        for (node, source) in bundle.nodes.iter().zip(&sources) {
            if node.image.kind == Kind::Staff {
                self.candidate.reservation.map(
                    Site::JournalOperations,
                    &mut self.staff_images,
                    1,
                )?;
                self.staff_images.insert(source.clone(), node.image.clone());
            }
        }
        self.register_birth(bundle.clone(), &sources)?;
        expected_order.insert(position, bundle.nodes[0].id);
        self.order_changes.insert(order, Arc::new(expected_order));
        self.steps.push(Step {
            forward: Operation::InsertEntity {
                owner,
                anchor,
                bundle: StoredEntityBundle::Part(bundle.clone()),
            },
            inverse: Operation::RemoveEntity {
                owner,
                expected_anchor: anchor,
                expected: StoredEntityBundle::Part(bundle.clone()),
            },
        });
        self.active.insert(
            root.clone(),
            ActivePart {
                #[cfg(test)]
                bundle,
                #[cfg(test)]
                sources,
                staff_changes: HashMap::new(),
            },
        );
        Ok(root)
    }

    #[cfg(test)]
    fn remove_part(&mut self, raw_id: &JsString) -> Result<(), Failure> {
        let result = self.remove_part_inner(raw_id);
        if result.is_err() {
            self.candidate.reservation.abort();
        }
        result
    }

    fn remove_part_inner(&mut self, raw_id: &JsString) -> Result<(), Failure> {
        self.candidate.reservation.ensure_active()?;
        let root = self.candidate.resolve(Kind::Part, raw_id)?;
        let document = self.candidate.document.clone();
        self.verify_recorded_node(&document)?;
        let order = CandidateOrder::new(&document, Children::Parts);
        let mut expected_order = self.recorded_order_ids(&order)?;
        let (bundle, sources) = self.expected_subtree(&root)?;
        let bundle = Arc::new(bundle);
        bundle.verify(&mut self.candidate, &document, &sources)?;
        let previous = predecessor(&mut self.candidate, &root)?;
        let anchor = previous
            .as_ref()
            .map(|source| self.identities.record(&mut self.candidate, source))
            .transpose()?;
        let owner = self.identities.record(&mut self.candidate, &document)?;
        self.candidate
            .reservation
            .map(Site::JournalOperations, &mut self.order_changes, 1)?;
        self.candidate
            .reservation
            .vec(Site::JournalOperations, &mut self.steps, 1)?;
        self.reserve_recorded_extension_deaths(&bundle.extensions)?;
        self.candidate
            .remove_part_extensions(&root, &bundle.extensions)?;
        self.candidate.hide(&root)?;
        self.record_extension_deaths(&bundle.extensions);
        let position = expected_order
            .iter()
            .position(|id| *id == bundle.nodes[0].id)
            .ok_or(Failure::InternalError)?;
        expected_order.remove(position);
        self.order_changes.insert(order, Arc::new(expected_order));
        self.steps.push(Step {
            forward: Operation::RemoveEntity {
                owner,
                expected_anchor: anchor,
                expected: StoredEntityBundle::Part(bundle.clone()),
            },
            inverse: Operation::InsertEntity {
                owner,
                anchor,
                bundle: StoredEntityBundle::Part(bundle.clone()),
            },
        });
        if let Some(active) = self.active.remove(&root) {
            for source in active.staff_changes.keys() {
                self.changes.remove(source);
            }
        }
        for (node, source) in bundle.nodes.iter().zip(sources) {
            self.changes.remove(&source);
            for children in orders::child_orders_for(node.image.kind) {
                self.order_changes
                    .remove(&CandidateOrder::new(&source, *children));
            }
        }
        Ok(())
    }

    // Strong locator sealing is not the missing final semantic validator.
    #[cfg(test)]
    fn finish(mut self) -> Result<(Candidate<'a>, Journal), Failure> {
        let identities = self.identities.finish(&mut self.candidate)?;
        Ok((
            self.candidate,
            Journal {
                identities,
                steps: self.steps,
            },
        ))
    }
}

impl Journal {
    fn replay(&self, candidate: &mut Candidate<'_>, direction: Direction) -> Result<(), Failure> {
        let result = self.replay_inner(candidate, direction);
        // Some fallible binding/collection steps follow private node writes.
        // Fail closed even for an invariant error, not just try_reserve failure.
        if result.is_err() {
            candidate.reservation.abort();
        }
        result
    }

    fn replay_inner(
        &self,
        candidate: &mut Candidate<'_>,
        direction: Direction,
    ) -> Result<(), Failure> {
        candidate.reservation.ensure_active()?;
        let side = match direction {
            Direction::Forward => BoundarySide::SuffixStart,
            Direction::Inverse => BoundarySide::SuffixEnd,
        };
        let mut bindings = ReplayBindings::at(&self.identities, side, candidate)?;
        match direction {
            Direction::Forward => {
                for step in &self.steps {
                    step.forward.apply(candidate, &mut bindings)?;
                }
            }
            Direction::Inverse => {
                for step in self.steps.iter().rev() {
                    step.inverse.apply(candidate, &mut bindings)?;
                }
            }
        }
        Ok(())
    }
}

impl Operation {
    fn apply(
        &self,
        candidate: &mut Candidate<'_>,
        bindings: &mut ReplayBindings<'_>,
    ) -> Result<(), Failure> {
        let result = self.apply_inner(candidate, bindings);
        if result.is_err() {
            candidate.reservation.abort();
        }
        result
    }

    fn apply_inner(
        &self,
        candidate: &mut Candidate<'_>,
        bindings: &mut ReplayBindings<'_>,
    ) -> Result<(), Failure> {
        match self {
            Self::Extension(edit) => edit.apply(candidate, bindings),
            Self::Measure { bundle, inserting } => {
                measure::apply_measure(candidate, bindings, bundle, *inserting)
            }
            Self::ReplaceOrderedChildren {
                order,
                expected,
                next,
            } => orders::apply_replace(candidate, bindings, order, expected, next),
            Self::MoveOrderedChild {
                order,
                target,
                expected_anchor,
                anchor,
            } => orders::apply_move(
                candidate,
                bindings,
                order,
                *target,
                *expected_anchor,
                *anchor,
            ),
            Self::ReplaceScalar {
                target,
                expected,
                value,
            } => fields::apply_scalar(candidate, bindings, *target, expected, value),
            Self::UpdateReference {
                target,
                expected,
                value,
            } => fields::apply_reference(candidate, bindings, *target, expected, value),
            Self::InsertEntity {
                owner,
                anchor,
                bundle,
            } => Self::apply_entity(candidate, bindings, *owner, *anchor, bundle, true),
            Self::RemoveEntity {
                owner,
                expected_anchor,
                expected,
            } => Self::apply_entity(
                candidate,
                bindings,
                *owner,
                *expected_anchor,
                expected,
                false,
            ),
        }
    }

    fn apply_entity(
        candidate: &mut Candidate<'_>,
        bindings: &mut ReplayBindings<'_>,
        owner: JournalId,
        anchor: Option<JournalId>,
        bundle: &StoredEntityBundle,
        inserting: bool,
    ) -> Result<(), Failure> {
        match bundle {
            StoredEntityBundle::Part(bundle) if bundle.root_kind()? == Kind::Part => {
                Self::apply_subtree(candidate, bindings, owner, anchor, bundle, inserting)
            }
            StoredEntityBundle::Staff(bundle) => {
                staff::apply_staff(candidate, bindings, owner, anchor, bundle, inserting)
            }
            StoredEntityBundle::Voice(bundle) if bundle.root_kind()? == Kind::Voice => {
                Self::apply_subtree(candidate, bindings, owner, anchor, bundle, inserting)
            }
            StoredEntityBundle::Event(bundle) if bundle.root_kind()? == Kind::Event => {
                Self::apply_subtree(candidate, bindings, owner, anchor, bundle, inserting)
            }
            _ => Err(Failure::InternalError),
        }
    }

    fn apply_subtree(
        candidate: &mut Candidate<'_>,
        bindings: &mut ReplayBindings<'_>,
        owner_id: JournalId,
        anchor: Option<JournalId>,
        bundle: &PartBundle,
        inserting: bool,
    ) -> Result<(), Failure> {
        candidate.reservation.ensure_active()?;
        bundle.validate(candidate)?;
        let owner = bindings.resolve(owner_id, candidate)?;
        let children = bundle.parent_children()?;
        if candidate.kind(&owner) != Some(children.owner_kind()) {
            return Err(Failure::InternalError);
        }
        let anchor = anchor
            .map(|id| bindings.resolve(id, candidate))
            .transpose()?;
        if inserting {
            for node in &bundle.nodes {
                let parent = node
                    .parent
                    .map_or(owner_id, |parent| bundle.nodes[parent].id);
                bindings.require_insert_identity(
                    node.id,
                    node.image.kind,
                    &node.image.raw_id,
                    parent,
                )?;
            }
            let position = rhythm::insertion_position(
                candidate,
                &CandidateOrder::new(&owner, children),
                anchor.as_ref(),
            )?;
            let mut assignments = Vec::new();
            candidate.reservation.vec(
                Site::JournalOperations,
                &mut assignments,
                bundle.nodes.len(),
            )?;
            let sources = bundle.materialize(candidate, &owner, position)?;
            if bundle.root_kind()? == Kind::Part {
                candidate.insert_part_extensions(&sources[0], &bundle.extensions)?;
            }
            bundle.verify(candidate, &owner, &sources)?;
            assignments.extend(
                bundle
                    .nodes
                    .iter()
                    .zip(sources)
                    .map(|(node, source)| (node.id, source)),
            );
            bindings.bind_inserted(candidate, &assignments)?;
        } else {
            let mut sources = Vec::new();
            candidate
                .reservation
                .vec(Site::JournalOperations, &mut sources, bundle.nodes.len())?;
            for node in &bundle.nodes {
                sources.push(bindings.resolve(node.id, candidate)?);
            }
            if orders::previous(
                candidate,
                &CandidateOrder::new(&owner, children),
                &sources[0],
            )? != anchor
            {
                return Err(Failure::InternalError);
            }
            bundle.verify(candidate, &owner, &sources)?;
            if bundle.root_kind()? == Kind::Part {
                candidate.remove_part_extensions_preserving(
                    &sources[0],
                    &bundle.extensions,
                    &bundle.preserved_extension_keys,
                )?;
            }
            candidate.hide(&sources[0])?;
            bindings.unbind_removed(candidate, bundle.nodes[0].id)?;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests;
