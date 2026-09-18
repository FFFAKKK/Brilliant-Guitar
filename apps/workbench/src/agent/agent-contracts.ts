export type AgentRunLifecycle = "active" | "waiting" | "recovering" | "terminal";

export type AgentRunPhase = "preparing" | "planning" | "executing" | "verifying";

export type AgentRunWaitReason = "user-input" | "approval" | "cancellation-pending";

export type AgentRunRecoveryReason = "capability-outcome-unknown" | "host-interrupted";

export type AgentRunFailureCode =
  | "invalid-decision"
  | "provider-failed"
  | "capability-failed"
  | "budget-exceeded"
  | "completion-rejected"
  | "internal-error";

export type AgentRunState =
  | { readonly lifecycle: "active"; readonly phase: AgentRunPhase }
  | {
      readonly lifecycle: "waiting";
      readonly phase: AgentRunPhase;
      readonly waitReason: AgentRunWaitReason;
    }
  | {
      readonly lifecycle: "recovering";
      readonly phase: AgentRunPhase;
      readonly recoveryReason: AgentRunRecoveryReason;
    }
  | {
      readonly lifecycle: "terminal";
      readonly phase: AgentRunPhase;
      readonly terminalReason: "completed" | "cancelled";
    }
  | {
      readonly lifecycle: "terminal";
      readonly phase: AgentRunPhase;
      readonly terminalReason: "failed";
      readonly failureCode: AgentRunFailureCode;
    };

export type ContextItemKind =
  | "user-goal"
  | "workspace-scope"
  | "selection"
  | "authoritative-fact"
  | "capability-result"
  | "derived-analysis"
  | "user-preference"
  | "system-constraint";

export type ContextTrustLevel = "authoritative" | "user-provided" | "derived" | "untrusted";

export type ContextPriority = "required" | "high" | "normal" | "low";

export interface AgentContextItem {
  readonly contextItemId: string;
  readonly kind: ContextItemKind;
  readonly content: unknown;
  readonly sourceType: string;
  readonly sourceId: string;
  readonly documentId: string | null;
  readonly documentVersion: number | null;
  readonly scope: string;
  readonly trustLevel: ContextTrustLevel;
  readonly priority: ContextPriority;
  readonly createdAt: number;
  readonly expiresAt: number | null;
  readonly estimatedTokens: number;
}

export interface AgentContextBudget {
  readonly tokenBudget: number;
  readonly itemCountBudget: number;
  readonly toolResultSizeBudget: number;
  readonly rangeBudget: number;
  readonly historyTurnBudget: number;
}

export interface AgentWorkspaceScope {
  readonly workspaceId: string;
  readonly documentId: string | null;
  readonly documentVersion: number | null;
  readonly selection: string | null;
}

export interface ContextBuildInput {
  readonly runId: string;
  readonly goal: string;
  readonly turnInput: string | null;
  readonly runState: AgentRunState;
  readonly workspace: AgentWorkspaceScope;
  readonly items: readonly AgentContextItem[];
  readonly budget: AgentContextBudget;
  readonly now: number;
}

export type ContextOmissionReason =
  | "duplicate"
  | "item-count-budget"
  | "token-budget"
  | "expired"
  | "invalid-estimate";

export interface OmittedContextItem {
  readonly contextItemId: string;
  readonly reason: ContextOmissionReason;
}

export interface ContextVersionWarning {
  readonly code: "version-mixed" | "version-mismatch";
  readonly documentId: string;
  readonly versions: readonly number[];
  readonly currentVersion: number | null;
}

export interface ContextBudgetReport {
  readonly estimatedTokens: number;
  readonly itemCount: number;
  readonly tokenBudget: number;
  readonly itemCountBudget: number;
  readonly exceeded: boolean;
}

export interface ContextBuildResult {
  readonly contextItems: readonly AgentContextItem[];
  readonly omittedItems: readonly OmittedContextItem[];
  readonly versionWarnings: readonly ContextVersionWarning[];
  readonly budget: ContextBudgetReport;
}

export type CapabilityKind = "query" | "analysis" | "mutation" | "playback";

export type CapabilityCostClass = "constant" | "range" | "entity" | "document";

export type CapabilityScope = "none" | "document" | "range" | "entity";

export interface CapabilitySideEffects {
  readonly document: "none" | "read" | "write";
  readonly filesystem: "none" | "read" | "write";
  readonly network: "none" | "read" | "write";
  readonly settings: "none" | "read" | "write";
  readonly playback: "none" | "start" | "stop";
}

export interface AgentCapabilityDescriptor {
  readonly id: string;
  readonly contractVersion: number;
  readonly name: string;
  readonly description: string;
  readonly kind: CapabilityKind;
  readonly inputSchema: unknown;
  readonly outputSummary: string;
  readonly preconditions: readonly string[];
  readonly sideEffects: CapabilitySideEffects;
  readonly scopeLimit: CapabilityScope;
  readonly requiresDocument: boolean;
  readonly requiresApproval: boolean;
  readonly costClass: CapabilityCostClass;
  readonly allowedPhases: readonly AgentRunPhase[];
  readonly validateInput: (input: unknown) => boolean;
}

export interface AgentToolDescriptor {
  readonly id: string;
  readonly contractVersion: number;
  readonly name: string;
  readonly description: string;
  readonly inputSchema: unknown;
  readonly outputSummary: string;
  readonly preconditions: readonly string[];
  readonly sideEffects: CapabilitySideEffects;
  readonly scopeLimit: CapabilityScope;
  readonly requiresApproval: boolean;
  readonly costClass: CapabilityCostClass;
  readonly failureModes: readonly string[];
}

export interface RunPolicySnapshot {
  readonly policyVersion: number;
  readonly allowedCapabilityIds: readonly string[];
  readonly allowedKinds: readonly CapabilityKind[];
  readonly maxToolsPerTurn: number;
  readonly maxCostClass: CapabilityCostClass;
  readonly exposeApprovalRequired: boolean;
}

export type AgentTaskIntentKind = "read" | "analyze" | "edit" | "playback";

export interface AgentTaskIntent {
  readonly kind: AgentTaskIntentKind;
  readonly requestedCapabilityIds: readonly string[];
  readonly scope: CapabilityScope;
}

export interface ToolsetOmission {
  readonly capabilityId: string;
  readonly code:
    | "capability-not-allowed"
    | "not-requested"
    | "kind-not-allowed"
    | "phase-not-allowed"
    | "missing-precondition"
    | "scope-exceeded"
    | "budget-exceeded"
    | "approval-required"
    | "run-not-active";
}

export interface ToolsetSnapshot {
  readonly snapshotId: string;
  readonly policyVersion: number;
  readonly toolsetHash: string;
  readonly capabilityIds: readonly string[];
  readonly toolDescriptors: readonly AgentToolDescriptor[];
  readonly maxCalls: number;
}

export interface ToolsetResolutionResult {
  readonly snapshot: ToolsetSnapshot;
  readonly omitted: readonly ToolsetOmission[];
  readonly inputValidators: ReadonlyMap<string, (input: unknown) => boolean>;
}

export type AgentDecision =
  | { readonly kind: "message"; readonly text: string }
  | { readonly kind: "tool-calls"; readonly calls: readonly AgentToolCall[] }
  | { readonly kind: "finish"; readonly reason: "completed" | "failed" | "cancelled"; readonly text: string | null };

export interface AgentToolCall {
  readonly callId: string;
  readonly capabilityId: string;
  readonly contractVersion: number;
  readonly input: unknown;
}

export type ValidatedAction =
  | { readonly kind: "message"; readonly text: string }
  | {
      readonly kind: "tool-call";
      readonly callId: string;
      readonly capabilityId: string;
      readonly contractVersion: number;
      readonly input: unknown;
      readonly requiresApproval: boolean;
    }
  | {
      readonly kind: "finish-request";
      readonly reason: "completed" | "failed" | "cancelled";
      readonly text: string | null;
      readonly completionCheckRequired: true;
    };

export interface DecisionRejection {
  readonly callId: string | null;
  readonly code:
    | "invalid-decision"
    | "invalid-action"
    | "duplicate-call-id"
    | "capability-not-exposed"
    | "contract-version-mismatch"
    | "invalid-input"
    | "too-many-calls"
    | "run-not-active";
  readonly message: string;
}

export interface RequiredUserInput {
  readonly kind: "approval";
  readonly callId: string;
  readonly capabilityId: string;
}

export interface ValidatedActions {
  readonly acceptedActions: readonly ValidatedAction[];
  readonly rejectedActions: readonly DecisionRejection[];
  readonly requiredUserInput: readonly RequiredUserInput[];
}
