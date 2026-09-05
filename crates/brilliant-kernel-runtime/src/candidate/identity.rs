//! Suffix-journal identities outlive the recording candidate's arena positions.
//! A sealed manifest contains strong boundary locators and raw identity facts,
//! never Added indices. Transient nodes must be bound by explicit insert replay.

use std::{
    borrow::Borrow,
    collections::HashMap,
    hash::{Hash, Hasher},
    sync::Arc,
};

use brilliant_core_types::{JsString, StableId};
use brilliant_kernel_contracts::AffectedEntityIdV1;

use super::{Candidate, CandidateOrder, Children, Entity, Failure, Kind, Occurrence, Site};

#[derive(Clone, Copy, Debug, Eq, Hash, PartialEq)]
pub(super) struct JournalId(usize);

#[derive(Clone, Copy)]
pub(super) enum BoundarySide {
    SuffixStart,
    SuffixEnd,
}

#[derive(Clone)]
enum Boundary {
    Entity(Arc<Entity>),
    Content {
        part: Arc<Entity>,
        measure_id: Arc<StableId>,
    },
}

impl Boundary {
    fn from_prefix(source: &Occurrence) -> Option<Self> {
        match source {
            Occurrence::Prefix(entity) => Some(Self::Entity(entity.clone())),
            Occurrence::PrefixContent { part, measure_id } => Some(Self::Content {
                part: part.clone(),
                measure_id: measure_id.clone(),
            }),
            Occurrence::Added(_) => None,
        }
    }
}

struct Identity {
    kind: Kind,
    raw_id: AffectedEntityIdV1,
    owner: Option<JournalId>,
    start: Option<Boundary>,
    end: Option<Boundary>,
}

struct RecordedIdentity {
    source: Occurrence,
    identity: Identity,
}

#[derive(Default)]
pub(super) struct IdentityRecorder {
    entries: Vec<RecordedIdentity>,
    sources: HashMap<Occurrence, JournalId>,
}

pub(super) struct IdentityManifest {
    entries: Vec<Identity>,
}

fn raw_identity(
    candidate: &Candidate<'_>,
    source: &Occurrence,
) -> Result<AffectedEntityIdV1, Failure> {
    Ok(match source {
        Occurrence::Prefix(entity) => entity.stable_id().clone().into(),
        Occurrence::PrefixContent { measure_id, .. } => measure_id.as_ref().clone().into(),
        Occurrence::Added(index) => candidate
            .nodes
            .get(*index)
            .ok_or(Failure::InternalError)?
            .raw_id
            .clone()
            .into(),
    })
}

impl IdentityRecorder {
    pub(super) fn record(
        &mut self,
        candidate: &mut Candidate<'_>,
        source: &Occurrence,
    ) -> Result<JournalId, Failure> {
        candidate.reservation.ensure_active()?;
        if let Some(id) = self.sources.get(source) {
            return Ok(*id);
        }
        if !candidate.visible(source) {
            return Err(Failure::InternalError);
        }
        let kind = candidate.kind(source).ok_or(Failure::InternalError)?;
        let owner = if source == &candidate.document {
            None
        } else {
            let owner = candidate.owner(source).ok_or(Failure::InternalError)?;
            Some(self.record(candidate, &owner)?)
        };
        let raw_id = raw_identity(candidate, source)?;
        candidate
            .reservation
            .vec(Site::JournalIdentities, &mut self.entries, 1)?;
        candidate
            .reservation
            .map(Site::JournalSources, &mut self.sources, 1)?;
        let id = JournalId(self.entries.len());
        self.entries.push(RecordedIdentity {
            source: source.clone(),
            identity: Identity {
                kind,
                raw_id,
                owner,
                start: Boundary::from_prefix(source),
                end: None,
            },
        });
        self.sources.insert(source.clone(), id);
        Ok(id)
    }

    /// Call after final candidate validation. This also checks the strong
    /// locator precondition; it is not a replacement for semantic diagnostics.
    pub(super) fn finish(self, candidate: &mut Candidate<'_>) -> Result<IdentityManifest, Failure> {
        candidate.reservation.ensure_active()?;
        let mut entries = Vec::new();
        let mut contents = ContentLocators::default();
        candidate
            .reservation
            .vec(Site::JournalBoundaries, &mut entries, self.entries.len())?;
        for recorded in self.entries {
            let mut identity = recorded.identity;
            if candidate.visible(&recorded.source) {
                identity.end = Some(boundary_for(
                    candidate,
                    &recorded.source,
                    identity.kind,
                    identity.raw_id.as_js_string(),
                    identity
                        .owner
                        .and_then(|owner| entries.get(owner.0))
                        .and_then(|owner: &Identity| owner.end.as_ref()),
                    &mut contents,
                )?);
            }
            entries.push(identity);
        }
        Ok(IdentityManifest { entries })
    }
}

fn unique_entity(
    candidate: &mut Candidate<'_>,
    kind: Kind,
    raw_id: &JsString,
) -> Result<Occurrence, Failure> {
    let mut result = None;
    for entity_kind in [
        Kind::Document,
        Kind::Measure,
        Kind::Part,
        Kind::Staff,
        Kind::Voice,
        Kind::Event,
        Kind::Note,
    ] {
        for occurrence in candidate.matches(entity_kind, raw_id) {
            if entity_kind != kind || result.is_some() {
                return Err(Failure::InternalError);
            }
            result = Some(occurrence);
        }
    }
    result.ok_or(Failure::InternalError)
}

#[derive(Eq, PartialEq)]
struct ContentKey(AffectedEntityIdV1);

impl Hash for ContentKey {
    fn hash<H: Hasher>(&self, state: &mut H) {
        self.0.as_js_string().hash(state);
    }
}

impl Borrow<JsString> for ContentKey {
    fn borrow(&self) -> &JsString {
        self.0.as_js_string()
    }
}

/// Private to one immutable boundary pass. Unchanged prefix links use their
/// existing index; each modified/added content order is indexed once. Keys
/// retain the original shared ID allocation, including invalid raw strings.
#[derive(Default)]
struct ContentLocators {
    parts: HashMap<Occurrence, HashMap<ContentKey, Option<Occurrence>>>,
}

impl ContentLocators {
    fn unique(
        &mut self,
        candidate: &mut Candidate<'_>,
        part: &Occurrence,
        raw_id: &JsString,
    ) -> Result<Occurrence, Failure> {
        let order = CandidateOrder::new(part, Children::Contents);
        let Some(children) = candidate.orders.get(&order) else {
            let Occurrence::Prefix(part) = part else {
                return Err(Failure::InternalError);
            };
            let content = Occurrence::PrefixContent {
                part: part.clone(),
                measure_id: Arc::new(StableId::new(raw_id).map_err(|_| Failure::InternalError)?),
            };
            return candidate
                .visible(&content)
                .then_some(content)
                .ok_or(Failure::InternalError);
        };
        if !self.parts.contains_key(part) {
            candidate
                .reservation
                .map(Site::JournalBoundaries, &mut self.parts, 1)?;
            let mut by_id = HashMap::new();
            candidate
                .reservation
                .map(Site::JournalBoundaries, &mut by_id, children.len())?;
            let mut visited = 0;
            for child in children {
                if candidate.visible(child) {
                    visited += 1;
                    let key = ContentKey(raw_identity(candidate, child)?);
                    by_id
                        .entry(key)
                        .and_modify(|found| *found = None)
                        .or_insert_with(|| Some(child.clone()));
                }
            }
            candidate.work.order_visits += 1;
            candidate.work.visited_entries += visited;
            self.parts.insert(part.clone(), by_id);
        }
        self.parts
            .get(part)
            .and_then(|by_id| by_id.get(raw_id))
            .and_then(Option::as_ref)
            .cloned()
            .ok_or(Failure::InternalError)
    }
}

fn boundary_for(
    candidate: &mut Candidate<'_>,
    source: &Occurrence,
    kind: Kind,
    raw_id: &JsString,
    owner_boundary: Option<&Boundary>,
    contents: &mut ContentLocators,
) -> Result<Boundary, Failure> {
    if kind == Kind::Content {
        let part = candidate.owner(source).ok_or(Failure::InternalError)?;
        if contents.unique(candidate, &part, raw_id)? != *source {
            return Err(Failure::InternalError);
        }
        let Some(Boundary::Entity(part_address)) = owner_boundary else {
            return Err(Failure::InternalError);
        };
        // A content at a valid boundary links to a real global measure.
        let measure = unique_entity(candidate, Kind::Measure, raw_id)?;
        let id = match measure {
            Occurrence::Prefix(entity) => entity.stable_id().clone(),
            _ => StableId::new(raw_id).map_err(|_| Failure::InternalError)?,
        };
        return Ok(Boundary::Content {
            part: part_address.clone(),
            measure_id: Arc::new(id),
        });
    }
    if unique_entity(candidate, kind, raw_id)? != *source {
        return Err(Failure::InternalError);
    }
    if let Some(boundary) = Boundary::from_prefix(source) {
        return Ok(boundary);
    }
    let id = StableId::new(raw_id).map_err(|_| Failure::InternalError)?;
    let address = match kind {
        Kind::Document => Entity::Document { document_id: id },
        Kind::Measure => Entity::Measure { measure_id: id },
        Kind::Part => Entity::Part { part_id: id },
        Kind::Staff => Entity::Staff { staff_id: id },
        Kind::Voice => Entity::Voice { voice_id: id },
        Kind::Event => Entity::Event { event_id: id },
        Kind::Note => Entity::Note { note_id: id },
        Kind::Content => unreachable!(),
    };
    Ok(Boundary::Entity(Arc::new(address)))
}

fn locate(
    candidate: &mut Candidate<'_>,
    boundary: &Boundary,
    contents: &mut ContentLocators,
) -> Result<Occurrence, Failure> {
    match boundary {
        Boundary::Entity(entity) => unique_entity(
            candidate,
            Kind::of(entity),
            entity.stable_id().as_js_string(),
        ),
        Boundary::Content { part, measure_id } => {
            let part = unique_entity(candidate, Kind::Part, part.stable_id().as_js_string())?;
            unique_entity(candidate, Kind::Measure, measure_id.as_js_string())?;
            contents.unique(candidate, &part, measure_id.as_js_string())
        }
    }
}

pub(super) struct ReplayBindings<'journal> {
    manifest: &'journal IdentityManifest,
    entries: Vec<Option<Occurrence>>,
    reverse: HashMap<Occurrence, JournalId>,
}

impl<'journal> ReplayBindings<'journal> {
    pub(super) fn require_unbound(&self, id: JournalId) -> Result<(), Failure> {
        if self.manifest.entries.get(id.0).is_some() && self.entries.get(id.0) == Some(&None) {
            Ok(())
        } else {
            Err(Failure::InternalError)
        }
    }

    pub(super) fn require_insert_identity(
        &self,
        id: JournalId,
        kind: Kind,
        raw_id: &JsString,
        owner: JournalId,
    ) -> Result<(), Failure> {
        self.require_unbound(id)?;
        let identity = &self.manifest.entries[id.0];
        if identity.kind != kind
            || identity.raw_id.as_js_string() != raw_id
            || identity.owner != Some(owner)
        {
            return Err(Failure::InternalError);
        }
        Ok(())
    }

    /// Resolves the whole boundary before returning any usable binding state.
    pub(super) fn at(
        manifest: &'journal IdentityManifest,
        side: BoundarySide,
        candidate: &mut Candidate<'_>,
    ) -> Result<Self, Failure> {
        candidate.reservation.ensure_active()?;
        let mut entries = Vec::new();
        let mut reverse = HashMap::new();
        let mut contents = ContentLocators::default();
        candidate
            .reservation
            .vec(Site::ReplayBindings, &mut entries, manifest.entries.len())?;
        candidate
            .reservation
            .map(Site::ReplayBindings, &mut reverse, manifest.entries.len())?;
        for (index, identity) in manifest.entries.iter().enumerate() {
            let boundary = match side {
                BoundarySide::SuffixStart => &identity.start,
                BoundarySide::SuffixEnd => &identity.end,
            };
            let source = boundary
                .as_ref()
                .map(|boundary| locate(candidate, boundary, &mut contents))
                .transpose()?;
            if let Some(source) = &source {
                let owner = identity
                    .owner
                    .and_then(|id| entries.get(id.0))
                    .and_then(Option::as_ref);
                if candidate.owner(source).as_ref() != owner
                    || reverse.insert(source.clone(), JournalId(index)).is_some()
                {
                    return Err(Failure::InternalError);
                }
            }
            entries.push(source);
        }
        Ok(Self {
            manifest,
            entries,
            reverse,
        })
    }

    pub(super) fn resolve(
        &self,
        id: JournalId,
        candidate: &Candidate<'_>,
    ) -> Result<Occurrence, Failure> {
        let source = self
            .entries
            .get(id.0)
            .and_then(Option::as_ref)
            .ok_or(Failure::InternalError)?;
        if !candidate.visible(source) || self.reverse.get(source) != Some(&id) {
            return Err(Failure::InternalError);
        }
        Ok(source.clone())
    }

    /// Insert replay supplies the deterministic node-to-journal-ID pairing.
    /// No raw-ID lookup is permitted for identities absent at this boundary.
    pub(super) fn bind_inserted(
        &mut self,
        candidate: &mut Candidate<'_>,
        assignments: &[(JournalId, Occurrence)],
    ) -> Result<(), Failure> {
        candidate.reservation.ensure_active()?;
        let mut incoming = HashMap::new();
        let mut incoming_reverse = HashMap::new();
        candidate
            .reservation
            .map(Site::ReplayBindings, &mut incoming, assignments.len())?;
        candidate.reservation.map(
            Site::ReplayBindings,
            &mut incoming_reverse,
            assignments.len(),
        )?;
        for (id, source) in assignments {
            let identity = self
                .manifest
                .entries
                .get(id.0)
                .ok_or(Failure::InternalError)?;
            if self.entries[id.0].is_some()
                || !candidate.visible(source)
                || candidate.kind(source) != Some(identity.kind)
                || candidate.raw_id(source) != Some(identity.raw_id.as_js_string())
                || self.reverse.contains_key(source)
                || incoming.insert(*id, source.clone()).is_some()
                || incoming_reverse.insert(source.clone(), *id).is_some()
            {
                return Err(Failure::InternalError);
            }
        }
        for (id, source) in assignments {
            let identity = &self.manifest.entries[id.0];
            let owner = identity.owner.and_then(|owner| {
                incoming
                    .get(&owner)
                    .or_else(|| self.entries.get(owner.0).and_then(Option::as_ref))
            });
            if candidate.owner(source).as_ref() != owner {
                return Err(Failure::InternalError);
            }
        }
        candidate
            .reservation
            .map(Site::ReplayBindings, &mut self.reverse, assignments.len())?;
        for (id, source) in assignments {
            self.entries[id.0] = Some(source.clone());
            self.reverse.insert(source.clone(), *id);
        }
        Ok(())
    }

    pub(super) fn unbind_removed(
        &mut self,
        candidate: &Candidate<'_>,
        root: JournalId,
    ) -> Result<(), Failure> {
        candidate.reservation.ensure_active()?;
        let source = self
            .entries
            .get(root.0)
            .and_then(Option::as_ref)
            .ok_or(Failure::InternalError)?;
        if candidate.visible(source) {
            return Err(Failure::InternalError);
        }
        for (index, source) in self.entries.iter().enumerate() {
            if self.manifest.descends_from(JournalId(index), root)
                && source
                    .as_ref()
                    .is_some_and(|source| candidate.visible(source))
            {
                return Err(Failure::InternalError);
            }
        }
        for (index, source) in self.entries.iter_mut().enumerate() {
            if self.manifest.descends_from(JournalId(index), root)
                && let Some(source) = source.take()
            {
                self.reverse.remove(&source);
            }
        }
        Ok(())
    }
}

impl IdentityManifest {
    fn descends_from(&self, mut id: JournalId, root: JournalId) -> bool {
        for _ in 0..7 {
            if id == root {
                return true;
            }
            let Some(owner) = self.entries.get(id.0).and_then(|entry| entry.owner) else {
                return false;
            };
            id = owner;
        }
        false
    }
}
