import type {
  Part,
  PartMeasureContent,
  ScoreDocument,
  Voice,
} from "../../../src/core-kernel/index";

export const CVN4_DOCUMENT_ID = "cvn4-score";
export const CVN4_MEASURE_IDS = ["cvn4-measure-1", "cvn4-measure-2", "cvn4-measure-3"] as const;
export const CVN4_PART_IDS = ["cvn4-part-a", "cvn4-part-b", "cvn4-part-c"] as const;

function restVoice(id: string, defaultStaffId: string): Voice {
  return {
    id,
    defaultStaffId,
    sequence: {
      start: { numerator: 0, denominator: 1 },
      events: [
        {
          id: `${id}-event`,
          duration: { base: 4, dots: 0 },
          content: { kind: "rest" },
        },
      ],
    },
  };
}

function primaryPartAContent(measureId: string): PartMeasureContent {
  if (measureId !== "cvn4-measure-1") {
    return {
      measureId,
      voices: [restVoice(`cvn4-a-${measureId}`, "cvn4-staff-a-1")],
    };
  }
  return {
    measureId,
    voices: [
      {
        id: "cvn4-voice-a-1-primary",
        defaultStaffId: "cvn4-staff-a-1",
        sequence: {
          start: { numerator: 0, denominator: 1 },
          events: [
            {
              id: "cvn4-event-a-1-notes",
              duration: { base: 4, dots: 0 },
              staffId: "cvn4-staff-a-2",
              content: {
                kind: "notes",
                notes: [
                  {
                    id: "cvn4-note-a-1",
                    writtenPitch: { step: "C", alter: 0, octave: 4 },
                  },
                ],
              },
            },
            {
              id: "cvn4-event-a-1-rest",
              duration: { base: 4, dots: 0 },
              content: { kind: "rest" },
            },
          ],
        },
      },
      restVoice("cvn4-voice-a-1-secondary", "cvn4-staff-a-1"),
    ],
  };
}

function simplePart(
  id: string,
  name: string,
  staffId: string,
  measureOrder: readonly string[],
): Part {
  return {
    id,
    name,
    instrument: {
      name: "Piano",
      writtenToSounding: { diatonicSteps: 0, chromaticSemitones: 0 },
    },
    staves: [
      { id: staffId, lineCount: 5, defaultClef: { sign: "G", line: 2 } },
    ],
    measureContents: measureOrder.map((measureId) => ({
      measureId,
      voices: [restVoice(`${id}-${measureId}-voice`, staffId)],
    })),
  };
}

export function createCvn4InsertedPart(
  id = "cvn4-part-inserted",
): Part {
  const staffId = `${id}-staff`;
  const contents = [
    "cvn4-measure-3",
    "cvn4-measure-1",
    "cvn4-measure-2",
  ].map((measureId) => ({
    measureId,
    voices: [restVoice(`${id}-${measureId}-voice`, staffId)],
  }));
  return {
    id,
    name: "Inserted Part",
    instrument: {
      name: "Violin",
      writtenToSounding: { diatonicSteps: 0, chromaticSemitones: 0 },
    },
    staves: [
      { id: staffId, lineCount: 5, defaultClef: { sign: "G", line: 2 } },
    ],
    measureContents: contents,
  };
}

export function createCvn4InsertedVoice(
  id = "cvn4-voice-inserted",
  staffId = "cvn4-staff-a-1",
): Voice {
  return {
    id,
    defaultStaffId: staffId,
    sequence: {
      start: { numerator: 0, denominator: 1 },
      events: [
        {
          id: `${id}-event`,
          duration: { base: 4, dots: 0 },
          content: { kind: "rest" },
        },
      ],
    },
  };
}

export function createCvn4ScoreFixture(): ScoreDocument {
  return {
    schemaVersion: "brilliant-score-1",
    id: CVN4_DOCUMENT_ID,
    metadata: {
      title: "CVN-4 hierarchy fixture",
      authors: ["Brilliant Guitar"],
      tempo: { bpm: 112 },
    },
    measureDefinitions: CVN4_MEASURE_IDS.map((id) => ({
      id,
      meter: { numerator: 4, denominator: 4 },
    })),
    parts: [
      {
        id: "cvn4-part-a",
        name: "Part A",
        instrument: {
          name: "Piano",
          writtenToSounding: { diatonicSteps: 0, chromaticSemitones: 0 },
        },
        staves: [
          {
            id: "cvn4-staff-a-1",
            lineCount: 5,
            defaultClef: { sign: "G", line: 2 },
          },
          {
            id: "cvn4-staff-a-2",
            lineCount: 5,
            defaultClef: { sign: "F", line: 4 },
          },
        ],
        measureContents: CVN4_MEASURE_IDS.map(primaryPartAContent),
      },
      simplePart(
        "cvn4-part-b",
        "Part B",
        "cvn4-staff-b-1",
        ["cvn4-measure-3", "cvn4-measure-1", "cvn4-measure-2"],
      ),
      simplePart(
        "cvn4-part-c",
        "Part C",
        "cvn4-staff-c-1",
        CVN4_MEASURE_IDS,
      ),
    ],
    extensions: [
      {
        namespace: "org.score",
        schemaVersion: 1,
        owner: { kind: "score" },
        payload: { retained: "score" },
      },
      {
        namespace: "org.part-a-one",
        schemaVersion: 1,
        owner: { kind: "part", partId: "cvn4-part-a" },
        payload: { retained: "part-a-one" },
      },
      {
        namespace: "org.part-b",
        schemaVersion: 1,
        owner: { kind: "part", partId: "cvn4-part-b" },
        payload: { retained: "part-b" },
      },
      {
        namespace: "org.part-a-two",
        schemaVersion: 1,
        owner: { kind: "part", partId: "cvn4-part-a" },
        payload: { retained: "part-a-two" },
      },
      {
        namespace: "org.part-c",
        schemaVersion: 1,
        owner: { kind: "part", partId: "cvn4-part-c" },
        payload: { retained: "part-c" },
      },
    ],
  };
}

export function cloneCvn4ScoreFixture(): ScoreDocument {
  return structuredClone(createCvn4ScoreFixture());
}
