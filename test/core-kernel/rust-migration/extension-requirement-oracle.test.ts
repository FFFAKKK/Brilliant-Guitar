import assert = require("node:assert/strict");
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { buildExtensionRequirementOracle, EXTENSION_REQUIREMENT_ORACLE_PATH } from "./extension-requirement-oracle";

test("extension requirement wire cases match the fixed real TypeScript decoder oracle", () => {
  const actual = buildExtensionRequirementOracle();
  const frozen = JSON.parse(readFileSync(resolve(EXTENSION_REQUIREMENT_ORACLE_PATH), "utf8"));
  assert.deepEqual(actual, frozen);
  assert.equal(new Set(actual.cases.map((entry) => entry.id)).size, actual.cases.length);
  const status = (id: string) => actual.cases.find((entry) => entry.id === id)?.expected.status;
  assert.equal(status("valid-base"), "accepted");
  assert.equal(status("protocol-version-instead"), "rejected");
  assert.equal(status("protocol-version-additional"), "rejected");
  assert.equal(status("schema-negative-zero"), "rejected");
  for (const field of ["namespace", "moduleId", "contributionId"]) {
    assert.equal(status(`${field}-text-2`), "accepted");
    assert.equal(status(`${field}-text-3`), "rejected");
  }
  assert.equal(status("schema-versions-17"), "accepted");
  assert.equal(status("schema-versions-18"), "rejected");
});
