import assert from "node:assert/strict";
import test from "node:test";

import {
  defineAgentEvaluationCase,
  evaluateAgentOutcome,
  runAgentEvaluationSuite,
} from "../src/agent/agent-evaluation.ts";
import type {
  AgentEvaluationCase,
  AgentEvaluationExecutor,
} from "../src/agent/agent-evaluation.ts";
import type { AgentContextBudget, RunPolicySnapshot } from "../src/agent/agent-contracts.ts";
import {
  AgentIntentRouter,
} from "../src/agent/agent-intent-router.ts";
import type { AgentReadCapabilityId } from "../src/agent/agent-intent-router.ts";
import { WorkbenchAgentCapabilityPort } from "../src/agent/capability-port.ts";
import {
  verifyScoreMetadataCompletion,
  verifyScoreMeasuresCompletion,
  verifyScoreStructureCompletion,
  verifyScoreSummaryCompletion,
} from "../src/agent/completion-verifier.ts";
import type { AgentCompletionVerifier } from "../src/agent/completion-verifier.ts";
import { FIRST_PARTY_CAPABILITY_CATALOG } from "../src/agent/first-party-capabilities.ts";
import { FakeAgentProvider } from "../src/agent/provider.ts";
import { AgentRunController } from "../src/agent/run-controller.ts";
import { MeasureReferenceAgentCapabilityPort } from "../src/agent/measure-reference-capability-port.ts";
import { MeasureReferenceReadService } from "../src/agent/measure-reference-read-service.ts";
import { AGENT_EVALUATION_BASELINE } from "./agent-evaluation-cases.ts";

const budget: AgentContextBudget = {
  tokenBudget: 400,
  itemCountBudget: 16,
  toolResultSizeBudget: 4096,
  rangeBudget: 32,
  historyTurnBudget: 4,
};

const intentRouter = new AgentIntentRouter();

interface EvaluationCapabilityPlan {
  readonly completionVerifier: AgentCompletionVerifier;
  readonly response: string;
  readonly data: unknown;
  readonly input: unknown;
  readonly scope: "document" | "range";
  readonly rangeBudget: number;
}

type EvaluationCapabilityId = AgentReadCapabilityId;

const capabilityPlans: Readonly<Record<EvaluationCapabilityId, EvaluationCapabilityPlan>> = {
  "score.read-summary": {
    completionVerifier: verifyScoreSummaryCompletion,
    response: "当前乐谱共有 32 小节。",
    input: {},
    scope: "document",
    rangeBudget: 0,
    data: {
      documentId: "score-1",
      documentVersion: 7,
      title: "练习曲",
      measureCount: 32,
    },
  },
  "score.read-metadata": {
    completionVerifier: verifyScoreMetadataCompletion,
    response: "《练习曲》由 Brilliant 创作，速度为 120 BPM。",
    input: {},
    scope: "document",
    rangeBudget: 0,
    data: {
      documentId: "score-1",
      documentVersion: 7,
      title: "练习曲",
      authors: ["Brilliant"],
      tempoBpm: 120,
    },
  },
  "score.read-structure": {
    completionVerifier: verifyScoreStructureCompletion,
    response: "当前乐谱有 32 小节、2 个声部和 2 个谱表。",
    input: {},
    scope: "document",
    rangeBudget: 0,
    data: {
      documentId: "score-1",
      documentVersion: 7,
      measureCount: 32,
      partCount: 2,
      staffCount: 2,
    },
  },
  "score.read-measures": {
    completionVerifier: verifyScoreMeasuresCompletion,
    response: "已读取 measure-2 到 measure-4，共 3 个小节。",
    input: {
      reference: {
        kind: "stable-id-range",
        startMeasureId: "measure-2",
        endMeasureId: "measure-4",
      },
    },
    scope: "range",
    rangeBudget: 3,
    data: {
      documentId: "score-1",
      documentVersion: 7,
      startMeasureId: "measure-2",
      endMeasureId: "measure-4",
      measureCount: 3,
      measures: [
        { measureId: "measure-2", meter: { numerator: 4, denominator: 4 }, pickupDuration: null },
        { measureId: "measure-3", meter: { numerator: 3, denominator: 4 }, pickupDuration: null },
        { measureId: "measure-4", meter: { numerator: 4, denominator: 4 }, pickupDuration: null },
      ],
    },
  },
};

function policy(capabilityId: EvaluationCapabilityId): RunPolicySnapshot {
  return {
    policyVersion: 1,
    allowedCapabilityIds: [capabilityId],
    allowedKinds: ["query"],
    maxToolsPerTurn: 1,
    maxCostClass: capabilityId === "score.read-measures" ? "range" : "constant",
    exposeApprovalRequired: false,
  };
}

function capabilityForCase(testCase: AgentEvaluationCase): EvaluationCapabilityId {
  const route = intentRouter.route(testCase.goal);
  if (route.capabilityId === null || route.requiresClarification) {
    throw new Error("evaluation goal did not resolve to one capability");
  }
  return route.capabilityId;
}

function idSource(): (kind: "event" | "turn" | "invocation" | "user-input") => string {
  let sequence = 0;
  return (kind) => `${kind}-${++sequence}`;
}

function clock(): () => number {
  let value = 0;
  return () => {
    value += 10;
    return value;
  };
}

class BaselineExecutor implements AgentEvaluationExecutor {
  async execute(testCase: AgentEvaluationCase) {
    if (testCase.fixtureId !== "score.standard-32"
      && testCase.fixtureId !== "score.standard-32.provider-failure"
      && testCase.fixtureId !== "score.standard-32.measure-range") {
      throw new Error("unknown evaluation fixture");
    }
    const capabilityId = capabilityForCase(testCase);
    const plan = capabilityPlans[capabilityId];
    const provider = testCase.fixtureId === "score.standard-32.provider-failure"
      ? new FakeAgentProvider([{
          kind: "error",
          expect: { capabilityIds: [capabilityId], contextSourceIds: [] },
          message: "recorded provider failure",
        }])
      : new FakeAgentProvider([
        {
          kind: "decision",
          expect: { capabilityIds: [capabilityId], contextSourceIds: [] },
          decision: {
            kind: "tool-calls",
            calls: [{
              callId: `read:${capabilityId}`,
              capabilityId,
              contractVersion: 1,
              input: plan.input,
            }],
          },
        },
        {
          kind: "decision",
          expect: {
            capabilityIds: [capabilityId],
            contextSourceIds: [capabilityId],
          },
          decision: { kind: "finish", reason: "completed", text: plan.response },
        },
      ]);
    const atomicCapabilities = new WorkbenchAgentCapabilityPort({
      async invokeAgentCapability(request) {
        assert.notEqual(request.capabilityId, "score.read-measures");
        assert.deepEqual(request.input, plan.input);
        return {
          status: "completed",
          invocationId: request.invocationId,
          capabilityId: request.capabilityId,
          contractVersion: request.contractVersion,
          data: capabilityPlans[request.capabilityId as EvaluationCapabilityId]?.data,
        };
      },
    });
    const capabilities = new MeasureReferenceAgentCapabilityPort(
      atomicCapabilities,
      new MeasureReferenceReadService({
        async readMeasureIndex() {
          return {
            status: "completed",
            index: {
              documentId: "score-1",
              documentVersion: 7,
              measureIds: Array.from({ length: 32 }, (_, index) => `measure-${index + 1}`),
            },
          };
        },
      }, {
        async readMeasureRange(input) {
          assert.deepEqual(input, {
            startMeasureId: "measure-2",
            endMeasureId: "measure-4",
            maxMeasures: 3,
          });
          return {
            status: "completed",
            invocationId: "evaluation:internal-range",
            capabilityId: "score.read-measure-range",
            contractVersion: 1,
            data: capabilityPlans["score.read-measures"].data as {
              documentId: string;
              documentVersion: number;
              startMeasureId: string;
              endMeasureId: string;
              measureCount: number;
              measures: readonly {
                measureId: string;
                meter: { numerator: number; denominator: number };
                pickupDuration: null;
              }[];
            },
          };
        },
      }),
    );
    const controller = new AgentRunController({
      provider,
      capabilities,
      catalog: FIRST_PARTY_CAPABILITY_CATALOG,
      completionVerifier: plan.completionVerifier,
      now: clock(),
      nextId: idSource(),
    });
    return controller.run({
      runId: `evaluation:${testCase.id}`,
      workspace: {
        workspaceId: "workspace-evaluation",
        documentId: "score-1",
        documentVersion: 7,
        selection: null,
      },
      goal: testCase.goal,
      intent: {
        kind: "read",
        requestedCapabilityIds: [capabilityId],
        scope: plan.scope,
      },
      policy: policy(capabilityId),
      budget: { ...budget, rangeBudget: plan.rangeBudget },
      initialContextItems: [],
      maxTurns: 4,
    });
  }
}

test("evaluation baseline runs through the real controller without a paid Provider", async () => {
  const report = await runAgentEvaluationSuite(AGENT_EVALUATION_BASELINE, new BaselineExecutor());

  assert.equal(report.totalCases, 5);
  assert.equal(report.passedCases, 5);
  assert.equal(report.failedCases, 0);
  assert.equal(report.infrastructureFailedCases, 0);
  assert.equal(report.passRate, 1);
  assert.equal(report.averageScore, 1);
  assert.deepEqual(report.reports.map((item) => item.observation?.terminalReason), [
    "completed",
    "failed",
    "completed",
    "completed",
    "completed",
  ]);
});

test("evaluation reports which deterministic criteria failed", async () => {
  const outcome = await new BaselineExecutor().execute(AGENT_EVALUATION_BASELINE[0]!);
  const strictCase = defineAgentEvaluationCase({
    id: "score-summary.intentional-mismatch",
    title: "用于验证评测器的故意不匹配",
    category: "capability-routing",
    fixtureId: "score.standard-32",
    goal: "告诉我当前乐谱有多少小节",
    expectations: {
      terminalReason: "completed",
      failureCode: null,
      requiredCapabilityIds: [],
      forbiddenCapabilityIds: ["score.read-summary"],
      exactCapabilitySequence: [],
      verificationSatisfied: false,
      requiredEvidence: ["missing-evidence"],
      responseIncludes: ["不存在的回答"],
      maxTurns: 1,
      maxCapabilityCalls: 0,
      maxDurationMs: 0,
    },
  });

  const report = evaluateAgentOutcome(strictCase, outcome);

  assert.equal(report.status, "failed");
  assert.equal(report.score < 1, true);
  assert.deepEqual(report.checks.filter((item) => !item.passed).map((item) => item.criterion), [
    "forbidden-capability",
    "capability-sequence",
    "completion-verification",
    "verification-evidence",
    "response-content",
    "turn-budget",
    "capability-call-budget",
    "duration-budget",
  ]);
});

test("evaluation suite isolates executor failures and continues later cases", async () => {
  const baseline = new BaselineExecutor();
  const report = await runAgentEvaluationSuite(AGENT_EVALUATION_BASELINE, {
    async execute(testCase) {
      if (testCase.id === "score-summary.standard") throw new Error("private infrastructure detail");
      return baseline.execute(testCase);
    },
  });

  assert.equal(report.passedCases, 4);
  assert.equal(report.infrastructureFailedCases, 1);
  assert.equal(report.reports[0]?.status, "infrastructure-failed");
  assert.equal(JSON.stringify(report).includes("private infrastructure detail"), false);
  assert.equal(report.reports[1]?.status, "passed");
});

test("evaluation case definition rejects contradictory capability expectations", () => {
  assert.throws(() => defineAgentEvaluationCase({
    id: "invalid.conflict",
    title: "冲突案例",
    category: "capability-routing",
    fixtureId: "score.invalid",
    goal: "读取概要",
    expectations: {
      terminalReason: "completed",
      failureCode: null,
      requiredCapabilityIds: ["score.read-summary"],
      forbiddenCapabilityIds: ["score.read-summary"],
      exactCapabilitySequence: null,
      verificationSatisfied: true,
      requiredEvidence: [],
      responseIncludes: [],
      maxTurns: 2,
      maxCapabilityCalls: 1,
      maxDurationMs: null,
    },
  }), /conflict/);
  assert.throws(() => defineAgentEvaluationCase({
    id: "invalid.failed-without-code",
    title: "缺少失败码",
    category: "failure-handling",
    fixtureId: "score.invalid",
    goal: "读取概要",
    expectations: {
      terminalReason: "failed",
      failureCode: null,
      requiredCapabilityIds: [],
      forbiddenCapabilityIds: [],
      exactCapabilitySequence: [],
      verificationSatisfied: false,
      requiredEvidence: [],
      responseIncludes: [],
      maxTurns: 1,
      maxCapabilityCalls: 0,
      maxDurationMs: null,
    },
  }), /failure code/);
  assert.doesNotThrow(() => defineAgentEvaluationCase({
    id: "valid.repeated-capability",
    title: "允许重复能力轨迹",
    category: "capability-routing",
    fixtureId: "score.repeated-read",
    goal: "重新读取两次",
    expectations: {
      terminalReason: "completed",
      failureCode: null,
      requiredCapabilityIds: ["score.read-summary"],
      forbiddenCapabilityIds: [],
      exactCapabilitySequence: ["score.read-summary", "score.read-summary"],
      verificationSatisfied: true,
      requiredEvidence: [],
      responseIncludes: [],
      maxTurns: 3,
      maxCapabilityCalls: 2,
      maxDurationMs: null,
    },
  }));
});

test("evaluation suite rejects empty and duplicate baselines before execution", async () => {
  const executor = new BaselineExecutor();
  await assert.rejects(runAgentEvaluationSuite([], executor), /must not be empty/);
  await assert.rejects(runAgentEvaluationSuite([
    AGENT_EVALUATION_BASELINE[0]!,
    AGENT_EVALUATION_BASELINE[0]!,
  ], executor), /duplicate case ids/);
});
