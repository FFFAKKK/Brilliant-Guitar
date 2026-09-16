import { isEventProperties } from "./note-input.ts";
import type { InputContent, EventDuration } from "./note-input.ts";
/** A disposable read projection, never an editable document or a Core schema. */
export interface StaffEvent { readonly id: string; readonly duration: EventDuration; readonly content: InputContent }
export interface StaffMeasure {
  readonly events: readonly StaffEvent[];
  readonly id: string;
  readonly voiceId: string;
  readonly meter: { readonly numerator: number; readonly denominator: number };
}

export interface StaffView {
  readonly kind: "staff";
  readonly partId: string;
  readonly staffId: string;
  readonly clef: "treble";
  readonly measures: readonly StaffMeasure[];
}

export type NotationView = StaffView | { readonly kind: "unsupported"; readonly message: string };

export function isNotationView(value: unknown): value is NotationView {
  if (typeof value !== "object" || value === null) return false;
  const view = value as Record<string, unknown>;
  if (view.kind === "unsupported") return typeof view.message === "string" && view.message.length > 0;
  if (view.kind !== "staff" || view.clef !== "treble"
    || typeof view.partId !== "string" || !view.partId || typeof view.staffId !== "string" || !view.staffId
    || !Array.isArray(view.measures) || !view.measures.length) return false;
  const ids = new Set<string>();
  return view.measures.every((measure: unknown) => {
    if (typeof measure !== "object" || measure === null) return false;
    const item = measure as Record<string, unknown>;
    if (typeof item.id !== "string" || !item.id || ids.has(item.id) || typeof item.voiceId !== "string" || !item.voiceId
      || ids.has(item.voiceId) || typeof item.meter !== "object" || item.meter === null) return false;
    ids.add(item.id);
    ids.add(item.voiceId);
    if (!Array.isArray(item.events)) return false;
    for (const raw of item.events) {
      if (typeof raw !== "object" || raw === null) return false;
      const event = raw as Record<string, unknown>;
      if (typeof event.id !== "string" || !event.id || ids.has(event.id) || !isEventProperties(event)) return false;
      ids.add(event.id);
    }
    const meter = item.meter as Record<string, unknown>;
    return typeof meter.numerator === "number" && Number.isInteger(meter.numerator) && meter.numerator >= 1 && meter.numerator <= 32
      && typeof meter.denominator === "number" && [1, 2, 4, 8, 16, 32, 64].includes(meter.denominator);
  });
}
