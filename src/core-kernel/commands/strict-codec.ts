import {
  isNoteValueBase,
  isNoteValueDots,
  type NoteValue,
  type TimeModification,
} from "../domain/musical-time";
import type {
  NotesContent,
  RhythmicEvent,
  ScoreMetadata,
  ScoreNote,
} from "../domain/score-document";
import { isWrittenPitch, type WrittenPitch } from "../domain/pitch";
import type {
  CommandFailure,
  CoreCommandEnvelope,
  NotesRhythmicEvent,
  RestRhythmicEvent,
  ScoreEntityTarget,
  SequenceAnchor,
} from "./contracts";
import { CORE_COMMAND_DEFINITIONS } from "./catalog";

type TargetKind = ScoreEntityTarget["kind"];

type DecodeResult =
  | { readonly ok: true; readonly value: CoreCommandEnvelope }
  | { readonly ok: false; readonly failure: CommandFailure };

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
    ownKeys.some((key) => typeof key !== "string" || !expectedKeys.includes(key))
  ) {
    return undefined;
  }
  for (const key of expectedKeys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (
      descriptor === undefined ||
      !("value" in descriptor) ||
      !descriptor.enumerable
    ) {
      return undefined;
    }
  }
  return value as PlainRecord;
}

function denseArray(value: unknown): readonly unknown[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
  if (
    lengthDescriptor === undefined ||
    !("value" in lengthDescriptor) ||
    typeof lengthDescriptor.value !== "number" ||
    !Number.isSafeInteger(lengthDescriptor.value) ||
    lengthDescriptor.value < 0
  ) {
    return undefined;
  }
  const length = lengthDescriptor.value;
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.length !== length + 1) {
    return undefined;
  }

  const decoded: unknown[] = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (
      descriptor === undefined ||
      !("value" in descriptor) ||
      !descriptor.enumerable
    ) {
      return undefined;
    }
    decoded.push(descriptor.value);
  }
  return decoded;
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function decodeTargetKind(value: unknown): TargetKind | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  const descriptor = Object.getOwnPropertyDescriptor(value, "kind");
  if (descriptor === undefined || !("value" in descriptor)) {
    return undefined;
  }
  const kind = descriptor.value;
  return kind === "document" ||
    kind === "measure" ||
    kind === "part" ||
    kind === "staff" ||
    kind === "voice" ||
    kind === "event" ||
    kind === "note"
    ? kind
    : undefined;
}

function decodeTarget(
  value: unknown,
  kind: TargetKind,
): ScoreEntityTarget | undefined {
  const idKey = `${kind}Id`;
  const record = exactRecord(value, ["kind", idKey]);
  if (record === undefined || record.kind !== kind || !nonEmptyString(record[idKey])) {
    return undefined;
  }
  const id = record[idKey];
  switch (kind) {
    case "document":
      return { kind, documentId: id };
    case "measure":
      return { kind, measureId: id };
    case "part":
      return { kind, partId: id };
    case "staff":
      return { kind, staffId: id };
    case "voice":
      return { kind, voiceId: id };
    case "event":
      return { kind, eventId: id };
    case "note":
      return { kind, noteId: id };
  }
}

function decodeMetadata(value: unknown): ScoreMetadata | undefined {
  const record = exactRecord(value, ["title", "authors", "tempo"]);
  const authors = denseArray(record?.authors);
  const tempo = exactRecord(record?.tempo, ["bpm"]);
  if (
    record === undefined ||
    typeof record.title !== "string" ||
    authors === undefined ||
    !authors.every((author) => typeof author === "string") ||
    tempo === undefined ||
    typeof tempo.bpm !== "number" ||
    !Number.isFinite(tempo.bpm)
  ) {
    return undefined;
  }
  return {
    title: record.title,
    authors: authors as readonly string[],
    tempo: { bpm: tempo.bpm },
  };
}

function decodeWrittenPitch(value: unknown): WrittenPitch | undefined {
  const record = exactRecord(value, ["step", "alter", "octave"]);
  return record !== undefined && isWrittenPitch(record)
    ? {
        step: record.step,
        alter: record.alter,
        octave: record.octave,
      }
    : undefined;
}

function decodeTimeModification(value: unknown): TimeModification | undefined {
  const record = exactRecord(value, ["actualNotes", "normalNotes"]);
  if (
    record === undefined ||
    typeof record.actualNotes !== "number" ||
    !Number.isSafeInteger(record.actualNotes) ||
    record.actualNotes <= 0 ||
    typeof record.normalNotes !== "number" ||
    !Number.isSafeInteger(record.normalNotes) ||
    record.normalNotes <= 0
  ) {
    return undefined;
  }
  return {
    actualNotes: record.actualNotes,
    normalNotes: record.normalNotes,
  };
}

function decodeNoteValue(value: unknown): NoteValue | undefined {
  const valueRecord =
    typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as PlainRecord)
      : undefined;
  const hasTimeModification =
    valueRecord !== undefined && Object.hasOwn(valueRecord, "timeModification");
  const record = exactRecord(
    value,
    hasTimeModification ? ["base", "dots", "timeModification"] : ["base", "dots"],
  );
  if (
    record === undefined ||
    typeof record.base !== "number" ||
    !isNoteValueBase(record.base) ||
    typeof record.dots !== "number" ||
    !isNoteValueDots(record.dots)
  ) {
    return undefined;
  }
  if (!hasTimeModification) {
    return { base: record.base, dots: record.dots };
  }
  const timeModification = decodeTimeModification(record.timeModification);
  return timeModification === undefined
    ? undefined
    : { base: record.base, dots: record.dots, timeModification };
}

function decodeScoreNote(value: unknown): ScoreNote | undefined {
  const record = exactRecord(value, ["id", "writtenPitch"]);
  const writtenPitch = decodeWrittenPitch(record?.writtenPitch);
  return record !== undefined && nonEmptyString(record.id) && writtenPitch !== undefined
    ? { id: record.id, writtenPitch }
    : undefined;
}

function decodeNotesContent(value: unknown): NotesContent | undefined {
  const record = exactRecord(value, ["kind", "notes"]);
  const notes = denseArray(record?.notes);
  if (record === undefined || record.kind !== "notes" || notes === undefined) {
    return undefined;
  }
  const decodedNotes: ScoreNote[] = [];
  for (const note of notes) {
    const decoded = decodeScoreNote(note);
    if (decoded === undefined) {
      return undefined;
    }
    decodedNotes.push(decoded);
  }
  return { kind: "notes", notes: decodedNotes };
}

function decodeEventBase(
  value: unknown,
): { readonly record: PlainRecord; readonly duration: NoteValue } | undefined {
  const candidate =
    typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as PlainRecord)
      : undefined;
  const hasStaffId = candidate !== undefined && Object.hasOwn(candidate, "staffId");
  const record = exactRecord(
    value,
    hasStaffId
      ? ["id", "duration", "staffId", "content"]
      : ["id", "duration", "content"],
  );
  const duration = decodeNoteValue(record?.duration);
  if (
    record === undefined ||
    !nonEmptyString(record.id) ||
    duration === undefined ||
    (hasStaffId && !nonEmptyString(record.staffId))
  ) {
    return undefined;
  }
  return { record, duration };
}

function decodeNotesEvent(value: unknown): NotesRhythmicEvent | undefined {
  const base = decodeEventBase(value);
  const content = decodeNotesContent(base?.record.content);
  if (base === undefined || content === undefined) {
    return undefined;
  }
  const common = { id: base.record.id as string, duration: base.duration, content };
  return Object.hasOwn(base.record, "staffId")
    ? { ...common, staffId: base.record.staffId as string }
    : common;
}

function decodeRestEvent(value: unknown): RestRhythmicEvent | undefined {
  const base = decodeEventBase(value);
  const content = exactRecord(base?.record.content, ["kind"]);
  if (base === undefined || content?.kind !== "rest") {
    return undefined;
  }
  const common = {
    id: base.record.id as string,
    duration: base.duration,
    content: { kind: "rest" as const },
  };
  return Object.hasOwn(base.record, "staffId")
    ? { ...common, staffId: base.record.staffId as string }
    : common;
}

function decodeAnchor(value: unknown): SequenceAnchor | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  const kindDescriptor = Object.getOwnPropertyDescriptor(value, "kind");
  if (kindDescriptor === undefined || !("value" in kindDescriptor)) {
    return undefined;
  }
  if (kindDescriptor.value === "start") {
    return exactRecord(value, ["kind"]) === undefined
      ? undefined
      : { kind: "start" };
  }
  if (kindDescriptor.value === "after-event") {
    const record = exactRecord(value, ["kind", "eventId"]);
    return record !== undefined && nonEmptyString(record.eventId)
      ? { kind: "after-event", eventId: record.eventId }
      : undefined;
  }
  return undefined;
}

function findDefinition(
  commandId: string,
): (typeof CORE_COMMAND_DEFINITIONS)[number] | undefined {
  return CORE_COMMAND_DEFINITIONS.find(
    (definition) => definition.commandId === commandId,
  );
}

export function decodeCoreCommand(input: unknown): DecodeResult {
  try {
    const envelope = exactRecord(input, [
      "commandVersion",
      "commandId",
      "target",
      "payload",
    ]);
    if (envelope === undefined) {
      return { ok: false, failure: { code: "command.invalid-envelope" } };
    }
    if (
      typeof envelope.commandVersion !== "number" ||
      !Number.isSafeInteger(envelope.commandVersion)
    ) {
      return { ok: false, failure: { code: "command.invalid-envelope" } };
    }
    if (envelope.commandVersion !== 1) {
      return {
        ok: false,
        failure: { code: "command.unsupported-version" },
      };
    }
    if (typeof envelope.commandId !== "string") {
      return { ok: false, failure: { code: "command.invalid-envelope" } };
    }
    const definition = findDefinition(envelope.commandId);
    if (definition === undefined) {
      return { ok: false, failure: { code: "command.unknown-id" } };
    }
    const actualTargetKind = decodeTargetKind(envelope.target);
    if (actualTargetKind === undefined) {
      return { ok: false, failure: { code: "command.invalid-envelope" } };
    }
    if (actualTargetKind !== definition.targetKind) {
      return { ok: false, failure: { code: "command.target-mismatch" } };
    }
    const target = decodeTarget(envelope.target, definition.targetKind);
    if (target === undefined) {
      return { ok: false, failure: { code: "command.invalid-envelope" } };
    }

    switch (definition.commandId) {
      case "core.document.set-metadata": {
        const payload = exactRecord(envelope.payload, ["metadata"]);
        const metadata = decodeMetadata(payload?.metadata);
        return payload !== undefined && metadata !== undefined && target.kind === "document"
          ? {
              ok: true,
              value: {
                commandVersion: 1,
                commandId: definition.commandId,
                target,
                payload: { metadata },
              },
            }
          : { ok: false, failure: { code: "command.invalid-envelope" } };
      }
      case "core.note.set-written-pitch": {
        const payload = exactRecord(envelope.payload, ["writtenPitch"]);
        const writtenPitch = decodeWrittenPitch(payload?.writtenPitch);
        return payload !== undefined && writtenPitch !== undefined && target.kind === "note"
          ? {
              ok: true,
              value: {
                commandVersion: 1,
                commandId: definition.commandId,
                target,
                payload: { writtenPitch },
              },
            }
          : { ok: false, failure: { code: "command.invalid-envelope" } };
      }
      case "core.event.set-note-value": {
        const payload = exactRecord(envelope.payload, ["noteValue"]);
        const noteValue = decodeNoteValue(payload?.noteValue);
        return payload !== undefined && noteValue !== undefined && target.kind === "event"
          ? {
              ok: true,
              value: {
                commandVersion: 1,
                commandId: definition.commandId,
                target,
                payload: { noteValue },
              },
            }
          : { ok: false, failure: { code: "command.invalid-envelope" } };
      }
      case "core.voice.insert-notes-event": {
        const payload = exactRecord(envelope.payload, ["anchor", "event"]);
        const anchor = decodeAnchor(payload?.anchor);
        const event = decodeNotesEvent(payload?.event);
        return payload !== undefined &&
          anchor !== undefined &&
          event !== undefined &&
          target.kind === "voice"
          ? {
              ok: true,
              value: {
                commandVersion: 1,
                commandId: definition.commandId,
                target,
                payload: { anchor, event },
              },
            }
          : { ok: false, failure: { code: "command.invalid-envelope" } };
      }
      case "core.voice.insert-rest-event": {
        const payload = exactRecord(envelope.payload, ["anchor", "event"]);
        const anchor = decodeAnchor(payload?.anchor);
        const event = decodeRestEvent(payload?.event);
        return payload !== undefined &&
          anchor !== undefined &&
          event !== undefined &&
          target.kind === "voice"
          ? {
              ok: true,
              value: {
                commandVersion: 1,
                commandId: definition.commandId,
                target,
                payload: { anchor, event },
              },
            }
          : { ok: false, failure: { code: "command.invalid-envelope" } };
      }
      case "core.event.remove": {
        const payload = exactRecord(envelope.payload, []);
        return payload !== undefined && target.kind === "event"
          ? {
              ok: true,
              value: {
                commandVersion: 1,
                commandId: definition.commandId,
                target,
                payload: {},
              },
            }
          : { ok: false, failure: { code: "command.invalid-envelope" } };
      }
    }
  } catch {
    return { ok: false, failure: { code: "command.invalid-envelope" } };
  }
}
