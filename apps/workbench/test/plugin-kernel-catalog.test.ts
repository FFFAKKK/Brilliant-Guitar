import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

import { compilePluginKernelCatalogV1 } from "../host/plugin-kernel-catalog.ts";
import { createPluginKernelAssemblyPlanV1 } from "../src/plugins/plugin-package-contract.ts";

const require = createRequire(import.meta.url);
const keySignature = require("../.kernel/src/first-party-modules/key-signature.js") as
  typeof import("../.kernel/src/first-party-modules/key-signature.js");
const { getKernelIntegratedCatalogState } = require(
  "../.kernel/src/core-kernel/registry/domain-catalog.js",
) as typeof import("../.kernel/src/core-kernel/registry/domain-catalog.js");

function internalPlan() {
  return createPluginKernelAssemblyPlanV1([{
    id: "brilliant.notation.foundation",
    version: "1.0.0",
    activation: "always",
    tier: "system",
    kernelModules: [{
      moduleId: keySignature.KEY_SIGNATURE_NAMESPACE,
      apiVersion: 1,
      runtime: "internal-module",
      activation: "session-fixed",
    }],
  }]);
}

function internalBinding(implementation = keySignature.KEY_SIGNATURE_MODULE_REGISTRATION_ENTRIES[0]!) {
  return {
    pluginId: "brilliant.notation.foundation",
    pluginVersion: "1.0.0",
    tier: "system" as const,
    moduleId: keySignature.KEY_SIGNATURE_NAMESPACE,
    apiVersion: 1 as const,
    runtime: "internal-module" as const,
    activation: "session-fixed" as const,
    implementation,
  };
}

test("fixed plugin assembly compiles through the real Kernel Catalog", () => {
  const result = compilePluginKernelCatalogV1(internalPlan(), [internalBinding()]);

  assert.equal(result.ok, true);
  if (!result.ok) return;
  const state = getKernelIntegratedCatalogState(result.catalog);
  assert.deepEqual(state?.modules.map((module) => module.moduleId), [keySignature.KEY_SIGNATURE_NAMESPACE]);
  assert.deepEqual(result.assembly.modules.map((module) => module.pluginId), ["brilliant.notation.foundation"]);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.assembly), true);
  assert.equal("replace" in result, false);
  assert.equal("reload" in result, false);
  assert.equal("unload" in result, false);
});

test("empty plugin assembly produces one valid Core-only integrated catalog", () => {
  const result = compilePluginKernelCatalogV1(createPluginKernelAssemblyPlanV1([]), []);

  assert.equal(result.ok, true);
  if (!result.ok) return;
  const state = getKernelIntegratedCatalogState(result.catalog);
  assert.deepEqual(state?.modules, []);
  assert.deepEqual(state?.coreAssembly.modules.map((module) => module.moduleId), ["core.commands", "core.selectors"]);
});

test("host rejects Wasm until artifact verification exists", () => {
  const plan = createPluginKernelAssemblyPlanV1([{
    id: "example.third-party",
    version: "1.0.0",
    activation: "user",
    tier: "third-party",
    kernelModules: [{
      moduleId: "example.third-party.module",
      apiVersion: 1,
      runtime: "wasm",
      activation: "session-fixed",
    }],
  }]);
  const result = compilePluginKernelCatalogV1(plan, [{
    pluginId: "example.third-party",
    pluginVersion: "1.0.0",
    tier: "third-party",
    moduleId: "example.third-party.module",
    apiVersion: 1,
    runtime: "wasm",
    activation: "session-fixed",
    implementation: {},
  }]);

  assert.deepEqual(result, {
    ok: false,
    failure: {
      code: "kernel-host.runtime-not-ready",
      moduleId: "example.third-party.module",
      runtime: "wasm",
    },
  });
});

test("binding and Kernel Catalog failures retain their exact cause", () => {
  assert.deepEqual(compilePluginKernelCatalogV1(internalPlan(), []), {
    ok: false,
    failure: {
      code: "kernel-host.binding-rejected",
      failure: {
        code: "kernel-binding.missing-binding",
        moduleId: keySignature.KEY_SIGNATURE_NAMESPACE,
      },
    },
  });

  const wrongOwner = {
    ...keySignature.KEY_SIGNATURE_MODULE_REGISTRATION_ENTRIES[0]!,
    ownerModuleId: "brilliant.wrong-owner",
  };
  const compiled = compilePluginKernelCatalogV1(internalPlan(), [internalBinding(wrongOwner)]);
  assert.deepEqual(compiled, {
    ok: false,
    failure: {
      code: "kernel-host.catalog-rejected",
      failure: {
        code: "registry.registration-owner-mismatch",
        registrationEntryId: "kernel.domain-commands.v1",
        moduleId: keySignature.KEY_SIGNATURE_NAMESPACE,
      },
    },
  });
});
