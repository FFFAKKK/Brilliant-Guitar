import assert = require("node:assert/strict");
import { resolve } from "node:path";
import { test } from "node:test";
import { CommandBus, validateScoreFeatureProfile, type KernelEvent, type ScoreDocument } from "../../../src/core-kernel/index";
import { createRustKernelSmokeSession, createRustKernelStage4Session } from "../../../src/core-kernel/native/rust-kernel-smoke";
import { cloneCvn4ScoreFixture, createCvn4InsertedPart, createCvn4InsertedVoice } from "../fixtures/cvn-4-score";
import { assertRkp4DeepFrozen, type RawRkp4NativeAddon } from "./rkp-4-fixtures";

const addon = require(resolve("target/rkp-1-node/brilliant_kernel_node.node")) as RawRkp4NativeAddon;
const plain = (value: unknown): unknown => JSON.parse(JSON.stringify(value));
const command = (commandId: string, target: unknown, payload: unknown = {}) => ({ commandVersion: 1, commandId, target, payload });
const target = (kind: string, id: string) => ({ kind, [`${kind}Id`]: id });
const documentTarget = target("document", "cvn4-score");
const primaryVoice = "cvn4-voice-a-1-primary";
const start = { kind: "start" };
const eventPoint = (eventId: string) => ({ kind: "voice-event", voiceId: primaryVoice, eventId });
const notesRange = { kind: "voice-event-range", start: eventPoint("cvn4-event-a-1-notes"), end: eventPoint("cvn4-event-a-1-notes") };

function fixture(): ScoreDocument {
  const value = cloneCvn4ScoreFixture();
  return {
    ...value,
    parts: value.parts.map((part, index) => index !== 0 ? part : {
      ...part,
      staves: [...part.staves, { id: "candidate-unused-staff", lineCount: 5, defaultClef: { sign: "G", line: 2 } }],
    }),
  };
}

function cases(document: ScoreDocument) {
  const part = document.parts[0]!;
  const insertedVoice = createCvn4InsertedVoice("candidate-inserted-voice");
  const rest = { id: "candidate-inserted-rest", duration: { base: 8, dots: 0 }, content: { kind: "rest" } };
  const notes = { id: "candidate-inserted-notes", duration: { base: 8, dots: 0 }, content: { kind: "notes", notes: [{ id: "candidate-inserted-note", writtenPitch: { step: "E", alter: 0, octave: 4 } }] } };
  return [
    command("core.document.set-metadata", documentTarget, { metadata: { ...document.metadata, title: "candidate metadata" } }),
    command("core.note.set-written-pitch", target("note", "cvn4-note-a-1"), { writtenPitch: { step: "D", alter: 0, octave: 4 } }),
    command("core.event.set-note-value", target("event", "cvn4-event-a-1-notes"), { noteValue: { base: 8, dots: 0 } }),
    command("core.voice.insert-notes-event", target("voice", primaryVoice), { anchor: start, event: notes }),
    command("core.voice.insert-rest-event", target("voice", primaryVoice), { anchor: { kind: "after-event", eventId: "cvn4-event-a-1-notes" }, event: rest }),
    command("core.event.remove", target("event", "cvn4-event-a-1-notes")),
    command("core.measure.insert", documentTarget, {
      anchor: { kind: "after-measure", measureId: "cvn4-measure-1" },
      definition: { id: "candidate-inserted-measure", meter: { numerator: 4, denominator: 4 } },
      contents: document.parts.map((part, index) => ({ partId: part.id, voices: [createCvn4InsertedVoice(`candidate-measure-voice-${index}`, part.staves[0]!.id)] })),
    }),
    command("core.measure.remove", target("measure", "cvn4-measure-2")),
    command("core.measure.move", target("measure", "cvn4-measure-3"), { anchor: start }),
    command("core.measure.set-definition", target("measure", "cvn4-measure-1"), { meter: { numerator: 3, denominator: 4 }, pickup: { kind: "none" } }),
    command("core.part.insert", documentTarget, { anchor: start, part: createCvn4InsertedPart("candidate-inserted-part") }),
    command("core.part.remove", target("part", "cvn4-part-a")),
    command("core.part.move", target("part", "cvn4-part-c"), { anchor: start }),
    // An actual leaf no-op still belongs to the changed forcing Batch history.
    command("core.part.set-name", target("part", part.id), { name: part.name }),
    command("core.part.set-instrument", target("part", part.id), { instrument: { ...part.instrument, name: "candidate instrument" } }),
    command("core.staff.insert", target("part", part.id), { anchor: start, staff: { id: "candidate-inserted-staff", lineCount: 5, defaultClef: { sign: "G", line: 2 } } }),
    command("core.staff.remove", target("staff", "candidate-unused-staff")),
    command("core.staff.move", target("staff", "candidate-unused-staff"), { anchor: start }),
    command("core.staff.set-definition", target("staff", "cvn4-staff-a-1"), { lineCount: 5, defaultClef: { sign: "F", line: 4 } }),
    command("core.voice.insert", target("part", part.id), { measureId: "cvn4-measure-1", anchor: start, voice: insertedVoice }),
    command("core.voice.remove", target("voice", "cvn4-voice-a-1-secondary")),
    command("core.voice.move", target("voice", "cvn4-voice-a-1-secondary"), { anchor: start }),
    command("core.voice.set-default-staff", target("voice", primaryVoice), { staffId: "cvn4-staff-a-2" }),
    command("core.voice.set-sequence-start", target("voice", primaryVoice), { start: { numerator: 1, denominator: 8 } }),
    command("core.event.set-staff-assignment", target("event", "cvn4-event-a-1-notes"), { assignment: { kind: "inherit-default" } }),
    command("core.range.delete", documentTarget, { range: notesRange }),
    command("core.range.transpose-written-pitch", documentTarget, { range: notesRange, transposition: { diatonicSteps: 1, chromaticSemitones: 2 } }),
  ];
}

function forcingCommands(document: ScoreDocument) {
  const voice = document.parts[0]!.measureContents[0]!.voices[0]!;
  assert.equal(voice.id, primaryVoice);
  return [
    command("core.voice.set-default-staff", target("voice", voice.id), { staffId: "" }),
    command("core.voice.set-default-staff", target("voice", voice.id), { staffId: voice.defaultStaffId }),
  ];
}

function exercise(document: ScoreDocument, commands: unknown[], label: string): void {
  const createdTs = CommandBus.create(document);
  assert.equal(createdTs.ok, true, `${label}: valid TS fixture`);
  if (!createdTs.ok) throw new Error(`${label}: TS fixture rejected`);
  const bus = createdTs.value;
  const tsEvents: KernelEvent[] = [];
  bus.subscribe((event: KernelEvent) => tsEvents.push(event));
  const created = createRustKernelSmokeSession(addon, document);
  assert.equal(created.result.status, "created", `${label}: native fixture`);
  if (!("handle" in created)) throw new Error(`${label}: native fixture rejected`);
  const session = createRustKernelStage4Session(addon, created.handle);
  const delivered: unknown[] = [];
  session.subscribe(event => delivered.push(event));
  const batch = command("core.transaction.batch", documentTarget, { commands });
  const tsActions = [() => bus.submit(batch), () => bus.undo(), () => bus.redo()];
  const nativeActions = [() => session.submit(batch), () => session.undo(), () => session.redo()];
  for (let index = 0; index < tsActions.length; index += 1) {
    const firstEvent = tsEvents.length;
    const firstDelivered = delivered.length;
    const expected = tsActions[index]!();
    assert.equal(expected.status, "committed", `${label}: TS phase ${index} must execute`);
    if (expected.status !== "committed") throw new Error(`${label}: ${JSON.stringify(expected)}`);
    const result = nativeActions[index]!();
    assert.equal(result.status, "committed", `${label}: native phase ${index}: ${JSON.stringify(result)}`);
    if (result.status !== "committed") throw new Error(`${label}: native rejected`);
    const expectedRead = bus.read();
    const actualRead = session.read();
    assert.equal(expectedRead.ok, true);
    assert.equal(actualRead.status, "ok");
    if (!expectedRead.ok || actualRead.status !== "ok") throw new Error(`${label}: read rejected`);
    assert.deepEqual(expected.support, validateScoreFeatureProfile(expectedRead.value.snapshot.document), `${label}: actual profile support ${index}`);
    const events = tsEvents.slice(firstEvent);
    const committed = events.find(event => event.eventType === "core.document.committed");
    if (committed?.eventType !== "core.document.committed") throw new Error(`${label}: missing TS committed event`);
    // Match the existing Stage 4 wire projection: TS carries support directly,
    // native carries affected/dirty/events; all shared public data is compared.
    const { metrics: _metrics, stage4Metrics: _stage4Metrics, ...value } = result.value;
    assert.deepEqual(plain({ apiVersion: result.apiVersion, status: result.status, value, events: result.events }), plain({
      apiVersion: 1, status: expected.status,
      value: { documentVersion: expected.documentVersion, history: { undoDepth: expected.undoDepth, redoDepth: expected.redoDepth }, dirty: expectedRead.value.dirty, affected: committed.affectedEntities },
      events,
    }), `${label}: complete mutation projection ${index}`);
    const { stage4Metrics: _readMetrics, ...readValue } = actualRead.value;
    assert.deepEqual(plain(readValue), plain(expectedRead.value), `${label}: complete read DTO ${index}`);
    assert.deepEqual(plain(delivered.slice(firstDelivered)), plain(events), `${label}: event delivery ${index}`);
    assertRkp4DeepFrozen(result);
    if (index === 1) assert.deepEqual(plain(readValue.snapshot.document), document, `${label}: undo restored initial DTO`);
  }
}

const initial = fixture();
const leaves = cases(initial);
assert.equal(leaves.length, 27);
assert.equal(new Set(leaves.map(leaf => leaf.commandId)).size, 27);
for (const leaf of leaves) {
  test(`native forced candidate matches real TS submit/undo/redo: ${leaf.commandId}`, () => {
    const document = fixture();
    exercise(document, [...forcingCommands(document), leaf], leaf.commandId);
  });
}

test("native retains a real typed prefix before promotion and candidate Part removal", () => {
  const document = fixture();
  exercise(document, [
    command("core.document.set-metadata", documentTarget, { metadata: { ...document.metadata, title: "typed prefix retained" } }),
    ...forcingCommands(document),
    command("core.part.remove", target("part", "cvn4-part-a")),
  ], "typed prefix then candidate Part death");
});
