import type { ScoreDocument } from "../.kernel/src/core-kernel/index.js";
import type { KernelRuleWarningV1 } from "../.kernel/src/core-kernel/native/integrated-command-bus.js";
import { isEventProperties } from "../src/contracts/note-input.ts";
import type { StaffEvent } from "../src/contracts/notation.ts";
import type { NotationView } from "../src/contracts/notation.ts";
import { isNotationView } from "../src/contracts/notation.ts";

/** Read public snapshots only; unsupported contents must never appear as an empty score. */
export function projectNotation(document: ScoreDocument, warnings: readonly KernelRuleWarningV1[] = []): NotationView {
  const unsupported = (message: string): NotationView => ({ kind: "unsupported", message });
  const part = document.parts[0], staff = part?.staves[0];
  if (document.parts.length !== 1 || !part || part.staves.length !== 1 || !staff
    || staff.lineCount !== 5 || staff.defaultClef.sign !== "G" || staff.defaultClef.line !== 2) {
    return unsupported("当前视图暂只支持单谱表的高音五线谱，文档已保留。");
  }
  if (document.extensions.length || document.measureDefinitions.some((measure) => measure.pickupDuration !== undefined)) {
    return unsupported("当前视图尚不能完整显示这份乐谱的内容，文档已保留。");
  }
  const warningsByMeasure = new Map<string, KernelRuleWarningV1[]>();
  for (const warning of warnings) {
    if (warning.partId !== part.id) continue;
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
  const view: NotationView = { kind: "staff", partId: part.id, staffId: staff.id, clef: "treble",
    measures: document.measureDefinitions.map((measure) => ({ id: measure.id, meter: { ...measure.meter },
      voiceId: projectedMeasures.get(measure.id)!.voiceId, events: projectedMeasures.get(measure.id)!.events,
      ruleWarnings: (warningsByMeasure.get(measure.id) ?? []).filter((warning) => warning.measureId === measure.id
        && warning.voiceId === projectedMeasures.get(measure.id)!.voiceId).map((warning) => ({
          code: warning.code, nominalDuration: warning.nominalDuration,
          actualDuration: warning.actualDuration, overflow: warning.overflow,
        })),
    })) };
  return isNotationView(view) ? view : unsupported("当前视图尚不支持这份乐谱的拍号，文档已保留。");
}
