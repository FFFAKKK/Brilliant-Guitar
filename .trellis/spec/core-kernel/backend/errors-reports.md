# Errors and Reports

> **Authoritative staged scope (2026-07-15):** K1-1 diagnostics and the closed
> K1-2 CommandFailure contract are active. General operation/report shells remain K1-5.

## Current Diagnostic Contract

Each diagnostic contains stable `code`, `messageKey`, structured `(string | number)[]` `path`, and optional privacy-safe JsonValue `details`.

- `decode.*`: syntax, shape, type, version, required/extra field, union decoding.
- `semantic.*`: ids, references, ownership, Fraction, meter, tempo, pitch, time bounds, extension envelope.
- `unsupported.*`: semantic-valid data outside ScoreFeatureProfile.
- `guitar.*`: reserved for the later Guitar Domain; Core K1-1 never emits it.

Ordinary malformed input returns result objects and must not leak untyped exceptions. Identical input produces deterministic diagnostic ordering. K1-2 command/transaction/history failures are the closed result contract in `command-transaction.md`; they do not create a general report framework. General `KernelError`, validation/migration/import/export/recovery reports, and module-exception conversion remain later work.

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

Later operation errors and report shells must be specified during K1-5 against this diagnostic contract. Retired error/report drafts are archived under `.trellis/archive/core-kernel/`.
