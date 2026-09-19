import { captureStrictInput } from "../codec/strict-input-capture";
import type { ExtensionBlock } from "../domain/extensions";
import type { ScoreDocument } from "../domain/score-document";
import type { CompiledDomainCommandContributionV1 } from "../module-sdk/contracts";
import { decodeExtensionRuntimeRequirementV1 } from "./domain-catalog-codec";
import type { KernelIntegratedCatalogState } from "./domain-catalog";
import type { ExtensionRuntimeRequirementV1 } from "./integrated-contracts";
import { readDenseArray, readExactDataRecord } from "./strict-codec";

export interface ContributionExtensionReadV1 {
  readonly readVersion: 1;
  readonly reader: { readonly moduleId: string; readonly contributionId: string };
  readonly provider: { readonly moduleId: string; readonly contributionId: string };
  readonly namespace: string;
  readonly supportedSchemaVersions: readonly number[];
  readonly ownerKinds: readonly ("score" | "part")[];
}
export interface ContributionDependencyViewV1 {
  readonly readVersion: 1;
  readonly provider: ContributionExtensionReadV1["provider"];
  readonly namespace: string;
  readonly supportedSchemaVersions: readonly number[];
  readonly ownerKinds: readonly ("score" | "part")[];
  readonly blocks: readonly ExtensionBlock[];
}

const declarations = new WeakMap<CompiledDomainCommandContributionV1, readonly ContributionExtensionReadV1[]>();
const apply = Reflect.apply;
const get = WeakMap.prototype.get;
const set = WeakMap.prototype.set;
const freeze = Object.freeze;

/** Private compiler hook: callers bind only fresh sources in an authenticated derived catalog. */
export function bindContributionReads(source: CompiledDomainCommandContributionV1, reads: readonly ContributionExtensionReadV1[]): void {
  apply(set, declarations, [source, freeze(reads)]);
}
export function contributionReads(source: CompiledDomainCommandContributionV1): readonly ContributionExtensionReadV1[] | undefined {
  return apply(get, declarations, [source]) as readonly ContributionExtensionReadV1[] | undefined;
}

/** Never invoke a consumer with a future provider block silently hidden. */
export function hasIncompatibleContributionReads(document: ScoreDocument, source: CompiledDomainCommandContributionV1): boolean {
  const reads = contributionReads(source);
  if (reads === undefined) return false;
  for (let i = 0; i < reads.length; i++) {
    const read = reads[i]!;
    for (let j = 0; j < document.extensions.length; j++) {
      const block = document.extensions[j]!;
      if (block.namespace !== read.namespace || (block.owner.kind !== read.ownerKinds[0] && block.owner.kind !== read.ownerKinds[1])) continue;
      let compatible = false;
      for (let k = 0; k < read.supportedSchemaVersions.length; k++) if (block.schemaVersion === read.supportedSchemaVersions[k]) compatible = true;
      if (!compatible) return true;
    }
  }
  return false;
}

/** A consumer with an absent declared provider cannot establish complete
 * validation. Keep the session readable, but do not invoke that consumer until
 * the authentic provider is installed again. */
export function hasUnavailableContributionReads(
  state: KernelIntegratedCatalogState,
  source: CompiledDomainCommandContributionV1,
): boolean {
  const reads = contributionReads(source);
  if (reads === undefined) return false;
  for (let index = 0; index < reads.length; index += 1) {
    const read = reads[index]!;
    const provider = state.namespaceIndex[read.namespace];
    if (provider === undefined || provider.moduleId !== read.provider.moduleId
      || provider.contributionId !== read.provider.contributionId) return true;
  }
  return false;
}

export function captureContributionReadInventory(
  input: unknown,
): Readonly<Record<string, ExtensionRuntimeRequirementV1>> | undefined {
  const captured = captureStrictInput(input);
  if (captured.status !== "captured") return undefined;
  const record = readExactDataRecord(captured.value, ["inventoryVersion", "requirements"]);
  const rows = readDenseArray(record?.requirements);
  if (record?.inventoryVersion !== 1 || rows === undefined || rows.length > 1024) return undefined;
  const result = Object.create(null) as Record<string, ExtensionRuntimeRequirementV1>;
  for (let index = 0; index < rows.length; index += 1) {
    const requirement = decodeExtensionRuntimeRequirementV1(rows[index]);
    if (requirement === undefined || requirement.supportedSchemaVersions.length > 256
      || result[requirement.namespace] !== undefined) return undefined;
    result[requirement.namespace] = requirement;
  }
  return freeze(result);
}

/** Declarations grant access to complete versioned blocks, not incremental field reads. */
export function captureContributionReads(
  state: KernelIntegratedCatalogState,
  input: unknown,
  knownProviders?: Readonly<Record<string, ExtensionRuntimeRequirementV1>>,
): readonly ContributionExtensionReadV1[] | undefined {
  const captured = captureStrictInput(input);
  if (captured.status !== "captured") return undefined;
  const rows = readDenseArray(captured.value);
  if (rows === undefined || rows.length === 0 || rows.length > 1024) return undefined;
  const result: ContributionExtensionReadV1[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const record = readExactDataRecord(row, ["readVersion", "reader", "provider", "namespace", "supportedSchemaVersions", "ownerKinds"]);
    const reader = readExactDataRecord(record?.reader, ["moduleId", "contributionId"]);
    const provider = readExactDataRecord(record?.provider, ["moduleId", "contributionId"]);
    const source = state.contributions.find(entry => entry.moduleId === reader?.moduleId && entry.contributionId === reader?.contributionId);
    const owner = typeof record?.namespace === "string" ? state.namespaceIndex[record.namespace] : undefined;
    const requirement = typeof record?.namespace === "string"
      ? owner?.extensionRequirements.find(entry => entry.namespace === record.namespace)
        ?? knownProviders?.[record.namespace]
      : undefined;
    const versions = readDenseArray(record?.supportedSchemaVersions);
    const kinds = readDenseArray(record?.ownerKinds);
    if (record?.readVersion !== 1 || source === undefined || requirement === undefined
      || (source.moduleId === provider?.moduleId && source.contributionId === provider?.contributionId)
      || requirement.moduleId !== provider?.moduleId || requirement.contributionId !== provider?.contributionId
      || (owner !== undefined && (owner.moduleId !== provider.moduleId || owner.contributionId !== provider.contributionId))
      || versions === undefined || kinds === undefined || kinds.length === 0 || kinds.length > 2
      || kinds.some((kind, index) => (kind !== "score" && kind !== "part") || kinds.indexOf(kind) !== index)) return undefined;
    // Exact provider parity prevents silently hiding a provider-supported version
    // as an empty dependency. Narrower consumer version ranges need a new contract.
    if (versions.length !== requirement.supportedSchemaVersions.length
      || versions.some((version, index) => version !== requirement.supportedSchemaVersions[index])) return undefined;
    const key = `${source.moduleId}/${source.contributionId}/${record.namespace}`;
    if (seen.has(key)) return undefined;
    seen.add(key);
    result.push(freeze({ readVersion: 1, reader: freeze({ moduleId: source.moduleId, contributionId: source.contributionId }),
      provider: freeze({ moduleId: requirement.moduleId, contributionId: requirement.contributionId }), namespace: requirement.namespace,
      supportedSchemaVersions: freeze([...requirement.supportedSchemaVersions]),
      ownerKinds: freeze([...(kinds as ("score" | "part")[])].sort()) }));
  }
  const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
  result.sort((a, b) => compare(a.reader.moduleId, b.reader.moduleId)
    || compare(a.reader.contributionId, b.reader.contributionId) || compare(a.namespace, b.namespace));
  return freeze(result);
}
