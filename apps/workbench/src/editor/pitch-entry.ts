import { PITCH_STEPS } from "../contracts/note-input.ts";
import type { InputPitch } from "../contracts/note-input.ts";

export type PitchDraft = InputPitch["step"] | null;
interface EntryResult {
  readonly handled: boolean;
  readonly draft: PitchDraft;
  readonly pitch?: Pick<InputPitch, "step" | "octave">;
  readonly rest?: true;
  readonly message?: string;
}

/** Pure keyboard grammar: a letter is a draft; a valid octave completes one note. */
export function advancePitchEntry(draft: PitchDraft, key: string, repeat = false): EntryResult {
  const name = key.toUpperCase();
  const letter = (PITCH_STEPS as readonly string[]).includes(name);
  const digit = /^[0-9]$/.test(key);
  const handled = letter || digit || name === "R" || key === "Backspace";
  if (!handled || repeat) return { handled, draft };
  if (letter) return { handled, draft: name as InputPitch["step"] };
  if (key === "Backspace") return { handled, draft: null };
  if (name === "R") return { handled, draft: null, rest: true };
  if (draft === null) return { handled, draft, message: "先输入音名 A–G，再输入组号 2–6" };
  const octave = Number(key);
  if (octave < 2 || octave > 6) return { handled, draft, message: "当前支持组号 2–6，请重新输入组号" };
  return { handled, draft: null, pitch: { step: draft, octave } };
}
