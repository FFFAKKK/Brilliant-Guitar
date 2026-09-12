import assert = require("node:assert/strict");
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { computeKernelDomainAvailability, resolveKernelIntegratedRuntimeAssembly } from "../../../src/core-kernel/registry/domain-availability";
import { createCoreScoreFixture } from "../fixtures/core-score";
import { buildExtensionAssemblyOracle, compileAssemblyOracleCatalog, EXTENSION_ASSEMBLY_ORACLE_PATH, requirement } from "./extension-assembly-oracle";

test("assembly oracle preserves real compilation, inventory and availability outputs", () => {
  const actual = buildExtensionAssemblyOracle();
  assert.deepEqual(actual, JSON.parse(readFileSync(resolve(EXTENSION_ASSEMBLY_ORACLE_PATH), "utf8")));
  assert.equal(new Set(actual.cases.map((entry) => entry.id)).size, actual.cases.length);
  assert.equal(actual.cases.find((entry) => entry.id === "domain-owner-count-62")?.expected.status, "resolved");
  for (const id of ["domain-owner-count-63", "reserved-owner-core.commands", "reserved-owner-core.selectors"]) {
    const expected = actual.cases.find((entry) => entry.id === id)?.expected;
    assert.ok(expected?.status === "catalog-rejected" && expected.stage === "catalog-compilation", id);
    assert.equal(typeof expected.failure.code, "string");
  }
  for (const entry of actual.cases) {
    if (entry.expected.status === "resolved") {
      assert.deepEqual(entry.expected.identity, { sameCatalogReused: true, differentCatalogIsolated: true });
    }
  }
});

test("same catalog reuses canonical inventory identity across explicit order and omission", () => {
  const a = requirement("fixture.a");
  const b = requirement("fixture.b");
  const catalog = compileAssemblyOracleCatalog([{ moduleId: a.moduleId, contributionId: a.contributionId, requirements: [b, a] }]);
  const omitted = resolveKernelIntegratedRuntimeAssembly(catalog);
  const explicit = resolveKernelIntegratedRuntimeAssembly(catalog, { inventoryVersion: 1, requirements: [a, b] });
  assert.ok(omitted.ok && explicit.ok);
  assert.equal(omitted.state.assemblyIdentity, explicit.state.assemblyIdentity);
  assert.equal(omitted.state.canonicalInventoryKey, explicit.state.canonicalInventoryKey);
});

test("availability fact ceiling counts real blocks without a giant frozen fixture", () => {
  const req = requirement("missing.namespace");
  const assembly = resolveKernelIntegratedRuntimeAssembly(compileAssemblyOracleCatalog([]), { inventoryVersion: 1, requirements: [req] });
  assert.ok(assembly.ok);
  const block = { namespace: req.namespace, schemaVersion: 1, owner: { kind: "score" as const }, payload: {} };
  const atLimit = computeKernelDomainAvailability({ ...createCoreScoreFixture(), extensions: Array.from({ length: 131072 }, () => block) }, assembly.state);
  assert.ok(atLimit.ok);
  assert.equal(atLimit.value.facts.length, 131072);
  const overLimit = computeKernelDomainAvailability({ ...createCoreScoreFixture(), extensions: Array.from({ length: 131073 }, () => block) }, assembly.state);
  assert.deepEqual(overLimit, { ok: false, limit: 131072, actual: 131073 });
});
