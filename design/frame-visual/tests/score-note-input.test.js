import assert from "node:assert/strict";
import test from "node:test";
import { createReadonlyScoreDocumentSession } from "../src/vendor/desktop-plugin-settings.js";
import { createDocumentStaffProjection } from "../src/score/document-staff-projection.js";
import { createBackupFormalPlatform, prepareBackupPlugin } from "../src/host/formal-plugin-assembly.js";
import { createCommandRouter } from "../src/runtime/command-router.js";
import { createComponentRegistry } from "../src/runtime/component-registry.js";
import { createComponentHost } from "../src/runtime/component-host.js";
import { createMenuRegistry } from "../src/runtime/menu-registry.js";
import { WORKSPACE_MENU_DEFINITIONS } from "../src/host/workspace-menus.js";
import { createNotices } from "../src/runtime/notices.js";
import { bindKeyboard } from "../src/host/keyboard.js";
import { STAFF_FIXTURE } from "../src/fixtures/staff-snapshot.js";
import { SCORE_INPUT_KEY_COMMAND, SCORE_INPUT_CHANGE_COMMAND, SCORE_INPUT_TOOL_COMMAND as IT,
  SCORE_INPUT_POINTER_COMMAND as IP, SCORE_INPUT_KEY_BUFFER_LIMIT } from "../src/contracts/score-note-input.js";
import { withTestDocument } from "./support/dom-test-environment.js";
import { clickAt, loadCoreSelectionPluginForTest, settle } from "./support/score-selection-fixture.js";
import { createScoreMusicGlyph } from "../src/score/score-music-glyph.js";
import { SCORE_CLIPBOARD_COMMANDS as K } from "../src/contracts/score-clipboard.js";
import { createScoreClipboardFragment } from "../src/vendor/score-interaction.js";
import { measureMeterTargets } from "../src/vendor/score-interaction.js";
import { SCORE_MEASURE_COMMANDS as M } from "../src/contracts/score-measure.js";
import { SCORE_KEY_SIGNATURE_COMMAND as KS } from "../src/contracts/score-key-signature.js";
import { SCORE_STAFF_CLEF_COMMAND as SC } from "../src/contracts/score-staff-clef.js";
import { createScoreClefGlyph } from "../src/score/score-clef-glyph.js";
import { SCORE_DOCUMENT_METADATA_COMMAND as DM } from "../src/contracts/score-document-metadata.js";
import { createScoreSelection } from "../src/score/score-selection.js";
import { createScoreNoteInput } from "../src/score/score-note-input.js";
import { sourceFixture } from "./support/score-selection-fixture.js";

function session(version = 0, id = "piece") {
  return { documentId: id, documentVersion: version, title: "未命名乐谱", measureCount: 1, undoDepth: version, redoDepth: 0,
    metadata: { title: "未命名乐谱", authors: [], tempoBpm: 96 },
    notation: { ...structuredClone(STAFF_FIXTURE), title: "未命名乐谱", measures: [{ ...structuredClone(STAFF_FIXTURE.measures[0]), events: [] }] },
    playbackSource: { kind: "unsupported", projectionVersion: 1, documentId: id, documentVersion: version,
      code: "playback.input-test", message: "Synthetic host test; playback is not exercised" } };
}

// The generated service, formal platform, core declaration, source projection,
// keyboard and command chain are real. Host mutation and drawing are explicit doubles.
function withInput(run, initial = session(), clipboardPort = null, withoutKeys = false, withoutClefs = false, metadataOptions = {}) {
  return withTestDocument(async ({ document }) => {
    let current = initial, gate = null, fail = false, lostAck = false;
    let saveGate = null, cancelSave = false, failSave = false, savedDocument = null;
    const writes = [], saves = [], acceptedDrawings = [], undo = [], redo = [];
    const client = { usesNativeFiles: () => true, read: async () => current,
      create: async () => { throw new Error("unexpected auto-create"); },
      createGuarded: async () => (current = session(0, "replacement")),
      openNativeDocumentGuarded: async () => { throw new Error("unexpected open"); },
      async saveNativeDocumentGuarded(name, saveAs, expected) {
        saves.push({ name, saveAs, expected: structuredClone(expected) }); if (saveGate) await saveGate;
        if (cancelSave) return null; if (failSave) throw new Error("disk unavailable");
        assert.equal(expected.documentId, current.documentId); assert.equal(expected.documentVersion, current.documentVersion);
        savedDocument = structuredClone(current);
        return { session: current, name, savedVersion: current.documentVersion };
      },
      async edit(request) {
        writes.push(structuredClone(request)); if (gate) await gate;
        if (fail) throw new Error("edit unavailable");
        assert.equal(request.documentId, current.documentId); assert.equal(request.expectedVersion, current.documentVersion);
        let next;
        if (request.action.kind === "undo") { redo.push(current); next = structuredClone(undo.pop()); }
        else if (request.action.kind === "redo") { undo.push(current); next = structuredClone(redo.pop()); }
        else if (request.action.kind === "delete-event") {
          undo.push(current); redo.length = 0; next = structuredClone(current);
          const measure = next.notation.measures.find(item => item.events.some(event => event.id === request.action.eventId));
          const index = measure?.events.findIndex(event => event.id === request.action.eventId) ?? -1;
          assert.ok(measure && index >= 0, "delete target must exist"); measure.events.splice(index, 1);
        } else if (request.action.kind === "delete-range") {
          undo.push(current); redo.length = 0; next = structuredClone(current);
          const range = request.action.range, measure = next.notation.measures.find(item => item.id === range.measureId && item.voiceId === range.voiceId);
          const indexes = [range.startEventId, range.endEventId].map(id => measure.events.findIndex(event => event.id === id));
          assert.ok(indexes.every(index => index >= 0)); measure.events.splice(Math.min(...indexes), Math.abs(indexes[0] - indexes[1]) + 1);
        } else if (request.action.kind === "paste-fragment") {
          undo.push(current); redo.length = 0; next = structuredClone(current);
          const action = request.action, measure = next.notation.measures.find(item => item.id === action.measureId && item.voiceId === action.voiceId);
          const index = action.anchor.kind === "start" ? 0 : measure.events.findIndex(item => item.id === action.anchor.eventId) + 1;
          measure.events.splice(index, 0, ...action.fragment.events.map((value, offset) => ({ ...structuredClone(value), id: `pasted-${writes.length}-${offset}` })));
        } else if (request.action.kind === "insert-measure") {
          undo.push(current); redo.length = 0; next = structuredClone(current);
          const index = next.notation.measures.findIndex(item => item.id === request.action.measureId), target = next.notation.measures[index];
          next.notation.measures.splice(index + (request.action.position === "after" ? 1 : 0), 0, {
            ...structuredClone(target), id: `new-measure-${writes.length}`, voiceId: `new-voice-${writes.length}`, events: [], ruleWarnings: [],
          });
        } else if (request.action.kind === "remove-measure") {
          undo.push(current); redo.length = 0; next = structuredClone(current);
          next.notation.measures.splice(next.notation.measures.findIndex(item => item.id === request.action.measureId), 1);
        } else if (request.action.kind === "set-measure-meter") {
          undo.push(current); redo.length = 0; next = structuredClone(current);
          for (const measure of measureMeterTargets(next.notation.measures, request.action.measureId, request.action.scope)) measure.meter = structuredClone(request.action.meter);
        } else if (request.action.kind === "set-key-signature") {
          // Synthetic host branch only; actual normalization/domain behavior is covered by TS/Native tests.
          undo.push(current); redo.length = 0; next = structuredClone(current);
          const action = request.action, index = next.notation.measures.findIndex(item => item.id === action.measureId);
          assert.equal(action.partId, next.notation.partId); assert.ok(index >= 0);
          next.notation.keySignatureChanges = (next.notation.keySignatureChanges ?? []).filter(item => item.measureId !== action.measureId);
          if (action.change.kind === "set") next.notation.keySignatureChanges.push({ measureId: action.measureId, measureIndex: index, fifths: action.change.fifths });
          next.notation.keySignatureChanges.sort((a, b) => a.measureIndex - b.measureIndex);
        } else if (request.action.kind === "set-staff-clef") {
          // Only the host mutation is synthetic; Native/TS suites verify the actual Core semantics.
          undo.push(current); redo.length = 0; next = structuredClone(current);
          assert.equal(request.action.staffId, next.notation.staffId); next.notation.clef = request.action.clef;
        } else if (request.action.kind === "set-document-metadata") {
          // Only host mutation is synthetic; actual Core/domain behavior is covered by TS and Native.
          undo.push(current); redo.length = 0; next = structuredClone(current);
          next.metadata = structuredClone(request.action.metadata); next.title = next.metadata.title;
          next.notation.title = next.title; next.notation.tempoBpm = next.metadata.tempoBpm;
        } else if (request.action.kind === "set-event-properties") {
          undo.push(current); redo.length = 0; next = structuredClone(current);
          const event = next.notation.measures.flatMap(item => item.events).find(item => item.id === request.action.eventId);
          assert.ok(event, "property target must exist"); Object.assign(event, structuredClone(request.action.properties));
        } else {
          undo.push(current); redo.length = 0; next = structuredClone(current);
          const measure = next.notation.measures.find(item => item.id === request.action.measureId);
          const index = request.action.anchor.kind === "start" ? 0 : measure.events.findIndex(item => item.id === request.action.anchor.eventId) + 1;
          measure.events.splice(index, 0, { id: `inserted-${writes.length}`, duration: request.action.duration, content: request.action.content });
        }
        next.measureCount = next.notation.measures.length;
        next.documentVersion = current.documentVersion + 1; next.undoDepth = undo.length; next.redoDepth = redo.length;
        next.playbackSource.documentVersion = next.documentVersion; current = next;
        if (lostAck) throw new Error("acknowledgement lost"); return current;
      } };
    const documents = createReadonlyScoreDocumentSession({ client }); await documents.read();
    const projection = createDocumentStaffProjection({ readSession: documents.read, subscribe: documents.subscribe, retrySession: documents.reload });
    projection.start();
    const { createCoreScorePlugin } = await loadCoreSelectionPluginForTest();
    const router = createCommandRouter(), registry = createComponentRegistry(), notices = createNotices(), routed = [];
    const execute = router.execute;
    router.execute = (id, payload) => { routed.push({ id, payload: structuredClone(payload) }); return execute(id, payload); };
    const menus = createMenuRegistry(WORKSPACE_MENU_DEFINITIONS);
    const platform = createBackupFormalPlatform({ router, components: registry, menus });
    const interactionCalls = [];
    if (metadataOptions.observeInteractions) {
      const directory = platform.interactions();
      platform.interactions = () => Object.freeze(Object.fromEntries(Object.keys(directory).map(method => [method,
        (...args) => { interactionCalls.push({ method, args }); return directory[method](...args); }])));
    }
    platform.register(prepareBackupPlugin(createCoreScorePlugin({ score: projection.read,
      documentActions: { ...documents, ...(withoutKeys ? { setKeySignature: undefined } : {}),
        ...(withoutClefs ? { setStaffClef: undefined } : {}),
        ...(metadataOptions.withoutPort ? { setDocumentMetadata: undefined } : {}) }, clipboardPort }))); platform.start();
    const host = createComponentHost({ registry, router, notices }), element = host.ensure("notation.core.view", "stage");
    document.body.append(element); const stopKeys = bindKeyboard(router, { root: element, components: host });
    const stopDraw = projection.read.subscribe(value => acceptedDrawings.push(value));
    const stopState = documents.subscribeState(() => router.refresh());
    function key(value, extra = {}, target = element) {
      const event = new Event("keydown", { bubbles: true, cancelable: true });
      for (const [name, property] of Object.entries({ key: value, repeat: false, ...extra })) Object.defineProperty(event, name, { value: property });
      target.dispatchEvent(event); return event;
    }
    try {
      await settle(); assert.equal(element.dataset.renderState, "ready", element.textContent);
      if (!metadataOptions.skipLocate) clickAt(element.querySelector('[data-measure-id="measure-1"]'), 10, 25);
      await run({ key, element, router, host, platform, interactionCalls, documents, projection, writes, saves, menus, notices, acceptedDrawings, routed,
        savedDocument: () => savedDocument,
        setSaveGate: value => { saveGate = value; }, cancelSave: value => { cancelSave = value; }, failSave: value => { failSave = value; },
        setGate: value => { gate = value; }, fail: value => { fail = value; }, loseAck: value => { lostAck = value; } });
    } finally { stopState(); stopDraw(); stopKeys(); host.dispose(); platform.dispose(); projection.dispose(); documents.dispose(); }
  });
}

function withEvents() {
  const value = session(); value.notation.measures[0].events = structuredClone(STAFF_FIXTURE.measures[0].events.slice(0, 3)); return value;
}
const pick = (f, index, extra = {}) => clickAt(f.element.querySelector('[data-measure-id="measure-1"]'), 25 + index * 20, 15, extra);

const metadataField = (f, key) => f.element.querySelector(`[data-metadata="${key}"]`);
function openMetadata(f) { metadataField(f, "toggle").click(); return f.element.querySelector(".score-metadata-editor"); }
function fillMetadata(f, title = " 练习曲 ", authors = " 作者甲 \n\nDoe, Jane", tempo = "132.5") {
  metadataField(f, "title").value = title; metadataField(f, "authors").value = authors; metadataField(f, "tempo").value = tempo;
}
const submitMetadata = f => f.element.querySelector(".score-metadata-editor").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));

test("the real core keyboard and edit chain consume the formally registered staff strategy", () => withInput(async f => {
  const record = f.platform.list()[0];
  assert.equal(record.manifest.name, "核心谱面"); assert.equal(record.manifest.apiVersion, "4.0");
  assert.deepEqual(f.platform.interactions().list(), ["notation.staff.interaction", "notation.tablature.interaction"]);
  f.key("C"); assert.equal(f.writes.length, 0);
  f.key("4"); await settle(); assert.equal(f.writes.length, 1);
  f.key("ArrowLeft"); assert.equal(f.element.dataset.scoreTarget, "event");
  f.key("D"); f.key("5"); await settle();
  assert.equal(f.writes.length, 2); assert.equal(f.writes[1].action.kind, "set-event-properties");
  assert.deepEqual(f.writes[1].action.properties.content.pitch, { step: "D", octave: 5, alter: 0 });
  for (const method of ["translate", "navigate", "edit", "readDraft", "startComposition"]) {
    const calls = f.interactionCalls.filter(call => call.method === method);
    assert.ok(calls.length > 0, `actual UI must consume directory.${method}`);
    assert.ok(calls.every(call => call.args[0] === "staff"));
  }
  const retained = f.platform.interactions(); f.host.release("notation.core.view"); f.platform.dispose();
  assert.deepEqual(retained.list(), []); assert.equal(retained.hasKind("staff"), false);
  assert.equal(f.router.execute(SCORE_INPUT_KEY_COMMAND, {}).ok, false);
}, session(), null, false, false, { observeInteractions: true }));

test("metadata opens without selecting a note, commits once through the original router and preserves unavailable focus", () => withInput(async f => {
  assert.equal(f.element.querySelector('[data-score-selection="caret"]'), null);
  const panel = openMetadata(f), bar = f.element.querySelector(".score-event-controls");
  assert.equal(panel.hidden, false); assert.equal(document.activeElement, metadataField(f, "title"));
  assert.equal(metadataField(f, "toggle").textContent, ""); fillMetadata(f);
  assert.equal(f.key("C", {}, metadataField(f, "title")).defaultPrevented, false);
  assert.equal(f.key("Enter", {}, metadataField(f, "authors")).defaultPrevented, false, "authors retain newline");
  assert.equal(f.key("Enter", {}, metadataField(f, "title")).defaultPrevented, true); await settle();
  assert.equal(f.writes.length, 1); assert.equal(f.writes[0].action.kind, "set-document-metadata");
  assert.deepEqual(f.writes[0].action.metadata, { title: "练习曲", authors: ["作者甲", "Doe, Jane"], tempoBpm: 132.5 });
  assert.equal(f.documents.snapshot().title, "练习曲"); assert.equal(f.documents.snapshot().undoDepth, 1);
  assert.equal(f.acceptedDrawings.at(-1).tempoBpm, 132.5);
  assert.equal(panel.hidden, true); assert.equal(document.activeElement, f.element);
  assert.equal(f.element.querySelector('[data-score-selection="caret"]'), null);
  assert.equal(f.element.querySelector(".score-event-controls"), bar);
  f.router.execute("notation.core.document.undo"); await settle(); assert.equal(f.documents.snapshot().title, "未命名乐谱");
  f.router.execute("notation.core.document.redo"); await settle(); assert.equal(f.documents.snapshot().title, "练习曲");
  await f.documents.save(); assert.deepEqual(f.savedDocument().metadata, f.writes[0].action.metadata);
}, session(), null, false, false, { skipLocate: true }));

test("metadata form shares old normalization, rejects invalid fields and no-op changes neither history nor dirty state", () => withInput(async f => {
  const before = f.documents.snapshot(); openMetadata(f); fillMetadata(f, " ", "\n", "96"); submitMetadata(f); await settle();
  assert.equal(f.writes.length, 0); assert.deepEqual(f.documents.snapshot(), before);
  openMetadata(f); fillMetadata(f, "😀".repeat(61), "", "1"); submitMetadata(f);
  assert.equal(metadataField(f, "title").getAttribute("aria-invalid"), "true");
  fillMetadata(f, "标题", Array(17).fill("甲").join("\n"), "1"); submitMetadata(f);
  assert.equal(metadataField(f, "authors").getAttribute("aria-invalid"), "true");
  fillMetadata(f, "标题", "", "Infinity"); submitMetadata(f);
  assert.equal(metadataField(f, "tempo").getAttribute("aria-invalid"), "true"); assert.equal(f.writes.length, 0);
  assert.equal(f.key("Escape", {}, metadataField(f, "title")).defaultPrevented, true);
  assert.equal(f.element.querySelector(".score-metadata-editor").hidden, true);
  assert.equal(document.activeElement, metadataField(f, "toggle"));
}));

test("document metadata drafts survive note selection changes but reject changed document versions and malformed payloads", () => withInput(async f => {
  openMetadata(f); fillMetadata(f); pick(f, 1); submitMetadata(f); await settle(); assert.equal(f.writes.length, 1);
  assert.ok(f.element.querySelector('[data-score-selection="event"]'));
  openMetadata(f); const accepted = f.documents.snapshot(), revision = f.routed.find(value => value.id === DM).payload.sourceRevision;
  const payload = { documentId: accepted.documentId, documentVersion: accepted.documentVersion, sourceRevision: revision,
    metadata: { ...accepted.metadata, title: "later" } };
  assert.equal(f.router.execute(DM, payload).code, "score.input.stale");
  const fresh = { ...payload, sourceRevision: f.routed.at(-1).payload.sourceRevision };
  assert.equal(f.router.execute(DM, { ...fresh, extra: true }).code, "score.input.invalid-payload");
  f.router.execute("notation.core.document.undo"); await settle();
  assert.equal(metadataField(f, "apply").disabled, true); submitMetadata(f); await settle(); assert.equal(f.writes.length, 2);
  assert.match(f.element.querySelector(".score-metadata-feedback").textContent, /作品已改变/);
  metadataField(f, "cancel").click(); openMetadata(f); fillMetadata(f, "重新打开", "", "100"); submitMetadata(f); await settle();
  assert.equal(f.documents.snapshot().title, "重新打开");
}, withEvents()));

test("metadata fields reserve IME and modifiers, share pending exclusion and close on hidden view", () => withInput(async f => {
  openMetadata(f); fillMetadata(f);
  assert.equal(f.key("Enter", { isComposing: true }, metadataField(f, "title")).defaultPrevented, false);
  assert.equal(f.key("Enter", { ctrlKey: true }, metadataField(f, "title")).defaultPrevented, false);
  assert.equal(f.key("Enter", { repeat: true }, metadataField(f, "title")).defaultPrevented, false);
  const panel = f.element.querySelector(".score-metadata-editor");
  panel.dispatchEvent(new Event("compositionstart", { bubbles: true })); submitMetadata(f); await settle(); assert.equal(f.writes.length, 0);
  panel.dispatchEvent(new Event("compositionend", { bubbles: true }));
  let release; f.setGate(new Promise(yes => { release = yes; })); submitMetadata(f); await settle();
  assert.equal(metadataField(f, "apply").disabled, true); assert.equal(f.documents.snapshot().busy, true);
  submitMetadata(f); f.key("R"); await settle(); assert.equal(f.writes.length, 1);
  f.host.setVisible("notation.core.view", false); assert.equal(panel.hidden, true); release(); await settle();
  f.host.setVisible("notation.core.view", true); assert.equal(f.documents.snapshot().title, "练习曲"); assert.equal(panel.hidden, true);
}));

test("metadata hiding before dispatch and disposal before or after dispatch cannot revive controls or repeat writes", async () => {
  for (const mode of ["hide", "release", "late"]) await withInput(async f => {
    let release; f.setGate(new Promise(yes => { release = yes; })); openMetadata(f); fillMetadata(f); submitMetadata(f);
    if (mode === "late") await settle();
    if (mode === "hide") f.host.setVisible("notation.core.view", false); else f.host.release("notation.core.view");
    release(); await settle(); assert.equal(f.writes.length, mode === "late" ? 1 : 0, mode);
    if (mode === "hide") { f.host.setVisible("notation.core.view", true); assert.equal(metadataField(f, "toggle").disabled, false); }
    else assert.equal(f.element.childNodes.length, 0);
  });
});

test("metadata failures and lost receipts preserve the accepted SVG and recover by reload without replay", async () => {
  for (const lost of [false, true]) await withInput(async f => {
    openMetadata(f); fillMetadata(f); const svg = f.element.querySelector(".score-view-svg");
    if (lost) f.loseAck(true); else f.fail(true); submitMetadata(f); await settle();
    assert.equal(f.documents.snapshot().status, "error"); assert.equal(f.documents.snapshot().title, "未命名乐谱");
    assert.equal(f.element.querySelector(".score-view-svg"), svg); assert.equal(metadataField(f, "apply").disabled, true);
    submitMetadata(f); await settle(); assert.equal(f.writes.length, 1);
    f.loseAck(false); f.fail(false); await f.documents.reload(); await settle();
    assert.equal(f.documents.snapshot().title, lost ? "练习曲" : "未命名乐谱"); assert.equal(f.writes.length, 1);
    metadataField(f, "cancel").click(); openMetadata(f); assert.equal(metadataField(f, "title").value, lost ? "练习曲" : "未命名乐谱");
  });
});

test("missing metadata capability contributes no edit command, legacy reads cannot erase unknown authors", async () => {
  await withInput(async f => {
    assert.equal(metadataField(f, "toggle"), null);
    assert.equal(f.router.execute(DM, {}).ok, false);
  }, session(), null, false, false, { withoutPort: true });
  const legacy = session(); delete legacy.metadata;
  await withInput(async f => {
    assert.equal(metadataField(f, "toggle").disabled, true);
    metadataField(f, "toggle").click(); assert.equal(f.element.querySelector(".score-metadata-editor").hidden, true);
    assert.equal(f.writes.length, 0);
  }, legacy);
});

test("failed document edits without a note target recover after reload and permit another metadata edit", async () => {
  for (const lost of [false, true]) await withInput(async f => {
    openMetadata(f); fillMetadata(f);
    if (lost) f.loseAck(true); else f.fail(true); submitMetadata(f); await settle();
    assert.equal(f.documents.snapshot().status, "error"); assert.equal(f.writes.length, 1);
    f.fail(false); f.loseAck(false); await f.documents.reload(); await settle();
    assert.equal(metadataField(f, "toggle").disabled, false, "fresh read must dismiss a failed document transaction");
    assert.equal(f.element.querySelector('[data-score-selection="caret"]'), null, "recovery does not invent a note target");
    metadataField(f, "cancel").click(); openMetadata(f); fillMetadata(f, "再次编辑", "", "100");
    submitMetadata(f); await settle(); assert.equal(f.writes.length, 2);
    assert.equal(f.documents.snapshot().title, "再次编辑");
  }, session(), null, false, false, { skipLocate: true });
});

test("Shift range and graphical copy/paste share the same core commands, preserve fresh IDs and undo once", () => withInput(async f => {
  pick(f, 0); assert.equal(f.key("ArrowRight", { shiftKey: true }).defaultPrevented, true);
  assert.equal(f.element.querySelector('[data-score-selection="range"]').getAttribute("width"), "30");
  assert.equal(f.element.querySelector('[data-property="step"]').disabled, true);
  assert.match(f.element.getAttribute("aria-description"), /2个/);
  assert.equal(f.key("c", { ctrlKey: true }).defaultPrevented, true); await settle(); assert.equal(f.writes.length, 0);
  assert.match(f.element.querySelector(".score-input-state").title, /当前谱面会话/);
  f.key("Escape"); assert.ok(f.element.querySelector('[data-score-selection="event"]')); f.key("Escape");
  f.element.querySelector('[data-clipboard="paste"]').click(); await settle();
  const request = f.writes[0]; assert.equal(request.action.kind, "paste-fragment"); assert.equal(request.action.fragment.events.length, 2);
  assert.ok(request.action.fragment.events.every(event => Object.keys(event).join(",") === "duration,content"));
  assert.deepEqual(request.action.anchor, { kind: "after-event", eventId: "event-1-1" });
  assert.equal(f.documents.snapshot().undoDepth, 1); assert.ok(f.element.querySelector('[data-event-id="pasted-1-0"]'));
  assert.ok(f.element.querySelector('[data-score-selection="caret"]')); f.key("z", { ctrlKey: true }); await settle();
  assert.equal(f.element.querySelector('[data-event-id="pasted-1-0"]'), null); assert.equal(f.documents.snapshot().redoDepth, 1);
  assert.ok(f.menus.resolve().find(menu => menu.id === "edit").groups.flat().some(item => item.command === K.copy));
}, withEvents()));

test("reverse Shift-click ranges cut atomically and Delete follows original range policy", () => withInput(async f => {
  pick(f, 2); pick(f, 0, { shiftKey: true });
  assert.equal(f.key("x", { ctrlKey: true }).defaultPrevented, true); await settle();
  assert.equal(f.writes[0].action.kind, "delete-range"); assert.equal(f.writes[0].action.range.startEventId, "event-1-1");
  assert.equal(f.writes[0].action.range.endEventId, "event-1-3");
  assert.equal(f.element.querySelector('[data-event-id="event-1-1"]'), null); assert.equal(f.documents.snapshot().undoDepth, 1);
  f.key("z", { ctrlKey: true }); await settle(); pick(f, 0); f.key("ArrowRight", { shiftKey: true });
  assert.equal(f.key("Delete").defaultPrevented, true); await settle();
  assert.equal(f.writes.at(-1).action.kind, "delete-range"); assert.ok(f.element.querySelector('[data-event-id="event-1-3"]'));
}, withEvents()));

test("single-event cut collapses through the same range command; denied system clipboard falls back", () => withInput(async f => {
  pick(f, 1); f.key("x", { ctrlKey: true }); f.key("x", { ctrlKey: true, repeat: true }); await settle();
  assert.equal(f.writes.length, 1); assert.equal(f.writes[0].action.range.startEventId, "event-1-2");
  assert.equal(f.writes[0].action.range.endEventId, "event-1-2"); f.key("v", { ctrlKey: true }); await settle();
  assert.equal(f.writes[1].action.fragment.events.length, 1); assert.equal(f.writes[1].action.kind, "paste-fragment");
}, withEvents(), { readText: async () => { throw new Error("denied"); }, writeText: async () => { throw new Error("denied"); } }));

test("async cut or paste cannot follow a changed target, hidden view or replaced document", async () => {
  const text = JSON.stringify(createScoreClipboardFragment(withEvents().notation.measures[0].events.slice(0, 1)));
  for (const mode of ["target", "replacement", "hidden", "released"]) {
    let release; const gate = new Promise(yes => { release = yes; });
    await withInput(async f => {
      pick(f, 0); assert.equal(f.key("v", { ctrlKey: true }).defaultPrevented, true); await settle();
      if (mode === "target") pick(f, 1);
      if (mode === "replacement") { await f.documents.save(); await f.documents.newScore(); }
      if (mode === "hidden") f.host.setVisible("notation.core.view", false);
      if (mode === "released") f.host.release("notation.core.view");
      release(); await settle(); assert.equal(f.writes.length, 0, mode);
    }, withEvents(), { readText: async () => { await gate; return text; }, writeText: async () => {} });
  }
  let release; const gate = new Promise(yes => { release = yes; });
  await withInput(async f => { pick(f, 0); f.key("x", { ctrlKey: true }); await settle(); pick(f, 1); release(); await settle();
    assert.equal(f.writes.length, 0); assert.match(f.element.querySelector(".score-input-state").title, /选择或作品已改变/);
  }, withEvents(), { writeText: async () => { await gate; }, readText: async () => text });
});

test("clipboard does not steal native field/IME/modifier keys or accept stale and malformed tokens", () => withInput(async f => {
  pick(f, 0); const field = document.createElement("input"); f.element.append(field);
  assert.equal(f.key("c", { ctrlKey: true }, field).defaultPrevented, false);
  assert.equal(f.key("v", { ctrlKey: true, isComposing: true }).defaultPrevented, false);
  assert.equal(f.key("x", { ctrlKey: true, altKey: true }).defaultPrevented, false);
  assert.equal(f.key("v", { ctrlKey: true, shiftKey: true }).defaultPrevented, false);
  assert.equal(f.router.execute(K.copy, { sourceRevision: -1, selectionRevision: -1 }).code, "score.input.stale");
  assert.equal(f.router.execute(K.copy, { surprise: true }).code, "score.input.invalid-payload");
  f.key("v", { ctrlKey: true }); await settle(); assert.equal(f.writes.length, 0);
  assert.match(f.element.querySelector(".score-input-state").title, /没有可粘贴/);
}, withEvents()));

test("range/paste failure and lost acknowledgements retain accepted SVG and recover without replay", async () => {
  for (const lost of [false, true]) await withInput(async f => {
    pick(f, 0); f.key("c", { ctrlKey: true }); await settle();
    if (lost) f.loseAck(true); else f.fail(true);
    const svg = f.element.querySelector(".score-view-svg"); f.key("v", { ctrlKey: true }); await settle();
    assert.equal(f.projection.snapshot().status, "error"); assert.equal(f.element.querySelector(".score-view-svg"), svg);
    assert.equal(f.writes.length, 1); f.key("v", { ctrlKey: true }); await settle(); assert.equal(f.writes.length, 1);
    f.fail(false); f.loseAck(false); await f.documents.reload(); await settle();
    assert.equal(f.documents.snapshot().documentVersion, lost ? 1 : 0); assert.equal(f.writes.length, 1);
  }, withEvents());
});

test("actual core commands accept C4 and R through the original session, advance the caret and redraw accepted music", () => withInput(async f => {
  assert.equal(f.key("C").defaultPrevented, true);
  assert.match(f.element.querySelector(".score-input-state").title, /C/);
  assert.equal(f.writes.length, 0); assert.equal(f.key("4").defaultPrevented, true); await settle();
  assert.equal(f.documents.snapshot().documentVersion, 1); assert.equal(f.documents.snapshot().dirty, true);
  assert.deepEqual(f.writes[0].action.content, { kind: "note", pitch: { step: "C", octave: 4, alter: 0 } });
  assert.ok(f.element.querySelector('[data-event-id="inserted-1"]'));
  assert.equal(f.element.querySelector('[data-score-selection="caret"]').getAttribute("x"), "29.5");
  assert.equal(f.key("R").defaultPrevented, true); await settle();
  assert.equal(f.writes[1].action.offsetUnits, 16); assert.deepEqual(f.writes[1].action.anchor, { kind: "after-event", eventId: "inserted-1" });
  assert.equal(f.writes[1].expectedVersion, 1); assert.equal(f.writes[1].action.content.kind, "rest");
  assert.ok(f.element.querySelector('[data-event-id="inserted-2"]')); assert.equal(f.notices.state().entries.length, 0);
  assert.equal(f.element.querySelector(".score-input-state").textContent, "");
}));

test("input uses original key-signature inheritance, duration stepping and dots", () => {
  const initial = session(); initial.notation.keySignatureChanges = [{ measureId: "measure-1", measureIndex: 0, fifths: 1 }];
  return withInput(async f => {
    f.key("+"); f.key("."); f.key("F"); f.key("4"); await settle();
    assert.deepEqual(f.writes[0].action.duration, { base: 8, dots: 1 });
    assert.deepEqual(f.writes[0].action.content.pitch, { step: "F", octave: 4, alter: 1 });
  }, initial);
});

test("pending and repeating keys cannot create duplicate edits or move the captured anchor", () => withInput(async f => {
  let release; f.setGate(new Promise(resolve => { release = resolve; }));
  f.key("C"); f.key("4"); f.key("R"); f.key("ArrowRight"); await settle();
  assert.equal(f.writes.length, 1); assert.equal(f.documents.snapshot().busy, true);
  assert.equal(f.element.querySelector('[data-score-selection="caret"]').getAttribute("x"), "9.5");
  release(); await settle(); f.key("R", { repeat: true }); await settle(); assert.equal(f.writes.length, 1);
}));

test("IME, fields, modifiers, unknown payloads and stale tokens never dispatch an edit", () => withInput(async f => {
  const field = document.createElement("input"); f.element.append(field);
  assert.equal(f.key("C", {}, field).defaultPrevented, false);
  assert.equal(f.key("C", { isComposing: true }).defaultPrevented, false);
  assert.equal(f.key("C", { ctrlKey: true }).defaultPrevented, false);
  assert.equal(f.router.execute(SCORE_INPUT_KEY_COMMAND, null).code, "score.input.invalid-payload");
  assert.equal(f.router.execute(SCORE_INPUT_KEY_COMMAND, { key: "C", repeat: false, sourceRevision: -1 }).code, "score.input.stale");
  f.key("C"); f.key("9"); await settle(); assert.equal(f.writes.length, 0);
  assert.match(f.element.querySelector(".score-input-state").title, /2–6/);
  f.key("C"); assert.equal(f.key("Escape").defaultPrevented, true); f.key("4"); await settle(); assert.equal(f.writes.length, 0);
}));

test("write failure preserves the old SVG and requires read recovery before another insertion", () => withInput(async f => {
  const svg = f.element.querySelector(".score-view-svg"); f.fail(true); f.key("C"); f.key("4"); await settle();
  assert.equal(f.documents.snapshot().documentVersion, 0); assert.equal(f.projection.snapshot().status, "error");
  assert.equal(f.element.querySelector(".score-view-svg"), svg); f.key("R"); assert.equal(f.writes.length, 1);
  f.fail(false); await f.documents.reload(); await settle(); f.key("R"); await settle(); assert.equal(f.writes.length, 2);
  assert.equal(f.documents.snapshot().documentVersion, 1);
}));

test("a competing document read cannot start a pitch draft or poison the next input transaction", () => withInput(async f => {
  const reloading = f.documents.reload();
  assert.equal(f.key("C").defaultPrevented, false); assert.equal(f.key("4").defaultPrevented, false);
  await reloading; await settle(); assert.equal(f.writes.length, 0);
  f.key("C"); f.key("4"); await settle(); assert.equal(f.writes.length, 1);
}));

test("lost acknowledgement is recovered by read without replaying the already committed note", () => withInput(async f => {
  f.loseAck(true); f.key("C"); f.key("4"); await settle(); assert.equal(f.writes.length, 1);
  assert.equal(f.documents.snapshot().documentVersion, 0); f.loseAck(false);
  await f.documents.reload(); await settle(); assert.equal(f.documents.snapshot().documentVersion, 1);
  assert.ok(f.element.querySelector('[data-event-id="inserted-1"]')); assert.equal(f.writes.length, 1);
}));

test("document replacement cancels a partial pitch composition even with reused measure IDs", () => withInput(async f => {
  f.key("C"); await f.documents.newScore(); await settle();
  assert.equal(f.documents.snapshot().documentId, "replacement");
  clickAt(f.element.querySelector('[data-measure-id="measure-1"]'), 10, 25); f.key("4"); await settle();
  assert.equal(f.writes.length, 0);
}));

test("release before deferred dispatch prevents the write", () => withInput(async f => {
  f.key("C"); f.key("4"); f.host.release("notation.core.view"); await settle();
  assert.equal(f.writes.length, 0); assert.equal(f.element.children.length, 0);
  assert.equal(f.router.execute(SCORE_INPUT_KEY_COMMAND, {}).code, "score.input.not-ready");
}));

test("late accepted results remain in the application document without remounting a released view", () => withInput(async f => {
  let release; f.setGate(new Promise(resolve => { release = resolve; }));
  f.key("C"); f.key("4"); await settle(); assert.equal(f.writes.length, 1);
  f.host.release("notation.core.view"); release(); await settle();
  assert.equal(f.documents.snapshot().documentVersion, 1); assert.equal(f.element.children.length, 0);
  assert.equal(f.router.execute(SCORE_INPUT_KEY_COMMAND, {}).code, "score.input.not-ready");
}));

test("original command/menu/keyboard chain restores music through undo and both redo mappings", () => withInput(async f => {
  f.key("C"); f.key("4"); await settle();
  assert.equal(f.router.describe("notation.core.document.undo").enabled(), true);
  assert.equal(f.key("z", { ctrlKey: true }).defaultPrevented, true); await settle();
  assert.equal(f.documents.snapshot().documentVersion, 2); assert.equal(f.documents.snapshot().redoDepth, 1);
  assert.equal(f.element.querySelector('[data-event-id="inserted-1"]'), null);
  assert.ok(f.element.querySelector('[data-score-selection="caret"]'));
  assert.equal(f.key("z", { ctrlKey: true, shiftKey: true }).defaultPrevented, true); await settle();
  assert.ok(f.element.querySelector('[data-event-id="inserted-1"]'));
  await f.router.execute("notation.core.document.undo"); await settle();
  f.key("y", { ctrlKey: true }); await settle(); assert.ok(f.element.querySelector('[data-event-id="inserted-1"]'));
  const items = f.menus.resolve().flatMap(menu => menu.groups.flat());
  assert.ok(items.some(item => item.menu === "edit" && item.command === "notation.core.document.undo"));
  assert.ok(items.some(item => item.menu === "file" && item.command === "notation.core.document.save-as"));
}));

test("save and save-as update the accepted checkpoint, then further input becomes dirty", () => withInput(async f => {
  f.key("C"); f.key("4"); await settle(); assert.equal(f.documents.snapshot().dirty, true);
  assert.equal(f.key("s", { ctrlKey: true }).defaultPrevented, true); await settle();
  assert.equal(f.saves.length, 1); assert.equal(f.saves[0].saveAs, false);
  assert.equal(f.documents.snapshot().saved, true); assert.equal(f.documents.canReplace(), true);
  f.key("R"); await settle(); assert.equal(f.documents.snapshot().dirty, true);
  assert.equal(f.writes[1].expectedVersion, 1);
  f.key("s", { ctrlKey: true, shiftKey: true }); await settle();
  assert.equal(f.saves[1].saveAs, true); assert.equal(f.saves[1].expected.documentVersion, 2);
  assert.equal(f.documents.snapshot().dirty, false);
}));

test("cancelled and failed saves keep accepted music/dirty state and require read recovery after failure", () => withInput(async f => {
  f.key("C"); f.key("4"); await settle(); f.cancelSave(true);
  assert.deepEqual(await f.router.execute("notation.core.document.save"), { ok: true, changed: false, cancelled: true });
  assert.equal(f.documents.snapshot().dirty, true); assert.equal(f.documents.snapshot().status, "ready");
  f.cancelSave(false); f.failSave(true); assert.equal((await f.router.execute("notation.core.document.save")).ok, false); await settle();
  assert.equal(f.documents.snapshot().dirty, true); assert.ok(f.element.querySelector('[data-event-id="inserted-1"]'));
  assert.equal(f.router.describe("notation.core.document.undo").enabled(), false);
  f.failSave(false); await f.documents.reload(); await settle();
  await f.router.execute("notation.core.document.save"); assert.equal(f.documents.snapshot().dirty, false);
}));

test("selected note or rest can be deleted through the original staff key policy", () => withInput(async f => {
  f.key("C"); f.key("4"); await settle();
  const event = f.element.querySelector('[data-event-id="inserted-1"]'); assert.ok(event);
  clickAt(event, 25, 15); await settle();
  assert.equal(f.element.dataset.scoreTarget, "event");
  assert.equal(f.key("Delete").defaultPrevented, true); await settle();
  assert.equal(f.writes[1].action.kind, "delete-event"); assert.equal(f.writes[1].action.eventId, "inserted-1");
  assert.equal(f.documents.snapshot().documentVersion, 2); assert.equal(f.documents.snapshot().dirty, true);
  assert.equal(f.element.querySelector('[data-event-id="inserted-1"]'), null);
  assert.ok(f.element.querySelector('[data-score-selection="caret"]'));
}));

test("Backspace deletes a selected rest, while repeats and modifier paths do not write", () => withInput(async f => {
  f.key("R"); await settle(); const event = f.element.querySelector('[data-event-id="inserted-1"]'); assert.ok(event);
  clickAt(event, 25, 15); await settle(); assert.equal(f.key("Backspace", { repeat: true }).defaultPrevented, true);
  assert.equal(f.writes.length, 1); assert.equal(f.key("Backspace", { ctrlKey: true }).defaultPrevented, false);
  assert.equal(f.key("Backspace").defaultPrevented, true); await settle();
  assert.equal(f.writes[1].action.kind, "delete-event"); assert.equal(f.writes[1].action.eventId, "inserted-1");
  assert.equal(f.element.querySelector('[data-event-id="inserted-1"]'), null);
}));

test("delete failure preserves the previous drawing and requires read recovery without replay", () => withInput(async f => {
  f.key("C"); f.key("4"); await settle(); const event = f.element.querySelector('[data-event-id="inserted-1"]'); clickAt(event, 25, 15); await settle();
  const svg = f.element.querySelector(".score-view-svg"); f.fail(true); f.key("Delete"); await settle();
  assert.equal(f.writes.length, 2); assert.equal(f.documents.snapshot().documentVersion, 1);
  assert.equal(f.projection.snapshot().status, "error"); assert.equal(f.element.querySelector(".score-view-svg"), svg);
  f.fail(false); await f.documents.reload(); await settle(); assert.equal(f.writes.length, 2);
  assert.ok(f.element.querySelector('[data-event-id="inserted-1"]'));
}));

test("history/save/input cannot overlap and native fields keep their own shortcuts", () => withInput(async f => {
  f.key("C"); f.key("4"); await settle();
  const field = document.createElement("input"); f.element.append(field);
  assert.equal(f.key("z", { ctrlKey: true }, field).defaultPrevented, false);
  assert.equal(f.key("s", { ctrlKey: true }, field).defaultPrevented, false); assert.equal(f.saves.length, 0);
  let release; f.setSaveGate(new Promise(resolve => { release = resolve; }));
  const pending = f.router.execute("notation.core.document.save");
  assert.equal(f.key("z", { ctrlKey: true }).defaultPrevented, false);
  f.key("R"); assert.equal(f.writes.length, 1);
  assert.equal((await f.documents.undo()).ok, false); release(); await pending; await settle();
  assert.equal(f.documents.snapshot().dirty, false); assert.equal(f.writes.length, 1);
}));

const property = (f, name) => f.element.querySelector(`[data-property="${name}"]`);
function selectValue(node, value) {
  node.focus(); node.value = value; node.dispatchEvent(new Event("change", { bubbles: true }));
}
async function selectFirst(f) {
  clickAt(f.element.querySelector('[data-event-id="inserted-1"]'), 25, 15); await settle();
  assert.equal(f.element.dataset.scoreTarget, "event");
}
const lastChange = f => f.routed.filter(call => call.id === SCORE_INPUT_CHANGE_COMMAND).at(-1).payload;

test("persistent property controls share the accepted core chain, retain selection and leave next-input defaults independent", () => withInput(async f => {
  const controls = f.element.querySelector(".score-event-controls"), step = property(f, "step");
  assert.ok(controls); assert.equal(step.disabled, true);
  f.key("C"); f.key("4"); await settle(); await selectFirst(f);
  assert.equal(step.value, "C"); assert.equal(step.disabled, false);
  selectValue(step, "D"); await settle(); assert.equal(f.element.dataset.scoreTarget, "event");
  assert.equal(f.element.querySelector(".score-event-controls"), controls); assert.equal(property(f, "step"), step);
  assert.equal(step.value, "D"); selectValue(property(f, "octave"), "5"); await settle();
  property(f, "sharp").click(); await settle(); property(f, "shorter").click(); await settle(); property(f, "dot").click(); await settle();
  assert.deepEqual(f.writes.at(-1).action, { kind: "set-event-properties", eventId: "inserted-1", properties: {
    duration: { base: 8, dots: 1 }, content: { kind: "note", pitch: { step: "D", octave: 5, alter: 1 } },
  } });
  assert.equal(property(f, "dot").getAttribute("aria-pressed"), "true"); assert.equal(property(f, "sharp").getAttribute("aria-pressed"), "true");
  assert.match(f.element.querySelector(".score-property-duration").getAttribute("aria-label"), /附点八分/);
  step.focus(); assert.equal(f.key("Enter", {}, step).defaultPrevented, true); assert.equal(document.activeElement, f.element);
  f.key("Escape"); f.key("R"); await settle(); assert.deepEqual(f.writes.at(-1).action.duration, { base: 4, dots: 0 });
  assert.equal(f.notices.state().entries.length, 0);
}));

test("selected-key composition uses original grammar, cancellation, duration and rest conversion", () => withInput(async f => {
  f.key("C"); f.key("4"); await settle(); await selectFirst(f);
  f.key("D"); assert.equal(f.writes.length, 1); assert.match(f.element.querySelector(".score-input-state").title, /D/);
  assert.equal(property(f, "step").disabled, true); f.key("4", { repeat: true }); assert.equal(f.writes.length, 1);
  assert.equal(f.key("Backspace").defaultPrevented, true); assert.equal(f.writes.length, 1); assert.equal(property(f, "step").disabled, false);
  f.key("A"); f.key("5"); await settle(); assert.deepEqual(f.writes.at(-1).action.properties.content.pitch, { step: "A", octave: 5, alter: 0 });
  f.key("+"); await settle(); f.key("."); await settle(); assert.deepEqual(f.writes.at(-1).action.properties.duration, { base: 8, dots: 1 });
  assert.equal(f.element.dataset.scoreTarget, "event"); f.key("R"); await settle();
  assert.deepEqual(f.writes.at(-1).action, { kind: "delete-event", eventId: "inserted-1", timePolicy: "preserve" });
}));

test("accidentals distinguish inherited key signature from natural and toggling back to inheritance", () => {
  const initial = session(); initial.notation.keySignatureChanges = [{ measureId: "measure-1", measureIndex: 0, fifths: 1 }];
  return withInput(async f => {
    f.key("F"); f.key("4"); await settle(); await selectFirst(f);
    assert.equal(property(f, "sharp").getAttribute("aria-pressed"), "false", "inherited sharp has no printed accidental");
    property(f, "natural").click(); await settle(); assert.equal(f.writes.at(-1).action.properties.content.pitch.alter, 0);
    assert.equal(property(f, "natural").getAttribute("aria-pressed"), "true");
    property(f, "natural").click(); await settle(); assert.equal(f.writes.at(-1).action.properties.content.pitch.alter, 1);
    assert.equal(property(f, "natural").getAttribute("aria-pressed"), "false");
  }, initial);
});

test("rest controls reject pitch and preserve legal undotted thirty-second behavior", () => {
  const initial = session(1); initial.notation.measures[0].events = [{ id: "inserted-1", duration: { base: 32, dots: 0 }, content: { kind: "rest" } }];
  return withInput(async f => {
    await selectFirst(f); assert.equal(property(f, "step").disabled, true); assert.equal(property(f, "octave").disabled, true);
    assert.equal(property(f, "sharp").disabled, true); assert.equal(property(f, "dot").disabled, true); assert.equal(property(f, "shorter").disabled, true);
    f.key("C"); f.key("4"); f.key("."); await settle(); assert.equal(f.writes.length, 0);
    property(f, "longer").click(); await settle(); assert.deepEqual(f.writes.at(-1).action.properties, { duration: { base: 16, dots: 0 }, content: { kind: "rest" } });
    property(f, "shorter").click(); await settle(); assert.equal(f.writes.at(-1).action.properties.duration.base, 32);
    f.key("."); // No-op at 32nd rest, through the live keyboard path; capture its current token.
    const sourceRevision = f.routed.filter(call => call.id === SCORE_INPUT_KEY_COMMAND).at(-1).payload.sourceRevision;
    const payload = { ...lastChange(f), sourceRevision, change: { kind: "pitch", value: { step: "C", octave: 4, alter: 0 } } };
    assert.equal(f.router.execute(SCORE_INPUT_CHANGE_COMMAND, payload).code, "score.input.invalid-change");
    assert.equal(f.writes.length, 2);
  }, initial);
});

test("no-op values, malformed changes and stale revision or selected identity never dispatch a property write", () => withInput(async f => {
  f.key("C"); f.key("4"); await settle(); f.key("D"); f.key("4"); await settle(); await selectFirst(f);
  selectValue(property(f, "step"), "C"); await settle(); const currentPayload = lastChange(f);
  assert.equal(f.writes.length, 2); assert.equal(f.documents.snapshot().undoDepth, 2);
  for (const payload of [null, { ...currentPayload, extra: true }, { ...currentPayload, change: { kind: "rest", value: "true" } },
    { ...currentPayload, change: { kind: "pitch", value: { step: "Z", octave: 4, alter: 0 } } },
    { ...currentPayload, change: { kind: "duration", value: { base: 32, dots: 0 } } },
    { ...currentPayload, change: { kind: "duration", value: { base: 8, dots: 2 } } },
    { ...currentPayload, change: { kind: "accidental", value: "double-sharp" } }]) {
    assert.equal(f.router.execute(SCORE_INPUT_CHANGE_COMMAND, payload).code, "score.input.invalid-payload");
  }
  assert.equal(f.router.execute(SCORE_INPUT_CHANGE_COMMAND, { ...currentPayload, sourceRevision: -1 }).code, "score.input.stale");
  clickAt(f.element.querySelector('[data-event-id="inserted-2"]'), 45, 15); await settle();
  assert.equal(f.router.execute(SCORE_INPUT_CHANGE_COMMAND, currentPayload).code, "score.input.stale", "same document revision, different selection");
  assert.equal(f.writes.length, 2);
}));

function pointerAt(node, type, clientX, clientY, extra = {}) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  for (const [key, value] of Object.entries({ button: 0, buttons: 0, clientX, clientY, ...extra })) Object.defineProperty(event, key, { value });
  node.dispatchEvent(event); return event;
}
const nextToolPayload = f => f.routed.filter(item => item.id === IT).at(-1)?.payload;

test("caret tools configure the next event without music/history writes and keep selected properties independent", () => withInput(async f => {
  const bar = f.element.querySelector(".score-event-controls");
  assert.equal(bar.dataset.inputSource, "input");
  for (const name of ["longer", "shorter", "dot", "flat", "natural", "sharp", "rest"]) assert.equal(property(f, name).disabled, false, name);
  property(f, "shorter").click(); property(f, "dot").click(); property(f, "flat").click();
  assert.equal(f.writes.length, 0); assert.equal(f.documents.snapshot().undoDepth, 0); assert.equal(f.documents.snapshot().dirty, false);
  assert.equal(property(f, "flat").getAttribute("aria-pressed"), "true"); assert.equal(document.activeElement, f.element);
  f.key("C"); f.key("4"); await settle();
  assert.deepEqual(f.writes[0].action.duration, { base: 8, dots: 1 });
  assert.equal(f.writes[0].action.content.pitch.alter, -1);
  await selectFirst(f); assert.equal(bar.dataset.inputSource, "selection"); property(f, "longer").click(); await settle();
  assert.deepEqual(f.writes[1].action.properties.duration, { base: 4, dots: 1 });
  f.key("Escape"); assert.equal(bar.dataset.inputSource, "input"); f.key("D"); f.key("4"); await settle();
  assert.deepEqual(f.writes[2].action.duration, { base: 8, dots: 1 });
  assert.equal(f.element.querySelector(".score-event-controls"), bar);
}));

test("next accidental settings use original inheritance, natural cancellation and toggling back to none", () => {
  const initial = session(); initial.notation.keySignatureChanges = [{ measureId: "measure-1", measureIndex: 0, fifths: 1 }];
  return withInput(async f => {
    property(f, "natural").click(); f.key("F"); f.key("4"); await settle();
    assert.equal(f.writes[0].action.content.pitch.alter, 0);
    property(f, "natural").click(); f.key("F"); f.key("5"); await settle();
    assert.equal(f.writes[1].action.content.pitch.alter, 1, "none inherits G major for the new octave");
    property(f, "sharp").click(); f.key("C"); f.key("4"); await settle();
    assert.equal(f.writes[2].action.content.pitch.alter, 1);
  }, initial);
});

test("rest tool affects pointer input while R directly inputs and pitch composition resumes note input", () => withInput(async f => {
  property(f, "rest").click(); assert.equal(property(f, "rest").getAttribute("aria-pressed"), "true");
  assert.equal(property(f, "sharp").disabled, true); assert.equal(f.writes.length, 0);
  pointerAt(f.element.querySelector('[data-measure-id="measure-1"]'), "dblclick", 10, 25); await settle();
  assert.equal(f.writes[0].action.content.kind, "rest");
  f.key("C"); assert.equal(property(f, "rest").getAttribute("aria-pressed"), "false"); f.key("4"); await settle();
  assert.equal(f.writes[1].action.content.kind, "note");
  await selectFirst(f); assert.equal(property(f, "rest").disabled, true, "selected rest cannot become a note by this tool");
  clickAt(f.element.querySelector('[data-event-id="inserted-2"]'), 45, 15); property(f, "rest").click(); await settle();
  assert.equal(f.writes[2].action.kind, "delete-event"); assert.equal(f.writes[2].action.timePolicy, "preserve");
}));

test("delayed C4 D4 R input is serialized against accepted versions and reconciled anchors, never duplicated by repeats", () => withInput(async f => {
  let release; f.setGate(new Promise(resolve => { release = resolve; }));
  for (const key of ["C", "4", "D", "4", "R"]) assert.equal(f.key(key).defaultPrevented, true);
  f.key("R", { repeat: true }); await settle(); assert.equal(f.writes.length, 1);
  release(); await settle();
  assert.deepEqual(f.writes.map(item => item.expectedVersion), [0, 1, 2]);
  assert.deepEqual(f.writes.map(item => item.action.offsetUnits), [0, 16, 32]);
  assert.deepEqual(f.writes.map(item => item.action.content.kind), ["note", "note", "rest"]);
  assert.equal(f.writes[1].action.content.pitch.step, "D"); assert.equal(new Set(f.writes.map(item => item.requestId)).size, 3);
  assert.deepEqual(f.writes[2].action.anchor, { kind: "after-event", eventId: "inserted-2" });
  assert.equal(f.documents.snapshot().undoDepth, 3); assert.equal(f.documents.snapshot().documentVersion, 3);
}));

test("keys arriving during accepted projection redraw remain valid while pointer geometry remains unavailable", () => withInput(async f => {
  let injected = false;
  const stop = f.projection.read.subscribe(() => {
    if (injected || f.documents.snapshot().documentVersion !== 1) return;
    injected = true; assert.equal(f.element.dataset.renderState, "loading");
    for (const key of ["D", "4", "R"]) assert.equal(f.key(key).defaultPrevented, true);
  });
  try { f.key("C"); f.key("4"); await settle(); assert.equal(injected, true); assert.equal(f.writes.length, 3); }
  finally { stop(); }
}));

test("buffer preserves duration/dot/compose/cancel order but never queues property or document operations", () => withInput(async f => {
  let release; f.setGate(new Promise(resolve => { release = resolve; }));
  for (const key of ["C", "4", "+", ".", "D", "Backspace", "E", "5", "R"]) f.key(key);
  assert.equal(f.router.execute("notation.core.document.undo").ok, false);
  release(); await settle();
  assert.equal(f.writes.length, 3); assert.equal(f.writes[1].action.content.pitch.step, "E");
  assert.deepEqual(f.writes[1].action.duration, { base: 8, dots: 1 }); assert.deepEqual(f.writes[2].action.duration, { base: 8, dots: 1 });
}));

test("failure or lost acknowledgement clears new buffered intent; reload never replays it", async () => {
  for (const lost of [false, true]) await withInput(async f => {
    let release; f.setGate(new Promise(resolve => { release = resolve; }));
    f.fail(!lost); f.loseAck(lost); for (const key of ["C", "4", "D", "4", "R"]) f.key(key);
    release(); await settle(); assert.equal(f.writes.length, 1); assert.equal(f.documents.snapshot().status, "error");
    f.fail(false); f.loseAck(false); await f.documents.reload(); await settle();
    assert.equal(f.writes.length, 1); assert.equal(f.documents.snapshot().documentVersion, lost ? 1 : 0);
    f.key("E"); f.key("4"); await settle(); assert.equal(f.writes.length, 2);
  });
});

test("navigation, Escape, hide and release cancel unsubmitted keys without cancelling an already sent append", async () => {
  for (const mode of ["ArrowRight", "Escape", "hide", "dispose"]) await withInput(async f => {
    let release; f.setGate(new Promise(resolve => { release = resolve; }));
    for (const key of ["C", "4", "D", "4", "R"]) f.key(key); await settle(); assert.equal(f.writes.length, 1);
    if (mode === "hide") f.host.setVisible("notation.core.view", false);
    else if (mode === "dispose") f.host.dispose();
    else f.key(mode);
    release(); await settle(); assert.equal(f.writes.length, 1);
    if (mode === "hide") { f.host.setVisible("notation.core.view", true); f.key("E"); f.key("4"); await settle(); assert.equal(f.writes.length, 2); }
  });
});

test("bounded input overflow clears the remaining chain and cannot restart it before the active request completes", () => withInput(async f => {
  let release; f.setGate(new Promise(resolve => { release = resolve; })); f.key("C"); f.key("4");
  for (let index = 0; index < SCORE_INPUT_KEY_BUFFER_LIMIT + 2; index++) f.key("R");
  assert.match(f.element.querySelector(".score-input-state").title, /输入过快/);
  release(); await settle(); assert.equal(f.writes.length, 1);
  f.key("R"); await settle(); assert.equal(f.writes.length, 2);
}));

test("tool payloads reject stale selections, nested extras, illegal durations, pending, IME and hidden controls", () => withInput(async f => {
  property(f, "shorter").click(); const payload = nextToolPayload(f);
  for (const value of [null, { ...payload, extra: true }, { ...payload, change: { kind: "duration", value: { base: 32, dots: 0 } } },
    { ...payload, change: { kind: "duration", value: { base: 8, dots: 0, extra: true } } },
    { ...payload, change: { kind: "accidental", value: "double-flat" } }]) assert.equal(f.router.execute(IT, value).code, "score.input.invalid-payload");
  clickAt(f.element.querySelector('[data-measure-id="measure-1"]'), 10, 30);
  assert.equal(f.router.execute(IT, payload).code, "score.input.stale");
  assert.equal(f.key(".", { isComposing: true }).defaultPrevented, false);
  f.host.setVisible("notation.core.view", false); property(f, "dot").dispatchEvent(new Event("click"));
  assert.equal(f.writes.length, 0);
}));

test("Shift produces uppercase pitch and plus keys while shifted navigation cancels pending intent and IME remains reserved", () => withInput(async f => {
  assert.equal(f.key("+", { shiftKey: true }).defaultPrevented, true);
  assert.equal(f.key("C", { shiftKey: true }).defaultPrevented, true);
  let release; f.setGate(new Promise(resolve => { release = resolve; }));
  f.key("4"); f.key("D", { shiftKey: true }); f.key("4"); f.key("ArrowRight", { shiftKey: true });
  release(); await settle(); assert.equal(f.writes.length, 1); assert.deepEqual(f.writes[0].action.duration, { base: 8, dots: 0 });
  assert.equal(f.key("C", { shiftKey: true, isComposing: true }).defaultPrevented, false);
  assert.equal(f.key("!", { shiftKey: true }).defaultPrevented, false);
}));

test("pointer hover uses same-drawing Bravura notehead, does not alter selection, and double click writes the intended pitch", () => withInput(async f => {
  const hit = f.element.querySelector('[data-measure-id="measure-1"]'), caret = f.element.querySelector('[data-score-selection="caret"]');
  property(f, "flat").click(); property(f, "shorter").click();
  pointerAt(hit, "pointermove", 10, 25);
  const hover = f.element.querySelector('[data-score-hover="caret"]');
  assert.equal(hover.getAttribute("font-family"), "Bravura"); assert.equal(hover.getAttribute("pointer-events"), "none");
  assert.equal(hover.getAttribute("y"), "25"); assert.equal(caret.getAttribute("y"), "21.375"); assert.equal(f.writes.length, 0);
  pointerAt(hit, "pointerleave", 10, 25); assert.equal(f.element.querySelector('[data-score-hover="caret"]'), null);
  clickAt(hit, 10, 25); assert.equal(property(f, "step").value, "D"); assert.equal(property(f, "octave").value, "5");
  pointerAt(hit, "dblclick", 10, 25); await settle();
  assert.deepEqual(f.writes[0].action.content.pitch, { step: "D", octave: 5, alter: -1 });
  assert.deepEqual(f.writes[0].action.duration, { base: 8, dots: 0 });
  pointerAt(f.element.querySelector('[data-event-id="inserted-1"]'), "dblclick", 25, 15); await settle(); assert.equal(f.writes.length, 1);
}));

test("pointer uses outer inverse coordinates, rejects modifiers, invalid pitch, stale/detached geometry and hidden lifetime", () => withInput(async f => {
  const svg = f.element.querySelector(".score-view-svg"), hit = svg.querySelector('[data-measure-id="measure-1"]');
  svg.getScreenCTM = () => ({ inverse: () => ({ a: .8, b: 0, c: 0, d: .8, e: -8, f: -16 }) });
  pointerAt(hit, "dblclick", 22.5, 51.25); await settle();
  assert.deepEqual(f.writes[0].action.content.pitch, { step: "D", octave: 5, alter: 0 });
  const payload = f.routed.filter(item => item.id === IP).at(-1).payload;
  assert.equal(f.router.execute(IP, payload).code, "score.input.stale");
  for (const bad of [{ ...payload, extra: true }, { ...payload, pitch: { step: "C", octave: 7, alter: 0 } },
    { ...payload, pitch: { step: "C", octave: 4, alter: 0, extra: true } }, { ...payload, writeNow: 1 }]) {
    assert.equal(f.router.execute(IP, bad).code, "score.input.invalid-payload");
  }
  pointerAt(hit, "dblclick", 22.5, 51.25); assert.equal(f.writes.length, 1, "old detached hits have no listener path");
  const current = f.element.querySelector('[data-measure-id="measure-1"]');
  for (const extra of [{ ctrlKey: true }, { shiftKey: true }, { altKey: true }, { button: 2 }]) pointerAt(current, "dblclick", 50, 25, extra);
  f.host.setVisible("notation.core.view", false); pointerAt(current, "dblclick", 50, 25); await settle(); assert.equal(f.writes.length, 1);
}));

test("buffered keys cannot follow document replacement or a reentrant selection made when accepted focus commits", async () => {
  for (const mode of ["replace", "select"]) {
    const value = structuredClone(STAFF_FIXTURE); value.measures = value.measures.slice(0, 1); value.measures[0].events = [];
    const source = sourceFixture(value), selection = createScoreSelection({ score: source.read }), writes = [];
    let release, after;
    const actions = { snapshot: () => ({ ...source.read.status(), busy: false }), append: async request => {
      writes.push(request); await new Promise(resolve => { release = resolve; });
      const next = structuredClone(value);
      next.measures[0].events.push({ id: "accepted-note", duration: request.action.duration, content: request.action.content });
      after = { notation: next, documentVersion: 1 };
      source.publish(next, { documentVersion: 1 }); return { ok: true, session: after };
    } };
    const input = createScoreNoteInput({ score: source.read, selection, actions });
    let changed = false;
    const stop = selection.read.subscribe(state => {
      if (mode === "select" && !changed && state.documentVersion === 1 && state.transaction.kind === "idle") {
        changed = true; selection.select({ sourceRevision: state.sourceRevision, eventId: "accepted-note" });
      }
    });
    try {
      selection.locate({ sourceRevision: selection.read.snapshot().sourceRevision, measureId: "measure-1", offsetUnits: 0 });
      for (const key of ["C", "4", "D", "4", "R"]) input.key({ sourceRevision: selection.read.snapshot().sourceRevision, key, repeat: false });
      await settle(); assert.equal(writes.length, 1);
      if (mode === "replace") source.publish(value, { documentId: "replacement", documentVersion: 0 });
      release(); await settle(); assert.equal(writes.length, 1);
      assert.equal(input.read.snapshot().queuedKeys, 0);
      assert.equal(selection.read.snapshot().target.kind, mode === "select" ? "event" : "unavailable");
    } finally { stop(); input.dispose(); selection.dispose(); source.dispose(); }
  }
});

test("pointer payload and tool values are captured before observers, and an intervening relocation prevents dispatch", async () => {
  for (const relocate of [false, true]) {
    const value = structuredClone(STAFF_FIXTURE); value.measures = value.measures.slice(0, 1); value.measures[0].events = [];
    const source = sourceFixture(value), selection = createScoreSelection({ score: source.read }), writes = [];
    const input = createScoreNoteInput({ score: source.read, selection, actions: {
      snapshot: () => ({ ...source.read.status(), busy: false }), append: async request => { writes.push(request); return { ok: false }; },
    } });
    const payload = { sourceRevision: selection.read.snapshot().sourceRevision, measureId: "measure-1", offsetUnits: 0,
      pitch: { step: "C", octave: 4, alter: 0 }, writeNow: true };
    let mutated = false;
    const stop = selection.read.subscribe(state => {
      if (mutated || state.target.kind !== "caret") return;
      mutated = true; payload.pitch.step = "G"; payload.writeNow = false; payload.offsetUnits = 64;
      if (relocate) selection.locate({ sourceRevision: state.sourceRevision, measureId: "measure-1", offsetUnits: 16 });
    });
    try {
      const result = input.pointer(payload); await settle();
      assert.equal(writes.length, relocate ? 0 : 1);
      if (relocate) assert.equal(result.code, "score.input.stale");
      else { assert.equal(writes[0].action.content.pitch.step, "C"); assert.equal(writes[0].action.offsetUnits, 0); }
    } finally { stop(); input.dispose(); selection.dispose(); source.dispose(); }
  }
});

test("property pending and competing save disable controls, preserve their instances and reject repeated writes", () => withInput(async f => {
  f.key("C"); f.key("4"); await settle(); await selectFirst(f);
  const step = property(f, "step"); let release; f.setGate(new Promise(yes => { release = yes; }));
  selectValue(step, "D"); await settle(); assert.equal(step.disabled, true); assert.equal(property(f, "dot").disabled, true);
  property(f, "dot").click(); f.key("+", { repeat: true }); f.key("G"); f.key("4");
  assert.equal(f.writes.length, 2); release(); await settle(); assert.equal(step.value, "D"); assert.equal(step.disabled, false);
  f.setGate(null); let releaseSave; f.setSaveGate(new Promise(yes => { releaseSave = yes; }));
  const saved = f.router.execute("notation.core.document.save"); assert.equal(step.disabled, true);
  selectValue(step, "E"); assert.equal(f.writes.length, 2); releaseSave(); await saved; await settle(); assert.equal(step.disabled, false);
}));

test("property errors and lost acknowledgements preserve accepted music and recover by read without replay", async () => {
  for (const lost of [false, true]) await withInput(async f => {
    f.key("C"); f.key("4"); await settle(); await selectFirst(f);
    if (lost) f.loseAck(true); else f.fail(true);
    selectValue(property(f, "step"), "D"); await settle();
    assert.equal(f.documents.snapshot().status, "error"); assert.equal(f.documents.snapshot().documentVersion, 1);
    assert.ok(f.element.querySelector('[data-event-id="inserted-1"]')); assert.equal(property(f, "step").disabled, true);
    f.key("+"); property(f, "dot").click(); await settle(); assert.equal(f.writes.length, 2);
    f.loseAck(false); f.fail(false); await f.documents.reload(); await settle(); assert.equal(f.writes.length, 2);
    assert.equal(property(f, "step").value, lost ? "D" : "C"); assert.equal(property(f, "step").disabled, false);
  });
});

test("hidden and released property controls cannot dispatch; in-flight accepted results never remount", async () => {
  await withInput(async f => {
    f.key("C"); f.key("4"); await settle(); await selectFirst(f);
    const step = property(f, "step"); f.host.setVisible("notation.core.view", false); selectValue(step, "D"); await settle(); assert.equal(f.writes.length, 1);
    f.host.setVisible("notation.core.view", true); selectValue(step, "D"); f.host.release("notation.core.view"); await settle();
    assert.equal(f.writes.length, 1, "release before deferred dispatch"); assert.equal(f.element.children.length, 0);
    assert.equal(f.router.execute(SCORE_INPUT_CHANGE_COMMAND, {}).code, "score.input.not-ready");
  });
  await withInput(async f => {
    f.key("C"); f.key("4"); await settle(); await selectFirst(f);
    let release; f.setGate(new Promise(yes => { release = yes; })); const step = property(f, "step");
    selectValue(step, "D"); await settle(); f.host.release("notation.core.view"); release(); await settle();
    assert.equal(f.documents.snapshot().documentVersion, 2); assert.equal(f.element.children.length, 0);
    selectValue(step, "E"); await settle(); assert.equal(f.writes.length, 2);
  });
});

test("property commands integrate with undo/redo and guarded-save snapshots without adding a second history", () => withInput(async f => {
  f.key("C"); f.key("4"); await settle(); await selectFirst(f);
  selectValue(property(f, "step"), "D"); await settle(); property(f, "shorter").click(); await settle();
  const changed = structuredClone(f.projection.read.snapshot());
  await f.router.execute("notation.core.document.undo"); await settle(); assert.equal(f.element.dataset.scoreTarget, "event");
  assert.deepEqual(f.projection.read.snapshot().measures[0].events[0].duration, { base: 4, dots: 0 });
  await f.router.execute("notation.core.document.redo"); await settle(); assert.deepEqual(f.projection.read.snapshot(), changed);
  await f.router.execute("notation.core.document.save"); assert.deepEqual(f.savedDocument().notation, changed);
  assert.equal(f.documents.snapshot().dirty, false); assert.equal(f.saves[0].expected.documentVersion, f.documents.snapshot().documentVersion);
}));

const measureControl = (f, name) => f.element.querySelector(`[data-measure-property="${name}"]`);
const measureButton = (f, label) => f.element.querySelector(`[aria-label="${label}"]`);
const changeMeterValue = (node, value) => { node.value = String(value); node.dispatchEvent(new Event("change", { bubbles: true })); };
const threeMeasures = () => {
  const value = session(); value.notation.measures = structuredClone(STAFF_FIXTURE.measures.slice(0, 3)).map(m => ({ ...m, events: [] }));
  value.measureCount = 3; return value;
};

test("measure controls and menus use the formal router, survive redraws and focus the inserted measure", () => withInput(async f => {
  const bar = f.element.querySelector(".score-measure-controls"), numerator = measureControl(f, "numerator");
  assert.ok(bar); assert.equal(measureButton(f, "删除当前小节及其内容（可撤销）").disabled, true);
  assert.ok(f.menus.resolve().find(menu => menu.id === "edit").groups.flat().some(item => item.command === M.insertAfter));
  measureButton(f, "在当前小节后插入空小节").dispatchEvent(new Event("click")); await settle();
  assert.equal(f.writes[0].action.kind, "insert-measure"); assert.equal(f.documents.snapshot().measureCount, 2);
  assert.equal(f.element.querySelector(".score-measure-controls"), bar);
  assert.ok(f.element.querySelector('[data-score-selection="caret"]'));
  assert.equal(f.element.getAttribute("aria-description"), "已定位第2小节，偏移0个四分音符");
  changeMeterValue(numerator, 6); await settle(); changeMeterValue(measureControl(f, "denominator"), 8); await settle();
  assert.deepEqual(f.acceptedDrawings.at(-1).measures[1].meter, { numerator: 6, denominator: 8 });
  assert.equal(f.element.querySelector(".score-measure-controls"), bar); assert.equal(numerator.value, "6");
  assert.deepEqual(f.routed.filter(call => call.id === M.edit).map(call => call.payload.change.kind), ["insert", "meter", "meter"]);
  assert.equal(f.router.execute(M.remove).ok, true); await settle(); assert.equal(f.documents.snapshot().measureCount, 1);
  assert.equal((await f.router.execute("notation.core.document.undo")).ok, true); await settle(); assert.equal(f.documents.snapshot().measureCount, 2);
  assert.equal((await f.router.execute("notation.core.document.redo")).ok, true); await settle(); assert.equal(f.documents.snapshot().measureCount, 1);
  await f.documents.save(); assert.equal(f.savedDocument().measureCount, 1);
}));

test("meter no-op and malformed values never issue structural edits", () => withInput(async f => {
  const numerator = measureControl(f, "numerator"); changeMeterValue(numerator, 4); await settle();
  const payload = f.routed.filter(call => call.id === M.edit).at(-1).payload;
  assert.equal(f.writes.length, 0); assert.equal(f.documents.snapshot().dirty, false);
  for (const change of [{ kind: "meter", meter: { numerator: 0, denominator: 4 }, scope: "measure" },
    { kind: "meter", meter: { numerator: 4, denominator: 3 }, scope: "measure" }, { kind: "remove", position: "after" },
    { kind: "insert", position: "around" }, { kind: "meter", meter: { numerator: 4, denominator: 4, extra: true }, scope: "measure" }]) {
    assert.equal(f.router.execute(M.edit, { ...payload, change }).code, "score.input.invalid-payload");
  }
  assert.equal(f.router.execute(M.edit, { ...payload, extra: true }).code, "score.input.invalid-payload");
  assert.equal(f.router.execute(M.edit, { ...payload, change: { kind: "remove" } }).code, "score.input.measure-required");
  assert.equal(f.writes.length, 0);
}));

test("old structural payloads and numeric drafts cannot follow a same-version measure relocation", () => withInput(async f => {
  const numerator = measureControl(f, "numerator"); changeMeterValue(numerator, 4); const payload = f.routed.filter(call => call.id === M.edit).at(-1).payload;
  numerator.dispatchEvent(new Event("focus")); numerator.value = "5";
  f.router.execute("notation.core.selection.locate", { sourceRevision: payload.sourceRevision, measureId: "measure-2", offsetUnits: 0 });
  numerator.value = "7"; numerator.dispatchEvent(new Event("change")); await settle(); assert.equal(f.writes.length, 0);
  changeMeterValue(numerator, 3); await settle(); assert.equal(f.writes.length, 0, "the invalid old meter draft cannot recover without refocus");
  assert.equal(f.router.execute(M.edit, { ...payload, change: { kind: "insert", position: "after" } }).code, "score.input.stale");
  assert.equal(f.router.execute(M.edit, { ...payload, sourceRevision: -1 }).code, "score.input.stale");
  assert.equal(numerator.value, "4"); assert.equal(f.writes.length, 0);
}, threeMeasures()));

test("meter scope is a draft choice; consecutive edits stop at the original meter change", () => {
  const initial = threeMeasures(); initial.notation.measures[2].meter = { numerator: 3, denominator: 4 };
  return withInput(async f => {
    const run = measureControl(f, "scope"); run.dispatchEvent(new Event("click")); assert.equal(run.getAttribute("aria-pressed"), "true");
    assert.equal(f.writes.length, 0);
    changeMeterValue(measureControl(f, "numerator"), 6); await settle(); changeMeterValue(measureControl(f, "denominator"), 8); await settle();
    assert.ok(f.writes.every(write => write.action.scope === "meter-run"));
    assert.deepEqual(f.acceptedDrawings.at(-1).measures.map(m => m.meter), [{ numerator: 6, denominator: 8 }, { numerator: 6, denominator: 8 }, { numerator: 3, denominator: 4 }]);
  }, initial);
});

test("structural controls obey composing, busy and hidden states and do not queue edits", () => withInput(async f => {
  const after = measureButton(f, "在当前小节后插入空小节"); f.key("C"); assert.equal(after.disabled, true);
  after.dispatchEvent(new Event("click")); await settle(); assert.equal(f.writes.length, 0); f.key("Escape"); assert.equal(after.disabled, false);
  let release; f.setGate(new Promise(yes => { release = yes; })); after.dispatchEvent(new Event("click")); await settle();
  assert.equal(after.disabled, true); after.dispatchEvent(new Event("click")); assert.equal(f.router.execute(M.insertBefore).ok, false);
  assert.equal(f.writes.length, 1); release(); await settle();
  f.host.setVisible("notation.core.view", false); after.dispatchEvent(new Event("click")); changeMeterValue(measureControl(f, "numerator"), 3); await settle();
  assert.equal(f.writes.length, 1); f.host.setVisible("notation.core.view", true); assert.equal(after.disabled, false);
}));

test("lost structural acknowledgement retains accepted score and reload never repeats insertion", () => withInput(async f => {
  f.loseAck(true); f.router.execute(M.insertAfter); await settle(); assert.equal(f.documents.snapshot().status, "error");
  assert.equal(f.documents.snapshot().measureCount, 1); assert.equal(f.writes.length, 1);
  assert.equal(f.router.execute(M.insertAfter).ok, false); f.loseAck(false); await f.documents.reload(); await settle();
  assert.equal(f.documents.snapshot().measureCount, 2); assert.equal(f.writes.length, 1);
  assert.equal(measureControl(f, "numerator").disabled, false);
}));

test("released structural controls prevent deferred dispatch and cannot be remounted by late results", async () => {
  await withInput(async f => { f.router.execute(M.insertAfter); f.host.release("notation.core.view"); await settle(); assert.equal(f.writes.length, 0); assert.equal(f.element.children.length, 0); });
  await withInput(async f => { let release; f.setGate(new Promise(yes => { release = yes; })); f.router.execute(M.insertAfter); await settle();
    f.host.release("notation.core.view"); release(); await settle(); assert.equal(f.writes.length, 1); assert.equal(f.element.children.length, 0); });
});

const keyControl = (f, name) => f.element.querySelector(`[data-key-signature="${name}"]`);
const locateMeasure = (f, index, revision) => f.router.execute("notation.core.selection.locate", {
  sourceRevision: revision, measureId: `measure-${index + 1}`, offsetUnits: 0,
});

test("key controls use original core permissions, persist across draws, inherit for input and share history/save", () => withInput(async f => {
  const group = f.element.querySelector(".score-key-signature-controls"), select = keyControl(f, "fifths");
  assert.ok(group); assert.equal(select.children.length, 15); assert.equal(keyControl(f, "inherit").disabled, true);
  changeMeterValue(select, 1); await settle();
  const payload = f.routed.filter(call => call.id === KS).at(-1).payload;
  assert.deepEqual(f.writes[0].action, { kind: "set-key-signature", partId: payload.partId, measureId: "measure-1", change: { kind: "set", fifths: 1 } });
  assert.equal(group.dataset.keySignatureExplicit, "true"); assert.equal(f.element.querySelector(".score-key-signature-controls"), group);
  assert.equal(keyControl(f, "fifths"), select); assert.equal(select.textContent.includes("调号"), false);
  f.key("F"); f.key("4"); await settle(); assert.equal(f.writes[1].action.content.pitch.alter, 1);
  pick(f, 0); const selectedId = f.projection.read.snapshot().measures[0].events[0].id;
  changeMeterValue(select, -2); await settle();
  assert.equal(f.element.dataset.scoreTarget, "event"); assert.ok(f.element.querySelector(`[data-event-id="${selectedId}"]`));
  assert.equal(f.projection.read.snapshot().measures[0].events[0].content.pitch.alter, 1, "key edits do not transpose existing notes");
  const accepted = structuredClone(f.projection.read.snapshot());
  await f.documents.undo(); await settle(); assert.equal(select.value, "1");
  await f.documents.redo(); await settle(); assert.deepEqual(f.projection.read.snapshot(), accepted);
  await f.documents.save(); assert.deepEqual(f.savedDocument().notation, accepted); assert.equal(f.documents.snapshot().dirty, false);
}));

test("key no-op and strict nested validation prevent history writes and reject foreign targets", () => withInput(async f => {
  const select = keyControl(f, "fifths"); changeMeterValue(select, 0);
  const payload = f.routed.filter(call => call.id === KS).at(-1).payload;
  assert.equal(f.router.execute(KS, { ...payload, change: { kind: "inherit" } }).changed, false);
  for (const change of [{ kind: "set", fifths: 8 }, { kind: "set", fifths: 1.5 }, { kind: "set", fifths: "1" },
    { kind: "set", fifths: 1, extra: true }, { kind: "inherit", fifths: 0 }, { kind: "inherit", extra: true }]) {
    assert.equal(f.router.execute(KS, { ...payload, change }).code, "score.input.invalid-payload");
  }
  assert.equal(f.router.execute(KS, { ...payload, extra: true }).code, "score.input.invalid-payload");
  assert.equal(f.router.execute(KS, { ...payload, partId: "other" }).code, "score.input.stale");
  assert.equal(f.router.execute(KS, { ...payload, measureId: "missing" }).code, "score.input.stale");
  await settle(); assert.equal(f.writes.length, 0); assert.equal(f.documents.snapshot().dirty, false);
}));

test("key readback distinguishes effective inheritance from explicit natural cancellation", () => {
  const initial = threeMeasures(); initial.notation.keySignatureChanges = [{ measureId: "measure-1", measureIndex: 0, fifths: 2 }];
  return withInput(async f => {
    const select = keyControl(f, "fifths"); changeMeterValue(select, 2);
    const first = f.routed.filter(call => call.id === KS).at(-1).payload;
    locateMeasure(f, 1, first.sourceRevision); assert.equal(select.value, "2"); assert.equal(keyControl(f, "inherit").disabled, true);
    changeMeterValue(select, 0); await settle(); assert.equal(select.value, "0");
    assert.equal(keyControl(f, "inherit").disabled, false); assert.match(keyControl(f, "inherit").title, /2 个升号/);
    keyControl(f, "inherit").click(); await settle(); assert.equal(select.value, "2");
    assert.equal(keyControl(f, "inherit").disabled, true); assert.equal(f.writes.length, 2);
  }, initial);
});

test("old key payloads and focused drafts cannot follow same-version measure relocation", () => withInput(async f => {
  const select = keyControl(f, "fifths"); changeMeterValue(select, 0);
  const payload = f.routed.filter(call => call.id === KS).at(-1).payload;
  select.dispatchEvent(new Event("focus")); select.value = "3";
  locateMeasure(f, 1, payload.sourceRevision); changeMeterValue(select, 5); await settle();
  assert.equal(f.writes.length, 0); assert.equal(select.value, "0");
  changeMeterValue(select, 3); await settle();
  assert.equal(f.writes.length, 0, "a rejected old field stays invalid until it is focused again");
  assert.equal(f.router.execute(KS, { ...payload, change: { kind: "set", fifths: 2 } }).code, "score.input.stale");
  locateMeasure(f, 0, payload.sourceRevision);
  assert.equal(f.router.execute(KS, { ...payload, change: { kind: "set", fifths: 2 } }).code, "score.input.stale", "returning to the same measure does not revive an old selection revision");
  locateMeasure(f, 1, payload.sourceRevision);
  select.dispatchEvent(new Event("focus")); changeMeterValue(select, -7); await settle();
  assert.equal(f.writes[0].action.measureId, "measure-2"); assert.equal(f.writes[0].action.change.fifths, -7);
}, threeMeasures()));

test("key controls respect composition, busy and local field keys without intercepting IME", () => withInput(async f => {
  const select = keyControl(f, "fifths"); f.key("C"); assert.equal(select.disabled, true);
  changeMeterValue(select, 1); await settle(); assert.equal(f.writes.length, 0); f.key("Escape");
  select.focus(); select.value = "1"; assert.equal(f.key("Enter", { isComposing: true }, select).defaultPrevented, false);
  assert.equal(f.writes.length, 0); assert.equal(f.key("Enter", {}, select).defaultPrevented, true);
  assert.equal(document.activeElement, f.element); await settle();
  let release; f.setGate(new Promise(yes => { release = yes; })); changeMeterValue(select, -1); await settle();
  assert.equal(select.disabled, true); changeMeterValue(select, 7); await settle(); assert.equal(f.writes.length, 2);
  release(); await settle(); assert.equal(select.value, "-1");
}));

test("failed and lost key receipts keep the accepted score until explicit reload, without replay", async () => {
  for (const lost of [false, true]) await withInput(async f => {
    f.fail(!lost); f.loseAck(lost); const select = keyControl(f, "fifths"); changeMeterValue(select, 3); await settle();
    assert.equal(f.documents.snapshot().status, "error"); assert.equal(f.documents.snapshot().documentVersion, 0);
    assert.equal(select.disabled, true); assert.equal(f.projection.read.snapshot().keySignatureChanges?.length ?? 0, 0);
    changeMeterValue(select, 3); await settle(); assert.equal(f.writes.length, 1);
    f.fail(false); f.loseAck(false); await f.documents.reload(); await settle();
    assert.equal(select.value, lost ? "3" : "0"); assert.equal(select.disabled, false); assert.equal(f.writes.length, 1);
  });
});

test("hidden/disposed keys cannot start deferred edits or revive a released view", async () => {
  await withInput(async f => {
    const select = keyControl(f, "fifths"); f.host.setVisible("notation.core.view", false); changeMeterValue(select, 1);
    await settle(); assert.equal(f.writes.length, 0); f.host.setVisible("notation.core.view", true);
    changeMeterValue(select, 1); f.host.setVisible("notation.core.view", false); await settle(); assert.equal(f.writes.length, 0);
    f.host.setVisible("notation.core.view", true); assert.equal(select.disabled, false);
    changeMeterValue(select, 1); f.host.release("notation.core.view"); await settle(); assert.equal(f.writes.length, 0);
  });
  await withInput(async f => {
    let release; f.setGate(new Promise(yes => { release = yes; })); changeMeterValue(keyControl(f, "fifths"), 1); await settle();
    f.host.release("notation.core.view"); release(); await settle(); assert.equal(f.writes.length, 1); assert.equal(f.element.children.length, 0);
  });
});

test("hosts without key write capability expose neither a key command nor controls", () => withInput(async f => {
  assert.equal(f.element.querySelector(".score-key-signature-controls"), null); assert.equal(f.router.execute(KS, {}).ok, false);
  assert.equal(f.writes.length, 0);
}, session(), null, true));

test("cancelling a not-yet-dispatched key edit preserves the original range and leaves input usable", () => withInput(async f => {
  pick(f, 0); f.key("ArrowRight", { shiftKey: true }); assert.ok(f.element.querySelector('[data-score-selection="range"]'));
  changeMeterValue(keyControl(f, "fifths"), 1); f.host.setVisible("notation.core.view", false); await settle();
  f.host.setVisible("notation.core.view", true); assert.equal(f.writes.length, 0); assert.equal(keyControl(f, "fifths").disabled, false);
  assert.ok(f.element.querySelector('[data-score-selection="range"]'));
  changeMeterValue(keyControl(f, "fifths"), 1); await settle(); assert.equal(f.writes.length, 1);
}, withEvents()));

const clefControl = (f, name) => f.element.querySelector(`[data-staff-clef="${name}"]`);

test("four graphical clefs use the original permissions and preserve event focus, pitch, history and save", () => withInput(async f => {
  const bar = f.element.querySelector(".score-staff-clef-controls"); assert.ok(bar); assert.equal(bar.children.length, 4);
  assert.equal(clefControl(f, "treble").getAttribute("aria-pressed"), "true");
  f.key("C"); f.key("4"); await settle(); pick(f, 0);
  const music = structuredClone(f.projection.read.snapshot().measures);
  for (const name of ["bass", "alto", "tenor", "treble"]) {
    clefControl(f, name).click(); await settle();
    assert.deepEqual(f.writes.at(-1).action, { kind: "set-staff-clef", staffId: f.projection.read.snapshot().staffId, clef: name });
    assert.equal(f.projection.read.snapshot().clef, name); assert.deepEqual(f.projection.read.snapshot().measures, music);
    assert.equal(f.element.dataset.scoreTarget, "event"); assert.equal(f.element.querySelector(".score-staff-clef-controls"), bar);
    assert.equal(clefControl(f, name).getAttribute("aria-pressed"), "true");
    const n = f.writes.length; clefControl(f, name).click(); await settle(); assert.equal(f.writes.length, n, "same clef is no-op");
  }
  assert.equal(f.routed.filter(call => call.id === SC).length, 8);
  await f.documents.undo(); await settle(); assert.equal(f.projection.read.snapshot().clef, "tenor");
  await f.documents.redo(); await settle(); assert.equal(f.projection.read.snapshot().clef, "treble");
  await f.documents.save(); assert.deepEqual(f.savedDocument().notation, f.projection.read.snapshot()); assert.equal(f.documents.snapshot().dirty, false);
}));

test("clef payloads reject extra fields, foreign staff and old source/selection revisions", () => withInput(async f => {
  const dirtyBefore = f.documents.snapshot().dirty;
  clefControl(f, "treble").click(); const payload = f.routed.filter(call => call.id === SC).at(-1).payload;
  assert.equal(f.writes.length, 0);
  for (const value of [{ ...payload, extra: true }, { ...payload, staffId: "" }, { ...payload, clef: "percussion" }, { ...payload, clef: "Bass" }]) {
    assert.equal(f.router.execute(SC, value).code, "score.input.invalid-payload");
  }
  assert.equal(f.router.execute(SC, { ...payload, staffId: "other" }).code, "score.input.stale");
  assert.equal(f.router.execute(SC, { ...payload, sourceRevision: -1 }).code, "score.input.stale");
  locateMeasure(f, 1, payload.sourceRevision); locateMeasure(f, 0, payload.sourceRevision);
  assert.equal(f.router.execute(SC, { ...payload, clef: "bass" }).code, "score.input.stale");
  await settle(); assert.equal(f.writes.length, 0); assert.equal(f.documents.snapshot().dirty, dirtyBefore);
}, threeMeasures()));

test("clef controls obey composition and pending state, returning focus without stealing IME keys", () => withInput(async f => {
  const bass = clefControl(f, "bass"); f.key("C"); assert.equal(bass.disabled, true);
  bass.dispatchEvent(new Event("click")); await settle(); assert.equal(f.writes.length, 0); f.key("Escape");
  bass.focus(); assert.equal(f.key("Escape", { isComposing: true }, bass).defaultPrevented, false);
  assert.equal(f.key("Escape", {}, bass).defaultPrevented, true); assert.equal(document.activeElement, f.element);
  let release; f.setGate(new Promise(yes => { release = yes; })); bass.click(); await settle();
  assert.equal(bass.disabled, true); clefControl(f, "tenor").dispatchEvent(new Event("click")); await settle(); assert.equal(f.writes.length, 1);
  release(); await settle(); assert.equal(bass.disabled, false); assert.equal(f.projection.read.snapshot().clef, "bass");
}));

test("failed and lost clef acknowledgement never changes accepted score or automatically retries", async () => {
  for (const lost of [false, true]) await withInput(async f => {
    f.fail(!lost); f.loseAck(lost); clefControl(f, "alto").click(); await settle();
    assert.equal(f.documents.snapshot().status, "error"); assert.equal(f.projection.read.snapshot().clef, "treble");
    assert.equal(clefControl(f, "alto").disabled, true); clefControl(f, "alto").dispatchEvent(new Event("click")); await settle();
    assert.equal(f.writes.length, 1); f.fail(false); f.loseAck(false); await f.documents.reload(); await settle();
    assert.equal(f.projection.read.snapshot().clef, lost ? "alto" : "treble"); assert.equal(f.writes.length, 1);
  });
});

test("hidden/released clefs prevent deferred dispatch and keep the original range on cancellation", async () => {
  await withInput(async f => {
    pick(f, 0); f.key("ArrowRight", { shiftKey: true });
    clefControl(f, "bass").click(); f.host.setVisible("notation.core.view", false); await settle();
    assert.equal(f.writes.length, 0); clefControl(f, "bass").dispatchEvent(new Event("click")); await settle(); assert.equal(f.writes.length, 0);
    f.host.setVisible("notation.core.view", true); assert.ok(f.element.querySelector('[data-score-selection="range"]'));
    assert.equal(clefControl(f, "bass").disabled, false);
    clefControl(f, "bass").click(); f.host.release("notation.core.view"); await settle(); assert.equal(f.writes.length, 0);
  }, withEvents());
  await withInput(async f => {
    let release; f.setGate(new Promise(yes => { release = yes; })); clefControl(f, "tenor").click(); await settle();
    f.host.release("notation.core.view"); release(); await settle(); assert.equal(f.writes.length, 1); assert.equal(f.element.children.length, 0);
  });
});

test("a missing staff-clef port contributes neither controls nor command", () => withInput(async f => {
  assert.equal(f.element.querySelector(".score-staff-clef-controls"), null); assert.equal(f.router.execute(SC, {}).ok, false);
  assert.equal(f.writes.length, 0);
}, session(), null, false, true));

test("clef preview lifetime prevents deferred drawing and late SVG adoption after disposal", () => withTestDocument(async ({ document }) => {
  const span = document.createElement("span"); let release, draws = 0;
  const glyph = createScoreClefGlyph(span, "alto", { render: async clef => {
    assert.equal(clef, "alto"); draws++; return new Promise(yes => { release = yes; });
  } });
  await settle(); assert.equal(draws, 1); glyph.dispose(); release(document.createElement("svg")); await settle();
  assert.equal(span.children.length, 0);
  const cancelled = createScoreClefGlyph(document.createElement("span"), "bass", { render: async () => { draws++; } });
  cancelled.dispose(); await settle(); assert.equal(draws, 1);
}));

test("tool glyphs use measured Bravura ink and isolate superseded/disposed asynchronous results", () => withTestDocument(async ({ document }) => {
  const create = document.createElement;
  document.createElementNS = (namespaceURI, tag) => Object.assign(create(tag), { namespaceURI });
  document.createElement = tag => {
    const node = create(tag);
    if (tag === "canvas") node.getContext = () => ({ font: "", measureText: () => ({
      actualBoundingBoxLeft: 3, actualBoundingBoxRight: 11, actualBoundingBoxAscent: 27, actualBoundingBoxDescent: 1,
    }) });
    return node;
  };
  const span = create("span"), waits = [];
  const glyph = createScoreMusicGlyph(span, { load: () => new Promise(yes => waits.push(yes)) });
  glyph.set("first", "1/4"); await settle(); glyph.set("second", "1/8"); await settle(); waits[0](); await settle();
  assert.equal(span.textContent, "1/8"); waits[1](); await settle();
  const text = span.querySelector("text"); assert.equal(text.textContent, "second"); assert.equal(text.getAttribute("font-family"), "Bravura");
  assert.equal(text.getAttribute("x"), "20"); assert.equal(text.getAttribute("y"), "37");
  assert.equal(span.querySelector("svg").getAttribute("viewBox"), "0 0 48 48");
  glyph.set("third", "1/16"); await settle(); glyph.dispose(); waits[2](); await settle(); assert.equal(span.children.length, 0);
  let loads = 0; const cancelled = createScoreMusicGlyph(create("span"), { load: async () => { loads++; } });
  cancelled.set("cancelled", "#"); cancelled.dispose(); await settle(); assert.equal(loads, 0, "no deferred font work after disposal");
}));
