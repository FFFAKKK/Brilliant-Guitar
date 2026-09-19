import { test } from "node:test";
import assert = require("node:assert/strict");
import { resolve } from "node:path";
import { CommandBus, createKernelRegistry, migrateKernelExtension, replayKernelCommands, type ScoreDocument } from "../../../src/core-kernel/index";
import { compileContributionReadCatalogV1, type DomainContributionDependencyReadViewV1 } from "../../../src/core-kernel/module-sdk/extension-reads";
import { installNativeIntegratedBackendV2, type IntegratedNativeAddonV2 } from "../../../src/core-kernel/native/integrated-command-bus";
import { relationshipDocument } from "../fixtures/layered-relationship-module";
import { crossCatalog, crossCatalogWithoutIndex, crossCommand, crossInventory, crossReads, crossTrace, INDEX, SUMMARY, indexSource, summarySource, setCrossForeignWrite } from "../fixtures/cross-plugin-relationship";

const addon = require(resolve(
  process.env.BRILLIANT_INTEGRATED_ADDON_PATH
    ?? "target/integrated-v2/brilliant_kernel_node.node",
)) as IntegratedNativeAddonV2;
function create(native: boolean, catalog = crossCatalog(), initial = relationshipDocument(), inventory?: unknown) {
  const restore = native ? installNativeIntegratedBackendV2(addon) : () => {};
  try {
    const result = inventory === undefined
      ? CommandBus.createIntegrated(initial, catalog)
      : CommandBus.createIntegrated(initial, catalog, inventory);
    assert.ok(result.ok, JSON.stringify(result));
    return result.value;
  } finally { restore(); }
}
function batch(commands: readonly unknown[]) {
  return { commandVersion: 1, commandId: "core.transaction.batch", target: { kind: "document", documentId: "score-1" }, payload: { commands } };
}
function pitch(step = "E") {
  return { commandVersion: 1, commandId: "core.note.set-written-pitch", target: { kind: "note", noteId: "note-1" }, payload: { writtenPitch: { step, alter: 0, octave: 4 } } };
}
function snapshot(bus: ReturnType<typeof create>) {
  const read = bus.read();
  assert.ok(read.ok);
  return read.value.snapshot.document;
}
const rebuild = () => batch([crossCommand(false), crossCommand(true)]);
function checkSummary(document: ScoreDocument, step: string) {
  assert.deepEqual(document.extensions.find(block => block.namespace === SUMMARY)?.payload,
    { parts: [{ id: "part-1", notes: [{ id: "note-1", pitch: `${step}/0/4` }] }, { id: "part-empty", notes: [] }] });
  assert.deepEqual(document.extensions[0], relationshipDocument().extensions[0]);
}

test("Independent plugins share only declared read blocks through TS and real Native candidate views", () => {
  const compiled = crossCatalog(), oracle = create(false, compiled), native = create(true, compiled);
  for (const input of [rebuild(), rebuild(), batch([pitch(), crossCommand(false), crossCommand(true)])]) {
    const expected = oracle.submit(input);
    assert.notEqual(expected.status, "rejected", JSON.stringify(expected));
    crossTrace.length = 0;
    assert.deepEqual(native.submit(input), expected);
    assert.deepEqual(native.read(), oracle.read());
    for (const entry of crossTrace) {
      assert.ok(entry.view.compatibleExtensions.every(block => block.namespace === entry.plugin));
      assert.ok(!("extensions" in entry.view.coreDocument));
      if (entry.plugin === INDEX) assert.ok(!("dependencyReads" in entry.view));
      else {
        const view = entry.view as DomainContributionDependencyReadViewV1;
        assert.equal(view.dependencyReads.length, 1);
        assert.deepEqual(view.dependencyReads[0]!.provider, indexSource);
        assert.ok(view.dependencyReads[0]!.blocks.every(block => block.namespace === INDEX && block.owner.kind === "part"));
        assert.ok(Object.isFrozen(view.dependencyReads[0]!.blocks));
        assert.throws(() => (view.dependencyReads[0]!.blocks as unknown[]).push({}), TypeError);
      }
    }
  }
  checkSummary(snapshot(native), "E");
  assert.ok(crossTrace.some(entry => entry.plugin === SUMMARY && entry.phase === "transform"
    && (entry.view as DomainContributionDependencyReadViewV1).dependencyReads[0]!.blocks[0]!.payload.notes instanceof Array));
});

test("Dependency order, partial repairs, ungranted reads and foreign writes reject without adopting a Batch prefix", () => {
  for (const native of [false, true]) {
    const bus = create(native);
    assert.equal(bus.submit(rebuild()).status, "committed");
    const before = bus.read(), events: unknown[] = [];
    bus.subscribe((event: unknown) => events.push(event));
    for (const input of [pitch(), batch([pitch(), crossCommand(false)]), batch([pitch(), crossCommand(true), crossCommand(false)])]) {
      assert.equal(bus.submit(input).status, "rejected");
      assert.deepEqual(bus.read(), before);
      assert.deepEqual(events, []);
    }
    setCrossForeignWrite(true);
    try {
      assert.equal(bus.submit(batch([pitch(), crossCommand(false), crossCommand(true)])).status, "rejected");
      assert.deepEqual(bus.read(), before);
    } finally { setCrossForeignWrite(false); }
    const unbound = create(native, crossCatalog(false));
    const unopened = unbound.read();
    assert.equal(unbound.submit(rebuild()).status, "rejected");
    assert.deepEqual(unbound.read(), unopened);
  }
});

test("Declared reads do not grant gateway command authority or mutate the base catalog", () => {
  const base = crossCatalog(false), result = compileContributionReadCatalogV1(base, crossReads);
  assert.ok(result.ok);
  const declared = result.catalog;
  assert.notEqual(base, declared);
  const registry = createKernelRegistry(declared);
  assert.ok(registry.ok);
  const bus = create(true, declared), gateway = registry.registry.createGateway(summarySource.moduleId, bus);
  assert.ok(gateway.ok);
  const before = bus.read();
  for (const input of [crossCommand(false), rebuild()]) assert.equal(gateway.gateway.submit(input).status, "rejected");
  assert.deepEqual(bus.read(), before);
  assert.equal(bus.submit(rebuild()).status, "committed");
  const wrong = createKernelRegistry(base);
  assert.ok(wrong.ok);
  assert.equal(wrong.registry.createGateway(summarySource.moduleId, bus).ok, false);
  const baseBus = create(true, base);
  assert.equal(baseBus.submit(rebuild()).status, "rejected");
});

test("Core removal and owner death/rebirth maintain cross-plugin references through stored history and replay", () => {
  const initial = relationshipDocument(), compiled = crossCatalog();
  const oracle = create(false, compiled), native = create(true, compiled);
  const events: unknown[][] = [[], []];
  oracle.subscribe((event: unknown) => events[0]!.push(event));
  native.subscribe((event: unknown) => events[1]!.push(event));
  const inputs = [rebuild(), batch([pitch(), crossCommand(false), crossCommand(true)]),
    batch([{ commandVersion: 1, commandId: "core.part.remove", target: { kind: "part", partId: "part-1" }, payload: {} },
      { commandVersion: 1, commandId: "core.part.insert", target: { kind: "document", documentId: initial.id }, payload: { anchor: { kind: "start" }, part: initial.parts[0] } },
      crossCommand(false), crossCommand(true)]),
    batch([{ commandVersion: 1, commandId: "core.event.remove", target: { kind: "event", eventId: "event-1" }, payload: {} }, crossCommand(false), crossCommand(true)]),
    batch([crossCommand(true, true), crossCommand(false, true)])];
  for (const input of inputs) {
    const expected = oracle.submit(input);
    assert.equal(expected.status, "committed", JSON.stringify(expected));
    assert.deepEqual(native.submit(input), expected);
    assert.deepEqual(native.read(), oracle.read());
  }
  crossTrace.length = 0;
  for (const operation of ["undo", "undo", "undo", "redo", "redo"] as const) {
    assert.deepEqual(native[operation](), oracle[operation]());
    assert.deepEqual(native.read(), oracle.read());
  }
  assert.ok(!crossTrace.some(entry => entry.phase === "prepare" || entry.phase === "transform"));
  assert.deepEqual(events[1], events[0]);
  const expected = replayKernelCommands(initial, inputs, compiled);
  const restore = installNativeIntegratedBackendV2(addon);
  try { assert.deepEqual(replayKernelCommands(initial, inputs, compiled), expected); } finally { restore(); }
});

test("Read declarations capture immutable exact identity, version and owner scopes before publishing a derived catalog", () => {
  const base = crossCatalog(false);
  const row = crossReads[0]!;
  let getters = 0;
  const accessor = { ...row };
  Object.defineProperty(accessor, "namespace", { get() { getters++; return INDEX; } });
  for (const input of [[], [row, row], [accessor], [{ ...row, extra: true }],
    [{ ...row, reader: indexSource }], [{ ...row, provider: summarySource }], [{ ...row, namespace: "opaque.uninstalled" }],
    [{ ...row, reader: { ...summarySource, contributionId: "missing" } }],
    [{ ...row, supportedSchemaVersions: [1] }], [{ ...row, supportedSchemaVersions: [2, 1] }], [{ ...row, supportedSchemaVersions: [] }], [{ ...row, supportedSchemaVersions: [NaN] }],
    [{ ...row, ownerKinds: ["part", "part"] }], [{ ...row, ownerKinds: ["note"] }], new Array(2), Array(1025).fill(row)]) {
    assert.equal(compileContributionReadCatalogV1(base, input).ok, false);
  }
  assert.equal(getters, 0);
  assert.equal(compileContributionReadCatalogV1({} as typeof base, [row]).ok, false);
  const mutable = structuredClone(crossReads), result = compileContributionReadCatalogV1(base, mutable);
  assert.ok(result.ok);
  mutable[0]!.namespace = "opaque.uninstalled";
  mutable[0]!.ownerKinds[0] = "score";
  const bus = create(true, result.catalog);
  assert.equal(bus.submit(rebuild()).status, "committed");
  const scoreOnly = crossCatalog(true, [{ ...row, ownerKinds: ["score"] }]);
  const filtered = create(true, scoreOnly);
  assert.equal(filtered.submit(rebuild()).status, "rejected");
});

test("Missing declared providers open as read-only without invoking dependent consumers", () => {
  const complete = create(false);
  assert.equal(complete.submit(rebuild()).status, "committed");
  const document = snapshot(complete);
  const base = crossCatalogWithoutIndex(false);
  assert.equal(compileContributionReadCatalogV1(base, crossReads).ok, false,
    "an absent provider needs authenticated inventory metadata");
  const degradedCatalog = crossCatalogWithoutIndex();
  for (const native of [false, true]) {
    crossTrace.length = 0;
    const bus = create(native, degradedCatalog, document, crossInventory);
    assert.deepEqual(crossTrace, [], "dependent validation must wait for the provider");
    const read = bus.read();
    assert.ok(read.ok);
    assert.equal(read.value.writeAvailability.status, "read-only");
    assert.equal(read.value.validationAvailability.status, "incomplete");
    if (read.value.validationAvailability.status === "incomplete") {
      assert.deepEqual(read.value.validationAvailability.facts.map(fact => [fact.namespace, fact.reason]), [
        [INDEX, "required-contribution-unavailable"],
        [INDEX, "required-contribution-unavailable"],
      ]);
    }
    assert.deepEqual(read.value.snapshot.document, document);
    const before = bus.read();
    const rejected = bus.submit(crossCommand(true));
    assert.equal(rejected.status, "rejected");
    if (rejected.status === "rejected") {
      assert.equal(rejected.failure.code, "command.required-contribution-unavailable");
    }
    assert.deepEqual(bus.read(), before);
    assert.deepEqual(crossTrace, []);
  }
});

test("Detached migration rejects a consumer whose declared provider is absent", () => {
  const complete = create(false);
  assert.equal(complete.submit(rebuild()).status, "committed");
  const initial: ScoreDocument = { ...snapshot(complete), extensions: snapshot(complete).extensions.map(block =>
    block.namespace === SUMMARY ? { ...block, schemaVersion: 1 } : block) };
  const request = { migrationVersion: 1, ...summarySource, namespace: SUMMARY,
    effectKind: `${SUMMARY}.replace`, owner: { kind: "score" as const },
    sourceSchemaVersion: 1, targetSchemaVersion: 2, payload: { clear: false } };
  const catalog = crossCatalogWithoutIndex();
  for (const native of [false, true]) {
    crossTrace.length = 0;
    const restore = native ? installNativeIntegratedBackendV2(addon) : () => {};
    try {
      const result = migrateKernelExtension(initial, request, catalog);
      assert.equal(result.status, "rejected");
      if (result.status === "rejected") {
        assert.equal(result.failure.code, "migration.contribution-contract-violation");
      }
    } finally { restore(); }
    assert.deepEqual(crossTrace, []);
  }
});

test("Detached migration uses the same dependency projection and never grants foreign writes", () => {
  const compiled = crossCatalog(), bus = create(true, compiled);
  assert.equal(bus.submit(rebuild()).status, "committed");
  const request = { migrationVersion: 1, ...summarySource, namespace: SUMMARY, effectKind: `${SUMMARY}.replace`, owner: { kind: "score" },
    sourceSchemaVersion: 2, targetSchemaVersion: 1, payload: { clear: false } };
  const initial: ScoreDocument = { ...snapshot(bus), extensions: snapshot(bus).extensions.map(block => block.namespace === SUMMARY ? { ...block, schemaVersion: 2 } : block) };
  crossTrace.length = 0;
  const expected = migrateKernelExtension(initial, request, compiled);
  assert.equal(expected.status, "migrated");
  crossTrace.length = 0;
  const restore = installNativeIntegratedBackendV2(addon);
  try { assert.deepEqual(migrateKernelExtension(initial, request, compiled), expected); } finally { restore(); }
  const view = crossTrace.find(entry => entry.plugin === SUMMARY && entry.phase === "transform")?.view as DomainContributionDependencyReadViewV1;
  assert.equal(view.dependencyReads[0]!.blocks.length, 2);
  assert.deepEqual(view.compatibleExtensions.map(block => block.namespace), [SUMMARY]);
  const future: ScoreDocument = { ...initial, extensions: initial.extensions.map(block => block.namespace === INDEX ? { ...block, schemaVersion: 3 } : block) };
  for (const native of [false, true]) {
    crossTrace.length = 0;
    const restored = create(native, compiled, future);
    assert.deepEqual(snapshot(restored), future);
    assert.equal(restored.submit(crossCommand(true)).status, "rejected");
    assert.ok(!crossTrace.some(entry => entry.plugin === SUMMARY), "incompatible dependency must not appear empty to a validator");
    const restore = native ? installNativeIntegratedBackendV2(addon) : () => {};
    try {
      const result = migrateKernelExtension(future, request, compiled);
      assert.equal(result.status, "rejected");
      if (result.status === "rejected") assert.equal(result.failure.code, "migration.contribution-contract-violation");
    } finally { restore(); }
    assert.ok(!crossTrace.some(entry => entry.plugin === SUMMARY));
  }
});

test("Reciprocal read declarations use one candidate snapshot without recursive execution or authority inheritance", () => {
  const reverse = { readVersion: 1, reader: indexSource, provider: summarySource,
    namespace: SUMMARY, supportedSchemaVersions: [1, 2], ownerKinds: ["score"] };
  const compiled = crossCatalog(true, [reverse, ...crossReads]);
  const bus = create(true, compiled);
  crossTrace.length = 0;
  assert.equal(bus.submit(rebuild()).status, "committed");
  assert.equal(crossTrace.filter(entry => entry.phase === "validate").length, 2);
  assert.equal(crossTrace.filter(entry => entry.phase === "classify").length, 2);
  const onlyReverse = compileContributionReadCatalogV1(compiled, [reverse]);
  assert.ok(onlyReverse.ok);
  const replacement = create(true, onlyReverse.catalog);
  assert.equal(replacement.submit(rebuild()).status, "rejected", "new roster replaces all old read grants");
  assert.equal(bus.submit(batch([pitch(), crossCommand(false), crossCommand(true)])).status, "committed");
  checkSummary(snapshot(bus), "E");
});
