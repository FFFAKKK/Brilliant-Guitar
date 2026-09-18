use brilliant_core_types::SafeInteger;
use brilliant_core_types::StableId;
use brilliant_kernel_contracts::{
    KernelSelectorResultV1, KernelSelectorValueV1, KernelStage4FailureV1, ScoreEntityOwnershipV1,
    ScoreEntityTargetV1, ScoreOverviewV1, ScoreRangeSelectionV1, ScoreRangeV1,
    SelectedScoreEntityV1, SelectorRequestV1,
};
use brilliant_score_foundation::{
    MeasureDefinitionV1, MusicSequenceV1, PartMeasureContentV1, PartV1, RhythmicContentV1,
    RhythmicEventV1, ScoreNoteV1, StaffDefinitionV1, VoiceV1,
};

use crate::{
    handles::{EventHandle, MeasureHandle, PartHandle, RuntimeEntityRef, StaffHandle, VoiceHandle},
    records::{EventContentKind, PartMeasureKey},
    store::LiveScoreStore,
};

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct SelectorEvaluationV1 {
    pub(crate) result: KernelSelectorResultV1,
    pub(crate) records_visited: u64,
    pub(crate) records_returned: u64,
}

struct SelectorContextV1<'a> {
    store: &'a LiveScoreStore,
    records_visited: u64,
    records_returned: u64,
}

impl<'a> SelectorContextV1<'a> {
    fn new(store: &'a LiveScoreStore) -> Self {
        Self {
            store,
            records_visited: 0,
            records_returned: 0,
        }
    }

    fn visit(&mut self) {
        self.records_visited = self.records_visited.saturating_add(1);
    }

    fn returned(&mut self, count: usize) {
        self.records_returned = self.records_returned.saturating_add(count as u64);
    }

    fn finish(self, result: KernelSelectorResultV1) -> SelectorEvaluationV1 {
        SelectorEvaluationV1 {
            result,
            records_visited: self.records_visited,
            records_returned: self.records_returned,
        }
    }

    fn entity(
        &mut self,
        target: &ScoreEntityTargetV1,
    ) -> Result<SelectedScoreEntityV1, KernelStage4FailureV1> {
        let entity = self.resolve_target(target)?;
        let selected = match entity {
            RuntimeEntityRef::Document => {
                return Err(KernelStage4FailureV1::ReadInvariantViolation);
            }
            RuntimeEntityRef::Measure(handle) => {
                let record = self
                    .store
                    .measures
                    .get(handle)
                    .ok_or(KernelStage4FailureV1::ReadInvariantViolation)?;
                self.visit();
                SelectedScoreEntityV1::Measure(MeasureDefinitionV1 {
                    id: record.id.clone(),
                    meter: record.meter.clone(),
                    pickup_duration: record.pickup_duration.clone(),
                })
            }
            RuntimeEntityRef::Part(handle) => {
                SelectedScoreEntityV1::Part(self.export_part(handle)?)
            }
            RuntimeEntityRef::Staff(handle) => {
                SelectedScoreEntityV1::Staff(self.export_staff(handle)?)
            }
            RuntimeEntityRef::Voice(handle) => {
                SelectedScoreEntityV1::Voice(self.export_voice(handle)?)
            }
            RuntimeEntityRef::Event(handle) => {
                SelectedScoreEntityV1::Event(self.export_event(handle)?)
            }
            RuntimeEntityRef::Note(handle) => {
                let note = self
                    .store
                    .notes
                    .get(handle)
                    .ok_or(KernelStage4FailureV1::ReadInvariantViolation)?;
                self.visit();
                SelectedScoreEntityV1::Note(ScoreNoteV1 {
                    id: note.id.clone(),
                    written_pitch: note.written_pitch.clone(),
                })
            }
        };
        self.returned(1);
        Ok(selected)
    }

    fn overview(&mut self) -> Result<ScoreOverviewV1, KernelStage4FailureV1> {
        let measure_count = i64::try_from(self.store.topology.measure_order.len())
            .ok()
            .and_then(|value| SafeInteger::new(value).ok())
            .ok_or(KernelStage4FailureV1::ReadInvariantViolation)?;
        self.visit();
        self.returned(1);
        Ok(ScoreOverviewV1 {
            document_id: self.store.header.id.clone(),
            title: self.store.header.metadata.title.clone(),
            measure_count,
        })
    }

    fn ownership(
        &mut self,
        target: &ScoreEntityTargetV1,
    ) -> Result<ScoreEntityOwnershipV1, KernelStage4FailureV1> {
        let document_id = self.store.header.id.clone();
        let entity = self.resolve_target(target)?;
        let ownership = match entity {
            RuntimeEntityRef::Document => ScoreEntityOwnershipV1::Document { document_id },
            RuntimeEntityRef::Measure(_) => ScoreEntityOwnershipV1::Measure { document_id },
            RuntimeEntityRef::Part(_) => ScoreEntityOwnershipV1::Part { document_id },
            RuntimeEntityRef::Staff(handle) => {
                let part = *self
                    .store
                    .indices
                    .ownership
                    .staffs
                    .get(&handle)
                    .ok_or(KernelStage4FailureV1::ReadInvariantViolation)?;
                let part = self
                    .store
                    .parts
                    .get(part)
                    .ok_or(KernelStage4FailureV1::ReadInvariantViolation)?;
                self.visit();
                ScoreEntityOwnershipV1::Staff {
                    document_id,
                    part_id: part.id.clone(),
                }
            }
            RuntimeEntityRef::Voice(handle) => {
                let owner = self.voice_owner(handle)?;
                ScoreEntityOwnershipV1::Voice {
                    document_id,
                    part_id: owner.0,
                    measure_id: owner.1,
                }
            }
            RuntimeEntityRef::Event(handle) => {
                let voice = *self
                    .store
                    .indices
                    .ownership
                    .events
                    .get(&handle)
                    .ok_or(KernelStage4FailureV1::ReadInvariantViolation)?;
                let voice_record = self
                    .store
                    .voices
                    .get(voice)
                    .ok_or(KernelStage4FailureV1::ReadInvariantViolation)?;
                self.visit();
                let owner = self.voice_owner(voice)?;
                ScoreEntityOwnershipV1::Event {
                    document_id,
                    part_id: owner.0,
                    measure_id: owner.1,
                    voice_id: voice_record.id.clone(),
                }
            }
            RuntimeEntityRef::Note(handle) => {
                let event = *self
                    .store
                    .indices
                    .ownership
                    .notes
                    .get(&handle)
                    .ok_or(KernelStage4FailureV1::ReadInvariantViolation)?;
                let event_record = self
                    .store
                    .events
                    .get(event)
                    .ok_or(KernelStage4FailureV1::ReadInvariantViolation)?;
                self.visit();
                let voice = *self
                    .store
                    .indices
                    .ownership
                    .events
                    .get(&event)
                    .ok_or(KernelStage4FailureV1::ReadInvariantViolation)?;
                let voice_record = self
                    .store
                    .voices
                    .get(voice)
                    .ok_or(KernelStage4FailureV1::ReadInvariantViolation)?;
                self.visit();
                let owner = self.voice_owner(voice)?;
                ScoreEntityOwnershipV1::Note {
                    document_id,
                    part_id: owner.0,
                    measure_id: owner.1,
                    voice_id: voice_record.id.clone(),
                    event_id: event_record.id.clone(),
                }
            }
        };
        self.returned(1);
        Ok(ownership)
    }

    fn range(
        &mut self,
        range: &ScoreRangeV1,
    ) -> Result<ScoreRangeSelectionV1, KernelStage4FailureV1> {
        match range {
            ScoreRangeV1::MeasureRange { start, end } => {
                let start_handle = self.measure_endpoint(&start.measure_id)?;
                let end_handle = self.measure_endpoint(&end.measure_id)?;
                let (lower, upper) =
                    ordered_bounds(&self.store.topology.measure_order, start_handle, end_handle)?;
                let handles = self.store.topology.measure_order[lower..=upper].to_vec();
                let mut measures = Vec::new();
                measures
                    .try_reserve(handles.len())
                    .map_err(|_| KernelStage4FailureV1::ReadInvariantViolation)?;
                for handle in handles {
                    let record = self
                        .store
                        .measures
                        .get(handle)
                        .ok_or(KernelStage4FailureV1::ReadInvariantViolation)?;
                    self.visit();
                    measures.push(MeasureDefinitionV1 {
                        id: record.id.clone(),
                        meter: record.meter.clone(),
                        pickup_duration: record.pickup_duration.clone(),
                    });
                }
                let normalized = ScoreRangeV1::MeasureRange {
                    start: brilliant_kernel_contracts::MeasurePointV1 {
                        kind: brilliant_kernel_contracts::MeasurePointKindV1::Measure,
                        measure_id: measures
                            .first()
                            .ok_or(KernelStage4FailureV1::ReadInvariantViolation)?
                            .id
                            .clone(),
                    },
                    end: brilliant_kernel_contracts::MeasurePointV1 {
                        kind: brilliant_kernel_contracts::MeasurePointKindV1::Measure,
                        measure_id: measures
                            .last()
                            .ok_or(KernelStage4FailureV1::ReadInvariantViolation)?
                            .id
                            .clone(),
                    },
                };
                self.returned(measures.len());
                Ok(ScoreRangeSelectionV1::MeasureRange {
                    normalized,
                    measures,
                })
            }
            ScoreRangeV1::PartMeasureRange { start, end } => {
                if start.part_id != end.part_id {
                    return Err(KernelStage4FailureV1::ReadRangeOwnerMismatch);
                }
                let part = match self.store.indices.entity.by_id.get(&start.part_id) {
                    Some(RuntimeEntityRef::Part(part)) => *part,
                    _ => return Err(KernelStage4FailureV1::ReadRangeEndpointNotFound),
                };
                let start_handle = self.measure_endpoint(&start.measure_id)?;
                let end_handle = self.measure_endpoint(&end.measure_id)?;
                let (lower, upper) =
                    ordered_bounds(&self.store.topology.measure_order, start_handle, end_handle)?;
                let handles = self.store.topology.measure_order[lower..=upper].to_vec();
                let mut contents = Vec::new();
                contents
                    .try_reserve(handles.len())
                    .map_err(|_| KernelStage4FailureV1::ReadInvariantViolation)?;
                for handle in handles {
                    contents.push(self.export_content(part, handle)?);
                }
                let normalized = ScoreRangeV1::PartMeasureRange {
                    start: brilliant_kernel_contracts::PartMeasurePointV1 {
                        kind: brilliant_kernel_contracts::PartMeasurePointKindV1::PartMeasure,
                        part_id: start.part_id.clone(),
                        measure_id: contents
                            .first()
                            .ok_or(KernelStage4FailureV1::ReadInvariantViolation)?
                            .measure_id
                            .clone(),
                    },
                    end: brilliant_kernel_contracts::PartMeasurePointV1 {
                        kind: brilliant_kernel_contracts::PartMeasurePointKindV1::PartMeasure,
                        part_id: start.part_id.clone(),
                        measure_id: contents
                            .last()
                            .ok_or(KernelStage4FailureV1::ReadInvariantViolation)?
                            .measure_id
                            .clone(),
                    },
                };
                self.returned(contents.len());
                Ok(ScoreRangeSelectionV1::PartMeasureRange {
                    normalized,
                    measure_contents: contents,
                })
            }
            ScoreRangeV1::VoiceEventRange { start, end } => {
                if start.voice_id != end.voice_id {
                    return Err(KernelStage4FailureV1::ReadRangeOwnerMismatch);
                }
                let voice = match self.store.indices.entity.by_id.get(&start.voice_id) {
                    Some(RuntimeEntityRef::Voice(voice)) => *voice,
                    _ => return Err(KernelStage4FailureV1::ReadRangeEndpointNotFound),
                };
                let start_event = self.event_endpoint(&start.event_id)?;
                let end_event = self.event_endpoint(&end.event_id)?;
                let start_owner = self.store.indices.ownership.events.get(&start_event);
                let end_owner = self.store.indices.ownership.events.get(&end_event);
                if start_owner != Some(&voice) || end_owner != Some(&voice) {
                    return Err(KernelStage4FailureV1::ReadRangeOwnerMismatch);
                }
                let order = self
                    .store
                    .topology
                    .event_order
                    .get(&voice)
                    .ok_or(KernelStage4FailureV1::ReadInvariantViolation)?;
                let (lower, upper) = ordered_bounds(order, start_event, end_event)?;
                let handles = order[lower..=upper].to_vec();
                let mut events = Vec::new();
                events
                    .try_reserve(handles.len())
                    .map_err(|_| KernelStage4FailureV1::ReadInvariantViolation)?;
                for handle in handles {
                    events.push(self.export_event(handle)?);
                }
                let normalized = ScoreRangeV1::VoiceEventRange {
                    start: brilliant_kernel_contracts::VoiceEventPointV1 {
                        kind: brilliant_kernel_contracts::VoiceEventPointKindV1::VoiceEvent,
                        voice_id: start.voice_id.clone(),
                        event_id: events
                            .first()
                            .ok_or(KernelStage4FailureV1::ReadInvariantViolation)?
                            .id
                            .clone(),
                    },
                    end: brilliant_kernel_contracts::VoiceEventPointV1 {
                        kind: brilliant_kernel_contracts::VoiceEventPointKindV1::VoiceEvent,
                        voice_id: start.voice_id.clone(),
                        event_id: events
                            .last()
                            .ok_or(KernelStage4FailureV1::ReadInvariantViolation)?
                            .id
                            .clone(),
                    },
                };
                self.returned(events.len());
                Ok(ScoreRangeSelectionV1::VoiceEventRange { normalized, events })
            }
        }
    }

    fn resolve_target(
        &self,
        target: &ScoreEntityTargetV1,
    ) -> Result<RuntimeEntityRef, KernelStage4FailureV1> {
        let (id, expected) = match target {
            ScoreEntityTargetV1::Document { document_id } => {
                if document_id == &self.store.header.id {
                    return Ok(RuntimeEntityRef::Document);
                }
                return Err(KernelStage4FailureV1::ReadEntityNotFound);
            }
            ScoreEntityTargetV1::Measure { measure_id } => (measure_id, "measure"),
            ScoreEntityTargetV1::Part { part_id } => (part_id, "part"),
            ScoreEntityTargetV1::Staff { staff_id } => (staff_id, "staff"),
            ScoreEntityTargetV1::Voice { voice_id } => (voice_id, "voice"),
            ScoreEntityTargetV1::Event { event_id } => (event_id, "event"),
            ScoreEntityTargetV1::Note { note_id } => (note_id, "note"),
        };
        let entity = self
            .store
            .indices
            .entity
            .by_id
            .get(id)
            .copied()
            .ok_or(KernelStage4FailureV1::ReadEntityNotFound)?;
        let actual = match entity {
            RuntimeEntityRef::Document => "document",
            RuntimeEntityRef::Measure(_) => "measure",
            RuntimeEntityRef::Part(_) => "part",
            RuntimeEntityRef::Staff(_) => "staff",
            RuntimeEntityRef::Voice(_) => "voice",
            RuntimeEntityRef::Event(_) => "event",
            RuntimeEntityRef::Note(_) => "note",
        };
        (actual == expected)
            .then_some(entity)
            .ok_or(KernelStage4FailureV1::ReadEntityNotFound)
    }

    fn measure_endpoint(&self, id: &StableId) -> Result<MeasureHandle, KernelStage4FailureV1> {
        match self.store.indices.entity.by_id.get(id) {
            Some(RuntimeEntityRef::Measure(handle)) => Ok(*handle),
            _ => Err(KernelStage4FailureV1::ReadRangeEndpointNotFound),
        }
    }

    fn event_endpoint(&self, id: &StableId) -> Result<EventHandle, KernelStage4FailureV1> {
        match self.store.indices.entity.by_id.get(id) {
            Some(RuntimeEntityRef::Event(handle)) => Ok(*handle),
            _ => Err(KernelStage4FailureV1::ReadRangeEndpointNotFound),
        }
    }

    fn voice_owner(
        &mut self,
        voice: VoiceHandle,
    ) -> Result<(StableId, StableId), KernelStage4FailureV1> {
        let owner = *self
            .store
            .indices
            .ownership
            .voices
            .get(&voice)
            .ok_or(KernelStage4FailureV1::ReadInvariantViolation)?;
        let part = self
            .store
            .parts
            .get(owner.part)
            .ok_or(KernelStage4FailureV1::ReadInvariantViolation)?;
        let measure = self
            .store
            .measures
            .get(owner.measure)
            .ok_or(KernelStage4FailureV1::ReadInvariantViolation)?;
        self.visit();
        self.visit();
        Ok((part.id.clone(), measure.id.clone()))
    }

    fn export_staff(
        &mut self,
        handle: StaffHandle,
    ) -> Result<StaffDefinitionV1, KernelStage4FailureV1> {
        let record = self
            .store
            .staffs
            .get(handle)
            .ok_or(KernelStage4FailureV1::ReadInvariantViolation)?;
        self.visit();
        Ok(StaffDefinitionV1 {
            id: record.id.clone(),
            line_count: record.line_count,
            default_clef: record.default_clef.clone(),
        })
    }

    fn export_part(&mut self, handle: PartHandle) -> Result<PartV1, KernelStage4FailureV1> {
        let record = self
            .store
            .parts
            .get(handle)
            .ok_or(KernelStage4FailureV1::ReadInvariantViolation)?;
        self.visit();
        let id = record.id.clone();
        let name = record.name.clone();
        let instrument = record.instrument.clone();
        let staff_handles = self
            .store
            .topology
            .staff_order
            .get(&handle)
            .ok_or(KernelStage4FailureV1::ReadInvariantViolation)?
            .clone();
        let content_handles = self
            .store
            .topology
            .content_order
            .get(&handle)
            .ok_or(KernelStage4FailureV1::ReadInvariantViolation)?
            .clone();
        let mut staves = Vec::new();
        staves
            .try_reserve(staff_handles.len())
            .map_err(|_| KernelStage4FailureV1::ReadInvariantViolation)?;
        for staff in staff_handles {
            staves.push(self.export_staff(staff)?);
        }
        let mut measure_contents = Vec::new();
        measure_contents
            .try_reserve(content_handles.len())
            .map_err(|_| KernelStage4FailureV1::ReadInvariantViolation)?;
        for measure in content_handles {
            measure_contents.push(self.export_content(handle, measure)?);
        }
        Ok(PartV1 {
            id,
            name,
            instrument,
            staves,
            measure_contents,
        })
    }

    fn export_content(
        &mut self,
        part: PartHandle,
        measure: MeasureHandle,
    ) -> Result<PartMeasureContentV1, KernelStage4FailureV1> {
        let key = PartMeasureKey { part, measure };
        let content = self
            .store
            .topology
            .contents
            .get(&key)
            .ok_or(KernelStage4FailureV1::ReadInvariantViolation)?;
        if content.part != part || content.measure != measure {
            return Err(KernelStage4FailureV1::ReadInvariantViolation);
        }
        let measure_record = self
            .store
            .measures
            .get(measure)
            .ok_or(KernelStage4FailureV1::ReadInvariantViolation)?;
        self.visit();
        let measure_id = measure_record.id.clone();
        let voices = self
            .store
            .topology
            .voice_order
            .get(&key)
            .ok_or(KernelStage4FailureV1::ReadInvariantViolation)?
            .clone();
        let mut values = Vec::new();
        values
            .try_reserve(voices.len())
            .map_err(|_| KernelStage4FailureV1::ReadInvariantViolation)?;
        for voice in voices {
            values.push(self.export_voice(voice)?);
        }
        Ok(PartMeasureContentV1 {
            measure_id,
            voices: values,
        })
    }

    fn export_voice(&mut self, handle: VoiceHandle) -> Result<VoiceV1, KernelStage4FailureV1> {
        let record = self
            .store
            .voices
            .get(handle)
            .ok_or(KernelStage4FailureV1::ReadInvariantViolation)?;
        self.visit();
        let id = record.id.clone();
        let default_staff_id = record.default_staff_id.clone();
        let start = record.sequence_start.clone();
        let events = self
            .store
            .topology
            .event_order
            .get(&handle)
            .ok_or(KernelStage4FailureV1::ReadInvariantViolation)?
            .clone();
        let mut values = Vec::new();
        values
            .try_reserve(events.len())
            .map_err(|_| KernelStage4FailureV1::ReadInvariantViolation)?;
        for event in events {
            values.push(self.export_event(event)?);
        }
        Ok(VoiceV1 {
            id,
            default_staff_id,
            sequence: MusicSequenceV1 {
                start,
                events: values,
            },
        })
    }

    fn export_event(
        &mut self,
        handle: EventHandle,
    ) -> Result<RhythmicEventV1, KernelStage4FailureV1> {
        let record = self
            .store
            .events
            .get(handle)
            .ok_or(KernelStage4FailureV1::ReadInvariantViolation)?;
        self.visit();
        let id = record.id.clone();
        let duration = record.duration.clone();
        let staff_id = record.staff_id.clone();
        let kind = record.content_kind;
        let notes = self
            .store
            .topology
            .note_order
            .get(&handle)
            .ok_or(KernelStage4FailureV1::ReadInvariantViolation)?
            .clone();
        let content = match kind {
            EventContentKind::Rest => {
                if !notes.is_empty() {
                    return Err(KernelStage4FailureV1::ReadInvariantViolation);
                }
                RhythmicContentV1::Rest
            }
            EventContentKind::Notes => {
                if notes.is_empty() {
                    return Err(KernelStage4FailureV1::ReadInvariantViolation);
                }
                let mut values = Vec::new();
                values
                    .try_reserve(notes.len())
                    .map_err(|_| KernelStage4FailureV1::ReadInvariantViolation)?;
                for note in notes {
                    let record = self
                        .store
                        .notes
                        .get(note)
                        .ok_or(KernelStage4FailureV1::ReadInvariantViolation)?;
                    self.visit();
                    values.push(ScoreNoteV1 {
                        id: record.id.clone(),
                        written_pitch: record.written_pitch.clone(),
                    });
                }
                RhythmicContentV1::Notes { notes: values }
            }
        };
        Ok(RhythmicEventV1 {
            id,
            duration,
            staff_id,
            content,
        })
    }
}

pub(crate) fn select_from_store(
    store: &LiveScoreStore,
    selector: &SelectorRequestV1,
) -> SelectorEvaluationV1 {
    let mut context = SelectorContextV1::new(store);
    let result = match selector {
        SelectorRequestV1::ScoreOverview => context.overview().map(KernelSelectorValueV1::Overview),
        SelectorRequestV1::ScoreMetadata => {
            context.visit();
            context.returned(1);
            Ok(KernelSelectorValueV1::Metadata(
                store.header.metadata.clone(),
            ))
        }
        SelectorRequestV1::ScoreEntity { address } => {
            context.entity(address).map(KernelSelectorValueV1::Entity)
        }
        SelectorRequestV1::ScoreEntityOwnership { address } => context
            .ownership(address)
            .map(KernelSelectorValueV1::Ownership),
        SelectorRequestV1::ScoreRange { range } => {
            context.range(range).map(KernelSelectorValueV1::Range)
        }
        SelectorRequestV1::HistoryState | SelectorRequestV1::DirtyState => {
            Err(KernelStage4FailureV1::ReadInvariantViolation)
        }
    };
    let result = match result {
        Ok(value) => KernelSelectorResultV1::Ok(value),
        Err(failure) => KernelSelectorResultV1::Rejected(failure),
    };
    context.finish(result)
}

fn ordered_bounds<T: Copy + Eq>(
    order: &[T],
    start: T,
    end: T,
) -> Result<(usize, usize), KernelStage4FailureV1> {
    let start = order
        .iter()
        .position(|candidate| *candidate == start)
        .ok_or(KernelStage4FailureV1::ReadInvariantViolation)?;
    let end = order
        .iter()
        .position(|candidate| *candidate == end)
        .ok_or(KernelStage4FailureV1::ReadInvariantViolation)?;
    Ok((start.min(end), start.max(end)))
}
