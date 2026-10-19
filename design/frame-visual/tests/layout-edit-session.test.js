import assert from "node:assert/strict";
import test from "node:test";
import { createWorkspaceState } from "../src/layout/workspace-state.js";
import { createSidebarCompositionState } from "../src/layout/sidebar-composition-state.js";
import { createLayoutEditSession } from "../src/layout/layout-edit-session.js";
import { bindWorkspaceCommands, WORKSPACE_COMMANDS as C } from "../src/host/workspace-commands.js";
import { bindSidebarCommands, SIDEBAR_COMMANDS as S } from "../src/host/sidebar-commands.js";
import { createCommandRouter } from "../src/runtime/command-router.js";
import { createComponentRegistry } from "../src/runtime/component-registry.js";
import { createComponentHost } from "../src/runtime/component-host.js";
import { createMenuRegistry } from "../src/runtime/menu-registry.js";
import { createPluginPlatform } from "../src/runtime/plugin-installer.js";
import { createUiContributionCatalog } from "../src/runtime/ui-contribution-catalog.js";
import { defineUiPlugin } from "../src/runtime/ui-plugin-contract.js";
import { createSidebarPresentation } from "../src/host/sidebar-presentation.js";
import { createVisualWorkbench } from "../src/shell/visual-workbench.js";
import { bindKeyboard } from "../src/host/keyboard.js";
import { withTestDocument } from "./support/dom-test-environment.js";

const geometryKeys = ["leftOpen", "rightOpen", "topOpen", "voiceOpen", "leftWidth", "rightWidth", "topHeight", "voiceHeight", "arrangement"];
const geometry = snapshot => Object.fromEntries(geometryKeys.map(key => [key, snapshot[key]]));
const contributions = ["a", "b", "c"].map((name, order) => ({
  id: "sample." + name, componentId: "sample." + name, kind: "panel", slots: name === "c" ? ["right"] : ["left", "right"],
  defaultSlot: "right", defaultEnabled: true, order,
}));
function runtime({ workspacePort, compositionPort, ...options } = {}) {
  const workspace = createWorkspaceState({ pageIds: ["sample.a", "sample.b", "sample.c"], layoutPageId: "sample.a",
    width: 1440, height: 900, ...options });
  const composition = createSidebarCompositionState({ contributions, onObserverError: options.onObserverError });
  const edit = createLayoutEditSession({ workspace: workspacePort?.(workspace) ?? workspace, composition: compositionPort?.(composition) ?? composition });
  const router = createCommandRouter(), zooms = [];
  const stopWorkspace = bindWorkspaceCommands({ router, store: workspace, editSession: edit, stage: { zoom(value) { zooms.push(value); return { ok: true }; } } });
  const stopSidebar = bindSidebarCommands({ router, editSession: edit });
  return { workspace, composition, edit, router, execute: router.execute, zooms,
    dispose() { edit.dispose(); stopSidebar(); stopWorkspace(); } };
}
function changeAll(current) {
  for (const [id, payload] of [
    [C.resize, { side: "left", value: 300 }], [C.resize, { side: "top", value: 80 }],
    [C.arrange, { mode: "compact" }], [C.configureRegion, { region: "top", open: false }],
    [C.configureRegion, { region: "left", open: true }], [S.move, { id: "sample.a", slot: "left" }],
    [S.enabled, { id: "sample.b", enabled: false }], [S.reorder, { id: "sample.c", index: 0 }],
  ]) assert.equal(current.execute(id, payload).ok, true, id);
}

test("command availability and direct handlers enforce the same edit policy while ordinary actions remain usable", () => {
  const current = runtime(), { workspace, composition, router, execute } = current;
  const before = workspace.read.snapshot(), panels = composition.read.snapshot();
  for (const [id, payload] of [[S.move, { id: "sample.a", slot: "left" }],
    [S.enabled, { id: "sample.a", enabled: false }], [S.reorder, { id: "sample.c", index: 0 }]]) {
    assert.equal(router.describe(id).enabled(), false);
    assert.equal(execute(id, payload).code, "command.disabled");
    assert.equal(router.describe(id).run(payload).code, "layout.edit-required");
  }
  assert.equal(workspace.read.snapshot(), before); assert.equal(composition.read.snapshot(), panels);
  for (const [id, payload] of [[C.resize, { side: "left", value: 300 }], [C.arrange, { mode: "compact" }],
    [C.configureRegion, { region: "left", open: true }], [C.region, { region: "top" }], [C.page, { id: "sample.b", toggle: false }],
    [C.step, { delta: 1 }], [C.zoom, { value: 100 }]]) assert.equal(execute(id, payload).ok, true);
  assert.equal(workspace.read.snapshot().currentPage, "sample.c"); assert.deepEqual(current.zooms, [100]);
  assert.equal(workspace.read.snapshot().adjusting, false); current.dispose();
});

test("begin and finish observers read final command availability rather than a stale session baseline", () => {
  const current = runtime(), observed = [];
  current.workspace.read.subscribe(state => observed.push([state.adjusting, current.router.describe(S.move).enabled()]));
  assert.equal(current.edit.begin().ok, true);
  assert.equal(current.edit.finish(true).ok, true);
  assert.deepEqual(observed, [[true, true], [false, false]]);
  current.dispose();
});

test("repeated begin preserves the component baseline and cancel keeps current workspace use", () => {
  const current = runtime(), originalPanels = current.composition.read.snapshot();
  current.execute(C.begin); changeAll(current);
  assert.deepEqual(current.execute(C.begin), { ok: true, changed: false });
  current.execute(C.page, { id: "sample.b", toggle: false });
  const usedGeometry = geometry(current.workspace.read.snapshot());
  assert.equal(current.execute(C.finish, { confirm: false }).ok, true);
  assert.deepEqual(geometry(current.workspace.read.snapshot()), usedGeometry);
  assert.deepEqual(current.composition.read.snapshot(), originalPanels);
  assert.equal(current.workspace.read.snapshot().currentPage, "sample.b", "navigation is not layout rollback data");
  assert.equal(current.workspace.read.snapshot().adjusting, false); current.dispose();
});

test("confirm retains previews and the next cancel returns to that confirmed baseline", () => {
  const current = runtime(); current.execute(C.begin); changeAll(current);
  current.execute(C.finish, { confirm: true });
  const acceptedPanels = current.composition.read.snapshot();
  current.execute(C.begin); current.execute(C.arrange, { mode: "default" });
  current.execute(S.move, { id: "sample.b", slot: "left" }); current.execute(S.enabled, { id: "sample.c", enabled: false });
  const usedGeometry = geometry(current.workspace.read.snapshot());
  current.execute(C.finish, { confirm: false });
  assert.deepEqual(geometry(current.workspace.read.snapshot()), usedGeometry);
  assert.deepEqual(current.composition.read.snapshot(), acceptedPanels); current.dispose();
});

test("cancel publishes at most once per owner and both observers see the complete restored pair", () => {
  const current = runtime(), expectedPanels = current.composition.read.snapshot();
  current.execute(C.begin); changeAll(current);
  const expectedGeometry = geometry(current.workspace.read.snapshot());
  const events = [], pairs = [];
  for (const [name, owner] of [["workspace", current.workspace], ["composition", current.composition]]) owner.read.subscribe(() => {
    events.push(name);
    pairs.push({ geometry: geometry(current.workspace.read.snapshot()), panels: current.composition.read.snapshot(),
      adjusting: current.workspace.read.snapshot().adjusting });
  });
  current.execute(C.finish, { confirm: false });
  assert.deepEqual(events.sort(), ["composition", "workspace"]);
  assert.deepEqual(pairs, [0, 1].map(() => ({ geometry: expectedGeometry, panels: expectedPanels, adjusting: false })));
  current.dispose();
});

test("failed or throwing restore/finish rolls both owners back without notifications and permits retry", () => {
  for (const method of ["restore", "finishAdjustment"]) for (const throws of [false, true]) {
    let fail = true;
    const wrap = (owner, name) => ({ ...owner, [name](...args) {
      const result = owner[name](...args);
      if (!fail) return result;
      if (throws) throw new Error("injected failure");
      return { ok: false, code: "test.failure" };
    } });
    const current = runtime({ compositionPort: owner => method === "restore" ? wrap(owner, method) : owner,
      workspacePort: owner => method === "finishAdjustment" ? wrap(owner, method) : owner });
    const initialPanels = current.composition.read.snapshot();
    current.execute(C.begin); changeAll(current);
    const before = current.workspace.read.snapshot(), panels = current.composition.read.snapshot();
    let notifications = 0;
    current.workspace.read.subscribe(() => notifications++); current.composition.read.subscribe(() => notifications++);
    if (throws) assert.throws(() => current.edit.finish(false), /injected failure/);
    else assert.equal(current.edit.finish(false).code, "test.failure");
    assert.equal(current.workspace.read.snapshot(), before); assert.equal(current.composition.read.snapshot(), panels);
    assert.equal(notifications, 0); assert.equal(current.edit.canConfigure(), true);
    fail = false; assert.equal(current.edit.finish(false).ok, true);
    assert.deepEqual(geometry(current.workspace.read.snapshot()), geometry(before)); assert.deepEqual(current.composition.read.snapshot(), initialPanels);
    assert.equal(notifications, 2); current.dispose();
  }
});

test("failed begin rolls back mode, navigation and baseline before a successful retry", () => {
  let fail = true;
  const current = runtime({ workspacePort: owner => ({ ...owner, beginAdjustment() {
    const result = owner.beginAdjustment(); return fail ? { ok: false, code: "test.begin" } : result;
  } }) });
  current.execute(C.page, { id: "sample.c", toggle: false });
  const before = current.workspace.read.snapshot(); let notifications = 0;
  current.workspace.read.subscribe(() => notifications++);
  assert.equal(current.edit.begin().code, "test.begin");
  assert.equal(current.workspace.read.snapshot(), before); assert.equal(current.edit.canConfigure(), false); assert.equal(notifications, 0);
  fail = false; current.edit.begin(); assert.equal(current.edit.canConfigure(), true);
  current.edit.finish(false); assert.equal(notifications, 2); current.dispose();
});

test("configuration payload validation remains effective inside the authorized mode", () => {
  const current = runtime(); current.edit.begin();
  const before = current.workspace.read.snapshot(), panels = current.composition.read.snapshot();
  for (const [id, payload, code] of [
    [C.configureRegion, { region: "top", open: "false" }, "workspace.invalid-payload"],
    [C.configureRegion, { region: "__proto__", open: true }, "workspace.invalid-payload"],
    [C.configureRegion, { region: "top", open: true, extra: 1 }, "workspace.invalid-payload"],
    [C.resize, { side: "left", value: Infinity }, "workspace.invalid-payload"],
    [C.arrange, { mode: "invalid" }, "workspace.invalid-payload"],
    [S.move, { id: "sample.c", slot: "left" }, "sidebar.invalid-slot"],
    [S.move, { id: "unknown.panel", slot: "left" }, "sidebar.unknown-panel"],
    [S.enabled, { id: "sample.a", enabled: "false" }, "sidebar.invalid-payload"],
    [S.reorder, { id: "sample.a", index: 99 }, "sidebar.invalid-order"],
  ]) {
    assert.equal(current.execute(id, payload).code, code);
    assert.equal(current.workspace.read.snapshot(), before); assert.equal(current.composition.read.snapshot(), panels);
  }
  current.dispose();
});

test("composition restore rejects missing/foreign identities, expanded slots and invalid orders atomically", () => {
  const owner = createSidebarCompositionState({ contributions }), before = owner.read.snapshot(); let events = 0;
  owner.read.subscribe(() => events++);
  const mutate = callback => { const value = structuredClone(before); callback(value); return value; };
  for (const value of [null, { ...before, extra: true }, mutate(value => value.panels.pop()),
    mutate(value => value.panels[1] = value.panels[0]), mutate(value => value.panels[0].id = "foreign.panel"),
    mutate(value => value.panels[0].componentId = "foreign.component"), mutate(value => value.panels[2].slot = "left"),
    mutate(value => value.panels[0].order = 1), mutate(value => value.panels[0].order = 4),
    mutate(value => value.panels[0].enabled = 1), mutate(value => value.panels[0].extra = true)]) {
    assert.equal(owner.restore(value).code, "sidebar.invalid-snapshot"); assert.equal(owner.read.snapshot(), before);
  }
  assert.equal(events, 0);
  owner.move("sample.a", "left"); owner.setEnabled("sample.b", false);
  assert.equal(owner.restore(before).ok, true); assert.deepEqual(owner.read.snapshot(), before);
  assert.equal(owner.restore(before).changed, false); assert.equal(events, 3);
});

test("nested owner batches restore rejected inner changes and emit only the accepted final snapshot", () => {
  const current = runtime(), snapshots = [];
  current.workspace.read.subscribe(value => snapshots.push(value));
  current.workspace.batch(() => {
    current.workspace.resize("left", 300);
    const accepted = current.workspace.read.snapshot();
    assert.equal(current.workspace.batch(() => { current.workspace.resize("right", 400); return { ok: false }; }).ok, false);
    assert.equal(current.workspace.read.snapshot(), accepted);
    current.workspace.resize("top", 80);
    return { ok: true };
  });
  assert.equal(snapshots.length, 1); assert.equal(snapshots[0].leftWidth, 300); assert.equal(snapshots[0].topHeight, 80);
  const before = current.workspace.read.snapshot();
  assert.throws(() => current.workspace.batch(() => { current.workspace.resize("left", 200); throw new Error("batch failure"); }), /batch failure/);
  assert.equal(current.workspace.read.snapshot(), before); assert.equal(snapshots.length, 1); current.dispose();
});

test("both owners reject thenable batches and retain their exact pre-operation snapshots", async () => {
  const current = runtime();
  for (const [owner, change] of [[current.workspace, () => current.workspace.resize("left", 300)],
    [current.composition, () => current.composition.move("sample.a", "left")]]) {
    const before = owner.read.snapshot(); let events = 0; owner.read.subscribe(() => events++);
    assert.throws(() => owner.batch(() => { change(); return Promise.reject(new Error("async not supported")); }), /同步/);
    assert.equal(owner.read.snapshot(), before); assert.equal(events, 0);
  }
  await Promise.resolve(); current.dispose();
});

test("observer exceptions do not roll back a completed cancel or block later observers", () => {
  const errors = [], current = runtime({ onObserverError: error => errors.push(error.message) });
  current.edit.begin(); changeAll(current); let observed = 0;
  for (const owner of [current.workspace, current.composition]) {
    owner.read.subscribe(() => { throw new Error("observer"); }); owner.read.subscribe(() => observed++);
  }
  assert.equal(current.edit.finish(false).ok, true); assert.equal(observed, 2); assert.deepEqual(errors, ["observer", "observer"]);
  assert.equal(current.workspace.read.snapshot().adjusting, false); assert.equal(current.edit.canConfigure(), false); current.dispose();
});

test("workspace reentrant notifications retain snapshot order and edit commands reject reentrant writes", () => {
  const current = runtime(), a = [], b = [];
  const stopA = current.workspace.read.subscribe(state => { a.push(state.leftOpen); if (state.leftOpen) current.workspace.toggleRegion("left"); });
  const stopB = current.workspace.read.subscribe(state => b.push(state.leftOpen));
  current.workspace.toggleRegion("left"); assert.deepEqual(a, [true, false]); assert.deepEqual(b, a); stopA(); stopB();
  const attempts = [];
  current.workspace.read.subscribe(() => attempts.push(current.router.describe(C.resize).run({ side: "left", value: 360 }).code));
  current.edit.begin(); current.edit.resize("left", 300); current.edit.finish(false);
  assert.deepEqual(attempts, ["layout.busy", "layout.busy", "layout.busy"]); current.dispose();
});

test("component cancel preserves the current constrained workspace and never restores the old window", () => {
  const current = runtime(); current.edit.begin(); current.edit.resize("left", 360); current.edit.finish(true);
  current.edit.begin(); current.edit.resize("right", 400); current.workspace.setViewport(640, 480);
  const used = current.workspace.read.snapshot();
  current.edit.finish(false);
  assert.deepEqual(geometry(current.workspace.read.snapshot()), geometry(used));
  assert.deepEqual(current.workspace.read.snapshot().limits, used.limits);
  assert.equal(current.workspace.setViewport(640, 480).changed, false); current.dispose();
});

test("uncoordinated raw mode and replacement composition owners cannot silently replace a session baseline", () => {
  const current = runtime(); current.workspace.beginAdjustment();
  assert.equal(current.edit.begin().code, "layout.edit-desynchronized"); assert.equal(current.edit.move("sample.a", "left").code, "layout.edit-desynchronized");
  assert.equal(current.edit.resize("left", 300).ok, true, "workspace use does not require a component baseline");
  current.workspace.finishAdjustment(false);
  let owner = current.composition;
  const edit = createLayoutEditSession({ workspace: current.workspace, composition: () => owner });
  edit.begin(); owner = createSidebarCompositionState({ contributions });
  assert.equal(edit.canConfigure(), false); assert.equal(edit.finish(false).code, "layout.edit-desynchronized");
  owner = current.composition; assert.equal(edit.finish(false).ok, true); edit.dispose(); current.dispose();
});

test("dispose cancels an active session, is idempotent and preserves failed cleanup for retry", () => {
  let fail = true;
  const current = runtime({ compositionPort: owner => ({ ...owner, restore(value) {
    const result = owner.restore(value); return fail ? { ok: false, code: "test.cleanup" } : result;
  } }) });
  const before = current.composition.read.snapshot(); current.edit.begin(); current.edit.move("sample.a", "left");
  assert.equal(current.edit.dispose().code, "test.cleanup"); assert.equal(current.edit.canConfigure(), true);
  fail = false; assert.equal(current.edit.dispose().ok, true);
  assert.deepEqual(current.composition.read.snapshot(), before); assert.equal(current.workspace.read.snapshot().adjusting, false);
  assert.equal(current.edit.dispose().changed, false); assert.equal(current.edit.begin().code, "layout.disposed"); current.dispose();
});

test("geometry-only legacy binders own their session and sidebar binders require an explicit shared session", () => {
  const workspace = createWorkspaceState({ pageIds: ["sample.a"], layoutPageId: "sample.a", width: 1440 }), router = createCommandRouter();
  assert.throws(() => bindSidebarCommands({ router, composition: {} }), /共享/);
  const stop = bindWorkspaceCommands({ router, store: workspace, stage: {} });
  router.execute(C.begin); router.execute(C.resize, { side: "left", value: 300 }); stop(); stop();
  assert.equal(workspace.read.snapshot().adjusting, false); assert.equal(workspace.read.snapshot().leftWidth, 300);
  assert.equal(router.describe(C.resize), null);
});

function press(target, key) {
  const event = new Event("keydown", { bubbles: true, cancelable: true });
  for (const [name, value] of Object.entries({ key, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false })) Object.defineProperty(event, name, { value });
  target.dispatchEvent(event); return event;
}

test("component permissions and actual local/global shortcut dispatch cannot bypass the layout policy", () => withTestDocument(() => {
  const current = runtime(), registry = createComponentRegistry(), contexts = {}, notices = [];
  const host = createComponentHost({ registry, router: current.router, notices: { push: notice => notices.push(notice) } });
  const root = document.createElement("div"); document.body.append(root);
  for (const [id, permissions] of [["sample.allowed", [S.move, C.begin]], ["sample.denied", []]]) {
    registry.register("sample", { id, title: id, role: "tool", slots: ["left"], permissions: { commands: permissions },
      mount(element, ctx) { contexts[id] = ctx; element.append(document.createElement("button")); } });
    root.append(host.ensure(id, "panel"));
    current.router.shortcuts.register("sample", { id: id + ".key", command: S.move, keys: ["M"], scope: "component", componentId: id });
  }
  current.router.shortcuts.register("host", { id: "host.move-key", command: S.move, keys: ["M"] });
  const stop = bindKeyboard(current.router, { root, components: host, isMac: false });
  const before = current.composition.read.snapshot(), allowed = host.ensure("sample.allowed", "panel").querySelector("button");
  assert.equal(contexts["sample.allowed"].execute(S.move, { id: "sample.a", slot: "left" }).code, "command.disabled");
  assert.equal(press(allowed, "m").defaultPrevented, true);
  const chrome = document.createElement("button"); root.append(chrome);
  assert.equal(press(chrome, "m").defaultPrevented, false);
  assert.equal(current.composition.read.snapshot(), before);
  assert.equal(contexts["sample.allowed"].execute(C.begin).ok, true);
  assert.equal(contexts["sample.denied"].execute(S.move, { id: "sample.a", slot: "left" }).code, "permission.denied");
  const denied = host.ensure("sample.denied", "panel").querySelector("button");
  press(denied, "m"); assert.equal(current.composition.read.snapshot(), before);
  assert.equal(contexts["sample.allowed"].execute(S.move, { id: "sample.a", slot: "left" }).ok, true);
  assert.deepEqual(Object.keys(contexts["sample.allowed"]).sort(), ["execute", "notify", "onDispose"]);
  stop(); host.dispose(); current.dispose();
}));

test("real presentation cancellation preserves cells, input, reading position and business state without document writes", () => withTestDocument(() => {
  const current = runtime(), registry = createComponentRegistry(), business = { selected: "keep" }; let mounts = 0, writes = 0;
  current.router.register("score", { id: "score.edit", run: () => writes++ });
  const manifest = defineUiPlugin({ namespace: "sample", ui: contributions.map(({ componentId: _componentId, ...item }) => ({
    ...item, title: item.id, mount(element) {
      mounts++; const input = document.createElement("input"); input.id = "input-" + item.id.split(".")[1]; element.append(input); element.business = business;
    },
  })) });
  // Author declarations do not carry the catalog-only componentId field.
  const platform = createPluginPlatform({ router: current.router, components: registry, menus: createMenuRegistry([]) });
  platform.register(manifest); assert.equal(platform.start()[0].status, "active");
  const catalog = createUiContributionCatalog({ platform, components: registry });
  const host = createComponentHost({ registry, router: current.router, notices: { push() {} } });
  const sidebar = createSidebarPresentation({ catalog, composition: current.composition.read, components: host });
  const root = document.createElement("div"); document.body.append(root);
  const shell = createVisualWorkbench({ root, panels: catalog.list({ kind: "panel", slot: "right" }), layout: current.workspace.read, router: current.router, sidebar });
  shell.render(current.workspace.read.snapshot());
  const stops = [current.workspace.read.subscribe(state => shell.render(state)), current.composition.read.subscribe(snapshot => shell.render(current.workspace.read.snapshot(), snapshot))];
  const input = root.querySelector("#input-a"), cell = input.parentNode; input.value = "draft"; cell.scrollTop = 64;
  current.edit.begin(); current.edit.configureRegion("left", true); current.edit.move("sample.a", "left");
  current.edit.setEnabled("sample.a", false); input.value = "edited during layout"; business.selected = "new selection";
  current.edit.finish(false);
  assert.equal(root.querySelector("#input-a"), input); assert.equal(input.parentNode, cell); assert.equal(cell.parentNode, root.querySelector(".v-page"));
  assert.equal(input.value, "edited during layout"); assert.equal(cell.scrollTop, 64); assert.equal(cell.business.selected, "new selection"); assert.equal(writes, 0);
  assert.equal(mounts, 2, "a mounted once and fallback b mounted once");
  stops.forEach(stop => stop()); shell.dispose(); host.dispose(); platform.dispose(); current.dispose();
}));

test("real shell can close the top during editing and finish from the layout page without reopening it", async () => {
  await withTestDocument(async () => {
    const root = document.createElement("div"); root.id = "app"; document.body.append(root);
    await import("../src/runtime-preview.js?layout-edit-session-test");
    const query = selector => root.querySelector(selector), top = query(".v-top");
    // Use the actual permitted layout page controls, not raw state writes.
    query("#composer-edit").click(); query("#layout-top").click();
    assert.equal(top.hidden, true); assert.equal(query("#layout-top").getAttribute("aria-pressed"), "false");
    query("#layout-confirm").click(); assert.equal(top.hidden, true);
    query("#composer-edit").click(); assert.equal(top.hidden, true);
    assert.equal(query("#layout-top").getAttribute("aria-pressed"), "false");
    query("#layout-top").click(); query("#layout-cancel").click(); assert.equal(top.hidden, false);
    query("#composer-edit").click(); query("#layout-top").click(); query("#layout-confirm").click(); assert.equal(top.hidden, true);
    const persisted = new Event("pagehide"); Object.defineProperty(persisted, "persisted", { value: true }); window.dispatchEvent(persisted);
    assert.equal(root.children.length, 1);
    query("#composer-edit").click(); window.dispatchEvent(new Event("pagehide")); assert.equal(root.children.length, 0);
  });
});

test("actual preview exposes all four ordinary regions through view menus and keyboard/pointer sizing without starting editing", () => withTestDocument(async () => {
  const root = document.createElement("div"); root.id = "app"; document.body.append(root);
  await import("../src/runtime-preview.js?ordinary-sidebar-use-test");
  const query = selector => root.querySelector(selector);
  const panels = { top: ".v-top", left: ".v-left", right: ".v-right", voice: ".v-voice-content" };
  const names = { top: "上侧栏", left: "左侧栏", right: "右侧栏", voice: "下侧栏" };
  const toggle = side => {
    query("#menu-view").click();
    const item = document.body.querySelector(".v-menu-list").querySelectorAll(".v-menu-item")
      .find(row => row.querySelector(".v-menu-label").textContent === names[side]);
    assert.ok(item, names[side]); assert.equal(item.getAttribute("role"), "menuitemcheckbox"); item.click();
  };
  for (const side of Object.keys(panels)) {
    const panel = query(panels[side]), grip = query("#grip-" + side);
    assert.equal(query("#region-" + side), null, "no duplicate command-bar switch");
    const hidden = panel.hidden; toggle(side); assert.equal(panel.hidden, !hidden);
    toggle(side); assert.equal(panel.hidden, hidden);
    if (panel.hidden) toggle(side);
    assert.equal(grip.disabled, false); assert.equal(query("#layout-size-" + side).disabled, false);
    const before = Number(grip.getAttribute("aria-valuenow"));
    press(grip, { left: "ArrowRight", right: "ArrowLeft", top: "ArrowDown", voice: "ArrowUp" }[side]);
    assert.equal(Number(grip.getAttribute("aria-valuenow")), before + 4);
    assert.equal(query("#layout-session").hidden, true);
  }
  const grip = query("#grip-left"); let captured = false;
  grip.setPointerCapture = () => { captured = true; };
  grip.hasPointerCapture = () => captured;
  grip.releasePointerCapture = () => { captured = false; };
  const pointer = (name, x) => {
    const event = new Event(name);
    for (const [key, value] of Object.entries({ button: name === "pointermove" ? -1 : 0, buttons: name === "pointerup" ? 0 : 1, pointerId: 1, clientX: x, clientY: 0 })) Object.defineProperty(event, key, { value });
    grip.dispatchEvent(event);
  };
  const before = Number(grip.getAttribute("aria-valuenow"));
  pointer("pointerdown", 100); pointer("pointermove", 116); pointer("pointerup", 116);
  assert.equal(Number(grip.getAttribute("aria-valuenow")), before + 16); assert.equal(captured, false);
  query("#composer-edit").click();
  for (const side of Object.keys(panels)) {
    const hidden = query(panels[side]).hidden;
    toggle(side); assert.equal(query(panels[side]).hidden, !hidden);
    toggle(side); assert.equal(query(panels[side]).hidden, hidden);
  }
  assert.equal(query("#layout-session").textContent, "编辑中 · 未修改");
  query("#layout-cancel").click(); assert.equal(Number(grip.getAttribute("aria-valuenow")), before + 16);
  window.dispatchEvent(new Event("pagehide"));
}));
