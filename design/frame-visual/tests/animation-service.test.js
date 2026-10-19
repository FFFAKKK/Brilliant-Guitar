import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createAnimationService } from "../src/runtime/animation-service.js";
import { captureAnimationContribution, ANIMATION_BUDGET } from "../src/contracts/animation.js";

const contribution = (duration = .25) => ({ contractVersion: 1, definitions: {
  "content-transition": { defaultVariant: "authored", variants: { authored: { type: "tween", duration, ease: [.23, 1, .32, 1], fadeDuration: .16, exitDuration: .08 } } },
  "selection-transition": { defaultVariant: "authored", variants: { authored: { type: "tween", duration, ease: [.77, 0, .175, 1] } } },
  "drag-settle": { defaultVariant: "authored", variants: { authored: { type: "spring", stiffness: 260, damping: 32 } } },
} });
function fixture(options = {}) {
  const calls = [], issues = [], timers = new Map();
  let nextTimer = 1;
  const driver = { read: node => ({ x: node.x, y: node.y, opacity: node.opacity }),
    write: (node, value) => Object.assign(node, value), capture: node => ({ x: node.x, y: node.y, opacity: node.opacity }),
    restore: (node, value) => Object.assign(node, value) };
  const provider = { name: "fake", start(args) { const control = { stopped: 0, stop() { this.stopped++; } }; calls.push({ ...args, control }); return control; } };
  const service = createAnimationService({ driver, provider, onIssue: issue => issues.push(issue),
    schedule: (fn, ms) => { const id = nextTimer++; timers.set(id, { fn, ms }); return id; }, unschedule: id => timers.delete(id), ...options });
  const mount = (owner = "frame.layout", animations = contribution()) => {
    const children = new Set(), root = { contains: node => children.has(node) };
    const node = { x: 0, y: 0, opacity: 1, parentNode: root }; children.add(node);
    const definition = { id: `${owner}.page`, owner, animations, permissions: { animations: ["content-transition", "selection-transition", "drag-settle"] } };
    const component = service.forComponent(definition, root);
    const port = component.bind({ local: { node, intents: definition.permissions.animations } });
    return { component, port, node, root, children, definition };
  };
  return { service, mount, calls, issues, timers, provider, driver, ...mount() };
}
const play = (port, to, extra = {}) => port.play({ intent: "content-transition", target: "local", to, ...extra });

test("host component profile selects captured variants without exposing timing or mutating an active job", () => {
  const f = fixture();
  try {
    const definitions = contribution();
    definitions.definitions["content-transition"].variants.exit = { type: "tween", duration: .12, fadeDuration: .12, exitDuration: .12, ease: [.23, 1, .32, 1] };
    const scope = f.mount("frame.controls", definitions);
    scope.component.setProfile("exit"); play(scope.port, { opacity: 0 }); assert.equal(f.calls.at(-1).settings.duration, .12);
    scope.component.setProfile(null); assert.equal(f.calls.at(-1).settings.duration, .12); assert.equal(f.service.snapshot().active, 1);
    play(scope.port, { opacity: 1 }); assert.equal(f.calls.at(-1).settings.duration, .25);
    assert.throws(() => scope.component.setProfile({ duration: 9 }), /profile/);
    f.service.setPolicy({ reducedMotion: true }); scope.component.setProfile("exit"); play(scope.port, { opacity: 0 });
    assert.equal(f.calls.at(-1).settings.duration, .1); assert.equal(f.calls.at(-1).from.x, 0);
    assert.equal(scope.port.setProfile, undefined); scope.component.dispose(); assert.throws(() => scope.component.setProfile("exit"), /profile/);
  } finally { f.service.dispose(); }
});

test("optional animation null is empty; supplied versions, fields, sparse values and variants reject", () => {
  for (const value of [undefined, null, { contractVersion: 1 }, { contractVersion: 1, definitions: null }]) {
    assert.deepEqual(captureAnimationContribution(value).definitions, {});
  }
  for (const value of [false, [], {}, { contractVersion: "motion-review/2" }, { contractVersion: 2 },
    { contractVersion: 1, owner: "other.plugin" }, { contractVersion: 1, definitions: { unknown: {} } }]) assert.throws(() => captureAnimationContribution(value), TypeError);
  for (const mutate of [data => data.definitions["content-transition"].variants.authored.duration = 0,
    data => data.definitions["content-transition"].variants.authored.ease = Array(4),
    data => data.definitions["content-transition"].defaultVariant = "missing",
    data => data.definitions["content-transition"] = null,
    data => data.definitions["content-transition"].variants.authored.repeat = 4]) {
    const data = contribution(); mutate(data); assert.throws(() => captureAnimationContribution(data), TypeError);
  }
  const getter = { contractVersion: 1 }; Object.defineProperty(getter, "definitions", { enumerable: true, get() { throw new Error("getter executed"); } });
  assert.throws(() => captureAnimationContribution(getter), /non-data/);
});

test("actual author definitions are captured and default variant chosen without owner-specific effects", () => {
  const f = fixture(), second = f.mount("another.author", contribution(.12));
  second.definition.animations.definitions["content-transition"].variants.authored.duration = .3;
  play(f.port, { x: 0, opacity: 1 }, { from: { x: 16, opacity: 0 } });
  play(second.port, { opacity: 1 }, { from: { opacity: 0 } });
  assert.equal(f.calls[0].settings.duration, .25); assert.equal(f.calls[1].settings.duration, .12);
  assert.equal(f.calls[0].settings.fadeDuration, .16); assert.deepEqual(f.calls[0].settings.ease, [.23, 1, .32, 1]);
  f.service.dispose(); assert.equal(f.service.snapshot().targets, 0); assert.equal(f.timers.size, 0);
});

test("empty contribution or absent provider remains static, but malformed and denied requests still reject", async () => {
  const f = fixture(), empty = f.mount("empty.author", null);
  assert.equal((await play(empty.port, { x: 0, opacity: 0 }, { immediate: false }).finished).status, "completed");
  assert.equal(empty.node.opacity, 0); assert.equal(f.calls.length, 0);
  f.service.replaceProvider(null);
  play(f.port, { x: 0, opacity: 0 }, { immediate: false });
  assert.equal(f.node.opacity, 0); assert.equal(f.calls.length, 0);
  for (const request of [{ to: { x: 25 } }, { to: { width: 100 } }, { duration: 4 }, { owner: "other.author" }, { immediate: 0 }, { velocity: { y: Infinity } }]) {
    assert.throws(() => play(f.port, { opacity: 1 }, request), TypeError);
  }
  assert.equal(f.node.opacity, 0); f.service.dispose();
});

test("grants use only local exclusive descendants and declared intents; atomic failure claims nothing", () => {
  const f = fixture(), foreign = f.mount("foreign.author");
  for (const node of [f.root, foreign.node, {}]) assert.throws(() => f.component.bind({ test: { node, intents: ["content-transition"] } }), /denied/);
  assert.throws(() => f.component.bind({ same: { node: f.node, intents: ["content-transition"] } }), /denied/);
  const valid = { x: 0, y: 0, opacity: 1 }; f.children.add(valid);
  assert.throws(() => f.component.bind({ good: { node: valid, intents: ["content-transition"] }, bad: { node: foreign.node, intents: ["content-transition"] } }), /denied/);
  const retry = f.component.bind({ good: { node: valid, intents: ["content-transition"] } }); retry.dispose();
  const root = { contains: () => true };
  assert.throws(() => f.service.forComponent({ id: "spoof.author.page", owner: "actual.author" }, root), /registered/);
  assert.throws(() => f.service.forComponent({ id: "actual.author.page", owner: "actual.author", animations: contribution() }, root), /permissions/);
  f.children.delete(f.node); assert.throws(() => play(f.port, { opacity: 0 }), /denied/);
  f.service.dispose();
});

test("rapid reversal settles previous promises and ignores late completion, failure and frame updates", async () => {
  const f = fixture(), first = play(f.port, { opacity: 0 });
  f.node.opacity = .4;
  const second = play(f.port, { opacity: 1 });
  assert.equal((await first.finished).status, "interrupted"); assert.equal(f.calls[0].control.stopped, 1);
  f.calls[0].write({ opacity: 0 }); f.calls[0].complete(); f.calls[0].failed(new Error("late"));
  assert.equal(f.node.opacity, .4); assert.equal(f.issues.length, 0);
  f.calls[1].complete(); assert.equal((await second.finished).status, "completed"); assert.equal(f.node.opacity, 1);
  assert.equal(f.timers.size, 0); f.service.dispose();
});

test("provider failure and time limit settle accepted state with identity-bound diagnostics; no business callback", async () => {
  const f = fixture(), result = play(f.port, { opacity: 0 });
  f.calls[0].failed(new Error("engine failed"));
  assert.equal((await result.finished).status, "engine-failed"); assert.equal(f.node.opacity, 0);
  assert.equal(f.issues[0].source, "frame.layout.page"); assert.equal(f.issues[0].owner, "frame.layout");
  const timed = play(f.port, { opacity: 1 }); [...f.timers.values()][0].fn();
  assert.equal((await timed.finished).status, "engine-failed"); assert.equal(f.node.opacity, 1);
  assert.equal(f.issues.length, 2); f.service.dispose();
});

test("sync completion, thrown start and stop failure all leave no active jobs", async () => {
  for (const start of [args => { args.complete(); return { stop() {} }; }, () => { throw new Error("start failed"); },
    args => { queueMicrotask(args.complete); return { stop() { throw new Error("stop failed"); } }; }]) {
    const f = fixture({ provider: { start } }), result = play(f.port, { opacity: 0 });
    assert.ok(["completed", "engine-failed"].includes((await result.finished).status));
    assert.equal(f.node.opacity, 0); assert.equal(f.service.snapshot().active, 0); assert.equal(f.timers.size, 0);
    f.service.dispose();
  }
});

test("hidden presentation cancels to accepted state; hidden writes are static; restore keeps instance", async () => {
  const f = fixture(), result = play(f.port, { opacity: 0 }); f.component.setVisible(false);
  assert.equal((await result.finished).status, "cancelled"); assert.equal(f.node.opacity, 0);
  play(f.port, { opacity: 1 }); assert.equal(f.calls.length, 1); assert.equal(f.node.opacity, 1);
  f.component.setVisible(true); play(f.port, { opacity: 0 }); assert.equal(f.calls.length, 2);
  f.component.dispose(); f.component.dispose(); f.calls[1].failed(new Error("after release"));
  assert.deepEqual(f.driver.read(f.node), { x: 0, y: 0, opacity: 1 }); assert.equal(f.issues.length, 0);
  assert.throws(() => play(f.port, { opacity: 0 }), /Released/); f.service.dispose();
});

test("two mounted instances and provider replacement share policy while isolating targets", async () => {
  const f = fixture(), other = f.mount("another.author"), one = play(f.port, { opacity: 0 }), two = play(other.port, { opacity: .2 });
  f.component.dispose(); assert.equal((await one.finished).status, "cancelled"); assert.equal(f.service.snapshot().active, 1);
  const replacement = [], next = { name: "replacement", start(args) { replacement.push(args); return { stop() {} }; } };
  f.service.replaceProvider(next); assert.equal((await two.finished).status, "cancelled"); assert.equal(other.node.opacity, .2);
  play(other.port, { opacity: 1 }); replacement[0].complete(); assert.equal(other.node.opacity, 1);
  f.calls[1].write({ opacity: .2 }); assert.equal(other.node.opacity, 1); f.service.dispose();
});

test("system reduction, off, keyboard and policy changes take precedence over artwork", async () => {
  const f = fixture({ reducedMotion: true });
  play(f.port, { x: -16, opacity: 0 }, { from: { x: 16, opacity: 1 } });
  assert.equal(f.calls[0].from.x, 0); assert.equal(f.calls[0].to.x, 0); assert.equal(f.calls[0].settings.duration, .1);
  f.service.setPolicy({ reducedMotion: false, mode: "slow" });
  play(f.port, { opacity: 1 }); assert.equal(f.calls[1].settings.multiplier, 2.5);
  f.service.setPolicy({ mode: "none" }); play(f.port, { opacity: 0 }); assert.equal(f.calls.length, 2);
  f.service.setPolicy({ mode: "full" }); play(f.port, { opacity: 1 }, { immediate: true }); assert.equal(f.calls.length, 2);
  f.service.setPolicy({ reducedMotion: true });
  f.port.play({ intent: "selection-transition", target: "local", to: { x: 40 } }); assert.equal(f.node.x, 40); assert.equal(f.calls.length, 2);
  f.service.dispose();
});

test("target budget and full batch capture failure are reversible", () => {
  const f = fixture(), nodes = Array.from({ length: ANIMATION_BUDGET.targets }, () => ({ x: 0, y: 0, opacity: 1 }));
  nodes.forEach(node => f.children.add(node));
  assert.throws(() => f.component.bind(Object.fromEntries(nodes.map((node, index) => [`node-${index}`, { node, intents: ["content-transition"] }]))), /budget/);
  f.port.dispose(); const port = f.component.bind(Object.fromEntries(nodes.map((node, index) => [`node-${index}`, { node, intents: ["content-transition"] }])));
  assert.equal(f.service.snapshot().targets, ANIMATION_BUDGET.targets); port.dispose(); f.service.dispose();
});

test("generated browser contract exactly matches the formal shared source", async () => {
  const source = await readFile(new URL("../../../shared/ui-animation/contract.js", import.meta.url), "utf8");
  const generated = await readFile(new URL("../src/vendor/animation-contract.js", import.meta.url), "utf8");
  assert.equal(generated, "// Generated from shared/ui-animation/contract.js. Run node scripts/build-animation-contract.mjs; edit the shared source.\n" + source);
});
test("array accessors reject without running author code", () => {
  const data = contribution(); let getterCalls = 0;
  Object.defineProperty(data.definitions["content-transition"].variants.authored.ease, "0", { get() { getterCalls++; return .23; }, enumerable: true });
  assert.throws(() => captureAnimationContribution(data), TypeError); assert.equal(getterCalls, 0);
});
test("capture failure and nested foreign roots do not acquire targets or cross instance ownership", () => {
  const f = fixture(), a = { x: 0, y: 0, opacity: 1 }, b = { x: 0, y: 0, opacity: 1 };
  f.children.add(a); f.children.add(b);
  const original = f.driver.capture;
  f.driver.capture = node => { if (node === b) throw new Error("capture failed"); return original(node); };
  assert.throws(() => f.component.bind({ a: { node: a, intents: ["content-transition"] }, b: { node: b, intents: ["content-transition"] } }), /capture failed/);
  assert.equal(f.service.snapshot().targets, 1);
  f.driver.capture = original;
  const port = f.component.bind({ a: { node: a, intents: ["content-transition"] } }); port.dispose();
  const nested = f.mount("nested.author"); f.children.add(nested.node);
  assert.throws(() => f.component.bind({ nested: { node: nested.node, intents: ["content-transition"] } }), /denied/);
  f.service.dispose();
});
test("global concurrency rejects the extra operation before touching existing accepted work", () => {
  const f = fixture(), mounted = [f, f.mount("second.author"), f.mount("third.author"), f.mount("fourth.author")];
  for (const instance of mounted) {
    instance.port.dispose();
    const grants = Object.fromEntries(Array.from({ length: 32 }, (_, index) => {
      const node = { x: 0, y: 0, opacity: 1 }; instance.children.add(node);
      return [`target-${index}`, { node, intents: ["content-transition"] }];
    }));
    const port = instance.component.bind(grants);
    for (const target of Object.keys(grants)) port.play({ intent: "content-transition", target, to: { opacity: 0 } });
  }
  assert.equal(f.service.snapshot().active, 128);
  const extra = f.mount("fifth.author"); assert.throws(() => play(extra.port, { opacity: 0 }), /concurrency/);
  assert.equal(extra.node.opacity, 1); assert.equal(f.service.snapshot().active, 128);
  f.service.dispose(); assert.equal(f.timers.size, 0);
});
test("moving a claimed node into another cell denies stale writes and failure diagnostics", async () => {
  const f = fixture(), foreign = f.mount("foreign.author"), result = play(f.port, { opacity: 0 });
  f.children.delete(f.node); f.node.parentNode = foreign.root; foreign.children.add(f.node);
  f.node.opacity = .75;
  f.calls[0].write({ opacity: 0 }); f.calls[0].failed(new Error("revoked")); f.component.dispose();
  assert.equal((await result.finished).status, "cancelled"); assert.equal(f.node.opacity, .75); assert.equal(f.issues.length, 0);
  f.service.dispose();
});
