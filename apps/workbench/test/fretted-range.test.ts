import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { ScoreSessionService, WorkbenchHostError } from "../host/score-session.ts";
import type { ScoreDocument } from "../.kernel/src/core-kernel/index.js";
import type { ScoreEditRequest } from "../src/contracts/note-input.ts";
import { isScoreEditRequest } from "../src/contracts/note-input.ts";
import { isFrettedPosition } from "../../../shared/notation/tablature-model.ts";
import { tablatureInteractionContribution as tab } from "../../../shared/notation/interaction/tablature-interaction-contribution.ts";
import type { TablatureInputContext } from "../../../shared/notation/interaction/tablature-interaction-contribution.ts";
import { CommandBus } from "../.kernel/src/core-kernel/index.js";
import { defineFrettedInstrumentDomainV1 } from "../.kernel/src/instrument-sdk/fretted-instrument-domain.js";
import { STANDARD_GUITAR_TUNING_V1 } from "../.kernel/src/first-party-modules/guitar-domain.js";

function raw(): ScoreDocument {
  return JSON.parse(readFileSync(new URL("../../desktop/src-tauri/src/application/official_domains/guitar-document.json",
    import.meta.url), "utf8")) as ScoreDocument;
}
function open(document = raw()) {
  const host = new ScoreSessionService(), workspace = randomUUID();
  let current = host.importDocument(workspace, document);
  const edit = (fret: number, stringNumber = 6) => {
    const request: ScoreEditRequest = { requestId: randomUUID(), documentId: current.documentId,
      expectedVersion: current.documentVersion, action: { kind: "set-fretted-position",
        partId: "part-1", eventId: "event-a", position: { stringNumber, fret } } };
    return current = host.edit(workspace, request);
  };
  const history = (kind: "undo" | "redo") => current = host.edit(workspace, {
    requestId: randomUUID(), documentId: current.documentId,
    expectedVersion: current.documentVersion, action: { kind },
  });
  return { host, workspace, edit, history, current: () => current,
    document: () => JSON.parse(host.exportDocument(workspace)) as ScoreDocument };
}

test("the real host accepts fret 67 without imposing the instrument's physical last fret", () => {
  const f = open();
  const read = f.edit(67);
  assert.equal(read.undoDepth, 1);
  assert.ok(read.tablature?.kind === "tablature");
  assert.equal(read.notation.kind, "unsupported");
  const event = f.document().parts[0]!.measureContents[0]!.voices[0]!.sequence.events[0]!;
  assert.ok(event.content.kind === "notes");
  assert.deepEqual(event.content.notes[0]!.writtenPitch, { step: "B", alter: 0, octave: 8 });
});

test("legacy reads and no-op preserve schema 1; a real edit upgrades and history restores the exact old block", () => {
  const legacy = raw();
  Object.assign(legacy.extensions[0]!, { schemaVersion: 1 });
  Object.assign(legacy.extensions[0]!.payload, { fretCount: 24 });
  const f = open(legacy), before = f.document();
  assert.equal(f.edit(0).undoDepth, 0);
  assert.deepEqual(f.document(), before, "opening and no-op never rewrite old facts");
  const changed = f.edit(67), upgraded = f.document();
  assert.equal(upgraded.extensions[0]!.schemaVersion, 2);
  assert.equal(upgraded.extensions[0]!.payload.fretCount, 24, "known physical construction remains intact");
  assert.equal(changed.undoDepth, 1);
  f.history("undo");
  assert.deepEqual(f.document(), before, "one undo restores schema, pitch and fingering");
  f.history("redo");
  assert.deepEqual(f.document(), upgraded);
  const restored = open(upgraded);
  assert.deepEqual(restored.current().tablature, changed.tablature);
  assert.equal(restored.current().undoDepth, 0);
});

test("new Guitar has no default last fret, and each string's actual Core pitch boundary is atomic", () => {
  assert.equal(raw().extensions[0]!.schemaVersion, 2);
  assert.equal(raw().extensions[0]!.payload.fretCount, null);
  for (const [stringNumber, last, next] of [[1, 43, 44], [6, 67, 68]]) {
    const f = open();
    f.edit(last!, stringNumber);
    const before = f.document(), read = f.current();
    for (const fret of [next!, 100, 1000, Number.MAX_SAFE_INTEGER]) {
      assert.throws(() => f.edit(fret, stringNumber), error => {
        assert.ok(error instanceof WorkbenchHostError);
        assert.equal(error.status, 422);
        assert.equal(error.issue?.code, "core.command.contribution-semantic-invalid");
        return true;
      });
      assert.deepEqual(f.document(), before, "rejection does not clamp pitch or save a position");
      assert.deepEqual(f.current(), read, "rejection adds no history or version");
    }
  }
});

test("invalid legacy data cannot be legitimized by migration, and future data remains lossless", () => {
  for (const update of [{ fretCount: null }, { fretCount: 37 }, { fretCount: 24, capoFret: 25 }]) {
    const legacy = raw();
    Object.assign(legacy.extensions[0]!, { schemaVersion: 1 });
    Object.assign(legacy.extensions[0]!.payload, { fretCount: 24 }, update);
    assert.throws(() => open(legacy));
  }
  const future = raw();
  Object.assign(future.extensions[0]!, { schemaVersion: 3, payload: { preserve: [3, 2, 1] } });
  const f = open(future), before = f.document();
  assert.throws(() => f.edit(67));
  assert.deepEqual(f.document(), before);
});

test("wire and shared numeric grammar support sixteen exact digits without coupling to physical construction", () => {
  let context: TablatureInputContext = { notationKind: "tablature", focusScope: "score", target: "event",
    capabilities: ["update", "compose"], composing: false, eventId: "event-a", stringNumber: 6,
    stringCount: 6, fretCount: 24, capoFret: 0, currentPosition: { stringNumber: 6, fret: 0 },
    composition: { kind: "idle" } };
  const key = (value: string) => ({ kind: "key-press" as const, key: value, repeat: false, modifiers: [] });
  for (const digit of String(Number.MAX_SAFE_INTEGER)) {
    const output = tab.input.translate(key(digit), context);
    assert.ok(output?.kind === "compose");
    context = { ...context, composition: { kind: "composing", ...tab.startComposition(output.draft) } };
  }
  const confirmed = tab.input.translate(key("Enter"), { ...context, fretCount: null });
  assert.ok(confirmed?.kind === "intent");
  assert.equal(confirmed.intent.properties.position.fret, Number.MAX_SAFE_INTEGER);
  assert.equal(tab.input.translate(key("1"), context)?.kind, "cancel-composition");
  const position = confirmed.intent.properties.position;
  const request = { requestId: randomUUID(), documentId: "score", expectedVersion: 0,
    action: { kind: "set-fretted-position", partId: "part-1", eventId: "event-a", position } };
  assert.equal(isScoreEditRequest(request), true);
  assert.equal(isScoreEditRequest({ ...request, action: { ...request.action,
    position: { ...position, fret: Number.MAX_SAFE_INTEGER + 1 } } }), false);
  assert.equal(isFrettedPosition(position, context), true);
  assert.equal(isFrettedPosition(position, { ...context, capoFret: 1 }), false);
  assert.equal(tab.input.translate(key("Enter"), { ...context, capoFret: 1 })?.kind, "cancel-composition");
});

test("a genuine legacy schema 1 provider opens new Guitar facts losslessly in read-only mode", () => {
  const old = defineFrettedInstrumentDomainV1<{ readonly id: string; readonly kind: "unused" }>({
    id: "brilliant.instrument.guitar", displayName: "Legacy Guitar reader", schemaVersion: 1,
    stringCount: 6, fretCount: 24, capoFret: 0, tuning: STANDARD_GUITAR_TUNING_V1,
    writtenPitchOffsetSemitones: 12, supportsChords: true,
    matchesInstrument: instrument => instrument.writtenToSounding.chromaticSemitones === -12,
    techniques: { decode: () => undefined, encode: value => ({ id: value.id, kind: value.kind }),
      equals: () => false, targetNoteIds: () => [], validate: () => undefined, validateCollection: () => undefined },
  });
  const catalog = old.compileCatalog(); assert.ok(catalog.ok);
  const document = raw(), created = CommandBus.createIntegrated(document, catalog.catalog);
  assert.ok(created.ok);
  const read = created.value.read(); assert.ok(read.ok);
  assert.equal(read.value.writeAvailability.status, "read-only");
  assert.deepEqual(read.value.snapshot.document, document);
  assert.equal(created.value.submit({ commandVersion: 1, commandId: old.commandIds.setPosition,
    target: { kind: "part", partId: "part-1" }, payload: { noteId: "note-a", position: { stringNumber: 6, fret: 1 } } }).status, "rejected");
  const after = created.value.read(); assert.ok(after.ok);
  assert.deepEqual(after.value, read.value);
});
