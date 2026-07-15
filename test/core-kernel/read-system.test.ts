import { test } from "node:test";
import assert = require("node:assert/strict");

import {
  CommandBus,
  type CommandResult,
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
  assert.equal(result.ok, true);
  return result.value;
}

function setPitch(bus: CommandBus, step: "C" | "D"): CommandResult {
  return bus.submit({
    commandVersion: 1,
    commandId: "core.note.set-written-pitch",
    target: { kind: "note", noteId: "note-1" },
    payload: { writtenPitch: { step, alter: 0, octave: 4 } },
  });
}

function noteStep(state: KernelReadState): string {
  const event = state.snapshot.document.parts[0]?.measureContents[0]?.voices[0]
    ?.sequence.events[0];
  assert.equal(event?.content.kind, "notes");
  if (event?.content.kind !== "notes") {
    throw new Error("expected NotesContent");
  }
  return event.content.notes[0]?.writtenPitch.step ?? "";
}

test("CommandBus.read returns an atomic deeply frozen initial snapshot", () => {
  const document = cloneCoreScoreFixture();
  (document.extensions as unknown[]).push({
    namespace: "com.example.deep",
    schemaVersion: 1,
    owner: { kind: "score" },
    payload: { nested: { values: [1, { label: "keep" }] } },
  });
  const bus = requireBus(document);
  const state = requireRead(bus);

  assert.equal(state.snapshot.documentId, "score-1");
  assert.equal(state.snapshot.schemaVersion, "brilliant-score-1");
  assert.equal(state.snapshot.documentVersion, 0);
  assert.deepEqual(state.history, { undoDepth: 0, redoDepth: 0 });
  assert.equal(state.dirty, false);
  assert.equal(Object.isFrozen(state), true);
  assert.equal(Object.isFrozen(state.snapshot), true);
  assert.equal(Object.isFrozen(state.snapshot.document), true);
  assert.equal(Object.isFrozen(state.snapshot.document.parts), true);
  assert.equal(Object.isFrozen(state.snapshot.document.parts[0]), true);
  assert.equal(Object.isFrozen(state.snapshot.document.extensions[0]?.payload), true);
  assert.equal(
    Object.isFrozen(
      state.snapshot.document.extensions[0]?.payload.nested as object,
    ),
    true,
  );

  assert.equal(
    Reflect.set(
      state.snapshot.document.metadata as unknown as Record<string, unknown>,
      "title",
      "tampered",
    ),
    false,
  );
  assert.equal(
    Reflect.set(
      state.snapshot.document.parts as unknown as Record<string, unknown>,
      "0",
      null,
    ),
    false,
  );
  assert.equal(requireRead(bus).snapshot.document.metadata.title, "Core fixture");
});

test("old snapshots stay stable after commits while current read state advances", () => {
  const bus = requireBus();
  const first = requireRead(bus);

  const committed = setPitch(bus, "D");
  assert.equal(committed.status, "committed");
  const second = requireRead(bus);
  assert.equal(second.snapshot.documentVersion, 1);
  assert.deepEqual(second.history, { undoDepth: 1, redoDepth: 0 });
  assert.equal(second.dirty, true);
  assert.equal(noteStep(first), "C");
  assert.equal(noteStep(second), "D");

  const noOp = setPitch(bus, "D");
  assert.equal(noOp.status, "no-op");
  const rejected = bus.submit({ commandVersion: 1 });
  assert.equal(rejected.status, "rejected");
  const unchanged = requireRead(bus);
  assert.equal(unchanged.snapshot.documentVersion, 1);
  assert.deepEqual(unchanged.history, { undoDepth: 1, redoDepth: 0 });
  assert.equal(noteStep(unchanged), "D");
});
