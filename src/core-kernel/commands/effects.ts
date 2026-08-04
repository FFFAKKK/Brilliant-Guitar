import type { NoteValue } from "../domain/musical-time";
import type {
  MeasureDefinition,
  Part,
  PartMeasureContent,
  RhythmicEvent,
  ScoreDocument,
  ScoreMetadata,
} from "../domain/score-document";
import type { WrittenPitch } from "../domain/pitch";
import { deepFreezeValue } from "../read/deep-freeze";
import type {
  CommandFailure,
  MeasureAnchor,
  SequenceAnchor,
} from "./contracts";
import {
  moveInsertionIndex,
  previousMeasureAnchor,
  resolveMeasureAnchorInIds,
  resolveScoreEntityTarget,
  resolveSequenceAnchor,
} from "./target-resolver";

export interface PartMeasureAnchor {
  readonly partId: string;
  readonly anchor: MeasureAnchor;
}

export interface AnchoredPartMeasureContent extends PartMeasureAnchor {
  readonly content: PartMeasureContent;
}

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
    }
  | {
      readonly kind: "insert-measure-bundle";
      readonly documentId: string;
      readonly definitionAnchor: MeasureAnchor;
      readonly definition: MeasureDefinition;
      readonly contents: readonly AnchoredPartMeasureContent[];
    }
  | {
      readonly kind: "remove-measure-bundle";
      readonly documentId: string;
      readonly measureId: string;
    }
  | {
      readonly kind: "move-measure-bundle";
      readonly documentId: string;
      readonly measureId: string;
      readonly definitionAnchor: MeasureAnchor;
      readonly contentAnchors: readonly PartMeasureAnchor[];
    }
  | {
      readonly kind: "reorder-part-measure-contents";
      readonly documentId: string;
      readonly orders: readonly {
        readonly partId: string;
        readonly measureIds: readonly string[];
      }[];
    }
  | {
      readonly kind: "replace-measure-definition";
      readonly documentId: string;
      readonly measureId: string;
      readonly value: MeasureDefinition;
    };

export type NonEmptyCoreEffectSet = readonly [CoreEffect, ...CoreEffect[]];

export type ApplyCoreEffectSetResult =
  | {
      readonly ok: true;
      readonly document: ScoreDocument;
      readonly inverse: NonEmptyCoreEffectSet;
    }
  | { readonly ok: false; readonly failure: CommandFailure };

interface InsertMeasurePlan {
  readonly definitionIndex: number;
  readonly contents: readonly {
    readonly partIndex: number;
    readonly contentIndex: number;
  }[];
}

interface RemoveMeasurePlan {
  readonly definitionIndex: number;
  readonly contents: readonly {
    readonly partIndex: number;
    readonly contentIndex: number;
  }[];
}

interface MoveMeasurePlan {
  readonly definitionIndex: number;
  readonly definitionInsertionIndex: number;
  readonly contents: readonly {
    readonly partIndex: number;
    readonly contentIndex: number;
    readonly insertionIndex: number;
  }[];
}

interface ReorderMeasurePlan {
  readonly parts: readonly {
    readonly partIndex: number;
    readonly currentMeasureIds: readonly string[];
  }[];
}

function cloneValue<T>(value: T): T {
  return structuredClone(value);
}

function failure(
  code: CommandFailure["code"],
): Extract<ApplyCoreEffectSetResult, { readonly ok: false }> {
  return { ok: false, failure: { code } as CommandFailure };
}

function internalFailure(): CommandFailure {
  return { code: "command.internal-error" };
}

function freezeEffect(effect: CoreEffect): CoreEffect {
  return deepFreezeValue(cloneValue(effect));
}

function asNonEmptyEffectSet(
  effects: readonly CoreEffect[],
): NonEmptyCoreEffectSet | undefined {
  const first = effects[0];
  return first === undefined ? undefined : [first, ...effects.slice(1)];
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

function uniqueIndex<T>(
  values: readonly T[],
  matches: (value: T) => boolean,
): number | undefined {
  let found = -1;
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === undefined || !matches(value)) {
      continue;
    }
    if (found >= 0) {
      return undefined;
    }
    found = index;
  }
  return found < 0 ? undefined : found;
}

function measureIds(document: ScoreDocument): readonly string[] {
  return document.measureDefinitions.map((measure) => measure.id);
}

function contentIds(part: Part): readonly string[] {
  return part.measureContents.map((content) => content.measureId);
}

function measureIndex(
  document: ScoreDocument,
  measureId: string,
): number | undefined {
  return uniqueIndex(document.measureDefinitions, (measure) => measure.id === measureId);
}

function partIndex(document: ScoreDocument, partId: string): number | undefined {
  return uniqueIndex(document.parts, (part) => part.id === partId);
}

function partContentIndex(part: Part, measureId: string): number | undefined {
  return uniqueIndex(
    part.measureContents,
    (content) => content.measureId === measureId,
  );
}

function matchesDocument(document: ScoreDocument, documentId: string): boolean {
  return document.id === documentId;
}

function preflightInsertMeasure(
  document: ScoreDocument,
  effect: Extract<CoreEffect, { readonly kind: "insert-measure-bundle" }>,
): InsertMeasurePlan | undefined {
  if (!matchesDocument(document, effect.documentId)) {
    return undefined;
  }
  const definitionAnchor = resolveMeasureAnchorInIds(
    measureIds(document),
    effect.definitionAnchor,
  );
  if (!definitionAnchor.ok) {
    return undefined;
  }

  const contents: InsertMeasurePlan["contents"][number][] = [];
  for (const entry of effect.contents) {
    if (entry.content.measureId !== effect.definition.id) {
      return undefined;
    }
    const currentPartIndex = partIndex(document, entry.partId);
    if (currentPartIndex === undefined) {
      return undefined;
    }
    const part = document.parts[currentPartIndex];
    if (part === undefined) {
      return undefined;
    }
    const anchor = resolveMeasureAnchorInIds(contentIds(part), entry.anchor);
    if (!anchor.ok) {
      return undefined;
    }
    contents.push({
      partIndex: currentPartIndex,
      contentIndex: anchor.insertionIndex,
    });
  }
  return {
    definitionIndex: definitionAnchor.insertionIndex,
    contents,
  };
}

function preflightRemoveMeasure(
  document: ScoreDocument,
  effect: Extract<CoreEffect, { readonly kind: "remove-measure-bundle" }>,
): RemoveMeasurePlan | undefined {
  if (!matchesDocument(document, effect.documentId)) {
    return undefined;
  }
  const definitionIndex = measureIndex(document, effect.measureId);
  if (definitionIndex === undefined) {
    return undefined;
  }
  const contents: RemoveMeasurePlan["contents"][number][] = [];
  for (let index = 0; index < document.parts.length; index += 1) {
    const part = document.parts[index];
    if (part === undefined) {
      return undefined;
    }
    const contentIndex = partContentIndex(part, effect.measureId);
    if (contentIndex === undefined) {
      return undefined;
    }
    contents.push({ partIndex: index, contentIndex });
  }
  return { definitionIndex, contents };
}

function preflightMoveMeasure(
  document: ScoreDocument,
  effect: Extract<CoreEffect, { readonly kind: "move-measure-bundle" }>,
): MoveMeasurePlan | undefined {
  if (
    !matchesDocument(document, effect.documentId) ||
    effect.contentAnchors.length !== document.parts.length
  ) {
    return undefined;
  }
  const definitionIndex = measureIndex(document, effect.measureId);
  const definitionMove = moveInsertionIndex(
    measureIds(document),
    effect.measureId,
    effect.definitionAnchor,
  );
  if (
    definitionIndex === undefined ||
    !definitionMove.ok
  ) {
    return undefined;
  }

  const contents: MoveMeasurePlan["contents"][number][] = [];
  for (let index = 0; index < document.parts.length; index += 1) {
    const part = document.parts[index];
    const contentAnchor = effect.contentAnchors[index];
    if (
      part === undefined ||
      contentAnchor === undefined ||
      contentAnchor.partId !== part.id
    ) {
      return undefined;
    }
    const contentIndex = partContentIndex(part, effect.measureId);
    const move = moveInsertionIndex(
      contentIds(part),
      effect.measureId,
      contentAnchor.anchor,
    );
    if (contentIndex === undefined || !move.ok) {
      return undefined;
    }
    contents.push({
      partIndex: index,
      contentIndex,
      insertionIndex: move.insertionIndex,
    });
  }
  return {
    definitionIndex,
    definitionInsertionIndex: definitionMove.insertionIndex,
    contents,
  };
}

function sameIdSet(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  const seen = new Set<string>();
  for (const value of left) {
    if (seen.has(value)) {
      return false;
    }
    seen.add(value);
  }
  for (const value of right) {
    if (!seen.delete(value)) {
      return false;
    }
  }
  return seen.size === 0;
}

function hasUniqueIds(ids: readonly string[]): boolean {
  return new Set(ids).size === ids.length;
}

function preflightReorderPartMeasureContents(
  document: ScoreDocument,
  effect: Extract<
    CoreEffect,
    { readonly kind: "reorder-part-measure-contents" }
  >,
): ReorderMeasurePlan | undefined {
  if (
    !matchesDocument(document, effect.documentId) ||
    effect.orders.length !== document.parts.length
  ) {
    return undefined;
  }
  const expectedMeasureIds = measureIds(document);
  if (!hasUniqueIds(expectedMeasureIds)) {
    return undefined;
  }
  const parts: ReorderMeasurePlan["parts"][number][] = [];
  for (let index = 0; index < document.parts.length; index += 1) {
    const part = document.parts[index];
    const order = effect.orders[index];
    if (
      part === undefined ||
      order === undefined ||
      order.partId !== part.id
    ) {
      return undefined;
    }
    const currentMeasureIds = contentIds(part);
    if (
      !sameIdSet(currentMeasureIds, expectedMeasureIds) ||
      !sameIdSet(order.measureIds, currentMeasureIds)
    ) {
      return undefined;
    }
    parts.push({ partIndex: index, currentMeasureIds });
  }
  return { parts };
}

function preflightReplaceMeasureDefinition(
  document: ScoreDocument,
  effect: Extract<
    CoreEffect,
    { readonly kind: "replace-measure-definition" }
  >,
): number | undefined {
  if (
    !matchesDocument(document, effect.documentId) ||
    effect.value.id !== effect.measureId
  ) {
    return undefined;
  }
  return measureIndex(document, effect.measureId);
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
        return resolved.ok ? internalFailure() : resolved.failure;
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
        return resolved.ok ? internalFailure() : resolved.failure;
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
        return resolved.ok ? internalFailure() : resolved.failure;
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
        return resolved.ok ? internalFailure() : resolved.failure;
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
    case "insert-measure-bundle":
      return {
        kind: "remove-measure-bundle",
        documentId: effect.documentId,
        measureId: effect.definition.id,
      };
    case "remove-measure-bundle": {
      const plan = preflightRemoveMeasure(candidate, effect);
      const definition = plan === undefined
        ? undefined
        : candidate.measureDefinitions[plan.definitionIndex];
      if (plan === undefined || definition === undefined) {
        return internalFailure();
      }
      const ids = measureIds(candidate);
      const contents: AnchoredPartMeasureContent[] = [];
      for (const entry of plan.contents) {
        const part = candidate.parts[entry.partIndex];
        const content = part?.measureContents[entry.contentIndex];
        if (part === undefined || content === undefined) {
          return internalFailure();
        }
        contents.push({
          partId: part.id,
          anchor: previousMeasureAnchor(contentIds(part), entry.contentIndex),
          content: cloneValue(content),
        });
      }
      return {
        kind: "insert-measure-bundle",
        documentId: effect.documentId,
        definitionAnchor: previousMeasureAnchor(ids, plan.definitionIndex),
        definition: cloneValue(definition),
        contents,
      };
    }
    case "move-measure-bundle": {
      const plan = preflightMoveMeasure(candidate, effect);
      if (plan === undefined) {
        return internalFailure();
      }
      const contentAnchors: PartMeasureAnchor[] = [];
      for (const entry of plan.contents) {
        const part = candidate.parts[entry.partIndex];
        if (part === undefined) {
          return internalFailure();
        }
        contentAnchors.push({
          partId: part.id,
          anchor: previousMeasureAnchor(contentIds(part), entry.contentIndex),
        });
      }
      return {
        kind: "move-measure-bundle",
        documentId: effect.documentId,
        measureId: effect.measureId,
        definitionAnchor: previousMeasureAnchor(
          measureIds(candidate),
          plan.definitionIndex,
        ),
        contentAnchors,
      };
    }
    case "reorder-part-measure-contents": {
      const plan = preflightReorderPartMeasureContents(candidate, effect);
      if (plan === undefined) {
        return internalFailure();
      }
      const orders: Extract<
        CoreEffect,
        { readonly kind: "reorder-part-measure-contents" }
      >["orders"][number][] = [];
      for (const entry of plan.parts) {
        const part = candidate.parts[entry.partIndex];
        if (part === undefined) {
          return internalFailure();
        }
        orders.push({
          partId: part.id,
          measureIds: [...entry.currentMeasureIds],
        });
      }
      return {
        kind: "reorder-part-measure-contents",
        documentId: effect.documentId,
        orders,
      };
    }
    case "replace-measure-definition": {
      const index = preflightReplaceMeasureDefinition(candidate, effect);
      const previous = index === undefined
        ? undefined
        : candidate.measureDefinitions[index];
      if (previous === undefined) {
        return internalFailure();
      }
      return {
        kind: "replace-measure-definition",
        documentId: effect.documentId,
        measureId: effect.measureId,
        value: cloneValue(previous),
      };
    }
  }
}

function moveAt<T>(
  values: T[],
  targetIndex: number,
  insertionIndex: number,
): boolean {
  const removed = values.splice(targetIndex, 1);
  const target = removed[0];
  if (target === undefined) {
    return false;
  }
  values.splice(insertionIndex, 0, target);
  return true;
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
        return internalFailure();
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
        return internalFailure();
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
        return internalFailure();
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
        return internalFailure();
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
        return internalFailure();
      }
      const events = resolved.value.voice.sequence.events as RhythmicEvent[];
      events.splice(resolved.value.eventIndex, 1);
      return undefined;
    }
    case "insert-measure-bundle": {
      const plan = preflightInsertMeasure(candidate, effect);
      if (plan === undefined) {
        return internalFailure();
      }
      const definitions = candidate.measureDefinitions as MeasureDefinition[];
      definitions.splice(plan.definitionIndex, 0, cloneValue(effect.definition));
      for (let index = 0; index < plan.contents.length; index += 1) {
        const entry = plan.contents[index];
        const source = effect.contents[index];
        const part = entry === undefined ? undefined : candidate.parts[entry.partIndex];
        if (entry === undefined || source === undefined || part === undefined) {
          return internalFailure();
        }
        const contents = part.measureContents as PartMeasureContent[];
        contents.splice(entry.contentIndex, 0, cloneValue(source.content));
      }
      return undefined;
    }
    case "remove-measure-bundle": {
      const plan = preflightRemoveMeasure(candidate, effect);
      if (plan === undefined) {
        return internalFailure();
      }
      const definitions = candidate.measureDefinitions as MeasureDefinition[];
      definitions.splice(plan.definitionIndex, 1);
      for (const entry of plan.contents) {
        const part = candidate.parts[entry.partIndex];
        if (part === undefined) {
          return internalFailure();
        }
        (part.measureContents as PartMeasureContent[]).splice(entry.contentIndex, 1);
      }
      return undefined;
    }
    case "move-measure-bundle": {
      const plan = preflightMoveMeasure(candidate, effect);
      if (plan === undefined) {
        return internalFailure();
      }
      if (
        !moveAt(
          candidate.measureDefinitions as MeasureDefinition[],
          plan.definitionIndex,
          plan.definitionInsertionIndex,
        )
      ) {
        return internalFailure();
      }
      for (const entry of plan.contents) {
        const part = candidate.parts[entry.partIndex];
        if (
          part === undefined ||
          !moveAt(
            part.measureContents as PartMeasureContent[],
            entry.contentIndex,
            entry.insertionIndex,
          )
        ) {
          return internalFailure();
        }
      }
      return undefined;
    }
    case "reorder-part-measure-contents": {
      const plan = preflightReorderPartMeasureContents(candidate, effect);
      if (plan === undefined) {
        return internalFailure();
      }
      for (let index = 0; index < plan.parts.length; index += 1) {
        const entry = plan.parts[index];
        const order = effect.orders[index];
        const part = entry === undefined ? undefined : candidate.parts[entry.partIndex];
        if (entry === undefined || order === undefined || part === undefined) {
          return internalFailure();
        }
        const byMeasureId = new Map<string, PartMeasureContent>();
        for (const content of part.measureContents) {
          byMeasureId.set(content.measureId, content);
        }
        const reordered = order.measureIds.map((measureId) => byMeasureId.get(measureId));
        if (reordered.some((content) => content === undefined)) {
          return internalFailure();
        }
        const contents = part.measureContents as PartMeasureContent[];
        contents.splice(0, contents.length, ...(reordered as PartMeasureContent[]));
      }
      return undefined;
    }
    case "replace-measure-definition": {
      const index = preflightReplaceMeasureDefinition(candidate, effect);
      if (index === undefined) {
        return internalFailure();
      }
      (candidate.measureDefinitions as MeasureDefinition[]).splice(
        index,
        1,
        cloneValue(effect.value),
      );
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
