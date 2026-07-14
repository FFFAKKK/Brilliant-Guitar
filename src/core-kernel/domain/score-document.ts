import type { ExtensionBlock } from "./extensions";
import type { Fraction } from "./fraction";
import type { Meter, NoteValue } from "./musical-time";
import type { Transposition, WrittenPitch } from "./pitch";

export const SCORE_DOCUMENT_SCHEMA_VERSION = "brilliant-score-1" as const;
export type ScoreDocumentSchemaVersion =
  typeof SCORE_DOCUMENT_SCHEMA_VERSION;

export function isScoreDocumentSchemaVersion(
  value: unknown,
): value is ScoreDocumentSchemaVersion {
  return value === SCORE_DOCUMENT_SCHEMA_VERSION;
}

export interface ScoreDocument {
  readonly schemaVersion: ScoreDocumentSchemaVersion;
  readonly id: string;
  readonly metadata: ScoreMetadata;
  readonly measureDefinitions: readonly MeasureDefinition[];
  readonly parts: readonly Part[];
  readonly extensions: readonly ExtensionBlock[];
}

export interface ScoreMetadata {
  readonly title: string;
  readonly authors: readonly string[];
  readonly tempo: Tempo;
}

export interface Tempo {
  readonly bpm: number;
}

export interface MeasureDefinition {
  readonly id: string;
  readonly meter: Meter;
  readonly pickupDuration?: Fraction;
}

export interface Part {
  readonly id: string;
  readonly name: string;
  readonly instrument: InstrumentDescriptor;
  readonly staves: readonly StaffDefinition[];
  readonly measureContents: readonly PartMeasureContent[];
}

export interface InstrumentDescriptor {
  readonly name: string;
  readonly writtenToSounding: Transposition;
}

export interface StaffDefinition {
  readonly id: string;
  readonly lineCount: number;
  readonly defaultClef: Clef;
}

export interface Clef {
  readonly sign: "G" | "F" | "C";
  readonly line: 1 | 2 | 3 | 4 | 5;
}

export interface PartMeasureContent {
  readonly measureId: string;
  readonly voices: readonly Voice[];
}

export interface Voice {
  readonly id: string;
  readonly defaultStaffId: string;
  readonly sequence: MusicSequence;
}

export interface MusicSequence {
  readonly start: Fraction;
  readonly events: readonly RhythmicEvent[];
}

export interface RhythmicEvent {
  readonly id: string;
  readonly duration: NoteValue;
  readonly staffId?: string;
  readonly content: RestContent | NotesContent;
}

export interface RestContent {
  readonly kind: "rest";
}

export interface NotesContent {
  readonly kind: "notes";
  readonly notes: readonly ScoreNote[];
}

export interface ScoreNote {
  readonly id: string;
  readonly writtenPitch: WrittenPitch;
}
