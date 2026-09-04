import assert = require("node:assert/strict");
import { resolve } from "node:path";
import { test } from "node:test";

import {
  createRustKernelSmokeSession,
  createRustKernelStage4Session,
  type RustKernelStage4NativeAddon,
} from "../../../src/core-kernel/native/rust-kernel-smoke";
import { createCoreScoreFixture } from "../fixtures/core-score";
import {
  assertRkp4DeepFrozen,
  createRkp4MetadataCommand,
  type RawRkp4NativeAddon,
} from "./rkp-4-fixtures";

const addonPath = resolve(
  process.cwd(),
  "target/rkp-1-node/brilliant_kernel_node.node",
);
// eslint-disable-next-line @typescript-eslint/no-require-imports
const addon = require(addonPath) as RawRkp4NativeAddon;

function createStage4Session(nativeAddon: RustKernelStage4NativeAddon = addon) {
  const created = createRustKernelSmokeSession(
    nativeAddon,
    createCoreScoreFixture(),
  );
  assert.equal(created.result.status, "created");
  if (!("handle" in created)) throw new Error("native create rejected");
  return {
    handle: created.handle,
    session: createRustKernelStage4Session(nativeAddon, created.handle),
  };
}

test("Stage-4 reads reuse one frozen JS snapshot and preserve older revisions", () => {
  const { session } = createStage4Session();
  const first = session.read();
  assert.equal(first.status, "ok");
  if (first.status !== "ok") throw new Error("first read rejected");
  assert.equal(first.value.stage4Metrics.fullSnapshotMaterializations, 1);
  assertRkp4DeepFrozen(first);
  const firstSnapshot = first.value.snapshot;
  const firstDocument = firstSnapshot.document as {
    readonly metadata: { readonly title: string };
  };
  assert.equal(firstDocument.metadata.title, "Core fixture");

  const second = session.read();
  assert.equal(second.status, "ok");
  if (second.status !== "ok") throw new Error("second read rejected");
  assert.equal(second.value.stage4Metrics.fullSnapshotMaterializations, 0);
  assert.equal(second.value.snapshot, firstSnapshot);
  assertRkp4DeepFrozen(second);

  const committed = session.submit(createRkp4MetadataCommand("new revision"));
  assert.equal(committed.status, "committed");
  const third = session.read();
  assert.equal(third.status, "ok");
  if (third.status !== "ok") throw new Error("third read rejected");
  assert.equal(third.value.stage4Metrics.fullSnapshotMaterializations, 1);
  assert.notEqual(third.value.snapshot, firstSnapshot);
  assert.equal(
    (third.value.snapshot.document as {
      readonly metadata: { readonly title: string };
    }).metadata.title,
    "new revision",
  );
  assert.equal(firstDocument.metadata.title, "Core fixture");

  const persisted = session.markPersisted({
    documentId: "score-1",
    documentVersion: 1,
  });
  assert.equal(persisted.status, "updated");
  const afterPersisted = session.read();
  assert.equal(afterPersisted.status, "ok");
  if (afterPersisted.status !== "ok") {
    throw new Error("post-persist read rejected");
  }
  assert.equal(afterPersisted.value.snapshot, third.value.snapshot);
  assert.equal(afterPersisted.value.dirty, false);
});

test("all six selector families return detached index-backed values", () => {
  const { session } = createStage4Session();
  const selectors = [
    { selectorId: "core.selector.score-metadata" },
    {
      selectorId: "core.selector.score-entity",
      address: { kind: "event", eventId: "event-1" },
    },
    {
      selectorId: "core.selector.score-entity-ownership",
      address: { kind: "event", eventId: "event-1" },
    },
    {
      selectorId: "core.selector.score-range",
      range: {
        kind: "voice-event-range",
        start: { kind: "voice-event", voiceId: "voice-1", eventId: "event-1" },
        end: { kind: "voice-event", voiceId: "voice-1", eventId: "event-3" },
      },
    },
    { selectorId: "core.selector.history-state" },
    { selectorId: "core.selector.dirty-state" },
  ] as const;

  for (const selector of selectors) {
    const result = session.select(selector);
    assert.equal(result.status, "ok");
    if (result.status !== "ok") throw new Error("selector boundary rejected");
    assert.equal(result.value.selection.ok, true);
    assert.equal(result.value.stage4Metrics.fullSnapshotMaterializations, 0);
    assert.ok(result.value.stage4Metrics.selectorRecordsVisited >= 1);
    assertRkp4DeepFrozen(result);
  }

  const entity = session.select({
    selectorId: "core.selector.score-entity",
    address: { kind: "note", noteId: "note-1" },
  });
  assert.equal(entity.status, "ok");
  if (entity.status !== "ok" || !entity.value.selection.ok) {
    throw new Error("note selector rejected");
  }
  const selectedNote = entity.value.selection.value as {
    readonly kind: string;
    readonly value: {
      readonly id: string;
      readonly writtenPitch: unknown;
    };
  };
  assert.equal(selectedNote.kind, "note");
  assert.equal(selectedNote.value.id, "note-1");
  assert.equal(
    JSON.stringify(selectedNote.value.writtenPitch),
    JSON.stringify({ step: "C", alter: 0, octave: 4 }),
  );

  const missing = session.select({
    selectorId: "core.selector.score-entity",
    address: { kind: "event", eventId: "missing" },
  });
  assert.equal(missing.status, "ok");
  if (missing.status !== "ok") throw new Error("missing selector boundary rejected");
  assert.equal(missing.value.selection.ok, false);
  if (missing.value.selection.ok) throw new Error("missing selector succeeded");
  assert.equal(missing.value.selection.failure.code, "read.entity-not-found");

  const document = session.select({
    selectorId: "core.selector.score-entity",
    address: { kind: "document", documentId: "score-1" },
  });
  assert.equal(document.status, "ok");
  if (document.status !== "ok") throw new Error("document selector rejected");
  assert.equal(document.value.stage4Metrics.fullSnapshotMaterializations, 1);
});

test("Stage-4 adapter rejects hostile input and malformed native output without aliasing", () => {
  const { handle } = createStage4Session();
  let nativeCalls = 0;
  const hostileAddon: RustKernelStage4NativeAddon = {
    createKernelSessionV1: addon.createKernelSessionV1,
    readKernelSessionV1: addon.readKernelSessionV1,
    submitKernelStage3V1: addon.submitKernelStage3V1,
    operateKernelStage4V1: () => {
      nativeCalls += 1;
      throw new Error("must not be called");
    },
  };
  const hostileSession = createRustKernelStage4Session(hostileAddon, handle);
  const command = {};
  Object.defineProperty(command, "commandVersion", {
    enumerable: true,
    get: () => {
      throw new Error("getter must not run");
    },
  });
  const rejected = hostileSession.submit(command);
  assert.equal(rejected.status, "rejected");
  assert.equal(nativeCalls, 0);
  assertRkp4DeepFrozen(rejected);

  const malformedAddon: RustKernelStage4NativeAddon = {
    createKernelSessionV1: addon.createKernelSessionV1,
    readKernelSessionV1: addon.readKernelSessionV1,
    submitKernelStage3V1: addon.submitKernelStage3V1,
    operateKernelStage4V1: () => Buffer.from("{}"),
  };
  const malformed = createRustKernelStage4Session(malformedAddon, handle).undo();
  assert.deepEqual(malformed, {
    apiVersion: 1,
    status: "rejected",
    failure: { failureVersion: 1, code: "bridge.internal" },
  });
  assertRkp4DeepFrozen(malformed);

  const oversizedAddon: RustKernelStage4NativeAddon = {
    createKernelSessionV1: addon.createKernelSessionV1,
    readKernelSessionV1: addon.readKernelSessionV1,
    submitKernelStage3V1: addon.submitKernelStage3V1,
    operateKernelStage4V1: () => Buffer.alloc(64 * 1024 * 1024 + 1),
  };
  const oversized = createRustKernelStage4Session(oversizedAddon, handle).redo();
  assert.equal(oversized.status, "rejected");
  assert.equal(oversized.failure.code, "bridge.response-too-large");
  assertRkp4DeepFrozen(oversized);
});
