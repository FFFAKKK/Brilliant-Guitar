// Two independent plugins: Part-owned Core index -> Score-owned summary.
import { compileOfficialModuleCatalogV1, createModuleKernelIssueV1, defineDomainCommandContributionV1,
  defineDomainCommandRegistrationEntryV1, defineDomainCommandV1, defineModuleEffectV1,
  type DomainContributionReadViewV1, type DomainEffectRequestV1, type ModuleKernelIssue,
  type OfficialModuleDefinitionResultV1 } from "../../../src/core-kernel/module-sdk/index";
import { compileContributionReadCatalogV1, type DomainContributionDependencyReadViewV1 } from "../../../src/core-kernel/module-sdk/extension-reads";
import type { ExtensionBlock, JsonObject, ScoreDocument } from "../../../src/core-kernel/index";
import { readExactDataRecord } from "../../../src/core-kernel/registry/strict-codec";

export const INDEX = "fixture.cross.index", SUMMARY = "fixture.cross.summary";
export const indexSource = { moduleId: "fixture.index.module", contributionId: "fixture.index.contribution" };
export const summarySource = { moduleId: "fixture.summary.module", contributionId: "fixture.summary.contribution" };
export const crossReads = [{ readVersion: 1, reader: summarySource, provider: indexSource,
  namespace: INDEX, supportedSchemaVersions: [1, 2], ownerKinds: ["part"] }];
export const crossInventory = { inventoryVersion: 1, requirements: [
  { requirementVersion: 1, namespace: INDEX, ...indexSource,
    supportedSchemaVersions: [1, 2], requiredForWrite: true },
  { requirementVersion: 1, namespace: SUMMARY, ...summarySource,
    supportedSchemaVersions: [1, 2], requiredForWrite: true },
] };
export const crossTrace: { plugin: string; phase: string; view: DomainContributionReadViewV1 }[] = [];
export let crossForeignWrite = false;
export function setCrossForeignWrite(value: boolean): void { crossForeignWrite = value; }
function defined<T>(result: OfficialModuleDefinitionResultV1<T>): T {
  if (result.status !== "defined") throw new Error("cross-plugin definition");
  return result.value;
}
function issue(source: typeof indexSource, reason: string): ModuleKernelIssue {
  const result = createModuleKernelIssueV1({ code: `${source.moduleId}.${reason}`, source: { kind: "module", ...source } });
  if (result.status !== "created") throw new Error("cross-plugin issue");
  return result.issue;
}
function indexPayload(part: ScoreDocument["parts"][number]): JsonObject {
  const notes: JsonObject[] = [];
  for (const content of part.measureContents) for (const voice of content.voices) for (const event of voice.sequence.events) {
    if (event.content.kind === "notes") for (const note of event.content.notes) notes.push({ id: note.id,
      pitch: `${note.writtenPitch.step}/${note.writtenPitch.alter}/${note.writtenPitch.octave}` });
  }
  return { notes };
}
function dependencies(view: DomainContributionReadViewV1): readonly ExtensionBlock[] | undefined {
  const reads = (view as Partial<DomainContributionDependencyReadViewV1>).dependencyReads;
  const read = reads?.find(entry => entry.namespace === INDEX && entry.provider.moduleId === indexSource.moduleId
    && entry.provider.contributionId === indexSource.contributionId);
  return read?.blocks;
}
function makePlugin(summary: boolean) {
  const source = summary ? summarySource : indexSource, namespace = summary ? SUMMARY : INDEX;
  const effectKind = `${namespace}.replace`, commandId = `${namespace}.reconcile`;
  const effect = defined(defineModuleEffectV1<boolean>({ descriptor: { descriptorVersion: 1, effectKind, source, namespace,
    ownerKinds: summary ? ["score"] : ["part"], supportedSchemaVersions: [1, 2] },
    decode: input => {
      const record = readExactDataRecord(input, ["clear"]);
      return typeof record?.clear === "boolean" ? { status: "decoded", payload: record.clear } : { status: "invalid" };
    },
    transform: input => {
      crossTrace.push({ plugin: namespace, phase: "transform", view: input.view });
      if (input.payload) return { status: "remove" };
      if (summary) {
        const blocks = dependencies(input.view);
        if (blocks === undefined) return { status: "rejected", issues: [issue(source, "dependency-unavailable")] };
        return { status: "replace", schemaVersion: 1, payload: { parts: blocks.map(block => ({
          id: block.owner.kind === "part" ? block.owner.partId : "invalid", notes: block.payload.notes! })) } };
      }
      const part = input.view.coreDocument.parts.find(part => input.owner.kind === "part" && part.id === input.owner.partId);
      return part === undefined ? { status: "rejected", issues: [issue(source, "missing-part")] }
        : { status: "replace", schemaVersion: 1, payload: indexPayload(part) };
    },
  }));
  const command = defined(defineDomainCommandV1<boolean>({ descriptor: { descriptorVersion: 1, commandId, commandVersion: 1,
    source, targetKind: "document", requiredCapabilities: ["command:execute", "score:read"], titleKey: `${commandId}.title` },
    decode: input => {
      const record = readExactDataRecord(input.payload, ["clear"]);
      return typeof record?.clear === "boolean" ? { status: "decoded", command: record.clear } : { status: "invalid" };
    },
    prepare: (view, clear) => {
      crossTrace.push({ plugin: namespace, phase: "prepare", view });
      const owners = summary ? [{ kind: "score" as const }] : view.coreDocument.parts.map(part => ({ kind: "part" as const, partId: part.id }));
      const effects: DomainEffectRequestV1[] = owners.map(owner => ({ requestVersion: 1, requestKind: "module.extension",
        effectKind: summary && crossForeignWrite ? `${INDEX}.replace` : effectKind,
        namespace: summary && crossForeignWrite ? INDEX : namespace, owner, payload: { clear } }));
      return effects.length === 0 ? { status: "no-op" } : { status: "changed", effectRequests: effects as [DomainEffectRequestV1, ...DomainEffectRequestV1[]],
        affected: [{ kind: "document", documentId: view.documentId }] };
    },
  }));
  const contribution = defined(defineDomainCommandContributionV1({ apiVersion: 1, ...source, extensionNamespaces: [namespace],
    extensionRequirements: [{ requirementVersion: 1, namespace, ...source, supportedSchemaVersions: [1, 2], requiredForWrite: true }],
    commands: [command], effects: [effect],
    validate: view => {
      crossTrace.push({ plugin: namespace, phase: "validate", view });
      if (!view.compatibleExtensions.length) return [];
      if (summary && dependencies(view) === undefined) return [issue(source, "dependency-unavailable")];
      // Independent oracle: compare every stored reference to Core, without
      // invoking the index producer or summary transformer.
      const expected = new Map<string, Map<string, string>>();
      for (const part of view.coreDocument.parts) {
        const notes = new Map<string, string>();
        for (const content of part.measureContents) for (const voice of content.voices) for (const event of voice.sequence.events) {
          if (event.content.kind === "notes") for (const note of event.content.notes) {
            const pitch = note.writtenPitch;
            notes.set(note.id, [pitch.step, pitch.alter, pitch.octave].join("/"));
          }
        }
        expected.set(part.id, notes);
      }
      const rows: unknown[] = [];
      if (summary) {
        if (view.compatibleExtensions.length !== 1 || !Array.isArray(view.compatibleExtensions[0]!.payload.parts)) return [issue(source, "stale")];
        rows.push(...view.compatibleExtensions[0]!.payload.parts);
      } else for (const block of view.compatibleExtensions) rows.push({ id: block.owner.kind === "part" ? block.owner.partId : "", notes: block.payload.notes });
      if (rows.length !== expected.size) return [issue(source, "stale")];
      const seen = new Set<string>();
      for (const input of rows) {
        const row = readExactDataRecord(input, ["id", "notes"]);
        const notes = typeof row?.id === "string" ? expected.get(row.id) : undefined;
        if (notes === undefined || seen.has(row!.id as string) || !Array.isArray(row?.notes) || row.notes.length !== notes.size) return [issue(source, "stale")];
        seen.add(row!.id as string);
        const matched = new Set<string>();
        for (const input of row.notes) {
          const note = readExactDataRecord(input, ["id", "pitch"]);
          if (typeof note?.id !== "string" || matched.has(note.id) || notes.get(note.id) !== note.pitch) return [issue(source, "stale")];
          matched.add(note.id);
        }
      }
      return [];
    }, classify: view => { crossTrace.push({ plugin: namespace, phase: "classify", view }); return { status: "supported", issues: [] }; },
  }));
  return defined(defineDomainCommandRegistrationEntryV1({ kind: "domain-command", registrationEntryId: "kernel.domain-commands.v1", ownerModuleId: source.moduleId, contributions: [contribution] }));
}
const indexEntry = makePlugin(false), summaryEntry = makePlugin(true);
const entries = [indexEntry, summaryEntry];
function compileCrossBase(
  sources: readonly { readonly moduleId: string; readonly contributionId: string }[],
  registrations: readonly ReturnType<typeof makePlugin>[],
) {
  const manifest = { startupManifestVersion: 1, modules: [
    { moduleId: "core.commands", origin: "official", runtime: "builtin", trustLevel: "system-trusted", apiVersion: 1, capabilities: ["command:register"], registrationEntryIds: ["core.commands.v1"] },
    { moduleId: "core.selectors", origin: "official", runtime: "builtin", trustLevel: "system-trusted", apiVersion: 1, capabilities: ["selector:register"], registrationEntryIds: ["core.selectors.v1"] },
    ...sources.map(source => ({ moduleId: source.moduleId, origin: "official", runtime: "internal-module", trustLevel: "system-trusted", apiVersion: 1,
      capabilities: ["command:register", "command:execute", "score:read", "event:subscribe"], registrationEntryIds: ["kernel.domain-commands.v1"] })),
  ] };
  const compiled = compileOfficialModuleCatalogV1(manifest, [...registrations]);
  if (!compiled.ok) throw new Error(JSON.stringify(compiled));
  return compiled.catalog;
}
export function crossCatalog(withReads = true, declarations: unknown = crossReads) {
  const base = compileCrossBase([indexSource, summarySource], entries);
  if (!withReads) return base;
  const result = compileContributionReadCatalogV1(base, declarations);
  if (!result.ok) throw new Error(JSON.stringify(result));
  return result.catalog;
}
export function crossCatalogWithoutIndex(withReads = true, declarations: unknown = crossReads) {
  const base = compileCrossBase([summarySource], [summaryEntry]);
  if (!withReads) return base;
  const result = compileContributionReadCatalogV1(base, declarations, crossInventory);
  if (!result.ok) throw new Error(JSON.stringify(result));
  return result.catalog;
}
export function crossCommand(summary: boolean, clear = false) {
  return { commandVersion: 1, commandId: `${summary ? SUMMARY : INDEX}.reconcile`, target: { kind: "document", documentId: "score-1" }, payload: { clear } };
}
