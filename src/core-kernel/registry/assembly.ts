import { DEFAULT_CORE_EXECUTION_ASSEMBLY } from "../commands/execution-assembly";
import { deepFreezeValue } from "../read/deep-freeze";
import type {
  CompiledCommandContribution,
  CompiledReadStateSelectorContribution,
  CompiledSelectorContribution,
  CompiledSnapshotSelectorContribution,
  CoreCompiledContribution,
} from "./builtins";
import type {
  CoreSelectorId,
  KernelCapability,
  KernelRegistryStartupFailure,
  RegistryContributionSummary,
  RegistrySummary,
} from "./contracts";
import {
  isSafeRegistryId,
  readDenseArray,
  readExactDataRecord,
  type DecodedKernelStartupManifest,
  type DecodedKernelStartupModuleDeclaration,
  type ExactDataRecord,
} from "./strict-codec";

export interface NormalizedRegistryModule {
  readonly moduleId: string;
  readonly origin: "official";
  readonly runtime: "builtin" | "internal-module";
  readonly trustLevel: "system-trusted";
  readonly apiVersion: 1;
  readonly capabilities: readonly KernelCapability[];
  readonly registrationEntryIds: readonly string[];
}

export interface RegistryCandidateState {
  readonly startupManifestVersion: 1;
  readonly modules: readonly NormalizedRegistryModule[];
  readonly contributions: readonly CoreCompiledContribution[];
}

export interface RegistryAssemblyState extends RegistryCandidateState {
  readonly summary: RegistrySummary;
}

export type RegistryCandidateResult =
  | { readonly ok: true; readonly state: RegistryCandidateState }
  | { readonly ok: false; readonly failure: KernelRegistryStartupFailure };

function startupFailure(
  failure: KernelRegistryStartupFailure,
): RegistryCandidateResult {
  return { ok: false, failure };
}

function isExactStringArray(
  value: unknown,
  expected: readonly string[],
): boolean {
  const decoded = readDenseArray(value);
  return (
    decoded !== undefined &&
    decoded.length === expected.length &&
    decoded.every((item, index) => item === expected[index])
  );
}

function isTargetKind(value: unknown): value is
  | "document"
  | "measure"
  | "part"
  | "staff"
  | "voice"
  | "event"
  | "note" {
  return (
    value === "document" ||
    value === "measure" ||
    value === "part" ||
    value === "staff" ||
    value === "voice" ||
    value === "event" ||
    value === "note"
  );
}

function isCoreSelectorId(value: unknown): value is CoreSelectorId {
  return (
    value === "core.selector.score-metadata" ||
    value === "core.selector.score-entity" ||
    value === "core.selector.score-entity-ownership" ||
    value === "core.selector.score-range" ||
    value === "core.selector.history-state" ||
    value === "core.selector.dirty-state"
  );
}

function normalizeModule(
  module: DecodedKernelStartupModuleDeclaration,
):
  | { readonly ok: true; readonly value: NormalizedRegistryModule }
  | { readonly ok: false; readonly failure: KernelRegistryStartupFailure } {
  if (module.origin !== "official") {
    return {
      ok: false,
      failure: { code: "registry.unsupported-origin", moduleId: module.moduleId },
    };
  }
  if (module.runtime === "javascript-typescript") {
    return {
      ok: false,
      failure: { code: "registry.unsupported-runtime", moduleId: module.moduleId },
    };
  }
  if (module.trustLevel !== "system-trusted") {
    return {
      ok: false,
      failure: {
        code: "registry.unsupported-trust-level",
        moduleId: module.moduleId,
      },
    };
  }
  if (module.apiVersion !== 1) {
    return {
      ok: false,
      failure: {
        code: "registry.api-version-incompatible",
        moduleId: module.moduleId,
      },
    };
  }
  return {
    ok: true,
    value: {
      moduleId: module.moduleId,
      origin: "official",
      runtime: module.runtime,
      trustLevel: "system-trusted",
      apiVersion: 1,
      capabilities: [...module.capabilities],
      registrationEntryIds: [...module.registrationEntryIds],
    },
  };
}

function findCompiledEntry(
  entries: unknown,
  registrationEntryId: string,
): ExactDataRecord | undefined | "duplicate" {
  const decodedEntries = readDenseArray(entries);
  if (decodedEntries === undefined) {
    throw new TypeError("invalid compiled registration table");
  }
  let found: ExactDataRecord | undefined;
  for (const rawEntry of decodedEntries) {
    const entry = readExactDataRecord(rawEntry, [
      "registrationEntryId",
      "ownerModuleId",
      "kind",
      "contributions",
    ]);
    if (entry === undefined) {
      throw new TypeError("invalid compiled registration entry");
    }
    if (entry.registrationEntryId === registrationEntryId) {
      if (found !== undefined) {
        return "duplicate";
      }
      found = entry;
    }
  }
  return found;
}

type ContributionValidationResult =
  | { readonly ok: true; readonly value: CoreCompiledContribution }
  | { readonly ok: false; readonly failure: KernelRegistryStartupFailure };

function invalidContribution(
  registrationEntryId: string,
): { readonly ok: false; readonly failure: KernelRegistryStartupFailure } {
  return {
    ok: false,
    failure: { code: "registry.invalid-contribution", registrationEntryId },
  };
}

function handlerMismatch(
  contributionId: string,
): { readonly ok: false; readonly failure: KernelRegistryStartupFailure } {
  return {
    ok: false,
    failure: { code: "registry.handler-mismatch", contributionId },
  };
}

function validateCommandContribution(
  rawContribution: unknown,
  ownerModuleId: string,
  registrationEntryId: string,
): ContributionValidationResult {
  const contribution = readExactDataRecord(rawContribution, [
    "descriptor",
    "commandDefinition",
  ]);
  if (contribution === undefined) {
    return invalidContribution(registrationEntryId);
  }
  const descriptor = readExactDataRecord(contribution.descriptor, [
    "id",
    "kind",
    "sourceModuleId",
    "apiVersion",
    "requiredCapabilities",
    "titleKey",
    "targetKind",
  ]);
  if (
    descriptor === undefined ||
    !isSafeRegistryId(descriptor.id) ||
    descriptor.kind !== "command" ||
    descriptor.sourceModuleId !== ownerModuleId ||
    descriptor.apiVersion !== 1 ||
    !isExactStringArray(descriptor.requiredCapabilities, ["command:execute"]) ||
    !isSafeRegistryId(descriptor.titleKey) ||
    !isTargetKind(descriptor.targetKind)
  ) {
    return invalidContribution(registrationEntryId);
  }
  const commandDefinition = readExactDataRecord(contribution.commandDefinition, [
    "commandId",
    "targetKind",
  ]);
  if (
    commandDefinition === undefined ||
    commandDefinition.commandId !== descriptor.id ||
    commandDefinition.targetKind !== descriptor.targetKind
  ) {
    return handlerMismatch(descriptor.id);
  }
  const canonicalDefinition = DEFAULT_CORE_EXECUTION_ASSEMBLY.definitions.find(
    (definition) =>
      definition.commandId === descriptor.id &&
      definition.targetKind === descriptor.targetKind,
  );
  if (canonicalDefinition === undefined) {
    return invalidContribution(registrationEntryId);
  }
  const normalized: CompiledCommandContribution = {
    descriptor: {
      id: canonicalDefinition.commandId,
      kind: "command",
      sourceModuleId: ownerModuleId,
      apiVersion: 1,
      requiredCapabilities: ["command:execute"],
      titleKey: descriptor.titleKey,
      targetKind: canonicalDefinition.targetKind,
    },
    commandDefinition: canonicalDefinition,
  };
  return { ok: true, value: deepFreezeValue(normalized) };
}

function validateSelectorContribution(
  rawContribution: unknown,
  ownerModuleId: string,
  registrationEntryId: string,
): ContributionValidationResult {
  const contribution = readExactDataRecord(rawContribution, [
    "descriptor",
    "inputKind",
    "selector",
  ]);
  if (contribution === undefined) {
    return invalidContribution(registrationEntryId);
  }
  const descriptor = readExactDataRecord(contribution.descriptor, [
    "id",
    "kind",
    "sourceModuleId",
    "apiVersion",
    "requiredCapabilities",
    "titleKey",
    "inputKind",
  ]);
  if (
    descriptor === undefined ||
    !isCoreSelectorId(descriptor.id) ||
    descriptor.kind !== "selector" ||
    descriptor.sourceModuleId !== ownerModuleId ||
    descriptor.apiVersion !== 1 ||
    !isExactStringArray(descriptor.requiredCapabilities, [
      "score:read",
      "selector:execute",
    ]) ||
    !isSafeRegistryId(descriptor.titleKey) ||
    (descriptor.inputKind !== "snapshot" &&
      descriptor.inputKind !== "read-state")
  ) {
    return invalidContribution(registrationEntryId);
  }
  if (
    contribution.inputKind !== descriptor.inputKind ||
    typeof contribution.selector !== "function"
  ) {
    return handlerMismatch(descriptor.id);
  }

  if (descriptor.inputKind === "snapshot") {
    const normalized: CompiledSnapshotSelectorContribution = {
      descriptor: {
        id: descriptor.id,
        kind: "selector",
        sourceModuleId: ownerModuleId,
        apiVersion: 1,
        requiredCapabilities: ["score:read", "selector:execute"],
        titleKey: descriptor.titleKey,
        inputKind: "snapshot",
      },
      inputKind: "snapshot",
      selector:
        contribution.selector as CompiledSnapshotSelectorContribution["selector"],
    };
    return { ok: true, value: deepFreezeValue(normalized) };
  }
  const normalized: CompiledReadStateSelectorContribution = {
    descriptor: {
      id: descriptor.id,
      kind: "selector",
      sourceModuleId: ownerModuleId,
      apiVersion: 1,
      requiredCapabilities: ["score:read", "selector:execute"],
      titleKey: descriptor.titleKey,
      inputKind: "read-state",
    },
    inputKind: "read-state",
    selector:
      contribution.selector as CompiledReadStateSelectorContribution["selector"],
  };
  return { ok: true, value: deepFreezeValue(normalized) };
}

function validateEntryContributions(
  entry: ExactDataRecord,
  module: NormalizedRegistryModule,
  registrationEntryId: string,
):
  | { readonly ok: true; readonly value: readonly CoreCompiledContribution[] }
  | { readonly ok: false; readonly failure: KernelRegistryStartupFailure } {
  if (
    entry.registrationEntryId !== registrationEntryId ||
    !isSafeRegistryId(entry.ownerModuleId) ||
    (entry.kind !== "command" && entry.kind !== "selector")
  ) {
    return invalidContribution(registrationEntryId);
  }
  if (entry.ownerModuleId !== module.moduleId) {
    return {
      ok: false,
      failure: {
        code: "registry.registration-owner-mismatch",
        registrationEntryId,
        moduleId: module.moduleId,
      },
    };
  }
  const requiredRegistrationCapability: KernelCapability =
    entry.kind === "command" ? "command:register" : "selector:register";
  if (!module.capabilities.includes(requiredRegistrationCapability)) {
    return {
      ok: false,
      failure: {
        code: "registry.capability-denied",
        moduleId: module.moduleId,
        capability: requiredRegistrationCapability,
      },
    };
  }
  const rawContributions = readDenseArray(entry.contributions);
  if (rawContributions === undefined) {
    return invalidContribution(registrationEntryId);
  }
  const contributions: CoreCompiledContribution[] = [];
  for (const rawContribution of rawContributions) {
    const validated =
      entry.kind === "command"
        ? validateCommandContribution(
            rawContribution,
            module.moduleId,
            registrationEntryId,
          )
        : validateSelectorContribution(
            rawContribution,
            module.moduleId,
            registrationEntryId,
          );
    if (!validated.ok) {
      return validated;
    }
    contributions.push(validated.value);
  }
  return { ok: true, value: contributions };
}

function compareContributions(
  left: CoreCompiledContribution,
  right: CoreCompiledContribution,
): number {
  const kindComparison = compareText(
    left.descriptor.kind,
    right.descriptor.kind,
  );
  return kindComparison !== 0
    ? kindComparison
    : compareText(left.descriptor.id, right.descriptor.id);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function createContributionSummary(
  contribution: CoreCompiledContribution,
): RegistryContributionSummary {
  const descriptor = contribution.descriptor;
  const common = {
    id: descriptor.id,
    sourceModuleId: descriptor.sourceModuleId,
    apiVersion: 1 as const,
    requiredCapabilities: [...descriptor.requiredCapabilities],
    titleKey: descriptor.titleKey,
  };
  return descriptor.kind === "command"
    ? {
        ...common,
        kind: "command",
        targetKind: descriptor.targetKind,
      }
    : {
        ...common,
        kind: "selector",
        inputKind: descriptor.inputKind,
      };
}

export function createRegistryAssemblyState(
  candidate: RegistryCandidateState,
): RegistryAssemblyState {
  const summary: RegistrySummary = {
    startupManifestVersion: 1,
    modules: candidate.modules.map(({ moduleId, apiVersion }) => ({
      moduleId,
      apiVersion,
    })),
    contributions: candidate.contributions.map(createContributionSummary),
  };
  return deepFreezeValue({
    startupManifestVersion: candidate.startupManifestVersion,
    modules: candidate.modules,
    contributions: candidate.contributions,
    summary,
  });
}

function buildRegistryCandidateUnchecked(
  manifest: DecodedKernelStartupManifest,
  compiledRegistrationEntries: unknown,
): RegistryCandidateResult {
  const seenModuleIds = new Set<string>();
  for (const module of manifest.modules) {
    if (seenModuleIds.has(module.moduleId)) {
      return startupFailure({
        code: "registry.duplicate-module-id",
        moduleId: module.moduleId,
      });
    }
    seenModuleIds.add(module.moduleId);
  }

  const modules: NormalizedRegistryModule[] = [];
  for (const module of manifest.modules) {
    const normalized = normalizeModule(module);
    if (!normalized.ok) {
      return startupFailure(normalized.failure);
    }
    modules.push(normalized.value);
  }
  modules.sort((left, right) => compareText(left.moduleId, right.moduleId));

  const contributions: CoreCompiledContribution[] = [];
  const seenContributionIds = new Set<string>();
  for (const module of modules) {
    for (const registrationEntryId of module.registrationEntryIds) {
      const entry = findCompiledEntry(
        compiledRegistrationEntries,
        registrationEntryId,
      );
      if (entry === undefined) {
        return startupFailure({
          code: "registry.registration-entry-not-found",
          registrationEntryId,
        });
      }
      if (entry === "duplicate") {
        return startupFailure({
          code: "registry.invalid-contribution",
          registrationEntryId,
        });
      }
      const validated = validateEntryContributions(
        entry,
        module,
        registrationEntryId,
      );
      if (!validated.ok) {
        return startupFailure(validated.failure);
      }
      for (const contribution of validated.value) {
        const contributionId = contribution.descriptor.id;
        if (seenContributionIds.has(contributionId)) {
          return startupFailure({
            code: "registry.duplicate-contribution-id",
            contributionId,
          });
        }
        seenContributionIds.add(contributionId);
        contributions.push(contribution);
      }
    }
  }
  contributions.sort(compareContributions);

  return {
    ok: true,
    state: deepFreezeValue({
      startupManifestVersion: 1,
      modules,
      contributions,
    }),
  };
}

export function buildRegistryCandidate(
  manifest: DecodedKernelStartupManifest,
  compiledRegistrationEntries: unknown,
): RegistryCandidateResult {
  try {
    return buildRegistryCandidateUnchecked(manifest, compiledRegistrationEntries);
  } catch {
    return startupFailure({ code: "registry.internal-error" });
  }
}
