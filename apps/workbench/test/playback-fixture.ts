import type { PlaybackSourceProjection } from "../src/contracts/playback.ts";

export function readyPlaybackSource(documentId: string, documentVersion: number,
  measureIds: readonly string[] = ["measure"]): PlaybackSourceProjection {
  return {
    kind: "ready",
    projectionVersion: 1,
    documentId,
    documentVersion,
    bpm: 96,
    writtenToSounding: { diatonicSteps: 0, chromaticSemitones: 0 },
    measures: measureIds.map((id) => ({
      id,
      meter: { numerator: 4, denominator: 4 },
      voiceStart: { numerator: 0, denominator: 1 },
      events: [],
    })),
  };
}

export function unsupportedPlaybackSource(documentId: string, documentVersion: number): PlaybackSourceProjection {
  return {
    kind: "unsupported",
    projectionVersion: 1,
    documentId,
    documentVersion,
    code: "playback.test-unsupported",
    message: "仅测试不支持的播放源",
  };
}
