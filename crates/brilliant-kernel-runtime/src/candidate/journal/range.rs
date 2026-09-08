//! Range commands prepare an occurrence selection once. Pure transformations
//! finish before any field history is written; replay uses the stored operations.
use super::*;
use brilliant_kernel_contracts::{PitchTranspositionErrorV1, ScoreRangeV1};
use brilliant_score_foundation::TranspositionV1;

#[derive(Debug, PartialEq)]
pub(super) enum RangePreparationFailure {
    Command(Failure),
    // A selected Note may have a temporary empty ID. Only the final boundary
    // promotes identifiers; error reporting must preserve the original raw ID.
    Transform {
        note_id: JsString,
        reason: PitchTranspositionErrorV1,
    },
}

impl From<Failure> for RangePreparationFailure {
    fn from(value: Failure) -> Self {
        Self::Command(value)
    }
}

impl Recorder<'_> {
    pub(super) fn delete_range_command(
        &mut self,
        document_id: &JsString,
        range: &ScoreRangeV1,
    ) -> Result<bool, RangePreparationFailure> {
        let result = self.delete_range_inner(document_id, range);
        if result.is_err() {
            self.candidate.reservation.abort();
        }
        result
    }

    fn delete_range_inner(
        &mut self,
        document_id: &JsString,
        range: &ScoreRangeV1,
    ) -> Result<bool, RangePreparationFailure> {
        let selection = self.resolve_range_selection(document_id, range)?;
        if let Some(measures) = selection.measures {
            let changed = !measures.is_empty();
            for source in measures {
                let raw = self
                    .candidate
                    .raw_id(&source)
                    .ok_or(Failure::InternalError)?
                    .clone();
                // Range deletion does not normalize surviving Part contents.
                self.remove_measure_bundle(&raw)?;
            }
            Ok(changed)
        } else {
            let changed = !selection.events.is_empty();
            for source in selection.events {
                let raw = self
                    .candidate
                    .raw_id(&source)
                    .ok_or(Failure::InternalError)?
                    .clone();
                self.remove_event(&raw)?;
            }
            Ok(changed)
        }
    }

    pub(super) fn transpose_range_command(
        &mut self,
        document_id: &JsString,
        range: &ScoreRangeV1,
        transposition: &TranspositionV1,
    ) -> Result<bool, RangePreparationFailure> {
        let result = self.transpose_range_inner(document_id, range, transposition);
        if result.is_err() {
            self.candidate.reservation.abort();
        }
        result
    }

    fn transpose_range_inner(
        &mut self,
        document_id: &JsString,
        range: &ScoreRangeV1,
        transposition: &TranspositionV1,
    ) -> Result<bool, RangePreparationFailure> {
        let selection = self.resolve_range_selection(document_id, range)?;
        // Resolve even a zero transform: malformed ranges have precedence.
        if transposition.diatonic_steps.get() == 0 && transposition.chromatic_semitones.get() == 0 {
            return Ok(false);
        }
        let mut prepared = Vec::new();
        for event in selection.events {
            if self.candidate.read_content_kind(&event) == Some(EventContentKind::Rest) {
                continue;
            }
            let notes = measure::collect_sources(
                &mut self.candidate,
                &CandidateOrder::new(&event, Children::Notes),
            )?;
            for note in notes {
                let Some(Value::NoteWrittenPitch(current)) = self.candidate.read_value(&note)
                else {
                    return Err(Failure::InternalError.into());
                };
                let note_id = self
                    .candidate
                    .raw_id(&note)
                    .ok_or(Failure::InternalError)?
                    .clone();
                let transformed =
                    crate::runtime::transpose_written_pitch_v1(&current, transposition)
                        .map_err(|reason| RangePreparationFailure::Transform { note_id, reason })?;
                if transformed != current {
                    self.candidate
                        .reservation
                        .vec(Site::JournalOperations, &mut prepared, 1)?;
                    prepared.push((note, transformed));
                }
            }
        }
        // TS derives effects only after all pitches have transformed. Its
        // effect interpreter then requires unique raw Note targets. Do not
        // let an early duplicate mask a later transformation failure.
        for (note, _) in &prepared {
            let raw = self
                .candidate
                .raw_id(note)
                .ok_or(Failure::InternalError)?
                .clone();
            if self.candidate.resolve(Kind::Note, &raw)? != *note {
                return Err(Failure::InternalError.into());
            }
        }
        let changed = !prepared.is_empty();
        for (note, value) in prepared {
            self.replace_scalar(&note, Value::NoteWrittenPitch(value))?;
        }
        Ok(changed)
    }
}
