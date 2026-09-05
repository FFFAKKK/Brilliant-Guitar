import assert = require("node:assert/strict");
import { resolve } from "node:path";
import { test } from "node:test";
import { CommandBus, type ScoreDocument } from "../../../src/core-kernel/index";
import { createRustKernelSmokeSession, createRustKernelStage4Session, replayRustKernelStage4, type RustKernelStage4CompleteNativeAddon } from "../../../src/core-kernel/native/rust-kernel-smoke";
import { createCoreScoreFixture } from "../fixtures/core-score";

const addon = require(resolve("target/rkp-1-node/brilliant_kernel_node.node")) as RustKernelStage4CompleteNativeAddon;
const plain = (value: unknown): unknown => JSON.parse(JSON.stringify(value));
const instrument = (diatonicSteps: number, chromaticSemitones: number, partId = "part-1") => ({
  commandVersion: 1, commandId: "core.part.set-instrument", target: { kind: "part", partId },
  payload: { instrument: { name: "Instrument", writtenToSounding: { diatonicSteps, chromaticSemitones } } },
});
const pitch = (octave: number, noteId = "note-1") => ({
  commandVersion: 1, commandId: "core.note.set-written-pitch", target: { kind: "note", noteId },
  payload: { writtenPitch: { step: "C", alter: 0, octave } },
});
const batch = (commands: readonly unknown[]) => ({
  commandVersion: 1, commandId: "core.transaction.batch", target: { kind: "document", documentId: "score-1" }, payload: { commands },
});

function fixture(document = createCoreScoreFixture()) {
  const created = createRustKernelSmokeSession(addon, document);
  if (!("handle" in created)) throw new Error("native create required");
  const session = createRustKernelStage4Session(addon, created.handle);
  const oracle = CommandBus.create(document);
  if (!oracle.ok) throw new Error("TS oracle required");
  const read = () => {
    const value = session.read();
    if (value.status !== "ok") throw new Error("native read required");
    return value.value;
  };
  return { document, session, ts: oracle.value, read };
}

test("part transposition rejects all invalid derived pitches with exact ordered TS diagnostics", () => {
  for (const [diatonic, chromatic] of [[100, 0], [0, 100], [Number.MAX_SAFE_INTEGER, 0], [0, Number.MAX_SAFE_INTEGER]]) {
    const { session, ts, read } = fixture();
    const before = read();
    const command = instrument(diatonic!, chromatic!);
    const expected = ts.submit(command);
    const result = session.submit(command);
    assert.equal(result.status, "command-rejected");
    if (result.status !== "command-rejected" || expected.status !== "rejected") throw new Error("semantic rejection required");
    assert.deepEqual(plain(result.failure), plain(expected.failure));
    assert.equal(result.value.documentVersion, 0);
    assert.deepEqual(result.events, []);
    const after = read();
    assert.strictEqual(after.snapshot, before.snapshot);
    assert.deepEqual(after.history, before.history);
    assert.equal(after.dirty, before.dirty);
  }
});

test("a changed note uses its owner's final instrument and final batch state", () => {
  const base = createCoreScoreFixture();
  const document: ScoreDocument = { ...base, parts: base.parts.map((part) => ({ ...part, instrument: instrument(7, 12).payload.instrument })) };
  const { session, ts, read } = fixture(document);
  const invalid = pitch(8);
  const expected = ts.submit(invalid);
  const rejected = session.submit(invalid);
  if (rejected.status !== "command-rejected" || expected.status !== "rejected") throw new Error("derived octave rejection required");
  assert.deepEqual(plain(rejected.failure), plain(expected.failure));
  const valid = batch([pitch(8), instrument(0, 0)]);
  assert.equal(ts.submit(valid).status, "committed");
  assert.equal(session.submit(valid).status, "committed");
  const final = read().snapshot.document;
  assert.equal(session.undo().status, "committed");
  assert.deepEqual(plain(read().snapshot.document), plain(document));
  assert.equal(session.redo().status, "committed");
  assert.deepEqual(plain(read().snapshot.document), plain(final));
  const replayed = replayRustKernelStage4(addon, document, [valid]);
  if (replayed.status !== "replayed") throw new Error("valid batch replay required");
  assert.deepEqual(plain(replayed.finalDocument), plain(final));
});

test("metadata and derived-pitch errors aggregate in document order, not command order", () => {
  const { session, ts, document, read } = fixture();
  const tempo = { commandVersion: 1, commandId: "core.document.set-metadata", target: { kind: "document", documentId: document.id }, payload: { metadata: { ...document.metadata, tempo: { bpm: 0 } } } };
  const command = batch([instrument(100, 0), tempo]);
  const expected = ts.submit(command);
  const before = read();
  const rejected = session.submit(command);
  if (expected.status !== "rejected" || rejected.status !== "command-rejected") throw new Error("aggregate rejection required");
  assert.deepEqual(plain(rejected.failure), plain(expected.failure));
  assert.strictEqual(read().snapshot, before.snapshot);
});

function scoreWithNotes(notesPerChord: number, partCount = 1, voiceCount = 1): ScoreDocument {
  const document = createCoreScoreFixture();
  const sourcePart = document.parts[0]!;
  const sourceContent = sourcePart.measureContents[0]!;
  const sourceVoice = sourceContent.voices[0]!;
  return {
    ...document,
    parts: Array.from({ length: partCount }, (_, part) => ({
      ...sourcePart, id: `part-${part}`,
      staves: sourcePart.staves.map((staff) => ({ ...staff, id: `staff-${part}` })),
      measureContents: [{ ...sourceContent, voices: Array.from({ length: voiceCount }, (_, voice) => ({
        ...sourceVoice, id: `voice-${part}-${voice}`, defaultStaffId: `staff-${part}`,
        sequence: { ...sourceVoice.sequence, events: sourceVoice.sequence.events.map((event, index) => ({
          ...event, id: `event-${part}-${voice}-${index}`,
          content: index === 0 ? { kind: "notes" as const, notes: Array.from({ length: notesPerChord }, (_, note) => ({
            id: `note-${part}-${voice}-${note}`, writtenPitch: { step: "C" as const, alter: 0, octave: 4 },
          })) } : { kind: "rest" as const },
        })) },
      })) }],
    })),
  };
}

test("pitch work follows affected notes and parts, with constant local-note dependency reads", () => {
  for (const [partCount, noteCount] of [[1, 1], [64, 1], [1, 1024], [64, 16]] as const) {
    const { session } = fixture(scoreWithNotes(noteCount, partCount));
    const renamed = session.submit(instrument(0, 0, "part-0"));
    if (renamed.status !== "committed") throw new Error("instrument rename required");
    assert.equal(renamed.value.metrics.semanticRulesEvaluated, 0);
    const changed = session.submit(pitch(5, "note-0-0-0"));
    if (changed.status !== "committed") throw new Error("note commit required");
    assert.equal(changed.value.metrics.semanticRulesEvaluated, 2);
    assert.equal(changed.value.metrics.semanticDependencyReads, 5);
    const transposed = session.submit(instrument(7, 12, "part-0"));
    if (transposed.status !== "committed") throw new Error("part transpose required");
    assert.equal(transposed.value.metrics.semanticRulesEvaluated, noteCount * 2);
    assert.ok(transposed.value.metrics.semanticDependencyReads <= noteCount * 6 + 32);
    for (const result of [changed, transposed]) {
      assert.equal(result.value.metrics.fullDocumentScans, 0);
      assert.equal(result.value.metrics.fullSemanticValidations, 0);
      assert.equal(result.value.metrics.fullSnapshotMaterializations, 0);
    }
  }
});

test("pitch diagnostics use final numeric Part and Voice positions after batch moves", () => {
  const { document, session, ts, read } = fixture(scoreWithNotes(12, 12, 2));
  const commands = [
    ...document.parts.slice().reverse().map((part) => instrument(100, 0, part.id)),
    { commandVersion: 1, commandId: "core.part.move", target: { kind: "part", partId: "part-10" }, payload: { anchor: { kind: "start" } } },
    { commandVersion: 1, commandId: "core.voice.move", target: { kind: "voice", voiceId: "voice-2-1" }, payload: { anchor: { kind: "start" } } },
  ];
  const command = batch(commands);
  const expected = ts.submit(command);
  const before = read();
  const result = session.submit(command);
  if (result.status !== "command-rejected" || expected.status !== "rejected") throw new Error("moved candidate rejection required");
  assert.deepEqual(plain(result.failure), plain(expected.failure));
  assert.equal(result.failure.code, "command.semantic-invalid");
  assert.equal((result.failure.diagnostics as readonly unknown[]).length, 288);
  assert.strictEqual(read().snapshot, before.snapshot);
});

const removeEvent = (eventId: string) => ({ commandVersion: 1, commandId: "core.event.remove", target: { kind: "event", eventId }, payload: {} });
const insertEvent = (voiceId: string, eventId: string, noteId: string, octave: number) => ({
  commandVersion: 1, commandId: "core.voice.insert-notes-event", target: { kind: "voice", voiceId },
  payload: { anchor: { kind: "start" }, event: { id: eventId, duration: { base: 4, dots: 0 }, content: { kind: "notes", notes: [{ id: noteId, writtenPitch: { step: "C", alter: 0, octave } }] } } },
});

test("final instrument restoration and removal of offending notes cancel obsolete pitch obligations", () => {
  for (const command of [batch([instrument(100, 0), instrument(0, 0)]), batch([instrument(100, 0), removeEvent("event-1")])]) {
    const { session, ts, document, read } = fixture();
    assert.equal(ts.submit(command).status, "committed");
    const result = session.submit(command);
    if (result.status !== "committed") throw new Error("final-state commit required");
    assert.equal(result.value.metrics.semanticRulesEvaluated, 0);
    const final = read().snapshot.document;
    assert.equal(session.undo().status, "committed");
    assert.deepEqual(plain(read().snapshot.document), plain(document));
    assert.equal(session.redo().status, "committed");
    assert.deepEqual(plain(read().snapshot.document), plain(final));
  }
});

test("same-ID deletion and reinsertion evaluates the final pitch and new Part owner", () => {
  for (const destination of ["voice-0-0", "voice-1-0"]) {
    for (const octave of [3, 8]) {
      const base = scoreWithNotes(1, 2);
      const document = { ...base, parts: base.parts.map((part) => ({
        ...part,
        instrument: part.id === "part-0" && destination === "voice-1-0"
          ? instrument(0, 0).payload.instrument : instrument(7, 12).payload.instrument,
      })) };
      const { session, ts, read } = fixture(document);
      const commands = [pitch(8, "note-0-0-0"), removeEvent("event-0-0-0")];
      if (destination !== "voice-0-0") commands.push(removeEvent("event-1-0-3"));
      const command = batch([...commands, insertEvent(destination, "event-0-0-0", "note-0-0-0", octave)]);
      const before = read();
      const expected = ts.submit(command);
      const result = session.submit(command);
      if (octave === 8) {
        if (expected.status !== "rejected" || result.status !== "command-rejected") throw new Error("new owner rejection required");
        assert.deepEqual(plain(result.failure), plain(expected.failure));
        assert.strictEqual(read().snapshot, before.snapshot);
      } else {
        assert.equal(expected.status, "committed");
        if (result.status !== "committed") throw new Error(`same-ID commit required: ${JSON.stringify(result)}`);
        assert.equal(result.value.metrics.semanticRulesEvaluated, 2);
        const final = read().snapshot.document;
        assert.equal(session.undo().status, "committed");
        assert.deepEqual(plain(read().snapshot.document), plain(document));
        assert.equal(session.redo().status, "committed");
        assert.deepEqual(plain(read().snapshot.document), plain(final));
        const replayed = replayRustKernelStage4(addon, document, [command]);
        if (replayed.status !== "replayed") throw new Error("same-ID replay required");
        assert.deepEqual(plain(replayed.finalDocument), plain(final));
      }
    }
  }
});

test("Core diagnostic overflow is an atomic mechanism failure across metadata and pitch", () => {
  for (const tempoError of [false, true]) {
    for (const count of [4096, 4097]) {
      const { session, document, read } = fixture(scoreWithNotes(count - Number(tempoError)));
      const commands: unknown[] = [instrument(100, 0, "part-0")];
      if (tempoError) commands.push({ commandVersion: 1, commandId: "core.document.set-metadata", target: { kind: "document", documentId: document.id }, payload: { metadata: { ...document.metadata, tempo: { bpm: 0 } } } });
      const before = read();
      const rejected = session.submit(batch(commands));
      if (rejected.status !== "command-rejected") throw new Error("budget rejection required");
      if (count === 4096) {
        assert.equal(rejected.failure.code, "command.semantic-invalid");
        const diagnostics = rejected.failure.diagnostics as readonly { code: string }[];
        assert.equal(diagnostics.length, 4096);
        assert.equal(diagnostics[0]?.code, tempoError ? "semantic.tempo-invalid" : "semantic.sounding-pitch-invalid");
        // Grouped path resolution is linear in chord size, not errors squared.
        assert.ok(rejected.value.metrics.semanticDependencyReads < count * 7 + 64);
      } else {
        assert.deepEqual(plain(rejected.failure), { code: "command.resource-limit-exceeded", limitKind: "diagnostics", limit: 4096, actual: 4097 });
      }
      assert.deepEqual(rejected.events, []);
      const after = read();
      assert.strictEqual(after.snapshot, before.snapshot);
      assert.deepEqual(after.history, before.history);
      assert.equal(after.dirty, before.dirty);
    }
  }
});

test("seeded final pitch and transposition batches match the independent TS runtime", () => {
  let seed = 0x6c428a31;
  const next = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed >>> 0; };
  for (let index = 0; index < 128; index += 1) {
    const { session, ts, read, document } = fixture();
    const transpose = instrument(next() % 29 - 14, next() % 49 - 24);
    const note = pitch(next() % 9);
    const command = batch(index % 2 === 0 ? [note, transpose] : [transpose, note]);
    const expected = ts.submit(command);
    const result = session.submit(command);
    if (expected.status === "rejected") {
      if (result.status !== "command-rejected") throw new Error(`seeded case ${index} must reject`);
      assert.deepEqual(plain(result.failure), plain(expected.failure), `case ${index}`);
      assert.deepEqual(plain(read().snapshot.document), plain(document));
    } else {
      assert.equal(result.status, expected.status, `case ${index}`);
      const oracle = ts.read();
      if (!oracle.ok) throw new Error("oracle read required");
      assert.deepEqual(plain(read().snapshot.document), plain(oracle.value.snapshot.document), `case ${index}`);
    }
  }
});
