import { captureStrictInput } from "../codec/strict-input-capture";
import type { ExtensionBlock, ExtensionOwner } from "../domain/extensions";
import type { ScoreDocument } from "../domain/score-document";
import type { CompiledDomainCommandContributionV1 } from "../module-sdk/contracts";
import {
  decodeExtensionRuntimeRequirementV1,
  hasSameNumberValues,
} from "./domain-catalog-codec";
import {
  getKernelIntegratedCatalogState,
  type KernelIntegratedCatalogState,
} from "./domain-catalog";
import type {
  ExtensionRuntimeRequirementV1,
  KernelDomainAvailabilityFact,
  KernelIntegratedCatalog,
  KernelKnownRequirementInventoryV1,
  KernelValidationAvailability,
  KernelWriteAvailability,
} from "./integrated-contracts";
import { readDenseArray, readExactDataRecord } from "./strict-codec";

export const KERNEL_KNOWN_REQUIREMENT_LIMIT = 1_024 as const;
export const KERNEL_REQUIREMENT_VERSION_LIMIT = 256 as const;
export const KERNEL_COMPATIBILITY_FACT_LIMIT = 131_072 as const;

export interface KernelIntegratedRuntimeAssemblyState {
  readonly catalog: KernelIntegratedCatalog;
  readonly catalogState: KernelIntegratedCatalogState;
  readonly inventory: KernelKnownRequirementInventoryV1;
  readonly knownRequirementByNamespace: Readonly<
    Record<string, ExtensionRuntimeRequirementV1>
  >;
  readonly canonicalInventoryKey: string;
  readonly assemblyIdentity: object;
}

export type ResolveKernelIntegratedRuntimeAssemblyResult =
  | { readonly ok: true; readonly state: KernelIntegratedRuntimeAssemblyState }
  | { readonly ok: false; readonly reason: "catalog" | "inventory" };

export interface KernelDomainAvailabilityState {
  readonly facts: readonly KernelDomainAvailabilityFact[];
  readonly writeAvailability: KernelWriteAvailability;
  readonly validationAvailability: KernelValidationAvailability;
}

export type ComputeKernelDomainAvailabilityResult =
  | { readonly ok: true; readonly value: KernelDomainAvailabilityState }
  | {
      readonly ok: false;
      readonly actual: number;
      readonly limit: typeof KERNEL_COMPATIBILITY_FACT_LIMIT;
    };

const reflectApply = Reflect.apply;
const objectCreate = Object.create;
const objectDefineProperty = Object.defineProperty;
const objectFreeze = Object.freeze;
const arraySort = Array.prototype.sort;
const arraySlice = Array.prototype.slice;
const numberToString = Number.prototype.toString;
const mapConstructor = Map;
const mapGet = mapConstructor.prototype.get;
const mapSet = mapConstructor.prototype.set;
const weakMapConstructor = WeakMap;
const weakMapGet = weakMapConstructor.prototype.get;
const weakMapSet = weakMapConstructor.prototype.set;

const runtimeAssemblies = new weakMapConstructor<
  KernelIntegratedCatalog,
  Map<string, KernelIntegratedRuntimeAssemblyState>
>();

function freeze<T>(value: T): T {
  return reflectApply(objectFreeze, Object, [value]) as T;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareRequirement(
  left: ExtensionRuntimeRequirementV1,
  right: ExtensionRuntimeRequirementV1,
): number {
  const namespace = compareText(left.namespace, right.namespace);
  if (namespace !== 0) {
    return namespace;
  }
  const module = compareText(left.moduleId, right.moduleId);
  return module !== 0
    ? module
    : compareText(left.contributionId, right.contributionId);
}

function sortedRequirements(
  requirements: readonly ExtensionRuntimeRequirementV1[],
): readonly ExtensionRuntimeRequirementV1[] {
  const copy = reflectApply(arraySlice, requirements, []) as ExtensionRuntimeRequirementV1[];
  reflectApply(arraySort, copy, [compareRequirement]);
  return freeze(copy);
}

function cloneRequirement(
  requirement: ExtensionRuntimeRequirementV1,
): ExtensionRuntimeRequirementV1 {
  const versions: number[] = [];
  for (let index = 0; index < requirement.supportedSchemaVersions.length; index += 1) {
    const version = requirement.supportedSchemaVersions[index];
    if (version !== undefined) {
      versions[versions.length] = version;
    }
  }
  return freeze({
    requirementVersion: 1,
    namespace: requirement.namespace,
    moduleId: requirement.moduleId,
    contributionId: requirement.contributionId,
    supportedSchemaVersions: freeze(versions),
    requiredForWrite: true,
  });
}

function installedRequirements(
  catalogState: KernelIntegratedCatalogState,
): readonly ExtensionRuntimeRequirementV1[] {
  const values: ExtensionRuntimeRequirementV1[] = [];
  for (let contributionIndex = 0;
    contributionIndex < catalogState.contributions.length;
    contributionIndex += 1) {
    const contribution = catalogState.contributions[contributionIndex];
    if (contribution === undefined) {
      continue;
    }
    for (let requirementIndex = 0;
      requirementIndex < contribution.extensionRequirements.length;
      requirementIndex += 1) {
      const requirement = contribution.extensionRequirements[requirementIndex];
      if (requirement !== undefined) {
        values[values.length] = cloneRequirement(requirement);
      }
    }
  }
  return sortedRequirements(values);
}

function decodeExplicitInventory(
  input: unknown,
): readonly ExtensionRuntimeRequirementV1[] | undefined {
  const captured = captureStrictInput(input);
  if (captured.status !== "captured") {
    return undefined;
  }
  const record = readExactDataRecord(captured.value, [
    "inventoryVersion",
    "requirements",
  ]);
  const rawRequirements = readDenseArray(record?.requirements);
  if (
    record?.inventoryVersion !== 1 ||
    rawRequirements === undefined ||
    rawRequirements.length > KERNEL_KNOWN_REQUIREMENT_LIMIT
  ) {
    return undefined;
  }

  const requirements: ExtensionRuntimeRequirementV1[] = [];
  const namespaces = objectCreate(null) as Record<string, true>;
  for (let index = 0; index < rawRequirements.length; index += 1) {
    const requirement = decodeExtensionRuntimeRequirementV1(
      rawRequirements[index],
    );
    if (
      requirement === undefined ||
      requirement.supportedSchemaVersions.length >
        KERNEL_REQUIREMENT_VERSION_LIMIT ||
      namespaces[requirement.namespace] === true
    ) {
      return undefined;
    }
    namespaces[requirement.namespace] = true;
    requirements[requirements.length] = cloneRequirement(requirement);
  }
  return sortedRequirements(requirements);
}

function sameRequirement(
  left: ExtensionRuntimeRequirementV1,
  right: ExtensionRuntimeRequirementV1,
): boolean {
  return left.requirementVersion === right.requirementVersion &&
    left.namespace === right.namespace &&
    left.moduleId === right.moduleId &&
    left.contributionId === right.contributionId &&
    left.requiredForWrite === right.requiredForWrite &&
    hasSameNumberValues(
      left.supportedSchemaVersions,
      right.supportedSchemaVersions,
    );
}

function buildRequirementIndex(
  requirements: readonly ExtensionRuntimeRequirementV1[],
): Readonly<Record<string, ExtensionRuntimeRequirementV1>> {
  const index = objectCreate(null) as Record<
    string,
    ExtensionRuntimeRequirementV1
  >;
  for (let position = 0; position < requirements.length; position += 1) {
    const requirement = requirements[position];
    if (requirement === undefined) {
      continue;
    }
    reflectApply(objectDefineProperty, Object, [
      index,
      requirement.namespace,
      {
        configurable: false,
        enumerable: true,
        value: requirement,
        writable: false,
      },
    ]);
  }
  return freeze(index);
}

function hasInstalledParity(
  catalogState: KernelIntegratedCatalogState,
  inventory: readonly ExtensionRuntimeRequirementV1[],
  inventoryByNamespace: Readonly<
    Record<string, ExtensionRuntimeRequirementV1>
  >,
): boolean {
  const installed = installedRequirements(catalogState);
  for (let index = 0; index < installed.length; index += 1) {
    const requirement = installed[index];
    const inventoryRequirement = requirement === undefined
      ? undefined
      : inventoryByNamespace[requirement.namespace];
    if (
      requirement === undefined ||
      inventoryRequirement === undefined ||
      !sameRequirement(requirement, inventoryRequirement)
    ) {
      return false;
    }
  }
  for (let inventoryIndex = 0; inventoryIndex < inventory.length; inventoryIndex += 1) {
    const inventoryRequirement = inventory[inventoryIndex];
    if (inventoryRequirement === undefined) {
      continue;
    }
    let installedOwner: CompiledDomainCommandContributionV1 | undefined;
    for (let contributionIndex = 0;
      contributionIndex < catalogState.contributions.length;
      contributionIndex += 1) {
      const contribution = catalogState.contributions[contributionIndex];
      if (
        contribution?.moduleId === inventoryRequirement.moduleId &&
        contribution.contributionId === inventoryRequirement.contributionId
      ) {
        installedOwner = contribution;
        break;
      }
    }
    if (installedOwner === undefined) {
      continue;
    }
    let exactInstalledRequirement = false;
    for (let requirementIndex = 0;
      requirementIndex < installedOwner.extensionRequirements.length;
      requirementIndex += 1) {
      const requirement = installedOwner.extensionRequirements[requirementIndex];
      if (
        requirement !== undefined &&
        sameRequirement(requirement, inventoryRequirement)
      ) {
        exactInstalledRequirement = true;
        break;
      }
    }
    if (!exactInstalledRequirement) {
      return false;
    }
  }
  return true;
}

function lengthPrefixed(value: string): string {
  const length = reflectApply(numberToString, value.length, []) as string;
  return `${length}:${value}`;
}

function integerText(value: number): string {
  return reflectApply(numberToString, value, []) as string;
}

function canonicalInventoryKey(
  requirements: readonly ExtensionRuntimeRequirementV1[],
): string {
  let key = "inventory:1;";
  for (let index = 0; index < requirements.length; index += 1) {
    const requirement = requirements[index];
    if (requirement === undefined) {
      continue;
    }
    key += lengthPrefixed(requirement.namespace);
    key += lengthPrefixed(requirement.moduleId);
    key += lengthPrefixed(requirement.contributionId);
    key += "1:";
    for (let versionIndex = 0;
      versionIndex < requirement.supportedSchemaVersions.length;
      versionIndex += 1) {
      const version = requirement.supportedSchemaVersions[versionIndex];
      if (version !== undefined) {
        key += lengthPrefixed(integerText(version));
      }
    }
    key += ";";
  }
  return key;
}

function cachedAssembly(
  catalog: KernelIntegratedCatalog,
  catalogState: KernelIntegratedCatalogState,
  requirements: readonly ExtensionRuntimeRequirementV1[],
): KernelIntegratedRuntimeAssemblyState {
  const key = canonicalInventoryKey(requirements);
  let catalogCache = reflectApply(weakMapGet, runtimeAssemblies, [catalog]) as
    | Map<string, KernelIntegratedRuntimeAssemblyState>
    | undefined;
  if (catalogCache === undefined) {
    catalogCache = new mapConstructor<string, KernelIntegratedRuntimeAssemblyState>();
    reflectApply(weakMapSet, runtimeAssemblies, [catalog, catalogCache]);
  }
  const cached = reflectApply(mapGet, catalogCache, [key]) as
    | KernelIntegratedRuntimeAssemblyState
    | undefined;
  if (cached !== undefined) {
    return cached;
  }
  const inventory = freeze({
    inventoryVersion: 1 as const,
    requirements,
  });
  const state = freeze({
    catalog,
    catalogState,
    inventory,
    knownRequirementByNamespace: buildRequirementIndex(requirements),
    canonicalInventoryKey: key,
    assemblyIdentity: freeze({}),
  });
  reflectApply(mapSet, catalogCache, [key, state]);
  return state;
}

export function resolveKernelIntegratedRuntimeAssembly(
  catalog: KernelIntegratedCatalog,
  explicitInventory?: unknown,
): ResolveKernelIntegratedRuntimeAssemblyResult {
  try {
    const catalogState = getKernelIntegratedCatalogState(catalog);
    if (catalogState === undefined) {
      return { ok: false, reason: "catalog" };
    }
    const requirements = arguments.length >= 2
      ? decodeExplicitInventory(explicitInventory)
      : installedRequirements(catalogState);
    if (requirements === undefined) {
      return { ok: false, reason: "inventory" };
    }
    const index = buildRequirementIndex(requirements);
    if (!hasInstalledParity(catalogState, requirements, index)) {
      return { ok: false, reason: "inventory" };
    }
    return {
      ok: true,
      state: cachedAssembly(catalog, catalogState, requirements),
    };
  } catch {
    return { ok: false, reason: "inventory" };
  }
}

function hasVersion(
  versions: readonly number[],
  version: number,
): boolean {
  for (let index = 0; index < versions.length; index += 1) {
    if (versions[index] === version) {
      return true;
    }
  }
  return false;
}

function cloneOwner(owner: ExtensionOwner): ExtensionOwner {
  return owner.kind === "score"
    ? freeze({ kind: "score" as const })
    : freeze({ kind: "part" as const, partId: owner.partId });
}

function ownerPartId(owner: ExtensionOwner): string {
  return owner.kind === "score" ? "" : owner.partId;
}

function compareFacts(
  left: KernelDomainAvailabilityFact,
  right: KernelDomainAvailabilityFact,
): number {
  const namespace = compareText(left.namespace, right.namespace);
  if (namespace !== 0) {
    return namespace;
  }
  const ownerKind = left.owner.kind === right.owner.kind
    ? 0
    : left.owner.kind === "score" ? -1 : 1;
  if (ownerKind !== 0) {
    return ownerKind;
  }
  const part = compareText(ownerPartId(left.owner), ownerPartId(right.owner));
  if (part !== 0) {
    return part;
  }
  if (left.extensionSchemaVersion !== right.extensionSchemaVersion) {
    return left.extensionSchemaVersion - right.extensionSchemaVersion;
  }
  const module = compareText(left.moduleId, right.moduleId);
  if (module !== 0) {
    return module;
  }
  const contribution = compareText(
    left.contributionId,
    right.contributionId,
  );
  if (contribution !== 0) {
    return contribution;
  }
  return left.reason === right.reason
    ? 0
    : left.reason === "required-contribution-incompatible" ? -1 : 1;
}

function createFact(
  block: ExtensionBlock,
  requirement: ExtensionRuntimeRequirementV1,
  reason: KernelDomainAvailabilityFact["reason"],
): KernelDomainAvailabilityFact {
  return freeze({
    reason,
    namespace: block.namespace,
    owner: cloneOwner(block.owner),
    extensionSchemaVersion: block.schemaVersion,
    moduleId: requirement.moduleId,
    contributionId: requirement.contributionId,
    supportedSchemaVersions: requirement.supportedSchemaVersions,
  }) as KernelDomainAvailabilityFact;
}

export function computeKernelDomainAvailability(
  document: ScoreDocument,
  assembly: KernelIntegratedRuntimeAssemblyState,
): ComputeKernelDomainAvailabilityResult {
  const facts: KernelDomainAvailabilityFact[] = [];
  for (let index = 0; index < document.extensions.length; index += 1) {
    const block = document.extensions[index];
    if (block === undefined) {
      continue;
    }
    const requirement = assembly.knownRequirementByNamespace[block.namespace];
    if (requirement === undefined) {
      continue;
    }
    const installed = assembly.catalogState.namespaceIndex[block.namespace];
    const versionCompatible = hasVersion(
      requirement.supportedSchemaVersions,
      block.schemaVersion,
    );
    if (!versionCompatible) {
      facts[facts.length] = createFact(
        block,
        requirement,
        "required-contribution-incompatible",
      );
    } else if (
      installed === undefined ||
      installed.moduleId !== requirement.moduleId ||
      installed.contributionId !== requirement.contributionId
    ) {
      facts[facts.length] = createFact(
        block,
        requirement,
        "required-contribution-unavailable",
      );
    }
    if (facts.length > KERNEL_COMPATIBILITY_FACT_LIMIT) {
      return {
        ok: false,
        limit: KERNEL_COMPATIBILITY_FACT_LIMIT,
        actual: KERNEL_COMPATIBILITY_FACT_LIMIT + 1,
      };
    }
  }
  reflectApply(arraySort, facts, [compareFacts]);
  const frozenFacts = freeze(facts);
  if (frozenFacts.length === 0) {
    return {
      ok: true,
      value: freeze({
        facts: frozenFacts,
        writeAvailability: freeze({ status: "writable" as const }),
        validationAvailability: freeze({ status: "complete" as const }),
      }),
    };
  }
  return {
    ok: true,
    value: freeze({
      facts: frozenFacts,
      writeAvailability: freeze({
        status: "read-only" as const,
        reason: "domain-validation-incomplete" as const,
        facts: frozenFacts,
      }),
      validationAvailability: freeze({
        status: "incomplete" as const,
        facts: frozenFacts,
      }),
    }),
  };
}

export function contributionForNamespace(
  assembly: KernelIntegratedRuntimeAssemblyState,
  namespace: string,
): CompiledDomainCommandContributionV1 | undefined {
  return assembly.catalogState.namespaceIndex[namespace];
}
