import type {
  NotesRhythmicEvent,
  RestRhythmicEvent,
  ScoreEntityTarget,
  SequenceAnchor,
} from "../commands/contracts";
import type { NoteValue } from "../domain/musical-time";
import type { WrittenPitch } from "../domain/pitch";
import type { ScoreMetadata } from "../domain/score-document";

export interface CoreWrittenPitchEffectRequestV1 {
  readonly requestVersion: 1;
  readonly requestKind: "core.note.replace-written-pitch";
  readonly target: Extract<ScoreEntityTarget, { readonly kind: "note" }>;
  readonly writtenPitch: WrittenPitch;
}

export interface CoreSetMetadataEffectRequestV1 {
  readonly requestVersion: 1;
  readonly requestKind: "core.document.set-metadata";
  readonly target: Extract<ScoreEntityTarget, { readonly kind: "document" }>;
  readonly metadata: ScoreMetadata;
}

export interface CoreSetNoteValueEffectRequestV1 {
  readonly requestVersion: 1;
  readonly requestKind: "core.event.set-note-value";
  readonly target: Extract<ScoreEntityTarget, { readonly kind: "event" }>;
  readonly noteValue: NoteValue;
}

export interface CoreInsertNotesEventEffectRequestV1 {
  readonly requestVersion: 1;
  readonly requestKind: "core.voice.insert-notes-event";
  readonly target: Extract<ScoreEntityTarget, { readonly kind: "voice" }>;
  readonly anchor: SequenceAnchor;
  readonly event: NotesRhythmicEvent;
}

export interface CoreInsertRestEventEffectRequestV1 {
  readonly requestVersion: 1;
  readonly requestKind: "core.voice.insert-rest-event";
  readonly target: Extract<ScoreEntityTarget, { readonly kind: "voice" }>;
  readonly anchor: SequenceAnchor;
  readonly event: RestRhythmicEvent;
}

export interface CoreRemoveEventEffectRequestV1 {
  readonly requestVersion: 1;
  readonly requestKind: "core.event.remove";
  readonly target: Extract<ScoreEntityTarget, { readonly kind: "event" }>;
}

export type CoreEffectRequestV1 =
  | CoreWrittenPitchEffectRequestV1
  | CoreSetMetadataEffectRequestV1
  | CoreSetNoteValueEffectRequestV1
  | CoreInsertNotesEventEffectRequestV1
  | CoreInsertRestEventEffectRequestV1
  | CoreRemoveEventEffectRequestV1;
