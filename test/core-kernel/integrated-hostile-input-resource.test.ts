import { test } from "node:test";
import assert = require("node:assert/strict");

import { CommandBus, type ScoreDocument } from "../../src/core-kernel/index";
import {
  compileOfficialModuleCatalogV1,
  createModuleKernelIssueV1,
  defineDomainCommandContributionV1,
  defineDomainCommandRegistrationEntryV1,
  type CompiledDomainCommandContributionV1,
  type ModuleKernelIssue,
  type OfficialModuleDefinitionResultV1,
} from "../../src/core-kernel/module-sdk/index";
import {
  computeKernelDomainAvailability,
  resolveKernelIntegratedRuntimeAssembly,
} from "../../src/core-kernel/registry/domain-availability";
import { decodeIntegratedAffectedAddresses } from "../../src/core-kernel/commands/integrated-runtime";
import { createCoreScoreFixture } from "./fixtures/core-score";
import {
  CVN6_MANIFEST,
  CVN6_PART_CONTRIBUTION,
  CVN6_REGISTRATION_ENTRIES,
  CVN6_SCORE_CONTRIBUTION,
  cvn6CallbackBehavior,
  cvn6CallbackCounts,
  resetCvn6Callbacks,
} from "./fixtures/cvn-6-synthetic-official-modules";

function unwrap<T>(result: OfficialModuleDefinitionResultV1<T>): T {
  assert.equal(result.status, "defined");
  if (result.status !== "defined") throw new Error("definition");
  return result.value;
}

function aggregateIssueContribution(
  index: number,
  issueCount: () => number,
): CompiledDomainCommandContributionV1 {
  const moduleId = "fixture.aggregate.module";
  const contributionId = `fixture.aggregate.contribution-${index}.v1`;
  const namespace = `fixture.aggregate-${index}`;
  const created = createModuleKernelIssueV1({
    code: "fixture.aggregate.module.semantic-invalid",
    source: { kind: "module", moduleId, contributionId },
  });
  assert.equal(created.status, "created");
  if (created.status !== "created") throw new Error("issue");
  const issue: ModuleKernelIssue = created.issue;
  return unwrap(defineDomainCommandContributionV1({
    apiVersion: 1,
    moduleId,
    contributionId,
    extensionNamespaces: [namespace],
    extensionRequirements: [{
      requirementVersion: 1,
      namespace,
      moduleId,
      contributionId,
      supportedSchemaVersions: [1],
      requiredForWrite: true,
    }],
    commands: [],
    validate: () => Array.from({ length: issueCount() }, () => issue),
    classify: () => ({ status: "supported", issues: [] }),
    effects: [],
  }));
}

function aggregateFixture(lastIssueCount: () => number) {
  const contributions = Array.from({ length: 5 }, (_, index) =>
    aggregateIssueContribution(index, () => index === 4 ? lastIssueCount() : 1_024));
  const entry = unwrap(defineDomainCommandRegistrationEntryV1({
    registrationEntryId: "kernel.domain-commands.v1",
    ownerModuleId: "fixture.aggregate.module",
    kind: "domain-command",
    contributions,
  }));
  const manifest = {
    startupManifestVersion: 1,
    modules: [
      ...CVN6_MANIFEST.modules.slice(0, 2),
      {
        moduleId: "fixture.aggregate.module",
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
        registrationEntryIds: ["kernel.domain-commands.v1"],
      },
    ],
  };
  const compiled = compileOfficialModuleCatalogV1(manifest, [entry]);
  assert.equal(
    compiled.ok,
    true,
    compiled.ok ? undefined : JSON.stringify(compiled.failure),
  );
  if (!compiled.ok) throw new Error("aggregate catalog");
  const document: ScoreDocument = {
    ...createCoreScoreFixture(),
    extensions: contributions.map((contribution, index) => ({
      namespace: contribution.extensionNamespaces[0]!,
      schemaVersion: 1,
      owner: { kind: "score" },
      payload: { index },
    })),
  };
  return { catalog: compiled.catalog, document };
}

function setup() {
  const compiled = compileOfficialModuleCatalogV1(CVN6_MANIFEST, CVN6_REGISTRATION_ENTRIES);
  assert.equal(compiled.ok, true);
  if (!compiled.ok) throw new Error("catalog");
  const created = CommandBus.createIntegrated(createCoreScoreFixture(), compiled.catalog);
  assert.equal(created.ok, true);
  if (!created.ok) throw new Error("bus");
  return created.value;
}

function command() {
  return {
    commandVersion: 1,
    commandId: "fixture.score.apply",
    target: { kind: "document", documentId: "score-1" },
    payload: {
      noteId: "note-1",
      pitch: { step: "D", alter: 0, octave: 4 },
      schemaVersion: 1,
      marker: "resource",
    },
  };
}

test("descriptor-first module command capture contains synchronous structuredClone replacement", () => {
  const bus = setup();
  const original = globalThis.structuredClone;
  const proxied = new Proxy(command(), {
    ownKeys(target) {
      globalThis.structuredClone = ((value: unknown) => value) as typeof structuredClone;
      return Reflect.ownKeys(target);
    },
  });
  try {
    const result = bus.submit(proxied);
    assert.equal(result.status, "committed");
    const read = bus.read();
    assert.equal(read.ok, true);
    if (read.ok) {
      assert.notStrictEqual(read.value.snapshot.document, proxied);
      assert.equal(read.value.snapshot.document.extensions[0]?.payload.marker, "resource");
    }
  } finally {
    globalThis.structuredClone = original;
  }
});

test("accessors, extra fields, sparse payloads, cycles, and throwing proxies reject without state drift", () => {
  const inputs: unknown[] = [];
  const extra = command() as Record<string, unknown>;
  extra.extra = true;
  inputs.push(extra);
  const accessor = command();
  Object.defineProperty(accessor, "payload", {
    enumerable: true,
    get() {
      throw new Error("must not execute");
    },
  });
  inputs.push(accessor);
  const cyclic = command();
  (cyclic.payload as Record<string, unknown>).cycle = cyclic;
  inputs.push(cyclic);
  const sparse = command();
  const sparseValue: unknown[] = [];
  sparseValue.length = 2;
  sparseValue[1] = true;
  (sparse.payload as Record<string, unknown>).sparse = sparseValue;
  inputs.push(sparse);
  inputs.push(new Proxy(command(), {
    ownKeys() {
      throw new Error("fixture proxy");
    },
  }));

  for (const input of inputs) {
    const bus = setup();
    const before = bus.read();
    const result = bus.submit(input);
    assert.equal(result.status, "rejected");
    assert.deepEqual(bus.read(), before);
  }
});

test("effect and affected-address boundary plus one return exact resource failures", () => {
  const effectAtLimitBus = setup();
  resetCvn6Callbacks();
  cvn6CallbackBehavior.effectRequestCount = 131_072;
  cvn6CallbackBehavior.coreOnlyEffectRequests = true;
  const effectAtLimit = effectAtLimitBus.submit(command());
  assert.equal(effectAtLimit.status, "committed");
  assert.equal(cvn6CallbackCounts.effectDecode, 0);
  assert.equal(cvn6CallbackCounts.effectTransform, 0);

  const effectBus = setup();
  resetCvn6Callbacks();
  cvn6CallbackBehavior.effectRequestCount = 131_073;
  const effectResult = effectBus.submit(command());
  assert.equal(effectResult.status, "rejected");
  if (effectResult.status === "rejected") {
    assert.deepEqual(effectResult.failure, {
      code: "command.resource-limit-exceeded",
      limitKind: "effects",
      limit: 131_072,
      actual: 131_073,
    });
  }
  assert.equal(cvn6CallbackCounts.effectDecode, 0);
  assert.equal(cvn6CallbackCounts.effectTransform, 0);

  const duplicateAffected = decodeIntegratedAffectedAddresses([
    { kind: "note", noteId: "note-1" },
    { kind: "document", documentId: "score-1" },
    { kind: "note", noteId: "note-1" },
  ]);
  assert.equal(duplicateAffected.ok, true);
  if (duplicateAffected.ok) {
    assert.deepEqual(duplicateAffected.value, [
      { kind: "document", documentId: "score-1" },
      { kind: "note", noteId: "note-1" },
    ]);
  }

  const duplicateBus = setup();
  const committedEvents: Array<{ readonly affectedEntities?: readonly unknown[] }> = [];
  duplicateBus.subscribe((event: { readonly affectedEntities?: readonly unknown[] }) => {
    if (event.affectedEntities !== undefined) committedEvents.push(event);
  });
  resetCvn6Callbacks();
  cvn6CallbackBehavior.affectedAddressCount = 3;
  assert.equal(duplicateBus.submit(command()).status, "committed");
  assert.deepEqual(committedEvents[0]?.affectedEntities, [
    { kind: "document", documentId: "score-1" },
    { kind: "note", noteId: "note-1" },
  ]);

  const affectedAtLimit = decodeIntegratedAffectedAddresses(
    Array.from({ length: 131_072 }, (_, index) => ({
      kind: "part" as const,
      partId: `part-${index}`,
    })),
  );
  assert.equal(affectedAtLimit.ok, true);
  if (affectedAtLimit.ok) {
    assert.equal(affectedAtLimit.value.length, 131_072);
  }

  const affectedOverLimit = decodeIntegratedAffectedAddresses(
    Array.from({ length: 131_073 }, (_, index) => ({
      kind: "part" as const,
      partId: `part-${index}`,
    })),
  );
  assert.deepEqual(affectedOverLimit, {
    ok: false,
    reason: "resource",
    limit: 131_072,
    actual: 131_073,
  });
});

test("the 1,025th issue from one callback is a contribution contract violation", () => {
  const atLimitBus = setup();
  resetCvn6Callbacks();
  cvn6CallbackBehavior.validatorIssueCount = 1_024;
  const atLimit = atLimitBus.submit(command());
  assert.equal(atLimit.status, "rejected");
  if (atLimit.status === "rejected") {
    assert.equal(atLimit.failure.code, "command.contribution-semantic-invalid");
    if (atLimit.failure.code === "command.contribution-semantic-invalid") {
      assert.equal(atLimit.failure.issues.length, 1_024);
    }
  }

  const bus = setup();
  resetCvn6Callbacks();
  cvn6CallbackBehavior.validatorIssueCount = 1_025;
  const result = bus.submit(command());
  assert.equal(result.status, "rejected");
  if (result.status === "rejected") {
    assert.deepEqual(result.failure, {
      code: "command.contribution-contract-violation",
      moduleId: "fixture.score.module",
      contributionId: "fixture.score.contribution.v1",
    });
  }
  assert.equal(cvn6CallbackCounts.classify, 0);
});

test("aggregate module issues accept 4,096 and reject the 4,097th", () => {
  let lastIssueCount = 0;
  const fixture = aggregateFixture(() => lastIssueCount);
  const atLimit = CommandBus.createIntegrated(fixture.document, fixture.catalog);
  assert.equal(atLimit.ok, false);
  if (!atLimit.ok) {
    assert.equal(atLimit.failure.code, "command.contribution-semantic-invalid");
    if (atLimit.failure.code === "command.contribution-semantic-invalid") {
      assert.equal(atLimit.failure.issues.length, 4_096);
    }
  }

  lastIssueCount = 1;
  const overLimit = CommandBus.createIntegrated(fixture.document, fixture.catalog);
  assert.deepEqual(overLimit, {
    ok: false,
    failure: {
      code: "command.resource-limit-exceeded",
      limitKind: "module-issues",
      limit: 4_096,
      actual: 4_097,
    },
  });
});

test("compatibility facts accept 131,072 and reject the 131,073rd", () => {
  const compiled = compileOfficialModuleCatalogV1(CVN6_MANIFEST, CVN6_REGISTRATION_ENTRIES);
  assert.equal(compiled.ok, true);
  if (!compiled.ok) throw new Error("catalog");
  const absentRequirement = {
    requirementVersion: 1 as const,
    namespace: "fixture.absent",
    moduleId: "fixture.absent.module",
    contributionId: "fixture.absent.contribution.v1",
    supportedSchemaVersions: [1] as const,
    requiredForWrite: true as const,
  };
  const assembly = resolveKernelIntegratedRuntimeAssembly(compiled.catalog, {
    inventoryVersion: 1,
    requirements: [
      CVN6_SCORE_CONTRIBUTION.extensionRequirements[0],
      CVN6_PART_CONTRIBUTION.extensionRequirements[0],
      absentRequirement,
    ],
  });
  assert.equal(assembly.ok, true);
  if (!assembly.ok) throw new Error("assembly");

  function documentWithFacts(count: number): ScoreDocument {
    return {
      ...createCoreScoreFixture(),
      extensions: Array.from({ length: count }, (_, index) => ({
        namespace: "fixture.absent",
        schemaVersion: 1,
        owner: { kind: "part" as const, partId: `part-${index}` },
        payload: {},
      })),
    };
  }

  const atLimit = computeKernelDomainAvailability(
    documentWithFacts(131_072),
    assembly.state,
  );
  assert.equal(atLimit.ok, true);
  if (atLimit.ok) {
    assert.equal(atLimit.value.facts.length, 131_072);
  }

  const overLimit = computeKernelDomainAvailability(
    documentWithFacts(131_073),
    assembly.state,
  );
  assert.deepEqual(overLimit, {
    ok: false,
    limit: 131_072,
    actual: 131_073,
  });
});
