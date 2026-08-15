import assert = require("node:assert/strict");
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

import {
  canonicalJsonl,
  decodeOracleJsonlText,
  type JsonData,
  type RustMigrationOracleScenarioV1,
} from "./oracle-schema";
import {
  COMMAND_IDS,
  EXPECTED_SCENARIO_IDS,
  buildOracleScenarios,
} from "./ts-oracle-fixtures";

const SCENARIOS_PATH = "test/core-kernel/rust-migration/fixtures/oracle-scenarios-v1.jsonl";

function stateKey(scenario: RustMigrationOracleScenarioV1): string {
  return JSON.stringify(scenario.initialState);
}

function object(value: JsonData, label: string): Readonly<Record<string, JsonData>> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Readonly<Record<string, JsonData>>;
}

test("RKP0-ORACLE capture is byte-stable across two independent TypeScript runs", async () => {
  const first = await buildOracleScenarios();
  const second = await buildOracleScenarios();
  const firstBytes = canonicalJsonl(first);
  const secondBytes = canonicalJsonl(second);
  assert.equal(firstBytes, secondBytes);
  assert.equal(readFileSync(resolve(SCENARIOS_PATH), "utf8"), firstBytes);
});

test("RKP0-ORACLE corpus has the exact 28 accepted, 28 rejected, and 8 cross-cutting rows", async () => {
  const text = readFileSync(resolve(SCENARIOS_PATH), "utf8");
  const scenarios = decodeOracleJsonlText(text);
  assert.equal(scenarios.length, 64);
  assert.deepEqual(scenarios.map((scenario) => scenario.scenarioId), EXPECTED_SCENARIO_IDS);
  assert.equal(new Set(scenarios.map((scenario) => scenario.scenarioId)).size, 64);
  assert.deepEqual(scenarios.slice(0, 28).map((scenario) => scenario.coveredCommandIds[0]), COMMAND_IDS);
  assert.deepEqual(scenarios.slice(28, 56).map((scenario) => scenario.coveredCommandIds[0]), COMMAND_IDS);
  assert.equal(scenarios.filter((scenario) => scenario.scenarioClass === "accepted-command").length, 28);
  assert.equal(scenarios.filter((scenario) => scenario.scenarioClass === "rejected-command").length, 28);
  assert.equal(scenarios.filter((scenario) => scenario.scenarioClass === "cross-cutting").length, 8);
  const regenerated = await buildOracleScenarios();
  assert.deepEqual(scenarios, regenerated);
});

test("RKP0-ORACLE records one dense observation per public operation and preserves literal source authority", () => {
  const scenarios = decodeOracleJsonlText(readFileSync(resolve(SCENARIOS_PATH), "utf8"));
  for (const scenario of scenarios) {
    assert.equal(scenario.operations.length, scenario.observations.length, scenario.scenarioId);
    assert.deepEqual(scenario.operations.map((operation) => operation.operationIndex), Array.from({ length: scenario.operations.length }, (_, index) => index), scenario.scenarioId);
    assert.deepEqual(scenario.observations.map((observation) => observation.operationIndex), Array.from({ length: scenario.operations.length }, (_, index) => index), scenario.scenarioId);
    const source = readFileSync(resolve(scenario.sourceAuthority.file), "utf8");
    assert.equal(source.includes(scenario.sourceAuthority.testTitle), true, scenario.scenarioId);
  }
});

test("RKP0-ORACLE accepted A8 rows prove submit undo redo inverse equality", () => {
  const scenarios = decodeOracleJsonlText(readFileSync(resolve(SCENARIOS_PATH), "utf8"));
  for (const scenario of scenarios.slice(0, 28)) {
    assert.equal(scenario.inverseProof.kind, "undo-redo", scenario.scenarioId);
    if (scenario.inverseProof.kind !== "undo-redo") continue;
    assert.equal(scenario.operations.map((operation) => operation.kind).join(","), "subscribe,submit,read,undo,read,redo,read,unsubscribe", scenario.scenarioId);
    assert.equal(scenario.inverseProof.initialDocumentSha256, scenario.inverseProof.afterUndoDocumentSha256, scenario.scenarioId);
    assert.equal(scenario.inverseProof.afterSubmitDocumentSha256, scenario.inverseProof.afterRedoDocumentSha256, scenario.scenarioId);
  }
});

test("RKP0-ORACLE rejected R4 rows are fixed missing-target zero-delta rejections", () => {
  const scenarios = decodeOracleJsonlText(readFileSync(resolve(SCENARIOS_PATH), "utf8"));
  for (const scenario of scenarios.slice(28, 56)) {
    assert.deepEqual(scenario.operations.map((operation) => operation.kind), ["subscribe", "submit", "read", "unsubscribe"], scenario.scenarioId);
    const result = object(scenario.observations[1]?.result ?? null, `${scenario.scenarioId}.submit`);
    const failure = object(result.failure ?? null, `${scenario.scenarioId}.failure`);
    assert.equal(result.status, "rejected", scenario.scenarioId);
    assert.equal(failure.code, "command.target-not-found", scenario.scenarioId);
    assert.equal(JSON.stringify(scenario.initialDocument), JSON.stringify(scenario.finalDocument), scenario.scenarioId);
    assert.equal(JSON.stringify(scenario.initialState), JSON.stringify(scenario.finalState), scenario.scenarioId);
    for (const observation of scenario.observations) {
      assert.equal(JSON.stringify(observation.state), stateKey(scenario), scenario.scenarioId);
      assert.deepEqual(observation.publishedEvents, [], scenario.scenarioId);
    }
  }
});

test("RKP0-ORACLE keeps declared cross-cutting zero-delta operations explicit", () => {
  const scenarios = decodeOracleJsonlText(readFileSync(resolve(SCENARIOS_PATH), "utf8"));
  const byId = new Map(scenarios.map((scenario) => [scenario.scenarioId, scenario]));
  for (const scenarioId of [
    "cross.batch-child-rejection-zero-delta",
    "cross.detached-extension-migration",
  ]) {
    const scenario = byId.get(scenarioId);
    assert.notEqual(scenario, undefined, scenarioId);
    if (scenario === undefined) continue;
    assert.equal(JSON.stringify(scenario.initialState), JSON.stringify(scenario.finalState), scenarioId);
  }
  const mismatch = byId.get("cross.assembly-mismatch-subscriber-isolation");
  assert.notEqual(mismatch, undefined);
  if (mismatch !== undefined) {
    assert.equal(JSON.stringify(mismatch.observations[0]?.state), JSON.stringify(mismatch.initialState));
    assert.deepEqual(mismatch.observations[0]?.publishedEvents, []);
  }
});
