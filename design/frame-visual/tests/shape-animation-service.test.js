import assert from "node:assert/strict";
import test from "node:test";
import { createAnimationService } from "../src/runtime/animation-service.js";
import { createDomAnimationDriver } from "../src/runtime/dom-animation-driver.js";
import { captureAnimationContribution, captureAnimationValues, ANIMATION_SHAPE_EXTENT } from "../src/contracts/animation.js";
import { definePlugin } from "../src/vendor/plugin-platform.js";
import { LAYOUT_PREVIEW_SHAPE } from "../src/features/workspace-layout-motion-recipes.js";
import { withTestDocument } from "./support/dom-test-environment.js";

const intent = "shape-transition";
const initial = { x: 8, y: 12, width: 80, height: 60, opacity: .28 };
const destination = { x: 20, y: 30, width: 140, height: 90, opacity: 1 };
const contribution = () => ({ contractVersion: 1, definitions: { [intent]: JSON.parse(JSON.stringify(LAYOUT_PREVIEW_SHAPE)) } });
const request = (to = destination, extra = {}) => ({ intent, target: "shape:block", to, ...extra });
function fixture(options = {}) {
  const jobs = [], issues = [], timers = new Map(), driver = createDomAnimationDriver(); let timer = 0;
  const provider = { name: "shape probe", start(args) {
    const control = { stopped: 0, stop() { this.stopped++; } }; jobs.push({ ...args, control }); return control;
  } };
  const service = createAnimationService({ driver, provider, onIssue: issue => issues.push(issue),
    schedule: (callback, ms) => { const id = ++timer; timers.set(id, { callback, ms }); return id; }, unschedule: id => timers.delete(id), ...options });
  const mount = (owner = "shape.author", animations = contribution(), permissions = [intent]) => {
    const root = document.createElement("section"), node = document.createElement("span");
    document.body.append(root); root.append(node); node.style.width = node.style.height = "512px";
    driver.write(node, initial, intent);
    const original = driver.capture(node, [intent]);
    const definition = { id: `${owner}.panel`, owner, animations, permissions: { animations: permissions } };
    const component = service.forComponent(definition, root);
    const port = component.bind({ "shape:block": { node, intents: permissions } });
    return { root, node, definition, component, port, original };
  };
  return { jobs, issues, timers, driver, service, mount, ...mount("shape.author", options.animations ?? contribution()) };
}

test("shape is an additive strict intent with frozen authored variants and no spring/timing escape", () => {
  const raw = contribution(), accepted = captureAnimationContribution(raw);
  raw.definitions[intent].variants.continuous.duration = .3;
  assert.equal(accepted.definitions[intent].variants.continuous.duration, .28);
  assert.ok(Object.isFrozen(accepted.definitions[intent].variants));
  for (const variant of [{ type: "spring", stiffness: 260, damping: 32 },
    { type: "tween", duration: .28, ease: [.77, 0, .175, 1], fadeDuration: .2 },
    { type: "tween", duration: .28, ease: [.77, 0, .175, 1], css: "width" }]) {
    const value = contribution(); value.definitions[intent].variants.continuous = variant;
    assert.throws(() => captureAnimationContribution(value), TypeError);
  }
  assert.throws(() => captureAnimationContribution({ ...contribution(), contractVersion: 2 }), /version/);
  assert.throws(() => captureAnimationContribution({ contractVersion: 1, definitions: { "future-shape": {} } }), /field/);
});

test("shape requires an entire finite nonnegative rectangle inside the 512px plane; old intents still deny dimensions", () => {
  assert.equal(ANIMATION_SHAPE_EXTENT, 512);
  const zero = captureAnimationValues({ x: 512, y: 512, width: 0, height: 0, opacity: 0 }, intent);
  assert.deepEqual(zero, { x: 512, y: 512, width: 0, height: 0, opacity: 0 }); assert.ok(Object.isFrozen(zero));
  assert.deepEqual(captureAnimationValues({ x: 0, y: 0, width: 512, height: 512 }, intent), { x: 0, y: 0, width: 512, height: 512 });
  for (const value of [{ width: 1, height: 1 }, { ...initial, x: -1 }, { ...initial, width: NaN }, { ...initial, y: Infinity },
    { ...initial, height: "60" }, { ...initial, width: null }, { ...initial, x: 500 }, { ...initial, y: 500 },
    { ...initial, opacity: 2 }, { ...initial, opacity: null }, { ...initial, top: 0 }, { ...initial, clipPath: "none" }]) {
    assert.throws(() => captureAnimationValues(value, intent), TypeError);
  }
  for (const legacy of ["content-transition", "selection-transition", "drag-settle"]) {
    assert.throws(() => captureAnimationValues(initial, legacy), /field/);
  }
  let reads = 0; const getter = { ...initial };
  Object.defineProperty(getter, "width", { enumerable: true, get() { reads++; return 80; } });
  assert.throws(() => captureAnimationValues(getter, intent), /non-data/); assert.equal(reads, 0);
});

test("formal mount captures shape in its original component declaration and rejects missing permission before mount", () => {
  const unit = { id: "shape.formal.panel", title: "Shape", role: "tool", slots: ["left"], mount() {}, animations: contribution() };
  const identity = { id: "shape.formal", name: "Shape", version: "0.1.0", apiVersion: "4.0" };
  assert.throws(() => definePlugin({ ...identity, ui: { contractVersion: 1, components: [unit] } }));
  const plugin = definePlugin({ ...identity, ui: { contractVersion: 1, components: [{ ...unit, permissions: { animations: [intent] } }] } });
  assert.equal(plugin.ui.components[0].animations.definitions[intent].variants.continuous.duration, .28);
  assert.deepEqual(plugin.ui.components[0].permissions.animations, [intent]);
  assert.throws(() => definePlugin({ ...identity, ui: { contractVersion: 1, components: [{ ...unit, permissions: { animations: ["content-transition"] } }] } }));
});

test("illegal shape destination/source/velocity rejects atomically before interruption, reads or writes", () => withTestDocument(() => {
  const f = fixture();
  try {
    f.port.play(request()); const before = f.driver.capture(f.node, [intent]);
    for (const value of [request({ ...destination, width: -1 }), request(destination, { from: { x: 0 } }),
      request(destination, { velocity: {} }), request(destination, { velocity: null }), request(destination, { velocity: undefined }),
      request(destination, { duration: .1 }), request(destination, { immediate: 0 })]) {
      assert.throws(() => f.port.play(value), TypeError);
      assert.equal(f.jobs.length, 1); assert.equal(f.jobs[0].control.stopped, 0); assert.equal(f.service.snapshot().active, 1);
      assert.deepEqual(f.driver.capture(f.node, [intent]), before);
    }
    assert.equal(f.timers.size, 1); assert.equal(f.issues.length, 0);
  } finally { f.service.dispose(); }
}));

test("no provider, empty definitions and every immediate policy preserve meaningful complete geometry", () => withTestDocument(async () => {
  const f = fixture();
  try {
    const empty = f.mount("shape.empty", null);
    empty.port.play(request({ x: 31, y: 42, width: 50, height: 60 }));
    assert.deepEqual(f.driver.read(empty.node, intent), { x: 31, y: 42, width: 50, height: 60, opacity: .28 });
    assert.equal(f.jobs.length, 0);
    f.service.replaceProvider(null);
    assert.equal((await f.port.play(request()).finished).status, "completed");
    assert.deepEqual(f.driver.read(f.node, intent), destination); assert.equal(f.jobs.length, 0);
    f.service.replaceProvider({ start() { throw new Error("should remain immediate"); } });
    for (const mode of ["reduced", "none"]) {
      f.service.setPolicy({ mode }); f.port.play(request(initial)); assert.deepEqual(f.driver.read(f.node, intent), initial);
    }
    f.service.setPolicy({ mode: "full", reducedMotion: true }); f.port.play(request());
    assert.deepEqual(f.driver.read(f.node, intent), destination);
    f.service.setPolicy({ reducedMotion: false }); f.port.play(request(initial, { immediate: true }));
    assert.deepEqual(f.driver.read(f.node, intent), initial); assert.equal(f.issues.length, 0);
    assert.throws(() => f.port.place(request({ width: 10 })), TypeError);
  } finally { f.service.dispose(); }
}));

test("shape consumes the author's variants and slow time budget without an identity-specific recipe", () => withTestDocument(() => {
  const f = fixture();
  try {
    for (const [profile, seconds] of [["continuous", .28], ["focused", .26], ["quiet", .14], ["missing", .28]]) {
      f.service.setPolicy({ profile, mode: "slow" }); f.port.play(request());
      assert.equal(f.jobs.at(-1).settings.duration, seconds); assert.equal(f.jobs.at(-1).settings.multiplier, 2.5);
      assert.equal([...f.timers.values()][0].ms, seconds * 2500 + 50);
    }
    const other = f.mount("independent.author"); other.port.play(request());
    assert.equal(f.jobs.at(-1).settings.duration, .28);
  } finally { f.service.dispose(); }
}));

test("reversal samples the current full rectangle and ignores all retired completion/failure/frame callbacks", () => withTestDocument(async () => {
  const f = fixture();
  try {
    const first = f.port.play(request()), middle = { x: 14, y: 21, width: 110, height: 75, opacity: .64 };
    f.jobs[0].write(middle); const second = f.port.play(request(initial));
    assert.deepEqual(f.jobs[1].from, middle); assert.equal((await first.finished).status, "interrupted");
    assert.equal(f.jobs[0].control.stopped, 1);
    f.jobs[0].write(destination); f.jobs[0].complete(); f.jobs[0].failed(new Error("late"));
    assert.deepEqual(f.driver.read(f.node, intent), middle); assert.equal(f.issues.length, 0);
    f.jobs[1].complete(); assert.equal((await second.finished).status, "completed");
    assert.deepEqual(f.driver.read(f.node, intent), initial); assert.equal(f.timers.size, 0);
  } finally { f.service.dispose(); }
}));

test("hold, hide/restore, cancel and provider replacement settle accepted shapes without replay", () => withTestDocument(async () => {
  const f = fixture();
  try {
    const first = f.port.play(request()); f.jobs[0].write({ ...initial, width: 100 });
    const held = f.port.hold({ intent, target: "shape:block" }); assert.equal(held.width, 100);
    assert.equal((await first.finished).status, "interrupted"); assert.deepEqual(f.driver.read(f.node, intent), held);
    const hidden = f.port.play(request()); f.component.setVisible(false);
    assert.equal((await hidden.finished).status, "cancelled"); assert.deepEqual(f.driver.read(f.node, intent), destination);
    f.port.play(request(initial)); assert.equal(f.jobs.length, 2);
    f.component.setVisible(true); assert.equal(f.jobs.length, 2);
    f.port.play(request()); f.port.cancel(); assert.deepEqual(f.driver.read(f.node, intent), destination);
    f.port.play(request(initial)); f.service.replaceProvider(null);
    assert.deepEqual(f.driver.read(f.node, intent), initial); assert.equal(f.service.snapshot().active, 0);
    assert.equal(f.timers.size, 0); assert.equal(f.issues.length, 0);
  } finally { f.service.dispose(); }
}));

test("current failure, bad frame and timeout settle the full accepted shape with only current diagnostics", () => withTestDocument(async () => {
  const f = fixture();
  try {
    const failed = f.port.play(request()); f.jobs[0].failed(new Error("shape failed"));
    assert.equal((await failed.finished).status, "engine-failed"); assert.deepEqual(f.driver.read(f.node, intent), destination);
    const bad = f.port.play(request(initial)); f.jobs[1].write({ ...destination, width: -1 });
    assert.equal((await bad.finished).status, "engine-failed"); assert.deepEqual(f.driver.read(f.node, intent), initial);
    const timeout = f.port.play(request()); [...f.timers.values()][0].callback();
    assert.equal((await timeout.finished).status, "engine-failed"); assert.deepEqual(f.driver.read(f.node, intent), destination);
    assert.equal(f.issues.length, 3); assert.equal(f.timers.size, 0);
    f.jobs.forEach(job => { job.failed(new Error("late")); job.write(initial); }); assert.equal(f.issues.length, 3);
    assert.deepEqual(f.driver.read(f.node, intent), destination);
  } finally { f.service.dispose(); }
}));

test("shape synchronous completion and thrown startup release controls, timers and accepted geometry", () => withTestDocument(async () => {
  let stopped = 0;
  const f = fixture({ provider: { start(args) { args.complete(); return { stop() { stopped++; } }; } } });
  try {
    assert.equal((await f.port.play(request()).finished).status, "completed");
    assert.deepEqual(f.driver.read(f.node, intent), destination);
    assert.equal(stopped, 1); assert.equal(f.timers.size, 0); assert.equal(f.service.snapshot().active, 0);
    f.service.replaceProvider({ start() { throw new Error("shape startup failed"); } });
    assert.equal((await f.port.play(request(initial)).finished).status, "engine-failed");
    assert.deepEqual(f.driver.read(f.node, intent), initial);
    assert.equal(f.issues.length, 1); assert.equal(f.timers.size, 0); assert.equal(f.service.snapshot().active, 0);
  } finally { f.service.dispose(); }
}));

test("shape batch capture failure claims no node and permits an identical clean retry", () => withTestDocument(() => {
  const base = createDomAnimationDriver(); let captures = 0, failing = false;
  const f = fixture({ driver: { ...base, capture(node, intents) {
    if (failing && ++captures === 2) throw new Error("capture failed");
    return base.capture(node, intents);
  } } });
  try {
    const nodes = [document.createElement("span"), document.createElement("span")]; f.root.append(...nodes);
    const targets = Object.fromEntries(nodes.map((node, i) => [`shape:batch${i}`, { node, intents: [intent] }]));
    failing = true; assert.throws(() => f.component.bind(targets), /capture failed/);
    assert.equal(f.service.snapshot().targets, 1);
    failing = false; const port = f.component.bind(targets); assert.equal(f.service.snapshot().targets, 3);
    port.dispose(); assert.equal(f.service.snapshot().targets, 1);
    assert.equal(f.issues.length, 0);
  } finally { f.service.dispose(); }
}));

test("DOM driver only exposes clip restoration to shape grants and rejects unsupported current clipping", () => withTestDocument(() => {
  const f = fixture();
  try {
    const ordinary = f.driver.capture(f.node, ["content-transition"]); assert.equal(Object.hasOwn(ordinary, "clipPath"), false);
    f.node.style.clipPath = "inset(0px 400px 410px 0px round 2px)";
    const clip = f.node.style.clipPath;
    f.driver.write(f.node, { x: 8, width: 1, height: 1, opacity: .5 }, "content-transition");
    f.driver.restore(f.node, ordinary); assert.equal(f.node.style.clipPath, clip);
    f.node.style.clipPath = "inset(0px 400px 410px 0px round 2px)";
    assert.deepEqual(f.driver.read(f.node, intent), { x: 8, y: 12, width: 112, height: 102, opacity: .28 });
    for (const invalid of ["circle(20px)", "inset(0px 400px 410px round 2px)", "inset(0px 5% 0px 0px round 2px)", "inset(1px 400px 410px 0px round 2px)",
      "inset(0px 400px 410px 1px round 2px)", "inset(0px 400px 410px 0px round 4px)"]) {
      f.node.style.clipPath = invalid; assert.throws(() => f.port.play(request()), TypeError); assert.equal(f.jobs.length, 0);
    }
    f.port.dispose(); assert.deepEqual(f.driver.capture(f.node, [intent]), f.original);
  } finally { f.service.dispose(); }
}));

test("two shape instances isolate same names, reject foreign roots and do not restore a moved node", () => withTestDocument(() => {
  const f = fixture(), other = f.mount("shape.other");
  try {
    assert.throws(() => f.component.bind({ foreign: { node: other.node, intents: [intent] } }), /denied/);
    assert.throws(() => f.component.bind({ root: { node: f.root, intents: [intent] } }), /denied/);
    f.root.append(other.root);
    assert.throws(() => f.component.bind({ nested: { node: other.node, intents: [intent] } }), /denied/);
    f.port.play(request()); other.port.play(request({ ...destination, width: 100 }));
    f.component.dispose(); assert.equal(f.service.snapshot().targets, 1); assert.equal(f.service.snapshot().active, 1);
    assert.deepEqual(f.driver.capture(f.node, [intent]), f.original);
    other.port.play(request()); f.root.append(other.node);
    f.driver.write(other.node, initial, intent); const moved = f.driver.capture(other.node, [intent]);
    f.jobs.at(-1).write(destination); f.jobs.at(-1).failed(new Error("revoked")); other.component.dispose();
    assert.deepEqual(f.driver.capture(other.node, [intent]), moved); assert.equal(f.issues.length, 0);
    assert.equal(f.service.snapshot().targets, 0); assert.equal(f.timers.size, 0);
  } finally { f.service.dispose(); }
}));

test("shape target and shared concurrency budgets reject atomically and every target is released", () => withTestDocument(() => {
  const f = fixture();
  try {
    const instances = [f, f.mount("shape.second"), f.mount("shape.third"), f.mount("shape.fourth")];
    for (const instance of instances) {
      const grants = Object.fromEntries(Array.from({ length: 32 }, (_, index) => {
        const node = document.createElement("span"); instance.root.append(node); f.driver.write(node, initial, intent);
        return [`shape:n${index}`, { node, intents: [intent] }];
      }));
      assert.throws(() => instance.component.bind(grants), /budget/); instance.port.dispose();
      const port = instance.component.bind(grants);
      for (const target of Object.keys(grants)) port.play({ intent, target, to: destination });
    }
    assert.equal(f.service.snapshot().active, 128);
    const extra = f.mount("shape.fifth"); assert.throws(() => extra.port.play(request()), /concurrency/);
    assert.deepEqual(f.driver.read(extra.node, intent), initial); assert.equal(f.service.snapshot().active, 128);
    f.service.dispose(); assert.equal(f.service.snapshot().targets, 0); assert.equal(f.timers.size, 0);
  } finally { f.service.dispose(); }
}));
