import assert = require("node:assert/strict");
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";
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

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)] ?? Number.POSITIVE_INFINITY;
}

function largeObjectRequest(memberCount: number, duplicate: boolean): Buffer {
  const members = new Array<string>(memberCount);
  for (let index = 0; index < memberCount; index += 1) {
    const key = duplicate ? "repeated" : `extra-${index.toString().padStart(5, "0")}`;
    members[index] = `${JSON.stringify(key)}:0`;
  }
  return Buffer.from(
    `{"apiVersion":1,"document":{},${members.join(",")}}`,
    "utf8",
  );
}

function timedCreate(request: Buffer): number {
  const started = performance.now();
  const result = addon.createKernelSessionV1(request);
  const elapsed = performance.now() - started;
  assert.equal(
    result.payload.toString("utf8"),
    '{"apiVersion":1,"status":"rejected","failure":{"failureVersion":1,"code":"codec.invalid-shape","path":["document","extensions"],"violation":"missing-field"}}',
  );
  return elapsed;
}

test("raw successor addon preserves the RKP-1 create/read subset", () => {
  assert.equal(typeof addon.createKernelSessionV1, "function");
  assert.equal(typeof addon.readKernelSessionV1, "function");

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

const forceGc = (globalThis as typeof globalThis & { gc?: () => void }).gc;

test(
  "wrapped handle GC runs one bounded FinalizationRegistry journey",
  { skip: forceGc === undefined, timeout: 10_000 },
  async () => {
    if (forceGc === undefined) {
      throw new Error("test requires --expose-gc");
    }
    let finalizations = 0;
    const registry = new FinalizationRegistry(() => {
      finalizations += 1;
    });
    const weakHandle = (() => {
      const created = addon.createKernelSessionV1(
        canonicalCreateBytes(createCoreScoreFixture()),
      );
      if (created.handle === undefined) {
        throw new Error("expected wrapped handle");
      }
      registry.register(created.handle, "rkp-1-handle");
      return new WeakRef(created.handle);
    })();

    for (let attempt = 0; attempt < 200 && finalizations === 0; attempt += 1) {
      forceGc();
      await new Promise<void>((resolvePromise) => setImmediate(resolvePromise));
    }
    assert.equal(weakHandle.deref(), undefined);
    assert.equal(finalizations, 1);

    for (let attempt = 0; attempt < 8; attempt += 1) {
      forceGc();
      await new Promise<void>((resolvePromise) => setImmediate(resolvePromise));
    }
    assert.equal(finalizations, 1);
  },
);

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
    Buffer.from(
      JSON.stringify({
        apiVersion: 1,
        document: createCoreScoreFixture(),
        extra: true,
      }),
      "utf8",
    ),
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

test("real addon selects the same canonical structural winner for reversed keys", () => {
  const forward = Buffer.from(
    '{"apiVersion":1,"document":{"schemaVersion":"brilliant-score-1","id":false,"metadata":{"title":false,"authors":[],"tempo":{"bpm":120}},"measureDefinitions":[],"parts":[],"extensions":[]}}',
    "utf8",
  );
  const reversed = Buffer.from(
    '{"document":{"extensions":[],"parts":[],"measureDefinitions":[],"metadata":{"tempo":{"bpm":120},"authors":[],"title":false},"id":false,"schemaVersion":"brilliant-score-1"},"apiVersion":1}',
    "utf8",
  );
  const expected =
    '{"apiVersion":1,"status":"rejected","failure":{"failureVersion":1,"code":"codec.invalid-shape","path":["document","id"],"violation":"wrong-type"}}';

  for (const request of [forward, reversed]) {
    const result = addon.createKernelSessionV1(request);
    assert.deepEqual(Object.keys(result), ["payload"]);
    assert.equal(result.payload.toString("utf8"), expected);
  }
});

test(
  "real addon large unique and duplicate objects stay below the frozen near-quadratic ratio",
  { timeout: 30_000 },
  (context) => {
    const sizes = [5_000, 10_000, 20_000] as const;
    for (const duplicate of [false, true]) {
      const requests = sizes.map((size) => largeObjectRequest(size, duplicate));
      for (const request of requests) {
        timedCreate(request);
      }
      const medians = requests.map((request) =>
        median([timedCreate(request), timedCreate(request), timedCreate(request)]),
      );
      const [small = Number.POSITIVE_INFINITY, medium = Number.POSITIVE_INFINITY, large = Number.POSITIVE_INFINITY] =
        medians;
      const adjacentRatios = [medium / small, large / medium];
      context.diagnostic(
        `${duplicate ? "duplicate" : "unique"} medians_ms=${medians
          .map((value) => value.toFixed(3))
          .join(",")} adjacent_ratios=${adjacentRatios
          .map((value) => value.toFixed(3))
          .join(",")} endpoint_ratio=${(large / small).toFixed(3)}`,
      );
      assert.ok(
        adjacentRatios.every((ratio) => ratio < 3.25),
        `${duplicate ? "duplicate" : "unique"} adjacent ratios ${adjacentRatios.join(",")}`,
      );
      assert.ok(
        large / small < 8.5,
        `${duplicate ? "duplicate" : "unique"} endpoint ratio ${large / small}`,
      );
    }
  },
);

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
