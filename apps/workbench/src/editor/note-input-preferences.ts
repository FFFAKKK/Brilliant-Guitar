import type { NoteInputPreferencesV1 } from "../contracts/application-settings.ts";
import type { InputDuration, InputPitch } from "../contracts/note-input.ts";
import type { AccidentalState } from "./accidental-state.ts";

export interface NoteInputToolState {
  readonly duration: InputDuration;
  readonly accidental: AccidentalState;
  readonly alter: InputPitch["alter"];
  readonly rest: boolean;
  readonly previewPitch: InputPitch | null;
}

/** Applies the saved post-entry policy only after an insertion has committed. */
export function retainedNoteInputToolState(state: NoteInputToolState,
  preferences: NoteInputPreferencesV1): NoteInputToolState {
  if (preferences.retention === "all") return state;
  return {
    duration: preferences.retention === "reset" ? preferences.defaultDuration : state.duration,
    accidental: "none",
    alter: 0,
    rest: false,
    previewPitch: null,
  };
}
