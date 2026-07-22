# Errors and Reports

> **Accepted stage (2026-07-21):** K1-5 implementation baseline
> `51fa2177cbd25dea53f1ebaf23bd8b8426471589` was independently accepted at documentation baseline
> `ed801a9fa1a69222188c3ca04ee243b48d7a92d2`; its fresh full gate passes 161/161 tests. K1-6 audit-repair candidate `45398df4f0daf2134fcb142d2a74bac9511cf908` passes 8/8 focused and 169/169 full tests; independent acceptance is pending and does not alter this K1-5 contract.

## Current Diagnostic Contract

Each diagnostic contains stable `code`, `messageKey`, structured `(string | number)[]` `path`, and optional privacy-safe JsonValue `details`.

- `decode.*`: syntax, shape, type, version, required/extra field, union decoding.
- `semantic.*`: ids, references, ownership, Fraction, meter, tempo, pitch, time bounds, extension envelope.
- `unsupported.*`: semantic-valid data outside ScoreFeatureProfile.
- `guitar.*`: reserved for the later Guitar Domain; Core K1-1 never emits it.

Ordinary malformed input returns result objects and must not leak untyped exceptions. Identical input produces deterministic diagnostic ordering. K1-2 command/transaction/history failures remain the closed result contract in `command-transaction.md`; K1-5 only adds explicit opt-in adapters and does not rewrite those APIs.

## Scenario: K1-1 Validation Pipeline Diagnostics

### 1. Scope / Trigger

This contract applies whenever K1-1 decodes score data, validates Core semantics, or evaluates a `ScoreFeatureProfile`. Diagnostic identifiers are a closed compatibility surface: adding or renaming one requires a spec update, an explicit TypeScript union member, and a behavioral test.

### 2. Signatures

```typescript
type DiagnosticPath = readonly (string | number)[]

interface Diagnostic {
  readonly code: DiagnosticCode
  readonly messageKey: `core.${DiagnosticCode}`
  readonly path: DiagnosticPath
  readonly details?: JsonObject
}

type ValidationResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly diagnostics: readonly Diagnostic[] }

type ScoreSupportResult =
  | { readonly status: "supported"; readonly diagnostics: readonly [] }
  | {
      readonly status: "unsupported"
      readonly diagnostics: readonly UnsupportedDiagnostic[]
    }
  | {
      readonly status: "invalid"
      readonly diagnostics: readonly SemanticDiagnostic[]
    }
```

### 3. Contracts

- `code` is an English stable identifier from the closed sets below.
- `messageKey` is always exactly `core.${code}`; localized text stays outside Core.
- `path` points into semantic JSON using field names and zero-based array indexes.
- `details` contains finite, privacy-safe JsonValue only and never raw exception text, file paths, score prose, tokens, or source code.
- Validators return diagnostics in deterministic traversal order and never mutate the input.
- ScoreFeatureProfile returns `ScoreSupportResult`, not a generic `ok` boolean: `unsupported` is a supported-state classification for semantic-valid data, while `invalid` forwards semantic failure.

### 4. Validation & Error Matrix

| Layer | Stable K1-1 codes |
|---|---|
| Decode | `decode.encode-failed`, `decode.extra-field`, `decode.json-syntax`, `decode.json-value`, `decode.non-finite-number`, `decode.required-field`, `decode.type`, `decode.union`, `decode.unreadable-input`, `decode.unsupported-schema-version` |
| Semantic structure | `semantic.id-empty`, `semantic.id-duplicate`, `semantic.measure-required`, `semantic.part-required`, `semantic.staff-required`, `semantic.voice-required`, `semantic.notes-required` |
| Semantic references/coverage | `semantic.staff-reference-missing`, `semantic.measure-reference-missing`, `semantic.measure-coverage-missing`, `semantic.measure-coverage-duplicate` |
| Semantic music/time | `semantic.tempo-invalid`, `semantic.meter-numerator-invalid`, `semantic.meter-denominator-invalid`, `semantic.fraction-non-canonical`, `semantic.fraction-sign-invalid`, `semantic.note-value-invalid`, `semantic.time-arithmetic-overflow`, `semantic.measure-duration-invalid`, `semantic.pickup-exceeds-measure`, `semantic.sequence-start-out-of-bounds`, `semantic.sequence-exceeds-measure` |
| Semantic pitch/staff | `semantic.written-pitch-invalid`, `semantic.transposition-invalid`, `semantic.sounding-pitch-invalid`, `semantic.staff-line-count-invalid` |
| Semantic extension | `semantic.extension-namespace-invalid`, `semantic.extension-schema-version-invalid`, `semantic.extension-owner-missing`, `semantic.extension-duplicate`, `semantic.extension-payload-invalid` |
| Feature profile | `unsupported.part-count`, `unsupported.staff-count`, `unsupported.voice-count`, `unsupported.meter`, `unsupported.pickup`, `unsupported.sequence-start`, `unsupported.sequence-duration`, `unsupported.note-value-base`, `unsupported.dots`, `unsupported.time-modification`, `unsupported.chord` |

Decode rejects malformed shape. Semantic validation rejects corrupt cross-field meaning. Feature-profile validation reports only legal data outside current product support; if semantic validation fails, the profile stage returns `status: "invalid"` with semantic diagnostics and no `unsupported.*` noise.

### 5. Good / Base / Bad Cases

- Good: a valid `brilliant-score-1` document returns `status: "supported"` with no profile diagnostics.
- Base: a valid chord returns `status: "unsupported"` with `unsupported.chord`, not a `semantic.*` diagnostic.
- Bad: a semantic-invalid document returns `status: "invalid"` and only `semantic.*` diagnostics.
- Bad: an event carrying `startTick` returns `decode.extra-field` at that exact field path.
- Bad: a JavaScript sparse array supplied through the `unknown` API returns `decode.json-value`; it must not be compacted because `every`/`forEach` skip holes.
- Bad: a Part missing one global measure returns `semantic.measure-coverage-missing`.
- Bad: an unknown future schema returns `decode.unsupported-schema-version` without throwing.

### 6. Tests Required

- Assert malformed JSON, future schema, extra fields, wrong union kinds, sparse arrays, and unreadable getters return stable decode codes and paths.
- Assert repeated validation of identical input returns deeply equal diagnostics.
- Assert global ID, reference, coverage, time-bound, pitch/transposition, and extension-envelope failures use the semantic codes above.
- Assert multi-Part, multi-Staff, multi-Voice, chord, dot, time-modification, pickup, meter, note-base, sequence-start, and sequence-duration fixtures remain semantic-valid and return `status: "unsupported"` with only appropriate `unsupported.*` diagnostics.
- Assert cross-entity duplicate IDs return `status: "invalid"`; assert two-measure Part content order does not change semantic validity.

### 7. Wrong vs Correct

```typescript
// Wrong: open-ended identifiers permit silent spelling drift.
type DiagnosticCode = `semantic.${string}`

// Correct: every compatibility identifier is reviewed and compiler checked.
type SemanticDiagnosticCode =
  | "semantic.id-duplicate"
  | "semantic.measure-coverage-missing"
  // ...the remaining documented K1-1 codes
```

Retired error/report drafts are archived under `.trellis/archive/core-kernel/`.

## K1-5 Public Issue Contract

K1-5 uses internal sealed error families for shared behavior, but its public boundary is data-only:

```typescript
interface KernelIssue<Code extends KernelIssueCode = KernelIssueCode> {
  readonly issueVersion: 1
  readonly code: Code
  readonly severity: "warning" | "error" | "fatal"
  readonly messageKey: `core.${Code}`
  readonly source: KernelIssueSource
  readonly location?: KernelIssueLocation
  readonly details?: JsonObject
}

type KernelIssueLocation =
  | { readonly kind: "diagnostic-path"; readonly path: DiagnosticPath }
  | { readonly kind: "score-address"; readonly address: ScoreAddress }
  | { readonly kind: "score-range"; readonly range: ScoreRange }
```

`KernelIssueCode` is the closed union of K1-1 diagnostic codes, accepted K1-2/K1-3/K1-4 failure codes, and the K1-5-native `report.*`, `module.internal-error`, and `migration.*` codes. K1-2 coverage explicitly includes both `CommandFailure["code"]` and `CommandBusCreationFailure["code"]`. `messageKey` and severity are derived from code: `unsupported.*` is warning, `*.internal-error` and `*.invariant-violation` are fatal, and other current failures are errors.

`source` is either a fixed Core subsystem or a K1-4-safe module/contribution identity. It provides attribution only and never performs capability authorization. Location is a closed diagnostic path/address/range union with no file path, URL, or free-text form. No public issue contains raw `Error.message`, stack, cause, score prose, tokens, secrets, private absolute paths, or plugin source.

## Scenario: Failure Adapters

### Scope and Signatures

```typescript
mapDiagnosticToKernelIssue(diagnostic: Diagnostic): KernelIssue
mapCommandFailureToKernelIssues(failure: CommandFailure): readonly KernelIssue[]
mapCommandBusCreationFailureToKernelIssues(failure: CommandBusCreationFailure): readonly KernelIssue[]
mapCheckpointFailureToKernelIssues(failure: CheckpointFailure): readonly KernelIssue[]
mapReadFailureToKernelIssues(failure: ReadFailure): readonly KernelIssue[]
mapEventSubscriptionFailureToKernelIssues(failure: EventSubscriptionFailure): readonly KernelIssue[]
mapRegistryStartupFailureToKernelIssues(failure: KernelRegistryStartupFailure): readonly KernelIssue[]
mapRegistryAccessFailureToKernelIssues(failure: KernelRegistryAccessFailure): readonly KernelIssue[]
createModuleInternalIssue(source: ModuleIssueSource): KernelIssue
```

The authoritative failure unions stay in `command-transaction.md`, `snapshot-events.md`, and `registry-capability.md`; this guide links those contracts rather than copying them.

### Invariants

- Decode records descriptor-first with exact own enumerable data fields and never invoke accessors or Proxy `get` traps.
- Preserve accepted codes, diagnostic path/details, and deterministic ordering.
- `command.semantic-invalid` emits the operation issue first, followed by every concrete semantic issue.
- `command.invalid-initial-document` accepts only the real exact forms `{ code }` and `{ code, diagnostics }`; the diagnostic form emits the outer creation issue first, followed by every semantic issue in original order. This covers both `CommandBus.create()` and replay creation rejection.
- Every diagnostic/failure code lookup table is compiler-exhaustive via `Record<UnionCode, true>` or an equivalent `Exclude<UnionCode, ListedCode> = never` proof. `satisfies readonly Failure[]` alone is not an exhaustiveness gate.
- Registry details use a per-code allowlist; adapters never spread an input failure object.
- Malformed runtime values return one `report.invalid-input`; unexpected adapter failures return one `report.internal-error`.
- Arrays and all nested output values are detached and deeply frozen.

Good: `unsupported.chord` becomes a warning with Core `profile` source. Base: registry capability denial retains only its approved `moduleId` and `capability`. Bad: extra fields, accessors, cyclic details, sparse arrays, or hostile Proxy metadata return `report.invalid-input` without raw exceptions.

## Scenario: Kernel Validation Report

```typescript
type KernelReportKind = "validation" | "migration"
type KernelReportStatus = "completed" | "completed-with-warnings" | "rejected"

interface KernelReport<Kind extends KernelReportKind = KernelReportKind> {
  readonly reportVersion: 1
  readonly kind: Kind
  readonly status: KernelReportStatus
  readonly summary: {
    readonly issueCount: number
    readonly warningCount: number
    readonly errorCount: number
    readonly fatalCount: number
  }
  readonly issues: readonly KernelIssue[]
}

createKernelValidationReport(
  diagnostics: readonly Diagnostic[],
): KernelReport<"validation">
```

The internal builder clones/freezes issues, derives all counts in one pass, and derives status. Callers cannot supply status or summary. Empty issues are `completed`; warning-only issues are `completed-with-warnings`; any error/fatal is `rejected`. The existing K1-1 `ValidationReport { ok, diagnostics }` stays unchanged.

Good: an empty list yields a completed zero-count report. Base: one `unsupported.chord` yields one warning. Bad: a sparse/hostile diagnostics array yields a rejected report containing only `report.invalid-input`.

Core reports contain no report ID, operation ID, creation time, timestamp, or random identity. The only public report kinds are validation and migration.

## Scenario: Current-Schema Migration Compatibility

```typescript
type MigrationResult =
  | {
      readonly status: "not-required"
      readonly document: ScoreDocument
      readonly report: MigrationReport
    }
  | {
      readonly status: "rejected"
      readonly failure: MigrationFailure
      readonly report: MigrationReport
    }

migrateScoreDocument(input: unknown): MigrationResult
```

K1-5 has no fictional legacy schema and therefore no public `migrated` branch. The private frozen migration step table is empty and has no registration API. The entry calls the accepted K1-1 decoder once, validates current-schema semantics, and returns a detached frozen `not-required` candidate. It never calls `ScoreFeatureProfile`, accepts a `CommandBus`, or changes document version, history, dirty state, or event sequence.

### Migration Failure Matrix

| Input | Result | Report issue order |
|---|---|---|
| valid `brilliant-score-1` | `not-required` | empty completed report |
| future/unknown schema | rejected `migration.unsupported-source-version` | outer migration issue, then decoder issues |
| malformed current shape | rejected `migration.invalid-input` | outer migration issue, then all decoder issues |
| semantic-invalid current document | rejected `migration.semantic-invalid` | outer migration issue, then all semantic issues |
| unexpected internal dependency failure | rejected `migration.internal-error` | one fatal migration issue |

Unknown `ExtensionBlock` JSON remains deeply equal. Repeated execution is deterministic and outputs no generated time/identity fields.

## K1-5 Required Tests and Exclusions

- Exhaust every accepted failure code and assert exact source/details mapping; compile-time code tables must fail when any diagnostic, command, creation, checkpoint, read, event, registry-startup, or registry-access union gains an unlisted member.
- Exercise actual invalid `CommandBus.create()` and replay results and assert `command.invalid-initial-document` precedes all semantic diagnostics.
- Cover getters, Proxies, extra fields, cycles, sparse arrays, and post-call mutation.
- Cover completed/warning/error/fatal report states, exact counts, and deep freeze.
- Cover every migration matrix row, unknown extensions, determinism, and CommandBus isolation.
- Prove the public root omits error classes, report builder, strict codecs, dependency-injection seams, migration steps, and physical IO.
- Run typecheck, build, full tests, forbidden-dependency/public-export tests, Trellis validation, and diff check.

K1-5 intentionally exposes no `KernelDiagnostic`, `ImportReport`, `ExportReport`, `RecoveryReport`, second `ValidationReport`, `MigrationContribution`, global issue/event bus, dynamic migration registration, physical IO, or public error classes.
