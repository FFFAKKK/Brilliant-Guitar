import assert from "node:assert/strict";
import test from "node:test";
import { ScoreEditController } from "../src/application/edit/score-edit-controller.ts";

test("score edit controller serializes queued operations", async () => {
  const controller = new ScoreEditController<number>();
  const order: number[] = [];
  controller.enqueue(1); controller.enqueue(2); controller.enqueue(3);
  await controller.drain(async (item) => {
    order.push(item);
    await Promise.resolve();
    return "committed";
  });
  assert.deepEqual(order, [1, 2, 3]);
  assert.deepEqual(controller.state, { pending: 0, running: false, blocked: false });
});

test("retryable failure retains the current operation and recover resumes it", async () => {
  const states: number[] = [];
  const controller = new ScoreEditController<string>((state) => states.push(state.pending));
  controller.enqueue("first"); controller.enqueue("second");
  await controller.drain(async () => "retryable");
  assert.equal(controller.blocked, true);
  assert.equal(controller.current(), "first");
  assert.equal(controller.pending, 2);
  assert.equal(controller.recover(), true);
  await controller.drain(async () => "committed");
  assert.equal(controller.pending, 0);
  assert.ok(states.includes(2));
});

test("definite rejection can discard the complete dependent queue", async () => {
  const controller = new ScoreEditController<number>();
  controller.enqueue(1); controller.enqueue(2);
  await controller.drain(async () => "discard-all");
  assert.equal(controller.pending, 0);
  assert.equal(controller.blocked, false);
});

test("a reset during an in-flight edit cannot consume the replacement queue", async () => {
  const controller = new ScoreEditController<string>();
  let releaseFirst: (() => void) | undefined;
  const firstSettled = new Promise<void>((resolve) => { releaseFirst = resolve; });
  const executed: string[] = [];
  controller.enqueue("old-document");
  const draining = controller.drain(async (item) => {
    executed.push(item);
    if (item === "old-document") await firstSettled;
    return "committed";
  });
  await Promise.resolve();
  assert.deepEqual(controller.reset(), ["old-document"]);
  controller.enqueue("new-document");
  releaseFirst?.();
  await draining;
  assert.deepEqual(executed, ["old-document", "new-document"]);
  assert.equal(controller.pending, 0);
});
