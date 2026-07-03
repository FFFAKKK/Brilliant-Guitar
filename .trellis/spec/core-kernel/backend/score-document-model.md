# Score Document Model

## Core Rule

`ScoreDocument` is the only score business truth.

Tab, notation, playback, export, layout primitives, hit areas, and future plugin data must be derived from `ScoreDocument` snapshots or selectors. They must not become independent score truth.

## MVP Musical Scope

Core Kernel V1 supports the 4-measure standard 6-string guitar riff fixture:

- One `ScoreDocument`.
- One standard 6-string guitar track.
- Standard tuning stored per string as explicit scientific pitch: low to high `E2 A2 D3 G3 B3 E4`.
- Global fixed tempo.
- Global 4/4 time signature.
- One voice per measure.
- Each beat contains either one `NoteEvent` or one `RestEvent`.
- Allowed durations: quarter, eighth, sixteenth.
- Basic equal-length rests.
- Core Loop techniques: `slide`, `bend`, `vibrato`.

## Musical Time Model

- Use integer ticks for musical time.
- `ticksPerQuarter = 960`.
- 4/4 measure length is `3840` ticks.
- Quarter duration is `960`.
- Eighth duration is `480`.
- Sixteenth duration is `240`.
- `tickOffset + durationTicks` must not exceed the owning measure length.
- `NoteEvent.durationTicks` and `RestEvent.durationTicks` must match the owning beat duration.
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

export interface Measure {
  durationTicks: DurationTicks
}

export interface Beat {
  tickOffset: Tick
  durationTicks: DurationTicks
}

export interface NoteEvent {
  durationTicks: DurationTicks
}

export interface RestEvent {
  durationTicks: DurationTicks
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
| `beat.tickOffset + beat.durationTicks` exceeds measure length | `measure-duration-overflow` or targeted duration diagnostic |
| note/rest duration differs from owning beat duration | targeted duration diagnostic |
| tempo map or measure-level tempo override appears in V1 data | `unsupported-tempo-map` |

Good/base/bad cases:

- Good: a 4/4 measure containing four quarter beats at offsets `0`, `960`, `1920`, and `2880`.
- Base: a 4/4 measure containing eighth and sixteenth beats whose summed duration is exactly `3840`.
- Bad: a beat starting at `3720` with duration `240`, because it exceeds the 4/4 measure length.
- Bad: a note with `durationTicks = 480` inside a beat with `durationTicks = 960`.

Tests must assert:

- The standard 4-measure guitar fixture uses `ticksPerQuarter = 960`.
- Each supported duration round-trips through schema serialization.
- Measure underflow, overflow, unsupported duration, unsupported tempo map, unsupported time signature, and note/rest duration mismatch produce stable diagnostics.
- Playback event generation, when implemented outside the kernel, consumes snapshot musical ticks and does not mutate `ScoreDocument`.

Wrong vs correct:

```typescript
// Wrong: storing playback clock state as score truth.
score.playback = { currentTimeMs: 1234, cursorTick: 960 }

// Correct: storing musical time only; playback derives runtime state from snapshots.
beat.tickOffset = 960
beat.durationTicks = 480
```

## Schema and Compatibility

- Every persisted score document must include `schemaVersion`.
- Schema evolution must go through migration entry points and migration reports.
- Unknown extension data must be namespaced and must not prevent the recognized core score from opening.
- The model may reserve fields for future multi-track, multi-voice, multi-meter, more instruments, and advanced techniques, but the V1 hard validator must reject unsupported values explicitly.

## Forbidden Model Shortcuts

- Do not store tuning as ambiguous `EADGBE`; use explicit per-string pitches.
- Do not store UI coordinates, layout coordinates, VexFlow coordinates, DOM IDs, playback cursor state, or export page coordinates as score truth.
- Do not represent Guitar Pro compatibility, PDF/PNG output, playback audio, or UI state as required kernel schema fields.
- Do not treat `TechniqueAnnotation` as a display-only label; Core Loop techniques must carry structured parameters where needed.
- Do not allow same-beat multiple notes, chords, multiple voices, 7/8-string guitars, tempo maps, tuplets, dotted rhythms, or changing time signatures to pass V1 validation.
