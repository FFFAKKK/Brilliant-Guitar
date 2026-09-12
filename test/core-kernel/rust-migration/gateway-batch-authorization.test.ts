import { test } from "node:test";
import assert = require("node:assert/strict");
import { resolve } from "node:path";
import { CommandBus, createKernelRegistry } from "../../../src/core-kernel/index";
import { compileOfficialModuleCatalogV1 } from "../../../src/core-kernel/module-sdk/index";
import { installNativeIntegratedBackendV2, type IntegratedNativeAddonV2 } from "../../../src/core-kernel/native/integrated-command-bus";
import { createCoreScoreFixture } from "../fixtures/core-score";
import { CVN6_MANIFEST, CVN6_REGISTRATION_ENTRIES, cvn6CallbackCounts, resetCvn6Callbacks } from "../fixtures/cvn-6-synthetic-official-modules";

const addon = require(resolve("target/integrated-v2/brilliant_kernel_node.node")) as IntegratedNativeAddonV2;
function setup(native: boolean) {
  const compiled = compileOfficialModuleCatalogV1(CVN6_MANIFEST, CVN6_REGISTRATION_ENTRIES);
  assert.ok(compiled.ok);
  const registry = createKernelRegistry(compiled.catalog);
  assert.ok(registry.ok);
  const restore = native ? installNativeIntegratedBackendV2(addon) : () => {};
  try {
    const created = CommandBus.createIntegrated(createCoreScoreFixture(), compiled.catalog);
    assert.ok(created.ok);
    const scoped = registry.registry.createGateway("fixture.score.module", created.value);
    assert.ok(scoped.ok);
    return { bus: created.value, gateway: scoped.gateway };
  } finally { restore(); }
}
function command(module: "score" | "part") {
  return { commandVersion: 1, commandId: `fixture.${module}.apply`,
    target: module === "score" ? { kind: "document", documentId: "score-1" } : { kind: "part", partId: "part-1" },
    payload: { noteId: "note-1", pitch: { step: "D", alter: 0, octave: 4 }, schemaVersion: 1, marker: "gateway-batch" } };
}
function batch(commands: readonly unknown[]) {
  return { commandVersion: 1, commandId: "core.transaction.batch", target: { kind: "document", documentId: "score-1" }, payload: { commands } };
}
const core = { commandVersion: 1, commandId: "core.note.set-written-pitch", target: { kind: "note", noteId: "note-1" }, payload: { writtenPitch: { step: "E", alter: 0, octave: 4 } } };

test("Module gateways reject foreign Batch children before every callback, mutation and history entry", () => {
  for (const native of [false, true]) for (const children of [
    [command("part")], [core, command("score"), command("part")], [command("part"), command("score")],
    [core, { ...command("part"), payload: null }],
  ]) {
    const { bus, gateway } = setup(native);
    const before = bus.read();
    const events: unknown[] = [];
    bus.subscribe((event: unknown) => events.push(event));
    resetCvn6Callbacks();
    const zero = { ...cvn6CallbackCounts };
    assert.deepEqual(gateway.submit(batch(children)), {
      status: "rejected", failure: { code: "registry.contribution-not-found", contributionId: "fixture.part.apply" },
    });
    assert.deepEqual(cvn6CallbackCounts, zero);
    assert.deepEqual(events, []);
    assert.deepEqual(bus.read(), before);
    assert.deepEqual(gateway.submit(command("part")), {
      status: "rejected", failure: { code: "registry.contribution-not-found", contributionId: "fixture.part.apply" },
    });
  }
});

test("Same-module mixed Batch remains equal to the trusted host, which may compose different modules", () => {
  for (const native of [false, true]) {
    const { bus, gateway } = setup(native);
    const direct = setup(native).bus;
    const input = batch([core, command("score")]);
    assert.deepEqual(gateway.submit(input), { status: "authorized", value: direct.submit(input) });
    assert.deepEqual(bus.read(), direct.read());
    assert.deepEqual(gateway.undo(), { status: "authorized", value: direct.undo() });
    assert.deepEqual(gateway.redo(), { status: "authorized", value: direct.redo() });
    assert.equal(bus.submit(batch([command("score"), command("part")])).status, "committed");
  }
});

test("Batch authorization dispatches the detached child it checked without a second Proxy capture", () => {
  for (const native of [false, true]) {
    const { bus, gateway } = setup(native);
    let identityReads = 0;
    let ordinaryGets = 0;
    const child = new Proxy(command("score"), {
      get() { ordinaryGets++; throw new Error("ordinary get must not execute"); },
      getOwnPropertyDescriptor(target, key) {
        if (key === "commandId") identityReads++;
        const value = identityReads > 1 ? command("part") : target;
        return Object.getOwnPropertyDescriptor(value, key);
      },
    });
    const result = gateway.submit(batch([child]));
    assert.equal(result.status, "authorized");
    if (result.status === "authorized") assert.equal(result.value.status, "committed");
    assert.equal(identityReads, 1);
    assert.equal(ordinaryGets, 0);
    const read = bus.read();
    assert.ok(read.ok);
    assert.deepEqual(read.value.snapshot.document.extensions.map(block => block.namespace), ["fixture.score"]);
  }
});

test("Malformed and nested batches retain command rejection without executing modules", () => {
  for (const native of [false, true]) for (const input of [batch([]), batch([{}]), batch([batch([command("part")])])]) {
    const { bus, gateway } = setup(native);
    const before = bus.read();
    resetCvn6Callbacks();
    const zero = { ...cvn6CallbackCounts };
    const expected = bus.submit(input);
    assert.equal(expected.status, "rejected");
    assert.deepEqual(gateway.submit(input), { status: "authorized", value: expected });
    assert.deepEqual(cvn6CallbackCounts, zero);
    assert.deepEqual(bus.read(), before);
  }
});
