//! Only changed candidate state becomes physical records. Hidden prefix roots
//! are expanded along their frozen owner routes; unrelated base entities are
//! never enumerated. Dead temporary raw IDs never become StableIds.
use super::*;
use crate::{records::*, transaction::StableRecordV1};
use std::hash::Hash;

type Error = TransactionPrepareFailureV1;
type Result<T> = std::result::Result<T, Error>;

fn put<K: Eq + Hash, V>(map: &mut HashMap<K, V>, key: K, value: V) -> Result<()> {
    map.try_reserve(1).map_err(|_| Error::Capacity)?;
    map.insert(key, value);
    Ok(())
}
fn add<T: Eq + Hash>(set: &mut HashSet<T>, value: T) -> Result<()> {
    set.try_reserve(1).map_err(|_| Error::Capacity)?;
    set.insert(value);
    Ok(())
}
fn push<T>(values: &mut Vec<T>, value: T) -> Result<()> {
    values.try_reserve(1).map_err(|_| Error::Capacity)?;
    values.push(value);
    Ok(())
}

fn child_orders(kind: Kind) -> &'static [Children] {
    match kind {
        Kind::Document => &[Children::Measures, Children::Parts],
        Kind::Part => &[Children::Staffs, Children::Contents],
        Kind::Content => &[Children::Voices],
        Kind::Voice => &[Children::Events],
        Kind::Event => &[Children::Notes],
        _ => &[],
    }
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

impl StableCandidateView<'_> {
    pub(super) fn collect_suffix_delta(&self) -> Result<FinalStateDeltaV1> {
        let mut delta = FinalStateDeltaV1::default();
        let mut removed = HashSet::new();
        {
            let candidate = self.candidate.borrow();
            for source in &candidate.hidden {
                if !matches!(source, Occurrence::Added(_)) {
                    collect_removed_prefix(&candidate, source, &mut removed)?;
                }
            }
        }
        // Deletion first, insertion second: a rebirth keeps the removed identity
        // marker even when its final stable address and fields are identical.
        for source in removed {
            self.append_source(&mut delta, &source, false)?;
        }
        let node_count = self.candidate.borrow().nodes.len();
        for index in 0..node_count {
            let source = Occurrence::Added(index);
            if self.candidate.borrow().visible(&source) {
                self.append_source(&mut delta, &source, true)?;
            }
        }
        let candidate = self.candidate.borrow();
        for (source, value) in &candidate.values {
            if !matches!(source, Occurrence::Prefix(_)) || !candidate.visible(source) {
                continue;
            }
            let address = scalar_address(
                &candidate
                    .strong_address(source)
                    .ok_or(Error::LocalInvariant)?,
            )?;
            put(&mut delta.scalar_values, address, value.clone())?;
            touch_time(&candidate, &mut delta, source)?;
        }
        for (source, instrument) in &candidate.instruments {
            if !matches!(source, Occurrence::Prefix(_)) || !candidate.visible(source) {
                continue;
            }
            let Entity::Part { part_id } = candidate
                .strong_address(source)
                .ok_or(Error::LocalInvariant)?
            else {
                return Err(Error::LocalInvariant);
            };
            put(
                &mut delta.scalar_values,
                Scalar::PartInstrument { part_id },
                Value::PartInstrument(instrument.clone()),
            )?;
        }
        for (source, value) in &candidate.staff_references {
            if !matches!(source, Occurrence::Prefix(_)) || !candidate.visible(source) {
                continue;
            }
            let address = candidate
                .strong_address(source)
                .ok_or(Error::LocalInvariant)?;
            let (reference, value) = staff_reference(&address, value.as_ref())?;
            put(&mut delta.reference_states, reference, Some(value))?;
        }
        // Changed lists can contain transient hidden children. Only final IDs
        // from the validated adapter are supplied to physical order preparation.
        let mut orders = Vec::new();
        orders
            .try_reserve(candidate.orders.len())
            .map_err(|_| Error::Capacity)?;
        for order in candidate.orders.keys() {
            if candidate.visible(&order.owner) {
                orders.push(order.clone());
            }
        }
        drop(candidate);
        for order in orders {
            push(
                &mut delta.order_addresses,
                self.strong_order(&order).ok_or(Error::LocalInvariant)?,
            )?;
        }
        Ok(delta)
    }

    fn append_source(
        &self,
        delta: &mut FinalStateDeltaV1,
        source: &Occurrence,
        present: bool,
    ) -> Result<()> {
        let candidate = self.candidate.borrow();
        let kind = candidate.kind(source).ok_or(Error::LocalInvariant)?;
        let owner = candidate.owner(source).ok_or(Error::LocalInvariant)?;
        let parent =
            CandidateOrder::new(&owner, parent_children(kind).ok_or(Error::LocalInvariant)?);
        let mut orders = Vec::new();
        push(&mut orders, parent)?;
        for children in child_orders(kind) {
            push(&mut orders, CandidateOrder::new(source, *children))?;
        }
        if kind == Kind::Content {
            let Entity::Part { part_id } = candidate
                .strong_address(&owner)
                .ok_or(Error::LocalInvariant)?
            else {
                return Err(Error::LocalInvariant);
            };
            let measure_id = StableId::new(candidate.raw_id(source).ok_or(Error::LocalInvariant)?)
                .map_err(|_| Error::LocalInvariant)?;
            put(
                &mut delta.reference_states,
                Reference::PartMeasureLink {
                    part_id,
                    measure_id,
                },
                present.then_some(ReferenceValueV1::Present(true)),
            )?;
        } else {
            let address = candidate
                .strong_address(source)
                .ok_or(Error::LocalInvariant)?;
            if !present {
                add(&mut delta.removed_entities, address.clone())?;
            }
            if matches!(kind, Kind::Voice | Kind::Event) {
                let reference = match &address {
                    Entity::Voice { voice_id } => Reference::VoiceDefaultStaff {
                        voice_id: voice_id.clone(),
                    },
                    Entity::Event { event_id } => Reference::EventStaffAssignment {
                        event_id: event_id.clone(),
                    },
                    _ => return Err(Error::LocalInvariant),
                };
                let value = if present {
                    let raw = candidate
                        .read_staff_reference(source)
                        .ok_or(Error::LocalInvariant)?;
                    Some(staff_reference(&address, raw.as_ref())?.1)
                } else {
                    None
                };
                put(&mut delta.reference_states, reference, value)?;
            }
            touch_time(&candidate, delta, source)?;
            drop(candidate);
            let record = if present {
                Some(self.final_record(source)?)
            } else {
                None
            };
            put(&mut delta.entity_states, address, record)?;
        }
        // strong_order maps retained owner identities even if their old lifetime
        // is hidden. The read side subsequently supplies absence or a rebirth.
        for order in orders {
            push(
                &mut delta.order_addresses,
                self.strong_order(&order).ok_or(Error::LocalInvariant)?,
            )?;
        }
        Ok(())
    }

    fn final_record(&self, source: &Occurrence) -> Result<StableRecordV1> {
        let mut candidate = self.candidate.borrow_mut();
        let id = candidate
            .strong_address(source)
            .ok_or(Error::LocalInvariant)?
            .stable_id()
            .clone();
        Ok(
            match candidate.read_value(source).ok_or(Error::LocalInvariant)? {
                Value::MeasureDefinition {
                    meter,
                    pickup_duration,
                } => StableRecordV1::Measure(MeasureRecord {
                    id,
                    meter,
                    pickup_duration,
                }),
                Value::PartName(name) => StableRecordV1::Part(PartRecord {
                    id,
                    name,
                    instrument: candidate
                        .read_instrument(source)
                        .ok_or(Error::LocalInvariant)?,
                }),
                Value::StaffDefinition {
                    line_count,
                    default_clef,
                } => StableRecordV1::Staff(StaffRecord {
                    id,
                    line_count,
                    default_clef,
                }),
                Value::VoiceSequenceStart(sequence_start) => StableRecordV1::Voice(VoiceRecord {
                    id,
                    sequence_start,
                    default_staff_id: StableId::new(
                        candidate
                            .read_staff_reference(source)
                            .flatten()
                            .ok_or(Error::LocalInvariant)?,
                    )
                    .map_err(|_| Error::LocalInvariant)?,
                }),
                Value::EventNoteValue(duration) => StableRecordV1::Event(EventRecord {
                    id,
                    duration,
                    staff_id: candidate
                        .read_staff_reference(source)
                        .ok_or(Error::LocalInvariant)?
                        .map(StableId::new)
                        .transpose()
                        .map_err(|_| Error::LocalInvariant)?,
                    content_kind: candidate
                        .read_content_kind(source)
                        .ok_or(Error::LocalInvariant)?,
                }),
                Value::NoteWrittenPitch(written_pitch) => {
                    StableRecordV1::Note(NoteRecord { id, written_pitch })
                }
                _ => return Err(Error::LocalInvariant),
            },
        )
    }
}

fn collect_removed_prefix(
    candidate: &Candidate<'_>,
    source: &Occurrence,
    removed: &mut HashSet<Occurrence>,
) -> Result<()> {
    if removed.contains(source) {
        return Ok(());
    }
    add(removed, source.clone())?;
    let kind = candidate.kind(source).ok_or(Error::LocalInvariant)?;
    for children in child_orders(kind) {
        let order = CandidateOrder::new(source, *children);
        let stable = order.prefix_order().ok_or(Error::LocalInvariant)?;
        let mut ids = Vec::new();
        let mut capacity_failed = false;
        let visited = candidate.prefix.visit_order(&stable, &mut |id| {
            if push(&mut ids, id.clone()).is_err() {
                capacity_failed = true;
                return false;
            }
            true
        });
        if capacity_failed {
            return Err(Error::Capacity);
        }
        if visited.is_none() {
            return Err(Error::LocalInvariant);
        }
        for id in ids {
            collect_removed_prefix(candidate, &order.prefix_child(&id), removed)?;
        }
    }
    Ok(())
}

fn scalar_address(entity: &Entity) -> Result<Scalar> {
    Ok(match entity {
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

fn staff_reference(
    entity: &Entity,
    raw: Option<&JsString>,
) -> Result<(Reference, ReferenceValueV1)> {
    let stable = raw
        .map(StableId::new)
        .transpose()
        .map_err(|_| Error::LocalInvariant)?;
    match entity {
        Entity::Voice { voice_id } => Ok((
            Reference::VoiceDefaultStaff {
                voice_id: voice_id.clone(),
            },
            ReferenceValueV1::StableId(stable.ok_or(Error::LocalInvariant)?),
        )),
        Entity::Event { event_id } => Ok((
            Reference::EventStaffAssignment {
                event_id: event_id.clone(),
            },
            ReferenceValueV1::OptionalStableId(stable),
        )),
        _ => Err(Error::LocalInvariant),
    }
}

fn touch_time(
    candidate: &Candidate<'_>,
    delta: &mut FinalStateDeltaV1,
    source: &Occurrence,
) -> Result<()> {
    match candidate
        .strong_address(source)
        .ok_or(Error::LocalInvariant)?
    {
        Entity::Voice { voice_id } => add(&mut delta.touched_voice_ids, voice_id),
        Entity::Event { .. } => {
            let owner = candidate.owner(source).ok_or(Error::LocalInvariant)?;
            let Entity::Voice { voice_id } = candidate
                .strong_address(&owner)
                .ok_or(Error::LocalInvariant)?
            else {
                return Err(Error::LocalInvariant);
            };
            add(&mut delta.touched_voice_ids, voice_id)
        }
        _ => Ok(()),
    }
}
