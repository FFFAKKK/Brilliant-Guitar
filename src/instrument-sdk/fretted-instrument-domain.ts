import type { ScoreEntityTarget } from "../core-kernel/commands/contracts";
import type { ExtensionBlock, JsonObject } from "../core-kernel/domain/extensions";
import { isWrittenPitch, type WrittenPitch } from "../core-kernel/domain/pitch";
import type {
  InstrumentDescriptor,
  ScoreDocument,
  ScoreNote,
} from "../core-kernel/domain/score-document";
import {
  compileOfficialModuleCatalogV1,
  createModuleKernelIssueV1,
  defineDomainCommandContributionV1,
  defineDomainCommandRegistrationEntryV1,
  defineDomainCommandV1,
  defineModuleEffectV1,
  type CompiledDomainCommandRegistrationEntryV1,
  type DomainContributionReadViewV1,
  type DomainEffectRequestV1,
  type ModuleKernelIssue,
  type OfficialModuleCatalogCompilationResultV1,
  type OfficialModuleDefinitionResultV1,
} from "../core-kernel/module-sdk/index";
import { CORE_KERNEL_STARTUP_MANIFEST } from "../core-kernel/registry/builtins";
import type { KernelStartupModuleManifest } from "../core-kernel/registry/contracts";
import { readExactDataRecord } from "../core-kernel/registry/strict-codec";

export interface FrettedStringTuningV1 {
  readonly stringNumber: number;
  readonly soundingPitch: WrittenPitch;
}

export interface FrettedPositionV1 {
  readonly noteId: string;
  readonly stringNumber: number;
  readonly fret: number;
}

export interface FrettedTechniqueIdentityV1 {
  readonly id: string;
  readonly kind: string;
}

export interface FrettedInstrumentStateV1<TTechnique extends FrettedTechniqueIdentityV1> {
  readonly stringCount: number;
  readonly fretCount: number;
  readonly capoFret: number;
  readonly tuning: readonly FrettedStringTuningV1[];
  readonly placements: readonly FrettedPositionV1[];
  readonly techniques: readonly TTechnique[];
}

export interface FrettedLocatedNoteV1 {
  readonly note: ScoreNote;
  readonly eventId: string;
  readonly order: number;
}

export interface FrettedTechniqueValidationContextV1 {
  readonly notes: ReadonlyMap<string, FrettedLocatedNoteV1>;
  readonly placements: ReadonlyMap<string, FrettedPositionV1>;
}

/** A technique owns its payload; the fretted family only owns identity, targeting, and lifecycle. */
export interface FrettedTechniqueAdapterV1<TTechnique extends FrettedTechniqueIdentityV1> {
  decode(value: unknown): TTechnique | undefined;
  encode(value: TTechnique): JsonObject;
  equals(left: TTechnique, right: TTechnique): boolean;
  targetNoteIds(value: TTechnique): readonly string[];
  validate(
    value: TTechnique,
    context: FrettedTechniqueValidationContextV1,
  ): string | undefined;
  validateCollection(values: readonly TTechnique[]): string | undefined;
}

export interface FrettedInstrumentProfileV1<TTechnique extends FrettedTechniqueIdentityV1> {
  readonly id: string;
  readonly displayName: string;
  readonly schemaVersion: 1;
  readonly stringCount: number;
  readonly fretCount: number;
  readonly capoFret: number;
  readonly tuning: readonly FrettedStringTuningV1[];
  /** Sounding-to-written chromatic offset; octave-transposing instruments use +12. */
  readonly writtenPitchOffsetSemitones: number;
  readonly supportsChords: boolean;
  readonly matchesInstrument: (instrument: InstrumentDescriptor) => boolean;
  readonly techniques: FrettedTechniqueAdapterV1<TTechnique>;
}

export type FrettedInstrumentReadV1<TTechnique extends FrettedTechniqueIdentityV1> =
  | { readonly status: "absent" }
  | { readonly status: "valid"; readonly state: FrettedInstrumentStateV1<TTechnique> }
  | { readonly status: "invalid" };

export interface DefinedFrettedInstrumentDomainV1<TTechnique extends FrettedTechniqueIdentityV1> {
  readonly namespace: string;
  readonly commandIds: Readonly<{
    initialize: string;
    setTuning: string;
    setPosition: string;
    setTechnique: string;
    removeTechnique: string;
  }>;
  readonly registrationEntries: readonly CompiledDomainCommandRegistrationEntryV1[];
  readonly startupManifest: KernelStartupModuleManifest;
  readPart(
    document: Pick<ScoreDocument, "extensions">,
    partId: string,
  ): FrettedInstrumentReadV1<TTechnique>;
  compileCatalog(): OfficialModuleCatalogCompilationResultV1;
}

type InitializeEditV1 = { readonly kind: "initialize"; readonly partId: string };
type SetTuningEditV1 = {
  readonly kind: "set-tuning";
  readonly partId: string;
  readonly tuning: readonly FrettedStringTuningV1[];
};
type SetPositionEditV1 = {
  readonly kind: "set-position";
  readonly partId: string;
  readonly noteId: string;
  readonly position: Omit<FrettedPositionV1, "noteId"> | null;
};
type SetTechniqueEditV1<TTechnique extends FrettedTechniqueIdentityV1> = {
  readonly kind: "set-technique";
  readonly partId: string;
  readonly technique: TTechnique;
};
type RemoveTechniqueEditV1 = {
  readonly kind: "remove-technique";
  readonly partId: string;
  readonly techniqueId: string;
};
type FrettedMutationV1<TTechnique extends FrettedTechniqueIdentityV1> =
  | InitializeEditV1
  | SetTuningEditV1
  | SetPositionEditV1
  | SetTechniqueEditV1<TTechnique>
  | RemoveTechniqueEditV1;

const DOTTED_ID = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/;
const NATURAL_SEMITONES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 } as const;
const SHARP_SPELLING = [
  { step: "C", alter: 0 }, { step: "C", alter: 1 },
  { step: "D", alter: 0 }, { step: "D", alter: 1 },
  { step: "E", alter: 0 }, { step: "F", alter: 0 },
  { step: "F", alter: 1 }, { step: "G", alter: 0 },
  { step: "G", alter: 1 }, { step: "A", alter: 0 },
  { step: "A", alter: 1 }, { step: "B", alter: 0 },
] as const;

function defined<T>(result: OfficialModuleDefinitionResultV1<T>, displayName: string): T {
  if (result.status !== "defined") {
    throw new Error(`Unable to define the first-party ${displayName} domain module`);
  }
  return result.value;
}

function isEntityId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 256;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function samePitch(left: WrittenPitch, right: WrittenPitch): boolean {
  return left.step === right.step && left.alter === right.alter && left.octave === right.octave;
}

function decodePitch(value: unknown): WrittenPitch | undefined {
  return isWrittenPitch(value) ? { step: value.step, alter: value.alter, octave: value.octave } : undefined;
}

function validateProfile<TTechnique extends FrettedTechniqueIdentityV1>(
  profile: FrettedInstrumentProfileV1<TTechnique>,
): void {
  if (!DOTTED_ID.test(profile.id) || !profile.displayName.trim()) {
    throw new Error(`Invalid fretted instrument profile identity: ${profile.id}`);
  }
  if (!Number.isSafeInteger(profile.stringCount) || profile.stringCount < 1 || profile.stringCount > 32
    || !Number.isSafeInteger(profile.fretCount) || profile.fretCount < 1 || profile.fretCount > 36
    || !Number.isSafeInteger(profile.capoFret) || profile.capoFret < 0 || profile.capoFret > profile.fretCount
    || !Number.isSafeInteger(profile.writtenPitchOffsetSemitones)
    || profile.writtenPitchOffsetSemitones < -96 || profile.writtenPitchOffsetSemitones > 96
    || profile.tuning.length !== profile.stringCount) {
    throw new Error(`Invalid fretted instrument profile dimensions: ${profile.id}`);
  }
  for (let index = 0; index < profile.tuning.length; index += 1) {
    const tuning = profile.tuning[index];
    if (tuning?.stringNumber !== index + 1 || !isWrittenPitch(tuning.soundingPitch)) {
      throw new Error(`Invalid fretted instrument tuning: ${profile.id}`);
    }
  }
}

/**
 * Creates the complete official-domain module for one fretted instrument.
 * Concrete instruments provide only a profile and strict technique adapter.
 */
export function defineFrettedInstrumentDomainV1<TTechnique extends FrettedTechniqueIdentityV1>(
  profile: FrettedInstrumentProfileV1<TTechnique>,
): DefinedFrettedInstrumentDomainV1<TTechnique> {
  validateProfile(profile);
  const namespace = profile.id;
  const source = {
    moduleId: namespace,
    contributionId: `${namespace}.editing.v1`,
  } as const;
  const commandIds = Object.freeze({
    initialize: `${namespace}.initialize`,
    setTuning: `${namespace}.set-tuning`,
    setPosition: `${namespace}.set-position`,
    setTechnique: `${namespace}.set-technique`,
    removeTechnique: `${namespace}.remove-technique`,
  });
  const applyMutationEffect = `${namespace}.apply-mutation`;

  function issue(reason: string): ModuleKernelIssue {
    const result = createModuleKernelIssueV1({
      code: `${namespace}.${reason}` as `${string}.${string}`,
      source: { kind: "module", ...source },
    });
    if (result.status !== "created") {
      throw new Error(`Unable to create a ${profile.displayName} domain issue`);
    }
    return result.issue;
  }

  function decodeTuning(value: unknown): readonly FrettedStringTuningV1[] | undefined {
    if (!Array.isArray(value) || value.length !== profile.stringCount) return undefined;
    const tuning: FrettedStringTuningV1[] = [];
    for (let index = 0; index < value.length; index += 1) {
      const row = readExactDataRecord(value[index], ["stringNumber", "soundingPitch"]);
      const pitch = decodePitch(row?.soundingPitch);
      if (row?.stringNumber !== index + 1 || pitch === undefined) return undefined;
      tuning.push({ stringNumber: index + 1, soundingPitch: pitch });
    }
    return tuning;
  }

  function decodePosition(value: unknown, fretCount: number): FrettedPositionV1 | undefined {
    const row = readExactDataRecord(value, ["noteId", "stringNumber", "fret"]);
    return isEntityId(row?.noteId)
      && typeof row.stringNumber === "number" && Number.isSafeInteger(row.stringNumber)
      && row.stringNumber >= 1 && row.stringNumber <= profile.stringCount
      && typeof row.fret === "number" && Number.isSafeInteger(row.fret)
      && row.fret >= 0 && row.fret <= fretCount
      ? { noteId: row.noteId, stringNumber: row.stringNumber, fret: row.fret }
      : undefined;
  }

  function decodeState(value: unknown): FrettedInstrumentStateV1<TTechnique> | undefined {
    const row = readExactDataRecord(value, [
      "stringCount", "fretCount", "capoFret", "tuning", "placements", "techniques",
    ]);
    if (row?.stringCount !== profile.stringCount
      || typeof row.fretCount !== "number" || !Number.isSafeInteger(row.fretCount)
      || row.fretCount < 1 || row.fretCount > 36
      || typeof row.capoFret !== "number" || !Number.isSafeInteger(row.capoFret)
      || row.capoFret < 0 || row.capoFret > row.fretCount) return undefined;
    const tuning = decodeTuning(row.tuning);
    if (tuning === undefined || !Array.isArray(row.placements) || !Array.isArray(row.techniques)) return undefined;

    const placements: FrettedPositionV1[] = [];
    const noteIds = new Set<string>();
    let previousNoteId: string | undefined;
    for (const value of row.placements) {
      const placement = decodePosition(value, row.fretCount);
      if (placement === undefined || noteIds.has(placement.noteId)
        || (previousNoteId !== undefined && previousNoteId >= placement.noteId)) return undefined;
      placements.push(placement);
      noteIds.add(placement.noteId);
      previousNoteId = placement.noteId;
    }

    const techniques: TTechnique[] = [];
    const techniqueIds = new Set<string>();
    let previousTechniqueId: string | undefined;
    for (const value of row.techniques) {
      const technique = profile.techniques.decode(value);
      if (technique === undefined || techniqueIds.has(technique.id)
        || (previousTechniqueId !== undefined && previousTechniqueId >= technique.id)) return undefined;
      techniques.push(technique);
      techniqueIds.add(technique.id);
      previousTechniqueId = technique.id;
    }
    return {
      stringCount: profile.stringCount,
      fretCount: row.fretCount,
      capoFret: row.capoFret,
      tuning,
      placements,
      techniques,
    };
  }

  function initialState(): FrettedInstrumentStateV1<TTechnique> {
    return {
      stringCount: profile.stringCount,
      fretCount: profile.fretCount,
      capoFret: profile.capoFret,
      tuning: profile.tuning.map((entry) => ({
        stringNumber: entry.stringNumber,
        soundingPitch: { ...entry.soundingPitch },
      })),
      placements: [],
      techniques: [],
    };
  }

  function encodeState(state: FrettedInstrumentStateV1<TTechnique>): JsonObject {
    const tuning: JsonObject[] = state.tuning.map((entry) => ({
      stringNumber: entry.stringNumber,
      soundingPitch: { ...entry.soundingPitch },
    }));
    const placements: JsonObject[] = state.placements.map((entry) => ({ ...entry }));
    const techniques: JsonObject[] = state.techniques.map(profile.techniques.encode);
    return {
      stringCount: state.stringCount,
      fretCount: state.fretCount,
      capoFret: state.capoFret,
      tuning,
      placements,
      techniques,
    };
  }

  function blockForPart(blocks: readonly ExtensionBlock[], partId: string): ExtensionBlock | undefined {
    return blocks.find((block) => block.namespace === namespace
      && block.owner.kind === "part" && block.owner.partId === partId);
  }

  function readState(
    view: DomainContributionReadViewV1,
    partId: string,
  ): FrettedInstrumentStateV1<TTechnique> | undefined {
    const block = blockForPart(view.compatibleExtensions, partId);
    return block?.schemaVersion === profile.schemaVersion ? decodeState(block.payload) : undefined;
  }

  function locateNotes(view: DomainContributionReadViewV1, partId: string): ReadonlyMap<string, FrettedLocatedNoteV1> {
    const located = new Map<string, FrettedLocatedNoteV1>();
    const part = view.coreDocument.parts.find((entry) => entry.id === partId);
    let order = 0;
    for (const content of part?.measureContents ?? []) {
      for (const voice of content.voices) {
        for (const event of voice.sequence.events) {
          if (event.content.kind === "notes") {
            for (const note of event.content.notes) {
              located.set(note.id, { note, eventId: event.id, order });
            }
          }
          order += 1;
        }
      }
    }
    return located;
  }

  function matchesPart(view: DomainContributionReadViewV1, partId: string): boolean {
    const part = view.coreDocument.parts.find((entry) => entry.id === partId);
    return part !== undefined && profile.matchesInstrument(part.instrument);
  }

  function writtenPitchForPosition(
    state: FrettedInstrumentStateV1<TTechnique>,
    position: Omit<FrettedPositionV1, "noteId">,
  ): WrittenPitch | undefined {
    const tuning = state.tuning[position.stringNumber - 1];
    if (tuning === undefined || position.fret < 0
      || position.fret + state.capoFret > state.fretCount) return undefined;
    const natural = NATURAL_SEMITONES[tuning.soundingPitch.step];
    const soundingChromatic = tuning.soundingPitch.octave * 12 + natural
      + tuning.soundingPitch.alter + state.capoFret + position.fret;
    const writtenChromatic = soundingChromatic + profile.writtenPitchOffsetSemitones;
    const pitchClass = ((writtenChromatic % 12) + 12) % 12;
    const spelling = SHARP_SPELLING[pitchClass];
    const octave = Math.floor(writtenChromatic / 12);
    return spelling === undefined || octave < 0 || octave > 8
      ? undefined
      : { step: spelling.step, alter: spelling.alter, octave };
  }

  function samePosition(
    left: Omit<FrettedPositionV1, "noteId"> | null,
    right: Omit<FrettedPositionV1, "noteId"> | null,
  ): boolean {
    return left === null ? right === null
      : right !== null && left.stringNumber === right.stringNumber && left.fret === right.fret;
  }

  function sameTuning(
    left: readonly FrettedStringTuningV1[],
    right: readonly FrettedStringTuningV1[],
  ): boolean {
    return left.length === right.length && left.every((entry, index) => {
      const other = right[index];
      return other !== undefined && entry.stringNumber === other.stringNumber
        && samePitch(entry.soundingPitch, other.soundingPitch);
    });
  }

  function validateTechnique(
    technique: TTechnique,
    context: FrettedTechniqueValidationContextV1,
  ): ModuleKernelIssue | undefined {
    for (const noteId of profile.techniques.targetNoteIds(technique)) {
      if (!context.notes.has(noteId)) return issue("dangling-technique");
      if (!context.placements.has(noteId)) return issue("technique-position-required");
    }
    const reason = profile.techniques.validate(technique, context);
    return reason === undefined ? undefined : issue(reason);
  }

  function validateState(
    view: DomainContributionReadViewV1,
    partId: string,
    state: FrettedInstrumentStateV1<TTechnique>,
  ): readonly ModuleKernelIssue[] {
    if (!matchesPart(view, partId)) return [issue("unsupported-instrument")];
    const notes = locateNotes(view, partId);
    const placements = new Map(state.placements.map((entry) => [entry.noteId, entry]));
    const occupiedStrings = new Set<string>();
    for (const placement of state.placements) {
      const located = notes.get(placement.noteId);
      if (located === undefined) return [issue("dangling-position")];
      const expected = writtenPitchForPosition(state, placement);
      if (expected === undefined || !samePitch(expected, located.note.writtenPitch)) {
        return [issue("pitch-position-mismatch")];
      }
      const occupied = `${located.eventId}:${placement.stringNumber}`;
      if (occupiedStrings.has(occupied)) return [issue("string-position-conflict")];
      occupiedStrings.add(occupied);
    }
    const context = { notes, placements };
    for (const technique of state.techniques) {
      const invalid = validateTechnique(technique, context);
      if (invalid !== undefined) return [invalid];
    }
    const collectionReason = profile.techniques.validateCollection(state.techniques);
    return collectionReason === undefined ? [] : [issue(collectionReason)];
  }

  function updatePosition(
    state: FrettedInstrumentStateV1<TTechnique>,
    edit: SetPositionEditV1,
  ): FrettedInstrumentStateV1<TTechnique> {
    const placements = state.placements.filter((entry) => entry.noteId !== edit.noteId);
    if (edit.position !== null) placements.push({ noteId: edit.noteId, ...edit.position });
    placements.sort((left, right) => compareText(left.noteId, right.noteId));
    return { ...state, placements };
  }

  function updateTuning(
    state: FrettedInstrumentStateV1<TTechnique>,
    tuning: readonly FrettedStringTuningV1[],
  ): FrettedInstrumentStateV1<TTechnique> {
    return {
      ...state,
      tuning: tuning.map((entry) => ({
        stringNumber: entry.stringNumber,
        soundingPitch: { ...entry.soundingPitch },
      })),
    };
  }

  function updateTechnique(
    state: FrettedInstrumentStateV1<TTechnique>,
    edit: SetTechniqueEditV1<TTechnique>,
  ): FrettedInstrumentStateV1<TTechnique> {
    const techniques = state.techniques.filter((entry) => entry.id !== edit.technique.id);
    techniques.push(edit.technique);
    techniques.sort((left, right) => compareText(left.id, right.id));
    return { ...state, techniques };
  }

  function removeTechnique(
    state: FrettedInstrumentStateV1<TTechnique>,
    techniqueId: string,
  ): FrettedInstrumentStateV1<TTechnique> {
    return { ...state, techniques: state.techniques.filter((entry) => entry.id !== techniqueId) };
  }

  function decodeInitialize(input: Readonly<{ target: unknown; payload: unknown }>): InitializeEditV1 | undefined {
    const target = readExactDataRecord(input.target, ["kind", "partId"]);
    const payload = readExactDataRecord(input.payload, []);
    return target?.kind === "part" && isEntityId(target.partId) && payload !== undefined
      ? { kind: "initialize", partId: target.partId }
      : undefined;
  }

  function decodeSetTuning(input: Readonly<{ target: unknown; payload: unknown }>): SetTuningEditV1 | undefined {
    const target = readExactDataRecord(input.target, ["kind", "partId"]);
    const payload = readExactDataRecord(input.payload, ["tuning"]);
    const tuning = decodeTuning(payload?.tuning);
    return target?.kind === "part" && isEntityId(target.partId) && tuning !== undefined
      ? { kind: "set-tuning", partId: target.partId, tuning }
      : undefined;
  }

  function decodeSetPosition(input: Readonly<{ target: unknown; payload: unknown }>): SetPositionEditV1 | undefined {
    const target = readExactDataRecord(input.target, ["kind", "partId"]);
    const payload = readExactDataRecord(input.payload, ["noteId", "position"]);
    if (target?.kind !== "part" || !isEntityId(target.partId) || !isEntityId(payload?.noteId)) return undefined;
    if (payload.position === null) {
      return { kind: "set-position", partId: target.partId, noteId: payload.noteId, position: null };
    }
    const position = readExactDataRecord(payload.position, ["stringNumber", "fret"]);
    return typeof position?.stringNumber === "number" && Number.isSafeInteger(position.stringNumber)
      && position.stringNumber >= 1 && position.stringNumber <= profile.stringCount
      && typeof position.fret === "number" && Number.isSafeInteger(position.fret) && position.fret >= 0
      ? {
          kind: "set-position",
          partId: target.partId,
          noteId: payload.noteId,
          position: { stringNumber: position.stringNumber, fret: position.fret },
        }
      : undefined;
  }

  function decodeSetTechnique(
    input: Readonly<{ target: unknown; payload: unknown }>,
  ): SetTechniqueEditV1<TTechnique> | undefined {
    const target = readExactDataRecord(input.target, ["kind", "partId"]);
    const payload = readExactDataRecord(input.payload, ["technique"]);
    const technique = profile.techniques.decode(payload?.technique);
    return target?.kind === "part" && isEntityId(target.partId) && technique !== undefined
      ? { kind: "set-technique", partId: target.partId, technique }
      : undefined;
  }

  function decodeRemoveTechnique(
    input: Readonly<{ target: unknown; payload: unknown }>,
  ): RemoveTechniqueEditV1 | undefined {
    const target = readExactDataRecord(input.target, ["kind", "partId"]);
    const payload = readExactDataRecord(input.payload, ["techniqueId"]);
    return target?.kind === "part" && isEntityId(target.partId) && isEntityId(payload?.techniqueId)
      ? { kind: "remove-technique", partId: target.partId, techniqueId: payload.techniqueId }
      : undefined;
  }

  function decodeMutation(value: unknown): FrettedMutationV1<TTechnique> | undefined {
    const initialize = readExactDataRecord(value, ["kind", "partId"]);
    if (initialize?.kind === "initialize") {
      return isEntityId(initialize.partId)
        ? { kind: "initialize", partId: initialize.partId }
        : undefined;
    }
    const tuningEdit = readExactDataRecord(value, ["kind", "partId", "tuning"]);
    if (tuningEdit?.kind === "set-tuning") {
      const tuning = decodeTuning(tuningEdit.tuning);
      return isEntityId(tuningEdit.partId) && tuning !== undefined
        ? { kind: "set-tuning", partId: tuningEdit.partId, tuning }
        : undefined;
    }
    const positionEdit = readExactDataRecord(value, ["kind", "partId", "noteId", "position"]);
    if (positionEdit?.kind === "set-position") {
      if (!isEntityId(positionEdit.partId) || !isEntityId(positionEdit.noteId)) return undefined;
      if (positionEdit.position === null) return {
        kind: "set-position",
        partId: positionEdit.partId,
        noteId: positionEdit.noteId,
        position: null,
      };
      const position = readExactDataRecord(positionEdit.position, ["stringNumber", "fret"]);
      return typeof position?.stringNumber === "number" && Number.isSafeInteger(position.stringNumber)
        && position.stringNumber >= 1 && position.stringNumber <= profile.stringCount
        && typeof position.fret === "number" && Number.isSafeInteger(position.fret) && position.fret >= 0
        ? {
            kind: "set-position",
            partId: positionEdit.partId,
            noteId: positionEdit.noteId,
            position: { stringNumber: position.stringNumber, fret: position.fret },
          }
        : undefined;
    }
    const techniqueEdit = readExactDataRecord(value, ["kind", "partId", "technique"]);
    if (techniqueEdit?.kind === "set-technique") {
      const technique = profile.techniques.decode(techniqueEdit.technique);
      return isEntityId(techniqueEdit.partId) && technique !== undefined
        ? { kind: "set-technique", partId: techniqueEdit.partId, technique }
        : undefined;
    }
    const removal = readExactDataRecord(value, ["kind", "partId", "techniqueId"]);
    if (removal?.kind === "remove-technique") {
      return isEntityId(removal.partId) && isEntityId(removal.techniqueId)
        ? { kind: "remove-technique", partId: removal.partId, techniqueId: removal.techniqueId }
        : undefined;
    }
    return undefined;
  }

  function mutationPayload(edit: FrettedMutationV1<TTechnique>): JsonObject {
    if (edit.kind === "initialize") return { kind: edit.kind, partId: edit.partId };
    if (edit.kind === "set-tuning") return {
      kind: edit.kind,
      partId: edit.partId,
      tuning: edit.tuning.map((entry) => ({
        stringNumber: entry.stringNumber,
        soundingPitch: { ...entry.soundingPitch },
      })),
    };
    if (edit.kind === "set-position") return {
      kind: edit.kind,
      partId: edit.partId,
      noteId: edit.noteId,
      position: edit.position === null ? null : { ...edit.position },
    };
    if (edit.kind === "set-technique") return {
      kind: edit.kind,
      partId: edit.partId,
      technique: profile.techniques.encode(edit.technique),
    };
    return { kind: edit.kind, partId: edit.partId, techniqueId: edit.techniqueId };
  }

  function mutationRequest(edit: FrettedMutationV1<TTechnique>) {
    return {
      requestVersion: 1 as const,
      requestKind: "module.extension" as const,
      effectKind: applyMutationEffect,
      namespace,
      owner: { kind: "part" as const, partId: edit.partId },
      payload: mutationPayload(edit),
    };
  }

  function affectedPart(partId: string): ScoreEntityTarget {
    return { kind: "part", partId };
  }

  const mutationEffect = defined(defineModuleEffectV1<FrettedMutationV1<TTechnique>>({
    descriptor: {
      descriptorVersion: 1,
      effectKind: applyMutationEffect,
      source,
      namespace,
      ownerKinds: ["part"],
      supportedSchemaVersions: [profile.schemaVersion],
    },
    decode: (input) => {
      const mutation = decodeMutation(input);
      return mutation === undefined ? { status: "invalid" } : { status: "decoded", payload: mutation };
    },
    transform: (input) => {
      if (input.owner.kind !== "part" || input.owner.partId !== input.payload.partId) {
        return { status: "rejected", issues: [issue("wrong-owner")] };
      }
      if (input.payload.kind === "initialize") {
        if (input.currentBlock !== undefined) return { status: "rejected", issues: [issue("already-initialized")] };
        return { status: "replace", schemaVersion: profile.schemaVersion, payload: encodeState(initialState()) };
      }
      if (input.currentBlock?.schemaVersion !== profile.schemaVersion) {
        return { status: "rejected", issues: [issue("not-initialized")] };
      }
      const state = decodeState(input.currentBlock.payload);
      if (state === undefined) return { status: "rejected", issues: [issue("invalid-block")] };
      const next = input.payload.kind === "set-tuning"
        ? updateTuning(state, input.payload.tuning)
        : input.payload.kind === "set-position"
          ? updatePosition(state, input.payload)
          : input.payload.kind === "set-technique"
            ? updateTechnique(state, input.payload)
            : removeTechnique(state, input.payload.techniqueId);
      return { status: "replace", schemaVersion: profile.schemaVersion, payload: encodeState(next) };
    },
  }), profile.displayName);

  const initializeCommand = defined(defineDomainCommandV1<InitializeEditV1>({
    descriptor: {
      descriptorVersion: 1,
      commandId: commandIds.initialize,
      commandVersion: 1,
      source,
      targetKind: "part",
      requiredCapabilities: ["command:execute", "score:read"],
      titleKey: `${namespace}.initialize.title`,
    },
    decode: (input) => {
      const edit = decodeInitialize(input);
      return edit === undefined ? { status: "invalid" } : { status: "decoded", command: edit };
    },
    prepare: (view, edit) => {
      if (!view.coreDocument.parts.some((part) => part.id === edit.partId)) {
        return { status: "rejected", issues: [issue("missing-part")] };
      }
      if (!matchesPart(view, edit.partId)) {
        return { status: "rejected", issues: [issue("unsupported-instrument")] };
      }
      if (blockForPart(view.compatibleExtensions, edit.partId) !== undefined) return { status: "no-op" };
      return {
        status: "changed",
        effectRequests: [mutationRequest(edit)],
        affected: [affectedPart(edit.partId)],
      };
    },
  }), profile.displayName);

  const setTuningCommand = defined(defineDomainCommandV1<SetTuningEditV1>({
    descriptor: {
      descriptorVersion: 1,
      commandId: commandIds.setTuning,
      commandVersion: 1,
      source,
      targetKind: "part",
      requiredCapabilities: ["command:execute", "score:read"],
      titleKey: `${namespace}.set-tuning.title`,
    },
    decode: (input) => {
      const edit = decodeSetTuning(input);
      return edit === undefined ? { status: "invalid" } : { status: "decoded", command: edit };
    },
    prepare: (view, edit) => {
      const state = readState(view, edit.partId);
      if (state === undefined) return { status: "rejected", issues: [issue("not-initialized")] };
      if (sameTuning(state.tuning, edit.tuning)) return { status: "no-op" };
      const next = updateTuning(state, edit.tuning);
      const notes = locateNotes(view, edit.partId);
      const pitchRequests: DomainEffectRequestV1[] = [];
      const affected: ScoreEntityTarget[] = [];
      for (const placement of next.placements) {
        const located = notes.get(placement.noteId);
        const writtenPitch = writtenPitchForPosition(next, placement);
        if (located === undefined || writtenPitch === undefined) {
          return { status: "rejected", issues: [issue("invalid-tuning")] };
        }
        if (samePitch(located.note.writtenPitch, writtenPitch)) continue;
        pitchRequests.push({
          requestVersion: 1,
          requestKind: "core.note.replace-written-pitch",
          target: { kind: "note", noteId: placement.noteId },
          writtenPitch,
        });
        affected.push({ kind: "note", noteId: placement.noteId });
      }
      const effectRequests: [DomainEffectRequestV1, ...DomainEffectRequestV1[]] = [mutationRequest(edit)];
      effectRequests.unshift(...pitchRequests);
      return {
        status: "changed",
        effectRequests,
        affected: [...affected, affectedPart(edit.partId)],
      };
    },
  }), profile.displayName);

  const setPositionCommand = defined(defineDomainCommandV1<SetPositionEditV1>({
    descriptor: {
      descriptorVersion: 1,
      commandId: commandIds.setPosition,
      commandVersion: 1,
      source,
      targetKind: "part",
      requiredCapabilities: ["command:execute", "score:read"],
      titleKey: `${namespace}.set-position.title`,
    },
    decode: (input) => {
      const edit = decodeSetPosition(input);
      return edit === undefined ? { status: "invalid" } : { status: "decoded", command: edit };
    },
    prepare: (view, edit) => {
      const state = readState(view, edit.partId);
      if (state === undefined) return { status: "rejected", issues: [issue("not-initialized")] };
      const located = locateNotes(view, edit.partId).get(edit.noteId);
      if (located === undefined) return { status: "rejected", issues: [issue("missing-note")] };
      if (edit.position !== null && edit.position.fret + state.capoFret > state.fretCount) {
        return { status: "rejected", issues: [issue("invalid-position")] };
      }
      if (edit.position === null
        && state.techniques.some((entry) => profile.techniques.targetNoteIds(entry).includes(edit.noteId))) {
        return { status: "rejected", issues: [issue("position-in-use")] };
      }
      const current = state.placements.find((entry) => entry.noteId === edit.noteId);
      const currentPosition = current === undefined
        ? null
        : { stringNumber: current.stringNumber, fret: current.fret };
      const writtenPitch = edit.position === null ? undefined : writtenPitchForPosition(state, edit.position);
      if (edit.position !== null && writtenPitch === undefined) {
        return { status: "rejected", issues: [issue("invalid-position")] };
      }
      if (samePosition(currentPosition, edit.position)
        && (writtenPitch === undefined || samePitch(located.note.writtenPitch, writtenPitch))) return { status: "no-op" };
      const extensionRequest = mutationRequest(edit);
      const effectRequests: readonly [DomainEffectRequestV1, ...DomainEffectRequestV1[]] = writtenPitch === undefined
        ? [extensionRequest]
        : [{
            requestVersion: 1,
            requestKind: "core.note.replace-written-pitch",
            target: { kind: "note", noteId: edit.noteId },
            writtenPitch,
          }, extensionRequest];
      return {
        status: "changed",
        effectRequests,
        affected: [{ kind: "note", noteId: edit.noteId }, affectedPart(edit.partId)],
      };
    },
  }), profile.displayName);

  const setTechniqueCommand = defined(defineDomainCommandV1<SetTechniqueEditV1<TTechnique>>({
    descriptor: {
      descriptorVersion: 1,
      commandId: commandIds.setTechnique,
      commandVersion: 1,
      source,
      targetKind: "part",
      requiredCapabilities: ["command:execute", "score:read"],
      titleKey: `${namespace}.set-technique.title`,
    },
    decode: (input) => {
      const edit = decodeSetTechnique(input);
      return edit === undefined ? { status: "invalid" } : { status: "decoded", command: edit };
    },
    prepare: (view, edit) => {
      const state = readState(view, edit.partId);
      if (state === undefined) return { status: "rejected", issues: [issue("not-initialized")] };
      const current = state.techniques.find((entry) => entry.id === edit.technique.id);
      if (current !== undefined && profile.techniques.equals(current, edit.technique)) return { status: "no-op" };
      const next = updateTechnique(state, edit);
      const invalid = validateState(view, edit.partId, next);
      if (invalid.length > 0) return { status: "rejected", issues: invalid };
      return {
        status: "changed",
        effectRequests: [mutationRequest(edit)],
        affected: [affectedPart(edit.partId)],
      };
    },
  }), profile.displayName);

  const removeTechniqueCommand = defined(defineDomainCommandV1<RemoveTechniqueEditV1>({
    descriptor: {
      descriptorVersion: 1,
      commandId: commandIds.removeTechnique,
      commandVersion: 1,
      source,
      targetKind: "part",
      requiredCapabilities: ["command:execute", "score:read"],
      titleKey: `${namespace}.remove-technique.title`,
    },
    decode: (input) => {
      const edit = decodeRemoveTechnique(input);
      return edit === undefined ? { status: "invalid" } : { status: "decoded", command: edit };
    },
    prepare: (view, edit) => {
      const state = readState(view, edit.partId);
      if (state === undefined) return { status: "rejected", issues: [issue("not-initialized")] };
      if (!state.techniques.some((entry) => entry.id === edit.techniqueId)) return { status: "no-op" };
      return {
        status: "changed",
        effectRequests: [mutationRequest(edit)],
        affected: [affectedPart(edit.partId)],
      };
    },
  }), profile.displayName);

  const contribution = defined(defineDomainCommandContributionV1({
    apiVersion: 1,
    ...source,
    extensionNamespaces: [namespace],
    extensionRequirements: [{
      requirementVersion: 1,
      namespace,
      ...source,
      supportedSchemaVersions: [profile.schemaVersion],
      requiredForWrite: true,
    }],
    commands: [initializeCommand, setTuningCommand, setPositionCommand, setTechniqueCommand, removeTechniqueCommand],
    effects: [mutationEffect],
    validate: (view) => {
      const partIds = new Set(view.coreDocument.parts.map((part) => part.id));
      for (const block of view.compatibleExtensions) {
        if (block.owner.kind !== "part" || !partIds.has(block.owner.partId)) return [issue("wrong-owner")];
        const state = decodeState(block.payload);
        if (state === undefined) return [issue("invalid-block")];
        const invalid = validateState(view, block.owner.partId, state);
        if (invalid.length > 0) return invalid;
      }
      return [];
    },
    classify: (view) => {
      if (profile.supportsChords) return { status: "supported", issues: [] };
      for (const block of view.compatibleExtensions) {
        if (block.owner.kind !== "part") continue;
        const partId = block.owner.partId;
        const part = view.coreDocument.parts.find((entry) => entry.id === partId);
        const hasChord = part?.measureContents.some((content) => content.voices.some((voice) =>
          voice.sequence.events.some((event) => event.content.kind === "notes" && event.content.notes.length > 1))) ?? false;
        if (hasChord) return { status: "unsupported", issues: [issue("unsupported-chord")] };
      }
      return { status: "supported", issues: [] };
    },
  }), profile.displayName);

  const registration = defined(defineDomainCommandRegistrationEntryV1({
    kind: "domain-command",
    registrationEntryId: "kernel.domain-commands.v1",
    ownerModuleId: source.moduleId,
    contributions: [contribution],
  }), profile.displayName);

  const registrationEntries = Object.freeze([registration]);
  const startupManifest: KernelStartupModuleManifest = Object.freeze({
    startupManifestVersion: 1,
    modules: Object.freeze([
      ...CORE_KERNEL_STARTUP_MANIFEST.modules,
      Object.freeze({
        moduleId: source.moduleId,
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

  return Object.freeze({
    namespace,
    commandIds,
    registrationEntries,
    startupManifest,
    readPart: (document: Pick<ScoreDocument, "extensions">, partId: string): FrettedInstrumentReadV1<TTechnique> => {
      const block = blockForPart(document.extensions, partId);
      if (block === undefined) return { status: "absent" };
      if (block.schemaVersion !== profile.schemaVersion) return { status: "invalid" };
      const state = decodeState(block.payload);
      return state === undefined ? { status: "invalid" } : { status: "valid", state };
    },
    compileCatalog: () => compileOfficialModuleCatalogV1(startupManifest, registrationEntries),
  });
}
