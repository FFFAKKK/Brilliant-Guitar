import { test } from "node:test";
import assert = require("node:assert/strict");

import { CommandBus, type ScoreDocument } from "../../src/core-kernel/index";
import { compileOfficialModuleCatalogV1 } from "../../src/core-kernel/module-sdk/index";
import { createCoreScoreFixture } from "./fixtures/core-score";
import {
  CVN6_MANIFEST,
  CVN6_REGISTRATION_ENTRIES,
  cvn6CallbackBehavior,
  cvn6CallbackCounts,
  cvn6CallbackTrace,
  resetCvn6Callbacks,
} from "./fixtures/cvn-6-synthetic-official-modules";

function setup(initialDocument: ScoreDocument = createCoreScoreFixture()) {
  const compiled = compileOfficialModuleCatalogV1(CVN6_MANIFEST, CVN6_REGISTRATION_ENTRIES);
  assert.equal(compiled.ok, true);
  if (!compiled.ok) throw new Error("catalog");
  const created = CommandBus.createIntegrated(initialDocument, compiled.catalog);
  assert.equal(created.ok, true);
  if (!created.ok) throw new Error("bus");
  return created.value;
}

const command = {
  commandVersion: 1,
  commandId: "fixture.score.apply",
  target: { kind: "document", documentId: "score-1" },
  payload: {
    noteId: "note-1",
    pitch: { step: "D", alter: 0, octave: 4 },
    schemaVersion: 1,
    marker: "score-one",
  },
} as const;

test("one module submit applies ordered Core plus owned-extension effects atomically", () => {
  const bus = setup();
  const events: unknown[] = [];
  bus.subscribe((event: unknown) => events.push(event));
  resetCvn6Callbacks();
  const result = bus.submit(command);
  assert.equal(result.status, "committed");
  assert.deepEqual(cvn6CallbackTrace, [
    "commandDecode:score",
    "commandPrepare:score",
    "effectDecode:score",
    "effectTransform:score",
    "validate:score",
    "classify:score",
  ]);
  const read = bus.read();
  assert.equal(read.ok, true);
  if (!read.ok) return;
  assert.equal(read.value.snapshot.documentVersion, 1);
  assert.equal(read.value.history.undoDepth, 1);
  assert.equal(
    read.value.snapshot.document.parts[0]?.measureContents[0]?.voices[0]
      ?.sequence.events[0]?.content.kind === "notes"
      ? read.value.snapshot.document.parts[0].measureContents[0].voices[0]
          .sequence.events[0].content.notes[0]?.writtenPitch.step
      : undefined,
    "D",
  );
  assert.deepEqual(read.value.snapshot.document.extensions, [{
    namespace: "fixture.score",
    schemaVersion: 1,
    owner: { kind: "score" },
    payload: { marker: "score-one" },
  }]);
  assert.deepEqual(events, [
    {
      eventVersion: 1,
      eventSequence: 1,
      eventType: "core.document.committed",
      documentId: "score-1",
      documentVersion: 1,
      cause: "submit",
      commandId: "fixture.score.apply",
      source: {
        kind: "module",
        moduleId: "fixture.score.module",
        contributionId: "fixture.score.contribution.v1",
      },
      affectedEntities: [
        { kind: "document", documentId: "score-1" },
        { kind: "note", noteId: "note-1" },
      ],
    },
    {
      eventVersion: 1,
      eventSequence: 2,
      eventType: "core.session.dirty-state-changed",
      documentId: "score-1",
      documentVersion: 1,
      cause: "submit",
      dirty: true,
    },
  ]);
});

test("undo and redo use stored effects without re-running command or effect callbacks", () => {
  const bus = setup();
  resetCvn6Callbacks();
  assert.equal(bus.submit(command).status, "committed");
  resetCvn6Callbacks();
  assert.equal(bus.undo().status, "committed");
  assert.deepEqual(cvn6CallbackCounts, {
    commandDecode: 0,
    commandPrepare: 0,
    validate: 0,
    classify: 0,
    effectDecode: 0,
    effectTransform: 0,
  });
  assert.equal(bus.redo().status, "committed");
  assert.deepEqual(cvn6CallbackCounts, {
    commandDecode: 0,
    commandPrepare: 0,
    validate: 1,
    classify: 1,
    effectDecode: 0,
    effectTransform: 0,
  });
});

test("module semantic rejection discards candidate, history, dirty state, and events", () => {
  const bus = setup();
  const events: unknown[] = [];
  bus.subscribe((event: unknown) => events.push(event));
  const before = bus.read();
  resetCvn6Callbacks();
  cvn6CallbackBehavior.validatorIssueModule = "score";
  const result = bus.submit(command);
  assert.equal(result.status, "rejected");
  if (result.status === "rejected") {
    assert.equal(result.failure.code, "command.contribution-semantic-invalid");
  }
  const after = bus.read();
  assert.deepEqual(after, before);
  assert.deepEqual(events, []);
  assert.equal(cvn6CallbackCounts.classify, 0);
});

test("Core semantic rejection precedes module validators and preserves all session state", () => {
  const initial = createCoreScoreFixture();
  const transposing: ScoreDocument = {
    ...initial,
    parts: [{
      ...initial.parts[0]!,
      instrument: {
        ...initial.parts[0]!.instrument,
        writtenToSounding: {
          diatonicSteps: 1,
          chromaticSemitones: 0,
        },
      },
    }],
  };
  const bus = setup(transposing);
  const events: unknown[] = [];
  bus.subscribe((event: unknown) => events.push(event));
  const before = bus.read();
  resetCvn6Callbacks();
  const result = bus.submit({
    ...command,
    payload: {
      ...command.payload,
      pitch: { step: "B", alter: 0, octave: 8 },
    },
  });
  assert.equal(result.status, "rejected");
  if (result.status === "rejected") {
    assert.equal(result.failure.code, "command.semantic-invalid");
  }
  assert.deepEqual(bus.read(), before);
  assert.deepEqual(events, []);
  assert.equal(cvn6CallbackCounts.validate, 0);
  assert.equal(cvn6CallbackCounts.classify, 0);
});

test("unsupported module classification is an assessment and may commit", () => {
  const bus = setup();
  resetCvn6Callbacks();
  cvn6CallbackBehavior.classifierUnsupportedModule = "score";
  const result = bus.submit(command);
  assert.equal(result.status, "committed");
  if (result.status === "committed") {
    assert.equal(result.assessment.modules[0]?.status, "unsupported");
    assert.equal(result.assessment.modules[0]?.issues.length, 1);
  }
});

test("observationally equal effects still validate and classify but remain a no-op", () => {
  const bus = setup();
  assert.equal(bus.submit(command).status, "committed");
  const before = bus.read();
  resetCvn6Callbacks();
  const result = bus.submit(command);
  assert.equal(result.status, "no-op");
  const after = bus.read();
  assert.deepEqual(after, before);
  assert.equal(cvn6CallbackCounts.validate, 1);
  assert.equal(cvn6CallbackCounts.classify, 1);
});
