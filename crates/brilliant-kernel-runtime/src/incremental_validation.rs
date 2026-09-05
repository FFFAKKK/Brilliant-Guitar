use std::collections::{HashMap, HashSet};

use brilliant_core_types::StableId;
use brilliant_kernel_contracts::KernelStage3CommandFailureLeafV1 as Failure;
use brilliant_score_foundation::{
    CoreDiagnosticCodeV1 as Code, ScoreMetadataV1, TranspositionV1, assess_sounding_pitch,
    tempo_is_valid, written_pitch_is_valid,
};

use crate::{
    change_set::{
        ReferenceAddressV1, ReferenceValueV1, ScalarAddressV1 as Scalar, ScalarValueV1 as Value,
        StableEntityAddressV1 as Entity, StableOrderAddressV1 as Order,
        StableOwnerAddressV1 as Owner,
    },
    overlay::{CoreBaseReadV1, TransactionOverlayV1},
    transaction::StableRecordV1,
    validation_diagnostics::{DiagnosticCollector, Location, VoiceRoute},
};

#[path = "time_validation.rs"]
mod time;

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

/// Borrow the already prepared delta. No second document or command framework
/// is built to discover the semantic dependency closure.
pub(crate) struct FinalValidationDeltaV1<'a> {
    pub(crate) metadata: Option<&'a ScoreMetadataV1>,
    pub(crate) records: &'a HashMap<Entity, StableRecordV1>,
    pub(crate) touched_voices: &'a HashSet<StableId>,
    pub(crate) references: &'a HashMap<ReferenceAddressV1, Option<ReferenceValueV1>>,
}

struct Assessment<'view, 'base> {
    overlay: &'view mut TransactionOverlayV1<'base>,
    work: IncrementalValidationWorkV1,
    diagnostics: DiagnosticCollector,
    instruments: HashMap<StableId, TranspositionV1>,
}

/// Schedule from final surviving records, never the original forward commands.
/// Undo and redo use the same entry point with their actual stored operations.
pub(crate) fn validate_final_semantics(
    base: &dyn CoreBaseReadV1,
    document_id: &StableId,
    base_metadata: &ScoreMetadataV1,
    overlay: &mut TransactionOverlayV1<'_>,
    delta: FinalValidationDeltaV1<'_>,
) -> Result<IncrementalValidationWorkV1, IncrementalValidationFailureV1> {
    let mut assessment = Assessment {
        overlay,
        work: IncrementalValidationWorkV1::default(),
        diagnostics: DiagnosticCollector::default(),
        instruments: HashMap::new(),
    };
    let result = assessment.run(base, base_metadata, &delta);
    let result = result.and_then(|()| {
        assessment
            .diagnostics
            .publish(document_id, assessment.overlay, &mut assessment.work)
    });
    let failure = match result {
        Err(failure) => failure,
        Ok(diagnostics) if diagnostics.is_empty() => return Ok(assessment.work),
        Ok(diagnostics) => Failure::SemanticInvalid { diagnostics },
    };
    Err(IncrementalValidationFailureV1 {
        failure,
        work: assessment.work,
    })
}

impl Assessment<'_, '_> {
    fn run(
        &mut self,
        base: &dyn CoreBaseReadV1,
        base_metadata: &ScoreMetadataV1,
        delta: &FinalValidationDeltaV1<'_>,
    ) -> Result<(), Failure> {
        if let Some(metadata) = delta
            .metadata
            .filter(|candidate| candidate.tempo != base_metadata.tempo)
        {
            self.work.rules_evaluated += 1;
            if !tempo_is_valid(metadata.tempo.bpm.get()) {
                self.diagnostics
                    .add(Location::Tempo, Code::TempoInvalid, None)?;
            }
        }
        let mut notes = HashSet::new();
        let mut parts = Vec::new();
        for record in delta.records.values() {
            match record {
                StableRecordV1::Note(note) => insert_id(&mut notes, &note.id)?,
                StableRecordV1::Part(part) => {
                    parts.try_reserve(1).map_err(|_| Failure::InternalError)?;
                    parts.push(part);
                }
                _ => {}
            }
        }
        parts.sort_unstable_by(|left, right| left.id.as_str().cmp(right.id.as_str()));
        for part in parts {
            self.work.dependency_reads += 1;
            if base.read_transposition(&part.id).as_ref()
                == Some(&part.instrument.written_to_sounding)
            {
                continue;
            }
            for measure_id in self.order(&Order::MeasureContents {
                part_id: part.id.clone(),
            })? {
                for voice_id in self.order(&Order::Voices {
                    part_id: part.id.clone(),
                    measure_id,
                })? {
                    for event_id in self.order(&Order::Events { voice_id })? {
                        for note in self.order(&Order::Notes { event_id })? {
                            insert_id(&mut notes, &note)?;
                        }
                    }
                }
            }
        }
        // Hash iteration must not select which work precedes a resource failure.
        for note in sorted_ids(notes)? {
            self.check_note(note)?;
        }
        self.check_time(base, delta)
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

    fn voice_route(&mut self, voice: StableId) -> Result<VoiceRoute, Failure> {
        let Owner::PartMeasure {
            part_id: part,
            measure_id: measure,
        } = self.owner(&Entity::Voice {
            voice_id: voice.clone(),
        })?
        else {
            return Err(Failure::InternalError);
        };
        Ok(VoiceRoute {
            part,
            measure,
            voice,
        })
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
        let route = self.voice_route(voice)?;
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
            if !self.instruments.contains_key(&route.part) {
                self.work.dependency_reads += 1;
                let transposition = self
                    .overlay
                    .read_transposition(&route.part)
                    .ok_or(Failure::InternalError)?;
                self.instruments
                    .try_reserve(1)
                    .map_err(|_| Failure::InternalError)?;
                self.instruments.insert(route.part.clone(), transposition);
            }
            self.work.rules_evaluated += 1;
            assess_sounding_pitch(
                &pitch,
                self.instruments
                    .get(&route.part)
                    .ok_or(Failure::InternalError)?,
            )
            .err()
            .map(|reason| (Code::SoundingPitchInvalid, Some(reason)))
        };
        if let Some((code, reason)) = fault {
            self.diagnostics
                .add(Location::Pitch { route, event, note }, code, reason)?;
        }
        Ok(())
    }
}

fn insert_id(ids: &mut HashSet<StableId>, id: &StableId) -> Result<(), Failure> {
    ids.try_reserve(1).map_err(|_| Failure::InternalError)?;
    ids.insert(id.clone());
    Ok(())
}

fn sorted_ids(ids: HashSet<StableId>) -> Result<Vec<StableId>, Failure> {
    let mut sorted = Vec::new();
    sorted
        .try_reserve(ids.len())
        .map_err(|_| Failure::InternalError)?;
    sorted.extend(ids);
    sorted.sort_unstable_by(|left, right| left.as_str().cmp(right.as_str()));
    Ok(sorted)
}
