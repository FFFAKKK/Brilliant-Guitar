use brilliant_core_types::JsString;
use std::collections::HashSet;

use super::{Assessment, Code, Entity, Failure, FinalValidationDeltaV1, Order, Owner};
use crate::{
    change_set::{ReferenceAddressV1 as Reference, ReferenceValueV1},
    overlay::CoreBaseReadV1,
    records::EventContentKind,
    transaction::StableRecordV1,
    validation_diagnostics::{EventField, Location, RootCollection},
};

impl Assessment<'_, '_> {
    pub(super) fn check_hierarchy(
        &mut self,
        base: &dyn CoreBaseReadV1,
        delta: &FinalValidationDeltaV1<'_>,
    ) -> Result<(), Failure> {
        let mut staffs = Vec::new();
        for record in delta.records.values() {
            if let StableRecordV1::Staff(staff) = record {
                staffs.try_reserve(1).map_err(|_| Failure::InternalError)?;
                staffs.push(staff);
            }
        }
        staffs.sort_unstable_by(|left, right| left.id.as_js_string().cmp(right.id.as_js_string()));
        for staff in staffs {
            self.work.rules_evaluated += 1;
            if staff.line_count.get() <= 0 {
                let Owner::Part { part_id: part } = self.owner(&Entity::Staff {
                    staff_id: staff.id.clone(),
                })?
                else {
                    return Err(Failure::InternalError);
                };
                self.diagnostics.add(
                    Location::StaffLines {
                        part,
                        staff: staff.id.clone(),
                    },
                    Code::StaffLineCountInvalid,
                    None,
                )?;
            }
        }
        // The collector's ordered list is deterministic and deduplicated. Only
        // touched containers are tested; deleted owners have no final obligation.
        for order in delta.orders {
            self.check_required_order(order)?;
        }

        let mut references = HashSet::new();
        for address in delta.references.keys() {
            insert_reference(&mut references, address)?;
        }
        // Staff identity changes may invalidate untouched referring records.
        // Existing references come from the target index; new/changed references
        // are already included above. Final overlay values decide membership.
        let mut targets = Vec::new();
        for entity in delta.entities.keys() {
            if let Entity::Staff { staff_id } = entity {
                targets.try_reserve(1).map_err(|_| Failure::InternalError)?;
                targets.push(staff_id);
            }
        }
        targets.sort_unstable_by(|left, right| left.as_js_string().cmp(right.as_js_string()));
        for staff in targets {
            self.work.dependency_reads += 1;
            for address in base.list_references_to(staff) {
                self.work.dependency_reads += 1;
                insert_reference(&mut references, &address)?;
            }
        }
        let mut sorted = Vec::new();
        sorted
            .try_reserve(references.len())
            .map_err(|_| Failure::InternalError)?;
        sorted.extend(references);
        sorted.sort_unstable_by(|left, right| reference_key(left).cmp(&reference_key(right)));
        for reference in sorted {
            self.check_staff_reference(reference)?;
        }
        Ok(())
    }

    fn order_is_empty(&mut self, order: &Order) -> Result<bool, Failure> {
        self.work.dependency_reads += 1;
        let mut empty = true;
        self.overlay
            .visit_order(order, &mut |_| {
                self.work.dependency_reads += 1;
                empty = false;
                false
            })
            .ok_or(Failure::InternalError)?;
        self.work.rules_evaluated += 1;
        Ok(empty)
    }

    fn owner_exists(&mut self, entity: &Entity) -> bool {
        self.work.dependency_reads += 1;
        self.overlay.read_owner(entity).is_some()
    }

    fn check_required_order(&mut self, order: &Order) -> Result<(), Failure> {
        let (location, code) = match order {
            Order::Measures { .. } => (
                Location::Root(RootCollection::Measures),
                Code::MeasureRequired,
            ),
            Order::Parts { .. } => (Location::Root(RootCollection::Parts), Code::PartRequired),
            Order::Staffs { part_id } => {
                if !self.owner_exists(&Entity::Part {
                    part_id: part_id.clone(),
                }) {
                    return Ok(());
                }
                (
                    Location::Staffs {
                        part: part_id.clone(),
                    },
                    Code::StaffRequired,
                )
            }
            Order::Voices {
                part_id,
                measure_id,
            } => {
                if !self.owner_exists(&Entity::Part {
                    part_id: part_id.clone(),
                }) || !self.owner_exists(&Entity::Measure {
                    measure_id: measure_id.clone(),
                }) {
                    return Ok(());
                }
                (
                    Location::Voices {
                        part: part_id.clone(),
                        measure: measure_id.clone(),
                    },
                    Code::VoiceRequired,
                )
            }
            Order::Notes { event_id } => {
                self.work.dependency_reads += 1;
                if self.overlay.read_event_content_kind(event_id) != Some(EventContentKind::Notes) {
                    return Ok(());
                }
                // Valid chords need no owner/path queries at all.
                if !self.order_is_empty(order)? {
                    return Ok(());
                }
                let Owner::Voice { voice_id } = self.owner(&Entity::Event {
                    event_id: event_id.clone(),
                })?
                else {
                    return Err(Failure::InternalError);
                };
                let route = self.voice_route(voice_id)?;
                return self.diagnostics.add(
                    Location::Event {
                        route,
                        event: event_id.clone(),
                        field: EventField::Notes,
                    },
                    Code::NotesRequired,
                    None,
                );
            }
            Order::MeasureContents { .. } | Order::Events { .. } | Order::Extensions { .. } => {
                return Ok(());
            }
        };
        if self.order_is_empty(order)? {
            self.diagnostics.add(location, code, None)?;
        }
        Ok(())
    }

    fn check_staff_reference(&mut self, address: Reference) -> Result<(), Failure> {
        self.work.dependency_reads += 1;
        let Some(value) = self.overlay.read_reference(&address) else {
            return Ok(());
        };
        let (route, staff, event) = match (address, value) {
            (Reference::VoiceDefaultStaff { voice_id }, ReferenceValueV1::StableId(staff)) => {
                (self.voice_route(voice_id)?, staff, None)
            }
            (
                Reference::EventStaffAssignment { event_id },
                ReferenceValueV1::OptionalStableId(Some(staff)),
            ) => {
                let Owner::Voice { voice_id } = self.owner(&Entity::Event {
                    event_id: event_id.clone(),
                })?
                else {
                    return Err(Failure::InternalError);
                };
                (self.voice_route(voice_id)?, staff, Some(event_id))
            }
            (Reference::EventStaffAssignment { .. }, ReferenceValueV1::OptionalStableId(None)) => {
                return Ok(());
            }
            _ => return Err(Failure::InternalError),
        };
        self.work.dependency_reads += 1;
        self.work.rules_evaluated += 1;
        if self.overlay.read_owner(&Entity::Staff { staff_id: staff })
            != Some(Owner::Part {
                part_id: route.part.clone(),
            })
        {
            let location = if let Some(event) = event {
                Location::Event {
                    route,
                    event,
                    field: EventField::Staff,
                }
            } else {
                Location::VoiceStaff(route)
            };
            self.diagnostics
                .add(location, Code::StaffReferenceMissing, None)?;
        }
        Ok(())
    }
}

fn insert_reference(set: &mut HashSet<Reference>, address: &Reference) -> Result<(), Failure> {
    if matches!(
        address,
        Reference::VoiceDefaultStaff { .. } | Reference::EventStaffAssignment { .. }
    ) {
        set.try_reserve(1).map_err(|_| Failure::InternalError)?;
        set.insert(address.clone());
    }
    Ok(())
}

fn reference_key(address: &Reference) -> (u8, &JsString) {
    match address {
        Reference::VoiceDefaultStaff { voice_id } => (0, voice_id.as_js_string()),
        Reference::EventStaffAssignment { event_id } => (1, event_id.as_js_string()),
        _ => unreachable!(),
    }
}
