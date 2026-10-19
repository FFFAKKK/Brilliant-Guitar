import { importPreviewForTest } from "./support/workspace-runtime-test.js";
import assert from "node:assert/strict";
import test from "node:test";
import { createShortcutRouter, validateShortcut } from "../src/runtime/shortcut-router.js";
import { normalizeShortcut, comboOf, normalizeKeys } from "../src/runtime/shortcut-keys.js";
import { createCommandRouter } from "../src/runtime/command-router.js";
import { createComponentRegistry } from "../src/runtime/component-registry.js";
import { createComponentHost } from "../src/runtime/component-host.js";
import { createMenuRegistry } from "../src/runtime/menu-registry.js";
import { createPluginPlatform } from "../src/runtime/plugin-installer.js";
import { defineUiPlugin } from "../src/runtime/ui-plugin-contract.js";
import { bindKeyboard } from "../src/host/keyboard.js";
import { createMenubar } from "../src/shell/menubar.js";
import { renderLayoutPanel } from "../src/shell/frame-panels.js";
import { closePopover } from "../src/shell/popover.js";
import { withTestDocument } from "./support/dom-test-environment.js";

const binding = (id, keys = ["Mod+J"], extra = {}) => ({ id, command: id.replace(/\.key$/, ".action"), keys, ...extra });
function press(target, key, properties = {}) {
  const event = new Event("keydown", { bubbles: true, cancelable: true });
  for (const [name, value] of Object.entries({ key, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...properties })) {
    Object.defineProperty(event, name, { configurable: true, value });
  }
  target.dispatchEvent(event); return event;
}

test("key syntax keeps old normalization and freezes independent key lists", () => {
  assert.equal(normalizeShortcut("j + Shift + Mod"), "Mod+Shift+J");
  assert.equal(comboOf({ key: "j", ctrlKey: true }, false), "Mod+J");
  assert.equal(comboOf({ key: "Control", ctrlKey: true }), "");
  const raw = [" j + Mod "], keys = normalizeKeys(raw); raw[0] = "X";
  assert.deepEqual(keys, ["Mod+J"]); assert.equal(Object.isFrozen(raw), false); assert.equal(Object.isFrozen(keys), true);
  for (const invalid of [null, "J", ["Mod+J", "j+Mod"], ["Mod++J"], ["Mod+Shift"]]) assert.throws(() => normalizeKeys(invalid));
});

test("binding validation rejects ambiguous scopes, malformed fields and executable configuration", () => {
  const base = binding("sample.key");
  for (const raw of [null, { ...base, id: "Invalid" }, { ...base, command: "bad id" }, { ...base, scope: "field" },
    { ...base, scope: "component" }, { ...base, componentId: "sample.panel" }, { ...base, run() {} },
    { ...base, keys: ["J", "j"] }, { ...base, keys: null }]) assert.ok(validateShortcut(raw).length > 0);
  assert.deepEqual(validateShortcut({ ...base, scope: "score", componentId: "sample.view" }), []);
});

test("one map resolves the nearest component before global and isolates score bindings", () => {
  const keys = createShortcutRouter();
  keys.register("global", binding("global.key", ["J"]));
  keys.register("sample", binding("sample.a.key", ["J"], { scope: "component", componentId: "sample.a" }));
  keys.register("sample", binding("sample.b.key", ["J"], { scope: "component", componentId: "sample.b" }));
  keys.register("sample", binding("sample.score.key", ["J"], { scope: "score", componentId: "sample.score" }));
  assert.equal(keys.resolve("j", { componentId: "sample.a" }).id, "sample.a.key");
  assert.equal(keys.resolve("j", { componentId: "sample.b" }).id, "sample.b.key");
  assert.equal(keys.resolve("j", { componentId: "sample.score", score: true }).id, "sample.score.key");
  assert.equal(keys.resolve("j", { componentId: "sample.score", score: false }).id, "global.key");
  assert.equal(keys.resolve("j", { componentId: "sample.a", owner: "other" }).id, "global.key");
  assert.equal(keys.resolve("j", {}, { localOnly: true }), null);
  assert.equal(keys.resolve("Mod++J"), null);
});

test("default conflicts, repeated ids and component/score overlap fail before publishing anything", () => {
  const keys = createShortcutRouter(); let publications = 0; keys.subscribe(() => publications++);
  keys.register("a", binding("a.key", ["J"], { scope: "component", componentId: "a.view" }));
  const before = keys.list();
  assert.throws(() => keys.register("a", binding("a.other.key", ["j"], { scope: "score", componentId: "a.view" })), /占用/);
  assert.throws(() => keys.register("b", binding("a.key", ["K"])), /重复|注册/);
  assert.deepEqual(keys.list(), before); assert.equal(publications, 1);
  assert.ok(keys.preflight("b", [binding("b.one.key", ["K"]), binding("b.two.key", ["k"])]).length);
  assert.equal(keys.resolve("K"), null);
});

test("user overrides replace old keys, support disable/reset, preserve target and notify only on change", () => {
  const keys = createShortcutRouter(); const raw = binding("sample.key", ["J"], { scope: "component", componentId: "sample.panel" });
  keys.register("sample", raw); raw.keys[0] = "Z"; raw.componentId = "changed";
  const context = { componentId: "sample.panel" }; let notifications = 0; keys.subscribe(() => notifications++);
  assert.deepEqual(keys.setKeys("sample.key", ["Alt+K"]), { ok: true, changed: true });
  assert.equal(keys.resolve("J", context), null); assert.equal(keys.resolve("Alt+K", context).command, "sample.action");
  assert.deepEqual(keys.setKeys("sample.key", ["K+Alt"]), { ok: true, changed: false });
  assert.deepEqual(keys.setKeys("sample.key", []), { ok: true, changed: true });
  assert.equal(keys.resolve("Alt+K", context), null); assert.equal(keys.describe("sample.key").overridden, true);
  assert.equal(keys.reset("sample.key").ok, true); assert.equal(keys.resolve("J", context).componentId, "sample.panel");
  assert.equal(keys.describe("sample.key").overridden, false); assert.equal(notifications, 3);
  assert.throws(() => keys.describe("sample.key").keys.push("X"), TypeError);
  assert.equal(keys.setKeys("missing", []).code, "shortcut.missing");
});

test("override and reset conflicts keep the accepted mapping and snapshot unchanged", () => {
  const keys = createShortcutRouter(); keys.register("a", binding("a.key", ["J"])); keys.register("b", binding("b.key", ["K"]));
  let changes = 0; keys.subscribe(() => changes++); const before = keys.list();
  assert.equal(keys.setKeys("a.key", ["K"]).code, "shortcut.conflict");
  assert.equal(keys.setKeys("a.key", ["J", "j"]).code, "shortcut.invalid-keys");
  assert.deepEqual(keys.list(), before); assert.equal(changes, 0);
  keys.setKeys("a.key", ["L"]); keys.setKeys("b.key", ["J"]);
  const accepted = keys.list(); assert.equal(keys.reset("a.key").code, "shortcut.conflict");
  assert.deepEqual(keys.list(), accepted); assert.equal(changes, 2);
});

test("registration checks active overrides as well as defaults and stale disposers cannot remove replacements", () => {
  const keys = createShortcutRouter(); const release = keys.register("a", binding("shared.key", ["J"]));
  keys.setKeys("shared.key", ["K"]);
  assert.throws(() => keys.register("b", binding("b.key", ["K"])), /占用/);
  release(); assert.deepEqual(keys.list(), []);
  keys.register("b", binding("shared.key", ["J"])); release();
  assert.equal(keys.resolve("J").owner, "b"); assert.equal(keys.describe("shared.key").overridden, false);
});

test("observer errors do not interrupt override, ownership cleanup or independent subscribers", () => {
  const errors = [], keys = createShortcutRouter({ onObserverError: error => errors.push(error.message) }); let observed = 0;
  keys.subscribe(() => { throw new Error("observer"); }); keys.subscribe(() => observed++);
  const release = keys.register("a", binding("a.key", ["J"])); keys.setKeys("a.key", ["K"]); release();
  assert.equal(observed, 3); assert.deepEqual(errors, ["observer", "observer", "observer"]); assert.deepEqual(keys.list(), []);
});

test("legacy command keys and commandFor delegate to the same effective map with atomic cleanup", () => {
  const shortcuts = createShortcutRouter(), router = createCommandRouter({ shortcuts });
  const release = router.register("host", { id: "host.save", keys: ["Mod+S", "Mod+Shift+S"], run() {} });
  assert.equal(router.shortcuts, shortcuts); assert.equal(shortcuts.list().length, 1);
  assert.equal(shortcuts.list()[0].id, "host.save");
  shortcuts.setKeys("host.save", ["Alt+S"]);
  assert.equal(router.commandFor("Mod+S"), null); assert.equal(router.commandFor("Alt+S"), "host.save");
  assert.deepEqual(router.describe("host.save").keys, ["Mod+S", "Mod+Shift+S"]);
  release(); assert.equal(router.commandFor("Alt+S"), null); assert.deepEqual(shortcuts.list(), []);
});

function manifest(namespace = "sample", { scope = "component", key = "I", hook, permissions = true } = {}) {
  const command = namespace + ".inspect", component = namespace + ".panel";
  return defineUiPlugin({ namespace, commands: [{ id: command, run() {} }],
    shortcuts: [{ id: namespace + ".inspect-key", command, keys: [key], scope,
      ...(scope === "global" ? {} : { componentId: component }) }],
    ui: [{ id: component, kind: scope === "score" ? "view" : "panel", title: namespace,
      slots: scope === "score" ? ["stage"] : ["left", "right"], defaultSlot: scope === "score" ? "stage" : "right",
      permissions: { commands: permissions ? [command] : [] }, mount(element, ctx) {
        const button = document.createElement("button"); button.id = "button-" + namespace;
        const input = document.createElement("input"); input.id = "input-" + namespace;
        element.append(button, input);
        return { handleKeyDown: hook && (event => hook(event, ctx)) };
      },
    }],
  });
}

function runtime(options = {}) {
  const router = options.router ?? createCommandRouter();
  return { router, components: createComponentRegistry(), menus: createMenuRegistry([{ id: "view", label: "视图" }]), ...options };
}

test("author shorthand captures a single data-only binding declaration without changing v1 UI facets", () => {
  const raw = { namespace: "sample", commands: [{ id: "sample.inspect", run() {} }], ui: [],
    shortcuts: [{ id: "sample.key", command: "sample.inspect", keys: ["Mod+I"], scope: "global" }] };
  const plugin = defineUiPlugin(raw); raw.shortcuts[0].keys[0] = "X";
  assert.equal(plugin.facets.ui.contractVersion, 1); assert.deepEqual(plugin.shortcuts[0].keys, ["Mod+I"]);
  assert.throws(() => plugin.shortcuts.push({}), TypeError);
  assert.throws(() => defineUiPlugin({ ...raw, shortcuts: [{ ...raw.shortcuts[0], id: "other.key" }] }), /命名空间/);
  assert.throws(() => defineUiPlugin({ ...raw, shortcuts: {} }), /数组/);
});

test("pending plugin bindings validate ids, scopes, references, permissions and legacy collisions", () => {
  const rejected = [
    { ...manifest(), shortcuts: [{ id: "other.key", command: "sample.inspect", keys: ["I"] }] },
    { ...manifest(), shortcuts: [{ id: "sample.key", command: "missing.command", keys: ["I"] }] },
    { ...manifest(), shortcuts: [{ id: "sample.key", command: "sample.inspect", keys: ["I"], scope: "component", componentId: "other.panel" }] },
    manifest("sample", { permissions: false }),
    { ...manifest(), shortcuts: [{ id: "sample.key", command: "sample.inspect", keys: ["I"], scope: "score", componentId: "sample.panel" }] },
    { ...manifest(), shortcuts: {} },
  ];
  for (const plugin of rejected) {
    const current = runtime(), platform = createPluginPlatform(current);
    assert.throws(() => platform.register(plugin)); assert.deepEqual(platform.list(), []); assert.deepEqual(current.router.shortcuts.list(), []);
  }
  const current = runtime(), platform = createPluginPlatform(current);
  const legacy = { namespace: "legacy", commands: [{ id: "legacy.action", keys: ["I"], run() {} }] };
  platform.register(legacy); assert.throws(() => platform.register(manifest("sample", { scope: "global" })), /快捷键.*占用/);
  platform.register(manifest("sample")); assert.equal(platform.start().every(item => item.active), true);
  platform.dispose(); assert.deepEqual(current.router.shortcuts.list(), []);
});

test("same component binding keys do not conflict with another plugin's component and all owners clean up", () => {
  const current = runtime(), platform = createPluginPlatform(current);
  platform.register(manifest("one")); platform.register(manifest("two")); platform.register(manifest("score", { scope: "score" }));
  assert.equal(platform.start().filter(item => item.active).length, 3);
  assert.equal(current.router.shortcuts.list().length, 3);
  platform.dispose(); assert.deepEqual(current.router.shortcuts.list(), []); assert.deepEqual(current.components.list(), []);
});

test("a live conflict after registration fails before installing components or commands", () => {
  const current = runtime(), platform = createPluginPlatform(current);
  platform.register(manifest("sample", { scope: "global" }));
  current.router.register("host", { id: "host.action", keys: ["I"], run() {} });
  assert.equal(platform.start()[0].status, "failed");
  assert.equal(current.router.describe("sample.inspect"), null); assert.deepEqual(current.components.list(), []);
  assert.equal(current.router.commandFor("I"), "host.action"); platform.dispose();
});

test("failure during binding installation rolls back earlier bindings, commands and components", () => {
  const shortcuts = createShortcutRouter(); let installs = 0;
  const wrapped = { ...shortcuts, register(owner, raw) { if (++installs === 2) throw new Error("binding failure"); return shortcuts.register(owner, raw); } };
  const current = runtime({ router: createCommandRouter({ shortcuts: wrapped }) }), platform = createPluginPlatform(current);
  const plugin = manifest(); platform.register({ ...plugin, shortcuts: [...plugin.shortcuts,
    { ...plugin.shortcuts[0], id: "sample.second-key", keys: ["K"] }] });
  const result = platform.start()[0]; assert.equal(result.status, "failed"); assert.match(result.error.message, /binding failure/);
  assert.deepEqual(shortcuts.list(), []); assert.equal(current.router.describe("sample.inspect"), null); assert.deepEqual(current.components.list(), []);
});

test("failed command providers block shortcut consumers while independent bindings still install", () => {
  const base = createCommandRouter();
  const router = { ...base, register(owner, command) { if (owner === "provider") throw new Error("provider failed"); return base.register(owner, command); } };
  const current = runtime({ router }), platform = createPluginPlatform(current);
  platform.register({ namespace: "provider", commands: [{ id: "provider.action", run() {} }] });
  platform.register({ namespace: "consumer", shortcuts: [{ id: "consumer.key", command: "provider.action", keys: ["P"] }] });
  platform.register(manifest("healthy", { scope: "global" }));
  assert.deepEqual(platform.start().map(item => item.status), ["failed", "failed", "active"]);
  assert.equal(router.commandFor("P"), null); assert.equal(router.commandFor("I"), "healthy.inspect"); platform.dispose();
});

function start(plugins, { globalKey = "I" } = {}) {
  const current = runtime(), calls = [], notices = [];
  current.router.register("host", { id: "host.global", keys: [globalKey], run: () => { calls.push("global"); } });
  const platform = createPluginPlatform(current);
  for (const plugin of plugins) {
    const commands = plugin.commands.map(command => ({ ...command, run: () => { calls.push(command.id); return { ok: true }; } }));
    platform.register({ ...plugin, commands });
  }
  assert.ok(platform.start().every(item => item.active));
  const host = createComponentHost({ registry: current.components, router: current.router, notices: { push: notice => notices.push(notice) } });
  const root = document.createElement("div"); document.body.append(root);
  for (const definition of current.components.list()) root.append(host.ensure(definition.id, "panel"));
  const stop = bindKeyboard(current.router, { root, components: host, isMac: false });
  return { ...current, calls, notices, host, root, platform, query: selector => root.querySelector(selector),
    dispose() { stop(); platform.dispose(); host.dispose(); root.remove(); } };
}

test("actual keyboard dispatch follows component bindings, score focus and global keys exactly once", () => withTestDocument(() => {
  const current = start([manifest("one"), manifest("two"), manifest("score", { scope: "score" })]);
  press(current.query("#button-one"), "i"); press(current.query("#button-two"), "i"); press(current.query("#button-score"), "i");
  press(current.root, "i");
  assert.deepEqual(current.calls, ["one.inspect", "two.inspect", "score.inspect", "global"]);
  current.dispose();
}));

test("rebind and disable affect actual input and retain the original command, component and permission", () => withTestDocument(() => {
  const current = start([manifest("one")]);
  const mapping = current.router.shortcuts, button = current.query("#button-one");
  mapping.setKeys("one.inspect-key", ["Alt+K"]); press(button, "i"); press(button, "k", { altKey: true });
  mapping.setKeys("one.inspect-key", []); press(button, "k", { altKey: true });
  mapping.reset("one.inspect-key"); press(button, "i");
  assert.deepEqual(current.calls, ["global", "one.inspect", "one.inspect"]);
  assert.equal(mapping.describe("one.inspect-key").command, "one.inspect");
  assert.equal(mapping.describe("one.inspect-key").componentId, "one.panel");
  current.dispose();
}));

test("fields, composition, menus and local DOM consumption continue to reserve mapped keys", () => withTestDocument(() => {
  const current = start([manifest("one")]), button = current.query("#button-one"), input = current.query("#input-one");
  press(input, "i"); press(button, "i", { isComposing: true }); press(button, "i", { keyCode: 229 });
  const menu = document.createElement("div"); menu.setAttribute("role", "menu"); document.body.append(menu); press(button, "i"); menu.remove();
  const prevent = event => event.preventDefault(); button.addEventListener("keydown", prevent); press(button, "i"); button.removeEventListener("keydown", prevent);
  assert.deepEqual(current.calls, []); press(button, "i"); assert.deepEqual(current.calls, ["one.inspect"]); current.dispose();
}));

test("declarative local bindings precede complex hooks and handled hooks still precede global bindings", () => withTestDocument(() => {
  const hooks = [], current = start([manifest("one", { hook: event => { hooks.push(event.key); return true; } })]);
  press(current.query("#button-one"), "i"); press(current.query("#button-one"), "x");
  assert.deepEqual(current.calls, ["one.inspect"]); assert.deepEqual(hooks, ["x"]); current.dispose();
}));

test("disabled and missing local commands claim the key without invoking the global action or hook", () => withTestDocument(() => {
  let hookCalls = 0;
  const current = start([manifest("one", { hook: () => { hookCalls++; return false; } })]);
  const definition = current.components.get("one.panel");
  // Use a real command lifecycle, not a second dispatcher or a fabricated execute result.
  const release = current.router.register("one", { id: "one.unavailable", enabled: () => false, run: () => assert.fail("disabled command") });
  current.components.register("one", { ...definition, id: "one.unavailable-panel", permissions: { commands: ["one.unavailable"] },
    mount(element) { element.append(document.createElement("button")); return { handleKeyDown: () => { hookCalls++; return false; } }; } });
  const cell = current.host.ensure("one.unavailable-panel", "panel"); current.root.append(cell);
  current.router.shortcuts.register("one", { id: "one.unavailable-key", command: "one.unavailable", keys: ["I"], scope: "component", componentId: "one.unavailable-panel" });
  const button = cell.querySelector("button");
  assert.equal(press(button, "i").defaultPrevented, true);
  release(); assert.equal(current.router.describe("one.unavailable"), null); press(button, "i");
  assert.deepEqual(current.calls, []); assert.equal(hookCalls, 0); current.dispose();
}));

test("local command exceptions and async rejection consume once and report without reaching global", async () => withTestDocument(async () => {
  const current = start([manifest("one")]), errors = [];
  // The fixture listener has no reporting callback, so exercise a separately scoped root.
  const errorRoot = document.createElement("div"); document.body.append(errorRoot);
  const cell = current.host.ensure("one.panel", "panel"); errorRoot.append(cell);
  const stopError = bindKeyboard(current.router, { root: errorRoot, components: current.host, isMac: false, onError: error => errors.push(error.message) });
  for (const [name, key, behavior] of [["throws", "T", () => { throw new Error("local run"); }],
    ["rejects", "R", () => Promise.reject(new Error("local rejection"))], ["predicate", "P", () => {}]]) {
    current.router.register("one", { id: `one.${name}`, run: behavior,
      ...(name === "predicate" ? { enabled: () => { throw new Error("local predicate"); } } : {}) });
    const definition = current.components.get("one.panel");
    // A new fixture cell explicitly grants these test commands through the existing context.
    current.components.register("one", { ...definition, id: `one.${name}-panel`, permissions: { commands: [`one.${name}`] } });
    const testCell = current.host.ensure(`one.${name}-panel`, "panel"); errorRoot.append(testCell);
    current.router.shortcuts.register("one", { id: `one.${name}-key`, command: `one.${name}`, keys: [key], scope: "component", componentId: `one.${name}-panel` });
    assert.equal(press(testCell.querySelector("button"), key.toLowerCase()).defaultPrevented, true);
  }
  await Promise.resolve(); assert.deepEqual(errors.sort(), ["local predicate", "local rejection", "local run"]);
  assert.deepEqual(current.calls, []); stopError(); current.dispose(); errorRoot.remove();
}));

test("a direct internal binding cannot bypass component permissions or act on a foreign replacement owner", () => withTestDocument(() => {
  const current = start([manifest("one")]);
  current.router.register("host", { id: "host.denied", run: () => assert.fail("permission bypass") });
  current.router.shortcuts.register("one", { id: "one.denied-key", command: "host.denied", keys: ["D"], scope: "component", componentId: "one.panel" });
  assert.equal(press(current.query("#button-one"), "d").defaultPrevented, true); assert.equal(current.notices.length, 1);
  const oldBinding = current.router.shortcuts.describe("one.inspect-key");
  assert.equal(current.host.executeShortcut({ ...oldBinding, owner: "other" }, [current.query("#button-one"), current.root.children[0]]).code, "shortcut.inactive-component");
  assert.deepEqual(current.calls, []); current.dispose();
}));

test("visible cell moves preserve binding target and hidden or released instances do not receive local commands", () => withTestDocument(() => {
  const current = start([manifest("one")]); const button = current.query("#button-one"), cell = button.parentNode;
  const left = document.createElement("div"), right = document.createElement("div"); current.root.append(left, right);
  left.append(cell); press(button, "i"); right.append(cell); press(button, "i");
  cell.hidden = true; current.host.setVisible("one.panel", false); press(button, "i");
  cell.hidden = false; current.host.setVisible("one.panel", true); press(button, "i");
  current.host.release("one.panel"); press(button, "i");
  assert.deepEqual(current.calls, ["one.inspect", "one.inspect", "one.inspect"]); current.dispose();
}));

test("menus and layout hints read current mapping rather than the frozen legacy command keys", () => withTestDocument(() => {
  const current = runtime();
  current.router.register("host", { id: "host.action", label: "测试", keys: ["Mod+J"], run() {} });
  current.menus.contribute("host", { menu: "view", command: "host.action" });
  const bar = createMenubar(current); document.body.append(bar);
  const hint = () => { bar.querySelector(".menu-trigger").click(); const text = document.body.querySelector("kbd").textContent;
    closePopover({ restoreFocus: false }); return text; };
  assert.ok(hint().endsWith("+J")); current.router.shortcuts.setKeys("host.action", ["Alt+K"]);
  assert.equal(hint(), "Alt+K"); current.router.shortcuts.setKeys("host.action", []); assert.equal(hint(), "");
  for (const side of ["top", "left", "right", "bottom"]) current.router.register("host", { id: `frame.dock.${side}`, keys: [`Mod+Alt+Arrow${({ top: "Up", left: "Left", right: "Right", bottom: "Down" })[side]}`], run() {} });
  current.router.shortcuts.setKeys("frame.dock.left", ["Alt+L"]);
  const panel = renderLayoutPanel({ ...current, layout: { get: () => ({ docks: Object.fromEntries(["top", "left", "right", "bottom"].map(side => [side, { open: true }])) }) } });
  assert.equal(panel.querySelectorAll("kbd")[1].textContent, "Alt+L");
  closePopover({ restoreFocus: false });
}));

test("actual preview entry creates one shared shortcut module without adding a platform plugin or changing teardown", async () => withTestDocument(async () => {
  const runtime = await importPreviewForTest(), { root } = runtime;
  assert.equal(runtime.router.shortcuts, runtime.shortcuts); assert.deepEqual(runtime.platform.list().map(item => item.manifest.id), ["frame.builtin", "frame.layout", "notation.core"]);
  assert.deepEqual(runtime.shortcuts.list(), []); // This preview has no newly assigned default key gestures.
  document.getElementById("composer-edit").click(); press(document.getElementById("score-stage"), "Escape");
  assert.equal(document.getElementById("grip-left").disabled, true);
  window.dispatchEvent(new Event("pagehide")); assert.deepEqual(runtime.shortcuts.list(), []); assert.equal(root.querySelector(".visual-shell"), null);
}));
