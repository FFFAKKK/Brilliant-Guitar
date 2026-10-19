import { importPreviewForTest } from "./support/workspace-runtime-test.js";
import test from "node:test";
import assert from "node:assert/strict";
import { createCommandRouter } from "../src/runtime/command-router.js";
import { createComponentRegistry } from "../src/runtime/component-registry.js";
import { createComponentHost } from "../src/runtime/component-host.js";
import { createCommandDialogs } from "../src/host/command-dialogs.js";
import { createWorkspaceState } from "../src/layout/workspace-state.js";
import { bindWorkspaceCommands, WORKSPACE_COMMANDS as C } from "../src/host/workspace-commands.js";
import { bindKeyboard } from "../src/host/keyboard.js";
import { closePopover, openPopover, popoverAnchor } from "../src/shell/popover.js";
import { LAYOUT_PAGE_ID as RUNTIME_LAYOUT_PAGE_ID } from "../src/features/workspace-layout-plugin.js";
import { withTestDocument } from "./support/dom-test-environment.js";

// Explicit native-method doubles: no layout, inertness or native Tab/focus assertions here.
function modalMethods(document, { unsupported = false, failShow = false } = {}) {
  const create = document.createElement;
  let opens = 0, closes = 0;
  document.createElement = tag => {
    const node = create(tag);
    if (tag === "dialog" && !unsupported) {
      node.open = false;
      node.showModal = () => {
        if (failShow) throw new Error("native open failure");
        node.open = true; node.setAttribute("open", ""); opens++;
      };
      node.close = () => { node.open = false; node.removeAttribute("open"); closes++; node.dispatchEvent(new Event("close")); };
    }
    return node;
  };
  return { get opens() { return opens; }, get closes() { return closes; } };
}
function press(target, key, options = {}) {
  const event = new Event("keydown", { bubbles: true, cancelable: true });
  Object.assign(event, { key, ctrlKey: false, altKey: false, metaKey: false, shiftKey: false, isComposing: false, ...options });
  target.dispatchEvent(event); return event;
}
const request = (command = "example.action", payload = {}) => ({ title: "确认操作", message: "执行当前操作。", command, payload });
function start(options = {}) {
  const native = modalMethods(document, options), subscriptions = { router: 0, source: 0 };
  const calls = [], notices = [], contexts = {}, registry = createComponentRegistry();
  const store = createWorkspaceState({ pageIds: ["example.page"], layoutPageId: "example.page", width: innerWidth, height: innerHeight });
  const original = createCommandRouter();
  const track = (key, subscribe, listener) => {
    const stop = subscribe(listener); subscriptions[key]++;
    let active = true;
    return () => { if (active) { active = false; subscriptions[key]--; stop(); } };
  };
  const router = { ...original, execute(id, payload) { calls.push([id, payload]); return original.execute(id, payload); },
    subscribe: listener => track("router", original.subscribe, listener) };
  const stopWorkspace = bindWorkspaceCommands({ router, store, stage: { zoom() {} } });
  let releaseAction;
  const registerAction = command => { releaseAction = router.register("example", { id: "example.action", run: () => ({ ok: true }), ...command }); };
  registerAction(options.command);
  const root = document.createElement("div"), fallback = document.createElement("button"); fallback.id = "dialog-fallback";
  document.body.append(root); root.append(fallback);
  const sources = [{ subscribe: listener => {
    if (options.failSubscribe) throw new Error("source subscription failed");
    return track("source", store.read.subscribe, listener);
  } }];
  const dialogs = createCommandDialogs({ router, sources, fallbackFocus: () => fallback });
  const host = createComponentHost({ registry, router, notices: { push: value => notices.push(value) }, ...(options.noProvider ? {} : { dialogs }) });
  const register = (id = "example.panel", mount) => registry.register("example", { id, title: "示例组件", role: "tool", slots: ["right"],
    permissions: { commands: options.permissions ?? ["example.action", C.region] }, mount(element, ctx) {
      contexts[id] = ctx;
      if (mount) return mount(element, ctx);
      const input = document.createElement("input"); input.value = "保留输入";
      const button = document.createElement("button"); button.textContent = "申请确认";
      element.append(input, button);
    } });
  const unregister = register();
  const mount = (id = "example.panel") => { const cell = host.ensure(id, "panel"); root.append(cell); cell.querySelector("button")?.focus(); return cell; };
  const element = mount();
  const query = selector => document.querySelector(selector);
  return { native, calls, notices, contexts, registry, store, router, host, dialogs, root, fallback, element, subscriptions,
    register, mount, unregister, registerAction, removeAction: () => releaseAction(), query,
    open: (raw = request()) => contexts["example.panel"].confirm(raw),
    confirm: () => query('[data-dialog-action="confirm"]'), cancel: () => query('[data-dialog-action="cancel"]'),
    dispose() { dialogs.dispose(); host.dispose(); releaseAction(); stopWorkspace(); root.remove(); closePopover({ restoreFocus: false }); },
  };
}
const withDialog = (run, options) => withTestDocument(async () => {
  const current = start(options);
  try { return await run(current); } finally { current.dispose(); }
});

test("confirmation is optional; historical component contexts keep their three capabilities", () => withDialog(current => {
  assert.deepEqual(Object.keys(current.contexts["example.panel"]).sort(), ["execute", "notify", "onDispose"]);
  assert.equal(current.query("dialog"), null);
}, { noProvider: true }));

test("opening does not execute; native confirmation reuses ctx and the existing workspace command exactly once with captured data", () => withDialog(async current => {
  const trigger = document.activeElement, raw = request(C.region, { region: "left" });
  const before = current.store.read.snapshot().leftOpen, opening = current.open(raw); raw.payload.region = "right";
  assert.equal(opening.ok, true); assert.equal(current.calls.length, 0);
  assert.equal(current.query("dialog").open, true); assert.equal(current.query("dialog").getAttribute("aria-modal"), "true");
  assert.equal(document.activeElement, current.cancel());
  current.confirm().click();
  assert.deepEqual(current.calls, [[C.region, { region: "left" }]]);
  assert.equal(current.store.read.snapshot().leftOpen, !before);
  assert.deepEqual(await opening.finished, { status: "confirmed", dispatched: true, result: { ok: true, changed: true } });
  assert.equal(current.query("dialog"), null); assert.equal(document.activeElement, trigger);
  assert.deepEqual(current.subscriptions, { router: 0, source: 0 });
}));

test("cancel and Escape run no command, preserve the editing session and restore the actual trigger", () => withDialog(async current => {
  current.router.execute(C.begin); current.calls.length = 0;
  const trigger = document.activeElement, input = current.element.querySelector("input");
  let opening = current.open(); current.cancel().click();
  assert.deepEqual(await opening.finished, { status: "cancelled", dispatched: false });
  assert.equal(document.activeElement, trigger);
  opening = current.open(); press(current.cancel(), "Escape");
  assert.equal((await opening.finished).status, "cancelled");
  assert.equal(current.store.read.snapshot().adjusting, true); assert.equal(current.calls.length, 0); assert.equal(input.value, "保留输入");
}));

test("data-only requests reject functions, DOM, cycles, unknown fields and malformed text without opening or executing", () => withDialog(current => {
  const cycle = {}; cycle.self = cycle;
  for (const raw of [null, [], { ...request(), title: "" }, { ...request(), confirmLabel: "" }, { ...request(), mount() {} },
    request("example.action", { callback() {} }), request("example.action", { node: current.element }), request("example.action", cycle),
    request("example.action", { number: Infinity }), request("example.action", null), request("example.action", [])]) {
    assert.equal(current.open(raw).code, "dialog.invalid-request");
  }
  assert.equal(current.calls.length, 0); assert.equal(current.native.opens, 0);
}));

test("a dialog cannot grant a command absent from the owner's original permissions", () => withDialog(current => {
  assert.equal(current.open(request(C.region, { region: "left" })).code, "permission.denied");
  assert.equal(current.query("dialog"), null); assert.equal(current.calls.length, 0);
}, { permissions: ["example.action"] }));

test("missing, disabled and malformed states are rejected before opening", () => withDialog(current => {
  current.removeAction(); assert.equal(current.open().code, "command.missing");
  current.registerAction({ enabled: () => false }); assert.equal(current.open().code, "command.disabled");
  current.removeAction(); current.registerAction({ enabled: () => "invalid" }); assert.equal(current.open().code, "command.state-error");
  assert.equal(current.calls.length, 0); assert.equal(current.native.opens, 0);
}));

test("open state updates preserve controls and input, and a stale enabled display is checked again before execution", () => {
  let enabled = true;
  return withDialog(async current => {
    const input = current.element.querySelector("input"), opening = current.open(), button = current.confirm();
    button.focus(); enabled = false; current.store.resize("right", 300);
    assert.equal(current.confirm(), button); assert.equal(button.disabled, true); assert.equal(document.activeElement, current.cancel());
    assert.equal(input.value, "保留输入");
    enabled = true; current.router.refresh(); assert.equal(button.disabled, false);
    enabled = false; button.dispatchEvent(new Event("click"));
    assert.equal(current.calls.length, 0); assert.match(current.query(".v-command-dialog-feedback").textContent, /当前不可用/);
    enabled = true; current.router.refresh(); button.click(); assert.equal((await opening.finished).status, "confirmed");
    assert.equal(current.calls.length, 1);
  }, { command: { enabled: () => enabled } });
});

test("command failure keeps the dialog with visible feedback and permits a successful retry", () => {
  let fail = true;
  return withDialog(async current => {
    const opening = current.open(); current.confirm().click();
    assert.ok(current.query("dialog")); assert.equal(current.confirm().disabled, false);
    assert.match(current.query(".v-command-dialog-feedback").textContent, /失败.*重试/);
    assert.ok(current.notices.some(item => item.level === "error"));
    fail = false; current.confirm().click(); assert.equal((await opening.finished).status, "confirmed"); assert.equal(current.calls.length, 2);
  }, { command: { run() { if (fail) throw new Error("operation failed"); return { ok: true }; } } });
});

test("IME, modified Escape and AltGraph do not close the modal; Tab is left to native behavior", () => withDialog(async current => {
  const opening = current.open(), dialog = current.query("dialog"), button = current.cancel();
  for (const options of [{ isComposing: true }, { keyCode: 229 }, { ctrlKey: true }, { shiftKey: true }, { getModifierState: () => true }]) {
    const event = press(button, "Escape", options); assert.equal(event.defaultPrevented, true); assert.equal(current.query("dialog"), dialog);
  }
  assert.equal(press(button, "Tab").defaultPrevented, false); assert.equal(press(button, "Tab", { shiftKey: true }).defaultPrevented, false);
  press(button, "Escape"); assert.equal((await opening.finished).status, "cancelled");
}));

test("host shortcuts and fallback keys stay reserved during a body modal and resume afterward", () => withDialog(async current => {
  const release = current.router.shortcuts.register("example", { id: "example.shortcut", command: "example.action", scope: "global", keys: ["Alt+A"] });
  let fallbacks = 0;
  const stop = bindKeyboard(current.router, { root: current.root, components: current.host, fallback: () => fallbacks++ });
  const opening = current.open(); press(current.fallback, "a", { altKey: true }); press(current.fallback, "Escape");
  assert.equal(current.calls.length, 0); assert.equal(fallbacks, 0);
  current.cancel().click(); await opening.finished;
  press(current.fallback, "a", { altKey: true }); assert.equal(current.calls.length, 1);
  stop(); release();
}));

test("native cancellation closes cleanly while outside pointer does not imply cancellation", () => withDialog(async current => {
  const opening = current.open(), dialog = current.query("dialog");
  current.fallback.dispatchEvent(new Event("pointerdown", { bubbles: true })); assert.equal(current.query("dialog"), dialog);
  const cancel = new Event("cancel", { cancelable: true }); dialog.dispatchEvent(cancel);
  assert.equal(cancel.defaultPrevented, true); assert.equal((await opening.finished).status, "cancelled");
  assert.deepEqual(current.subscriptions, { router: 0, source: 0 });
}));

test("busy requests from either owner do not replace or stack the existing session", () => withDialog(async current => {
  const release = current.register("example.other"), other = current.mount("example.other");
  current.element.querySelector("button").focus(); const opening = current.open(), dialog = current.query("dialog");
  assert.equal(current.open().code, "dialog.busy");
  assert.equal(current.contexts["example.other"].confirm(request()).code, "dialog.busy");
  assert.equal(current.query("dialog"), dialog); assert.equal(current.native.opens, 1);
  current.cancel().click(); await opening.finished; release(); other.remove();
}));

test("hiding an owner closes its modal without unmounting input; showing restores eligibility", () => withDialog(async current => {
  const opening = current.open(), input = current.element.querySelector("input");
  current.host.setVisible("example.panel", false);
  assert.deepEqual(await opening.finished, { status: "owner-hidden", dispatched: false });
  assert.equal(document.activeElement, current.fallback); assert.equal(current.host.has("example.panel"), true);
  assert.equal(input.value, "保留输入"); assert.equal(current.open().code, "dialog.owner-unavailable");
  current.host.setVisible("example.panel", true); const next = current.open(); assert.equal(next.ok, true); current.cancel().click(); await next.finished;
}));

test("definition release disposes the owner's dialog and stale contexts cannot affect a same-id replacement", () => withDialog(async current => {
  const old = current.contexts["example.panel"], opening = current.open(); current.unregister();
  assert.equal((await opening.finished).status, "owner-disposed"); assert.equal(document.activeElement, current.fallback);
  assert.equal(old.confirm(request()).code, "component.disposed");
  const release = current.register(); current.mount(); const next = current.open();
  assert.equal(old.confirm(request()).code, "component.disposed"); assert.ok(current.query("dialog"));
  current.cancel().click(); await next.finished; release();
}));

test("mount failure releases a dialog even when the mounting component connected itself before failing", () => withDialog(async current => {
  let opening, context;
  const release = current.register("example.broken", (element, ctx) => {
    current.root.append(element); context = ctx; opening = ctx.confirm(request()); throw new Error("mount failure");
  });
  const fault = current.host.ensure("example.broken", "panel");
  assert.equal(opening.ok, true); assert.equal((await opening.finished).status, "owner-disposed");
  assert.equal(current.query("dialog"), null); assert.equal(context.confirm(request()).code, "component.disposed");
  assert.match(fault.textContent, /加载失败/); assert.deepEqual(current.subscriptions, { router: 0, source: 0 }); release();
}));

test("native unsupported and show failure return explicit errors with no modal/listener leak", async () => {
  for (const options of [{ unsupported: true }, { failShow: true }]) await withDialog(current => {
    const opening = current.open(); assert.equal(opening.ok, false);
    assert.equal(opening.code, options.unsupported ? "dialog.unsupported" : "dialog.open-failed");
    assert.equal(current.query("dialog"), null); assert.deepEqual(current.subscriptions, { router: 0, source: 0 });
    assert.equal(current.calls.length, 0); assert.equal(document.activeElement, current.element.querySelector("button"));
  }, options);
});

test("a failed subscription rolls back earlier subscriptions and leaves the component usable", () => withDialog(current => {
  assert.equal(current.open().code, "dialog.open-failed");
  assert.equal(current.query("dialog"), null); assert.deepEqual(current.subscriptions, { router: 0, source: 0 });
  assert.equal(current.contexts["example.panel"].execute("example.action").ok, true);
}, { failSubscribe: true }));

test("opening a supported modal closes the current menu; unsupported modality leaves the old surface owned", async () => {
  for (const unsupported of [false, true]) await withDialog(async current => {
    const anchor = current.element.querySelector("button"); openPopover(anchor, document.createElement("div"), { label: "原浮层" });
    const opening = current.open();
    if (unsupported) assert.equal(popoverAnchor(), anchor);
    else { assert.equal(popoverAnchor(), null); current.cancel().click(); await opening.finished; }
  }, { unsupported });
});

test("asynchronous confirmation executes once and dismissal or late completion cannot close a newer session", () => {
  let settle;
  return withDialog(async current => {
    const opening = current.open(), oldDialog = current.query("dialog"), oldButton = current.confirm();
    oldButton.click(); oldButton.dispatchEvent(new Event("click")); assert.equal(current.calls.length, 1);
    assert.equal(oldDialog.getAttribute("aria-busy"), "true"); assert.equal(current.cancel().getAttribute("aria-label"), "关闭");
    current.cancel().click(); assert.deepEqual(await opening.finished, { status: "dismissed", dispatched: true });
    const next = current.open(), dialog = current.query("dialog");
    oldDialog.dispatchEvent(new Event("close")); oldButton.dispatchEvent(new Event("click"));
    settle({ ok: true }); await new Promise(resolve => setImmediate(resolve));
    assert.equal(current.query("dialog"), dialog); assert.equal(current.calls.length, 1);
    current.cancel().click(); await next.finished;
  }, { command: { run: () => new Promise(resolve => { settle = resolve; }) } });
});

test("host disposal settles outstanding sessions, is idempotent and rejects future opens", () => withDialog(async current => {
  const opening = current.open(); current.dialogs.dispose(); current.dialogs.dispose();
  assert.deepEqual(await opening.finished, { status: "host-disposed", dispatched: false });
  assert.equal(current.query("dialog"), null); assert.deepEqual(current.subscriptions, { router: 0, source: 0 });
  assert.equal(current.open().code, "dialog.disposed");
}));

test("async rejection supports retry while late rejection after owner disposal is drained without stale feedback", () => {
  const rejectors = [];
  return withDialog(async current => {
    const opening = current.open(); current.confirm().click(); rejectors[0](new Error("async failure"));
    await new Promise(resolve => setImmediate(resolve));
    assert.match(current.query(".v-command-dialog-feedback").textContent, /失败.*重试/); assert.equal(current.confirm().disabled, false);
    current.confirm().click(); const count = current.notices.length; current.unregister();
    assert.deepEqual(await opening.finished, { status: "owner-disposed", dispatched: true });
    rejectors[1](new Error("late failure")); await new Promise(resolve => setImmediate(resolve));
    assert.equal(current.notices.length, count); assert.equal(current.query("dialog"), null);
  }, { command: { run: () => new Promise((_, reject) => rejectors.push(reject)) } });
});

test("a command that hides its owner completes its mutation without pretending dialog closure rolled it back", () => {
  let current;
  return withDialog(async value => {
    current = value; const opening = current.open(); current.confirm().click();
    assert.deepEqual(await opening.finished, { status: "owner-hidden", dispatched: true });
    assert.equal(current.store.read.snapshot().leftOpen, true); assert.equal(current.query("dialog"), null);
    assert.deepEqual(current.subscriptions, { router: 0, source: 0 });
  }, { command: { run() { current.store.toggleRegion("left"); current.host.setVisible("example.panel", false); return { ok: true }; } } });
});

test("command release and restoration update the same confirm control, and blocked global keys are never advertised on it", () => withDialog(async current => {
  const release = current.router.shortcuts.register("example", { id: "example.dialog-key", command: "example.action", scope: "global", keys: ["Alt+A"] });
  const opening = current.open(), confirm = current.confirm();
  assert.equal(confirm.getAttribute("aria-keyshortcuts"), null); assert.equal(confirm.title.includes("Alt+A"), false);
  current.removeAction(); assert.equal(confirm.disabled, true); assert.equal(current.confirm(), confirm);
  confirm.dispatchEvent(new Event("click")); assert.equal(current.calls.length, 0);
  current.registerAction({}); assert.equal(confirm.disabled, false); confirm.click(); assert.equal((await opening.finished).status, "confirmed"); release();
}));

test("an unavailable original anchor uses another live owner control and never focuses a hidden ancestor", () => withDialog(async current => {
  const trigger = document.activeElement, input = current.element.querySelector("input"), opening = current.open();
  trigger.disabled = true; current.cancel().click(); await opening.finished;
  assert.equal(document.activeElement, input);
  const next = current.open(); current.element.hidden = true; current.cancel().click(); await next.finished;
  assert.equal(document.activeElement, current.fallback);
}));

test("default runtime installs the optional capability without another plugin, leaves normal buttons immediate, and clears a modal on pagehide", () => withTestDocument(async () => {
  modalMethods(document);
  const current = await importPreviewForTest({ observeContexts: true }), { root } = current;
  try {
    assert.deepEqual(current.platform.list().map(item => item.manifest.id), ["frame.builtin", "frame.layout", "notation.core"]);
    assert.equal(document.querySelector("dialog"), null);
    const before = current.store.read.snapshot().leftOpen;
    document.getElementById("module-panel-trigger").click(); assert.equal(current.store.read.snapshot().leftOpen, !before); assert.equal(document.querySelector("dialog"), null);
    current.router.execute("frame.workspace.page.select", { id: RUNTIME_LAYOUT_PAGE_ID, toggle: false });
    document.getElementById("composer-edit").focus();
    const opening = current.observedContexts[RUNTIME_LAYOUT_PAGE_ID].confirm(request(C.region, { region: "left" }));
    assert.equal(opening.ok, true); assert.ok(document.querySelector("dialog"));
    window.dispatchEvent(new Event("pagehide"));
    assert.equal((await opening.finished).status, "host-disposed"); assert.equal(document.querySelector("dialog"), null); assert.equal(root.children.length, 0);
  } finally { window.dispatchEvent(new Event("pagehide")); }
}));
