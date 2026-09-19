import assert = require("node:assert/strict");
import { test } from "node:test";
import { CommandBus, encodeScoreDocumentJson, migrateKernelExtension, type ScoreDocument } from "../../../src/core-kernel/index";
import { createNativeWorkloadScore } from "../fixtures/native-workload";
import { createCvn7NativeWasmFixture } from "../fixtures/cvn-7-native-wasm";
import { createStressCvn7Score } from "../fixtures/cvn-7-qualification-score";

function score(): ScoreDocument {
  return { ...createNativeWorkloadScore(4), extensions: [
    { namespace: "fixture.cvn7.score", schemaVersion: 1, owner: { kind: "score" }, payload: { marker: "score", generatorVersion: 1 } },
    { namespace: "fixture.cvn7.part", schemaVersion: 1, owner: { kind: "part", partId: "part-1" }, payload: { marker: "part", generatorVersion: 1 } },
    { namespace: "fixture.cvn7.unknown", schemaVersion: 7, owner: { kind: "score" }, payload: { marker: "\ud800", number: -0 } },
  ] };
}

test("V4 preserves extension property order in encoded snapshots and order-only editing history", () => {
  for (const reversed of [false, true]) {
    const fixture = createCvn7NativeWasmFixture(), base = score();
    const initial: ScoreDocument = { ...base, extensions: base.extensions.map((block, index) => ({
      ...block,
      payload: index === 0 ? (reversed ? { generatorVersion: 1, marker: "score" } : { marker: "score", generatorVersion: 1 })
        : index === 2 ? { z: [{ b: 1, a: 2 }], a: { "10": "ten", "2": "two", "00": "zero", ["__proto__"]: "data", "\ud800": -0 }, tail: "last" }
        : block.payload,
    })) };
    const encode = (document: ScoreDocument) => {
      const encoded = encodeScoreDocumentJson(document); assert.ok(encoded.ok); return encoded.value;
    };
    const original = encode(initial);
    const run = () => {
      const created = CommandBus.createIntegrated(initial, fixture.catalog, fixture.modules.knownRequirementInventory); assert.ok(created.ok);
      const bus = created.value, events: unknown[] = [], snapshots: string[] = [], results: unknown[] = [];
      bus.subscribe((event: unknown) => events.push(event));
      const record = () => { const read = bus.read(); assert.ok(read.ok); snapshots.push(encode(read.value.snapshot.document)); };
      record();
      assert.equal(snapshots[0], original);
      const same = fixture.modules.createScoreCommand(initial.id, "note-1", { step: "C", alter: 0, octave: 4 }, "score");
      const first = bus.submit(same);
      assert.equal(first.status, reversed ? "committed" : "no-op", "key reorder is the only effective change");
      results.push(first); record();
      const repeat = bus.submit(same); assert.equal(repeat.status, "no-op"); results.push(repeat); record();
      results.push(bus.submit(fixture.modules.createScoreCommand(initial.id, "note-1", { step: "D", alter: 0, octave: 4 }, "changed"))); record();
      results.push(bus.undo()); record();
      results.push(bus.redo()); record();
      assert.equal(encode(initial), original);
      return { results, events, snapshots };
    };
    const expected = run(), restore = fixture.install();
    try {
      fixture.modules.resetTrace();
      assert.deepEqual(run(), expected);
      assert.deepEqual(fixture.modules.readTrace(), []);
    } finally { restore(); }
  }
});
test("CVN-7 actual Wasm fixtures preserve mixed editing, lossless text, history and events without JS callbacks", () => {
  const fixture = createCvn7NativeWasmFixture(), initial = score();
  const oracle = CommandBus.createIntegrated(initial, fixture.catalog, fixture.modules.knownRequirementInventory); assert.ok(oracle.ok);
  const inputs = [
    fixture.modules.createScoreCommand("score-1", "note-1", { step: "D", alter: -0, octave: 4 }, "\ud800\0score"),
    fixture.modules.createPartCommand("part-1", "note-2", { step: "E", alter: 1, octave: 5 }, "part😀"),
    { commandVersion: 1, commandId: "core.transaction.batch", target: { kind: "document", documentId: "score-1" }, payload: { commands: [
      fixture.modules.createPartCommand("part-1", "note-1", { step: "F", alter: 0, octave: 3 }, "mixed"),
      fixture.modules.createScoreCommand("score-1", "note-3", { step: "G", alter: 0, octave: 4 }, "mixed"),
    ] } },
  ];
  const expectedEvents: unknown[] = [];
  // Repeating the exact pitch + extension write must not add history/events.
  inputs.splice(1, 0, inputs[0]!);
  oracle.value.subscribe((event: unknown) => expectedEvents.push(event));
  const expected = inputs.map(input => oracle.value.submit(input));
  assert.deepEqual(expected.map(result => result.status), ["committed", "no-op", "committed", "committed"]);
  const expectedUndo = oracle.value.undo(), expectedRedo = oracle.value.redo(), expectedRead = oracle.value.read();
  const restore = fixture.install();
  try {
    fixture.modules.resetTrace();
    const native = CommandBus.createIntegrated(initial, fixture.catalog, fixture.modules.knownRequirementInventory); assert.ok(native.ok);
    const events: unknown[] = [];
    native.value.subscribe((event: unknown) => events.push(event));
    assert.deepEqual(inputs.map(input => native.value.submit(input)), expected);
    assert.deepEqual(native.value.undo(), expectedUndo);
    assert.deepEqual(native.value.redo(), expectedRedo);
    assert.deepEqual(native.value.read(), expectedRead);
    assert.deepEqual(events, expectedEvents);
    assert.deepEqual(fixture.modules.readTrace(), []);
  } finally { restore(); }
});

test("CVN-7 Wasm command rejection and detached migration agree with the frozen SDK module behavior", () => {
  const fixture = createCvn7NativeWasmFixture(), initial = score();
  const valid = fixture.modules.createScoreCommand("score-1", "note-1", { step: "D", alter: 0, octave: 4 }, "ok") as {
    commandVersion: number; commandId: string; target: unknown; payload: Record<string, unknown>;
  };
  const inputs = [
    { ...valid, payload: { ...valid.payload, extra: true } },
    { ...valid, payload: { ...valid.payload, marker: 1 } },
    { ...valid, payload: { ...valid.payload, noteId: "" } },
    { ...valid, payload: { ...valid.payload, pitch: { step: "D", alter: 0.5, octave: 4 } } },
    { ...valid, payload: { ...valid.payload, pitch: { step: "H", alter: 0, octave: 4 } } },
    { ...valid, payload: { ...valid.payload, pitch: { step: "D", alter: 3, octave: 4 } } },
    { ...valid, payload: { ...valid.payload, pitch: { step: "D", alter: 0, octave: 9 } } },
    { ...valid, payload: { ...valid.payload, pitch: { step: "D", alter: -2, octave: 0 } } },
    { ...valid, payload: { ...valid.payload, pitch: { step: "D", alter: 2, octave: 8 } } },
    { ...valid, target: { kind: "document", documentId: "missing" } },
  ];
  const oracle = CommandBus.createIntegrated(initial, fixture.catalog, fixture.modules.knownRequirementInventory); assert.ok(oracle.ok);
  const expected = inputs.map(input => oracle.value.submit(input));
  const request = { migrationVersion: 1, moduleId: "fixture.cvn7.score.module", contributionId: "fixture.cvn7.score.contribution.v1",
    namespace: "fixture.cvn7.score", effectKind: "fixture.cvn7.score.replace", owner: { kind: "score" },
    sourceSchemaVersion: 1, targetSchemaVersion: 2, payload: { marker: "\udfff migrated", generatorVersion: 1, schemaVersion: 2 } };
  const requests = [request, { ...request, payload: { ...request.payload, generatorVersion: 2 } },
    { ...request, payload: { ...request.payload, extra: true } }];
  const migrations = requests.map(input => migrateKernelExtension(initial, input, fixture.catalog));
  assert.equal(migrations[0]!.status, "migrated");
  const restore = fixture.install();
  try {
    fixture.modules.resetTrace();
    const native = CommandBus.createIntegrated(initial, fixture.catalog, fixture.modules.knownRequirementInventory); assert.ok(native.ok);
    assert.deepEqual(inputs.map(input => native.value.submit(input)), expected);
    assert.deepEqual(requests.map(input => migrateKernelExtension(initial, input, fixture.catalog)), migrations);
    assert.deepEqual(fixture.modules.readTrace(), []);
  } finally { restore(); }
});

test("V4 admits the frozen stress document and preserves it when an edit report exceeds the diagnostic cap", { timeout: 60_000 }, () => {
  const fixture = createCvn7NativeWasmFixture(), initial = createStressCvn7Score().document;
  const restore = fixture.install();
  try {
    fixture.modules.resetTrace();
    const created = CommandBus.createIntegrated(initial, fixture.catalog, fixture.modules.knownRequirementInventory);
    assert.ok(created.ok, JSON.stringify(created));
    const before = created.value.read(); assert.ok(before.ok);
    assert.deepEqual(before.value.snapshot.document, initial);
    const events: unknown[] = [];
    created.value.subscribe((event: unknown) => events.push(event));
    const result = created.value.submit({
      commandVersion: 1, commandId: "core.document.set-metadata",
      target: { kind: "document", documentId: initial.id },
      payload: { metadata: { ...initial.metadata, title: "must remain unchanged" } },
    });
    assert.equal(result.status, "rejected");
    if (result.status !== "rejected") assert.fail("diagnostic report must remain bounded");
    assert.deepEqual(result.failure, {
      code: "command.resource-limit-exceeded", limitKind: "diagnostics", limit: 4096, actual: 4097,
    });
    assert.equal(result.documentVersion, 0);
    assert.equal(result.undoDepth, 0);
    assert.equal(result.redoDepth, 0);
    const after = created.value.read(); assert.ok(after.ok);
    assert.deepEqual(after.value, before.value);
    assert.deepEqual(events, []);
    assert.deepEqual(fixture.modules.readTrace(), []);
  } finally { restore(); }
});

test("V4 module classification reuse follows structural commits, Batch, history and failed Effects", () => {
  const fixture = createCvn7NativeWasmFixture(), initial = score();
  const moduleEdit = (marker: string, noteId = "note-1") =>
    fixture.modules.createScoreCommand(initial.id, noteId, { step: "D", alter: 0, octave: 4 }, marker);
  const meter = (numerator: number, denominator: number) => ({
    commandVersion: 1, commandId: "core.measure.set-definition",
    target: { kind: "measure", measureId: "measure-1" },
    payload: { meter: { numerator, denominator }, pickup: { kind: "none" } },
  });
  const run = () => {
    const created = CommandBus.createIntegrated(initial, fixture.catalog, fixture.modules.knownRequirementInventory);
    assert.ok(created.ok);
    const bus = created.value, events: unknown[] = [], results: unknown[] = [];
    bus.subscribe((event: unknown) => events.push(event));
    const submit = (command: unknown, status: string, support?: string) => {
      const result = bus.submit(command);
      assert.equal(result.status, status);
      if (support && result.status === "committed") assert.equal(result.assessment.core.status, support);
      results.push(result);
    };
    submit(moduleEdit("warm"), "committed", "supported");
    submit(moduleEdit("warm"), "no-op");
    submit(meter(8, 8), "committed", "unsupported");
    submit(moduleEdit("unsupported"), "committed", "unsupported");
    results.push(bus.undo(), bus.undo(), bus.redo(), bus.redo());
    submit(moduleEdit("after-history"), "committed", "unsupported");
    submit({
      commandVersion: 1, commandId: "core.transaction.batch",
      target: { kind: "document", documentId: initial.id },
      payload: { commands: [meter(4, 4), moduleEdit("batch")] },
    }, "committed", "supported");
    submit(moduleEdit("after-batch"), "committed", "supported");
    submit(meter(3, 3), "rejected");
    submit(moduleEdit("after-rejected-structure"), "committed", "supported");
    submit({
      commandVersion: 1, commandId: "core.part.set-instrument",
      target: { kind: "part", partId: "part-1" },
      payload: { instrument: { name: "Octave", writtenToSounding: { diatonicSteps: 7, chromaticSemitones: 12 } } },
    }, "committed", "supported");
    const before = bus.read(), count = events.length;
    // A rejected Effect must not replace the committed classification cache.
    submit(moduleEdit("missing-effect-target", "missing-note"), "rejected");
    assert.deepEqual(bus.read(), before);
    assert.equal(events.length, count);
    submit(moduleEdit("after-rejected-module"), "committed", "supported");
    results.push(bus.read());
    return { results, events };
  };
  const expected = run(), restore = fixture.install();
  try {
    fixture.modules.resetTrace();
    assert.deepEqual(run(), expected);
    assert.deepEqual(fixture.modules.readTrace(), []);
  } finally { restore(); }
});
