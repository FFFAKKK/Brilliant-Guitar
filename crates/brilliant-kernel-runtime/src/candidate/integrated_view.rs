//! Detached SDK data views of the actual occurrence graph. Unlike a sealed
//! final view, a mid-Batch view may contain duplicate or empty raw identities.
//! Constructing this view grants no semantic proof and no Store adoption.
use super::*;
use brilliant_score_foundation as score;

impl Candidate<'_> {
    pub(super) fn integrated_document<Id>(
        &mut self,
        id: &impl Fn(&JsString) -> Result<Id, Failure>,
    ) -> Result<score::ScoreDocumentV1<Id>, Failure> {
        self.reservation.ensure_active()?;
        let result = self.integrated_document_inner(id);
        if result.is_err() {
            self.reservation.abort();
        }
        result
    }

    fn integrated_document_inner<Id>(
        &mut self,
        id: &impl Fn(&JsString) -> Result<Id, Failure>,
    ) -> Result<score::ScoreDocumentV1<Id>, Failure> {
        let root = self.document.clone();
        let Some(Value::DocumentMetadata(metadata)) = self.read_value(&root) else {
            return Err(Failure::InternalError);
        };
        let measure_definitions =
            self.integrated_children(&root, Children::Measures, |candidate, source| {
                let Some(Value::MeasureDefinition {
                    meter,
                    pickup_duration,
                }) = candidate.read_value(source)
                else {
                    return Err(Failure::InternalError);
                };
                Ok(score::MeasureDefinitionV1 {
                    id: candidate.integrated_id(source, id)?,
                    meter,
                    pickup_duration,
                })
            })?;
        let parts = self.integrated_children(&root, Children::Parts, |candidate, source| {
            candidate.integrated_part(source, id)
        })?;
        let mut extensions = Vec::new();
        let mut failed = false;
        let mut reservation = std::mem::take(&mut self.reservation);
        let visited = self.visit_extension_headers(&mut |header| {
            let key = crate::overlay::ExtensionKeyV1 {
                namespace: header.namespace.clone(),
                owner: (&header.owner).into(),
            };
            let Some(block) = self.read_extension(&key) else {
                failed = true;
                return false;
            };
            let owner = match &block.value.owner {
                score::ExtensionOwnerV1::Score => score::ExtensionOwnerV1::Score,
                score::ExtensionOwnerV1::Part { part_id } => match id(part_id.as_js_string()) {
                    Ok(part_id) => score::ExtensionOwnerV1::Part { part_id },
                    Err(_) => {
                        failed = true;
                        return false;
                    }
                },
            };
            if reservation
                .vec(Site::OrderEntries, &mut extensions, 1)
                .is_err()
            {
                failed = true;
                return false;
            }
            extensions.push(score::ExtensionBlockV1 {
                namespace: block.value.namespace,
                schema_version: block.value.schema_version,
                owner,
                payload: block.value.payload,
            });
            true
        });
        self.reservation = reservation;
        self.reservation.ensure_active()?;
        visited.map_err(|_| Failure::InternalError)?;
        if failed {
            return Err(Failure::InternalError);
        }
        Ok(score::ScoreDocumentV1 {
            schema_version: "brilliant-score-1".into(),
            id: self.integrated_id(&root, id)?,
            metadata,
            measure_definitions,
            parts,
            extensions,
        })
    }

    fn integrated_id<Id>(
        &self,
        source: &Occurrence,
        id: &impl Fn(&JsString) -> Result<Id, Failure>,
    ) -> Result<Id, Failure> {
        id(self.raw_id(source).ok_or(Failure::InternalError)?)
    }

    fn integrated_children<T>(
        &mut self,
        source: &Occurrence,
        children: Children,
        mut read: impl FnMut(&mut Self, &Occurrence) -> Result<T, Failure>,
    ) -> Result<Vec<T>, Failure> {
        // Keep occurrence locators rather than resolving the raw IDs again:
        // two children with the same raw ID must remain two distinct children.
        let mut sources = Vec::new();
        let mut reservation = std::mem::take(&mut self.reservation);
        let visited = self.visit_order(&CandidateOrder::new(source, children), &mut |child, _| {
            if reservation
                .vec(Site::OrderEntries, &mut sources, 1)
                .is_err()
            {
                return false;
            }
            sources.push(child.clone());
            true
        });
        self.reservation = reservation;
        self.reservation.ensure_active()?;
        visited.ok_or(Failure::InternalError)?;
        let mut result = Vec::new();
        self.reservation
            .vec(Site::OrderEntries, &mut result, sources.len())?;
        for source in sources {
            result.push(read(self, &source)?);
        }
        Ok(result)
    }

    fn integrated_part<Id>(
        &mut self,
        source: &Occurrence,
        id: &impl Fn(&JsString) -> Result<Id, Failure>,
    ) -> Result<score::PartV1<Id>, Failure> {
        let Some(Value::PartName(name)) = self.read_value(source) else {
            return Err(Failure::InternalError);
        };
        let instrument = self.read_instrument(source).ok_or(Failure::InternalError)?;
        let staves = self.integrated_children(source, Children::Staffs, |candidate, source| {
            let Some(Value::StaffDefinition {
                line_count,
                default_clef,
            }) = candidate.read_value(source)
            else {
                return Err(Failure::InternalError);
            };
            Ok(score::StaffDefinitionV1 {
                id: candidate.integrated_id(source, id)?,
                line_count,
                default_clef,
            })
        })?;
        let measure_contents =
            self.integrated_children(source, Children::Contents, |candidate, content| {
                let voices = candidate.integrated_children(
                    content,
                    Children::Voices,
                    |candidate, voice| candidate.integrated_voice(voice, id),
                )?;
                Ok(score::PartMeasureContentV1 {
                    measure_id: candidate.integrated_id(content, id)?,
                    voices,
                })
            })?;
        Ok(score::PartV1 {
            id: self.integrated_id(source, id)?,
            name,
            instrument,
            staves,
            measure_contents,
        })
    }

    fn integrated_voice<Id>(
        &mut self,
        source: &Occurrence,
        id: &impl Fn(&JsString) -> Result<Id, Failure>,
    ) -> Result<score::VoiceV1<Id>, Failure> {
        let Some(Value::VoiceSequenceStart(start)) = self.read_value(source) else {
            return Err(Failure::InternalError);
        };
        let default_staff_id = self
            .read_staff_reference(source)
            .flatten()
            .ok_or(Failure::InternalError)?;
        let events = self.integrated_children(source, Children::Events, |candidate, event| {
            candidate.integrated_event(event, id)
        })?;
        Ok(score::VoiceV1 {
            id: self.integrated_id(source, id)?,
            default_staff_id: id(&default_staff_id)?,
            sequence: score::MusicSequenceV1 { start, events },
        })
    }

    fn integrated_event<Id>(
        &mut self,
        source: &Occurrence,
        id: &impl Fn(&JsString) -> Result<Id, Failure>,
    ) -> Result<score::RhythmicEventV1<Id>, Failure> {
        let Some(Value::EventNoteValue(duration)) = self.read_value(source) else {
            return Err(Failure::InternalError);
        };
        let staff_id = self
            .read_staff_reference(source)
            .ok_or(Failure::InternalError)?
            .map(|value| id(&value))
            .transpose()?;
        let notes = self.integrated_children(source, Children::Notes, |candidate, note| {
            let Some(Value::NoteWrittenPitch(written_pitch)) = candidate.read_value(note) else {
                return Err(Failure::InternalError);
            };
            Ok(score::ScoreNoteV1 {
                id: candidate.integrated_id(note, id)?,
                written_pitch,
            })
        })?;
        let content = match self
            .read_content_kind(source)
            .ok_or(Failure::InternalError)?
        {
            EventContentKind::Notes => score::RhythmicContentV1::Notes { notes },
            EventContentKind::Rest if notes.is_empty() => score::RhythmicContentV1::Rest,
            EventContentKind::Rest => return Err(Failure::InternalError),
        };
        Ok(score::RhythmicEventV1 {
            id: self.integrated_id(source, id)?,
            duration,
            staff_id,
            content,
        })
    }
}

#[cfg(test)]
mod tests;
