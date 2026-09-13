import { test } from "node:test";
import assert = require("node:assert/strict");
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { CommandBus, type ScoreDocument } from "../../../src/core-kernel/index";
import { compileOfficialModuleCatalogV1 } from "../../../src/core-kernel/module-sdk/index";
import { installNativeWasmOnlyIntegratedBackendV1, type WasmNativeAddonV1 } from "../../../src/native-host/wasm-bindings";
import { CVN6_MANIFEST, CVN6_REGISTRATION_ENTRIES, resetCvn6Callbacks, cvn6CallbackTrace } from "../fixtures/cvn-6-synthetic-official-modules";
import { createNativeWorkloadScore } from "../fixtures/native-workload";

const addon = require(resolve("target/wasm-v1/brilliant_kernel_node.node")) as WasmNativeAddonV1;
const guest = readFileSync("test/core-kernel/fixtures/wasm-guest/guest.wasm");
function command(module: string, marker: string, noteId = "note-1") {
  return { commandVersion: 1, commandId: `fixture.${module}.apply`,
    target: module === "score" ? { kind: "document", documentId: "score-1" } : { kind: "part", partId: "part-1" },
    payload: { noteId, pitch: { step: "G", alter: 0, octave: 4 }, schemaVersion: 1, marker } };
}
function batch(commands: unknown[]) {
  return { commandVersion: 1, commandId: "core.transaction.batch", target: { kind: "document", documentId: "score-1" }, payload: { commands } };
}

test("Wasm guest edits 64-bar full views under unchanged budgets with oracle-equivalent history", () => {
  for (const measures of [64]) {
    const score = createNativeWorkloadScore(measures);
    const initial: ScoreDocument = { ...score, extensions: [...score.extensions,
      { namespace: "fixture.score", schemaVersion: 1, owner: { kind: "score" },
        payload: { "$serde_json::private::RawValue": "true", marker: "seed", negativeZero: -0 } },
      { namespace: "opaque.uninstalled", schemaVersion: 1, owner: { kind: "score" },
        payload: { keep: ["\ud800", -0, { deep: true }] } }] };
    const compiled = compileOfficialModuleCatalogV1(CVN6_MANIFEST, CVN6_REGISTRATION_ENTRIES);
    assert.ok(compiled.ok);
    const oracle = CommandBus.createIntegrated(initial, compiled.catalog);
    assert.ok(oracle.ok);
    const seen = new Set<string>();
    const restore = installNativeWasmOnlyIntegratedBackendV1({ ...addon, createWasmModuleExecutorV1(...args) {
      const execute = addon.createWasmModuleExecutorV1(...args);
      return input => {
        const request = JSON.parse(input.toString("utf8"));
        seen.add(request.operation);
        const view = request.operation === "effectTransform" ? request.arguments[0].view
          : ["commandPrepare", "validate", "classify"].includes(request.operation) ? request.arguments[0] : undefined;
        if (view !== undefined) {
          assert.equal(view.coreDocument.parts[0].measureContents.length, measures);
          assert.equal(view.coreDocument.extensions, undefined);
          assert.ok(view.compatibleExtensions.every((block: { namespace: string }) => block.namespace !== "opaque.uninstalled"));
        }
        return execute(input);
      };
    } }, compiled.catalog, ["score", "part"].map(module => ({
      moduleId: `fixture.${module}.module`, contributionId: `fixture.${module}.contribution.v1`, abiVersion: 1,
      sha256: createHash("sha256").update(guest).digest("hex"), bytes: guest,
    })));
    try {
      const native = CommandBus.createIntegrated(initial, compiled.catalog);
      assert.ok(native.ok);
      assert.deepEqual(native.value.read(), oracle.value.read());
      resetCvn6Callbacks();
      const events: unknown[] = [], oracleEvents: unknown[] = [];
      native.value.subscribe((event: unknown) => events.push(event));
      oracle.value.subscribe((event: unknown) => oracleEvents.push(event));
      const actions = [command("score", "first"), command("part", "second", `note-${measures * 4}`),
        batch([command("score", "batch-score"), command("part", "batch-part")])];
      for (const input of actions) {
        const result = native.value.submit(input);
        assert.equal(result.status, "committed", `${measures}: ${JSON.stringify(result)}`);
        assert.deepEqual(cvn6CallbackTrace, []);
        assert.deepEqual(result, oracle.value.submit(input));
        resetCvn6Callbacks();
        assert.deepEqual(native.value.read(), oracle.value.read());
      }
      assert.deepEqual(native.value.undo(), oracle.value.undo());
      resetCvn6Callbacks();
      assert.deepEqual(native.value.read(), oracle.value.read());
      assert.deepEqual(native.value.redo(), oracle.value.redo());
      resetCvn6Callbacks();
      assert.deepEqual(native.value.read(), oracle.value.read());
      const before = native.value.read(), eventCount = events.length;
      assert.equal(native.value.submit(batch([command("score", "rolled-back"), command("part", "fuel")])).status, "rejected");
      assert.deepEqual(native.value.read(), before);
      assert.equal(events.length, eventCount);
      assert.deepEqual(native.value.submit(command("score", "recovered")), oracle.value.submit(command("score", "recovered")));
      assert.deepEqual(native.value.read(), oracle.value.read());
      assert.deepEqual(events, oracleEvents);
      assert.deepEqual([...seen].sort(), ["classify", "commandDecode", "commandPrepare", "effectDecode", "effectTransform", "validate"]);
    } finally { restore(); resetCvn6Callbacks(); }
  }
});

test("Borrowed guest views can read actual Core notes and still reject oversized work atomically", () => {
  const compiled = compileOfficialModuleCatalogV1(CVN6_MANIFEST, CVN6_REGISTRATION_ENTRIES);
  assert.ok(compiled.ok);
  const restore = installNativeWasmOnlyIntegratedBackendV1(addon, compiled.catalog, ["score", "part"].map(module => ({
    moduleId: `fixture.${module}.module`, contributionId: `fixture.${module}.contribution.v1`, abiVersion: 1,
    sha256: createHash("sha256").update(guest).digest("hex"), bytes: guest,
  })));
  try {
    const small = CommandBus.createIntegrated(createNativeWorkloadScore(64), compiled.catalog);
    assert.ok(small.ok);
    assert.equal(small.value.submit(command("score", "read-last-note")).status, "committed");
    const first = small.value.read(); assert.ok(first.ok);
    assert.equal(first.value.snapshot.document.extensions.find(block => block.namespace === "fixture.score")!.payload.marker, "observed:note-256:C");
    assert.equal(small.value.submit(command("part", "change-last", "note-256")).status, "committed");
    assert.equal(small.value.submit(command("score", "read-last-note")).status, "committed");
    const second = small.value.read(); assert.ok(second.ok);
    assert.equal(second.value.snapshot.document.extensions.find(block => block.namespace === "fixture.score")!.payload.marker, "observed:note-256:G");

    // Explicit remaining capacity failure, never counted as a successful edit.
    const large = CommandBus.createIntegrated(createNativeWorkloadScore(256), compiled.catalog);
    assert.ok(large.ok);
    const before = large.value.read(), events: unknown[] = [];
    large.value.subscribe((event: unknown) => events.push(event));
    const metadata = { commandVersion: 1, commandId: "core.document.set-metadata", target: { kind: "document", documentId: "score-1" },
      payload: { metadata: { ...createNativeWorkloadScore(256).metadata, title: "must roll back" } } };
    assert.equal(large.value.submit(batch([metadata, command("score", "still-too-large")])).status, "rejected");
    assert.deepEqual(large.value.read(), before);
    assert.deepEqual(events, []);
    assert.equal(large.value.submit(metadata).status, "committed");
    assert.equal(large.value.undo().status, "committed");
  } finally { restore(); resetCvn6Callbacks(); }
});
