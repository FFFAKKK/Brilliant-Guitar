import { importPreviewForTest } from "./support/workspace-runtime-test.js";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createCommandRouter } from "../src/runtime/command-router.js";
import { createMenuRegistry } from "../src/runtime/menu-registry.js";
import { createComponentRegistry } from "../src/runtime/component-registry.js";
import { createPluginPlatform } from "../src/runtime/plugin-installer.js";
import { createBuiltinPages, LAYOUT_PAGE_ID } from "../src/features/builtin-pages.js";
import { createWorkspaceState } from "../src/layout/workspace-state.js";
import { bindWorkspaceCommands, WORKSPACE_COMMANDS as C } from "../src/host/workspace-commands.js";
import { createWorkspaceMenus, WORKSPACE_MENU_DEFINITIONS } from "../src/host/workspace-menus.js";
import { createCommandMenuBar } from "../src/shell/command-menu-bar.js";
import { openPopover, closePopover, popoverAnchor } from "../src/shell/popover.js";
import { bindKeyboard } from "../src/host/keyboard.js";
import { normalizeUnavailableLibraryHint } from "./support/accepted-reading-markup.js";
import { withTestDocument } from "./support/dom-test-environment.js";

function press(target, key, options = {}) {
  const event = new Event("keydown", { bubbles: true, cancelable: true });
  Object.assign(event, { key, ctrlKey: false, altKey: false, metaKey: false, shiftKey: false, isComposing: false, ...options });
  target.dispatchEvent(event); return event;
}
function start({ plugin, failActions = false } = {}) {
  let failNextActionSubscription = failActions;
  const router = createCommandRouter(), registry = createMenuRegistry(WORKSPACE_MENU_DEFINITIONS);
  const subscriptions = { layout: 0, router: 0, menus: 0 }, calls = [], notices = [];
  const track = (key, subscribe, listener) => {
    const stop = subscribe(listener); subscriptions[key]++;
    let active = true;
    return () => { if (active) { active = false; subscriptions[key]--; stop(); } };
  };
  const ids = ["frame.builtin.properties", "frame.builtin.assistant", "frame.builtin.tone", LAYOUT_PAGE_ID];
  const store = createWorkspaceState({ pageIds: ids, layoutPageId: LAYOUT_PAGE_ID, width: innerWidth, height: innerHeight });
  const layout = { snapshot: () => store.read.snapshot(), subscribe: listener => track("layout", store.read.subscribe, listener) };
  let stopCommands = bindWorkspaceCommands({ router, store, stage: { zoom() {} } });
  const platform = createPluginPlatform({ router, menus: registry, components: createComponentRegistry() });
  platform.register(createBuiltinPages(layout, undefined, undefined, { includeLayout: true })); if (plugin) platform.register(plugin);
  assert.ok(platform.start().every(entry => entry.status === "active"));
  const binding = createWorkspaceMenus({
    router: { ...router, subscribe: listener => track("router", router.subscribe, listener),
      execute(id, payload) { calls.push([id, payload]); return router.execute(id, payload); } },
    registry: { ...registry, subscribe: listener => track("menus", registry.subscribe, listener) },
    layout, layoutPageId: LAYOUT_PAGE_ID, notify: (text, level) => notices.push({ text, level }),
  });
  const root = document.createElement("div"), fallback = document.createElement("button"); fallback.id = "test-fallback";
  document.body.append(root); root.append(fallback);
  const bar = createCommandMenuBar(failActions ? { ...binding, actions: { ...binding.actions, subscribe(listener) {
    if (failNextActionSubscription) { failNextActionSubscription = false; throw new Error("subscribe failure"); }
    return binding.actions.subscribe(listener);
  } } } : binding,
    { fallbackFocus: () => fallback });
  root.append(bar.element);
  const query = selector => document.body.querySelector(selector);
  const rows = () => query(".v-menu-list")?.querySelectorAll(".v-menu-item") ?? [];
  const item = label => rows().find(row => row.querySelector(".v-menu-label").textContent === label);
  return { router, registry, store, platform, binding, bar, root, query, rows, item, calls, notices, subscriptions,
    open(id = "view") { query("#menu-" + id).click(); },
    removeWorkspaceCommands() { stopCommands(); },
    restoreWorkspaceCommands() { stopCommands = bindWorkspaceCommands({ router, store, stage: { zoom() {} } }); },
    dispose() { bar.dispose(); binding.dispose(); platform.dispose(); stopCommands(); root.remove(); closePopover({ restoreFocus: false }); },
  };
}
const withMenu = (run, options) => withTestDocument(async () => {
  const current = start(options);
  try { return await run(current); } finally { current.dispose(); }
});
const pluginFor = (command, extra = {}) => ({ namespace: "example", commands: [{ id: "example.action", run: () => ({ ok: true }), ...command }],
  menuItems: [{ menu: "view", group: 2, order: 0, command: "example.action", label: "插件操作", ...extra }] });

test("the default bar preserves seven positions and enables only view; its five items are actual registered command data", () => withMenu(current => {
  assert.deepEqual(current.bar.element.children.map(node => node.textContent), ["文件", "编辑", "视图", "谱面", "播放", "插件", "帮助"]);
  assert.deepEqual(current.bar.element.children.map(node => !node.disabled), [false, false, true, false, false, false, false]);
  assert.equal(current.query("#menu-view").tabIndex, 0);
  assert.equal(current.bar.element.children.filter(node => node.tabIndex === 0).length, 1);
  current.open(); assert.deepEqual(current.rows().map(node => node.querySelector(".v-menu-label").textContent), ["上侧栏", "左侧栏", "右侧栏", "下侧栏", "工作区布局…"]);
  assert.equal(current.query(".v-menu-popup").getAttribute("role"), "presentation");
  assert.equal(current.query(".v-menu-list").getAttribute("role"), "menu");
  assert.equal(current.query("#menu-view").getAttribute("aria-expanded"), "true");
  assert.equal(current.item("右侧栏").getAttribute("role"), "menuitemcheckbox");
  assert.equal(current.item("工作区布局…").getAttribute("role"), "menuitem");
  assert.equal(document.activeElement, current.item("上侧栏"));
  assert.throws(() => { current.registry.resolve()[0].groups[0][0].payload.region = "left"; }, TypeError);
}));

test("all four menu switches use one existing router exactly once and remain available outside component editing", () => withMenu(current => {
  assert.equal(current.store.read.snapshot().adjusting, false);
  for (const [label, region, key] of [["上侧栏", "top", "topOpen"], ["左侧栏", "left", "leftOpen"], ["右侧栏", "right", "rightOpen"], ["下侧栏", "voice", "voiceOpen"]]) {
    current.open(); const before = current.store.read.snapshot()[key], count = current.calls.length;
    current.item(label).click();
    assert.deepEqual(current.calls.slice(count), [[C.region, { region }]]);
    assert.equal(current.store.read.snapshot()[key], !before); assert.equal(current.store.read.snapshot().adjusting, false);
    assert.equal(current.query(".v-menu-popup"), null); assert.equal(document.activeElement, current.query("#menu-view"));
  }
}));

test("opening layout selects its existing page and opens the right sidebar without beginning editing or toggling it closed", () => withMenu(current => {
  current.router.execute(C.region, { region: "right" });
  for (let i = 0; i < 2; i++) {
    current.open(); const count = current.calls.length; current.item("工作区布局…").click();
    assert.deepEqual(current.calls.slice(count), [[C.page, { id: LAYOUT_PAGE_ID, toggle: false }]]);
    assert.equal(current.store.read.snapshot().currentPage, LAYOUT_PAGE_ID); assert.equal(current.store.read.snapshot().rightOpen, true);
    assert.equal(current.store.read.snapshot().adjusting, false);
  }
}));

test("an open menu derives independent checkbox states from workspace and retains its rows, focus and unrelated input", () => withMenu(current => {
  const input = document.createElement("input"); input.value = "保留草稿"; current.root.append(input);
  current.open(); const left = current.item("左侧栏"), right = current.item("右侧栏"); left.focus();
  assert.equal(left.getAttribute("aria-checked"), "false"); assert.equal(right.getAttribute("aria-checked"), "true");
  current.router.execute(C.region, { region: "left" });
  assert.equal(current.item("左侧栏"), left); assert.equal(left.getAttribute("aria-checked"), "true");
  assert.equal(current.item("右侧栏"), right); assert.equal(right.getAttribute("aria-checked"), "true");
  assert.equal(document.activeElement, left); assert.equal(input.value, "保留草稿");
}));

test("actual plugin menu contributions share command enabled/checked and effective global keys while excluding component keys", () => {
  let enabled = true, checked = false;
  return withMenu(current => {
    current.open(); const row = current.item("插件操作"); row.focus();
    assert.equal(row.getAttribute("aria-checked"), "false"); assert.equal(row.querySelector("kbd").textContent, "Alt+A");
    current.router.shortcuts.register("example", { id: "example.local", command: "example.action", componentId: "example.panel", scope: "component", keys: ["Alt+L"] });
    assert.equal(row.querySelector("kbd").textContent, "Alt+A");
    current.router.shortcuts.setKeys("example.action", ["Alt+Z"]); assert.equal(row.querySelector("kbd").textContent, "Alt+Z");
    assert.equal(row.getAttribute("aria-keyshortcuts"), "Alt+Z");
    current.router.shortcuts.setKeys("example.action", []); assert.equal(row.querySelector("kbd").textContent, "");
    current.router.shortcuts.reset("example.action"); assert.equal(row.querySelector("kbd").textContent, "Alt+A");
    checked = true; enabled = false; current.router.refresh();
    assert.equal(current.item("插件操作"), row); assert.equal(row.getAttribute("aria-checked"), "true"); assert.equal(row.disabled, true);
    assert.notEqual(document.activeElement, row, "focus moves away from a newly disabled row");
    assert.match(row.title, /操作当前不可用/);
  }, { plugin: pluginFor({ enabled: () => enabled, checked: () => checked, keys: ["Alt+A"] }) });
});

test("parameterized menu rows do not advertise a payload-less binding as a shortcut for a particular target", () => withMenu(current => {
  current.router.shortcuts.register("host", { id: "host.region", command: C.region, scope: "global", keys: ["Alt+R"] });
  current.open(); assert.ok(current.rows().every(row => row.querySelector("kbd").textContent === ""));
  assert.deepEqual(current.binding.actions.snapshot().actions.find(action => action.id === C.region).keys, ["Alt+R"]);
}));

test("stale display is re-read before execution; a failed operation remains visible and can be retried", () => {
  let enabled = true, fail = false, executions = 0;
  return withMenu(current => {
    current.open(); const row = current.item("插件操作"); enabled = false; row.click();
    assert.equal(executions, 0); assert.equal(row.disabled, true); assert.match(current.query(".v-menu-feedback").textContent, /操作当前不可用/);
    enabled = true; fail = true; current.router.refresh(); row.click();
    assert.equal(executions, 1); assert.ok(current.query(".v-menu-popup")); assert.match(current.query(".v-menu-feedback").textContent, /失败.*重试/);
    assert.ok(current.notices.some(notice => notice.level === "error"));
    fail = false; row.click(); assert.equal(executions, 2); assert.equal(current.query(".v-menu-popup"), null);
  }, { plugin: pluginFor({ enabled: () => enabled, run() { executions++; if (fail) throw new Error("execution failure"); return { ok: true }; } }) });
});

test("new runtime commands cannot implicitly expand the fixed menu whitelist or accept forged item identities", () => withMenu(current => {
  const release = current.router.register("example", { id: "example.temporary", run: () => ({ ok: true }) });
  // It was not in the fixed-session whitelist, so a new runtime command cannot gain menu execution implicitly.
  const remove = current.registry.contribute("example", { menu: "view", command: "example.temporary", label: "未授权新动作" });
  current.open(); const row = current.item("未授权新动作"); assert.equal(row.disabled, true); assert.match(row.title, /没有.*权限/);
  const registeredItem = current.registry.resolve().find(menu => menu.id === "view").groups.flat().find(item => item.label === "未授权新动作");
  assert.equal(current.binding.execute(registeredItem).code, "permission.denied");
  assert.equal(current.binding.execute({ ...registeredItem }).code, "menu.missing");
  remove(); assert.equal(current.item("未授权新动作"), undefined); release();
}));

test("contribution release follows its owner and re-contribution uses a new row while keeping host entries", () => withMenu(current => {
  current.open(); const row = current.item("插件操作");
  current.platform.dispose(); assert.equal(current.item("插件操作"), undefined, "contribution removal follows its owner lifecycle");
  assert.equal(current.query("#menu-view").disabled, false, "host-owned view entries remain");
  assert.equal(current.binding.actions.snapshot().actions.find(action => action.id === "example.action").exists, false);
  const release = current.router.register("example", { id: "example.action", run: () => ({ ok: true }) });
  const remove = current.registry.contribute("example", { menu: "view", command: "example.action", label: "插件操作" });
  const replacement = current.item("插件操作"); assert.notEqual(replacement, row); assert.equal(replacement.disabled, false);
  remove(); release();
}, { plugin: pluginFor({}) }));

test("a still-registered menu item follows command removal and restoration without replacing its row", () => withMenu(current => {
  current.open(); const row = current.item("左侧栏"); row.focus(); const before = current.store.read.snapshot();
  current.removeWorkspaceCommands(); assert.equal(current.item("左侧栏"), row); assert.equal(row.disabled, true);
  assert.match(row.title, /操作当前不可用/); row.dispatchEvent(new Event("click")); assert.equal(current.calls.length, 0);
  assert.equal(current.store.read.snapshot(), before);
  current.restoreWorkspaceCommands(); assert.equal(current.item("左侧栏"), row); assert.equal(row.disabled, false);
  row.click(); assert.deepEqual(current.calls, [[C.region, { region: "left" }]]);
}));

test("malformed command state is isolated in the existing read port and disables only its own menu row", () => withMenu(current => {
  current.open(); const row = current.item("插件操作"); assert.equal(row.disabled, true); assert.match(row.title, /状态读取失败/);
  assert.equal(current.item("左侧栏").disabled, false);
  row.dispatchEvent(new Event("click")); assert.equal(current.calls.length, 0);
}, { plugin: pluginFor({ enabled: () => "invalid" }) }));

test("keyboard navigation uses visible order, skips disabled items and executes Enter and Space once", () => withMenu(current => {
  press(current.query("#menu-view"), "ArrowUp"); assert.equal(document.activeElement, current.item("工作区布局…"));
  press(document.activeElement, "Home"); assert.equal(document.activeElement, current.item("上侧栏"));
  press(document.activeElement, "ArrowDown"); assert.equal(document.activeElement, current.item("左侧栏"));
  const remove = current.registry.contribute("example", { menu: "view", group: 0, order: 0.5, command: C.region, payload: { region: "right" }, label: "中间动作" });
  press(document.activeElement, "ArrowUp"); assert.equal(document.activeElement, current.item("中间动作"));
  const count = current.calls.length; press(document.activeElement, "Enter"); assert.equal(current.calls.length, count + 1);
  current.open(); press(document.activeElement, "End"); press(document.activeElement, " "); assert.equal(current.calls.length, count + 2);
  remove();
}, { plugin: pluginFor({ enabled: () => false }) }));

test("Escape closes only the menu, Tab leaves it and composing or modified navigation does not execute an action", () => withMenu(current => {
  current.router.execute(C.begin); current.open(); const row = current.item("上侧栏");
  press(row, "Escape", { isComposing: true }); assert.ok(current.query(".v-menu-popup"));
  press(row, "Enter", { isComposing: true }); press(row, "Enter", { ctrlKey: true }); assert.equal(current.calls.length, 0);
  press(row, "Escape"); assert.equal(current.query(".v-menu-popup"), null); assert.equal(current.store.read.snapshot().adjusting, true);
  assert.equal(document.activeElement, current.query("#menu-view"));
  current.open(); const event = press(document.activeElement, "Tab", { shiftKey: true });
  assert.equal(event.defaultPrevented, false); assert.equal(current.query(".v-menu-popup"), null);
}));

test("global shortcuts stay reserved while a body-portal menu is open and resume after closing", () => {
  let executions = 0;
  return withMenu(current => {
    const stop = bindKeyboard(current.router, { root: current.root });
    current.open(); press(document.activeElement, "a", { altKey: true }); assert.equal(executions, 0);
    press(current.query("#test-fallback"), "a", { altKey: true }); assert.equal(executions, 0);
    current.bar.close(); press(current.query("#test-fallback"), "a", { altKey: true }); assert.equal(executions, 1);
    stop();
  }, { plugin: pluginFor({ keys: ["Alt+A"], run() { executions++; return { ok: true }; } }) });
});

test("outside pointer, focus departure and viewport changes close and release open-menu subscriptions", () => withMenu(current => {
  assert.deepEqual(current.subscriptions, { layout: 0, router: 0, menus: 1 });
  current.open(); assert.deepEqual(current.subscriptions, { layout: 1, router: 1, menus: 1 });
  current.query("#test-fallback").dispatchEvent(new Event("pointerdown", { bubbles: true }));
  assert.equal(current.query(".v-menu-popup"), null); assert.deepEqual(current.subscriptions, { layout: 0, router: 0, menus: 1 });
  current.open(); const focusout = new Event("focusout", { bubbles: true }); Object.assign(focusout, { relatedTarget: current.query("#test-fallback") });
  document.activeElement.dispatchEvent(focusout); assert.equal(current.query(".v-menu-popup"), null);
  current.open(); window.dispatchEvent(new Event("resize")); assert.equal(current.query(".v-menu-popup"), null);
  current.bar.dispose(); current.bar.dispose(); assert.deepEqual(current.subscriptions, { layout: 0, router: 0, menus: 0 });
}));

test("switching to another contributed top menu releases the previous session and a bar never closes another owner's popover", () => withMenu(current => {
  current.open(); current.query("#menu-edit").dispatchEvent(new Event("pointerenter"));
  assert.equal(popoverAnchor(), current.query("#menu-edit")); assert.equal(current.item("插件操作").disabled, false);
  assert.deepEqual(current.subscriptions, { layout: 1, router: 1, menus: 1 });
  const detached = current.query(".v-menu-popup");
  const external = current.query("#test-fallback"); openPopover(external, document.createElement("div"), { label: "另一个浮层" });
  press(detached, "Escape"); assert.equal(popoverAnchor(), external, "old detached surface cannot close the new owner");
  assert.deepEqual(current.subscriptions, { layout: 0, router: 0, menus: 1 });
  current.bar.dispose(); assert.equal(popoverAnchor(), external);
}, { plugin: pluginFor({}, { menu: "edit" }) }));

test("failed opening rolls back the portal, listeners and trigger state while leaving the bar usable for retry", () => withMenu(current => {
  current.open(); assert.equal(current.query(".v-menu-popup"), null); assert.equal(current.query("#menu-view").getAttribute("aria-expanded"), "false");
  assert.deepEqual(current.subscriptions, { layout: 0, router: 0, menus: 1 });
  assert.ok(current.notices.some(notice => /无法打开/.test(notice.text)));
  current.open(); assert.ok(current.query(".v-menu-popup")); assert.deepEqual(current.subscriptions, { layout: 1, router: 1, menus: 1 });
}, { failActions: true }));

test("async menu execution is claimed once and its completion never closes a different newly opened surface", async () => {
  let finish, executions = 0;
  await withMenu(async current => {
    current.open(); const row = current.item("插件操作"); row.click(); row.dispatchEvent(new Event("click"));
    assert.equal(executions, 1); assert.ok(current.rows().every(node => node.disabled));
    current.bar.close(); const external = current.query("#test-fallback"); openPopover(external, document.createElement("div"), { label: "另一个浮层" });
    finish({ ok: true }); await new Promise(resolve => setImmediate(resolve));
    assert.equal(popoverAnchor(), external);
  }, { plugin: pluginFor({ run() { executions++; return new Promise(resolve => { finish = resolve; }); } }) });
});

test("popup placement is constrained using supplied geometry; closed menus leave the existing shell structure alone", () => withMenu(current => {
  current.open(); const popup = current.query(".v-menu-popup"), x = parseFloat(popup.style.left), y = parseFloat(popup.style.top);
  assert.equal(Number.isFinite(x) && Number.isFinite(y), true); assert.ok(x >= 8 && y >= 8);
  current.bar.close(); assert.equal(current.query(".v-menu-popup"), null);
  const css = readFileSync(new URL("../styles/command-menu.css", import.meta.url), "utf8");
  assert.ok(css.includes("position: fixed") && css.includes("calc(100vw - 16px)"));
  assert.equal(css.split("\n").filter(line => line.trim().endsWith("{")).every(line => line.startsWith(".v-menu-popup")), true);
}));

test("actual runtime wires view menus without another plugin and cleans the open body portal on pagehide", () => withTestDocument(async () => {
  const current = await importPreviewForTest();
  try {
    assert.deepEqual(current.platform.list().map(item => item.manifest.id), ["frame.builtin", "frame.layout", "notation.core"]); assert.deepEqual(current.shortcuts.list(), []);
    const trigger = document.getElementById("menu-view"); trigger.click();
    const rows = document.querySelectorAll(".v-menu-item"), left = rows.find(row => row.querySelector(".v-menu-label").textContent === "左侧栏");
    left.click(); assert.equal(current.store.read.snapshot().leftOpen, true); assert.equal(current.store.read.snapshot().adjusting, false);
    assert.equal(document.getElementById("module-panel-trigger").getAttribute("aria-pressed"), "true");
    trigger.click(); const popup = document.querySelector(".v-menu-popup"); window.dispatchEvent(new Event("pagehide"));
    assert.equal(popup.isConnected, false); assert.equal(current.root.children.length, 0); assert.equal(document.querySelector(".v-menu-popup"), null);
    assert.equal(current.menuBinding.execute(current.menus.resolve()[0]?.groups[0]?.[0]).code, "menu.missing");
    assert.deepEqual(current.shortcuts.list(), []);
  } finally { window.dispatchEvent(new Event("pagehide")); }
}));


test("pending menu action exposes local busy semantics and settles back to the failed action", async () => {
  let finish, executions = 0;
  await withMenu(async current => {
    current.open(); const row = current.item("插件操作"); row.focus(); row.click();
    const list = current.query(".v-menu-list");
    assert.equal(list.getAttribute("aria-busy"), "true");
    assert.equal(row.getAttribute("aria-busy"), "true");
    assert.equal(row.querySelector(".v-menu-pending").hidden, false);
    assert.match(row.title, /正在处理/);
    assert.ok(current.rows().filter(node => node !== row).every(node => node.getAttribute("aria-busy") === "false"));
    assert.ok(current.rows().every(node => node.disabled));
    row.dispatchEvent(new Event("click")); assert.equal(executions, 1);
    assert.equal(document.activeElement, list);
    finish({ ok: false, code: "example.failed" }); await new Promise(resolve => setImmediate(resolve));
    assert.equal(list.getAttribute("aria-busy"), "false"); assert.equal(row.getAttribute("aria-busy"), "false");
    assert.equal(row.querySelector(".v-menu-pending").hidden, true);
    assert.equal(document.activeElement?.getAttribute("data-command"), "example.action");
    assert.equal(row.disabled, false); assert.equal(current.query(".v-menu-feedback").hidden, false);
  }, { plugin: pluginFor({ run() { executions++; return new Promise(resolve => { finish = resolve; }); } }) });
});

test("retry clears the previous error while the existing menu action is pending", async () => {
  let finish, executions = 0;
  await withMenu(async current => {
    current.open(); const row = current.item("插件操作"); row.click();
    const feedback = current.query(".v-menu-feedback"); assert.equal(feedback.hidden, false);
    row.click(); assert.equal(executions, 2); assert.equal(feedback.hidden, true); assert.equal(feedback.textContent, "");
    finish({ ok: true }); await new Promise(resolve => setImmediate(resolve));
    assert.equal(current.query(".v-menu-popup"), null);
  }, { plugin: pluginFor({ run() { executions++; return executions === 1 ? { ok: false } : new Promise(resolve => { finish = resolve; }); } }) });
});

test("a focused menu trigger losing its contribution recovers to an available menu", () => withMenu(current => {
  const trigger = current.query("#menu-plugins"); assert.equal(trigger.disabled, false); trigger.focus();
  current.platform.dispose(); assert.equal(trigger.disabled, true);
  assert.equal(document.activeElement?.id, "menu-view"); assert.equal(current.query("#menu-view").tabIndex, 0);
}, { plugin: pluginFor({}, { menu: "plugins" }) }));

test("a lost menu contribution does not steal focus from another live control", () => withMenu(current => {
  current.query("#test-fallback").focus(); current.platform.dispose();
  assert.equal(document.activeElement?.id, "test-fallback");
}, { plugin: pluginFor({}, { menu: "plugins" }) }));

test("a rejected pending action cannot refocus or write into a different opened menu", async () => {
  let reject;
  await withMenu(async current => {
    current.open("plugins"); current.item("插件操作").click();
    current.bar.close(); current.open("view");
    const list = current.query(".v-menu-list"), row = current.item("左侧栏"); row.focus();
    reject(new Error("old operation failed")); await new Promise(resolve => setImmediate(resolve));
    assert.equal(current.query(".v-menu-list"), list);
    assert.equal(document.activeElement?.getAttribute("data-command"), C.region);
    assert.equal(current.query(".v-menu-feedback").hidden, true);
  }, { plugin: pluginFor({ run() { return new Promise((resolve, fail) => { reject = fail; }); } }, { menu: "plugins" }) });
});

test("disposed pending menus ignore completion without feedback or focus writes", async () => {
  let finish;
  await withMenu(async current => {
    current.open(); current.item("插件操作").click();
    current.bar.dispose(); current.query("#test-fallback").focus(); const count = current.notices.length;
    finish({ ok: false }); await new Promise(resolve => setImmediate(resolve));
    assert.equal(current.query(".v-menu-popup"), null); assert.equal(current.notices.length, count);
    assert.equal(document.activeElement?.id, "test-fallback");
  }, { plugin: pluginFor({ run() { return new Promise(resolve => { finish = resolve; }); } }) });
});

test("empty runtime sidebar names its state without directing users to an unavailable library", () => withTestDocument(async () => {
  const current = await importPreviewForTest();
  try {
    const root = document.querySelector("#app"), empty = root.querySelector(".v-left-empty");
    assert.equal(root.querySelector("#library-trigger").disabled, true);
    assert.equal(empty.textContent, "暂无内容");
  } finally { window.dispatchEvent(new Event("pagehide")); }
}));


test("historical empty hint mapping cannot hide different wording or private content drift", () => {
  const node = { tag: "p", attributes: { class: "v-left-empty", "data-frame-ui": "" }, children: ["从模块库添加模块"] };
  assert.deepEqual(normalizeUnavailableLibraryHint(node).children, ["暂无内容"]);
  assert.deepEqual(node.children, ["从模块库添加模块"], "immutable saved input");
  for (const changed of [
    { ...node, attributes: { class: "v-left-empty" } },
    { ...node, attributes: { ...node.attributes, class: "another-message" } },
    { ...node, children: ["不同的错误内容"] },
  ]) assert.deepEqual(normalizeUnavailableLibraryHint(changed), changed);
});


test("an initially empty menu does not read an unmounted fallback or claim external focus", () => withTestDocument(() => {
  const bar = createCommandMenuBar({ definitions: [{ id: "view", label: "视图" }],
    menus: { resolve: () => [], subscribe: () => () => {} } },
    { fallbackFocus() { assert.fail("fallback is only resolved for focus recovery"); } });
  try { assert.equal(bar.element.querySelector("#menu-view").disabled, true); }
  finally { bar.dispose(); }
}));


test("menu growth for failure feedback stays inside its available viewport height", () => withMenu(current => {
  current.open(); const popup = current.query(".v-menu-popup");
  const top = Number.parseFloat(popup.style.top);
  assert.equal(Number.parseFloat(popup.style.maxHeight), innerHeight - top - 8);
  current.item("插件操作").click();
  assert.equal(current.query(".v-menu-feedback").hidden, false);
  assert.equal(Number.parseFloat(popup.style.maxHeight) + top, innerHeight - 8);
}, { plugin: pluginFor({ run: () => ({ ok: false }) }) }));
// Short-menu geometry scenario only. Does not qualify browser layout or pixels.
async function withShortMenu(run, options) {
  return withMenu(async current => {
    const create = document.createElement;
    document.createElement = tag => {
      const node = create(tag), rect = node.getBoundingClientRect.bind(node);
      Object.defineProperty(node, "parentElement", { configurable: true, get() {
        return this.parentNode?.tagName ? this.parentNode : null;
      } });
      node.scrollTop = 0; node.scrollLeft = 0;
      node.getBoundingClientRect = () => {
        if (node.classList.contains("v-menu-popup")) return { left: 8, right: 228, top: 8, bottom: 108, width: 220, height: 100 };
        if (node.classList.contains("v-menu-item")) {
          const panel = current.query(".v-menu-popup"), index = current.rows().indexOf(node);
          const top = 12 + index * 32 - (panel?.scrollTop ?? 0);
          return { left: 16, right: 220, top, bottom: top + 28, width: 204, height: 28 };
        }
        return rect();
      };
      return node;
    };
    const visible = node => {
      const box = node.getBoundingClientRect(), bounds = current.query(".v-menu-popup").getBoundingClientRect();
      assert.ok(box.top >= bounds.top + 4 && box.bottom <= bounds.bottom - 4, "focused row is visible in its menu");
    };
    try { return await run(current, visible); } finally { document.createElement = create; }
  }, options);
}

test("short menu End, Home and wrap navigation reveal only the focused menu row", () => withShortMenu((current, visible) => {
  current.open(); const panel = current.query(".v-menu-popup"), state = current.store.read.snapshot();
  current.root.scrollTop = 35; document.body.scrollTop = 70;
  press(document.activeElement, "End");
  assert.equal(document.activeElement, current.item("工作区布局…")); visible(document.activeElement);
  assert.equal(panel.scrollTop, 64);
  press(document.activeElement, "Home"); visible(document.activeElement); assert.equal(panel.scrollTop, 0);
  press(document.activeElement, "ArrowUp"); visible(document.activeElement); assert.equal(panel.scrollTop, 64);
  press(document.activeElement, "ArrowDown"); visible(document.activeElement); assert.equal(panel.scrollTop, 0);
  assert.equal(current.root.scrollTop, 35); assert.equal(document.body.scrollTop, 70);
  assert.equal(current.store.read.snapshot(), state); assert.equal(current.calls.length, 0);
}));

test("opening a short menu with ArrowUp exposes its last enabled item immediately", () => withShortMenu((current, visible) => {
  press(current.query("#menu-view"), "ArrowUp");
  assert.equal(document.activeElement, current.item("工作区布局…")); visible(document.activeElement);
  assert.equal(current.query(".v-menu-popup").scrollTop, 64);
  assert.equal(current.calls.length, 0);
}));

test("a focused row becoming disabled exposes its replacement in the same short menu", () => {
  let enabled = true;
  return withShortMenu((current, visible) => {
    current.open(); const row = current.item("插件操作"), panel = current.query(".v-menu-popup");
    row.focus(); panel.scrollTop = 0; enabled = false; current.router.refresh();
    assert.equal(row.disabled, true); assert.notEqual(document.activeElement, row);
    visible(document.activeElement); assert.equal(current.query(".v-menu-popup"), panel);
    assert.equal(current.calls.length, 0);
  }, { plugin: pluginFor({ enabled: () => enabled }) });
});

test("failed pending action restores a visible row after the user scrolled the short menu", async () => {
  let settle;
  await withShortMenu(async (current, visible) => {
    current.open(); const row = current.item("插件操作"), panel = current.query(".v-menu-popup");
    row.focus(); row.click(); assert.equal(document.activeElement, current.query(".v-menu-list"));
    panel.scrollTop = 0; settle({ ok: false }); await Promise.resolve(); await Promise.resolve();
    assert.equal(document.activeElement, row); visible(row); assert.equal(row.disabled, false);
    assert.equal(current.query(".v-menu-popup"), panel); assert.equal(current.calls.length, 1);
    assert.equal(current.query(".v-menu-feedback").hidden, false);
  }, { plugin: pluginFor({ run: () => new Promise(resolve => { settle = resolve; }) }) });
});

test("reserved keys and disposed menu listeners never scroll or execute through a stale row", () => withShortMenu(current => {
  current.open(); const panel = current.query(".v-menu-popup"), row = document.activeElement;
  for (const extra of [{ isComposing: true }, { keyCode: 229 }, { ctrlKey: true }, { shiftKey: true }, { defaultPrevented: true }]) {
    if (extra.defaultPrevented) {
      const event = new Event("keydown", { bubbles: true, cancelable: true }); Object.assign(event, { key: "End" });
      event.preventDefault(); row.dispatchEvent(event);
    } else assert.equal(press(row, "End", extra).defaultPrevented, false);
    assert.equal(document.activeElement, row); assert.equal(panel.scrollTop, 0);
  }
  current.bar.dispose(); assert.equal(press(row, "End").defaultPrevented, false);
  assert.equal(panel.scrollTop, 0); assert.equal(current.calls.length, 0);
}));
