import assert = require("node:assert/strict");
import { resolve } from "node:path";
import { test } from "node:test";
import { CommandBus, type ScoreDocument } from "../../../src/core-kernel/index";
import { createRustKernelSmokeSession, createRustKernelStage4Session, replayRustKernelStage4, type RustKernelStage4CompleteNativeAddon } from "../../../src/core-kernel/native/rust-kernel-smoke";
import { createCoreScoreFixture } from "../fixtures/core-score";

const addonPath = process.env.BRILLIANT_CORE_ADDON_PATH
  ?? "target/rkp-1-node/brilliant_kernel_node.node";
const addon = require(resolve(addonPath)) as RustKernelStage4CompleteNativeAddon;
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
const retiredSoundingPitchCode = "semantic.sounding-pitch-invalid";
function withoutRetiredSoundingPitchDiagnostics<T>(result: T): T | null {
  if (!result || typeof result !== "object") return result;
  const value = result as { readonly status?: unknown; readonly failure?: {
    readonly code?: unknown; readonly diagnostics?: readonly unknown[];
  } };
  if (value.status !== "rejected" || value.failure?.code !== "command.semantic-invalid"
    || !Array.isArray(value.failure.diagnostics)) return result;
  const diagnostics = value.failure.diagnostics.filter((diagnostic) => !(
    diagnostic !== null && typeof diagnostic === "object"
    && (diagnostic as { readonly code?: unknown }).code === retiredSoundingPitchCode
  ));
  if (diagnostics.length === value.failure.diagnostics.length) return result;
  if (diagnostics.length === 0) return null;
  return { ...value, failure: { ...value.failure, diagnostics } } as T;
}

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

test("part transposition tolerates derived-pitch capability limits through history", () => {
  for (const [diatonic, chromatic] of [[100, 0], [0, 100], [Number.MAX_SAFE_INTEGER, 0], [0, Number.MAX_SAFE_INTEGER]]) {
    const { session, ts, read } = fixture();
    const command = instrument(diatonic!, chromatic!);
    assert.equal(withoutRetiredSoundingPitchDiagnostics(ts.submit(command)), null);
    const result = session.submit(command);
    assert.equal(result.status, "committed");
    const final = read().snapshot.document;
    assert.equal(session.undo().status, "committed");
    assert.deepEqual(plain(read().snapshot.document), plain(createCoreScoreFixture()));
    assert.equal(session.redo().status, "committed");
    assert.deepEqual(plain(read().snapshot.document), plain(final));
  }
});

test("a changed note can enter a derived-pitch warning state and a final batch can repair it", () => {
  const base = createCoreScoreFixture();
  const document: ScoreDocument = { ...base, parts: base.parts.map((part) => ({ ...part, instrument: instrument(7, 12).payload.instrument })) };
  const { session, ts, read } = fixture(document);
  const invalid = pitch(8);
  assert.equal(withoutRetiredSoundingPitchDiagnostics(ts.submit(invalid)), null);
  assert.equal(session.submit(invalid).status, "committed");
  assert.equal(session.undo().status, "committed");
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

test("metadata remains blocking when the same batch only adds derived-pitch warnings", () => {
  const { session, ts, document, read } = fixture();
  const tempo = { commandVersion: 1, commandId: "core.document.set-metadata", target: { kind: "document", documentId: document.id }, payload: { metadata: { ...document.metadata, tempo: { bpm: 0 } } } };
  const command = batch([instrument(100, 0), tempo]);
  const expected = withoutRetiredSoundingPitchDiagnostics(ts.submit(command));
  const before = read();
  const rejected = session.submit(command);
  if (!expected || expected.status !== "rejected" || rejected.status !== "command-rejected") throw new Error("tempo rejection required");
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

test("blocking pitch work follows only changed stored notes", () => {
  for (const [partCount, noteCount] of [[1, 1], [64, 1], [1, 1024], [64, 16]] as const) {
    const { session } = fixture(scoreWithNotes(noteCount, partCount));
    const renamed = session.submit(instrument(0, 0, "part-0"));
    if (renamed.status !== "committed") throw new Error("instrument rename required");
    assert.equal(renamed.value.metrics.semanticRulesEvaluated, 0);
    const changed = session.submit(pitch(5, "note-0-0-0"));
    if (changed.status !== "committed") throw new Error("note commit required");
    assert.equal(changed.value.metrics.semanticRulesEvaluated, 1);
    assert.equal(changed.value.metrics.semanticDependencyReads, 1);
    const transposed = session.submit(instrument(7, 12, "part-0"));
    if (transposed.status !== "committed") throw new Error("part transpose required");
    assert.equal(transposed.value.metrics.semanticRulesEvaluated, 0);
    assert.equal(transposed.value.metrics.semanticDependencyReads, 0);
    for (const result of [changed, transposed]) {
      assert.equal(result.value.metrics.fullDocumentScans, 0);
      assert.equal(result.value.metrics.fullSemanticValidations, 0);
      assert.equal(result.value.metrics.fullSnapshotMaterializations, 0);
    }
  }
});

test("derived-pitch warnings do not block final Part and Voice moves", () => {
  const { document, session, ts, read } = fixture(scoreWithNotes(12, 12, 2));
  const commands = [
    ...document.parts.slice().reverse().map((part) => instrument(100, 0, part.id)),
    { commandVersion: 1, commandId: "core.part.move", target: { kind: "part", partId: "part-10" }, payload: { anchor: { kind: "start" } } },
    { commandVersion: 1, commandId: "core.voice.move", target: { kind: "voice", voiceId: "voice-2-1" }, payload: { anchor: { kind: "start" } } },
  ];
  const command = batch(commands);
  assert.equal(withoutRetiredSoundingPitchDiagnostics(ts.submit(command)), null);
  const result = session.submit(command);
  assert.equal(result.status, "committed");
  const moved = read().snapshot.document as ScoreDocument;
  assert.equal(moved.parts[0]!.id, "part-10");
  assert.equal(moved.parts[3]!.measureContents[0]!.voices[0]!.id, "voice-2-1");
});

const removeEvent = (eventId: string) => ({ commandVersion: 1, commandId: "core.event.remove", target: { kind: "event", eventId }, payload: {} });
const insertEvent = (voiceId: string, eventId: string, noteId: string, octave: number) => ({
  commandVersion: 1, commandId: "core.voice.insert-notes-event", target: { kind: "voice", voiceId },
  payload: { anchor: { kind: "start" }, event: { id: eventId, duration: { base: 4, dots: 0 }, content: { kind: "notes", notes: [{ id: noteId, writtenPitch: { step: "C", alter: 0, octave } }] } } },
});

test("final instrument restoration and removal of offending notes cancel obsolete pitch obligations", () => {
  for (const [command, expectedRules] of [[batch([instrument(100, 0), instrument(0, 0)]), 0], [batch([instrument(100, 0), removeEvent("event-1")]), 12]] as const) {
    const { session, ts, document, read } = fixture();
    assert.equal(ts.submit(command).status, "committed");
    const result = session.submit(command);
    if (result.status !== "committed") throw new Error("final-state commit required");
    // Removing the event cancels pitch work but now checks the three remaining
    // durations and their final measure bounds (12 time rules).
    assert.equal(result.value.metrics.semanticRulesEvaluated, expectedRules);
    const final = read().snapshot.document;
    assert.equal(session.undo().status, "committed");
    assert.deepEqual(plain(read().snapshot.document), plain(document));
    assert.equal(session.redo().status, "committed");
    assert.deepEqual(plain(read().snapshot.document), plain(final));
  }
});

test("same-ID deletion and reinsertion accepts final derived-pitch warnings under the new Part owner", () => {
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
      const expected = withoutRetiredSoundingPitchDiagnostics(ts.submit(command));
      const result = session.submit(command);
      if (expected !== null) assert.equal(expected.status, "committed");
      if (result.status !== "committed") throw new Error(`same-ID commit required: ${JSON.stringify(result)}`);
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
});

test("derived-pitch warnings do not consume the blocking diagnostic budget", () => {
  for (const tempoError of [false, true]) {
    for (const count of [4096, 4097]) {
      const { session, document, read } = fixture(scoreWithNotes(count - Number(tempoError)));
      const commands: unknown[] = [instrument(100, 0, "part-0")];
      if (tempoError) commands.push({ commandVersion: 1, commandId: "core.document.set-metadata", target: { kind: "document", documentId: document.id }, payload: { metadata: { ...document.metadata, tempo: { bpm: 0 } } } });
      const result = session.submit(batch(commands));
      if (tempoError) {
        if (result.status !== "command-rejected") throw new Error("tempo rejection required");
        assert.equal(result.failure.code, "command.semantic-invalid");
        const diagnostics = result.failure.diagnostics as readonly { code: string }[];
        assert.deepEqual(diagnostics.map((item) => item.code), ["semantic.tempo-invalid"]);
      } else {
        assert.equal(result.status, "committed");
        const committed = read().snapshot.document as ScoreDocument;
        assert.equal(committed.parts[0]!.instrument.writtenToSounding.diatonicSteps, 100);
      }
    }
  }
});

test("seeded final pitch and transposition batches differ only by retired sounding diagnostics", () => {
  let seed = 0x6c428a31;
  const next = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed >>> 0; };
  for (let index = 0; index < 128; index += 1) {
    const { session, ts, read, document } = fixture();
    const transpose = instrument(next() % 29 - 14, next() % 49 - 24);
    const note = pitch(next() % 9);
    const command = batch(index % 2 === 0 ? [note, transpose] : [transpose, note]);
    const expected = withoutRetiredSoundingPitchDiagnostics(ts.submit(command));
    const result = session.submit(command);
    if (expected === null) {
      assert.equal(result.status, "committed", `case ${index}`);
    } else if (expected.status === "rejected") {
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
