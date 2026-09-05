import assert = require("node:assert/strict");
import { resolve } from "node:path";
import { test } from "node:test";

import {
  CommandBus,
  replayCoreCommands,
  selectDirtyState,
  selectHistoryState,
  selectScoreEntity,
  selectScoreEntityOwnership,
  selectScoreMetadata,
  selectScoreRange,
  type CommandResult,
  type CoreSelectorRequest,
  type KernelEvent,
  type ScoreDocument,
} from "../../../src/core-kernel/index";
import {
  createRustKernelSmokeSession,
  createRustKernelStage4Session,
  readRustKernelSmokeSession,
  replayRustKernelStage4,
  submitRustKernelSmokeCommand,
  type RustKernelStage4CompleteNativeAddon,
} from "../../../src/core-kernel/native/rust-kernel-smoke";
import { createCoreScoreFixture } from "../fixtures/core-score";
import { probeJsStringNativeCompatibility } from "./js-string-native-probe";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const addon = require(resolve("target/rkp-1-node/brilliant_kernel_node.node")) as RustKernelStage4CompleteNativeAddon;
const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const text = "高/\ud800/低/\udc00/配对/\ud800\udc00/替换/\ufffd/字面/\\ud800/\0/e\u0301";
const identity = (kind: string): string => `${kind}/${text}`;
const staffIds = ["staff/\ud800", "staff/\udc00", "staff/\ud800\udc00", "staff/\ufffd"] as const;

function utf16Document(): ScoreDocument {
  const base = createCoreScoreFixture();
  const part = base.parts[0]!;
  const voice = part.measureContents[0]!.voices[0]!;
  return {
    ...base,
    id: identity("document"),
    metadata: { ...base.metadata, title: text, authors: [text, "\udbff", "\udfff"] },
    measureDefinitions: [{ ...base.measureDefinitions[0]!, id: identity("measure") }],
    parts: [{
      ...part,
      id: identity("part"),
      name: text,
      instrument: { ...part.instrument, name: text },
      staves: staffIds.map(id => ({ ...part.staves[0]!, id })),
      measureContents: [{
        measureId: identity("measure"),
        voices: [{
          ...voice,
          id: identity("voice"),
          defaultStaffId: staffIds[0],
          sequence: {
            ...voice.sequence,
            events: voice.sequence.events.map((event, index) => ({
              ...event,
              id: identity(`event-${index}`),
              staffId: staffIds[index % staffIds.length]!,
              content: event.content.kind === "rest" ? event.content : {
                kind: "notes" as const,
                notes: event.content.notes.map((note, noteIndex) => ({
                  ...note, id: identity(`note-${index}-${noteIndex}`),
                })),
              },
            })),
          },
        }],
      }],
    }],
    extensions: [{
      namespace: "example.utf16",
      schemaVersion: 1,
      owner: { kind: "part", partId: identity("part") },
      // Deliberately reverse these two keys: UTF-16 order differs from scalar order.
      payload: {
        "\ue000": { "\udc00": text },
        "\ud800\udc00": [{ "\ud800": text }, "\udfff", "\ufffd"],
        "\ud800": "high",
        "\udc00": "low",
        "\ufffd": "replacement",
        [text]: { nested: [text, { [text]: text }] },
      },
    }],
  };
}

const command = (commandId: string, target: unknown, payload: unknown = {}) => ({
  commandVersion: 1, commandId, target, payload,
});
const documentTarget = { kind: "document", documentId: identity("document") };
const partTarget = { kind: "part", partId: identity("part") };
const voiceTarget = { kind: "voice", voiceId: identity("voice") };
const eventTarget = { kind: "event", eventId: identity("event-0") };
const batch = (commands: readonly unknown[]) => command("core.transaction.batch", documentTarget, { commands });
const metadataCommand = (title: string) => command("core.document.set-metadata", documentTarget, {
  metadata: { title, authors: [text], tempo: { bpm: 120 } },
});
const eventRange = {
  kind: "voice-event-range",
  start: { kind: "voice-event", voiceId: identity("voice"), eventId: identity("event-0") },
  end: { kind: "voice-event", voiceId: identity("voice"), eventId: identity("event-3") },
};

function pairedSessions(document = utf16Document()) {
  const reference = CommandBus.create(document);
  assert.equal(reference.ok, true, "TypeScript must accept the UTF-16 fixture");
  if (!reference.ok) throw new Error("reference create rejected");
  const created = createRustKernelSmokeSession(addon, document);
  assert.equal(created.result.status, "created");
  if (!("handle" in created)) throw new Error("native create rejected");
  assert.deepEqual(plain(created.result.value), { documentId: document.id, documentVersion: 0 });
  const ts = reference.value;
  const native = createRustKernelStage4Session(addon, created.handle);
  const tsEvents: KernelEvent[] = [];
  const nativeEvents: KernelEvent[] = [];
  ts.subscribe((event: KernelEvent) => { tsEvents.push(event); });
  native.subscribe(event => { nativeEvents.push(event); });

  function read() {
    const expected = ts.read();
    const actual = native.read();
    assert.ok(expected.ok);
    if (!expected.ok || actual.status !== "ok") throw new Error("paired read rejected");
    assert.deepEqual(plain({ snapshot: actual.value.snapshot, history: actual.value.history, dirty: actual.value.dirty }), plain(expected.value));
    return expected.value;
  }

  function action(referenceAction: () => CommandResult, nativeAction: () => ReturnType<typeof native.submit>) {
    tsEvents.length = 0;
    nativeEvents.length = 0;
    const expected = referenceAction();
    const actual = nativeAction();
    assert.equal(actual.status, expected.status === "rejected" ? "command-rejected" : expected.status);
    assert.equal(actual.value.documentVersion, expected.documentVersion);
    assert.deepEqual(plain(actual.value.history), { undoDepth: expected.undoDepth, redoDepth: expected.redoDepth });
    if (expected.status === "rejected") {
      if (actual.status !== "command-rejected") throw new Error("expected command failure");
      assert.deepEqual(plain(actual.failure), plain(expected.failure));
    }
    assert.deepEqual(plain(actual.events), plain(tsEvents));
    assert.deepEqual(plain(nativeEvents), plain(tsEvents));
    if (actual.status === "committed") {
      const committed = tsEvents.find(event => event.eventType === "core.document.committed");
      assert.ok(committed?.eventType === "core.document.committed");
      if (committed?.eventType === "core.document.committed") {
        assert.deepEqual(plain(actual.value.affected), plain(committed.affectedEntities));
      }
    }
    read();
    return actual;
  }

  function select(selector: CoreSelectorRequest) {
    const state = read();
    const expected = (() => {
      switch (selector.selectorId) {
        case "core.selector.score-metadata": return selectScoreMetadata(state.snapshot);
        case "core.selector.score-entity": return selectScoreEntity(state.snapshot, selector.address);
        case "core.selector.score-entity-ownership": return selectScoreEntityOwnership(state.snapshot, selector.address);
        case "core.selector.score-range": return selectScoreRange(state.snapshot, selector.range);
        case "core.selector.history-state": return selectHistoryState(state);
        case "core.selector.dirty-state": return selectDirtyState(state);
      }
    })();
    const actual = native.select(selector);
    if (actual.status !== "ok") throw new Error("native selector boundary rejected");
    assert.equal(actual.value.documentVersion, state.snapshot.documentVersion);
    assert.deepEqual(plain(actual.value.selection), plain(expected));
    return actual.value.selection;
  }

  return { ts, native, read, action, select, tsEvents, nativeEvents, handle: created.handle };
}

function assertReplay(document: ScoreDocument, commands: readonly unknown[]) {
  const expected = replayCoreCommands(document, commands);
  const actual = replayRustKernelStage4(addon, document, commands);
  assert.equal(actual.status, expected.status);
  if (actual.status === "invalid-initial-document" || expected.status === "invalid-initial-document") {
    throw new Error("valid UTF-16 replay fixture rejected");
  }
  assert.equal(actual.documentVersion, expected.documentVersion);
  assert.deepEqual(plain(actual.finalDocument), plain(expected.finalDocument));
  assert.deepEqual(plain(actual.results), expected.results.map(result => ({
    status: result.status === "rejected" ? "command-rejected" : result.status,
    documentVersion: result.documentVersion,
    history: { undoDepth: result.undoDepth, redoDepth: result.redoDepth },
    ...(result.status === "rejected" ? { failure: plain(result.failure) } : {}),
  })));
  if (actual.status === "rejected" && expected.status === "rejected") {
    assert.equal(actual.failedCommandIndex, expected.failedCommandIndex);
    assert.deepEqual(plain(actual.failure), plain(expected.failure));
  }
  return actual;
}

test("all 28 original native UTF-16 probes remain equal to the TypeScript oracle", () => {
  const report = probeJsStringNativeCompatibility();
  assert.equal(report.rows.length, 28);
  assert.equal(report.mismatchCount, 0, JSON.stringify(report.rows));
});

test("UTF-16 IDs, references and opaque strings survive all read and selector families", () => {
  const fixture = utf16Document();
  const pair = pairedSessions(fixture);
  assert.deepEqual(pair.read().snapshot.document, fixture);
  const legacy = readRustKernelSmokeSession(addon, pair.handle);
  if (legacy.status !== "ok") throw new Error("legacy read rejected");
  assert.deepEqual(plain(legacy.value), plain(pair.read()));
  const first = pair.native.read();
  const cached = pair.native.read();
  if (first.status !== "ok" || cached.status !== "ok") throw new Error("cached read rejected");
  assert.equal(cached.value.snapshot, first.value.snapshot);
  assert.equal(cached.value.stage4Metrics.fullSnapshotMaterializations, 0);
  const actualDocument = plain(first.value.snapshot.document) as ScoreDocument;
  const keys = Object.keys(actualDocument.extensions[0]!.payload);
  assert.deepEqual(keys, Object.keys(fixture.extensions[0]!.payload).sort());
  assert.ok(keys.indexOf("\ud800\udc00") < keys.indexOf("\ue000"));
  assert.equal(new Set(actualDocument.parts[0]!.staves.map(staff => staff.id)).size, 4);

  const addresses = [documentTarget, { kind: "measure", measureId: identity("measure") }, partTarget,
    ...staffIds.map(staffId => ({ kind: "staff", staffId })), voiceTarget, eventTarget,
    { kind: "note", noteId: identity("note-0-0") }];
  for (const address of addresses) {
    assert.equal(pair.select({ selectorId: "core.selector.score-entity", address }).ok, true);
    assert.equal(pair.select({ selectorId: "core.selector.score-entity-ownership", address }).ok, true);
  }
  for (const selectorId of ["core.selector.score-metadata", "core.selector.history-state", "core.selector.dirty-state"] as const) {
    assert.equal(pair.select({ selectorId }).ok, true);
  }
  for (const range of [
    eventRange,
    { kind: "measure-range", start: { kind: "measure", measureId: identity("measure") }, end: { kind: "measure", measureId: identity("measure") } },
    { kind: "part-measure-range", start: { kind: "part-measure", partId: identity("part"), measureId: identity("measure") }, end: { kind: "part-measure", partId: identity("part"), measureId: identity("measure") } },
  ]) assert.equal(pair.select({ selectorId: "core.selector.score-range", range }).ok, true);
  assert.equal(pair.select({ selectorId: "core.selector.score-entity", address: { kind: "staff", staffId: "absent/\ud800" } }).ok, false);
});

test("UTF-16 commands, events, references, batch, undo/redo, persistence and replay match TypeScript", () => {
  const document = utf16Document();
  const pair = pairedSessions(document);
  const insertedStaff = "new-staff/\ud800/\udc00";
  const commands = [
    metadataCommand(`edited/${text}`),
    command("core.part.set-name", partTarget, { name: `part/${text}` }),
    command("core.part.set-instrument", partTarget, { instrument: { ...document.parts[0]!.instrument, name: `instrument/${text}` } }),
    batch([
      command("core.voice.set-default-staff", voiceTarget, { staffId: insertedStaff }),
      command("core.staff.insert", partTarget, { anchor: { kind: "after-staff", staffId: staffIds[0] }, staff: { ...document.parts[0]!.staves[0]!, id: insertedStaff } }),
      command("core.event.set-staff-assignment", eventTarget, { assignment: { kind: "staff", staffId: insertedStaff } }),
    ]),
  ];
  for (const input of commands) assert.equal(pair.action(() => pair.ts.submit(input), () => pair.native.submit(input)).status, "committed");
  const final = pair.read().snapshot.document;
  assert.equal(pair.action(() => pair.ts.undo(), () => pair.native.undo()).status, "committed");
  assert.equal(pair.action(() => pair.ts.redo(), () => pair.native.redo()).status, "committed");
  assert.deepEqual(pair.read().snapshot.document, final);
  const noOp = metadataCommand(`edited/${text}`);
  assert.equal(pair.action(() => pair.ts.submit(noOp), () => pair.native.submit(noOp)).status, "no-op");
  for (let index = 0; index < 2; index++) {
    pair.tsEvents.length = 0;
    pair.nativeEvents.length = 0;
    const checkpoint = { documentId: document.id, documentVersion: pair.read().snapshot.documentVersion };
    const expected = pair.ts.markPersisted(checkpoint);
    const actual = pair.native.markPersisted(checkpoint);
    assert.equal(actual.status, index === 0 ? "updated" : "no-op");
    assert.equal(actual.status, expected.status);
    assert.deepEqual(plain(actual.value), { documentVersion: expected.documentVersion, dirty: expected.dirty });
    assert.deepEqual(plain(actual.events), plain(pair.tsEvents));
    assert.deepEqual(plain(pair.nativeEvents), plain(pair.tsEvents));
    assert.equal(pair.read().dirty, false);
  }
  const replay = assertReplay(document, [...commands, noOp]);
  if (replay.status !== "replayed") throw new Error("successful replay expected");
  assert.deepEqual(plain(replay.finalDocument), plain(final));
});

test("UTF-16 failure addresses and duplicate batch diagnostics preserve code units and atomicity", () => {
  const document = utf16Document();
  const pair = pairedSessions(document);
  const duplicate = command("core.measure.insert", documentTarget, {
    anchor: { kind: "start" }, definition: document.measureDefinitions[0],
    contents: [{ partId: identity("part"), voices: [{ id: "new-voice/\ud800", defaultStaffId: staffIds[0], sequence: { start: { numerator: 0, denominator: 1 }, events: [] } }] }],
  });
  const duplicateBatch = batch([metadataCommand("must roll back/\ud800"), duplicate, metadataCommand("unreachable/\udc00")]);
  const failures = [
    command("core.range.transpose-written-pitch", documentTarget, { range: eventRange, transposition: { diatonicSteps: 0, chromaticSemitones: 3 } }),
    command("core.voice.set-default-staff", voiceTarget, { staffId: "absent/\ud800/\udc00" }),
    duplicateBatch,
  ];
  for (const input of failures) {
    const before = pair.read();
    const actual = pair.action(() => pair.ts.submit(input), () => pair.native.submit(input));
    if (actual.status !== "command-rejected") throw new Error("command rejection required");
    assert.deepEqual(pair.read(), before);
    assert.deepEqual(plain(actual.events), []);
    if (input === failures[0]) {
      assert.deepEqual(plain(actual.failure), { code: "command.range-transform-invalid", address: { kind: "note", noteId: identity("note-0-0") }, reason: "derived-pitch-alter-out-of-range" });
    }
    if (input === duplicateBatch) {
      assert.deepEqual(plain(actual.failure), {
        code: "command.batch-child-rejected", failedCommandIndex: 1,
        failure: { code: "command.semantic-invalid", diagnostics: [{ code: "semantic.id-duplicate", messageKey: "core.semantic.id-duplicate", path: ["measureDefinitions", 0, "id"], details: { id: identity("measure") } }] },
      });
    }
  }
  const replay = assertReplay(document, [metadataCommand(`accepted/${text}`), duplicateBatch, metadataCommand("unreachable")]);
  assert.equal(replay.status, "rejected");
  if (replay.status === "rejected") assert.equal(replay.failedCommandIndex, 1);
});

test("legacy Stage-3 submit emits UTF-16 affected addresses and semantic details", () => {
  const pair = pairedSessions();
  for (const input of [metadataCommand(`stage3/${text}`), command("core.voice.set-default-staff", voiceTarget, { staffId: "missing/\ud800" })]) {
    const expected = pair.ts.submit(input);
    const actual = submitRustKernelSmokeCommand(addon, pair.handle, input);
    assert.equal(actual.status, expected.status === "rejected" ? "command-rejected" : expected.status);
    assert.equal(actual.value.documentVersion, expected.documentVersion);
    if (expected.status === "rejected") {
      if (actual.status !== "command-rejected") throw new Error("semantic failure required");
      assert.deepEqual(plain(actual.failure), plain(expected.failure));
    } else if (actual.status === "committed") {
      assert.deepEqual(plain(actual.value.affected), [documentTarget]);
    }
    pair.read();
  }
});

test("the real 512-entry checkpoint serializes the UTF-16 document without changing it", () => {
  const pair = pairedSessions();
  for (let index = 1; index <= 512; index++) {
    const input = metadataCommand(`checkpoint-${index}/${text}`);
    const expected = pair.ts.submit(input);
    const actual = pair.native.submit(input);
    assert.equal(expected.status, "committed");
    if (actual.status !== "committed") throw new Error(`checkpoint command ${index} rejected`);
    assert.equal(actual.value.documentVersion, expected.documentVersion);
    assert.equal(actual.value.stage4Metrics.checkpointAttempts, index === 512 ? 1 : 0);
    assert.equal(actual.value.stage4Metrics.checkpointSuccesses, index === 512 ? 1 : 0);
    assert.equal(actual.value.stage4Metrics.checkpointFailures, 0);
    if (index === 512) {
      const state = pair.read();
      assert.equal(actual.value.stage4Metrics.checkpointMaterializedBytes, Buffer.byteLength(JSON.stringify(state.snapshot.document), "utf8"));
      assert.equal(state.history.undoDepth, 512);
      assert.equal(pair.action(() => pair.ts.undo(), () => pair.native.undo()).status, "committed");
      assert.equal(pair.action(() => pair.ts.redo(), () => pair.native.redo()).status, "committed");
      assert.deepEqual(pair.read().snapshot.document, state.snapshot.document);
    }
  }
});
