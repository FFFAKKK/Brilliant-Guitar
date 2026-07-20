import { test } from "node:test";
import assert = require("node:assert/strict");

import {
  createMigrationKernelIssue,
  createModuleKernelIssue,
  createOperationKernelIssue,
  createReportKernelIssue,
} from "../../src/core-kernel/errors/kernel-error";
import {
  createModuleInternalIssue,
  mapDiagnosticToKernelIssue,
  mapDiagnosticToKernelIssueWithFactory,
} from "../../src/core-kernel/reports/adapters";
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

test("diagnostic adapter preserves semantic and unsupported facts", () => {
  const nestedDetails = {
    owner: {
      kind: "part",
      ids: ["part-1", { noteId: "note-1" }],
    },
  };
  const semantic = mapDiagnosticToKernelIssue({
    code: "semantic.extension-owner-missing",
    messageKey: "core.semantic.extension-owner-missing",
    path: ["extensions", 0, "owner"],
    details: nestedDetails,
  });
  const unsupported = mapDiagnosticToKernelIssue({
    code: "unsupported.chord",
    messageKey: "core.unsupported.chord",
    path: ["parts", 0, "staves", 0],
  });

  assert.deepEqual(semantic, {
    issueVersion: 1,
    code: "semantic.extension-owner-missing",
    severity: "error",
    messageKey: "core.semantic.extension-owner-missing",
    source: { kind: "core", subsystem: "validation" },
    location: {
      kind: "diagnostic-path",
      path: ["extensions", 0, "owner"],
    },
    details: nestedDetails,
  });
  assert.deepEqual(unsupported, {
    issueVersion: 1,
    code: "unsupported.chord",
    severity: "warning",
    messageKey: "core.unsupported.chord",
    source: { kind: "core", subsystem: "profile" },
    location: {
      kind: "diagnostic-path",
      path: ["parts", 0, "staves", 0],
    },
  });
  assertDeeplyFrozen(semantic);
  assertDeeplyFrozen(unsupported);
});

test("diagnostic adapter is descriptor-first and never executes Proxy get traps", () => {
  let getCalls = 0;
  const proxy = new Proxy(
    {
      code: "semantic.id-empty",
      messageKey: "core.semantic.id-empty",
      path: [],
    },
    {
      get() {
        getCalls += 1;
        throw new Error("must not execute");
      },
    },
  );

  const issue = mapDiagnosticToKernelIssue(proxy as never);

  assert.equal(issue.code, "semantic.id-empty");
  assert.equal(getCalls, 0);
});

test("diagnostic adapter rejects extra fields, accessors, cycles and sparse arrays", () => {
  const extraField = {
    code: "semantic.id-empty",
    messageKey: "core.semantic.id-empty",
    path: [],
    extra: true,
  };
  const accessor = {
    code: "semantic.id-empty",
    messageKey: "core.semantic.id-empty",
    get path(): readonly never[] {
      throw new Error("must not execute");
    },
  };
  const cyclicDetails: Record<string, unknown> = {};
  cyclicDetails.self = cyclicDetails;
  const sparse = new Array(2);
  sparse[1] = "present";

  for (const input of [
    extraField,
    accessor,
    {
      code: "semantic.id-empty",
      messageKey: "core.semantic.id-empty",
      path: [],
      details: cyclicDetails,
    },
    {
      code: "semantic.id-empty",
      messageKey: "core.semantic.id-empty",
      path: [],
      details: { values: sparse },
    },
  ]) {
    const issue = mapDiagnosticToKernelIssue(input as never);
    assert.equal(issue.code, "report.invalid-input");
    assert.equal(issue.severity, "error");
  }
});

test("diagnostic adapter detaches nested values before callers mutate them", () => {
  const path: (string | number)[] = ["parts", 0];
  const ids = ["part-1"];
  const details = { ids };
  const issue = mapDiagnosticToKernelIssue({
    code: "semantic.id-duplicate",
    messageKey: "core.semantic.id-duplicate",
    path,
    details,
  });

  path[0] = "changed";
  ids[0] = "changed";
  details.ids = ["replaced"];

  assert.deepEqual(issue.location, {
    kind: "diagnostic-path",
    path: ["parts", 0],
  });
  assert.deepEqual(issue.details, { ids: ["part-1"] });
});

test("adapter converts unexpected internal failures without leaking private text", () => {
  const issue = mapDiagnosticToKernelIssueWithFactory(
    {
      code: "semantic.id-empty",
      messageKey: "core.semantic.id-empty",
      path: [],
    },
    (() => {
      throw new Error("PRIVATE_ADAPTER_FAILURE");
    }),
  );

  assert.equal(issue.code, "report.internal-error");
  assert.equal(issue.severity, "fatal");
  assert.equal(JSON.stringify(issue).includes("PRIVATE_ADAPTER_FAILURE"), false);
});

test("module issue adapter validates exact module identity records", () => {
  assert.deepEqual(
    createModuleInternalIssue({
      kind: "module",
      moduleId: "official.analysis",
      contributionId: "selector.metadata",
    }),
    {
      issueVersion: 1,
      code: "module.internal-error",
      severity: "fatal",
      messageKey: "core.module.internal-error",
      source: {
        kind: "module",
        moduleId: "official.analysis",
        contributionId: "selector.metadata",
      },
    },
  );

  for (const invalid of [
    { kind: "module", moduleId: "../unsafe" },
    { kind: "module", moduleId: "official.analysis", capability: "score:read" },
    { kind: "core", moduleId: "official.analysis" },
  ]) {
    assert.equal(
      createModuleInternalIssue(invalid as never).code,
      "report.invalid-input",
    );
  }
});
