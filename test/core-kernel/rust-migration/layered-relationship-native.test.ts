import { test } from "node:test";
import assert = require("node:assert/strict");
import { resolve } from "node:path";
import { CommandBus, createKernelRegistry, replayKernelCommands, type ScoreDocument, type KernelGatewayResult, type KernelCommandResult } from "../../../src/core-kernel/index";
import { installNativeIntegratedBackendV2, type IntegratedNativeAddonV2 } from "../../../src/core-kernel/native/integrated-command-bus";
import { relationCatalog, relationshipDocument, reconcile, resetRelations, relationCalls, relationTrace,
  RELATION_MODULE, RELATION_CONTRIBUTION, INDEX_NAMESPACE, SUMMARY_NAMESPACE } from "../fixtures/layered-relationship-module";

const addon = require(resolve(
  process.env.BRILLIANT_INTEGRATED_ADDON_PATH
    ?? "target/integrated-v2/brilliant_kernel_node.node",
)) as IntegratedNativeAddonV2;
function create(native: boolean, document = relationshipDocument(), catalog = relationCatalog(), inventory?: unknown) {
  const restore = native ? installNativeIntegratedBackendV2(addon) : () => {};
  try {
    const result = inventory === undefined ? CommandBus.createIntegrated(document, catalog) : CommandBus.createIntegrated(document, catalog, inventory);
    assert.ok(result.ok, JSON.stringify(result));
    return result.value;
  } finally { restore(); }
}
function snapshot(bus: ReturnType<typeof create>): ScoreDocument {
  const read = bus.read();
  assert.ok(read.ok);
  return read.value.snapshot.document;
}
function batch(commands: readonly unknown[]) {
  return { commandVersion: 1, commandId: "core.transaction.batch", target: { kind: "document", documentId: "score-1" }, payload: { commands } };
}
function pitch(step = "E") {
  return { commandVersion: 1, commandId: "core.note.set-written-pitch", target: { kind: "note", noteId: "note-1" }, payload: { writtenPitch: { step, alter: 0, octave: 4 } } };
}
function removePart() {
  return { commandVersion: 1, commandId: "core.part.remove", target: { kind: "part", partId: "part-1" }, payload: {} };
}
function checkLayers(document: ScoreDocument, writtenPitch = "C/0/4") {
  assert.deepEqual(document.extensions.find(block => block.namespace === INDEX_NAMESPACE && block.owner.kind === "part" && block.owner.partId === "part-1")?.payload,
    { notes: [{ noteId: "note-1", writtenPitch }] });
  assert.deepEqual(document.extensions.find(block => block.namespace === SUMMARY_NAMESPACE)?.payload, { parts: [
    { partId: "part-1", notes: [{ noteId: "note-1", writtenPitch }] }, { partId: "part-empty", notes: [] },
  ] });
  assert.deepEqual(document.extensions[0], relationshipDocument().extensions[0], "opaque UTF-16 and negative zero remain untouched");
}

test("Actual relationship consumer compiles through the SDK and gateway, builds two layers, then becomes no-op", () => {
  const catalog = relationCatalog();
  const registry = createKernelRegistry(catalog);
  assert.ok(registry.ok);
  const oracle = create(false, relationshipDocument(), catalog);
  const native = create(true, relationshipDocument(), catalog);
  const expectedGateway = registry.registry.createGateway(RELATION_MODULE, oracle);
  const actualGateway = registry.registry.createGateway(RELATION_MODULE, native);
  assert.ok(expectedGateway.ok && actualGateway.ok);
  for (const step of ["initial", "no-op"]) {
    resetRelations();
    const expected = expectedGateway.gateway.submit(reconcile());
    const counts = { ...relationCalls };
    const trace = structuredClone(relationTrace);
    resetRelations();
    const actual: KernelGatewayResult<KernelCommandResult> = actualGateway.gateway.submit(reconcile());
    assert.deepEqual(actual, expected, step);
    assert.equal(actual.status, "authorized");
    if (actual.status === "authorized") assert.equal(actual.value.status, step === "initial" ? "committed" : "no-op");
    assert.deepEqual(relationCalls, counts);
    assert.deepEqual(relationTrace, trace);
    assert.deepEqual(relationTrace.at(-1)?.payload, { parts: [
      { partId: "part-1", notes: [{ noteId: "note-1", writtenPitch: "C/0/4" }] }, { partId: "part-empty", notes: [] },
    ] }, "upper transformer consumes the lower transformer's new extension, not the initial document");
    checkLayers(snapshot(native));
    assert.deepEqual(native.read(), oracle.read());
  }
});

test("Core edits require plugin reconciliation; wrong dependency order and partial repair reject atomically", () => {
  const oracle = create(false);
  const native = create(true);
  for (const bus of [oracle, native]) assert.equal(bus.submit(reconcile()).status, "committed");
  const before = native.read();
  const events: unknown[] = [];
  native.subscribe((event: unknown) => events.push(event));
  for (const input of [pitch(), batch([pitch(), reconcile("part-only")]), batch([pitch(), reconcile("summary-first")])]) {
    const expected = oracle.submit(input);
    assert.equal(expected.status, "rejected");
    if (expected.status === "rejected") assert.equal(expected.failure.code, "command.contribution-semantic-invalid");
    assert.deepEqual(native.submit(input), expected);
    assert.deepEqual(native.read(), before);
    assert.deepEqual(events, []);
  }
  const input = batch([pitch(), reconcile()]);
  assert.deepEqual(native.submit(input), oracle.submit(input));
  checkLayers(snapshot(native), "E/0/4");
  assert.deepEqual(native.read(), oracle.read());
  resetRelations();
  for (const operation of ["undo", "redo", "undo", "redo"] as const) {
    assert.deepEqual(native[operation](), oracle[operation]());
    assert.deepEqual(native.read(), oracle.read());
  }
  assert.equal(relationCalls.prepare, 0);
  assert.equal(relationCalls.index, 0);
  assert.equal(relationCalls.summary, 0);
});

test("Note deletion and Part death/rebirth repair stored references in the same atomic history", () => {
  const original = relationshipDocument();
  const insert = { commandVersion: 1, commandId: "core.part.insert", target: { kind: "document", documentId: original.id }, payload: { anchor: { kind: "start" }, part: original.parts[0] } };
  const cases = [
    batch([{ commandVersion: 1, commandId: "core.event.remove", target: { kind: "event", eventId: "event-1" }, payload: {} }, reconcile()]),
    batch([removePart(), reconcile()]),
    batch([pitch(), reconcile(), removePart(), insert, reconcile()]),
  ];
  for (const [index, input] of cases.entries()) {
    const oracle = create(false);
    const native = create(true);
    for (const bus of [oracle, native]) assert.equal(bus.submit(reconcile()).status, "committed");
    const events: unknown[][] = [[], []];
    oracle.subscribe((event: unknown) => events[0]!.push(event));
    native.subscribe((event: unknown) => events[1]!.push(event));
    const expected = oracle.submit(input);
    assert.equal(expected.status, "committed", `case ${index}: ${JSON.stringify(expected)}`);
    assert.deepEqual(native.submit(input), expected, `case ${index}`);
    assert.deepEqual(native.read(), oracle.read());
    const result = snapshot(native);
    if (index === 0) assert.deepEqual(result.extensions.find(block => block.namespace === INDEX_NAMESPACE && block.owner.kind === "part" && block.owner.partId === "part-1")?.payload, { notes: [] });
    if (index === 1) assert.deepEqual(result.extensions.find(block => block.namespace === SUMMARY_NAMESPACE)?.payload, { parts: [{ partId: "part-empty", notes: [] }] });
    if (index === 2) checkLayers(result, "C/0/4");
    for (const operation of ["undo", "redo", "undo", "redo"] as const) {
      assert.deepEqual(native[operation](), oracle[operation]());
      assert.deepEqual(native.read(), oracle.read());
    }
    assert.deepEqual(events[1], events[0]);
  }
});

test("Relationship consumers preserve checkpoints, branched history, clear/reinstall and replay failure index", () => {
  const oracle = create(false);
  const native = create(true);
  const events: unknown[][] = [[], []];
  oracle.subscribe((event: unknown) => events[0]!.push(event));
  native.subscribe((event: unknown) => events[1]!.push(event));
  for (const input of [reconcile(), batch([pitch(), reconcile()]), reconcile("clear"), reconcile()]) {
    assert.deepEqual(native.submit(input), oracle.submit(input));
    assert.deepEqual(native.read(), oracle.read());
  }
  const read = native.read();
  assert.ok(read.ok);
  const checkpoint = { documentId: "score-1", documentVersion: read.value.snapshot.documentVersion };
  assert.deepEqual(native.markPersisted(checkpoint), oracle.markPersisted(checkpoint));
  assert.deepEqual(native.undo(), oracle.undo());
  assert.deepEqual(native.submit(reconcile()), oracle.submit(reconcile()));
  assert.deepEqual(native.redo(), oracle.redo());
  assert.deepEqual(native.read(), oracle.read());
  assert.deepEqual(events[1], events[0]);
  const commands = [reconcile(), batch([pitch(), reconcile()]), pitch("F"), reconcile()];
  const catalog = relationCatalog();
  const expected = replayKernelCommands(relationshipDocument(), commands, catalog);
  const restore = installNativeIntegratedBackendV2(addon);
  try {
    const actual = replayKernelCommands(relationshipDocument(), commands, catalog);
    assert.deepEqual(actual, expected);
    assert.equal(actual.status, "rejected");
    if (actual.status === "rejected") assert.equal(actual.failedCommandIndex, 2);
  } finally { restore(); }
});

test("Missing relationship contribution makes known data read-only; reopening with it restores writable validation", () => {
  const prepared = create(false);
  assert.equal(prepared.submit(reconcile()).status, "committed");
  const document = snapshot(prepared);
  const inventory = { inventoryVersion: 1, requirements: RELATION_CONTRIBUTION.extensionRequirements };
  const missing = relationCatalog(false);
  const oracle = create(false, document, missing, inventory);
  const native = create(true, document, missing, inventory);
  assert.deepEqual(native.read(), oracle.read());
  const before = native.read();
  for (const operation of ["submit", "undo", "redo"] as const) {
    const expected = operation === "submit" ? oracle.submit(pitch()) : oracle[operation]();
    assert.equal(expected.status, "rejected");
    assert.deepEqual(operation === "submit" ? native.submit(pitch()) : native[operation](), expected);
  }
  assert.deepEqual(native.read(), before);
  const reopened = create(true, document, relationCatalog(), inventory);
  assert.equal(reopened.submit(batch([pitch(), reconcile()])).status, "committed");
  checkLayers(snapshot(reopened), "E/0/4");
});
