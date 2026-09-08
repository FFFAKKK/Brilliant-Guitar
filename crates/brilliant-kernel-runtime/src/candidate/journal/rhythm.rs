//! Voice/Event subtree recording. Preparation uses raw command resolution;
//! replay uses the retained identity bundle through the common interpreter.
use super::*;

pub(super) fn insertion_position(
    candidate: &mut Candidate<'_>,
    order: &CandidateOrder,
    anchor: Option<&Occurrence>,
) -> Result<usize, Failure> {
    let Some(anchor) = anchor else {
        return Ok(0);
    };
    if !candidate.visible(anchor)
        || candidate.kind(anchor) != Some(order.children.child_kind())
        || candidate.owner(anchor).as_ref() != Some(&order.owner)
    {
        return Err(Failure::InternalError);
    }
    let mut position = 0;
    let mut found = false;
    candidate
        .visit_order(order, &mut |source, _| {
            position += 1;
            if source == anchor {
                found = true;
                false
            } else {
                true
            }
        })
        .ok_or(Failure::InternalError)?;
    found.then_some(position).ok_or(Failure::InternalError)
}

fn stored(bundle: Arc<PartBundle>) -> Result<StoredEntityBundle, Failure> {
    Ok(match bundle.root_kind()? {
        Kind::Voice => StoredEntityBundle::Voice(bundle),
        Kind::Event => StoredEntityBundle::Event(bundle),
        _ => return Err(Failure::InternalError),
    })
}

impl Recorder<'_> {
    /// Voice commands re-resolve the Part/content by raw ID when preparing the
    /// effect. Ambiguous owner IDs cannot be bypassed using a retained pointer.
    fn unique_voice_content(
        &mut self,
        part: &Occurrence,
        content: &Occurrence,
    ) -> Result<(), Failure> {
        if !self.candidate.visible(part)
            || !self.candidate.visible(content)
            || self.candidate.kind(part) != Some(Kind::Part)
            || self.candidate.kind(content) != Some(Kind::Content)
            || self.candidate.owner(content).as_ref() != Some(part)
        {
            return Err(Failure::InternalError);
        }
        let part_id = self
            .candidate
            .raw_id(part)
            .ok_or(Failure::InternalError)?
            .clone();
        if self.candidate.resolve(Kind::Part, &part_id)? != *part {
            return Err(Failure::InternalError);
        }
        let measure_id = self
            .candidate
            .raw_id(content)
            .ok_or(Failure::InternalError)?
            .clone();
        let mut matched = None;
        let mut duplicate = false;
        self.candidate
            .visit_order(
                &CandidateOrder::new(part, Children::Contents),
                &mut |source, raw| {
                    if raw == &measure_id {
                        if matched.is_some() {
                            duplicate = true;
                            return false;
                        }
                        matched = Some(source.clone());
                    }
                    true
                },
            )
            .ok_or(Failure::InternalError)?;
        if duplicate || matched.as_ref() != Some(content) {
            return Err(Failure::InternalError);
        }
        Ok(())
    }

    pub(super) fn insert_voice(
        &mut self,
        part: &Occurrence,
        content: &Occurrence,
        voice: AdmissionVoiceV1,
        after: Option<&JsString>,
    ) -> Result<Occurrence, Failure> {
        let result = self.insert_voice_inner(part, content, voice, after);
        if result.is_err() {
            self.candidate.reservation.abort();
        }
        result
    }

    fn insert_voice_inner(
        &mut self,
        part: &Occurrence,
        content: &Occurrence,
        voice: AdmissionVoiceV1,
        after: Option<&JsString>,
    ) -> Result<Occurrence, Failure> {
        self.candidate.reservation.ensure_active()?;
        let part_id = self
            .candidate
            .raw_id(part)
            .ok_or(Failure::TargetNotFound)?
            .clone();
        if self.candidate.resolve(Kind::Part, &part_id)? != *part {
            return Err(Failure::InternalError);
        }
        let measure_id = self
            .candidate
            .raw_id(content)
            .ok_or(Failure::InternalError)?
            .clone();
        self.candidate.resolve(Kind::Measure, &measure_id)?;
        self.unique_voice_content(part, content)?;
        let order = CandidateOrder::new(content, Children::Voices);
        let position = self.candidate.voice_insertion_index(part, content, after)?;
        let expected = self.reserve_rhythm_insert(&order)?;
        let root = self.candidate.insert_voice(part, content, voice, after)?;
        self.finish_rhythm_insert(order, position, expected, root)
    }

    pub(super) fn insert_event(
        &mut self,
        voice: &Occurrence,
        event: RhythmicEventV1<JsString>,
        after: Option<&JsString>,
    ) -> Result<Occurrence, Failure> {
        let result = self.insert_event_inner(voice, event, after);
        if result.is_err() {
            self.candidate.reservation.abort();
        }
        result
    }

    fn insert_event_inner(
        &mut self,
        voice: &Occurrence,
        event: RhythmicEventV1<JsString>,
        after: Option<&JsString>,
    ) -> Result<Occurrence, Failure> {
        self.candidate.reservation.ensure_active()?;
        let raw = self
            .candidate
            .raw_id(voice)
            .ok_or(Failure::TargetNotFound)?
            .clone();
        if self.candidate.resolve(Kind::Voice, &raw)? != *voice {
            return Err(Failure::InternalError);
        }
        let order = CandidateOrder::new(voice, Children::Events);
        let position = self.candidate.insertion_index(&order, after, None)?;
        let expected = self.reserve_rhythm_insert(&order)?;
        let root = self.candidate.insert_event(voice, event, after)?;
        self.finish_rhythm_insert(order, position, expected, root)
    }

    fn reserve_rhythm_insert(&mut self, order: &CandidateOrder) -> Result<Vec<JournalId>, Failure> {
        self.verify_recorded_node(&order.owner)?;
        let mut expected = self.recorded_order_ids(order)?;
        self.candidate
            .reservation
            .vec(Site::JournalOperations, &mut expected, 1)?;
        self.candidate
            .reservation
            .vec(Site::JournalOperations, &mut self.steps, 1)?;
        self.candidate
            .reservation
            .map(Site::JournalOperations, &mut self.order_changes, 1)?;
        Ok(expected)
    }

    fn finish_rhythm_insert(
        &mut self,
        order: CandidateOrder,
        position: usize,
        mut expected: Vec<JournalId>,
        root: Occurrence,
    ) -> Result<Occurrence, Failure> {
        let owner = self.identities.record(&mut self.candidate, &order.owner)?;
        let (bundle, sources) =
            PartBundle::capture(&mut self.candidate, &mut self.identities, &root)?;
        let bundle = Arc::new(bundle);
        self.register_birth(bundle.clone(), &sources)?;
        if position > expected.len() {
            return Err(Failure::InternalError);
        }
        let anchor = position.checked_sub(1).map(|index| expected[index]);
        expected.insert(position, bundle.nodes[0].id);
        self.order_changes.insert(order, Arc::new(expected));
        let bundle = stored(bundle)?;
        self.steps.push(Step {
            forward: Operation::InsertEntity {
                owner,
                anchor,
                bundle: bundle.clone(),
            },
            inverse: Operation::RemoveEntity {
                owner,
                expected_anchor: anchor,
                expected: bundle,
            },
        });
        Ok(root)
    }

    pub(super) fn remove_voice(&mut self, raw_id: &JsString) -> Result<(), Failure> {
        self.remove_rhythm(Kind::Voice, raw_id)
    }

    pub(super) fn remove_event(&mut self, raw_id: &JsString) -> Result<(), Failure> {
        self.remove_rhythm(Kind::Event, raw_id)
    }

    fn remove_rhythm(&mut self, kind: Kind, raw_id: &JsString) -> Result<(), Failure> {
        let result = self.remove_rhythm_inner(kind, raw_id);
        if result.is_err() {
            self.candidate.reservation.abort();
        }
        result
    }

    fn remove_rhythm_inner(&mut self, kind: Kind, raw_id: &JsString) -> Result<(), Failure> {
        self.candidate.reservation.ensure_active()?;
        let root = self.candidate.resolve(kind, raw_id)?;
        let owner_source = self.candidate.owner(&root).ok_or(Failure::InternalError)?;
        self.check_effect_budget(1)?;
        let children = match kind {
            Kind::Voice => {
                let part = self
                    .candidate
                    .owner(&owner_source)
                    .ok_or(Failure::InternalError)?;
                self.unique_voice_content(&part, &owner_source)?;
                Children::Voices
            }
            Kind::Event => Children::Events,
            _ => return Err(Failure::InternalError),
        };
        let order = CandidateOrder::new(&owner_source, children);
        let mut ids = self.recorded_order_ids(&order)?;
        let (bundle, sources) = self.expected_subtree(&root)?;
        bundle.verify(&mut self.candidate, &owner_source, &sources)?;
        let root_id = bundle.nodes[0].id;
        let position = ids
            .iter()
            .position(|id| *id == root_id)
            .ok_or(Failure::InternalError)?;
        let anchor = position.checked_sub(1).map(|index| ids[index]);
        let owner = self.identities.record(&mut self.candidate, &owner_source)?;
        self.candidate
            .reservation
            .vec(Site::JournalOperations, &mut self.steps, 1)?;
        self.candidate
            .reservation
            .map(Site::JournalOperations, &mut self.order_changes, 1)?;
        self.candidate.hide(&root)?;
        ids.remove(position);
        self.order_changes.insert(order, Arc::new(ids));
        let bundle = stored(Arc::new(bundle))?;
        self.steps.push(Step {
            forward: Operation::RemoveEntity {
                owner,
                expected_anchor: anchor,
                expected: bundle.clone(),
            },
            inverse: Operation::InsertEntity {
                owner,
                anchor,
                bundle,
            },
        });
        Ok(())
    }
}
