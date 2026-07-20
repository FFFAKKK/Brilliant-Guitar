import { test } from "node:test";
import assert = require("node:assert/strict");
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type {
  MigrationFailure,
  MigrationResult,
} from "../../src/core-kernel/migration/contracts";
import {
  migrateScoreDocument,
  migrateScoreDocumentWithDependencies,
} from "../../src/core-kernel/migration/migrate-score-document";
import { CORE_MIGRATION_STEPS } from "../../src/core-kernel/migration/steps";
import { CommandBus } from "../../src/core-kernel/commands/command-bus";
import { decodeScoreDocument } from "../../src/core-kernel/codec/decode-score-document";
import { validateScoreDocumentSemantics } from "../../src/core-kernel/validation/validate-score-semantics";
import {
  cloneCoreScoreFixture,
  createCoreScoreFixture,
} from "./fixtures/core-score";

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

function issueCodes(result: MigrationResult): readonly string[] {
  return result.report.issues.map((issue) => issue.code);
}

test("valid current schema is detached and needs no migration", () => {
  const input = cloneCoreScoreFixture();
  const result = migrateScoreDocument(input);

  assert.equal(result.status, "not-required");
  if (result.status !== "not-required") {
    assert.fail("expected current schema to need no migration");
  }
  assert.deepEqual(result.document, createCoreScoreFixture());
  assert.deepEqual(result.report, {
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
  assertDeeplyFrozen(result);
  assert.notEqual(result.document, input);
});

test("future schema rejects with outer and concrete decode issues", () => {
  const future = cloneCoreScoreFixture() as unknown as Record<string, unknown>;
  future.schemaVersion = "brilliant-score-2";
  const result = migrateScoreDocument(future);

  assert.equal(result.status, "rejected");
  if (result.status !== "rejected") {
    assert.fail("expected future schema rejection");
  }
  assert.deepEqual(result.failure, {
    code: "migration.unsupported-source-version",
  });
  assert.deepEqual(issueCodes(result), [
    "migration.unsupported-source-version",
    "decode.unsupported-schema-version",
  ]);
  assert.equal("document" in result, false);
  assertDeeplyFrozen(result);
});

test("malformed current shape preserves every concrete decode issue", () => {
  const malformed = cloneCoreScoreFixture() as unknown as {
    metadata: {
      title: unknown;
      authors: unknown[];
      tempo: { bpm: number };
    };
  };
  malformed.metadata.title = 42;
  malformed.metadata.authors = [42];
  malformed.metadata.tempo.bpm = Number.POSITIVE_INFINITY;
  const decoded = decodeScoreDocument(malformed);
  assert.equal(decoded.ok, false);
  const result = migrateScoreDocument(malformed);

  assert.equal(result.status, "rejected");
  if (result.status !== "rejected" || decoded.ok) {
    assert.fail("expected malformed migration input");
  }
  assert.equal(result.failure.code, "migration.invalid-input");
  assert.deepEqual(
    issueCodes(result),
    ["migration.invalid-input", ...decoded.diagnostics.map(({ code }) => code)],
  );
  assert.equal(result.report.issues.length, decoded.diagnostics.length + 1);
  assertDeeplyFrozen(result);
});

test("semantic-invalid current schema preserves every semantic issue", () => {
  const invalid = cloneCoreScoreFixture();
  (invalid as { id: string }).id = "";
  (invalid.parts[0]?.staves[0] as { lineCount: number }).lineCount = 0;
  const semantic = validateScoreDocumentSemantics(invalid);
  assert.equal(semantic.ok, false);
  const result = migrateScoreDocument(invalid);

  assert.equal(result.status, "rejected");
  if (result.status !== "rejected") {
    assert.fail("expected semantic rejection");
  }
  assert.equal(result.failure.code, "migration.semantic-invalid");
  assert.deepEqual(issueCodes(result), [
    "migration.semantic-invalid",
    ...semantic.diagnostics.map(({ code }) => code),
  ]);
  assert.equal(result.report.issues.length, semantic.diagnostics.length + 1);
  assertDeeplyFrozen(result);
});

test("unexpected dependency failures collapse without raw error data", () => {
  const result = migrateScoreDocumentWithDependencies(
    cloneCoreScoreFixture(),
    {
      decode() {
        throw new Error("PRIVATE_MIGRATION_FAILURE");
      },
      validate: validateScoreDocumentSemantics,
    },
  );

  assert.equal(result.status, "rejected");
  assert.deepEqual(issueCodes(result), ["migration.internal-error"]);
  assert.equal(
    JSON.stringify(result).includes("PRIVATE_MIGRATION_FAILURE"),
    false,
  );
  assertDeeplyFrozen(result);
});

test("migration preserves deep unknown extensions and isolates mutations", () => {
  const input = cloneCoreScoreFixture();
  (input.extensions as unknown[]).push({
    namespace: "com.example.deep",
    schemaVersion: 7,
    owner: { kind: "score" },
    payload: {
      nested: { values: [1, { label: "keep" }] },
    },
  });
  const first = migrateScoreDocument(input);
  const second = migrateScoreDocument(input);
  assert.deepEqual(first, second);
  assert.equal(first.status, "not-required");
  if (first.status !== "not-required") {
    assert.fail("expected extension-preserving success");
  }

  const inputPayload = input.extensions[0]?.payload as {
    nested: { values: unknown[] };
  };
  inputPayload.nested.values[1] = { label: "changed" };
  assert.deepEqual(first.document.extensions[0]?.payload, {
    nested: { values: [1, { label: "keep" }] },
  });
  assert.equal(
    Reflect.set(
      first.document.extensions[0]?.payload.nested as object,
      "changed",
      true,
    ),
    false,
  );
});

test("migration reads schema through the K1-1 decoder exactly once", () => {
  const input = cloneCoreScoreFixture() as unknown as Record<string, unknown>;
  let schemaReads = 0;
  let schemaValue: unknown = "brilliant-score-1";
  Object.defineProperty(input, "schemaVersion", {
    configurable: true,
    enumerable: true,
    get() {
      schemaReads += 1;
      return schemaValue;
    },
    set(value: unknown) {
      schemaValue = value;
    },
  });

  assert.equal(migrateScoreDocument(input).status, "not-required");
  assert.equal(schemaReads, 1);
});

test("migration results contain no generated identity or clock fields", () => {
  const result = migrateScoreDocument(cloneCoreScoreFixture());
  const forbiddenKeys = new Set([
    "migrationId",
    "reportId",
    "timestamp",
    "createdAt",
    "updatedAt",
  ]);
  const found: string[] = [];
  const visit = (value: unknown): void => {
    if (value === null || typeof value !== "object") {
      return;
    }
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== "string") {
        continue;
      }
      if (forbiddenKeys.has(key)) {
        found.push(key);
      }
      const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
      if (descriptor !== undefined && "value" in descriptor) {
        visit(descriptor.value);
      }
    }
  };
  visit(result);
  assert.deepEqual(found, []);
});

test("migration is isolated from CommandBus history dirty and events", () => {
  const created = CommandBus.create(cloneCoreScoreFixture());
  assert.equal(created.ok, true);
  if (!created.ok) {
    assert.fail("expected valid CommandBus");
  }
  const events: unknown[] = [];
  const subscribed = created.value.subscribe((event: unknown) => events.push(event));
  assert.equal(subscribed.status, "subscribed");
  assert.equal(
    created.value.submit({
      commandVersion: 1,
      commandId: "core.note.set-written-pitch",
      target: { kind: "note", noteId: "note-1" },
      payload: {
        writtenPitch: { step: "D", alter: 0, octave: 4 },
      },
    }).status,
    "committed",
  );
  const before = created.value.read();
  const eventsBefore = structuredClone(events);

  assert.equal(migrateScoreDocument(cloneCoreScoreFixture()).status, "not-required");

  assert.deepEqual(created.value.read(), before);
  assert.deepEqual(events, eventsBefore);
});
