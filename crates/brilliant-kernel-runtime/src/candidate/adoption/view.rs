//! Stable, read-only projection shared by sealed structural and final views.
use super::*;
use crate::change_set::{AnchoredExtensionBlockV1, EntityBundleV1};
use crate::overlay::{ExtensionHeaderReadFailureV1, ExtensionHeaderV1, ExtensionKeyV1};
mod bundles;
#[cfg(test)]
mod tests;

impl Candidate<'_> {
    /// Retained identity is also needed for hidden prefix deletion deltas.
    pub(super) fn strong_address(&self, source: &Occurrence) -> Option<Entity> {
        if let Occurrence::Prefix(entity) = source {
            return Some(entity.as_ref().clone());
        }
        let id = StableId::new(self.raw_id(source)?).ok()?;
        Some(match self.kind(source)? {
            Kind::Document => Entity::Document { document_id: id },
            Kind::Measure => Entity::Measure { measure_id: id },
            Kind::Part => Entity::Part { part_id: id },
            Kind::Staff => Entity::Staff { staff_id: id },
            Kind::Voice => Entity::Voice { voice_id: id },
            Kind::Event => Entity::Event { event_id: id },
            Kind::Note => Entity::Note { note_id: id },
            Kind::Content => return None,
        })
    }

    fn final_occurrence(&self, entity: &Entity) -> Option<Occurrence> {
        let kind = Kind::of(entity);
        let id = entity.stable_id();
        if let Some(indices) = self
            .added
            .get(&kind)
            .and_then(|ids| ids.get(id.as_js_string()))
        {
            for index in indices {
                let source = Occurrence::Added(*index);
                if self.visible(&source) {
                    return Some(source);
                }
            }
        }
        if self.prefix.frozen_resolve_entity_address(id).as_ref() != Some(entity) {
            return None;
        }
        let source = Occurrence::prefix(entity.clone());
        self.visible(&source).then_some(source)
    }

    fn final_content(&self, part_id: &StableId, measure_id: &StableId) -> Option<Occurrence> {
        let part = self.final_occurrence(&Entity::Part {
            part_id: part_id.clone(),
        })?;
        let order = CandidateOrder::new(&part, Children::Contents);
        if let Some(contents) = self.orders.get(&order) {
            return contents
                .iter()
                .find(|source| {
                    self.visible(source) && self.raw_id(source) == Some(measure_id.as_js_string())
                })
                .cloned();
        }
        let Occurrence::Prefix(part) = part else {
            return None;
        };
        let source = Occurrence::PrefixContent {
            part,
            measure_id: Arc::new(measure_id.clone()),
        };
        self.visible(&source).then_some(source)
    }
}

impl StableCandidateView<'_> {
    pub(super) fn occurrence(&self, address: &Entity) -> Option<Occurrence> {
        self.candidate.borrow().final_occurrence(address)
    }

    pub(super) fn strong_order(&self, order: &CandidateOrder) -> Option<Order> {
        let candidate = self.candidate.borrow();
        if order.children == Children::Voices {
            let part = candidate.owner(&order.owner)?;
            let Entity::Part { part_id } = candidate.strong_address(&part)? else {
                return None;
            };
            return Some(Order::Voices {
                part_id,
                measure_id: StableId::new(candidate.raw_id(&order.owner)?).ok()?,
            });
        }
        let owner = candidate.strong_address(&order.owner)?;
        CandidateOrder::new(&Occurrence::prefix(owner), order.children).prefix_order()
    }

    pub(super) fn candidate_order(&self, address: &Order) -> Option<CandidateOrder> {
        let (owner, children) = match address {
            Order::Measures { document_id } => (
                Entity::Document {
                    document_id: document_id.clone(),
                },
                Children::Measures,
            ),
            Order::Parts { document_id } => (
                Entity::Document {
                    document_id: document_id.clone(),
                },
                Children::Parts,
            ),
            Order::Staffs { part_id } => (
                Entity::Part {
                    part_id: part_id.clone(),
                },
                Children::Staffs,
            ),
            Order::MeasureContents { part_id } => (
                Entity::Part {
                    part_id: part_id.clone(),
                },
                Children::Contents,
            ),
            Order::Events { voice_id } => (
                Entity::Voice {
                    voice_id: voice_id.clone(),
                },
                Children::Events,
            ),
            Order::Notes { event_id } => (
                Entity::Event {
                    event_id: event_id.clone(),
                },
                Children::Notes,
            ),
            Order::Voices {
                part_id,
                measure_id,
            } => {
                return Some(CandidateOrder::new(
                    &self.candidate.borrow().final_content(part_id, measure_id)?,
                    Children::Voices,
                ));
            }
            Order::Extensions { .. } => return None,
        };
        Some(CandidateOrder::new(&self.occurrence(&owner)?, children))
    }
}

impl CoreBaseReadV1 for StableCandidateView<'_> {
    fn resolve_entity(&self, id: &StableId) -> Option<Entity> {
        let candidate = self.candidate.borrow();
        for kind in [
            Kind::Document,
            Kind::Measure,
            Kind::Part,
            Kind::Staff,
            Kind::Voice,
            Kind::Event,
            Kind::Note,
        ] {
            if let Some(indices) = candidate
                .added
                .get(&kind)
                .and_then(|ids| ids.get(id.as_js_string()))
            {
                for index in indices {
                    let source = Occurrence::Added(*index);
                    if candidate.visible(&source) {
                        return candidate.strong_address(&source);
                    }
                }
            }
        }
        let entity = candidate.prefix.frozen_resolve_entity_address(id)?;
        candidate
            .visible(&Occurrence::prefix(entity.clone()))
            .then_some(entity)
    }

    fn read_owner(&self, address: &Entity) -> Option<Owner> {
        let source = self.occurrence(address)?;
        let candidate = self.candidate.borrow();
        let owner = candidate.owner(&source)?;
        if candidate.kind(&owner)? == Kind::Content {
            let part = candidate.owner(&owner)?;
            let Entity::Part { part_id } = candidate.strong_address(&part)? else {
                return None;
            };
            return Some(Owner::PartMeasure {
                part_id,
                measure_id: StableId::new(candidate.raw_id(&owner)?).ok()?,
            });
        }
        Some(match candidate.strong_address(&owner)? {
            Entity::Document { document_id } => Owner::Document { document_id },
            Entity::Part { part_id } => Owner::Part { part_id },
            Entity::Voice { voice_id } => Owner::Voice { voice_id },
            Entity::Event { event_id } => Owner::Event { event_id },
            _ => return None,
        })
    }

    fn read_scalar(&self, address: &Scalar) -> Option<Value> {
        let entity = match address {
            Scalar::DocumentMetadata { document_id } => Entity::Document {
                document_id: document_id.clone(),
            },
            Scalar::MeasureDefinition { measure_id } => Entity::Measure {
                measure_id: measure_id.clone(),
            },
            Scalar::PartName { part_id } | Scalar::PartInstrument { part_id } => Entity::Part {
                part_id: part_id.clone(),
            },
            Scalar::StaffDefinition { staff_id } => Entity::Staff {
                staff_id: staff_id.clone(),
            },
            Scalar::VoiceSequenceStart { voice_id } => Entity::Voice {
                voice_id: voice_id.clone(),
            },
            Scalar::EventNoteValue { event_id } => Entity::Event {
                event_id: event_id.clone(),
            },
            Scalar::NoteWrittenPitch { note_id } => Entity::Note {
                note_id: note_id.clone(),
            },
        };
        let source = self.occurrence(&entity)?;
        let candidate = self.candidate.borrow();
        if matches!(address, Scalar::PartInstrument { .. }) {
            if let Some(value) = candidate.instruments.get(&source) {
                return Some(Value::PartInstrument(value.clone()));
            }
            if let Occurrence::Added(index) = source {
                return candidate.nodes[index]
                    .instrument
                    .clone()
                    .map(Value::PartInstrument);
            }
        } else {
            if let Some(value) = candidate.values.get(&source) {
                return Some(value.clone());
            }
            if let Occurrence::Added(index) = source {
                return candidate.nodes[index].value.clone();
            }
        }
        candidate.prefix.frozen_read_scalar(address)
    }

    fn detach_entity(&self, address: &Entity) -> Option<EntityBundleV1> {
        // Typed history replay needs actual local bundles for preconditions.
        // Final commit preparation continues to consume scalar records/orders.
        self.detach_bundle(address)
    }

    fn read_event_content_kind(&self, event_id: &StableId) -> Option<EventContentKind> {
        let source = self.occurrence(&Entity::Event {
            event_id: event_id.clone(),
        })?;
        let candidate = self.candidate.borrow();
        match source {
            Occurrence::Added(index) => candidate.nodes[index].content_kind,
            Occurrence::Prefix(_) => candidate.prefix.frozen_read_event_content_kind(event_id),
            _ => None,
        }
    }

    fn read_order(&self, address: &Order) -> Option<Vec<StableId>> {
        let mut ids = Vec::new();
        self.visit_order(address, &mut |id| {
            ids.push(id.clone());
            true
        })?;
        Some(ids)
    }

    fn visit_order(
        &self,
        address: &Order,
        visitor: &mut dyn FnMut(&StableId) -> bool,
    ) -> Option<()> {
        if let Order::Extensions { document_id } = address {
            self.occurrence(&Entity::Document {
                document_id: document_id.clone(),
            })?;
            return self.candidate.borrow().visit_extension_order(visitor);
        }
        let order = self.candidate_order(address)?;
        let candidate = self.candidate.borrow();
        if let Some(children) = candidate.orders.get(&order) {
            for child in children {
                if !candidate.visible(child) {
                    continue;
                }
                let id = StableId::new(candidate.raw_id(child)?).ok()?;
                if !visitor(&id) {
                    break;
                }
            }
            Some(())
        } else {
            candidate
                .prefix
                .visit_order(&order.prefix_order()?, &mut |id| {
                    !candidate.visible(&order.prefix_child(id)) || visitor(id)
                })
        }
    }

    fn read_extension(&self, key: &ExtensionKeyV1) -> Option<AnchoredExtensionBlockV1> {
        self.candidate.borrow().read_extension(key)
    }

    fn visit_extension_headers(
        &self,
        visitor: &mut dyn FnMut(&ExtensionHeaderV1) -> bool,
    ) -> Result<(), ExtensionHeaderReadFailureV1> {
        self.candidate.borrow().visit_extension_headers(visitor)
    }

    fn read_reference(&self, address: &Reference) -> Option<ReferenceValueV1> {
        match address {
            Reference::VoiceDefaultStaff { voice_id } => {
                let source = self.occurrence(&Entity::Voice {
                    voice_id: voice_id.clone(),
                })?;
                let id = self.candidate.borrow().read_staff_reference(&source)??;
                Some(ReferenceValueV1::StableId(StableId::new(&id).ok()?))
            }
            Reference::EventStaffAssignment { event_id } => {
                let source = self.occurrence(&Entity::Event {
                    event_id: event_id.clone(),
                })?;
                let id = self.candidate.borrow().read_staff_reference(&source)?;
                Some(ReferenceValueV1::OptionalStableId(
                    id.as_ref().map(StableId::new).transpose().ok()?,
                ))
            }
            Reference::PartMeasureLink {
                part_id,
                measure_id,
            } => {
                self.occurrence(&Entity::Part {
                    part_id: part_id.clone(),
                })?;
                self.occurrence(&Entity::Measure {
                    measure_id: measure_id.clone(),
                })?;
                Some(ReferenceValueV1::Present(
                    self.candidate
                        .borrow()
                        .final_content(part_id, measure_id)
                        .is_some(),
                ))
            }
            Reference::ExtensionOwner { namespace, owner } => self
                .candidate
                .borrow()
                .read_extension_reference(namespace, owner),
        }
    }

    fn list_references_to(&self, target_id: &StableId) -> Vec<Reference> {
        let mut result = Vec::new();
        let prefix = self.candidate.borrow().prefix.list_references_to(target_id);
        for reference in prefix {
            let matches = match self.read_reference(&reference) {
                Some(ReferenceValueV1::StableId(id)) => &id == target_id,
                Some(ReferenceValueV1::OptionalStableId(Some(id))) => &id == target_id,
                Some(ReferenceValueV1::Present(true)) => {
                    matches!(&reference, Reference::PartMeasureLink { measure_id, .. } if measure_id == target_id)
                }
                Some(ReferenceValueV1::ExtensionOwner(
                    brilliant_score_foundation::ExtensionOwnerV1::Part { part_id },
                )) => &part_id == target_id,
                _ => false,
            };
            if matches && !result.contains(&reference) {
                result.push(reference);
            }
        }
        let candidate = self.candidate.borrow();
        for reference in candidate.changed_extension_references_to(target_id) {
            if !result.contains(&reference) {
                result.push(reference);
            }
        }
        for source in candidate.staff_referrers(target_id.as_js_string()) {
            let reference = match candidate.strong_address(&source) {
                Some(Entity::Voice { voice_id }) => Reference::VoiceDefaultStaff { voice_id },
                Some(Entity::Event { event_id }) => Reference::EventStaffAssignment { event_id },
                _ => continue,
            };
            if !result.contains(&reference) {
                result.push(reference);
            }
        }
        // Content is owner-scoped and deliberately absent from the global ID index.
        for order in candidate
            .orders
            .keys()
            .filter(|order| order.children == Children::Contents && candidate.visible(&order.owner))
        {
            let Some(Entity::Part { part_id }) = candidate.strong_address(&order.owner) else {
                continue;
            };
            if candidate.final_content(&part_id, target_id).is_some() {
                let reference = Reference::PartMeasureLink {
                    part_id,
                    measure_id: target_id.clone(),
                };
                if !result.contains(&reference) {
                    result.push(reference);
                }
            }
        }
        result
    }

    fn read_voice_time(&self, voice_id: &StableId) -> Option<Vec<StableId>> {
        self.read_order(&Order::Events {
            voice_id: voice_id.clone(),
        })
    }
}
