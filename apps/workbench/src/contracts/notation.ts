import { isEventProperties } from "./note-input.ts";
import type { InputContent, EventDuration, StaffClef } from "./note-input.ts";
/** A disposable read projection, never an editable document or a Core schema. */
export interface StaffEvent { readonly id: string; readonly duration: EventDuration; readonly content: InputContent }
export interface ExactFraction { readonly numerator: number; readonly denominator: number }
export interface StaffRuleWarning {
  readonly code: "rule.sequence-exceeds-measure";
  readonly nominalDuration: ExactFraction;
  readonly actualDuration: ExactFraction;
  readonly overflow: ExactFraction;
}
export interface StaffMeasure {
  readonly events: readonly StaffEvent[];
  readonly id: string;
  readonly voiceId: string;
  readonly meter: { readonly numerator: number; readonly denominator: number };
  readonly ruleWarnings: readonly StaffRuleWarning[];
}
export interface KeySignatureChangeView {
  readonly measureId: string;
  readonly measureIndex: number;
  readonly fifths: number;
}

export interface StaffView {
  readonly kind: "staff";
  readonly partId: string;
  readonly staffId: string;
  readonly clef: StaffClef;
  readonly tempoBpm: number;
  /** Absent only for older in-process projection clients; current hosts always emit the sparse list. */
  readonly keySignatureChanges?: readonly KeySignatureChangeView[];
  readonly measures: readonly StaffMeasure[];
}

export type NotationView = StaffView | { readonly kind: "unsupported"; readonly message: string };

export function isExactFraction(value: unknown): value is ExactFraction {
  if (typeof value !== "object" || value === null) return false;
  const fraction = value as Record<string, unknown>;
  return typeof fraction.numerator === "number" && Number.isSafeInteger(fraction.numerator)
    && typeof fraction.denominator === "number" && Number.isSafeInteger(fraction.denominator)
    && fraction.denominator > 0;
}

function isStaffRuleWarning(value: unknown): value is StaffRuleWarning {
  if (typeof value !== "object" || value === null) return false;
  const warning = value as Record<string, unknown>;
  return warning.code === "rule.sequence-exceeds-measure"
    && isExactFraction(warning.nominalDuration) && isExactFraction(warning.actualDuration)
    && isExactFraction(warning.overflow);
}

export function isNotationView(value: unknown): value is NotationView {
  if (typeof value !== "object" || value === null) return false;
  const view = value as Record<string, unknown>;
  if (view.kind === "unsupported") return typeof view.message === "string" && view.message.length > 0;
  if (view.kind !== "staff" || !["treble", "bass", "alto", "tenor"].includes(view.clef as string)
    || typeof view.partId !== "string" || !view.partId || typeof view.staffId !== "string" || !view.staffId
    || typeof view.tempoBpm !== "number" || !Number.isFinite(view.tempoBpm) || view.tempoBpm <= 0
    || (view.keySignatureChanges !== undefined && !Array.isArray(view.keySignatureChanges))
    || !Array.isArray(view.measures) || !view.measures.length) return false;
  const ids = new Set<string>();
  const measuresValid = view.measures.every((measure: unknown) => {
    if (typeof measure !== "object" || measure === null) return false;
    const item = measure as Record<string, unknown>;
    if (typeof item.id !== "string" || !item.id || ids.has(item.id) || typeof item.voiceId !== "string" || !item.voiceId
      || ids.has(item.voiceId) || typeof item.meter !== "object" || item.meter === null) return false;
    ids.add(item.id);
    ids.add(item.voiceId);
    if (!Array.isArray(item.events) || !Array.isArray(item.ruleWarnings)
      || !item.ruleWarnings.every(isStaffRuleWarning)) return false;
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
  if (!measuresValid) return false;
  const measures = view.measures as readonly Record<string, unknown>[];
  let previousIndex = -1;
  return (view.keySignatureChanges ?? []).every((raw: unknown) => {
    if (typeof raw !== "object" || raw === null) return false;
    const change = raw as Record<string, unknown>;
    if (typeof change.measureId !== "string" || !change.measureId
      || typeof change.measureIndex !== "number" || !Number.isSafeInteger(change.measureIndex)
      || change.measureIndex <= previousIndex || change.measureIndex >= measures.length
      || measures[change.measureIndex]?.id !== change.measureId
      || typeof change.fifths !== "number" || !Number.isSafeInteger(change.fifths)
      || change.fifths < -7 || change.fifths > 7) return false;
    previousIndex = change.measureIndex;
    return true;
  });
}
