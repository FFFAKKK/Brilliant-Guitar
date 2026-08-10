import { test } from "node:test";
import assert = require("node:assert/strict");

import {
  compileOfficialModuleCatalogV1,
  createModuleKernelIssueV1,
  defineDomainCommandContributionV1,
  defineDomainCommandRegistrationEntryV1,
  defineDomainCommandV1,
  defineModuleEffectV1,
} from "../../src/core-kernel/module-sdk/index";
import { decodeKernelStartupManifest } from "../../src/core-kernel/registry/strict-codec";
import {
  SYNTHETIC_OFFICIAL_MODULE_MANIFEST,
  SYNTHETIC_OFFICIAL_MODULE_REGISTRATION_ENTRIES,
  SYNTHETIC_SCORE_COMMAND,
  SYNTHETIC_SCORE_CONTRIBUTION,
  SYNTHETIC_SCORE_EFFECT,
  resetSyntheticOfficialModuleCallbackCounts,
  syntheticOfficialModuleCallbackCounts,
} from "./fixtures/synthetic-official-modules";

function withExecReplacementFromOwnKeys<T extends object, Result>(
  target: T,
  operation: (proxy: T) => Result,
): Result {
  const regexpExec = RegExp.prototype.exec;
  const proxy = new Proxy(target, {
    ownKeys(value) {
      RegExp.prototype.exec = () => ["forged"] as unknown as RegExpExecArray;
      return Reflect.ownKeys(value);
    },
  });
  try {
    return operation(proxy);
  } finally {
    RegExp.prototype.exec = regexpExec;
  }
}

function validIssueInput(): {
  code: string;
  source: {
    kind: "module";
    moduleId: string;
    contributionId: string;
  };
  location: {
    kind: "score-address";
    address: { kind: "note"; noteId: string };
  };
  details: { nested: { values: number[] } };
} {
  return {
    code: "fixture.score.unsupported.chord",
    source: {
      kind: "module",
      moduleId: "fixture.score",
      contributionId: "fixture.score.main",
    },
    location: {
      kind: "score-address",
      address: { kind: "note", noteId: "note-1" },
    },
    details: { nested: { values: [1, 2] } },
  };
}

test("module issue builder derives output facts and detaches caller data", () => {
  const input = validIssueInput();
  const result = createModuleKernelIssueV1(input);
  assert.equal(result.status, "created");
  if (result.status !== "created") {
    return;
  }

  input.source.moduleId = "changed";
  input.location.address.noteId = "changed";
  input.details.nested.values[0] = 99;

  assert.deepEqual(result.issue, {
    issueVersion: 1,
    code: "fixture.score.unsupported.chord",
    severity: "warning",
    messageKey: "module.fixture.score.unsupported.chord",
    source: {
      kind: "module",
      moduleId: "fixture.score",
      contributionId: "fixture.score.main",
    },
    location: {
      kind: "score-address",
      address: { kind: "note", noteId: "note-1" },
    },
    details: { nested: { values: [1, 2] } },
  });
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.issue), true);
  assert.equal(Object.isFrozen(result.issue.source), true);
  assert.equal(Object.isFrozen(result.issue.details?.nested), true);
});

test("module issue severity classification is deterministic", () => {
  const cases = [
    ["fixture.score.unsupported", "warning"],
    ["fixture.score.unsupported.chord", "warning"],
    ["fixture.score.internal-error", "fatal"],
    ["fixture.score.invariant-violation", "fatal"],
    ["fixture.score.invalid", "error"],
  ] as const;
  for (const [code, severity] of cases) {
    const result = createModuleKernelIssueV1({
      code,
      source: {
        kind: "module",
        moduleId: "fixture.score",
        contributionId: "fixture.score.main",
      },
    });
    assert.equal(result.status, "created");
    if (result.status === "created") {
      assert.equal(result.issue.severity, severity);
    }
  }
});

test("module issue builder rejects malformed data without invoking getters", () => {
  let getterCalls = 0;
  const accessor = {
    code: "fixture.score.problem",
    source: {
      kind: "module",
      moduleId: "fixture.score",
      contributionId: "fixture.score.main",
    },
    get details(): never {
      getterCalls += 1;
      throw new Error("must not execute");
    },
  };
  const cyclic: Record<string, unknown> = {};
  cyclic.self = cyclic;
  const sparse = new Array(2);
  sparse[1] = "present";
  const overlength = `fixture.${"a".repeat(121)}`;

  const invalidInputs: readonly unknown[] = [
    null,
    { ...validIssueInput(), severity: "warning" },
    { ...validIssueInput(), messageKey: "caller.controlled" },
    {
      ...validIssueInput(),
      code: "fixture.part.problem",
    },
    {
      ...validIssueInput(),
      code: overlength,
      source: { ...validIssueInput().source, moduleId: overlength },
    },
    {
      ...validIssueInput(),
      source: { kind: "core", moduleId: "fixture.score" },
    },
    {
      ...validIssueInput(),
      location: { kind: "diagnostic-path", path: [0.5] },
    },
    {
      ...validIssueInput(),
      location: { kind: "score-address", address: { kind: "unknown" } },
    },
    { ...validIssueInput(), details: cyclic },
    { ...validIssueInput(), details: { sparse } },
    accessor,
  ];

  for (const input of invalidInputs) {
    assert.deepEqual(createModuleKernelIssueV1(input), { status: "invalid" });
  }
  assert.equal(getterCalls, 0);
});

test("module issue builder captures Proxy data descriptors without get traps", () => {
  let getCalls = 0;
  const input = validIssueInput();
  const proxy = new Proxy(input, {
    get() {
      getCalls += 1;
      throw new Error("must not execute");
    },
  });

  assert.equal(createModuleKernelIssueV1(proxy).status, "created");
  assert.equal(getCalls, 0);
});

test("definition builders reject malformed inputs and forbidden callable kinds", () => {
  function* generator(): Generator<never, void, unknown> {
    return;
  }
  class CallbackClass {}
  const bound = (() => ({ status: "invalid" as const })).bind(undefined);
  const commandDescriptor = SYNTHETIC_SCORE_COMMAND.descriptor;
  const effectDescriptor = SYNTHETIC_SCORE_EFFECT.descriptor;
  const malformed = [
    [defineDomainCommandV1, null],
    [
      defineDomainCommandV1,
      { descriptor: commandDescriptor, decode: async () => ({ status: "invalid" }), prepare: () => ({ status: "no-op" }) },
    ],
    [
      defineDomainCommandV1,
      { descriptor: commandDescriptor, decode: generator, prepare: () => ({ status: "no-op" }) },
    ],
    [
      defineDomainCommandV1,
      { descriptor: commandDescriptor, decode: CallbackClass, prepare: () => ({ status: "no-op" }) },
    ],
    [
      defineDomainCommandV1,
      { descriptor: commandDescriptor, decode: bound, prepare: () => ({ status: "no-op" }) },
    ],
    [
      defineModuleEffectV1,
      { descriptor: effectDescriptor, decode: () => ({ status: "invalid" }), transform: async () => ({ status: "remove" }) },
    ],
    [
      defineDomainCommandContributionV1,
      { ...SYNTHETIC_SCORE_CONTRIBUTION, commands: [{ descriptor: commandDescriptor }] },
    ],
    [
      defineDomainCommandContributionV1,
      { ...SYNTHETIC_SCORE_CONTRIBUTION, effects: [{ descriptor: effectDescriptor }] },
    ],
    [
      defineDomainCommandRegistrationEntryV1,
      { registrationEntryId: "kernel.domain-commands.v1", ownerModuleId: "wrong.module", kind: "domain-command", contributions: [SYNTHETIC_SCORE_CONTRIBUTION] },
    ],
  ] as const;

  for (const [builder, input] of malformed) {
    assert.deepEqual(Reflect.apply(builder, undefined, [input]), {
      status: "invalid",
    });
  }
  assert.deepEqual(syntheticOfficialModuleCallbackCounts, {
    commandDecode: 0,
    commandPrepare: 0,
    validate: 0,
    classify: 0,
    effectDecode: 0,
    effectTransform: 0,
  });
});

test("definition builders reject accessors, sparse arrays, symbols, and invalid prototypes", () => {
  let getterCalls = 0;
  const accessor = {
    descriptor: SYNTHETIC_SCORE_COMMAND.descriptor,
    get decode(): never {
      getterCalls += 1;
      throw new Error("must not execute");
    },
    prepare: () => ({ status: "no-op" as const }),
  };
  const withSymbol = {
    descriptor: SYNTHETIC_SCORE_COMMAND.descriptor,
    decode: () => ({ status: "invalid" as const }),
    prepare: () => ({ status: "no-op" as const }),
    [Symbol("extra")]: true,
  };
  const sparseCommands = new Array(1);
  const sparseContribution = {
    ...SYNTHETIC_SCORE_CONTRIBUTION,
    commands: sparseCommands,
  };
  const customPrototype = Object.create({ inherited: true }) as Record<string, unknown>;
  Object.assign(customPrototype, {
    descriptor: SYNTHETIC_SCORE_COMMAND.descriptor,
    decode: () => ({ status: "invalid" as const }),
    prepare: () => ({ status: "no-op" as const }),
  });

  for (const input of [accessor, withSymbol, customPrototype]) {
    assert.equal(
      Reflect.apply(defineDomainCommandV1, undefined, [input]).status,
      "invalid",
    );
  }
  assert.equal(
    Reflect.apply(defineDomainCommandContributionV1, undefined, [
      sparseContribution,
    ]).status,
    "invalid",
  );
  assert.equal(getterCalls, 0);
});

test("module issue validation uses stable primordial references during Proxy side effects", () => {
  const arrayPush = Array.prototype.push;
  const numberIsSafeInteger = Number.isSafeInteger;
  const stringIncludes = String.prototype.includes;
  const stringEndsWith = String.prototype.endsWith;
  const objectFreeze = Object.freeze;
  const target = {
    code: "fixture.score.problem",
    source: {
      kind: "module",
      moduleId: "fixture.score",
      contributionId: "fixture.score.main",
    },
    location: { kind: "diagnostic-path", path: [0.5] },
  };
  const proxy = new Proxy(target, {
    ownKeys(value) {
      Array.prototype.push = function fakePush<T>(this: T[]): number {
        return this.length;
      };
      Number.isSafeInteger = () => true;
      String.prototype.includes = () => true;
      String.prototype.endsWith = () => true;
      Object.freeze = <T>(valueToFreeze: T): Readonly<T> => valueToFreeze;
      return Reflect.ownKeys(value);
    },
  });

  let result: ReturnType<typeof createModuleKernelIssueV1>;
  try {
    result = createModuleKernelIssueV1(proxy);
  } finally {
    Array.prototype.push = arrayPush;
    Number.isSafeInteger = numberIsSafeInteger;
    String.prototype.includes = stringIncludes;
    String.prototype.endsWith = stringEndsWith;
    Object.freeze = objectFreeze;
  }
  assert.deepEqual(result, { status: "invalid" });
});

test("module issue builder rejects sparse arrays during synchronous String replacement", () => {
  resetSyntheticOfficialModuleCallbackCounts();
  const sparseValues = new Array(2) as number[] & { extra?: number };
  sparseValues[1] = 2;
  Object.defineProperty(sparseValues, "extra", {
    configurable: true,
    enumerable: true,
    value: 1,
    writable: true,
  });
  const target = {
    ...validIssueInput(),
    details: { nested: { values: sparseValues } },
  };
  const stringConstructor = globalThis.String;
  const proxy = new Proxy(target, {
    ownKeys(value) {
      globalThis.String = (() => "extra") as unknown as StringConstructor;
      return Reflect.ownKeys(value);
    },
  });

  let result: ReturnType<typeof createModuleKernelIssueV1>;
  try {
    result = createModuleKernelIssueV1(proxy);
  } finally {
    globalThis.String = stringConstructor;
  }
  assert.deepEqual(result, { status: "invalid" });
  assert.deepEqual(syntheticOfficialModuleCallbackCounts, {
    commandDecode: 0,
    commandPrepare: 0,
    validate: 0,
    classify: 0,
    effectDecode: 0,
    effectTransform: 0,
  });
});

test("contribution validation rejects duplicate namespaces during synchronous built-in replacement", () => {
  const arraySort = Array.prototype.sort;
  const arraySome = Array.prototype.some;
  const setAdd = Set.prototype.add;
  const setHas = Set.prototype.has;
  const target = {
    ...SYNTHETIC_SCORE_CONTRIBUTION,
    extensionNamespaces: ["fixture.score", "fixture.score"],
    extensionRequirements: [
      SYNTHETIC_SCORE_CONTRIBUTION.extensionRequirements[0],
      SYNTHETIC_SCORE_CONTRIBUTION.extensionRequirements[0],
    ],
  };
  const proxy = new Proxy(target, {
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

  let result: ReturnType<typeof defineDomainCommandContributionV1>;
  try {
    result = Reflect.apply(defineDomainCommandContributionV1, undefined, [
      proxy,
    ]);
  } finally {
    Array.prototype.sort = arraySort;
    Array.prototype.some = arraySome;
    Set.prototype.add = setAdd;
    Set.prototype.has = setHas;
  }
  assert.deepEqual(result, { status: "invalid" });
});

test("safe IDs reject synchronous RegExp exec replacement across SDK and catalog inputs", () => {
  const invalidCommandDefinition = {
    descriptor: {
      ...SYNTHETIC_SCORE_COMMAND.descriptor,
      commandId: "BAD ID",
    },
    decode(): { readonly status: "invalid" } {
      return { status: "invalid" };
    },
    prepare(): { readonly status: "no-op" } {
      return { status: "no-op" };
    },
  };
  const definitionResult = withExecReplacementFromOwnKeys(
    invalidCommandDefinition,
    (input) => Reflect.apply(defineDomainCommandV1, undefined, [input]),
  );
  assert.deepEqual(definitionResult, { status: "invalid" });

  const invalidIssue = {
    code: "BAD ID.problem",
    source: {
      kind: "module" as const,
      moduleId: "BAD ID",
      contributionId: "BAD ID.contribution",
    },
  };
  const issueResult = withExecReplacementFromOwnKeys(invalidIssue, (input) =>
    createModuleKernelIssueV1(input),
  );
  assert.deepEqual(issueResult, { status: "invalid" });

  const invalidManifest = {
    startupManifestVersion: 1,
    modules: SYNTHETIC_OFFICIAL_MODULE_MANIFEST.modules.map((module) =>
      module.moduleId === "fixture.score.module"
        ? { ...module, moduleId: "BAD ID" }
        : module,
    ),
  };
  const manifestResult = withExecReplacementFromOwnKeys(
    invalidManifest,
    (input) => decodeKernelStartupManifest(input),
  );
  assert.deepEqual(manifestResult, {
    ok: false,
    failure: { code: "registry.invalid-startup-input" },
  });

  const catalogResult = withExecReplacementFromOwnKeys(
    invalidManifest,
    (input) =>
      compileOfficialModuleCatalogV1(
        input,
        SYNTHETIC_OFFICIAL_MODULE_REGISTRATION_ENTRIES,
      ),
  );
  assert.deepEqual(catalogResult, {
    ok: false,
    failure: { code: "registry.invalid-startup-input" },
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
