use brilliant_kernel_contracts::{
    CORE_COMMAND_COUNT_V1, CoreCommandDefinitionV1, CoreCommandIdV1, CoreCommandTargetKindV1,
};

const fn entry(
    command_id: CoreCommandIdV1,
    target_kind: CoreCommandTargetKindV1,
) -> CoreCommandDefinitionV1 {
    CoreCommandDefinitionV1 {
        command_id,
        target_kind,
    }
}

pub(crate) const SESSION_COMMAND_CATALOG_V1: [CoreCommandDefinitionV1; CORE_COMMAND_COUNT_V1] = [
    entry(
        CoreCommandIdV1::DocumentSetMetadata,
        CoreCommandTargetKindV1::Document,
    ),
    entry(
        CoreCommandIdV1::NoteSetWrittenPitch,
        CoreCommandTargetKindV1::Note,
    ),
    entry(
        CoreCommandIdV1::EventSetNoteValue,
        CoreCommandTargetKindV1::Event,
    ),
    entry(
        CoreCommandIdV1::VoiceInsertNotesEvent,
        CoreCommandTargetKindV1::Voice,
    ),
    entry(
        CoreCommandIdV1::VoiceInsertRestEvent,
        CoreCommandTargetKindV1::Voice,
    ),
    entry(CoreCommandIdV1::EventRemove, CoreCommandTargetKindV1::Event),
    entry(
        CoreCommandIdV1::MeasureInsert,
        CoreCommandTargetKindV1::Document,
    ),
    entry(
        CoreCommandIdV1::MeasureRemove,
        CoreCommandTargetKindV1::Measure,
    ),
    entry(
        CoreCommandIdV1::MeasureMove,
        CoreCommandTargetKindV1::Measure,
    ),
    entry(
        CoreCommandIdV1::MeasureSetDefinition,
        CoreCommandTargetKindV1::Measure,
    ),
    entry(
        CoreCommandIdV1::PartInsert,
        CoreCommandTargetKindV1::Document,
    ),
    entry(CoreCommandIdV1::PartRemove, CoreCommandTargetKindV1::Part),
    entry(CoreCommandIdV1::PartMove, CoreCommandTargetKindV1::Part),
    entry(CoreCommandIdV1::PartSetName, CoreCommandTargetKindV1::Part),
    entry(
        CoreCommandIdV1::PartSetInstrument,
        CoreCommandTargetKindV1::Part,
    ),
    entry(CoreCommandIdV1::StaffInsert, CoreCommandTargetKindV1::Part),
    entry(CoreCommandIdV1::StaffRemove, CoreCommandTargetKindV1::Staff),
    entry(CoreCommandIdV1::StaffMove, CoreCommandTargetKindV1::Staff),
    entry(
        CoreCommandIdV1::StaffSetDefinition,
        CoreCommandTargetKindV1::Staff,
    ),
    entry(CoreCommandIdV1::VoiceInsert, CoreCommandTargetKindV1::Part),
    entry(CoreCommandIdV1::VoiceRemove, CoreCommandTargetKindV1::Voice),
    entry(CoreCommandIdV1::VoiceMove, CoreCommandTargetKindV1::Voice),
    entry(
        CoreCommandIdV1::VoiceSetDefaultStaff,
        CoreCommandTargetKindV1::Voice,
    ),
    entry(
        CoreCommandIdV1::VoiceSetSequenceStart,
        CoreCommandTargetKindV1::Voice,
    ),
    entry(
        CoreCommandIdV1::EventSetStaffAssignment,
        CoreCommandTargetKindV1::Event,
    ),
    entry(
        CoreCommandIdV1::RangeDelete,
        CoreCommandTargetKindV1::Document,
    ),
    entry(
        CoreCommandIdV1::RangeTransposeWrittenPitch,
        CoreCommandTargetKindV1::Document,
    ),
    entry(
        CoreCommandIdV1::TransactionBatch,
        CoreCommandTargetKindV1::Document,
    ),
];

pub(crate) fn catalog_definition(command_id: CoreCommandIdV1) -> &'static CoreCommandDefinitionV1 {
    SESSION_COMMAND_CATALOG_V1
        .iter()
        .find(|definition| definition.command_id == command_id)
        .expect("closed command catalog")
}

#[cfg(test)]
mod tests {
    use brilliant_kernel_contracts::CORE_COMMAND_CATALOG_V1;

    use super::*;

    #[test]
    fn local_session_catalog_exactly_matches_contracts_and_typescript() {
        assert_eq!(SESSION_COMMAND_CATALOG_V1, CORE_COMMAND_CATALOG_V1);

        let typescript =
            include_str!("../../../../src/core-kernel/commands/catalog.ts").replace("\r\n", "\n");
        let mut cursor = 0;
        for definition in SESSION_COMMAND_CATALOG_V1 {
            let command_needle = format!("commandId: \"{}\"", definition.command_id.as_str());
            let command_offset = typescript[cursor..]
                .find(&command_needle)
                .expect("TypeScript command in order")
                + cursor;
            let target_needle = format!("targetKind: \"{}\"", definition.target_kind.as_str());
            let target_offset = typescript[command_offset..]
                .find(&target_needle)
                .expect("TypeScript target kind")
                + command_offset;
            let next_command = typescript[command_offset + command_needle.len()..]
                .find("commandId:")
                .map(|offset| command_offset + command_needle.len() + offset)
                .unwrap_or(typescript.len());
            assert!(
                target_offset < next_command,
                "target belongs to command entry"
            );
            cursor = target_offset + target_needle.len();
        }
        assert_eq!(
            typescript.matches("commandId:").count(),
            CORE_COMMAND_COUNT_V1
        );
    }
}
