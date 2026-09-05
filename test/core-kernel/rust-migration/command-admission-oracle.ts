import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { decodeCoreCommand } from "../../../src/core-kernel/commands/strict-codec";
import { createCoreScoreFixture } from "../fixtures/core-score";

type Path = readonly (string | number)[];
interface Case { readonly id: string; readonly input: unknown }
export const COMMAND_ADMISSION_ORACLE_PATH = "test/core-kernel/rust-migration/fixtures/command-admission-oracle-v1.json";
const command = (commandId: string, kind: string, id: string, payload: unknown = {}) => ({ commandVersion: 1, commandId, target: { kind, [`${kind}Id`]: id }, payload });
const score = createCoreScoreFixture();
const part = score.parts[0]!;
const staff = part.staves[0]!;
const voice = part.measureContents[0]!.voices[0]!;
const notesEvent = voice.sequence.events[0]!;
const restEvent = voice.sequence.events[1]!;
const range = { kind: "voice-event-range", start: { kind: "voice-event", voiceId: voice.id, eventId: notesEvent.id }, end: { kind: "voice-event", voiceId: voice.id, eventId: restEvent.id } };
const starts = { kind: "start" };
const inputs = [
  command("core.document.set-metadata", "document", score.id, { metadata: score.metadata }),
  command("core.note.set-written-pitch", "note", "note-1", { writtenPitch: { step: "C", alter: 0, octave: 4 } }),
  command("core.event.set-note-value", "event", notesEvent.id, { noteValue: notesEvent.duration }),
  command("core.voice.insert-notes-event", "voice", voice.id, { anchor: starts, event: { ...notesEvent, staffId: staff.id } }),
  command("core.voice.insert-rest-event", "voice", voice.id, { anchor: starts, event: { ...restEvent, staffId: staff.id } }),
  command("core.event.remove", "event", notesEvent.id),
  command("core.measure.insert", "document", score.id, { anchor: starts, definition: score.measureDefinitions[0], contents: [{ partId: part.id, voices: [voice] }] }),
  command("core.measure.remove", "measure", "measure-1"),
  command("core.measure.move", "measure", "measure-1", { anchor: starts }),
  command("core.measure.set-definition", "measure", "measure-1", { meter: { numerator: 4, denominator: 4 }, pickup: { kind: "none" } }),
  command("core.part.insert", "document", score.id, { anchor: starts, part }),
  command("core.part.remove", "part", part.id),
  command("core.part.move", "part", part.id, { anchor: starts }),
  command("core.part.set-name", "part", part.id, { name: "Updated" }),
  command("core.part.set-instrument", "part", part.id, { instrument: part.instrument }),
  command("core.staff.insert", "part", part.id, { anchor: starts, staff }),
  command("core.staff.remove", "staff", staff.id),
  command("core.staff.move", "staff", staff.id, { anchor: starts }),
  command("core.staff.set-definition", "staff", staff.id, { lineCount: 5, defaultClef: staff.defaultClef }),
  command("core.voice.insert", "part", part.id, { measureId: "measure-1", anchor: starts, voice }),
  command("core.voice.remove", "voice", voice.id),
  command("core.voice.move", "voice", voice.id, { anchor: starts }),
  command("core.voice.set-default-staff", "voice", voice.id, { staffId: staff.id }),
  command("core.voice.set-sequence-start", "voice", voice.id, { start: voice.sequence.start }),
  command("core.event.set-staff-assignment", "event", notesEvent.id, { assignment: { kind: "staff", staffId: staff.id } }),
  command("core.range.delete", "document", score.id, { range }),
  command("core.range.transpose-written-pitch", "document", score.id, { range, transposition: { diatonicSteps: 1, chromaticSemitones: 2 } }),
  command("core.transaction.batch", "document", score.id, { commands: [command("core.voice.remove", "voice", voice.id)] }),
];

function patched(input: unknown, path: Path, value: unknown): unknown {
  const result = structuredClone(input) as Record<string | number, unknown>;
  let node = result;
  for (const key of path.slice(0, -1)) node = node[key] as Record<string | number, unknown>;
  node[path[path.length - 1]!] = value;
  return result;
}
function idPaths(input: unknown, path: Path = []): Path[] {
  if (input === null || typeof input !== "object") return [];
  return Object.entries(input).flatMap(([key, value]) => {
    const child = [...path, Array.isArray(input) ? Number(key) : key];
    return key === "id" || key.endsWith("Id") && key !== "commandId" ? [child] : idPaths(value, child);
  });
}

function taggedObjects(input: unknown, path: Path = []): { path: Path; value: Record<string, unknown> }[] {
  if (input === null || typeof input !== "object") return [];
  const value = input as Record<string, unknown>;
  return [
    ...(Object.hasOwn(value, "kind") ? [{ path, value }] : []),
    ...Object.entries(value).flatMap(([key, child]) => taggedObjects(child, [...path, Array.isArray(value) ? Number(key) : key])),
  ];
}

export function buildCommandAdmissionOracle() {
  const cases: Case[] = [];
  const add = (id: string, input: unknown) => cases.push({ id, input });
  for (const input of inputs) {
    add(`${input.commandId}/valid`, input);
    for (const { path, value } of taggedObjects(input)) {
      add(`${input.commandId}/${path.join(".")}/extra-field`, patched(input, path, { ...value, unexpected: true }));
      add(`${input.commandId}/${path.join(".")}/unknown-kind`, patched(input, [...path, "kind"], "unknown"));
    }
    for (const path of idPaths(input)) {
      for (const [name, value] of [["empty", ""], ["null", null], ["number", 7], ["prototype", "__proto__"]] as const) add(`${input.commandId}/${path.join(".")}/${name}`, patched(input, path, value));
    }
    if (input.commandId.endsWith(".insert") || input.commandId.endsWith(".move") || input.commandId.includes("insert-notes-event") || input.commandId.includes("insert-rest-event")) {
      const kind = input.commandId.includes("insert-notes-event") || input.commandId.includes("insert-rest-event") ? "event" : input.commandId.split(".")[1]!;
      for (const id of ["", "missing", "__proto__"]) add(`${input.commandId}/anchor/${id || "empty"}`, patched(input, ["payload", "anchor"], { kind: `after-${kind}`, [`${kind}Id`]: id }));
    }
  }
  const insertVoice = inputs.find((entry) => entry.commandId === "core.voice.insert")!;
  const directNotes = inputs.find((entry) => entry.commandId === "core.voice.insert-notes-event")!;
  const directRest = inputs.find((entry) => entry.commandId === "core.voice.insert-rest-event")!;
  add("direct-rest/extra", patched(directRest, ["payload", "event", "content", "notes"], []));
  for (const [prefix, input, eventPath] of [
    ["nested", insertVoice, ["payload", "voice", "sequence", "events", 0]],
    ["direct", directNotes, ["payload", "event"]],
  ] as const) {
    for (const [name, path, value] of [
      ["staff-null", ["staffId"], null], ["time-null", ["duration", "timeModification"], null],
      ["tuplet-zero", ["duration", "timeModification"], { actualNotes: 0, normalNotes: 2 }],
      ["rest-extra", ["content"], { kind: "rest", notes: [] }],
      ["notes-extra", ["content"], { kind: "notes", notes: [], extra: true }],
      ["notes-empty", ["content", "notes"], []],
      ["octave-nine", ["content", "notes", 0, "writtenPitch", "octave"], 9],
      ["alter-three", ["content", "notes", 0, "writtenPitch", "alter"], 3],
    ] as const) add(`${prefix}/${name}`, patched(input, [...eventPath, ...path], value));
  }
  const partInput = inputs.find((entry) => entry.commandId === "core.part.insert")!;
  const staffInput = inputs.find((entry) => entry.commandId === "core.staff.set-definition")!;
  add("staff-definition/clef-six", patched(staffInput, ["payload", "defaultClef", "line"], 6));
  const assignmentInput = inputs.find((entry) => entry.commandId === "core.event.set-staff-assignment")!;
  add("assignment/inherit", patched(assignmentInput, ["payload", "assignment"], { kind: "inherit-default" }));
  add("assignment/inherit-extra", patched(assignmentInput, ["payload", "assignment"], { kind: "inherit-default", staffId: "staff-1" }));
  for (const [name, path, value] of [
    ["empty-staves", ["staves"], []], ["empty-contents", ["measureContents"], []],
    ["empty-voices", ["measureContents", 0, "voices"], []],
    ["duplicate-contents", ["measureContents"], [...part.measureContents, ...part.measureContents]],
    ["duplicate-staves", ["staves"], [staff, staff]],
    ["clef-zero", ["staves", 0, "defaultClef", "line"], 0],
    ["clef-six", ["staves", 0, "defaultClef", "line"], 6],
    ["staff-zero", ["staves", 0, "lineCount"], 0],
    ["staff-fraction", ["staves", 0, "lineCount"], 0.5],
    ["unknown-field", ["unexpected"], true],
  ] as const) add(`part/${name}`, patched(partInput, ["payload", "part", ...path], value));
  const measureInput = inputs.find((entry) => entry.commandId === "core.measure.insert")!;
  for (const [name, path, value] of [
    ["empty-contents", ["contents"], []], ["empty-voices", ["contents", 0, "voices"], []],
    ["pickup-null", ["definition", "pickupDuration"], null],
    ["pickup-noncanonical", ["definition", "pickupDuration"], { numerator: 2, denominator: 4 }],
    ["meter-zero", ["definition", "meter", "numerator"], 0],
    ["meter-denominator-three", ["definition", "meter", "denominator"], 3],
  ] as const) add(`measure/${name}`, patched(measureInput, ["payload", ...path], value));
  return { oracleVersion: 1, cases: cases.map((entry) => ({ ...entry, expected: decodeCoreCommand(entry.input) })) };
}

if (require.main === module && process.argv[2] === "--write") writeFileSync(resolve(COMMAND_ADMISSION_ORACLE_PATH), `${JSON.stringify(buildCommandAdmissionOracle())}\n`, "utf8");
