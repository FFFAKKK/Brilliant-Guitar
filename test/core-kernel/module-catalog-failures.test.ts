import { test } from "node:test";
import assert = require("node:assert/strict");

import { compileOfficialModuleCatalogV1 } from "../../src/core-kernel/module-sdk/index";
import {
  SYNTHETIC_OFFICIAL_MODULE_MANIFEST,
  SYNTHETIC_OFFICIAL_MODULE_REGISTRATION_ENTRIES,
  SYNTHETIC_PART_CONTRIBUTION,
  SYNTHETIC_PART_REGISTRATION_ENTRY,
  SYNTHETIC_SCORE_COMMAND,
  SYNTHETIC_SCORE_CONTRIBUTION,
  SYNTHETIC_SCORE_EFFECT,
  SYNTHETIC_SCORE_REGISTRATION_ENTRY,
  resetSyntheticOfficialModuleCallbackCounts,
  syntheticOfficialModuleCallbackCounts,
} from "./fixtures/synthetic-official-modules";

function mutableManifest(): {
  startupManifestVersion: number;
  modules: Record<string, unknown>[];
} {
  return {
    startupManifestVersion: 1,
    modules: SYNTHETIC_OFFICIAL_MODULE_MANIFEST.modules.map((module) => ({
      ...module,
      capabilities: [...module.capabilities],
      registrationEntryIds: [...module.registrationEntryIds],
    })),
  };
}

function assertFailure(
  manifest: unknown,
  entries: unknown,
  expected: unknown,
  message?: string,
): void {
  resetSyntheticOfficialModuleCallbackCounts();
  assert.deepEqual(compileOfficialModuleCatalogV1(manifest, entries), {
    ok: false,
    failure: expected,
  }, message);
  assert.deepEqual(syntheticOfficialModuleCallbackCounts, {
    commandDecode: 0,
    commandPrepare: 0,
    validate: 0,
    classify: 0,
    effectDecode: 0,
    effectTransform: 0,
  }, message);
}

test("catalog compiler returns stable root, binding, and identity failures", () => {
  assertFailure(null, [], { code: "registry.invalid-startup-input" });
  assertFailure(SYNTHETIC_OFFICIAL_MODULE_MANIFEST, [], {
    code: "registry.registration-entry-not-found",
    registrationEntryId: "kernel.domain-commands.v1",
  });

  assertFailure(
    SYNTHETIC_OFFICIAL_MODULE_MANIFEST,
    [
      {
        ...SYNTHETIC_SCORE_REGISTRATION_ENTRY,
        ownerModuleId: "fixture.wrong.module",
      },
      SYNTHETIC_OFFICIAL_MODULE_REGISTRATION_ENTRIES[1],
    ],
    {
      code: "registry.registration-owner-mismatch",
      registrationEntryId: "kernel.domain-commands.v1",
      moduleId: "fixture.score.module",
    },
  );

  const unsupportedRuntime = mutableManifest();
  const scoreModule = unsupportedRuntime.modules.find(
    (module) => module.moduleId === "fixture.score.module",
  );
  if (scoreModule !== undefined) {
    scoreModule.runtime = "javascript-typescript";
  }
  assertFailure(unsupportedRuntime, SYNTHETIC_OFFICIAL_MODULE_REGISTRATION_ENTRIES, {
    code: "registry.unsupported-runtime",
    moduleId: "fixture.score.module",
  });

  const missingCapability = mutableManifest();
  const partModule = missingCapability.modules.find(
    (module) => module.moduleId === "fixture.part.module",
  );
  if (partModule !== undefined) {
    partModule.capabilities = ["command:register"];
  }
  assertFailure(missingCapability, SYNTHETIC_OFFICIAL_MODULE_REGISTRATION_ENTRIES, {
    code: "registry.capability-denied",
    moduleId: "fixture.part.module",
    capability: "command:execute",
  });
});

test("catalog compiler rejects duplicate identities and nested contract drift", () => {
  const duplicateModule = mutableManifest();
  const scoreModule = duplicateModule.modules.find(
    (module) => module.moduleId === "fixture.score.module",
  );
  if (scoreModule !== undefined) {
    duplicateModule.modules.push({ ...scoreModule });
  }
  assertFailure(duplicateModule, SYNTHETIC_OFFICIAL_MODULE_REGISTRATION_ENTRIES, {
    code: "registry.duplicate-module-id",
    moduleId: "fixture.score.module",
  });

  assertFailure(
    SYNTHETIC_OFFICIAL_MODULE_MANIFEST,
    [
      {
        ...SYNTHETIC_SCORE_REGISTRATION_ENTRY,
        contributions: [
          SYNTHETIC_SCORE_CONTRIBUTION,
          SYNTHETIC_SCORE_CONTRIBUTION,
        ],
      },
      SYNTHETIC_OFFICIAL_MODULE_REGISTRATION_ENTRIES[1],
    ],
    {
      code: "registry.duplicate-contribution-id",
      contributionId: "fixture.score.contribution.v1",
    },
  );

  const badRequirement = {
    ...SYNTHETIC_SCORE_CONTRIBUTION,
    extensionRequirements: [
      {
        ...SYNTHETIC_SCORE_CONTRIBUTION.extensionRequirements[0],
        supportedSchemaVersions: [2],
      },
    ],
  };
  assertFailure(
    SYNTHETIC_OFFICIAL_MODULE_MANIFEST,
    [
      { ...SYNTHETIC_SCORE_REGISTRATION_ENTRY, contributions: [badRequirement] },
      SYNTHETIC_OFFICIAL_MODULE_REGISTRATION_ENTRIES[1],
    ],
    {
      code: "registry.invalid-contribution",
      registrationEntryId: "kernel.domain-commands.v1",
    },
  );
});

test("readable fake handles map to handler mismatch and unreadable fakes to invalid contribution", () => {
  const fake = { descriptor: SYNTHETIC_SCORE_COMMAND.descriptor };
  const copiedBrand = Reflect.ownKeys(SYNTHETIC_SCORE_COMMAND).find(
    (key): key is symbol => typeof key === "symbol",
  );
  if (copiedBrand !== undefined) {
    Object.defineProperty(fake, copiedBrand, {
      enumerable: false,
      value: true,
    });
  }
  const fakeContribution = {
    ...SYNTHETIC_SCORE_CONTRIBUTION,
    commands: [fake],
  };
  assertFailure(
    SYNTHETIC_OFFICIAL_MODULE_MANIFEST,
    [
      { ...SYNTHETIC_SCORE_REGISTRATION_ENTRY, contributions: [fakeContribution] },
      SYNTHETIC_OFFICIAL_MODULE_REGISTRATION_ENTRIES[1],
    ],
    {
      code: "registry.handler-mismatch",
      contributionId: "fixture.score.contribution.v1",
    },
  );

  const unreadable = new Proxy(fake, {
    ownKeys() {
      throw new Error("PRIVATE_FAKE_HANDLE_FAILURE");
    },
  });
  assertFailure(
    SYNTHETIC_OFFICIAL_MODULE_MANIFEST,
    [
      {
        ...SYNTHETIC_SCORE_REGISTRATION_ENTRY,
        contributions: [
          { ...SYNTHETIC_SCORE_CONTRIBUTION, commands: [unreadable] },
        ],
      },
      SYNTHETIC_OFFICIAL_MODULE_REGISTRATION_ENTRIES[1],
    ],
    {
      code: "registry.invalid-contribution",
      registrationEntryId: "kernel.domain-commands.v1",
    },
  );
});

test("catalog validation preserves command, requirement, and effect stage precedence", () => {
  const fakeCommand = { descriptor: SYNTHETIC_SCORE_COMMAND.descriptor };
  const fakeEffect = { descriptor: SYNTHETIC_SCORE_EFFECT.descriptor };
  const wrongSourceRequirement = {
    ...SYNTHETIC_SCORE_CONTRIBUTION.extensionRequirements[0],
    moduleId: "fixture.wrong.module",
  };
  const cases = [
    {
      name: "command authenticity precedes requirement source identity",
      contribution: {
        ...SYNTHETIC_SCORE_CONTRIBUTION,
        commands: [fakeCommand],
        extensionRequirements: [wrongSourceRequirement],
      },
      expected: {
        code: "registry.handler-mismatch",
        contributionId: "fixture.score.contribution.v1",
      },
    },
    {
      name: "command authenticity precedes requirement coverage",
      contribution: {
        ...SYNTHETIC_SCORE_CONTRIBUTION,
        commands: [fakeCommand],
        extensionRequirements: [],
      },
      expected: {
        code: "registry.handler-mismatch",
        contributionId: "fixture.score.contribution.v1",
      },
    },
    {
      name: "requirement identity precedes effect authenticity",
      contribution: {
        ...SYNTHETIC_SCORE_CONTRIBUTION,
        extensionRequirements: [wrongSourceRequirement],
        effects: [fakeEffect],
      },
      expected: {
        code: "registry.invalid-contribution",
        registrationEntryId: "kernel.domain-commands.v1",
      },
    },
  ] as const;

  for (let index = 0; index < cases.length; index += 1) {
    const testCase = cases[index];
    assert.notEqual(testCase, undefined);
    if (testCase === undefined) {
      continue;
    }
    assertFailure(
      SYNTHETIC_OFFICIAL_MODULE_MANIFEST,
      [
        {
          ...SYNTHETIC_SCORE_REGISTRATION_ENTRY,
          contributions: [testCase.contribution],
        },
        SYNTHETIC_OFFICIAL_MODULE_REGISTRATION_ENTRIES[1],
      ],
      testCase.expected,
      testCase.name,
    );
  }
});

test("catalog validation runs stages globally across modules and contributions", () => {
  const unsupportedPartManifest = mutableManifest();
  const partModule = unsupportedPartManifest.modules.find(
    (module) => module.moduleId === "fixture.part.module",
  );
  if (partModule !== undefined) {
    partModule.origin = "third-party";
  }

  const sharedContributionId = "fixture.shared.contribution.v1";
  const partDuplicate = {
    ...SYNTHETIC_PART_CONTRIBUTION,
    contributionId: sharedContributionId,
    extensionRequirements: SYNTHETIC_PART_CONTRIBUTION.extensionRequirements.map(
      (requirement) => ({
        ...requirement,
        contributionId: sharedContributionId,
      }),
    ),
    commands: [],
    effects: [],
  };
  const fakeScoreCommand = {
    descriptor: {
      ...SYNTHETIC_SCORE_COMMAND.descriptor,
      source: {
        ...SYNTHETIC_SCORE_COMMAND.descriptor.source,
        contributionId: sharedContributionId,
      },
    },
  };
  const scoreDuplicateWithFakeCommand = {
    ...SYNTHETIC_SCORE_CONTRIBUTION,
    contributionId: sharedContributionId,
    extensionRequirements: SYNTHETIC_SCORE_CONTRIBUTION.extensionRequirements.map(
      (requirement) => ({
        ...requirement,
        contributionId: sharedContributionId,
      }),
    ),
    commands: [fakeScoreCommand],
    effects: [],
  };
  const malformedScoreContribution = {
    ...SYNTHETIC_SCORE_CONTRIBUTION,
    unexpected: true,
  };
  const invalidDomainRegistrationManifest = mutableManifest();
  const scoreModuleWithInvalidRegistration =
    invalidDomainRegistrationManifest.modules.find(
      (module) => module.moduleId === "fixture.score.module",
    );
  if (scoreModuleWithInvalidRegistration !== undefined) {
    scoreModuleWithInvalidRegistration.registrationEntryIds = [
      "core.commands.v1",
    ];
  }
  const invalidCoreDeclarationManifest = mutableManifest();
  const coreCommandModule = invalidCoreDeclarationManifest.modules.find(
    (module) => module.moduleId === "core.commands",
  );
  if (coreCommandModule !== undefined) {
    coreCommandModule.capabilities = ["selector:register"];
  }
  const malformedNestedScoreContribution = {
    ...SYNTHETIC_SCORE_CONTRIBUTION,
    commands: [
      {
        descriptor: {
          ...SYNTHETIC_SCORE_COMMAND.descriptor,
          unexpected: true,
        },
      },
    ],
  };
  const cases = [
    {
      name: "stage 2 missing entry precedes stage 3 unsupported origin",
      manifest: unsupportedPartManifest,
      entries: [SYNTHETIC_PART_REGISTRATION_ENTRY],
      expected: {
        code: "registry.registration-entry-not-found",
        registrationEntryId: "kernel.domain-commands.v1",
      },
    },
    {
      name: "stage 4 duplicate contribution precedes stage 5 fake command",
      manifest: SYNTHETIC_OFFICIAL_MODULE_MANIFEST,
      entries: [
        {
          ...SYNTHETIC_PART_REGISTRATION_ENTRY,
          contributions: [partDuplicate],
        },
        {
          ...SYNTHETIC_SCORE_REGISTRATION_ENTRY,
          contributions: [scoreDuplicateWithFakeCommand],
        },
      ],
      expected: {
        code: "registry.duplicate-contribution-id",
        contributionId: sharedContributionId,
      },
    },
    {
      name: "stage 1 malformed contribution precedes stage 3 unsupported origin",
      manifest: unsupportedPartManifest,
      entries: [
        SYNTHETIC_PART_REGISTRATION_ENTRY,
        {
          ...SYNTHETIC_SCORE_REGISTRATION_ENTRY,
          contributions: [malformedScoreContribution],
        },
      ],
      expected: {
        code: "registry.invalid-contribution",
        registrationEntryId: "kernel.domain-commands.v1",
      },
    },
    {
      name: "stage 1 malformed contribution precedes stage 2 domain registration identity",
      manifest: invalidDomainRegistrationManifest,
      entries: [
        SYNTHETIC_PART_REGISTRATION_ENTRY,
        {
          ...SYNTHETIC_SCORE_REGISTRATION_ENTRY,
          contributions: [malformedScoreContribution],
        },
      ],
      expected: {
        code: "registry.invalid-contribution",
        registrationEntryId: "kernel.domain-commands.v1",
      },
    },
    {
      name: "stage 1 malformed contribution precedes stage 2 Core declaration parity",
      manifest: invalidCoreDeclarationManifest,
      entries: [
        SYNTHETIC_PART_REGISTRATION_ENTRY,
        {
          ...SYNTHETIC_SCORE_REGISTRATION_ENTRY,
          contributions: [malformedScoreContribution],
        },
      ],
      expected: {
        code: "registry.invalid-contribution",
        registrationEntryId: "kernel.domain-commands.v1",
      },
    },
    {
      name: "stage 1 malformed nested descriptor precedes stage 2 owner mismatch",
      manifest: SYNTHETIC_OFFICIAL_MODULE_MANIFEST,
      entries: [
        SYNTHETIC_PART_REGISTRATION_ENTRY,
        {
          ...SYNTHETIC_SCORE_REGISTRATION_ENTRY,
          ownerModuleId: "fixture.wrong.module",
          contributions: [malformedNestedScoreContribution],
        },
      ],
      expected: {
        code: "registry.invalid-contribution",
        registrationEntryId: "kernel.domain-commands.v1",
      },
    },
  ] as const;

  for (let index = 0; index < cases.length; index += 1) {
    const testCase = cases[index];
    assert.notEqual(testCase, undefined);
    if (testCase === undefined) {
      continue;
    }
    assertFailure(
      testCase.manifest,
      testCase.entries,
      testCase.expected,
      testCase.name,
    );
  }
});

test("catalog failure results are recursively data-only and private", () => {
  const privateInput = new Proxy(
    { startupManifestVersion: 1, modules: [] },
    {
      ownKeys() {
        throw new Error("PRIVATE_CATALOG_INPUT_PATH");
      },
    },
  );
  const result = compileOfficialModuleCatalogV1(privateInput, []);
  assert.deepEqual(result, {
    ok: false,
    failure: { code: "registry.invalid-startup-input" },
  });

  const visited = new Set<object>();
  function inspect(value: unknown): void {
    if (value === null || typeof value !== "object" || visited.has(value)) {
      return;
    }
    visited.add(value);
    assert.equal(value instanceof Error, false);
    assert.notEqual(value, privateInput);
    for (const key of Reflect.ownKeys(value)) {
      assert.notEqual(key, "stack");
      assert.notEqual(key, "path");
      const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
      if (descriptor !== undefined && "value" in descriptor) {
        assert.notEqual(typeof descriptor.value, "function");
        inspect(descriptor.value);
      }
    }
  }
  inspect(result);
  assert.equal(
    JSON.stringify(result).includes("PRIVATE_CATALOG_INPUT_PATH"),
    false,
  );
});

test("catalog rejects duplicate namespaces despite synchronous collection-method replacement", () => {
  const arraySort = Array.prototype.sort;
  const arraySome = Array.prototype.some;
  const setAdd = Set.prototype.add;
  const setHas = Set.prototype.has;
  const duplicateContributionTarget = {
    ...SYNTHETIC_SCORE_CONTRIBUTION,
    extensionNamespaces: ["fixture.score", "fixture.score"],
    extensionRequirements: [
      SYNTHETIC_SCORE_CONTRIBUTION.extensionRequirements[0],
      SYNTHETIC_SCORE_CONTRIBUTION.extensionRequirements[0],
    ],
  };
  const duplicateContribution = new Proxy(duplicateContributionTarget, {
    ownKeys(value) {
      Array.prototype.sort = function fakeSort<T>(this: T[]): T[] {
        return this;
      };
      Array.prototype.some = () => false;
      Set.prototype.add = function fakeAdd<T>(this: Set<T>): Set<T> {
        return this;
      };
      Set.prototype.has = () => false;
      return Reflect.ownKeys(value);
    },
  });

  let result: ReturnType<typeof compileOfficialModuleCatalogV1> = {
    ok: false,
    failure: { code: "registry.internal-error" },
  };
  resetSyntheticOfficialModuleCallbackCounts();
  try {
    result = compileOfficialModuleCatalogV1(
      SYNTHETIC_OFFICIAL_MODULE_MANIFEST,
      [
        {
          ...SYNTHETIC_SCORE_REGISTRATION_ENTRY,
          contributions: [duplicateContribution],
        },
        SYNTHETIC_OFFICIAL_MODULE_REGISTRATION_ENTRIES[1],
      ],
    );
  } finally {
    Array.prototype.sort = arraySort;
    Array.prototype.some = arraySome;
    Set.prototype.add = setAdd;
    Set.prototype.has = setHas;
  }
  assert.deepEqual(result, {
    ok: false,
    failure: {
      code: "registry.invalid-contribution",
      registrationEntryId: "kernel.domain-commands.v1",
    },
  });
  assert.deepEqual(syntheticOfficialModuleCallbackCounts, {
    commandDecode: 0,
    commandPrepare: 0,
    validate: 0,
    classify: 0,
    effectDecode: 0,
    effectTransform: 0,
  });
});
