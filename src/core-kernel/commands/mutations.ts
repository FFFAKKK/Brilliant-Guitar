import type { NoteValue } from "../domain/musical-time";
import type {
  RhythmicEvent,
  ScoreDocument,
  ScoreMetadata,
} from "../domain/score-document";
import type { WrittenPitch } from "../domain/pitch";
import type {
  CommandFailure,
  CoreCommandEnvelope,
  SequenceAnchor,
} from "./contracts";
import {
  resolveScoreEntityTarget,
  resolveSequenceAnchor,
} from "./target-resolver";

export type CoreMutation =
  | {
      readonly kind: "replace-metadata";
      readonly documentId: string;
      readonly value: ScoreMetadata;
    }
  | {
      readonly kind: "replace-written-pitch";
      readonly noteId: string;
      readonly value: WrittenPitch;
    }
  | {
      readonly kind: "replace-note-value";
      readonly eventId: string;
      readonly value: NoteValue;
    }
  | {
      readonly kind: "insert-event";
      readonly voiceId: string;
      readonly anchor: SequenceAnchor;
      readonly event: RhythmicEvent;
    }
  | {
      readonly kind: "remove-event";
      readonly voiceId: string;
      readonly eventId: string;
    };

export type PrepareMutationResult =
  | { readonly ok: true; readonly changed: false }
  | {
      readonly ok: true;
      readonly changed: true;
      readonly forward: CoreMutation;
      readonly inverse: CoreMutation;
    }
  | { readonly ok: false; readonly failure: CommandFailure };

export type ApplyMutationResult =
  | { readonly ok: true; readonly document: ScoreDocument }
  | { readonly ok: false; readonly failure: CommandFailure };

function metadataEqual(left: ScoreMetadata, right: ScoreMetadata): boolean {
  return (
    left.title === right.title &&
    left.tempo.bpm === right.tempo.bpm &&
    left.authors.length === right.authors.length &&
    left.authors.every((author, index) => author === right.authors[index])
  );
}

function pitchEqual(left: WrittenPitch, right: WrittenPitch): boolean {
  return (
    left.step === right.step &&
    left.alter === right.alter &&
    left.octave === right.octave
  );
}

function noteValueEqual(left: NoteValue, right: NoteValue): boolean {
  return (
    left.base === right.base &&
    left.dots === right.dots &&
    left.timeModification?.actualNotes === right.timeModification?.actualNotes &&
    left.timeModification?.normalNotes === right.timeModification?.normalNotes
  );
}

function cloneValue<T>(value: T): T {
  return structuredClone(value);
}

export function prepareCommandMutation(
  document: ScoreDocument,
  command: CoreCommandEnvelope,
): PrepareMutationResult {
  switch (command.commandId) {
    case "core.document.set-metadata": {
      const resolved = resolveScoreEntityTarget(document, command.target);
      if (!resolved.ok) {
        return resolved;
      }
      if (resolved.value.kind !== "document") {
        return { ok: false, failure: { code: "command.internal-error" } };
      }
      const current = resolved.value.document.metadata;
      if (metadataEqual(current, command.payload.metadata)) {
        return { ok: true, changed: false };
      }
      return {
        ok: true,
        changed: true,
        forward: {
          kind: "replace-metadata",
          documentId: command.target.documentId,
          value: cloneValue(command.payload.metadata),
        },
        inverse: {
          kind: "replace-metadata",
          documentId: command.target.documentId,
          value: cloneValue(current),
        },
      };
    }
    case "core.note.set-written-pitch": {
      const resolved = resolveScoreEntityTarget(document, command.target);
      if (!resolved.ok) {
        return resolved;
      }
      if (resolved.value.kind !== "note") {
        return { ok: false, failure: { code: "command.internal-error" } };
      }
      const current = resolved.value.note.writtenPitch;
      if (pitchEqual(current, command.payload.writtenPitch)) {
        return { ok: true, changed: false };
      }
      return {
        ok: true,
        changed: true,
        forward: {
          kind: "replace-written-pitch",
          noteId: command.target.noteId,
          value: cloneValue(command.payload.writtenPitch),
        },
        inverse: {
          kind: "replace-written-pitch",
          noteId: command.target.noteId,
          value: cloneValue(current),
        },
      };
    }
    case "core.event.set-note-value": {
      const resolved = resolveScoreEntityTarget(document, command.target);
      if (!resolved.ok) {
        return resolved;
      }
      if (resolved.value.kind !== "event") {
        return { ok: false, failure: { code: "command.internal-error" } };
      }
      const current = resolved.value.event.duration;
      if (noteValueEqual(current, command.payload.noteValue)) {
        return { ok: true, changed: false };
      }
      return {
        ok: true,
        changed: true,
        forward: {
          kind: "replace-note-value",
          eventId: command.target.eventId,
          value: cloneValue(command.payload.noteValue),
        },
        inverse: {
          kind: "replace-note-value",
          eventId: command.target.eventId,
          value: cloneValue(current),
        },
      };
    }
    case "core.voice.insert-notes-event":
    case "core.voice.insert-rest-event": {
      const resolved = resolveScoreEntityTarget(document, command.target);
      if (!resolved.ok) {
        return resolved;
      }
      if (resolved.value.kind !== "voice") {
        return { ok: false, failure: { code: "command.internal-error" } };
      }
      const anchor = resolveSequenceAnchor(
        document,
        resolved.value.voice,
        command.payload.anchor,
      );
      if (!anchor.ok) {
        return anchor;
      }
      return {
        ok: true,
        changed: true,
        forward: {
          kind: "insert-event",
          voiceId: command.target.voiceId,
          anchor: cloneValue(command.payload.anchor),
          event: cloneValue(command.payload.event),
        },
        inverse: {
          kind: "remove-event",
          voiceId: command.target.voiceId,
          eventId: command.payload.event.id,
        },
      };
    }
    case "core.event.remove": {
      const resolved = resolveScoreEntityTarget(document, command.target);
      if (!resolved.ok) {
        return resolved;
      }
      if (resolved.value.kind !== "event") {
        return { ok: false, failure: { code: "command.internal-error" } };
      }
      const previous = resolved.value.voice.sequence.events[
        resolved.value.eventIndex - 1
      ];
      const anchor: SequenceAnchor =
        previous === undefined
          ? { kind: "start" }
          : { kind: "after-event", eventId: previous.id };
      return {
        ok: true,
        changed: true,
        forward: {
          kind: "remove-event",
          voiceId: resolved.value.voice.id,
          eventId: resolved.value.event.id,
        },
        inverse: {
          kind: "insert-event",
          voiceId: resolved.value.voice.id,
          anchor,
          event: cloneValue(resolved.value.event),
        },
      };
    }
  }
}

export function applyCoreMutation(
  document: ScoreDocument,
  mutation: CoreMutation,
): ApplyMutationResult {
  try {
    const candidate = cloneValue(document);
    switch (mutation.kind) {
      case "replace-metadata": {
        const resolved = resolveScoreEntityTarget(candidate, {
          kind: "document",
          documentId: mutation.documentId,
        });
        if (!resolved.ok) {
          return resolved;
        }
        (candidate as { metadata: ScoreMetadata }).metadata = cloneValue(
          mutation.value,
        );
        return { ok: true, document: candidate };
      }
      case "replace-written-pitch": {
        const resolved = resolveScoreEntityTarget(candidate, {
          kind: "note",
          noteId: mutation.noteId,
        });
        if (!resolved.ok) {
          return resolved;
        }
        if (resolved.value.kind !== "note") {
          return { ok: false, failure: { code: "command.internal-error" } };
        }
        (resolved.value.note as { writtenPitch: WrittenPitch }).writtenPitch =
          cloneValue(mutation.value);
        return { ok: true, document: candidate };
      }
      case "replace-note-value": {
        const resolved = resolveScoreEntityTarget(candidate, {
          kind: "event",
          eventId: mutation.eventId,
        });
        if (!resolved.ok) {
          return resolved;
        }
        if (resolved.value.kind !== "event") {
          return { ok: false, failure: { code: "command.internal-error" } };
        }
        (resolved.value.event as { duration: NoteValue }).duration = cloneValue(
          mutation.value,
        );
        return { ok: true, document: candidate };
      }
      case "insert-event": {
        const resolved = resolveScoreEntityTarget(candidate, {
          kind: "voice",
          voiceId: mutation.voiceId,
        });
        if (!resolved.ok) {
          return resolved;
        }
        if (resolved.value.kind !== "voice") {
          return { ok: false, failure: { code: "command.internal-error" } };
        }
        const anchor = resolveSequenceAnchor(
          candidate,
          resolved.value.voice,
          mutation.anchor,
        );
        if (!anchor.ok) {
          return anchor;
        }
        const events = resolved.value.voice.sequence.events as RhythmicEvent[];
        events.splice(anchor.insertionIndex, 0, cloneValue(mutation.event));
        return { ok: true, document: candidate };
      }
      case "remove-event": {
        const resolved = resolveScoreEntityTarget(candidate, {
          kind: "event",
          eventId: mutation.eventId,
        });
        if (!resolved.ok) {
          return resolved;
        }
        if (
          resolved.value.kind !== "event" ||
          resolved.value.voice.id !== mutation.voiceId
        ) {
          return { ok: false, failure: { code: "command.internal-error" } };
        }
        const events = resolved.value.voice.sequence.events as RhythmicEvent[];
        events.splice(resolved.value.eventIndex, 1);
        return { ok: true, document: candidate };
      }
    }
  } catch {
    return { ok: false, failure: { code: "command.internal-error" } };
  }
}
