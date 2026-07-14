import type { ScoreDocument } from "../../../src/core-kernel/index";

export function createCoreScoreFixture(): ScoreDocument {
  return {
    schemaVersion: "brilliant-score-1",
    id: "score-1",
    metadata: {
      title: "Core fixture",
      authors: ["Brilliant Guitar"],
      tempo: { bpm: 120 },
    },
    measureDefinitions: [
      { id: "measure-1", meter: { numerator: 4, denominator: 4 } },
    ],
    parts: [
      {
        id: "part-1",
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
            id: "staff-1",
            lineCount: 5,
            defaultClef: { sign: "G", line: 2 },
          },
        ],
        measureContents: [
          {
            measureId: "measure-1",
            voices: [
              {
                id: "voice-1",
                defaultStaffId: "staff-1",
                sequence: {
                  start: { numerator: 0, denominator: 1 },
                  events: [
                    {
                      id: "event-1",
                      duration: { base: 4, dots: 0 },
                      content: {
                        kind: "notes",
                        notes: [
                          {
                            id: "note-1",
                            writtenPitch: { step: "C", alter: 0, octave: 4 },
                          },
                        ],
                      },
                    },
                    {
                      id: "event-2",
                      duration: { base: 4, dots: 0 },
                      content: { kind: "rest" },
                    },
                    {
                      id: "event-3",
                      duration: { base: 4, dots: 0 },
                      content: { kind: "rest" },
                    },
                    {
                      id: "event-4",
                      duration: { base: 4, dots: 0 },
                      content: { kind: "rest" },
                    },
                  ],
                },
              },
            ],
          },
        ],
      },
    ],
    extensions: [],
  };
}

export function cloneCoreScoreFixture(): ScoreDocument {
  return structuredClone(createCoreScoreFixture());
}
