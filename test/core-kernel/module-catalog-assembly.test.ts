import { test } from "node:test";
import assert = require("node:assert/strict");

import { compileOfficialModuleCatalogV1 } from "../../src/core-kernel/module-sdk/index";
import { getKernelIntegratedCatalogState } from "../../src/core-kernel/registry/domain-catalog";
import {
  SYNTHETIC_OFFICIAL_MODULE_MANIFEST,
  SYNTHETIC_OFFICIAL_MODULE_REGISTRATION_ENTRIES,
  resetSyntheticOfficialModuleCallbackCounts,
  syntheticOfficialModuleCallbackCounts,
} from "./fixtures/synthetic-official-modules";

function callbackCountSnapshot(): Record<string, number> {
  return { ...syntheticOfficialModuleCallbackCounts };
}

function assertZeroCallbacks(): void {
  assert.deepEqual(callbackCountSnapshot(), {
    commandDecode: 0,
    commandPrepare: 0,
    validate: 0,
    classify: 0,
    effectDecode: 0,
    effectTransform: 0,
  });
}

function stateSummary(catalog: Parameters<typeof getKernelIntegratedCatalogState>[0]) {
  const state = getKernelIntegratedCatalogState(catalog);
  assert.notEqual(state, undefined);
  if (state === undefined) {
    throw new Error("missing catalog state");
  }
  return {
    modules: state.modules.map((module) => ({
      moduleId: module.moduleId,
      runtime: module.runtime,
      capabilities: [...module.capabilities],
    })),
    contributions: state.contributions.map((contribution) => ({
      moduleId: contribution.moduleId,
      contributionId: contribution.contributionId,
      namespaces: [...contribution.extensionNamespaces],
      requirements: contribution.extensionRequirements.map((requirement) => ({
        namespace: requirement.namespace,
        versions: [...requirement.supportedSchemaVersions],
      })),
      commands: contribution.commands.map(
        (command) => command.descriptor.commandId,
      ),
      effects: contribution.effects.map(
        (effect) => effect.descriptor.effectKind,
      ),
    })),
    commandIds: Object.keys(state.commandIndex),
    effectKinds: Object.keys(state.effectIndex),
    namespaces: Object.keys(state.namespaceIndex),
    coreSummary: state.coreAssembly.summary,
  };
}

test("two synthetic official modules compile into one frozen opaque catalog", () => {
  resetSyntheticOfficialModuleCallbackCounts();
  const result = compileOfficialModuleCatalogV1(
    SYNTHETIC_OFFICIAL_MODULE_MANIFEST,
    SYNTHETIC_OFFICIAL_MODULE_REGISTRATION_ENTRIES,
  );
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(Object.isFrozen(result.catalog), true);
  assert.deepEqual(Object.keys(result.catalog), []);
  assert.equal(Reflect.ownKeys(result.catalog).length, 1);
  for (const mutationName of [
    "register",
    "unregister",
    "replace",
    "reload",
    "createSession",
    "submit",
  ]) {
    assert.equal(mutationName in result.catalog, false);
  }

  assert.deepEqual(stateSummary(result.catalog), {
    modules: [
      {
        moduleId: "fixture.part.module",
        runtime: "internal-module",
        capabilities: [
          "command:execute",
          "command:register",
          "event:subscribe",
          "score:read",
        ],
      },
      {
        moduleId: "fixture.score.module",
        runtime: "builtin",
        capabilities: [
          "command:execute",
          "command:register",
          "event:subscribe",
          "score:read",
        ],
      },
    ],
    contributions: [
      {
        moduleId: "fixture.part.module",
        contributionId: "fixture.part.contribution.v1",
        namespaces: ["fixture.part"],
        requirements: [{ namespace: "fixture.part", versions: [1] }],
        commands: ["fixture.part.touch"],
        effects: ["fixture.part.replace"],
      },
      {
        moduleId: "fixture.score.module",
        contributionId: "fixture.score.contribution.v1",
        namespaces: ["fixture.score"],
        requirements: [{ namespace: "fixture.score", versions: [1] }],
        commands: ["fixture.score.touch"],
        effects: ["fixture.score.replace"],
      },
    ],
    commandIds: ["fixture.part.touch", "fixture.score.touch"],
    effectKinds: ["fixture.part.replace", "fixture.score.replace"],
    namespaces: ["fixture.part", "fixture.score"],
    coreSummary: {
      startupManifestVersion: 1,
      modules: [
        { moduleId: "core.commands", apiVersion: 1 },
        { moduleId: "core.selectors", apiVersion: 1 },
      ],
      contributions: stateSummary(result.catalog).coreSummary.contributions,
    },
  });
  assertZeroCallbacks();
});

test("catalog normalization is order independent and identities are process-local", () => {
  resetSyntheticOfficialModuleCallbackCounts();
  const modules = [...SYNTHETIC_OFFICIAL_MODULE_MANIFEST.modules].reverse();
  const entries = [...SYNTHETIC_OFFICIAL_MODULE_REGISTRATION_ENTRIES].reverse();
  const first = compileOfficialModuleCatalogV1(
    { startupManifestVersion: 1, modules },
    entries,
  );
  const second = compileOfficialModuleCatalogV1(
    SYNTHETIC_OFFICIAL_MODULE_MANIFEST,
    SYNTHETIC_OFFICIAL_MODULE_REGISTRATION_ENTRIES,
  );
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  if (!first.ok || !second.ok) {
    return;
  }

  const firstState = getKernelIntegratedCatalogState(first.catalog);
  const secondState = getKernelIntegratedCatalogState(second.catalog);
  assert.notEqual(first.catalog, second.catalog);
  assert.notEqual(firstState?.assemblyIdentity, secondState?.assemblyIdentity);
  assert.deepEqual(stateSummary(first.catalog), stateSummary(second.catalog));

  modules.length = 0;
  entries.length = 0;
  assert.equal(firstState?.modules.length, 2);
  assert.equal(firstState?.contributions.length, 2);
  assertZeroCallbacks();
});

test("structural catalog lookalikes have no private state", () => {
  const fake = Object.freeze({}) as Parameters<
    typeof getKernelIntegratedCatalogState
  >[0];
  assert.equal(getKernelIntegratedCatalogState(fake), undefined);
});
