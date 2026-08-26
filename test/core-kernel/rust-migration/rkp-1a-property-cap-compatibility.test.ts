import assert = require("node:assert/strict");
import { resolve } from "node:path";
import { test } from "node:test";

import {
  createRustKernelSmokeSession,
  readRustKernelSmokeSession,
  type OpaqueKernelSessionHandle,
  type RustKernelSmokeNativeAddon,
} from "../../../src/core-kernel/native/rust-kernel-smoke";

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
  "native create capture selects native-wire-v1 and remains detached",
  { timeout: 120_000 },
  () => {
    const document: unknown[] = new Array<null>(
      DEFAULT_CAPTURE_PROPERTY_LIMIT + 1,
    ).fill(null);
    let createCalls = 0;
    let requestBytes: Buffer | undefined;
    const profileAddon: RustKernelSmokeNativeAddon = {
      createKernelSessionV1(request) {
        createCalls += 1;
        assert.ok(Buffer.isBuffer(request));
        requestBytes = Buffer.from(request as Buffer);
        return { payload: createdPayload(), handle: {} };
      },
      readKernelSessionV1() {
        throw new Error("read is not part of create profile selection");
      },
    };

    const outcome = createRustKernelSmokeSession(profileAddon, document);
    assert.equal(createCalls, 1);
    assert.equal(outcome.result.status, "created");
    assert.ok(requestBytes);
    document[0] = "mutated-after-capture";
    const request = JSON.parse(requestBytes.toString("utf8")) as {
      readonly document: readonly unknown[];
    };
    assert.equal(request.document.length, DEFAULT_CAPTURE_PROPERTY_LIMIT + 1);
    assert.equal(request.document[0], null);
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
