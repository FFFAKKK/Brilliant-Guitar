import assert from "node:assert/strict";
import test from "node:test";
import { createMotionCoordinator } from "../src/fixtures/motion-pilot/coordinator.js";
import { API_VERSION } from "../src/fixtures/motion-pilot/definition-contract.js";
import { LAYOUT_MOTION_CONTRIBUTION, LAYOUT_PREVIEW_MOTION_CONTRIBUTION } from "../src/fixtures/motion-pilot/layout-motion-definitions.js";

function fixture(options = {}) {
  const calls = [], children = new Set();
  const root = { contains: node => children.has(node) }, node = { x: 0, y: 0, opacity: 1 };
  children.add(node);
  const adapter = { name: "fake", read: target => ({ ...target }), write: (target, state) => { Object.assign(target, state); },
    capture: target => ({ ...target }), restore: (target, original) => Object.assign(target, original),
    start(args) { const control = { stopped: 0, stop() { this.stopped++; } }; calls.push({ ...args, control }); return control; },
  };
  const coordinator = createMotionCoordinator({ adapter, ...options });
  const descriptor = { plugin: { id: "frame.layout", label: "布局", version: "0.1.0", hostApiVersion: API_VERSION }, root,
    targets: { local: { node, intents: ["content-transition", "drag-settle"] } }, animations: LAYOUT_MOTION_CONTRIBUTION.animations };
  const port = coordinator.bind(descriptor);
  return { root, node, children, coordinator, port, calls, descriptor, adapter };
}
const request = to => ({ intent: "content-transition", target: "local", to });

function selectionFixture(options = {}) {
  const data = fixture(options), node = { x: 0, y: 0, opacity: 1 };
  data.children.add(node);
  const port = data.coordinator.bind({ ...data.descriptor,
    targets: { selection: { node, intents: ["selection-transition"] } } });
  return { ...data, node, port };
}

function shapeFixture(options = {}) {
  const data = fixture(options), node = { x: 0, y: 0, width: 160, height: 100, opacity: 1 };
  data.children.add(node);
  const port = data.coordinator.bind({ ...data.descriptor,
    targets: { shape: { node, intents: ["shape-transition"] } }, animations: LAYOUT_PREVIEW_MOTION_CONTRIBUTION.animations });
  return { ...data, node, port };
}
const shapeRequest = to => ({ intent: "shape-transition", target: "shape", to });

test("rectangle permission validates a complete bounded local shape before interrupting", () => {
  const { node, port, calls, coordinator } = shapeFixture();
  const to = { x: 20, y: 10, width: 120, height: 80, opacity: .3 };
  port.play(shapeRequest(to));
  for (const invalid of [{ ...to, width: -1 }, { ...to, x: 500 }, { ...to, y: 500 }, { ...to, height: Infinity }, { ...to, clipPath: "none" }, { width: 20 }]) {
    assert.throws(() => port.play(shapeRequest(invalid)), TypeError);
    assert.equal(calls[0].control.stopped, 0);
  }
  assert.throws(() => port.play({ ...shapeRequest(to), velocity: { x: 0 } }), /velocity/);
  assert.equal(coordinator.snapshot().active, 1);
  assert.deepEqual(node, { x: 0, y: 0, width: 160, height: 100, opacity: 1 });
  calls[0].complete(); assert.deepEqual(node, to);
});

test("rectangle reversal retains current edges and opacity, ignoring old completion and failure", async () => {
  const issues = [], { node, port, calls } = shapeFixture({ onIssue: error => issues.push(error) });
  const first = port.play(shapeRequest({ x: 0, y: 12, width: 3, height: 88, opacity: .28 }));
  Object.assign(node, { y: 5, width: 89, height: 95, opacity: .62 });
  const next = port.play(shapeRequest({ x: 0, y: 0, width: 160, height: 100, opacity: 1 }));
  assert.equal((await first.finished).status, "interrupted");
  assert.deepEqual(calls[1].from, { x: 0, y: 5, width: 89, height: 95, opacity: .62 });
  calls[0].complete(); calls[0].failed(new Error("obsolete"));
  assert.equal(node.width, 89); assert.equal(issues.length, 0);
  calls[1].complete(); assert.equal((await next.finished).status, "completed");
  assert.equal(node.width, 160);
});

test("rectangle static, keyboard and reduced policies keep meaningful geometry and zero values", async () => {
  for (const options of [{ mode: "none" }, { reducedMotion: true }, { mode: "reduced" }, {}]) {
    const { node, port, calls } = shapeFixture(options);
    const to = { x: 40, y: 0, width: 0, height: 80, opacity: 0 };
    await port.play({ ...shapeRequest(to), immediate: Object.keys(options).length === 0 }).finished;
    assert.deepEqual(node, to); assert.equal(calls.length, 0);
  }
});

test("rectangle policy switch, failure and release settle the destination and restore capture", async () => {
  const { node, port, calls, coordinator } = shapeFixture();
  const to = { x: 20, y: 8, width: 100, height: 80, opacity: .28 };
  const first = port.play(shapeRequest(to));
  coordinator.setPolicy({ mode: "none" });
  assert.equal((await first.finished).status, "cancelled"); assert.deepEqual(node, to);
  coordinator.setPolicy({ mode: "full" });
  const next = port.play(shapeRequest({ ...to, width: 120 }));
  calls.at(-1).failed(new Error("current failure"));
  assert.equal((await next.finished).status, "engine-failed"); assert.equal(node.width, 120);
  port.dispose(); port.dispose();
  assert.deepEqual(node, { x: 0, y: 0, width: 160, height: 100, opacity: 1 });
});

test("rectangle author timing is separate from content opacity and cannot use spring", () => {
  const { port, calls, coordinator, descriptor, children } = shapeFixture({ mode: "slow" });
  port.play(shapeRequest({ x: 0, y: 0, width: 3, height: 100, opacity: .28 }));
  assert.equal(calls[0].settings.duration, .28); assert.equal(calls[0].settings.fadeDuration, .28);
  assert.equal(calls[0].settings.multiplier, 2.5);
  const node = {}; children.add(node);
  assert.throws(() => coordinator.bind({ ...descriptor,
    targets: { shape: { node, intents: ["shape-transition"] } },
    animations: { "shape-transition": { defaultVariant: "custom", variants: { custom: { type: "spring", stiffness: 260, damping: 32 } } } },
  }), /variant type/);
});

test("selection motion is local, bounded and cannot alter opacity or supply its own timing", () => {
  const { node, port, calls } = selectionFixture();
  const select = to => ({ intent: "selection-transition", target: "selection", to });
  for (const to of [{ x: 257 }, { x: Infinity }, { opacity: .5 }]) assert.throws(() => port.play(select(to)), TypeError);
  assert.throws(() => port.play({ ...select({ x: 54 }), duration: 4 }), /Unknown/);
  assert.deepEqual(node, { x: 0, y: 0, opacity: 1 });
  assert.equal(calls.length, 0);
  port.play(select({ x: 54 }));
  Object.assign(node, { x: 20 });
  port.play(select({ x: 0 }));
  assert.equal(calls[1].from.x, 20, "rapid reversal continues at the actual marker position");
  calls[0].complete(); assert.equal(node.x, 20, "late marker completion cannot overwrite reversal");
  calls[1].complete(); assert.equal(node.x, 0);
});

test("selection responds immediately for keyboard, off, reduced and quiet policies", async () => {
  for (const options of [{ mode: "none" }, { reducedMotion: true }, { profile: "quiet" }, {}]) {
    const { node, port, calls } = selectionFixture(options);
    const result = port.play({ intent: "selection-transition", target: "selection", to: { x: 54 }, ...(Object.keys(options).length ? {} : { immediate: true }) });
    assert.equal(node.x, 54); assert.equal(calls.length, 0);
    assert.equal((await result.finished).status, "completed");
  }
});

test("layout defines visibility separately from travel and reduced mode removes their mismatch", () => {
  const { port, calls, coordinator } = fixture();
  port.play({ ...request({ x: 0, opacity: 1 }), from: { x: 16, opacity: 0 } });
  assert.ok(calls[0].settings.fadeDuration < calls[0].settings.duration);
  coordinator.setPolicy({ mode: "slow" });
  port.play(request({ opacity: 0 }));
  assert.equal(calls[1].settings.multiplier, 2.5);
  coordinator.setPolicy({ reducedMotion: true });
  port.play({ ...request({ opacity: 1 }), from: { x: 16, opacity: 0 } });
  assert.equal(calls[2].settings.fadeDuration, calls[2].settings.duration);
  assert.equal(calls[2].from.x, calls[2].to.x);
});

test("reduced content removes outgoing offsets as well as incoming movement", () => {
  const { port, node, calls } = fixture({ reducedMotion: true });
  Object.assign(node, { x: 7, y: 3, opacity: 1 });
  port.play(request({ x: -16, y: -12, opacity: 0 }));
  assert.deepEqual(calls[0].from, { x: 0, y: 0, opacity: 1 });
  assert.deepEqual(calls[0].to, { x: 0, y: 0, opacity: 0 });
  assert.deepEqual(node, { x: 0, y: 0, opacity: 1 });
  calls[0].complete(); assert.deepEqual(node, { x: 0, y: 0, opacity: 0 });
});

test("outgoing content clears before incoming content settles without changing its travel", () => {
  for (const [profile, enter, exit] of [["continuous", .16, .08], ["focused", .2, .1], ["quiet", .14, .07]]) {
    const { port, calls, coordinator } = fixture({ profile });
    port.play({ ...request({ x: 0, opacity: 1 }), from: { x: 16, opacity: 0 } });
    port.play({ ...request({ x: -16, opacity: 0 }), from: { x: 0, opacity: 1 } });
    assert.equal(calls[0].settings.fadeDuration, enter);
    assert.equal(calls[1].settings.fadeDuration, exit);
    assert.equal(calls[0].settings.duration, calls[1].settings.duration);
    coordinator.setPolicy({ reducedMotion: true });
    port.play({ ...request({ opacity: 0 }), from: { opacity: 1 } });
    assert.equal(calls.at(-1).settings.fadeDuration, .1);
  }
});

test("content state targets remain local and disallow paper, foreign intent and unbound nodes", () => {
  const { coordinator, descriptor, port, children, node, calls } = fixture();
  assert.throws(() => port.play({ ...request({ opacity: 0 }), target: "paper" }), /denied/);
  assert.throws(() => port.play({ ...request({ opacity: 0 }), intent: "host-resize" }), /denied/);
  assert.throws(() => coordinator.bind({ ...descriptor, targets: { paper: { node: {}, intents: ["content-transition"] } } }), /local/);
  assert.throws(() => coordinator.bind(descriptor), /local/);
  children.delete(node);
  assert.throws(() => port.play(request({ opacity: 0 })), /denied/);
  assert.equal(calls.length, 0);
});

test("minimum metadata is required, optional null animations are empty, malformed entries fail", () => {
  const { coordinator, descriptor } = fixture();
  for (const field of ["id", "label", "version", "hostApiVersion"]) assert.throws(() => coordinator.bind({ ...descriptor, plugin: { ...descriptor.plugin, [field]: null } }), /metadata/);
  assert.throws(() => coordinator.bind({ ...descriptor, plugin: { ...descriptor.plugin, hostApiVersion: "wrong" } }), /Incompatible/);
  assert.throws(() => coordinator.bind({ ...descriptor, animations: [null] }), /definitions/);
  assert.throws(() => coordinator.bind({ ...descriptor, animations: ["drag-settle", "drag-settle"] }), /definitions/);
  const empty = coordinator.bind({ ...descriptor, targets: {}, animations: null });
  assert.throws(() => empty.play(request({ opacity: 0 })), /denied/);
  empty.dispose();
});

for (const mode of ["full", "none", "reduced"]) test(`invalid properties, values, timings and owner fields are rejected before DOM mutation in ${mode}`, () => {
  const { node, port, calls } = fixture({ mode });
  for (const to of [{ width: 100 }, { x: Infinity }, { x: NaN }, { y: 999 }, { opacity: -1 }, { opacity: 2 }, {}]) assert.throws(() => port.play(request(to)), TypeError);
  assert.throws(() => port.play({ ...request({ opacity: 0 }), duration: 999 }), /Unknown/);
  assert.throws(() => port.play({ ...request({ opacity: 0 }), pluginId: "other" }), /Unknown/);
  assert.throws(() => port.play({ ...request({ opacity: 0 }), velocity: { y: 2000 } }), /velocity/);
  assert.deepEqual(node, { x: 0, y: 0, opacity: 1 });
  assert.equal(calls.length, 0);
});

test("off mode still applies legitimate zero values synchronously", async () => {
  const { node, port, calls } = fixture({ mode: "none" });
  const result = port.play(request({ opacity: 0, x: 0 }));
  assert.equal(node.opacity, 0); assert.equal(calls.length, 0);
  assert.equal((await result.finished).status, "completed");
});

test("retarget reads the actual position, cancels old work and ignores its late completion", async () => {
  const { node, port, calls, coordinator } = fixture();
  const old = port.play(request({ x: 16, opacity: 0 }));
  Object.assign(node, { x: 7, opacity: .5 });
  const current = port.play(request({ x: 0, opacity: 1 }));
  assert.deepEqual(calls[1].from, { x: 7, y: 0, opacity: .5 });
  assert.equal((await old.finished).status, "interrupted");
  calls[0].complete(); assert.equal(node.x, 7);
  calls[1].complete(); assert.equal((await current.finished).status, "completed");
  assert.equal(node.x, 0); assert.equal(coordinator.snapshot().active, 0);
});

test("switching off midway settles accepted destination and drains active work", async () => {
  const { node, port, coordinator, calls } = fixture();
  const pending = port.play(request({ opacity: 0 }));
  coordinator.setPolicy({ mode: "none" });
  assert.equal(node.opacity, 0); assert.equal((await pending.finished).status, "cancelled");
  assert.equal(calls[0].control.stopped, 1); assert.equal(coordinator.snapshot().active, 0);
  assert.throws(() => coordinator.setPolicy({ mode: "wrong" }), TypeError);
});

test("system reduced motion wins over full playback and strips automatic travel", async () => {
  const { port, node, calls, coordinator } = fixture({ mode: "full", reducedMotion: true });
  port.play({ ...request({ x: 0, opacity: 1 }), from: { x: 16, opacity: 0 } });
  assert.equal(calls[0].from.x, 0); assert.equal(calls[0].settings.duration, .1);
  coordinator.setPolicy({ mode: "slow" }); assert.equal(coordinator.snapshot().mode, "reduced");
  const settle = port.play({ intent: "drag-settle", target: "local", to: { y: 35 } });
  assert.equal(node.y, 35); assert.equal(calls.length, 1); await settle.finished;
});

test("drag keeps measured release velocity and layout-authored spring settings", () => {
  const { port, calls } = fixture();
  port.play({ intent: "drag-settle", target: "local", from: { y: -40 }, to: { y: 0 }, velocity: { y: 730 } });
  assert.deepEqual(calls[0].velocity, { x: 0, y: 730 });
  assert.equal(calls[0].settings.stiffness, 260);
  assert.throws(() => port.play({ intent: "drag-settle", target: "local", to: { opacity: .2 } }), /opacity/);
});

const contentDefinition = (duration = .21) => ({ defaultVariant: "custom", variants: {
  custom: { type: "tween", duration, fadeDuration: .13, exitDuration: .05, ease: [.2, .8, .3, 1] },
} });

test("two authors supply their own curves and durations without coordinator name special cases", () => {
  const { coordinator, descriptor, children, calls } = fixture();
  const nodes = [.18, .29].map(duration => {
    const node = { x: 0, y: 0, opacity: 1 }; children.add(node);
    const definition = contentDefinition(duration);
    if (duration === .29) definition.variants.custom.ease = [.1, 1, .4, 1];
    const port = coordinator.bind({ ...descriptor, plugin: { ...descriptor.plugin, id: `fixture.author-${duration}` },
      targets: { local: { node, intents: ["content-transition"] } }, animations: { "content-transition": definition } });
    port.play({ ...request({ opacity: 1 }), from: { opacity: 0 } }); return node;
  });
  assert.deepEqual(calls.map(call => call.settings.duration), [.18, .29]);
  assert.deepEqual(calls.map(call => call.settings.ease), [[.2, .8, .3, 1], [.1, 1, .4, 1]]);
  coordinator.setPolicy({ profile: "undeclared-style" });
  assert.equal(nodes[0].opacity, 1);
  coordinator.dispose();
});

test("declared variants and the author's default govern playback; unknown policy styles cannot invent artwork", () => {
  const { coordinator, descriptor, children, calls } = fixture();
  const node = { x: 0, y: 0, opacity: 1 }; children.add(node);
  const definition = contentDefinition();
  definition.variants.alternate = { ...definition.variants.custom, duration: .28 };
  const port = coordinator.bind({ ...descriptor, targets: { local: { node, intents: ["content-transition"] } }, animations: { "content-transition": definition } });
  for (const [profile, duration] of [["alternate", .28], ["quiet", .21], ["custom", .21]]) {
    coordinator.setPolicy({ profile }); port.play(request({ opacity: 0 }));
    assert.equal(calls.at(-1).settings.duration, duration);
  }
  assert.throws(() => coordinator.setPolicy({ profile: "Bad Style" }), /policy/);
});

test("missing optional definitions use granted static targets while forbidden targets and fields still fail", async () => {
  for (const animations of [undefined, null, {}, { "content-transition": contentDefinition() }]) {
    const { coordinator, descriptor, children, calls } = fixture();
    const node = { x: 0, y: 0, opacity: 1 }; children.add(node);
    const port = coordinator.bind({ ...descriptor, targets: { local: { node, intents: ["drag-settle"] } }, animations });
    const result = port.play({ intent: "drag-settle", target: "local", to: { y: 35 } });
    assert.equal(node.y, 35); assert.equal(calls.length, 0);
    assert.equal((await result.finished).status, "completed");
    assert.throws(() => port.play({ intent: "drag-settle", target: "foreign", to: { y: 0 } }), /denied/);
    assert.throws(() => port.play({ intent: "drag-settle", target: "local", to: { width: 1 } }), TypeError);
  }
});

test("invalid provided definitions fail before captures or ownership, including sparse curves and unsafe budgets", () => {
  const { coordinator, descriptor, children, adapter } = fixture();
  const node = { x: 0, y: 0, opacity: 1 }; children.add(node);
  const base = { ...descriptor, targets: { local: { node, intents: ["content-transition"] } }, animations: { "content-transition": contentDefinition() } };
  let captures = 0;
  adapter.capture = target => { captures++; return { ...target }; };
  const bad = [
    animations => { animations["unknown-action"] = contentDefinition(); },
    animations => { animations["content-transition"] = null; },
    animations => { animations["content-transition"].defaultVariant = "absent"; },
    animations => { animations["content-transition"].variants = {}; },
    animations => { animations["content-transition"].variants = Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`v${i}`, { type: "instant" }])); animations["content-transition"].defaultVariant = "v0"; },
    animations => { animations["content-transition"].variants.custom.duration = 4; },
    animations => { animations["content-transition"].variants.custom.fadeDuration = null; },
    animations => { animations["content-transition"].variants.custom.ease = Array(4); },
    animations => { animations["content-transition"].variants.custom.ease = [0, Infinity, 1, 1]; },
    animations => { animations["content-transition"].variants.custom.css = "width:999px"; },
    animations => { animations["content-transition"].variants.custom = { type: "spring", stiffness: 260, damping: 32 }; },
    animations => { animations["drag-settle"] = { defaultVariant: "custom", variants: { custom: { type: "spring", stiffness: 801, damping: 32 } } }; },
    animations => { animations["drag-settle"] = { defaultVariant: "custom", variants: { custom: { type: "spring", stiffness: 260, damping: 0 } } }; },
    animations => { animations["content-transition"].variants.custom = { type: "instant", duration: .2 }; },
  ];
  for (const alter of bad) {
    const animations = structuredClone(base.animations); alter(animations);
    assert.throws(() => coordinator.bind({ ...base, animations }), TypeError);
  }
  assert.equal(captures, 0); assert.equal(coordinator.snapshot().active, 0);
  const port = coordinator.bind(base); assert.equal(captures, 1);
  port.dispose();
  coordinator.bind(base).dispose();
});

test("binding snapshots nested author definitions against later mutation", () => {
  const { coordinator, descriptor, children, calls } = fixture();
  const node = { x: 0, y: 0, opacity: 1 }; children.add(node);
  const animations = { "content-transition": contentDefinition() };
  const port = coordinator.bind({ ...descriptor, targets: { local: { node, intents: ["content-transition"] } }, animations });
  animations["content-transition"].variants.custom.duration = .3;
  animations["content-transition"].variants.custom.ease[0] = 1;
  animations["content-transition"].defaultVariant = "new";
  animations["content-transition"] = null;
  port.play(request({ opacity: 0 }));
  assert.equal(calls[0].settings.duration, .21);
  assert.deepEqual(calls[0].settings.ease, [.2, .8, .3, 1]);
  assert.ok(Object.isFrozen(calls[0].settings.ease));
});

test("system reduction also strips decorative travel from missing or authored instant fallbacks", () => {
  for (const animations of [null, { "content-transition": { defaultVariant: "custom", variants: { custom: { type: "instant" } } } }]) {
    const { coordinator, descriptor, children, calls } = fixture({ reducedMotion: true });
    const node = { x: 7, y: 3, opacity: 1 }; children.add(node);
    const port = coordinator.bind({ ...descriptor, targets: { local: { node, intents: ["content-transition"] } }, animations });
    port.play(request({ x: -16, y: -12, opacity: 0 }));
    assert.deepEqual(node, { x: 0, y: 0, opacity: 0 }); assert.equal(calls.length, 0);
  }
});

test("author can choose tween or instant movement instead of the default drag spring", () => {
  const { coordinator, descriptor, children, calls } = fixture();
  const node = { x: 0, y: 0, opacity: 1 }; children.add(node);
  const port = coordinator.bind({ ...descriptor, targets: { local: { node, intents: ["drag-settle"] } }, animations: {
    "drag-settle": { defaultVariant: "custom", variants: { custom: { type: "tween", duration: .17, ease: [.2, .8, .3, 1] }, quiet: { type: "instant" } } },
  } });
  port.play({ intent: "drag-settle", target: "local", to: { y: 30 } });
  assert.equal(calls[0].settings.type, "tween"); assert.equal(calls[0].settings.duration, .17);
  coordinator.setPolicy({ profile: "quiet" });
  port.play({ intent: "drag-settle", target: "local", to: { y: 0 } });
  assert.equal(calls.length, 1); assert.equal(node.y, 0);
});

test("a replacement adapter receives author definitions, with host reduction and slowdown applied separately", () => {
  const { coordinator, descriptor, children, calls } = fixture();
  const node = { x: 0, y: 0, opacity: 1 }; children.add(node);
  const port = coordinator.bind({ ...descriptor, targets: { local: { node, intents: ["content-transition"] } }, animations: { "content-transition": contentDefinition() } });
  coordinator.setPolicy({ mode: "slow" });
  port.play({ ...request({ x: 0, opacity: 1 }), from: { x: 16, opacity: 0 } });
  assert.equal(calls[0].settings.duration, .21); assert.equal(calls[0].settings.multiplier, 2.5);
  coordinator.setPolicy({ reducedMotion: true });
  port.play({ ...request({ x: -16, opacity: 0 }), from: { x: 12, opacity: 1 } });
  assert.equal(calls[1].settings.duration, .1); assert.equal(calls[1].settings.multiplier, 1);
  assert.equal(calls[1].from.x, 0); assert.equal(calls[1].to.x, 0);
  coordinator.setPolicy({ mode: "none" }); port.play(request({ opacity: 1 }));
  assert.equal(calls.length, 2); assert.equal(node.opacity, 1);
});

test("synchronous adapter completion stops returned work and resolves exactly once", async () => {
  const { port, adapter, coordinator, node } = fixture();
  let stops = 0;
  adapter.start = ({ complete }) => { complete(); return { stop() { stops++; } }; };
  const result = port.play(request({ opacity: 0 }));
  assert.equal((await result.finished).status, "completed");
  assert.equal(stops, 1); assert.equal(node.opacity, 0); assert.equal(coordinator.snapshot().active, 0);
});

test("holding a moving target freezes its current presentation without finishing its business target", async () => {
  const { port, node, calls } = fixture();
  const pending = port.play({ intent: "drag-settle", target: "local", to: { y: 0 } });
  node.y = 12;
  const held = port.hold({ intent: "drag-settle", target: "local" });
  assert.equal(held.y, 12); assert.equal(node.y, 12);
  calls[0].complete(); assert.equal(node.y, 12);
  assert.equal((await pending.finished).status, "interrupted");
});

test("engine failure preserves the accepted static target and diagnostic failure is isolated", async () => {
  const data = fixture({ onIssue() { throw new Error("logging failed"); } });
  data.adapter.start = () => { throw new Error("engine failed"); };
  const result = data.port.play(request({ opacity: 0 }));
  assert.equal((await result.finished).status, "engine-failed");
  assert.equal(data.node.opacity, 0); assert.equal(data.coordinator.snapshot().active, 0);
});

test("async engine failure also resolves and cannot overwrite a retarget", async () => {
  const { port, calls, node } = fixture();
  const old = port.play(request({ opacity: 0 }));
  const next = port.play(request({ opacity: 1 }));
  calls[0].failed(new Error("late")); assert.equal(node.opacity, 1);
  calls[1].failed(new Error("failed"));
  assert.equal((await old.finished).status, "interrupted"); assert.equal((await next.finished).status, "engine-failed");
});

test("late failure after replacement or release cannot publish a stale UI diagnostic", () => {
  const issues = [], { port, calls } = fixture({ onIssue: error => issues.push(error.message) });
  port.play(request({ opacity: 0 }));
  port.play(request({ opacity: 1 }));
  calls[0].failed(new Error("superseded"));
  assert.deepEqual(issues, []);
  calls[1].failed(new Error("current"));
  assert.deepEqual(issues, ["current"]);
  port.play(request({ opacity: 0 })); port.dispose();
  calls[2].failed(new Error("released"));
  assert.deepEqual(issues, ["current"]);
});

test("scope release and coordinator release restore owned presentation exactly once", async () => {
  for (const release of ["port", "coordinator"]) {
    const { port, coordinator, node, calls } = fixture();
    const pending = port.play(request({ x: 10, opacity: 0 }));
    ({ port, coordinator })[release].dispose(); ({ port, coordinator })[release].dispose();
    calls[0].complete(); assert.deepEqual(node, { x: 0, y: 0, opacity: 1 });
    assert.equal((await pending.finished).status, "cancelled");
    assert.throws(() => port.play(request({ opacity: 0 })), /Released/);
    assert.equal(calls[0].control.stopped, 1);
  }
});

test("two scopes can use the same local target name and stopping one leaves the other running", async () => {
  const { coordinator, descriptor, children, port, calls } = fixture();
  const node = { x: 0, y: 0, opacity: 1 }; children.add(node);
  const other = coordinator.bind({ ...descriptor, targets: { local: { node, intents: ["content-transition"] } } });
  const first = port.play(request({ opacity: 0 })), second = other.play(request({ opacity: 0 }));
  port.dispose(); assert.equal(coordinator.snapshot().active, 1);
  calls[1].complete(); assert.equal(node.opacity, 0);
  assert.equal((await first.finished).status, "cancelled"); assert.equal((await second.finished).status, "completed");
});
