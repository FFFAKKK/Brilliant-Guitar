import type { ScoreDocument } from "../.kernel/src/core-kernel/index.js";
import type { KernelRuleWarningV1 } from "../.kernel/src/core-kernel/native/integrated-command-bus.js";
import type { FrettedInstrumentReadV2, FrettedTechniqueIdentityV1 } from "../.kernel/src/instrument-sdk/fretted-instrument-domain.js";
import { KEY_SIGNATURE_NAMESPACE, readPartKeySignatureTimelineV1 } from "../.kernel/src/first-party-modules/key-signature.js";
import { isFrettedPosition, isTablatureDuration, isTablatureView } from "../../../shared/notation/tablature-model.ts";
import type { TablatureEvent, TablatureProjection } from "../../../shared/notation/tablature-model.ts";
import type { TablaturePositionIntent } from "../../../shared/notation/interaction/tablature-interaction-contribution.ts";

/** Trusted host binding to an installed instrument implementation, not a UI-supplied command ID. */
export interface FrettedNotationDomain {
  readonly namespace: string;
  readonly setPositionCommandId: string;
  readPart(document: Pick<ScoreDocument, "extensions">, partId: string): FrettedInstrumentReadV2<FrettedTechniqueIdentityV1>;
}

/** A known namespace alone is insufficient: every visible extension must be compatible and complete. */
export function supportsPlainFrettedNotation(document: ScoreDocument, domain: FrettedNotationDomain): boolean {
  return document.extensions.every(block => {
    const owner = block.owner;
    if (owner.kind !== "part" || !document.parts.some(part => part.id === owner.partId)) return false;
    if (block.namespace === KEY_SIGNATURE_NAMESPACE) {
      return block.schemaVersion === 1 && readPartKeySignatureTimelineV1(document, owner.partId).status === "valid";
    }
    if (block.namespace !== domain.namespace) return false;
    const read = domain.readPart(document, owner.partId);
    return read.status === "valid" && read.state.techniques.length === 0;
  });
}

/** The accepted document remains intact; never infer fingering from written pitch. */
export function projectFrettedTablature(document: ScoreDocument, partId: string,
  domain: FrettedNotationDomain, warnings: readonly KernelRuleWarningV1[] = []): TablatureProjection {
  const unsupported = (message: string): TablatureProjection => ({ kind: "unsupported", message });
  const part = document.parts.find(item => item.id === partId), staff = part?.staves[0];
  if (document.parts.length !== 1 || !part || part.staves.length !== 1 || !staff) {
    return unsupported("当前 Tab 视图暂只支持单部、单谱表。");
  }
  const read = domain.readPart(document, partId);
  if (read.status !== "valid") return unsupported(read.status === "absent" ? "当前乐器尚未初始化弦品。" : "当前弦品数据无效。");
  const state = read.state;
  if (!supportsPlainFrettedNotation(document, domain)) return unsupported("当前 Tab 视图尚不能完整显示技巧或其他扩展。");
  const placements = new Map(state.placements.map(position => [position.noteId, position]));
  const contents = new Map(part.measureContents.map(content => [content.measureId, content]));
  if (contents.size !== document.measureDefinitions.length || contents.size !== part.measureContents.length) {
    return unsupported("小节内容不完整，暂时无法显示 Tab。");
  }
  const warningsByVoice = new Map<string, KernelRuleWarningV1[]>();
  for (const warning of warnings) {
    if (warning.code !== "rule.sequence-exceeds-measure" || warning.partId !== partId) continue;
    const list = warningsByVoice.get(warning.voiceId) ?? [];
    list.push(warning); warningsByVoice.set(warning.voiceId, list);
  }
  const measures = [];
  for (const measure of document.measureDefinitions) {
    const content = contents.get(measure.id), voice = content?.voices[0];
    if (measure.pickupDuration !== undefined || !content || content.voices.length !== 1 || !voice
      || voice.defaultStaffId !== staff.id || voice.sequence.start.numerator !== 0) {
      return unsupported("当前 Tab 视图暂只支持从小节起点开始的单声部。");
    }
    const events: TablatureEvent[] = [];
    for (const event of voice.sequence.events) {
      if (event.duration.timeModification !== undefined || (event.staffId !== undefined && event.staffId !== staff.id)) {
        return unsupported("当前 Tab 视图暂不支持该节奏或跨谱表内容。");
      }
      const duration = { base: event.duration.base, dots: event.duration.dots };
      if (!isTablatureDuration(duration, event.content.kind === "rest")) return unsupported("当前 Tab 视图暂不支持该时值。");
      if (event.content.kind === "rest") {
        events.push({ id: event.id, duration, content: { kind: "rest" } });
      } else {
        const note = event.content.notes[0], placement = note && placements.get(note.id);
        if (event.content.notes.length !== 1 || !note) return unsupported("当前 Tab 视图暂不支持和弦。");
        if (!placement) return unsupported("音符尚未指定弦品，不能推测 Tab 位置。");
        events.push({ id: event.id, duration,
          content: { kind: "note", noteId: note.id, position: { stringNumber: placement.stringNumber, fret: placement.fret } } });
      }
    }
    measures.push({ id: measure.id, voiceId: voice.id, meter: { ...measure.meter }, events,
      ruleWarnings: (warningsByVoice.get(voice.id) ?? []).filter(warning => warning.measureId === measure.id).map(warning => ({
          code: "rule.sequence-exceeds-measure" as const, nominalDuration: warning.nominalDuration,
          actualDuration: warning.actualDuration, overflow: warning.overflow,
        })) });
  }
  const view = { kind: "tablature" as const, partId, staffId: staff.id, tempoBpm: document.metadata.tempo.bpm,
    stringCount: state.stringCount, fretCount: state.fretCount, capoFret: state.capoFret, measures };
  return isTablatureView(view) ? view : unsupported("当前 Tab 投影包含不支持的数据。");
}

/** Prepare only; the application still owns version guards, dispatch and receipt acceptance. */
export function prepareFrettedPositionEdit(document: ScoreDocument, partId: string,
  intent: TablaturePositionIntent, domain: FrettedNotationDomain) {
  const fail = (code: string) => ({ ok: false as const, code });
  const read = domain.readPart(document, partId);
  if (read.status !== "valid") return fail("notation.tablature.domain-unavailable");
  if (intent.kind !== "update-event" || intent.properties.kind !== "fretted-position"
    || !isFrettedPosition(intent.properties.position, read.state)) return fail("notation.tablature.invalid-position");
  const part = document.parts.find(item => item.id === partId);
  const events = part?.measureContents.flatMap(content => content.voices.flatMap(voice => voice.sequence.events)) ?? [];
  const event = events.find(item => item.id === intent.eventId);
  if (!event) return fail("notation.tablature.selection-stale");
  if (event.content.kind !== "notes" || event.content.notes.length !== 1) return fail("notation.tablature.single-note-required");
  return { ok: true as const, command: {
    commandVersion: 1 as const, commandId: domain.setPositionCommandId, target: { kind: "part" as const, partId },
    payload: { noteId: event.content.notes[0]!.id, position: { ...intent.properties.position } },
  } };
}
