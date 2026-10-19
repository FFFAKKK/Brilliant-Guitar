export * from "../../../../shared/notation/note-properties.ts";
import { STAFF_CLEFS, isInputDuration, isEventProperties, isInputContent, isMeterInput } from "../../../../shared/notation/note-properties.ts";
import type { InputDuration, InputSequenceAnchor, InputContent, EventProperties, MeterInput, StaffClef } from "../../../../shared/notation/note-properties.ts";
import { isScoreClipboardFragmentV1 } from "./score-clipboard.ts";
import { isFrettedPosition } from "../../../../shared/notation/tablature-model.ts";
import type { FrettedPosition } from "../../../../shared/notation/tablature-model.ts";

export type { DocumentMetadataInput } from "./document-metadata.ts";
export { isDocumentMetadataInput } from "./document-metadata.ts";
import type { DocumentMetadataInput } from "./document-metadata.ts";
import { isDocumentMetadataInput } from "./document-metadata.ts";
export const KEY_SIGNATURE_FIFTHS = [-7, -6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6, 7] as const;
export type KeySignatureFifths = typeof KEY_SIGNATURE_FIFTHS[number];
export type KeySignatureChangeInput = { readonly kind: "set"; readonly fifths: KeySignatureFifths }
  | { readonly kind: "inherit" };
export type MeterChangeScope = "meter-run" | "measure";
export type { DeleteTimePolicy, ScoreEventRange } from "../../../../shared/notation/interaction/event-edit.ts";
import type { DeleteTimePolicy, ScoreEventRange } from "../../../../shared/notation/interaction/event-edit.ts";
export type MeasureInsertPosition = "before" | "after";
export type ScoreEditAction = { readonly kind: "undo" } | { readonly kind: "redo" } | {
  readonly kind: "delete-event"; readonly eventId: string; readonly timePolicy?: DeleteTimePolicy;
}
  | { readonly kind: "delete-range"; readonly range: ScoreEventRange }
  | { readonly kind: "paste-fragment"; readonly measureId: string; readonly voiceId: string;
      readonly anchor: InputSequenceAnchor; readonly offsetUnits?: number;
      readonly fragment: import("./score-clipboard.ts").ScoreClipboardFragmentV1 }
  | { readonly kind: "insert-measure"; readonly measureId: string; readonly position: MeasureInsertPosition }
  | { readonly kind: "remove-measure"; readonly measureId: string }
  | { readonly kind: "set-measure-meter"; readonly measureId: string; readonly meter: MeterInput;
      readonly scope: MeterChangeScope }
  | { readonly kind: "set-key-signature"; readonly partId: string; readonly measureId: string;
      readonly change: KeySignatureChangeInput }
  | { readonly kind: "set-staff-clef"; readonly staffId: string; readonly clef: StaffClef }
  | { readonly kind: "set-event-properties"; readonly eventId: string; readonly properties: EventProperties }
  | { readonly kind: "set-fretted-position"; readonly partId: string; readonly eventId: string; readonly position: FrettedPosition }
  | { readonly kind: "set-document-metadata"; readonly metadata: DocumentMetadataInput }
  | { readonly kind: "set-title"; readonly title: string } | {
  readonly kind: "append"; readonly measureId: string; readonly anchor: InputSequenceAnchor;
  readonly offsetUnits?: number;
  readonly duration: InputDuration; readonly content: InputContent;
};
export interface ScoreEditRequest { readonly requestId: string; readonly documentId: string; readonly expectedVersion: number; readonly action: ScoreEditAction }
const record = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
export function isScoreEditRequest(v: unknown): v is ScoreEditRequest {
  if (!record(v) || typeof v.requestId !== "string" || !/^[a-f0-9-]{36}$/i.test(v.requestId)
    || typeof v.documentId !== "string" || !v.documentId || typeof v.expectedVersion !== "number"
    || !Number.isSafeInteger(v.expectedVersion) || v.expectedVersion < 0 || !record(v.action)) return false;
  const a = v.action;
  return a.kind === "undo" || a.kind === "redo" || (a.kind === "delete-event" && typeof a.eventId === "string" && !!a.eventId
      && (a.timePolicy === undefined || a.timePolicy === "preserve" || a.timePolicy === "collapse"))
    || (a.kind === "delete-range" && isScoreEventRange(a.range))
    || (a.kind === "paste-fragment" && typeof a.measureId === "string" && !!a.measureId
      && typeof a.voiceId === "string" && !!a.voiceId && isInputSequenceAnchor(a.anchor)
      && (a.offsetUnits === undefined || (typeof a.offsetUnits === "number" && Number.isSafeInteger(a.offsetUnits) && a.offsetUnits >= 0))
      && isScoreClipboardFragmentV1(a.fragment))
    || (a.kind === "insert-measure" && typeof a.measureId === "string" && !!a.measureId
      && (a.position === "before" || a.position === "after"))
    || (a.kind === "remove-measure" && typeof a.measureId === "string" && !!a.measureId)
    || (a.kind === "set-measure-meter" && typeof a.measureId === "string" && !!a.measureId
      && isMeterInput(a.meter) && (a.scope === "meter-run" || a.scope === "measure"))
    || (a.kind === "set-key-signature" && typeof a.partId === "string" && !!a.partId
      && typeof a.measureId === "string" && !!a.measureId && isKeySignatureChangeInput(a.change)
      && Object.keys(a).every(key => ["kind", "partId", "measureId", "change"].includes(key)))
    || (a.kind === "set-staff-clef" && typeof a.staffId === "string" && !!a.staffId
      && (STAFF_CLEFS as readonly unknown[]).includes(a.clef)
      && Object.keys(a).every(key => ["kind", "staffId", "clef"].includes(key)))
    || (a.kind === "set-event-properties" && typeof a.eventId === "string" && !!a.eventId && isEventProperties(a.properties))
    || (a.kind === "set-fretted-position" && typeof a.partId === "string" && !!a.partId
      && typeof a.eventId === "string" && !!a.eventId
      && isFrettedPosition(a.position, { stringCount: 32, fretCount: null, capoFret: 0 })
      && Object.keys(a.position).every(key => ["stringNumber", "fret"].includes(key))
      && Object.keys(a).every(key => ["kind", "partId", "eventId", "position"].includes(key)))
    || (a.kind === "set-document-metadata" && isDocumentMetadataInput(a.metadata)
      && Object.keys(a).every(key => ["kind", "metadata"].includes(key)))
    || (a.kind === "set-title" && typeof a.title === "string" && a.title.trim().length <= 120)
    || (a.kind === "append" && typeof a.measureId === "string" && !!a.measureId
      && isInputSequenceAnchor(a.anchor)
      && (a.offsetUnits === undefined || (typeof a.offsetUnits === "number" && Number.isSafeInteger(a.offsetUnits) && a.offsetUnits >= 0))
      && isInputDuration(a.duration) && isInputContent(a.content));
}
export function isKeySignatureChangeInput(value: unknown): value is KeySignatureChangeInput {
  if (!record(value)) return false;
  return value.kind === "inherit" ? Object.keys(value).every(key => key === "kind") : value.kind === "set"
    && Object.keys(value).every(key => key === "kind" || key === "fifths")
    && (KEY_SIGNATURE_FIFTHS as readonly unknown[]).includes(value.fifths);
}
export function isScoreEventRange(value: unknown): value is ScoreEventRange {
  return record(value) && typeof value.measureId === "string" && !!value.measureId
    && typeof value.voiceId === "string" && !!value.voiceId
    && typeof value.startEventId === "string" && !!value.startEventId
    && typeof value.endEventId === "string" && !!value.endEventId;
}
export function isInputSequenceAnchor(value: unknown): value is InputSequenceAnchor {
  if (!record(value)) return false;
  return value.kind === "start" || (value.kind === "after-event" && typeof value.eventId === "string" && !!value.eventId);
}
