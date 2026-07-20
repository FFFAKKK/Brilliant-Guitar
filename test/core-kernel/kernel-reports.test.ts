import { test } from "node:test";
import assert = require("node:assert/strict");

import { createReportKernelIssue } from "../../src/core-kernel/errors/kernel-error";
import { buildKernelReport } from "../../src/core-kernel/reports/build-report";
import { createKernelValidationReport } from "../../src/core-kernel/reports/validation-report";
import { createDiagnostic } from "../../src/core-kernel/validation/diagnostics";

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

test("validation report derives every status and count", () => {
  const completed = createKernelValidationReport([]);
  const warned = createKernelValidationReport([
    createDiagnostic("unsupported.chord", []),
  ]);
  const rejected = createKernelValidationReport([
    createDiagnostic("semantic.id-empty", ["parts", 0, "id"]),
  ]);
  const fatal = buildKernelReport("validation", [
    createReportKernelIssue({
      code: "report.internal-error",
      source: { kind: "core", subsystem: "report" },
    }),
  ]);

  assert.deepEqual(completed, {
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
  assert.equal(warned.kind, "validation");
  assert.equal(warned.status, "completed-with-warnings");
  assert.deepEqual(warned.summary, {
    issueCount: 1,
    warningCount: 1,
    errorCount: 0,
    fatalCount: 0,
  });
  assert.equal(rejected.status, "rejected");
  assert.deepEqual(rejected.summary, {
    issueCount: 1,
    warningCount: 0,
    errorCount: 1,
    fatalCount: 0,
  });
  assert.equal(fatal.status, "rejected");
  assert.deepEqual(fatal.summary, {
    issueCount: 1,
    warningCount: 0,
    errorCount: 0,
    fatalCount: 1,
  });

  for (const report of [completed, warned, rejected, fatal]) {
    assertDeeplyFrozen(report);
  }
});

test("validation projection is deterministic and detached from source mutation", () => {
  const path: (string | number)[] = ["extensions", 0, "owner"];
  const ownerIds = ["part-missing"];
  const details = { ownerIds };
  const diagnostics = [
    {
      code: "semantic.extension-owner-missing",
      messageKey: "core.semantic.extension-owner-missing",
      path,
      details,
    },
  ] as const;

  const first = createKernelValidationReport(diagnostics);
  const second = createKernelValidationReport(diagnostics);
  assert.deepEqual(first, second);

  path[0] = "changed";
  ownerIds[0] = "changed";
  details.ownerIds = ["replaced"];

  assert.deepEqual(first.issues[0]?.location, {
    kind: "diagnostic-path",
    path: ["extensions", 0, "owner"],
  });
  assert.deepEqual(first.issues[0]?.details, {
    ownerIds: ["part-missing"],
  });
});

test("malformed sparse and Proxy inputs return one invalid-input report", () => {
  const sparse = new Array(2);
  sparse[1] = createDiagnostic("semantic.id-empty", []);
  let getCalls = 0;
  const proxy = new Proxy(sparse, {
    get() {
      getCalls += 1;
      throw new Error("must not execute");
    },
  });

  for (const input of [sparse, proxy]) {
    const report = createKernelValidationReport(input as never);
    assert.equal(report.status, "rejected");
    assert.deepEqual(report.issues.map((issue) => issue.code), [
      "report.invalid-input",
    ]);
    assert.deepEqual(report.summary, {
      issueCount: 1,
      warningCount: 0,
      errorCount: 1,
      fatalCount: 0,
    });
    assertDeeplyFrozen(report);
  }
  assert.equal(getCalls, 0);
});

test("malformed diagnostic records reject the whole validation projection", () => {
  const report = createKernelValidationReport([
    createDiagnostic("unsupported.chord", []),
    {
      code: "semantic.id-empty",
      messageKey: "core.semantic.id-empty",
      path: [],
      extra: true,
    } as never,
  ]);

  assert.deepEqual(report.issues.map((issue) => issue.code), [
    "report.invalid-input",
  ]);
  assert.equal(report.status, "rejected");
});
