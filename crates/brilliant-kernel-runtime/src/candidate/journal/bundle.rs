//! Immutable payload of a subtree InsertEntity/RemoveEntity operation. It is
//! neither a whole-document snapshot nor an independently applicable operation.

use super::*;

#[derive(Clone, Debug, Eq, PartialEq)]
pub(super) struct Image {
    pub(super) raw_id: Arc<str>,
    pub(super) kind: Kind,
    pub(super) value: Option<Value>,
    pub(super) instrument: Option<InstrumentDescriptorV1>,
    pub(super) staff_id: Option<Arc<str>>,
    pub(super) content_kind: Option<EventContentKind>,
}

impl Image {
    fn shape_valid(&self) -> bool {
        let value_matches = matches!(
            (self.kind, &self.value),
            (Kind::Part, Some(Value::PartName(_)))
                | (Kind::Staff, Some(Value::StaffDefinition { .. }))
                | (Kind::Content, None)
                | (Kind::Voice, Some(Value::VoiceSequenceStart(_)))
                | (Kind::Event, Some(Value::EventNoteValue(_)))
                | (Kind::Note, Some(Value::NoteWrittenPitch(_)))
        );
        value_matches
            && self.instrument.is_some() == (self.kind == Kind::Part)
            && self.content_kind.is_some() == (self.kind == Kind::Event)
            && match self.kind {
                Kind::Voice => self.staff_id.is_some(),
                Kind::Event => true,
                _ => self.staff_id.is_none(),
            }
    }

    fn matches(&self, candidate: &mut Candidate<'_>, source: &Occurrence) -> Result<bool, Failure> {
        if !candidate.visible(source)
            || candidate.kind(source) != Some(self.kind)
            || candidate.raw_id(source) != Some(self.raw_id.as_ref())
            || candidate.read_value(source) != self.value
        {
            return Ok(false);
        }
        if self.kind == Kind::Part && candidate.read_instrument(source) != self.instrument {
            return Ok(false);
        }
        if matches!(self.kind, Kind::Voice | Kind::Event) {
            let reference = candidate
                .read_staff_reference(source)
                .ok_or(Failure::InternalError)?;
            if reference.as_deref() != self.staff_id.as_deref() {
                return Ok(false);
            }
        }
        Ok(self.kind != Kind::Event || candidate.read_content_kind(source) == self.content_kind)
    }
}

#[derive(Clone)]
pub(super) struct BundleNode {
    pub(super) id: JournalId,
    pub(super) parent: Option<usize>,
    pub(super) image: Arc<Image>,
    pub(super) orders: Arc<Vec<(Children, Vec<usize>)>>,
}

#[derive(Clone)]
pub(super) struct PartBundle {
    pub(super) nodes: Vec<BundleNode>,
}

fn child_orders(kind: Kind) -> &'static [Children] {
    match kind {
        Kind::Part => &[Children::Staffs, Children::Contents],
        Kind::Content => &[Children::Voices],
        Kind::Voice => &[Children::Events],
        Kind::Event => &[Children::Notes],
        _ => &[],
    }
}

fn collect(
    candidate: &mut Candidate<'_>,
    owner: &Occurrence,
    children: Children,
) -> Result<Vec<Occurrence>, Failure> {
    let mut result = Vec::new();
    let mut reservation = std::mem::take(&mut candidate.reservation);
    let visited = candidate.visit_order(&CandidateOrder::new(owner, children), &mut |child, _| {
        if reservation
            .vec(Site::JournalOperations, &mut result, 1)
            .is_err()
        {
            return false;
        }
        result.push(child.clone());
        true
    });
    candidate.reservation = reservation;
    candidate.reservation.ensure_active()?;
    visited.ok_or(Failure::InternalError)?;
    Ok(result)
}

impl PartBundle {
    // These operations introduce no extension blocks. Prefix inverse removal
    // must verify that expectation too; otherwise it could orphan unrecorded
    // opaque data. The existing reference index avoids cloning extension payloads.
    pub(super) fn require_no_extensions(
        candidate: &Candidate<'_>,
        raw_id: &str,
    ) -> Result<(), Failure> {
        if let Ok(id) = StableId::new(raw_id)
            && candidate
                .prefix
                .list_references_to(&id)
                .iter()
                .any(|reference| matches!(reference, Reference::ExtensionOwner { .. }))
        {
            return Err(Failure::InternalError);
        }
        Ok(())
    }

    pub(super) fn capture(
        candidate: &mut Candidate<'_>,
        identities: &mut IdentityRecorder,
        root: &Occurrence,
    ) -> Result<(Self, Vec<Occurrence>), Failure> {
        candidate.reservation.ensure_active()?;
        Self::require_no_extensions(
            candidate,
            candidate.raw_id(root).ok_or(Failure::InternalError)?,
        )?;
        let mut bundle = Self { nodes: Vec::new() };
        let mut sources = Vec::new();
        bundle.capture_node(candidate, identities, root, None, &mut sources)?;
        bundle.validate(candidate)?;
        Ok((bundle, sources))
    }

    fn capture_node(
        &mut self,
        candidate: &mut Candidate<'_>,
        identities: &mut IdentityRecorder,
        source: &Occurrence,
        parent: Option<usize>,
        sources: &mut Vec<Occurrence>,
    ) -> Result<usize, Failure> {
        // Prefix subtree removal needs separate Extension ownership handling.
        let Occurrence::Added(index) = source else {
            return Err(Failure::InternalError);
        };
        if !candidate.visible(source) {
            return Err(Failure::InternalError);
        }
        let node = candidate.nodes.get(*index).ok_or(Failure::InternalError)?;
        let image = Image {
            raw_id: node.raw_id.clone(),
            kind: node.kind,
            value: node.value.clone(),
            instrument: node.instrument.clone(),
            staff_id: node.staff_id.clone(),
            content_kind: node.content_kind,
        };
        if !image.shape_valid() || (parent.is_none() && image.kind != Kind::Part) {
            return Err(Failure::InternalError);
        }
        let id = identities.record(candidate, source)?;
        candidate
            .reservation
            .vec(Site::JournalOperations, &mut self.nodes, 1)?;
        candidate
            .reservation
            .vec(Site::JournalOperations, sources, 1)?;
        let index = self.nodes.len();
        self.nodes.push(BundleNode {
            id,
            parent,
            image: Arc::new(image),
            orders: Arc::new(Vec::new()),
        });
        sources.push(source.clone());
        let kinds = child_orders(self.nodes[index].image.kind);
        let mut orders = Vec::new();
        candidate
            .reservation
            .vec(Site::JournalOperations, &mut orders, kinds.len())?;
        for kind in kinds {
            let children = collect(candidate, source, *kind)?;
            let mut indices = Vec::new();
            candidate
                .reservation
                .vec(Site::JournalOperations, &mut indices, children.len())?;
            for child in children {
                if candidate.kind(&child) != Some(kind.child_kind())
                    || candidate.owner(&child).as_ref() != Some(source)
                {
                    return Err(Failure::InternalError);
                }
                indices.push(self.capture_node(
                    candidate,
                    identities,
                    &child,
                    Some(index),
                    sources,
                )?);
            }
            orders.push((*kind, indices));
        }
        self.nodes[index].orders = Arc::new(orders);
        Ok(index)
    }

    pub(super) fn validate(&self, candidate: &mut Candidate<'_>) -> Result<(), Failure> {
        candidate.reservation.ensure_active()?;
        let Some(root) = self.nodes.first() else {
            return Err(Failure::InternalError);
        };
        if root.image.kind != Kind::Part || root.parent.is_some() {
            return Err(Failure::InternalError);
        }
        let mut seen = Vec::new();
        let mut ids = HashSet::new();
        candidate
            .reservation
            .vec(Site::JournalOperations, &mut seen, self.nodes.len())?;
        candidate
            .reservation
            .set(Site::JournalOperations, &mut ids, self.nodes.len())?;
        seen.resize(self.nodes.len(), false);
        seen[0] = true;
        for (index, node) in self.nodes.iter().enumerate() {
            if !node.image.shape_valid()
                || !ids.insert(node.id)
                || (index > 0 && !node.parent.is_some_and(|parent| parent < index))
                || node.orders.len() != child_orders(node.image.kind).len()
            {
                return Err(Failure::InternalError);
            }
            for ((kind, children), expected_kind) in
                node.orders.iter().zip(child_orders(node.image.kind))
            {
                if kind != expected_kind
                    || (node.image.content_kind == Some(EventContentKind::Rest)
                        && !children.is_empty())
                {
                    return Err(Failure::InternalError);
                }
                for child in children {
                    let Some(child_node) = self.nodes.get(*child) else {
                        return Err(Failure::InternalError);
                    };
                    if *child <= index
                        || child_node.parent != Some(index)
                        || child_node.image.kind != kind.child_kind()
                        || seen[*child]
                    {
                        return Err(Failure::InternalError);
                    }
                    seen[*child] = true;
                }
            }
        }
        if seen.iter().any(|seen| !seen) {
            return Err(Failure::InternalError);
        }
        Ok(())
    }

    pub(super) fn verify(
        &self,
        candidate: &mut Candidate<'_>,
        root_owner: &Occurrence,
        sources: &[Occurrence],
    ) -> Result<(), Failure> {
        if sources.len() != self.nodes.len() {
            return Err(Failure::InternalError);
        }
        Self::require_no_extensions(candidate, &self.nodes[0].image.raw_id)?;
        for (index, node) in self.nodes.iter().enumerate() {
            let source = &sources[index];
            let owner = node.parent.map_or(root_owner, |parent| &sources[parent]);
            if candidate.owner(source).as_ref() != Some(owner)
                || !node.image.matches(candidate, source)?
            {
                return Err(Failure::InternalError);
            }
            for (kind, expected) in node.orders.iter() {
                let mut position = 0;
                let mut matched = true;
                candidate
                    .visit_order(&CandidateOrder::new(source, *kind), &mut |child, _| {
                        if expected.get(position).map(|index| &sources[*index]) != Some(child) {
                            matched = false;
                            return false;
                        }
                        position += 1;
                        true
                    })
                    .ok_or(Failure::InternalError)?;
                if !matched || position != expected.len() {
                    return Err(Failure::InternalError);
                }
            }
        }
        Ok(())
    }

    pub(super) fn materialize(
        &self,
        candidate: &mut Candidate<'_>,
        owner: &Occurrence,
        position: usize,
    ) -> Result<Vec<Occurrence>, Failure> {
        let order = CandidateOrder::new(owner, Children::Parts);
        candidate.reserve_insertion(&order)?;
        let mut sources = Vec::new();
        candidate
            .reservation
            .vec(Site::JournalOperations, &mut sources, self.nodes.len())?;
        for node in &self.nodes {
            let owner = node.parent.map_or(owner, |parent| &sources[parent]);
            let raw_id = candidate.share_existing_id(node.image.raw_id.clone())?;
            let source = candidate.add_shared_node(
                owner,
                node.image.kind,
                raw_id,
                node.image.value.clone(),
            )?;
            let Occurrence::Added(index) = &source else {
                return Err(Failure::InternalError);
            };
            let staff_id = node
                .image
                .staff_id
                .as_ref()
                .map(|id| candidate.share_existing_id(id.clone()))
                .transpose()?;
            candidate.nodes[*index].instrument = node.image.instrument.clone();
            candidate.nodes[*index].staff_id = staff_id;
            candidate.nodes[*index].content_kind = node.image.content_kind;
            sources.push(source);
        }
        for (index, node) in self.nodes.iter().enumerate() {
            for (kind, children) in node.orders.iter() {
                let mut order = Vec::new();
                candidate
                    .reservation
                    .vec(Site::JournalOperations, &mut order, children.len())?;
                order.extend(children.iter().map(|child| sources[*child].clone()));
                candidate.set_new_order(&sources[index], *kind, order)?;
            }
        }
        candidate.place_child(&order, position, sources[0].clone())?;
        Ok(sources)
    }

    pub(super) fn patched(
        &self,
        candidate: &mut Candidate<'_>,
        sources: &[Occurrence],
        changes: &HashMap<Occurrence, FieldChanges>,
    ) -> Result<Option<Self>, Failure> {
        if sources.len() != self.nodes.len() {
            return Err(Failure::InternalError);
        }
        if !sources.iter().any(|source| changes.contains_key(source)) {
            return Ok(None);
        }
        let mut nodes = Vec::new();
        candidate
            .reservation
            .vec(Site::JournalOperations, &mut nodes, self.nodes.len())?;
        for (node, source) in self.nodes.iter().zip(sources) {
            let mut node = node.clone();
            if let Some(change) = changes.get(source) {
                let mut image = node.image.as_ref().clone();
                change.apply_to(&mut image)?;
                node.image = Arc::new(image);
            }
            nodes.push(node);
        }
        Ok(Some(Self { nodes }))
    }
}
