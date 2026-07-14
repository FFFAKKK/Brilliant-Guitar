# Score Document Model

> **Authoritative contract (2026-07-13):** K1-1 uses the `brilliant-score-1`
> model defined below. Retired drafts live outside the active specification.

## Current K1-1 Core Rule

`ScoreDocument` is the only persisted score business truth. K1-1 stores notation facts once and derives event positions, sounding pitch, playback ticks, milliseconds, and layout coordinates outside the persisted model.

## Current Document Shape

```typescript
export interface ScoreDocument {
  readonly schemaVersion: "brilliant-score-1"
  readonly id: string
  readonly metadata: ScoreMetadata
  readonly measureDefinitions: readonly MeasureDefinition[]
  readonly parts: readonly Part[]
  readonly extensions: readonly ExtensionBlock[]
}

export interface ScoreMetadata {
  readonly title: string
  readonly authors: readonly string[]
  readonly tempo: { readonly bpm: number }
}

export interface MeasureDefinition {
  readonly id: string
  readonly meter: Meter
  readonly pickupDuration?: Fraction
}

export interface Meter {
  readonly numerator: number
  readonly denominator: 1 | 2 | 4 | 8 | 16 | 32 | 64
}

export interface Part {
  readonly id: string
  readonly name: string
  readonly instrument: InstrumentDescriptor
  readonly staves: readonly StaffDefinition[]
  readonly measureContents: readonly PartMeasureContent[]
}

export interface InstrumentDescriptor {
  readonly name: string
  readonly writtenToSounding: Transposition
}

export interface Transposition {
  readonly diatonicSteps: number
  readonly chromaticSemitones: number
}

export interface StaffDefinition {
  readonly id: string
  readonly lineCount: number
  readonly defaultClef: Clef
}

export interface Clef {
  readonly sign: "G" | "F" | "C"
  readonly line: 1 | 2 | 3 | 4 | 5
}

export interface PartMeasureContent {
  readonly measureId: string
  readonly voices: readonly Voice[]
}

export interface Voice {
  readonly id: string
  readonly defaultStaffId: string
  readonly sequence: MusicSequence
}

export interface MusicSequence {
  readonly start: Fraction
  readonly events: readonly RhythmicEvent[]
}

export interface RhythmicEvent {
  readonly id: string
  readonly duration: NoteValue
  readonly staffId?: string
  readonly content: RestContent | NotesContent
}

export interface RestContent {
  readonly kind: "rest"
}

export interface NotesContent {
  readonly kind: "notes"
  readonly notes: readonly ScoreNote[]
}

export interface ScoreNote {
  readonly id: string
  readonly writtenPitch: WrittenPitch
}
```

## Current Ownership and Ordering

- `measureDefinitions[]` is the only whole-score measure order and meter truth.
- Every Part contains exactly one `PartMeasureContent` for each global measure id; duplicates, omissions, and unknown ids are invalid.
- `measureContents[]` has no independent semantic order. Consumers resolve it through `measureDefinitions[]`.
- Staff belongs to one Part. Voice belongs to one Part/measure and may target only Staff ids from that Part.
- Event array order is Voice order. Events never persist offset, absolute time, tick, or layout position.
- Notes belong to NotesContent. Core Notes never persist tuning, string, fret, or guitar techniques.
- Measure, Part, Staff, Voice, Event, and Note ids are non-empty and globally unique in one document.

## Current Exact Musical Time

```typescript
export interface Fraction {
  readonly numerator: number
  readonly denominator: number
}

export interface NoteValue {
  readonly base: 1 | 2 | 4 | 8 | 16 | 32 | 64
  readonly dots: 0 | 1 | 2 | 3
  readonly timeModification?: {
    readonly actualNotes: number
    readonly normalNotes: number
  }
}
```

- Whole-note duration is `1/1`; a normal measure is `numerator / denominator` and optional pickupDuration overrides that measure's effective duration.
- Fraction components are safe integers; denominator is positive; zero is only `0/1`; non-zero values are gcd-reduced with sign on numerator.
- Persisted Fractions are already canonical. Decode/validation never silently repairs them.
- Sequence starts are non-negative and derived event durations are positive.
- Arithmetic returns a stable failure if any intermediate or final value exceeds safe-integer range; it never rounds or falls back to floating point.
- NoteValue duration is `(1/base) * dot multiplier * (normalNotes/actualNotes)`. Actual/normal counts are positive safe integers; an eighth-note triplet is `1/12`.
- Event start is `sequence.start + preceding exact durations`. Tick, PPQ, milliseconds, playback and layout time are adapter-derived.

## Current Pitch and Transposition

```typescript
export interface WrittenPitch {
  readonly step: "C" | "D" | "E" | "F" | "G" | "A" | "B"
  readonly alter: -2 | -1 | 0 | 1 | 2
  readonly octave: number
}

export interface SoundingPitch {
  readonly step: "C" | "D" | "E" | "F" | "G" | "A" | "B"
  readonly alter: number
  readonly octave: number
}
```

- Note persists only WrittenPitch; SoundingPitch is derived from WrittenPitch and Part transposition.
- Pitch octave is an integer `0..8`. Derived spelling outside double-flat through double-sharp returns failure rather than silent respelling.
- Transposition components are safe integers; diatonic and chromatic displacement must agree on one deterministic spelling.
- Non-transposing instruments use `0 / 0`. Standard guitar notation uses `-7 / -12`, so written E3 derives to sounding E2.
- Guitar tuning is not Core metadata; later Guitar Domain stores actual sounding tuning in its Part-owned extension.

## Current Extension Envelope

```typescript
export type JsonValue =
  | null | boolean | number | string
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue }

export type ExtensionOwner =
  | { readonly kind: "score" }
  | { readonly kind: "part"; readonly partId: string }

export interface ExtensionBlock {
  readonly namespace: string
  readonly schemaVersion: number
  readonly owner: ExtensionOwner
  readonly payload: { readonly [key: string]: JsonValue }
}
```

- K1-1 permits score/part owners only. Namespace is lowercase reverse-domain style, schemaVersion is a positive safe integer, owner resolves, and `(owner, namespace)` is unique.
- Core validates only the envelope and finite JsonValue data. Known payload semantics belong to domain modules.
- Unknown payload survives semantic round-trip with JSON types, key/value meaning, and array order intact.
- Core does not promise original whitespace, object property order, numeric text spelling, zip entries, or byte identity.

## Current Three-Layer Validation

1. Decode: strict `unknown` to Core shape; syntax/shape/type/version/extra-field/union failures return `decode.*` diagnostics and ordinary malformed input never escapes an exception.
2. Semantic validation: ids, references, ownership, measure coverage, canonical Fraction, meter/tempo/pitch/transposition, sequence bounds, and extension envelope return `semantic.*` diagnostics.
3. Feature profile: legal data outside current product support returns `unsupported.*`, never corrupted.

Every diagnostic has stable `code`, `messageKey`, structured `(string | number)[]` path, optional privacy-safe JsonValue details, and deterministic ordering.

## Current K1 Score Feature Profile

The general schema can express multiple Parts/Staves/Voices, chords, dots, time modification, and pickup measures. The first profile supports exactly one Part and Staff, one Voice per measure, 4/4 without pickup, sequence start `0/1` that exactly fills the measure, quarter/eighth/sixteenth, zero dots, no time modification, and rest or one Note per event.

```typescript
export interface CardinalityConstraint {
  readonly minimum: number
  readonly maximum: number
}

export interface ScoreFeatureProfile {
  readonly id: string
  readonly partCount: CardinalityConstraint
  readonly staffCountPerPart: CardinalityConstraint
  readonly voiceCountPerMeasure: CardinalityConstraint
  readonly meters: readonly Meter[]
  readonly allowPickup: boolean
  readonly requireSequenceStartAtZero: boolean
  readonly requireCompleteMeasure: boolean
  readonly noteValueBases: readonly NoteValue["base"][]
  readonly noteValueDots: readonly NoteValue["dots"][]
  readonly allowTimeModification: boolean
  readonly maximumNotesPerEvent: number
}

export type ScoreSupportResult =
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

The profile result is not a generic boolean validation report. `supported` has no diagnostics, `unsupported` means the document is semantic-valid but outside current product support, and `invalid` forwards only semantic diagnostics. This status is the caller contract for distinguishing unsupported data from corrupt data.

## Current Semantic Invariants

- At least one measure and one Part; each Part has Staff and each measure content has Voice.
- Metadata tempo bpm is finite and greater than zero; meter numerator is a positive safe integer.
- NotesContent contains at least one Note.
- Sequence start is within the effective measure and accumulated duration does not exceed it.
- Extension owner references resolve and payload is finite JsonValue.
- Validators never mutate inputs.

## Current Compatibility and Tests

The unpublished tick/slot draft has no compatibility layer. Discovery of a real external consumer or user file stops implementation and requires a migration plan. Future schema versions fail safely; physical `.bgp` bytes remain outside K1-1.

Required tests cover exact Fraction/NoteValue arithmetic and overflow; single-Part round-trip; semantic-valid but profile-unsupported piano/multi-Part/multi-Voice/chord/dot/time-modification/pickup/meter/note-base/sequence-boundary fixtures; two-measure order-independent Part content; cross-entity global id collisions; malformed JSON/strict fields/future version; broken references/coverage/time bounds; deep unknown extension round-trip; and production-export boundaries.
