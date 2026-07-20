import { test } from "node:test";
import assert = require("node:assert/strict");

import { CommandBus } from "../../src/core-kernel/commands/command-bus";
import type { CommandFailure } from "../../src/core-kernel/commands/contracts";
import { replayCoreCommands } from "../../src/core-kernel/commands/replay";
import type { EventSubscriptionResult } from "../../src/core-kernel/events/contracts";
import type {
  CheckpointFailure,
  ReadFailure,
} from "../../src/core-kernel/read/contracts";
import {
  mapCheckpointFailureToKernelIssues,
  mapCommandBusCreationFailureToKernelIssues,
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
import { cloneCoreScoreFixture } from "./fixtures/core-score";

type EventSubscriptionFailure = Extract<
  EventSubscriptionResult,
  { readonly status: "rejected" }
>["failure"];

type FailureByCode<Failure extends { readonly code: string }> = {
  readonly [Code in Failure["code"]]: Extract<
    Failure,
    { readonly code: Code }
  >;
};

type FailureFixtureByCode<Failure extends { readonly code: string }> = {
  readonly [Code in Failure["code"]]: {
    readonly failure: Extract<Failure, { readonly code: Code }>;
    readonly details?: Readonly<Record<string, unknown>>;
  };
};

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
  type CodeOnlyCommandFailure = Exclude<
    CommandFailure,
    { readonly code: "command.semantic-invalid" }
  >;
  const fixtures = {
    "command.invalid-envelope": { code: "command.invalid-envelope" },
    "command.unsupported-version": { code: "command.unsupported-version" },
    "command.unknown-id": { code: "command.unknown-id" },
    "command.target-mismatch": { code: "command.target-mismatch" },
    "command.target-not-found": { code: "command.target-not-found" },
    "command.anchor-not-found": { code: "command.anchor-not-found" },
    "command.anchor-wrong-owner": { code: "command.anchor-wrong-owner" },
    "command.version-overflow": { code: "command.version-overflow" },
    "command.internal-error": { code: "command.internal-error" },
    "history.empty-undo": { code: "history.empty-undo" },
    "history.empty-redo": { code: "history.empty-redo" },
    "history.invariant-violation": { code: "history.invariant-violation" },
    "event.reentrant-write": { code: "event.reentrant-write" },
    "event.sequence-overflow": { code: "event.sequence-overflow" },
  } satisfies FailureByCode<CodeOnlyCommandFailure>;

  for (const failure of Object.values(fixtures)) {
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

test("command bus creation and replay failures preserve semantic diagnostics", () => {
  const invalid = cloneCoreScoreFixture();
  (invalid.metadata.tempo as { bpm: number }).bpm = -1;

  const created = CommandBus.create(invalid);
  assert.equal(created.ok, false);
  if (created.ok) {
    return;
  }
  const creationIssues = mapCommandBusCreationFailureToKernelIssues(
    created.failure,
  );
  assert.deepEqual(
    creationIssues.map((issue) => issue.code),
    ["command.invalid-initial-document", "semantic.tempo-invalid"],
  );

  const replayed = replayCoreCommands(invalid, []);
  assert.equal(replayed.status, "invalid-initial-document");
  if (replayed.status !== "invalid-initial-document") {
    return;
  }
  assert.deepEqual(
    mapCommandBusCreationFailureToKernelIssues(replayed.failure),
    creationIssues,
  );
  assertDeeplyFrozen(creationIssues);
});

test("command bus creation failure supports its code-only runtime shape", () => {
  const issues = mapCommandBusCreationFailureToKernelIssues({
    code: "command.invalid-initial-document",
  });

  assert.deepEqual(issues.map((issue) => issue.code), [
    "command.invalid-initial-document",
  ]);
  assertDeeplyFrozen(issues);
});

test("checkpoint adapter covers every accepted failure code", () => {
  const fixtures = {
    "checkpoint.invalid": { code: "checkpoint.invalid" },
    "checkpoint.document-mismatch": { code: "checkpoint.document-mismatch" },
    "checkpoint.version-unavailable": { code: "checkpoint.version-unavailable" },
    "checkpoint.invariant-violation": { code: "checkpoint.invariant-violation" },
    "event.reentrant-write": { code: "event.reentrant-write" },
    "event.sequence-overflow": { code: "event.sequence-overflow" },
  } satisfies FailureByCode<CheckpointFailure>;

  for (const failure of Object.values(fixtures)) {
    assertSingleMappedIssue(mapCheckpointFailureToKernelIssues(failure), {
      failure,
      source: failure.code.startsWith("event.")
        ? { kind: "core", subsystem: "event" }
        : { kind: "core", subsystem: "session" },
    });
  }
});

test("read adapter covers every accepted failure code", () => {
  const fixtures = {
    "read.invalid-address": { code: "read.invalid-address" },
    "read.entity-not-found": { code: "read.entity-not-found" },
    "read.invalid-range": { code: "read.invalid-range" },
    "read.range-endpoint-not-found": { code: "read.range-endpoint-not-found" },
    "read.range-owner-mismatch": { code: "read.range-owner-mismatch" },
    "read.invalid-snapshot": { code: "read.invalid-snapshot" },
    "read.invariant-violation": { code: "read.invariant-violation" },
  } satisfies FailureByCode<ReadFailure>;

  for (const failure of Object.values(fixtures)) {
    assertSingleMappedIssue(mapReadFailureToKernelIssues(failure), {
      failure,
      source: { kind: "core", subsystem: "read" },
    });
  }
});

test("event subscription adapter covers its accepted failure code", () => {
  const fixtures = {
    "event.invalid-handler": { code: "event.invalid-handler" },
  } satisfies FailureByCode<EventSubscriptionFailure>;
  for (const failure of Object.values(fixtures)) {
    assertSingleMappedIssue(
      mapEventSubscriptionFailureToKernelIssues(failure),
      {
        failure,
        source: { kind: "core", subsystem: "event" },
      },
    );
  }
});

test("registry startup adapter uses exact per-code detail allowlists", () => {
  const fixtures = {
    "registry.invalid-startup-input": {
      failure: { code: "registry.invalid-startup-input" },
    },
    "registry.registration-entry-not-found": {
      failure: {
        code: "registry.registration-entry-not-found",
        registrationEntryId: "core.missing.v1",
      },
      details: { registrationEntryId: "core.missing.v1" },
    },
    "registry.registration-owner-mismatch": {
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
    "registry.duplicate-module-id": {
      failure: { code: "registry.duplicate-module-id", moduleId: "core.commands" },
      details: { moduleId: "core.commands" },
    },
    "registry.duplicate-contribution-id": {
      failure: {
        code: "registry.duplicate-contribution-id",
        contributionId: "core.selector.score-metadata",
      },
      details: { contributionId: "core.selector.score-metadata" },
    },
    "registry.unsupported-origin": {
      failure: { code: "registry.unsupported-origin", moduleId: "third.party" },
      details: { moduleId: "third.party" },
    },
    "registry.unsupported-runtime": {
      failure: { code: "registry.unsupported-runtime", moduleId: "third.party" },
      details: { moduleId: "third.party" },
    },
    "registry.unsupported-trust-level": {
      failure: {
        code: "registry.unsupported-trust-level",
        moduleId: "third.party",
      },
      details: { moduleId: "third.party" },
    },
    "registry.api-version-incompatible": {
      failure: {
        code: "registry.api-version-incompatible",
        moduleId: "third.party",
      },
      details: { moduleId: "third.party" },
    },
    "registry.capability-denied": {
      failure: {
        code: "registry.capability-denied",
        moduleId: "third.party",
        capability: "score:read",
      },
      details: { moduleId: "third.party", capability: "score:read" },
    },
    "registry.invalid-contribution": {
      failure: {
        code: "registry.invalid-contribution",
        registrationEntryId: "core.commands.v1",
      },
      details: { registrationEntryId: "core.commands.v1" },
    },
    "registry.handler-mismatch": {
      failure: {
        code: "registry.handler-mismatch",
        contributionId: "core.selector.score-metadata",
      },
      details: { contributionId: "core.selector.score-metadata" },
    },
    "registry.internal-error": {
      failure: { code: "registry.internal-error" },
    },
  } satisfies FailureFixtureByCode<KernelRegistryStartupFailure>;

  for (const fixture of Object.values(fixtures)) {
    assertSingleMappedIssue(
      mapRegistryStartupFailureToKernelIssues(fixture.failure),
      {
        failure: fixture.failure,
        source: { kind: "core", subsystem: "registry" },
        ...("details" in fixture ? { details: fixture.details } : {}),
      },
    );
  }
});

test("registry access adapter uses exact per-code detail allowlists", () => {
  const fixtures = {
    "registry.invalid-invocation": {
      failure: { code: "registry.invalid-invocation" },
    },
    "registry.module-not-found": {
      failure: { code: "registry.module-not-found", moduleId: "third.party" },
      details: { moduleId: "third.party" },
    },
    "registry.contribution-not-found": {
      failure: {
        code: "registry.contribution-not-found",
        contributionId: "third.party.command",
      },
      details: { contributionId: "third.party.command" },
    },
    "registry.capability-denied": {
      failure: {
        code: "registry.capability-denied",
        moduleId: "third.party",
        capability: "command:execute",
      },
      details: { moduleId: "third.party", capability: "command:execute" },
    },
    "registry.internal-error": {
      failure: { code: "registry.internal-error" },
    },
  } satisfies FailureFixtureByCode<KernelRegistryAccessFailure>;

  for (const fixture of Object.values(fixtures)) {
    assertSingleMappedIssue(
      mapRegistryAccessFailureToKernelIssues(fixture.failure),
      {
        failure: fixture.failure,
        source: { kind: "core", subsystem: "registry" },
        ...("details" in fixture ? { details: fixture.details } : {}),
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
      map: (value: unknown) =>
        mapCommandBusCreationFailureToKernelIssues(value as never),
      valid: { code: "command.invalid-initial-document" },
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
