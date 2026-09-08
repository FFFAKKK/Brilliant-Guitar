//! A Measure definition is not the owner of its Part content trees. Retain the
//! separate roots and independent order preconditions in one history operation.
use super::*;

#[cfg(test)]
#[path = "tests/measure_guards.rs"]
mod tests;

#[derive(Clone)]
pub(super) struct Tree {
    pub(super) owner: JournalId,
    pub(super) anchor: Option<JournalId>,
    absent_order: Arc<Vec<JournalId>>,
    present_order: Arc<Vec<JournalId>>,
    pub(super) image: Arc<PartBundle>,
}

#[derive(Clone)]
pub(super) struct MeasureBundle {
    pub(super) document: JournalId,
    pub(super) parts: Arc<Vec<JournalId>>,
    pub(super) definition: Tree,
    pub(super) contents: Vec<Tree>,
    // Independent command membership facts prevent a damaged table from
    // silently dropping a whole Part tree. Repeated owners remain representable
    // for the insert command's deferred coverage diagnostics.
    content_slots: Arc<Vec<(JournalId, JournalId)>>,
}

struct PartMembership {
    document: JournalId,
    ids: Arc<Vec<JournalId>>,
    sources: Vec<Occurrence>,
}

pub(super) fn collect_sources(
    candidate: &mut Candidate<'_>,
    order: &CandidateOrder,
) -> Result<Vec<Occurrence>, Failure> {
    let mut sources = Vec::new();
    let mut reservation = std::mem::take(&mut candidate.reservation);
    let visited = candidate.visit_order(order, &mut |source, _| {
        if reservation
            .vec(Site::JournalOperations, &mut sources, 1)
            .is_err()
        {
            return false;
        }
        sources.push(source.clone());
        true
    });
    candidate.reservation = reservation;
    candidate.reservation.ensure_active()?;
    visited.ok_or(Failure::InternalError)?;
    Ok(sources)
}

pub(super) fn unique_content(
    candidate: &mut Candidate<'_>,
    part: &Occurrence,
    raw: &JsString,
) -> Result<Occurrence, Failure> {
    let mut found = None;
    let mut duplicate = false;
    candidate
        .visit_order(
            &CandidateOrder::new(part, Children::Contents),
            &mut |source, id| {
                if id == raw {
                    if found.is_some() {
                        duplicate = true;
                        return false;
                    }
                    found = Some(source.clone());
                }
                true
            },
        )
        .ok_or(Failure::InternalError)?;
    if duplicate {
        return Err(Failure::InternalError);
    }
    found.ok_or(Failure::InternalError)
}

fn verify_order(
    candidate: &mut Candidate<'_>,
    bindings: &ReplayBindings<'_>,
    order: &CandidateOrder,
    ids: &[JournalId],
) -> Result<(), Failure> {
    let mut expected = Vec::new();
    candidate
        .reservation
        .vec(Site::JournalOperations, &mut expected, ids.len())?;
    for id in ids {
        expected.push(bindings.resolve(*id, candidate)?);
    }
    let mut index = 0;
    let mut matches = true;
    candidate
        .visit_order(order, &mut |source, _| {
            if expected.get(index) != Some(source) {
                matches = false;
                return false;
            }
            index += 1;
            true
        })
        .ok_or(Failure::InternalError)?;
    if !matches || index != expected.len() {
        return Err(Failure::InternalError);
    }
    Ok(())
}

impl Tree {
    fn validate(&self, candidate: &mut Candidate<'_>) -> Result<(), Failure> {
        self.image.validate(candidate)?;
        let root = self.image.nodes[0].id;
        if self.absent_order.contains(&root)
            || self.present_order.len()
                != self
                    .absent_order
                    .len()
                    .checked_add(1)
                    .ok_or(Failure::InternalError)?
        {
            return Err(Failure::InternalError);
        }
        let position = match self.anchor {
            None => 0,
            Some(anchor) => {
                self.absent_order
                    .iter()
                    .position(|id| *id == anchor)
                    .ok_or(Failure::InternalError)?
                    + 1
            }
        };
        for (index, id) in self.present_order.iter().enumerate() {
            let expected = if index == position {
                &root
            } else {
                &self.absent_order[index - usize::from(index > position)]
            };
            if id != expected || self.present_order[..index].contains(id) {
                return Err(Failure::InternalError);
            }
        }
        Ok(())
    }

    fn apply(
        &self,
        candidate: &mut Candidate<'_>,
        bindings: &mut ReplayBindings<'_>,
        inserting: bool,
    ) -> Result<(), Failure> {
        let owner = bindings.resolve(self.owner, candidate)?;
        let order = CandidateOrder::new(&owner, self.image.parent_children()?);
        let expected = if inserting {
            &self.absent_order
        } else {
            &self.present_order
        };
        verify_order(candidate, bindings, &order, expected)?;
        Operation::apply_subtree(
            candidate,
            bindings,
            self.owner,
            self.anchor,
            &self.image,
            inserting,
        )
    }
}

pub(super) fn apply_measure(
    candidate: &mut Candidate<'_>,
    bindings: &mut ReplayBindings<'_>,
    bundle: &MeasureBundle,
    inserting: bool,
) -> Result<(), Failure> {
    candidate.reservation.ensure_active()?;
    if bundle.definition.image.root_kind()? != Kind::Measure
        || bundle.definition.owner != bundle.document
        || bundle.contents.len() != bundle.content_slots.len()
    {
        return Err(Failure::InternalError);
    }
    let document = bindings.resolve(bundle.document, candidate)?;
    if document != candidate.document {
        return Err(Failure::InternalError);
    }
    verify_order(
        candidate,
        bindings,
        &CandidateOrder::new(&document, Children::Parts),
        &bundle.parts,
    )?;
    let mut seen = HashSet::new();
    for tree in std::iter::once(&bundle.definition).chain(bundle.contents.iter()) {
        tree.validate(candidate)?;
        candidate
            .reservation
            .set(Site::JournalOperations, &mut seen, tree.image.nodes.len())?;
        for node in &tree.image.nodes {
            if !seen.insert(node.id) {
                return Err(Failure::InternalError);
            }
        }
    }
    for (tree, slot) in bundle.contents.iter().zip(bundle.content_slots.iter()) {
        if tree.image.root_kind()? != Kind::Content
            || tree.image.nodes[0].image.raw_id != bundle.definition.image.nodes[0].image.raw_id
            || !bundle.parts.contains(&tree.owner)
            || *slot != (tree.owner, tree.image.nodes[0].id)
        {
            return Err(Failure::InternalError);
        }
    }
    if inserting {
        bundle.definition.apply(candidate, bindings, true)?;
        for tree in &bundle.contents {
            tree.apply(candidate, bindings, true)?;
        }
    } else {
        for tree in bundle.contents.iter().rev() {
            tree.apply(candidate, bindings, false)?;
        }
        bundle.definition.apply(candidate, bindings, false)?;
    }
    Ok(())
}

impl Recorder<'_> {
    fn measure_parts(&mut self) -> Result<PartMembership, Failure> {
        let document = self.candidate.document.clone();
        self.verify_recorded_node(&document)?;
        let order = CandidateOrder::new(&document, Children::Parts);
        let ids = self.recorded_order_ids(&order)?;
        let parts = collect_sources(&mut self.candidate, &order)?;
        for part in &parts {
            self.verify_recorded_node(part)?;
        }
        let document = self.identities.record(&mut self.candidate, &document)?;
        Ok(PartMembership {
            document,
            ids: Arc::new(ids),
            sources: parts,
        })
    }

    fn inserted_measure_tree(
        &mut self,
        order: CandidateOrder,
        position: usize,
        absent: Vec<JournalId>,
        root: &Occurrence,
    ) -> Result<Tree, Failure> {
        let owner = self.identities.record(&mut self.candidate, &order.owner)?;
        let (image, sources) =
            PartBundle::capture(&mut self.candidate, &mut self.identities, root)?;
        let image = Arc::new(image);
        self.register_birth(image.clone(), &sources)?;
        if position > absent.len() {
            return Err(Failure::InternalError);
        }
        let anchor = position.checked_sub(1).map(|index| absent[index]);
        let mut present = Vec::new();
        self.candidate
            .reservation
            .vec(Site::JournalOperations, &mut present, absent.len() + 1)?;
        present.extend_from_slice(&absent);
        present.insert(position, image.nodes[0].id);
        // Retain each exact stage: repeated payload owners can insert multiple
        // Content lifetimes into the same parent before final semantics rejects.
        self.candidate
            .reservation
            .map(Site::JournalOperations, &mut self.order_changes, 1)?;
        let present = Arc::new(present);
        self.order_changes.insert(order, present.clone());
        Ok(Tree {
            owner,
            anchor,
            absent_order: Arc::new(absent),
            present_order: present,
            image,
        })
    }

    pub(super) fn insert_measure_bundle(
        &mut self,
        definition: AdmissionMeasureDefinitionV1,
        contents: Vec<(Occurrence, Vec<AdmissionVoiceV1>)>,
        after: Option<&JsString>,
    ) -> Result<Occurrence, Failure> {
        let result = self.insert_measure_bundle_inner(definition, contents, after);
        if result.is_err() {
            self.candidate.reservation.abort();
        }
        result
    }

    fn insert_measure_bundle_inner(
        &mut self,
        definition: AdmissionMeasureDefinitionV1,
        contents: Vec<(Occurrence, Vec<AdmissionVoiceV1>)>,
        after: Option<&JsString>,
    ) -> Result<Occurrence, Failure> {
        self.candidate.reservation.ensure_active()?;
        let PartMembership {
            document,
            ids: parts,
            sources: part_sources,
        } = self.measure_parts()?;
        let global_order = CandidateOrder::new(&self.candidate.document, Children::Measures);
        let position = self.candidate.insertion_index(&global_order, after, None)?;
        let absent = self.recorded_order_ids(&global_order)?;
        let mut prepared = Vec::new();
        self.candidate
            .reservation
            .vec(Site::JournalOperations, &mut prepared, contents.len())?;
        for (part, voices) in contents {
            if !part_sources.contains(&part) {
                return Err(Failure::InternalError);
            }
            let order = CandidateOrder::new(&part, Children::Contents);
            self.verify_recorded_order(&order)?;
            let anchor = after
                .map(|raw| unique_content(&mut self.candidate, &part, raw))
                .transpose()?;
            let position =
                rhythm::insertion_position(&mut self.candidate, &order, anchor.as_ref())?;
            prepared.push((part, voices, position));
        }
        self.candidate
            .reservation
            .vec(Site::JournalOperations, &mut self.steps, 1)?;
        let mut trees = Vec::new();
        let mut slots = Vec::new();
        self.candidate
            .reservation
            .vec(Site::JournalOperations, &mut trees, prepared.len())?;
        self.candidate
            .reservation
            .vec(Site::JournalOperations, &mut slots, prepared.len())?;
        let raw = definition.id.clone();
        let root = self.candidate.insert_measure(definition, after)?;
        let definition = self.inserted_measure_tree(global_order, position, absent, &root)?;
        for (part, voices, position) in prepared {
            let order = CandidateOrder::new(&part, Children::Contents);
            let absent = self.recorded_order_ids(&order)?;
            let source = self
                .candidate
                .insert_content(&part, raw.clone(), voices, position)?;
            let tree = self.inserted_measure_tree(order, position, absent, &source)?;
            slots.push((tree.owner, tree.image.nodes[0].id));
            trees.push(tree);
        }
        let bundle = Arc::new(MeasureBundle {
            document,
            parts,
            definition,
            contents: trees,
            content_slots: Arc::new(slots),
        });
        self.steps.push(Step {
            forward: Operation::Measure {
                bundle: bundle.clone(),
                inserting: true,
            },
            inverse: Operation::Measure {
                bundle,
                inserting: false,
            },
        });
        Ok(root)
    }

    fn removed_measure_tree(&mut self, root: &Occurrence) -> Result<Tree, Failure> {
        let owner = self.candidate.owner(root).ok_or(Failure::InternalError)?;
        self.verify_recorded_node(&owner)?;
        let children = match self.candidate.kind(root) {
            Some(Kind::Measure) => Children::Measures,
            Some(Kind::Content) => Children::Contents,
            _ => return Err(Failure::InternalError),
        };
        let order = CandidateOrder::new(&owner, children);
        let present = self.recorded_order_ids(&order)?;
        let (image, sources) = self.expected_subtree(root)?;
        image.verify(&mut self.candidate, &owner, &sources)?;
        let root_id = image.nodes[0].id;
        let position = present
            .iter()
            .position(|id| *id == root_id)
            .ok_or(Failure::InternalError)?;
        let anchor = position.checked_sub(1).map(|index| present[index]);
        let mut absent = Vec::new();
        self.candidate
            .reservation
            .vec(Site::JournalOperations, &mut absent, present.len() - 1)?;
        absent.extend(present.iter().copied().filter(|id| *id != root_id));
        let owner = self.identities.record(&mut self.candidate, &owner)?;
        Ok(Tree {
            owner,
            anchor,
            absent_order: Arc::new(absent),
            present_order: Arc::new(present),
            image: Arc::new(image),
        })
    }

    pub(super) fn remove_measure_bundle(&mut self, raw: &JsString) -> Result<(), Failure> {
        let result = self.remove_measure_bundle_inner(raw);
        if result.is_err() {
            self.candidate.reservation.abort();
        }
        result
    }

    fn remove_measure_bundle_inner(&mut self, raw: &JsString) -> Result<(), Failure> {
        self.candidate.reservation.ensure_active()?;
        let root = self.candidate.resolve(Kind::Measure, raw)?;
        let PartMembership {
            document,
            ids: parts,
            sources: part_sources,
        } = self.measure_parts()?;
        let definition = self.removed_measure_tree(&root)?;
        let mut contents = Vec::new();
        let mut slots = Vec::new();
        let mut sources = Vec::new();
        self.candidate.reservation.vec(
            Site::JournalOperations,
            &mut contents,
            part_sources.len(),
        )?;
        self.candidate
            .reservation
            .vec(Site::JournalOperations, &mut slots, part_sources.len())?;
        self.candidate.reservation.vec(
            Site::JournalOperations,
            &mut sources,
            part_sources.len(),
        )?;
        for part in part_sources {
            let source = unique_content(&mut self.candidate, &part, raw)?;
            let tree = self.removed_measure_tree(&source)?;
            slots.push((tree.owner, tree.image.nodes[0].id));
            sources.push(source);
            contents.push(tree);
        }
        self.candidate
            .reservation
            .vec(Site::JournalOperations, &mut self.steps, 1)?;
        self.candidate.reservation.map(
            Site::JournalOperations,
            &mut self.order_changes,
            contents.len() + 1,
        )?;
        for (tree, source) in contents.iter().zip(&sources).rev() {
            let owner = self.candidate.owner(source).ok_or(Failure::InternalError)?;
            self.candidate.hide(source)?;
            self.order_changes.insert(
                CandidateOrder::new(&owner, Children::Contents),
                tree.absent_order.clone(),
            );
        }
        self.candidate.hide(&root)?;
        self.order_changes.insert(
            CandidateOrder::new(&self.candidate.document, Children::Measures),
            definition.absent_order.clone(),
        );
        let bundle = Arc::new(MeasureBundle {
            document,
            parts,
            definition,
            contents,
            content_slots: Arc::new(slots),
        });
        self.steps.push(Step {
            forward: Operation::Measure {
                bundle: bundle.clone(),
                inserting: false,
            },
            inverse: Operation::Measure {
                bundle,
                inserting: true,
            },
        });
        Ok(())
    }
}
