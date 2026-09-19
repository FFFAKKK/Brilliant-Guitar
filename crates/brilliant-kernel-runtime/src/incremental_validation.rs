use std::collections::{HashMap, HashSet};

use brilliant_core_types::StableId;
use brilliant_kernel_contracts::KernelStage3CommandFailureLeafV1 as Failure;
use brilliant_score_foundation::{
    CoreDiagnosticCodeV1 as Code, ScoreMetadataV1, tempo_is_valid, written_pitch_is_valid,
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

#[path = "hierarchy_validation.rs"]
mod hierarchy;
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
    pub(crate) entities: &'a HashMap<Entity, Option<StableRecordV1>>,
    pub(crate) orders: &'a [Order],
}

struct Assessment<'view, 'base> {
    overlay: &'view mut TransactionOverlayV1<'base>,
    work: IncrementalValidationWorkV1,
    diagnostics: DiagnosticCollector,
    work_budget: Option<&'view crate::work_budget::TransactionWorkBudgetV1>,
}

/// Schedule from final surviving records, never the original forward commands.
/// Undo and redo use the same entry point with their actual stored operations.
pub(crate) fn validate_final_semantics(
    base: &dyn CoreBaseReadV1,
    document_id: &StableId,
    base_metadata: &ScoreMetadataV1,
    overlay: &mut TransactionOverlayV1<'_>,
    delta: FinalValidationDeltaV1<'_>,
    work_budget: Option<&crate::work_budget::TransactionWorkBudgetV1>,
) -> Result<IncrementalValidationWorkV1, IncrementalValidationFailureV1> {
    let mut assessment = Assessment {
        overlay,
        work: IncrementalValidationWorkV1::default(),
        diagnostics: DiagnosticCollector::default(),
        work_budget,
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
    fn charge_rules(&mut self, units: u64) -> Result<(), Failure> {
        self.work.rules_evaluated = self.work.rules_evaluated.saturating_add(units);
        if let Some(budget) = self.work_budget {
            budget.charge_metric_progress(units)?;
        }
        Ok(())
    }

    fn charge_dependency_reads(&mut self, units: u64) -> Result<(), Failure> {
        self.work.dependency_reads = self.work.dependency_reads.saturating_add(units);
        if let Some(budget) = self.work_budget {
            budget.charge_metric_progress(units)?;
        }
        Ok(())
    }

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
            self.charge_rules(1)?;
            if !tempo_is_valid(metadata.tempo.bpm.get()) {
                self.diagnostics
                    .add(Location::Tempo, Code::TempoInvalid, None)?;
            }
        }
        let mut notes = HashSet::new();
        for record in delta.records.values() {
            if let StableRecordV1::Note(note) = record {
                insert_id(&mut notes, &note.id)?;
            }
        }
        // Hash iteration must not select which work precedes a resource failure.
        for note in sorted_ids(notes)? {
            self.check_note(note)?;
        }
        self.check_time(base, delta)?;
        self.check_hierarchy(base, delta)
    }

    fn order(&mut self, address: &Order) -> Result<Vec<StableId>, Failure> {
        self.charge_dependency_reads(1)?;
        let mut ids = Vec::new();
        let mut capacity_failed = false;
        let mut budget_failure = None;
        let work_budget = self.work_budget;
        self.overlay
            .visit_order(address, &mut |id| {
                self.work.dependency_reads = self.work.dependency_reads.saturating_add(1);
                if let Some(budget) = work_budget
                    && let Err(failure) = budget.charge_metric_progress(1)
                {
                    budget_failure = Some(failure);
                    return false;
                }
                if ids.try_reserve(1).is_err() {
                    capacity_failed = true;
                    return false;
                }
                ids.push(id.clone());
                true
            })
            .ok_or(Failure::InternalError)?;
        if let Some(failure) = budget_failure {
            return Err(failure);
        }
        if capacity_failed {
            return Err(Failure::InternalError);
        }
        Ok(ids)
    }

    fn owner(&mut self, address: &Entity) -> Result<Owner, Failure> {
        self.charge_dependency_reads(1)?;
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
        self.charge_dependency_reads(1)?;
        let Some(Value::NoteWrittenPitch(pitch)) =
            self.overlay.read_scalar(&Scalar::NoteWrittenPitch {
                note_id: note.clone(),
            })
        else {
            return Err(Failure::InternalError);
        };
        self.charge_rules(1)?;
        if !written_pitch_is_valid(&pitch) {
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
            self.diagnostics.add(
                Location::Pitch { route, event, note },
                Code::WrittenPitchInvalid,
                None,
            )?;
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
    sorted.sort_unstable_by(|left, right| left.as_js_string().cmp(right.as_js_string()));
    Ok(sorted)
}
