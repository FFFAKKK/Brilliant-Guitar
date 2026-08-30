import { spawn, spawnSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

import { encodeScoreDocumentJson } from "../../../src/core-kernel/codec/score-json";
import { createStressCvn7Score } from "../fixtures/cvn-7-qualification-score";

export const PRIVATE_SCALE_TEST_NAME =
  "indices::tests::rkp2_stage_6_private_scale_evidence_v1" as const;
export const PRIVATE_SCALE_REQUEST_ENV = "BRILLIANT_RKP2_SCALE_REQUEST_V1" as const;
export const PRIVATE_SCALE_RUST_PREFIX = "BRILLIANT_RKP2_SCALE_RUST_V1:" as const;
export const PRIVATE_SCALE_PROCESS_PREFIX = "BRILLIANT_RKP2_SCALE_PROCESS_V1:" as const;
export const PRIVATE_SCALE_TIMEOUT_MS = 180_000 as const;
export const PRIVATE_SCALE_POLL_INTERVAL_MS = 25 as const;
export const PRIVATE_SCALE_STREAM_LIMIT_BYTES = 1_048_576 as const;
export const PRIVATE_SCALE_REAP_TIMEOUT_MS = 5_000 as const;
export const PRIVATE_SCALE_TERMINATION_BUDGET_MS = 5_000 as const;
export const PRIVATE_SCALE_CLEANUP_BUDGET_MS = 5_000 as const;
export const PRIVATE_SCALE_OUTER_CUSHION_MS = 10_000 as const;
export const PRIVATE_SCALE_OUTER_TIMEOUT_MS =
  PRIVATE_SCALE_TIMEOUT_MS +
  PRIVATE_SCALE_TERMINATION_BUDGET_MS +
  PRIVATE_SCALE_REAP_TIMEOUT_MS +
  PRIVATE_SCALE_CLEANUP_BUDGET_MS +
  PRIVATE_SCALE_OUTER_CUSHION_MS;
export const PRIVATE_SCALE_LEAF_PREFIX = "rkp2-scale-e2-" as const;
export const PRIVATE_SCALE_OWNERSHIP_MARKER = "ownership.json" as const;

export const PRIVATE_SCALE_PROCESS_STATE_REGISTRY = Object.freeze({
  schemaVersion: 1,
  workloadTimeoutMs: PRIVATE_SCALE_TIMEOUT_MS,
  terminationBudgetMs: PRIVATE_SCALE_TERMINATION_BUDGET_MS,
  reapBudgetMs: PRIVATE_SCALE_REAP_TIMEOUT_MS,
  cleanupBudgetMs: PRIVATE_SCALE_CLEANUP_BUDGET_MS,
  outerCushionMs: PRIVATE_SCALE_OUTER_CUSHION_MS,
  outerDeadlineMs: PRIVATE_SCALE_OUTER_TIMEOUT_MS,
  outerDeadlineFormula: "workload-plus-termination-plus-reap-plus-cleanup-plus-cushion",
  workloadDeadlineOwner: "powershell-wrapper",
  nodeWorkloadTermination: "forbidden",
  ownershipStates: ["root-absent", "offered", "accepted-residue", "unknown"] as const,
  terminationStates: ["not-required", "succeeded", "failed"] as const,
  cleanupStates: ["succeeded", "failed"] as const,
});
export const PRIVATE_SCALE_PROCESS_STATE_REGISTRY_SHA256 = createHash("sha256")
  .update(JSON.stringify(PRIVATE_SCALE_PROCESS_STATE_REGISTRY), "utf8")
  .digest("hex");

const MAX_SAFE = Number.MAX_SAFE_INTEGER;
const FAILURE_CODES = [
  "process.start-failed", "process.output-limit-exceeded", "process.timeout", "process.nonzero-exit",
  "process.sentinel-count-invalid", "process.sentinel-malformed", "process.protocol-invalid",
  "process.rss-unavailable", "process.rss-invalid", "evidence.counter-mismatch", "evidence.overflow",
  "evidence.parity-mismatch", "evidence.bytes-mismatch", "evidence.order-mismatch",
  "evidence.payload-mismatch", "process.cleanup-failed",
] as const;
const COUNTER_NAMES = [
  "entitiesVisited", "measures", "parts", "staves", "voices", "events", "notes", "extensions",
  "topologyEdgesVisited", "referenceEdgesBuilt", "timeEntriesBuilt", "entityIndexLookups",
  "ownerIndexLookups", "timeIndexComparisons", "indexEntriesBuilt", "indexRebuildEntries",
  "fullDocumentMaterializations", "canonicalEncodeBytes", "entityProbe.entityIndexLookupsDelta",
  "entityProbe.otherCounterDelta", "ownerProbe.ownerIndexLookupsDelta", "ownerProbe.otherCounterDelta",
] as const;
const NUMERIC_FIELDS = [
  ...COUNTER_NAMES, "canonicalScoreBytes", "createRequestBytes", "workloadElapsedMicros",
  "exitCode", "peakWorkingSetBytes", "stdoutBytes", "stderrBytes",
] as const;

type JsonRecord = Record<string, unknown>;

export type ScaleFailureCode =
  | "process.start-failed"
  | "process.output-limit-exceeded"
  | "process.timeout"
  | "process.nonzero-exit"
  | "process.sentinel-count-invalid"
  | "process.sentinel-malformed"
  | "process.protocol-invalid"
  | "process.rss-unavailable"
  | "process.rss-invalid"
  | "evidence.counter-mismatch"
  | "evidence.overflow"
  | "evidence.parity-mismatch"
  | "evidence.bytes-mismatch"
  | "evidence.order-mismatch"
  | "evidence.payload-mismatch"
  | "process.cleanup-failed";

export interface ScaleFailure {
  readonly code: ScaleFailureCode;
  readonly details: JsonRecord;
}

export interface ScaleEvidenceV1 {
  readonly schemaVersion: 1;
  readonly status: "ok";
  readonly fixtureId: "cvn7-stress-v1";
  readonly counts: JsonRecord;
  readonly bytes: JsonRecord;
  readonly metrics: JsonRecord;
  readonly entityProbe: JsonRecord;
  readonly ownerProbe: JsonRecord;
  readonly parity: JsonRecord;
  readonly roundTrip: JsonRecord;
  readonly ordering: JsonRecord;
  readonly workloadElapsedMicros: number;
}

export interface ScaleProcessState {
  readonly exitCode: number | null;
  readonly timedOut: boolean;
  readonly peakWorkingSetBytes: number | null;
  readonly stdoutBytes: number;
  readonly stderrBytes: number;
  readonly terminationStatus: "not-required" | "succeeded" | "failed";
  readonly reapStatus: "not-required" | "succeeded" | "failed";
  readonly cleanupStatus: "succeeded" | "failed";
}

export type ScaleProcessEnvelope =
  | {
      readonly schemaVersion: 1;
      readonly status: "ok";
      readonly evidence: ScaleEvidenceV1;
      readonly process: ScaleProcessState;
      readonly partialEvidence: false;
    }
  | {
      readonly schemaVersion: 1;
      readonly status: "rejected";
      readonly failure: ScaleFailure;
      readonly process: ScaleProcessState;
      readonly partialEvidence: false;
    };

export interface WorkerResult {
  readonly envelope: Extract<ScaleProcessEnvelope, { readonly status: "ok" }>;
  readonly wallElapsedMicros: number;
}

export interface PowerShellResult {
  readonly stdout: Buffer;
  readonly stderr: Buffer;
  readonly exitCode: number | null;
  readonly timedOut: boolean;
  readonly launchFailed: boolean;
  readonly firstFailure: ScaleFailure | undefined;
  readonly outputLimitStream: "stdout" | "stderr" | undefined;
  readonly terminationStatus: "not-required" | "succeeded" | "failed";
  readonly reapStatus: "not-required" | "succeeded" | "failed";
}

export interface PrivateScaleSpawnDependencies {
  readonly spawnProcess?: typeof spawn;
  readonly now?: () => number;
  readonly setTimer?: typeof setTimeout;
  readonly clearTimer?: typeof clearTimeout;
  /** Test-only override for the system taskkill location; production reads SystemRoot. */
  readonly systemRoot?: string;
}

export type PrivateScaleOwnershipState =
  | "root-absent"
  | "offered"
  | "accepted-residue"
  | "unknown";

interface CargoArtifactMessage {
  readonly reason: unknown;
  readonly target: unknown;
  readonly profile: unknown;
  readonly executable: unknown;
}

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value: JsonRecord, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every((key, index) => actual[index] === key);
}

function safeInteger(value: unknown, positive = false): value is number {
  return Number.isSafeInteger(value) && (positive ? (value as number) > 0 : (value as number) >= 0);
}

function protocolFailure(stage: "arguments" | "cargo-artifact" | "internal" | "process", reason: "shape" | "type" | "range" | "version" | "extra-field" | "identity"): ScaleFailure {
  return { code: "process.protocol-invalid", details: { stage, reason } };
}

function assertExactRecord(value: unknown, keys: readonly string[], stage: "internal" | "process"): JsonRecord {
  if (!isRecord(value)) throw protocolFailure(stage, "shape");
  if (!hasExactKeys(value, keys)) throw protocolFailure(stage, "extra-field");
  return value;
}

function assertExactNumbers(record: JsonRecord, expected: Readonly<Record<string, number>>, counter = false): void {
  for (const [key, value] of Object.entries(expected)) {
    const actual = record[key];
    if (!safeInteger(actual)) {
      throw counter
        ? { code: "evidence.overflow", details: { field: key } } satisfies ScaleFailure
        : protocolFailure("internal", "range");
    }
    if (actual !== value) {
      throw counter
        ? { code: "evidence.counter-mismatch", details: { counter: key, expected: value, actual } } satisfies ScaleFailure
        : { code: "evidence.bytes-mismatch", details: { field: key, expected: value, actual } } satisfies ScaleFailure;
    }
  }
}

const EXPECTED_COUNTS = Object.freeze({
  measures: 400,
  parts: 16,
  staves: 16,
  measureContents: 6_400,
  voices: 12_800,
  events: 102_400,
  notes: 51_200,
  extensions: 18,
  partOwnedExtensions: 16,
  unknownExtensions: 1,
});
const EXPECTED_RECORDS = Object.freeze({
  measures: 400,
  parts: 16,
  staves: 16,
  voices: 12_800,
  events: 102_400,
  notes: 51_200,
  extensions: 18,
});
const EXPECTED_METRICS = Object.freeze({
  entitiesVisited: 166_833,
  topologyEdgesVisited: 173_250,
  referenceEdgesBuilt: 19_216,
  timeEntriesBuilt: 102_400,
  entityIndexLookups: 0,
  ownerIndexLookups: 0,
  timeIndexComparisons: 0,
  indexEntriesBuilt: 474_517,
  indexRebuildEntries: 474_517,
  fullDocumentMaterializations: 1,
  canonicalEncodeBytes: 15_013_904,
});

/** Strictly decodes the private Rust line before any evidence is trusted. */
export function decodeRustEvidenceLine(line: string): ScaleEvidenceV1 {
  if (!line.startsWith(PRIVATE_SCALE_RUST_PREFIX)) throw protocolFailure("internal", "identity");
  let parsed: unknown;
  try {
    parsed = JSON.parse(line.slice(PRIVATE_SCALE_RUST_PREFIX.length));
  } catch {
    throw { code: "process.sentinel-malformed", details: { stage: "json" } } satisfies ScaleFailure;
  }
  const record = assertExactRecord(parsed, [
    "schemaVersion", "status", "fixtureId", "counts", "bytes", "metrics", "entityProbe",
    "ownerProbe", "parity", "roundTrip", "ordering", "workloadElapsedMicros",
  ], "internal");
  if (record.schemaVersion !== 1 || record.status !== "ok" || record.fixtureId !== "cvn7-stress-v1") {
    throw protocolFailure("internal", "version");
  }
  const counts = assertExactRecord(record.counts, Object.keys(EXPECTED_COUNTS), "internal");
  assertExactNumbers(counts, EXPECTED_COUNTS, true);
  const bytes = assertExactRecord(record.bytes, ["canonicalScoreBytes", "createRequestBytes"], "internal");
  assertExactNumbers(bytes, { canonicalScoreBytes: 15_013_904, createRequestBytes: 15_013_932 });
  const metrics = assertExactRecord(record.metrics, [
    "entitiesVisited", "records", "topologyEdgesVisited", "referenceEdgesBuilt", "timeEntriesBuilt",
    "entityIndexLookups", "ownerIndexLookups", "timeIndexComparisons", "indexEntriesBuilt",
    "indexRebuildEntries", "fullDocumentMaterializations", "canonicalEncodeBytes",
  ], "internal");
  const records = assertExactRecord(metrics.records, Object.keys(EXPECTED_RECORDS), "internal");
  assertExactNumbers(records, EXPECTED_RECORDS, true);
  assertExactNumbers(metrics, EXPECTED_METRICS, true);
  const entityProbe = assertExactRecord(record.entityProbe, ["stableId", "entityKind", "entityIndexLookupsDelta", "otherCounterDelta"], "internal");
  const ownerProbe = assertExactRecord(record.ownerProbe, ["entityKind", "ownerKind", "ownerStableId", "ownerIndexLookupsDelta", "otherCounterDelta"], "internal");
  if (entityProbe.stableId !== "cvn7-e-00-0000-0-0" || entityProbe.entityKind !== "event" || entityProbe.entityIndexLookupsDelta !== 1 || entityProbe.otherCounterDelta !== 0 || ownerProbe.entityKind !== "event" || ownerProbe.ownerKind !== "voice" || ownerProbe.ownerStableId !== "cvn7-v-00-0000-0" || ownerProbe.ownerIndexLookupsDelta !== 1 || ownerProbe.otherCounterDelta !== 0) {
    throw { code: "evidence.payload-mismatch", details: { field: "entityProbe" } } satisfies ScaleFailure;
  }
  const parity = assertExactRecord(record.parity, ["normalizedProjectionEqual", "indexEntryCountEqual"], "internal");
  if (parity.normalizedProjectionEqual !== true || parity.indexEntryCountEqual !== true) {
    throw { code: "evidence.parity-mismatch", details: { check: "normalized-index-projection" } } satisfies ScaleFailure;
  }
  const roundTrip = assertExactRecord(record.roundTrip, ["semanticEqual", "canonicalBytesEqual"], "internal");
  if (roundTrip.semanticEqual !== true || roundTrip.canonicalBytesEqual !== true) {
    throw { code: "evidence.payload-mismatch", details: { field: "roundTrip" } } satisfies ScaleFailure;
  }
  const ordering = assertExactRecord(record.ordering, ["topologyCanonical", "extensionsPreserved"], "internal");
  if (ordering.topologyCanonical !== true || ordering.extensionsPreserved !== true) {
    throw { code: "evidence.order-mismatch", details: { field: "topology" } } satisfies ScaleFailure;
  }
  if (!safeInteger(record.workloadElapsedMicros, true)) throw { code: "evidence.overflow", details: { field: "workloadElapsedMicros" } } satisfies ScaleFailure;
  return record as unknown as ScaleEvidenceV1;
}

function decodeProcessState(value: unknown): ScaleProcessState {
  const process = assertExactRecord(value, [
    "exitCode", "timedOut", "peakWorkingSetBytes", "stdoutBytes", "stderrBytes",
    "terminationStatus", "reapStatus", "cleanupStatus",
  ], "process");
  if ((process.exitCode !== null && !safeInteger(process.exitCode)) || typeof process.timedOut !== "boolean" || (process.peakWorkingSetBytes !== null && !safeInteger(process.peakWorkingSetBytes, true)) || !safeInteger(process.stdoutBytes) || !safeInteger(process.stderrBytes) || !["not-required", "succeeded", "failed"].includes(process.terminationStatus as string) || !["not-required", "succeeded", "failed"].includes(process.reapStatus as string) || !["succeeded", "failed"].includes(process.cleanupStatus as string)) {
    throw protocolFailure("process", "type");
  }
  return process as unknown as ScaleProcessState;
}

function decodeFailure(value: unknown): ScaleFailure {
  const failure = assertExactRecord(value, ["code", "details"], "process");
  if (!FAILURE_CODES.includes(failure.code as ScaleFailureCode) || !isRecord(failure.details)) throw protocolFailure("process", "type");
  const details = failure.details;
  const oneOf = (actual: unknown, values: readonly string[]) => typeof actual === "string" && values.includes(actual);
  const safe = (actual: unknown, positive = false) => safeInteger(actual, positive);
  switch (failure.code as ScaleFailureCode) {
    case "process.start-failed":
      if (!hasExactKeys(details, ["stage"]) || details.stage !== "start") throw protocolFailure("process", "identity");
      break;
    case "process.output-limit-exceeded":
      if (!hasExactKeys(details, ["stream", "limitBytes"]) || !oneOf(details.stream, ["stdout", "stderr"]) || details.limitBytes !== PRIVATE_SCALE_STREAM_LIMIT_BYTES) throw protocolFailure("process", "identity");
      break;
    case "process.timeout":
      if (!hasExactKeys(details, ["timeoutMs"]) || details.timeoutMs !== PRIVATE_SCALE_TIMEOUT_MS) throw protocolFailure("process", "identity");
      break;
    case "process.nonzero-exit":
      if (!hasExactKeys(details, ["exitCode"]) || !safe(details.exitCode, true)) throw protocolFailure("process", "range");
      break;
    case "process.sentinel-count-invalid":
      if (!hasExactKeys(details, ["expected", "actual"]) || details.expected !== 1 || !safe(details.actual)) throw protocolFailure("process", "range");
      break;
    case "process.sentinel-malformed":
      if (!hasExactKeys(details, ["stage"]) || details.stage !== "json") throw protocolFailure("process", "identity");
      break;
    case "process.protocol-invalid":
      if (!hasExactKeys(details, ["stage", "reason"]) || !oneOf(details.stage, ["arguments", "cargo-artifact", "internal", "process"]) || !oneOf(details.reason, ["shape", "type", "range", "version", "extra-field", "identity"])) throw protocolFailure("process", "identity");
      break;
    case "process.rss-unavailable":
      if (!hasExactKeys(details, ["stage"]) || !oneOf(details.stage, ["poll", "final-refresh"])) throw protocolFailure("process", "identity");
      break;
    case "process.rss-invalid":
      if (!hasExactKeys(details, ["reason"]) || !oneOf(details.reason, ["zero", "negative", "unsafe-integer"])) throw protocolFailure("process", "identity");
      break;
    case "evidence.counter-mismatch":
      if (!hasExactKeys(details, ["counter", "expected", "actual"]) || !oneOf(details.counter, COUNTER_NAMES) || !safe(details.expected) || !safe(details.actual)) throw protocolFailure("process", "range");
      break;
    case "evidence.overflow":
      if (!hasExactKeys(details, ["field"]) || !oneOf(details.field, NUMERIC_FIELDS)) throw protocolFailure("process", "identity");
      break;
    case "evidence.parity-mismatch":
      if (!hasExactKeys(details, ["check"]) || !oneOf(details.check, ["normalized-index-projection", "index-entry-count"])) throw protocolFailure("process", "identity");
      break;
    case "evidence.bytes-mismatch":
      if (!hasExactKeys(details, ["field", "expected", "actual"]) || !oneOf(details.field, ["canonicalScoreBytes", "createRequestBytes"]) || !safe(details.expected) || !safe(details.actual)) throw protocolFailure("process", "range");
      break;
    case "evidence.order-mismatch":
      if (!hasExactKeys(details, ["field"]) || !oneOf(details.field, ["topology", "extensions"])) throw protocolFailure("process", "identity");
      break;
    case "evidence.payload-mismatch":
      if (!hasExactKeys(details, ["field"]) || !oneOf(details.field, ["fixtureId", "counts", "entityProbe", "ownerProbe", "roundTrip"])) throw protocolFailure("process", "identity");
      break;
    case "process.cleanup-failed":
      if (!hasExactKeys(details, ["target"]) || !oneOf(details.target, ["request", "stdout", "stderr", "temp-directory"])) throw protocolFailure("process", "identity");
      break;
  }
  return failure as unknown as ScaleFailure;
}

function assertFailureProcessCombination(failure: ScaleFailure, process: ScaleProcessState): void {
  const details = failure.details;
  const startup = process.exitCode === null && process.timedOut === false &&
    process.peakWorkingSetBytes === null && process.stdoutBytes === 0 && process.stderrBytes === 0 &&
    process.terminationStatus === "not-required" && process.reapStatus === "not-required";
  const normal = process.exitCode === 0 && process.timedOut === false &&
    process.terminationStatus === "not-required" && process.reapStatus === "succeeded";
  const stopped = process.exitCode === null && process.terminationStatus !== "not-required" &&
    process.reapStatus !== "not-required";
  const normalEvidenceFailure = [
    "process.sentinel-count-invalid", "process.sentinel-malformed", "process.rss-unavailable",
    "process.rss-invalid", "evidence.counter-mismatch", "evidence.overflow",
    "evidence.parity-mismatch", "evidence.bytes-mismatch", "evidence.order-mismatch",
    "evidence.payload-mismatch",
  ] as const;
  switch (failure.code) {
    case "process.start-failed":
      if (!startup) throw protocolFailure("process", "identity");
      return;
    case "process.protocol-invalid":
      if (details.stage === "arguments" || details.stage === "cargo-artifact") {
        if (!startup || process.cleanupStatus !== "succeeded") throw protocolFailure("process", "identity");
      } else if (!normal) {
        throw protocolFailure("process", "identity");
      }
      return;
    case "process.output-limit-exceeded": {
      const stream = details.stream;
      const actual = stream === "stdout" ? process.stdoutBytes : process.stderrBytes;
      if (process.timedOut || !stopped || actual <= PRIVATE_SCALE_STREAM_LIMIT_BYTES) {
        throw protocolFailure("process", "identity");
      }
      return;
    }
    case "process.timeout":
      if (process.timedOut !== true || !stopped) throw protocolFailure("process", "identity");
      return;
    case "process.nonzero-exit":
      if (process.exitCode === null || process.exitCode === 0 || details.exitCode !== process.exitCode ||
          process.timedOut || process.terminationStatus !== "not-required" || process.reapStatus !== "succeeded") {
        throw protocolFailure("process", "identity");
      }
      return;
    case "process.cleanup-failed":
      if (!normal || process.cleanupStatus !== "failed") throw protocolFailure("process", "identity");
      return;
    default:
      if (!(normalEvidenceFailure as readonly string[]).includes(failure.code) || !normal) {
        throw protocolFailure("process", "identity");
      }
  }
}

/** Accepts only the wrapper's one final line; all other output is a protocol failure. */
export function decodeProcessEnvelope(stdout: Buffer, stderr: Buffer): ScaleProcessEnvelope {
  if (stderr.length !== 0) throw { code: "process.sentinel-malformed", details: { stage: "json" } } satisfies ScaleFailure;
  const text = stdout.toString("utf8");
  const match = /^(BRILLIANT_RKP2_SCALE_PROCESS_V1:)([^\r\n]+)\r?\n?$/u.exec(text);
  if (match === null || match[1] !== PRIVATE_SCALE_PROCESS_PREFIX) {
    const count = text.split(PRIVATE_SCALE_PROCESS_PREFIX).length - 1;
    throw { code: "process.sentinel-count-invalid", details: { expected: 1, actual: count } } satisfies ScaleFailure;
  }
  let parsed: unknown;
  try {
    const payload = match[2];
    if (payload === undefined) throw new Error("missing process sentinel payload");
    parsed = JSON.parse(payload);
  } catch {
    throw { code: "process.sentinel-malformed", details: { stage: "json" } } satisfies ScaleFailure;
  }
  if (!isRecord(parsed) || parsed.schemaVersion !== 1 || (parsed.status !== "ok" && parsed.status !== "rejected")) {
    throw protocolFailure("process", "version");
  }
  if (parsed.status === "ok") {
    const record = assertExactRecord(parsed, ["schemaVersion", "status", "evidence", "process", "partialEvidence"], "process");
    if (record.partialEvidence !== false) throw protocolFailure("process", "type");
    const evidence = decodeRustEvidenceLine(`${PRIVATE_SCALE_RUST_PREFIX}${JSON.stringify(record.evidence)}`);
    const process = decodeProcessState(record.process);
    if (process.exitCode !== 0 || process.timedOut !== false || process.terminationStatus !== "not-required" || process.reapStatus !== "succeeded" || process.cleanupStatus !== "succeeded") {
      throw protocolFailure("process", "identity");
    }
    return { schemaVersion: 1, status: "ok", evidence, process, partialEvidence: false };
  }
  const record = assertExactRecord(parsed, ["schemaVersion", "status", "failure", "process", "partialEvidence"], "process");
  if (record.partialEvidence !== false) throw protocolFailure("process", "type");
  const failure = decodeFailure(record.failure);
  const process = decodeProcessState(record.process);
  assertFailureProcessCombination(failure, process);
  return { schemaVersion: 1, status: "rejected", failure, process, partialEvidence: false };
}

/** Picks exactly one libtest executable from Cargo's JSON stream. */
export function selectPrivateScaleExecutable(cargoStdout: string): string {
  const matches: string[] = [];
  for (const line of cargoStdout.split(/\r?\n/u)) {
    if (line.length === 0) continue;
    let row: CargoArtifactMessage;
    try {
      row = JSON.parse(line) as CargoArtifactMessage;
    } catch {
      throw protocolFailure("cargo-artifact", "shape");
    }
    if (row.reason !== "compiler-artifact" || !isRecord(row.target) || !isRecord(row.profile)) continue;
    if (row.target.name !== "brilliant_kernel_runtime" || !Array.isArray(row.target.kind) || row.target.kind.length !== 1 || row.target.kind[0] !== "lib" || row.profile.test !== true) continue;
    if (typeof row.executable !== "string" || row.executable.length === 0 || !isAbsolute(row.executable) || !row.executable.toLowerCase().endsWith(".exe") || !existsSync(row.executable) || !lstatSync(row.executable).isFile()) {
      throw protocolFailure("cargo-artifact", "identity");
    }
    matches.push(row.executable);
  }
  if (matches.length !== 1) throw protocolFailure("cargo-artifact", "identity");
  return matches[0]!;
}

function ensureFixtureRequest(): { readonly request: Buffer } {
  const fixture = createStressCvn7Score();
  const counts = fixture.counts;
  if (counts.measures !== 400 || counts.parts !== 16 || counts.staves !== 16 || counts.measureContents !== 6_400 || counts.voices !== 12_800 || counts.events !== 102_400 || counts.notes !== 51_200 || counts.knownExtensionBlocks !== 17 || counts.unknownExtensionBlocks !== 1) {
    throw { code: "evidence.payload-mismatch", details: { field: "counts" } } satisfies ScaleFailure;
  }
  const encoded = encodeScoreDocumentJson(fixture.document);
  if (!encoded.ok) throw { code: "evidence.payload-mismatch", details: { field: "fixtureId" } } satisfies ScaleFailure;
  const request = Buffer.from(`{"apiVersion":1,"document":${encoded.value}}`, "utf8");
  if (Buffer.byteLength(encoded.value, "utf8") !== 15_013_904 || request.length !== 15_013_932) {
    throw { code: "evidence.bytes-mismatch", details: { field: "createRequestBytes", expected: 15_013_932, actual: request.length } } satisfies ScaleFailure;
  }
  return { request };
}

function runCargoCompile(cargoExecutable: string): string {
  const result = spawnSync(cargoExecutable, ["+1.97.1", "test", "-p", "brilliant-kernel-runtime", "--lib", "--no-run", "--locked", "--message-format=json"], {
    encoding: "utf8",
    windowsHide: true,
    env: process.env,
    maxBuffer: PRIVATE_SCALE_STREAM_LIMIT_BYTES,
  });
  if (result.error !== undefined || result.status !== 0 || result.signal !== null) {
    throw { code: "process.start-failed", details: { stage: "start" } } satisfies ScaleFailure;
  }
  return result.stdout;
}

export function observePrivateScaleOwnershipForTest(leaf: string, token: string): PrivateScaleOwnershipState {
  if (!existsSync(leaf)) return "root-absent";
  try {
    const marker = JSON.parse(readFileSync(join(leaf, PRIVATE_SCALE_OWNERSHIP_MARKER), "utf8")) as JsonRecord;
    if (!hasExactKeys(marker, ["schemaVersion", "state", "token"]) || marker.schemaVersion !== 1 || marker.token !== token) return "unknown";
    if (marker.state === "offered") return "offered";
    if (marker.state === "accepted") return "accepted-residue";
  } catch {
    // A root that still exists without its exact marker is never re-owned by Node.
  }
  return "unknown";
}

function removeOwnedLeafExactlyOnce(leaf: string): boolean {
  try {
    rmSync(leaf, { recursive: true, force: true, maxRetries: 2, retryDelay: PRIVATE_SCALE_POLL_INTERVAL_MS });
  } catch {
    return false;
  }
  return !existsSync(leaf);
}

/**
 * Spawns the frozen wrapper and owns only Node's outer settlement. The seam
 * replaces process/time primitives in tests; production uses Node defaults.
 */
export async function spawnPowerShell(
  script: string,
  executable: string,
  requestPath: string,
  dependencies: PrivateScaleSpawnDependencies = {},
): Promise<PowerShellResult> {
  return await new Promise((resolvePromise) => {
    const spawnProcess = dependencies.spawnProcess ?? spawn;
    const now = dependencies.now ?? Date.now;
    const setTimer = dependencies.setTimer ?? setTimeout;
    const clearTimer = dependencies.clearTimer ?? clearTimeout;
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    const startedAt = now();
    const outerDeadline = startedAt + PRIVATE_SCALE_OUTER_TIMEOUT_MS;
    let child: ReturnType<typeof spawn> | undefined;
    let childExit: number | null = null;
    let childClosed = false;
    let settled = false;
    let terminating = false;
    let terminationSettled = false;
    let reaping = false;
    let launchFailed = false;
    let firstFailure: ScaleFailure | undefined;
    let outputLimitStream: "stdout" | "stderr" | undefined;
    let terminationStatus: PowerShellResult["terminationStatus"] = "not-required";
    let reapStatus: PowerShellResult["reapStatus"] = "not-required";
    let outerTimer: ReturnType<typeof setTimeout> | undefined;
    let terminationTimer: ReturnType<typeof setTimeout> | undefined;
    let reapTimer: ReturnType<typeof setTimeout> | undefined;

    const finish = () => {
      if (settled) return;
      settled = true;
      for (const timer of [outerTimer, terminationTimer, reapTimer]) {
        if (timer !== undefined) clearTimer(timer);
      }
      resolvePromise({ stdout: Buffer.concat(stdout), stderr: Buffer.concat(stderr), exitCode: childExit,
        timedOut: firstFailure?.code === "process.timeout", launchFailed, firstFailure, outputLimitStream, terminationStatus, reapStatus });
    };
    const recordFailure = (failure: ScaleFailure) => {
      if (firstFailure !== undefined) return;
      firstFailure = failure;
      if (failure.code === "process.output-limit-exceeded") {
        outputLimitStream = failure.details.stream as "stdout" | "stderr";
      }
    };
    const beginReap = () => {
      if (settled) return;
      if (childClosed) { reapStatus = "succeeded"; finish(); return; }
      if (reaping) return;
      reaping = true;
      reapTimer = setTimer(() => { reapStatus = "failed"; finish(); }, PRIVATE_SCALE_REAP_TIMEOUT_MS);
    };
    const requestTermination = (failure: ScaleFailure) => {
      if (settled) return;
      recordFailure(failure);
      if (terminating) return;
      terminating = true;
      if (child === undefined || child.pid === undefined) { terminationStatus = "failed"; terminationSettled = true; beginReap(); return; }
      const systemRoot = dependencies.systemRoot ?? process.env.SystemRoot;
      const taskkill = systemRoot === undefined ? undefined : join(systemRoot, "System32", "taskkill.exe");
      if (taskkill === undefined) { terminationStatus = "failed"; terminationSettled = true; beginReap(); return; }
      let killer: ReturnType<typeof spawn>;
      try {
        killer = spawnProcess(taskkill, ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, shell: false, stdio: "ignore" });
      } catch { terminationStatus = "failed"; terminationSettled = true; beginReap(); return; }
      let taskkillSettled = false;
      const settleTaskkill = (succeeded: boolean) => {
        if (taskkillSettled || settled) return;
        taskkillSettled = true;
        terminationSettled = true;
        if (terminationTimer !== undefined) clearTimer(terminationTimer);
        terminationStatus = succeeded ? "succeeded" : "failed";
        beginReap();
      };
      killer.once("error", () => settleTaskkill(false));
      killer.once("close", (code) => settleTaskkill(code === 0));
      terminationTimer = setTimer(() => { try { killer.kill(); } catch {} settleTaskkill(false); }, PRIVATE_SCALE_TERMINATION_BUDGET_MS);
    };

    // PowerShell alone owns the 180-second workload deadline. Node installs one
    // independently derived outer hard deadline before spawn and never resets it.
    outerTimer = setTimer(
      () => requestTermination({ code: "process.timeout", details: { timeoutMs: PRIVATE_SCALE_TIMEOUT_MS } }),
      Math.max(0, outerDeadline - now()),
    );
    try {
      child = spawnProcess(process.env.BRILLIANT_RKP2_PWSH ?? "pwsh", [
        "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", script,
        "-ExecutablePath", executable, "-RequestPath", requestPath, "-TestName", PRIVATE_SCALE_TEST_NAME,
        "-TimeoutMs", String(PRIVATE_SCALE_TIMEOUT_MS), "-PollIntervalMs", String(PRIVATE_SCALE_POLL_INTERVAL_MS),
        "-MaxStdoutBytes", String(PRIVATE_SCALE_STREAM_LIMIT_BYTES), "-MaxStderrBytes", String(PRIVATE_SCALE_STREAM_LIMIT_BYTES),
      ], { windowsHide: true, shell: false, stdio: ["ignore", "pipe", "pipe"] });
    } catch { launchFailed = true; recordFailure({ code: "process.start-failed", details: { stage: "start" } }); finish(); return; }
    child.once("error", () => {
      launchFailed = true;
      recordFailure({ code: "process.start-failed", details: { stage: "start" } });
      if (!terminating) finish();
      else if (terminationSettled) beginReap();
    });
    if (child.stdout === null || child.stderr === null) { launchFailed = true; recordFailure({ code: "process.start-failed", details: { stage: "start" } }); finish(); return; }
    const observeChunk = (target: Buffer[], stream: "stdout" | "stderr", chunk: Buffer) => {
      target.push(Buffer.from(chunk));
      const actual = target.reduce((sum, value) => sum + value.length, 0);
      if (actual > PRIVATE_SCALE_STREAM_LIMIT_BYTES) requestTermination({ code: "process.output-limit-exceeded", details: { stream, limitBytes: PRIVATE_SCALE_STREAM_LIMIT_BYTES } });
    };
    child.stdout.on("data", (chunk: Buffer) => observeChunk(stdout, "stdout", chunk));
    child.stderr.on("data", (chunk: Buffer) => observeChunk(stderr, "stderr", chunk));
    child.once("close", (exitCode, signal) => {
      childClosed = true;
      childExit = exitCode;
      if (signal !== null && signal !== undefined) recordFailure({ code: "process.protocol-invalid", details: { stage: "process", reason: "identity" } });
      else if (exitCode === null) recordFailure({ code: "process.protocol-invalid", details: { stage: "process", reason: "identity" } });
      else if (exitCode !== 0) recordFailure({ code: "process.nonzero-exit", details: { exitCode } });
      if (terminating) { if (terminationSettled) beginReap(); }
      else { reapStatus = "succeeded"; finish(); }
    });
  });
}

/** Runs the one permitted E2 stress journey. It leaves no handoff-owned root behind. */
export async function runPrivateScaleEvidenceWorker(options: { readonly repoRoot?: string; readonly cargoExecutable?: string; readonly powerShellScript?: string } = {}): Promise<WorkerResult> {
  const repoRoot = resolve(options.repoRoot ?? process.cwd());
  const script = resolve(options.powerShellScript ?? join(repoRoot, "test", "core-kernel", "rust-migration", "rkp-2-scale-evidence-process.ps1"));
  if (!existsSync(script) || !lstatSync(script).isFile()) throw protocolFailure("arguments", "identity");
  const cargoExecutable = options.cargoExecutable ?? process.env.BRILLIANT_RKP2_CARGO ?? "cargo";
  const executable = selectPrivateScaleExecutable(runCargoCompile(cargoExecutable));
  const created = ensureFixtureRequest();
  let leaf: string | undefined;
  let nodeOwnsLeaf = false;
  let nodeCleanupAttempted = false;
  const cleanupNodeLeaf = () => {
    if (leaf === undefined || nodeCleanupAttempted) return true;
    nodeCleanupAttempted = true;
    return removeOwnedLeafExactlyOnce(leaf);
  };
  try {
    leaf = join(tmpdir(), `${PRIVATE_SCALE_LEAF_PREFIX}${randomBytes(32).toString("hex")}`);
    mkdirSync(leaf, { recursive: false });
    nodeOwnsLeaf = true;
    const requestPath = join(leaf, "request.json");
    const token = leaf.slice(leaf.lastIndexOf(PRIVATE_SCALE_LEAF_PREFIX) + PRIVATE_SCALE_LEAF_PREFIX.length);
    writeFileSync(requestPath, created.request, { flag: "wx" });
    writeFileSync(join(leaf, PRIVATE_SCALE_OWNERSHIP_MARKER), JSON.stringify({ schemaVersion: 1, state: "offered", token }), { flag: "wx" });
    const started = process.hrtime.bigint();
    const processResult = await spawnPowerShell(script, executable, requestPath);
    const ownership = observePrivateScaleOwnershipForTest(leaf, token);
    if (ownership === "root-absent") nodeOwnsLeaf = false;
    else if (ownership === "offered") {
      if (!cleanupNodeLeaf()) throw { code: "process.cleanup-failed", details: { target: "temp-directory" } } satisfies ScaleFailure;
      nodeOwnsLeaf = false;
    } else {
      nodeOwnsLeaf = false;
      if (ownership === "accepted-residue") throw { code: "process.cleanup-failed", details: { target: "temp-directory" } } satisfies ScaleFailure;
      throw protocolFailure("process", "identity");
    }
    if (processResult.firstFailure !== undefined) throw processResult.firstFailure;
    const envelope = decodeProcessEnvelope(processResult.stdout, processResult.stderr);
    if (envelope.status !== "ok") throw envelope.failure;
    if (processResult.exitCode !== 0) throw { code: "process.nonzero-exit", details: { exitCode: processResult.exitCode ?? 1 } } satisfies ScaleFailure;
    const elapsed = Number((process.hrtime.bigint() - started) / 1_000n);
    if (!safeInteger(elapsed, true)) throw { code: "evidence.overflow", details: { field: "workloadElapsedMicros" } } satisfies ScaleFailure;
    return { envelope, wallElapsedMicros: elapsed };
  } finally {
    if (nodeOwnsLeaf && !cleanupNodeLeaf()) {
      // The original failure remains primary; no partial success is published.
    }
  }
}
export function readRequestForTest(path: string): Buffer {
  return readFileSync(path);
}
