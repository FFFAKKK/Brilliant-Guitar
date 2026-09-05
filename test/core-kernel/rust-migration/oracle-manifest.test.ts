import assert = require("node:assert/strict");
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
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
  canonicalJson,
  decodeExactJsonText,
  decodeOracleJsonlText,
  decodeOracleManifestText,
  sha256,
  type JsonData,
} from "./oracle-schema";
import {
  CVN6_REGISTRATION_ENTRIES,
} from "../fixtures/cvn-6-synthetic-official-modules";

const MANIFEST_PATH = "test/core-kernel/rust-migration/fixtures/oracle-manifest-v1.json";
const SCENARIOS_PATH = "test/core-kernel/rust-migration/fixtures/oracle-scenarios-v1.jsonl";
const QUALIFICATION_PATH = "test/core-kernel/rust-migration/fixtures/qualification-v2-contract.json";
const ARCHIVED_RKP0_AUTHORITY_PATH = ".trellis/tasks/archive/2026-08/08-15-rkp-0-authority-contract-oracle-freeze";
const ACTIVE_RKP0_AUTHORITY_PATH = ".trellis/tasks/08-15-rkp-0-authority-contract-oracle-freeze";
const MATRIX_PATH = ".trellis/tasks/archive/2026-08/08-15-rkp-0-authority-contract-oracle-freeze/research/oracle-scenario-matrix.md";
const SDK_MATRIX_PATH = ".trellis/tasks/archive/2026-08/08-15-rkp-0-authority-contract-oracle-freeze/research/sdk-surface-migration-matrix.md";
const FAILURE_LEDGER_PATH = ".trellis/tasks/08-11-cvn-7-core-vnext-final-qualification/research/official-run-failure-ledger.jsonl";
const BOUNDED_REPAIR_BASE = "6073b2a9c4478d5313d4a4206324eaf0c0dfa1ef";
const BOUNDED_REPAIR_CANDIDATE = "9bc53901a0e205a99865b21c56dc80ff1112f3a7";

const RAW_FIXTURES = [
  { path: MANIFEST_PATH, byteLength: 15168, sha256: "3814ed1da21f8de7135a71ab3e4b0a1ba888a76e6163ed1868756353005dabf7" },
  { path: SCENARIOS_PATH, byteLength: 1307605, sha256: "9761691b07082f5434126f2048f91ad415f91418799ec6bf316c2ae4d2fb9cb2" },
  { path: QUALIFICATION_PATH, byteLength: 2982, sha256: "7059cb088d064d4d4450bd23830ac6bce0259070d6e08ce54b5b3d4c4e0cde05" },
] as const;

function readText(path: string): string { return readFileSync(resolve(path), "utf8"); }
function parseTrustedJson(text: string): Record<string, unknown> { return JSON.parse(text) as Record<string, unknown>; }
function readTrackedBlob(path: string): string {
  return execFileSync("git", ["show", `HEAD:${path}`], { encoding: "utf8" });
}

function expectThrow(callback: () => void, label: string): void {
  assert.throws(callback, TypeError, label);
}

function assertDeepFrozen(value: unknown, label: string): void {
  if (value === null || typeof value !== "object") return;
  assert.equal(Object.isFrozen(value), true, `${label} frozen`);
  for (const [key, child] of Object.entries(value)) assertDeepFrozen(child, `${label}.${key}`);
}

test("RKP0-MANIFEST freezes exact public inventory, SDK, and ABI names instead of count-only projections", () => {
  const manifest = decodeOracleManifestText(readText(MANIFEST_PATH));
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
  const source = readText("src/core-kernel/module-sdk/index.ts");
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
  const manifest = decodeOracleManifestText(readText(MANIFEST_PATH));
  const text = readText(SCENARIOS_PATH);
  const scenarios = decodeOracleJsonlText(text);
  assert.equal(manifest.scenarioCount, 64);
  assert.deepEqual(manifest.scenarioIds, scenarios.map((scenario) => scenario.scenarioId));
  assert.equal(manifest.scenariosFileSha256, sha256(text));
  for (const scenario of scenarios) {
    assert.equal(manifest.scenarioHashes[scenario.scenarioId], sha256(canonicalJson(scenario)), scenario.scenarioId);
  }
  assert.equal(manifest.qualificationV2ContractSha256, sha256(readFileSync(resolve(QUALIFICATION_PATH))));
  assert.equal(manifest.scenarioSpecification.file, MATRIX_PATH);
  assert.equal(manifest.scenarioSpecification.sha256, sha256(readTrackedBlob(MATRIX_PATH)));
  assert.equal(manifest.sdkSurfaceSpecification.file, SDK_MATRIX_PATH);
  assert.equal(manifest.sdkSurfaceSpecification.sha256, sha256(readTrackedBlob(SDK_MATRIX_PATH)));
});

test("RKP0-MANIFEST decoders accept raw text only and reject exact-shape drift", () => {
  const manifestText = readText(MANIFEST_PATH);
  const manifest = parseTrustedJson(manifestText);
  decodeOracleManifestText(manifestText);
  expectThrow(() => decodeOracleManifestText(JSON.stringify({ ...manifest, unexpected: true })), "manifest extra field");
  const { scenarioIds: _scenarioIds, ...missingManifest } = manifest;
  expectThrow(() => decodeOracleManifestText(JSON.stringify(missingManifest)), "manifest missing field");
  expectThrow(() => decodeOracleManifestText(JSON.stringify({ ...manifest, scenarioHashes: { ...(manifest.scenarioHashes as Record<string, unknown>), unexpected: "hash" } })), "manifest scenario hash extra field");

  const rows = readText(SCENARIOS_PATH).split("\n");
  const firstScenario = parseTrustedJson(rows[0] ?? "");
  expectThrow(() => decodeOracleJsonlText(`${JSON.stringify({ ...firstScenario, unexpected: true })}\n`), "scenario extra field");
  const { observations: _observations, ...missingScenario } = firstScenario;
  expectThrow(() => decodeOracleJsonlText(`${JSON.stringify(missingScenario)}\n`), "scenario missing field");

  const qualificationText = readText(QUALIFICATION_PATH);
  const qualification = parseTrustedJson(qualificationText);
  decodeExactJsonText(qualificationText, QUALIFICATION_V2_CONTRACT as unknown as JsonData, "qualification");
  expectThrow(() => decodeExactJsonText(JSON.stringify({ ...qualification, unexpected: true }), QUALIFICATION_V2_CONTRACT as unknown as JsonData, "qualification"), "qualification extra field");
  const { liveness: _liveness, ...missingQualification } = qualification;
  expectThrow(() => decodeExactJsonText(JSON.stringify(missingQualification), QUALIFICATION_V2_CONTRACT as unknown as JsonData, "qualification"), "qualification missing field");
});

test("RKP0-MANIFEST rejects hostile non-string inputs before reflection and freezes detached results", () => {
  let getterCalls = 0;
  const accessor = {};
  Object.defineProperty(accessor, "unexpected", {
    enumerable: true,
    get: () => { getterCalls += 1; return "never-read"; },
  });
  let proxyTraps = 0;
  const proxy = new Proxy({}, {
    get: () => { proxyTraps += 1; return undefined; },
    getOwnPropertyDescriptor: () => { proxyTraps += 1; return undefined; },
    ownKeys: () => { proxyTraps += 1; return []; },
  });
  const sparseArray = new Array(2);
  sparseArray[1] = "present";
  const sparseObject = { 0: "present", 2: "present" };
  const decoders: readonly ((input: unknown) => unknown)[] = [
    (input) => decodeOracleManifestText(input),
    (input) => decodeOracleJsonlText(input),
    (input) => decodeExactJsonText(input, QUALIFICATION_V2_CONTRACT as unknown as JsonData, "qualification"),
  ];
  for (const decode of decoders) {
    expectThrow(() => decode(accessor), "accessor input");
    expectThrow(() => decode(proxy), "Proxy input");
    expectThrow(() => decode(sparseArray), "sparse array input");
    expectThrow(() => decode(sparseObject), "sparse object input");
  }
  assert.equal(getterCalls, 0);
  assert.equal(proxyTraps, 0);

  const manifest = decodeOracleManifestText(readText(MANIFEST_PATH));
  const qualification = decodeExactJsonText(readText(QUALIFICATION_PATH), QUALIFICATION_V2_CONTRACT as unknown as JsonData, "qualification");
  assertDeepFrozen(manifest, "manifest");
  assertDeepFrozen(qualification, "qualification");
  const originalCommandId = manifest.commandIds[0];
  assert.throws(() => { (manifest.commandIds as string[])[0] = "mutated"; }, TypeError);
  assert.equal(manifest.commandIds[0], originalCommandId);
});

test("RKP0-MANIFEST preserves raw fixture LF bytes and exact attributes", () => {
  const attributes = execFileSync("git", ["check-attr", "text", "eol", "--", ...RAW_FIXTURES.map((fixture) => fixture.path)], { encoding: "utf8" })
    .split(/\r?\n/u).filter((line) => line.length > 0);
  assert.deepEqual(attributes, RAW_FIXTURES.flatMap((fixture) => [
    `${fixture.path}: text: set`,
    `${fixture.path}: eol: lf`,
  ]));
  for (const fixture of RAW_FIXTURES) {
    const raw = readFileSync(resolve(fixture.path));
    assert.equal(raw.includes(0x0d), false, `${fixture.path} has no CR`);
    assert.equal(raw[raw.length - 1], 0x0a, `${fixture.path} has final LF`);
    assert.equal(raw.byteLength, fixture.byteLength, `${fixture.path} byte size`);
    assert.equal(sha256(raw), fixture.sha256, `${fixture.path} hash`);
  }
  const manifest = decodeOracleManifestText(readText(MANIFEST_PATH));
  assert.equal(manifest.scenariosFileSha256, RAW_FIXTURES[1].sha256);
  assert.equal(manifest.qualificationV2ContractSha256, RAW_FIXTURES[2].sha256);
});

test("RKP0-MANIFEST freezes Qualification V2 sampling, RSS, complexity, and validity precedence", () => {
  const qualification = decodeExactJsonText(readText(QUALIFICATION_PATH), QUALIFICATION_V2_CONTRACT as unknown as JsonData, "qualification") as Record<string, unknown>;
  assert.deepEqual(qualification.fixtureContracts, FIXTURE_CONTRACTS);
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
  const lines = readText(FAILURE_LEDGER_PATH).split("\n");
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

test("RKP0-MANIFEST enforces the immutable bounded repair allowlist", () => {
  const allowed = new Set([
    ".gitattributes",
    ".trellis/tasks/08-15-rkp-0-authority-contract-oracle-freeze/prd.md",
    ".trellis/tasks/08-15-rkp-0-authority-contract-oracle-freeze/design.md",
    ".trellis/tasks/08-15-rkp-0-authority-contract-oracle-freeze/implement.md",
    ".trellis/tasks/08-15-rkp-0-authority-contract-oracle-freeze/research/file-and-test-ownership-matrix.md",
    "test/core-kernel/rust-migration/oracle-schema.ts",
    "test/core-kernel/rust-migration/ts-oracle-capture.test.ts",
    "test/core-kernel/rust-migration/oracle-manifest.test.ts",
  ]);
  assert.doesNotThrow(() => execFileSync("git", ["merge-base", "--is-ancestor", BOUNDED_REPAIR_CANDIDATE, "HEAD"]));
  const changed = execFileSync("git", ["diff", "--name-only", BOUNDED_REPAIR_BASE, BOUNDED_REPAIR_CANDIDATE, "--"], { encoding: "utf8" })
    .split(/\r?\n/u)
    .filter((path) => path.length > 0);
  assert.deepEqual(changed.filter((path) => !allowed.has(path)), []);
});

test("RKP0-MANIFEST verifies the archived lifecycle separately from the immutable bounded repair allowlist", () => {
  assert.equal(existsSync(resolve(ARCHIVED_RKP0_AUTHORITY_PATH)), true, "archived authority exists");
  assert.equal(existsSync(resolve(ACTIVE_RKP0_AUTHORITY_PATH)), false, "active authority is absent");
  const taskDirectories = readdirSync(resolve(".trellis/tasks"));
  assert.deepEqual(taskDirectories.filter((name) => /^08-15-rkp-[1-9]/u.test(name)), []);
  assert.equal(execFileSync("git", [
    "status", "--porcelain", "--",
    ARCHIVED_RKP0_AUTHORITY_PATH, ACTIVE_RKP0_AUTHORITY_PATH,
  ], { encoding: "utf8" }), "", "committed RKP-0 lifecycle is clean");
});
