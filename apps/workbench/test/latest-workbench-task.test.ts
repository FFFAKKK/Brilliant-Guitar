import assert from "node:assert/strict";
import test from "node:test";
import { LatestWorkbenchTask } from "../src/workbench/latest-task.ts";

test("newer render work cancels stale work while finish and cancel remain idempotent", () => {
  const tasks = new LatestWorkbenchTask();
  const first = tasks.start();
  const second = tasks.start();
  assert.equal(first.aborted, true);
  assert.equal(second.aborted, false);
  tasks.finish(first);
  assert.equal(second.aborted, false);
  tasks.cancel();
  assert.equal(second.aborted, true);
  tasks.cancel();
});
