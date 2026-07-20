# K1-5 Errors Diagnostics Reports Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:executing-plans` in inline mode and complete each task with its own RED/GREEN verification before moving on. Do not dispatch implementation or check sub-agents for this repository workflow.

**Goal:** Add an internal object-oriented error foundation, public immutable issue/report projections, lossless K1-1 through K1-4 adapters, and a deterministic in-memory current-schema compatibility entry without changing accepted subsystem result contracts.

**Architecture:** Existing diagnostics and subsystem failures remain authoritative. Descriptor-first adapters project them into deeply frozen `KernelIssue` records; an internal sealed class hierarchy owns shared error behavior; invariant-preserving builders derive validation/migration reports; migration only validates and detaches the current `brilliant-score-1` candidate or safely rejects it.

**Tech Stack:** TypeScript 5.8, Node.js test runner, existing `structuredClone`, `deepFreezeValue`, K1-1 codec/semantic validator, K1-4 descriptor-first strict-codec helpers, no new runtime dependencies.

**Current status:** The user approved `prd.md`, `design.md`, and this implementation plan on 2026-07-20. The task is still not started; production work remains forbidden until the operator activates the Trellis task and verifies a dedicated `codex/k1-5-errors-diagnostics-reports-migration` branch and baseline.

## Global Constraints

- Preserve K1-4 accepted baseline `94766a0930c05e5339c44f667deaf02116af1c0c` plus subsequently approved documentation/task lifecycle commits.
- Do not edit or stage user-owned `.trellis/maintenance/` or `.trellis/tasks/07-18-dva-codex-theme-design/`.
- Do not change K1-1 `Diagnostic`, existing `ValidationReport`, ScoreDocument/codec/semantic/profile meaning or code strings.
- Do not change K1-2 command/history, K1-3 read/checkpoint/event or K1-4 registry/capability result signatures.
- No public error classes, `KernelDiagnostic`, import/export/recovery report aliases, dynamic report/migration registry, global issue event, physical IO, session replacement, clock, randomness, UUID, path or URL.
- Every public K1-5 runtime function is total: malformed runtime input and unexpected exceptions become closed, privacy-safe issue/result data.
- Use descriptor-first decoding. Never read untrusted fields through property access, iteration, coercion hooks or array methods before proving data descriptors and dense arrays.
- Use TDD: write a compiling behavioral RED test, confirm the expected assertion failure, implement the minimum behavior, rerun the focused test, run affected regressions, then commit.
- Compiler/import failures are setup errors, not accepted RED evidence.

---

## Stage 0 — Execution Gate

### Task 0: Verify the approved starting state

**Files:**

- Read: `.trellis/tasks/07-19-k1-5-errors-diagnostics-reports-migration/prd.md`
- Read: `.trellis/tasks/07-19-k1-5-errors-diagnostics-reports-migration/design.md`
- Read: `.trellis/spec/core-kernel/backend/index.md`
- Read: `.trellis/spec/core-kernel/backend/errors-reports.md`
- Read: `.trellis/spec/core-kernel/backend/quality-guidelines.md`

**Interfaces:**

- Consumes the user-approved planning commit and accepted K1-4 baseline.
- Produces no file changes; it is a hard stop if branch/task/worktree state is wrong.

- [ ] **Step 1: Load Trellis development context**

Run:

```powershell
python .\.trellis\scripts\get_context.py --mode phase
python .\.trellis\scripts\get_context.py --mode packages
```

Expected: active task is `k1-5-errors-diagnostics-reports-migration`, phase permits development, and Core Kernel backend specs are selected.

- [ ] **Step 2: Verify branch and preserve unrelated work**

Run:

```powershell
git branch --show-current
git status --short
git merge-base --is-ancestor 94766a0930c05e5339c44f667deaf02116af1c0c HEAD
```

Expected: branch is `codex/k1-5-errors-diagnostics-reports-migration`; the merge-base command exits 0; only explicitly approved K1-5 files may be modified. If unrelated paths are present, preserve them and keep them out of all stage commands.

- [ ] **Step 3: Establish the fresh regression baseline**

Run:

```powershell
npm run typecheck
npm test
git diff --check
```

Expected: all commands pass before the first K1-5 RED test. Record the exact test count in the execution journal; do not copy an older count from planning docs.

---

## Stage 1 — Error Classes, Issue Contracts and Adapters

### Task 1: Add closed issue contracts and the internal OO hierarchy

**Files:**

- Create: `src/core-kernel/reports/contracts.ts`
- Create: `src/core-kernel/errors/classification.ts`
- Create: `src/core-kernel/errors/kernel-error.ts`
- Create: `test/core-kernel/kernel-issues.test.ts`

**Interfaces:**

- Consumes existing `DiagnosticCode`, `CommandFailure`, `CheckpointFailure`, `ReadFailure`, `EventSubscriptionResult`, `KernelRegistryStartupFailure`, `KernelRegistryAccessFailure`, `DiagnosticPath`, `ScoreAddress`, `ScoreRange`, and `JsonObject`.
- Produces public data types `KernelIssueCode`, `KernelSeverity`, `KernelIssueLocation`, `CoreIssueSubsystem`, `KernelIssueSource`, `KernelIssue`, `KernelReportKind`, `KernelReportStatus`, `KernelReportSummary`, `KernelReport`, and `MigrationReport`.
- Produces internal factories `createOperationKernelIssue`, `createMigrationKernelIssue`, `createModuleKernelIssue`, and `createReportKernelIssue`; no class is exported from the Core public root.

- [ ] **Step 1: Write the failing issue/classification tests**

Add tests that assert exact derived facts and deep freeze:

```typescript
import { test } from "node:test";
import assert = require("node:assert/strict");
import {
  createModuleKernelIssue,
  createOperationKernelIssue,
} from "../../src/core-kernel/errors/kernel-error";

test("issue facts derive from closed code and are deeply frozen", () => {
  const warning = createOperationKernelIssue({
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
  assert.equal(Object.isFrozen(warning), true);
  assert.equal(Object.isFrozen(warning.source), true);
});
```

Add a privacy assertion proving the internal factory input type and returned issue have no `message`, `stack`, or `cause` keys.

- [ ] **Step 2: Confirm the behavioral RED**

Temporarily add minimal compiling module stubs that throw `new Error("not implemented")`, then run:

```powershell
npm run build
node --test dist/test/core-kernel/kernel-issues.test.js
```

Expected: build passes and the test fails on the first issue assertion because the factory stub throws. Remove the throw in the GREEN step.

- [ ] **Step 3: Define exact public contracts**

Implement the contracts from `design.md`, including these K1-5-native codes:

```typescript
export type ReportFailureCode =
  | "report.invalid-input"
  | "report.internal-error";

export type ModuleFailureCode = "module.internal-error";

export type MigrationFailureCode =
  | "migration.invalid-input"
  | "migration.unsupported-source-version"
  | "migration.semantic-invalid"
  | "migration.internal-error";
```

Compose `KernelIssueCode` from existing union index access plus these native unions. Define only `warning | error | fatal`; define `KernelReportKind` as only `validation | migration`.

- [ ] **Step 4: Implement code-derived classification**

Use closed input typing and deterministic rules:

```typescript
export type SeverityForCode<Code extends KernelIssueCode> =
  Code extends `unsupported.${string}`
    ? "warning"
    : Code extends
          | `${string}.internal-error`
          | `${string}.invariant-violation`
      ? "fatal"
      : "error";

export function severityForKernelIssueCode<Code extends KernelIssueCode>(
  code: Code,
): SeverityForCode<Code> {
  if (code.startsWith("unsupported.")) {
    return "warning" as SeverityForCode<Code>;
  }
  if (
    code.endsWith(".internal-error") ||
    code.endsWith(".invariant-violation")
  ) {
    return "fatal" as SeverityForCode<Code>;
  }
  return "error" as SeverityForCode<Code>;
}

export function messageKeyForKernelIssueCode<Code extends KernelIssueCode>(
  code: Code,
): `core.${Code}` {
  return `core.${code}`;
}
```

The casts are confined to this closed classifier; callers cannot pass arbitrary strings.

- [ ] **Step 5: Implement the sealed internal class hierarchy**

Keep the base and derived classes unexported. Export only factory functions used by neighboring K1-5 modules. The base constructor accepts safe normalized fields, never an Error/cause/raw message. `toIssue()` clones safe nested values and calls `deepFreezeValue` before returning.

Use exactly four families:

```typescript
class OperationKernelError extends KernelError<OperationIssueCode> {}
class MigrationKernelError extends KernelError<MigrationFailureCode> {}
class ModuleKernelError extends KernelError<"module.internal-error"> {}
class ReportKernelError extends KernelError<ReportFailureCode> {}
```

`createModuleKernelIssue` always constructs `module.internal-error`; no caller-supplied module error code exists.

- [ ] **Step 6: Verify Task 1 GREEN and regressions**

Run:

```powershell
npm run build
node --test dist/test/core-kernel/kernel-issues.test.js
node --test dist/test/core-kernel/score-semantics.test.js dist/test/core-kernel/registry-contracts.test.js
npm run typecheck
```

Expected: all pass; public root exports have not changed yet.

- [ ] **Step 7: Commit Task 1**

```powershell
git add src/core-kernel/reports/contracts.ts src/core-kernel/errors/classification.ts src/core-kernel/errors/kernel-error.ts test/core-kernel/kernel-issues.test.ts
git commit -m "feat(core): add k1-5 issue foundation"
```

### Task 2: Add descriptor-first diagnostic and module-source adapters

**Files:**

- Create: `src/core-kernel/reports/strict-codec.ts`
- Create: `src/core-kernel/reports/adapters.ts`
- Modify: `test/core-kernel/kernel-issues.test.ts`

**Interfaces:**

- Consumes Task 1 factories/contracts and K1-4 `readExactDataRecord`, `readDenseArray`, `isSafeRegistryId` as internal pure helpers.
- Produces `mapDiagnosticToKernelIssue(diagnostic: Diagnostic): KernelIssue` and `createModuleInternalIssue(source): KernelIssue<"module.internal-error">`.
- Malformed runtime values produce `report.invalid-input`; unexpected adapter exceptions produce `report.internal-error`.

- [ ] **Step 1: Add RED tests for diagnostic preservation and hostile inputs**

Cover one semantic diagnostic with nested details, one unsupported diagnostic, an extra-field record, accessor properties, a root Proxy with a throwing `get` trap, cyclic details, a sparse array inside details, and post-call mutation.

Use this decisive Proxy assertion:

```typescript
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
```

For accessor/extra/cyclic invalid records, assert `report.invalid-input`; for an injected internal factory failure, assert `report.internal-error` without the private error text.

- [ ] **Step 2: Confirm behavioral RED**

Add compiling adapter stubs returning a deliberately wrong `report.internal-error` for every input, then run:

```powershell
npm run build
node --test dist/test/core-kernel/kernel-issues.test.js
```

Expected: FAIL on exact diagnostic code/path/details preservation.

- [ ] **Step 3: Implement descriptor-first decoding**

Use `Reflect.ownKeys` plus own data descriptors before any field read. Arrays must pass descriptor `length`, own-key cardinality and per-index data-descriptor checks before traversal. Do not call input array methods, iterators, getters, coercion or `JSON.stringify`.

For nested JsonValue detachment, maintain an active-object set to reject cycles. Build a new plain object/array from descriptor values, then freeze only the detached output. Diagnostic records accept exactly `code`, `messageKey`, `path`, and optional `details`; verify `messageKey === core.${code}`.

- [ ] **Step 4: Implement total diagnostic/module mapping**

Map diagnostic source by prefix:

```typescript
function sourceForDiagnosticCode(code: DiagnosticCode): KernelIssueSource {
  if (code.startsWith("decode.")) {
    return { kind: "core", subsystem: "codec" };
  }
  if (code.startsWith("semantic.")) {
    return { kind: "core", subsystem: "validation" };
  }
  return { kind: "core", subsystem: "profile" };
}
```

Always emit `location: { kind: "diagnostic-path", path }`, including an empty path. Module source accepts exact keys `kind/moduleId` or `kind/moduleId/contributionId`; validate IDs with the accepted K1-4 identifier rule and never perform capability checks.

- [ ] **Step 5: Verify Task 2 GREEN and strict-codec regressions**

Run:

```powershell
npm run build
node --test dist/test/core-kernel/kernel-issues.test.js
node --test dist/test/core-kernel/command-internals.test.js dist/test/core-kernel/registry-contracts.test.js
npm run typecheck
```

Expected: all pass; Proxy `getCalls` remains zero.

- [ ] **Step 6: Commit Task 2**

```powershell
git add src/core-kernel/reports/strict-codec.ts src/core-kernel/reports/adapters.ts test/core-kernel/kernel-issues.test.ts
git commit -m "feat(core): add safe issue adapters"
```

### Task 3: Map all accepted subsystem failures without rewriting their APIs

**Files:**

- Modify: `src/core-kernel/reports/strict-codec.ts`
- Modify: `src/core-kernel/reports/adapters.ts`
- Create: `test/core-kernel/kernel-failure-adapters.test.ts`

**Interfaces:**

- Consumes all K1-2/K1-3/K1-4 failure unions exactly as currently exported.
- Produces the six subsystem mapping functions listed in `design.md`; the event failure input type is derived from the rejected branch of `EventSubscriptionResult` rather than changing K1-3 contracts.
- Every function returns a detached frozen issue array; nested diagnostic failures return operation issue first.

- [ ] **Step 1: Write table-driven RED tests for every failure code**

Create explicit fixtures for every member of:

```typescript
type ExistingFailure =
  | CommandFailure
  | CheckpointFailure
  | ReadFailure
  | Extract<EventSubscriptionResult, { status: "rejected" }>["failure"]
  | KernelRegistryStartupFailure
  | KernelRegistryAccessFailure;
```

For field-carrying registry failures, assert the exact allowlist details. For `command.semantic-invalid`, assert `["command.semantic-invalid", ...diagnosticCodes]` and exact diagnostic locations. Add extra-field/getter/Proxy probes for each record family and assert total `report.invalid-input` output.

- [ ] **Step 2: Confirm behavioral RED**

Add compiling function stubs that return `[createReportInvalidInputIssue()]`, then run:

```powershell
npm run build
node --test dist/test/core-kernel/kernel-failure-adapters.test.js
```

Expected: FAIL on the first expected subsystem code.

- [ ] **Step 3: Implement exact per-code decoders and allowlists**

Use exhaustive switches after safe decoding. Allow only fields present in existing contracts:

- Registry startup/access: `moduleId`, `registrationEntryId`, `contributionId`, `capability` as declared by the exact code.
- Command semantic invalid: `diagnostics` only.
- All remaining current command/history/checkpoint/read/event failures: code only.

Do not copy failure objects with spread. Use fixed Core source mapping: command/history -> command, checkpoint -> session, read -> read, event -> event, registry -> registry.

- [ ] **Step 4: Preserve nested diagnostics and freeze results**

For semantic-invalid:

```typescript
return deepFreezeValue([
  createOperationKernelIssue({
    code: "command.semantic-invalid",
    source: { kind: "core", subsystem: "command" },
  }),
  ...diagnostics.map(mapDiagnosticToKernelIssue),
]);
```

If any nested diagnostic fails runtime decoding, return exactly one `report.invalid-input` issue rather than a partially mapped array.

- [ ] **Step 5: Verify Task 3 GREEN and all affected regressions**

Run:

```powershell
npm run build
node --test dist/test/core-kernel/kernel-failure-adapters.test.js
node --test dist/test/core-kernel/command-system.test.js dist/test/core-kernel/dirty-checkpoint.test.js dist/test/core-kernel/event-system.test.js dist/test/core-kernel/registry-gateway.test.js
npm run typecheck
```

Expected: all pass; existing result assertions remain unchanged.

- [ ] **Step 6: Commit Task 3**

```powershell
git add src/core-kernel/reports/strict-codec.ts src/core-kernel/reports/adapters.ts test/core-kernel/kernel-failure-adapters.test.ts
git commit -m "feat(core): map accepted kernel failures"
```

**Stage 1 rollback point:** revert Task 3, Task 2, then Task 1 commits. K1-1 through K1-4 source and public root remain functional because no existing runtime was rewritten.

---

## Stage 2 — Reports and Validation Projection

### Task 4: Build invariant-preserving reports and validation projection

**Files:**

- Create: `src/core-kernel/reports/build-report.ts`
- Create: `src/core-kernel/reports/validation-report.ts`
- Create: `test/core-kernel/kernel-reports.test.ts`

**Interfaces:**

- Consumes normalized `KernelIssue[]` and `mapDiagnosticToKernelIssue`.
- Produces internal `buildKernelReport(kind, issues)` and public `createKernelValidationReport(diagnostics)`.
- `createKernelValidationReport` returns `KernelReport<"validation">` for every runtime input; malformed/internal cases are rejected reports with one report failure issue.

- [ ] **Step 1: Write RED tests for all derived report states**

Cover exact outputs for empty, unsupported-only, semantic error and report-internal fatal inputs:

```typescript
test("validation report derives status and counts", () => {
  const report = createKernelValidationReport([
    createDiagnostic("unsupported.chord", []),
  ]);

  assert.equal(report.kind, "validation");
  assert.equal(report.status, "completed-with-warnings");
  assert.deepEqual(report.summary, {
    issueCount: 1,
    warningCount: 1,
    errorCount: 0,
    fatalCount: 0,
  });
  assert.equal(Object.isFrozen(report), true);
  assert.equal(Object.isFrozen(report.summary), true);
  assert.equal(Object.isFrozen(report.issues), true);
});
```

Also assert repeated calls are deeply equal, source diagnostics can be mutated after the call without changing the report, and malformed sparse/Proxy input returns a rejected `report.invalid-input` report without executing a `get` trap.

- [ ] **Step 2: Confirm behavioral RED**

Add compiling stubs returning an empty completed report for every input, then run:

```powershell
npm run build
node --test dist/test/core-kernel/kernel-reports.test.js
```

Expected: FAIL on warning status/counts.

- [ ] **Step 3: Implement the private report builder**

Clone/freeze issues first, then derive counts in one pass. Derive status exactly:

```typescript
const status =
  fatalCount > 0 || errorCount > 0
    ? "rejected"
    : warningCount > 0
      ? "completed-with-warnings"
      : "completed";
```

Before incrementing any counter, assert it is below `Number.MAX_SAFE_INTEGER`; an impossible internal overflow is caught by the public caller and becomes `report.internal-error`. Do not accept status or summary as parameters.

- [ ] **Step 4: Implement total validation projection**

Descriptor-decode the runtime diagnostics array. On invalid input, build a validation report from one `report.invalid-input` issue. Wrap all other work in a total boundary; catch returns one `report.internal-error` issue. Preserve valid diagnostics in input order.

- [ ] **Step 5: Prove the original K1-1 ValidationReport is unchanged**

Run:

```powershell
npm run build
node --test dist/test/core-kernel/kernel-reports.test.js
node --test dist/test/core-kernel/score-semantics.test.js dist/test/core-kernel/score-feature-profile.test.js dist/test/core-kernel/score-document-codec.test.js
npm run typecheck
```

Expected: all pass with no changes to K1-1 assertions or exported `ValidationReport` shape.

- [ ] **Step 6: Commit Task 4**

```powershell
git add src/core-kernel/reports/build-report.ts src/core-kernel/reports/validation-report.ts test/core-kernel/kernel-reports.test.ts
git commit -m "feat(core): add deterministic kernel reports"
```

**Stage 2 rollback point:** revert Task 4 only; Stage 1 issue/adapters remain independently usable.

---

## Stage 3 — Current-Schema Migration Compatibility Boundary

### Task 5: Add migration contracts and the empty sealed step catalog

**Files:**

- Create: `src/core-kernel/migration/contracts.ts`
- Create: `src/core-kernel/migration/steps.ts`
- Create: `test/core-kernel/migration.test.ts`

**Interfaces:**

- Consumes `ScoreDocument`, `DecodeDiagnostic`, `SemanticDiagnostic`, and `MigrationReport`.
- Produces public `MigrationFailure`, `MigrationResult` and internal frozen `CORE_MIGRATION_STEPS` with no production entries.
- Does not produce `MigrationContribution`, register/unregister functions or a `migrated` result branch.

- [ ] **Step 1: Write the RED contract/boundary test**

Assert the production step table is deeply frozen and empty, and use compile-time assignments proving only `not-required | rejected` statuses exist. Read the public index text and assert it does not contain `MigrationContribution`, `registerMigration`, `unregisterMigration` or `CORE_MIGRATION_STEPS`.

- [ ] **Step 2: Confirm behavioral RED**

Add compiling contract stubs with a deliberately non-empty step table, then run:

```powershell
npm run build
node --test dist/test/core-kernel/migration.test.js
```

Expected: FAIL because the production table is not empty.

- [ ] **Step 3: Implement exact migration result contracts**

Use the union from `design.md` verbatim. `not-required` contains document/report; `rejected` contains failure/report and no document. Failure diagnostic arrays are readonly and become deeply frozen in runtime results.

- [ ] **Step 4: Implement the private empty catalog**

```typescript
interface CoreMigrationStep {
  readonly stepId: string;
  readonly sourceVersion: string;
  readonly targetVersion: string;
  readonly migrate: (input: unknown) => unknown;
}

export const CORE_MIGRATION_STEPS: readonly CoreMigrationStep[] =
  Object.freeze([]);
```

Keep this module out of `src/core-kernel/index.ts`. No test fixture may invent `brilliant-score-0`.

- [ ] **Step 5: Verify Task 5 GREEN**

Run:

```powershell
npm run build
node --test dist/test/core-kernel/migration.test.js
npm run typecheck
```

Expected: all pass.

- [ ] **Step 6: Commit Task 5**

```powershell
git add src/core-kernel/migration/contracts.ts src/core-kernel/migration/steps.ts test/core-kernel/migration.test.ts
git commit -m "feat(core): define migration compatibility contracts"
```

### Task 6: Implement the detached current-schema migration entry

**Files:**

- Create: `src/core-kernel/migration/migrate-score-document.ts`
- Modify: `test/core-kernel/migration.test.ts`

**Interfaces:**

- Consumes K1-1 `decodeScoreDocument`, `validateScoreDocumentSemantics`, report/diagnostic adapters and internal report builder.
- Produces public `migrateScoreDocument(input: unknown): MigrationResult`.
- Does not consume or mutate CommandBus/session state.

- [ ] **Step 1: Write RED tests for all producible paths**

Add behavior tests for:

- valid current fixture -> `not-required`, completed empty migration report, deeply equal candidate;
- future schema -> `migration.unsupported-source-version`, rejected report and preserved `decode.unsupported-schema-version` issue;
- malformed current shape -> `migration.invalid-input` plus all concrete decode issues;
- semantic-invalid current document -> `migration.semantic-invalid` plus concrete semantic issues;
- synthetic internal dependency throw -> `migration.internal-error` with no raw detail;
- input/output mutation isolation;
- deep unknown ExtensionBlock preservation;
- repeated execution deep equality;
- no time/id fields anywhere in result/report.

Use an existing valid fixture and change only the field required by each case; do not add a fictional schema version fixture.

- [ ] **Step 2: Confirm behavioral RED**

Add a compiling `migrateScoreDocument` stub that always returns `migration.internal-error`, then run:

```powershell
npm run build
node --test dist/test/core-kernel/migration.test.js
```

Expected: FAIL on valid current fixture status.

- [ ] **Step 3: Implement the decode/classification pipeline**

Call `decodeScoreDocument(input)` exactly once. If decode fails, classify `decode.unsupported-schema-version` as the outer unsupported-source failure; otherwise use invalid-input. Build report issues as outer migration issue followed by mapped decoder diagnostics in their existing order.

Do not probe `input.schemaVersion` separately; this avoids double-reading accessor/Proxy-backed input.

- [ ] **Step 4: Implement semantic validation and detached success**

On decode success, run `validateScoreDocumentSemantics`. On invalid semantics, return no candidate and preserve all diagnostics after the outer migration issue. On success:

```typescript
const document = deepFreezeValue(structuredClone(decoded.value));
return deepFreezeValue({
  status: "not-required",
  document,
  report: buildKernelReport("migration", []),
});
```

Do not call ScoreFeatureProfile; semantic-valid-but-product-unsupported data remains a valid schema candidate.

- [ ] **Step 5: Add the total exception boundary**

Wrap the public pipeline. Catch returns rejected `migration.internal-error` and a single fatal migration issue. Never attach the caught value, message, stack or cause.

- [ ] **Step 6: Prove session isolation**

Create a CommandBus from a fixture, record snapshot/history/dirty/event facts, call migration on a separate clone, then assert the bus facts remain deeply equal. The migration API must not accept a bus or expose a replace method.

- [ ] **Step 7: Verify Task 6 GREEN and K1-1/K1-3 regressions**

Run:

```powershell
npm run build
node --test dist/test/core-kernel/migration.test.js
node --test dist/test/core-kernel/score-document-codec.test.js dist/test/core-kernel/score-semantics.test.js dist/test/core-kernel/unknown-extension-roundtrip.test.js dist/test/core-kernel/read-system.test.js
npm run typecheck
```

Expected: all pass.

- [ ] **Step 8: Commit Task 6**

```powershell
git add src/core-kernel/migration/migrate-score-document.ts test/core-kernel/migration.test.ts
git commit -m "feat(core): add current schema migration boundary"
```

**Stage 3 rollback point:** revert Task 6 then Task 5; Stage 1/2 issue/report APIs remain intact and no persisted data requires reversal.

---

## Stage 4 — Public Boundary, Documentation and Gate

### Task 7: Export only the approved K1-5 data API

**Files:**

- Modify: `src/core-kernel/index.ts`
- Modify: `test/core-kernel/public-api-boundary.test.ts`
- Modify: `test/core-kernel/forbidden-dependency-boundary.test.ts`

**Interfaces:**

- Produces root exports for approved report contracts, mapping functions, module issue factory, validation report adapter, migration contracts and migration entry.
- Keeps error classes, strict codec, report builder and migration steps private.

- [ ] **Step 1: Write the public-boundary RED test**

Add expected runtime keys for:

```typescript
[
  "createKernelValidationReport",
  "createModuleInternalIssue",
  "mapCheckpointFailureToKernelIssues",
  "mapCommandFailureToKernelIssues",
  "mapDiagnosticToKernelIssue",
  "mapEventSubscriptionFailureToKernelIssues",
  "mapReadFailureToKernelIssues",
  "mapRegistryAccessFailureToKernelIssues",
  "mapRegistryStartupFailureToKernelIssues",
  "migrateScoreDocument",
]
```

Keep runtime-negative assertions for `KernelError` and `KernelReport` class/value exports because approved contracts are type-only. Add compile-time type imports for the approved `KernelIssue`, `KernelReport`, `MigrationReport` and `MigrationResult`. Keep/add forbidden checks for `KernelDiagnostic`, `ImportReport`, `ExportReport`, `RecoveryReport`, `MigrationContribution`, `CORE_MIGRATION_STEPS`, internal factories/builders/codecs and physical IO.

- [ ] **Step 2: Confirm behavioral RED**

Run:

```powershell
npm run build
node --test dist/test/core-kernel/public-api-boundary.test.js
```

Expected: FAIL because the approved runtime functions are not root exports.

- [ ] **Step 3: Add explicit root exports**

Use explicit exports for runtime functions and `export type` for data contracts. Do not use wildcard exports from `errors/`, `reports/build-report`, `reports/strict-codec`, or `migration/steps`.

- [ ] **Step 4: Verify public and forbidden boundaries**

Run:

```powershell
npm run build
node --test dist/test/core-kernel/public-api-boundary.test.js dist/test/core-kernel/forbidden-dependency-boundary.test.js
npm run typecheck
```

Expected: all pass and no forbidden capabilities enter the dependency graph.

- [ ] **Step 5: Commit Task 7**

```powershell
git add src/core-kernel/index.ts test/core-kernel/public-api-boundary.test.ts test/core-kernel/forbidden-dependency-boundary.test.ts
git commit -m "feat(core): expose k1-5 report and migration api"
```

### Task 8: Synchronize active specifications without claiming acceptance

**Files:**

- Modify: `.trellis/spec/core-kernel/backend/errors-reports.md`
- Modify: `.trellis/spec/core-kernel/backend/index.md`
- Modify: `.trellis/spec/core-kernel/backend/quality-guidelines.md`
- Modify: `.trellis/tasks/07-07-pure-core-kernel-v1/prd.md`
- Modify: `.trellis/tasks/07-07-pure-core-kernel-v1/design.md`
- Modify: `.trellis/tasks/07-07-pure-core-kernel-v1/implement.md`
- Modify: `.trellis/tasks/06-29-commercial-guitar-tablature-product/requirements/REQ-019-kernel-errors-diagnostics-reports.md`
- Modify: `.trellis/tasks/06-29-commercial-guitar-tablature-product/specs/SPEC-016-kernel-errors-diagnostics-reports.md`
- Modify only directly conflicting K1-5 status lines in `.trellis/tasks/06-29-commercial-guitar-tablature-product/prd.md`.
- Modify only directly conflicting K1-5 status lines in `.trellis/tasks/06-29-commercial-guitar-tablature-product/design.md`.
- Modify only directly conflicting K1-5 status lines in `.trellis/tasks/06-29-commercial-guitar-tablature-product/implement.md`.

**Interfaces:**

- Consumes actual implemented APIs and fresh test evidence.
- Produces one consistent active contract marked implementation candidate / independent acceptance pending.
- Does not edit historical snapshots, retired specs or archived K1-1 through K1-4 task decisions.

- [ ] **Step 1: Replace stale K1-5 blocked/draft claims**

Document the exact approved facts: additive adapters, internal OO hierarchy/public data boundary, no `KernelDiagnostic`, validation/migration report kinds only, no ID/time, current-schema not-required/rejected migration, empty private step table, no global issue bus, no import/export/recovery aliases.

- [ ] **Step 2: Add exact scenarios and failure matrix to the active Core spec**

For each public adapter/report/migration entry, record scope, signature, invariants, good/base/bad cases and required tests. Preserve all K1-1 diagnostic code tables and link K1-2/K1-3/K1-4 failure ownership rather than copying divergent unions.

- [ ] **Step 3: Record candidate evidence without claiming final acceptance**

Use wording equivalent to:

```text
K1-5 implementation candidate complete; independent acceptance pending.
K1-6 remains blocked until K1-5 receives a separate acceptance baseline.
```

Insert the actual implementation HEAD and fresh test count only after Task 9 verification. Do not reuse `94766a0` or 125/125 as K1-5 evidence.

- [ ] **Step 4: Check active Markdown convergence**

Run focused searches for contradictory status and retired K1-5 vocabulary, then:

```powershell
git diff --check
```

Expected: no active document calls K1-5 blocked/not started, no active contract requires reportId/createdAt or public import/export/recovery reports, and diff check passes.

- [ ] **Step 5: Commit Task 8**

Stage only the listed active documents and commit:

```powershell
git add .trellis/spec/core-kernel/backend/errors-reports.md .trellis/spec/core-kernel/backend/index.md .trellis/spec/core-kernel/backend/quality-guidelines.md .trellis/tasks/07-07-pure-core-kernel-v1/prd.md .trellis/tasks/07-07-pure-core-kernel-v1/design.md .trellis/tasks/07-07-pure-core-kernel-v1/implement.md .trellis/tasks/06-29-commercial-guitar-tablature-product/prd.md .trellis/tasks/06-29-commercial-guitar-tablature-product/design.md .trellis/tasks/06-29-commercial-guitar-tablature-product/implement.md .trellis/tasks/06-29-commercial-guitar-tablature-product/requirements/REQ-019-kernel-errors-diagnostics-reports.md .trellis/tasks/06-29-commercial-guitar-tablature-product/specs/SPEC-016-kernel-errors-diagnostics-reports.md
git commit -m "docs(core): synchronize k1-5 candidate contracts"
```

### Task 9: Run the complete K1-5 candidate gate

**Files:**

- Modify only files required to fix a gate failure within approved K1-5 scope.
- Update candidate evidence lines from Task 8 with the final implementation HEAD/test count after all fixes are committed.

**Interfaces:**

- Produces the implementation candidate and evidence package for an independent reviewer.
- Does not archive the task, mark K1-5 accepted or unlock K1-6.

- [ ] **Step 1: Run all static and build gates**

```powershell
npm run typecheck
npm run build
git diff --check
```

Expected: all exit 0.

- [ ] **Step 2: Run focused K1-5 tests**

```powershell
node --test dist/test/core-kernel/kernel-issues.test.js dist/test/core-kernel/kernel-failure-adapters.test.js dist/test/core-kernel/kernel-reports.test.js dist/test/core-kernel/migration.test.js dist/test/core-kernel/public-api-boundary.test.js dist/test/core-kernel/forbidden-dependency-boundary.test.js
```

Expected: all focused tests pass with zero failures.

- [ ] **Step 3: Run the full regression suite**

```powershell
npm test
```

Expected: all K1-1 through K1-5 tests pass. Record the fresh total from this run.

- [ ] **Step 4: Validate Trellis artifacts and repository state**

Run:

```powershell
python .\.trellis\scripts\task.py validate .trellis\tasks\07-19-k1-5-errors-diagnostics-reports-migration
```

Expected: task validation passes. Then run:

```powershell
git status --short
git log --oneline --decorate -12
```

Expected: task validation passes; only approved K1-5 changes are committed; user-owned unrelated untracked paths remain untouched.

- [ ] **Step 5: Update candidate evidence and commit it**

Write the final implementation commit hash and fresh test count into the independent K1-5 task and active status documents with “acceptance pending” wording. Stage only those documents:

```powershell
git commit -m "docs(core): record k1-5 candidate evidence"
```

- [ ] **Step 6: Hand off for independent acceptance**

Report:

- candidate HEAD and commit list;
- exact commands and fresh results;
- test count;
- public API additions;
- frozen exclusions;
- dirty/untracked paths intentionally preserved;
- explicit statement that K1-6 remains blocked.

Do not call `task.py finish`, archive K1-5, update an accepted baseline or begin K1-6 until the independent reviewer returns an acceptance verdict.

**Stage 4 rollback point:** revert candidate-evidence/docs commit, Task 8 docs commit and Task 7 public export commit. Earlier internal K1-5 stages remain testable; reverting all four stages restores the accepted K1-4 public surface without persisted-data migration.
