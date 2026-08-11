import { test } from "node:test";
import assert = require("node:assert/strict");

import { migrateKernelExtension } from "../../src/core-kernel/index";
import { compileOfficialModuleCatalogV1 } from "../../src/core-kernel/module-sdk/index";
import { createCoreScoreFixture } from "./fixtures/core-score";
import {
  CVN6_MANIFEST,
  CVN6_REGISTRATION_ENTRIES,
  cvn6CallbackBehavior,
  cvn6CallbackCounts,
  resetCvn6Callbacks,
} from "./fixtures/cvn-6-synthetic-official-modules";

function setup() {
  const result = compileOfficialModuleCatalogV1(CVN6_MANIFEST, CVN6_REGISTRATION_ENTRIES);
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("catalog");
  return result.catalog;
}

function document(version = 1) {
  return {
    ...createCoreScoreFixture(),
    extensions: [{
      namespace: "fixture.score",
      schemaVersion: version,
      owner: { kind: "score" as const },
      payload: { marker: "before" },
    }],
  };
}

const request = {
  migrationVersion: 1,
  moduleId: "fixture.score.module",
  contributionId: "fixture.score.contribution.v1",
  effectKind: "fixture.score.replace",
  namespace: "fixture.score",
  owner: { kind: "score" },
  sourceSchemaVersion: 1,
  targetSchemaVersion: 2,
  payload: { schemaVersion: 2, marker: "after" },
} as const;

test("detached extension migration replaces only the selected block", () => {
  const catalog = setup();
  const input = document();
  resetCvn6Callbacks();
  const result = migrateKernelExtension(input, request, catalog);
  assert.equal(result.status, "migrated");
  if (result.status !== "migrated") return;
  assert.equal(result.document.extensions[0]?.schemaVersion, 2);
  assert.deepEqual(result.document.extensions[0]?.payload, { marker: "after" });
  assert.deepEqual(
    { ...result.document, extensions: [] },
    { ...input, extensions: [] },
  );
  assert.deepEqual(cvn6CallbackCounts, {
    commandDecode: 0,
    commandPrepare: 0,
    validate: 1,
    classify: 0,
    effectDecode: 1,
    effectTransform: 1,
  });
  assert.equal(Object.isFrozen(result.document), true);
});

test("already-target migration is idempotent and invokes no callbacks", () => {
  const catalog = setup();
  resetCvn6Callbacks();
  const result = migrateKernelExtension(document(2), request, catalog);
  assert.equal(result.status, "not-required");
  assert.deepEqual(cvn6CallbackCounts, {
    commandDecode: 0,
    commandPrepare: 0,
    validate: 0,
    classify: 0,
    effectDecode: 0,
    effectTransform: 0,
  });
});

test("migration failure precedence covers input, request, target, and versions", () => {
  const catalog = setup();
  assert.equal(migrateKernelExtension({}, request, catalog).status, "rejected");
  const invalidRequest = migrateKernelExtension(document(), { ...request, extra: true }, catalog);
  assert.deepEqual(
    invalidRequest.status === "rejected" ? invalidRequest.failure : undefined,
    { code: "migration.invalid-request" },
  );
  const missing = migrateKernelExtension(
    { ...document(), extensions: [] },
    request,
    catalog,
  );
  assert.deepEqual(
    missing.status === "rejected" ? missing.failure : undefined,
    { code: "migration.target-not-found" },
  );
  const source = migrateKernelExtension(document(9), request, catalog);
  assert.deepEqual(
    source.status === "rejected" ? source.failure : undefined,
    { code: "migration.unsupported-source-version" },
  );
  const target = migrateKernelExtension(
    document(),
    { ...request, targetSchemaVersion: 3, payload: { schemaVersion: 3, marker: "x" } },
    catalog,
  );
  assert.deepEqual(
    target.status === "rejected" ? target.failure : undefined,
    { code: "migration.unsupported-target-version" },
  );
});

test("migration rejects callback JSON primordial replacement without non-target drift", () => {
  const catalog = setup();
  const input = document();
  const before = structuredClone(input);
  const originalStringify = JSON.stringify;
  resetCvn6Callbacks();
  cvn6CallbackBehavior.replaceJsonStringify = true;
  try {
    const result = migrateKernelExtension(input, request, catalog);
    assert.equal(result.status, "rejected");
    if (result.status === "rejected") {
      assert.deepEqual(result.failure, {
        code: "migration.contribution-contract-violation",
        moduleId: "fixture.score.module",
        contributionId: "fixture.score.contribution.v1",
      });
    }
    assert.deepEqual(input, before);
    assert.equal(cvn6CallbackCounts.effectDecode, 1);
    assert.equal(cvn6CallbackCounts.effectTransform, 1);
    assert.equal(cvn6CallbackCounts.validate, 0);
  } finally {
    JSON.stringify = originalStringify;
    resetCvn6Callbacks();
  }
});
