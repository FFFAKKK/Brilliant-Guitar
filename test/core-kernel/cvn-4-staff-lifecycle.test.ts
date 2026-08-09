import assert = require("node:assert/strict");
import { test } from "node:test";

import { mapCommandFailureToKernelIssues } from "../../src/core-kernel/index";

import {
  insertStaffCommand,
  readDocument,
  removeStaffCommand,
  requireBus,
  setEventStaffAssignmentCommand,
  setStaffDefinitionCommand,
  setVoiceDefaultStaffCommand,
  staffOrder,
  moveStaffCommand,
} from "./fixtures/cvn-4-command-helpers";
import { cloneCvn4ScoreFixture } from "./fixtures/cvn-4-score";

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

test("Staff insert adds only the requested Staff and leaves Voices and assignments untouched", () => {
  const bus = requireBus(cloneCvn4ScoreFixture());
  const before = structuredClone(readDocument(bus));
  const result = bus.submit(
    insertStaffCommand(
      "cvn4-part-a",
      { kind: "after-staff", staffId: "cvn4-staff-a-1" },
      {
        id: "cvn4-staff-a-inserted",
        lineCount: 1,
        defaultClef: { sign: "C", line: 3 },
      },
    ),
  );

  assert.equal(result.status, "committed");
  assert.deepEqual(staffOrder(readDocument(bus), "cvn4-part-a"), [
    "cvn4-staff-a-1",
    "cvn4-staff-a-inserted",
    "cvn4-staff-a-2",
  ]);
  const afterPart = readDocument(bus).parts.find((part) => part.id === "cvn4-part-a");
  const beforePart = before.parts.find((part) => part.id === "cvn4-part-a");
  assert.deepEqual(
    afterPart?.measureContents,
    beforePart?.measureContents,
  );

  const beforeDuplicate = structuredClone(readDocument(bus));
  assertRejectedCode(
    bus.submit(
      insertStaffCommand("cvn4-part-a", { kind: "start" }, {
        id: "cvn4-staff-a-1",
        lineCount: 5,
        defaultClef: { sign: "G", line: 2 },
      }),
    ),
    "command.semantic-invalid",
  );
  assert.deepEqual(readDocument(bus), beforeDuplicate);
});

test("Staff removal rejects live default and explicit references without leaking them", () => {
  const eventReferenceBus = requireBus(cloneCvn4ScoreFixture());
  const beforeEventConflict = structuredClone(readDocument(eventReferenceBus));
  const eventConflict = eventReferenceBus.submit(removeStaffCommand("cvn4-staff-a-2"));
  assertRejectedCode(eventConflict, "command.reference-conflict");
  assert.deepEqual(eventConflict.status === "rejected" && eventConflict.failure, {
    code: "command.reference-conflict",
  });
  assert.deepEqual(readDocument(eventReferenceBus), beforeEventConflict);
  if (eventConflict.status !== "rejected") {
    assert.fail("expected Staff reference conflict");
  }
  const issues = mapCommandFailureToKernelIssues(eventConflict.failure);
  assert.deepEqual(
    issues.map(({ code, details, location }) => ({ code, details, location })),
    [{ code: "command.reference-conflict", details: undefined, location: undefined }],
  );
  assert.equal(Object.isFrozen(issues), true);
  assert.equal(Object.isFrozen(issues[0]!), true);
  assert.equal(JSON.stringify(issues).includes("cvn4-staff-a-2"), false);

  const defaultReferenceBus = requireBus(cloneCvn4ScoreFixture());
  assert.equal(
    defaultReferenceBus.submit(
      setEventStaffAssignmentCommand("cvn4-event-a-1-notes", {
        kind: "inherit-default",
      }),
    ).status,
    "committed",
  );
  assert.equal(
    defaultReferenceBus.submit(
      setVoiceDefaultStaffCommand("cvn4-voice-a-1-primary", "cvn4-staff-a-2"),
    ).status,
    "committed",
  );
  const beforeDefaultConflict = structuredClone(readDocument(defaultReferenceBus));
  assertRejectedCode(
    defaultReferenceBus.submit(removeStaffCommand("cvn4-staff-a-2")),
    "command.reference-conflict",
  );
  assert.deepEqual(readDocument(defaultReferenceBus), beforeDefaultConflict);
});

test("Explicit reassignment unlocks Staff removal and undo restores each command independently", () => {
  const bus = requireBus(cloneCvn4ScoreFixture());
  const before = structuredClone(readDocument(bus));
  assert.equal(
    bus.submit(
      setEventStaffAssignmentCommand("cvn4-event-a-1-notes", {
        kind: "inherit-default",
      }),
    ).status,
    "committed",
  );
  const afterAssignment = structuredClone(readDocument(bus));
  const removed = bus.submit(removeStaffCommand("cvn4-staff-a-2"));
  assert.equal(removed.status, "committed");
  assert.deepEqual(staffOrder(readDocument(bus), "cvn4-part-a"), ["cvn4-staff-a-1"]);

  assert.equal(bus.undo().status, "committed");
  assert.deepEqual(readDocument(bus), afterAssignment);
  assert.equal(bus.undo().status, "committed");
  assert.deepEqual(readDocument(bus), before);
});

test("Staff move distinguishes owner-local anchors and definition replacement remains atomic", () => {
  const bus = requireBus(cloneCvn4ScoreFixture());
  assertRejectedCode(
    bus.submit(
      moveStaffCommand("cvn4-staff-a-1", {
        kind: "after-staff",
        staffId: "cvn4-staff-b-1",
      }),
    ),
    "command.anchor-wrong-owner",
  );
  assertRejectedCode(
    bus.submit(
      moveStaffCommand("cvn4-staff-a-1", {
        kind: "after-staff",
        staffId: "cvn4-staff-a-1",
      }),
    ),
    "command.anchor-self-reference",
  );
  assertRejectedCode(
    bus.submit(
      moveStaffCommand("cvn4-staff-a-1", {
        kind: "after-staff",
        staffId: "cvn4-missing-staff",
      }),
    ),
    "command.anchor-not-found",
  );
  assert.equal(
    bus.submit(moveStaffCommand("cvn4-staff-a-2", { kind: "start" })).status,
    "committed",
  );
  assert.deepEqual(staffOrder(readDocument(bus), "cvn4-part-a"), [
    "cvn4-staff-a-2",
    "cvn4-staff-a-1",
  ]);

  assert.equal(
    bus.submit(
      setStaffDefinitionCommand("cvn4-staff-a-1", 1, { sign: "C", line: 3 }),
    ).status,
    "committed",
  );
  assert.equal(
    bus.submit(
      setStaffDefinitionCommand("cvn4-staff-a-1", 1, { sign: "C", line: 3 }),
    ).status,
    "no-op",
  );
  const beforeInvalid = structuredClone(readDocument(bus));
  const invalid = bus.submit(
    setStaffDefinitionCommand("cvn4-staff-a-1", 0, { sign: "C", line: 3 }),
  );
  assertRejectedCode(invalid, "command.semantic-invalid");
  assert.deepEqual(readDocument(bus), beforeInvalid);
});
