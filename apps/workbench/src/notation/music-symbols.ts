import type { EventDuration } from "../contracts/note-input.ts";

/** SMuFL individual notes, rests, augmentation dot, and standard accidentals. */
const NOTES = { 1: "\uE1D2", 2: "\uE1D3", 4: "\uE1D5", 8: "\uE1D7", 16: "\uE1D9" } as const;
const RESTS = { 1: "\uE4E3", 2: "\uE4E4", 4: "\uE4E5", 8: "\uE4E6", 16: "\uE4E7", 32: "\uE4E8" } as const;
export const MUSIC_SYMBOLS = { dot: "\uE1E7", flat: "\uE260", natural: "\uE261", sharp: "\uE262" } as const;
export const DURATION_NAMES = { 1: "全", 2: "二分", 4: "四分", 8: "八分", 16: "十六分", 32: "三十二分" } as const;
export const durationSymbol = (duration: EventDuration, rest = false) => duration.base === 32 ? RESTS[32] : (rest ? RESTS : NOTES)[duration.base];
