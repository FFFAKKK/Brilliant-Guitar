import { isTauri } from "@tauri-apps/api/core";

import type { AgentRunRecord } from "./run-controller.ts";
import type { AgentRunRecoveryResult } from "./recovery-coordinator.ts";
import { AgentRecoveryCoordinator, AgentRecoveryResumeError } from "./recovery-coordinator.ts";
import type { AgentRecoveryProjection } from "./recovery-projection.ts";
import { projectRecovery } from "./recovery-projection.ts";
import { TauriAgentRunStore } from "./tauri-agent-run-store.ts";
import { TauriAgentInvocationReceiptPort } from "./tauri-invocation-receipt.ts";

export type AgentRecoverySessionStatus = "unavailable" | "idle" | "loading" | "ready" | "error";

export interface AgentRecoverySessionSnapshot {
  readonly status: AgentRecoverySessionStatus;
  readonly items: readonly AgentRecoveryProjection[];
  readonly message: string;
}

export interface AgentRecoveryCoordinatorPort {
  recoverAll(): Promise<readonly AgentRunRecoveryResult[]>;
  resume(runId: string): Promise<AgentRunRecord>;
}

const unavailableSnapshot = (message: string): AgentRecoverySessionSnapshot => Object.freeze({
  status: "unavailable",
  items: Object.freeze([]),
  message,
});

function resumeErrorMessage(error: unknown): string {
  if (error instanceof AgentRecoveryResumeError) {
    if (error.code === "run-missing") return "恢复项已经失效，请重新检查";
    if (error.code === "run-not-recovering") return "这个 Agent Run 当前不再等待恢复";
    return "能力调用结果尚未核对，已阻止继续";
  }
  return error instanceof Error && error.message ? error.message : "无法准备继续 Agent";
}

/** Application boundary between deterministic recovery control and UI projections. */
export class AgentRecoverySession {
  readonly #coordinator: AgentRecoveryCoordinatorPort | null;
  readonly #listeners = new Set<() => void>();
  readonly #claimedRunIds = new Set<string>();
  #snapshot: AgentRecoverySessionSnapshot;
  #operation: Promise<unknown> | null = null;

  constructor(
    coordinator: AgentRecoveryCoordinatorPort | null,
    unavailableMessage = "Agent 恢复功能仅在桌面宿主中可用",
  ) {
    this.#coordinator = coordinator;
    this.#snapshot = coordinator === null
      ? unavailableSnapshot(unavailableMessage)
      : Object.freeze({ status: "idle", items: Object.freeze([]), message: "尚未检查可恢复的 Agent Run" });
  }

  getSnapshot = (): AgentRecoverySessionSnapshot => this.#snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  refresh = async (): Promise<void> => {
    if (this.#coordinator === null || this.#operation !== null) return;
    this.#publish({ ...this.#snapshot, status: "loading", message: "正在核对 Agent 恢复状态" });
    const operation = this.#coordinator.recoverAll()
      .then((results) => {
        const items = results.map(projectRecovery)
          .filter((item) => !this.#claimedRunIds.has(item.runId));
        this.#publish({
          status: "ready",
          items,
          message: items.length === 0
            ? "没有需要处理的 Agent 恢复任务"
            : `有 ${items.length} 个 Agent Run 需要处理`,
        });
      })
      .catch((error: unknown) => {
        this.#publish({
          ...this.#snapshot,
          status: "error",
          message: error instanceof Error && error.message ? error.message : "无法读取 Agent 恢复状态",
        });
      })
      .finally(() => { this.#operation = null; });
    this.#operation = operation;
    await operation;
  };

  resume = async (runId: string): Promise<boolean> => {
    if (this.#coordinator === null || this.#operation !== null) return false;
    const item = this.#snapshot.items.find((candidate) => candidate.runId === runId);
    if (item?.action !== "resume") {
      this.#publish({ ...this.#snapshot, status: "error", message: "这个恢复项当前不能准备继续" });
      return false;
    }

    this.#publish({ ...this.#snapshot, status: "loading", message: "正在恢复 Agent 控制状态" });
    let resumed = false;
    const operation = this.#coordinator.resume(runId)
      .then(() => {
        resumed = true;
        this.#claimedRunIds.add(runId);
        this.#publish({
          status: "ready",
          items: this.#snapshot.items.filter((candidate) => candidate.runId !== runId),
          message: "控制状态已恢复，等待 Agent 执行器接管",
        });
      })
      .catch((error: unknown) => {
        this.#publish({ ...this.#snapshot, status: "error", message: resumeErrorMessage(error) });
      })
      .finally(() => { this.#operation = null; });
    this.#operation = operation;
    await operation;
    return resumed;
  };

  #publish(snapshot: AgentRecoverySessionSnapshot): void {
    this.#snapshot = Object.freeze({ ...snapshot, items: Object.freeze([...snapshot.items]) });
    for (const listener of this.#listeners) listener();
  }
}

export function createAgentRecoverySession(): AgentRecoverySession {
  if (!isTauri()) return new AgentRecoverySession(null);
  return new AgentRecoverySession(new AgentRecoveryCoordinator({
    store: new TauriAgentRunStore(),
    receipts: new TauriAgentInvocationReceiptPort(),
  }));
}
