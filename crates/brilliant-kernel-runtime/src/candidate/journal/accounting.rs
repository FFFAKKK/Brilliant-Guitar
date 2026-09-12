//! Borrowed compatibility charges for the executable occurrence suffix.
use super::*;
use crate::change_set::{
    ChangeSetBuildFailureV1, StableAnchorV1,
    accounting::{ChangeSetAccountingV1, RawEntityNodeV1, RawEntityViewV1, RawReferenceValueV1},
};
use brilliant_kernel_contracts::{
    AffectedEntityAddressV1, CoreCommandEnvelopeV1, CoreCommandIdV1 as CommandId, MeasureAnchorV1,
    ScoreEntityTargetV1 as Target,
};
use dispatch::LeafFacts;

type Outcome<T = ()> = Result<T, ChangeSetBuildFailureV1>;
fn invariant() -> ChangeSetBuildFailureV1 {
    ChangeSetBuildFailureV1::ArenaIndexOverflow
}

fn charge_affected(
    values: &[AffectedEntityAddressV1],
    accounting: &mut ChangeSetAccountingV1,
    reservation: &mut Reservation,
    output: &mut Option<&mut Vec<AffectedEntityAddressV1>>,
) -> Outcome {
    use crate::change_set::accounting::{RawAffectedKindV1 as K, RawAffectedV1};
    let Some(output) = output.as_deref_mut() else {
        return Ok(());
    };
    for value in values {
        let (kind, id) = match value {
            Target::Document { document_id } => (K::Document, document_id),
            Target::Measure { measure_id } => (K::Measure, measure_id),
            Target::Part { part_id } => (K::Part, part_id),
            Target::Staff { staff_id } => (K::Staff, staff_id),
            Target::Voice { voice_id } => (K::Voice, voice_id),
            Target::Event { event_id } => (K::Event, event_id),
            Target::Note { note_id } => (K::Note, note_id),
        };
        if accounting.record_affected(RawAffectedV1 {
            kind,
            id: id.as_js_string(),
        })? {
            reservation
                .vec(Site::JournalOperations, output, 1)
                .map_err(|_| invariant())?;
            output.push(value.clone());
        }
    }
    Ok(())
}

fn charge_image(
    kind: Kind,
    raw: &JsString,
    accounting: &mut ChangeSetAccountingV1,
    reservation: &mut Reservation,
    output: &mut Option<&mut Vec<AffectedEntityAddressV1>>,
) -> Outcome {
    let id = raw.clone().into();
    let address = match kind {
        Kind::Document => Target::Document { document_id: id },
        Kind::Measure => Target::Measure { measure_id: id },
        Kind::Part => Target::Part { part_id: id },
        Kind::Staff => Target::Staff { staff_id: id },
        Kind::Voice => Target::Voice { voice_id: id },
        Kind::Event => Target::Event { event_id: id },
        Kind::Note => Target::Note { note_id: id },
        Kind::Content => return Ok(()),
    };
    charge_affected(&[address], accounting, reservation, output)
}

fn charge_subtree(
    bundle: &PartBundle,
    root: usize,
    accounting: &mut ChangeSetAccountingV1,
    reservation: &mut Reservation,
    output: &mut Option<&mut Vec<AffectedEntityAddressV1>>,
) -> Outcome {
    let node = bundle.nodes.get(root).ok_or_else(invariant)?;
    charge_image(
        node.image.kind,
        &node.image.raw_id,
        accounting,
        reservation,
        output,
    )?;
    for (_, children) in node.orders.iter() {
        for child in children.iter() {
            charge_subtree(bundle, *child, accounting, reservation, output)?;
        }
    }
    Ok(())
}

pub(super) enum ChargeContext {
    Ordinary,
    MeasureMove {
        raw: JsString,
        after: Option<JsString>,
    },
}
impl ChargeContext {
    pub(super) fn for_command(command: &CoreCommandEnvelopeV1<JsString>) -> Self {
        match command {
            CoreCommandEnvelopeV1::MeasureMove {
                target: brilliant_kernel_contracts::ScoreEntityTargetV1::Measure { measure_id },
                anchor,
            } => Self::MeasureMove {
                raw: measure_id.as_js_string().clone(),
                after: match anchor {
                    MeasureAnchorV1::Start => None,
                    MeasureAnchorV1::AfterMeasure { measure_id } => Some(measure_id.clone()),
                },
            },
            _ => Self::Ordinary,
        }
    }
}

#[derive(Clone, Copy)]
enum Entity<'a> {
    Stored(&'a StoredEntityBundle),
    Measure(&'a measure::MeasureBundle),
}
struct View<'a, 'store> {
    recorder: &'a Recorder<'store>,
    entity: Entity<'a>,
}

fn nodes(bundle: &PartBundle, visit: &mut dyn FnMut(RawEntityNodeV1<'_>) -> Outcome) -> Outcome {
    for node in &bundle.nodes {
        image_node(&node.image, visit)?;
    }
    for extension in bundle.extensions.iter() {
        visit(RawEntityNodeV1::OwnedExtension(&extension.value))?;
    }
    // preserved_extension_keys name pre-existing data, not values retained by
    // the typed Part bundle. They intentionally add no payload charge.
    Ok(())
}
fn image_node(
    image: &bundle::Image,
    visit: &mut dyn FnMut(RawEntityNodeV1<'_>) -> Outcome,
) -> Outcome {
    visit(match image.kind {
        Kind::Measure => RawEntityNodeV1::Measure {
            pickup: match &image.value {
                Some(Value::MeasureDefinition {
                    pickup_duration, ..
                }) => pickup_duration.is_some(),
                _ => return Err(invariant()),
            },
        },
        Kind::Part => RawEntityNodeV1::Part,
        Kind::Staff => RawEntityNodeV1::Staff,
        Kind::Content => RawEntityNodeV1::Content,
        Kind::Voice => RawEntityNodeV1::Voice,
        Kind::Event => RawEntityNodeV1::Event(match &image.value {
            Some(Value::EventNoteValue(value)) => value,
            _ => return Err(invariant()),
        }),
        Kind::Note => RawEntityNodeV1::Note,
        Kind::Document => return Err(invariant()),
    })
}
fn image_strings(image: &bundle::Image, visit: &mut dyn FnMut(&JsString) -> Outcome) -> Outcome {
    visit(&image.raw_id)?;
    if image.kind == Kind::Part {
        let Some(Value::PartName(name)) = &image.value else {
            return Err(invariant());
        };
        visit(name)?;
        visit(&image.instrument.as_ref().ok_or_else(invariant)?.name)?;
    }
    if matches!(image.kind, Kind::Voice | Kind::Event) {
        if let Some(raw) = &image.staff_id {
            visit(raw)?;
        } else if image.kind == Kind::Voice {
            return Err(invariant());
        }
    }
    Ok(())
}
fn subtree_strings(
    bundle: &PartBundle,
    root: usize,
    visit: &mut dyn FnMut(&JsString) -> Outcome,
) -> Outcome {
    let node = bundle.nodes.get(root).ok_or_else(invariant)?;
    image_strings(&node.image, visit)?;
    for (_, children) in node.orders.iter() {
        for child in children.iter() {
            subtree_strings(bundle, *child, visit)?;
        }
    }
    Ok(())
}

impl RawEntityViewV1 for View<'_, '_> {
    fn visit_nodes(&self, visit: &mut dyn FnMut(RawEntityNodeV1<'_>) -> Outcome) -> Outcome {
        match self.entity {
            Entity::Stored(StoredEntityBundle::Staff(value)) => image_node(&value.image, visit),
            Entity::Stored(
                StoredEntityBundle::Part(value)
                | StoredEntityBundle::Voice(value)
                | StoredEntityBundle::Event(value),
            ) => nodes(value, visit),
            Entity::Measure(value) => {
                nodes(&value.definition.image, visit)?;
                for content in &value.contents {
                    nodes(&content.image, visit)?;
                }
                Ok(())
            }
        }
    }
    fn visit_strings(&self, visit: &mut dyn FnMut(&JsString) -> Outcome) -> Outcome {
        match self.entity {
            Entity::Stored(StoredEntityBundle::Staff(value)) => image_strings(&value.image, visit),
            Entity::Stored(
                StoredEntityBundle::Part(value)
                | StoredEntityBundle::Voice(value)
                | StoredEntityBundle::Event(value),
            ) => {
                subtree_strings(value, 0, visit)?;
                for extension in value.extensions.iter() {
                    if let StableAnchorV1::After { sibling_id } = &extension.anchor {
                        visit(sibling_id.as_js_string())?;
                    }
                    visit(&extension.value.namespace)?;
                    if let brilliant_score_foundation::ExtensionOwnerV1::Part { part_id } =
                        &extension.value.owner
                    {
                        visit(part_id.as_js_string())?;
                    }
                }
                Ok(())
            }
            Entity::Measure(value) => {
                // A typed Measure bundle stores Part IDs for its content roots,
                // not another copy of each content's measure-ID string.
                image_strings(&value.definition.image.nodes[0].image, visit)?;
                for content in &value.contents {
                    visit(self.recorder.accounting_raw(content.owner)?)?;
                    for (_, children) in content.image.nodes[0].orders.iter() {
                        for child in children.iter() {
                            subtree_strings(&content.image, *child, visit)?;
                        }
                    }
                }
                Ok(())
            }
        }
    }
}

impl Recorder<'_> {
    fn charge_source(
        &self,
        id: JournalId,
        accounting: &mut ChangeSetAccountingV1,
        reservation: &mut Reservation,
        output: &mut Option<&mut Vec<AffectedEntityAddressV1>>,
    ) -> Outcome {
        let source = self.identities.source_of(id).ok_or_else(invariant)?;
        charge_image(
            self.candidate.kind(source).ok_or_else(invariant)?,
            self.accounting_raw(id)?,
            accounting,
            reservation,
            output,
        )
    }

    fn charge_removed_step(
        &self,
        operation: &Operation,
        accounting: &mut ChangeSetAccountingV1,
        reservation: &mut Reservation,
        output: &mut Option<&mut Vec<AffectedEntityAddressV1>>,
    ) -> Outcome {
        match operation {
            Operation::RemoveEntity {
                owner,
                expected: StoredEntityBundle::Event(bundle),
                ..
            } => {
                let root = &bundle.nodes[0].image;
                charge_image(root.kind, &root.raw_id, accounting, reservation, output)?;
                self.charge_source(*owner, accounting, reservation, output)?;
                // The second root visit is already interned/deduplicated.
                charge_subtree(bundle, 0, accounting, reservation, output)
            }
            Operation::Measure {
                bundle,
                inserting: false,
            } => {
                let root = &bundle.definition.image.nodes[0].image;
                charge_image(root.kind, &root.raw_id, accounting, reservation, output)?;
                for part in bundle.parts.iter() {
                    let content = bundle
                        .contents
                        .iter()
                        .rev()
                        .find(|content| content.owner == *part)
                        .ok_or_else(invariant)?;
                    self.charge_source(*part, accounting, reservation, output)?;
                    charge_subtree(&content.image, 0, accounting, reservation, output)?;
                }
                Ok(())
            }
            _ => Err(invariant()),
        }
    }

    fn accounting_raw(&self, id: JournalId) -> Outcome<&JsString> {
        self.candidate
            .raw_id(self.identities.source_of(id).ok_or_else(invariant)?)
            .ok_or_else(invariant)
    }
    fn accounting_address(&self, owner: JournalId) -> Outcome<[Option<JsString>; 2]> {
        let source = self.identities.source_of(owner).ok_or_else(invariant)?;
        let raw = self
            .candidate
            .raw_id(source)
            .cloned()
            .ok_or_else(invariant)?;
        if self.candidate.kind(source) == Some(Kind::Content) {
            let part = self.candidate.owner(source).ok_or_else(invariant)?;
            Ok([
                Some(
                    self.candidate
                        .raw_id(&part)
                        .cloned()
                        .ok_or_else(invariant)?,
                ),
                Some(raw),
            ])
        } else {
            Ok([Some(raw), None])
        }
    }
    fn accounting_order<'a>(
        &'a self,
        ids: &[JournalId],
        reservation: &mut Reservation,
    ) -> Outcome<Vec<&'a JsString>> {
        let mut result = Vec::new();
        reservation
            .vec(Site::JournalOperations, &mut result, ids.len())
            .map_err(|_| invariant())?;
        for id in ids {
            result.push(self.accounting_raw(*id)?);
        }
        Ok(result)
    }

    /// Primitive log accounting only. The execution seam owns command effects,
    /// affected facts and batch segment charges, in their existing precedence.
    #[cfg(test)]
    pub(super) fn charge_segment(
        &mut self,
        start: usize,
        context: &ChargeContext,
        facts: &LeafFacts,
        accounting: &mut ChangeSetAccountingV1,
    ) -> Outcome<u64> {
        if start > self.steps.len() || (!facts.changed && start != self.steps.len()) {
            self.candidate.reservation.abort();
            return Err(invariant());
        }
        self.candidate
            .reservation
            .ensure_active()
            .map_err(|_| invariant())?;
        let mut reservation = std::mem::take(&mut self.candidate.reservation);
        let result =
            self.charge_segment_inner(start, context, facts, accounting, &mut reservation, None);
        self.candidate.reservation = reservation;
        if result.is_err() {
            self.candidate.reservation.abort();
        }
        result
    }

    pub(super) fn charge_segment_with_affected(
        &mut self,
        start: usize,
        context: &ChargeContext,
        facts: &LeafFacts,
        accounting: &mut ChangeSetAccountingV1,
        affected: &mut Vec<AffectedEntityAddressV1>,
    ) -> Outcome<u64> {
        if start > self.steps.len() || (!facts.changed && start != self.steps.len()) {
            self.candidate.reservation.abort();
            return Err(invariant());
        }
        self.candidate
            .reservation
            .ensure_active()
            .map_err(|_| invariant())?;
        let mut reservation = std::mem::take(&mut self.candidate.reservation);
        let result = self.charge_segment_inner(
            start,
            context,
            facts,
            accounting,
            &mut reservation,
            Some(affected),
        );
        self.candidate.reservation = reservation;
        if result.is_err() {
            self.candidate.reservation.abort();
        }
        result
    }

    fn charge_segment_inner(
        &self,
        start: usize,
        context: &ChargeContext,
        facts: &LeafFacts,
        accounting: &mut ChangeSetAccountingV1,
        reservation: &mut Reservation,
        mut affected: Option<&mut Vec<AffectedEntityAddressV1>>,
    ) -> Outcome<u64> {
        if !facts.changed {
            return Ok(0);
        }
        let before_all = matches!(
            facts.command_id,
            CommandId::PartInsert
                | CommandId::PartRemove
                | CommandId::StaffRemove
                | CommandId::VoiceRemove
                | CommandId::EventRemove
                | CommandId::MeasureRemove
                | CommandId::MeasureMove
        );
        let split_insert = matches!(
            facts.command_id,
            CommandId::StaffInsert
                | CommandId::VoiceInsert
                | CommandId::VoiceInsertNotesEvent
                | CommandId::VoiceInsertRestEvent
                | CommandId::MeasureInsert
        );
        if before_all {
            charge_affected(&facts.affected, accounting, reservation, &mut affected)?;
        } else if split_insert {
            charge_affected(
                facts.affected.get(..1).ok_or_else(invariant)?,
                accounting,
                reservation,
                &mut affected,
            )?;
        }
        let mut count = 0;
        for step in &self.steps[start..] {
            if affected.is_some() && facts.command_id == CommandId::RangeDelete {
                self.charge_removed_step(&step.forward, accounting, reservation, &mut affected)?;
            }
            match &step.forward {
                Operation::Extension(edit) => {
                    charge_extension(edit, accounting)?;
                    count += 1;
                }
                Operation::ReplaceScalar {
                    target,
                    expected,
                    value,
                } => {
                    accounting.charge_scalar_pair(
                        self.accounting_raw(*target)?,
                        expected,
                        value,
                    )?;
                    count += 1;
                }
                Operation::UpdateReference {
                    target,
                    expected,
                    value,
                } => {
                    let source = self.identities.source_of(*target).ok_or_else(invariant)?;
                    let (expected, value) = if self.candidate.kind(source) == Some(Kind::Voice) {
                        (
                            RawReferenceValueV1::StableId(expected.as_ref().ok_or_else(invariant)?),
                            RawReferenceValueV1::StableId(value.as_ref().ok_or_else(invariant)?),
                        )
                    } else {
                        (
                            RawReferenceValueV1::OptionalStableId(expected.as_ref()),
                            RawReferenceValueV1::OptionalStableId(value.as_ref()),
                        )
                    };
                    accounting.charge_reference_pair(
                        [self.accounting_raw(*target)?],
                        expected,
                        value,
                    )?;
                    count += 1;
                }
                Operation::InsertEntity {
                    owner,
                    anchor,
                    bundle,
                }
                | Operation::RemoveEntity {
                    owner,
                    expected_anchor: anchor,
                    expected: bundle,
                } => {
                    let owner = self.accounting_address(*owner)?;
                    let anchor = anchor.map(|id| self.accounting_raw(id)).transpose()?;
                    accounting.charge_entity_pair(
                        owner
                            .iter()
                            .flatten()
                            .chain(owner.iter().flatten())
                            .chain(anchor),
                        &View {
                            recorder: self,
                            entity: Entity::Stored(bundle),
                        },
                    )?;
                    count += 1;
                }
                Operation::MoveOrderedChild {
                    order,
                    target,
                    expected_anchor,
                    anchor,
                } => {
                    let address = self.accounting_address(order.owner)?;
                    let previous = expected_anchor
                        .map(|id| self.accounting_raw(id))
                        .transpose()?;
                    let next = anchor.map(|id| self.accounting_raw(id)).transpose()?;
                    accounting.charge_ordered_child_pair(
                        address
                            .iter()
                            .flatten()
                            .chain(previous)
                            .chain(next)
                            .chain([self.accounting_raw(*target)?]),
                    )?;
                    count += 1;
                }
                Operation::ReplaceOrderedChildren {
                    order,
                    expected,
                    next,
                } => {
                    if matches!(context, ChargeContext::MeasureMove { .. })
                        && order.children == Children::Contents
                    {
                        continue;
                    }
                    let address = self.accounting_address(order.owner)?;
                    let expected = self.accounting_order(expected, reservation)?;
                    let next = self.accounting_order(next, reservation)?;
                    accounting.charge_order_pair(address.iter().flatten(), &expected, &next)?;
                    count += 1;
                }
                Operation::Measure { bundle, inserting } => {
                    if !inserting {
                        count += self.charge_measure_content_orders(bundle, accounting)?;
                    }
                    let owner = self.accounting_address(bundle.document)?;
                    let anchor = bundle
                        .definition
                        .anchor
                        .map(|id| self.accounting_raw(id))
                        .transpose()?;
                    accounting.charge_entity_pair(
                        owner
                            .iter()
                            .flatten()
                            .chain(owner.iter().flatten())
                            .chain(anchor),
                        &View {
                            recorder: self,
                            entity: Entity::Measure(bundle),
                        },
                    )?;
                    count += 1;
                    if *inserting {
                        // Overlay insertion publishes the Measure address before
                        // the independent Part content orders are charged.
                        charge_affected(
                            facts.affected.get(1..2).ok_or_else(invariant)?,
                            accounting,
                            reservation,
                            &mut affected,
                        )?;
                        count += self.charge_measure_content_orders(bundle, accounting)?;
                    }
                }
            }
            if affected.is_some() && facts.command_id == CommandId::RangeTransposeWrittenPitch {
                let Operation::ReplaceScalar { target, .. } = &step.forward else {
                    return Err(invariant());
                };
                self.charge_source(*target, accounting, reservation, &mut affected)?;
            }
        }
        if let ChargeContext::MeasureMove { raw, after } = context {
            // Typed preparation moves every local target before performing any
            // extra reorder. Journal replacements retain both endpoint orders.
            for normalize in [false, true] {
                for step in &self.steps[start..] {
                    if let Operation::ReplaceOrderedChildren {
                        order,
                        expected,
                        next,
                    } = &step.forward
                    {
                        if order.children != Children::Contents {
                            continue;
                        }
                        let address = self.accounting_address(order.owner)?;
                        let before = self.accounting_order(expected, reservation)?;
                        let final_order = self.accounting_order(next, reservation)?;
                        let mut moved = Vec::new();
                        reservation
                            .vec(Site::JournalOperations, &mut moved, before.len())
                            .map_err(|_| invariant())?;
                        moved.extend(before.iter().copied());
                        let old = moved
                            .iter()
                            .position(|id| *id == raw)
                            .ok_or_else(invariant)?;
                        let previous = old.checked_sub(1).map(|index| moved[index]);
                        let target = moved.remove(old);
                        let at = match after {
                            None => 0,
                            Some(after) => {
                                moved
                                    .iter()
                                    .position(|id| *id == after)
                                    .ok_or_else(invariant)?
                                    + 1
                            }
                        };
                        moved.insert(at, target);
                        if !normalize && before != moved {
                            accounting.charge_ordered_child_pair(
                                address
                                    .iter()
                                    .flatten()
                                    .chain(previous)
                                    .chain(after.as_ref())
                                    .chain([raw]),
                            )?;
                            count += 1;
                        }
                        if normalize && moved != final_order {
                            if facts.effect_count != 2 {
                                return Err(invariant());
                            }
                            accounting.charge_order_pair(
                                address.iter().flatten(),
                                &moved,
                                &final_order,
                            )?;
                            count += 1;
                        }
                    }
                }
            }
        }
        if split_insert {
            let skip = if facts.command_id == CommandId::MeasureInsert {
                2
            } else {
                1
            };
            charge_affected(
                facts.affected.get(skip..).ok_or_else(invariant)?,
                accounting,
                reservation,
                &mut affected,
            )?;
        } else if !before_all
            && !matches!(
                facts.command_id,
                CommandId::RangeDelete | CommandId::RangeTransposeWrittenPitch
            )
        {
            charge_affected(&facts.affected, accounting, reservation, &mut affected)?;
        }
        Ok(count)
    }

    fn charge_measure_content_orders(
        &self,
        bundle: &measure::MeasureBundle,
        accounting: &mut ChangeSetAccountingV1,
    ) -> Outcome<u64> {
        let raw = &bundle.definition.image.nodes[0].image.raw_id;
        for content in &bundle.contents {
            let address = self.accounting_address(content.owner)?;
            let anchor = content
                .anchor
                .map(|id| self.accounting_raw(id))
                .transpose()?;
            accounting
                .charge_ordered_child_pair(address.iter().flatten().chain(anchor).chain([raw]))?;
        }
        Ok(bundle.contents.len() as u64)
    }
}

fn charge_extension(
    edit: &extension_edits::StoredExtensionEdit,
    accounting: &mut ChangeSetAccountingV1,
) -> Outcome {
    let owner = match &edit.key.owner {
        crate::change_set::StableExtensionOwnerV1::Score => None,
        crate::change_set::StableExtensionOwnerV1::Part { part_id } => Some(part_id.as_js_string()),
    };
    let expected = edit.expected.as_ref().map(|block| &block.value);
    let value = edit.value.as_ref().map(|block| &block.value);
    let anchor = (edit.expected.is_none() || edit.value.is_none())
        .then_some(())
        .and_then(|_| edit.expected.as_ref().or(edit.value.as_ref()))
        .and_then(|block| match &block.anchor {
            StableAnchorV1::Start => None,
            StableAnchorV1::After { sibling_id } => Some(sibling_id.as_js_string()),
        });
    let strings = std::iter::once(&edit.key.namespace)
        .chain(owner)
        .chain(anchor);
    match (expected, value) {
        (Some(expected), Some(value)) => {
            accounting.charge_extension_pair(strings, &[expected, value])?
        }
        (Some(value), None) | (None, Some(value)) => {
            accounting.charge_extension_pair(strings, &[value])?
        }
        (None, None) => return Err(invariant()),
    }
    Ok(())
}

impl Recorder<'_> {
    /// Module segments have their own source and affected facts. Never label
    /// their primitive effects as a Core leaf merely to reuse charging.
    pub(super) fn charge_module_segment(
        &mut self,
        start: usize,
        accounting: &mut ChangeSetAccountingV1,
        addresses: &[AffectedEntityAddressV1],
        output: &mut Vec<AffectedEntityAddressV1>,
    ) -> Outcome<u64> {
        let result = (|| {
            for step in self.steps.get(start..).ok_or_else(invariant)? {
                match &step.forward {
                    Operation::Extension(edit) => charge_extension(edit, accounting)?,
                    Operation::ReplaceScalar {
                        target,
                        expected,
                        value,
                    } if matches!(value.as_ref(), Value::NoteWrittenPitch(_)) => {
                        accounting.charge_scalar_pair(
                            self.accounting_raw(*target)?,
                            expected,
                            value,
                        )?;
                    }
                    _ => return Err(invariant()),
                }
            }
            charge_affected(
                addresses,
                accounting,
                &mut self.candidate.reservation,
                &mut Some(output),
            )?;
            Ok((self.steps.len() - start) as u64)
        })();
        if result.is_err() {
            self.candidate.reservation.abort();
        }
        result
    }
}
