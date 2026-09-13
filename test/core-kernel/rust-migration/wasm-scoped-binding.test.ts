import { test } from "node:test";
import assert = require("node:assert/strict");
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { CommandBus, migrateKernelExtension, replayKernelCommands, type ScoreDocument } from "../../../src/core-kernel/index";
import { compileOfficialModuleCatalogV1 } from "../../../src/core-kernel/module-sdk/index";
import { compileContributionReadCatalogV1 } from "../../../src/core-kernel/module-sdk/extension-reads";
import { createWasmExecutionPolicyV1, installNativeWasmIntegratedBackendV1, installNativeWasmOnlyIntegratedBackendV1, type WasmNativeAddonV1 } from "../../../src/native-host/wasm-bindings";
import { CVN6_MANIFEST, CVN6_REGISTRATION_ENTRIES, cvn6CallbackBehavior, cvn6CallbackTrace, resetCvn6Callbacks } from "../fixtures/cvn-6-synthetic-official-modules";
import { createCoreScoreFixture } from "../fixtures/core-score";

const addon = require(resolve("target/wasm-v1/brilliant_kernel_node.node")) as WasmNativeAddonV1;
const guest = readFileSync("test/core-kernel/fixtures/wasm-guest/guest.wasm");
function catalog() {
  const result = compileOfficialModuleCatalogV1(CVN6_MANIFEST, CVN6_REGISTRATION_ENTRIES);
  assert.ok(result.ok);
  return result.catalog;
}
function binding(module = "score", bytes: Uint8Array = Buffer.from(guest)) {
  return { moduleId: `fixture.${module}.module`, contributionId: `fixture.${module}.contribution.v1`,
    abiVersion: 1, sha256: createHash("sha256").update(bytes).digest("hex"), bytes };
}
function command(module = "score", marker = "dynamic", step = "E", schemaVersion = 1) {
  return { commandVersion: 1, commandId: `fixture.${module}.apply`,
    target: module === "score" ? { kind: "document", documentId: "score-1" } : { kind: "part", partId: "part-1" },
    payload: { noteId: "note-1", pitch: { step, alter: 0, octave: 4 }, schemaVersion, marker } };
}
function document(): ScoreDocument {
  const initial = createCoreScoreFixture();
  return { ...initial, extensions: [...initial.extensions,
    { namespace: "fixture.part", schemaVersion: 1, owner: { kind: "part", partId: "part-1" }, payload: { marker: "other" } },
    { namespace: "unknown.opaque", schemaVersion: 99, owner: { kind: "score" }, payload: { "\ud800": ["\udfff", -0, { keep: true }] } },
  ] };
}
function create(wasm: boolean, initial = document(), modules = ["score"], compiled = catalog()) {
  const restore = wasm ? installNativeWasmIntegratedBackendV1(addon, compiled, modules.map(module => binding(module))) : () => {};
  try {
    const result = CommandBus.createIntegrated(initial, compiled);
    assert.ok(result.ok, JSON.stringify(result));
    return result.value;
  } finally { restore(); }
}
function batch(commands: readonly unknown[]) {
  return { commandVersion: 1, commandId: "core.transaction.batch", target: { kind: "document", documentId: "score-1" }, payload: { commands } };
}
function metadata() {
  return { commandVersion: 1, commandId: "core.document.set-metadata", target: { kind: "document", documentId: "score-1" },
    payload: { metadata: { ...createCoreScoreFixture().metadata, title: "prefix must roll back" } } };
}

test("Rust shares a sticky Wasm budget across one operation even when the host swallows guest failures", () => {
  const compiled = catalog();
  let exhaust = false, attempts = 0;
  const observed: WasmNativeAddonV1 = { ...addon, createWasmModuleExecutorV1(...args) {
    const execute = addon.createWasmModuleExecutorV1(...args);
    return input => {
      const output = execute(input);
      if (exhaust) {
        exhaust = false;
        // A nested native session must inherit the outer account, not reset it.
        assert.equal(CommandBus.createIntegrated(document(), compiled).ok, true);
        // Each reply is valid and each call fits the old per-callback limit.
        // Repeated native calls must still share the enclosing Rust budget.
        for (let i = 0; i < 4097; i++) {
          attempts++;
          try { execute(input); } catch { break; }
        }
      }
      return output; // A valid-looking host reply cannot erase exhaustion.
    };
  } };
  const restore = installNativeWasmOnlyIntegratedBackendV1(observed, compiled, [binding(), binding("part")]);
  try {
    for (const operation of ["submit", "undo", "redo"] as const) {
      const created = CommandBus.createIntegrated(document(), compiled);
      assert.ok(created.ok);
      const bus = created.value;
      assert.equal(bus.submit(command()).status, "committed");
      assert.equal(bus.submit(command("part", "history-base")).status, "committed");
      if (operation === "redo") assert.equal(bus.undo().status, "committed");
      const before = bus.read(), events: unknown[] = [];
      bus.subscribe((event: unknown) => events.push(event));
      exhaust = true; attempts = 0;
      const result = operation === "submit" ? bus.submit(batch([metadata(), command()])) : bus[operation]();
      assert.equal(result.status, "rejected", operation);
      assert.ok(attempts > 1 && attempts <= 4097);
      assert.deepEqual(bus.read(), before);
      assert.deepEqual(events, []);
      assert.equal(bus.submit(command("score", "next-operation", "G")).status, "committed");
    }
    exhaust = true;
    assert.equal(CommandBus.createIntegrated(document(), compiled).ok, false);
    assert.equal(CommandBus.createIntegrated(document(), compiled).ok, true);
    const migration = { migrationVersion: 1, moduleId: "fixture.part.module", contributionId: "fixture.part.contribution.v1",
      namespace: "fixture.part", effectKind: "fixture.part.replace", owner: { kind: "part", partId: "part-1" },
      sourceSchemaVersion: 1, targetSchemaVersion: 2, payload: { schemaVersion: 2, marker: "migrated" } };
    exhaust = true;
    assert.equal(migrateKernelExtension(document(), migration, compiled).status, "rejected");
    assert.equal(migrateKernelExtension(document(), migration, compiled).status, "migrated");
    assert.deepEqual(cvn6CallbackTrace, []);
  } finally { restore(); resetCvn6Callbacks(); }
});

test("Wasm-only admission rejects incomplete or failed compilation without replacing the active backend", () => {
  const previous = catalog(), next = catalog();
  const restore = installNativeWasmIntegratedBackendV1(addon, previous, [binding()]);
  let compilations = 0;
  const counted: WasmNativeAddonV1 = { ...addon, createWasmModuleExecutorV1(...args) {
    compilations++; return addon.createWasmModuleExecutorV1(...args);
  } };
  try {
    for (const rows of [[binding()], [binding("part")]]) {
      assert.throws(() => installNativeWasmOnlyIntegratedBackendV1(counted, next, rows), /wasm.incomplete-binding/);
    }
    assert.equal(compilations, 0);
    // Equal row count is insufficient: duplicates and invalid identities still fail.
    for (const rows of [[binding(), binding()], [binding(), { ...binding("part"), moduleId: "foreign" }]]) {
      assert.throws(() => installNativeWasmOnlyIntegratedBackendV1(counted, next, rows), /wasm.invalid-binding/);
    }
    assert.equal(compilations, 0);
    const failing: WasmNativeAddonV1 = { ...addon, createWasmModuleExecutorV1(...args) {
      if (++compilations === 2) throw new Error("compile rejected");
      return addon.createWasmModuleExecutorV1(...args);
    } };
    assert.throws(() => installNativeWasmOnlyIntegratedBackendV1(failing, next, [binding(), binding("part")]), /compile rejected/);
    assert.equal(CommandBus.createIntegrated(document(), previous).ok, true);
    assert.equal(CommandBus.createIntegrated(document(), next).ok, false);
  } finally { restore(); resetCvn6Callbacks(); }
});

test("A non-callable native executor is rejected at installation instead of falling back to plugin JS", () => {
  const invalid = { ...addon, createWasmModuleExecutorV1: () => undefined } as unknown as WasmNativeAddonV1;
  for (const install of [installNativeWasmIntegratedBackendV1, installNativeWasmOnlyIntegratedBackendV1]) {
    let restore: (() => void) | undefined;
    try {
      assert.throws(() => { restore = install(invalid, catalog(), [binding(), binding("part")]); }, /wasm.invalid-addon/);
    } finally { restore?.(); }
  }
});

test("Wasm-only sessions execute all six callback families without JS across editing, history, replay and migration", () => {
  for (const family of ["commandDecode", "commandPrepare", "effectDecode", "effectTransform", "validate", "classify"] as const) {
    resetCvn6Callbacks();
    const compiled = catalog(), initial = document(), inputs = [command(), command("part", "part-wasm", "D")];
    const oracle = create(false, initial, [], compiled);
    const expected = inputs.map(input => oracle.submit(input));
    const expectedRead = oracle.read(), expectedUndo = oracle.undo(), expectedRedo = oracle.redo();
    const expectedPersisted = oracle.markPersisted({ documentId: "score-1", documentVersion: 4 });
    const expectedFinal = oracle.read();
    const expectedReplay = replayKernelCommands(initial, inputs, compiled);
    const migration = { migrationVersion: 1, moduleId: "fixture.part.module", contributionId: "fixture.part.contribution.v1",
      namespace: "fixture.part", effectKind: "fixture.part.replace", owner: { kind: "part", partId: "part-1" },
      sourceSchemaVersion: 1, targetSchemaVersion: 2, payload: { schemaVersion: 2, marker: "migrated" } };
    const expectedMigration = migrateKernelExtension(initial, migration, compiled);
    assert.equal(expectedMigration.status, "migrated");
    const calls = new Set<string>();
    const observed: WasmNativeAddonV1 = { ...addon, createWasmModuleExecutorV1(...args) {
      const execute = addon.createWasmModuleExecutorV1(...args);
      return input => {
        const request = JSON.parse(input.toString("utf8"));
        calls.add(`${request.moduleId}:${request.operation}`);
        return execute(input);
      };
    } };
    resetCvn6Callbacks();
    cvn6CallbackBehavior.throwFamily = family;
    const rows = [binding(), binding("part")];
    const restore = installNativeWasmOnlyIntegratedBackendV1(observed, compiled, rows);
    let retained: ReturnType<typeof create> | undefined;
    try {
      for (const row of rows) row.bytes.fill(0);
      const created = CommandBus.createIntegrated(initial, compiled);
      assert.ok(created.ok);
      retained = created.value;
      for (let i = 0; i < inputs.length; i++) assert.deepEqual(retained.submit(inputs[i]), expected[i]);
      assert.deepEqual(retained.read(), expectedRead);
      assert.deepEqual(retained.undo(), expectedUndo);
      assert.deepEqual(retained.redo(), expectedRedo);
      assert.deepEqual(retained.markPersisted({ documentId: "score-1", documentVersion: 4 }),
        expectedPersisted);
      assert.deepEqual(retained.read(), expectedFinal);
      assert.deepEqual(replayKernelCommands(initial, inputs, compiled), expectedReplay);
      const migrated = migrateKernelExtension(initial, migration, compiled);
      assert.deepEqual(migrated, expectedMigration);
      assert.equal(migrateKernelExtension(initial, migration, catalog()).status, "rejected");
      assert.equal(CommandBus.createIntegrated(initial, catalog()).ok, false);
      for (const module of ["score", "part"]) for (const operation of ["commandDecode", "commandPrepare", "effectDecode", "effectTransform", "validate", "classify"]) {
        assert.ok(calls.has(`fixture.${module}.module:${operation}`));
      }
      assert.deepEqual(cvn6CallbackTrace, []);
    } finally { restore(); }
    try {
      assert.equal(retained!.submit(command("score", "after-restore", "G")).status, "committed");
      assert.deepEqual(cvn6CallbackTrace, []);
    } finally { resetCvn6Callbacks(); }
  }
});

test("Wasm-only guest failures roll back effective Batch prefixes with no JS recovery path", () => {
  resetCvn6Callbacks();
  const compiled = catalog(), restore = installNativeWasmOnlyIntegratedBackendV1(addon, compiled, [binding(), binding("part")]);
  try {
    const created = CommandBus.createIntegrated(document(), compiled);
    assert.ok(created.ok);
    const bus = created.value, before = bus.read(), events: unknown[] = [];
    bus.subscribe((event: unknown) => events.push(event));
    for (const marker of ["fuel", "foreign-write", "aggregate", "forged-issue", "reject", "invalid-utf8"]) {
      assert.equal(bus.submit(batch([metadata(), command("score", marker)])).status, "rejected", marker);
      assert.deepEqual(bus.read(), before);
      assert.deepEqual(events, []);
      assert.deepEqual(cvn6CallbackTrace, []);
    }
    assert.equal(bus.submit(command("part", "healthy-after-failure")).status, "committed");
    assert.deepEqual(cvn6CallbackTrace, []);
  } finally { restore(); resetCvn6Callbacks(); }
});

test("Actual Wasm guest consumes only declared foreign dependency data from the current candidate", () => {
  resetCvn6Callbacks();
  const declaration = { readVersion: 1, reader: { moduleId: "fixture.score.module", contributionId: "fixture.score.contribution.v1" },
    provider: { moduleId: "fixture.part.module", contributionId: "fixture.part.contribution.v1" },
    namespace: "fixture.part", supportedSchemaVersions: [1, 2], ownerKinds: ["part"] };
  const base = catalog(), compiled = compileContributionReadCatalogV1(base, [declaration]);
  assert.ok(compiled.ok);
  const native = create(true, document(), ["score"], compiled.catalog), oracle = create(false);
  for (const marker of ["candidate-one", "candidate-two"]) {
    const expected = oracle.submit(batch([command("part", marker), command("score", marker)]));
    assert.equal(expected.status, "committed");
    resetCvn6Callbacks();
    assert.deepEqual(native.submit(batch([command("part", marker), command("score", "read-dependency")])), expected);
    assert.deepEqual(native.read(), oracle.read());
    assert.ok(!cvn6CallbackTrace.some(entry => entry.endsWith(":score")));
  }
  assert.deepEqual(native.undo(), oracle.undo());
  assert.deepEqual(native.read(), oracle.read());
  const undeclared = create(true, document(), ["score"], base), before = undeclared.read();
  assert.equal(undeclared.submit(command("score", "read-dependency")).status, "rejected");
  assert.deepEqual(undeclared.read(), before);
  const filtered = compileContributionReadCatalogV1(base, [{ ...declaration, ownerKinds: ["score"] }]);
  assert.ok(filtered.ok);
  const denied = create(true, document(), ["score"], filtered.catalog);
  assert.equal(denied.submit(command("score", "read-dependency")).status, "rejected");
  resetCvn6Callbacks();
});

test("Wasm bridge is an isolated eight-export artifact and validates its binary boundary", () => {
  const legacy = require(resolve("target/rkp-1-node/brilliant_kernel_node.node"));
  const integrated = require(resolve("target/integrated-v2/brilliant_kernel_node.node"));
  assert.equal(Object.keys(legacy).length, 5);
  assert.equal(Object.keys(integrated).length, 7);
  assert.deepEqual(Object.keys(addon).sort(), [...Object.keys(integrated), "createWasmModuleExecutorV1"].sort());
  const digest = createHash("sha256").update(guest).digest();
  for (const abi of [0, 1.1, 2, NaN, Infinity]) assert.throws(() => addon.createWasmModuleExecutorV1(guest, digest, abi));
  assert.throws(() => addon.createWasmModuleExecutorV1(guest, Buffer.alloc(32), 1));
  assert.throws(() => addon.createWasmModuleExecutorV1(guest, Buffer.alloc(31), 1));
});

test("Compiled Wasm guest executes dynamic edits, mixed Batch, no-op, events and stored history like the SDK oracle", () => {
  for (const modules of [["score"], ["score", "part"]]) {
    resetCvn6Callbacks();
    const oracle = create(false), native = create(true, document(), modules);
    const expectedEvents: unknown[] = [], actualEvents: unknown[] = [];
    oracle.subscribe((event: unknown) => expectedEvents.push(event));
    native.subscribe((event: unknown) => actualEvents.push(event));
    for (const input of [command(), command(), command("part", "part-data", "D"),
      batch([metadata(), command("score", "version-two", "F", 2), command("part", "batch-part", "G")])]) {
      const expected = oracle.submit(input);
      assert.notEqual(expected.status, "rejected", JSON.stringify(expected));
      resetCvn6Callbacks();
      assert.deepEqual(native.submit(input), expected);
      assert.deepEqual(native.read(), oracle.read());
      for (const module of modules) assert.ok(!cvn6CallbackTrace.some(entry => entry.endsWith(`:${module}`)), cvn6CallbackTrace.join());
      if (modules.length === 1) assert.ok(cvn6CallbackTrace.some(entry => entry.endsWith(":part")));
      assert.deepEqual(actualEvents, expectedEvents);
    }
    for (const operation of ["undo", "undo", "redo", "redo"] as const) {
      const expected = oracle[operation]();
      resetCvn6Callbacks();
      assert.deepEqual(native[operation](), expected);
      assert.deepEqual(native.read(), oracle.read());
      assert.ok(!cvn6CallbackTrace.some(entry => entry.startsWith("command") || entry.startsWith("effect")));
      assert.deepEqual(actualEvents, expectedEvents);
    }
  }
  resetCvn6Callbacks();
});

test("Fuel exhaustion, foreign writes and forged aggregate or issue outputs roll back the entire Batch", () => {
  for (const marker of ["fuel", "foreign-write", "aggregate", "forged-issue", "reject", "invalid-utf8"]) {
    resetCvn6Callbacks();
    const bus = create(true), before = bus.read(), events: unknown[] = [];
    bus.subscribe((event: unknown) => events.push(event));
    const result = bus.submit(batch([metadata(), command("score", marker)]));
    assert.equal(result.status, "rejected", marker);
    if (marker === "reject" && result.status === "rejected") assert.equal(result.failure.code, "command.contribution-semantic-invalid");
    if (marker === "invalid-utf8") {
      const direct = bus.submit(command("score", marker));
      assert.equal(direct.status, "rejected");
      if (direct.status === "rejected") assert.equal(direct.failure.code, "command.contribution-internal-error");
    }
    assert.deepEqual(bus.read(), before, marker);
    assert.deepEqual(events, [], marker);
    assert.equal(bus.undo().status, "rejected", marker);
    assert.equal(bus.submit(command("score", "recovered")).status, "committed", "fresh instance after failure");
  }
  resetCvn6Callbacks();
});

test("Wasm replay, persistence checkpoints and history branches retain the host transaction contract", () => {
  resetCvn6Callbacks();
  const compiled = catalog(), initial = document();
  const commands = [command(), command("score", "second", "D"), { ...command(), payload: {} }, command("score", "unreached")];
  const expected = replayKernelCommands(initial, commands, compiled);
  const restore = installNativeWasmIntegratedBackendV1(addon, compiled, [binding()]);
  try {
    resetCvn6Callbacks();
    assert.deepEqual(replayKernelCommands(initial, commands, compiled), expected);
    assert.ok(!cvn6CallbackTrace.some(entry => entry.endsWith(":score")));
  } finally { restore(); }
  const oracle = create(false), native = create(true);
  for (const bus of [oracle, native]) {
    assert.equal(bus.submit(command()).status, "committed");
    assert.equal(bus.markPersisted({ documentId: "score-1", documentVersion: 1 }).status, "updated");
    assert.equal(bus.submit(command("score", "second", "D")).status, "committed");
    assert.equal(bus.undo().status, "committed");
    assert.equal(bus.submit(command("score", "branch", "G")).status, "committed");
    assert.equal(bus.redo().status, "rejected");
  }
  assert.deepEqual(native.read(), oracle.read());
  resetCvn6Callbacks();
});

test("Wasm bridge retains callback and subscriber reentry protection without guest host imports", () => {
  resetCvn6Callbacks();
  const compiled = catalog(), nested: unknown[] = [];
  let bus: ReturnType<typeof create> | undefined;
  const transport: WasmNativeAddonV1 = { ...addon, createWasmModuleExecutorV1(...args) {
    const execute = addon.createWasmModuleExecutorV1(...args);
    return input => {
      if (bus && JSON.parse(input.toString("utf8")).operation === "commandDecode") {
        nested.push(bus.submit(command()));
        nested.push(bus.markPersisted({ documentId: "score-1", documentVersion: 0 }));
      }
      return execute(input);
    };
  } };
  const restore = installNativeWasmIntegratedBackendV1(transport, compiled, [binding()]);
  try {
    const created = CommandBus.createIntegrated(document(), compiled);
    assert.ok(created.ok);
    bus = created.value;
  } finally { restore(); }
  bus.subscribe(() => { assert.ok(bus!.read().ok); nested.push(bus!.undo()); });
  assert.equal(bus.submit(command()).status, "committed");
  assert.ok(nested.length >= 3);
  for (const result of nested) assert.equal((result as { failure: { code: string } }).failure.code, "event.reentrant-write");
  const state = bus.read();
  assert.ok(state.ok);
  assert.equal(state.value.history.undoDepth, 1);
  resetCvn6Callbacks();
});

test("A bound guest cannot bypass the unbound plugin validator or Core target checks", () => {
  resetCvn6Callbacks();
  const oracle = create(false), native = create(true), before = native.read();
  cvn6CallbackBehavior.validatorIssueModule = "part";
  const expected = oracle.submit(command());
  assert.equal(expected.status, "rejected");
  assert.deepEqual(native.submit(command()), expected);
  assert.deepEqual(native.read(), before);
  resetCvn6Callbacks();
  for (const input of [{ ...command(), payload: {} }, { ...command(), target: { kind: "document", documentId: "missing" } },
    { ...command(), payload: { ...command().payload, noteId: "missing" } }]) {
    assert.deepEqual(native.submit(input), oracle.submit(input));
    assert.deepEqual(native.read(), before);
  }
});

test("Detached migration shares the authentic binding and executes actual Wasm effects and validation", () => {
  for (const [source, target] of [[1, 2], [2, 1]]) {
    resetCvn6Callbacks();
    const compiled = catalog();
    const initial: ScoreDocument = { ...document(), extensions: [...document().extensions,
      { namespace: "fixture.score", schemaVersion: source!, owner: { kind: "score" }, payload: { marker: "before" } }] };
    const request = { migrationVersion: 1, moduleId: "fixture.score.module", contributionId: "fixture.score.contribution.v1",
      namespace: "fixture.score", effectKind: "fixture.score.replace", owner: { kind: "score" },
      sourceSchemaVersion: source, targetSchemaVersion: target, payload: { schemaVersion: target, marker: "after" } };
    const expected = migrateKernelExtension(initial, request, compiled);
    assert.equal(expected.status, "migrated");
    resetCvn6Callbacks();
    const restore = installNativeWasmIntegratedBackendV1(addon, compiled, [binding()]);
    try {
      assert.deepEqual(migrateKernelExtension(initial, request, compiled), expected);
      assert.ok(!cvn6CallbackTrace.some(entry => entry.endsWith(":score")));
      assert.ok(cvn6CallbackTrace.includes("validate:part"));
      assert.equal(migrateKernelExtension(initial, request, catalog()).status, "rejected");
    } finally { restore(); }
  }
});

test("Binding roster rejects invalid identities, mutable shapes and artifact mismatch before compiling any entry", () => {
  const compiled = catalog();
  let captures = 0, getterCalls = 0;
  const counted: WasmNativeAddonV1 = { ...addon, createWasmModuleExecutorV1(...args) { captures++; return addon.createWasmModuleExecutorV1(...args); } };
  const accessor = { ...binding() };
  Object.defineProperty(accessor, "bytes", { get() { getterCalls++; return guest; } });
  const invalid = [[], [binding(), binding()], [binding(), { ...binding("part"), sha256: "0".repeat(64) }],
    [{ ...binding(), moduleId: "missing" }], [{ ...binding(), contributionId: "missing" }], [{ ...binding(), abiVersion: 1.1 }],
    [{ ...binding(), extra: true }], [accessor], [{ ...binding(), bytes: new Proxy(guest, {}) }],
    [{ ...binding(), bytes: new Uint8Array(4 * 1024 * 1024 + 1) }], [binding("score", new Uint8Array(new SharedArrayBuffer(8)))]];
  for (const rows of invalid) assert.throws(() => createWasmExecutionPolicyV1(counted, compiled, rows), /wasm.invalid-binding/);
  assert.throws(() => createWasmExecutionPolicyV1(counted, {} as typeof compiled, [binding()]), /wasm.invalid-binding/);
  assert.equal(captures, 0);
  assert.equal(getterCalls, 0);
  assert.throws(() => createWasmExecutionPolicyV1({ ...addon, migrateKernelExtensionV2: undefined } as unknown as WasmNativeAddonV1,
    compiled, [binding()]), /wasm.invalid-addon/);
});

test("Captured bytes and catalog identity remain fixed across installer restoration and later mutation", () => {
  resetCvn6Callbacks();
  const compiled = catalog(), row = binding();
  const restore = installNativeWasmIntegratedBackendV1(addon, compiled, [row]);
  let bus;
  try {
    row.bytes.fill(0);
    const created = CommandBus.createIntegrated(document(), compiled);
    assert.ok(created.ok);
    bus = created.value;
    assert.equal(CommandBus.createIntegrated(document(), catalog()).ok, false);
    assert.throws(() => installNativeWasmIntegratedBackendV1(addon, compiled, [row]));
    assert.equal(bus.submit(command()).status, "committed");
  } finally { restore(); }
  resetCvn6Callbacks();
  assert.equal(bus.submit(command("score", "retained", "D")).status, "committed");
  assert.ok(!cvn6CallbackTrace.some(entry => entry.endsWith(":score")));
  resetCvn6Callbacks();
  const normal = CommandBus.createIntegrated(document(), catalog());
  assert.ok(normal.ok);
  assert.equal(normal.value.submit(command()).status, "committed");
  assert.ok(cvn6CallbackTrace.includes("commandPrepare:score"));
  resetCvn6Callbacks();
});
