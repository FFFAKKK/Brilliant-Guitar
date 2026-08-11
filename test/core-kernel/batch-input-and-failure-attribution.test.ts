import assert = require("node:assert/strict");
import { test } from "node:test";

import { CommandBus } from "../../src/core-kernel/index";
import {
  createCommandRuntime,
  submitCommand,
  type CommandRuntimeState,
} from "../../src/core-kernel/commands/runtime";
import { cloneCoreScoreFixture } from "./fixtures/core-score";

function requireBus(): CommandBus {
  const created = CommandBus.create(cloneCoreScoreFixture());
  assert.equal(created.ok, true);
  if (!created.ok) {
    assert.fail("expected valid Core batch fixture");
  }
  return created.value;
}

function batch(commands: readonly unknown[]): Record<string, unknown> {
  return {
    commandVersion: 1,
    commandId: "core.transaction.batch",
    target: { kind: "document", documentId: "score-1" },
    payload: { commands },
  };
}

function metadata(title: string): unknown {
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

test("outer validation stages precede every child failure", () => {
  const bus = requireBus();
  const invalidChild = {
    commandVersion: 1,
    commandId: "core.unknown",
    target: { kind: "document", documentId: "score-1" },
    payload: {},
  };

  assert.deepEqual(
    bus.submit({ ...batch([invalidChild]), commandVersion: 2 }),
    {
      status: "rejected",
      failure: { code: "command.unsupported-version" },
      documentVersion: 0,
      undoDepth: 0,
      redoDepth: 0,
    },
  );
  assert.deepEqual(
    bus.submit({
      ...batch([]),
      target: { kind: "note", noteId: "note-1" },
    }),
    {
      status: "rejected",
      failure: { code: "command.target-mismatch" },
      documentVersion: 0,
      undoDepth: 0,
      redoDepth: 0,
    },
  );
});

test("the lowest failing child index wins with exactly one wrapper", () => {
  const bus = requireBus();
  const result = bus.submit(
    batch([
      metadata("prepared first"),
      {
        commandVersion: 2,
        commandId: "core.document.set-metadata",
        target: { kind: "document", documentId: "score-1" },
        payload: {},
      },
      {
        commandVersion: 1,
        commandId: "core.unknown",
        target: { kind: "document", documentId: "score-1" },
        payload: {},
      },
    ]),
  );

  assert.equal(result.status, "rejected");
  if (result.status === "rejected") {
    assert.deepEqual(result.failure, {
      code: "command.batch-child-rejected",
      failedCommandIndex: 1,
      failure: { code: "command.unsupported-version" },
    });
    assert.notEqual(
      result.failure.code === "command.batch-child-rejected" &&
        result.failure.failure.code,
      "command.batch-child-rejected",
    );
  }
  const read = bus.read();
  assert.equal(read.ok, true);
  if (read.ok) {
    assert.equal(read.value.snapshot.document.metadata.title, "Core fixture");
    assert.equal(read.value.snapshot.documentVersion, 0);
    assert.deepEqual(read.value.history, { undoDepth: 0, redoDepth: 0 });
  }
});

test("final semantic failure is top-level rather than child-attributed", () => {
  const bus = requireBus();
  const before = bus.read();
  const result = bus.submit(
    batch([
      {
        commandVersion: 1,
        commandId: "core.range.delete",
        target: { kind: "document", documentId: "score-1" },
        payload: {
          range: {
            kind: "measure-range",
            start: { kind: "measure", measureId: "measure-1" },
            end: { kind: "measure", measureId: "measure-1" },
          },
        },
      },
    ]),
  );

  assert.equal(result.status, "rejected");
  if (result.status === "rejected") {
    assert.equal(result.failure.code, "command.semantic-invalid");
  }
  assert.deepEqual(bus.read(), before);
});

test("a later child may repair an intermediate semantic-invalid candidate", () => {
  const bus = requireBus();
  const removeOnlyMeasure = {
    commandVersion: 1,
    commandId: "core.range.delete",
    target: { kind: "document", documentId: "score-1" },
    payload: {
      range: {
        kind: "measure-range",
        start: { kind: "measure", measureId: "measure-1" },
        end: { kind: "measure", measureId: "measure-1" },
      },
    },
  };
  const insertReplacement = {
    commandVersion: 1,
    commandId: "core.measure.insert",
    target: { kind: "document", documentId: "score-1" },
    payload: {
      anchor: { kind: "start" },
      definition: {
        id: "batch-replacement-measure",
        meter: { numerator: 4, denominator: 4 },
      },
      contents: [
        {
          partId: "part-1",
          voices: [
            {
              id: "batch-replacement-voice",
              defaultStaffId: "staff-1",
              sequence: {
                start: { numerator: 0, denominator: 1 },
                events: [
                  {
                    id: "batch-replacement-rest",
                    duration: { base: 1, dots: 0 },
                    content: { kind: "rest" },
                  },
                ],
              },
            },
          ],
        },
      ],
    },
  };

  const result = bus.submit(batch([removeOnlyMeasure, insertReplacement]));
  assert.equal(result.status, "committed");
  assert.equal(result.documentVersion, 1);
  const read = bus.read();
  assert.equal(read.ok, true);
  if (read.ok) {
    assert.deepEqual(
      read.value.snapshot.document.measureDefinitions.map(({ id }) => id),
      ["batch-replacement-measure"],
    );
    assert.deepEqual(
      read.value.snapshot.document.parts[0]?.measureContents.map(
        ({ measureId }) => measureId,
      ),
      ["batch-replacement-measure"],
    );
  }
});

test("Core batch classification precedes version and history capacity checks", () => {
  const created = createCommandRuntime(cloneCoreScoreFixture());
  assert.equal(created.ok, true);
  if (!created.ok) {
    assert.fail("expected valid Core runtime fixture");
  }
  let classifyCalls = 0;
  const hooks = {
    classify: (document: CommandRuntimeState["document"]) => {
      classifyCalls += 1;
      return created.state.assembly.classify(document);
    },
  };
  const effectiveBatch = batch([metadata("capacity ordering")]);
  const overflow: CommandRuntimeState = {
    ...created.state,
    documentVersion: Number.MAX_SAFE_INTEGER,
  };

  const versionFailure = submitCommand(overflow, effectiveBatch, hooks);

  assert.equal(versionFailure.result.status, "rejected");
  if (versionFailure.result.status === "rejected") {
    assert.equal(versionFailure.result.failure.code, "command.version-overflow");
  }
  assert.equal(versionFailure.state, overflow);
  assert.equal(classifyCalls, 1);

  classifyCalls = 0;
  const invalidHistory: CommandRuntimeState = {
    ...created.state,
    nextHistorySequence: 0,
  };
  const historyFailure = submitCommand(invalidHistory, effectiveBatch, hooks);

  assert.equal(historyFailure.result.status, "rejected");
  if (historyFailure.result.status === "rejected") {
    assert.equal(
      historyFailure.result.failure.code,
      "history.invariant-violation",
    );
  }
  assert.equal(historyFailure.state, invalidHistory);
  assert.equal(classifyCalls, 1);
});
