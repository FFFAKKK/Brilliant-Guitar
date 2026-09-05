import assert = require("node:assert/strict");
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import {
  CANDIDATE_STAFF_JOURNAL_ORACLE_PATH,
  LEGACY_DUPLICATE_STAFF_HISTORY_GAP_LABEL,
  buildCandidateStaffJournalOracle,
} from "./candidate-staff-journal-oracle";

test("staff candidate journal fixture is regenerated solely by the real TS batch and history paths", () => {
  const oracle = buildCandidateStaffJournalOracle();
  assert.deepEqual(
    JSON.parse(readFileSync(resolve(CANDIDATE_STAFF_JOURNAL_ORACLE_PATH), "utf8")),
    JSON.parse(JSON.stringify(oracle)),
  );
  assert.equal(oracle.cases.length, 10);
  assert.equal(new Set(oracle.cases.map((entry) => entry.label)).size, 10);
  for (const entry of oracle.cases) {
    assert.equal(typeof entry.initialDocumentJson, "string");
    assert.ok(entry.commandsJson.length > 0);
    for (const text of entry.commandsJson) {
      assert.equal(typeof text, "string");
      assert.equal(JSON.stringify(JSON.parse(text)), text);
    }
    assert.deepEqual(JSON.parse(entry.expected.undoDocumentJson), JSON.parse(entry.initialDocumentJson), entry.label);
    assert.deepEqual(JSON.parse(entry.expected.redoDocumentJson), JSON.parse(entry.expected.finalDocumentJson), entry.label);
    if (entry.expected.status === "committed") {
      assert.equal(JSON.parse(entry.expected.submitResultJson).undoDepth, 1, entry.label);
      if (entry.label === LEGACY_DUPLICATE_STAFF_HISTORY_GAP_LABEL) {
        // Equal documents do not prove replay: this net-zero batch exposes the
        // legacy TS history failure recorded by the independent generator.
        assert.deepEqual(JSON.parse(entry.expected.undoResultJson), {
          status: "rejected", documentVersion: 1,
          failure: { code: "history.invariant-violation" }, undoDepth: 1, redoDepth: 0,
        });
        assert.deepEqual(JSON.parse(entry.expected.redoResultJson), {
          status: "rejected", documentVersion: 1,
          failure: { code: "history.empty-redo" }, undoDepth: 1, redoDepth: 0,
        });
      } else {
        assert.equal(JSON.parse(entry.expected.undoResultJson).status, "committed", entry.label);
        assert.equal(JSON.parse(entry.expected.redoResultJson).status, "committed", entry.label);
      }
    } else {
      assert.equal(entry.expected.status, "rejected", entry.label);
      assert.deepEqual(JSON.parse(entry.expected.finalDocumentJson), JSON.parse(entry.initialDocumentJson), entry.label);
      assert.equal(JSON.parse(entry.expected.submitResultJson).undoDepth, 0, entry.label);
    }
  }
});

test("staff oracle freezes prefix visibility, ambiguity, owner-local references and committed net-zero history", () => {
  const oracle = buildCandidateStaffJournalOracle();
  function row(label: string) {
    const entry = oracle.cases.find((candidate) => candidate.label === label);
    assert.ok(entry, label);
    return entry;
  }
  for (const label of [
    "prefix-insert-definition-move-remove",
    "prefix-remove-and-reinsert-same-id",
    "effective-staff-journal-net-zero",
    "empty-prefix-staff-repaired-by-parent-removal",
    "duplicate-prefix-staff-repaired-by-parent-removal",
    "far-part-invalid-reference-does-not-block-local-removal",
  ]) assert.equal(row(label).expected.status, "committed", label);

  for (const [label, failedCommandIndex, code] of [
    ["duplicate-staff-target-ambiguity", 1, "command.internal-error"],
    ["staff-anchor-must-belong-to-target-part", 1, "command.anchor-wrong-owner"],
    ["current-prefix-voice-reference-blocks-staff-removal", 2, "command.reference-conflict"],
    ["current-prefix-event-reference-blocks-staff-removal", 2, "command.reference-conflict"],
  ] as const) {
    const entry = row(label);
    assert.equal(entry.expected.status, "rejected", label);
    assert.equal(entry.expected.earlyFailureIndex, failedCommandIndex, label);
    assert.deepEqual(JSON.parse(entry.expected.failureJson!), {
      code: "command.batch-child-rejected", failedCommandIndex, failure: { code },
    }, label);
  }

  for (const label of [
    "effective-staff-journal-net-zero",
    "empty-prefix-staff-repaired-by-parent-removal",
    "duplicate-prefix-staff-repaired-by-parent-removal",
  ]) {
    const entry = row(label);
    assert.deepEqual(JSON.parse(entry.expected.finalDocumentJson), JSON.parse(entry.initialDocumentJson), label);
    assert.equal(JSON.parse(entry.expected.submitResultJson).documentVersion, 1, label);
  }

  const prefix = row("prefix-insert-definition-move-remove");
  assert.ok(prefix.commandsJson[0]!.includes("\\ud800"), "inner command JSON must carry an escaped unpaired unit");
  const document = JSON.parse(prefix.expected.finalDocumentJson) as {
    parts: { staves: { id: string; lineCount: number }[] }[];
  };
  assert.deepEqual(document.parts[0]!.staves.map((staff) => [staff.id, staff.lineCount]), [
    ["prefix-\ud800", 6], ["staff-1", 5],
  ]);
});
