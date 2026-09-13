import { test as nodeTest } from "node:test";
import assert = require("node:assert/strict");
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { CommandBus, migrateKernelExtension, type ScoreDocument } from "../../../src/core-kernel/index";
import { compileOfficialModuleCatalogV1 } from "../../../src/core-kernel/module-sdk/index";
import { compileContributionReadCatalogV1 } from "../../../src/core-kernel/module-sdk/extension-reads";
import { installNativeWasmCoreReadsBackendV2, installNativeWasmScheduledAssessmentV3, installNativeWasmScheduledEditingV4 } from "../../../src/native-host/wasm-core-reads";
import { installNativeWasmOnlyIntegratedBackendV1, type WasmNativeAddonV1 } from "../../../src/native-host/wasm-bindings";
import { CVN6_MANIFEST, CVN6_REGISTRATION_ENTRIES, resetCvn6Callbacks, cvn6CallbackTrace } from "../fixtures/cvn-6-synthetic-official-modules";
import { createNativeWorkloadScore } from "../fixtures/native-workload";

const addon = require(resolve("target/wasm-v1/brilliant_kernel_node.node")) as Parameters<typeof installNativeWasmCoreReadsBackendV2>[0];
const guest = readFileSync("test/core-kernel/fixtures/wasm-guest/guest-v2.wasm");
for (const protocol of [2, 3, 4]) {
const install = protocol === 4 ? installNativeWasmScheduledEditingV4
  : protocol === 3 ? installNativeWasmScheduledAssessmentV3 : installNativeWasmCoreReadsBackendV2;
const test = (name: string, action: () => void) => nodeTest(`Host V${protocol}: ${name}`, action);
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
  const restore = install(transport, compiled, bindings());
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
  assert.throws(() => install(addon, compiled, bindings(oldGuest)));
  assert.throws(() => install(addon, compiled, bindings().slice(0, 1)));
  const stale = { ...addon, createIntegratedKernelSessionV2(input: Buffer, callback: (bytes: Buffer) => Buffer) {
    return addon.createIntegratedKernelSessionV2(input, callback);
  } };
  const restore = install(stale, compiled, bindings());
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
  const restore = install(addon, compiled, bindings());
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

if (protocol === 4) test("Rust migration replaces TS preparation and validation while keeping live history detached", () => {
  const compiled = catalog();
  const initial: ScoreDocument = { ...createNativeWorkloadScore(256), extensions: [
    { namespace: "fixture.score", schemaVersion: 1, owner: { kind: "score" }, payload: { marker: "old-score" } },
    { namespace: "fixture.part", schemaVersion: 1, owner: { kind: "part", partId: "part-1" }, payload: { marker: "old-part" } },
  ] };
  const request = { migrationVersion: 1, moduleId: "fixture.score.module", contributionId: "fixture.score.contribution.v1",
    namespace: "fixture.score", effectKind: "fixture.score.replace", owner: { kind: "score" as const },
    sourceSchemaVersion: 1, targetSchemaVersion: 2, payload: { schemaVersion: 2, marker: "migrated" } };
  const original = structuredClone(initial);
  const expected = migrateKernelExtension(initial, request, compiled);
  assert.equal(expected.status, "migrated");
  const live = create(initial, compiled);
  const before = live.read();
  const events: unknown[] = [];
  live.subscribe((event: unknown) => events.push(event));
  const phases: string[] = [];
  let hostBytes = 0;
  const transport = { ...addon, migrateKernelExtensionV2(input: Buffer, callback: (bytes: Buffer) => Buffer, version?: number) {
    assert.equal(version, 4);
    return addon.migrateKernelExtensionV2(input, bytes => {
      if (bytes[0] === 123) {
        hostBytes += bytes.length;
        const request = JSON.parse(bytes.toString("utf8"));
        assert.equal(request.document, undefined);
        assert.equal(request.documentVersion, null);
        assert.ok(bytes.length < 2048);
        phases.push(request.callbackOperation === undefined ? request.operation : `${request.callbackOperation}:${request.moduleId}`);
      }
      return callback(bytes);
    }, version);
  } };
  const migration = require("../../../src/core-kernel/migration/migrate-kernel-extension") as typeof import("../../../src/core-kernel/migration/migrate-kernel-extension");
  const prepare = migration.prepareExtensionMigrationEffectV1, validate = migration.validateExtensionMigrationModulesV1;
  const restore = install(transport, compiled, bindings());
  migration.prepareExtensionMigrationEffectV1 = () => { throw new Error("TS migration preparation disabled"); };
  migration.validateExtensionMigrationModulesV1 = () => { throw new Error("TS migration validation disabled"); };
  try {
    resetCvn6Callbacks();
    const actual = migrateKernelExtension(initial, request, compiled);
    assert.deepEqual(actual, expected);
    assert.deepEqual(phases, ["migrationStart", "effectDecode:fixture.score.module", "effectTransform:fixture.score.module",
      "validate:fixture.part.module", "validate:fixture.score.module"]);
    assert.ok(hostBytes < 8192);
    if (actual.status !== "migrated") assert.fail("migration failed");
    phases.length = 0;
    const again = migrateKernelExtension(actual.document, request, compiled);
    assert.equal(again.status, "not-required");
    assert.deepEqual(phases, ["migrationStart"]);
    assert.deepEqual(cvn6CallbackTrace, []);
    assert.deepEqual(initial, original);
    assert.deepEqual(live.read(), before);
    assert.deepEqual(events, []);
  } finally {
    restore(); resetCvn6Callbacks();
    migration.prepareExtensionMigrationEffectV1 = prepare;
    migration.validateExtensionMigrationModulesV1 = validate;
  }
});

if (protocol === 4) test("Scoped preparation projects Core only on demand and observes current effects when it does", () => {
  const compiled = catalog(), initial = createNativeWorkloadScore(256);
  const query = { readVersion: 2, selectorId: "core.selector.score-entity", address: { kind: "note", noteId: "note-1" } };
  let projections = 0, forceTransformRead = false, observedPitch: unknown;
  const transport = { ...addon,
    createIntegratedKernelSessionV2(input: Buffer, callback: (bytes: Buffer) => Buffer, version?: number) {
      const operate = addon.createIntegratedKernelSessionV2(input, callback, version);
      projections = JSON.parse(operate(Buffer.from('{"operation":"read"}')).toString("utf8")).callbackProjections;
      return (input: Buffer) => {
        const output = operate(input), parsed = JSON.parse(output.toString("utf8"));
        if (typeof parsed.callbackProjections === "number") projections = parsed.callbackProjections;
        return output;
      };
    },
    createWasmModuleExecutorV1(...args: Parameters<WasmNativeAddonV1["createWasmModuleExecutorV1"]>) {
      const execute = addon.createWasmModuleExecutorV1(...args);
      return (input: Buffer) => {
        const request = JSON.parse(input.toString("utf8"));
        if (forceTransformRead && request.operation === "effectDecode") {
          const row = request.coreReads.find((row: { query: { selectorId?: string; address?: { noteId?: string } } }) =>
            row.query.selectorId === query.selectorId && row.query.address?.noteId === "note-1");
          if (row === undefined) return Buffer.from(JSON.stringify({ callbackVersion: 2, status: "read", query }));
          observedPitch = row.reply.result.value.value.writtenPitch.step;
        }
        return execute(input);
      };
    },
  };
  const bus = create(initial, compiled, transport);
  const oracle = CommandBus.createIntegrated(initial, compiled); assert.ok(oracle.ok);
  bus.read();
  let before = projections;
  const first = command("lazy", "note-1", "D");
  assert.deepEqual(bus.submit(first), oracle.value.submit(first));
  // One preparation read source, final transaction projection and assessment;
  // transform uses metadata/extensions only. Decoder/preparer share a source.
  assert.equal(projections - before, 3);
  before = projections;
  forceTransformRead = true;
  const second = command("full-read", "note-1", "E");
  assert.deepEqual(bus.submit(second), oracle.value.submit(second));
  assert.equal(projections - before, 4);
  assert.equal(observedPitch, "E");
  assert.deepEqual(bus.undo(), oracle.value.undo());
  assert.deepEqual(bus.redo(), oracle.value.redo());
  assert.deepEqual(bus.read(), oracle.value.read());
});

if (protocol === 4) test("Rust migration retains rejection, dependency and stale-host boundaries", () => {
  const base = catalog();
  const derived = compileContributionReadCatalogV1(base, [{
    readVersion: 1, reader: { moduleId: "fixture.score.module", contributionId: "fixture.score.contribution.v1" },
    provider: { moduleId: "fixture.part.module", contributionId: "fixture.part.contribution.v1" },
    namespace: "fixture.part", supportedSchemaVersions: [1, 2], ownerKinds: ["part"],
  }]); assert.ok(derived.ok);
  const initial: ScoreDocument = { ...createNativeWorkloadScore(16), extensions: [
    { namespace: "fixture.score", schemaVersion: 1, owner: { kind: "score" }, payload: { marker: "old" } },
    { namespace: "fixture.part", schemaVersion: 1, owner: { kind: "part", partId: "part-1" }, payload: { marker: "provider" } },
  ] };
  const request = { migrationVersion: 1, moduleId: "fixture.score.module", contributionId: "fixture.score.contribution.v1",
    namespace: "fixture.score", effectKind: "fixture.score.replace", owner: { kind: "score" as const },
    sourceSchemaVersion: 1, targetSchemaVersion: 2, payload: { schemaVersion: 2, marker: "ok" } };
  const cases: [ScoreDocument, unknown][] = [
    [initial, request],
    ...["reject", "aggregate", "forged-issue", "verify:note-1:C", "verify:note-1:D"].map(marker =>
      [initial, { ...request, payload: { schemaVersion: 2, marker } }] as [ScoreDocument, unknown]),
    [initial, { ...request, payload: { schemaVersion: 1, marker: "wrong-version" } }],
    [initial, { ...request, payload: { schemaVersion: 2, marker: 1 } }],
    [{ ...initial, extensions: initial.extensions.map(block => block.namespace === "fixture.part" ? { ...block, schemaVersion: 99 } : block) }, request],
  ];
  const baselineRestore = installNativeWasmCoreReadsBackendV2(addon, derived.catalog, bindings());
  let expected: ReturnType<typeof migrateKernelExtension>[];
  try { expected = cases.map(([document, input]) => migrateKernelExtension(document, input, derived.catalog)); }
  finally { baselineRestore(); }
  const before = structuredClone(cases);
  const restore = install(addon, derived.catalog, bindings());
  try {
    for (let i = 0; i < cases.length; i++) {
      const [document, input] = cases[i]!;
      assert.deepEqual(migrateKernelExtension(document, input, derived.catalog), expected[i], `case ${i}`);
    }
    assert.equal(expected[0]!.status, "migrated");
    assert.equal(expected[8]!.status, "rejected");
    assert.deepEqual(cases, before);
    assert.equal(migrateKernelExtension(initial, request, derived.catalog).status, "migrated");
  } finally { restore(); }
  for (const stale of [
    { ...addon, migrateKernelExtensionV2(input: Buffer, callback: (bytes: Buffer) => Buffer) {
      const legacy = JSON.parse(input.toString("utf8"));
      delete legacy.assessmentReads;
      return addon.migrateKernelExtensionV2(Buffer.from(JSON.stringify(legacy)), callback, 2);
    } },
    { ...addon, migrateKernelExtensionV2() {
      return Buffer.from(JSON.stringify({ status: "not-required", document: initial }));
    } },
  ]) {
    const restore = install(stale, base, bindings());
    try { assert.equal(migrateKernelExtension(initial, request, base).status, "rejected"); }
    finally { restore(); }
  }
});

test("Preparation retains provisional Batch identities and decoder-before-target error order", () => {
  const initial = createNativeWorkloadScore(1), compiled = catalog();
  const oracle = CommandBus.createIntegrated(initial, compiled); assert.ok(oracle.ok);
  const native = create(initial, compiled);
  const original = initial.parts[0]!;
  const temporary = { ...original, id: "temporary-part",
    staves: original.staves.map(staff => ({ ...staff, id: "" })),
    measureContents: original.measureContents.map(content => ({ ...content,
      voices: content.voices.map(voice => ({ ...voice, id: "temporary-voice", defaultStaffId: "",
        sequence: { ...voice.sequence, events: [] } })) })) };
  const input = batch([
    { commandVersion: 1, commandId: "core.part.insert", target: { kind: "document", documentId: initial.id },
      payload: { anchor: { kind: "start" }, part: temporary } },
    command("temporary", "note-1"),
    { commandVersion: 1, commandId: "core.part.remove", target: { kind: "part", partId: temporary.id }, payload: {} },
  ]);
  const expected = oracle.value.submit(input);
  assert.equal(expected.status, "committed");
  assert.deepEqual(native.submit(input), expected);
  assert.deepEqual(native.read(), oracle.value.read());
  assert.deepEqual(native.undo(), oracle.value.undo());
  assert.deepEqual(native.redo(), oracle.value.redo());
  for (const marker of [12, "valid"]) {
    const valid = command("valid", "note-1", "E", "part");
    const bad = { ...valid, target: { kind: "part", partId: "missing" }, payload: { ...valid.payload, marker } };
    const expected = oracle.value.submit(bad);
    assert.equal(expected.status, "rejected");
    if (expected.status === "rejected") assert.equal(expected.failure.code,
      marker === 12 ? "command.invalid-envelope" : "command.target-not-found");
    assert.deepEqual(native.submit(bad), expected);
    assert.deepEqual(native.read(), oracle.value.read());
  }
  resetCvn6Callbacks();
});

if (protocol >= 3) test("Rust schedules assessment with no TS pipeline or full Core host assessment input", () => {
  const compiled = catalog(), initial = createNativeWorkloadScore(256);
  const oracle = CommandBus.createIntegrated(initial, compiled); assert.ok(oracle.ok);
  const input = batch([command("score"), command("part", "note-1", "E", "part")]);
  const expected = oracle.value.submit(input);
  const expectedUndo = oracle.value.undo(), expectedRedo = oracle.value.redo(), expectedRead = oracle.value.read();
  const pipeline = require("../../../src/core-kernel/commands/integrated-runtime") as Record<string, unknown>;
  const executorFactory = require("../../../src/core-kernel/native/integrated-executor") as Record<string, unknown>;
  const savedExecutorFactory = executorFactory.createNativeContributionExecutorV2;
  const saved = pipeline.runNativeModulePipeline;
  const phases: string[] = [];
  let fullAssessments = 0, maxInput = 0;
  let fullPreparations = 0, executorCalls = 0;
  const preparationPhases = new Set<string>();
  const transport = { ...addon, createIntegratedKernelSessionV2(bytes: Buffer, callback: (input: Buffer) => Buffer, version?: number) {
    assert.equal(version, protocol);
    return addon.createIntegratedKernelSessionV2(bytes, request => {
      if (request[0] === 123) {
        const parsed = JSON.parse(request.toString("utf8"));
        if (parsed.operation === "assess") fullAssessments++;
        if (parsed.operation === "prepare" || parsed.operation === "transform") fullPreparations++;
        if (parsed.operation === "contributionCallback") {
          assert.equal(parsed.document, undefined);
          const view = parsed.callbackOperation === "commandPrepare" ? parsed.arguments[0]
            : parsed.callbackOperation === "effectTransform" ? parsed.arguments[0].view : undefined;
          if (view !== undefined) assert.equal(view.coreDocument, undefined);
          assert.ok(request.length < 2048);
          preparationPhases.add(parsed.callbackOperation);
        }
        if (parsed.operation === "assessmentCallback") {
          assert.equal(parsed.document, undefined);
          assert.equal(parsed.view.coreDocument, undefined);
          maxInput = Math.max(maxInput, request.length);
          phases.push(`${parsed.callbackOperation}:${parsed.moduleId}`);
        }
      }
      return callback(request);
    }, version);
  } };
  pipeline.runNativeModulePipeline = () => { throw new Error("TS assessment scheduler is unavailable"); };
  if (protocol === 4) executorFactory.createNativeContributionExecutorV2 = () => () => {
    executorCalls++;
    throw new Error("TS contribution executor is unavailable");
  };
  try {
    const native = create(initial, compiled, transport);
    assert.deepEqual(native.submit(input), expected);
    assert.deepEqual(native.undo(), expectedUndo);
    assert.deepEqual(native.redo(), expectedRedo);
    assert.deepEqual(native.read(), expectedRead);
  } finally {
    pipeline.runNativeModulePipeline = saved;
    executorFactory.createNativeContributionExecutorV2 = savedExecutorFactory;
  }
  assert.equal(fullAssessments, 0);
  assert.ok(maxInput > 0 && maxInput < 2048);
  if (protocol === 4) {
    assert.equal(fullPreparations, 0);
    assert.equal(executorCalls, 0);
    assert.deepEqual([...preparationPhases].sort(), ["commandDecode", "commandPrepare", "effectDecode", "effectTransform"]);
  }
  assert.deepEqual(phases, [
    "validate:fixture.part.module", "validate:fixture.score.module",
    "classify:fixture.part.module", "classify:fixture.score.module",
    "validate:fixture.part.module", "validate:fixture.score.module",
    "classify:fixture.part.module", "classify:fixture.score.module",
  ]);
});

if (protocol >= 3) test("Rust keeps incompatible dependency readers inactive and rejects stale scheduling adapters", () => {
  const base = catalog();
  const compiled = compileContributionReadCatalogV1(base, [{
    readVersion: 1, reader: { moduleId: "fixture.score.module", contributionId: "fixture.score.contribution.v1" },
    provider: { moduleId: "fixture.part.module", contributionId: "fixture.part.contribution.v1" },
    namespace: "fixture.part", supportedSchemaVersions: [1, 2], ownerKinds: ["part"],
  }]); assert.ok(compiled.ok);
  const initial: ScoreDocument = { ...createNativeWorkloadScore(16), extensions: [
    { namespace: "fixture.score", schemaVersion: 1, owner: { kind: "score" }, payload: { marker: "dependent" } },
    { namespace: "fixture.part", schemaVersion: 99, owner: { kind: "part", partId: "part-1" }, payload: { marker: "future" } },
  ] };
  const oracle = CommandBus.createIntegrated(initial, compiled.catalog); assert.ok(oracle.ok);
  let assessments = 0;
  const transport = { ...addon, createWasmModuleExecutorV1(...args: Parameters<WasmNativeAddonV1["createWasmModuleExecutorV1"]>) {
    const execute = addon.createWasmModuleExecutorV1(...args);
    return (input: Buffer) => {
      const request = JSON.parse(input.toString("utf8"));
      if (request.operation === "validate" || request.operation === "classify") assessments++;
      return execute(input);
    };
  } };
  const native = create(initial, compiled.catalog, transport);
  assert.equal(assessments, 0);
  assert.deepEqual(native.read(), oracle.value.read());
  assert.deepEqual(native.submit(command("blocked", "note-1")), oracle.value.submit(command("blocked", "note-1")));
  const stale = { ...addon, createIntegratedKernelSessionV2(input: Buffer, callback: (input: Buffer) => Buffer) {
    // A host that downgrades 3 to the supported older read exchange must fail
    // even when the candidate has no live plugin callbacks.
    return addon.createIntegratedKernelSessionV2(input, callback, 2);
  } };
  const restore = install(stale, base, bindings());
  try { assert.equal(CommandBus.createIntegrated(createNativeWorkloadScore(1), base).ok, false); }
  finally { restore(); }
});
}
