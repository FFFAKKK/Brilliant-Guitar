import type { StaffClef } from "../contracts/note-input.ts";

/** Diatonic pitch indexes on the bottom and top lines of a conventional five-line staff. */
export function clefPitchRange(clef: StaffClef): Readonly<{ bottom: number; top: number }> {
  if (clef === "bass") return { bottom: 18, top: 26 }; // G2–A3
  if (clef === "alto") return { bottom: 24, top: 32 }; // F3–G4
  if (clef === "tenor") return { bottom: 22, top: 30 }; // D3–E4
  return { bottom: 30, top: 38 }; // E4–F5
}
