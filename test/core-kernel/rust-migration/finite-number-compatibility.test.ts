import assert = require("node:assert/strict");
import { resolve } from "node:path";
import { test } from "node:test";

import { CommandBus } from "../../../src/core-kernel/index";
import {
  createRustKernelSmokeSession,
  createRustKernelStage4Session,
  readRustKernelSmokeSession,
  replayRustKernelStage4,
  type RustKernelStage4CompleteNativeAddon,
} from "../../../src/core-kernel/native/rust-kernel-smoke";
import { createCoreScoreFixture } from "../fixtures/core-score";

const addon = require(resolve("target/rkp-1-node/brilliant_kernel_node.node")) as RustKernelStage4CompleteNativeAddon;

function assertJsonEqual(actual: unknown, expected: unknown): void {
  assert.deepEqual(JSON.parse(JSON.stringify(actual)), JSON.parse(JSON.stringify(expected)));
}

test("finite decimal tempo and opaque JSON numbers preserve TypeScript import and round-trip semantics", () => {
  for (const bpm of [120.5, Number.MIN_VALUE, Number.MAX_VALUE]) {
    const fixture = createCoreScoreFixture();
    const document = {
      ...fixture,
      metadata: { ...fixture.metadata, tempo: { bpm } },
      extensions: [...fixture.extensions, {
        namespace: "example.finite-numbers",
        schemaVersion: 1,
        owner: { kind: "score" as const },
        payload: {
          values: [0.125, -0.125, 1e100, -1e100, Number.MIN_VALUE, Number.MAX_VALUE],
          nested: { bpm: 0.75, numerator: 0.5, schemaVersion: 0.25 },
        },
      }],
    };
    assert.equal(CommandBus.create(document).ok, true, "accepted TypeScript input");
    const created = createRustKernelSmokeSession(addon, document);
    assert.equal(created.result.status, "created", `finite tempo ${bpm}`);
    if (!("handle" in created)) throw new Error("native session required");
    const read = readRustKernelSmokeSession(addon, created.handle);
    assert.equal(read.status, "ok");
    if (read.status !== "ok") throw new Error("native read required");
    assertJsonEqual(read.value.snapshot.document, document);
  }
});

test("decimal metadata commits, undo/redo and replay use one native history", () => {
  const document = createCoreScoreFixture();
  const command = {
    commandVersion: 1,
    commandId: "core.document.set-metadata",
    target: { kind: "document", documentId: document.id },
    payload: { metadata: { ...document.metadata, tempo: { bpm: 120.5 } } },
  };
  const ts = CommandBus.create(document);
  if (!ts.ok) throw new Error("oracle session required");
  assert.equal(ts.value.submit(command).status, "committed");
  const created = createRustKernelSmokeSession(addon, document);
  if (!("handle" in created)) throw new Error("native session required");
  const session = createRustKernelStage4Session(addon, created.handle);
  assert.equal(session.submit(command).status, "committed");
  assert.equal(session.undo().status, "committed");
  const restored = readRustKernelSmokeSession(addon, created.handle);
  if (restored.status !== "ok") throw new Error("native read required");
  assertJsonEqual(restored.value.snapshot.document, document);
  assert.equal(session.redo().status, "committed");
  const expected = { ...document, metadata: command.payload.metadata };
  const redone = readRustKernelSmokeSession(addon, created.handle);
  if (redone.status !== "ok") throw new Error("native read required");
  assertJsonEqual(redone.value.snapshot.document, expected);
  const replay = replayRustKernelStage4(addon, document, [command]);
  assert.equal(replay.status, "replayed");
  if (replay.status !== "replayed") throw new Error("native replay required");
  assertJsonEqual(replay.finalDocument, expected);
});

test("seeded IEEE 754 payload values round-trip without changing a bit", () => {
  const values: number[] = [];
  const bytes = Buffer.alloc(8);
  let seed = 0x0123456789abcdefn;
  for (let index = 0; index < 2048; index += 1) {
    seed = BigInt.asUintN(64, seed * 6364136223846793005n + 1442695040888963407n);
    bytes.writeBigUInt64LE(seed);
    const value = bytes.readDoubleLE();
    if (Number.isFinite(value)) values.push(value);
  }
  const fixture = createCoreScoreFixture();
  const document = {
    ...fixture,
    extensions: [{
      namespace: "example.number-roundtrip", schemaVersion: 1,
      owner: { kind: "score" as const }, payload: { values },
    }],
  };
  assert.equal(CommandBus.create(document).ok, true);
  const created = createRustKernelSmokeSession(addon, document);
  assert.equal(created.result.status, "created");
  if (!("handle" in created)) throw new Error("native session required");
  const read = readRustKernelSmokeSession(addon, created.handle);
  if (read.status !== "ok") throw new Error("native read required");
  const extension = (read.value.snapshot.document as typeof document).extensions[0];
  assert.ok(extension);
  const actual = extension.payload.values;
  assert.equal(actual.length, values.length);
  values.forEach((value, index) => assert.equal(actual[index], value, `sample ${index}`));
});

test("finite data support does not widen exact integer fields or admit non-finite values", () => {
  const fixture = createCoreScoreFixture();
  for (const numerator of [0.5, Number.MAX_SAFE_INTEGER + 1]) {
    const document = {
      ...fixture,
      measureDefinitions: fixture.measureDefinitions.map((measure) => ({
        ...measure, meter: { ...measure.meter, numerator },
      })),
    };
    assert.equal(CommandBus.create(document).ok, false);
    const created = createRustKernelSmokeSession(addon, document);
    assert.equal(created.result.status, "rejected");
    assert.equal("handle" in created, false);
  }
  for (const bpm of [NaN, Infinity, -Infinity]) {
    const created = createRustKernelSmokeSession(addon, {
      ...fixture, metadata: { ...fixture.metadata, tempo: { bpm } },
    });
    assert.equal(created.result.status, "rejected");
    assert.equal("handle" in created, false);
  }
});
