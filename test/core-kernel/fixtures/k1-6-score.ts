import type {
  PartMeasureContent,
  ScoreDocument,
  WrittenPitch,
} from "../../../src/core-kernel/index";

type EventIds = readonly [string, string, string, string];

function measureContent(
  measureId: string,
  voiceId: string,
  eventIds: EventIds,
  noteId: string,
  writtenPitch: WrittenPitch,
): PartMeasureContent {
  return {
    measureId,
    voices: [
      {
        id: voiceId,
        defaultStaffId: "staff-k1-6",
        sequence: {
          start: { numerator: 0, denominator: 1 },
          events: [
            {
              id: eventIds[0],
              duration: { base: 4, dots: 0 },
              content: {
                kind: "notes",
                notes: [{ id: noteId, writtenPitch }],
              },
            },
            {
              id: eventIds[1],
              duration: { base: 4, dots: 0 },
              content: { kind: "rest" },
            },
            {
              id: eventIds[2],
              duration: { base: 4, dots: 0 },
              content: { kind: "rest" },
            },
            {
              id: eventIds[3],
              duration: { base: 4, dots: 0 },
              content: { kind: "rest" },
            },
          ],
        },
      },
    ],
  };
}

export function createK1_6ScoreFixture(): ScoreDocument {
  return {
    schemaVersion: "brilliant-score-1",
    id: "score-k1-6",
    metadata: {
      title: "K1-6 integration fixture",
      authors: ["Brilliant Guitar"],
      tempo: { bpm: 96 },
    },
    measureDefinitions: [
      { id: "measure-k1-6-1", meter: { numerator: 4, denominator: 4 } },
      { id: "measure-k1-6-2", meter: { numerator: 4, denominator: 4 } },
      { id: "measure-k1-6-3", meter: { numerator: 4, denominator: 4 } },
      { id: "measure-k1-6-4", meter: { numerator: 4, denominator: 4 } },
    ],
    parts: [
      {
        id: "part-k1-6",
        name: "Concert instrument",
        instrument: {
          name: "Piano",
          writtenToSounding: {
            diatonicSteps: 0,
            chromaticSemitones: 0,
          },
        },
        staves: [
          {
            id: "staff-k1-6",
            lineCount: 5,
            defaultClef: { sign: "G", line: 2 },
          },
        ],
        measureContents: [
          measureContent(
            "measure-k1-6-1",
            "voice-k1-6-1",
            [
              "event-k1-6-1-1",
              "event-k1-6-1-2",
              "event-k1-6-1-3",
              "event-k1-6-1-4",
            ],
            "note-k1-6-1-1",
            { step: "C", alter: 0, octave: 4 },
          ),
          measureContent(
            "measure-k1-6-2",
            "voice-k1-6-2",
            [
              "event-k1-6-2-1",
              "event-k1-6-2-2",
              "event-k1-6-2-3",
              "event-k1-6-2-4",
            ],
            "note-k1-6-2-1",
            { step: "D", alter: 0, octave: 4 },
          ),
          measureContent(
            "measure-k1-6-3",
            "voice-k1-6-3",
            [
              "event-k1-6-3-1",
              "event-k1-6-3-2",
              "event-k1-6-3-3",
              "event-k1-6-3-4",
            ],
            "note-k1-6-3-1",
            { step: "E", alter: 0, octave: 4 },
          ),
          measureContent(
            "measure-k1-6-4",
            "voice-k1-6-4",
            [
              "event-k1-6-4-1",
              "event-k1-6-4-2",
              "event-k1-6-4-3",
              "event-k1-6-4-4",
            ],
            "note-k1-6-4-1",
            { step: "F", alter: 0, octave: 4 },
          ),
        ],
      },
    ],
    extensions: [
      {
        namespace: "example.k1-6.score",
        schemaVersion: 7,
        owner: { kind: "score" },
        payload: {
          label: "preserve-score-extension",
          nested: { flags: [true, false], count: 4 },
        },
      },
      {
        namespace: "example.k1-6.part",
        schemaVersion: 3,
        owner: { kind: "part", partId: "part-k1-6" },
        payload: {
          label: "preserve-part-extension",
          annotations: [{ kind: "opaque", values: [1, 2, 3] }],
        },
      },
    ],
  };
}

export function cloneK1_6ScoreFixture(): ScoreDocument {
  return structuredClone(createK1_6ScoreFixture());
}
