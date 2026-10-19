// Shared read-only notation properties, extracted from the established Workbench.
const record = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
export const NOTE_BASES = [1, 2, 4, 8, 16] as const;
export const PITCH_STEPS = ["C", "D", "E", "F", "G", "A", "B"] as const;
export interface InputDuration { readonly base: 1 | 2 | 4 | 8 | 16; readonly dots: 0 | 1 }
/** A 32nd rest can fill the gap left when a dotted 16th note is shortened. */
export type EventDuration = InputDuration | { readonly base: 32; readonly dots: 0 };
export interface InputPitch { readonly step: typeof PITCH_STEPS[number]; readonly octave: number; readonly alter: -1 | 0 | 1 }
export type InputSequenceAnchor = { readonly kind: "start" } | { readonly kind: "after-event"; readonly eventId: string };
export type InputContent = { readonly kind: "rest" } | { readonly kind: "note"; readonly pitch: InputPitch };
export interface EventProperties { readonly duration: EventDuration; readonly content: InputContent }
/** Compare musical properties only; event identity and derived geometry are separate. */
export function equalEventProperties(a: EventProperties, b: EventProperties): boolean {
  return a.duration.base === b.duration.base && a.duration.dots === b.duration.dots
    && (a.content.kind === "rest" ? b.content.kind === "rest" : b.content.kind === "note"
      && a.content.pitch.step === b.content.pitch.step && a.content.pitch.octave === b.content.pitch.octave
      && a.content.pitch.alter === b.content.pitch.alter);
}
export const METER_DENOMINATORS = [1, 2, 4, 8, 16, 32, 64] as const;
export interface MeterInput {
  readonly numerator: number;
  readonly denominator: typeof METER_DENOMINATORS[number];
}
export const STAFF_CLEFS = ["treble", "bass", "alto", "tenor"] as const;
export type StaffClef = typeof STAFF_CLEFS[number];
export function isInputDuration(v: unknown): v is InputDuration {
  return record(v) && (NOTE_BASES as readonly unknown[]).includes(v.base) && (v.dots === 0 || v.dots === 1);
}
export function isEventProperties(v: unknown): v is EventProperties {
  return record(v) && isInputContent(v.content) && (isInputDuration(v.duration)
    || (v.content.kind === "rest" && record(v.duration) && v.duration.base === 32 && v.duration.dots === 0));
}
export function isInputContent(v: unknown): v is InputContent {
  if (!record(v)) return false;
  if (v.kind === "rest") return true;
  const p = v.pitch;
  return v.kind === "note" && record(p) && (PITCH_STEPS as readonly unknown[]).includes(p.step)
    && typeof p.octave === "number" && Number.isInteger(p.octave) && p.octave >= 2 && p.octave <= 6 && [-1, 0, 1].includes(p.alter as number);
}
export function isMeterInput(value: unknown): value is MeterInput {
  return record(value) && typeof value.numerator === "number" && Number.isSafeInteger(value.numerator)
    && value.numerator >= 1 && value.numerator <= 32
    && typeof value.denominator === "number"
    && (METER_DENOMINATORS as readonly number[]).includes(value.denominator);
}
/** Exact units for the supported binary and single-dotted durations. No floating beat accumulation. */
export const durationUnits = (duration: { readonly base: number; readonly dots: number }): number => 64 / duration.base * (duration.dots ? 1.5 : 1);
export const capacityUnits = (measure: { readonly meter: { readonly numerator: number; readonly denominator: number } }): number => 64 * measure.meter.numerator / measure.meter.denominator;
