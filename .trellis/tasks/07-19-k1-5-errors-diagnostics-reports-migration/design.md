# K1-5 Errors Diagnostics Reports Migration — Design

> **Status: IMPLEMENTATION CANDIDATE COMPLETE / INDEPENDENT ACCEPTANCE PENDING.** Candidate implementation baseline: `171790743450b3a3c0fa1720c847302308c27937`; the fresh 2026-07-20 full gate passed 159/159 tests. This is not an accepted baseline and K1-6 remains blocked.

## 1. Context and Authority

K1-5 is additive over these accepted contracts:

- K1-1: `Diagnostic`, decode/semantic/profile code unions, deterministic paths/details, `ValidationReport`, `ScoreDocument`, codec and validators.
- K1-2: `CommandFailure`, `CommandBusCreationFailure`, `CommandResult`, history and replay.
- K1-3: address/range, read/checkpoint/event failures, snapshot/dirty/event isolation.
- K1-4: startup-only Registry/Capability and its startup/access failures, accepted at `94766a0930c05e5339c44f667deaf02116af1c0c`.

The existing subsystem failures remain their owners' public result contracts. K1-5 adds a common observation/reporting projection and an in-memory compatibility entry. It does not replace successful or rejected API shapes.

## 2. Architecture Overview

```text
K1-1 Diagnostic --------------------+
K1-2 Creation/Command/History Failure+
K1-3 Read/Checkpoint/Event Failure -+--> typed allowlist adapters
K1-4 Registry Failure --------------+              |
                                                    v
                                      internal KernelError families
                                                    |
                                                    v
                                         frozen KernelIssue[]
                                                    |
                         +--------------------------+------------------+
                         |                                             |
                         v                                             v
              validation KernelReport                      MigrationReport
                                                                     |
                                                                     v
                                              detached validated candidate
```

The design has two deliberately different boundaries:

- **Behavior boundary:** internal OO classes share construction, classification and conversion behavior.
- **Compatibility boundary:** public APIs return closed, deeply frozen data records. Consumers switch on code/kind/status, never `instanceof`.

## 3. Proposed File Ownership

```text
src/core-kernel/
  errors/
    kernel-error.ts           # internal abstract base and family classes
    classification.ts         # exhaustive code -> severity/messageKey/source rules
  reports/
    contracts.ts              # public KernelIssue/KernelReport data types
    adapters.ts               # public typed subsystem adapters
    build-report.ts           # internal invariant-preserving report builder
    validation-report.ts      # public validation report adapter
  migration/
    contracts.ts              # public MigrationFailure/Result/Report types
    migrate-score-document.ts # public in-memory compatibility entry
    steps.ts                   # private frozen production step table; empty in K1-5
```

Tests remain under `test/core-kernel/` and should use behavior-focused files rather than mirroring every source file mechanically.

## 4. Public Data Contracts

### 4.1 Code and severity

`KernelIssueCode` is a compiler-checked union composed from existing public code unions plus K1-5-native codes. It is not ```${string}``` and does not duplicate existing code strings.

K1-5-native codes are limited to behavior this stage can actually produce:

```typescript
type MigrationFailureCode =
  | "migration.invalid-input"
  | "migration.unsupported-source-version"
  | "migration.semantic-invalid"
  | "migration.internal-error";

type ReportFailureCode =
  | "report.invalid-input"
  | "report.internal-error";

type ModuleFailureCode = "module.internal-error";

type EventSubscriptionFailure = Extract<
  EventSubscriptionResult,
  { readonly status: "rejected" }
>["failure"];

type KernelIssueCode =
  | DiagnosticCode
  | CommandFailure["code"]
  | CommandBusCreationFailure["code"]
  | CheckpointFailure["code"]
  | ReadFailure["code"]
  | EventSubscriptionFailure["code"]
  | KernelRegistryStartupFailure["code"]
  | KernelRegistryAccessFailure["code"]
  | ReportFailureCode
  | ModuleFailureCode
  | MigrationFailureCode;

type KernelSeverity = "warning" | "error" | "fatal";
```

The classification function is exhaustive and internal:

- `unsupported.*` -> `warning`.
- `*.internal-error`, `*.invariant-violation`, and explicit unknown-boundary failures -> `fatal`.
- all remaining rejected/invalid codes -> `error`.

`messageKey` is always ``core.${code}``. Neither severity nor messageKey is accepted as caller input.

### 4.2 Location and source

```typescript
type KernelIssueLocation =
  | { readonly kind: "diagnostic-path"; readonly path: DiagnosticPath }
  | { readonly kind: "score-address"; readonly address: ScoreAddress }
  | { readonly kind: "score-range"; readonly range: ScoreRange };

type CoreIssueSubsystem =
  | "codec"
  | "validation"
  | "profile"
  | "command"
  | "read"
  | "session"
  | "event"
  | "registry"
  | "report"
  | "migration";

type KernelIssueSource =
  | {
      readonly kind: "core";
      readonly subsystem: CoreIssueSubsystem;
    }
  | {
      readonly kind: "module";
      readonly moduleId: string;
      readonly contributionId?: string;
    };
```

Location is optional because not every operation failure points into a score. Source is required and is attribution only; it never grants or checks capability.

There is no file/URL/free-text location or source. Persistence/import/export layers may wrap Core results with their own resource metadata without mutating the Core issue.

### 4.3 KernelIssue

```typescript
interface KernelIssue<Code extends KernelIssueCode = KernelIssueCode> {
  readonly issueVersion: 1;
  readonly code: Code;
  readonly severity: KernelSeverity;
  readonly messageKey: `core.${Code}`;
  readonly source: KernelIssueSource;
  readonly location?: KernelIssueLocation;
  readonly details?: JsonObject;
}
```

Every returned issue and nested value is detached and deeply frozen. There is no raw message, stack, cause, timestamp, identifier or mutable metadata bag.

### 4.4 KernelReport

```typescript
type KernelReportKind = "validation" | "migration";

type KernelReportStatus =
  | "completed"
  | "completed-with-warnings"
  | "rejected";

interface KernelReportSummary {
  readonly issueCount: number;
  readonly warningCount: number;
  readonly errorCount: number;
  readonly fatalCount: number;
}

interface KernelReport<Kind extends KernelReportKind = KernelReportKind> {
  readonly reportVersion: 1;
  readonly kind: Kind;
  readonly status: KernelReportStatus;
  readonly summary: KernelReportSummary;
  readonly issues: readonly KernelIssue[];
}

type MigrationReport = KernelReport<"migration">;
```

The internal builder accepts only already-normalized issues, clones/freezes them and derives summary/status in one pass. No public API accepts caller-provided status or summary.

`ImportReport`, `ExportReport`, `RecoveryReport` and a second type named `ValidationReport` are intentionally absent.

## 5. Internal Object-Oriented Error Model

The OO hierarchy is internal and sealed by module visibility:

```typescript
type OperationIssueCode = Exclude<
  KernelIssueCode,
  MigrationFailureCode | ModuleFailureCode | ReportFailureCode
>;

interface SafeKernelErrorInput<Code extends KernelIssueCode> {
  readonly code: Code;
  readonly source: KernelIssueSource;
  readonly location?: KernelIssueLocation;
  readonly details?: JsonObject;
}

abstract class KernelError<Code extends KernelIssueCode> extends Error {
  readonly code: Code;
  readonly source: KernelIssueSource;
  readonly location?: KernelIssueLocation;
  readonly details?: JsonObject;

  protected constructor(input: SafeKernelErrorInput<Code>);

  toIssue(): KernelIssue<Code>;
}

class OperationKernelError extends KernelError<OperationIssueCode> {}
class MigrationKernelError extends KernelError<MigrationFailureCode> {}
class ModuleKernelError extends KernelError<ModuleFailureCode> {}
class ReportKernelError extends KernelError<ReportFailureCode> {}
```

TypeScript has no `final` keyword; sealing is achieved by keeping classes private to internal modules, not exporting constructors, and exposing only non-overridable module functions that call the base conversion path.

Important invariants:

- The constructor never accepts an `Error`, `cause`, raw message, stack or arbitrary details object.
- `super(code)` may initialize the internal Error, but no Error field crosses `toIssue()`; internal derived classes do not override this method.
- Severity and messageKey are calculated from code, not stored as independently supplied values.
- Family classes reflect different construction responsibilities; there is no class-per-code hierarchy.
- Returned data is cloned/frozen. Class identity is never part of equality, serialization or API compatibility.

## 6. Failure Adapters

Adapters are additive, side-effect-free and subsystem-specific. Proposed public functions:

```typescript
mapDiagnosticToKernelIssue(diagnostic: Diagnostic): KernelIssue;
mapCommandFailureToKernelIssues(failure: CommandFailure): readonly KernelIssue[];
mapCommandBusCreationFailureToKernelIssues(
  failure: CommandBusCreationFailure,
): readonly KernelIssue[];
mapCheckpointFailureToKernelIssues(failure: CheckpointFailure): readonly KernelIssue[];
mapReadFailureToKernelIssues(failure: ReadFailure): readonly KernelIssue[];
mapEventSubscriptionFailureToKernelIssues(
  failure: EventSubscriptionFailure,
): readonly KernelIssue[];
mapRegistryStartupFailureToKernelIssues(
  failure: KernelRegistryStartupFailure,
): readonly KernelIssue[];
mapRegistryAccessFailureToKernelIssues(
  failure: KernelRegistryAccessFailure,
): readonly KernelIssue[];
createModuleInternalIssue(
  source: Extract<KernelIssueSource, { readonly kind: "module" }>,
): KernelIssue<"module.internal-error">;
```

The exact function list must be confirmed against exported source types during implementation; equivalent names are acceptable only if the final public export test and active spec use one canonical vocabulary.

Adapter rules:

- Switch exhaustively on the closed code union; `assertNever` is internal only.
- Construct details from a per-code allowlist. Do not spread the failure object.
- Map code prefix/owner to a fixed Core subsystem source.
- Preserve existing diagnostic path/details through an isolated clone.
- `command.semantic-invalid` returns the operation issue first, then one issue per diagnostic in original order.
- `command.invalid-initial-document` accepts the exact runtime shapes `{ code }` and `{ code, diagnostics }`; the diagnostic form returns the outer creation issue first, then every semantic diagnostic in original order. Actual `CommandBus.create()` and replay failures use this adapter.
- Every diagnostic and failure code table is compiler-exhaustive (`Record<UnionCode, true>` or an equivalent `never` proof); a typed array that only proves its listed members are valid is not sufficient.
- Results are detached, deeply frozen arrays.
- Public signatures remain strongly typed, but runtime implementations validate descriptor values without invoking accessors or Proxy `get` traps.
- Malformed runtime values return one `report.invalid-input` error issue with Core `report` source.
- An unexpected internal adapter exception returns one `report.internal-error` fatal issue; raw exceptions never become issue data.

Existing result APIs are not rewritten to call these adapters automatically. Consumers opt in when they need a common observation form.

## 7. Validation Report Adapter

The existing K1-1 `ValidationReport { ok, diagnostics }` remains unchanged. K1-5 adds a differently named adapter:

```typescript
createKernelValidationReport(
  diagnostics: readonly Diagnostic[],
): KernelReport<"validation">;
```

It maps diagnostics in input order, then invokes the invariant-preserving internal report builder. Decode/semantic diagnostics yield rejected reports; unsupported diagnostics yield completed-with-warnings; an empty list yields completed.

The adapter is intended for diagnostics already produced by Core, while remaining total for JavaScript runtime misuse. It validates the runtime array and diagnostic records descriptor-first. Invalid input produces a rejected validation report containing `report.invalid-input`; an unexpected internal exception produces a rejected report containing `report.internal-error`. It never silently returns a misleading completed report.

## 8. Migration Compatibility Boundary

### 8.1 Result contract

```typescript
type MigrationFailure =
  | {
      readonly code: "migration.invalid-input";
      readonly diagnostics: readonly DecodeDiagnostic[];
    }
  | { readonly code: "migration.unsupported-source-version" }
  | {
      readonly code: "migration.semantic-invalid";
      readonly diagnostics: readonly SemanticDiagnostic[];
    }
  | { readonly code: "migration.internal-error" };

type MigrationResult =
  | {
      readonly status: "not-required";
      readonly document: ScoreDocument;
      readonly report: MigrationReport;
    }
  | {
      readonly status: "rejected";
      readonly failure: MigrationFailure;
      readonly report: MigrationReport;
    };

migrateScoreDocument(input: unknown): MigrationResult;
```

The public result has no `migrated` branch because K1-5 has no real legacy schema or production step capable of producing it.

### 8.2 Pipeline

1. Read only the minimum untrusted structure needed through the same descriptor-first/zero-getter safety standard as accepted strict codecs.
2. Delegate current-version full shape decoding to the K1-1 codec; preserve its concrete diagnostics.
3. Classify non-current schema as unsupported source version without attempting a step.
4. Run K1-1 semantic validation on a detached candidate.
5. On success, deep-clone/freeze the candidate and return `not-required` with an empty completed migration report.
6. On decode/semantic rejection, return no document. Build a report containing the outer migration issue followed by concrete diagnostics in original order.
7. Catch any unexpected exception at the public boundary and return `migration.internal-error` with a fatal rejected report.

The implementation must avoid double-reading accessor-backed version fields. Reuse or extract accepted strict-codec helpers only if doing so does not change K1-1/K1-4 behavior.

### 8.3 Step table

`steps.ts` contains a frozen, private production table and compile-time step interface, but the table is empty. There is no register/unregister API, no `MigrationContribution`, and no connection to K1-4 Registry.

A future schema upgrade must independently approve:

- a real source and target schema;
- legal fixtures and compatibility matrix;
- a concrete step implementation;
- a new public migrated result;
- step ordering/atomicity tests;
- exhaustive consumer and documentation updates.

### 8.4 Session isolation

Migration does not receive a `CommandBus`, session, history or checkpoint. The returned document is only a detached candidate suitable for creating a new session. It cannot replace an active document or emit K1-3 events.

Unknown ExtensionBlock content must be deeply equal after current-version pass-through. Because no production transform exists, K1-5 must not interpret or normalize extension payloads beyond existing codec/semantic contracts.

## 9. Privacy and Untrusted Runtime Safety

Privacy is achieved by non-collection:

- Known failures use per-code allowlists.
- Diagnostic details are preserved only because K1-1 already owns that privacy contract.
- Unknown exceptions contribute no fields.
- No regex scrubber, debug raw-error mode or generic recursive object sanitizer exists.
- No public function reads file paths, URLs, environment variables, source files, tokens or arbitrary module payloads.

Runtime hardening tests must include extra properties, accessor properties, Proxies, sparse arrays, cyclic values, post-call mutation and exception objects carrying fake secrets. A rejected probe must fail quickly without length-proportional work on a proven sparse input.

## 10. Determinism and Immutability

- No clock, randomness, UUID or report ID.
- Stable input traversal and nested diagnostic order.
- No sorting that could reorder subsystem diagnostics.
- All public outputs detached with `structuredClone` only after input safety is established, then recursively frozen.
- Repeated adapters/reports/migrations over deeply equal input produce deeply equal data output.
- Caller mutation after invocation and attempted output mutation cannot change stored/returned facts.

## 11. Public API Boundary

K1-5 may add only:

- approved issue/report data types;
- typed subsystem adapters;
- validation report adapter;
- migration result/failure/report data types;
- the in-memory migration entry.

The public index must not export:

- internal KernelError classes/factories;
- internal report builder or migration step table;
- `KernelDiagnostic`;
- `ImportReport`, `ExportReport`, `RecoveryReport`;
- `MigrationContribution` or dynamic registration;
- mutable issue/report builder;
- global issue bus/event;
- physical IO or session replacement API.

## 12. Test Strategy

### Contracts and OO boundary

- Compile-time closed code coverage and exact messageKey typing, including exhaustive code-table proofs for every diagnostic/failure family.
- Code-derived severity tests for warning/error/fatal families.
- Public export proves internal classes are unavailable.
- Internal tests prove family classes share conversion behavior without leaking Error fields.

### Adapters and privacy

- Every union member from K1-1 through K1-4 maps to exact code/source/details, including `CommandBusCreationFailure`.
- Nested semantic diagnostics preserve order and full safe fields for command semantic rejection and invalid CommandBus initial documents.
- Actual `CommandBus.create()` and replay invalid-initial-document results map to the outer creation issue followed by their semantic diagnostics.
- Extra properties, raw Error properties, getters and Proxies do not escape or execute unexpectedly.
- Outputs are detached and deeply frozen.

### Reports

- Empty, warning-only, error and fatal issue sets derive exact status/counts.
- Caller cannot provide inconsistent summary/status.
- Existing `ValidationReport` tests remain unchanged.
- Repeated report generation is deeply equal.

### Migration

- Valid current schema -> not-required, completed empty report, frozen detached document.
- Future/unknown schema -> rejected unsupported-source-version and no candidate.
- Malformed current input -> invalid-input plus concrete decode issues.
- Semantic-invalid current document -> semantic-invalid plus concrete semantic issues.
- Internal fault probes -> fatal internal-error without raw content.
- Deep unknown ExtensionBlock preservation and input/output mutation isolation.
- No CommandBus/history/dirty/event side effects.

### Gate

- Target tests after each stage.
- `npm run typecheck`.
- `npm run build`.
- `npm test`.
- forbidden dependency and public export checks.
- `git diff --check`.
- Trellis task validation.

## 13. Rollback and Compatibility

The four implementation stages are independently revertible in reverse order:

1. integration/docs/public export changes;
2. migration entry/contracts/tests;
3. report/validation adapter/contracts/tests;
4. error class/issue/adapters/tests.

Rollback must leave K1-1 through K1-4 public contracts and tests intact. No persisted user data is rewritten by K1-5, so rollback requires no file migration.

## 14. Documentation Convergence

After implementation evidence exists, update only active documents:

- `.trellis/spec/core-kernel/backend/errors-reports.md`;
- Core backend index/quality boundary if required;
- Pure Core Kernel parent PRD/design/implement;
- product REQ-019/SPEC-016 and directly conflicting active product status pages.

Do not rewrite historical snapshots, retired specs or archived accepted task decisions. Final docs must record the actual accepted commit and test count only after independent acceptance, not during implementation.
