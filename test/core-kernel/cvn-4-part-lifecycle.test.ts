import assert = require("node:assert/strict");
import { test } from "node:test";

import {
  collectEvents,
  committedEvents,
  insertPartCommand,
  movePartCommand,
  partOrder,
  readDocument,
  removePartCommand,
  requireBus,
  setPartInstrumentCommand,
  setPartNameCommand,
} from "./fixtures/cvn-4-command-helpers";
import {
  cloneCvn4ScoreFixture,
  createCvn4InsertedPart,
} from "./fixtures/cvn-4-score";

function assertRejectedCode(
  result: ReturnType<ReturnType<typeof requireBus>["submit"]>,
  code: string,
): void {
  assert.equal(result.status, "rejected");
  if (result.status !== "rejected") {
    assert.fail("expected rejected CVN-4 command");
  }
  assert.equal(result.failure.code, code);
}

function assertSemanticDiagnostic(
  result: ReturnType<ReturnType<typeof requireBus>["submit"]>,
  code: string,
): void {
  assertRejectedCode(result, "command.semantic-invalid");
  if (result.status !== "rejected" || result.failure.code !== "command.semantic-invalid") {
    assert.fail("expected semantic CVN-4 rejection");
  }
  assert.equal(
    result.failure.diagnostics.some((diagnostic) => diagnostic.code === code),
    true,
  );
}

test("Part insert canonicalizes complete coverage in global Measure order and detaches input", () => {
  const bus = requireBus(cloneCvn4ScoreFixture());
  const events = collectEvents(bus);
  const inserted = createCvn4InsertedPart();
  const result = bus.submit(insertPartCommand({ kind: "after-part", partId: "cvn4-part-a" }, inserted));

  assert.equal(result.status, "committed");
  assert.equal(result.status === "committed" && result.support.status, "unsupported");
  assert.deepEqual(partOrder(readDocument(bus)), [
    "cvn4-part-a",
    "cvn4-part-inserted",
    "cvn4-part-b",
    "cvn4-part-c",
  ]);
  const stored = readDocument(bus).parts.find(
    (part) => part.id === "cvn4-part-inserted",
  );
  assert.deepEqual(
    stored?.measureContents.map((content) => content.measureId),
    ["cvn4-measure-1", "cvn4-measure-2", "cvn4-measure-3"],
  );
  assert.deepEqual(committedEvents(events)[0]?.affectedEntities, [
    { kind: "document", documentId: "cvn4-score" },
    { kind: "part", partId: "cvn4-part-inserted" },
    { kind: "staff", staffId: "cvn4-part-inserted-staff" },
    { kind: "voice", voiceId: "cvn4-part-inserted-cvn4-measure-1-voice" },
    {
      kind: "event",
      eventId: "cvn4-part-inserted-cvn4-measure-1-voice-event",
    },
    { kind: "voice", voiceId: "cvn4-part-inserted-cvn4-measure-2-voice" },
    {
      kind: "event",
      eventId: "cvn4-part-inserted-cvn4-measure-2-voice-event",
    },
    { kind: "voice", voiceId: "cvn4-part-inserted-cvn4-measure-3-voice" },
    {
      kind: "event",
      eventId: "cvn4-part-inserted-cvn4-measure-3-voice-event",
    },
  ]);

  (inserted.measureContents[0]!.voices[0]!.sequence.events[0] as {
    id: string;
  }).id = "caller-mutated";
  assert.equal(
    readDocument(bus).parts[1]?.measureContents[0]?.voices[0]?.sequence.events[0]
      ?.id,
    "cvn4-part-inserted-cvn4-measure-1-voice-event",
  );
});

test("Part insert coverage and ID failures preserve the full document state", () => {
  const bus = requireBus(cloneCvn4ScoreFixture());
  const before = structuredClone(readDocument(bus));
  const missingCoverage = {
    ...createCvn4InsertedPart("cvn4-part-missing-coverage"),
    measureContents: [
      createCvn4InsertedPart("cvn4-part-missing-coverage").measureContents[0]!,
    ],
  };
  const coverage = bus.submit(insertPartCommand({ kind: "start" }, missingCoverage));
  assertRejectedCode(coverage, "command.semantic-invalid");
  assert.deepEqual(readDocument(bus), before);

  const duplicate = bus.submit(
    insertPartCommand({ kind: "start" }, createCvn4InsertedPart("cvn4-part-a")),
  );
  assertRejectedCode(duplicate, "command.semantic-invalid");
  assert.deepEqual(readDocument(bus), before);

  const missingReference = createCvn4InsertedPart("cvn4-part-missing-reference");
  (missingReference.measureContents[0]?.voices[0] as { defaultStaffId: string })
    .defaultStaffId = "cvn4-missing-staff";
  const reference = bus.submit(insertPartCommand({ kind: "start" }, missingReference));
  assertRejectedCode(reference, "command.semantic-invalid");
  assert.deepEqual(readDocument(bus), before);
});

test("Part removal owns only its aggregate and extensions and undo restores mixed extension order", () => {
  const bus = requireBus(cloneCvn4ScoreFixture());
  const before = structuredClone(readDocument(bus));
  const removed = bus.submit(removePartCommand("cvn4-part-a"));

  assert.equal(removed.status, "committed");
  const afterRemove = readDocument(bus);
  assert.deepEqual(partOrder(afterRemove), ["cvn4-part-b", "cvn4-part-c"]);
  assert.deepEqual(
    afterRemove.extensions.map((extension) => extension.namespace),
    ["org.score", "org.part-b", "org.part-c"],
  );

  assert.equal(bus.undo().status, "committed");
  assert.deepEqual(readDocument(bus), before);
  assert.equal(bus.redo().status, "committed");
  assert.deepEqual(readDocument(bus), afterRemove);
});

test("Part move changes only the Part owner list and property replacements honor exact no-op rules", () => {
  const bus = requireBus(cloneCvn4ScoreFixture());
  const extensions = structuredClone(readDocument(bus).extensions);
  const moved = bus.submit(movePartCommand("cvn4-part-c", { kind: "start" }));
  assert.equal(moved.status, "committed");
  assert.deepEqual(partOrder(readDocument(bus)), [
    "cvn4-part-c",
    "cvn4-part-a",
    "cvn4-part-b",
  ]);
  assert.deepEqual(readDocument(bus).extensions, extensions);
  assert.equal(
    bus.submit(movePartCommand("cvn4-part-a", { kind: "after-part", partId: "cvn4-part-c" })).status,
    "no-op",
  );
  assertRejectedCode(
    bus.submit(movePartCommand("cvn4-part-a", { kind: "after-part", partId: "cvn4-part-a" })),
    "command.anchor-self-reference",
  );
  assertRejectedCode(
    bus.submit(movePartCommand("cvn4-part-a", {
      kind: "after-part",
      partId: "cvn4-missing-part",
    })),
    "command.anchor-not-found",
  );

  assert.equal(bus.submit(setPartNameCommand("cvn4-part-a", "  Part A  ")).status, "committed");
  assert.equal(readDocument(bus).parts.find((part) => part.id === "cvn4-part-a")?.name, "  Part A  ");
  assert.equal(bus.submit(setPartNameCommand("cvn4-part-a", "  Part A  ")).status, "no-op");
  const replacement = bus.submit(
    setPartInstrumentCommand("cvn4-part-a", {
      name: "Violin",
      writtenToSounding: { diatonicSteps: 0, chromaticSemitones: 0 },
    }),
  );
  assert.equal(replacement.status, "committed");
  assert.equal(
    replacement.status === "committed" && replacement.support.status,
    "unsupported",
  );
  assert.equal(
    bus.submit(
      setPartInstrumentCommand("cvn4-part-a", {
        name: "Violin",
        writtenToSounding: { diatonicSteps: 0, chromaticSemitones: 0 },
      }),
    ).status,
    "no-op",
  );
  assertRejectedCode(
    bus.submit(
      setPartInstrumentCommand("cvn4-part-a", {
        name: "Broken",
        writtenToSounding: { diatonicSteps: 0, chromaticSemitones: 1_000 },
      }),
    ),
    "command.semantic-invalid",
  );
});

test("Part removal of the final aggregate reaches semantic.part-required atomically", () => {
  const bus = requireBus(cloneCvn4ScoreFixture());
  assert.equal(bus.submit(removePartCommand("cvn4-part-a")).status, "committed");
  assert.equal(bus.submit(removePartCommand("cvn4-part-b")).status, "committed");
  const beforeFinal = structuredClone(readDocument(bus));
  const finalRemoval = bus.submit(removePartCommand("cvn4-part-c"));
  assertSemanticDiagnostic(finalRemoval, "semantic.part-required");
  assert.deepEqual(readDocument(bus), beforeFinal);
});
