import { test } from "node:test";
import assert = require("node:assert/strict");

import * as coreKernel from "../../src/core-kernel/index";

type Fraction = { readonly numerator: number; readonly denominator: number };
type NoteValue = {
  readonly base: number;
  readonly dots: number;
  readonly timeModification?: {
    readonly actualNotes: number;
    readonly normalNotes: number;
  };
};
type FractionResult =
  | { readonly ok: true; readonly value: Fraction }
  | { readonly ok: false; readonly code: string };
type FractionListResult =
  | { readonly ok: true; readonly value: readonly Fraction[] }
  | { readonly ok: false; readonly code: string };
type GetNoteValueDuration = (value: NoteValue) => FractionResult;
type GetEffectiveMeasureDuration = (
  meter: { readonly numerator: number; readonly denominator: number },
  pickupDuration?: Fraction,
) => FractionResult;
type DeriveSequenceEventStarts = (
  start: Fraction,
  durations: readonly NoteValue[],
) => FractionListResult;

test("NoteValue derives exact normal, dotted, and tuplet durations", () => {
  const api = coreKernel as unknown as Record<string, unknown>;
  assert.equal(typeof api.getNoteValueDuration, "function");
  const getNoteValueDuration = api.getNoteValueDuration as GetNoteValueDuration;

  assert.deepEqual(getNoteValueDuration({ base: 4, dots: 0 }), {
    ok: true,
    value: { numerator: 1, denominator: 4 },
  });
  assert.deepEqual(getNoteValueDuration({ base: 4, dots: 1 }), {
    ok: true,
    value: { numerator: 3, denominator: 8 },
  });
  assert.deepEqual(
    getNoteValueDuration({
      base: 8,
      dots: 0,
      timeModification: { actualNotes: 3, normalNotes: 2 },
    }),
    { ok: true, value: { numerator: 1, denominator: 12 } },
  );
});

test("measure duration uses meter unless a canonical pickup overrides it", () => {
  const api = coreKernel as unknown as Record<string, unknown>;
  assert.equal(typeof api.getEffectiveMeasureDuration, "function");
  const getEffectiveMeasureDuration =
    api.getEffectiveMeasureDuration as GetEffectiveMeasureDuration;

  assert.deepEqual(
    getEffectiveMeasureDuration({ numerator: 3, denominator: 4 }),
    { ok: true, value: { numerator: 3, denominator: 4 } },
  );
  assert.deepEqual(
    getEffectiveMeasureDuration(
      { numerator: 4, denominator: 4 },
      { numerator: 1, denominator: 4 },
    ),
    { ok: true, value: { numerator: 1, denominator: 4 } },
  );
});

test("event starts are derived from sequence order without persisted offsets", () => {
  const api = coreKernel as unknown as Record<string, unknown>;
  assert.equal(typeof api.deriveSequenceEventStarts, "function");
  const deriveSequenceEventStarts =
    api.deriveSequenceEventStarts as DeriveSequenceEventStarts;

  assert.deepEqual(
    deriveSequenceEventStarts(
      { numerator: 0, denominator: 1 },
      [
        { base: 4, dots: 0 },
        { base: 8, dots: 0 },
        { base: 8, dots: 0 },
      ],
    ),
    {
      ok: true,
      value: [
        { numerator: 0, denominator: 1 },
        { numerator: 1, denominator: 4 },
        { numerator: 3, denominator: 8 },
      ],
    },
  );
});

test("musical-time helpers reject malformed values and exact overflow", () => {
  const api = coreKernel as unknown as Record<string, unknown>;
  assert.equal(typeof api.getNoteValueDuration, "function");
  assert.equal(typeof api.getEffectiveMeasureDuration, "function");
  const getNoteValueDuration = api.getNoteValueDuration as GetNoteValueDuration;
  const getEffectiveMeasureDuration =
    api.getEffectiveMeasureDuration as GetEffectiveMeasureDuration;

  assert.deepEqual(getNoteValueDuration({ base: 3, dots: 0 }), {
    ok: false,
    code: "note-value-base-invalid",
  });
  assert.deepEqual(getNoteValueDuration({ base: 4, dots: 4 }), {
    ok: false,
    code: "note-value-dots-invalid",
  });
  assert.deepEqual(
    getNoteValueDuration({
      base: 8,
      dots: 0,
      timeModification: { actualNotes: 0, normalNotes: 2 },
    }),
    { ok: false, code: "note-value-time-modification-invalid" },
  );
  assert.deepEqual(
    getNoteValueDuration({
      base: 64,
      dots: 3,
      timeModification: {
        actualNotes: 1,
        normalNotes: Number.MAX_SAFE_INTEGER,
      },
    }),
    { ok: false, code: "fraction-overflow" },
  );
  assert.deepEqual(
    getEffectiveMeasureDuration(
      { numerator: 4, denominator: 4 },
      { numerator: 2, denominator: 4 },
    ),
    { ok: false, code: "pickup-duration-invalid" },
  );
});
