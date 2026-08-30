import { spawn, spawnSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
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

interface PowerShellResult {
  readonly stdout: Buffer;
  readonly stderr: Buffer;
  readonly exitCode: number | null;
  readonly timedOut: boolean;
  readonly handoffAccepted: boolean;
  readonly launchFailed: boolean;
}

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
  if (failure.code === "process.start-failed" && (process.exitCode !== null || process.timedOut || process.terminationStatus !== "not-required" || process.reapStatus !== "not-required")) throw protocolFailure("process", "identity");
  if (failure.code === "process.timeout" && (process.timedOut !== true || process.terminationStatus === "not-required")) throw protocolFailure("process", "identity");
  if (failure.code === "process.output-limit-exceeded" && process.terminationStatus === "not-required") throw protocolFailure("process", "identity");
  if (failure.code === "process.nonzero-exit" && (process.exitCode === null || process.exitCode === 0 || details.exitCode !== process.exitCode)) throw protocolFailure("process", "identity");
  if (process.exitCode === 0 && process.reapStatus === "failed" && !(failure.code === "process.protocol-invalid" && details.stage === "process" && details.reason === "identity")) throw protocolFailure("process", "identity");
  if (failure.code === "process.cleanup-failed" && process.cleanupStatus !== "failed") throw protocolFailure("process", "identity");
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

async function spawnPowerShell(script: string, executable: string, requestPath: string): Promise<PowerShellResult> {
  return await new Promise((resolvePromise) => {
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(process.env.BRILLIANT_RKP2_PWSH ?? "pwsh", [
      "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", script,
      "-ExecutablePath", executable, "-RequestPath", requestPath, "-TestName", PRIVATE_SCALE_TEST_NAME,
      "-TimeoutMs", String(PRIVATE_SCALE_TIMEOUT_MS), "-PollIntervalMs", String(PRIVATE_SCALE_POLL_INTERVAL_MS),
      "-MaxStdoutBytes", String(PRIVATE_SCALE_STREAM_LIMIT_BYTES), "-MaxStderrBytes", String(PRIVATE_SCALE_STREAM_LIMIT_BYTES),
      ], { windowsHide: true, shell: false, stdio: ["ignore", "pipe", "pipe"] });
    } catch {
      resolvePromise({ stdout: Buffer.alloc(0), stderr: Buffer.alloc(0), exitCode: null, timedOut: false, handoffAccepted: false, launchFailed: true });
      return;
    }
    let timeout: NodeJS.Timeout | undefined;
    let reapTimeout: NodeJS.Timeout | undefined;
    let settled = false;
    let timedOut = false;
    let handoffAccepted = false;
    const finish = (exitCode: number | null, launchFailed = false) => {
      if (settled) return;
      settled = true;
      if (timeout !== undefined) clearTimeout(timeout);
      if (reapTimeout !== undefined) clearTimeout(reapTimeout);
      resolvePromise({ stdout: Buffer.concat(stdout), stderr: Buffer.concat(stderr), exitCode, timedOut, handoffAccepted, launchFailed });
    };
    const requestTermination = () => {
      if (settled) return;
      timedOut = true;
      const systemRoot = process.env.SystemRoot;
      const taskkill = systemRoot === undefined ? undefined : join(systemRoot, "System32", "taskkill.exe");
      if (taskkill !== undefined && child.pid !== undefined) {
        try {
          const killer = spawn(taskkill, ["/PID", String(child.pid), "/T", "/F"], {
            windowsHide: true,
            shell: false,
            stdio: "ignore",
          });
          killer.once("error", () => {});
        } catch {}
      } else {
        try { child.kill(); } catch {}
      }
      reapTimeout = setTimeout(() => finish(null), PRIVATE_SCALE_REAP_TIMEOUT_MS);
    };
    timeout = setTimeout(() => {
      requestTermination();
    }, PRIVATE_SCALE_TIMEOUT_MS + PRIVATE_SCALE_REAP_TIMEOUT_MS);
    child.once("spawn", () => { handoffAccepted = true; });
    child.once("error", () => finish(null, true));
    if (child.stdout === null || child.stderr === null) {
      finish(null, true);
      return;
    }
    child.stdout.on("data", (chunk: Buffer) => stdout.push(Buffer.from(chunk)));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(Buffer.from(chunk)));
    child.once("close", (exitCode) => finish(exitCode));
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
  const leaf = mkdtempSync(join(tmpdir(), "rkp2-scale-e2-"));
  const requestPath = join(leaf, "request.json");
  writeFileSync(requestPath, created.request, { flag: "wx" });
  const started = process.hrtime.bigint();
  let handoffAccepted = false;
  try {
    const processResult = await spawnPowerShell(script, executable, requestPath);
    handoffAccepted = processResult.handoffAccepted;
    if (processResult.launchFailed) throw { code: "process.start-failed", details: { stage: "start" } } satisfies ScaleFailure;
    if (processResult.timedOut) throw { code: "process.timeout", details: { timeoutMs: PRIVATE_SCALE_TIMEOUT_MS } } satisfies ScaleFailure;
    const envelope = decodeProcessEnvelope(processResult.stdout, processResult.stderr);
    if (envelope.status !== "ok") throw envelope.failure;
    if (processResult.exitCode !== 0) throw { code: "process.nonzero-exit", details: { exitCode: processResult.exitCode ?? 1 } } satisfies ScaleFailure;
    const elapsed = Number((process.hrtime.bigint() - started) / 1_000n);
    if (!safeInteger(elapsed, true)) throw { code: "evidence.overflow", details: { field: "workloadElapsedMicros" } } satisfies ScaleFailure;
    if (existsSync(leaf)) throw { code: "process.cleanup-failed", details: { target: "temp-directory" } } satisfies ScaleFailure;
    return { envelope, wallElapsedMicros: elapsed };
  } finally {
    if (!handoffAccepted && existsSync(leaf)) rmSync(leaf, { recursive: true, force: true, maxRetries: 2, retryDelay: PRIVATE_SCALE_POLL_INTERVAL_MS });
  }
}

export function readRequestForTest(path: string): Buffer {
  return readFileSync(path);
}
