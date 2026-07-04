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

The kernel must not define `Track`, `Voice`, `GuitarTabData`, `stringNumber`, or `fret` as required K1 score-truth fields. Those concerns belong to external modules, especially the future official guitar-tab module.

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
- `tuning`: V1 may store the current guitar score tuning as explicit scientific pitches, low to high `E2 A2 D3 G3 B3 E4`.

Tuning is music metadata. It does not mean the kernel owns string/fret placement. Do not store tuning as ambiguous `EADGBE`; use explicit pitches.

## MVP Musical Scope

Core Kernel V1 supports the 4-measure guitar core-loop fixture:

- One `ScoreDocument`.
- `metadata.music.scoreType = "guitar-tab"`.
- `ticksPerQuarter = 960`.
- Global fixed tempo.
- Global 4/4 time signature.
- Optional explicit tuning metadata for the current guitar score profile.
- One abstract score event stream.
- Each beat contains exactly one `ScoreEvent`.
- `ScoreEvent.kind` is either `note` or `rest`.
- Allowed durations: quarter, eighth, sixteenth.
- Basic equal-length rests represented as `ScoreEvent.kind = "rest"`.
- Core Loop techniques: `slide`, `bend`, `vibrato`.

V1 does not implement track management, guitar string/fret persistence, multi-voice editing, chords, tempo maps, changing time signatures, dotted rhythms, tuplets, MIDI input, playback scheduling, rendering, or physical file IO.

## Musical Time Model

- Use integer ticks for musical time.
- `ticksPerQuarter = 960`.
- 4/4 measure length is `3840` ticks.
- Quarter duration is `960`.
- Eighth duration is `480`.
- Sixteenth duration is `240`.
- `ScoreTimeline` owns measure and beat order plus tick placement.
- A measure's beat durations must sum exactly to the measure duration.
- `beat.startTick + beat.durationTicks` must not exceed the owning measure range.
- `ScoreEvent.durationTicks` must match the owning beat duration.
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
  beats: BeatTimeSpan[]
}

export interface BeatTimeSpan {
  id: string
  startTick: Tick
  durationTicks: DurationTicks
}

export type ScoreEvent = SoundNoteEvent | RestNoteEvent

export interface BaseScoreEvent {
  id: string
  beatId: string
  startTick: Tick
  durationTicks: DurationTicks
}

export interface SoundNoteEvent extends BaseScoreEvent {
  kind: "note"
  pitch: AbsolutePitch
}

export interface RestNoteEvent extends BaseScoreEvent {
  kind: "rest"
}
```

Validation matrix:

| Condition | Required result |
|-----------|-----------------|
| `timebase.ticksPerQuarter !== 960` | reject with stable validation diagnostic |
| unsupported time signature | `unsupported-time-signature` |
| unsupported duration value | `unsupported-duration` |
| total measure duration below expected length | `measure-duration-underflow` |
| total measure duration above expected length | `measure-duration-overflow` |
| `beat.startTick + beat.durationTicks` exceeds measure range | `measure-duration-overflow` or targeted duration diagnostic |
| event duration differs from owning beat duration | targeted duration diagnostic |
| beat has zero events | targeted missing-event diagnostic |
| beat has multiple events | `unsupported-multiple-notes-in-beat` or targeted beat-cardinality diagnostic |
| technique targets a rest or missing note | targeted technique-target diagnostic |
| tempo map or measure-level tempo override appears in V1 data | `unsupported-tempo-map` |

Good/base/bad cases:

- Good: a 4/4 measure containing four quarter beats at offsets `0`, `960`, `1920`, and `2880`.
- Base: a 4/4 measure containing eighth and sixteenth beats whose summed duration is exactly `3840`.
- Good: a rest is stored as one `ScoreEvent` with `kind = "rest"` and the same duration as its beat.
- Bad: a beat starting at `3720` with duration `240`, because it exceeds the 4/4 measure length.
- Bad: a note event with `durationTicks = 480` inside a beat with `durationTicks = 960`.
- Bad: a technique target references a rest event.

Tests must assert:

- The standard 4-measure fixture uses `ticksPerQuarter = 960`.
- Each supported duration round-trips through schema serialization.
- Measure underflow, overflow, unsupported duration, unsupported tempo map, unsupported time signature, event duration mismatch, missing event, multiple events, and invalid technique targets produce stable diagnostics.
- Playback event generation, when implemented outside the kernel, consumes snapshot musical ticks and does not mutate `ScoreDocument`.

Wrong vs correct:

```typescript
// Wrong: storing playback clock state as score truth.
score.playback = { currentTimeMs: 1234, cursorTick: 960 }

// Correct: storing musical time only; playback derives runtime state from snapshots.
beat.startTick = 960
beat.durationTicks = 480
```

## Technique Contracts

Core Loop techniques must be structured semantic data, not display-only labels.

Use this type shape or an equivalent stricter shape:

```typescript
export interface TechniqueData {
  id: string
  type: "slide" | "bend" | "vibrato"
  targetNoteIds: string[]
  params: Record<string, unknown>
}
```

Rules:

- Techniques may target one or more sound note events.
- `targetNoteIds` is ordered.
- `bend` targets exactly one note in V1.
- `vibrato` targets exactly one note in V1.
- `slide` targets exactly two notes in V1; order means from -> to.
- Techniques must not target `rest` events.
- Technique parameters must be structured enough for future rendering, playback, export, and validation to interpret consistently.

## Guitar Module Boundary

Core Kernel V1 does not store guitar string/fret placement:

- No `stringNumber` field in `SoundNoteEvent`.
- No `fret` field in `SoundNoteEvent`.
- No `GuitarTabData` required field in `ScoreData`.
- No `setFret` or `setString` command in the K1 core implementation.
- No validation that depends on a note's guitar string/fret position.

The future official guitar-tab module may persist `noteId -> string/fret` mappings and use tuning metadata to convert between positions and absolute pitches. That module data must not become a required K1 core field.

Consequence: A file containing only K1 core data can preserve pitch and rhythm, but it cannot promise to restore the user's original string/fret choice. That is an intentional boundary, not a kernel defect.

## Schema and Compatibility

- Every persisted score document must include `schemaVersion`.
- Schema evolution must go through migration entry points and migration reports.
- Unknown extension data must be namespaced and must not prevent the recognized core score from opening.
- The model may reserve extension points for future instruments, module-private data, multi-voice, multi-meter, and advanced techniques, but the V1 hard validator must reject unsupported values explicitly.

## Forbidden Model Shortcuts

- Do not store tuning as ambiguous `EADGBE`; use explicit pitches.
- Do not store UI coordinates, layout coordinates, VexFlow coordinates, DOM IDs, playback cursor state, or export page coordinates as score truth.
- Do not store guitar string/fret placement in `SoundNoteEvent`.
- Do not represent Guitar Pro compatibility, PDF/PNG output, playback audio, or UI state as required kernel schema fields.
- Do not treat `TechniqueData` as a display-only label; Core Loop techniques must carry structured parameters where needed.
- Do not allow same-beat multiple notes, chords, multiple voices, 7/8-string guitars, tempo maps, tuplets, dotted rhythms, or changing time signatures to pass V1 validation.
