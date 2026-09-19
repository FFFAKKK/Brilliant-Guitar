import assert = require("node:assert/strict");
import { test } from "node:test";

import { CommandBus, type ScoreDocument } from "../../src/core-kernel/index";
import {
  defineFrettedInstrumentDomainV1,
  type FrettedTechniqueAdapterV1,
} from "../../src/instrument-sdk/fretted-instrument-domain";
import { createCoreScoreFixture } from "./fixtures/core-score";

type NoTechnique = { readonly id: string; readonly kind: "unused" };

const noTechniques: FrettedTechniqueAdapterV1<NoTechnique> = {
  decode: () => undefined,
  encode: (value) => ({ id: value.id, kind: value.kind }),
  equals: (left, right) => left.id === right.id,
  targetNoteIds: () => [],
  validate: () => undefined,
  validateCollection: () => undefined,
};

const bassDomain = defineFrettedInstrumentDomainV1<NoTechnique>({
  id: "test.instrument.bass",
  displayName: "Bass fixture",
  schemaVersion: 1,
  stringCount: 4,
  fretCount: 21,
  capoFret: 0,
  tuning: [
    { stringNumber: 1, soundingPitch: { step: "G", alter: 0, octave: 2 } },
    { stringNumber: 2, soundingPitch: { step: "D", alter: 0, octave: 2 } },
    { stringNumber: 3, soundingPitch: { step: "A", alter: 0, octave: 1 } },
    { stringNumber: 4, soundingPitch: { step: "E", alter: 0, octave: 1 } },
  ],
  writtenPitchOffsetSemitones: 12,
  supportsChords: false,
  matchesInstrument: (instrument) => instrument.name === "Bass",
  techniques: noTechniques,
});

function bassScore(): ScoreDocument {
  const base = createCoreScoreFixture();
  const part = base.parts[0]!;
  return {
    ...base,
    parts: [{
      ...part,
      name: "Bass",
      instrument: {
        name: "Bass",
        writtenToSounding: { diatonicSteps: -7, chromaticSemitones: -12 },
      },
    }],
  };
}

test("the fretted family factory builds a four-string module without Guitar branches", () => {
  const compiled = bassDomain.compileCatalog();
  assert.equal(compiled.ok, true);
  if (!compiled.ok) assert.fail("expected the Bass fixture catalog to compile");
  const created = CommandBus.createIntegrated(bassScore(), compiled.catalog);
  assert.equal(created.ok, true);
  if (!created.ok) assert.fail("expected the Bass fixture session to open");

  assert.equal(created.value.submit({
    commandVersion: 1,
    commandId: bassDomain.commandIds.initialize,
    target: { kind: "part", partId: "part-1" },
    payload: {},
  }).status, "committed");
  assert.equal(created.value.submit({
    commandVersion: 1,
    commandId: bassDomain.commandIds.setTuning,
    target: { kind: "part", partId: "part-1" },
    payload: {
      tuning: [
        { stringNumber: 1, soundingPitch: { step: "G", alter: 0, octave: 2 } },
        { stringNumber: 2, soundingPitch: { step: "D", alter: 0, octave: 2 } },
        { stringNumber: 3, soundingPitch: { step: "A", alter: 0, octave: 1 } },
        { stringNumber: 4, soundingPitch: { step: "D", alter: 0, octave: 1 } },
      ],
    },
  }).status, "committed");
  assert.equal(created.value.submit({
    commandVersion: 1,
    commandId: bassDomain.commandIds.setPosition,
    target: { kind: "part", partId: "part-1" },
    payload: { noteId: "note-1", position: { stringNumber: 4, fret: 0 } },
  }).status, "committed");

  const read = created.value.read();
  assert.equal(read.ok, true);
  if (!read.ok) assert.fail("expected the Bass fixture state to be readable");
  const state = bassDomain.readPart(read.value.snapshot.document, "part-1");
  assert.equal(state.status, "valid");
  if (state.status !== "valid") assert.fail("expected the Bass fixture extension");
  assert.equal(state.state.stringCount, 4);
  assert.equal(state.state.tuning.length, 4);
  assert.deepEqual(state.state.tuning[3], {
    stringNumber: 4,
    soundingPitch: { step: "D", alter: 0, octave: 1 },
  });
  assert.deepEqual(state.state.placements, [{ noteId: "note-1", stringNumber: 4, fret: 0 }]);
  assert.deepEqual(
    read.value.snapshot.document.parts[0]?.measureContents[0]?.voices[0]?.sequence.events[0],
    {
      id: "event-1",
      duration: { base: 4, dots: 0 },
      content: {
        kind: "notes",
        notes: [{ id: "note-1", writtenPitch: { step: "D", alter: 0, octave: 2 } }],
      },
    },
  );
});
