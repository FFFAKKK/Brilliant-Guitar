//! Module effects share the candidate journal, but retain module segment facts.
use super::*;
use brilliant_score_foundation::{
    ExtensionBlockV1, ExtensionOwnerV1, ScoreDocumentV1, WrittenPitchV1,
};
#[cfg(test)]
mod tests;

pub(crate) struct ModuleSegmentSource {
    pub(crate) command_id: StableId,
    pub(crate) module_id: StableId,
    pub(crate) contribution_id: StableId,
}

impl CandidateExecution<'_> {
    pub(crate) fn integrated_document(&mut self) -> Result<ScoreDocumentV1<JsString>, Failure> {
        self.recorder
            .candidate
            .integrated_document(&|id| Ok(id.clone()))
    }

    pub(crate) fn contains_entity(&mut self, entity: &Entity) -> bool {
        let raw = match entity {
            Entity::Document { document_id } => document_id,
            Entity::Measure { measure_id } => measure_id,
            Entity::Part { part_id } => part_id,
            Entity::Staff { staff_id } => staff_id,
            Entity::Voice { voice_id } => voice_id,
            Entity::Event { event_id } => event_id,
            Entity::Note { note_id } => note_id,
        };
        self.recorder
            .candidate
            .resolve(Kind::of(entity), raw.as_js_string())
            .is_ok()
    }

    pub(crate) fn begin_module(&mut self) -> usize {
        // The SDK prepares a whole child before the outer Batch aggregate cap.
        // A child's own request cap is checked before entering its write loop.
        self.recorder.set_effect_budget(0);
        self.recorder.steps.len()
    }

    pub(crate) fn module_pitch(
        &mut self,
        note_id: &StableId,
        pitch: WrittenPitchV1,
    ) -> Result<(), Failure> {
        let result = (|| {
            let owner = self
                .recorder
                .candidate
                .resolve(Kind::Note, note_id.as_js_string())?;
            self.recorder
                .replace_scalar(&owner, Value::NoteWrittenPitch(pitch))?;
            Ok(())
        })();
        if result.is_err() {
            self.recorder.candidate.reservation.abort();
        }
        result
    }

    pub(crate) fn module_extension(
        &mut self,
        namespace: JsString,
        owner: ExtensionOwnerV1,
        block: Option<ExtensionBlockV1>,
    ) -> Result<(), Failure> {
        let result = (|| {
            let owner = match owner {
                ExtensionOwnerV1::Score => self.recorder.candidate.document.clone(),
                ExtensionOwnerV1::Part { part_id } => self
                    .recorder
                    .candidate
                    .resolve(Kind::Part, part_id.as_js_string())?,
            };
            self.recorder.edit_extension(namespace, &owner, block)?;
            Ok(())
        })();
        if result.is_err() {
            self.recorder.candidate.reservation.abort();
        }
        result
    }

    pub(crate) fn end_module(
        &mut self,
        first: usize,
        child_index: usize,
        source: ModuleSegmentSource,
        affected: &[AffectedEntityAddressV1],
    ) -> Result<(), Failure> {
        let result = self.end_module_inner(first, child_index, source, affected);
        if result.is_err() {
            self.recorder.candidate.reservation.abort();
        }
        result
    }

    fn end_module_inner(
        &mut self,
        first: usize,
        child_index: usize,
        source: ModuleSegmentSource,
        affected: &[AffectedEntityAddressV1],
    ) -> Result<(), Failure> {
        self.recorder.candidate.reservation.ensure_active()?;
        let count = self
            .recorder
            .steps
            .len()
            .checked_sub(first)
            .ok_or(Failure::InternalError)? as u64;
        if count == 0 {
            return Ok(());
        }
        let map = crate::runtime::map_change_set_build_failure;
        self.accounting.add_prepared_effects(count).map_err(map)?;
        let mut raw = Vec::new();
        self.recorder.candidate.reservation.vec(
            Site::JournalOperations,
            &mut raw,
            affected.len(),
        )?;
        raw.extend(affected.iter().map(raw_affected));
        self.accounting.check_affected_segment(&raw).map_err(map)?;
        let affected_start = self.affected.len();
        let operations = self
            .recorder
            .charge_module_segment(first, &mut self.accounting, affected, &mut self.affected)
            .map_err(map)?;
        self.operation_count = self
            .operation_count
            .checked_add(operations)
            .ok_or(Failure::InternalError)?;
        self.recorder
            .candidate
            .reservation
            .vec(Site::JournalOperations, &mut self.segments, 1)?;
        for id in [
            &source.command_id,
            &source.module_id,
            &source.contribution_id,
        ] {
            self.accounting.intern(id.as_js_string()).map_err(map)?;
        }
        self.accounting.charge_segment().map_err(map)?;
        self.segments.push(CommandSegment {
            child_index,
            command_id: brilliant_kernel_contracts::KernelCommandIdentityV1::Module(
                source.command_id.clone(),
            ),
            module_source: Some(source),
            step_start: first,
            step_end: self.recorder.steps.len(),
            affected_start,
            affected_end: self.affected.len(),
            effect_count: count,
        });
        self.changed = true;
        Ok(())
    }
}
