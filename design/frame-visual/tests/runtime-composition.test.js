import assert from "node:assert/strict";
import test from "node:test";
import { createWorkspaceRuntime } from "../src/host/workspace-runtime.js";
import { defineUiPlugin } from "../src/runtime/ui-plugin-contract.js";
import { WORKSPACE_COMMANDS as C } from "../src/host/workspace-commands.js";
import { SIDEBAR_COMMANDS as S } from "../src/host/sidebar-commands.js";
import { LAYOUT_PAGE_ID } from "../src/features/builtin-pages.js";
import { serializeDom, withTestDocument } from "./support/dom-test-environment.js";
import { importOriginalPreviewForTest, importPreviewForTest, loadRuntimeForTest } from "./support/workspace-runtime-test.js";
import { omitAcceptedReadingMarkup, normalizeScorePaperContent, normalizeLegacyLayoutIdentity, normalizeContentEditScope, normalizeCommandBarChrome, omitFrameEdgeHandles, normalizeUnavailableLibraryHint, normalizeUnknownMeasureCount } from "./support/accepted-reading-markup.js";

function rootWithSentinel() {
  const root = document.createElement("div"), sentinel = document.createElement("span");
  root.id = "app"; sentinel.textContent = "application-owned"; root.append(sentinel); document.body.append(root);
  return { root, sentinel };
}
function trackEvents(target, names) {
  const active = Object.fromEntries(names.map(name => [name, new Set()]));
  const add = target.addEventListener.bind(target), remove = target.removeEventListener.bind(target);
  target.addEventListener = (name, callback, ...rest) => { add(name, callback, ...rest); active[name]?.add(callback); };
  target.removeEventListener = (name, callback, ...rest) => { remove(name, callback, ...rest); active[name]?.delete(callback); };
  return { count: name => active[name].size, restore() { target.addEventListener = add; target.removeEventListener = remove; } };
}
function press(target, key, properties = {}) {
  const event = new Event("keydown", { bubbles: true, cancelable: true });
  Object.assign(event, { key, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, isComposing: false, ...properties });
  target.dispatchEvent(event); return event;
}
function normalizeGeometryRevision(node) {
  if (Array.isArray(node)) return node.map(normalizeGeometryRevision);
  if (!node || typeof node !== "object") return node;
  const copy = Object.fromEntries(Object.entries(node).map(([key, value]) => [key, normalizeGeometryRevision(value)]));
  if (copy.attributes?.class === "v-grip") delete copy.attributes.disabled;
  if (copy.style && typeof copy.style === "object") {
    copy.style = { ...copy.style };
    for (const key of ["--top-h", "--visible-top", "--voice-content"]) delete copy.style[key];
  }
  return copy;
}
function normalizeWorkspaceGeometry(state) {
  const copy = { ...state };
  for (const key of ["leftWidth", "rightWidth", "topHeight", "voiceHeight", "limits", "valueLimits"]) delete copy[key];
  return copy;
}
function samplePlugin({ namespace = "example", globalKeys = ["Alt+J"], failMount = false, failCleanup = false, slots = ["left", "right"], defaultSlot = "right" } = {}) {
  const state = { mounts: 0, disposals: 0, cleanup: 0, calls: [], ctx: null, element: null, input: null, button: null };
  const command = `${namespace}.action`, panel = `${namespace}.panel`;
  const manifest = defineUiPlugin({ namespace, commands: [{ id: command, keys: globalKeys, run() {
    state.calls.push({ input: state.input?.value, element: state.element }); return { ok: true };
  } }], menuItems: [{ menu: "plugins", command, label: "示例操作" }],
  shortcuts: [{ id: `${namespace}.local`, command, componentId: panel, scope: "component", keys: ["Alt+K"] }],
  ui: [{ id: panel, kind: "panel", title: "示例面板", slots, defaultSlot, defaultEnabled: true,
    permissions: { commands: [command] }, mount(element, ctx) {
      state.mounts++; state.ctx = ctx; state.element = element;
      ctx.onDispose(() => { state.cleanup++; });
      if (failMount) throw new Error("sample mount failure");
      const input = document.createElement("input"), button = document.createElement("button");
      input.setAttribute("aria-label", "示例输入"); button.textContent = "执行";
      button.addEventListener("click", () => ctx.execute(command)); element.append(input, button);
      state.input = input; state.button = button;
      return { dispose() { state.disposals++; if (failCleanup) throw new Error("sample cleanup failure"); } };
    } }],
  });
  return { manifest, state, command, panel };
}

function stagePlugin(namespace) {
  return defineUiPlugin({ namespace, ui: [{ id: `${namespace}.stage`, kind: "view", title: "测试谱面", slots: ["stage"],
    permissions: { commands: [] }, mount(element) {
      element.append(document.createElement("span"));
      return { dispose() { element.replaceChildren(); } };
    } }] });
}

// Fault injection wraps real constructors only in a test copy of the composition
// root. Every unaffected owner is the actual module; production has no DI hooks.
async function inspectedFactory(overrides = {}) {
  const constructors = ["createCommandRouter", "createShortcutRouter", "createComponentRegistry", "createMenuRegistry",
    "createPluginPlatform", "createWorkspaceState", "createSidebarCompositionState", "createComponentHost",
    "createSidebarPresentation", "createCommandDialogs", "createVisualWorkbench", "createStageViewport"];
  return loadRuntimeForTest({ transform(source) {
    for (const name of constructors) {
      const pattern = new RegExp(`import \\{ ${name} \\} from ("[^"]+");`);
      assert.match(source, pattern);
      source = source.replace(pattern, `import { ${name} as original_${name} } from $1;
        const ${name} = (...args) => {
          const owner = original_${name}(...args);
          let result = ${overrides[name] ?? "owner"};
          ${["createCommandRouter", "createComponentRegistry", "createMenuRegistry"].includes(name) ? `result = countSubscriptions(result, "${name}");` : ""}
          ${["createWorkspaceState", "createSidebarCompositionState"].includes(name) ? `result = { ...result, read: countSubscriptions(result.read, "${name}") };` : ""}
          ${name === "createVisualWorkbench" ? `const activeScroll = new Set(), add = result.scroll.addEventListener.bind(result.scroll), remove = result.scroll.removeEventListener.bind(result.scroll);
            result.scroll.addEventListener = (name, callback, ...rest) => { add(name, callback, ...rest); if (name === "scroll") activeScroll.add(callback); };
            result.scroll.removeEventListener = (name, callback, ...rest) => { remove(name, callback, ...rest); if (name === "scroll") activeScroll.delete(callback); };
            acquired.scrollListeners = activeScroll;` : ""}
          acquired.${name} = result; return result;
        };`);
    }
    return `export const acquired = { subscriptions: {} };
      function countSubscriptions(port, label) {
        acquired.subscriptions[label] = 0;
        return { ...port, subscribe(listener) {
          const stop = port.subscribe(listener); acquired.subscriptions[label]++;
          let active = true;
          return () => { if (!active) return; active = false;
            try { stop(); } finally { acquired.subscriptions[label]--; }
          };
        } };
      }
    ` + source;
  } });
}
function assertReleased(acquired, root, sentinel) {
  assert.deepEqual(root.children, [sentinel]);
  assert.deepEqual(acquired.createPluginPlatform?.list() ?? [], []);
  assert.deepEqual(acquired.createComponentRegistry?.list() ?? [], []);
  assert.deepEqual(acquired.createComponentHost?.mounted() ?? [], []);
  for (const id of [...Object.values(C), ...Object.values(S), "example.action", "broken.action", "later.action"]) {
    assert.equal(acquired.createCommandRouter?.describe(id) ?? null, null, id);
  }
  assert.deepEqual(acquired.createShortcutRouter?.list() ?? [], []);
  assert.ok((acquired.createMenuRegistry?.resolve() ?? []).every(menu => menu.groups.flat().length === 0));
  assert.ok(Object.values(acquired.subscriptions).every(count => count === 0), JSON.stringify(acquired.subscriptions));
  assert.equal(acquired.scrollListeners?.size ?? 0, 0);
}
function allErrors(error) { return [error, ...(error.errors ?? []).flatMap(allErrors)]; }

test("importing the reusable runtime does not mount a shell or acquire browser listeners", () => withTestDocument(async () => {
  const { root, sentinel } = rootWithSentinel(), docEvents = trackEvents(document, ["keydown"]), winEvents = trackEvents(window, ["resize", "pagehide"]);
  try {
    const imported = await import(new URL("../src/host/workspace-runtime.js?import-only", import.meta.url));
    assert.equal(typeof imported.createWorkspaceRuntime, "function"); assert.deepEqual(root.children, [sentinel]);
    assert.equal(docEvents.count("keydown"), 0); assert.equal(winEvents.count("resize"), 0); assert.equal(winEvents.count("pagehide"), 0);
  } finally { docEvents.restore(); winEvents.restore(); }
}));

test("the application API is frozen and narrow, and its read subscriptions follow the runtime lifetime", () => withTestDocument(() => {
  const { root, sentinel } = rootWithSentinel(), runtime = createWorkspaceRuntime({ root });
  let notifications = 0;
  try {
    assert.deepEqual(Object.keys(runtime).sort(), ["dispose", "execute", "workspace"]);
    assert.deepEqual(Object.keys(runtime.workspace).sort(), ["snapshot", "subscribe"]);
    assert.ok(Object.isFrozen(runtime) && Object.isFrozen(runtime.workspace) && Object.isFrozen(runtime.workspace.snapshot()));
    assert.throws(() => runtime.workspace.subscribe(null), TypeError);
    const stop = runtime.workspace.subscribe(() => notifications++);
    runtime.execute(C.region, { region: "left" }); assert.equal(notifications, 1); stop(); stop();
    runtime.execute(C.region, { region: "right" }); assert.equal(notifications, 1);
    runtime.workspace.subscribe(() => notifications++);
  } finally { runtime.dispose(); }
  const count = notifications, snapshot = runtime.workspace.snapshot();
  window.dispatchEvent(new Event("resize")); window.dispatchEvent(new Event("pagehide"));
  assert.equal(notifications, count); assert.deepEqual(root.children, [sentinel]); assert.equal(runtime.workspace.snapshot(), snapshot);
  assert.equal(runtime.execute(C.region, { region: "left" }).code, "runtime.disposed");
  assert.throws(() => runtime.workspace.subscribe(() => {}), /已释放/); runtime.dispose();
}));

test("disposal during a notification prevents later read callbacks already copied into that delivery", () => withTestDocument(() => {
  const { root, sentinel } = rootWithSentinel(), runtime = createWorkspaceRuntime({ root });
  let staleCalls = 0;
  runtime.workspace.subscribe(() => runtime.dispose());
  runtime.workspace.subscribe(() => staleCalls++);
  runtime.execute(C.region, { region: "left" });
  assert.equal(staleCalls, 0); assert.deepEqual(root.children, [sentinel]); runtime.dispose();
}));

test("unsubscribing another read callback during delivery suppresses that already queued callback", () => withTestDocument(() => {
  const { root } = rootWithSentinel(), runtime = createWorkspaceRuntime({ root });
  let staleCalls = 0, stop;
  runtime.workspace.subscribe(() => stop());
  stop = runtime.workspace.subscribe(() => staleCalls++);
  try { runtime.execute(C.region, { region: "left" }); assert.equal(staleCalls, 0); }
  finally { runtime.dispose(); }
}));

for (const [width, height] of [[1024, 720], [1280, 800], [1440, 900]]) {
  test(`the extracted root matches the saved entry's DOM and state through ordinary operations at ${width}x${height}`, async () => {
    async function capture(original) {
      return withTestDocument(async () => {
        const { root } = rootWithSentinel();
        const old = original ? await importOriginalPreviewForTest() : null;
        const current = old ?? createWorkspaceRuntime({ root });
        const execute = old?.router.execute ?? current.execute;
        const read = old?.store.read ?? current.workspace;
        const frames = [];
        const actions = [null, [C.region, { region: "left" }], [C.resize, { side: "right", value: 300 }],
          [C.page, { id: "frame.builtin.assistant", toggle: false }], [C.region, { region: "voice" }],
          [C.begin, {}], [S.enabled, { id: "frame.builtin.tone", enabled: false }], [C.finish, { confirm: false }],
          [C.arrange, { mode: "compact" }], [C.region, { region: "top" }]];
        try {
          for (const action of actions) {
            if (action) assert.equal(execute(...action).ok, true);
            const dom = normalizeGeometryRevision(normalizeLegacyLayoutIdentity(normalizeScorePaperContent(omitAcceptedReadingMarkup(omitFrameEdgeHandles(serializeDom(root))))));
            frames.push({
              dom: original ? normalizeUnknownMeasureCount(normalizeUnavailableLibraryHint(normalizeCommandBarChrome(normalizeContentEditScope(dom)))) : dom,
              state: normalizeWorkspaceGeometry(normalizeLegacyLayoutIdentity(read.snapshot())),
            });
          }
        } finally { if (old) window.dispatchEvent(new Event("pagehide")); else current.dispose(); }
        return frames;
      }, { width, height });
    }
    assert.deepEqual(await capture(false), await capture(true));
  });
}

test("an independent panel's button, menu, local and global keys execute the same plugin handler once", () => withTestDocument(() => {
  const { root } = rootWithSentinel(), sample = samplePlugin(), runtime = createWorkspaceRuntime({ root, plugins: [sample.manifest] });
  try {
    assert.equal(sample.state.mounts, 0);
    assert.equal(runtime.execute(C.page, { id: sample.panel, toggle: false }).ok, true);
    const { state } = sample; state.input.value = "私有输入";
    assert.deepEqual(Object.keys(state.ctx).sort(), ["confirm", "execute", "notify", "onDispose"]);
    assert.equal(state.ctx.execute(C.region, { region: "left" }).code, "permission.denied");
    assert.equal(state.calls.length, 0);
    state.button.click(); assert.equal(state.calls.length, 1);
    assert.equal(press(state.button, "k", { altKey: true }).defaultPrevented, true); assert.equal(state.calls.length, 2);
    assert.equal(press(root.querySelector("#score-stage"), "j", { altKey: true }).defaultPrevented, true); assert.equal(state.calls.length, 3);
    root.querySelector("#menu-plugins").click();
    const row = document.querySelectorAll(".v-menu-item").find(node => node.querySelector(".v-menu-label")?.textContent === "示例操作");
    assert.ok(row); assert.equal(row.querySelector("kbd").textContent, "Alt+J"); row.click(); assert.equal(state.calls.length, 4);
    assert.ok(state.calls.every(call => call.input === "私有输入" && call.element === state.element));
    assert.equal(document.querySelector(".v-menu-popup"), null);
  } finally { runtime.dispose(); }
  assert.equal(sample.state.disposals, 1); assert.equal(sample.state.cleanup, 1);
  assert.equal(sample.state.ctx.execute(sample.command).code, "component.disposed");
}));

test("moving and cancelling a dual-slot panel retains its cell, input, selection, scroll and command target", () => withTestDocument(() => {
  const { root } = rootWithSentinel(), sample = samplePlugin(), runtime = createWorkspaceRuntime({ root, plugins: [sample.manifest] });
  try {
    runtime.execute(C.page, { id: sample.panel, toggle: false });
    const { element, input, button } = sample.state;
    input.value = "不要丢失"; input.selectionStart = 2; input.selectionEnd = 4; input.scrollTop = 17;
    runtime.execute(C.region, { region: "left" });
    assert.equal(runtime.execute(S.move, { id: sample.panel, slot: "left" }).code, "command.disabled");
    assert.equal(runtime.execute(C.begin).ok, true);
    assert.equal(runtime.execute(S.move, { id: sample.panel, slot: "left" }).ok, true);
    assert.equal(element.parentNode, root.querySelector(".v-modules")); assert.equal(sample.state.mounts, 1);
    button.click(); assert.equal(sample.state.calls.at(-1).element, element);
    runtime.execute(C.region, { region: "left" }); runtime.execute(C.region, { region: "left" });
    assert.equal(sample.state.element, element);
    assert.equal(runtime.execute(C.finish, { confirm: false }).ok, true);
    runtime.execute(C.page, { id: sample.panel, toggle: false });
    assert.equal(element.parentNode, root.querySelector(".v-page")); assert.equal(sample.state.mounts, 1);
    assert.equal(input.value, "不要丢失"); assert.equal(input.selectionStart, 2); assert.equal(input.selectionEnd, 4); assert.equal(input.scrollTop, 17);
    button.click(); assert.equal(sample.state.calls.at(-1).element, element);
  } finally { runtime.dispose(); }
  assert.equal(sample.state.disposals, 1);
}));

test("a left-only declaration stays out of right navigation and mounts only when the left sidebar is opened", () => withTestDocument(() => {
  const { root } = rootWithSentinel(), sample = samplePlugin({ slots: ["left"], defaultSlot: "left" });
  const runtime = createWorkspaceRuntime({ root, plugins: [sample.manifest] });
  try {
    assert.equal(root.querySelector("#page-tab-" + sample.panel), null); assert.equal(sample.state.mounts, 0);
    assert.equal(runtime.execute(C.page, { id: sample.panel }).ok, false);
    assert.equal(runtime.execute(C.region, { region: "left" }).ok, true); assert.equal(sample.state.mounts, 1);
    assert.equal(sample.state.element.parentNode, root.querySelector(".v-modules"));
  } finally { runtime.dispose(); }
}));

test("legacy surface aliases use the contribution id for navigation and the component id for mount", () => withTestDocument(() => {
  const { root } = rootWithSentinel(); let mounts = 0;
  const plugin = { namespace: "alias", components: [{ id: "alias.component", role: "inspector", title: "别名面板", slots: ["right"], mount() { mounts++; } }],
    facets: { ui: { contractVersion: 1, modules: [], pages: [{ id: "alias.surface", componentId: "alias.component", slots: ["right"] }], slots: ["right"] } } };
  const runtime = createWorkspaceRuntime({ root, plugins: [plugin] });
  try {
    assert.equal(runtime.execute(C.page, { id: "alias.surface", toggle: false }).ok, true); assert.equal(mounts, 1);
    assert.equal(root.querySelector("#cell-alias.surface").dataset.component, "alias.component");
    assert.equal(runtime.execute(C.page, { id: "alias.component" }).ok, false);
  } finally { runtime.dispose(); }
}));

test("the fixed startup declaration is captured and cannot acquire later mutations or new commands", () => withTestDocument(() => {
  const { root } = rootWithSentinel(); let calls = 0;
  const plugin = { namespace: "captured", commands: [{ id: "captured.action", run() { calls++; } }] };
  const runtime = createWorkspaceRuntime({ root, plugins: [plugin] });
  try {
    plugin.commands[0].run = () => { calls += 100; }; plugin.commands.push({ id: "captured.late", run() {} });
    runtime.execute("captured.action"); assert.equal(calls, 1); assert.equal(runtime.execute("captured.late").code, "command.missing");
  } finally { runtime.dispose(); }
}));

test("invalid roots and plugin-list shapes fail before acquiring resources", () => withTestDocument(() => {
  const { root, sentinel } = rootWithSentinel(), events = trackEvents(window, ["resize", "pagehide"]);
  try {
    assert.throws(() => createWorkspaceRuntime(), /root/);
    assert.throws(() => createWorkspaceRuntime({ root: document.createElement("div") }), /root/);
    assert.throws(() => createWorkspaceRuntime({ root: { append() {}, isConnected: true, ownerDocument: {} } }), /root/);
    assert.throws(() => createWorkspaceRuntime({ root, plugins: {} }), /plugins/);
    assert.deepEqual(root.children, [sentinel]); assert.equal(events.count("resize"), 0); assert.equal(events.count("pagehide"), 0);
  } finally { events.restore(); }
}));

test("the application can require one stage provider while generic layout sessions remain optional", () => withTestDocument(async () => {
  const { root, sentinel } = rootWithSentinel(), factory = await inspectedFactory();
  assert.throws(() => factory.createWorkspaceRuntime({ root, requiredViewSlots: ["stage"] }), /槽位 stage 恰好注册一个 view.*当前为 0/);
  assertReleased(factory.acquired, root, sentinel);
  const runtime = factory.createWorkspaceRuntime({ root });
  try { assert.ok(root.querySelector(".visual-shell")); }
  finally { runtime.dispose(); }
  assertReleased(factory.acquired, root, sentinel);
}));

test("plugin diagnostics is an opt-in page over the existing platform status", () => withTestDocument(() => {
  const { root, sentinel } = rootWithSentinel();
  const runtime = createWorkspaceRuntime({ root, enablePluginDiagnostics: true });
  try {
    root.querySelector("#menu-plugins").click();
    assert.match([...document.querySelectorAll(".v-menu-item")].map(item => item.textContent).join(" "), /插件状态/);
    assert.equal(runtime.execute(C.page, { id: "frame.plugins.diagnostics", toggle: false }).ok, true);
    assert.ok(root.querySelector("#cell-frame.plugins.diagnostics"));
    assert.match(root.textContent, /frame\.builtin|frame\.layout|frame\.plugins/);
  } finally {
    runtime.dispose();
    assert.deepEqual(root.children, [sentinel]);
  }
}));

test("a required stage provider rejects duplicate central views before mounting the shell", () => withTestDocument(() => {
  const { root, sentinel } = rootWithSentinel();
  assert.throws(() => createWorkspaceRuntime({ root, plugins: [stagePlugin("one"), stagePlugin("two")], requiredViewSlots: ["stage"] }), /只能有一个核心谱面 view/);
  assert.deepEqual(root.children, [sentinel]);
}));

test("required view slot options are validated before resources are acquired", () => withTestDocument(() => {
  const { root, sentinel } = rootWithSentinel();
  assert.throws(() => createWorkspaceRuntime({ root, requiredViewSlots: "stage" }), /requiredViewSlots/);
  assert.throws(() => createWorkspaceRuntime({ root, requiredViewSlots: ["stage", "stage"] }), /不能包含重复/);
  assert.deepEqual(root.children, [sentinel]);
}));

test("a registration rejection removes previously bound host commands and permits a clean retry", () => withTestDocument(async () => {
  const { root, sentinel } = rootWithSentinel(), factory = await inspectedFactory();
  const plugin = { namespace: "invalid", commands: [{ id: "outside.action", run() {} }] };
  assert.throws(() => factory.createWorkspaceRuntime({ root, plugins: [plugin] }), /命名空间/);
  assertReleased(factory.acquired, root, sentinel);
  const runtime = factory.createWorkspaceRuntime({ root }); runtime.dispose(); assertReleased(factory.acquired, root, sentinel);
}));

test("an actual platform installation failure cannot leave a partially started fixed session", () => withTestDocument(async () => {
  const { root, sentinel } = rootWithSentinel();
  const factory = await inspectedFactory({
    createCommandRouter: `{ ...owner, register(namespace, command) {
      if (command.id === "broken.action") throw new Error("install register failure"); return owner.register(namespace, command);
    } }`,
    createPluginPlatform: `{ ...owner, start() { const result = owner.start(); acquired.startRecords = result; return result; } }`,
  });
  const broken = samplePlugin({ namespace: "broken" }), later = samplePlugin({ namespace: "later", globalKeys: ["Alt+L"] });
  assert.throws(() => factory.createWorkspaceRuntime({ root, plugins: [broken.manifest, later.manifest] }), error => {
    assert.match(error.message, /UI 插件启动失败.*broken/); assert.ok(allErrors(error).some(item => item.message === "install register failure")); return true;
  });
  assert.deepEqual(factory.acquired.startRecords.map(record => record.status), ["active", "active", "failed", "active"]);
  assert.equal(broken.state.mounts + later.state.mounts, 0); assertReleased(factory.acquired, root, sentinel);
}));

test("a shell construction failure after append rolls back the partial shell and preserves application-owned DOM", () => withTestDocument(async () => {
  const { root, sentinel } = rootWithSentinel(), factory = await inspectedFactory();
  const append = root.append.bind(root);
  root.append = (...nodes) => { append(...nodes); throw new Error("root append failure"); };
  assert.throws(() => factory.createWorkspaceRuntime({ root }), /root append failure/);
  assertReleased(factory.acquired, root, sentinel); root.append = append;
  const runtime = factory.createWorkspaceRuntime({ root }); runtime.dispose(); assertReleased(factory.acquired, root, sentinel);
}));

test("a first render failure releases mounted components as well as the complete shell", () => withTestDocument(async () => {
  const { root, sentinel } = rootWithSentinel(), factory = await inspectedFactory({
    createVisualWorkbench: `{ ...owner, render(...args) { owner.render(...args); throw new Error("first render failure"); } }`,
  });
  assert.throws(() => factory.createWorkspaceRuntime({ root }), /first render failure/);
  assertReleased(factory.acquired, root, sentinel);
}));

test("a stage initialization failure removes scroll and keyboard listeners and releases lazy content", () => withTestDocument(async () => {
  const { root, sentinel } = rootWithSentinel(), events = trackEvents(document, ["keydown"]);
  const factory = await inspectedFactory({
    createStageViewport: `{ ...owner, initialize() { owner.initialize(); throw new Error("stage initialize failure"); },
      dispose() { acquired.stageDisposals = (acquired.stageDisposals ?? 0) + 1; owner.dispose(); } }`,
  });
  try {
    assert.throws(() => factory.createWorkspaceRuntime({ root }), /stage initialize failure/);
    assert.equal(events.count("keydown"), 0); assert.equal(factory.acquired.stageDisposals, 1); assertReleased(factory.acquired, root, sentinel);
  } finally { events.restore(); }
}));

test("late subscription failure releases earlier subscriptions, keyboard, shell and platform", () => withTestDocument(async () => {
  const { root, sentinel } = rootWithSentinel(), events = trackEvents(document, ["keydown"]);
  const factory = await inspectedFactory({
    createSidebarCompositionState: `{ ...owner, read: { ...owner.read, subscribe(listener) {
      if (acquired.createStageViewport) throw new Error("late subscribe failure"); return owner.read.subscribe(listener);
    } } }`,
    createVisualWorkbench: `{ ...owner, render(...args) { acquired.renders = (acquired.renders ?? 0) + 1; return owner.render(...args); } }`,
  });
  try {
    assert.throws(() => factory.createWorkspaceRuntime({ root }), /late subscribe failure/);
    const renders = factory.acquired.renders; factory.acquired.createWorkspaceState.toggleRegion("left");
    assert.equal(factory.acquired.renders, renders); assert.equal(events.count("keydown"), 0); assertReleased(factory.acquired, root, sentinel);
  } finally { events.restore(); }
}));

test("failure to bind pagehide removes the resize listener acquired immediately before it", () => withTestDocument(async () => {
  const { root, sentinel } = rootWithSentinel(), events = trackEvents(window, ["resize", "pagehide"]), add = window.addEventListener;
  const factory = await inspectedFactory();
  window.addEventListener = (name, ...args) => { if (name === "pagehide") throw new Error("pagehide bind failure"); return add(name, ...args); };
  try {
    assert.throws(() => factory.createWorkspaceRuntime({ root }), /pagehide bind failure/);
    assert.equal(events.count("resize"), 0); assert.equal(events.count("pagehide"), 0); assertReleased(factory.acquired, root, sentinel);
  } finally { events.restore(); }
}));

test("startup rollback preserves the original failure and reports cleanup failures after releasing other owners", () => withTestDocument(async () => {
  const { root, sentinel } = rootWithSentinel(), factory = await inspectedFactory({
    createVisualWorkbench: `{ ...owner, render(...args) { owner.render(...args); throw new Error("startup original failure"); } }`,
    createCommandDialogs: `{ ...owner, dispose() { owner.dispose(); throw new Error("rollback cleanup failure"); } }`,
  });
  assert.throws(() => factory.createWorkspaceRuntime({ root }), error => {
    assert.ok(error instanceof AggregateError); assert.equal(error.cause.message, "startup original failure");
    const messages = allErrors(error).map(item => item.message);
    assert.ok(messages.includes("startup original failure") && messages.includes("rollback cleanup failure")); return true;
  });
  assertReleased(factory.acquired, root, sentinel);
}));

test("a subscription cleanup exception does not prevent keyboard, dialogs, DOM or commands from releasing", () => withTestDocument(async () => {
  const { root, sentinel } = rootWithSentinel(), events = trackEvents(document, ["keydown"]);
  const factory = await inspectedFactory({
    createWorkspaceState: `{ ...owner, read: { ...owner.read, subscribe(listener) {
      const stop = owner.read.subscribe(listener); return () => {
        stop(); if (!acquired.failedUnsubscribe) { acquired.failedUnsubscribe = true; throw new Error("unsubscribe failure"); }
      };
    } } }`,
  });
  const runtime = factory.createWorkspaceRuntime({ root });
  try {
    assert.throws(() => runtime.dispose(), error => allErrors(error).some(item => item.message === "unsubscribe failure"));
    assert.equal(events.count("keydown"), 0); assertReleased(factory.acquired, root, sentinel); runtime.dispose();
  } finally { runtime.dispose(); events.restore(); }
}));

test("component mount failure remains isolated and immediately cleans its narrowed context resources", () => withTestDocument(() => {
  const { root } = rootWithSentinel(), sample = samplePlugin({ failMount: true }), runtime = createWorkspaceRuntime({ root, plugins: [sample.manifest] });
  try {
    assert.equal(runtime.execute(C.page, { id: sample.panel, toggle: false }).ok, true);
    assert.equal(sample.state.mounts, 1); assert.equal(sample.state.cleanup, 1); assert.ok(root.querySelector(".component-fault"));
    assert.equal(sample.state.ctx.execute(sample.command).code, "component.disposed");
    assert.equal(runtime.execute(C.region, { region: "left" }).ok, true); assert.ok(root.querySelector(".visual-shell"));
  } finally { runtime.dispose(); }
  assert.equal(sample.state.cleanup, 1); assert.equal(sample.state.disposals, 0);
}));

test("cleanup failures are aggregated after all other owners release; repeat disposal never retries callbacks", () => withTestDocument(async () => {
  const { root, sentinel } = rootWithSentinel(), docEvents = trackEvents(document, ["keydown"]), winEvents = trackEvents(window, ["resize", "pagehide"]);
  const factory = await inspectedFactory({
    createCommandDialogs: `{ ...owner, dispose() { owner.dispose(); acquired.dialogDisposals = (acquired.dialogDisposals ?? 0) + 1; throw new Error("dialog cleanup failure"); } }`,
    createStageViewport: `{ ...owner, dispose() { owner.dispose(); acquired.stageDisposals = (acquired.stageDisposals ?? 0) + 1; throw new Error("stage cleanup failure"); } }`,
  });
  const runtime = factory.createWorkspaceRuntime({ root });
  try {
    runtime.execute(C.begin);
    assert.throws(() => runtime.dispose(), error => {
      assert.ok(error instanceof AggregateError);
      const messages = allErrors(error).map(item => item.message);
      assert.ok(messages.includes("dialog cleanup failure") && messages.includes("stage cleanup failure")); return true;
    });
    assertReleased(factory.acquired, root, sentinel); assert.equal(runtime.workspace.snapshot().adjusting, false);
    assert.equal(docEvents.count("keydown"), 0); assert.equal(winEvents.count("resize"), 0); assert.equal(winEvents.count("pagehide"), 0);
    runtime.dispose(); assert.equal(factory.acquired.dialogDisposals, 1); assert.equal(factory.acquired.stageDisposals, 1);
    assert.equal(runtime.execute(C.begin).code, "runtime.disposed");
    const next = factory.createWorkspaceRuntime({ root }); assert.throws(() => next.dispose(), AggregateError); assertReleased(factory.acquired, root, sentinel);
  } finally { runtime.dispose(); docEvents.restore(); winEvents.restore(); }
}));

test("a failing component disposer keeps existing notice isolation and does not block host release", () => withTestDocument(async () => {
  const { root, sentinel } = rootWithSentinel(), sample = samplePlugin({ failCleanup: true }), factory = await inspectedFactory();
  const runtime = factory.createWorkspaceRuntime({ root, plugins: [sample.manifest] });
  runtime.execute(C.page, { id: sample.panel, toggle: false }); runtime.dispose(); runtime.dispose();
  assert.equal(sample.state.disposals, 1); assert.equal(sample.state.cleanup, 1); assertReleased(factory.acquired, root, sentinel);
  assert.ok(runtime.inspection.notices.state().entries.some(notice => notice.text.includes("清理失败")));
}));

test("duplicate startup is rejected, BFCache pagehide preserves the instance, and normal pagehide allows restart", () => withTestDocument(() => {
  const { root, sentinel } = rootWithSentinel(), sample = samplePlugin(), docEvents = trackEvents(document, ["keydown"]), winEvents = trackEvents(window, ["resize", "pagehide"]);
  const runtime = createWorkspaceRuntime({ root, plugins: [sample.manifest] });
  try {
    runtime.execute(C.page, { id: sample.panel, toggle: false }); sample.state.input.value = "恢复后保留";
    const resizeListeners = winEvents.count("resize");
    assert.ok(resizeListeners >= 1, "host and mounted visual projections own resize listeners");
    assert.throws(() => createWorkspaceRuntime({ root }), /活跃/); assert.equal(root.querySelectorAll(".visual-shell").length, 1);
    assert.equal(docEvents.count("keydown"), 1); assert.equal(winEvents.count("resize"), resizeListeners); assert.equal(winEvents.count("pagehide"), 1);
    const preserved = new Event("pagehide"); Object.defineProperty(preserved, "persisted", { value: true }); window.dispatchEvent(preserved);
    assert.equal(sample.state.disposals, 0); assert.equal(sample.state.input.value, "恢复后保留");
    assert.equal(winEvents.count("resize"), resizeListeners, "BFCache preserves existing listener ownership");
    assert.equal(runtime.execute(C.region, { region: "left" }).ok, true);
    window.dispatchEvent(new Event("pagehide")); assert.deepEqual(root.children, [sentinel]);
    assert.equal(docEvents.count("keydown"), 0); assert.equal(winEvents.count("resize"), 0); assert.equal(winEvents.count("pagehide"), 0);
    assert.equal(sample.state.disposals, 1); assert.equal(runtime.execute(C.region).code, "runtime.disposed");
    const next = createWorkspaceRuntime({ root }); assert.equal(docEvents.count("keydown"), 1); next.dispose();
    assert.deepEqual(root.children, [sentinel]); assert.equal(docEvents.count("keydown"), 0);
    assert.equal(winEvents.count("resize"), 0); assert.equal(winEvents.count("pagehide"), 0);
  } finally { runtime.dispose(); docEvents.restore(); winEvents.restore(); }
}));

test("runtime zoom has one continuous state shared by Ctrl+wheel, the footer and layout settings", () => withTestDocument(async () => {
  const { root, runtime, viewState } = await importPreviewForTest();
  try {
    const initial = viewState.read.snapshot().zoom;
    assert.equal(root.querySelector("#zoom-trigger").textContent, `${Number(initial).toFixed(1).replace(/\\.0$/, "")}%`);
    const scroll = root.querySelector("#score-scroll");
    const ordinary = new Event("wheel", { bubbles: true, cancelable: true });
    Object.defineProperties(ordinary, { ctrlKey: { value: false }, deltaY: { value: -100 } });
    scroll.dispatchEvent(ordinary);
    assert.equal(ordinary.defaultPrevented, false);
    assert.equal(viewState.read.snapshot().zoom, initial);
    const zoomIn = new Event("wheel", { bubbles: true, cancelable: true });
    Object.defineProperties(zoomIn, { ctrlKey: { value: true }, deltaY: { value: -100 } });
    scroll.dispatchEvent(zoomIn);
    assert.equal(zoomIn.defaultPrevented, true);
    const afterWheel = viewState.read.snapshot().zoom;
    assert.equal(afterWheel, Math.min(400, initial + 5));
    const layoutRange = root.querySelector("#layout-zoom-range");
    assert.ok(layoutRange, "布局设置提供连续缩放滑条");
    const zoomHelp = root.querySelector(".v-layout-zoom-help");
    assert.ok(zoomHelp, "快捷操作使用图形入口");
    assert.equal(zoomHelp.textContent, "", "快捷操作不渲染说明文字");
    assert.match(zoomHelp.getAttribute("aria-label"), /Ctrl.*滚轮/);
    assert.match(zoomHelp.getAttribute("title"), /Ctrl.*滚轮/);
    layoutRange.value = "150";
    layoutRange.dispatchEvent(new Event("input", { bubbles: true }));
    assert.equal(viewState.read.snapshot().zoom, 150);
    assert.equal(root.querySelector("#zoom-trigger").textContent, "150%");
    const footerInput = root.querySelector("#zoom-trigger");
    assert.equal(footerInput.getAttribute("data-zoom"), "150%");
    runtime.execute(C.begin);
    layoutRange.value = "175";
    layoutRange.dispatchEvent(new Event("input", { bubbles: true }));
    assert.equal(viewState.read.snapshot().zoom, 175);
    runtime.execute(C.finish, { confirm: false });
    assert.equal(viewState.read.snapshot().zoom, 175, "布局取消不回滚阅读缩放");
  } finally { runtime.dispose(); }
}));

test("both zoom number fields preserve unfinished drafts and submit only values in range", () => withTestDocument(async () => {
  const { root, runtime, viewState } = await importPreviewForTest();
  try {
    runtime.execute(C.zoom, { value: 100 });
    root.querySelector("#zoom-trigger").click();
    for (const id of ["layout-zoom-value", "zoom-value"]) {
      const input = document.getElementById(id);
      assert.ok(input, id);
      input.focus();
      const before = viewState.read.snapshot().zoom;
      for (const draft of ["", "1", "15", "450"]) {
        input.value = draft;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        assert.equal(input.value, draft, "输入草稿没有被回写");
        assert.equal(viewState.read.snapshot().zoom, before, "越界草稿没有改变谱面");
      }
      runtime.execute(C.zoomBy, { delta: 1.2 });
      assert.equal(input.value, "450", "其他入口更新没有覆盖焦点中的草稿");
      input.value = "150.24";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      assert.equal(viewState.read.snapshot().zoom, 150.2);
      assert.equal(input.value, "150.24", "接受值不截断仍在输入的精度");
      assert.equal(root.querySelector("#zoom-trigger").textContent, "150.2%");
      input.dispatchEvent(new Event("blur"));
      assert.equal(input.value, "150.2");
      input.value = "500";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("blur"));
      assert.equal(input.value, "150.2", "非法输入离开后恢复已接受值");
      assert.equal(input.getAttribute("aria-invalid"), "false");
    }
  } finally { runtime.dispose(); }
}));
