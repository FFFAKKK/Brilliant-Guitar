import assert = require("node:assert/strict");
import { spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeSync,
  writeFileSync,
} from "node:fs";
import { rm } from "node:fs/promises";
import * as path from "node:path";
import { test } from "node:test";

import {
  createRustKernelSmokeSession,
  readRustKernelSmokeSession,
  type OpaqueKernelSessionHandle,
  type RustKernelSmokeNativeAddon,
} from "../../../src/core-kernel/native/rust-kernel-smoke";
import { createStressCvn7Score } from "../fixtures/cvn-7-qualification-score";

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
const STRESS_DIRECT_DAG_MEMBERS = 1_045_635;
const STRESS_CLONED_TREE_MEMBERS = 1_199_232;
const STRESS_CREATE_REQUEST_BYTES = 15_013_932;
const STRESS_READ_WRAPPER_BYTES = 15_014_112;
const STRESS_DOCUMENT_RUST_VALUES = 1_199_233;
const STRESS_CREATE_REQUEST_RUST_VALUES = 1_199_235;
const STRESS_CREATE_REQUEST_TYPESCRIPT_MEMBERS = 1_199_234;
const STRESS_READ_RESPONSE_RUST_VALUES = 1_199_245;
const STRESS_READ_RESPONSE_TYPESCRIPT_MEMBERS = 1_199_244;
const STRESS_INPUT_SCORE_BYTES = 15_013_904;
const STRESS_INPUT_SCORE_SHA256 =
  "5a8a318e58bc08a82a822c166ed11239ed4ed7b9ea45d50bb7dcb81d7c57f91e";
const STRESS_RUST_CANONICAL_EXPORT_SHA256 =
  "4d8597437cc8b07df6cfef9400086218636adb27257ad72d055e1e3a3deafff7";

const P3B_WORKER_ARGUMENT = "--rkp1a-p3b-self-worker-v1";
const P3B_WORKER_MODE_ENV = "BRILLIANT_RKP1A_P3B_SELF_WORKER_V1";
const P3B_WORKER_REQUEST_ENV = "BRILLIANT_RKP1A_P3B_REQUEST_V1";
const P3B_WORKER_RESULT_ENV = "BRILLIANT_RKP1A_P3B_RESULT_V1";
const P3B_SENTINEL_PREFIX = "BRILLIANT_RKP1A_P3B_SELF_WORKER_V1:";
const P3B_OUTPUT_LIMIT = 1_048_576;
const P3B_TIMEOUT_MS = 180_000;
const P3B_SETTLEMENT_GUARD_MS = 5_000;
const P3B_CLEANUP_RETRY_DELAY_MS = 100;

const addonPath = path.resolve(
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

type MemberCountTask =
  | { readonly kind: "value"; readonly value: unknown }
  | { readonly kind: "complete"; readonly value: object };

function countCapturedMembers(input: unknown): number {
  const active = new WeakSet<object>();
  const completed = new WeakSet<object>();
  const tasks: MemberCountTask[] = [{ kind: "value", value: input }];
  let memberCount = 0;

  while (tasks.length > 0) {
    const task = tasks.pop();
    assert.ok(task, "member-count task must exist");
    if (task.kind === "complete") {
      active.delete(task.value);
      completed.add(task.value);
      continue;
    }

    const value = task.value;
    if (value === null || typeof value !== "object") {
      continue;
    }
    assert.equal(active.has(value), false, "fixture must remain acyclic");
    if (completed.has(value)) {
      continue;
    }

    active.add(value);
    tasks.push({ kind: "complete", value });
    if (Array.isArray(value)) {
      const length = value.length;
      assert.equal(Reflect.ownKeys(value).length, length + 1);
      memberCount += length;
      for (let index = length - 1; index >= 0; index -= 1) {
        const descriptor = Reflect.getOwnPropertyDescriptor(value, String(index));
        assert.ok(
          descriptor?.enumerable === true && "value" in descriptor,
          `array member ${index} must be an enumerable data property`,
        );
        tasks.push({ kind: "value", value: descriptor.value });
      }
      continue;
    }

    const prototype = Reflect.getPrototypeOf(value);
    assert.ok(
      prototype === Object.prototype || prototype === null,
      "fixture records must be plain or null-prototype objects",
    );
    const keys = Reflect.ownKeys(value);
    memberCount += keys.length;
    for (let index = keys.length - 1; index >= 0; index -= 1) {
      const key = keys[index];
      if (key === undefined) {
        assert.fail("fixture record key must exist");
      }
      assert.equal(typeof key, "string", "fixture record keys must be strings");
      const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
      assert.ok(
        descriptor?.enumerable === true && "value" in descriptor,
        `record member ${String(key)} must be an enumerable data property`,
      );
      tasks.push({ kind: "value", value: descriptor.value });
    }
  }

  assert.equal(Number.isSafeInteger(memberCount), true);
  return memberCount;
}

type JsonValueCountTask = { readonly value: unknown };

function countJsonValues(input: unknown): number {
  const tasks: JsonValueCountTask[] = [{ value: input }];
  let count = 0;
  while (tasks.length > 0) {
    const task = tasks.pop();
    assert.ok(task);
    count += 1;
    assert.equal(Number.isSafeInteger(count), true);
    if (task.value === null || typeof task.value !== "object") {
      continue;
    }
    const values = Array.isArray(task.value)
      ? task.value
      : Object.values(task.value as Readonly<Record<string, unknown>>);
    for (let index = values.length - 1; index >= 0; index -= 1) {
      tasks.push({ value: values[index] });
    }
  }
  return count;
}

function sha256(bytes: string | Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

type SemanticHashTask =
  | { readonly kind: "value"; readonly value: unknown }
  | { readonly kind: "token"; readonly token: string };

function semanticHash(input: unknown): string {
  const hash = createHash("sha256");
  const tasks: SemanticHashTask[] = [{ kind: "value", value: input }];
  while (tasks.length > 0) {
    const task = tasks.pop();
    assert.ok(task);
    if (task.kind === "token") {
      hash.update(task.token);
      continue;
    }
    const value = task.value;
    if (value === null || typeof value !== "object") {
      const encoded = JSON.stringify(value);
      assert.notEqual(encoded, undefined);
      hash.update(`p${encoded.length}:${encoded}`);
      continue;
    }
    if (Array.isArray(value)) {
      hash.update(`a${value.length}[`);
      tasks.push({ kind: "token", token: "]" });
      for (let index = value.length - 1; index >= 0; index -= 1) {
        tasks.push({ kind: "value", value: value[index] });
      }
      continue;
    }
    const record = value as Readonly<Record<string, unknown>>;
    const keys = Object.keys(record).sort();
    hash.update(`o${keys.length}{`);
    tasks.push({ kind: "token", token: "}" });
    for (let index = keys.length - 1; index >= 0; index -= 1) {
      const key = keys[index];
      assert.notEqual(key, undefined);
      tasks.push({ kind: "value", value: record[key!] });
      tasks.push({ kind: "token", token: `k${key!.length}:${key!}` });
    }
  }
  return hash.digest("hex");
}

function predecessorPropertyLimitFailure(input: unknown): {
  readonly failureVersion: 1;
  readonly code: "codec.property-limit";
  readonly limit: number;
  readonly actual: number;
} | null {
  const tasks: unknown[] = [input];
  let actual = 0;
  while (tasks.length > 0) {
    const value = tasks.pop();
    actual += 1;
    if (actual > DEFAULT_CAPTURE_PROPERTY_LIMIT) {
      return {
        failureVersion: 1,
        code: "codec.property-limit",
        limit: DEFAULT_CAPTURE_PROPERTY_LIMIT,
        actual,
      };
    }
    if (value === null || typeof value !== "object") {
      continue;
    }
    const values = Array.isArray(value)
      ? value
      : Object.values(value as Readonly<Record<string, unknown>>);
    for (let index = values.length - 1; index >= 0; index -= 1) {
      tasks.push(values[index]);
    }
  }
  return null;
}

interface P3bEvidenceV1 {
  readonly schemaVersion: 1;
  readonly status: "ok";
  readonly fixtureId: "cvn7-stress-v1";
  readonly counts: {
    readonly measures: 400;
    readonly parts: 16;
    readonly staves: 16;
    readonly measureContents: 6_400;
    readonly voices: 12_800;
    readonly events: 102_400;
    readonly notes: 51_200;
    readonly extensions: 18;
    readonly partOwnedExtensions: 16;
    readonly unknownExtensions: 1;
    readonly documentRustValues: 1_199_233;
    readonly documentTypescriptMembers: 1_199_232;
    readonly createRequestRustValues: 1_199_235;
    readonly createRequestTypescriptMembers: 1_199_234;
    readonly requestEnvelopeValues: 2;
    readonly readResponseRustValues: 1_199_245;
    readonly readResponseTypescriptMembers: 1_199_244;
    readonly directDagCaptureMembers: 1_045_635;
  };
  readonly bytes: {
    readonly inputScore: 15_013_904;
    readonly createRequest: 15_013_932;
    readonly readResponse: 15_014_112;
    readonly rustCanonicalExport: 15_013_904;
  };
  readonly hashes: {
    readonly inputScoreSha256: typeof STRESS_INPUT_SCORE_SHA256;
    readonly rustCanonicalExportSha256: typeof STRESS_RUST_CANONICAL_EXPORT_SHA256;
  };
  readonly proofs: {
    readonly realDecodeCreateRequest: true;
    readonly directDagRawJourney: true;
    readonly directDagPublicJourney: true;
    readonly clonedTreeRawJourney: true;
    readonly clonedTreePublicJourney: true;
    readonly repeatedRawReadStable: true;
    readonly repeatedPublicReadStable: true;
    readonly semanticDeepEqual: true;
    readonly extensionsDeepEqual: true;
    readonly predecessorRejected: true;
    readonly zeroPartialPublication: true;
  };
  readonly diagnostics: {
    readonly workloadElapsedMicros: number;
    readonly peakRssBytes: number;
  };
}

const P3B_EVIDENCE_KEYS = [
  "schemaVersion",
  "status",
  "fixtureId",
  "counts",
  "bytes",
  "hashes",
  "proofs",
  "diagnostics",
] as const;
const P3B_COUNT_KEYS = [
  "measures",
  "parts",
  "staves",
  "measureContents",
  "voices",
  "events",
  "notes",
  "extensions",
  "partOwnedExtensions",
  "unknownExtensions",
  "documentRustValues",
  "documentTypescriptMembers",
  "createRequestRustValues",
  "createRequestTypescriptMembers",
  "requestEnvelopeValues",
  "readResponseRustValues",
  "readResponseTypescriptMembers",
  "directDagCaptureMembers",
] as const;
const P3B_BYTE_KEYS = [
  "inputScore",
  "createRequest",
  "readResponse",
  "rustCanonicalExport",
] as const;
const P3B_HASH_KEYS = [
  "inputScoreSha256",
  "rustCanonicalExportSha256",
] as const;
const P3B_PROOF_KEYS = [
  "realDecodeCreateRequest",
  "directDagRawJourney",
  "directDagPublicJourney",
  "clonedTreeRawJourney",
  "clonedTreePublicJourney",
  "repeatedRawReadStable",
  "repeatedPublicReadStable",
  "semanticDeepEqual",
  "extensionsDeepEqual",
  "predecessorRejected",
  "zeroPartialPublication",
] as const;

function exactRecord(
  value: unknown,
  keys: readonly string[],
  label: string,
): Readonly<Record<string, unknown>> {
  assert.ok(value !== null && typeof value === "object" && !Array.isArray(value));
  const record = value as Readonly<Record<string, unknown>>;
  assert.deepEqual(Object.keys(record), keys, `${label} exact key order`);
  return record;
}

function assertSafeInteger(value: unknown, label: string, positive = false): void {
  assert.equal(typeof value, "number", label);
  assert.equal(Number.isSafeInteger(value), true, label);
  assert.ok((value as number) >= (positive ? 1 : 0), label);
}

function parseExactP3bEvidence(json: string): P3bEvidenceV1 {
  const root = exactRecord(JSON.parse(json) as unknown, P3B_EVIDENCE_KEYS, "root");
  assert.equal(root.schemaVersion, 1);
  assert.equal(root.status, "ok");
  assert.equal(root.fixtureId, "cvn7-stress-v1");
  const counts = exactRecord(root.counts, P3B_COUNT_KEYS, "counts");
  const expectedCounts: Readonly<Record<string, number>> = {
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
    documentRustValues: STRESS_DOCUMENT_RUST_VALUES,
    documentTypescriptMembers: STRESS_CLONED_TREE_MEMBERS,
    createRequestRustValues: STRESS_CREATE_REQUEST_RUST_VALUES,
    createRequestTypescriptMembers: STRESS_CREATE_REQUEST_TYPESCRIPT_MEMBERS,
    requestEnvelopeValues: 2,
    readResponseRustValues: STRESS_READ_RESPONSE_RUST_VALUES,
    readResponseTypescriptMembers: STRESS_READ_RESPONSE_TYPESCRIPT_MEMBERS,
    directDagCaptureMembers: STRESS_DIRECT_DAG_MEMBERS,
  };
  for (const key of P3B_COUNT_KEYS) {
    assertSafeInteger(counts[key], `counts.${key}`);
    assert.equal(counts[key], expectedCounts[key], `counts.${key}`);
  }
  const bytes = exactRecord(root.bytes, P3B_BYTE_KEYS, "bytes");
  const expectedBytes: Readonly<Record<string, number>> = {
    inputScore: STRESS_INPUT_SCORE_BYTES,
    createRequest: STRESS_CREATE_REQUEST_BYTES,
    readResponse: STRESS_READ_WRAPPER_BYTES,
    rustCanonicalExport: STRESS_INPUT_SCORE_BYTES,
  };
  for (const key of P3B_BYTE_KEYS) {
    assertSafeInteger(bytes[key], `bytes.${key}`);
    assert.equal(bytes[key], expectedBytes[key], `bytes.${key}`);
  }
  const hashes = exactRecord(root.hashes, P3B_HASH_KEYS, "hashes");
  assert.equal(hashes.inputScoreSha256, STRESS_INPUT_SCORE_SHA256);
  assert.equal(
    hashes.rustCanonicalExportSha256,
    STRESS_RUST_CANONICAL_EXPORT_SHA256,
  );
  const proofs = exactRecord(root.proofs, P3B_PROOF_KEYS, "proofs");
  for (const key of P3B_PROOF_KEYS) {
    assert.equal(proofs[key], true, `proofs.${key}`);
  }
  const diagnostics = exactRecord(
    root.diagnostics,
    ["workloadElapsedMicros", "peakRssBytes"],
    "diagnostics",
  );
  assertSafeInteger(diagnostics.workloadElapsedMicros, "workload elapsed", true);
  assertSafeInteger(diagnostics.peakRssBytes, "peak RSS", true);
  return root as unknown as P3bEvidenceV1;
}

function isP3bWorkerEntry(input: {
  readonly argv: readonly string[];
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly filename: string;
}): boolean {
  return (
    path.resolve(input.argv[1] ?? "") === path.resolve(input.filename) &&
    input.argv.length === 3 &&
    input.argv[2] === P3B_WORKER_ARGUMENT &&
    input.env[P3B_WORKER_MODE_ENV] === "1" &&
    input.env.NODE_TEST_CONTEXT === undefined
  );
}

type P3bFailureCode =
  | "p3b.spawn-failed"
  | "p3b.timeout"
  | "p3b.signal"
  | "p3b.nonzero-exit"
  | "p3b.stdout-overflow"
  | "p3b.stderr-overflow"
  | "p3b.sentinel-missing"
  | "p3b.sentinel-duplicate"
  | "p3b.sentinel-malformed"
  | "p3b.semantic-mismatch"
  | "p3b.taskkill-launch-error"
  | "p3b.taskkill-nonzero"
  | "p3b.taskkill-timeout"
  | "p3b.reap-timeout"
  | "p3b.cleanup-failed";

interface P3bSettlementState {
  primary?: P3bFailureCode;
  terminateStatus:
    | "not-required"
    | "succeeded"
    | "launch-error"
    | "nonzero"
    | "timeout";
  reapStatus: "not-required" | "succeeded" | "timeout";
  cleanupStatus: "succeeded" | "failed";
  cleanupRecovered: boolean;
}

function newSettlementState(): P3bSettlementState {
  return {
    terminateStatus: "not-required",
    reapStatus: "not-required",
    cleanupStatus: "succeeded",
    cleanupRecovered: false,
  };
}

function observeFailure(
  state: P3bSettlementState,
  failure: P3bFailureCode,
): void {
  state.primary ??= failure;
}

function recordTerminateStatus(
  state: P3bSettlementState,
  status: Exclude<P3bSettlementState["terminateStatus"], "not-required">,
): void {
  state.terminateStatus = status;
  if (status === "launch-error") observeFailure(state, "p3b.taskkill-launch-error");
  if (status === "nonzero") observeFailure(state, "p3b.taskkill-nonzero");
  if (status === "timeout") observeFailure(state, "p3b.taskkill-timeout");
}

function recordReapStatus(
  state: P3bSettlementState,
  status: Exclude<P3bSettlementState["reapStatus"], "not-required">,
): void {
  state.reapStatus = status;
  if (status === "timeout") observeFailure(state, "p3b.reap-timeout");
}

function parseSingleP3bSentinel(stdout: Buffer, stderr: Buffer): P3bEvidenceV1 {
  if (stdout.byteLength > P3B_OUTPUT_LIMIT) {
    throw new Error("p3b.stdout-overflow");
  }
  if (stderr.byteLength > P3B_OUTPUT_LIMIT) {
    throw new Error("p3b.stderr-overflow");
  }
  if (stderr.byteLength !== 0) {
    throw new Error("p3b.sentinel-malformed");
  }
  const output = stdout.toString("utf8");
  const lines = output.endsWith("\n") ? output.slice(0, -1).split("\n") : [];
  const sentinels = lines.filter((line) => line.startsWith(P3B_SENTINEL_PREFIX));
  if (sentinels.length === 0) throw new Error("p3b.sentinel-missing");
  if (sentinels.length !== 1) throw new Error("p3b.sentinel-duplicate");
  if (lines.length !== 1) throw new Error("p3b.sentinel-malformed");
  try {
    return parseExactP3bEvidence(sentinels[0]!.slice(P3B_SENTINEL_PREFIX.length));
  } catch {
    throw new Error("p3b.sentinel-malformed");
  }
}

function taskkillInvocation(pid: number): {
  readonly file: "taskkill.exe";
  readonly args: readonly ["/PID", string, "/T", "/F"];
  readonly shell: false;
  readonly windowsHide: true;
} {
  return {
    file: "taskkill.exe",
    args: ["/PID", String(pid), "/T", "/F"],
    shell: false,
    windowsHide: true,
  };
}

async function delay(milliseconds: number): Promise<void> {
  await new Promise<void>((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

async function cleanupOwnedLeaf(
  leaf: string,
  removeAttempt: (ownedLeaf: string) => Promise<void> = async (ownedLeaf) => {
    await rm(ownedLeaf, { recursive: true, force: true });
  },
): Promise<{ readonly status: "succeeded" | "failed"; readonly recovered: boolean }> {
  let sawFailure = false;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await Promise.race([
        removeAttempt(leaf),
        delay(P3B_SETTLEMENT_GUARD_MS).then(() => {
          throw new Error("cleanup timeout");
        }),
      ]);
      if (!existsSync(leaf)) {
        return { status: "succeeded", recovered: sawFailure };
      }
      sawFailure = true;
    } catch {
      sawFailure = true;
    }
    if (attempt === 0) await delay(P3B_CLEANUP_RETRY_DELAY_MS);
  }
  return { status: "failed", recovered: false };
}

function parseRawPayload(buffer: Buffer): Readonly<Record<string, unknown>> {
  return JSON.parse(buffer.toString("utf8")) as Readonly<Record<string, unknown>>;
}

function requireRawHandle(created: RawNativeCreateResult): object {
  const payload = parseRawPayload(created.payload);
  assert.equal(payload.status, "created");
  assert.ok(created.handle);
  return created.handle;
}

function requirePublicHandle(outcome: ReturnType<typeof createRustKernelSmokeSession>) {
  assert.equal(outcome.result.status, "created");
  if (!("handle" in outcome)) {
    assert.fail("accepted public create must publish one handle");
  }
  return outcome.handle;
}

function collectStressCounts(document: ReturnType<typeof createStressCvn7Score>["document"]) {
  const staves = document.parts.reduce((sum, part) => sum + part.staves.length, 0);
  const measureContents = document.parts.reduce(
    (sum, part) => sum + part.measureContents.length,
    0,
  );
  const voices = document.parts.reduce(
    (sum, part) =>
      sum +
      part.measureContents.reduce(
        (contentSum, content) => contentSum + content.voices.length,
        0,
      ),
    0,
  );
  const events = document.parts.reduce(
    (sum, part) =>
      sum +
      part.measureContents.reduce(
        (contentSum, content) =>
          contentSum +
          content.voices.reduce(
            (voiceSum, voice) => voiceSum + voice.sequence.events.length,
            0,
          ),
        0,
      ),
    0,
  );
  const notes = document.parts.reduce(
    (sum, part) =>
      sum +
      part.measureContents.reduce(
        (contentSum, content) =>
          contentSum +
          content.voices.reduce(
            (voiceSum, voice) =>
              voiceSum +
              voice.sequence.events.reduce(
                (eventSum, event) =>
                  eventSum +
                  (event.content.kind === "notes" ? event.content.notes.length : 0),
                0,
              ),
            0,
          ),
        0,
      ),
    0,
  );
  return {
    measures: document.measureDefinitions.length,
    parts: document.parts.length,
    staves,
    measureContents,
    voices,
    events,
    notes,
    extensions: document.extensions.length,
    partOwnedExtensions: document.extensions.filter(
      (extension) => extension.owner.kind === "part",
    ).length,
    unknownExtensions: document.extensions.filter(
      (extension) => extension.namespace === "fixture.cvn7.unknown",
    ).length,
  };
}

function runP3bWorker(): void {
  const requestPath = process.env[P3B_WORKER_REQUEST_ENV];
  const resultPath = process.env[P3B_WORKER_RESULT_ENV];
  assert.ok(requestPath && path.isAbsolute(requestPath));
  assert.ok(resultPath && path.isAbsolute(resultPath));
  assert.equal(path.parse(requestPath).root.toUpperCase(), "E:\\");
  assert.equal(path.parse(resultPath).root.toUpperCase(), "E:\\");

  const started = process.hrtime.bigint();
  const directDocument = createStressCvn7Score().document;
  const clonedDocument = JSON.parse(JSON.stringify(directDocument)) as typeof directDocument;
  const expectedDocument = structuredClone(clonedDocument);
  const inputScoreJson = JSON.stringify(clonedDocument);
  const createRequestJson = JSON.stringify({ apiVersion: 1, document: clonedDocument });
  const suppliedRequest = readFileSync(requestPath);
  assert.equal(suppliedRequest.toString("utf8"), createRequestJson);
  assert.equal(Buffer.byteLength(inputScoreJson, "utf8"), STRESS_INPUT_SCORE_BYTES);
  assert.equal(suppliedRequest.byteLength, STRESS_CREATE_REQUEST_BYTES);
  assert.equal(sha256(inputScoreJson), STRESS_INPUT_SCORE_SHA256);
  assert.equal(countCapturedMembers(directDocument), STRESS_DIRECT_DAG_MEMBERS);
  assert.equal(countCapturedMembers(clonedDocument), STRESS_CLONED_TREE_MEMBERS);
  assert.equal(
    countCapturedMembers(JSON.parse(createRequestJson)),
    STRESS_CREATE_REQUEST_TYPESCRIPT_MEMBERS,
  );
  assert.equal(countJsonValues(clonedDocument), STRESS_DOCUMENT_RUST_VALUES);
  const createRequestRustValues = countJsonValues(JSON.parse(createRequestJson));
  assert.equal(createRequestRustValues, STRESS_CREATE_REQUEST_RUST_VALUES);
  assert.equal(
    createRequestRustValues - STRESS_DOCUMENT_RUST_VALUES,
    2,
  );
  assert.deepEqual(predecessorPropertyLimitFailure(JSON.parse(createRequestJson)), {
    failureVersion: 1,
    code: "codec.property-limit",
    limit: DEFAULT_CAPTURE_PROPERTY_LIMIT,
    actual: DEFAULT_CAPTURE_PROPERTY_LIMIT + 1,
  });

  const directPublic = createRustKernelSmokeSession(addon, directDocument);
  const directPublicHandle = requirePublicHandle(directPublic);
  const clonedRawHandle = requireRawHandle(addon.createKernelSessionV1(suppliedRequest));
  const firstRawRead = addon.readKernelSessionV1(directPublicHandle);
  const secondRawRead = addon.readKernelSessionV1(directPublicHandle);
  assert.deepEqual(firstRawRead, secondRawRead);
  assert.equal(firstRawRead.byteLength, STRESS_READ_WRAPPER_BYTES);
  const firstRawPayload = parseRawPayload(firstRawRead);
  assert.equal(countJsonValues(firstRawPayload), STRESS_READ_RESPONSE_RUST_VALUES);
  assert.equal(countCapturedMembers(firstRawPayload), STRESS_READ_RESPONSE_TYPESCRIPT_MEMBERS);
  const rawValue = firstRawPayload.value as {
    readonly snapshot: { readonly document: typeof clonedDocument };
  };
  const rawExport = rawValue.snapshot.document;
  const canonicalExportJson = JSON.stringify(rawExport);
  assert.equal(Buffer.byteLength(canonicalExportJson, "utf8"), STRESS_INPUT_SCORE_BYTES);
  assert.equal(sha256(canonicalExportJson), STRESS_RUST_CANONICAL_EXPORT_SHA256);
  assert.notEqual(canonicalExportJson, inputScoreJson);
  const expectedSemanticHash = semanticHash(expectedDocument);
  assert.equal(semanticHash(rawExport), expectedSemanticHash);
  const expectedExtensionsHash = semanticHash(expectedDocument.extensions);
  assert.equal(semanticHash(rawExport.extensions), expectedExtensionsHash);

  (clonedDocument.metadata as { title: string }).title = "mutated after create";
  const firstPublicRead = readRustKernelSmokeSession(
    addon,
    clonedRawHandle as OpaqueKernelSessionHandle,
  );
  const secondPublicRead = readRustKernelSmokeSession(
    addon,
    clonedRawHandle as OpaqueKernelSessionHandle,
  );
  assert.equal(
    sha256(JSON.stringify(firstPublicRead)),
    sha256(JSON.stringify(secondPublicRead)),
  );
  assert.equal(firstPublicRead.status, "ok");
  if (firstPublicRead.status !== "ok") assert.fail("public read must succeed");
  assert.equal(
    semanticHash(firstPublicRead.value.snapshot.document),
    expectedSemanticHash,
  );
  assert.equal(
    semanticHash(
      (firstPublicRead.value.snapshot.document as typeof clonedDocument).extensions,
    ),
    expectedExtensionsHash,
  );
  assert.equal(Object.isFrozen(firstPublicRead.value.snapshot.document), true);

  const counts = collectStressCounts(expectedDocument);
  assert.deepEqual(counts, {
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

  const elapsedMicros = Number((process.hrtime.bigint() - started) / 1_000n);
  const peakRssBytes = Math.max(
    process.memoryUsage().rss,
    process.resourceUsage().maxRSS * 1_024,
  );
  const evidence: P3bEvidenceV1 = {
    schemaVersion: 1,
    status: "ok",
    fixtureId: "cvn7-stress-v1",
    counts: {
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
      documentRustValues: STRESS_DOCUMENT_RUST_VALUES,
      documentTypescriptMembers: STRESS_CLONED_TREE_MEMBERS,
      createRequestRustValues: STRESS_CREATE_REQUEST_RUST_VALUES,
      createRequestTypescriptMembers: STRESS_CREATE_REQUEST_TYPESCRIPT_MEMBERS,
      requestEnvelopeValues: 2,
      readResponseRustValues: STRESS_READ_RESPONSE_RUST_VALUES,
      readResponseTypescriptMembers: STRESS_READ_RESPONSE_TYPESCRIPT_MEMBERS,
      directDagCaptureMembers: STRESS_DIRECT_DAG_MEMBERS,
    },
    bytes: {
      inputScore: STRESS_INPUT_SCORE_BYTES,
      createRequest: STRESS_CREATE_REQUEST_BYTES,
      readResponse: STRESS_READ_WRAPPER_BYTES,
      rustCanonicalExport: STRESS_INPUT_SCORE_BYTES,
    },
    hashes: {
      inputScoreSha256: STRESS_INPUT_SCORE_SHA256,
      rustCanonicalExportSha256: STRESS_RUST_CANONICAL_EXPORT_SHA256,
    },
    proofs: {
      realDecodeCreateRequest: true,
      directDagRawJourney: true,
      directDagPublicJourney: true,
      clonedTreeRawJourney: true,
      clonedTreePublicJourney: true,
      repeatedRawReadStable: true,
      repeatedPublicReadStable: true,
      semanticDeepEqual: true,
      extensionsDeepEqual: true,
      predecessorRejected: true,
      zeroPartialPublication: true,
    },
    diagnostics: {
      workloadElapsedMicros: elapsedMicros,
      peakRssBytes,
    },
  };
  const compact = JSON.stringify(evidence);
  parseExactP3bEvidence(compact);
  const temporaryResult = `${resultPath}.tmp`;
  writeFileSync(temporaryResult, compact, "utf8");
  renameSync(temporaryResult, resultPath);
  writeSync(process.stdout.fd, `${P3B_SENTINEL_PREFIX}${compact}\n`, undefined, "utf8");
}

async function terminateChildTree(
  child: ChildProcess,
  state: P3bSettlementState,
): Promise<void> {
  if (child.pid === undefined || state.terminateStatus !== "not-required") return;
  const invocation = taskkillInvocation(child.pid);
  await new Promise<void>((resolveTermination) => {
    let settled = false;
    const taskkill = spawn(invocation.file, invocation.args, {
      shell: invocation.shell,
      windowsHide: invocation.windowsHide,
      stdio: "ignore",
    });
    const guard = setTimeout(() => {
      if (settled) return;
      settled = true;
      taskkill.kill();
      recordTerminateStatus(state, "timeout");
      resolveTermination();
    }, P3B_SETTLEMENT_GUARD_MS);
    taskkill.once("error", () => {
      if (settled) return;
      settled = true;
      clearTimeout(guard);
      recordTerminateStatus(state, "launch-error");
      resolveTermination();
    });
    taskkill.once("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(guard);
      recordTerminateStatus(state, code === 0 ? "succeeded" : "nonzero");
      resolveTermination();
    });
  });
}

interface P3bProcessResult {
  readonly evidence: P3bEvidenceV1;
  readonly cleanupRecovered: boolean;
  readonly wallElapsedMicros: number;
}

async function runP3bSelfWorkerProcess(): Promise<P3bProcessResult> {
  const scratchRoot = path.resolve(
    process.cwd(),
    "..",
    ".scratch/rkp1a-property-cap/p3b",
  );
  assert.equal(path.parse(scratchRoot).root.toUpperCase(), "E:\\");
  const leaf = path.join(
    scratchRoot,
    `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  );
  const childTemp = path.join(leaf, "tmp");
  const requestPath = path.join(leaf, "request.json");
  const resultPath = path.join(leaf, "result.json");
  const stdoutPath = path.join(leaf, "stdout.txt");
  const stderrPath = path.join(leaf, "stderr.txt");
  mkdirSync(childTemp, { recursive: true });
  const fixture = createStressCvn7Score();
  const request = Buffer.from(
    JSON.stringify({
      apiVersion: 1,
      document: JSON.parse(JSON.stringify(fixture.document)) as unknown,
    }),
    "utf8",
  );
  assert.equal(request.byteLength, STRESS_CREATE_REQUEST_BYTES);
  writeFileSync(requestPath, request);

  const state = newSettlementState();
  const started = process.hrtime.bigint();
  let stdout = Buffer.alloc(0);
  let stderr = Buffer.alloc(0);
  let child: ChildProcess;
  try {
    const env = { ...process.env };
    delete env.NODE_TEST_CONTEXT;
    Object.assign(env, {
      [P3B_WORKER_MODE_ENV]: "1",
      [P3B_WORKER_REQUEST_ENV]: requestPath,
      [P3B_WORKER_RESULT_ENV]: resultPath,
      TEMP: childTemp,
      TMP: childTemp,
      CARGO_INCREMENTAL: "0",
    });
    child = spawn(process.execPath, [path.resolve(__filename), P3B_WORKER_ARGUMENT], {
      cwd: process.cwd(),
      env,
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch {
    observeFailure(state, "p3b.spawn-failed");
    const cleanup = await cleanupOwnedLeaf(leaf);
    state.cleanupStatus = cleanup.status;
    state.cleanupRecovered = cleanup.recovered;
    if (cleanup.status === "failed") observeFailure(state, "p3b.cleanup-failed");
    throw new Error(state.primary);
  }

  type CloseResult = {
    readonly code: number | null;
    readonly signal: NodeJS.Signals | null;
  };
  let resolveClose!: (result: CloseResult) => void;
  const closeObserved = new Promise<CloseResult>((resolve) => {
    resolveClose = resolve;
  });
  let resolveSettlement!: (result: CloseResult) => void;
  const settled = new Promise<CloseResult>((resolve) => {
    resolveSettlement = resolve;
  });
  void closeObserved.then(resolveSettlement);
  let termination: Promise<void> | undefined;
  const requestTermination = () => {
    termination ??= (async () => {
      await terminateChildTree(child, state);
      const reaped = await Promise.race([
        closeObserved.then(() => true),
        delay(P3B_SETTLEMENT_GUARD_MS).then(() => false),
      ]);
      if (reaped) {
        recordReapStatus(state, "succeeded");
      } else {
        recordReapStatus(state, "timeout");
        resolveSettlement({ code: null, signal: null });
      }
    })();
  };
  child.stdout?.on("data", (chunk: Buffer) => {
    if (stdout.byteLength + chunk.byteLength > P3B_OUTPUT_LIMIT) {
      observeFailure(state, "p3b.stdout-overflow");
      void requestTermination();
      return;
    }
    stdout = Buffer.concat([stdout, chunk]);
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    if (stderr.byteLength + chunk.byteLength > P3B_OUTPUT_LIMIT) {
      observeFailure(state, "p3b.stderr-overflow");
      void requestTermination();
      return;
    }
    stderr = Buffer.concat([stderr, chunk]);
  });
  const timeout = setTimeout(() => {
    observeFailure(state, "p3b.timeout");
    void requestTermination();
  }, P3B_TIMEOUT_MS);
  child.once("error", () => {
    observeFailure(state, "p3b.spawn-failed");
    void requestTermination();
  });
  child.once("close", (code, signal) => resolveClose({ code, signal }));
  const close = await settled;
  clearTimeout(timeout);
  if (termination) await termination;
  if (close.signal !== null) observeFailure(state, "p3b.signal");
  if (close.code !== 0) observeFailure(state, "p3b.nonzero-exit");
  writeFileSync(stdoutPath, stdout);
  writeFileSync(stderrPath, stderr);

  let evidence: P3bEvidenceV1 | undefined;
  if (state.primary === undefined) {
    try {
      evidence = parseSingleP3bSentinel(stdout, stderr);
      assert.equal(readFileSync(resultPath, "utf8"), JSON.stringify(evidence));
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      const known = message as P3bFailureCode;
      observeFailure(
        state,
        known.startsWith("p3b.") ? known : "p3b.sentinel-malformed",
      );
    }
  }
  child.stdout?.destroy();
  child.stderr?.destroy();
  const cleanup = await cleanupOwnedLeaf(leaf);
  state.cleanupStatus = cleanup.status;
  state.cleanupRecovered = cleanup.recovered;
  if (cleanup.status === "failed") observeFailure(state, "p3b.cleanup-failed");
  if (state.primary !== undefined || evidence === undefined) {
    throw new Error(state.primary ?? "p3b.semantic-mismatch");
  }
  return {
    evidence,
    cleanupRecovered: state.cleanupRecovered,
    wallElapsedMicros: Number((process.hrtime.bigint() - started) / 1_000n),
  };
}

const P3B_WORKER_ENTRY = isP3bWorkerEntry({
  argv: process.argv,
  env: process.env,
  filename: __filename,
});

if (P3B_WORKER_ENTRY) {
  try {
    runP3bWorker();
    process.exit(0);
  } catch {
    writeSync(process.stderr.fd, "p3b-self-worker-failed\n", undefined, "utf8");
    process.exit(1);
  }
} else {

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
  "native create and read capture admit stress DAG and cloned tree representations",
  { timeout: 120_000 },
  () => {
    const directDocument = createStressCvn7Score().document;
    const clonedDocument = JSON.parse(
      JSON.stringify(directDocument),
    ) as unknown;
    assert.equal(
      countCapturedMembers(directDocument),
      STRESS_DIRECT_DAG_MEMBERS,
      "shared fixture references are a DAG representation fact below the predecessor cap",
    );
    assert.ok(STRESS_DIRECT_DAG_MEMBERS <= DEFAULT_CAPTURE_PROPERTY_LIMIT);
    assert.equal(
      countCapturedMembers(clonedDocument),
      STRESS_CLONED_TREE_MEMBERS,
      "the equivalent JSON tree requires the successor native-wire-v1 profile",
    );
    assert.ok(STRESS_CLONED_TREE_MEMBERS > DEFAULT_CAPTURE_PROPERTY_LIMIT);

    let createCalls = 0;
    let readCalls = 0;
    const capturedRequests: Buffer[] = [];
    const readBytes = readPayload(clonedDocument);
    assert.equal(readBytes.byteLength, STRESS_READ_WRAPPER_BYTES);
    const profileAddon: RustKernelSmokeNativeAddon = {
      createKernelSessionV1(request) {
        createCalls += 1;
        assert.ok(Buffer.isBuffer(request));
        capturedRequests.push(Buffer.from(request as Buffer));
        return { payload: createdPayload(), handle: {} };
      },
      readKernelSessionV1() {
        readCalls += 1;
        return readBytes;
      },
    };

    const directOutcome = createRustKernelSmokeSession(
      profileAddon,
      directDocument,
    );
    const clonedOutcome = createRustKernelSmokeSession(
      profileAddon,
      clonedDocument,
    );
    assert.equal(createCalls, 2);
    assert.equal(capturedRequests.length, 2);
    assert.equal(directOutcome.result.status, "created");
    assert.equal(clonedOutcome.result.status, "created");
    for (const request of capturedRequests) {
      assert.equal(request.byteLength, STRESS_CREATE_REQUEST_BYTES);
    }
    assert.equal(capturedRequests[0]?.equals(capturedRequests[1]!), true);
    if (!("handle" in clonedOutcome)) {
      assert.fail("cloned-tree create must publish one accepted fake handle");
    }

    const read = readRustKernelSmokeSession(profileAddon, clonedOutcome.handle);
    assert.equal(readCalls, 1);
    assert.equal(read.status, "ok");
    if (read.status !== "ok") {
      assert.fail("cloned-tree public read must use native-wire-v1 capture");
    }
    assert.equal(Object.isFrozen(read.value.snapshot.document), true);
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

test("P3B self-worker entry, settlement, sentinel, and cleanup fail closed", async () => {
  const filename = path.resolve("dist/test/p3b.test.js");
  const exact = {
    argv: [process.execPath, filename, P3B_WORKER_ARGUMENT],
    env: { [P3B_WORKER_MODE_ENV]: "1" },
    filename,
  };
  assert.equal(isP3bWorkerEntry(exact), true);
  assert.equal(
    isP3bWorkerEntry({ ...exact, argv: [process.execPath, filename] }),
    false,
  );
  assert.equal(
    isP3bWorkerEntry({ ...exact, env: { ...exact.env, NODE_TEST_CONTEXT: "child-v8" } }),
    false,
  );
  assert.equal(
    isP3bWorkerEntry({ ...exact, env: {}, argv: exact.argv }),
    false,
  );
  assert.equal(
    isP3bWorkerEntry({ ...exact, filename: path.resolve("other.test.js") }),
    false,
  );

  const overflowFirst = newSettlementState();
  observeFailure(overflowFirst, "p3b.stdout-overflow");
  observeFailure(overflowFirst, "p3b.timeout");
  recordTerminateStatus(overflowFirst, "nonzero");
  recordReapStatus(overflowFirst, "timeout");
  assert.equal(overflowFirst.primary, "p3b.stdout-overflow");

  const timeoutFirst = newSettlementState();
  observeFailure(timeoutFirst, "p3b.timeout");
  observeFailure(timeoutFirst, "p3b.signal");
  observeFailure(timeoutFirst, "p3b.nonzero-exit");
  assert.equal(timeoutFirst.primary, "p3b.timeout");

  for (const [status, expected] of [
    ["launch-error", "p3b.taskkill-launch-error"],
    ["nonzero", "p3b.taskkill-nonzero"],
    ["timeout", "p3b.taskkill-timeout"],
  ] as const) {
    const state = newSettlementState();
    recordTerminateStatus(state, status);
    assert.equal(state.primary, expected);
  }
  const reap = newSettlementState();
  recordReapStatus(reap, "timeout");
  assert.equal(reap.primary, "p3b.reap-timeout");
  assert.deepEqual(taskkillInvocation(1234), {
    file: "taskkill.exe",
    args: ["/PID", "1234", "/T", "/F"],
    shell: false,
    windowsHide: true,
  });

  const fixtureEvidence: P3bEvidenceV1 = {
    schemaVersion: 1,
    status: "ok",
    fixtureId: "cvn7-stress-v1",
    counts: {
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
      documentRustValues: 1_199_233,
      documentTypescriptMembers: 1_199_232,
      createRequestRustValues: 1_199_235,
      createRequestTypescriptMembers: 1_199_234,
      requestEnvelopeValues: 2,
      readResponseRustValues: 1_199_245,
      readResponseTypescriptMembers: 1_199_244,
      directDagCaptureMembers: 1_045_635,
    },
    bytes: {
      inputScore: 15_013_904,
      createRequest: 15_013_932,
      readResponse: 15_014_112,
      rustCanonicalExport: 15_013_904,
    },
    hashes: {
      inputScoreSha256: STRESS_INPUT_SCORE_SHA256,
      rustCanonicalExportSha256: STRESS_RUST_CANONICAL_EXPORT_SHA256,
    },
    proofs: {
      realDecodeCreateRequest: true,
      directDagRawJourney: true,
      directDagPublicJourney: true,
      clonedTreeRawJourney: true,
      clonedTreePublicJourney: true,
      repeatedRawReadStable: true,
      repeatedPublicReadStable: true,
      semanticDeepEqual: true,
      extensionsDeepEqual: true,
      predecessorRejected: true,
      zeroPartialPublication: true,
    },
    diagnostics: { workloadElapsedMicros: 1, peakRssBytes: 1 },
  };
  const compact = JSON.stringify(fixtureEvidence);
  const valid = Buffer.from(`${P3B_SENTINEL_PREFIX}${compact}\n`, "utf8");
  assert.deepEqual(parseSingleP3bSentinel(valid, Buffer.alloc(0)), fixtureEvidence);
  const sentinelFailures: readonly [Buffer, Buffer, string][] = [
    [Buffer.alloc(0), Buffer.alloc(0), "p3b.sentinel-missing"],
    [Buffer.from(`${P3B_SENTINEL_PREFIX}${compact}\n${P3B_SENTINEL_PREFIX}${compact}\n`), Buffer.alloc(0), "p3b.sentinel-duplicate"],
    [Buffer.from(`${P3B_SENTINEL_PREFIX}{bad}\n`), Buffer.alloc(0), "p3b.sentinel-malformed"],
    [Buffer.from(`noise\n${P3B_SENTINEL_PREFIX}${compact}\n`), Buffer.alloc(0), "p3b.sentinel-malformed"],
    [Buffer.from(`${P3B_SENTINEL_PREFIX}${JSON.stringify({ ...fixtureEvidence, extra: true })}\n`), Buffer.alloc(0), "p3b.sentinel-malformed"],
    [valid, Buffer.from("unexpected stderr"), "p3b.sentinel-malformed"],
    [Buffer.alloc(P3B_OUTPUT_LIMIT + 1), Buffer.alloc(0), "p3b.stdout-overflow"],
    [valid, Buffer.alloc(P3B_OUTPUT_LIMIT + 1), "p3b.stderr-overflow"],
  ];
  for (const [stdout, stderr, expected] of sentinelFailures) {
    assert.throws(() => parseSingleP3bSentinel(stdout, stderr), {
      message: expected,
    });
  }

  let cleanupAttempts = 0;
  const recovered = await cleanupOwnedLeaf("test-leaf", async () => {
    cleanupAttempts += 1;
    if (cleanupAttempts === 1) throw new Error("injected first cleanup failure");
  });
  assert.deepEqual(recovered, { status: "succeeded", recovered: true });
  const failed = await cleanupOwnedLeaf("test-leaf", async () => {
    throw new Error("injected persistent cleanup failure");
  });
  assert.deepEqual(failed, { status: "failed", recovered: false });
});

test(
  "P3B frozen consumer passes real raw and public native journeys",
  { timeout: P3B_TIMEOUT_MS + 15_000 },
  async (context) => {
    const result = await runP3bSelfWorkerProcess();
    assert.equal(result.cleanupRecovered, false);
    assertSafeInteger(result.wallElapsedMicros, "wall elapsed", true);
    assert.equal(result.evidence.counts.events, 102_400);
    assert.equal(result.evidence.counts.notes, 51_200);
    assert.equal(result.evidence.bytes.createRequest, STRESS_CREATE_REQUEST_BYTES);
    assert.equal(
      result.evidence.hashes.inputScoreSha256,
      STRESS_INPUT_SCORE_SHA256,
    );
    assert.equal(
      result.evidence.hashes.rustCanonicalExportSha256,
      STRESS_RUST_CANONICAL_EXPORT_SHA256,
    );
    context.diagnostic(
      JSON.stringify({
        schemaVersion: 1,
        wallElapsedMicros: result.wallElapsedMicros,
        workloadElapsedMicros:
          result.evidence.diagnostics.workloadElapsedMicros,
        peakRssBytes: result.evidence.diagnostics.peakRssBytes,
        qualification: false,
      }),
    );
  },
);
}
