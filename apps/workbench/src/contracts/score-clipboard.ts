import { isEventProperties } from "./note-input.ts";
import type { EventProperties } from "./note-input.ts";

export const SCORE_CLIPBOARD_FORMAT = "brilliant-guitar.score-events" as const;
export const SCORE_CLIPBOARD_VERSION = 1 as const;
export const SCORE_CLIPBOARD_EVENT_LIMIT = 100;

export interface ScoreClipboardFragmentV1 {
  readonly format: typeof SCORE_CLIPBOARD_FORMAT;
  readonly version: typeof SCORE_CLIPBOARD_VERSION;
  readonly events: readonly EventProperties[];
}

export function createScoreClipboardFragment(events: readonly EventProperties[]): ScoreClipboardFragmentV1 {
  return { format: SCORE_CLIPBOARD_FORMAT, version: SCORE_CLIPBOARD_VERSION,
    events: events.map((event) => structuredClone(event)) };
}

export function isScoreClipboardFragmentV1(value: unknown): value is ScoreClipboardFragmentV1 {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const fragment = value as Record<string, unknown>;
  return fragment.format === SCORE_CLIPBOARD_FORMAT && fragment.version === SCORE_CLIPBOARD_VERSION
    && Array.isArray(fragment.events) && fragment.events.length > 0
    && fragment.events.length <= SCORE_CLIPBOARD_EVENT_LIMIT
    && fragment.events.every(isEventProperties);
}

export function encodeScoreClipboardFragment(fragment: ScoreClipboardFragmentV1): string {
  return JSON.stringify(fragment);
}

export function decodeScoreClipboardFragment(text: string): ScoreClipboardFragmentV1 | null {
  try {
    const value: unknown = JSON.parse(text);
    return isScoreClipboardFragmentV1(value) ? createScoreClipboardFragment(value.events) : null;
  } catch {
    return null;
  }
}
