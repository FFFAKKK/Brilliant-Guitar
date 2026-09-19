import assert from "node:assert/strict";
import test from "node:test";

import { bindTrustedPluginKernelAssemblyV1 } from "../src/plugins/plugin-kernel-adapter.ts";
import {
  capturePluginKernelAssemblyPlanV1,
  createPluginKernelAssemblyPlanV1,
} from "../src/plugins/plugin-package-contract.ts";

const moduleManifest = (moduleId: string, runtime: "internal-module" | "wasm" = "internal-module") => ({
  moduleId,
  apiVersion: 1 as const,
  runtime,
  activation: "session-fixed" as const,
});

function plan() {
  return createPluginKernelAssemblyPlanV1([
    {
      id: "test.plugin.second",
      version: "2.0.0",
      activation: "always",
      tier: "product",
      kernelModules: [moduleManifest("test.module.second")],
    },
    {
      id: "test.plugin.first",
      version: "1.0.0",
      activation: "always",
      tier: "system",
      kernelModules: [moduleManifest("test.module.first")],
    },
  ]);
}

function binding(moduleId: "test.module.first" | "test.module.second", implementation: object = {}) {
  const first = moduleId === "test.module.first";
  return {
    pluginId: first ? "test.plugin.first" : "test.plugin.second",
    pluginVersion: first ? "1.0.0" : "2.0.0",
    tier: first ? "system" as const : "product" as const,
    moduleId,
    apiVersion: 1 as const,
    runtime: "internal-module" as const,
    activation: "session-fixed" as const,
    implementation,
  };
}

test("transported kernel plans are strictly captured into canonical frozen data", () => {
  const original = plan();
  const transported = JSON.parse(JSON.stringify({
    planVersion: original.planVersion,
    modules: [...original.modules].reverse(),
  }));
  const captured = capturePluginKernelAssemblyPlanV1(transported);

  assert.ok(captured);
  assert.deepEqual(captured.modules.map((entry) => entry.moduleId), ["test.module.first", "test.module.second"]);
  assert.equal(Object.isFrozen(captured), true);
  assert.equal(Object.isFrozen(captured.modules), true);
  assert.equal(Object.isFrozen(captured.modules[0]), true);

  const accessor = { planVersion: 1, get modules() { throw new Error("must not execute"); } };
  assert.equal(capturePluginKernelAssemblyPlanV1(accessor), null);
  assert.equal(capturePluginKernelAssemblyPlanV1({ ...transported, extra: true }), null);
  assert.equal(capturePluginKernelAssemblyPlanV1({ planVersion: 1, modules: [
    transported.modules[0], { ...transported.modules[1], pluginVersion: "9.0.0", pluginId: transported.modules[0].pluginId },
  ] }), null);
});

test("trusted adapter binds exactly one opaque implementation per canonical plan entry", () => {
  const firstImplementation = Object.freeze({ kind: "compiled-internal" });
  const secondImplementation = Object.freeze({ kind: "compiled-internal" });
  const result = bindTrustedPluginKernelAssemblyV1(plan(), [
    binding("test.module.second", secondImplementation),
    binding("test.module.first", firstImplementation),
  ]);

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.assembly.modules.map((entry) => entry.moduleId), ["test.module.first", "test.module.second"]);
  assert.equal(result.assembly.modules[0]?.implementation, firstImplementation);
  assert.equal(result.assembly.modules[1]?.implementation, secondImplementation);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.assembly), true);
  assert.equal(Object.isFrozen(result.assembly.modules), true);
  assert.equal(Object.isFrozen(result.assembly.modules[0]), true);
  assert.equal("replace" in result.assembly, false);
  assert.equal("reload" in result.assembly, false);
  assert.equal("unload" in result.assembly, false);
});

test("trusted adapter reports missing, extra and duplicate implementations before execution", () => {
  assert.deepEqual(bindTrustedPluginKernelAssemblyV1(plan(), [binding("test.module.first")]), {
    ok: false,
    failure: { code: "kernel-binding.missing-binding", moduleId: "test.module.second" },
  });
  assert.deepEqual(bindTrustedPluginKernelAssemblyV1(plan(), [
    binding("test.module.first"),
    binding("test.module.second"),
    { ...binding("test.module.second"), moduleId: "test.module.extra" },
  ]), {
    ok: false,
    failure: { code: "kernel-binding.unexpected-binding", moduleId: "test.module.extra", bindingIndex: 2 },
  });
  assert.deepEqual(bindTrustedPluginKernelAssemblyV1(plan(), [
    binding("test.module.first"),
    binding("test.module.first"),
  ]), {
    ok: false,
    failure: { code: "kernel-binding.duplicate-binding", moduleId: "test.module.first", bindingIndex: 1 },
  });
});

test("trusted adapter rejects ownership, version, tier and runtime mismatches", () => {
  for (const changed of [
    { pluginId: "test.plugin.wrong" },
    { pluginVersion: "9.0.0" },
    { tier: "system" as const },
    { runtime: "wasm" as const },
  ]) {
    const result = bindTrustedPluginKernelAssemblyV1(plan(), [
      binding("test.module.first"),
      { ...binding("test.module.second"), ...changed },
    ]);
    assert.deepEqual(result, {
      ok: false,
      failure: { code: "kernel-binding.identity-mismatch", moduleId: "test.module.second", bindingIndex: 1 },
    });
  }
});

test("trusted adapter rejects hostile roster shapes without reading accessors", () => {
  const sparse = new Array(2);
  sparse[1] = binding("test.module.second");
  assert.deepEqual(bindTrustedPluginKernelAssemblyV1(plan(), sparse), {
    ok: false,
    failure: { code: "kernel-binding.invalid-binding", bindingIndex: 0 },
  });
  const hostile = {
    ...binding("test.module.first"),
    get implementation() { throw new Error("must not execute"); },
  };
  assert.deepEqual(bindTrustedPluginKernelAssemblyV1(plan(), [hostile]), {
    ok: false,
    failure: { code: "kernel-binding.invalid-binding", bindingIndex: 0 },
  });
  assert.deepEqual(bindTrustedPluginKernelAssemblyV1(plan(), {}), {
    ok: false,
    failure: { code: "kernel-binding.invalid-roster" },
  });
  const throwingPlan = new Proxy({}, { ownKeys() { throw new Error("hostile plan"); } });
  assert.equal(capturePluginKernelAssemblyPlanV1(throwingPlan), null);
  const throwingRoster = new Proxy([], { get() { throw new Error("hostile roster"); } });
  assert.deepEqual(bindTrustedPluginKernelAssemblyV1(plan(), throwingRoster), {
    ok: false,
    failure: { code: "kernel-binding.invalid-roster" },
  });
});

test("an empty plan binds to one frozen empty assembly", () => {
  const empty = createPluginKernelAssemblyPlanV1([]);
  const result = bindTrustedPluginKernelAssemblyV1(empty, []);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.assembly.modules, []);
  assert.equal(Object.isFrozen(result.assembly.modules), true);
});
