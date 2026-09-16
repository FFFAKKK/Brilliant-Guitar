import { NOTE_BASES } from "../contracts/note-input.ts";
import type { InputDuration } from "../contracts/note-input.ts";

/** Plus shortens the value, minus lengthens it; dots remain a separate setting. */
export function stepInputDuration(duration: InputDuration, offset: -1 | 1): InputDuration {
  const index = NOTE_BASES.indexOf(duration.base);
  const base = NOTE_BASES[Math.max(0, Math.min(NOTE_BASES.length - 1, index + offset))]!;
  return { base, dots: duration.dots };
}
