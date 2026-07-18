import { CORE_COMMAND_DEFINITIONS } from "../commands/catalog";
import { CommandBus } from "../commands/command-bus";
import type { CommandResult } from "../commands/contracts";
import { decodeCoreCommand } from "../commands/strict-codec";
import type { ScoreMetadata } from "../domain/score-document";
import type { EventSubscriptionResult } from "../events/contracts";
import { deepFreezeValue } from "../read/deep-freeze";
import type {
  KernelHistoryState,
  KernelReadState,
  ReadResult,
  ScoreEntityOwnership,
  ScoreRangeSelection,
  SelectedScoreEntity,
} from "../read/contracts";
import {
  CORE_COMPILED_REGISTRATION_ENTRIES,
  type CompiledCommandContribution,
  type CompiledReadStateSelectorContribution,
  type CompiledSelectorContribution,
  type CompiledSnapshotSelectorContribution,
  type CoreCompiledContribution,
  type CoreCompiledRegistrationEntry,
} from "./builtins";
import type {
  CoreSelectorId,
  CoreSelectorRequest,
  CoreSelectorResult,
  KernelGatewayResult,
  KernelCapability,
  KernelRegistryAccessFailure,
  KernelRegistryStartupFailure,
  RegistryContributionSummary,
  RegistrySummary,
} from "./contracts";
import {
  decodeCoreSelectorRequest,
  decodeKernelStartupManifest,
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

export type RegistryCandidateResult =
  | { readonly ok: true; readonly state: RegistryCandidateState }
  | { readonly ok: false; readonly failure: KernelRegistryStartupFailure };

export type KernelRegistryCreationResult =
  | { readonly ok: true; readonly registry: KernelRegistry }
  | { readonly ok: false; readonly failure: KernelRegistryStartupFailure };

export type KernelModuleGatewayCreationResult =
  | { readonly ok: true; readonly gateway: KernelModuleGateway }
  | { readonly ok: false; readonly failure: KernelRegistryAccessFailure };

const REGISTRY_CONSTRUCTION_TOKEN = Symbol("KernelRegistry construction");
const GATEWAY_CONSTRUCTION_TOKEN = Symbol("KernelModuleGateway construction");

interface KernelRegistryState extends RegistryCandidateState {
  readonly summary: RegistrySummary;
}

interface KernelModuleGatewayState {
  readonly module: NormalizedRegistryModule;
  readonly registry: KernelRegistryState;
  readonly commandBus: CommandBus;
}

const REGISTRY_STATES = new WeakMap<KernelRegistry, KernelRegistryState>();
const GATEWAY_STATES = new WeakMap<
  KernelModuleGateway,
  KernelModuleGatewayState
>();

export class KernelRegistry {
  private constructor(
    token: typeof REGISTRY_CONSTRUCTION_TOKEN,
    state: KernelRegistryState,
  ) {
    if (token !== REGISTRY_CONSTRUCTION_TOKEN || state === undefined) {
      throw new TypeError("KernelRegistry cannot be constructed directly");
    }
    REGISTRY_STATES.set(this, state);
    Object.freeze(this);
  }

  createGateway(
    moduleId: string,
    commandBus: CommandBus,
  ): KernelModuleGatewayCreationResult {
    try {
      const state = REGISTRY_STATES.get(this);
      if (
        state === undefined ||
        !isSafeRegistryId(moduleId) ||
        !(commandBus instanceof CommandBus)
      ) {
        return {
          ok: false,
          failure: { code: "registry.invalid-invocation" },
        };
      }
      const module = state.modules.find(
        (candidate) => candidate.moduleId === moduleId,
      );
      if (module === undefined) {
        return {
          ok: false,
          failure: { code: "registry.module-not-found", moduleId },
        };
      }
      return {
        ok: true,
        gateway: constructGateway({ module, registry: state, commandBus }),
      };
    } catch {
      return { ok: false, failure: { code: "registry.internal-error" } };
    }
  }
}

export class KernelModuleGateway {
  private constructor(
    token: typeof GATEWAY_CONSTRUCTION_TOKEN,
    state: KernelModuleGatewayState,
  ) {
    if (token !== GATEWAY_CONSTRUCTION_TOKEN || state === undefined) {
      throw new TypeError("KernelModuleGateway cannot be constructed directly");
    }
    GATEWAY_STATES.set(this, state);
    Object.freeze(this);
  }

  summary(): KernelGatewayResult<RegistrySummary> {
    try {
      const state = GATEWAY_STATES.get(this);
      if (state === undefined) {
        return gatewayRejected({ code: "registry.invalid-invocation" });
      }
      const denied = requireCapabilities(state.module, ["registry:read"]);
      if (denied !== undefined) {
        return gatewayRejected(denied);
      }
      return {
        status: "authorized",
        value: deepFreezeValue(structuredClone(state.registry.summary)),
      };
    } catch {
      return gatewayRejected({ code: "registry.internal-error" });
    }
  }

  read(): KernelGatewayResult<ReadResult<KernelReadState>> {
    try {
      const state = GATEWAY_STATES.get(this);
      if (state === undefined) {
        return gatewayRejected({ code: "registry.invalid-invocation" });
      }
      const denied = requireCapabilities(state.module, ["score:read"]);
      if (denied !== undefined) {
        return gatewayRejected(denied);
      }
      return { status: "authorized", value: state.commandBus.read() };
    } catch {
      return gatewayRejected({ code: "registry.internal-error" });
    }
  }

  submit(input: unknown): KernelGatewayResult<CommandResult> {
    try {
      const state = GATEWAY_STATES.get(this);
      if (state === undefined) {
        return gatewayRejected({ code: "registry.invalid-invocation" });
      }
      const methodDenied = requireCapabilities(state.module, [
        "command:execute",
      ]);
      if (methodDenied !== undefined) {
        return gatewayRejected(methodDenied);
      }
      const decoded = decodeCoreCommand(input);
      if (decoded.ok) {
        const contribution = state.registry.contributions.find(
          ({ descriptor }) => descriptor.id === decoded.value.commandId,
        );
        if (contribution === undefined) {
          return gatewayRejected({
            code: "registry.contribution-not-found",
            contributionId: decoded.value.commandId,
          });
        }
        if (!isCommandContribution(contribution)) {
          return gatewayRejected({
            code: "registry.contribution-kind-mismatch",
            contributionId: decoded.value.commandId,
          });
        }
        const contributionDenied = requireCapabilities(
          state.module,
          contribution.descriptor.requiredCapabilities,
        );
        if (contributionDenied !== undefined) {
          return gatewayRejected(contributionDenied);
        }
      }
      return { status: "authorized", value: state.commandBus.submit(input) };
    } catch {
      return gatewayRejected({ code: "registry.internal-error" });
    }
  }

  undo(): KernelGatewayResult<CommandResult> {
    try {
      const state = GATEWAY_STATES.get(this);
      if (state === undefined) {
        return gatewayRejected({ code: "registry.invalid-invocation" });
      }
      const denied = requireCapabilities(state.module, ["command:execute"]);
      if (denied !== undefined) {
        return gatewayRejected(denied);
      }
      return { status: "authorized", value: state.commandBus.undo() };
    } catch {
      return gatewayRejected({ code: "registry.internal-error" });
    }
  }

  redo(): KernelGatewayResult<CommandResult> {
    try {
      const state = GATEWAY_STATES.get(this);
      if (state === undefined) {
        return gatewayRejected({ code: "registry.invalid-invocation" });
      }
      const denied = requireCapabilities(state.module, ["command:execute"]);
      if (denied !== undefined) {
        return gatewayRejected(denied);
      }
      return { status: "authorized", value: state.commandBus.redo() };
    } catch {
      return gatewayRejected({ code: "registry.internal-error" });
    }
  }

  subscribe(handler: unknown): KernelGatewayResult<EventSubscriptionResult> {
    try {
      const state = GATEWAY_STATES.get(this);
      if (state === undefined) {
        return gatewayRejected({ code: "registry.invalid-invocation" });
      }
      const denied = requireCapabilities(state.module, ["event:subscribe"]);
      if (denied !== undefined) {
        return gatewayRejected(denied);
      }
      return {
        status: "authorized",
        value: state.commandBus.subscribe(handler),
      };
    } catch {
      return gatewayRejected({ code: "registry.internal-error" });
    }
  }

  select(
    input: Extract<
      CoreSelectorRequest,
      { readonly selectorId: "core.selector.score-metadata" }
    >,
  ): KernelGatewayResult<ReadResult<ScoreMetadata>>;
  select(
    input: Extract<
      CoreSelectorRequest,
      { readonly selectorId: "core.selector.score-entity" }
    >,
  ): KernelGatewayResult<ReadResult<SelectedScoreEntity>>;
  select(
    input: Extract<
      CoreSelectorRequest,
      { readonly selectorId: "core.selector.score-entity-ownership" }
    >,
  ): KernelGatewayResult<ReadResult<ScoreEntityOwnership>>;
  select(
    input: Extract<
      CoreSelectorRequest,
      { readonly selectorId: "core.selector.score-range" }
    >,
  ): KernelGatewayResult<ReadResult<ScoreRangeSelection>>;
  select(
    input: Extract<
      CoreSelectorRequest,
      { readonly selectorId: "core.selector.history-state" }
    >,
  ): KernelGatewayResult<ReadResult<KernelHistoryState>>;
  select(
    input: Extract<
      CoreSelectorRequest,
      { readonly selectorId: "core.selector.dirty-state" }
    >,
  ): KernelGatewayResult<ReadResult<boolean>>;
  select(input: unknown): KernelGatewayResult<CoreSelectorResult>;
  select(input: unknown): KernelGatewayResult<CoreSelectorResult> {
    try {
      const state = GATEWAY_STATES.get(this);
      if (state === undefined) {
        return gatewayRejected({ code: "registry.invalid-invocation" });
      }
      const methodDenied = requireCapabilities(state.module, [
        "score:read",
        "selector:execute",
      ]);
      if (methodDenied !== undefined) {
        return gatewayRejected(methodDenied);
      }
      const request = decodeCoreSelectorRequest(input);
      if (request === undefined) {
        return gatewayRejected({ code: "registry.invalid-invocation" });
      }
      const contribution = state.registry.contributions.find(
        ({ descriptor }) => descriptor.id === request.selectorId,
      );
      if (contribution === undefined) {
        return gatewayRejected({
          code: "registry.contribution-not-found",
          contributionId: request.selectorId,
        });
      }
      if (!isSelectorContribution(contribution)) {
        return gatewayRejected({
          code: "registry.contribution-kind-mismatch",
          contributionId: request.selectorId,
        });
      }
      const contributionDenied = requireCapabilities(
        state.module,
        contribution.descriptor.requiredCapabilities,
      );
      if (contributionDenied !== undefined) {
        return gatewayRejected(contributionDenied);
      }
      const read = state.commandBus.read();
      if (!read.ok) {
        return { status: "authorized", value: read };
      }
      return {
        status: "authorized",
        value:
          contribution.inputKind === "snapshot"
            ? contribution.selector(read.value.snapshot, request)
            : contribution.selector(read.value, request),
      };
    } catch {
      return gatewayRejected({ code: "registry.internal-error" });
    }
  }
}

function isCommandContribution(
  contribution: CoreCompiledContribution,
): contribution is CompiledCommandContribution {
  return contribution.descriptor.kind === "command";
}

function isSelectorContribution(
  contribution: CoreCompiledContribution,
): contribution is CompiledSelectorContribution {
  return contribution.descriptor.kind === "selector";
}

function gatewayRejected<T>(
  failure: KernelRegistryAccessFailure,
): KernelGatewayResult<T> {
  return { status: "rejected", failure };
}

function requireCapabilities(
  module: NormalizedRegistryModule,
  required: readonly KernelCapability[],
): KernelRegistryAccessFailure | undefined {
  for (const capability of required) {
    if (!module.capabilities.includes(capability)) {
      return {
        code: "registry.capability-denied",
        moduleId: module.moduleId,
        capability,
      };
    }
  }
  return undefined;
}

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
  const canonicalDefinition = CORE_COMMAND_DEFINITIONS.find(
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

function createRegistryState(
  candidate: RegistryCandidateState,
): KernelRegistryState {
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
  compiledRegistrationEntries: unknown = CORE_COMPILED_REGISTRATION_ENTRIES,
): RegistryCandidateResult {
  try {
    return buildRegistryCandidateUnchecked(manifest, compiledRegistrationEntries);
  } catch {
    return startupFailure({ code: "registry.internal-error" });
  }
}

function constructRegistry(state: RegistryCandidateState): KernelRegistry {
  return Reflect.construct(KernelRegistry, [
    REGISTRY_CONSTRUCTION_TOKEN,
    createRegistryState(state),
  ]) as KernelRegistry;
}

function constructGateway(state: KernelModuleGatewayState): KernelModuleGateway {
  return Reflect.construct(KernelModuleGateway, [
    GATEWAY_CONSTRUCTION_TOKEN,
    state,
  ]) as KernelModuleGateway;
}

export function createKernelRegistry(
  manifest: unknown,
): KernelRegistryCreationResult {
  try {
    const decoded = decodeKernelStartupManifest(manifest);
    if (!decoded.ok) {
      return decoded;
    }
    const candidate = buildRegistryCandidate(
      decoded.value,
      CORE_COMPILED_REGISTRATION_ENTRIES,
    );
    return candidate.ok
      ? { ok: true, registry: constructRegistry(candidate.state) }
      : candidate;
  } catch {
    return { ok: false, failure: { code: "registry.internal-error" } };
  }
}

export { decodeKernelStartupManifest } from "./strict-codec";
