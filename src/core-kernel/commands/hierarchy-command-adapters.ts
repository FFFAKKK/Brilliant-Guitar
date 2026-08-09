import {
  ScoreComponentDecodeContext,
  decodeClef,
  decodeFraction,
  decodeInstrument,
  decodePart,
  decodeStaff,
  decodeVoice,
} from "../codec/score-component-codec";
import type { ScoreAddress } from "../domain/address";
import type { Fraction } from "../domain/fraction";
import type {
  Clef,
  InstrumentDescriptor,
  Part,
  PartMeasureContent,
  ScoreDocument,
  StaffDefinition,
  Voice,
} from "../domain/score-document";
import { deepFreezeValue } from "../read/deep-freeze";
import type {
  CommandFailure,
  CoreCommandEnvelope,
  InsertPartCommand,
  InsertStaffCommand,
  InsertVoiceCommand,
  MovePartCommand,
  MoveStaffCommand,
  MoveVoiceCommand,
  PartAnchor,
  RemovePartCommand,
  RemoveStaffCommand,
  RemoveVoiceCommand,
  ScoreEntityTarget,
  SetEventStaffAssignmentCommand,
  SetPartInstrumentCommand,
  SetPartNameCommand,
  SetStaffDefinitionCommand,
  SetVoiceDefaultStaffCommand,
  SetVoiceSequenceStartCommand,
  StaffAnchor,
  VoiceAnchor,
} from "./contracts";
import type {
  CoreCommandAdapter,
  PrepareCoreCommandEffectsResult,
} from "./core-command-adapters";
import {
  freezeCoreEffectSet,
  type CoreEffect,
  type NonEmptyCoreEffectSet,
} from "./effects";
import {
  movePartInsertionIndex,
  moveStaffInsertionIndex,
  moveVoiceInsertionIndex,
  resolvePartAnchorInIds,
  resolveScoreEntityTarget,
  resolveStaffAnchor,
  resolveVoiceAnchor,
} from "./target-resolver";

function cloneValue<T>(value: T): T {
  return structuredClone(value);
}

function decodedOrUndefined<T>(
  context: ScoreComponentDecodeContext,
  value: T | undefined,
): T | undefined {
  return value !== undefined && context.diagnostics.length === 0
    ? value
    : undefined;
}

function decodePartAnchor(
  value: unknown,
  path: readonly (string | number)[],
  context: ScoreComponentDecodeContext,
): PartAnchor | undefined {
  const candidate = context.object(value, path, ["kind"], ["partId"]);
  if (candidate === undefined) {
    return undefined;
  }
  if (candidate.kind === "start") {
    return context.object(value, path, ["kind"]) === undefined
      ? undefined
      : { kind: "start" };
  }
  if (candidate.kind === "after-part") {
    const record = context.object(value, path, ["kind", "partId"]);
    const partId = record === undefined
      ? undefined
      : context.string(record.partId, [...path, "partId"]);
    return partId === undefined ? undefined : { kind: "after-part", partId };
  }
  context.add("decode.union", [...path, "kind"]);
  return undefined;
}

function decodeStaffAnchor(
  value: unknown,
  path: readonly (string | number)[],
  context: ScoreComponentDecodeContext,
): StaffAnchor | undefined {
  const candidate = context.object(value, path, ["kind"], ["staffId"]);
  if (candidate === undefined) {
    return undefined;
  }
  if (candidate.kind === "start") {
    return context.object(value, path, ["kind"]) === undefined
      ? undefined
      : { kind: "start" };
  }
  if (candidate.kind === "after-staff") {
    const record = context.object(value, path, ["kind", "staffId"]);
    const staffId = record === undefined
      ? undefined
      : context.string(record.staffId, [...path, "staffId"]);
    return staffId === undefined ? undefined : { kind: "after-staff", staffId };
  }
  context.add("decode.union", [...path, "kind"]);
  return undefined;
}

function decodeVoiceAnchor(
  value: unknown,
  path: readonly (string | number)[],
  context: ScoreComponentDecodeContext,
): VoiceAnchor | undefined {
  const candidate = context.object(value, path, ["kind"], ["voiceId"]);
  if (candidate === undefined) {
    return undefined;
  }
  if (candidate.kind === "start") {
    return context.object(value, path, ["kind"]) === undefined
      ? undefined
      : { kind: "start" };
  }
  if (candidate.kind === "after-voice") {
    const record = context.object(value, path, ["kind", "voiceId"]);
    const voiceId = record === undefined
      ? undefined
      : context.string(record.voiceId, [...path, "voiceId"]);
    return voiceId === undefined ? undefined : { kind: "after-voice", voiceId };
  }
  context.add("decode.union", [...path, "kind"]);
  return undefined;
}

function decodeEventStaffAssignment(
  value: unknown,
  path: readonly (string | number)[],
  context: ScoreComponentDecodeContext,
): SetEventStaffAssignmentCommand["payload"]["assignment"] | undefined {
  const candidate = context.object(value, path, ["kind"], ["staffId"]);
  if (candidate === undefined) {
    return undefined;
  }
  if (candidate.kind === "inherit-default") {
    return context.object(value, path, ["kind"]) === undefined
      ? undefined
      : { kind: "inherit-default" };
  }
  if (candidate.kind === "staff") {
    const record = context.object(value, path, ["kind", "staffId"]);
    const staffId = record === undefined
      ? undefined
      : context.string(record.staffId, [...path, "staffId"]);
    return staffId === undefined ? undefined : { kind: "staff", staffId };
  }
  context.add("decode.union", [...path, "kind"]);
  return undefined;
}

function decodeInsertPartPayload(
  value: unknown,
  target: ScoreEntityTarget,
): CoreCommandEnvelope | undefined {
  if (target.kind !== "document") {
    return undefined;
  }
  const context = new ScoreComponentDecodeContext(true);
  const input = context.object(value, [], ["anchor", "part"]);
  const anchor = input === undefined
    ? undefined
    : decodePartAnchor(input.anchor, ["anchor"], context);
  const part = input === undefined
    ? undefined
    : decodePart(input.part, ["part"], context);
  const payload = decodedOrUndefined(
    context,
    anchor === undefined || part === undefined ? undefined : { anchor, part },
  );
  return payload === undefined
    ? undefined
    : {
        commandVersion: 1,
        commandId: "core.part.insert",
        target,
        payload,
      };
}

function decodeRemovePartPayload(
  value: unknown,
  target: ScoreEntityTarget,
): CoreCommandEnvelope | undefined {
  if (target.kind !== "part") {
    return undefined;
  }
  const context = new ScoreComponentDecodeContext(true);
  const payload = decodedOrUndefined(
    context,
    context.object(value, [], []) === undefined ? undefined : {},
  );
  return payload === undefined
    ? undefined
    : {
        commandVersion: 1,
        commandId: "core.part.remove",
        target,
        payload,
      };
}

function decodeMovePartPayload(
  value: unknown,
  target: ScoreEntityTarget,
): CoreCommandEnvelope | undefined {
  if (target.kind !== "part") {
    return undefined;
  }
  const context = new ScoreComponentDecodeContext(true);
  const input = context.object(value, [], ["anchor"]);
  const anchor = input === undefined
    ? undefined
    : decodePartAnchor(input.anchor, ["anchor"], context);
  const payload = decodedOrUndefined(
    context,
    anchor === undefined ? undefined : { anchor },
  );
  return payload === undefined
    ? undefined
    : {
        commandVersion: 1,
        commandId: "core.part.move",
        target,
        payload,
      };
}

function decodeSetPartNamePayload(
  value: unknown,
  target: ScoreEntityTarget,
): CoreCommandEnvelope | undefined {
  if (target.kind !== "part") {
    return undefined;
  }
  const context = new ScoreComponentDecodeContext(true);
  const input = context.object(value, [], ["name"]);
  const name = input === undefined
    ? undefined
    : context.string(input.name, ["name"]);
  const payload = decodedOrUndefined(
    context,
    name === undefined ? undefined : { name },
  );
  return payload === undefined
    ? undefined
    : {
        commandVersion: 1,
        commandId: "core.part.set-name",
        target,
        payload,
      };
}

function decodeSetPartInstrumentPayload(
  value: unknown,
  target: ScoreEntityTarget,
): CoreCommandEnvelope | undefined {
  if (target.kind !== "part") {
    return undefined;
  }
  const context = new ScoreComponentDecodeContext(true);
  const input = context.object(value, [], ["instrument"]);
  const instrument = input === undefined
    ? undefined
    : decodeInstrument(input.instrument, ["instrument"], context);
  const payload = decodedOrUndefined(
    context,
    instrument === undefined ? undefined : { instrument },
  );
  return payload === undefined
    ? undefined
    : {
        commandVersion: 1,
        commandId: "core.part.set-instrument",
        target,
        payload,
      };
}

function decodeInsertStaffPayload(
  value: unknown,
  target: ScoreEntityTarget,
): CoreCommandEnvelope | undefined {
  if (target.kind !== "part") {
    return undefined;
  }
  const context = new ScoreComponentDecodeContext(true);
  const input = context.object(value, [], ["anchor", "staff"]);
  const anchor = input === undefined
    ? undefined
    : decodeStaffAnchor(input.anchor, ["anchor"], context);
  const staff = input === undefined
    ? undefined
    : decodeStaff(input.staff, ["staff"], context);
  const payload = decodedOrUndefined(
    context,
    anchor === undefined || staff === undefined ? undefined : { anchor, staff },
  );
  return payload === undefined
    ? undefined
    : {
        commandVersion: 1,
        commandId: "core.staff.insert",
        target,
        payload,
      };
}

function decodeRemoveStaffPayload(
  value: unknown,
  target: ScoreEntityTarget,
): CoreCommandEnvelope | undefined {
  if (target.kind !== "staff") {
    return undefined;
  }
  const context = new ScoreComponentDecodeContext(true);
  const payload = decodedOrUndefined(
    context,
    context.object(value, [], []) === undefined ? undefined : {},
  );
  return payload === undefined
    ? undefined
    : {
        commandVersion: 1,
        commandId: "core.staff.remove",
        target,
        payload,
      };
}

function decodeMoveStaffPayload(
  value: unknown,
  target: ScoreEntityTarget,
): CoreCommandEnvelope | undefined {
  if (target.kind !== "staff") {
    return undefined;
  }
  const context = new ScoreComponentDecodeContext(true);
  const input = context.object(value, [], ["anchor"]);
  const anchor = input === undefined
    ? undefined
    : decodeStaffAnchor(input.anchor, ["anchor"], context);
  const payload = decodedOrUndefined(
    context,
    anchor === undefined ? undefined : { anchor },
  );
  return payload === undefined
    ? undefined
    : {
        commandVersion: 1,
        commandId: "core.staff.move",
        target,
        payload,
      };
}

function decodeSetStaffDefinitionPayload(
  value: unknown,
  target: ScoreEntityTarget,
): CoreCommandEnvelope | undefined {
  if (target.kind !== "staff") {
    return undefined;
  }
  const context = new ScoreComponentDecodeContext(true);
  const input = context.object(value, [], ["lineCount", "defaultClef"]);
  const lineCount = input === undefined
    ? undefined
    : context.integer(input.lineCount, ["lineCount"]);
  const defaultClef = input === undefined
    ? undefined
    : decodeClef(input.defaultClef, ["defaultClef"], context);
  const payload = decodedOrUndefined(
    context,
    lineCount === undefined || defaultClef === undefined
      ? undefined
      : { lineCount, defaultClef },
  );
  return payload === undefined
    ? undefined
    : {
        commandVersion: 1,
        commandId: "core.staff.set-definition",
        target,
        payload,
      };
}

function decodeInsertVoicePayload(
  value: unknown,
  target: ScoreEntityTarget,
): CoreCommandEnvelope | undefined {
  if (target.kind !== "part") {
    return undefined;
  }
  const context = new ScoreComponentDecodeContext(true);
  const input = context.object(value, [], ["measureId", "anchor", "voice"]);
  const measureId = input === undefined
    ? undefined
    : context.string(input.measureId, ["measureId"]);
  const anchor = input === undefined
    ? undefined
    : decodeVoiceAnchor(input.anchor, ["anchor"], context);
  const voice = input === undefined
    ? undefined
    : decodeVoice(input.voice, ["voice"], context);
  const payload = decodedOrUndefined(
    context,
    measureId === undefined || anchor === undefined || voice === undefined
      ? undefined
      : { measureId, anchor, voice },
  );
  return payload === undefined
    ? undefined
    : {
        commandVersion: 1,
        commandId: "core.voice.insert",
        target,
        payload,
      };
}

function decodeRemoveVoicePayload(
  value: unknown,
  target: ScoreEntityTarget,
): CoreCommandEnvelope | undefined {
  if (target.kind !== "voice") {
    return undefined;
  }
  const context = new ScoreComponentDecodeContext(true);
  const payload = decodedOrUndefined(
    context,
    context.object(value, [], []) === undefined ? undefined : {},
  );
  return payload === undefined
    ? undefined
    : {
        commandVersion: 1,
        commandId: "core.voice.remove",
        target,
        payload,
      };
}

function decodeMoveVoicePayload(
  value: unknown,
  target: ScoreEntityTarget,
): CoreCommandEnvelope | undefined {
  if (target.kind !== "voice") {
    return undefined;
  }
  const context = new ScoreComponentDecodeContext(true);
  const input = context.object(value, [], ["anchor"]);
  const anchor = input === undefined
    ? undefined
    : decodeVoiceAnchor(input.anchor, ["anchor"], context);
  const payload = decodedOrUndefined(
    context,
    anchor === undefined ? undefined : { anchor },
  );
  return payload === undefined
    ? undefined
    : {
        commandVersion: 1,
        commandId: "core.voice.move",
        target,
        payload,
      };
}

function decodeSetVoiceDefaultStaffPayload(
  value: unknown,
  target: ScoreEntityTarget,
): CoreCommandEnvelope | undefined {
  if (target.kind !== "voice") {
    return undefined;
  }
  const context = new ScoreComponentDecodeContext(true);
  const input = context.object(value, [], ["staffId"]);
  const staffId = input === undefined
    ? undefined
    : context.string(input.staffId, ["staffId"]);
  const payload = decodedOrUndefined(
    context,
    staffId === undefined ? undefined : { staffId },
  );
  return payload === undefined
    ? undefined
    : {
        commandVersion: 1,
        commandId: "core.voice.set-default-staff",
        target,
        payload,
      };
}

function decodeSetVoiceSequenceStartPayload(
  value: unknown,
  target: ScoreEntityTarget,
): CoreCommandEnvelope | undefined {
  if (target.kind !== "voice") {
    return undefined;
  }
  const context = new ScoreComponentDecodeContext(true);
  const input = context.object(value, [], ["start"]);
  const start = input === undefined
    ? undefined
    : decodeFraction(input.start, ["start"], context);
  const payload = decodedOrUndefined(
    context,
    start === undefined ? undefined : { start },
  );
  return payload === undefined
    ? undefined
    : {
        commandVersion: 1,
        commandId: "core.voice.set-sequence-start",
        target,
        payload,
      };
}

function decodeSetEventStaffAssignmentPayload(
  value: unknown,
  target: ScoreEntityTarget,
): CoreCommandEnvelope | undefined {
  if (target.kind !== "event") {
    return undefined;
  }
  const context = new ScoreComponentDecodeContext(true);
  const input = context.object(value, [], ["assignment"]);
  const assignment = input === undefined
    ? undefined
    : decodeEventStaffAssignment(input.assignment, ["assignment"], context);
  const payload = decodedOrUndefined(
    context,
    assignment === undefined ? undefined : { assignment },
  );
  return payload === undefined
    ? undefined
    : {
        commandVersion: 1,
        commandId: "core.event.set-staff-assignment",
        target,
        payload,
      };
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

function asNonEmpty(effects: readonly CoreEffect[]): NonEmptyCoreEffectSet {
  const first = effects[0];
  if (first === undefined) {
    throw new TypeError("Hierarchy command effects must be nonempty");
  }
  return [first, ...effects.slice(1)];
}

function addressKey(address: ScoreAddress): string {
  switch (address.kind) {
    case "document":
      return `document:${address.documentId}`;
    case "measure":
      return `measure:${address.measureId}`;
    case "part":
      return `part:${address.partId}`;
    case "staff":
      return `staff:${address.staffId}`;
    case "voice":
      return `voice:${address.voiceId}`;
    case "event":
      return `event:${address.eventId}`;
    case "note":
      return `note:${address.noteId}`;
  }
}

function appendAffected(
  affected: ScoreAddress[],
  seen: Set<string>,
  address: ScoreAddress,
): void {
  const key = addressKey(address);
  if (!seen.has(key)) {
    seen.add(key);
    affected.push(address);
  }
}

function appendVoiceDescendants(
  affected: ScoreAddress[],
  seen: Set<string>,
  voice: Voice,
): void {
  appendAffected(affected, seen, { kind: "voice", voiceId: voice.id });
  appendVoiceEventsAndNotes(affected, seen, voice);
}

function appendVoiceEventsAndNotes(
  affected: ScoreAddress[],
  seen: Set<string>,
  voice: Voice,
): void {
  for (const event of voice.sequence.events) {
    appendAffected(affected, seen, { kind: "event", eventId: event.id });
    if (event.content.kind === "notes") {
      for (const note of event.content.notes) {
        appendAffected(affected, seen, { kind: "note", noteId: note.id });
      }
    }
  }
}

function partContentsInGlobalMeasureOrder(
  document: ScoreDocument,
  part: Part,
): readonly PartMeasureContent[] | undefined {
  if (part.measureContents.length !== document.measureDefinitions.length) {
    return undefined;
  }
  const byMeasureId = new Map<string, PartMeasureContent>();
  for (const content of part.measureContents) {
    if (byMeasureId.has(content.measureId)) {
      return undefined;
    }
    byMeasureId.set(content.measureId, content);
  }
  const ordered: PartMeasureContent[] = [];
  for (const measure of document.measureDefinitions) {
    const content = byMeasureId.get(measure.id);
    if (content === undefined) {
      return undefined;
    }
    ordered.push(content);
  }
  return ordered;
}

function appendPartAggregateAffected(
  affected: ScoreAddress[],
  seen: Set<string>,
  document: ScoreDocument,
  part: Part,
): void {
  appendAffected(affected, seen, { kind: "part", partId: part.id });
  for (const staff of part.staves) {
    appendAffected(affected, seen, { kind: "staff", staffId: staff.id });
  }
  const contents = partContentsInGlobalMeasureOrder(document, part) ?? part.measureContents;
  for (const content of contents) {
    for (const voice of content.voices) {
      appendVoiceDescendants(affected, seen, voice);
    }
  }
}

function arrayEqual(left: readonly string[], right: readonly string[]): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function movedIds(
  ids: readonly string[],
  targetId: string,
  insertionIndex: number,
): readonly string[] | undefined {
  const targetIndex = ids.indexOf(targetId);
  if (targetIndex < 0) {
    return undefined;
  }
  const output = [...ids];
  const removed = output.splice(targetIndex, 1);
  const target = removed[0];
  if (target === undefined) {
    return undefined;
  }
  output.splice(insertionIndex, 0, target);
  return output;
}

function partIds(document: ScoreDocument): readonly string[] {
  return document.parts.map((part) => part.id);
}

function staffIds(part: Part): readonly string[] {
  return part.staves.map((staff) => staff.id);
}

function voiceIds(content: PartMeasureContent): readonly string[] {
  return content.voices.map((voice) => voice.id);
}

function canonicalizeInsertedPart(
  document: ScoreDocument,
  part: Part,
): Part {
  const orderedContents = partContentsInGlobalMeasureOrder(document, part);
  return orderedContents === undefined
    ? part
    : { ...part, measureContents: orderedContents };
}

function resolvePartContent(
  part: Part,
  measureId: string,
): PartMeasureContent | undefined {
  let match: PartMeasureContent | undefined;
  for (const content of part.measureContents) {
    if (content.measureId !== measureId) {
      continue;
    }
    if (match !== undefined) {
      return undefined;
    }
    match = content;
  }
  return match;
}

function hasLiveStaffReference(part: Part, staffId: string): boolean {
  for (const content of part.measureContents) {
    for (const voice of content.voices) {
      if (voice.defaultStaffId === staffId) {
        return true;
      }
      if (voice.sequence.events.some((event) => event.staffId === staffId)) {
        return true;
      }
    }
  }
  return false;
}

function instrumentEqual(
  left: InstrumentDescriptor,
  right: InstrumentDescriptor,
): boolean {
  return (
    left.name === right.name &&
    left.writtenToSounding.diatonicSteps ===
      right.writtenToSounding.diatonicSteps &&
    left.writtenToSounding.chromaticSemitones ===
      right.writtenToSounding.chromaticSemitones
  );
}

function clefEqual(left: Clef, right: Clef): boolean {
  return left.sign === right.sign && left.line === right.line;
}

function staffEqual(left: StaffDefinition, right: StaffDefinition): boolean {
  return (
    left.id === right.id &&
    left.lineCount === right.lineCount &&
    clefEqual(left.defaultClef, right.defaultClef)
  );
}

function fractionEqual(left: Fraction, right: Fraction): boolean {
  return (
    left.numerator === right.numerator &&
    left.denominator === right.denominator
  );
}

function prepareInsertPart(
  document: ScoreDocument,
  command: CoreCommandEnvelope,
): PrepareCoreCommandEffectsResult {
  if (
    command.commandId !== "core.part.insert" ||
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
  const anchor = resolvePartAnchorInIds(partIds(document), command.payload.anchor);
  if (!anchor.ok) {
    return anchor;
  }
  const part = canonicalizeInsertedPart(document, command.payload.part);
  const affected: ScoreAddress[] = [];
  const seen = new Set<string>();
  appendAffected(affected, seen, {
    kind: "document",
    documentId: command.target.documentId,
  });
  appendPartAggregateAffected(affected, seen, document, part);
  return changed(
    asNonEmpty([
      {
        kind: "insert-part-bundle",
        documentId: command.target.documentId,
        anchor: cloneValue(command.payload.anchor),
        part: cloneValue(part),
        extensions: [],
      },
    ]),
    affected,
  );
}

function prepareRemovePart(
  document: ScoreDocument,
  command: CoreCommandEnvelope,
): PrepareCoreCommandEffectsResult {
  if (
    command.commandId !== "core.part.remove" ||
    command.target.kind !== "part"
  ) {
    return { ok: false, failure: { code: "command.internal-error" } };
  }
  const resolved = resolveScoreEntityTarget(document, command.target);
  if (!resolved.ok) {
    return resolved;
  }
  if (resolved.value.kind !== "part") {
    return { ok: false, failure: { code: "command.internal-error" } };
  }
  const affected: ScoreAddress[] = [];
  const seen = new Set<string>();
  appendAffected(affected, seen, {
    kind: "part",
    partId: command.target.partId,
  });
  appendAffected(affected, seen, { kind: "document", documentId: document.id });
  for (const staff of resolved.value.part.staves) {
    appendAffected(affected, seen, { kind: "staff", staffId: staff.id });
  }
  const contents = partContentsInGlobalMeasureOrder(document, resolved.value.part);
  if (contents === undefined) {
    return { ok: false, failure: { code: "command.internal-error" } };
  }
  for (const content of contents) {
    for (const voice of content.voices) {
      appendVoiceDescendants(affected, seen, voice);
    }
  }
  return changed(
    asNonEmpty([
      {
        kind: "remove-part-bundle",
        documentId: document.id,
        partId: command.target.partId,
      },
    ]),
    affected,
  );
}

function prepareMovePart(
  document: ScoreDocument,
  command: CoreCommandEnvelope,
): PrepareCoreCommandEffectsResult {
  if (
    command.commandId !== "core.part.move" ||
    command.target.kind !== "part"
  ) {
    return { ok: false, failure: { code: "command.internal-error" } };
  }
  const resolved = resolveScoreEntityTarget(document, command.target);
  if (!resolved.ok) {
    return resolved;
  }
  if (resolved.value.kind !== "part") {
    return { ok: false, failure: { code: "command.internal-error" } };
  }
  const move = movePartInsertionIndex(
    document,
    command.target.partId,
    command.payload.anchor,
  );
  if (!move.ok) {
    return move;
  }
  const currentIds = partIds(document);
  const desiredIds = movedIds(
    currentIds,
    command.target.partId,
    move.insertionIndex,
  );
  if (desiredIds === undefined) {
    return { ok: false, failure: { code: "command.internal-error" } };
  }
  if (arrayEqual(currentIds, desiredIds)) {
    return { ok: true, changed: false };
  }
  return changed(
    asNonEmpty([
      {
        kind: "move-part",
        documentId: document.id,
        partId: command.target.partId,
        anchor: cloneValue(command.payload.anchor),
      },
    ]),
    [
      { kind: "part", partId: command.target.partId },
      { kind: "document", documentId: document.id },
    ],
  );
}

function prepareSetPartName(
  document: ScoreDocument,
  command: CoreCommandEnvelope,
): PrepareCoreCommandEffectsResult {
  if (
    command.commandId !== "core.part.set-name" ||
    command.target.kind !== "part"
  ) {
    return { ok: false, failure: { code: "command.internal-error" } };
  }
  const resolved = resolveScoreEntityTarget(document, command.target);
  if (!resolved.ok) {
    return resolved;
  }
  if (resolved.value.kind !== "part") {
    return { ok: false, failure: { code: "command.internal-error" } };
  }
  if (resolved.value.part.name === command.payload.name) {
    return { ok: true, changed: false };
  }
  return changed(
    asNonEmpty([
      {
        kind: "replace-part-name",
        partId: command.target.partId,
        value: command.payload.name,
      },
    ]),
    [{ kind: "part", partId: command.target.partId }],
  );
}

function prepareSetPartInstrument(
  document: ScoreDocument,
  command: CoreCommandEnvelope,
): PrepareCoreCommandEffectsResult {
  if (
    command.commandId !== "core.part.set-instrument" ||
    command.target.kind !== "part"
  ) {
    return { ok: false, failure: { code: "command.internal-error" } };
  }
  const resolved = resolveScoreEntityTarget(document, command.target);
  if (!resolved.ok) {
    return resolved;
  }
  if (resolved.value.kind !== "part") {
    return { ok: false, failure: { code: "command.internal-error" } };
  }
  if (instrumentEqual(resolved.value.part.instrument, command.payload.instrument)) {
    return { ok: true, changed: false };
  }
  return changed(
    asNonEmpty([
      {
        kind: "replace-part-instrument",
        partId: command.target.partId,
        value: cloneValue(command.payload.instrument),
      },
    ]),
    [{ kind: "part", partId: command.target.partId }],
  );
}

function prepareInsertStaff(
  document: ScoreDocument,
  command: CoreCommandEnvelope,
): PrepareCoreCommandEffectsResult {
  if (
    command.commandId !== "core.staff.insert" ||
    command.target.kind !== "part"
  ) {
    return { ok: false, failure: { code: "command.internal-error" } };
  }
  const resolved = resolveScoreEntityTarget(document, command.target);
  if (!resolved.ok) {
    return resolved;
  }
  if (resolved.value.kind !== "part") {
    return { ok: false, failure: { code: "command.internal-error" } };
  }
  const anchor = resolveStaffAnchor(
    document,
    resolved.value.part,
    command.payload.anchor,
  );
  if (!anchor.ok) {
    return anchor;
  }
  return changed(
    asNonEmpty([
      {
        kind: "insert-staff",
        partId: command.target.partId,
        anchor: cloneValue(command.payload.anchor),
        staff: cloneValue(command.payload.staff),
      },
    ]),
    [
      { kind: "part", partId: command.target.partId },
      { kind: "staff", staffId: command.payload.staff.id },
    ],
  );
}

function prepareRemoveStaff(
  document: ScoreDocument,
  command: CoreCommandEnvelope,
): PrepareCoreCommandEffectsResult {
  if (
    command.commandId !== "core.staff.remove" ||
    command.target.kind !== "staff"
  ) {
    return { ok: false, failure: { code: "command.internal-error" } };
  }
  const resolved = resolveScoreEntityTarget(document, command.target);
  if (!resolved.ok) {
    return resolved;
  }
  if (resolved.value.kind !== "staff") {
    return { ok: false, failure: { code: "command.internal-error" } };
  }
  if (hasLiveStaffReference(resolved.value.part, command.target.staffId)) {
    return { ok: false, failure: { code: "command.reference-conflict" } };
  }
  return changed(
    asNonEmpty([
      {
        kind: "remove-staff",
        partId: resolved.value.part.id,
        staffId: command.target.staffId,
      },
    ]),
    [
      { kind: "staff", staffId: command.target.staffId },
      { kind: "part", partId: resolved.value.part.id },
    ],
  );
}

function prepareMoveStaff(
  document: ScoreDocument,
  command: CoreCommandEnvelope,
): PrepareCoreCommandEffectsResult {
  if (
    command.commandId !== "core.staff.move" ||
    command.target.kind !== "staff"
  ) {
    return { ok: false, failure: { code: "command.internal-error" } };
  }
  const resolved = resolveScoreEntityTarget(document, command.target);
  if (!resolved.ok) {
    return resolved;
  }
  if (resolved.value.kind !== "staff") {
    return { ok: false, failure: { code: "command.internal-error" } };
  }
  const move = moveStaffInsertionIndex(
    document,
    resolved.value.part,
    command.target.staffId,
    command.payload.anchor,
  );
  if (!move.ok) {
    return move;
  }
  const currentIds = staffIds(resolved.value.part);
  const desiredIds = movedIds(
    currentIds,
    command.target.staffId,
    move.insertionIndex,
  );
  if (desiredIds === undefined) {
    return { ok: false, failure: { code: "command.internal-error" } };
  }
  if (arrayEqual(currentIds, desiredIds)) {
    return { ok: true, changed: false };
  }
  return changed(
    asNonEmpty([
      {
        kind: "move-staff",
        partId: resolved.value.part.id,
        staffId: command.target.staffId,
        anchor: cloneValue(command.payload.anchor),
      },
    ]),
    [
      { kind: "staff", staffId: command.target.staffId },
      { kind: "part", partId: resolved.value.part.id },
    ],
  );
}

function prepareSetStaffDefinition(
  document: ScoreDocument,
  command: CoreCommandEnvelope,
): PrepareCoreCommandEffectsResult {
  if (
    command.commandId !== "core.staff.set-definition" ||
    command.target.kind !== "staff"
  ) {
    return { ok: false, failure: { code: "command.internal-error" } };
  }
  const resolved = resolveScoreEntityTarget(document, command.target);
  if (!resolved.ok) {
    return resolved;
  }
  if (resolved.value.kind !== "staff") {
    return { ok: false, failure: { code: "command.internal-error" } };
  }
  const replacement: StaffDefinition = {
    id: command.target.staffId,
    lineCount: command.payload.lineCount,
    defaultClef: cloneValue(command.payload.defaultClef),
  };
  if (staffEqual(resolved.value.staff, replacement)) {
    return { ok: true, changed: false };
  }
  return changed(
    asNonEmpty([
      {
        kind: "replace-staff-definition",
        partId: resolved.value.part.id,
        staffId: command.target.staffId,
        value: replacement,
      },
    ]),
    [{ kind: "staff", staffId: command.target.staffId }],
  );
}

function prepareInsertVoice(
  document: ScoreDocument,
  command: CoreCommandEnvelope,
): PrepareCoreCommandEffectsResult {
  if (
    command.commandId !== "core.voice.insert" ||
    command.target.kind !== "part"
  ) {
    return { ok: false, failure: { code: "command.internal-error" } };
  }
  const resolvedPart = resolveScoreEntityTarget(document, command.target);
  if (!resolvedPart.ok) {
    return resolvedPart;
  }
  if (resolvedPart.value.kind !== "part") {
    return { ok: false, failure: { code: "command.internal-error" } };
  }
  const resolvedMeasure = resolveScoreEntityTarget(document, {
    kind: "measure",
    measureId: command.payload.measureId,
  });
  if (!resolvedMeasure.ok) {
    return resolvedMeasure;
  }
  if (resolvedMeasure.value.kind !== "measure") {
    return { ok: false, failure: { code: "command.internal-error" } };
  }
  const content = resolvePartContent(
    resolvedPart.value.part,
    command.payload.measureId,
  );
  if (content === undefined) {
    return { ok: false, failure: { code: "command.internal-error" } };
  }
  const anchor = resolveVoiceAnchor(
    document,
    resolvedPart.value.part,
    content,
    command.payload.anchor,
  );
  if (!anchor.ok) {
    return anchor;
  }
  const affected: ScoreAddress[] = [];
  const seen = new Set<string>();
  appendAffected(affected, seen, {
    kind: "part",
    partId: resolvedPart.value.part.id,
  });
  appendVoiceDescendants(affected, seen, command.payload.voice);
  return changed(
    asNonEmpty([
      {
        kind: "insert-voice",
        partId: resolvedPart.value.part.id,
        measureId: command.payload.measureId,
        anchor: cloneValue(command.payload.anchor),
        voice: cloneValue(command.payload.voice),
      },
    ]),
    affected,
  );
}

function prepareRemoveVoice(
  document: ScoreDocument,
  command: CoreCommandEnvelope,
): PrepareCoreCommandEffectsResult {
  if (
    command.commandId !== "core.voice.remove" ||
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
  const affected: ScoreAddress[] = [];
  const seen = new Set<string>();
  appendAffected(affected, seen, {
    kind: "voice",
    voiceId: resolved.value.voice.id,
  });
  appendAffected(affected, seen, {
    kind: "part",
    partId: resolved.value.part.id,
  });
  appendVoiceEventsAndNotes(affected, seen, resolved.value.voice);
  return changed(
    asNonEmpty([
      {
        kind: "remove-voice",
        partId: resolved.value.part.id,
        measureId: resolved.value.measureId,
        voiceId: command.target.voiceId,
      },
    ]),
    affected,
  );
}

function prepareMoveVoice(
  document: ScoreDocument,
  command: CoreCommandEnvelope,
): PrepareCoreCommandEffectsResult {
  if (
    command.commandId !== "core.voice.move" ||
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
  const move = moveVoiceInsertionIndex(
    document,
    resolved.value.part,
    resolved.value.content,
    command.target.voiceId,
    command.payload.anchor,
  );
  if (!move.ok) {
    return move;
  }
  const currentIds = voiceIds(resolved.value.content);
  const desiredIds = movedIds(
    currentIds,
    command.target.voiceId,
    move.insertionIndex,
  );
  if (desiredIds === undefined) {
    return { ok: false, failure: { code: "command.internal-error" } };
  }
  if (arrayEqual(currentIds, desiredIds)) {
    return { ok: true, changed: false };
  }
  return changed(
    asNonEmpty([
      {
        kind: "move-voice",
        partId: resolved.value.part.id,
        measureId: resolved.value.measureId,
        voiceId: command.target.voiceId,
        anchor: cloneValue(command.payload.anchor),
      },
    ]),
    [
      { kind: "voice", voiceId: command.target.voiceId },
      { kind: "part", partId: resolved.value.part.id },
    ],
  );
}

function prepareSetVoiceDefaultStaff(
  document: ScoreDocument,
  command: CoreCommandEnvelope,
): PrepareCoreCommandEffectsResult {
  if (
    command.commandId !== "core.voice.set-default-staff" ||
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
  if (resolved.value.voice.defaultStaffId === command.payload.staffId) {
    return { ok: true, changed: false };
  }
  return changed(
    asNonEmpty([
      {
        kind: "replace-voice-default-staff",
        voiceId: command.target.voiceId,
        value: command.payload.staffId,
      },
    ]),
    [{ kind: "voice", voiceId: command.target.voiceId }],
  );
}

function prepareSetVoiceSequenceStart(
  document: ScoreDocument,
  command: CoreCommandEnvelope,
): PrepareCoreCommandEffectsResult {
  if (
    command.commandId !== "core.voice.set-sequence-start" ||
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
  if (fractionEqual(resolved.value.voice.sequence.start, command.payload.start)) {
    return { ok: true, changed: false };
  }
  return changed(
    asNonEmpty([
      {
        kind: "replace-voice-sequence-start",
        voiceId: command.target.voiceId,
        value: cloneValue(command.payload.start),
      },
    ]),
    [{ kind: "voice", voiceId: command.target.voiceId }],
  );
}

function prepareSetEventStaffAssignment(
  document: ScoreDocument,
  command: CoreCommandEnvelope,
): PrepareCoreCommandEffectsResult {
  if (
    command.commandId !== "core.event.set-staff-assignment" ||
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
  const assignment = command.payload.assignment;
  const currentEffectiveStaffId =
    resolved.value.event.staffId ?? resolved.value.voice.defaultStaffId;
  const requestedEffectiveStaffId = assignment.kind === "inherit-default"
    ? resolved.value.voice.defaultStaffId
    : assignment.staffId;
  if (currentEffectiveStaffId === requestedEffectiveStaffId) {
    return { ok: true, changed: false };
  }
  return changed(
    asNonEmpty([
      {
        kind: "replace-event-staff-assignment",
        eventId: command.target.eventId,
        value: cloneValue(assignment),
      },
    ]),
    [{ kind: "event", eventId: command.target.eventId }],
  );
}

export const HIERARCHY_COMMAND_ADAPTERS: readonly CoreCommandAdapter[] = Object.freeze([
  Object.freeze({
    commandId: "core.part.insert" as const,
    targetKind: "document" as const,
    inputBoundary: "vnext-bounded-v1" as const,
    decodePayload: decodeInsertPartPayload,
    prepare: prepareInsertPart,
  }),
  Object.freeze({
    commandId: "core.part.remove" as const,
    targetKind: "part" as const,
    inputBoundary: "vnext-bounded-v1" as const,
    decodePayload: decodeRemovePartPayload,
    prepare: prepareRemovePart,
  }),
  Object.freeze({
    commandId: "core.part.move" as const,
    targetKind: "part" as const,
    inputBoundary: "vnext-bounded-v1" as const,
    decodePayload: decodeMovePartPayload,
    prepare: prepareMovePart,
  }),
  Object.freeze({
    commandId: "core.part.set-name" as const,
    targetKind: "part" as const,
    inputBoundary: "vnext-bounded-v1" as const,
    decodePayload: decodeSetPartNamePayload,
    prepare: prepareSetPartName,
  }),
  Object.freeze({
    commandId: "core.part.set-instrument" as const,
    targetKind: "part" as const,
    inputBoundary: "vnext-bounded-v1" as const,
    decodePayload: decodeSetPartInstrumentPayload,
    prepare: prepareSetPartInstrument,
  }),
  Object.freeze({
    commandId: "core.staff.insert" as const,
    targetKind: "part" as const,
    inputBoundary: "vnext-bounded-v1" as const,
    decodePayload: decodeInsertStaffPayload,
    prepare: prepareInsertStaff,
  }),
  Object.freeze({
    commandId: "core.staff.remove" as const,
    targetKind: "staff" as const,
    inputBoundary: "vnext-bounded-v1" as const,
    decodePayload: decodeRemoveStaffPayload,
    prepare: prepareRemoveStaff,
  }),
  Object.freeze({
    commandId: "core.staff.move" as const,
    targetKind: "staff" as const,
    inputBoundary: "vnext-bounded-v1" as const,
    decodePayload: decodeMoveStaffPayload,
    prepare: prepareMoveStaff,
  }),
  Object.freeze({
    commandId: "core.staff.set-definition" as const,
    targetKind: "staff" as const,
    inputBoundary: "vnext-bounded-v1" as const,
    decodePayload: decodeSetStaffDefinitionPayload,
    prepare: prepareSetStaffDefinition,
  }),
  Object.freeze({
    commandId: "core.voice.insert" as const,
    targetKind: "part" as const,
    inputBoundary: "vnext-bounded-v1" as const,
    decodePayload: decodeInsertVoicePayload,
    prepare: prepareInsertVoice,
  }),
  Object.freeze({
    commandId: "core.voice.remove" as const,
    targetKind: "voice" as const,
    inputBoundary: "vnext-bounded-v1" as const,
    decodePayload: decodeRemoveVoicePayload,
    prepare: prepareRemoveVoice,
  }),
  Object.freeze({
    commandId: "core.voice.move" as const,
    targetKind: "voice" as const,
    inputBoundary: "vnext-bounded-v1" as const,
    decodePayload: decodeMoveVoicePayload,
    prepare: prepareMoveVoice,
  }),
  Object.freeze({
    commandId: "core.voice.set-default-staff" as const,
    targetKind: "voice" as const,
    inputBoundary: "vnext-bounded-v1" as const,
    decodePayload: decodeSetVoiceDefaultStaffPayload,
    prepare: prepareSetVoiceDefaultStaff,
  }),
  Object.freeze({
    commandId: "core.voice.set-sequence-start" as const,
    targetKind: "voice" as const,
    inputBoundary: "vnext-bounded-v1" as const,
    decodePayload: decodeSetVoiceSequenceStartPayload,
    prepare: prepareSetVoiceSequenceStart,
  }),
  Object.freeze({
    commandId: "core.event.set-staff-assignment" as const,
    targetKind: "event" as const,
    inputBoundary: "vnext-bounded-v1" as const,
    decodePayload: decodeSetEventStaffAssignmentPayload,
    prepare: prepareSetEventStaffAssignment,
  }),
] satisfies readonly CoreCommandAdapter[]);
