import type { ScoreDocument } from "../.kernel/src/core-kernel/index.js";
import { KEY_SIGNATURE_NAMESPACE } from "../.kernel/src/first-party-modules/key-signature.js";
import type { PlaybackSourceProjection } from "../src/contracts/playback.ts";
import { isPlaybackSourceProjection } from "../src/contracts/playback.ts";

function unsupported(document: ScoreDocument, documentVersion: number, code: string, message: string): PlaybackSourceProjection {
  return { kind: "unsupported", projectionVersion: 1, documentId: document.id, documentVersion, code, message };
}

function duration(base: number, dots: number) {
  if (!Number.isSafeInteger(base) || base <= 0 || !Number.isSafeInteger(dots) || dots < 0 || dots > 1) return null;
  return dots === 0 ? { numerator: 1, denominator: base } : { numerator: 3, denominator: base * 2 };
}

/** Playback facts from the same authoritative snapshot as the notation projection. */
export function projectPlaybackSource(document: ScoreDocument, documentVersion: number): PlaybackSourceProjection {
  const part = document.parts[0];
  if (document.parts.length !== 1 || !part) return unsupported(document, documentVersion,
    "playback.structure-unsupported", "第一版播放暂只支持单声部乐谱");
  if (document.extensions.some(block => block.namespace !== KEY_SIGNATURE_NAMESPACE)
    || document.measureDefinitions.some((measure) => measure.pickupDuration !== undefined)) {
    return unsupported(document, documentVersion, "playback.structure-unsupported", "当前乐谱结构暂不支持播放");
  }
  const contents = new Map(part.measureContents.map((content) => [content.measureId, content]));
  if (contents.size !== document.measureDefinitions.length || contents.size !== part.measureContents.length) {
    return unsupported(document, documentVersion, "playback.measure-content-invalid", "小节内容不完整，暂时无法播放");
  }
  const measures = [];
  for (const measure of document.measureDefinitions) {
    const content = contents.get(measure.id), voice = content?.voices[0];
    if (!content || content.voices.length !== 1 || !voice) return unsupported(document, documentVersion,
      "playback.voice-unsupported", "第一版播放暂只支持每小节一个声部");
    const events = [];
    for (const event of voice.sequence.events) {
      if (event.duration.timeModification !== undefined) return unsupported(document, documentVersion,
        "playback.rhythm-unsupported", "当前节奏暂不支持播放");
      const eventDuration = duration(event.duration.base, event.duration.dots);
      if (!eventDuration) return unsupported(document, documentVersion, "playback.rhythm-invalid", "乐谱包含无法播放的时值");
      if (event.content.kind === "rest") events.push({ id: event.id, duration: eventDuration, content: { kind: "rest" as const } });
      else if (event.content.notes.length === 1) events.push({ id: event.id, duration: eventDuration,
        content: { kind: "note" as const, writtenPitch: { ...event.content.notes[0]!.writtenPitch } } });
      else return unsupported(document, documentVersion, "playback.chord-unsupported", "第一版播放暂不支持和弦");
    }
    measures.push({ id: measure.id, meter: { ...measure.meter }, voiceStart: { ...voice.sequence.start }, events });
  }
  const projection: PlaybackSourceProjection = { kind: "ready", projectionVersion: 1, documentId: document.id,
    documentVersion, bpm: document.metadata.tempo.bpm, writtenToSounding: { ...part.instrument.writtenToSounding }, measures };
  return isPlaybackSourceProjection(projection) ? projection
    : unsupported(document, documentVersion, "playback.projection-invalid", "当前乐谱无法建立可靠的播放计划");
}
