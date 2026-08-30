import assert = require("node:assert/strict");
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";

import {
  PRIVATE_SCALE_PROCESS_PREFIX,
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

function rejectedEnvelope(code: string): Buffer {
  const payload = {
    schemaVersion: 1,
    status: "rejected",
    failure: { code, details: code === "process.start-failed" ? { stage: "start" } : { stage: "process", reason: "identity" } },
    process: {
      exitCode: null,
      timedOut: false,
      peakWorkingSetBytes: null,
      stdoutBytes: 0,
      stderrBytes: 0,
      terminationStatus: "not-required",
      reapStatus: "not-required",
      cleanupStatus: "succeeded",
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
  }
});

test("Stage 6 E2 real post-handoff Start-Process failure is bounded and cleans its owned root", () => {
  const root = mkdtempSync(join(tmpdir(), "rkp2-scale-e2-start-failure-"));
  const requestRoot = join(root, "owned");
  const request = join(requestRoot, "request.json");
  const invalidExe = join(root, "invalid-libtest.exe");
  const script = resolve(process.cwd(), "test", "core-kernel", "rust-migration", "rkp-2-scale-evidence-process.ps1");
  try {
    mkdirSync(requestRoot);
    writeFileSync(request, "{}", { flag: "wx" });
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
