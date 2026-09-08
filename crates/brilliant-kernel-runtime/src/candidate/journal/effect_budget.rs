use super::*;

impl Recorder<'_> {
    pub(super) fn set_effect_budget(&mut self, prior: u64) {
        self.effect_budget = Some(prior);
    }

    // A composite consumes the snapshot once, after complete preparation and
    // before its first effect. Nested recorder primitives must not charge it
    // again. The execution seam retains the authoritative cumulative account.
    pub(super) fn check_effect_budget(&mut self, count: u64) -> Result<(), Failure> {
        if count == 0 {
            return Ok(());
        }
        if let Some(prior) = self.effect_budget {
            let limit = crate::change_set::MAX_PREPARED_EFFECTS_V1;
            let actual = prior.saturating_add(count);
            if actual > limit {
                return Err(Failure::ResourceLimitExceeded {
                    limit_kind:
                        brilliant_kernel_contracts::KernelStage3ResourceLimitKindV1::Effects,
                    limit,
                    actual,
                });
            }
            self.effect_budget = None;
        }
        Ok(())
    }

    pub(super) fn verify_effect_part(&mut self, part: &Occurrence) -> Result<(), Failure> {
        let raw = self
            .candidate
            .raw_id(part)
            .cloned()
            .ok_or(Failure::InternalError)?;
        if self
            .candidate
            .resolve(Kind::Part, &raw)
            .map_err(|_| Failure::InternalError)?
            != *part
        {
            return Err(Failure::InternalError);
        }
        Ok(())
    }
}
