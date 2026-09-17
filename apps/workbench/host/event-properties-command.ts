import { randomUUID } from "node:crypto";
import type { BatchCommand, CoreCommandEnvelope, ScoreDocument } from "../.kernel/src/core-kernel/index.js";
import { durationUnits } from "../src/contracts/note-input.ts";
import type { EventProperties } from "../src/contracts/note-input.ts";
import type { WorkbenchIssue } from "../src/contracts/workbench-issue.ts";
import { restDurations } from "./rest-durations.ts";

type Prepared = { readonly ok: true; readonly command: BatchCommand }
  | { readonly ok: false; readonly message: string; readonly status: 409 | 422; readonly issue: WorkbenchIssue };

function editIssue(code: string, message: string, measureId: string, eventId: string): WorkbenchIssue {
  return { code, message, severity: "error", source: "editor", target: { scope: "event", measureId, eventId } };
}

/** Prepare public commands; use adjacent silence first, then move later events into free bar space. */
export function prepareEventProperties(document: ScoreDocument, eventId: string, properties: EventProperties): Prepared {
  const content = document.parts[0]!.measureContents.find((item) => item.voices[0]?.sequence.events.some((event) => event.id === eventId));
  const voice = content?.voices[0], index = voice?.sequence.events.findIndex((event) => event.id === eventId) ?? -1;
  const event = voice?.sequence.events[index];
  if (!content || !voice || !event) {
    const message = "选中内容已不存在，请重新选择";
    return { ok: false, status: 409, message,
      issue: { code: "editor.selection-stale", message, severity: "error", source: "editor", target: { scope: "workbench" } } };
  }
  const note = event.content.kind === "notes" ? event.content.notes[0] : undefined;
  if ((properties.content.kind === "note") !== !!note) {
    const message = "属性编辑不能切换音符和休止符类型";
    return { ok: false, status: 422, message, issue: editIssue("editor.event-kind-change-unsupported", message, content.measureId, eventId) };
  }
  const commands: CoreCommandEnvelope[] = [];
  const newUnits = durationUnits(properties.duration), oldUnits = durationUnits(event.duration);
  if (newUnits !== oldUnits) {
    const following = voice.sequence.events.slice(index + 1);
    const nextNoteIndex = following.findIndex((item) => item.content.kind === "notes");
    const rests = nextNoteIndex < 0 ? following : following.slice(0, nextNoteIndex);
    const restUnits = rests.reduce((sum, item) => sum + durationUnits(item.duration), 0);
    for (const rest of rests) commands.push({ commandVersion: 1, commandId: "core.event.remove", target: { kind: "event", eventId: rest.id }, payload: {} });
    commands.push({ commandVersion: 1, commandId: "core.event.set-note-value",
      target: { kind: "event", eventId }, payload: { noteValue: properties.duration } });
    // At an unfilled tail no explicit silence needs to be added. Otherwise retain the occupied span.
    const gap = nextNoteIndex >= 0 || rests.length ? Math.max(0, oldUnits + restUnits - newUnits) : 0;
    let anchorId = eventId;
    for (const [offset, duration] of restDurations(gap).entries()) {
      const id = rests[offset]?.id ?? randomUUID();
      commands.push({ commandVersion: 1, commandId: "core.voice.insert-rest-event",
        target: { kind: "voice", voiceId: voice.id }, payload: {
          anchor: { kind: "after-event", eventId: anchorId }, event: { id, duration, content: { kind: "rest" } },
        } });
      anchorId = id;
    }
  } else {
    commands.push({ commandVersion: 1, commandId: "core.event.set-note-value",
      target: { kind: "event", eventId }, payload: { noteValue: properties.duration } });
  }
  if (note && properties.content.kind === "note") commands.push({
    commandVersion: 1, commandId: "core.note.set-written-pitch",
    target: { kind: "note", noteId: note.id }, payload: { writtenPitch: properties.content.pitch },
  });
  return { ok: true, command: { commandVersion: 1, commandId: "core.transaction.batch", target: { kind: "document", documentId: document.id },
    payload: { commands: commands as [CoreCommandEnvelope, ...CoreCommandEnvelope[]] } } };
}
