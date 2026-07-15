import { test } from "node:test";
import assert = require("node:assert/strict");

import {
  CommandBus,
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

function setMetadata(title: string): unknown {
  return {
    commandVersion: 1,
    commandId: "core.document.set-metadata",
    target: { kind: "document", documentId: "score-1" },
    payload: {
      metadata: {
        title,
        authors: ["Brilliant Guitar"],
        tempo: { bpm: 120 },
      },
    },
  };
}

function setPitch(step: "C" | "D"): unknown {
  return {
    commandVersion: 1,
    commandId: "core.note.set-written-pitch",
    target: { kind: "note", noteId: "note-1" },
    payload: { writtenPitch: { step, alter: 0, octave: 4 } },
  };
}

test("dirty follows the exact persisted history identity through undo and redo", () => {
  const bus = requireBus();
  assert.equal(requireRead(bus).dirty, false);

  assert.equal(bus.submit(setMetadata("Saved candidate")).status, "committed");
  assert.equal(requireRead(bus).dirty, true);
  assert.deepEqual(
    bus.markPersisted({ documentId: "score-1", documentVersion: 1 }),
    { status: "updated", documentVersion: 1, dirty: false },
  );

  assert.equal(bus.submit(setPitch("D")).status, "committed");
  assert.equal(requireRead(bus).dirty, true);
  assert.equal(bus.undo().status, "committed");
  assert.equal(requireRead(bus).dirty, false);
  assert.equal(bus.redo().status, "committed");
  assert.equal(requireRead(bus).dirty, true);
});

test("an asynchronous save marks its observed version clean without clearing newer edits", () => {
  const bus = requireBus();
  assert.equal(bus.submit(setMetadata("Version one")).status, "committed");
  const versionOne = requireRead(bus).snapshot;
  assert.equal(versionOne.documentVersion, 1);

  assert.equal(bus.submit(setPitch("D")).status, "committed");
  assert.deepEqual(
    bus.markPersisted({
      documentId: versionOne.documentId,
      documentVersion: versionOne.documentVersion,
    }),
    { status: "updated", documentVersion: 2, dirty: true },
  );
  assert.equal(requireRead(bus).dirty, true);

  assert.equal(bus.undo().status, "committed");
  assert.equal(requireRead(bus).snapshot.documentVersion, 3);
  assert.equal(requireRead(bus).dirty, false);
});

test("checkpoint decoding and lookup reject atomically with closed failures", () => {
  const bus = requireBus();
  const initialCheckpoint = { documentId: "score-1", documentVersion: 0 };
  assert.deepEqual(bus.markPersisted(initialCheckpoint), {
    status: "no-op",
    documentVersion: 0,
    dirty: false,
  });

  const cases = [
    {
      input: null,
      code: "checkpoint.invalid",
    },
    {
      input: { ...initialCheckpoint, extra: true },
      code: "checkpoint.invalid",
    },
    {
      input: { documentId: "other", documentVersion: 0 },
      code: "checkpoint.document-mismatch",
    },
    {
      input: { documentId: "score-1", documentVersion: 999 },
      code: "checkpoint.version-unavailable",
    },
  ] as const;

  for (const entry of cases) {
    const result = bus.markPersisted(entry.input);
    assert.equal(result.status, "rejected");
    if (result.status === "rejected") {
      assert.equal(result.failure.code, entry.code);
      assert.equal(result.documentVersion, 0);
      assert.equal(result.dirty, false);
    }
  }

  let getterCalls = 0;
  const accessor = Object.create(null) as Record<string, unknown>;
  Object.defineProperties(accessor, {
    documentId: { enumerable: true, value: "score-1" },
    documentVersion: {
      enumerable: true,
      get() {
        getterCalls += 1;
        return 0;
      },
    },
  });
  const rejected = bus.markPersisted(accessor);
  assert.equal(rejected.status, "rejected");
  if (rejected.status === "rejected") {
    assert.equal(rejected.failure.code, "checkpoint.invalid");
  }
  assert.equal(getterCalls, 0);
  assert.equal(requireRead(bus).dirty, false);
});

test("no-op and rejected commands preserve dirty while a deep-equal branch stays dirty", () => {
  const bus = requireBus();
  assert.equal(bus.submit(setPitch("D")).status, "committed");
  assert.deepEqual(
    bus.markPersisted({ documentId: "score-1", documentVersion: 1 }),
    { status: "updated", documentVersion: 1, dirty: false },
  );

  assert.equal(bus.undo().status, "committed");
  assert.equal(requireRead(bus).dirty, true);
  assert.equal(bus.submit(setPitch("C")).status, "no-op");
  assert.equal(bus.submit({ commandVersion: 1 }).status, "rejected");
  assert.equal(requireRead(bus).dirty, true);

  assert.equal(bus.submit(setPitch("D")).status, "committed");
  const state = requireRead(bus);
  assert.equal(state.snapshot.documentVersion, 3);
  assert.equal(state.snapshot.document.parts[0]?.measureContents[0]?.voices[0]
    ?.sequence.events[0]?.content.kind, "notes");
  assert.equal(state.dirty, true);
  assert.equal(bus.redo().status, "rejected");
  assert.equal(requireRead(bus).dirty, true);
});
