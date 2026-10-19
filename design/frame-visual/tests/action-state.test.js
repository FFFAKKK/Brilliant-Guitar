import { importPreviewForTest } from "./support/workspace-runtime-test.js";
import test from "node:test";
import assert from "node:assert/strict";
import { createCommandRouter } from "../src/runtime/command-router.js";
import { createComponentRegistry } from "../src/runtime/component-registry.js";
import { createComponentHost } from "../src/runtime/component-host.js";
import { createMenuRegistry } from "../src/runtime/menu-registry.js";
import { createPluginPlatform } from "../src/runtime/plugin-installer.js";
import { createUiContributionCatalog } from "../src/runtime/ui-contribution-catalog.js";
import { createWorkspaceState } from "../src/layout/workspace-state.js";
import { createSidebarCompositionState } from "../src/layout/sidebar-composition-state.js";
import { createLayoutEditSession } from "../src/layout/layout-edit-session.js";
import { createSidebarContentReadPort } from "../src/host/sidebar-content-read-port.js";
import { createActionStateReadPort } from "../src/host/action-state-read-port.js";
import { bindSidebarCommands, SIDEBAR_COMMANDS as S } from "../src/host/sidebar-commands.js";
import { bindWorkspaceCommands, WORKSPACE_COMMANDS as C } from "../src/host/workspace-commands.js";
import { createBuiltinPages, LAYOUT_PAGE_ID } from "../src/features/builtin-pages.js";
import { LAYOUT_PAGE_ID as RUNTIME_LAYOUT_PAGE_ID } from "../src/features/workspace-layout-plugin.js";
import { actionState, applyActionPresentation } from "../src/shell/action-presentation.js";
import { withTestDocument } from "./support/dom-test-environment.js";

const noRun = () => assert.fail("state reads must not execute commands");
function source() {
  const listeners = new Set();
  return { subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    publish() { for (const listener of [...listeners]) listener(); }, size: () => listeners.size };
}
function start({ denied = [], failActions = false } = {}) {
  const router = createCommandRouter(), registry = createComponentRegistry(), calls = [], notices = [];
  const subscriptions = { workspace: 0, content: 0, action: 0, router: 0, composition: 0 };
  const track = (key, subscribe, listener) => {
    const stop = subscribe(listener); subscriptions[key]++;
    let active = true;
    return () => { if (active) { active = false; subscriptions[key]--; stop(); } };
  };
  let workspace, content, actionPort, composition;
  const layout = { snapshot: () => workspace.read.snapshot(), subscribe: listener => track("workspace", workspace.read.subscribe, listener) };
  const contents = { snapshot: () => content.snapshot(), subscribe: listener => track("content", content.subscribe, listener) };
  const actions = { snapshot: () => actionPort.snapshot(), subscribe(listener) {
    if (failActions) throw new Error("injected action subscription failure");
    return track("action", actionPort.subscribe, listener);
  } };
  const builtin = createBuiltinPages(layout, contents, actions, { includeLayout: true }), definition = builtin.components.find(item => item.id === LAYOUT_PAGE_ID);
  definition.permissions.commands = definition.permissions.commands.filter(id => !denied.includes(id));
  const mount = definition.mount;
  definition.mount = (element, ctx) => mount(element, { ...ctx, execute(id, payload) {
    calls.push([id, payload]); return ctx.execute(id, payload);
  } });
  workspace = createWorkspaceState({ pageIds: builtin.components.map(item => item.id), layoutPageId: LAYOUT_PAGE_ID,
    width: innerWidth, height: innerHeight });
  const reservedPanelIds = [LAYOUT_PAGE_ID];
  const edit = createLayoutEditSession({ workspace, composition: () => composition, reservedPanelIds });
  const stopWorkspace = bindWorkspaceCommands({ router, store: workspace, editSession: edit, stage: { zoom() {} } });
  let stopSidebar = bindSidebarCommands({ router, editSession: edit });
  const platform = createPluginPlatform({ router, components: registry, menus: createMenuRegistry([]) });
  platform.register(builtin); assert.ok(platform.start().every(item => item.status === "active"));
  const catalog = createUiContributionCatalog({ platform, components: registry });
  composition = createSidebarCompositionState({ contributions: catalog.list() });
  const originalComposition = composition;
  content = createSidebarContentReadPort({ catalog, composition: composition.read, changes: edit.changes, reservedPanelIds });
  const registered = registry.get(LAYOUT_PAGE_ID);
  actionPort = createActionStateReadPort({ router: { ...router, subscribe: listener => track("router", router.subscribe, listener) },
    commands: registered.permissions.commands, context: { componentId: registered.id, owner: registered.owner },
    sources: [layout, { subscribe: listener => track("composition", originalComposition.read.subscribe, listener) }] });
  const host = createComponentHost({ registry, router, notices: { push: notice => notices.push(notice) } });
  const root = host.ensure(LAYOUT_PAGE_ID, "inspector"); document.body.append(root);
  const query = selector => root.querySelector(selector);
  return { router, workspace, composition: originalComposition, edit, actions, actionPort, calls, notices, subscriptions, root, host, query,
    choose(id) { const select = query("#layout-content-choice"); select.value = id; select.dispatchEvent(new Event("change")); },
    replaceOwner() { composition = createSidebarCompositionState({ contributions: catalog.list() }); router.refresh(); },
    removeSidebarCommands() { stopSidebar(); },
    restoreSidebarCommands() { stopSidebar = bindSidebarCommands({ router, editSession: edit }); },
    dispose() { host.dispose(); composition = originalComposition; edit.dispose(); platform.dispose(); stopSidebar(); stopWorkspace(); root.remove(); },
  };
}
const withRuntime = (run, options) => withTestDocument(async () => {
  const runtime = start(options);
  try { return await run(runtime); } finally { runtime.dispose(); }
});

test("the action port copies the command whitelist and returns frozen data without handlers or write methods", () => {
  const router = createCommandRouter(), commands = ["example.one", "example.one", "example.absent"];
  router.register("example", { id: "example.one", enabled() { return this.owner === "example"; }, checked() { return true; }, keys: ["Mod+A"], run: noRun });
  router.register("other", { id: "other.secret", run: noRun });
  const port = createActionStateReadPort({ router, commands }); commands.push("other.secret");
  assert.deepEqual(Object.keys(port).sort(), ["snapshot", "subscribe"]);
  const snapshot = port.snapshot();
  assert.deepEqual(snapshot.actions.map(item => item.id), ["example.one", "example.absent"]);
  assert.deepEqual(Object.keys(snapshot.actions[0]).sort(), ["checked", "enabled", "exists", "id", "keys", "reason"]);
  assert.equal(snapshot.actions[0].enabled, true); assert.equal(snapshot.actions[0].checked, true);
  assert.deepEqual(snapshot.actions[1], { id: "example.absent", exists: false, enabled: false, checked: null, keys: [], reason: "command.missing" });
  assert.throws(() => snapshot.actions.push({}), TypeError);
  assert.throws(() => snapshot.actions[0].keys.push("Alt+B"), TypeError);
  assert.throws(() => { snapshot.actions[0].enabled = false; }, TypeError);
  assert.equal(Object.isFrozen(port) && Object.isFrozen(snapshot), true);
  assert.equal(actionState(snapshot, "other.secret").reason, "permission.denied");
  assert.equal(actionState(null, "other.secret"), null, "no port retains the old standalone behavior");
});

test("key hints copy the actual component context and exclude other owners, components and score-only bindings", () => {
  const router = createCommandRouter(), id = "example.action";
  router.register("example", { id, keys: ["Mod+A"], run: noRun });
  for (const [binding, owner, componentId, scope, keys] of [
    ["example.local", "example", "example.panel", "component", ["Alt+L"]],
    ["other.owner", "other", "example.panel", "component", ["Alt+O"]],
    ["example.other", "example", "example.other", "component", ["Alt+P"]],
    ["example.score", "example", "example.panel", "score", ["Alt+S"]],
  ]) router.shortcuts.register(owner, { id: binding, command: id, componentId, scope, keys });
  const context = { componentId: "example.panel", owner: "example", score: false };
  const port = createActionStateReadPort({ router, commands: [id], context });
  context.owner = "other"; context.score = true;
  assert.deepEqual(port.snapshot().actions[0].keys, ["Mod+A", "Alt+L"]);
  const score = createActionStateReadPort({ router, commands: [id], context: { componentId: "example.panel", owner: "example", score: true } });
  assert.deepEqual(score.snapshot().actions[0].keys, ["Mod+A", "Alt+L", "Alt+S"]);
});

test("router refresh, checked changes and source notifications re-read current state without a cache", () => {
  const router = createCommandRouter(), owner = source(), updates = [];
  let enabled = true, checked = false;
  router.register("example", { id: "example.action", enabled: () => enabled, checked: () => checked, run: noRun });
  const port = createActionStateReadPort({ router, commands: ["example.action"], sources: [owner] });
  const stop = port.subscribe(snapshot => updates.push(snapshot.actions[0]));
  enabled = false; checked = true;
  assert.equal(port.snapshot().actions[0].enabled, false); assert.deepEqual(updates, [], "closure mutation needs an owner notification");
  router.refresh(); assert.deepEqual(updates.map(item => [item.enabled, item.checked, item.reason]), [[false, true, "command.disabled"]]);
  enabled = true; owner.publish(); assert.equal(updates[1].enabled, true);
  stop(); stop(); owner.publish(); router.refresh();
  assert.equal(updates.length, 2); assert.equal(owner.size(), 0);
});

test("remap, clear, restore and release propagate the one shortcut directory's effective keys", () => {
  const router = createCommandRouter(), updates = [], id = "example.action";
  const release = router.register("example", { id, keys: ["Mod+A"], run: noRun });
  const port = createActionStateReadPort({ router, commands: [id] });
  const stop = port.subscribe(snapshot => updates.push(snapshot.actions[0]));
  assert.equal(router.shortcuts.setKeys(id, ["Alt+Z"]).ok, true); assert.deepEqual(updates.at(-1).keys, ["Alt+Z"]);
  router.shortcuts.setKeys(id, []); assert.deepEqual(updates.at(-1).keys, []);
  router.shortcuts.reset(id); assert.deepEqual(updates.at(-1).keys, ["Mod+A"]);
  release(); assert.equal(updates.at(-1).exists, false); assert.deepEqual(updates.at(-1).keys, []);
  const replace = router.register("example", { id, run: noRun }); assert.equal(updates.at(-1).enabled, true);
  replace(); stop();
});

for (const [name, hooks] of [
  ["throwing enabled", { enabled() { throw new Error("state failure"); } }],
  ["non-boolean enabled", { enabled: () => "yes" }],
  ["async enabled", { enabled: () => Promise.reject(new Error("async failure")) }],
  ["throwing checked", { checked() { throw new Error("state failure"); } }],
  ["non-boolean checked", { checked: () => 1 }],
  ["async checked", { checked: () => Promise.reject(new Error("async failure")) }],
]) test(`${name} disables only its action and drains async rejection`, async () => {
  const router = createCommandRouter();
  router.register("example", { id: "example.bad", ...hooks, run: noRun });
  router.register("example", { id: "example.good", run: noRun });
  const port = createActionStateReadPort({ router, commands: ["example.bad", "example.good"] });
  const [bad, good] = port.snapshot().actions;
  assert.deepEqual(bad, { id: "example.bad", exists: true, enabled: false, checked: null, keys: [], reason: "command.state-error" });
  assert.equal(good.enabled, true); assert.equal(good.checked, null);
  await new Promise(resolve => setImmediate(resolve));
});

test("observer failures are isolated and subscriptions release in reverse order exactly once", () => {
  const router = createCommandRouter(), first = source(), second = source(), releases = [], errors = [];
  router.register("example", { id: "example.action", run: noRun });
  const tracked = (owner, name) => ({ ...owner, subscribe(listener) {
    const stop = owner.subscribe(listener); return () => { releases.push(name); stop(); };
  } });
  const port = createActionStateReadPort({ router: tracked(router, "router"), commands: ["example.action"],
    sources: [tracked(first, "first"), tracked(second, "second")], onObserverError(error) { errors.push(error.message); throw new Error("diagnostic failure"); } });
  const stopBad = port.subscribe(() => { throw new Error("observer failure"); });
  let reads = 0; const stopGood = port.subscribe(() => reads++);
  first.publish(); assert.equal(reads, 1); assert.deepEqual(errors, ["observer failure"]);
  stopBad(); stopBad(); assert.deepEqual(releases, ["second", "first", "router"]);
  second.publish(); assert.equal(reads, 2);
  stopGood(); assert.equal(first.size() + second.size(), 0);
});

test("failed subscription rolls back earlier resources and cleanup failure does not skip later cleanup", () => {
  const router = createCommandRouter(), first = source(), releases = [];
  const trackedRouter = { ...router, subscribe(listener) { const stop = router.subscribe(listener); return () => { releases.push("router"); stop(); }; } };
  const trackedSource = { subscribe(listener) { const stop = first.subscribe(listener); return () => { releases.push("first"); stop(); throw new Error("cleanup failure"); }; } };
  const port = createActionStateReadPort({ router: trackedRouter, commands: [], sources: [trackedSource, { subscribe() { throw new Error("subscribe failure"); } }] });
  assert.throws(() => port.subscribe(() => {}), error => error instanceof AggregateError && error.errors.map(item => item.message).join() === "subscribe failure,cleanup failure");
  assert.deepEqual(releases, ["first", "router"]); assert.equal(first.size(), 0);
  assert.throws(() => port.subscribe(null), /必须是函数/);
  assert.throws(() => createActionStateReadPort({ router, commands: [1] }), /需要命令名单/);
  assert.throws(() => createActionStateReadPort({ router, commands: [], sources: [{}] }), /需要命令名单/);
});

test("presentation combines command state with local restrictions and updates checked, tooltip and ARIA without replacing nodes", () => withTestDocument(() => {
  const router = createCommandRouter(); let enabled = true, checked = true;
  router.register("example", { id: "example.action", keys: ["Mod+A"], enabled: () => enabled, checked: () => checked, run: noRun });
  const port = createActionStateReadPort({ router, commands: ["example.action"] }), button = document.createElement("button");
  button.setAttribute("data-tooltip", "previous"); document.body.append(button); button.focus();
  applyActionPresentation(button, port.snapshot(), "example.action", { hint: "执行操作", checkedAttribute: "aria-pressed" });
  assert.equal(button.disabled, false); assert.equal(button.getAttribute("aria-pressed"), "true");
  assert.match(button.title, /执行操作 · (Ctrl|⌘)\+A/); assert.match(button.getAttribute("aria-keyshortcuts"), /^(Control|Meta)\+A$/);
  assert.equal(button.getAttribute("data-tooltip"), button.title);
  checked = false; enabled = false; router.shortcuts.setKeys("example.action", ["Alt+Z"]);
  applyActionPresentation(button, port.snapshot(), "example.action", { checkedAttribute: "aria-pressed" });
  assert.equal(button.disabled, true); assert.equal(button.getAttribute("aria-pressed"), "false");
  assert.equal(button.title, "该操作当前不可用。 · Alt+Z"); assert.equal(button.getAttribute("aria-keyshortcuts"), "Alt+Z");
  enabled = true; router.shortcuts.setKeys("example.action", []);
  applyActionPresentation(button, port.snapshot(), "example.action", { disabled: true, hint: "已到边界" });
  assert.equal(button.disabled, true); assert.equal(button.title, "已到边界"); assert.equal(button.getAttribute("aria-keyshortcuts"), null);
  applyActionPresentation(button, port.snapshot(), "unauthorized.action", { checkedAttribute: "aria-pressed" });
  assert.match(button.title, /没有.*权限/); assert.equal(button.getAttribute("aria-pressed"), null);
  button.setAttribute("aria-pressed", "legacy"); button.title = "legacy hint";
  applyActionPresentation(button, null, "example.action");
  assert.equal(button.title, "legacy hint"); assert.equal(button.getAttribute("aria-pressed"), "legacy");
  assert.equal(document.activeElement, button);
}));

test("actual component permissions disable configuration controls before execution", () => withRuntime(current => {
  current.query("#composer-edit").click(); current.choose("frame.builtin.assistant");
  const toggle = current.query("#layout-content-toggle"), before = current.composition.read.snapshot(), calls = current.calls.length;
  assert.equal(toggle.disabled, true); assert.match(toggle.title, /没有.*权限/);
  toggle.click(); toggle.dispatchEvent(new Event("click"));
  assert.equal(current.calls.length, calls); assert.equal(current.composition.read.snapshot(), before);
  assert.match(current.query("#layout-content-feedback").textContent, /没有.*权限/);
  assert.deepEqual(current.actionPort.snapshot().actions.filter(action => Object.values(S).includes(action.id)), []);
}, { denied: Object.values(S) }));

test("an editing flag without the matching session disables component actions while everyday geometry remains usable", () => withRuntime(current => {
  current.query("#composer-edit").click(); current.choose("frame.builtin.assistant");
  assert.equal(current.query("#layout-content-toggle").disabled, false);
  current.replaceOwner();
  assert.equal(current.workspace.read.snapshot().adjusting, true); assert.equal(current.edit.canConfigure(), false);
  assert.equal(current.query("#layout-content-toggle").disabled, true);
  assert.match(current.query("#layout-content-help").textContent, /操作当前不可用/);
  const open = current.workspace.read.snapshot().leftOpen;
  current.query("#layout-left").click(); assert.equal(current.workspace.read.snapshot().leftOpen, !open);
  assert.equal(current.query("#layout-size-right").disabled, false);
}));

test("removed command notifications disable controls; re-registration restores the same selection and input nodes", () => withRuntime(current => {
  current.query("#composer-edit").click(); current.choose("frame.builtin.assistant");
  const toggle = current.query("#layout-content-toggle"), select = current.query("#layout-content-choice");
  const input = current.query("#layout-size-right"); input.focus(); input.value = "241";
  current.removeSidebarCommands();
  assert.equal(toggle.disabled, true); assert.match(toggle.title, /操作当前不可用/);
  assert.equal(current.actionPort.snapshot().actions.find(item => item.id === S.enabled).exists, false);
  current.restoreSidebarCommands();
  assert.equal(toggle.disabled, false); assert.equal(current.query("#layout-content-toggle"), toggle);
  assert.equal(current.query("#layout-content-choice"), select); assert.equal(select.value, "frame.builtin.assistant");
  assert.equal(current.query("#layout-size-right"), input); assert.equal(input.value, "241"); assert.equal(document.activeElement, input);
}));

test("layout buttons display effective component shortcuts and update in place when remapped or cleared", () => withRuntime(current => {
  current.query("#composer-edit").click(); current.choose("frame.builtin.assistant");
  const toggle = current.query("#layout-content-toggle"), binding = "frame.builtin.toggle-content";
  const stop = current.router.shortcuts.register("frame.builtin", { id: binding, command: S.enabled,
    scope: "component", componentId: LAYOUT_PAGE_ID, keys: ["Mod+I"] });
  assert.match(toggle.title, /(Ctrl|⌘)\+I/); assert.match(toggle.getAttribute("aria-keyshortcuts"), /^(Control|Meta)\+I$/);
  current.router.shortcuts.setKeys(binding, ["Alt+I"]); assert.equal(toggle.getAttribute("aria-keyshortcuts"), "Alt+I");
  current.router.shortcuts.setKeys(binding, []); assert.equal(toggle.getAttribute("aria-keyshortcuts"), null);
  current.router.shortcuts.reset(binding); assert.match(toggle.title, /(Ctrl|⌘)\+I/);
  stop(); assert.equal(toggle.getAttribute("aria-keyshortcuts"), null); assert.equal(current.query("#layout-content-toggle"), toggle);
}));

test("a stale enabled display is re-read before clicking and a valid click executes its restricted command exactly once", () => withRuntime(current => {
  current.removeSidebarCommands(); let enabled = true;
  const stop = current.router.register("frame.sidebar", { id: S.enabled, enabled: () => enabled, run: payload => current.edit.setEnabled(payload.id, payload.enabled) });
  current.query("#composer-edit").click(); current.choose("frame.builtin.assistant");
  const toggle = current.query("#layout-content-toggle"), before = current.composition.read.snapshot(), calls = current.calls.length;
  assert.equal(toggle.disabled, false); enabled = false; toggle.click();
  assert.equal(current.calls.length, calls); assert.equal(current.composition.read.snapshot(), before); assert.equal(toggle.disabled, true);
  assert.match(current.query("#layout-content-feedback").textContent, /操作当前不可用/);
  assert.doesNotMatch(current.query("#layout-content-feedback").textContent, /先进入/);
  enabled = true; current.router.refresh(); toggle.click();
  assert.deepEqual(current.calls.slice(calls), [[S.enabled, { id: "frame.builtin.assistant", enabled: false }]]);
  assert.equal(current.composition.read.snapshot().panels.find(panel => panel.id === "frame.builtin.assistant").enabled, false);
  stop();
}));

test("workspace callbacks also re-read state before invoking the existing restricted context", () => withRuntime(current => {
  const allowed = current.actionPort.snapshot().actions.map(item => item.id).filter(id => id !== C.region);
  const snapshot = current.actions.snapshot;
  // Simulate a narrower live read port between render and click; ctx remains the real authority.
  current.actions.snapshot = () => ({ actions: snapshot().actions.filter(item => allowed.includes(item.id)) });
  const open = current.workspace.read.snapshot().leftOpen, calls = current.calls.length;
  current.query("#layout-left").click();
  assert.equal(current.workspace.read.snapshot().leftOpen, open); assert.equal(current.calls.length, calls);
  assert.equal(current.query("#layout-left").disabled, true);
  current.actions.snapshot = snapshot; current.router.refresh(); current.query("#layout-left").click();
  assert.deepEqual(current.calls.slice(calls), [[C.region, { region: "left" }]]);
}));

test("mount failure and repeated component release dispose every acquired action and owner subscription", () => withRuntime(current => {
  assert.match(current.query(".component-fault").textContent, /加载失败/);
  assert.equal(Object.values(current.subscriptions).every(value => value === 0), true);
  assert.ok(current.notices.some(notice => /action subscription failure/.test(notice.text)));
}, { failActions: true }));

test("normal component release stops reactive updates and is safe to repeat", () => withRuntime(current => {
  assert.ok(Object.values(current.subscriptions).every(value => value > 0));
  const toggle = current.query("#layout-content-toggle");
  current.query("#composer-edit").click(); current.choose("frame.builtin.assistant");
  current.host.release(LAYOUT_PAGE_ID); current.host.release(LAYOUT_PAGE_ID);
  assert.equal(Object.values(current.subscriptions).every(value => value === 0), true);
  current.removeSidebarCommands(); current.workspace.toggleRegion("left");
  assert.equal(toggle.disabled, false, "released view no longer observes changes");
}));

test("the actual default entry narrows action data from the registered layout page and releases views on pagehide", () => withTestDocument(async () => {
  const runtime = await importPreviewForTest(), { root } = runtime;
  try {
    assert.deepEqual(runtime.actionOwner.snapshot().actions.map(item => item.id), runtime.registry.get(RUNTIME_LAYOUT_PAGE_ID).permissions.commands);
    assert.equal(runtime.router.shortcuts, runtime.shortcuts); assert.deepEqual(runtime.shortcuts.list(), []);
    assert.deepEqual(runtime.platform.list().map(item => item.manifest.id), ["frame.builtin", "frame.layout", "notation.core"]);
    const choice = root.querySelector("#layout-content-choice"), toggle = root.querySelector("#layout-content-toggle");
    choice.value = "frame.builtin.assistant"; choice.dispatchEvent(new Event("change")); assert.equal(toggle.disabled, true);
    root.querySelector("#composer-edit").click(); assert.equal(toggle.disabled, false);
    const stop = runtime.shortcuts.register("frame.layout", { id: "frame.layout.test-remap", command: S.enabled,
      componentId: RUNTIME_LAYOUT_PAGE_ID, scope: "component", keys: ["Alt+I"] });
    assert.equal(toggle.getAttribute("aria-keyshortcuts"), "Alt+I"); stop();
    toggle.click(); assert.equal(root.querySelector("#page-tab-frame.builtin.assistant").hidden, true);
    root.querySelector("#layout-cancel").click(); assert.equal(root.querySelector("#page-tab-frame.builtin.assistant").hidden, false);
    const hint = toggle.title;
    window.dispatchEvent(new Event("pagehide")); assert.equal(root.children.length, 0);
    assert.equal(runtime.router.describe(S.enabled), null); assert.equal(toggle.title, hint);
    runtime.router.refresh(); assert.equal(toggle.title, hint); assert.deepEqual(runtime.shortcuts.list(), []);
  } finally { window.dispatchEvent(new Event("pagehide")); }
}));
