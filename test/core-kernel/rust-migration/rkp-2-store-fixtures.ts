import type { ScoreDocument } from "../../../src/core-kernel/index";
import { createCoreScoreFixture } from "../fixtures/core-score";

export interface Rkp2StoreFixture {
  readonly fixtureId:
    | "minimal-score-v1"
    | "part-owner-extensions-v1"
    | "topology-optionals-v1";
  readonly document: ScoreDocument;
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
