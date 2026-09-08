//! Recording preconditions come from the frozen prefix or immutable births,
//! combined only with deltas that this recorder has already journaled.
use super::*;
use bundle::{BundleNode, Image};

pub(super) struct NodeOrigin {
    bundle: Arc<PartBundle>,
    index: usize,
    owner: Occurrence,
}

fn parent_children(kind: Kind) -> Option<Children> {
    Some(match kind {
        Kind::Document => return None,
        Kind::Measure => Children::Measures,
        Kind::Part => Children::Parts,
        Kind::Staff => Children::Staffs,
        Kind::Content => Children::Contents,
        Kind::Voice => Children::Voices,
        Kind::Event => Children::Events,
        Kind::Note => Children::Notes,
    })
}

impl Recorder<'_> {
    pub(super) fn register_birth(
        &mut self,
        bundle: Arc<PartBundle>,
        sources: &[Occurrence],
    ) -> Result<(), Failure> {
        self.candidate.reservation.ensure_active()?;
        if bundle.nodes.len() != sources.len() || sources.is_empty() {
            return Err(Failure::InternalError);
        }
        let mut seen = HashSet::new();
        self.candidate
            .reservation
            .set(Site::JournalOperations, &mut seen, sources.len())?;
        // Validate the whole mapping before publishing any origin entries.
        for (index, (node, source)) in bundle.nodes.iter().zip(sources).enumerate() {
            if !matches!(source, Occurrence::Added(_))
                || self.birth_nodes.contains_key(source)
                || !seen.insert(source.clone())
                || self.identities.source_of(node.id) != Some(source)
                || !self.candidate.visible(source)
            {
                return Err(Failure::InternalError);
            }
            let owner = self.candidate.owner(source).ok_or(Failure::InternalError)?;
            if let Some(parent) = node.parent
                && (parent >= index || sources.get(parent) != Some(&owner))
            {
                return Err(Failure::InternalError);
            }
        }
        self.candidate.reservation.map(
            Site::JournalOperations,
            &mut self.birth_nodes,
            sources.len(),
        )?;
        for (index, source) in sources.iter().enumerate() {
            let owner = self.candidate.owner(source).ok_or(Failure::InternalError)?;
            self.birth_nodes.insert(
                source.clone(),
                NodeOrigin {
                    bundle: bundle.clone(),
                    index,
                    owner,
                },
            );
        }
        Ok(())
    }

    fn original_image(&self, source: &Occurrence) -> Result<Image, Failure> {
        if let Occurrence::Added(_) = source {
            if let Some(origin) = self.birth_nodes.get(source) {
                return origin
                    .bundle
                    .nodes
                    .get(origin.index)
                    .map(|node| node.image.as_ref().clone())
                    .ok_or(Failure::InternalError);
            }
            return self
                .staff_images
                .get(source)
                .map(|image| image.as_ref().clone())
                .ok_or(Failure::InternalError);
        }
        let kind = self.candidate.kind(source).ok_or(Failure::InternalError)?;
        let scalar = match source {
            Occurrence::Prefix(entity) => Some(match entity.as_ref() {
                Entity::Document { document_id } => Scalar::DocumentMetadata {
                    document_id: document_id.clone(),
                },
                Entity::Measure { measure_id } => Scalar::MeasureDefinition {
                    measure_id: measure_id.clone(),
                },
                Entity::Part { part_id } => Scalar::PartName {
                    part_id: part_id.clone(),
                },
                Entity::Staff { staff_id } => Scalar::StaffDefinition {
                    staff_id: staff_id.clone(),
                },
                Entity::Voice { voice_id } => Scalar::VoiceSequenceStart {
                    voice_id: voice_id.clone(),
                },
                Entity::Event { event_id } => Scalar::EventNoteValue {
                    event_id: event_id.clone(),
                },
                Entity::Note { note_id } => Scalar::NoteWrittenPitch {
                    note_id: note_id.clone(),
                },
            }),
            Occurrence::PrefixContent { .. } => None,
            Occurrence::Added(_) => unreachable!(),
        };
        let value = scalar
            .as_ref()
            .map(|address| {
                self.candidate
                    .prefix
                    .frozen_read_scalar(address)
                    .ok_or(Failure::InternalError)
            })
            .transpose()?;
        let mut image = Image {
            raw_id: self
                .candidate
                .raw_id(source)
                .ok_or(Failure::InternalError)?
                .clone(),
            kind,
            value,
            instrument: None,
            staff_id: None,
            content_kind: None,
        };
        if let Occurrence::Prefix(entity) = source {
            match entity.as_ref() {
                Entity::Part { part_id } => {
                    let Some(Value::PartInstrument(value)) = self
                        .candidate
                        .prefix
                        .frozen_read_scalar(&Scalar::PartInstrument {
                            part_id: part_id.clone(),
                        })
                    else {
                        return Err(Failure::InternalError);
                    };
                    image.instrument = Some(value);
                }
                Entity::Voice { voice_id } => {
                    let Some(ReferenceValueV1::StableId(id)) = self
                        .candidate
                        .prefix
                        .read_reference(&Reference::VoiceDefaultStaff {
                            voice_id: voice_id.clone(),
                        })
                    else {
                        return Err(Failure::InternalError);
                    };
                    image.staff_id = Some(id.as_js_string().clone());
                }
                Entity::Event { event_id } => {
                    let Some(ReferenceValueV1::OptionalStableId(id)) = self
                        .candidate
                        .prefix
                        .read_reference(&Reference::EventStaffAssignment {
                            event_id: event_id.clone(),
                        })
                    else {
                        return Err(Failure::InternalError);
                    };
                    image.staff_id = id.map(|id| id.as_js_string().clone());
                    image.content_kind = Some(
                        self.candidate
                            .prefix
                            .frozen_read_event_content_kind(event_id)
                            .ok_or(Failure::InternalError)?,
                    );
                }
                _ => {}
            }
        }
        Ok(image)
    }

    fn recorded_image(&self, source: &Occurrence) -> Result<Image, Failure> {
        let mut image = self.original_image(source)?;
        if let Some(change) = self.changes.get(source) {
            change.apply_to(&mut image)?;
        }
        Ok(image)
    }

    // No candidate member is promoted into an expected identity here. Prefix
    // lists are borrowed directly; birth lists name immutable bundle nodes.
    fn visit_recorded_order(
        &self,
        order: &CandidateOrder,
        visitor: &mut dyn FnMut(&Occurrence) -> bool,
    ) -> Result<(), Failure> {
        if let Some(ids) = self.order_changes.get(order) {
            for id in ids.iter() {
                let source = self
                    .identities
                    .source_of(*id)
                    .ok_or(Failure::InternalError)?;
                if !visitor(source) {
                    break;
                }
            }
            return Ok(());
        }
        if let Occurrence::Added(_) = &order.owner {
            let origin = self
                .birth_nodes
                .get(&order.owner)
                .ok_or(Failure::InternalError)?;
            let node = origin
                .bundle
                .nodes
                .get(origin.index)
                .ok_or(Failure::InternalError)?;
            let (_, children) = node
                .orders
                .iter()
                .find(|(kind, _)| *kind == order.children)
                .ok_or(Failure::InternalError)?;
            for index in children.iter() {
                let child = origin
                    .bundle
                    .nodes
                    .get(*index)
                    .ok_or(Failure::InternalError)?;
                let source = self
                    .identities
                    .source_of(child.id)
                    .ok_or(Failure::InternalError)?;
                if !visitor(source) {
                    break;
                }
            }
            return Ok(());
        }
        let prefix = order.prefix_order().ok_or(Failure::InternalError)?;
        self.candidate
            .prefix
            .visit_order(&prefix, &mut |id| visitor(&order.prefix_child(id)))
            .ok_or(Failure::InternalError)
    }

    pub(super) fn verify_recorded_order(&self, order: &CandidateOrder) -> Result<(), Failure> {
        self.candidate.reservation.ensure_active()?;
        if !self.candidate.visible(&order.owner)
            || self.candidate.kind(&order.owner) != Some(order.children.owner_kind())
        {
            return Err(Failure::InternalError);
        }
        if let Some(current) = self.candidate.orders.get(order) {
            let mut actual = current
                .iter()
                .filter(|source| self.candidate.visible(source));
            let mut matches = true;
            self.visit_recorded_order(order, &mut |source| {
                matches = actual.next() == Some(source)
                    && self.candidate.kind(source) == Some(order.children.child_kind())
                    && self.candidate.owner(source).as_ref() == Some(&order.owner);
                matches
            })?;
            if !matches || actual.next().is_some() {
                return Err(Failure::InternalError);
            }
        } else {
            // Hiding a prefix child need not materialize its parent list. Match
            // that filtered frozen stream against the independently saved IDs.
            if matches!(order.owner, Occurrence::Added(_)) {
                return Err(Failure::InternalError);
            }
            if let Some(ids) = self.order_changes.get(order) {
                let mut expected = ids.iter();
                let mut matches = true;
                let prefix = order.prefix_order().ok_or(Failure::InternalError)?;
                self.candidate
                    .prefix
                    .visit_order(&prefix, &mut |id| {
                        let source = order.prefix_child(id);
                        if !self.candidate.visible(&source) {
                            return true;
                        }
                        matches = expected
                            .next()
                            .and_then(|id| self.identities.source_of(*id))
                            == Some(&source)
                            && self.candidate.kind(&source) == Some(order.children.child_kind())
                            && self.candidate.owner(&source).as_ref() == Some(&order.owner);
                        matches
                    })
                    .ok_or(Failure::InternalError)?;
                return if matches && expected.next().is_none() {
                    Ok(())
                } else {
                    Err(Failure::InternalError)
                };
            }
            let mut matches = true;
            self.visit_recorded_order(order, &mut |source| {
                matches = self.candidate.visible(source)
                    && self.candidate.kind(source) == Some(order.children.child_kind())
                    && self.candidate.owner(source).as_ref() == Some(&order.owner);
                matches
            })?;
            if !matches {
                return Err(Failure::InternalError);
            }
        }
        Ok(())
    }

    pub(super) fn verify_recorded_node(&mut self, source: &Occurrence) -> Result<(), Failure> {
        self.candidate.reservation.ensure_active()?;
        let image = self.recorded_image(source)?;
        if !image.matches(&mut self.candidate, source)? {
            return Err(Failure::InternalError);
        }
        if let Some(origin) = self.birth_nodes.get(source)
            && self.candidate.owner(source).as_ref() != Some(&origin.owner)
        {
            return Err(Failure::InternalError);
        }
        if let Some(children) = parent_children(image.kind) {
            let owner = self.candidate.owner(source).ok_or(Failure::InternalError)?;
            let order = CandidateOrder::new(&owner, children);
            self.verify_recorded_order(&order)?;
            let mut found = false;
            self.visit_recorded_order(&order, &mut |child| {
                found = child == source;
                !found
            })?;
            if !found {
                return Err(Failure::InternalError);
            }
        }
        Ok(())
    }

    pub(super) fn recorded_order_ids(
        &mut self,
        order: &CandidateOrder,
    ) -> Result<Vec<JournalId>, Failure> {
        self.verify_recorded_order(order)?;
        self.collect_ids(order)
    }

    pub(super) fn expected_subtree(
        &mut self,
        root: &Occurrence,
    ) -> Result<(PartBundle, Vec<Occurrence>), Failure> {
        self.candidate.reservation.ensure_active()?;
        if !matches!(
            self.candidate.kind(root),
            Some(Kind::Part | Kind::Voice | Kind::Event)
        ) {
            return Err(Failure::InternalError);
        }
        let mut nodes = Vec::new();
        let mut sources = Vec::new();
        let mut seen = HashSet::new();
        self.append_expected(root, None, &mut nodes, &mut sources, &mut seen, 0)?;
        let bundle = PartBundle { nodes };
        bundle.validate(&mut self.candidate)?;
        let owner = self.candidate.owner(root).ok_or(Failure::InternalError)?;
        bundle.verify(&mut self.candidate, &owner, &sources)?;
        Ok((bundle, sources))
    }

    fn append_expected(
        &mut self,
        source: &Occurrence,
        parent: Option<usize>,
        nodes: &mut Vec<BundleNode>,
        sources: &mut Vec<Occurrence>,
        seen: &mut HashSet<Occurrence>,
        depth: usize,
    ) -> Result<usize, Failure> {
        if depth >= 7 {
            return Err(Failure::InternalError);
        }
        self.candidate
            .reservation
            .set(Site::JournalOperations, seen, 1)?;
        if !seen.insert(source.clone()) {
            return Err(Failure::InternalError);
        }
        self.verify_recorded_node(source)?;
        let image = self.recorded_image(source)?;
        let kind = image.kind;
        let origin = self
            .birth_nodes
            .get(source)
            .and_then(|origin| origin.bundle.nodes.get(origin.index))
            .map(|node| (node.image.clone(), node.orders.clone()));
        let original_image = origin
            .as_ref()
            .map(|(image, _)| image)
            .or_else(|| self.staff_images.get(source));
        let image = match original_image {
            Some(original) if original.as_ref() == &image => original.clone(),
            _ => Arc::new(image),
        };
        let id = self.identities.record(&mut self.candidate, source)?;
        self.candidate
            .reservation
            .vec(Site::JournalOperations, nodes, 1)?;
        self.candidate
            .reservation
            .vec(Site::JournalOperations, sources, 1)?;
        let index = nodes.len();
        sources.push(source.clone());
        nodes.push(BundleNode {
            id,
            parent,
            image,
            orders: Arc::new(Vec::new()),
        });
        let mut orders = Vec::new();
        self.candidate.reservation.vec(
            Site::JournalOperations,
            &mut orders,
            orders::child_orders_for(kind).len(),
        )?;
        for children in orders::child_orders_for(kind) {
            let order = CandidateOrder::new(source, *children);
            self.verify_recorded_order(&order)?;
            let mut child_sources = Vec::new();
            // Stage from immutable expectations before recursively mutating the
            // identity recorder; every temporary container is reservation-bound.
            let mut reservation = std::mem::take(&mut self.candidate.reservation);
            let result = self.visit_recorded_order(&order, &mut |child| {
                if reservation
                    .vec(Site::JournalOperations, &mut child_sources, 1)
                    .is_err()
                {
                    return false;
                }
                child_sources.push(child.clone());
                true
            });
            self.candidate.reservation = reservation;
            self.candidate.reservation.ensure_active()?;
            result?;
            let mut indices = Vec::new();
            self.candidate.reservation.vec(
                Site::JournalOperations,
                &mut indices,
                child_sources.len(),
            )?;
            for child in child_sources {
                indices.push(self.append_expected(
                    &child,
                    Some(index),
                    nodes,
                    sources,
                    seen,
                    depth + 1,
                )?);
            }
            let original = origin.as_ref().and_then(|(_, orders)| {
                orders
                    .iter()
                    .find(|(kind, _)| kind == children)
                    .map(|(_, indices)| indices)
            });
            let indices = match original {
                Some(original) if original.as_ref() == &indices => original.clone(),
                _ => Arc::new(indices),
            };
            orders.push((*children, indices));
        }
        nodes[index].orders = match origin {
            Some((_, original)) if original.as_ref() == &orders => original,
            _ => Arc::new(orders),
        };
        Ok(index)
    }
}
