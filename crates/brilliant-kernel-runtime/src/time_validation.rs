use std::{
    cmp::Ordering,
    collections::{HashMap, HashSet},
};

use brilliant_score_foundation::{
    ExactFraction, FractionV1, assess_measure_duration, assess_note_duration,
    meter_denominator_is_valid,
};

use super::{
    Assessment, Code, Entity, Failure, FinalValidationDeltaV1, Order, Scalar, Value, insert_id,
    sorted_ids,
};
use crate::{
    change_set::{ReferenceAddressV1 as Reference, ReferenceValueV1},
    overlay::CoreBaseReadV1,
    records::MeasureRecord,
    transaction::StableRecordV1,
    validation_diagnostics::{EventField, Location, MeasureField, VoiceRoute},
};

impl Assessment<'_, '_> {
    pub(super) fn check_time(
        &mut self,
        base: &dyn CoreBaseReadV1,
        delta: &FinalValidationDeltaV1<'_>,
    ) -> Result<(), Failure> {
        let mut voices = HashSet::new();
        for voice in delta.touched_voices {
            insert_id(&mut voices, voice)?;
        }
        let mut measures = HashSet::new();
        for record in delta.records.values() {
            if let StableRecordV1::Measure(measure) = record {
                insert_id(&mut measures, &measure.id)?;
            }
        }
        // Resolve base referrers with the target index. Scan the changed
        // reference delta once, rather than once for every changed measure.
        let mut links = HashSet::new();
        if !measures.is_empty() {
            for address in delta.references.keys() {
                self.charge_dependency_reads(1)?;
                if let Reference::PartMeasureLink { measure_id, .. } = address
                    && measures.contains(measure_id)
                {
                    links.try_reserve(1).map_err(|_| Failure::InternalError)?;
                    links.insert(address.clone());
                }
            }
        }
        for measure_id in sorted_ids(measures)? {
            let Some(StableRecordV1::Measure(measure)) = delta.records.get(&Entity::Measure {
                measure_id: measure_id.clone(),
            }) else {
                return Err(Failure::InternalError);
            };
            self.check_measure(measure)?;
            self.charge_dependency_reads(1)?;
            for address in base.list_references_to(&measure_id) {
                self.charge_dependency_reads(1)?;
                if matches!(&address, Reference::PartMeasureLink { measure_id: target, .. } if target == &measure_id)
                {
                    links.try_reserve(1).map_err(|_| Failure::InternalError)?;
                    links.insert(address);
                }
            }
        }
        // Deterministic scheduling also makes counters reproducible on the
        // failure paths; public report order is resolved separately.
        let mut sorted_links = Vec::new();
        sorted_links
            .try_reserve(links.len())
            .map_err(|_| Failure::InternalError)?;
        for address in links {
            let Reference::PartMeasureLink {
                part_id,
                measure_id,
            } = address
            else {
                return Err(Failure::InternalError);
            };
            sorted_links.push((part_id, measure_id));
        }
        sorted_links.sort_unstable_by(|left, right| {
            (left.0.as_js_string(), left.1.as_js_string())
                .cmp(&(right.0.as_js_string(), right.1.as_js_string()))
        });
        for (part_id, measure_id) in sorted_links {
            self.charge_dependency_reads(1)?;
            if self.overlay.read_reference(&Reference::PartMeasureLink {
                part_id: part_id.clone(),
                measure_id: measure_id.clone(),
            }) != Some(ReferenceValueV1::Present(true))
            {
                continue;
            }
            for voice in self.order(&Order::Voices {
                part_id,
                measure_id,
            })? {
                insert_id(&mut voices, &voice)?;
            }
        }
        let mut bounds = HashMap::new();
        for voice in sorted_ids(voices)? {
            self.charge_dependency_reads(1)?;
            if self.overlay.resolve_entity_address(&voice)
                != Some(Entity::Voice {
                    voice_id: voice.clone(),
                })
            {
                continue;
            }
            let route = self.voice_route(voice)?;
            if !bounds.contains_key(&route.measure) {
                self.charge_dependency_reads(1)?;
                let Some(Value::MeasureDefinition {
                    meter,
                    pickup_duration,
                }) = self.overlay.read_scalar(&Scalar::MeasureDefinition {
                    measure_id: route.measure.clone(),
                })
                else {
                    return Err(Failure::InternalError);
                };
                self.charge_rules(1)?;
                bounds.try_reserve(1).map_err(|_| Failure::InternalError)?;
                bounds.insert(
                    route.measure.clone(),
                    assess_measure_duration(&meter, pickup_duration.as_ref()),
                );
            }
            let bound = *bounds.get(&route.measure).ok_or(Failure::InternalError)?;
            self.check_voice_time(route, bound)?;
        }
        Ok(())
    }

    fn check_fraction(
        &mut self,
        fraction: &FractionV1,
        positive: bool,
        location: Location,
    ) -> Result<Option<ExactFraction>, Failure> {
        self.charge_rules(1)?;
        let Ok(value) = ExactFraction::from_canonical(fraction) else {
            self.diagnostics
                .add(location, Code::FractionNonCanonical, None)?;
            return Ok(None);
        };
        if if positive {
            fraction.numerator.get() <= 0
        } else {
            fraction.numerator.get() < 0
        } {
            self.diagnostics
                .add(location, Code::FractionSignInvalid, None)?;
            return Ok(None);
        }
        Ok(Some(value))
    }

    fn check_measure(&mut self, measure: &MeasureRecord) -> Result<(), Failure> {
        self.charge_rules(2)?;
        if measure.meter.numerator.get() <= 0 {
            self.diagnostics.add(
                Location::Measure {
                    id: measure.id.clone(),
                    field: MeasureField::Numerator,
                },
                Code::MeterNumeratorInvalid,
                None,
            )?;
        }
        if !meter_denominator_is_valid(measure.meter.denominator) {
            self.diagnostics.add(
                Location::Measure {
                    id: measure.id.clone(),
                    field: MeasureField::Denominator,
                },
                Code::MeterDenominatorInvalid,
                None,
            )?;
        }
        if let Some(pickup) = &measure.pickup_duration {
            let checked = self.check_fraction(
                pickup,
                true,
                Location::Measure {
                    id: measure.id.clone(),
                    field: MeasureField::Pickup,
                },
            )?;
            self.charge_rules(1)?;
            let regular = assess_measure_duration(&measure.meter, None);
            if let (Some(pickup), Ok(regular)) = (checked, regular) {
                self.charge_rules(1)?;
                let code = match pickup.checked_compare(regular) {
                    Err(_) => Some(Code::TimeArithmeticOverflow),
                    Ok(Ordering::Greater) => Some(Code::PickupExceedsMeasure),
                    _ => None,
                };
                if let Some(code) = code {
                    self.diagnostics.add(
                        Location::Measure {
                            id: measure.id.clone(),
                            field: MeasureField::Pickup,
                        },
                        code,
                        None,
                    )?;
                }
            }
        }
        Ok(())
    }

    fn check_voice_time(
        &mut self,
        route: VoiceRoute,
        bound: Result<ExactFraction, &'static str>,
    ) -> Result<(), Failure> {
        self.charge_dependency_reads(1)?;
        let Some(Value::VoiceSequenceStart(start)) =
            self.overlay.read_scalar(&Scalar::VoiceSequenceStart {
                voice_id: route.voice.clone(),
            })
        else {
            return Err(Failure::InternalError);
        };
        let mut current = self.check_fraction(&start, false, Location::Start(route.clone()))?;
        if let Err(reason) = bound {
            self.diagnostics.add(
                Location::Start(route.clone()),
                Code::MeasureDurationInvalid,
                Some(reason),
            )?;
        }
        if let (Some(position), Ok(end)) = (current, bound) {
            self.charge_rules(1)?;
            if position.checked_compare(end).is_err() {
                self.diagnostics.add(
                    Location::Start(route.clone()),
                    Code::TimeArithmeticOverflow,
                    None,
                )?;
                current = None;
            }
        }
        // Walk the entire affected final voice, including the unchanged prefix.
        // This preserves checked-arithmetic stop state. It is not yet an
        // affected-suffix optimisation; every read and arithmetic rule is counted.
        for event in self.order(&Order::Events {
            voice_id: route.voice.clone(),
        })? {
            self.charge_dependency_reads(1)?;
            let Some(Value::EventNoteValue(value)) =
                self.overlay.read_scalar(&Scalar::EventNoteValue {
                    event_id: event.clone(),
                })
            else {
                return Err(Failure::InternalError);
            };
            self.charge_rules(1)?;
            let duration = match assess_note_duration(&value) {
                Ok(duration) => duration,
                Err(reason) => {
                    let code = if reason == "fraction-overflow" {
                        Code::TimeArithmeticOverflow
                    } else {
                        Code::NoteValueInvalid
                    };
                    self.diagnostics.add(
                        Location::Event {
                            route: route.clone(),
                            event,
                            field: EventField::Duration,
                        },
                        code,
                        Some(reason),
                    )?;
                    // An invalid individual duration does not poison the
                    // preceding position; later event durations still run.
                    continue;
                }
            };
            let Some(position) = current else {
                continue;
            };
            self.charge_rules(1)?;
            let next = match position.checked_add(duration) {
                Err(_) => {
                    self.diagnostics.add(
                        Location::Event {
                            route: route.clone(),
                            event,
                            field: EventField::Duration,
                        },
                        Code::TimeArithmeticOverflow,
                        None,
                    )?;
                    current = None;
                    continue;
                }
                Ok(next) => next,
            };
            current = Some(next);
            if let Ok(end) = bound {
                self.charge_rules(1)?;
                if next.checked_compare(end).is_err() {
                    self.diagnostics.add(
                        Location::Event {
                            route: route.clone(),
                            event,
                            field: EventField::Duration,
                        },
                        Code::TimeArithmeticOverflow,
                        None,
                    )?;
                    current = None;
                }
            }
        }
        Ok(())
    }
}
