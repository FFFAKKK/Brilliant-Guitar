import { test } from "node:test";
import assert = require("node:assert/strict");
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { CommandBus, migrateKernelExtension, type ScoreDocument } from "../../../src/core-kernel/index";
import { compileOfficialModuleCatalogV1 } from "../../../src/core-kernel/module-sdk/index";
import { compileContributionReadCatalogV1 } from "../../../src/core-kernel/module-sdk/extension-reads";
import { installNativeWasmCoreReadsBackendV2 } from "../../../src/native-host/wasm-core-reads";
import { installNativeWasmOnlyIntegratedBackendV1, type WasmNativeAddonV1 } from "../../../src/native-host/wasm-bindings";
import { CVN6_MANIFEST, CVN6_REGISTRATION_ENTRIES, resetCvn6Callbacks, cvn6CallbackTrace } from "../fixtures/cvn-6-synthetic-official-modules";
import { createNativeWorkloadScore } from "../fixtures/native-workload";

const addon = require(resolve("target/wasm-v1/brilliant_kernel_node.node")) as Parameters<typeof installNativeWasmCoreReadsBackendV2>[0];
const guest = readFileSync("test/core-kernel/fixtures/wasm-guest/guest-v2.wasm");
function bindings(bytes = guest) {
  return ["score", "part"].map(module => ({
    moduleId: `fixture.${module}.module`, contributionId: `fixture.${module}.contribution.v1`, abiVersion: 1,
    sha256: createHash("sha256").update(bytes).digest("hex"), bytes,
  }));
}
function catalog() {
  const result = compileOfficialModuleCatalogV1(CVN6_MANIFEST, CVN6_REGISTRATION_ENTRIES);
  assert.ok(result.ok);
  return result.catalog;
}
function command(marker: string, noteId = "note-1024", step = "D", module = "score") {
  return { commandVersion: 1, commandId: `fixture.${module}.apply`,
    target: module === "score" ? { kind: "document", documentId: "score-1" } : { kind: "part", partId: "part-1" },
    payload: { noteId, pitch: { step, alter: 0, octave: 4 }, schemaVersion: 1, marker } };
}
function pitch(step: string, noteId = "note-1024") {
  return { commandVersion: 1, commandId: "core.note.set-written-pitch", target: { kind: "note", noteId },
    payload: { writtenPitch: { step, alter: 0, octave: 4 } } };
}
function batch(commands: unknown[]) {
  return { commandVersion: 1, commandId: "core.transaction.batch", target: { kind: "document", documentId: "score-1" }, payload: { commands } };
}
function create(initial: ScoreDocument, compiled = catalog(), transport = addon) {
  const restore = installNativeWasmCoreReadsBackendV2(transport, compiled, bindings());
  try {
    const result = CommandBus.createIntegrated(initial, compiled);
    assert.ok(result.ok, JSON.stringify(result));
    return result.value;
  } finally { restore(); }
}
function block(bus: ReturnType<typeof create>, namespace = "fixture.score") {
  const state = bus.read(); assert.ok(state.ok);
  return state.value.snapshot.document.extensions.find(block => block.namespace === namespace)!;
}

test("Selective Wasm guest completes 256-bar actual edits and history with SDK-equivalent results and no JS fallback", () => {
  const initial = createNativeWorkloadScore(256), compiled = catalog();
  const oracle = CommandBus.createIntegrated(initial, compiled); assert.ok(oracle.ok);
  let maxGuestInput = 0, reads = 0;
  const seen = new Set<string>();
  const transport = { ...addon, createWasmModuleExecutorV1(...args: Parameters<WasmNativeAddonV1["createWasmModuleExecutorV1"]>) {
    const execute = addon.createWasmModuleExecutorV1(...args);
    return (input: Buffer) => {
      maxGuestInput = Math.max(maxGuestInput, input.length);
      const request = JSON.parse(input.toString("utf8"));
      seen.add(request.operation);
      const view = request.operation === "effectTransform" ? request.arguments[0].view
        : ["commandPrepare", "validate", "classify"].includes(request.operation) ? request.arguments[0] : undefined;
      if (view !== undefined) {
        assert.equal(view.viewVersion, 2);
        assert.equal(view.coreDocument, undefined);
      }
      const output = execute(input);
      if (JSON.parse(output.toString("utf8")).status === "read") reads++;
      return output;
    };
  } };
  const native = create(initial, compiled, transport);
  const actualEvents: unknown[] = [], expectedEvents: unknown[] = [];
  native.subscribe((event: unknown) => actualEvents.push(event));
  oracle.value.subscribe((event: unknown) => expectedEvents.push(event));
  for (const input of [command("first"), command("second", "note-1", "E", "part"),
    batch([command("third", "note-1024", "F"), command("fourth", "note-1", "G", "part")])]) {
    const expected = oracle.value.submit(input);
    assert.equal(expected.status, "committed");
    resetCvn6Callbacks();
    assert.deepEqual(native.submit(input), expected);
    assert.deepEqual(cvn6CallbackTrace, []);
    assert.deepEqual(native.read(), oracle.value.read());
    assert.deepEqual(actualEvents, expectedEvents);
  }
  for (const operation of ["undo", "redo"] as const) {
    const expected: ReturnType<typeof oracle.value.undo> = oracle.value[operation](); resetCvn6Callbacks();
    assert.deepEqual(native[operation](), expected);
    assert.deepEqual(cvn6CallbackTrace, []);
    assert.deepEqual(native.read(), oracle.value.read());
  }
  assert.deepEqual([...seen].sort(), ["capabilities", "classify", "commandDecode", "commandPrepare", "effectDecode", "effectTransform", "validate"]);
  assert.ok(reads >= 4);
  assert.ok(maxGuestInput < 8192, `guest input grew to ${maxGuestInput}`);
});

test("Actual Wasm prepare sees earlier Batch edits and independent validation rejects stale Core relationships", () => {
  const bus = create(createNativeWorkloadScore(256));
  assert.equal(bus.submit(batch([pitch("E"), command("read-note", "note-1024", "F")])).status, "committed");
  assert.equal(block(bus).payload.marker, "observed:note-1024:E");
  assert.equal(bus.submit(command("verify-current", "note-1024", "D")).status, "committed");
  assert.equal(block(bus).payload.marker, "verify:note-1024:D");
  const before = bus.read(), events: unknown[] = [];
  bus.subscribe((event: unknown) => events.push(event));
  const rejected = bus.submit(pitch("G"));
  assert.equal(rejected.status, "rejected");
  if (rejected.status === "rejected") assert.equal(rejected.failure.code, "command.contribution-semantic-invalid");
  assert.deepEqual(bus.read(), before);
  assert.deepEqual(events, []);
  assert.equal(bus.submit(batch([pitch("G"), command("verify-current", "note-1024", "G")])).status, "committed");
  assert.equal(bus.undo().status, "committed");
  assert.equal(block(bus).payload.marker, "verify:note-1024:D");
  assert.equal(bus.redo().status, "committed");
  assert.equal(block(bus).payload.marker, "verify:note-1024:G");
  resetCvn6Callbacks();
});

test("Selective guest invalid reads, repeated reads, fuel and hostile outputs reject effective Batch prefixes", () => {
  const bus = create(createNativeWorkloadScore(256));
  for (const marker of ["bad-read", "repeat-read", "read-forever", "fuel", "foreign-write", "aggregate", "forged-issue", "reject", "invalid-utf8"]) {
    const before = bus.read(), events: unknown[] = [];
    const subscription = bus.subscribe((event: unknown) => events.push(event));
    resetCvn6Callbacks();
    assert.equal(bus.submit(batch([pitch("E"), command(marker)])).status, "rejected", marker);
    assert.deepEqual(cvn6CallbackTrace, []);
    assert.deepEqual(bus.read(), before, marker);
    assert.deepEqual(events, [], marker);
    if (subscription.status === "subscribed") subscription.unsubscribe();
    assert.notEqual(bus.submit(command("recover", "note-1024", "F")).status, "rejected", marker);
  }
});

test("Selective installer rejects old guest protocols and stale Native exchange without selecting a working session", () => {
  const compiled = catalog();
  const oldGuest = readFileSync("test/core-kernel/fixtures/wasm-guest/guest.wasm");
  assert.throws(() => installNativeWasmCoreReadsBackendV2(addon, compiled, bindings(oldGuest)));
  assert.throws(() => installNativeWasmCoreReadsBackendV2(addon, compiled, bindings().slice(0, 1)));
  const stale = { ...addon, createIntegratedKernelSessionV2(input: Buffer, callback: (bytes: Buffer) => Buffer) {
    return addon.createIntegratedKernelSessionV2(input, callback);
  } };
  const restore = installNativeWasmCoreReadsBackendV2(stale, compiled, bindings());
  try { assert.equal(CommandBus.createIntegrated(createNativeWorkloadScore(1), compiled).ok, false); }
  finally { restore(); }
  // The old, explicitly chosen full-input path still accepts its original guest.
  const legacy = installNativeWasmOnlyIntegratedBackendV1(addon, compiled, bindings(oldGuest));
  try {
    const bus = CommandBus.createIntegrated(createNativeWorkloadScore(16), compiled); assert.ok(bus.ok);
    assert.equal(bus.value.submit(command("legacy", "note-1")).status, "committed");
  } finally { legacy(); }
});

test("Selective guest migration stays detached and preserves the SDK result", () => {
  const compiled = catalog(), initial: ScoreDocument = { ...createNativeWorkloadScore(256), extensions: [
    { namespace: "fixture.score", schemaVersion: 1, owner: { kind: "score" }, payload: { marker: "before" } },
  ] };
  const request = { migrationVersion: 1, moduleId: "fixture.score.module", contributionId: "fixture.score.contribution.v1",
    namespace: "fixture.score", effectKind: "fixture.score.replace", owner: { kind: "score" as const },
    sourceSchemaVersion: 1, targetSchemaVersion: 2, payload: { schemaVersion: 2, marker: "after" } };
  const expected = migrateKernelExtension(initial, request, compiled);
  assert.equal(expected.status, "migrated");
  const restore = installNativeWasmCoreReadsBackendV2(addon, compiled, bindings());
  try {
    resetCvn6Callbacks();
    assert.deepEqual(migrateKernelExtension(initial, request, compiled), expected);
    assert.deepEqual(cvn6CallbackTrace, []);
    assert.equal(migrateKernelExtension(initial, request, catalog()).status, "rejected");
  } finally { restore(); resetCvn6Callbacks(); }
});

test("Selective guest consumes only declared dependency blocks from the current Batch candidate", () => {
  const base = catalog(), declaration = {
    readVersion: 1, reader: { moduleId: "fixture.score.module", contributionId: "fixture.score.contribution.v1" },
    provider: { moduleId: "fixture.part.module", contributionId: "fixture.part.contribution.v1" },
    namespace: "fixture.part", supportedSchemaVersions: [1, 2], ownerKinds: ["part"],
  };
  const compiled = compileContributionReadCatalogV1(base, [declaration]); assert.ok(compiled.ok);
  const initial = createNativeWorkloadScore(256), native = create(initial, compiled.catalog), oracle = CommandBus.createIntegrated(initial, base);
  assert.ok(oracle.ok);
  for (const marker of ["first", "second"]) {
    const expected = oracle.value.submit(batch([command(marker, "note-1", "E", "part"), command(marker, "note-1024", "F")]));
    assert.equal(expected.status, "committed"); resetCvn6Callbacks();
    assert.deepEqual(native.submit(batch([command(marker, "note-1", "E", "part"), command("read-dependency", "note-1024", "F")])), expected);
    assert.equal(block(native).payload.marker, marker);
    assert.deepEqual(native.read(), oracle.value.read());
    assert.deepEqual(cvn6CallbackTrace, []);
  }
  assert.deepEqual(native.undo(), oracle.value.undo());
  assert.deepEqual(native.read(), oracle.value.read());
  const undeclared = create(initial, base), before = undeclared.read();
  assert.equal(undeclared.submit(command("read-dependency", "note-1024", "F")).status, "rejected");
  assert.deepEqual(undeclared.read(), before);
  resetCvn6Callbacks();
});
