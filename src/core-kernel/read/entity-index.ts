import type { ScoreAddress } from "../domain/address";
import {
  SCORE_DOCUMENT_SCHEMA_VERSION,
  type MeasureDefinition,
  type PartMeasureContent,
  type RhythmicEvent,
} from "../domain/score-document";
import { validateScoreDocumentSemantics } from "../validation/validate-score-semantics";
import type {
  DocumentSnapshot,
  ReadResult,
  ScoreEntityOwnership,
  SelectedScoreEntity,
} from "./contracts";
import { deepFreezeValue } from "./deep-freeze";

interface EntityIndex {
  readonly entities: ReadonlyMap<string, SelectedScoreEntity>;
  readonly ownership: ReadonlyMap<string, ScoreEntityOwnership>;
  readonly measures: readonly MeasureDefinition[];
  readonly measureIndexById: ReadonlyMap<string, number>;
  readonly measureContentsByPart: ReadonlyMap<
    string,
    ReadonlyMap<string, PartMeasureContent>
  >;
  readonly eventsByVoice: ReadonlyMap<string, readonly RhythmicEvent[]>;
}

const INDEX_BY_SNAPSHOT = new WeakMap<DocumentSnapshot, EntityIndex>();

const INVALID_SNAPSHOT = deepFreezeValue({
  ok: false,
  failure: { code: "read.invalid-snapshot" },
} as const);

const INVARIANT_VIOLATION = deepFreezeValue({
  ok: false,
  failure: { code: "read.invariant-violation" },
} as const);

function isDeeplyFrozenData(
  value: unknown,
  seen: WeakSet<object> = new WeakSet<object>(),
): boolean {
  if (value === null || typeof value !== "object" || seen.has(value)) {
    return true;
  }
  if (!Object.isFrozen(value)) {
    return false;
  }
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !("value" in descriptor)) {
      return false;
    }
    if (!isDeeplyFrozenData(descriptor.value, seen)) {
      return false;
    }
  }
  return true;
}

function hasValidSnapshotEnvelope(
  snapshot: DocumentSnapshot,
): snapshot is DocumentSnapshot {
  if (
    typeof snapshot !== "object" ||
    snapshot === null ||
    typeof snapshot.documentId !== "string" ||
    snapshot.documentId.length === 0 ||
    snapshot.schemaVersion !== SCORE_DOCUMENT_SCHEMA_VERSION ||
    !Number.isSafeInteger(snapshot.documentVersion) ||
    snapshot.documentVersion < 0 ||
    typeof snapshot.document !== "object" ||
    snapshot.document === null ||
    snapshot.document.id !== snapshot.documentId ||
    snapshot.document.schemaVersion !== snapshot.schemaVersion
  ) {
    return false;
  }
  return isDeeplyFrozenData(snapshot);
}

function entityKey(kind: ScoreAddress["kind"], id: string): string {
  return `${kind}:${id}`;
}

function buildEntityIndex(snapshot: DocumentSnapshot): ReadResult<EntityIndex> {
  if (!hasValidSnapshotEnvelope(snapshot)) {
    return INVALID_SNAPSHOT;
  }

  const semantic = validateScoreDocumentSemantics(snapshot.document);
  if (!semantic.ok) {
    return INVARIANT_VIOLATION;
  }

  const entities = new Map<string, SelectedScoreEntity>();
  const ownership = new Map<string, ScoreEntityOwnership>();
  const globalIds = new Set<string>();
  const measureIndexById = new Map<string, number>();
  const measureContentsByPart = new Map<
    string,
    ReadonlyMap<string, PartMeasureContent>
  >();
  const eventsByVoice = new Map<string, readonly RhythmicEvent[]>();
  const documentId = snapshot.documentId;

  const addEntity = (
    kind: ScoreAddress["kind"],
    id: string,
    selected: SelectedScoreEntity,
    owner: ScoreEntityOwnership,
  ): boolean => {
    if (id.length === 0 || globalIds.has(id)) {
      return false;
    }
    globalIds.add(id);
    entities.set(entityKey(kind, id), deepFreezeValue(selected));
    ownership.set(entityKey(kind, id), deepFreezeValue(owner));
    return true;
  };

  if (
    !addEntity(
      "document",
      documentId,
      { kind: "document", value: snapshot.document },
      { entityKind: "document", documentId },
    )
  ) {
    return INVARIANT_VIOLATION;
  }

  for (const [measureIndex, measure] of
    snapshot.document.measureDefinitions.entries()) {
    if (
      !addEntity(
        "measure",
        measure.id,
        { kind: "measure", value: measure },
        { entityKind: "measure", documentId },
      )
    ) {
      return INVARIANT_VIOLATION;
    }
    measureIndexById.set(measure.id, measureIndex);
  }

  for (const part of snapshot.document.parts) {
    if (
      !addEntity(
        "part",
        part.id,
        { kind: "part", value: part },
        { entityKind: "part", documentId },
      )
    ) {
      return INVARIANT_VIOLATION;
    }

    for (const staff of part.staves) {
      if (
        !addEntity(
          "staff",
          staff.id,
          { kind: "staff", value: staff },
          { entityKind: "staff", documentId, partId: part.id },
        )
      ) {
        return INVARIANT_VIOLATION;
      }
    }

    const contentByMeasure = new Map<string, PartMeasureContent>();
    for (const content of part.measureContents) {
      if (
        !measureIndexById.has(content.measureId) ||
        contentByMeasure.has(content.measureId)
      ) {
        return INVARIANT_VIOLATION;
      }
      contentByMeasure.set(content.measureId, content);
    }
    if (contentByMeasure.size !== snapshot.document.measureDefinitions.length) {
      return INVARIANT_VIOLATION;
    }
    measureContentsByPart.set(part.id, contentByMeasure);

    for (const measure of snapshot.document.measureDefinitions) {
      const content = contentByMeasure.get(measure.id);
      if (content === undefined) {
        return INVARIANT_VIOLATION;
      }
      for (const voice of content.voices) {
        if (
          !addEntity(
            "voice",
            voice.id,
            { kind: "voice", value: voice },
            {
              entityKind: "voice",
              documentId,
              partId: part.id,
              measureId: measure.id,
            },
          ) ||
          eventsByVoice.has(voice.id)
        ) {
          return INVARIANT_VIOLATION;
        }
        eventsByVoice.set(voice.id, voice.sequence.events);

        for (const event of voice.sequence.events) {
          if (
            !addEntity(
              "event",
              event.id,
              { kind: "event", value: event },
              {
                entityKind: "event",
                documentId,
                partId: part.id,
                measureId: measure.id,
                voiceId: voice.id,
              },
            )
          ) {
            return INVARIANT_VIOLATION;
          }
          if (event.content.kind !== "notes") {
            continue;
          }
          for (const note of event.content.notes) {
            if (
              !addEntity(
                "note",
                note.id,
                { kind: "note", value: note },
                {
                  entityKind: "note",
                  documentId,
                  partId: part.id,
                  measureId: measure.id,
                  voiceId: voice.id,
                  eventId: event.id,
                },
              )
            ) {
              return INVARIANT_VIOLATION;
            }
          }
        }
      }
    }
  }

  return {
    ok: true,
    value: {
      entities,
      ownership,
      measures: snapshot.document.measureDefinitions,
      measureIndexById,
      measureContentsByPart,
      eventsByVoice,
    },
  };
}

export function getEntityIndex(
  snapshot: DocumentSnapshot,
): ReadResult<EntityIndex> {
  try {
    if (typeof snapshot !== "object" || snapshot === null) {
      return INVALID_SNAPSHOT;
    }
    const cached = INDEX_BY_SNAPSHOT.get(snapshot);
    if (cached !== undefined) {
      return { ok: true, value: cached };
    }
    const built = buildEntityIndex(snapshot);
    if (built.ok) {
      INDEX_BY_SNAPSHOT.set(snapshot, built.value);
    }
    return built;
  } catch {
    return INVALID_SNAPSHOT;
  }
}

export function getIndexedEntity(
  index: EntityIndex,
  address: ScoreAddress,
): SelectedScoreEntity | undefined {
  return index.entities.get(addressKey(address));
}

export function getIndexedOwnership(
  index: EntityIndex,
  address: ScoreAddress,
): ScoreEntityOwnership | undefined {
  return index.ownership.get(addressKey(address));
}

export function addressKey(address: ScoreAddress): string {
  switch (address.kind) {
    case "document":
      return entityKey(address.kind, address.documentId);
    case "measure":
      return entityKey(address.kind, address.measureId);
    case "part":
      return entityKey(address.kind, address.partId);
    case "staff":
      return entityKey(address.kind, address.staffId);
    case "voice":
      return entityKey(address.kind, address.voiceId);
    case "event":
      return entityKey(address.kind, address.eventId);
    case "note":
      return entityKey(address.kind, address.noteId);
  }
}

export function getMeasureIndex(
  index: EntityIndex,
  measureId: string,
): number | undefined {
  return index.measureIndexById.get(measureId);
}

export function getMeasures(index: EntityIndex): readonly MeasureDefinition[] {
  return index.measures;
}

export function getPartMeasureContent(
  index: EntityIndex,
  partId: string,
  measureId: string,
): PartMeasureContent | undefined {
  return index.measureContentsByPart.get(partId)?.get(measureId);
}

export function hasPart(index: EntityIndex, partId: string): boolean {
  return index.entities.has(entityKey("part", partId));
}

export function getVoiceEvents(
  index: EntityIndex,
  voiceId: string,
): readonly RhythmicEvent[] | undefined {
  return index.eventsByVoice.get(voiceId);
}

export function getEventOwnership(
  index: EntityIndex,
  eventId: string,
): Extract<ScoreEntityOwnership, { readonly entityKind: "event" }> | undefined {
  const owner = index.ownership.get(entityKey("event", eventId));
  return owner?.entityKind === "event" ? owner : undefined;
}
