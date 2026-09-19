import assert from "node:assert/strict";
import test from "node:test";

import {
  DeferredDisposalCoordinator,
  type DisposableResource,
} from "../src/runtime/use-disposable-resource.ts";

function nextTask(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

test("deferred disposal survives a StrictMode-style release and retain replay", async () => {
  let disposeCalls = 0;
  const resource: DisposableResource = { dispose() { disposeCalls += 1; } };
  const coordinator = new DeferredDisposalCoordinator();

  coordinator.retain(resource);
  coordinator.release(resource);
  coordinator.retain(resource);
  await nextTask();

  assert.equal(disposeCalls, 0);

  coordinator.release(resource);
  await nextTask();
  assert.equal(disposeCalls, 1);
});

test("only the latest deferred release can dispose a resource", async () => {
  let disposeCalls = 0;
  const resource: DisposableResource = { dispose() { disposeCalls += 1; } };
  const coordinator = new DeferredDisposalCoordinator();

  coordinator.release(resource);
  coordinator.release(resource);
  await nextTask();

  assert.equal(disposeCalls, 1);
});
