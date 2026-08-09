import assert = require("node:assert/strict");
import { test } from "node:test";

import {
  CORE_KERNEL_STARTUP_MANIFEST,
  createKernelRegistry,
  encodeScoreDocumentJson,
  replayCoreCommands,
  type CommandBus,
  type KernelEvent,
  type KernelModuleGateway,
  type KernelReadState,
  type KernelStartupModuleManifest,
  type ScoreDocument,
} from "../../src/core-kernel/index";
import {
  collectEvents,
  committedEvents,
  insertPartCommand,
  insertStaffCommand,
  insertVoiceCommand,
  movePartCommand,
  moveStaffCommand,
  moveVoiceCommand,
  readDocument,
  removePartCommand,
  removeStaffCommand,
  removeVoiceCommand,
  requireBus,
  setEventStaffAssignmentCommand,
  setPartInstrumentCommand,
  setPartNameCommand,
  setStaffDefinitionCommand,
  setVoiceDefaultStaffCommand,
  setVoiceSequenceStartCommand,
} from "./fixtures/cvn-4-command-helpers";
import {
  cloneCvn4ScoreFixture,
  createCvn4InsertedPart,
  createCvn4InsertedVoice,
} from "./fixtures/cvn-4-score";

interface LifecycleCase {
  readonly commandId: string;
  readonly setup?: (bus: CommandBus) => void;
  readonly command: () => Record<string, unknown>;
}

function committed(bus: CommandBus, input: unknown): void {
  const result = bus.submit(input);
  assert.equal(result.status, "committed");
}

function requireReadState(bus: CommandBus): KernelReadState {
  const result = bus.read();
  if (!result.ok) {
    throw new Error(`expected CVN-4 read: ${result.failure.code}`);
  }
  assert.equal(result.ok, true);
  return result.value;
}

function encodeDocument(document: ScoreDocument): string {
  const result = encodeScoreDocumentJson(document);
  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error("expected CVN-4 document encoding");
  }
  return result.value;
}

function requireAuthorized<T>(
  result:
    | { readonly status: "authorized"; readonly value: T }
    | { readonly status: "rejected"; readonly failure: unknown },
): T {
  assert.equal(result.status, "authorized");
  if (result.status !== "authorized") {
    throw new Error("expected authorized CVN-4 gateway result");
  }
  return result.value;
}

function createCvn4Manifest(): KernelStartupModuleManifest {
  return {
    startupManifestVersion: CORE_KERNEL_STARTUP_MANIFEST.startupManifestVersion,
    modules: [
      ...CORE_KERNEL_STARTUP_MANIFEST.modules.map((module) => ({
        ...module,
        capabilities: [...module.capabilities],
        registrationEntryIds: [...module.registrationEntryIds],
      })),
      {
        moduleId: "internal.cvn4-authorized",
        origin: "official",
        runtime: "internal-module",
        trustLevel: "system-trusted",
        apiVersion: 1,
        capabilities: ["command:execute", "event:subscribe"],
        registrationEntryIds: [],
      },
      {
        moduleId: "internal.cvn4-denied",
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

function requireGatewayRuntime(document: ScoreDocument): {
  readonly bus: CommandBus;
  readonly gateway: KernelModuleGateway;
  readonly deniedGateway: KernelModuleGateway;
} {
  const bus = requireBus(document);
  const created = createKernelRegistry(createCvn4Manifest());
  if (!created.ok) {
    throw new Error(`expected CVN-4 Registry: ${created.failure.code}`);
  }
  assert.equal(created.ok, true);
  const authorized = created.registry.createGateway("internal.cvn4-authorized", bus);
  const denied = created.registry.createGateway("internal.cvn4-denied", bus);
  assert.equal(authorized.ok, true);
  assert.equal(denied.ok, true);
  if (!authorized.ok || !denied.ok) {
    throw new Error("expected CVN-4 Registry gateways");
  }
  return { bus, gateway: authorized.gateway, deniedGateway: denied.gateway };
}

function wrongTarget(input: Record<string, unknown>): Record<string, unknown> {
  const target = input.target as { readonly kind: string };
  return {
    ...input,
    target: target.kind === "document"
      ? { kind: "part", partId: "cvn4-part-a" }
      : { kind: "document", documentId: "cvn4-score" },
  };
}

function missingTarget(input: Record<string, unknown>): Record<string, unknown> {
  const target = input.target as Record<string, unknown> & { readonly kind: string };
  const identifierKey = {
    document: "documentId",
    part: "partId",
    staff: "staffId",
    voice: "voiceId",
    event: "eventId",
  }[target.kind];
  if (identifierKey === undefined) {
    throw new Error(`unexpected CVN-4 target kind ${target.kind}`);
  }
  return {
    ...input,
    target: { ...target, [identifierKey]: `cvn4-missing-${target.kind}` },
  };
}

function mutateSubmittedInput(input: Record<string, unknown>): void {
  (input.target as Record<string, unknown>).kind = "caller-mutated-target";
  const payload = input.payload as Record<string, unknown>;
  payload.unexpected = "caller-mutated";
  if (typeof payload.name === "string") {
    payload.name = "caller-mutated-name";
  }
  if (typeof payload.staffId === "string") {
    payload.staffId = "caller-mutated-staff";
  }
  const anchor = payload.anchor as Record<string, unknown> | undefined;
  if (anchor !== undefined) {
    anchor.kind = "caller-mutated-anchor";
  }
  const part = payload.part as Record<string, unknown> | undefined;
  if (part !== undefined) {
    part.id = "caller-mutated-part";
  }
  const staff = payload.staff as Record<string, unknown> | undefined;
  if (staff !== undefined) {
    staff.id = "caller-mutated-staff";
  }
  const voice = payload.voice as Record<string, unknown> | undefined;
  if (voice !== undefined) {
    voice.id = "caller-mutated-voice";
  }
  const instrument = payload.instrument as Record<string, unknown> | undefined;
  if (instrument !== undefined) {
    instrument.name = "caller-mutated-instrument";
  }
  const defaultClef = payload.defaultClef as Record<string, unknown> | undefined;
  if (defaultClef !== undefined) {
    defaultClef.line = 99;
  }
  const start = payload.start as Record<string, unknown> | undefined;
  if (start !== undefined) {
    start.numerator = 99;
  }
  const assignment = payload.assignment as Record<string, unknown> | undefined;
  if (assignment !== undefined) {
    assignment.kind = "caller-mutated-assignment";
  }
}

const LIFECYCLE_CASES: readonly LifecycleCase[] = [
  {
    commandId: "core.part.insert",
    command: () => insertPartCommand({ kind: "start" }, createCvn4InsertedPart()),
  },
  {
    commandId: "core.part.remove",
    command: () => removePartCommand("cvn4-part-c"),
  },
  {
    commandId: "core.part.move",
    command: () => movePartCommand("cvn4-part-c", { kind: "start" }),
  },
  {
    commandId: "core.part.set-name",
    command: () => setPartNameCommand("cvn4-part-a", "Transaction name"),
  },
  {
    commandId: "core.part.set-instrument",
    command: () =>
      setPartInstrumentCommand("cvn4-part-a", {
        name: "Violin",
        writtenToSounding: { diatonicSteps: 0, chromaticSemitones: 0 },
      }),
  },
  {
    commandId: "core.staff.insert",
    command: () =>
      insertStaffCommand("cvn4-part-a", { kind: "start" }, {
        id: "cvn4-transaction-staff",
        lineCount: 1,
        defaultClef: { sign: "C", line: 3 },
      }),
  },
  {
    commandId: "core.staff.remove",
    setup: (bus) => {
      committed(
        bus,
        setEventStaffAssignmentCommand("cvn4-event-a-1-notes", {
          kind: "inherit-default",
        }),
      );
    },
    command: () => removeStaffCommand("cvn4-staff-a-2"),
  },
  {
    commandId: "core.staff.move",
    command: () => moveStaffCommand("cvn4-staff-a-2", { kind: "start" }),
  },
  {
    commandId: "core.staff.set-definition",
    command: () =>
      setStaffDefinitionCommand("cvn4-staff-a-2", 1, { sign: "C", line: 3 }),
  },
  {
    commandId: "core.voice.insert",
    command: () =>
      insertVoiceCommand(
        "cvn4-part-a",
        "cvn4-measure-1",
        { kind: "start" },
        createCvn4InsertedVoice("cvn4-transaction-voice"),
      ),
  },
  {
    commandId: "core.voice.remove",
    command: () => removeVoiceCommand("cvn4-voice-a-1-primary"),
  },
  {
    commandId: "core.voice.move",
    command: () => moveVoiceCommand("cvn4-voice-a-1-secondary", { kind: "start" }),
  },
  {
    commandId: "core.voice.set-default-staff",
    command: () =>
      setVoiceDefaultStaffCommand("cvn4-voice-a-1-primary", "cvn4-staff-a-2"),
  },
  {
    commandId: "core.voice.set-sequence-start",
    command: () =>
      setVoiceSequenceStartCommand("cvn4-voice-a-1-primary", {
        numerator: 1,
        denominator: 4,
      }),
  },
  {
    commandId: "core.event.set-staff-assignment",
    command: () =>
      setEventStaffAssignmentCommand("cvn4-event-a-1-notes", {
        kind: "inherit-default",
      }),
  },
];

test("each CVN-4 command preserves encoded undo, redo, replay, and committed event facts", () => {
  for (const lifecycle of LIFECYCLE_CASES) {
    const bus = requireBus(cloneCvn4ScoreFixture());
    lifecycle.setup?.(bus);
    const before: ScoreDocument = structuredClone(readDocument(bus));
    const beforeEncoded = encodeDocument(before);
    const events: KernelEvent[] = [];
    const subscription = bus.subscribe((event: KernelEvent) => {
      events.push(event);
    });
    assert.equal(subscription.status, "subscribed");

    const command = lifecycle.command();
    const result = bus.submit(command);
    assert.equal(result.status, "committed", lifecycle.commandId);
    const after = structuredClone(readDocument(bus));
    const afterEncoded = encodeDocument(after);
    assert.notDeepEqual(after, before, lifecycle.commandId);
    assert.notEqual(afterEncoded, beforeEncoded, lifecycle.commandId);
    if (lifecycle.commandId !== "core.part.remove") {
      assert.deepEqual(after.extensions, before.extensions, lifecycle.commandId);
    }
    const commitEvents = committedEvents(events);
    assert.equal(commitEvents.length, 1, lifecycle.commandId);
    assert.equal(commitEvents[0]?.commandId, lifecycle.commandId);

    assert.equal(bus.undo().status, "committed", lifecycle.commandId);
    assert.deepEqual(readDocument(bus), before, lifecycle.commandId);
    assert.equal(encodeDocument(readDocument(bus)), beforeEncoded, lifecycle.commandId);
    assert.equal(bus.redo().status, "committed", lifecycle.commandId);
    assert.deepEqual(readDocument(bus), after, lifecycle.commandId);
    assert.equal(encodeDocument(readDocument(bus)), afterEncoded, lifecycle.commandId);

    const historyCommitEvents = committedEvents(events);
    assert.equal(historyCommitEvents.length, 3, lifecycle.commandId);
    assert.deepEqual(
      historyCommitEvents.map(({ cause }) => cause),
      ["submit", "undo", "redo"],
      lifecycle.commandId,
    );
    for (const event of historyCommitEvents) {
      assert.equal(event.commandId, lifecycle.commandId);
      assert.deepEqual(
        event.affectedEntities,
        historyCommitEvents[0]?.affectedEntities,
        lifecycle.commandId,
      );
    }

    const replay = replayCoreCommands(before, [command]);
    assert.equal(replay.status, "replayed", lifecycle.commandId);
    if (replay.status === "replayed") {
      assert.deepEqual(replay.finalDocument, after, lifecycle.commandId);
      assert.equal(encodeDocument(replay.finalDocument), afterEncoded);
      assert.equal(replay.results[0]?.status, "committed", lifecycle.commandId);
    }
  }
});

for (const lifecycle of LIFECYCLE_CASES) {
  test(`direct bus and authorized gateway are equivalent for ${lifecycle.commandId}`, () => {
    const directBus = requireBus(cloneCvn4ScoreFixture());
    lifecycle.setup?.(directBus);
    const directEvents = collectEvents(directBus);

    const gatewayRuntime = requireGatewayRuntime(cloneCvn4ScoreFixture());
    lifecycle.setup?.(gatewayRuntime.bus);
    const gatewayEvents: KernelEvent[] = [];
    const subscription = requireAuthorized(
      gatewayRuntime.gateway.subscribe((event: KernelEvent) => {
        gatewayEvents.push(event);
      }),
    );
    assert.equal(subscription.status, "subscribed");

    const directResult = directBus.submit(lifecycle.command());
    const gatewayResult = requireAuthorized(
      gatewayRuntime.gateway.submit(lifecycle.command()),
    );
    assert.equal(directResult.status, "committed", lifecycle.commandId);
    assert.deepEqual(gatewayResult, directResult, lifecycle.commandId);
    assert.deepEqual(
      readDocument(gatewayRuntime.bus),
      readDocument(directBus),
      lifecycle.commandId,
    );
    assert.deepEqual(gatewayEvents, directEvents, lifecycle.commandId);
  });
}

for (const lifecycle of LIFECYCLE_CASES) {
  test(`${lifecycle.commandId} preserves state for exact-input and target failures`, () => {
    const bus = requireBus(cloneCvn4ScoreFixture());
    lifecycle.setup?.(bus);
    const events = collectEvents(bus);
    const beforeState = structuredClone(requireReadState(bus));

    const malformed = lifecycle.command();
    (malformed.payload as Record<string, unknown>).unexpected = true;
    const malformedResult = bus.submit(malformed);
    assert.equal(malformedResult.status, "rejected", lifecycle.commandId);
    assert.equal(
      malformedResult.status === "rejected" && malformedResult.failure.code,
      "command.invalid-envelope",
      lifecycle.commandId,
    );

    const wrongTargetResult = bus.submit(wrongTarget(lifecycle.command()));
    assert.equal(wrongTargetResult.status, "rejected", lifecycle.commandId);
    assert.equal(
      wrongTargetResult.status === "rejected" && wrongTargetResult.failure.code,
      "command.target-mismatch",
      lifecycle.commandId,
    );

    const missingTargetResult = bus.submit(missingTarget(lifecycle.command()));
    assert.equal(missingTargetResult.status, "rejected", lifecycle.commandId);
    assert.equal(
      missingTargetResult.status === "rejected" && missingTargetResult.failure.code,
      "command.target-not-found",
      lifecycle.commandId,
    );

    assert.deepEqual(requireReadState(bus), beforeState, lifecycle.commandId);
    assert.deepEqual(events, [], lifecycle.commandId);

    const acceptedInput = lifecycle.command();
    assert.equal(bus.submit(acceptedInput).status, "committed", lifecycle.commandId);
    const after = structuredClone(readDocument(bus));
    mutateSubmittedInput(acceptedInput);
    assert.deepEqual(readDocument(bus), after, lifecycle.commandId);

    let getCalls = 0;
    const proxied = new Proxy(lifecycle.command(), {
      get(target, key, receiver) {
        getCalls += 1;
        return Reflect.get(target, key, receiver);
      },
    });
    const proxyBus = requireBus(cloneCvn4ScoreFixture());
    lifecycle.setup?.(proxyBus);
    assert.equal(proxyBus.submit(proxied).status, "committed", lifecycle.commandId);
    assert.equal(getCalls, 0, lifecycle.commandId);
  });
}

for (const lifecycle of LIFECYCLE_CASES) {
  test(`checkpoint, rejection, undo/redo, and redo clearing hold for ${lifecycle.commandId}`, () => {
    const bus = requireBus(cloneCvn4ScoreFixture());
    lifecycle.setup?.(bus);
    const before = structuredClone(readDocument(bus));
    const beforeHistory = requireReadState(bus).history;
    const committedResult = bus.submit(lifecycle.command());
    assert.equal(committedResult.status, "committed", lifecycle.commandId);
    const after = structuredClone(readDocument(bus));
    const afterState = requireReadState(bus);
    assert.deepEqual(
      bus.markPersisted({
        documentId: "cvn4-score",
        documentVersion: afterState.snapshot.documentVersion,
      }),
      {
        status: "updated",
        documentVersion: afterState.snapshot.documentVersion,
        dirty: false,
      },
      lifecycle.commandId,
    );
    assert.equal(requireReadState(bus).dirty, false, lifecycle.commandId);

    assert.equal(bus.undo().status, "committed", lifecycle.commandId);
    assert.deepEqual(readDocument(bus), before, lifecycle.commandId);
    assert.equal(requireReadState(bus).dirty, true, lifecycle.commandId);
    assert.deepEqual(
      requireReadState(bus).history,
      {
        undoDepth: beforeHistory.undoDepth,
        redoDepth: beforeHistory.redoDepth + 1,
      },
      lifecycle.commandId,
    );

    const rejected = bus.submit({ commandVersion: 1 });
    assert.equal(rejected.status, "rejected", lifecycle.commandId);
    assert.equal(
      rejected.status === "rejected" && rejected.failure.code,
      "command.invalid-envelope",
      lifecycle.commandId,
    );
    assert.deepEqual(readDocument(bus), before, lifecycle.commandId);
    assert.deepEqual(
      requireReadState(bus).history,
      {
        undoDepth: beforeHistory.undoDepth,
        redoDepth: beforeHistory.redoDepth + 1,
      },
      lifecycle.commandId,
    );

    assert.equal(bus.redo().status, "committed", lifecycle.commandId);
    assert.deepEqual(readDocument(bus), after, lifecycle.commandId);
    assert.equal(requireReadState(bus).dirty, false, lifecycle.commandId);

    assert.equal(bus.undo().status, "committed", lifecycle.commandId);
    assert.equal(bus.submit(lifecycle.command()).status, "committed", lifecycle.commandId);
    const emptiedRedo = bus.redo();
    assert.equal(emptiedRedo.status, "rejected", lifecycle.commandId);
    assert.equal(
      emptiedRedo.status === "rejected" && emptiedRedo.failure.code,
      "history.empty-redo",
      lifecycle.commandId,
    );
    assert.deepEqual(
      requireReadState(bus).history,
      { undoDepth: beforeHistory.undoDepth + 1, redoDepth: 0 },
      lifecycle.commandId,
    );
  });
}

for (const lifecycle of LIFECYCLE_CASES) {
  test(`gateway denial precedes ${lifecycle.commandId} mutation`, () => {
    const runtime = requireGatewayRuntime(cloneCvn4ScoreFixture());
    lifecycle.setup?.(runtime.bus);
    const events = collectEvents(runtime.bus);
    const before = structuredClone(requireReadState(runtime.bus));
    const denied = runtime.deniedGateway.submit(lifecycle.command());
    assert.deepEqual(denied, {
      status: "rejected",
      failure: {
        code: "registry.capability-denied",
        moduleId: "internal.cvn4-denied",
        capability: "command:execute",
      },
    });
    assert.deepEqual(requireReadState(runtime.bus), before, lifecycle.commandId);
    assert.deepEqual(events, [], lifecycle.commandId);
  });
}
