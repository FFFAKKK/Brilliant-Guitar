//! Transaction-private occurrence storage for admission commands whose temporary
//! state cannot use the live Store's unique, non-empty identity representation.
//! A frozen prefix owns earlier operations; it is never finished or replayed here.

use brilliant_core_types::JsString;

use std::{
    cell::Cell,
    collections::{HashMap, HashSet},
    sync::Arc,
};

mod adoption;
mod assessment;
mod extensions;
mod identity;
mod integrated_view;
mod journal;
mod measure;
mod reservation;

pub(crate) use journal::{CandidateExecution, CandidateHistory, PreparedCandidate};

use reservation::{Reservation, Site};

use brilliant_core_types::StableId;
use brilliant_kernel_contracts::KernelStage3CommandFailureLeafV1 as Failure;
use brilliant_score_foundation::{
    AdmissionMeasureDefinitionV1, AdmissionPartV1, AdmissionStaffDefinitionV1, AdmissionVoiceV1,
    InstrumentDescriptorV1, RhythmicContentV1, RhythmicEventV1,
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
    raw_id: JsString,
    kind: Kind,
    owner: Occurrence,
    value: Option<Value>,
    instrument: Option<InstrumentDescriptorV1>,
    staff_id: Option<JsString>,
    content_kind: Option<EventContentKind>,
}

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
struct Work {
    order_visits: u64,
    visited_entries: u64,
    prefix_order_copies: u64,
    copied_entries: u64,
}

// Keep traversal observations separate: a field write performs no order work.
#[derive(Clone, Copy, Debug, Default)]
struct MutationWork {
    record_writes: u64,
    semantic: brilliant_score_foundation::AssessmentWorkV1,
    semantic_assessments: u64,
}

#[derive(Clone, Copy, Debug, Default)]
struct ReadWork {
    entity_index_lookups: u64,
    owner_index_lookups: u64,
    entity_reads: u64,
}

#[cfg(test)]
mod observed_metrics_tests {
    use super::*;

    #[test]
    fn no_op_writes_and_failed_assessment_retain_actual_work() {
        let document = crate::store::tests::fixture();
        let store = crate::store::build_live_score_store(&document).unwrap();
        let mut candidate = Candidate::new(TransactionOverlayV1::new(&store), document.id.clone());
        let root = candidate.document.clone();
        let before = candidate.attempt_metrics();
        assert!(
            !candidate
                .replace_value(&root, Value::DocumentMetadata(document.metadata.clone()))
                .unwrap()
        );
        let no_op = candidate.attempt_metrics();
        assert_eq!(no_op.overlay_records, before.overlay_records);
        assert!(no_op.entities_visited > before.entities_visited);
        let mut metadata = document.metadata.clone();
        metadata.tempo.bpm = brilliant_core_types::FiniteNumber::new(0.0).unwrap();
        let traversal = candidate.work;
        assert!(
            candidate
                .replace_value(&root, Value::DocumentMetadata(metadata))
                .unwrap()
        );
        assert_eq!(candidate.work, traversal);
        assert_eq!(
            candidate.attempt_metrics().overlay_records,
            no_op.overlay_records + 1
        );
        let (_, failed) = match candidate.validate_final_with_metrics() {
            Ok(_) => panic!("invalid tempo must fail"),
            Err(failure) => failure,
        };
        assert_eq!(failed.full_semantic_validations, 1);
        assert!(failed.semantic_rules_evaluated > 0);
        assert!(failed.semantic_dependency_reads > 0);
        assert!(failed.owner_index_lookups > 0);
        assert!(failed.overlay_records > no_op.overlay_records);
        assert_eq!(store.export_document().unwrap(), document);
    }
}

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
struct StaffReferenceVisits {
    candidate_edges: u64,
    // Counts returned prefix addresses, not work inside the frozen overlay.
    prefix_addresses: u64,
}

struct Candidate<'a> {
    prefix: TransactionOverlayV1<'a>,
    extension_state: extensions::ExtensionState,
    document: Occurrence,
    nodes: Vec<Node>,
    // Content links are deliberately absent: measure IDs do not identify a
    // unique content occurrence. Resolve contents only in their owner's order.
    added: HashMap<Kind, HashMap<JsString, Vec<usize>>>,
    id_pool: HashSet<JsString>,
    orders: HashMap<CandidateOrder, Vec<Occurrence>>,
    hidden: HashSet<Occurrence>,
    values: HashMap<Occurrence, Value>,
    instruments: HashMap<Occurrence, InstrumentDescriptorV1>,
    staff_references: HashMap<Occurrence, Option<JsString>>,
    // Raw IDs deliberately include empty and unpaired UTF-16. Part occurrence
    // identity keeps unrelated owners out of local Staff deletion queries.
    staff_referrers_by_id: HashMap<JsString, HashMap<Occurrence, Vec<Occurrence>>>,
    staff_reference_visits: Cell<StaffReferenceVisits>,
    work: Work,
    mutation_work: MutationWork,
    read_work: Cell<ReadWork>,
    reservation: Reservation,
}

impl<'a> Candidate<'a> {
    /// Cursor/field read attempts and successful record writes are counted at
    /// their actual sites; reservation requests are deliberately excluded.
    fn record_read(&self) {
        let mut work = self.read_work.get();
        work.entity_reads = work.entity_reads.saturating_add(1);
        self.read_work.set(work);
    }

    pub(crate) fn attempt_metrics(&self) -> brilliant_kernel_contracts::KernelStage3MetricsV1 {
        let prefix = self.prefix.metrics();
        let reads = self.read_work.get();
        brilliant_kernel_contracts::KernelStage3MetricsV1 {
            semantic_rules_evaluated: self.mutation_work.semantic.rules_evaluated,
            semantic_dependency_reads: self.mutation_work.semantic.dependency_reads,
            full_document_scans: self.mutation_work.semantic_assessments,
            full_semantic_validations: self.mutation_work.semantic_assessments,
            entities_visited: prefix
                .base_slot_reads
                .saturating_add(self.work.visited_entries)
                .saturating_add(reads.entity_reads),
            entity_index_lookups: prefix
                .base_entity_lookups
                .saturating_add(reads.entity_index_lookups),
            owner_index_lookups: reads.owner_index_lookups,
            overlay_records: prefix
                .overlay_record_writes
                .saturating_add(self.mutation_work.record_writes),
            order_collections_copied: prefix
                .order_copies
                .saturating_add(self.work.prefix_order_copies),
            change_ops: self.prefix.operation_count() as u64,
            changeset_logical_bytes: self.prefix.logical_bytes(),
            ..brilliant_kernel_contracts::KernelStage3MetricsV1::default()
        }
    }

    fn new(prefix: TransactionOverlayV1<'a>, document_id: StableId) -> Self {
        Self {
            prefix,
            extension_state: extensions::ExtensionState::default(),
            document: Occurrence::prefix(Entity::Document { document_id }),
            nodes: Vec::new(),
            added: HashMap::new(),
            id_pool: HashSet::new(),
            orders: HashMap::new(),
            hidden: HashSet::new(),
            values: HashMap::new(),
            instruments: HashMap::new(),
            staff_references: HashMap::new(),
            staff_referrers_by_id: HashMap::new(),
            staff_reference_visits: Cell::new(StaffReferenceVisits::default()),
            work: Work::default(),
            mutation_work: MutationWork::default(),
            read_work: Cell::default(),
            reservation: Reservation::default(),
        }
    }

    fn raw_id<'b>(&'b self, occurrence: &'b Occurrence) -> Option<&'b JsString> {
        match occurrence {
            Occurrence::Prefix(entity) => Some(entity.stable_id().as_js_string()),
            Occurrence::PrefixContent { measure_id, .. } => Some(measure_id.as_js_string()),
            Occurrence::Added(index) => Some(self.nodes.get(*index)?.raw_id.as_js_string()),
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
        let mut work = self.read_work.get();
        work.owner_index_lookups = work.owner_index_lookups.saturating_add(1);
        self.read_work.set(work);
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
    fn matches(&mut self, kind: Kind, raw_id: &JsString) -> Vec<Occurrence> {
        if kind == Kind::Content {
            return Vec::new();
        }
        let mut matches = Vec::new();
        let mut work = self.read_work.get();
        work.entity_index_lookups = work.entity_index_lookups.saturating_add(1);
        self.read_work.set(work);
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

    fn resolve(&mut self, kind: Kind, raw_id: &JsString) -> Result<Occurrence, Failure> {
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
        visitor: &mut dyn FnMut(&Occurrence, &JsString) -> bool,
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
                visitor(&child, id.as_js_string())
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
        self.mutation_work.record_writes = self.mutation_work.record_writes.saturating_add(1);
        Ok(())
    }

    fn read_value(&mut self, occurrence: &Occurrence) -> Option<Value> {
        self.record_read();
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
        self.record_read();
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

    fn read_staff_reference(&self, occurrence: &Occurrence) -> Option<Option<JsString>> {
        if !self.visible(occurrence) {
            return None;
        }
        self.retained_staff_reference(occurrence)
    }

    // Replay can assign retained sources before their ancestor is restored.
    fn retained_staff_reference(&self, occurrence: &Occurrence) -> Option<Option<JsString>> {
        self.record_read();
        if let Some(value) = self.staff_references.get(occurrence) {
            return Some(value.clone());
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
                    Some(Some(id.as_js_string().to_owned()))
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
                    Some(id.map(|id| id.as_js_string().to_owned()))
                }
                _ => None,
            },
            Occurrence::Added(index) => {
                let node = self.nodes.get(*index)?;
                matches!(node.kind, Kind::Voice | Kind::Event).then(|| node.staff_id.clone())
            }
            _ => None,
        }
    }

    fn read_content_kind(&mut self, event: &Occurrence) -> Option<EventContentKind> {
        self.record_read();
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

    /// Unordered source set. Hidden sources and stale prefix edges are excluded.
    fn staff_referrers(&self, raw_id: &JsString) -> Vec<Occurrence> {
        self.collect_staff_referrers(raw_id, None)
    }

    fn staff_reference_part(&self, source: &Occurrence) -> Option<Occurrence> {
        let voice = match self.kind(source)? {
            Kind::Event => self.owner(source)?,
            Kind::Voice => source.clone(),
            _ => return None,
        };
        let content = self.owner(&voice)?;
        self.owner(&content)
    }

    fn collect_staff_referrers(
        &self,
        raw_id: &JsString,
        part: Option<&Occurrence>,
    ) -> Vec<Occurrence> {
        let mut result = Vec::new();
        let mut visits = self.staff_reference_visits.get();
        if let Ok(id) = StableId::new(raw_id) {
            for reference in self.prefix.list_references_to(&id) {
                visits.prefix_addresses += 1;
                let source = match reference {
                    Reference::VoiceDefaultStaff { voice_id } => {
                        Occurrence::prefix(Entity::Voice { voice_id })
                    }
                    Reference::EventStaffAssignment { event_id } => {
                        Occurrence::prefix(Entity::Event { event_id })
                    }
                    _ => continue,
                };
                if !self.staff_references.contains_key(&source)
                    && part.is_none_or(|part| {
                        self.staff_reference_part(&source).as_ref() == Some(part)
                    })
                    && self.visible(&source)
                {
                    result.push(source);
                }
            }
        }
        if let Some(owners) = self.staff_referrers_by_id.get(raw_id) {
            let mut collect = |sources: &Vec<Occurrence>| {
                for source in sources {
                    visits.candidate_edges += 1;
                    if self.visible(source) {
                        result.push(source.clone());
                    }
                }
            };
            if let Some(part) = part {
                if let Some(sources) = owners.get(part) {
                    collect(sources);
                }
            } else {
                for sources in owners.values() {
                    collect(sources);
                }
            }
        }
        self.staff_reference_visits.set(visits);
        result
    }

    /// Staff removal checks only the owner's Part. Cross-Part invalid references
    /// are final semantic facts, not an earlier reference-conflict in this Part.
    fn staff_referrers_in_part(
        &self,
        part: &Occurrence,
        raw_id: &JsString,
    ) -> Result<Vec<Occurrence>, Failure> {
        if !self.visible(part) {
            return Err(Failure::TargetNotFound);
        }
        if self.kind(part) != Some(Kind::Part) {
            return Err(Failure::InternalError);
        }
        Ok(self.collect_staff_referrers(raw_id, Some(part)))
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
        self.mutation_work.record_writes = self.mutation_work.record_writes.saturating_add(1);
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
        self.mutation_work.record_writes = self.mutation_work.record_writes.saturating_add(1);
        Ok(true)
    }

    /// Raw references may be empty, unknown or cross-Part until final semantic
    /// admission. Event None means inherit; a Voice always has an explicit ID.
    /// Event command preparation must compare effective IDs before calling this
    /// raw writer, preserving the existing explicit/inherited form on a no-op.
    #[cfg(test)]
    fn replace_staff_reference(
        &mut self,
        source: &Occurrence,
        value: Option<JsString>,
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
        value: Option<JsString>,
    ) -> Result<(), Failure> {
        self.reservation.ensure_active()?;
        let previous = self
            .retained_staff_reference(source)
            .ok_or(Failure::InternalError)?;
        if previous == value {
            return Ok(());
        }
        let part = self
            .staff_reference_part(source)
            .ok_or(Failure::InternalError)?;
        if !matches!(source, Occurrence::Added(_)) && !self.staff_references.contains_key(source) {
            self.reservation
                .map(Site::StaffReferences, &mut self.staff_references, 1)?;
        }
        if let Some(raw_id) = &value {
            self.reserve_staff_reference_edge(raw_id, &part)?;
        }
        // Every allocation is complete before removing the current edge or
        // publishing the field. One raw field creates at most one indexed edge.
        if let Some(raw_id) = &previous
            && let Some(owners) = self.staff_referrers_by_id.get_mut(raw_id)
        {
            if let Some(sources) = owners.get_mut(&part) {
                sources.retain(|candidate| candidate != source);
                if sources.is_empty() {
                    owners.remove(&part);
                }
            }
            if owners.is_empty() {
                self.staff_referrers_by_id.remove(raw_id);
            }
        }
        if let Some(raw_id) = &value {
            self.staff_referrers_by_id
                .get_mut(raw_id)
                .expect("reserved ID bucket")
                .get_mut(&part)
                .expect("reserved owner bucket")
                .push(source.clone());
        }
        if let Occurrence::Added(index) = source {
            self.nodes[*index].staff_id = value;
        } else {
            self.staff_references.insert(source.clone(), value);
        }
        self.mutation_work.record_writes = self.mutation_work.record_writes.saturating_add(1);
        Ok(())
    }

    fn reserve_staff_reference_edge(
        &mut self,
        raw_id: &JsString,
        part: &Occurrence,
    ) -> Result<(), Failure> {
        if let Some(owners) = self.staff_referrers_by_id.get_mut(raw_id) {
            if let Some(sources) = owners.get_mut(part) {
                return self.reservation.vec(Site::StaffReferences, sources, 1);
            }
            let mut sources = Vec::new();
            self.reservation
                .vec(Site::StaffReferences, &mut sources, 1)?;
            self.reservation.map(Site::StaffReferences, owners, 1)?;
            owners.insert(part.clone(), sources);
        } else {
            let mut sources = Vec::new();
            self.reservation
                .vec(Site::StaffReferences, &mut sources, 1)?;
            let mut owners = HashMap::new();
            self.reservation
                .map(Site::StaffReferences, &mut owners, 1)?;
            self.reservation
                .map(Site::StaffReferences, &mut self.staff_referrers_by_id, 1)?;
            owners.insert(part.clone(), sources);
            self.staff_referrers_by_id.insert(raw_id.clone(), owners);
        }
        Ok(())
    }

    fn voice_insertion_index(
        &mut self,
        part: &Occurrence,
        content: &Occurrence,
        after: Option<&JsString>,
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
        after: Option<&JsString>,
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

    #[cfg(test)]
    fn move_child(
        &mut self,
        order: &CandidateOrder,
        target_id: &JsString,
        after: Option<&JsString>,
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
        self.move_occurrence(order, target, index)
    }

    // Target, owner and insertion position have already been resolved. Replay
    // uses occurrence identity here rather than re-resolving a possibly raw ID.
    fn move_occurrence(
        &mut self,
        order: &CandidateOrder,
        target: Occurrence,
        index: usize,
    ) -> Result<(), Failure> {
        self.reservation.ensure_active()?;
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
        self.mutation_work.record_writes = self.mutation_work.record_writes.saturating_add(1);
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
        self.mutation_work.record_writes = self.mutation_work.record_writes.saturating_add(1);
        Ok(())
    }

    /// Share raw IDs and references across new records, lookup keys and content
    /// links. Occurrence identity remains independent of string identity.
    fn share_id(&mut self, value: JsString) -> Result<JsString, Failure> {
        self.reservation.ensure_active()?;
        if let Some(shared) = self.id_pool.get(value.as_js_string()) {
            return Ok(shared.clone());
        }
        self.reservation.set(Site::IdPool, &mut self.id_pool, 1)?;
        self.id_pool.insert(value.clone());
        Ok(value)
    }

    fn add_node(
        &mut self,
        owner: &Occurrence,
        kind: Kind,
        raw_id: JsString,
        value: Option<Value>,
    ) -> Result<Occurrence, Failure> {
        let raw_id = self.share_id(raw_id)?;
        self.add_shared_node(owner, kind, raw_id, value)
    }

    fn share_existing_id(&mut self, value: JsString) -> Result<JsString, Failure> {
        self.reservation.ensure_active()?;
        if let Some(shared) = self.id_pool.get(value.as_js_string()) {
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
        raw_id: JsString,
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
            if !by_id.contains_key(raw_id.as_js_string()) {
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
        self.mutation_work.record_writes = self.mutation_work.record_writes.saturating_add(1);
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
        self.mutation_work.record_writes = self.mutation_work.record_writes.saturating_add(1);
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
        let staff_id = self.share_id(voice.default_staff_id)?;
        self.assign_shared_staff_reference(&occurrence, Some(staff_id))?;
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
        event: RhythmicEventV1<JsString>,
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
        let staff_id = event.staff_id.map(|id| self.share_id(id)).transpose()?;
        self.assign_shared_staff_reference(&occurrence, staff_id)?;
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
        self.mutation_work.record_writes = self.mutation_work.record_writes.saturating_add(1);
        Ok(child)
    }

    fn insert_staff(
        &mut self,
        part: &Occurrence,
        staff: AdmissionStaffDefinitionV1,
        after: Option<&JsString>,
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
        after: Option<&JsString>,
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
        event: RhythmicEventV1<JsString>,
        after: Option<&JsString>,
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
        after: Option<&JsString>,
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
            contents.push(self.add_content(&occurrence, content.measure_id, content.voices)?);
        }
        self.set_new_order(&occurrence, Children::Contents, contents)?;
        self.place_child(&order, index, occurrence)
    }
}

#[cfg(test)]
mod tests;
