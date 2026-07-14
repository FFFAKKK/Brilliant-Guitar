export type PitchStep = "C" | "D" | "E" | "F" | "G" | "A" | "B";
export type PitchAlter = -2 | -1 | 0 | 1 | 2;

export interface WrittenPitch {
  readonly step: PitchStep;
  readonly alter: PitchAlter;
  readonly octave: number;
}

export interface SoundingPitch {
  readonly step: PitchStep;
  readonly alter: number;
  readonly octave: number;
}

export interface Transposition {
  readonly diatonicSteps: number;
  readonly chromaticSemitones: number;
}

export type PitchTranspositionErrorCode =
  | "written-pitch-invalid"
  | "transposition-component-invalid"
  | "derived-pitch-alter-out-of-range"
  | "derived-pitch-octave-out-of-range";

export type PitchTranspositionResult =
  | { readonly ok: true; readonly value: SoundingPitch }
  | { readonly ok: false; readonly code: PitchTranspositionErrorCode };

const PITCH_STEPS: readonly PitchStep[] = ["C", "D", "E", "F", "G", "A", "B"];
const NATURAL_SEMITONES: readonly number[] = [0, 2, 4, 5, 7, 9, 11];

export function isWrittenPitch(value: unknown): value is WrittenPitch {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.step === "string" &&
    PITCH_STEPS.includes(candidate.step as PitchStep) &&
    Number.isInteger(candidate.alter) &&
    typeof candidate.alter === "number" &&
    candidate.alter >= -2 &&
    candidate.alter <= 2 &&
    Number.isInteger(candidate.octave) &&
    typeof candidate.octave === "number" &&
    candidate.octave >= 0 &&
    candidate.octave <= 8
  );
}

export function isTransposition(value: unknown): value is Transposition {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.diatonicSteps === "number" &&
    Number.isSafeInteger(candidate.diatonicSteps) &&
    typeof candidate.chromaticSemitones === "number" &&
    Number.isSafeInteger(candidate.chromaticSemitones)
  );
}

export function transposeWrittenPitch(
  pitch: WrittenPitch,
  transposition: Transposition,
): PitchTranspositionResult {
  if (!isWrittenPitch(pitch)) {
    return { ok: false, code: "written-pitch-invalid" };
  }
  if (!isTransposition(transposition)) {
    return { ok: false, code: "transposition-component-invalid" };
  }

  const sourceStepIndex = PITCH_STEPS.indexOf(pitch.step);
  const targetDiatonicIndex =
    pitch.octave * PITCH_STEPS.length +
    sourceStepIndex +
    transposition.diatonicSteps;
  if (!Number.isSafeInteger(targetDiatonicIndex)) {
    return { ok: false, code: "transposition-component-invalid" };
  }

  const targetOctave = Math.floor(targetDiatonicIndex / PITCH_STEPS.length);
  const targetStepIndex =
    ((targetDiatonicIndex % PITCH_STEPS.length) + PITCH_STEPS.length) %
    PITCH_STEPS.length;
  if (targetOctave < 0 || targetOctave > 8) {
    return { ok: false, code: "derived-pitch-octave-out-of-range" };
  }

  const sourceNaturalSemitones = NATURAL_SEMITONES[sourceStepIndex];
  const targetNaturalSemitones = NATURAL_SEMITONES[targetStepIndex];
  const targetStep = PITCH_STEPS[targetStepIndex];
  if (
    sourceNaturalSemitones === undefined ||
    targetNaturalSemitones === undefined ||
    targetStep === undefined
  ) {
    return { ok: false, code: "written-pitch-invalid" };
  }

  const sourceChromatic =
    pitch.octave * 12 + sourceNaturalSemitones + pitch.alter;
  const targetChromatic = sourceChromatic + transposition.chromaticSemitones;
  if (!Number.isSafeInteger(targetChromatic)) {
    return { ok: false, code: "transposition-component-invalid" };
  }

  const targetNaturalChromatic = targetOctave * 12 + targetNaturalSemitones;
  const targetAlter = targetChromatic - targetNaturalChromatic;
  if (targetAlter < -2 || targetAlter > 2) {
    return { ok: false, code: "derived-pitch-alter-out-of-range" };
  }

  return {
    ok: true,
    value: { step: targetStep, alter: targetAlter, octave: targetOctave },
  };
}
