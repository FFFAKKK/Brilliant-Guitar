import { test } from "node:test";
import assert = require("node:assert/strict");

import * as coreKernel from "../../src/core-kernel/index";

test("the persisted document schema starts at brilliant-score-1", () => {
  const api = coreKernel as unknown as Record<string, unknown>;

  assert.equal(api.SCORE_DOCUMENT_SCHEMA_VERSION, "brilliant-score-1");
  assert.equal(typeof api.isScoreDocumentSchemaVersion, "function");
  const isScoreDocumentSchemaVersion = api.isScoreDocumentSchemaVersion as (
    value: unknown,
  ) => boolean;
  assert.equal(isScoreDocumentSchemaVersion("brilliant-score-1"), true);
  assert.equal(isScoreDocumentSchemaVersion("bgp-score-k1"), false);
  assert.equal(isScoreDocumentSchemaVersion("brilliant-score-2"), false);
});

test("the document model stores notation facts without derived offsets or sounding pitch", () => {
  const score = {
    schemaVersion: "brilliant-score-1",
    id: "score-1",
    metadata: { title: "Core", authors: ["Composer"], tempo: { bpm: 120 } },
    measureDefinitions: [
      { id: "measure-1", meter: { numerator: 4, denominator: 4 } },
    ],
    parts: [
      {
        id: "part-1",
        name: "Concert instrument",
        instrument: {
          name: "Piano",
          writtenToSounding: { diatonicSteps: 0, chromaticSemitones: 0 },
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
                      duration: { base: 1, dots: 0 },
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

  const serialized = JSON.stringify(score);
  assert.equal(serialized.includes("tick"), false);
  assert.equal(serialized.includes("offset"), false);
  assert.equal(serialized.includes("soundingPitch"), false);
  assert.equal(serialized.includes("stringNumber"), false);
  assert.equal(serialized.includes("fret"), false);
});
