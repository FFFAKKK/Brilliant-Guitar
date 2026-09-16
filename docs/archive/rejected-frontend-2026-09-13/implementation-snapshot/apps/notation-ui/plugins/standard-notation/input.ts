import type { Pitch, PitchStep } from '../../contracts';
export const STEPS: readonly PitchStep[] = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
export function shiftPitch(pitch: Pitch, direction: number): Pitch | null {
  const value = pitch.octave * 7 + STEPS.indexOf(pitch.step) + direction;
  if (value < 21 || value > 48) return null;
  return { step: STEPS[value % 7]!, octave: Math.floor(value / 7), alter: 0 };
}
export function pitchLabel(pitch: Pitch | null) { return pitch ? `${pitch.step}${pitch.octave}` : '休止'; }
