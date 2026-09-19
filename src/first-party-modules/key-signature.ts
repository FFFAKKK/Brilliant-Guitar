import type { ScoreEntityTarget } from "../core-kernel/commands/contracts";
import type { ExtensionBlock, JsonObject } from "../core-kernel/domain/extensions";
import type { ScoreDocument } from "../core-kernel/domain/score-document";
import {
  compileOfficialModuleCatalogV1,
  createModuleKernelIssueV1,
  defineDomainCommandContributionV1,
  defineDomainCommandRegistrationEntryV1,
  defineDomainCommandV1,
  defineModuleEffectV1,
  type DomainContributionReadViewV1,
  type OfficialModuleDefinitionResultV1,
} from "../core-kernel/module-sdk/index";
import { CORE_KERNEL_STARTUP_MANIFEST } from "../core-kernel/registry/builtins";
import type { KernelStartupModuleManifest } from "../core-kernel/registry/contracts";
import { readExactDataRecord } from "../core-kernel/registry/strict-codec";

export const KEY_SIGNATURE_NAMESPACE = "brilliant.notation.key-signature";
export const SET_KEY_SIGNATURE_COMMAND = `${KEY_SIGNATURE_NAMESPACE}.set`;
const REPLACE_KEY_SIGNATURE_EFFECT = `${KEY_SIGNATURE_NAMESPACE}.replace`;
const SOURCE = {
  moduleId: KEY_SIGNATURE_NAMESPACE,
  contributionId: `${KEY_SIGNATURE_NAMESPACE}.v1`,
} as const;

export interface KeySignatureChangeV1 {
  readonly measureId: string;
  readonly fifths: number;
}

export type KeySignatureEditV1 = {
  readonly partId: string;
  readonly measureId: string;
  readonly change:
    | { readonly kind: "set"; readonly fifths: number }
    | { readonly kind: "inherit" };
};

export type KeySignatureTimelineReadV1 =
  | { readonly status: "absent"; readonly changes: readonly [] }
  | { readonly status: "valid"; readonly changes: readonly KeySignatureChangeV1[] }
  | { readonly status: "invalid" };

function defined<T>(result: OfficialModuleDefinitionResultV1<T>): T {
  if (result.status !== "defined") {
    throw new Error("Unable to define the first-party key-signature module");
  }
  return result.value;
}

function issue(reason: string) {
  const result = createModuleKernelIssueV1({
    code: `${KEY_SIGNATURE_NAMESPACE}.${reason}`,
    source: { kind: "module", ...SOURCE },
  });
  if (result.status !== "created") {
    throw new Error("Unable to create a key-signature module issue");
  }
  return result.issue;
}

function isFifths(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= -7 && value <= 7;
}

function decodeChange(value: unknown): KeySignatureChangeV1 | undefined {
  const record = readExactDataRecord(value, ["measureId", "fifths"]);
  return typeof record?.measureId === "string" && record.measureId.length > 0 && isFifths(record.fifths)
    ? { measureId: record.measureId, fifths: record.fifths }
    : undefined;
}

function decodeChangesPayload(value: unknown): readonly KeySignatureChangeV1[] | undefined {
  const record = readExactDataRecord(value, ["changes"]);
  if (!Array.isArray(record?.changes)) return undefined;
  const changes: KeySignatureChangeV1[] = [];
  const seen = new Set<string>();
  let previousId: string | undefined;
  for (const value of record.changes) {
    const change = decodeChange(value);
    if (!change || seen.has(change.measureId) || (previousId !== undefined && previousId >= change.measureId)) {
      return undefined;
    }
    seen.add(change.measureId);
    previousId = change.measureId;
    changes.push(change);
  }
  return changes;
}

function decodeEdit(value: unknown): KeySignatureEditV1 | undefined {
  const record = readExactDataRecord(value, ["partId", "measureId", "change"]);
  if (typeof record?.partId !== "string" || record.partId.length === 0
    || typeof record.measureId !== "string" || record.measureId.length === 0) return undefined;
  const change = readExactDataRecord(record.change,
    readExactDataRecord(record.change, ["kind"])?.kind === "inherit" ? ["kind"] : ["kind", "fifths"]);
  if (change?.kind === "inherit") {
    return { partId: record.partId, measureId: record.measureId, change: { kind: "inherit" } };
  }
  return change?.kind === "set" && isFifths(change.fifths)
    ? { partId: record.partId, measureId: record.measureId, change: { kind: "set", fifths: change.fifths } }
    : undefined;
}

function decodeCommand(input: Readonly<{ target: unknown; payload: unknown }>): KeySignatureEditV1 | undefined {
  const target = readExactDataRecord(input.target, ["kind", "partId"]);
  const payload = readExactDataRecord(input.payload, ["measureId", "change"]);
  if (target?.kind !== "part" || typeof target.partId !== "string" || payload === undefined) return undefined;
  return decodeEdit({ partId: target.partId, measureId: payload.measureId, change: payload.change });
}

function blockForPart(blocks: readonly ExtensionBlock[], partId: string): ExtensionBlock | undefined {
  return blocks.find(block => block.namespace === KEY_SIGNATURE_NAMESPACE
    && block.owner.kind === "part" && block.owner.partId === partId);
}

function sameChanges(left: readonly KeySignatureChangeV1[], right: readonly KeySignatureChangeV1[]): boolean {
  return left.length === right.length
    && left.every((change, index) => change.measureId === right[index]?.measureId && change.fifths === right[index]?.fifths);
}

function normalizeChanges(measureIds: readonly string[], current: readonly KeySignatureChangeV1[]): readonly KeySignatureChangeV1[] {
  const byMeasure = new Map(current.map(change => [change.measureId, change.fifths]));
  const normalized: KeySignatureChangeV1[] = [];
  let effective = 0;
  for (const measureId of measureIds) {
    const fifths = byMeasure.get(measureId);
    if (fifths === undefined || fifths === effective) continue;
    normalized.push({ measureId, fifths });
    effective = fifths;
  }
  normalized.sort((left, right) => left.measureId < right.measureId ? -1 : left.measureId > right.measureId ? 1 : 0);
  return normalized;
}

function applyEdit(measureIds: readonly string[], current: readonly KeySignatureChangeV1[], edit: KeySignatureEditV1): readonly KeySignatureChangeV1[] {
  const updated = new Map(current.map(change => [change.measureId, change.fifths]));
  if (edit.change.kind === "inherit") updated.delete(edit.measureId);
  else updated.set(edit.measureId, edit.change.fifths);
  return normalizeChanges(measureIds, [...updated].map(([measureId, fifths]) => ({ measureId, fifths })));
}

function measureIds(view: DomainContributionReadViewV1): readonly string[] {
  return view.coreDocument.measureDefinitions.map(measure => measure.id);
}

export function readPartKeySignatureTimelineV1(document: Pick<ScoreDocument, "extensions" | "measureDefinitions">,
  partId: string): KeySignatureTimelineReadV1 {
  const block = blockForPart(document.extensions, partId);
  if (!block) return { status: "absent", changes: [] };
  if (block.schemaVersion !== 1) return { status: "invalid" };
  const changes = decodeChangesPayload(block.payload);
  const ids = document.measureDefinitions.map(measure => measure.id);
  const knownIds = new Set(ids);
  return changes === undefined || changes.some(change => !knownIds.has(change.measureId))
    || !sameChanges(changes, normalizeChanges(ids, changes))
    ? { status: "invalid" } : { status: "valid", changes };
}

const effect = defined(defineModuleEffectV1<KeySignatureEditV1>({
  descriptor: {
    descriptorVersion: 1,
    effectKind: REPLACE_KEY_SIGNATURE_EFFECT,
    source: SOURCE,
    namespace: KEY_SIGNATURE_NAMESPACE,
    ownerKinds: ["part"],
    supportedSchemaVersions: [1],
  },
  decode: input => {
    const edit = decodeEdit(input);
    return edit === undefined ? { status: "invalid" } : { status: "decoded", payload: edit };
  },
  transform: input => {
    if (input.owner.kind !== "part" || input.owner.partId !== input.payload.partId) {
      return { status: "rejected", issues: [issue("wrong-owner")] };
    }
    const current = input.currentBlock === undefined ? [] : decodeChangesPayload(input.currentBlock.payload);
    if (current === undefined) return { status: "rejected", issues: [issue("invalid-block")] };
    const changes = applyEdit(measureIds(input.view), current, input.payload);
    const encodedChanges: JsonObject[] = changes.map(change => ({
      measureId: change.measureId,
      fifths: change.fifths,
    }));
    return changes.length === 0
      ? { status: "remove" }
      : { status: "replace", schemaVersion: 1, payload: { changes: encodedChanges } };
  },
}));

const command = defined(defineDomainCommandV1<KeySignatureEditV1>({
  descriptor: {
    descriptorVersion: 1,
    commandId: SET_KEY_SIGNATURE_COMMAND,
    commandVersion: 1,
    source: SOURCE,
    targetKind: "part",
    requiredCapabilities: ["command:execute", "score:read"],
    titleKey: "brilliant.notation.key-signature.set.title",
  },
  decode: input => {
    const edit = decodeCommand(input);
    return edit === undefined ? { status: "invalid" } : { status: "decoded", command: edit };
  },
  prepare: (view, edit) => {
    if (!view.coreDocument.parts.some(part => part.id === edit.partId)) {
      return { status: "rejected", issues: [issue("missing-part")] };
    }
    const ids = measureIds(view);
    if (!ids.includes(edit.measureId)) return { status: "rejected", issues: [issue("missing-measure")] };
    const block = blockForPart(view.compatibleExtensions, edit.partId);
    const current = block === undefined ? [] : decodeChangesPayload(block.payload);
    if (current === undefined) return { status: "rejected", issues: [issue("invalid-block")] };
    const next = applyEdit(ids, current, edit);
    if (sameChanges(current, next)) return { status: "no-op" };
    return {
      status: "changed",
      effectRequests: [{
        requestVersion: 1,
        requestKind: "module.extension",
        effectKind: REPLACE_KEY_SIGNATURE_EFFECT,
        namespace: KEY_SIGNATURE_NAMESPACE,
        owner: { kind: "part", partId: edit.partId },
        payload: edit,
      }],
      affected: [{ kind: "part", partId: edit.partId } satisfies ScoreEntityTarget],
    };
  },
}));

const contribution = defined(defineDomainCommandContributionV1({
  apiVersion: 1,
  ...SOURCE,
  extensionNamespaces: [KEY_SIGNATURE_NAMESPACE],
  extensionRequirements: [{
    requirementVersion: 1,
    namespace: KEY_SIGNATURE_NAMESPACE,
    ...SOURCE,
    supportedSchemaVersions: [1],
    requiredForWrite: true,
  }],
  commands: [command],
  effects: [effect],
  validate: view => {
    const allMeasures = new Set(measureIds(view));
    const allParts = new Set(view.coreDocument.parts.map(part => part.id));
    for (const block of view.compatibleExtensions) {
      if (block.owner.kind !== "part" || !allParts.has(block.owner.partId)) return [issue("wrong-owner")];
      const changes = decodeChangesPayload(block.payload);
      if (changes === undefined || changes.length > allMeasures.size
        || changes.some(change => !allMeasures.has(change.measureId))
        || !sameChanges(changes, normalizeChanges(measureIds(view), changes))) return [issue("invalid-block")];
    }
    return [];
  },
  classify: () => ({ status: "supported", issues: [] }),
}));

const registration = defined(defineDomainCommandRegistrationEntryV1({
  kind: "domain-command",
  registrationEntryId: "kernel.domain-commands.v1",
  ownerModuleId: SOURCE.moduleId,
  contributions: [contribution],
}));

export const KEY_SIGNATURE_MODULE_REGISTRATION_ENTRIES = Object.freeze([registration]);

export const KEY_SIGNATURE_MODULE_STARTUP_MANIFEST: KernelStartupModuleManifest = Object.freeze({
  startupManifestVersion: 1,
  modules: Object.freeze([
    ...CORE_KERNEL_STARTUP_MANIFEST.modules,
    Object.freeze({
      moduleId: SOURCE.moduleId,
      origin: "official" as const,
      runtime: "internal-module" as const,
      trustLevel: "system-trusted" as const,
      apiVersion: 1 as const,
      capabilities: Object.freeze([
        "command:register",
        "command:execute",
        "score:read",
        "event:subscribe",
      ] as const),
      registrationEntryIds: Object.freeze(["kernel.domain-commands.v1"] as const),
    }),
  ]),
});

export function compileKeySignatureModuleCatalogV1() {
  return compileOfficialModuleCatalogV1(KEY_SIGNATURE_MODULE_STARTUP_MANIFEST, KEY_SIGNATURE_MODULE_REGISTRATION_ENTRIES);
}
