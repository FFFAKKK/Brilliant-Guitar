import { importPreviewForTest } from "./support/workspace-runtime-test.js";
import assert from "node:assert/strict";
import test from "node:test";
import { createCommandRouter } from "../src/runtime/command-router.js";
import { createComponentRegistry } from "../src/runtime/component-registry.js";
import { createComponentHost } from "../src/runtime/component-host.js";
import { createMenuRegistry } from "../src/runtime/menu-registry.js";
import { createPluginPlatform } from "../src/runtime/plugin-installer.js";
import { createUiContributionCatalog } from "../src/runtime/ui-contribution-catalog.js";
import { defineUiPlugin } from "../src/runtime/ui-plugin-contract.js";
import { bindKeyboard } from "../src/host/keyboard.js";
import { captureFocusRecovery } from "../src/host/focus-boundary.js";
import { createSidebarPresentation } from "../src/host/sidebar-presentation.js";
import { bindSidebarCommands, SIDEBAR_COMMANDS as S } from "../src/host/sidebar-commands.js";
import { bindWorkspaceCommands, WORKSPACE_COMMANDS as C } from "../src/host/workspace-commands.js";
import { createSidebarCompositionState } from "../src/layout/sidebar-composition-state.js";
import { createWorkspaceState } from "../src/layout/workspace-state.js";
import { createLayoutEditSession } from "../src/layout/layout-edit-session.js";
import { createBuiltinPages, LAYOUT_PAGE_ID } from "../src/features/builtin-pages.js";
import { createVisualWorkbench } from "../src/shell/visual-workbench.js";
import { withTestDocument } from "./support/dom-test-environment.js";

function press(target, key = "x", properties = {}) {
  const event = new Event("keydown", { bubbles: true, cancelable: true });
  for (const [name, value] of Object.entries({ key, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...properties })) {
    Object.defineProperty(event, name, { configurable: true, value });
  }
  target.dispatchEvent(event);
  return event;
}

function fixture(options = {}) {
  const root = document.createElement("div"); document.body.append(root);
  const router = createCommandRouter(), registry = createComponentRegistry(), notices = [], calls = [];
  const host = createComponentHost({ registry, router, notices: { push: notice => notices.push(notice) } });
  router.register("host", { id: "host.action", keys: ["X"], run: () => { calls.push("global"); } });
  const fallback = event => { if (event.key === "Escape") { calls.push("fallback"); event.preventDefault(); } };
  const stop = bindKeyboard(router, { root, components: host, fallback, isMac: false, ...options });
  function component(id, handler, { role = "tool", permissions = ["host.action"] } = {}) {
    let context;
    registry.register("sample", { id, title: id, role, slots: [role === "view" ? "stage" : "left"],
      permissions: { commands: permissions }, mount(element, ctx) {
        context = ctx;
        element.append(document.createElement("button"));
        return { handleKeyDown: handler && (event => handler(event, ctx)) };
      } });
    const cell = host.ensure(id, "panel"); root.append(cell);
    return { cell, button: cell.querySelector("button"), context };
  }
  return { root, router, registry, host, notices, calls, component, stop,
    dispose() { stop(); host.dispose(); root.remove(); } };
}

test("only the focused real component handles a shared local key; actions use its permitted ctx.execute", () => withTestDocument(() => {
  const current = fixture();
  for (const name of ["a", "b"]) current.router.register("sample", { id: `sample.${name}.action`, run: () => current.calls.push(name) });
  const a = current.component("sample.a", (event, ctx) => {
    if (event.key !== "x") return false;
    ctx.execute("sample.a.action"); return true;
  }, { permissions: ["sample.a.action"] });
  const b = current.component("sample.b", (event, ctx) => {
    if (event.key !== "x") return false;
    ctx.execute("sample.b.action"); return true;
  }, { permissions: ["sample.b.action"] });
  assert.equal(press(a.button).defaultPrevented, true);
  assert.equal(press(b.button).defaultPrevented, true);
  const chrome = document.createElement("button"); current.root.append(chrome);
  assert.equal(press(chrome).defaultPrevented, true);
  assert.deepEqual(current.calls, ["a", "b", "global"]);
  assert.deepEqual(Object.keys(a.context).sort(), ["execute", "notify", "onDispose"]);
  current.dispose();
}));

test("unhandled panel keys reach global commands without reaching a background score view", () => withTestDocument(() => {
  const current = fixture();
  const score = current.component("sample.score", () => { current.calls.push("score"); return true; }, { role: "view" });
  const panel = current.component("sample.panel", () => { current.calls.push("panel"); return false; });
  press(panel.button); press(score.button);
  assert.deepEqual(current.calls, ["panel", "global", "score"]);
  current.dispose();
}));

test("native fields and inherited contenteditable own keys, including empty and plaintext-only declarations", () => withTestDocument(() => {
  const current = fixture(); const panel = current.component("sample.panel", () => { current.calls.push("panel"); return true; });
  for (const tag of ["input", "textarea", "select"]) {
    const field = document.createElement(tag); panel.cell.append(field);
    assert.equal(press(field).defaultPrevented, false);
    assert.equal(press(field, "Escape").defaultPrevented, false);
  }
  for (const value of ["", "true", "plaintext-only"]) {
    const editable = document.createElement("div"); editable.setAttribute("contenteditable", value);
    const nested = document.createElement("span"); editable.append(nested); panel.cell.append(editable);
    assert.equal(press(nested).defaultPrevented, false);
    nested.setAttribute("contenteditable", "invalid"); assert.equal(press(nested).defaultPrevented, false);
    const nonEditable = document.createElement("button"); nonEditable.setAttribute("contenteditable", "false"); editable.append(nonEditable);
    assert.equal(press(nonEditable).defaultPrevented, true);
  }
  assert.deepEqual(current.calls, ["panel", "panel", "panel"]);
  current.dispose();
}));

test("local DOM prevention and propagation stops precede the instance and global handlers", () => withTestDocument(() => {
  const current = fixture(); const panel = current.component("sample.panel", () => { current.calls.push("panel"); return true; });
  const prevent = event => event.preventDefault(), stop = event => event.stopPropagation();
  panel.button.addEventListener("keydown", prevent); press(panel.button); panel.button.removeEventListener("keydown", prevent);
  panel.button.addEventListener("keydown", stop); press(panel.button); panel.button.removeEventListener("keydown", stop);
  assert.deepEqual(current.calls, []);
  current.dispose();
}));

test("menus, dialogs and body portals reserve keys even when focus remains on the background", () => withTestDocument(() => {
  const current = fixture(); const panel = current.component("sample.panel", () => { current.calls.push("panel"); return true; });
  for (const role of ["dialog", "alertdialog", "menu"]) {
    const surface = document.createElement("div"); surface.setAttribute("role", role);
    const button = document.createElement("button"); surface.append(button); current.root.append(surface);
    assert.equal(press(button).defaultPrevented, false);
    assert.equal(press(panel.button, "Escape").defaultPrevented, false);
    surface.hidden = true; press(panel.button); surface.remove();
  }
  const portal = document.createElement("div"); portal.className = "popover"; document.body.append(portal);
  assert.equal(press(panel.button).defaultPrevented, false);
  portal.remove(); press(panel.button);
  assert.deepEqual(current.calls, ["panel", "panel", "panel", "panel"]);
  current.dispose();
}));

test("IME, dead keys and AltGraph never reach component, global or workspace fallback", () => withTestDocument(() => {
  const current = fixture(); const panel = current.component("sample.panel", () => { current.calls.push("panel"); return true; });
  for (const [key, properties] of [["x", { isComposing: true }], ["Escape", { keyCode: 229 }],
    ["Dead", {}], ["Process", {}], ["Unidentified", {}], ["x", { ctrlKey: true, altKey: true, getModifierState: key => key === "AltGraph" }]]) {
    assert.equal(press(panel.button, key, properties).defaultPrevented, false);
  }
  assert.deepEqual(current.calls, []); current.dispose();
}));

test("shadow DOM composed paths protect inner fields and preserve actual instance ownership", () => withTestDocument(() => {
  const current = fixture(); const panel = current.component("sample.panel", () => { current.calls.push("panel"); return true; });
  const shadowHost = document.createElement("div"), shadow = document.createElement("shadow-root"), field = document.createElement("input");
  shadow.host = shadowHost; shadow.append(field); panel.cell.append(shadowHost);
  assert.equal(press(field).defaultPrevented, false);
  const button = document.createElement("button"); shadow.append(button); press(button);
  assert.deepEqual(current.calls, ["panel"]); current.dispose();
}));

test("hidden, inert, failed, removed and released instances cannot receive local keys", () => withTestDocument(() => {
  const current = fixture(); const panel = current.component("sample.panel", () => { current.calls.push("panel"); return true; });
  current.host.setVisible("sample.panel", false); press(panel.button);
  assert.deepEqual(current.calls, ["global"]); current.calls.length = 0;
  panel.cell.hidden = true; press(panel.button); panel.cell.hidden = false;
  panel.cell.setAttribute("aria-hidden", "true"); press(panel.button); panel.cell.removeAttribute("aria-hidden");
  panel.cell.inert = true; press(panel.button); panel.cell.inert = false;
  panel.cell.remove(); press(panel.button); current.root.append(panel.cell);
  current.host.release("sample.panel"); press(panel.button);
  assert.deepEqual(current.calls, []);
  const bad = current.component("sample.bad", undefined);
  current.registry.register("sample", { id: "sample.invalid", title: "invalid", role: "tool", slots: ["left"], mount: () => ({ handleKeyDown: 42 }) });
  const invalid = current.host.ensure("sample.invalid", "panel"); current.root.append(invalid); press(invalid);
  assert.deepEqual(current.calls, ["global"]); assert.match(current.notices[0].text, /handleKeyDown 必须是函数/);
  press(bad.button); assert.deepEqual(current.calls, ["global", "global"]);
  current.dispose();
}));

test("a forged component id cannot redirect keys to another instance; hooks keep command permissions", () => withTestDocument(() => {
  const current = fixture(); current.component("sample.a", () => { current.calls.push("a"); return true; });
  const forged = document.createElement("section"); forged.dataset.component = "sample.a"; current.root.append(forged); press(forged);
  const denied = current.component("sample.denied", (_event, ctx) => {
    assert.equal(ctx.execute("host.action").code, "permission.denied"); return true;
  }, { permissions: [] });
  press(denied.button);
  assert.deepEqual(current.calls, ["global"]); assert.equal(current.notices.length, 1);
  current.dispose();
}));

test("broken or async local hooks consume the key, report the failure and preserve other components", async () => withTestDocument(async () => {
  const current = fixture();
  for (const [name, handler] of [["throws", () => { throw new Error("bad key"); }],
    ["invalid", () => ({ ok: true })], ["async", () => Promise.reject(new Error("late key"))]]) {
    const panel = current.component(`sample.${name}`, handler); assert.equal(press(panel.button).defaultPrevented, true);
  }
  const healthy = current.component("sample.healthy", () => { current.calls.push("healthy"); return true; });
  press(healthy.button); await Promise.resolve();
  assert.deepEqual(current.calls, ["healthy"]); assert.equal(current.notices.length, 3);
  current.dispose();
}));

test("disabled global shortcuts preserve native defaults and platform modifiers match strictly", () => withTestDocument(() => {
  const current = fixture(); const button = document.createElement("button"); current.root.append(button);
  current.router.register("host", { id: "host.save", keys: ["Mod+S"], run: () => current.calls.push("save") });
  current.router.register("host", { id: "host.disabled", keys: ["D"], enabled: () => false, run: () => assert.fail("disabled") });
  assert.equal(press(button, "d").defaultPrevented, false);
  assert.equal(press(button, "s", { metaKey: true }).defaultPrevented, false);
  assert.equal(press(button, "s", { metaKey: true, ctrlKey: true }).defaultPrevented, false);
  press(button, "s", { ctrlKey: true }); assert.deepEqual(current.calls, ["save"]);
  current.stop();
  const stopMac = bindKeyboard(current.router, { root: current.root, isMac: true });
  assert.equal(press(button, "s", { ctrlKey: true }).defaultPrevented, false);
  press(button, "s", { metaKey: true }); stopMac();
  assert.deepEqual(current.calls, ["save", "save"]); current.dispose();
}));

test("bindings are scoped to their root and disposal removes global and component dispatch once", () => withTestDocument(() => {
  const current = fixture(); const panel = current.component("sample.panel", () => { current.calls.push("panel"); return true; });
  const outside = document.createElement("button"); document.body.append(outside); press(outside);
  const outsideDialog = document.createElement("dialog"); outsideDialog.setAttribute("role", "dialog"); document.body.append(outsideDialog);
  press(panel.button); current.stop(); current.stop(); press(panel.button); press(panel.button, "Escape");
  const resumed = bindKeyboard(current.router, { root: current.root, components: current.host }); press(panel.button); resumed();
  assert.deepEqual(current.calls, ["panel", "panel"]); current.dispose();
}));

test("global synchronous errors and rejections are reported without breaking a later command", async () => withTestDocument(async () => {
  const errors = [], current = fixture({ onError: error => errors.push(error.message) });
  const button = document.createElement("button"); current.root.append(button);
  current.router.register("host", { id: "host.bad", keys: ["B"], run: () => { throw new Error("bad global"); } });
  current.router.register("host", { id: "host.async", keys: ["A"], run: () => Promise.reject(new Error("rejected global")) });
  current.router.register("host", { id: "host.predicate", keys: ["P"], enabled: () => { throw new Error("bad predicate"); }, run() {} });
  assert.equal(press(button, "b").defaultPrevented, true); press(button, "a"); press(button, "p"); press(button);
  await Promise.resolve(); assert.deepEqual(errors.sort(), ["bad global", "bad predicate", "rejected global"]);
  assert.deepEqual(current.calls, ["global"]); current.dispose();
}));

function workspace({ manifest } = {}) {
  const router = createCommandRouter(), registry = createComponentRegistry(); let store, sidebar, composition;
  const layout = { snapshot: () => store.read.snapshot(), subscribe: listener => store.read.subscribe(listener) };
  const builtin = manifest ?? createBuiltinPages(layout, undefined, undefined, { includeLayout: true });
  const ids = builtin.components.map(item => item.id);
  store = createWorkspaceState({ pageIds: ids, layoutPageId: manifest ? ids[0] : LAYOUT_PAGE_ID, width: innerWidth, height: innerHeight });
  const editSession = createLayoutEditSession({ workspace: store, composition: () => composition });
  const stopCommands = bindWorkspaceCommands({ router, store, editSession, stage: { zoom() {} }, sidebar: { snapshot: () => sidebar.describe(layout.snapshot()) } });
  const stopSidebar = bindSidebarCommands({ router, editSession });
  const platform = createPluginPlatform({ router, components: registry, menus: createMenuRegistry([]) });
  platform.register(builtin); platform.start();
  const catalog = createUiContributionCatalog({ platform, components: registry });
  composition = createSidebarCompositionState({ contributions: catalog.list() });
  const components = createComponentHost({ registry, router, notices: { push() {} } });
  sidebar = createSidebarPresentation({ catalog, composition: composition.read, components });
  const root = document.createElement("div"); document.body.append(root);
  const shell = createVisualWorkbench({ root, panels: catalog.list({ kind: "panel", slot: "right" }), layout, router, sidebar });
  shell.render(layout.snapshot());
  const stopKeyboard = bindKeyboard(router, { root: shell.shell, components, fallback: shell.handleKeyDown, isMac: false });
  const stopLayout = layout.subscribe(snapshot => shell.render(snapshot));
  const stopComposition = composition.read.subscribe(snapshot => shell.render(layout.snapshot(), snapshot));
  return { router, components, store, composition, root, shell, editSession, query: selector => root.querySelector(selector),
    dispose() { stopKeyboard(); stopLayout(); stopComposition(); shell.dispose(); editSession.dispose(); components.dispose(); platform.dispose(); stopSidebar(); stopCommands(); root.remove(); } };
}

test("real workspace Escape cancels adjustment only after field, IME, dialog and local component boundaries", () => withTestDocument(() => {
  const current = workspace(); current.router.execute(C.page, { id: "frame.builtin.assistant", toggle: false });
  const originalWidth = current.store.read.snapshot().leftWidth;
  current.router.execute(C.begin); current.router.execute(C.resize, { side: "left", value: originalWidth + 40 });
  current.router.execute(C.page, { id: "frame.builtin.assistant", toggle: false });
  const input = current.query("#page-input"); input.value = "keep";
  assert.equal(press(input, "Escape").defaultPrevented, false); assert.equal(current.store.read.snapshot().adjusting, true);
  press(current.shell.stage, "Escape", { isComposing: true }); press(current.shell.stage, "Escape", { shiftKey: true });
  assert.equal(current.store.read.snapshot().adjusting, true);
  const dialog = document.createElement("div"); dialog.setAttribute("role", "dialog"); document.body.append(dialog);
  press(current.shell.stage, "Escape"); assert.equal(current.store.read.snapshot().adjusting, true); dialog.remove();
  assert.equal(press(current.shell.stage, "Escape").defaultPrevented, true);
  assert.equal(current.store.read.snapshot().adjusting, false); assert.equal(current.store.read.snapshot().leftWidth, originalWidth + 40);
  assert.equal(input.value, "keep"); assert.ok(document.activeElement === current.query('[id="page-tab-frame.builtin.assistant"]'), "Escape returns focus to the restored tab");
  current.dispose();
}));

test("real sidebar hiding and removing content recover focus; visible movement preserves node identity and input", () => withTestDocument(() => {
  let mounts = 0;
  const manifest = defineUiPlugin({ namespace: "sample", ui: ["a", "b"].map(name => ({
    id: `sample.${name}`, kind: "panel", title: name, slots: ["left", "right"], defaultSlot: "right", defaultEnabled: true,
    mount(element) { mounts++; const input = document.createElement("input"); input.id = "input-" + name; element.append(input); },
  })) });
  const current = workspace({ manifest }); current.router.execute(C.begin);
  const input = current.query("#input-a"); input.value = "draft"; input.focus();
  current.router.execute(C.region, { region: "left" });
  current.router.execute(S.move, { id: "sample.a", slot: "left" });
  assert.ok(document.activeElement === input, "visible move preserves focus"); assert.ok(current.query("#input-a") === input);
  current.router.execute(S.reorder, { id: "sample.a", index: 0 }); assert.ok(document.activeElement === input);
  current.router.execute(C.region, { region: "left" });
  assert.ok(document.activeElement === current.query('[id="page-tab-sample.b"]'), "folding the focused region returns focus to the active tab");
  current.router.execute(C.region, { region: "left" }); input.focus();
  current.router.execute(S.enabled, { id: "sample.a", enabled: false });
  assert.ok(document.activeElement === current.query('[id="page-tab-sample.b"]'));
  current.router.execute(S.enabled, { id: "sample.a", enabled: true });
  assert.ok(current.query("#input-a") === input); assert.equal(input.value, "draft"); assert.equal(mounts, 2);
  const b = current.query("#input-b"); b.focus(); current.router.execute(S.enabled, { id: "sample.b", enabled: false });
  assert.ok(document.activeElement === current.shell.stage);
  current.dispose();
}));

test("real shell tab navigation and grip resizing respect composition and modified keys", () => withTestDocument(() => {
  const current = workspace(); const initial = current.store.read.snapshot();
  const tab = current.query('[id="page-tab-frame.builtin.layout"]');
  press(tab, "ArrowUp", { isComposing: true }); press(tab, "Home", { ctrlKey: true });
  assert.equal(current.store.read.snapshot(), initial);
  press(tab, "ArrowUp"); assert.notEqual(current.store.read.snapshot().currentPage, initial.currentPage);
  current.router.execute(C.begin); const before = current.store.read.snapshot().leftWidth;
  const grip = current.query("#grip-left"); press(grip, "ArrowRight", { keyCode: 229 }); press(grip, "ArrowRight", { ctrlKey: true });
  assert.equal(current.store.read.snapshot().leftWidth, before);
  press(grip, "ArrowRight"); assert.equal(current.store.read.snapshot().leftWidth, before + 4);
  current.dispose();
}));

test("focus recovery restores a visible reparented control and respects deliberate external focus", () => withTestDocument(() => {
  const root = document.createElement("div"), previous = document.createElement("button"), fallback = document.createElement("button");
  root.append(previous, fallback); document.body.append(root); previous.focus();
  const restoreMoved = captureFocusRecovery(root); document.activeElement = document.body; restoreMoved(fallback);
  assert.ok(document.activeElement === previous);
  const restoreRemoved = captureFocusRecovery(root); previous.remove(); document.activeElement = document.body; restoreRemoved(fallback);
  assert.ok(document.activeElement === fallback);
  const external = document.createElement("button"); document.body.append(external);
  const restore = captureFocusRecovery(root); fallback.hidden = true; external.focus(); restore(previous);
  assert.ok(document.activeElement === external);
}));

test("real component Escape consumes the action before the layout fallback", () => withTestDocument(() => {
  let handled = 0;
  const manifest = defineUiPlugin({ namespace: "sample", ui: [{ id: "sample.panel", kind: "panel", title: "panel",
    slots: ["right"], defaultEnabled: true, mount(element) {
      const button = document.createElement("button"); button.id = "local-button"; element.append(button);
      return { handleKeyDown(event) { if (event.key !== "Escape") return false; handled++; return true; } };
    },
  }] });
  const current = workspace({ manifest }); current.router.execute(C.begin);
  assert.equal(press(current.query("#local-button"), "Escape").defaultPrevented, true);
  assert.equal(handled, 1); assert.equal(current.store.read.snapshot().adjusting, true);
  press(current.shell.stage, "Escape"); assert.equal(current.store.read.snapshot().adjusting, false);
  current.dispose();
}));

test("default composition root actually binds the sole keyboard entry and disposes it before shell teardown", async () => withTestDocument(async () => {
  const tracked = [];
  const add = document.addEventListener.bind(document), remove = document.removeEventListener.bind(document);
  document.addEventListener = (name, callback, ...rest) => { if (name === "keydown") tracked.push(callback); return add(name, callback, ...rest); };
  document.removeEventListener = (name, callback, ...rest) => { if (name === "keydown") tracked.splice(tracked.indexOf(callback), 1); return remove(name, callback, ...rest); };
  const { root: documentRoot } = await importPreviewForTest();
  assert.equal(tracked.length, 1);
  const edit = document.getElementById("composer-edit"); edit.click(); assert.equal(document.getElementById("assembly-cancel").hidden, false);
  const stage = document.getElementById("score-stage"); press(stage, "Escape");
  assert.equal(document.getElementById("grip-left").disabled, true);
  const preserved = new Event("pagehide"); Object.defineProperty(preserved, "persisted", { value: true }); window.dispatchEvent(preserved);
  assert.equal(tracked.length, 1); assert.ok(documentRoot.querySelector(".visual-shell"));
  window.dispatchEvent(new Event("pagehide")); assert.equal(tracked.length, 0); assert.equal(documentRoot.querySelector(".visual-shell"), null);
}));
