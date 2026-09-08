import assert = require("node:assert/strict");
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { CANDIDATE_RANGE_JOURNAL_ORACLE_PATH, buildCandidateRangeJournalOracle } from "./candidate-range-journal-oracle";

test("eight range scenarios regenerate real TS submit and history observations", () => {
  const oracle = buildCandidateRangeJournalOracle();
  assert.deepEqual(JSON.parse(readFileSync(resolve(CANDIDATE_RANGE_JOURNAL_ORACLE_PATH), "utf8")), oracle);
  assert.equal(oracle.cases.length, 8);
  assert.equal(new Set(oracle.cases.map((entry) => entry.label)).size, 8);
  for (const entry of oracle.cases) {
    const noop = entry.label === "rest-only-and-zero-transposition-noop";
    assert.equal(entry.expected.status, noop ? "no-op" : "committed", entry.label);
    // History errors are preserved in the fixture and fail here, never replaced.
    assert.equal(JSON.parse(entry.expected.undoResultJson).status, noop ? "rejected" : "committed", entry.label);
    assert.equal(JSON.parse(entry.expected.redoResultJson).status, noop ? "rejected" : "committed", entry.label);
    assert.deepEqual(JSON.parse(entry.expected.undoDocumentJson), JSON.parse(entry.initialDocumentJson), entry.label);
    assert.deepEqual(JSON.parse(entry.expected.redoDocumentJson), JSON.parse(entry.expected.finalDocumentJson), entry.label);
    assert.equal(JSON.parse(entry.expected.submitResultJson).undoDepth, noop ? 0 : 1, entry.label);
  }
});
