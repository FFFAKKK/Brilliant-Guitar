use std::{
    collections::{HashMap, HashSet},
    hash::Hash,
};

use brilliant_core_types::StableId;
use brilliant_score_foundation::{ExtensionOwnerV1, RhythmicContentV1, ScoreDocumentV1};
use slotmap::{Key, SlotMap};

use crate::{
    handles::{
        EventHandle, ExtensionHandle, MeasureHandle, NoteHandle, PartHandle, RuntimeEntityRef,
        StaffHandle, VoiceHandle,
    },
    records::{
        DocumentHeader, EventContentKind, EventRecord, ExtensionRecord, MeasureRecord, NoteRecord,
        PartMeasureContentRecord, PartMeasureKey, PartRecord, StaffRecord, VoiceRecord,
    },
    topology::ScoreTopology,
};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum StoreInvariantFailure {
    MissingRecord,
    DuplicateSemanticPosition,
    CountMismatch,
    CoverageMismatch,
    ContentRecordMismatch,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum LiveStoreBuildFailure {
    InternalCapacity,
    DuplicateStableId,
    MissingMeasureReference,
    MissingStaffReference,
    MissingPartReference,
    DuplicatePartMeasureContent,
    LocalInvariant(StoreInvariantFailure),
}

#[derive(Debug)]
pub(crate) struct LiveScoreStore {
    pub(crate) header: DocumentHeader,
    pub(crate) measures: SlotMap<MeasureHandle, MeasureRecord>,
    pub(crate) parts: SlotMap<PartHandle, PartRecord>,
    pub(crate) staffs: SlotMap<StaffHandle, StaffRecord>,
    pub(crate) voices: SlotMap<VoiceHandle, VoiceRecord>,
    pub(crate) events: SlotMap<EventHandle, EventRecord>,
    pub(crate) notes: SlotMap<NoteHandle, NoteRecord>,
    pub(crate) extensions: SlotMap<ExtensionHandle, ExtensionRecord>,
    pub(crate) topology: ScoreTopology,
}

// This compile-only anchor keeps the private Stage 3 ownership shape checked in
// non-test builds without connecting the store to SmokeRuntime before Stage 5.
fn stage3_owned_store_shape(store: &LiveScoreStore) {
    let LiveScoreStore {
        header,
        measures,
        parts,
        staffs,
        voices,
        events,
        notes,
        extensions,
        topology,
    } = store;
    let _ = (
        header, measures, parts, staffs, voices, events, notes, extensions, topology,
    );
}

#[used]
static STAGE3_OWNED_STORE_SHAPE: fn(&LiveScoreStore) = stage3_owned_store_shape;

pub(crate) fn build_live_score_store(
    document: &ScoreDocumentV1,
) -> Result<LiveScoreStore, LiveStoreBuildFailure> {
    build_live_score_store_with_policy(document, ReservationPolicy::production())
}

#[used]
static STAGE3_ATOMIC_STORE_BUILD: fn(
    &ScoreDocumentV1,
) -> Result<LiveScoreStore, LiveStoreBuildFailure> = build_live_score_store;

fn build_live_score_store_with_policy(
    document: &ScoreDocumentV1,
    policy: ReservationPolicy,
) -> Result<LiveScoreStore, LiveStoreBuildFailure> {
    let counts = StoreCounts::checked(document)?;
    let mut builder = LiveScoreStoreBuilder::prepare(document, counts, policy)?;
    builder.import(document)?;
    builder.finish()
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
struct StoreCounts {
    entity_ids: usize,
    measures: usize,
    parts: usize,
    staffs: usize,
    contents: usize,
    voices: usize,
    events: usize,
    notes: usize,
    extensions: usize,
}

impl StoreCounts {
    fn checked(document: &ScoreDocumentV1) -> Result<Self, LiveStoreBuildFailure> {
        let mut counts = Self {
            entity_ids: 1,
            measures: document.measure_definitions.len(),
            parts: document.parts.len(),
            staffs: 0,
            contents: 0,
            voices: 0,
            events: 0,
            notes: 0,
            extensions: document.extensions.len(),
        };
        counts.entity_ids = counts
            .entity_ids
            .checked_add(counts.measures)
            .and_then(|value| value.checked_add(counts.parts))
            .ok_or(LiveStoreBuildFailure::InternalCapacity)?;
        for part in &document.parts {
            counts.staffs = checked_add(counts.staffs, part.staves.len())?;
            counts.contents = checked_add(counts.contents, part.measure_contents.len())?;
            counts.entity_ids = checked_add(counts.entity_ids, part.staves.len())?;
            for content in &part.measure_contents {
                counts.voices = checked_add(counts.voices, content.voices.len())?;
                counts.entity_ids = checked_add(counts.entity_ids, content.voices.len())?;
                for voice in &content.voices {
                    counts.events = checked_add(counts.events, voice.sequence.events.len())?;
                    counts.entity_ids =
                        checked_add(counts.entity_ids, voice.sequence.events.len())?;
                    for event in &voice.sequence.events {
                        if let RhythmicContentV1::Notes { notes } = &event.content {
                            counts.notes = checked_add(counts.notes, notes.len())?;
                            counts.entity_ids = checked_add(counts.entity_ids, notes.len())?;
                        }
                    }
                }
            }
        }
        Ok(counts)
    }
}

fn checked_add(left: usize, right: usize) -> Result<usize, LiveStoreBuildFailure> {
    left.checked_add(right)
        .ok_or(LiveStoreBuildFailure::InternalCapacity)
}

#[derive(Clone, Copy, Default)]
struct ReservationPolicy {
    #[cfg(test)]
    fail: bool,
}

impl ReservationPolicy {
    fn production() -> Self {
        Self::default()
    }

    #[cfg(test)]
    fn fail_all() -> Self {
        Self { fail: true }
    }

    fn slot_map<K: Key, V>(
        &self,
        values: &mut SlotMap<K, V>,
        additional: usize,
    ) -> Result<(), LiveStoreBuildFailure> {
        #[cfg(test)]
        if self.fail {
            return Err(LiveStoreBuildFailure::InternalCapacity);
        }
        values
            .try_reserve(additional)
            .map_err(|_| LiveStoreBuildFailure::InternalCapacity)
    }

    fn hash_map<K: Eq + Hash, V>(
        &self,
        values: &mut HashMap<K, V>,
        additional: usize,
    ) -> Result<(), LiveStoreBuildFailure> {
        #[cfg(test)]
        if self.fail {
            return Err(LiveStoreBuildFailure::InternalCapacity);
        }
        values
            .try_reserve(additional)
            .map_err(|_| LiveStoreBuildFailure::InternalCapacity)
    }

    fn hash_set<T: Eq + Hash>(
        &self,
        values: &mut HashSet<T>,
        additional: usize,
    ) -> Result<(), LiveStoreBuildFailure> {
        #[cfg(test)]
        if self.fail {
            return Err(LiveStoreBuildFailure::InternalCapacity);
        }
        values
            .try_reserve(additional)
            .map_err(|_| LiveStoreBuildFailure::InternalCapacity)
    }

    fn vector<T>(
        &self,
        values: &mut Vec<T>,
        additional: usize,
    ) -> Result<(), LiveStoreBuildFailure> {
        #[cfg(test)]
        if self.fail {
            return Err(LiveStoreBuildFailure::InternalCapacity);
        }
        values
            .try_reserve_exact(additional)
            .map_err(|_| LiveStoreBuildFailure::InternalCapacity)
    }
}

struct LiveScoreStoreBuilder<'a> {
    policy: ReservationPolicy,
    counts: StoreCounts,
    header: DocumentHeader,
    measures: SlotMap<MeasureHandle, MeasureRecord>,
    parts: SlotMap<PartHandle, PartRecord>,
    staffs: SlotMap<StaffHandle, StaffRecord>,
    voices: SlotMap<VoiceHandle, VoiceRecord>,
    events: SlotMap<EventHandle, EventRecord>,
    notes: SlotMap<NoteHandle, NoteRecord>,
    extensions: SlotMap<ExtensionHandle, ExtensionRecord>,
    topology: ScoreTopology,
    entity_refs: HashMap<&'a StableId, RuntimeEntityRef>,
    measure_handles: HashMap<&'a StableId, MeasureHandle>,
    part_handles: HashMap<&'a StableId, PartHandle>,
}

impl<'a> LiveScoreStoreBuilder<'a> {
    fn prepare(
        document: &'a ScoreDocumentV1,
        counts: StoreCounts,
        policy: ReservationPolicy,
    ) -> Result<Self, LiveStoreBuildFailure> {
        let mut measures = SlotMap::with_key();
        let mut parts = SlotMap::with_key();
        let mut staffs = SlotMap::with_key();
        let mut voices = SlotMap::with_key();
        let mut events = SlotMap::with_key();
        let mut notes = SlotMap::with_key();
        let mut extensions = SlotMap::with_key();
        policy.slot_map(&mut measures, counts.measures)?;
        policy.slot_map(&mut parts, counts.parts)?;
        policy.slot_map(&mut staffs, counts.staffs)?;
        policy.slot_map(&mut voices, counts.voices)?;
        policy.slot_map(&mut events, counts.events)?;
        policy.slot_map(&mut notes, counts.notes)?;
        policy.slot_map(&mut extensions, counts.extensions)?;

        let mut topology = ScoreTopology::default();
        policy.vector(&mut topology.measure_order, counts.measures)?;
        policy.vector(&mut topology.part_order, counts.parts)?;
        policy.hash_map(&mut topology.staff_order, counts.parts)?;
        policy.hash_map(&mut topology.content_order, counts.parts)?;
        policy.hash_map(&mut topology.contents, counts.contents)?;
        policy.hash_map(&mut topology.voice_order, counts.contents)?;
        policy.hash_map(&mut topology.event_order, counts.voices)?;
        policy.hash_map(&mut topology.note_order, counts.events)?;
        policy.vector(&mut topology.extension_order, counts.extensions)?;

        let mut entity_refs = HashMap::new();
        let mut measure_handles = HashMap::new();
        let mut part_handles = HashMap::new();
        policy.hash_map(&mut entity_refs, counts.entity_ids)?;
        policy.hash_map(&mut measure_handles, counts.measures)?;
        policy.hash_map(&mut part_handles, counts.parts)?;
        entity_refs.insert(&document.id, RuntimeEntityRef::Document);

        Ok(Self {
            policy,
            counts,
            header: DocumentHeader {
                id: document.id.clone(),
                metadata: document.metadata.clone(),
            },
            measures,
            parts,
            staffs,
            voices,
            events,
            notes,
            extensions,
            topology,
            entity_refs,
            measure_handles,
            part_handles,
        })
    }

    fn import(&mut self, document: &'a ScoreDocumentV1) -> Result<(), LiveStoreBuildFailure> {
        self.import_measures(document)?;
        for part in &document.parts {
            self.import_part(part)?;
        }
        self.import_extensions(document)
    }

    fn import_measures(
        &mut self,
        document: &'a ScoreDocumentV1,
    ) -> Result<(), LiveStoreBuildFailure> {
        for measure in &document.measure_definitions {
            self.ensure_identity_available(&measure.id)?;
            let handle = self.measures.insert(MeasureRecord {
                id: measure.id.clone(),
                meter: measure.meter.clone(),
                pickup_duration: measure.pickup_duration.clone(),
            });
            self.entity_refs
                .insert(&measure.id, RuntimeEntityRef::Measure(handle));
            self.measure_handles.insert(&measure.id, handle);
            self.topology.measure_order.push(handle);
        }
        Ok(())
    }

    fn import_part(
        &mut self,
        part: &'a brilliant_score_foundation::PartV1,
    ) -> Result<(), LiveStoreBuildFailure> {
        self.ensure_identity_available(&part.id)?;
        let part_handle = self.parts.insert(PartRecord {
            id: part.id.clone(),
            name: part.name.clone(),
            instrument: part.instrument.clone(),
        });
        self.entity_refs
            .insert(&part.id, RuntimeEntityRef::Part(part_handle));
        self.part_handles.insert(&part.id, part_handle);
        self.topology.part_order.push(part_handle);

        let mut staff_order = Vec::new();
        let mut local_staff_handles = HashMap::new();
        self.policy.vector(&mut staff_order, part.staves.len())?;
        self.policy
            .hash_map(&mut local_staff_handles, part.staves.len())?;
        for staff in &part.staves {
            self.ensure_identity_available(&staff.id)?;
            let handle = self.staffs.insert(StaffRecord {
                id: staff.id.clone(),
                line_count: staff.line_count,
                default_clef: staff.default_clef.clone(),
            });
            self.entity_refs
                .insert(&staff.id, RuntimeEntityRef::Staff(handle));
            local_staff_handles.insert(&staff.id, handle);
            staff_order.push(handle);
        }
        self.topology.staff_order.insert(part_handle, staff_order);

        let mut content_order = Vec::new();
        self.policy
            .vector(&mut content_order, part.measure_contents.len())?;
        for content in &part.measure_contents {
            let measure_handle = *self
                .measure_handles
                .get(&content.measure_id)
                .ok_or(LiveStoreBuildFailure::MissingMeasureReference)?;
            let key = PartMeasureKey {
                part: part_handle,
                measure: measure_handle,
            };
            if self.topology.contents.contains_key(&key) {
                return Err(LiveStoreBuildFailure::DuplicatePartMeasureContent);
            }
            content_order.push(measure_handle);
            self.topology.contents.insert(
                key,
                PartMeasureContentRecord {
                    part: part_handle,
                    measure: measure_handle,
                },
            );

            let mut voice_order = Vec::new();
            self.policy.vector(&mut voice_order, content.voices.len())?;
            for voice in &content.voices {
                if !local_staff_handles.contains_key(&voice.default_staff_id) {
                    return Err(LiveStoreBuildFailure::MissingStaffReference);
                }
                self.ensure_identity_available(&voice.id)?;
                let voice_handle = self.voices.insert(VoiceRecord {
                    id: voice.id.clone(),
                    default_staff_id: voice.default_staff_id.clone(),
                    sequence_start: voice.sequence.start.clone(),
                });
                self.entity_refs
                    .insert(&voice.id, RuntimeEntityRef::Voice(voice_handle));
                voice_order.push(voice_handle);

                let mut event_order = Vec::new();
                self.policy
                    .vector(&mut event_order, voice.sequence.events.len())?;
                for event in &voice.sequence.events {
                    if let Some(staff_id) = &event.staff_id
                        && !local_staff_handles.contains_key(staff_id)
                    {
                        return Err(LiveStoreBuildFailure::MissingStaffReference);
                    }
                    self.ensure_identity_available(&event.id)?;
                    let content_kind = match &event.content {
                        RhythmicContentV1::Rest => EventContentKind::Rest,
                        RhythmicContentV1::Notes { .. } => EventContentKind::Notes,
                    };
                    let event_handle = self.events.insert(EventRecord {
                        id: event.id.clone(),
                        duration: event.duration.clone(),
                        staff_id: event.staff_id.clone(),
                        content_kind,
                    });
                    self.entity_refs
                        .insert(&event.id, RuntimeEntityRef::Event(event_handle));
                    event_order.push(event_handle);

                    let note_count = match &event.content {
                        RhythmicContentV1::Rest => 0,
                        RhythmicContentV1::Notes { notes } => notes.len(),
                    };
                    let mut note_order = Vec::new();
                    self.policy.vector(&mut note_order, note_count)?;
                    if let RhythmicContentV1::Notes { notes } = &event.content {
                        for note in notes {
                            self.ensure_identity_available(&note.id)?;
                            let note_handle = self.notes.insert(NoteRecord {
                                id: note.id.clone(),
                                written_pitch: note.written_pitch.clone(),
                            });
                            self.entity_refs
                                .insert(&note.id, RuntimeEntityRef::Note(note_handle));
                            note_order.push(note_handle);
                        }
                    }
                    self.topology.note_order.insert(event_handle, note_order);
                }
                self.topology.event_order.insert(voice_handle, event_order);
            }
            self.topology.voice_order.insert(key, voice_order);
        }
        self.topology
            .content_order
            .insert(part_handle, content_order);
        Ok(())
    }

    fn import_extensions(
        &mut self,
        document: &'a ScoreDocumentV1,
    ) -> Result<(), LiveStoreBuildFailure> {
        for extension in &document.extensions {
            if let ExtensionOwnerV1::Part { part_id } = &extension.owner
                && !self.part_handles.contains_key(part_id)
            {
                return Err(LiveStoreBuildFailure::MissingPartReference);
            }
            let handle = self.extensions.insert(ExtensionRecord {
                namespace: extension.namespace.clone(),
                schema_version: extension.schema_version,
                owner: extension.owner.clone(),
                payload: extension.payload.clone(),
            });
            self.topology.extension_order.push(handle);
        }
        Ok(())
    }

    fn ensure_identity_available(&self, id: &StableId) -> Result<(), LiveStoreBuildFailure> {
        if self.entity_refs.contains_key(id) {
            Err(LiveStoreBuildFailure::DuplicateStableId)
        } else {
            Ok(())
        }
    }

    fn finish(self) -> Result<LiveScoreStore, LiveStoreBuildFailure> {
        self.check_local_invariants()?;
        Ok(LiveScoreStore {
            header: self.header,
            measures: self.measures,
            parts: self.parts,
            staffs: self.staffs,
            voices: self.voices,
            events: self.events,
            notes: self.notes,
            extensions: self.extensions,
            topology: self.topology,
        })
    }

    fn check_local_invariants(&self) -> Result<(), LiveStoreBuildFailure> {
        check_root_order(
            &self.topology.measure_order,
            &self.measures,
            self.counts.measures,
            self.policy,
        )?;
        check_root_order(
            &self.topology.part_order,
            &self.parts,
            self.counts.parts,
            self.policy,
        )?;

        let mut seen_staffs = HashSet::new();
        let mut seen_voices = HashSet::new();
        let mut seen_events = HashSet::new();
        let mut seen_notes = HashSet::new();
        self.policy.hash_set(&mut seen_staffs, self.counts.staffs)?;
        self.policy.hash_set(&mut seen_voices, self.counts.voices)?;
        self.policy.hash_set(&mut seen_events, self.counts.events)?;
        self.policy.hash_set(&mut seen_notes, self.counts.notes)?;

        let mut content_count = 0_usize;
        for part in &self.topology.part_order {
            let staff_order = self
                .topology
                .staff_order
                .get(part)
                .ok_or(local(StoreInvariantFailure::MissingRecord))?;
            for staff in staff_order {
                if self.staffs.get(*staff).is_none() {
                    return Err(local(StoreInvariantFailure::MissingRecord));
                }
                if !seen_staffs.insert(*staff) {
                    return Err(local(StoreInvariantFailure::DuplicateSemanticPosition));
                }
            }

            let content_order = self
                .topology
                .content_order
                .get(part)
                .ok_or(local(StoreInvariantFailure::MissingRecord))?;
            if content_order.len() != self.topology.measure_order.len() {
                return Err(local(StoreInvariantFailure::CoverageMismatch));
            }
            let mut covered_measures = HashSet::new();
            self.policy
                .hash_set(&mut covered_measures, self.counts.measures)?;
            for measure in content_order {
                if self.measures.get(*measure).is_none() || !covered_measures.insert(*measure) {
                    return Err(local(StoreInvariantFailure::CoverageMismatch));
                }
                let key = PartMeasureKey {
                    part: *part,
                    measure: *measure,
                };
                let content = self
                    .topology
                    .contents
                    .get(&key)
                    .ok_or(local(StoreInvariantFailure::MissingRecord))?;
                if content.part != *part || content.measure != *measure {
                    return Err(local(StoreInvariantFailure::ContentRecordMismatch));
                }
                content_count = checked_add(content_count, 1)?;
                let voices = self
                    .topology
                    .voice_order
                    .get(&key)
                    .ok_or(local(StoreInvariantFailure::MissingRecord))?;
                for voice in voices {
                    if self.voices.get(*voice).is_none() {
                        return Err(local(StoreInvariantFailure::MissingRecord));
                    }
                    if !seen_voices.insert(*voice) {
                        return Err(local(StoreInvariantFailure::DuplicateSemanticPosition));
                    }
                    let events = self
                        .topology
                        .event_order
                        .get(voice)
                        .ok_or(local(StoreInvariantFailure::MissingRecord))?;
                    for event in events {
                        let event_record = self
                            .events
                            .get(*event)
                            .ok_or(local(StoreInvariantFailure::MissingRecord))?;
                        if !seen_events.insert(*event) {
                            return Err(local(StoreInvariantFailure::DuplicateSemanticPosition));
                        }
                        let notes = self
                            .topology
                            .note_order
                            .get(event)
                            .ok_or(local(StoreInvariantFailure::MissingRecord))?;
                        if matches!(event_record.content_kind, EventContentKind::Rest)
                            && !notes.is_empty()
                        {
                            return Err(local(StoreInvariantFailure::ContentRecordMismatch));
                        }
                        if matches!(event_record.content_kind, EventContentKind::Notes)
                            && notes.is_empty()
                        {
                            return Err(local(StoreInvariantFailure::ContentRecordMismatch));
                        }
                        for note in notes {
                            if self.notes.get(*note).is_none() {
                                return Err(local(StoreInvariantFailure::MissingRecord));
                            }
                            if !seen_notes.insert(*note) {
                                return Err(local(
                                    StoreInvariantFailure::DuplicateSemanticPosition,
                                ));
                            }
                        }
                    }
                }
            }
        }

        check_count(seen_staffs.len(), self.counts.staffs)?;
        check_count(seen_voices.len(), self.counts.voices)?;
        check_count(seen_events.len(), self.counts.events)?;
        check_count(seen_notes.len(), self.counts.notes)?;
        check_count(content_count, self.counts.contents)?;
        check_count(self.topology.staff_order.len(), self.counts.parts)?;
        check_count(self.topology.content_order.len(), self.counts.parts)?;
        check_count(self.topology.contents.len(), self.counts.contents)?;
        check_count(self.topology.voice_order.len(), self.counts.contents)?;
        check_count(self.topology.event_order.len(), self.counts.voices)?;
        check_count(self.topology.note_order.len(), self.counts.events)?;
        check_count(self.entity_refs.len(), self.counts.entity_ids)?;

        check_root_order(
            &self.topology.extension_order,
            &self.extensions,
            self.counts.extensions,
            self.policy,
        )
    }
}

fn check_root_order<K, V>(
    order: &[K],
    records: &SlotMap<K, V>,
    expected: usize,
    policy: ReservationPolicy,
) -> Result<(), LiveStoreBuildFailure>
where
    K: Key + Eq + Hash,
{
    if order.len() != expected || records.len() != expected {
        return Err(local(StoreInvariantFailure::CountMismatch));
    }
    let mut seen = HashSet::new();
    policy.hash_set(&mut seen, expected)?;
    for handle in order {
        if records.get(*handle).is_none() {
            return Err(local(StoreInvariantFailure::MissingRecord));
        }
        if !seen.insert(*handle) {
            return Err(local(StoreInvariantFailure::DuplicateSemanticPosition));
        }
    }
    Ok(())
}

fn check_count(actual: usize, expected: usize) -> Result<(), LiveStoreBuildFailure> {
    if actual == expected {
        Ok(())
    } else {
        Err(local(StoreInvariantFailure::CountMismatch))
    }
}

const fn local(failure: StoreInvariantFailure) -> LiveStoreBuildFailure {
    LiveStoreBuildFailure::LocalInvariant(failure)
}

#[cfg(test)]
mod tests {
    use std::{any::TypeId, collections::HashSet};

    use brilliant_kernel_contracts::decode_create_request;

    use super::*;

    const STORE_REQUEST: &str = r#"{"apiVersion":1,"document":{"schemaVersion":"brilliant-score-1","id":"score-root","metadata":{"title":"Store","authors":["Brilliant"],"tempo":{"bpm":120}},"measureDefinitions":[{"id":"measure-z","meter":{"numerator":4,"denominator":4}},{"id":"measure-a","meter":{"numerator":4,"denominator":4}}],"parts":[{"id":"part-z","name":"Part","instrument":{"name":"Piano","writtenToSounding":{"diatonicSteps":0,"chromaticSemitones":0}},"staves":[{"id":"staff-z","lineCount":5,"defaultClef":{"sign":"G","line":2}},{"id":"staff-a","lineCount":5,"defaultClef":{"sign":"F","line":4}}],"measureContents":[{"measureId":"measure-a","voices":[{"id":"voice-a","defaultStaffId":"staff-a","sequence":{"start":{"numerator":0,"denominator":1},"events":[{"id":"event-a","duration":{"base":1,"dots":0},"staffId":"staff-a","content":{"kind":"notes","notes":[{"id":"note-a","writtenPitch":{"step":"C","alter":0,"octave":4}}]}}]}}]},{"measureId":"measure-z","voices":[{"id":"voice-z","defaultStaffId":"staff-z","sequence":{"start":{"numerator":0,"denominator":1},"events":[{"id":"event-z","duration":{"base":1,"dots":0},"content":{"kind":"rest"}}]}}]}]}],"extensions":[{"namespace":"example.score","schemaVersion":1,"owner":{"kind":"score"},"payload":{"z":1}},{"namespace":"example.second","schemaVersion":2,"owner":{"kind":"score"},"payload":{"a":[true,null]}}]}}"#;

    fn fixture() -> ScoreDocumentV1 {
        decode_create_request(STORE_REQUEST.as_bytes())
            .expect("valid Stage 2 document")
            .document
    }

    fn ids_for_order<K: Key, V>(
        order: &[K],
        records: &SlotMap<K, V>,
        id: impl Fn(&V) -> &StableId,
    ) -> Vec<String> {
        order
            .iter()
            .map(|handle| {
                id(records.get(*handle).expect("live typed handle"))
                    .as_str()
                    .to_owned()
            })
            .collect()
    }

    #[test]
    fn store_build_registers_document_root_before_all_entities_and_publishes_atomically() {
        let document = fixture();
        let counts = StoreCounts::checked(&document).expect("checked counts");
        assert_eq!(counts.entity_ids, 11);
        let mut builder =
            LiveScoreStoreBuilder::prepare(&document, counts, ReservationPolicy::production())
                .expect("reserved builder");
        builder.import(&document).expect("canonical import");
        assert_eq!(
            builder.entity_refs.get(&document.id),
            Some(&RuntimeEntityRef::Document)
        );
        assert_eq!(builder.entity_refs.len(), counts.entity_ids);
        let store = builder.finish().expect("publishable store");
        assert_eq!(store.header.id.as_str(), "score-root");
        assert_eq!(store.measures.len(), 2);
        assert_eq!(store.parts.len(), 1);
        assert_eq!(store.staffs.len(), 2);
        assert_eq!(store.voices.len(), 2);
        assert_eq!(store.events.len(), 2);
        assert_eq!(store.notes.len(), 1);
        assert_eq!(store.extensions.len(), 2);
    }

    #[test]
    fn topology_preserves_canonical_dto_order_and_exact_part_measure_coverage() {
        let store = build_live_score_store(&fixture()).expect("store");
        assert_eq!(
            ids_for_order(&store.topology.measure_order, &store.measures, |record| {
                &record.id
            }),
            ["measure-z", "measure-a"]
        );
        assert_eq!(
            ids_for_order(&store.topology.part_order, &store.parts, |record| &record
                .id),
            ["part-z"]
        );
        let part = store.topology.part_order[0];
        assert_eq!(
            ids_for_order(
                store.topology.staff_order.get(&part).expect("staff order"),
                &store.staffs,
                |record| &record.id,
            ),
            ["staff-z", "staff-a"]
        );
        assert_eq!(
            ids_for_order(
                store
                    .topology
                    .content_order
                    .get(&part)
                    .expect("content order"),
                &store.measures,
                |record| &record.id,
            ),
            ["measure-a", "measure-z"]
        );
        assert_eq!(store.topology.contents.len(), 2);
        for measure in &store.topology.measure_order {
            let key = PartMeasureKey {
                part,
                measure: *measure,
            };
            assert_eq!(
                store.topology.contents.get(&key),
                Some(&PartMeasureContentRecord {
                    part,
                    measure: *measure,
                })
            );
        }
    }

    #[test]
    fn every_typed_record_resolves_once_without_retaining_the_document_tree() {
        let mut document = fixture();
        let store = build_live_score_store(&document).expect("store");
        let source = include_str!("store.rs");
        let declaration = source
            .split("pub(crate) struct LiveScoreStore {")
            .nth(1)
            .expect("store declaration")
            .split("}\n\n")
            .next()
            .expect("store fields");
        assert!(!declaration.contains("ScoreDocumentV1"));

        document.id = StableId::new("mutated-source").expect("id");
        document.measure_definitions.clear();
        document.parts.clear();
        document.extensions.clear();
        assert_eq!(store.header.id.as_str(), "score-root");
        assert_eq!(store.topology.measure_order.len(), 2);
        assert_eq!(store.topology.part_order.len(), 1);
        assert_eq!(store.topology.extension_order.len(), 2);
    }

    #[test]
    fn stale_generation_is_rejected_and_key_types_are_nominally_distinct() {
        let mut store = build_live_score_store(&fixture()).expect("store");
        let part = store.topology.part_order[0];
        let measure = store.topology.content_order[&part][0];
        let content = PartMeasureKey { part, measure };
        let voice = store.topology.voice_order[&content][0];
        let event = store.topology.event_order[&voice][0];
        let old_note = store
            .topology
            .note_order
            .get(&event)
            .and_then(|notes| notes.first())
            .copied()
            .expect("note");
        let record = store.notes.remove(old_note).expect("remove live note");
        let new_note = store.notes.insert(record);
        assert_ne!(old_note, new_note);
        assert!(store.notes.get(old_note).is_none());
        assert!(store.notes.get(new_note).is_some());

        let type_ids = HashSet::from([
            TypeId::of::<MeasureHandle>(),
            TypeId::of::<PartHandle>(),
            TypeId::of::<StaffHandle>(),
            TypeId::of::<VoiceHandle>(),
            TypeId::of::<EventHandle>(),
            TypeId::of::<NoteHandle>(),
            TypeId::of::<ExtensionHandle>(),
        ]);
        assert_eq!(type_ids.len(), 7);
    }

    #[test]
    fn runtime_reserve_fault_returns_internal_capacity_without_store_publication() {
        let document = fixture();
        let result = build_live_score_store_with_policy(&document, ReservationPolicy::fail_all());
        assert!(matches!(
            result,
            Err(LiveStoreBuildFailure::InternalCapacity)
        ));
    }
}
