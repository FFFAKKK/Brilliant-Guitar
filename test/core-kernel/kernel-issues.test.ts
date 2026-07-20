import { test } from "node:test";
import assert = require("node:assert/strict");

import {
  createMigrationKernelIssue,
  createModuleKernelIssue,
  createOperationKernelIssue,
  createReportKernelIssue,
} from "../../src/core-kernel/errors/kernel-error";
import type { KernelIssue } from "../../src/core-kernel/reports/contracts";

function assertDeeplyFrozen(value: unknown): void {
  if (value === null || typeof value !== "object") {
    return;
  }
  assert.equal(Object.isFrozen(value), true);
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
    if (descriptor !== undefined && "value" in descriptor) {
      assertDeeplyFrozen(descriptor.value);
    }
  }
}

test("issue facts derive from closed code and are deeply frozen", () => {
  const warning: KernelIssue<"unsupported.chord"> =
    createOperationKernelIssue({
      code: "unsupported.chord",
      source: { kind: "core", subsystem: "profile" },
    });
  const fatal = createModuleKernelIssue({
    source: { kind: "module", moduleId: "test.module" },
  });

  assert.deepEqual(warning, {
    issueVersion: 1,
    code: "unsupported.chord",
    severity: "warning",
    messageKey: "core.unsupported.chord",
    source: { kind: "core", subsystem: "profile" },
  });
  assert.equal(fatal.code, "module.internal-error");
  assert.equal(fatal.severity, "fatal");
  assert.equal(fatal.messageKey, "core.module.internal-error");
  assertDeeplyFrozen(warning);
  assertDeeplyFrozen(fatal);
});

test("error families share safe conversion without leaking Error fields", () => {
  const operation = createOperationKernelIssue({
    code: "command.invalid-envelope",
    source: { kind: "core", subsystem: "command" },
    location: {
      kind: "score-address",
      address: { kind: "note", noteId: "note-1" },
    },
    details: { targetKind: "note" },
  });
  const migration = createMigrationKernelIssue({
    code: "migration.invalid-input",
    source: { kind: "core", subsystem: "migration" },
  });
  const report = createReportKernelIssue({
    code: "report.internal-error",
    source: { kind: "core", subsystem: "report" },
  });

  assert.equal(operation.severity, "error");
  assert.equal(migration.severity, "error");
  assert.equal(report.severity, "fatal");
  assert.deepEqual(operation.location, {
    kind: "score-address",
    address: { kind: "note", noteId: "note-1" },
  });
  assert.deepEqual(operation.details, { targetKind: "note" });

  for (const issue of [operation, migration, report]) {
    assert.equal("message" in issue, false);
    assert.equal("stack" in issue, false);
    assert.equal("cause" in issue, false);
    assertDeeplyFrozen(issue);
  }
});
