use brilliant_kernel_contracts::{
    KernelSessionCreateRequestV1, KernelSessionCreateResultV1, KernelSessionCreateSuccessValueV1,
    KernelSessionReadResultV1, StableFailureV1,
};
use brilliant_kernel_runtime::SmokeRuntime;

#[derive(Debug)]
pub struct KernelSession {
    runtime: SmokeRuntime,
}

#[derive(Debug)]
pub struct KernelSessionCreateAccepted {
    pub session: KernelSession,
    pub result: KernelSessionCreateResultV1,
}

impl KernelSession {
    pub fn create(
        request: KernelSessionCreateRequestV1,
    ) -> Result<KernelSessionCreateAccepted, StableFailureV1> {
        if request.api_version != 1 {
            return Err(StableFailureV1::ContractUnsupportedApiVersion {
                supported_version: 1,
            });
        }
        if request.document.schema_version != "brilliant-score-1" {
            return Err(StableFailureV1::ScoreUnsupportedSchema {
                supported_schema: "brilliant-score-1",
            });
        }

        let runtime = SmokeRuntime::new(request.document);
        let result = KernelSessionCreateResultV1::Created(KernelSessionCreateSuccessValueV1 {
            document_id: runtime.document_id().clone(),
            document_version: runtime.document_version(),
        });
        Ok(KernelSessionCreateAccepted {
            session: Self { runtime },
            result,
        })
    }

    pub fn read_state(&self) -> KernelSessionReadResultV1 {
        KernelSessionReadResultV1::Ok(Box::new(self.runtime.read_state()))
    }
}

#[cfg(test)]
mod tests {
    use brilliant_kernel_contracts::{
        KernelSessionCreateRequestV1, decode_create_request, encode_create_result,
        encode_read_result,
    };

    use super::*;

    const SMOKE_REQUEST: &str = r#"{"apiVersion":1,"document":{"schemaVersion":"brilliant-score-1","id":"score-rkp1","metadata":{"title":"Smoke","authors":["Brilliant"],"tempo":{"bpm":120}},"measureDefinitions":[{"id":"measure-1","meter":{"numerator":4,"denominator":4}}],"parts":[{"id":"part-1","name":"Part","instrument":{"name":"Piano","writtenToSounding":{"diatonicSteps":0,"chromaticSemitones":0}},"staves":[{"id":"staff-1","lineCount":5,"defaultClef":{"sign":"G","line":2}}],"measureContents":[{"measureId":"measure-1","voices":[{"id":"voice-1","defaultStaffId":"staff-1","sequence":{"start":{"numerator":0,"denominator":1},"events":[{"id":"event-1","duration":{"base":1,"dots":0},"content":{"kind":"rest"}}]}}]}]}],"extensions":[]}}"#;

    #[test]
    fn create_and_read_return_exact_revision_zero_state() {
        let request = decode_create_request(SMOKE_REQUEST.as_bytes()).expect("request");
        let accepted = KernelSession::create(request).expect("session");
        assert_eq!(
            encode_create_result(&accepted.result).expect("create bytes"),
            br#"{"apiVersion":1,"status":"created","value":{"documentId":"score-rkp1","documentVersion":0}}"#
        );
        let read = accepted.session.read_state();
        let KernelSessionReadResultV1::Ok(state) = &read else {
            panic!("read must succeed");
        };
        assert_eq!(state.history.undo_depth, 0);
        assert_eq!(state.history.redo_depth, 0);
        assert!(!state.dirty);
        assert_eq!(state.snapshot.document_version.get(), 0);
        let bytes = encode_read_result(&read).expect("read bytes");
        let text = String::from_utf8(bytes).expect("UTF-8");
        assert!(
            text.starts_with(r#"{"apiVersion":1,"status":"ok","value":{"snapshot":{"documentId":"score-rkp1","schemaVersion":"brilliant-score-1","documentVersion":0,"document":{"#),
            "unexpected read prefix: {text}"
        );
    }

    #[test]
    fn decoded_input_is_detached_and_reads_are_repeatable() {
        let mut bytes = SMOKE_REQUEST.as_bytes().to_vec();
        let request = decode_create_request(&bytes).expect("request");
        let accepted = KernelSession::create(request).expect("session");
        bytes.fill(0);
        let first = encode_read_result(&accepted.session.read_state()).expect("first read");
        let second = encode_read_result(&accepted.session.read_state()).expect("second read");
        assert_eq!(first, second);
        assert!(
            String::from_utf8(first)
                .expect("UTF-8")
                .contains("score-rkp1")
        );
    }

    #[test]
    fn rejected_create_yields_no_session() {
        let mut request = decode_create_request(SMOKE_REQUEST.as_bytes()).expect("request");
        request.api_version = 2;
        assert_eq!(
            KernelSession::create(request).expect_err("rejected create"),
            StableFailureV1::ContractUnsupportedApiVersion {
                supported_version: 1
            }
        );

        let invalid_schema = KernelSessionCreateRequestV1 {
            api_version: 1,
            document: {
                let mut document = decode_create_request(SMOKE_REQUEST.as_bytes())
                    .expect("request")
                    .document;
                document.schema_version = "brilliant-score-2".to_owned();
                document
            },
        };
        assert!(matches!(
            KernelSession::create(invalid_schema),
            Err(StableFailureV1::ScoreUnsupportedSchema { .. })
        ));
    }
}
