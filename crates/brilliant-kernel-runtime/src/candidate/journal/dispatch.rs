//! Admission command preparation and public command facts above stored operations.
use super::*;
use brilliant_kernel_contracts::{
    AffectedEntityAddressV1, CoreCommandEnvelopeV1 as Command, CoreCommandIdV1 as CommandId,
    EventStaffAssignmentV1, MeasureAnchorV1, MeasurePickupV1, PartAnchorV1,
    PitchTranspositionErrorV1, ScoreEntityTargetV1 as Target, SequenceAnchorV1, StaffAnchorV1,
    VoiceAnchorV1,
};

#[derive(Debug)]
pub(super) struct LeafFacts {
    pub(super) command_id: CommandId,
    pub(super) changed: bool,
    pub(super) effect_count: u64,
    pub(super) affected: Vec<AffectedEntityAddressV1>,
}

#[derive(Debug, PartialEq)]
pub(super) enum AdmissionCommandFailure {
    Leaf(Failure),
    MeasureDuplicate {
        insertion_index: usize,
        id: JsString,
    },
    RangeTransform {
        note_id: JsString,
        reason: PitchTranspositionErrorV1,
    },
}
impl From<Failure> for AdmissionCommandFailure {
    fn from(value: Failure) -> Self {
        Self::Leaf(value)
    }
}
impl From<range::RangePreparationFailure> for AdmissionCommandFailure {
    fn from(value: range::RangePreparationFailure) -> Self {
        match value {
            range::RangePreparationFailure::Command(value) => Self::Leaf(value),
            range::RangePreparationFailure::Transform { note_id, reason } => {
                Self::RangeTransform { note_id, reason }
            }
        }
    }
}

fn measure_anchor(anchor: MeasureAnchorV1<JsString>) -> Option<JsString> {
    match anchor {
        MeasureAnchorV1::Start => None,
        MeasureAnchorV1::AfterMeasure { measure_id } => Some(measure_id),
    }
}
fn part_anchor(anchor: PartAnchorV1<JsString>) -> Option<JsString> {
    match anchor {
        PartAnchorV1::Start => None,
        PartAnchorV1::AfterPart { part_id } => Some(part_id),
    }
}
fn staff_anchor(anchor: StaffAnchorV1<JsString>) -> Option<JsString> {
    match anchor {
        StaffAnchorV1::Start => None,
        StaffAnchorV1::AfterStaff { staff_id } => Some(staff_id),
    }
}
fn voice_anchor(anchor: VoiceAnchorV1<JsString>) -> Option<JsString> {
    match anchor {
        VoiceAnchorV1::Start => None,
        VoiceAnchorV1::AfterVoice { voice_id } => Some(voice_id),
    }
}

fn clone_content(
    source: &brilliant_score_foundation::PartMeasureContentV1<JsString>,
    reservation: &mut Reservation,
) -> Result<brilliant_score_foundation::PartMeasureContentV1<JsString>, Failure> {
    let mut voices = Vec::new();
    reservation.vec(Site::JournalOperations, &mut voices, source.voices.len())?;
    for voice in &source.voices {
        let mut events = Vec::new();
        reservation.vec(
            Site::JournalOperations,
            &mut events,
            voice.sequence.events.len(),
        )?;
        for event in &voice.sequence.events {
            let content = match &event.content {
                RhythmicContentV1::Rest => RhythmicContentV1::Rest,
                RhythmicContentV1::Notes { notes } => {
                    let mut copied = Vec::new();
                    reservation.vec(Site::JournalOperations, &mut copied, notes.len())?;
                    copied.extend(notes.iter().cloned());
                    RhythmicContentV1::Notes { notes: copied }
                }
            };
            events.push(RhythmicEventV1 {
                id: event.id.clone(),
                duration: event.duration.clone(),
                staff_id: event.staff_id.clone(),
                content,
            });
        }
        voices.push(AdmissionVoiceV1 {
            id: voice.id.clone(),
            default_staff_id: voice.default_staff_id.clone(),
            sequence: brilliant_score_foundation::MusicSequenceV1 {
                start: voice.sequence.start.clone(),
                events,
            },
        });
    }
    Ok(brilliant_score_foundation::PartMeasureContentV1 {
        measure_id: source.measure_id.clone(),
        voices,
    })
}

impl Recorder<'_> {
    pub(super) fn dispatch_leaf(
        &mut self,
        command: Command<JsString>,
    ) -> Result<LeafFacts, AdmissionCommandFailure> {
        let result = self.dispatch_leaf_inner(command);
        if result.is_err() {
            self.candidate.reservation.abort();
        }
        result
    }

    fn scalar_command(
        &mut self,
        kind: Kind,
        raw: &JsString,
        value: Value,
    ) -> Result<bool, Failure> {
        let source = self.candidate.resolve(kind, raw)?;
        if kind == Kind::Staff {
            self.verify_recorded_node(&source)?;
            if self.candidate.read_value(&source).as_ref() == Some(&value) {
                return Ok(false);
            }
            self.check_effect_budget(1)?;
            let part = self
                .candidate
                .owner(&source)
                .ok_or(Failure::InternalError)?;
            self.verify_effect_part(&part)?;
        }
        self.replace_scalar(&source, value)
    }

    fn move_command(
        &mut self,
        kind: Kind,
        raw: &JsString,
        after: Option<&JsString>,
    ) -> Result<bool, Failure> {
        let source = self.candidate.resolve(kind, raw)?;
        let owner = self
            .candidate
            .owner(&source)
            .ok_or(Failure::InternalError)?;
        let children = match kind {
            Kind::Part => Children::Parts,
            Kind::Staff => Children::Staffs,
            Kind::Voice => Children::Voices,
            _ => return Err(Failure::InternalError),
        };
        let order = CandidateOrder::new(&owner, children);
        if after == Some(raw) {
            return Err(Failure::AnchorSelfReference);
        }
        self.candidate
            .insertion_index(&order, after, Some(&source))?;
        self.verify_recorded_node(&source)?;
        self.verify_recorded_node(&owner)?;
        self.verify_recorded_order(&order)?;
        let previous = orders::previous(&mut self.candidate, &order, &source)?;
        if previous
            .as_ref()
            .and_then(|source| self.candidate.raw_id(source))
            == after
        {
            return Ok(false);
        }
        self.check_effect_budget(1)?;
        if kind == Kind::Staff {
            self.verify_effect_part(&owner)?;
        } else if kind == Kind::Voice {
            let part = self.candidate.owner(&owner).ok_or(Failure::InternalError)?;
            self.verify_effect_part(&part)?;
            let measure = self
                .candidate
                .raw_id(&owner)
                .cloned()
                .ok_or(Failure::InternalError)?;
            if measure::unique_content(&mut self.candidate, &part, &measure)? != owner {
                return Err(Failure::InternalError);
            }
        }
        self.move_child(&order, raw, after)
    }

    fn canonical_part(&mut self, mut part: AdmissionPartV1) -> Result<AdmissionPartV1, Failure> {
        let document = self.candidate.document.clone();
        let measures = measure::collect_sources(
            &mut self.candidate,
            &CandidateOrder::new(&document, Children::Measures),
        )?;
        if measures.len() != part.measure_contents.len() {
            return Ok(part);
        }
        let mut positions = HashMap::new();
        self.candidate.reservation.map(
            Site::JournalOperations,
            &mut positions,
            part.measure_contents.len(),
        )?;
        for (index, content) in part.measure_contents.iter().enumerate() {
            if positions
                .insert(content.measure_id.clone(), index)
                .is_some()
            {
                return Ok(part);
            }
        }
        if measures.iter().any(|source| {
            self.candidate
                .raw_id(source)
                .is_none_or(|id| !positions.contains_key(id))
        }) {
            return Ok(part);
        }
        let mut used = HashSet::new();
        self.candidate
            .reservation
            .set(Site::JournalOperations, &mut used, measures.len())?;
        let duplicate_global = measures.iter().any(|source| {
            !used.insert(
                self.candidate
                    .raw_id(source)
                    .expect("validated measure")
                    .clone(),
            )
        });
        if duplicate_global {
            // TS maps each global occurrence independently. An already invalid
            // global order can therefore repeat a content; preserve that raw
            // candidate result for later semantics instead of rejecting early.
            let mut ordered = Vec::new();
            self.candidate.reservation.vec(
                Site::JournalOperations,
                &mut ordered,
                measures.len(),
            )?;
            for source in measures {
                let index = positions[self
                    .candidate
                    .raw_id(&source)
                    .ok_or(Failure::InternalError)?];
                ordered.push(clone_content(
                    &part.measure_contents[index],
                    &mut self.candidate.reservation,
                )?);
            }
            part.measure_contents = ordered;
            return Ok(part);
        }
        let mut slots = Vec::new();
        let mut ordered = Vec::new();
        self.candidate.reservation.vec(
            Site::JournalOperations,
            &mut slots,
            part.measure_contents.len(),
        )?;
        self.candidate.reservation.vec(
            Site::JournalOperations,
            &mut ordered,
            part.measure_contents.len(),
        )?;
        slots.extend(part.measure_contents.into_iter().map(Some));
        for source in measures {
            let raw = self
                .candidate
                .raw_id(&source)
                .ok_or(Failure::InternalError)?;
            let index = positions[raw];
            ordered.push(slots[index].take().ok_or(Failure::InternalError)?);
        }
        part.measure_contents = ordered;
        Ok(part)
    }

    fn effective_staff_command(
        &mut self,
        raw: &JsString,
        assignment: EventStaffAssignmentV1<JsString>,
    ) -> Result<bool, Failure> {
        let source = self.candidate.resolve(Kind::Event, raw)?;
        let voice = self
            .candidate
            .owner(&source)
            .ok_or(Failure::InternalError)?;
        self.verify_recorded_node(&source)?;
        self.verify_recorded_node(&voice)?;
        let default = self
            .candidate
            .read_staff_reference(&voice)
            .flatten()
            .ok_or(Failure::InternalError)?;
        let current = self
            .candidate
            .read_staff_reference(&source)
            .ok_or(Failure::InternalError)?;
        let next = match assignment {
            EventStaffAssignmentV1::InheritDefault => None,
            EventStaffAssignmentV1::Staff { staff_id } => Some(staff_id),
        };
        if current.as_ref().unwrap_or(&default) == next.as_ref().unwrap_or(&default) {
            return Ok(false);
        }
        self.replace_reference(&source, next)
    }

    fn dispatch_leaf_inner(
        &mut self,
        command: Command<JsString>,
    ) -> Result<LeafFacts, AdmissionCommandFailure> {
        self.candidate.reservation.ensure_active()?;
        let command_id = command.command_id();
        if command.target().kind() != command_id.target_kind() {
            return Err(Failure::TargetMismatch.into());
        }
        let first_step = self.steps.len();
        let mut moved_measure = None;
        let changed = match command {
            Command::DocumentSetMetadata {
                target: Target::Document { document_id },
                metadata,
            } => self.scalar_command(
                Kind::Document,
                document_id.as_js_string(),
                Value::DocumentMetadata(metadata),
            )?,
            Command::NoteSetWrittenPitch {
                target: Target::Note { note_id },
                written_pitch,
            } => self.scalar_command(
                Kind::Note,
                note_id.as_js_string(),
                Value::NoteWrittenPitch(written_pitch),
            )?,
            Command::EventSetNoteValue {
                target: Target::Event { event_id },
                note_value,
            } => self.scalar_command(
                Kind::Event,
                event_id.as_js_string(),
                Value::EventNoteValue(note_value),
            )?,
            Command::MeasureSetDefinition {
                target: Target::Measure { measure_id },
                meter,
                pickup,
            } => {
                let pickup_duration = match pickup {
                    MeasurePickupV1::None => None,
                    MeasurePickupV1::Duration { duration } => Some(duration),
                };
                self.scalar_command(
                    Kind::Measure,
                    measure_id.as_js_string(),
                    Value::MeasureDefinition {
                        meter,
                        pickup_duration,
                    },
                )?
            }
            Command::PartSetName {
                target: Target::Part { part_id },
                name,
            } => self.scalar_command(Kind::Part, part_id.as_js_string(), Value::PartName(name))?,
            Command::PartSetInstrument {
                target: Target::Part { part_id },
                instrument,
            } => self.scalar_command(
                Kind::Part,
                part_id.as_js_string(),
                Value::PartInstrument(instrument),
            )?,
            Command::StaffSetDefinition {
                target: Target::Staff { staff_id },
                line_count,
                default_clef,
            } => self.scalar_command(
                Kind::Staff,
                staff_id.as_js_string(),
                Value::StaffDefinition {
                    line_count,
                    default_clef,
                },
            )?,
            Command::VoiceSetSequenceStart {
                target: Target::Voice { voice_id },
                start,
            } => self.scalar_command(
                Kind::Voice,
                voice_id.as_js_string(),
                Value::VoiceSequenceStart(start),
            )?,
            Command::VoiceSetDefaultStaff {
                target: Target::Voice { voice_id },
                staff_id,
            } => {
                let source = self
                    .candidate
                    .resolve(Kind::Voice, voice_id.as_js_string())?;
                self.replace_reference(&source, Some(staff_id))?
            }
            Command::EventSetStaffAssignment {
                target: Target::Event { event_id },
                assignment,
            } => self.effective_staff_command(event_id.as_js_string(), assignment)?,
            Command::PartMove {
                target: Target::Part { part_id },
                anchor,
            } => self.move_command(
                Kind::Part,
                part_id.as_js_string(),
                part_anchor(anchor).as_ref(),
            )?,
            Command::StaffMove {
                target: Target::Staff { staff_id },
                anchor,
            } => self.move_command(
                Kind::Staff,
                staff_id.as_js_string(),
                staff_anchor(anchor).as_ref(),
            )?,
            Command::VoiceMove {
                target: Target::Voice { voice_id },
                anchor,
            } => self.move_command(
                Kind::Voice,
                voice_id.as_js_string(),
                voice_anchor(anchor).as_ref(),
            )?,
            Command::PartInsert {
                target: Target::Document { document_id },
                anchor,
                part,
            } => {
                let document = self
                    .candidate
                    .resolve(Kind::Document, document_id.as_js_string())?;
                let after = part_anchor(anchor);
                self.candidate.insertion_index(
                    &CandidateOrder::new(&document, Children::Parts),
                    after.as_ref(),
                    None,
                )?;
                let part = self.canonical_part(part)?;
                self.insert_part(part, after.as_ref())?;
                true
            }
            Command::PartRemove {
                target: Target::Part { part_id },
            } => {
                self.remove_part_command(part_id.as_js_string())?;
                true
            }
            Command::StaffInsert {
                target: Target::Part { part_id },
                anchor,
                staff,
            } => {
                let part = self.candidate.resolve(Kind::Part, part_id.as_js_string())?;
                self.insert_staff(&part, staff, staff_anchor(anchor).as_ref())?;
                true
            }
            Command::StaffRemove {
                target: Target::Staff { staff_id },
            } => {
                let staff = self
                    .candidate
                    .resolve(Kind::Staff, staff_id.as_js_string())?;
                let part = self.candidate.owner(&staff).ok_or(Failure::InternalError)?;
                if !self
                    .candidate
                    .staff_referrers_in_part(&part, staff_id.as_js_string())?
                    .is_empty()
                {
                    return Err(Failure::ReferenceConflict.into());
                }
                self.check_effect_budget(1)?;
                self.verify_effect_part(&part)?;
                self.remove_staff(staff_id.as_js_string())?;
                true
            }
            Command::VoiceInsert {
                target: Target::Part { part_id },
                measure_id,
                anchor,
                voice,
            } => {
                let part = self.candidate.resolve(Kind::Part, part_id.as_js_string())?;
                self.candidate.resolve(Kind::Measure, &measure_id)?;
                let content = measure::unique_content(&mut self.candidate, &part, &measure_id)?;
                self.insert_voice(&part, &content, voice, voice_anchor(anchor).as_ref())?;
                true
            }
            Command::VoiceRemove {
                target: Target::Voice { voice_id },
            } => {
                self.remove_voice(voice_id.as_js_string())?;
                true
            }
            Command::VoiceInsertNotesEvent {
                target: Target::Voice { voice_id },
                anchor,
                event,
            }
            | Command::VoiceInsertRestEvent {
                target: Target::Voice { voice_id },
                anchor,
                event,
            } => {
                let voice = self
                    .candidate
                    .resolve(Kind::Voice, voice_id.as_js_string())?;
                let valid = matches!(
                    (&event.content, command_id),
                    (
                        RhythmicContentV1::Notes { .. },
                        CommandId::VoiceInsertNotesEvent
                    ) | (RhythmicContentV1::Rest, CommandId::VoiceInsertRestEvent)
                );
                if !valid {
                    return Err(Failure::InvalidEnvelope.into());
                }
                let after = match anchor {
                    SequenceAnchorV1::Start => None,
                    SequenceAnchorV1::AfterEvent { event_id } => {
                        Some(event_id.as_js_string().clone())
                    }
                };
                let mut notes = Vec::new();
                let content = match event.content {
                    RhythmicContentV1::Rest => RhythmicContentV1::Rest,
                    RhythmicContentV1::Notes { notes: source } => {
                        self.candidate.reservation.vec(
                            Site::JournalOperations,
                            &mut notes,
                            source.len(),
                        )?;
                        for note in source {
                            notes.push(brilliant_score_foundation::ScoreNoteV1 {
                                id: note.id.as_js_string().clone(),
                                written_pitch: note.written_pitch,
                            });
                        }
                        RhythmicContentV1::Notes { notes }
                    }
                };
                self.insert_event(
                    &voice,
                    RhythmicEventV1 {
                        id: event.id.as_js_string().clone(),
                        duration: event.duration,
                        staff_id: event.staff_id.map(|id| id.as_js_string().clone()),
                        content,
                    },
                    after.as_ref(),
                )?;
                true
            }
            Command::EventRemove {
                target: Target::Event { event_id },
            } => {
                self.remove_event(event_id.as_js_string())?;
                true
            }
            Command::MeasureInsert {
                target: Target::Document { document_id },
                anchor,
                definition,
                contents,
            } => {
                let id = definition.id.clone();
                self.insert_measure_command(
                    document_id.as_js_string(),
                    definition,
                    contents,
                    measure_anchor(anchor).as_ref(),
                )
                .map_err(|error| match error {
                    measure_commands::MeasurePreparationFailure::Command(failure) => {
                        AdmissionCommandFailure::Leaf(failure)
                    }
                    measure_commands::MeasurePreparationFailure::DuplicateDefinition {
                        insertion_index,
                    } => AdmissionCommandFailure::MeasureDuplicate {
                        insertion_index,
                        id,
                    },
                })?;
                true
            }
            Command::MeasureRemove {
                target: Target::Measure { measure_id },
            } => {
                self.remove_measure_command(measure_id.as_js_string())?;
                true
            }
            Command::MeasureMove {
                target: Target::Measure { measure_id },
                anchor,
            } => {
                let after = measure_anchor(anchor);
                let changed =
                    self.move_measure_command(measure_id.as_js_string(), after.as_ref())?;
                moved_measure = Some((measure_id.as_js_string().clone(), after));
                changed
            }
            Command::RangeDelete {
                target: Target::Document { document_id },
                range,
            } => self.delete_range_command(document_id.as_js_string(), &range)?,
            Command::RangeTransposeWrittenPitch {
                target: Target::Document { document_id },
                range,
                transposition,
            } => {
                self.transpose_range_command(document_id.as_js_string(), &range, &transposition)?
            }
            Command::TransactionBatch { .. } => return Err(Failure::InternalError.into()),
            // Every leaf kind is covered above; only malformed target shapes
            // can reach this arm, and the catalog check precedes preparation.
            _ => return Err(Failure::TargetMismatch.into()),
        };
        if !changed {
            return Ok(LeafFacts {
                command_id,
                changed: false,
                effect_count: 0,
                affected: Vec::new(),
            });
        }
        self.command_facts(command_id, first_step, moved_measure)
            .map_err(Into::into)
    }
}

struct Affected<'a> {
    reservation: &'a mut Reservation,
    values: Vec<AffectedEntityAddressV1>,
    seen: HashSet<(Kind, JsString)>,
    deduplicate: bool,
}
impl Affected<'_> {
    fn add(&mut self, kind: Kind, raw: &JsString) -> Result<(), Failure> {
        if kind == Kind::Content {
            return Ok(());
        }
        if self.deduplicate {
            if self.seen.contains(&(kind, raw.clone())) {
                return Ok(());
            }
            self.reservation
                .set(Site::JournalOperations, &mut self.seen, 1)?;
            self.seen.insert((kind, raw.clone()));
        }
        self.reservation
            .vec(Site::JournalOperations, &mut self.values, 1)?;
        let id = raw.clone().into();
        self.values.push(match kind {
            Kind::Document => Target::Document { document_id: id },
            Kind::Measure => Target::Measure { measure_id: id },
            Kind::Part => Target::Part { part_id: id },
            Kind::Staff => Target::Staff { staff_id: id },
            Kind::Voice => Target::Voice { voice_id: id },
            Kind::Event => Target::Event { event_id: id },
            Kind::Note => Target::Note { note_id: id },
            Kind::Content => unreachable!(),
        });
        Ok(())
    }
    fn source(&mut self, candidate: &Candidate<'_>, source: &Occurrence) -> Result<(), Failure> {
        self.add(
            candidate.kind(source).ok_or(Failure::InternalError)?,
            candidate.raw_id(source).ok_or(Failure::InternalError)?,
        )
    }
    fn image(&mut self, image: &bundle::Image) -> Result<(), Failure> {
        self.add(image.kind, &image.raw_id)
    }
    fn subtree(&mut self, bundle: &PartBundle, root: usize) -> Result<(), Failure> {
        let node = bundle.nodes.get(root).ok_or(Failure::InternalError)?;
        self.image(&node.image)?;
        for (_, children) in node.orders.iter() {
            for child in children.iter() {
                self.subtree(bundle, *child)?;
            }
        }
        Ok(())
    }
}

impl Recorder<'_> {
    fn journal_source(&self, id: JournalId) -> Result<&Occurrence, Failure> {
        self.identities.source_of(id).ok_or(Failure::InternalError)
    }

    fn command_facts(
        &mut self,
        command_id: CommandId,
        first: usize,
        moved: Option<(JsString, Option<JsString>)>,
    ) -> Result<LeafFacts, Failure> {
        // Read the successful immutable operation images. This avoids extra
        // hierarchy scans changing command failure precedence before preparation.
        let mut global = Vec::new();
        let mut parts = Vec::new();
        if matches!(command_id, CommandId::PartInsert | CommandId::PartRemove) {
            let document = self.candidate.document.clone();
            global = measure::collect_sources(
                &mut self.candidate,
                &CandidateOrder::new(&document, Children::Measures),
            )?;
        }
        if command_id == CommandId::MeasureMove {
            let document = self.candidate.document.clone();
            parts = measure::collect_sources(
                &mut self.candidate,
                &CandidateOrder::new(&document, Children::Parts),
            )?;
        }
        let mut reservation = std::mem::take(&mut self.candidate.reservation);
        let mut facts = Affected {
            reservation: &mut reservation,
            values: Vec::new(),
            seen: HashSet::new(),
            deduplicate: !matches!(
                command_id,
                CommandId::VoiceInsertNotesEvent
                    | CommandId::VoiceInsertRestEvent
                    | CommandId::EventRemove
                    | CommandId::RangeTransposeWrittenPitch
            ),
        };
        let result = self.fill_command_facts(
            command_id,
            first,
            moved.as_ref(),
            &global,
            &parts,
            &mut facts,
        );
        let affected = facts.values;
        self.candidate.reservation = reservation;
        let effect_count = result?;
        self.candidate.reservation.ensure_active()?;
        Ok(LeafFacts {
            command_id,
            changed: true,
            effect_count,
            affected,
        })
    }

    fn fill_command_facts(
        &self,
        command_id: CommandId,
        first: usize,
        moved: Option<&(JsString, Option<JsString>)>,
        global: &[Occurrence],
        parts: &[Occurrence],
        facts: &mut Affected<'_>,
    ) -> Result<u64, Failure> {
        let mut effects = 0_u64;
        let mut normalize = false;
        if let Some((raw, _)) = moved {
            facts.add(Kind::Measure, raw)?;
            for part in parts {
                facts.source(&self.candidate, part)?;
            }
        }
        for step in &self.steps[first..] {
            match &step.forward {
                Operation::ReplaceScalar { target, .. }
                | Operation::UpdateReference { target, .. } => {
                    effects += 1;
                    facts.source(&self.candidate, self.journal_source(*target)?)?;
                }
                Operation::MoveOrderedChild { target, order, .. } => {
                    if command_id != CommandId::MeasureMove {
                        facts.source(&self.candidate, self.journal_source(*target)?)?;
                        let mut owner = self.journal_source(order.owner)?.clone();
                        if self.candidate.kind(&owner) == Some(Kind::Content) {
                            owner = self.candidate.owner(&owner).ok_or(Failure::InternalError)?;
                        }
                        facts.source(&self.candidate, &owner)?;
                    }
                }
                Operation::ReplaceOrderedChildren {
                    order,
                    expected,
                    next,
                } => {
                    if let Some((raw, after)) = moved {
                        if order.children == Children::Contents {
                            normalize |= self.local_move_needs_normalization(
                                expected,
                                next,
                                raw,
                                after.as_ref(),
                            )?;
                        }
                    } else {
                        normalize = true;
                    }
                }
                Operation::Measure { bundle, inserting } => {
                    effects += 1;
                    if *inserting {
                        facts.source(&self.candidate, self.journal_source(bundle.document)?)?;
                    }
                    facts.image(&bundle.definition.image.nodes[0].image)?;
                    for part in bundle.parts.iter() {
                        if let Some(content) = bundle
                            .contents
                            .iter()
                            .rev()
                            .find(|content| content.owner == *part)
                        {
                            facts.source(&self.candidate, self.journal_source(*part)?)?;
                            facts.subtree(&content.image, 0)?;
                        }
                    }
                }
                Operation::InsertEntity { owner, bundle, .. } => {
                    effects += 1;
                    self.entity_facts(bundle, *owner, true, global, facts)?;
                }
                Operation::RemoveEntity {
                    owner, expected, ..
                } => {
                    effects += 1;
                    self.entity_facts(expected, *owner, false, global, facts)?;
                }
            }
        }
        Ok(match command_id {
            CommandId::MeasureMove => 1 + u64::from(normalize),
            CommandId::MeasureInsert | CommandId::MeasureRemove => 1 + u64::from(normalize),
            CommandId::PartMove | CommandId::StaffMove | CommandId::VoiceMove => 1,
            _ => effects,
        })
    }

    fn local_move_needs_normalization(
        &self,
        expected: &[JournalId],
        next: &[JournalId],
        raw: &JsString,
        after: Option<&JsString>,
    ) -> Result<bool, Failure> {
        let raw_at = |id: JournalId| {
            self.candidate
                .raw_id(self.journal_source(id)?)
                .ok_or(Failure::InternalError)
        };
        let from = expected
            .iter()
            .position(|id| raw_at(*id).ok() == Some(raw))
            .ok_or(Failure::InternalError)?;
        let anchor = match after {
            None => None,
            Some(raw) => Some(
                expected
                    .iter()
                    .position(|id| raw_at(*id).ok() == Some(raw))
                    .ok_or(Failure::InternalError)?,
            ),
        };
        let to = anchor.map_or(0, |at| if at > from { at } else { at + 1 });
        if expected.len() != next.len() {
            return Ok(true);
        }
        for (index, actual) in next.iter().enumerate() {
            let original = if index == to {
                from
            } else {
                let remaining = if index > to { index - 1 } else { index };
                if remaining >= from {
                    remaining + 1
                } else {
                    remaining
                }
            };
            if raw_at(expected[original])? != raw_at(*actual)? {
                return Ok(true);
            }
        }
        Ok(false)
    }

    fn entity_facts(
        &self,
        stored: &StoredEntityBundle,
        owner: JournalId,
        inserting: bool,
        global: &[Occurrence],
        facts: &mut Affected<'_>,
    ) -> Result<(), Failure> {
        let mut owner = self.journal_source(owner)?.clone();
        if self.candidate.kind(&owner) == Some(Kind::Content) {
            owner = self.candidate.owner(&owner).ok_or(Failure::InternalError)?;
        }
        let bundle = match stored {
            StoredEntityBundle::Staff(staff) => {
                if inserting {
                    facts.source(&self.candidate, &owner)?;
                    facts.image(&staff.image)?;
                } else {
                    facts.image(&staff.image)?;
                    facts.source(&self.candidate, &owner)?;
                }
                return Ok(());
            }
            StoredEntityBundle::Part(bundle)
            | StoredEntityBundle::Voice(bundle)
            | StoredEntityBundle::Event(bundle) => bundle,
        };
        if inserting {
            facts.source(&self.candidate, &owner)?;
            facts.image(&bundle.nodes[0].image)?;
        } else {
            facts.image(&bundle.nodes[0].image)?;
            facts.source(&self.candidate, &owner)?;
        }
        for (children, indices) in bundle.nodes[0].orders.iter() {
            if *children == Children::Contents {
                let exact = indices.len() == global.len()
                    && global.iter().all(|measure| {
                        indices
                            .iter()
                            .filter(|index| {
                                Some(&bundle.nodes[**index].image.raw_id)
                                    == self.candidate.raw_id(measure)
                            })
                            .count()
                            == 1
                    });
                if exact {
                    for measure in global {
                        let index = indices
                            .iter()
                            .find(|index| {
                                Some(&bundle.nodes[**index].image.raw_id)
                                    == self.candidate.raw_id(measure)
                            })
                            .ok_or(Failure::InternalError)?;
                        facts.subtree(bundle, *index)?;
                    }
                } else {
                    for index in indices.iter() {
                        facts.subtree(bundle, *index)?;
                    }
                }
            } else {
                for index in indices.iter() {
                    facts.subtree(bundle, *index)?;
                }
            }
        }
        Ok(())
    }
}
