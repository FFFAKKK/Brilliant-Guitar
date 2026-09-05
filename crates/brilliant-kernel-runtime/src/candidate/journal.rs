//! Stored admission operations: scalar/raw-reference changes and Part subtrees
//! owned by this journal. This remains inside the test-only admission candidate.
//! Command preparation, final semantics, effects/segments, accounting and Store
//! adoption are integration gates, not behavior supplied by this module.

use super::identity::{
    BoundarySide, IdentityManifest, IdentityRecorder, JournalId, ReplayBindings,
};
use super::*;

mod bundle;
mod fields;
use bundle::PartBundle;
use fields::FieldChanges;

#[derive(Clone)]
enum Operation {
    ReplaceScalar {
        target: JournalId,
        expected: Arc<Value>,
        value: Arc<Value>,
    },
    UpdateReference {
        target: JournalId,
        expected: Option<Arc<str>>,
        value: Option<Arc<str>>,
    },
    InsertEntity {
        owner: JournalId,
        anchor: Option<JournalId>,
        bundle: Arc<PartBundle>,
    },
    RemoveEntity {
        owner: JournalId,
        expected_anchor: Option<JournalId>,
        expected: Arc<PartBundle>,
    },
}

struct Step {
    forward: Operation,
    inverse: Operation,
}

struct ActivePart {
    bundle: Arc<PartBundle>,
    sources: Vec<Occurrence>,
}

struct Recorder<'a> {
    candidate: Candidate<'a>,
    identities: IdentityRecorder,
    active: HashMap<Occurrence, ActivePart>,
    steps: Vec<Step>,
    changes: HashMap<Occurrence, FieldChanges>,
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

fn insertion_position(
    candidate: &mut Candidate<'_>,
    anchor: Option<&Occurrence>,
) -> Result<usize, Failure> {
    let Some(anchor) = anchor else {
        return Ok(0);
    };
    if !candidate.visible(anchor) || candidate.owner(anchor).as_ref() != Some(&candidate.document) {
        return Err(Failure::InternalError);
    }
    let mut index = 0;
    let mut found = false;
    candidate
        .visit_order(
            &CandidateOrder::new(&candidate.document.clone(), Children::Parts),
            &mut |child, _| {
                index += 1;
                if child == anchor {
                    found = true;
                    return false;
                }
                true
            },
        )
        .ok_or(Failure::InternalError)?;
    found.then_some(index).ok_or(Failure::InternalError)
}

impl<'a> Recorder<'a> {
    fn new(candidate: Candidate<'a>) -> Self {
        Self {
            candidate,
            identities: IdentityRecorder::default(),
            active: HashMap::new(),
            steps: Vec::new(),
            changes: HashMap::new(),
        }
    }

    fn insert_part(
        &mut self,
        part: AdmissionPartV1,
        after: Option<&str>,
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
        after: Option<&str>,
    ) -> Result<Occurrence, Failure> {
        self.candidate.reservation.ensure_active()?;
        self.candidate.insertion_index(
            &CandidateOrder::new(&self.candidate.document.clone(), Children::Parts),
            after,
            None,
        )?;
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
        self.steps.push(Step {
            forward: Operation::InsertEntity {
                owner,
                anchor,
                bundle: bundle.clone(),
            },
            inverse: Operation::RemoveEntity {
                owner,
                expected_anchor: anchor,
                expected: bundle.clone(),
            },
        });
        self.active
            .insert(root.clone(), ActivePart { bundle, sources });
        Ok(root)
    }

    fn remove_part(&mut self, raw_id: &str) -> Result<(), Failure> {
        let result = self.remove_part_inner(raw_id);
        if result.is_err() {
            self.candidate.reservation.abort();
        }
        result
    }

    fn remove_part_inner(&mut self, raw_id: &str) -> Result<(), Failure> {
        self.candidate.reservation.ensure_active()?;
        let root = self.candidate.resolve(Kind::Part, raw_id)?;
        // Added is not enough: this exact root must belong to this recorder.
        let active = self.active.get(&root).ok_or(Failure::InternalError)?;
        let document = self.candidate.document.clone();
        let bundle = active
            .bundle
            .patched(&mut self.candidate, &active.sources, &self.changes)?
            .map_or_else(|| active.bundle.clone(), Arc::new);
        bundle.verify(&mut self.candidate, &document, &active.sources)?;
        let previous = predecessor(&mut self.candidate, &root)?;
        let anchor = previous
            .as_ref()
            .map(|source| self.identities.record(&mut self.candidate, source))
            .transpose()?;
        let owner = self.identities.record(&mut self.candidate, &document)?;
        self.candidate
            .reservation
            .vec(Site::JournalOperations, &mut self.steps, 1)?;
        self.candidate.hide(&root)?;
        self.steps.push(Step {
            forward: Operation::RemoveEntity {
                owner,
                expected_anchor: anchor,
                expected: bundle.clone(),
            },
            inverse: Operation::InsertEntity {
                owner,
                anchor,
                bundle,
            },
        });
        if let Some(active) = self.active.remove(&root) {
            for source in active.sources {
                self.changes.remove(&source);
            }
        }
        Ok(())
    }

    // Strong locator sealing is not the missing final semantic validator.
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
        match self {
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
            } => Self::apply_part(candidate, bindings, *owner, *anchor, bundle, true),
            Self::RemoveEntity {
                owner,
                expected_anchor,
                expected,
            } => Self::apply_part(
                candidate,
                bindings,
                *owner,
                *expected_anchor,
                expected,
                false,
            ),
        }
    }

    fn apply_part(
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
        if owner != candidate.document {
            return Err(Failure::InternalError);
        }
        let anchor = anchor
            .map(|id| bindings.resolve(id, candidate))
            .transpose()?;
        if inserting {
            PartBundle::require_no_extensions(candidate, &bundle.nodes[0].image.raw_id)?;
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
            let position = insertion_position(candidate, anchor.as_ref())?;
            let mut assignments = Vec::new();
            candidate.reservation.vec(
                Site::JournalOperations,
                &mut assignments,
                bundle.nodes.len(),
            )?;
            let sources = bundle.materialize(candidate, &owner, position)?;
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
            if predecessor(candidate, &sources[0])? != anchor {
                return Err(Failure::InternalError);
            }
            bundle.verify(candidate, &owner, &sources)?;
            candidate.hide(&sources[0])?;
            bindings.unbind_removed(candidate, bundle.nodes[0].id)?;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests;
