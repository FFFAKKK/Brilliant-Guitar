import { decodeScoreRange } from "../read/address-codec";
import type { ScoreAddress } from "../domain/address";
import {
  isTransposition,
  transposeWrittenPitch,
  type PitchAlter,
  type Transposition,
  type WrittenPitch,
} from "../domain/pitch";
import type {
  PartMeasureContent,
  RhythmicEvent,
  ScoreDocument,
  ScoreNote,
  Voice,
} from "../domain/score-document";
import { deepFreezeValue } from "../read/deep-freeze";
import type {
  CoreCommandAdapter,
  PrepareCoreCommandEffectsResult,
} from "./core-command-adapters";
import { readDenseArray, readExactRecord } from "./core-command-adapters";
import type { CoreCommandEnvelope, ScoreEntityTarget } from "./contracts";
import {
  freezeCoreEffectSet,
  type CoreEffect,
  type NonEmptyCoreEffectSet,
} from "./effects";
import {
  resolveRangeSelection,
  type ResolvedRangeSelection,
} from "./range-selection";
import { resolveScoreEntityTarget } from "./target-resolver";

const structuredCloneValue = structuredClone;

function cloneValue<T>(value: T): T {
  return structuredCloneValue(value);
}

function asNonEmpty(
  effects: readonly CoreEffect[],
): NonEmptyCoreEffectSet | undefined {
  const first = effects[0];
  return first === undefined ? undefined : [first, ...effects.slice(1)];
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

function appendEventRemovalAffected(
  affected: ScoreAddress[],
  seen: Set<string>,
  voice: Voice,
  event: RhythmicEvent,
): void {
  appendAffected(affected, seen, { kind: "event", eventId: event.id });
  appendAffected(affected, seen, { kind: "voice", voiceId: voice.id });
  if (event.content.kind === "notes") {
    for (const note of event.content.notes) {
      appendAffected(affected, seen, { kind: "note", noteId: note.id });
    }
  }
}

function appendVoiceDescendants(
  affected: ScoreAddress[],
  seen: Set<string>,
  voice: Voice,
): void {
  appendAffected(affected, seen, { kind: "voice", voiceId: voice.id });
  for (const event of voice.sequence.events) {
    appendAffected(affected, seen, { kind: "event", eventId: event.id });
    if (event.content.kind === "notes") {
      for (const note of event.content.notes) {
        appendAffected(affected, seen, { kind: "note", noteId: note.id });
      }
    }
  }
}

function decodeDeleteRangePayload(
  value: unknown,
  target: ScoreEntityTarget,
): CoreCommandEnvelope | undefined {
  const payload = readExactRecord(value, ["range"]);
  const range = decodeScoreRange(payload?.range);
  return payload !== undefined && range.ok && target.kind === "document"
    ? {
        commandVersion: 1,
        commandId: "core.range.delete",
        target,
        payload: { range: range.value },
      }
    : undefined;
}

function decodeTransposeRangePayload(
  value: unknown,
  target: ScoreEntityTarget,
): CoreCommandEnvelope | undefined {
  const payload = readExactRecord(value, ["range", "transposition"]);
  const range = decodeScoreRange(payload?.range);
  return payload !== undefined &&
    range.ok &&
    isTransposition(payload.transposition) &&
    target.kind === "document"
    ? {
        commandVersion: 1,
        commandId: "core.range.transpose-written-pitch",
        target,
        payload: {
          range: range.value,
          transposition: cloneValue(payload.transposition),
        },
      }
    : undefined;
}

function decodeBatchPayload(
  value: unknown,
  target: ScoreEntityTarget,
): CoreCommandEnvelope | undefined {
  const payload = readExactRecord(value, ["commands"]);
  const commands = readDenseArray(payload?.commands);
  const first = commands?.[0];
  return payload !== undefined &&
    commands !== undefined &&
    first !== undefined &&
    commands.length <= 100 &&
    target.kind === "document"
    ? {
        commandVersion: 1,
        commandId: "core.transaction.batch",
        target,
        payload: { commands: [first, ...commands.slice(1)] },
      }
    : undefined;
}

function prepareDocumentTarget(
  document: ScoreDocument,
  target: ScoreEntityTarget,
): PrepareCoreCommandEffectsResult | undefined {
  if (target.kind !== "document") {
    return { ok: false, failure: { code: "command.internal-error" } };
  }
  const resolved = resolveScoreEntityTarget(document, target);
  if (!resolved.ok) {
    return resolved;
  }
  return resolved.value.kind === "document"
    ? undefined
    : { ok: false, failure: { code: "command.internal-error" } };
}

function appendContentDeleteEffects(
  effects: CoreEffect[],
  affected: ScoreAddress[],
  seen: Set<string>,
  content: PartMeasureContent,
): void {
  for (const voice of content.voices) {
    for (const event of voice.sequence.events) {
      effects.push({
        kind: "remove-event",
        voiceId: voice.id,
        eventId: event.id,
      });
      appendEventRemovalAffected(affected, seen, voice, event);
    }
  }
}

function prepareDeleteRange(
  document: ScoreDocument,
  command: CoreCommandEnvelope,
): PrepareCoreCommandEffectsResult {
  if (command.commandId !== "core.range.delete") {
    return { ok: false, failure: { code: "command.internal-error" } };
  }
  const targetFailure = prepareDocumentTarget(document, command.target);
  if (targetFailure !== undefined) {
    return targetFailure;
  }
  const selected = resolveRangeSelection(document, command.payload.range);
  if (!selected.ok) {
    return selected;
  }

  const effects: CoreEffect[] = [];
  const affected: ScoreAddress[] = [];
  const seen = new Set<string>();
  switch (selected.value.kind) {
    case "measure-range":
      for (const measure of selected.value.measures) {
        effects.push({
          kind: "remove-measure-bundle",
          documentId: document.id,
          measureId: measure.measureId,
        });
        appendAffected(affected, seen, {
          kind: "measure",
          measureId: measure.measureId,
        });
        for (const entry of measure.contents) {
          appendAffected(affected, seen, { kind: "part", partId: entry.partId });
          for (const voice of entry.content.voices) {
            appendVoiceDescendants(affected, seen, voice);
          }
        }
      }
      break;
    case "part-measure-range":
      for (const content of selected.value.contents) {
        appendContentDeleteEffects(effects, affected, seen, content);
      }
      break;
    case "voice-event-range": {
      const voice: Voice = {
        id: selected.value.voiceId,
        defaultStaffId: "",
        sequence: { start: { numerator: 0, denominator: 1 }, events: [] },
      };
      for (const event of selected.value.events) {
        effects.push({
          kind: "remove-event",
          voiceId: selected.value.voiceId,
          eventId: event.id,
        });
        appendEventRemovalAffected(affected, seen, voice, event);
      }
      break;
    }
  }
  const nonEmpty = asNonEmpty(effects);
  return nonEmpty === undefined
    ? { ok: true, changed: false }
    : changed(nonEmpty, affected);
}

function forEachSelectedNote(
  selection: ResolvedRangeSelection,
  visit: (note: ScoreNote) => boolean,
): boolean {
  const visitEvent = (event: RhythmicEvent): boolean => {
    if (event.content.kind === "rest") {
      return true;
    }
    for (const note of event.content.notes) {
      if (!visit(note)) {
        return false;
      }
    }
    return true;
  };
  const visitContent = (content: PartMeasureContent): boolean => {
    for (const voice of content.voices) {
      for (const event of voice.sequence.events) {
        if (!visitEvent(event)) {
          return false;
        }
      }
    }
    return true;
  };

  switch (selection.kind) {
    case "measure-range":
      for (const measure of selection.measures) {
        for (const entry of measure.contents) {
          if (!visitContent(entry.content)) {
            return false;
          }
        }
      }
      return true;
    case "part-measure-range":
      for (const content of selection.contents) {
        if (!visitContent(content)) {
          return false;
        }
      }
      return true;
    case "voice-event-range":
      for (const event of selection.events) {
        if (!visitEvent(event)) {
          return false;
        }
      }
      return true;
  }
}

function samePitch(left: WrittenPitch, right: WrittenPitch): boolean {
  return (
    left.step === right.step &&
    left.alter === right.alter &&
    left.octave === right.octave
  );
}

function acceptedWrittenPitch(
  value: { readonly step: WrittenPitch["step"]; readonly alter: number; readonly octave: number },
): WrittenPitch {
  return { step: value.step, alter: value.alter as PitchAlter, octave: value.octave };
}

function isZeroTransposition(transposition: Transposition): boolean {
  return (
    transposition.diatonicSteps === 0 && transposition.chromaticSemitones === 0
  );
}

function prepareTransposeRange(
  document: ScoreDocument,
  command: CoreCommandEnvelope,
): PrepareCoreCommandEffectsResult {
  if (command.commandId !== "core.range.transpose-written-pitch") {
    return { ok: false, failure: { code: "command.internal-error" } };
  }
  const targetFailure = prepareDocumentTarget(document, command.target);
  if (targetFailure !== undefined) {
    return targetFailure;
  }
  const selected = resolveRangeSelection(document, command.payload.range);
  if (!selected.ok) {
    return selected;
  }
  if (isZeroTransposition(command.payload.transposition)) {
    return { ok: true, changed: false };
  }

  const effects: CoreEffect[] = [];
  const affected: ScoreAddress[] = [];
  let transformFailure:
    | Extract<
        PrepareCoreCommandEffectsResult,
        { readonly ok: false }
      >
    | undefined;
  forEachSelectedNote(selected.value, (note) => {
    const transformed = transposeWrittenPitch(
      note.writtenPitch,
      command.payload.transposition,
    );
    if (!transformed.ok) {
      transformFailure = {
        ok: false,
        failure: {
          code: "command.range-transform-invalid",
          address: { kind: "note", noteId: note.id },
          reason: transformed.code,
        },
      };
      return false;
    }
    const writtenPitch = acceptedWrittenPitch(transformed.value);
    if (!samePitch(note.writtenPitch, writtenPitch)) {
      effects.push({
        kind: "replace-written-pitch",
        noteId: note.id,
        value: writtenPitch,
      });
      affected.push({ kind: "note", noteId: note.id });
    }
    return true;
  });
  if (transformFailure !== undefined) {
    return transformFailure;
  }
  const nonEmpty = asNonEmpty(effects);
  return nonEmpty === undefined
    ? { ok: true, changed: false }
    : changed(nonEmpty, affected);
}

function prepareBatch(): PrepareCoreCommandEffectsResult {
  return { ok: false, failure: { code: "command.internal-error" } };
}

export const RANGE_COMMAND_ADAPTERS: readonly CoreCommandAdapter[] = Object.freeze([
  Object.freeze({
    commandId: "core.range.delete" as const,
    targetKind: "document" as const,
    inputBoundary: "vnext-bounded-v1" as const,
    decodePayload: decodeDeleteRangePayload,
    prepare: prepareDeleteRange,
  }),
  Object.freeze({
    commandId: "core.range.transpose-written-pitch" as const,
    targetKind: "document" as const,
    inputBoundary: "vnext-bounded-v1" as const,
    decodePayload: decodeTransposeRangePayload,
    prepare: prepareTransposeRange,
  }),
  Object.freeze({
    commandId: "core.transaction.batch" as const,
    targetKind: "document" as const,
    inputBoundary: "vnext-bounded-v1" as const,
    decodePayload: decodeBatchPayload,
    prepare: prepareBatch,
  }),
] satisfies readonly CoreCommandAdapter[]);
