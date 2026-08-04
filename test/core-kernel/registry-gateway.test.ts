import { test } from "node:test";
import assert = require("node:assert/strict");

import { CommandBus } from "../../src/core-kernel/commands/command-bus";
import type {
  EventSubscriptionResult,
  KernelEvent,
} from "../../src/core-kernel/events/contracts";
import {
  CORE_COMPILED_REGISTRATION_ENTRIES,
} from "../../src/core-kernel/registry/builtins";
import {
  createKernelRegistry,
  type KernelModuleGateway,
  type KernelModuleGatewayCreationResult,
  type KernelRegistry,
} from "../../src/core-kernel/registry/runtime";
import type {
  KernelReadState,
  ReadResult,
} from "../../src/core-kernel/read/contracts";
import {
  selectDirtyState,
  selectHistoryState,
  selectScoreEntity,
  selectScoreEntityOwnership,
  selectScoreMetadata,
  selectScoreRange,
} from "../../src/core-kernel/read/selectors";
import { cloneCoreScoreFixture } from "./fixtures/core-score";

function assertDeeplyFrozen(value: unknown): void {
  if (value === null || typeof value !== "object") {
    return;
  }
  assert.equal(Object.isFrozen(value), true);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
    if (descriptor !== undefined && "value" in descriptor) {
      assertDeeplyFrozen(descriptor.value);
    }
  }
}

function requireBus(): CommandBus {
  const created = CommandBus.create(cloneCoreScoreFixture());
  assert.equal(created.ok, true);
  if (!created.ok) {
    throw new Error("expected a valid CommandBus fixture");
  }
  return created.value;
}

function createManifest(
  includeUnprivileged: boolean,
  reversed: boolean,
  readerCapabilities: readonly string[] = ["score:read", "registry:read"],
): {
  startupManifestVersion: number;
  modules: Array<{
    moduleId: string;
    origin: string;
    runtime: string;
    trustLevel: string;
    apiVersion: number;
    capabilities: string[];
    registrationEntryIds: string[];
  }>;
} {
  const modules = [
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
      moduleId: "internal.reader",
      origin: "official",
      runtime: "internal-module",
      trustLevel: "system-trusted",
      apiVersion: 1,
      capabilities: [...readerCapabilities],
      registrationEntryIds: [],
    },
  ];
  if (includeUnprivileged) {
    modules.push({
      moduleId: "internal.none",
      origin: "official",
      runtime: "internal-module",
      trustLevel: "system-trusted",
      apiVersion: 1,
      capabilities: [],
      registrationEntryIds: [],
    });
  }
  if (reversed) {
    modules.reverse();
    for (const module of modules) {
      module.capabilities.reverse();
      module.registrationEntryIds.reverse();
    }
  }
  return { startupManifestVersion: 1, modules };
}

function requireRegistry(manifest: unknown): KernelRegistry {
  const created = createKernelRegistry(manifest);
  if (!created.ok) {
    throw new Error(`expected a valid Registry: ${created.failure.code}`);
  }
  assert.equal(created.ok, true);
  return created.registry;
}

function createGatewayDynamically(
  registry: KernelRegistry,
  moduleId: unknown,
  commandBus: unknown,
): KernelModuleGatewayCreationResult {
  const createGateway = registry.createGateway as unknown as (
    moduleId: unknown,
    commandBus: unknown,
  ) => KernelModuleGatewayCreationResult;
  return createGateway.call(registry, moduleId, commandBus);
}

type TestManifest = ReturnType<typeof createManifest>;

function addConsumerModule(
  manifest: TestManifest,
  moduleId: string,
  capabilities: string[],
): void {
  manifest.modules.push({
    moduleId,
    origin: "official",
    runtime: "internal-module",
    trustLevel: "system-trusted",
    apiVersion: 1,
    capabilities,
    registrationEntryIds: [],
  });
}

function createSelectorManifest(
  includeSelectorRegistration: boolean = true,
): TestManifest {
  const manifest = createManifest(false, false);
  const selectorOwner = manifest.modules.find(
    ({ moduleId }) => moduleId === "core.selectors",
  );
  if (selectorOwner === undefined) {
    throw new Error("expected core.selectors fixture module");
  }
  selectorOwner.registrationEntryIds = includeSelectorRegistration
    ? ["core.selectors.v1"]
    : [];
  addConsumerModule(manifest, "internal.selector-full", [
    "score:read",
    "selector:execute",
  ]);
  addConsumerModule(manifest, "internal.selector-execute-only", [
    "selector:execute",
  ]);
  addConsumerModule(manifest, "internal.selector-read-only", ["score:read"]);
  addConsumerModule(manifest, "internal.selector-none", []);
  return manifest;
}

function createCommandEventManifest(
  includeCommandRegistration: boolean = true,
): TestManifest {
  const manifest = createManifest(false, false);
  const commandOwner = manifest.modules.find(
    ({ moduleId }) => moduleId === "core.commands",
  );
  if (commandOwner === undefined) {
    throw new Error("expected core.commands fixture module");
  }
  commandOwner.registrationEntryIds = includeCommandRegistration
    ? ["core.commands.v1"]
    : [];
  addConsumerModule(manifest, "internal.command-full", ["command:execute"]);
  addConsumerModule(manifest, "internal.command-none", []);
  addConsumerModule(manifest, "internal.events", ["event:subscribe"]);
  addConsumerModule(manifest, "internal.events-none", []);
  return manifest;
}

function command(
  commandId: string,
  target: unknown,
  payload: unknown,
): unknown {
  return { commandVersion: 1, commandId, target, payload };
}

function setPitch(step: "C" | "D"): unknown {
  return command(
    "core.note.set-written-pitch",
    { kind: "note", noteId: "note-1" },
    { writtenPitch: { step, alter: 0, octave: 4 } },
  );
}

function setMetadata(title: string): unknown {
  return command(
    "core.document.set-metadata",
    { kind: "document", documentId: "score-1" },
    {
      metadata: {
        title,
        authors: ["Brilliant Guitar"],
        tempo: { bpm: 120 },
      },
    },
  );
}

function setNoteValue(base: 2 | 4): unknown {
  return command(
    "core.event.set-note-value",
    { kind: "event", eventId: "event-1" },
    { noteValue: { base, dots: 0 } },
  );
}

function requireSubscription(
  result: EventSubscriptionResult,
): () => void {
  if (result.status !== "subscribed") {
    throw new Error(`expected subscription: ${result.failure.code}`);
  }
  return result.unsubscribe;
}

function collectEvents(bus: CommandBus): KernelEvent[] {
  const events: KernelEvent[] = [];
  requireSubscription(bus.subscribe((event: KernelEvent) => events.push(event)));
  return events;
}

function requireReadState(bus: CommandBus): KernelReadState {
  const read = bus.read();
  if (!read.ok) {
    throw new Error(`expected a valid read state: ${read.failure.code}`);
  }
  return read.value;
}

function requireGateway(
  registry: KernelRegistry,
  moduleId: string,
  commandBus: CommandBus,
): KernelModuleGateway {
  const created = registry.createGateway(moduleId, commandBus);
  if (!created.ok) {
    throw new Error(`expected a valid gateway: ${created.failure.code}`);
  }
  assert.equal(created.ok, true);
  return created.gateway;
}

function expectedContributionSummaries(): readonly unknown[] {
  return CORE_COMPILED_REGISTRATION_ENTRIES.flatMap((entry) =>
    entry.contributions.map(({ descriptor }) => descriptor),
  ).sort((left, right) => {
    const kind = left.kind < right.kind ? -1 : left.kind > right.kind ? 1 : 0;
    return kind !== 0
      ? kind
      : left.id < right.id
        ? -1
        : left.id > right.id
          ? 1
          : 0;
  });
}

test("equivalent startup order preserves summary and representative gateway dispatch", () => {
  const dispatchCapabilities = [
    "command:execute",
    "registry:read",
    "score:read",
    "selector:execute",
  ];
  const forward = requireRegistry(
    createManifest(false, false, dispatchCapabilities),
  );
  const reversedManifest = createManifest(false, true, dispatchCapabilities);
  const reversed = requireRegistry(reversedManifest);
  reversedManifest.modules[0]!.moduleId = "tampered.after.startup";

  const forwardBus = requireBus();
  const reversedBus = requireBus();
  const forwardEvents = collectEvents(forwardBus);
  const reversedEvents = collectEvents(reversedBus);
  const forwardGateway = requireGateway(forward, "internal.reader", forwardBus);
  const reversedGateway = requireGateway(
    reversed,
    "internal.reader",
    reversedBus,
  );
  const first = forwardGateway.summary();
  const second = reversedGateway.summary();
  const repeated = forwardGateway.summary();

  const forwardSubmit = forwardGateway.submit(setPitch("D"));
  const reversedSubmit = reversedGateway.submit(setPitch("D"));
  assert.equal(forwardSubmit.status, "authorized");
  assert.equal(reversedSubmit.status, "authorized");
  assert.deepEqual(forwardSubmit, reversedSubmit);
  const forwardState = requireReadState(forwardBus);
  const reversedState = requireReadState(reversedBus);
  assert.deepEqual(
    forwardState.snapshot.document,
    reversedState.snapshot.document,
  );
  assert.equal(
    forwardState.snapshot.documentVersion,
    reversedState.snapshot.documentVersion,
  );
  assert.deepEqual(forwardState.history, reversedState.history);
  assert.equal(forwardState.dirty, reversedState.dirty);
  assert.deepEqual(forwardEvents, reversedEvents);

  const selectorRequest = {
    selectorId: "core.selector.score-metadata",
  } as const;
  const forwardSelection = forwardGateway.select(selectorRequest);
  const reversedSelection = reversedGateway.select(selectorRequest);
  assert.equal(forwardSelection.status, "authorized");
  assert.equal(reversedSelection.status, "authorized");
  assert.deepEqual(forwardSelection, reversedSelection);

  assert.equal(first.status, "authorized");
  assert.equal(second.status, "authorized");
  assert.equal(repeated.status, "authorized");
  if (
    first.status !== "authorized" ||
    second.status !== "authorized" ||
    repeated.status !== "authorized"
  ) {
    return;
  }

  assert.deepEqual(first.value, second.value);
  assert.deepEqual(repeated.value, first.value);
  assert.notEqual(repeated.value, first.value);
  assert.notEqual(repeated.value.modules, first.value.modules);
  assert.notEqual(repeated.value.contributions, first.value.contributions);
  assert.deepEqual(first.value.modules, [
    { moduleId: "core.commands", apiVersion: 1 },
    { moduleId: "core.selectors", apiVersion: 1 },
    { moduleId: "internal.reader", apiVersion: 1 },
  ]);
  assert.equal(first.value.contributions.length, 16);
  assert.deepEqual(first.value.contributions, expectedContributionSummaries());
  assertDeeplyFrozen(first.value);
  assertDeeplyFrozen(repeated.value);

  const serialized = JSON.stringify(first.value);
  for (const forbidden of [
    "handler",
    "origin",
    "runtime",
    "trustLevel",
    "capabilities",
    "registryVersion",
  ]) {
    assert.equal(serialized.includes(forbidden), false);
  }

  assert.equal(
    Reflect.set(
      first.value.modules[0] as unknown as Record<string, unknown>,
      "moduleId",
      "tampered",
    ),
    false,
  );
  assert.equal(
    Reflect.set(
      first.value.contributions as unknown as Record<string, unknown>,
      "0",
      null,
    ),
    false,
  );
  assert.deepEqual(forwardGateway.summary(), repeated);
});

test("gateway creation and summary enforce exact module and registry capability", () => {
  const registry = requireRegistry(createManifest(true, false));
  const bus = requireBus();

  assert.deepEqual(
    registry.createGateway("internal.missing", bus),
    {
      ok: false,
      failure: {
        code: "registry.module-not-found",
        moduleId: "internal.missing",
      },
    },
  );
  assert.deepEqual(registry.createGateway("../unsafe", bus), {
    ok: false,
    failure: { code: "registry.invalid-invocation" },
  });
  assert.deepEqual(
    createGatewayDynamically(registry, "internal.reader", {}),
    { ok: false, failure: { code: "registry.invalid-invocation" } },
  );

  const unprivileged = requireGateway(registry, "internal.none", bus);
  assert.equal(Object.isFrozen(unprivileged), true);
  assert.deepEqual(unprivileged.summary(), {
    status: "rejected",
    failure: {
      code: "registry.capability-denied",
      moduleId: "internal.none",
      capability: "registry:read",
    },
  });
});

test("gateway read authorizes independently and preserves the accepted ReadResult", () => {
  const registry = requireRegistry(createManifest(true, false));
  const directBus = requireBus();
  const gatewayBus = requireBus();
  const reader = requireGateway(registry, "internal.reader", gatewayBus);
  const unprivileged = requireGateway(registry, "internal.none", gatewayBus);

  const direct = directBus.read();
  assert.deepEqual(reader.read(), {
    status: "authorized",
    value: direct,
  });
  assert.deepEqual(unprivileged.read(), {
    status: "rejected",
    failure: {
      code: "registry.capability-denied",
      moduleId: "internal.none",
      capability: "score:read",
    },
  });

  const throwingBus = requireBus();
  Object.defineProperty(throwingBus, "read", {
    enumerable: false,
    configurable: true,
    value(): never {
      throw new Error("raw bus error must not escape");
    },
  });
  const throwingGateway = requireGateway(
    registry,
    "internal.reader",
    throwingBus,
  );
  assert.deepEqual(throwingGateway.read(), {
    status: "rejected",
    failure: { code: "registry.internal-error" },
  });
});

test("selector dispatch checks both capabilities before decoding input", () => {
  const registry = requireRegistry(createSelectorManifest());
  const bus = requireBus();
  const full = requireGateway(registry, "internal.selector-full", bus);
  const executeOnly = requireGateway(
    registry,
    "internal.selector-execute-only",
    bus,
  );
  const readOnly = requireGateway(
    registry,
    "internal.selector-read-only",
    bus,
  );
  const none = requireGateway(registry, "internal.selector-none", bus);
  let getterCalls = 0;
  const poisonedRequest = {};
  Object.defineProperty(poisonedRequest, "selectorId", {
    enumerable: true,
    get(): never {
      getterCalls += 1;
      throw new Error("selector input getter must not execute");
    },
  });

  assert.deepEqual(executeOnly.select(poisonedRequest), {
    status: "rejected",
    failure: {
      code: "registry.capability-denied",
      moduleId: "internal.selector-execute-only",
      capability: "score:read",
    },
  });
  assert.deepEqual(readOnly.select(poisonedRequest), {
    status: "rejected",
    failure: {
      code: "registry.capability-denied",
      moduleId: "internal.selector-read-only",
      capability: "selector:execute",
    },
  });
  assert.deepEqual(none.select(poisonedRequest), {
    status: "rejected",
    failure: {
      code: "registry.capability-denied",
      moduleId: "internal.selector-none",
      capability: "score:read",
    },
  });
  assert.equal(getterCalls, 0);
  assert.deepEqual(full.select(poisonedRequest), {
    status: "rejected",
    failure: { code: "registry.invalid-invocation" },
  });
  assert.equal(getterCalls, 0);
});

test("authorized selector dispatch matches all six direct selectors", () => {
  const registry = requireRegistry(createSelectorManifest());
  const directBus = requireBus();
  const gatewayBus = requireBus();
  const directState = requireReadState(directBus);
  const originalRead = gatewayBus.read.bind(gatewayBus);
  let gatewayReadCalls = 0;
  Object.defineProperty(gatewayBus, "read", {
    configurable: true,
    value(): ReadResult<KernelReadState> {
      gatewayReadCalls += 1;
      return originalRead();
    },
  });
  const gateway = requireGateway(
    registry,
    "internal.selector-full",
    gatewayBus,
  );
  const noteAddress = { kind: "note", noteId: "note-1" } as const;
  const measureRange = {
    kind: "measure-range",
    start: { kind: "measure", measureId: "measure-1" },
    end: { kind: "measure", measureId: "measure-1" },
  } as const;

  assert.deepEqual(
    gateway.select({
      selectorId: "core.selector.score-metadata",
    }),
    {
      status: "authorized",
      value: selectScoreMetadata(directState.snapshot),
    },
  );
  assert.deepEqual(
    gateway.select({
      selectorId: "core.selector.score-entity",
      address: noteAddress,
    }),
    {
      status: "authorized",
      value: selectScoreEntity(directState.snapshot, noteAddress),
    },
  );
  assert.deepEqual(
    gateway.select({
      selectorId: "core.selector.score-entity-ownership",
      address: noteAddress,
    }),
    {
      status: "authorized",
      value: selectScoreEntityOwnership(directState.snapshot, noteAddress),
    },
  );
  assert.deepEqual(
    gateway.select({
      selectorId: "core.selector.score-range",
      range: measureRange,
    }),
    {
      status: "authorized",
      value: selectScoreRange(directState.snapshot, measureRange),
    },
  );
  assert.deepEqual(
    gateway.select({
      selectorId: "core.selector.history-state",
    }),
    {
      status: "authorized",
      value: selectHistoryState(directState),
    },
  );
  assert.deepEqual(
    gateway.select({
      selectorId: "core.selector.dirty-state",
    }),
    {
      status: "authorized",
      value: selectDirtyState(directState),
    },
  );
  assert.equal(gatewayReadCalls, 6);
});

test("selector requests are exact and require a registered selector contribution", () => {
  const registered = requireRegistry(createSelectorManifest());
  const registeredGateway = requireGateway(
    registered,
    "internal.selector-full",
    requireBus(),
  );
  const invalidRequests: readonly unknown[] = [
    undefined,
    {},
    { selectorId: "core.selector.score-entity" },
    { selectorId: "core.selector.score-metadata", extra: true },
    { selectorId: "core.selector.missing" },
    { selectorId: "core.document.set-metadata" },
    new Proxy(
      {},
      {
        ownKeys(): never {
          throw new Error("proxy failure must not escape");
        },
      },
    ),
  ];
  for (const request of invalidRequests) {
    assert.deepEqual(registeredGateway.select(request), {
      status: "rejected",
      failure: { code: "registry.invalid-invocation" },
    });
  }

  const missing = requireRegistry(createSelectorManifest(false));
  const missingGateway = requireGateway(
    missing,
    "internal.selector-full",
    requireBus(),
  );
  assert.deepEqual(
    missingGateway.select({
      selectorId: "core.selector.score-metadata",
    }),
    {
      status: "rejected",
      failure: {
        code: "registry.contribution-not-found",
        contributionId: "core.selector.score-metadata",
      },
    },
  );
});

test("selector dispatch preserves read failures and contains read exceptions", () => {
  const registry = requireRegistry(createSelectorManifest());
  const readFailure: ReadResult<KernelReadState> = {
    ok: false,
    failure: { code: "read.invalid-snapshot" },
  };
  const failingBus = requireBus();
  let failingReadCalls = 0;
  Object.defineProperty(failingBus, "read", {
    configurable: true,
    value(): ReadResult<KernelReadState> {
      failingReadCalls += 1;
      return readFailure;
    },
  });
  const failingGateway = requireGateway(
    registry,
    "internal.selector-full",
    failingBus,
  );
  const failed = failingGateway.select({
    selectorId: "core.selector.score-metadata",
  });
  assert.equal(failed.status, "authorized");
  if (failed.status === "authorized") {
    assert.equal(failed.value, readFailure);
  }
  assert.equal(failingReadCalls, 1);

  const throwingBus = requireBus();
  let throwingReadCalls = 0;
  Object.defineProperty(throwingBus, "read", {
    configurable: true,
    value(): never {
      throwingReadCalls += 1;
      throw new Error("raw selector read error must not escape");
    },
  });
  const throwingGateway = requireGateway(
    registry,
    "internal.selector-full",
    throwingBus,
  );
  assert.deepEqual(
    throwingGateway.select({
      selectorId: "core.selector.score-metadata",
    }),
    {
      status: "rejected",
      failure: { code: "registry.internal-error" },
    },
  );
  assert.equal(throwingReadCalls, 1);
});

test("authorized command gateway preserves direct results, state, and events", () => {
  const registry = requireRegistry(createCommandEventManifest());
  const cases: readonly (readonly [string, unknown])[] = [
    ["committed", setPitch("D")],
    ["no-op", setPitch("C")],
    ["semantic-rejected", setNoteValue(2)],
    ["malformed", { commandVersion: 1 }],
    [
      "unknown-id",
      command(
        "core.command.missing",
        { kind: "note", noteId: "note-1" },
        { writtenPitch: { step: "D", alter: 0, octave: 4 } },
      ),
    ],
  ];

  for (const [label, input] of cases) {
    const directBus = requireBus();
    const gatewayBus = requireBus();
    const directEvents = collectEvents(directBus);
    const gatewayEvents = collectEvents(gatewayBus);
    const gateway = requireGateway(
      registry,
      "internal.command-full",
      gatewayBus,
    );

    const direct = directBus.submit(input);
    const throughGateway = gateway.submit(input);
    assert.deepEqual(
      throughGateway,
      { status: "authorized", value: direct },
      label,
    );
    assert.deepEqual(
      requireReadState(gatewayBus),
      requireReadState(directBus),
      label,
    );
    assert.deepEqual(gatewayEvents, directEvents, label);
  }
});

test("command authorization and registered contribution checks precede mutation", () => {
  const registry = requireRegistry(createCommandEventManifest());
  const deniedBus = requireBus();
  const deniedEvents = collectEvents(deniedBus);
  const denied = requireGateway(
    registry,
    "internal.command-none",
    deniedBus,
  );
  const before = requireReadState(deniedBus);
  let ownKeyReads = 0;
  const poisonedInput = new Proxy(
    {},
    {
      ownKeys(): never {
        ownKeyReads += 1;
        throw new Error("denied command input must not be decoded");
      },
    },
  );
  const deniedFailure = {
    status: "rejected",
    failure: {
      code: "registry.capability-denied",
      moduleId: "internal.command-none",
      capability: "command:execute",
    },
  };

  assert.deepEqual(denied.submit(poisonedInput), deniedFailure);
  assert.deepEqual(denied.undo(), deniedFailure);
  assert.deepEqual(denied.redo(), deniedFailure);
  assert.equal(ownKeyReads, 0);
  assert.deepEqual(requireReadState(deniedBus), before);
  assert.deepEqual(deniedEvents, []);

  const missingRegistry = requireRegistry(createCommandEventManifest(false));
  const missingBus = requireBus();
  const missingEvents = collectEvents(missingBus);
  const missing = requireGateway(
    missingRegistry,
    "internal.command-full",
    missingBus,
  );
  const missingBefore = requireReadState(missingBus);

  assert.deepEqual(missing.submit(setPitch("D")), {
    status: "rejected",
    failure: {
      code: "registry.contribution-not-found",
      contributionId: "core.note.set-written-pitch",
    },
  });
  assert.deepEqual(requireReadState(missingBus), missingBefore);
  assert.deepEqual(missingEvents, []);

  const malformed = missing.submit({ commandVersion: 1 });
  assert.equal(malformed.status, "authorized");
  assert.equal(malformed.value?.status, "rejected");
  if (malformed.value?.status === "rejected") {
    assert.deepEqual(malformed.value.failure, {
      code: "command.invalid-envelope",
    });
  }
  const unknown = missing.submit(
    command("core.command.missing", { kind: "note", noteId: "note-1" }, {}),
  );
  assert.equal(unknown.status, "authorized");
  assert.equal(unknown.value?.status, "rejected");
  if (unknown.value?.status === "rejected") {
    assert.deepEqual(unknown.value.failure, { code: "command.unknown-id" });
  }
  assert.deepEqual(requireReadState(missingBus), missingBefore);
  assert.deepEqual(missingEvents, []);
});

test("gateway undo and redo remain deeply equal to trusted host history", () => {
  const registry = requireRegistry(createCommandEventManifest());
  const directBus = requireBus();
  const gatewayBus = requireBus();
  const directEvents = collectEvents(directBus);
  const gatewayEvents = collectEvents(gatewayBus);
  const gateway = requireGateway(
    registry,
    "internal.command-full",
    gatewayBus,
  );

  const directSubmit = directBus.submit(setPitch("D"));
  assert.deepEqual(gateway.submit(setPitch("D")), {
    status: "authorized",
    value: directSubmit,
  });

  const directUndo = directBus.undo();
  assert.deepEqual(gateway.undo(), {
    status: "authorized",
    value: directUndo,
  });
  assert.deepEqual(requireReadState(gatewayBus), requireReadState(directBus));

  const directRedo = directBus.redo();
  assert.deepEqual(gateway.redo(), {
    status: "authorized",
    value: directRedo,
  });
  assert.deepEqual(requireReadState(gatewayBus), requireReadState(directBus));
  assert.deepEqual(gatewayEvents, directEvents);
  assert.equal(JSON.stringify(gatewayEvents).includes("moduleId"), false);
});

test("event gateway independently preserves validation, order, and unsubscribe", () => {
  const registry = requireRegistry(createCommandEventManifest());
  const bus = requireBus();
  const authorized = requireGateway(registry, "internal.events", bus);
  const denied = requireGateway(registry, "internal.events-none", bus);

  assert.deepEqual(denied.subscribe(null), {
    status: "rejected",
    failure: {
      code: "registry.capability-denied",
      moduleId: "internal.events-none",
      capability: "event:subscribe",
    },
  });
  assert.deepEqual(authorized.subscribe(null), {
    status: "authorized",
    value: {
      status: "rejected",
      failure: { code: "event.invalid-handler" },
    },
  });

  assert.equal(bus.submit(setMetadata("Seed dirty")).status, "committed");
  const calls: string[] = [];
  const first = authorized.subscribe(() => calls.push("first"));
  const second = authorized.subscribe(() => calls.push("second"));
  assert.equal(first.status, "authorized");
  assert.equal(second.status, "authorized");
  if (first.status !== "authorized" || second.status !== "authorized") {
    return;
  }
  const unsubscribeFirst = requireSubscription(first.value);
  const unsubscribeSecond = requireSubscription(second.value);

  assert.equal(bus.submit(setPitch("D")).status, "committed");
  assert.deepEqual(calls, ["first", "second"]);
  unsubscribeFirst();
  unsubscribeFirst();
  assert.equal(bus.submit(setMetadata("Next")).status, "committed");
  assert.deepEqual(calls, ["first", "second", "second"]);
  unsubscribeSecond();
});

test("event gateway retains synchronous, Promise, and thenable isolation", async () => {
  const registry = requireRegistry(createCommandEventManifest());
  const bus = requireBus();
  assert.equal(bus.submit(setMetadata("Seed async dirty")).status, "committed");
  const gateway = requireGateway(registry, "internal.events", bus);
  const calls: string[] = [];
  const unhandledRejections: unknown[] = [];
  let thenableObserved = false;
  const onUnhandledRejection = (reason: unknown) => {
    unhandledRejections.push(reason);
  };
  process.on("unhandledRejection", onUnhandledRejection);

  try {
    const handlers: readonly (() => unknown)[] = [
      () => {
        calls.push("sync-throw");
        throw new Error("sync gateway subscriber must stay isolated");
      },
      async () => {
        calls.push("async-throw");
        throw new Error("async gateway subscriber must stay isolated");
      },
      () => {
        calls.push("promise-reject");
        return Promise.reject(
          new Error("gateway subscriber rejection must stay isolated"),
        );
      },
      () => {
        calls.push("thenable");
        return {
          then(
            _resolve: (value: unknown) => void,
            reject: (reason: unknown) => void,
          ): void {
            thenableObserved = true;
            reject(new Error("gateway thenable must stay isolated"));
          },
        };
      },
      () => {
        calls.push("later");
      },
    ];
    for (const handler of handlers) {
      const subscribed = gateway.subscribe(handler);
      assert.equal(subscribed.status, "authorized");
      if (subscribed.status === "authorized") {
        requireSubscription(subscribed.value);
      }
    }

    assert.equal(bus.submit(setPitch("D")).status, "committed");
    assert.deepEqual(calls, [
      "sync-throw",
      "async-throw",
      "promise-reject",
      "thenable",
      "later",
    ]);
    assert.equal(requireReadState(bus).snapshot.documentVersion, 2);

    await new Promise<void>((resolve) => setImmediate(resolve));

    assert.equal(thenableObserved, true);
    assert.deepEqual(unhandledRejections, []);
    assert.equal(requireReadState(bus).snapshot.documentVersion, 2);
  } finally {
    process.removeListener("unhandledRejection", onUnhandledRejection);
  }
});

test("command and subscription gateway exceptions collapse to Registry failures", () => {
  const registry = requireRegistry(createCommandEventManifest());

  for (const [method, invoke] of [
    [
      "submit",
      (gateway: KernelModuleGateway) => gateway.submit(setPitch("D")),
    ],
    ["undo", (gateway: KernelModuleGateway) => gateway.undo()],
    ["redo", (gateway: KernelModuleGateway) => gateway.redo()],
  ] as const) {
    const bus = requireBus();
    Object.defineProperty(bus, method, {
      configurable: true,
      value(): never {
        throw new Error("raw CommandBus failure must not escape");
      },
    });
    const gateway = requireGateway(registry, "internal.command-full", bus);
    assert.deepEqual(invoke(gateway), {
      status: "rejected",
      failure: { code: "registry.internal-error" },
    });
  }

  const eventBus = requireBus();
  Object.defineProperty(eventBus, "subscribe", {
    configurable: true,
    value(): never {
      throw new Error("raw subscription failure must not escape");
    },
  });
  const eventGateway = requireGateway(registry, "internal.events", eventBus);
  assert.deepEqual(eventGateway.subscribe(() => {}), {
    status: "rejected",
    failure: { code: "registry.internal-error" },
  });
});
