import type { ExactFraction } from "../contracts/notation.ts";
import type { PlaybackSourceProjection, PlaybackWrittenPitch } from "../contracts/playback.ts";
import { addFractions, fraction, fractionToNumber, maxFraction } from "./exact-fraction.ts";

export interface PlaybackPlanItem {
  readonly eventId: string;
  readonly measureId: string;
  readonly start: ExactFraction;
  readonly duration: ExactFraction;
  readonly startSeconds: number;
  readonly durationSeconds: number;
  readonly midi: number | null;
}

export interface PlaybackMeasureSpan {
  readonly measureId: string;
  readonly start: ExactFraction;
  readonly duration: ExactFraction;
  readonly startSeconds: number;
  readonly durationSeconds: number;
}

export interface PlaybackPlan {
  readonly documentId: string;
  readonly documentVersion: number;
  readonly bpm: number;
  readonly duration: ExactFraction;
  readonly durationSeconds: number;
  readonly items: readonly PlaybackPlanItem[];
  readonly measures: readonly PlaybackMeasureSpan[];
}

export type PlaybackPlanProjection = { readonly kind: "ready"; readonly plan: PlaybackPlan }
  | { readonly kind: "unsupported"; readonly code: string; readonly message: string };

const STEP_SEMITONES: Readonly<Record<PlaybackWrittenPitch["step"], number>> = {
  C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11,
};

function soundingMidi(pitch: PlaybackWrittenPitch, chromaticSemitones: number): number {
  const value = (pitch.octave + 1) * 12 + STEP_SEMITONES[pitch.step] + pitch.alter + chromaticSemitones;
  if (!Number.isSafeInteger(value) || value < 0 || value > 127) throw new RangeError("Sounding pitch is outside MIDI range");
  return value;
}

function seconds(value: ExactFraction, bpm: number): number {
  return fractionToNumber(value) * 240 / bpm;
}

/** Compiles authoritative playback facts without consulting rendered notation geometry. */
export function projectPlaybackPlan(source: PlaybackSourceProjection): PlaybackPlanProjection {
  if (source.kind === "unsupported") return { kind: "unsupported", code: source.code, message: source.message };
  try {
    const items: PlaybackPlanItem[] = [], measures: PlaybackMeasureSpan[] = [];
    let documentOffset = fraction(0, 1);
    for (const measure of source.measures) {
      const nominal = fraction(measure.meter.numerator, measure.meter.denominator);
      let voiceOffset = fraction(measure.voiceStart.numerator, measure.voiceStart.denominator);
      for (const event of measure.events) {
        const duration = fraction(event.duration.numerator, event.duration.denominator);
        const start = addFractions(documentOffset, voiceOffset);
        items.push({ eventId: event.id, measureId: measure.id, start, duration,
          startSeconds: seconds(start, source.bpm), durationSeconds: seconds(duration, source.bpm),
          midi: event.content.kind === "rest" ? null
            : soundingMidi(event.content.writtenPitch, source.writtenToSounding.chromaticSemitones) });
        voiceOffset = addFractions(voiceOffset, duration);
      }
      const span = maxFraction(nominal, voiceOffset);
      measures.push({ measureId: measure.id, start: documentOffset, duration: span,
        startSeconds: seconds(documentOffset, source.bpm), durationSeconds: seconds(span, source.bpm) });
      documentOffset = addFractions(documentOffset, span);
    }
    return { kind: "ready", plan: { documentId: source.documentId, documentVersion: source.documentVersion,
      bpm: source.bpm, duration: documentOffset, durationSeconds: seconds(documentOffset, source.bpm), items, measures } };
  } catch (error) {
    return { kind: "unsupported", code: "playback.plan-invalid",
      message: error instanceof Error ? error.message : "无法建立可靠的播放计划" };
  }
}

export interface PlaybackLocation {
  readonly measureId: string;
  readonly eventId: string | null;
  readonly eventProgress: number;
  readonly measureProgress: number;
}

export interface PlaybackStartPoint {
  readonly measureId: string;
  readonly eventId?: string | null;
  readonly offsetUnits?: number;
}

export function playbackStartSeconds(plan: PlaybackPlan, point: PlaybackStartPoint): number {
  const event = point.eventId ? plan.items.find((item) => item.eventId === point.eventId) : null;
  if (event) return event.startSeconds;
  const measure = plan.measures.find((item) => item.measureId === point.measureId);
  if (!measure) return 0;
  const rhythmicOffset = Number.isSafeInteger(point.offsetUnits) && (point.offsetUnits ?? 0) >= 0
    ? (point.offsetUnits ?? 0) / 64 * 240 / plan.bpm : 0;
  return Math.min(plan.durationSeconds, measure.startSeconds + rhythmicOffset);
}

export function locatePlaybackPosition(plan: PlaybackPlan, positionSeconds: number): PlaybackLocation | null {
  const clamped = Math.min(Math.max(0, positionSeconds), plan.durationSeconds);
  const measure = plan.measures.find((item, index) => clamped < item.startSeconds + item.durationSeconds
    || index === plan.measures.length - 1);
  if (!measure) return null;
  const event = plan.items.find((item) => item.measureId === measure.measureId
    && clamped >= item.startSeconds && clamped < item.startSeconds + item.durationSeconds);
  return {
    measureId: measure.measureId,
    eventId: event?.eventId ?? null,
    eventProgress: event ? Math.min(1, Math.max(0, (clamped - event.startSeconds) / event.durationSeconds)) : 0,
    measureProgress: measure.durationSeconds > 0
      ? Math.min(1, Math.max(0, (clamped - measure.startSeconds) / measure.durationSeconds)) : 0,
  };
}
