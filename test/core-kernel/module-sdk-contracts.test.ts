import { test } from "node:test";
import assert = require("node:assert/strict");
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// @ts-expect-error KernelErrorBase is internal and absent from the Core root.
import type { KernelErrorBase as RootKernelErrorBase } from "../../src/core-kernel/index";
// @ts-expect-error KernelErrorBase is internal and absent from the SDK entry.
import type { KernelErrorBase as SdkKernelErrorBase } from "../../src/core-kernel/module-sdk/index";

import * as coreKernel from "../../src/core-kernel/index";
import * as moduleSdk from "../../src/core-kernel/module-sdk/index";
import {
  OFFICIAL_MODULE_SDK_V1_LIMITS,
  ModuleKernelErrorBase,
  defineDomainCommandContributionV1,
  defineDomainCommandRegistrationEntryV1,
  defineDomainCommandV1,
  defineModuleEffectV1,
  type CompiledDomainCommandDefinitionV1,
  type CompiledModuleEffectDefinitionV1,
  type DomainCommandDecoderV1,
  type DomainCommandPreparerV1,
  type ModuleEffectPayloadDecoderV1,
  type ModuleEffectTransformerV1,
  type DomainCommandDecodeInputV1,
  type ExtensionRuntimeRequirementV1,
  type KernelIntegratedCatalog,
  type ModuleIssueCode,
  type ModuleKernelIssue,
  type OfficialModuleSdkV1Limits,
} from "../../src/core-kernel/module-sdk/index";
import {
  SYNTHETIC_PART_COMMAND,
  SYNTHETIC_PART_EFFECT,
  SYNTHETIC_SCORE_COMMAND,
  SYNTHETIC_SCORE_CONTRIBUTION,
  SYNTHETIC_SCORE_EFFECT,
  SYNTHETIC_SCORE_REGISTRATION_ENTRY,
  syntheticOfficialModuleCallbackCounts,
} from "./fixtures/synthetic-official-modules";

void (undefined as unknown as RootKernelErrorBase);
void (undefined as unknown as SdkKernelErrorBase);

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends
  (<Value>() => Value extends Right ? 1 : 2)
    ? true
    : false;

type Expect<Value extends true> = Value;

type DecodeInputHasExactKeys = Expect<
  Equal<keyof DomainCommandDecodeInputV1, "target" | "payload">
>;
type LimitsRetainLiteralValues = Expect<
  Equal<
    OfficialModuleSdkV1Limits,
    {
      readonly modules: 64;
      readonly contributions: 256;
      readonly commands: 4096;
      readonly effects: 4096;
      readonly extensionNamespaces: 1024;
      readonly supportedSchemaVersionsPerRequirement: 256;
      readonly moduleIssuesPerCallback: 1024;
      readonly moduleIssuesPerTransaction: 4096;
      readonly compatibilityFacts: 131072;
    }
  >
>;

type SharedRootTypeFixture = readonly [
  ExtensionRuntimeRequirementV1,
  KernelIntegratedCatalog,
  ModuleIssueCode,
  ModuleKernelIssue,
  DecodeInputHasExactKeys,
  LimitsRetainLiteralValues,
];

const retainTypeFixture = <Value>(): Value | undefined => undefined;
void retainTypeFixture<SharedRootTypeFixture>();

const ACCEPTED_CORE_RUNTIME_KEYS = [
  "CORE_KERNEL_STARTUP_MANIFEST",
  "CommandBus",
  "K1_SCORE_FEATURE_PROFILE",
  "KernelModuleGateway",
  "KernelRegistry",
  "PURE_CORE_KERNEL_V1_SCOPE",
  "SCORE_DOCUMENT_SCHEMA_VERSION",
  "addFractions",
  "compareFractions",
  "createDiagnostic",
  "createFraction",
  "createKernelRegistry",
  "createKernelValidationReport",
  "createModuleInternalIssue",
  "createScoreDocument",
  "decodeScoreDocument",
  "deriveSequenceEventStarts",
  "encodeScoreDocumentJson",
  "getEffectiveMeasureDuration",
  "getNoteValueDuration",
  "isCanonicalFraction",
  "isJsonValue",
  "isNoteValueBase",
  "isNoteValueDots",
  "isScoreDocumentSchemaVersion",
  "isTransposition",
  "isWrittenPitch",
  "mapCheckpointFailureToKernelIssues",
  "mapCommandBusCreationFailureToKernelIssues",
  "mapCommandFailureToKernelIssues",
  "mapDiagnosticToKernelIssue",
  "mapEventSubscriptionFailureToKernelIssues",
  "mapReadFailureToKernelIssues",
  "mapRegistryAccessFailureToKernelIssues",
  "mapRegistryStartupFailureToKernelIssues",
  "migrateScoreDocument",
  "multiplyFractions",
  "parseScoreDocumentJson",
  "replayCoreCommands",
  "selectDirtyState",
  "selectHistoryState",
  "selectScoreEntity",
  "selectScoreEntityOwnership",
  "selectScoreMetadata",
  "selectScoreRange",
  "subtractFractions",
  "transposeWrittenPitch",
  "validateScoreDocumentSemantics",
  "validateScoreFeatureProfile",
];

test("Stage 1 keeps the application root runtime surface unchanged", () => {
  assert.deepEqual(Object.keys(coreKernel).sort(), ACCEPTED_CORE_RUNTIME_KEYS);
  for (const forbiddenName of [
    "OFFICIAL_MODULE_SDK_V1_LIMITS",
    "ModuleKernelErrorBase",
    "createModuleKernelIssueV1",
    "compileOfficialModuleCatalogV1",
    "defineDomainCommandV1",
    "defineModuleEffectV1",
    "defineDomainCommandContributionV1",
    "defineDomainCommandRegistrationEntryV1",
    "compileOfficialModuleCatalogV1",
    "kernelIntegratedCatalogBrand",
  ]) {
    assert.equal(forbiddenName in coreKernel, false);
  }
});

test("SDK runtime surface contains exactly the eight approved values", () => {
  assert.deepEqual(Object.keys(moduleSdk).sort(), [
    "ModuleKernelErrorBase",
    "OFFICIAL_MODULE_SDK_V1_LIMITS",
    "compileOfficialModuleCatalogV1",
    "createModuleKernelIssueV1",
    "defineDomainCommandContributionV1",
    "defineDomainCommandRegistrationEntryV1",
    "defineDomainCommandV1",
    "defineModuleEffectV1",
  ]);
});

test("SDK entry has the exact explicit 8 runtime and 34 type allowlists", () => {
  const source = readFileSync(
    resolve(process.cwd(), "src", "core-kernel", "module-sdk", "index.ts"),
    "utf8",
  );
  assert.equal(source.includes("export *"), false);
  const typeNames = [...source.matchAll(/export type\s*\{([\s\S]*?)\}\s*from/g)]
    .flatMap((match) => (match[1] ?? "").split(","))
    .map((name) => name.trim())
    .filter((name) => name.length > 0)
    .sort();
  assert.deepEqual(typeNames, [
    "CompiledDomainCommandContributionV1",
    "CompiledDomainCommandDefinitionV1",
    "CompiledDomainCommandRegistrationEntryV1",
    "CompiledModuleEffectDefinitionV1",
    "CoreWrittenPitchEffectRequestV1",
    "DomainCommandDecodeInputV1",
    "DomainCommandDecodeResultV1",
    "DomainCommandDecoderV1",
    "DomainCommandDefinitionInputV1",
    "DomainCommandDescriptorV1",
    "DomainCommandPreparationResultV1",
    "DomainCommandPreparerV1",
    "DomainContributionReadViewV1",
    "DomainEffectRequestV1",
    "DomainSemanticValidatorV1",
    "DomainSupportClassificationV1",
    "DomainSupportClassifierV1",
    "ExtensionRuntimeRequirementV1",
    "KernelIntegratedCatalog",
    "ModuleEffectApplyInputV1",
    "ModuleEffectApplyResultV1",
    "ModuleEffectDefinitionInputV1",
    "ModuleEffectDescriptorV1",
    "ModuleEffectPayloadDecodeResultV1",
    "ModuleEffectPayloadDecoderV1",
    "ModuleEffectTransformerV1",
    "ModuleIssueCode",
    "ModuleIssueCreationResultV1",
    "ModuleIssueInputV1",
    "ModuleKernelIssue",
    "ModuleOwnedEffectRequestV1",
    "OfficialModuleCatalogCompilationResultV1",
    "OfficialModuleDefinitionResultV1",
    "OfficialModuleSdkV1Limits",
  ].sort());
});

test("definition handles and outer ABIs are exact, opaque, and frozen", () => {
  for (const command of [SYNTHETIC_SCORE_COMMAND, SYNTHETIC_PART_COMMAND]) {
    assert.deepEqual(Object.keys(command), ["descriptor"]);
    assert.deepEqual(Reflect.ownKeys(command).length, 2);
    assert.equal(Object.isFrozen(command), true);
    assert.equal("decode" in command, false);
    assert.equal("prepare" in command, false);
  }
  for (const effect of [SYNTHETIC_SCORE_EFFECT, SYNTHETIC_PART_EFFECT]) {
    assert.deepEqual(Object.keys(effect), ["descriptor"]);
    assert.deepEqual(Reflect.ownKeys(effect).length, 2);
    assert.equal(Object.isFrozen(effect), true);
    assert.equal("decode" in effect, false);
    assert.equal("transform" in effect, false);
  }
  assert.deepEqual(Object.keys(SYNTHETIC_SCORE_CONTRIBUTION), [
    "apiVersion",
    "moduleId",
    "contributionId",
    "extensionNamespaces",
    "extensionRequirements",
    "commands",
    "validate",
    "classify",
    "effects",
  ]);
  assert.deepEqual(Object.keys(SYNTHETIC_SCORE_REGISTRATION_ENTRY), [
    "registrationEntryId",
    "ownerModuleId",
    "kind",
    "contributions",
  ]);
  assert.equal(Object.isFrozen(SYNTHETIC_SCORE_CONTRIBUTION), true);
  assert.equal(Object.isFrozen(SYNTHETIC_SCORE_REGISTRATION_ENTRY), true);
  assert.deepEqual(syntheticOfficialModuleCallbackCounts, {
    commandDecode: 0,
    commandPrepare: 0,
    validate: 0,
    classify: 0,
    effectDecode: 0,
    effectTransform: 0,
  });
});

if (false) {
  interface FirstCommand {
    readonly first: string;
  }
  interface SecondCommand {
    readonly second: number;
  }
  interface FirstPayload {
    readonly alpha: string;
  }
  interface SecondPayload {
    readonly beta: boolean;
  }

  const firstDecoder: DomainCommandDecoderV1<FirstCommand> = (input) => {
    const target: unknown = input.target;
    const payload: unknown = input.payload;
    void target;
    void payload;
    return { status: "decoded", command: { first: "value" } };
  };
  const firstPreparer: DomainCommandPreparerV1<FirstCommand> = () => ({
    status: "no-op",
  });
  const secondPreparer: DomainCommandPreparerV1<SecondCommand> = () => ({
    status: "no-op",
  });
  const firstPayloadDecoder: ModuleEffectPayloadDecoderV1<FirstPayload> = () => ({
    status: "decoded",
    payload: { alpha: "value" },
  });
  const firstTransformer: ModuleEffectTransformerV1<FirstPayload> = () => ({
    status: "remove",
  });
  const secondTransformer: ModuleEffectTransformerV1<SecondPayload> = () => ({
    status: "remove",
  });

  defineDomainCommandV1({
    descriptor: SYNTHETIC_SCORE_COMMAND.descriptor,
    decode: firstDecoder,
    prepare: firstPreparer,
  });
  defineModuleEffectV1({
    descriptor: SYNTHETIC_SCORE_EFFECT.descriptor,
    decode: firstPayloadDecoder,
    transform: firstTransformer,
  });
  defineDomainCommandV1({
    descriptor: SYNTHETIC_SCORE_COMMAND.descriptor,
    // @ts-expect-error Decoder and preparer command types must match.
    decode: firstDecoder,
    prepare: secondPreparer,
  });
  defineModuleEffectV1({
    descriptor: SYNTHETIC_SCORE_EFFECT.descriptor,
    // @ts-expect-error Decoder and transformer payload types must match.
    decode: firstPayloadDecoder,
    transform: secondTransformer,
  });
  // @ts-expect-error Compiled command handles require an inaccessible brand.
  const fakeCommand: CompiledDomainCommandDefinitionV1 = {
    descriptor: SYNTHETIC_SCORE_COMMAND.descriptor,
  };
  // @ts-expect-error Compiled effect handles require an inaccessible brand.
  const fakeEffect: CompiledModuleEffectDefinitionV1 = {
    descriptor: SYNTHETIC_SCORE_EFFECT.descriptor,
  };
  void fakeCommand;
  void fakeEffect;
}

test("official module limits have the exact frozen V1 shape", () => {
  assert.deepEqual(Object.keys(OFFICIAL_MODULE_SDK_V1_LIMITS).sort(), [
    "commands",
    "compatibilityFacts",
    "contributions",
    "effects",
    "extensionNamespaces",
    "moduleIssuesPerCallback",
    "moduleIssuesPerTransaction",
    "modules",
    "supportedSchemaVersionsPerRequirement",
  ]);
  assert.deepEqual(OFFICIAL_MODULE_SDK_V1_LIMITS, {
    modules: 64,
    contributions: 256,
    commands: 4096,
    effects: 4096,
    extensionNamespaces: 1024,
    supportedSchemaVersionsPerRequirement: 256,
    moduleIssuesPerCallback: 1024,
    moduleIssuesPerTransaction: 4096,
    compatibilityFacts: 131072,
  });
  assert.equal(Object.isFrozen(OFFICIAL_MODULE_SDK_V1_LIMITS), true);
});

class FixtureModuleError extends ModuleKernelErrorBase<
  "fixture.score",
  "fixture.score.problem"
> {
  constructor(input: {
    readonly location: {
      readonly kind: "diagnostic-path";
      readonly path: readonly (string | number)[];
    };
    readonly details: { readonly nested: { readonly value: string } };
  }) {
    super({
      code: "fixture.score.problem",
      source: {
        kind: "module",
        moduleId: "fixture.score",
        contributionId: "fixture.score.main",
      },
      location: input.location,
      details: input.details,
    });
  }
}

class CompileTimeRejectedCrossModuleError extends ModuleKernelErrorBase<
  "fixture.score",
  "fixture.score.problem"
> {
  constructor() {
    super({
      // @ts-expect-error The code is coupled to the base generic.
      code: "fixture.part.problem",
      source: {
        kind: "module",
        // @ts-expect-error The source module is coupled to the base generic.
        moduleId: "fixture.part",
        contributionId: "fixture.part.main",
      },
    });
  }
}
void CompileTimeRejectedCrossModuleError;

function assertDeeplyFrozen(value: unknown): void {
  if (value === null || typeof value !== "object") {
    return;
  }
  assert.equal(Object.isFrozen(value), true);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
    if (descriptor !== undefined && "value" in descriptor) {
      assertDeeplyFrozen(descriptor.value);
    }
  }
}

test("module error branch preserves its generic code and isolated frozen issue", () => {
  const path: (string | number)[] = ["parts", 0];
  const details = { nested: { value: "before" } };
  const error = new FixtureModuleError({
    location: { kind: "diagnostic-path", path },
    details,
  });
  const issue = error.toIssue();
  const literalCode: "fixture.score.problem" = error.code;
  void literalCode;

  path[0] = "changed";
  details.nested.value = "changed";

  assert.equal(error instanceof Error, true);
  assert.equal(error instanceof ModuleKernelErrorBase, true);
  assert.equal(
    Object.getPrototypeOf(FixtureModuleError.prototype),
    ModuleKernelErrorBase.prototype,
  );
  const kernelErrorBasePrototype = Object.getPrototypeOf(
    ModuleKernelErrorBase.prototype,
  );
  assert.equal(Object.getPrototypeOf(kernelErrorBasePrototype), Error.prototype);
  assert.equal(error.code, issue.code);
  assert.equal(error.toIssue(), issue);
  assert.deepEqual(issue.location, {
    kind: "diagnostic-path",
    path: ["parts", 0],
  });
  assert.deepEqual(issue.details, { nested: { value: "before" } });
  for (const privateErrorField of ["name", "message", "stack", "cause"]) {
    assert.equal(privateErrorField in issue, false);
  }
  assertDeeplyFrozen(issue);
});
