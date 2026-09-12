// Test-only business consumer. This is not the production Guitar Domain plugin.
// Standard six-string tuning, frets 0..24, octave-transposing guitar notation.
import {
  compileOfficialModuleCatalogV1, createModuleKernelIssueV1,
  defineDomainCommandContributionV1, defineDomainCommandRegistrationEntryV1,
  defineDomainCommandV1, defineModuleEffectV1,
  type DomainContributionReadViewV1, type OfficialModuleDefinitionResultV1,
} from "../../../src/core-kernel/module-sdk/index";
import type { JsonObject, WrittenPitch } from "../../../src/core-kernel/index";
import { readExactDataRecord } from "../../../src/core-kernel/registry/strict-codec";

export const GUITAR_NAMESPACE = "fixture.guitar.positions";
const source = { moduleId: "fixture.guitar", contributionId: "fixture.guitar.editing" };
const effectKind = `${GUITAR_NAMESPACE}.replace`;
export const GUITAR_COMMAND = `${GUITAR_NAMESPACE}.set-position`;
type Position = { string: number; fret: number };
type Edit = { partId: string; noteId: string; position: Position | null };
const openStrings = [64, 59, 55, 50, 45, 40] as const;

function defined<T>(result: OfficialModuleDefinitionResultV1<T>): T {
  if (result.status !== "defined") throw new Error(`minimal guitar definition failed: ${JSON.stringify(result)}`);
  return result.value;
}
function issue(reason: string) {
  const result = createModuleKernelIssueV1({ code: `fixture.guitar.${reason}`, source: { kind: "module", ...source } });
  if (result.status !== "created") throw new Error("minimal guitar issue failed");
  return result.issue;
}
function position(input: unknown): Position | undefined {
  const row = readExactDataRecord(input, ["string", "fret"]);
  if (typeof row?.string !== "number" || !Number.isInteger(row.string) || row.string < 1 || row.string > 6
    || typeof row.fret !== "number" || !Number.isInteger(row.fret) || row.fret < 0 || row.fret > 24) return undefined;
  return { string: row.string, fret: row.fret };
}
function decodeEdit(input: unknown): Edit | undefined {
  const row = readExactDataRecord(input, ["partId", "noteId", "position"]);
  if (typeof row?.partId !== "string" || typeof row.noteId !== "string") return undefined;
  const captured = row.position === null ? null : position(row.position);
  return captured === undefined ? undefined : { partId: row.partId, noteId: row.noteId, position: captured };
}
function notes(view: DomainContributionReadViewV1, partId: string) {
  const part = view.coreDocument.parts.find(entry => entry.id === partId);
  return part?.measureContents.flatMap(content => content.voices.flatMap(voice => voice.sequence.events.flatMap(event =>
    event.content.kind === "notes" ? event.content.notes : []))) ?? [];
}
function writtenPitch(value: Position): WrittenPitch {
  const midi = openStrings[value.string - 1]! + value.fret + 12;
  const steps = ["C", "C", "D", "D", "E", "F", "F", "G", "G", "A", "A", "B"] as const;
  return { step: steps[midi % 12]!, alter: [1, 3, 6, 8, 10].includes(midi % 12) ? 1 : 0, octave: Math.floor(midi / 12) - 1 };
}

export function minimalGuitarCatalog() {
  const effect = defined(defineModuleEffectV1<Edit>({
    descriptor: { descriptorVersion: 1, effectKind, source, namespace: GUITAR_NAMESPACE,
      ownerKinds: ["part"], supportedSchemaVersions: [1] },
    decode: input => { const edit = decodeEdit(input); return edit === undefined ? { status: "invalid" } : { status: "decoded", payload: edit }; },
    transform: input => {
      if (input.owner.kind !== "part" || input.owner.partId !== input.payload.partId)
        return { status: "rejected", issues: [issue("wrong-owner")] };
      const previous = input.currentBlock?.payload.placements;
      if (previous !== undefined && !Array.isArray(previous)) return { status: "rejected", issues: [issue("invalid-placements")] };
      const placements = (previous ?? []).filter(row => (row as JsonObject).noteId !== input.payload.noteId);
      if (input.payload.position !== null) placements.push({ noteId: input.payload.noteId, ...input.payload.position });
      placements.sort((a, b) => String((a as JsonObject).noteId) < String((b as JsonObject).noteId) ? -1 : 1);
      return { status: "replace", schemaVersion: 1, payload: { tuning: "standard-6", placements } };
    },
  }));
  const command = defined(defineDomainCommandV1<Edit>({
    descriptor: { descriptorVersion: 1, commandId: GUITAR_COMMAND, commandVersion: 1, source,
      targetKind: "document", requiredCapabilities: ["command:execute", "score:read"], titleKey: "fixture.guitar.set-position.title" },
    decode: input => { const edit = decodeEdit(input.payload); return edit === undefined ? { status: "invalid" } : { status: "decoded", command: edit }; },
    prepare: (view, edit) => {
      const part = view.coreDocument.parts.find(part => part.id === edit.partId);
      if (part === undefined || part.instrument.writtenToSounding.chromaticSemitones !== -12
        || part.instrument.writtenToSounding.diatonicSteps !== -7)
        return { status: "rejected", issues: [issue("unsupported-instrument")] };
      if (edit.position !== null && !notes(view, edit.partId).some(note => note.id === edit.noteId))
        return { status: "rejected", issues: [issue("missing-note")] };
      const extension = { requestVersion: 1 as const, requestKind: "module.extension" as const,
        effectKind, namespace: GUITAR_NAMESPACE, owner: { kind: "part" as const, partId: edit.partId },
        payload: { partId: edit.partId, noteId: edit.noteId, position: edit.position === null ? null : { ...edit.position } } };
      return { status: "changed", effectRequests: edit.position === null ? [extension] : [
        { requestVersion: 1, requestKind: "core.note.replace-written-pitch", target: { kind: "note", noteId: edit.noteId }, writtenPitch: writtenPitch(edit.position) }, extension,
      ], affected: [{ kind: "document", documentId: view.documentId }] };
    },
  }));
  const contribution = defined(defineDomainCommandContributionV1({
    apiVersion: 1, ...source, extensionNamespaces: [GUITAR_NAMESPACE],
    extensionRequirements: [{ requirementVersion: 1, namespace: GUITAR_NAMESPACE, ...source, supportedSchemaVersions: [1], requiredForWrite: true }],
    commands: [command], effects: [effect],
    validate: view => {
      // Check pitch independently from the command's pitch producer.
      const semitones = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
      for (const block of view.compatibleExtensions) {
        const payload = readExactDataRecord(block.payload, ["tuning", "placements"]);
        if (block.owner.kind !== "part" || payload?.tuning !== "standard-6" || !Array.isArray(payload.placements)) return [issue("invalid-block")];
        const part = view.coreDocument.parts.find(part => block.owner.kind === "part" && part.id === block.owner.partId);
        if (part === undefined || part.instrument.writtenToSounding.chromaticSemitones !== -12
          || part.instrument.writtenToSounding.diatonicSteps !== -7) return [issue("unsupported-instrument")];
        const seen = new Set<string>();
        for (const entry of payload.placements) {
          const row = readExactDataRecord(entry, ["noteId", "string", "fret"]);
          if (typeof row?.noteId !== "string" || seen.has(row.noteId)) return [issue("invalid-position")];
          seen.add(row.noteId);
          const placement = position({ string: row.string, fret: row.fret });
          const note = notes(view, part.id).find(note => note.id === row.noteId);
          if (placement === undefined || note === undefined) return [issue("dangling-position")];
          const pitch = note.writtenPitch;
          const soundingMidi = 12 * (pitch.octave + 1) + semitones[pitch.step] + pitch.alter - 12;
          if (soundingMidi !== openStrings[placement.string - 1]! + placement.fret) return [issue("pitch-position-mismatch")];
        }
      }
      return [];
    },
    classify: () => ({ status: "supported", issues: [] }),
  }));
  const registration = defined(defineDomainCommandRegistrationEntryV1({ kind: "domain-command", registrationEntryId: "kernel.domain-commands.v1",
    ownerModuleId: source.moduleId, contributions: [contribution] }));
  const compiled = compileOfficialModuleCatalogV1({ startupManifestVersion: 1, modules: [
    { moduleId: "core.commands", origin: "official", runtime: "builtin", trustLevel: "system-trusted", apiVersion: 1,
      capabilities: ["command:register"], registrationEntryIds: ["core.commands.v1"] },
    { moduleId: "core.selectors", origin: "official", runtime: "builtin", trustLevel: "system-trusted", apiVersion: 1,
      capabilities: ["selector:register"], registrationEntryIds: ["core.selectors.v1"] },
    { moduleId: source.moduleId, origin: "official", runtime: "internal-module", trustLevel: "system-trusted", apiVersion: 1,
      capabilities: ["command:register", "command:execute", "score:read", "event:subscribe"], registrationEntryIds: ["kernel.domain-commands.v1"] },
  ] }, [registration]);
  if (!compiled.ok) throw new Error(JSON.stringify(compiled));
  return compiled.catalog;
}
