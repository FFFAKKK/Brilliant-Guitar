import assert = require("node:assert/strict");
import { test } from "node:test";

import {
  CORE_KERNEL_STARTUP_MANIFEST,
  createKernelRegistry,
  mapCommandFailureToKernelIssues,
  type CommandBus,
  type KernelEvent,
  type KernelModuleGateway,
  type KernelReadState,
  type KernelStartupModuleManifest,
  type ScoreDocument,
} from "../../src/core-kernel/index";
import {
  STRICT_INPUT_MAX_PROPERTIES,
} from "../../src/core-kernel/codec/strict-input-capture";
import {
  assertSynchronizedMeasureOrders,
  collectEvents,
  commandEnvelope,
  insertMeasureCommand,
  moveMeasureCommand,
  readDocument,
  removeMeasureCommand,
  requireBus,
  setMeasureDefinitionCommand,
} from "./fixtures/cvn-3-command-helpers";
import {
  cloneCvn3MeasureFixture,
  createCvn3InsertedVoices,
} from "./fixtures/cvn-3-score";

interface MeasureCommandCase {
  readonly commandId: string;
  readonly create: () => Record<string, unknown>;
}

function lifecycleCases(): readonly MeasureCommandCase[] {
  return [
    {
      commandId: "core.measure.insert",
      create: () => {
        const measureId = "cvn3-transaction-insert";
        return insertMeasureCommand({
          anchor: { kind: "after-measure", measureId: "cvn3-measure-2" },
          definition: { id: measureId, meter: { numerator: 4, denominator: 4 } },
          contents: [
            {
              partId: "cvn3-part-a",
              voices: createCvn3InsertedVoices("cvn3-part-a", measureId),
            },
            {
              partId: "cvn3-part-b",
              voices: createCvn3InsertedVoices("cvn3-part-b", measureId),
            },
          ],
        });
      },
    },
    {
      commandId: "core.measure.remove",
      create: () => removeMeasureCommand("cvn3-measure-2"),
    },
    {
      commandId: "core.measure.move",
      create: () =>
        moveMeasureCommand("cvn3-measure-3", { kind: "start" }),
    },
    {
      commandId: "core.measure.set-definition",
      create: () =>
        setMeasureDefinitionCommand(
          "cvn3-measure-1",
          { numerator: 2, denominator: 2 },
          { kind: "none" },
        ),
    },
  ];
}

function requireReadState(bus: CommandBus): KernelReadState {
  const result = bus.read();
  if (!result.ok) {
    throw new Error(`expected CVN-3 read: ${result.failure.code}`);
  }
  assert.equal(result.ok, true);
  return result.value;
}

function requireAuthorized<T>(
  result:
    | { readonly status: "authorized"; readonly value: T }
    | { readonly status: "rejected"; readonly failure: unknown },
): T {
  assert.equal(result.status, "authorized");
  if (result.status !== "authorized") {
    throw new Error("expected authorized CVN-3 gateway result");
  }
  return result.value;
}

function createCvn3Manifest(): KernelStartupModuleManifest {
  return {
    startupManifestVersion: CORE_KERNEL_STARTUP_MANIFEST.startupManifestVersion,
    modules: [
      ...CORE_KERNEL_STARTUP_MANIFEST.modules.map((module) => ({
        ...module,
        capabilities: [...module.capabilities],
        registrationEntryIds: [...module.registrationEntryIds],
      })),
      {
        moduleId: "internal.cvn3-authorized",
        origin: "official",
        runtime: "internal-module",
        trustLevel: "system-trusted",
        apiVersion: 1,
        capabilities: ["command:execute", "event:subscribe"],
        registrationEntryIds: [],
      },
      {
        moduleId: "internal.cvn3-denied",
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
  const created = createKernelRegistry(createCvn3Manifest());
  if (!created.ok) {
    throw new Error(`expected CVN-3 Registry: ${created.failure.code}`);
  }
  assert.equal(created.ok, true);
  const authorized = created.registry.createGateway(
    "internal.cvn3-authorized",
    bus,
  );
  const denied = created.registry.createGateway("internal.cvn3-denied", bus);
  assert.equal(authorized.ok, true);
  assert.equal(denied.ok, true);
  if (!authorized.ok || !denied.ok) {
    throw new Error("expected CVN-3 Registry gateways");
  }
  return { bus, gateway: authorized.gateway, deniedGateway: denied.gateway };
}

function nestedValue(depth: number): unknown {
  let value: unknown = null;
  for (let index = 0; index < depth; index += 1) {
    value = { value };
  }
  return value;
}

function insertEnvelopeWithPayload(payload: unknown): Record<string, unknown> {
  return commandEnvelope(
    "core.measure.insert",
    { kind: "document", documentId: "cvn3-measure-score" },
    payload,
  );
}

function validInsertEnvelope(
  measureId = "cvn3-transaction-strict-input",
): Record<string, unknown> {
  return insertMeasureCommand({
    anchor: { kind: "after-measure", measureId: "cvn3-measure-1" },
    definition: { id: measureId, meter: { numerator: 4, denominator: 4 } },
    contents: [
      {
        partId: "cvn3-part-a",
        voices: createCvn3InsertedVoices("cvn3-part-a", measureId),
      },
      {
        partId: "cvn3-part-b",
        voices: createCvn3InsertedVoices("cvn3-part-b", measureId),
      },
    ],
  });
}

test("new Measure commands enforce bounded descriptor capture and map resource failures", () => {
  const bus = requireBus(cloneCvn3MeasureFixture());
  const before = structuredClone(readDocument(bus));

  const withinDepth = bus.submit(insertEnvelopeWithPayload(nestedValue(63)));
  assert.equal(withinDepth.status, "rejected");
  assert.equal(
    withinDepth.status === "rejected" && withinDepth.failure.code,
    "command.invalid-envelope",
  );

  const overDepth = bus.submit(insertEnvelopeWithPayload(nestedValue(64)));
  assert.equal(overDepth.status, "rejected");
  if (overDepth.status !== "rejected") {
    assert.fail("expected CVN-3 depth rejection");
  }
  assert.deepEqual(overDepth.failure, {
    code: "command.resource-limit-exceeded",
    limitKind: "input-depth",
    limit: 64,
    actual: 65,
  });
  assert.deepEqual(
    mapCommandFailureToKernelIssues(overDepth.failure).map(
      ({ code, details }) => ({ code, details }),
    ),
    [
      {
        code: "command.resource-limit-exceeded",
        details: { limitKind: "input-depth", limit: 64, actual: 65 },
      },
    ],
  );

  const oversized = insertEnvelopeWithPayload({
    oversized: new Array<null>(STRICT_INPUT_MAX_PROPERTIES - 6).fill(null),
  });
  const wrongVersion = bus.submit({ ...oversized, commandVersion: 2 });
  assert.equal(wrongVersion.status, "rejected");
  assert.equal(
    wrongVersion.status === "rejected" && wrongVersion.failure.code,
    "command.unsupported-version",
  );
  const unknownId = bus.submit({
    ...oversized,
    commandId: "core.measure.unknown",
  });
  assert.equal(unknownId.status, "rejected");
  assert.equal(
    unknownId.status === "rejected" && unknownId.failure.code,
    "command.unknown-id",
  );
  const wrongTarget = bus.submit({
    ...oversized,
    commandId: "core.measure.remove",
  });
  assert.equal(wrongTarget.status, "rejected");
  assert.equal(
    wrongTarget.status === "rejected" && wrongTarget.failure.code,
    "command.target-mismatch",
  );

  const overProperties = bus.submit(oversized);
  assert.equal(overProperties.status, "rejected");
  if (overProperties.status !== "rejected") {
    assert.fail("expected CVN-3 property rejection");
  }
  assert.deepEqual(overProperties.failure, {
    code: "command.resource-limit-exceeded",
    limitKind: "input-properties",
    limit: STRICT_INPUT_MAX_PROPERTIES,
    actual: STRICT_INPUT_MAX_PROPERTIES + 1,
  });
  assert.deepEqual(
    mapCommandFailureToKernelIssues(overProperties.failure).map(
      ({ code, details }) => ({ code, details }),
    ),
    [
      {
        code: "command.resource-limit-exceeded",
        details: {
          limitKind: "input-properties",
          limit: STRICT_INPUT_MAX_PROPERTIES,
          actual: STRICT_INPUT_MAX_PROPERTIES + 1,
        },
      },
    ],
  );
  assert.deepEqual(readDocument(bus), before);

  let rootGetCalls = 0;
  const proxied = new Proxy(validInsertEnvelope("cvn3-proxied-insert"), {
    get(target, key, receiver) {
      rootGetCalls += 1;
      return Reflect.get(target, key, receiver);
    },
  });
  const proxiedBus = requireBus(cloneCvn3MeasureFixture());
  assert.equal(proxiedBus.submit(proxied).status, "committed");
  assert.equal(rootGetCalls, 0);

  let targetGetCalls = 0;
  const nestedProxyInput = validInsertEnvelope("cvn3-nested-proxy-insert");
  const nestedTarget = nestedProxyInput.target as Record<string, unknown>;
  nestedProxyInput.target = new Proxy(nestedTarget, {
    get(target, key, receiver) {
      targetGetCalls += 1;
      return Reflect.get(target, key, receiver);
    },
  });
  assert.equal(
    requireBus(cloneCvn3MeasureFixture()).submit(nestedProxyInput).status,
    "committed",
  );
  assert.equal(targetGetCalls, 0);

  let getterCalls = 0;
  const accessorInput = validInsertEnvelope("cvn3-accessor-insert");
  const accessorPayload = accessorInput.payload as Record<string, unknown>;
  Object.defineProperty(accessorPayload, "anchor", {
    enumerable: true,
    configurable: true,
    get() {
      getterCalls += 1;
      return { kind: "start" };
    },
  });
  const accessorResult = requireBus(cloneCvn3MeasureFixture()).submit(
    accessorInput,
  );
  assert.equal(accessorResult.status, "rejected");
  assert.equal(
    accessorResult.status === "rejected" && accessorResult.failure.code,
    "command.invalid-envelope",
  );
  assert.equal(getterCalls, 0);
});

for (const entry of lifecycleCases()) {
  test(`direct bus and authorized gateway are equivalent for ${entry.commandId}`, () => {
    const directBus = requireBus(cloneCvn3MeasureFixture());
    const directEvents = collectEvents(directBus);
    const gatewayRuntime = requireGatewayRuntime(cloneCvn3MeasureFixture());
    const gatewayEvents: KernelEvent[] = [];
    const subscription = requireAuthorized(
      gatewayRuntime.gateway.subscribe((event: KernelEvent) => {
        gatewayEvents.push(event);
      }),
    );
    assert.equal(subscription.status, "subscribed");

    const directResult = directBus.submit(entry.create());
    const gatewayResult = requireAuthorized(
      gatewayRuntime.gateway.submit(entry.create()),
    );
    assert.equal(directResult.status, "committed");
    assert.deepEqual(gatewayResult, directResult);
    assert.deepEqual(readDocument(gatewayRuntime.bus), readDocument(directBus));
    assert.deepEqual(gatewayEvents, directEvents);
    assert.equal(directEvents.length, 2);
    assertSynchronizedMeasureOrders(readDocument(directBus));
  });
}

for (const entry of lifecycleCases()) {
  test(`${entry.commandId} rejects exact-input violations and detaches submitted input`, () => {
    const bus = requireBus(cloneCvn3MeasureFixture());
    const before = structuredClone(readDocument(bus));
    const malformed = entry.create();
    (malformed.payload as Record<string, unknown>).unexpected = true;
    const malformedResult = bus.submit(malformed);
    assert.equal(malformedResult.status, "rejected");
    assert.equal(
      malformedResult.status === "rejected" && malformedResult.failure.code,
      "command.invalid-envelope",
    );
    assert.deepEqual(readDocument(bus), before);

    const wrongTarget = entry.create();
    wrongTarget.target =
      entry.commandId === "core.measure.insert"
        ? { kind: "measure", measureId: "cvn3-measure-1" }
        : { kind: "document", documentId: "cvn3-measure-score" };
    const wrongTargetResult = bus.submit(wrongTarget);
    assert.equal(wrongTargetResult.status, "rejected");
    assert.equal(
      wrongTargetResult.status === "rejected" &&
        wrongTargetResult.failure.code,
      "command.target-mismatch",
    );
    assert.deepEqual(readDocument(bus), before);

    const acceptedInput = entry.create();
    assert.equal(bus.submit(acceptedInput).status, "committed");
    const after = structuredClone(readDocument(bus));
    (acceptedInput.target as Record<string, unknown>).kind = "caller-mutated";
    (acceptedInput.payload as Record<string, unknown>).unexpected =
      "caller-mutated";
    assert.deepEqual(readDocument(bus), after);
    assert.deepEqual(after.extensions, before.extensions);
  });
}

test("gateway capability denial occurs before a CVN-3 Measure mutation", () => {
  const runtime = requireGatewayRuntime(cloneCvn3MeasureFixture());
  const events = collectEvents(runtime.bus);
  const before = structuredClone(readDocument(runtime.bus));
  const denied = runtime.deniedGateway.submit(validInsertEnvelope("cvn3-denied"));
  assert.equal(denied.status, "rejected");
  if (denied.status !== "rejected") {
    assert.fail("expected CVN-3 capability denial");
  }
  assert.deepEqual(denied.failure, {
    code: "registry.capability-denied",
    moduleId: "internal.cvn3-denied",
    capability: "command:execute",
  });
  assert.deepEqual(readDocument(runtime.bus), before);
  assert.deepEqual(events, []);
});

for (const entry of lifecycleCases()) {
  test(`checkpoint, rejection, undo/redo, and branch clearing hold for ${entry.commandId}`, () => {
    const bus = requireBus(cloneCvn3MeasureFixture());
    const before = structuredClone(readDocument(bus));
    const committed = bus.submit(entry.create());
    assert.equal(committed.status, "committed");
    const after = structuredClone(readDocument(bus));
    assert.deepEqual(
      bus.markPersisted({
        documentId: "cvn3-measure-score",
        documentVersion: 1,
      }),
      { status: "updated", documentVersion: 1, dirty: false },
    );
    assert.equal(requireReadState(bus).dirty, false);

    assert.equal(bus.undo().status, "committed");
    assert.deepEqual(readDocument(bus), before);
    assert.equal(requireReadState(bus).dirty, true);
    assert.deepEqual(requireReadState(bus).history, {
      undoDepth: 0,
      redoDepth: 1,
    });

    const rejected = bus.submit({ commandVersion: 1 });
    assert.equal(rejected.status, "rejected");
    assert.equal(
      rejected.status === "rejected" && rejected.failure.code,
      "command.invalid-envelope",
    );
    assert.deepEqual(readDocument(bus), before);
    assert.deepEqual(requireReadState(bus).history, {
      undoDepth: 0,
      redoDepth: 1,
    });

    assert.equal(bus.redo().status, "committed");
    assert.deepEqual(readDocument(bus), after);
    assert.equal(requireReadState(bus).dirty, false);

    assert.equal(bus.undo().status, "committed");
    assert.equal(bus.submit(entry.create()).status, "committed");
    const emptiedRedo = bus.redo();
    assert.equal(emptiedRedo.status, "rejected");
    assert.equal(
      emptiedRedo.status === "rejected" && emptiedRedo.failure.code,
      "history.empty-redo",
    );
    assert.deepEqual(requireReadState(bus).history, {
      undoDepth: 1,
      redoDepth: 0,
    });
  });
}
