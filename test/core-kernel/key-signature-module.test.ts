import assert = require("node:assert/strict");
import { test } from "node:test";

import {
  CommandBus,
  encodeScoreDocumentJson,
  parseScoreDocumentJson,
  replayKernelCommands,
  type IntegratedCommandBus,
  type ScoreDocument,
} from "../../src/core-kernel/index";
import {
  KEY_SIGNATURE_NAMESPACE,
  SET_KEY_SIGNATURE_COMMAND,
  compileKeySignatureModuleCatalogV1,
  readPartKeySignatureTimelineV1,
} from "../../src/first-party-modules/key-signature";
import { createCoreScoreFixture } from "./fixtures/core-score";

function scoreWithMeasures(count: number): ScoreDocument {
  const base = createCoreScoreFixture();
  const seedContent = base.parts[0]!.measureContents[0]!;
  return {
    ...base,
    measureDefinitions: Array.from({ length: count }, (_, index) => ({
      id: `measure-${index + 1}`,
      meter: { numerator: 4, denominator: 4 },
    })),
    parts: base.parts.map(part => ({
      ...part,
      measureContents: Array.from({ length: count }, (_, index) => index === 0
        ? seedContent
        : {
            measureId: `measure-${index + 1}`,
            voices: [{
              id: `voice-${index + 1}`,
              defaultStaffId: "staff-1",
              sequence: { start: { numerator: 0, denominator: 1 }, events: [] },
            }],
          }),
    })),
  };
}

function catalog() {
  const compiled = compileKeySignatureModuleCatalogV1();
  assert.equal(compiled.ok, true);
  if (!compiled.ok) assert.fail("expected the key-signature catalog to compile");
  return compiled.catalog;
}

function bus(count = 3): IntegratedCommandBus {
  const created = CommandBus.createIntegrated(scoreWithMeasures(count), catalog());
  assert.equal(created.ok, true);
  if (!created.ok) assert.fail("expected the key-signature fixture bus");
  return created.value;
}

function command(measureId: string, change: { readonly kind: "inherit" }
  | { readonly kind: "set"; readonly fifths: number }) {
  return {
    commandVersion: 1,
    commandId: SET_KEY_SIGNATURE_COMMAND,
    target: { kind: "part", partId: "part-1" },
    payload: { measureId, change },
  } as const;
}

function document(current: IntegratedCommandBus): ScoreDocument {
  const read = current.read();
  assert.equal(read.ok, true);
  if (!read.ok) assert.fail("expected readable key-signature state");
  return read.value.snapshot.document;
}

function changes(current: IntegratedCommandBus) {
  const read = readPartKeySignatureTimelineV1(document(current), "part-1");
  assert.notEqual(read.status, "invalid");
  return read.status === "valid" ? read.changes : [];
}

function pitches(value: ScoreDocument) {
  return value.parts.flatMap(part => part.measureContents.flatMap(content =>
    content.voices.flatMap(voice => voice.sequence.events.flatMap(event =>
      event.content.kind === "notes" ? event.content.notes.map(note => note.writtenPitch) : []))));
}

test("key signatures remain sparse and never rewrite written pitches", () => {
  const current = bus(100);
  const beforePitches = pitches(document(current));

  assert.equal(current.submit(command("measure-1", { kind: "set", fifths: 1 })).status, "committed");
  assert.equal(current.submit(command("measure-2", { kind: "set", fifths: 1 })).status, "no-op");
  assert.equal(current.submit(command("measure-50", { kind: "set", fifths: 0 })).status, "committed");

  assert.deepEqual(changes(current), [
    { measureId: "measure-1", fifths: 1 },
    { measureId: "measure-50", fifths: 0 },
  ]);
  assert.equal(document(current).extensions.length, 1);
  assert.deepEqual(pitches(document(current)), beforePitches);
});

test("set, replace and inherit are one-step undoable, redoable and reopen safely", () => {
  const current = bus();
  assert.equal(current.submit(command("measure-1", { kind: "set", fifths: 1 })).status, "committed");
  assert.equal(current.submit(command("measure-3", { kind: "set", fifths: -2 })).status, "committed");
  assert.equal(current.submit(command("measure-3", { kind: "set", fifths: 0 })).status, "committed");
  assert.deepEqual(changes(current), [
    { measureId: "measure-1", fifths: 1 },
    { measureId: "measure-3", fifths: 0 },
  ]);

  assert.equal(current.submit(command("measure-3", { kind: "inherit" })).status, "committed");
  assert.deepEqual(changes(current), [{ measureId: "measure-1", fifths: 1 }]);
  assert.equal(current.undo().status, "committed");
  assert.deepEqual(changes(current), [
    { measureId: "measure-1", fifths: 1 },
    { measureId: "measure-3", fifths: 0 },
  ]);
  assert.equal(current.redo().status, "committed");
  assert.deepEqual(changes(current), [{ measureId: "measure-1", fifths: 1 }]);

  const encoded = encodeScoreDocumentJson(document(current));
  assert.equal(encoded.ok, true);
  if (!encoded.ok) assert.fail("expected the document to encode");
  const decoded = parseScoreDocumentJson(encoded.value);
  assert.equal(decoded.ok, true);
  if (!decoded.ok) assert.fail("expected the document to decode");
  const reopened = CommandBus.createIntegrated(decoded.value, catalog());
  assert.equal(reopened.ok, true);
  if (!reopened.ok) assert.fail("expected the saved document to reopen");
  assert.deepEqual(changes(reopened.value), [{ measureId: "measure-1", fifths: 1 }]);
});

test("invalid fifths and dangling measure references are rejected without mutation", () => {
  const current = bus();
  const before = current.read();
  assert.equal(current.submit(command("measure-1", { kind: "set", fifths: 8 })).status, "rejected");
  assert.equal(current.submit(command("missing-measure", { kind: "set", fifths: 1 })).status, "rejected");
  assert.deepEqual(current.read(), before);

  const invalid: ScoreDocument = {
    ...scoreWithMeasures(1),
    extensions: [{
      namespace: KEY_SIGNATURE_NAMESPACE,
      schemaVersion: 1,
      owner: { kind: "part", partId: "part-1" },
      payload: { changes: [{ measureId: "missing-measure", fifths: 1 }] },
    }],
  };
  assert.equal(CommandBus.createIntegrated(invalid, catalog()).ok, false);
  const redundant: ScoreDocument = {
    ...scoreWithMeasures(2),
    extensions: [{
      namespace: KEY_SIGNATURE_NAMESPACE,
      schemaVersion: 1,
      owner: { kind: "part", partId: "part-1" },
      payload: { changes: [
        { measureId: "measure-1", fifths: 1 },
        { measureId: "measure-2", fifths: 1 },
      ] },
    }],
  };
  assert.equal(CommandBus.createIntegrated(redundant, catalog()).ok, false);
});

test("a change-bearing measure is removed only by an atomic inherit plus Core removal batch", () => {
  const current = bus();
  assert.equal(current.submit(command("measure-2", { kind: "set", fifths: 2 })).status, "committed");
  const remove = {
    commandVersion: 1,
    commandId: "core.measure.remove",
    target: { kind: "measure", measureId: "measure-2" },
    payload: {},
  } as const;
  assert.equal(current.submit(remove).status, "rejected");
  assert.deepEqual(changes(current), [{ measureId: "measure-2", fifths: 2 }]);

  const result = current.submit({
    commandVersion: 1,
    commandId: "core.transaction.batch",
    target: { kind: "document", documentId: "score-1" },
    payload: { commands: [command("measure-2", { kind: "inherit" }), remove] },
  });
  assert.equal(result.status, "committed");
  assert.deepEqual(changes(current), []);
  assert.deepEqual(document(current).measureDefinitions.map(measure => measure.id), ["measure-1", "measure-3"]);
  assert.equal(current.undo().status, "committed");
  assert.deepEqual(changes(current), [{ measureId: "measure-2", fifths: 2 }]);
  assert.deepEqual(document(current).measureDefinitions.map(measure => measure.id), ["measure-1", "measure-2", "measure-3"]);
});

test("integrated replay produces the same sparse document", () => {
  const initial = scoreWithMeasures(3);
  const commands = [
    command("measure-1", { kind: "set", fifths: 3 }),
    command("measure-3", { kind: "set", fifths: -1 }),
    command("measure-3", { kind: "inherit" }),
  ];
  const replayed = replayKernelCommands(initial, commands, catalog());
  assert.equal(replayed.status, "replayed");
  if (replayed.status !== "replayed") assert.fail("expected key-signature replay");
  assert.deepEqual(readPartKeySignatureTimelineV1(replayed.finalDocument, "part-1"), {
    status: "valid",
    changes: [{ measureId: "measure-1", fifths: 3 }],
  });
  assert.deepEqual(pitches(replayed.finalDocument), pitches(initial));
});
