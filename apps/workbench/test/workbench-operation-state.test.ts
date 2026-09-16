import assert from "node:assert/strict";
import test from "node:test";
import { reduceWorkbenchOperations } from "../src/workbench/operation-state.ts";
import type { WorkbenchOperation } from "../src/workbench/operation-state.ts";

const running = (token: string, id = "score.edit", owner = "score"): WorkbenchOperation =>
  ({ token, id, owner, status: "running", startedAt: 1 });

test("operation state replaces duplicate owners and preserves unrelated asynchronous work", () => {
  let state: readonly WorkbenchOperation[] = [];
  state = reduceWorkbenchOperations(state, { type: "begin", operation: running("edit:1") });
  state = reduceWorkbenchOperations(state, { type: "begin", operation: running("save:1", "file.save", "document") });
  state = reduceWorkbenchOperations(state, { type: "begin", operation: running("edit:2") });
  assert.deepEqual(state.map((item) => item.token), ["save:1", "edit:2"]);
});

test("failed, blocked, recovering and finished operations use one deterministic lifecycle", () => {
  const issue = { code: "bridge.offline", message: "暂时不可用", severity: "error" as const,
    source: "bridge" as const, target: { scope: "workbench" as const }, retryable: true };
  let state = reduceWorkbenchOperations([], { type: "begin", operation: running("edit:1") });
  state = reduceWorkbenchOperations(state, { type: "fail", token: "edit:1", issue, blocked: true });
  assert.equal(state[0]?.status, "blocked");
  state = reduceWorkbenchOperations(state, { type: "recover", token: "edit:1" });
  assert.equal(state[0]?.status, "recovering");
  assert.equal(state[0]?.issue, undefined);
  state = reduceWorkbenchOperations(state, { type: "finish", token: "edit:1" });
  assert.deepEqual(state, []);
});
