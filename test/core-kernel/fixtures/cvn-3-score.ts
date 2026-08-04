import type {
  CreateScoreDocumentInputV1,
  InitialPartV1,
} from "../../../src/core-kernel/index";

function createQuarterRests(prefix: string): InitialPartV1["voices"][number]["sequence"] {
  return {
    start: { numerator: 0, denominator: 1 },
    events: [
      {
        id: `${prefix}-event-1`,
        duration: { base: 4, dots: 0 },
        content: { kind: "rest" },
      },
      {
        id: `${prefix}-event-2`,
        duration: { base: 4, dots: 0 },
        content: { kind: "rest" },
      },
      {
        id: `${prefix}-event-3`,
        duration: { base: 4, dots: 0 },
        content: { kind: "rest" },
      },
      {
        id: `${prefix}-event-4`,
        duration: { base: 4, dots: 0 },
        content: { kind: "rest" },
      },
    ],
  };
}

function createInitialPart(prefix: string, name: string): InitialPartV1 {
  return {
    id: `${prefix}-part`,
    name,
    instrument: {
      name: "Piano",
      writtenToSounding: { diatonicSteps: 0, chromaticSemitones: 0 },
    },
    staves: [
      {
        id: `${prefix}-staff`,
        lineCount: 5,
        defaultClef: { sign: "G", line: 2 },
      },
    ],
    voices: [
      {
        id: `${prefix}-voice`,
        defaultStaffId: `${prefix}-staff`,
        sequence: createQuarterRests(prefix),
      },
    ],
  };
}

export function createCvn3FactoryInput(): CreateScoreDocumentInputV1 {
  return {
    factoryVersion: 1,
    documentId: "factory-score",
    metadata: {
      title: "Factory score",
      authors: ["Brilliant Guitar"],
      tempo: { bpm: 120 },
    },
    initialMeasure: {
      id: "factory-measure",
      meter: { numerator: 4, denominator: 4 },
    },
    initialParts: [createInitialPart("factory", "Factory Piano")],
    extensions: [],
  };
}

export function createCvn3UnsupportedMultiPartInput(): CreateScoreDocumentInputV1 {
  const input = createCvn3FactoryInput();
  return {
    ...input,
    initialParts: [
      input.initialParts[0],
      createInitialPart("secondary", "Secondary Piano"),
    ],
  };
}

export function cloneCvn3FactoryInput(): CreateScoreDocumentInputV1 {
  return structuredClone(createCvn3FactoryInput());
}
