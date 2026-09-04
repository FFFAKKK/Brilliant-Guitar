use brilliant_kernel_contracts::{
    CoreCommandEnvelopeV1, KernelStage3CommandFailureLeafV1, ScoreEntityTargetV1,
};
use brilliant_kernel_runtime::KernelStage3TransactionV1;

pub(crate) fn dispatch(
    transaction: &mut KernelStage3TransactionV1<'_>,
    command: CoreCommandEnvelopeV1,
) -> Result<(), KernelStage3CommandFailureLeafV1> {
    match command {
        CoreCommandEnvelopeV1::DocumentSetMetadata {
            target: ScoreEntityTargetV1::Document { document_id },
            metadata,
        } => transaction.set_document_metadata(document_id, metadata),
        CoreCommandEnvelopeV1::NoteSetWrittenPitch {
            target: ScoreEntityTargetV1::Note { note_id },
            written_pitch,
        } => transaction.set_note_written_pitch(note_id, written_pitch),
        CoreCommandEnvelopeV1::EventSetNoteValue {
            target: ScoreEntityTargetV1::Event { event_id },
            note_value,
        } => transaction.set_event_note_value(event_id, note_value),
        CoreCommandEnvelopeV1::VoiceInsertNotesEvent {
            target: ScoreEntityTargetV1::Voice { voice_id },
            anchor,
            event,
        } => transaction.insert_notes_event(voice_id, anchor, event),
        CoreCommandEnvelopeV1::VoiceInsertRestEvent {
            target: ScoreEntityTargetV1::Voice { voice_id },
            anchor,
            event,
        } => transaction.insert_rest_event(voice_id, anchor, event),
        CoreCommandEnvelopeV1::EventRemove {
            target: ScoreEntityTargetV1::Event { event_id },
        } => transaction.remove_event(event_id),
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
