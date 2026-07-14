# ARCHIVED Errors and Reports Roadmap

> **ARCHIVED — NOT AN IMPLEMENTATION CONTRACT.** This mixed roadmap was removed
> from the active specification on 2026-07-14.

> **Authoritative K1-1 scope (2026-07-13):** K1-1 implements stable
> diagnostics only. General operation errors and report shells remain K1-5.

## Current Diagnostic Contract

Each diagnostic contains stable `code`, `messageKey`, structured `(string | number)[]` `path`, and optional privacy-safe JsonValue `details`.

- `decode.*`: syntax, shape, type, version, required/extra field, union decoding.
- `semantic.*`: ids, references, ownership, Fraction, meter, tempo, pitch, time bounds, extension envelope.
- `unsupported.*`: semantic-valid data outside ScoreFeatureProfile.
- `guitar.*`: reserved for the later Guitar Domain; Core K1-1 never emits it.

Ordinary malformed input returns result objects and must not leak untyped exceptions. Identical input produces deterministic diagnostic ordering. General `KernelError`, command rollback errors, validation/migration/import/export/recovery reports, and module-exception conversion remain later work.

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
```

### 3. Contracts

- `code` is an English stable identifier from the closed sets below.
- `messageKey` is always exactly `core.${code}`; localized text stays outside Core.
- `path` points into semantic JSON using field names and zero-based array indexes.
- `details` contains finite, privacy-safe JsonValue only and never raw exception text, file paths, score prose, tokens, or source code.
- Validators return diagnostics in deterministic traversal order and never mutate the input.

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

Decode rejects malformed shape. Semantic validation rejects corrupt cross-field meaning. Feature-profile validation reports only legal data outside current product support; if semantic validation fails, the profile stage returns the semantic diagnostics without adding `unsupported.*` noise.

### 5. Good / Base / Bad Cases

- Good: a valid `brilliant-score-1` document returns no diagnostics from semantic and K1 profile validation.
- Base: a valid chord returns `unsupported.chord`, not a `semantic.*` diagnostic.
- Bad: an event carrying `startTick` returns `decode.extra-field` at that exact field path.
- Bad: a JavaScript sparse array supplied through the `unknown` API returns `decode.json-value`; it must not be compacted because `every`/`forEach` skip holes.
- Bad: a Part missing one global measure returns `semantic.measure-coverage-missing`.
- Bad: an unknown future schema returns `decode.unsupported-schema-version` without throwing.

### 6. Tests Required

- Assert malformed JSON, future schema, extra fields, wrong union kinds, sparse arrays, and unreadable getters return stable decode codes and paths.
- Assert repeated validation of identical input returns deeply equal diagnostics.
- Assert global ID, reference, coverage, time-bound, pitch/transposition, and extension-envelope failures use the semantic codes above.
- Assert multi-Part, multi-Staff, chord, dot, time-modification, and pickup fixtures remain semantic-valid and receive only appropriate `unsupported.*` diagnostics.

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

---

## Later V1 Error/Report Roadmap

<details>
<summary>Not a K1-1 implementation requirement</summary>

## Core Rule

All kernel failures must be structured, stable, testable, localizable, and privacy-safe by default.

Do not express kernel failures only as thrown strings, UI text, console logs, or untyped exceptions.

## Error Rules

- `KernelError` must contain stable `code`, `severity`, and `messageKey`.
- `code` is a compatibility and test contract.
- `messageKey` is the only user-visible text pointer.
- Error `details` must be machine-readable and privacy-safe.
- Fatal severity means the current operation cannot safely continue; it does not automatically mean the application must exit.
- `KernelErrorCode` is operation-level. Do not add every score validation rule to the generic error enum.

## Diagnostic Rules

- Diagnostics must be able to target document, score address, score range, module, contribution, file, or operation scope.
- Hard validation failures must produce structured diagnostics with fine-grained validation diagnostic codes such as `rhythm-slot-gap`, `technique-definition-missing`, or `pitch-octave-out-of-range`.
- Do not collapse targeted validation failures into broad codes such as `duration-invalid` when a specific validation code is defined by the owning score model spec.
- If a command rolls back because hard validation fails, the outer `KernelError.code` may be `command-validation-failed`, but the returned diagnostics must preserve the concrete validation diagnostic codes.
- Module exceptions must be caught and converted to `module-error` diagnostics or report issues.
- UI localization happens outside the kernel.

## Report Rules

Reports share one shell for validation, migration, import, export, and recovery:

- Report id.
- Kind.
- Status.
- Source module.
- Created timestamp.
- Issue summary.
- Issues.

`ImportReport` and `ExportReport` are report shells for external modules. Their presence in Core Kernel does not mean Core Kernel implements real import/export formats.

Report issue codes may reference either operation-level `KernelErrorCode` values or score validation diagnostic codes. Validation reports should preserve the specific validation codes instead of rewriting them to generic operation errors.

## Privacy Rules

By default, errors, diagnostics, reports, and details must not include:

- User score text beyond structured references.
- Access tokens.
- API keys.
- Local private absolute paths.
- Third-party secrets.
- Full plugin source code.

If a detail is useful for debugging but privacy-sensitive, store a redacted value, stable code, or target reference instead.

</details>
