import { isInputDuration, isMeterInput } from "./note-properties.ts";
import type { EventDuration } from "./note-properties.ts";
import { isExactFraction } from "./notation-model.ts";
import type { StaffMeasure } from "./notation-model.ts";

/** Instrument-owned dimensions; string 1 is the top line, not necessarily a guitar. */
export interface FrettedDimensions {
  readonly stringCount: number;
  /** Optional physical construction fact; never the notation input ceiling. */
  readonly fretCount: number | null;
  readonly capoFret: number;
}
export interface FrettedPosition { readonly stringNumber: number; readonly fret: number }
export interface FrettedPositionProperties {
  readonly kind: "fretted-position";
  readonly position: FrettedPosition;
}
export interface TablatureEvent {
  readonly id: string;
  readonly duration: EventDuration;
  readonly content: { readonly kind: "rest" }
    | { readonly kind: "note"; readonly noteId: string; readonly position: FrettedPosition };
}
export interface TablatureMeasure extends Omit<StaffMeasure, "events"> {
  readonly events: readonly TablatureEvent[];
}
/** A read projection, never a second score or persisted extension format. */
export interface TablatureView extends FrettedDimensions {
  readonly kind: "tablature";
  readonly partId: string;
  readonly staffId: string;
  readonly tempoBpm: number;
  readonly measures: readonly TablatureMeasure[];
}
export type TablatureProjection = TablatureView | { readonly kind: "unsupported"; readonly message: string };

export function isTablatureProjection(value: unknown): value is TablatureProjection {
  return isTablatureView(value) || (record(value) && value.kind === "unsupported"
    && typeof value.message === "string" && value.message.length > 0);
}

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export function isFrettedDimensions(value: unknown): value is FrettedDimensions {
  return record(value) && typeof value.stringCount === "number" && Number.isSafeInteger(value.stringCount)
    && value.stringCount >= 1 && value.stringCount <= 32
    && (value.fretCount === null || (typeof value.fretCount === "number" && Number.isSafeInteger(value.fretCount)
      && value.fretCount >= 1))
    && typeof value.capoFret === "number" && Number.isSafeInteger(value.capoFret)
    && value.capoFret >= 0;
}

export function isFrettedPosition(value: unknown, dimensions: FrettedDimensions): value is FrettedPosition {
  return isFrettedDimensions(dimensions) && record(value)
    && typeof value.stringNumber === "number" && Number.isSafeInteger(value.stringNumber)
    && value.stringNumber >= 1 && value.stringNumber <= dimensions.stringCount
    && typeof value.fret === "number" && Number.isSafeInteger(value.fret)
    && value.fret >= 0 && value.fret <= Number.MAX_SAFE_INTEGER - dimensions.capoFret;
}

export function isTablatureDuration(value: unknown, rest: boolean): value is EventDuration {
  return isInputDuration(value) || (rest && record(value) && value.base === 32 && value.dots === 0);
}

export function isTablatureView(value: unknown): value is TablatureView {
  if (!record(value) || !isFrettedDimensions(value) || value.kind !== "tablature"
    || typeof value.partId !== "string" || !value.partId || typeof value.staffId !== "string" || !value.staffId
    || typeof value.tempoBpm !== "number" || !Number.isFinite(value.tempoBpm) || value.tempoBpm <= 0
    || !Array.isArray(value.measures) || !value.measures.length) return false;
  const ids = new Set<string>([value.partId, value.staffId]);
  const unique = (id: unknown) => {
    if (typeof id !== "string" || !id || ids.has(id)) return false;
    ids.add(id); return true;
  };
  return value.measures.every(raw => {
    if (!record(raw) || !unique(raw.id) || !unique(raw.voiceId) || !isMeterInput(raw.meter)
      || !Array.isArray(raw.events) || !Array.isArray(raw.ruleWarnings)
      || !raw.ruleWarnings.every(warning => record(warning) && warning.code === "rule.sequence-exceeds-measure"
        && isExactFraction(warning.nominalDuration) && isExactFraction(warning.actualDuration)
        && isExactFraction(warning.overflow))) return false;
    return raw.events.every(event => {
      if (!record(event) || !unique(event.id) || !record(event.content)) return false;
      const content = event.content;
      if (!isTablatureDuration(event.duration, content.kind === "rest")) return false;
      return content.kind === "rest" || (content.kind === "note" && unique(content.noteId)
        && isFrettedPosition(content.position, value));
    });
  });
}
