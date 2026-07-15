import type { CommittedOperation } from "../commands/runtime";
import type { ScoreAddress } from "../domain/address";
import type {
  RhythmicEvent,
  ScoreDocument,
} from "../domain/score-document";

interface LocatedEvent {
  readonly voiceId: string;
  readonly event: RhythmicEvent;
}

function addressKey(address: ScoreAddress): string {
  switch (address.kind) {
    case "document":
      return `${address.kind}:${address.documentId}`;
    case "measure":
      return `${address.kind}:${address.measureId}`;
    case "part":
      return `${address.kind}:${address.partId}`;
    case "staff":
      return `${address.kind}:${address.staffId}`;
    case "voice":
      return `${address.kind}:${address.voiceId}`;
    case "event":
      return `${address.kind}:${address.eventId}`;
    case "note":
      return `${address.kind}:${address.noteId}`;
  }
}

function addAddress(
  addresses: ScoreAddress[],
  keys: Set<string>,
  address: ScoreAddress,
): void {
  const key = addressKey(address);
  if (!keys.has(key)) {
    keys.add(key);
    addresses.push(structuredClone(address));
  }
}

function locateEvent(
  document: ScoreDocument,
  eventId: string,
): LocatedEvent | undefined {
  let located: LocatedEvent | undefined;
  for (const part of document.parts) {
    for (const content of part.measureContents) {
      for (const voice of content.voices) {
        for (const event of voice.sequence.events) {
          if (event.id !== eventId) {
            continue;
          }
          if (located !== undefined) {
            throw new Error("duplicate event identity");
          }
          located = { voiceId: voice.id, event };
        }
      }
    }
  }
  return located;
}

function addEventAndNotes(
  addresses: ScoreAddress[],
  keys: Set<string>,
  event: RhythmicEvent,
): void {
  addAddress(addresses, keys, { kind: "event", eventId: event.id });
  if (event.content.kind === "notes") {
    for (const note of event.content.notes) {
      addAddress(addresses, keys, { kind: "note", noteId: note.id });
    }
  }
}

export function deriveAffectedEntities(
  operation: CommittedOperation,
  previousDocument: ScoreDocument,
  committedDocument: ScoreDocument,
): readonly ScoreAddress[] {
  const addresses: ScoreAddress[] = [];
  const keys = new Set<string>();
  addAddress(addresses, keys, operation.command.target);

  switch (operation.command.commandId) {
    case "core.document.set-metadata":
    case "core.note.set-written-pitch":
    case "core.event.set-note-value":
      return addresses;
    case "core.voice.insert-notes-event":
    case "core.voice.insert-rest-event": {
      const event = operation.command.payload.event;
      addAddress(addresses, keys, {
        kind: "voice",
        voiceId: operation.command.target.voiceId,
      });
      addEventAndNotes(addresses, keys, event);
      return addresses;
    }
    case "core.event.remove": {
      const eventId = operation.command.target.eventId;
      const mutation = operation.effectiveMutation;
      const located =
        mutation.kind === "insert-event" && mutation.event.id === eventId
          ? { voiceId: mutation.voiceId, event: mutation.event }
          : locateEvent(previousDocument, eventId) ??
            locateEvent(committedDocument, eventId);
      if (located === undefined) {
        throw new Error("committed event target is unavailable");
      }
      addAddress(addresses, keys, {
        kind: "voice",
        voiceId: located.voiceId,
      });
      addEventAndNotes(addresses, keys, located.event);
      return addresses;
    }
  }
}
