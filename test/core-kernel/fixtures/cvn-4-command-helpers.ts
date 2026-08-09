import {
  CommandBus,
  type Fraction,
  type InstrumentDescriptor,
  type KernelEvent,
  type Part,
  type PartAnchor,
  type ScoreDocument,
  type StaffAnchor,
  type StaffDefinition,
  type Voice,
  type VoiceAnchor,
} from "../../../src/core-kernel/index";
import { CVN4_DOCUMENT_ID } from "./cvn-4-score";

export function commandEnvelope(
  commandId: string,
  target: unknown,
  payload: unknown,
): Record<string, unknown> {
  return { commandVersion: 1, commandId, target, payload };
}

export function insertPartCommand(
  anchor: PartAnchor,
  part: Part,
): Record<string, unknown> {
  return commandEnvelope(
    "core.part.insert",
    { kind: "document", documentId: CVN4_DOCUMENT_ID },
    { anchor, part },
  );
}

export function removePartCommand(partId: string): Record<string, unknown> {
  return commandEnvelope("core.part.remove", { kind: "part", partId }, {});
}

export function movePartCommand(
  partId: string,
  anchor: PartAnchor,
): Record<string, unknown> {
  return commandEnvelope("core.part.move", { kind: "part", partId }, { anchor });
}

export function setPartNameCommand(
  partId: string,
  name: string,
): Record<string, unknown> {
  return commandEnvelope("core.part.set-name", { kind: "part", partId }, { name });
}

export function setPartInstrumentCommand(
  partId: string,
  instrument: InstrumentDescriptor,
): Record<string, unknown> {
  return commandEnvelope(
    "core.part.set-instrument",
    { kind: "part", partId },
    { instrument },
  );
}

export function insertStaffCommand(
  partId: string,
  anchor: StaffAnchor,
  staff: StaffDefinition,
): Record<string, unknown> {
  return commandEnvelope("core.staff.insert", { kind: "part", partId }, {
    anchor,
    staff,
  });
}

export function removeStaffCommand(staffId: string): Record<string, unknown> {
  return commandEnvelope("core.staff.remove", { kind: "staff", staffId }, {});
}

export function moveStaffCommand(
  staffId: string,
  anchor: StaffAnchor,
): Record<string, unknown> {
  return commandEnvelope("core.staff.move", { kind: "staff", staffId }, { anchor });
}

export function setStaffDefinitionCommand(
  staffId: string,
  lineCount: number,
  defaultClef: StaffDefinition["defaultClef"],
): Record<string, unknown> {
  return commandEnvelope(
    "core.staff.set-definition",
    { kind: "staff", staffId },
    { lineCount, defaultClef },
  );
}

export function insertVoiceCommand(
  partId: string,
  measureId: string,
  anchor: VoiceAnchor,
  voice: Voice,
): Record<string, unknown> {
  return commandEnvelope("core.voice.insert", { kind: "part", partId }, {
    measureId,
    anchor,
    voice,
  });
}

export function removeVoiceCommand(voiceId: string): Record<string, unknown> {
  return commandEnvelope("core.voice.remove", { kind: "voice", voiceId }, {});
}

export function moveVoiceCommand(
  voiceId: string,
  anchor: VoiceAnchor,
): Record<string, unknown> {
  return commandEnvelope("core.voice.move", { kind: "voice", voiceId }, { anchor });
}

export function setVoiceDefaultStaffCommand(
  voiceId: string,
  staffId: string,
): Record<string, unknown> {
  return commandEnvelope(
    "core.voice.set-default-staff",
    { kind: "voice", voiceId },
    { staffId },
  );
}

export function setVoiceSequenceStartCommand(
  voiceId: string,
  start: Fraction,
): Record<string, unknown> {
  return commandEnvelope(
    "core.voice.set-sequence-start",
    { kind: "voice", voiceId },
    { start },
  );
}

export function setEventStaffAssignmentCommand(
  eventId: string,
  assignment:
    | { readonly kind: "inherit-default" }
    | { readonly kind: "staff"; readonly staffId: string },
): Record<string, unknown> {
  return commandEnvelope(
    "core.event.set-staff-assignment",
    { kind: "event", eventId },
    { assignment },
  );
}

export function requireBus(document: ScoreDocument): CommandBus {
  const created = CommandBus.create(document);
  if (!created.ok) {
    throw new Error(`expected CVN-4 command bus: ${created.failure.code}`);
  }
  return created.value;
}

export function readDocument(bus: CommandBus): ScoreDocument {
  const read = bus.read();
  if (!read.ok) {
    throw new Error(`expected CVN-4 command read: ${read.failure.code}`);
  }
  return read.value.snapshot.document;
}

export function collectEvents(bus: CommandBus): KernelEvent[] {
  const events: KernelEvent[] = [];
  const subscription = bus.subscribe((event: KernelEvent) => events.push(event));
  if (subscription.status !== "subscribed") {
    throw new Error(`expected CVN-4 event subscription: ${subscription.failure.code}`);
  }
  return events;
}

export function committedEvents(
  events: readonly KernelEvent[],
): Extract<KernelEvent, { readonly eventType: "core.document.committed" }>[] {
  return events.filter(
    (event): event is Extract<KernelEvent, { readonly eventType: "core.document.committed" }> =>
      event.eventType === "core.document.committed",
  );
}

export function partOrder(document: ScoreDocument): readonly string[] {
  return document.parts.map((part) => part.id);
}

export function staffOrder(
  document: ScoreDocument,
  partId: string,
): readonly string[] {
  const part = document.parts.find((candidate) => candidate.id === partId);
  if (part === undefined) {
    throw new Error(`missing CVN-4 part ${partId}`);
  }
  return part.staves.map((staff) => staff.id);
}

export function voiceOrder(
  document: ScoreDocument,
  partId: string,
  measureId: string,
): readonly string[] {
  const part = document.parts.find((candidate) => candidate.id === partId);
  const content = part?.measureContents.find(
    (candidate) => candidate.measureId === measureId,
  );
  if (content === undefined) {
    throw new Error(`missing CVN-4 content ${partId}/${measureId}`);
  }
  return content.voices.map((voice) => voice.id);
}
