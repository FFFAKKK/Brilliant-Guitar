import { test } from "node:test";
import assert = require("node:assert/strict");
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import {
  CommandBus, createScoreDocument, encodeScoreDocumentJson, parseScoreDocumentJson,
  type IntegratedCommandBus, type ScoreDocument,
} from "../../../src/core-kernel/index";
import { installNativeIntegratedBackendV2, type IntegratedNativeAddonV2 } from "../../../src/core-kernel/native/integrated-command-bus";
import { GUITAR_COMMAND, GUITAR_NAMESPACE, minimalGuitarCatalog } from "../fixtures/minimal-guitar-module";

const addon = require(resolve(
  process.env.BRILLIANT_INTEGRATED_ADDON_PATH
    ?? "target/integrated-v2/brilliant_kernel_node.node",
)) as IntegratedNativeAddonV2;
const opaqueBlock = { namespace: "fixture.uninstalled", owner: { kind: "score" as const }, schemaVersion: 19,
  payload: { retained: ["未知插件", "\ud800", { enabled: true }] } };
function initialDocument(): ScoreDocument {
  const result = createScoreDocument({ factoryVersion: 1, documentId: "guitar-flow", metadata: {
    title: "最小吉他编辑流程", authors: ["Brilliant Guitar"], tempo: { bpm: 100 },
  }, initialMeasure: { id: "measure-1", meter: { numerator: 4, denominator: 4 } }, initialParts: [{
    id: "guitar-1", name: "Guitar", instrument: { name: "Guitar", writtenToSounding: { diatonicSteps: -7, chromaticSemitones: -12 } },
    staves: [{ id: "staff-1", lineCount: 5, defaultClef: { sign: "G", line: 2 } }], voices: [{
      id: "voice-1", defaultStaffId: "staff-1", sequence: { start: { numerator: 0, denominator: 1 },
        events: [1, 2, 3, 4].map(index => ({ id: `rest-${index}`, duration: { base: 4, dots: 0 }, content: { kind: "rest" } })),
      },
    }],
  }], extensions: [opaqueBlock] });
  assert.equal(result.status, "created");
  if (result.status !== "created") throw new Error(JSON.stringify(result));
  return result.document;
}
function state(bus: IntegratedCommandBus) {
  const result = bus.read();
  assert.ok(result.ok);
  return result.value;
}
function envelope(commandId: string, target: unknown, payload: unknown) {
  return { commandVersion: 1, commandId, target, payload };
}
function batch(commands: unknown[]) {
  return envelope("core.transaction.batch", { kind: "document", documentId: "guitar-flow" }, { commands });
}
function place(string: number, fret: number) {
  return envelope(GUITAR_COMMAND, { kind: "document", documentId: "guitar-flow" }, {
    partId: "guitar-1", noteId: "note-1", position: { string, fret },
  });
}
function clearPosition() {
  return envelope(GUITAR_COMMAND, { kind: "document", documentId: "guitar-flow" }, {
    partId: "guitar-1", noteId: "note-1", position: null,
  });
}
function assertNote(bus: IntegratedCommandBus, step: "C" | "D", fret: number) {
  const document = state(bus).snapshot.document;
  const events = document.parts[0]!.measureContents[0]!.voices[0]!.sequence.events;
  assert.equal(events.length, 4);
  const content = events[0]!.content;
  assert.equal(content.kind, "notes");
  if (content.kind !== "notes") throw new Error("missing notes");
  assert.deepEqual(content.notes, [{ id: "note-1", writtenPitch: { step, alter: 0, octave: 5 } }]);
  assert.deepEqual(document.extensions.find(block => block.namespace === GUITAR_NAMESPACE)?.payload,
    { tuning: "standard-6", placements: [{ noteId: "note-1", string: 2, fret }] });
  assert.deepEqual(document.extensions.find(block => block.namespace === opaqueBlock.namespace), opaqueBlock);
}

test("Real Rust + minimal guitar consumer: create, CRUD, rejection, history, physical JSON save and fresh reopen", t => {
  const operations: string[] = [];
  let nativeSessions = 0;
  // Delegate to the actual addon; record the operations crossing the native boundary.
  const traced: IntegratedNativeAddonV2 = {
    createIntegratedKernelSessionV2(bytes, executor) {
      nativeSessions++;
      const operate = addon.createIntegratedKernelSessionV2(bytes, executor);
      return request => {
        operations.push((JSON.parse(request.toString("utf8")) as { operation: string }).operation);
        return operate(request);
      };
    },
  };
  function open(document: ScoreDocument) {
    const restore = installNativeIntegratedBackendV2(traced);
    try {
      const created = CommandBus.createIntegrated(document, minimalGuitarCatalog());
      assert.ok(created.ok, JSON.stringify(created));
      return created.value;
    } finally { restore(); }
  }
  const initial = initialDocument(), bus = open(initial);
  const events: unknown[] = [];
  assert.equal(bus.subscribe((event: unknown) => { events.push(event); }).status, "subscribed");
  assert.equal(state(bus).dirty, false);
  const insert = batch([
    envelope("core.event.remove", { kind: "event", eventId: "rest-1" }, {}),
    envelope("core.voice.insert-notes-event", { kind: "voice", voiceId: "voice-1" }, { anchor: { kind: "start" },
      event: { id: "event-1", duration: { base: 4, dots: 0 }, content: { kind: "notes",
        notes: [{ id: "note-1", writtenPitch: { step: "C", alter: 0, octave: 5 } }] } } }),
    place(2, 1),
  ]);
  const inserted = bus.submit(insert);
  assert.equal(inserted.status, "committed", JSON.stringify(inserted));
  assertNote(bus, "C", 1); // B3 + 1 fret = sounding C4, written C5.
  assert.equal(state(bus).history.undoDepth, 1, "one user edit, one shared history entry");
  assert.equal(bus.submit(place(2, 3)).status, "committed");
  assertNote(bus, "D", 3);
  assert.equal(bus.undo().status, "committed");
  assertNote(bus, "C", 1);
  // Reject after a valid Batch prefix, without losing redo or publishing events.
  const beforeRejected = bus.read(), eventCount = events.length;
  const rejectionCodes: string[] = [];
  for (const invalid of [place(0, 1), place(7, 1), place(2, -1), place(2, 25), place(2, 1.5),
    envelope("core.note.set-written-pitch", { kind: "note", noteId: "note-1" }, { writtenPitch: { step: "F", alter: 0, octave: 5 } }),
    batch([envelope("core.part.set-name", { kind: "part", partId: "guitar-1" }, { name: "must roll back" }), place(2, 25)]),
    envelope("core.event.remove", { kind: "event", eventId: "event-1" }, {}),
  ]) {
    const rejected = bus.submit(invalid);
    assert.equal(rejected.status, "rejected", JSON.stringify(rejected));
    if (rejected.status !== "rejected") throw new Error("expected rejection");
    rejectionCodes.push(rejected.failure.code);
    assert.ok(!JSON.stringify(rejected.failure).includes("internal-error"));
    assert.ok(!JSON.stringify(rejected.failure).includes("contract-violation"));
    assert.deepEqual(bus.read(), beforeRejected);
    assert.equal(events.length, eventCount);
  }
  assert.deepEqual(rejectionCodes.slice(0, 5), Array(5).fill("command.invalid-envelope"));
  assert.equal(rejectionCodes[5], "command.contribution-semantic-invalid", "the plugin must reject conflicting pitch");
  assert.equal(rejectionCodes[7], "command.contribution-semantic-invalid", "the plugin must reject a dangling note reference");
  assert.equal(bus.redo().status, "committed");
  assertNote(bus, "D", 3);
  const beforeDelete = state(bus).snapshot.document;
  const removed = bus.submit(batch([
    clearPosition(), envelope("core.event.remove", { kind: "event", eventId: "event-1" }, {}),
    envelope("core.voice.insert-rest-event", { kind: "voice", voiceId: "voice-1" }, {
      anchor: { kind: "start" }, event: { id: "rest-1", duration: { base: 4, dots: 0 }, content: { kind: "rest" } },
    }),
  ]));
  assert.equal(removed.status, "committed", JSON.stringify(removed));
  assert.deepEqual(state(bus).snapshot.document.parts, initial.parts);
  assert.deepEqual(state(bus).snapshot.document.extensions.find(block => block.namespace === GUITAR_NAMESPACE)?.payload,
    { tuning: "standard-6", placements: [] });
  const deleted = state(bus).snapshot.document;
  assert.equal(bus.undo().status, "committed");
  assert.deepEqual(state(bus).snapshot.document, beforeDelete);
  assert.equal(bus.redo().status, "committed");
  assert.deepEqual(state(bus).snapshot.document, deleted);
  assert.equal(bus.undo().status, "committed");
  assertNote(bus, "D", 3);

  // Host-owned physical IO. This deliberately does not claim a .bgp file service.
  const snapshot = state(bus).snapshot;
  const encoded = encodeScoreDocumentJson(snapshot.document);
  assert.ok(encoded.ok);
  const evidenceRoot = resolve(".local-evidence/minimal-guitar-flow");
  mkdirSync(evidenceRoot, { recursive: true });
  const directory = mkdtempSync(join(evidenceRoot, "run-"));
  const savedFile = join(directory, "score.json");
  writeFileSync(savedFile, encoded.value, { encoding: "utf8", flag: "wx" });
  assert.equal(bus.markPersisted({ documentId: snapshot.document.id, documentVersion: snapshot.documentVersion }).status, "updated");
  assert.equal(state(bus).dirty, false);
  const parsed = parseScoreDocumentJson(readFileSync(savedFile, "utf8"));
  assert.ok(parsed.ok);
  const reopened = open(parsed.value); // Fresh SDK catalog and fresh Rust Store/history.
  assert.equal(nativeSessions, 2);
  assert.deepEqual(state(reopened).snapshot.document, snapshot.document);
  assert.deepEqual(state(reopened).history, { undoDepth: 0, redoDepth: 0 });
  assert.equal(state(reopened).dirty, false);
  assertNote(reopened, "D", 3);
  assert.equal(reopened.submit(place(2, 1)).status, "committed");
  assert.equal(state(reopened).dirty, true);
  assertNote(reopened, "C", 1);
  assert.equal(reopened.undo().status, "committed");
  assertNote(reopened, "D", 3);
  assert.equal(state(reopened).dirty, false);
  // Parsing and structural validation reject malformed files before a new session.
  assert.equal(parseScoreDocumentJson(encoded.value.slice(0, -1)).ok, false);
  assert.equal(parseScoreDocumentJson('{"schemaVersion":"future-format"}').ok, false);
  for (const operation of ["submit", "undo", "redo", "read", "markPersisted"]) assert.ok(operations.includes(operation));
  writeFileSync(join(directory, "result.json"), JSON.stringify({ status: "passed", nativeSessions,
    nativeOperations: [...new Set(operations)], rejectedEdits: rejectionCodes.length, rejectionCodes, savedFile,
    scope: "test-only guitar consumer, physical score JSON, fresh session; no UI, BGP, crash recovery or commercial qualification",
  }, null, 2));
  t.diagnostic(`Business-flow evidence: ${directory}`);
});
