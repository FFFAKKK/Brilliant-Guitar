import assert = require("node:assert/strict");
import { resolve } from "node:path";
import { test } from "node:test";
import { CommandBus, type ScoreDocument } from "../../../src/core-kernel/index";
import { createRustKernelSmokeSession, createRustKernelStage4Session, replayRustKernelStage4, type RustKernelStage4CompleteNativeAddon } from "../../../src/core-kernel/native/rust-kernel-smoke";
import { createCoreScoreFixture } from "../fixtures/core-score";

const addon = require(resolve("target/rkp-1-node/brilliant_kernel_node.node")) as RustKernelStage4CompleteNativeAddon;
const plain = (value: unknown): unknown => JSON.parse(JSON.stringify(value));
const noteValue = (base: number, eventId = "event-1") => ({ commandVersion: 1, commandId: "core.event.set-note-value", target: { kind: "event", eventId }, payload: { noteValue: { base, dots: 0 } } });
const start = (numerator: number, denominator: number) => ({ commandVersion: 1, commandId: "core.voice.set-sequence-start", target: { kind: "voice", voiceId: "voice-1" }, payload: { start: { numerator, denominator } } });
const meter = (numerator: number, denominator: number, pickup: unknown = { kind: "none" }) => ({ commandVersion: 1, commandId: "core.measure.set-definition", target: { kind: "measure", measureId: "measure-1" }, payload: { meter: { numerator, denominator }, pickup } });
const batch = (commands: readonly unknown[]) => ({ commandVersion: 1, commandId: "core.transaction.batch", target: { kind: "document", documentId: "score-1" }, payload: { commands } });

function fixture(document = createCoreScoreFixture()) {
  const created = createRustKernelSmokeSession(addon, document);
  if (!("handle" in created)) throw new Error("native create required");
  const session = createRustKernelStage4Session(addon, created.handle);
  const oracle = CommandBus.create(document);
  if (!oracle.ok) throw new Error("TS oracle required");
  const read = () => {
    const result = session.read();
    if (result.status !== "ok") throw new Error("read required");
    return result.value;
  };
  return { document, session, ts: oracle.value, read };
}

const retiredTimingCodes = new Set([
  "semantic.sequence-exceeds-measure",
  "semantic.sequence-start-out-of-bounds",
]);

function withoutRetiredTimingDiagnostics<T>(result: T): T | null {
  if (!result || typeof result !== "object") return result;
  const value = result as { readonly status?: unknown; readonly failure?: {
    readonly code?: unknown; readonly diagnostics?: readonly unknown[];
  } };
  if (value.status !== "rejected" || value.failure?.code !== "command.semantic-invalid"
    || !Array.isArray(value.failure.diagnostics)) return result;
  const diagnostics = value.failure.diagnostics.filter((diagnostic) => !(
    diagnostic !== null && typeof diagnostic === "object"
    && retiredTimingCodes.has(String((diagnostic as { readonly code?: unknown }).code))
  ));
  if (diagnostics.length === value.failure.diagnostics.length) return result;
  if (diagnostics.length === 0) return null;
  return { ...value, failure: { ...value.failure, diagnostics } } as T;
}

test("overfull endings and delayed voice starts commit through undo redo and replay", () => {
  for (const command of [noteValue(1), start(1, 4), meter(3, 4), start(2, 1),
    meter(4, 4, { kind: "duration", duration: { numerator: 1, denominator: 8 } })]) {
    const { document, session, ts, read } = fixture();
    assert.equal(withoutRetiredTimingDiagnostics(ts.submit(command)), null);
    const result = session.submit(command);
    assert.equal(result.status, "committed", JSON.stringify(command));
    const final = read().snapshot.document;
    assert.equal(session.undo().status, "committed");
    assert.deepEqual(plain(read().snapshot.document), plain(document));
    assert.equal(session.redo().status, "committed");
    assert.deepEqual(plain(read().snapshot.document), plain(final));
    const replayed = replayRustKernelStage4(addon, document, [command]);
    if (replayed.status !== "replayed") throw new Error("tolerant timing replay required");
    assert.deepEqual(plain(replayed.finalDocument), plain(final));
  }
});

test("time admission preserves fraction, meter and pickup diagnostic precedence", () => {
  for (const command of [start(2, 4), start(0, 2), start(-1, 2),
    meter(0, 4), meter(-1, 4),
    meter(4, 4, { kind: "duration", duration: { numerator: 2, denominator: 4 } }),
    meter(4, 4, { kind: "duration", duration: { numerator: -1, denominator: 2 } }),
    meter(4, 4, { kind: "duration", duration: { numerator: 2, denominator: 1 } })]) {
    const { session, ts } = fixture();
    const expected = ts.submit(command);
    const result = session.submit(command);
    if (result.status !== "command-rejected" || expected.status !== "rejected") {
      throw new Error(`fraction rejection required: ${JSON.stringify({ command, expected, result })}`);
    }
    assert.deepEqual(plain(result.failure), plain(expected.failure), JSON.stringify(command));
  }
});

test("batch final-state time repair and pitch/time diagnostic ordering match TS", () => {
  const { document, session, ts, read } = fixture();
  const valid = batch([start(1, 4), meter(5, 4)]);
  assert.equal(ts.submit(valid).status, "committed");
  assert.equal(session.submit(valid).status, "committed");
  const final = read().snapshot.document;
  assert.equal(session.undo().status, "committed");
  assert.deepEqual(plain(read().snapshot.document), plain(document));
  assert.equal(session.redo().status, "committed");
  assert.deepEqual(plain(read().snapshot.document), plain(final));
  const replayed = replayRustKernelStage4(addon, document, [valid]);
  if (replayed.status !== "replayed") throw new Error("time batch replay required");
  assert.deepEqual(plain(replayed.finalDocument), plain(final));

  const invalid = batch([
    noteValue(1),
    { commandVersion: 1, commandId: "core.part.set-instrument", target: { kind: "part", partId: "part-1" }, payload: { instrument: { name: "Invalid", writtenToSounding: { diatonicSteps: 100, chromaticSemitones: 0 } } } },
    meter(0, 4),
    { commandVersion: 1, commandId: "core.document.set-metadata", target: { kind: "document", documentId: document.id }, payload: { metadata: { ...document.metadata, tempo: { bpm: 0 } } } },
  ]);
  const expected = ts.submit(invalid);
  const result = session.submit(invalid);
  if (result.status !== "command-rejected" || expected.status !== "rejected") throw new Error("mixed rejection required");
  assert.deepEqual(plain(result.failure), plain(expected.failure));
});

function rejectLikeTs(command: unknown, document = createCoreScoreFixture()) {
  const { session, ts, read } = fixture(document);
  const before = read();
  const expected = withoutRetiredTimingDiagnostics(ts.submit(command));
  const result = session.submit(command);
  if (expected === null) throw new Error(`non-timing rejection required: ${JSON.stringify(command)}`);
  if (result.status !== "command-rejected" || expected.status !== "rejected") throw new Error(`rejection required: ${JSON.stringify({ command, expected, result })}`);
  assert.deepEqual(plain(result.failure), plain(expected.failure), JSON.stringify(command));
  assert.equal(result.failure.code, "command.semantic-invalid", JSON.stringify({ command, failure: result.failure }));
  assert.deepEqual(result.events, []);
  assert.strictEqual(read().snapshot, before.snapshot);
  assert.deepEqual(read().history, before.history);
  return result;
}

const rest = (id: string, duration: unknown, anchor: unknown = { kind: "start" }, voiceId = "voice-1") => ({
  commandVersion: 1, commandId: "core.voice.insert-rest-event", target: { kind: "voice", voiceId },
  payload: { anchor, event: { id, duration, content: { kind: "rest" } } },
});
const removeEvent = (eventId: string) => ({ commandVersion: 1, commandId: "core.event.remove", target: { kind: "event", eventId }, payload: {} });

test("time arithmetic preserves overflow reasons and continuation after invalid durations", () => {
  const max = Number.MAX_SAFE_INTEGER;
  const ownOverflow = { base: 64, dots: 3, timeModification: { actualNotes: max, normalNotes: 1 } };
  const commands = [
    batch([start(max, 1), meter(max, 1)]), // Running addition overflows.
    batch([start(max, 2), meter(max, 4)]), // Initial comparison overflows.
    meter(max, 4), // First event end comparison overflows.
    meter(max, 4, { kind: "duration", duration: { numerator: max, denominator: 2 } }),
    { commandVersion: 1, commandId: "core.voice.insert", target: { kind: "part", partId: "part-1" }, payload: {
      measureId: "measure-1", anchor: { kind: "start" }, voice: {
        id: "bad-voice", defaultStaffId: "staff-1", sequence: { start: { numerator: 0, denominator: 1 }, events: [
          { id: "new-first", duration: { base: 1, dots: 0 }, content: { kind: "rest" } },
          { id: "bad-middle", duration: { base: 4, dots: 0, timeModification: { actualNotes: 0, normalNotes: 2 } }, content: { kind: "rest" } },
          { id: "new-last", duration: { base: 4, dots: 0 }, content: { kind: "rest" } },
        ] },
      },
    } },
    batch([noteValue(1), rest("bad-middle", ownOverflow, { kind: "after-event", eventId: "event-1" })]),
    // The noncanonical start suppresses accumulation, but every duration still
    // receives its own validation, including an overflow with a reason.
    batch([start(2, 4), rest("bad-first", ownOverflow)]),
    batch([start(-1, 2), meter(0, 4)]),
  ];
  for (const command of commands) rejectLikeTs(command);
});

function scoreWithTime(partCount: number, eventsPerVoice = 4, voiceCount = 1): ScoreDocument {
  const base = createCoreScoreFixture();
  const part = base.parts[0]!;
  const voice = part.measureContents[0]!.voices[0]!;
  return { ...base,
    measureDefinitions: [{ id: "measure-1", meter: { numerator: eventsPerVoice, denominator: 4 } }],
    parts: Array.from({ length: partCount }, (_, p) => ({ ...part, id: `part-${p}`,
      staves: part.staves.map((staff) => ({ ...staff, id: `staff-${p}` })),
      measureContents: [{ measureId: "measure-1", voices: Array.from({ length: voiceCount }, (_, v) => ({
        ...voice, id: `voice-${p}-${v}`, defaultStaffId: `staff-${p}`,
        sequence: { start: { numerator: 0, denominator: 1 }, events: Array.from({ length: eventsPerVoice }, (_, e) => ({
          id: `event-${p}-${v}-${e}`, duration: { base: 4 as const, dots: 0 }, content: { kind: "rest" as const },
        })) },
      })) }],
    })),
  };
}

test("measure dependencies include all final Parts and newly inserted voices but omit removed owners", () => {
  const document = scoreWithTime(2, 4, 2);
  const newPart = scoreWithTime(3, 4, 2).parts[2]!;
  const command = batch([
    meter(3, 4),
    { commandVersion: 1, commandId: "core.part.insert", target: { kind: "document", documentId: document.id }, payload: { anchor: { kind: "start" }, part: newPart } },
    { commandVersion: 1, commandId: "core.voice.remove", target: { kind: "voice", voiceId: "voice-0-0" }, payload: {} },
    { commandVersion: 1, commandId: "core.part.remove", target: { kind: "part", partId: "part-1" }, payload: {} },
  ]);
  const { session, ts, read } = fixture(document);
  assert.equal(withoutRetiredTimingDiagnostics(ts.submit(command)), null);
  const committed = session.submit(command);
  if (committed.status !== "committed") throw new Error("tolerated dependent voices must commit");
  assert.ok(committed.value.metrics.semanticDependencyReads > 0);
  const final = read().snapshot.document;
  assert.equal(session.undo().status, "committed");
  assert.deepEqual(plain(read().snapshot.document), plain(document));
  assert.equal(session.redo().status, "committed");
  assert.deepEqual(plain(read().snapshot.document), plain(final));
});

test("same-ID event and measure replacement use final times through undo redo and replay", () => {
  const document = createCoreScoreFixture();
  const originalVoice = document.parts[0]!.measureContents[0]!.voices[0]!;
  const replacementVoice = { ...originalVoice, sequence: { ...originalVoice.sequence, events: [] } };
  const commands = [
    batch([noteValue(1), removeEvent("event-1"), rest("event-1", { base: 8, dots: 0 })]),
    batch([
      { commandVersion: 1, commandId: "core.measure.insert", target: { kind: "document", documentId: document.id }, payload: {
        anchor: { kind: "start" }, definition: { id: "temporary-measure", meter: { numerator: 4, denominator: 4 } },
        contents: [{ partId: "part-1", voices: [{ ...replacementVoice, id: "temporary-voice" }] }],
      } },
      meter(0, 4),
      { commandVersion: 1, commandId: "core.measure.remove", target: { kind: "measure", measureId: "measure-1" }, payload: {} },
      { commandVersion: 1, commandId: "core.measure.insert", target: { kind: "document", documentId: document.id }, payload: {
        anchor: { kind: "start" }, definition: { id: "measure-1", meter: { numerator: 3, denominator: 4 } },
        contents: [{ partId: "part-1", voices: [replacementVoice] }],
      } },
      { commandVersion: 1, commandId: "core.measure.remove", target: { kind: "measure", measureId: "temporary-measure" }, payload: {} },
    ]),
  ];
  for (const command of commands) {
    const { session, ts, read } = fixture(document);
    assert.equal(ts.submit(command).status, "committed");
    assert.equal(session.submit(command).status, "committed");
    const final = read().snapshot.document;
    assert.equal(session.undo().status, "committed");
    assert.deepEqual(plain(read().snapshot.document), plain(document));
    assert.equal(session.redo().status, "committed");
    assert.deepEqual(plain(read().snapshot.document), plain(final));
    const replayed = replayRustKernelStage4(addon, document, [command]);
    if (replayed.status !== "replayed") throw new Error("replacement replay required");
    assert.deepEqual(plain(replayed.finalDocument), plain(final));
  }
  const tolerant = batch([removeEvent("event-1"), rest("event-1", { base: 1, dots: 0 })]);
  const { session, ts } = fixture(document);
  assert.equal(withoutRetiredTimingDiagnostics(ts.submit(tolerant)), null);
  assert.equal(session.submit(tolerant).status, "committed");
});

test("time work scales with affected voices and counts the full unchanged prefix", () => {
  const samples = [];
  for (const parts of [1, 64]) {
    const { session } = fixture(scoreWithTime(parts));
    const changed = session.submit(noteValue(8, "event-0-0-3"));
    if (changed.status !== "committed") throw new Error("local duration commit required");
    samples.push(changed.value.metrics);
    assert.equal(changed.value.metrics.semanticRulesEvaluated, 15);
    assert.equal(changed.value.metrics.semanticDependencyReads, 13);
    const measureChanged = session.submit(meter(5, 4));
    if (measureChanged.status !== "committed") throw new Error("measure commit required");
    assert.equal(measureChanged.value.metrics.semanticRulesEvaluated, 3 + parts * 14);
    assert.ok(measureChanged.value.metrics.semanticDependencyReads <= parts * 17 + 8);
  }
  assert.equal(samples[0]!.semanticDependencyReads, samples[1]!.semanticDependencyReads);
  const { session } = fixture(scoreWithTime(1, 1024));
  const last = session.submit(noteValue(8, "event-0-0-1023"));
  if (last.status !== "committed") throw new Error("long prefix commit required");
  assert.equal(last.value.metrics.semanticDependencyReads, 5 + 1024 * 2);
  assert.equal(last.value.metrics.semanticRulesEvaluated, 3 + 1024 * 3);
});

test("tolerated timing warnings do not consume the blocking diagnostic budget", () => {
  for (const count of [4096, 4097]) {
    const document = scoreWithTime(1, count);
    const { session, read } = fixture(document);
    const before = read();
    const command = batch([meter(1, 4), { commandVersion: 1, commandId: "core.document.set-metadata", target: { kind: "document", documentId: document.id }, payload: { metadata: { ...document.metadata, tempo: { bpm: 0 } } } }]);
    const result = session.submit(command);
    if (result.status !== "command-rejected") throw new Error("aggregate time rejection required");
    assert.equal(result.failure.code, "command.semantic-invalid");
    const diagnostics = result.failure.diagnostics as readonly { code: string }[];
    assert.deepEqual(diagnostics.map((diagnostic) => diagnostic.code), ["semantic.tempo-invalid"]);
    assert.ok(result.value.metrics.semanticDependencyReads < count * 4 + 64);
    assert.deepEqual(result.events, []);
    assert.strictEqual(read().snapshot, before.snapshot);
    assert.deepEqual(read().history, before.history);
  }
});

test("pitch and time diagnostics interleave by final event order", () => {
  const base = scoreWithTime(1);
  const document: ScoreDocument = { ...base, parts: base.parts.map((part) => ({ ...part,
    measureContents: part.measureContents.map((content) => ({ ...content,
      voices: content.voices.map((voice) => ({ ...voice, sequence: { ...voice.sequence,
        events: voice.sequence.events.map((event, index) => ({ ...event, content: { kind: "notes" as const, notes: [{ id: `note-${index}`, writtenPitch: { step: "C" as const, alter: 0, octave: 4 } }] } })),
      } })),
    })),
  })) };
  const rejected = rejectLikeTs(batch([
    noteValue(1, "event-0-0-0"),
    removeEvent("event-0-0-3"),
    { commandVersion: 1, commandId: "core.voice.insert-notes-event", target: { kind: "voice", voiceId: "voice-0-0" }, payload: {
      anchor: { kind: "start" }, event: document.parts[0]!.measureContents[0]!.voices[0]!.sequence.events[3],
    } },
    { commandVersion: 1, commandId: "core.part.set-instrument", target: { kind: "part", partId: "part-0" }, payload: { instrument: { name: "Invalid", writtenToSounding: { diatonicSteps: 100, chromaticSemitones: 0 } } } },
  ]), document);
  if (rejected.failure.code !== "command.semantic-invalid") throw new Error("semantic report required");
  assert.deepEqual((rejected.failure.diagnostics as readonly { code: string }[]).map((diagnostic) => diagnostic.code), [
    "semantic.sounding-pitch-invalid", "semantic.sounding-pitch-invalid",
    "semantic.sounding-pitch-invalid", "semantic.sounding-pitch-invalid",
  ]);
});

test("seeded final time batches match the independent TS command runtime", () => {
  let seed = 0x731f5a;
  const pick = <T>(values: readonly T[]): T => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return values[seed % values.length]!;
  };
  let committed = 0;
  let rejected = 0;
  let tolerated = 0;
  for (let index = 0; index < 160; index += 1) {
    const { document, session, ts, read } = fixture();
    const before = read();
    const startValue = pick([[0, 1], [1, 4], [2, 4], [-1, 2], [1, 2], [Number.MAX_SAFE_INTEGER, 2]] as const);
    const value = { base: pick([1, 2, 4, 8, 16, 64]), dots: pick([0, 1, 2, 3]),
      timeModification: { actualNotes: pick([1, 3, 8, Number.MAX_SAFE_INTEGER]), normalNotes: pick([1, 2, 4]) } };
    const command = batch([
      { ...noteValue(4), payload: { noteValue: value } },
      meter(pick([0, 1, 3, 4, 5, Number.MAX_SAFE_INTEGER]), 4),
      start(startValue[0], startValue[1]),
      ...(index % 8 === 0 ? [meter(8, 4), start(0, 1), noteValue(8)] : []),
    ]);
    const legacy = ts.submit(command);
    const expected = withoutRetiredTimingDiagnostics(legacy);
    const result = session.submit(command);
    if (expected === null) {
      tolerated += 1;
      if (result.status !== "committed") throw new Error(`seed ${index} required tolerant commit`);
      const final = read().snapshot.document;
      const replayed = replayRustKernelStage4(addon, document, [command]);
      if (replayed.status !== "replayed") throw new Error("tolerant seed replay required");
      assert.deepEqual(plain(replayed.finalDocument), plain(final), `seed ${index} tolerant replay`);
      assert.equal(session.undo().status, "committed");
      assert.deepEqual(plain(read().snapshot.document), plain(document));
    } else if (expected.status === "rejected") {
      rejected += 1;
      if (result.status !== "command-rejected") throw new Error(`seed ${index} required rejection`);
      assert.deepEqual(plain(result.failure), plain(expected.failure), `seed ${index}`);
      assert.strictEqual(read().snapshot, before.snapshot);
      assert.deepEqual(result.events, []);
    } else {
      committed += 1;
      assert.equal(expected.status, "committed");
      assert.equal(result.status, "committed", `seed ${index}`);
      const final = read().snapshot.document;
      const expectedRead = ts.read();
      if (!expectedRead.ok) throw new Error("TS final read required");
      assert.deepEqual(plain(final), plain(expectedRead.value.snapshot.document), `seed ${index} final document`);
      const replayed = replayRustKernelStage4(addon, document, [command]);
      if (replayed.status !== "replayed") throw new Error("seed replay required");
      assert.deepEqual(plain(replayed.finalDocument), plain(final));
      assert.equal(session.undo().status, "committed");
      assert.deepEqual(plain(read().snapshot.document), plain(document));
    }
  }
  assert.ok(committed >= 20);
  assert.ok(rejected >= 20);
  assert.ok(tolerated >= 1);
});
