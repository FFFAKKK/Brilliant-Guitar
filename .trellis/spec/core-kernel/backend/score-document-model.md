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

## Time Model

- Use integer ticks for musical time.
- `ticksPerQuarter = 960`.
- 4/4 measure length is `3840` ticks.
- Quarter duration is `960`.
- Eighth duration is `480`.
- Sixteenth duration is `240`.
- `tickOffset + durationTicks` must not exceed the owning measure length.

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

