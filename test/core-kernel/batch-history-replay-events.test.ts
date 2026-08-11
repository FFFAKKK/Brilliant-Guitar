import assert = require("node:assert/strict");
import { test } from "node:test";

import {
  replayCoreCommands,
  replayKernelCommands,
} from "../../src/core-kernel/index";
import {
  createCommandRuntime,
  submitCommand,
} from "../../src/core-kernel/commands/runtime";
import { compileOfficialModuleCatalogV1 } from "../../src/core-kernel/module-sdk/index";
import { createCoreScoreFixture } from "./fixtures/core-score";
import {
  CVN6_MANIFEST,
  CVN6_REGISTRATION_ENTRIES,
  resetCvn6Callbacks,
} from "./fixtures/cvn-6-synthetic-official-modules";

const coreChild = {
  commandVersion: 1,
  commandId: "core.document.set-metadata",
  target: { kind: "document", documentId: "score-1" },
  payload: {
    metadata: {
      title: "Replay batch",
      authors: ["Brilliant Guitar"],
      tempo: { bpm: 120 },
    },
  },
} as const;

const moduleChild = {
  commandVersion: 1,
  commandId: "fixture.score.apply",
  target: { kind: "document", documentId: "score-1" },
  payload: {
    noteId: "note-1",
    pitch: { step: "F", alter: 0, octave: 4 },
    schemaVersion: 1,
    marker: "batch-replay",
  },
} as const;

function batch(commands: readonly unknown[]) {
  return {
    commandVersion: 1,
    commandId: "core.transaction.batch",
    target: { kind: "document", documentId: "score-1" },
    payload: { commands },
  } as const;
}

test("Core history stores frozen detached effective child boundaries", () => {
  const created = createCommandRuntime(createCoreScoreFixture());
  assert.equal(created.ok, true);
  if (!created.ok) {
    assert.fail("expected Core history fixture");
  }
  const first = structuredClone(coreChild);
  const second = {
    ...structuredClone(coreChild),
    payload: {
      metadata: {
        title: "Replay batch second",
        authors: ["Brilliant Guitar"],
        tempo: { bpm: 120 },
      },
    },
  };
  const input = batch([first, second]);

  const transition = submitCommand(created.state, input);

  assert.equal(transition.result.status, "committed");
  const entry = transition.state.undoStack[0];
  assert.notEqual(entry, undefined);
  assert.equal(entry?.command.commandId, "core.transaction.batch");
  assert.equal(Object.isFrozen(entry), true);
  assert.equal(Object.isFrozen(entry?.batchSegments), true);
  assert.equal(entry?.batchSegments?.length, 2);
  assert.deepEqual(
    entry?.batchSegments?.map(({ childIndex, source, forward, inverse }) => ({
      childIndex,
      source,
      forwardLength: forward.length,
      inverseLength: inverse.length,
    })),
    [
      {
        childIndex: 0,
        source: { kind: "core" },
        forwardLength: 1,
        inverseLength: 1,
      },
      {
        childIndex: 1,
        source: { kind: "core" },
        forwardLength: 1,
        inverseLength: 1,
      },
    ],
  );
  assert.equal(entry?.forward.length, 2);
  assert.equal(entry?.inverse.length, 2);
  assert.equal(Object.isFrozen(entry?.batchSegments?.[0]?.source), true);
  (first as { payload: { metadata: { title: string } } }).payload.metadata.title =
    "mutated after submit";
  const stored = entry?.command as unknown as
    | {
        readonly commandId: "core.transaction.batch";
        readonly payload: {
          readonly commands: readonly {
            readonly payload: { readonly metadata: { readonly title: string } };
          }[];
        };
      }
    | undefined;
  assert.equal(
    stored?.commandId === "core.transaction.batch"
      ? stored.payload.commands[0]?.payload.metadata.title
      : undefined,
    "Replay batch",
  );
});

test("Core replay reroutes a batch as one semantic envelope", () => {
  const replayed = replayCoreCommands(
    createCoreScoreFixture(),
    [batch([coreChild])],
  );
  assert.equal(replayed.status, "replayed");
  if (replayed.status !== "replayed") {
    assert.fail("expected Core batch replay");
  }
  assert.equal(replayed.documentVersion, 1);
  assert.equal(replayed.results.length, 1);
  assert.equal(replayed.results[0]?.status, "committed");
  assert.equal(replayed.finalDocument.metadata.title, "Replay batch");
});

test("Core replay wraps a module child at the inner batch index", () => {
  const replayed = replayCoreCommands(
    createCoreScoreFixture(),
    [batch([coreChild, moduleChild])],
  );
  assert.equal(replayed.status, "rejected");
  if (replayed.status !== "rejected") {
    assert.fail("expected Core-only replay rejection");
  }
  assert.equal(replayed.failedCommandIndex, 0);
  assert.deepEqual(replayed.failure, {
    code: "command.batch-child-rejected",
    failedCommandIndex: 1,
    failure: { code: "command.unknown-id" },
  });
  assert.equal(replayed.documentVersion, 0);
});

test("integrated replay supports mixed children and preserves outer replay index", () => {
  const compiled = compileOfficialModuleCatalogV1(
    CVN6_MANIFEST,
    CVN6_REGISTRATION_ENTRIES,
  );
  assert.equal(compiled.ok, true);
  if (!compiled.ok) {
    assert.fail("expected integrated replay catalog");
  }
  resetCvn6Callbacks();
  const replayed = replayKernelCommands(
    createCoreScoreFixture(),
    [batch([coreChild, moduleChild])],
    compiled.catalog,
  );
  assert.equal(replayed.status, "replayed");
  if (replayed.status !== "replayed") {
    assert.fail("expected integrated mixed replay");
  }
  assert.equal(replayed.documentVersion, 1);
  assert.equal(replayed.results[0]?.status, "committed");
  assert.equal(replayed.finalDocument.metadata.title, "Replay batch");
  assert.equal(replayed.finalDocument.extensions[0]?.payload.marker, "batch-replay");
});
