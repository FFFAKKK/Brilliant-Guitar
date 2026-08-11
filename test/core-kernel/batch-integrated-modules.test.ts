import assert = require("node:assert/strict");
import { test } from "node:test";

import {
  CommandBus,
  type IntegratedCommandBus,
  type IntegratedKernelEvent,
} from "../../src/core-kernel/index";
import { compileOfficialModuleCatalogV1 } from "../../src/core-kernel/module-sdk/index";
import { createCoreScoreFixture } from "./fixtures/core-score";
import {
  CVN6_MANIFEST,
  CVN6_REGISTRATION_ENTRIES,
  cvn6CallbackBehavior,
  cvn6CallbackCounts,
  resetCvn6Callbacks,
} from "./fixtures/cvn-6-synthetic-official-modules";
import {
  CVN5_BATCH_MANIFEST,
  CVN5_BATCH_REGISTRATION_ENTRIES,
} from "./fixtures/cvn-5-batch-official-modules";

function setup(): IntegratedCommandBus {
  const compiled = compileOfficialModuleCatalogV1(
    CVN6_MANIFEST,
    CVN6_REGISTRATION_ENTRIES,
  );
  assert.equal(compiled.ok, true);
  if (!compiled.ok) {
    assert.fail("expected compiled CVN-6 fixture catalog");
  }
  const created = CommandBus.createIntegrated(
    createCoreScoreFixture(),
    compiled.catalog,
  );
  assert.equal(created.ok, true);
  if (!created.ok) {
    assert.fail("expected integrated CVN-5 bus");
  }
  return created.value;
}

function setupBatchFixture(): IntegratedCommandBus {
  const compiled = compileOfficialModuleCatalogV1(
    CVN5_BATCH_MANIFEST,
    CVN5_BATCH_REGISTRATION_ENTRIES,
  );
  assert.equal(compiled.ok, true);
  if (!compiled.ok) {
    assert.fail("expected compiled CVN-5 batch fixture catalog");
  }
  const created = CommandBus.createIntegrated(
    createCoreScoreFixture(),
    compiled.catalog,
  );
  assert.equal(created.ok, true);
  if (!created.ok) {
    assert.fail("expected integrated CVN-5 batch fixture bus");
  }
  return created.value;
}

const moduleCommand = {
  commandVersion: 1,
  commandId: "fixture.score.apply",
  target: { kind: "document", documentId: "score-1" },
  payload: {
    noteId: "note-1",
    pitch: { step: "E", alter: 0, octave: 4 },
    schemaVersion: 1,
    marker: "batch-module",
  },
} as const;

const coreCommand = {
  commandVersion: 1,
  commandId: "core.document.set-metadata",
  target: { kind: "document", documentId: "score-1" },
  payload: {
    metadata: {
      title: "Integrated batch",
      authors: ["Brilliant Guitar"],
      tempo: { bpm: 120 },
    },
  },
} as const;

function batch(commands: readonly unknown[]): unknown {
  return {
    commandVersion: 1,
    commandId: "core.transaction.batch",
    target: { kind: "document", documentId: "score-1" },
    payload: { commands },
  };
}

test("mixed Core/module batch commits once with outer Core identity", () => {
  const bus = setup();
  const events: IntegratedKernelEvent[] = [];
  bus.subscribe((event: IntegratedKernelEvent) => {
    events.push(event);
  });
  resetCvn6Callbacks();

  const result = bus.submit(batch([coreCommand, moduleCommand]));
  assert.equal(result.status, "committed");
  assert.equal(result.documentVersion, 1);
  assert.equal(result.undoDepth, 1);
  assert.equal(cvn6CallbackCounts.commandDecode, 1);
  assert.equal(cvn6CallbackCounts.commandPrepare, 1);
  assert.equal(cvn6CallbackCounts.validate, 1);
  assert.equal(cvn6CallbackCounts.classify, 1);

  const read = bus.read();
  assert.equal(read.ok, true);
  if (!read.ok) {
    assert.fail("expected readable mixed batch state");
  }
  assert.equal(read.value.snapshot.document.metadata.title, "Integrated batch");
  assert.equal(
    read.value.snapshot.document.parts[0]?.measureContents[0]?.voices[0]
      ?.sequence.events[0]?.content.kind === "notes"
      ? read.value.snapshot.document.parts[0].measureContents[0].voices[0]
          .sequence.events[0].content.notes[0]?.writtenPitch.step
      : undefined,
    "E",
  );
  const committed = events.find(
    (event) => event.eventType === "core.document.committed",
  );
  assert.equal(committed?.eventType, "core.document.committed");
  if (committed?.eventType === "core.document.committed") {
    assert.equal(committed.commandId, "core.transaction.batch");
    assert.deepEqual(committed.source, { kind: "core" });
  }

  resetCvn6Callbacks();
  assert.equal(bus.undo().status, "committed");
  assert.equal(cvn6CallbackCounts.commandDecode, 0);
  assert.equal(cvn6CallbackCounts.commandPrepare, 0);
  assert.equal(bus.redo().status, "committed");
  assert.equal(cvn6CallbackCounts.commandDecode, 0);
  assert.equal(cvn6CallbackCounts.commandPrepare, 0);
});

test("module child failure is wrapped and discards earlier Core changes", () => {
  const bus = setup();
  const before = bus.read();
  resetCvn6Callbacks();
  cvn6CallbackBehavior.malformedFamily = "commandPrepare";

  const result = bus.submit(batch([coreCommand, moduleCommand]));
  assert.equal(result.status, "rejected");
  if (result.status === "rejected") {
    assert.equal(result.failure.code, "command.batch-child-rejected");
    if (result.failure.code === "command.batch-child-rejected") {
      assert.equal(result.failure.failedCommandIndex, 1);
      assert.equal(
        result.failure.failure.code,
        "command.contribution-contract-violation",
      );
    }
  }
  assert.deepEqual(bus.read(), before);
  assert.equal(cvn6CallbackCounts.validate, 0);
  assert.equal(cvn6CallbackCounts.classify, 0);
});

test("integrated all-no-op batch still runs final module pipeline once", () => {
  const bus = setup();
  resetCvn6Callbacks();
  assert.equal(bus.submit(moduleCommand).status, "committed");
  resetCvn6Callbacks();
  const noOpCore = {
    ...coreCommand,
    payload: {
      metadata: {
        title: "Core fixture",
        authors: ["Brilliant Guitar"],
        tempo: { bpm: 120 },
      },
    },
  };
  const result = bus.submit(batch([noOpCore]));
  assert.equal(result.status, "no-op");
  assert.equal(result.documentVersion, 1);
  assert.equal(cvn6CallbackCounts.validate, 1);
  assert.equal(cvn6CallbackCounts.classify, 1);
});

test("same-value module child is a no-op and preserves an existing redo branch", () => {
  const bus = setup();
  const changedAgain = {
    ...moduleCommand,
    payload: {
      ...moduleCommand.payload,
      pitch: { step: "F" as const, alter: 0 as const, octave: 4 },
      marker: "batch-module-second",
    },
  };
  assert.equal(bus.submit(moduleCommand).status, "committed");
  assert.equal(bus.submit(changedAgain).status, "committed");
  assert.equal(bus.undo().status, "committed");
  const before = bus.read();
  const events: IntegratedKernelEvent[] = [];
  bus.subscribe((event: IntegratedKernelEvent) => events.push(event));
  resetCvn6Callbacks();

  const result = bus.submit(batch([moduleCommand]));

  assert.equal(result.status, "no-op");
  assert.equal(result.documentVersion, 3);
  assert.equal(result.undoDepth, 1);
  assert.equal(result.redoDepth, 1);
  assert.deepEqual(bus.read(), before);
  assert.deepEqual(events, []);
  assert.equal(cvn6CallbackCounts.commandDecode, 1);
  assert.equal(cvn6CallbackCounts.commandPrepare, 1);
  assert.equal(cvn6CallbackCounts.validate, 1);
  assert.equal(cvn6CallbackCounts.classify, 1);
});

test("effective module change followed by restore still commits as one batch", () => {
  const bus = setupBatchFixture();
  const before = bus.read();
  const observe = (step: "C" | "E") => ({
    commandVersion: 1,
    commandId: "fixture.batch.observe-title",
    target: { kind: "document", documentId: "score-1" },
    payload: {
      expectedTitle: "Core fixture",
      noteId: "note-1",
      pitch: { step, alter: 0, octave: 4 },
    },
  });

  const result = bus.submit(batch([observe("E"), observe("C")]));

  assert.equal(result.status, "committed");
  assert.equal(result.documentVersion, 1);
  assert.equal(result.undoDepth, 1);
  const after = bus.read();
  assert.equal(after.ok, true);
  assert.equal(before.ok, true);
  if (after.ok && before.ok) {
    assert.deepEqual(
      after.value.snapshot.document,
      before.value.snapshot.document,
    );
  }
  assert.equal(bus.undo().status, "committed");
  assert.equal(bus.redo().status, "committed");
});

test("mixed Core/module batch with no effective child preserves all state", () => {
  const bus = setupBatchFixture();
  const before = bus.read();
  const samePitch = {
    commandVersion: 1,
    commandId: "fixture.batch.observe-title",
    target: { kind: "document", documentId: "score-1" },
    payload: {
      expectedTitle: "Core fixture",
      noteId: "note-1",
      pitch: { step: "C", alter: 0, octave: 4 },
    },
  };
  const sameMetadata = {
    ...coreCommand,
    payload: {
      metadata: {
        title: "Core fixture",
        authors: ["Brilliant Guitar"],
        tempo: { bpm: 120 },
      },
    },
  };

  const result = bus.submit(batch([sameMetadata, samePitch]));

  assert.equal(result.status, "no-op");
  assert.equal(result.documentVersion, 0);
  assert.equal(result.undoDepth, 0);
  assert.equal(result.redoDepth, 0);
  assert.deepEqual(bus.read(), before);
});

test("module child prepares from the candidate changed by an earlier Core child", () => {
  const bus = setupBatchFixture();
  const observeChangedTitle = {
    commandVersion: 1,
    commandId: "fixture.batch.observe-title",
    target: { kind: "document", documentId: "score-1" },
    payload: {
      expectedTitle: "Integrated batch",
      noteId: "note-1",
      pitch: { step: "F", alter: 1, octave: 4 },
    },
  } as const;

  const isolated = bus.submit(observeChangedTitle);
  assert.equal(isolated.status, "rejected");
  if (isolated.status === "rejected") {
    assert.equal(
      isolated.failure.code,
      "command.contribution-semantic-invalid",
    );
  }

  const result = bus.submit(batch([coreCommand, observeChangedTitle]));
  assert.equal(result.status, "committed");
  assert.equal(result.documentVersion, 1);
  assert.equal(result.undoDepth, 1);
  const read = bus.read();
  assert.equal(read.ok, true);
  if (!read.ok) {
    assert.fail("expected readable shared candidate state");
  }
  assert.equal(read.value.snapshot.document.metadata.title, "Integrated batch");
  const firstEvent = read.value.snapshot.document.parts[0]
    ?.measureContents[0]?.voices[0]?.sequence.events[0];
  assert.equal(firstEvent?.content.kind, "notes");
  if (firstEvent?.content.kind === "notes") {
    assert.deepEqual(firstEvent.content.notes[0]?.writtenPitch, {
      step: "F",
      alter: 1,
      octave: 4,
    });
  }
});

test("cached unavailable and incompatible states reject before batch reflection or callbacks", () => {
  const missingManifest = {
    ...CVN6_MANIFEST,
    modules: CVN6_MANIFEST.modules.filter(
      (module) => module.moduleId !== "fixture.part.module",
    ),
  };
  const missingEntries = CVN6_REGISTRATION_ENTRIES.filter(
    (entry) => entry.ownerModuleId !== "fixture.part.module",
  );
  const missingCompiled = compileOfficialModuleCatalogV1(
    missingManifest,
    missingEntries,
  );
  assert.equal(missingCompiled.ok, true);
  if (!missingCompiled.ok) {
    assert.fail("expected catalog with the Part contribution absent");
  }
  const requiredDocument = {
    ...createCoreScoreFixture(),
    extensions: [{
      namespace: "fixture.part",
      schemaVersion: 1,
      owner: { kind: "part" as const, partId: "part-1" },
      payload: {},
    }],
  };
  const inventory = {
    inventoryVersion: 1,
    requirements: [
      {
        requirementVersion: 1,
        namespace: "fixture.score",
        moduleId: "fixture.score.module",
        contributionId: "fixture.score.contribution.v1",
        supportedSchemaVersions: [1, 2],
        requiredForWrite: true,
      },
      {
        requirementVersion: 1,
        namespace: "fixture.part",
        moduleId: "fixture.part.module",
        contributionId: "fixture.part.contribution.v1",
        supportedSchemaVersions: [1, 2],
        requiredForWrite: true,
      },
    ],
  };
  const missingCreated = CommandBus.createIntegrated(
    requiredDocument,
    missingCompiled.catalog,
    inventory,
  );
  assert.equal(missingCreated.ok, true);
  if (!missingCreated.ok) {
    assert.fail("expected read-only bus with an unavailable contribution");
  }

  const fullCompiled = compileOfficialModuleCatalogV1(
    CVN6_MANIFEST,
    CVN6_REGISTRATION_ENTRIES,
  );
  assert.equal(fullCompiled.ok, true);
  if (!fullCompiled.ok) {
    assert.fail("expected full CVN-6 catalog");
  }
  const incompatibleCreated = CommandBus.createIntegrated(
    {
      ...requiredDocument,
      extensions: [{
        ...requiredDocument.extensions[0]!,
        schemaVersion: 999,
      }],
    },
    fullCompiled.catalog,
  );
  assert.equal(incompatibleCreated.ok, true);
  if (!incompatibleCreated.ok) {
    assert.fail("expected read-only bus with an incompatible contribution");
  }

  for (const [bus, expectedCode] of [
    [
      missingCreated.value,
      "command.required-contribution-unavailable",
    ],
    [
      incompatibleCreated.value,
      "command.required-contribution-incompatible",
    ],
  ] as const) {
    let reflectionCalls = 0;
    const input = new Proxy(batch([coreCommand]) as object, {
      ownKeys() {
        reflectionCalls += 1;
        throw new Error("blocked availability must win before reflection");
      },
    });
    const before = bus.read();
    const events: IntegratedKernelEvent[] = [];
    bus.subscribe((event: IntegratedKernelEvent) => events.push(event));
    resetCvn6Callbacks();
    const result = bus.submit(input);
    assert.equal(result.status, "rejected");
    if (result.status === "rejected") {
      assert.equal(result.failure.code, expectedCode);
    }
    assert.equal(reflectionCalls, 0);
    assert.deepEqual(cvn6CallbackCounts, {
      commandDecode: 0,
      commandPrepare: 0,
      validate: 0,
      classify: 0,
      effectDecode: 0,
      effectTransform: 0,
    });
    assert.deepEqual(bus.read(), before);
    assert.deepEqual(events, []);
  }
});
