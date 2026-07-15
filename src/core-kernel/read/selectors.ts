import type { ScoreMetadata } from "../domain/score-document";
import { decodeScoreAddress, decodeScoreRange } from "./address-codec";
import type {
  DocumentSnapshot,
  KernelHistoryState,
  KernelReadState,
  ReadResult,
  ScoreEntityOwnership,
  ScoreRangeSelection,
  SelectedScoreEntity,
} from "./contracts";
import { deepFreezeValue } from "./deep-freeze";
import {
  getEntityIndex,
  getEventOwnership,
  getIndexedEntity,
  getIndexedOwnership,
  getMeasureIndex,
  getMeasures,
  getPartMeasureContent,
  getVoiceEvents,
  hasPart,
} from "./entity-index";

const INVARIANT_VIOLATION = deepFreezeValue({
  ok: false,
  failure: { code: "read.invariant-violation" },
} as const);

function success<T>(value: T): ReadResult<T> {
  return deepFreezeValue({ ok: true, value });
}

function failure(
  code:
    | "read.invalid-address"
    | "read.entity-not-found"
    | "read.invalid-range"
    | "read.range-endpoint-not-found"
    | "read.range-owner-mismatch",
): ReadResult<never> {
  return deepFreezeValue({ ok: false, failure: { code } });
}

export function selectScoreMetadata(
  snapshot: DocumentSnapshot,
): ReadResult<ScoreMetadata> {
  try {
    const indexed = getEntityIndex(snapshot);
    return indexed.ok ? success(snapshot.document.metadata) : indexed;
  } catch {
    return INVARIANT_VIOLATION;
  }
}

export function selectScoreEntity(
  snapshot: DocumentSnapshot,
  address: unknown,
): ReadResult<SelectedScoreEntity> {
  try {
    const decoded = decodeScoreAddress(address);
    if (!decoded.ok) {
      return failure("read.invalid-address");
    }
    const indexed = getEntityIndex(snapshot);
    if (!indexed.ok) {
      return indexed;
    }
    const entity = getIndexedEntity(indexed.value, decoded.value);
    return entity === undefined
      ? failure("read.entity-not-found")
      : success(entity);
  } catch {
    return INVARIANT_VIOLATION;
  }
}

export function selectScoreEntityOwnership(
  snapshot: DocumentSnapshot,
  address: unknown,
): ReadResult<ScoreEntityOwnership> {
  try {
    const decoded = decodeScoreAddress(address);
    if (!decoded.ok) {
      return failure("read.invalid-address");
    }
    const indexed = getEntityIndex(snapshot);
    if (!indexed.ok) {
      return indexed;
    }
    const owner = getIndexedOwnership(indexed.value, decoded.value);
    return owner === undefined
      ? failure("read.entity-not-found")
      : success(owner);
  } catch {
    return INVARIANT_VIOLATION;
  }
}

export function selectScoreRange(
  snapshot: DocumentSnapshot,
  range: unknown,
): ReadResult<ScoreRangeSelection> {
  try {
    const decoded = decodeScoreRange(range);
    if (!decoded.ok) {
      return failure("read.invalid-range");
    }
    const indexed = getEntityIndex(snapshot);
    if (!indexed.ok) {
      return indexed;
    }

    switch (decoded.value.kind) {
      case "measure-range": {
        const startIndex = getMeasureIndex(
          indexed.value,
          decoded.value.start.measureId,
        );
        const endIndex = getMeasureIndex(
          indexed.value,
          decoded.value.end.measureId,
        );
        if (startIndex === undefined || endIndex === undefined) {
          return failure("read.range-endpoint-not-found");
        }
        const lower = Math.min(startIndex, endIndex);
        const upper = Math.max(startIndex, endIndex);
        const measures = getMeasures(indexed.value).slice(lower, upper + 1);
        return success({
          kind: "measure-range",
          normalized: {
            kind: "measure-range",
            start: { kind: "measure", measureId: measures[0]!.id },
            end: {
              kind: "measure",
              measureId: measures[measures.length - 1]!.id,
            },
          },
          measures,
        });
      }
      case "part-measure-range": {
        if (decoded.value.start.partId !== decoded.value.end.partId) {
          return failure("read.range-owner-mismatch");
        }
        const partId = decoded.value.start.partId;
        const startIndex = getMeasureIndex(
          indexed.value,
          decoded.value.start.measureId,
        );
        const endIndex = getMeasureIndex(
          indexed.value,
          decoded.value.end.measureId,
        );
        if (
          !hasPart(indexed.value, partId) ||
          startIndex === undefined ||
          endIndex === undefined
        ) {
          return failure("read.range-endpoint-not-found");
        }
        const lower = Math.min(startIndex, endIndex);
        const upper = Math.max(startIndex, endIndex);
        const orderedMeasures = getMeasures(indexed.value).slice(
          lower,
          upper + 1,
        );
        const measureContents = orderedMeasures.map((measure) =>
          getPartMeasureContent(indexed.value, partId, measure.id),
        );
        if (measureContents.some((content) => content === undefined)) {
          return INVARIANT_VIOLATION;
        }
        return success({
          kind: "part-measure-range",
          normalized: {
            kind: "part-measure-range",
            start: {
              kind: "part-measure",
              partId,
              measureId: orderedMeasures[0]!.id,
            },
            end: {
              kind: "part-measure",
              partId,
              measureId: orderedMeasures[orderedMeasures.length - 1]!.id,
            },
          },
          measureContents: measureContents as readonly NonNullable<
            (typeof measureContents)[number]
          >[],
        });
      }
      case "voice-event-range": {
        if (decoded.value.start.voiceId !== decoded.value.end.voiceId) {
          return failure("read.range-owner-mismatch");
        }
        const voiceId = decoded.value.start.voiceId;
        const startOwner = getEventOwnership(
          indexed.value,
          decoded.value.start.eventId,
        );
        const endOwner = getEventOwnership(
          indexed.value,
          decoded.value.end.eventId,
        );
        if (startOwner === undefined || endOwner === undefined) {
          return failure("read.range-endpoint-not-found");
        }
        if (startOwner.voiceId !== voiceId || endOwner.voiceId !== voiceId) {
          return failure("read.range-owner-mismatch");
        }
        const events = getVoiceEvents(indexed.value, voiceId);
        if (events === undefined) {
          return failure("read.range-endpoint-not-found");
        }
        const startEventId = decoded.value.start.eventId;
        const endEventId = decoded.value.end.eventId;
        const startIndex = events.findIndex(
          ({ id }) => id === startEventId,
        );
        const endIndex = events.findIndex(
          ({ id }) => id === endEventId,
        );
        if (startIndex < 0 || endIndex < 0) {
          return INVARIANT_VIOLATION;
        }
        const lower = Math.min(startIndex, endIndex);
        const upper = Math.max(startIndex, endIndex);
        const selectedEvents = events.slice(lower, upper + 1);
        return success({
          kind: "voice-event-range",
          normalized: {
            kind: "voice-event-range",
            start: {
              kind: "voice-event",
              voiceId,
              eventId: selectedEvents[0]!.id,
            },
            end: {
              kind: "voice-event",
              voiceId,
              eventId: selectedEvents[selectedEvents.length - 1]!.id,
            },
          },
          events: selectedEvents,
        });
      }
    }
  } catch {
    return INVARIANT_VIOLATION;
  }
}

export function selectHistoryState(
  state: KernelReadState,
): ReadResult<KernelHistoryState> {
  try {
    const indexed = getEntityIndex(state.snapshot);
    if (!indexed.ok) {
      return indexed;
    }
    if (
      !Number.isSafeInteger(state.history.undoDepth) ||
      state.history.undoDepth < 0 ||
      !Number.isSafeInteger(state.history.redoDepth) ||
      state.history.redoDepth < 0
    ) {
      return INVARIANT_VIOLATION;
    }
    return success(state.history);
  } catch {
    return INVARIANT_VIOLATION;
  }
}

export function selectDirtyState(
  state: KernelReadState,
): ReadResult<boolean> {
  try {
    const indexed = getEntityIndex(state.snapshot);
    if (!indexed.ok) {
      return indexed;
    }
    return typeof state.dirty === "boolean"
      ? success(state.dirty)
      : INVARIANT_VIOLATION;
  } catch {
    return INVARIANT_VIOLATION;
  }
}
