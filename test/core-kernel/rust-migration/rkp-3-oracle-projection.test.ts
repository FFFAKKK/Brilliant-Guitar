import assert = require("node:assert/strict");
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

import {
  createRustKernelSmokeSession,
  readRustKernelSmokeSession,
  submitRustKernelSmokeCommand,
  type OpaqueKernelSessionHandle,
  type RustKernelStage3NativeAddon,
} from "../../../src/core-kernel/native/rust-kernel-smoke";
import {
  canonicalJson,
  decodeOracleJsonlText,
  decodeOracleManifestText,
  sha256,
  type RustMigrationOracleScenarioV1,
} from "./oracle-schema";
import { RKP3_CORE_COMMAND_IDS } from "./rkp-3-transaction-fixtures";

interface RawNativeAddon extends RustKernelStage3NativeAddon {
  readonly readKernelSessionV1: (handle: unknown) => Buffer;
}

const SCENARIOS_PATH =
  "test/core-kernel/rust-migration/fixtures/oracle-scenarios-v1.jsonl";
const MANIFEST_PATH =
  "test/core-kernel/rust-migration/fixtures/oracle-manifest-v1.json";
const addonPath = resolve(
  process.cwd(),
  "target/rkp-1-node/brilliant_kernel_node.node",
);
// eslint-disable-next-line @typescript-eslint/no-require-imports
const addon = require(addonPath) as RawNativeAddon;
const scenariosText = readFileSync(resolve(SCENARIOS_PATH), "utf8");
const scenarios = decodeOracleJsonlText(scenariosText);
const manifest = decodeOracleManifestText(readFileSync(resolve(MANIFEST_PATH), "utf8"));

function record(value: unknown, label: string): Record<string, unknown> {
  assert.ok(value !== null && typeof value === "object" && !Array.isArray(value), label);
  return value as Record<string, unknown>;
}

function onlySubmit(scenario: RustMigrationOracleScenarioV1): {
  readonly command: unknown;
  readonly expectedResult: Record<string, unknown>;
} {
  const submitIndices = scenario.operations.flatMap((operation, index) =>
    operation.kind === "submit" ? [index] : [],
  );
  assert.equal(submitIndices.length, 1, `${scenario.scenarioId} submit count`);
  const index = submitIndices[0];
  if (index === undefined) throw new Error(`${scenario.scenarioId} submit index missing`);
  const operation = scenario.operations[index];
  const observation = scenario.observations[index];
  assert.notEqual(operation, undefined, `${scenario.scenarioId} submit operation`);
  assert.notEqual(observation, undefined, `${scenario.scenarioId} submit observation`);
  return {
    command: operation?.input,
    expectedResult: record(observation?.result, `${scenario.scenarioId} result`),
  };
}

function createScenarioSession(
  scenario: RustMigrationOracleScenarioV1,
): OpaqueKernelSessionHandle {
  const created = createRustKernelSmokeSession(addon, scenario.initialDocument);
  assert.equal(created.result.status, "created", scenario.scenarioId);
  if (!("handle" in created)) throw new Error(`${scenario.scenarioId} create rejected`);
  return created.handle;
}

function assertZeroGlobalWork(
  metrics: Readonly<Record<string, number>>,
  label: string,
): void {
  for (const key of [
    "fullDocumentScans",
    "fullDocumentClones",
    "fullSemanticValidations",
    "fullSnapshotMaterializations",
  ])
    assert.equal(metrics[key], 0, `${label}.${key}`);
}

function assertReadProjection(
  handle: OpaqueKernelSessionHandle,
  expectedDocument: unknown,
  expectedVersion: number,
  label: string,
): void {
  const read = readRustKernelSmokeSession(addon, handle);
  assert.equal(read.status, "ok", label);
  if (read.status !== "ok") throw new Error(`${label} read rejected`);
  assert.equal(read.value.snapshot.documentVersion, expectedVersion, `${label}.version`);
  assert.equal(
    canonicalJson(read.value.snapshot.document),
    canonicalJson(expectedDocument),
    `${label}.document`,
  );
}

test("RKP-3 selects the immutable 28 accepted and 28 missing-target rows in catalog order", () => {
  assert.equal(scenarios.length, 64);
  assert.equal(manifest.scenarioCount, 64);
  assert.equal(manifest.scenariosFileSha256, sha256(scenariosText));

  const accepted = scenarios.filter(
    (scenario) => scenario.scenarioClass === "accepted-command",
  );
  const rejected = scenarios.filter(
    (scenario) => scenario.scenarioClass === "rejected-command",
  );
  assert.equal(accepted.length, 28);
  assert.equal(rejected.length, 28);
  assert.deepEqual(
    accepted.map((scenario) => scenario.coveredCommandIds[0]),
    RKP3_CORE_COMMAND_IDS,
  );
  assert.deepEqual(
    rejected.map((scenario) => scenario.coveredCommandIds[0]),
    RKP3_CORE_COMMAND_IDS,
  );
  assert.ok([...accepted, ...rejected].every((scenario) => scenario.assemblyKind === "core-only"));
});

test("all 28 accepted submit rows match native canonical document and version one", () => {
  const accepted = scenarios.filter(
    (scenario) => scenario.scenarioClass === "accepted-command",
  );
  for (const scenario of accepted) {
    const { command, expectedResult } = onlySubmit(scenario);
    const handle = createScenarioSession(scenario);
    const result = submitRustKernelSmokeCommand(addon, handle, command);
    assert.equal(result.status, "committed", scenario.scenarioId);
    if (result.status !== "committed") continue;
    assert.equal(expectedResult.status, "committed", scenario.scenarioId);
    assert.equal(
      result.value.documentVersion,
      expectedResult.documentVersion,
      scenario.scenarioId,
    );
    assert.equal(result.value.documentVersion, 1, scenario.scenarioId);
    assertZeroGlobalWork(result.value.metrics, scenario.scenarioId);
    assert.equal("document" in result.value, false, scenario.scenarioId);
    assertReadProjection(handle, scenario.finalDocument, 1, scenario.scenarioId);
  }
});

test("all 28 missing-target rows match failure and preserve native bytes at version zero", () => {
  const rejected = scenarios.filter(
    (scenario) => scenario.scenarioClass === "rejected-command",
  );
  for (const scenario of rejected) {
    const { command, expectedResult } = onlySubmit(scenario);
    const handle = createScenarioSession(scenario);
    const before = addon.readKernelSessionV1(handle);
    const result = submitRustKernelSmokeCommand(addon, handle, command);
    assert.equal(result.status, "command-rejected", scenario.scenarioId);
    if (result.status !== "command-rejected") continue;
    assert.equal(expectedResult.status, "rejected", scenario.scenarioId);
    assert.equal(result.value.documentVersion, expectedResult.documentVersion);
    assert.equal(result.value.documentVersion, 0, scenario.scenarioId);
    assert.equal(
      canonicalJson(result.failure),
      canonicalJson(expectedResult.failure),
      scenario.scenarioId,
    );
    assertZeroGlobalWork(result.value.metrics, scenario.scenarioId);
    assert.deepEqual(addon.readKernelSessionV1(handle), before, scenario.scenarioId);
    assertReadProjection(handle, scenario.initialDocument, 0, scenario.scenarioId);
  }
});

test("the two Stage-3 cross-cutting batch rows match while later-stage claims stay excluded", () => {
  const selectedIds = [
    "cross.atomic-batch-commit",
    "cross.batch-child-rejection-zero-delta",
  ] as const;
  const selected = scenarios.filter((scenario) =>
    selectedIds.includes(scenario.scenarioId as (typeof selectedIds)[number]),
  );
  assert.deepEqual(
    selected.map((scenario) => scenario.scenarioId),
    selectedIds,
  );

  const atomic = selected[0];
  const rejected = selected[1];
  assert.notEqual(atomic, undefined);
  assert.notEqual(rejected, undefined);
  if (atomic === undefined || rejected === undefined) return;

  const atomicSubmit = onlySubmit(atomic);
  const atomicHandle = createScenarioSession(atomic);
  const atomicResult = submitRustKernelSmokeCommand(
    addon,
    atomicHandle,
    atomicSubmit.command,
  );
  assert.equal(atomicResult.status, "committed");
  if (atomicResult.status === "committed") {
    assert.equal(atomicResult.value.documentVersion, 1);
    assertReadProjection(atomicHandle, atomic.finalDocument, 1, atomic.scenarioId);
  }

  const rejectedSubmit = onlySubmit(rejected);
  const rejectedHandle = createScenarioSession(rejected);
  const before = addon.readKernelSessionV1(rejectedHandle);
  const rejectedResult = submitRustKernelSmokeCommand(
    addon,
    rejectedHandle,
    rejectedSubmit.command,
  );
  assert.equal(rejectedResult.status, "command-rejected");
  if (rejectedResult.status === "command-rejected") {
    assert.equal(rejectedResult.value.documentVersion, 0);
    assert.equal(
      canonicalJson(rejectedResult.failure),
      canonicalJson(rejectedSubmit.expectedResult.failure),
    );
  }
  assert.deepEqual(addon.readKernelSessionV1(rejectedHandle), before);

  const excluded = scenarios
    .filter(
      (scenario) =>
        scenario.scenarioClass === "cross-cutting" &&
        !selectedIds.includes(scenario.scenarioId as (typeof selectedIds)[number]),
    )
    .map((scenario) => scenario.scenarioId);
  assert.deepEqual(excluded, [
    "cross.submit-noop-persisted-dirty",
    "cross.undo-redo-tail-truncation",
    "cross.semantic-replay-equality",
    "cross.integrated-two-module-order-availability",
    "cross.detached-extension-migration",
    "cross.assembly-mismatch-subscriber-isolation",
  ]);
});
