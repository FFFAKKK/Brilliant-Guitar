import assert from "node:assert/strict";
import test from "node:test";
import { definePlugin, PluginPlatform } from "../src/vendor/plugin-platform.js";
import { createBackupFormalPlatform } from "../src/host/formal-plugin-assembly.js";
import { createBackupUiRuntime } from "../src/host/backup-ui-runtime.js";
import { createCommandRouter } from "../src/runtime/command-router.js";
import { createComponentRegistry } from "../src/runtime/component-registry.js";
import { createMenuRegistry } from "../src/runtime/menu-registry.js";
import { withTestDocument } from "./support/dom-test-environment.js";

const identity = { id: "trial.minimum", name: "Minimum", version: "0.1.0", apiVersion: "4.0" };
const component = extra => ({ id: "trial.minimum.panel", title: "Minimum", role: "tool", slots: ["left"], mount() {}, ...extra });
const contribution = { contractVersion: 1, definitions: { "content-transition": { defaultVariant: "own", variants: { own: {
  type: "tween", duration: .12, fadeDuration: .12, exitDuration: .08, ease: [.23, 1, .32, 1],
} } } } };
// Supply only the thumbnail's size; this DOM double does not perform layout.
function withPreviewDocument(run) {
  return withTestDocument(() => {
    const create = document.createElement;
    document.createElement = tag => {
      const node = create(tag);
      Object.defineProperties(node, {
        clientWidth: { get: () => node.classList.contains("v-layout-map-canvas") ? 280 : undefined },
        clientHeight: { get: () => node.classList.contains("v-layout-map-canvas") ? 144 : undefined },
      });
      return node;
    };
    return run();
  });
}
test("one formal minimum declaration rejects invalid identity/name/version/host version and accepts every optional empty form", () => {
  for (const patch of [{ id: null }, { id: "" }, { id: "wrong id" }, { name: null }, { name: " " }, { version: null }, { version: "v1" },
    { apiVersion: null }, { apiVersion: "4.1" }]) assert.throws(() => definePlugin({ ...identity, ...patch }));
  for (const ui of [undefined, null, { contractVersion: 1 }, { contractVersion: 1, components: null, commands: null, menuItems: null, shortcuts: null }]) {
    const plugin = definePlugin({ ...identity, ui });
    const router = createCommandRouter(), registry = createComponentRegistry();
    const platform = createBackupFormalPlatform({ router, components: registry, menus: createMenuRegistry([]) });
    assert.ok(platform instanceof PluginPlatform); platform.register(plugin); platform.start();
    assert.equal(platform.list()[0].active, true); assert.deepEqual(registry.list(), []); platform.dispose();
  }
  for (const ui of [{}, { contractVersion: 2 }, { contractVersion: 1, components: [null] }, { contractVersion: 1, commands: false },
    { contractVersion: 1, unknown: null }]) assert.throws(() => definePlugin({ ...identity, ui }));
});
test("optional null fields normalize once; legal zero/false survive formal capture; invalid offered values reject", () => {
  const plugin = definePlugin({ ...identity, ui: { contractVersion: 1, components: [component({
    order: 0, defaultEnabled: false, minHeight: 0, priority: 0, icon: null, defaultSlot: null, animations: null,
    permissions: { commands: null, animations: null },
  })], commands: null, menuItems: null, shortcuts: null } });
  const unit = plugin.ui.components[0];
  assert.equal(unit.order, 0); assert.equal(unit.defaultEnabled, false); assert.equal(unit.minHeight, 0); assert.equal(unit.icon, undefined);
  assert.deepEqual(unit.permissions.commands, []); assert.deepEqual(unit.permissions.animations, []);
  for (const extra of [{ order: false }, { defaultEnabled: 0 }, { permissions: false }, { slots: null }, { title: null },
    { animations: { contractVersion: 2 } }, { owner: "stolen.owner" }, { animations: contribution }]) {
    assert.throws(() => definePlugin({ ...identity, ui: { contractVersion: 1, components: [component(extra)] } }));
  }
});
test("actual registered layout consumes its declared recipe and all failures/visibility/disposal preserve accepted workspace state", () => withPreviewDocument(async () => {
  const root = document.createElement("main"); document.body.append(root);
  const jobs = [], runtime = createBackupUiRuntime({ root, animationProvider: {
    name: "capture", start(args) { const control = { stopped: false, stop() { this.stopped = true; } }; jobs.push({ ...args, control }); return control; },
  } });
  try {
    const registered = runtime.plugins.snapshot().find(item => item.manifest.id === "frame.layout");
    assert.equal(registered.manifest.apiVersion, "4.0"); assert.equal(registered.manifest.name, "工作区布局");
    assert.equal(root.querySelectorAll(".v-map-region-ink").length, 0);
    assert.equal(root.querySelectorAll(".v-map-region").length, 4);
    assert.equal(root.querySelectorAll(".v-map-stage").length, 1);
    assert.equal(runtime.motion.snapshot().targets, 19 + root.querySelectorAll("[data-frame-toggle]").length + root.querySelectorAll(".v-frame-order-row").length + root.querySelectorAll(".v-edge-handle").length, "fifteen layout targets, four frame planes, independent controls, host-owned order carriers and four edge inks");
    assert.equal(root.querySelectorAll(".v-layout-toggle-ink").length, 4);
    assert.equal(root.querySelectorAll(".v-layout-selection-window").length, 1);
    const click = target => { const event = new Event("click"); Object.defineProperty(event, "detail", { value: 1 }); target.dispatchEvent(event); };
    const left = root.querySelector("#layout-left"); click(left);
    assert.equal(runtime.workspace.snapshot().leftOpen, true); assert.equal(left.getAttribute("aria-pressed"), "true");
    assert.equal(jobs.length, 3);
    const toggleJob = jobs.find(job => job.intent === "content-transition");
    assert.equal(toggleJob.settings.fadeDuration, .16); assert.equal(toggleJob.to.x, 0); assert.equal(toggleJob.to.y, 0);
    toggleJob.failed(new Error("toggle provider fault"));
    for (const job of jobs.filter(job => job.intent === "shape-transition")) {
      assert.equal(job.intent, "shape-transition"); assert.equal(job.settings.duration, .28);
      assert.equal(Object.hasOwn(job.settings, "fadeDuration"), false);
      assert.deepEqual(Object.keys(job.to).sort(), ["height", "opacity", "width", "x", "y"]);
      job.failed(new Error("provider fault"));
    }
    assert.equal(runtime.workspace.snapshot().leftOpen, true); assert.equal(runtime.motion.snapshot().active, 0);
    click(left); assert.equal(runtime.workspace.snapshot().leftOpen, false); assert.equal(jobs.length, 6);
    assert.equal(jobs.at(-1).settings.fadeDuration, .12);
    assert.equal(runtime.execute("frame.workspace.page.select", { id: "frame.builtin.properties", toggle: false }).ok, true);
    assert.equal(runtime.motion.snapshot().active, 0); assert.ok(jobs.every(job => job.control.stopped));
    const accepted = runtime.workspace.snapshot();
    jobs.forEach(job => { job.write(job.from); job.failed(new Error("late")); });
    assert.equal(runtime.workspace.snapshot(), accepted);
    runtime.execute("frame.workspace.page.select", { id: "frame.layout.page", toggle: false });
    assert.equal(root.querySelector("#layout-left"), left, "page instance resumes rather than remounts");
    runtime.motion.replaceProvider(null); click(left); assert.equal(runtime.workspace.snapshot().leftOpen, true); assert.equal(jobs.length, 6);
    runtime.dispose(); runtime.dispose(); assert.equal(runtime.motion.snapshot().targets, 0); assert.equal(runtime.motion.snapshot().components, 0);
    assert.equal(root.children.length, 0);
  } finally { runtime.dispose(); }
}));
test("two full formal runtimes keep same-named region targets, policies and disposal isolated", () => withPreviewDocument(() => {
  const roots = [document.createElement("main"), document.createElement("main")]; document.body.append(...roots);
  const runtimes = roots.map(root => createBackupUiRuntime({ root, animationProvider: null }));
  try {
    runtimes[0].execute("frame.workspace.region.toggle", { region: "left" });
    assert.equal(runtimes[0].workspace.snapshot().leftOpen, true); assert.equal(runtimes[1].workspace.snapshot().leftOpen, false);
    runtimes[0].motion.setPolicy({ mode: "none" }); assert.equal(runtimes[1].motion.snapshot().mode, "full");
    runtimes[0].dispose(); assert.equal(runtimes[1].motion.snapshot().targets, 19 + roots[1].querySelectorAll("[data-frame-toggle]").length + roots[1].querySelectorAll(".v-frame-order-row").length + roots[1].querySelectorAll(".v-edge-handle").length); assert.equal(roots[1].querySelectorAll(".v-map-region-ink").length, 0);
    assert.equal(roots[1].querySelectorAll(".v-map-region").length, 4);
  } finally { runtimes.forEach(runtime => runtime.dispose()); }
}));
test("failed required view and invalid provider roll back the entire fixed start before a subsequent clean retry", () => withPreviewDocument(() => {
  const root = document.createElement("main"); document.body.append(root);
  const duplicate = definePlugin({ id: "trial.duplicate", name: "Duplicate", version: "0.1.0", apiVersion: "4.0", ui: {
    contractVersion: 1, components: [{ id: "trial.duplicate.view", title: "Duplicate", role: "view", slots: ["stage"], mount() {} }],
  } });
  assert.throws(() => createBackupUiRuntime({ root, plugins: [duplicate] }), /中央工作区/); assert.equal(root.children.length, 0);
  assert.throws(() => createBackupUiRuntime({ root, animationProvider: {} }), /animation service/); assert.equal(root.children.length, 0);
  const runtime = createBackupUiRuntime({ root, animationProvider: null }); assert.equal(runtime.motion.snapshot().targets, 19 + root.querySelectorAll("[data-frame-toggle]").length + root.querySelectorAll(".v-frame-order-row").length + root.querySelectorAll(".v-edge-handle").length);
  runtime.dispose(); assert.equal(root.children.length, 0);
}));
