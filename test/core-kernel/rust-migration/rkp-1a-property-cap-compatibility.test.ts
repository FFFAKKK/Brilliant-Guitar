import assert = require("node:assert/strict");
import { resolve } from "node:path";
import { test } from "node:test";

import {
  createRustKernelSmokeSession,
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
