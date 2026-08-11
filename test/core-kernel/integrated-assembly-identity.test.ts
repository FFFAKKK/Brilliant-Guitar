import { test } from "node:test";
import assert = require("node:assert/strict");

import {
  CommandBus,
  CORE_KERNEL_STARTUP_MANIFEST,
  createKernelRegistry,
} from "../../src/core-kernel/index";
import { compileOfficialModuleCatalogV1 } from "../../src/core-kernel/module-sdk/index";
import { createCoreScoreFixture } from "./fixtures/core-score";
import {
  CVN6_MANIFEST,
  CVN6_REGISTRATION_ENTRIES,
} from "./fixtures/cvn-6-synthetic-official-modules";

const inventory = {
  inventoryVersion: 1,
  requirements: [
    {
      requirementVersion: 1,
      namespace: "fixture.score",
      moduleId: "fixture.score.module",
      contributionId: "fixture.score.contribution.v1",
      supportedSchemaVersions: [1, 2],
      requiredForWrite: true,
    },
    {
      requirementVersion: 1,
      namespace: "fixture.part",
      moduleId: "fixture.part.module",
      contributionId: "fixture.part.contribution.v1",
      supportedSchemaVersions: [1, 2],
      requiredForWrite: true,
    },
  ],
} as const;

function catalog() {
  const result = compileOfficialModuleCatalogV1(CVN6_MANIFEST, CVN6_REGISTRATION_ENTRIES);
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("catalog");
  return result.catalog;
}

test("equal normalized catalog plus inventory values share one private runtime identity", () => {
  const compiled = catalog();
  const registry = createKernelRegistry(compiled, inventory);
  const reordered = {
    inventoryVersion: 1,
    requirements: [...inventory.requirements].reverse().map((requirement) => ({
      ...requirement,
      supportedSchemaVersions: [...requirement.supportedSchemaVersions],
    })),
  };
  const bus = CommandBus.createIntegrated(createCoreScoreFixture(), compiled, reordered);
  assert.equal(registry.ok, true);
  assert.equal(bus.ok, true);
  if (!registry.ok || !bus.ok) return;
  const gateway = registry.registry.createGateway("fixture.score.module", bus.value);
  assert.equal(gateway.ok, true);
  if (!gateway.ok) return;
  const crossModule = gateway.gateway.submit({
    commandVersion: 1,
    commandId: "fixture.part.apply",
    target: { kind: "part", partId: "part-1" },
    payload: {
      noteId: "note-1",
      pitch: { step: "D", alter: 0, octave: 4 },
      schemaVersion: 1,
      marker: "cross-module",
    },
  });
  assert.deepEqual(crossModule, {
    status: "rejected",
    failure: {
      code: "registry.contribution-not-found",
      contributionId: "fixture.part.apply",
    },
  });
});

test("different inventory and Core/integrated pairings reject before gateway exposure", () => {
  const compiled = catalog();
  const registry = createKernelRegistry(compiled, inventory);
  const differentInventory = {
    ...inventory,
    requirements: [
      ...inventory.requirements,
      {
        requirementVersion: 1,
        namespace: "fixture.absent",
        moduleId: "fixture.absent.module",
        contributionId: "fixture.absent.contribution.v1",
        supportedSchemaVersions: [1],
        requiredForWrite: true,
      },
    ],
  };
  const differentBus = CommandBus.createIntegrated(
    createCoreScoreFixture(),
    compiled,
    differentInventory,
  );
  assert.equal(registry.ok, true);
  assert.equal(differentBus.ok, true);
  if (!registry.ok || !differentBus.ok) return;
  assert.deepEqual(
    registry.registry.createGateway("fixture.score.module", differentBus.value),
    { ok: false, failure: { code: "registry.assembly-mismatch" } },
  );

  const coreRegistry = createKernelRegistry(CORE_KERNEL_STARTUP_MANIFEST);
  const coreBus = CommandBus.create(createCoreScoreFixture());
  assert.equal(coreRegistry.ok, true);
  assert.equal(coreBus.ok, true);
  if (!coreRegistry.ok || !coreBus.ok) return;
  assert.deepEqual(
    registry.registry.createGateway("core.commands", coreBus.value),
    { ok: false, failure: { code: "registry.assembly-mismatch" } },
  );
  assert.deepEqual(
    coreRegistry.registry.createGateway("core.commands", differentBus.value),
    { ok: false, failure: { code: "registry.assembly-mismatch" } },
  );
});
