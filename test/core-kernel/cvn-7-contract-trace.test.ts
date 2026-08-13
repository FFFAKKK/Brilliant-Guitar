import assert = require("node:assert/strict");
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

import { CVN7_CONTRACT_TRACE } from "./qualification/cvn-7-contract-trace";

const PARENT_MATRIX =
  ".trellis/tasks/07-29-core-vnext-product-ready-extensible-kernel-completion/feature-contract-matrix.md";

const QUALIFICATION_TITLES = [
  "CVN7-Q-FC001-FINITE-COMPLETION",
  "CVN7-Q-FC002-VERSION-EVOLUTION",
  "CVN7-Q-FC010-STRICT-UNKNOWN",
  "CVN7-Q-FC011-STATE-RESULT",
  "CVN7-Q-FC020-EXACT-INPUT",
  "CVN7-Q-FC021-EXACT-OUTPUT",
  "CVN7-Q-FC030-ANCHOR-TYPES",
  "CVN7-Q-FC031-ANCHOR-RESOLUTION",
  "CVN7-Q-FC040-V1-SIX-COMMANDS",
  "CVN7-Q-FC041-VNEXT-TWENTY-TWO",
  "CVN7-Q-FC050-MEASURE-INSERT",
  "CVN7-Q-FC051-MEASURE-REMOVE",
  "CVN7-Q-FC052-MEASURE-MOVE",
  "CVN7-Q-FC053-MEASURE-DEFINITION",
  "CVN7-Q-FC060-PART-LIFECYCLE",
  "CVN7-Q-FC061-STAFF-LIFECYCLE",
  "CVN7-Q-FC062-VOICE-LIFECYCLE",
  "CVN7-Q-FC063-EVENT-STAFF",
  "CVN7-Q-FC070-OWNERSHIP-CASCADE",
  "CVN7-Q-FC080-RANGE-SELECTION",
  "CVN7-Q-FC081-RANGE-DELETE",
  "CVN7-Q-FC082-RANGE-TRANSPOSE",
  "CVN7-Q-FC090-BATCH-ENVELOPE-LIMITS",
  "CVN7-Q-FC091-BATCH-ORDER",
  "CVN7-Q-FC092-BATCH-FAILURE-INDEX",
  "CVN7-Q-FC093-BATCH-HISTORY-REPLAY",
  "CVN7-Q-FC100-FAILURE-UNION",
  "CVN7-Q-FC101-FAILURE-PRIORITY",
  "CVN7-Q-FC102-FAILURE-PRIVACY",
  "CVN7-Q-FC110-ENTRY-ABI",
  "CVN7-Q-FC111-FROZEN-ASSEMBLY",
  "CVN7-Q-FC112-RUNTIME-AUTHORITY",
  "CVN7-Q-FC120-CHANGED-PIPELINE",
  "CVN7-Q-FC121-AVAILABILITY",
  "CVN7-Q-FC122-MIGRATION",
  "CVN7-Q-FC130-NO-DOCUMENT-CAP",
  "CVN7-Q-FC131-REPRESENTATIVE-EXACT",
  "CVN7-Q-FC132-STRESS-EXACT",
  "CVN7-Q-FC133-SAMPLING-EXACT",
  "CVN7-Q-FC134-BUDGETS-EXACT",
  "CVN7-Q-FC140-COMMAND-MINIMUM-SET",
  "CVN7-Q-FC141-BATCH-MATRIX",
  "CVN7-Q-FC142-STRUCTURE-MATRIX",
  "CVN7-Q-FC143-MODULE-MATRIX",
] as const;

function literalOccurrenceCount(source: string, literal: string): number {
  return source.split(literal).length - 1;
}

test("CVN7 contract trace exactly matches the forty-four allocated parent headings", () => {
  const matrix = readFileSync(resolve(PARENT_MATRIX), "utf8");
  const parentContractIds = Array.from(
    matrix.matchAll(/^### (CVN-FC-\d{3})\b/gmu),
    (match) => match[1],
  );
  const tracedContractIds = CVN7_CONTRACT_TRACE.map(({ contractId }) => contractId);

  assert.equal(parentContractIds.length, 44);
  assert.deepEqual(tracedContractIds, parentContractIds);
  assert.equal(new Set(tracedContractIds).size, 44);
  assert.deepEqual(
    tracedContractIds.filter((contractId) => /^CVN-FC-13[5-9]$/u.test(contractId)),
    [],
  );
});

test("CVN7 contract trace points to one literal decisive test for every contract", () => {
  for (const entry of CVN7_CONTRACT_TRACE) {
    const decisiveSource = readFileSync(resolve(entry.decisiveTestFile), "utf8");
    assert.equal(
      literalOccurrenceCount(decisiveSource, entry.decisiveTestTitle),
      1,
      `${entry.contractId} decisive title must occur exactly once`,
    );
    assert.equal(entry.consumerOwner, "CVN-7");
    assert.equal(entry.qualificationTestFile, "test/core-kernel/cvn-7-contract-trace.test.ts");
    assert.equal(entry.qualificationTitle, entry.caseId);
  }
});

for (const qualificationTitle of QUALIFICATION_TITLES) {
  test(qualificationTitle, () => {
    const entry = CVN7_CONTRACT_TRACE.find(
      (candidate) => candidate.qualificationTitle === qualificationTitle,
    );
    assert.ok(entry, `missing executable trace row for ${qualificationTitle}`);
  });
}

test("CVN7 qualification titles are unique literals in their declared test source", () => {
  const qualificationSource = readFileSync(
    resolve("test/core-kernel/cvn-7-contract-trace.test.ts"),
    "utf8",
  );
  assert.equal(QUALIFICATION_TITLES.length, 44);
  assert.equal(new Set(QUALIFICATION_TITLES).size, 44);
  for (const title of QUALIFICATION_TITLES) {
    assert.equal(literalOccurrenceCount(qualificationSource, title), 1, title);
  }
});
