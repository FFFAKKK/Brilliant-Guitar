import { test } from "node:test";
import assert = require("node:assert/strict");

import {
  CommandBus,
  createKernelRegistry,
  createKernelValidationReport,
  decodeScoreDocument,
  mapCheckpointFailureToKernelIssues,
  mapCommandFailureToKernelIssues,
  mapEventSubscriptionFailureToKernelIssues,
  mapReadFailureToKernelIssues,
  mapRegistryAccessFailureToKernelIssues,
  migrateScoreDocument,
  validateScoreDocumentSemantics,
  validateScoreFeatureProfile,
  type KernelEvent,
  type KernelModuleGateway,
  type KernelReport,
  type KernelStartupModuleManifest,
} from "../../src/core-kernel/index";
import { cloneK1_6ScoreFixture } from "./fixtures/k1-6-score";

const VALID_PITCH_COMMAND = {
  commandVersion: 1,
  commandId: "core.note.set-written-pitch",
  target: { kind: "note", noteId: "note-k1-6-1-1" },
  payload: { writtenPitch: { step: "D", alter: 0, octave: 4 } },
} as const;

function requireAuthorized<T>(
  result:
    | { readonly status: "authorized"; readonly value: T }
    | { readonly status: "rejected"; readonly failure: unknown },
): T {
  assert.equal(result.status, "authorized");
  if (result.status !== "authorized") {
    throw new Error("expected authorized K1-6 boundary result");
  }
  return result.value;
}

function requireBoundaryRuntime(): {
  readonly bus: CommandBus;
  readonly gateway: KernelModuleGateway;
  readonly deniedGateway: KernelModuleGateway;
} {
  const migrated = migrateScoreDocument(cloneK1_6ScoreFixture());
  assert.equal(migrated.status, "not-required");
  if (migrated.status !== "not-required") {
    throw new Error("expected boundary migration candidate");
  }
  const createdBus = CommandBus.create(migrated.document);
  assert.equal(createdBus.ok, true);
  if (!createdBus.ok) throw new Error("expected boundary CommandBus");

  const manifest: KernelStartupModuleManifest = {
    startupManifestVersion: 1,
    modules: [
      {
        moduleId: "core.commands",
        origin: "official",
        runtime: "builtin",
        trustLevel: "system-trusted",
        apiVersion: 1,
        capabilities: ["command:register"],
        registrationEntryIds: ["core.commands.v1"],
      },
      {
        moduleId: "core.selectors",
        origin: "official",
        runtime: "builtin",
        trustLevel: "system-trusted",
        apiVersion: 1,
        capabilities: ["selector:register"],
        registrationEntryIds: ["core.selectors.v1"],
      },
      {
        moduleId: "internal.k1-6-integration",
        origin: "official",
        runtime: "internal-module",
        trustLevel: "system-trusted",
        apiVersion: 1,
        capabilities: [
          "command:execute",
          "selector:execute",
          "score:read",
          "event:subscribe",
        ],
        registrationEntryIds: [],
      },
      {
        moduleId: "internal.k1-6-denied",
        origin: "official",
        runtime: "internal-module",
        trustLevel: "system-trusted",
        apiVersion: 1,
        capabilities: [],
        registrationEntryIds: [],
      },
    ],
  };
  const createdRegistry = createKernelRegistry(manifest);
  assert.equal(createdRegistry.ok, true);
  if (!createdRegistry.ok) throw new Error("expected boundary Registry");
  const full = createdRegistry.registry.createGateway(
    "internal.k1-6-integration",
    createdBus.value,
  );
  const denied = createdRegistry.registry.createGateway(
    "internal.k1-6-denied",
    createdBus.value,
  );
  assert.equal(full.ok, true);
  assert.equal(denied.ok, true);
  if (!full.ok || !denied.ok) throw new Error("expected boundary gateways");
  return {
    bus: createdBus.value,
    gateway: full.gateway,
    deniedGateway: denied.gateway,
  };
}

test("future schema and semantic invalidity remain separate rejection boundaries", () => {
  const future = {
    ...cloneK1_6ScoreFixture(),
    schemaVersion: "brilliant-score-2",
  };
  const decodedFuture = decodeScoreDocument(future);
  assert.equal(decodedFuture.ok, false);
  const migratedFuture = migrateScoreDocument(future);
  assert.equal(migratedFuture.status, "rejected");
  if (migratedFuture.status !== "rejected") {
    throw new Error("expected future schema rejection");
  }
  assert.equal(
    migratedFuture.failure.code,
    "migration.unsupported-source-version",
  );
  assert.equal("document" in migratedFuture, false);

  const duplicate = cloneK1_6ScoreFixture();
  const duplicateEvent =
    duplicate.parts[0]!.measureContents[1]!.voices[0]!.sequence.events[0]!;
  (duplicateEvent as { id: string }).id = "event-k1-6-1-1";
  const decodedDuplicate = decodeScoreDocument(duplicate);
  assert.equal(decodedDuplicate.ok, true);
  const semantic = validateScoreDocumentSemantics(duplicate);
  assert.equal(semantic.ok, false);
  assert.deepEqual(
    semantic.diagnostics.map(({ code }) => code),
    ["semantic.id-duplicate"],
  );
  assert.equal(
    createKernelValidationReport(semantic.diagnostics).status,
    "rejected",
  );
  const migratedDuplicate = migrateScoreDocument(duplicate);
  assert.equal(migratedDuplicate.status, "rejected");
  if (migratedDuplicate.status !== "rejected") {
    throw new Error("expected semantic migration rejection");
  }
  assert.equal(migratedDuplicate.failure.code, "migration.semantic-invalid");
  assert.deepEqual(migratedDuplicate.failure.diagnostics, semantic.diagnostics);
  assert.equal("document" in migratedDuplicate, false);
});

test("semantic-valid unsupported chord remains a warning-level support result", () => {
  const chord = cloneK1_6ScoreFixture();
  const notesEvent =
    chord.parts[0]!.measureContents[0]!.voices[0]!.sequence.events[0]!;
  if (notesEvent.content.kind !== "notes") {
    throw new Error("expected notes event");
  }
  (notesEvent.content.notes as (typeof notesEvent.content.notes)[number][]).push({
    id: "note-k1-6-1-1b",
    writtenPitch: { step: "E", alter: 0, octave: 4 },
  });
  assert.equal(validateScoreDocumentSemantics(chord).ok, true);
  const support = validateScoreFeatureProfile(chord);
  assert.equal(support.status, "unsupported");
  assert.deepEqual(
    support.diagnostics.map(({ code }) => code),
    ["unsupported.chord"],
  );
  const report = createKernelValidationReport(support.diagnostics);
  assert.equal(report.status, "completed-with-warnings");
  assert.deepEqual(report.issues.map(({ code }) => code), ["unsupported.chord"]);
  assert.equal(migrateScoreDocument(chord).status, "not-required");
});

test("authorized public failures preserve command state and event atomicity", () => {
  const { bus, gateway } = requireBoundaryRuntime();
  const events: unknown[] = [];
  const subscribed = gateway.subscribe((event: unknown) => events.push(event));
  assert.equal(subscribed.status, "authorized");
  const beforeResult = bus.read();
  assert.equal(beforeResult.ok, true);
  if (!beforeResult.ok) throw new Error("expected boundary read");
  const before = beforeResult.value;
  assert.deepEqual(before.history, { undoDepth: 0, redoDepth: 0 });
  assert.equal(before.snapshot.documentVersion, 0);
  assert.equal(before.dirty, false);

  const emptyUndo = requireAuthorized(gateway.undo());
  assert.equal(emptyUndo.status, "rejected");
  if (emptyUndo.status !== "rejected") throw new Error("expected empty undo");
  assert.deepEqual(
    mapCommandFailureToKernelIssues(emptyUndo.failure).map(({ code }) => code),
    ["history.empty-undo"],
  );

  const missingRead = requireAuthorized(
    gateway.select({
      selectorId: "core.selector.score-entity",
      address: { kind: "event", eventId: "missing-event" },
    }),
  );
  assert.equal(missingRead.ok, false);
  if (missingRead.ok) throw new Error("expected missing selector entity");
  assert.deepEqual(
    mapReadFailureToKernelIssues(missingRead.failure).map(({ code }) => code),
    ["read.entity-not-found"],
  );

  const checkpoint = bus.markPersisted({
    documentId: "wrong-document",
    documentVersion: 0,
  });
  assert.equal(checkpoint.status, "rejected");
  if (checkpoint.status !== "rejected") {
    throw new Error("expected checkpoint rejection");
  }
  assert.deepEqual(
    mapCheckpointFailureToKernelIssues(checkpoint.failure).map(
      ({ code }) => code,
    ),
    ["checkpoint.document-mismatch"],
  );

  const invalidSubscription = requireAuthorized(gateway.subscribe(null));
  assert.equal(invalidSubscription.status, "rejected");
  if (invalidSubscription.status !== "rejected") {
    throw new Error("expected invalid subscription rejection");
  }
  assert.deepEqual(
    mapEventSubscriptionFailureToKernelIssues(
      invalidSubscription.failure,
    ).map(({ code }) => code),
    ["event.invalid-handler"],
  );

  const rejected = requireAuthorized(
    gateway.submit({
      commandVersion: 1,
      commandId: "core.note.set-written-pitch",
      target: { kind: "note", noteId: "missing-note" },
      payload: { writtenPitch: { step: "D", alter: 0, octave: 4 } },
    }),
  );
  assert.equal(rejected.status, "rejected");
  if (rejected.status !== "rejected") {
    throw new Error("expected command rejection");
  }
  assert.equal(rejected.failure.code, "command.target-not-found");
  assert.deepEqual(
    mapCommandFailureToKernelIssues(rejected.failure).map(({ code }) => code),
    ["command.target-not-found"],
  );
  const afterResult = bus.read();
  assert.equal(afterResult.ok, true);
  if (!afterResult.ok) throw new Error("expected boundary read after failures");
  assert.deepEqual(afterResult.value, before);
  assert.deepEqual(events, []);
});

test("capability denial happens before command mutation", () => {
  const { bus, deniedGateway } = requireBoundaryRuntime();
  const beforeResult = bus.read();
  assert.equal(beforeResult.ok, true);
  if (!beforeResult.ok) throw new Error("expected denied-path read");
  const before = beforeResult.value;
  const denied = deniedGateway.submit(VALID_PITCH_COMMAND);
  assert.equal(denied.status, "rejected");
  if (denied.status !== "rejected") {
    throw new Error("expected capability denial");
  }
  assert.deepEqual(denied.failure, {
    code: "registry.capability-denied",
    moduleId: "internal.k1-6-denied",
    capability: "command:execute",
  });
  const issues = mapRegistryAccessFailureToKernelIssues(denied.failure);
  assert.deepEqual(issues.map(({ code }) => code), [
    "registry.capability-denied",
  ]);
  assert.deepEqual(issues[0]!.details, {
    moduleId: "internal.k1-6-denied",
    capability: "command:execute",
  });
  const afterResult = bus.read();
  assert.equal(afterResult.ok, true);
  if (!afterResult.ok) {
    throw new Error("expected denied-path read after failure");
  }
  assert.deepEqual(afterResult.value, before);
});

test("subscriber failures and hostile report input remain private", async () => {
  const { gateway } = requireBoundaryRuntime();
  const events: KernelEvent[] = [];
  const recording = requireAuthorized(
    gateway.subscribe((event: KernelEvent) => events.push(event)),
  );
  const throwing = requireAuthorized(
    gateway.subscribe(() => {
      throw new Error("PRIVATE_K1_6_SUBSCRIBER_FAILURE");
    }),
  );
  const rejecting = requireAuthorized(
    gateway.subscribe(() =>
      Promise.reject(new Error("PRIVATE_K1_6_SUBSCRIBER_FAILURE")),
    ),
  );
  assert.equal(recording.status, "subscribed");
  assert.equal(throwing.status, "subscribed");
  assert.equal(rejecting.status, "subscribed");
  const committed = requireAuthorized(gateway.submit(VALID_PITCH_COMMAND));
  assert.equal(committed.status, "committed");
  await Promise.resolve();
  assert.deepEqual(
    events.map(({ eventType, eventSequence }) => [eventType, eventSequence]),
    [
      ["core.document.committed", 1],
      ["core.session.dirty-state-changed", 2],
    ],
  );
  assert.equal(
    JSON.stringify({ committed, events }).includes("PRIVATE_K1_6"),
    false,
  );

  let getterCalls = 0;
  const hostile: unknown[] = [];
  Object.defineProperty(hostile, "0", {
    enumerable: true,
    configurable: true,
    get() {
      getterCalls += 1;
      throw new Error("PRIVATE_K1_6_REPORT_FAILURE");
    },
  });
  hostile.length = 1;
  const runtimeReport = createKernelValidationReport as unknown as (
    input: unknown,
  ) => KernelReport<"validation">;
  const report = runtimeReport(hostile);
  assert.equal(getterCalls, 0);
  assert.equal(report.status, "rejected");
  assert.deepEqual(report.issues.map(({ code }) => code), [
    "report.invalid-input",
  ]);
  assert.equal(JSON.stringify(report).includes("PRIVATE_K1_6"), false);
});
