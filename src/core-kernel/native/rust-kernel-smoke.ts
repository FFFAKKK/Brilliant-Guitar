import { captureStrictInput } from "../codec/strict-input-capture";
import { CORE_COMMAND_DEFINITIONS } from "../commands/catalog";
import type { KernelEvent } from "../events/contracts";
import { decodeCommandFailure } from "../reports/strict-codec";

const API_VERSION = 1 as const;
const REQUEST_BYTE_LIMIT = 64 * 1024 * 1024;
const RESPONSE_BYTE_LIMIT = 64 * 1024 * 1024;
const reflectApply = Reflect.apply;
const reflectOwnKeys = Reflect.ownKeys;
const reflectGetOwnPropertyDescriptor = Reflect.getOwnPropertyDescriptor;
const jsonParse = JSON.parse;
const jsonStringify = JSON.stringify;
const objectFreeze = Object.freeze;
const arraySplice = Array.prototype.splice;
const promiseConstructor = Promise;
const promiseResolve = Promise.resolve;
const promiseThen = Promise.prototype.then;
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
  "command.semantic-invalid": ["diagnostics"],
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
  "semanticRulesEvaluated",
  "semanticDependencyReads",
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

const STAGE4_FAILURE_KEYS = {
  "history.empty-undo": [],
  "history.empty-redo": [],
  "history.invariant-violation": [],
  "checkpoint.invalid": [],
  "checkpoint.document-mismatch": [],
  "checkpoint.version-unavailable": [],
  "checkpoint.invariant-violation": [],
  "read.invalid-address": [],
  "read.entity-not-found": [],
  "read.invalid-range": [],
  "read.range-endpoint-not-found": [],
  "read.range-owner-mismatch": [],
  "read.invalid-snapshot": [],
  "read.invariant-violation": [],
  "event.reentrant-write": [],
  "event.sequence-overflow": [],
} as const;

const STAGE4_METRIC_KEYS = [
  "fullSnapshotMaterializations",
  "selectorRecordsVisited",
  "selectorRecordsReturned",
  "checkpointAttempts",
  "checkpointSuccesses",
  "checkpointFailures",
  "checkpointMaterializedBytes",
  "eventsReserved",
  "eventsEmitted",
] as const;

const CORE_COMMAND_IDS = new Set(
  CORE_COMMAND_DEFINITIONS.map((definition) => definition.commandId),
);

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
    readonly history: KernelHistoryStateWireV1;
    readonly dirty: boolean;
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

export interface KernelHistoryStateWireV1 {
  readonly undoDepth: number;
  readonly redoDepth: number;
}

export type KernelStage4FailureCodeV1 = keyof typeof STAGE4_FAILURE_KEYS;

export type KernelStage4FailureWireV1 =
  | KernelStage3CommandFailureWireV1
  | { readonly code: KernelStage4FailureCodeV1 };

export type KernelStage4MetricsWireV1 = Readonly<
  Record<(typeof STAGE4_METRIC_KEYS)[number], number>
>;

export type KernelEventWireV1 = KernelEvent;

export interface KernelStage4MutationValueWireV1 {
  readonly documentVersion: number;
  readonly affected: readonly ScoreEntityTargetWireV1[];
  readonly history: KernelHistoryStateWireV1;
  readonly dirty: boolean;
  readonly metrics: KernelStage3MetricsWireV1;
  readonly stage4Metrics: KernelStage4MetricsWireV1;
}

export type KernelStage4CommandWireV1 =
  | {
      readonly apiVersion: 1;
      readonly status: "committed" | "no-op";
      readonly value: KernelStage4MutationValueWireV1;
      readonly events: readonly KernelEventWireV1[];
    }
  | {
      readonly apiVersion: 1;
      readonly status: "command-rejected";
      readonly value: Omit<KernelStage4MutationValueWireV1, "affected">;
      readonly failure: KernelStage4FailureWireV1;
      readonly events: readonly [];
    };

export type KernelStage4MarkPersistedWireV1 =
  | {
      readonly apiVersion: 1;
      readonly status: "updated" | "no-op";
      readonly value: { readonly documentVersion: number; readonly dirty: boolean };
      readonly events: readonly KernelEventWireV1[];
    }
  | {
      readonly apiVersion: 1;
      readonly status: "checkpoint-rejected";
      readonly value: { readonly documentVersion: number; readonly dirty: boolean };
      readonly failure: KernelStage4FailureWireV1;
      readonly events: readonly [];
    };

export interface KernelStage4ReadSuccessWireV1 {
  readonly apiVersion: 1;
  readonly status: "ok";
  readonly value: {
    readonly snapshot: {
      readonly documentId: string;
      readonly schemaVersion: "brilliant-score-1";
      readonly documentVersion: number;
      readonly document: unknown | null;
    };
    readonly history: KernelHistoryStateWireV1;
    readonly dirty: boolean;
    readonly stage4Metrics: KernelStage4MetricsWireV1;
  };
}

export type KernelStage4ReadWireV1 =
  | KernelStage4ReadSuccessWireV1
  | {
      readonly apiVersion: 1;
      readonly status: "read-rejected";
      readonly failure: KernelStage4FailureWireV1;
    };

export interface KernelStage4SelectWireV1 {
  readonly apiVersion: 1;
  readonly status: "ok";
  readonly value: {
    readonly documentVersion: number;
    readonly selection:
      | { readonly ok: true; readonly value: unknown }
      | { readonly ok: false; readonly failure: KernelStage4FailureWireV1 };
    readonly stage4Metrics: KernelStage4MetricsWireV1;
  };
}

export type KernelStage4OperationWireV1 =
  | KernelStage4CommandWireV1
  | KernelStage4MarkPersistedWireV1
  | KernelStage4ReadWireV1
  | KernelStage4SelectWireV1
  | KernelRejectedWireV1;

export type KernelStage4ReplayCommandWireV1 =
  | {
      readonly status: "committed" | "no-op";
      readonly documentVersion: number;
      readonly history: KernelHistoryStateWireV1;
    }
  | {
      readonly status: "command-rejected";
      readonly documentVersion: number;
      readonly history: KernelHistoryStateWireV1;
      readonly failure: KernelStage4FailureWireV1;
    };

export type KernelStage4ReplayWireV1 =
  | {
      readonly apiVersion: 1;
      readonly status: "replayed";
      readonly finalDocument: unknown;
      readonly documentVersion: number;
      readonly results: readonly KernelStage4ReplayCommandWireV1[];
    }
  | {
      readonly apiVersion: 1;
      readonly status: "rejected";
      readonly finalDocument: unknown;
      readonly documentVersion: number;
      readonly results: readonly KernelStage4ReplayCommandWireV1[];
      readonly failedCommandIndex: number;
      readonly failure: KernelStage4FailureWireV1;
    }
  | {
      readonly apiVersion: 1;
      readonly status: "invalid-initial-document";
      readonly failure: StableFailureWireV1;
    };

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

export interface RustKernelStage4NativeAddon extends RustKernelStage3NativeAddon {
  readonly operateKernelStage4V1: (
    handle: unknown,
    requestBytes: unknown,
  ) => unknown;
}

export interface RustKernelStage4ReplayNativeAddon {
  readonly replayKernelStage4V1: (requestBytes: unknown) => unknown;
}

export interface RustKernelStage4CompleteNativeAddon
  extends RustKernelStage4NativeAddon,
    RustKernelStage4ReplayNativeAddon {}

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

function invalidReplay(
  code:
    | "bridge.capture-invalid"
    | "bridge.request-too-large"
    | "bridge.response-too-large"
    | "bridge.internal",
  actualBytes?: number,
): KernelStage4ReplayWireV1 {
  const failure =
    code === "bridge.request-too-large" || code === "bridge.response-too-large"
      ? reflectApply(objectFreeze, Object, [
          {
            failureVersion: 1 as const,
            code,
            limitBytes:
              code === "bridge.request-too-large"
                ? REQUEST_BYTE_LIMIT
                : RESPONSE_BYTE_LIMIT,
            actualBytes: actualBytes ?? 0,
          },
        ]) as StableFailureWireV1
      : frozenFailure(code);
  return reflectApply(objectFreeze, Object, [
    {
      apiVersion: API_VERSION,
      status: "invalid-initial-document" as const,
      failure,
    },
  ]) as KernelStage4ReplayWireV1;
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

// Result addresses may name transient candidate entities removed before commit.
// Command targets and live entity identities retain their separate strict checks.
function isAffectedEntityAddress(value: unknown): value is ScoreEntityTargetWireV1 {
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
    typeof value[idKey] === "string"
  );
}

function isStage3Metrics(value: unknown): value is KernelStage3MetricsWireV1 {
  return (
    isRecord(value) &&
    hasExactKeys(value, STAGE3_METRIC_KEYS) &&
    STAGE3_METRIC_KEYS.every((key) => isSafeNonNegativeInteger(value[key]))
  );
}

function isHistoryState(value: unknown): value is KernelHistoryStateWireV1 {
  return (
    isRecord(value) &&
    hasExactKeys(value, ["undoDepth", "redoDepth"]) &&
    isSafeNonNegativeInteger(value.undoDepth) &&
    isSafeNonNegativeInteger(value.redoDepth)
  );
}

function isStage4Metrics(value: unknown): value is KernelStage4MetricsWireV1 {
  return (
    isRecord(value) &&
    hasExactKeys(value, STAGE4_METRIC_KEYS) &&
    STAGE4_METRIC_KEYS.every((key) => isSafeNonNegativeInteger(value[key]))
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
    case "command.semantic-invalid": {
      if (
        !Array.isArray(value.diagnostics) ||
        value.diagnostics.length === 0 ||
        value.diagnostics.length > 4096
      ) {
        return false;
      }
      const decoded = decodeCommandFailure(value);
      return (
        decoded?.code === "command.semantic-invalid" &&
        decoded.diagnostics.every((diagnostic) => isStablePath(diagnostic.path))
      );
    }
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
      if (value.limitKind === "diagnostics") {
        return value.limit === 4096 && value.actual === 4097;
      }
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

function isStage4Failure(value: unknown): value is KernelStage4FailureWireV1 {
  if (isStage3CommandFailure(value)) {
    return true;
  }
  return (
    isRecord(value) &&
    typeof value.code === "string" &&
    value.code in STAGE4_FAILURE_KEYS &&
    hasExactKeys(value, ["code"])
  );
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
    typeof value.value.dirty !== "boolean"
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
    isHistoryState(history)
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
      !value.value.affected.every(isAffectedEntityAddress) ||
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

function isKernelEvent(value: unknown): value is KernelEventWireV1 {
  if (
    !isRecord(value) ||
    value.eventVersion !== 1 ||
    !isSafeNonNegativeInteger(value.eventSequence) ||
    !isStableId(value.documentId) ||
    !isSafeNonNegativeInteger(value.documentVersion)
  ) {
    return false;
  }
  if (value.eventType === "core.document.committed") {
    return (
      hasExactKeys(value, [
        "eventVersion",
        "eventSequence",
        "eventType",
        "documentId",
        "documentVersion",
        "cause",
        "commandId",
        "affectedEntities",
      ]) &&
      ["submit", "undo", "redo"].includes(String(value.cause)) &&
      typeof value.commandId === "string" &&
      CORE_COMMAND_IDS.has(value.commandId as never) &&
      Array.isArray(value.affectedEntities) &&
      value.affectedEntities.length <= 131_072 &&
      value.affectedEntities.every(isAffectedEntityAddress)
    );
  }
  return (
    value.eventType === "core.session.dirty-state-changed" &&
    hasExactKeys(value, [
      "eventVersion",
      "eventSequence",
      "eventType",
      "documentId",
      "documentVersion",
      "cause",
      "dirty",
    ]) &&
    ["submit", "undo", "redo", "mark-persisted"].includes(
      String(value.cause),
    ) &&
    typeof value.dirty === "boolean"
  );
}

function isEventArray(value: unknown): value is readonly KernelEventWireV1[] {
  return (
    Array.isArray(value) &&
    value.length <= 2 &&
    value.every(isKernelEvent)
  );
}

function isStage4MutationValue(
  value: unknown,
): value is KernelStage4MutationValueWireV1 {
  return (
    isRecord(value) &&
    hasExactKeys(value, [
      "documentVersion",
      "affected",
      "history",
      "dirty",
      "metrics",
      "stage4Metrics",
    ]) &&
    isSafeNonNegativeInteger(value.documentVersion) &&
    Array.isArray(value.affected) &&
    value.affected.length <= 131_072 &&
    value.affected.every(isAffectedEntityAddress) &&
    isHistoryState(value.history) &&
    typeof value.dirty === "boolean" &&
    isStage3Metrics(value.metrics) &&
    isStage4Metrics(value.stage4Metrics)
  );
}

function isStage4RejectedValue(
  value: unknown,
): value is Omit<KernelStage4MutationValueWireV1, "affected"> {
  return (
    isRecord(value) &&
    hasExactKeys(value, [
      "documentVersion",
      "history",
      "dirty",
      "metrics",
      "stage4Metrics",
    ]) &&
    isSafeNonNegativeInteger(value.documentVersion) &&
    isHistoryState(value.history) &&
    typeof value.dirty === "boolean" &&
    isStage3Metrics(value.metrics) &&
    isStage4Metrics(value.stage4Metrics)
  );
}

function isStage4CommandResult(value: unknown): value is KernelStage4CommandWireV1 {
  if (
    !isRecord(value) ||
    value.apiVersion !== API_VERSION ||
    typeof value.status !== "string"
  ) {
    return false;
  }
  if (value.status === "committed" || value.status === "no-op") {
    return (
      hasExactKeys(value, ["apiVersion", "status", "value", "events"]) &&
      isStage4MutationValue(value.value) &&
      isEventArray(value.events) &&
      (value.status === "committed"
        ? value.events.length >= 1
        : value.events.length === 0 && value.value.affected.length === 0)
    );
  }
  return (
    value.status === "command-rejected" &&
    hasExactKeys(value, ["apiVersion", "status", "value", "failure", "events"]) &&
    isStage4RejectedValue(value.value) &&
    isStage4Failure(value.failure) &&
    Array.isArray(value.events) &&
    value.events.length === 0
  );
}

function isStage4MarkPersistedResult(
  value: unknown,
): value is KernelStage4MarkPersistedWireV1 {
  if (
    !isRecord(value) ||
    value.apiVersion !== API_VERSION ||
    typeof value.status !== "string" ||
    !isRecord(value.value) ||
    !hasExactKeys(value.value, ["documentVersion", "dirty"]) ||
    !isSafeNonNegativeInteger(value.value.documentVersion) ||
    typeof value.value.dirty !== "boolean"
  ) {
    return false;
  }
  if (value.status === "updated" || value.status === "no-op") {
    if (
      !hasExactKeys(value, ["apiVersion", "status", "value", "events"]) ||
      !isEventArray(value.events) ||
      value.events.length > 1
    ) {
      return false;
    }
    if (value.status === "no-op" || value.events.length === 0) {
      return value.events.length === 0;
    }
    const [event] = value.events;
    return (
      event?.eventType === "core.session.dirty-state-changed" &&
      event.cause === "mark-persisted" &&
      event.documentVersion === value.value.documentVersion &&
      event.dirty === value.value.dirty
    );
  }
  return (
    value.status === "checkpoint-rejected" &&
    hasExactKeys(value, ["apiVersion", "status", "value", "failure", "events"]) &&
    isStage4Failure(value.failure) &&
    Array.isArray(value.events) &&
    value.events.length === 0
  );
}

function isStage4ReadResult(value: unknown): value is KernelStage4ReadWireV1 {
  if (
    !isRecord(value) ||
    value.apiVersion !== API_VERSION ||
    typeof value.status !== "string"
  ) {
    return false;
  }
  if (value.status === "read-rejected") {
    return (
      hasExactKeys(value, ["apiVersion", "status", "failure"]) &&
      isStage4Failure(value.failure)
    );
  }
  if (
    value.status !== "ok" ||
    !hasExactKeys(value, ["apiVersion", "status", "value"]) ||
    !isRecord(value.value) ||
    !hasExactKeys(value.value, ["snapshot", "history", "dirty", "stage4Metrics"]) ||
    !isHistoryState(value.value.history) ||
    typeof value.value.dirty !== "boolean" ||
    !isStage4Metrics(value.value.stage4Metrics) ||
    !isRecord(value.value.snapshot)
  ) {
    return false;
  }
  const snapshot = value.value.snapshot;
  return (
    hasExactKeys(snapshot, [
      "documentId",
      "schemaVersion",
      "documentVersion",
      "document",
    ]) &&
    isStableId(snapshot.documentId) &&
    snapshot.schemaVersion === "brilliant-score-1" &&
    isSafeNonNegativeInteger(snapshot.documentVersion) &&
    (snapshot.document === null || isRecord(snapshot.document))
  );
}

function isSelectorValue(value: unknown): boolean {
  return typeof value === "boolean" || isRecord(value);
}

function isStage4SelectResult(value: unknown): value is KernelStage4SelectWireV1 {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["apiVersion", "status", "value"]) ||
    value.apiVersion !== API_VERSION ||
    value.status !== "ok" ||
    !isRecord(value.value) ||
    !hasExactKeys(value.value, ["documentVersion", "selection", "stage4Metrics"]) ||
    !isSafeNonNegativeInteger(value.value.documentVersion) ||
    !isStage4Metrics(value.value.stage4Metrics) ||
    !isRecord(value.value.selection)
  ) {
    return false;
  }
  const selection = value.value.selection;
  return selection.ok === true
    ? hasExactKeys(selection, ["ok", "value"]) && isSelectorValue(selection.value)
    : selection.ok === false &&
        hasExactKeys(selection, ["ok", "failure"]) &&
        isStage4Failure(selection.failure);
}

function isStage4ReplayCommandResult(
  value: unknown,
): value is KernelStage4ReplayCommandWireV1 {
  if (
    !isRecord(value) ||
    typeof value.status !== "string" ||
    !isSafeNonNegativeInteger(value.documentVersion) ||
    !isHistoryState(value.history)
  ) {
    return false;
  }
  if (value.status === "committed" || value.status === "no-op") {
    return hasExactKeys(value, ["status", "documentVersion", "history"]);
  }
  return (
    value.status === "command-rejected" &&
    hasExactKeys(value, ["status", "documentVersion", "history", "failure"]) &&
    isStage4Failure(value.failure)
  );
}

function isStage4ReplayResult(value: unknown): value is KernelStage4ReplayWireV1 {
  if (
    !isRecord(value) ||
    value.apiVersion !== API_VERSION ||
    typeof value.status !== "string"
  ) {
    return false;
  }
  if (value.status === "invalid-initial-document") {
    return (
      hasExactKeys(value, ["apiVersion", "status", "failure"]) &&
      isFailure(value.failure)
    );
  }
  if (
    !isRecord(value.finalDocument) ||
    !isSafeNonNegativeInteger(value.documentVersion) ||
    !Array.isArray(value.results) ||
    !value.results.every(isStage4ReplayCommandResult)
  ) {
    return false;
  }
  if (value.status === "replayed") {
    return hasExactKeys(value, [
      "apiVersion",
      "status",
      "finalDocument",
      "documentVersion",
      "results",
    ]);
  }
  if (
    value.status !== "rejected" ||
    !hasExactKeys(value, [
      "apiVersion",
      "status",
      "finalDocument",
      "documentVersion",
      "results",
      "failedCommandIndex",
      "failure",
    ]) ||
    !isSafeNonNegativeInteger(value.failedCommandIndex) ||
    value.failedCommandIndex + 1 !== value.results.length ||
    !isStage4Failure(value.failure)
  ) {
    return false;
  }
  const failed = value.results[value.failedCommandIndex];
  return failed !== undefined && failed.status === "command-rejected";
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

type Stage4ResultValidator<T> = (value: unknown) => value is T;

interface Stage4SnapshotCache {
  readonly documentId: string;
  readonly schemaVersion: "brilliant-score-1";
  readonly documentVersion: number;
  readonly document: unknown;
}

interface Stage4SubscriberRecord {
  readonly handler: RustKernelStage4EventHandler;
  active: boolean;
}

export type RustKernelStage4EventHandler = (
  event: KernelEventWireV1,
) => unknown;

export type RustKernelStage4SubscriptionResult =
  | { readonly status: "subscribed"; readonly unsubscribe: () => void }
  | {
      readonly status: "rejected";
      readonly failure: { readonly code: "event.invalid-handler" };
    };

function isStage4CommandOrRejected(
  value: unknown,
): value is KernelStage4CommandWireV1 | KernelRejectedWireV1 {
  return isRejected(value) || isStage4CommandResult(value);
}

function isStage4CheckpointOrRejected(
  value: unknown,
): value is KernelStage4MarkPersistedWireV1 | KernelRejectedWireV1 {
  return isRejected(value) || isStage4MarkPersistedResult(value);
}

function isStage4ReadOrRejected(
  value: unknown,
): value is KernelStage4ReadWireV1 | KernelRejectedWireV1 {
  return isRejected(value) || isStage4ReadResult(value);
}

function isStage4SelectOrRejected(
  value: unknown,
): value is KernelStage4SelectWireV1 | KernelRejectedWireV1 {
  return isRejected(value) || isStage4SelectResult(value);
}

function freezeLocal<T extends object>(value: T): Readonly<T> {
  return reflectApply(objectFreeze, Object, [value]) as Readonly<T>;
}

const EMPTY_STAGE4_EVENTS = freezeLocal([]) as readonly [];
const ZERO_STAGE3_METRICS = freezeLocal(
  Object.fromEntries(STAGE3_METRIC_KEYS.map((key) => [key, 0])),
) as KernelStage3MetricsWireV1;
const ZERO_STAGE4_METRICS = freezeLocal(
  Object.fromEntries(STAGE4_METRIC_KEYS.map((key) => [key, 0])),
) as KernelStage4MetricsWireV1;
const REENTRANT_FAILURE = freezeLocal({
  code: "event.reentrant-write" as const,
});

function invokeStage4Native<T>(
  addon: RustKernelStage4NativeAddon,
  handle: OpaqueKernelSessionHandle,
  operation: unknown,
  validate: Stage4ResultValidator<T>,
): T | KernelRejectedWireV1 {
  const captured = captureStrictInput(operation, "native-wire-v1");
  if (captured.status !== "captured") {
    return rejectedRead("bridge.capture-invalid");
  }

  let requestBytes: Buffer;
  try {
    const requestText = reflectApply(jsonStringify, JSON, [
      { apiVersion: API_VERSION, operation: captured.value },
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
    payload = addon.operateKernelStage4V1(handle, detachedRequest);
  } catch {
    return rejectedRead("bridge.internal");
  }
  if (
    reflectApply(bufferIsBuffer, Buffer, [payload]) &&
    (payload as Buffer).byteLength > RESPONSE_BYTE_LIMIT
  ) {
    return rejectedByteLimit("bridge.response-too-large", (payload as Buffer).byteLength);
  }
  return decodePayload(payload, validate) ?? rejectedRead("bridge.internal");
}

/**
 * Private Stage-4 evidence adapter. It is deliberately absent from the Core
 * public root and does not switch the product runtime away from TypeScript.
 */
export class RustKernelStage4Session {
  private snapshotCache: Stage4SnapshotCache | undefined;
  private history: KernelHistoryStateWireV1 = freezeLocal({
    undoDepth: 0,
    redoDepth: 0,
  });
  private dirty = false;
  private documentVersion = 0;
  private dispatchDepth = 0;
  private readonly subscribers: Stage4SubscriberRecord[] = [];

  public constructor(
    private readonly addon: RustKernelStage4NativeAddon,
    private readonly handle: OpaqueKernelSessionHandle,
  ) {}

  public submit(
    command: unknown,
  ): KernelStage4CommandWireV1 | KernelRejectedWireV1 {
    if (this.dispatchDepth > 0) {
      return this.reentrantCommandResult();
    }
    const result = invokeStage4Native(
      this.addon,
      this.handle,
      { kind: "submit", command },
      isStage4CommandOrRejected,
    );
    return this.acceptCommandResult(result);
  }

  public undo(): KernelStage4CommandWireV1 | KernelRejectedWireV1 {
    if (this.dispatchDepth > 0) {
      return this.reentrantCommandResult();
    }
    const result = invokeStage4Native(
      this.addon,
      this.handle,
      { kind: "undo" },
      isStage4CommandOrRejected,
    );
    return this.acceptCommandResult(result);
  }

  public redo(): KernelStage4CommandWireV1 | KernelRejectedWireV1 {
    if (this.dispatchDepth > 0) {
      return this.reentrantCommandResult();
    }
    const result = invokeStage4Native(
      this.addon,
      this.handle,
      { kind: "redo" },
      isStage4CommandOrRejected,
    );
    return this.acceptCommandResult(result);
  }

  public markPersisted(
    checkpoint: unknown,
  ): KernelStage4MarkPersistedWireV1 | KernelRejectedWireV1 {
    if (this.dispatchDepth > 0) {
      return this.reentrantCheckpointResult();
    }
    const result = invokeStage4Native(
      this.addon,
      this.handle,
      { kind: "mark-persisted", checkpoint },
      isStage4CheckpointOrRejected,
    );
    if (result.status === "rejected") {
      return result;
    }
    this.documentVersion = result.value.documentVersion;
    this.dirty = result.value.dirty;
    this.dispatchEvents(result.events);
    return result;
  }

  public read(): KernelStage4ReadWireV1 | KernelRejectedWireV1 {
    const result = invokeStage4Native(
      this.addon,
      this.handle,
      {
        kind: "read",
        knownSnapshotVersion: this.snapshotCache?.documentVersion ?? null,
      },
      isStage4ReadOrRejected,
    );
    if (result.status !== "ok") {
      return result;
    }

    const nativeSnapshot = result.value.snapshot;
    let snapshot: Stage4SnapshotCache;
    if (nativeSnapshot.document === null) {
      const cached = this.snapshotCache;
      if (
        cached === undefined ||
        cached.documentId !== nativeSnapshot.documentId ||
        cached.schemaVersion !== nativeSnapshot.schemaVersion ||
        cached.documentVersion !== nativeSnapshot.documentVersion
      ) {
        return rejectedRead("bridge.internal");
      }
      snapshot = cached;
    } else {
      snapshot = nativeSnapshot as Stage4SnapshotCache;
      this.snapshotCache = snapshot;
    }

    const value = freezeLocal({
      snapshot,
      history: result.value.history,
      dirty: result.value.dirty,
      stage4Metrics: result.value.stage4Metrics,
    });
    const accepted = freezeLocal({
      apiVersion: API_VERSION,
      status: "ok" as const,
      value,
    }) as KernelStage4ReadSuccessWireV1;
    this.documentVersion = snapshot.documentVersion;
    this.history = result.value.history;
    this.dirty = result.value.dirty;
    return accepted;
  }

  public select(
    selector: unknown,
  ): KernelStage4SelectWireV1 | KernelRejectedWireV1 {
    return invokeStage4Native(
      this.addon,
      this.handle,
      { kind: "select", selector },
      isStage4SelectOrRejected,
    );
  }

  public subscribe(
    handler: RustKernelStage4EventHandler,
  ): RustKernelStage4SubscriptionResult;
  public subscribe(handler: unknown): RustKernelStage4SubscriptionResult;
  public subscribe(handler: unknown): RustKernelStage4SubscriptionResult {
    if (typeof handler !== "function") {
      return freezeLocal({
        status: "rejected" as const,
        failure: freezeLocal({ code: "event.invalid-handler" as const }),
      });
    }
    const record: Stage4SubscriberRecord = {
      handler: handler as RustKernelStage4EventHandler,
      active: true,
    };
    this.subscribers[this.subscribers.length] = record;
    const unsubscribe = (): void => {
      if (!record.active) {
        return;
      }
      record.active = false;
      for (let index = 0; index < this.subscribers.length; index += 1) {
        if (this.subscribers[index] === record) {
          reflectApply(arraySplice, this.subscribers, [index, 1]);
          break;
        }
      }
    };
    reflectApply(objectFreeze, Object, [unsubscribe]);
    return freezeLocal({ status: "subscribed" as const, unsubscribe });
  }

  private acceptCommandResult(
    result: KernelStage4CommandWireV1 | KernelRejectedWireV1,
  ): KernelStage4CommandWireV1 | KernelRejectedWireV1 {
    if (result.status === "rejected") {
      return result;
    }
    this.documentVersion = result.value.documentVersion;
    this.history = result.value.history;
    this.dirty = result.value.dirty;
    if (result.status === "committed") {
      this.snapshotCache = undefined;
    }
    this.dispatchEvents(result.events);
    return result;
  }

  private dispatchEvents(events: readonly KernelEventWireV1[]): void {
    for (let eventIndex = 0; eventIndex < events.length; eventIndex += 1) {
      const event = events[eventIndex];
      if (event === undefined) {
        continue;
      }
      const snapshot: Stage4SubscriberRecord[] = [];
      for (let index = 0; index < this.subscribers.length; index += 1) {
        const record = this.subscribers[index];
        if (record !== undefined && record.active) {
          snapshot[snapshot.length] = record;
        }
      }
      this.dispatchDepth += 1;
      try {
        for (let index = 0; index < snapshot.length; index += 1) {
          const record = snapshot[index];
          if (record === undefined) {
            continue;
          }
          try {
            const returned = reflectApply(record.handler, undefined, [event]);
            const adopted = reflectApply(promiseResolve, promiseConstructor, [
              returned,
            ]) as Promise<unknown>;
            reflectApply(promiseThen, adopted, [undefined, () => undefined]);
          } catch {
            // Subscriber failures are intentionally isolated from native state and later handlers.
          }
        }
      } finally {
        this.dispatchDepth -= 1;
      }
    }
  }

  private reentrantCommandResult(): KernelStage4CommandWireV1 {
    const value = freezeLocal({
      documentVersion: this.documentVersion,
      history: this.history,
      dirty: this.dirty,
      metrics: ZERO_STAGE3_METRICS,
      stage4Metrics: ZERO_STAGE4_METRICS,
    });
    return freezeLocal({
      apiVersion: API_VERSION,
      status: "command-rejected" as const,
      value,
      failure: REENTRANT_FAILURE,
      events: EMPTY_STAGE4_EVENTS,
    });
  }

  private reentrantCheckpointResult(): KernelStage4MarkPersistedWireV1 {
    const value = freezeLocal({
      documentVersion: this.documentVersion,
      dirty: this.dirty,
    });
    return freezeLocal({
      apiVersion: API_VERSION,
      status: "checkpoint-rejected" as const,
      value,
      failure: REENTRANT_FAILURE,
      events: EMPTY_STAGE4_EVENTS,
    });
  }
}

export function createRustKernelStage4Session(
  addon: RustKernelStage4NativeAddon,
  handle: OpaqueKernelSessionHandle,
): RustKernelStage4Session {
  return new RustKernelStage4Session(addon, handle);
}

/**
 * Runs a detached command list in one fresh native session. Replay has no
 * access to live handles or JavaScript subscriber registries.
 */
export function replayRustKernelStage4(
  addon: RustKernelStage4ReplayNativeAddon,
  initialDocument: unknown,
  commands: unknown,
): KernelStage4ReplayWireV1 {
  const captured = captureStrictInput(
    { initialDocument, commands },
    "native-wire-v1",
  );
  if (captured.status !== "captured" || !isRecord(captured.value)) {
    return invalidReplay("bridge.capture-invalid");
  }

  let requestBytes: Buffer;
  try {
    const requestText = reflectApply(jsonStringify, JSON, [
      {
        apiVersion: API_VERSION,
        initialDocument: captured.value.initialDocument,
        commands: captured.value.commands,
      },
    ]) as string | undefined;
    if (requestText === undefined) {
      return invalidReplay("bridge.capture-invalid");
    }
    requestBytes = reflectApply(bufferFrom, Buffer, [requestText, "utf8"]) as Buffer;
  } catch {
    return invalidReplay("bridge.capture-invalid");
  }
  if (requestBytes.byteLength > REQUEST_BYTE_LIMIT) {
    return invalidReplay("bridge.request-too-large", requestBytes.byteLength);
  }

  let payload: unknown;
  try {
    const detachedRequest = reflectApply(bufferFrom, Buffer, [requestBytes]) as Buffer;
    payload = addon.replayKernelStage4V1(detachedRequest);
  } catch {
    return invalidReplay("bridge.internal");
  }
  if (
    reflectApply(bufferIsBuffer, Buffer, [payload]) &&
    (payload as Buffer).byteLength > RESPONSE_BYTE_LIMIT
  ) {
    return invalidReplay("bridge.response-too-large", (payload as Buffer).byteLength);
  }
  return decodePayload(payload, isStage4ReplayResult) ?? invalidReplay("bridge.internal");
}
