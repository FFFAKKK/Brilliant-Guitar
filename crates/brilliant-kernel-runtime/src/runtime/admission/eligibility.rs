//! Decide representation from incoming structure, never from a failed execution.
//! Musical validity and dangling references remain final transaction semantics.
use super::*;
use std::collections::HashSet;

pub(super) fn needs_candidate(
    command: &CoreCommandEnvelopeV1,
    overlay: &mut TransactionOverlayV1<'_>,
) -> Result<bool, KernelStage3CommandFailureLeafV1> {
    let coverage = match command {
        CoreCommandEnvelopeV1::PartInsert {
            target: ScoreEntityTargetV1::Document { document_id },
            part,
            ..
        } => match overlay.read_order(&StableOrderAddressV1::Measures {
            document_id: document_id.clone(),
        }) {
            Some(ids) => exact_coverage(
                &ids,
                part.measure_contents
                    .iter()
                    .map(|content| &content.measure_id),
            )?,
            None => false,
        },
        CoreCommandEnvelopeV1::MeasureInsert {
            target: ScoreEntityTargetV1::Document { document_id },
            contents,
            ..
        } => match overlay.read_order(&StableOrderAddressV1::Parts {
            document_id: document_id.clone(),
        }) {
            Some(ids) => exact_coverage(&ids, contents.iter().map(|content| &content.part_id))?,
            None => false,
        },
        _ => true,
    };
    let mut incoming = HashSet::new();
    let mut collision = |id: &StableId| -> Result<bool, KernelStage3CommandFailureLeafV1> {
        incoming
            .try_reserve(1)
            .map_err(|_| KernelStage3CommandFailureLeafV1::InternalError)?;
        Ok(!incoming.insert(id.clone()) || overlay.resolve_entity_address(id).is_some())
    };
    Ok(match command {
        CoreCommandEnvelopeV1::VoiceInsertNotesEvent { event, .. }
        | CoreCommandEnvelopeV1::VoiceInsertRestEvent { event, .. } => {
            event_collision(event, &mut collision)?
        }
        CoreCommandEnvelopeV1::StaffInsert { staff, .. } => collision(&staff.id)?,
        CoreCommandEnvelopeV1::VoiceInsert { voice, .. } => voice_collision(voice, &mut collision)?,
        CoreCommandEnvelopeV1::PartInsert { part, .. } => {
            let mut unsafe_shape = !coverage || collision(&part.id)?;
            for staff in &part.staves {
                unsafe_shape |= collision(&staff.id)?;
            }
            for content in &part.measure_contents {
                for voice in &content.voices {
                    unsafe_shape |= voice_collision(voice, &mut collision)?;
                }
            }
            unsafe_shape
        }
        CoreCommandEnvelopeV1::MeasureInsert {
            definition,
            contents,
            ..
        } => {
            let mut unsafe_shape = !coverage || collision(&definition.id)?;
            for content in contents {
                for voice in &content.voices {
                    unsafe_shape |= voice_collision(voice, &mut collision)?;
                }
            }
            unsafe_shape
        }
        _ => false,
    })
}

fn exact_coverage<'a>(
    expected: &[StableId],
    actual: impl Iterator<Item = &'a StableId>,
) -> Result<bool, KernelStage3CommandFailureLeafV1> {
    let mut seen = HashSet::new();
    seen.try_reserve(expected.len())
        .map_err(|_| KernelStage3CommandFailureLeafV1::InternalError)?;
    for (index, id) in actual.enumerate() {
        if index == expected.len() {
            return Ok(false);
        }
        if !seen.insert(id) {
            return Ok(false);
        }
    }
    Ok(seen.len() == expected.len() && expected.iter().all(|id| seen.contains(id)))
}

fn voice_collision(
    voice: &VoiceV1,
    collision: &mut impl FnMut(&StableId) -> Result<bool, KernelStage3CommandFailureLeafV1>,
) -> Result<bool, KernelStage3CommandFailureLeafV1> {
    let mut found = collision(&voice.id)?;
    for event in &voice.sequence.events {
        found |= event_collision(event, collision)?;
    }
    Ok(found)
}

fn event_collision(
    event: &RhythmicEventV1,
    collision: &mut impl FnMut(&StableId) -> Result<bool, KernelStage3CommandFailureLeafV1>,
) -> Result<bool, KernelStage3CommandFailureLeafV1> {
    let mut found = collision(&event.id)?;
    if let RhythmicContentV1::Notes { notes } = &event.content {
        for note in notes {
            found |= collision(&note.id)?;
        }
    }
    Ok(found)
}
