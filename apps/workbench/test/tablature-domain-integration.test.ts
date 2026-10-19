import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { CommandBus, createScoreDocument, encodeScoreDocumentJson, parseScoreDocumentJson } from "../.kernel/src/core-kernel/index.js";
import type { IntegratedCommandBus, ScoreDocument } from "../.kernel/src/core-kernel/index.js";
import { installNativeIntegratedBackendV2 } from "../.kernel/src/core-kernel/native/integrated-command-bus.js";
import type { IntegratedNativeAddonV2 } from "../.kernel/src/core-kernel/native/integrated-command-bus.js";
import { compileGuitarDomainModuleCatalogV1, INITIALIZE_GUITAR_COMMAND, SET_GUITAR_POSITION_COMMAND,
  SET_GUITAR_TUNING_COMMAND, SET_GUITAR_TECHNIQUE_COMMAND, DROP_D_GUITAR_TUNING_V1 } from "../.kernel/src/first-party-modules/guitar-domain.js";
import { defineFrettedInstrumentDomainV1 } from "../.kernel/src/instrument-sdk/fretted-instrument-domain.js";
import { projectFrettedTablature, prepareFrettedPositionEdit } from "../host/fretted-notation.ts";
import type { FrettedNotationDomain } from "../host/fretted-notation.ts";
import { guitarNotationDomain } from "../host/guitar-notation.ts";
import { isFrettedPosition, isTablatureView } from "../../../shared/notation/tablature-model.ts";
import { tablatureInteractionContribution as tab, TABLATURE_FRET_COMPOSITION } from "../../../shared/notation/interaction/tablature-interaction-contribution.ts";
import type { FretDraft, TablatureInputContext, TablaturePositionIntent } from "../../../shared/notation/interaction/tablature-interaction-contribution.ts";
import { staffInteractionContribution } from "../../../shared/notation/interaction/staff-interaction-contribution.ts";
import { bindNotationInteraction, scopeNotationInteractions } from "../../../shared/notation/interaction/interaction-binding.ts";
import { definePlugin } from "../src/plugins/plugin-sdk.ts";
import { PluginPlatform } from "../src/plugins/plugin-platform.ts";
import { createMountContributionHost } from "../src/plugins/plugin-mount-host.ts";
import { WorkbenchFeatureRegistry } from "../src/ui/plugin-manifest.ts";
import type { KeyPressSignal } from "../../../shared/notation/interaction/input-signal.ts";

const key = (value: string, repeat = false, modifiers: KeyPressSignal["modifiers"] = []): KeyPressSignal =>
  ({ kind: "key-press", key: value, repeat, modifiers });
const context = (extra: Partial<TablatureInputContext> = {}): TablatureInputContext => ({
  notationKind: "tablature", focusScope: "score", target: "event", capabilities: ["compose", "update", "navigate"],
  composing: false, eventId: "event-1", stringNumber: 6, stringCount: 6, fretCount: 24, capoFret: 0,
  currentPosition: null, composition: { kind: "idle" }, ...extra,
});
function composed(first = "1", input = context()) {
  const output = tab.input.translate(key(first), input);
  assert.ok(output?.kind === "compose");
  return { ...input, composition: { kind: "composing" as const, ...tab.startComposition(output.draft) } };
}
function intent(fret = 12, stringNumber = 6): TablaturePositionIntent {
  return { kind: "update-event", eventId: "event-1", properties: { kind: "fretted-position", position: { stringNumber, fret } } };
}

const native = createRequire(import.meta.url)("../../../target/integrated-v2/brilliant_kernel_node.node") as IntegratedNativeAddonV2;
function document(): ScoreDocument {
  const result = createScoreDocument({ factoryVersion: 1, documentId: "score-tab",
    metadata: { title: "Tab integration", authors: [], tempo: { bpm: 96 } },
    initialMeasure: { id: "measure-1", meter: { numerator: 4, denominator: 4 } },
    initialParts: [{ id: "part-1", name: "Guitar", instrument: { name: "Guitar",
      writtenToSounding: { diatonicSteps: -7, chromaticSemitones: -12 } },
      staves: [{ id: "staff-1", lineCount: 5, defaultClef: { sign: "G", line: 2 } }],
      voices: [{ id: "voice-1", defaultStaffId: "staff-1", sequence: { start: { numerator: 0, denominator: 1 },
        events: [{ id: "event-1", duration: { base: 4, dots: 0 },
          content: { kind: "notes", notes: [{ id: "note-1", writtenPitch: { step: "E", alter: 0, octave: 3 } }] } },
          { id: "rest-1", duration: { base: 4, dots: 0 }, content: { kind: "rest" } }] } }],
    }], extensions: [] });
  assert.equal(result.status, "created"); assert.ok(result.status === "created"); return result.document;
}
function open(source = document()) {
  const compiled = compileGuitarDomainModuleCatalogV1(); assert.ok(compiled.ok);
  const restore = installNativeIntegratedBackendV2(native);
  try {
    const created = CommandBus.createIntegrated(source, compiled.catalog); assert.ok(created.ok);
    return created.value;
  } finally { restore(); }
}
function read(bus: IntegratedCommandBus) {
  const value = bus.read(); assert.ok(value.ok); return value.value;
}
function initialized(positioned = true) {
  const bus = open();
  assert.equal(bus.submit({ commandVersion: 1, commandId: INITIALIZE_GUITAR_COMMAND,
    target: { kind: "part", partId: "part-1" }, payload: {} }).status, "committed");
  if (positioned) assert.equal(bus.submit({ commandVersion: 1, commandId: SET_GUITAR_POSITION_COMMAND,
    target: { kind: "part", partId: "part-1" }, payload: { noteId: "note-1", position: { stringNumber: 6, fret: 0 } } }).status, "committed");
  return bus;
}
function pitch(bus: IntegratedCommandBus) {
  const event = read(bus).snapshot.document.parts[0]!.measureContents[0]!.voices[0]!.sequence.events[0]!;
  assert.ok(event.content.kind === "notes"); return event.content.notes[0]!.writtenPitch;
}

test("Tab numeric composition preserves note identity and emits a fretted intent only on confirmation", () => {
  const first = composed(), second = tab.input.translate(key("2"), first);
  assert.ok(second?.kind === "compose");
  assert.equal(second.methodId, TABLATURE_FRET_COMPOSITION);
  assert.equal(second.draft.digits, "12");
  assert.deepEqual(tab.input.translate(key("Enter"), { ...first,
    composition: { kind: "composing", ...tab.startComposition(second.draft) } }), { kind: "intent", intent: intent() });
  assert.equal(tab.input.translate(key("C"), context())?.kind, "ignored");
  assert.equal(tab.input.translate(key("1", true), context())?.kind, "ignored");
  assert.equal(tab.input.translate(key("1", false, ["ctrl"]), context()), null);
  assert.equal(tab.input.translate(key("1"), context({ target: "caret" })), null);
  assert.equal(tab.input.translate(key("1"), context({ focusScope: "field" })), null);
  assert.equal(tab.input.translate(key("1"), context({ capabilities: ["compose"] })), null);
});

test("Tab validates capo-relative frets, invalid suffixes, cancellation and stale composition targets", () => {
  const first = composed("2");
  assert.equal(tab.input.translate(key("5"), first)?.kind, "compose", "physical fret count is not an input ceiling");
  const edge = { ...context(), composition: { kind: "composing" as const, ...tab.startComposition({
    eventId: "event-1", stringNumber: 6, maxFret: Number.MAX_SAFE_INTEGER, digits: "900719925474099" }) } };
  assert.equal(tab.input.translate(key("2"), edge)?.kind, "cancel-composition", "unsafe suffix never commits the previous digits");
  assert.equal(tab.input.translate(key("Enter"), context())?.kind, "ignored");
  for (const extra of [{ eventId: "event-other" }, { stringNumber: 5 }, { capoFret: 2 }]) {
    assert.equal(tab.input.translate(key("Enter"), { ...first, ...extra })?.kind, "cancel-composition");
  }
  assert.equal(tab.input.translate(key("Backspace"), first)?.kind, "cancel-composition");
  assert.equal(tab.input.translate(key("Escape"), first)?.kind, "cancel-composition");
  const two = tab.input.translate(key("2"), composed()); assert.ok(two?.kind === "compose");
  const erased = tab.input.translate(key("Backspace"), { ...context(), composition: { kind: "composing", ...tab.startComposition(two.draft) } });
  assert.ok(erased?.kind === "compose"); assert.equal(erased.draft.digits, "1");
  assert.equal(isFrettedPosition({ stringNumber: 6, fret: Number.MAX_SAFE_INTEGER }, context({ capoFret: 2 })), false);
  assert.equal(isFrettedPosition({ stringNumber: 0, fret: 0 }, context()), false);
  assert.equal(isFrettedPosition({ stringNumber: 1, fret: 1.5 }, context()), false);
  assert.throws(() => tab.startComposition({ eventId: "event-1", stringNumber: 6, maxFret: 24, digits: "25" }), /Invalid/);
});

test("Tab navigation and increment policies use instrument dimensions without six-string branches", () => {
  assert.deepEqual(tab.navigate(key("ArrowUp"), context()), { stringNumber: 5, cancelComposition: true });
  assert.equal(tab.navigate(key("ArrowDown"), context()), null);
  assert.deepEqual(tab.navigate(key("ArrowDown"), context({ stringCount: 4, stringNumber: 3 })), { stringNumber: 4, cancelComposition: true });
  assert.equal(tab.navigate(key("ArrowUp"), context({ stringCount: 4, stringNumber: 1 })), null);
  assert.deepEqual(tab.edit(key("+"), context({ currentPosition: { stringNumber: 6, fret: 11 } })), intent());
  assert.deepEqual(tab.edit(key("+", false, ["shift"]), context({ currentPosition: { stringNumber: 6, fret: 11 } })), intent());
  assert.equal(tab.edit(key("+", false, ["ctrl", "shift"]), context({ currentPosition: { stringNumber: 6, fret: 11 } })), null);
  assert.equal(tab.edit(key("+"), context({ currentPosition: { stringNumber: 6, fret: Number.MAX_SAFE_INTEGER } })), null);
  assert.equal(tab.edit(key("-"), context({ currentPosition: { stringNumber: 6, fret: 0 } })), null);
  assert.equal(tab.edit(key("+"), composed()), null);
  assert.equal(tab.edit(key("Delete"), context()), null, "relationship cleanup is not a direct Core delete");
});

test("real SDK capture and one platform keep Tab and staff view bindings independent and expire both", () => {
  const core = definePlugin({ id: "notation.core", name: "核心谱面", version: "0.1.0", apiVersion: "4.0",
    interactions: [staffInteractionContribution, tab] });
  const platform = new PluginPlatform({ hostFeatures: new WorkbenchFeatureRegistry([]), projections: [],
    createContributionHost: host => createMountContributionHost(host, () => () => {}) });
  platform.register(core); platform.start();
  const directory = scopeNotationInteractions(platform.interactions(), core.interactions);
  const binding = bindNotationInteraction(directory, "tablature"), staff = bindNotationInteraction(directory, "staff");
  try {
    assert.equal(platform.list()[0]?.status, "active");
    const output = binding.translate<TablatureInputContext, FretDraft, TablaturePositionIntent>(key("1"), context());
    assert.ok(output?.kind === "compose");
    assert.deepEqual(binding.translate(key("Enter"), composed("0")), { kind: "intent", intent: intent(0) });
    assert.equal(binding.readDraft({ kind: "composing", ...binding.startComposition(output.draft)! }) !== null, true);
    assert.equal(staff.translate(key("1"), context()), null);
  } finally { platform.dispose(); }
  assert.equal(binding.translate(key("1"), context()), null);
  assert.equal(binding.edit(key("+"), context()), null);
});

test("captured Tab input reaches the authentic Rust integrated session, atomic pitch/position and one history entry", () => {
  const core = definePlugin({ id: "notation.tab-trial", name: "Tab trial", version: "0.1.0", apiVersion: "4.0", interactions: [tab] });
  const platform = new PluginPlatform({ hostFeatures: new WorkbenchFeatureRegistry([]), projections: [],
    createContributionHost: host => createMountContributionHost(host, () => () => {}) });
  platform.register(core); platform.start();
  try {
    const binding = bindNotationInteraction(scopeNotationInteractions(platform.interactions(), core.interactions), "tablature");
    let input = context();
    for (const digit of ["1", "2"]) {
      const output = binding.translate<TablatureInputContext, FretDraft, TablaturePositionIntent>(key(digit), input);
      assert.ok(output?.kind === "compose"); input = { ...input, composition: { kind: "composing", ...binding.startComposition(output.draft)! } };
    }
    const output = binding.translate<TablatureInputContext, FretDraft, TablaturePositionIntent>(key("Enter"), input);
    assert.ok(output?.kind === "intent");
    const bus = initialized(), before = read(bus), original = before.snapshot.document;
    const prepared = prepareFrettedPositionEdit(original, "part-1", output.intent, guitarNotationDomain);
    assert.ok(prepared.ok);
    assert.equal(bus.submit(prepared.command).status, "committed");
    assert.equal(read(bus).history.undoDepth, before.history.undoDepth + 1);
    assert.deepEqual(pitch(bus), { step: "E", alter: 0, octave: 4 });
    const after = read(bus).snapshot.document;
    const view = projectFrettedTablature(after, "part-1", guitarNotationDomain); assert.ok(view.kind === "tablature");
    assert.deepEqual(view.measures[0]!.events[0]!.content,
      { kind: "note", noteId: "note-1", position: { stringNumber: 6, fret: 12 } });
    assert.equal(bus.submit(prepared.command).status, "no-op");
    assert.equal(read(bus).history.undoDepth, before.history.undoDepth + 1);
    assert.equal(bus.undo().status, "committed"); assert.deepEqual(read(bus).snapshot.document, original);
    assert.equal(bus.redo().status, "committed"); assert.deepEqual(read(bus).snapshot.document, after);
    const encoded = encodeScoreDocumentJson(after); assert.ok(encoded.ok);
    const parsed = parseScoreDocumentJson(encoded.value); assert.ok(parsed.ok);
    assert.deepEqual(projectFrettedTablature(read(open(parsed.value)).snapshot.document, "part-1", guitarNotationDomain), view);
  } finally { platform.dispose(); }
});

test("accepted alternate tuning drives both written pitch and the unchanged Tab placement", () => {
  const bus = initialized();
  assert.equal(bus.submit({ commandVersion: 1, commandId: SET_GUITAR_TUNING_COMMAND,
    target: { kind: "part", partId: "part-1" }, payload: { tuning: DROP_D_GUITAR_TUNING_V1 } }).status, "committed");
  const prepared = prepareFrettedPositionEdit(read(bus).snapshot.document, "part-1", intent(), guitarNotationDomain);
  assert.ok(prepared.ok); assert.equal(bus.submit(prepared.command).status, "committed");
  assert.deepEqual(pitch(bus), { step: "D", alter: 0, octave: 4 });
  const view = projectFrettedTablature(read(bus).snapshot.document, "part-1", guitarNotationDomain);
  assert.ok(view.kind === "tablature"); assert.equal(view.measures[0]!.events[0]!.id, "event-1");
});

test("missing placements, domains, selected events and malformed Tab data fail without guesses or mutation", () => {
  assert.equal(projectFrettedTablature(document(), "part-1", guitarNotationDomain).kind, "unsupported");
  const bus = initialized(false), before = read(bus);
  assert.equal(projectFrettedTablature(before.snapshot.document, "part-1", guitarNotationDomain).kind, "unsupported");
  assert.deepEqual(prepareFrettedPositionEdit(before.snapshot.document, "part-1", { ...intent(), eventId: "missing" }, guitarNotationDomain),
    { ok: false, code: "notation.tablature.selection-stale" });
  assert.deepEqual(prepareFrettedPositionEdit(before.snapshot.document, "part-1", { ...intent(), eventId: "rest-1" }, guitarNotationDomain),
    { ok: false, code: "notation.tablature.single-note-required" });
  assert.deepEqual(prepareFrettedPositionEdit(before.snapshot.document, "part-1", intent(-1), guitarNotationDomain),
    { ok: false, code: "notation.tablature.invalid-position" });
  assert.deepEqual(read(bus), before);
  const prepared = prepareFrettedPositionEdit(before.snapshot.document, "part-1", intent(), guitarNotationDomain);
  assert.ok(prepared.ok); assert.equal(bus.submit(prepared.command).status, "committed");
  const view = projectFrettedTablature(read(bus).snapshot.document, "part-1", guitarNotationDomain); assert.ok(view.kind === "tablature");
  assert.equal(isTablatureView(view), true);
  assert.equal(isTablatureView({ ...view, stringCount: 0 }), false);
  assert.equal(isTablatureView({ ...view, capoFret: Number.MAX_SAFE_INTEGER + 1 }), false);
  assert.equal(isTablatureView({ ...view, measures: [{ ...view.measures[0], events: [
    view.measures[0]!.events[0], view.measures[0]!.events[0],
  ] }] }), false);
  assert.equal(projectFrettedTablature({ ...read(bus).snapshot.document, extensions: [] }, "part-1", guitarNotationDomain).kind, "unsupported");
});

test("real Guitar techniques cannot be silently dropped and domain rejection retains accepted state", () => {
  const bus = initialized(), before = read(bus);
  const bad = { commandVersion: 1, commandId: SET_GUITAR_POSITION_COMMAND, target: { kind: "part", partId: "part-1" },
    payload: { noteId: "note-1", position: { stringNumber: 7, fret: 12 } } };
  assert.equal(bus.submit(bad).status, "rejected"); assert.deepEqual(read(bus), before);
  assert.equal(bus.submit({ commandVersion: 1, commandId: SET_GUITAR_TECHNIQUE_COMMAND, target: { kind: "part", partId: "part-1" },
    payload: { technique: { id: "vibrato-1", kind: "vibrato", noteId: "note-1" } } }).status, "committed");
  assert.equal(projectFrettedTablature(read(bus).snapshot.document, "part-1", guitarNotationDomain).kind, "unsupported");
});

test("Tab projection rejects unsupported rhythms, chords and opaque extensions instead of presenting partial music", () => {
  const source = read(initialized()).snapshot.document;
  const variants = [
    { ...source, extensions: [...source.extensions, { namespace: "trial.opaque", schemaVersion: 1, owner: { kind: "score" as const }, payload: {} }] },
    { ...source, measureDefinitions: [{ ...source.measureDefinitions[0]!, pickupDuration: { numerator: 1, denominator: 4 } }] },
  ];
  for (const variant of variants) assert.equal(projectFrettedTablature(variant, "part-1", guitarNotationDomain).kind, "unsupported");
  const part = source.parts[0]!, content = part.measureContents[0]!, voice = content.voices[0]!, sourceEvent = voice.sequence.events[0]!;
  const chord: ScoreDocument = { ...source, parts: [{ ...part, measureContents: [{ ...content, voices: [{ ...voice,
    sequence: { ...voice.sequence, events: [{ ...sourceEvent, content: { kind: "notes", notes: [
      { id: "note-1", writtenPitch: { step: "E", alter: 0, octave: 3 } },
      { id: "note-2", writtenPitch: { step: "G", alter: 0, octave: 3 } },
    ] } }, ...voice.sequence.events.slice(1)] } }] }] }] };
  assert.equal(projectFrettedTablature(chord, "part-1", guitarNotationDomain).kind, "unsupported");
  const view = projectFrettedTablature(source, "part-1", guitarNotationDomain); assert.ok(view.kind === "tablature");
  const measure = view.measures[0]!, event = measure.events[0]!;
  assert.equal(isTablatureView({ ...view, measures: [{ ...measure, events: [{ ...event, duration: { base: 64, dots: 0 } }] }] }), false);
  assert.equal(isTablatureView({ ...view, measures: [{ ...measure, events: [{ ...event, duration: { base: 32, dots: 0 } }] }] }), false);
});

test("the same notation adapter works with a real four-string family provider", () => {
  const bass = defineFrettedInstrumentDomainV1({
    id: "trial.instrument.bass", displayName: "Bass trial", schemaVersion: 1, stringCount: 4, fretCount: 21, capoFret: 0,
    writtenPitchOffsetSemitones: 12, supportsChords: false, matchesInstrument: value => value.name === "Guitar",
    tuning: [
      { stringNumber: 1, soundingPitch: { step: "G", alter: 0, octave: 2 } },
      { stringNumber: 2, soundingPitch: { step: "D", alter: 0, octave: 2 } },
      { stringNumber: 3, soundingPitch: { step: "A", alter: 0, octave: 1 } },
      { stringNumber: 4, soundingPitch: { step: "E", alter: 0, octave: 1 } },
    ], techniques: { decode: () => undefined, encode: value => ({ id: value.id, kind: value.kind }),
      equals: (a, b) => a.id === b.id, targetNoteIds: () => [], validate: () => undefined, validateCollection: () => undefined },
  });
  const domain: FrettedNotationDomain = { namespace: bass.namespace, setPositionCommandId: bass.commandIds.setPosition, readPart: bass.readPart };
  const compiled = bass.compileCatalog(); assert.ok(compiled.ok);
  const restore = installNativeIntegratedBackendV2(native);
  let bus: IntegratedCommandBus;
  try { const created = CommandBus.createIntegrated(document(), compiled.catalog); assert.ok(created.ok); bus = created.value; }
  finally { restore(); }
  assert.equal(bus.submit({ commandVersion: 1, commandId: bass.commandIds.initialize, target: { kind: "part", partId: "part-1" }, payload: {} }).status, "committed");
  const prepared = prepareFrettedPositionEdit(read(bus).snapshot.document, "part-1", intent(3, 4), domain);
  assert.ok(prepared.ok); assert.equal(bus.submit(prepared.command).status, "committed");
  assert.deepEqual(pitch(bus), { step: "G", alter: 0, octave: 2 });
  const view = projectFrettedTablature(read(bus).snapshot.document, "part-1", domain);
  assert.ok(view.kind === "tablature"); assert.equal(view.stringCount, 4);
});
