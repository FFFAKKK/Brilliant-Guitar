import { NOTE_BASES } from "../note-properties.ts";
import type { InputDuration } from "../note-properties.ts";

/** Plus shortens the value, minus lengthens it; dots remain a separate setting. */
export function stepInputDuration(duration: InputDuration, offset: -1 | 1): InputDuration {
  const index = NOTE_BASES.indexOf(duration.base);
  const base = NOTE_BASES[Math.max(0, Math.min(NOTE_BASES.length - 1, index + offset))]!;
  return { base, dots: duration.dots };
}
