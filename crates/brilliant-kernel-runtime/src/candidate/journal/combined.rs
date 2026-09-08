//! One history entry retains the typed prefix and the occurrence suffix. Both
//! replay privately before the sole semantic assessment and Store adoption.
use super::*;
use crate::{
    candidate::adoption::FinalizationFailure,
    change_set::ChangeSetV1,
    store::LiveScoreStore,
    transaction::{PreparedFinalStateCommitV1, replay_overlay_on_base},
};
use brilliant_core_types::DocumentVersionV1;

pub(super) struct CombinedHistory {
    prefix: ChangeSetV1,
    suffix: Journal,
}

impl Recorder<'_> {
    pub(super) fn prepare_combined_commit(
        self,
        store: &LiveScoreStore,
        version: DocumentVersionV1,
    ) -> Result<(Option<PreparedFinalStateCommitV1>, CombinedHistory), FinalizationFailure> {
        let (plan, prefix, suffix) = self.prepare_final_commit(store, version)?;
        Ok((plan, CombinedHistory { prefix, suffix }))
    }
}

impl CombinedHistory {
    pub(super) fn prepare_replay(
        &self,
        store: &LiveScoreStore,
        version: DocumentVersionV1,
        direction: Direction,
    ) -> Result<Option<PreparedFinalStateCommitV1>, FinalizationFailure> {
        let suffix_operations = self.suffix.steps.len() as u64;
        if self.prefix.forward.is_empty() && suffix_operations == 0 {
            return Ok(None);
        }
        let document_id = store.header.id.clone();
        match direction {
            Direction::Forward => {
                let prefix =
                    replay_overlay_on_base(store, &self.prefix.arena, &self.prefix.forward)?;
                let mut candidate = Candidate::new(prefix, document_id);
                self.suffix
                    .replay(&mut candidate, Direction::Forward)
                    .map_err(FinalizationFailure::Command)?;
                let (plan, _) = candidate.validate_final()?.prepare_commit(
                    store,
                    version,
                    suffix_operations,
                )?;
                Ok(plan)
            }
            Direction::Inverse if suffix_operations == 0 => {
                let prefix =
                    replay_overlay_on_base(store, &self.prefix.arena, &self.prefix.inverse)?;
                let (plan, _) = Candidate::new(prefix, document_id)
                    .validate_final()?
                    .prepare_commit(store, version, 0)?;
                Ok(plan)
            }
            Direction::Inverse => {
                let mut candidate =
                    Candidate::new(TransactionOverlayV1::new(store), document_id.clone());
                self.suffix
                    .replay(&mut candidate, Direction::Inverse)
                    .map_err(FinalizationFailure::Command)?;
                // Check every retained start locator before exposing the frozen
                // intermediate read surface to the typed interpreter.
                ReplayBindings::at(
                    &self.suffix.identities,
                    BoundarySide::SuffixStart,
                    &mut candidate,
                )
                .map_err(FinalizationFailure::Command)?;
                let boundary = candidate.seal_structural_boundary()?;
                let prior_delta = boundary.replay_delta()?;
                let prior_work = boundary.replay_work();
                let inverse =
                    replay_overlay_on_base(&boundary, &self.prefix.arena, &self.prefix.inverse)?;
                let final_candidate = Candidate::new(inverse, document_id);
                let (plan, _) = final_candidate
                    .validate_final()?
                    .prepare_commit_with_prior(
                        store,
                        version,
                        suffix_operations,
                        prior_delta,
                        prior_work,
                    )?;
                Ok(plan)
            }
        }
    }
}

#[cfg(test)]
mod tests;
