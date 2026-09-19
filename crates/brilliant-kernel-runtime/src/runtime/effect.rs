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
    SetEventNoteValue {
        event_id: StableId,
        note_value: NoteValueV1,
    },
    InsertNotesEvent {
        voice_id: StableId,
        anchor: SequenceAnchorV1,
        event: RhythmicEventV1,
    },
    InsertRestEvent {
        voice_id: StableId,
        anchor: SequenceAnchorV1,
        event: RhythmicEventV1,
    },
    RemoveEvent {
        event_id: StableId,
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

    fn set_event_note_value(
        &mut self,
        event_id: StableId,
        note_value: NoteValueV1,
    ) -> Result<(), KernelStage3CommandFailureLeafV1>;

    fn remove_event(&mut self, event_id: StableId) -> Result<(), KernelStage3CommandFailureLeafV1>;

    fn insert_notes_event(
        &mut self,
        voice_id: StableId,
        anchor: SequenceAnchorV1,
        event: RhythmicEventV1,
    ) -> Result<(), KernelStage3CommandFailureLeafV1>;

    fn insert_rest_event(
        &mut self,
        voice_id: StableId,
        anchor: SequenceAnchorV1,
        event: RhythmicEventV1,
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
        self.apply_to(transaction)?;
        transaction.ensure_work_budget()
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
            Self::SetEventNoteValue {
                event_id,
                note_value,
            } => transaction.set_event_note_value(event_id, note_value),
            Self::InsertNotesEvent {
                voice_id,
                anchor,
                event,
            } => transaction.insert_notes_event(voice_id, anchor, event),
            Self::InsertRestEvent {
                voice_id,
                anchor,
                event,
            } => transaction.insert_rest_event(voice_id, anchor, event),
            Self::RemoveEvent { event_id } => transaction.remove_event(event_id),
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

    fn set_event_note_value(
        &mut self,
        event_id: StableId,
        note_value: NoteValueV1,
    ) -> Result<(), KernelStage3CommandFailureLeafV1> {
        self.set_event_note_value(event_id, note_value)
    }

    fn remove_event(&mut self, event_id: StableId) -> Result<(), KernelStage3CommandFailureLeafV1> {
        KernelStage3TransactionV1::remove_event(self, event_id)
    }

    fn insert_notes_event(
        &mut self,
        voice_id: StableId,
        anchor: SequenceAnchorV1,
        event: RhythmicEventV1,
    ) -> Result<(), KernelStage3CommandFailureLeafV1> {
        KernelStage3TransactionV1::insert_notes_event(self, voice_id, anchor, event)
    }

    fn insert_rest_event(
        &mut self,
        voice_id: StableId,
        anchor: SequenceAnchorV1,
        event: RhythmicEventV1,
    ) -> Result<(), KernelStage3CommandFailureLeafV1> {
        KernelStage3TransactionV1::insert_rest_event(self, voice_id, anchor, event)
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
