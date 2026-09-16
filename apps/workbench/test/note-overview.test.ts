import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { ScoreSessionService } from "../host/score-session.ts";
import type { ScoreEditAction } from "../src/contracts/note-input.ts";
import type { StaffEvent } from "../src/contracts/notation.ts";
import { getMeasureShare, resolveNoteOverview, selectedNoteAction, stepNoteDuration, toggleNoteDot } from "../src/editor/note-overview.ts";
import type { InputPreview } from "../src/editor/note-overview.ts";
import { advancePitchEntry } from "../src/editor/pitch-entry.ts";
import { accidentalForEvent, alterForAccidental, inheritedAlterAtPoint } from "../src/editor/accidental-state.ts";
import type { StaffMeasure, StaffView } from "../src/contracts/notation.ts";

const input: InputPreview = { duration: { base: 4, dots: 0 }, alter: 1, accidental: "sharp", rest: false, draft: null, pitch: null };

test("accidental display distinguishes blank, sharp, flat and required natural states", () => {
  const note = (id: string, alter: -1 | 0 | 1): StaffEvent => ({ id, duration: { base: 8, dots: 0 },
    content: { kind: "note", pitch: { step: "C", octave: 5, alter } } });
  const measure: StaffMeasure = { id: "m1", voiceId: "v1", meter: { numerator: 4, denominator: 4 },
    events: [note("sharp", 1), note("inherited-sharp", 1), note("natural", 0), note("plain", 0), note("flat", -1)] };
  assert.equal(accidentalForEvent(measure, "sharp"), "sharp");
  assert.equal(accidentalForEvent(measure, "inherited-sharp"), "none");
  assert.equal(accidentalForEvent(measure, "natural"), "natural");
  assert.equal(accidentalForEvent(measure, "plain"), "none");
  assert.equal(accidentalForEvent(measure, "flat"), "flat");
  assert.equal(alterForAccidental("none", 1), 1);
  assert.equal(alterForAccidental("natural", 1), 0);
  const view: StaffView = { kind: "staff", partId: "p1", staffId: "s1", clef: "treble", measures: [measure] };
  const point = { partId: "p1", staffId: "s1", measureId: "m1", voiceId: "v1", preferredPitch: null } as const;
  assert.equal(inheritedAlterAtPoint(view, { ...point, anchor: { kind: "start" }, offsetUnits: 0 }, { step: "C", octave: 5 }), 0);
  assert.equal(inheritedAlterAtPoint(view, { ...point, anchor: { kind: "after-event", eventId: "sharp" }, offsetUnits: 8 }, { step: "C", octave: 5 }), 1);
});

test("bar occupancy includes dots, follows the actual meter, reduces exactly and does not clamp oversized input", () => {
  assert.equal(getMeasureShare({ base: 2, dots: 0 }, { numerator: 4, denominator: 4 }), "1/2");
  assert.equal(getMeasureShare({ base: 2, dots: 1 }, { numerator: 4, denominator: 4 }), "3/4");
  assert.equal(getMeasureShare({ base: 4, dots: 0 }, { numerator: 3, denominator: 4 }), "1/3");
  assert.equal(getMeasureShare({ base: 2, dots: 1 }, { numerator: 3, denominator: 4 }), "1/1");
  assert.equal(getMeasureShare({ base: 4, dots: 0 }, { numerator: 6, denominator: 8 }), "1/3");
  assert.equal(getMeasureShare({ base: 4, dots: 1 }, { numerator: 6, denominator: 8 }), "1/2");
  assert.equal(getMeasureShare({ base: 4, dots: 0 }, { numerator: 7, denominator: 8 }), "2/7");
  assert.equal(getMeasureShare({ base: 16, dots: 1 }, { numerator: 4, denominator: 4 }), "3/32");
  assert.equal(getMeasureShare({ base: 32, dots: 0 }, { numerator: 3, denominator: 4 }), "1/24");
  assert.equal(getMeasureShare({ base: 1, dots: 0 }, { numerator: 3, denominator: 4 }), "4/3");
  assert.equal(getMeasureShare(input.duration, null), null);
});

test("occupancy uses selected duration in selection mode and tool duration when input resumes", () => {
  const selected: StaffEvent = { id: "selected", duration: { base: 2, dots: 1 },
    content: { kind: "note", pitch: { step: "C", octave: 4, alter: 0 } } };
  assert.equal(resolveNoteOverview(input, selected, { numerator: 3, denominator: 4 }).measureShare, "1/1");
  assert.equal(resolveNoteOverview(input, undefined, { numerator: 6, denominator: 8 }).measureShare, "1/3");
  assert.equal(resolveNoteOverview(input).measureShare, null);
});

test("an empty or incomplete input preview never fabricates a pitch or reuses the previous octave", () => {
  assert.equal(resolveNoteOverview(input).pitch, null);
  const previous = { step: "A" as const, octave: 4, alter: -1 as const };
  const draft = advancePitchEntry(null, "C").draft;
  assert.deepEqual(resolveNoteOverview({ ...input, pitch: previous, draft }).pitch, { step: "C", octave: null, alter: 1 });
  assert.deepEqual(resolveNoteOverview({ ...input, pitch: previous }).pitch, { ...previous, alter: 1 });
  assert.equal(resolveNoteOverview({ ...input, pitch: previous, rest: true }).pitch, null);
});

test("selection displays the actual spelling and duration instead of the next-input settings", () => {
  const selected: StaffEvent = { id: "selected", duration: { base: 8, dots: 1 },
    content: { kind: "note", pitch: { step: "A", octave: 4, alter: -1 } } };
  const value = resolveNoteOverview({ ...input, draft: "C", rest: true }, selected);
  assert.equal(value.source, "selection"); assert.equal(value.rest, false);
  assert.deepEqual(value.pitch, { step: "A", octave: 4, alter: -1 });
  assert.equal(resolveNoteOverview(input, selected, undefined, "flat").accidental, "flat");
  assert.deepEqual(value.duration, { base: 8, dots: 1 }); assert.equal(value.alter, -1);
  const rest = resolveNoteOverview(input, { ...selected, duration: { base: 32, dots: 0 }, content: { kind: "rest" } });
  assert.equal(rest.pitch, null); assert.equal(rest.rest, true); assert.deepEqual(rest.duration, { base: 32, dots: 0 });
  assert.deepEqual(stepNoteDuration(rest.duration, -1, true), { base: 16, dots: 0 });
  assert.deepEqual(stepNoteDuration(rest.duration, 1, true), rest.duration);
  assert.deepEqual(toggleNoteDot(rest.duration), rest.duration);
  assert.deepEqual(stepNoteDuration({ base: 16, dots: 1 }, 1, true), { base: 16, dots: 1 });
});

function fixture() {
  const service = new ScoreSessionService(), workspace = randomUUID();
  let read = service.create(workspace, randomUUID(), null, { title: "", measureCount: 1 });
  function edit(action: ScoreEditAction | null) {
    assert.ok(action);
    read = service.edit(workspace, { requestId: randomUUID(), documentId: read.documentId, expectedVersion: read.documentVersion, action });
    return read;
  }
  function events() {
    assert.equal(read.notation.kind, "staff");
    if (read.notation.kind !== "staff") throw new Error("Expected staff read");
    return read.notation.measures[0]!.events;
  }
  edit({ kind: "append", measureId: "measure-1", anchor: { kind: "start" }, duration: { base: 4, dots: 0 }, content: { kind: "note", pitch: { step: "C", octave: 5, alter: 1 } } });
  const first = events()[0]!;
  edit({ kind: "append", measureId: "measure-1", anchor: { kind: "after-event", eventId: first.id }, duration: { base: 4, dots: 0 }, content: { kind: "note", pitch: { step: "E", octave: 5, alter: 0 } } });
  return { read: () => read, events, edit };
}

test("selected duration and accidental controls update the real event, preserve its identity, and undo completely", () => {
  const f = fixture(), before = f.read(), selected = f.events()[0]!, following = f.events()[1]!;
  f.edit(selectedNoteAction(selected, { kind: "duration", value: stepNoteDuration(selected.duration, 1, false) }));
  const shorter = f.events()[0]!;
  assert.equal(shorter.id, selected.id); assert.deepEqual(shorter.duration, { base: 8, dots: 0 });
  assert.deepEqual(shorter.content, selected.content);
  assert.equal(f.events()[1]!.content.kind, "rest"); assert.deepEqual(f.events()[2], following);
  f.edit(selectedNoteAction(shorter, { kind: "alter", value: -1 }));
  const value = resolveNoteOverview(input, f.events()[0]);
  assert.deepEqual(value.pitch, { step: "C", octave: 5, alter: -1 });
  assert.deepEqual(value.duration, { base: 8, dots: 0 });
  assert.equal(f.read().undoDepth, before.undoDepth + 2);
  f.edit({ kind: "undo" }); f.edit({ kind: "undo" });
  assert.deepEqual(f.read().notation, before.notation);
  assert.deepEqual(input.duration, { base: 4, dots: 0 }); assert.equal(input.alter, 1);
});

test("the selected rest control preserves timing and never guesses a pitch for rest-to-note conversion", () => {
  const f = fixture(), before = f.read(), selected = f.events()[0]!;
  f.edit(selectedNoteAction(selected, { kind: "rest", value: true }));
  const rest = f.events()[0]!;
  assert.equal(rest.id, selected.id); assert.deepEqual(rest.duration, selected.duration);
  assert.deepEqual(rest.content, { kind: "rest" });
  assert.deepEqual(f.events()[1], before.notation.kind === "staff" ? before.notation.measures[0]!.events[1] : null);
  assert.equal(resolveNoteOverview(input, rest).pitch, null);
  assert.equal(selectedNoteAction(rest, { kind: "rest", value: false }), null);
  assert.equal(selectedNoteAction(rest, { kind: "alter", value: 1 }), null);
  f.edit({ kind: "undo" }); assert.deepEqual(f.read().notation, before.notation);
});

test("selected spelled pitch and octave edit the native event without changing timing and undo to the original spelling", () => {
  const f = fixture(), before = f.read(), selected = f.events()[0]!, following = f.events()[1]!;
  f.edit(selectedNoteAction(selected, { kind: "pitch", value: { step: "A", octave: 4, alter: selected.content.kind === "note" ? selected.content.pitch.alter : 0 } }));
  const edited = f.events()[0]!;
  assert.equal(edited.id, selected.id);
  assert.deepEqual(edited.duration, selected.duration);
  assert.deepEqual(edited.content, { kind: "note", pitch: { step: "A", octave: 4, alter: 1 } });
  assert.deepEqual(f.events()[1], following);
  f.edit({ kind: "undo" });
  assert.deepEqual(f.read().notation, before.notation);
});
