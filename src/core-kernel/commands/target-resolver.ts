import type {
  MeasureDefinition,
  Part,
  RhythmicEvent,
  ScoreDocument,
  ScoreNote,
  StaffDefinition,
  Voice,
} from "../domain/score-document";
import type {
  CommandFailure,
  MeasureAnchor,
  ScoreEntityTarget,
  SequenceAnchor,
} from "./contracts";

export type ResolvedScoreEntity =
  | { readonly kind: "document"; readonly document: ScoreDocument }
  | { readonly kind: "measure"; readonly measure: MeasureDefinition }
  | { readonly kind: "part"; readonly part: Part }
  | { readonly kind: "staff"; readonly staff: StaffDefinition; readonly part: Part }
  | { readonly kind: "voice"; readonly voice: Voice; readonly part: Part }
  | {
      readonly kind: "event";
      readonly event: RhythmicEvent;
      readonly eventIndex: number;
      readonly voice: Voice;
      readonly part: Part;
    }
  | {
      readonly kind: "note";
      readonly note: ScoreNote;
      readonly event: RhythmicEvent;
      readonly voice: Voice;
      readonly part: Part;
    };

export type ResolveEntityResult =
  | { readonly ok: true; readonly value: ResolvedScoreEntity }
  | { readonly ok: false; readonly failure: CommandFailure };

export type ResolveAnchorResult =
  | { readonly ok: true; readonly insertionIndex: number }
  | { readonly ok: false; readonly failure: CommandFailure };

interface UniqueIdIndex {
  readonly kind: "found" | "missing" | "duplicate";
  readonly index?: number;
}

function uniqueIdIndex(ids: readonly string[], id: string): UniqueIdIndex {
  let matchIndex = -1;
  for (let index = 0; index < ids.length; index += 1) {
    if (ids[index] !== id) {
      continue;
    }
    if (matchIndex >= 0) {
      return { kind: "duplicate" };
    }
    matchIndex = index;
  }
  return matchIndex < 0
    ? { kind: "missing" }
    : { kind: "found", index: matchIndex };
}

/** Resolves the stable public Measure insertion anchor within one ID list. */
export function resolveMeasureAnchorInIds(
  ids: readonly string[],
  anchor: MeasureAnchor,
): ResolveAnchorResult {
  if (anchor.kind === "start") {
    return { ok: true, insertionIndex: 0 };
  }
  const match = uniqueIdIndex(ids, anchor.measureId);
  if (match.kind === "found" && match.index !== undefined) {
    return { ok: true, insertionIndex: match.index + 1 };
  }
  return {
    ok: false,
    failure: {
      code:
        match.kind === "missing"
          ? "command.anchor-not-found"
          : "command.internal-error",
    },
  };
}

/** Returns the stable anchor that restores an item to its current position. */
export function previousMeasureAnchor(
  ids: readonly string[],
  targetIndex: number,
): MeasureAnchor {
  const previous = targetIndex > 0 ? ids[targetIndex - 1] : undefined;
  return previous === undefined
    ? { kind: "start" }
    : { kind: "after-measure", measureId: previous };
}

/**
 * Resolves a move against the original list, then returns the insertion index
 * in the list after the target has been removed.
 */
export function moveInsertionIndex(
  originalIds: readonly string[],
  targetId: string,
  anchor: MeasureAnchor,
): ResolveAnchorResult {
  const target = uniqueIdIndex(originalIds, targetId);
  if (target.kind !== "found" || target.index === undefined) {
    return {
      ok: false,
      failure: {
        code:
          target.kind === "missing"
            ? "command.target-not-found"
            : "command.internal-error",
      },
    };
  }
  if (anchor.kind === "after-measure" && anchor.measureId === targetId) {
    return {
      ok: false,
      failure: { code: "command.anchor-self-reference" },
    };
  }
  if (anchor.kind === "start") {
    return { ok: true, insertionIndex: 0 };
  }

  const anchorMatch = uniqueIdIndex(originalIds, anchor.measureId);
  if (anchorMatch.kind !== "found" || anchorMatch.index === undefined) {
    return {
      ok: false,
      failure: {
        code:
          anchorMatch.kind === "missing"
            ? "command.anchor-not-found"
            : "command.internal-error",
      },
    };
  }

  const remainingIds = originalIds.filter((id) => id !== targetId);
  const remainingAnchor = uniqueIdIndex(remainingIds, anchor.measureId);
  if (
    remainingAnchor.kind !== "found" ||
    remainingAnchor.index === undefined
  ) {
    return { ok: false, failure: { code: "command.internal-error" } };
  }
  return { ok: true, insertionIndex: remainingAnchor.index + 1 };
}

function uniqueMatch(
  matches: readonly ResolvedScoreEntity[],
): ResolveEntityResult {
  if (matches.length === 0) {
    return { ok: false, failure: { code: "command.target-not-found" } };
  }
  if (matches.length !== 1) {
    return { ok: false, failure: { code: "command.internal-error" } };
  }
  const value = matches[0];
  return value === undefined
    ? { ok: false, failure: { code: "command.internal-error" } }
    : { ok: true, value };
}

function collectNestedMatches(
  document: ScoreDocument,
  target: Exclude<ScoreEntityTarget, { readonly kind: "document" | "measure" }>,
): readonly ResolvedScoreEntity[] {
  const matches: ResolvedScoreEntity[] = [];
  for (const part of document.parts) {
    if (target.kind === "part" && part.id === target.partId) {
      matches.push({ kind: "part", part });
    }
    for (const staff of part.staves) {
      if (target.kind === "staff" && staff.id === target.staffId) {
        matches.push({ kind: "staff", staff, part });
      }
    }
    for (const content of part.measureContents) {
      for (const voice of content.voices) {
        if (target.kind === "voice" && voice.id === target.voiceId) {
          matches.push({ kind: "voice", voice, part });
        }
        voice.sequence.events.forEach((event, eventIndex) => {
          if (target.kind === "event" && event.id === target.eventId) {
            matches.push({ kind: "event", event, eventIndex, voice, part });
          }
          if (event.content.kind === "notes") {
            for (const note of event.content.notes) {
              if (target.kind === "note" && note.id === target.noteId) {
                matches.push({ kind: "note", note, event, voice, part });
              }
            }
          }
        });
      }
    }
  }
  return matches;
}

export function resolveScoreEntityTarget(
  document: ScoreDocument,
  target: ScoreEntityTarget,
): ResolveEntityResult {
  if (target.kind === "document") {
    return document.id === target.documentId
      ? { ok: true, value: { kind: "document", document } }
      : { ok: false, failure: { code: "command.target-not-found" } };
  }
  if (target.kind === "measure") {
    return uniqueMatch(
      document.measureDefinitions
        .filter((measure) => measure.id === target.measureId)
        .map((measure) => ({ kind: "measure", measure }) as const),
    );
  }
  return uniqueMatch(collectNestedMatches(document, target));
}

function countEventsById(document: ScoreDocument, eventId: string): number {
  let count = 0;
  for (const part of document.parts) {
    for (const content of part.measureContents) {
      for (const voice of content.voices) {
        for (const event of voice.sequence.events) {
          if (event.id === eventId) {
            count += 1;
          }
        }
      }
    }
  }
  return count;
}

export function resolveSequenceAnchor(
  document: ScoreDocument,
  voice: Voice,
  anchor: SequenceAnchor,
): ResolveAnchorResult {
  if (anchor.kind === "start") {
    return { ok: true, insertionIndex: 0 };
  }
  const matchingIndexes: number[] = [];
  voice.sequence.events.forEach((event, index) => {
    if (event.id === anchor.eventId) {
      matchingIndexes.push(index);
    }
  });
  if (matchingIndexes.length === 1) {
    const index = matchingIndexes[0];
    return index === undefined
      ? { ok: false, failure: { code: "command.internal-error" } }
      : { ok: true, insertionIndex: index + 1 };
  }
  if (matchingIndexes.length > 1) {
    return { ok: false, failure: { code: "command.internal-error" } };
  }
  return countEventsById(document, anchor.eventId) > 0
    ? { ok: false, failure: { code: "command.anchor-wrong-owner" } }
    : { ok: false, failure: { code: "command.anchor-not-found" } };
}
