import assert from "node:assert/strict";
import test from "node:test";
import { ContextBuilder } from "../src/runtime/context-builder.ts";
import type { AgentContextItem, ContextBuildInput } from "../src/runtime/agent-contracts.ts";
import { createAgentSession } from "../src/session/agent-session.ts";
import { STANDALONE_CONTEXT_POLICY, isContextSelectionReportV1, type ContextSelectionPlan } from "../src/contracts/context-selection.ts";

const input = (items: readonly AgentContextItem[]): ContextBuildInput => ({ runId: "run", goal: "继续", turnInput: null,
  runState: { lifecycle: "active", phase: "planning" }, workspace: { workspaceId: "session", documentId: null, documentVersion: null, selection: null },
  items, now: 10, budget: { tokenBudget: 8192, itemCountBudget: 64, toolResultSizeBudget: 16384, rangeBudget: 0, historyTurnBudget: 16 } });
function history(index: number): AgentContextItem {
  return { contextItemId: `conversation:${index}`, kind: "task-history", content: { user: `要求${index}`, assistant: `回复${index}` },
    sourceType: "conversation", sourceId: String(index), documentId: null, documentVersion: null, scope: "session",
    trustLevel: "user-provided", priority: "high", createdAt: 1, expiresAt: null, estimatedTokens: 100 };
}
const page = (id: string): AgentContextItem => ({ ...history(1), contextItemId: `capability-result:${id}`, kind: "capability-result",
  content: { page: id }, sourceType: "capability-result", sourceId: "demo.read", scope: "none", trustLevel: "authoritative" });

test("distinct invocation results survive common selection even without the standalone policy", () => {
  const result = new ContextBuilder().build(input([page("one"), page("two")]));
  assert.deepEqual(result.contextItems.filter((item) => item.kind === "capability-result").map((item) => item.contextItemId),
    ["capability-result:one", "capability-result:two"]);
});

test("report lifecycle rejects wrong turns, probes, downgrades and late reports while preserving validated snapshots", async (t) => {
  let release!: () => void;
  let ready!: () => void;
  const waiting = new Promise<void>((resolve) => { ready = resolve; });
  const session = createAgentSession({ contextSelectionPolicy: STANDALONE_CONTEXT_POLICY,
    provider: { decide: async () => { ready(); await new Promise<void>((resolve) => { release = resolve; }); return { kind: "finish", reason: "completed", text: "answer" }; } } });
  t.after(() => { release?.(); return session.dispose(); }); await session.setEnabled(true);
  const pending = session.submit("任务"); await waiting;
  const report = session.getContextSelection(); assert.ok(report);
  const final = { ...report, stage: "model-input" as const, estimator: "utf8-json-bytes-div3-v1" as const };
  assert.equal(session.reportContextSelection({ ...report, runId: "probe" }), false);
  assert.equal(session.reportContextSelection({ ...report, turnId: "late-turn" }), false);
  assert.equal(session.reportContextSelection({ ...report, schemaVersion: 2 } as unknown as typeof report), false);
  assert.equal(isContextSelectionReportV1({ ...report, budget: { ...report.budget, itemCount: 0 } }), false);
  assert.equal(session.reportContextSelection(final), true);
  assert.equal(session.reportContextSelection(report), false);
  assert.equal(session.reportContextSelection({ ...final, turnId: "late-turn" }), false);
  assert.equal(session.getContextSelection()?.stage, "model-input");
  await session.cancel(); assert.equal(session.getContextSelection(), null);
  assert.equal(session.reportContextSelection(final), false);
  release(); await pending; await session.reset();
  assert.equal(session.reportContextSelection(final), false);
});

test("synchronous reset during report publication prevents a stale observer and any provider call", async (t) => {
  let requests = 0, observations = 0; let reset: Promise<void> | undefined;
  const session = createAgentSession({ contextSelectionPolicy: STANDALONE_CONTEXT_POLICY,
    onContextSelection: () => { ++observations; }, provider: { decide: async () => { ++requests; return { kind: "finish", reason: "completed", text: "wrong" }; } } });
  t.after(() => session.dispose()); await session.setEnabled(true);
  session.subscribe(() => { if (!reset && session.getContextSelection()) reset = session.reset(); });
  await session.submit("任务"); await reset;
  assert.equal(requests, 0); assert.equal(observations, 0); assert.equal(session.getContextSelection(), null);
  assert.equal(session.getSnapshot().messages.length, 0);
});

test("protected policy keeps the latest complete turns, in original order, and cannot silently discard required invalid input", async (t) => {
  const received: AgentContextItem[][] = [];
  const session = createAgentSession({ contextSelectionPolicy: "standalone-context-v1", retainTranscript: true,
    budget: { tokenBudget: 500, historyTurnBudget: 16 }, provider: { decide: async (request) => {
      received.push([...request.context.contextItems]);
      return { kind: "finish", reason: "completed", text: "答复".repeat(120) };
    } } });
  t.after(() => session.dispose()); await session.setEnabled(true);
  for (const goal of ["20分钟", "更正为12分钟", "继续"]) await session.submit(goal);
  assert.equal(received.length, 3);
  assert.deepEqual(received[2]!.filter((item) => item.sourceType === "conversation").map((item) => (item.content as { user: string }).user),
    ["20分钟", "更正为12分钟"]);
  let requests = 0;
  const invalid = createAgentSession({ contextSelectionPolicy: "standalone-context-v1", contextItems: () => [{ ...history(7), priority: "required", estimatedTokens: NaN }],
    provider: { decide: async () => { ++requests; return { kind: "finish", reason: "completed", text: "wrong" }; } } });
  t.after(() => invalid.dispose()); await invalid.setEnabled(true); await invalid.submit("读取");
  assert.equal(requests, 0); assert.equal(invalid.getSnapshot().status, "failed");
});

function select(value: ContextBuildInput, executedResultIds: readonly string[] = []) {
  let plan: ContextSelectionPlan | undefined;
  const context = new ContextBuilder().build(value, { policy: STANDALONE_CONTEXT_POLICY, turnId: "turn",
    executedResultIds: new Set(executedResultIds), onSelection: (result) => { plan = result; } });
  assert.ok(plan); assert.ok(isContextSelectionReportV1(plan.report));
  return { context, plan };
}

test("selection protects recent pairs and actual invocations, chooses newer optional history, and reports whole-unit budget omissions", () => {
  const base = input([history(1), history(2), history(3), history(4), history(5), page("one"), page("two")]);
  const value = { ...base, budget: { ...base.budget, tokenBudget: 740 } };
  const { context, plan } = select(value, ["capability-result:one", "capability-result:two"]);
  assert.deepEqual(context.contextItems.filter((item) => item.sourceType === "conversation").map((item) => item.sourceId), ["2", "3", "4", "5"]);
  assert.deepEqual(plan.report.selected.filter((item) => item.reason === "recent-conversation").map((item) => item.contextItemId), ["conversation:4", "conversation:5"]);
  assert.equal(plan.report.selected.filter((item) => item.reason === "executed-result").length, 2);
  assert.deepEqual(plan.report.omitted, [{ contextItemId: "conversation:1", reason: "token-budget" }]);
  assert.ok(Object.isFrozen(plan)); assert.ok(Object.isFrozen(plan.report.selected[0]));
  assert.throws(() => Object.assign(plan.report.budget, { tokenBudget: 1 }), TypeError);
});

test("required expiration, scope, invalid estimates and conflicting IDs fail; foreign optional data and object versions are handled explicitly", () => {
  const base = history(1);
  for (const item of [{ ...base, expiresAt: 10 }, { ...base, scope: "other-session" }, { ...base, estimatedTokens: -1 },
    { ...base, content: { user: "bad" } }]) {
    assert.equal(select(input([{ ...item, priority: "required" }])).plan.report.status, "invalid-context");
  }
  assert.equal(select(input([base, { ...base, content: { user: "changed", assistant: "reply" } }])).plan.report.status, "invalid-context");
  const foreign = { ...history(2), scope: "other-session" };
  const report = select(input([foreign])).plan.report;
  assert.deepEqual(report.omitted, [{ contextItemId: "conversation:2", reason: "out-of-scope" }]);
  assert.equal(report.status, "ready");
  const duplicate = page("one");
  const duplicated = select(input([duplicate, { ...duplicate }]), [duplicate.contextItemId]);
  assert.equal(duplicated.plan.report.status, "ready");
  assert.equal(duplicated.context.contextItems.filter((item) => item.contextItemId === duplicate.contextItemId).length, 1);
  assert.deepEqual(duplicated.plan.report.omitted, [{ contextItemId: duplicate.contextItemId, reason: "duplicate" }]);
  const versionBase = input([1, 2].map((v) => ({ ...page(String(v)), documentId: "another-doc", documentVersion: v })));
  const versioned = { ...versionBase, workspace: { ...versionBase.workspace, documentId: "current-doc", documentVersion: 7 } };
  const versions = select(versioned).context.versionWarnings;
  assert.deepEqual(versions, [{ code: "version-mixed", documentId: "another-doc", versions: [1, 2], currentVersion: null }]);
  const stale = { ...page("stale"), documentId: "current-doc", documentVersion: 6 };
  const staleInput = { ...versioned, items: [stale] };
  assert.equal(select(staleInput).context.contextItems.some((item) => item.contextItemId === stale.contextItemId), false);
  assert.ok(select(staleInput, [stale.contextItemId]).context.versionWarnings.some((item) => item.code === "version-mismatch"));
});

test("underestimated content and required count overflow cannot bypass shared budget checks", async (t) => {
  for (const budget of [{ tokenBudget: 400 }, { itemCountBudget: 1 }]) {
    let requests = 0;
    const session = createAgentSession({ contextSelectionPolicy: STANDALONE_CONTEXT_POLICY, budget,
      contextItems: () => [{ ...page("required"), priority: "required", estimatedTokens: 0, content: { text: "x".repeat(2000) } }],
      provider: { decide: async () => { ++requests; return { kind: "finish", reason: "completed", text: "wrong" }; } } });
    t.after(() => session.dispose()); await session.setEnabled(true); await session.submit("read");
    assert.equal(requests, 0); assert.equal(session.getContextSelection()?.status, "budget-exceeded");
    assert.match(session.getSnapshot().message, /必需输入.*预算/);
  }
});

test("history window 1/2/16 protects only available latest pairs and observer failures cannot interrupt execution", async (t) => {
  for (const historyTurnBudget of [1, 2, 16]) {
    const session = createAgentSession({ contextSelectionPolicy: STANDALONE_CONTEXT_POLICY, budget: { historyTurnBudget },
      onContextSelection() { throw new Error("observer failed"); },
      provider: { decide: async () => ({ kind: "finish", reason: "completed", text: "answer" }) } });
    t.after(() => session.dispose()); await session.setEnabled(true);
    await session.submit("20分钟"); await session.submit("更正为12分钟"); await session.submit("继续");
    const report = session.getContextSelection(); assert.ok(report);
    assert.equal(report.selected.filter((item) => item.reason === "recent-conversation").length, Math.min(2, historyTurnBudget));
    assert.equal(session.getSnapshot().status, "completed");
    assert.equal(isContextSelectionReportV1({ ...report, text: "unexpected" }), false);
    await session.setEnabled(false); assert.equal(session.getContextSelection(), null);
  }
});
