import assert = require("node:assert/strict");
import { test } from "node:test";

import {
  CommandBus,
  type KernelEvent,
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

function transposeRange(range: unknown, transposition: unknown): unknown {
  return {
    commandVersion: 1,
    commandId: "core.range.transpose-written-pitch",
    target: { kind: "document", documentId: "cvn4-score" },
    payload: { range, transposition },
  };
}

test("range transpose skips rests, transforms notes, and reports the first invalid note", () => {
  const bus = requireBus();
  const events: KernelEvent[] = [];
  bus.subscribe((event: KernelEvent) => events.push(event));
  const beforeExtensions = structuredClone(readDocument(bus).extensions);
  const range = {
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
  };
  const changed = bus.submit(
    transposeRange(range, { diatonicSteps: 1, chromaticSemitones: 2 }),
  );
  assert.equal(changed.status, "committed");
  const pitch = readDocument(bus).parts[0]?.measureContents[0]?.voices[0]
    ?.sequence.events[0]?.content;
  assert.equal(pitch?.kind, "notes");
  if (pitch?.kind === "notes") {
    assert.deepEqual(pitch.notes[0]?.writtenPitch, {
      step: "D",
      alter: 0,
      octave: 4,
    });
  }
  const committed = events.find(
    (event): event is Extract<
      KernelEvent,
      { readonly eventType: "core.document.committed" }
    > => event.eventType === "core.document.committed",
  );
  assert.deepEqual(committed?.affectedEntities, [
    { kind: "note", noteId: "cvn4-note-a-1" },
  ]);
  assert.deepEqual(readDocument(bus).extensions, beforeExtensions);
  assert.deepEqual(
    readDocument(bus).parts[0]?.instrument.writtenToSounding,
    { diatonicSteps: 0, chromaticSemitones: 0 },
  );
  assert.equal(bus.undo().status, "committed");

  const beforeFailure = structuredClone(readDocument(bus));
  const rejected = bus.submit(
    transposeRange(range, { diatonicSteps: 0, chromaticSemitones: 3 }),
  );
  assert.equal(rejected.status, "rejected");
  if (rejected.status === "rejected") {
    assert.deepEqual(rejected.failure, {
      code: "command.range-transform-invalid",
      address: { kind: "note", noteId: "cvn4-note-a-1" },
      reason: "derived-pitch-alter-out-of-range",
    });
  }
  assert.deepEqual(readDocument(bus), beforeFailure);
});

test("measure and Part-measure transposition use canonical normalized selection", () => {
  const cases = [
    {
      kind: "measure-range",
      start: { kind: "measure", measureId: "cvn4-measure-1" },
      end: { kind: "measure", measureId: "cvn4-measure-1" },
    },
    {
      kind: "part-measure-range",
      start: {
        kind: "part-measure",
        partId: "cvn4-part-a",
        measureId: "cvn4-measure-1",
      },
      end: {
        kind: "part-measure",
        partId: "cvn4-part-a",
        measureId: "cvn4-measure-1",
      },
    },
  ] as const;

  for (const range of cases) {
    const bus = requireBus();
    const result = bus.submit(
      transposeRange(range, { diatonicSteps: 1, chromaticSemitones: 2 }),
    );
    assert.equal(result.status, "committed");
    const content = readDocument(bus).parts[0]?.measureContents[0]?.voices[0]
      ?.sequence.events[0]?.content;
    assert.equal(content?.kind, "notes");
    if (content?.kind === "notes") {
      assert.deepEqual(content.notes[0]?.writtenPitch, {
        step: "D",
        alter: 0,
        octave: 4,
      });
    }
  }
});

test("zero range transposition is a no-op", () => {
  const bus = requireBus();
  const noOp = bus.submit(
    transposeRange(
      {
        kind: "measure-range",
        start: { kind: "measure", measureId: "cvn4-measure-1" },
        end: { kind: "measure", measureId: "cvn4-measure-3" },
      },
      { diatonicSteps: 0, chromaticSemitones: 0 },
    ),
  );
  assert.equal(noOp.status, "no-op");
  assert.equal(noOp.documentVersion, 0);
});

test("a nonzero transposition over rests only is a no-op", () => {
  const bus = requireBus();
  const before = bus.read();
  const result = bus.submit(
    transposeRange(
      {
        kind: "measure-range",
        start: { kind: "measure", measureId: "cvn4-measure-2" },
        end: { kind: "measure", measureId: "cvn4-measure-3" },
      },
      { diatonicSteps: 1, chromaticSemitones: 2 },
    ),
  );
  assert.equal(result.status, "no-op");
  assert.equal(result.documentVersion, 0);
  assert.deepEqual(bus.read(), before);
});
