import assert = require("node:assert/strict");
import vm = require("node:vm");
import { test } from "node:test";

import {
  STRICT_INPUT_MAX_DEPTH,
  STRICT_INPUT_MAX_PROPERTIES,
  captureStrictInput,
  type CaptureStrictInputResult,
} from "../../src/core-kernel/codec/strict-input-capture";

function requireCaptured(result: CaptureStrictInputResult): unknown {
  assert.equal(result.status, "captured");
  if (result.status !== "captured") {
    assert.fail("expected captured strict input");
  }
  return result.value;
}

function assertDeeplyFrozen(value: unknown, seen = new WeakSet<object>()): void {
  if (value === null || typeof value !== "object" || seen.has(value)) {
    return;
  }
  seen.add(value);
  assert.equal(Object.isFrozen(value), true);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
    if (descriptor !== undefined && "value" in descriptor) {
      assertDeeplyFrozen(descriptor.value, seen);
    }
  }
}

function nestedValue(depth: number): unknown {
  let value: unknown = null;
  for (let index = 0; index < depth; index += 1) {
    value = { value };
  }
  return value;
}

test("bounded strict capture detaches plain/null records and cross-Realm dense arrays", () => {
  const nullRecord = Object.create(null) as Record<string, unknown>;
  Object.defineProperty(nullRecord, "retained", {
    value: { value: true },
    enumerable: true,
    configurable: true,
    writable: true,
  });
  const foreignArray = vm.runInNewContext("[1, true, null]") as unknown;
  const input = {
    ordinary: { label: "input" },
    nullRecord,
    foreignArray,
  };

  const captured = requireCaptured(captureStrictInput(input)) as Record<
    string,
    unknown
  >;
  assert.notEqual(captured, input);
  const ordinary = captured.ordinary as Record<string, unknown>;
  const capturedNullRecord = captured.nullRecord as Record<string, unknown>;
  assert.equal(ordinary.label, "input");
  assert.equal(
    (capturedNullRecord.retained as Record<string, unknown>).value,
    true,
  );
  assert.deepEqual(captured.foreignArray, [1, true, null]);
  assert.equal(Object.getPrototypeOf(captured), null);
  assert.equal(Object.getPrototypeOf(ordinary), null);
  assert.equal(Object.getPrototypeOf(capturedNullRecord), null);
  assertDeeplyFrozen(captured);

  (input.ordinary as { label: string }).label = "mutated";
  assert.equal(ordinary.label, "input");
});

test("bounded strict capture rejects hostile shapes without property reads", () => {
  let getterCalls = 0;
  const accessor = {};
  Object.defineProperty(accessor, "blocked", {
    enumerable: true,
    get() {
      getterCalls += 1;
      return "unexpected";
    },
  });
  assert.deepEqual(captureStrictInput(accessor), {
    status: "invalid",
    diagnostic: {
      code: "decode.unreadable-input",
      messageKey: "core.decode.unreadable-input",
      path: ["blocked"],
    },
  });
  assert.equal(getterCalls, 0);

  const symbolRecord = { valid: true } as Record<PropertyKey, unknown>;
  symbolRecord[Symbol("private")] = "blocked";
  assert.deepEqual(captureStrictInput(symbolRecord), {
    status: "invalid",
    diagnostic: {
      code: "decode.json-value",
      messageKey: "core.decode.json-value",
      path: [],
      details: { reason: "symbol-key" },
    },
  });

  const sparse = new Array<unknown>(2);
  sparse[0] = "only-first";
  assert.deepEqual(captureStrictInput(sparse), {
    status: "invalid",
    diagnostic: {
      code: "decode.json-value",
      messageKey: "core.decode.json-value",
      path: [],
      details: { reason: "sparse-array" },
    },
  });

  const cycle: { self?: unknown } = {};
  cycle.self = cycle;
  assert.deepEqual(captureStrictInput(cycle), {
    status: "invalid",
    diagnostic: {
      code: "decode.json-value",
      messageKey: "core.decode.json-value",
      path: ["self"],
      details: { reason: "cycle" },
    },
  });

  const throwingProxy = new Proxy(
    {},
    {
      ownKeys() {
        throw new Error("private reflection failure");
      },
    },
  );
  assert.deepEqual(captureStrictInput(throwingProxy), {
    status: "invalid",
    diagnostic: {
      code: "decode.unreadable-input",
      messageKey: "core.decode.unreadable-input",
      path: [],
    },
  });
  assert.deepEqual(captureStrictInput({ value: Number.POSITIVE_INFINITY }), {
    status: "invalid",
    diagnostic: {
      code: "decode.non-finite-number",
      messageKey: "core.decode.non-finite-number",
      path: ["value"],
    },
  });
});

test("bounded strict capture accepts shared DAGs and never invokes a Proxy get trap", () => {
  const shared = { leaf: [1, 2, 3] };
  const input = { left: shared, right: shared };
  const captured = requireCaptured(captureStrictInput(input)) as Record<
    string,
    Record<string, unknown>
  >;
  assert.equal(captured.left, captured.right);
  assert.notEqual(captured.left, shared);
  assertDeeplyFrozen(captured);

  let getCalls = 0;
  const proxied = new Proxy(
    { nested: { accepted: true } },
    {
      get(target, key, receiver) {
        getCalls += 1;
        return Reflect.get(target, key, receiver);
      },
    },
  );
  const capturedProxy = requireCaptured(captureStrictInput(proxied)) as Record<
    string,
    Record<string, unknown>
  >;
  assert.equal(capturedProxy.nested?.accepted, true);
  assert.equal(getCalls, 0);
});

test("bounded strict capture uses captured primordials instead of poisoned methods", () => {
  const pushDescriptor = Object.getOwnPropertyDescriptor(Array.prototype, "push");
  const safeIntegerDescriptor = Object.getOwnPropertyDescriptor(
    Number,
    "isSafeInteger",
  );
  const setAddDescriptor = Object.getOwnPropertyDescriptor(Set.prototype, "add");
  let result: CaptureStrictInputResult | undefined;
  try {
    Object.defineProperty(Array.prototype, "push", {
      value: () => {
        throw new Error("poisoned push");
      },
      configurable: true,
      writable: true,
    });
    Object.defineProperty(Number, "isSafeInteger", {
      value: () => false,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(Set.prototype, "add", {
      value: () => {
        throw new Error("poisoned add");
      },
      configurable: true,
      writable: true,
    });
    result = captureStrictInput({ nested: [1, 2, 3] });
  } finally {
    if (pushDescriptor !== undefined) {
      Object.defineProperty(Array.prototype, "push", pushDescriptor);
    }
    if (safeIntegerDescriptor !== undefined) {
      Object.defineProperty(Number, "isSafeInteger", safeIntegerDescriptor);
    }
    if (setAddDescriptor !== undefined) {
      Object.defineProperty(Set.prototype, "add", setAddDescriptor);
    }
  }

  const captured = requireCaptured(result!) as Record<string, unknown>;
  assert.deepEqual(captured.nested, [1, 2, 3]);
});

test("bounded strict capture enforces exact depth and property limits", () => {
  assert.equal(STRICT_INPUT_MAX_DEPTH, 64);
  assert.equal(STRICT_INPUT_MAX_PROPERTIES, 1_048_576);
  assert.equal(captureStrictInput(nestedValue(64)).status, "captured");
  assert.deepEqual(captureStrictInput(nestedValue(65)), {
    status: "resource-limit-exceeded",
    limitKind: "input-depth",
    limit: 64,
    actual: 65,
  });

  const atPropertyLimit = new Array<null>(STRICT_INPUT_MAX_PROPERTIES).fill(null);
  assert.equal(captureStrictInput(atPropertyLimit).status, "captured");
  const overPropertyLimit = new Array<null>(
    STRICT_INPUT_MAX_PROPERTIES + 1,
  ).fill(null);
  assert.deepEqual(captureStrictInput(overPropertyLimit), {
    status: "resource-limit-exceeded",
    limitKind: "input-properties",
    limit: 1_048_576,
    actual: 1_048_577,
  });
});
