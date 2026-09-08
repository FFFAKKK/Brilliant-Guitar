//! TS Measure preparation above the occurrence-based composite interpreter.
use super::*;
use brilliant_kernel_contracts::InsertMeasurePartContentV1;

#[derive(Debug, PartialEq)]
pub(super) enum MeasurePreparationFailure {
    Command(Failure),
    DuplicateDefinition { insertion_index: usize },
}

impl From<Failure> for MeasurePreparationFailure {
    fn from(value: Failure) -> Self {
        Self::Command(value)
    }
}

fn raw(candidate: &Candidate<'_>, source: &Occurrence) -> Result<JsString, Failure> {
    candidate
        .raw_id(source)
        .cloned()
        .ok_or(Failure::InternalError)
}

fn nth(
    candidate: &mut Candidate<'_>,
    order: &CandidateOrder,
    index: usize,
) -> Result<Option<(Occurrence, JsString)>, Failure> {
    let mut at = 0;
    let mut found = None;
    candidate
        .visit_order(order, &mut |source, raw| {
            if at == index {
                found = Some((source.clone(), raw.clone()));
                return false;
            }
            at += 1;
            true
        })
        .ok_or(Failure::InternalError)?;
    Ok(found)
}

// Temporary allocation-free comparison for the true no-op path. Callback-only
// prefix orders require repeated scans: O(Parts * Measures^2), plus the Part
// enumeration scans. visit_order accounts every traversal. Replace this with
// indexed borrowed traversal before the resource-accounting activation gate.
fn equal_raw_orders(
    candidate: &mut Candidate<'_>,
    left: &CandidateOrder,
    right: &CandidateOrder,
) -> Result<bool, Failure> {
    let mut index = 0;
    loop {
        let left = nth(candidate, left, index)?;
        let right = nth(candidate, right, index)?;
        match (left, right) {
            (None, None) => return Ok(true),
            (Some((_, left)), Some((_, right))) if left == right => index += 1,
            _ => return Ok(false),
        }
    }
}

fn local_anchor(
    candidate: &Candidate<'_>,
    sources: &[Occurrence],
    after: Option<&JsString>,
) -> Result<(), Failure> {
    if let Some(after) = after {
        let mut matches = sources
            .iter()
            .filter(|source| candidate.raw_id(source) == Some(after));
        if matches.next().is_none() || matches.next().is_some() {
            return Err(Failure::InternalError);
        }
    }
    Ok(())
}

impl Recorder<'_> {
    pub(super) fn insert_measure_command(
        &mut self,
        document_id: &JsString,
        definition: AdmissionMeasureDefinitionV1,
        contents: Vec<InsertMeasurePartContentV1<JsString>>,
        after: Option<&JsString>,
    ) -> Result<Occurrence, MeasurePreparationFailure> {
        let result = self.insert_measure_command_inner(document_id, definition, contents, after);
        if result.is_err() {
            self.candidate.reservation.abort();
        }
        result
    }

    fn insert_measure_command_inner(
        &mut self,
        document_id: &JsString,
        definition: AdmissionMeasureDefinitionV1,
        contents: Vec<InsertMeasurePartContentV1<JsString>>,
        after: Option<&JsString>,
    ) -> Result<Occurrence, MeasurePreparationFailure> {
        self.candidate.reservation.ensure_active()?;
        let document = self.candidate.resolve(Kind::Document, document_id)?;
        let measures = CandidateOrder::new(&document, Children::Measures);
        let insertion_index = self.candidate.insertion_index(&measures, after, None)?;
        // Target failures in payload order precede duplicate-definition failure.
        for content in &contents {
            self.candidate.resolve(Kind::Part, &content.part_id)?;
        }
        let mut duplicate = false;
        self.candidate
            .visit_order(&measures, &mut |_, id| {
                duplicate = id == &definition.id;
                !duplicate
            })
            .ok_or(Failure::InternalError)?;
        if duplicate {
            return Err(MeasurePreparationFailure::DuplicateDefinition { insertion_index });
        }
        let parts = super::measure::collect_sources(
            &mut self.candidate,
            &CandidateOrder::new(&document, Children::Parts),
        )?;
        let mut by_part = HashMap::new();
        self.candidate
            .reservation
            .map(Site::JournalOperations, &mut by_part, contents.len())?;
        let mut resolved = Vec::new();
        self.candidate
            .reservation
            .vec(Site::JournalOperations, &mut resolved, contents.len())?;
        let mut exact = parts.len() == contents.len();
        for content in contents {
            let part = self.candidate.resolve(Kind::Part, &content.part_id)?;
            if by_part.insert(part.clone(), resolved.len()).is_some() {
                exact = false;
            }
            resolved.push(Some((part, content.voices)));
        }
        exact &= parts.iter().all(|part| by_part.contains_key(part));
        let mut ordered = Vec::new();
        self.candidate
            .reservation
            .vec(Site::JournalOperations, &mut ordered, resolved.len())?;
        if exact {
            for part in &parts {
                let index = *by_part.get(part).ok_or(Failure::InternalError)?;
                ordered.push(resolved[index].take().ok_or(Failure::InternalError)?);
            }
        } else {
            for entry in resolved {
                ordered.push(entry.ok_or(Failure::InternalError)?);
            }
        }
        let root = self.insert_measure_bundle(definition, ordered, after)?;
        // Inexact coverage intentionally reaches final semantic validation.
        if exact {
            self.normalize_measure_contents()?;
        }
        Ok(root)
    }

    pub(super) fn remove_measure_command(&mut self, id: &JsString) -> Result<(), Failure> {
        let result = (|| {
            self.candidate.reservation.ensure_active()?;
            self.candidate.resolve(Kind::Measure, id)?;
            let document = self.candidate.document.clone();
            let parts = super::measure::collect_sources(
                &mut self.candidate,
                &CandidateOrder::new(&document, Children::Parts),
            )?;
            for part in &parts {
                super::measure::unique_content(&mut self.candidate, part, id)?;
            }
            self.remove_measure_bundle(id)?;
            self.normalize_measure_contents()
        })();
        if result.is_err() {
            self.candidate.reservation.abort();
        }
        result
    }

    pub(super) fn move_measure_command(
        &mut self,
        id: &JsString,
        after: Option<&JsString>,
    ) -> Result<bool, Failure> {
        let result = self.move_measure_command_inner(id, after);
        if result.is_err() {
            self.candidate.reservation.abort();
        }
        result
    }

    fn move_measure_command_inner(
        &mut self,
        id: &JsString,
        after: Option<&JsString>,
    ) -> Result<bool, Failure> {
        self.candidate.reservation.ensure_active()?;
        let target = self.candidate.resolve(Kind::Measure, id)?;
        if after == Some(id) {
            return Err(Failure::AnchorSelfReference);
        }
        let document = self.candidate.document.clone();
        let measures = CandidateOrder::new(&document, Children::Measures);
        self.candidate.insertion_index(&measures, after, None)?;
        self.verify_recorded_node(&document)?;
        self.verify_recorded_node(&target)?;
        self.verify_recorded_order(&measures)?;
        let part_order = CandidateOrder::new(&document, Children::Parts);
        self.verify_recorded_order(&part_order)?;
        let mut previous = None;
        self.candidate
            .visit_order(&measures, &mut |source, raw| {
                if source == &target {
                    return false;
                }
                previous = Some(raw.clone());
                true
            })
            .ok_or(Failure::InternalError)?;
        let mut unchanged = previous.as_ref() == after;
        let mut index = 0;
        while let Some((part, _)) = nth(&mut self.candidate, &part_order, index)? {
            let order = CandidateOrder::new(&part, Children::Contents);
            self.verify_recorded_node(&part)?;
            self.verify_recorded_order(&order)?;
            if unchanged && !equal_raw_orders(&mut self.candidate, &measures, &order)? {
                unchanged = false;
            }
            index += 1;
        }
        if unchanged {
            return Ok(false);
        }
        let parts = super::measure::collect_sources(&mut self.candidate, &part_order)?;
        // Every target and local anchor is checked before the first mutation.
        let mut plans = Vec::new();
        self.candidate
            .reservation
            .vec(Site::JournalOperations, &mut plans, parts.len())?;
        for part in &parts {
            let content = super::measure::unique_content(&mut self.candidate, part, id)?;
            let order = CandidateOrder::new(part, Children::Contents);
            let mut sources = super::measure::collect_sources(&mut self.candidate, &order)?;
            local_anchor(&self.candidate, &sources, after)?;
            let old = sources
                .iter()
                .position(|source| source == &content)
                .ok_or(Failure::InternalError)?;
            sources.remove(old);
            let position = match after {
                None => 0,
                Some(after) => {
                    sources
                        .iter()
                        .position(|source| self.candidate.raw_id(source) == Some(after))
                        .ok_or(Failure::InternalError)?
                        + 1
                }
            };
            sources.insert(position, content);
            plans.push((order, sources));
        }
        let mut desired = super::measure::collect_sources(&mut self.candidate, &measures)?;
        let position = self
            .candidate
            .insertion_index(&measures, after, Some(&target))?;
        let old = desired
            .iter()
            .position(|source| source == &target)
            .ok_or(Failure::InternalError)?;
        desired.remove(old);
        desired.insert(position, target);
        let needs_reorder = plans.iter().any(|(_, sources)| {
            sources.len() != desired.len()
                || sources.iter().zip(&desired).any(|(left, right)| {
                    self.candidate.raw_id(left) != self.candidate.raw_id(right)
                })
        });
        if needs_reorder {
            plans = self.normalization_plans(&parts, &desired)?;
        }
        self.move_child(&measures, id, after)?;
        for (order, sources) in plans {
            self.replace_children(&order, &sources)?;
        }
        Ok(true)
    }

    fn normalize_measure_contents(&mut self) -> Result<(), Failure> {
        let document = self.candidate.document.clone();
        let measures = CandidateOrder::new(&document, Children::Measures);
        let part_order = CandidateOrder::new(&document, Children::Parts);
        self.verify_recorded_order(&measures)?;
        self.verify_recorded_order(&part_order)?;
        let parts = super::measure::collect_sources(&mut self.candidate, &part_order)?;
        let mut changed = false;
        for part in &parts {
            let order = CandidateOrder::new(part, Children::Contents);
            self.verify_recorded_order(&order)?;
            changed |= !equal_raw_orders(&mut self.candidate, &measures, &order)?;
        }
        if !changed {
            return Ok(());
        }
        let desired = super::measure::collect_sources(&mut self.candidate, &measures)?;
        let plans = self.normalization_plans(&parts, &desired)?;
        for (order, sources) in plans {
            self.replace_children(&order, &sources)?;
        }
        Ok(())
    }

    fn normalization_plans(
        &mut self,
        parts: &[Occurrence],
        measures: &[Occurrence],
    ) -> Result<Vec<(CandidateOrder, Vec<Occurrence>)>, Failure> {
        let mut ids = Vec::new();
        let mut unique = HashSet::new();
        self.candidate
            .reservation
            .vec(Site::JournalOperations, &mut ids, measures.len())?;
        self.candidate
            .reservation
            .set(Site::JournalOperations, &mut unique, measures.len())?;
        for measure in measures {
            let id = raw(&self.candidate, measure)?;
            if !unique.insert(id.clone()) {
                return Err(Failure::InternalError);
            }
            ids.push(id);
        }
        let mut plans = Vec::new();
        self.candidate
            .reservation
            .vec(Site::JournalOperations, &mut plans, parts.len())?;
        for part in parts {
            let order = CandidateOrder::new(part, Children::Contents);
            self.verify_recorded_node(part)?;
            self.verify_recorded_order(&order)?;
            let sources = super::measure::collect_sources(&mut self.candidate, &order)?;
            if sources.len() != ids.len() {
                return Err(Failure::InternalError);
            }
            let mut by_id = HashMap::new();
            self.candidate
                .reservation
                .map(Site::JournalOperations, &mut by_id, sources.len())?;
            for source in sources {
                if by_id
                    .insert(raw(&self.candidate, &source)?, source)
                    .is_some()
                {
                    return Err(Failure::InternalError);
                }
            }
            let mut desired = Vec::new();
            self.candidate
                .reservation
                .vec(Site::JournalOperations, &mut desired, ids.len())?;
            for id in &ids {
                desired.push(by_id.remove(id).ok_or(Failure::InternalError)?);
            }
            plans.push((order, desired));
        }
        Ok(plans)
    }
}
