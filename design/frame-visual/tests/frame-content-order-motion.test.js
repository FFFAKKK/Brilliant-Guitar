import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getEventListeners } from "node:events";
import { createAnimationService } from "../src/runtime/animation-service.js";
import { createFrameContentOrderPresentation } from "../src/host/frame-content-order-presentation.js";
import { createBackupUiRuntime } from "../src/host/backup-ui-runtime.js";
import { definePlugin } from "../src/vendor/plugin-platform.js";
import { createSidebarPresentation } from "../src/host/sidebar-presentation.js";
import { WORKSPACE_COMMANDS as C } from "../src/host/workspace-commands.js";
import { SIDEBAR_COMMANDS as S } from "../src/host/sidebar-commands.js";
import { withTestDocument } from "./support/dom-test-environment.js";

// Deterministic geometry, not browser layout/pixel evidence. The sampled
// transform contributes to the old rect just as getBoundingClientRect does.
function fixture({ count = 3, absent = false } = {}) {
  const workspaceRoot = document.createElement("main"), root = document.createElement("div");
  document.body.append(workspaceRoot); workspaceRoot.append(root);
  const jobs = [], issues = [], privateScopes = [];
  const service = createAnimationService({ onIssue: issue => issues.push(issue), provider: absent ? null : {
    name: "recording", start(job) { const control = { stopped: false, stop() { this.stopped = true; } }; jobs.push({ ...job, control }); return control; },
  } });
  const presentation = createFrameContentOrderPresentation({ root, workspaceRoot, service });
  let spacing = 50;
  const nodes = Array.from({ length: count }, (_, index) => {
    const node = document.createElement("section"), input = document.createElement("input");
    input.value = "draft-" + index; node.append(input);
    const row = presentation.item(node); root.append(row);
    row.getBoundingClientRect = () => {
      const y = Number(/translate3d\([^,]+,\s*([-\d.]+)px/.exec(row.style.transform)?.[1] ?? 0);
      return { x: 10, y: [...root.children].filter(item => !item.hidden).indexOf(row) * spacing + y, width: 200, height: 40 };
    };
    privateScopes.push(service.forComponent({ owner: "trial", id: "trial.cell-" + index, permissions: {} }, node));
    return node;
  });
  presentation.update(nodes);
  return { root, workspaceRoot, nodes, jobs, issues, service, presentation,
    spacing: value => { spacing = value; },
    render(order, options = { pointer: true }, accept = () => {}) {
      presentation.beforeRender();
      accept();
      for (const node of order) root.append(presentation.item(node));
      presentation.update(order, options);
    },
    dispose() { presentation.dispose(); privateScopes.forEach(scope => scope.dispose()); service.dispose(); },
  };
}

test("accepted sorting moves only transparent frame carriers and keeps private inputs, focus and geometry intact", () => withTestDocument(async () => {
  const f = fixture(), [a, b, c] = f.nodes;
  try {
    a.firstChild.focus(); const stage = document.createElement("main"); f.workspaceRoot.append(stage);
    f.render([c, a, b]);
    assert.equal(f.jobs.length, 3);
    assert.deepEqual(f.root.children.map(row => row.firstChild), [c, a, b]);
    assert.equal(document.activeElement, a.firstChild); assert.equal(a.firstChild.value, "draft-0");
    assert.deepEqual(f.jobs.map(job => job.from.y), [100, -50, -50]);
    for (const job of f.jobs) {
      assert.equal(job.node.className, "v-frame-order-row"); assert.equal(job.node.getAttribute("role"), "presentation");
      assert.equal(f.nodes.includes(job.node), false); assert.equal(job.intent, "drag-settle");
      assert.equal(job.settings.type, "spring"); assert.equal(job.settings.stiffness, 260); assert.equal(job.settings.damping, 32);
      assert.equal(job.to.x, 0); assert.equal(job.to.y, 0); job.complete();
    }
    assert.equal(f.root.style.width, ""); assert.equal(f.workspaceRoot.style.height, ""); assert.equal(stage.style.transform, "");
    assert.equal(f.service.snapshot().active, 0);
    await Promise.resolve(); assert.ok(f.root.children.every(row => row.style.transform === ""), "resting wrappers do not establish containing blocks");
    const css = readFileSync(new URL("../styles/runtime-preview.css", import.meta.url), "utf8");
    assert.match(css, /\.v-frame-order-row\s*\{\s*min-width: 0; flex-shrink: 0;\s*\}/);
  } finally { f.dispose(); }
}));

test("rapid reversal continues from sampled visual positions; same-state notifications and stale providers cannot undo it", () => withTestDocument(() => {
  const f = fixture(), [a, b, c] = f.nodes;
  try {
    f.render([c, a, b]); const old = f.jobs.find(job => job.node.firstChild === a);
    old.write({ x: 0, y: -24 });
    f.render([c, a, b]); assert.equal(f.jobs.length, 3); assert.equal(old.control.stopped, false);
    f.render([a, b, c]); const current = f.jobs.filter(job => job.node.firstChild === a).at(-1);
    assert.equal(current.from.y, 26); assert.equal(old.control.stopped, true);
    old.failed(new Error("late")); old.write({ y: 444 }); old.complete();
    assert.equal(current.node.style.transform, "translate3d(0px, 26px, 0)"); assert.deepEqual(f.issues, []);
    current.failed(new Error("current failure"));
    assert.equal(current.node.style.transform, "translate3d(0px, 0px, 0)"); assert.equal(f.issues.length, 1);
    assert.deepEqual(f.root.children.map(row => row.firstChild), [a, b, c]);
  } finally { f.dispose(); }
}));

test("keyboard/program, region or size changes, hidden, reduced/off/quiet and absent providers accept order without travel", () => withTestDocument(() => {
  for (const variant of ["program", "geometry", "closed", "hidden", "reduced", "none", "quiet", "absent"]) {
    const f = fixture({ absent: variant === "absent" }), [a, b, c] = f.nodes;
    try {
      if (["none", "reduced"].includes(variant)) f.service.setPolicy({ mode: variant });
      if (variant === "quiet") f.service.setPolicy({ profile: "quiet" });
      if (variant === "hidden") f.workspaceRoot.hidden = true;
      f.render([c, a, b], { pointer: variant !== "program", stable: variant !== "geometry", open: variant !== "closed" });
      assert.equal(f.jobs.length, 0, variant); assert.equal(f.service.snapshot().active, 0);
      assert.deepEqual(f.root.children.map(row => row.firstChild), [c, a, b]);
    } finally { f.dispose(); }
  }
}));

test("movement/target budgets fall back as a group without clamping layout or command results", () => withTestDocument(() => {
  for (const variant of ["distance", "targets"]) {
    const f = fixture({ count: variant === "targets" ? 33 : 3 });
    try {
      if (variant === "distance") f.spacing(800);
      const order = [...f.nodes].reverse();
      f.render(order);
      assert.equal(f.jobs.length, 0, variant); assert.ok(f.service.snapshot().targets <= 32);
      assert.deepEqual(f.root.children.map(row => row.firstChild), order);
    } finally { f.dispose(); }
  }
}));

test("adding content fades only the new carrier and gives existing items room without adding DOM layers", () => withTestDocument(async () => {
  const f = fixture(), [a, b, c] = f.nodes, row = b.parentNode;
  try {
    b.hidden = row.hidden = true; f.render([a, c], { pointer: false });
    f.render([a, b, c], undefined, () => { b.hidden = row.hidden = false; });
    const enter = f.jobs.find(job => job.node === row), giveWay = f.jobs.find(job => job.node === c.parentNode);
    assert.equal(f.jobs.length, 2); assert.equal(enter.intent, "content-transition"); assert.equal(enter.settings.fadeDuration, .16);
    assert.equal(enter.from.opacity, 0); assert.equal(enter.to.opacity, 1); assert.equal(enter.from.x, 0); assert.equal(enter.from.y, 0);
    assert.equal(giveWay.intent, "drag-settle"); assert.equal(giveWay.from.y, -50);
    assert.equal(row.firstChild, b); assert.equal(row.children.length, 1); assert.equal(f.service.snapshot().targets, 3);
    enter.write({ opacity: .4 }); f.render([a, b, c]);
    assert.equal(enter.control.stopped, false); assert.equal(row.style.opacity, "0.4", "same accepted membership preserves fade progress");
    enter.complete(); giveWay.complete(); await Promise.resolve();
    assert.equal(row.style.opacity, ""); assert.equal(row.style.transform, ""); assert.equal(f.service.snapshot().active, 0);
  } finally { f.dispose(); }
}));

test("removal is immediately hidden and only survivors close the accepted gap", () => withTestDocument(async () => {
  const f = fixture(), [a, b, c] = f.nodes, row = b.parentNode;
  try {
    f.presentation.beforeRender(); b.hidden = row.hidden = true;
    f.presentation.update([a, c], { pointer: true });
    assert.equal(f.jobs.length, 1); assert.equal(f.jobs[0].node, c.parentNode); assert.equal(f.jobs[0].from.y, 50);
    assert.equal(row.hidden, true); assert.equal(b.hidden, true); assert.equal(row.style.opacity, "");
    assert.equal(f.root.children.length, 3, "hidden persistent records retain their original identity, not an exit clone");
    f.jobs[0].complete(); await Promise.resolve(); assert.equal(f.service.snapshot().active, 0);
  } finally { f.dispose(); }
}));

test("consecutive additions continue a stationary item's sampled fade instead of making it suddenly opaque", () => withTestDocument(async () => {
  const f = fixture(), [a, b, c] = f.nodes;
  try {
    b.hidden = b.parentNode.hidden = c.hidden = c.parentNode.hidden = true;
    f.render([a], { pointer: false });
    f.render([a, b], undefined, () => { b.hidden = b.parentNode.hidden = false; });
    const old = f.jobs.find(job => job.node === b.parentNode); old.write({ opacity: .35 });
    f.render([a, b, c], undefined, () => { c.hidden = c.parentNode.hidden = false; });
    const continued = f.jobs.filter(job => job.node === b.parentNode).at(-1);
    assert.notEqual(continued, old); assert.equal(continued.from.opacity, .35); assert.equal(continued.node.style.opacity, "0.35");
    assert.equal(continued.intent, "content-transition"); assert.equal(f.jobs.at(-1).from.opacity, 0);
    old.complete(); old.failed(new Error("old fade")); await Promise.resolve();
    assert.equal(continued.node.style.opacity, "0.35"); assert.deepEqual(f.issues, []);
  } finally { f.dispose(); }
}));

test("cross-region movement reuses the cell while source items close the gap and destination fades locally", () => withTestDocument(async () => {
  const f = fixture(), [a, b, c] = f.nodes, root = document.createElement("div"); f.workspaceRoot.append(root);
  const destination = createFrameContentOrderPresentation({ root, workspaceRoot: f.workspaceRoot, service: f.service });
  destination.update([]);
  try {
    const input = a.firstChild; input.focus(); f.presentation.beforeRender(); destination.beforeRender();
    const old = a.parentNode, row = destination.item(a); root.append(row); old.remove();
    row.getBoundingClientRect = () => ({ x: 900, y: 0, width: 200, height: 40 });
    f.presentation.update([b, c], { pointer: true }); destination.update([a], { pointer: true });
    assert.equal(f.jobs.length, 3); assert.equal(f.jobs.filter(job => job.intent === "drag-settle").length, 2);
    const enter = f.jobs.find(job => job.node === row);
    assert.equal(enter.intent, "content-transition"); assert.equal(enter.from.x, 0); assert.equal(enter.to.x, 0);
    assert.equal(a.firstChild, input); assert.equal(input.value, "draft-0"); assert.equal(document.activeElement, input);
    assert.equal(f.service.snapshot().targets, 3);
    for (const job of f.jobs) { assert.equal(job.from.x, 0); job.complete(); }
    await Promise.resolve(); assert.equal(row.style.transform, "");
  } finally { destination.dispose(); f.dispose(); }
}));

test("rapid hide/re-add isolates stale entry writes, completion and failure from the accepted new entry", () => withTestDocument(async () => {
  const f = fixture(), [a, b, c] = f.nodes, row = b.parentNode;
  try {
    b.hidden = row.hidden = true; f.render([a, c], { pointer: false });
    f.render([a, b, c], undefined, () => { b.hidden = row.hidden = false; });
    const old = f.jobs.find(job => job.node === row); old.write({ opacity: .3 });
    f.render([a, c], undefined, () => { b.hidden = row.hidden = true; });
    f.render([a, b, c], undefined, () => { b.hidden = row.hidden = false; });
    const current = f.jobs.filter(job => job.node === row).at(-1);
    assert.notEqual(current, old); assert.equal(old.control.stopped, true);
    old.write({ opacity: 1 }); old.failed(new Error("old entry")); old.complete(); await Promise.resolve();
    assert.equal(row.style.opacity, "0"); assert.deepEqual(f.issues, []); assert.equal(row.hidden, false);
    current.failed(new Error("current entry")); await Promise.resolve();
    assert.equal(row.style.opacity, ""); assert.equal(f.issues.length, 1); assert.equal(row.firstChild, b);
  } finally { f.dispose(); }
}));

test("entry respects the same input, visibility, geometry and system policy gates as sorting", () => withTestDocument(async () => {
  for (const variant of ["program", "geometry", "closed", "hidden", "reduced", "none", "quiet", "absent"]) {
    const f = fixture({ absent: variant === "absent" }), [a, b, c] = f.nodes, row = b.parentNode;
    try {
      b.hidden = row.hidden = true; f.render([a, c], { pointer: false });
      if (["none", "reduced"].includes(variant)) f.service.setPolicy({ mode: variant });
      if (variant === "quiet") f.service.setPolicy({ profile: "quiet" });
      if (variant === "hidden") f.workspaceRoot.hidden = true;
      f.render([a, b, c], { pointer: variant !== "program", stable: variant !== "geometry", open: variant !== "closed" }, () => { b.hidden = row.hidden = false; });
      await Promise.resolve(); // A missing provider returns an already-completed service handle.
      assert.equal(f.jobs.length, 0, variant); assert.equal(f.service.snapshot().active, 0); assert.equal(row.style.opacity, "");
    } finally { f.dispose(); }
  }
}));

test("invalid entry measurements fall back for the whole membership change without leaving transparent content", () => withTestDocument(() => {
  const f = fixture(), [a, b, c] = f.nodes, row = b.parentNode;
  try {
    b.hidden = row.hidden = true; f.render([a, c], { pointer: false });
    row.getBoundingClientRect = () => ({ x: 0, y: 50, width: 0, height: 40 });
    f.render([a, b, c], undefined, () => { b.hidden = row.hidden = false; });
    assert.equal(f.jobs.length, 0); assert.equal(row.style.opacity, ""); assert.equal(f.service.snapshot().active, 0);
    assert.equal(row.hidden, false); assert.equal(row.firstChild, b);
  } finally { f.dispose(); }
}));

test("empty-to-one-to-empty stays usable; initial mount and repeated empty updates do not animate", () => withTestDocument(async () => {
  const f = fixture({ count: 0 }), node = document.createElement("section");
  try {
    f.presentation.beforeRender(); const row = f.presentation.item(node); f.root.append(row);
    row.getBoundingClientRect = () => ({ x: 0, y: 0, width: 200, height: 40 });
    f.presentation.update([node], { pointer: true });
    assert.equal(f.jobs.length, 1); assert.equal(f.jobs[0].intent, "content-transition");
    f.presentation.beforeRender(); node.hidden = row.hidden = true; f.presentation.update([], { pointer: true });
    assert.equal(f.service.snapshot().active, 0); assert.equal(row.style.opacity, "");
    f.presentation.beforeRender(); f.presentation.update([], { pointer: true }); assert.equal(f.jobs.length, 1);
    f.jobs[0].complete(); await Promise.resolve(); assert.equal(row.hidden, true);
    const initialRoot = document.createElement("div"), initialNode = document.createElement("section"); f.workspaceRoot.append(initialRoot);
    const initial = createFrameContentOrderPresentation({ root: initialRoot, workspaceRoot: f.workspaceRoot, service: f.service });
    try {
      const initialRow = initial.item(initialNode); initialRoot.append(initialRow);
      initialRow.getBoundingClientRect = row.getBoundingClientRect;
      initial.update([initialNode], { pointer: true }); assert.equal(f.jobs.length, 1, "even a pointer-like first mount is static");
      assert.equal(initialRow.style.opacity, "");
    } finally { initial.dispose(); }
  } finally { f.dispose(); }
}));

test("removing a moving carrier invalidates its completion and separate instances keep their tracks", () => withTestDocument(async () => {
  const first = fixture(), second = fixture();
  try {
    first.render([...first.nodes].reverse()); second.render([...second.nodes].reverse());
    const removed = first.nodes[0], old = first.jobs.find(job => job.node.firstChild === removed);
    removed.parentNode.remove(); first.presentation.update(first.nodes.slice(1), { pointer: true });
    old.complete(); old.failed(new Error("removed")); await Promise.resolve();
    assert.equal(first.service.snapshot().targets, 2); assert.equal(first.service.snapshot().active, 0);
    assert.equal(second.service.snapshot().active, 2); assert.deepEqual(first.issues, []);
    first.dispose(); assert.equal(second.service.snapshot().targets, 3);
  } finally { first.dispose(); second.dispose(); }
}));

test("scroll, resize, visibility and disposal settle immediately and do not replay or leak targets", () => withTestDocument(({ window }) => {
  const windowListeners = getEventListeners(window, "resize").length, documentListeners = getEventListeners(document, "visibilitychange").length;
  const f = fixture(), reverse = [...f.nodes].reverse();
  try {
    f.render(reverse); assert.equal(f.service.snapshot().active, 2);
    f.root.dispatchEvent(new Event("scroll")); assert.equal(f.service.snapshot().active, 0);
    f.render(f.nodes); window.dispatchEvent(new Event("resize")); assert.equal(f.service.snapshot().active, 0);
    f.render(reverse); document.dispatchEvent(new Event("visibilitychange")); assert.equal(f.service.snapshot().active, 0);
    const count = f.jobs.length; f.dispose(); f.dispose();
    window.dispatchEvent(new Event("resize")); f.root.dispatchEvent(new Event("scroll"));
    for (const job of f.jobs) { job.failed(new Error("disposed")); job.write({ y: 99 }); job.complete(); }
    assert.equal(f.jobs.length, count); assert.deepEqual(f.issues, []);
    assert.equal(f.service.snapshot().targets, 0); assert.equal(f.service.snapshot().components, 0);
    assert.equal(getEventListeners(window, "resize").length, windowListeners);
    assert.equal(getEventListeners(document, "visibilitychange").length, documentListeners);
    assert.ok(f.nodes.every(node => node.parentNode === f.root));
  } finally { f.dispose(); }
}));

test("a single adapter projection wraps an existing cell without detaching it from its new carrier", () => withTestDocument(() => {
  const f = fixture({ count: 0 }), right = document.createElement("section"); f.workspaceRoot.append(right);
  const cell = document.createElement("section"), input = document.createElement("input"); cell.append(input);
  let mounts = 0;
  const descriptor = { id: "trial.a", componentId: "trial.a" };
  const sidebar = createSidebarPresentation({ catalog: { list: () => [descriptor] }, composition: {}, components: {
    has: (_, node) => node === cell, ensure() { mounts++; return cell; }, setVariant() {}, setVisible() {}, release() { cell.remove(); },
  } });
  const regions = { left: { element: f.root, variant: "panel", item: f.presentation.item }, right: { element: right, variant: "page" } };
  try {
    const model = slot => ({ left: slot === "left" ? [descriptor] : [], right: slot === "right" ? [descriptor] : [],
      activeRight: slot === "right" ? descriptor : null, leftOpen: true, rightOpen: true, placements: [{ id: "trial.a", componentId: "trial.a", slot, enabled: true }] });
    sidebar.render(model("right"), regions); assert.equal(cell.parentNode, right);
    const rendered = sidebar.render(model("left"), regions);
    assert.equal(cell.parentNode.className, "v-frame-order-row"); assert.equal(cell.parentNode.parentNode, f.root);
    assert.deepEqual(rendered.left, [cell]); assert.equal(cell.firstChild, input); assert.equal(mounts, 1);
    f.presentation.update([cell]); sidebar.render(model("right"), regions); f.presentation.update([]);
    assert.equal(cell.parentNode, right); assert.equal(f.root.children.length, 0); assert.equal(mounts, 1);
  } finally { f.dispose(); sidebar.dispose(); }
}));

test("full runtime preserves the one command/edit transaction, component instances and inputs across host carrier moves and cancel", () => withTestDocument(() => {
  const root = document.createElement("main"); document.body.append(root);
  let mounts = 0, cleanups = 0;
  const plugin = definePlugin({ id: "trial.order", name: "Order test", version: "0.1.0", apiVersion: "4.0", ui: { contractVersion: 1,
    components: ["a", "b"].map(name => ({ id: "trial.order." + name, title: name, role: "tool", slots: ["left", "right"], defaultSlot: "right", defaultEnabled: true,
      mount(element) { mounts++; const input = document.createElement("input"); input.id = "trial-input-" + name; element.append(input); return { dispose() { cleanups++; } }; },
    })),
  } });
  const jobs = [], runtime = createBackupUiRuntime({ root, plugins: [plugin], animationProvider: { name: "capture", start(job) { jobs.push(job); return { stop() {} }; } } });
  try {
    const assistant = "trial.order.a", tone = "trial.order.b";
    assert.equal(runtime.execute(S.reorder, { id: assistant, index: 2 }).ok, false, "configuration stays edit-gated");
    runtime.execute(C.page, { id: assistant, toggle: false });
    const input = root.querySelector("#trial-input-a"); input.value = "preserve this draft";
    runtime.execute(C.page, { id: "frame.layout.page", toggle: false }); runtime.execute(C.begin);
    runtime.execute(C.region, { region: "left", open: true });
    assert.equal(runtime.execute(S.move, { id: assistant, slot: "left", index: 0 }).ok, true);
    assert.equal(runtime.execute(S.move, { id: tone, slot: "left", index: 1 }).ok, true);
    const left = root.querySelector(".v-modules"), original = [...left.children].filter(row => row.className === "v-frame-order-row");
    const firstCell = original[0].firstChild, geometry = runtime.workspace.snapshot();
    input.focus(); assert.equal(runtime.execute(S.reorder, { id: assistant, index: 1 }).ok, true);
    const ordered = [...left.children].filter(row => row.className === "v-frame-order-row");
    assert.equal(ordered[1], original[0]); assert.equal(ordered[1].firstChild, firstCell);
    assert.equal(root.querySelector("#trial-input-a"), input); assert.equal(input.value, "preserve this draft"); assert.equal(mounts, 2);
    assert.equal(document.activeElement, input); assert.equal(runtime.workspace.snapshot(), geometry);
    assert.equal(jobs.length, 0, "programmatic commands cannot spoof trusted pointer animation");
    assert.equal(runtime.execute(S.enabled, { id: assistant, enabled: false }).ok, true);
    assert.equal(firstCell.hidden, true); assert.equal(ordered[1].hidden, true);
    assert.equal(runtime.execute(S.enabled, { id: assistant, enabled: true }).ok, true);
    assert.equal(root.querySelector("#trial-input-a"), input); assert.equal(input.value, "preserve this draft"); assert.equal(mounts, 2);
    runtime.execute(C.finish, { confirm: false });
    assert.equal(root.querySelector("#trial-input-a"), input); assert.equal(input.parentNode.parentNode, root.querySelector(".v-page"));
    assert.equal(left.querySelectorAll(".v-frame-order-row").length, 0);
    assert.equal(input.value, "preserve this draft");
  } finally { runtime.dispose(); assert.equal(runtime.motion.snapshot().targets, 0); assert.equal(cleanups, mounts); }
}));
