import type {
  ExtensionBlock,
  Part,
  RhythmicEvent,
  ScoreDocument,
  WrittenPitch,
} from "../../../src/core-kernel/index";
import type {
  QualificationEntityCountsV1,
  QualificationFixtureKind,
  QualificationFixtureProvenanceV1,
} from "../qualification/cvn-7-qualification-contracts";

export const CVN7_FIXTURE_GENERATOR_VERSION = 1 as const;

export const CVN7_FIXTURE_SEEDS = Object.freeze({
  representative: "cvn7-representative-v1",
  stress: "cvn7-stress-v1",
} satisfies Readonly<Record<QualificationFixtureKind, string>>);

export const CVN7_C4: WrittenPitch = Object.freeze({
  step: "C",
  alter: 0,
  octave: 4,
});

export const CVN7_D4: WrittenPitch = Object.freeze({
  step: "D",
  alter: 0,
  octave: 4,
});

export interface Cvn7QualificationScoreInput {
  readonly fixtureKind: QualificationFixtureKind;
  readonly generatorVersion: 1;
  readonly seed: string;
}

export interface Cvn7CanonicalNoteReference {
  readonly partId: string;
  readonly measureId: string;
  readonly voiceId: string;
  readonly eventId: string;
  readonly noteId: string;
}

export interface Cvn7QualificationScoreFixture {
  readonly provenance: QualificationFixtureProvenanceV1;
  readonly document: ScoreDocument;
  readonly counts: QualificationEntityCountsV1;
  readonly canonicalNotes: readonly Cvn7CanonicalNoteReference[];
  readonly firstNote: Cvn7CanonicalNoteReference;
  readonly lastNote: Cvn7CanonicalNoteReference;
  readonly firstPartId: string;
  readonly lastPartId: string;
}

interface FixtureDimensions {
  readonly measures: number;
  readonly parts: number;
}

const DIMENSIONS = Object.freeze({
  representative: Object.freeze({ measures: 200, parts: 8 }),
  stress: Object.freeze({ measures: 400, parts: 16 }),
} satisfies Readonly<Record<QualificationFixtureKind, FixtureDimensions>>);

function pad(value: number, width: number): string {
  return String(value).padStart(width, "0");
}

function measureId(measureIndex: number): string {
  return `cvn7-m-${pad(measureIndex, 4)}`;
}

function partId(partIndex: number): string {
  return `cvn7-p-${pad(partIndex, 2)}`;
}

function staffId(partIndex: number): string {
  return `cvn7-s-${pad(partIndex, 2)}`;
}

function voiceId(
  partIndex: number,
  measureIndex: number,
  voiceIndex: number,
): string {
  return `cvn7-v-${pad(partIndex, 2)}-${pad(measureIndex, 4)}-${voiceIndex}`;
}

function eventId(
  partIndex: number,
  measureIndex: number,
  voiceIndex: number,
  eventIndex: number,
): string {
  return `cvn7-e-${pad(partIndex, 2)}-${pad(measureIndex, 4)}-${voiceIndex}-${eventIndex}`;
}

function noteId(
  partIndex: number,
  measureIndex: number,
  voiceIndex: number,
  eventIndex: number,
): string {
  return `cvn7-n-${pad(partIndex, 2)}-${pad(measureIndex, 4)}-${voiceIndex}-${eventIndex}`;
}

function decodeInput(input: unknown): Cvn7QualificationScoreInput {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError("CVN-7 fixture input must be an exact data object");
  }
  const expectedKeys = ["fixtureKind", "generatorVersion", "seed"] as const;
  let keys: readonly PropertyKey[];
  try {
    keys = Reflect.ownKeys(input);
  } catch {
    throw new TypeError("CVN-7 fixture input is unreadable");
  }
  if (
    keys.length !== expectedKeys.length ||
    keys.some(
      (key) => typeof key !== "string" || !expectedKeys.includes(key as never),
    )
  ) {
    throw new TypeError("CVN-7 fixture input keys are not exact");
  }
  const fields: Record<string, unknown> = {};
  for (const key of expectedKeys) {
    let descriptor: PropertyDescriptor | undefined;
    try {
      descriptor = Reflect.getOwnPropertyDescriptor(input, key);
    } catch {
      throw new TypeError("CVN-7 fixture input is unreadable");
    }
    if (descriptor === undefined || !("value" in descriptor)) {
      throw new TypeError("CVN-7 fixture input fields must be own data properties");
    }
    fields[key] = descriptor.value;
  }
  const value = fields as Partial<Cvn7QualificationScoreInput>;
  if (
    (value.fixtureKind !== "representative" && value.fixtureKind !== "stress") ||
    value.generatorVersion !== CVN7_FIXTURE_GENERATOR_VERSION ||
    value.seed !== CVN7_FIXTURE_SEEDS[value.fixtureKind]
  ) {
    throw new TypeError("CVN-7 fixture identity is invalid");
  }
  return value as Cvn7QualificationScoreInput;
}

function createEvents(
  partIndex: number,
  measureIndex: number,
  voiceIndex: number,
  canonicalNotes: Cvn7CanonicalNoteReference[],
): readonly RhythmicEvent[] {
  const events: RhythmicEvent[] = [];
  for (let eventIndex = 0; eventIndex < 8; eventIndex += 1) {
    const currentEventId = eventId(
      partIndex,
      measureIndex,
      voiceIndex,
      eventIndex,
    );
    if (eventIndex % 2 === 0) {
      const currentNoteId = noteId(
        partIndex,
        measureIndex,
        voiceIndex,
        eventIndex,
      );
      canonicalNotes.push({
        partId: partId(partIndex),
        measureId: measureId(measureIndex),
        voiceId: voiceId(partIndex, measureIndex, voiceIndex),
        eventId: currentEventId,
        noteId: currentNoteId,
      });
      events.push({
        id: currentEventId,
        duration: { base: 8, dots: 0 },
        content: {
          kind: "notes",
          notes: [{ id: currentNoteId, writtenPitch: CVN7_C4 }],
        },
      });
    } else {
      events.push({
        id: currentEventId,
        duration: { base: 8, dots: 0 },
        content: { kind: "rest" },
      });
    }
  }
  return events;
}

function createPart(
  partIndex: number,
  dimensions: FixtureDimensions,
  canonicalNotes: Cvn7CanonicalNoteReference[],
): Part {
  const currentPartId = partId(partIndex);
  const currentStaffId = staffId(partIndex);
  return {
    id: currentPartId,
    name: `CVN-7 Part ${pad(partIndex, 2)}`,
    instrument: {
      name: "Concert instrument",
      writtenToSounding: { diatonicSteps: 0, chromaticSemitones: 0 },
    },
    staves: [
      {
        id: currentStaffId,
        lineCount: 5,
        defaultClef: { sign: "G", line: 2 },
      },
    ],
    measureContents: Array.from(
      { length: dimensions.measures },
      (_, measureIndex) => ({
        measureId: measureId(measureIndex),
        voices: [0, 1].map((voiceIndex) => ({
          id: voiceId(partIndex, measureIndex, voiceIndex),
          defaultStaffId: currentStaffId,
          sequence: {
            start: { numerator: 0, denominator: 1 },
            events: createEvents(
              partIndex,
              measureIndex,
              voiceIndex,
              canonicalNotes,
            ),
          },
        })),
      }),
    ),
  };
}

function createExtensions(
  kind: QualificationFixtureKind,
  parts: readonly Part[],
): readonly ExtensionBlock[] {
  return [
    {
      namespace: "fixture.cvn7.score",
      schemaVersion: 1,
      owner: { kind: "score" },
      payload: { marker: `score-${kind}`, generatorVersion: 1 },
    },
    ...parts.map((part) => ({
      namespace: "fixture.cvn7.part",
      schemaVersion: 1,
      owner: { kind: "part" as const, partId: part.id },
      payload: { marker: `part-${part.id}-${kind}`, generatorVersion: 1 },
    })),
    {
      namespace: "fixture.cvn7.unknown",
      schemaVersion: 7,
      owner: { kind: "score" },
      payload: {
        marker: `opaque-${kind}`,
        lossless: { nested: [null, true, 7, kind] },
      },
    },
  ];
}

function expectedCounts(
  dimensions: FixtureDimensions,
): QualificationEntityCountsV1 {
  const measureContents = dimensions.measures * dimensions.parts;
  const voices = measureContents * 2;
  const events = voices * 8;
  return {
    measures: dimensions.measures,
    parts: dimensions.parts,
    staves: dimensions.parts,
    measureContents,
    voices,
    events,
    notes: events / 2,
    knownExtensionBlocks: dimensions.parts + 1,
    unknownExtensionBlocks: 1,
  };
}

export function createCvn7QualificationScore(
  input: unknown,
): Cvn7QualificationScoreFixture {
  const accepted = decodeInput(input);
  const dimensions = DIMENSIONS[accepted.fixtureKind];
  const canonicalNotes: Cvn7CanonicalNoteReference[] = [];
  const parts = Array.from({ length: dimensions.parts }, (_, partIndex) =>
    createPart(partIndex, dimensions, canonicalNotes),
  );
  const document: ScoreDocument = {
    schemaVersion: "brilliant-score-1",
    id: `cvn7-${accepted.fixtureKind}-score`,
    metadata: {
      title: `CVN-7 ${accepted.fixtureKind} qualification score`,
      authors: ["Brilliant Guitar Qualification"],
      tempo: { bpm: 120 },
    },
    measureDefinitions: Array.from(
      { length: dimensions.measures },
      (_, measureIndex) => ({
        id: measureId(measureIndex),
        meter: { numerator: 4, denominator: 4 },
      }),
    ),
    parts,
    extensions: createExtensions(accepted.fixtureKind, parts),
  };

  const firstNote = canonicalNotes[0];
  const lastNote = canonicalNotes[canonicalNotes.length - 1];
  const firstPart = parts[0];
  const lastPart = parts[parts.length - 1];
  if (
    firstNote === undefined ||
    lastNote === undefined ||
    firstPart === undefined ||
    lastPart === undefined
  ) {
    throw new Error("CVN-7 fixture construction produced an empty dimension");
  }

  return {
    provenance: {
      generatorVersion: CVN7_FIXTURE_GENERATOR_VERSION,
      fixtureKind: accepted.fixtureKind,
      seed: accepted.seed,
    },
    document,
    counts: expectedCounts(dimensions),
    canonicalNotes,
    firstNote,
    lastNote,
    firstPartId: firstPart.id,
    lastPartId: lastPart.id,
  };
}

export function createRepresentativeCvn7Score(): Cvn7QualificationScoreFixture {
  return createCvn7QualificationScore({
    fixtureKind: "representative",
    generatorVersion: 1,
    seed: CVN7_FIXTURE_SEEDS.representative,
  });
}

export function createStressCvn7Score(): Cvn7QualificationScoreFixture {
  return createCvn7QualificationScore({
    fixtureKind: "stress",
    generatorVersion: 1,
    seed: CVN7_FIXTURE_SEEDS.stress,
  });
}

export function createCvn7RepresentativeHistoryWorkload(
  fixture: Cvn7QualificationScoreFixture,
): readonly unknown[] {
  if (fixture.provenance.fixtureKind !== "representative") {
    throw new TypeError("CVN-7 long history requires the representative fixture");
  }
  return Object.freeze(Array.from({ length: 2_000 }, (_, index) => Object.freeze({
    commandVersion: 1 as const,
    commandId: "core.note.set-written-pitch" as const,
    target: Object.freeze({
      kind: "note" as const,
      noteId: fixture.firstNote.noteId,
    }),
    payload: Object.freeze({
      writtenPitch: index % 2 === 0 ? CVN7_D4 : CVN7_C4,
    }),
  })));
}
