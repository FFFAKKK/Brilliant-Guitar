import assert = require("node:assert/strict");
import { test } from "node:test";

import {
  STRICT_INPUT_MAX_PROPERTIES,
} from "../../src/core-kernel/codec/strict-input-capture";
import {
  collectEvents,
  commandEnvelope,
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

function nestedValue(depth: number): unknown {
  let value: unknown = null;
  for (let index = 0; index < depth; index += 1) {
    value = { value };
  }
  return value;
}

function assertInvalidAndUnchanged(
  bus: ReturnType<typeof requireBus>,
  input: unknown,
  before: unknown,
): void {
  const result = bus.submit(input);
  assert.equal(result.status, "rejected");
  assert.equal(
    result.status === "rejected" && result.failure.code,
    "command.invalid-envelope",
  );
  assert.deepEqual(readDocument(bus), before);
}

function allCvn4Commands(): readonly Record<string, unknown>[] {
  return [
    insertPartCommand({ kind: "start" }, createCvn4InsertedPart()),
    removePartCommand("cvn4-part-c"),
    movePartCommand("cvn4-part-c", { kind: "start" }),
    setPartNameCommand("cvn4-part-a", "Renamed"),
    setPartInstrumentCommand("cvn4-part-a", {
      name: "Violin",
      writtenToSounding: { diatonicSteps: 0, chromaticSemitones: 0 },
    }),
    insertStaffCommand("cvn4-part-a", { kind: "start" }, {
      id: "cvn4-strict-staff",
      lineCount: 5,
      defaultClef: { sign: "G", line: 2 },
    }),
    removeStaffCommand("cvn4-staff-a-2"),
    moveStaffCommand("cvn4-staff-a-2", { kind: "start" }),
    setStaffDefinitionCommand("cvn4-staff-a-2", 1, { sign: "C", line: 3 }),
    insertVoiceCommand(
      "cvn4-part-a",
      "cvn4-measure-1",
      { kind: "start" },
      createCvn4InsertedVoice("cvn4-strict-voice"),
    ),
    removeVoiceCommand("cvn4-voice-a-1-secondary"),
    moveVoiceCommand("cvn4-voice-a-1-secondary", { kind: "start" }),
    setVoiceDefaultStaffCommand("cvn4-voice-a-1-primary", "cvn4-staff-a-2"),
    setVoiceSequenceStartCommand("cvn4-voice-a-1-primary", {
      numerator: 1,
      denominator: 4,
    }),
    setEventStaffAssignmentCommand("cvn4-event-a-1-notes", {
      kind: "inherit-default",
    }),
  ];
}

test("all fifteen CVN-4 commands use the bounded descriptor-first input boundary", () => {
  for (const input of allCvn4Commands()) {
    const bus = requireBus(cloneCvn4ScoreFixture());
    const before = structuredClone(readDocument(bus));
    const withExtraPayload = {
      ...input,
      payload: { ...(input.payload as Record<string, unknown>), extra: true },
    };
    assertInvalidAndUnchanged(bus, withExtraPayload, before);
  }
});

function assertSynchronousReplacementCannotHideExtraPayload(
  installReplacement: () => () => void,
): void {
  const initial = cloneCvn4ScoreFixture();
  const bus = requireBus(initial);
  const events = collectEvents(bus);
  let trapCalls = 0;
  let replacementInstalled = false;
  let restoreReplacement = (): void => {};
  const command = new Proxy(
    {
      ...removeVoiceCommand("cvn4-voice-a-1-primary"),
      payload: { extra: true },
    },
    {
      ownKeys(target) {
        trapCalls += 1;
        if (!replacementInstalled) {
          restoreReplacement = installReplacement();
          replacementInstalled = true;
        }
        return Reflect.ownKeys(target);
      },
    },
  );

  const result = (() => {
    try {
      return bus.submit(command);
    } finally {
      restoreReplacement();
    }
  })();

  assert.equal(trapCalls > 0, true);
  assert.equal(result.status, "rejected");
  assert.equal(
    result.status === "rejected" && result.failure.code,
    "command.invalid-envelope",
  );
  assert.equal(result.documentVersion, 0);
  assert.equal(result.undoDepth, 0);
  assert.equal(result.redoDepth, 0);
  const read = bus.read();
  assert.equal(read.ok, true);
  if (read.ok) {
    assert.deepEqual(read.value.snapshot.document, initial);
    assert.equal(read.value.snapshot.documentVersion, 0);
    assert.deepEqual(read.value.history, { undoDepth: 0, redoDepth: 0 });
  }
  assert.deepEqual(events, []);
}

test("synchronous Object.keys replacement cannot hide an extra payload field", () => {
  const descriptor = Object.getOwnPropertyDescriptor(Object, "keys");
  if (descriptor === undefined || !("value" in descriptor)) {
    throw new Error("expected Object.keys to be a data property");
  }
  const originalObjectKeys = descriptor.value as typeof Object.keys;
  assertSynchronousReplacementCannotHideExtraPayload(() => {
    Object.defineProperty(Object, "keys", {
      ...descriptor,
      value: ((value: object) =>
        originalObjectKeys(value).filter((key) => key !== "extra")) as typeof Object.keys,
    });
    return () => Object.defineProperty(Object, "keys", descriptor);
  });
});

test("synchronous Array.filter replacement cannot hide an extra payload field", () => {
  const descriptor = Object.getOwnPropertyDescriptor(Array.prototype, "filter");
  if (descriptor === undefined || !("value" in descriptor)) {
    throw new Error("expected Array.prototype.filter to be a data property");
  }
  assertSynchronousReplacementCannotHideExtraPayload(() => {
    Object.defineProperty(Array.prototype, "filter", {
      ...descriptor,
      value: (() => []) as unknown as typeof Array.prototype.filter,
    });
    return () => Object.defineProperty(Array.prototype, "filter", descriptor);
  });
});

test("synchronous structuredClone replacement cannot alias a rejected candidate", () => {
  const initial = cloneCvn4ScoreFixture();
  const bus = requireBus(initial);
  const events = collectEvents(bus);
  const descriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "structuredClone",
  );
  if (descriptor === undefined || !("value" in descriptor)) {
    throw new Error("expected structuredClone to be a data property");
  }
  let trapCalls = 0;
  const command = new Proxy(
    setStaffDefinitionCommand("cvn4-staff-a-1", 0, { sign: "G", line: 2 }),
    {
      ownKeys(target) {
        trapCalls += 1;
        Object.defineProperty(globalThis, "structuredClone", {
          ...descriptor,
          value: ((value: unknown) => value) as typeof structuredClone,
        });
        return Reflect.ownKeys(target);
      },
    },
  );

  const result = (() => {
    try {
      return bus.submit(command);
    } finally {
      Object.defineProperty(globalThis, "structuredClone", descriptor);
    }
  })();

  assert.equal(trapCalls > 0, true);
  assert.equal(result.status, "rejected");
  assert.equal(
    result.status === "rejected" && result.failure.code,
    "command.semantic-invalid",
  );
  assert.equal(result.documentVersion, 0);
  assert.equal(result.undoDepth, 0);
  assert.equal(result.redoDepth, 0);
  const read = bus.read();
  assert.equal(read.ok, true);
  if (read.ok) {
    assert.deepEqual(read.value.snapshot.document, initial);
    assert.equal(read.value.snapshot.documentVersion, 0);
    assert.deepEqual(read.value.history, { undoDepth: 0, redoDepth: 0 });
  }
  assert.deepEqual(events, []);
});

test("all fifteen CVN-4 commands reject sparse, cyclic, symbol, and accessor inputs without caller execution", () => {
  for (const input of allCvn4Commands()) {
    const bus = requireBus(cloneCvn4ScoreFixture());
    const before = structuredClone(readDocument(bus));

    const sparse = new Array<unknown>(2);
    sparse[0] = null;
    assertInvalidAndUnchanged(bus, { ...input, payload: sparse }, before);

    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    assertInvalidAndUnchanged(bus, { ...input, payload: cyclic }, before);

    const symbolPayload: Record<PropertyKey, unknown> = {};
    symbolPayload[Symbol("cvn4-unreadable")] = true;
    assertInvalidAndUnchanged(bus, { ...input, payload: symbolPayload }, before);

    let getterCalls = 0;
    const accessorInput = { ...input };
    Object.defineProperty(accessorInput, "payload", {
      enumerable: true,
      configurable: true,
      get() {
        getterCalls += 1;
        return input.payload;
      },
    });
    assertInvalidAndUnchanged(bus, accessorInput, before);
    assert.equal(getterCalls, 0);
  }
});

test("CVN-4 bounded capture rejects accessors, cycles, depth, and property limits without caller execution", () => {
  const bus = requireBus(cloneCvn4ScoreFixture());
  const before = structuredClone(readDocument(bus));
  let getterRuns = 0;
  const payload = {} as Record<string, unknown>;
  Object.defineProperty(payload, "anchor", {
    enumerable: true,
    get: () => {
      getterRuns += 1;
      return { kind: "start" };
    },
  });
  Object.defineProperty(payload, "part", {
    enumerable: true,
    value: createCvn4InsertedPart("cvn4-accessor-part"),
  });
  assertInvalidAndUnchanged(
    bus,
    commandEnvelope(
      "core.part.insert",
      { kind: "document", documentId: "cvn4-score" },
      payload,
    ),
    before,
  );
  assert.equal(getterRuns, 0);

  const cyclic: Record<string, unknown> = {};
  cyclic.self = cyclic;
  assertInvalidAndUnchanged(
    bus,
    commandEnvelope(
      "core.part.insert",
      { kind: "document", documentId: "cvn4-score" },
      cyclic,
    ),
    before,
  );

  const withinDepth = bus.submit(
    commandEnvelope(
      "core.part.insert",
      { kind: "document", documentId: "cvn4-score" },
      nestedValue(63),
    ),
  );
  assert.equal(
    withinDepth.status === "rejected" && withinDepth.failure.code,
    "command.invalid-envelope",
  );
  const atPropertyLimit = bus.submit(
    commandEnvelope(
      "core.part.insert",
      { kind: "document", documentId: "cvn4-score" },
      {
        oversized: new Array<null>(STRICT_INPUT_MAX_PROPERTIES - 7).fill(null),
      },
    ),
  );
  assert.equal(
    atPropertyLimit.status === "rejected" && atPropertyLimit.failure.code,
    "command.invalid-envelope",
  );
  const overDepth = bus.submit(
    commandEnvelope(
      "core.part.insert",
      { kind: "document", documentId: "cvn4-score" },
      nestedValue(64),
    ),
  );
  assert.deepEqual(
    overDepth.status === "rejected" && overDepth.failure,
    {
      code: "command.resource-limit-exceeded",
      limitKind: "input-depth",
      limit: 64,
      actual: 65,
    },
  );

  const oversized = bus.submit(
    commandEnvelope(
      "core.part.insert",
      { kind: "document", documentId: "cvn4-score" },
      {
        oversized: new Array<null>(STRICT_INPUT_MAX_PROPERTIES - 6).fill(null),
      },
    ),
  );
  assert.deepEqual(oversized.status === "rejected" && oversized.failure, {
    code: "command.resource-limit-exceeded",
    limitKind: "input-properties",
    limit: STRICT_INPUT_MAX_PROPERTIES,
    actual: STRICT_INPUT_MAX_PROPERTIES + 1,
  });
  assert.deepEqual(readDocument(bus), before);
});
