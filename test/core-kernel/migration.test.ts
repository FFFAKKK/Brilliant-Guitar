import { test } from "node:test";
import assert = require("node:assert/strict");
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type {
  MigrationFailure,
  MigrationResult,
} from "../../src/core-kernel/migration/contracts";
import { CORE_MIGRATION_STEPS } from "../../src/core-kernel/migration/steps";

type MigrationStatus = MigrationResult["status"];
const APPROVED_MIGRATION_STATUSES = [
  "not-required",
  "rejected",
] as const satisfies readonly MigrationStatus[];

function consumeMigrationFailure(failure: MigrationFailure): string {
  return failure.code;
}

test("migration contracts expose only not-required and rejected outcomes", () => {
  assert.deepEqual(APPROVED_MIGRATION_STATUSES, ["not-required", "rejected"]);
  assert.equal(
    consumeMigrationFailure({ code: "migration.internal-error" }),
    "migration.internal-error",
  );
});

test("production migration step catalog is sealed and empty", () => {
  assert.equal(Object.isFrozen(CORE_MIGRATION_STEPS), true);
  assert.deepEqual(CORE_MIGRATION_STEPS, []);
});

test("public index contains no migration extension or private catalog API", () => {
  const publicIndex = readFileSync(
    resolve(process.cwd(), "src", "core-kernel", "index.ts"),
    "utf8",
  );
  for (const forbidden of [
    "MigrationContribution",
    "registerMigration",
    "unregisterMigration",
    "CORE_MIGRATION_STEPS",
  ]) {
    assert.equal(publicIndex.includes(forbidden), false);
  }
});
