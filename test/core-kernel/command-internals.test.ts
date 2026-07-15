import { test } from "node:test";
import assert = require("node:assert/strict");

import { CORE_COMMAND_DEFINITIONS } from "../../src/core-kernel/commands/catalog";
import { decodeCoreCommand } from "../../src/core-kernel/commands/strict-codec";
import {
  applyCoreMutation,
  prepareCommandMutation,
  type CoreMutation,
} from "../../src/core-kernel/commands/mutations";
import {
  createCommandRuntime,
  redoCommand,
  submitCommand,
  undoCommand,
  type CommandRuntimeState,
} from "../../src/core-kernel/commands/runtime";
import {
  createReadSessionState,
  markPersistedCheckpoint,
  recordCommittedVersion,
} from "../../src/core-kernel/read/session-state";
import {
  resolveScoreEntityTarget,
  resolveSequenceAnchor,
} from "../../src/core-kernel/commands/target-resolver";
import type {
  CoreCommandEnvelope,
  ScoreEntityTarget,
} from "../../src/core-kernel/commands/contracts";
import type { ScoreDocument } from "../../src/core-kernel/index";
import { cloneCoreScoreFixture } from "./fixtures/core-score";

function envelope(
  commandId: string,
  target: unknown,
  payload: unknown,
): Record<string, unknown> {
  return { commandVersion: 1, commandId, target, payload };
}

function pitchCommand(step: "C" | "D"): Record<string, unknown> {
  return envelope(
    "core.note.set-written-pitch",
    { kind: "note", noteId: "note-1" },
    { writtenPitch: { step, alter: 0, octave: 4 } },
  );
}

function metadataCommand(title: string): Record<string, unknown> {
  return envelope(
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

function requireRuntime(document = cloneCoreScoreFixture()): CommandRuntimeState {
  const created = createCommandRuntime(document);
  assert.equal(created.ok, true);
  if (!created.ok) {
    throw new Error("expected a valid runtime fixture");
  }
  return created.state;
}

function requireDecoded(input: unknown): CoreCommandEnvelope {
  const decoded = decodeCoreCommand(input);
  assert.equal(decoded.ok, true);
  if (!decoded.ok) {
    throw new Error("expected a valid command fixture");
  }
  return decoded.value;
}

test("the static catalog is frozen and contains only the six approved Core commands", () => {
  assert.equal(Object.isFrozen(CORE_COMMAND_DEFINITIONS), true);
  assert.equal(
    CORE_COMMAND_DEFINITIONS.every((definition) => Object.isFrozen(definition)),
    true,
  );
  assert.deepEqual(
    CORE_COMMAND_DEFINITIONS.map(({ commandId }) => commandId),
    [
      "core.document.set-metadata",
      "core.note.set-written-pitch",
      "core.event.set-note-value",
      "core.voice.insert-notes-event",
      "core.voice.insert-rest-event",
      "core.event.remove",
    ],
  );
});

test("strict command decoding rejects sparse arrays, non-finite values, getters, and malformed unions", () => {
  const sparseAuthors = Array<string>(1);
  const cases = [
    {
      ...metadataCommand("Bad version"),
      commandVersion: Number.NaN,
    },
    envelope(
      "core.document.set-metadata",
      { kind: "document", documentId: "score-1" },
      {
        metadata: {
          title: "Sparse",
          authors: sparseAuthors,
          tempo: { bpm: 120 },
        },
      },
    ),
    envelope(
      "core.document.set-metadata",
      { kind: "document", documentId: "score-1" },
      {
        metadata: {
          title: "Infinite",
          authors: [],
          tempo: { bpm: Number.POSITIVE_INFINITY },
        },
      },
    ),
    envelope(
      "core.voice.insert-rest-event",
      { kind: "voice", voiceId: "voice-1" },
      {
        anchor: { kind: "after-event" },
        event: {
          id: "event-new",
          duration: { base: 4, dots: 0 },
          content: { kind: "rest" },
        },
      },
    ),
    envelope(
      "core.voice.insert-rest-event",
      { kind: "voice", voiceId: "voice-1" },
      {
        anchor: { kind: "start" },
        event: {
          id: "event-new",
          duration: { base: 4, dots: 0 },
          content: { kind: "notes", notes: [] },
        },
      },
    ),
  ];
  cases.forEach((input) => {
    const decoded = decodeCoreCommand(input);
    assert.deepEqual(decoded, {
      ok: false,
      failure: { code: "command.invalid-envelope" },
    });
  });

  const getterEnvelope = Object.create(null) as Record<string, unknown>;
  Object.defineProperties(getterEnvelope, {
    commandVersion: { enumerable: true, value: 1 },
    commandId: { enumerable: true, value: "core.event.remove" },
    target: {
      enumerable: true,
      get(): never {
        throw new Error("must remain private");
      },
    },
    payload: { enumerable: true, value: {} },
  });
  assert.deepEqual(decodeCoreCommand(getterEnvelope), {
    ok: false,
    failure: { code: "command.invalid-envelope" },
  });

  let anchorGetterAccessed = false;
  const anchorWithGetter = Object.create(null) as Record<string, unknown>;
  Object.defineProperties(anchorWithGetter, {
    kind: {
      enumerable: true,
      get(): string {
        anchorGetterAccessed = true;
        return "start";
      },
    },
  });
  const nestedGetter = envelope(
    "core.voice.insert-rest-event",
    { kind: "voice", voiceId: "voice-1" },
    {
      anchor: anchorWithGetter,
      event: {
        id: "event-new",
        duration: { base: 4, dots: 0 },
        content: { kind: "rest" },
      },
    },
  );
  assert.deepEqual(decodeCoreCommand(nestedGetter), {
    ok: false,
    failure: { code: "command.invalid-envelope" },
  });
  assert.equal(anchorGetterAccessed, false);

  let poisonedArrayMethodCalled = false;
  const poisonedAuthors = ["Composer"];
  Object.defineProperty(poisonedAuthors, "map", {
    enumerable: true,
    value(): string[] {
      poisonedArrayMethodCalled = true;
      return ["0"];
    },
  });
  const poisonedArray = envelope(
    "core.document.set-metadata",
    { kind: "document", documentId: "score-1" },
    {
      metadata: {
        title: "Poisoned",
        authors: poisonedAuthors,
        tempo: { bpm: 120 },
      },
    },
  );
  assert.deepEqual(decodeCoreCommand(poisonedArray), {
    ok: false,
    failure: { code: "command.invalid-envelope" },
  });
  assert.equal(poisonedArrayMethodCalled, false);
});

test("strict command decoding rejects huge sparse arrays before length-proportional work", () => {
  const sparseAuthors: unknown[] = [];
  sparseAuthors.length = 0xffff_ffff;
  let lengthReads = 0;
  const guardedSparseAuthors = new Proxy(sparseAuthors, {
    get(target, property, receiver): unknown {
      if (property === "length") {
        lengthReads += 1;
        throw new Error("array length must be read from its data descriptor");
      }
      return Reflect.get(target, property, receiver);
    },
  });

  const decoded = decodeCoreCommand(
    envelope(
      "core.document.set-metadata",
      { kind: "document", documentId: "score-1" },
      {
        metadata: {
          title: "Huge sparse input",
          authors: guardedSparseAuthors,
          tempo: { bpm: 120 },
        },
      },
    ),
  );

  assert.deepEqual(decoded, {
    ok: false,
    failure: { code: "command.invalid-envelope" },
  });
  assert.equal(lengthReads, 0);
});

test("the shared resolver covers every stable entity target and rejects duplicates", () => {
  const document = cloneCoreScoreFixture();
  const targets: readonly [ScoreEntityTarget, string][] = [
    [{ kind: "document", documentId: "score-1" }, "document"],
    [{ kind: "measure", measureId: "measure-1" }, "measure"],
    [{ kind: "part", partId: "part-1" }, "part"],
    [{ kind: "staff", staffId: "staff-1" }, "staff"],
    [{ kind: "voice", voiceId: "voice-1" }, "voice"],
    [{ kind: "event", eventId: "event-1" }, "event"],
    [{ kind: "note", noteId: "note-1" }, "note"],
  ];
  targets.forEach(([target, expectedKind]) => {
    const result = resolveScoreEntityTarget(document, target);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.value.kind, expectedKind);
    }
  });

  const duplicate = cloneCoreScoreFixture();
  (duplicate.parts[0]!.staves as typeof duplicate.parts[0]["staves"][number][])
    .push(structuredClone(duplicate.parts[0]!.staves[0]!));
  const result = resolveScoreEntityTarget(duplicate, {
    kind: "staff",
    staffId: "staff-1",
  });
  assert.deepEqual(result, {
    ok: false,
    failure: { code: "command.internal-error" },
  });
});

test("anchor resolution rejects duplicate matches instead of choosing an array position", () => {
  const duplicate = cloneCoreScoreFixture();
  const voice = duplicate.parts[0]!.measureContents[0]!.voices[0]!;
  (voice.sequence.events[1] as { id: string }).id = "event-1";
  assert.deepEqual(
    resolveSequenceAnchor(duplicate, voice, {
      kind: "after-event",
      eventId: "event-1",
    }),
    { ok: false, failure: { code: "command.internal-error" } },
  );
});

test("each internal forward/inverse mutation pair round-trips the document exactly", () => {
  const incomplete = cloneCoreScoreFixture();
  const incompleteEvents =
    incomplete.parts[0]!.measureContents[0]!.voices[0]!.sequence.events;
  (incompleteEvents as typeof incompleteEvents[number][]).splice(3);

  const cases: readonly [ScoreDocument, unknown][] = [
    [cloneCoreScoreFixture(), metadataCommand("Round trip")],
    [cloneCoreScoreFixture(), pitchCommand("D")],
    [
      cloneCoreScoreFixture(),
      envelope(
        "core.event.set-note-value",
        { kind: "event", eventId: "event-1" },
        { noteValue: { base: 8, dots: 0 } },
      ),
    ],
    [
      incomplete,
      envelope(
        "core.voice.insert-rest-event",
        { kind: "voice", voiceId: "voice-1" },
        {
          anchor: { kind: "after-event", eventId: "event-3" },
          event: {
            id: "event-new",
            duration: { base: 4, dots: 0 },
            content: { kind: "rest" },
          },
        },
      ),
    ],
    [
      cloneCoreScoreFixture(),
      envelope(
        "core.event.remove",
        { kind: "event", eventId: "event-4" },
        {},
      ),
    ],
  ];

  cases.forEach(([document, input]) => {
    const prepared = prepareCommandMutation(document, requireDecoded(input));
    assert.equal(prepared.ok, true);
    assert.equal(prepared.ok && prepared.changed, true);
    if (!prepared.ok || !prepared.changed) {
      return;
    }
    const forward = applyCoreMutation(document, prepared.forward);
    assert.equal(forward.ok, true);
    if (!forward.ok) {
      return;
    }
    const inverse = applyCoreMutation(forward.document, prepared.inverse);
    assert.equal(inverse.ok, true);
    if (inverse.ok) {
      assert.deepEqual(inverse.document, document);
    }
  });
});

test("handler/application exceptions and version overflow preserve the exact runtime state", () => {
  const initial = requireRuntime();
  const handlerFailure = submitCommand(initial, pitchCommand("D"), {
    beforePrepare(): never {
      throw new Error("private handler detail");
    },
  });
  assert.equal(handlerFailure.state, initial);
  assert.deepEqual(handlerFailure.result, {
    status: "rejected",
    documentVersion: 0,
    failure: { code: "command.internal-error" },
    undoDepth: 0,
    redoDepth: 0,
  });

  const applyFailure = submitCommand(initial, pitchCommand("D"), {
    beforeApply(): never {
      throw new Error("private mutation detail");
    },
  });
  assert.equal(applyFailure.state, initial);
  assert.equal(
    applyFailure.result.status === "rejected" && applyFailure.result.failure.code,
    "command.internal-error",
  );

  const overflow: CommandRuntimeState = {
    ...initial,
    documentVersion: Number.MAX_SAFE_INTEGER,
  };
  const overflowFailure = submitCommand(overflow, pitchCommand("D"));
  assert.equal(overflowFailure.state, overflow);
  assert.equal(
    overflowFailure.result.status === "rejected" &&
      overflowFailure.result.failure.code,
    "command.version-overflow",
  );
  const noOpAtMaximum = submitCommand(overflow, pitchCommand("C"));
  assert.equal(noOpAtMaximum.result.status, "no-op");
  assert.equal(noOpAtMaximum.result.documentVersion, Number.MAX_SAFE_INTEGER);
});

test("history corruption rejects undo atomically and no-op/rejection create no entries", () => {
  const initial = requireRuntime();
  const committed = submitCommand(initial, pitchCommand("D"));
  assert.equal(committed.result.status, "committed");
  assert.equal(committed.state.undoStack.length, 1);

  const noOp = submitCommand(committed.state, pitchCommand("D"));
  const rejected = submitCommand(
    noOp.state,
    envelope("core.unknown", { kind: "document", documentId: "score-1" }, {}),
  );
  assert.equal(noOp.state.undoStack.length, 1);
  assert.equal(rejected.state.undoStack.length, 1);

  const entry = committed.state.undoStack[0]!;
  const brokenInverse: CoreMutation = {
    kind: "remove-event",
    voiceId: "voice-1",
    eventId: "event-missing",
  };
  const corrupted: CommandRuntimeState = {
    ...committed.state,
    undoStack: [{ ...entry, inverse: brokenInverse }],
  };
  const failure = undoCommand(corrupted);
  assert.equal(failure.state, corrupted);
  assert.equal(
    failure.result.status === "rejected" && failure.result.failure.code,
    "history.invariant-violation",
  );

  const semanticCorruption: CommandRuntimeState = {
    ...committed.state,
    undoStack: [
      {
        ...entry,
        inverse: {
          kind: "replace-note-value",
          eventId: "event-1",
          value: { base: 2, dots: 0 },
        },
      },
    ],
  };
  const semanticFailure = undoCommand(semanticCorruption);
  assert.equal(semanticFailure.state, semanticCorruption);
  assert.equal(
    semanticFailure.result.status === "rejected" &&
      semanticFailure.result.failure.code,
    "history.invariant-violation",
  );

  const undone = undoCommand(committed.state);
  assert.equal(undone.result.status, "committed");
  const redoEntry = undone.state.redoStack[0]!;
  const invalidRedo: CommandRuntimeState = {
    ...undone.state,
    redoStack: [
      {
        ...redoEntry,
        forward: {
          kind: "replace-note-value",
          eventId: "event-1",
          value: { base: 2, dots: 0 },
        },
      },
    ],
  };
  const redoFailure = redoCommand(invalidRedo);
  assert.equal(redoFailure.state, invalidRedo);
  assert.equal(
    redoFailure.result.status === "rejected" &&
      redoFailure.result.failure.code,
    "history.invariant-violation",
  );
});

test("unexpected undo and redo errors collapse to atomic history failures", () => {
  const initial = requireRuntime();
  const committed = submitCommand(initial, pitchCommand("D"));
  assert.equal(committed.result.status, "committed");

  const failingHooks = {
    classify(): never {
      throw new Error("private history failure");
    },
  };
  const undoFailure = undoCommand(committed.state, failingHooks);
  assert.equal(undoFailure.state, committed.state);
  assert.deepEqual(undoFailure.result, {
    status: "rejected",
    documentVersion: 1,
    failure: { code: "history.invariant-violation" },
    undoDepth: 1,
    redoDepth: 0,
  });

  const undone = undoCommand(committed.state);
  assert.equal(undone.result.status, "committed");
  const redoFailure = redoCommand(undone.state, failingHooks);
  assert.equal(redoFailure.state, undone.state);
  assert.deepEqual(redoFailure.result, {
    status: "rejected",
    documentVersion: 2,
    failure: { code: "history.invariant-violation" },
    undoDepth: 0,
    redoDepth: 1,
  });
});

test("history entries use deterministic sequences and contain no document snapshots", () => {
  const initial = requireRuntime();
  const first = submitCommand(initial, metadataCommand("One"));
  const second = submitCommand(first.state, pitchCommand("D"));
  assert.deepEqual(
    second.state.undoStack.map(({ sequence }) => sequence),
    [1, 2],
  );
  second.state.undoStack.forEach((entry) => {
    assert.deepEqual(Object.keys(entry).sort(), [
      "command",
      "forward",
      "inverse",
      "sequence",
    ]);
    assert.equal("document" in entry, false);
    assert.equal("timestamp" in entry, false);
    assert.equal("snapshot" in entry, false);
  });
});

test("committed document versions copy only deterministic content-state identities", () => {
  const initial = requireRuntime();
  const initialReadState = createReadSessionState();
  const committed = submitCommand(initial, pitchCommand("D"));
  assert.equal(committed.result.status, "committed");

  const firstRecord = recordCommittedVersion(
    committed.state,
    initialReadState,
  );
  assert.equal(firstRecord.ok, true);
  if (!firstRecord.ok) {
    return;
  }
  assert.notStrictEqual(
    firstRecord.state.stateIdentityByDocumentVersion,
    initialReadState.stateIdentityByDocumentVersion,
  );
  assert.deepEqual(
    [...initialReadState.stateIdentityByDocumentVersion.entries()],
    [[0, 0]],
  );
  assert.deepEqual(
    [...firstRecord.state.stateIdentityByDocumentVersion.entries()],
    [
      [0, 0],
      [1, 1],
    ],
  );

  const undone = undoCommand(committed.state);
  assert.equal(undone.result.status, "committed");
  const secondRecord = recordCommittedVersion(undone.state, firstRecord.state);
  assert.equal(secondRecord.ok, true);
  if (!secondRecord.ok) {
    return;
  }
  assert.deepEqual(
    [...secondRecord.state.stateIdentityByDocumentVersion.entries()],
    [
      [0, 0],
      [1, 1],
      [2, 0],
    ],
  );
  assert.equal(
    [...secondRecord.state.stateIdentityByDocumentVersion.values()].every(
      (identity) => typeof identity === "number",
    ),
    true,
  );

  const checkpoint = markPersistedCheckpoint(
    undone.state,
    secondRecord.state,
    { documentId: "score-1", documentVersion: 1 },
  );
  assert.equal(checkpoint.result.status, "updated");
  assert.equal(checkpoint.state.cleanStateIdentity, 1);
  assert.strictEqual(
    checkpoint.state.stateIdentityByDocumentVersion,
    secondRecord.state.stateIdentityByDocumentVersion,
  );
});

test("checkpoint integration collapses unexpected map failures without state adoption", () => {
  const commandState = requireRuntime();
  const readState = {
    ...createReadSessionState(),
    stateIdentityByDocumentVersion: {
      get(): never {
        throw new Error("private checkpoint failure");
      },
    } as unknown as ReadonlyMap<number, number>,
  };

  const transition = markPersistedCheckpoint(commandState, readState, {
    documentId: "score-1",
    documentVersion: 0,
  });
  assert.strictEqual(transition.state, readState);
  assert.deepEqual(transition.result, {
    status: "rejected",
    documentVersion: 0,
    dirty: false,
    failure: { code: "checkpoint.invariant-violation" },
  });
});

test("deep unknown extensions survive commit, rejection, undo, and redo", () => {
  const document = cloneCoreScoreFixture();
  (document.extensions as typeof document.extensions[number][]).push({
    namespace: "com.example.history-data",
    schemaVersion: 3,
    owner: { kind: "part", partId: "part-1" },
    payload: { deep: [{ future: { flags: [true, false, null] } }] },
  });
  const expected = structuredClone(document.extensions);
  const initial = requireRuntime(document);

  const committed = submitCommand(initial, pitchCommand("D"));
  assert.deepEqual(committed.state.document.extensions, expected);
  const rejected = submitCommand(
    committed.state,
    envelope("core.unknown", { kind: "document", documentId: "score-1" }, {}),
  );
  assert.deepEqual(rejected.state.document.extensions, expected);
  const undone = undoCommand(rejected.state);
  assert.deepEqual(undone.state.document.extensions, expected);
  const redone = redoCommand(undone.state);
  assert.deepEqual(redone.state.document.extensions, expected);
});
