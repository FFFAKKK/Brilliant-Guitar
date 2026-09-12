import { CORE_COMPILED_REGISTRATION_ENTRIES } from "./builtins";
import { bindContributionReads, captureContributionReads } from "./contribution-reads";
import {
  buildRegistryCandidate,
  createRegistryAssemblyState,
  type NormalizedRegistryModule,
  type RegistryAssemblyState,
} from "./assembly";
import type {
  KernelCapability,
  KernelRegistryStartupFailure,
} from "./contracts";
import {
  captureDomainCommandDescriptorV1,
  captureDomainContributionV1,
  captureDomainRegistrationEntryV1,
  captureExtensionRuntimeRequirementV1,
  captureModuleEffectDescriptorV1,
  hasSameNumberValues,
  normalizeCapturedDomainCommandDescriptorV1,
  normalizeCapturedExtensionRuntimeRequirementV1,
  normalizeCapturedModuleEffectDescriptorV1,
  type CapturedDomainCommandDescriptorV1,
  type CapturedDomainContributionV1,
  type CapturedDomainRegistrationEntryV1,
  type CapturedExtensionRuntimeRequirementV1,
  type CapturedModuleEffectDescriptorV1,
} from "./domain-catalog-codec";
import {
  decodeKernelStartupManifest,
  isSafeRegistryId,
  readDenseArray,
  type DecodedKernelStartupModuleDeclaration,
} from "./strict-codec";
import {
  getDomainCommandDefinitionBinding,
  getModuleEffectDefinitionBinding,
  isPermittedOfficialModuleCallback,
} from "../module-sdk/definitions";
import {
  OFFICIAL_MODULE_SDK_V1_LIMITS,
  type CompiledDomainCommandContributionV1,
  type CompiledDomainCommandDefinitionV1,
  type CompiledModuleEffectDefinitionV1,
  type OfficialModuleCatalogCompilationResultV1,
} from "../module-sdk/contracts";
import {
  kernelIntegratedCatalogBrand,
  type ExtensionRuntimeRequirementV1,
  type KernelIntegratedCatalog,
} from "./integrated-contracts";

const DOMAIN_ENTRY_ID = "kernel.domain-commands.v1" as const;
const REQUIRED_DOMAIN_CAPABILITIES = Object.freeze([
  "command:register",
  "command:execute",
  "score:read",
  "event:subscribe",
] as const);

export interface NormalizedOfficialDomainModuleV1 extends NormalizedRegistryModule {
  readonly registrationEntryIds: readonly [typeof DOMAIN_ENTRY_ID];
}

export interface KernelIntegratedCatalogState {
  readonly catalogVersion: 1;
  readonly coreAssembly: RegistryAssemblyState;
  readonly modules: readonly NormalizedOfficialDomainModuleV1[];
  readonly contributions: readonly CompiledDomainCommandContributionV1[];
  readonly commandIndex: Readonly<
    Record<string, CompiledDomainCommandDefinitionV1>
  >;
  readonly effectIndex: Readonly<
    Record<string, CompiledModuleEffectDefinitionV1>
  >;
  readonly namespaceIndex: Readonly<
    Record<string, CompiledDomainCommandContributionV1>
  >;
  readonly assemblyIdentity: object;
}

interface CapturedEntry {
  readonly raw: unknown;
  readonly captured: CapturedDomainRegistrationEntryV1;
}

const reflectApply = Reflect.apply;
const reflectGetOwnPropertyDescriptor = Reflect.getOwnPropertyDescriptor;
const reflectOwnKeys = Reflect.ownKeys;
const objectCreate = Object.create;
const objectDefineProperty = Object.defineProperty;
const objectFreeze = Object.freeze;
const arraySlice = Array.prototype.slice;
const arraySort = Array.prototype.sort;
const stringStartsWith = String.prototype.startsWith;
const setConstructor = Set;
const setAdd = setConstructor.prototype.add;
const setHas = setConstructor.prototype.has;
const mapConstructor = Map;
const mapGet = mapConstructor.prototype.get;
const mapHas = mapConstructor.prototype.has;
const mapSet = mapConstructor.prototype.set;
const weakMapGet = WeakMap.prototype.get;
const weakMapSet = WeakMap.prototype.set;
const weakSetConstructor = WeakSet;
const weakSetAdd = weakSetConstructor.prototype.add;
const weakSetHas = weakSetConstructor.prototype.has;

const catalogStates = new WeakMap<
  KernelIntegratedCatalog,
  KernelIntegratedCatalogState
>();

function failure(
  value: KernelRegistryStartupFailure,
): OfficialModuleCatalogCompilationResultV1 {
  return objectFreeze({ ok: false, failure: freezeCatalogData(value) });
}

function invalidStartup(): OfficialModuleCatalogCompilationResultV1 {
  return failure({ code: "registry.invalid-startup-input" });
}

function invalidContribution(): OfficialModuleCatalogCompilationResultV1 {
  return failure({
    code: "registry.invalid-contribution",
    registrationEntryId: DOMAIN_ENTRY_ID,
  });
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function freezeCatalogData<T>(value: T): T {
  const seen = new weakSetConstructor<object>();
  function freeze(current: unknown): void {
    if (
      current === null ||
      typeof current !== "object" ||
      reflectApply(weakSetHas, seen, [current]) === true
    ) {
      return;
    }
    reflectApply(weakSetAdd, seen, [current]);
    const keys = reflectOwnKeys(current);
    for (let index = 0; index < keys.length; index += 1) {
      const key = keys[index];
      if (key === undefined) {
        continue;
      }
      const descriptor = reflectGetOwnPropertyDescriptor(current, key);
      if (descriptor !== undefined && "value" in descriptor) {
        freeze(descriptor.value);
      }
    }
    reflectApply(objectFreeze, Object, [current]);
  }
  freeze(value);
  return value;
}

function sortedCopy<T>(
  values: readonly T[],
  compare: (left: T, right: T) => number,
): T[] {
  const copy = reflectApply(arraySlice, values, []) as T[];
  reflectApply(arraySort, copy, [compare]);
  return copy;
}

function setContains<T>(values: Set<T>, value: T): boolean {
  return reflectApply(setHas, values, [value]) === true;
}

function addSetValue<T>(values: Set<T>, value: T): void {
  reflectApply(setAdd, values, [value]);
}

function mapContains<Key, Value>(values: Map<Key, Value>, key: Key): boolean {
  return reflectApply(mapHas, values, [key]) === true;
}

function readMapValue<Key, Value>(
  values: Map<Key, Value>,
  key: Key,
): Value | undefined {
  return reflectApply(mapGet, values, [key]) as Value | undefined;
}

function writeMapValue<Key, Value>(
  values: Map<Key, Value>,
  key: Key,
  value: Value,
): void {
  reflectApply(mapSet, values, [key, value]);
}

function includesText(values: readonly string[], expected: string): boolean {
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] === expected) {
      return true;
    }
  }
  return false;
}

function startsWithText(value: string, prefix: string): boolean {
  return reflectApply(stringStartsWith, value, [prefix]) === true;
}

function hasNamespacePrefix(
  namespaces: readonly string[],
  identifier: string,
): boolean {
  for (let index = 0; index < namespaces.length; index += 1) {
    const namespace = namespaces[index];
    if (
      namespace !== undefined &&
      startsWithText(identifier, `${namespace}.`)
    ) {
      return true;
    }
  }
  return false;
}

function sameStrings(
  actual: readonly string[],
  expected: readonly string[],
): boolean {
  if (actual.length !== expected.length) {
    return false;
  }
  for (let index = 0; index < actual.length; index += 1) {
    if (actual[index] !== expected[index]) {
      return false;
    }
  }
  return true;
}

function validateExactCoreModule(
  module: DecodedKernelStartupModuleDeclaration,
): boolean {
  if (module.moduleId === "core.commands") {
    return module.origin === "official" &&
      module.runtime === "builtin" &&
      module.trustLevel === "system-trusted" &&
      module.apiVersion === 1 &&
      sameStrings(module.capabilities, ["command:register"]) &&
      sameStrings(module.registrationEntryIds, ["core.commands.v1"]);
  }
  if (module.moduleId === "core.selectors") {
    return module.origin === "official" &&
      module.runtime === "builtin" &&
      module.trustLevel === "system-trusted" &&
      module.apiVersion === 1 &&
      sameStrings(module.capabilities, ["selector:register"]) &&
      sameStrings(module.registrationEntryIds, ["core.selectors.v1"]);
  }
  return false;
}

function captureRegistrationEntries(
  input: unknown,
): readonly CapturedEntry[] | undefined {
  const values = readDenseArray(input);
  if (values === undefined) {
    return undefined;
  }
  const entries: CapturedEntry[] = [];
  for (let index = 0; index < values.length; index += 1) {
    const raw = values[index];
    const captured = captureDomainRegistrationEntryV1(raw);
    if (captured === undefined) {
      return undefined;
    }
    entries[entries.length] = { raw, captured };
  }
  return entries;
}

function firstContributionModuleId(
  entry: CapturedDomainRegistrationEntryV1,
): string | undefined {
  const first = entry.contributions[0];
  const contribution = captureDomainContributionV1(first);
  return isSafeRegistryId(contribution?.moduleId)
    ? contribution.moduleId
    : undefined;
}

function hasExactEntry(
  entries: readonly CapturedEntry[],
  moduleId: string,
): boolean {
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index]?.captured;
    if (
      entry?.registrationEntryId === DOMAIN_ENTRY_ID &&
      entry.ownerModuleId === moduleId
    ) {
      return true;
    }
  }
  return false;
}

function canParticipateInEntrySelection(
  entry: CapturedDomainRegistrationEntryV1,
  moduleId: string,
  exactEntryExists: boolean,
): boolean {
  if (entry.registrationEntryId !== DOMAIN_ENTRY_ID) {
    return false;
  }
  return exactEntryExists
    ? entry.ownerModuleId === moduleId
    : firstContributionModuleId(entry) === moduleId;
}

function selectEntry(
  entries: readonly CapturedEntry[],
  moduleId: string,
):
  | { readonly ok: true; readonly value: CapturedEntry }
  | { readonly ok: false; readonly failure: KernelRegistryStartupFailure } {
  const exact: CapturedEntry[] = [];
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (
      entry !== undefined &&
      entry.captured.registrationEntryId === DOMAIN_ENTRY_ID &&
      entry.captured.ownerModuleId === moduleId
    ) {
      exact[exact.length] = entry;
    }
  }
  if (exact.length === 1 && exact[0] !== undefined) {
    return { ok: true, value: exact[0] };
  }
  if (exact.length > 1) {
    return {
      ok: false,
      failure: {
        code: "registry.invalid-contribution",
        registrationEntryId: DOMAIN_ENTRY_ID,
      },
    };
  }
  let wrongOwner: CapturedEntry | undefined;
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (
      entry !== undefined &&
      entry.captured.registrationEntryId === DOMAIN_ENTRY_ID &&
      firstContributionModuleId(entry.captured) === moduleId
    ) {
      wrongOwner = entry;
      break;
    }
  }
  return wrongOwner === undefined
    ? {
        ok: false,
        failure: {
          code: "registry.registration-entry-not-found",
          registrationEntryId: DOMAIN_ENTRY_ID,
        },
      }
    : {
        ok: false,
        failure: {
          code: "registry.registration-owner-mismatch",
          registrationEntryId: DOMAIN_ENTRY_ID,
          moduleId,
        },
      };
}

function normalizeDomainIdentity(
  module: DecodedKernelStartupModuleDeclaration,
):
  | { readonly ok: true; readonly value: NormalizedOfficialDomainModuleV1 }
  | { readonly ok: false; readonly failure: KernelRegistryStartupFailure } {
  if (module.origin !== "official") {
    return {
      ok: false,
      failure: { code: "registry.unsupported-origin", moduleId: module.moduleId },
    };
  }
  if (
    module.runtime !== "builtin" &&
    module.runtime !== "internal-module"
  ) {
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
  for (let index = 0; index < REQUIRED_DOMAIN_CAPABILITIES.length; index += 1) {
    const capability = REQUIRED_DOMAIN_CAPABILITIES[index];
    if (capability === undefined) {
      continue;
    }
    if (!includesText(module.capabilities, capability)) {
      return {
        ok: false,
        failure: {
          code: "registry.capability-denied",
          moduleId: module.moduleId,
          capability,
        },
      };
    }
  }
  return {
    ok: true,
    value: {
      moduleId: module.moduleId,
      origin: "official",
      runtime: module.runtime,
      trustLevel: "system-trusted",
      apiVersion: 1,
      capabilities: reflectApply(arraySlice, module.capabilities, []) as KernelCapability[],
      registrationEntryIds: [DOMAIN_ENTRY_ID],
    },
  };
}

function readDefinitionDescriptor(
  value: unknown,
): unknown | undefined {
  try {
    if (typeof value !== "object" || value === null) {
      return undefined;
    }
    const ownKeys = reflectOwnKeys(value);
    for (let index = 0; index < ownKeys.length; index += 1) {
      const key = ownKeys[index];
      if (typeof key === "string" && key !== "descriptor") {
        return undefined;
      }
    }
    const descriptor = reflectGetOwnPropertyDescriptor(value, "descriptor");
    return descriptor !== undefined &&
      "value" in descriptor &&
      descriptor.enumerable
      ? descriptor.value
      : undefined;
  } catch {
    return undefined;
  }
}

interface StagedCommandCandidate {
  readonly raw: unknown;
  readonly descriptor: CapturedDomainCommandDescriptorV1;
}

interface StagedEffectCandidate {
  readonly raw: unknown;
  readonly descriptor: CapturedModuleEffectDescriptorV1;
}

interface StagedContributionCandidate {
  readonly expectedModuleId: string;
  readonly moduleId: string;
  readonly contributionId: string;
  readonly captured: CapturedDomainContributionV1;
  readonly namespaces: string[];
  readonly commands: StagedCommandCandidate[];
  readonly requirements: CapturedExtensionRuntimeRequirementV1[];
  readonly effects: StagedEffectCandidate[];
  readonly normalizedCommands: CompiledDomainCommandDefinitionV1[];
  readonly normalizedRequirements: ExtensionRuntimeRequirementV1[];
  readonly requirementByNamespace: Map<string, ExtensionRuntimeRequirementV1>;
  readonly normalizedEffects: CompiledModuleEffectDefinitionV1[];
}

interface StagedCommandReference {
  readonly contribution: StagedContributionCandidate;
  readonly command: StagedCommandCandidate;
}

interface StagedEffectReference {
  readonly contribution: StagedContributionCandidate;
  readonly effect: StagedEffectCandidate;
}

interface StagedRequirementReference {
  readonly contribution: StagedContributionCandidate;
  readonly requirement: CapturedExtensionRuntimeRequirementV1;
}

interface StagedNamespaceReference {
  readonly contribution: StagedContributionCandidate;
  readonly namespace: string;
}

function invalidContributionFailure(): KernelRegistryStartupFailure {
  return {
    code: "registry.invalid-contribution",
    registrationEntryId: DOMAIN_ENTRY_ID,
  };
}

function captureStagedContribution(
  input: unknown,
  expectedModuleId: string,
): StagedContributionCandidate | undefined {
  const captured = captureDomainContributionV1(input);
  if (
    captured?.apiVersion !== 1 ||
    !isSafeRegistryId(captured.moduleId) ||
    !isSafeRegistryId(captured.contributionId) ||
    captured.extensionNamespaces.length === 0
  ) {
    return undefined;
  }

  const namespaces: string[] = [];
  for (let index = 0; index < captured.extensionNamespaces.length; index += 1) {
    const namespace = captured.extensionNamespaces[index];
    if (!isSafeRegistryId(namespace)) {
      return undefined;
    }
    namespaces[namespaces.length] = namespace;
  }
  reflectApply(arraySort, namespaces, [compareText]);

  const commands: StagedCommandCandidate[] = [];
  for (let index = 0; index < captured.commands.length; index += 1) {
    const raw = captured.commands[index];
    const descriptor = captureDomainCommandDescriptorV1(
      readDefinitionDescriptor(raw),
    );
    if (descriptor === undefined) {
      return undefined;
    }
    commands[commands.length] = { raw, descriptor };
  }

  const requirements: CapturedExtensionRuntimeRequirementV1[] = [];
  for (let index = 0; index < captured.extensionRequirements.length; index += 1) {
    const requirement = captureExtensionRuntimeRequirementV1(
      captured.extensionRequirements[index],
    );
    if (requirement === undefined) {
      return undefined;
    }
    requirements[requirements.length] = requirement;
  }

  const effects: StagedEffectCandidate[] = [];
  for (let index = 0; index < captured.effects.length; index += 1) {
    const raw = captured.effects[index];
    const descriptor = captureModuleEffectDescriptorV1(
      readDefinitionDescriptor(raw),
    );
    if (descriptor === undefined) {
      return undefined;
    }
    effects[effects.length] = { raw, descriptor };
  }

  return {
    expectedModuleId,
    moduleId: captured.moduleId,
    contributionId: captured.contributionId,
    captured,
    namespaces,
    commands,
    requirements,
    effects,
    normalizedCommands: [],
    normalizedRequirements: [],
    requirementByNamespace: new mapConstructor<string, ExtensionRuntimeRequirementV1>(),
    normalizedEffects: [],
  };
}

function compareStagedContributions(
  left: StagedContributionCandidate,
  right: StagedContributionCandidate,
): number {
  const moduleComparison = compareText(
    left.moduleId,
    right.moduleId,
  );
  return moduleComparison !== 0
    ? moduleComparison
    : compareText(left.contributionId, right.contributionId);
}

function buildCatalogState(
  coreModules: readonly DecodedKernelStartupModuleDeclaration[],
  domainModules: readonly DecodedKernelStartupModuleDeclaration[],
  entries: readonly CapturedEntry[],
):
  | { readonly ok: true; readonly state: KernelIntegratedCatalogState }
  | { readonly ok: false; readonly failure: KernelRegistryStartupFailure } {
  // Stage 1: capture every entry that the manifest could select, including all
  // nested descriptor shapes, before reporting any identity or policy failure.
  const stagedContributions: StagedContributionCandidate[] = [];
  for (let index = 0; index < domainModules.length; index += 1) {
    const module = domainModules[index];
    if (module === undefined) {
      continue;
    }
    const exactEntryExists = hasExactEntry(entries, module.moduleId);
    for (let entryIndex = 0; entryIndex < entries.length; entryIndex += 1) {
      const entry = entries[entryIndex]?.captured;
      if (
        entry === undefined ||
        !canParticipateInEntrySelection(
          entry,
          module.moduleId,
          exactEntryExists,
        )
      ) {
        continue;
      }
      if (entry.kind !== "domain-command") {
        return { ok: false, failure: invalidContributionFailure() };
      }
      for (
        let contributionIndex = 0;
        contributionIndex < entry.contributions.length;
        contributionIndex += 1
      ) {
        const staged = captureStagedContribution(
          entry.contributions[contributionIndex],
          module.moduleId,
        );
        if (staged === undefined) {
          return { ok: false, failure: invalidContributionFailure() };
        }
        stagedContributions[stagedContributions.length] = staged;
      }
    }
  }
  if (
    stagedContributions.length > OFFICIAL_MODULE_SDK_V1_LIMITS.contributions
  ) {
    return { ok: false, failure: { code: "registry.invalid-startup-input" } };
  }
  // Stage 2: resolve every manifest-to-entry association before validating any
  // module origin, runtime, trust, API, or capability policy.
  if (coreModules.length !== 2) {
    return {
      ok: false,
      failure: { code: "registry.invalid-startup-input" },
    };
  }
  const stageTwoModules: DecodedKernelStartupModuleDeclaration[] = [];
  for (let index = 0; index < coreModules.length; index += 1) {
    const module = coreModules[index];
    if (module !== undefined) {
      stageTwoModules[stageTwoModules.length] = module;
    }
  }
  for (let index = 0; index < domainModules.length; index += 1) {
    const module = domainModules[index];
    if (module !== undefined) {
      stageTwoModules[stageTwoModules.length] = module;
    }
  }
  reflectApply(arraySort, stageTwoModules, [
    (
      left: DecodedKernelStartupModuleDeclaration,
      right: DecodedKernelStartupModuleDeclaration,
    ) => compareText(left.moduleId, right.moduleId),
  ]);
  for (let index = 0; index < stageTwoModules.length; index += 1) {
    const module = stageTwoModules[index];
    if (module === undefined) {
      continue;
    }
    if (
      module.moduleId === "core.commands" ||
      module.moduleId === "core.selectors"
    ) {
      if (!validateExactCoreModule(module)) {
        return {
          ok: false,
          failure: { code: "registry.invalid-startup-input" },
        };
      }
      continue;
    }
    if (
      module.registrationEntryIds.length !== 1 ||
      module.registrationEntryIds[0] !== DOMAIN_ENTRY_ID
    ) {
      return {
        ok: false,
        failure: { code: "registry.invalid-startup-input" },
      };
    }
    const selected = selectEntry(entries, module.moduleId);
    if (!selected.ok) {
      return selected;
    }
  }

  reflectApply(arraySort, stagedContributions, [compareStagedContributions]);
  for (let index = 0; index < stagedContributions.length; index += 1) {
    const contribution = stagedContributions[index];
    if (
      contribution === undefined ||
      contribution.moduleId !== contribution.expectedModuleId
    ) {
      return { ok: false, failure: invalidContributionFailure() };
    }
  }

  // Stage 3: module policy is a complete global pass.
  const normalizedModules: NormalizedOfficialDomainModuleV1[] = [];
  for (let index = 0; index < domainModules.length; index += 1) {
    const module = domainModules[index];
    if (module === undefined) {
      continue;
    }
    const normalized = normalizeDomainIdentity(module);
    if (!normalized.ok) {
      return normalized;
    }
    normalizedModules[normalizedModules.length] = normalized.value;
  }

  // Stage 4: all uniqueness and aggregate-limit checks complete before any
  // command, Requirement, or effect semantic/binding validation begins.
  const seenModuleIds = new setConstructor<string>();
  const allModules: DecodedKernelStartupModuleDeclaration[] = [];
  for (let index = 0; index < coreModules.length; index += 1) {
    const module = coreModules[index];
    if (module !== undefined) {
      allModules[allModules.length] = module;
    }
  }
  for (let index = 0; index < domainModules.length; index += 1) {
    const module = domainModules[index];
    if (module !== undefined) {
      allModules[allModules.length] = module;
    }
  }
  for (let index = 0; index < allModules.length; index += 1) {
    const module = allModules[index];
    if (module === undefined) {
      continue;
    }
    if (setContains(seenModuleIds, module.moduleId)) {
      return {
        ok: false,
        failure: { code: "registry.duplicate-module-id", moduleId: module.moduleId },
      };
    }
    addSetValue(seenModuleIds, module.moduleId);
  }

  const contributionIds = new setConstructor<string>();
  const commandIds = new setConstructor<string>();
  const effectKinds = new setConstructor<string>();
  const namespaces = new setConstructor<string>();
  const commandReferences: StagedCommandReference[] = [];
  const effectReferences: StagedEffectReference[] = [];
  const namespaceReferences: StagedNamespaceReference[] = [];
  const requirementReferences: StagedRequirementReference[] = [];

  for (let index = 0; index < stagedContributions.length; index += 1) {
    const contribution = stagedContributions[index];
    if (contribution === undefined) {
      continue;
    }
    const contributionId = contribution.contributionId;
    if (setContains(contributionIds, contributionId)) {
      return {
        ok: false,
        failure: {
          code: "registry.duplicate-contribution-id",
          contributionId,
        },
      };
    }
    addSetValue(contributionIds, contributionId);
    for (let position = 0; position < contribution.commands.length; position += 1) {
      const command = contribution.commands[position];
      if (command !== undefined) {
        commandReferences[commandReferences.length] = { contribution, command };
      }
    }
    for (let position = 0; position < contribution.effects.length; position += 1) {
      const effect = contribution.effects[position];
      if (effect !== undefined) {
        effectReferences[effectReferences.length] = { contribution, effect };
      }
    }
    for (let position = 0; position < contribution.namespaces.length; position += 1) {
      const namespace = contribution.namespaces[position];
      if (namespace !== undefined) {
        namespaceReferences[namespaceReferences.length] = {
          contribution,
          namespace,
        };
      }
    }
    for (let position = 0; position < contribution.requirements.length; position += 1) {
      const requirement = contribution.requirements[position];
      if (requirement !== undefined) {
        requirementReferences[requirementReferences.length] = {
          contribution,
          requirement,
        };
      }
    }
  }

  reflectApply(arraySort, commandReferences, [
    (left: StagedCommandReference, right: StagedCommandReference) =>
      compareText(left.command.descriptor.commandId, right.command.descriptor.commandId),
  ]);
  // Stage 5: command semantics and authentic private bindings.
  for (let index = 0; index < commandReferences.length; index += 1) {
    const commandId = commandReferences[index]?.command.descriptor.commandId;
    if (commandId === undefined) {
      continue;
    }
    if (setContains(commandIds, commandId)) {
      return { ok: false, failure: invalidContributionFailure() };
    }
    addSetValue(commandIds, commandId);
    if (index + 1 > OFFICIAL_MODULE_SDK_V1_LIMITS.commands) {
      return { ok: false, failure: invalidContributionFailure() };
    }
  }

  reflectApply(arraySort, effectReferences, [
    (left: StagedEffectReference, right: StagedEffectReference) =>
      compareText(left.effect.descriptor.effectKind, right.effect.descriptor.effectKind),
  ]);
  for (let index = 0; index < effectReferences.length; index += 1) {
    const effectKind = effectReferences[index]?.effect.descriptor.effectKind;
    if (effectKind === undefined) {
      continue;
    }
    if (setContains(effectKinds, effectKind)) {
      return { ok: false, failure: invalidContributionFailure() };
    }
    addSetValue(effectKinds, effectKind);
    if (index + 1 > OFFICIAL_MODULE_SDK_V1_LIMITS.effects) {
      return { ok: false, failure: invalidContributionFailure() };
    }
  }

  reflectApply(arraySort, namespaceReferences, [
    (left: StagedNamespaceReference, right: StagedNamespaceReference) =>
      compareText(left.namespace, right.namespace),
  ]);
  for (let index = 0; index < namespaceReferences.length; index += 1) {
    const namespace = namespaceReferences[index]?.namespace;
    if (namespace === undefined) {
      continue;
    }
    if (setContains(namespaces, namespace)) {
      return { ok: false, failure: invalidContributionFailure() };
    }
    addSetValue(namespaces, namespace);
    if (index + 1 > OFFICIAL_MODULE_SDK_V1_LIMITS.extensionNamespaces) {
      return { ok: false, failure: invalidContributionFailure() };
    }
  }

  for (let index = 0; index < commandReferences.length; index += 1) {
    const reference = commandReferences[index];
    if (reference === undefined) {
      continue;
    }
    const descriptor = normalizeCapturedDomainCommandDescriptorV1(
      reference.command.descriptor,
    );
    if (descriptor === undefined) {
      return { ok: false, failure: invalidContributionFailure() };
    }
    if (getDomainCommandDefinitionBinding(reference.command.raw) === undefined) {
      return {
        ok: false,
        failure: {
          code: "registry.handler-mismatch",
          contributionId: reference.contribution.contributionId,
        },
      };
    }
    if (
      descriptor.source.moduleId !== reference.contribution.moduleId ||
      descriptor.source.contributionId !==
        reference.contribution.contributionId ||
      !hasNamespacePrefix(reference.contribution.namespaces, descriptor.commandId)
    ) {
      return { ok: false, failure: invalidContributionFailure() };
    }
    reference.contribution.normalizedCommands[
      reference.contribution.normalizedCommands.length
    ] = reference.command.raw as CompiledDomainCommandDefinitionV1;
  }

  // Stage 6: Requirement identity, one-to-one coverage, and version lists.
  reflectApply(arraySort, requirementReferences, [
    (left: StagedRequirementReference, right: StagedRequirementReference) => {
      const namespaceComparison = compareText(
        left.requirement.namespace,
        right.requirement.namespace,
      );
      if (namespaceComparison !== 0) {
        return namespaceComparison;
      }
      const moduleComparison = compareText(
        left.requirement.moduleId,
        right.requirement.moduleId,
      );
      return moduleComparison !== 0
        ? moduleComparison
        : compareText(
            left.requirement.contributionId,
            right.requirement.contributionId,
          );
    },
  ]);
  for (let index = 0; index < requirementReferences.length; index += 1) {
    const reference = requirementReferences[index];
    if (reference === undefined) {
      continue;
    }
    const requirement = normalizeCapturedExtensionRuntimeRequirementV1(
      reference.requirement,
    );
    const contribution = reference.contribution;
    if (
      requirement === undefined ||
      requirement.moduleId !== contribution.moduleId ||
      requirement.contributionId !== contribution.contributionId ||
      !includesText(contribution.namespaces, requirement.namespace) ||
      mapContains(contribution.requirementByNamespace, requirement.namespace)
    ) {
      return { ok: false, failure: invalidContributionFailure() };
    }
    writeMapValue(
      contribution.requirementByNamespace,
      requirement.namespace,
      requirement,
    );
    contribution.normalizedRequirements[
      contribution.normalizedRequirements.length
    ] = requirement;
  }
  for (let index = 0; index < stagedContributions.length; index += 1) {
    const contribution = stagedContributions[index];
    if (
      contribution === undefined ||
      contribution.normalizedRequirements.length !== contribution.namespaces.length
    ) {
      return { ok: false, failure: invalidContributionFailure() };
    }
  }

  // Stage 7: effect semantics, Requirement parity, and authentic bindings.
  for (let index = 0; index < effectReferences.length; index += 1) {
    const reference = effectReferences[index];
    if (reference === undefined) {
      continue;
    }
    const descriptor = normalizeCapturedModuleEffectDescriptorV1(
      reference.effect.descriptor,
    );
    const contribution = reference.contribution;
    if (descriptor === undefined) {
      return { ok: false, failure: invalidContributionFailure() };
    }
    if (getModuleEffectDefinitionBinding(reference.effect.raw) === undefined) {
      return {
        ok: false,
        failure: {
          code: "registry.handler-mismatch",
          contributionId: contribution.contributionId,
        },
      };
    }
    const requirement = readMapValue(
      contribution.requirementByNamespace,
      descriptor.namespace,
    );
    if (
      descriptor.source.moduleId !== contribution.moduleId ||
      descriptor.source.contributionId !== contribution.contributionId ||
      requirement === undefined ||
      !hasSameNumberValues(
        descriptor.supportedSchemaVersions,
        requirement.supportedSchemaVersions,
      )
    ) {
      return { ok: false, failure: invalidContributionFailure() };
    }
    contribution.normalizedEffects[
      contribution.normalizedEffects.length
    ] = reference.effect.raw as CompiledModuleEffectDefinitionV1;
  }

  // Stage 8: callback-slot policy and final immutable publication data.
  const contributions: CompiledDomainCommandContributionV1[] = [];
  for (let index = 0; index < stagedContributions.length; index += 1) {
    const staged = stagedContributions[index];
    if (staged === undefined) {
      continue;
    }
    if (
      !isPermittedOfficialModuleCallback(staged.captured.validate) ||
      !isPermittedOfficialModuleCallback(staged.captured.classify)
    ) {
      return { ok: false, failure: invalidContributionFailure() };
    }
    contributions[contributions.length] = freezeCatalogData({
      apiVersion: 1,
      moduleId: staged.moduleId,
      contributionId: staged.contributionId,
      extensionNamespaces: staged.namespaces,
      extensionRequirements: staged.normalizedRequirements,
      commands: staged.normalizedCommands,
      validate: staged.captured.validate,
      classify: staged.captured.classify,
      effects: staged.normalizedEffects,
    } as CompiledDomainCommandContributionV1);
  }

  const coreCandidate = buildRegistryCandidate(
    { startupManifestVersion: 1, modules: coreModules },
    CORE_COMPILED_REGISTRATION_ENTRIES,
  );
  if (!coreCandidate.ok) {
    return coreCandidate;
  }

  reflectApply(arraySort, normalizedModules, [
    (left: NormalizedOfficialDomainModuleV1, right: NormalizedOfficialDomainModuleV1) =>
      compareText(left.moduleId, right.moduleId),
  ]);

  const commandIndex = objectCreate(null) as Record<string, CompiledDomainCommandDefinitionV1>;
  const effectIndex = objectCreate(null) as Record<string, CompiledModuleEffectDefinitionV1>;
  const namespaceIndex = objectCreate(null) as Record<string, CompiledDomainCommandContributionV1>;
  for (let contributionIndex = 0; contributionIndex < contributions.length; contributionIndex += 1) {
    const contribution = contributions[contributionIndex];
    if (contribution === undefined) {
      continue;
    }
    for (let commandPosition = 0; commandPosition < contribution.commands.length; commandPosition += 1) {
      const command = contribution.commands[commandPosition];
      if (command === undefined) {
        continue;
      }
      commandIndex[command.descriptor.commandId] = command;
    }
    for (let effectPosition = 0; effectPosition < contribution.effects.length; effectPosition += 1) {
      const effect = contribution.effects[effectPosition];
      if (effect === undefined) {
        continue;
      }
      effectIndex[effect.descriptor.effectKind] = effect;
    }
    for (let namespacePosition = 0; namespacePosition < contribution.extensionNamespaces.length; namespacePosition += 1) {
      const namespace = contribution.extensionNamespaces[namespacePosition];
      if (namespace === undefined) {
        continue;
      }
      namespaceIndex[namespace] = contribution;
    }
  }

  return {
    ok: true,
    state: freezeCatalogData({
      catalogVersion: 1,
      coreAssembly: createRegistryAssemblyState(coreCandidate.state),
      modules: normalizedModules,
      contributions,
      commandIndex: objectFreeze(commandIndex),
      effectIndex: objectFreeze(effectIndex),
      namespaceIndex: objectFreeze(namespaceIndex),
      assemblyIdentity: objectFreeze({}),
    }),
  };
}

export function compileOfficialModuleCatalogV1(
  startupManifest: unknown,
  registrationEntries: unknown,
): OfficialModuleCatalogCompilationResultV1 {
  try {
    const decoded = decodeKernelStartupManifest(startupManifest);
    if (
      !decoded.ok ||
      decoded.value.modules.length > OFFICIAL_MODULE_SDK_V1_LIMITS.modules
    ) {
      return invalidStartup();
    }
    const entries = captureRegistrationEntries(registrationEntries);
    if (entries === undefined) {
      return invalidStartup();
    }

    const sortedModules = sortedCopy(
      decoded.value.modules,
      (left, right) => compareText(left.moduleId, right.moduleId),
    );
    const coreModules: DecodedKernelStartupModuleDeclaration[] = [];
    const domainModules: DecodedKernelStartupModuleDeclaration[] = [];
    for (let index = 0; index < sortedModules.length; index += 1) {
      const module = sortedModules[index];
      if (module === undefined) {
        continue;
      }
      if (
        module.moduleId === "core.commands" ||
        module.moduleId === "core.selectors"
      ) {
        coreModules[coreModules.length] = module;
      } else {
        domainModules[domainModules.length] = module;
      }
    }
    const built = buildCatalogState(coreModules, domainModules, entries);
    if (!built.ok) {
      return failure(built.failure);
    }

    const catalog = {} as KernelIntegratedCatalog;
    reflectApply(objectDefineProperty, Object, [
      catalog,
      kernelIntegratedCatalogBrand,
      {
        configurable: false,
        enumerable: false,
        value: true,
        writable: false,
      },
    ]);
    reflectApply(objectFreeze, Object, [catalog]);
    reflectApply(weakMapSet, catalogStates, [catalog, built.state]);
    return objectFreeze({ ok: true, catalog });
  } catch {
    return failure({ code: "registry.internal-error" });
  }
}

export function getKernelIntegratedCatalogState(
  catalog: KernelIntegratedCatalog,
): KernelIntegratedCatalogState | undefined {
  try {
    return reflectApply(weakMapGet, catalogStates, [catalog]) as
      | KernelIntegratedCatalogState
      | undefined;
  } catch {
    return undefined;
  }
}

/** Additive startup composition: never mutate a catalog or a live assembly. */
export function compileContributionReadCatalogV1(base: KernelIntegratedCatalog, input: unknown): OfficialModuleCatalogCompilationResultV1 {
  try {
    const state = getKernelIntegratedCatalogState(base);
    if (state === undefined) return invalidStartup();
    const reads = captureContributionReads(state, input);
    if (reads === undefined) return invalidStartup();
    const contributions = state.contributions.map(source => {
      const copy = freezeCatalogData({ ...source });
      const selected = reads.filter(read => read.reader.moduleId === copy.moduleId && read.reader.contributionId === copy.contributionId);
      if (selected.length > 0) bindContributionReads(copy, selected);
      return copy;
    });
    const namespaceIndex = objectCreate(null) as Record<string, CompiledDomainCommandContributionV1>;
    for (const source of contributions) for (const namespace of source.extensionNamespaces) namespaceIndex[namespace] = source;
    const derived = freezeCatalogData({ ...state, contributions, namespaceIndex, assemblyIdentity: objectFreeze({}) });
    const catalog = {} as KernelIntegratedCatalog;
    reflectApply(objectDefineProperty, Object, [catalog, kernelIntegratedCatalogBrand,
      { configurable: false, enumerable: false, value: true, writable: false }]);
    reflectApply(objectFreeze, Object, [catalog]);
    reflectApply(weakMapSet, catalogStates, [catalog, derived]);
    return objectFreeze({ ok: true, catalog });
  } catch { return invalidStartup(); }
}
