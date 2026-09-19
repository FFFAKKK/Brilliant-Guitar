import { isTauri } from "@tauri-apps/api/core";

import type { AgentRecoverySessionSnapshot } from "./agent-recovery-session.ts";
import { createAgentRecoverySession } from "./agent-recovery-session.ts";
import type { AgentProviderSelection } from "../contracts/agent-provider-settings.ts";
import { isAgentProviderSelection, sameAgentProviderSelection } from "../contracts/agent-provider-settings.ts";
import { createConfiguredAgentProviderSession } from "./agent-provider-catalog.ts";
import type { AgentProviderRuntimeSnapshot, AgentProviderSessionPort } from "./provider-contract.ts";
import { UNCONFIGURED_AGENT_PROVIDER } from "./provider-contract.ts";
import { createStaticAgentProviderSession } from "./provider-session.ts";
import type { AgentProviderHostPort } from "./provider-host.ts";
import type { AgentProviderPort } from "./provider.ts";

export type { AgentProviderRuntimeSnapshot, AgentProviderRuntimeStatus } from "./provider-contract.ts";

export type AgentPluginRuntimeStatus =
  | "disabled"
  | "unavailable"
  | "configuring"
  | "ready"
  | "running"
  | "recovering"
  | "error";

export interface AgentPluginRuntimeSnapshot {
  readonly enabled: boolean;
  readonly status: AgentPluginRuntimeStatus;
  readonly provider: AgentProviderRuntimeSnapshot;
  readonly recovery: AgentRecoverySessionSnapshot;
  readonly canStartRun: boolean;
  readonly message: string;
}

export interface AgentRecoverySessionPort {
  getSnapshot(): AgentRecoverySessionSnapshot;
  subscribe(listener: () => void): () => void;
  refresh(): Promise<void>;
  resume(runId: string): Promise<boolean>;
}

export interface AgentPluginRunLease {
  readonly provider: AgentProviderPort;
  readonly signal: AbortSignal;
  cancel(): void;
  release(): void;
}

export interface AgentPluginRuntimeDependencies {
  readonly hostAvailable: boolean;
  readonly createRecoverySession: () => AgentRecoverySessionPort;
  readonly createProviderSession?: (selection: AgentProviderSelection | null) => AgentProviderSessionPort;
  readonly providerHost?: AgentProviderHostPort;
}

const EMPTY_RECOVERY: AgentRecoverySessionSnapshot = Object.freeze({
  status: "idle",
  items: Object.freeze([]),
  message: "Agent 插件未启用",
});

function disabledSnapshot(provider: AgentProviderRuntimeSnapshot): AgentPluginRuntimeSnapshot {
  return Object.freeze({
    enabled: false,
    status: "disabled",
    provider,
    recovery: EMPTY_RECOVERY,
    canStartRun: false,
    message: "Agent 插件已关闭",
  });
}

/** Owns lazy Agent services. UI activation follows this snapshot, not module installation. */
export class AgentPluginRuntime {
  readonly #hostAvailable: boolean;
  readonly #createRecoverySession: () => AgentRecoverySessionPort;
  readonly #createProviderSession: (selection: AgentProviderSelection | null) => AgentProviderSessionPort;
  readonly #listeners = new Set<() => void>();
  #provider: AgentProviderSessionPort | null = null;
  #unsubscribeProvider: (() => void) | null = null;
  #recovery: AgentRecoverySessionPort | null = null;
  #unsubscribeRecovery: (() => void) | null = null;
  #snapshot: AgentPluginRuntimeSnapshot;
  #providerSelection: AgentProviderSelection | null = null;
  #activeRun: Readonly<{ token: symbol; controller: AbortController }> | null = null;
  #generation = 0;

  constructor(dependencies: AgentPluginRuntimeDependencies) {
    this.#hostAvailable = dependencies.hostAvailable;
    this.#createRecoverySession = dependencies.createRecoverySession;
    this.#createProviderSession = dependencies.createProviderSession
      ?? ((selection) => createConfiguredAgentProviderSession(selection, dependencies.providerHost));
    this.#snapshot = disabledSnapshot(UNCONFIGURED_AGENT_PROVIDER);
  }

  getSnapshot = (): AgentPluginRuntimeSnapshot => this.#snapshot;

  getProvider = (): AgentProviderPort | null => this.#provider?.getProvider() ?? null;

  beginRun = (): AgentPluginRunLease | null => {
    if (!this.#snapshot.canStartRun || this.#activeRun !== null) return null;
    const provider = this.getProvider();
    if (provider === null) return null;
    return this.#createRunLease(provider);
  };

  beginContinuation = (runId: string, requestId: string): AgentPluginRunLease | null => {
    if (!this.#snapshot.enabled || this.#activeRun !== null) return null;
    const continuation = this.#snapshot.recovery.items.find((item) => item.runId === runId);
    if (continuation?.action !== "provide-input"
      || continuation.requiredInput?.requestId !== requestId
      || !continuation.isBlocking) return null;
    const provider = this.getProvider();
    if (provider === null) return null;
    return this.#createRunLease(provider);
  };

  #createRunLease(provider: AgentProviderPort): AgentPluginRunLease {
    const token = Symbol("agent-run");
    const controller = new AbortController();
    this.#activeRun = { token, controller };
    this.#syncRuntime();
    let released = false;
    return Object.freeze({
      provider,
      signal: controller.signal,
      cancel: () => controller.abort(),
      release: () => {
        if (released) return;
        released = true;
        if (this.#activeRun?.token !== token) return;
        this.#activeRun = null;
        if (this.#snapshot.enabled) this.#syncRuntime();
      },
    });
  }

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  setProviderSelection = async (selection: AgentProviderSelection | null): Promise<void> => {
    if (selection !== null && !isAgentProviderSelection(selection)) {
      throw new Error("Invalid Agent Provider selection");
    }
    if (sameAgentProviderSelection(this.#providerSelection, selection)) return;
    this.#providerSelection = selection === null ? null : { ...selection };
    if (!this.#snapshot.enabled) {
      this.#publish(disabledSnapshot(UNCONFIGURED_AGENT_PROVIDER));
      return;
    }
    if (!this.#hostAvailable || this.#recovery === null) return;
    this.#cancelActiveRun(true);
    await this.#replaceProvider();
  };

  setEnabled = async (enabled: boolean): Promise<void> => {
    if (!enabled) {
      this.#generation += 1;
      const provider = this.#provider?.getSnapshot() ?? UNCONFIGURED_AGENT_PROVIDER;
      this.#cancelActiveRun(true);
      this.#releaseProvider();
      this.#releaseRecovery();
      this.#publish(disabledSnapshot(provider));
      return;
    }
    if (this.#snapshot.enabled && this.#provider !== null && this.#recovery !== null) return;
    if (!this.#hostAvailable) {
      this.#publish({
        enabled: true,
        status: "unavailable",
        provider: UNCONFIGURED_AGENT_PROVIDER,
        recovery: Object.freeze({ status: "unavailable", items: Object.freeze([]),
          message: "Agent 运行时仅在桌面宿主中可用" }),
        canStartRun: false,
        message: "当前宿主无法启动 Agent",
      });
      return;
    }

    const generation = ++this.#generation;
    let provider: AgentProviderSessionPort | null = null;
    let recovery: AgentRecoverySessionPort | null = null;
    let unsubscribeProvider: (() => void) | null = null;
    let unsubscribeRecovery: (() => void) | null = null;
    try {
      provider = this.#createProviderSession(this.#providerSelection);
      recovery = this.#createRecoverySession();
      unsubscribeProvider = provider.subscribe(() => {
        if (this.#provider === provider) this.#syncRuntime();
      });
      unsubscribeRecovery = recovery.subscribe(() => {
        if (this.#recovery === recovery) this.#syncRuntime();
      });
    } catch (error) {
      unsubscribeProvider?.();
      unsubscribeRecovery?.();
      provider?.dispose();
      this.#publish({
        enabled: true,
        status: "error",
        provider: provider?.getSnapshot() ?? UNCONFIGURED_AGENT_PROVIDER,
        recovery: EMPTY_RECOVERY,
        canStartRun: false,
        message: error instanceof Error && error.message ? error.message : "无法初始化 Agent 运行时",
      });
      return;
    }
    this.#provider = provider;
    this.#recovery = recovery;
    this.#unsubscribeProvider = unsubscribeProvider;
    this.#unsubscribeRecovery = unsubscribeRecovery;
    this.#syncRuntime();
    await Promise.allSettled([provider.refresh(), recovery.refresh()]);
    if (generation === this.#generation) this.#syncRuntime();
  };

  refresh = async (): Promise<void> => {
    await Promise.allSettled([
      this.#provider?.refresh() ?? Promise.resolve(),
      this.#recovery?.refresh() ?? Promise.resolve(),
    ]);
    if (this.#snapshot.enabled) this.#syncRuntime();
  };

  resume = async (runId: string): Promise<boolean> => {
    return this.#recovery?.resume(runId) ?? false;
  };

  dispose(): void {
    this.#generation += 1;
    this.#cancelActiveRun(true);
    this.#releaseProvider();
    this.#releaseRecovery();
    this.#listeners.clear();
  }

  async #replaceProvider(): Promise<void> {
    const generation = ++this.#generation;
    let provider: AgentProviderSessionPort | null = null;
    let unsubscribeProvider: (() => void) | null = null;
    try {
      provider = this.#createProviderSession(this.#providerSelection);
      unsubscribeProvider = provider.subscribe(() => {
        if (this.#provider === provider) this.#syncRuntime();
      });
    } catch (error) {
      unsubscribeProvider?.();
      provider?.dispose();
      provider = createStaticAgentProviderSession({
        status: "error",
        providerId: this.#providerSelection?.providerId ?? null,
        model: this.#providerSelection?.modelId ?? null,
        message: error instanceof Error && error.message ? error.message : "无法初始化模型 Provider",
      });
      unsubscribeProvider = provider.subscribe(() => {
        if (this.#provider === provider) this.#syncRuntime();
      });
    }
    this.#releaseProvider();
    this.#provider = provider;
    this.#unsubscribeProvider = unsubscribeProvider;
    this.#syncRuntime();
    try {
      await provider.refresh();
    } catch (error) {
      if (generation !== this.#generation || this.#provider !== provider) return;
      this.#releaseProvider();
      provider = createStaticAgentProviderSession({
        status: "error",
        providerId: this.#providerSelection?.providerId ?? null,
        model: this.#providerSelection?.modelId ?? null,
        message: error instanceof Error && error.message ? error.message : "无法刷新模型 Provider 状态",
      });
      this.#provider = provider;
      this.#unsubscribeProvider = provider.subscribe(() => {
        if (this.#provider === provider) this.#syncRuntime();
      });
    }
    if (generation === this.#generation && this.#provider === provider) this.#syncRuntime();
  }

  #syncRuntime(): void {
    const provider = this.#provider?.getSnapshot() ?? UNCONFIGURED_AGENT_PROVIDER;
    const providerPort = this.#provider?.getProvider() ?? null;
    const recovery = this.#recovery?.getSnapshot() ?? EMPTY_RECOVERY;
    let status: AgentPluginRuntimeStatus;
    let message: string;
    if (this.#activeRun !== null) {
      status = "running";
      message = "Agent 正在处理任务";
    } else if (recovery.status === "unavailable") {
      status = "unavailable";
      message = recovery.message;
    } else if (recovery.status === "error") {
      status = "error";
      message = recovery.message;
    } else if (recovery.status === "loading" || recovery.items.length > 0) {
      status = "recovering";
      message = recovery.message;
    } else if (provider.status === "ready" && providerPort !== null) {
      status = "ready";
      message = "Agent 已就绪";
    } else if (provider.status === "ready") {
      status = "error";
      message = "模型 Provider 状态与执行端口不一致";
    } else if (provider.status === "unavailable") {
      status = "unavailable";
      message = provider.message;
    } else if (provider.status === "error") {
      status = "error";
      message = provider.message;
    } else {
      status = "configuring";
      message = provider.message;
    }
    this.#publish({
      enabled: true,
      status,
      provider,
      recovery,
      canStartRun: status === "ready" && providerPort !== null
        && recovery.items.every((item) => !item.isBlocking),
      message,
    });
  }

  #cancelActiveRun(release: boolean): void {
    this.#activeRun?.controller.abort();
    if (release) this.#activeRun = null;
  }

  #releaseProvider(): void {
    this.#unsubscribeProvider?.();
    this.#unsubscribeProvider = null;
    this.#provider?.dispose();
    this.#provider = null;
  }

  #releaseRecovery(): void {
    this.#unsubscribeRecovery?.();
    this.#unsubscribeRecovery = null;
    this.#recovery = null;
  }

  #publish(snapshot: AgentPluginRuntimeSnapshot): void {
    this.#snapshot = Object.freeze(snapshot);
    for (const listener of this.#listeners) listener();
  }
}

export function createAgentPluginRuntime(providerHost: AgentProviderHostPort): AgentPluginRuntime {
  return new AgentPluginRuntime({
    hostAvailable: isTauri(),
    providerHost,
    createRecoverySession: createAgentRecoverySession,
  });
}
