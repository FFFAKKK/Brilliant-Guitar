import { test } from "node:test";
import assert = require("node:assert/strict");

import * as coreKernel from "../../src/core-kernel/index";

type WrittenPitch = {
  readonly step: "C" | "D" | "E" | "F" | "G" | "A" | "B";
  readonly alter: number;
  readonly octave: number;
};
type Transposition = {
  readonly diatonicSteps: number;
  readonly chromaticSemitones: number;
};
type TransposeResult =
  | { readonly ok: true; readonly value: WrittenPitch }
  | { readonly ok: false; readonly code: string };
type TransposeWrittenPitch = (
  pitch: WrittenPitch,
  transposition: Transposition,
) => TransposeResult;

test("standard guitar transposition derives sounding E2 from written E3", () => {
  const api = coreKernel as unknown as Record<string, unknown>;
  assert.equal(typeof api.transposeWrittenPitch, "function");
  const transposeWrittenPitch =
    api.transposeWrittenPitch as TransposeWrittenPitch;

  assert.deepEqual(
    transposeWrittenPitch(
      { step: "E", alter: 0, octave: 3 },
      { diatonicSteps: -7, chromaticSemitones: -12 },
    ),
    {
      ok: true,
      value: { step: "E", alter: 0, octave: 2 },
    },
  );
});

test("transposition preserves deterministic written spelling", () => {
  const api = coreKernel as unknown as Record<string, unknown>;
  assert.equal(typeof api.transposeWrittenPitch, "function");
  const transposeWrittenPitch =
    api.transposeWrittenPitch as TransposeWrittenPitch;

  assert.deepEqual(
    transposeWrittenPitch(
      { step: "B", alter: -1, octave: 3 },
      { diatonicSteps: 1, chromaticSemitones: 2 },
    ),
    {
      ok: true,
      value: { step: "C", alter: 0, octave: 4 },
    },
  );
});

test("transposition fails when deterministic spelling exceeds double accidentals", () => {
  const api = coreKernel as unknown as Record<string, unknown>;
  assert.equal(typeof api.transposeWrittenPitch, "function");
  const transposeWrittenPitch =
    api.transposeWrittenPitch as TransposeWrittenPitch;

  assert.deepEqual(
    transposeWrittenPitch(
      { step: "C", alter: 0, octave: 4 },
      { diatonicSteps: 0, chromaticSemitones: 3 },
    ),
    { ok: false, code: "derived-pitch-alter-out-of-range" },
  );
  assert.deepEqual(
    transposeWrittenPitch(
      { step: "C", alter: 0, octave: 4 },
      { diatonicSteps: 0.5, chromaticSemitones: 0 },
    ),
    { ok: false, code: "transposition-component-invalid" },
  );
});
