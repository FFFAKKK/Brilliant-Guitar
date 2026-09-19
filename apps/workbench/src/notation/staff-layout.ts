import { PITCH_STEPS } from "../contracts/note-input.ts";
import type { StaffView, StaffMeasure } from "../contracts/notation.ts";
import { clefPitchRange } from "./clef-pitch-range.ts";
import { keySignatureStates } from "./key-signature.ts";

export interface MeasureLayout {
  readonly measure: StaffMeasure;
  readonly number: number;
  readonly system: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly beginsSystem: boolean;
  readonly showMeter: boolean;
  readonly keySignatureFifths: number;
  readonly previousKeySignatureFifths: number;
  readonly showKeySignature: boolean;
}

/** Notation geometry independent of a drawing library; paper units or legacy pixels. */
export interface StaffLayout {
  readonly width: number;
  readonly height: number;
  /** Omitted by the legacy pixel view; paper layouts specify their own staff space. */
  readonly staffSpace?: number;
  readonly clef: StaffView["clef"];
  readonly tempoBpm: number;
  readonly measures: readonly MeasureLayout[];
}

export function layoutStaff(view: StaffView, availableWidth: number): StaffLayout {
  const smallest = Math.min(16, ...view.measures.flatMap((measure) => measure.events.map((event) => 64 / event.duration.base)));
  const cellMinimum = Math.max(160, Math.ceil(Math.max(...view.measures.map((measure) => 64 * measure.meter.numerator / measure.meter.denominator)) / smallest * 28) + 32);
  const width = Math.max(240, cellMinimum > 160 ? cellMinimum + 104 : 240, Math.floor(Number.isFinite(availableWidth) ? availableWidth : 240));
  const pitches = view.measures.flatMap((measure) => measure.events.flatMap((event) => event.content.kind === "note" ? [event.content.pitch.octave * 7 + PITCH_STEPS.indexOf(event.content.pitch.step)] : []));
  const range = clefPitchRange(view.clef);
  const topExtra = Math.max(0, Math.max(range.top + 2, ...pitches) - (range.top + 2)) * 5;
  const bottomExtra = Math.max(0, (range.bottom - 6) - Math.min(range.bottom - 6, ...pitches)) * 5;
  const gutter = 12, prefix = 80, systemHeight = 152 + topExtra + bottomExtra;
  const columns = Math.min(view.measures.length, 4, Math.max(1, Math.floor((width - 2 * gutter - prefix) / cellMinimum)));
  const cellWidth = (width - 2 * gutter - prefix) / columns;
  const keySignatures = keySignatureStates(view);
  const measures = view.measures.map((measure, index): MeasureLayout => {
    const column = index % columns, system = Math.floor(index / columns);
    const previous = view.measures[index - 1];
    const keySignature = keySignatures[index]!;
    return { measure, number: index + 1, system, beginsSystem: column === 0,
      showMeter: !previous || previous.meter.numerator !== measure.meter.numerator || previous.meter.denominator !== measure.meter.denominator,
      keySignatureFifths: keySignature.fifths, previousKeySignatureFifths: keySignature.previousFifths,
      showKeySignature: column === 0 || keySignature.changed,
      x: gutter + column * cellWidth + (column === 0 ? 0 : prefix), y: 24 + topExtra + system * systemHeight,
      width: cellWidth + (column === 0 ? prefix : 0) };
  });
  return { width, height: Math.ceil(view.measures.length / columns) * systemHeight + 24,
    clef: view.clef, tempoBpm: view.tempoBpm, measures };
}
