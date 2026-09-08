//! Storage primitives; composite command preparation owns coverage and history.
use super::*;

impl Candidate<'_> {
    pub(super) fn insert_measure(
        &mut self,
        definition: AdmissionMeasureDefinitionV1,
        after: Option<&JsString>,
    ) -> Result<Occurrence, Failure> {
        self.reservation.ensure_active()?;
        let order = CandidateOrder::new(&self.document, Children::Measures);
        let position = self.insertion_index(&order, after, None)?;
        self.reserve_insertion(&order)?;
        let source = self.add_node(
            &self.document.clone(),
            Kind::Measure,
            definition.id,
            Some(Value::MeasureDefinition {
                meter: definition.meter,
                pickup_duration: definition.pickup_duration,
            }),
        )?;
        self.place_child(&order, position, source)
    }

    pub(super) fn insert_content(
        &mut self,
        part: &Occurrence,
        measure_id: JsString,
        voices: Vec<AdmissionVoiceV1>,
        position: usize,
    ) -> Result<Occurrence, Failure> {
        self.reservation.ensure_active()?;
        if self.kind(part) != Some(Kind::Part) || !self.visible(part) {
            return Err(Failure::InternalError);
        }
        let order = CandidateOrder::new(part, Children::Contents);
        let mut count = 0;
        self.visit_order(&order, &mut |_, _| {
            count += 1;
            true
        })
        .ok_or(Failure::InternalError)?;
        if position > count {
            return Err(Failure::InternalError);
        }
        self.reserve_insertion(&order)?;
        let source = self.add_content(part, measure_id, voices)?;
        self.place_child(&order, position, source)
    }

    pub(super) fn add_content(
        &mut self,
        part: &Occurrence,
        measure_id: JsString,
        voices: Vec<AdmissionVoiceV1>,
    ) -> Result<Occurrence, Failure> {
        self.reservation.ensure_active()?;
        if self.kind(part) != Some(Kind::Part) || !self.visible(part) {
            return Err(Failure::InternalError);
        }
        let source = self.add_node(part, Kind::Content, measure_id, None)?;
        let mut children = Vec::new();
        self.reservation
            .vec(Site::OrderEntries, &mut children, voices.len())?;
        for voice in voices {
            children.push(self.add_voice(&source, voice)?);
        }
        self.set_new_order(&source, Children::Voices, children)?;
        Ok(source)
    }
}
