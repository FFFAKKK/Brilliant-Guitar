import { durationUnits, PITCH_STEPS } from "../contracts/note-input.ts";
import type { InputPitch } from "../contracts/note-input.ts";
import type { StaffMeasure, StaffView } from "../contracts/notation.ts";
export const usedUnits = (measure: StaffMeasure): number => measure.events.reduce((total, event) => total + durationUnits(event.duration), 0);
export const capacityUnits = (measure: Pick<StaffMeasure, "meter">): number => 64 * measure.meter.numerator / measure.meter.denominator;
export function nextMeasure(view: StaffView, measureId: string): string {
  const index = view.measures.findIndex((measure) => measure.id === measureId);
  const measure = view.measures[index];
  return measure && usedUnits(measure) >= capacityUnits(measure) ? view.measures[index + 1]?.id ?? measureId : measureId;
}
export function pitchAtY(y: number, staffBottom: number, spacing: number): InputPitch {
  const diatonic = Math.max(14, Math.min(48, 4 * 7 + 2 + Math.round((staffBottom - y) / (spacing / 2))));
  return { step: PITCH_STEPS[diatonic % 7]!, octave: Math.floor(diatonic / 7), alter: 0 };
}

/** Inverse of pitchAtY for the editing overlay; accidentals do not change staff height. */
export function yForPitch(pitch: InputPitch, staffBottom: number, spacing: number): number {
  const diatonic = pitch.octave * 7 + PITCH_STEPS.indexOf(pitch.step);
  return staffBottom - (diatonic - (4 * 7 + 2)) * spacing / 2;
}
