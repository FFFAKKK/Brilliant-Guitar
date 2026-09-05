use std::collections::HashMap;

use crate::{
    change_set::StableOrderAddressV1 as Order, incremental_validation::IncrementalValidationWorkV1,
    overlay::TransactionOverlayV1,
};
use brilliant_core_types::{StableId, StablePathSegmentV1 as Segment, StablePathV1};
use brilliant_kernel_contracts::{
    KernelStage3CommandFailureLeafV1 as Failure, KernelStage3ResourceLimitKindV1 as LimitKind,
};
use brilliant_score_foundation::{
    CORE_ASSESSMENT_DIAGNOSTIC_LIMIT_V1, CoreDiagnosticCodeV1 as Code, CoreDiagnosticV1,
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
    Staff,
    Notes,
}
#[derive(Clone, Copy)]
pub(crate) enum RootCollection {
    Measures,
    Parts,
}

pub(crate) enum Location {
    Tempo,
    Root(RootCollection),
    Measure {
        id: StableId,
        field: MeasureField,
    },
    Staffs {
        part: StableId,
    },
    StaffLines {
        part: StableId,
        staff: StableId,
    },
    Voices {
        part: StableId,
        measure: StableId,
    },
    VoiceStaff(VoiceRoute),
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
            Self::Tempo | Self::Root(_) => return Vec::new(),
            Self::Measure { id, .. } => {
                return vec![(
                    Order::Measures {
                        document_id: document.clone(),
                    },
                    id,
                )];
            }
            Self::Staffs { part } => {
                return vec![(
                    Order::Parts {
                        document_id: document.clone(),
                    },
                    part,
                )];
            }
            Self::StaffLines { part, staff } => {
                return vec![
                    (
                        Order::Parts {
                            document_id: document.clone(),
                        },
                        part,
                    ),
                    (
                        Order::Staffs {
                            part_id: part.clone(),
                        },
                        staff,
                    ),
                ];
            }
            Self::Voices { part, measure } => {
                return vec![
                    (
                        Order::Parts {
                            document_id: document.clone(),
                        },
                        part,
                    ),
                    (
                        Order::MeasureContents {
                            part_id: part.clone(),
                        },
                        measure,
                    ),
                ];
            }
            Self::Start(route) | Self::VoiceStaff(route) => (route, None, None),
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

    // The rank is the reference walk's evaluation order, not textual path order.
    // Part staff checks precede contents; voice references precede start/time;
    // each event checks its reference and notes before pitch and duration.
    fn path_and_rank(&self, indices: [usize; 5]) -> (Vec<Segment>, [usize; 10]) {
        let [part, content, voice, event, note] = indices;
        match self {
            Self::Tempo => (["metadata", "tempo", "bpm"].map(field).to_vec(), [0; 10]),
            Self::Root(RootCollection::Measures) => (
                vec![field("measureDefinitions")],
                [1, 0, 0, 0, 0, 0, 0, 0, 0, 0],
            ),
            Self::Root(RootCollection::Parts) => {
                (vec![field("parts")], [3, 0, 0, 0, 0, 0, 0, 0, 0, 0])
            }
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
                (path, [2, part, phase, 0, 0, 0, 0, 0, 0, 0])
            }
            Self::Staffs { .. } => (
                vec![field("parts"), index(part), field("staves")],
                [4, part, 0, 0, 0, 0, 0, 0, 0, 0],
            ),
            Self::StaffLines { .. } => (
                vec![
                    field("parts"),
                    index(part),
                    field("staves"),
                    index(content),
                    field("lineCount"),
                ],
                [4, part, 1, content, 0, 0, 0, 0, 0, 0],
            ),
            _ => {
                let mut path = vec![
                    field("parts"),
                    index(part),
                    field("measureContents"),
                    index(content),
                    field("voices"),
                ];
                if matches!(self, Self::Voices { .. }) {
                    return (path, [4, part, 2, content, 0, 0, 0, 0, 0, 0]);
                }
                path.push(index(voice));
                if matches!(self, Self::VoiceStaff(_)) {
                    path.push(field("defaultStaffId"));
                    return (path, [4, part, 2, content, 1, voice, 0, 0, 0, 0]);
                }
                path.push(field("sequence"));
                if matches!(self, Self::Start(_)) {
                    path.push(field("start"));
                    return (path, [4, part, 2, content, 1, voice, 1, 0, 0, 0]);
                }
                path.extend([field("events"), index(event)]);
                let mut rank = [4, part, 2, content, 1, voice, 2, event, 0, 0];
                match self {
                    Self::Pitch { .. } => {
                        path.extend([
                            field("content"),
                            field("notes"),
                            index(note),
                            field("writtenPitch"),
                        ]);
                        rank[8] = 2;
                        rank[9] = note;
                    }
                    Self::Event {
                        field: event_field, ..
                    } => match event_field {
                        EventField::Staff => path.push(field("staffId")),
                        EventField::Notes => {
                            path.extend([field("content"), field("notes")]);
                            rank[8] = 1;
                        }
                        EventField::Duration => {
                            path.push(field("duration"));
                            rank[8] = 3;
                        }
                        EventField::Root => rank[8] = 3,
                    },
                    _ => unreachable!(),
                }
                (path, rank)
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
