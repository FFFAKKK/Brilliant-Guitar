import assert = require("node:assert/strict");
import { test } from "node:test";

import {
  CommandBus,
  encodeScoreDocumentJson,
  parseScoreDocumentJson,
  replayKernelCommands,
  type IntegratedCommandBus,
  type ScoreDocument,
} from "../../src/core-kernel/index";
import {
  DROP_D_GUITAR_TUNING_V1,
  GUITAR_TECHNIQUE_DEFINITIONS_V1,
  GUITAR_TUNING_PRESETS_V1,
  INITIALIZE_GUITAR_COMMAND,
  REMOVE_GUITAR_TECHNIQUE_COMMAND,
  SET_GUITAR_POSITION_COMMAND,
  SET_GUITAR_TECHNIQUE_COMMAND,
  SET_GUITAR_TUNING_COMMAND,
  STANDARD_GUITAR_TUNING_V1,
  compileGuitarDomainModuleCatalogV1,
  readPartGuitarDomainV1,
  type GuitarTechniqueV1,
} from "../../src/first-party-modules/guitar-domain";
import { createCoreScoreFixture } from "./fixtures/core-score";

function guitarScore(): ScoreDocument {
  const base = createCoreScoreFixture();
  const part = base.parts[0]!;
  const content = part.measureContents[0]!;
  const voice = content.voices[0]!;
  return {
    ...base,
    parts: [{
      ...part,
      name: "Electric Guitar",
      instrument: {
        name: "Guitar",
        writtenToSounding: { diatonicSteps: -7, chromaticSemitones: -12 },
      },
      measureContents: [{
        ...content,
        voices: [{
          ...voice,
          sequence: {
            ...voice.sequence,
            events: [
              {
                id: "event-1",
                duration: { base: 4, dots: 0 },
                content: { kind: "notes", notes: [{
                  id: "note-1", writtenPitch: { step: "C", alter: 0, octave: 5 },
                }] },
              },
              {
                id: "event-2",
                duration: { base: 4, dots: 0 },
                content: { kind: "notes", notes: [{
                  id: "note-2", writtenPitch: { step: "D", alter: 0, octave: 5 },
                }] },
              },
              {
                id: "event-3",
                duration: { base: 4, dots: 0 },
                content: { kind: "notes", notes: [{
                  id: "note-3", writtenPitch: { step: "G", alter: 0, octave: 4 },
                }] },
              },
              {
                id: "event-4",
                duration: { base: 4, dots: 0 },
                content: { kind: "rest" },
              },
            ],
          },
        }],
      }],
    }],
  };
}

function guitarChordScore(): ScoreDocument {
  const base = guitarScore();
  const part = base.parts[0]!;
  const content = part.measureContents[0]!;
  const voice = content.voices[0]!;
  const first = voice.sequence.events[0]!;
  assert.equal(first.content.kind, "notes");
  if (first.content.kind !== "notes") assert.fail("expected first event to contain notes");
  return {
    ...base,
    parts: [{
      ...part,
      measureContents: [{
        ...content,
        voices: [{
          ...voice,
          sequence: {
            ...voice.sequence,
            events: [{
              ...first,
              content: {
                kind: "notes",
                notes: [...first.content.notes, {
                  id: "note-chord-2",
                  writtenPitch: { step: "B", alter: 0, octave: 4 },
                }],
              },
            }, ...voice.sequence.events.slice(1)],
          },
        }],
      }],
    }],
  };
}

function catalog() {
  const compiled = compileGuitarDomainModuleCatalogV1();
  assert.equal(compiled.ok, true);
  if (!compiled.ok) assert.fail("expected the Guitar Domain catalog to compile");
  return compiled.catalog;
}

function bus(): IntegratedCommandBus {
  const created = CommandBus.createIntegrated(guitarScore(), catalog());
  assert.equal(created.ok, true);
  if (!created.ok) assert.fail("expected a Guitar Domain integrated bus");
  return created.value;
}

function initialize() {
  return {
    commandVersion: 1,
    commandId: INITIALIZE_GUITAR_COMMAND,
    target: { kind: "part", partId: "part-1" },
    payload: {},
  } as const;
}

function setPosition(noteId: string, position: { readonly stringNumber: number; readonly fret: number } | null) {
  return {
    commandVersion: 1,
    commandId: SET_GUITAR_POSITION_COMMAND,
    target: { kind: "part", partId: "part-1" },
    payload: { noteId, position },
  } as const;
}

function setTuning(tuning: typeof STANDARD_GUITAR_TUNING_V1) {
  return {
    commandVersion: 1,
    commandId: SET_GUITAR_TUNING_COMMAND,
    target: { kind: "part", partId: "part-1" },
    payload: { tuning },
  } as const;
}

function setTechnique(technique: GuitarTechniqueV1) {
  return {
    commandVersion: 1,
    commandId: SET_GUITAR_TECHNIQUE_COMMAND,
    target: { kind: "part", partId: "part-1" },
    payload: { technique },
  } as const;
}

function removeTechnique(techniqueId: string) {
  return {
    commandVersion: 1,
    commandId: REMOVE_GUITAR_TECHNIQUE_COMMAND,
    target: { kind: "part", partId: "part-1" },
    payload: { techniqueId },
  } as const;
}

function document(current: IntegratedCommandBus): ScoreDocument {
  const read = current.read();
  assert.equal(read.ok, true);
  if (!read.ok) assert.fail("expected readable Guitar Domain state");
  return read.value.snapshot.document;
}

function state(current: IntegratedCommandBus) {
  const read = readPartGuitarDomainV1(document(current), "part-1");
  assert.equal(read.status, "valid");
  if (read.status !== "valid") assert.fail("expected valid Guitar Domain extension state");
  return read.state;
}

function notePitch(current: IntegratedCommandBus, noteId: string) {
  for (const part of document(current).parts) {
    for (const content of part.measureContents) {
      for (const voice of content.voices) {
        for (const event of voice.sequence.events) {
          if (event.content.kind !== "notes") continue;
          const note = event.content.notes.find(entry => entry.id === noteId);
          if (note !== undefined) return note.writtenPitch;
        }
      }
    }
  }
  return undefined;
}

const slide: GuitarTechniqueV1 = {
  id: "technique-slide",
  kind: "slide",
  fromNoteId: "note-1",
  toNoteId: "note-2",
};
const hammerOn: GuitarTechniqueV1 = {
  id: "technique-hammer-on",
  kind: "hammer-on",
  fromNoteId: "note-1",
  toNoteId: "note-2",
};
const pullOff: GuitarTechniqueV1 = {
  id: "technique-pull-off",
  kind: "pull-off",
  fromNoteId: "note-2",
  toNoteId: "note-3",
};
const bend: GuitarTechniqueV1 = {
  id: "technique-bend",
  kind: "bend",
  noteId: "note-2",
  semitones: 2,
};
const vibrato: GuitarTechniqueV1 = {
  id: "technique-vibrato",
  kind: "vibrato",
  noteId: "note-3",
};

test("Guitar Domain V1 exposes tuning presets and the first five P0 technique contracts", () => {
  assert.deepEqual(STANDARD_GUITAR_TUNING_V1, [
    { stringNumber: 1, soundingPitch: { step: "E", alter: 0, octave: 4 } },
    { stringNumber: 2, soundingPitch: { step: "B", alter: 0, octave: 3 } },
    { stringNumber: 3, soundingPitch: { step: "G", alter: 0, octave: 3 } },
    { stringNumber: 4, soundingPitch: { step: "D", alter: 0, octave: 3 } },
    { stringNumber: 5, soundingPitch: { step: "A", alter: 0, octave: 2 } },
    { stringNumber: 6, soundingPitch: { step: "E", alter: 0, octave: 2 } },
  ]);
  assert.deepEqual(GUITAR_TUNING_PRESETS_V1.map((preset) => ({
    id: preset.id,
    lowToHigh: [...preset.tuning].reverse()
      .map((entry) => `${entry.soundingPitch.step}${entry.soundingPitch.octave}`),
  })), [
    { id: "brilliant.instrument.guitar.tuning.standard", lowToHigh: ["E2", "A2", "D3", "G3", "B3", "E4"] },
    { id: "brilliant.instrument.guitar.tuning.drop-d", lowToHigh: ["D2", "A2", "D3", "G3", "B3", "E4"] },
    { id: "brilliant.instrument.guitar.tuning.dadgad", lowToHigh: ["D2", "A2", "D3", "G3", "A3", "D4"] },
    { id: "brilliant.instrument.guitar.tuning.open-g", lowToHigh: ["D2", "G2", "D3", "G3", "B3", "D4"] },
  ]);
  assert.deepEqual(GUITAR_TECHNIQUE_DEFINITIONS_V1.map(entry => ({
    kind: entry.kind,
    priority: entry.priority,
    target: entry.target,
  })), [
    { kind: "hammer-on", priority: "P0", target: "note-connection" },
    { kind: "pull-off", priority: "P0", target: "note-connection" },
    { kind: "slide", priority: "P0", target: "note-connection" },
    { kind: "bend", priority: "P0", target: "note" },
    { kind: "vibrato", priority: "P0", target: "note" },
  ]);
  assert.ok(catalog());
});

test("alternate tuning updates persisted tuning and positioned note pitches in one history entry", () => {
  const current = bus();
  assert.equal(current.submit(initialize()).status, "committed");
  assert.equal(current.submit(setPosition("note-1", { stringNumber: 6, fret: 0 })).status, "committed");
  assert.deepEqual(notePitch(current, "note-1"), { step: "E", alter: 0, octave: 3 });

  assert.equal(current.submit(setTuning(DROP_D_GUITAR_TUNING_V1)).status, "committed");
  assert.deepEqual(state(current).tuning, DROP_D_GUITAR_TUNING_V1);
  assert.deepEqual(notePitch(current, "note-1"), { step: "D", alter: 0, octave: 3 });

  assert.equal(current.undo().status, "committed");
  assert.deepEqual(state(current).tuning, STANDARD_GUITAR_TUNING_V1);
  assert.deepEqual(notePitch(current, "note-1"), { step: "E", alter: 0, octave: 3 });
  assert.equal(current.redo().status, "committed");
  assert.deepEqual(notePitch(current, "note-1"), { step: "D", alter: 0, octave: 3 });
});

test("hammer-ons and pull-offs require forward same-string fret movement in the expected direction", () => {
  const current = bus();
  for (const command of [
    initialize(),
    setPosition("note-1", { stringNumber: 1, fret: 0 }),
    setPosition("note-2", { stringNumber: 1, fret: 2 }),
    setPosition("note-3", { stringNumber: 1, fret: 0 }),
  ]) assert.equal(current.submit(command).status, "committed");

  assert.equal(current.submit(setTechnique(hammerOn)).status, "committed");
  assert.equal(current.submit(removeTechnique(hammerOn.id)).status, "committed");
  assert.equal(current.submit(setTechnique(pullOff)).status, "committed");

  assert.equal(current.submit(setTechnique({
    ...hammerOn,
    id: "invalid-hammer-on",
    fromNoteId: "note-2",
    toNoteId: "note-3",
  })).status, "rejected");
  assert.equal(current.submit(setTechnique({
    ...pullOff,
    id: "invalid-pull-off",
    fromNoteId: "note-1",
    toNoteId: "note-2",
  })).status, "rejected");
});

test("guitar chords use distinct strings without being classified as a Guitar-domain limitation", () => {
  const created = CommandBus.createIntegrated(guitarChordScore(), catalog());
  assert.equal(created.ok, true);
  if (!created.ok) assert.fail("expected a Guitar chord session");
  const current = created.value;
  assert.equal(current.submit(initialize()).status, "committed");
  assert.equal(current.submit(setPosition("note-1", { stringNumber: 1, fret: 0 })).status, "committed");
  const second = current.submit(setPosition("note-chord-2", { stringNumber: 2, fret: 0 }));
  assert.equal(second.status, "committed");
  if (second.status !== "committed") return;
  assert.equal(second.assessment.modules[0]?.status, "supported");
});

test("positions update written pitch atomically and techniques survive undo, redo and reopen", () => {
  const current = bus();
  assert.equal(current.submit(initialize()).status, "committed");
  assert.equal(current.submit(initialize()).status, "no-op");
  assert.equal(current.submit(setPosition("note-1", { stringNumber: 1, fret: 0 })).status, "committed");
  assert.equal(current.submit(setPosition("note-2", { stringNumber: 1, fret: 1 })).status, "committed");
  assert.equal(current.submit(setPosition("note-3", { stringNumber: 2, fret: 0 })).status, "committed");
  assert.deepEqual(notePitch(current, "note-1"), { step: "E", alter: 0, octave: 5 });
  assert.deepEqual(notePitch(current, "note-2"), { step: "F", alter: 0, octave: 5 });
  assert.deepEqual(notePitch(current, "note-3"), { step: "B", alter: 0, octave: 4 });

  assert.equal(current.submit(setTechnique(slide)).status, "committed");
  assert.equal(current.submit(setTechnique(bend)).status, "committed");
  assert.equal(current.submit(setTechnique(vibrato)).status, "committed");
  assert.deepEqual(state(current).techniques, [bend, slide, vibrato]);
  assert.equal(current.submit(setTechnique(vibrato)).status, "no-op");

  assert.equal(current.undo().status, "committed");
  assert.deepEqual(state(current).techniques, [bend, slide]);
  assert.equal(current.redo().status, "committed");
  assert.deepEqual(state(current).techniques, [bend, slide, vibrato]);

  const encoded = encodeScoreDocumentJson(document(current));
  assert.equal(encoded.ok, true);
  if (!encoded.ok) assert.fail("expected Guitar Domain document encoding");
  const decoded = parseScoreDocumentJson(encoded.value);
  assert.equal(decoded.ok, true);
  if (!decoded.ok) assert.fail("expected Guitar Domain document decoding");
  const reopened = CommandBus.createIntegrated(decoded.value, catalog());
  assert.equal(reopened.ok, true);
  if (!reopened.ok) assert.fail("expected Guitar Domain document reopening");
  assert.deepEqual(state(reopened.value), state(current));
});

test("invalid positions and technique relationships are rejected without mutation", () => {
  const current = bus();
  assert.equal(current.submit(setPosition("note-1", { stringNumber: 1, fret: 0 })).status, "rejected");
  assert.equal(current.submit(initialize()).status, "committed");
  const before = current.read();
  assert.equal(current.submit(setPosition("missing-note", { stringNumber: 1, fret: 0 })).status, "rejected");
  assert.equal(current.submit(setPosition("note-1", { stringNumber: 1, fret: 25 })).status, "rejected");
  assert.deepEqual(current.read(), before);

  assert.equal(current.submit(setPosition("note-1", { stringNumber: 1, fret: 0 })).status, "committed");
  assert.equal(current.submit(setPosition("note-2", { stringNumber: 2, fret: 6 })).status, "committed");
  const beforeTechnique = current.read();
  assert.equal(current.submit(setTechnique(slide)).status, "rejected");
  assert.deepEqual(current.read(), beforeTechnique);
  assert.equal(current.submit({
    ...setTechnique(bend),
    payload: { technique: { ...bend, semitones: 3 } },
  } as never).status, "rejected");
  assert.deepEqual(current.read(), beforeTechnique);
});

test("referenced notes cannot be deleted until Guitar relationships are reconciled in one batch", () => {
  const current = bus();
  for (const command of [
    initialize(),
    setPosition("note-1", { stringNumber: 1, fret: 0 }),
    setPosition("note-2", { stringNumber: 1, fret: 1 }),
    setTechnique(slide),
  ]) assert.equal(current.submit(command).status, "committed");

  const removeEvent = {
    commandVersion: 1,
    commandId: "core.event.remove",
    target: { kind: "event", eventId: "event-1" },
    payload: {},
  } as const;
  assert.equal(current.submit(removeEvent).status, "rejected");

  const before = document(current);
  const result = current.submit({
    commandVersion: 1,
    commandId: "core.transaction.batch",
    target: { kind: "document", documentId: "score-1" },
    payload: {
      commands: [
        removeTechnique(slide.id),
        setPosition("note-1", null),
        removeEvent,
      ],
    },
  });
  assert.equal(result.status, "committed");
  assert.equal(notePitch(current, "note-1"), undefined);
  assert.equal(state(current).placements.some(entry => entry.noteId === "note-1"), false);
  assert.equal(state(current).techniques.length, 0);
  assert.equal(current.undo().status, "committed");
  assert.deepEqual(document(current), before);
});

test("Guitar Domain commands replay to the same extension and Core pitches", () => {
  const commands = [
    initialize(),
    setPosition("note-1", { stringNumber: 1, fret: 0 }),
    setPosition("note-2", { stringNumber: 1, fret: 1 }),
    setPosition("note-3", { stringNumber: 2, fret: 0 }),
    setTechnique(slide),
    setTechnique(bend),
    setTechnique(vibrato),
  ];
  const replayed = replayKernelCommands(guitarScore(), commands, catalog());
  assert.equal(replayed.status, "replayed");
  if (replayed.status !== "replayed") assert.fail("expected Guitar Domain replay");
  const read = readPartGuitarDomainV1(replayed.finalDocument, "part-1");
  assert.equal(read.status, "valid");
  if (read.status !== "valid") return;
  assert.deepEqual(read.state.techniques, [bend, slide, vibrato]);
  assert.deepEqual(
    replayed.finalDocument.parts[0]?.measureContents[0]?.voices[0]?.sequence.events[0],
    {
      id: "event-1",
      duration: { base: 4, dots: 0 },
      content: { kind: "notes", notes: [{
        id: "note-1", writtenPitch: { step: "E", alter: 0, octave: 5 },
      }] },
    },
  );
});
