import { test } from "node:test";
import assert = require("node:assert/strict");
import { resolve } from "node:path";
import { CommandBus, createKernelRegistry, replayKernelCommands, type IntegratedKernelEvent } from "../../../src/core-kernel/index";
import { compileOfficialModuleCatalogV1 } from "../../../src/core-kernel/module-sdk/index";
import { installNativeIntegratedBackendV2, type IntegratedNativeAddonV2 } from "../../../src/core-kernel/native/integrated-command-bus";
import { createCoreScoreFixture } from "../fixtures/core-score";
import { captureHostInstalledContributionsV1 } from "../../../src/core-kernel/native/integrated-catalog-capture";
import type { IntegratedCommandBusCreationResult } from "../../../src/core-kernel/registry/integrated-contracts";
import { CVN6_MANIFEST, CVN6_REGISTRATION_ENTRIES, cvn6CallbackBehavior, cvn6CallbackCounts, resetCvn6Callbacks } from "../fixtures/cvn-6-synthetic-official-modules";
import { buildCommandAdmissionOracle } from "./command-admission-oracle";

const addon = require(resolve("target/integrated-v2/brilliant_kernel_node.node")) as IntegratedNativeAddonV2;
test("The private successor exposes session and detached migration while the old addon keeps five", () => {
  const legacy = require(resolve("target/rkp-1-node/brilliant_kernel_node.node"));
  const names = ["createKernelSessionV1", "readKernelSessionV1", "submitKernelStage3V1", "operateKernelStage4V1", "replayKernelStage4V1"].sort();
  assert.deepEqual(Object.keys(legacy).sort(), names);
  assert.deepEqual(Object.keys(addon).sort(), [...names, "createIntegratedKernelSessionV2", "migrateKernelExtensionV2"].sort());
});
function catalog() {
  const result = compileOfficialModuleCatalogV1(CVN6_MANIFEST, CVN6_REGISTRATION_ENTRIES);
  assert.ok(result.ok);
  return result.catalog;
}
function command(module = "score", marker = "native\ud800") {
  return { commandVersion: 1, commandId: `fixture.${module}.apply`,
    target: module === "score" ? { kind: "document", documentId: "score-1" } : { kind: "part", partId: "part-1" },
    payload: { noteId: "note-1", pitch: { step: "E", alter: 0, octave: 4 }, schemaVersion: 1, marker } };
}
function create(native: boolean, transport = addon, initial = createCoreScoreFixture()) {
  const restore = native ? installNativeIntegratedBackendV2(transport) : () => {};
  try {
    const result = CommandBus.createIntegrated(initial, catalog());
    assert.ok(result.ok, JSON.stringify(result));
    return result.value;
  } finally { restore(); }
}

function coreBatch(commands: readonly unknown[]) {
  return { commandVersion: 1, commandId: "core.transaction.batch",
    target: { kind: "document", documentId: "score-1" }, payload: { commands } };
}

test("integrated Native Core admission matches the complete independent command-shape corpus", () => {
  for (const entry of buildCommandAdmissionOracle().cases) {
    resetCvn6Callbacks();
    const oracle = create(false);
    const native = create(true);
    const events: unknown[][] = [[], []];
    oracle.subscribe((event: unknown) => events[0]!.push(event));
    native.subscribe((event: unknown) => events[1]!.push(event));
    const expected = oracle.submit(entry.input);
    assert.deepEqual(native.submit(entry.input), expected, entry.id);
    assert.deepEqual(native.read(), oracle.read(), `${entry.id}/read`);
    if (expected.status === "committed") {
      assert.deepEqual(native.undo(), oracle.undo(), `${entry.id}/undo`);
      assert.deepEqual(native.read(), oracle.read(), `${entry.id}/undo/read`);
      assert.deepEqual(native.redo(), oracle.redo(), `${entry.id}/redo`);
      assert.deepEqual(native.read(), oracle.read(), `${entry.id}/redo/read`);
    }
    assert.deepEqual(events[1], events[0], `${entry.id}/events`);
  }
});

test("integrated Native Core Batch preserves temporary raw identities, net-zero commits and candidate history", () => {
  const document = createCoreScoreFixture();
  const part = { ...document.parts[0]!, id: "temporary-part",
    staves: document.parts[0]!.staves.map(staff => ({ ...staff, id: "" })),
    measureContents: document.parts[0]!.measureContents.map(content => ({ ...content,
      voices: content.voices.map(voice => ({ ...voice, id: "", defaultStaffId: "",
        sequence: { ...voice.sequence, events: voice.sequence.events.map(event => ({ ...event, id: "",
          content: event.content.kind === "rest" ? event.content : { ...event.content,
            notes: event.content.notes.map(note => ({ ...note, id: "" })) } })) } })) })) };
  const batch = coreBatch([
    { commandVersion: 1, commandId: "core.document.set-metadata", target: { kind: "document", documentId: document.id },
      payload: { metadata: { ...document.metadata, title: "typed prefix" } } },
    { commandVersion: 1, commandId: "core.part.insert", target: { kind: "document", documentId: document.id }, payload: { anchor: { kind: "start" }, part } },
    { commandVersion: 1, commandId: "core.part.remove", target: { kind: "part", partId: part.id }, payload: {} },
    { commandVersion: 1, commandId: "core.document.set-metadata", target: { kind: "document", documentId: document.id }, payload: { metadata: document.metadata } },
  ]);
  resetCvn6Callbacks();
  const oracle = create(false);
  const native = create(true);
  for (const bus of [oracle, native]) assert.equal(bus.submit(command()).status, "committed");
  const events: unknown[][] = [[], []];
  oracle.subscribe((event: unknown) => events[0]!.push(event));
  native.subscribe((event: unknown) => events[1]!.push(event));
  for (const operation of ["submit", "undo", "redo", "undo", "submit"] as const) {
    const expected = operation === "submit" ? oracle.submit(batch) : oracle[operation]();
    const actual = operation === "submit" ? native.submit(batch) : native[operation]();
    assert.equal(expected.status, "committed");
    assert.deepEqual(actual, expected, operation);
    assert.deepEqual(native.read(), oracle.read(), operation);
  }
  assert.deepEqual(events[1], events[0]);
  const before = native.read();
  const beforeEvents = events[1]!.length;
  resetCvn6Callbacks();
  cvn6CallbackBehavior.validatorIssueModule = "score";
  const expected = oracle.undo();
  assert.equal(expected.status, "rejected");
  assert.deepEqual(native.undo(), expected);
  assert.deepEqual(native.read(), before);
  assert.equal(events[1]!.length, beforeEvents);
  assert.equal(cvn6CallbackCounts.commandPrepare, 0);
  assert.equal(cvn6CallbackCounts.effectTransform, 0);
  resetCvn6Callbacks();
  assert.deepEqual(native.undo(), oracle.undo());
  const undone = native.read();
  cvn6CallbackBehavior.validatorIssueModule = "score";
  assert.deepEqual(native.redo(), oracle.redo());
  assert.deepEqual(native.read(), undone);
  resetCvn6Callbacks();
  assert.deepEqual(native.redo(), oracle.redo());
  assert.deepEqual(native.read(), oracle.read());
});

test("integrated Native Core and module commands share history and reject final validator failures atomically", () => {
  resetCvn6Callbacks();
  const oracle = create(false);
  const native = create(true);
  const metadata = { commandVersion: 1, commandId: "core.document.set-metadata",
    target: { kind: "document", documentId: "score-1" }, payload: { metadata: { ...createCoreScoreFixture().metadata, title: "shared" } } };
  for (const input of [metadata, command(), coreBatch([metadata])]) {
    assert.deepEqual(native.submit(input), oracle.submit(input));
    assert.deepEqual(native.read(), oracle.read());
  }
  for (const operation of ["undo", "undo", "redo", "redo"] as const) {
    assert.deepEqual(native[operation](), oracle[operation]());
    assert.deepEqual(native.read(), oracle.read());
  }
  const before = native.read();
  cvn6CallbackBehavior.validatorIssueModule = "score";
  const changed = { ...metadata, payload: { metadata: { ...metadata.payload.metadata, title: "must not publish" } } };
  for (const input of [changed, coreBatch([changed])]) {
    const expected = oracle.submit(input);
    assert.equal(expected.status, "rejected");
    assert.deepEqual(native.submit(input), expected);
    assert.deepEqual(native.read(), before);
  }
  resetCvn6Callbacks();
});

test("real SDK Native factory matches TS mixed pitch/extension commit, events, no-op and stored undo/redo", () => {
  for (const module of ["score", "part"]) {
    resetCvn6Callbacks();
    const oracle = create(false);
    const native = create(true);
    const expectedEvents: IntegratedKernelEvent[] = [];
    const actualEvents: IntegratedKernelEvent[] = [];
    oracle.subscribe((event: IntegratedKernelEvent) => expectedEvents.push(event));
    native.subscribe((event: IntegratedKernelEvent) => actualEvents.push(event));
    for (const operation of ["submit", "submit", "undo", "redo"] as const) {
      resetCvn6Callbacks();
      const expected = operation === "submit" ? oracle.submit(command(module)) : oracle[operation]();
      const expectedCalls = { ...cvn6CallbackCounts };
      resetCvn6Callbacks();
      const actual = operation === "submit" ? native.submit(command(module)) : native[operation]();
      assert.deepEqual(actual, expected, `${module}/${operation}`);
      assert.deepEqual(cvn6CallbackCounts, expectedCalls, "callbacks execute once; undo/redo never prepare or transform");
      assert.deepEqual(native.read(), oracle.read());
      assert.deepEqual(actualEvents, expectedEvents);
    }
  }
});

test("Native gateway preserves real catalog identity and rejects cross-module capability access", () => {
  resetCvn6Callbacks();
  const compiled = catalog();
  const registry = createKernelRegistry(compiled);
  assert.ok(registry.ok);
  const restore = installNativeIntegratedBackendV2(addon);
  try {
    const created = CommandBus.createIntegrated(createCoreScoreFixture(), compiled);
    assert.ok(created.ok);
    const gateway = registry.registry.createGateway("fixture.score.module", created.value);
    assert.ok(gateway.ok);
    const before = created.value.read();
    assert.deepEqual(gateway.gateway.submit(command("part")), {
      status: "rejected", failure: { code: "registry.contribution-not-found", contributionId: "fixture.part.apply" },
    });
    assert.deepEqual(created.value.read(), before);
    const allowed = gateway.gateway.submit(command());
    assert.equal(allowed.status, "authorized");
    const other = CommandBus.createIntegrated(createCoreScoreFixture(), catalog());
    assert.ok(other.ok);
    assert.equal(registry.registry.createGateway("fixture.score.module", other.value).ok, false);
  } finally { restore(); }
});

test("Native unknown UTF-16 extension data survives history branches and persisted checkpoints", () => {
  resetCvn6Callbacks();
  const initial = createCoreScoreFixture();
  const document = { ...initial, extensions: [...initial.extensions, {
    namespace: "unknown.keep", schemaVersion: 23, owner: { kind: "score" as const },
    payload: { text: "\ud800\udfff", nested: { "\ud801": [null, -0, "𐀀"] } },
  }] };
  const oracle = create(false, addon, document);
  const native = create(true, addon, document);
  const events: unknown[][] = [[], []];
  oracle.subscribe((event: unknown) => events[0]!.push(event));
  native.subscribe((event: unknown) => events[1]!.push(event));
  for (const bus of [oracle, native]) {
    assert.equal(bus.submit(command()).status, "committed");
    assert.equal(bus.markPersisted({ documentId: "score-1", documentVersion: 1 }).status, "updated");
    assert.equal(bus.undo().status, "committed");
    assert.equal(bus.submit(command("score", "branch")).status, "committed");
    assert.equal(bus.redo().status, "rejected");
  }
  assert.deepEqual(native.read(), oracle.read());
  assert.deepEqual(events[1], events[0]);
});

test("Rust rejects tampered effect authority and sees preceding pitch changes in callback views", () => {
  resetCvn6Callbacks();
  for (const tamper of ["namespace", "owner", "affected", "none"]) {
    let sawOverlayPitch = false;
    const transport: IntegratedNativeAddonV2 = {
      createIntegratedKernelSessionV2(bytes, executor) {
        return addon.createIntegratedKernelSessionV2(bytes, (input) => {
          const request = JSON.parse(input.toString("utf8"));
          if (request.operation === "transform") {
            const note = request.document.parts[0].measureContents[0].voices[0].sequence.events[0].content.notes[0];
            assert.equal(note.writtenPitch.step, "E");
            sawOverlayPitch = true;
          }
          const reply = JSON.parse(executor(input).toString("utf8"));
          if (request.operation === "prepare" && reply.ok) {
            if (tamper === "namespace") reply.prepared.effectRequests[1].namespace = "fixture.part";
            if (tamper === "owner") reply.prepared.effectRequests[1].owner = { kind: "part", partId: "part-1" };
            if (tamper === "affected") reply.prepared.affected.push({ kind: "note", noteId: "missing" });
          }
          return Buffer.from(JSON.stringify(reply));
        });
      },
    };
    const native = create(true, transport);
    const before = native.read();
    const result = native.submit(command());
    if (tamper === "none") { assert.equal(result.status, "committed"); assert.ok(sawOverlayPitch); }
    else { assert.equal(result.status, "rejected"); assert.deepEqual(native.read(), before); }
  }
});

test("Native callback and event reentry cannot publish a nested write or checkpoint", async () => {
  resetCvn6Callbacks();
  let native: ReturnType<typeof create> | undefined;
  let operation: ((bytes: Buffer) => Buffer) | undefined;
  const nested: unknown[] = [];
  const transport: IntegratedNativeAddonV2 = {
    createIntegratedKernelSessionV2(bytes, executor) {
      operation = addon.createIntegratedKernelSessionV2(bytes, (input) => {
        if (JSON.parse(input.toString("utf8")).operation === "prepare") {
          nested.push(native!.submit(command()));
          nested.push(native!.markPersisted({ documentId: "score-1", documentVersion: 0 }));
          const raw = JSON.parse(operation!(Buffer.from(JSON.stringify({ operation: "undo" }))).toString("utf8"));
          assert.equal(raw.failure.code, "event.reentrant-write");
        }
        return executor(input);
      });
      return operation;
    },
  };
  native = create(true, transport);
  native.subscribe(() => { nested.push(native!.undo()); return Promise.reject(new Error("subscriber rejection")); });
  assert.equal(native.submit(command()).status, "committed");
  for (const result of nested) assert.equal((result as { failure: { code: string } }).failure.code, "event.reentrant-write");
  const state = native.read();
  assert.ok(state.ok);
  assert.equal(state.value.history.undoDepth, 1);
  await new Promise<void>((resolve) => setImmediate(resolve));
});

test("Native mixed request rejection is atomic for every SDK callback family and invalid extension version", () => {
  for (const mode of ["throwFamily", "malformedFamily"] as const) {
    for (const family of ["commandDecode", "commandPrepare", "effectDecode", "effectTransform", "validate", "classify"] as const) {
      resetCvn6Callbacks();
      const oracle = create(false);
      const native = create(true);
      const before = native.read();
      const events: unknown[] = [];
      native.subscribe((event: unknown) => events.push(event));
      cvn6CallbackBehavior[mode] = family;
      const expected = oracle.submit(command());
      const actual = native.submit(command());
      assert.equal(actual.status, "rejected", `${mode}/${family}`);
      assert.deepEqual(actual, expected);
      assert.deepEqual(native.read(), before);
      assert.deepEqual(events, []);
    }
  }
  resetCvn6Callbacks();
  const native = create(true);
  const before = native.read();
  const input = command();
  input.payload.schemaVersion = 99;
  assert.equal(native.submit(input).status, "rejected");
  assert.deepEqual(native.read(), before);
});

test("Native module validation rejects the final mixed candidate and leaves history unchanged", () => {
  resetCvn6Callbacks();
  const oracle = create(false);
  const native = create(true);
  const before = native.read();
  cvn6CallbackBehavior.validatorIssueModule = "score";
  assert.deepEqual(native.submit(command()), oracle.submit(command()));
  assert.deepEqual(native.read(), before);
  resetCvn6Callbacks();
});

test("Native public replay retains earlier successful commands and reports the first failed index", () => {
  resetCvn6Callbacks();
  const commands = [command(), { ...command("part"), payload: { ...command("part").payload, schemaVersion: 99 } }, command("score", "unreached")];
  const compiled = catalog();
  const expected = replayKernelCommands(createCoreScoreFixture(), commands, compiled);
  const restore = installNativeIntegratedBackendV2(addon);
  try {
    const actual = replayKernelCommands(createCoreScoreFixture(), commands, compiled);
    assert.deepEqual(actual, expected);
    assert.equal(actual.status, "rejected");
    if (actual.status === "rejected") assert.equal(actual.failedCommandIndex, 1);
  } finally { restore(); }
});

test("Native known missing and incompatible extensions enforce read-only availability without dropping opaque values", () => {
  resetCvn6Callbacks();
  const full = catalog();
  const capture = captureHostInstalledContributionsV1(full)!;
  const inventory = { inventoryVersion: 1, requirements: capture.projection.contributions.flatMap((entry) => entry.requirements) };
  const partial = compileOfficialModuleCatalogV1({ ...CVN6_MANIFEST,
    modules: CVN6_MANIFEST.modules.filter((module) => module.moduleId !== "fixture.part.module"),
  }, CVN6_REGISTRATION_ENTRIES.filter((entry) => entry.ownerModuleId !== "fixture.part.module"));
  assert.ok(partial.ok);
  for (const version of [1, 99]) {
    const initial = createCoreScoreFixture();
    const document = { ...initial, extensions: [...initial.extensions, {
      namespace: "fixture.part", schemaVersion: version, owner: { kind: "part" as const, partId: "part-1" }, payload: { keep: "\ud800" },
    }] };
    const expected: IntegratedCommandBusCreationResult = CommandBus.createIntegrated(document, partial.catalog, inventory);
    assert.ok(expected.ok);
    const restore = installNativeIntegratedBackendV2(addon);
    try {
      const actual: IntegratedCommandBusCreationResult = CommandBus.createIntegrated(document, partial.catalog, inventory);
      assert.ok(actual.ok, JSON.stringify(actual));
      assert.deepEqual(actual.value.read(), expected.value.read());
      for (const operation of ["submit", "undo", "redo"] as const) {
        assert.deepEqual(operation === "submit" ? actual.value.submit(command()) : actual.value[operation](),
          operation === "submit" ? expected.value.submit(command()) : expected.value[operation]());
      }
      assert.deepEqual(actual.value.read(), expected.value.read());
    } finally { restore(); }
  }
});

test("Native history module reassessment can reject redo without moving the cursor", () => {
  resetCvn6Callbacks();
  const oracle = create(false);
  const native = create(true);
  for (const bus of [oracle, native]) { assert.equal(bus.submit(command()).status, "committed"); assert.equal(bus.undo().status, "committed"); }
  const before = native.read();
  resetCvn6Callbacks();
  cvn6CallbackBehavior.validatorIssueModule = "score";
  assert.deepEqual(native.redo(), oracle.redo());
  assert.equal(cvn6CallbackCounts.commandPrepare, 0);
  assert.equal(cvn6CallbackCounts.effectTransform, 0);
  assert.deepEqual(native.read(), before);
  resetCvn6Callbacks();
  assert.deepEqual(native.redo(), oracle.redo());
});

test("Native extension remove preserves position on undo and an explicit prepare no-op publishes nothing", () => {
  resetCvn6Callbacks();
  let mode: "replace" | "remove" | "no-op" = "replace";
  const transport: IntegratedNativeAddonV2 = { createIntegratedKernelSessionV2(bytes, executor) {
    return addon.createIntegratedKernelSessionV2(bytes, (input) => {
      const request = JSON.parse(input.toString("utf8"));
      const reply = JSON.parse(executor(input).toString("utf8"));
      if (request.operation === "transform" && mode === "remove") reply.transformed = { status: "remove" };
      if (request.operation === "prepare" && mode === "no-op") reply.prepared = { status: "no-op" };
      return Buffer.from(JSON.stringify(reply));
    });
  } };
  const native = create(true, transport);
  assert.equal(native.submit(command()).status, "committed");
  const inserted = native.read();
  mode = "no-op";
  assert.equal(native.submit(command("score", "unused")).status, "no-op");
  assert.deepEqual(native.read(), inserted);
  mode = "remove";
  assert.equal(native.submit(command()).status, "committed");
  const removed = native.read();
  assert.ok(removed.ok);
  assert.ok(!removed.value.snapshot.document.extensions.some((block) => block.namespace === "fixture.score"));
  assert.equal(native.undo().status, "committed");
  const restored = native.read();
  assert.ok(restored.ok && inserted.ok);
  assert.deepEqual(restored.value.snapshot.document, inserted.value.snapshot.document);
  assert.equal(native.redo().status, "committed");
});

test("Replacing JSON.stringify in a callback cannot corrupt Native transport or change the TS result", () => {
  resetCvn6Callbacks();
  const native = create(true);
  const oracle = create(false);
  const original = JSON.stringify;
  cvn6CallbackBehavior.replaceJsonStringify = true;
  try {
    const expected = oracle.submit(command());
    JSON.stringify = original;
    const result = native.submit(command());
    assert.deepEqual(result, expected);
  } finally { JSON.stringify = original; resetCvn6Callbacks(); }
  assert.deepEqual(native.read(), oracle.read());
});

test("Native methods reject foreign receivers and reuse an immutable snapshot for the same version", () => {
  resetCvn6Callbacks();
  const native = create(true);
  const oracle = create(false);
  for (const bus of [oracle, native]) {
    assert.throws(() => bus.submit.call({} as typeof bus, command()), TypeError);
    assert.throws(() => bus.read.call({} as typeof bus), TypeError);
    assert.throws(() => bus.markPersisted.call({} as typeof bus, {}), TypeError);
  }
  const first = native.read();
  const second = native.read();
  assert.ok(first.ok && second.ok);
  assert.strictEqual(first.value.snapshot, second.value.snapshot);
  assert.ok(Object.isFrozen(first.value.snapshot.document));
  native.submit(command());
  const changed = native.read();
  assert.ok(changed.ok);
  assert.notStrictEqual(changed.value.snapshot, first.value.snapshot);
  assert.equal(first.value.snapshot.documentVersion, 0);
});

test("Native mixed Batch uses genuine SDK commands with every independent Core admission shape", () => {
  for (const entry of buildCommandAdmissionOracle().cases) {
    resetCvn6Callbacks();
    const oracle = create(false);
    const native = create(true);
    const events: unknown[][] = [[], []];
    oracle.subscribe((event: unknown) => events[0]!.push(event));
    native.subscribe((event: unknown) => events[1]!.push(event));
    const input = coreBatch([command("score", "before-core"), entry.input]);
    const expected = oracle.submit(input);
    assert.deepEqual(native.submit(input), expected, entry.id);
    assert.deepEqual(native.read(), oracle.read(), `${entry.id}/read`);
    if (expected.status === "committed") {
      for (const operation of ["undo", "redo", "undo", "redo"] as const) {
        assert.deepEqual(native[operation](), oracle[operation](), `${entry.id}/${operation}`);
        assert.deepEqual(native.read(), oracle.read(), `${entry.id}/${operation}/read`);
      }
    }
    assert.deepEqual(events[1], events[0], `${entry.id}/events`);
  }
});

test("Native mixed Batch alternates module owners and Core removal, preserving one history and exact failures", () => {
  const document = createCoreScoreFixture();
  const metadata = { commandVersion: 1, commandId: "core.document.set-metadata", target: { kind: "document", documentId: document.id }, payload: { metadata: { ...document.metadata, title: "core prefix" } } };
  const remove = { commandVersion: 1, commandId: "core.part.remove", target: { kind: "part", partId: "part-1" }, payload: {} };
  const invalid = { ...command("part"), payload: { ...command("part").payload, schemaVersion: 99 } };
  const inputs = [
    coreBatch([metadata, command(), command("part")]),
    coreBatch([command("part"), remove]),
    coreBatch([command("part"), remove, { commandVersion: 1, commandId: "core.part.insert", target: metadata.target, payload: { anchor: { kind: "start" }, part: document.parts[0] } }]),
    coreBatch([metadata, command(), invalid]),
    coreBatch([command(), { commandId: "core.transaction.batch", commandVersion: 99 }]),
    coreBatch([command(), { commandVersion: 1, commandId: "core.part.set-name", target: { kind: "part", partId: "missing" }, payload: { name: "missing" } }]),
  ];
  for (const [index, input] of inputs.entries()) {
    resetCvn6Callbacks();
    const oracle = create(false);
    const native = create(true);
    const events: unknown[][] = [[], []];
    oracle.subscribe((event: unknown) => events[0]!.push(event));
    native.subscribe((event: unknown) => events[1]!.push(event));
    const before = native.read();
    const expected = oracle.submit(input);
    assert.equal(expected.status, index === 0 || index === 2 ? "committed" : "rejected", `case ${index}: ${JSON.stringify(expected)}`);
    assert.deepEqual(native.submit(input), expected, `case ${index}`);
    assert.deepEqual(native.read(), oracle.read());
    if (expected.status === "committed") {
      resetCvn6Callbacks();
      for (const operation of ["undo", "redo", "undo", "redo"] as const) {
        assert.deepEqual(native[operation](), oracle[operation]());
        assert.deepEqual(native.read(), oracle.read());
      }
      assert.equal(cvn6CallbackCounts.commandPrepare, 0);
      assert.equal(cvn6CallbackCounts.effectTransform, 0);
    } else assert.deepEqual(native.read(), before);
    assert.deepEqual(events[1], events[0]);
  }
});

test("Native module preparation observes the actual invalid Core prefix and later repair commits once", () => {
  const document = createCoreScoreFixture();
  const temporary = { ...document.parts[0]!, id: "temporary-part", staves: document.parts[0]!.staves.map(staff => ({ ...staff, id: "" })),
    measureContents: document.parts[0]!.measureContents.map(content => ({ ...content, voices: content.voices.map(voice => ({ ...voice,
      id: "", defaultStaffId: "", sequence: { ...voice.sequence, events: [] } })) })) };
  const input = coreBatch([
    { commandVersion: 1, commandId: "core.document.set-metadata", target: { kind: "document", documentId: document.id }, payload: { metadata: { ...document.metadata, title: "visible prefix" } } },
    { commandVersion: 1, commandId: "core.part.insert", target: { kind: "document", documentId: document.id }, payload: { anchor: { kind: "start" }, part: temporary } },
    command(),
    { commandVersion: 1, commandId: "core.part.remove", target: { kind: "part", partId: temporary.id }, payload: {} },
  ]);
  resetCvn6Callbacks();
  const oracle = create(false);
  const native = create(true);
  let observations = 0;
  cvn6CallbackBehavior.prepareOverride = (view, result) => {
    assert.equal(view.coreDocument.metadata.title, "visible prefix");
    assert.equal(view.coreDocument.parts[0]!.id, temporary.id);
    assert.equal(view.coreDocument.parts[0]!.staves[0]!.id, "");
    observations++;
    return result;
  };
  const expected = oracle.submit(input);
  assert.equal(expected.status, "committed");
  assert.deepEqual(native.submit(input), expected);
  assert.equal(observations, 2);
  assert.deepEqual(native.read(), oracle.read());
  for (const operation of ["undo", "redo"] as const) {
    assert.deepEqual(native[operation](), oracle[operation]());
    assert.deepEqual(native.read(), oracle.read());
  }
  assert.equal(observations, 2, "history does not rerun preparation");
  resetCvn6Callbacks();
});

test("Native mixed Batch retains a nonempty module sequence with zero net document change", () => {
  resetCvn6Callbacks();
  const initial = createCoreScoreFixture();
  const document = { ...initial, extensions: [...initial.extensions, { namespace: "fixture.score", schemaVersion: 1,
    owner: { kind: "score" as const }, payload: { marker: "original" } }] };
  const oracle = create(false, addon, document);
  const native = create(true, addon, document);
  cvn6CallbackBehavior.prepareOverride = (view, result) => {
    assert.equal(result.status, "changed");
    if (result.status !== "changed") throw new Error("fixture");
    const event = view.coreDocument.parts[0]!.measureContents[0]!.voices[0]!.sequence.events[0]!;
    assert.equal(event.content.kind, "notes");
    if (event.content.kind !== "notes") throw new Error("fixture");
    return { ...result, effectRequests: [...result.effectRequests,
      { requestVersion: 1, requestKind: "core.note.replace-written-pitch", target: { kind: "note", noteId: "note-1" }, writtenPitch: event.content.notes[0]!.writtenPitch },
      { requestVersion: 1, requestKind: "module.extension", effectKind: "fixture.score.replace", namespace: "fixture.score", owner: { kind: "score" }, payload: { schemaVersion: 1, marker: "original" } },
    ] };
  };
  const input = coreBatch([command()]);
  const events: unknown[][] = [[], []];
  oracle.subscribe((event: unknown) => events[0]!.push(event));
  native.subscribe((event: unknown) => events[1]!.push(event));
  for (const operation of ["submit", "submit", "undo", "redo"] as const) {
    const expected = operation === "submit" ? oracle.submit(input) : oracle[operation]();
    assert.equal(expected.status, "committed");
    assert.deepEqual(operation === "submit" ? native.submit(input) : native[operation](), expected);
    assert.deepEqual(native.read(), oracle.read());
    const read = native.read();
    assert.ok(read.ok);
    assert.deepEqual(read.value.snapshot.document, document);
  }
  assert.deepEqual(events[1], events[0]);
  resetCvn6Callbacks();
});

test("Native mixed Batch callback failures identify the child and final module failures preserve the entire state", () => {
  for (const mode of ["throwFamily", "malformedFamily"] as const) {
    for (const family of ["commandDecode", "commandPrepare", "effectDecode", "effectTransform", "validate", "classify"] as const) {
      resetCvn6Callbacks();
      const oracle = create(false);
      const native = create(true);
      const before = native.read();
      const events: unknown[] = [];
      native.subscribe((event: unknown) => events.push(event));
      const document = createCoreScoreFixture();
      const prefix = { commandVersion: 1, commandId: "core.document.set-metadata", target: { kind: "document", documentId: document.id }, payload: { metadata: { ...document.metadata, title: "discard" } } };
      cvn6CallbackBehavior[mode] = family;
      const input = coreBatch([prefix, command()]);
      const expected = oracle.submit(input);
      assert.equal(expected.status, "rejected");
      assert.deepEqual(native.submit(input), expected, `${mode}/${family}`);
      assert.deepEqual(native.read(), before);
      assert.deepEqual(events, []);
    }
  }
  resetCvn6Callbacks();
});

test("Native mixed Batch skips real no-op children and restores removed extension ordering", () => {
  resetCvn6Callbacks();
  const oracle = create(false);
  const native = create(true);
  for (const bus of [oracle, native]) assert.equal(bus.submit(command()).status, "committed");
  const events: unknown[][] = [[], []];
  oracle.subscribe((event: unknown) => events[0]!.push(event));
  native.subscribe((event: unknown) => events[1]!.push(event));
  const input = coreBatch([command(), command()]);
  const before = native.read();
  const noop = oracle.submit(input);
  assert.equal(noop.status, "no-op");
  assert.deepEqual(native.submit(input), noop);
  assert.deepEqual(native.read(), before);
  assert.deepEqual(events, [[], []]);
  cvn6CallbackBehavior.transformOverride = () => ({ status: "remove" });
  const removed = oracle.submit(input);
  assert.equal(removed.status, "committed");
  assert.deepEqual(native.submit(input), removed);
  assert.deepEqual(native.read(), oracle.read());
  for (const operation of ["undo", "redo"] as const) {
    assert.deepEqual(native[operation](), oracle[operation]());
    assert.deepEqual(native.read(), oracle.read());
  }
  assert.deepEqual(events[1], events[0]);
  resetCvn6Callbacks();
});
