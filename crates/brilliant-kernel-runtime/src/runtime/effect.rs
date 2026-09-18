//! Typed mutation vocabulary shared by Core and extension command paths.
use super::*;
use brilliant_score_foundation::{ExtensionBlockV1, ExtensionOwnerV1};

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum KernelEffectV1 {
    ReplaceWrittenPitch {
        note_id: StableId,
        pitch: WrittenPitchV1,
    },
    SetDocumentMetadata {
        document_id: StableId,
        metadata: ScoreMetadataV1,
    },
    SetExtension {
        namespace: JsString,
        owner: ExtensionOwnerV1,
        block: Option<ExtensionBlockV1>,
    },
}

pub(crate) trait KernelEffectTransaction {
    fn replace_written_pitch(
        &mut self,
        note_id: StableId,
        pitch: WrittenPitchV1,
    ) -> Result<(), KernelStage3CommandFailureLeafV1>;

    fn set_document_metadata(
        &mut self,
        document_id: StableId,
        metadata: ScoreMetadataV1,
    ) -> Result<(), KernelStage3CommandFailureLeafV1>;

    fn set_extension(
        &mut self,
        namespace: JsString,
        owner: ExtensionOwnerV1,
        block: Option<ExtensionBlockV1>,
    ) -> Result<(), KernelStage3CommandFailureLeafV1>;
}

impl KernelEffectV1 {
    pub fn apply(
        self,
        transaction: &mut KernelStage3TransactionV1<'_>,
    ) -> Result<(), KernelStage3CommandFailureLeafV1> {
        self.apply_to(transaction)
    }

    pub(crate) fn apply_to<T: KernelEffectTransaction>(
        self,
        transaction: &mut T,
    ) -> Result<(), KernelStage3CommandFailureLeafV1> {
        match self {
            Self::ReplaceWrittenPitch { note_id, pitch } => {
                transaction.replace_written_pitch(note_id, pitch)
            }
            Self::SetDocumentMetadata {
                document_id,
                metadata,
            } => transaction.set_document_metadata(document_id, metadata),
            Self::SetExtension {
                namespace,
                owner,
                block,
            } => transaction.set_extension(namespace, owner, block),
        }
    }
}

impl KernelEffectTransaction for KernelStage3TransactionV1<'_> {
    fn replace_written_pitch(
        &mut self,
        note_id: StableId,
        pitch: WrittenPitchV1,
    ) -> Result<(), KernelStage3CommandFailureLeafV1> {
        self.set_note_written_pitch(note_id, pitch)
    }

    fn set_document_metadata(
        &mut self,
        document_id: StableId,
        metadata: ScoreMetadataV1,
    ) -> Result<(), KernelStage3CommandFailureLeafV1> {
        self.set_document_metadata(document_id, metadata)
    }

    fn set_extension(
        &mut self,
        namespace: JsString,
        owner: ExtensionOwnerV1,
        block: Option<ExtensionBlockV1>,
    ) -> Result<(), KernelStage3CommandFailureLeafV1> {
        self.set_integrated_extension(namespace, owner, block)
    }
}
