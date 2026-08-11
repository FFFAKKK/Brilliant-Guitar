import {
  isNoteValueBase,
  isNoteValueDots,
  type NoteValue,
  type TimeModification,
} from "../domain/musical-time";
import type {
  NotesContent,
  RhythmicEvent,
  ScoreDocument,
  ScoreMetadata,
  ScoreNote,
} from "../domain/score-document";
import { isWrittenPitch, type WrittenPitch } from "../domain/pitch";
import type { ScoreAddress } from "../domain/address";
import { deepFreezeValue } from "../read/deep-freeze";
import type {
  CommandFailure,
  CoreCommandEnvelope,
  NotesRhythmicEvent,
  RestRhythmicEvent,
  ScoreEntityTarget,
  SequenceAnchor,
} from "./contracts";
import type { CoreCommandId } from "./catalog";
import {
  freezeCoreEffectSet,
  type CoreEffect,
  type NonEmptyCoreEffectSet,
} from "./effects";
import {
  resolveScoreEntityTarget,
  resolveSequenceAnchor,
} from "./target-resolver";
import { HIERARCHY_COMMAND_ADAPTERS } from "./hierarchy-command-adapters";
import { MEASURE_COMMAND_ADAPTERS } from "./measure-command-adapters";
import { RANGE_COMMAND_ADAPTERS } from "./range-command-adapters";

export type CoreCommandTargetKind = ScoreEntityTarget["kind"];

export type PlainRecord = Readonly<Record<string, unknown>>;

export interface CoreCommandAdapter {
  readonly commandId: CoreCommandId;
  readonly targetKind: CoreCommandTargetKind;
  readonly inputBoundary: "legacy-v1" | "vnext-bounded-v1";
  readonly decodePayload: (
    payload: unknown,
    target: ScoreEntityTarget,
  ) => CoreCommandEnvelope | undefined;
  readonly prepare: (
    document: ScoreDocument,
    command: CoreCommandEnvelope,
  ) => PrepareCoreCommandEffectsResult;
}

export type PrepareCoreCommandEffectsResult =
  | { readonly ok: true; readonly changed: false }
  | {
      readonly ok: true;
      readonly changed: true;
      readonly effects: NonEmptyCoreEffectSet;
      readonly affected: readonly ScoreAddress[];
    }
  | { readonly ok: false; readonly failure: CommandFailure };

export function readExactRecord(
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

export function readDenseArray(value: unknown): readonly unknown[] | undefined {
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

export function decodeCoreCommandTargetKind(
  value: unknown,
): CoreCommandTargetKind | undefined {
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

export function decodeCoreCommandTarget(
  value: unknown,
  kind: CoreCommandTargetKind,
): ScoreEntityTarget | undefined {
  const idKey = `${kind}Id`;
  const record = readExactRecord(value, ["kind", idKey]);
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
  const record = readExactRecord(value, ["title", "authors", "tempo"]);
  const authors = readDenseArray(record?.authors);
  const tempo = readExactRecord(record?.tempo, ["bpm"]);
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
  const record = readExactRecord(value, ["step", "alter", "octave"]);
  return record !== undefined && isWrittenPitch(record)
    ? {
        step: record.step,
        alter: record.alter,
        octave: record.octave,
      }
    : undefined;
}

function decodeTimeModification(value: unknown): TimeModification | undefined {
  const record = readExactRecord(value, ["actualNotes", "normalNotes"]);
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
  const record = readExactRecord(
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
  const record = readExactRecord(value, ["id", "writtenPitch"]);
  const writtenPitch = decodeWrittenPitch(record?.writtenPitch);
  return record !== undefined && nonEmptyString(record.id) && writtenPitch !== undefined
    ? { id: record.id, writtenPitch }
    : undefined;
}

function decodeNotesContent(value: unknown): NotesContent | undefined {
  const record = readExactRecord(value, ["kind", "notes"]);
  const notes = readDenseArray(record?.notes);
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
  const record = readExactRecord(
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
  const content = readExactRecord(base?.record.content, ["kind"]);
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
    return readExactRecord(value, ["kind"]) === undefined
      ? undefined
      : { kind: "start" };
  }
  if (kindDescriptor.value === "after-event") {
    const record = readExactRecord(value, ["kind", "eventId"]);
    return record !== undefined && nonEmptyString(record.eventId)
      ? { kind: "after-event", eventId: record.eventId }
      : undefined;
  }
  return undefined;
}

function decodeSetMetadataPayload(
  value: unknown,
  target: ScoreEntityTarget,
): CoreCommandEnvelope | undefined {
  const payload = readExactRecord(value, ["metadata"]);
  const metadata = decodeMetadata(payload?.metadata);
  return payload !== undefined && metadata !== undefined && target.kind === "document"
    ? {
        commandVersion: 1,
        commandId: "core.document.set-metadata",
        target,
        payload: { metadata },
      }
    : undefined;
}

function decodeSetWrittenPitchPayload(
  value: unknown,
  target: ScoreEntityTarget,
): CoreCommandEnvelope | undefined {
  const payload = readExactRecord(value, ["writtenPitch"]);
  const writtenPitch = decodeWrittenPitch(payload?.writtenPitch);
  return payload !== undefined && writtenPitch !== undefined && target.kind === "note"
    ? {
        commandVersion: 1,
        commandId: "core.note.set-written-pitch",
        target,
        payload: { writtenPitch },
      }
    : undefined;
}

function decodeSetNoteValuePayload(
  value: unknown,
  target: ScoreEntityTarget,
): CoreCommandEnvelope | undefined {
  const payload = readExactRecord(value, ["noteValue"]);
  const noteValue = decodeNoteValue(payload?.noteValue);
  return payload !== undefined && noteValue !== undefined && target.kind === "event"
    ? {
        commandVersion: 1,
        commandId: "core.event.set-note-value",
        target,
        payload: { noteValue },
      }
    : undefined;
}

function decodeInsertNotesEventPayload(
  value: unknown,
  target: ScoreEntityTarget,
): CoreCommandEnvelope | undefined {
  const payload = readExactRecord(value, ["anchor", "event"]);
  const anchor = decodeAnchor(payload?.anchor);
  const event = decodeNotesEvent(payload?.event);
  return payload !== undefined &&
    anchor !== undefined &&
    event !== undefined &&
    target.kind === "voice"
    ? {
        commandVersion: 1,
        commandId: "core.voice.insert-notes-event",
        target,
        payload: { anchor, event },
      }
    : undefined;
}

function decodeInsertRestEventPayload(
  value: unknown,
  target: ScoreEntityTarget,
): CoreCommandEnvelope | undefined {
  const payload = readExactRecord(value, ["anchor", "event"]);
  const anchor = decodeAnchor(payload?.anchor);
  const event = decodeRestEvent(payload?.event);
  return payload !== undefined &&
    anchor !== undefined &&
    event !== undefined &&
    target.kind === "voice"
    ? {
        commandVersion: 1,
        commandId: "core.voice.insert-rest-event",
        target,
        payload: { anchor, event },
      }
    : undefined;
}

function decodeRemoveEventPayload(
  value: unknown,
  target: ScoreEntityTarget,
): CoreCommandEnvelope | undefined {
  const payload = readExactRecord(value, []);
  return payload !== undefined && target.kind === "event"
    ? {
        commandVersion: 1,
        commandId: "core.event.remove",
        target,
        payload: {},
      }
    : undefined;
}

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

function changed(
  effects: NonEmptyCoreEffectSet,
  affected: readonly ScoreAddress[],
): PrepareCoreCommandEffectsResult {
  return {
    ok: true,
    changed: true,
    effects: freezeCoreEffectSet(effects),
    affected: deepFreezeValue(affected.map(cloneValue)),
  };
}

function prepareSetMetadata(
  document: ScoreDocument,
  command: CoreCommandEnvelope,
): PrepareCoreCommandEffectsResult {
  if (
    command.commandId !== "core.document.set-metadata" ||
    command.target.kind !== "document"
  ) {
    return { ok: false, failure: { code: "command.internal-error" } };
  }
  const resolved = resolveScoreEntityTarget(document, command.target);
  if (!resolved.ok) {
    return resolved;
  }
  if (resolved.value.kind !== "document") {
    return { ok: false, failure: { code: "command.internal-error" } };
  }
  if (metadataEqual(resolved.value.document.metadata, command.payload.metadata)) {
    return { ok: true, changed: false };
  }
  return changed(
    [
      {
        kind: "replace-metadata",
        documentId: command.target.documentId,
        value: cloneValue(command.payload.metadata),
      },
    ],
    [{ kind: "document", documentId: command.target.documentId }],
  );
}

function prepareSetWrittenPitch(
  document: ScoreDocument,
  command: CoreCommandEnvelope,
): PrepareCoreCommandEffectsResult {
  if (
    command.commandId !== "core.note.set-written-pitch" ||
    command.target.kind !== "note"
  ) {
    return { ok: false, failure: { code: "command.internal-error" } };
  }
  const resolved = resolveScoreEntityTarget(document, command.target);
  if (!resolved.ok) {
    return resolved;
  }
  if (resolved.value.kind !== "note") {
    return { ok: false, failure: { code: "command.internal-error" } };
  }
  if (pitchEqual(resolved.value.note.writtenPitch, command.payload.writtenPitch)) {
    return { ok: true, changed: false };
  }
  return changed(
    [
      {
        kind: "replace-written-pitch",
        noteId: command.target.noteId,
        value: cloneValue(command.payload.writtenPitch),
      },
    ],
    [{ kind: "note", noteId: command.target.noteId }],
  );
}

function prepareSetNoteValue(
  document: ScoreDocument,
  command: CoreCommandEnvelope,
): PrepareCoreCommandEffectsResult {
  if (
    command.commandId !== "core.event.set-note-value" ||
    command.target.kind !== "event"
  ) {
    return { ok: false, failure: { code: "command.internal-error" } };
  }
  const resolved = resolveScoreEntityTarget(document, command.target);
  if (!resolved.ok) {
    return resolved;
  }
  if (resolved.value.kind !== "event") {
    return { ok: false, failure: { code: "command.internal-error" } };
  }
  if (noteValueEqual(resolved.value.event.duration, command.payload.noteValue)) {
    return { ok: true, changed: false };
  }
  return changed(
    [
      {
        kind: "replace-note-value",
        eventId: command.target.eventId,
        value: cloneValue(command.payload.noteValue),
      },
    ],
    [{ kind: "event", eventId: command.target.eventId }],
  );
}

function prepareInsertEvent(
  document: ScoreDocument,
  command: CoreCommandEnvelope,
): PrepareCoreCommandEffectsResult {
  if (
    (command.commandId !== "core.voice.insert-notes-event" &&
      command.commandId !== "core.voice.insert-rest-event") ||
    command.target.kind !== "voice"
  ) {
    return { ok: false, failure: { code: "command.internal-error" } };
  }
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
  const event = command.payload.event;
  const affected: ScoreAddress[] = [
    { kind: "voice", voiceId: command.target.voiceId },
    { kind: "event", eventId: event.id },
  ];
  if (event.content.kind === "notes") {
    for (const note of event.content.notes) {
      affected.push({ kind: "note", noteId: note.id });
    }
  }
  return changed(
    [
      {
        kind: "insert-event",
        voiceId: command.target.voiceId,
        anchor: cloneValue(command.payload.anchor),
        event: cloneValue(event),
      },
    ],
    affected,
  );
}

function prepareRemoveEvent(
  document: ScoreDocument,
  command: CoreCommandEnvelope,
): PrepareCoreCommandEffectsResult {
  if (
    command.commandId !== "core.event.remove" ||
    command.target.kind !== "event"
  ) {
    return { ok: false, failure: { code: "command.internal-error" } };
  }
  const resolved = resolveScoreEntityTarget(document, command.target);
  if (!resolved.ok) {
    return resolved;
  }
  if (resolved.value.kind !== "event") {
    return { ok: false, failure: { code: "command.internal-error" } };
  }
  const affected: ScoreAddress[] = [
    { kind: "event", eventId: command.target.eventId },
    { kind: "voice", voiceId: resolved.value.voice.id },
  ];
  if (resolved.value.event.content.kind === "notes") {
    for (const note of resolved.value.event.content.notes) {
      affected.push({ kind: "note", noteId: note.id });
    }
  }
  return changed(
    [
      {
        kind: "remove-event",
        voiceId: resolved.value.voice.id,
        eventId: command.target.eventId,
      },
    ],
    affected,
  );
}

export const CORE_COMMAND_ADAPTERS: readonly CoreCommandAdapter[] = Object.freeze([
  Object.freeze({
    commandId: "core.document.set-metadata" as const,
    targetKind: "document" as const,
    inputBoundary: "legacy-v1" as const,
    decodePayload: decodeSetMetadataPayload,
    prepare: prepareSetMetadata,
  }),
  Object.freeze({
    commandId: "core.note.set-written-pitch" as const,
    targetKind: "note" as const,
    inputBoundary: "legacy-v1" as const,
    decodePayload: decodeSetWrittenPitchPayload,
    prepare: prepareSetWrittenPitch,
  }),
  Object.freeze({
    commandId: "core.event.set-note-value" as const,
    targetKind: "event" as const,
    inputBoundary: "legacy-v1" as const,
    decodePayload: decodeSetNoteValuePayload,
    prepare: prepareSetNoteValue,
  }),
  Object.freeze({
    commandId: "core.voice.insert-notes-event" as const,
    targetKind: "voice" as const,
    inputBoundary: "legacy-v1" as const,
    decodePayload: decodeInsertNotesEventPayload,
    prepare: prepareInsertEvent,
  }),
  Object.freeze({
    commandId: "core.voice.insert-rest-event" as const,
    targetKind: "voice" as const,
    inputBoundary: "legacy-v1" as const,
    decodePayload: decodeInsertRestEventPayload,
    prepare: prepareInsertEvent,
  }),
  Object.freeze({
    commandId: "core.event.remove" as const,
    targetKind: "event" as const,
    inputBoundary: "legacy-v1" as const,
    decodePayload: decodeRemoveEventPayload,
    prepare: prepareRemoveEvent,
  }),
  ...MEASURE_COMMAND_ADAPTERS,
  ...HIERARCHY_COMMAND_ADAPTERS,
  ...RANGE_COMMAND_ADAPTERS,
] satisfies readonly CoreCommandAdapter[]);
