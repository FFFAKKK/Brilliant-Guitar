// A real compiled SDK consumer: Core notes -> Part-owned index -> Score summary.
// All business rules stay here, outside the microkernel. Both extension layers
// belong to this contribution; this is not an undeclared cross-plugin read API.
import {
  compileOfficialModuleCatalogV1, createModuleKernelIssueV1, defineDomainCommandContributionV1,
  defineDomainCommandRegistrationEntryV1, defineDomainCommandV1, defineModuleEffectV1,
  type DomainContributionReadViewV1, type DomainEffectRequestV1, type ModuleKernelIssue,
  type OfficialModuleDefinitionResultV1,
} from "../../../src/core-kernel/module-sdk/index";
import type { ExtensionBlock, ExtensionOwner, JsonObject, ScoreDocument } from "../../../src/core-kernel/index";
import { readExactDataRecord } from "../../../src/core-kernel/registry/strict-codec";
import { createCoreScoreFixture } from "./core-score";

export const RELATION_MODULE = "fixture.relations.module";
const CONTRIBUTION = "fixture.relations.contribution";
export const INDEX_NAMESPACE = "fixture.relations.index";
export const SUMMARY_NAMESPACE = "fixture.relations.summary";
const source = { moduleId: RELATION_MODULE, contributionId: CONTRIBUTION };
export const relationCalls = { prepare: 0, index: 0, summary: 0, validate: 0, classify: 0 };
export const relationTrace: { operation: string; payload: JsonObject }[] = [];
export function resetRelations(): void {
  for (const key of Object.keys(relationCalls) as (keyof typeof relationCalls)[]) relationCalls[key] = 0;
  relationTrace.length = 0;
}
function defined<T>(result: OfficialModuleDefinitionResultV1<T>): T {
  if (result.status !== "defined") throw new Error("invalid relationship consumer definition");
  return result.value;
}
function issue(code: "stale-index" | "stale-summary" | "invalid-payload"): ModuleKernelIssue {
  const result = createModuleKernelIssueV1({ code: `fixture.relations.module.${code}`, source: { kind: "module", ...source } });
  if (result.status !== "created") throw new Error("invalid relationship issue");
  return result.issue;
}
function indexPayload(part: ScoreDocument["parts"][number]): JsonObject {
  const notes: JsonObject[] = [];
  for (const content of part.measureContents) for (const voice of content.voices) for (const event of voice.sequence.events) {
    if (event.content.kind === "notes") for (const note of event.content.notes) {
      notes.push({ noteId: note.id, writtenPitch: `${note.writtenPitch.step}/${note.writtenPitch.alter}/${note.writtenPitch.octave}` });
    }
  }
  return { notes };
}
// The upper layer deliberately reads stored extension data, not Core notes.
// Reversing effect order after an edit therefore produces an invalid summary.
function summaryPayload(view: DomainContributionReadViewV1): JsonObject {
  const parts = view.compatibleExtensions.filter(block => block.namespace === INDEX_NAMESPACE && block.owner.kind === "part")
    .map(block => ({ partId: block.owner.kind === "part" ? block.owner.partId : "", notes: block.payload.notes! }))
    .sort((a, b) => a.partId < b.partId ? -1 : a.partId > b.partId ? 1 : 0);
  return { parts };
}
function request(namespace: string, owner: ExtensionOwner, remove = false): DomainEffectRequestV1 {
  return { requestVersion: 1, requestKind: "module.extension", effectKind: `${namespace}.replace`, namespace, owner, payload: { remove } };
}
const indexEffect = defined(defineModuleEffectV1<{ remove: boolean }>({
  descriptor: { descriptorVersion: 1, effectKind: `${INDEX_NAMESPACE}.replace`, source,
    namespace: INDEX_NAMESPACE, ownerKinds: ["part"], supportedSchemaVersions: [1] },
  decode: input => {
    const record = readExactDataRecord(input, ["remove"]);
    return typeof record?.remove === "boolean" ? { status: "decoded", payload: { remove: record.remove } } : { status: "invalid" };
  },
  transform: input => {
    relationCalls.index++;
    if (input.payload.remove) return { status: "remove" };
    const part = input.view.coreDocument.parts.find(part => input.owner.kind === "part" && part.id === input.owner.partId);
    if (part === undefined) return { status: "rejected", issues: [issue("invalid-payload")] };
    const payload = indexPayload(part);
    relationTrace.push({ operation: "index", payload });
    return { status: "replace", schemaVersion: 1, payload };
  },
}));
const summaryEffect = defined(defineModuleEffectV1<{ remove: boolean }>({
  descriptor: { descriptorVersion: 1, effectKind: `${SUMMARY_NAMESPACE}.replace`, source,
    namespace: SUMMARY_NAMESPACE, ownerKinds: ["score"], supportedSchemaVersions: [1] },
  decode: input => {
    const record = readExactDataRecord(input, ["remove"]);
    return typeof record?.remove === "boolean" ? { status: "decoded", payload: { remove: record.remove } } : { status: "invalid" };
  },
  transform: input => {
    relationCalls.summary++;
    if (input.payload.remove) return { status: "remove" };
    const payload = summaryPayload(input.view);
    relationTrace.push({ operation: "summary", payload });
    return { status: "replace", schemaVersion: 1, payload };
  },
}));

type Mode = "all" | "part-only" | "summary-first" | "clear";
const command = defined(defineDomainCommandV1<Mode>({
  descriptor: { descriptorVersion: 1, commandId: "fixture.relations.index.reconcile", commandVersion: 1, source,
    targetKind: "document", requiredCapabilities: ["command:execute", "score:read"], titleKey: "fixture.relations.index.reconcile.title" },
  decode: input => {
    const record = readExactDataRecord(input.payload, ["mode"]);
    return record?.mode === "all" || record?.mode === "part-only" || record?.mode === "summary-first" || record?.mode === "clear"
      ? { status: "decoded", command: record.mode } : { status: "invalid" };
  },
  prepare: (view, mode) => {
    relationCalls.prepare++;
    const requests = view.coreDocument.parts.map(part => request(INDEX_NAMESPACE, { kind: "part", partId: part.id }, mode === "clear"));
    const summary = request(SUMMARY_NAMESPACE, { kind: "score" }, mode === "clear");
    if (mode === "summary-first") requests.unshift(summary);
    else if (mode !== "part-only") requests.push(summary);
    const [first, ...rest] = requests;
    if (first === undefined) return { status: "no-op" };
    return { status: "changed", effectRequests: [first, ...rest], affected: [
      { kind: "document", documentId: view.documentId }, ...view.coreDocument.parts.map(part => ({ kind: "part" as const, partId: part.id })),
    ] };
  },
}));

// Independent validation walks Core references and compares fields individually;
// it never calls either transformer or regenerates their payloads as an oracle.
function validate(view: DomainContributionReadViewV1): readonly ModuleKernelIssue[] {
  relationCalls.validate++;
  const blocks = view.compatibleExtensions;
  if (blocks.length === 0) return [];
  const expected = new Map<string, Map<string, string>>();
  for (const part of view.coreDocument.parts) {
    const notes = new Map<string, string>();
    for (const content of part.measureContents) for (const voice of content.voices) for (const event of voice.sequence.events) {
      if (event.content.kind !== "notes") continue;
      for (const note of event.content.notes) {
        const { step, alter, octave } = note.writtenPitch;
        notes.set(note.id, [step, alter, octave].join("/"));
      }
    }
    expected.set(part.id, notes);
  }
  const indices = blocks.filter(block => block.namespace === INDEX_NAMESPACE);
  if (indices.length !== expected.size) return [issue("stale-index")];
  const seen = new Set<string>();
  for (const block of indices) {
    if (block.owner.kind !== "part" || seen.has(block.owner.partId)) return [issue("invalid-payload")];
    seen.add(block.owner.partId);
    const notes = expected.get(block.owner.partId);
    const payload = readExactDataRecord(block.payload, ["notes"]);
    if (notes === undefined || !Array.isArray(payload?.notes) || payload.notes.length !== notes.size) return [issue("stale-index")];
    const matched = new Set<string>();
    for (const entry of payload.notes) {
      const note = readExactDataRecord(entry, ["noteId", "writtenPitch"]);
      if (typeof note?.noteId !== "string" || matched.has(note.noteId) || notes.get(note.noteId) !== note.writtenPitch) return [issue("stale-index")];
      matched.add(note.noteId);
    }
  }
  const summaries = blocks.filter(block => block.namespace === SUMMARY_NAMESPACE);
  if (summaries.length !== 1 || summaries[0]!.owner.kind !== "score") return [issue("stale-summary")];
  const payload = readExactDataRecord(summaries[0]!.payload, ["parts"]);
  if (!Array.isArray(payload?.parts) || payload.parts.length !== expected.size) return [issue("stale-summary")];
  const matchedParts = new Set<string>();
  for (const entry of payload.parts) {
    const part = readExactDataRecord(entry, ["partId", "notes"]);
    if (typeof part?.partId !== "string" || matchedParts.has(part.partId) || !Array.isArray(part.notes)) return [issue("stale-summary")];
    const notes = expected.get(part.partId);
    if (notes === undefined || part.notes.length !== notes.size) return [issue("stale-summary")];
    matchedParts.add(part.partId);
    const matchedNotes = new Set<string>();
    for (const entry of part.notes) {
      const note = readExactDataRecord(entry, ["noteId", "writtenPitch"]);
      if (typeof note?.noteId !== "string" || matchedNotes.has(note.noteId) || notes.get(note.noteId) !== note.writtenPitch) return [issue("stale-summary")];
      matchedNotes.add(note.noteId);
    }
  }
  return [];
}
export const RELATION_CONTRIBUTION = defined(defineDomainCommandContributionV1({
  apiVersion: 1, ...source, extensionNamespaces: [INDEX_NAMESPACE, SUMMARY_NAMESPACE],
  extensionRequirements: [INDEX_NAMESPACE, SUMMARY_NAMESPACE].map(namespace => ({ requirementVersion: 1,
    namespace, ...source, supportedSchemaVersions: [1], requiredForWrite: true })),
  commands: [command], effects: [indexEffect, summaryEffect], validate,
  classify: () => { relationCalls.classify++; return { status: "supported", issues: [] }; },
}));
const entry = defined(defineDomainCommandRegistrationEntryV1({ registrationEntryId: "kernel.domain-commands.v1",
  ownerModuleId: RELATION_MODULE, kind: "domain-command", contributions: [RELATION_CONTRIBUTION] }));
const manifest = { startupManifestVersion: 1, modules: [
  { moduleId: "core.commands", origin: "official", runtime: "builtin", trustLevel: "system-trusted", apiVersion: 1, capabilities: ["command:register"], registrationEntryIds: ["core.commands.v1"] },
  { moduleId: "core.selectors", origin: "official", runtime: "builtin", trustLevel: "system-trusted", apiVersion: 1, capabilities: ["selector:register"], registrationEntryIds: ["core.selectors.v1"] },
  { moduleId: RELATION_MODULE, origin: "official", runtime: "internal-module", trustLevel: "system-trusted", apiVersion: 1,
    capabilities: ["command:register", "command:execute", "score:read", "event:subscribe"], registrationEntryIds: ["kernel.domain-commands.v1"] },
] };
export function relationCatalog(installed = true) {
  const result = compileOfficialModuleCatalogV1(installed ? manifest : { ...manifest, modules: manifest.modules.slice(0, 2) }, installed ? [entry] : []);
  if (!result.ok) throw new Error(`relationship catalog: ${JSON.stringify(result.failure)}`);
  return result.catalog;
}
export function reconcile(mode: Mode = "all") {
  return { commandVersion: 1, commandId: "fixture.relations.index.reconcile", target: { kind: "document", documentId: "score-1" }, payload: { mode } };
}
export function relationshipDocument(): ScoreDocument {
  const document = createCoreScoreFixture();
  const emptyPart = { ...document.parts[0]!, id: "part-empty", name: "Empty part",
    staves: document.parts[0]!.staves.map(staff => ({ ...staff, id: "staff-empty" })),
    measureContents: document.parts[0]!.measureContents.map(content => ({ ...content, voices: content.voices.map(voice => ({ ...voice,
      id: "voice-empty", defaultStaffId: "staff-empty", sequence: { ...voice.sequence, events: [] } })) })) };
  const extensions: ExtensionBlock[] = [{ namespace: "opaque.uninstalled", schemaVersion: 11, owner: { kind: "score" }, payload: { keep: ["\ud800", -0] } }];
  return { ...document, parts: [...document.parts, emptyPart], extensions };
}
