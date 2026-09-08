import assert = require("node:assert/strict");
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { CANDIDATE_FINAL_ASSESSMENT_ORACLE_PATH, buildCandidateFinalAssessmentOracle } from "./candidate-final-assessment-oracle";

test("final candidate reports are frozen from the independent real TS batch path", () => {
  const oracle = buildCandidateFinalAssessmentOracle();
  assert.deepEqual(JSON.parse(readFileSync(resolve(CANDIDATE_FINAL_ASSESSMENT_ORACLE_PATH), "utf8")), oracle);
  assert.equal(oracle.cases.length, 12);
  assert.equal(new Set(oracle.cases.map((entry) => entry.label)).size, 12);
  for (const entry of oracle.cases) {
    for (const text of [entry.initialDocumentJson, ...entry.commandsJson, entry.expected.submitResultJson, entry.expected.finalDocumentJson]) {
      assert.equal(JSON.stringify(JSON.parse(text)), text, entry.label);
    }
    if (entry.expected.status === "rejected") {
      assert.equal(entry.expected.finalDocumentJson, entry.initialDocumentJson, entry.label);
      assert.deepEqual(JSON.parse(entry.expected.failureJson!), JSON.parse(entry.expected.submitResultJson).failure, entry.label);
    }
  }
});

test("final assessment oracle distinguishes final diagnostics, earlier child failure and repaired commits", () => {
  const rows = buildCandidateFinalAssessmentOracle().cases;
  const row = (label: string) => {
    const result = rows.find((entry) => entry.label === label);
    assert.ok(result, label);
    return result;
  };
  for (const entry of rows.slice(0, 8)) {
    assert.equal(entry.expected.status, "rejected", entry.label);
    assert.equal(JSON.parse(entry.expected.failureJson!).code, "command.semantic-invalid", entry.label);
    assert.equal(entry.expected.earlyFailureIndex, undefined, entry.label);
  }
  for (const entry of rows.slice(8, 11)) assert.equal(entry.expected.status, "committed", entry.label);
  const netZero = row("invalid-part-removal-committed-net-zero");
  assert.equal(netZero.expected.finalDocumentJson, netZero.initialDocumentJson);
  assert.equal(JSON.parse(netZero.expected.submitResultJson).documentVersion, 1);
  assert.equal(JSON.parse(netZero.expected.submitResultJson).undoDepth, 1);
  const early = row("duplicate-target-child-failure-precedes-final-faults");
  assert.deepEqual(JSON.parse(early.expected.failureJson!), {
    code: "command.batch-child-rejected", failedCommandIndex: 2, failure: { code: "command.internal-error" },
  });
  const repaired = row("typed-prefix-invalid-part-later-repaired");
  assert.equal(JSON.parse(repaired.expected.finalDocumentJson).metadata.title, "prefix-\ud800");
  assert.ok(repaired.commandsJson.join("").includes("\\ud800"));
});
