import assert = require("node:assert/strict");
import { resolve } from "node:path";
import { test } from "node:test";
import { CommandBus } from "../../../src/core-kernel/index";
import { createRustKernelSmokeSession, createRustKernelStage4Session, type RustKernelStage4CompleteNativeAddon } from "../../../src/core-kernel/native/rust-kernel-smoke";
import { createCoreScoreFixture } from "../fixtures/core-score";
import { createRkp4MetadataCommand } from "./rkp-4-fixtures";

function compareRejectedOrCommitted(command: unknown) {
  const document = createCoreScoreFixture();
  const reference = CommandBus.create(document);
  assert.ok(reference.ok);
  const addon = require(resolve("target/rkp-1-node/brilliant_kernel_node.node")) as RustKernelStage4CompleteNativeAddon;
  const created = createRustKernelSmokeSession(addon, document);
  assert.ok("handle" in created);
  const session = createRustKernelStage4Session(addon, created.handle);
  const expected = reference.value.submit(command);
  const actual = session.submit(command);
  if (expected.status === "rejected") {
    assert.equal(actual.status, "command-rejected", JSON.stringify(command));
    assert.ok(actual.status === "command-rejected");
    assert.deepEqual(JSON.parse(JSON.stringify(actual.failure)), expected.failure, JSON.stringify(command));
    assert.equal(actual.value.documentVersion, 0);
    assert.deepEqual(JSON.parse(JSON.stringify(actual.value.history)), { undoDepth: 0, redoDepth: 0 });
    assert.deepEqual(actual.events, []);
  } else {
    assert.equal(expected.status, "committed");
    assert.equal(actual.status, "committed");
  }
  const expectedRead = reference.value.read();
  const actualRead = session.read();
  assert.ok(expectedRead.ok);
  assert.equal(actualRead.status, "ok");
  assert.ok(actualRead.status === "ok");
  assert.deepEqual(JSON.parse(JSON.stringify(actualRead.value.snapshot.document)), expectedRead.value.snapshot.document);
}

test("native lossless request capture distinguishes unknown JS string command IDs from invalid JSON", () => {
  for (const commandId of ["\ud800", "\udc00", "😀", "\ufffd", "\\ud800"]) {
    compareRejectedOrCommitted({ ...createRkp4MetadataCommand("capture ID"), commandId });
  }
});

test("native command version validation matches the signed JS safe-integer domain", () => {
  for (const commandVersion of [-Number.MAX_SAFE_INTEGER, -1, -0, 1, 2, 1.5, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER + 1, Number.MAX_VALUE]) {
    compareRejectedOrCommitted({ ...createRkp4MetadataCommand("capture version"), commandVersion });
  }
});

test("raw native protocol API versions retain integer spelling and failure precedence", () => {
  const addon = require(resolve("target/rkp-1-node/brilliant_kernel_node.node")) as RustKernelStage4CompleteNativeAddon;
  const created = createRustKernelSmokeSession(addon, createCoreScoreFixture());
  assert.ok("handle" in created);
  const command = JSON.stringify(createRkp4MetadataCommand("raw protocol"));
  const cases = [
    ["1.0", undefined], ["1e0", undefined],
    ["-0", "contract.unsupported-api-version"],
    ["-1", "codec.invalid-shape"],
    ["9007199254740992", "contract.unsupported-api-version"],
    ["9007199254740992.0", "codec.invalid-shape"],
    ["9007199254740992e0", "codec.invalid-shape"],
    ["18446744073709551615", "contract.unsupported-api-version"],
    ["18446744073709551616", "codec.invalid-shape"],
    ["18446744073709551616.0", "codec.invalid-shape"],
  ] as const;
  for (const [raw, code] of cases) {
    const response = addon.submitKernelStage3V1(created.handle, Buffer.from(`{"apiVersion":${raw},"command":${command}}`));
    assert.ok(Buffer.isBuffer(response));
    const result = JSON.parse(response.toString("utf8"));
    if (code === undefined) {
      assert.ok(["committed", "no-op"].includes(result.status), raw);
    } else {
      assert.equal(result.status, "rejected", raw);
      assert.equal(result.failure.code, code, raw);
      if (code === "codec.invalid-shape") {
        assert.deepEqual(result.failure.path, ["apiVersion"], raw);
        assert.equal(result.failure.violation, "wrong-type", raw);
      }
    }
  }
});
