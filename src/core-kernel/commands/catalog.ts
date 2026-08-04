export const CORE_COMMAND_DEFINITIONS = Object.freeze([
  Object.freeze({
    commandId: "core.document.set-metadata",
    targetKind: "document",
  }),
  Object.freeze({
    commandId: "core.note.set-written-pitch",
    targetKind: "note",
  }),
  Object.freeze({
    commandId: "core.event.set-note-value",
    targetKind: "event",
  }),
  Object.freeze({
    commandId: "core.voice.insert-notes-event",
    targetKind: "voice",
  }),
  Object.freeze({
    commandId: "core.voice.insert-rest-event",
    targetKind: "voice",
  }),
  Object.freeze({ commandId: "core.event.remove", targetKind: "event" }),
  Object.freeze({ commandId: "core.measure.insert", targetKind: "document" }),
  Object.freeze({ commandId: "core.measure.remove", targetKind: "measure" }),
  Object.freeze({ commandId: "core.measure.move", targetKind: "measure" }),
  Object.freeze({
    commandId: "core.measure.set-definition",
    targetKind: "measure",
  }),
] as const);

export type CoreCommandId =
  (typeof CORE_COMMAND_DEFINITIONS)[number]["commandId"];
