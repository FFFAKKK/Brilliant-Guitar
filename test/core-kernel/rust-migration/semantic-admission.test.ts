import assert = require("node:assert/strict");
import { resolve } from "node:path";
import { test } from "node:test";

import { CommandBus, type ScoreDocument } from "../../../src/core-kernel/index";
import {
  createRustKernelSmokeSession,
  createRustKernelStage4Session,
  readRustKernelSmokeSession,
  replayRustKernelStage4,
  submitRustKernelSmokeCommand,
  type KernelStage3MetricsWireV1,
  type RustKernelStage4CompleteNativeAddon,
} from "../../../src/core-kernel/native/rust-kernel-smoke";
import { createCoreScoreFixture } from "../fixtures/core-score";
import { assertRkp4DeepFrozen } from "./rkp-4-fixtures";

const addon = require(resolve("target/rkp-1-node/brilliant_kernel_node.node")) as RustKernelStage4CompleteNativeAddon;
const plain = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

function metadata(bpm: number) {
  const document = createCoreScoreFixture();
  return { commandVersion: 1, commandId: "core.document.set-metadata", target: { kind: "document", documentId: document.id }, payload: { metadata: { ...document.metadata, tempo: { bpm } } } };
}

function fixture(document = createCoreScoreFixture()) {
  const created = createRustKernelSmokeSession(addon, document);
  if (!("handle" in created)) throw new Error("native session required");
  const session = createRustKernelStage4Session(addon, created.handle);
  const ts = CommandBus.create(document);
  if (!ts.ok) throw new Error("TypeScript oracle required");
  const snapshot = () => {
    const read = readRustKernelSmokeSession(addon, created.handle);
    if (read.status !== "ok") throw new Error("native snapshot required");
    return plain(read.value.snapshot);
  };
  return { document, handle: created.handle, session, ts: ts.value, snapshot };
}

function assertLocalTempoWork(metrics: KernelStage3MetricsWireV1, count: number): void {
  assert.equal(metrics.semanticRulesEvaluated, count);
  assert.equal(metrics.fullDocumentScans, 0);
  assert.equal(metrics.fullDocumentClones, 0);
  assert.equal(metrics.fullSemanticValidations, 0);
  assert.equal(metrics.fullSnapshotMaterializations, 0);
  // Rejected attempts include the command's one document-target lookup.
  assert.ok(metrics.entitiesVisited <= 1);
  assert.equal(metrics.orderCollectionsCopied, 0);
}

test("invalid final tempo is rejected before document, history, dirty state or events change", () => {
  for (const bpm of [0, -120]) {
    const { session, ts, snapshot } = fixture();
    const before = snapshot();
    const expected = ts.submit(metadata(bpm));
    assert.equal(expected.status, "rejected");
    const result = session.submit(metadata(bpm));
    assert.equal(result.status, "command-rejected");
    if (result.status !== "command-rejected" || expected.status !== "rejected") throw new Error("semantic rejection required");
    assert.deepEqual(plain(result.failure), plain(expected.failure));
    assert.equal(result.value.documentVersion, 0);
    assert.deepEqual(plain(result.value.history), { undoDepth: 0, redoDepth: 0 });
    assert.equal(result.value.dirty, false);
    assert.deepEqual(result.events, []);
    assertLocalTempoWork(result.value.metrics, 1);
    assertRkp4DeepFrozen(result);
    assert.deepEqual(snapshot(), before);
    assert.equal(session.undo().status, "command-rejected");
    assert.equal(session.redo().status, "command-rejected");
  }
});

test("a batch validates its final metadata and its stored undo/redo effects", () => {
  const { document, session, ts, snapshot } = fixture();
  const batch = { commandVersion: 1, commandId: "core.transaction.batch", target: { kind: "document", documentId: document.id }, payload: { commands: [metadata(0), metadata(121.5)] } };
  assert.equal(ts.submit(batch).status, "committed");
  const result = session.submit(batch);
  assert.equal(result.status, "committed");
  if (result.status !== "committed") throw new Error("batch commit required");
  assertLocalTempoWork(result.value.metrics, 1);
  const undone = session.undo();
  assert.equal(undone.status, "committed");
  if (undone.status !== "committed") throw new Error("undo commit required");
  assertLocalTempoWork(undone.value.metrics, 1);
  const restored = snapshot() as { document: unknown };
  assert.deepEqual(restored.document, plain(document));
  const redone = session.redo();
  assert.equal(redone.status, "committed");
  if (redone.status !== "committed") throw new Error("redo commit required");
  assertLocalTempoWork(redone.value.metrics, 1);
  const replay = replayRustKernelStage4(addon, document, [batch]);
  assert.equal(replay.status, "replayed", JSON.stringify(replay));
  const invalidBatch = { ...batch, payload: { commands: [metadata(130), metadata(0)] } };
  const before = snapshot();
  const rejected = session.submit(invalidBatch);
  const expected = ts.submit(invalidBatch);
  assert.equal(rejected.status, "command-rejected");
  if (rejected.status !== "command-rejected" || expected.status !== "rejected") throw new Error("invalid final batch required");
  assert.deepEqual(plain(rejected.failure), plain(expected.failure));
  assertLocalTempoWork(rejected.value.metrics, 1);
  assert.deepEqual(rejected.events, []);
  assert.deepEqual(snapshot(), before);
  const rejectedReplay = replayRustKernelStage4(addon, document, [batch, invalidBatch]);
  assert.equal(rejectedReplay.status, "rejected");
  if (rejectedReplay.status !== "rejected") throw new Error("replay rejection required");
  assert.equal(rejectedReplay.failedCommandIndex, 1);
  assert.equal(rejectedReplay.documentVersion, 1);
  assert.deepEqual(plain(rejectedReplay.failure), plain(expected.failure));
  assert.deepEqual(plain(rejectedReplay.finalDocument), plain({ ...document, metadata: metadata(121.5).payload.metadata }));
});

test("semantic rejection preserves a persisted undo position, redo branch and event sequence", () => {
  const { document, session } = fixture();
  assert.equal(session.submit(metadata(130)).status, "committed");
  assert.equal(session.markPersisted({ documentId: document.id, documentVersion: 1 }).status, "updated");
  assert.equal(session.submit(metadata(140)).status, "committed");
  const undone = session.undo();
  if (undone.status !== "committed") throw new Error("undo required");
  const lastSequence = undone.events.at(-1)?.eventSequence;
  if (lastSequence === undefined) throw new Error("undo event required");
  const before = session.read();
  if (before.status !== "ok") throw new Error("read required");
  assert.deepEqual(plain(before.value.history), { undoDepth: 1, redoDepth: 1 });
  assert.equal(before.value.dirty, false);
  let delivered = 0;
  session.subscribe(() => { delivered += 1; });

  const rejected = session.submit(metadata(0));
  if (rejected.status !== "command-rejected") throw new Error("semantic rejection required");
  assert.equal(rejected.value.documentVersion, 3);
  assert.deepEqual(rejected.value.history, before.value.history);
  assert.equal(rejected.value.dirty, false);
  assert.deepEqual(rejected.events, []);
  assert.equal(delivered, 0);
  assertLocalTempoWork(rejected.value.metrics, 1);
  const after = session.read();
  if (after.status !== "ok") throw new Error("read required");
  assert.strictEqual(after.value.snapshot, before.value.snapshot);
  assert.deepEqual(after.value.history, before.value.history);
  assert.equal(after.value.dirty, before.value.dirty);

  const redone = session.redo();
  if (redone.status !== "committed") throw new Error("preserved redo required");
  assert.equal(redone.value.documentVersion, 4);
  assert.equal(redone.value.dirty, true);
  assert.equal(redone.events[0]?.eventSequence, lastSequence + 1);
  assert.equal(delivered, redone.events.length);
  const final = session.read();
  if (final.status !== "ok") throw new Error("read required");
  assert.equal((final.value.snapshot.document as ScoreDocument).metadata.tempo.bpm, 140);
});

test("replay permits top-level batches but preserves nested-batch rejection", () => {
  const { document, session, ts, snapshot } = fixture();
  const batch = { commandVersion: 1, commandId: "core.transaction.batch", target: { kind: "document", documentId: document.id }, payload: { commands: [metadata(121)] } };
  const nested = { ...batch, payload: { commands: [metadata(122), batch] } };
  const before = snapshot();
  const expected = ts.submit(nested);
  const rejected = session.submit(nested);
  if (rejected.status !== "command-rejected" || expected.status !== "rejected") throw new Error("nested rejection required");
  assert.deepEqual(plain(rejected.failure), plain(expected.failure));
  assert.deepEqual(snapshot(), before);
  const replay = replayRustKernelStage4(addon, document, [nested]);
  if (replay.status !== "rejected") throw new Error("nested replay rejection required");
  assert.equal(replay.documentVersion, 0);
  assert.deepEqual(plain(replay.failure), plain(expected.failure));
  assert.deepEqual(plain(replay.finalDocument), plain(document));
});

function scoreWithParts(count: number): ScoreDocument {
  const document = createCoreScoreFixture();
  return {
    ...document,
    parts: Array.from({ length: count }, (_, index) => {
      const part = document.parts[0]!;
      const suffix = `-${index}`;
      return {
        ...part,
        id: part.id + suffix,
        staves: part.staves.map((staff) => ({ ...staff, id: staff.id + suffix })),
        measureContents: part.measureContents.map((content) => ({
          ...content,
          voices: content.voices.map((voice) => ({
            ...voice,
            id: voice.id + suffix,
            defaultStaffId: voice.defaultStaffId + suffix,
            sequence: {
              ...voice.sequence,
              events: voice.sequence.events.map((event) => ({
                ...event,
                id: event.id + suffix,
                content: event.content.kind === "rest" ? event.content : {
                  ...event.content,
                  notes: event.content.notes.map((note) => ({ ...note, id: note.id + suffix })),
                },
              })),
            },
          })),
        })),
      };
    }),
  };
}

test("metadata semantic work follows changed tempo, independently of score size", () => {
  for (const partCount of [1, 64, 512]) {
    const { document, session } = fixture(scoreWithParts(partCount));
    const titleOnly = { ...metadata(120), payload: { metadata: { ...document.metadata, title: "Title-only edit", authors: ["New author"] } } };
    const renamed = session.submit(titleOnly);
    if (renamed.status !== "committed") throw new Error("metadata commit required");
    assertLocalTempoWork(renamed.value.metrics, 0);
    const changed = session.submit(metadata(121));
    if (changed.status !== "committed") throw new Error("tempo commit required");
    assertLocalTempoWork(changed.value.metrics, 1);
    const rejected = session.submit(metadata(0));
    if (rejected.status !== "command-rejected") throw new Error("tempo rejection required");
    assertLocalTempoWork(rejected.value.metrics, 1);
    const unchanged = session.submit(metadata(121));
    if (unchanged.status !== "no-op") throw new Error("unchanged tempo required");
    assertLocalTempoWork(unchanged.value.metrics, 0);
  }
});

test("the Stage-3 native entry shares final-state semantic admission", () => {
  const { handle, ts, snapshot } = fixture();
  const before = snapshot();
  const expected = ts.submit(metadata(0));
  const rejected = submitRustKernelSmokeCommand(addon, handle, metadata(0));
  if (rejected.status !== "command-rejected" || expected.status !== "rejected") throw new Error("Stage-3 rejection required");
  assert.deepEqual(plain(rejected.failure), plain(expected.failure));
  assertLocalTempoWork(rejected.value.metrics, 1);
  assert.deepEqual(snapshot(), before);
});

test("native semantic reports enforce closed diagnostics and the aggregate diagnostic limit", () => {
  const { handle } = fixture();
  const seed = submitRustKernelSmokeCommand(addon, handle, metadata(0));
  if (seed.status !== "command-rejected") throw new Error("semantic result required");
  const diagnostics = seed.failure.diagnostics as readonly Record<string, unknown>[];
  const diagnostic = diagnostics[0]!;
  const cases: readonly (readonly [unknown, boolean])[] = [
    [[diagnostic], true],
    [Array.from({ length: 4096 }, () => diagnostic), true],
    [Array.from({ length: 4097 }, () => diagnostic), false],
    [[], false],
    [null, false],
    [[{ ...diagnostic, code: "semantic.invented" }], false],
    [[{ ...diagnostic, messageKey: "invented" }], false],
    [[{ ...diagnostic, path: ["metadata", -1] }], false],
    [[{ ...diagnostic, path: Array.from({ length: 65 }, () => "field") }], false],
    [[{ ...diagnostic, extra: true }], false],
    [[{ ...diagnostic, code: "unsupported.part-count", messageKey: "core.unsupported.part-count" }], false],
  ];
  for (const [index, [value, accepted]] of cases.entries()) {
    const payload = Buffer.from(JSON.stringify({ ...seed, failure: { code: "command.semantic-invalid", diagnostics: value } }));
    const fakeAddon = {
      createKernelSessionV1: addon.createKernelSessionV1,
      readKernelSessionV1: addon.readKernelSessionV1,
      submitKernelStage3V1: () => payload,
    };
    const result = submitRustKernelSmokeCommand(fakeAddon, handle, metadata(0));
    assert.equal(result.status, accepted ? "command-rejected" : "rejected", `diagnostic wire case ${index}`);
    if (!accepted) {
      assert.deepEqual(plain(result), { apiVersion: 1, status: "rejected", failure: { failureVersion: 1, code: "bridge.internal" } });
    }
    assertRkp4DeepFrozen(result);
  }
});
