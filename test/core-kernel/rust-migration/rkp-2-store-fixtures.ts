import type { ScoreDocument } from "../../../src/core-kernel/index";
import { createCoreScoreFixture } from "../fixtures/core-score";

export interface Rkp2StoreFixture {
  readonly fixtureId:
    | "minimal-score-v1"
    | "part-owner-extensions-v1"
    | "topology-optionals-v1";
  readonly document: ScoreDocument;
}

export interface Rkp2RejectedStoreFixture {
  readonly fixtureId:
    | "wrong-schema-v1"
    | "wrong-shape-v1"
    | "wrong-value-v1"
    | "wrong-reference-v1";
  readonly document: unknown;
  readonly failure: Readonly<Record<string, unknown>>;
}

export const RKP2_REQUEST_BYTE_LIMIT = 64 * 1024 * 1024;

export function createPaddedRkp2CreateRequest(
  document: unknown,
  byteLength: number,
): Buffer {
  const canonical = Buffer.from(
    JSON.stringify({ apiVersion: 1, document }),
    "utf8",
  );
  if (!Number.isSafeInteger(byteLength) || byteLength < canonical.length) {
    throw new RangeError("requested byte length cannot contain canonical request");
  }
  const request = Buffer.alloc(byteLength, 0x20);
  canonical.copy(request);
  return request;
}

export function createRejectedRkp2StoreFixtureCatalog(): readonly Rkp2RejectedStoreFixture[] {
  const wrongSchema = structuredClone(createMinimalRkp2StoreFixture().document) as unknown as {
    schemaVersion: string;
  };
  wrongSchema.schemaVersion = "future-score";

  const wrongShape = structuredClone(createMinimalRkp2StoreFixture().document) as unknown as {
    metadata: { title?: string };
  };
  delete wrongShape.metadata.title;

  const wrongValue = structuredClone(
    createMinimalRkp2StoreFixture().document,
  ) as unknown as { metadata: { tempo: { bpm: number } } };
  wrongValue.metadata.tempo.bpm = 0;

  const wrongReference = createRkp2MissingStaffReferenceFixture();

  return [
    {
      fixtureId: "wrong-schema-v1",
      document: wrongSchema,
      failure: {
        failureVersion: 1,
        code: "score.unsupported-schema",
        supportedSchema: "brilliant-score-1",
      },
    },
    {
      fixtureId: "wrong-shape-v1",
      document: wrongShape,
      failure: {
        failureVersion: 1,
        code: "codec.invalid-shape",
        path: ["document", "metadata", "title"],
        violation: "missing-field",
      },
    },
    {
      fixtureId: "wrong-value-v1",
      document: wrongValue,
      failure: {
        failureVersion: 1,
        code: "score.invalid-structure",
        path: ["metadata", "tempo", "bpm"],
        violation: "invalid-value",
      },
    },
    {
      fixtureId: "wrong-reference-v1",
      document: wrongReference,
      failure: {
        failureVersion: 1,
        code: "score.invalid-structure",
        path: [
          "parts",
          0,
          "measureContents",
          0,
          "voices",
          0,
          "defaultStaffId",
        ],
        violation: "invalid-reference",
      },
    },
  ];
}

export function createPartOwnerExtensionRkp2StoreFixture(): Rkp2StoreFixture {
  const source = createTopologyOptionalRkp2StoreFixture().document;
  const document: ScoreDocument = {
    ...source,
    id: "score-rkp2-part-owner",
    extensions: [
      {
        namespace: "unknown.example.score-owner",
        schemaVersion: 3,
        owner: { kind: "score" },
        payload: {
          order: ["score-first", { nested: [true, null, 7] }],
        },
      },
      {
        namespace: "unknown.example.part-owner",
        schemaVersion: 5,
        owner: { kind: "part", partId: "part-z" },
        payload: {
          order: ["part-second", { nested: [false, { value: "kept" }] }],
        },
      },
    ],
  };
  return {
    fixtureId: "part-owner-extensions-v1",
    document,
  };
}

export function createMinimalRkp2StoreFixture(): Rkp2StoreFixture {
  return {
    fixtureId: "minimal-score-v1",
    document: createCoreScoreFixture(),
  };
}

export function createTopologyOptionalRkp2StoreFixture(): Rkp2StoreFixture {
  return {
    fixtureId: "topology-optionals-v1",
    document: {
      schemaVersion: "brilliant-score-1",
      id: "score-rkp2-topology",
      metadata: {
        title: "Topology and optionals",
        authors: ["Brilliant Guitar", "RKP-2"],
        tempo: { bpm: 96 },
      },
      measureDefinitions: [
        { id: "measure-z", meter: { numerator: 4, denominator: 4 } },
        {
          id: "measure-a",
          meter: { numerator: 4, denominator: 4 },
          pickupDuration: { numerator: 1, denominator: 1 },
        },
      ],
      parts: [
        {
          id: "part-z",
          name: "Canonical-order instrument",
          instrument: {
            name: "Piano",
            writtenToSounding: {
              diatonicSteps: 0,
              chromaticSemitones: 0,
            },
          },
          staves: [
            {
              id: "staff-z",
              lineCount: 5,
              defaultClef: { sign: "G", line: 2 },
            },
            {
              id: "staff-a",
              lineCount: 5,
              defaultClef: { sign: "F", line: 4 },
            },
          ],
          measureContents: [
            {
              measureId: "measure-a",
              voices: [
                {
                  id: "voice-a",
                  defaultStaffId: "staff-a",
                  sequence: {
                    start: { numerator: 0, denominator: 1 },
                    events: [
                      {
                        id: "event-a",
                        duration: {
                          base: 1,
                          dots: 0,
                          timeModification: {
                            actualNotes: 1,
                            normalNotes: 1,
                          },
                        },
                        staffId: "staff-a",
                        content: {
                          kind: "notes",
                          notes: [
                            {
                              id: "note-a",
                              writtenPitch: {
                                step: "C",
                                alter: 0,
                                octave: 4,
                              },
                            },
                          ],
                        },
                      },
                    ],
                  },
                },
              ],
            },
            {
              measureId: "measure-z",
              voices: [
                {
                  id: "voice-z",
                  defaultStaffId: "staff-z",
                  sequence: {
                    start: { numerator: 0, denominator: 1 },
                    events: [
                      {
                        id: "event-z",
                        duration: { base: 1, dots: 0 },
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
      extensions: [
        {
          namespace: "unknown.example.score",
          schemaVersion: 7,
          owner: { kind: "score" },
          payload: {
            a: [true, null, { nested: "preserved" }],
            z: 1,
          },
        },
      ],
    },
  };
}

export function createRkp2DuplicateIdFixture(): ScoreDocument {
  const document = structuredClone(createCoreScoreFixture());
  const event = document.parts[0]?.measureContents[0]?.voices[0]?.sequence.events[0];
  if (event === undefined) {
    throw new Error("minimal fixture must contain one event");
  }
  (event as { id: string }).id = document.id;
  return document;
}

export function createRkp2MissingStaffReferenceFixture(): ScoreDocument {
  const document = structuredClone(createCoreScoreFixture());
  const voice = document.parts[0]?.measureContents[0]?.voices[0];
  if (voice === undefined) {
    throw new Error("minimal fixture must contain one voice");
  }
  (voice as { defaultStaffId: string }).defaultStaffId = "missing-staff";
  return document;
}

export function createRkp2StoreFixtureCatalog(): readonly Rkp2StoreFixture[] {
  return [createMinimalRkp2StoreFixture()];
}
