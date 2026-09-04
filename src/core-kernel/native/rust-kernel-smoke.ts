import { captureStrictInput } from "../codec/strict-input-capture";

const API_VERSION = 1 as const;
const REQUEST_BYTE_LIMIT = 64 * 1024 * 1024;
const RESPONSE_BYTE_LIMIT = 64 * 1024 * 1024;
const reflectApply = Reflect.apply;
const reflectOwnKeys = Reflect.ownKeys;
const reflectGetOwnPropertyDescriptor = Reflect.getOwnPropertyDescriptor;
const jsonParse = JSON.parse;
const jsonStringify = JSON.stringify;
const objectFreeze = Object.freeze;
const bufferFrom = Buffer.from;
const bufferIsBuffer = Buffer.isBuffer;

const FAILURE_KEYS = {
  "bridge.capture-invalid": [],
  "bridge.request-too-large": ["limitBytes", "actualBytes"],
  "codec.invalid-utf8": [],
  "codec.invalid-json": [],
  "codec.invalid-shape": ["path", "violation"],
  "contract.unsupported-api-version": ["supportedVersion"],
  "contract.unsupported-protocol-version": ["supportedVersion"],
  "score.unsupported-schema": ["supportedSchema"],
  "score.invalid-structure": ["path", "violation"],
  "codec.depth-limit": ["limit", "actual"],
  "codec.property-limit": ["limit", "actual"],
  "codec.number-out-of-range": ["path"],
  "bridge.handle-unknown": [],
  "bridge.handle-stale": [],
  "bridge.handle-wrong-environment": [],
  "bridge.handle-wrong-thread": [],
  "bridge.handle-reentrant": [],
  "bridge.handle-busy": [],
  "bridge.handle-poisoned": [],
  "bridge.response-too-large": ["limitBytes", "actualBytes"],
  "bridge.panic-contained": [],
  "bridge.internal": [],
} as const;

const COMMAND_FAILURE_KEYS = {
  "command.invalid-envelope": [],
  "command.unsupported-version": [],
  "command.unknown-id": [],
  "command.target-mismatch": [],
  "command.target-not-found": [],
  "command.anchor-not-found": [],
  "command.anchor-wrong-owner": [],
  "command.anchor-self-reference": [],
  "command.reference-conflict": [],
  "command.invalid-range": [],
  "command.range-endpoint-not-found": [],
  "command.range-owner-mismatch": [],
  "command.range-transform-invalid": ["address", "reason"],
  "command.batch-empty": [],
  "command.batch-nested": [],
  "command.resource-limit-exceeded": ["limitKind", "limit", "actual"],
  "command.version-overflow": [],
  "command.internal-error": [],
  "stage3.local-invariant-rejected": [],
  "command.batch-child-rejected": ["failedCommandIndex", "failure"],
} as const;

const STAGE3_METRIC_KEYS = [
  "fullDocumentScans",
  "fullDocumentClones",
  "fullSemanticValidations",
  "fullSnapshotMaterializations",
  "entitiesVisited",
  "entityIndexLookups",
  "ownerIndexLookups",
  "timeIndexComparisons",
  "overlayRecords",
  "orderCollectionsCopied",
  "changeOps",
  "changesetLogicalBytes",
  "affectedAddresses",
  "indexEntriesRemoved",
  "indexEntriesInserted",
  "ffiRequestBytes",
  "ffiResponseBytes",
] as const;

export type StableFailureCodeV1 = keyof typeof FAILURE_KEYS;

export interface StableFailureWireV1 {
  readonly failureVersion: 1;
  readonly code: StableFailureCodeV1;
  readonly [key: string]: unknown;
}

export interface KernelCreateSuccessWireV1 {
  readonly apiVersion: 1;
  readonly status: "created";
  readonly value: {
    readonly documentId: string;
    readonly documentVersion: 0;
  };
}

export interface KernelRejectedWireV1 {
  readonly apiVersion: 1;
  readonly status: "rejected";
  readonly failure: StableFailureWireV1;
}

export interface KernelReadSuccessWireV1 {
  readonly apiVersion: 1;
  readonly status: "ok";
  readonly value: {
    readonly snapshot: {
      readonly documentId: string;
      readonly schemaVersion: "brilliant-score-1";
      readonly documentVersion: number;
      readonly document: unknown;
    };
    readonly history: { readonly undoDepth: 0; readonly redoDepth: 0 };
    readonly dirty: false;
  };
}

export type KernelCreateWireV1 =
  | KernelCreateSuccessWireV1
  | KernelRejectedWireV1;
export type KernelReadWireV1 = KernelReadSuccessWireV1 | KernelRejectedWireV1;

export type KernelStage3CommandFailureCodeV1 = keyof typeof COMMAND_FAILURE_KEYS;

export interface KernelStage3CommandFailureWireV1 {
  readonly code: KernelStage3CommandFailureCodeV1;
  readonly [key: string]: unknown;
}

export type ScoreEntityTargetWireV1 = Readonly<Record<string, unknown>> & {
  readonly kind: "document" | "measure" | "part" | "staff" | "voice" | "event" | "note";
};

export type KernelStage3MetricsWireV1 = Readonly<
  Record<(typeof STAGE3_METRIC_KEYS)[number], number>
>;

export interface KernelStage3SubmitValueWireV1 {
  readonly documentVersion: number;
  readonly affected: readonly ScoreEntityTargetWireV1[];
  readonly metrics: KernelStage3MetricsWireV1;
}

export type KernelStage3SubmitWireV1 =
  | {
      readonly apiVersion: 1;
      readonly status: "committed" | "no-op";
      readonly value: KernelStage3SubmitValueWireV1;
    }
  | {
      readonly apiVersion: 1;
      readonly status: "command-rejected";
      readonly value: {
        readonly documentVersion: number;
        readonly metrics: KernelStage3MetricsWireV1;
      };
      readonly failure: KernelStage3CommandFailureWireV1;
    }
  | KernelRejectedWireV1;

declare const OPAQUE_RKP1_HANDLE: unique symbol;
export type OpaqueKernelSessionHandle = object & {
  readonly [OPAQUE_RKP1_HANDLE]: true;
};

export interface RustKernelSmokeNativeAddon {
  readonly createKernelSessionV1: (requestBytes: unknown) => unknown;
  readonly readKernelSessionV1: (handle: unknown) => unknown;
}

export interface RustKernelStage3NativeAddon extends RustKernelSmokeNativeAddon {
  readonly submitKernelStage3V1: (handle: unknown, requestBytes: unknown) => unknown;
}

export type RustKernelSmokeCreateOutcome =
  | {
      readonly result: KernelCreateSuccessWireV1;
      readonly handle: OpaqueKernelSessionHandle;
    }
  | { readonly result: KernelRejectedWireV1 };

interface NativeCreateEnvelope {
  readonly payload: Buffer;
  readonly handle?: object;
}

function frozenFailure(code: StableFailureCodeV1): StableFailureWireV1 {
  return reflectApply(objectFreeze, Object, [
    { failureVersion: 1 as const, code },
  ]) as StableFailureWireV1;
}

function rejectedCreate(code: StableFailureCodeV1): RustKernelSmokeCreateOutcome {
  const result = reflectApply(objectFreeze, Object, [
    {
      apiVersion: API_VERSION,
      status: "rejected" as const,
      failure: frozenFailure(code),
    },
  ]) as KernelRejectedWireV1;
  return reflectApply(objectFreeze, Object, [{ result }]) as {
    readonly result: KernelRejectedWireV1;
  };
}

function rejectedRead(code: StableFailureCodeV1): KernelRejectedWireV1 {
  return reflectApply(objectFreeze, Object, [
    {
      apiVersion: API_VERSION,
      status: "rejected" as const,
      failure: frozenFailure(code),
    },
  ]) as KernelRejectedWireV1;
}

function rejectedByteLimit(
  code: "bridge.request-too-large" | "bridge.response-too-large",
  actualBytes: number,
): KernelRejectedWireV1 {
  const failure = reflectApply(objectFreeze, Object, [
    {
      failureVersion: 1 as const,
      code,
      limitBytes:
        code === "bridge.request-too-large"
          ? REQUEST_BYTE_LIMIT
          : RESPONSE_BYTE_LIMIT,
      actualBytes,
    },
  ]) as StableFailureWireV1;
  return reflectApply(objectFreeze, Object, [
    { apiVersion: API_VERSION, status: "rejected" as const, failure },
  ]) as KernelRejectedWireV1;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = reflectOwnKeys(value);
  return (
    actual.length === keys.length &&
    actual.every((key, index) => typeof key === "string" && key === keys[index])
  );
}

function isSafeNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && typeof value === "number" && value >= 0;
}

function isStablePath(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length <= 64 &&
    value.every(
      (segment) =>
        (typeof segment === "string" && segment.length > 0 && segment.length <= 128) ||
        isSafeNonNegativeInteger(segment),
    )
  );
}

function isStableId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isScoreEntityTarget(value: unknown): value is ScoreEntityTargetWireV1 {
  if (!isRecord(value) || typeof value.kind !== "string") {
    return false;
  }
  const idKey = {
    document: "documentId",
    measure: "measureId",
    part: "partId",
    staff: "staffId",
    voice: "voiceId",
    event: "eventId",
    note: "noteId",
  }[value.kind];
  return (
    idKey !== undefined &&
    hasExactKeys(value, ["kind", idKey]) &&
    isStableId(value[idKey])
  );
}

function isStage3Metrics(value: unknown): value is KernelStage3MetricsWireV1 {
  return (
    isRecord(value) &&
    hasExactKeys(value, STAGE3_METRIC_KEYS) &&
    STAGE3_METRIC_KEYS.every((key) => isSafeNonNegativeInteger(value[key]))
  );
}

function isStage3CommandFailure(
  value: unknown,
  allowBatchWrapper = true,
): value is KernelStage3CommandFailureWireV1 {
  if (!isRecord(value) || typeof value.code !== "string") {
    return false;
  }
  if (!(value.code in COMMAND_FAILURE_KEYS)) {
    return false;
  }
  const code = value.code as KernelStage3CommandFailureCodeV1;
  if (!hasExactKeys(value, ["code", ...COMMAND_FAILURE_KEYS[code]])) {
    return false;
  }
  switch (code) {
    case "command.range-transform-invalid":
      return (
        isRecord(value.address) &&
        hasExactKeys(value.address, ["kind", "noteId"]) &&
        value.address.kind === "note" &&
        isStableId(value.address.noteId) &&
        [
          "written-pitch-invalid",
          "transposition-component-invalid",
          "derived-pitch-alter-out-of-range",
          "derived-pitch-octave-out-of-range",
        ].includes(String(value.reason))
      );
    case "command.resource-limit-exceeded":
      return (
        [
          "input-depth",
          "input-properties",
          "batch-children",
          "effects",
          "affected-addresses",
          "changeset-logical-bytes",
        ].includes(String(value.limitKind)) &&
        isSafeNonNegativeInteger(value.limit) &&
        isSafeNonNegativeInteger(value.actual)
      );
    case "command.batch-child-rejected":
      return (
        allowBatchWrapper &&
        isSafeNonNegativeInteger(value.failedCommandIndex) &&
        isStage3CommandFailure(value.failure, false)
      );
    default:
      return true;
  }
}

function isFailure(value: unknown): value is StableFailureWireV1 {
  if (!isRecord(value) || value.failureVersion !== 1 || typeof value.code !== "string") {
    return false;
  }
  if (!(value.code in FAILURE_KEYS)) {
    return false;
  }
  const code = value.code as StableFailureCodeV1;
  const additionalKeys = FAILURE_KEYS[code];
  if (!hasExactKeys(value, ["failureVersion", "code", ...additionalKeys])) {
    return false;
  }
  switch (code) {
    case "bridge.request-too-large":
    case "bridge.response-too-large":
      return (
        value.limitBytes === REQUEST_BYTE_LIMIT &&
        isSafeNonNegativeInteger(value.actualBytes)
      );
    case "codec.invalid-shape":
      return (
        isStablePath(value.path) &&
        ["missing-field", "extra-field", "duplicate-field", "wrong-type", "invalid-tag"].includes(
          String(value.violation),
        )
      );
    case "score.invalid-structure":
      return (
        isStablePath(value.path) &&
        ["duplicate-id", "invalid-reference", "invalid-value"].includes(
          String(value.violation),
        )
      );
    case "contract.unsupported-api-version":
    case "contract.unsupported-protocol-version":
      return value.supportedVersion === 1;
    case "score.unsupported-schema":
      return value.supportedSchema === "brilliant-score-1";
    case "codec.depth-limit":
      return value.limit === 64 && isSafeNonNegativeInteger(value.actual);
    case "codec.property-limit":
      return value.limit === 1_572_864 && isSafeNonNegativeInteger(value.actual);
    case "codec.number-out-of-range":
      return isStablePath(value.path);
    default:
      return true;
  }
}

function isRejected(value: unknown): value is KernelRejectedWireV1 {
  return (
    isRecord(value) &&
    hasExactKeys(value, ["apiVersion", "status", "failure"]) &&
    value.apiVersion === API_VERSION &&
    value.status === "rejected" &&
    isFailure(value.failure)
  );
}

function isCreateResult(value: unknown): value is KernelCreateWireV1 {
  if (isRejected(value)) {
    return true;
  }
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["apiVersion", "status", "value"]) ||
    value.apiVersion !== API_VERSION ||
    value.status !== "created" ||
    !isRecord(value.value) ||
    !hasExactKeys(value.value, ["documentId", "documentVersion"])
  ) {
    return false;
  }
  return typeof value.value.documentId === "string" && value.value.documentVersion === 0;
}

function isReadResult(value: unknown): value is KernelReadWireV1 {
  if (isRejected(value)) {
    return true;
  }
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["apiVersion", "status", "value"]) ||
    value.apiVersion !== API_VERSION ||
    value.status !== "ok" ||
    !isRecord(value.value) ||
    !hasExactKeys(value.value, ["snapshot", "history", "dirty"]) ||
    value.value.dirty !== false
  ) {
    return false;
  }
  const snapshot = value.value.snapshot;
  const history = value.value.history;
  return (
    isRecord(snapshot) &&
    hasExactKeys(snapshot, [
      "documentId",
      "schemaVersion",
      "documentVersion",
      "document",
    ]) &&
    typeof snapshot.documentId === "string" &&
    snapshot.schemaVersion === "brilliant-score-1" &&
    isSafeNonNegativeInteger(snapshot.documentVersion) &&
    isRecord(snapshot.document) &&
    isRecord(history) &&
    hasExactKeys(history, ["undoDepth", "redoDepth"]) &&
    history.undoDepth === 0 &&
    history.redoDepth === 0
  );
}

function isStage3SubmitResult(value: unknown): value is KernelStage3SubmitWireV1 {
  if (isRejected(value)) {
    return true;
  }
  if (
    !isRecord(value) ||
    value.apiVersion !== API_VERSION ||
    typeof value.status !== "string"
  ) {
    return false;
  }
  if (value.status === "committed" || value.status === "no-op") {
    if (
      !hasExactKeys(value, ["apiVersion", "status", "value"]) ||
      !isRecord(value.value) ||
      !hasExactKeys(value.value, ["documentVersion", "affected", "metrics"]) ||
      !isSafeNonNegativeInteger(value.value.documentVersion) ||
      !Array.isArray(value.value.affected) ||
      value.value.affected.length > 131_072 ||
      !value.value.affected.every(isScoreEntityTarget) ||
      !isStage3Metrics(value.value.metrics)
    ) {
      return false;
    }
    return value.status === "committed" || value.value.affected.length === 0;
  }
  return (
    value.status === "command-rejected" &&
    hasExactKeys(value, ["apiVersion", "status", "value", "failure"]) &&
    isRecord(value.value) &&
    hasExactKeys(value.value, ["documentVersion", "metrics"]) &&
    isSafeNonNegativeInteger(value.value.documentVersion) &&
    isStage3Metrics(value.value.metrics) &&
    isStage3CommandFailure(value.failure)
  );
}

function decodePayload<T>(payload: unknown, validate: (value: unknown) => value is T): T | undefined {
  if (!reflectApply(bufferIsBuffer, Buffer, [payload])) {
    return undefined;
  }
  try {
    if ((payload as Buffer).byteLength > RESPONSE_BYTE_LIMIT) {
      return undefined;
    }
    const detached = reflectApply(bufferFrom, Buffer, [payload]) as Buffer;
    const text = new TextDecoder("utf-8", { fatal: true }).decode(detached);
    const parsed = reflectApply(jsonParse, JSON, [text]) as unknown;
    const captured = captureStrictInput(parsed, "native-wire-v1");
    if (captured.status !== "captured" || !validate(captured.value)) {
      return undefined;
    }
    return captured.value;
  } catch {
    return undefined;
  }
}

function readCreateEnvelope(value: unknown): NativeCreateEnvelope | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const keys = reflectOwnKeys(value);
  if (
    keys.length < 1 ||
    keys.length > 2 ||
    keys[0] !== "payload" ||
    (keys.length === 2 && keys[1] !== "handle")
  ) {
    return undefined;
  }
  const payload = reflectGetOwnPropertyDescriptor(value, "payload");
  const handle = reflectGetOwnPropertyDescriptor(value, "handle");
  if (
    payload === undefined ||
    !("value" in payload) ||
    !reflectApply(bufferIsBuffer, Buffer, [payload.value]) ||
    (handle !== undefined && (!("value" in handle) || handle.value === null || typeof handle.value !== "object"))
  ) {
    return undefined;
  }
  return handle === undefined
    ? { payload: payload.value as Buffer }
    : { payload: payload.value as Buffer, handle: handle.value as object };
}

export function createRustKernelSmokeSession(
  addon: RustKernelSmokeNativeAddon,
  document: unknown,
): RustKernelSmokeCreateOutcome {
  const captured = captureStrictInput(document, "native-wire-v1");
  if (captured.status !== "captured") {
    return rejectedCreate("bridge.capture-invalid");
  }

  let requestBytes: Buffer;
  try {
    const requestText = reflectApply(jsonStringify, JSON, [
      { apiVersion: API_VERSION, document: captured.value },
    ]) as string | undefined;
    if (requestText === undefined) {
      return rejectedCreate("bridge.capture-invalid");
    }
    requestBytes = reflectApply(bufferFrom, Buffer, [requestText, "utf8"]) as Buffer;
  } catch {
    return rejectedCreate("bridge.capture-invalid");
  }
  if (requestBytes.byteLength > REQUEST_BYTE_LIMIT) {
    const failure = reflectApply(objectFreeze, Object, [
      {
        failureVersion: 1 as const,
        code: "bridge.request-too-large" as const,
        limitBytes: REQUEST_BYTE_LIMIT,
        actualBytes: requestBytes.byteLength,
      },
    ]) as StableFailureWireV1;
    const result = reflectApply(objectFreeze, Object, [
      { apiVersion: API_VERSION, status: "rejected" as const, failure },
    ]) as KernelRejectedWireV1;
    return reflectApply(objectFreeze, Object, [{ result }]) as {
      readonly result: KernelRejectedWireV1;
    };
  }

  let nativeEnvelope: NativeCreateEnvelope | undefined;
  try {
    nativeEnvelope = readCreateEnvelope(addon.createKernelSessionV1(requestBytes));
  } catch {
    return rejectedCreate("bridge.internal");
  }
  if (nativeEnvelope === undefined) {
    return rejectedCreate("bridge.internal");
  }
  const result = decodePayload(nativeEnvelope.payload, isCreateResult);
  if (result === undefined) {
    return rejectedCreate("bridge.internal");
  }
  if (result.status === "rejected") {
    return nativeEnvelope.handle === undefined
      ? reflectApply(objectFreeze, Object, [{ result }]) as {
          readonly result: KernelRejectedWireV1;
        }
      : rejectedCreate("bridge.internal");
  }
  if (nativeEnvelope.handle === undefined || reflectOwnKeys(nativeEnvelope.handle).length !== 0) {
    return rejectedCreate("bridge.internal");
  }
  const handle = reflectApply(objectFreeze, Object, [
    nativeEnvelope.handle,
  ]) as OpaqueKernelSessionHandle;
  return reflectApply(objectFreeze, Object, [{ result, handle }]) as {
    readonly result: KernelCreateSuccessWireV1;
    readonly handle: OpaqueKernelSessionHandle;
  };
}

export function readRustKernelSmokeSession(
  addon: RustKernelSmokeNativeAddon,
  handle: OpaqueKernelSessionHandle,
): KernelReadWireV1 {
  let payload: unknown;
  try {
    payload = addon.readKernelSessionV1(handle);
  } catch {
    return rejectedRead("bridge.internal");
  }
  return decodePayload(payload, isReadResult) ?? rejectedRead("bridge.internal");
}

export function submitRustKernelSmokeCommand(
  addon: RustKernelStage3NativeAddon,
  handle: OpaqueKernelSessionHandle,
  command: unknown,
): KernelStage3SubmitWireV1 {
  const captured = captureStrictInput(command, "native-wire-v1");
  if (captured.status !== "captured") {
    return rejectedRead("bridge.capture-invalid");
  }

  let requestBytes: Buffer;
  try {
    const requestText = reflectApply(jsonStringify, JSON, [
      { apiVersion: API_VERSION, command: captured.value },
    ]) as string | undefined;
    if (requestText === undefined) {
      return rejectedRead("bridge.capture-invalid");
    }
    requestBytes = reflectApply(bufferFrom, Buffer, [requestText, "utf8"]) as Buffer;
  } catch {
    return rejectedRead("bridge.capture-invalid");
  }
  if (requestBytes.byteLength > REQUEST_BYTE_LIMIT) {
    return rejectedByteLimit("bridge.request-too-large", requestBytes.byteLength);
  }

  let payload: unknown;
  try {
    const detachedRequest = reflectApply(bufferFrom, Buffer, [requestBytes]) as Buffer;
    payload = addon.submitKernelStage3V1(handle, detachedRequest);
  } catch {
    return rejectedRead("bridge.internal");
  }
  if (
    reflectApply(bufferIsBuffer, Buffer, [payload]) &&
    (payload as Buffer).byteLength > RESPONSE_BYTE_LIMIT
  ) {
    return rejectedByteLimit("bridge.response-too-large", (payload as Buffer).byteLength);
  }
  return decodePayload(payload, isStage3SubmitResult) ?? rejectedRead("bridge.internal");
}
