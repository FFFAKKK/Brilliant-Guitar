use std::collections::HashSet;

use super::*;
use brilliant_kernel_contracts::{
    AffectedEntityAddressV1, KernelStage3CommandFailureV1, decode_admission_submit_request,
};
use brilliant_score_foundation::{RhythmicContentV1, canonical_score_bytes};

const INSERT: &str = r#"{"commandVersion":1,"commandId":"core.part.insert","target":{"kind":"document","documentId":"score-root"},"payload":{"anchor":{"kind":"start"},"part":{"id":"temporary","name":"Temporary","instrument":{"name":"Piano","writtenToSounding":{"diatonicSteps":0,"chromaticSemitones":0}},"staves":[{"id":"","lineCount":5,"defaultClef":{"sign":"G","line":2}}],"measureContents":[{"measureId":"measure-z","voices":[{"id":"temporary-z","defaultStaffId":"","sequence":{"start":{"numerator":0,"denominator":1},"events":[]}}]},{"measureId":"measure-a","voices":[{"id":"temporary-a","defaultStaffId":"","sequence":{"start":{"numerator":0,"denominator":1},"events":[]}}]}]}}}"#;
const REMOVE: &str = r#"{"commandVersion":1,"commandId":"core.part.remove","target":{"kind":"part","partId":"temporary"},"payload":{}}"#;
const MISSING: &str = r#"{"commandVersion":1,"commandId":"core.part.set-name","target":{"kind":"part","partId":"missing"},"payload":{"name":"Missing"}}"#;
const PITCH_C: &str = r#"{"commandVersion":1,"commandId":"core.note.set-written-pitch","target":{"kind":"note","noteId":"note-a"},"payload":{"writtenPitch":{"step":"C","alter":0,"octave":4}}}"#;
const PITCH_D: &str = r#"{"commandVersion":1,"commandId":"core.note.set-written-pitch","target":{"kind":"note","noteId":"note-a"},"payload":{"writtenPitch":{"step":"D","alter":0,"octave":4}}}"#;
const PITCH_E: &str = r#"{"commandVersion":1,"commandId":"core.note.set-written-pitch","target":{"kind":"note","noteId":"note-a"},"payload":{"writtenPitch":{"step":"E","alter":0,"octave":4}}}"#;

const STEPS_PER_SEED: usize = 512;
const SEEDS: [u64; 4] = [
    0x5eed_0000_0000_0001,
    0x5eed_1234_5678_9abc,
    0xa11c_e5ed_dead_beef,
    0xffff_ffff_0000_0001,
];

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum PitchChoice {
    C,
    D,
    E,
}

impl PitchChoice {
    fn value(self) -> WrittenPitchV1 {
        WrittenPitchV1 {
            step: match self {
                Self::C => PitchStepV1::C,
                Self::D => PitchStepV1::D,
                Self::E => PitchStepV1::E,
            },
            alter: SafeInteger::new(0).expect("zero alter"),
            octave: SafeInteger::new(4).expect("octave"),
        }
    }

    const fn wire(self) -> &'static str {
        match self {
            Self::C => PITCH_C,
            Self::D => PITCH_D,
            Self::E => PITCH_E,
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum BatchMutation {
    NetZero,
    PrefixPitch(PitchChoice),
    SuffixPitch(PitchChoice),
}

#[derive(Clone, Debug, Eq, PartialEq)]
enum Mutation {
    Pitch(PitchChoice),
    Title(JsString),
    Batch(BatchMutation),
}

impl Mutation {
    const fn always_commits(&self) -> bool {
        matches!(self, Self::Batch(_))
    }

    fn expected_document(&self, current: &ScoreDocumentV1) -> ScoreDocumentV1 {
        let mut expected = current.clone();
        match self {
            Self::Pitch(choice) => set_note_pitch(&mut expected, choice.value()),
            Self::Title(title) => expected.metadata.title = title.clone(),
            Self::Batch(BatchMutation::NetZero) => {}
            Self::Batch(BatchMutation::PrefixPitch(choice))
            | Self::Batch(BatchMutation::SuffixPitch(choice)) => {
                set_note_pitch(&mut expected, choice.value());
            }
        }
        expected
    }

    fn expected_affected(&self) -> Option<Vec<AffectedEntityAddressV1>> {
        match self {
            Self::Pitch(_) => Some(vec![ScoreEntityTargetV1::Note {
                note_id: StableId::new("note-a").expect("note id").into(),
            }]),
            Self::Title(_) => Some(vec![ScoreEntityTargetV1::Document {
                document_id: StableId::new("score-root").expect("document id").into(),
            }]),
            Self::Batch(_) => None,
        }
    }
}

#[derive(Debug)]
struct Model {
    states: Vec<ScoreDocumentV1>,
    commands: Vec<Mutation>,
    cursor: usize,
}

impl Model {
    fn new(initial: ScoreDocumentV1) -> Self {
        Self {
            states: vec![initial],
            commands: Vec::new(),
            cursor: 0,
        }
    }

    fn current(&self) -> &ScoreDocumentV1 {
        &self.states[self.cursor]
    }

    fn commit(&mut self, mutation: Mutation, document: ScoreDocumentV1) {
        self.states.truncate(self.cursor + 1);
        self.commands.truncate(self.cursor);
        self.states.push(document);
        self.commands.push(mutation);
        self.cursor += 1;
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct RuntimeFingerprint {
    document: ScoreDocumentV1,
    document_version: DocumentVersionV1,
    history: KernelHistoryStateV1,
    committed_metrics: KernelStage3MetricsV1,
    checkpoint: crate::checkpoint::CheckpointObservationV1,
    projection: crate::session_projection::SessionProjectionObservationV1,
}

#[derive(Clone, Copy)]
struct XorShift64(u64);

impl XorShift64 {
    fn next(&mut self) -> u64 {
        let mut value = self.0;
        value ^= value << 13;
        value ^= value >> 7;
        value ^= value << 17;
        self.0 = value;
        value
    }
}

#[test]
fn seeded_effect_batch_history_state_machine_matches_independent_model() {
    for seed in SEEDS {
        run_seed(seed);
    }
}

fn run_seed(seed: u64) {
    let initial = crate::store::tests::fixture();
    let mut runtime = KernelRuntime::create(initial.clone()).expect("runtime");
    let mut model = Model::new(initial.clone());
    let mut random = XorShift64(seed);
    let mut committed = 0_usize;
    let mut no_ops = 0_usize;
    let mut rejected = 0_usize;

    for step in 0..STEPS_PER_SEED {
        let action = random.next() % 12;
        match action {
            0 => apply_model_mutation(
                &mut runtime,
                &mut model,
                Mutation::Pitch(PitchChoice::C),
                seed,
                step,
                &mut committed,
                &mut no_ops,
            ),
            1 => apply_model_mutation(
                &mut runtime,
                &mut model,
                Mutation::Pitch(PitchChoice::D),
                seed,
                step,
                &mut committed,
                &mut no_ops,
            ),
            2 => apply_model_mutation(
                &mut runtime,
                &mut model,
                Mutation::Pitch(PitchChoice::E),
                seed,
                step,
                &mut committed,
                &mut no_ops,
            ),
            3 => apply_model_mutation(
                &mut runtime,
                &mut model,
                Mutation::Title(format!("property-title-{}", random.next() % 5).into()),
                seed,
                step,
                &mut committed,
                &mut no_ops,
            ),
            4 => apply_model_mutation(
                &mut runtime,
                &mut model,
                Mutation::Batch(BatchMutation::NetZero),
                seed,
                step,
                &mut committed,
                &mut no_ops,
            ),
            5 => apply_model_mutation(
                &mut runtime,
                &mut model,
                Mutation::Batch(BatchMutation::PrefixPitch(random_pitch(&mut random))),
                seed,
                step,
                &mut committed,
                &mut no_ops,
            ),
            6 => apply_model_mutation(
                &mut runtime,
                &mut model,
                Mutation::Batch(BatchMutation::SuffixPitch(random_pitch(&mut random))),
                seed,
                step,
                &mut committed,
                &mut no_ops,
            ),
            7 => {
                assert_rejected_batch_is_atomic(&mut runtime, &model, seed, step);
                rejected += 1;
            }
            8 => apply_undo(&mut runtime, &mut model, seed, step, &mut rejected),
            9 => apply_redo(&mut runtime, &mut model, seed, step, &mut rejected),
            10 => {
                let pitch = current_pitch(model.current());
                apply_model_mutation(
                    &mut runtime,
                    &mut model,
                    Mutation::Pitch(pitch),
                    seed,
                    step,
                    &mut committed,
                    &mut no_ops,
                );
            }
            11 => {
                let title = model.current().metadata.title.clone();
                apply_model_mutation(
                    &mut runtime,
                    &mut model,
                    Mutation::Title(title),
                    seed,
                    step,
                    &mut committed,
                    &mut no_ops,
                );
            }
            _ => unreachable!(),
        }
        assert_runtime_matches_model(&runtime, &model, seed, step);
        if step % 31 == 0 {
            assert_index_parity(&runtime, seed, step);
        }
    }

    assert!(
        committed > 100,
        "seed {seed:#x} did not commit enough steps"
    );
    assert!(no_ops > 20, "seed {seed:#x} did not exercise no-ops");
    assert!(rejected > 20, "seed {seed:#x} did not exercise rejection");
    assert_index_parity(&runtime, seed, STEPS_PER_SEED);
    replay_final_branch(&initial, &model, seed);
}

fn apply_model_mutation(
    runtime: &mut KernelRuntime,
    model: &mut Model,
    mutation: Mutation,
    seed: u64,
    step: usize,
    committed: &mut usize,
    no_ops: &mut usize,
) {
    let before = fingerprint(runtime);
    let expected = mutation.expected_document(model.current());
    let should_commit = mutation.always_commits() || expected != *model.current();
    let result = execute_mutation(runtime, &mutation);
    if should_commit {
        let value = assert_committed(result, mutation.expected_affected().as_deref(), seed, step);
        assert_eq!(
            value.document_version.get(),
            before.document_version.get() + 1,
            "seed {seed:#x} step {step}: commit version"
        );
        model.commit(mutation, expected);
        *committed += 1;
    } else {
        let KernelStage4CommandResultV1::NoOp { value } = result else {
            panic!("seed {seed:#x} step {step}: expected no-op")
        };
        assert!(value.affected.is_empty());
        assert_eq!(fingerprint(runtime), before);
        *no_ops += 1;
    }
}

fn apply_undo(
    runtime: &mut KernelRuntime,
    model: &mut Model,
    seed: u64,
    step: usize,
    rejected: &mut usize,
) {
    let before = fingerprint(runtime);
    if model.cursor == 0 {
        let result = runtime.undo();
        assert!(matches!(
            result,
            KernelStage4CommandResultV1::Rejected {
                failure: KernelStage4FailureV1::HistoryEmptyUndo,
                ..
            }
        ));
        assert_eq!(fingerprint(runtime), before);
        *rejected += 1;
        return;
    }
    let affected = runtime
        .history
        .undo_entry()
        .expect("undo entry")
        .affected
        .clone();
    let value = assert_committed(runtime.undo(), Some(&affected), seed, step);
    assert_eq!(
        value.document_version.get(),
        before.document_version.get() + 1
    );
    model.cursor -= 1;
}

fn apply_redo(
    runtime: &mut KernelRuntime,
    model: &mut Model,
    seed: u64,
    step: usize,
    rejected: &mut usize,
) {
    let before = fingerprint(runtime);
    if model.cursor == model.commands.len() {
        let result = runtime.redo();
        assert!(matches!(
            result,
            KernelStage4CommandResultV1::Rejected {
                failure: KernelStage4FailureV1::HistoryEmptyRedo,
                ..
            }
        ));
        assert_eq!(fingerprint(runtime), before);
        *rejected += 1;
        return;
    }
    let affected = runtime
        .history
        .redo_entry()
        .expect("redo entry")
        .affected
        .clone();
    let value = assert_committed(runtime.redo(), Some(&affected), seed, step);
    assert_eq!(
        value.document_version.get(),
        before.document_version.get() + 1
    );
    model.cursor += 1;
}

fn assert_rejected_batch_is_atomic(
    runtime: &mut KernelRuntime,
    model: &Model,
    seed: u64,
    step: usize,
) {
    let before = fingerprint(runtime);
    let result = submit_batch(runtime, &[PITCH_E, INSERT, MISSING]);
    assert!(matches!(
        result,
        KernelStage4CommandResultV1::Rejected {
            failure: KernelStage4FailureV1::Command(
                KernelStage3CommandFailureV1::BatchChildRejected {
                    failed_command_index: 2,
                    failure: KernelStage3CommandFailureLeafV1::TargetNotFound,
                }
            ),
            ..
        }
    ));
    assert_eq!(
        fingerprint(runtime),
        before,
        "seed {seed:#x} step {step}: rejected Batch mutated runtime"
    );
    assert_document_eq(
        &runtime.store.export_document().expect("document"),
        model.current(),
        seed,
        step,
    );
}

fn execute_mutation(
    runtime: &mut KernelRuntime,
    mutation: &Mutation,
) -> KernelStage4CommandResultV1 {
    match mutation {
        Mutation::Pitch(choice) => {
            let note_id = StableId::new("note-a").expect("note id");
            let pitch = choice.value();
            let mut transaction = runtime.begin_stage3_transaction();
            KernelEffectV1::ReplaceWrittenPitch {
                note_id: note_id.clone(),
                pitch: pitch.clone(),
            }
            .apply(&mut transaction)
            .expect("pitch effect");
            let prepared = transaction.finish().expect("prepared pitch");
            runtime
                .commit_stage4_transaction(
                    CoreCommandEnvelopeV1::NoteSetWrittenPitch {
                        target: ScoreEntityTargetV1::Note { note_id },
                        written_pitch: pitch,
                    },
                    prepared,
                )
                .expect("publish pitch")
        }
        Mutation::Title(title) => {
            let document_id = runtime.document_id().clone();
            let mut metadata = runtime.store.header.metadata.clone();
            metadata.title = title.clone();
            let mut transaction = runtime.begin_stage3_transaction();
            KernelEffectV1::SetDocumentMetadata {
                document_id: document_id.clone(),
                metadata: metadata.clone(),
            }
            .apply(&mut transaction)
            .expect("metadata effect");
            let prepared = transaction.finish().expect("prepared metadata");
            runtime
                .commit_stage4_transaction(
                    CoreCommandEnvelopeV1::DocumentSetMetadata {
                        target: ScoreEntityTargetV1::Document { document_id },
                        metadata,
                    },
                    prepared,
                )
                .expect("publish metadata")
        }
        Mutation::Batch(BatchMutation::NetZero) => submit_batch(runtime, &[INSERT, REMOVE]),
        Mutation::Batch(BatchMutation::PrefixPitch(choice)) => {
            submit_batch(runtime, &[choice.wire(), INSERT, REMOVE])
        }
        Mutation::Batch(BatchMutation::SuffixPitch(choice)) => {
            submit_batch(runtime, &[INSERT, REMOVE, choice.wire()])
        }
    }
}

fn submit_batch(runtime: &mut KernelRuntime, children: &[&str]) -> KernelStage4CommandResultV1 {
    let command = format!(
        r#"{{"commandVersion":1,"commandId":"core.transaction.batch","target":{{"kind":"document","documentId":"score-root"}},"payload":{{"commands":[{}]}}}}"#,
        children.join(",")
    );
    let wire = format!(r#"{{"apiVersion":1,"command":{command}}}"#);
    let command = decode_admission_submit_request(wire.as_bytes())
        .expect("batch decode")
        .command;
    runtime.submit_stage4_admission(command, |transaction, command| match command {
        CoreCommandEnvelopeV1::NoteSetWrittenPitch {
            target: ScoreEntityTargetV1::Note { note_id },
            written_pitch,
        } => transaction.set_note_written_pitch(note_id, written_pitch),
        _ => panic!("only pitch executes before candidate promotion"),
    })
}

fn assert_committed(
    result: KernelStage4CommandResultV1,
    expected_affected: Option<&[AffectedEntityAddressV1]>,
    seed: u64,
    step: usize,
) -> KernelStage4MutationValueV1 {
    let KernelStage4CommandResultV1::Committed { value, events } = result else {
        panic!("seed {seed:#x} step {step}: expected committed result")
    };
    assert!(!value.affected.is_empty());
    assert_unique_affected(&value.affected, seed, step);
    if let Some(expected) = expected_affected {
        assert_eq!(value.affected, expected);
    }
    let KernelEventV1::DocumentCommitted {
        affected_entities, ..
    } = &events[0]
    else {
        panic!("seed {seed:#x} step {step}: missing commit event")
    };
    assert_eq!(affected_entities, &value.affected);
    assert_eq!(value.stage4_metrics.events_emitted, events.len() as u64);
    assert_eq!(value.stage4_metrics.events_reserved, events.len() as u64);
    value
}

fn assert_unique_affected(affected: &[AffectedEntityAddressV1], seed: u64, step: usize) {
    let mut seen = HashSet::new();
    for address in affected {
        assert!(
            seen.insert(affected_key(address)),
            "seed {seed:#x} step {step}: duplicate affected address {address:?}"
        );
    }
}

fn affected_key(address: &AffectedEntityAddressV1) -> (u8, Vec<u16>) {
    match address {
        ScoreEntityTargetV1::Document { document_id } => {
            (0, document_id.as_js_string().code_units().to_vec())
        }
        ScoreEntityTargetV1::Measure { measure_id } => {
            (1, measure_id.as_js_string().code_units().to_vec())
        }
        ScoreEntityTargetV1::Part { part_id } => (2, part_id.as_js_string().code_units().to_vec()),
        ScoreEntityTargetV1::Staff { staff_id } => {
            (3, staff_id.as_js_string().code_units().to_vec())
        }
        ScoreEntityTargetV1::Voice { voice_id } => {
            (4, voice_id.as_js_string().code_units().to_vec())
        }
        ScoreEntityTargetV1::Event { event_id } => {
            (5, event_id.as_js_string().code_units().to_vec())
        }
        ScoreEntityTargetV1::Note { note_id } => (6, note_id.as_js_string().code_units().to_vec()),
    }
}

fn fingerprint(runtime: &KernelRuntime) -> RuntimeFingerprint {
    RuntimeFingerprint {
        document: runtime.store.export_document().expect("document"),
        document_version: runtime.document_version,
        history: runtime.history.projected().expect("history"),
        committed_metrics: runtime.committed_metrics,
        checkpoint: runtime.checkpoint.observation(),
        projection: runtime.projection.observation(),
    }
}

fn assert_runtime_matches_model(runtime: &KernelRuntime, model: &Model, seed: u64, step: usize) {
    let actual = runtime.store.export_document().expect("document");
    assert_document_eq(&actual, model.current(), seed, step);
    let history = runtime.history.projected().expect("history");
    assert_eq!(history.undo_depth, model.cursor as u64);
    assert_eq!(
        history.redo_depth,
        (model.commands.len() - model.cursor) as u64
    );
    let observed = runtime.history.observation();
    assert_eq!(observed.entries, model.commands.len());
    assert_eq!(observed.cursor, model.cursor);
    let identity = runtime.history.current_identity().expect("identity");
    assert_eq!(runtime.projection.dirty(identity), model.cursor != 0);
    assert_eq!(
        runtime.projection.observation().version_identities,
        runtime.document_version.get() as usize + 1
    );
}

fn assert_document_eq(
    actual: &ScoreDocumentV1,
    expected: &ScoreDocumentV1,
    seed: u64,
    step: usize,
) {
    assert_eq!(actual, expected, "seed {seed:#x} step {step}: document");
    assert_eq!(
        canonical_score_bytes(actual).expect("actual canonical bytes"),
        canonical_score_bytes(expected).expect("expected canonical bytes"),
        "seed {seed:#x} step {step}: canonical bytes"
    );
}

fn assert_index_parity(runtime: &KernelRuntime, seed: u64, step: usize) {
    let (rebuilt, _) = crate::indices::rebuild_indices_from_store(&runtime.store)
        .expect("rebuild state-machine indices");
    assert_eq!(
        crate::indices::normalized_index_projection(&runtime.store, &runtime.store.indices)
            .expect("live indices"),
        crate::indices::normalized_index_projection(&runtime.store, &rebuilt)
            .expect("rebuilt indices"),
        "seed {seed:#x} step {step}: index parity"
    );
}

fn replay_final_branch(initial: &ScoreDocumentV1, model: &Model, seed: u64) {
    let mut runtime = KernelRuntime::create(initial.clone()).expect("replay runtime");
    for (index, mutation) in model.commands.iter().enumerate() {
        assert_committed(execute_mutation(&mut runtime, mutation), None, seed, index);
        assert_document_eq(
            &runtime.store.export_document().expect("replay document"),
            &model.states[index + 1],
            seed,
            index,
        );
    }
    for cursor in (1..=model.commands.len()).rev() {
        assert_committed(runtime.undo(), None, seed, cursor);
        assert_document_eq(
            &runtime.store.export_document().expect("undo document"),
            &model.states[cursor - 1],
            seed,
            cursor,
        );
    }
    for cursor in 0..model.commands.len() {
        assert_committed(runtime.redo(), None, seed, cursor);
        assert_document_eq(
            &runtime.store.export_document().expect("redo document"),
            &model.states[cursor + 1],
            seed,
            cursor,
        );
    }
    assert_index_parity(&runtime, seed, model.commands.len());
}

fn random_pitch(random: &mut XorShift64) -> PitchChoice {
    match random.next() % 3 {
        0 => PitchChoice::C,
        1 => PitchChoice::D,
        2 => PitchChoice::E,
        _ => unreachable!(),
    }
}

fn current_pitch(document: &ScoreDocumentV1) -> PitchChoice {
    let pitch = document
        .parts
        .iter()
        .flat_map(|part| &part.measure_contents)
        .flat_map(|content| &content.voices)
        .flat_map(|voice| &voice.sequence.events)
        .filter_map(|event| match &event.content {
            RhythmicContentV1::Notes { notes } => Some(notes),
            RhythmicContentV1::Rest => None,
        })
        .flatten()
        .find(|note| note.id.as_js_string().eq_ascii("note-a"))
        .expect("note-a")
        .written_pitch
        .step;
    match pitch {
        PitchStepV1::C => PitchChoice::C,
        PitchStepV1::D => PitchChoice::D,
        PitchStepV1::E => PitchChoice::E,
        _ => panic!("state machine only writes C, D or E"),
    }
}

fn set_note_pitch(document: &mut ScoreDocumentV1, pitch: WrittenPitchV1) {
    let note = document
        .parts
        .iter_mut()
        .flat_map(|part| &mut part.measure_contents)
        .flat_map(|content| &mut content.voices)
        .flat_map(|voice| &mut voice.sequence.events)
        .filter_map(|event| match &mut event.content {
            RhythmicContentV1::Notes { notes } => Some(notes),
            RhythmicContentV1::Rest => None,
        })
        .flatten()
        .find(|note| note.id.as_js_string().eq_ascii("note-a"))
        .expect("note-a");
    note.written_pitch = pitch;
}
