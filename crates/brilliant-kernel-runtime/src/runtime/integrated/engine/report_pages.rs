//! Explicit private report V2 read. A stale version never silently reads a new
//! document. No plugin callbacks, history adoption or retained report cursors.
use super::*;
use brilliant_score_foundation::{
    CORE_PROFILE_PAGE_LIMIT_V2, ProfilePageFailureV2, ScoreSupportStatusV2,
    assess_score_profile_page_v2,
};

impl IntegratedKernelRuntimeV2 {
    pub(super) fn read_core_report_page(&self, request: &Value) -> Result<Value> {
        let invalid = || failure("report.invalid-request");
        if !exact(
            request,
            &[
                "operation",
                "reportVersion",
                "documentId",
                "documentVersion",
                "profileId",
                "offset",
                "limit",
            ],
        ) || integer(field(request, "reportVersion")?) != Some(2)
            || !tag(request, "profileId", "brilliant-guitar.k1")
        {
            return Err(invalid());
        }
        let document_id = string(field(request, "documentId")?).map_err(|_| invalid())?;
        let version = integer(field(request, "documentVersion")?).ok_or_else(invalid)?;
        let offset = integer(field(request, "offset")?)
            .and_then(|n| usize::try_from(n).ok())
            .ok_or_else(invalid)?;
        let limit = integer(field(request, "limit")?)
            .and_then(|n| usize::try_from(n).ok())
            .filter(|n| (1..=CORE_PROFILE_PAGE_LIMIT_V2).contains(n))
            .ok_or_else(invalid)?;
        DocumentVersionV1::try_from(version).map_err(|_| invalid())?;
        if document_id != self.runtime.document_id().as_js_string() {
            return Err(failure("report.document-mismatch"));
        }
        if version != self.runtime.document_version.get() {
            return Err(failure("report.stale-version"));
        }
        // A full projection/walk per page is explicit technical debt. No whole
        // diagnostic report is retained, and the document cannot change while
        // this synchronous borrow of the session is active.
        let document = self
            .runtime
            .store
            .export_document()
            .map_err(|_| internal())?;
        let page =
            assess_score_profile_page_v2(&document, &ScoreFeatureProfileV1::k1(), offset, limit)
                .map_err(|error| match error {
                    ProfilePageFailureV2::InvalidPageSize { .. } => invalid(),
                    ProfilePageFailureV2::OffsetOutOfBounds { total } => object([
                        ("code", text("report.offset-out-of-bounds")),
                        ("total", number(total as u64)),
                    ]),
                    ProfilePageFailureV2::Assessment(error) => assessment_failure(error),
                })?;
        let status = match page.status {
            ScoreSupportStatusV2::Supported => "supported",
            ScoreSupportStatusV2::Unsupported => "unsupported",
            ScoreSupportStatusV2::Invalid => "invalid",
        };
        Ok(object([
            ("ok", JsonValue::Bool(true)),
            (
                "report",
                object([
                    ("reportVersion", number(2)),
                    ("documentId", value(self.runtime.document_id())?),
                    ("documentVersion", number(version)),
                    ("profileId", text("brilliant-guitar.k1")),
                    ("status", text(status)),
                    ("offset", number(page.offset as u64)),
                    ("total", number(page.total as u64)),
                    ("diagnostics", value(&page.diagnostics)?),
                    (
                        "nextOffset",
                        page.next_offset
                            .map_or(JsonValue::Null, |offset| number(offset as u64)),
                    ),
                ]),
            ),
        ]))
    }
}
