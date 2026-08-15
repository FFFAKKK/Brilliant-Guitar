import assert = require("node:assert/strict");
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

import * as coreKernel from "../../../src/core-kernel/index";
import * as moduleSdk from "../../../src/core-kernel/module-sdk/index";
import { CORE_COMMAND_DEFINITIONS } from "../../../src/core-kernel/commands/catalog";
import {
  APPLICATION_RUNTIME_EXPORTS,
  BASELINE_COMMIT,
  COMMAND_IDS,
  CONTRIBUTION_ABI_FIELDS,
  FIXTURE_CONTRACTS,
  MODULE_SDK_RUNTIME_EXPORTS,
  MODULE_SDK_TYPE_EXPORTS,
  QUALIFICATION_V2_CONTRACT,
} from "./ts-oracle-fixtures";
import {
  assertExactJsonShape,
  canonicalJson,
  decodeOracleJsonl,
  decodeOracleManifest,
  sha256,
  type JsonData,
} from "./oracle-schema";
import {
  CVN6_REGISTRATION_ENTRIES,
} from "../fixtures/cvn-6-synthetic-official-modules";

const MANIFEST_PATH = "test/core-kernel/rust-migration/fixtures/oracle-manifest-v1.json";
const SCENARIOS_PATH = "test/core-kernel/rust-migration/fixtures/oracle-scenarios-v1.jsonl";
const QUALIFICATION_PATH = "test/core-kernel/rust-migration/fixtures/qualification-v2-contract.json";
const MATRIX_PATH = ".trellis/tasks/08-15-rkp-0-authority-contract-oracle-freeze/research/oracle-scenario-matrix.md";
const SDK_MATRIX_PATH = ".trellis/tasks/08-15-rkp-0-authority-contract-oracle-freeze/research/sdk-surface-migration-matrix.md";
const FAILURE_LEDGER_PATH = ".trellis/tasks/08-11-cvn-7-core-vnext-final-qualification/research/official-run-failure-ledger.jsonl";

function readJson(path: string): unknown { return JSON.parse(readFileSync(resolve(path), "utf8")); }
function normalizeLf(path: string): string { return readFileSync(resolve(path), "utf8").replace(/\r\n/g, "\n"); }

function expectThrow(callback: () => void, label: string): void {
  assert.throws(callback, TypeError, label);
}

test("RKP0-MANIFEST freezes exact public inventory names instead of count-only projections", () => {
  const manifest = decodeOracleManifest(readJson(MANIFEST_PATH));
  assert.equal(manifest.baselineCommit, BASELINE_COMMIT);
  assert.equal(manifest.persistedSchema, "brilliant-score-1");
  assert.deepEqual(manifest.applicationRuntimeExports, APPLICATION_RUNTIME_EXPORTS);
  assert.deepEqual(manifest.moduleSdkRuntimeExports, MODULE_SDK_RUNTIME_EXPORTS);
  assert.deepEqual(manifest.moduleSdkTypeExports, MODULE_SDK_TYPE_EXPORTS);
  assert.deepEqual(manifest.contributionAbiFields, CONTRIBUTION_ABI_FIELDS);
  assert.deepEqual(manifest.commandIds, COMMAND_IDS);
  assert.equal(manifest.applicationRuntimeExports.length, 51);
  assert.equal(manifest.moduleSdkRuntimeExports.length, 8);
  assert.equal(manifest.moduleSdkTypeExports.length, 34);
  assert.equal(manifest.contributionAbiFields.length, 9);
  assert.equal(new Set(manifest.applicationRuntimeExports).size, 51);
  assert.deepEqual(Object.keys(coreKernel).sort(), [...APPLICATION_RUNTIME_EXPORTS].sort());
  assert.deepEqual(Object.keys(moduleSdk).sort(), [...MODULE_SDK_RUNTIME_EXPORTS].sort());
  assert.deepEqual(CORE_COMMAND_DEFINITIONS.map((entry) => entry.commandId), COMMAND_IDS);
  assert.deepEqual(manifest.factoryModes, ["core-only", "integrated"]);
});

test("RKP0-MANIFEST compares the frozen CVN-2 8/34 SDK names and nine ABI fields", () => {
  const source = readFileSync(resolve("src/core-kernel/module-sdk/index.ts"), "utf8");
  const typeNames = Array.from(source.matchAll(/export type\s*\{([\s\S]*?)\}\s*from/gmu), (match) => match[1] ?? "")
    .flatMap((group) => group.split(","))
    .map((name) => name.trim())
    .filter((name) => name.length > 0)
    .sort();
  assert.deepEqual(typeNames, [...MODULE_SDK_TYPE_EXPORTS].sort());
  for (const entry of CVN6_REGISTRATION_ENTRIES) {
    assert.deepEqual(Object.keys(entry.contributions[0] ?? {}), CONTRIBUTION_ABI_FIELDS);
  }
});

test("RKP0-MANIFEST verifies canonical scenario hashes, whole-file hash, and authority hashes", () => {
  const manifest = decodeOracleManifest(readJson(MANIFEST_PATH));
  const text = readFileSync(resolve(SCENARIOS_PATH), "utf8");
  const scenarios = decodeOracleJsonl(text);
  assert.equal(manifest.scenarioCount, 64);
  assert.deepEqual(manifest.scenarioIds, scenarios.map((scenario) => scenario.scenarioId));
  assert.equal(manifest.scenariosFileSha256, sha256(text));
  for (const scenario of scenarios) {
    assert.equal(manifest.scenarioHashes[scenario.scenarioId], sha256(canonicalJson(scenario)), scenario.scenarioId);
  }
  assert.equal(manifest.qualificationV2ContractSha256, sha256(readFileSync(resolve(QUALIFICATION_PATH), "utf8")));
  assert.equal(manifest.scenarioSpecification.file, MATRIX_PATH);
  assert.equal(manifest.scenarioSpecification.sha256, sha256(normalizeLf(MATRIX_PATH)));
  assert.equal(manifest.sdkSurfaceSpecification.file, SDK_MATRIX_PATH);
  assert.equal(manifest.sdkSurfaceSpecification.sha256, sha256(normalizeLf(SDK_MATRIX_PATH)));
});

test("RKP0-MANIFEST strictly decodes manifest, scenario, and Qualification V2 data", () => {
  const manifest = readJson(MANIFEST_PATH) as Record<string, unknown>;
  decodeOracleManifest(manifest);
  expectThrow(() => decodeOracleManifest({ ...manifest, unexpected: true }), "manifest extra field");
  const { scenarioIds: _scenarioIds, ...missingManifest } = manifest;
  expectThrow(() => decodeOracleManifest(missingManifest), "manifest missing field");
  expectThrow(() => decodeOracleManifest({ ...manifest, scenarioHashes: { ...(manifest.scenarioHashes as Record<string, unknown>), unexpected: "hash" } }), "manifest scenario hash extra field");

  const rows = readFileSync(resolve(SCENARIOS_PATH), "utf8").split("\n");
  const firstScenario = JSON.parse(rows[0] ?? "") as Record<string, unknown>;
  expectThrow(() => decodeOracleJsonl(`${JSON.stringify({ ...firstScenario, unexpected: true })}\n`), "scenario extra field");
  const { observations: _observations, ...missingScenario } = firstScenario;
  expectThrow(() => decodeOracleJsonl(`${JSON.stringify(missingScenario)}\n`), "scenario missing field");

  const qualification = readJson(QUALIFICATION_PATH);
  assertExactJsonShape(qualification, QUALIFICATION_V2_CONTRACT as unknown as JsonData, "qualification");
  expectThrow(() => assertExactJsonShape({ ...(qualification as Record<string, unknown>), unexpected: true }, QUALIFICATION_V2_CONTRACT as unknown as JsonData, "qualification"), "qualification extra field");
  const { liveness: _liveness, ...missingQualification } = qualification as Record<string, unknown>;
  expectThrow(() => assertExactJsonShape(missingQualification, QUALIFICATION_V2_CONTRACT as unknown as JsonData, "qualification"), "qualification missing field");
});

test("RKP0-MANIFEST freezes Qualification V2 sampling, RSS, complexity, and validity precedence", () => {
  const qualification = readJson(QUALIFICATION_PATH) as Record<string, unknown>;
  assertExactJsonShape(qualification, QUALIFICATION_V2_CONTRACT as unknown as JsonData, "qualification");
  assert.deepEqual((qualification.fixtureContracts as unknown), FIXTURE_CONTRACTS);
  const sampling = qualification.sampling as Record<string, unknown>;
  assert.equal(sampling.warmupCount, 5);
  assert.equal(sampling.measuredCount, 20);
  assert.equal(sampling.isolation, "fresh-process-and-fresh-session-per-sample");
  assert.equal(sampling.timedRegion, "immediately-before-public-call-to-synchronous-result-return");
  assert.equal(sampling.p95IndexFor20, 18);
  assert.equal(sampling.p99IndexFor20, 19);
  const liveness = qualification.liveness as Record<string, unknown>;
  assert.equal(liveness.timeoutMs, null);
  assert.equal(liveness.precedence, "evidence-validity-before-performance-verdict");
  assert.equal(qualification.officialRunAuthorized, false);
});

test("RKP0-MANIFEST freezes the sole fifth CVN-7 invalid-input ledger row without partial evidence", () => {
  const lines = readFileSync(resolve(FAILURE_LEDGER_PATH), "utf8").split("\n");
  assert.equal(lines.length, 2);
  assert.equal(lines[1], "");
  assert.deepEqual(JSON.parse(lines[0] ?? ""), {
    action: "stress-submit", baselineCommit: "38afdc3fd508dc67f7aa446fd323837a5d550b70",
    candidateCommit: BASELINE_COMMIT, classification: "EVIDENCE_INVALID", coordinatorCompletedAt: "2026-08-14T23:28:00+08:00",
    evidenceValid: false, failureId: "cvn7-official-input-5", fixture: "stress", harnessCommit: BASELINE_COMMIT,
    launcherFailure: null, measurementComplete: false, mode: "all", nextOwner: "08-15-rkp-0-authority-contract-oracle-freeze",
    partialEvidence: false, phase: "memory", processExitCode: 1, requestCount: 411, requestWrittenAt: "2026-08-14T23:27:59+08:00",
    resultCount: 410, reusableEvidence: false, schemaVersion: 1, signal: null, stderrClassification: "worker-timeout",
    timeoutMs: 10800000, workerStarted: true,
    workload: { envelopes: 10000, events: 102400, notes: 51200, rssLimitBytes: 2147483648 },
  });
});

test("RKP0-MANIFEST enforces the exact implementation allowlist and keeps later RKP tasks absent", () => {
  const allowed = new Set([
    ".trellis/tasks/08-15-rkp-0-authority-contract-oracle-freeze/task.json",
    ".trellis/tasks/08-15-rkp-0-authority-contract-oracle-freeze/operator-handoff.md",
    ".trellis/tasks/08-15-rkp-0-authority-contract-oracle-freeze/review-candidate.md",
    ".trellis/tasks/08-15-core-rust-runtime-performance-remediation/task.json",
    ".trellis/tasks/08-15-core-rust-runtime-performance-remediation/implement.md",
    ".trellis/tasks/07-29-core-vnext-product-ready-extensible-kernel-completion/task.json",
    ".trellis/tasks/07-29-core-vnext-product-ready-extensible-kernel-completion/implement.md",
    ".trellis/tasks/07-29-core-vnext-product-ready-extensible-kernel-completion/research/core-vnext-performance-baseline.md",
    ".trellis/tasks/07-29-core-vnext-product-ready-extensible-kernel-completion/research/cvn-roadmap-and-stage-plan.md",
    ".trellis/tasks/08-11-cvn-7-core-vnext-final-qualification/task.json",
    ".trellis/tasks/08-11-cvn-7-core-vnext-final-qualification/operator-handoff.md",
    ".trellis/tasks/08-11-cvn-7-core-vnext-final-qualification/review-candidate.md",
    ".trellis/tasks/08-11-cvn-7-core-vnext-final-qualification/evidence/README.md",
    ".trellis/tasks/08-11-cvn-7-core-vnext-final-qualification/research/official-run-failure-ledger.jsonl",
    ".trellis/spec/core-kernel/index.md", ".trellis/spec/core-kernel/backend/index.md",
    ".trellis/spec/core-kernel/backend/rust-runtime-transition.md",
    "test/core-kernel/rust-migration/oracle-schema.ts", "test/core-kernel/rust-migration/ts-oracle-fixtures.ts",
    "test/core-kernel/rust-migration/ts-oracle-capture.test.ts", "test/core-kernel/rust-migration/oracle-manifest.test.ts",
    "test/core-kernel/rust-migration/fixtures/oracle-manifest-v1.json",
    "test/core-kernel/rust-migration/fixtures/oracle-scenarios-v1.jsonl",
    "test/core-kernel/rust-migration/fixtures/qualification-v2-contract.json",
  ]);
  const changed = [...new Set([
    ...execFileSync("git", ["diff", "--name-only", "06dccbdb927c4e80070b41718123f06b2e3ab1b2", "--"], { encoding: "utf8" })
      .split(/\r?\n/u),
    ...execFileSync("git", ["ls-files", "--others", "--exclude-standard"], { encoding: "utf8" })
      .split(/\r?\n/u),
  ])].filter((path) => path.length > 0);
  assert.deepEqual(changed.filter((path) => !allowed.has(path)), []);
  const taskDirectories = readdirSync(resolve(".trellis/tasks"));
  assert.deepEqual(taskDirectories.filter((name) => /^08-15-rkp-[1-9]/u.test(name)), []);
});
