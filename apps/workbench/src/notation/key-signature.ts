import type { InputPitch } from "../contracts/note-input.ts";
import type { StaffView } from "../contracts/notation.ts";

const KEY_SPECS = ["Cb", "Gb", "Db", "Ab", "Eb", "Bb", "F", "C", "G", "D", "A", "E", "B", "F#", "C#"] as const;
const SHARP_ORDER = ["F", "C", "G", "D", "A", "E", "B"] as const;
const FLAT_ORDER = ["B", "E", "A", "D", "G", "C", "F"] as const;

export interface MeasureKeySignatureState {
  readonly fifths: number;
  readonly previousFifths: number;
  readonly changed: boolean;
}

export function keySignatureSpec(fifths: number): string {
  return KEY_SPECS[fifths + 7] ?? "C";
}

export function keySignatureAlterForStep(fifths: number, step: InputPitch["step"]): InputPitch["alter"] {
  if (!Number.isSafeInteger(fifths) || fifths === 0 || fifths < -7 || fifths > 7) return 0;
  const order: readonly string[] = fifths > 0 ? SHARP_ORDER : FLAT_ORDER;
  return order.slice(0, Math.abs(fifths)).includes(step) ? (fifths > 0 ? 1 : -1) : 0;
}

export function keySignatureStates(view: StaffView): readonly MeasureKeySignatureState[] {
  const states: MeasureKeySignatureState[] = [];
  let current = 0;
  let changeIndex = 0;
  for (let measureIndex = 0; measureIndex < view.measures.length; measureIndex += 1) {
    const previousFifths = current;
    const change = view.keySignatureChanges?.[changeIndex];
    const changed = change?.measureIndex === measureIndex;
    if (changed) {
      current = change.fifths;
      changeIndex += 1;
    }
    states.push({ fifths: current, previousFifths, changed });
  }
  return states;
}

export function keySignatureFifthsAtMeasure(view: StaffView, measureId: string): number {
  const target = view.measures.findIndex(measure => measure.id === measureId);
  if (target < 0) return 0;
  const changes = view.keySignatureChanges ?? [];
  let low = 0, high = changes.length - 1, value = 0;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const change = changes[middle]!;
    if (change.measureIndex <= target) {
      value = change.fifths;
      low = middle + 1;
    } else high = middle - 1;
  }
  return value;
}
