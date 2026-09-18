import type {
  CapabilityResult,
  CapabilityTransportRequest,
} from "../contracts/capability.ts";
import type {
  AgentCapabilityDescriptor,
  AgentContextBudget,
  AgentContextItem,
  AgentRunState,
  AgentTaskIntent,
  AgentWorkspaceScope,
  ContextBuildResult,
  RunPolicySnapshot,
  ToolsetSnapshot,
  ValidatedAction,
  ValidatedActions,
} from "./agent-contracts.ts";
import { AgentCapabilityPortError } from "./capability-port.ts";
import type { AgentCapabilityPort } from "./capability-port.ts";
import type {
  AgentCompletionVerification,
  AgentCompletionVerifier,
} from "./completion-verifier.ts";
import { ContextBuilder } from "./context-builder.ts";
import { validateDecision } from "./decision-validator.ts";
import {
  reduceAgentInvocationState,
} from "./invocation-state.ts";
import type {
  AgentInvocationEvent,
  AgentInvocationEventRecord,
  AgentInvocationState,
} from "./invocation-state.ts";
import type { AgentProviderPort } from "./provider.ts";
import { reduceAgentRunState } from "./run-state.ts";
import type {
  AgentRunEvent,
  AgentRunEventRecord,
} from "./run-state.ts";
import { ToolsetResolver } from "./toolset-resolver.ts";

type ToolCallAction = Extract<ValidatedAction, { readonly kind: "tool-call" }>;

export interface AgentRunRequest {
  readonly runId: string;
  readonly workspace: AgentWorkspaceScope;
  readonly goal: string;
  readonly intent: AgentTaskIntent;
  readonly policy: RunPolicySnapshot;
  readonly budget: AgentContextBudget;
  readonly initialContextItems: readonly AgentContextItem[];
  readonly maxTurns: number;
}

export interface AgentTurnRecord {
  readonly turnId: string;
  readonly status: "completed" | "failed" | "waiting";
  readonly context: ContextBuildResult;
  readonly toolset: ToolsetSnapshot;
  readonly decision: unknown;
  readonly validation: ValidatedActions | null;
}

export interface AgentInvocationRecord {
  readonly invocationId: string;
  readonly runId: string;
  readonly turnId: string;
  readonly capabilityId: string;
  readonly contractVersion: number;
  readonly input: unknown;
  readonly baseDocumentVersion: number | null;
  readonly state: AgentInvocationState;
  readonly result: CapabilityResult<unknown> | null;
  readonly events: readonly AgentInvocationEventRecord[];
}

export interface AgentRunRecord {
  readonly runId: string;
  readonly workspace: AgentWorkspaceScope;
  readonly goal: string;
  readonly state: AgentRunState;
  readonly createdAt: number;
  readonly policy: RunPolicySnapshot;
  readonly intent: AgentTaskIntent;
  readonly events: readonly AgentRunEventRecord[];
  readonly turns: readonly AgentTurnRecord[];
  readonly invocations: readonly AgentInvocationRecord[];
  readonly contextItems: readonly AgentContextItem[];
}

export interface AgentRunOutcome {
  readonly run: AgentRunRecord;
  readonly response: string | null;
  readonly verification: AgentCompletionVerification | null;
}

export interface AgentRunControllerDependencies {
  readonly provider: AgentProviderPort;
  readonly capabilities: AgentCapabilityPort;
  readonly catalog: readonly AgentCapabilityDescriptor[];
  readonly completionVerifier: AgentCompletionVerifier;
  readonly now?: () => number;
  readonly nextId?: (kind: "event" | "turn" | "invocation") => string;
}

function estimateTokens(content: unknown): number {
  try {
    const serialized = JSON.stringify(content);
    return Math.max(1, Math.ceil((serialized?.length ?? 0) / 4));
  } catch {
    return 1;
  }
}

function documentIdentity(data: unknown): { documentId: string | null; documentVersion: number | null } {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return { documentId: null, documentVersion: null };
  }
  const record = data as Record<string, unknown>;
  return {
    documentId: typeof record.documentId === "string" ? record.documentId : null,
    documentVersion: typeof record.documentVersion === "number"
      && Number.isSafeInteger(record.documentVersion) && record.documentVersion >= 0
      ? record.documentVersion : null,
  };
}

class AgentRunCancelled extends Error {}

async function waitForEffect<T>(effect: Promise<T>, signal: AbortSignal | null): Promise<T> {
  if (signal === null) return effect;
  if (signal.aborted) throw new AgentRunCancelled();

  return new Promise<T>((resolve, reject) => {
    const cancel = (): void => reject(new AgentRunCancelled());
    signal.addEventListener("abort", cancel, { once: true });
    effect.then(
      (value) => {
        signal.removeEventListener("abort", cancel);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", cancel);
        reject(error);
      },
    );
  });
}

export class AgentRunController {
  private readonly provider: AgentProviderPort;
  private readonly capabilities: AgentCapabilityPort;
  private readonly catalog: readonly AgentCapabilityDescriptor[];
  private readonly completionVerifier: AgentCompletionVerifier;
  private readonly now: () => number;
  private readonly nextId: (kind: "event" | "turn" | "invocation") => string;
  private readonly contextBuilder = new ContextBuilder();
  private readonly toolsetResolver = new ToolsetResolver();

  constructor(dependencies: AgentRunControllerDependencies) {
    this.provider = dependencies.provider;
    this.capabilities = dependencies.capabilities;
    this.catalog = dependencies.catalog;
    this.completionVerifier = dependencies.completionVerifier;
    this.now = dependencies.now ?? (() => Date.now());
    this.nextId = dependencies.nextId ?? (() => crypto.randomUUID());
  }

  async run(request: AgentRunRequest, signal: AbortSignal | null = null): Promise<AgentRunOutcome> {
    const createdAt = this.now();
    const events: AgentRunEventRecord[] = [];
    const turns: AgentTurnRecord[] = [];
    const invocations: AgentInvocationRecord[] = [];
    const contextItems = [...request.initialContextItems];
    let workspace = request.workspace;
    let state: AgentRunState | null = null;

    const applyRunEvent = (event: AgentRunEvent): void => {
      const transition = reduceAgentRunState(state, event);
      if (!transition.accepted) throw new Error(transition.message);
      state = transition.state;
      events.push({
        eventId: this.nextId("event"),
        runId: request.runId,
        sequence: events.length + 1,
        occurredAt: this.now(),
        event,
      });
    };
    const currentState = (): AgentRunState => {
      if (state === null) throw new Error("Agent Run has not been created");
      return state;
    };
    const outcome = (
      response: string | null,
      verification: AgentCompletionVerification | null,
    ): AgentRunOutcome => ({
      run: {
        runId: request.runId,
        workspace,
        goal: request.goal,
        state: currentState(),
        createdAt,
        policy: request.policy,
        intent: request.intent,
        events: [...events],
        turns: [...turns],
        invocations: [...invocations],
        contextItems: [...contextItems],
      },
      response,
      verification,
    });

    applyRunEvent({ type: "run.created" });
    applyRunEvent({ type: "run.prepared" });

    for (let turnIndex = 0; turnIndex < request.maxTurns; turnIndex += 1) {
      if (signal?.aborted) {
        applyRunEvent({ type: "cancellation.requested" });
        return outcome(null, null);
      }

      const turnId = this.nextId("turn");
      const context = this.contextBuilder.build({
        runId: request.runId,
        goal: request.goal,
        turnInput: turnIndex === 0 ? request.goal : null,
        runState: currentState(),
        workspace,
        items: contextItems,
        budget: request.budget,
        now: this.now(),
      });
      const toolset = this.toolsetResolver.resolve({
        runState: currentState(),
        policy: request.policy,
        intent: request.intent,
        hasDocument: workspace.documentId !== null,
        catalog: this.catalog,
      });

      let decision: unknown;
      try {
        decision = await waitForEffect(this.provider.decide({
          runId: request.runId,
          turnId,
          goal: request.goal,
          runState: currentState(),
          context,
          toolset: toolset.snapshot,
        }), signal);
      } catch (error) {
        turns.push({
          turnId,
          status: error instanceof AgentRunCancelled ? "waiting" : "failed",
          context,
          toolset: toolset.snapshot,
          decision: null,
          validation: null,
        });
        if (error instanceof AgentRunCancelled) {
          applyRunEvent({ type: "cancellation.requested" });
          return outcome(null, null);
        }
        applyRunEvent({ type: "run.failed", code: "provider-failed" });
        return outcome(null, null);
      }

      const validation = validateDecision(decision, toolset, currentState());
      if (validation.rejectedActions.length > 0 || validation.acceptedActions.length === 0) {
        turns.push({
          turnId,
          status: "failed",
          context,
          toolset: toolset.snapshot,
          decision,
          validation,
        });
        applyRunEvent({ type: "run.failed", code: "invalid-decision" });
        return outcome(null, null);
      }

      const message = validation.acceptedActions.find((action) => action.kind === "message");
      if (message?.kind === "message") {
        applyRunEvent({ type: "turn.message-produced" });
        turns.push({
          turnId,
          status: "waiting",
          context,
          toolset: toolset.snapshot,
          decision,
          validation,
        });
        return outcome(message.text, null);
      }

      const finish = validation.acceptedActions.find((action) => action.kind === "finish-request");
      if (finish?.kind === "finish-request") {
        applyRunEvent({ type: "turn.finish-requested" });
        if (finish.reason !== "completed") {
          applyRunEvent({ type: "run.failed", code: "completion-rejected" });
          turns.push({
            turnId,
            status: "failed",
            context,
            toolset: toolset.snapshot,
            decision,
            validation,
          });
          return outcome(finish.text, null);
        }
        const verification = this.completionVerifier({
          goal: request.goal,
          contextItems,
          invocations,
        });
        if (verification.satisfied) {
          applyRunEvent({ type: "verification.completed" });
          turns.push({
            turnId,
            status: "completed",
            context,
            toolset: toolset.snapshot,
            decision,
            validation,
          });
          return outcome(finish.text, verification);
        }
        applyRunEvent({ type: "verification.continue" });
        turns.push({
          turnId,
          status: "completed",
          context,
          toolset: toolset.snapshot,
          decision,
          validation,
        });
        continue;
      }

      const toolActions = validation.acceptedActions.filter(
        (action): action is ToolCallAction => action.kind === "tool-call",
      );
      applyRunEvent({ type: "turn.tools-accepted" });

      if (validation.requiredUserInput.length > 0) {
        for (const action of toolActions) {
          invocations.push(this.createPendingInvocation(request, turnId, workspace, action));
        }
        applyRunEvent({ type: "approval.required" });
        turns.push({
          turnId,
          status: "waiting",
          context,
          toolset: toolset.snapshot,
          decision,
          validation,
        });
        return outcome(null, null);
      }

      for (const action of toolActions) {
        if (signal?.aborted) {
          applyRunEvent({ type: "cancellation.requested" });
          applyRunEvent({ type: "cancellation.confirmed" });
          turns.push({
            turnId,
            status: "waiting",
            context,
            toolset: toolset.snapshot,
            decision,
            validation,
          });
          return outcome(null, null);
        }

        const invocationId = this.nextId("invocation");
        const invocationEvents: AgentInvocationEventRecord[] = [];
        let invocationState: AgentInvocationState | null = null;
        let result: CapabilityResult<unknown> | null = null;
        const applyInvocationEvent = (event: AgentInvocationEvent): void => {
          const transition = reduceAgentInvocationState(invocationState, event);
          if (!transition.accepted) throw new Error(transition.message);
          invocationState = transition.state;
          invocationEvents.push({
            eventId: this.nextId("event"),
            invocationId,
            sequence: invocationEvents.length + 1,
            occurredAt: this.now(),
            event,
          });
        };
        const invocationRecord = (): AgentInvocationRecord => {
          if (invocationState === null) throw new Error("Capability Invocation has not been created");
          return {
            invocationId,
            runId: request.runId,
            turnId,
            capabilityId: action.capabilityId,
            contractVersion: action.contractVersion,
            input: action.input,
            baseDocumentVersion: workspace.documentVersion,
            state: invocationState,
            result,
            events: [...invocationEvents],
          };
        };

        applyInvocationEvent({ type: "invocation.requested" });
        applyInvocationEvent({ type: "invocation.validated" });
        applyInvocationEvent({ type: "invocation.dispatched" });
        applyInvocationEvent({ type: "invocation.started" });

        const capabilityRequest: CapabilityTransportRequest = {
          invocationId,
          capabilityId: action.capabilityId,
          contractVersion: action.contractVersion,
          workspaceId: workspace.workspaceId,
          input: action.input,
        };
        try {
          result = await waitForEffect(this.capabilities.invoke(capabilityRequest), signal);
        } catch (error) {
          const cancelled = error instanceof AgentRunCancelled;
          const definiteFailure = error instanceof AgentCapabilityPortError
            && error.outcome === "definite-failure";
          applyInvocationEvent({
            type: definiteFailure ? "invocation.failed" : "invocation.outcome-unknown",
          });
          invocations.push(invocationRecord());
          turns.push({
            turnId,
            status: definiteFailure ? "failed" : "waiting",
            context,
            toolset: toolset.snapshot,
            decision,
            validation,
          });
          if (cancelled) {
            applyRunEvent({ type: "cancellation.requested" });
          } else if (definiteFailure) {
            applyRunEvent({ type: "run.failed", code: "capability-failed" });
          } else {
            applyRunEvent({
              type: "run.recovery-required",
              reason: "capability-outcome-unknown",
            });
          }
          return outcome(null, null);
        }

        if (result.status !== "completed") {
          applyInvocationEvent({
            type: result.status === "rejected" ? "invocation.rejected" : "invocation.failed",
          });
          invocations.push(invocationRecord());
          turns.push({
            turnId,
            status: "failed",
            context,
            toolset: toolset.snapshot,
            decision,
            validation,
          });
          applyRunEvent({ type: "run.failed", code: "capability-failed" });
          return outcome(null, null);
        }

        applyInvocationEvent({ type: "invocation.succeeded" });
        invocations.push(invocationRecord());
        const identity = documentIdentity(result.data);
        const descriptor = this.catalog.find((item) => item.id === action.capabilityId);
        contextItems.push({
          contextItemId: `capability-result:${invocationId}`,
          kind: "capability-result",
          content: result.data,
          sourceType: "capability-result",
          sourceId: action.capabilityId,
          documentId: identity.documentId,
          documentVersion: identity.documentVersion,
          scope: descriptor?.scopeLimit ?? "none",
          trustLevel: "authoritative",
          priority: "high",
          createdAt: this.now(),
          expiresAt: null,
          estimatedTokens: estimateTokens(result.data),
        });
        if (identity.documentId !== null && identity.documentVersion !== null) {
          workspace = {
            ...workspace,
            documentId: identity.documentId,
            documentVersion: identity.documentVersion,
          };
        }
      }

      applyRunEvent({ type: "invocations.completed" });
      applyRunEvent({ type: "verification.continue" });
      turns.push({
        turnId,
        status: "completed",
        context,
        toolset: toolset.snapshot,
        decision,
        validation,
      });
    }

    applyRunEvent({ type: "run.failed", code: "budget-exceeded" });
    return outcome(null, null);
  }

  private createPendingInvocation(
    request: AgentRunRequest,
    turnId: string,
    workspace: AgentWorkspaceScope,
    action: ToolCallAction,
  ): AgentInvocationRecord {
    const invocationId = this.nextId("invocation");
    const events: AgentInvocationEventRecord[] = [];
    let state: AgentInvocationState | null = null;
    const apply = (event: AgentInvocationEvent): void => {
      const transition = reduceAgentInvocationState(state, event);
      if (!transition.accepted) throw new Error(transition.message);
      state = transition.state;
      events.push({
        eventId: this.nextId("event"),
        invocationId,
        sequence: events.length + 1,
        occurredAt: this.now(),
        event,
      });
    };
    apply({ type: "invocation.requested" });
    apply({ type: "invocation.validated" });
    if (action.requiresApproval) apply({ type: "approval.required" });
    if (state === null) throw new Error("Capability Invocation has not been created");
    return {
      invocationId,
      runId: request.runId,
      turnId,
      capabilityId: action.capabilityId,
      contractVersion: action.contractVersion,
      input: action.input,
      baseDocumentVersion: workspace.documentVersion,
      state,
      result: null,
      events,
    };
  }
}
