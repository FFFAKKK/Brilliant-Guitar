import type { ScoreDocument } from "../.kernel/src/core-kernel/index.js";
import type { KernelRuleWarningV1 } from "../.kernel/src/core-kernel/native/integrated-command-bus.js";
import { KEY_SIGNATURE_NAMESPACE, readPartKeySignatureTimelineV1 } from "../.kernel/src/first-party-modules/key-signature.js";
import { isEventProperties } from "../src/contracts/note-input.ts";
import type { StaffClef } from "../src/contracts/note-input.ts";
import type { StaffEvent } from "../src/contracts/notation.ts";
import type { NotationView } from "../src/contracts/notation.ts";
import { isNotationView } from "../src/contracts/notation.ts";

function projectClef(clef: Readonly<{ sign: "G" | "F" | "C"; line: 1 | 2 | 3 | 4 | 5 }>): StaffClef | null {
  if (clef.sign === "G" && clef.line === 2) return "treble";
  if (clef.sign === "F" && clef.line === 4) return "bass";
  if (clef.sign === "C" && clef.line === 3) return "alto";
  if (clef.sign === "C" && clef.line === 4) return "tenor";
  return null;
}

/** Read public snapshots only; unsupported contents must never appear as an empty score. */
export function projectNotation(document: ScoreDocument, warnings: readonly KernelRuleWarningV1[] = []): NotationView {
  const unsupported = (message: string): NotationView => ({ kind: "unsupported", message });
  const part = document.parts[0], staff = part?.staves[0];
  if (document.parts.length !== 1 || !part || part.staves.length !== 1 || !staff
    || staff.lineCount !== 5) {
    return unsupported("当前视图暂只支持单个五线谱表，文档已保留。");
  }
  const clef = projectClef(staff.defaultClef);
  if (!clef) return unsupported("当前视图暂不支持这个谱号，文档已保留。");
  if (document.extensions.some(block => block.namespace !== KEY_SIGNATURE_NAMESPACE)
    || document.measureDefinitions.some((measure) => measure.pickupDuration !== undefined)) {
    return unsupported("当前视图尚不能完整显示这份乐谱的内容，文档已保留。");
  }
  const timeline = readPartKeySignatureTimelineV1(document, part.id);
  if (timeline.status === "invalid") return unsupported("当前乐谱的调号数据无效，文档已保留。");
  const measureIndex = new Map(document.measureDefinitions.map((measure, index) => [measure.id, index]));
  const keySignatureChanges = timeline.changes.map(change => ({
    measureId: change.measureId,
    measureIndex: measureIndex.get(change.measureId) ?? -1,
    fifths: change.fifths,
  })).sort((left, right) => left.measureIndex - right.measureIndex);
  if (keySignatureChanges.some(change => change.measureIndex < 0)) {
    return unsupported("当前乐谱的调号位置无效，文档已保留。");
  }
  const warningsByMeasure = new Map<string, KernelRuleWarningV1[]>();
  for (const warning of warnings) {
    if (warning.code !== "rule.sequence-exceeds-measure" || warning.partId !== part.id) continue;
    const bucket = warningsByMeasure.get(warning.measureId) ?? [];
    bucket.push(warning);
    warningsByMeasure.set(warning.measureId, bucket);
  }
  const contents = new Map(part.measureContents.map((content) => [content.measureId, content]));
  if (contents.size !== document.measureDefinitions.length || contents.size !== part.measureContents.length) {
    return unsupported("小节内容不完整，暂时无法显示谱面。");
  }
  const projectedMeasures = new Map<string, { readonly voiceId: string; readonly events: StaffEvent[] }>();
  for (const measure of document.measureDefinitions) {
    const content = contents.get(measure.id), voice = content?.voices[0];
    if (!content || content.voices.length !== 1 || !voice || voice.defaultStaffId !== staff.id || voice.sequence.start.numerator !== 0) {
      return unsupported("当前视图暂只支持从小节起点开始的单声部，文档已保留。");
    }
    const projected: StaffEvent[] = [];
    for (const event of voice.sequence.events) {
      if (event.duration.timeModification !== undefined || (event.staffId !== undefined && event.staffId !== staff.id)) return unsupported("暂不支持该节奏或跨谱表内容，文档已保留。");
      const content = event.content.kind === "rest" ? { kind: "rest" as const } : event.content.notes.length === 1
        ? { kind: "note" as const, pitch: event.content.notes[0]!.writtenPitch } : null;
      const properties = { content, duration: { base: event.duration.base, dots: event.duration.dots } };
      if (!isEventProperties(properties)) return unsupported("暂只支持 C2–B6 单音、基础升降号和常用时值，文档已保留。");
      projected.push({ id: event.id, ...properties });
    }
    projectedMeasures.set(measure.id, { voiceId: voice.id, events: projected });
  }
  const view: NotationView = { kind: "staff", partId: part.id, staffId: staff.id, clef,
    tempoBpm: document.metadata.tempo.bpm,
    keySignatureChanges,
    measures: document.measureDefinitions.map((measure) => ({ id: measure.id, meter: { ...measure.meter },
      voiceId: projectedMeasures.get(measure.id)!.voiceId, events: projectedMeasures.get(measure.id)!.events,
      ruleWarnings: (warningsByMeasure.get(measure.id) ?? []).filter((warning) => warning.measureId === measure.id
        && warning.voiceId === projectedMeasures.get(measure.id)!.voiceId).map((warning) => ({
          code: "rule.sequence-exceeds-measure" as const, nominalDuration: warning.nominalDuration,
          actualDuration: warning.actualDuration, overflow: warning.overflow,
        })),
    })) };
  return isNotationView(view) ? view : unsupported("当前视图尚不支持这份乐谱的拍号，文档已保留。");
}
