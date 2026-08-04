import type { NoteValue } from "../domain/musical-time";
import type {
  RhythmicEvent,
  ScoreDocument,
  ScoreMetadata,
} from "../domain/score-document";
import type { WrittenPitch } from "../domain/pitch";
import type { CommandFailure, SequenceAnchor } from "./contracts";
import {
  resolveScoreEntityTarget,
  resolveSequenceAnchor,
} from "./target-resolver";
import { deepFreezeValue } from "../read/deep-freeze";

export type CoreEffect =
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

export type NonEmptyCoreEffectSet = readonly [
  CoreEffect,
  ...CoreEffect[],
];

export type ApplyCoreEffectSetResult =
  | {
      readonly ok: true;
      readonly document: ScoreDocument;
      readonly inverse: NonEmptyCoreEffectSet;
    }
  | { readonly ok: false; readonly failure: CommandFailure };

function cloneValue<T>(value: T): T {
  return structuredClone(value);
}

function failure(
  code: CommandFailure["code"],
): Extract<ApplyCoreEffectSetResult, { readonly ok: false }> {
  return { ok: false, failure: { code } as CommandFailure };
}

function freezeEffect(effect: CoreEffect): CoreEffect {
  return deepFreezeValue(cloneValue(effect));
}

function asNonEmptyEffectSet(
  effects: readonly CoreEffect[],
): NonEmptyCoreEffectSet | undefined {
  const first = effects[0];
  if (first === undefined) {
    return undefined;
  }
  return [first, ...effects.slice(1)];
}

export function freezeCoreEffectSet(
  effects: NonEmptyCoreEffectSet,
): NonEmptyCoreEffectSet {
  const frozen = asNonEmptyEffectSet(effects.map(freezeEffect));
  if (frozen === undefined) {
    throw new TypeError("Core effect set must be nonempty");
  }
  return deepFreezeValue(frozen);
}

function deriveInverseEffect(
  candidate: ScoreDocument,
  effect: CoreEffect,
): CoreEffect | CommandFailure {
  switch (effect.kind) {
    case "replace-metadata": {
      const resolved = resolveScoreEntityTarget(candidate, {
        kind: "document",
        documentId: effect.documentId,
      });
      if (!resolved.ok || resolved.value.kind !== "document") {
        return resolved.ok
          ? { code: "command.internal-error" }
          : resolved.failure;
      }
      return {
        kind: "replace-metadata",
        documentId: effect.documentId,
        value: cloneValue(resolved.value.document.metadata),
      };
    }
    case "replace-written-pitch": {
      const resolved = resolveScoreEntityTarget(candidate, {
        kind: "note",
        noteId: effect.noteId,
      });
      if (!resolved.ok || resolved.value.kind !== "note") {
        return resolved.ok
          ? { code: "command.internal-error" }
          : resolved.failure;
      }
      return {
        kind: "replace-written-pitch",
        noteId: effect.noteId,
        value: cloneValue(resolved.value.note.writtenPitch),
      };
    }
    case "replace-note-value": {
      const resolved = resolveScoreEntityTarget(candidate, {
        kind: "event",
        eventId: effect.eventId,
      });
      if (!resolved.ok || resolved.value.kind !== "event") {
        return resolved.ok
          ? { code: "command.internal-error" }
          : resolved.failure;
      }
      return {
        kind: "replace-note-value",
        eventId: effect.eventId,
        value: cloneValue(resolved.value.event.duration),
      };
    }
    case "insert-event":
      return {
        kind: "remove-event",
        voiceId: effect.voiceId,
        eventId: effect.event.id,
      };
    case "remove-event": {
      const resolved = resolveScoreEntityTarget(candidate, {
        kind: "event",
        eventId: effect.eventId,
      });
      if (
        !resolved.ok ||
        resolved.value.kind !== "event" ||
        resolved.value.voice.id !== effect.voiceId
      ) {
        return resolved.ok
          ? { code: "command.internal-error" }
          : resolved.failure;
      }
      const previous = resolved.value.voice.sequence.events[
        resolved.value.eventIndex - 1
      ];
      const anchor: SequenceAnchor =
        previous === undefined
          ? { kind: "start" }
          : { kind: "after-event", eventId: previous.id };
      return {
        kind: "insert-event",
        voiceId: effect.voiceId,
        anchor,
        event: cloneValue(resolved.value.event),
      };
    }
  }
}

function applyEffectInPlace(
  candidate: ScoreDocument,
  effect: CoreEffect,
): CommandFailure | undefined {
  switch (effect.kind) {
    case "replace-metadata": {
      const resolved = resolveScoreEntityTarget(candidate, {
        kind: "document",
        documentId: effect.documentId,
      });
      if (!resolved.ok) {
        return resolved.failure;
      }
      if (resolved.value.kind !== "document") {
        return { code: "command.internal-error" };
      }
      (candidate as { metadata: ScoreMetadata }).metadata = cloneValue(effect.value);
      return undefined;
    }
    case "replace-written-pitch": {
      const resolved = resolveScoreEntityTarget(candidate, {
        kind: "note",
        noteId: effect.noteId,
      });
      if (!resolved.ok) {
        return resolved.failure;
      }
      if (resolved.value.kind !== "note") {
        return { code: "command.internal-error" };
      }
      (resolved.value.note as { writtenPitch: WrittenPitch }).writtenPitch =
        cloneValue(effect.value);
      return undefined;
    }
    case "replace-note-value": {
      const resolved = resolveScoreEntityTarget(candidate, {
        kind: "event",
        eventId: effect.eventId,
      });
      if (!resolved.ok) {
        return resolved.failure;
      }
      if (resolved.value.kind !== "event") {
        return { code: "command.internal-error" };
      }
      (resolved.value.event as { duration: NoteValue }).duration = cloneValue(
        effect.value,
      );
      return undefined;
    }
    case "insert-event": {
      const resolved = resolveScoreEntityTarget(candidate, {
        kind: "voice",
        voiceId: effect.voiceId,
      });
      if (!resolved.ok) {
        return resolved.failure;
      }
      if (resolved.value.kind !== "voice") {
        return { code: "command.internal-error" };
      }
      const anchor = resolveSequenceAnchor(
        candidate,
        resolved.value.voice,
        effect.anchor,
      );
      if (!anchor.ok) {
        return anchor.failure;
      }
      const events = resolved.value.voice.sequence.events as RhythmicEvent[];
      events.splice(anchor.insertionIndex, 0, cloneValue(effect.event));
      return undefined;
    }
    case "remove-event": {
      const resolved = resolveScoreEntityTarget(candidate, {
        kind: "event",
        eventId: effect.eventId,
      });
      if (!resolved.ok) {
        return resolved.failure;
      }
      if (
        resolved.value.kind !== "event" ||
        resolved.value.voice.id !== effect.voiceId
      ) {
        return { code: "command.internal-error" };
      }
      const events = resolved.value.voice.sequence.events as RhythmicEvent[];
      events.splice(resolved.value.eventIndex, 1);
      return undefined;
    }
  }
}

export function applyCoreEffectSet(
  document: ScoreDocument,
  effects: readonly CoreEffect[],
): ApplyCoreEffectSetResult {
  try {
    const nonEmpty = asNonEmptyEffectSet(effects);
    if (nonEmpty === undefined) {
      return failure("command.internal-error");
    }
    const candidate = cloneValue(document);
    const inverses: CoreEffect[] = [];
    for (const effect of nonEmpty) {
      const inverse = deriveInverseEffect(candidate, effect);
      if ("code" in inverse) {
        return { ok: false, failure: inverse };
      }
      const applied = applyEffectInPlace(candidate, effect);
      if (applied !== undefined) {
        return { ok: false, failure: applied };
      }
      inverses.push(inverse);
    }
    const inverse = asNonEmptyEffectSet(inverses.reverse());
    if (inverse === undefined) {
      return failure("command.internal-error");
    }
    return {
      ok: true,
      document: candidate,
      inverse: freezeCoreEffectSet(inverse),
    };
  } catch {
    return failure("command.internal-error");
  }
}
