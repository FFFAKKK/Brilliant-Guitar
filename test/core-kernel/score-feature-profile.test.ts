import { test } from "node:test";
import assert = require("node:assert/strict");

import * as coreKernel from "../../src/core-kernel/index";
import { cloneCoreScoreFixture } from "./fixtures/core-score";

type Diagnostic = { readonly code: string };
type ScoreSupportResult = {
  readonly status: "supported" | "unsupported" | "invalid";
  readonly diagnostics: readonly Diagnostic[];
};
type ValidationReport = {
  readonly ok: boolean;
  readonly diagnostics: readonly Diagnostic[];
};
type ValidateProfile = (document: unknown, profile?: unknown) => ScoreSupportResult;
type ValidateSemantics = (document: unknown) => ValidationReport;

function getApi(): {
  validate: ValidateProfile;
  validateSemantics: ValidateSemantics;
  profile: unknown;
} {
  const api = coreKernel as unknown as Record<string, unknown>;
  assert.equal(typeof api.validateScoreFeatureProfile, "function");
  assert.equal(typeof api.validateScoreDocumentSemantics, "function");
  assert.equal(typeof api.K1_SCORE_FEATURE_PROFILE, "object");
  return {
    validate: api.validateScoreFeatureProfile as ValidateProfile,
    validateSemantics: api.validateScoreDocumentSemantics as ValidateSemantics,
    profile: api.K1_SCORE_FEATURE_PROFILE,
  };
}

test("the first K1 feature profile accepts the supported single-voice score", () => {
  const { validate, profile } = getApi();
  assert.deepEqual(validate(cloneCoreScoreFixture(), profile), {
    status: "supported",
    diagnostics: [],
  });
});

test("the profile result distinguishes semantic-invalid data", () => {
  const { validate, profile } = getApi();
  const document = cloneCoreScoreFixture() as unknown as {
    parts: Array<{ measureContents: unknown[] }>;
  };
  document.parts[0]!.measureContents = [];

  const result = validate(document, profile);
  assert.equal(result.status, "invalid");
  assert.deepEqual(
    result.diagnostics.map((item) => item.code),
    ["semantic.measure-coverage-missing"],
  );
});

test("legal multi-Part and multi-staff data is unsupported rather than corrupt", () => {
  const { validate, validateSemantics, profile } = getApi();
  const document = cloneCoreScoreFixture();
  const secondPart = structuredClone(document.parts[0]!);
  const secondVoice = secondPart.measureContents[0]!.voices[0]!;
  (secondPart as { id: string }).id = "part-2";
  (secondPart.staves[0] as { id: string }).id = "staff-2";
  (secondVoice as { id: string; defaultStaffId: string }).id = "voice-2";
  (secondVoice as { id: string; defaultStaffId: string }).defaultStaffId =
    "staff-2";
  secondVoice.sequence.events.forEach((event, index) => {
    (event as { id: string }).id = `event-${index + 5}`;
    if (event.content.kind === "notes") {
      (event.content.notes[0] as { id: string }).id = "note-2";
    }
  });
  (document.parts as typeof document.parts[number][]).push(secondPart);

  assert.equal(validateSemantics(document).ok, true);
  const multiPartResult = validate(document, profile);
  assert.equal(multiPartResult.status, "unsupported");
  assert.deepEqual(
    multiPartResult.diagnostics.map((item) => item.code),
    ["unsupported.part-count"],
  );

  const piano = cloneCoreScoreFixture();
  (piano.parts[0]!.staves as typeof piano.parts[0]["staves"][number][]).push({
    id: "staff-2",
    lineCount: 5,
    defaultClef: { sign: "F", line: 4 },
  });
  assert.equal(validateSemantics(piano).ok, true);
  const pianoResult = validate(piano, profile);
  assert.equal(pianoResult.status, "unsupported");
  assert.deepEqual(
    pianoResult.diagnostics.map((item) => item.code),
    ["unsupported.staff-count"],
  );
});

test("legal multi-Voice data is unsupported rather than corrupt", () => {
  const { validate, validateSemantics, profile } = getApi();
  const document = cloneCoreScoreFixture();
  const content = document.parts[0]!.measureContents[0]!;
  const secondVoice = structuredClone(content.voices[0]!);
  (secondVoice as { id: string }).id = "voice-2";
  secondVoice.sequence.events.forEach((event, index) => {
    (event as { id: string }).id = `event-${index + 5}`;
    if (event.content.kind === "notes") {
      (event.content.notes[0] as { id: string }).id = "note-2";
    }
  });
  (content.voices as typeof content.voices[number][]).push(secondVoice);

  assert.equal(validateSemantics(document).ok, true);
  const result = validate(document, profile);
  assert.equal(result.status, "unsupported");
  assert.deepEqual(
    result.diagnostics.map((item) => item.code),
    ["unsupported.voice-count"],
  );
});

test("legal sequence start and incomplete duration remain unsupported profile states", () => {
  const { validate, validateSemantics, profile } = getApi();

  const nonzeroStart = cloneCoreScoreFixture();
  const nonzeroSequence =
    nonzeroStart.parts[0]!.measureContents[0]!.voices[0]!.sequence;
  (nonzeroSequence as { start: { numerator: number; denominator: number } }).start = {
    numerator: 1,
    denominator: 4,
  };
  (nonzeroSequence.events as typeof nonzeroSequence.events[number][]).splice(3);
  assert.equal(validateSemantics(nonzeroStart).ok, true);
  const nonzeroResult = validate(nonzeroStart, profile);
  assert.equal(nonzeroResult.status, "unsupported");
  assert.deepEqual(
    nonzeroResult.diagnostics.map((item) => item.code),
    ["unsupported.sequence-start"],
  );

  const incomplete = cloneCoreScoreFixture();
  const incompleteEvents =
    incomplete.parts[0]!.measureContents[0]!.voices[0]!.sequence.events;
  (incompleteEvents as typeof incompleteEvents[number][]).splice(3);
  assert.equal(validateSemantics(incomplete).ok, true);
  const incompleteResult = validate(incomplete, profile);
  assert.equal(incompleteResult.status, "unsupported");
  assert.deepEqual(
    incompleteResult.diagnostics.map((item) => item.code),
    ["unsupported.sequence-duration"],
  );
});

test("legal meter and note-value base outside K1 remain unsupported", () => {
  const { validate, validateSemantics, profile } = getApi();

  const tripleMeter = cloneCoreScoreFixture();
  (tripleMeter.measureDefinitions[0] as {
    meter: { numerator: number; denominator: 4 };
  }).meter = { numerator: 3, denominator: 4 };
  const tripleEvents =
    tripleMeter.parts[0]!.measureContents[0]!.voices[0]!.sequence.events;
  (tripleEvents as typeof tripleEvents[number][]).splice(3);
  assert.equal(validateSemantics(tripleMeter).ok, true);
  const meterResult = validate(tripleMeter, profile);
  assert.equal(meterResult.status, "unsupported");
  assert.deepEqual(
    meterResult.diagnostics.map((item) => item.code),
    ["unsupported.meter"],
  );

  const halfNote = cloneCoreScoreFixture();
  const halfNoteEvents =
    halfNote.parts[0]!.measureContents[0]!.voices[0]!.sequence.events;
  (halfNoteEvents[0] as { duration: { base: 2; dots: 0 } }).duration = {
    base: 2,
    dots: 0,
  };
  (halfNoteEvents as typeof halfNoteEvents[number][]).splice(3);
  assert.equal(validateSemantics(halfNote).ok, true);
  const noteBaseResult = validate(halfNote, profile);
  assert.equal(noteBaseResult.status, "unsupported");
  assert.deepEqual(
    noteBaseResult.diagnostics.map((item) => item.code),
    ["unsupported.note-value-base"],
  );
});

test("legal chord, dot, time modification, and pickup features stay profile diagnostics", () => {
  const { validate, validateSemantics, profile } = getApi();

  const chord = cloneCoreScoreFixture();
  const notes = chord.parts[0]!.measureContents[0]!.voices[0]!.sequence.events[0]!
    .content;
  assert.equal(notes.kind, "notes");
  if (notes.kind === "notes") {
    (notes.notes as typeof notes.notes[number][]).push({
      id: "note-2",
      writtenPitch: { step: "E", alter: 0, octave: 4 },
    });
  }
  assert.equal(validateSemantics(chord).ok, true);
  assert.equal(
    validate(chord, profile).diagnostics.some(
      (item) => item.code === "unsupported.chord",
    ),
    true,
  );

  const dotted = cloneCoreScoreFixture();
  const dottedEvents =
    dotted.parts[0]!.measureContents[0]!.voices[0]!.sequence.events;
  (dottedEvents[0] as { duration: { base: 4; dots: 1 } }).duration = {
    base: 4,
    dots: 1,
  };
  (dottedEvents[1] as { duration: { base: 8; dots: 0 } }).duration = {
    base: 8,
    dots: 0,
  };
  assert.equal(validateSemantics(dotted).ok, true);
  assert.equal(
    validate(dotted, profile).diagnostics.some(
      (item) => item.code === "unsupported.dots",
    ),
    true,
  );

  const tuplet = cloneCoreScoreFixture();
  const tupletEvent =
    tuplet.parts[0]!.measureContents[0]!.voices[0]!.sequence.events[0]!;
  (
    tupletEvent as {
      duration: {
        base: 4;
        dots: 0;
        timeModification: { actualNotes: number; normalNotes: number };
      };
    }
  ).duration = {
    base: 4,
    dots: 0,
    timeModification: { actualNotes: 3, normalNotes: 2 },
  };
  assert.equal(validateSemantics(tuplet).ok, true);
  assert.equal(
    validate(tuplet, profile).diagnostics.some(
      (item) => item.code === "unsupported.time-modification",
    ),
    true,
  );

  const pickup = cloneCoreScoreFixture();
  (
    pickup.measureDefinitions[0] as {
      pickupDuration: { numerator: number; denominator: number };
    }
  ).pickupDuration = { numerator: 1, denominator: 4 };
  const pickupEvents =
    pickup.parts[0]!.measureContents[0]!.voices[0]!.sequence.events;
  (pickupEvents as typeof pickupEvents[number][]).splice(1);
  assert.equal(validateSemantics(pickup).ok, true);
  assert.equal(
    validate(pickup, profile).diagnostics.some(
      (item) => item.code === "unsupported.pickup",
    ),
    true,
  );
});
