import type {
  CapabilityResult,
  CapabilityTransportRequest,
} from "../contracts/capability.ts";
import type {
  AgentCapabilityDescriptor,
  AgentContextBudget,
  AgentContextItem,
  AgentRequiredUserInput,
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
import type { AgentRunStorePort } from "./agent-store.ts";
import { publishAgentRunProgress } from "./run-progress.ts";
import type { AgentProgressActivityKind, AgentRunProgressObserver } from "./run-progress.ts";
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

export function getAgentRunRequiredInput(run: AgentRunRecord): AgentRequiredUserInput | null {
  if (run.state.lifecycle !== "waiting" || run.state.waitReason !== "user-input") return null;
  for (let index = run.events.length - 1; index >= 0; index -= 1) {
    const event = run.events[index]?.event;
    if (event?.type === "user-input.required") {
      return event.input;
    }
    if (event?.type === "run.resumed") return null;
  }
  return null;
}

export type AgentRunResumeErrorCode = "run-mismatch" | "run-not-plannable" | "workspace-mismatch";

export class AgentRunResumeError extends Error {
  readonly code: AgentRunResumeErrorCode;

  constructor(code: AgentRunResumeErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export interface AgentRunControllerDependencies {
  readonly provider: AgentProviderPort;
  readonly capabilities: AgentCapabilityPort;
  readonly catalog: readonly AgentCapabilityDescriptor[];
  readonly completionVerifier: AgentCompletionVerifier;
  readonly store?: AgentRunStorePort;
  readonly now?: () => number;
  readonly nextId?: (kind: "event" | "turn" | "invocation" | "user-input") => string;
  readonly reportProgressError?: (error: unknown) => void;
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
  private readonly store: AgentRunStorePort | null;
  private readonly now: () => number;
  private readonly nextId: (kind: "event" | "turn" | "invocation" | "user-input") => string;
  private readonly reportProgressError: ((error: unknown) => void) | null;
  private readonly contextBuilder = new ContextBuilder();
  private readonly toolsetResolver = new ToolsetResolver();

  constructor(dependencies: AgentRunControllerDependencies) {
    this.provider = dependencies.provider;
    this.capabilities = dependencies.capabilities;
    this.catalog = dependencies.catalog;
    this.completionVerifier = dependencies.completionVerifier;
    this.store = dependencies.store ?? null;
    this.now = dependencies.now ?? (() => Date.now());
    this.nextId = dependencies.nextId ?? (() => crypto.randomUUID());
    this.reportProgressError = dependencies.reportProgressError ?? null;
  }

  async run(
    request: AgentRunRequest,
    signal: AbortSignal | null = null,
    observer: AgentRunProgressObserver | null = null,
  ): Promise<AgentRunOutcome> {
    return this.execute(request, signal, null, observer);
  }

  private async execute(
    request: AgentRunRequest,
    signal: AbortSignal | null = null,
    resumeFrom: AgentRunRecord | null = null,
    observer: AgentRunProgressObserver | null = null,
  ): Promise<AgentRunOutcome> {
    if (resumeFrom !== null && resumeFrom.runId !== request.runId) {
      throw new AgentRunResumeError(
        "run-mismatch",
        "Agent Run request does not match the persisted Run",
      );
    }
    const resumesRequiredInput = resumeFrom !== null
      && resumeFrom.state.lifecycle === "waiting"
      && resumeFrom.state.phase === "planning"
      && getAgentRunRequiredInput(resumeFrom) !== null;
    if (resumeFrom !== null
      && !resumesRequiredInput
      && (resumeFrom.state.lifecycle !== "active" || resumeFrom.state.phase !== "planning")) {
      throw new AgentRunResumeError(
        "run-not-plannable",
        "Persisted Agent Run must be plannable before Controller resume",
      );
    }
    if (resumeFrom !== null
      && (resumeFrom.workspace.workspaceId !== request.workspace.workspaceId
        || resumeFrom.workspace.documentId !== request.workspace.documentId)) {
      throw new AgentRunResumeError(
        "workspace-mismatch",
        "Agent Run cannot continue in a different workspace or document",
      );
    }

    const createdAt = resumeFrom?.createdAt ?? this.now();
    const events: AgentRunEventRecord[] = [...(resumeFrom?.events ?? [])];
    const turns: AgentTurnRecord[] = [...(resumeFrom?.turns ?? [])];
    const invocations: AgentInvocationRecord[] = [...(resumeFrom?.invocations ?? [])];
    const contextItems: AgentContextItem[] = [
      ...(resumeFrom?.contextItems ?? request.initialContextItems),
    ];
    let workspace = resumeFrom === null
      ? request.workspace
      : resumesRequiredInput
        ? request.workspace
        : resumeFrom.workspace;
    let state: AgentRunState | null = resumeFrom?.state ?? null;
    let persistedSequence = resumeFrom?.events.at(-1)?.sequence ?? 0;
    const goal = resumeFrom?.goal ?? request.goal;
    const policy = resumeFrom?.policy ?? request.policy;
    const intent = resumeFrom?.intent ?? request.intent;
    const publish = (event: Parameters<AgentRunProgressObserver>[0]): void => {
      publishAgentRunProgress(observer, event, this.reportProgressError);
    };

    // A crash can happen after the Invocation result is durable but before its
    // compact Context projection is appended. Rebuild only that missing
    // projection from the persisted result; never dispatch the Capability again.
    for (const invocation of invocations) {
      if (invocation.state.status !== "succeeded" || invocation.result?.status !== "completed") {
        continue;
      }
      if (!contextItems.some((item) => item.contextItemId === `capability-result:${invocation.invocationId}`)) {
        const identity = documentIdentity(invocation.result.data);
        const descriptor = this.catalog.find((item) => item.id === invocation.capabilityId);
        contextItems.push({
          contextItemId: `capability-result:${invocation.invocationId}`,
          kind: "capability-result",
          content: invocation.result.data,
          sourceType: "capability-result",
          sourceId: invocation.capabilityId,
          documentId: identity.documentId,
          documentVersion: identity.documentVersion,
          scope: descriptor?.scopeLimit ?? "none",
          trustLevel: "authoritative",
          priority: "high",
          createdAt: invocation.events.at(-1)?.occurredAt ?? createdAt,
          expiresAt: null,
          estimatedTokens: estimateTokens(invocation.result.data),
        });
      }
      const identity = documentIdentity(invocation.result.data);
      if (!resumesRequiredInput
        && identity.documentId !== null
        && identity.documentVersion !== null) {
        workspace = {
          ...workspace,
          documentId: identity.documentId,
          documentVersion: identity.documentVersion,
        };
      }
    }

    const currentState = (): AgentRunState => {
      if (state === null) throw new Error("Agent Run has not been created");
      return state;
    };
    const currentRun = (): AgentRunRecord => ({
      runId: request.runId,
      workspace,
      goal,
      state: currentState(),
      createdAt,
      policy,
      intent,
      events: [...events],
      turns: [...turns],
      invocations: [...invocations],
      contextItems: [...contextItems],
    });
    const upsertInvocation = (invocation: AgentInvocationRecord): void => {
      const index = invocations.findIndex((item) => item.invocationId === invocation.invocationId);
      if (index < 0) invocations.push(invocation);
      else invocations[index] = invocation;
    };
    const upsertTurn = (turn: AgentTurnRecord): void => {
      const index = turns.findIndex((item) => item.turnId === turn.turnId);
      if (index < 0) turns.push(turn);
      else turns[index] = turn;
    };
    const applyRunEvent = async (event: AgentRunEvent): Promise<void> => {
      const transition = reduceAgentRunState(state, event);
      if (!transition.accepted) throw new Error(transition.message);
      state = transition.state;
      const eventRecord: AgentRunEventRecord = {
        eventId: this.nextId("event"),
        runId: request.runId,
        sequence: events.length + 1,
        occurredAt: this.now(),
        event,
      };
      events.push(eventRecord);
      if (this.store === null) return;
      const result = await this.store.commit({
        runId: request.runId,
        expectedSequence: persistedSequence,
        event: eventRecord,
        nextRun: currentRun(),
      });
      if (result.status === "committed") {
        persistedSequence = result.entry.lastSequence;
        return;
      }
      if (result.status === "sequence-conflict") {
        throw new Error(`Agent Run store sequence conflict at ${result.currentSequence}`);
      }
      throw new Error(`Agent Run store rejected event: ${result.code}`);
    };
    const outcome = (
      response: string | null,
      verification: AgentCompletionVerification | null,
    ): AgentRunOutcome => ({
      run: currentRun(),
      response,
      verification,
    });

    if (resumeFrom === null) {
      await applyRunEvent({ type: "run.created" });
      await applyRunEvent({ type: "run.prepared" });
    } else if (resumesRequiredInput) {
      await applyRunEvent({ type: "run.resumed" });
    }

    const completedTurnCount = events.filter(
      (event) => event.event.type === "verification.continue",
    ).length;
    const startTurnIndex = Math.max(turns.length, completedTurnCount);
    for (let turnIndex = startTurnIndex; turnIndex < request.maxTurns; turnIndex += 1) {
      if (signal?.aborted) {
        await applyRunEvent({ type: "cancellation.requested" });
        return outcome(null, null);
      }

      const turnId = this.nextId("turn");
      const context = this.contextBuilder.build({
        runId: request.runId,
        goal,
        turnInput: turnIndex === 0 ? goal : null,
        runState: currentState(),
        workspace,
        items: contextItems,
        budget: request.budget,
        now: this.now(),
      });
      const toolset = this.toolsetResolver.resolve({
        runState: currentState(),
        policy,
        intent,
        hasDocument: workspace.documentId !== null,
        rangeBudget: request.budget.rangeBudget,
        catalog: this.catalog,
      });

      let decision: unknown;
      let messageStarted = false;
      let streamedText = "";
      const planningActivityId = `planning:${turnId}`;
      publish({
        type: "activity.started",
        runId: request.runId,
        turnId,
        activityId: planningActivityId,
        kind: "planning",
        label: "正在规划下一步",
      });
      try {
        decision = await waitForEffect(this.provider.decide({
          runId: request.runId,
          turnId,
          goal,
          runState: currentState(),
          context,
          toolset: toolset.snapshot,
        }, signal, (event) => {
          if (event.type !== "response.text-delta") return;
          if (!messageStarted) {
            messageStarted = true;
            publish({ type: "message.started", runId: request.runId, turnId });
          }
          streamedText += event.delta;
          publish({
            type: "message.text-delta",
            runId: request.runId,
            turnId,
            delta: event.delta,
          });
        }), signal);
      } catch (error) {
        const cancelled = error instanceof AgentRunCancelled;
        publish(cancelled
          ? { type: "activity.cancelled", runId: request.runId, turnId, activityId: planningActivityId }
          : {
              type: "activity.failed",
              runId: request.runId,
              turnId,
              activityId: planningActivityId,
              code: "provider-failed",
            });
        if (messageStarted) publish(cancelled
          ? { type: "message.cancelled", runId: request.runId, turnId }
          : { type: "message.failed", runId: request.runId, turnId, code: "provider-failed" });
        upsertTurn({
          turnId,
          status: cancelled ? "waiting" : "failed",
          context,
          toolset: toolset.snapshot,
          decision: null,
          validation: null,
        });
        if (cancelled) {
          await applyRunEvent({ type: "cancellation.requested" });
          return outcome(null, null);
        }
        await applyRunEvent({ type: "run.failed", code: "provider-failed" });
        return outcome(null, null);
      }
      publish({
        type: "activity.completed",
        runId: request.runId,
        turnId,
        activityId: planningActivityId,
      });

      const validation = validateDecision(decision, toolset, currentState());
      if (validation.rejectedActions.length > 0 || validation.acceptedActions.length === 0) {
        if (messageStarted) publish({
          type: "message.failed",
          runId: request.runId,
          turnId,
          code: "invalid-decision",
        });
        upsertTurn({
          turnId,
          status: "failed",
          context,
          toolset: toolset.snapshot,
          decision,
          validation,
        });
        await applyRunEvent({ type: "run.failed", code: "invalid-decision" });
        return outcome(null, null);
      }

      const message = validation.acceptedActions.find((action) => action.kind === "message");
      if (message?.kind === "message") {
        if (!messageStarted) publish({ type: "message.started", runId: request.runId, turnId });
        publish({
          type: "message.completed",
          runId: request.runId,
          turnId,
          content: message.text,
        });
        upsertTurn({
          turnId,
          status: "waiting",
          context,
          toolset: toolset.snapshot,
          decision,
          validation,
        });
        await applyRunEvent({ type: "turn.message-produced" });
        return outcome(message.text, null);
      }

      const finish = validation.acceptedActions.find((action) => action.kind === "finish-request");
      if (finish?.kind === "finish-request") {
        if (finish.reason !== "completed") {
          if (messageStarted) publish({
            type: "message.failed",
            runId: request.runId,
            turnId,
            code: "completion-rejected",
          });
          upsertTurn({
            turnId,
            status: "failed",
            context,
            toolset: toolset.snapshot,
            decision,
            validation,
          });
          await applyRunEvent({ type: "turn.finish-requested" });
          await applyRunEvent({ type: "run.failed", code: "completion-rejected" });
          return outcome(finish.text, null);
        }
        const verificationActivityId = `verification:${turnId}`;
        publish({
          type: "activity.started",
          runId: request.runId,
          turnId,
          activityId: verificationActivityId,
          kind: "validating",
          label: "正在验证任务结果",
        });
        let verification: AgentCompletionVerification;
        try {
          verification = this.completionVerifier({ goal, contextItems, invocations });
          publish({
            type: "activity.completed",
            runId: request.runId,
            turnId,
            activityId: verificationActivityId,
          });
        } catch (error) {
          publish({
            type: "activity.failed",
            runId: request.runId,
            turnId,
            activityId: verificationActivityId,
            code: "completion-verifier-failed",
          });
          throw error;
        }
        upsertTurn({
          turnId,
          status: "completed",
          context,
          toolset: toolset.snapshot,
          decision,
          validation,
        });
        await applyRunEvent({ type: "turn.finish-requested" });
        if (verification.satisfied) {
          const content = finish.text ?? streamedText;
          if (content.length > 0 || messageStarted) {
            if (!messageStarted) publish({ type: "message.started", runId: request.runId, turnId });
            publish({ type: "message.completed", runId: request.runId, turnId, content });
          }
          await applyRunEvent({ type: "verification.completed" });
          return outcome(finish.text, verification);
        }
        if (messageStarted) publish({
          type: "message.failed",
          runId: request.runId,
          turnId,
          code: "completion-not-satisfied",
        });
        await applyRunEvent({ type: "verification.continue" });
        continue;
      }

      const toolActions = validation.acceptedActions.filter(
        (action): action is ToolCallAction => action.kind === "tool-call",
      );
      if (messageStarted) publish({
        type: "message.completed",
        runId: request.runId,
        turnId,
        content: streamedText,
      });
      upsertTurn({
        turnId,
        status: "waiting",
        context,
        toolset: toolset.snapshot,
        decision,
        validation,
      });
      await applyRunEvent({ type: "turn.tools-accepted" });

      if (validation.requiredUserInput.length > 0) {
        for (const action of toolActions) {
          invocations.push(this.createPendingInvocation(request, turnId, workspace, action));
        }
        await applyRunEvent({ type: "approval.required" });
        return outcome(null, null);
      }

      for (const action of toolActions) {
        if (signal?.aborted) {
          await applyRunEvent({ type: "cancellation.requested" });
          await applyRunEvent({ type: "cancellation.confirmed" });
          return outcome(null, null);
        }

        const invocationId = this.nextId("invocation");
        const descriptor = this.catalog.find((item) => item.id === action.capabilityId);
        const activityKind: AgentProgressActivityKind = descriptor?.kind === "query"
          ? "reading"
          : "executing";
        publish({
          type: "activity.started",
          runId: request.runId,
          turnId,
          activityId: `capability:${invocationId}`,
          kind: activityKind,
          label: descriptor?.name ?? action.capabilityId,
        });
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
        upsertInvocation(invocationRecord());
        await applyRunEvent({
          type: "invocation.dispatched",
          invocationId,
          capabilityId: action.capabilityId,
        });

        const capabilityRequest: CapabilityTransportRequest = {
          invocationId,
          capabilityId: action.capabilityId,
          contractVersion: action.contractVersion,
          workspaceId: workspace.workspaceId,
          input: action.input,
        };
        try {
          result = await waitForEffect(this.capabilities.invoke(capabilityRequest, {
            workspace,
            rangeBudget: request.budget.rangeBudget,
          }), signal);
        } catch (error) {
          const cancelled = error instanceof AgentRunCancelled;
          const definiteFailure = error instanceof AgentCapabilityPortError
            && error.outcome === "definite-failure";
          publish(cancelled
            ? {
                type: "activity.cancelled",
                runId: request.runId,
                turnId,
                activityId: `capability:${invocationId}`,
              }
            : {
                type: "activity.failed",
                runId: request.runId,
                turnId,
                activityId: `capability:${invocationId}`,
                code: definiteFailure ? "capability-failed" : "capability-outcome-unknown",
              });
          applyInvocationEvent({
            type: definiteFailure ? "invocation.failed" : "invocation.outcome-unknown",
          });
          upsertInvocation(invocationRecord());
          upsertTurn({
            turnId,
            status: definiteFailure ? "failed" : "waiting",
            context,
            toolset: toolset.snapshot,
            decision,
            validation,
          });
          await applyRunEvent({
            type: "invocation.outcome-recorded",
            invocationId,
            status: definiteFailure ? "failed" : "outcome-unknown",
          });
          if (cancelled) {
            await applyRunEvent({ type: "cancellation.requested" });
          } else if (definiteFailure) {
            await applyRunEvent({ type: "run.failed", code: "capability-failed" });
          } else {
            await applyRunEvent({
              type: "run.recovery-required",
              reason: "capability-outcome-unknown",
            });
          }
          return outcome(null, null);
        }

        if (result.status !== "completed") {
          const waitsForSelection = result.status === "rejected"
            && result.code === "selection-unavailable"
            && workspace.documentId !== null
            && request.budget.rangeBudget >= 1;
          publish(waitsForSelection
            ? {
                type: "activity.waiting",
                runId: request.runId,
                turnId,
                activityId: `capability:${invocationId}`,
                code: result.code,
              }
            : {
                type: "activity.failed",
                runId: request.runId,
                turnId,
                activityId: `capability:${invocationId}`,
                code: result.status === "rejected" ? "capability-rejected" : "capability-failed",
              });
          applyInvocationEvent({
            type: result.status === "rejected" ? "invocation.rejected" : "invocation.failed",
          });
          upsertInvocation(invocationRecord());
          upsertTurn({
            turnId,
            status: waitsForSelection ? "waiting" : "failed",
            context,
            toolset: toolset.snapshot,
            decision,
            validation,
          });
          await applyRunEvent({
            type: "invocation.outcome-recorded",
            invocationId,
            status: result.status === "rejected" ? "rejected" : "failed",
          });
          if (waitsForSelection && workspace.documentId !== null) {
            await applyRunEvent({
              type: "user-input.required",
              input: {
                requestId: this.nextId("user-input"),
                kind: "measure-selection",
                prompt: "请在当前乐谱中选择要读取的小节",
                sourceInvocationId: invocationId,
                constraints: {
                  documentId: workspace.documentId,
                  minMeasures: 1,
                  maxMeasures: request.budget.rangeBudget,
                },
              },
            });
            return outcome(null, null);
          }
          await applyRunEvent({ type: "run.failed", code: "capability-failed" });
          return outcome(null, null);
        }

        applyInvocationEvent({ type: "invocation.succeeded" });
        publish({
          type: "activity.completed",
          runId: request.runId,
          turnId,
          activityId: `capability:${invocationId}`,
        });
        upsertInvocation(invocationRecord());
        await applyRunEvent({
          type: "invocation.outcome-recorded",
          invocationId,
          status: "completed",
        });
        const identity = documentIdentity(result.data);
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

      upsertTurn({
        turnId,
        status: "completed",
        context,
        toolset: toolset.snapshot,
        decision,
        validation,
      });
      await applyRunEvent({ type: "invocations.completed" });
      await applyRunEvent({ type: "verification.continue" });
    }

    await applyRunEvent({ type: "run.failed", code: "budget-exceeded" });
    return outcome(null, null);
  }

  async resume(
    request: AgentRunRequest,
    storedRun: AgentRunRecord,
    signal: AbortSignal | null = null,
    observer: AgentRunProgressObserver | null = null,
  ): Promise<AgentRunOutcome> {
    return this.execute(request, signal, storedRun, observer);
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
