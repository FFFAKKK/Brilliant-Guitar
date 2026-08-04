import {
  ScoreComponentDecodeContext,
  decodeArray,
  decodeFraction,
  decodeMeasureDefinition,
  decodeMeter,
  decodeVoice,
} from "../codec/score-component-codec";
import type { ScoreAddress } from "../domain/address";
import type { Fraction } from "../domain/fraction";
import type {
  MeasureDefinition,
  Part,
  PartMeasureContent,
  ScoreDocument,
  Voice,
} from "../domain/score-document";
import { deepFreezeValue } from "../read/deep-freeze";
import {
  createDiagnostic,
  type DiagnosticPath,
  type SemanticDiagnostic,
} from "../validation/diagnostics";
import type {
  CommandFailure,
  CoreCommandEnvelope,
  InsertMeasureCommand,
  InsertMeasurePartContentV1,
  MeasureAnchor,
  MoveMeasureCommand,
  RemoveMeasureCommand,
  ScoreEntityTarget,
  SetMeasureDefinitionCommand,
} from "./contracts";
import type {
  CoreCommandAdapter,
  PrepareCoreCommandEffectsResult,
} from "./core-command-adapters";
import {
  freezeCoreEffectSet,
  type AnchoredPartMeasureContent,
  type CoreEffect,
  type NonEmptyCoreEffectSet,
  type PartMeasureAnchor,
} from "./effects";
import {
  moveInsertionIndex,
  resolveMeasureAnchorInIds,
  resolveScoreEntityTarget,
} from "./target-resolver";

interface DecodedPickupNone {
  readonly kind: "none";
}

interface DecodedPickupDuration {
  readonly kind: "duration";
  readonly duration: Fraction;
}

type DecodedPickup = DecodedPickupNone | DecodedPickupDuration;

interface PartContentMatch {
  readonly content: PartMeasureContent;
  readonly index: number;
}

function cloneValue<T>(value: T): T {
  return structuredClone(value);
}

function decodeNonEmptyArray<T>(
  value: unknown,
  path: DiagnosticPath,
  context: ScoreComponentDecodeContext,
  decodeItem: (
    item: unknown,
    itemPath: DiagnosticPath,
    itemContext: ScoreComponentDecodeContext,
  ) => T | undefined,
): readonly [T, ...T[]] | undefined {
  const decoded = decodeArray(value, path, context, decodeItem);
  if (decoded === undefined) {
    return undefined;
  }
  if (decoded.length === 0) {
    context.add("decode.type", path, { expected: "non-empty-array" });
    return undefined;
  }
  return decoded as readonly [T, ...T[]];
}

function decodeMeasureAnchor(
  value: unknown,
  path: DiagnosticPath,
  context: ScoreComponentDecodeContext,
): MeasureAnchor | undefined {
  const candidate = context.object(value, path, ["kind"], ["measureId"]);
  if (candidate === undefined) {
    return undefined;
  }
  if (candidate.kind === "start") {
    return context.object(value, path, ["kind"]) === undefined
      ? undefined
      : { kind: "start" };
  }
  if (candidate.kind === "after-measure") {
    const record = context.object(value, path, ["kind", "measureId"]);
    const measureId = record === undefined
      ? undefined
      : context.string(record.measureId, [...path, "measureId"]);
    return measureId === undefined
      ? undefined
      : { kind: "after-measure", measureId };
  }
  context.add("decode.union", [...path, "kind"]);
  return undefined;
}

function decodeInsertMeasurePartContent(
  value: unknown,
  path: DiagnosticPath,
  context: ScoreComponentDecodeContext,
): InsertMeasurePartContentV1 | undefined {
  const input = context.object(value, path, ["partId", "voices"]);
  if (input === undefined) {
    return undefined;
  }
  const partId = context.string(input.partId, [...path, "partId"]);
  const voices = decodeNonEmptyArray(
    input.voices,
    [...path, "voices"],
    context,
    decodeVoice,
  );
  return partId === undefined || voices === undefined
    ? undefined
    : { partId, voices };
}

function decodePickup(
  value: unknown,
  path: DiagnosticPath,
  context: ScoreComponentDecodeContext,
): DecodedPickup | undefined {
  const candidate = context.object(value, path, ["kind"], ["duration"]);
  if (candidate === undefined) {
    return undefined;
  }
  if (candidate.kind === "none") {
    return context.object(value, path, ["kind"]) === undefined
      ? undefined
      : { kind: "none" };
  }
  if (candidate.kind === "duration") {
    const record = context.object(value, path, ["kind", "duration"]);
    const duration = record === undefined
      ? undefined
      : decodeFraction(record.duration, [...path, "duration"], context);
    return duration === undefined ? undefined : { kind: "duration", duration };
  }
  context.add("decode.union", [...path, "kind"]);
  return undefined;
}

function decodedOrUndefined<T>(
  context: ScoreComponentDecodeContext,
  value: T | undefined,
): T | undefined {
  return value !== undefined && context.diagnostics.length === 0
    ? value
    : undefined;
}

function decodeInsertMeasurePayload(
  value: unknown,
  target: ScoreEntityTarget,
): CoreCommandEnvelope | undefined {
  if (target.kind !== "document") {
    return undefined;
  }
  const context = new ScoreComponentDecodeContext(true);
  const input = context.object(value, [], ["anchor", "definition", "contents"]);
  const anchor = input === undefined
    ? undefined
    : decodeMeasureAnchor(input.anchor, ["anchor"], context);
  const definition = input === undefined
    ? undefined
    : decodeMeasureDefinition(input.definition, ["definition"], context);
  const contents = input === undefined
    ? undefined
    : decodeNonEmptyArray(
        input.contents,
        ["contents"],
        context,
        decodeInsertMeasurePartContent,
      );
  const payload = decodedOrUndefined(
    context,
    anchor === undefined || definition === undefined || contents === undefined
      ? undefined
      : { anchor, definition, contents },
  );
  return payload === undefined
    ? undefined
    : {
        commandVersion: 1,
        commandId: "core.measure.insert",
        target,
        payload,
      };
}

function decodeRemoveMeasurePayload(
  value: unknown,
  target: ScoreEntityTarget,
): CoreCommandEnvelope | undefined {
  if (target.kind !== "measure") {
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
        commandId: "core.measure.remove",
        target,
        payload,
      };
}

function decodeMoveMeasurePayload(
  value: unknown,
  target: ScoreEntityTarget,
): CoreCommandEnvelope | undefined {
  if (target.kind !== "measure") {
    return undefined;
  }
  const context = new ScoreComponentDecodeContext(true);
  const input = context.object(value, [], ["anchor"]);
  const anchor = input === undefined
    ? undefined
    : decodeMeasureAnchor(input.anchor, ["anchor"], context);
  const payload = decodedOrUndefined(
    context,
    anchor === undefined ? undefined : { anchor },
  );
  return payload === undefined
    ? undefined
    : {
        commandVersion: 1,
        commandId: "core.measure.move",
        target,
        payload,
      };
}

function decodeSetMeasureDefinitionPayload(
  value: unknown,
  target: ScoreEntityTarget,
): CoreCommandEnvelope | undefined {
  if (target.kind !== "measure") {
    return undefined;
  }
  const context = new ScoreComponentDecodeContext(true);
  const input = context.object(value, [], ["meter", "pickup"]);
  const meter = input === undefined
    ? undefined
    : decodeMeter(input.meter, ["meter"], context);
  const pickup = input === undefined
    ? undefined
    : decodePickup(input.pickup, ["pickup"], context);
  const payload = decodedOrUndefined(
    context,
    meter === undefined || pickup === undefined ? undefined : { meter, pickup },
  );
  return payload === undefined
    ? undefined
    : {
        commandVersion: 1,
        commandId: "core.measure.set-definition",
        target,
        payload,
      };
}

function arrayEqual(left: readonly string[], right: readonly string[]): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function measureIds(document: ScoreDocument): readonly string[] {
  return document.measureDefinitions.map((measure) => measure.id);
}

function partMeasureIds(part: Part): readonly string[] {
  return part.measureContents.map((content) => content.measureId);
}

function partMeasureContent(
  part: Part,
  measureId: string,
): PartContentMatch | undefined {
  let match: PartContentMatch | undefined;
  for (let index = 0; index < part.measureContents.length; index += 1) {
    const content = part.measureContents[index];
    if (content === undefined || content.measureId !== measureId) {
      continue;
    }
    if (match !== undefined) {
      return undefined;
    }
    match = { content, index };
  }
  return match;
}

function insertId(
  ids: readonly string[],
  index: number,
  id: string,
): readonly string[] {
  const output = [...ids];
  output.splice(index, 0, id);
  return output;
}

function movedIds(
  ids: readonly string[],
  targetId: string,
  anchor: MeasureAnchor,
): readonly string[] | undefined {
  const move = moveInsertionIndex(ids, targetId, anchor);
  if (!move.ok) {
    return undefined;
  }
  const currentIndex = ids.indexOf(targetId);
  if (currentIndex < 0) {
    return undefined;
  }
  const output = [...ids];
  const removed = output.splice(currentIndex, 1);
  const target = removed[0];
  if (target === undefined) {
    return undefined;
  }
  output.splice(move.insertionIndex, 0, target);
  return output;
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

function appendVoicesAffected(
  affected: ScoreAddress[],
  seen: Set<string>,
  voices: readonly Voice[],
): void {
  for (const voice of voices) {
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
    throw new TypeError("Measure command effects must be nonempty");
  }
  return [first, ...effects.slice(1)];
}

function prepareInsertAffected(
  document: ScoreDocument,
  command: InsertMeasureCommand,
  contents: readonly AnchoredPartMeasureContent[],
): readonly ScoreAddress[] {
  const affected: ScoreAddress[] = [];
  const seen = new Set<string>();
  appendAffected(affected, seen, {
    kind: "document",
    documentId: command.target.documentId,
  });
  appendAffected(affected, seen, {
    kind: "measure",
    measureId: command.payload.definition.id,
  });
  const byPartId = new Map<string, AnchoredPartMeasureContent>();
  for (const content of contents) {
    byPartId.set(content.partId, content);
  }
  for (const part of document.parts) {
    const content = byPartId.get(part.id);
    if (content === undefined) {
      continue;
    }
    appendAffected(affected, seen, { kind: "part", partId: part.id });
    appendVoicesAffected(affected, seen, content.content.voices);
  }
  return affected;
}

function prepareRemoveAffected(
  document: ScoreDocument,
  measureId: string,
): readonly ScoreAddress[] | undefined {
  const affected: ScoreAddress[] = [];
  const seen = new Set<string>();
  appendAffected(affected, seen, { kind: "measure", measureId });
  for (const part of document.parts) {
    const content = partMeasureContent(part, measureId);
    if (content === undefined) {
      return undefined;
    }
    appendAffected(affected, seen, { kind: "part", partId: part.id });
    appendVoicesAffected(affected, seen, content.content.voices);
  }
  return affected;
}

function duplicateDefinitionFailure(
  document: ScoreDocument,
  definition: MeasureDefinition,
  insertionIndex: number,
): CommandFailure | undefined {
  if (!document.measureDefinitions.some((measure) => measure.id === definition.id)) {
    return undefined;
  }
  const diagnostic: SemanticDiagnostic = createDiagnostic(
    "semantic.id-duplicate",
    ["measureDefinitions", insertionIndex, "id"],
    { id: definition.id },
  );
  return {
    code: "command.semantic-invalid",
    diagnostics: [diagnostic],
  };
}

function prepareInsertMeasure(
  document: ScoreDocument,
  command: CoreCommandEnvelope,
): PrepareCoreCommandEffectsResult {
  if (
    command.commandId !== "core.measure.insert" ||
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
  const globalAnchor = resolveMeasureAnchorInIds(
    measureIds(document),
    command.payload.anchor,
  );
  if (!globalAnchor.ok) {
    return globalAnchor;
  }

  const coverage = new Map<string, number>();
  for (const entry of command.payload.contents) {
    const part = resolveScoreEntityTarget(document, {
      kind: "part",
      partId: entry.partId,
    });
    if (!part.ok) {
      return part;
    }
    if (part.value.kind !== "part") {
      return { ok: false, failure: { code: "command.internal-error" } };
    }
    coverage.set(entry.partId, (coverage.get(entry.partId) ?? 0) + 1);
  }

  const duplicate = duplicateDefinitionFailure(
    document,
    command.payload.definition,
    globalAnchor.insertionIndex,
  );
  if (duplicate !== undefined) {
    return { ok: false, failure: duplicate };
  }

  const exactCoverage =
    command.payload.contents.length === document.parts.length &&
    document.parts.every((part) => coverage.get(part.id) === 1);
  const entriesByPartId = new Map<string, InsertMeasurePartContentV1>();
  for (const entry of command.payload.contents) {
    entriesByPartId.set(entry.partId, entry);
  }
  const orderedEntries: readonly InsertMeasurePartContentV1[] = exactCoverage
    ? document.parts.map((part) => entriesByPartId.get(part.id)!)
    : command.payload.contents;
  const contents: AnchoredPartMeasureContent[] = orderedEntries.map((entry) => ({
    partId: entry.partId,
    anchor: cloneValue(command.payload.anchor),
    content: {
      measureId: command.payload.definition.id,
      voices: cloneValue(entry.voices),
    },
  }));
  const effects: CoreEffect[] = [
    {
      kind: "insert-measure-bundle",
      documentId: command.target.documentId,
      definitionAnchor: cloneValue(command.payload.anchor),
      definition: cloneValue(command.payload.definition),
      contents,
    },
  ];

  if (exactCoverage) {
    const desiredGlobalIds = insertId(
      measureIds(document),
      globalAnchor.insertionIndex,
      command.payload.definition.id,
    );
    const needsReorder = document.parts.some((part) => {
      const anchor = resolveMeasureAnchorInIds(
        partMeasureIds(part),
        command.payload.anchor,
      );
      return (
        !anchor.ok ||
        !arrayEqual(
          insertId(partMeasureIds(part), anchor.insertionIndex, command.payload.definition.id),
          desiredGlobalIds,
        )
      );
    });
    if (needsReorder) {
      effects.push({
        kind: "reorder-part-measure-contents",
        documentId: command.target.documentId,
        orders: document.parts.map((part) => ({
          partId: part.id,
          measureIds: [...desiredGlobalIds],
        })),
      });
    }
  }

  return changed(
    asNonEmpty(effects),
    prepareInsertAffected(document, command, contents),
  );
}

function prepareRemoveMeasure(
  document: ScoreDocument,
  command: CoreCommandEnvelope,
): PrepareCoreCommandEffectsResult {
  if (
    command.commandId !== "core.measure.remove" ||
    command.target.kind !== "measure"
  ) {
    return { ok: false, failure: { code: "command.internal-error" } };
  }
  const resolved = resolveScoreEntityTarget(document, command.target);
  if (!resolved.ok) {
    return resolved;
  }
  if (resolved.value.kind !== "measure") {
    return { ok: false, failure: { code: "command.internal-error" } };
  }
  const affected = prepareRemoveAffected(document, command.target.measureId);
  if (affected === undefined) {
    return { ok: false, failure: { code: "command.internal-error" } };
  }
  const currentIds = measureIds(document);
  const targetIndex = currentIds.indexOf(command.target.measureId);
  if (targetIndex < 0) {
    return { ok: false, failure: { code: "command.internal-error" } };
  }
  const desiredGlobalIds = currentIds.filter(
    (measureId) => measureId !== command.target.measureId,
  );
  const effects: CoreEffect[] = [
    {
      kind: "remove-measure-bundle",
      documentId: document.id,
      measureId: command.target.measureId,
    },
  ];
  if (
    document.parts.some((part) =>
      !arrayEqual(
        partMeasureIds(part).filter(
          (measureId) => measureId !== command.target.measureId,
        ),
        desiredGlobalIds,
      )
    )
  ) {
    effects.push({
      kind: "reorder-part-measure-contents",
      documentId: document.id,
      orders: document.parts.map((part) => ({
        partId: part.id,
        measureIds: [...desiredGlobalIds],
      })),
    });
  }
  return changed(asNonEmpty(effects), affected);
}

function prepareMoveMeasure(
  document: ScoreDocument,
  command: CoreCommandEnvelope,
): PrepareCoreCommandEffectsResult {
  if (
    command.commandId !== "core.measure.move" ||
    command.target.kind !== "measure"
  ) {
    return { ok: false, failure: { code: "command.internal-error" } };
  }
  const resolved = resolveScoreEntityTarget(document, command.target);
  if (!resolved.ok) {
    return resolved;
  }
  if (resolved.value.kind !== "measure") {
    return { ok: false, failure: { code: "command.internal-error" } };
  }
  if (
    command.payload.anchor.kind === "after-measure" &&
    command.payload.anchor.measureId === command.target.measureId
  ) {
    return {
      ok: false,
      failure: { code: "command.anchor-self-reference" },
    };
  }
  const currentGlobalIds = measureIds(document);
  const anchor = resolveMeasureAnchorInIds(
    currentGlobalIds,
    command.payload.anchor,
  );
  if (!anchor.ok) {
    return anchor;
  }
  const desiredGlobalIds = movedIds(
    currentGlobalIds,
    command.target.measureId,
    command.payload.anchor,
  );
  if (desiredGlobalIds === undefined) {
    return { ok: false, failure: { code: "command.internal-error" } };
  }
  if (
    arrayEqual(currentGlobalIds, desiredGlobalIds) &&
    document.parts.every((part) => arrayEqual(partMeasureIds(part), desiredGlobalIds))
  ) {
    return { ok: true, changed: false };
  }
  for (const part of document.parts) {
    if (partMeasureContent(part, command.target.measureId) === undefined) {
      return { ok: false, failure: { code: "command.internal-error" } };
    }
  }
  const effects: CoreEffect[] = [
    {
      kind: "move-measure-bundle",
      documentId: document.id,
      measureId: command.target.measureId,
      definitionAnchor: cloneValue(command.payload.anchor),
      contentAnchors: document.parts.map((part) => ({
        partId: part.id,
        anchor: cloneValue(command.payload.anchor),
      })),
    },
  ];
  const needsReorder = document.parts.some((part) => {
    const predicted = movedIds(
      partMeasureIds(part),
      command.target.measureId,
      command.payload.anchor,
    );
    return predicted === undefined || !arrayEqual(predicted, desiredGlobalIds);
  });
  if (needsReorder) {
    effects.push({
      kind: "reorder-part-measure-contents",
      documentId: document.id,
      orders: document.parts.map((part) => ({
        partId: part.id,
        measureIds: [...desiredGlobalIds],
      })),
    });
  }
  const affected: ScoreAddress[] = [
    { kind: "measure", measureId: command.target.measureId },
    ...document.parts.map((part) => ({ kind: "part" as const, partId: part.id })),
  ];
  return changed(asNonEmpty(effects), affected);
}

function fractionEqual(
  left: Fraction | undefined,
  right: Fraction | undefined,
): boolean {
  return (
    left?.numerator === right?.numerator &&
    left?.denominator === right?.denominator
  );
}

function definitionEqual(
  left: MeasureDefinition,
  right: MeasureDefinition,
): boolean {
  return (
    left.id === right.id &&
    left.meter.numerator === right.meter.numerator &&
    left.meter.denominator === right.meter.denominator &&
    fractionEqual(left.pickupDuration, right.pickupDuration)
  );
}

function prepareSetMeasureDefinition(
  document: ScoreDocument,
  command: CoreCommandEnvelope,
): PrepareCoreCommandEffectsResult {
  if (
    command.commandId !== "core.measure.set-definition" ||
    command.target.kind !== "measure"
  ) {
    return { ok: false, failure: { code: "command.internal-error" } };
  }
  const resolved = resolveScoreEntityTarget(document, command.target);
  if (!resolved.ok) {
    return resolved;
  }
  if (resolved.value.kind !== "measure") {
    return { ok: false, failure: { code: "command.internal-error" } };
  }
  const replacement: MeasureDefinition =
    command.payload.pickup.kind === "none"
      ? { id: command.target.measureId, meter: cloneValue(command.payload.meter) }
      : {
          id: command.target.measureId,
          meter: cloneValue(command.payload.meter),
          pickupDuration: cloneValue(command.payload.pickup.duration),
        };
  if (definitionEqual(resolved.value.measure, replacement)) {
    return { ok: true, changed: false };
  }
  return changed(
    [
      {
        kind: "replace-measure-definition",
        documentId: document.id,
        measureId: command.target.measureId,
        value: replacement,
      },
    ],
    [{ kind: "measure", measureId: command.target.measureId }],
  );
}

export const MEASURE_COMMAND_ADAPTERS: readonly CoreCommandAdapter[] = Object.freeze([
  Object.freeze({
    commandId: "core.measure.insert" as const,
    targetKind: "document" as const,
    inputBoundary: "vnext-bounded-v1" as const,
    decodePayload: decodeInsertMeasurePayload,
    prepare: prepareInsertMeasure,
  }),
  Object.freeze({
    commandId: "core.measure.remove" as const,
    targetKind: "measure" as const,
    inputBoundary: "vnext-bounded-v1" as const,
    decodePayload: decodeRemoveMeasurePayload,
    prepare: prepareRemoveMeasure,
  }),
  Object.freeze({
    commandId: "core.measure.move" as const,
    targetKind: "measure" as const,
    inputBoundary: "vnext-bounded-v1" as const,
    decodePayload: decodeMoveMeasurePayload,
    prepare: prepareMoveMeasure,
  }),
  Object.freeze({
    commandId: "core.measure.set-definition" as const,
    targetKind: "measure" as const,
    inputBoundary: "vnext-bounded-v1" as const,
    decodePayload: decodeSetMeasureDefinitionPayload,
    prepare: prepareSetMeasureDefinition,
  }),
] satisfies readonly CoreCommandAdapter[]);
