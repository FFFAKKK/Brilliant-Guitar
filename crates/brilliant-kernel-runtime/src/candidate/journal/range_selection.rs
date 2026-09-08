//! Range endpoints resolve in the live occurrence graph; payloads stay borrowed.
use super::*;
use brilliant_kernel_contracts::ScoreRangeV1;

#[derive(Debug)]
pub(super) struct RangeSelection {
    pub(super) measures: Option<Vec<Occurrence>>,
    pub(super) events: Vec<Occurrence>,
}

enum Endpoint<T> {
    Found(T),
    Missing,
    Duplicate,
    OwnerMismatch,
}

fn endpoints<T>(start: Endpoint<T>, end: Endpoint<T>) -> Result<(T, T), Failure> {
    if matches!(start, Endpoint::Duplicate) || matches!(end, Endpoint::Duplicate) {
        return Err(Failure::InvalidRange);
    }
    if matches!(start, Endpoint::Missing) || matches!(end, Endpoint::Missing) {
        return Err(Failure::RangeEndpointNotFound);
    }
    if matches!(start, Endpoint::OwnerMismatch) || matches!(end, Endpoint::OwnerMismatch) {
        return Err(Failure::RangeOwnerMismatch);
    }
    match (start, end) {
        (Endpoint::Found(start), Endpoint::Found(end)) => Ok((start, end)),
        _ => Err(Failure::InvalidRange),
    }
}

fn lookup(candidate: &Candidate<'_>, values: &[Occurrence], id: &JsString) -> Endpoint<usize> {
    let mut found = None;
    for (index, source) in values.iter().enumerate() {
        if candidate.raw_id(source) == Some(id) && found.replace(index).is_some() {
            return Endpoint::Duplicate;
        }
    }
    found.map_or(Endpoint::Missing, Endpoint::Found)
}

impl Recorder<'_> {
    pub(super) fn resolve_range_selection(
        &mut self,
        document_id: &JsString,
        range: &ScoreRangeV1,
    ) -> Result<RangeSelection, Failure> {
        let result = self.resolve_range_selection_inner(document_id, range);
        if result.is_err() {
            self.candidate.reservation.abort();
        }
        result
    }

    fn range_children(
        &mut self,
        owner: &Occurrence,
        children: Children,
    ) -> Result<Vec<Occurrence>, Failure> {
        let order = CandidateOrder::new(owner, children);
        self.verify_recorded_order(&order)?;
        super::measure::collect_sources(&mut self.candidate, &order)
    }

    fn range_push(
        &mut self,
        values: &mut Vec<Occurrence>,
        value: Occurrence,
    ) -> Result<(), Failure> {
        self.candidate
            .reservation
            .vec(Site::JournalOperations, values, 1)?;
        values.push(value);
        Ok(())
    }

    fn verify_range_event(&mut self, event: &Occurrence) -> Result<(), Failure> {
        self.verify_recorded_node(event)?;
        for note in self.range_children(event, Children::Notes)? {
            self.verify_recorded_node(&note)?;
        }
        Ok(())
    }

    fn append_range_content(
        &mut self,
        content: &Occurrence,
        events: &mut Vec<Occurrence>,
    ) -> Result<(), Failure> {
        self.verify_recorded_node(content)?;
        let part = self
            .candidate
            .owner(content)
            .ok_or(Failure::InternalError)?;
        self.verify_recorded_node(&part)?;
        for voice in self.range_children(content, Children::Voices)? {
            self.verify_recorded_node(&voice)?;
            for event in self.range_children(&voice, Children::Events)? {
                self.verify_range_event(&event)?;
                self.range_push(events, event)?;
            }
        }
        Ok(())
    }

    fn part_endpoint(
        &mut self,
        parts: &[Occurrence],
        measures: &[Occurrence],
        part_id: &JsString,
        measure_id: &JsString,
    ) -> Result<Endpoint<(Occurrence, usize)>, Failure> {
        let part = lookup(&self.candidate, parts, part_id);
        let measure = lookup(&self.candidate, measures, measure_id);
        if matches!(part, Endpoint::Duplicate) || matches!(measure, Endpoint::Duplicate) {
            return Ok(Endpoint::Duplicate);
        }
        let (Endpoint::Found(part), Endpoint::Found(measure)) = (part, measure) else {
            return Ok(Endpoint::Missing);
        };
        let contents = self.range_children(&parts[part], Children::Contents)?;
        Ok(match lookup(&self.candidate, &contents, measure_id) {
            Endpoint::Found(_) => Endpoint::Found((parts[part].clone(), measure)),
            Endpoint::Duplicate => Endpoint::Duplicate,
            _ => Endpoint::Missing,
        })
    }

    fn voice_endpoint(
        &mut self,
        parts: &[Occurrence],
        voice_id: &JsString,
        event_id: &JsString,
    ) -> Result<Endpoint<(Occurrence, Occurrence, usize)>, Failure> {
        let mut voice_found = None;
        let mut event_found = None;
        let mut duplicate = false;
        // Count actual routes, including repeated raw owner/content IDs. A
        // strong-index lookup would erase ambiguity in an admission candidate.
        for part in parts {
            for content in self.range_children(part, Children::Contents)? {
                for voice in self.range_children(&content, Children::Voices)? {
                    if self.candidate.raw_id(&voice) == Some(voice_id)
                        && voice_found.replace(voice.clone()).is_some()
                    {
                        duplicate = true;
                    }
                    for (index, event) in self
                        .range_children(&voice, Children::Events)?
                        .into_iter()
                        .enumerate()
                    {
                        if self.candidate.raw_id(&event) == Some(event_id)
                            && event_found.replace((voice.clone(), event, index)).is_some()
                        {
                            duplicate = true;
                        }
                    }
                }
            }
        }
        if duplicate {
            return Ok(Endpoint::Duplicate);
        }
        let (Some(voice), Some((owner, event, index))) = (voice_found, event_found) else {
            return Ok(Endpoint::Missing);
        };
        Ok(if voice == owner {
            Endpoint::Found((voice, event, index))
        } else {
            Endpoint::OwnerMismatch
        })
    }

    fn resolve_range_selection_inner(
        &mut self,
        document_id: &JsString,
        range: &ScoreRangeV1,
    ) -> Result<RangeSelection, Failure> {
        self.candidate.reservation.ensure_active()?;
        let document = self.candidate.resolve(Kind::Document, document_id)?;
        self.verify_recorded_node(&document)?;
        let parts = self.range_children(&document, Children::Parts)?;
        let mut result = RangeSelection {
            measures: None,
            events: Vec::new(),
        };
        match range {
            ScoreRangeV1::MeasureRange { start, end } => {
                let measures = self.range_children(&document, Children::Measures)?;
                let (start, end) = endpoints(
                    lookup(&self.candidate, &measures, start.measure_id.as_js_string()),
                    lookup(&self.candidate, &measures, end.measure_id.as_js_string()),
                )?;
                let mut selected = Vec::new();
                for measure in &measures[start.min(end)..=start.max(end)] {
                    self.verify_recorded_node(measure)?;
                    let id = self
                        .candidate
                        .raw_id(measure)
                        .cloned()
                        .ok_or(Failure::InternalError)?;
                    for part in &parts {
                        let contents = self.range_children(part, Children::Contents)?;
                        let Endpoint::Found(index) = lookup(&self.candidate, &contents, &id) else {
                            return Err(Failure::InvalidRange);
                        };
                        self.append_range_content(&contents[index], &mut result.events)?;
                    }
                    self.range_push(&mut selected, measure.clone())?;
                }
                result.measures = Some(selected);
            }
            ScoreRangeV1::PartMeasureRange { start, end } => {
                let measures = self.range_children(&document, Children::Measures)?;
                let first = self.part_endpoint(
                    &parts,
                    &measures,
                    start.part_id.as_js_string(),
                    start.measure_id.as_js_string(),
                )?;
                let last = self.part_endpoint(
                    &parts,
                    &measures,
                    end.part_id.as_js_string(),
                    end.measure_id.as_js_string(),
                )?;
                let ((part, start), (end_part, end)) = endpoints(first, last)?;
                if part != end_part {
                    return Err(Failure::RangeOwnerMismatch);
                }
                let contents = self.range_children(&part, Children::Contents)?;
                for measure in &measures[start.min(end)..=start.max(end)] {
                    self.verify_recorded_node(measure)?;
                    let id = self
                        .candidate
                        .raw_id(measure)
                        .ok_or(Failure::InternalError)?;
                    let Endpoint::Found(index) = lookup(&self.candidate, &contents, id) else {
                        return Err(Failure::RangeEndpointNotFound);
                    };
                    self.append_range_content(&contents[index], &mut result.events)?;
                }
            }
            ScoreRangeV1::VoiceEventRange { start, end } => {
                let first = self.voice_endpoint(
                    &parts,
                    start.voice_id.as_js_string(),
                    start.event_id.as_js_string(),
                )?;
                let last = self.voice_endpoint(
                    &parts,
                    end.voice_id.as_js_string(),
                    end.event_id.as_js_string(),
                )?;
                let ((voice, _, start), (end_voice, _, end)) = endpoints(first, last)?;
                if voice != end_voice {
                    return Err(Failure::RangeOwnerMismatch);
                }
                self.verify_recorded_node(&voice)?;
                let content = self.candidate.owner(&voice).ok_or(Failure::InternalError)?;
                self.verify_recorded_node(&content)?;
                let part = self
                    .candidate
                    .owner(&content)
                    .ok_or(Failure::InternalError)?;
                self.verify_recorded_node(&part)?;
                let events = self.range_children(&voice, Children::Events)?;
                for event in &events[start.min(end)..=start.max(end)] {
                    self.verify_range_event(event)?;
                    self.range_push(&mut result.events, event.clone())?;
                }
            }
        }
        Ok(result)
    }
}
