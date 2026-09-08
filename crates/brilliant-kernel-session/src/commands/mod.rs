mod catalog;
mod hierarchy;
mod local;
mod measure;
mod range;

use brilliant_kernel_contracts::{
    CoreCommandEnvelopeV1, CoreCommandIdV1, KernelStage3CommandFailureLeafV1,
};
use brilliant_kernel_runtime::KernelStage3TransactionV1;

pub(crate) use catalog::catalog_definition;

#[cfg(test)]
#[derive(Debug)]
pub(crate) enum TestFailureExpectation {
    Leaf(KernelStage3CommandFailureLeafV1),
    Semantic(&'static str),
}

#[cfg(test)]
impl From<KernelStage3CommandFailureLeafV1> for TestFailureExpectation {
    fn from(value: KernelStage3CommandFailureLeafV1) -> Self {
        Self::Leaf(value)
    }
}

#[cfg(test)]
impl PartialEq<TestFailureExpectation> for KernelStage3CommandFailureLeafV1 {
    fn eq(&self, expected: &TestFailureExpectation) -> bool {
        match expected {
            TestFailureExpectation::Leaf(failure) => self == failure,
            TestFailureExpectation::Semantic(code) => match self {
                Self::SemanticInvalid { diagnostics } => {
                    diagnostics.len() == 1
                        && diagnostics[0].code.as_str() == *code
                        && diagnostics[0].message_key == format!("core.{code}")
                        && diagnostics[0].details.is_none()
                }
                _ => false,
            },
        }
    }
}

#[cfg(test)]
pub(crate) fn semantic_test_failure(code: &'static str) -> TestFailureExpectation {
    TestFailureExpectation::Semantic(code)
}
pub(crate) fn dispatch(
    transaction: &mut KernelStage3TransactionV1<'_>,
    command: CoreCommandEnvelopeV1,
) -> Result<(), KernelStage3CommandFailureLeafV1> {
    if command.target().kind() != catalog_definition(command.command_id()).target_kind {
        return Err(KernelStage3CommandFailureLeafV1::TargetMismatch);
    }
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
        CoreCommandIdV1::RangeDelete | CoreCommandIdV1::RangeTransposeWrittenPitch => {
            range::dispatch(transaction, command)
        }
        CoreCommandIdV1::TransactionBatch => Err(KernelStage3CommandFailureLeafV1::InternalError),
    }
}
