//! Part command preparation is separate from the stored subtree interpreter.
//! The latter must also replay transient trees that cannot be command targets.
use super::*;

impl Recorder<'_> {
    pub(super) fn remove_part_command(&mut self, raw_id: &JsString) -> Result<(), Failure> {
        let result = self.remove_part_command_inner(raw_id);
        if result.is_err() {
            self.candidate.reservation.abort();
        }
        result
    }

    fn remove_part_command_inner(&mut self, raw_id: &JsString) -> Result<(), Failure> {
        self.candidate.reservation.ensure_active()?;
        // Match TS preparation: target resolution precedes owner content checks.
        let root = self.candidate.resolve(Kind::Part, raw_id)?;
        let document = self.candidate.document.clone();
        let measures = collect_raw_order(
            &mut self.candidate,
            &CandidateOrder::new(&document, Children::Measures),
        )?;
        let contents = collect_raw_order(
            &mut self.candidate,
            &CandidateOrder::new(&root, Children::Contents),
        )?;
        if contents.len() != measures.len() {
            return Err(Failure::InternalError);
        }
        let mut seen = HashSet::new();
        self.candidate
            .reservation
            .set(Site::JournalOperations, &mut seen, contents.len())?;
        for content in contents {
            if !seen.insert(content) {
                return Err(Failure::InternalError);
            }
        }
        if measures.iter().any(|measure| !seen.contains(measure)) {
            return Err(Failure::InternalError);
        }
        // Final semantic validation, including the minimum Part count, remains
        // after all batch children. This helper does not publish Store changes.
        self.remove_part_inner(raw_id)
    }
}

fn collect_raw_order(
    candidate: &mut Candidate<'_>,
    order: &CandidateOrder,
) -> Result<Vec<JsString>, Failure> {
    let mut result = Vec::new();
    let mut reservation = std::mem::take(&mut candidate.reservation);
    let visited = candidate.visit_order(order, &mut |_, raw| {
        if reservation
            .vec(Site::JournalOperations, &mut result, 1)
            .is_err()
        {
            return false;
        }
        result.push(raw.clone());
        true
    });
    candidate.reservation = reservation;
    candidate.reservation.ensure_active()?;
    visited.ok_or(Failure::InternalError)?;
    Ok(result)
}
