import { createCoreScoreFixture } from "../fixtures/core-score";

export function createLosslessScoreDtoOracle() {
  return {
    oracleVersion: 1,
    samples: ["control", "\ud800", "\udc00", "🎸", "\ufffd", "\ue000", "\\ud800", "a\0b"].map((text, index) => {
      const source = createCoreScoreFixture();
      const part = source.parts[0]!;
      const id = (kind: string) => `${kind}:${text}`;
      const payload = Object.fromEntries(Object.entries({ value: text, [text]: { nested: [text, null, true, 0.125] } }).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
      const document = {
        ...source, id: id("score"),
        metadata: { ...source.metadata, title: text, authors: [text] },
        measureDefinitions: source.measureDefinitions.map(measure => ({ ...measure, id: id("measure") })),
        parts: [{
          ...part, id: id("part"), name: text, instrument: { ...part.instrument, name: text },
          staves: part.staves.map(staff => ({ ...staff, id: id("staff") })),
          measureContents: part.measureContents.map(content => ({ ...content, measureId: id("measure"), voices: content.voices.map(voice => ({
            ...voice, id: id("voice"), defaultStaffId: id("staff"), sequence: { ...voice.sequence, events: voice.sequence.events.map((event, eventIndex) => ({
              id: id(`event-${eventIndex}`), duration: event.duration, staffId: id("staff"),
              content: event.content.kind === "rest" ? event.content : { ...event.content, notes: event.content.notes.map(note => ({ ...note, id: id("note") })) },
            })) },
          })) })),
        }],
        extensions: [
          { namespace: "example.lossless.score", schemaVersion: 1, owner: { kind: "score" as const }, payload },
          { namespace: "example.lossless.part", schemaVersion: 1, owner: { kind: "part" as const, partId: id("part") }, payload },
        ],
      };
      return { index, units: Array.from({ length: text.length }, (_, offset) => text.charCodeAt(offset)), input: JSON.stringify(document) };
    }),
  };
}
