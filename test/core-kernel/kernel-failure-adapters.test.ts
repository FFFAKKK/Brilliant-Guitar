import { test } from "node:test";
import assert = require("node:assert/strict");

import type { CommandFailure } from "../../src/core-kernel/commands/contracts";
import type { EventSubscriptionResult } from "../../src/core-kernel/events/contracts";
import type {
  CheckpointFailure,
  ReadFailure,
} from "../../src/core-kernel/read/contracts";
import {
  mapCheckpointFailureToKernelIssues,
  mapCommandFailureToKernelIssues,
  mapEventSubscriptionFailureToKernelIssues,
  mapReadFailureToKernelIssues,
  mapRegistryAccessFailureToKernelIssues,
  mapRegistryStartupFailureToKernelIssues,
} from "../../src/core-kernel/reports/adapters";
import type {
  KernelIssue,
  KernelIssueSource,
} from "../../src/core-kernel/reports/contracts";
import type {
  KernelRegistryAccessFailure,
  KernelRegistryStartupFailure,
} from "../../src/core-kernel/registry/contracts";

type EventSubscriptionFailure = Extract<
  EventSubscriptionResult,
  { readonly status: "rejected" }
>["failure"];

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

interface ExpectedFailure {
  readonly failure: { readonly code: string };
  readonly source: KernelIssueSource;
  readonly details?: Readonly<Record<string, unknown>>;
}

function assertSingleMappedIssue(
  actual: readonly KernelIssue[],
  expected: ExpectedFailure,
): void {
  assert.equal(actual.length, 1);
  const issue = actual[0];
  if (issue === undefined) {
    assert.fail("expected one mapped issue");
  }
  assert.equal(issue.code, expected.failure.code);
  assert.deepEqual(issue.source, expected.source);
  assert.deepEqual(issue.details, expected.details);
  assertDeeplyFrozen(actual);
}

test("command and history adapters cover every accepted failure code", () => {
  const commandSource = { kind: "core", subsystem: "command" } as const;
  const eventSource = { kind: "core", subsystem: "event" } as const;
  const fixtures = [
    { code: "command.invalid-envelope" },
    { code: "command.unsupported-version" },
    { code: "command.unknown-id" },
    { code: "command.target-mismatch" },
    { code: "command.target-not-found" },
    { code: "command.anchor-not-found" },
    { code: "command.anchor-wrong-owner" },
    { code: "command.version-overflow" },
    { code: "command.internal-error" },
    { code: "history.empty-undo" },
    { code: "history.empty-redo" },
    { code: "history.invariant-violation" },
    { code: "event.reentrant-write" },
    { code: "event.sequence-overflow" },
  ] satisfies readonly Exclude<
    CommandFailure,
    { readonly code: "command.semantic-invalid" }
  >[];

  for (const failure of fixtures) {
    assertSingleMappedIssue(mapCommandFailureToKernelIssues(failure), {
      failure,
      source: failure.code.startsWith("event.") ? eventSource : commandSource,
    });
  }
});

test("semantic command failure preserves operation-first diagnostic order", () => {
  const issues = mapCommandFailureToKernelIssues({
    code: "command.semantic-invalid",
    diagnostics: [
      {
        code: "semantic.id-empty",
        messageKey: "core.semantic.id-empty",
        path: ["parts", 0, "id"],
      },
      {
        code: "semantic.extension-owner-missing",
        messageKey: "core.semantic.extension-owner-missing",
        path: ["extensions", 1, "owner"],
        details: { ownerId: "part-missing" },
      },
    ],
  });

  assert.deepEqual(
    issues.map((issue) => issue.code),
    [
      "command.semantic-invalid",
      "semantic.id-empty",
      "semantic.extension-owner-missing",
    ],
  );
  assert.deepEqual(issues[1]?.location, {
    kind: "diagnostic-path",
    path: ["parts", 0, "id"],
  });
  assert.deepEqual(issues[2]?.location, {
    kind: "diagnostic-path",
    path: ["extensions", 1, "owner"],
  });
  assert.deepEqual(issues[2]?.details, { ownerId: "part-missing" });
  assertDeeplyFrozen(issues);
});

test("checkpoint adapter covers every accepted failure code", () => {
  const fixtures = [
    { code: "checkpoint.invalid" },
    { code: "checkpoint.document-mismatch" },
    { code: "checkpoint.version-unavailable" },
    { code: "checkpoint.invariant-violation" },
    { code: "event.reentrant-write" },
    { code: "event.sequence-overflow" },
  ] satisfies readonly CheckpointFailure[];

  for (const failure of fixtures) {
    assertSingleMappedIssue(mapCheckpointFailureToKernelIssues(failure), {
      failure,
      source: failure.code.startsWith("event.")
        ? { kind: "core", subsystem: "event" }
        : { kind: "core", subsystem: "session" },
    });
  }
});

test("read adapter covers every accepted failure code", () => {
  const fixtures = [
    { code: "read.invalid-address" },
    { code: "read.entity-not-found" },
    { code: "read.invalid-range" },
    { code: "read.range-endpoint-not-found" },
    { code: "read.range-owner-mismatch" },
    { code: "read.invalid-snapshot" },
    { code: "read.invariant-violation" },
  ] satisfies readonly ReadFailure[];

  for (const failure of fixtures) {
    assertSingleMappedIssue(mapReadFailureToKernelIssues(failure), {
      failure,
      source: { kind: "core", subsystem: "read" },
    });
  }
});

test("event subscription adapter covers its accepted failure code", () => {
  const failure = {
    code: "event.invalid-handler",
  } satisfies EventSubscriptionFailure;
  assertSingleMappedIssue(
    mapEventSubscriptionFailureToKernelIssues(failure),
    {
      failure,
      source: { kind: "core", subsystem: "event" },
    },
  );
});

test("registry startup adapter uses exact per-code detail allowlists", () => {
  const fixtures = [
    { failure: { code: "registry.invalid-startup-input" } },
    {
      failure: {
        code: "registry.registration-entry-not-found",
        registrationEntryId: "core.missing.v1",
      },
      details: { registrationEntryId: "core.missing.v1" },
    },
    {
      failure: {
        code: "registry.registration-owner-mismatch",
        registrationEntryId: "core.commands.v1",
        moduleId: "core.selectors",
      },
      details: {
        registrationEntryId: "core.commands.v1",
        moduleId: "core.selectors",
      },
    },
    {
      failure: { code: "registry.duplicate-module-id", moduleId: "core.commands" },
      details: { moduleId: "core.commands" },
    },
    {
      failure: {
        code: "registry.duplicate-contribution-id",
        contributionId: "core.selector.score-metadata",
      },
      details: { contributionId: "core.selector.score-metadata" },
    },
    {
      failure: { code: "registry.unsupported-origin", moduleId: "third.party" },
      details: { moduleId: "third.party" },
    },
    {
      failure: { code: "registry.unsupported-runtime", moduleId: "third.party" },
      details: { moduleId: "third.party" },
    },
    {
      failure: {
        code: "registry.unsupported-trust-level",
        moduleId: "third.party",
      },
      details: { moduleId: "third.party" },
    },
    {
      failure: {
        code: "registry.api-version-incompatible",
        moduleId: "third.party",
      },
      details: { moduleId: "third.party" },
    },
    {
      failure: {
        code: "registry.capability-denied",
        moduleId: "third.party",
        capability: "score:read",
      },
      details: { moduleId: "third.party", capability: "score:read" },
    },
    {
      failure: {
        code: "registry.invalid-contribution",
        registrationEntryId: "core.commands.v1",
      },
      details: { registrationEntryId: "core.commands.v1" },
    },
    {
      failure: {
        code: "registry.handler-mismatch",
        contributionId: "core.selector.score-metadata",
      },
      details: { contributionId: "core.selector.score-metadata" },
    },
    { failure: { code: "registry.internal-error" } },
  ] satisfies readonly {
    readonly failure: KernelRegistryStartupFailure;
    readonly details?: Readonly<Record<string, unknown>>;
  }[];

  for (const fixture of fixtures) {
    assertSingleMappedIssue(
      mapRegistryStartupFailureToKernelIssues(fixture.failure),
      {
        failure: fixture.failure,
        source: { kind: "core", subsystem: "registry" },
        ...(fixture.details === undefined ? {} : { details: fixture.details }),
      },
    );
  }
});

test("registry access adapter uses exact per-code detail allowlists", () => {
  const fixtures = [
    { failure: { code: "registry.invalid-invocation" } },
    {
      failure: { code: "registry.module-not-found", moduleId: "third.party" },
      details: { moduleId: "third.party" },
    },
    {
      failure: {
        code: "registry.contribution-not-found",
        contributionId: "third.party.command",
      },
      details: { contributionId: "third.party.command" },
    },
    {
      failure: {
        code: "registry.capability-denied",
        moduleId: "third.party",
        capability: "command:execute",
      },
      details: { moduleId: "third.party", capability: "command:execute" },
    },
    { failure: { code: "registry.internal-error" } },
  ] satisfies readonly {
    readonly failure: KernelRegistryAccessFailure;
    readonly details?: Readonly<Record<string, unknown>>;
  }[];

  for (const fixture of fixtures) {
    assertSingleMappedIssue(
      mapRegistryAccessFailureToKernelIssues(fixture.failure),
      {
        failure: fixture.failure,
        source: { kind: "core", subsystem: "registry" },
        ...(fixture.details === undefined ? {} : { details: fixture.details }),
      },
    );
  }
});

test("nested malformed diagnostics collapse atomically to one invalid-input issue", () => {
  const issues = mapCommandFailureToKernelIssues({
    code: "command.semantic-invalid",
    diagnostics: [
      {
        code: "semantic.id-empty",
        messageKey: "core.semantic.id-empty",
        path: [],
      },
      {
        code: "semantic.id-empty",
        messageKey: "core.semantic.id-empty",
        path: [],
        extra: true,
      } as never,
    ],
  });

  assert.deepEqual(issues.map((issue) => issue.code), ["report.invalid-input"]);
  assertDeeplyFrozen(issues);
});

test("every failure family rejects extra fields, accessors and hostile Proxies", () => {
  const families = [
    {
      map: (value: unknown) => mapCommandFailureToKernelIssues(value as never),
      valid: { code: "command.invalid-envelope" },
    },
    {
      map: (value: unknown) => mapCheckpointFailureToKernelIssues(value as never),
      valid: { code: "checkpoint.invalid" },
    },
    {
      map: (value: unknown) => mapReadFailureToKernelIssues(value as never),
      valid: { code: "read.invalid-address" },
    },
    {
      map: (value: unknown) =>
        mapEventSubscriptionFailureToKernelIssues(value as never),
      valid: { code: "event.invalid-handler" },
    },
    {
      map: (value: unknown) =>
        mapRegistryStartupFailureToKernelIssues(value as never),
      valid: { code: "registry.invalid-startup-input" },
    },
    {
      map: (value: unknown) =>
        mapRegistryAccessFailureToKernelIssues(value as never),
      valid: { code: "registry.invalid-invocation" },
    },
  ];

  for (const family of families) {
    let getterCalls = 0;
    const accessor = Object.defineProperty({}, "code", {
      enumerable: true,
      get() {
        getterCalls += 1;
        throw new Error("must not execute");
      },
    });
    const hostileProxy = new Proxy(family.valid, {
      ownKeys() {
        throw new Error("hostile ownKeys");
      },
    });
    for (const invalid of [
      { ...family.valid, extra: true },
      accessor,
      hostileProxy,
    ]) {
      const issues = family.map(invalid);
      assert.deepEqual(issues.map((issue) => issue.code), [
        "report.invalid-input",
      ]);
      assertDeeplyFrozen(issues);
    }
    assert.equal(getterCalls, 0);
  }
});
