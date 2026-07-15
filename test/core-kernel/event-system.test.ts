import { test } from "node:test";
import assert = require("node:assert/strict");

import {
  CommandBus,
  type EventSubscriptionResult,
  type KernelEvent,
  type KernelEventHandler,
  type KernelReadState,
  type ReadResult,
  type ScoreDocument,
} from "../../src/core-kernel/index";
import { cloneCoreScoreFixture } from "./fixtures/core-score";

function requireBus(document: ScoreDocument = cloneCoreScoreFixture()): CommandBus {
  const created = CommandBus.create(document);
  assert.equal(created.ok, true);
  if (!created.ok) {
    throw new Error("expected a valid CommandBus");
  }
  return created.value;
}

function requireRead(bus: CommandBus): KernelReadState {
  const result: ReadResult<KernelReadState> = bus.read();
  if (!result.ok) {
    throw new Error(`expected read success: ${result.failure.code}`);
  }
  return result.value;
}

function requireSubscription(
  result: EventSubscriptionResult,
): () => void {
  if (result.status !== "subscribed") {
    throw new Error(`expected subscription: ${result.failure.code}`);
  }
  assert.equal(result.status, "subscribed");
  return result.unsubscribe;
}

function command(
  commandId: string,
  target: unknown,
  payload: unknown,
): unknown {
  return { commandVersion: 1, commandId, target, payload };
}

function setMetadata(title: string): unknown {
  return command(
    "core.document.set-metadata",
    { kind: "document", documentId: "score-1" },
    {
      metadata: {
        title,
        authors: ["Brilliant Guitar"],
        tempo: { bpm: 120 },
      },
    },
  );
}

function setPitch(step: "C" | "D"): unknown {
  return command(
    "core.note.set-written-pitch",
    { kind: "note", noteId: "note-1" },
    { writtenPitch: { step, alter: 0, octave: 4 } },
  );
}

function setNoteValue(base: 4 | 8): unknown {
  return command(
    "core.event.set-note-value",
    { kind: "event", eventId: "event-1" },
    { noteValue: { base, dots: 0 } },
  );
}

function incompleteDocument(): ScoreDocument {
  const document = cloneCoreScoreFixture();
  const events = document.parts[0]!.measureContents[0]!.voices[0]!.sequence
    .events as typeof document.parts[0]["measureContents"][0]["voices"][0]["sequence"]["events"][number][];
  events.splice(3);
  return document;
}

function insertChord(eventId = "event-new"): unknown {
  return command(
    "core.voice.insert-notes-event",
    { kind: "voice", voiceId: "voice-1" },
    {
      anchor: { kind: "after-event", eventId: "event-3" },
      event: {
        id: eventId,
        duration: { base: 4, dots: 0 },
        content: {
          kind: "notes",
          notes: [
            {
              id: "note-new-1",
              writtenPitch: { step: "E", alter: 0, octave: 4 },
            },
            {
              id: "note-new-2",
              writtenPitch: { step: "G", alter: 0, octave: 4 },
            },
          ],
        },
      },
    },
  );
}

function committedEvents(events: readonly KernelEvent[]): readonly Extract<
  KernelEvent,
  { readonly eventType: "core.document.committed" }
>[] {
  return events.filter(
    (event): event is Extract<
      KernelEvent,
      { readonly eventType: "core.document.committed" }
    > => event.eventType === "core.document.committed",
  );
}

function assertDeepFrozen(value: unknown, seen = new WeakSet<object>()): void {
  if (value === null || typeof value !== "object" || seen.has(value)) {
    return;
  }
  seen.add(value);
  assert.equal(Object.isFrozen(value), true);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
    assert.notEqual(descriptor, undefined);
    if (descriptor !== undefined && "value" in descriptor) {
      assertDeepFrozen(descriptor.value, seen);
    }
  }
}

function assertPayloadBoundary(value: unknown, seen = new WeakSet<object>()): void {
  if (value === null || typeof value !== "object" || seen.has(value)) {
    return;
  }
  seen.add(value);
  const forbidden = new Set([
    "document",
    "mutation",
    "history",
    "handler",
    "timestamp",
    "path",
    "window",
    "layout",
    "playback",
  ]);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key === "string") {
      assert.equal(forbidden.has(key), false, `forbidden event key: ${key}`);
    }
    const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
    if (descriptor !== undefined && "value" in descriptor) {
      assertPayloadBoundary(descriptor.value, seen);
    }
  }
}

test("events use deterministic count, order, versions, and support behavior", () => {
  const bus = requireBus();
  const events: KernelEvent[] = [];
  requireSubscription(bus.subscribe((event: KernelEvent) => events.push(event)));

  assert.equal(bus.undo().status, "rejected");
  assert.equal(bus.redo().status, "rejected");
  assert.equal(bus.submit(setPitch("C")).status, "no-op");
  assert.equal(bus.submit({ commandVersion: 1 }).status, "rejected");
  assert.equal(events.length, 0);

  assert.equal(bus.submit(setMetadata("First")).status, "committed");
  assert.deepEqual(
    events.map(({ eventType, eventSequence }) => [eventType, eventSequence]),
    [
      ["core.document.committed", 1],
      ["core.session.dirty-state-changed", 2],
    ],
  );
  assert.equal(events[0]!.documentVersion, 1);
  assert.equal(events[1]!.documentVersion, 1);
  assert.equal(events[0]!.eventVersion, 1);
  assert.equal(events[0]!.documentId, "score-1");
  assert.equal(events[0]!.cause, "submit");
  assert.equal(events[1]!.cause, "submit");
  assert.equal(
    events[1]!.eventType === "core.session.dirty-state-changed" &&
      events[1]!.dirty,
    true,
  );

  assert.equal(bus.submit(setPitch("D")).status, "committed");
  assert.equal(events[2]?.eventType, "core.document.committed");
  assert.equal(events[2]?.eventSequence, 3);
  assert.deepEqual(
    bus.markPersisted({ documentId: "score-1", documentVersion: 2 }),
    { status: "updated", documentVersion: 2, dirty: false },
  );
  assert.deepEqual(
    events.slice(3).map(({ eventType, eventSequence }) => [
      eventType,
      eventSequence,
    ]),
    [["core.session.dirty-state-changed", 4]],
  );
  assert.equal(events[3]!.cause, "mark-persisted");
  assert.equal(
    events[3]!.eventType === "core.session.dirty-state-changed" &&
      events[3]!.dirty,
    false,
  );
  assert.equal(
    bus.markPersisted({ documentId: "score-1", documentVersion: 2 }).status,
    "no-op",
  );
  assert.equal(events.length, 4);

  const unsupportedBus = requireBus(incompleteDocument());
  const unsupportedEvents: KernelEvent[] = [];
  requireSubscription(
    unsupportedBus.subscribe((event: KernelEvent) => unsupportedEvents.push(event)),
  );
  const unsupported = unsupportedBus.submit(insertChord());
  assert.equal(unsupported.status, "committed");
  if (unsupported.status === "committed") {
    assert.equal(unsupported.support.status, "unsupported");
    assert.equal(
      unsupported.support.diagnostics.some(
        ({ code }) => code === "unsupported.chord",
      ),
      true,
    );
  }
  assert.deepEqual(
    unsupportedEvents.map(({ eventType }) => eventType),
    ["core.document.committed", "core.session.dirty-state-changed"],
  );
});

test("committed events expose stable affected targets and no internal payload", () => {
  const propertyBus = requireBus();
  const propertyEvents: KernelEvent[] = [];
  requireSubscription(
    propertyBus.subscribe((event: KernelEvent) => propertyEvents.push(event)),
  );
  assert.equal(propertyBus.submit(setMetadata("Changed")).status, "committed");
  assert.equal(propertyBus.submit(setPitch("D")).status, "committed");
  assert.equal(propertyBus.submit(setNoteValue(8)).status, "committed");
  assert.deepEqual(
    committedEvents(propertyEvents).map(({ affectedEntities }) =>
      affectedEntities,
    ),
    [
      [{ kind: "document", documentId: "score-1" }],
      [{ kind: "note", noteId: "note-1" }],
      [{ kind: "event", eventId: "event-1" }],
    ],
  );

  const insertBus = requireBus(incompleteDocument());
  const insertEvents: KernelEvent[] = [];
  requireSubscription(
    insertBus.subscribe((event: KernelEvent) => insertEvents.push(event)),
  );
  assert.equal(insertBus.submit(insertChord()).status, "committed");
  const inserted = committedEvents(insertEvents)[0]!;
  assert.equal(inserted.commandId, "core.voice.insert-notes-event");
  assert.equal(inserted.cause, "submit");
  assert.deepEqual(inserted.affectedEntities, [
    { kind: "voice", voiceId: "voice-1" },
    { kind: "event", eventId: "event-new" },
    { kind: "note", noteId: "note-new-1" },
    { kind: "note", noteId: "note-new-2" },
  ]);

  const removeBus = requireBus();
  const removeEvents: KernelEvent[] = [];
  requireSubscription(
    removeBus.subscribe((event: KernelEvent) => removeEvents.push(event)),
  );
  const remove = command(
    "core.event.remove",
    { kind: "event", eventId: "event-1" },
    {},
  );
  assert.equal(removeBus.submit(remove).status, "committed");
  const originalAffected = committedEvents(removeEvents)[0]!.affectedEntities;
  assert.deepEqual(originalAffected, [
    { kind: "event", eventId: "event-1" },
    { kind: "voice", voiceId: "voice-1" },
    { kind: "note", noteId: "note-1" },
  ]);
  assert.equal(removeBus.undo().status, "committed");
  assert.equal(removeBus.redo().status, "committed");
  const removeCommitted = committedEvents(removeEvents);
  assert.equal(removeCommitted[1]!.cause, "undo");
  assert.equal(removeCommitted[2]!.cause, "redo");
  assert.equal(removeCommitted[2]!.commandId, "core.event.remove");
  assert.deepEqual(removeCommitted[1]!.affectedEntities, originalAffected);
  assert.deepEqual(removeCommitted[2]!.affectedEntities, originalAffected);

  for (const event of [...propertyEvents, ...insertEvents, ...removeEvents]) {
    assertDeepFrozen(event);
    assertPayloadBoundary(event);
  }
});

test("subscriber snapshots isolate lifecycle changes, duplicates, and failures", () => {
  const bus = requireBus();
  assert.equal(bus.submit(setMetadata("Seed dirty")).status, "committed");
  const calls: string[] = [];
  let eventNumber = 0;
  const late: KernelEventHandler = () => calls.push(`late-${eventNumber}`);
  let unsubscribeThird = () => {};
  requireSubscription(
    bus.subscribe(() => {
      calls.push(`first-${eventNumber}`);
      requireSubscription(bus.subscribe(late));
    }),
  );
  requireSubscription(
    bus.subscribe(() => {
      calls.push(`second-${eventNumber}`);
      unsubscribeThird();
    }),
  );
  unsubscribeThird = requireSubscription(
    bus.subscribe(() => {
      calls.push(`third-${eventNumber}`);
      throw new Error("subscriber detail must stay isolated");
    }),
  );

  eventNumber = 1;
  assert.equal(bus.submit(setPitch("D")).status, "committed");
  assert.deepEqual(calls, ["first-1", "second-1", "third-1"]);
  eventNumber = 2;
  assert.equal(bus.submit(setMetadata("Next")).status, "committed");
  assert.deepEqual(calls.slice(3), ["first-2", "second-2", "late-2"]);

  const duplicateBus = requireBus();
  assert.equal(
    duplicateBus.submit(setMetadata("Seed duplicate dirty")).status,
    "committed",
  );
  let duplicateCalls = 0;
  const duplicate = () => {
    duplicateCalls += 1;
  };
  const firstUnsubscribe = requireSubscription(
    duplicateBus.subscribe(duplicate),
  );
  const secondUnsubscribe = requireSubscription(
    duplicateBus.subscribe(duplicate),
  );
  assert.equal(duplicateBus.submit(setPitch("D")).status, "committed");
  assert.equal(duplicateCalls, 2);
  firstUnsubscribe();
  firstUnsubscribe();
  assert.equal(duplicateBus.submit(setMetadata("Final")).status, "committed");
  assert.equal(duplicateCalls, 3);
  secondUnsubscribe();

  assert.deepEqual(duplicateBus.subscribe(null), {
    status: "rejected",
    failure: { code: "event.invalid-handler" },
  });
});

test("event callbacks allow reads but reject every reentrant write", () => {
  const bus = requireBus();
  const events: KernelEvent[] = [];
  const nestedFailures: string[] = [];
  let callbackReadVersion = -1;
  requireSubscription(
    bus.subscribe((event: KernelEvent) => {
      events.push(event);
      if (event.eventType !== "core.document.committed") {
        return;
      }
      const read = bus.read();
      assert.equal(read.ok, true);
      if (read.ok) {
        callbackReadVersion = read.value.snapshot.documentVersion;
      }
      for (const result of [
        bus.submit(setPitch("D")),
        bus.undo(),
        bus.redo(),
      ]) {
        assert.equal(result.status, "rejected");
        if (result.status === "rejected") {
          nestedFailures.push(result.failure.code);
        }
      }
      const checkpoint = bus.markPersisted({
        documentId: "score-1",
        documentVersion: 1,
      });
      assert.equal(checkpoint.status, "rejected");
      if (checkpoint.status === "rejected") {
        nestedFailures.push(checkpoint.failure.code);
      }
    }),
  );

  assert.equal(bus.submit(setMetadata("Committed once")).status, "committed");
  assert.equal(callbackReadVersion, 1);
  assert.deepEqual(nestedFailures, [
    "event.reentrant-write",
    "event.reentrant-write",
    "event.reentrant-write",
    "event.reentrant-write",
  ]);
  assert.deepEqual(
    events.map(({ eventType }) => eventType),
    ["core.document.committed", "core.session.dirty-state-changed"],
  );
  const state = requireRead(bus);
  assert.equal(state.snapshot.documentVersion, 1);
  assert.deepEqual(state.history, { undoDepth: 1, redoDepth: 0 });
  assert.equal(state.dirty, true);
});
