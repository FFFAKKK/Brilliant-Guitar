import { test } from "node:test";
import assert = require("node:assert/strict");

import type {
  DocumentSnapshot,
  ScoreAddress,
  ScoreDocument,
  ScorePoint,
  ScoreRange,
} from "../../src/core-kernel/index";
import {
  CommandBus,
  selectScoreRange,
} from "../../src/core-kernel/index";
import {
  decodePersistedCheckpoint,
  decodeScoreAddress,
  decodeScorePoint,
  decodeScoreRange,
} from "../../src/core-kernel/read/address-codec";
import { cloneCoreScoreFixture } from "./fixtures/core-score";

function createRangeSnapshot(): DocumentSnapshot {
  const document = cloneCoreScoreFixture();
  const secondMeasure = {
    id: "measure-2",
    meter: { numerator: 4, denominator: 4 as const },
  };
  (document.measureDefinitions as unknown[]).push(secondMeasure);

  const part = document.parts[0]!;
  const firstContent = part.measureContents[0]!;
  const secondContent = structuredClone(firstContent);
  (secondContent as { measureId: string }).measureId = "measure-2";
  const secondVoice = secondContent.voices[0]!;
  (secondVoice as { id: string }).id = "voice-2";
  secondVoice.sequence.events.forEach((event, index) => {
    (event as { id: string }).id = `event-${index + 5}`;
    if (event.content.kind === "notes") {
      (event.content.notes[0] as { id: string }).id = "note-2";
    }
  });
  (part as unknown as { measureContents: unknown[] }).measureContents = [
    secondContent,
    firstContent,
  ];

  const created = CommandBus.create(document as ScoreDocument);
  assert.equal(created.ok, true);
  if (!created.ok) {
    throw new Error("expected valid range fixture");
  }
  const read = created.value.read();
  assert.equal(read.ok, true);
  if (!read.ok) {
    throw new Error("expected range fixture snapshot");
  }
  return read.value.snapshot;
}

test("public score address, point, and range contracts use stable identities", () => {
  const address: ScoreAddress = { kind: "note", noteId: "note-1" };
  const points: readonly ScorePoint[] = [
    { kind: "measure", measureId: "measure-1" },
    {
      kind: "part-measure",
      partId: "part-1",
      measureId: "measure-1",
    },
    {
      kind: "voice-event",
      voiceId: "voice-1",
      eventId: "event-1",
    },
  ];
  const range: ScoreRange = {
    kind: "voice-event-range",
    start: points[2] as Extract<
      ScorePoint,
      { readonly kind: "voice-event" }
    >,
    end: {
      kind: "voice-event",
      voiceId: "voice-1",
      eventId: "event-4",
    },
  };

  assert.equal(address.kind, "note");
  assert.equal(range.kind, "voice-event-range");
});

test("strict address decoding accepts every stable entity kind", () => {
  const addresses: readonly ScoreAddress[] = [
    { kind: "document", documentId: "score-1" },
    { kind: "measure", measureId: "measure-1" },
    { kind: "part", partId: "part-1" },
    { kind: "staff", staffId: "staff-1" },
    { kind: "voice", voiceId: "voice-1" },
    { kind: "event", eventId: "event-1" },
    { kind: "note", noteId: "note-1" },
  ];

  for (const address of addresses) {
    assert.deepEqual(decodeScoreAddress(address), {
      ok: true,
      value: address,
    });
  }
});

test("strict point, range, and checkpoint decoding returns detached exact values", () => {
  const points: readonly ScorePoint[] = [
    { kind: "measure", measureId: "measure-1" },
    {
      kind: "part-measure",
      partId: "part-1",
      measureId: "measure-1",
    },
    {
      kind: "voice-event",
      voiceId: "voice-1",
      eventId: "event-1",
    },
  ];
  for (const point of points) {
    const decoded = decodeScorePoint(point);
    assert.deepEqual(decoded, { ok: true, value: point });
    assert.notStrictEqual(decoded.ok && decoded.value, point);
  }

  const range = {
    kind: "voice-event-range",
    start: {
      kind: "voice-event",
      voiceId: "voice-1",
      eventId: "event-1",
    },
    end: {
      kind: "voice-event",
      voiceId: "voice-2",
      eventId: "event-2",
    },
  } as const;
  assert.deepEqual(decodeScoreRange(range), { ok: true, value: range });
  assert.deepEqual(
    decodePersistedCheckpoint({
      documentId: "score-1",
      documentVersion: 4,
    }),
    {
      ok: true,
      value: { documentId: "score-1", documentVersion: 4 },
    },
  );
});

test("strict address decoders reject obsolete, extra, empty, and mismatched shapes", () => {
  const invalidRanges: readonly unknown[] = [
    { trackId: "track-1", beatId: "beat-1" },
    { kind: "measure", measureId: "measure-1", index: 0 },
    {
      kind: "voice-event",
      voiceId: "",
      eventId: "event-1",
    },
    {
      kind: "voice-event-range",
      start: { kind: "measure", measureId: "measure-1" },
      end: { kind: "measure", measureId: "measure-2" },
    },
    {
      kind: "measure-range",
      start: { kind: "measure", measureId: "measure-1", tick: 0 },
      end: { kind: "measure", measureId: "measure-2" },
    },
  ];
  for (const input of invalidRanges) {
    assert.deepEqual(decodeScoreRange(input), { ok: false });
  }

  assert.deepEqual(
    decodeScoreAddress({ kind: "note", noteId: "note-1", path: "/notes/0" }),
    { ok: false },
  );
  assert.deepEqual(
    decodePersistedCheckpoint({ documentId: "score-1", documentVersion: -1 }),
    { ok: false },
  );
});

test("strict address decoding never invokes getters or proxy property reads", () => {
  let getterCalls = 0;
  const accessor = Object.create(null) as Record<string, unknown>;
  Object.defineProperties(accessor, {
    kind: {
      enumerable: true,
      get() {
        getterCalls += 1;
        return "note";
      },
    },
    noteId: { enumerable: true, value: "note-1" },
  });
  assert.deepEqual(decodeScoreAddress(accessor), { ok: false });
  assert.equal(getterCalls, 0);

  let proxyReads = 0;
  const proxied = new Proxy(
    { kind: "note", noteId: "note-1" },
    {
      get() {
        proxyReads += 1;
        throw new Error("property read must not run");
      },
    },
  );
  assert.deepEqual(decodeScoreAddress(proxied), {
    ok: true,
    value: { kind: "note", noteId: "note-1" },
  });
  assert.equal(proxyReads, 0);
});

test("hierarchical ranges normalize reverse endpoints in musical order", () => {
  const snapshot = createRangeSnapshot();

  const measures = selectScoreRange(snapshot, {
    kind: "measure-range",
    start: { kind: "measure", measureId: "measure-2" },
    end: { kind: "measure", measureId: "measure-1" },
  });
  assert.equal(measures.ok, true);
  if (measures.ok && measures.value.kind === "measure-range") {
    assert.deepEqual(
      measures.value.measures.map(({ id }) => id),
      ["measure-1", "measure-2"],
    );
    assert.equal(measures.value.normalized.start.measureId, "measure-1");
    assert.equal(Object.isFrozen(measures.value), true);
  }

  const contents = selectScoreRange(snapshot, {
    kind: "part-measure-range",
    start: {
      kind: "part-measure",
      partId: "part-1",
      measureId: "measure-2",
    },
    end: {
      kind: "part-measure",
      partId: "part-1",
      measureId: "measure-1",
    },
  });
  assert.equal(contents.ok, true);
  if (contents.ok && contents.value.kind === "part-measure-range") {
    assert.deepEqual(
      contents.value.measureContents.map(({ measureId }) => measureId),
      ["measure-1", "measure-2"],
    );
    assert.equal(contents.value.normalized.start.measureId, "measure-1");
  }

  const events = selectScoreRange(snapshot, {
    kind: "voice-event-range",
    start: { kind: "voice-event", voiceId: "voice-1", eventId: "event-4" },
    end: { kind: "voice-event", voiceId: "voice-1", eventId: "event-1" },
  });
  assert.equal(events.ok, true);
  if (events.ok && events.value.kind === "voice-event-range") {
    assert.deepEqual(
      events.value.events.map(({ id }) => id),
      ["event-1", "event-2", "event-3", "event-4"],
    );
    assert.equal(events.value.normalized.start.eventId, "event-1");
  }
});

test("range selection rejects malformed, missing, and owner-mismatched endpoints", () => {
  const snapshot = createRangeSnapshot();

  assert.deepEqual(
    selectScoreRange(snapshot, {
      kind: "measure-range",
      start: { kind: "measure", measureId: "measure-1" },
      end: { kind: "voice-event", voiceId: "voice-1", eventId: "event-1" },
    }),
    { ok: false, failure: { code: "read.invalid-range" } },
  );
  assert.deepEqual(
    selectScoreRange(snapshot, {
      kind: "measure-range",
      start: { kind: "measure", measureId: "measure-1" },
      end: { kind: "measure", measureId: "missing" },
    }),
    { ok: false, failure: { code: "read.range-endpoint-not-found" } },
  );
  assert.deepEqual(
    selectScoreRange(snapshot, {
      kind: "part-measure-range",
      start: {
        kind: "part-measure",
        partId: "part-1",
        measureId: "measure-1",
      },
      end: {
        kind: "part-measure",
        partId: "part-2",
        measureId: "measure-2",
      },
    }),
    { ok: false, failure: { code: "read.range-owner-mismatch" } },
  );
  assert.deepEqual(
    selectScoreRange(snapshot, {
      kind: "voice-event-range",
      start: { kind: "voice-event", voiceId: "voice-1", eventId: "event-1" },
      end: { kind: "voice-event", voiceId: "voice-2", eventId: "event-5" },
    }),
    { ok: false, failure: { code: "read.range-owner-mismatch" } },
  );
  assert.deepEqual(
    selectScoreRange(snapshot, {
      kind: "voice-event-range",
      start: { kind: "voice-event", voiceId: "voice-1", eventId: "event-1" },
      end: { kind: "voice-event", voiceId: "voice-1", eventId: "event-5" },
    }),
    { ok: false, failure: { code: "read.range-owner-mismatch" } },
  );
});
