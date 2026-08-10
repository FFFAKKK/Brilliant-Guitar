import { test } from "node:test";
import assert = require("node:assert/strict");

import {
  OFFICIAL_MODULE_SDK_V1_LIMITS,
  compileOfficialModuleCatalogV1,
  defineDomainCommandV1,
  defineModuleEffectV1,
  type CompiledDomainCommandDefinitionV1,
  type CompiledModuleEffectDefinitionV1,
  type OfficialModuleDefinitionResultV1,
} from "../../src/core-kernel/module-sdk/index";
import {
  SYNTHETIC_OFFICIAL_MODULE_MANIFEST,
  resetSyntheticOfficialModuleCallbackCounts,
  syntheticOfficialModuleCallbackCounts,
} from "./fixtures/synthetic-official-modules";

const DOMAIN_ENTRY_ID = "kernel.domain-commands.v1";

function decodeCommand(): { readonly status: "invalid" } {
  return { status: "invalid" };
}

function prepareCommand(): { readonly status: "no-op" } {
  return { status: "no-op" };
}

function decodeEffect(): { readonly status: "invalid" } {
  return { status: "invalid" };
}

function transformEffect(): { readonly status: "remove" } {
  return { status: "remove" };
}

function validateContribution(): readonly never[] {
  return [];
}

function classifyContribution(): {
  readonly status: "supported";
  readonly issues: readonly never[];
} {
  return { status: "supported", issues: [] };
}

function unwrap<T>(result: OfficialModuleDefinitionResultV1<T>): T {
  assert.equal(result.status, "defined");
  if (result.status !== "defined") {
    throw new Error("fixture definition failed");
  }
  return result.value;
}

function coreModules(): Record<string, unknown>[] {
  return SYNTHETIC_OFFICIAL_MODULE_MANIFEST.modules
    .filter((module) => module.moduleId.startsWith("core."))
    .map((module) => ({
      ...module,
      capabilities: [...module.capabilities],
      registrationEntryIds: [...module.registrationEntryIds],
    }));
}

function domainModule(moduleId: string): Record<string, unknown> {
  return {
    moduleId,
    origin: "official",
    runtime: "internal-module",
    trustLevel: "system-trusted",
    apiVersion: 1,
    capabilities: [
      "command:register",
      "command:execute",
      "score:read",
      "event:subscribe",
    ],
    registrationEntryIds: [DOMAIN_ENTRY_ID],
  };
}

function contribution(
  contributionId: string,
  namespaces: readonly string[],
  commands: readonly CompiledDomainCommandDefinitionV1[] = [],
  effects: readonly CompiledModuleEffectDefinitionV1[] = [],
  versions: readonly number[] = [1],
): Record<string, unknown> {
  return {
    apiVersion: 1,
    moduleId: "fixture.bulk.module",
    contributionId,
    extensionNamespaces: namespaces,
    extensionRequirements: namespaces.map((namespace) => ({
      requirementVersion: 1,
      namespace,
      moduleId: "fixture.bulk.module",
      contributionId,
      supportedSchemaVersions: [...versions],
      requiredForWrite: true,
    })),
    commands,
    validate: validateContribution,
    classify: classifyContribution,
    effects,
  };
}

function bulkContributions(count: number): Record<string, unknown>[] {
  return Array.from({ length: count }, (_, index) =>
    contribution(
      `fixture.bulk.contribution.${index.toString().padStart(3, "0")}`,
      [`fixture.bulk.namespace.${index.toString().padStart(3, "0")}`],
    ));
}

function compileBulk(
  contributions: readonly Record<string, unknown>[],
) {
  return compileOfficialModuleCatalogV1(
    {
      startupManifestVersion: 1,
      modules: [...coreModules(), domainModule("fixture.bulk.module")],
    },
    [
      {
        registrationEntryId: DOMAIN_ENTRY_ID,
        ownerModuleId: "fixture.bulk.module",
        kind: "domain-command",
        contributions,
      },
    ],
  );
}

function assertInvalidContribution(result: ReturnType<typeof compileBulk>): void {
  assert.deepEqual(result, {
    ok: false,
    failure: {
      code: "registry.invalid-contribution",
      registrationEntryId: DOMAIN_ENTRY_ID,
    },
  });
}

function assertZeroCallbacks(): void {
  assert.deepEqual(syntheticOfficialModuleCallbackCounts, {
    commandDecode: 0,
    commandPrepare: 0,
    validate: 0,
    classify: 0,
    effectDecode: 0,
    effectTransform: 0,
  });
}

test("manifest module limit accepts 64 and rejects 65", () => {
  resetSyntheticOfficialModuleCallbackCounts();
  function compileModuleCount(count: number) {
    const domainCount = count - 2;
    const modules = coreModules();
    const entries: Record<string, unknown>[] = [];
    for (let index = 0; index < domainCount; index += 1) {
      const moduleId = `fixture.limit.module.${index.toString().padStart(2, "0")}`;
      modules.push(domainModule(moduleId));
      entries.push({
        registrationEntryId: DOMAIN_ENTRY_ID,
        ownerModuleId: moduleId,
        kind: "domain-command",
        contributions: [],
      });
    }
    return compileOfficialModuleCatalogV1(
      { startupManifestVersion: 1, modules },
      entries,
    );
  }

  assert.equal(compileModuleCount(64).ok, true);
  assert.deepEqual(compileModuleCount(65), {
    ok: false,
    failure: { code: "registry.invalid-startup-input" },
  });
  assertZeroCallbacks();
});

test("domain contribution limit accepts 256 and rejects 257", () => {
  resetSyntheticOfficialModuleCallbackCounts();
  assert.equal(compileBulk(bulkContributions(256)).ok, true);
  assert.deepEqual(compileBulk(bulkContributions(257)), {
    ok: false,
    failure: { code: "registry.invalid-startup-input" },
  });
  assertZeroCallbacks();
});

test("contribution limit ignores synchronous Set size getter replacement", () => {
  resetSyntheticOfficialModuleCallbackCounts();
  const setSizeDescriptor = Object.getOwnPropertyDescriptor(
    Set.prototype,
    "size",
  );
  assert.notEqual(setSizeDescriptor, undefined);
  if (setSizeDescriptor === undefined) {
    return;
  }
  const entryTarget = {
    registrationEntryId: DOMAIN_ENTRY_ID,
    ownerModuleId: "fixture.bulk.module",
    kind: "domain-command",
    contributions: bulkContributions(257),
  };
  const entry = new Proxy(entryTarget, {
    ownKeys(value) {
      Object.defineProperty(Set.prototype, "size", {
        configurable: setSizeDescriptor.configurable === true,
        enumerable: setSizeDescriptor.enumerable === true,
        get: () => 0,
      });
      return Reflect.ownKeys(value);
    },
  });

  let result: ReturnType<typeof compileOfficialModuleCatalogV1>;
  try {
    result = compileOfficialModuleCatalogV1(
      {
        startupManifestVersion: 1,
        modules: [...coreModules(), domainModule("fixture.bulk.module")],
      },
      [entry],
    );
  } finally {
    Object.defineProperty(Set.prototype, "size", setSizeDescriptor);
  }
  assert.deepEqual(result, {
    ok: false,
    failure: { code: "registry.invalid-startup-input" },
  });
  assertZeroCallbacks();
});

test("command limit accepts 4096 and rejects 4097", () => {
  resetSyntheticOfficialModuleCallbackCounts();
  const commands: CompiledDomainCommandDefinitionV1[] = [];
  for (let index = 0; index <= 4096; index += 1) {
    const suffix = index.toString().padStart(4, "0");
    commands.push(unwrap(defineDomainCommandV1({
      descriptor: {
        descriptorVersion: 1,
        commandId: `fixture.bulk.command.${suffix}`,
        commandVersion: 1,
        source: {
          moduleId: "fixture.bulk.module",
          contributionId: "fixture.bulk.commands",
        },
        targetKind: "document",
        requiredCapabilities: ["command:execute", "score:read"],
        titleKey: `fixture.bulk.command.${suffix}.title`,
      },
      decode: decodeCommand,
      prepare: prepareCommand,
    })));
  }

  assert.equal(
    compileBulk([
      contribution(
        "fixture.bulk.commands",
        ["fixture.bulk"],
        commands.slice(0, 4096),
      ),
    ]).ok,
    true,
  );
  assertInvalidContribution(
    compileBulk([
      contribution("fixture.bulk.commands", ["fixture.bulk"], commands),
    ]),
  );
  assertZeroCallbacks();
});

test("effect limit accepts 4096 and rejects 4097", () => {
  resetSyntheticOfficialModuleCallbackCounts();
  const effects: CompiledModuleEffectDefinitionV1[] = [];
  for (let index = 0; index <= 4096; index += 1) {
    const suffix = index.toString().padStart(4, "0");
    effects.push(unwrap(defineModuleEffectV1({
      descriptor: {
        descriptorVersion: 1,
        effectKind: `fixture.bulk.effect.${suffix}`,
        source: {
          moduleId: "fixture.bulk.module",
          contributionId: "fixture.bulk.effects",
        },
        namespace: "fixture.bulk",
        ownerKinds: ["score"],
        supportedSchemaVersions: [1],
      },
      decode: decodeEffect,
      transform: transformEffect,
    })));
  }

  assert.equal(
    compileBulk([
      contribution(
        "fixture.bulk.effects",
        ["fixture.bulk"],
        [],
        effects.slice(0, 4096),
      ),
    ]).ok,
    true,
  );
  assertInvalidContribution(
    compileBulk([
      contribution("fixture.bulk.effects", ["fixture.bulk"], [], effects),
    ]),
  );
  assertZeroCallbacks();
});

test("namespace limit accepts 1024 and rejects 1025", () => {
  resetSyntheticOfficialModuleCallbackCounts();
  const namespaces = Array.from(
    { length: 1025 },
    (_, index) => `fixture.bulk.namespace.${index.toString().padStart(4, "0")}`,
  );
  assert.equal(
    compileBulk([
      contribution("fixture.bulk.namespaces", namespaces.slice(0, 1024)),
    ]).ok,
    true,
  );
  assertInvalidContribution(
    compileBulk([contribution("fixture.bulk.namespaces", namespaces)]),
  );
  assertZeroCallbacks();
});

test("requirement version limit accepts 256 and rejects 257", () => {
  resetSyntheticOfficialModuleCallbackCounts();
  const versions = Array.from({ length: 257 }, (_, index) => index + 1);
  assert.equal(
    compileBulk([
      contribution(
        "fixture.bulk.versions",
        ["fixture.bulk"],
        [],
        [],
        versions.slice(0, 256),
      ),
    ]).ok,
    true,
  );
  assertInvalidContribution(
    compileBulk([
      contribution(
        "fixture.bulk.versions",
        ["fixture.bulk"],
        [],
        [],
        versions,
      ),
    ]),
  );
  assertZeroCallbacks();
});

test("CVN-6-owned issue and fact limits remain exact constants only", () => {
  assert.equal(OFFICIAL_MODULE_SDK_V1_LIMITS.moduleIssuesPerCallback, 1024);
  assert.equal(OFFICIAL_MODULE_SDK_V1_LIMITS.moduleIssuesPerTransaction, 4096);
  assert.equal(OFFICIAL_MODULE_SDK_V1_LIMITS.compatibilityFacts, 131072);
  assertZeroCallbacks();
});
