use std::collections::{HashMap, HashSet};

use brilliant_core_types::{StableId, StablePathSegmentV1 as Segment, StablePathV1};
use brilliant_kernel_contracts::{
    KernelStage3CommandFailureLeafV1 as Failure, KernelStage3ResourceLimitKindV1 as LimitKind,
};
use brilliant_score_foundation::{
    CORE_ASSESSMENT_DIAGNOSTIC_LIMIT_V1, CoreDiagnosticCodeV1 as Code, CoreDiagnosticV1,
    ScoreMetadataV1, TranspositionV1, assess_sounding_pitch, tempo_is_valid,
    written_pitch_is_valid,
};

use crate::{
    change_set::{
        ScalarAddressV1 as Scalar, ScalarValueV1 as Value, StableEntityAddressV1 as Entity,
        StableOrderAddressV1 as Order, StableOwnerAddressV1 as Owner,
    },
    overlay::{CoreBaseReadV1, TransactionOverlayV1},
};

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub(crate) struct IncrementalValidationWorkV1 {
    pub(crate) rules_evaluated: u64,
    pub(crate) dependency_reads: u64,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct IncrementalValidationFailureV1 {
    pub(crate) failure: Failure,
    pub(crate) work: IncrementalValidationWorkV1,
}

struct NoteRoute {
    part: StableId,
    measure: StableId,
    voice: StableId,
    event: StableId,
    note: StableId,
}

impl NoteRoute {
    fn orders(&self, document: &StableId) -> [(Order, &StableId); 5] {
        [
            (
                Order::Parts {
                    document_id: document.clone(),
                },
                &self.part,
            ),
            (
                Order::MeasureContents {
                    part_id: self.part.clone(),
                },
                &self.measure,
            ),
            (
                Order::Voices {
                    part_id: self.part.clone(),
                    measure_id: self.measure.clone(),
                },
                &self.voice,
            ),
            (
                Order::Events {
                    voice_id: self.voice.clone(),
                },
                &self.event,
            ),
            (
                Order::Notes {
                    event_id: self.event.clone(),
                },
                &self.note,
            ),
        ]
    }
}

struct PitchFault {
    route: NoteRoute,
    code: Code,
    reason: Option<&'static str>,
}

struct Assessment<'view, 'base> {
    overlay: &'view mut TransactionOverlayV1<'base>,
    work: IncrementalValidationWorkV1,
    diagnostics: Vec<CoreDiagnosticV1>,
    faults: Vec<PitchFault>,
    instruments: HashMap<StableId, TranspositionV1>,
}

/// Schedule from final surviving records, never the original forward commands.
/// Aggregate inserts already expand their descendant note records. A changed
/// instrument expands only its own final part. Other dependency families remain
/// separate work; this scheduler never invokes the full JSON reference walker.
pub(crate) fn validate_final_semantics<'records>(
    base: &dyn CoreBaseReadV1,
    document_id: &StableId,
    base_metadata: &ScoreMetadataV1,
    metadata: Option<&ScoreMetadataV1>,
    overlay: &mut TransactionOverlayV1<'_>,
    changed_notes: impl Iterator<Item = &'records StableId>,
    changed_parts: impl Iterator<Item = (&'records StableId, &'records TranspositionV1)>,
) -> Result<IncrementalValidationWorkV1, IncrementalValidationFailureV1> {
    let mut assessment = Assessment {
        overlay,
        work: IncrementalValidationWorkV1::default(),
        diagnostics: Vec::new(),
        faults: Vec::new(),
        instruments: HashMap::new(),
    };
    let result = assessment.run(
        base,
        document_id,
        base_metadata,
        metadata,
        changed_notes,
        changed_parts,
    );
    let failure = match result {
        Err(failure) => failure,
        Ok(()) if assessment.diagnostics.is_empty() => return Ok(assessment.work),
        Ok(()) => Failure::SemanticInvalid {
            diagnostics: assessment.diagnostics,
        },
    };
    Err(IncrementalValidationFailureV1 {
        failure,
        work: assessment.work,
    })
}

impl Assessment<'_, '_> {
    fn run<'records>(
        &mut self,
        base: &dyn CoreBaseReadV1,
        document_id: &StableId,
        base_metadata: &ScoreMetadataV1,
        metadata: Option<&ScoreMetadataV1>,
        changed_notes: impl Iterator<Item = &'records StableId>,
        changed_parts: impl Iterator<Item = (&'records StableId, &'records TranspositionV1)>,
    ) -> Result<(), Failure> {
        if let Some(metadata) = metadata.filter(|candidate| candidate.tempo != base_metadata.tempo)
        {
            self.work.rules_evaluated += 1;
            if !tempo_is_valid(metadata.tempo.bpm.get()) {
                self.diagnostics
                    .try_reserve(1)
                    .map_err(|_| Failure::InternalError)?;
                self.diagnostics.push(CoreDiagnosticV1::new(
                    Code::TempoInvalid,
                    StablePathV1::new(["metadata", "tempo", "bpm"].map(field).to_vec())
                        .map_err(|_| Failure::InternalError)?,
                    None,
                ));
            }
        }
        let mut notes = HashSet::new();
        for note in changed_notes {
            insert_note(&mut notes, note)?;
        }
        let mut parts = Vec::new();
        for entry in changed_parts {
            parts.try_reserve(1).map_err(|_| Failure::InternalError)?;
            parts.push(entry);
        }
        parts.sort_unstable_by(|left, right| left.0.as_str().cmp(right.0.as_str()));
        for (part_id, transposition) in parts {
            self.work.dependency_reads += 1;
            if base.read_transposition(part_id).as_ref() == Some(transposition) {
                continue;
            }
            for measure_id in self.order(&Order::MeasureContents {
                part_id: part_id.clone(),
            })? {
                for voice_id in self.order(&Order::Voices {
                    part_id: part_id.clone(),
                    measure_id,
                })? {
                    for event_id in self.order(&Order::Events { voice_id })? {
                        for note in self.order(&Order::Notes { event_id })? {
                            insert_note(&mut notes, &note)?;
                        }
                    }
                }
            }
        }
        // Hash iteration must not select which work precedes a resource failure.
        let mut sorted_notes = Vec::new();
        sorted_notes
            .try_reserve(notes.len())
            .map_err(|_| Failure::InternalError)?;
        sorted_notes.extend(notes);
        sorted_notes.sort_unstable_by(|left, right| left.as_str().cmp(right.as_str()));
        for note in sorted_notes {
            self.check_note(note)?;
        }
        self.publish_pitch_diagnostics(document_id)
    }

    fn order(&mut self, address: &Order) -> Result<Vec<StableId>, Failure> {
        self.work.dependency_reads += 1;
        let mut ids = Vec::new();
        let mut capacity_failed = false;
        self.overlay
            .visit_order(address, &mut |id| {
                self.work.dependency_reads += 1;
                if ids.try_reserve(1).is_err() {
                    capacity_failed = true;
                    return false;
                }
                ids.push(id.clone());
                true
            })
            .ok_or(Failure::InternalError)?;
        if capacity_failed {
            return Err(Failure::InternalError);
        }
        Ok(ids)
    }

    fn owner(&mut self, address: &Entity) -> Result<Owner, Failure> {
        self.work.dependency_reads += 1;
        self.overlay
            .read_owner(address)
            .ok_or(Failure::InternalError)
    }

    fn check_note(&mut self, note: StableId) -> Result<(), Failure> {
        let Owner::Event { event_id: event } = self.owner(&Entity::Note {
            note_id: note.clone(),
        })?
        else {
            return Err(Failure::InternalError);
        };
        let Owner::Voice { voice_id: voice } = self.owner(&Entity::Event {
            event_id: event.clone(),
        })?
        else {
            return Err(Failure::InternalError);
        };
        let Owner::PartMeasure {
            part_id: part,
            measure_id: measure,
        } = self.owner(&Entity::Voice {
            voice_id: voice.clone(),
        })?
        else {
            return Err(Failure::InternalError);
        };
        self.work.dependency_reads += 1;
        let Some(Value::NoteWrittenPitch(pitch)) =
            self.overlay.read_scalar(&Scalar::NoteWrittenPitch {
                note_id: note.clone(),
            })
        else {
            return Err(Failure::InternalError);
        };
        self.work.rules_evaluated += 1;
        let fault = if !written_pitch_is_valid(&pitch) {
            Some((Code::WrittenPitchInvalid, None))
        } else {
            if !self.instruments.contains_key(&part) {
                self.work.dependency_reads += 1;
                let transposition = self
                    .overlay
                    .read_transposition(&part)
                    .ok_or(Failure::InternalError)?;
                self.instruments
                    .try_reserve(1)
                    .map_err(|_| Failure::InternalError)?;
                self.instruments.insert(part.clone(), transposition);
            }
            self.work.rules_evaluated += 1;
            assess_sounding_pitch(
                &pitch,
                self.instruments.get(&part).ok_or(Failure::InternalError)?,
            )
            .err()
            .map(|reason| (Code::SoundingPitchInvalid, Some(reason)))
        };
        if let Some((code, reason)) = fault {
            if self.diagnostics.len() + self.faults.len() == CORE_ASSESSMENT_DIAGNOSTIC_LIMIT_V1 {
                return Err(Failure::ResourceLimitExceeded {
                    limit_kind: LimitKind::Diagnostics,
                    limit: CORE_ASSESSMENT_DIAGNOSTIC_LIMIT_V1 as u64,
                    actual: CORE_ASSESSMENT_DIAGNOSTIC_LIMIT_V1 as u64 + 1,
                });
            }
            self.faults
                .try_reserve(1)
                .map_err(|_| Failure::InternalError)?;
            self.faults.push(PitchFault {
                route: NoteRoute {
                    part,
                    measure,
                    voice,
                    event,
                    note,
                },
                code,
                reason,
            });
        }
        Ok(())
    }

    fn publish_pitch_diagnostics(&mut self, document_id: &StableId) -> Result<(), Failure> {
        // Group all requested positions by sibling list. Each list is borrowed
        // once and stops at its final requested ID, even for thousands of errors.
        let mut positions: HashMap<Order, HashMap<StableId, Option<usize>>> = HashMap::new();
        for fault in &self.faults {
            for (order, id) in fault.route.orders(document_id) {
                positions
                    .try_reserve(1)
                    .map_err(|_| Failure::InternalError)?;
                let wanted = positions.entry(order).or_default();
                wanted.try_reserve(1).map_err(|_| Failure::InternalError)?;
                wanted.insert(id.clone(), None);
            }
        }
        for (order, wanted) in &mut positions {
            self.work.dependency_reads += 1;
            let mut remaining = wanted.len();
            let mut index = 0;
            self.overlay
                .visit_order(order, &mut |id| {
                    self.work.dependency_reads += 1;
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
            .try_reserve(self.faults.len())
            .map_err(|_| Failure::InternalError)?;
        for fault in &self.faults {
            let mut rank = [0_usize; 5];
            for (index, (order, id)) in fault.route.orders(document_id).into_iter().enumerate() {
                rank[index] = positions
                    .get(&order)
                    .and_then(|wanted| wanted.get(id))
                    .copied()
                    .flatten()
                    .ok_or(Failure::InternalError)?;
            }
            let [part, content, voice, event, note] =
                rank.map(|value| Segment::Index(value as u64));
            let path = StablePathV1::new(vec![
                field("parts"),
                part,
                field("measureContents"),
                content,
                field("voices"),
                voice,
                field("sequence"),
                field("events"),
                event,
                field("content"),
                field("notes"),
                note,
                field("writtenPitch"),
            ])
            .map_err(|_| Failure::InternalError)?;
            ordered.push((
                rank,
                CoreDiagnosticV1::new(
                    fault.code,
                    path,
                    fault.reason.map(|reason| ("reason", reason)),
                ),
            ));
        }
        ordered.sort_unstable_by_key(|(rank, _)| *rank);
        self.diagnostics
            .try_reserve(ordered.len())
            .map_err(|_| Failure::InternalError)?;
        self.diagnostics
            .extend(ordered.into_iter().map(|(_, diagnostic)| diagnostic));
        Ok(())
    }
}

fn field(value: &str) -> Segment {
    Segment::Field(value.to_owned())
}

fn insert_note(notes: &mut HashSet<StableId>, note: &StableId) -> Result<(), Failure> {
    notes.try_reserve(1).map_err(|_| Failure::InternalError)?;
    notes.insert(note.clone());
    Ok(())
}
