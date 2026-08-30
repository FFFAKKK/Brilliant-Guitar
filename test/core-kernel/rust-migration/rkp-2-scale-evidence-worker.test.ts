import assert = require("node:assert/strict");
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { EventEmitter } from "node:events";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";

import {
  PRIVATE_SCALE_PROCESS_PREFIX,
  PRIVATE_SCALE_OUTER_TIMEOUT_MS,
  PRIVATE_SCALE_REAP_TIMEOUT_MS,
  PRIVATE_SCALE_STREAM_LIMIT_BYTES,
  PRIVATE_SCALE_TIMEOUT_MS,
  observePrivateScaleOwnershipForTest,
  spawnPowerShell,
  PRIVATE_SCALE_RUST_PREFIX,
  decodeProcessEnvelope,
  decodeRustEvidenceLine,
  runPrivateScaleEvidenceWorker,
} from "./rkp-2-scale-evidence-worker";

const evidence = {
  schemaVersion: 1,
  status: "ok",
  fixtureId: "cvn7-stress-v1",
  counts: {
    measures: 400,
    parts: 16,
    staves: 16,
    measureContents: 6400,
    voices: 12800,
    events: 102400,
    notes: 51200,
    extensions: 18,
    partOwnedExtensions: 16,
    unknownExtensions: 1,
  },
  bytes: { canonicalScoreBytes: 15013904, createRequestBytes: 15013932 },
  metrics: {
    entitiesVisited: 166833,
    records: { measures: 400, parts: 16, staves: 16, voices: 12800, events: 102400, notes: 51200, extensions: 18 },
    topologyEdgesVisited: 173250,
    referenceEdgesBuilt: 19216,
    timeEntriesBuilt: 102400,
    entityIndexLookups: 0,
    ownerIndexLookups: 0,
    timeIndexComparisons: 0,
    indexEntriesBuilt: 474517,
    indexRebuildEntries: 474517,
    fullDocumentMaterializations: 1,
    canonicalEncodeBytes: 15013904,
  },
  entityProbe: { stableId: "cvn7-e-00-0000-0-0", entityKind: "event", entityIndexLookupsDelta: 1, otherCounterDelta: 0 },
  ownerProbe: { entityKind: "event", ownerKind: "voice", ownerStableId: "cvn7-v-00-0000-0", ownerIndexLookupsDelta: 1, otherCounterDelta: 0 },
  parity: { normalizedProjectionEqual: true, indexEntryCountEqual: true },
  roundTrip: { semanticEqual: true, canonicalBytesEqual: true },
  ordering: { topologyCanonical: true, extensionsPreserved: true },
  workloadElapsedMicros: 1,
} as const;

function finalEnvelope(status: "ok" | "rejected" = "ok"): Buffer {
  const process = {
    exitCode: status === "ok" ? 0 : null,
    timedOut: false,
    peakWorkingSetBytes: status === "ok" ? 1 : null,
    stdoutBytes: 0,
    stderrBytes: 0,
    terminationStatus: "not-required",
    reapStatus: status === "ok" ? "succeeded" : "not-required",
    cleanupStatus: "succeeded",
  } as const;
  const payload = status === "ok"
    ? { schemaVersion: 1, status, evidence, process, partialEvidence: false }
    : { schemaVersion: 1, status, failure: { code: "process.start-failed", details: { stage: "start" } }, process, partialEvidence: false };
  return Buffer.from(`${PRIVATE_SCALE_PROCESS_PREFIX}${JSON.stringify(payload)}\n`, "utf8");
}

function failureDetails(code: string): Record<string, unknown> {
  switch (code) {
    case "process.start-failed": return { stage: "start" };
    case "process.output-limit-exceeded": return { stream: "stdout", limitBytes: 1048576 };
    case "process.timeout": return { timeoutMs: 180000 };
    case "process.nonzero-exit": return { exitCode: 7 };
    case "process.sentinel-count-invalid": return { expected: 1, actual: 0 };
    case "process.sentinel-malformed": return { stage: "json" };
    case "process.protocol-invalid": return { stage: "process", reason: "identity" };
    case "process.rss-unavailable": return { stage: "poll" };
    case "process.rss-invalid": return { reason: "zero" };
    case "evidence.counter-mismatch": return { counter: "events", expected: 102400, actual: 0 };
    case "evidence.overflow": return { field: "workloadElapsedMicros" };
    case "evidence.parity-mismatch": return { check: "normalized-index-projection" };
    case "evidence.bytes-mismatch": return { field: "canonicalScoreBytes", expected: 15013904, actual: 0 };
    case "evidence.order-mismatch": return { field: "topology" };
    case "evidence.payload-mismatch": return { field: "roundTrip" };
    case "process.cleanup-failed": return { target: "temp-directory" };
    default: throw new Error(`unknown frozen failure code: ${code}`);
  }
}

function rejectedEnvelope(code: string): Buffer {
  const cleanupOnly = code === "process.cleanup-failed";
  const stopped = code === "process.output-limit-exceeded" || code === "process.timeout";
  const normalExit = !cleanupOnly && !stopped && code !== "process.start-failed";
  const payload = {
    schemaVersion: 1,
    status: "rejected",
    failure: { code, details: failureDetails(code) },
    process: {
      exitCode: code === "process.nonzero-exit" ? 7 : normalExit || cleanupOnly ? 0 : null,
      timedOut: code === "process.timeout",
      peakWorkingSetBytes: code === "process.start-failed" ? null : 1,
      stdoutBytes: 0,
      stderrBytes: 0,
      terminationStatus: stopped ? "succeeded" : "not-required",
      reapStatus: code === "process.start-failed" ? "not-required" : "succeeded",
      cleanupStatus: cleanupOnly ? "failed" : "succeeded",
    },
    partialEvidence: false,
  };
  return Buffer.from(`${PRIVATE_SCALE_PROCESS_PREFIX}${JSON.stringify(payload)}\n`, "utf8");
}

test("Stage 6 E2 accepts the one exact internal and process sentinel", () => {
  assert.equal(decodeRustEvidenceLine(`${PRIVATE_SCALE_RUST_PREFIX}${JSON.stringify(evidence)}`).fixtureId, "cvn7-stress-v1");
  assert.equal(decodeProcessEnvelope(finalEnvelope(), Buffer.alloc(0)).status, "ok");
});

test("Stage 6 E2 rejects malformed, duplicate, mixed, and extra process sentinels fail closed", () => {
  assert.throws(() => decodeRustEvidenceLine(`${PRIVATE_SCALE_RUST_PREFIX}{`), (error: unknown) => (error as { code?: string }).code === "process.sentinel-malformed");
  assert.throws(() => decodeProcessEnvelope(Buffer.from("noise\n", "utf8"), Buffer.alloc(0)), (error: unknown) => (error as { code?: string }).code === "process.sentinel-count-invalid");
  assert.throws(() => decodeProcessEnvelope(Buffer.concat([finalEnvelope(), finalEnvelope()]), Buffer.alloc(0)), (error: unknown) => (error as { code?: string }).code === "process.sentinel-count-invalid");
  const extra = JSON.parse(finalEnvelope().toString("utf8").slice(PRIVATE_SCALE_PROCESS_PREFIX.length)) as Record<string, unknown>;
  extra.unexpected = true;
  assert.throws(() => decodeProcessEnvelope(Buffer.from(`${PRIVATE_SCALE_PROCESS_PREFIX}${JSON.stringify(extra)}\n`, "utf8"), Buffer.alloc(0)), (error: unknown) => (error as { code?: string }).code === "process.protocol-invalid");
});

test("Stage 6 E2 keeps the closed failure-code union and no partial evidence", () => {
  const codes = [
    "process.start-failed", "process.output-limit-exceeded", "process.timeout", "process.nonzero-exit",
    "process.sentinel-count-invalid", "process.sentinel-malformed", "process.protocol-invalid",
    "process.rss-unavailable", "process.rss-invalid", "evidence.counter-mismatch", "evidence.overflow",
    "evidence.parity-mismatch", "evidence.bytes-mismatch", "evidence.order-mismatch",
    "evidence.payload-mismatch", "process.cleanup-failed",
  ];
  for (const code of codes) {
    const decoded = decodeProcessEnvelope(rejectedEnvelope(code), Buffer.alloc(0));
    assert.equal(decoded.status, "rejected");
    if (decoded.status === "rejected") {
      assert.equal(decoded.failure.code, code);
      assert.equal(decoded.partialEvidence, false);
    }
    const payload = JSON.parse(rejectedEnvelope(code).toString("utf8").slice(PRIVATE_SCALE_PROCESS_PREFIX.length)) as { failure: { details: Record<string, unknown> } };
    payload.failure.details.unexpected = true;
    assert.throws(
      () => decodeProcessEnvelope(Buffer.from(`${PRIVATE_SCALE_PROCESS_PREFIX}${JSON.stringify(payload)}\n`, "utf8"), Buffer.alloc(0)),
      (error: unknown) => (error as { code?: string }).code === "process.protocol-invalid",
      `${code} must reject extra failure details`,
    );
  }
});

test("Stage 6 E2 preserves the first primary and rejects invalid settlement combinations", () => {
  const cap = JSON.parse(rejectedEnvelope("process.output-limit-exceeded").toString("utf8").slice(PRIVATE_SCALE_PROCESS_PREFIX.length)) as { process: Record<string, unknown> };
  cap.process.terminationStatus = "failed";
  cap.process.reapStatus = "failed";
  const capDecoded = decodeProcessEnvelope(Buffer.from(`${PRIVATE_SCALE_PROCESS_PREFIX}${JSON.stringify(cap)}\n`, "utf8"), Buffer.alloc(0));
  assert.equal(capDecoded.status, "rejected");
  if (capDecoded.status === "rejected") assert.equal(capDecoded.failure.code, "process.output-limit-exceeded");

  const timeout = JSON.parse(rejectedEnvelope("process.timeout").toString("utf8").slice(PRIVATE_SCALE_PROCESS_PREFIX.length)) as { process: Record<string, unknown> };
  timeout.process.reapStatus = "failed";
  const timeoutDecoded = decodeProcessEnvelope(Buffer.from(`${PRIVATE_SCALE_PROCESS_PREFIX}${JSON.stringify(timeout)}\n`, "utf8"), Buffer.alloc(0));
  assert.equal(timeoutDecoded.status, "rejected");
  if (timeoutDecoded.status === "rejected") assert.equal(timeoutDecoded.failure.code, "process.timeout");

  const zeroExitReapFailure = JSON.parse(rejectedEnvelope("process.protocol-invalid").toString("utf8").slice(PRIVATE_SCALE_PROCESS_PREFIX.length)) as { process: Record<string, unknown> };
  zeroExitReapFailure.process.exitCode = 0;
  zeroExitReapFailure.process.reapStatus = "failed";
  assert.throws(() => decodeProcessEnvelope(Buffer.from(`${PRIVATE_SCALE_PROCESS_PREFIX}${JSON.stringify(zeroExitReapFailure)}\n`, "utf8"), Buffer.alloc(0)), (error: unknown) => (error as { code?: string }).code === "process.protocol-invalid");

  const invalidZeroExitReapFailure = JSON.parse(rejectedEnvelope("process.rss-invalid").toString("utf8").slice(PRIVATE_SCALE_PROCESS_PREFIX.length)) as { process: Record<string, unknown> };
  invalidZeroExitReapFailure.process.exitCode = 0;
  invalidZeroExitReapFailure.process.reapStatus = "failed";
  assert.throws(() => decodeProcessEnvelope(Buffer.from(`${PRIVATE_SCALE_PROCESS_PREFIX}${JSON.stringify(invalidZeroExitReapFailure)}\n`, "utf8"), Buffer.alloc(0)), (error: unknown) => (error as { code?: string }).code === "process.protocol-invalid");
});

test("Stage 6 E2 preflight rejects before ownership and leaves external markers intact", () => {
  const root = mkdtempSync(join(tmpdir(), "rkp2-scale-e2-preflight-"));
  const requestRoot = join(tmpdir(), `rkp2-scale-e2-${randomBytes(32).toString("hex")}`);
  const marker = join(requestRoot, "marker.txt");
  const script = resolve(process.cwd(), "test", "core-kernel", "rust-migration", "rkp-2-scale-evidence-process.ps1");
  const invalidExe = join(root, "invalid.exe");
  const wrongExe = join(root, "wrong-command.txt");
  const invoke = (request: string, testName = "indices::tests::rkp2_stage_6_private_scale_evidence_v1", executable = invalidExe) => spawnSync(process.env.BRILLIANT_RKP2_PWSH ?? "pwsh", [
    "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", script,
    "-ExecutablePath", executable, "-RequestPath", request, "-TestName", testName,
    "-TimeoutMs", "180000", "-PollIntervalMs", "25", "-MaxStdoutBytes", "1048576", "-MaxStderrBytes", "1048576",
  ], { encoding: "buffer", windowsHide: true, shell: false });
  try {
    mkdirSync(requestRoot);
    writeFileSync(marker, "must-survive", { flag: "wx" });
    writeFileSync(join(requestRoot, "request.json"), "{}", { flag: "wx" });
    writeFileSync(invalidExe, Buffer.alloc(0), { flag: "wx" });
    writeFileSync(wrongExe, Buffer.alloc(0), { flag: "wx" });
    const preflightCases: ReadonlyArray<readonly [string, string, string]> = [
      [join(requestRoot, "missing-request.json"), "indices::tests::rkp2_stage_6_private_scale_evidence_v1", invalidExe],
      [join(requestRoot, "wrong-leaf.json"), "indices::tests::rkp2_stage_6_private_scale_evidence_v1", invalidExe],
      [join(requestRoot, "request.json"), "indices::tests::rkp2_stage_6_private_scale_evidence_v1", invalidExe],
      [join(requestRoot, "missing-request.json"), "wrong::test", invalidExe],
      [join(requestRoot, "missing-request.json"), "indices::tests::rkp2_stage_6_private_scale_evidence_v1", wrongExe],
    ];
    for (const [request, testName, executable] of preflightCases) {
      const result = invoke(request, testName, executable);
      assert.equal(result.status, 0);
      const decoded = decodeProcessEnvelope(result.stdout, result.stderr);
      assert.equal(decoded.status, "rejected");
      if (decoded.status === "rejected") {
        assert.deepEqual(decoded.failure, { code: "process.protocol-invalid", details: { stage: "arguments", reason: "identity" } });
        assert.equal(decoded.process.exitCode, null);
        assert.equal(decoded.process.terminationStatus, "not-required");
        assert.equal(decoded.process.reapStatus, "not-required");
      }
      assert.equal(readFileSync(marker, "utf8"), "must-survive");
      assert.equal(existsSync(requestRoot), true);
    }
  } finally {
    rmSync(requestRoot, { recursive: true, force: true, maxRetries: 2, retryDelay: 25 });
    rmSync(root, { recursive: true, force: true, maxRetries: 2, retryDelay: 25 });
  }
});

test("Stage 6 E2 real post-handoff Start-Process failure is bounded and cleans its owned root", () => {
  const root = mkdtempSync(join(tmpdir(), "rkp2-scale-e2-start-failure-"));
  const token = randomBytes(32).toString("hex");
  const requestRoot = join(tmpdir(), `rkp2-scale-e2-${token}`);
  const request = join(requestRoot, "request.json");
  const marker = join(requestRoot, "ownership.json");
  const invalidExe = join(root, "invalid-libtest.exe");
  const script = resolve(process.cwd(), "test", "core-kernel", "rust-migration", "rkp-2-scale-evidence-process.ps1");
  try {
    mkdirSync(requestRoot);
    writeFileSync(request, "{}", { flag: "wx" });
    writeFileSync(marker, JSON.stringify({ schemaVersion: 1, state: "offered", token }), { flag: "wx" });
    writeFileSync(invalidExe, Buffer.alloc(0), { flag: "wx" });
    const result = spawnSync(process.env.BRILLIANT_RKP2_PWSH ?? "pwsh", [
      "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", script,
      "-ExecutablePath", invalidExe, "-RequestPath", request,
      "-TestName", "indices::tests::rkp2_stage_6_private_scale_evidence_v1",
      "-TimeoutMs", "180000", "-PollIntervalMs", "25",
      "-MaxStdoutBytes", "1048576", "-MaxStderrBytes", "1048576",
    ], { encoding: "buffer", windowsHide: true, shell: false });
    assert.equal(result.status, 0);
    assert.equal(result.error, undefined);
    const decoded = decodeProcessEnvelope(result.stdout, result.stderr);
    assert.equal(decoded.status, "rejected");
    if (decoded.status === "rejected") {
      assert.deepEqual(decoded.failure, { code: "process.start-failed", details: { stage: "start" } });
      assert.equal(decoded.process.cleanupStatus, "succeeded");
      assert.equal(decoded.process.terminationStatus, "not-required");
      assert.equal(decoded.process.reapStatus, "not-required");
    }
    assert.equal(existsSync(requestRoot), false);
  } finally {
    rmSync(requestRoot, { recursive: true, force: true, maxRetries: 2, retryDelay: 25 });
    rmSync(root, { recursive: true, force: true, maxRetries: 2, retryDelay: 25 });
  }
});

test("Stage 6 E2 PowerShell wrapper retains the frozen process mechanics", () => {
  const script = readFileSync(join(process.cwd(), "test", "core-kernel", "rust-migration", "rkp-2-scale-evidence-process.ps1"), "utf8");
  assert.match(script, /Start-Process[\s\S]*-WindowStyle Hidden[\s\S]*-PassThru[\s\S]*-RedirectStandardOutput/u);
  assert.match(script, /taskkill\.exe[\s\S]*\/PID[\s\S]*\/T[\s\S]*\/F/u);
  assert.match(script, /request[\s\S]*stdout[\s\S]*stderr[\s\S]*temp-directory/u);
  assert.match(script, /BRILLIANT_RKP2_SCALE_PROCESS_V1:/u);
});

test("Stage 6 E2 runs the one real private scale journey only when explicitly enabled", { skip: process.env.BRILLIANT_RKP2_RUN_SCALE_E2 === "1" ? false : "requires explicit E2 stress authorization" }, async () => {
  const result = await runPrivateScaleEvidenceWorker();
  assert.equal(result.envelope.evidence.counts.events, 102400);
  assert.equal(result.envelope.evidence.metrics.fullDocumentMaterializations, 1);
  assert.ok(result.wallElapsedMicros > 0);
});

class FakeChild extends EventEmitter {
  readonly stdout = new EventEmitter();
  readonly stderr = new EventEmitter();
  readonly pid = 4242;
  killCalls = 0;
  kill(): boolean { this.killCalls += 1; return true; }
}

function asSpawnChild(child: FakeChild): ReturnType<typeof spawn> {
  return child as unknown as ReturnType<typeof spawn>;
}

function createFakeTimers(): {
  readonly scheduled: Array<{ readonly delay: number; readonly callback: () => void; cleared: boolean }>;
  readonly setTimer: typeof setTimeout;
  readonly clearTimer: typeof clearTimeout;
} {
  const scheduled: Array<{ readonly delay: number; readonly callback: () => void; cleared: boolean }> = [];
  return {
    scheduled,
    setTimer: ((callback: () => void, delay?: number) => {
      const timer = { delay: delay ?? 0, callback, cleared: false };
      scheduled.push(timer);
      return timer as unknown as NodeJS.Timeout;
    }) as typeof setTimeout,
    clearTimer: ((timer: NodeJS.Timeout) => { (timer as unknown as { cleared: boolean }).cleared = true; }) as typeof clearTimeout,
  };
}

async function settleFakeCase(first: "overflow" | "timeout"): Promise<{
  readonly result: Awaited<ReturnType<typeof spawnPowerShell>>;
  readonly scheduled: ReadonlyArray<{ readonly delay: number; readonly callback: () => void; cleared: boolean }>;
  readonly calls: readonly string[];
}> {
  const wrapper = new FakeChild();
  const taskkill = new FakeChild();
  const timers = createFakeTimers();
  const calls: string[] = [];
  const promise = spawnPowerShell("worker.ps1", "libtest.exe", "request.json", {
    now: () => 0,
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer,
    spawnProcess: ((command: string) => {
      calls.push(command);
      return asSpawnChild(calls.length === 1 ? wrapper : taskkill);
    }) as typeof spawn,
  });
  if (first === "overflow") {
    wrapper.stdout.emit("data", Buffer.alloc(PRIVATE_SCALE_STREAM_LIMIT_BYTES + 1));
  } else {
    const workload = timers.scheduled.find((timer) => timer.delay === PRIVATE_SCALE_TIMEOUT_MS);
    assert.ok(workload);
    workload.callback();
  }
  taskkill.emit("close", 0);
  wrapper.emit("close", null);
  return { result: await promise, scheduled: timers.scheduled, calls };
}

test("Stage 6 E2 drives timeout and overflow through the production outer settlement machine", async () => {
  const overflow = await settleFakeCase("overflow");
  assert.equal(overflow.result.firstFailure, "process.output-limit-exceeded");
  assert.equal(overflow.result.terminationStatus, "succeeded");
  assert.equal(overflow.result.reapStatus, "succeeded");
  assert.equal(overflow.calls.length, 2);
  assert.ok(overflow.scheduled.some((timer) => timer.delay === PRIVATE_SCALE_TIMEOUT_MS));
  assert.ok(overflow.scheduled.some((timer) => timer.delay === PRIVATE_SCALE_OUTER_TIMEOUT_MS));
  assert.ok(overflow.scheduled.some((timer) => timer.delay === PRIVATE_SCALE_REAP_TIMEOUT_MS));

  const timeout = await settleFakeCase("timeout");
  assert.equal(timeout.result.firstFailure, "process.timeout");
  assert.equal(timeout.result.timedOut, true);
  assert.equal(timeout.result.terminationStatus, "succeeded");
  assert.equal(timeout.result.reapStatus, "succeeded");
});

test("Stage 6 E2 outer settlement rejects start failures before any process state is fabricated", async () => {
  const timers = createFakeTimers();
  const result = await spawnPowerShell("worker.ps1", "libtest.exe", "request.json", {
    now: () => 0,
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer,
    spawnProcess: (() => { throw new Error("synthetic start failure"); }) as typeof spawn,
  });
  assert.equal(result.firstFailure, "process.start-failed");
  assert.equal(result.exitCode, null);
  assert.equal(result.terminationStatus, "not-required");
  assert.equal(result.reapStatus, "not-required");
  assert.ok(timers.scheduled.every((timer) => timer.cleared));
});

test("Stage 6 E2 settles ownership only after wrapper closure and never re-owns unknown residue", () => {
  const token = randomBytes(32).toString("hex");
  const leaf = join(tmpdir(), `rkp2-scale-e2-${token}`);
  try {
    mkdirSync(leaf);
    writeFileSync(join(leaf, "request.json"), "{}", { flag: "wx" });
    writeFileSync(join(leaf, "ownership.json"), JSON.stringify({ schemaVersion: 1, state: "offered", token }), { flag: "wx" });
    assert.equal(observePrivateScaleOwnershipForTest(leaf, token), "offered");
    writeFileSync(join(leaf, "ownership.json"), JSON.stringify({ schemaVersion: 1, state: "accepted", token }), { flag: "w" });
    assert.equal(observePrivateScaleOwnershipForTest(leaf, token), "accepted-residue");
    writeFileSync(join(leaf, "ownership.json"), "{", { flag: "w" });
    assert.equal(observePrivateScaleOwnershipForTest(leaf, token), "unknown");
    rmSync(leaf, { recursive: true, force: true });
    assert.equal(observePrivateScaleOwnershipForTest(leaf, token), "root-absent");
  } finally {
    rmSync(leaf, { recursive: true, force: true, maxRetries: 2, retryDelay: 25 });
  }
});

test("Stage 6 E2 rejects impossible process envelopes rather than inventing state", () => {
  const startWithRss = JSON.parse(rejectedEnvelope("process.start-failed").toString("utf8").slice(PRIVATE_SCALE_PROCESS_PREFIX.length)) as { process: Record<string, unknown> };
  startWithRss.process.peakWorkingSetBytes = 1;
  assert.throws(() => decodeProcessEnvelope(Buffer.from(`${PRIVATE_SCALE_PROCESS_PREFIX}${JSON.stringify(startWithRss)}\\n`, "utf8"), Buffer.alloc(0)));
  const cleanupWithoutNormalExit = JSON.parse(rejectedEnvelope("process.cleanup-failed").toString("utf8").slice(PRIVATE_SCALE_PROCESS_PREFIX.length)) as { process: Record<string, unknown> };
  cleanupWithoutNormalExit.process.exitCode = null;
  cleanupWithoutNormalExit.process.reapStatus = "not-required";
  assert.throws(() => decodeProcessEnvelope(Buffer.from(`${PRIVATE_SCALE_PROCESS_PREFIX}${JSON.stringify(cleanupWithoutNormalExit)}\\n`, "utf8"), Buffer.alloc(0)));
  const counterWithAbnormalExit = JSON.parse(rejectedEnvelope("evidence.counter-mismatch").toString("utf8").slice(PRIVATE_SCALE_PROCESS_PREFIX.length)) as { process: Record<string, unknown> };
  counterWithAbnormalExit.process.exitCode = null;
  counterWithAbnormalExit.process.reapStatus = "not-required";
  assert.throws(() => decodeProcessEnvelope(Buffer.from(`${PRIVATE_SCALE_PROCESS_PREFIX}${JSON.stringify(counterWithAbnormalExit)}\\n`, "utf8"), Buffer.alloc(0)));
});