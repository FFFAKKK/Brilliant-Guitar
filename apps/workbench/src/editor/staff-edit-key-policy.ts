import type { InputPitch, ScoreEventRange } from "../contracts/note-input.ts";
import type { StaffEvent, StaffView } from "../contracts/notation.ts";
import type { KeyPressSignal } from "../input/input-signal.ts";
import type { NoteControlChange, NoteOverview } from "./note-overview.ts";
import { stepNoteDuration, toggleNoteDot } from "./note-overview.ts";
import { adjacentEventAtPoint, previousEventAtPoint } from "./score-navigation.ts";
import type { ScoreEditPoint } from "./score-navigation.ts";

export type StaffEditKeyAction =
  | { readonly kind: "delete-event"; readonly eventId: string; readonly locateFirst?: ScoreEditPoint }
  | { readonly kind: "reject-delete"; readonly eventId: string; readonly measureId: string }
  | { readonly kind: "delete-range"; readonly range: ScoreEventRange }
  | { readonly kind: "cancel-composition" }
  | { readonly kind: "change"; readonly change: NoteControlChange }
  | { readonly kind: "compose-pitch"; readonly step: InputPitch["step"] };

export interface StaffEditKeyResolution {
  readonly handled: boolean;
  readonly action?: StaffEditKeyAction;
}

export interface StaffEditKeyContext {
  readonly view: StaffView;
  readonly point: ScoreEditPoint | null;
  readonly selectedEvent: StaffEvent | null;
  readonly selectedMeasureId: string | null;
  readonly canDelete: boolean;
  readonly activeStep: InputPitch["step"] | null;
  readonly selectedRange: ScoreEventRange | null;
  readonly overview: NoteOverview;
}

/** Converts staff editing keys into local commands without touching React or the kernel bridge. */
export function resolveStaffEditKey(signal: KeyPressSignal, context: StaffEditKeyContext): StaffEditKeyResolution | null {
  if (signal.modifiers.includes("ctrl") || signal.modifiers.includes("meta") || signal.modifiers.includes("alt")) return null;
  if (context.activeStep && signal.key === "Backspace") {
    return { handled: true, ...(signal.repeat ? {} : { action: { kind: "cancel-composition" } as const }) };
  }
  if (context.selectedRange && (signal.key === "Delete" || signal.key === "Backspace")) {
    return { handled: true, ...(signal.repeat ? {} : { action: { kind: "delete-range", range: context.selectedRange } as const }) };
  }
  const selected = context.selectedEvent;
  if (selected) {
    if (signal.key === "Delete" || signal.key === "Backspace") {
      if (signal.repeat) return { handled: true };
      if (context.canDelete) return { handled: true, action: { kind: "delete-event", eventId: selected.id } };
      return context.selectedMeasureId ? { handled: true,
        action: { kind: "reject-delete", eventId: selected.id, measureId: context.selectedMeasureId } } : { handled: true };
    }
    if (["+", "=", "-", "_", "."].includes(signal.key)) {
      if (signal.repeat) return { handled: true };
      const duration = signal.key === "." ? toggleNoteDot(context.overview.duration)
        : stepNoteDuration(context.overview.duration, signal.key === "+" || signal.key === "=" ? 1 : -1,
          context.overview.rest);
      return { handled: true, action: { kind: "change", change: { kind: "duration", value: duration } } };
    }
    if (/^[2-6]$/.test(signal.key) && context.activeStep && selected.content.kind === "note") {
      if (signal.repeat) return { handled: true };
      return { handled: true, action: { kind: "change", change: { kind: "pitch", value: {
        ...selected.content.pitch, step: context.activeStep, octave: Number(signal.key),
      } } } };
    }
    if (/^[a-g]$/i.test(signal.key) && selected.content.kind === "note") {
      if (signal.repeat) return { handled: true };
      return { handled: true, action: { kind: "compose-pitch", step: signal.key.toUpperCase() as InputPitch["step"] } };
    }
    if (/^r$/i.test(signal.key)) {
      if (signal.repeat) return { handled: true };
      return { handled: true, action: { kind: "change", change: { kind: "rest", value: true } } };
    }
    return null;
  }
  if (!context.point || (signal.key !== "Backspace" && signal.key !== "Delete")) return null;
  if (signal.repeat) return { handled: true };
  if (signal.key === "Backspace") {
    const previous = previousEventAtPoint(context.view, context.point);
    return { handled: true, ...(previous ? { action: { kind: "delete-event", eventId: previous.id,
      locateFirst: previous.start } as const } : {}) };
  }
  const next = adjacentEventAtPoint(context.view, context.point, 1);
  return { handled: true, ...(next ? { action: { kind: "delete-event", eventId: next } as const } : {}) };
}
