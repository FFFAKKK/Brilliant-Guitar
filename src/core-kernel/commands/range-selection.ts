import type { ScoreRange } from "../domain/address";
import type {
  PartMeasureContent,
  RhythmicEvent,
  ScoreDocument,
  Voice,
} from "../domain/score-document";
import { deepFreezeValue } from "../read/deep-freeze";
import type { CommandFailure } from "./contracts";

interface SelectedPartMeasure {
  readonly partId: string;
  readonly content: PartMeasureContent;
}

export type ResolvedRangeSelection =
  | {
      readonly kind: "measure-range";
      readonly measures: readonly {
        readonly measureId: string;
        readonly contents: readonly SelectedPartMeasure[];
      }[];
    }
  | {
      readonly kind: "part-measure-range";
      readonly partId: string;
      readonly contents: readonly PartMeasureContent[];
    }
  | {
      readonly kind: "voice-event-range";
      readonly partId: string;
      readonly measureId: string;
      readonly voiceId: string;
      readonly events: readonly RhythmicEvent[];
    };

export type ResolveRangeSelectionResult =
  | { readonly ok: true; readonly value: ResolvedRangeSelection }
  | { readonly ok: false; readonly failure: CommandFailure };

const structuredCloneValue = structuredClone;

function cloneValue<T>(value: T): T {
  return structuredCloneValue(value);
}

function failure(
  code:
    | "command.invalid-range"
    | "command.range-endpoint-not-found"
    | "command.range-owner-mismatch",
): ResolveRangeSelectionResult {
  return { ok: false, failure: { code } };
}

function uniqueIndexById<T extends { readonly id: string }>(
  values: readonly T[],
  id: string,
): number | undefined {
  let found = -1;
  for (let index = 0; index < values.length; index += 1) {
    if (values[index]?.id !== id) {
      continue;
    }
    if (found >= 0) {
      return undefined;
    }
    found = index;
  }
  return found < 0 ? -1 : found;
}

function orderedBounds(
  start: number | undefined,
  end: number | undefined,
): readonly [number, number] | undefined {
  if (start === undefined || end === undefined || start < 0 || end < 0) {
    return undefined;
  }
  return start <= end ? [start, end] : [end, start];
}

function partContent(
  part: ScoreDocument["parts"][number],
  measureId: string,
): PartMeasureContent | undefined {
  let found: PartMeasureContent | undefined;
  for (const content of part.measureContents) {
    if (content.measureId !== measureId) {
      continue;
    }
    if (found !== undefined) {
      return undefined;
    }
    found = content;
  }
  return found;
}

interface VoiceLocation {
  readonly partId: string;
  readonly measureId: string;
  readonly voice: Voice;
}

interface PartMeasureLocation {
  readonly part: ScoreDocument["parts"][number];
  readonly measureIndex: number;
  readonly content: PartMeasureContent;
}

interface VoiceEventLocation extends VoiceLocation {
  readonly eventIndex: number;
  readonly event: RhythmicEvent;
}

type UniqueLookup<T> =
  | { readonly status: "found"; readonly value: T }
  | { readonly status: "duplicate" }
  | { readonly status: "missing" };

type EndpointLookup<T> =
  | UniqueLookup<T>
  | { readonly status: "owner-mismatch" };

function findUniquePartContent(
  part: ScoreDocument["parts"][number],
  measureId: string,
): UniqueLookup<PartMeasureContent> {
  let found: PartMeasureContent | undefined;
  for (const content of part.measureContents) {
    if (content.measureId !== measureId) {
      continue;
    }
    if (found !== undefined) {
      return { status: "duplicate" };
    }
    found = content;
  }
  return found === undefined
    ? { status: "missing" }
    : { status: "found", value: found };
}

function resolvePartMeasureEndpoint(
  document: ScoreDocument,
  point: Extract<ScoreRange, { readonly kind: "part-measure-range" }>["start"],
): UniqueLookup<PartMeasureLocation> {
  const partIndex = uniqueIndexById(document.parts, point.partId);
  const measureIndex = uniqueIndexById(
    document.measureDefinitions,
    point.measureId,
  );
  if (partIndex === undefined || measureIndex === undefined) {
    return { status: "duplicate" };
  }
  if (partIndex < 0 || measureIndex < 0) {
    return { status: "missing" };
  }
  const part = document.parts[partIndex];
  if (part === undefined) {
    return { status: "duplicate" };
  }
  const content = findUniquePartContent(part, point.measureId);
  return content.status === "found"
    ? {
        status: "found",
        value: { part, measureIndex, content: content.value },
      }
    : content;
}

function findUniqueVoice(
  document: ScoreDocument,
  voiceId: string,
): UniqueLookup<VoiceLocation> {
  let found: VoiceLocation | undefined;
  for (const part of document.parts) {
    for (const content of part.measureContents) {
      for (const voice of content.voices) {
        if (voice.id !== voiceId) {
          continue;
        }
        if (found !== undefined) {
          return { status: "duplicate" };
        }
        found = { partId: part.id, measureId: content.measureId, voice };
      }
    }
  }
  return found === undefined
    ? { status: "missing" }
    : { status: "found", value: found };
}

function eventOwnerVoiceId(
  document: ScoreDocument,
  eventId: string,
): UniqueLookup<string> {
  let found: string | undefined;
  for (const part of document.parts) {
    for (const content of part.measureContents) {
      for (const voice of content.voices) {
        for (const event of voice.sequence.events) {
          if (event.id !== eventId) {
            continue;
          }
          if (found !== undefined) {
            return { status: "duplicate" };
          }
          found = voice.id;
        }
      }
    }
  }
  return found === undefined
    ? { status: "missing" }
    : { status: "found", value: found };
}

function resolveVoiceEventEndpoint(
  document: ScoreDocument,
  point: Extract<ScoreRange, { readonly kind: "voice-event-range" }>["start"],
): EndpointLookup<VoiceEventLocation> {
  const voice = findUniqueVoice(document, point.voiceId);
  const eventOwner = eventOwnerVoiceId(document, point.eventId);
  if (voice.status === "duplicate" || eventOwner.status === "duplicate") {
    return { status: "duplicate" };
  }
  if (voice.status === "missing" || eventOwner.status === "missing") {
    return { status: "missing" };
  }
  if (eventOwner.value !== voice.value.voice.id) {
    return { status: "owner-mismatch" };
  }
  const eventIndex = uniqueIndexById(
    voice.value.voice.sequence.events,
    point.eventId,
  );
  if (eventIndex === undefined) {
    return { status: "duplicate" };
  }
  const event = voice.value.voice.sequence.events[eventIndex];
  return eventIndex < 0 || event === undefined
    ? { status: "missing" }
    : {
        status: "found",
        value: { ...voice.value, eventIndex, event },
      };
}

function resolveMeasureRange(
  document: ScoreDocument,
  range: Extract<ScoreRange, { readonly kind: "measure-range" }>,
): ResolveRangeSelectionResult {
  const start = uniqueIndexById(document.measureDefinitions, range.start.measureId);
  const end = uniqueIndexById(document.measureDefinitions, range.end.measureId);
  if (start === undefined || end === undefined) {
    return failure("command.invalid-range");
  }
  const bounds = orderedBounds(start, end);
  if (bounds === undefined) {
    return failure("command.range-endpoint-not-found");
  }
  const measures: Extract<
    ResolvedRangeSelection,
    { readonly kind: "measure-range" }
  >["measures"][number][] = [];
  for (let index = bounds[0]; index <= bounds[1]; index += 1) {
    const definition = document.measureDefinitions[index];
    if (definition === undefined) {
      return failure("command.invalid-range");
    }
    const contents: SelectedPartMeasure[] = [];
    for (const part of document.parts) {
      const content = partContent(part, definition.id);
      if (content === undefined) {
        return failure("command.invalid-range");
      }
      contents.push({ partId: part.id, content: cloneValue(content) });
    }
    measures.push({ measureId: definition.id, contents });
  }
  return {
    ok: true,
    value: deepFreezeValue({ kind: "measure-range", measures }),
  };
}

function resolvePartMeasureRange(
  document: ScoreDocument,
  range: Extract<ScoreRange, { readonly kind: "part-measure-range" }>,
): ResolveRangeSelectionResult {
  const startEndpoint = resolvePartMeasureEndpoint(document, range.start);
  const endEndpoint = resolvePartMeasureEndpoint(document, range.end);
  if (startEndpoint.status === "duplicate" || endEndpoint.status === "duplicate") {
    return failure("command.invalid-range");
  }
  if (startEndpoint.status === "missing" || endEndpoint.status === "missing") {
    return failure("command.range-endpoint-not-found");
  }
  if (range.start.partId !== range.end.partId) {
    return failure("command.range-owner-mismatch");
  }
  const part = startEndpoint.value.part;
  const bounds = orderedBounds(
    startEndpoint.value.measureIndex,
    endEndpoint.value.measureIndex,
  );
  if (bounds === undefined) {
    return failure("command.invalid-range");
  }
  const contents: PartMeasureContent[] = [];
  for (let index = bounds[0]; index <= bounds[1]; index += 1) {
    const measure = document.measureDefinitions[index];
    if (measure === undefined) {
      return failure("command.invalid-range");
    }
    const content = partContent(part, measure.id);
    if (content === undefined) {
      return failure("command.range-endpoint-not-found");
    }
    contents.push(cloneValue(content));
  }
  return {
    ok: true,
    value: deepFreezeValue({
      kind: "part-measure-range",
      partId: part.id,
      contents,
    }),
  };
}

function resolveVoiceEventRange(
  document: ScoreDocument,
  range: Extract<ScoreRange, { readonly kind: "voice-event-range" }>,
): ResolveRangeSelectionResult {
  const startEndpoint = resolveVoiceEventEndpoint(document, range.start);
  const endEndpoint = resolveVoiceEventEndpoint(document, range.end);
  if (startEndpoint.status === "duplicate" || endEndpoint.status === "duplicate") {
    return failure("command.invalid-range");
  }
  if (startEndpoint.status === "missing" || endEndpoint.status === "missing") {
    return failure("command.range-endpoint-not-found");
  }
  if (
    startEndpoint.status === "owner-mismatch" ||
    endEndpoint.status === "owner-mismatch" ||
    range.start.voiceId !== range.end.voiceId
  ) {
    return failure("command.range-owner-mismatch");
  }
  const location = startEndpoint.value;
  const bounds = orderedBounds(
    startEndpoint.value.eventIndex,
    endEndpoint.value.eventIndex,
  );
  if (bounds === undefined) {
    return failure("command.invalid-range");
  }
  const events: RhythmicEvent[] = [];
  for (let index = bounds[0]; index <= bounds[1]; index += 1) {
    const event = location.voice.sequence.events[index];
    if (event === undefined) {
      return failure("command.invalid-range");
    }
    events.push(cloneValue(event));
  }
  return {
    ok: true,
    value: deepFreezeValue({
      kind: "voice-event-range",
      partId: location.partId,
      measureId: location.measureId,
      voiceId: location.voice.id,
      events,
    }),
  };
}

export function resolveRangeSelection(
  document: ScoreDocument,
  range: ScoreRange,
): ResolveRangeSelectionResult {
  try {
    switch (range.kind) {
      case "measure-range":
        return resolveMeasureRange(document, range);
      case "part-measure-range":
        return resolvePartMeasureRange(document, range);
      case "voice-event-range":
        return resolveVoiceEventRange(document, range);
    }
  } catch {
    return failure("command.invalid-range");
  }
}
