//! Bounded, complete feature-report delivery over an immutable typed document.
//! This does not change the V1 transaction report budget or runtime protocol.
use crate::{
    AssessmentFailureV1, AssessmentNodeV1, CoreDiagnosticV1, DocumentAssessmentNodeV1,
    ScoreDocumentV1, ScoreFeatureProfileV1, assess_score_semantics_node,
    feature_profile::visit_valid_score_profile,
};

/// Maximum materialized diagnostics in one page; no aggregate report is built.
pub const CORE_PROFILE_PAGE_LIMIT_V2: usize = 4_096;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ScoreSupportStatusV2 {
    Supported,
    Unsupported,
    Invalid,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ScoreSupportPageV2 {
    pub status: ScoreSupportStatusV2,
    pub offset: usize,
    pub total: usize,
    pub diagnostics: Vec<CoreDiagnosticV1>,
    /// `None` means all diagnostics through `total` have been delivered.
    pub next_offset: Option<usize>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ProfilePageFailureV2 {
    InvalidPageSize { maximum: usize },
    OffsetOutOfBounds { total: usize },
    Assessment(AssessmentFailureV1),
}
impl From<AssessmentFailureV1> for ProfilePageFailureV2 {
    fn from(value: AssessmentFailureV1) -> Self {
        Self::Assessment(value)
    }
}

/// Read a deterministic page, counting the entire report without retaining it.
///
/// The document is borrowed for this call. A session exposing successive pages
/// MUST bind them to the same document version and profile; Foundation owns no
/// session/cursor. Callers enforce candidate byte/depth/property limits.
/// Each call performs full semantic and profile walks, so this is a bounded
/// storage primitive, not an incremental or qualified performance path.
/// Invalid semantics suppress profile diagnostics and retain the V1 semantic
/// diagnostic cap. A size outside 1..=4096 fails before assessment.
pub fn assess_score_profile_page_v2(
    document: &ScoreDocumentV1,
    profile: &ScoreFeatureProfileV1,
    offset: usize,
    page_size: usize,
) -> Result<ScoreSupportPageV2, ProfilePageFailureV2> {
    if !(1..=CORE_PROFILE_PAGE_LIMIT_V2).contains(&page_size) {
        return Err(ProfilePageFailureV2::InvalidPageSize {
            maximum: CORE_PROFILE_PAGE_LIMIT_V2,
        });
    }
    let node = DocumentAssessmentNodeV1::new(document);
    let semantic = assess_score_semantics_node(node.clone())?;
    if !semantic.ok {
        let total = semantic.diagnostics.len();
        check_offset(offset, total)?;
        let diagnostics = semantic
            .diagnostics
            .into_iter()
            .skip(offset)
            .take(page_size)
            .collect();
        return Ok(page(
            ScoreSupportStatusV2::Invalid,
            offset,
            total,
            diagnostics,
        ));
    }
    let mut diagnostics = Vec::new();
    let mut total = 0_usize;
    visit_valid_score_profile(node, profile, |code, node| {
        // Subtraction after the offset guard avoids offset + size overflow.
        if total >= offset && total - offset < page_size {
            diagnostics
                .try_reserve(1)
                .map_err(|_| AssessmentFailureV1::InternalCapacity)?;
            diagnostics.push(CoreDiagnosticV1::new(code, node.path(), None));
        }
        total = total
            .checked_add(1)
            .ok_or(AssessmentFailureV1::InternalCapacity)?;
        Ok(())
    })?;
    check_offset(offset, total)?;
    Ok(page(
        if total == 0 {
            ScoreSupportStatusV2::Supported
        } else {
            ScoreSupportStatusV2::Unsupported
        },
        offset,
        total,
        diagnostics,
    ))
}

fn check_offset(offset: usize, total: usize) -> Result<(), ProfilePageFailureV2> {
    if offset > total {
        return Err(ProfilePageFailureV2::OffsetOutOfBounds { total });
    }
    Ok(())
}

fn page(
    status: ScoreSupportStatusV2,
    offset: usize,
    total: usize,
    diagnostics: Vec<CoreDiagnosticV1>,
) -> ScoreSupportPageV2 {
    // Offset was validated, and collection cannot exceed the remaining rows.
    let end = offset + diagnostics.len();
    ScoreSupportPageV2 {
        status,
        offset,
        total,
        diagnostics,
        next_offset: (end < total).then_some(end),
    }
}

#[cfg(test)]
mod tests;
