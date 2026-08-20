import assert = require("node:assert/strict");
import { resolve } from "node:path";
import { test } from "node:test";

import {
  createRustKernelSmokeSession,
  readRustKernelSmokeSession,
  type RustKernelSmokeNativeAddon,
} from "../../../src/core-kernel/native/rust-kernel-smoke";
import { createCoreScoreFixture } from "../fixtures/core-score";

interface RawNativeCreateResult {
  readonly payload: Buffer;
  readonly handle?: object;
}

interface RawNativeAddon extends RustKernelSmokeNativeAddon {
  readonly createKernelSessionV1: (requestBytes: unknown) => RawNativeCreateResult;
  readonly readKernelSessionV1: (handle: unknown) => Buffer;
}

const addonPath = resolve(
  process.cwd(),
  "target/rkp-1-node/brilliant_kernel_node.node",
);
// eslint-disable-next-line @typescript-eslint/no-require-imports
const addon = require(addonPath) as RawNativeAddon;

function canonicalCreateBytes(document: unknown): Buffer {
  return Buffer.from(JSON.stringify({ apiVersion: 1, document }), "utf8");
}

function parsePayload(payload: Buffer): Record<string, unknown> {
  return JSON.parse(payload.toString("utf8")) as Record<string, unknown>;
}

function assertDeepFrozen(value: unknown, seen = new WeakSet<object>()): void {
  if (value === null || typeof value !== "object" || seen.has(value)) {
    return;
  }
  seen.add(value);
  assert.equal(Object.isFrozen(value), true);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
    if (descriptor !== undefined && "value" in descriptor) {
      assertDeepFrozen(descriptor.value, seen);
    }
  }
}

test("raw addon exposes exactly two free functions and performs native create/read", () => {
  assert.deepEqual(Object.keys(addon).sort(), [
    "createKernelSessionV1",
    "readKernelSessionV1",
  ]);

  const document = createCoreScoreFixture();
  const created = addon.createKernelSessionV1(canonicalCreateBytes(document));
  assert.deepEqual(Object.keys(created), ["payload", "handle"]);
  assert.equal(
    created.payload.toString("utf8"),
    '{"apiVersion":1,"status":"created","value":{"documentId":"score-1","documentVersion":0}}',
  );
  assert.ok(created.handle);
  const rawHandle = created.handle;
  if (rawHandle === undefined) {
    throw new Error("expected raw native handle");
  }
  assert.deepEqual(Reflect.ownKeys(rawHandle), []);

  const read = parsePayload(addon.readKernelSessionV1(rawHandle));
  assert.equal(read.apiVersion, 1);
  assert.equal(read.status, "ok");
  const value = read.value as Record<string, unknown>;
  assert.deepEqual(value.history, { undoDepth: 0, redoDepth: 0 });
  assert.equal(value.dirty, false);
  const snapshot = value.snapshot as Record<string, unknown>;
  assert.equal(snapshot.documentVersion, 0);
  assert.equal(snapshot.schemaVersion, "brilliant-score-1");
  assert.deepEqual(snapshot.document, document);
});

test("private adapter returns detached deeply frozen data and an opaque handle", () => {
  const source = createCoreScoreFixture();
  const expected = structuredClone(source);
  const created = createRustKernelSmokeSession(addon, source);
  assert.equal(created.result.status, "created");
  if (created.result.status !== "created") {
    throw new Error("expected native create success");
  }
  if (!("handle" in created)) {
    throw new Error("expected opaque handle");
  }
  assert.deepEqual(Reflect.ownKeys(created.handle), []);
  assert.equal(Object.isFrozen(created.handle), true);

  (source.metadata as { title: string }).title = "mutated after capture";
  const read = readRustKernelSmokeSession(addon, created.handle);
  assert.equal(read.status, "ok");
  if (read.status !== "ok") {
    throw new Error("expected native read success");
  }
  assert.deepEqual(
    JSON.parse(JSON.stringify(read.value.snapshot.document)) as unknown,
    expected,
  );
  assert.equal(read.value.history.undoDepth, 0);
  assert.equal(read.value.history.redoDepth, 0);
  assert.equal(read.value.dirty, false);
  assertDeepFrozen(created.result);
  assertDeepFrozen(read);
});

test("raw rejection bytes preserve cap, UTF-8, shape and precedence with no handle", () => {
  const wrongKind = addon.createKernelSessionV1("not a buffer");
  assert.deepEqual(Object.keys(wrongKind), ["payload"]);
  assert.equal(
    wrongKind.payload.toString("utf8"),
    '{"apiVersion":1,"status":"rejected","failure":{"failureVersion":1,"code":"bridge.capture-invalid"}}',
  );

  const invalidUtf8 = addon.createKernelSessionV1(Buffer.from([0xff]));
  assert.deepEqual(Object.keys(invalidUtf8), ["payload"]);
  assert.equal(
    invalidUtf8.payload.toString("utf8"),
    '{"apiVersion":1,"status":"rejected","failure":{"failureVersion":1,"code":"codec.invalid-utf8"}}',
  );

  const extraField = addon.createKernelSessionV1(
    Buffer.from('{"apiVersion":1,"document":{},"extra":true}', "utf8"),
  );
  assert.deepEqual(parsePayload(extraField.payload), {
    apiVersion: 1,
    status: "rejected",
    failure: {
      failureVersion: 1,
      code: "codec.invalid-shape",
      path: [],
      violation: "extra-field",
    },
  });

  const overCap = addon.createKernelSessionV1(
    Buffer.alloc(64 * 1024 * 1024 + 1, 0xff),
  );
  assert.deepEqual(Object.keys(overCap), ["payload"]);
  assert.deepEqual(parsePayload(overCap.payload), {
    apiVersion: 1,
    status: "rejected",
    failure: {
      failureVersion: 1,
      code: "bridge.request-too-large",
      limitBytes: 67_108_864,
      actualBytes: 67_108_865,
    },
  });
});

test("wrong kind and wrong tag fail stably without native detail leakage", () => {
  for (const handle of [null, 1, "handle", {}, []]) {
    const failure = addon.readKernelSessionV1(handle);
    assert.equal(
      failure.toString("utf8"),
      '{"apiVersion":1,"status":"rejected","failure":{"failureVersion":1,"code":"bridge.handle-unknown"}}',
    );
  }
});

test("descriptor-first capture rejects getter, hostile Proxy, sparse array and cycle before native", () => {
  let calls = 0;
  const rejectingAddon: RustKernelSmokeNativeAddon = {
    createKernelSessionV1: () => {
      calls += 1;
      throw new Error("native must not run");
    },
    readKernelSessionV1: () => {
      throw new Error("unused");
    },
  };

  let getterReads = 0;
  const getter = {};
  Object.defineProperty(getter, "schemaVersion", {
    enumerable: true,
    get: () => {
      getterReads += 1;
      return "brilliant-score-1";
    },
  });
  assert.equal(
    createRustKernelSmokeSession(rejectingAddon, getter).result.status,
    "rejected",
  );
  assert.equal(getterReads, 0);

  let ordinaryReads = 0;
  const proxyTarget = { schemaVersion: "brilliant-score-1" };
  const hostileProxy = new Proxy(proxyTarget, {
    get: () => {
      ordinaryReads += 1;
      throw new Error("ordinary property read");
    },
    getOwnPropertyDescriptor: () => {
      throw new Error("hostile descriptor trap");
    },
  });
  assert.equal(
    createRustKernelSmokeSession(rejectingAddon, hostileProxy).result.status,
    "rejected",
  );
  assert.equal(ordinaryReads, 0);

  const sparse: unknown[] = [];
  sparse.length = 1;
  assert.equal(
    createRustKernelSmokeSession(rejectingAddon, sparse).result.status,
    "rejected",
  );

  const cycle: Record<string, unknown> = {};
  cycle.self = cycle;
  assert.equal(
    createRustKernelSmokeSession(rejectingAddon, cycle).result.status,
    "rejected",
  );
  assert.equal(calls, 0);
});

test("adapter converts every residual native throw or malformed payload to bridge.internal", () => {
  const document = createCoreScoreFixture();
  const throwing: RustKernelSmokeNativeAddon = {
    createKernelSessionV1: () => {
      throw new Error("raw napi secret");
    },
    readKernelSessionV1: () => {
      throw new Error("raw napi secret");
    },
  };
  const creation = createRustKernelSmokeSession(throwing, document);
  assert.deepEqual(creation.result, {
    apiVersion: 1,
    status: "rejected",
    failure: { failureVersion: 1, code: "bridge.internal" },
  });
  assertDeepFrozen(creation);

  const malformed: RustKernelSmokeNativeAddon = {
    createKernelSessionV1: () => ({ payload: Buffer.from("{}"), leaked: true }),
    readKernelSessionV1: () => Buffer.from("{}"),
  };
  const malformedResult = createRustKernelSmokeSession(malformed, document).result;
  assert.equal(malformedResult.status, "rejected");
  if (malformedResult.status !== "rejected") {
    throw new Error("expected malformed native response rejection");
  }
  assert.equal(malformedResult.failure.code, "bridge.internal");
});
