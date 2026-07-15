import { test } from "node:test";
import assert = require("node:assert/strict");

import * as coreKernel from "../../src/core-kernel/index";
import type {
  CoreCommandEnvelope,
  ScoreDocument,
  ScoreEntityTarget,
  SequenceAnchor,
} from "../../src/core-kernel/index";
import { cloneCoreScoreFixture } from "./fixtures/core-score";

type Failure = {
  readonly code: string;
  readonly diagnostics?: readonly { readonly code: string }[];
};

type CommandResult = {
  readonly status: "committed" | "no-op" | "rejected";
  readonly documentVersion: number;
  readonly undoDepth: number;
  readonly redoDepth: number;
  readonly support?: {
    readonly status: "supported" | "unsupported" | "invalid";
    readonly diagnostics: readonly { readonly code: string }[];
  };
  readonly failure?: Failure;
};

interface CommandBusLike {
  submit(input: unknown): CommandResult;
  undo(): CommandResult;
  redo(): CommandResult;
}

type CommandBusConstructor = {
  create(document: ScoreDocument):
    | { readonly ok: true; readonly value: CommandBusLike }
    | { readonly ok: false; readonly failure: Failure };
};

type ReplayResult =
  | {
      readonly status: "replayed";
      readonly finalDocument: ScoreDocument;
      readonly documentVersion: number;
      readonly results: readonly CommandResult[];
    }
  | {
      readonly status: "rejected";
      readonly finalDocument: ScoreDocument;
      readonly documentVersion: number;
      readonly results: readonly CommandResult[];
      readonly failedCommandIndex: number;
      readonly failure: Failure;
    }
  | { readonly status: "invalid-initial-document"; readonly failure: Failure };

function getCommandApi(): {
  readonly CommandBus: CommandBusConstructor;
  readonly replay: (
    initialDocument: ScoreDocument,
    commands: readonly unknown[],
  ) => ReplayResult;
} {
  const api = coreKernel as unknown as Record<string, unknown>;
  assert.equal(typeof api.CommandBus, "function");
  assert.equal(typeof api.replayCoreCommands, "function");
  return {
    CommandBus: api.CommandBus as CommandBusConstructor,
    replay: api.replayCoreCommands as (
      initialDocument: ScoreDocument,
      commands: readonly unknown[],
    ) => ReplayResult,
  };
}

function createBus(document = cloneCoreScoreFixture()): CommandBusLike {
  const result = getCommandApi().CommandBus.create(document);
  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error("expected valid fixture to create a command bus");
  }
  return result.value;
}

function baseEnvelope(
  commandId: string,
  target: unknown,
  payload: unknown,
): Record<string, unknown> {
  return { commandVersion: 1, commandId, target, payload };
}

function setMetadata(title: string): Record<string, unknown> {
  return baseEnvelope(
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

function setPitch(step: "C" | "D" | "E"): Record<string, unknown> {
  return baseEnvelope(
    "core.note.set-written-pitch",
    { kind: "note", noteId: "note-1" },
    { writtenPitch: { step, alter: 0, octave: 4 } },
  );
}

function setNoteValue(base: 2 | 4 | 8): Record<string, unknown> {
  return baseEnvelope(
    "core.event.set-note-value",
    { kind: "event", eventId: "event-1" },
    { noteValue: { base, dots: 0 } },
  );
}

function incompleteFixture(): ScoreDocument {
  const document = cloneCoreScoreFixture();
  const events = document.parts[0]!.measureContents[0]!.voices[0]!.sequence.events;
  (events as typeof events[number][]).splice(3);
  return document;
}

function insertRest(
  anchor: unknown = { kind: "after-event", eventId: "event-3" },
): Record<string, unknown> {
  return baseEnvelope(
    "core.voice.insert-rest-event",
    { kind: "voice", voiceId: "voice-1" },
    {
      anchor,
      event: {
        id: "event-new",
        duration: { base: 4, dots: 0 },
        content: { kind: "rest" },
      },
    },
  );
}

function insertChord(): Record<string, unknown> {
  return baseEnvelope(
    "core.voice.insert-notes-event",
    { kind: "voice", voiceId: "voice-1" },
    {
      anchor: { kind: "after-event", eventId: "event-3" },
      event: {
        id: "event-chord",
        duration: { base: 4, dots: 0 },
        content: {
          kind: "notes",
          notes: [
            {
              id: "note-chord-c",
              writtenPitch: { step: "C", alter: 0, octave: 4 },
            },
            {
              id: "note-chord-e",
              writtenPitch: { step: "E", alter: 0, octave: 4 },
            },
          ],
        },
      },
    },
  );
}

function removeEvent(eventId = "event-4"): Record<string, unknown> {
  return baseEnvelope(
    "core.event.remove",
    { kind: "event", eventId },
    {},
  );
}

function assertRejected(
  result: CommandResult,
  code: string,
  version = 0,
  undoDepth = 0,
  redoDepth = 0,
): void {
  assert.equal(result.status, "rejected");
  assert.equal(result.failure?.code, code);
  assert.equal(result.documentVersion, version);
  assert.equal(result.undoDepth, undoDepth);
  assert.equal(result.redoDepth, redoDepth);
}

test("CommandBus exposes the strict K1-2 entry points", () => {
  const { CommandBus, replay } = getCommandApi();
  assert.equal(typeof CommandBus.create, "function");
  assert.equal(typeof replay, "function");
});

test("public command contracts expose versioned stable targets and anchors", () => {
  const target: ScoreEntityTarget = { kind: "voice", voiceId: "voice-1" };
  const anchor: SequenceAnchor = {
    kind: "after-event",
    eventId: "event-1",
  };
  const command: CoreCommandEnvelope = {
    commandVersion: 1,
    commandId: "core.voice.insert-rest-event",
    target,
    payload: {
      anchor,
      event: {
        id: "event-public-contract",
        duration: { base: 4, dots: 0 },
        content: { kind: "rest" },
      },
    },
  };
  assert.equal(command.commandVersion, 1);
  assert.equal(command.target.kind, "voice");
  assert.equal(command.payload.anchor.kind, "after-event");
});

test("strict submit rejects malformed, unknown, versioned, extra, and target-mismatched envelopes", () => {
  const cases: readonly [unknown, string][] = [
    [{ op: "replace", path: "/parts/0", value: {} }, "command.invalid-envelope"],
    [
      { ...setMetadata("Changed"), commandVersion: 2 },
      "command.unsupported-version",
    ],
    [
      baseEnvelope(
        "core.unknown",
        { kind: "document", documentId: "score-1" },
        {},
      ),
      "command.unknown-id",
    ],
    [{ ...setMetadata("Changed"), extra: true }, "command.invalid-envelope"],
    [
      baseEnvelope(
        "core.note.set-written-pitch",
        { kind: "event", eventId: "event-1" },
        { writtenPitch: { step: "D", alter: 0, octave: 4 } },
      ),
      "command.target-mismatch",
    ],
    [
      baseEnvelope(
        "core.note.set-written-pitch",
        { kind: "note", noteId: "note-1" },
        {
          writtenPitch: { step: "D", alter: 0, octave: 4 },
          patch: "/writtenPitch",
        },
      ),
      "command.invalid-envelope",
    ],
  ];

  cases.forEach(([input, code]) => assertRejected(createBus().submit(input), code));
});

test("document, note, and note-value replacement distinguish commit, no-op, unsupported, and semantic rejection", () => {
  const metadataBus = createBus();
  const metadata = metadataBus.submit(setMetadata("Changed"));
  assert.equal(metadata.status, "committed");
  assert.equal(metadata.documentVersion, 1);
  assert.equal(metadata.undoDepth, 1);
  assert.equal(metadata.support?.status, "supported");
  const metadataNoOp = metadataBus.submit(setMetadata("Changed"));
  assert.equal(metadataNoOp.status, "no-op");
  assert.equal(metadataNoOp.documentVersion, 1);
  assert.equal(metadataNoOp.undoDepth, 1);

  const pitchBus = createBus();
  assert.equal(pitchBus.submit(setPitch("D")).status, "committed");
  assert.equal(pitchBus.submit(setPitch("D")).status, "no-op");

  const valueBus = createBus();
  const shorter = valueBus.submit(setNoteValue(8));
  assert.equal(shorter.status, "committed");
  assert.equal(shorter.support?.status, "unsupported");
  assert.deepEqual(
    shorter.support?.diagnostics.map(({ code }) => code),
    ["unsupported.sequence-duration"],
  );
  const shorterNoOp = valueBus.submit(setNoteValue(8));
  assert.equal(shorterNoOp.status, "no-op");
  assert.equal(shorterNoOp.documentVersion, 1);
  assert.equal(shorterNoOp.undoDepth, 1);

  const invalidValueBus = createBus();
  const tooLong = invalidValueBus.submit(setNoteValue(2));
  assertRejected(tooLong, "command.semantic-invalid");
  assert.equal(
    tooLong.failure?.diagnostics?.some(
      ({ code }) => code === "semantic.sequence-exceeds-measure",
    ),
    true,
  );
});

test("insert notes/rest and remove event use stable Voice/Event targets and anchors", () => {
  const rest = createBus(incompleteFixture()).submit(insertRest());
  assert.equal(rest.status, "committed");
  assert.equal(rest.support?.status, "supported");

  const chord = createBus(incompleteFixture()).submit(insertChord());
  assert.equal(chord.status, "committed");
  assert.equal(chord.support?.status, "unsupported");
  assert.deepEqual(
    chord.support?.diagnostics.map(({ code }) => code),
    ["unsupported.chord"],
  );

  const removed = createBus().submit(removeEvent());
  assert.equal(removed.status, "committed");
  assert.equal(removed.support?.status, "unsupported");
  assert.equal(
    removed.support?.diagnostics.some(
      ({ code }) => code === "unsupported.sequence-duration",
    ),
    true,
  );
});

test("missing targets and missing or wrong-owner anchors reject without side effects", () => {
  const missingTarget = setPitch("D");
  missingTarget.target = { kind: "note", noteId: "note-missing" };
  assertRejected(
    createBus().submit(missingTarget),
    "command.target-not-found",
  );

  assertRejected(
    createBus(incompleteFixture()).submit(
      insertRest({ kind: "after-event", eventId: "event-missing" }),
    ),
    "command.anchor-not-found",
  );

  const twoVoices = incompleteFixture();
  const content = twoVoices.parts[0]!.measureContents[0]!;
  const secondVoice = structuredClone(content.voices[0]!);
  (secondVoice as { id: string }).id = "voice-2";
  secondVoice.sequence.events.forEach((event, index) => {
    (event as { id: string }).id = `event-${index + 5}`;
    if (event.content.kind === "notes") {
      (event.content.notes[0] as { id: string }).id = "note-2";
    }
  });
  (content.voices as typeof content.voices[number][]).push(secondVoice);
  assertRejected(
    createBus(twoVoices).submit(
      insertRest({ kind: "after-event", eventId: "event-5" }),
    ),
    "command.anchor-wrong-owner",
  );
});

test("semantic-invalid inserts rollback while the original document remains usable", () => {
  const bus = createBus(incompleteFixture());
  const command = insertChord();
  const event = (command.payload as { event: { content: { notes: unknown[] } } })
    .event;
  event.content.notes = [];

  const rejected = bus.submit(command);
  assertRejected(rejected, "command.semantic-invalid");
  assert.equal(
    rejected.failure?.diagnostics?.some(
      ({ code }) => code === "semantic.notes-required",
    ),
    true,
  );
  const duplicate = insertRest();
  (
    duplicate.payload as {
      event: { id: string };
    }
  ).event.id = "event-1";
  const duplicateRejected = bus.submit(duplicate);
  assertRejected(duplicateRejected, "command.semantic-invalid");
  assert.equal(
    duplicateRejected.failure?.diagnostics?.some(
      ({ code }) => code === "semantic.id-duplicate",
    ),
    true,
  );
  const followUp = bus.submit(insertRest());
  assert.equal(followUp.status, "committed");
  assert.equal(followUp.documentVersion, 1);
  assert.equal(followUp.undoDepth, 1);
});

test("undo and redo are one-entry atomic transitions with deterministic versions", () => {
  const bus = createBus();
  assertRejected(bus.undo(), "history.empty-undo");

  const first = bus.submit(setMetadata("One"));
  const second = bus.submit(setPitch("D"));
  assert.deepEqual(
    [first, second].map((result) => [
      result.status,
      result.documentVersion,
      result.undoDepth,
      result.redoDepth,
    ]),
    [
      ["committed", 1, 1, 0],
      ["committed", 2, 2, 0],
    ],
  );

  const undoPitch = bus.undo();
  const undoMetadata = bus.undo();
  const redoMetadata = bus.redo();
  const redoPitch = bus.redo();
  assert.deepEqual(
    [undoPitch, undoMetadata, redoMetadata, redoPitch].map((result) => [
      result.status,
      result.documentVersion,
      result.undoDepth,
      result.redoDepth,
    ]),
    [
      ["committed", 3, 1, 1],
      ["committed", 4, 0, 2],
      ["committed", 5, 1, 1],
      ["committed", 6, 2, 0],
    ],
  );
  assertRejected(bus.redo(), "history.empty-redo", 6, 2, 0);
});

test("rejected and no-op submissions preserve redo while a new commit invalidates it", () => {
  const bus = createBus();
  assert.equal(bus.submit(setPitch("D")).status, "committed");
  assert.equal(bus.undo().status, "committed");

  const noOp = bus.submit(setPitch("C"));
  assert.equal(noOp.status, "no-op");
  assert.equal(noOp.redoDepth, 1);
  assert.equal(noOp.documentVersion, 2);

  const rejected = bus.submit(
    baseEnvelope(
      "core.unknown",
      { kind: "document", documentId: "score-1" },
      {},
    ),
  );
  assertRejected(rejected, "command.unknown-id", 2, 0, 1);
  assert.equal(bus.redo().status, "committed");

  assert.equal(bus.undo().status, "committed");
  const replacement = bus.submit(setMetadata("New branch"));
  assert.equal(replacement.status, "committed");
  assert.equal(replacement.redoDepth, 0);
  assertRejected(bus.redo(), "history.empty-redo", 5, 1, 0);
});

test("initial documents and accepted command payloads are detached from caller mutation", () => {
  const initial = cloneCoreScoreFixture();
  const created = getCommandApi().CommandBus.create(initial);
  assert.equal(created.ok, true);
  if (!created.ok) {
    return;
  }
  const note = initial.parts[0]!.measureContents[0]!.voices[0]!.sequence
    .events[0]!.content;
  assert.equal(note.kind, "notes");
  if (note.kind === "notes") {
    (note.notes[0] as { writtenPitch: { step: "E"; alter: 0; octave: 4 } })
      .writtenPitch = { step: "E", alter: 0, octave: 4 };
  }
  assert.equal(created.value.submit(setPitch("C")).status, "no-op");

  const command = setPitch("D");
  assert.equal(created.value.submit(command).status, "committed");
  (
    command.payload as {
      writtenPitch: { step: "D" | "E"; alter: number; octave: number };
    }
  ).writtenPitch.step = "E";
  assert.equal(created.value.undo().status, "committed");
  assert.equal(created.value.redo().status, "committed");
  assert.equal(created.value.submit(setPitch("D")).status, "no-op");
});

test("invalid initialization returns semantic diagnostics without constructing a bus", () => {
  const invalid = cloneCoreScoreFixture();
  (invalid.metadata.tempo as { bpm: number }).bpm = -1;
  const result = getCommandApi().CommandBus.create(invalid);
  assert.equal(result.ok, false);
  if (result.ok) {
    return;
  }
  assert.equal(result.failure.code, "command.invalid-initial-document");
  assert.deepEqual(
    result.failure.diagnostics?.map(({ code }) => code),
    ["semantic.tempo-invalid"],
  );
});

test("CommandBus cannot bypass validated creation or expose live document state", () => {
  const { CommandBus } = getCommandApi();
  const created = CommandBus.create(cloneCoreScoreFixture());
  assert.equal(created.ok, true);
  if (!created.ok) {
    return;
  }
  assert.deepEqual(Reflect.ownKeys(created.value), []);
  assert.equal("state" in created.value, false);
  assert.equal("document" in created.value, false);
  assert.equal("getDocument" in created.value, false);
  assert.throws(() =>
    Reflect.construct(CommandBus as unknown as Function, [{}]),
  );
});

test("deterministic replay uses submit semantics and returns detached documents", () => {
  const { replay } = getCommandApi();
  const commands = [setMetadata("Replay"), setPitch("D"), setNoteValue(8)];
  const first = replay(cloneCoreScoreFixture(), commands);
  const second = replay(cloneCoreScoreFixture(), commands);
  assert.deepEqual(first, second);
  assert.equal(first.status, "replayed");
  if (first.status !== "replayed") {
    return;
  }
  assert.equal(first.documentVersion, 3);
  assert.deepEqual(
    first.results.map((result) => result.documentVersion),
    [1, 2, 3],
  );
  (first.finalDocument.metadata as { title: string }).title = "caller mutation";
  const third = replay(cloneCoreScoreFixture(), commands);
  assert.equal(third.status, "replayed");
  if (third.status === "replayed") {
    assert.equal(third.finalDocument.metadata.title, "Replay");
  }
});

test("attempted default-profile tampering cannot change replay classification", () => {
  const api = coreKernel as unknown as {
    readonly K1_SCORE_FEATURE_PROFILE: {
      readonly maximumNotesPerEvent: number;
    };
  };
  const { replay } = getCommandApi();
  const initial = incompleteFixture();
  const commands = [insertChord()];
  const before = replay(initial, commands);
  assert.equal(before.status, "replayed");
  if (before.status !== "replayed") {
    return;
  }
  assert.deepEqual(
    before.results[0]?.support?.diagnostics.map(({ code }) => code),
    ["unsupported.chord"],
  );

  const originalMaximum = api.K1_SCORE_FEATURE_PROFILE.maximumNotesPerEvent;
  try {
    assert.equal(
      Reflect.set(
        api.K1_SCORE_FEATURE_PROFILE,
        "maximumNotesPerEvent",
        2,
      ),
      false,
    );
    assert.deepEqual(replay(initial, commands), before);
  } finally {
    Reflect.set(
      api.K1_SCORE_FEATURE_PROFILE,
      "maximumNotesPerEvent",
      originalMaximum,
    );
  }
});

test("replay preserves no-op classification without inventing a version", () => {
  const result = getCommandApi().replay(cloneCoreScoreFixture(), [
    setPitch("C"),
    setPitch("D"),
    setPitch("D"),
  ]);
  assert.equal(result.status, "replayed");
  if (result.status !== "replayed") {
    return;
  }
  assert.deepEqual(
    result.results.map(({ status, documentVersion }) => [
      status,
      documentVersion,
    ]),
    [
      ["no-op", 0],
      ["committed", 1],
      ["no-op", 1],
    ],
  );
  assert.equal(result.documentVersion, 1);
});

test("replay stops at rejection and preserves deep unknown extensions", () => {
  const initial = cloneCoreScoreFixture();
  (initial.extensions as typeof initial.extensions[number][]).push({
    namespace: "com.example.deep-data",
    schemaVersion: 7,
    owner: { kind: "score" },
    payload: {
      nested: { array: [1, { future: [true, null, "kept"] }] },
    },
  });
  const expectedExtensions = structuredClone(initial.extensions);
  const rejected = getCommandApi().replay(initial, [
    setPitch("D"),
    baseEnvelope(
      "core.unknown",
      { kind: "document", documentId: "score-1" },
      {},
    ),
    setMetadata("must not run"),
  ]);
  assert.equal(rejected.status, "rejected");
  if (rejected.status !== "rejected") {
    return;
  }
  assert.equal(rejected.failedCommandIndex, 1);
  assert.equal(rejected.documentVersion, 1);
  assert.equal(rejected.results.length, 2);
  assert.deepEqual(rejected.finalDocument.extensions, expectedExtensions);
});
