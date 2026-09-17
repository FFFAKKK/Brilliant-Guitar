import type { EventDuration, InputDuration, InputPitch, ScoreEditAction } from "../contracts/note-input.ts";
import { durationUnits } from "../contracts/note-input.ts";
import type { StaffEvent, StaffMeasure } from "../contracts/notation.ts";
import type { PitchDraft } from "./pitch-entry.ts";
import { stepInputDuration } from "./input-duration.ts";
import { capacityUnits } from "../notation/input-position.ts";
import type { AccidentalState } from "./accidental-state.ts";

export interface InputPreview {
  readonly duration: InputDuration;
  readonly alter: InputPitch["alter"];
  readonly accidental: AccidentalState;
  readonly rest: boolean;
  readonly draft: PitchDraft;
  readonly pitch: InputPitch | null;
}
export interface NoteOverview {
  readonly source: "input" | "selection";
  readonly duration: EventDuration;
  readonly alter: InputPitch["alter"];
  readonly accidental: AccidentalState;
  readonly rest: boolean;
  readonly pitch: { readonly step: InputPitch["step"]; readonly octave: number | null; readonly alter: InputPitch["alter"] } | null;
  readonly measureShare: string | null;
}

/** Exact occupancy of the entire bar, including dots; never assume a missing meter is 4/4. */
export function getMeasureShare(duration: EventDuration, meter: StaffMeasure["meter"] | null | undefined): string | null {
  if (!meter) return null;
  const units = durationUnits(duration), capacity = capacityUnits({ meter });
  if (!Number.isSafeInteger(capacity) || capacity <= 0) return null;
  let a = units, b = capacity;
  while (b) { const remainder = a % b; a = b; b = remainder; }
  return `${units / a}/${capacity / a}`;
}

/** Selection is resolved from the current read; an incomplete draft never borrows an octave. */
export function resolveNoteOverview(input: InputPreview, selected?: StaffEvent, meter?: StaffMeasure["meter"] | null,
  selectedAccidental: AccidentalState = "none"): NoteOverview {
  if (selected) {
    const pitch = selected.content.kind === "note" ? selected.content.pitch : null;
    return { source: "selection", duration: selected.duration, alter: pitch?.alter ?? 0, accidental: selectedAccidental,
      rest: selected.content.kind === "rest", pitch, measureShare: getMeasureShare(selected.duration, meter) };
  }
  const pitch = input.rest ? null : input.draft ? { step: input.draft, octave: null, alter: input.alter }
    : input.pitch ? { ...input.pitch, alter: input.alter } : null;
  return { source: "input", duration: input.duration, alter: input.alter, accidental: input.accidental, rest: input.rest, pitch,
    measureShare: getMeasureShare(input.duration, meter) };
}

/** A 32nd is only legal for undotted rests in the current editing contract. */
export function stepNoteDuration(duration: EventDuration, offset: -1 | 1, rest: boolean): EventDuration {
  if (duration.base === 32) return offset === 1 ? duration : { base: 16, dots: 0 };
  if (rest && !duration.dots && duration.base === 16 && offset === 1) return { base: 32, dots: 0 };
  return stepInputDuration(duration, offset);
}
export function toggleNoteDot(duration: EventDuration): EventDuration {
  return duration.base === 32 ? duration : { ...duration, dots: duration.dots ? 0 : 1 };
}

export type NoteChange = { readonly kind: "duration"; readonly value: EventDuration }
  | { readonly kind: "alter"; readonly value: InputPitch["alter"] }
  | { readonly kind: "pitch"; readonly value: InputPitch }
  | { readonly kind: "rest"; readonly value: boolean };

export type NoteControlChange = Exclude<NoteChange, { readonly kind: "alter" }>
  | { readonly kind: "accidental"; readonly value: AccidentalState };

/** Preserve the selected event's identity, spelling and other properties. Core validates timing. */
export function selectedNoteAction(event: StaffEvent, change: NoteChange): ScoreEditAction | null {
  if (change.kind === "rest") return event.content.kind === "note" && change.value
    ? { kind: "delete-event", eventId: event.id } : null;
  if ((change.kind === "alter" || change.kind === "pitch") && event.content.kind === "rest") return null;
  const content = change.kind === "alter" && event.content.kind === "note"
    ? { kind: "note" as const, pitch: { ...event.content.pitch, alter: change.value } }
    : change.kind === "pitch" && event.content.kind === "note"
      ? { kind: "note" as const, pitch: change.value } : event.content;
  const duration = change.kind === "duration" ? change.value : event.duration;
  if (duration.base === 32 && content.kind !== "rest") return null;
  return { kind: "set-event-properties", eventId: event.id, properties: { content, duration } };
}
