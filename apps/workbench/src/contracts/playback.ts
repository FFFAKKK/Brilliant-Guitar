import { isExactFraction } from "./notation.ts";
import type { ExactFraction } from "./notation.ts";

export interface PlaybackTransposition {
  readonly diatonicSteps: number;
  readonly chromaticSemitones: number;
}

export interface PlaybackWrittenPitch {
  readonly step: "C" | "D" | "E" | "F" | "G" | "A" | "B";
  readonly alter: number;
  readonly octave: number;
}

export interface PlaybackSourceEvent {
  readonly id: string;
  readonly duration: ExactFraction;
  readonly content: { readonly kind: "rest" }
    | { readonly kind: "note"; readonly writtenPitch: PlaybackWrittenPitch };
}

export interface PlaybackSourceMeasure {
  readonly id: string;
  readonly meter: { readonly numerator: number; readonly denominator: number };
  readonly voiceStart: ExactFraction;
  readonly events: readonly PlaybackSourceEvent[];
}

export type PlaybackSourceProjection = {
  readonly kind: "ready";
  readonly projectionVersion: 1;
  readonly documentId: string;
  readonly documentVersion: number;
  readonly bpm: number;
  readonly writtenToSounding: PlaybackTransposition;
  readonly measures: readonly PlaybackSourceMeasure[];
} | {
  readonly kind: "unsupported";
  readonly projectionVersion: 1;
  readonly documentId: string;
  readonly documentVersion: number;
  readonly code: string;
  readonly message: string;
};

const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const integer = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value);

function isPitch(value: unknown): value is PlaybackWrittenPitch {
  if (!record(value)) return false;
  return typeof value.step === "string" && ["C", "D", "E", "F", "G", "A", "B"].includes(value.step)
    && integer(value.alter) && value.alter >= -2 && value.alter <= 2
    && integer(value.octave) && value.octave >= 0 && value.octave <= 8;
}

function isEvent(value: unknown): value is PlaybackSourceEvent {
  if (!record(value) || typeof value.id !== "string" || !value.id || !isExactFraction(value.duration) || !record(value.content)) return false;
  return value.content.kind === "rest" || (value.content.kind === "note" && isPitch(value.content.writtenPitch));
}

function isMeasure(value: unknown): value is PlaybackSourceMeasure {
  if (!record(value) || typeof value.id !== "string" || !value.id || !record(value.meter)
    || !integer(value.meter.numerator) || value.meter.numerator < 1
    || !integer(value.meter.denominator) || value.meter.denominator < 1
    || !isExactFraction(value.voiceStart) || !Array.isArray(value.events)) return false;
  const ids = new Set<string>();
  return value.events.every((event) => isEvent(event) && !ids.has(event.id) && !!ids.add(event.id));
}

export function isPlaybackSourceProjection(value: unknown): value is PlaybackSourceProjection {
  if (!record(value) || value.projectionVersion !== 1 || typeof value.documentId !== "string" || !value.documentId
    || !integer(value.documentVersion) || value.documentVersion < 0) return false;
  if (value.kind === "unsupported") return typeof value.code === "string" && !!value.code
    && typeof value.message === "string" && !!value.message;
  if (value.kind !== "ready" || typeof value.bpm !== "number" || !Number.isFinite(value.bpm) || value.bpm <= 0
    || !record(value.writtenToSounding) || !integer(value.writtenToSounding.diatonicSteps)
    || !integer(value.writtenToSounding.chromaticSemitones) || !Array.isArray(value.measures) || !value.measures.length) return false;
  const ids = new Set<string>();
  const eventIds = new Set<string>();
  return value.measures.every((measure) => isMeasure(measure) && !ids.has(measure.id) && !!ids.add(measure.id)
    && measure.events.every((event) => !eventIds.has(event.id) && !!eventIds.add(event.id)));
}
