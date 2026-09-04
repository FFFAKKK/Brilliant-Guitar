import assert = require("node:assert/strict");

import type { RustKernelStage4NativeAddon } from "../../../src/core-kernel/native/rust-kernel-smoke";

export interface RawRkp4NativeAddon extends RustKernelStage4NativeAddon {
  readonly createKernelSessionV1: (requestBytes: unknown) => {
    readonly payload: Buffer;
    readonly handle?: object;
  };
  readonly readKernelSessionV1: (handle: unknown) => Buffer;
  readonly submitKernelStage3V1: (
    handle: unknown,
    requestBytes: unknown,
  ) => Buffer;
  readonly operateKernelStage4V1: (
    handle: unknown,
    requestBytes: unknown,
  ) => Buffer;
}

export function createRkp4MetadataCommand(
  title: string,
  documentId = "score-1",
): Record<string, unknown> {
  return {
    commandVersion: 1,
    commandId: "core.document.set-metadata",
    target: { kind: "document", documentId },
    payload: {
      metadata: {
        title,
        authors: ["Brilliant Guitar"],
        tempo: { bpm: 120 },
      },
    },
  };
}

export function createRkp4OperationBytes(operation: unknown): Buffer {
  return Buffer.from(JSON.stringify({ apiVersion: 1, operation }), "utf8");
}

export function parseRkp4Payload(payload: Buffer): Record<string, unknown> {
  return JSON.parse(payload.toString("utf8")) as Record<string, unknown>;
}

export function assertRkp4DeepFrozen(
  value: unknown,
  seen = new WeakSet<object>(),
): void {
  if (value === null || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  assert.equal(Object.isFrozen(value), true);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
    if (descriptor !== undefined && "value" in descriptor) {
      assertRkp4DeepFrozen(descriptor.value, seen);
    }
  }
}
