# Score Document Model

## Core Rule

`ScoreDocument` is the only score business truth.

Tab, notation, playback, export, layout primitives, hit areas, and future plugin data must be derived from `ScoreDocument` snapshots or selectors. They must not become independent score truth.

Core Kernel V1 keeps the score model minimal and abstract. Guitar string/fret placement, tablature fingering maps, rendered staff positions, UI cursor state, playback runtime state, and physical file IO are external module concerns.

## K1 Document Shape

Core Kernel V1 uses this document shape or an equivalent stricter shape:

```typescript
export interface ScoreDocument {
  metadata: ScoreMetadata
  scoreData: ScoreData
}

export interface ScoreMetadata {
  document: DocumentMetadata
  music: MusicMetadata
}

export interface ScoreData {
  timeline: ScoreTimeline
  events: ScoreEvent[]
  techniques: TechniqueData[]
}
```

The kernel must not define `Track`, `Voice`, `GuitarTabData`, `stringNumber`, `fret`, or a module-private storage location as K1 score-truth fields. Those concerns belong to external modules, especially the future official guitar-tab module, and must be planned after the core model is stable.

## Metadata Contracts

`DocumentMetadata` describes the work and file identity. It must not be used for musical rule calculation.

Required or reserved document metadata fields:

- `schemaVersion`
- `documentId`
- `title`
- `artist`
- `composer`
- `copyright`
- `createdAt`
- `updatedAt`
- `createdWith`
- `lastSavedWith`

`MusicMetadata` describes global musical facts:

- `scoreType`: V1 default is `guitar-tab`.
- `timebase.ticksPerQuarter`: V1 must be `960`.
- `tempo.bpm`: V1 supports one global fixed tempo only.
- `meter.numerator` / `meter.denominator`: V1 supports `4/4` only.
- `tuning`: required when `scoreType = "guitar-tab"`; it must contain exactly 6 explicit `AbsolutePitch` values, low to high. Standard guitar tuning is `E2 A2 D3 G3 B3 E4`.

Tuning is music metadata. It does not mean the kernel owns string/fret placement. Do not store tuning as ambiguous `EADGBE`; use explicit pitches.

## MVP Musical Scope

Core Kernel V1 supports the 4-measure guitar core-loop fixture:

- One `ScoreDocument`.
- `metadata.music.scoreType = "guitar-tab"`.
- `ticksPerQuarter = 960`.
- Global fixed tempo.
- Global 4/4 time signature.
- Required explicit tuning metadata for the current guitar score profile.
- One abstract score event stream.
- Each rhythm slot contains exactly one `ScoreEvent`.
- `ScoreEvent.kind` is either `note` or `rest`.
- Allowed durations: quarter, eighth, sixteenth.
- Basic equal-length rests represented as `ScoreEvent.kind = "rest"`.
- Generic registered technique framework. K1 tests use startup-registered `test.slide`, `test.bend`, and `test.vibrato` definitions to exercise slide, bend, and vibrato technique semantics.

V1 does not implement track management, guitar string/fret persistence, multi-voice editing, chords, tempo maps, changing time signatures, dotted rhythms, tuplets, MIDI input, playback scheduling, rendering, or physical file IO.

## Musical Time Model

- Use integer ticks for musical time.
- `ticksPerQuarter = 960`.
- 4/4 measure length is `3840` ticks.
- Quarter duration is `960`.
- Eighth duration is `480`.
- Sixteenth duration is `240`.
- `ScoreTimeline` owns measure and rhythm slot order plus tick placement.
- A measure's rhythm slot durations must sum exactly to the measure duration.
- `MeasureTimeSpan.startTick` is the absolute tick of the measure in the whole score.
- `RhythmSlot.startOffsetTicks` is relative to the owning measure start, not an absolute score tick.
- The absolute tick for a rhythm slot is derived as `measure.startTick + slot.startOffsetTicks`.
- `slot.startOffsetTicks + slot.durationTicks` must not exceed the owning measure duration.
- Within each measure, rhythm slots must be sorted by `startOffsetTicks` ascending, must not overlap, and must not leave gaps.
- The first rhythm slot must start at the measure boundary, and the final rhythm slot must end exactly at the measure end.
- Each rhythm slot duration must be positive and must be one of the V1 supported durations: `960`, `480`, or `240`.
- The rhythm slot is the only time truth for the event in that slot; `ScoreEvent` must not duplicate `startTick` or `durationTicks`.
- Musical time belongs to the `ScoreDocument` domain model. It is not a playback engine.
- Core Kernel owns musical ticks, duration constants, measure-length calculation, and hard validation of rhythmic structure.
- Playback modules own wall-clock scheduling, Web Audio time, metronome sound, and playback cursor ticks derived from snapshots.
- UI timelines, layout x positions, SVG/VexFlow coordinates, and export page coordinates are derived state and must not be written back as score truth.
- V1 does not implement tempo maps, changing time signatures, dotted rhythms, tuplets, multi-voice alignment, swing/humanize, MIDI clock, or DAW transport.

## Musical Time Contracts

Use these type shapes or equivalent stricter shapes in the Core Kernel:

```typescript
export type Tick = number
export type DurationTicks = number

export interface MusicalTimebase {
  ticksPerQuarter: 960
}

export interface ScoreTimeline {
  measures: MeasureTimeSpan[]
}

export interface MeasureTimeSpan {
  id: string
  order: number
  startTick: Tick
  durationTicks: DurationTicks
  slots: RhythmSlot[]
}

export interface RhythmSlot {
  id: string
  startOffsetTicks: Tick
  durationTicks: DurationTicks
}

export type ScoreEvent = SoundNoteEvent | RestNoteEvent

export interface BaseScoreEvent {
  id: string
  slotId: string
}

export interface SoundNoteEvent extends BaseScoreEvent {
  kind: "note"
  pitch: AbsolutePitch
}

export interface RestNoteEvent extends BaseScoreEvent {
  kind: "rest"
}

export type PitchStep = "C" | "D" | "E" | "F" | "G" | "A" | "B"
export type PitchAccidental = "flat" | "natural" | "sharp"

export interface AbsolutePitch {
  step: PitchStep
  accidental: PitchAccidental
  octave: number
}
```

`AbsolutePitch` is the canonical K1 pitch form. K1 octave range is `0..8`. The model preserves enharmonic spelling, so `A#3` and `Bb3` are different persisted spellings even when they derive to the same MIDI number. MIDI pitch is derived data and must not replace `AbsolutePitch` as the persisted core value.

Validation matrix:

| Condition | Required result |
|-----------|-----------------|
| `timebase.ticksPerQuarter !== 960` | reject with stable validation diagnostic |
| `scoreType = "guitar-tab"` and tuning is missing | `tuning-missing` |
| guitar tuning length is not 6 | `tuning-string-count-invalid` |
| tuning contains invalid pitch | `tuning-pitch-invalid` |
| invalid pitch step | `pitch-step-invalid` |
| invalid pitch accidental | `pitch-accidental-invalid` |
| pitch octave outside `0..8` | `pitch-octave-out-of-range` |
| unsupported time signature | `unsupported-time-signature` |
| unsupported duration value | `unsupported-duration` |
| total measure duration below expected length | `measure-duration-underflow` |
| total measure duration above expected length | `measure-duration-overflow` |
| slot duration is `0`, negative, or not in the supported V1 duration set | `unsupported-duration` |
| slots are not sorted by ascending `startOffsetTicks` | `rhythm-slot-order-invalid` |
| a slot starts before the previous slot ends | `rhythm-slot-overlap` |
| a slot starts after the previous slot ends, or the first slot does not start at the measure boundary | `rhythm-slot-gap` |
| final slot does not end exactly at the measure end | `measure-duration-underflow` or `measure-duration-overflow` |
| `slot.startOffsetTicks + slot.durationTicks` exceeds measure duration | `measure-duration-overflow` or targeted duration diagnostic |
| slot has zero events | targeted missing-event diagnostic |
| slot has multiple events | `unsupported-multiple-notes-in-slot` or targeted slot-cardinality diagnostic |
| technique targets a rest or missing note | targeted technique-target diagnostic |
| technique definition is not registered | `technique-definition-missing` |
| technique target count violates its definition | `technique-target-count-invalid` |
| technique params fail registered definition validation | `technique-params-invalid` |
| tempo map or measure-level tempo override appears in V1 data | `unsupported-tempo-map` |

Good/base/bad cases:

- Good: a 4/4 measure containing four quarter rhythm slots at offsets `0`, `960`, `1920`, and `2880`.
- Base: a 4/4 measure containing eighth and sixteenth rhythm slots whose summed duration is exactly `3840`.
- Good: a rest is stored as one `ScoreEvent` with `kind = "rest"` that references a rhythm slot.
- Bad: two rhythm slots both start at `0`, even if their durations sum to `3840`.
- Bad: a measure with slots at `0..960` and `1920..2880`, because the `960..1920` range is a gap.
- Bad: a rhythm slot starting at `3720` with duration `240`, because it exceeds the 4/4 measure length.
- Bad: a note event with its own persisted `durationTicks`; event time must come from its referenced slot.
- Bad: a technique target references a rest event.

Tests must assert:

- The standard 4-measure fixture uses `ticksPerQuarter = 960`.
- A `guitar-tab` fixture stores exactly 6 explicit tuning pitches low to high.
- Each supported duration round-trips through schema serialization.
- Measure underflow, overflow, unsupported duration, rhythm slot ordering, overlap, gap, unsupported tempo map, unsupported time signature, invalid pitch, invalid tuning, missing event, multiple events, and invalid technique targets produce stable diagnostics.
- Playback event generation, when implemented outside the kernel, consumes snapshot musical ticks and does not mutate `ScoreDocument`.

Wrong vs correct:

```typescript
// Wrong: storing playback clock state as score truth.
score.playback = { currentTimeMs: 1234, cursorTick: 960 }

// Correct: storing musical time only; playback derives runtime state from snapshots.
slot.startOffsetTicks = 960
slot.durationTicks = 480
```

## Technique Contracts

Techniques must be structured semantic data, not display-only labels.

Core Kernel K1 owns the generic technique framework and validation contract. Concrete techniques are registered definitions; they must not be hardcoded as a kernel enum. `test.slide`, `test.bend`, and `test.vibrato` are K1 startup-registered test technique definitions used to verify the framework, not the full built-in technique catalog.

Only `TechniqueData` is persisted inside `ScoreDocument` and `.bgp` `score.json`. `TechniqueDefinition`, `TechniqueTargetRule`, and `TechniqueParamValidator` are runtime registry contributions only. They may contain functions and handlers, so they must never be serialized into `ScoreDocument`, `score.json`, fixtures as score data, snapshots intended for persistence, or migration input/output. When opening or validating a persisted document, the kernel resolves `TechniqueData.definitionId` against the runtime registry and reports `technique-definition-missing` if no definition is registered.

Use this type shape or an equivalent stricter shape:

```typescript
export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue }

export type JsonObject = { [key: string]: JsonValue }

// Persisted score data: pure JSON-compatible semantic technique usage.
export interface TechniqueData {
  id: string
  definitionId: string
  targetNoteIds: string[]
  params: JsonObject
}

// Runtime registry contribution only: never persisted in ScoreDocument or .bgp.
export interface TechniqueDefinition {
  id: string
  targetRule: TechniqueTargetRule
  validateParams: TechniqueParamValidator
}

export type TechniqueParamValidator = (
  params: JsonObject,
) => TechniqueParamValidationResult

export type TechniqueParamValidationResult =
  | { ok: true }
  | { ok: false; code: "technique-params-invalid"; details?: JsonObject }

export interface TechniqueTargetRule {
  minNotes: number
  maxNotes: number
  ordered: boolean
  allowRest: false
}

export type K1TestTechniqueDefinitionId =
  | "test.bend"
  | "test.vibrato"
  | "test.slide"

export interface K1TestBendParams {
  semitones: 1 | 2
}

export interface K1TestVibratoParams {
  width: "narrow" | "wide"
}

export interface K1TestSlideParams {
  slideKind: "shift" | "legato"
}
```

Rules:

- Techniques may target one or more sound note events.
- `targetNoteIds` is ordered.
- `definitionId` must reference a registered `TechniqueDefinition`.
- `TechniqueData` must remain pure data: IDs, target note references, and JSON-serializable params only.
- `TechniqueData` must not contain validators, callbacks, closures, classes, display handlers, playback handlers, renderer handlers, or module code.
- `TechniqueDefinition` is resolved from the runtime registry and must not be written into `.bgp` package data.
- A registered definition owns target count, target ordering, and parameter validation.
- Techniques must not target `rest` events.
- Technique parameters must be structured enough for future rendering, playback, export, and validation to interpret consistently.
- K1 test definitions use stable English registry ids and params. They are test definitions only, not a closed kernel enum and not the full guitar technique catalog.
- `test.bend` must target exactly one sound note and accept only `params = { semitones: 1 }` or `params = { semitones: 2 }`.
- `test.vibrato` must target exactly one sound note and accept only `params = { width: "narrow" }` or `params = { width: "wide" }`.
- `test.slide` must target exactly two ordered sound notes, the two target note ids must be different, the second target note must occur after the first in musical time, and params must be `{ slideKind: "shift" }` or `{ slideKind: "legato" }`.
- Test technique ids, param names, param values, diagnostic codes, and serialized fields must be English stable identifiers; localized display names belong to i18n resources or UI modules, not persisted technique data.

## Guitar Module Boundary

Core Kernel V1 does not store guitar string/fret placement:

- No `stringNumber` field in `SoundNoteEvent`.
- No `fret` field in `SoundNoteEvent`.
- No `GuitarTabData` required field in `ScoreData`.
- No `setFret` or `setString` command in the K1 core implementation.
- No validation that depends on a note's guitar string/fret position.

Pure Core Kernel V1 does not define where future guitar-tab module data is persisted. It must not introduce `ScoreDocument.extensions`, `.bgp/extensions`, `moduleData`, or any other module-private storage contract for `noteId -> string/fret` mappings in K1.

Future guitar-tab storage can be planned when the official guitar-tab module is designed. That future storage must not become a required K1 core field.

Consequence: A file containing only K1 core data can preserve pitch and rhythm, but it cannot promise to restore the user's original string/fret choice. That is an intentional boundary, not a kernel defect.

## Schema and Compatibility

- Every persisted score document must include `schemaVersion`.
- Schema evolution must go through migration entry points and migration reports.
- K1 does not define module-private data persistence, extension folders, or extension payload semantics.
- Future instruments, module-private data, multi-voice, multi-meter, and advanced techniques require separate planning before entering any schema contract.
- The V1 hard validator must reject unsupported core values explicitly.

## Forbidden Model Shortcuts

- Do not store tuning as ambiguous `EADGBE`; use explicit pitches.
- Do not store `guitar-tab` tuning as optional in K1; it is required and must contain exactly 6 explicit pitches.
- Do not store UI coordinates, layout coordinates, VexFlow coordinates, DOM IDs, playback cursor state, or export page coordinates as score truth.
- Do not store guitar string/fret placement in `SoundNoteEvent`.
- Do not represent Guitar Pro compatibility, PDF/PNG output, playback audio, or UI state as required kernel schema fields.
- Do not treat `TechniqueData` as a display-only label; technique definitions must validate structured parameters where needed.
- Do not allow same-slot multiple notes, chords, multiple voices, 7/8-string guitars, tempo maps, tuplets, dotted rhythms, or changing time signatures to pass V1 validation.
