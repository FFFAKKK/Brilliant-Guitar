import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createWorkspaceLayoutVisual } from "../src/shell/workspace-layout-visual.js";
import { createWorkspaceState } from "../src/layout/workspace-state.js";
import { createBackupUiRuntime } from "../src/host/backup-ui-runtime.js";
import { withTestDocument } from "./support/dom-test-environment.js";

const pointer = node => { const event = new Event("click"); Object.defineProperty(event, "detail", { value: 1 }); node.dispatchEvent(event); };
function fixture() {
  const store = createWorkspaceState({ pageIds: ["layout"], layoutPageId: "layout", width: 1440, height: 900 });
  const snapshot = () => ({ ...store.read.snapshot(), editing: store.read.snapshot().adjusting });
  const group = document.createElement("div");
  const view = createWorkspaceLayoutVisual({ state: snapshot(), begin: () => store.beginAdjustment(),
    finish: confirm => store.finishAdjustment(confirm), sections: [group], editGroups: [group] });
  document.body.append(view.element); const stop = store.read.subscribe(() => view.update(snapshot()));
  return { view, store, group, edit: view.element.querySelector("#composer-edit"),
    actions: view.element.querySelector(".v-mode-actions"), cancel: view.element.querySelector("#layout-cancel"),
    confirm: view.element.querySelector("#layout-confirm"), dispose() { stop(); view.dispose(); } };
}
function recording() {
  const descriptors = [], calls = [], jobs = [];
  return { descriptors, calls, jobs, bind(descriptor) {
    descriptors.push(descriptor);
    return { hold: request => calls.push(["hold", request]), place: request => calls.push(["place", request]), dispose: () => calls.push(["dispose"]), play(request) {
      calls.push(["play", request]); let resolve, reject;
      const finished = new Promise((yes, no) => { resolve = yes; reject = no; });
      jobs.push({ request, resolve, reject }); return { finished };
    } };
  } };
}

test("editing motion is explicitly granted only to the author's tools and leaves core settings in a stable order", () => withTestDocument(() => {
  const staticView = fixture(), staticBinding = recording(); staticView.view.attachMotion(staticBinding.bind);
  assert.equal(staticBinding.descriptors.some(descriptor => descriptor.targets["edit:begin"]), false); staticView.dispose();
  const f = fixture(), e = recording();
  try {
    f.view.attachMotion(e.bind, { editTransition: true });
    const targets = e.descriptors.at(-1).targets;
    assert.deepEqual(Object.keys(targets), ["edit:begin", "edit:finish", "edit:group-0"]);
    for (const grant of Object.values(targets)) { assert.ok(f.view.element.contains(grant.node)); assert.deepEqual(grant.intents, ["content-transition"]); }
    assert.equal(f.edit.textContent, "编辑内容");
    const content = f.view.element.querySelector(".v-layout-content"), order = [...content.children];
    pointer(f.edit); assert.deepEqual([...content.children], order);
    assert.equal(order.at(-1).className, "v-layout-changes");
    assert.equal(f.view.element.querySelector("#layout-session").classList.contains("v-sr-only"), true);
    assert.equal(f.edit.textContent, "编辑内容", "outgoing label must not change during a fade");
    assert.equal(f.view.element.style.width, ""); assert.equal(f.view.element.style.height, "");
    const css = readFileSync(new URL("../styles/workspace-layout.css", import.meta.url), "utf8");
    assert.match(css, /\.v-composer-header\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) 96px/);
    assert.match(css, /\.v-composer-header > \.v-text-button, \.v-composer-header > \.v-mode-actions\s*\{[^}]*grid-area:\s*1 \/ 2/);
  } finally { f.dispose(); }
}));

test("editing accepts before playback and outgoing tools stop taking input immediately; confirm and cancel never depend on completion", () => withTestDocument(async () => {
  const f = fixture(), e = recording(); f.view.attachMotion(e.bind, { editTransition: true });
  try {
    pointer(f.edit);
    assert.equal(f.store.read.snapshot().adjusting, true);
    assert.equal(f.edit.inert, true); assert.equal(f.edit.getAttribute("aria-hidden"), "true");
    assert.equal(f.actions.inert, false); assert.equal(f.actions.hidden, false);
    assert.equal(e.jobs.length, 2, "incoming words wait until the outgoing words have disappeared");
    assert.equal(e.jobs.some(job => job.request.target === "edit:finish"), false);
    pointer(f.cancel); assert.equal(f.store.read.snapshot().adjusting, false);
    assert.equal(f.actions.inert, true); assert.equal(f.actions.getAttribute("aria-hidden"), "true");
    assert.equal(f.edit.inert, false); assert.equal(f.edit.hidden, false);
    for (const job of e.jobs.slice(0, 2)) job.resolve({ status: "completed" });
    await Promise.resolve(); assert.equal(f.edit.hidden, false, "old exit must not hide the active button");
    for (const job of e.jobs.slice(2)) job.resolve({ status: "completed" });
    await Promise.resolve(); assert.equal(f.actions.hidden, true);
    pointer(f.edit); pointer(f.confirm); assert.equal(f.store.read.snapshot().adjusting, false);
  } finally { f.dispose(); }
}));

test("same-state notifications preserve active transitions; keyboard/program requests and visibility settle without replay", () => withTestDocument(async ({ window }) => {
  const f = fixture(), e = recording(); f.view.attachMotion(e.bind, { editTransition: true });
  try {
    pointer(f.edit); const jobs = e.jobs.length, places = e.calls.filter(([kind]) => kind === "place").length;
    f.view.update({ ...f.store.read.snapshot(), editing: true });
    assert.equal(e.jobs.length, jobs); assert.equal(e.calls.filter(([kind]) => kind === "place").length, places);
    assert.equal(f.edit.hidden, false, "exiting pixels remain until their own completion");
    window.dispatchEvent(new Event("resize")); assert.equal(f.edit.hidden, true);
    f.view.setVisible(false); f.view.setVisible(true); assert.equal(e.jobs.length, jobs);
    f.cancel.click(); assert.equal(f.store.read.snapshot().adjusting, false); assert.equal(f.actions.hidden, true);
    f.store.beginAdjustment(); assert.equal(f.edit.hidden, true); assert.equal(e.jobs.length, jobs);
    pointer(f.cancel); document.hidden = true; document.dispatchEvent(new Event("visibilitychange"));
    assert.equal(f.actions.hidden, true); assert.equal(f.edit.hidden, false);
    document.hidden = false; document.dispatchEvent(new Event("visibilitychange")); assert.equal(e.jobs.length, jobs + 2);
  } finally { document.hidden = false; f.dispose(); }
}));

test("stale rejections are ignored and denied editing binding rolls back earlier presentation without changing commands", () => withTestDocument(async () => {
  const f = fixture(), e = recording(), issues = [];
  try {
    assert.throws(() => f.view.attachMotion(descriptor => {
      if (descriptor.targets["edit:begin"]) throw new Error("denied"); return e.bind(descriptor);
    }, { editTransition: true }), /denied/);
    assert.equal(f.edit.inert, false); assert.equal(f.edit.hidden, false);
    f.view.attachMotion(e.bind, { editTransition: true, onIssue: error => issues.push(error.message) });
    pointer(f.edit); const old = e.jobs[0]; pointer(f.cancel);
    old.reject(new Error("stale")); await Promise.resolve(); assert.deepEqual(issues, []);
    f.view.setVisible(false); for (const job of e.jobs) job.reject(new Error("hidden"));
    await Promise.resolve(); assert.deepEqual(issues, []);
    f.dispose(); const count = e.calls.length;
    document.defaultView.dispatchEvent(new Event("resize")); assert.equal(e.calls.length, count);
    assert.equal(f.store.read.snapshot().adjusting, false);
  } finally { f.dispose(); }
}));

test("an editing animation rejection restores the accepted static UI and subsequent commands remain usable", () => withTestDocument(async () => {
  const f = fixture(), e = recording(), issues = [];
  try {
    f.view.attachMotion(e.bind, { editTransition: true, onIssue: error => issues.push(error.message) });
    pointer(f.edit); e.jobs[0].reject(new Error("engine failed")); await Promise.resolve();
    assert.deepEqual(issues, ["engine failed"]); assert.equal(f.store.read.snapshot().adjusting, true);
    assert.equal(f.edit.hidden, true); assert.equal(f.actions.hidden, false);
    assert.equal(f.actions.inert, false); assert.equal(f.actions.getAttribute("aria-hidden"), null);
    f.confirm.click(); assert.equal(f.store.read.snapshot().adjusting, false); assert.equal(f.edit.hidden, false);
    for (const job of e.jobs) job.reject(new Error("late")); await Promise.resolve(); assert.equal(issues.length, 1);
  } finally { f.dispose(); }
}));

test("formal layout uses five editing targets through the existing declaration and keeps accepted geometry and transaction results", () => withTestDocument(async () => {
  const root = document.createElement("main"); document.body.append(root); const jobs = [];
  const runtime = createBackupUiRuntime({ root, animationProvider: { name: "capture", start(args) { jobs.push(args); return { stop() {} }; } } });
  try {
    const core = ["leftWidth", "rightWidth", "topHeight", "voiceHeight", "zoom"];
    const geometry = () => core.map(key => runtime.workspace.snapshot()[key]);
    const before = geometry(), edit = root.querySelector("#composer-edit"), actions = root.querySelector(".v-composer").querySelector(".v-mode-actions");
    pointer(edit); assert.equal(runtime.workspace.snapshot().adjusting, true); assert.deepEqual(geometry(), before);
    assert.equal(jobs.length, 4);
    assert.equal(actions.style.opacity, "0", "incoming words are not crossfaded over outgoing text");
    jobs.find(job => job.node === edit).complete(); await Promise.resolve();
    assert.equal(jobs.length, 5);
    const allowed = [edit, actions, ...root.querySelector("#layout-content-manager").querySelectorAll(".v-layout-control-row")];
    for (const job of jobs) {
      assert.ok(allowed.includes(job.node)); assert.equal(job.intent, "content-transition");
      assert.equal(job.from.x, job.to.x); assert.equal(job.from.y, job.to.y);
      assert.equal(job.settings.duration, .16);
    }
    runtime.execute("frame.workspace.region.resize", { side: "right", value: 300 });
    assert.equal(runtime.motion.snapshot().active, 0, "ordinary geometry changes settle editing pixels immediately");
    pointer(root.querySelector("#layout-cancel")); assert.equal(runtime.workspace.snapshot().adjusting, false);
    assert.equal(runtime.workspace.snapshot().rightWidth, 300, "cancel preserves ordinary workspace sizes");
    for (const job of jobs) job.complete(); await Promise.resolve();
    for (const job of jobs) job.complete(); await Promise.resolve();
    assert.equal(actions.hidden, true); assert.equal(edit.hidden, false); assert.equal(runtime.motion.snapshot().active, 0);
    runtime.dispose(); assert.equal(runtime.motion.snapshot().targets, 0);
  } finally { runtime.dispose(); }
}));

test("formal keyboard, absent engines and reduced/off policy never leave inactive tools reachable or retain tracks", () => withTestDocument(async () => {
  for (const mode of ["none", "reduced", "keyboard", "absent"]) {
    const root = document.createElement("main"); document.body.append(root); const jobs = [];
    const runtime = createBackupUiRuntime({ root, animationProvider: mode === "absent" ? null : { name: "capture", start(args) { jobs.push(args); return { stop() {} }; } } });
    try {
      if (mode === "none" || mode === "reduced") runtime.motion.setPolicy({ mode });
      const edit = root.querySelector("#composer-edit"); if (mode === "keyboard") edit.click(); else pointer(edit);
      assert.equal(runtime.workspace.snapshot().adjusting, true);
      if (mode === "reduced") { for (const job of jobs) { assert.equal(job.settings.duration, .1); assert.equal(job.to.x, 0); assert.equal(job.to.y, 0); job.complete(); } await Promise.resolve(); }
      else assert.equal(jobs.length, 0);
      assert.equal(edit.hidden, true); assert.equal(edit.inert, true);
      root.querySelector("#layout-confirm").click();
      assert.equal(runtime.workspace.snapshot().adjusting, false); assert.equal(root.querySelector(".v-composer").querySelector(".v-mode-actions").hidden, true);
      assert.equal(runtime.motion.snapshot().active, 0);
    } finally { runtime.dispose(); root.remove(); }
  }
}));

test("formal rapid reversal samples the current tool opacity rather than restarting or accepting an old failure", () => withTestDocument(() => {
  const root = document.createElement("main"); document.body.append(root); const jobs = [];
  const runtime = createBackupUiRuntime({ root, animationProvider: { name: "capture", start(args) { jobs.push(args); return { stop() {} }; } } });
  try {
    const edit = root.querySelector("#composer-edit"), cancel = root.querySelector("#layout-cancel");
    edit.focus(); pointer(edit);
    assert.equal(document.activeElement, cancel, "focus immediately follows the accepted editing state");
    const old = jobs.find(job => job.node === edit); old.write({ opacity: .45 });
    pointer(cancel);
    const reversed = jobs.filter(job => job.node === edit).at(-1);
    assert.equal(reversed.from.opacity, .45); assert.equal(reversed.to.opacity, 1);
    old.failed(new Error("stale failure"));
    assert.equal(runtime.workspace.snapshot().adjusting, false);
    assert.equal(edit.hidden, false); assert.equal(edit.inert, false);
  } finally { runtime.dispose(); assert.equal(runtime.motion.snapshot().targets, 0); }
}));
