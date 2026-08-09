import assert = require("node:assert/strict");
import { test } from "node:test";

import {
  collectEvents,
  committedEvents,
  insertVoiceCommand,
  moveVoiceCommand,
  readDocument,
  removeVoiceCommand,
  requireBus,
  setEventStaffAssignmentCommand,
  setVoiceDefaultStaffCommand,
  setVoiceSequenceStartCommand,
  voiceOrder,
} from "./fixtures/cvn-4-command-helpers";
import {
  cloneCvn4ScoreFixture,
  createCvn4InsertedVoice,
} from "./fixtures/cvn-4-score";

function assertRejectedCode(
  result: ReturnType<ReturnType<typeof requireBus>["submit"]>,
  code: string,
): void {
  assert.equal(result.status, "rejected");
  if (result.status !== "rejected") {
    assert.fail("expected rejected CVN-4 command");
  }
  assert.equal(result.failure.code, code);
}

test("Voice insert resolves Part plus Measure content and preserves unrelated contents", () => {
  const bus = requireBus(cloneCvn4ScoreFixture());
  const beforeOtherContent = structuredClone(
    readDocument(bus).parts.find((part) => part.id === "cvn4-part-a")?.measureContents[1],
  );
  const inserted = bus.submit(
    insertVoiceCommand(
      "cvn4-part-a",
      "cvn4-measure-1",
      { kind: "after-voice", voiceId: "cvn4-voice-a-1-primary" },
      createCvn4InsertedVoice(),
    ),
  );

  assert.equal(inserted.status, "committed");
  assert.deepEqual(
    voiceOrder(readDocument(bus), "cvn4-part-a", "cvn4-measure-1"),
    [
      "cvn4-voice-a-1-primary",
      "cvn4-voice-inserted",
      "cvn4-voice-a-1-secondary",
    ],
  );
  assert.deepEqual(
    readDocument(bus).parts.find((part) => part.id === "cvn4-part-a")
      ?.measureContents[1],
    beforeOtherContent,
  );

  assertRejectedCode(
    bus.submit(
      insertVoiceCommand(
        "cvn4-part-a",
        "cvn4-missing-measure",
        { kind: "start" },
        createCvn4InsertedVoice("cvn4-voice-missing-measure"),
      ),
    ),
    "command.target-not-found",
  );
  assertRejectedCode(
    bus.submit(
      insertVoiceCommand(
        "cvn4-part-a",
        "cvn4-measure-1",
        { kind: "after-voice", voiceId: "cvn4-a-cvn4-measure-2" },
        createCvn4InsertedVoice("cvn4-voice-wrong-owner"),
      ),
    ),
    "command.anchor-wrong-owner",
  );

  const beforeSemanticFailures = structuredClone(readDocument(bus));
  assertRejectedCode(
    bus.submit(
      insertVoiceCommand(
        "cvn4-part-a",
        "cvn4-measure-1",
        { kind: "start" },
        createCvn4InsertedVoice("cvn4-voice-a-1-primary"),
      ),
    ),
    "command.semantic-invalid",
  );
  assert.deepEqual(readDocument(bus), beforeSemanticFailures);

  assertRejectedCode(
    bus.submit(
      insertVoiceCommand(
        "cvn4-part-a",
        "cvn4-measure-1",
        { kind: "start" },
        createCvn4InsertedVoice("cvn4-voice-wrong-staff", "cvn4-staff-b-1"),
      ),
    ),
    "command.semantic-invalid",
  );
  assert.deepEqual(readDocument(bus), beforeSemanticFailures);

  const invalidSequence = createCvn4InsertedVoice("cvn4-voice-invalid-sequence");
  (invalidSequence.sequence as {
    start: { numerator: number; denominator: number };
  }).start = { numerator: 1, denominator: 1 };
  assertRejectedCode(
    bus.submit(
      insertVoiceCommand(
        "cvn4-part-a",
        "cvn4-measure-1",
        { kind: "start" },
        invalidSequence,
      ),
    ),
    "command.semantic-invalid",
  );
  assert.deepEqual(readDocument(bus), beforeSemanticFailures);
});

test("Voice removal owns Event and Note descendants, exact undo, and final-Voice rejection", () => {
  const bus = requireBus(cloneCvn4ScoreFixture());
  const events = collectEvents(bus);
  const before = structuredClone(readDocument(bus));
  const removed = bus.submit(removeVoiceCommand("cvn4-voice-a-1-primary"));
  assert.equal(removed.status, "committed");
  const expectedAffectedEntities = [
    { kind: "voice", voiceId: "cvn4-voice-a-1-primary" },
    { kind: "part", partId: "cvn4-part-a" },
    { kind: "event", eventId: "cvn4-event-a-1-notes" },
    { kind: "note", noteId: "cvn4-note-a-1" },
    { kind: "event", eventId: "cvn4-event-a-1-rest" },
  ] as const;
  assert.deepEqual(
    committedEvents(events)[0]?.affectedEntities,
    expectedAffectedEntities,
  );
  const afterRemove = readDocument(bus);
  assert.deepEqual(
    voiceOrder(afterRemove, "cvn4-part-a", "cvn4-measure-1"),
    ["cvn4-voice-a-1-secondary"],
  );
  assert.equal(JSON.stringify(afterRemove).includes("cvn4-event-a-1-notes"), false);
  assert.equal(JSON.stringify(afterRemove).includes("cvn4-note-a-1"), false);
  assert.equal(bus.undo().status, "committed");
  assert.deepEqual(readDocument(bus), before);
  assert.equal(bus.redo().status, "committed");
  assert.deepEqual(
    committedEvents(events).map((event) => event.affectedEntities),
    [
      expectedAffectedEntities,
      expectedAffectedEntities,
      expectedAffectedEntities,
    ],
  );

  const finalVoiceBus = requireBus(cloneCvn4ScoreFixture());
  const beforeFinal = structuredClone(readDocument(finalVoiceBus));
  const finalRemoval = finalVoiceBus.submit(
    removeVoiceCommand("cvn4-part-b-cvn4-measure-1-voice"),
  );
  assertRejectedCode(finalRemoval, "command.semantic-invalid");
  assert.deepEqual(readDocument(finalVoiceBus), beforeFinal);
});

test("Voice move enforces content ownership and has an exact no-op", () => {
  const bus = requireBus(cloneCvn4ScoreFixture());
  assertRejectedCode(
    bus.submit(
      moveVoiceCommand("cvn4-voice-a-1-primary", {
        kind: "after-voice",
        voiceId: "cvn4-a-cvn4-measure-2",
      }),
    ),
    "command.anchor-wrong-owner",
  );
  assertRejectedCode(
    bus.submit(
      moveVoiceCommand("cvn4-voice-a-1-primary", {
        kind: "after-voice",
        voiceId: "cvn4-voice-a-1-primary",
      }),
    ),
    "command.anchor-self-reference",
  );
  assertRejectedCode(
    bus.submit(
      moveVoiceCommand("cvn4-voice-a-1-primary", {
        kind: "after-voice",
        voiceId: "cvn4-missing-voice",
      }),
    ),
    "command.anchor-not-found",
  );
  assert.equal(
    bus.submit(moveVoiceCommand("cvn4-voice-a-1-secondary", { kind: "start" })).status,
    "committed",
  );
  assert.deepEqual(
    voiceOrder(readDocument(bus), "cvn4-part-a", "cvn4-measure-1"),
    ["cvn4-voice-a-1-secondary", "cvn4-voice-a-1-primary"],
  );
  assert.equal(
    bus.submit(
      moveVoiceCommand("cvn4-voice-a-1-secondary", { kind: "start" }),
    ).status,
    "no-op",
  );
});

test("Voice and Event staff replacements preserve semantic and support separation", () => {
  const bus = requireBus(cloneCvn4ScoreFixture());
  const beforeDefaultFailure = structuredClone(readDocument(bus));
  assertRejectedCode(
    bus.submit(
      setVoiceDefaultStaffCommand("cvn4-voice-a-1-primary", "cvn4-staff-b-1"),
    ),
    "command.semantic-invalid",
  );
  assert.deepEqual(readDocument(bus), beforeDefaultFailure);
  assert.equal(
    bus.submit(
      setVoiceDefaultStaffCommand("cvn4-voice-a-1-primary", "cvn4-staff-a-2"),
    ).status,
    "committed",
  );
  assert.equal(
    bus.submit(
      setVoiceDefaultStaffCommand("cvn4-voice-a-1-primary", "cvn4-staff-a-2"),
    ).status,
    "no-op",
  );

  const sequence = bus.submit(
    setVoiceSequenceStartCommand("cvn4-voice-a-1-primary", {
      numerator: 1,
      denominator: 4,
    }),
  );
  assert.equal(sequence.status, "committed");
  assert.equal(sequence.status === "committed" && sequence.support.status, "unsupported");
  assert.equal(
    bus.submit(
      setVoiceSequenceStartCommand("cvn4-voice-a-1-primary", {
        numerator: 1,
        denominator: 4,
      }),
    ).status,
    "no-op",
  );
  assertRejectedCode(
    bus.submit(
      setVoiceSequenceStartCommand("cvn4-voice-a-1-primary", {
        numerator: 2,
        denominator: 8,
      }),
    ),
    "command.semantic-invalid",
  );
  assertRejectedCode(
    bus.submit(
      setVoiceSequenceStartCommand("cvn4-voice-a-1-primary", {
        numerator: -1,
        denominator: 1,
      }),
    ),
    "command.semantic-invalid",
  );

  const beforeEquivalentEventAssignment = structuredClone(readDocument(bus));
  assert.equal(
    bus.submit(
      setEventStaffAssignmentCommand("cvn4-event-a-1-notes", {
        kind: "inherit-default",
      }),
    ).status,
    "no-op",
  );
  assert.deepEqual(readDocument(bus), beforeEquivalentEventAssignment);

  const inheritingBus = requireBus(cloneCvn4ScoreFixture());
  assert.equal(
    inheritingBus.submit(
      setEventStaffAssignmentCommand("cvn4-event-a-1-notes", {
        kind: "inherit-default",
      }),
    ).status,
    "committed",
  );
  const inheritedEvent = inheritingBus.read();
  assert.equal(inheritedEvent.ok, true);
  assert.equal(
    inheritedEvent.ok && inheritedEvent.value.snapshot.document.parts[0]
      ?.measureContents[0]?.voices[0]?.sequence.events[0]?.staffId,
    undefined,
  );
  assert.equal(
    inheritingBus.submit(
      setEventStaffAssignmentCommand("cvn4-event-a-1-notes", {
        kind: "staff",
        staffId: "cvn4-staff-a-2",
      }),
    ).status,
    "committed",
  );
  assert.equal(
    inheritingBus.submit(
      setEventStaffAssignmentCommand("cvn4-event-a-1-notes", {
        kind: "staff",
        staffId: "cvn4-staff-a-2",
      }),
    ).status,
    "no-op",
  );
  assertRejectedCode(
    bus.submit(
      setEventStaffAssignmentCommand("cvn4-event-a-1-notes", {
        kind: "staff",
        staffId: "cvn4-staff-b-1",
      }),
    ),
    "command.semantic-invalid",
  );
});
