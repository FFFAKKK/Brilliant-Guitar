import { test } from "node:test";
import assert = require("node:assert/strict");

import {
  createKernelValidationReport,
  decodeScoreDocument,
  encodeScoreDocumentJson,
  migrateScoreDocument,
  parseScoreDocumentJson,
  validateScoreDocumentSemantics,
  validateScoreFeatureProfile,
} from "../../src/core-kernel/index";
import { cloneK1_6ScoreFixture } from "./fixtures/k1-6-score";

function assertDeeplyFrozen(value: unknown): void {
  if (value === null || typeof value !== "object") return;
  assert.equal(Object.isFrozen(value), true);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
    if (descriptor !== undefined && "value" in descriptor) {
      assertDeeplyFrozen(descriptor.value);
    }
  }
}

test("four-measure fixture traverses codec validation profile and migration", () => {
  const source = cloneK1_6ScoreFixture();
  const decoded = decodeScoreDocument(source);
  assert.equal(decoded.ok, true);
  if (!decoded.ok) throw new Error("expected K1-6 fixture to decode");
  assert.notEqual(decoded.value, source);
  assert.deepEqual(validateScoreDocumentSemantics(decoded.value), {
    ok: true,
    diagnostics: [],
  });
  assert.deepEqual(validateScoreFeatureProfile(decoded.value), {
    status: "supported",
    diagnostics: [],
  });

  const encoded = encodeScoreDocumentJson(decoded.value);
  assert.equal(encoded.ok, true);
  if (!encoded.ok) throw new Error("expected K1-6 fixture to encode");
  const parsed = parseScoreDocumentJson(encoded.value);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) throw new Error("expected K1-6 fixture JSON to parse");
  assert.deepEqual(parsed.value, decoded.value);

  const migrated = migrateScoreDocument(source);
  assert.equal(migrated.status, "not-required");
  if (migrated.status !== "not-required") {
    throw new Error("expected current schema to need no migration");
  }
  assert.deepEqual(migrated.document, decoded.value);
  assert.notEqual(migrated.document, source);
  assertDeeplyFrozen(migrated.document);
  assert.deepEqual(migrated.report, {
    reportVersion: 1,
    kind: "migration",
    status: "completed",
    summary: {
      issueCount: 0,
      warningCount: 0,
      errorCount: 0,
      fatalCount: 0,
    },
    issues: [],
  });
  assert.deepEqual(createKernelValidationReport([]), {
    reportVersion: 1,
    kind: "validation",
    status: "completed",
    summary: {
      issueCount: 0,
      warningCount: 0,
      errorCount: 0,
      fatalCount: 0,
    },
    issues: [],
  });
});
