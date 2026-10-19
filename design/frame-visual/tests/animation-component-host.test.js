import assert from "node:assert/strict";
import test from "node:test";
import { createComponentRegistry } from "../src/runtime/component-registry.js";
import { createComponentHost } from "../src/runtime/component-host.js";
import { createCommandRouter } from "../src/runtime/command-router.js";
import { createNotices } from "../src/runtime/notices.js";
import { createAnimationService } from "../src/runtime/animation-service.js";
import { withTestDocument } from "./support/dom-test-environment.js";

const animations = { contractVersion: 1, definitions: { "content-transition": { defaultVariant: "own", variants: {
  own: { type: "tween", duration: .12, fadeDuration: .12, exitDuration: .08, ease: [.23, 1, .32, 1] },
} } } };
function setup() {
  const registry = createComponentRegistry(), router = createCommandRouter(), notices = createNotices(), jobs = [];
  const driver = { read: node => ({ x: 0, y: 0, opacity: Number(node.style.opacity || 1) }), write: (node, to) => { node.style.opacity = String(to.opacity); },
    capture: node => ({ opacity: node.style.opacity }), restore: (node, original) => { node.style.opacity = original.opacity; } };
  const service = createAnimationService({ driver, provider: { start(args) { jobs.push(args); return { stop() {} }; } },
    onIssue: issue => notices.push({ source: issue.source, level: "error", text: issue.error.message }) });
  const host = createComponentHost({ registry, router, notices, animationService: service });
  return { registry, router, notices, service, host, jobs };
}
test("registered component gets a narrow motion port; hidden state, relocation and final release share its lifetime", () => withTestDocument(async () => {
  const f = setup(); let ctx, port, node, mounted = 0, visibleChanges = 0;
  const unregister = f.registry.register("trial.animated", { id: "trial.animated.panel", title: "Animated", role: "tool", slots: ["left", "right"],
    permissions: { animations: ["content-transition"] }, animations,
    mount(element, context) {
      mounted++; ctx = context; node = document.createElement("span"); element.append(node);
      port = ctx.motion.bind({ ink: { node, intents: ["content-transition"] } });
      return { setVisible() { visibleChanges++; } };
    } });
  const cell = f.host.ensure("trial.animated.panel", "left"); document.body.append(cell);
  assert.deepEqual(Object.keys(ctx.motion), ["bind"]); assert.equal(Object.isFrozen(ctx.motion), true);
  assert.throws(() => ctx.motion.bind({ root: { node: cell, intents: ["content-transition"] } }), /denied/);
  const first = port.play({ intent: "content-transition", target: "ink", to: { opacity: 0 } });
  f.host.setVisible("trial.animated.panel", false);
  assert.equal((await first.finished).status, "cancelled"); assert.equal(node.style.opacity, "0");
  assert.equal(f.host.ensure("trial.animated.panel", "right"), cell); assert.equal(mounted, 1);
  f.host.setVisible("trial.animated.panel", true); assert.equal(visibleChanges, 2);
  port.play({ intent: "content-transition", target: "ink", to: { opacity: 1 } });
  unregister(); assert.equal(f.service.snapshot().components, 0); assert.equal(cell.isConnected, false);
  f.jobs[1].failed(new Error("late")); assert.equal(f.notices.state().entries.length, 0);
  assert.throws(() => ctx.motion.bind({}), /Released/); f.host.dispose(); f.service.dispose();
}));
test("mount failure after targets and playback are acquired rolls back every animation resource", () => withTestDocument(() => {
  const f = setup();
  f.registry.register("trial.failure", { id: "trial.failure.panel", title: "Failure", role: "tool", slots: ["left"], animations,
    permissions: { animations: ["content-transition"] }, mount(element, ctx) {
      const node = document.createElement("span"); element.append(node);
      ctx.motion.bind({ ink: { node, intents: ["content-transition"] } }).play({ intent: "content-transition", target: "ink", to: { opacity: 0 } });
      throw new Error("mount failed");
    } });
  const cell = f.host.ensure("trial.failure.panel", "left");
  assert.ok(cell.querySelector(".component-fault")); assert.equal(f.service.snapshot().active, 0);
  assert.equal(f.service.snapshot().targets, 0); assert.equal(f.service.snapshot().components, 0);
  assert.match(f.notices.state().entries[0].text, /mount failed/);
  f.jobs[0].failed(new Error("late failure")); assert.equal(f.notices.state().entries.length, 1);
  f.host.dispose(); f.service.dispose();
}));
test("registry rejects illegal or unauthorized supplied animation before mount", () => {
  const f = setup(), base = { id: "trial.bad.panel", title: "Bad", role: "tool", slots: ["left"], mount() {} };
  assert.throws(() => f.registry.register("trial.bad", { ...base, animations }), /权限/);
  assert.throws(() => f.registry.register("trial.bad", { ...base, animations: { contractVersion: 2 } }), /version/);
  assert.deepEqual(f.registry.list(), []); f.host.dispose(); f.service.dispose();
});

test("local shortcuts reuse each cell's motion lifetime and preserve command permissions", () => withTestDocument(() => {
  const f = setup();
  try {
    for (const animated of [false, true]) {
      const owner = animated ? "trial.animated" : "trial.ordinary";
      const id = `${owner}.panel`, command = `${owner}.run`;
      const noticesBefore = f.notices.state().entries.length;
      let ctx, calls = 0, mounts = 0;
      f.router.register(owner, { id: command, run() { calls++; return { ok: true }; } });
      f.registry.register(owner, { id, title: owner, role: "tool", slots: ["left"],
        permissions: { commands: [command], ...(animated ? { animations: ["content-transition"] } : {}) },
        ...(animated ? { animations } : {}),
        mount(element, context) {
          mounts++; ctx = context;
          if (animated) {
            const node = document.createElement("span"); element.append(node);
            ctx.motion.bind({ ink: { node, intents: ["content-transition"] } });
          }
        } });
      const cell = f.host.ensure(id, "left"), binding = { owner, componentId: id, scope: "component", command };
      document.body.append(cell);
      assert.equal(Object.hasOwn(ctx, "motion"), animated);
      assert.equal(ctx.execute(command).ok, true);
      assert.equal(f.host.executeShortcut(binding, [cell]).ok, true);
      assert.equal(f.host.executeShortcut(binding, [cell]).ok, true);
      assert.equal(calls, 3); assert.equal(mounts, 1);
      assert.equal(f.service.snapshot().components, 1);
      assert.equal(f.service.snapshot().targets, animated ? 1 : 0);
      assert.equal(f.notices.state().entries.length, noticesBefore);
      assert.equal(f.host.executeShortcut({ ...binding, command: "trial.denied" }, [cell]).code, "permission.denied");
      assert.equal(calls, 3);
      f.host.release(id); f.host.release(id);
      assert.equal(f.service.snapshot().components, 0); assert.equal(f.service.snapshot().targets, 0);
      assert.equal(ctx.execute(command).code, "component.disposed");
    }
  } finally { f.host.dispose(); f.service.dispose(); }
}));
