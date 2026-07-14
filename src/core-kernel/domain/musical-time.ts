import {
  addFractions,
  createFraction,
  isCanonicalFraction,
  multiplyFractions,
  type Fraction,
  type FractionErrorCode,
} from "./fraction";

export type NoteValueBase = 1 | 2 | 4 | 8 | 16 | 32 | 64;
export type NoteValueDots = 0 | 1 | 2 | 3;

export interface TimeModification {
  readonly actualNotes: number;
  readonly normalNotes: number;
}

export interface NoteValue {
  readonly base: NoteValueBase;
  readonly dots: NoteValueDots;
  readonly timeModification?: TimeModification;
}

export interface Meter {
  readonly numerator: number;
  readonly denominator: NoteValueBase;
}

export type MusicalTimeErrorCode =
  | FractionErrorCode
  | "note-value-base-invalid"
  | "note-value-dots-invalid"
  | "note-value-time-modification-invalid"
  | "meter-numerator-invalid"
  | "meter-denominator-invalid"
  | "pickup-duration-invalid"
  | "sequence-start-invalid";

export type MusicalTimeResult =
  | { readonly ok: true; readonly value: Fraction }
  | { readonly ok: false; readonly code: MusicalTimeErrorCode };

export type FractionListResult =
  | { readonly ok: true; readonly value: readonly Fraction[] }
  | { readonly ok: false; readonly code: MusicalTimeErrorCode };

const NOTE_VALUE_BASES: readonly number[] = [1, 2, 4, 8, 16, 32, 64];
const NOTE_VALUE_DOTS: readonly number[] = [0, 1, 2, 3];

export function isNoteValueBase(value: number): value is NoteValueBase {
  return NOTE_VALUE_BASES.includes(value);
}

export function isNoteValueDots(value: number): value is NoteValueDots {
  return NOTE_VALUE_DOTS.includes(value);
}

export function getNoteValueDuration(value: NoteValue): MusicalTimeResult {
  if (!Number.isSafeInteger(value.base) || !isNoteValueBase(value.base)) {
    return { ok: false, code: "note-value-base-invalid" };
  }
  if (!Number.isSafeInteger(value.dots) || !isNoteValueDots(value.dots)) {
    return { ok: false, code: "note-value-dots-invalid" };
  }

  const baseDuration = createFraction(1, value.base);
  if (!baseDuration.ok) {
    return baseDuration;
  }
  const dotMultiplier = createFraction(
    2 ** (value.dots + 1) - 1,
    2 ** value.dots,
  );
  if (!dotMultiplier.ok) {
    return dotMultiplier;
  }
  const dottedDuration = multiplyFractions(
    baseDuration.value,
    dotMultiplier.value,
  );
  if (!dottedDuration.ok || value.timeModification === undefined) {
    return dottedDuration;
  }

  const { actualNotes, normalNotes } = value.timeModification;
  if (
    !Number.isSafeInteger(actualNotes) ||
    !Number.isSafeInteger(normalNotes) ||
    actualNotes <= 0 ||
    normalNotes <= 0
  ) {
    return { ok: false, code: "note-value-time-modification-invalid" };
  }
  const ratio = createFraction(normalNotes, actualNotes);
  return ratio.ok
    ? multiplyFractions(dottedDuration.value, ratio.value)
    : ratio;
}

export function getEffectiveMeasureDuration(
  meter: Meter,
  pickupDuration?: Fraction,
): MusicalTimeResult {
  if (!Number.isSafeInteger(meter.numerator) || meter.numerator <= 0) {
    return { ok: false, code: "meter-numerator-invalid" };
  }
  if (!isNoteValueBase(meter.denominator)) {
    return { ok: false, code: "meter-denominator-invalid" };
  }
  const measureDuration = createFraction(meter.numerator, meter.denominator);
  if (!measureDuration.ok || pickupDuration === undefined) {
    return measureDuration;
  }
  if (!isCanonicalFraction(pickupDuration) || pickupDuration.numerator <= 0) {
    return { ok: false, code: "pickup-duration-invalid" };
  }
  return { ok: true, value: pickupDuration };
}

export function deriveSequenceEventStarts(
  start: Fraction,
  durations: readonly NoteValue[],
): FractionListResult {
  if (!isCanonicalFraction(start) || start.numerator < 0) {
    return { ok: false, code: "sequence-start-invalid" };
  }

  const eventStarts: Fraction[] = [];
  let current = start;
  for (const duration of durations) {
    eventStarts.push(current);
    const derivedDuration = getNoteValueDuration(duration);
    if (!derivedDuration.ok) {
      return derivedDuration;
    }
    const next = addFractions(current, derivedDuration.value);
    if (!next.ok) {
      return next;
    }
    current = next.value;
  }
  return { ok: true, value: eventStarts };
}
