import type {
  ScoreAddress,
  ScorePoint,
  ScoreRange,
} from "../domain/address";

export type AddressDecodeResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false };

export interface DecodedPersistedCheckpoint {
  readonly documentId: string;
  readonly documentVersion: number;
}

type PlainRecord = Readonly<Record<string, unknown>>;

function exactRecord(
  value: unknown,
  expectedKeys: readonly string[],
): PlainRecord | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    return undefined;
  }
  const ownKeys = Reflect.ownKeys(value);
  if (
    ownKeys.length !== expectedKeys.length ||
    ownKeys.some(
      (key) => typeof key !== "string" || !expectedKeys.includes(key),
    )
  ) {
    return undefined;
  }

  const decoded: Record<string, unknown> = {};
  for (const key of expectedKeys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (
      descriptor === undefined ||
      !("value" in descriptor) ||
      !descriptor.enumerable
    ) {
      return undefined;
    }
    decoded[key] = descriptor.value;
  }
  return decoded;
}

function dataProperty(value: unknown, key: string): unknown {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor !== undefined && "value" in descriptor
    ? descriptor.value
    : undefined;
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function decodeAddressValue(input: unknown): ScoreAddress | undefined {
  switch (dataProperty(input, "kind")) {
    case "document": {
      const record = exactRecord(input, ["kind", "documentId"]);
      return record !== undefined && nonEmptyString(record.documentId)
        ? { kind: "document", documentId: record.documentId }
        : undefined;
    }
    case "measure": {
      const record = exactRecord(input, ["kind", "measureId"]);
      return record !== undefined && nonEmptyString(record.measureId)
        ? { kind: "measure", measureId: record.measureId }
        : undefined;
    }
    case "part": {
      const record = exactRecord(input, ["kind", "partId"]);
      return record !== undefined && nonEmptyString(record.partId)
        ? { kind: "part", partId: record.partId }
        : undefined;
    }
    case "staff": {
      const record = exactRecord(input, ["kind", "staffId"]);
      return record !== undefined && nonEmptyString(record.staffId)
        ? { kind: "staff", staffId: record.staffId }
        : undefined;
    }
    case "voice": {
      const record = exactRecord(input, ["kind", "voiceId"]);
      return record !== undefined && nonEmptyString(record.voiceId)
        ? { kind: "voice", voiceId: record.voiceId }
        : undefined;
    }
    case "event": {
      const record = exactRecord(input, ["kind", "eventId"]);
      return record !== undefined && nonEmptyString(record.eventId)
        ? { kind: "event", eventId: record.eventId }
        : undefined;
    }
    case "note": {
      const record = exactRecord(input, ["kind", "noteId"]);
      return record !== undefined && nonEmptyString(record.noteId)
        ? { kind: "note", noteId: record.noteId }
        : undefined;
    }
    default:
      return undefined;
  }
}

function decodePointValue(input: unknown): ScorePoint | undefined {
  switch (dataProperty(input, "kind")) {
    case "measure": {
      const record = exactRecord(input, ["kind", "measureId"]);
      return record !== undefined && nonEmptyString(record.measureId)
        ? { kind: "measure", measureId: record.measureId }
        : undefined;
    }
    case "part-measure": {
      const record = exactRecord(input, ["kind", "partId", "measureId"]);
      return record !== undefined &&
        nonEmptyString(record.partId) &&
        nonEmptyString(record.measureId)
        ? {
            kind: "part-measure",
            partId: record.partId,
            measureId: record.measureId,
          }
        : undefined;
    }
    case "voice-event": {
      const record = exactRecord(input, ["kind", "voiceId", "eventId"]);
      return record !== undefined &&
        nonEmptyString(record.voiceId) &&
        nonEmptyString(record.eventId)
        ? {
            kind: "voice-event",
            voiceId: record.voiceId,
            eventId: record.eventId,
          }
        : undefined;
    }
    default:
      return undefined;
  }
}

function decodeRangeValue(input: unknown): ScoreRange | undefined {
  const record = exactRecord(input, ["kind", "start", "end"]);
  if (record === undefined) {
    return undefined;
  }
  const start = decodePointValue(record.start);
  const end = decodePointValue(record.end);
  switch (record.kind) {
    case "measure-range":
      return start?.kind === "measure" && end?.kind === "measure"
        ? { kind: "measure-range", start, end }
        : undefined;
    case "part-measure-range":
      return start?.kind === "part-measure" && end?.kind === "part-measure"
        ? { kind: "part-measure-range", start, end }
        : undefined;
    case "voice-event-range":
      return start?.kind === "voice-event" && end?.kind === "voice-event"
        ? { kind: "voice-event-range", start, end }
        : undefined;
    default:
      return undefined;
  }
}

export function decodeScoreAddress(
  input: unknown,
): AddressDecodeResult<ScoreAddress> {
  try {
    const value = decodeAddressValue(input);
    return value === undefined ? { ok: false } : { ok: true, value };
  } catch {
    return { ok: false };
  }
}

export function decodeScorePoint(
  input: unknown,
): AddressDecodeResult<ScorePoint> {
  try {
    const value = decodePointValue(input);
    return value === undefined ? { ok: false } : { ok: true, value };
  } catch {
    return { ok: false };
  }
}

export function decodeScoreRange(
  input: unknown,
): AddressDecodeResult<ScoreRange> {
  try {
    const value = decodeRangeValue(input);
    return value === undefined ? { ok: false } : { ok: true, value };
  } catch {
    return { ok: false };
  }
}

export function decodePersistedCheckpoint(
  input: unknown,
): AddressDecodeResult<DecodedPersistedCheckpoint> {
  try {
    const record = exactRecord(input, ["documentId", "documentVersion"]);
    return record !== undefined &&
      nonEmptyString(record.documentId) &&
      typeof record.documentVersion === "number" &&
      Number.isSafeInteger(record.documentVersion) &&
      record.documentVersion >= 0
      ? {
          ok: true,
          value: {
            documentId: record.documentId,
            documentVersion: record.documentVersion,
          },
        }
      : { ok: false };
  } catch {
    return { ok: false };
  }
}
