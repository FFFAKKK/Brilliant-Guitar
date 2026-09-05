//! Raw field operations. Command-level effective-reference no-op decisions and
//! semantic preparation precede this journal; replay checks the stored raw form.

use super::*;

#[derive(Default)]
pub(super) struct FieldChanges {
    primary: Option<Arc<Value>>,
    instrument: Option<Arc<Value>>,
    staff_id: Option<Option<Arc<str>>>,
}

impl FieldChanges {
    pub(super) fn apply_to(&self, image: &mut bundle::Image) -> Result<(), Failure> {
        if let Some(value) = &self.primary {
            image.value = Some(value.as_ref().clone());
        }
        if let Some(value) = &self.instrument {
            let Value::PartInstrument(value) = value.as_ref() else {
                return Err(Failure::InternalError);
            };
            image.instrument = Some(value.clone());
        }
        if let Some(value) = &self.staff_id {
            image.staff_id = value.clone();
        }
        Ok(())
    }

    fn scalar(&mut self, value: Arc<Value>) {
        if matches!(value.as_ref(), Value::PartInstrument(_)) {
            self.instrument = Some(value);
        } else {
            self.primary = Some(value);
        }
    }
}

fn read_scalar(
    candidate: &mut Candidate<'_>,
    source: &Occurrence,
    shape: &Value,
) -> Result<Value, Failure> {
    if !candidate.visible(source) {
        return Err(Failure::TargetNotFound);
    }
    let previous = if matches!(shape, Value::PartInstrument(_)) {
        candidate.read_instrument(source).map(Value::PartInstrument)
    } else {
        candidate.read_value(source)
    }
    .ok_or(Failure::InternalError)?;
    if std::mem::discriminant(&previous) != std::mem::discriminant(shape) {
        return Err(Failure::InternalError);
    }
    Ok(previous)
}

fn write_scalar(
    candidate: &mut Candidate<'_>,
    source: &Occurrence,
    value: &Value,
) -> Result<bool, Failure> {
    match value {
        Value::PartInstrument(value) => candidate.replace_instrument(source, value.clone()),
        value => candidate.replace_value(source, value.clone()),
    }
}

fn check_reference(
    candidate: &Candidate<'_>,
    source: &Occurrence,
    value: Option<&str>,
) -> Result<(), Failure> {
    if !candidate.visible(source) {
        return Err(Failure::TargetNotFound);
    }
    match candidate.kind(source) {
        Some(Kind::Voice) if value.is_some() => Ok(()),
        Some(Kind::Event) => Ok(()),
        _ => Err(Failure::InternalError),
    }
}

impl Recorder<'_> {
    pub(super) fn replace_scalar(
        &mut self,
        source: &Occurrence,
        value: Value,
    ) -> Result<bool, Failure> {
        let result = self.replace_scalar_inner(source, value);
        if result.is_err() {
            self.candidate.reservation.abort();
        }
        result
    }

    fn replace_scalar_inner(&mut self, source: &Occurrence, value: Value) -> Result<bool, Failure> {
        self.candidate.reservation.ensure_active()?;
        let previous = read_scalar(&mut self.candidate, source, &value)?;
        if previous == value {
            return Ok(false);
        }
        let target = self.identities.record(&mut self.candidate, source)?;
        self.candidate
            .reservation
            .vec(Site::JournalOperations, &mut self.steps, 1)?;
        if !self.changes.contains_key(source) {
            self.candidate
                .reservation
                .map(Site::JournalOperations, &mut self.changes, 1)?;
        }
        let expected = Arc::new(previous);
        let value = Arc::new(value);
        if !write_scalar(&mut self.candidate, source, &value)? {
            return Err(Failure::InternalError);
        }
        self.changes
            .entry(source.clone())
            .or_default()
            .scalar(value.clone());
        self.steps.push(Step {
            forward: Operation::ReplaceScalar {
                target,
                expected: expected.clone(),
                value: value.clone(),
            },
            inverse: Operation::ReplaceScalar {
                target,
                expected: value,
                value: expected,
            },
        });
        Ok(true)
    }

    pub(super) fn replace_reference(
        &mut self,
        source: &Occurrence,
        value: Option<String>,
    ) -> Result<bool, Failure> {
        let result = self.replace_reference_inner(source, value);
        if result.is_err() {
            self.candidate.reservation.abort();
        }
        result
    }

    fn replace_reference_inner(
        &mut self,
        source: &Occurrence,
        value: Option<String>,
    ) -> Result<bool, Failure> {
        self.candidate.reservation.ensure_active()?;
        check_reference(&self.candidate, source, value.as_deref())?;
        let previous = self
            .candidate
            .read_staff_reference(source)
            .ok_or(Failure::InternalError)?;
        if previous == value {
            return Ok(false);
        }
        let target = self.identities.record(&mut self.candidate, source)?;
        self.candidate
            .reservation
            .vec(Site::JournalOperations, &mut self.steps, 1)?;
        if !self.changes.contains_key(source) {
            self.candidate
                .reservation
                .map(Site::JournalOperations, &mut self.changes, 1)?;
        }
        let expected = previous.map(|id| self.candidate.share_id(id)).transpose()?;
        let value = value.map(|id| self.candidate.share_id(id)).transpose()?;
        self.candidate
            .assign_shared_staff_reference(source, value.clone())?;
        self.changes.entry(source.clone()).or_default().staff_id = Some(value.clone());
        self.steps.push(Step {
            forward: Operation::UpdateReference {
                target,
                expected: expected.clone(),
                value: value.clone(),
            },
            inverse: Operation::UpdateReference {
                target,
                expected: value,
                value: expected,
            },
        });
        Ok(true)
    }
}

pub(super) fn apply_scalar(
    candidate: &mut Candidate<'_>,
    bindings: &ReplayBindings<'_>,
    target: JournalId,
    expected: &Value,
    value: &Value,
) -> Result<(), Failure> {
    candidate.reservation.ensure_active()?;
    let source = bindings.resolve(target, candidate)?;
    if expected == value || read_scalar(candidate, &source, value)? != *expected {
        return Err(Failure::InternalError);
    }
    if !write_scalar(candidate, &source, value)? {
        return Err(Failure::InternalError);
    }
    Ok(())
}

pub(super) fn apply_reference(
    candidate: &mut Candidate<'_>,
    bindings: &ReplayBindings<'_>,
    target: JournalId,
    expected: &Option<Arc<str>>,
    value: &Option<Arc<str>>,
) -> Result<(), Failure> {
    candidate.reservation.ensure_active()?;
    let source = bindings.resolve(target, candidate)?;
    check_reference(candidate, &source, value.as_deref())?;
    if expected == value
        || candidate
            .read_staff_reference(&source)
            .ok_or(Failure::InternalError)?
            .as_deref()
            != expected.as_deref()
    {
        return Err(Failure::InternalError);
    }
    let value = value
        .as_ref()
        .map(|id| candidate.share_existing_id(id.clone()))
        .transpose()?;
    candidate.assign_shared_staff_reference(&source, value)
}
