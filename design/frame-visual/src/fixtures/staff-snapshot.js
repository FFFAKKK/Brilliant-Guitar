const freeze = value => Object.freeze(value);
// Preview/test data only; the score view never invents a document.
export const STAFF_FIXTURE = freeze({
  kind: "staff", partId: "fixture-part", staffId: "fixture-staff", title: "五线谱只读预览",
  clef: "treble", tempoBpm: 96, keySignatureChanges: [],
  measures: freeze([
    { id: "measure-1", voiceId: "voice-1", meter: { numerator: 4, denominator: 4 }, ruleWarnings: [], events: [
      { id: "event-1-1", duration: { base: 4, dots: 0 }, content: { kind: "note", pitch: { step: "C", octave: 4, alter: 0 } } },
      { id: "event-1-2", duration: { base: 4, dots: 0 }, content: { kind: "note", pitch: { step: "D", octave: 4, alter: 0 } } },
      { id: "event-1-3", duration: { base: 4, dots: 0 }, content: { kind: "note", pitch: { step: "E", octave: 4, alter: 0 } } },
      { id: "event-1-4", duration: { base: 4, dots: 0 }, content: { kind: "rest" } },
    ] },
    { id: "measure-2", voiceId: "voice-2", meter: { numerator: 4, denominator: 4 }, ruleWarnings: [], events: [
      { id: "event-2-1", duration: { base: 4, dots: 0 }, content: { kind: "note", pitch: { step: "E", octave: 4, alter: 0 } } },
      { id: "event-2-2", duration: { base: 4, dots: 0 }, content: { kind: "note", pitch: { step: "D", octave: 4, alter: 0 } } },
      { id: "event-2-3", duration: { base: 4, dots: 0 }, content: { kind: "note", pitch: { step: "C", octave: 4, alter: 0 } } },
      { id: "event-2-4", duration: { base: 4, dots: 0 }, content: { kind: "rest" } },
    ] },
    { id: "measure-3", voiceId: "voice-3", meter: { numerator: 4, denominator: 4 }, ruleWarnings: [], events: [
      { id: "event-3-1", duration: { base: 4, dots: 0 }, content: { kind: "note", pitch: { step: "G", octave: 4, alter: 0 } } },
      { id: "event-3-2", duration: { base: 4, dots: 0 }, content: { kind: "note", pitch: { step: "A", octave: 4, alter: 0 } } },
      { id: "event-3-3", duration: { base: 4, dots: 0 }, content: { kind: "note", pitch: { step: "B", octave: 4, alter: 0 } } },
      { id: "event-3-4", duration: { base: 4, dots: 0 }, content: { kind: "rest" } },
    ] },
    { id: "measure-4", voiceId: "voice-4", meter: { numerator: 4, denominator: 4 }, ruleWarnings: [], events: [
      { id: "event-4-1", duration: { base: 4, dots: 0 }, content: { kind: "note", pitch: { step: "C", octave: 5, alter: 0 } } },
      { id: "event-4-2", duration: { base: 4, dots: 0 }, content: { kind: "note", pitch: { step: "B", octave: 4, alter: 0 } } },
      { id: "event-4-3", duration: { base: 4, dots: 0 }, content: { kind: "note", pitch: { step: "A", octave: 4, alter: 0 } } },
      { id: "event-4-4", duration: { base: 4, dots: 0 }, content: { kind: "rest" } },
    ] },
  ].map(measure => freeze({ ...measure, meter: freeze(measure.meter), events: freeze(measure.events.map(event => freeze({
    ...event, duration: freeze(event.duration), content: event.content.kind === "note"
      ? freeze({ kind: "note", pitch: freeze(event.content.pitch) }) : freeze({ kind: "rest" }),
  }))) }))),
});
