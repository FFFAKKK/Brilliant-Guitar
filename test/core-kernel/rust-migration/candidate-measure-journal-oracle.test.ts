import assert = require("node:assert/strict");
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { CANDIDATE_MEASURE_JOURNAL_ORACLE_PATH, buildCandidateMeasureJournalOracle } from "./candidate-measure-journal-oracle";

test("six measure journal cases derive exact submit and history results from TypeScript", () => {
  const oracle = buildCandidateMeasureJournalOracle();
  assert.deepEqual(JSON.parse(readFileSync(resolve(CANDIDATE_MEASURE_JOURNAL_ORACLE_PATH), "utf8")), oracle);
  assert.equal(oracle.cases.length, 6);
  assert.equal(new Set(oracle.cases.map((entry) => entry.label)).size, 6);
  for (const entry of oracle.cases) {
    const noop = entry.label === "true-noop";
    assert.equal(entry.expected.status, noop ? "no-op" : "committed", entry.label);
    // Preserve actual history failures in the generated fixture: these checks
    // deliberately fail rather than substituting a desired inverse result.
    assert.equal(JSON.parse(entry.expected.undoResultJson).status, noop ? "rejected" : "committed", entry.label);
    assert.equal(JSON.parse(entry.expected.redoResultJson).status, noop ? "rejected" : "committed", entry.label);
    assert.deepEqual(JSON.parse(entry.expected.undoDocumentJson), JSON.parse(entry.initialDocumentJson), entry.label);
    assert.deepEqual(JSON.parse(entry.expected.redoDocumentJson), JSON.parse(entry.expected.finalDocumentJson), entry.label);
    assert.equal(JSON.parse(entry.expected.submitResultJson).undoDepth, noop ? 0 : 1, entry.label);
  }
});
