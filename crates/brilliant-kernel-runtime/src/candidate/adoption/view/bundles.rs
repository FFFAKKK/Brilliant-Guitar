//! Reconstruct only the requested typed root from actual visible children.
//! No expected-operation image, ScoreDocument, or JSON projection is consulted.
use super::*;
use crate::change_set::{MeasureBundleV1, MeasurePartContentBundleV1, PartBundleV1};
use brilliant_score_foundation::{
    MeasureDefinitionV1, MusicSequenceV1, PartMeasureContentV1, PartV1, ScoreNoteV1,
    StaffDefinitionV1, VoiceV1,
};

impl StableCandidateView<'_> {
    /// Reserve before appending; an unavailable child or failed allocation must
    /// fail the whole aggregate, never return a truncated successful bundle.
    fn bundle_children<T>(
        &self,
        order: &Order,
        mut read: impl FnMut(&StableId) -> Option<T>,
    ) -> Option<Vec<T>> {
        let mut result = Vec::new();
        let mut complete = true;
        self.visit_order(order, &mut |id| {
            let Some(value) = read(id) else {
                complete = false;
                return false;
            };
            if result.try_reserve(1).is_err() {
                complete = false;
                return false;
            }
            result.push(value);
            true
        })?;
        complete.then_some(result)
    }

    pub(super) fn detach_bundle(&self, address: &Entity) -> Option<EntityBundleV1> {
        self.occurrence(address)?;
        Some(match address {
            Entity::Document { .. } => return None,
            Entity::Measure { measure_id } => {
                EntityBundleV1::Measure(self.bundle_measure(measure_id)?)
            }
            Entity::Part { part_id } => EntityBundleV1::Part(self.bundle_part(part_id)?),
            Entity::Staff { staff_id } => EntityBundleV1::Staff(self.bundle_staff(staff_id)?),
            Entity::Voice { voice_id } => EntityBundleV1::Voice(self.bundle_voice(voice_id)?),
            Entity::Event { event_id } => EntityBundleV1::Event(self.bundle_event(event_id)?),
            Entity::Note { note_id } => EntityBundleV1::Note(self.bundle_note(note_id)?),
        })
    }

    fn bundle_measure(&self, measure_id: &StableId) -> Option<MeasureBundleV1> {
        let Value::MeasureDefinition {
            meter,
            pickup_duration,
        } = self.read_scalar(&Scalar::MeasureDefinition {
            measure_id: measure_id.clone(),
        })?
        else {
            return None;
        };
        let Owner::Document { document_id } = self.read_owner(&Entity::Measure {
            measure_id: measure_id.clone(),
        })?
        else {
            return None;
        };
        let mut contents = Vec::new();
        let mut complete = true;
        self.visit_order(&Order::Parts { document_id }, &mut |part_id| {
            if self
                .candidate
                .borrow()
                .final_content(part_id, measure_id)
                .is_none()
            {
                return true;
            }
            let Some(voices) = self.bundle_voices(part_id, measure_id) else {
                complete = false;
                return false;
            };
            if contents.try_reserve(1).is_err() {
                complete = false;
                return false;
            }
            contents.push(MeasurePartContentBundleV1 {
                part_id: part_id.clone(),
                voices,
            });
            true
        })?;
        if !complete {
            return None;
        }
        Some(MeasureBundleV1 {
            definition: MeasureDefinitionV1 {
                id: measure_id.clone(),
                meter,
                pickup_duration,
            },
            contents,
        })
    }

    fn bundle_part(&self, part_id: &StableId) -> Option<PartBundleV1> {
        let Value::PartName(name) = self.read_scalar(&Scalar::PartName {
            part_id: part_id.clone(),
        })?
        else {
            return None;
        };
        let Value::PartInstrument(instrument) = self.read_scalar(&Scalar::PartInstrument {
            part_id: part_id.clone(),
        })?
        else {
            return None;
        };
        let staves = self.bundle_children(
            &Order::Staffs {
                part_id: part_id.clone(),
            },
            |id| self.bundle_staff(id),
        )?;
        let measure_contents = self.bundle_children(
            &Order::MeasureContents {
                part_id: part_id.clone(),
            },
            |measure_id| {
                Some(PartMeasureContentV1 {
                    measure_id: measure_id.clone(),
                    voices: self.bundle_voices(part_id, measure_id)?,
                })
            },
        )?;
        let extensions = self
            .candidate
            .borrow()
            .prefix
            .read_part_extensions(part_id)
            .ok()?;
        Some(PartBundleV1 {
            part: PartV1 {
                id: part_id.clone(),
                name,
                instrument,
                staves,
                measure_contents,
            },
            extensions,
        })
    }

    fn bundle_staff(&self, staff_id: &StableId) -> Option<StaffDefinitionV1> {
        let Value::StaffDefinition {
            line_count,
            default_clef,
        } = self.read_scalar(&Scalar::StaffDefinition {
            staff_id: staff_id.clone(),
        })?
        else {
            return None;
        };
        Some(StaffDefinitionV1 {
            id: staff_id.clone(),
            line_count,
            default_clef,
        })
    }

    fn bundle_voices(&self, part_id: &StableId, measure_id: &StableId) -> Option<Vec<VoiceV1>> {
        self.bundle_children(
            &Order::Voices {
                part_id: part_id.clone(),
                measure_id: measure_id.clone(),
            },
            |id| self.bundle_voice(id),
        )
    }

    fn bundle_voice(&self, voice_id: &StableId) -> Option<VoiceV1> {
        let Value::VoiceSequenceStart(start) = self.read_scalar(&Scalar::VoiceSequenceStart {
            voice_id: voice_id.clone(),
        })?
        else {
            return None;
        };
        let ReferenceValueV1::StableId(default_staff_id) =
            self.read_reference(&Reference::VoiceDefaultStaff {
                voice_id: voice_id.clone(),
            })?
        else {
            return None;
        };
        let events = self.bundle_children(
            &Order::Events {
                voice_id: voice_id.clone(),
            },
            |id| self.bundle_event(id),
        )?;
        Some(VoiceV1 {
            id: voice_id.clone(),
            default_staff_id,
            sequence: MusicSequenceV1 { start, events },
        })
    }

    fn bundle_event(&self, event_id: &StableId) -> Option<RhythmicEventV1> {
        let Value::EventNoteValue(duration) = self.read_scalar(&Scalar::EventNoteValue {
            event_id: event_id.clone(),
        })?
        else {
            return None;
        };
        let ReferenceValueV1::OptionalStableId(staff_id) =
            self.read_reference(&Reference::EventStaffAssignment {
                event_id: event_id.clone(),
            })?
        else {
            return None;
        };
        let content = match self.read_event_content_kind(event_id)? {
            EventContentKind::Rest => {
                // A structural inconsistency must not disappear in projection.
                let mut empty = true;
                self.visit_order(
                    &Order::Notes {
                        event_id: event_id.clone(),
                    },
                    &mut |_| {
                        empty = false;
                        false
                    },
                )?;
                if !empty {
                    return None;
                }
                RhythmicContentV1::Rest
            }
            EventContentKind::Notes => RhythmicContentV1::Notes {
                notes: self.bundle_children(
                    &Order::Notes {
                        event_id: event_id.clone(),
                    },
                    |id| self.bundle_note(id),
                )?,
            },
        };
        Some(RhythmicEventV1 {
            id: event_id.clone(),
            duration,
            staff_id,
            content,
        })
    }

    fn bundle_note(&self, note_id: &StableId) -> Option<ScoreNoteV1> {
        let Value::NoteWrittenPitch(written_pitch) =
            self.read_scalar(&Scalar::NoteWrittenPitch {
                note_id: note_id.clone(),
            })?
        else {
            return None;
        };
        Some(ScoreNoteV1 {
            id: note_id.clone(),
            written_pitch,
        })
    }
}
