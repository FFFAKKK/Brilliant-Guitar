import assert = require("node:assert/strict");
import { resolve } from "node:path";
import { test } from "node:test";
import { createRustKernelSmokeSession, createRustKernelStage4Session, type RustKernelStage4CompleteNativeAddon } from "../../../src/core-kernel/native/rust-kernel-smoke";
import { createCoreScoreFixture } from "../fixtures/core-score";
import { buildCommandAdmissionOracle } from "./command-admission-oracle";

const addon = require(resolve("target/rkp-1-node/brilliant_kernel_node.node")) as RustKernelStage4CompleteNativeAddon;
const plain = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

test("native command boundary rejects every shape-invalid entry in the independent admission corpus", () => {
  for (const entry of buildCommandAdmissionOracle().cases) {
    if (entry.expected.ok) continue;
    const created = createRustKernelSmokeSession(addon, createCoreScoreFixture());
    if (!("handle" in created)) throw new Error("native create required");
    const session = createRustKernelStage4Session(addon, created.handle);
    const before = session.read();
    if (before.status !== "ok") throw new Error("read required");
    const result = session.submit(entry.input);
    if (result.status !== "command-rejected") throw new Error(`${entry.id}: rejection required: ${JSON.stringify(result)}`);
    assert.deepEqual(plain(result.failure), plain(entry.expected.failure), entry.id);
    assert.deepEqual(result.events, [], entry.id);
    const after = session.read();
    if (after.status !== "ok") throw new Error("final read required");
    assert.strictEqual(after.value.snapshot, before.value.snapshot, entry.id);
    assert.deepEqual(after.value.history, before.value.history, entry.id);
    assert.equal(after.value.dirty, before.value.dirty, entry.id);
  }
});
