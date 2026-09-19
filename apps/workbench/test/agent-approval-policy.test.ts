import assert from "node:assert/strict";
import test from "node:test";

import { evaluateCapabilityApproval } from "../src/agent/approval-policy.ts";
import { validateDecision } from "../src/agent/decision-validator.ts";
import { FIRST_PARTY_CAPABILITY_CATALOG } from "../src/agent/first-party-capabilities.ts";
import { ToolsetResolver } from "../src/agent/toolset-resolver.ts";
import type {
  AgentApprovalPolicyMode,
  AgentCapabilityDescriptor,
  RunPolicySnapshot,
} from "../src/agent/agent-contracts.ts";

const readDescriptor: AgentCapabilityDescriptor = (() => {
  const found = FIRST_PARTY_CAPABILITY_CATALOG.find(
    (descriptor) => descriptor.id === "score.read-summary",
  );
  if (found === undefined) throw new Error("score.read-summary descriptor is missing");
  return found;
})();

function runPolicy(
  approvalMode: AgentApprovalPolicyMode,
  capabilityId = readDescriptor.id,
): RunPolicySnapshot {
  return {
    policyVersion: 1,
    allowedCapabilityIds: [capabilityId],
    allowedKinds: ["query"],
    maxToolsPerTurn: 1,
    maxCostClass: "constant",
    approvalMode,
  };
}

function descriptor(overrides: Partial<AgentCapabilityDescriptor>): AgentCapabilityDescriptor {
  return {
    ...readDescriptor,
    ...overrides,
  };
}

test("approval policy classifies side effects and derives allow, approval, and deny", () => {
  const read = evaluateCapabilityApproval(readDescriptor, runPolicy("risk-based"));
  assert.equal(read.riskLevel, "low");
  assert.equal(read.decision, "allow");
  assert.deepEqual(read.riskReasons, []);

  const networkRead = descriptor({
    id: "network.read-analysis",
    sideEffects: { ...readDescriptor.sideEffects, network: "read" },
  });
  const network = evaluateCapabilityApproval(networkRead, runPolicy("risk-based", networkRead.id));
  assert.equal(network.riskLevel, "medium");
  assert.equal(network.decision, "require-approval");
  assert.deepEqual(network.riskReasons, ["会访问网络"]);

  const documentWrite = descriptor({
    id: "score.write-title",
    sideEffects: { ...readDescriptor.sideEffects, document: "write" },
  });
  const write = evaluateCapabilityApproval(documentWrite, runPolicy("risk-based", documentWrite.id));
  assert.equal(write.riskLevel, "high");
  assert.equal(write.decision, "require-approval");
  assert.deepEqual(write.riskReasons, ["会修改当前乐谱"]);
  assert.equal(
    evaluateCapabilityApproval(documentWrite, runPolicy("disallow", documentWrite.id)).decision,
    "deny",
  );

  const firstPartyWrite = FIRST_PARTY_CAPABILITY_CATALOG.find(
    (candidate) => candidate.id === "score.update-title",
  );
  assert.ok(firstPartyWrite);
  assert.deepEqual(
    evaluateCapabilityApproval(firstPartyWrite, runPolicy("risk-based", firstPartyWrite.id)),
    {
      decision: "require-approval",
      riskLevel: "high",
      riskReasons: ["会修改当前乐谱"],
      policyVersion: 1,
      mode: "risk-based",
      capabilityRequirement: "risk-based",
    },
  );
});

test("capability and Run policy can independently raise the approval floor", () => {
  const alwaysCapability = descriptor({ approvalRequirement: "always" });
  const capabilityApproval = evaluateCapabilityApproval(
    alwaysCapability,
    runPolicy("risk-based"),
  );
  assert.equal(capabilityApproval.decision, "require-approval");
  assert.deepEqual(capabilityApproval.riskReasons, ["该能力被声明为始终需要批准"]);

  const alwaysRun = evaluateCapabilityApproval(readDescriptor, runPolicy("always"));
  assert.equal(alwaysRun.decision, "require-approval");
  assert.deepEqual(alwaysRun.riskReasons, ["当前任务策略要求逐次批准每项能力"]);
});

test("Toolset is the enforcement point for the effective approval decision", () => {
  const risky = descriptor({
    id: "score.write-title",
    sideEffects: { ...readDescriptor.sideEffects, document: "write" },
  });
  const resolver = new ToolsetResolver();
  const state = { lifecycle: "active", phase: "planning" } as const;
  const intent = {
    kind: "read" as const,
    requestedCapabilityIds: [risky.id],
    scope: "document" as const,
  };
  const denied = resolver.resolve({
    runState: state,
    policy: runPolicy("disallow", risky.id),
    intent,
    hasDocument: true,
    rangeBudget: 0,
    catalog: [risky],
  });
  assert.deepEqual(denied.snapshot.capabilityIds, []);
  assert.equal(denied.omitted[0]?.code, "approval-required");

  const gated = resolver.resolve({
    runState: state,
    policy: runPolicy("risk-based", risky.id),
    intent,
    hasDocument: true,
    rangeBudget: 0,
    catalog: [risky],
  });
  assert.equal(gated.snapshot.toolDescriptors[0]?.requiresApproval, true);
  const validation = validateDecision({
    kind: "tool-calls",
    calls: [{
      callId: "write-title",
      capabilityId: risky.id,
      contractVersion: risky.contractVersion,
      input: {},
    }],
  }, gated, state);
  assert.equal(validation.acceptedActions[0]?.kind, "tool-call");
  assert.equal(validation.approvalRequirements[0]?.callId, "write-title");
});
