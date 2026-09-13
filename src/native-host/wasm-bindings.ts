// Explicit trusted-host installation, not a public SDK export or guest-supplied
// authorization manifest. The authentic catalog stays the source of identity.
import { createHash } from "node:crypto";
import { types } from "node:util";
import { getKernelIntegratedCatalogState } from "../core-kernel/registry/domain-catalog";
import { readDenseArray, readExactDataRecord } from "../core-kernel/registry/strict-codec";
import { captureStrictInput } from "../core-kernel/codec/strict-input-capture";
import type { KernelIntegratedCatalog } from "../core-kernel/registry/integrated-contracts";
import type { ScopedExecutionPolicyV1 } from "../core-kernel/module-sdk/scoped-invocation";
import { installNativeIntegratedBackendV2, type IntegratedNativeAddonV2 } from "../core-kernel/native/integrated-command-bus";
import { encodeIntegratedValueV2 } from "../core-kernel/native/integrated-wire";

export interface WasmNativeAddonV1 extends IntegratedNativeAddonV2 {
  createWasmModuleExecutorV1(bytes: Buffer, expectedSha256: Buffer, abiVersion: number): (input: Buffer) => Buffer;
  migrateKernelExtensionV2: NonNullable<IntegratedNativeAddonV2["migrateKernelExtensionV2"]>;
}
const parse = JSON.parse;
const from = Buffer.from;
const isUint8Array = types.isUint8Array;
const apply = Reflect.apply;
const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
const decodeUtf8 = TextDecoder.prototype.decode;
const freeze = Object.freeze;
const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype);
const byteLength = Object.getOwnPropertyDescriptor(typedArrayPrototype, "byteLength")!.get!;
const byteOffset = Object.getOwnPropertyDescriptor(typedArrayPrototype, "byteOffset")!.get!;
const arrayBuffer = Object.getOwnPropertyDescriptor(typedArrayPrototype, "buffer")!.get!;
const isSharedArrayBuffer = types.isSharedArrayBuffer;
const MAX_TOTAL_BYTES = 64 * 1024 * 1024;

/** Fully validate and capture the roster before compiling any module. */
export function createWasmExecutionPolicyV1(addon: WasmNativeAddonV1, catalog: KernelIntegratedCatalog, input: unknown): ScopedExecutionPolicyV1 {
  return captureWasmExecutionPolicy(addon, catalog, input, false);
}

function captureWasmExecutionPolicy(addon: WasmNativeAddonV1, catalog: KernelIntegratedCatalog, input: unknown,
  requireAll: boolean): ScopedExecutionPolicyV1 {
  if (typeof addon.createWasmModuleExecutorV1 !== "function" || typeof addon.createIntegratedKernelSessionV2 !== "function"
    || typeof addon.migrateKernelExtensionV2 !== "function") throw new TypeError("wasm.invalid-addon");
  const state = getKernelIntegratedCatalogState(catalog);
  const rows = readDenseArray(input);
  if (state === undefined || rows === undefined || rows.length === 0 || rows.length > 1024) throw new TypeError("wasm.invalid-binding");
  // Cover dormant contributions too: later commands can create their blocks.
  if (requireAll && rows.length !== state.contributions.length) throw new TypeError("wasm.incomplete-binding");
  const captured: { source: typeof state.contributions[number]; bytes: Buffer; digest: Buffer }[] = [];
  const owners = new Set<object>();
  let total = 0;
  for (const row of rows) {
    const record = readExactDataRecord(row, ["moduleId", "contributionId", "abiVersion", "sha256", "bytes"]);
    if (record === undefined || record.abiVersion !== 1 || typeof record.sha256 !== "string" || !/^[a-f0-9]{64}$/u.test(record.sha256)
      || !isUint8Array(record.bytes)) throw new TypeError("wasm.invalid-binding");
    const source = state.contributions.find(entry => entry.moduleId === record.moduleId && entry.contributionId === record.contributionId);
    if (source === undefined || owners.has(source)) throw new TypeError("wasm.invalid-binding");
    // Read intrinsic slots without caller-defined length/valueOf/iterator hooks,
    // and enforce the allocation budget before detaching any bytes.
    const length = apply(byteLength, record.bytes, []) as number;
    total += length;
    if (length > 4 * 1024 * 1024 || total > MAX_TOTAL_BYTES) throw new TypeError("wasm.invalid-binding");
    const storage = apply(arrayBuffer, record.bytes, []) as ArrayBuffer;
    if (isSharedArrayBuffer(storage)) throw new TypeError("wasm.invalid-binding");
    const view = apply(from, Buffer, [storage, apply(byteOffset, record.bytes, []), length]) as Buffer;
    const bytes = apply(from, Buffer, [view]) as Buffer;
    if (createHash("sha256").update(bytes).digest("hex") !== record.sha256) throw new TypeError("wasm.invalid-binding");
    const digest = apply(from, Buffer, [record.sha256, "hex"]) as Buffer;
    owners.add(source);
    captured.push({ source, bytes, digest });
  }
  const executors = new Map<typeof state.contributions[number], (input: Buffer) => Buffer>();
  for (const { source, bytes, digest } of captured) {
    const execute = addon.createWasmModuleExecutorV1(bytes, digest, 1);
    if (typeof execute !== "function") throw new TypeError("wasm.invalid-addon");
    executors.set(source, execute);
  }
  const policy: ScopedExecutionPolicyV1 = { catalog, invoke(source, operation, definitionId, args, fallback) {
    if (!state.contributions.includes(source)) throw new TypeError("wasm.assembly-mismatch");
    const execute = executors.get(source);
    if (execute === undefined) {
      if (requireAll) throw new TypeError("wasm.incomplete-binding");
      return fallback();
    }
    const output = execute(encodeIntegratedValueV2({ callbackVersion: 1, moduleId: source.moduleId,
      contributionId: source.contributionId, operation, definitionId, arguments: args }));
    const value = parse(apply(decodeUtf8, decoder, [output]) as string);
    const result = captureStrictInput(value);
    if (result.status !== "captured") throw new TypeError("wasm.invalid-result");
    // Existing SDK host checks still validate issues, statuses and effect data.
    return result.value;
  } };
  return freeze(policy);
}

export function installNativeWasmIntegratedBackendV1(addon: WasmNativeAddonV1, catalog: KernelIntegratedCatalog, bindings: unknown): () => void {
  const policy = createWasmExecutionPolicyV1(addon, catalog, bindings);
  return installNativeIntegratedBackendV2(addon, policy);
}

/** Trusted-host opt-in: every installed contribution must use a bounded guest.
 * Host orchestration and codecs remain TS; this forbids SDK plugin JS fallback. */
export function installNativeWasmOnlyIntegratedBackendV1(addon: WasmNativeAddonV1, catalog: KernelIntegratedCatalog, bindings: unknown): () => void {
  const policy = captureWasmExecutionPolicy(addon, catalog, bindings, true);
  return installNativeIntegratedBackendV2(addon, policy);
}
