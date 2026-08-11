import assert = require("node:assert/strict");
import { test } from "node:test";

import {
  CommandBus,
  CORE_KERNEL_STARTUP_MANIFEST,
  createKernelRegistry,
  type KernelEvent,
  type KernelModuleGateway,
  type KernelStartupModuleManifest,
  type ScoreDocument,
  type ScoreMetadata,
} from "../../src/core-kernel/index";
import { cloneCoreScoreFixture } from "./fixtures/core-score";

function requireBus(): CommandBus {
  const created = CommandBus.create(cloneCoreScoreFixture());
  assert.equal(created.ok, true);
  if (!created.ok) {
    assert.fail("expected valid Core batch fixture");
  }
  return created.value;
}

function readDocument(bus: CommandBus): ScoreDocument {
  const read = bus.read();
  assert.equal(read.ok, true);
  if (!read.ok) {
    assert.fail("expected readable Core batch state");
  }
  return read.value.snapshot.document;
}

function metadata(title: string): ScoreMetadata {
  return {
    title,
    authors: ["Brilliant Guitar"],
    tempo: { bpm: 120 },
  };
}

function setMetadata(title: string): unknown {
  return {
    commandVersion: 1,
    commandId: "core.document.set-metadata",
    target: { kind: "document", documentId: "score-1" },
    payload: { metadata: metadata(title) },
  };
}

function batch(commands: readonly unknown[]): unknown {
  return {
    commandVersion: 1,
    commandId: "core.transaction.batch",
    target: { kind: "document", documentId: "score-1" },
    payload: { commands },
  };
}

function batchGatewayManifest(): KernelStartupModuleManifest {
  return {
    startupManifestVersion: CORE_KERNEL_STARTUP_MANIFEST.startupManifestVersion,
    modules: [
      ...CORE_KERNEL_STARTUP_MANIFEST.modules.map((module) => ({
        ...module,
        capabilities: [...module.capabilities],
        registrationEntryIds: [...module.registrationEntryIds],
      })),
      {
        moduleId: "internal.cvn5-authorized",
        origin: "official",
        runtime: "internal-module",
        trustLevel: "system-trusted",
        apiVersion: 1,
        capabilities: ["command:execute"],
        registrationEntryIds: [],
      },
      {
        moduleId: "internal.cvn5-denied",
        origin: "official",
        runtime: "internal-module",
        trustLevel: "system-trusted",
        apiVersion: 1,
        capabilities: [],
        registrationEntryIds: [],
      },
    ],
  };
}

function requireGateway(
  moduleId: "internal.cvn5-authorized" | "internal.cvn5-denied",
  bus: CommandBus,
): KernelModuleGateway {
  const registry = createKernelRegistry(batchGatewayManifest());
  assert.equal(registry.ok, true);
  if (!registry.ok) {
    assert.fail("expected CVN-5 gateway Registry");
  }
  const created = registry.registry.createGateway(moduleId, bus);
  assert.equal(created.ok, true);
  if (!created.ok) {
    assert.fail("expected CVN-5 gateway");
  }
  return created.gateway;
}

test("effective Core batch commits once and undo/redo use one history entry", () => {
  const bus = requireBus();
  const events: KernelEvent[] = [];
  bus.subscribe((event: KernelEvent) => {
    events.push(event);
  });

  const result = bus.submit(
    batch([setMetadata("First"), setMetadata("Second")]),
  );
  assert.equal(result.status, "committed");
  assert.equal(result.documentVersion, 1);
  assert.equal(result.undoDepth, 1);
  assert.equal(readDocument(bus).metadata.title, "Second");
  const committed = events.filter(
    (event): event is Extract<
      KernelEvent,
      { readonly eventType: "core.document.committed" }
    > => event.eventType === "core.document.committed",
  );
  assert.equal(committed.length, 1);
  assert.equal(committed[0]?.commandId, "core.transaction.batch");

  const undone = bus.undo();
  assert.equal(undone.status, "committed");
  assert.equal(readDocument(bus).metadata.title, "Core fixture");
  const redone = bus.redo();
  assert.equal(redone.status, "committed");
  assert.equal(readDocument(bus).metadata.title, "Second");
});

test("effective sequence that restores the original document still commits", () => {
  const bus = requireBus();
  const before = structuredClone(readDocument(bus));
  const result = bus.submit(
    batch([setMetadata("Temporary"), setMetadata("Core fixture")]),
  );

  assert.equal(result.status, "committed");
  assert.equal(result.documentVersion, 1);
  assert.deepEqual(readDocument(bus), before);
  assert.equal(bus.undo().status, "committed");
  assert.deepEqual(readDocument(bus), before);
});

test("later children resolve against earlier candidate changes", () => {
  const bus = requireBus();
  const before = structuredClone(readDocument(bus));
  const inserted = {
    commandVersion: 1,
    commandId: "core.voice.insert-rest-event",
    target: { kind: "voice", voiceId: "voice-1" },
    payload: {
      anchor: { kind: "after-event", eventId: "event-4" },
      event: {
        id: "batch-event",
        duration: { base: 4, dots: 0 },
        content: { kind: "rest" },
      },
    },
  };
  const removed = {
    commandVersion: 1,
    commandId: "core.event.remove",
    target: { kind: "event", eventId: "batch-event" },
    payload: {},
  };

  const result = bus.submit(batch([inserted, removed]));
  assert.equal(result.status, "committed");
  assert.deepEqual(readDocument(bus), before);
});

test("child rejection is attributed once and preserves all observable state", () => {
  const bus = requireBus();
  const events: KernelEvent[] = [];
  bus.subscribe((event: KernelEvent) => {
    events.push(event);
  });
  const before = structuredClone(readDocument(bus));
  const result = bus.submit(
    batch([
      setMetadata("Must not leak"),
      {
        commandVersion: 1,
        commandId: "core.unknown",
        target: { kind: "document", documentId: "score-1" },
        payload: {},
      },
    ]),
  );

  assert.equal(result.status, "rejected");
  if (result.status === "rejected") {
    assert.deepEqual(result.failure, {
      code: "command.batch-child-rejected",
      failedCommandIndex: 1,
      failure: { code: "command.unknown-id" },
    });
    assert.equal(result.documentVersion, 0);
    assert.equal(result.undoDepth, 0);
    assert.equal(result.redoDepth, 0);
  }
  assert.deepEqual(readDocument(bus), before);
  assert.equal(events.length, 0);
});

test("nested batch, empty batch, and child-count overflow use fixed failures", () => {
  const bus = requireBus();
  const nested = bus.submit(batch([batch([setMetadata("nested")])]));
  assert.equal(nested.status, "rejected");
  if (nested.status === "rejected") {
    assert.deepEqual(nested.failure, {
      code: "command.batch-child-rejected",
      failedCommandIndex: 0,
      failure: { code: "command.batch-nested" },
    });
  }

  const empty = bus.submit(batch([]));
  assert.equal(empty.status, "rejected");
  if (empty.status === "rejected") {
    assert.equal(empty.failure.code, "command.batch-empty");
  }

  const tooMany = bus.submit(
    batch(Array.from({ length: 101 }, () => setMetadata("same"))),
  );
  assert.equal(tooMany.status, "rejected");
  if (tooMany.status === "rejected") {
    assert.deepEqual(tooMany.failure, {
      code: "command.resource-limit-exceeded",
      limitKind: "batch-children",
      limit: 100,
      actual: 101,
    });
  }
});

test("all-no-op Core batch preserves version and redo branch", () => {
  const bus = requireBus();
  assert.equal(bus.submit(setMetadata("Changed")).status, "committed");
  assert.equal(bus.undo().status, "committed");
  const noOp = bus.submit(batch([setMetadata("Core fixture")]));
  assert.equal(noOp.status, "no-op");
  assert.equal(noOp.documentVersion, 2);
  assert.equal(noOp.undoDepth, 0);
  assert.equal(noOp.redoDepth, 1);
  assert.equal(bus.redo().status, "committed");
});

test("gateway batch execution reuses command:execute and denial precedes mutation", () => {
  const directBus = requireBus();
  const gatewayBus = requireBus();
  const input = batch([setMetadata("Gateway batch")]);
  const direct = directBus.submit(input);
  const authorized = requireGateway(
    "internal.cvn5-authorized",
    gatewayBus,
  ).submit(input);
  assert.deepEqual(authorized, { status: "authorized", value: direct });
  assert.deepEqual(gatewayBus.read(), directBus.read());

  const deniedBus = requireBus();
  const deniedEvents: KernelEvent[] = [];
  deniedBus.subscribe((event: KernelEvent) => deniedEvents.push(event));
  const before = deniedBus.read();
  const denied = requireGateway("internal.cvn5-denied", deniedBus).submit(
    batch([setMetadata("must not commit")]),
  );
  assert.deepEqual(denied, {
    status: "rejected",
    failure: {
      code: "registry.capability-denied",
      moduleId: "internal.cvn5-denied",
      capability: "command:execute",
    },
  });
  assert.deepEqual(deniedBus.read(), before);
  assert.deepEqual(deniedEvents, []);
});
