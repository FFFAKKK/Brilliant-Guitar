import type {
  CreateScoreDocumentInputV1,
  InitialPartV1,
  PartMeasureContent,
  ScoreDocument,
  Voice,
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

function createMeasureVoices(partId: string, measureId: string): readonly [Voice] {
  const prefix = `${partId}-${measureId}`;
  return [
    {
      id: `${prefix}-voice`,
      defaultStaffId: `${partId}-staff`,
      sequence: {
        start: { numerator: 0, denominator: 1 },
        events: [1, 2, 3, 4].map((eventIndex) => ({
          id: `${prefix}-event-${eventIndex}`,
          duration: { base: 4, dots: 0 },
          content: { kind: "rest" as const },
        })),
      },
    },
  ];
}

function createMeasureContents(
  partId: string,
  measureIds: readonly string[],
): readonly PartMeasureContent[] {
  return measureIds.map((measureId) => ({
    measureId,
    voices: createMeasureVoices(partId, measureId),
  }));
}

function createMeasurePart(
  partId: string,
  name: string,
  measureIds: readonly string[],
): ScoreDocument["parts"][number] {
  return {
    id: partId,
    name,
    instrument: {
      name: "Piano",
      writtenToSounding: { diatonicSteps: 0, chromaticSemitones: 0 },
    },
    staves: [
      {
        id: `${partId}-staff`,
        lineCount: 5,
        defaultClef: { sign: "G", line: 2 },
      },
    ],
    measureContents: createMeasureContents(partId, measureIds),
  };
}

export function createCvn3MeasureFixture(): ScoreDocument {
  const measureIds = [
    "cvn3-measure-1",
    "cvn3-measure-2",
    "cvn3-measure-3",
  ] as const;
  const firstPartId = "cvn3-part-a";
  const secondPartId = "cvn3-part-b";
  return {
    schemaVersion: "brilliant-score-1",
    id: "cvn3-measure-score",
    metadata: {
      title: "CVN-3 Measure fixture",
      authors: ["Brilliant Guitar"],
      tempo: { bpm: 108 },
    },
    measureDefinitions: measureIds.map((id) => ({
      id,
      meter: { numerator: 4, denominator: 4 },
    })),
    parts: [
      createMeasurePart(firstPartId, "CVN-3 Piano A", measureIds),
      createMeasurePart(secondPartId, "CVN-3 Piano B", measureIds),
    ],
    extensions: [
      {
        namespace: "com.example.cvn3-score",
        schemaVersion: 1,
        owner: { kind: "score" },
        payload: { retained: { scores: ["cvn3", "measure"] } },
      },
      {
        namespace: "com.example.cvn3-part-a",
        schemaVersion: 1,
        owner: { kind: "part", partId: firstPartId },
        payload: { retained: { part: "a" } },
      },
      {
        namespace: "com.example.cvn3-part-b",
        schemaVersion: 1,
        owner: { kind: "part", partId: secondPartId },
        payload: { retained: { part: "b" } },
      },
    ],
  };
}

export function cloneCvn3MeasureFixture(): ScoreDocument {
  return structuredClone(createCvn3MeasureFixture());
}

export function createCvn3ShuffledMeasureFixture(): ScoreDocument {
  const fixture = cloneCvn3MeasureFixture();
  const orders = [
    ["cvn3-measure-2", "cvn3-measure-1", "cvn3-measure-3"],
    ["cvn3-measure-3", "cvn3-measure-1", "cvn3-measure-2"],
  ] as const;
  fixture.parts.forEach((part, partIndex) => {
    const order = orders[partIndex];
    if (order === undefined) {
      throw new Error("missing shuffled CVN-3 part order");
    }
    const byMeasureId = new Map(
      part.measureContents.map((content) => [content.measureId, content]),
    );
    const reordered = order.map((measureId) => byMeasureId.get(measureId));
    if (reordered.some((content) => content === undefined)) {
      throw new Error("missing shuffled CVN-3 measure content");
    }
    (part.measureContents as PartMeasureContent[]).splice(
      0,
      part.measureContents.length,
      ...(reordered as PartMeasureContent[]),
    );
  });
  return fixture;
}

export function createCvn3InsertedVoices(
  partId: string,
  measureId: string,
): readonly [Voice] {
  return structuredClone(createMeasureVoices(partId, measureId));
}
