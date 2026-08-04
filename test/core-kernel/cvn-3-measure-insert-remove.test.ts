import assert = require("node:assert/strict");
import { test } from "node:test";

import {
  createScoreDocument,
  replayCoreCommands,
  type KernelEvent,
  type ScoreAddress,
  type ScoreDocument,
  type Voice,
} from "../../src/core-kernel/index";
import {
  assertSynchronizedMeasureOrders,
  collectEvents,
  insertMeasureCommand,
  readDocument,
  removeMeasureCommand,
  requireBus,
} from "./fixtures/cvn-3-command-helpers";
import {
  cloneCvn3FactoryInput,
  cloneCvn3MeasureFixture,
  createCvn3InsertedVoices,
  createCvn3ShuffledMeasureFixture,
} from "./fixtures/cvn-3-score";

function addressesForVoices(voices: readonly Voice[]): ScoreAddress[] {
  const addresses: ScoreAddress[] = [];
  for (const voice of voices) {
    addresses.push({ kind: "voice", voiceId: voice.id });
    for (const event of voice.sequence.events) {
      addresses.push({ kind: "event", eventId: event.id });
      if (event.content.kind === "notes") {
        for (const note of event.content.notes) {
          addresses.push({ kind: "note", noteId: note.id });
        }
      }
    }
  }
  return addresses;
}

function expectedInsertAffected(
  measureId: string,
  contentsByPart: ReadonlyMap<string, readonly Voice[]>,
): readonly ScoreAddress[] {
  const affected: ScoreAddress[] = [
    { kind: "document", documentId: "cvn3-measure-score" },
    { kind: "measure", measureId },
  ];
  for (const partId of ["cvn3-part-a", "cvn3-part-b"] as const) {
    const voices = contentsByPart.get(partId);
    if (voices === undefined) {
      throw new Error(`missing expected insert content for ${partId}`);
    }
    affected.push({ kind: "part", partId }, ...addressesForVoices(voices));
  }
  return affected;
}

function expectedRemoveAffected(
  document: ScoreDocument,
  measureId: string,
): readonly ScoreAddress[] {
  const affected: ScoreAddress[] = [{ kind: "measure", measureId }];
  for (const part of document.parts) {
    const content = part.measureContents.find(
      (candidate) => candidate.measureId === measureId,
    );
    if (content === undefined) {
      throw new Error(`missing ${measureId} from ${part.id}`);
    }
    affected.push(
      { kind: "part", partId: part.id },
      ...addressesForVoices(content.voices),
    );
  }
  return affected;
}

function committedEvents(events: readonly KernelEvent[]): readonly Extract<
  KernelEvent,
  { readonly eventType: "core.document.committed" }
>[] {
  return events.filter(
    (
      event,
    ): event is Extract<KernelEvent, { readonly eventType: "core.document.committed" }> =>
      event.eventType === "core.document.committed",
  );
}

function requireSemanticFailure(
  result: ReturnType<ReturnType<typeof requireBus>["submit"]>,
): readonly { readonly code: string; readonly path: readonly (string | number)[] }[] {
  assert.equal(result.status, "rejected");
  if (result.status !== "rejected") {
    assert.fail("expected rejected result");
  }
  assert.equal(result.failure.code, "command.semantic-invalid");
  if (result.failure.code !== "command.semantic-invalid") {
    assert.fail("expected semantic failure");
  }
  return result.failure.diagnostics;
}

test("insert canonicalizes shuffled Part payloads, freezes capture, and emits canonical affected facts", () => {
  const bus = requireBus(createCvn3ShuffledMeasureFixture());
  const events = collectEvents(bus);
  const insertedMeasureId = "cvn3-measure-inserted";
  const voicesA = createCvn3InsertedVoices("cvn3-part-a", insertedMeasureId);
  const voicesB = createCvn3InsertedVoices("cvn3-part-b", insertedMeasureId);
  const command = insertMeasureCommand({
    anchor: { kind: "after-measure", measureId: "cvn3-measure-1" },
    definition: {
      id: insertedMeasureId,
      meter: { numerator: 4, denominator: 4 },
    },
    // Caller order is deliberately the reverse of the document Part order.
    contents: [
      { partId: "cvn3-part-b", voices: voicesB },
      { partId: "cvn3-part-a", voices: voicesA },
    ],
  });

  const result = bus.submit(command);
  assert.equal(result.status, "committed");
  assert.equal(result.documentVersion, 1);
  assert.equal(result.support.status, "unsupported");
  assert.deepEqual(result.support.diagnostics.map(({ code }) => code), [
    "unsupported.part-count",
  ]);

  const accepted = readDocument(bus);
  assert.deepEqual(accepted.measureDefinitions.map(({ id }) => id), [
    "cvn3-measure-1",
    insertedMeasureId,
    "cvn3-measure-2",
    "cvn3-measure-3",
  ]);
  assertSynchronizedMeasureOrders(accepted);
  assert.deepEqual(accepted.extensions, createCvn3ShuffledMeasureFixture().extensions);

  const expectedAffected = expectedInsertAffected(
    insertedMeasureId,
    new Map([
      ["cvn3-part-a", structuredClone(voicesA)],
      ["cvn3-part-b", structuredClone(voicesB)],
    ]),
  );

  const capturedOutput = structuredClone(accepted);
  const mutablePayload = command.payload as {
    definition: { id: string };
    contents: Array<{ voices: Array<{ id: string }> }>;
  };
  mutablePayload.definition.id = "caller-mutated-measure";
  mutablePayload.contents[0]!.voices[0]!.id = "caller-mutated-voice";
  assert.deepEqual(readDocument(bus), capturedOutput);

  assert.equal(events.length, 2);
  const committed = committedEvents(events);
  assert.equal(committed.length, 1);
  assert.deepEqual(committed[0]?.affectedEntities, expectedAffected);
  assert.equal(committed[0]?.commandId, "core.measure.insert");
  assert.equal(Object.isFrozen(committed[0]?.affectedEntities), true);
});

test("insert resolves target and anchor before final semantic coverage and preserves rejection state", () => {
  const source = cloneCvn3MeasureFixture();
  const bus = requireBus(source);
  const events = collectEvents(bus);
  const before = structuredClone(readDocument(bus));

  const missingPart = insertMeasureCommand({
    anchor: { kind: "start" },
    definition: { id: "cvn3-missing-part", meter: { numerator: 4, denominator: 4 } },
    contents: [
      {
        partId: "part-missing",
        voices: createCvn3InsertedVoices("cvn3-part-a", "cvn3-missing-part"),
      },
    ],
  });
  const missingPartResult = bus.submit(missingPart);
  assert.equal(missingPartResult.status, "rejected");
  assert.equal(
    missingPartResult.status === "rejected" && missingPartResult.failure.code,
    "command.target-not-found",
  );
  assert.deepEqual(readDocument(bus), before);

  const invalidAnchor = insertMeasureCommand({
    anchor: { kind: "after-measure", measureId: "measure-missing" },
    definition: { id: "cvn3-anchor-missing", meter: { numerator: 4, denominator: 4 } },
    contents: [
      {
        partId: "cvn3-part-a",
        voices: createCvn3InsertedVoices("cvn3-part-a", "cvn3-anchor-missing"),
      },
      {
        partId: "cvn3-part-b",
        voices: createCvn3InsertedVoices("cvn3-part-b", "cvn3-anchor-missing"),
      },
    ],
  });
  const invalidAnchorResult = bus.submit(invalidAnchor);
  assert.equal(invalidAnchorResult.status, "rejected");
  assert.equal(
    invalidAnchorResult.status === "rejected" && invalidAnchorResult.failure.code,
    "command.anchor-not-found",
  );
  assert.deepEqual(readDocument(bus), before);

  const missingCoverage = insertMeasureCommand({
    anchor: { kind: "start" },
    definition: { id: "cvn3-coverage-missing", meter: { numerator: 4, denominator: 4 } },
    contents: [
      {
        partId: "cvn3-part-a",
        voices: createCvn3InsertedVoices("cvn3-part-a", "cvn3-coverage-missing"),
      },
    ],
  });
  const missingCoverageDiagnostics = requireSemanticFailure(
    bus.submit(missingCoverage),
  );
  assert.equal(
    missingCoverageDiagnostics.some(
      ({ code }) => code === "semantic.measure-coverage-missing",
    ),
    true,
  );
  assert.deepEqual(readDocument(bus), before);

  const duplicateDefinition = insertMeasureCommand({
    anchor: { kind: "after-measure", measureId: "cvn3-measure-1" },
    definition: {
      id: "cvn3-measure-2",
      meter: { numerator: 4, denominator: 4 },
    },
    contents: [
      {
        partId: "cvn3-part-a",
        voices: createCvn3InsertedVoices("cvn3-part-a", "cvn3-measure-2"),
      },
      {
        partId: "cvn3-part-b",
        voices: createCvn3InsertedVoices("cvn3-part-b", "cvn3-measure-2"),
      },
    ],
  });
  const duplicateDiagnostics = requireSemanticFailure(bus.submit(duplicateDefinition));
  assert.deepEqual(duplicateDiagnostics, [
    {
      code: "semantic.id-duplicate",
      messageKey: "core.semantic.id-duplicate",
      path: ["measureDefinitions", 1, "id"],
      details: { id: "cvn3-measure-2" },
    },
  ]);
  assert.deepEqual(readDocument(bus), before);
  assert.equal(events.length, 0);
});

test("insert undo, redo, replay, and stored affected order exactly restore a shuffled pre-state", () => {
  const initial = createCvn3ShuffledMeasureFixture();
  const before = structuredClone(initial);
  const bus = requireBus(initial);
  const events = collectEvents(bus);
  const measureId = "cvn3-measure-history";
  const voicesA = createCvn3InsertedVoices("cvn3-part-a", measureId);
  const voicesB = createCvn3InsertedVoices("cvn3-part-b", measureId);
  const command = insertMeasureCommand({
    anchor: { kind: "after-measure", measureId: "cvn3-measure-2" },
    definition: { id: measureId, meter: { numerator: 4, denominator: 4 } },
    contents: [
      { partId: "cvn3-part-b", voices: voicesB },
      { partId: "cvn3-part-a", voices: voicesA },
    ],
  });
  const acceptedCommand = structuredClone(command);

  assert.equal(bus.submit(command).status, "committed");
  const afterInsert = structuredClone(readDocument(bus));
  assertSynchronizedMeasureOrders(afterInsert);
  assert.equal(bus.undo().status, "committed");
  assert.deepEqual(readDocument(bus), before);
  assert.equal(bus.redo().status, "committed");
  assert.deepEqual(readDocument(bus), afterInsert);

  const replay = replayCoreCommands(before, [acceptedCommand]);
  assert.equal(replay.status, "replayed");
  if (replay.status === "replayed") {
    assert.deepEqual(replay.finalDocument, afterInsert);
    assert.equal(replay.documentVersion, 1);
    assert.equal(replay.results[0]?.status, "committed");
  }

  const commits = committedEvents(events);
  assert.equal(commits.length, 3);
  const expectedAffected = expectedInsertAffected(
    measureId,
    new Map([
      ["cvn3-part-a", voicesA],
      ["cvn3-part-b", voicesB],
    ]),
  );
  commits.forEach((event) => assert.deepEqual(event.affectedEntities, expectedAffected));
});

test("remove deletes and restores the complete Measure aggregate while final-Measure removal is atomic", () => {
  const initial = createCvn3ShuffledMeasureFixture();
  const before = structuredClone(initial);
  const expectedAffected = expectedRemoveAffected(before, "cvn3-measure-1");
  const bus = requireBus(initial);
  const events = collectEvents(bus);

  const command = removeMeasureCommand("cvn3-measure-1");
  const acceptedCommand = structuredClone(command);
  const removed = bus.submit(command);
  assert.equal(removed.status, "committed");
  const afterRemoval = structuredClone(readDocument(bus));
  assert.deepEqual(afterRemoval.measureDefinitions.map(({ id }) => id), [
    "cvn3-measure-2",
    "cvn3-measure-3",
  ]);
  assertSynchronizedMeasureOrders(afterRemoval);
  assert.deepEqual(afterRemoval.extensions, before.extensions);
  assert.equal(JSON.stringify(afterRemoval).includes("cvn3-measure-1-voice"), false);
  assert.deepEqual(committedEvents(events)[0]?.affectedEntities, expectedAffected);

  assert.equal(bus.undo().status, "committed");
  assert.deepEqual(readDocument(bus), before);
  assert.equal(bus.redo().status, "committed");
  assert.deepEqual(readDocument(bus), afterRemoval);

  const replay = replayCoreCommands(before, [acceptedCommand]);
  assert.equal(replay.status, "replayed");
  if (replay.status === "replayed") {
    assert.deepEqual(replay.finalDocument, afterRemoval);
    assert.equal(replay.documentVersion, 1);
    assert.equal(replay.results[0]?.status, "committed");
  }

  const created = createScoreDocument(cloneCvn3FactoryInput());
  assert.equal(created.status, "created");
  if (created.status !== "created") {
    assert.fail("expected one-Measure factory document");
  }
  const finalBus = requireBus(created.document);
  const finalEvents = collectEvents(finalBus);
  const finalBefore = structuredClone(readDocument(finalBus));
  const finalRemoval = finalBus.submit(removeMeasureCommand("factory-measure"));
  const diagnostics = requireSemanticFailure(finalRemoval);
  assert.deepEqual(diagnostics, [
    {
      code: "semantic.measure-required",
      messageKey: "core.semantic.measure-required",
      path: ["measureDefinitions"],
    },
  ]);
  assert.deepEqual(readDocument(finalBus), finalBefore);
  assert.equal(finalEvents.length, 0);
});
