import assert from "node:assert/strict";
import test from "node:test";

import { ContextBuilder } from "../src/agent/context-builder.ts";
import { validateDecision } from "../src/agent/decision-validator.ts";
import { FIRST_PARTY_CAPABILITY_CATALOG } from "../src/agent/first-party-capabilities.ts";
import { ToolsetResolver } from "../src/agent/toolset-resolver.ts";
import type {
  AgentCapabilityDescriptor,
  AgentContextBudget,
  AgentContextItem,
  AgentRunState,
  RunPolicySnapshot,
} from "../src/agent/agent-contracts.ts";

const state: AgentRunState = { lifecycle: "active", phase: "planning" };
const budget: AgentContextBudget = {
  tokenBudget: 20,
  itemCountBudget: 8,
  toolResultSizeBudget: 1024,
  rangeBudget: 32,
  historyTurnBudget: 4,
};

function item(overrides: Partial<AgentContextItem>): AgentContextItem {
  return {
    contextItemId: "item",
    kind: "capability-result",
    content: { value: true },
    sourceType: "capability-result",
    sourceId: "score.read-summary",
    documentId: "score-1",
    documentVersion: 4,
    scope: "document",
    trustLevel: "authoritative",
    priority: "normal",
    createdAt: 1,
    expiresAt: null,
    estimatedTokens: 4,
    ...overrides,
  };
}

function policy(overrides: Partial<RunPolicySnapshot> = {}): RunPolicySnapshot {
  return {
    policyVersion: 1,
    allowedCapabilityIds: ["score.read-summary"],
    allowedKinds: ["query"],
    maxToolsPerTurn: 2,
    maxCostClass: "constant",
    exposeApprovalRequired: false,
    ...overrides,
  };
}

test("context builder keeps the highest-priority duplicate and reports mixed versions", () => {
  const result = new ContextBuilder().build({
    runId: "run-1",
    goal: "读取当前乐谱概要",
    turnInput: null,
    runState: state,
    workspace: { workspaceId: "workspace-1", documentId: "score-1", documentVersion: 5, selection: null },
    items: [
      item({ contextItemId: "version-4", documentVersion: 4, priority: "low", createdAt: 1 }),
      item({ contextItemId: "duplicate-version-4", documentVersion: 4, priority: "high", createdAt: 2 }),
      item({ contextItemId: "version-5", documentVersion: 5, priority: "high" }),
    ],
    budget: { ...budget, tokenBudget: 200 },
    now: 10,
  });

  assert.equal(result.contextItems.some((value) => value.contextItemId === "version-4"), false);
  assert.equal(result.contextItems.some((value) => value.contextItemId === "duplicate-version-4"), true);
  assert.equal(result.omittedItems.some((value) => value.reason === "duplicate"), true);
  assert.deepEqual(result.versionWarnings.map((value) => value.code), ["version-mixed", "version-mismatch"]);
  assert.deepEqual(result.versionWarnings[0]?.versions, [4, 5]);
});

test("workspace context exposes selection availability without leaking authoritative endpoints", () => {
  const result = new ContextBuilder().build({
    runId: "run-selection",
    goal: "读取当前选中的小节",
    turnInput: null,
    runState: state,
    workspace: {
      workspaceId: "workspace-1",
      documentId: "score-1",
      documentVersion: 5,
      selection: {
        kind: "measure-range",
        documentId: "score-1",
        documentVersion: 5,
        startMeasureId: "private-start",
        endMeasureId: "private-end",
      },
    },
    items: [],
    budget: { ...budget, tokenBudget: 200 },
    now: 10,
  });

  const workspaceItem = result.contextItems.find((item) => item.contextItemId === "workspace.scope");
  assert.deepEqual(workspaceItem?.content, {
    workspaceId: "workspace-1",
    documentId: "score-1",
    documentVersion: 5,
    selectionAvailable: true,
  });
  assert.equal(JSON.stringify(workspaceItem).includes("private-start"), false);
});

test("context builder preserves required facts while trimming optional items by budget", () => {
  const result = new ContextBuilder().build({
    runId: "run-2",
    goal: "读取概要",
    turnInput: "请只回答标题",
    runState: state,
    workspace: { workspaceId: "workspace-1", documentId: null, documentVersion: null, selection: null },
    items: [
      item({ contextItemId: "required", priority: "required", estimatedTokens: 18 }),
      item({ contextItemId: "optional", sourceId: "other", priority: "low", estimatedTokens: 18 }),
    ],
    budget: { ...budget, tokenBudget: 10 },
    now: 10,
  });

  assert.equal(result.contextItems.some((value) => value.contextItemId === "required"), true);
  assert.equal(result.contextItems.some((value) => value.contextItemId === "optional"), false);
  assert.equal(result.budget.exceeded, true);
  assert.equal(result.omittedItems.some((value) => value.reason === "token-budget"), true);
});

test("context builder keeps only the newest task history turns before general budgets", () => {
  const result = new ContextBuilder().build({
    runId: "run-history",
    goal: "继续分析",
    turnInput: null,
    runState: state,
    workspace: { workspaceId: "workspace-1", documentId: "score-1", documentVersion: 5, selection: null },
    items: [
      item({
        contextItemId: "history-old",
        kind: "task-history",
        sourceType: "task-history",
        sourceId: "submission-old",
        documentVersion: 3,
        trustLevel: "derived",
        priority: "low",
        createdAt: 1,
      }),
      item({
        contextItemId: "history-middle",
        kind: "task-history",
        sourceType: "task-history",
        sourceId: "submission-middle",
        documentVersion: 4,
        trustLevel: "derived",
        priority: "low",
        createdAt: 2,
      }),
      item({
        contextItemId: "history-new",
        kind: "task-history",
        sourceType: "task-history",
        sourceId: "submission-new",
        documentVersion: 5,
        trustLevel: "derived",
        priority: "low",
        createdAt: 3,
      }),
    ],
    budget: { ...budget, tokenBudget: 200, historyTurnBudget: 2 },
    now: 10,
  });

  assert.deepEqual(result.contextItems
    .filter((value) => value.kind === "task-history")
    .map((value) => value.contextItemId), ["history-middle", "history-new"]);
  assert.equal(result.omittedItems.some(
    (value) => value.contextItemId === "history-old" && value.reason === "history-turn-budget",
  ), true);
  assert.deepEqual(result.versionWarnings.map((value) => value.code), ["version-mixed", "version-mismatch"]);
});

test("task history cannot displace required current context", () => {
  const result = new ContextBuilder().build({
    runId: "run-history-priority",
    goal: "继续分析",
    turnInput: null,
    runState: state,
    workspace: { workspaceId: "workspace-1", documentId: "score-1", documentVersion: 5, selection: null },
    items: [
      item({ contextItemId: "required-current", priority: "required", documentVersion: 5 }),
      item({
        contextItemId: "history",
        kind: "task-history",
        sourceType: "task-history",
        sourceId: "submission-history",
        trustLevel: "derived",
        priority: "low",
        createdAt: 2,
      }),
    ],
    budget: { ...budget, tokenBudget: 200, itemCountBudget: 4, historyTurnBudget: 4 },
    now: 10,
  });

  assert.equal(result.contextItems.some((value) => value.contextItemId === "required-current"), true);
  assert.equal(result.contextItems.some((value) => value.contextItemId === "history"), false);
  assert.equal(result.omittedItems.some(
    (value) => value.contextItemId === "history" && value.reason === "item-count-budget",
  ), true);
});

test("toolset resolver never exposes a capability outside the run policy or task intent", () => {
  const result = new ToolsetResolver().resolve({
    runState: state,
    policy: policy({ maxToolsPerTurn: 3 }),
    intent: { kind: "read", requestedCapabilityIds: [], scope: "document" },
    hasDocument: true,
    rangeBudget: budget.rangeBudget,
    catalog: FIRST_PARTY_CAPABILITY_CATALOG,
  });

  assert.deepEqual(result.snapshot.capabilityIds, ["score.read-summary"]);
  assert.equal(result.snapshot.toolDescriptors[0]?.inputSchema !== undefined, true);
  assert.equal("validateInput" in (result.snapshot.toolDescriptors[0] ?? {}), false);
  assert.equal(JSON.stringify(result.snapshot).includes("validateInput"), false);

  const hidden = new ToolsetResolver().resolve({
    runState: state,
    policy: policy({ allowedCapabilityIds: [] }),
    intent: { kind: "read", requestedCapabilityIds: [], scope: "document" },
    hasDocument: true,
    rangeBudget: budget.rangeBudget,
    catalog: FIRST_PARTY_CAPABILITY_CATALOG,
  });
  assert.deepEqual(hidden.snapshot.capabilityIds, []);
  assert.equal(hidden.omitted[0]?.code, "capability-not-allowed");
});

test("decision validator rejects guessed tools and invalid inputs, while finish remains a proposal", () => {
  const toolset = new ToolsetResolver().resolve({
    runState: state,
    policy: policy({ maxToolsPerTurn: 3 }),
    intent: { kind: "read", requestedCapabilityIds: [], scope: "document" },
    hasDocument: true,
    rangeBudget: budget.rangeBudget,
    catalog: FIRST_PARTY_CAPABILITY_CATALOG,
  });

  const result = validateDecision({
    kind: "tool-calls",
    calls: [
      { callId: "read", capabilityId: "score.read-summary", contractVersion: 1, input: {} },
      { callId: "guessed", capabilityId: "score.apply-proposal", contractVersion: 1, input: {} },
      { callId: "bad-input", capabilityId: "score.read-summary", contractVersion: 1, input: { extra: true } },
    ],
  }, toolset, state);
  assert.equal(result.acceptedActions.length, 1);
  assert.deepEqual(result.rejectedActions.map((value) => value.code), ["capability-not-exposed", "invalid-input"]);

  const finish = validateDecision({ kind: "finish", reason: "completed", text: "完成" }, toolset, state);
  assert.equal(finish.acceptedActions[0]?.kind, "finish-request");
  assert.equal(finish.acceptedActions[0]?.kind === "finish-request"
    ? finish.acceptedActions[0].completionCheckRequired : false, true);
});

test("toolset resolver and decision validator stop when the run is waiting", () => {
  const waiting = {
    lifecycle: "waiting",
    phase: "planning",
    waitReason: "user-input",
  } satisfies AgentRunState;
  const resolved = new ToolsetResolver().resolve({
    runState: waiting,
    policy: policy(),
    intent: { kind: "read", requestedCapabilityIds: [], scope: "document" },
    hasDocument: true,
    rangeBudget: budget.rangeBudget,
    catalog: FIRST_PARTY_CAPABILITY_CATALOG,
  });
  assert.deepEqual(resolved.snapshot.capabilityIds, []);
  const result = validateDecision({ kind: "message", text: "继续" }, resolved, waiting);
  assert.equal(result.rejectedActions[0]?.code, "run-not-active");
});

test("descriptor input validators remain internal while model-visible descriptors stay serializable", () => {
  const descriptor: AgentCapabilityDescriptor = FIRST_PARTY_CAPABILITY_CATALOG[0]!;
  assert.equal(descriptor.validateInput({}), true);
  assert.equal(descriptor.validateInput({ extra: true }), false);
  assert.equal(JSON.stringify(descriptor).includes("validateInput"), false);

  const throwingToolset = new ToolsetResolver().resolve({
    runState: state,
    policy: policy(),
    intent: { kind: "read", requestedCapabilityIds: [], scope: "document" },
    hasDocument: true,
    rangeBudget: budget.rangeBudget,
    catalog: [{
      ...descriptor,
      validateInput() { throw new Error("validator defect"); },
    }],
  });
  const rejected = validateDecision({
    kind: "tool-calls",
    calls: [{ callId: "read", capabilityId: "score.read-summary", contractVersion: 1, input: {} }],
  }, throwingToolset, state);
  assert.equal(rejected.rejectedActions[0]?.code, "invalid-input");
});

test("semantic range capability validates references and defers authoritative size checks", () => {
  const resolved = new ToolsetResolver().resolve({
    runState: state,
    policy: policy({
      allowedCapabilityIds: ["score.read-measures"],
      maxCostClass: "range",
    }),
    intent: {
      kind: "read",
      requestedCapabilityIds: ["score.read-measures"],
      scope: "range",
    },
    hasDocument: true,
    rangeBudget: 4,
    catalog: FIRST_PARTY_CAPABILITY_CATALOG,
  });

  assert.deepEqual(resolved.snapshot.capabilityIds, ["score.read-measures"]);
  assert.equal(resolved.rangeEstimators.has("score.read-measures"), false);
  const accepted = validateDecision({
    kind: "tool-calls",
    calls: [{
      callId: "range-ok",
      capabilityId: "score.read-measures",
      contractVersion: 1,
      input: { reference: { kind: "ordinal-range", startOrdinal: 1, endOrdinal: 8 } },
    }],
  }, resolved, state);
  assert.equal(accepted.acceptedActions.length, 1);

  const rejected = validateDecision({
    kind: "tool-calls",
    calls: [{
      callId: "range-invalid",
      capabilityId: "score.read-measures",
      contractVersion: 1,
      input: { reference: { kind: "ordinal-range", startOrdinal: 0, endOrdinal: 8 } },
    }],
  }, resolved, state);
  assert.equal(rejected.acceptedActions.length, 0);
  assert.equal(rejected.rejectedActions[0]?.code, "invalid-input");
  assert.equal(FIRST_PARTY_CAPABILITY_CATALOG.some(
    (descriptor) => descriptor.id === "score.read-measure-range",
  ), false);
});
