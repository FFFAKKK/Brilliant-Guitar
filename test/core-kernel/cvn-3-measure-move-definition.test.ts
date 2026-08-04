import assert = require("node:assert/strict");
import { test } from "node:test";

import {
  replayCoreCommands,
  type KernelEvent,
  type ScoreDocument,
} from "../../src/core-kernel/index";
import {
  assertSynchronizedMeasureOrders,
  collectEvents,
  moveMeasureCommand,
  readDocument,
  requireBus,
  setMeasureDefinitionCommand,
} from "./fixtures/cvn-3-command-helpers";
import {
  cloneCvn3MeasureFixture,
  createCvn3ShuffledMeasureFixture,
} from "./fixtures/cvn-3-score";

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

function aggregateValues(document: ScoreDocument): unknown {
  return {
    definitions: Object.fromEntries(
      document.measureDefinitions.map((definition) => [
        definition.id,
        structuredClone(definition),
      ]),
    ),
    contents: document.parts.map((part) => ({
      partId: part.id,
      byMeasureId: Object.fromEntries(
        part.measureContents.map((content) => [
          content.measureId,
          structuredClone(content),
        ]),
      ),
    })),
    extensions: structuredClone(document.extensions),
  };
}

function withShortFirstMeasure(): ScoreDocument {
  const document = cloneCvn3MeasureFixture();
  for (const part of document.parts) {
    const content = part.measureContents.find(
      (candidate) => candidate.measureId === "cvn3-measure-1",
    );
    if (content === undefined) {
      throw new Error("expected first Measure content");
    }
    for (const voice of content.voices) {
      (voice.sequence.events as typeof voice.sequence.events[number][]).splice(1);
    }
  }
  return document;
}

test("move synchronizes all Part lists without changing aggregate values and preserves no-op/failure priority", () => {
  const initial = cloneCvn3MeasureFixture();
  const aggregateBefore = aggregateValues(initial);
  const bus = requireBus(initial);
  const events = collectEvents(bus);

  const moved = bus.submit(
    moveMeasureCommand("cvn3-measure-3", { kind: "start" }),
  );
  assert.equal(moved.status, "committed");
  const afterMove = readDocument(bus);
  assert.deepEqual(afterMove.measureDefinitions.map(({ id }) => id), [
    "cvn3-measure-3",
    "cvn3-measure-1",
    "cvn3-measure-2",
  ]);
  assertSynchronizedMeasureOrders(afterMove);
  assert.deepEqual(aggregateValues(afterMove), aggregateBefore);
  assert.deepEqual(committedEvents(events)[0]?.affectedEntities, [
    { kind: "measure", measureId: "cvn3-measure-3" },
    { kind: "part", partId: "cvn3-part-a" },
    { kind: "part", partId: "cvn3-part-b" },
  ]);

  const beforeNoOp = structuredClone(afterMove);
  const noOp = bus.submit(
    moveMeasureCommand("cvn3-measure-3", { kind: "start" }),
  );
  assert.equal(noOp.status, "no-op");
  assert.deepEqual(readDocument(bus), beforeNoOp);

  const selfReference = bus.submit(
    moveMeasureCommand("cvn3-measure-1", {
      kind: "after-measure",
      measureId: "cvn3-measure-1",
    }),
  );
  assert.equal(selfReference.status, "rejected");
  assert.equal(
    selfReference.status === "rejected" && selfReference.failure.code,
    "command.anchor-self-reference",
  );

  const missingTargetFirst = bus.submit(
    moveMeasureCommand("measure-missing", {
      kind: "after-measure",
      measureId: "measure-missing",
    }),
  );
  assert.equal(missingTargetFirst.status, "rejected");
  assert.equal(
    missingTargetFirst.status === "rejected" && missingTargetFirst.failure.code,
    "command.target-not-found",
  );

  const missingAnchor = bus.submit(
    moveMeasureCommand("cvn3-measure-1", {
      kind: "after-measure",
      measureId: "measure-missing",
    }),
  );
  assert.equal(missingAnchor.status, "rejected");
  assert.equal(
    missingAnchor.status === "rejected" && missingAnchor.failure.code,
    "command.anchor-not-found",
  );
  assert.deepEqual(readDocument(bus), beforeNoOp);
  assert.equal(committedEvents(events).length, 1);
});

test("move forward after a later Measure keeps every Part order synchronized", () => {
  const initial = cloneCvn3MeasureFixture();
  const aggregateBefore = aggregateValues(initial);
  const bus = requireBus(initial);

  const result = bus.submit(
    moveMeasureCommand("cvn3-measure-1", {
      kind: "after-measure",
      measureId: "cvn3-measure-3",
    }),
  );

  assert.equal(result.status, "committed");
  const afterMove = readDocument(bus);
  assert.deepEqual(afterMove.measureDefinitions.map(({ id }) => id), [
    "cvn3-measure-2",
    "cvn3-measure-3",
    "cvn3-measure-1",
  ]);
  assertSynchronizedMeasureOrders(afterMove);
  assert.deepEqual(aggregateValues(afterMove), aggregateBefore);
});

test("a requested global no-op normalizes shuffled Part order and its inverse restores every original order", () => {
  const initial = createCvn3ShuffledMeasureFixture();
  const before = structuredClone(initial);
  const bus = requireBus(initial);
  const events = collectEvents(bus);
  const command = moveMeasureCommand("cvn3-measure-2", {
    kind: "after-measure",
    measureId: "cvn3-measure-1",
  });
  const acceptedCommand = structuredClone(command);

  const result = bus.submit(command);
  assert.equal(result.status, "committed");
  const normalized = structuredClone(readDocument(bus));
  assertSynchronizedMeasureOrders(normalized);
  assert.deepEqual(normalized.measureDefinitions.map(({ id }) => id), [
    "cvn3-measure-1",
    "cvn3-measure-2",
    "cvn3-measure-3",
  ]);
  assert.equal(bus.undo().status, "committed");
  assert.deepEqual(readDocument(bus), before);
  assert.equal(bus.redo().status, "committed");
  assert.deepEqual(readDocument(bus), normalized);

  const replay = replayCoreCommands(before, [acceptedCommand]);
  assert.equal(replay.status, "replayed");
  if (replay.status === "replayed") {
    assert.deepEqual(replay.finalDocument, normalized);
    assert.equal(replay.results[0]?.status, "committed");
  }
  const commits = committedEvents(events);
  assert.equal(commits.length, 3);
  commits.forEach((event) =>
    assert.deepEqual(event.affectedEntities, [
      { kind: "measure", measureId: "cvn3-measure-2" },
      { kind: "part", partId: "cvn3-part-a" },
      { kind: "part", partId: "cvn3-part-b" },
    ]),
  );
});

test("set-definition preserves exact no-op, pickup add/remove, semantic rollback, profile classification, and history", () => {
  const fullBus = requireBus(cloneCvn3MeasureFixture());
  const fullEvents = collectEvents(fullBus);
  const fullBefore = structuredClone(readDocument(fullBus));
  const nonK1Meter = setMeasureDefinitionCommand(
    "cvn3-measure-1",
    { numerator: 2, denominator: 2 },
    { kind: "none" },
  );
  const meterResult = fullBus.submit(nonK1Meter);
  assert.equal(meterResult.status, "committed");
  assert.equal(meterResult.support.status, "unsupported");
  assert.deepEqual(meterResult.support.diagnostics.map(({ code }) => code), [
    "unsupported.part-count",
    "unsupported.meter",
  ]);
  const afterMeter = structuredClone(readDocument(fullBus));
  assert.deepEqual(afterMeter.extensions, fullBefore.extensions);
  assert.equal(
    afterMeter.measureDefinitions.find(({ id }) => id === "cvn3-measure-1")?.meter
      .numerator,
    2,
  );

  const meterNoOp = fullBus.submit(nonK1Meter);
  assert.equal(meterNoOp.status, "no-op");
  assert.deepEqual(readDocument(fullBus), afterMeter);
  assert.equal(committedEvents(fullEvents).length, 1);
  assert.deepEqual(committedEvents(fullEvents)[0]?.affectedEntities, [
    { kind: "measure", measureId: "cvn3-measure-1" },
  ]);

  const invalidDefinition = setMeasureDefinitionCommand(
    "cvn3-measure-2",
    { numerator: 3, denominator: 4 },
    { kind: "none" },
  );
  const rejected = fullBus.submit(invalidDefinition);
  assert.equal(rejected.status, "rejected");
  assert.equal(
    rejected.status === "rejected" && rejected.failure.code,
    "command.semantic-invalid",
  );
  if (rejected.status === "rejected" && rejected.failure.code === "command.semantic-invalid") {
    assert.equal(
      rejected.failure.diagnostics.some(
        ({ code }) => code === "semantic.sequence-exceeds-measure",
      ),
      true,
    );
  }
  assert.deepEqual(readDocument(fullBus), afterMeter);

  const pickupInitial = withShortFirstMeasure();
  const pickupBefore = structuredClone(pickupInitial);
  const pickupBus = requireBus(pickupInitial);
  const pickupEvents = collectEvents(pickupBus);
  const addPickup = setMeasureDefinitionCommand(
    "cvn3-measure-1",
    { numerator: 4, denominator: 4 },
    { kind: "duration", duration: { numerator: 1, denominator: 4 } },
  );
  const acceptedPickup = structuredClone(addPickup);
  const pickupResult = pickupBus.submit(addPickup);
  assert.equal(pickupResult.status, "committed");
  assert.equal(pickupResult.support.status, "unsupported");
  assert.equal(
    pickupResult.support.diagnostics.some(({ code }) => code === "unsupported.pickup"),
    true,
  );
  const afterPickup = structuredClone(readDocument(pickupBus));
  assert.deepEqual(
    afterPickup.measureDefinitions.find(({ id }) => id === "cvn3-measure-1")
      ?.pickupDuration,
    { numerator: 1, denominator: 4 },
  );
  assert.equal(pickupBus.undo().status, "committed");
  assert.deepEqual(readDocument(pickupBus), pickupBefore);
  assert.equal(pickupBus.redo().status, "committed");
  assert.deepEqual(readDocument(pickupBus), afterPickup);

  const removePickup = setMeasureDefinitionCommand(
    "cvn3-measure-1",
    { numerator: 4, denominator: 4 },
    { kind: "none" },
  );
  assert.equal(pickupBus.submit(removePickup).status, "committed");
  assert.equal(
    "pickupDuration" in
      readDocument(pickupBus).measureDefinitions.find(
        ({ id }) => id === "cvn3-measure-1",
      )!,
    false,
  );

  const replay = replayCoreCommands(pickupBefore, [acceptedPickup]);
  assert.equal(replay.status, "replayed");
  if (replay.status === "replayed") {
    assert.deepEqual(replay.finalDocument, afterPickup);
  }
  assert.equal(committedEvents(pickupEvents).length, 4);
});
