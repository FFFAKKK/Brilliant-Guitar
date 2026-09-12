import { test } from "node:test";
import assert = require("node:assert/strict");
import { resolve } from "node:path";
import { CommandBus, migrateKernelExtension, type ScoreDocument } from "../../../src/core-kernel/index";
import { compileOfficialModuleCatalogV1 } from "../../../src/core-kernel/module-sdk/index";
import { installNativeIntegratedBackendV2, type IntegratedNativeAddonV2 } from "../../../src/core-kernel/native/integrated-command-bus";
import { CVN6_MANIFEST, CVN6_REGISTRATION_ENTRIES, cvn6CallbackBehavior, cvn6CallbackCounts, resetCvn6Callbacks } from "../fixtures/cvn-6-synthetic-official-modules";
import { createCoreScoreFixture } from "../fixtures/core-score";

const addon = require(resolve("target/integrated-v2/brilliant_kernel_node.node")) as IntegratedNativeAddonV2;
function catalog() {
  const result = compileOfficialModuleCatalogV1(CVN6_MANIFEST, CVN6_REGISTRATION_ENTRIES);
  assert.ok(result.ok);
  return result.catalog;
}
function request(module: "score" | "part" = "score", source = 1, target = 2) {
  return { migrationVersion: 1, moduleId: `fixture.${module}.module`, contributionId: `fixture.${module}.contribution.v1`,
    effectKind: `fixture.${module}.replace`, namespace: `fixture.${module}`,
    owner: module === "score" ? { kind: "score" as const } : { kind: "part" as const, partId: "part-1" },
    sourceSchemaVersion: source, targetSchemaVersion: target, payload: { schemaVersion: target, marker: "after\ud800" } };
}
function document(module: "score" | "part" = "score", version = 1): ScoreDocument {
  const initial = createCoreScoreFixture();
  return { ...initial, extensions: [...initial.extensions,
    { namespace: `fixture.${module}`, schemaVersion: version, owner: request(module).owner, payload: { marker: "before" } },
    { namespace: "unknown.opaque", schemaVersion: 17, owner: { kind: "score" }, payload: { "\ud800": ["\udfff", -0, { keep: true }] } },
  ] };
}
function migrate(native: boolean, input: unknown, wanted: unknown, compiled = catalog(), transport = addon) {
  const restore = native ? installNativeIntegratedBackendV2(transport) : () => {};
  try { return migrateKernelExtension(input, wanted, compiled); } finally { restore(); }
}

test("Native detached migration uses real SDK bindings, preserves inputs, and matches upgrade, downgrade and idempotence", () => {
  assert.equal(typeof addon.migrateKernelExtensionV2, "function");
  for (const module of ["score", "part"] as const) {
    for (const [source, target] of [[1, 2], [2, 1]] as const) {
      const input = document(module, source);
      const before = structuredClone(input);
      const compiled = catalog();
      resetCvn6Callbacks();
      const expected = migrate(false, input, request(module, source, target), compiled);
      const counts = { ...cvn6CallbackCounts };
      resetCvn6Callbacks();
      let nativeCalls = 0;
      const transport: IntegratedNativeAddonV2 = { ...addon, migrateKernelExtensionV2(bytes, executor) {
        nativeCalls++;
        return addon.migrateKernelExtensionV2!(bytes, executor);
      } };
      const actual = migrate(true, input, request(module, source, target), compiled, transport);
      assert.equal(actual.status, "migrated");
      assert.deepEqual(actual, expected);
      assert.equal(nativeCalls, 1);
      assert.deepEqual(cvn6CallbackCounts, counts);
      assert.deepEqual(input, before);
      if (actual.status !== "migrated") throw new Error("migration");
      assert.equal(Object.isFrozen(actual.document.extensions), true);
      assert.equal(Object.is(actual.document.extensions.at(-1)!.payload["\ud800"] instanceof Array
        ? (actual.document.extensions.at(-1)!.payload["\ud800"] as readonly unknown[])[1] : undefined, -0), false);
      resetCvn6Callbacks();
      const repeated = migrate(true, actual.document, request(module, source, target), compiled);
      assert.equal(repeated.status, "not-required");
      assert.deepEqual(repeated, migrate(false, actual.document, request(module, source, target), compiled));
      assert.equal(cvn6CallbackCounts.effectTransform, 0);
      assert.equal(cvn6CallbackCounts.validate, 0);
    }
  }
  const input = document("score", 2);
  const result = migrate(true, input, request());
  assert.equal(result.status, "not-required");
  if (result.status === "not-required") assert.deepEqual(result.document, input, "idempotence preserves negative zero too");
  resetCvn6Callbacks();
});

test("Native migration preserves input, request, semantics, assembly and version failure precedence", () => {
  const initial = document();
  const compiled = catalog();
  const badCatalog = {} as typeof compiled;
  const cases: readonly [unknown, unknown, typeof compiled][] = [
    [{}, request(), compiled],
    [initial, { ...request(), extra: true }, compiled],
    [{ ...initial, parts: [] }, { ...request(), extra: true }, badCatalog],
    [{ ...initial, parts: [] }, request(), badCatalog],
    [initial, request(), badCatalog],
    [initial, { ...request(), moduleId: "missing.module" }, compiled],
    [initial, { ...request(), owner: { kind: "part", partId: "part-1" } }, compiled],
    [{ ...initial, extensions: [] }, request(), compiled],
    [document("score", 9), request(), compiled],
    [initial, request("score", 1, 3), compiled],
    [document("score", 2), request("score", 3, 2), compiled],
    [document("score", 2), { ...request(), contributionId: "missing.contribution" }, compiled],
    [initial, request("score", 1, 1), compiled],
    [{ ...initial, id: "" }, request(), compiled],
  ];
  for (const [index, [input, wanted, selected]] of cases.entries()) {
    resetCvn6Callbacks();
    const expected = migrate(false, input, wanted, selected);
    assert.equal(expected.status, "rejected", `case ${index}`);
    assert.deepEqual(migrate(true, input, wanted, selected), expected, `case ${index}`);
    assert.equal(cvn6CallbackCounts.effectDecode, 0);
  }
});

test("Native migration matches callback and final module failures without invoking commands or classification", () => {
  for (const mode of ["throwFamily", "malformedFamily"] as const) {
    for (const family of ["effectDecode", "effectTransform", "validate"] as const) {
      resetCvn6Callbacks();
      const input = document();
      const before = structuredClone(input);
      cvn6CallbackBehavior[mode] = family;
      const expected = migrate(false, input, request());
      assert.equal(expected.status, "rejected");
      assert.deepEqual(migrate(true, input, request()), expected, `${mode}/${family}`);
      assert.deepEqual(input, before);
      assert.equal(cvn6CallbackCounts.commandPrepare, 0);
      assert.equal(cvn6CallbackCounts.classify, 0);
    }
  }
  for (const bad of ["remove", "wrong-version", "semantic"] as const) {
    resetCvn6Callbacks();
    if (bad === "semantic") cvn6CallbackBehavior.validatorIssueModule = "score";
    else cvn6CallbackBehavior.transformOverride = () => bad === "remove" ? { status: "remove" } : { status: "replace", schemaVersion: 1, payload: {} };
    const expected = migrate(false, document(), request());
    assert.equal(expected.status, "rejected");
    assert.deepEqual(migrate(true, document(), request()), expected);
  }
  resetCvn6Callbacks();
});

test("Native migration rejects JSON primordial replacement and forged returned target versions", () => {
  const original = JSON.stringify;
  for (const native of [false, true]) {
    resetCvn6Callbacks();
    cvn6CallbackBehavior.replaceJsonStringify = true;
    try {
      const result = migrate(native, document(), request());
      assert.equal(result.status, "rejected");
      if (result.status === "rejected") assert.equal(result.failure.code, "migration.contribution-contract-violation");
      assert.equal(cvn6CallbackCounts.validate, 0);
    } finally { JSON.stringify = original; }
  }
  resetCvn6Callbacks();
  const transport: IntegratedNativeAddonV2 = { ...addon, migrateKernelExtensionV2(bytes, executor) {
    return addon.migrateKernelExtensionV2!(bytes, bytes => {
      const input = JSON.parse(bytes.toString("utf8"));
      const output = JSON.parse(executor(bytes).toString("utf8"));
      if (input.operation === "migrationPrepare" && output.ok) output.schemaVersion = 99;
      return Buffer.from(JSON.stringify(output));
    });
  } };
  const result = migrate(true, document(), request(), catalog(), transport);
  assert.equal(result.status, "rejected");
  if (result.status === "rejected") assert.equal(result.failure.code, "migration.contribution-contract-violation");
  assert.equal(cvn6CallbackCounts.validate, 0);
});

test("Native detached migration does not create editing history or mutate an existing session", () => {
  resetCvn6Callbacks();
  const input = document();
  const compiled = catalog();
  const restore = installNativeIntegratedBackendV2(addon);
  try {
    const created = CommandBus.createIntegrated(input, compiled);
    assert.ok(created.ok);
    const before = created.value.read();
    const events: unknown[] = [];
    created.value.subscribe((event: unknown) => events.push(event));
    assert.equal(migrateKernelExtension(input, request(), compiled).status, "migrated");
    assert.deepEqual(created.value.read(), before);
    assert.deepEqual(events, []);
    assert.equal(created.value.undo().status, "rejected");
  } finally { restore(); }
});


test("Native migration validates other compatible plugins but does not impose session availability or classification", () => {
  for (const otherVersion of [1, 99]) {
    resetCvn6Callbacks();
    const input: ScoreDocument = { ...document(), extensions: [...document().extensions,
      { namespace: "fixture.part", schemaVersion: otherVersion, owner: { kind: "part", partId: "part-1" }, payload: {} },
    ] };
    cvn6CallbackBehavior.validatorIssueModule = "part";
    const expected = migrate(false, input, request());
    assert.equal(expected.status, otherVersion === 1 ? "rejected" : "migrated");
    const counts = { ...cvn6CallbackCounts };
    resetCvn6Callbacks();
    cvn6CallbackBehavior.validatorIssueModule = "part";
    assert.deepEqual(migrate(true, input, request()), expected);
    assert.deepEqual(cvn6CallbackCounts, counts);
    assert.equal(cvn6CallbackCounts.classify, 0);
  }
  resetCvn6Callbacks();
});

test("Private migration backend restore is isolated across repeated legacy-only selections", () => {
  resetCvn6Callbacks();
  let calls = 0;
  const tracked: IntegratedNativeAddonV2 = { ...addon, migrateKernelExtensionV2(bytes, executor) {
    calls++;
    return addon.migrateKernelExtensionV2!(bytes, executor);
  } };
  const legacy: IntegratedNativeAddonV2 = { createIntegratedKernelSessionV2: addon.createIntegratedKernelSessionV2 };
  const restoreA = installNativeIntegratedBackendV2(tracked);
  const restoreB = installNativeIntegratedBackendV2(legacy);
  restoreB();
  const restoreC = installNativeIntegratedBackendV2(legacy);
  try {
    restoreB(); // a stale restore must not re-enable A inside C's selection
    assert.equal(migrateKernelExtension(document(), request(), catalog()).status, "migrated");
    assert.equal(calls, 0);
    restoreC();
    assert.equal(migrateKernelExtension(document(), request(), catalog()).status, "migrated");
    assert.equal(calls, 1);
  } finally { restoreC(); restoreA(); }
});

test("Native migration rejects a malformed private document with a complete failure shape", () => {
  resetCvn6Callbacks();
  const transport: IntegratedNativeAddonV2 = { ...addon, migrateKernelExtensionV2(bytes, executor) {
    const input = JSON.parse(bytes.toString("utf8"));
    input.document.extra = true;
    return addon.migrateKernelExtensionV2!(Buffer.from(JSON.stringify(input)), executor);
  } };
  const result = migrate(true, document(), request(), catalog(), transport);
  assert.equal(result.status, "rejected");
  if (result.status === "rejected") assert.deepEqual(result.failure, { code: "migration.invalid-input", diagnostics: [] });
  assert.equal(cvn6CallbackCounts.effectDecode, 0);
});
