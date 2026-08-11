import assert = require("node:assert/strict");
import { test } from "node:test";

import {
  CommandBus,
  type KernelEvent,
  type RhythmicEvent,
  type ScoreDocument,
} from "../../src/core-kernel/index";
import { cloneCvn4ScoreFixture } from "./fixtures/cvn-4-score";

function requireBus(document = cloneCvn4ScoreFixture()): CommandBus {
  const created = CommandBus.create(document);
  assert.equal(created.ok, true);
  if (!created.ok) {
    assert.fail("expected valid CVN-5 fixture");
  }
  return created.value;
}

function readDocument(bus: CommandBus): ScoreDocument {
  const read = bus.read();
  assert.equal(read.ok, true);
  if (!read.ok) {
    assert.fail("expected readable command state");
  }
  return read.value.snapshot.document;
}

function deleteRange(range: unknown): unknown {
  return {
    commandVersion: 1,
    commandId: "core.range.delete",
    target: { kind: "document", documentId: "cvn4-score" },
    payload: { range },
  };
}

test("range delete normalizes reverse global measure endpoints and undo restores exactly", () => {
  const bus = requireBus();
  const before = structuredClone(readDocument(bus));
  const result = bus.submit(
    deleteRange({
      kind: "measure-range",
      start: { kind: "measure", measureId: "cvn4-measure-3" },
      end: { kind: "measure", measureId: "cvn4-measure-2" },
    }),
  );

  assert.equal(result.status, "committed");
  assert.deepEqual(
    readDocument(bus).measureDefinitions.map(({ id }) => id),
    ["cvn4-measure-1"],
  );
  for (const part of readDocument(bus).parts) {
    assert.deepEqual(part.measureContents.map(({ measureId }) => measureId), [
      "cvn4-measure-1",
    ]);
  }
  assert.equal(bus.undo().status, "committed");
  assert.deepEqual(readDocument(bus), before);
  assert.equal(bus.redo().status, "committed");
});

test("part-measure and voice-event deletes preserve containers and remove ordered events", () => {
  const partBus = requireBus();
  const partResult = partBus.submit(
    deleteRange({
      kind: "part-measure-range",
      start: {
        kind: "part-measure",
        partId: "cvn4-part-a",
        measureId: "cvn4-measure-2",
      },
      end: {
        kind: "part-measure",
        partId: "cvn4-part-a",
        measureId: "cvn4-measure-1",
      },
    }),
  );
  assert.equal(partResult.status, "committed");
  const part = readDocument(partBus).parts.find(({ id }) => id === "cvn4-part-a");
  assert.equal(part?.measureContents.length, 3);
  assert.deepEqual(
    part?.measureContents.slice(0, 2).map(({ voices }) =>
      voices.map(({ sequence }) => sequence.events.length),
    ),
    [
      [0, 0],
      [0],
    ],
  );

  const voiceBus = requireBus();
  const voiceEvents: KernelEvent[] = [];
  voiceBus.subscribe((event: KernelEvent) => voiceEvents.push(event));
  const voiceResult = voiceBus.submit(
    deleteRange({
      kind: "voice-event-range",
      start: {
        kind: "voice-event",
        voiceId: "cvn4-voice-a-1-primary",
        eventId: "cvn4-event-a-1-rest",
      },
      end: {
        kind: "voice-event",
        voiceId: "cvn4-voice-a-1-primary",
        eventId: "cvn4-event-a-1-notes",
      },
    }),
  );
  assert.equal(voiceResult.status, "committed");
  assert.equal(
    JSON.stringify(readDocument(voiceBus)).includes("cvn4-event-a-1-notes"),
    false,
  );
  assert.equal(
    JSON.stringify(readDocument(voiceBus)).includes("cvn4-note-a-1"),
    false,
  );
  const committed = voiceEvents.find(
    (event): event is Extract<
      KernelEvent,
      { readonly eventType: "core.document.committed" }
    > => event.eventType === "core.document.committed",
  );
  assert.deepEqual(committed?.affectedEntities, [
    { kind: "event", eventId: "cvn4-event-a-1-notes" },
    { kind: "voice", voiceId: "cvn4-voice-a-1-primary" },
    { kind: "note", noteId: "cvn4-note-a-1" },
    { kind: "event", eventId: "cvn4-event-a-1-rest" },
  ]);
});

test("range delete failures are deterministic", () => {
  const bus = requireBus();
  const missing = bus.submit(
    deleteRange({
      kind: "measure-range",
      start: { kind: "measure", measureId: "cvn4-measure-1" },
      end: { kind: "measure", measureId: "missing" },
    }),
  );
  assert.equal(missing.status, "rejected");
  if (missing.status === "rejected") {
    assert.equal(missing.failure.code, "command.range-endpoint-not-found");
  }

  const missingPart = bus.submit(
    deleteRange({
      kind: "part-measure-range",
      start: {
        kind: "part-measure",
        partId: "cvn4-part-a",
        measureId: "cvn4-measure-1",
      },
      end: {
        kind: "part-measure",
        partId: "missing-part",
        measureId: "cvn4-measure-2",
      },
    }),
  );
  assert.equal(missingPart.status, "rejected");
  if (missingPart.status === "rejected") {
    assert.equal(
      missingPart.failure.code,
      "command.range-endpoint-not-found",
    );
  }

  const existingOtherPartWithMissingMeasure = bus.submit(
    deleteRange({
      kind: "part-measure-range",
      start: {
        kind: "part-measure",
        partId: "cvn4-part-a",
        measureId: "cvn4-measure-1",
      },
      end: {
        kind: "part-measure",
        partId: "cvn4-part-b",
        measureId: "missing-measure",
      },
    }),
  );
  assert.equal(existingOtherPartWithMissingMeasure.status, "rejected");
  if (existingOtherPartWithMissingMeasure.status === "rejected") {
    assert.equal(
      existingOtherPartWithMissingMeasure.failure.code,
      "command.range-endpoint-not-found",
    );
  }

  const missingVoice = bus.submit(
    deleteRange({
      kind: "voice-event-range",
      start: {
        kind: "voice-event",
        voiceId: "cvn4-voice-a-1-primary",
        eventId: "cvn4-event-a-1-notes",
      },
      end: {
        kind: "voice-event",
        voiceId: "missing-voice",
        eventId: "missing-event",
      },
    }),
  );
  assert.equal(missingVoice.status, "rejected");
  if (missingVoice.status === "rejected") {
    assert.equal(
      missingVoice.failure.code,
      "command.range-endpoint-not-found",
    );
  }

  const missingEvent = bus.submit(
    deleteRange({
      kind: "voice-event-range",
      start: {
        kind: "voice-event",
        voiceId: "cvn4-voice-a-1-primary",
        eventId: "cvn4-event-a-1-notes",
      },
      end: {
        kind: "voice-event",
        voiceId: "cvn4-voice-a-1-primary",
        eventId: "missing-event",
      },
    }),
  );
  assert.equal(missingEvent.status, "rejected");
  if (missingEvent.status === "rejected") {
    assert.equal(
      missingEvent.failure.code,
      "command.range-endpoint-not-found",
    );
  }

  const existingOtherVoiceWithMissingEvent = bus.submit(
    deleteRange({
      kind: "voice-event-range",
      start: {
        kind: "voice-event",
        voiceId: "cvn4-voice-a-1-primary",
        eventId: "cvn4-event-a-1-notes",
      },
      end: {
        kind: "voice-event",
        voiceId: "cvn4-part-b-cvn4-measure-1-voice",
        eventId: "missing-event",
      },
    }),
  );
  assert.equal(existingOtherVoiceWithMissingEvent.status, "rejected");
  if (existingOtherVoiceWithMissingEvent.status === "rejected") {
    assert.equal(
      existingOtherVoiceWithMissingEvent.failure.code,
      "command.range-endpoint-not-found",
    );
  }

  const owner = bus.submit(
    deleteRange({
      kind: "voice-event-range",
      start: {
        kind: "voice-event",
        voiceId: "cvn4-voice-a-1-primary",
        eventId: "cvn4-event-a-1-notes",
      },
      end: {
        kind: "voice-event",
        voiceId: "cvn4-part-b-cvn4-measure-1-voice",
        eventId: "cvn4-part-b-cvn4-measure-1-voice-event",
      },
    }),
  );
  assert.equal(owner.status, "rejected");
  if (owner.status === "rejected") {
    assert.equal(owner.failure.code, "command.range-owner-mismatch");
  }
});

test("deleting every measure is rejected by final semantics without state drift", () => {
  const bus = requireBus();
  const before = bus.read();
  const result = bus.submit(
    deleteRange({
      kind: "measure-range",
      start: { kind: "measure", measureId: "cvn4-measure-1" },
      end: { kind: "measure", measureId: "cvn4-measure-3" },
    }),
  );

  assert.equal(result.status, "rejected");
  if (result.status === "rejected") {
    assert.equal(result.failure.code, "command.semantic-invalid");
    if (result.failure.code === "command.semantic-invalid") {
      assert.equal(
        result.failure.diagnostics.some(
          ({ code }) => code === "semantic.measure-required",
        ),
        true,
      );
    }
    assert.equal(result.documentVersion, 0);
    assert.equal(result.undoDepth, 0);
    assert.equal(result.redoDepth, 0);
  }
  assert.deepEqual(bus.read(), before);
});

test("an event-empty Part-measure selection is a no-op", () => {
  const fixture = cloneCvn4ScoreFixture();
  const content = fixture.parts
    .find(({ id }) => id === "cvn4-part-a")
    ?.measureContents.find(({ measureId }) => measureId === "cvn4-measure-3");
  assert.notEqual(content, undefined);
  if (content === undefined) {
    assert.fail("expected Part A measure 3 content");
  }
  for (const voice of content.voices) {
    (voice.sequence.events as RhythmicEvent[]).splice(
      0,
      voice.sequence.events.length,
    );
  }
  const bus = requireBus(fixture);
  const before = bus.read();
  const result = bus.submit(
    deleteRange({
      kind: "part-measure-range",
      start: {
        kind: "part-measure",
        partId: "cvn4-part-a",
        measureId: "cvn4-measure-3",
      },
      end: {
        kind: "part-measure",
        partId: "cvn4-part-a",
        measureId: "cvn4-measure-3",
      },
    }),
  );

  assert.equal(result.status, "no-op");
  assert.equal(result.documentVersion, 0);
  assert.deepEqual(bus.read(), before);
});
