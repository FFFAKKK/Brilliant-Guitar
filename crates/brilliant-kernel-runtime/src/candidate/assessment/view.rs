use super::*;

#[derive(Clone)]
pub(super) enum ReadValue {
    Entity(Occurrence),
    Order(CandidateOrder),
    Sequence(Occurrence),
    EventContent(Occurrence, EventContentKind),
    Scalar(Arc<Value>),
    Instrument(score::InstrumentDescriptorV1),
    Transposition(score::TranspositionV1),
    Meter(score::MeterV1),
    Fraction(score::FractionV1),
    NoteValue(score::NoteValueV1),
    Modification(score::TimeModificationV1),
    Pitch(score::WrittenPitchV1),
    Tempo(f64),
    String(JsString),
    Number(f64),
    Extensions,
    Extension(usize),
    ExtensionOwner(score::ExtensionOwnerV1),
    // Strong/prefix extension payloads are typed object maps. Assessment checks
    // their container kind only; neither payload bytes nor keys are copied.
    ObjectPayload,
    Missing,
    Failed(AssessmentFailure),
}

#[derive(Clone)]
pub(super) struct Cursor<'view, 'candidate, 'store> {
    pub(super) source: &'view Source<'candidate, 'store>,
    pub(super) value: ReadValue,
    pub(super) path: Vec<StablePathSegmentV1>,
}

impl Cursor<'_, '_, '_> {
    fn failure(&self) -> AssessmentFailure {
        AssessmentFailure::InvalidCandidateShape { path: self.path() }
    }

    fn check(&self) -> Outcome<()> {
        match &self.value {
            ReadValue::Failed(failure) => Err(failure.clone()),
            _ => Ok(()),
        }
    }

    fn scalar(&self, source: &Occurrence) -> Outcome<Value> {
        self.source
            .candidate
            .borrow_mut()
            .read_value(source)
            .ok_or_else(|| self.failure())
    }

    fn reference(&self, source: &Occurrence) -> Outcome<Option<JsString>> {
        self.source
            .candidate
            .borrow()
            .read_staff_reference(source)
            .ok_or_else(|| self.failure())
    }

    fn field_value(&self, name: &'static str) -> Outcome<Option<ReadValue>> {
        self.check()?;
        use ReadValue as R;
        let number = |value: brilliant_core_types::SafeInteger| R::Number(value.get() as f64);
        Ok(Some(match (&self.value, name) {
            (R::Entity(source), "id" | "measureId") => R::String(
                self.source
                    .candidate
                    .borrow()
                    .raw_id(source)
                    .ok_or_else(|| self.failure())?
                    .clone(),
            ),
            (
                R::Entity(source),
                "measureDefinitions" | "parts" | "staves" | "measureContents" | "voices",
            ) => {
                let children = match name {
                    "measureDefinitions" => Children::Measures,
                    "parts" => Children::Parts,
                    "staves" => Children::Staffs,
                    "measureContents" => Children::Contents,
                    _ => Children::Voices,
                };
                if self.source.candidate.borrow().kind(source) != Some(children.owner_kind()) {
                    return Err(self.failure());
                }
                R::Order(CandidateOrder::new(source, children))
            }
            (R::Entity(source), "metadata") => R::Scalar(Arc::new(self.scalar(source)?)),
            (R::Entity(source), "instrument") => R::Instrument(
                self.source
                    .candidate
                    .borrow_mut()
                    .read_instrument(source)
                    .ok_or_else(|| self.failure())?,
            ),
            (R::Entity(source), "meter") => {
                let Value::MeasureDefinition { meter, .. } = self.scalar(source)? else {
                    return Err(self.failure());
                };
                R::Meter(meter)
            }
            (R::Entity(source), "pickupDuration") => {
                let Value::MeasureDefinition {
                    pickup_duration, ..
                } = self.scalar(source)?
                else {
                    return Err(self.failure());
                };
                return Ok(pickup_duration.map(R::Fraction));
            }
            (R::Entity(source), "lineCount") => {
                let Value::StaffDefinition { line_count, .. } = self.scalar(source)? else {
                    return Err(self.failure());
                };
                number(line_count)
            }
            (R::Entity(source), "defaultStaffId") => {
                R::String(self.reference(source)?.ok_or_else(|| self.failure())?)
            }
            (R::Entity(source), "staffId") => return Ok(self.reference(source)?.map(R::String)),
            (R::Entity(source), "sequence") => {
                if self.source.candidate.borrow().kind(source) != Some(Kind::Voice) {
                    return Err(self.failure());
                }
                R::Sequence(source.clone())
            }
            (R::Sequence(source), "start") => {
                let Value::VoiceSequenceStart(start) = self.scalar(source)? else {
                    return Err(self.failure());
                };
                R::Fraction(start)
            }
            (R::Sequence(source), "events") => {
                R::Order(CandidateOrder::new(source, Children::Events))
            }
            (R::Entity(source), "duration") => {
                let Value::EventNoteValue(duration) = self.scalar(source)? else {
                    return Err(self.failure());
                };
                R::NoteValue(duration)
            }
            (R::Entity(source), "content") => R::EventContent(
                source.clone(),
                self.source
                    .candidate
                    .borrow_mut()
                    .read_content_kind(source)
                    .ok_or_else(|| self.failure())?,
            ),
            (R::EventContent(_, kind), "kind") => R::String(
                match kind {
                    EventContentKind::Notes => "notes",
                    EventContentKind::Rest => "rest",
                }
                .into(),
            ),
            (R::EventContent(source, EventContentKind::Notes), "notes") => {
                R::Order(CandidateOrder::new(source, Children::Notes))
            }
            (R::Entity(source), "writtenPitch") => {
                let Value::NoteWrittenPitch(pitch) = self.scalar(source)? else {
                    return Err(self.failure());
                };
                R::Pitch(pitch)
            }
            (R::Entity(source), "extensions") => {
                if self.source.candidate.borrow().kind(source) != Some(Kind::Document) {
                    return Err(self.failure());
                }
                R::Extensions
            }
            (R::Scalar(value), "tempo") => {
                let Value::DocumentMetadata(metadata) = value.as_ref() else {
                    return Err(self.failure());
                };
                R::Tempo(metadata.tempo.bpm.get())
            }
            (R::Tempo(bpm), "bpm") => R::Number(*bpm),
            (R::Instrument(instrument), "writtenToSounding") => {
                R::Transposition(instrument.written_to_sounding.clone())
            }
            (R::Transposition(value), "diatonicSteps") => number(value.diatonic_steps),
            (R::Transposition(value), "chromaticSemitones") => number(value.chromatic_semitones),
            (R::Meter(value), "numerator") => number(value.numerator),
            (R::Meter(value), "denominator") => number(value.denominator),
            (R::Fraction(value), "numerator") => number(value.numerator),
            (R::Fraction(value), "denominator") => number(value.denominator),
            (R::NoteValue(value), "base") => number(value.base),
            (R::NoteValue(value), "dots") => number(value.dots),
            (R::NoteValue(value), "timeModification") => {
                return Ok(value.time_modification.clone().map(R::Modification));
            }
            (R::Modification(value), "actualNotes") => number(value.actual_notes),
            (R::Modification(value), "normalNotes") => number(value.normal_notes),
            (R::Pitch(value), "step") => R::String(
                match value.step {
                    score::PitchStepV1::C => "C",
                    score::PitchStepV1::D => "D",
                    score::PitchStepV1::E => "E",
                    score::PitchStepV1::F => "F",
                    score::PitchStepV1::G => "G",
                    score::PitchStepV1::A => "A",
                    score::PitchStepV1::B => "B",
                }
                .into(),
            ),
            (R::Pitch(value), "alter") => number(value.alter),
            (R::Pitch(value), "octave") => number(value.octave),
            (R::Extension(index), name) => {
                let header = self
                    .source
                    .extensions
                    .get(*index)
                    .ok_or_else(|| self.failure())?;
                match name {
                    "namespace" => R::String(header.namespace.clone()),
                    "schemaVersion" => number(header.schema_version),
                    "owner" => R::ExtensionOwner(header.owner.clone()),
                    "payload" => R::ObjectPayload,
                    _ => return Ok(None),
                }
            }
            (R::ExtensionOwner(owner), "kind") => R::String(
                match owner {
                    score::ExtensionOwnerV1::Score => "score",
                    score::ExtensionOwnerV1::Part { .. } => "part",
                }
                .into(),
            ),
            (R::ExtensionOwner(score::ExtensionOwnerV1::Part { part_id }), "partId") => {
                R::String(part_id.as_js_string().clone())
            }
            _ => return Ok(None),
        }))
    }

    fn children(&self) -> Outcome<Vec<ReadValue>> {
        self.check()?;
        let mut values = Vec::new();
        let mut candidate = self.source.candidate.borrow_mut();
        let mut reservation = std::mem::take(&mut candidate.reservation);
        let result = match &self.value {
            ReadValue::Order(order) => candidate.visit_order(order, &mut |child, _| {
                if reservation
                    .vec(Site::JournalOperations, &mut values, 1)
                    .is_err()
                {
                    return false;
                }
                values.push(ReadValue::Entity(child.clone()));
                true
            }),
            ReadValue::Extensions => {
                if reservation
                    .vec(
                        Site::JournalOperations,
                        &mut values,
                        self.source.extensions.len(),
                    )
                    .is_ok()
                {
                    values.extend((0..self.source.extensions.len()).map(ReadValue::Extension));
                }
                Some(())
            }
            _ => None,
        };
        candidate.reservation = reservation;
        candidate
            .reservation
            .ensure_active()
            .map_err(|_| AssessmentFailure::InternalCapacity)?;
        result.ok_or_else(|| self.failure())?;
        Ok(values)
    }
}

pub(super) struct Items<'view, 'candidate, 'store> {
    cursor: Cursor<'view, 'candidate, 'store>,
    values: std::iter::Enumerate<std::vec::IntoIter<ReadValue>>,
}

impl<'view, 'candidate, 'store> Iterator for Items<'view, 'candidate, 'store> {
    type Item = Outcome<Cursor<'view, 'candidate, 'store>>;
    fn next(&mut self) -> Option<Self::Item> {
        let (index, value) = self.values.next()?;
        let mut path = self.cursor.path.clone();
        path.push(StablePathSegmentV1::Index(index as u64));
        Some(Ok(Cursor {
            source: self.cursor.source,
            value,
            path,
        }))
    }
}

impl<'view, 'candidate, 'store> AssessmentNodeV1 for Cursor<'view, 'candidate, 'store> {
    type Items = Items<'view, 'candidate, 'store>;
    fn field(&self, name: &'static str) -> Self {
        let mut path = self.path.clone();
        path.push(StablePathSegmentV1::Field(name.to_owned()));
        let value = match self.field_value(name) {
            Ok(Some(value)) => value,
            Ok(None) => ReadValue::Missing,
            Err(error) => ReadValue::Failed(error),
        };
        Self {
            source: self.source,
            value,
            path,
        }
    }
    fn optional(&self, name: &'static str) -> Outcome<Option<Self>> {
        let Some(value) = self.field_value(name)? else {
            return Ok(None);
        };
        let mut path = self.path.clone();
        path.push(StablePathSegmentV1::Field(name.to_owned()));
        Ok(Some(Self {
            source: self.source,
            value,
            path,
        }))
    }
    fn items(self) -> Outcome<Self::Items> {
        let values = self.children()?.into_iter().enumerate();
        Ok(Items {
            cursor: self,
            values,
        })
    }
    fn len(&self) -> Outcome<usize> {
        self.check()?;
        match &self.value {
            ReadValue::Extensions => Ok(self.source.extensions.len()),
            ReadValue::Order(order) => {
                let mut count = 0;
                self.source
                    .candidate
                    .borrow_mut()
                    .visit_order(order, &mut |_, _| {
                        count += 1;
                        true
                    })
                    .ok_or_else(|| self.failure())?;
                Ok(count)
            }
            _ => Err(self.failure()),
        }
    }
    fn string(&self) -> Outcome<JsString> {
        self.check()?;
        match &self.value {
            ReadValue::String(value) => Ok(value.clone()),
            _ => Err(self.failure()),
        }
    }
    fn number(&self) -> Outcome<f64> {
        self.check()?;
        match &self.value {
            ReadValue::Number(value) => Ok(*value),
            _ => Err(self.failure()),
        }
    }
    fn exact_fields(&self, fields: &[&str]) -> Outcome<bool> {
        self.check()?;
        let expected: &[&str] = match self.value {
            ReadValue::Transposition(_) => &["diatonicSteps", "chromaticSemitones"],
            ReadValue::Pitch(_) => &["step", "alter", "octave"],
            _ => return Err(self.failure()),
        };
        Ok(fields.len() == expected.len() && expected.iter().all(|key| fields.contains(key)))
    }
    fn is_array(&self) -> Outcome<bool> {
        self.check()?;
        Ok(matches!(
            self.value,
            ReadValue::Order(_) | ReadValue::Extensions
        ))
    }
    fn path(&self) -> StablePathV1 {
        StablePathV1::new(self.path.clone()).expect("fixed score fields and bounded hierarchy")
    }
}
