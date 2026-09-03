use brilliant_core_types::{DocumentVersionV1, StableId, StablePathV1};
use brilliant_kernel_contracts::{
    KernelReadStateV1, ScoreStructureViolationV1, StableFailureV1, initial_snapshot,
};
use brilliant_score_foundation::ScoreDocumentV1;

use crate::store::{LiveScoreStore, LiveStoreBuildFailure, build_live_score_store};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum KernelRuntimeCreateFailure {
    InternalCapacity,
    InvalidDocument(ScoreStructureViolationV1),
    InternalInvariant,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum KernelRuntimeReadFailure {
    InternalInvariant,
}

impl KernelRuntimeCreateFailure {
    pub fn into_stable_failure(self) -> StableFailureV1 {
        match self {
            Self::InternalCapacity | Self::InternalInvariant => StableFailureV1::BridgeInternal,
            Self::InvalidDocument(violation) => StableFailureV1::ScoreInvalidStructure {
                path: StablePathV1::root(),
                violation,
            },
        }
    }
}

impl KernelRuntimeReadFailure {
    pub fn into_stable_failure(self) -> StableFailureV1 {
        match self {
            Self::InternalInvariant => StableFailureV1::BridgeInternal,
        }
    }
}

#[derive(Debug)]
pub struct KernelRuntime {
    store: LiveScoreStore,
    document_version: DocumentVersionV1,
}

impl KernelRuntime {
    pub fn create(document: ScoreDocumentV1) -> Result<Self, KernelRuntimeCreateFailure> {
        let store = build_live_score_store(&document).map_err(map_store_create_failure)?;
        Ok(Self {
            store,
            document_version: DocumentVersionV1::initial(),
        })
    }

    pub fn document_id(&self) -> &StableId {
        &self.store.header.id
    }

    pub const fn document_version(&self) -> DocumentVersionV1 {
        self.document_version
    }

    pub fn read_state(&self) -> Result<KernelReadStateV1, KernelRuntimeReadFailure> {
        let document = self
            .store
            .export_document()
            .map_err(|_| KernelRuntimeReadFailure::InternalInvariant)?;
        Ok(initial_snapshot(document))
    }
}

fn map_store_create_failure(failure: LiveStoreBuildFailure) -> KernelRuntimeCreateFailure {
    match failure {
        LiveStoreBuildFailure::InternalCapacity => KernelRuntimeCreateFailure::InternalCapacity,
        LiveStoreBuildFailure::DuplicateStableId => {
            KernelRuntimeCreateFailure::InvalidDocument(ScoreStructureViolationV1::DuplicateId)
        }
        LiveStoreBuildFailure::MissingMeasureReference
        | LiveStoreBuildFailure::MissingStaffReference
        | LiveStoreBuildFailure::MissingPartReference
        | LiveStoreBuildFailure::DuplicatePartMeasureContent => {
            KernelRuntimeCreateFailure::InvalidDocument(ScoreStructureViolationV1::InvalidReference)
        }
        LiveStoreBuildFailure::LocalInvariant(_) => KernelRuntimeCreateFailure::InternalInvariant,
    }
}

#[cfg(test)]
mod tests {
    use brilliant_kernel_contracts::decode_create_request;
    use brilliant_score_foundation::canonical_score_bytes;

    use super::*;

    #[test]
    fn runtime_owns_only_the_live_store_and_revision_zero() {
        let document = crate::store::tests::fixture();
        let runtime = KernelRuntime::create(document).expect("runtime");
        assert_eq!(runtime.document_id().as_str(), "score-root");
        assert_eq!(runtime.document_version(), DocumentVersionV1::initial());

        let source = include_str!("runtime.rs").replace("\r\n", "\n");
        let declaration = source
            .split("pub struct KernelRuntime {")
            .nth(1)
            .expect("runtime declaration")
            .split("}\n\n")
            .next()
            .expect("runtime fields");
        assert!(!declaration.contains("ScoreDocumentV1"));
    }

    #[test]
    fn deterministic_export_is_semantically_equal_and_canonically_stable() {
        let document = crate::store::tests::fixture();
        let expected_bytes = canonical_score_bytes(&document).expect("input canonical bytes");
        let runtime = KernelRuntime::create(document.clone()).expect("runtime");
        let first = runtime.read_state().expect("first read");
        let second = runtime.read_state().expect("second read");
        assert_eq!(first, second);
        assert_eq!(first.snapshot.document, document);

        let exported_bytes =
            canonical_score_bytes(&first.snapshot.document).expect("export canonical bytes");
        assert_eq!(exported_bytes, expected_bytes);

        let mut request_bytes = br#"{"apiVersion":1,"document":"#.to_vec();
        request_bytes.extend_from_slice(&exported_bytes);
        request_bytes.push(b'}');
        let decoded = decode_create_request(&request_bytes)
            .expect("exported document decodes")
            .document;
        assert_eq!(
            canonical_score_bytes(&decoded).expect("re-encoded canonical bytes"),
            exported_bytes
        );
    }
}
