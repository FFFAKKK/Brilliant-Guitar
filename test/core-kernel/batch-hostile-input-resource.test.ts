import assert = require("node:assert/strict");
import { test } from "node:test";

import {
  CommandBus,
  type IntegratedKernelEvent,
  type IntegratedCommandBus,
  type KernelEvent,
} from "../../src/core-kernel/index";
import { STRICT_INPUT_MAX_PROPERTIES } from "../../src/core-kernel/codec/strict-input-capture";
import {
  appendBatchAffectedWithinBudget,
  checkBatchEffectBudget,
} from "../../src/core-kernel/commands/batch-runtime";
import { compileOfficialModuleCatalogV1 } from "../../src/core-kernel/module-sdk/index";
import { createCoreScoreFixture } from "./fixtures/core-score";
import {
  CVN6_MANIFEST,
  CVN6_REGISTRATION_ENTRIES,
  cvn6CallbackCounts,
  resetCvn6Callbacks,
} from "./fixtures/cvn-6-synthetic-official-modules";
import {
  CVN5_BATCH_MANIFEST,
  CVN5_BATCH_REGISTRATION_ENTRIES,
} from "./fixtures/cvn-5-batch-official-modules";

function guardedChildren(): {
  readonly values: readonly unknown[];
  readonly trapCalls: () => number;
} {
  let calls = 0;
  const child = new Proxy(
    {},
    {
      ownKeys() {
        calls += 1;
        throw new Error("over-limit batch must not inspect children");
      },
    },
  );
  return {
    values: Array.from({ length: 101 }, () => child),
    trapCalls: () => calls,
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

const noOpMetadataCommand = Object.freeze({
  commandVersion: 1,
  commandId: "core.document.set-metadata",
  target: Object.freeze({ kind: "document", documentId: "score-1" }),
  payload: Object.freeze({
    metadata: Object.freeze({
      title: "Core fixture",
      authors: Object.freeze(["Brilliant Guitar"]),
      tempo: Object.freeze({ bpm: 120 }),
    }),
  }),
});

function nestedValue(propertyCount: number): unknown {
  let value: unknown = null;
  for (let index = 0; index < propertyCount; index += 1) {
    value = { nested: value };
  }
  return value;
}

function assertCoreStateUnchanged(
  bus: CommandBus,
  before: ReturnType<CommandBus["read"]>,
  events: readonly KernelEvent[],
): void {
  assert.deepEqual(bus.read(), before);
  assert.deepEqual(events, []);
}

function resourceProbeBus(): IntegratedCommandBus {
  const compiled = compileOfficialModuleCatalogV1(
    CVN5_BATCH_MANIFEST,
    CVN5_BATCH_REGISTRATION_ENTRIES,
  );
  assert.equal(compiled.ok, true);
  if (!compiled.ok) {
    assert.fail("expected CVN-5 resource fixture catalog");
  }
  const created = CommandBus.createIntegrated(
    createCoreScoreFixture(),
    compiled.catalog,
  );
  assert.equal(created.ok, true);
  if (!created.ok) {
    assert.fail("expected CVN-5 resource fixture bus");
  }
  return created.value;
}

function resourceProbe(
  effectRequestCount: number,
  affectedAddressCount: number,
  missingEffectTarget: boolean,
): unknown {
  return {
    commandVersion: 1,
    commandId: "fixture.batch.resource-probe",
    target: { kind: "document", documentId: "score-1" },
    payload: {
      effectRequestCount,
      affectedAddressCount,
      missingEffectTarget,
    },
  };
}

test("101-child Core batch rejects before inspecting any child value", () => {
  const created = CommandBus.create(createCoreScoreFixture());
  assert.equal(created.ok, true);
  if (!created.ok) {
    assert.fail("expected Core bus");
  }
  const children = guardedChildren();
  const result = created.value.submit(batch(children.values));
  assert.equal(result.status, "rejected");
  if (result.status === "rejected") {
    assert.deepEqual(result.failure, {
      code: "command.resource-limit-exceeded",
      limitKind: "batch-children",
      limit: 100,
      actual: 101,
    });
  }
  assert.equal(children.trapCalls(), 0);
});

test("101-child integrated batch rejects before children and module callbacks", () => {
  const compiled = compileOfficialModuleCatalogV1(
    CVN6_MANIFEST,
    CVN6_REGISTRATION_ENTRIES,
  );
  assert.equal(compiled.ok, true);
  if (!compiled.ok) {
    assert.fail("expected integrated catalog");
  }
  const created = CommandBus.createIntegrated(
    createCoreScoreFixture(),
    compiled.catalog,
  );
  assert.equal(created.ok, true);
  if (!created.ok) {
    assert.fail("expected integrated bus");
  }
  const children = guardedChildren();
  resetCvn6Callbacks();
  const before = created.value.read();
  const result = created.value.submit(batch(children.values));
  assert.equal(result.status, "rejected");
  if (result.status === "rejected") {
    assert.equal(result.failure.code, "command.resource-limit-exceeded");
  }
  assert.equal(children.trapCalls(), 0);
  assert.deepEqual(cvn6CallbackCounts, {
    commandDecode: 0,
    commandPrepare: 0,
    validate: 0,
    classify: 0,
    effectDecode: 0,
    effectTransform: 0,
  });
  assert.deepEqual(created.value.read(), before);
});

test("the inclusive 100-child boundary is accepted as one all-no-op batch", () => {
  const created = CommandBus.create(createCoreScoreFixture());
  assert.equal(created.ok, true);
  if (!created.ok) {
    assert.fail("expected Core bus");
  }
  const result = created.value.submit(
    batch(Array.from({ length: 100 }, () => noOpMetadataCommand)),
  );
  assert.equal(result.status, "no-op");
  assert.equal(result.documentVersion, 0);
  assert.equal(result.undoDepth, 0);
  assert.equal(result.redoDepth, 0);
});

test("sparse arrays and accessor children reject without invoking getters", () => {
  const created = CommandBus.create(createCoreScoreFixture());
  assert.equal(created.ok, true);
  if (!created.ok) {
    assert.fail("expected Core bus");
  }
  const sparse: unknown[] = [];
  sparse.length = 2;
  sparse[0] = {};
  assert.equal(created.value.submit(batch(sparse)).status, "rejected");

  let getterCalls = 0;
  const accessor: unknown[] = [];
  Object.defineProperty(accessor, "0", {
    enumerable: true,
    configurable: true,
    get() {
      getterCalls += 1;
      return {};
    },
  });
  assert.equal(created.value.submit(batch(accessor)).status, "rejected");
  assert.equal(getterCalls, 0);
});

test("cyclic child input rejects atomically", () => {
  const created = CommandBus.create(createCoreScoreFixture());
  assert.equal(created.ok, true);
  if (!created.ok) {
    assert.fail("expected Core bus");
  }
  const bus = created.value;
  const events: KernelEvent[] = [];
  bus.subscribe((event: KernelEvent) => events.push(event));
  const before = bus.read();
  const cyclic: Record<string, unknown> = {};
  cyclic.self = cyclic;
  const child = {
    commandVersion: 1,
    commandId: "core.document.set-metadata",
    target: { kind: "document", documentId: "score-1" },
    payload: cyclic,
  };

  const result = bus.submit(batch([child]));
  assert.equal(result.status, "rejected");
  if (result.status === "rejected") {
    assert.equal(result.failure.code, "command.invalid-envelope");
  }
  assertCoreStateUnchanged(bus, before, events);
});

test("batch capture accepts depth 64 and rejects depth 65 before mutation", () => {
  const created = CommandBus.create(createCoreScoreFixture());
  assert.equal(created.ok, true);
  if (!created.ok) {
    assert.fail("expected Core bus");
  }
  const bus = created.value;
  const events: KernelEvent[] = [];
  bus.subscribe((event: KernelEvent) => events.push(event));
  const before = bus.read();
  const child = (payload: unknown) => ({
    commandVersion: 1,
    commandId: "core.document.set-metadata",
    target: { kind: "document", documentId: "score-1" },
    payload,
  });

  const atLimit = bus.submit(batch([child(nestedValue(60))]));
  assert.equal(atLimit.status, "rejected");
  if (atLimit.status === "rejected") {
    assert.deepEqual(atLimit.failure, {
      code: "command.batch-child-rejected",
      failedCommandIndex: 0,
      failure: { code: "command.invalid-envelope" },
    });
  }
  const overLimit = bus.submit(batch([child(nestedValue(61))]));
  assert.equal(overLimit.status, "rejected");
  if (overLimit.status === "rejected") {
    assert.deepEqual(overLimit.failure, {
      code: "command.resource-limit-exceeded",
      limitKind: "input-depth",
      limit: 64,
      actual: 65,
    });
  }
  assertCoreStateUnchanged(bus, before, events);
});

test("batch capture enforces the global own-property budget at its exact boundary", () => {
  const created = CommandBus.create(createCoreScoreFixture());
  assert.equal(created.ok, true);
  if (!created.ok) {
    assert.fail("expected Core bus");
  }
  const bus = created.value;
  const events: KernelEvent[] = [];
  bus.subscribe((event: KernelEvent) => events.push(event));
  const before = bus.read();
  const overheadPropertyCount = 15;
  const child = (oversized: readonly null[]) => ({
    commandVersion: 1,
    commandId: "core.document.set-metadata",
    target: { kind: "document", documentId: "score-1" },
    payload: { oversized },
  });

  const atLimit = bus.submit(batch([
    child(new Array<null>(
      STRICT_INPUT_MAX_PROPERTIES - overheadPropertyCount,
    ).fill(null)),
  ]));
  assert.equal(atLimit.status, "rejected");
  if (atLimit.status === "rejected") {
    assert.deepEqual(atLimit.failure, {
      code: "command.batch-child-rejected",
      failedCommandIndex: 0,
      failure: { code: "command.invalid-envelope" },
    });
  }

  const overLimit = bus.submit(batch([
    child(new Array<null>(
      STRICT_INPUT_MAX_PROPERTIES - overheadPropertyCount + 1,
    ).fill(null)),
  ]));
  assert.equal(overLimit.status, "rejected");
  if (overLimit.status === "rejected") {
    assert.deepEqual(overLimit.failure, {
      code: "command.resource-limit-exceeded",
      limitKind: "input-properties",
      limit: STRICT_INPUT_MAX_PROPERTIES,
      actual: STRICT_INPUT_MAX_PROPERTIES + 1,
    });
  }
  assertCoreStateUnchanged(bus, before, events);
});

test("cumulative segment budgets accept 131072, reject 131073, and deduplicate stably", () => {
  const firstEffectBudget = checkBatchEffectBudget(0, 65_536);
  assert.deepEqual(firstEffectBudget, { ok: true, effectCount: 65_536 });
  const exactEffectBudget = checkBatchEffectBudget(65_536, 65_536);
  assert.deepEqual(exactEffectBudget, { ok: true, effectCount: 131_072 });
  assert.deepEqual(checkBatchEffectBudget(131_072, 1), {
    ok: false,
    failure: {
      code: "command.resource-limit-exceeded",
      limitKind: "effects",
      limit: 131_072,
      actual: 131_073,
    },
  });

  const affected: Array<{ readonly kind: "note"; readonly noteId: string }> = [];
  const seen = Object.create(null) as Record<string, true>;
  const first = Array.from({ length: 65_536 }, (_, index) => ({
    kind: "note" as const,
    noteId: `first-${index}`,
  }));
  const second = Array.from({ length: 65_536 }, (_, index) => ({
    kind: "note" as const,
    noteId: `second-${index}`,
  }));
  assert.deepEqual(
    appendBatchAffectedWithinBudget(affected, seen, [first[0]!, first[0]!]),
    { ok: true },
  );
  assert.equal(affected.length, 1);
  assert.deepEqual(
    appendBatchAffectedWithinBudget(affected, seen, first.slice(1)),
    { ok: true },
  );
  assert.deepEqual(
    appendBatchAffectedWithinBudget(affected, seen, second),
    { ok: true },
  );
  assert.equal(affected.length, 131_072);
  const beforeOverflow = affected.slice();
  assert.deepEqual(
    appendBatchAffectedWithinBudget(affected, seen, [{
      kind: "note",
      noteId: "overflow",
    }]),
    {
      ok: false,
      failure: {
        code: "command.resource-limit-exceeded",
        limitKind: "affected-addresses",
        limit: 131_072,
        actual: 131_073,
      },
    },
  );
  assert.deepEqual(affected, beforeOverflow);
});

test("batch effect aggregation accepts 131072 and attributes 131073 to the child", () => {
  const bus = resourceProbeBus();
  const events: IntegratedKernelEvent[] = [];
  bus.subscribe((event: IntegratedKernelEvent) => events.push(event));
  const before = bus.read();

  const atLimit = bus.submit(batch([resourceProbe(131_072, 0, true)]));
  assert.equal(atLimit.status, "rejected");
  if (atLimit.status === "rejected") {
    assert.equal(atLimit.failure.code, "command.batch-child-rejected");
    if (atLimit.failure.code === "command.batch-child-rejected") {
      assert.equal(
        atLimit.failure.failure.code,
        "command.contribution-contract-violation",
      );
    }
  }
  assert.deepEqual(bus.read(), before);
  assert.deepEqual(events, []);

  const overLimit = bus.submit(batch([resourceProbe(131_073, 0, true)]));
  assert.equal(overLimit.status, "rejected");
  if (overLimit.status === "rejected") {
    assert.deepEqual(overLimit.failure, {
      code: "command.batch-child-rejected",
      failedCommandIndex: 0,
      failure: {
        code: "command.resource-limit-exceeded",
        limitKind: "effects",
        limit: 131_072,
        actual: 131_073,
      },
    });
  }
  assert.deepEqual(bus.read(), before);
  assert.deepEqual(events, []);
});

test("batch affected aggregation accepts 131072 and attributes 131073 to the child", () => {
  const bus = resourceProbeBus();
  const events: IntegratedKernelEvent[] = [];
  bus.subscribe((event: IntegratedKernelEvent) => events.push(event));
  const before = bus.read();

  const atLimit = bus.submit(batch([resourceProbe(1, 131_072, false)]));
  assert.equal(atLimit.status, "rejected");
  if (atLimit.status === "rejected") {
    assert.equal(atLimit.failure.code, "command.batch-child-rejected");
    if (atLimit.failure.code === "command.batch-child-rejected") {
      assert.equal(
        atLimit.failure.failure.code,
        "command.contribution-contract-violation",
      );
    }
  }
  assert.deepEqual(bus.read(), before);
  assert.deepEqual(events, []);

  const overLimit = bus.submit(batch([resourceProbe(1, 131_073, false)]));
  assert.equal(overLimit.status, "rejected");
  if (overLimit.status === "rejected") {
    assert.deepEqual(overLimit.failure, {
      code: "command.batch-child-rejected",
      failedCommandIndex: 0,
      failure: {
        code: "command.resource-limit-exceeded",
        limitKind: "affected-addresses",
        limit: 131_072,
        actual: 131_073,
      },
    });
  }
  assert.deepEqual(bus.read(), before);
  assert.deepEqual(events, []);
});

test("synchronous String replacement cannot disguise a non-index child property", () => {
  const created = CommandBus.create(createCoreScoreFixture());
  assert.equal(created.ok, true);
  if (!created.ok) {
    assert.fail("expected Core bus");
  }
  const bus = created.value;
  const events: KernelEvent[] = [];
  bus.subscribe((event: KernelEvent) => events.push(event));
  const before = bus.read();
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "String");
  if (descriptor === undefined || !("value" in descriptor)) {
    assert.fail("expected String data property");
  }
  const raw: unknown[] = [];
  raw.length = 1;
  Object.defineProperty(raw, "forged", {
    value: {
      commandVersion: 1,
      commandId: "core.document.set-metadata",
      target: { kind: "document", documentId: "score-1" },
      payload: {
        metadata: {
          title: "must not commit",
          authors: ["Brilliant Guitar"],
          tempo: { bpm: 120 },
        },
      },
    },
    enumerable: true,
    configurable: true,
  });
  const commands = new Proxy(raw, {
    ownKeys(target) {
      Object.defineProperty(globalThis, "String", {
        ...descriptor,
        value: (() => "forged") as unknown as StringConstructor,
      });
      return Reflect.ownKeys(target);
    },
  });

  let result: ReturnType<CommandBus["submit"]>;
  try {
    result = bus.submit(batch(commands));
  } finally {
    Object.defineProperty(globalThis, "String", descriptor);
  }

  assert.equal(result.status, "rejected");
  if (result.status === "rejected") {
    assert.equal(result.failure.code, "command.invalid-envelope");
    assert.equal(result.documentVersion, 0);
    assert.equal(result.undoDepth, 0);
    assert.equal(result.redoDepth, 0);
  }
  assertCoreStateUnchanged(bus, before, events);
});

test("synchronous Set method replacement rejects before batch preparation", () => {
  const created = CommandBus.create(createCoreScoreFixture());
  assert.equal(created.ok, true);
  if (!created.ok) {
    assert.fail("expected Core bus");
  }
  const bus = created.value;
  const events: KernelEvent[] = [];
  bus.subscribe((event: KernelEvent) => events.push(event));
  const before = bus.read();
  const descriptor = Object.getOwnPropertyDescriptor(Set.prototype, "has");
  if (descriptor === undefined || !("value" in descriptor)) {
    assert.fail("expected Set.prototype.has data property");
  }
  const input = new Proxy(
    batch([
      {
        commandVersion: 1,
        commandId: "core.document.set-metadata",
        target: { kind: "document", documentId: "score-1" },
        payload: {
          metadata: {
            title: "must not commit",
            authors: ["Brilliant Guitar"],
            tempo: { bpm: 120 },
          },
        },
      },
    ]) as object,
    {
      ownKeys(target) {
        Object.defineProperty(Set.prototype, "has", {
          ...descriptor,
          value: (() => true) as typeof Set.prototype.has,
        });
        return Reflect.ownKeys(target);
      },
    },
  );

  let result: ReturnType<CommandBus["submit"]>;
  try {
    result = bus.submit(input);
  } finally {
    Object.defineProperty(Set.prototype, "has", descriptor);
  }

  assert.equal(result.status, "rejected");
  if (result.status === "rejected") {
    assert.equal(result.failure.code, "command.invalid-envelope");
    assert.equal(result.documentVersion, 0);
    assert.equal(result.undoDepth, 0);
    assert.equal(result.redoDepth, 0);
  }
  assertCoreStateUnchanged(bus, before, events);
});
