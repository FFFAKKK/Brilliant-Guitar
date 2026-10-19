import { STAFF_FIXTURE } from "./staff-snapshot.js";

// Explicit standard-guitar demo positions. Staff pitches are written one octave
// above sounding pitch, matching GUITAR_INSTRUMENT_PROFILE_V1 (+12 semitones).
// These positions are never computed or substituted for real documents.
const positions = Object.freeze({
  "event-1-1": [5, 3], "event-1-2": [4, 0], "event-1-3": [4, 2],
  "event-2-1": [4, 2], "event-2-2": [4, 0], "event-2-3": [5, 3],
  "event-3-1": [3, 0], "event-3-2": [3, 2], "event-3-3": [2, 0],
  "event-4-1": [2, 1], "event-4-2": [2, 0], "event-4-3": [3, 2],
});
export const TABLATURE_FIXTURE = Object.freeze({
  kind: "tablature", partId: STAFF_FIXTURE.partId, staffId: STAFF_FIXTURE.staffId,
  stringCount: 6, fretCount: 24, capoFret: 0, tempoBpm: STAFF_FIXTURE.tempoBpm,
  measures: STAFF_FIXTURE.measures.map(measure => ({
    ...measure, events: measure.events.map(event => ({
      ...event, content: event.content.kind === "rest" ? event.content
        : { kind: "note", noteId: `fixture-note-${event.id}`,
          position: { stringNumber: positions[event.id][0], fret: positions[event.id][1] } },
    })),
  })),
});
