use std::collections::HashMap;

use brilliant_core_types::{StableId, StablePathSegmentV1 as Segment, StablePathV1};
use brilliant_kernel_contracts::{
    KernelStage3CommandFailureLeafV1 as Failure, KernelStage3ResourceLimitKindV1 as LimitKind,
};
use brilliant_score_foundation::{
    CORE_ASSESSMENT_DIAGNOSTIC_LIMIT_V1, CoreDiagnosticCodeV1 as Code, CoreDiagnosticV1,
};

use crate::{
    change_set::StableOrderAddressV1 as Order, incremental_validation::IncrementalValidationWorkV1,
    overlay::TransactionOverlayV1,
};

#[derive(Clone)]
pub(crate) struct VoiceRoute {
    pub(crate) part: StableId,
    pub(crate) measure: StableId,
    pub(crate) voice: StableId,
}

#[derive(Clone, Copy)]
pub(crate) enum MeasureField {
    Numerator,
    Denominator,
    Pickup,
}

#[derive(Clone, Copy)]
pub(crate) enum EventField {
    Duration,
    Root,
}

pub(crate) enum Location {
    Tempo,
    Measure {
        id: StableId,
        field: MeasureField,
    },
    Start(VoiceRoute),
    Event {
        route: VoiceRoute,
        event: StableId,
        field: EventField,
    },
    Pitch {
        route: VoiceRoute,
        event: StableId,
        note: StableId,
    },
}

impl Location {
    fn orders(&self, document: &StableId) -> Vec<(Order, &StableId)> {
        let (route, event, note) = match self {
            Self::Tempo => return Vec::new(),
            Self::Measure { id, .. } => {
                return vec![(
                    Order::Measures {
                        document_id: document.clone(),
                    },
                    id,
                )];
            }
            Self::Start(route) => (route, None, None),
            Self::Event { route, event, .. } => (route, Some(event), None),
            Self::Pitch { route, event, note } => (route, Some(event), Some(note)),
        };
        let mut orders = vec![
            (
                Order::Parts {
                    document_id: document.clone(),
                },
                &route.part,
            ),
            (
                Order::MeasureContents {
                    part_id: route.part.clone(),
                },
                &route.measure,
            ),
            (
                Order::Voices {
                    part_id: route.part.clone(),
                    measure_id: route.measure.clone(),
                },
                &route.voice,
            ),
        ];
        if let Some(event) = event {
            orders.push((
                Order::Events {
                    voice_id: route.voice.clone(),
                },
                event,
            ));
            if let Some(note) = note {
                orders.push((
                    Order::Notes {
                        event_id: event.clone(),
                    },
                    note,
                ));
            }
        }
        orders
    }

    // Rank follows reference evaluation, which is not lexicographic path order:
    // event pitch precedes duration and an event-root overrun comes last.
    fn path_and_rank(&self, indices: [usize; 5]) -> (Vec<Segment>, [usize; 8]) {
        let [part, content, voice, event, note] = indices;
        match self {
            Self::Tempo => (["metadata", "tempo", "bpm"].map(field).to_vec(), [0; 8]),
            Self::Measure {
                field: measure_field,
                ..
            } => {
                let mut path = vec![field("measureDefinitions"), index(part)];
                let phase = match measure_field {
                    MeasureField::Numerator => {
                        path.extend([field("meter"), field("numerator")]);
                        0
                    }
                    MeasureField::Denominator => {
                        path.extend([field("meter"), field("denominator")]);
                        1
                    }
                    MeasureField::Pickup => {
                        path.push(field("pickupDuration"));
                        2
                    }
                };
                (path, [1, part, phase, 0, 0, 0, 0, 0])
            }
            _ => {
                let mut path = vec![
                    field("parts"),
                    index(part),
                    field("measureContents"),
                    index(content),
                    field("voices"),
                    index(voice),
                    field("sequence"),
                ];
                if matches!(self, Self::Start(_)) {
                    path.push(field("start"));
                    return (path, [2, part, content, voice, 0, 0, 0, 0]);
                }
                path.extend([field("events"), index(event)]);
                if matches!(self, Self::Pitch { .. }) {
                    path.extend([
                        field("content"),
                        field("notes"),
                        index(note),
                        field("writtenPitch"),
                    ]);
                    (path, [2, part, content, voice, 1, event, 0, note])
                } else {
                    if matches!(
                        self,
                        Self::Event {
                            field: EventField::Duration,
                            ..
                        }
                    ) {
                        path.push(field("duration"));
                    }
                    (path, [2, part, content, voice, 1, event, 1, 0])
                }
            }
        }
    }
}

struct Pending {
    location: Location,
    code: Code,
    reason: Option<&'static str>,
}

#[derive(Default)]
pub(crate) struct DiagnosticCollector {
    pending: Vec<Pending>,
}

impl DiagnosticCollector {
    pub(crate) fn add(
        &mut self,
        location: Location,
        code: Code,
        reason: Option<&'static str>,
    ) -> Result<(), Failure> {
        if self.pending.len() == CORE_ASSESSMENT_DIAGNOSTIC_LIMIT_V1 {
            return Err(Failure::ResourceLimitExceeded {
                limit_kind: LimitKind::Diagnostics,
                limit: CORE_ASSESSMENT_DIAGNOSTIC_LIMIT_V1 as u64,
                actual: CORE_ASSESSMENT_DIAGNOSTIC_LIMIT_V1 as u64 + 1,
            });
        }
        self.pending
            .try_reserve(1)
            .map_err(|_| Failure::InternalError)?;
        self.pending.push(Pending {
            location,
            code,
            reason,
        });
        Ok(())
    }

    pub(crate) fn publish(
        self,
        document: &StableId,
        overlay: &TransactionOverlayV1<'_>,
        work: &mut IncrementalValidationWorkV1,
    ) -> Result<Vec<CoreDiagnosticV1>, Failure> {
        // Borrow each affected sibling list once, stopping at its last requested
        // ID. Diagnostic paths never require a score DTO or aggregate clone.
        let mut positions: HashMap<Order, HashMap<StableId, Option<usize>>> = HashMap::new();
        for pending in &self.pending {
            for (order, id) in pending.location.orders(document) {
                positions
                    .try_reserve(1)
                    .map_err(|_| Failure::InternalError)?;
                let wanted = positions.entry(order).or_default();
                wanted.try_reserve(1).map_err(|_| Failure::InternalError)?;
                wanted.insert(id.clone(), None);
            }
        }
        for (order, wanted) in &mut positions {
            work.dependency_reads += 1;
            let mut remaining = wanted.len();
            let mut index = 0;
            overlay
                .visit_order(order, &mut |id| {
                    work.dependency_reads += 1;
                    if let Some(position) = wanted.get_mut(id) {
                        *position = Some(index);
                        remaining -= 1;
                    }
                    index += 1;
                    remaining != 0
                })
                .ok_or(Failure::InternalError)?;
            if remaining != 0 {
                return Err(Failure::InternalError);
            }
        }
        let mut ordered = Vec::new();
        ordered
            .try_reserve(self.pending.len())
            .map_err(|_| Failure::InternalError)?;
        for pending in self.pending {
            let mut indices = [0; 5];
            for (index, (order, id)) in pending.location.orders(document).into_iter().enumerate() {
                indices[index] = positions
                    .get(&order)
                    .and_then(|wanted| wanted.get(id))
                    .copied()
                    .flatten()
                    .ok_or(Failure::InternalError)?;
            }
            let (path, rank) = pending.location.path_and_rank(indices);
            ordered.push((
                rank,
                CoreDiagnosticV1::new(
                    pending.code,
                    StablePathV1::new(path).map_err(|_| Failure::InternalError)?,
                    pending.reason.map(|reason| ("reason", reason)),
                ),
            ));
        }
        // Stable sorting preserves fraction / measure / bound checks at the
        // same start path while merging independently scheduled rule families.
        ordered.sort_by_key(|(rank, _)| *rank);
        let mut diagnostics = Vec::new();
        diagnostics
            .try_reserve(ordered.len())
            .map_err(|_| Failure::InternalError)?;
        diagnostics.extend(ordered.into_iter().map(|(_, diagnostic)| diagnostic));
        Ok(diagnostics)
    }
}

fn field(value: &str) -> Segment {
    Segment::Field(value.to_owned())
}
fn index(value: usize) -> Segment {
    Segment::Index(value as u64)
}
