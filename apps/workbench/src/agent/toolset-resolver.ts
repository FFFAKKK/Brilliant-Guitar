import type {
  AgentCapabilityDescriptor,
  AgentRunState,
  AgentTaskIntent,
  AgentToolDescriptor,
  CapabilityCostClass,
  CapabilityKind,
  RunPolicySnapshot,
  ToolsetOmission,
  ToolsetResolutionResult,
  ToolsetSnapshot,
} from "./agent-contracts.ts";

const COST_RANK: Record<CapabilityCostClass, number> = {
  constant: 0,
  entity: 1,
  range: 2,
  document: 3,
};

const INTENT_KINDS: Record<AgentTaskIntent["kind"], readonly CapabilityKind[]> = {
  read: ["query"],
  analyze: ["query", "analysis"],
  edit: ["query", "analysis", "mutation"],
  playback: ["query", "playback"],
};

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
}

function hash(value: string): string {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0).toString(16).padStart(8, "0");
}

function visibleDescriptor(descriptor: AgentCapabilityDescriptor): AgentToolDescriptor {
  return {
    id: descriptor.id,
    contractVersion: descriptor.contractVersion,
    name: descriptor.name,
    description: descriptor.description,
    inputSchema: descriptor.inputSchema,
    outputSummary: descriptor.outputSummary,
    preconditions: descriptor.preconditions,
    sideEffects: descriptor.sideEffects,
    scopeLimit: descriptor.scopeLimit,
    requiresApproval: descriptor.requiresApproval,
    costClass: descriptor.costClass,
    failureModes: ["invalid-input", "missing-precondition", "version-conflict", "capability-failed"],
  };
}

export interface ToolsetResolverInput {
  readonly runState: AgentRunState;
  readonly policy: RunPolicySnapshot;
  readonly intent: AgentTaskIntent;
  readonly hasDocument: boolean;
  readonly rangeBudget: number;
  readonly catalog: readonly AgentCapabilityDescriptor[];
}

function omit(capabilityId: string, code: ToolsetOmission["code"]): ToolsetOmission {
  return { capabilityId, code };
}

export class ToolsetResolver {
  resolve(input: ToolsetResolverInput): ToolsetResolutionResult {
    const omitted: ToolsetOmission[] = [];
    const descriptors: AgentCapabilityDescriptor[] = [];
    const requested = new Set(input.intent.requestedCapabilityIds);
    const allowedKinds = new Set(input.policy.allowedKinds);
    const intentKinds = new Set(INTENT_KINDS[input.intent.kind]);

    for (const descriptor of input.catalog) {
      if (input.runState.lifecycle !== "active") {
        omitted.push(omit(descriptor.id, "run-not-active"));
      } else if (!input.policy.allowedCapabilityIds.includes(descriptor.id)) {
        omitted.push(omit(descriptor.id, "capability-not-allowed"));
      } else if (!allowedKinds.has(descriptor.kind) || !intentKinds.has(descriptor.kind)) {
        omitted.push(omit(descriptor.id, "kind-not-allowed"));
      } else if (!descriptor.allowedPhases.includes(input.runState.phase)) {
        omitted.push(omit(descriptor.id, "phase-not-allowed"));
      } else if (descriptor.requiresDocument && !input.hasDocument) {
        omitted.push(omit(descriptor.id, "missing-precondition"));
      } else if (descriptor.scopeLimit !== "none"
        && input.intent.scope !== "none"
        && descriptor.scopeLimit !== input.intent.scope) {
        omitted.push(omit(descriptor.id, "scope-exceeded"));
      } else if (COST_RANK[descriptor.costClass] > COST_RANK[input.policy.maxCostClass]) {
        omitted.push(omit(descriptor.id, "budget-exceeded"));
      } else if (descriptor.requiresApproval && !input.policy.exposeApprovalRequired) {
        omitted.push(omit(descriptor.id, "approval-required"));
      } else if (requested.size > 0 && !requested.has(descriptor.id)) {
        omitted.push(omit(descriptor.id, "not-requested"));
      } else {
        descriptors.push(descriptor);
      }
    }

    const toolDescriptors = descriptors.map(visibleDescriptor);
    const capabilityIds = toolDescriptors.map((descriptor) => descriptor.id);
    const identity = stableJson({
      policyVersion: input.policy.policyVersion,
      capabilityIds,
      toolDescriptors,
      rangeBudget: input.rangeBudget,
    });
    const toolsetHash = hash(identity);
    const inputValidators = new Map(descriptors.map((descriptor) => [descriptor.id, descriptor.validateInput]));
    const rangeEstimators = new Map(descriptors
      .filter((descriptor) => descriptor.estimateRangeUnits !== undefined)
      .map((descriptor) => [descriptor.id, descriptor.estimateRangeUnits!]));
    const rangeBudget = Number.isSafeInteger(input.rangeBudget) && input.rangeBudget >= 0
      ? input.rangeBudget : 0;
    const snapshot: ToolsetSnapshot = {
      snapshotId: `toolset:${toolsetHash}`,
      policyVersion: input.policy.policyVersion,
      toolsetHash,
      capabilityIds,
      toolDescriptors,
      maxCalls: input.policy.maxToolsPerTurn,
    };
    return { snapshot, omitted, inputValidators, rangeBudget, rangeEstimators };
  }
}
