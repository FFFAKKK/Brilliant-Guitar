import { test } from "node:test";
import assert = require("node:assert/strict");

import {
  CommandBus,
  type CommandResult,
  type KernelReadState,
  type ReadResult,
  type ScoreDocument,
  selectDirtyState,
  selectHistoryState,
  selectScoreEntity,
  selectScoreEntityOwnership,
  selectScoreMetadata,
  selectScoreRange,
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

test("entity and ownership selectors cover every stable address kind", () => {
  const state = requireRead(requireBus());
  const cases = [
    {
      address: { kind: "document", documentId: "score-1" },
      entityKind: "document",
      ownership: { entityKind: "document", documentId: "score-1" },
    },
    {
      address: { kind: "measure", measureId: "measure-1" },
      entityKind: "measure",
      ownership: { entityKind: "measure", documentId: "score-1" },
    },
    {
      address: { kind: "part", partId: "part-1" },
      entityKind: "part",
      ownership: { entityKind: "part", documentId: "score-1" },
    },
    {
      address: { kind: "staff", staffId: "staff-1" },
      entityKind: "staff",
      ownership: {
        entityKind: "staff",
        documentId: "score-1",
        partId: "part-1",
      },
    },
    {
      address: { kind: "voice", voiceId: "voice-1" },
      entityKind: "voice",
      ownership: {
        entityKind: "voice",
        documentId: "score-1",
        partId: "part-1",
        measureId: "measure-1",
      },
    },
    {
      address: { kind: "event", eventId: "event-1" },
      entityKind: "event",
      ownership: {
        entityKind: "event",
        documentId: "score-1",
        partId: "part-1",
        measureId: "measure-1",
        voiceId: "voice-1",
      },
    },
    {
      address: { kind: "note", noteId: "note-1" },
      entityKind: "note",
      ownership: {
        entityKind: "note",
        documentId: "score-1",
        partId: "part-1",
        measureId: "measure-1",
        voiceId: "voice-1",
        eventId: "event-1",
      },
    },
  ] as const;

  for (const entry of cases) {
    const selected = selectScoreEntity(state.snapshot, entry.address);
    assert.equal(selected.ok, true);
    if (selected.ok) {
      assert.equal(selected.value.kind, entry.entityKind);
      assert.equal(Object.isFrozen(selected), true);
      assert.equal(Object.isFrozen(selected.value), true);
      assert.equal(Object.isFrozen(selected.value.value), true);
    }
    assert.deepEqual(
      selectScoreEntityOwnership(state.snapshot, entry.address),
      { ok: true, value: entry.ownership },
    );
  }

  assert.deepEqual(
    selectScoreEntity(state.snapshot, { kind: "note", noteId: "missing" }),
    { ok: false, failure: { code: "read.entity-not-found" } },
  );
  assert.deepEqual(
    selectScoreEntity(state.snapshot, { kind: "note", noteId: "note-1", index: 0 }),
    { ok: false, failure: { code: "read.invalid-address" } },
  );
});

test("metadata, history, and dirty selectors are frozen deterministic reads", () => {
  const bus = requireBus();
  assert.equal(setPitch(bus, "D").status, "committed");
  const state = requireRead(bus);

  const metadata = selectScoreMetadata(state.snapshot);
  assert.deepEqual(metadata, {
    ok: true,
    value: state.snapshot.document.metadata,
  });
  assert.equal(Object.isFrozen(metadata), true);
  assert.deepEqual(selectScoreMetadata(state.snapshot), metadata);
  assert.deepEqual(selectHistoryState(state), {
    ok: true,
    value: { undoDepth: 1, redoDepth: 0 },
  });
  assert.deepEqual(selectDirtyState(state), { ok: true, value: true });
});

test("all built-in selectors are repeatable immutable pure reads", () => {
  const bus = requireBus();
  const state = requireRead(bus);
  const calls = [
    () => selectScoreMetadata(state.snapshot),
    () =>
      selectScoreEntity(state.snapshot, {
        kind: "note",
        noteId: "note-1",
      }),
    () =>
      selectScoreEntityOwnership(state.snapshot, {
        kind: "note",
        noteId: "note-1",
      }),
    () =>
      selectScoreRange(state.snapshot, {
        kind: "measure-range",
        start: { kind: "measure", measureId: "measure-1" },
        end: { kind: "measure", measureId: "measure-1" },
      }),
    () => selectHistoryState(state),
    () => selectDirtyState(state),
  ] as const;

  for (const call of calls) {
    const first = call();
    const second = call();
    assert.deepEqual(second, first);
    assert.equal(Object.isFrozen(first), true);
    assert.equal(
      Reflect.set(first as unknown as Record<string, unknown>, "ok", false),
      false,
    );
  }

  assert.equal(requireRead(bus).snapshot.document.metadata.title, "Core fixture");
  assert.equal(noteStep(requireRead(bus)), "C");
});
