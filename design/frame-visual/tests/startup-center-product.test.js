import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInThisContext } from "node:vm";
import { mountStartupCenterApplication } from "../src/startup-center-application.js";
import { createDesktopPluginPlanStore } from "../src/startup/desktop-plugin-plan-store.js";
import { createDesktopStartupAppearanceStore, STARTUP_APPEARANCE_NAMESPACE } from "../src/startup/desktop-startup-appearance-store.js";
import { DEFAULT_STARTUP_APPEARANCE } from "../src/startup/startup-appearance-settings.js";
import { BACKUP_PLUGIN_DIRECTORY as directory } from "../src/host/backup-plugin-directory.js";
import { createDesktopReadonlyScoreSession, createDesktopStartupWindow, TauriPluginSettingsStorage } from "../src/vendor/desktop-plugin-settings.js";
import { STAFF_FIXTURE } from "../src/fixtures/staff-snapshot.js";
import { createStartupCenterPage } from "../scripts/startup-center-page.mjs";
import { withTestDocument } from "./support/dom-test-environment.js";
import { createStartupCenterTestShell } from "./support/startup-center-fixtures.js";

const flush = () => new Promise(resolve => setImmediate(resolve));
async function until(predicate) { for (let i = 0; i < 40 && !predicate(); i++) await flush(); assert.equal(!!predicate(), true, "operation must settle"); }
const recordId = "00000000-0000-4000-8000-000000000001";
const catalog = { apiVersion: 1, entries: [{ id: recordId, name: "真实作品", location: "C:\\scores\\真实作品.bgp.json", lastOpenedAt: 1 }] };
const change = (node, value, event = "change") => { node.value = value; node.dispatchEvent(new Event(event)); };
function score(id = "opened") {
  return { documentId: id, documentVersion: 0, title: "真实作品", measureCount: 1, undoDepth: 0, redoDepth: 0,
    notation: { ...structuredClone(STAFF_FIXTURE), measures: structuredClone(STAFF_FIXTURE.measures.slice(0, 1)).map(measure => ({ ...measure, events: [] })) },
    playbackSource: { kind: "unsupported", projectionVersion: 1, documentId: id, documentVersion: 0, code: "readonly.test", message: "只读" } };
}
function fixture({ document, window }, { classic = false, settings = null } = {}) {
  const shell = createStartupCenterTestShell(document, { product: true }), calls = [], overrides = {};
  const tauriFlag = Object.getOwnPropertyDescriptor(globalThis, "isTauri");
  if (classic) Object.defineProperty(globalThis, "isTauri", { configurable: true, value: true });
  let current = null, saved = structuredClone(settings);
  window.__TAURI_INTERNALS__ = { metadata: { currentWindow: { label: "main" } }, async invoke(command, args) {
    calls.push({ command, args });
    if (overrides[command]) return overrides[command](args);
    if (command === "workbench_read_plugin_settings_v1") return saved;
    if (command === "workbench_write_plugin_settings_v1") { saved = structuredClone(args.document); return; }
    if (command === "workbench_read_v1") return current;
    if (command === "workbench_list_recent_documents_v1") return catalog;
    if (command === "workbench_remove_recent_document_v1") return { apiVersion: 1, entries: [] };
    if (command === "workbench_create_guarded_v1") { assert.deepEqual(args.request.expected, { kind: "empty" }); current = score("new"); return current; }
    if (["workbench_open_file_guarded_v1", "workbench_open_recent_document_guarded_v1"].includes(command)) {
      assert.deepEqual(args.expected, { kind: "empty" }); current = score(); return { session: current, name: "真实作品", savedVersion: 0 };
    }
    if (command === "plugin:window|inner_size") return { width: 1040, height: 700 };
    if (command === "plugin:window|scale_factor") return 1;
    if (command === "plugin:window|is_maximized") return false;
    if (command === "plugin:window|current_monitor") return null;
    if (["plugin:window|unmaximize", "plugin:window|maximize", "plugin:window|set_size", "plugin:window|set_min_size"].includes(command)) return;
    throw new Error("Unexpected IPC " + command);
  } };
  const storage = new TauriPluginSettingsStorage();
  const app = classic ? null : mountStartupCenterApplication({ ...shell, windowPort: createDesktopStartupWindow(),
    createDocumentSession: createDesktopReadonlyScoreSession,
    appearanceStore: createDesktopStartupAppearanceStore({ settingsStorage: storage }),
    store: createDesktopPluginPlanStore({ directory, settingsStorage: storage }) });
  return { ...shell, app, calls, overrides, get settings() { return structuredClone(saved); },
    replaceSettings(value) { saved = structuredClone(value); }, count: command => calls.filter(call => call.command === command).length,
    dispose() {
      if (app) app.dispose(); else window.dispatchEvent(new Event("pagehide"));
      shell.root.remove(); shell.workspaceRoot.remove(); delete window.__TAURI_INTERNALS__;
      if (classic) { if (tauriFlag) Object.defineProperty(globalThis, "isTauri", tauriFlag); else delete globalThis.isTauri; }
    } };
}

test("product three-page view uses host recents, preserves one plugin draft and updates launch availability after save", () => withTestDocument(async env => {
  const f = fixture(env);
  try {
    assert.equal((await f.app.ready).ok, true); await flush();
    assert.equal(f.count("workbench_create_guarded_v1"), 0); assert.equal(f.workspaceRoot.children.length, 0);
    assert.equal(f.root.querySelectorAll("[data-record-id]").length, 1);
    assert.equal(f.root.querySelector("[data-example-id]"), null);
    assert.equal(f.node("launch-score-card").querySelector("img"), null, "never show an example thumbnail for a real document");
    assert.equal(f.node("launch-preview-title").textContent, "真实作品");
    const toggle = f.root.querySelector('[data-plugin-id="frame.score-info"]').querySelector(".startup-toggle");
    const input = f.node("frame.score-info-measureLimit");
    f.node("launch-tab-plugins").click(); toggle.click(); change(input, "3", "input");
    assert.equal(f.node("launch-new").disabled, true);
    f.node("launch-tab-settings").click(); change(f.node("launch-font-size"), "14");
    f.node("launch-tab-recent").click(); f.node("launch-tab-plugins").click();
    assert.equal(f.node("frame.score-info-measureLimit"), input); assert.equal(input.value, "3");
    assert.equal(f.node("startup-open").hidden, true, "only the outer document actions own startup");
    f.node("startup-apply").click(); await until(() => !f.node("launch-new").disabled);
    await until(() => f.app.appearance.snapshot().persisted);
    assert.equal(f.count("workbench_write_plugin_settings_v1"), 2);
    assert.equal(f.calls.filter(call => call.command === "workbench_write_plugin_settings_v1").at(-1).args.document[STARTUP_APPEARANCE_NAMESPACE].value.fontSize, 14);
    assert.equal(f.app.application.controller.snapshot().baseline.plugins["frame.score-info"].settings.measureLimit, 3);
    assert.equal(f.count("workbench_create_guarded_v1"), 0);
    assert.equal(f.node("launch-status").textContent, "", "normal status stays graphical");
    assert.equal(f.node("launch-status").getAttribute("aria-label"), "就绪");
  } finally { f.dispose(); }
}));

test("record-ID open, app-mark return and continue retain the same actual score view and fixed platform plan", () => withTestDocument(async env => {
  const f = fixture(env);
  try {
    await f.app.ready; await flush(); f.node("launch-open-selected").click();
    await until(() => f.app.application.snapshot().phase === "workspace");
    const view = f.workspaceRoot.querySelector(".core-score-view"), mark = f.workspaceRoot.querySelector(".v-app-mark");
    assert.ok(view); assert.equal(mark.tagName, "BUTTON"); assert.equal(f.root.hidden, true);
    assert.deepEqual(f.calls.find(call => call.command === "workbench_open_recent_document_guarded_v1").args.recordId, recordId);
    const size = f.calls.find(call => call.command === "plugin:window|set_size");
    assert.equal(size.args.label, "main");
    assert.deepEqual(JSON.parse(JSON.stringify(size.args.value)), { Logical: { width: 1440, height: 900 } });
    mark.click(); await until(() => f.app.application.snapshot().phase === "welcome");
    assert.equal(f.workspaceRoot.hidden, true); assert.equal(env.document.body.classList.contains("startup-workspace-active"), false);
    f.root.querySelector('[data-plugin-id="frame.score-info"]').querySelector(".startup-toggle").click();
    assert.equal(f.node("launch-continue").hidden, false);
    f.node("launch-continue").click(); await until(() => f.app.application.snapshot().phase === "workspace");
    assert.equal(f.workspaceRoot.querySelector(".core-score-view"), view);
    assert.equal(f.workspaceRoot.querySelectorAll(".core-score-view").length, 1);
    assert.equal(f.count("workbench_read_v1"), 1); assert.equal(f.count("workbench_open_recent_document_guarded_v1"), 1);
    assert.equal(f.app.application.snapshot().runningPlan.plugins["frame.score-info"].enabled, false);
    assert.equal(f.app.application.controller.snapshot().draft.plugins["frame.score-info"].enabled, true);
    assert.equal(env.document.activeElement, mark);
    f.app.dispose(); mark.click(); assert.equal(f.workspaceRoot.children.length, 0);
    assert.equal(f.app.application.snapshot().phase, "disposed");
  } finally { f.dispose(); }
}));

test("accepted new document and failed window sizing expose retry without repeating mutation", () => withTestDocument(async env => {
  const f = fixture(env); let attempts = 0;
  f.overrides["plugin:window|set_size"] = () => { if (++attempts === 1) throw new Error("resize refused"); };
  try {
    await f.app.ready; f.node("launch-new").click(); await until(() => f.app.application.snapshot().canRetryStart && !f.app.application.snapshot().busy);
    assert.equal(f.node("launch-retry").hidden, false); assert.equal(f.node("launch-new").disabled, true);
    assert.equal(f.node("launch-continue").hidden, true); assert.equal(f.workspaceRoot.children.length, 0);
    assert.match(f.node("launch-status").title, /resize refused/);
    f.node("launch-retry").click(); await until(() => f.app.application.snapshot().phase === "workspace");
    assert.equal(f.count("workbench_create_guarded_v1"), 1);
    assert.equal(f.workspaceRoot.querySelectorAll(".core-score-view").length, 1);
  } finally { f.dispose(); }
}));

test("recent failure preserves rows, removal uses record IDs and does not delete or open a file", () => withTestDocument(async env => {
  const f = fixture(env);
  try {
    await f.app.ready; await flush();
    const row = f.root.querySelector("[data-record-id]");
    f.overrides.workbench_list_recent_documents_v1 = () => { throw new Error("recent disk unavailable"); };
    f.node("launch-refresh").click(); await until(() => f.app.application.snapshot().recent.issue);
    assert.equal(f.root.querySelector("[data-record-id]"), row); assert.match(f.node("launch-status").title, /recent disk unavailable/);
    f.node("launch-remove").click(); await until(() => f.app.application.snapshot().recent.entries.length === 0);
    assert.equal(f.calls.find(call => call.command === "workbench_remove_recent_document_v1").args.recordId, recordId);
    assert.equal(f.node("launch-score-card").hidden, true); assert.equal(f.node("launch-remove").hidden, true);
    assert.equal(f.count("workbench_open_recent_document_guarded_v1"), 0); assert.equal(f.count("workbench_create_guarded_v1"), 0);
  } finally { f.dispose(); }
}));

test("initial document read failure offers explicit retry before any create or platform mount", () => withTestDocument(async env => {
  const f = fixture(env);
  try {
    f.overrides.workbench_read_v1 = () => { throw new Error("read refused"); };
    assert.equal((await f.app.ready).ok, false);
    assert.equal(f.node("launch-retry").hidden, false); assert.equal(f.node("launch-new").disabled, true);
    assert.match(f.node("launch-status").title, /read refused/);
    delete f.overrides.workbench_read_v1;
    f.node("launch-retry").click(); await until(() => !f.node("launch-new").disabled);
    assert.equal(f.count("workbench_read_v1"), 2); assert.equal(f.count("workbench_create_guarded_v1"), 0);
    assert.equal(f.workspaceRoot.children.length, 0);
  } finally { f.dispose(); }
}));

test("invalid presentation shell rolls back acquired owners before a delayed initialization can continue", () => withTestDocument(async env => {
  const shell = createStartupCenterTestShell(env.document, { product: true });
  shell.node("launch-search").remove(); let disposed = 0, reads = 0;
  let finish; const pending = new Promise(yes => { finish = yes; });
  env.window.__TAURI_INTERNALS__ = { async invoke() { reads++; return null; } };
  assert.throws(() => mountStartupCenterApplication({ ...shell, windowPort: { present() {}, dispose() { disposed++; } },
    appearanceStore: { read: () => pending, write() {} },
    store: { read: () => pending, write() {} }, createDocumentSession(input) {
      const source = createDesktopReadonlyScoreSession(input);
      return { ...source, dispose() { disposed++; source.dispose(); } };
    } }), /缺少控件/);
  finish(null); await flush();
  assert.equal(disposed, 2); assert.equal(reads, 0); assert.equal(shell.workspaceRoot.children.length, 0);
  shell.root.remove(); shell.workspaceRoot.remove(); delete env.window.__TAURI_INTERNALS__;
}));

test("failed return keeps workspace visible and exposes retry through its existing icon", () => withTestDocument(async env => {
  const f = fixture(env);
  try {
    await f.app.ready; await f.app.application.enter({ kind: "open" });
    const mark = f.workspaceRoot.querySelector(".v-app-mark"), view = f.workspaceRoot.querySelector(".core-score-view");
    let fail = true; f.overrides["plugin:window|set_size"] = () => { if (fail) { fail = false; throw new Error("welcome refused"); } };
    mark.click(); await until(() => mark.dataset.error === "true");
    assert.equal(f.root.hidden, true); assert.equal(f.workspaceRoot.hidden, false); assert.match(mark.title, /welcome refused/);
    mark.click(); await until(() => f.app.application.snapshot().phase === "welcome");
    assert.equal(f.workspaceRoot.querySelector(".core-score-view"), view);
    assert.equal(mark.dataset.error, "false"); assert.equal(f.count("workbench_open_file_guarded_v1"), 1);
  } finally { f.dispose(); }
}));

test("disposal during actual native resize prevents late DOM visibility and workspace acquisition", () => withTestDocument(async env => {
  const f = fixture(env); let resolve, arrived;
  const reached = new Promise(yes => { arrived = yes; }), pending = new Promise(yes => { resolve = yes; });
  try {
    await f.app.ready;
    f.overrides["plugin:window|set_size"] = () => { arrived(); return pending; };
    const entering = f.app.application.enter({ kind: "new" }); await reached;
    f.app.dispose(); const count = f.calls.length; resolve();
    assert.equal((await entering).ok, false); await flush();
    assert.equal(f.calls.length, count); assert.equal(f.root.hidden, false); assert.equal(f.workspaceRoot.hidden, true);
    assert.equal(f.workspaceRoot.children.length, 0); assert.equal(f.node("launch-file-list").children.length, 0);
    f.node("launch-new").click(); assert.equal(f.calls.length, count);
  } finally { resolve?.(); f.dispose(); }
}));

test("actual classic product entry reads only once, preserves bfcache and releases all original owners on page exit", () => withTestDocument(async env => {
  const f = fixture(env, { classic: true });
  try {
    const source = readFileSync(new URL("../vendor/startup-center-product.js", import.meta.url), "utf8");
    assert.doesNotMatch(source, /import\.meta|\bimport\s*\(/); runInThisContext(source);
    await until(() => !f.node("launch-new").disabled);
    assert.equal(f.count("workbench_read_v1"), 1); assert.equal(f.count("workbench_create_guarded_v1"), 0);
    const restored = new Event("pagehide"); Object.defineProperty(restored, "persisted", { value: true });
    env.window.dispatchEvent(restored); assert.equal(f.root.querySelectorAll(".startup-row").length, 5);
    f.node("launch-new").click(); await until(() => f.workspaceRoot.querySelector(".core-score-view"));
    env.window.dispatchEvent(new Event("pagehide")); const count = f.calls.length;
    assert.equal(f.workspaceRoot.children.length, 0); assert.equal(f.root.querySelectorAll(".startup-row").length, 0);
    f.node("launch-new").click(); await flush(); assert.equal(f.calls.length, count);
  } finally { f.dispose(); }
}));

test("product HTML embeds the original manager once, ships no sample images and provides all real actions", async () => {
  const html = await createStartupCenterPage({ product: true });
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ["launch-root", "startup-root", "app", "launch-refresh", "launch-remove", "launch-retry", "launch-continue", "launch-appearance-status"]) assert.ok(ids.includes(id));
  assert.equal((html.match(/<main\b/g) ?? []).length, 1);
  assert.doesNotMatch(html, /approved-score\.svg|launch-preview-badge|startup-preview-badge|示例作品|视觉预览|@@PLUGIN_SHELL@@|type="module"/);
  for (const id of ["refresh", "remove", "retry", "continue"]) assert.match(html, new RegExp(`<button id="launch-${id}" data-frame-ui`), "new icons opt into the shared control style reset");
  assert.match(html, /vendor\/startup-center-product\.js/); assert.match(html, /id="app"[^>]*hidden/);
});

test("classic product fresh mounts restore the host appearance document and keep preferences local to welcome", () => withTestDocument(async env => {
  let settings;
  const f = fixture(env, { classic: true });
  try {
    const source = readFileSync(new URL("../vendor/startup-center-product.js", import.meta.url), "utf8");
    runInThisContext(source); await until(() => !f.node("launch-density").disabled);
    assert.equal(f.count("workbench_write_plugin_settings_v1"), 0);
    change(f.node("launch-density"), "comfortable"); await until(() => !f.node("launch-density").disabled);
    change(f.node("launch-font-size"), "14"); await until(() => !f.node("launch-font-size").disabled);
    settings = f.settings; assert.equal(settings[STARTUP_APPEARANCE_NAMESPACE].value.revision, 2);
    assert.equal(f.node("launch-appearance-status").textContent, "");
  } finally { f.dispose(); }
  const restored = fixture(env, { classic: true, settings });
  try {
    runInThisContext(readFileSync(new URL("../vendor/startup-center-product.js", import.meta.url), "utf8"));
    await until(() => !restored.node("launch-density").disabled);
    assert.equal(restored.root.getAttribute("data-density"), "comfortable");
    assert.equal(restored.root.style.getPropertyValue("--launch-font-size"), "14px");
    assert.equal(restored.node("launch-font-size").value, "14"); assert.equal(restored.count("workbench_write_plugin_settings_v1"), 0);
    restored.node("launch-new").click(); await until(() => restored.workspaceRoot.querySelector(".core-score-view"));
    assert.equal(restored.workspaceRoot.getAttribute("data-density"), null);
    assert.equal(restored.workspaceRoot.style.getPropertyValue("--launch-font-size"), "");
    env.window.dispatchEvent(new Event("pagehide")); const count = restored.calls.length;
    change(restored.node("launch-font-size"), "12"); restored.node("launch-appearance-status").click(); await flush();
    assert.equal(restored.calls.length, count);
  } finally { restored.dispose(); }
}));

test("product appearance write failure leaves the applied value and graphical retry without blocking a document", () => withTestDocument(async env => {
  const f = fixture(env);
  try {
    await Promise.all([f.app.ready, f.app.appearance.ready]);
    f.overrides.workbench_write_plugin_settings_v1 = () => { throw new Error("appearance disk unavailable"); };
    change(f.node("launch-font-size"), "14"); await until(() => f.app.appearance.snapshot().canRetry);
    assert.equal(f.root.style.getPropertyValue("--launch-font-size"), "14px");
    assert.equal(f.node("launch-new").disabled, false); assert.equal(f.node("launch-appearance-status").textContent, "");
    assert.match(f.node("launch-appearance-status").title, /appearance disk unavailable.*点击重试保存/);
    assert.equal(f.node("launch-status").getAttribute("aria-label"), "就绪");
    delete f.overrides.workbench_write_plugin_settings_v1;
    f.node("launch-appearance-status").click(); await until(() => f.app.appearance.snapshot().persisted);
    assert.equal(f.settings[STARTUP_APPEARANCE_NAMESPACE].value.fontSize, 14);
    assert.equal(f.app.appearance.snapshot().value.revision, 1);
    assert.equal(f.node("launch-appearance-status").disabled, true);
  } finally { f.dispose(); }
}));

test("future appearance is preserved, locks its controls only, and never prevents real new document startup", () => withTestDocument(async env => {
  const settings = { [STARTUP_APPEARANCE_NAMESPACE]: { schemaVersion: 2, value: { future: true } } }, f = fixture(env, { settings });
  try {
    assert.equal((await f.app.appearance.ready).ok, false); assert.equal((await f.app.ready).ok, true);
    assert.equal(f.node("launch-density").disabled, true); assert.equal(f.node("launch-font-size").disabled, true);
    assert.match(f.node("launch-appearance-status").title, /envelope.*重新读取/);
    assert.equal(f.node("launch-new").disabled, false);
    f.node("launch-new").click(); await until(() => f.app.application.snapshot().phase === "workspace");
    assert.equal(f.count("workbench_create_guarded_v1"), 1); assert.deepEqual(f.settings, settings);
    assert.equal(f.count("workbench_write_plugin_settings_v1"), 0);
  } finally { f.dispose(); }
}));

test("product conflict retry explicitly reloads the host revision and discards only the unsaved appearance draft", () => withTestDocument(async env => {
  const f = fixture(env);
  try {
    await Promise.all([f.app.ready, f.app.appearance.ready]);
    f.replaceSettings({ [STARTUP_APPEARANCE_NAMESPACE]: { schemaVersion: 1, value: { ...DEFAULT_STARTUP_APPEARANCE, revision: 1, fontSize: 14 } } });
    change(f.node("launch-density"), "comfortable"); await until(() => f.app.appearance.snapshot().canRetry);
    assert.equal(f.root.getAttribute("data-density"), "comfortable");
    assert.match(f.node("launch-appearance-status").getAttribute("aria-label"), /撤销未保存设置.*点击重新读取/);
    assert.equal(f.count("workbench_write_plugin_settings_v1"), 0);
    f.node("launch-appearance-status").click(); await until(() => f.app.appearance.snapshot().persisted);
    assert.equal(f.root.getAttribute("data-density"), "compact"); assert.equal(f.node("launch-font-size").value, "14");
    assert.equal(f.count("workbench_write_plugin_settings_v1"), 0);
  } finally { f.dispose(); }
}));

test("product release while the plugin namespace owns the writer cancels unissued appearance IO", () => withTestDocument(async env => {
  const f = fixture(env); let release, arrive;
  const gate = new Promise(yes => { release = yes; }), reached = new Promise(yes => { arrive = yes; });
  try {
    await Promise.all([f.app.ready, f.app.appearance.ready]);
    f.overrides.workbench_write_plugin_settings_v1 = async ({ document }) => { arrive(); await gate; f.replaceSettings(document); };
    f.app.application.controller.setEnabled("frame.score-info", true);
    const saving = f.app.application.controller.save(); await reached;
    change(f.node("launch-font-size"), "14"); await flush(); f.app.dispose();
    release(); assert.equal((await saving).code, "startup.disposed"); await flush();
    assert.equal(f.count("workbench_write_plugin_settings_v1"), 1);
    assert.equal(f.settings[STARTUP_APPEARANCE_NAMESPACE], undefined); assert.equal(f.app.appearance.snapshot().phase, "disposed");
    const count = f.calls.length; change(f.node("launch-density"), "comfortable"); f.node("launch-appearance-status").click(); await flush();
    assert.equal(f.calls.length, count);
  } finally { release?.(); f.dispose(); }
}));
