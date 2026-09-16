import assert from "node:assert/strict";
import test from "node:test";
import { adaptWorkbenchIssue, localWorkbenchIssue } from "../src/feedback/workbench-feedback.ts";

test("visual feedback keeps the diagnostic target instead of following a later caret", () => {
  const issue = { code: "editor.measure-capacity-exceeded", message: "容量不足", severity: "error" as const,
    source: "editor" as const, target: { scope: "measure" as const, measureId: "measure-1" } };
  const feedback = adaptWorkbenchIssue(issue, { measureId: "measure-2" }, 7);
  assert.equal(feedback.target.scope, "measure");
  assert.equal(feedback.target.scope === "measure" && feedback.target.measureId, "measure-1");
  assert.equal(feedback.effect, "measure-pulse");
  assert.equal(feedback.sequence, 7);
});

test("legacy or bridge failures use the command context as a safe visual fallback", () => {
  const issue = localWorkbenchIssue("操作未确认", { measureId: "measure-3" },
    { code: "bridge.operation-unconfirmed", retryable: true, source: "bridge" });
  const feedback = adaptWorkbenchIssue(issue, { measureId: "measure-3" }, 8);
  assert.equal(feedback.target.scope === "measure" && feedback.target.measureId, "measure-3");
  assert.equal(feedback.issue.retryable, true);
});
