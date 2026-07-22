import { test } from "node:test";
import assert = require("node:assert/strict");

import {
  CommandBus,
  createKernelValidationReport,
  createKernelRegistry,
  decodeScoreDocument,
  encodeScoreDocumentJson,
  migrateScoreDocument,
  parseScoreDocumentJson,
  replayCoreCommands,
  validateScoreDocumentSemantics,
  validateScoreFeatureProfile,
  type CommandResult,
  type KernelEvent,
  type KernelReadState,
  type KernelStartupModuleManifest,
  type MarkPersistedResult,
  type MigrationResult,
  type ReadResult,
  type RegistrySummary,
  type ReplayCoreCommandsResult,
  type ScoreDocument,
} from "../../src/core-kernel/index";
import { cloneK1_6ScoreFixture } from "./fixtures/k1-6-score";

function assertDeeplyFrozen(value: unknown): void {
  if (value === null || typeof value !== "object") return;
  assert.equal(Object.isFrozen(value), true);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
    if (descriptor !== undefined && "value" in descriptor) {
      assertDeeplyFrozen(descriptor.value);
    }
  }
}

function integrationManifest(): KernelStartupModuleManifest {
  return {
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
          "registry:read",
          "command:execute",
          "selector:execute",
          "score:read",
          "event:subscribe",
        ],
        registrationEntryIds: [],
      },
    ],
  };
}

const ACCEPTED_COMMANDS = [
  {
    commandVersion: 1,
    commandId: "core.note.set-written-pitch",
    target: { kind: "note", noteId: "note-k1-6-1-1" },
    payload: { writtenPitch: { step: "D", alter: 0, octave: 4 } },
  },
  {
    commandVersion: 1,
    commandId: "core.event.set-note-value",
    target: { kind: "event", eventId: "event-k1-6-1-1" },
    payload: { noteValue: { base: 8, dots: 0 } },
  },
  {
    commandVersion: 1,
    commandId: "core.voice.insert-rest-event",
    target: { kind: "voice", voiceId: "voice-k1-6-1" },
    payload: {
      anchor: { kind: "after-event", eventId: "event-k1-6-1-1" },
      event: {
        id: "event-k1-6-1-1b",
        duration: { base: 8, dots: 0 },
        content: { kind: "rest" },
      },
    },
  },
] as const;

function requireBus(document: ScoreDocument): CommandBus {
  const created = CommandBus.create(document);
  assert.equal(created.ok, true);
  if (!created.ok) throw new Error("expected K1-6 CommandBus");
  return created.value;
}

function requireReadResult<T>(result: ReadResult<T>): T {
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("expected successful K1-6 selector/read");
  return result.value;
}

function requireAuthorized<T>(
  result:
    | { readonly status: "authorized"; readonly value: T }
    | { readonly status: "rejected"; readonly failure: unknown },
): T {
  assert.equal(result.status, "authorized");
  if (result.status !== "authorized") {
    throw new Error("expected authorized K1-6 gateway result");
  }
  return result.value;
}

interface K1_6IntegrationTrace {
  readonly roundTripDocument: ScoreDocument;
  readonly migration: MigrationResult;
  readonly registrySummary: RegistrySummary;
  readonly commandResults: readonly CommandResult[];
  readonly checkpointResult: MarkPersistedResult;
  readonly persistedRead: KernelReadState;
  readonly version3Read: KernelReadState;
  readonly selectorFacts: Readonly<{
    metadata: unknown;
    insertedEvent: unknown;
    ownership: unknown;
    measureRange: unknown;
    history: unknown;
    dirty: unknown;
  }>;
  readonly replay: ReplayCoreCommandsResult;
  readonly undoResult: CommandResult;
  readonly undoRead: KernelReadState;
  readonly redoResult: CommandResult;
  readonly finalRead: KernelReadState;
  readonly events: readonly KernelEvent[];
}

function runK1_6IntegrationScenario(): K1_6IntegrationTrace {
  const initial = cloneK1_6ScoreFixture();
  const encoded = encodeScoreDocumentJson(initial);
  assert.equal(encoded.ok, true);
  if (!encoded.ok) throw new Error("expected K1-6 scenario encode");
  const parsed = parseScoreDocumentJson(encoded.value);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) throw new Error("expected K1-6 scenario parse");
  const migration = migrateScoreDocument(parsed.value);
  assert.equal(migration.status, "not-required");
  if (migration.status !== "not-required") {
    throw new Error("expected detached K1-6 migration candidate");
  }

  const bus = requireBus(migration.document);
  const createdRegistry = createKernelRegistry(integrationManifest());
  assert.equal(createdRegistry.ok, true);
  if (!createdRegistry.ok) throw new Error("expected K1-6 Registry");
  const createdGateway = createdRegistry.registry.createGateway(
    "internal.k1-6-integration",
    bus,
  );
  assert.equal(createdGateway.ok, true);
  if (!createdGateway.ok) throw new Error("expected K1-6 gateway");
  const gateway = createdGateway.gateway;

  const events: KernelEvent[] = [];
  requireAuthorized(gateway.subscribe((event: KernelEvent) => events.push(event)));
  requireAuthorized(
    gateway.subscribe(() => {
      throw new Error("PRIVATE_K1_6_SUBSCRIBER_FAILURE");
    }),
  );
  requireAuthorized(
    gateway.subscribe(() =>
      Promise.reject(new Error("PRIVATE_K1_6_SUBSCRIBER_FAILURE")),
    ),
  );

  const registrySummary = requireAuthorized(gateway.summary());

  const first = requireAuthorized(gateway.submit(ACCEPTED_COMMANDS[0]));
  assert.deepEqual(
    {
      status: first.status,
      documentVersion: first.documentVersion,
      undoDepth: first.undoDepth,
      redoDepth: first.redoDepth,
      support: first.status === "committed" ? first.support.status : undefined,
    },
    {
      status: "committed",
      documentVersion: 1,
      undoDepth: 1,
      redoDepth: 0,
      support: "supported",
    },
  );
  const checkpointResult = bus.markPersisted({
    documentId: "score-k1-6",
    documentVersion: 1,
  });
  assert.deepEqual(checkpointResult, {
    status: "updated",
    documentVersion: 1,
    dirty: false,
  });
  const persistedRead = requireReadResult(requireAuthorized(gateway.read()));
  const second = requireAuthorized(gateway.submit(ACCEPTED_COMMANDS[1]));
  assert.equal(second.status, "committed");
  if (second.status !== "committed") throw new Error("expected command 2 commit");
  assert.deepEqual(
    second.support.diagnostics.map(({ code }) => code),
    ["unsupported.sequence-duration"],
  );
  const third = requireAuthorized(gateway.submit(ACCEPTED_COMMANDS[2]));
  assert.equal(third.status, "committed");
  if (third.status !== "committed") throw new Error("expected command 3 commit");
  assert.equal(third.support.status, "supported");

  const version3Read = requireReadResult(requireAuthorized(gateway.read()));
  const selectorFacts = {
    metadata: requireReadResult(
      requireAuthorized(
        gateway.select({ selectorId: "core.selector.score-metadata" }),
      ),
    ),
    insertedEvent: requireReadResult(
      requireAuthorized(
        gateway.select({
          selectorId: "core.selector.score-entity",
          address: { kind: "event", eventId: "event-k1-6-1-1b" },
        }),
      ),
    ),
    ownership: requireReadResult(
      requireAuthorized(
        gateway.select({
          selectorId: "core.selector.score-entity-ownership",
          address: { kind: "event", eventId: "event-k1-6-1-1b" },
        }),
      ),
    ),
    measureRange: requireReadResult(
      requireAuthorized(
        gateway.select({
          selectorId: "core.selector.score-range",
          range: {
            kind: "measure-range",
            start: { kind: "measure", measureId: "measure-k1-6-1" },
            end: { kind: "measure", measureId: "measure-k1-6-4" },
          },
        }),
      ),
    ),
    history: requireReadResult(
      requireAuthorized(
        gateway.select({ selectorId: "core.selector.history-state" }),
      ),
    ),
    dirty: requireReadResult(
      requireAuthorized(
        gateway.select({ selectorId: "core.selector.dirty-state" }),
      ),
    ),
  } as const;

  const replay = replayCoreCommands(cloneK1_6ScoreFixture(), ACCEPTED_COMMANDS);
  const undoResult = requireAuthorized(gateway.undo());
  const undoRead = requireReadResult(requireAuthorized(gateway.read()));
  const redoResult = requireAuthorized(gateway.redo());
  const finalRead = requireReadResult(requireAuthorized(gateway.read()));

  return {
    roundTripDocument: structuredClone(parsed.value),
    migration: structuredClone(migration),
    registrySummary: structuredClone(registrySummary),
    commandResults: structuredClone([first, second, third]),
    checkpointResult: structuredClone(checkpointResult),
    persistedRead: structuredClone(persistedRead),
    version3Read: structuredClone(version3Read),
    selectorFacts: structuredClone(selectorFacts),
    replay: structuredClone(replay),
    undoResult: structuredClone(undoResult),
    undoRead: structuredClone(undoRead),
    redoResult: structuredClone(redoResult),
    finalRead: structuredClone(finalRead),
    events: structuredClone(events),
  };
}

test("four-measure fixture traverses codec validation profile and migration", () => {
  const source = cloneK1_6ScoreFixture();
  const decoded = decodeScoreDocument(source);
  assert.equal(decoded.ok, true);
  if (!decoded.ok) throw new Error("expected K1-6 fixture to decode");
  assert.notEqual(decoded.value, source);
  assert.deepEqual(validateScoreDocumentSemantics(decoded.value), {
    ok: true,
    diagnostics: [],
  });
  assert.deepEqual(validateScoreFeatureProfile(decoded.value), {
    status: "supported",
    diagnostics: [],
  });

  const encoded = encodeScoreDocumentJson(decoded.value);
  assert.equal(encoded.ok, true);
  if (!encoded.ok) throw new Error("expected K1-6 fixture to encode");
  const parsed = parseScoreDocumentJson(encoded.value);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) throw new Error("expected K1-6 fixture JSON to parse");
  assert.deepEqual(parsed.value, decoded.value);

  const migrated = migrateScoreDocument(source);
  assert.equal(migrated.status, "not-required");
  if (migrated.status !== "not-required") {
    throw new Error("expected current schema to need no migration");
  }
  assert.deepEqual(migrated.document, decoded.value);
  assert.notEqual(migrated.document, source);
  assertDeeplyFrozen(migrated.document);
  const detachedDocument = structuredClone(decoded.value);
  const scorePayload = source.extensions[0]!.payload as {
    nested: { flags: boolean[]; count: number };
  };
  const partPayload = source.extensions[1]!.payload as {
    annotations: { values: number[] }[];
  };
  scorePayload.nested.flags.push(true);
  scorePayload.nested.count = 99;
  partPayload.annotations[0]!.values.push(99);
  assert.deepEqual(scorePayload.nested, {
    flags: [true, false, true],
    count: 99,
  });
  assert.deepEqual(partPayload.annotations[0]!.values, [1, 2, 3, 99]);
  assert.deepEqual(decoded.value, detachedDocument);
  assert.deepEqual(parsed.value, detachedDocument);
  assert.deepEqual(migrated.document, detachedDocument);
  assert.deepEqual(migrated.report, {
    reportVersion: 1,
    kind: "migration",
    status: "completed",
    summary: {
      issueCount: 0,
      warningCount: 0,
      errorCount: 0,
      fatalCount: 0,
    },
    issues: [],
  });
  assert.deepEqual(createKernelValidationReport([]), {
    reportVersion: 1,
    kind: "validation",
    status: "completed",
    summary: {
      issueCount: 0,
      warningCount: 0,
      errorCount: 0,
      fatalCount: 0,
    },
    issues: [],
  });
});

test("public integration scenario keeps writes reads events history and replay coherent", () => {
  const trace = runK1_6IntegrationScenario();

  assert.deepEqual(
    trace.commandResults.map((result) => [
      result.status,
      result.documentVersion,
      result.undoDepth,
      result.redoDepth,
    ]),
    [
      ["committed", 1, 1, 0],
      ["committed", 2, 2, 0],
      ["committed", 3, 3, 0],
    ],
  );
  assert.equal(trace.persistedRead.snapshot.documentVersion, 1);
  assert.deepEqual(trace.persistedRead.history, { undoDepth: 1, redoDepth: 0 });
  assert.equal(trace.persistedRead.dirty, false);
  assert.equal(trace.version3Read.snapshot.documentVersion, 3);
  assert.equal(trace.version3Read.history.undoDepth, 3);
  assert.equal(trace.version3Read.history.redoDepth, 0);
  assert.equal(trace.version3Read.dirty, true);
  assert.equal(trace.replay.status, "replayed");
  if (trace.replay.status !== "replayed") {
    throw new Error("expected K1-6 replay");
  }
  assert.equal(trace.replay.documentVersion, 3);
  assert.deepEqual(trace.replay.results, trace.commandResults);
  assert.deepEqual(trace.replay.finalDocument, trace.version3Read.snapshot.document);
  assert.deepEqual(
    [
      trace.undoResult.status,
      trace.undoResult.documentVersion,
      trace.undoResult.undoDepth,
      trace.undoResult.redoDepth,
    ],
    ["committed", 4, 2, 1],
  );
  assert.deepEqual(
    [
      trace.redoResult.status,
      trace.redoResult.documentVersion,
      trace.redoResult.undoDepth,
      trace.redoResult.redoDepth,
    ],
    ["committed", 5, 3, 0],
  );
  const replayBeforeInsert = replayCoreCommands(
    cloneK1_6ScoreFixture(),
    ACCEPTED_COMMANDS.slice(0, 2),
  );
  assert.equal(replayBeforeInsert.status, "replayed");
  if (replayBeforeInsert.status !== "replayed") {
    throw new Error("expected K1-6 pre-insert replay");
  }
  assert.equal(trace.undoRead.snapshot.documentVersion, 4);
  assert.deepEqual(trace.undoRead.history, { undoDepth: 2, redoDepth: 1 });
  assert.equal(trace.undoRead.dirty, true);
  assert.deepEqual(
    trace.undoRead.snapshot.document,
    replayBeforeInsert.finalDocument,
  );
  assert.deepEqual(
    trace.finalRead.snapshot.document,
    trace.version3Read.snapshot.document,
  );
  assert.equal(trace.finalRead.snapshot.documentVersion, 5);
  assert.deepEqual(trace.finalRead.history, { undoDepth: 3, redoDepth: 0 });
  assert.equal(trace.finalRead.dirty, true);
  assert.equal(trace.undoResult.status, "committed");
  if (trace.undoResult.status !== "committed") {
    throw new Error("expected K1-6 undo commit");
  }
  assert.deepEqual(
    trace.undoResult.support.diagnostics.map(({ code }) => code),
    ["unsupported.sequence-duration"],
  );
  assert.equal(trace.redoResult.status, "committed");
  if (trace.redoResult.status !== "committed") {
    throw new Error("expected K1-6 redo commit");
  }
  assert.equal(trace.redoResult.support.status, "supported");
  assert.deepEqual(
    trace.registrySummary.modules.map(({ moduleId }) => moduleId),
    ["core.commands", "core.selectors", "internal.k1-6-integration"],
  );
  assert.equal(trace.registrySummary.contributions.length, 12);
  assert.deepEqual(trace.selectorFacts.metadata, {
    title: "K1-6 integration fixture",
    authors: ["Brilliant Guitar"],
    tempo: { bpm: 96 },
  });
  assert.deepEqual(trace.selectorFacts.insertedEvent, {
    kind: "event",
    value: {
      id: "event-k1-6-1-1b",
      duration: { base: 8, dots: 0 },
      content: { kind: "rest" },
    },
  });
  assert.deepEqual(trace.selectorFacts.ownership, {
    entityKind: "event",
    documentId: "score-k1-6",
    partId: "part-k1-6",
    measureId: "measure-k1-6-1",
    voiceId: "voice-k1-6-1",
  });
  assert.deepEqual(trace.selectorFacts.history, { undoDepth: 3, redoDepth: 0 });
  assert.equal(trace.selectorFacts.dirty, true);
  const expectedMeasures = cloneK1_6ScoreFixture().measureDefinitions;
  assert.deepEqual(trace.selectorFacts.measureRange, {
    kind: "measure-range",
    normalized: {
      kind: "measure-range",
      start: { kind: "measure", measureId: "measure-k1-6-1" },
      end: { kind: "measure", measureId: "measure-k1-6-4" },
    },
    measures: expectedMeasures,
  });
  const expectedExtensions = cloneK1_6ScoreFixture().extensions;
  assert.deepEqual(trace.roundTripDocument.extensions, expectedExtensions);
  assert.deepEqual(
    trace.persistedRead.snapshot.document.extensions,
    expectedExtensions,
  );
  assert.deepEqual(
    trace.version3Read.snapshot.document.extensions,
    expectedExtensions,
  );
  assert.deepEqual(trace.replay.finalDocument.extensions, expectedExtensions);
  assert.deepEqual(
    trace.undoRead.snapshot.document.extensions,
    expectedExtensions,
  );
  assert.deepEqual(
    trace.finalRead.snapshot.document.extensions,
    expectedExtensions,
  );
  assert.deepEqual(
    trace.events.map((event) => [
      event.eventSequence,
      event.eventType,
      event.cause,
      event.documentVersion,
    ]),
    [
      [1, "core.document.committed", "submit", 1],
      [2, "core.session.dirty-state-changed", "submit", 1],
      [3, "core.session.dirty-state-changed", "mark-persisted", 1],
      [4, "core.document.committed", "submit", 2],
      [5, "core.session.dirty-state-changed", "submit", 2],
      [6, "core.document.committed", "submit", 3],
      [7, "core.document.committed", "undo", 4],
      [8, "core.document.committed", "redo", 5],
    ],
  );
  assert.equal(JSON.stringify(trace).includes("PRIVATE_K1_6"), false);
});

test("public integration scenario is deeply deterministic across fresh runs", async () => {
  const first = runK1_6IntegrationScenario();
  await Promise.resolve();
  const second = runK1_6IntegrationScenario();
  await Promise.resolve();
  assert.deepEqual(second, first);
});
