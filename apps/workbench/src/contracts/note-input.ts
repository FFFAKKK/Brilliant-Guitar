export const NOTE_BASES = [1, 2, 4, 8, 16] as const;
export const PITCH_STEPS = ["C", "D", "E", "F", "G", "A", "B"] as const;
export interface InputDuration { readonly base: 1 | 2 | 4 | 8 | 16; readonly dots: 0 | 1 }
/** A 32nd rest can fill the gap left when a dotted 16th note is shortened. */
export type EventDuration = InputDuration | { readonly base: 32; readonly dots: 0 };
export interface InputPitch { readonly step: typeof PITCH_STEPS[number]; readonly octave: number; readonly alter: -1 | 0 | 1 }
export type InputSequenceAnchor = { readonly kind: "start" } | { readonly kind: "after-event"; readonly eventId: string };
export type InputContent = { readonly kind: "rest" } | { readonly kind: "note"; readonly pitch: InputPitch };
export interface EventProperties { readonly duration: EventDuration; readonly content: InputContent }
export type DeleteTimePolicy = "preserve" | "collapse";
export interface ScoreEventRange {
  readonly measureId: string;
  readonly voiceId: string;
  readonly startEventId: string;
  readonly endEventId: string;
}
export type ScoreEditAction = { readonly kind: "undo" } | { readonly kind: "redo" } | {
  readonly kind: "delete-event"; readonly eventId: string; readonly timePolicy?: DeleteTimePolicy;
}
  | { readonly kind: "delete-range"; readonly range: ScoreEventRange }
  | { readonly kind: "paste-fragment"; readonly measureId: string; readonly voiceId: string;
      readonly anchor: InputSequenceAnchor; readonly offsetUnits?: number;
      readonly fragment: import("./score-clipboard.ts").ScoreClipboardFragmentV1 }
  | { readonly kind: "set-event-properties"; readonly eventId: string; readonly properties: EventProperties }
  | { readonly kind: "set-title"; readonly title: string } | {
  readonly kind: "append"; readonly measureId: string; readonly anchor: InputSequenceAnchor;
  readonly offsetUnits?: number;
  readonly duration: InputDuration; readonly content: InputContent;
};
export interface ScoreEditRequest { readonly requestId: string; readonly documentId: string; readonly expectedVersion: number; readonly action: ScoreEditAction }
const record = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
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
export function isScoreEditRequest(v: unknown): v is ScoreEditRequest {
  if (!record(v) || typeof v.requestId !== "string" || !/^[a-f0-9-]{36}$/i.test(v.requestId)
    || typeof v.documentId !== "string" || !v.documentId || typeof v.expectedVersion !== "number"
    || !Number.isSafeInteger(v.expectedVersion) || v.expectedVersion < 0 || !record(v.action)) return false;
  const a = v.action;
  return a.kind === "undo" || a.kind === "redo" || (a.kind === "delete-event" && typeof a.eventId === "string" && !!a.eventId
      && (a.timePolicy === undefined || a.timePolicy === "preserve" || a.timePolicy === "collapse"))
    || (a.kind === "delete-range" && isScoreEventRange(a.range))
    || (a.kind === "paste-fragment" && typeof a.measureId === "string" && !!a.measureId
      && typeof a.voiceId === "string" && !!a.voiceId && isInputSequenceAnchor(a.anchor)
      && (a.offsetUnits === undefined || (typeof a.offsetUnits === "number" && Number.isSafeInteger(a.offsetUnits) && a.offsetUnits >= 0))
      && isScoreClipboardFragment(a.fragment))
    || (a.kind === "set-event-properties" && typeof a.eventId === "string" && !!a.eventId && isEventProperties(a.properties))
    || (a.kind === "set-title" && typeof a.title === "string" && a.title.trim().length <= 120)
    || (a.kind === "append" && typeof a.measureId === "string" && !!a.measureId
      && isInputSequenceAnchor(a.anchor)
      && (a.offsetUnits === undefined || (typeof a.offsetUnits === "number" && Number.isSafeInteger(a.offsetUnits) && a.offsetUnits >= 0))
      && isInputDuration(a.duration) && isInputContent(a.content));
}
function isScoreClipboardFragment(value: unknown): boolean {
  if (!record(value) || value.format !== "brilliant-guitar.score-events" || value.version !== 1
    || !Array.isArray(value.events) || value.events.length === 0 || value.events.length > 100) return false;
  return value.events.every(isEventProperties);
}
export function isScoreEventRange(value: unknown): value is ScoreEventRange {
  return record(value) && typeof value.measureId === "string" && !!value.measureId
    && typeof value.voiceId === "string" && !!value.voiceId
    && typeof value.startEventId === "string" && !!value.startEventId
    && typeof value.endEventId === "string" && !!value.endEventId;
}
export function isInputSequenceAnchor(value: unknown): value is InputSequenceAnchor {
  if (!record(value)) return false;
  return value.kind === "start" || (value.kind === "after-event" && typeof value.eventId === "string" && !!value.eventId);
}
/** Exact units for the supported binary and single-dotted durations. No floating beat accumulation. */
export const durationUnits = (duration: { readonly base: number; readonly dots: number }): number => 64 / duration.base * (duration.dots ? 1.5 : 1);
