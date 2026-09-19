import type { JsonObject } from "../core-kernel/domain/extensions";
import type { ScoreDocument } from "../core-kernel/domain/score-document";
import { readExactDataRecord } from "../core-kernel/registry/strict-codec";
import {
  defineFrettedInstrumentDomainV1,
  type FrettedInstrumentReadV1,
  type FrettedInstrumentStateV1,
  type FrettedPositionV1,
  type FrettedStringTuningV1,
  type FrettedTechniqueAdapterV1,
  type FrettedTechniqueValidationContextV1,
} from "../instrument-sdk/fretted-instrument-domain";

export const GUITAR_DOMAIN_NAMESPACE = "brilliant.instrument.guitar";
export const INITIALIZE_GUITAR_COMMAND = `${GUITAR_DOMAIN_NAMESPACE}.initialize`;
export const SET_GUITAR_TUNING_COMMAND = `${GUITAR_DOMAIN_NAMESPACE}.set-tuning`;
export const SET_GUITAR_POSITION_COMMAND = `${GUITAR_DOMAIN_NAMESPACE}.set-position`;
export const SET_GUITAR_TECHNIQUE_COMMAND = `${GUITAR_DOMAIN_NAMESPACE}.set-technique`;
export const REMOVE_GUITAR_TECHNIQUE_COMMAND = `${GUITAR_DOMAIN_NAMESPACE}.remove-technique`;

export type GuitarTechniqueKindV1 = "hammer-on" | "pull-off" | "slide" | "bend" | "vibrato";
export type GuitarStringTuningV1 = FrettedStringTuningV1;
export type GuitarPositionV1 = FrettedPositionV1;

export type GuitarTechniqueV1 =
  | {
      readonly id: string;
      readonly kind: "hammer-on";
      readonly fromNoteId: string;
      readonly toNoteId: string;
    }
  | {
      readonly id: string;
      readonly kind: "pull-off";
      readonly fromNoteId: string;
      readonly toNoteId: string;
    }
  | {
      readonly id: string;
      readonly kind: "slide";
      readonly fromNoteId: string;
      readonly toNoteId: string;
    }
  | {
      readonly id: string;
      readonly kind: "bend";
      readonly noteId: string;
      readonly semitones: 1 | 2;
    }
  | {
      readonly id: string;
      readonly kind: "vibrato";
      readonly noteId: string;
    };

export type GuitarDomainStateV1 =
  & Omit<FrettedInstrumentStateV1<GuitarTechniqueV1>, "stringCount">
  & { readonly stringCount: 6 };

export interface GuitarTechniqueDefinitionV1 {
  readonly kind: GuitarTechniqueKindV1;
  readonly category: "connection-and-legato" | "pitch-and-expression";
  readonly priority: "P0";
  readonly target: "note" | "note-connection";
  readonly displaySemantics: string;
  readonly playbackSemantics: string;
}

export const GUITAR_TECHNIQUE_DEFINITIONS_V1: readonly GuitarTechniqueDefinitionV1[] =
  Object.freeze([
    Object.freeze({
      kind: "hammer-on" as const,
      category: "connection-and-legato" as const,
      priority: "P0" as const,
      target: "note-connection" as const,
      displaySemantics: "slur-with-hammer-on-mark",
      playbackSemantics: "legato-rearticulation-without-repluck",
    }),
    Object.freeze({
      kind: "pull-off" as const,
      category: "connection-and-legato" as const,
      priority: "P0" as const,
      target: "note-connection" as const,
      displaySemantics: "slur-with-pull-off-mark",
      playbackSemantics: "descending-legato-rearticulation-without-repluck",
    }),
    Object.freeze({
      kind: "slide" as const,
      category: "connection-and-legato" as const,
      priority: "P0" as const,
      target: "note-connection" as const,
      displaySemantics: "connect-source-and-destination-with-slide-line",
      playbackSemantics: "continuous-pitch-transition",
    }),
    Object.freeze({
      kind: "bend" as const,
      category: "pitch-and-expression" as const,
      priority: "P0" as const,
      target: "note" as const,
      displaySemantics: "bend-arrow-with-discrete-semitone-target",
      playbackSemantics: "discrete-pitch-bend-target",
    }),
    Object.freeze({
      kind: "vibrato" as const,
      category: "pitch-and-expression" as const,
      priority: "P0" as const,
      target: "note" as const,
      displaySemantics: "vibrato-mark",
      playbackSemantics: "basic-pitch-modulation",
    }),
  ]);

function freezeTuning(entries: readonly GuitarStringTuningV1[]): readonly GuitarStringTuningV1[] {
  return Object.freeze(entries.map((entry) => Object.freeze({
    stringNumber: entry.stringNumber,
    soundingPitch: Object.freeze({ ...entry.soundingPitch }),
  })));
}

export const STANDARD_GUITAR_TUNING_V1: readonly GuitarStringTuningV1[] =
  freezeTuning([
    { stringNumber: 1, soundingPitch: { step: "E", alter: 0, octave: 4 } },
    { stringNumber: 2, soundingPitch: { step: "B", alter: 0, octave: 3 } },
    { stringNumber: 3, soundingPitch: { step: "G", alter: 0, octave: 3 } },
    { stringNumber: 4, soundingPitch: { step: "D", alter: 0, octave: 3 } },
    { stringNumber: 5, soundingPitch: { step: "A", alter: 0, octave: 2 } },
    { stringNumber: 6, soundingPitch: { step: "E", alter: 0, octave: 2 } },
  ]);

export const DROP_D_GUITAR_TUNING_V1: readonly GuitarStringTuningV1[] = freezeTuning([
  ...STANDARD_GUITAR_TUNING_V1.slice(0, 5),
  { stringNumber: 6, soundingPitch: { step: "D", alter: 0, octave: 2 } },
]);

export const DADGAD_GUITAR_TUNING_V1: readonly GuitarStringTuningV1[] = freezeTuning([
  { stringNumber: 1, soundingPitch: { step: "D", alter: 0, octave: 4 } },
  { stringNumber: 2, soundingPitch: { step: "A", alter: 0, octave: 3 } },
  { stringNumber: 3, soundingPitch: { step: "G", alter: 0, octave: 3 } },
  { stringNumber: 4, soundingPitch: { step: "D", alter: 0, octave: 3 } },
  { stringNumber: 5, soundingPitch: { step: "A", alter: 0, octave: 2 } },
  { stringNumber: 6, soundingPitch: { step: "D", alter: 0, octave: 2 } },
]);

export const OPEN_G_GUITAR_TUNING_V1: readonly GuitarStringTuningV1[] = freezeTuning([
  { stringNumber: 1, soundingPitch: { step: "D", alter: 0, octave: 4 } },
  { stringNumber: 2, soundingPitch: { step: "B", alter: 0, octave: 3 } },
  { stringNumber: 3, soundingPitch: { step: "G", alter: 0, octave: 3 } },
  { stringNumber: 4, soundingPitch: { step: "D", alter: 0, octave: 3 } },
  { stringNumber: 5, soundingPitch: { step: "G", alter: 0, octave: 2 } },
  { stringNumber: 6, soundingPitch: { step: "D", alter: 0, octave: 2 } },
]);

export interface GuitarTuningPresetV1 {
  readonly id: string;
  readonly labelKey: string;
  readonly tuning: readonly GuitarStringTuningV1[];
}

export const GUITAR_TUNING_PRESETS_V1: readonly GuitarTuningPresetV1[] = Object.freeze([
  Object.freeze({
    id: `${GUITAR_DOMAIN_NAMESPACE}.tuning.standard`,
    labelKey: "instrument.guitar.tuning.standard",
    tuning: STANDARD_GUITAR_TUNING_V1,
  }),
  Object.freeze({
    id: `${GUITAR_DOMAIN_NAMESPACE}.tuning.drop-d`,
    labelKey: "instrument.guitar.tuning.drop-d",
    tuning: DROP_D_GUITAR_TUNING_V1,
  }),
  Object.freeze({
    id: `${GUITAR_DOMAIN_NAMESPACE}.tuning.dadgad`,
    labelKey: "instrument.guitar.tuning.dadgad",
    tuning: DADGAD_GUITAR_TUNING_V1,
  }),
  Object.freeze({
    id: `${GUITAR_DOMAIN_NAMESPACE}.tuning.open-g`,
    labelKey: "instrument.guitar.tuning.open-g",
    tuning: OPEN_G_GUITAR_TUNING_V1,
  }),
]);

/** Data-only concrete profile. Family behavior is supplied by the shared fretted-domain factory. */
export const GUITAR_INSTRUMENT_PROFILE_V1 = Object.freeze({
  id: GUITAR_DOMAIN_NAMESPACE,
  family: "fretted-string" as const,
  stringCount: 6 as const,
  fretCount: 24,
  capoFret: 0,
  tuning: STANDARD_GUITAR_TUNING_V1,
  writtenPitchOffsetSemitones: 12,
  supportsChords: true,
});

export type GuitarDomainReadV1 =
  | { readonly status: "absent" }
  | { readonly status: "valid"; readonly state: GuitarDomainStateV1 }
  | { readonly status: "invalid" };

function isEntityId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 256;
}

function decodeTechnique(value: unknown): GuitarTechniqueV1 | undefined {
  const connection = readExactDataRecord(value, ["id", "kind", "fromNoteId", "toNoteId"]);
  if (connection?.kind === "hammer-on" || connection?.kind === "pull-off" || connection?.kind === "slide") {
    return isEntityId(connection.id) && isEntityId(connection.fromNoteId) && isEntityId(connection.toNoteId)
      && connection.fromNoteId !== connection.toNoteId
      ? {
          id: connection.id,
          kind: connection.kind,
          fromNoteId: connection.fromNoteId,
          toNoteId: connection.toNoteId,
        }
      : undefined;
  }
  const bend = readExactDataRecord(value, ["id", "kind", "noteId", "semitones"]);
  if (bend?.kind === "bend") {
    return isEntityId(bend.id) && isEntityId(bend.noteId) && (bend.semitones === 1 || bend.semitones === 2)
      ? { id: bend.id, kind: "bend", noteId: bend.noteId, semitones: bend.semitones }
      : undefined;
  }
  const vibrato = readExactDataRecord(value, ["id", "kind", "noteId"]);
  if (vibrato?.kind === "vibrato") {
    return isEntityId(vibrato.id) && isEntityId(vibrato.noteId)
      ? { id: vibrato.id, kind: "vibrato", noteId: vibrato.noteId }
      : undefined;
  }
  return undefined;
}

function encodeTechnique(technique: GuitarTechniqueV1): JsonObject {
  if (technique.kind === "hammer-on" || technique.kind === "pull-off" || technique.kind === "slide") return {
    id: technique.id,
    kind: technique.kind,
    fromNoteId: technique.fromNoteId,
    toNoteId: technique.toNoteId,
  };
  if (technique.kind === "bend") return {
    id: technique.id,
    kind: technique.kind,
    noteId: technique.noteId,
    semitones: technique.semitones,
  };
  return { id: technique.id, kind: technique.kind, noteId: technique.noteId };
}

function sameTechnique(left: GuitarTechniqueV1, right: GuitarTechniqueV1): boolean {
  if (left.id !== right.id || left.kind !== right.kind) return false;
  if ((left.kind === "hammer-on" || left.kind === "pull-off" || left.kind === "slide")
    && (right.kind === "hammer-on" || right.kind === "pull-off" || right.kind === "slide")) {
    return left.fromNoteId === right.fromNoteId && left.toNoteId === right.toNoteId;
  }
  if (left.kind === "bend" && right.kind === "bend") {
    return left.noteId === right.noteId && left.semitones === right.semitones;
  }
  return left.kind === "vibrato" && right.kind === "vibrato" && left.noteId === right.noteId;
}

const guitarTechniques: FrettedTechniqueAdapterV1<GuitarTechniqueV1> = Object.freeze({
  decode: decodeTechnique,
  encode: encodeTechnique,
  equals: sameTechnique,
  targetNoteIds: (technique: GuitarTechniqueV1) => technique.kind === "hammer-on"
    || technique.kind === "pull-off" || technique.kind === "slide"
    ? [technique.fromNoteId, technique.toNoteId]
    : [technique.noteId],
  validate: (technique: GuitarTechniqueV1, context: FrettedTechniqueValidationContextV1) => {
    if (technique.kind !== "hammer-on" && technique.kind !== "pull-off" && technique.kind !== "slide") {
      return undefined;
    }
    const from = context.placements.get(technique.fromNoteId);
    const to = context.placements.get(technique.toNoteId);
    if (from?.stringNumber !== to?.stringNumber) return "connection-string-mismatch";
    const fromNote = context.notes.get(technique.fromNoteId);
    const toNote = context.notes.get(technique.toNoteId);
    if (fromNote === undefined || toNote === undefined || fromNote.order >= toNote.order) {
      return "connection-order-invalid";
    }
    if (technique.kind === "hammer-on" && from !== undefined && to !== undefined && from.fret >= to.fret) {
      return "hammer-on-direction-invalid";
    }
    if (technique.kind === "pull-off" && from !== undefined && to !== undefined && from.fret <= to.fret) {
      return "pull-off-direction-invalid";
    }
    return from?.fret === to?.fret ? "connection-position-invalid" : undefined;
  },
  validateCollection: (techniques: readonly GuitarTechniqueV1[]) => {
    const bendTargets = new Set<string>();
    const vibratoTargets = new Set<string>();
    const connectionSources = new Set<string>();
    const connectionDestinations = new Set<string>();
    for (const technique of techniques) {
      if (technique.kind === "bend") {
        if (bendTargets.has(technique.noteId)) return "technique-conflict";
        bendTargets.add(technique.noteId);
      } else if (technique.kind === "vibrato") {
        if (vibratoTargets.has(technique.noteId)) return "technique-conflict";
        vibratoTargets.add(technique.noteId);
      } else if (technique.kind === "hammer-on" || technique.kind === "pull-off" || technique.kind === "slide") {
        if (connectionSources.has(technique.fromNoteId) || connectionDestinations.has(technique.toNoteId)) {
          return "technique-conflict";
        }
        connectionSources.add(technique.fromNoteId);
        connectionDestinations.add(technique.toNoteId);
      }
    }
    return undefined;
  },
});

const guitarDomain = defineFrettedInstrumentDomainV1({
  id: GUITAR_INSTRUMENT_PROFILE_V1.id,
  displayName: "Guitar",
  schemaVersion: 1,
  stringCount: GUITAR_INSTRUMENT_PROFILE_V1.stringCount,
  fretCount: GUITAR_INSTRUMENT_PROFILE_V1.fretCount,
  capoFret: GUITAR_INSTRUMENT_PROFILE_V1.capoFret,
  tuning: GUITAR_INSTRUMENT_PROFILE_V1.tuning,
  writtenPitchOffsetSemitones: GUITAR_INSTRUMENT_PROFILE_V1.writtenPitchOffsetSemitones,
  supportsChords: GUITAR_INSTRUMENT_PROFILE_V1.supportsChords,
  matchesInstrument: (instrument) => instrument.writtenToSounding.diatonicSteps === -7
    && instrument.writtenToSounding.chromaticSemitones === -12,
  techniques: guitarTechniques,
});

export const GUITAR_DOMAIN_MODULE_REGISTRATION_ENTRIES = guitarDomain.registrationEntries;
export const GUITAR_DOMAIN_MODULE_STARTUP_MANIFEST = guitarDomain.startupManifest;

export function readPartGuitarDomainV1(
  document: Pick<ScoreDocument, "extensions">,
  partId: string,
): GuitarDomainReadV1 {
  return guitarDomain.readPart(document, partId) as FrettedInstrumentReadV1<GuitarTechniqueV1> as GuitarDomainReadV1;
}

export function compileGuitarDomainModuleCatalogV1() {
  return guitarDomain.compileCatalog();
}
