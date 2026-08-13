import assert = require("node:assert/strict");
import { test } from "node:test";

import {
  CommandBus,
  type KernelEvent,
  type WrittenPitch,
} from "../../src/core-kernel/index";
import {
  CVN7_C4,
  CVN7_D4,
  createCvn7RepresentativeHistoryWorkload,
  createRepresentativeCvn7Score,
} from "./fixtures/cvn-7-qualification-score";

function pitchCommand(
  noteId: string,
  pitch: WrittenPitch,
): unknown {
  return {
    commandVersion: 1,
    commandId: "core.note.set-written-pitch",
    target: { kind: "note", noteId },
    payload: { writtenPitch: pitch },
  };
}

function requireRead(bus: CommandBus) {
  const result = bus.read();
  assert.equal(result.ok, true);
  if (!result.ok) assert.fail("representative history read must succeed");
  return result.value;
}

function firstPitch(bus: CommandBus): WrittenPitch {
  const event = requireRead(bus).snapshot.document.parts[0]
    ?.measureContents[0]?.voices[0]?.sequence.events[0];
  assert.equal(event?.content.kind, "notes");
  if (event?.content.kind !== "notes") assert.fail("first event must contain notes");
  const pitch = event.content.notes[0]?.writtenPitch;
  assert.notEqual(pitch, undefined);
  return pitch ?? CVN7_C4;
}

test("representative history workload fixes two thousand entries and bounded session semantics", () => {
  const fixture = createRepresentativeCvn7Score();
  const workload = createCvn7RepresentativeHistoryWorkload(fixture);
  const repeated = createCvn7RepresentativeHistoryWorkload(
    createRepresentativeCvn7Score(),
  );
  assert.equal(workload.length, 2_000);
  assert.deepEqual(repeated, workload);
  assert.equal(Object.isFrozen(workload), true);
  assert.deepEqual(
    workload.map((input) =>
      (input as { payload: { writtenPitch: WrittenPitch } }).payload.writtenPitch.step,
    ),
    Array.from({ length: 2_000 }, (_, index) => index % 2 === 0 ? "D" : "C"),
  );
  assert.equal(workload.every((input) =>
    (input as { target: { noteId: string } }).target.noteId === fixture.firstNote.noteId,
  ), true);

  const created = CommandBus.create(fixture.document);
  assert.equal(created.ok, true);
  if (!created.ok) assert.fail("representative history bus must construct");
  const bus = created.value;
  const events: KernelEvent[] = [];
  assert.equal(bus.subscribe((event: KernelEvent) => events.push(event)).status, "subscribed");

  const boundedExecutionCount = 8;
  for (let index = 0; index < boundedExecutionCount; index += 1) {
    const result = bus.submit(workload[index]);
    assert.equal(result.status, "committed", `history entry ${index}`);
    assert.equal(result.documentVersion, index + 1, `history version ${index}`);
    assert.equal(result.undoDepth, index + 1, `history depth ${index}`);
    assert.equal(result.redoDepth, 0, `history redo ${index}`);
  }

  const retained = requireRead(bus);
  assert.equal(retained.snapshot.documentVersion, boundedExecutionCount);
  assert.deepEqual(retained.history, { undoDepth: boundedExecutionCount, redoDepth: 0 });
  assert.equal(retained.dirty, true);
  assert.deepEqual(firstPitch(bus), CVN7_C4);
  assert.equal(
    events.filter(({ eventType }) => eventType === "core.document.committed").length,
    boundedExecutionCount,
  );
  assert.equal(
    events.filter(({ eventType }) => eventType === "core.session.dirty-state-changed").length,
    1,
  );

  const checkpoint = bus.markPersisted({
    documentId: fixture.document.id,
    documentVersion: boundedExecutionCount,
  });
  assert.deepEqual(checkpoint, {
    status: "updated",
    documentVersion: boundedExecutionCount,
    dirty: false,
  });
  assert.equal(requireRead(bus).dirty, false);

  assert.equal(
    bus.submit(pitchCommand(fixture.firstNote.noteId, CVN7_D4)).status,
    "committed",
  );
  const afterAdditional = requireRead(bus);
  assert.equal(afterAdditional.snapshot.documentVersion, boundedExecutionCount + 1);
  assert.deepEqual(afterAdditional.history, { undoDepth: boundedExecutionCount + 1, redoDepth: 0 });
  assert.equal(afterAdditional.dirty, true);
  assert.deepEqual(firstPitch(bus), CVN7_D4);

  assert.equal(bus.undo().status, "committed");
  const afterUndo = requireRead(bus);
  assert.equal(afterUndo.snapshot.documentVersion, boundedExecutionCount + 2);
  assert.deepEqual(afterUndo.history, { undoDepth: boundedExecutionCount, redoDepth: 1 });
  assert.equal(afterUndo.dirty, false);
  assert.deepEqual(firstPitch(bus), CVN7_C4);

  assert.equal(bus.redo().status, "committed");
  const afterRedo = requireRead(bus);
  assert.equal(afterRedo.snapshot.documentVersion, boundedExecutionCount + 3);
  assert.deepEqual(afterRedo.history, { undoDepth: boundedExecutionCount + 1, redoDepth: 0 });
  assert.equal(afterRedo.dirty, true);
  assert.deepEqual(firstPitch(bus), CVN7_D4);

  for (let index = 0; index < 2; index += 1) {
    assert.equal(bus.undo().status, "committed", `slice undo ${index}`);
  }
  assert.deepEqual(requireRead(bus).history, { undoDepth: 7, redoDepth: 2 });
  for (let index = 0; index < 2; index += 1) {
    assert.equal(bus.redo().status, "committed", `slice redo ${index}`);
  }
  assert.deepEqual(requireRead(bus).history, { undoDepth: 9, redoDepth: 0 });
  assert.deepEqual(firstPitch(bus), CVN7_D4);

  const committedCauses = events
    .filter((event) => event.eventType === "core.document.committed")
    .slice(-7)
    .map((event) => event.eventType === "core.document.committed" ? event.cause : "");
  assert.deepEqual(committedCauses, [
    "submit", "undo", "redo",
    ...Array.from({ length: 2 }, () => "undo" as const),
    ...Array.from({ length: 2 }, () => "redo" as const),
  ]);
});
