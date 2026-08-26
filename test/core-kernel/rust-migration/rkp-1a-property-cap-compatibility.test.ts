import assert = require("node:assert/strict");
import { resolve } from "node:path";
import { test } from "node:test";

import {
  createRustKernelSmokeSession,
  readRustKernelSmokeSession,
  type OpaqueKernelSessionHandle,
  type RustKernelSmokeNativeAddon,
} from "../../../src/core-kernel/native/rust-kernel-smoke";
import { createStressCvn7Score } from "../fixtures/cvn-7-qualification-score";

interface RawNativeCreateResult {
  readonly payload: Buffer;
  readonly handle?: object;
}

interface RawNativeAddon extends RustKernelSmokeNativeAddon {
  readonly createKernelSessionV1: (requestBytes: unknown) => RawNativeCreateResult;
  readonly readKernelSessionV1: (handle: unknown) => Buffer;
}

const SUCCESSOR_PROPERTY_LIMIT = 1_572_864;
const SUCCESSOR_PROPERTY_ACTUAL = SUCCESSOR_PROPERTY_LIMIT + 1;
const DEFAULT_CAPTURE_PROPERTY_LIMIT = 1_048_576;
const STRESS_DIRECT_DAG_MEMBERS = 1_045_635;
const STRESS_CLONED_TREE_MEMBERS = 1_199_232;
const STRESS_CREATE_REQUEST_BYTES = 15_013_932;
const STRESS_READ_WRAPPER_BYTES = 15_014_112;

const addonPath = resolve(
  process.cwd(),
  "target/rkp-1-node/brilliant_kernel_node.node",
);
// eslint-disable-next-line @typescript-eslint/no-require-imports
const addon = require(addonPath) as RawNativeAddon;

function rejectedPayload(failure: Readonly<Record<string, unknown>>): Buffer {
  return Buffer.from(
    JSON.stringify({ apiVersion: 1, status: "rejected", failure }),
    "utf8",
  );
}

function addonReturning(payload: Buffer): RustKernelSmokeNativeAddon {
  return {
    createKernelSessionV1: () => ({ payload }),
    readKernelSessionV1: () => {
      throw new Error("read must not run for rejected create");
    },
  };
}

function adaptFailure(failure: Readonly<Record<string, unknown>>) {
  return createRustKernelSmokeSession(addonReturning(rejectedPayload(failure)), {})
    .result;
}

function successorFailure(): Readonly<Record<string, unknown>> {
  return {
    failureVersion: 1,
    code: "codec.property-limit",
    limit: SUCCESSOR_PROPERTY_LIMIT,
    actual: SUCCESSOR_PROPERTY_ACTUAL,
  };
}

function createdPayload(documentId = "profile-selection"): Buffer {
  return Buffer.from(
    JSON.stringify({
      apiVersion: 1,
      status: "created",
      value: { documentId, documentVersion: 0 },
    }),
    "utf8",
  );
}

function readPayload(document: unknown): Buffer {
  return Buffer.from(
    JSON.stringify({
      apiVersion: 1,
      status: "ok",
      value: {
        snapshot: {
          documentId: "profile-selection",
          schemaVersion: "brilliant-score-1",
          documentVersion: 0,
          document,
        },
        history: { undoDepth: 0, redoDepth: 0 },
        dirty: false,
      },
    }),
    "utf8",
  );
}

type MemberCountTask =
  | { readonly kind: "value"; readonly value: unknown }
  | { readonly kind: "complete"; readonly value: object };

function countCapturedMembers(input: unknown): number {
  const active = new WeakSet<object>();
  const completed = new WeakSet<object>();
  const tasks: MemberCountTask[] = [{ kind: "value", value: input }];
  let memberCount = 0;

  while (tasks.length > 0) {
    const task = tasks.pop();
    assert.ok(task, "member-count task must exist");
    if (task.kind === "complete") {
      active.delete(task.value);
      completed.add(task.value);
      continue;
    }

    const value = task.value;
    if (value === null || typeof value !== "object") {
      continue;
    }
    assert.equal(active.has(value), false, "fixture must remain acyclic");
    if (completed.has(value)) {
      continue;
    }

    active.add(value);
    tasks.push({ kind: "complete", value });
    if (Array.isArray(value)) {
      const length = value.length;
      assert.equal(Reflect.ownKeys(value).length, length + 1);
      memberCount += length;
      for (let index = length - 1; index >= 0; index -= 1) {
        const descriptor = Reflect.getOwnPropertyDescriptor(value, String(index));
        assert.ok(
          descriptor?.enumerable === true && "value" in descriptor,
          `array member ${index} must be an enumerable data property`,
        );
        tasks.push({ kind: "value", value: descriptor.value });
      }
      continue;
    }

    const prototype = Reflect.getPrototypeOf(value);
    assert.ok(
      prototype === Object.prototype || prototype === null,
      "fixture records must be plain or null-prototype objects",
    );
    const keys = Reflect.ownKeys(value);
    memberCount += keys.length;
    for (let index = keys.length - 1; index >= 0; index -= 1) {
      const key = keys[index];
      if (key === undefined) {
        assert.fail("fixture record key must exist");
      }
      assert.equal(typeof key, "string", "fixture record keys must be strings");
      const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
      assert.ok(
        descriptor?.enumerable === true && "value" in descriptor,
        `record member ${String(key)} must be an enumerable data property`,
      );
      tasks.push({ kind: "value", value: descriptor.value });
    }
  }

  assert.equal(Number.isSafeInteger(memberCount), true);
  return memberCount;
}

test(
  "fake and real native successor property-limit stays stable",
  { timeout: 60_000 },
  () => {
    const expected =
      '{"apiVersion":1,"status":"rejected","failure":{"failureVersion":1,"code":"codec.property-limit","limit":1572864,"actual":1572865}}';
    assert.equal(JSON.stringify(adaptFailure(successorFailure())), expected);

    const elements = `${"0,".repeat(SUCCESSOR_PROPERTY_LIMIT - 1)}0`;
    const request = Buffer.from(`[${elements}]`, "utf8");
    assert.ok(request.byteLength < 64 * 1024 * 1024);

    const raw = addon.createKernelSessionV1(request);
    assert.deepEqual(Object.keys(raw), ["payload"]);
    assert.equal(
      raw.payload.toString("utf8"),
      expected,
    );
    assert.equal(
      JSON.stringify(
        createRustKernelSmokeSession(addonReturning(raw.payload), {}).result,
      ),
      expected,
    );
  },
);

test("predecessor and malformed property-limit failures stay internal", () => {
  const malformed = [
    {
      failureVersion: 1,
      code: "codec.property-limit",
      limit: 1_048_576,
      actual: 1_048_577,
    },
    { ...successorFailure(), extra: true },
    { ...successorFailure(), limit: "1572864" },
    { ...successorFailure(), actual: "1572865" },
    {
      failureVersion: 1,
      code: "codec.property-limit",
      limit: SUCCESSOR_PROPERTY_LIMIT,
    },
  ];

  for (const failure of malformed) {
    assert.equal(
      JSON.stringify(adaptFailure(failure)),
      '{"apiVersion":1,"status":"rejected","failure":{"failureVersion":1,"code":"bridge.internal"}}',
    );
  }
});

test(
  "native create and read capture admit stress DAG and cloned tree representations",
  { timeout: 120_000 },
  () => {
    const directDocument = createStressCvn7Score().document;
    const clonedDocument = JSON.parse(
      JSON.stringify(directDocument),
    ) as unknown;
    assert.equal(
      countCapturedMembers(directDocument),
      STRESS_DIRECT_DAG_MEMBERS,
      "shared fixture references are a DAG representation fact below the predecessor cap",
    );
    assert.ok(STRESS_DIRECT_DAG_MEMBERS <= DEFAULT_CAPTURE_PROPERTY_LIMIT);
    assert.equal(
      countCapturedMembers(clonedDocument),
      STRESS_CLONED_TREE_MEMBERS,
      "the equivalent JSON tree requires the successor native-wire-v1 profile",
    );
    assert.ok(STRESS_CLONED_TREE_MEMBERS > DEFAULT_CAPTURE_PROPERTY_LIMIT);

    let createCalls = 0;
    let readCalls = 0;
    const capturedRequests: Buffer[] = [];
    const readBytes = readPayload(clonedDocument);
    assert.equal(readBytes.byteLength, STRESS_READ_WRAPPER_BYTES);
    const profileAddon: RustKernelSmokeNativeAddon = {
      createKernelSessionV1(request) {
        createCalls += 1;
        assert.ok(Buffer.isBuffer(request));
        capturedRequests.push(Buffer.from(request as Buffer));
        return { payload: createdPayload(), handle: {} };
      },
      readKernelSessionV1() {
        readCalls += 1;
        return readBytes;
      },
    };

    const directOutcome = createRustKernelSmokeSession(
      profileAddon,
      directDocument,
    );
    const clonedOutcome = createRustKernelSmokeSession(
      profileAddon,
      clonedDocument,
    );
    assert.equal(createCalls, 2);
    assert.equal(capturedRequests.length, 2);
    assert.equal(directOutcome.result.status, "created");
    assert.equal(clonedOutcome.result.status, "created");
    for (const request of capturedRequests) {
      assert.equal(request.byteLength, STRESS_CREATE_REQUEST_BYTES);
    }
    assert.equal(capturedRequests[0]?.equals(capturedRequests[1]!), true);
    if (!("handle" in clonedOutcome)) {
      assert.fail("cloned-tree create must publish one accepted fake handle");
    }

    const read = readRustKernelSmokeSession(profileAddon, clonedOutcome.handle);
    assert.equal(readCalls, 1);
    assert.equal(read.status, "ok");
    if (read.status !== "ok") {
      assert.fail("cloned-tree public read must use native-wire-v1 capture");
    }
    assert.equal(Object.isFrozen(read.value.snapshot.document), true);
  },
);

test(
  "native read response capture selects native-wire-v1 and stays deeply frozen",
  { timeout: 120_000 },
  () => {
    const oversizedForDefault = new Array<null>(
      DEFAULT_CAPTURE_PROPERTY_LIMIT + 1,
    ).fill(null);
    const profileAddon: RustKernelSmokeNativeAddon = {
      createKernelSessionV1() {
        throw new Error("create is not part of read profile selection");
      },
      readKernelSessionV1() {
        return readPayload({ oversizedForDefault });
      },
    };

    const result = readRustKernelSmokeSession(
      profileAddon,
      {} as OpaqueKernelSessionHandle,
    );
    assert.equal(result.status, "ok");
    if (result.status !== "ok") {
      assert.fail("native-wire-v1 response capture must accept default cap + 1");
    }
    const document = result.value.snapshot.document as {
      readonly oversizedForDefault: readonly null[];
    };
    assert.equal(
      document.oversizedForDefault.length,
      DEFAULT_CAPTURE_PROPERTY_LIMIT + 1,
    );
    assert.equal(Object.isFrozen(document), true);
    assert.equal(Object.isFrozen(document.oversizedForDefault), true);
  },
);

test(
  "native create and read capture overflow preserve their existing failures",
  { timeout: 120_000 },
  () => {
    let createCalls = 0;
    const profileAddon: RustKernelSmokeNativeAddon = {
      createKernelSessionV1() {
        createCalls += 1;
        return { payload: createdPayload(), handle: {} };
      },
      readKernelSessionV1() {
        return readPayload(
          new Array<null>(SUCCESSOR_PROPERTY_LIMIT).fill(null),
        );
      },
    };

    const create = createRustKernelSmokeSession(
      profileAddon,
      new Array<null>(SUCCESSOR_PROPERTY_LIMIT + 1).fill(null),
    );
    assert.equal(createCalls, 0);
    assert.equal(create.result.status, "rejected");
    assert.equal(create.result.failure.code, "bridge.capture-invalid");

    const read = readRustKernelSmokeSession(
      profileAddon,
      {} as OpaqueKernelSessionHandle,
    );
    assert.equal(read.status, "rejected");
    if (read.status !== "rejected") {
      assert.fail("oversized native response must reject");
    }
    assert.equal(read.failure.code, "bridge.internal");
  },
);
