import assert = require("node:assert/strict");
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

import { ASSESSMENT_ORACLE_PATH, GENERATED_ASSESSMENT_ORACLE_PATH, buildAssessmentOracle, buildGeneratedAssessmentOracle } from "./assessment-oracle";

type Oracle = ReturnType<typeof buildAssessmentOracle>;
const oracle = JSON.parse(readFileSync(resolve(ASSESSMENT_ORACLE_PATH), "utf8")) as Oracle;

test("seeded interacting faults and pitch boundary corpus stays tied to TypeScript", () => {
  const actual = buildGeneratedAssessmentOracle();
  assert.equal(actual.cases.length, 576);
  assert.deepEqual(JSON.parse(JSON.stringify(actual)), JSON.parse(readFileSync(resolve(GENERATED_ASSESSMENT_ORACLE_PATH), "utf8")));
});

test("assessment oracle preserves separate public decode, strict decode, semantic, profile and create results", () => {
  assert.deepEqual(JSON.parse(JSON.stringify(buildAssessmentOracle())), oracle);
  assert.equal(new Set(oracle.cases.map((entry) => entry.id)).size, oracle.cases.length);
  for (const id of ["meter-numerator-fractional", "staff-line-count-fractional", "transposition-fractional", "extension-schema-version-invalid"]) {
    const entry = oracle.cases.find((entry) => entry.id === id);
    assert.ok(entry, id);
    assert.equal(entry.expected.decode.ok, true, `${id}: public decode accepts finite components`);
    assert.equal(entry.expected.strictDecode.ok, false, `${id}: strict component decode rejects`);
    assert.equal(entry.expected.semantics.ok, false);
    assert.equal(entry.expected.create.ok, false);
  }
  const emptyId = oracle.cases.find((entry) => entry.id === "empty-score-id");
  assert.ok(emptyId);
  assert.equal(emptyId.expected.decode.ok, true);
  assert.deepEqual(emptyId.expected.semantics.diagnostics, [{
    code: "semantic.id-empty", messageKey: "core.semantic.id-empty", path: ["id"],
  }]);
});

test("assessment corpus reaches every public semantic and unsupported diagnostic", () => {
  const source = readFileSync(resolve("src/core-kernel/validation/diagnostics.ts"), "utf8");
  function declaredCodes(typeName: string): string[] {
    const declaration = new RegExp(`export type ${typeName} =([\\s\\S]*?);`, "u").exec(source)?.[1];
    assert.ok(declaration);
    return [...declaration.matchAll(/"([^"]+)"/gu)].map((match) => match[1]!).sort();
  }
  const semantic = [...new Set(oracle.cases.flatMap((entry) => entry.expected.semantics.diagnostics.map((item) => item.code)))].sort();
  const unsupported = [...new Set(oracle.cases.flatMap((entry) => entry.expected.support.status === "unsupported" ? entry.expected.support.diagnostics.map((item) => item.code) : []))].sort();
  assert.deepEqual(semantic, declaredCodes("SemanticDiagnosticCode"));
  assert.deepEqual(unsupported, declaredCodes("UnsupportedDiagnosticCode"));
  assert.equal(semantic.length, 31);
  assert.equal(unsupported.length, 11);
});

test("semantic failures suppress profile diagnostics and preserve ordered create diagnostics", () => {
  for (const entry of oracle.cases) {
    if (entry.expected.semantics.ok) continue;
    assert.deepEqual(entry.expected.support, { status: "invalid", diagnostics: entry.expected.semantics.diagnostics }, entry.id);
    assert.deepEqual(entry.expected.create, {
      ok: false,
      failure: { code: "command.invalid-initial-document", diagnostics: entry.expected.semantics.diagnostics },
    }, entry.id);
  }
  const custom = oracle.cases.find((entry) => entry.id === "custom-profile-permits-tuplets");
  assert.ok(custom);
  assert.deepEqual(custom.expected.support, { status: "supported", diagnostics: [] });
});
