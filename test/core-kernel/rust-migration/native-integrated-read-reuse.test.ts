import { test } from "node:test";
import assert = require("node:assert/strict");
import { resolve } from "node:path";
import { CommandBus } from "../../../src/core-kernel/index";
import { installNativeIntegratedBackendV2, type IntegratedNativeAddonV2 } from "../../../src/core-kernel/native/integrated-command-bus";
import { createCoreScoreFixture } from "../fixtures/core-score";
import { crossCatalog } from "../fixtures/cross-plugin-relationship";
const addon = require(resolve("target/wasm-v1/brilliant_kernel_node.node")) as IntegratedNativeAddonV2;
const catalog = crossCatalog();
const metadata = { commandVersion: 1, commandId: "core.document.set-metadata", target: { kind: "document", documentId: "score-1" },
  payload: { metadata: { ...createCoreScoreFixture().metadata, title: "changed" } } };

test("Older Native full-read compatibility probes once and never retries actual read failures", () => {
  for (const code of ["command.invalid-envelope", "command.required-contribution-incompatible", "command.required-contribution-unavailable"]) {
    let probes = 0, fullReads = 0, fail = false;
    const transport: IntegratedNativeAddonV2 = { createIntegratedKernelSessionV2(input, callback) {
      const operate = addon.createIntegratedKernelSessionV2(input, callback);
      return request => {
        const input = JSON.parse(request.toString("utf8"));
        if (input.operation === "read") {
          if ("knownSnapshotVersion" in input) { probes++; return Buffer.from(JSON.stringify({ ok: false, failure: { code } })); }
          fullReads++;
          if (fail) return Buffer.from('{"ok":false,"failure":{"code":"command.internal-error"}}');
        }
        return operate(request);
      };
    } };
    const restore = installNativeIntegratedBackendV2(transport);
    try {
      const created = CommandBus.createIntegrated(createCoreScoreFixture(), catalog); assert.ok(created.ok);
      const first = created.value.read(); assert.ok(first.ok);
      for (let i = 0; i < 2; i++) assert.deepEqual(created.value.read(), first);
      assert.equal(probes, 1); assert.equal(fullReads, 3);
      fail = true;
      assert.deepEqual(created.value.read(), { ok: false, failure: { code: "read.invariant-violation" } });
      assert.equal(probes, 1); assert.equal(fullReads, 4);
    } finally { restore(); }
  }
});

test("Native repeated reads reuse document bytes while retaining live history, dirty state and subscriber visibility", () => {
  const replies: { bytes: number; document: unknown }[] = [];
  const transport: IntegratedNativeAddonV2 = { createIntegratedKernelSessionV2(input, callback) {
    const operate = addon.createIntegratedKernelSessionV2(input, callback);
    return request => {
      const output = operate(request), result = JSON.parse(output.toString("utf8"));
      if (JSON.parse(request.toString("utf8")).operation === "read") replies.push({ bytes: output.length, document: result.state?.snapshot.document });
      return output;
    };
  } };
  const oracle = CommandBus.createIntegrated(createCoreScoreFixture(), catalog);
  assert.ok(oracle.ok);
  const restore = installNativeIntegratedBackendV2(transport);
  let created;
  try { created = CommandBus.createIntegrated(createCoreScoreFixture(), catalog); } finally { restore(); }
  assert.ok(created.ok);
  const bus = created.value, first = bus.read(), next = bus.read();
  assert.ok(first.ok && next.ok);
  assert.deepEqual(next, oracle.value.read());
  assert.equal(first.value.snapshot, next.value.snapshot);
  assert.equal(replies.at(-1)!.document, null);
  assert.ok(replies.at(-1)!.bytes < replies[0]!.bytes / 2);
  const seen: unknown[] = [];
  bus.subscribe(() => seen.push(bus.read()));
  assert.deepEqual(bus.submit(metadata), oracle.value.submit(metadata));
  assert.deepEqual(bus.read(), oracle.value.read());
  assert.deepEqual(seen.at(-1), bus.read());
  const changed = bus.read(); assert.ok(changed.ok);
  assert.notEqual(changed.value.snapshot, first.value.snapshot);
  const checkpoint = { documentId: "score-1", documentVersion: 1 };
  assert.deepEqual(bus.markPersisted(checkpoint), oracle.value.markPersisted(checkpoint));
  assert.deepEqual(bus.read(), oracle.value.read());
  assert.equal(replies.at(-1)!.document, null);
  assert.deepEqual(bus.submit({}), oracle.value.submit({}));
  for (const operation of ["undo", "redo"] as const) {
    assert.deepEqual(bus[operation](), oracle.value[operation]());
    assert.deepEqual(bus.read(), oracle.value.read());
  }
  assert.equal(first.value.snapshot.document.metadata.title, "Core fixture");
  assert.ok(Object.isFrozen(first.value.snapshot.document.parts[0]!.measureContents));
});

test("Cached Native snapshots do not hide reentrant reads or mismatched omitted-document responses", () => {
  let bus: Extract<ReturnType<typeof CommandBus.createIntegrated>, { ok: true }>["value"] | undefined;
  let corrupt = false;
  const reentrant: unknown[] = [];
  const transport: IntegratedNativeAddonV2 = { createIntegratedKernelSessionV2(input, callback) {
    const operate = addon.createIntegratedKernelSessionV2(input, request => {
      if (bus) reentrant.push(bus.read());
      return callback(request);
    });
    return request => {
      const output = operate(request);
      if (!corrupt || JSON.parse(request.toString("utf8")).operation !== "read") return output;
      const result = JSON.parse(output.toString("utf8"));
      result.state.snapshot.document = null;
      result.state.snapshot.documentVersion += 1;
      return Buffer.from(JSON.stringify(result));
    };
  } };
  const restore = installNativeIntegratedBackendV2(transport);
  try {
    const created = CommandBus.createIntegrated(createCoreScoreFixture(), catalog); assert.ok(created.ok);
    bus = created.value;
    assert.ok(bus.read().ok);
    assert.equal(bus.submit(metadata).status, "committed");
    assert.ok(reentrant.length > 0);
    for (const result of reentrant) assert.deepEqual(result, { ok: false, failure: { code: "read.invariant-violation" } });
    assert.ok(bus.read().ok);
    corrupt = true;
    assert.deepEqual(bus.read(), { ok: false, failure: { code: "read.invariant-violation" } });
    corrupt = false;
    assert.ok(bus.read().ok);
  } finally { restore(); }
});
