import { AgentRunController, type AgentRunOutcome } from "../runtime/run-controller.ts";
import { InMemoryAgentRunStore, type AgentRunStorePort } from "../runtime/agent-store.ts";
import type { AgentDecisionProviderPort } from "../runtime/provider.ts";
import type { AgentContextBudget, AgentContextItem } from "../runtime/agent-contracts.ts";
import type { AgentRunProgressEvent } from "../runtime/run-progress.ts";
import { AgentToolRegistry } from "./tool-registry.ts";

export interface AgentChatMessage {
  readonly id: string;
  readonly runId: string;
  readonly role: "user" | "assistant";
  readonly content: string;
  readonly status: "complete" | "streaming" | "failed" | "cancelled";
}

export interface AgentSessionSnapshot {
  readonly sessionId: string;
  readonly sequence: number;
  readonly enabled: boolean;
  readonly status: "idle" | "running" | "cancelling" | "completed" | "failed" | "cancelled" | "disabled";
  readonly runId: string | null;
  readonly messages: readonly AgentChatMessage[];
  readonly message: string;
  readonly omittedHistoryTurns: number;
}

export interface AgentSessionEvent {
  readonly type: "snapshot";
  readonly snapshot: AgentSessionSnapshot;
}

export interface AgentSessionOptions {
  readonly provider: AgentDecisionProviderPort;
  readonly tools?: AgentToolRegistry;
  readonly store?: AgentRunStorePort;
  readonly budget?: Partial<AgentContextBudget>;
}

interface HistoryTurn { readonly runId: string; readonly user: string; readonly assistant: string }

/** Headless conversation composition over the same Controller used by product hosts. */
export class AgentSession {
  readonly #controller: AgentRunController;
  readonly #tools: AgentToolRegistry;
  readonly #budget: AgentContextBudget;
  readonly #listeners = new Set<(event: AgentSessionEvent) => void>();
  #history: HistoryTurn[] = [];
  #generation = 0;
  #disposed = false;
  #resetting = false;
  #changingEnabled = false;
  #active: { abort: AbortController; done: Promise<AgentRunOutcome> } | null = null;
  #snapshot: AgentSessionSnapshot = Object.freeze({ sessionId: crypto.randomUUID(), sequence: 0, enabled: false, status: "disabled", runId: null, messages: Object.freeze([]), message: "请先配置模型并启用 Agent", omittedHistoryTurns: 0 });

  constructor(options: AgentSessionOptions) {
    this.#tools = options.tools ?? new AgentToolRegistry();
    this.#budget = Object.freeze({ tokenBudget: 8192, itemCountBudget: 64, toolResultSizeBudget: 16384, rangeBudget: 0, historyTurnBudget: 16, ...options.budget });
    if (!Number.isSafeInteger(this.#budget.historyTurnBudget) || this.#budget.historyTurnBudget < 1 || this.#budget.historyTurnBudget > 64) throw new Error("会话历史预算需在 1 到 64 轮之间");
    this.#controller = new AgentRunController({
      provider: options.provider, capabilities: this.#tools, catalog: this.#tools.catalog,
      store: options.store ?? new InMemoryAgentRunStore({ retainedTerminalRuns: 32 }),
      completionVerifier: ({ responseText, invocations }) => ({
        satisfied: Boolean(responseText?.trim()) && invocations.every((item) => item.state.status === "succeeded"),
        reason: "普通对话回复及已请求工具结果校验", evidence: invocations.map((item) => item.invocationId),
      }),
    });
  }

  getSnapshot(): AgentSessionSnapshot { return this.#snapshot; }

  subscribe(listener: (event: AgentSessionEvent) => void): () => void {
    if (this.#disposed) throw new Error("Agent session is disposed");
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  async setEnabled(enabled: boolean): Promise<void> {
    this.#assertAvailable();
    if (enabled === this.#snapshot.enabled) return;
    this.#changingEnabled = true;
    try {
      if (!enabled) {
        // Revoke new submissions before awaiting cancellation of the current run.
        this.#publish({ enabled: false });
        await this.cancel();
      }
      this.#publish({ enabled, status: enabled ? "idle" : "disabled", message: enabled ? "可以开始对话" : "Agent 已停用" });
    } finally { this.#changingEnabled = false; }
  }

  submit(message: string): Promise<AgentRunOutcome> {
    this.#assertAvailable();
    if (!this.#snapshot.enabled) throw new Error("请先启用 Agent");
    if (this.#active) throw new Error("当前对话仍在运行，请先停止");
    const goal = message.trim();
    if (!goal || Math.ceil(JSON.stringify(goal).length / 4) + 256 > this.#budget.tokenBudget) throw new Error("消息为空或超过当前上下文预算");
    const generation = this.#generation;
    const runId = crypto.randomUUID();
    const assistantId = crypto.randomUUID();
    const contextItems = this.#historyContext(goal);
    const messages: AgentChatMessage[] = [
      ...(this.#budget.historyTurnBudget > 1 ? this.#snapshot.messages.slice(-(this.#budget.historyTurnBudget * 2 - 2)) : []),
      { id: crypto.randomUUID(), runId, role: "user", content: goal, status: "complete" },
      { id: assistantId, runId, role: "assistant", content: "", status: "streaming" },
    ];
    const abort = new AbortController();
    // Reserve before publishing: synchronous observers cannot submit a second run.
    let resolve!: (outcome: AgentRunOutcome) => void;
    let reject!: (error: unknown) => void;
    const done = new Promise<AgentRunOutcome>((yes, no) => { resolve = yes; reject = no; });
    this.#active = { abort, done };
    this.#publish({ status: "running", runId, messages, message: "正在思考", omittedHistoryTurns: this.#history.length - contextItems.length });
    const catalog = this.#tools.catalog.filter((item) => !item.requiresDocument && (item.kind === "query" || item.kind === "analysis"));
    void this.#controller.run({
      runId, goal, workspace: { workspaceId: this.#snapshot.sessionId, documentId: null, documentVersion: null, selection: null },
      intent: { kind: "analyze", requestedCapabilityIds: catalog.map((item) => item.id), scope: "none" },
      policy: { policyVersion: 1, allowedCapabilityIds: catalog.map((item) => item.id), allowedKinds: catalog.length ? ["query", "analysis"] : [], maxToolsPerTurn: 4, maxCostClass: "constant", approvalMode: "disallow" },
      budget: this.#budget, initialContextItems: contextItems, maxTurns: 16,
    }, abort.signal, (event) => {
      if (generation === this.#generation && !this.#disposed && this.#active?.abort === abort) this.#progress(assistantId, event);
    }).then((outcome) => {
      if (generation === this.#generation && !this.#disposed) {
        const completed = outcome.run.state.lifecycle === "terminal" && outcome.run.state.terminalReason === "completed";
        const cancelled = outcome.run.state.lifecycle === "terminal" && outcome.run.state.terminalReason === "cancelled";
        const content = outcome.response ?? this.#snapshot.messages.find((item) => item.id === assistantId)?.content ?? "";
        if (completed) {
          this.#history.push({ runId, user: goal, assistant: content });
          this.#history = this.#history.slice(-this.#budget.historyTurnBudget);
        }
        this.#publish({ messages: this.#snapshot.messages.map((item) => item.id === assistantId ? { ...item, content, status: completed ? "complete" : cancelled ? "cancelled" : "failed" } : item),
          status: completed ? "completed" : cancelled ? "cancelled" : "failed", message: completed ? "回复完成" : cancelled ? "已停止" : "本次请求未完成，请检查配置或重试" });
        this.#active = null;
      }
      resolve(outcome);
    }, () => {
      if (generation === this.#generation && !this.#disposed) {
        this.#publish({ messages: this.#snapshot.messages.map((item) => item.id === assistantId ? { ...item, content: "", status: "failed" } : item), status: "failed", message: "Agent 请求失败" });
        this.#active = null;
      }
      reject(new Error("Agent 请求失败"));
    });
    return done;
  }

  async cancel(): Promise<void> {
    const active = this.#active;
    if (!active) return;
    this.#publish({ status: "cancelling", message: "正在停止" });
    active.abort.abort();
    await active.done.catch(() => undefined);
    if (this.#active === active) this.#active = null;
  }

  async reset(): Promise<void> {
    this.#assertAvailable();
    this.#resetting = true;
    ++this.#generation;
    try {
      await this.cancel();
      this.#history = [];
      this.#publish({ sessionId: crypto.randomUUID(), runId: null, messages: [], status: this.#snapshot.enabled ? "idle" : "disabled", message: "已开始新会话", omittedHistoryTurns: 0 });
    } finally { this.#resetting = false; }
  }

  async dispose(): Promise<void> {
    if (this.#disposed) return;
    this.#disposed = true;
    ++this.#generation;
    await this.cancel();
    this.#history = [];
    this.#listeners.clear();
  }

  #assertAvailable(): void {
    if (this.#disposed) throw new Error("Agent session is disposed");
    if (this.#resetting) throw new Error("正在开始新会话，请稍后再发送");
    if (this.#changingEnabled) throw new Error("启用状态正在更新，请稍后再发送");
  }

  #historyContext(goal: string): readonly AgentContextItem[] {
    let remaining = this.#budget.tokenBudget - Math.ceil(JSON.stringify(goal).length / 4) - 256;
    const retained: AgentContextItem[] = [];
    for (const turn of [...this.#history].reverse()) {
      const content = { user: turn.user, assistant: turn.assistant };
      const estimatedTokens = Math.ceil(JSON.stringify(content).length / 4);
      if (estimatedTokens > remaining) break;
      remaining -= estimatedTokens;
      retained.unshift({ contextItemId: `conversation:${turn.runId}`, kind: "task-history", content, sourceType: "conversation", sourceId: turn.runId, documentId: null, documentVersion: null, scope: this.#snapshot.sessionId, trustLevel: "user-provided", priority: "high", createdAt: Date.now(), expiresAt: null, estimatedTokens });
    }
    return retained;
  }

  #progress(id: string, event: AgentRunProgressEvent): void {
    if (event.type === "message.text-delta") {
      const previous = this.#snapshot.messages.find((item) => item.id === id)?.content ?? "";
      this.#updateMessage(id, previous + event.delta, "streaming");
    } else if (event.type === "message.started") {
      this.#updateMessage(id, "", "streaming");
    } else if (event.type === "activity.started") {
      this.#publish({ message: event.label });
    }
  }

  #updateMessage(id: string, content: string, status: AgentChatMessage["status"]): void {
    this.#publish({ messages: this.#snapshot.messages.map((item) => item.id === id ? { ...item, content, status } : item) });
  }

  #publish(update: Partial<AgentSessionSnapshot>): void {
    this.#snapshot = Object.freeze({ ...this.#snapshot, ...update, sequence: this.#snapshot.sequence + 1, messages: Object.freeze((update.messages ?? this.#snapshot.messages).map((item) => Object.freeze({ ...item }))) });
    for (const listener of this.#listeners) {
      try { listener(Object.freeze({ type: "snapshot", snapshot: this.#snapshot })); } catch { /* Observers cannot change execution. */ }
    }
  }
}

export function createAgentSession(options: AgentSessionOptions): AgentSession { return new AgentSession(options); }
