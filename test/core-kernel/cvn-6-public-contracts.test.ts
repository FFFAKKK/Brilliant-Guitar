import { test } from "node:test";
import assert = require("node:assert/strict");

import * as core from "../../src/core-kernel/index";
import { CommandBus, createKernelRegistry } from "../../src/core-kernel/index";
import { compileOfficialModuleCatalogV1 } from "../../src/core-kernel/module-sdk/index";
import { createCoreScoreFixture } from "./fixtures/core-score";
import {
  CVN6_MANIFEST,
  CVN6_REGISTRATION_ENTRIES,
  cvn6CallbackCounts,
  resetCvn6Callbacks,
} from "./fixtures/cvn-6-synthetic-official-modules";

function catalog() {
  const compiled = compileOfficialModuleCatalogV1(
    CVN6_MANIFEST,
    CVN6_REGISTRATION_ENTRIES,
  );
  assert.equal(compiled.ok, true);
  if (!compiled.ok) {
    throw new Error("catalog compilation failed");
  }
  return compiled.catalog;
}

const INVENTORY = {
  inventoryVersion: 1,
  requirements: [
    {
      requirementVersion: 1,
      namespace: "fixture.part",
      moduleId: "fixture.part.module",
      contributionId: "fixture.part.contribution.v1",
      supportedSchemaVersions: [1, 2],
      requiredForWrite: true,
    },
    {
      requirementVersion: 1,
      namespace: "fixture.score",
      moduleId: "fixture.score.module",
      contributionId: "fixture.score.contribution.v1",
      supportedSchemaVersions: [1, 2],
      requiredForWrite: true,
    },
  ],
} as const;

function absentRequirement(index: number, versions: readonly number[] = [1]) {
  return {
    requirementVersion: 1 as const,
    namespace: `fixture.absent-${index}`,
    moduleId: "fixture.absent.module",
    contributionId: "fixture.absent.contribution.v1",
    supportedSchemaVersions: versions,
    requiredForWrite: true as const,
  };
}

test("CVN-6 exposes exactly the two approved application runtime additions", () => {
  const keys = Object.keys(core).sort();
  assert.equal(keys.length, 51);
  assert.equal(typeof core.replayKernelCommands, "function");
  assert.equal(typeof core.migrateKernelExtension, "function");
  assert.equal(keys.includes("KernelKnownRequirementInventoryV1"), false);
});

test("catalog-only and explicit-inventory integrated entry points construct without callbacks", () => {
  const compiled = catalog();
  resetCvn6Callbacks();
  const catalogOnly = CommandBus.createIntegrated(
    createCoreScoreFixture(),
    compiled,
  );
  const explicit = CommandBus.createIntegrated(
    createCoreScoreFixture(),
    compiled,
    INVENTORY,
  );
  const registry = createKernelRegistry(compiled, INVENTORY);
  assert.equal(catalogOnly.ok, true);
  assert.equal(explicit.ok, true);
  assert.equal(registry.ok, true);
  assert.deepEqual(cvn6CallbackCounts, {
    commandDecode: 0,
    commandPrepare: 0,
    validate: 0,
    classify: 0,
    effectDecode: 0,
    effectTransform: 0,
  });
});

test("explicit inventory is exact, duplicate-free, capped, and catalog-consistent", () => {
  const compiled = catalog();
  const document = createCoreScoreFixture();
  const forgedInstalledOwner = {
    ...INVENTORY,
    requirements: [
      ...INVENTORY.requirements,
      {
        requirementVersion: 1 as const,
        namespace: "fixture.score-forged",
        moduleId: "fixture.score.module",
        contributionId: "fixture.score.contribution.v1",
        supportedSchemaVersions: [1, 2],
        requiredForWrite: true as const,
      },
    ],
  };
  const invalidValues: unknown[] = [
    { ...INVENTORY, extra: true },
    { ...INVENTORY, requirements: [...INVENTORY.requirements, INVENTORY.requirements[0]] },
    { ...INVENTORY, requirements: [INVENTORY.requirements[0]] },
    forgedInstalledOwner,
    undefined,
  ];
  for (const value of invalidValues) {
    const bus = CommandBus.createIntegrated(document, compiled, value);
    assert.deepEqual(bus, {
      ok: false,
      failure: { code: "command.invalid-requirement-inventory" },
    });
    const registry = createKernelRegistry(compiled, value);
    assert.deepEqual(registry, {
      ok: false,
      failure: { code: "registry.invalid-startup-input" },
    });
  }

  const atRowLimit = {
    inventoryVersion: 1,
    requirements: [
      ...INVENTORY.requirements,
      ...Array.from({ length: 1_022 }, (_, index) => absentRequirement(index)),
    ],
  };
  assert.equal(CommandBus.createIntegrated(document, compiled, atRowLimit).ok, true);
  assert.equal(createKernelRegistry(compiled, atRowLimit).ok, true);

  const overCap = {
    ...atRowLimit,
    requirements: [...atRowLimit.requirements, absentRequirement(1_022)],
  };
  assert.deepEqual(CommandBus.createIntegrated(document, compiled, overCap), {
    ok: false,
    failure: { code: "command.invalid-requirement-inventory" },
  });

  const versionsAtLimit = {
    ...INVENTORY,
    requirements: [
      ...INVENTORY.requirements,
      absentRequirement(
        2_000,
        Array.from({ length: 256 }, (_, index) => index + 1),
      ),
    ],
  };
  assert.equal(
    CommandBus.createIntegrated(document, compiled, versionsAtLimit).ok,
    true,
  );
  const versionsOverLimit = {
    ...versionsAtLimit,
    requirements: [
      ...INVENTORY.requirements,
      absentRequirement(
        2_000,
        Array.from({ length: 257 }, (_, index) => index + 1),
      ),
    ],
  };
  assert.deepEqual(
    CommandBus.createIntegrated(document, compiled, versionsOverLimit),
    {
      ok: false,
      failure: { code: "command.invalid-requirement-inventory" },
    },
  );

  resetCvn6Callbacks();
  assert.deepEqual(
    core.replayKernelCommands(document, [], compiled, forgedInstalledOwner),
    {
      status: "invalid-initial-document",
      failure: { code: "command.invalid-requirement-inventory" },
    },
  );
  assert.deepEqual(cvn6CallbackCounts, {
    commandDecode: 0,
    commandPrepare: 0,
    validate: 0,
    classify: 0,
    effectDecode: 0,
    effectTransform: 0,
  });
});
