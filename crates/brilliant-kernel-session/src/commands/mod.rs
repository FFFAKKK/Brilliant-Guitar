mod catalog;
mod hierarchy;
mod local;
mod measure;

use brilliant_kernel_contracts::{
    CoreCommandEnvelopeV1, CoreCommandIdV1, KernelStage3CommandFailureLeafV1,
};
use brilliant_kernel_runtime::KernelStage3TransactionV1;

pub(crate) use catalog::catalog_definition;

pub(crate) fn dispatch(
    transaction: &mut KernelStage3TransactionV1<'_>,
    command: CoreCommandEnvelopeV1,
) -> Result<(), KernelStage3CommandFailureLeafV1> {
    match command.command_id() {
        CoreCommandIdV1::DocumentSetMetadata
        | CoreCommandIdV1::NoteSetWrittenPitch
        | CoreCommandIdV1::EventSetNoteValue
        | CoreCommandIdV1::VoiceInsertNotesEvent
        | CoreCommandIdV1::VoiceInsertRestEvent
        | CoreCommandIdV1::EventRemove => local::dispatch(transaction, command),
        CoreCommandIdV1::MeasureInsert
        | CoreCommandIdV1::MeasureRemove
        | CoreCommandIdV1::MeasureMove
        | CoreCommandIdV1::MeasureSetDefinition => measure::dispatch(transaction, command),
        CoreCommandIdV1::PartInsert
        | CoreCommandIdV1::PartRemove
        | CoreCommandIdV1::PartMove
        | CoreCommandIdV1::PartSetName
        | CoreCommandIdV1::PartSetInstrument
        | CoreCommandIdV1::StaffInsert
        | CoreCommandIdV1::StaffRemove
        | CoreCommandIdV1::StaffMove
        | CoreCommandIdV1::StaffSetDefinition
        | CoreCommandIdV1::VoiceInsert
        | CoreCommandIdV1::VoiceRemove
        | CoreCommandIdV1::VoiceMove
        | CoreCommandIdV1::VoiceSetDefaultStaff
        | CoreCommandIdV1::VoiceSetSequenceStart
        | CoreCommandIdV1::EventSetStaffAssignment => hierarchy::dispatch(transaction, command),
        CoreCommandIdV1::RangeDelete
        | CoreCommandIdV1::RangeTransposeWrittenPitch
        | CoreCommandIdV1::TransactionBatch => Err(KernelStage3CommandFailureLeafV1::InternalError),
    }
}
