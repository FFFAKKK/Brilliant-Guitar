import { createAgentSession, createAgentPluginProvider, DEFAULT_DEEPSEEK_CONFIGURATION, parseAgentModelConfiguration, type AgentSession, type AgentModelConfiguration, type AgentToolRegistry } from "@brilliant-guitar/agent-runtime";
import { createPiDecisionPlugin } from "@brilliant-guitar/agent-runtime/pi";
import { createHostPiStreamFn } from "@brilliant-guitar/agent-runtime/pi/openai-stream";
import { isAgentProviderCredentialSecret } from "@brilliant-guitar/agent-runtime/contracts/agent-provider-credential";
import type { AgentDecisionProviderPort } from "@brilliant-guitar/agent-runtime/runtime/provider";
import type { StandaloneAgentSnapshot } from "../contracts/host.ts";
import { createCompletionsModel, createCompletionsModelHost } from "./model-host.ts";

export class AgentHostError extends Error {
  readonly code: "busy" | "not-enabled" | "invalid-input" | "disposed";
  constructor(code: AgentHostError["code"], message: string) { super(message); this.code = code; }
}

export class StandaloneAgentHost {
  #configuration: AgentModelConfiguration = DEFAULT_DEEPSEEK_CONFIGURATION;
  #apiKey = "";
  #sequence = 0;
  #testing: AgentSession | null = null;
  #changing = false;
  #disposed = false;
  readonly session: AgentSession;
  readonly #listeners = new Set<(snapshot: StandaloneAgentSnapshot) => void>();
  readonly #provider: AgentDecisionProviderPort;
  readonly #unsubscribe: () => void;

  constructor(options: { readonly tools?: AgentToolRegistry } = {}) {
    this.#provider = { decide: async (request, signal, observer) => {
      if (!this.#apiKey) throw new Error("模型凭据未配置");
      const configuration = this.#configuration;
      const host = createCompletionsModelHost(configuration, this.#apiKey);
      const model = createCompletionsModel(configuration);
      const plugin = createPiDecisionPlugin({ id: "brilliant.pi", version: "0.1.0", label: "Pi", model,
        streamFn: createHostPiStreamFn(host, request, { providerId: configuration.providerId, modelId: configuration.modelId }, model) });
      return createAgentPluginProvider(plugin).decide(request, signal, observer);
    } };
    this.session = createAgentSession({ provider: this.#provider, ...(options.tools ? { tools: options.tools } : {}) });
    this.#unsubscribe = this.session.subscribe(() => this.#publish());
  }

  getSnapshot(): StandaloneAgentSnapshot {
    return Object.freeze({ schemaVersion: 1, sequence: this.#sequence, configuration: this.#configuration, credentialPresent: Boolean(this.#apiKey), testingConnection: this.#testing !== null, session: this.session.getSnapshot() });
  }

  subscribe(listener: (snapshot: StandaloneAgentSnapshot) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  async configure(value: unknown): Promise<void> {
    this.#assertIdle();
    const configuration = parseAgentModelConfiguration(value);
    const targetChanged = configuration.baseUrl !== this.#configuration.baseUrl || configuration.providerId !== this.#configuration.providerId;
    this.#changing = true;
    try {
      this.#configuration = configuration;
      if (targetChanged) { this.#apiKey = ""; await this.session.setEnabled(false); }
      this.#publish();
    } finally { this.#changing = false; }
  }

  saveCredential(value: unknown): void {
    this.#assertIdle();
    if (!isAgentProviderCredentialSecret(value)) throw new AgentHostError("invalid-input", "密钥为空或格式无效");
    this.#apiKey = value;
    this.#publish();
  }

  async setEnabled(enabled: boolean): Promise<void> {
    this.#assertAvailable();
    if (enabled && !this.#apiKey) throw new AgentHostError("invalid-input", "请先保存模型配置和密钥");
    if (!enabled && this.#testing) await this.#testing.cancel();
    await this.session.setEnabled(enabled);
  }

  async testConnection(): Promise<boolean> {
    this.#assertIdle();
    if (!this.session.getSnapshot().enabled || !this.#apiKey) throw new AgentHostError("not-enabled", "请先启用 Agent");
    const probe = createAgentSession({ provider: this.#provider });
    this.#testing = probe;
    this.#publish();
    try {
      await probe.setEnabled(true);
      const outcome = await probe.submit("请只回复：连接成功。");
      return outcome.run.state.lifecycle === "terminal" && outcome.run.state.terminalReason === "completed";
    } finally {
      await probe.dispose();
      this.#testing = null;
      this.#publish();
    }
  }

  submit(message: string): void {
    this.#assertIdle();
    if (!this.session.getSnapshot().enabled) throw new AgentHostError("not-enabled", "请先启用 Agent");
    void this.session.submit(message).catch(() => undefined);
  }

  async cancel(): Promise<void> {
    await Promise.all([this.session.cancel(), this.#testing?.cancel()]);
  }

  async reset(): Promise<void> {
    this.#assertAvailable();
    this.#changing = true;
    try { await this.cancel(); await this.session.reset(); }
    finally { this.#changing = false; }
  }

  async dispose(): Promise<void> {
    this.#disposed = true;
    await this.#testing?.dispose();
    await this.session.dispose();
    this.#apiKey = "";
    this.#unsubscribe();
    this.#listeners.clear();
  }

  #assertIdle(): void {
    this.#assertAvailable();
    if (this.#changing || ["running", "cancelling"].includes(this.session.getSnapshot().status) || this.#testing) throw new AgentHostError("busy", "请先停止当前任务，再修改配置或发送消息");
  }

  #assertAvailable(): void {
    if (this.#disposed) throw new AgentHostError("disposed", "Agent 宿主已退出");
  }

  #publish(): void {
    ++this.#sequence;
    const snapshot = this.getSnapshot();
    for (const listener of this.#listeners) { try { listener(snapshot); } catch { /* Read-only observers. */ } }
  }
}
