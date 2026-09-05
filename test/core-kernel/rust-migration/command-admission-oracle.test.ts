import assert = require("node:assert/strict");
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { COMMAND_ADMISSION_ORACLE_PATH, buildCommandAdmissionOracle } from "./command-admission-oracle";

test("candidate command admission corpus remains an independent exact TS decode oracle", () => {
  const oracle = buildCommandAdmissionOracle();
  assert.deepEqual(JSON.parse(readFileSync(resolve(COMMAND_ADMISSION_ORACLE_PATH), "utf8")), JSON.parse(JSON.stringify(oracle)));
  assert.equal(new Set(oracle.cases.map((entry) => entry.id)).size, oracle.cases.length);
  assert.equal(oracle.cases.filter((entry) => entry.id.endsWith("/valid") && entry.expected.ok).length, 28);
  function accepted(id: string) {
    const entry = oracle.cases.find((entry) => entry.id === id);
    assert.ok(entry, id);
    return entry.expected.ok;
  }
  for (const id of ["nested/notes-empty", "nested/octave-nine", "nested/tuplet-zero", "part/duplicate-staves", "part/duplicate-contents", "part/empty-staves", "part/empty-voices", "measure/pickup-noncanonical", "core.staff.insert/payload.staff.id/empty", "core.voice.set-default-staff/payload.staffId/empty", "core.staff.move/anchor/empty"]) assert.equal(accepted(id), true, id);
  for (const id of ["direct/octave-nine", "direct/tuplet-zero", "nested/staff-null", "nested/time-null", "nested/rest-extra", "nested/notes-extra", "part/clef-six", "measure/pickup-null", "measure/empty-voices", "core.voice.insert-notes-event/payload.event.id/empty", "core.staff.insert/target.partId/empty"]) assert.equal(accepted(id), false, id);
});
