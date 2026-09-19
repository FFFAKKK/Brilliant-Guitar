use brilliant_kernel_contracts::{
    CoreCommandEnvelopeV1, KernelStage3CommandFailureLeafV1, ScoreEntityTargetV1,
};
use brilliant_kernel_runtime::{KernelEffectV1, KernelStage3TransactionV1};

pub(crate) fn dispatch(
    transaction: &mut KernelStage3TransactionV1<'_>,
    command: CoreCommandEnvelopeV1,
) -> Result<(), KernelStage3CommandFailureLeafV1> {
    match command {
        CoreCommandEnvelopeV1::DocumentSetMetadata {
            target: ScoreEntityTargetV1::Document { document_id },
            metadata,
        } => KernelEffectV1::SetDocumentMetadata {
            document_id,
            metadata,
        }
        .apply(transaction),
        CoreCommandEnvelopeV1::NoteSetWrittenPitch {
            target: ScoreEntityTargetV1::Note { note_id },
            written_pitch,
        } => KernelEffectV1::ReplaceWrittenPitch {
            note_id,
            pitch: written_pitch,
        }
        .apply(transaction),
        CoreCommandEnvelopeV1::EventSetNoteValue {
            target: ScoreEntityTargetV1::Event { event_id },
            note_value,
        } => KernelEffectV1::SetEventNoteValue {
            event_id,
            note_value,
        }
        .apply(transaction),
        CoreCommandEnvelopeV1::VoiceInsertNotesEvent {
            target: ScoreEntityTargetV1::Voice { voice_id },
            anchor,
            event,
        } => KernelEffectV1::InsertNotesEvent {
            voice_id,
            anchor,
            event,
        }
        .apply(transaction),
        CoreCommandEnvelopeV1::VoiceInsertRestEvent {
            target: ScoreEntityTargetV1::Voice { voice_id },
            anchor,
            event,
        } => KernelEffectV1::InsertRestEvent {
            voice_id,
            anchor,
            event,
        }
        .apply(transaction),
        CoreCommandEnvelopeV1::EventRemove {
            target: ScoreEntityTargetV1::Event { event_id },
        } => KernelEffectV1::RemoveEvent { event_id }.apply(transaction),
        CoreCommandEnvelopeV1::DocumentSetMetadata { .. }
        | CoreCommandEnvelopeV1::NoteSetWrittenPitch { .. }
        | CoreCommandEnvelopeV1::EventSetNoteValue { .. }
        | CoreCommandEnvelopeV1::VoiceInsertNotesEvent { .. }
        | CoreCommandEnvelopeV1::VoiceInsertRestEvent { .. }
        | CoreCommandEnvelopeV1::EventRemove { .. } => {
            Err(KernelStage3CommandFailureLeafV1::TargetMismatch)
        }
        _ => Err(KernelStage3CommandFailureLeafV1::InternalError),
    }
}
