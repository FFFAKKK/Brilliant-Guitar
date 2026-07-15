import type { NoteValue } from "../domain/musical-time";
import type {
  NotesContent,
  RhythmicEvent,
  ScoreDocument,
  ScoreMetadata,
} from "../domain/score-document";
import type { WrittenPitch } from "../domain/pitch";
import type { ScoreSupportResult } from "../profiles/score-feature-profile";
import type { SemanticDiagnostic } from "../validation/diagnostics";
import type { CoreCommandId } from "./catalog";

export type { CoreCommandId } from "./catalog";

export type ScoreEntityTarget =
  | { readonly kind: "document"; readonly documentId: string }
  | { readonly kind: "measure"; readonly measureId: string }
  | { readonly kind: "part"; readonly partId: string }
  | { readonly kind: "staff"; readonly staffId: string }
  | { readonly kind: "voice"; readonly voiceId: string }
  | { readonly kind: "event"; readonly eventId: string }
  | { readonly kind: "note"; readonly noteId: string };

export type SequenceAnchor =
  | { readonly kind: "start" }
  | { readonly kind: "after-event"; readonly eventId: string };

export type NotesRhythmicEvent = Omit<RhythmicEvent, "content"> & {
  readonly content: NotesContent;
};

export type RestRhythmicEvent = Omit<RhythmicEvent, "content"> & {
  readonly content: { readonly kind: "rest" };
};

interface CommandEnvelopeBase<
  Id extends CoreCommandId,
  Target extends ScoreEntityTarget,
  Payload,
> {
  readonly commandVersion: 1;
  readonly commandId: Id;
  readonly target: Target;
  readonly payload: Payload;
}

export type SetMetadataCommand = CommandEnvelopeBase<
  "core.document.set-metadata",
  Extract<ScoreEntityTarget, { readonly kind: "document" }>,
  { readonly metadata: ScoreMetadata }
>;

export type SetWrittenPitchCommand = CommandEnvelopeBase<
  "core.note.set-written-pitch",
  Extract<ScoreEntityTarget, { readonly kind: "note" }>,
  { readonly writtenPitch: WrittenPitch }
>;

export type SetNoteValueCommand = CommandEnvelopeBase<
  "core.event.set-note-value",
  Extract<ScoreEntityTarget, { readonly kind: "event" }>,
  { readonly noteValue: NoteValue }
>;

export type InsertNotesEventCommand = CommandEnvelopeBase<
  "core.voice.insert-notes-event",
  Extract<ScoreEntityTarget, { readonly kind: "voice" }>,
  { readonly anchor: SequenceAnchor; readonly event: NotesRhythmicEvent }
>;

export type InsertRestEventCommand = CommandEnvelopeBase<
  "core.voice.insert-rest-event",
  Extract<ScoreEntityTarget, { readonly kind: "voice" }>,
  { readonly anchor: SequenceAnchor; readonly event: RestRhythmicEvent }
>;

export type RemoveEventCommand = CommandEnvelopeBase<
  "core.event.remove",
  Extract<ScoreEntityTarget, { readonly kind: "event" }>,
  Record<string, never>
>;

export type CoreCommandEnvelope =
  | SetMetadataCommand
  | SetWrittenPitchCommand
  | SetNoteValueCommand
  | InsertNotesEventCommand
  | InsertRestEventCommand
  | RemoveEventCommand;

export type CommandFailure =
  | { readonly code: "command.invalid-envelope" }
  | { readonly code: "command.unsupported-version" }
  | { readonly code: "command.unknown-id" }
  | { readonly code: "command.target-mismatch" }
  | { readonly code: "command.target-not-found" }
  | { readonly code: "command.anchor-not-found" }
  | { readonly code: "command.anchor-wrong-owner" }
  | {
      readonly code: "command.semantic-invalid";
      readonly diagnostics: readonly SemanticDiagnostic[];
    }
  | { readonly code: "command.version-overflow" }
  | { readonly code: "command.internal-error" }
  | { readonly code: "history.empty-undo" }
  | { readonly code: "history.empty-redo" }
  | { readonly code: "history.invariant-violation" };

export type CommandResult =
  | {
      readonly status: "committed";
      readonly documentVersion: number;
      readonly support: ScoreSupportResult;
      readonly undoDepth: number;
      readonly redoDepth: number;
    }
  | {
      readonly status: "no-op";
      readonly documentVersion: number;
      readonly support: ScoreSupportResult;
      readonly undoDepth: number;
      readonly redoDepth: number;
    }
  | {
      readonly status: "rejected";
      readonly documentVersion: number;
      readonly failure: CommandFailure;
      readonly undoDepth: number;
      readonly redoDepth: number;
    };

export type CommandBusCreationFailure =
  | {
      readonly code: "command.invalid-initial-document";
      readonly diagnostics: readonly SemanticDiagnostic[];
    }
  | { readonly code: "command.invalid-initial-document" };

export type ReplayCoreCommandsResult =
  | {
      readonly status: "replayed";
      readonly finalDocument: ScoreDocument;
      readonly documentVersion: number;
      readonly results: readonly CommandResult[];
    }
  | {
      readonly status: "rejected";
      readonly finalDocument: ScoreDocument;
      readonly documentVersion: number;
      readonly results: readonly CommandResult[];
      readonly failedCommandIndex: number;
      readonly failure: CommandFailure;
    }
  | {
      readonly status: "invalid-initial-document";
      readonly failure: CommandBusCreationFailure;
    };
