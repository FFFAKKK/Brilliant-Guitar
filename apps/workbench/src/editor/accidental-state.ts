import type { InputPitch } from "../contracts/note-input.ts";
import type { StaffMeasure, StaffView } from "../contracts/notation.ts";
import type { ScoreEditPoint } from "./score-navigation.ts";

export type AccidentalState = "none" | "flat" | "natural" | "sharp";
export const ACCIDENTAL_STATES = ["none", "flat", "natural", "sharp"] as const;

const pitchKey = (pitch: Pick<InputPitch, "step" | "octave">) => `${pitch.step}/${pitch.octave}`;

export function alterForAccidental(state: AccidentalState, inherited: InputPitch["alter"]): InputPitch["alter"] {
  return state === "none" ? inherited : state === "flat" ? -1 : state === "sharp" ? 1 : 0;
}

export function accidentalForTransition(previous: InputPitch["alter"], current: InputPitch["alter"]): AccidentalState {
  return previous === current ? "none" : current === -1 ? "flat" : current === 1 ? "sharp" : "natural";
}

export function inheritedAlterBeforeEvent(measure: StaffMeasure, eventId: string,
  pitch: Pick<InputPitch, "step" | "octave">): InputPitch["alter"] {
  let inherited: InputPitch["alter"] = 0;
  const key = pitchKey(pitch);
  for (const event of measure.events) {
    if (event.id === eventId) break;
    if (event.content.kind === "note" && pitchKey(event.content.pitch) === key) inherited = event.content.pitch.alter;
  }
  return inherited;
}

export function accidentalForEvent(measure: StaffMeasure, eventId: string): AccidentalState {
  const event = measure.events.find((item) => item.id === eventId);
  if (!event || event.content.kind !== "note") return "none";
  return accidentalForTransition(inheritedAlterBeforeEvent(measure, eventId, event.content.pitch), event.content.pitch.alter);
}

/** Resolve the accidental already active at an insertion point. Key signatures are not in the V1 projection yet. */
export function inheritedAlterAtPoint(view: StaffView, point: ScoreEditPoint,
  pitch: Pick<InputPitch, "step" | "octave">): InputPitch["alter"] {
  const measure = view.measures.find((item) => item.id === point.measureId);
  if (!measure || point.anchor.kind === "start") return 0;
  let inherited: InputPitch["alter"] = 0;
  const key = pitchKey(pitch);
  for (const event of measure.events) {
    if (event.content.kind === "note" && pitchKey(event.content.pitch) === key) inherited = event.content.pitch.alter;
    if (event.id === point.anchor.eventId) break;
  }
  return inherited;
}
