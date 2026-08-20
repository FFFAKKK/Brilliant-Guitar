use brilliant_core_types::DocumentVersionV1;
use brilliant_kernel_contracts::{KernelReadStateV1, initial_snapshot};
use brilliant_score_foundation::ScoreDocumentV1;

#[derive(Debug)]
pub struct SmokeRuntime {
    document: ScoreDocumentV1,
    document_version: DocumentVersionV1,
}

impl SmokeRuntime {
    pub fn new(document: ScoreDocumentV1) -> Self {
        Self {
            document,
            document_version: DocumentVersionV1::initial(),
        }
    }

    pub fn document_id(&self) -> &brilliant_core_types::StableId {
        &self.document.id
    }

    pub const fn document_version(&self) -> DocumentVersionV1 {
        self.document_version
    }

    pub fn read_state(&self) -> KernelReadStateV1 {
        initial_snapshot(self.document.clone())
    }
}

#[cfg(test)]
mod tests {
    use brilliant_kernel_contracts::decode_create_request;

    use super::*;

    const SMOKE_REQUEST: &str = r#"{"apiVersion":1,"document":{"schemaVersion":"brilliant-score-1","id":"score-rkp1","metadata":{"title":"Smoke","authors":["Brilliant"],"tempo":{"bpm":120}},"measureDefinitions":[{"id":"measure-1","meter":{"numerator":4,"denominator":4}}],"parts":[{"id":"part-1","name":"Part","instrument":{"name":"Piano","writtenToSounding":{"diatonicSteps":0,"chromaticSemitones":0}},"staves":[{"id":"staff-1","lineCount":5,"defaultClef":{"sign":"G","line":2}}],"measureContents":[{"measureId":"measure-1","voices":[{"id":"voice-1","defaultStaffId":"staff-1","sequence":{"start":{"numerator":0,"denominator":1},"events":[{"id":"event-1","duration":{"base":1,"dots":0},"content":{"kind":"rest"}}]}}]}]}],"extensions":[]}}"#;

    #[test]
    fn runtime_is_an_immutable_revision_zero_holder() {
        let request = decode_create_request(SMOKE_REQUEST.as_bytes()).expect("request");
        let runtime = SmokeRuntime::new(request.document);
        assert_eq!(runtime.document_id().as_str(), "score-rkp1");
        assert_eq!(runtime.document_version(), DocumentVersionV1::initial());
        let first = runtime.read_state();
        let second = runtime.read_state();
        assert_eq!(first, second);
        assert_eq!(first.history.undo_depth, 0);
        assert_eq!(first.history.redo_depth, 0);
        assert!(!first.dirty);
    }
}
