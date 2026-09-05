//! Transaction-private occurrence storage. This module is deliberately test-only
//! until preparation, resource accounting, final validation and adoption close.
//! A frozen prefix owns earlier operations; it is never finished or replayed here.

use std::{
    collections::{HashMap, HashSet},
    sync::Arc,
};

mod identity;
mod journal;
mod reservation;

use reservation::{Reservation, Site};

use brilliant_core_types::StableId;
use brilliant_kernel_contracts::KernelStage3CommandFailureLeafV1 as Failure;
use brilliant_score_foundation::{
    AdmissionPartV1, AdmissionStaffDefinitionV1, AdmissionVoiceV1, InstrumentDescriptorV1,
    RhythmicContentV1, RhythmicEventV1,
};

use crate::{
    change_set::{
        ReferenceAddressV1 as Reference, ReferenceValueV1, ScalarAddressV1 as Scalar,
        ScalarValueV1 as Value, StableEntityAddressV1 as Entity, StableOrderAddressV1 as Order,
        StableOwnerAddressV1 as Owner,
    },
    overlay::TransactionOverlayV1,
    records::EventContentKind,
};

#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
enum Kind {
    Document,
    Measure,
    Part,
    Staff,
    Content,
    Voice,
    Event,
    Note,
}

impl Kind {
    fn of(entity: &Entity) -> Self {
        match entity {
            Entity::Document { .. } => Self::Document,
            Entity::Measure { .. } => Self::Measure,
            Entity::Part { .. } => Self::Part,
            Entity::Staff { .. } => Self::Staff,
            Entity::Voice { .. } => Self::Voice,
            Entity::Event { .. } => Self::Event,
            Entity::Note { .. } => Self::Note,
        }
    }
}

/// Stable within one candidate even when orders move or raw IDs are repeated.
#[derive(Clone, Debug, Eq, Hash, PartialEq)]
enum Occurrence {
    Prefix(Arc<Entity>),
    PrefixContent {
        part: Arc<Entity>,
        measure_id: Arc<StableId>,
    },
    Added(usize),
}

impl Occurrence {
    fn prefix(entity: Entity) -> Self {
        Self::Prefix(Arc::new(entity))
    }
}

#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
enum Children {
    Measures,
    Parts,
    Staffs,
    Contents,
    Voices,
    Events,
    Notes,
}

impl Children {
    fn child_kind(self) -> Kind {
        match self {
            Self::Measures => Kind::Measure,
            Self::Parts => Kind::Part,
            Self::Staffs => Kind::Staff,
            Self::Contents => Kind::Content,
            Self::Voices => Kind::Voice,
            Self::Events => Kind::Event,
            Self::Notes => Kind::Note,
        }
    }

    fn owner_kind(self) -> Kind {
        match self {
            Self::Measures | Self::Parts => Kind::Document,
            Self::Staffs | Self::Contents => Kind::Part,
            Self::Voices => Kind::Content,
            Self::Events => Kind::Voice,
            Self::Notes => Kind::Event,
        }
    }
}

#[derive(Clone, Debug, Eq, Hash, PartialEq)]
struct CandidateOrder {
    owner: Occurrence,
    children: Children,
}

impl CandidateOrder {
    fn new(owner: &Occurrence, children: Children) -> Self {
        Self {
            owner: owner.clone(),
            children,
        }
    }

    fn prefix_order(&self) -> Option<Order> {
        if let Occurrence::PrefixContent { part, measure_id } = &self.owner {
            let Entity::Part { part_id } = part.as_ref() else {
                return None;
            };
            return (self.children == Children::Voices).then(|| Order::Voices {
                part_id: part_id.clone(),
                measure_id: measure_id.as_ref().clone(),
            });
        }
        let Occurrence::Prefix(entity) = &self.owner else {
            return None;
        };
        Some(match (entity.as_ref(), self.children) {
            (Entity::Document { document_id }, Children::Measures) => Order::Measures {
                document_id: document_id.clone(),
            },
            (Entity::Document { document_id }, Children::Parts) => Order::Parts {
                document_id: document_id.clone(),
            },
            (Entity::Part { part_id }, Children::Staffs) => Order::Staffs {
                part_id: part_id.clone(),
            },
            (Entity::Part { part_id }, Children::Contents) => Order::MeasureContents {
                part_id: part_id.clone(),
            },
            (Entity::Voice { voice_id }, Children::Events) => Order::Events {
                voice_id: voice_id.clone(),
            },
            (Entity::Event { event_id }, Children::Notes) => Order::Notes {
                event_id: event_id.clone(),
            },
            _ => return None,
        })
    }

    fn prefix_child(&self, id: &StableId) -> Occurrence {
        let id = id.clone();
        match self.children {
            Children::Measures => Occurrence::prefix(Entity::Measure { measure_id: id }),
            Children::Parts => Occurrence::prefix(Entity::Part { part_id: id }),
            Children::Staffs => Occurrence::prefix(Entity::Staff { staff_id: id }),
            Children::Contents => {
                let Occurrence::Prefix(part) = &self.owner else {
                    unreachable!("only a prefix Part order yields prefix contents")
                };
                Occurrence::PrefixContent {
                    part: part.clone(),
                    measure_id: Arc::new(id),
                }
            }
            Children::Voices => Occurrence::prefix(Entity::Voice { voice_id: id }),
            Children::Events => Occurrence::prefix(Entity::Event { event_id: id }),
            Children::Notes => Occurrence::prefix(Entity::Note { note_id: id }),
        }
    }
}

/// Scalars contain no IDs. References retain raw strings until final admission.
/// Incoming aggregates are consumed into these records and child orders once.
struct Node {
    raw_id: Arc<str>,
    kind: Kind,
    owner: Occurrence,
    value: Option<Value>,
    instrument: Option<InstrumentDescriptorV1>,
    staff_id: Option<Arc<str>>,
    content_kind: Option<EventContentKind>,
}

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
struct Work {
    order_visits: u64,
    visited_entries: u64,
    prefix_order_copies: u64,
    copied_entries: u64,
}

struct Candidate<'a> {
    prefix: TransactionOverlayV1<'a>,
    document: Occurrence,
    nodes: Vec<Node>,
    // Content links are deliberately absent: measure IDs do not identify a
    // unique content occurrence. Resolve contents only in their owner's order.
    added: HashMap<Kind, HashMap<Arc<str>, Vec<usize>>>,
    id_pool: HashSet<Arc<str>>,
    orders: HashMap<CandidateOrder, Vec<Occurrence>>,
    hidden: HashSet<Occurrence>,
    values: HashMap<Occurrence, Value>,
    instruments: HashMap<Occurrence, InstrumentDescriptorV1>,
    staff_references: HashMap<Occurrence, Option<Arc<str>>>,
    work: Work,
    reservation: Reservation,
}

impl<'a> Candidate<'a> {
    fn new(prefix: TransactionOverlayV1<'a>, document_id: StableId) -> Self {
        Self {
            prefix,
            document: Occurrence::prefix(Entity::Document { document_id }),
            nodes: Vec::new(),
            added: HashMap::new(),
            id_pool: HashSet::new(),
            orders: HashMap::new(),
            hidden: HashSet::new(),
            values: HashMap::new(),
            instruments: HashMap::new(),
            staff_references: HashMap::new(),
            work: Work::default(),
            reservation: Reservation::default(),
        }
    }

    fn raw_id<'b>(&'b self, occurrence: &'b Occurrence) -> Option<&'b str> {
        match occurrence {
            Occurrence::Prefix(entity) => Some(entity.stable_id().as_str()),
            Occurrence::PrefixContent { measure_id, .. } => Some(measure_id.as_str()),
            Occurrence::Added(index) => Some(self.nodes.get(*index)?.raw_id.as_ref()),
        }
    }

    fn kind(&self, occurrence: &Occurrence) -> Option<Kind> {
        Some(match occurrence {
            Occurrence::Prefix(entity) => Kind::of(entity),
            Occurrence::PrefixContent { .. } => Kind::Content,
            Occurrence::Added(index) => self.nodes.get(*index)?.kind,
        })
    }

    fn owner(&self, occurrence: &Occurrence) -> Option<Occurrence> {
        match occurrence {
            Occurrence::Added(index) => Some(self.nodes.get(*index)?.owner.clone()),
            Occurrence::PrefixContent { part, .. } => Some(Occurrence::Prefix(part.clone())),
            Occurrence::Prefix(entity) => Some(match self.prefix.read_owner(entity)? {
                Owner::Document { document_id } => {
                    Occurrence::prefix(Entity::Document { document_id })
                }
                Owner::Part { part_id } => Occurrence::prefix(Entity::Part { part_id }),
                Owner::PartMeasure {
                    part_id,
                    measure_id,
                } => Occurrence::PrefixContent {
                    part: Arc::new(Entity::Part { part_id }),
                    measure_id: Arc::new(measure_id),
                },
                Owner::Voice { voice_id } => Occurrence::prefix(Entity::Voice { voice_id }),
                Owner::Event { event_id } => Occurrence::prefix(Entity::Event { event_id }),
            }),
        }
    }

    fn visible(&self, occurrence: &Occurrence) -> bool {
        let mut current = occurrence.clone();
        // Document -> Part -> Content -> Voice -> Event -> Note is the deepest
        // route. A bounded owner walk also fails closed on malformed cycles.
        for _ in 0..7 {
            if self.hidden.contains(&current) {
                return false;
            }
            if current == self.document {
                return true;
            }
            if let Occurrence::PrefixContent { part, measure_id } = &current {
                let Entity::Part { part_id } = part.as_ref() else {
                    return false;
                };
                if self.prefix.read_reference(&Reference::PartMeasureLink {
                    part_id: part_id.clone(),
                    measure_id: measure_id.as_ref().clone(),
                }) != Some(ReferenceValueV1::Present(true))
                {
                    return false;
                }
            }
            let Some(owner) = self.owner(&current) else {
                return false;
            };
            current = owner;
        }
        false
    }

    /// Bounded result: cardinality above one is enough to decide ambiguity.
    fn matches(&mut self, kind: Kind, raw_id: &str) -> Vec<Occurrence> {
        if kind == Kind::Content {
            return Vec::new();
        }
        let mut matches = Vec::new();
        if let Ok(id) = StableId::new(raw_id)
            && let Some(entity) = self.prefix.resolve_entity_address(&id)
            && Kind::of(&entity) == kind
        {
            let occurrence = Occurrence::prefix(entity);
            if self.visible(&occurrence) {
                matches.push(occurrence);
            }
        }
        if let Some(indices) = self.added.get(&kind).and_then(|by_id| by_id.get(raw_id)) {
            for index in indices {
                let occurrence = Occurrence::Added(*index);
                if self.visible(&occurrence) {
                    matches.push(occurrence);
                }
                if matches.len() == 2 {
                    break;
                }
            }
        }
        matches
    }

    fn resolve(&mut self, kind: Kind, raw_id: &str) -> Result<Occurrence, Failure> {
        let mut matches = self.matches(kind, raw_id);
        match matches.len() {
            0 => Err(Failure::TargetNotFound),
            1 => Ok(matches.pop().expect("one match")),
            _ => Err(Failure::InternalError),
        }
    }

    /// Visits unchanged prefix orders by borrowing; no whole order is cloned.
    fn visit_order(
        &mut self,
        order: &CandidateOrder,
        visitor: &mut dyn FnMut(&Occurrence, &str) -> bool,
    ) -> Option<()> {
        if self.kind(&order.owner)? != order.children.owner_kind() || !self.visible(&order.owner) {
            return None;
        }
        let mut visited = 0;
        let result = if let Some(children) = self.orders.get(order) {
            for child in children {
                if self.visible(child) {
                    visited += 1;
                    if !visitor(child, self.raw_id(child)?) {
                        break;
                    }
                }
            }
            Some(())
        } else {
            let prefix_order = order.prefix_order()?;
            self.prefix.visit_order(&prefix_order, &mut |id| {
                let child = order.prefix_child(id);
                if !self.visible(&child) {
                    return true;
                }
                visited += 1;
                visitor(&child, id.as_str())
            })
        };
        self.work.order_visits += 1;
        self.work.visited_entries += visited;
        result
    }

    fn copy_order_for_write(&mut self, order: &CandidateOrder) -> Result<(), Failure> {
        self.reservation.ensure_active()?;
        if self.orders.contains_key(order) {
            return Ok(());
        }
        let mut children = Vec::new();
        // Keep the fallible writer disjoint from the borrowed prefix visitor.
        // Restore its terminal state before interpreting any visitor outcome.
        let mut reservation = std::mem::take(&mut self.reservation);
        let visited = self.visit_order(order, &mut |child, _| {
            if reservation
                .vec(Site::OrderEntries, &mut children, 1)
                .is_err()
            {
                return false;
            }
            children.push(child.clone());
            true
        });
        self.reservation = reservation;
        self.reservation.ensure_active()?;
        visited.ok_or(Failure::InternalError)?;
        self.reservation.map(Site::Orders, &mut self.orders, 1)?;
        self.work.prefix_order_copies += 1;
        self.work.copied_entries += children.len() as u64;
        self.orders.insert(order.clone(), children);
        Ok(())
    }

    fn read_value(&mut self, occurrence: &Occurrence) -> Option<Value> {
        if !self.visible(occurrence) {
            return None;
        }
        if let Some(value) = self.values.get(occurrence) {
            return Some(value.clone());
        }
        let Occurrence::Prefix(entity) = occurrence else {
            return match occurrence {
                Occurrence::Added(index) => self.nodes.get(*index)?.value.clone(),
                _ => None,
            };
        };
        self.prefix.read_scalar(&match entity.as_ref() {
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
        })
    }

    fn read_instrument(&mut self, part: &Occurrence) -> Option<InstrumentDescriptorV1> {
        if !self.visible(part) {
            return None;
        }
        if let Some(value) = self.instruments.get(part) {
            return Some(value.clone());
        }
        match part {
            Occurrence::Prefix(entity) => {
                let Entity::Part { part_id } = entity.as_ref() else {
                    return None;
                };
                let Value::PartInstrument(value) =
                    self.prefix.read_scalar(&Scalar::PartInstrument {
                        part_id: part_id.clone(),
                    })?
                else {
                    return None;
                };
                Some(value)
            }
            Occurrence::Added(index) => self.nodes.get(*index)?.instrument.clone(),
            _ => None,
        }
    }

    fn read_staff_reference(&self, occurrence: &Occurrence) -> Option<Option<String>> {
        if !self.visible(occurrence) {
            return None;
        }
        if let Some(value) = self.staff_references.get(occurrence) {
            return Some(value.as_ref().map(|id| id.to_string()));
        }
        match occurrence {
            Occurrence::Prefix(entity) => match entity.as_ref() {
                Entity::Voice { voice_id } => {
                    let ReferenceValueV1::StableId(id) =
                        self.prefix.read_reference(&Reference::VoiceDefaultStaff {
                            voice_id: voice_id.clone(),
                        })?
                    else {
                        return None;
                    };
                    Some(Some(id.as_str().to_owned()))
                }
                Entity::Event { event_id } => {
                    let ReferenceValueV1::OptionalStableId(id) =
                        self.prefix
                            .read_reference(&Reference::EventStaffAssignment {
                                event_id: event_id.clone(),
                            })?
                    else {
                        return None;
                    };
                    Some(id.map(|id| id.as_str().to_owned()))
                }
                _ => None,
            },
            Occurrence::Added(index) => {
                let node = self.nodes.get(*index)?;
                matches!(node.kind, Kind::Voice | Kind::Event)
                    .then(|| node.staff_id.as_ref().map(|id| id.to_string()))
            }
            _ => None,
        }
    }

    fn read_content_kind(&mut self, event: &Occurrence) -> Option<EventContentKind> {
        if !self.visible(event) {
            return None;
        }
        match event {
            Occurrence::Prefix(entity) => {
                let Entity::Event { event_id } = entity.as_ref() else {
                    return None;
                };
                self.prefix.read_event_content_kind(event_id)
            }
            Occurrence::Added(index) => self.nodes.get(*index)?.content_kind,
            _ => None,
        }
    }

    /// Unordered source set: use the prefix index plus candidate-only records
    /// and replacements. Hidden sources and stale prefix edges are excluded.
    fn staff_referrers(&self, raw_id: &str) -> Vec<Occurrence> {
        let mut result = Vec::new();
        if let Ok(id) = StableId::new(raw_id) {
            for reference in self.prefix.list_references_to(&id) {
                let source = match reference {
                    Reference::VoiceDefaultStaff { voice_id } => {
                        Occurrence::prefix(Entity::Voice { voice_id })
                    }
                    Reference::EventStaffAssignment { event_id } => {
                        Occurrence::prefix(Entity::Event { event_id })
                    }
                    _ => continue,
                };
                if !self.staff_references.contains_key(&source) && self.visible(&source) {
                    result.push(source);
                }
            }
        }
        for (index, node) in self.nodes.iter().enumerate() {
            if matches!(node.kind, Kind::Voice | Kind::Event)
                && node.staff_id.as_deref() == Some(raw_id)
            {
                let source = Occurrence::Added(index);
                if self.visible(&source) {
                    result.push(source);
                }
            }
        }
        for (source, value) in &self.staff_references {
            if value.as_deref() == Some(raw_id) && self.visible(source) {
                result.push(source.clone());
            }
        }
        result
    }

    /// Staff removal checks only the owner's Part. Cross-Part invalid references
    /// are final semantic facts, not an earlier reference-conflict in this Part.
    fn staff_referrers_in_part(
        &self,
        part: &Occurrence,
        raw_id: &str,
    ) -> Result<Vec<Occurrence>, Failure> {
        if !self.visible(part) {
            return Err(Failure::TargetNotFound);
        }
        if self.kind(part) != Some(Kind::Part) {
            return Err(Failure::InternalError);
        }
        Ok(self
            .staff_referrers(raw_id)
            .into_iter()
            .filter(|source| {
                let voice = if self.kind(source) == Some(Kind::Event) {
                    self.owner(source)
                } else {
                    Some(source.clone())
                };
                let content = voice.as_ref().and_then(|voice| self.owner(voice));
                content
                    .as_ref()
                    .and_then(|content| self.owner(content))
                    .as_ref()
                    == Some(part)
            })
            .collect())
    }

    /// Storage writes only. The bool describes this raw-field change, not a
    /// command effect or net batch change. Preparation retains history facts.
    fn replace_value(&mut self, occurrence: &Occurrence, value: Value) -> Result<bool, Failure> {
        self.reservation.ensure_active()?;
        if !self.visible(occurrence) {
            return Err(Failure::TargetNotFound);
        }
        let kind = match &value {
            Value::DocumentMetadata(_) => Kind::Document,
            Value::MeasureDefinition { .. } => Kind::Measure,
            Value::PartName(_) => Kind::Part,
            Value::StaffDefinition { .. } => Kind::Staff,
            Value::VoiceSequenceStart(_) => Kind::Voice,
            Value::EventNoteValue(_) => Kind::Event,
            Value::NoteWrittenPitch(_) => Kind::Note,
            Value::PartInstrument(_) => return Err(Failure::InternalError),
        };
        if self.kind(occurrence) != Some(kind) {
            return Err(Failure::InternalError);
        }
        let previous = self.read_value(occurrence).ok_or(Failure::InternalError)?;
        if previous == value {
            return Ok(false);
        }
        if let Occurrence::Added(index) = occurrence {
            self.nodes[*index].value = Some(value);
        } else {
            if !self.values.contains_key(occurrence) {
                self.reservation.map(Site::Values, &mut self.values, 1)?;
            }
            self.values.insert(occurrence.clone(), value);
        }
        Ok(true)
    }

    fn replace_instrument(
        &mut self,
        part: &Occurrence,
        value: InstrumentDescriptorV1,
    ) -> Result<bool, Failure> {
        self.reservation.ensure_active()?;
        if !self.visible(part) {
            return Err(Failure::TargetNotFound);
        }
        let previous = self.read_instrument(part).ok_or(Failure::InternalError)?;
        if previous == value {
            return Ok(false);
        }
        if let Occurrence::Added(index) = part {
            self.nodes[*index].instrument = Some(value);
        } else {
            if !self.instruments.contains_key(part) {
                self.reservation
                    .map(Site::Instruments, &mut self.instruments, 1)?;
            }
            self.instruments.insert(part.clone(), value);
        }
        Ok(true)
    }

    /// Raw references may be empty, unknown or cross-Part until final semantic
    /// admission. Event None means inherit; a Voice always has an explicit ID.
    /// Event command preparation must compare effective IDs before calling this
    /// raw writer, preserving the existing explicit/inherited form on a no-op.
    fn replace_staff_reference(
        &mut self,
        source: &Occurrence,
        value: Option<String>,
    ) -> Result<bool, Failure> {
        self.reservation.ensure_active()?;
        if !self.visible(source) {
            return Err(Failure::TargetNotFound);
        }
        match self.kind(source) {
            Some(Kind::Event) => {}
            Some(Kind::Voice) if value.is_some() => {}
            _ => return Err(Failure::InternalError),
        }
        let previous = self
            .read_staff_reference(source)
            .ok_or(Failure::InternalError)?;
        if previous == value {
            return Ok(false);
        }
        let value = value.map(|id| self.share_id(id)).transpose()?;
        self.assign_shared_staff_reference(source, value)?;
        Ok(true)
    }

    // The raw field kind/value were checked and IDs were retained in the pool.
    fn assign_shared_staff_reference(
        &mut self,
        source: &Occurrence,
        value: Option<Arc<str>>,
    ) -> Result<(), Failure> {
        self.reservation.ensure_active()?;
        if let Occurrence::Added(index) = source {
            self.nodes[*index].staff_id = value;
        } else {
            if !self.staff_references.contains_key(source) {
                self.reservation
                    .map(Site::StaffReferences, &mut self.staff_references, 1)?;
            }
            self.staff_references.insert(source.clone(), value);
        }
        Ok(())
    }

    fn voice_insertion_index(
        &mut self,
        part: &Occurrence,
        content: &Occurrence,
        after: Option<&str>,
    ) -> Result<usize, Failure> {
        // The reference compares the content object itself, not just measureId.
        // Check this even for start anchors and same-ID Parts/contents.
        if self.owner(content).as_ref() != Some(part) || self.kind(part) != Some(Kind::Part) {
            return Err(Failure::InternalError);
        }
        self.insertion_index(&CandidateOrder::new(content, Children::Voices), after, None)
    }

    /// Resolve after-ID in the visible order. Event's global fallback is an
    /// existence test; hierarchy anchors instead require a unique global match.
    fn insertion_index(
        &mut self,
        order: &CandidateOrder,
        after: Option<&str>,
        skip: Option<&Occurrence>,
    ) -> Result<usize, Failure> {
        if !self.visible(&order.owner)
            || self.kind(&order.owner) != Some(order.children.owner_kind())
        {
            return Err(Failure::InternalError);
        }
        let Some(after) = after else {
            return Ok(0);
        };
        let mut index = 0;
        let mut found = None;
        let mut duplicate = false;
        self.visit_order(order, &mut |child, raw_id| {
            if Some(child) == skip {
                return true;
            }
            if raw_id == after {
                if found.is_some() {
                    duplicate = true;
                    return false;
                }
                found = Some(index + 1);
            }
            index += 1;
            true
        })
        .ok_or(Failure::InternalError)?;
        if duplicate {
            return Err(Failure::InternalError);
        }
        if let Some(index) = found {
            return Ok(index);
        }
        match self.matches(order.children.child_kind(), after).len() {
            0 => Err(Failure::AnchorNotFound),
            1 => Err(Failure::AnchorWrongOwner),
            _ if order.children == Children::Events => Err(Failure::AnchorWrongOwner),
            _ => Err(Failure::InternalError),
        }
    }

    fn move_child(
        &mut self,
        order: &CandidateOrder,
        target_id: &str,
        after: Option<&str>,
    ) -> Result<(), Failure> {
        self.reservation.ensure_active()?;
        let target = self.resolve(order.children.child_kind(), target_id)?;
        if self.owner(&target).as_ref() != Some(&order.owner) {
            return Err(Failure::TargetNotFound);
        }
        if after == Some(target_id) {
            return Err(Failure::AnchorSelfReference);
        }
        let index = self.insertion_index(order, after, Some(&target))?;
        self.copy_order_for_write(order)?;
        let children = self.orders.get_mut(order).expect("touched order");
        // Hidden children do not contribute to the visible insertion index.
        let visible_at = children
            .iter()
            .filter(|child| *child != &target && !self.hidden.contains(*child))
            .count();
        if index > visible_at {
            return Err(Failure::InternalError);
        }
        children.retain(|child| child != &target && !self.hidden.contains(child));
        children.insert(index, target);
        Ok(())
    }

    fn hide(&mut self, occurrence: &Occurrence) -> Result<(), Failure> {
        self.reservation.ensure_active()?;
        if !self.visible(occurrence) {
            return Err(Failure::TargetNotFound);
        }
        if occurrence == &self.document {
            return Err(Failure::InternalError);
        }
        self.reservation
            .set(Site::HiddenRoots, &mut self.hidden, 1)?;
        self.hidden.insert(occurrence.clone());
        Ok(())
    }

    /// Share raw IDs and references across new records, lookup keys and content
    /// links. Occurrence identity remains independent of string identity.
    fn share_id(&mut self, value: String) -> Result<Arc<str>, Failure> {
        self.reservation.ensure_active()?;
        if let Some(shared) = self.id_pool.get(value.as_str()) {
            return Ok(shared.clone());
        }
        self.reservation.set(Site::IdPool, &mut self.id_pool, 1)?;
        let shared: Arc<str> = value.into();
        self.id_pool.insert(shared.clone());
        Ok(shared)
    }

    fn add_node(
        &mut self,
        owner: &Occurrence,
        kind: Kind,
        raw_id: String,
        value: Option<Value>,
    ) -> Result<Occurrence, Failure> {
        let raw_id = self.share_id(raw_id)?;
        self.add_shared_node(owner, kind, raw_id, value)
    }

    fn share_existing_id(&mut self, value: Arc<str>) -> Result<Arc<str>, Failure> {
        self.reservation.ensure_active()?;
        if let Some(shared) = self.id_pool.get(value.as_ref()) {
            return Ok(shared.clone());
        }
        self.reservation.set(Site::IdPool, &mut self.id_pool, 1)?;
        self.id_pool.insert(value.clone());
        Ok(value)
    }

    // The caller has already retained this ID in the candidate pool.
    fn add_shared_node(
        &mut self,
        owner: &Occurrence,
        kind: Kind,
        raw_id: Arc<str>,
        value: Option<Value>,
    ) -> Result<Occurrence, Failure> {
        self.reservation.ensure_active()?;
        let index = self.nodes.len();
        self.reservation.vec(Site::Nodes, &mut self.nodes, 1)?;
        if kind != Kind::Content {
            if !self.added.contains_key(&kind) {
                self.reservation
                    .map(Site::LookupKinds, &mut self.added, 1)?;
            }
            let by_id = self.added.entry(kind).or_default();
            if !by_id.contains_key(raw_id.as_ref()) {
                self.reservation.map(Site::LookupIds, by_id, 1)?;
            }
            let bucket = by_id.entry(raw_id.clone()).or_default();
            self.reservation.vec(Site::LookupBucket, bucket, 1)?;
            bucket.push(index);
        }
        self.nodes.push(Node {
            raw_id,
            kind,
            owner: owner.clone(),
            value,
            instrument: None,
            staff_id: None,
            content_kind: None,
        });
        Ok(Occurrence::Added(index))
    }

    fn set_new_order(
        &mut self,
        owner: &Occurrence,
        children: Children,
        values: Vec<Occurrence>,
    ) -> Result<(), Failure> {
        self.reservation.ensure_active()?;
        let order = CandidateOrder::new(owner, children);
        if !self.orders.contains_key(&order) {
            self.reservation.map(Site::Orders, &mut self.orders, 1)?;
        }
        self.orders.insert(order, values);
        Ok(())
    }

    fn add_voice(
        &mut self,
        content: &Occurrence,
        voice: AdmissionVoiceV1,
    ) -> Result<Occurrence, Failure> {
        let occurrence = self.add_node(
            content,
            Kind::Voice,
            voice.id,
            Some(Value::VoiceSequenceStart(voice.sequence.start)),
        )?;
        let Occurrence::Added(index) = occurrence else {
            unreachable!()
        };
        self.nodes[index].staff_id = Some(self.share_id(voice.default_staff_id)?);
        let mut events = Vec::new();
        self.reservation
            .vec(Site::OrderEntries, &mut events, voice.sequence.events.len())?;
        for event in voice.sequence.events {
            events.push(self.add_event(&occurrence, event)?);
        }
        self.set_new_order(&occurrence, Children::Events, events)?;
        Ok(occurrence)
    }

    fn add_event(
        &mut self,
        voice: &Occurrence,
        event: RhythmicEventV1<String>,
    ) -> Result<Occurrence, Failure> {
        let occurrence = self.add_node(
            voice,
            Kind::Event,
            event.id,
            Some(Value::EventNoteValue(event.duration)),
        )?;
        let Occurrence::Added(index) = occurrence else {
            unreachable!()
        };
        self.nodes[index].staff_id = event.staff_id.map(|id| self.share_id(id)).transpose()?;
        let mut notes = Vec::new();
        self.nodes[index].content_kind = Some(match event.content {
            RhythmicContentV1::Rest => EventContentKind::Rest,
            RhythmicContentV1::Notes { notes: values } => {
                self.reservation
                    .vec(Site::OrderEntries, &mut notes, values.len())?;
                for note in values {
                    notes.push(self.add_node(
                        &occurrence,
                        Kind::Note,
                        note.id,
                        Some(Value::NoteWrittenPitch(note.written_pitch)),
                    )?);
                }
                EventContentKind::Notes
            }
        });
        self.set_new_order(&occurrence, Children::Notes, notes)?;
        Ok(occurrence)
    }

    fn reserve_insertion(&mut self, order: &CandidateOrder) -> Result<(), Failure> {
        self.copy_order_for_write(order)?;
        self.reservation.vec(
            Site::OrderEntries,
            self.orders.get_mut(order).expect("touched insertion order"),
            1,
        )
    }

    fn place_child(
        &mut self,
        order: &CandidateOrder,
        index: usize,
        child: Occurrence,
    ) -> Result<Occurrence, Failure> {
        self.reservation.ensure_active()?;
        let children = self.orders.get_mut(order).ok_or(Failure::InternalError)?;
        // Insertion indices count visible siblings; retained hidden siblings
        // must not displace the insertion. Capacity was reserved before building.
        let visible_len = children
            .iter()
            .filter(|child| !self.hidden.contains(*child))
            .count();
        if index > visible_len {
            return Err(Failure::InternalError);
        }
        children.retain(|child| !self.hidden.contains(child));
        children.insert(index, child.clone());
        Ok(child)
    }

    fn insert_staff(
        &mut self,
        part: &Occurrence,
        staff: AdmissionStaffDefinitionV1,
        after: Option<&str>,
    ) -> Result<Occurrence, Failure> {
        self.reservation.ensure_active()?;
        let order = CandidateOrder::new(part, Children::Staffs);
        let index = self.insertion_index(&order, after, None)?;
        self.reserve_insertion(&order)?;
        let child = self.add_node(
            part,
            Kind::Staff,
            staff.id,
            Some(Value::StaffDefinition {
                line_count: staff.line_count,
                default_clef: staff.default_clef,
            }),
        )?;
        self.place_child(&order, index, child)
    }

    fn insert_voice(
        &mut self,
        part: &Occurrence,
        content: &Occurrence,
        voice: AdmissionVoiceV1,
        after: Option<&str>,
    ) -> Result<Occurrence, Failure> {
        self.reservation.ensure_active()?;
        let order = CandidateOrder::new(content, Children::Voices);
        let index = self.voice_insertion_index(part, content, after)?;
        self.reserve_insertion(&order)?;
        let child = self.add_voice(content, voice)?;
        self.place_child(&order, index, child)
    }

    fn insert_event(
        &mut self,
        voice: &Occurrence,
        event: RhythmicEventV1<String>,
        after: Option<&str>,
    ) -> Result<Occurrence, Failure> {
        self.reservation.ensure_active()?;
        let order = CandidateOrder::new(voice, Children::Events);
        let index = self.insertion_index(&order, after, None)?;
        self.reserve_insertion(&order)?;
        let child = self.add_event(voice, event)?;
        self.place_child(&order, index, child)
    }

    /// Storage operation only, not command preparation: no semantic admission or
    /// history effects are implied. All caller-visible resolution precedes writes.
    fn insert_part(
        &mut self,
        part: AdmissionPartV1,
        after: Option<&str>,
    ) -> Result<Occurrence, Failure> {
        self.reservation.ensure_active()?;
        let order = CandidateOrder::new(&self.document, Children::Parts);
        let index = self.insertion_index(&order, after, None)?;
        self.reserve_insertion(&order)?;
        let occurrence = self.add_node(
            &self.document.clone(),
            Kind::Part,
            part.id,
            Some(Value::PartName(part.name)),
        )?;
        let Occurrence::Added(node_index) = occurrence else {
            unreachable!()
        };
        self.nodes[node_index].instrument = Some(part.instrument);
        let mut staffs = Vec::new();
        self.reservation
            .vec(Site::OrderEntries, &mut staffs, part.staves.len())?;
        for staff in part.staves {
            staffs.push(self.add_node(
                &occurrence,
                Kind::Staff,
                staff.id,
                Some(Value::StaffDefinition {
                    line_count: staff.line_count,
                    default_clef: staff.default_clef,
                }),
            )?);
        }
        self.set_new_order(&occurrence, Children::Staffs, staffs)?;
        let mut contents = Vec::new();
        self.reservation.vec(
            Site::OrderEntries,
            &mut contents,
            part.measure_contents.len(),
        )?;
        for content in part.measure_contents {
            let content_occurrence =
                self.add_node(&occurrence, Kind::Content, content.measure_id, None)?;
            let mut voices = Vec::new();
            self.reservation
                .vec(Site::OrderEntries, &mut voices, content.voices.len())?;
            for voice in content.voices {
                voices.push(self.add_voice(&content_occurrence, voice)?);
            }
            self.set_new_order(&content_occurrence, Children::Voices, voices)?;
            contents.push(content_occurrence);
        }
        self.set_new_order(&occurrence, Children::Contents, contents)?;
        self.place_child(&order, index, occurrence)
    }
}

#[cfg(test)]
mod tests;
