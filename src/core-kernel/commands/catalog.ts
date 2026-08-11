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
  Object.freeze({ commandId: "core.part.insert", targetKind: "document" }),
  Object.freeze({ commandId: "core.part.remove", targetKind: "part" }),
  Object.freeze({ commandId: "core.part.move", targetKind: "part" }),
  Object.freeze({ commandId: "core.part.set-name", targetKind: "part" }),
  Object.freeze({
    commandId: "core.part.set-instrument",
    targetKind: "part",
  }),
  Object.freeze({ commandId: "core.staff.insert", targetKind: "part" }),
  Object.freeze({ commandId: "core.staff.remove", targetKind: "staff" }),
  Object.freeze({ commandId: "core.staff.move", targetKind: "staff" }),
  Object.freeze({
    commandId: "core.staff.set-definition",
    targetKind: "staff",
  }),
  Object.freeze({ commandId: "core.voice.insert", targetKind: "part" }),
  Object.freeze({ commandId: "core.voice.remove", targetKind: "voice" }),
  Object.freeze({ commandId: "core.voice.move", targetKind: "voice" }),
  Object.freeze({
    commandId: "core.voice.set-default-staff",
    targetKind: "voice",
  }),
  Object.freeze({
    commandId: "core.voice.set-sequence-start",
    targetKind: "voice",
  }),
  Object.freeze({
    commandId: "core.event.set-staff-assignment",
    targetKind: "event",
  }),
  Object.freeze({ commandId: "core.range.delete", targetKind: "document" }),
  Object.freeze({
    commandId: "core.range.transpose-written-pitch",
    targetKind: "document",
  }),
  Object.freeze({
    commandId: "core.transaction.batch",
    targetKind: "document",
  }),
] as const);

export type CoreCommandId =
  (typeof CORE_COMMAND_DEFINITIONS)[number]["commandId"];
