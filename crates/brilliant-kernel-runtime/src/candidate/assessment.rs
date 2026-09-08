//! Final assessment reads occurrences through Foundation's shared rules. It
//! builds no score DTO/JSON tree and never promotes a raw ID before validation.
//! This full traversal is for the exceptional admission route; ordinary typed
//! edits continue using the existing incremental dependency scheduler.
use super::*;
use crate::overlay::{ExtensionHeaderReadFailureV1, ExtensionHeaderV1};
use brilliant_core_types::{StablePathSegmentV1, StablePathV1};
use brilliant_score_foundation as score;
use score::{AssessmentFailureV1 as AssessmentFailure, AssessmentNodeV1, SemanticReportV1};
use std::cell::RefCell;

mod view;
use view::{Cursor, ReadValue};

type Outcome<T> = Result<T, AssessmentFailure>;

struct Source<'candidate, 'store> {
    candidate: RefCell<&'candidate mut Candidate<'store>>,
    extensions: Vec<ExtensionHeaderV1>,
}

impl Candidate<'_> {
    pub(super) fn assess_final_semantics(&mut self) -> Outcome<SemanticReportV1> {
        self.reservation
            .ensure_active()
            .map_err(|_| AssessmentFailure::InternalCapacity)?;
        let mut extensions = Vec::new();
        let mut reservation = std::mem::take(&mut self.reservation);
        let visited = self.prefix.visit_extension_headers(&mut |header| {
            if reservation
                .vec(Site::JournalOperations, &mut extensions, 1)
                .is_err()
            {
                return false;
            }
            extensions.push(header.clone());
            true
        });
        self.reservation = reservation;
        self.reservation
            .ensure_active()
            .map_err(|_| AssessmentFailure::InternalCapacity)?;
        if let Err(failure) = visited {
            self.reservation.abort();
            return Err(match failure {
                ExtensionHeaderReadFailureV1::Capacity => AssessmentFailure::InternalCapacity,
                ExtensionHeaderReadFailureV1::Unavailable
                | ExtensionHeaderReadFailureV1::Invariant => {
                    AssessmentFailure::InvalidCandidateShape {
                        path: StablePathV1::field("extensions"),
                    }
                }
            });
        }
        let document = self.document.clone();
        let source = Source {
            candidate: RefCell::new(self),
            extensions,
        };
        let report = score::assess_score_semantics_node(Cursor {
            source: &source,
            value: ReadValue::Entity(document),
            path: Vec::new(),
        });
        if report.is_err() {
            source.candidate.borrow_mut().reservation.abort();
        }
        report
    }
}

#[cfg(test)]
mod tests;
