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
  | "task-history"
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

export interface AgentMeasureSelection {
  readonly kind: "measure-range";
  readonly documentId: string;
  readonly documentVersion: number;
  readonly startMeasureId: string;
  readonly endMeasureId: string;
}

export function isAgentMeasureSelection(value: unknown): value is AgentMeasureSelection {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return candidate.kind === "measure-range"
    && typeof candidate.documentId === "string"
    && candidate.documentId.length > 0
    && Number.isSafeInteger(candidate.documentVersion)
    && (candidate.documentVersion as number) >= 0
    && typeof candidate.startMeasureId === "string"
    && candidate.startMeasureId.length > 0
    && typeof candidate.endMeasureId === "string"
    && candidate.endMeasureId.length > 0;
}

export interface AgentMeasureSelectionRequiredInput {
  readonly requestId: string;
  readonly kind: "measure-selection";
  readonly prompt: string;
  readonly sourceInvocationId: string;
  readonly constraints: Readonly<{
    documentId: string;
    minMeasures: number;
    maxMeasures: number;
  }>;
}

export type AgentRequiredUserInput = AgentMeasureSelectionRequiredInput;

export interface AgentMeasureSelectionProvidedInput {
  readonly requestId: string;
  readonly kind: "measure-selection";
  readonly selection: AgentMeasureSelection;
}

export type AgentProvidedUserInput = AgentMeasureSelectionProvidedInput;

export function isAgentRequiredUserInput(value: unknown): value is AgentRequiredUserInput {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  if (candidate.kind !== "measure-selection"
    || typeof candidate.requestId !== "string"
    || candidate.requestId.length === 0
    || typeof candidate.prompt !== "string"
    || candidate.prompt.length === 0
    || typeof candidate.sourceInvocationId !== "string"
    || candidate.sourceInvocationId.length === 0
    || typeof candidate.constraints !== "object"
    || candidate.constraints === null
    || Array.isArray(candidate.constraints)) return false;
  const constraints = candidate.constraints as Record<string, unknown>;
  return typeof constraints.documentId === "string"
    && constraints.documentId.length > 0
    && Number.isSafeInteger(constraints.minMeasures)
    && (constraints.minMeasures as number) > 0
    && Number.isSafeInteger(constraints.maxMeasures)
    && (constraints.maxMeasures as number) >= (constraints.minMeasures as number);
}

export function isAgentProvidedUserInput(value: unknown): value is AgentProvidedUserInput {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return candidate.kind === "measure-selection"
    && typeof candidate.requestId === "string"
    && candidate.requestId.length > 0
    && isAgentMeasureSelection(candidate.selection);
}

export interface AgentWorkspaceScope {
  readonly workspaceId: string;
  readonly documentId: string | null;
  readonly documentVersion: number | null;
  readonly selection: AgentMeasureSelection | null;
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
  | "history-turn-budget"
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

export type AgentApprovalRiskLevel = "low" | "medium" | "high";

export type AgentCapabilityApprovalRequirement = "risk-based" | "always";

export type AgentApprovalPolicyMode = "disallow" | "risk-based" | "always";

export interface AgentApprovalPolicySnapshot {
  readonly policyVersion: number;
  readonly mode: AgentApprovalPolicyMode;
  readonly capabilityRequirement: AgentCapabilityApprovalRequirement;
  readonly decision: "require-approval";
}

export interface AgentApprovalScope {
  readonly workspaceId: string;
  readonly documentId: string | null;
  readonly documentVersion: number | null;
  readonly limit: CapabilityScope;
}

export interface AgentFieldChangeApprovalPreview {
  readonly kind: "field-change";
  readonly field: string;
  readonly before: string | null;
  readonly after: string;
}

export interface AgentChangeListApprovalPreview {
  readonly kind: "change-list";
  readonly changes: readonly AgentFieldChangeApprovalPreview[];
}

export type AgentApprovalPreview = AgentFieldChangeApprovalPreview | AgentChangeListApprovalPreview;

export interface AgentRequiredApprovalItem {
  readonly invocationId: string;
  readonly capabilityId: string;
  readonly capabilityName: string;
  readonly contractVersion: number;
  readonly summary: string;
  readonly preview?: AgentApprovalPreview | null;
  readonly changeSetId?: string | null;
  readonly riskLevel: AgentApprovalRiskLevel;
  readonly riskReasons: readonly string[];
  readonly policy: AgentApprovalPolicySnapshot;
  readonly scope: AgentApprovalScope;
  readonly sideEffects: CapabilitySideEffects;
}

export interface AgentRequiredApproval {
  readonly approvalId: string;
  readonly kind: "capability-execution";
  readonly prompt: string;
  readonly items: readonly AgentRequiredApprovalItem[];
}

export interface AgentApprovalDecision {
  readonly approvalId: string;
  readonly kind: "capability-execution";
  readonly outcome: "approved" | "denied";
  readonly decidedBy: "local-user";
}

function hasOnlyApprovalKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === expected.length && keys.every((key) => expected.includes(key));
}

function isCapabilitySideEffects(value: unknown): value is CapabilitySideEffects {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return hasOnlyApprovalKeys(candidate, ["document", "filesystem", "network", "settings", "playback"])
    && ["none", "read", "write"].includes(String(candidate.document))
    && ["none", "read", "write"].includes(String(candidate.filesystem))
    && ["none", "read", "write"].includes(String(candidate.network))
    && ["none", "read", "write"].includes(String(candidate.settings))
    && ["none", "start", "stop"].includes(String(candidate.playback));
}

function isAgentFieldChangeApprovalPreview(value: unknown): value is AgentFieldChangeApprovalPreview {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return hasOnlyApprovalKeys(candidate, ["kind", "field", "before", "after"])
    && candidate.kind === "field-change"
    && typeof candidate.field === "string"
    && /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/u.test(candidate.field)
    && candidate.field.length <= 128
    && (candidate.before === null
      || typeof candidate.before === "string" && candidate.before.length <= 512)
    && typeof candidate.after === "string"
    && candidate.after.length <= 512;
}

export function isAgentApprovalPreview(value: unknown): value is AgentApprovalPreview {
  if (isAgentFieldChangeApprovalPreview(value)) return true;
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  if (!hasOnlyApprovalKeys(candidate, ["kind", "changes"])
    || candidate.kind !== "change-list"
    || !Array.isArray(candidate.changes)
    || candidate.changes.length === 0
    || candidate.changes.length > 8
    || !candidate.changes.every(isAgentFieldChangeApprovalPreview)) return false;
  return new Set(candidate.changes.map((change) => change.field)).size === candidate.changes.length;
}

export function isAgentRequiredApproval(value: unknown): value is AgentRequiredApproval {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  if (!hasOnlyApprovalKeys(candidate, ["approvalId", "kind", "prompt", "items"])
    || typeof candidate.approvalId !== "string"
    || candidate.approvalId.length === 0
    || candidate.kind !== "capability-execution"
    || typeof candidate.prompt !== "string"
    || candidate.prompt.length === 0
    || !Array.isArray(candidate.items)
    || candidate.items.length === 0) return false;

  const invocationIds = new Set<string>();
  for (const valueItem of candidate.items) {
    if (typeof valueItem !== "object" || valueItem === null || Array.isArray(valueItem)) return false;
    const item = valueItem as Record<string, unknown>;
    const scope = item.scope;
    const policy = item.policy;
    const itemKeys = [
      "invocationId",
      "capabilityId",
      "capabilityName",
      "contractVersion",
      "summary",
      "riskLevel",
      "riskReasons",
      "policy",
      "scope",
      "sideEffects",
    ];
    const actualItemKeys = [
      ...itemKeys,
      ...(Object.prototype.hasOwnProperty.call(item, "preview") ? ["preview"] : []),
      ...(Object.prototype.hasOwnProperty.call(item, "changeSetId") ? ["changeSetId"] : []),
    ];
    if (!hasOnlyApprovalKeys(item, actualItemKeys)
      || typeof item.invocationId !== "string"
      || item.invocationId.length === 0
      || invocationIds.has(item.invocationId)
      || typeof item.capabilityId !== "string"
      || item.capabilityId.length === 0
      || typeof item.capabilityName !== "string"
      || item.capabilityName.length === 0
      || !Number.isSafeInteger(item.contractVersion)
      || (item.contractVersion as number) < 1
      || typeof item.summary !== "string"
      || item.summary.length === 0
      || !(item.preview === undefined
        || item.preview === null
        || isAgentApprovalPreview(item.preview))
      || !(item.changeSetId === undefined
        || item.changeSetId === null
        || typeof item.changeSetId === "string"
          && /^sha256:[0-9a-f]{64}$/.test(item.changeSetId))
      || !["low", "medium", "high"].includes(String(item.riskLevel))
      || !Array.isArray(item.riskReasons)
      || item.riskReasons.length === 0
      || !item.riskReasons.every((reason) => typeof reason === "string" && reason.length > 0)
      || typeof policy !== "object"
      || policy === null
      || Array.isArray(policy)
      || typeof scope !== "object"
      || scope === null
      || Array.isArray(scope)
      || !isCapabilitySideEffects(item.sideEffects)) return false;
    const approvalPolicy = policy as Record<string, unknown>;
    if (!hasOnlyApprovalKeys(approvalPolicy, [
      "policyVersion",
      "mode",
      "capabilityRequirement",
      "decision",
    ])
      || !Number.isSafeInteger(approvalPolicy.policyVersion)
      || (approvalPolicy.policyVersion as number) < 1
      || !["disallow", "risk-based", "always"].includes(String(approvalPolicy.mode))
      || !["risk-based", "always"].includes(String(approvalPolicy.capabilityRequirement))
      || approvalPolicy.decision !== "require-approval") return false;
    const approvalScope = scope as Record<string, unknown>;
    const hasNoDocument = approvalScope.documentId === null && approvalScope.documentVersion === null;
    const hasVersionedDocument = typeof approvalScope.documentId === "string"
      && approvalScope.documentId.length > 0
      && Number.isSafeInteger(approvalScope.documentVersion)
      && (approvalScope.documentVersion as number) >= 0;
    if (!hasOnlyApprovalKeys(approvalScope, ["workspaceId", "documentId", "documentVersion", "limit"])
      || typeof approvalScope.workspaceId !== "string"
      || approvalScope.workspaceId.length === 0
      || (!hasNoDocument && !hasVersionedDocument)
      || !["none", "document", "range", "entity"].includes(String(approvalScope.limit))) return false;
    invocationIds.add(item.invocationId);
  }
  return true;
}

export function isAgentApprovalDecision(value: unknown): value is AgentApprovalDecision {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return hasOnlyApprovalKeys(candidate, ["approvalId", "kind", "outcome", "decidedBy"])
    && typeof candidate.approvalId === "string"
    && candidate.approvalId.length > 0
    && candidate.kind === "capability-execution"
    && (candidate.outcome === "approved" || candidate.outcome === "denied")
    && candidate.decidedBy === "local-user";
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
  readonly approvalRequirement: AgentCapabilityApprovalRequirement;
  readonly costClass: CapabilityCostClass;
  readonly allowedPhases: readonly AgentRunPhase[];
  readonly executionMode?: "prepared-change-set";
  readonly validateInput: (input: unknown) => boolean;
  readonly summarizeApproval?: (input: unknown) => string;
  readonly previewApproval?: (input: unknown) => AgentApprovalPreview | null;
  readonly estimateRangeUnits?: (input: unknown) => number | null;
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
  readonly approvalMode: AgentApprovalPolicyMode;
}

export type AgentTaskIntentKind = "read" | "analyze" | "edit" | "playback";

export interface AgentWorkflowIdentity {
  readonly id: string;
  readonly contractVersion: number;
  readonly ownerPluginId: string;
  readonly ownerPluginVersion: string;
}

export interface AgentTaskIntent {
  readonly kind: AgentTaskIntentKind;
  readonly requestedCapabilityIds: readonly string[];
  readonly scope: CapabilityScope;
  /** Absent only for Runs persisted before workflow registration was introduced. */
  readonly workflow?: AgentWorkflowIdentity;
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
  readonly rangeBudget: number;
  readonly rangeEstimators: ReadonlyMap<string, (input: unknown) => number | null>;
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
    | "range-budget-exceeded"
    | "too-many-calls"
    | "run-not-active";
  readonly message: string;
}

export interface AgentApprovalRequirement {
  readonly kind: "approval";
  readonly callId: string;
  readonly capabilityId: string;
}

export interface ValidatedActions {
  readonly acceptedActions: readonly ValidatedAction[];
  readonly rejectedActions: readonly DecisionRejection[];
  readonly approvalRequirements: readonly AgentApprovalRequirement[];
}
