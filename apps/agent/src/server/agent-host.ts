import { createAgentSession, createAgentPluginProvider, DEFAULT_DEEPSEEK_CONFIGURATION, parseAgentModelConfiguration, type AgentSession, type AgentModelConfiguration, type AgentToolRegistry } from "@brilliant-guitar/agent-runtime";
import { createPiDecisionPlugin } from "@brilliant-guitar/agent-runtime/pi";
import { createHostPiStreamFn } from "@brilliant-guitar/agent-runtime/pi/openai-stream";
import { isAgentProviderCredentialSecret } from "@brilliant-guitar/agent-runtime/contracts/agent-provider-credential";
import type { AgentDecisionProviderPort } from "@brilliant-guitar/agent-runtime/runtime/provider";
import type { StandaloneAgentSnapshot } from "../contracts/host.ts";
import { createCompletionsModel, createCompletionsModelHost } from "./model-host.ts";
import { matchesModelConnection, parseModelCatalogRequest, type AgentModelCatalog } from "../contracts/model-catalog.ts";
import { fetchModelCatalog } from "./model-catalog.ts";
import { defaultConnectionSettings, isConnectionId, parseSaveConnectionRequest } from "../contracts/connection-settings.ts";
import { parseStoredConnectionSettings, publicConnectionSettings, type StoredConnectionSettings, type StoredConnectionProfile, type ConnectionSettingsStorePort } from "./connection-store.ts";
import { WindowsCredentialProtector, type CredentialProtectorPort } from "./credential-protector.ts";

interface HostOptions { readonly tools?: AgentToolRegistry; readonly settingsStore?: ConnectionSettingsStorePort; readonly credentialProtector?: CredentialProtectorPort }

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
  #settings: StoredConnectionSettings = { ...defaultConnectionSettings(), profiles: defaultConnectionSettings().profiles.map(({ credentialRemembered: _remembered, ...profile }) => ({ ...profile, sealedCredential: null })) };
  #storageNotice: string | null = null;
  #pendingChange: Promise<void> | null = null;
  readonly #settingsStore: ConnectionSettingsStorePort | null;
  readonly #credentialProtector: CredentialProtectorPort;
  readonly #keys = new Map<string, string>();
  readonly #catalogRequests = new Set<AbortController>();
  readonly session: AgentSession;
  readonly #listeners = new Set<(snapshot: StandaloneAgentSnapshot) => void>();
  readonly #provider: AgentDecisionProviderPort;
  readonly #unsubscribe: () => void;

  constructor(options: HostOptions = {}) {
    this.#settingsStore = options.settingsStore ?? null;
    this.#credentialProtector = options.credentialProtector ?? new WindowsCredentialProtector();
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

  static async open(options: HostOptions = {}): Promise<StandaloneAgentHost> {
    const host = new StandaloneAgentHost(options);
    try {
      const loaded = await options.settingsStore?.load();
      if (loaded) host.#settings = parseStoredConnectionSettings(loaded);
      const profile = host.#selected();
      const restored = await host.#restoreKey(profile);
      host.#configuration = profile.configuration; host.#apiKey = restored.key; host.#storageNotice = restored.notice;
      if (restored.key) host.#keys.set(profile.id, restored.key);
      return host;
    } catch (error) { await host.dispose(); throw error; }
  }

  getSnapshot(): StandaloneAgentSnapshot {
    return Object.freeze({ schemaVersion: 2, sequence: this.#sequence, configuration: this.#configuration, credentialPresent: Boolean(this.#apiKey), testingConnection: this.#testing !== null, session: this.session.getSnapshot(),
      connections: publicConnectionSettings(this.#settings), storage: Object.freeze({ configuration: this.#settingsStore?.kind ?? "memory", credentialProtection: this.#settingsStore?.kind === "file" ? this.#credentialProtector.kind : "unavailable", notice: this.#storageNotice }) });
  }

  subscribe(listener: (snapshot: StandaloneAgentSnapshot) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  async configure(value: unknown): Promise<void> {
    const configuration = parseAgentModelConfiguration(value);
    const selected = this.#selected();
    await this.saveProfile({ profileId: selected.id, name: selected.name, configuration, rememberCredential: matchesModelConnection(configuration, selected.configuration) && selected.sealedCredential !== null });
  }

  async saveCredential(value: unknown): Promise<void> {
    if (!isAgentProviderCredentialSecret(value)) throw new AgentHostError("invalid-input", "密钥为空或格式无效");
    const selected = this.#selected();
    await this.saveProfile({ profileId: selected.id, name: selected.name, configuration: selected.configuration, apiKey: value, rememberCredential: selected.sealedCredential !== null });
  }

  async saveProfile(value: unknown): Promise<void> {
    const request = parseSaveConnectionRequest(value);
    await this.#change(async () => {
      const old = request.profileId === null ? null : this.#settings.profiles.find((profile) => profile.id === request.profileId);
      if (request.profileId !== null && !old) throw new AgentHostError("invalid-input", "连接不存在，请重新选择");
      if (!old && this.#settings.profiles.length >= 20) throw new AgentHostError("invalid-input", "最多保存20个连接");
      const id = old?.id ?? crypto.randomUUID();
      const sameTarget = old !== null && old !== undefined && matchesModelConnection(old.configuration, request.configuration);
      const restored = request.apiKey ? { key: request.apiKey, notice: null } : sameTarget && old ? await this.#restoreKey(old) : { key: "", notice: null };
      const profile: StoredConnectionProfile = { id, name: request.name, configuration: request.configuration, recentModels: [...new Set([request.configuration.modelId, ...(sameTarget ? old?.recentModels ?? [] : [])])].slice(0, 5), sealedCredential: null };
      let sealedCredential: string | null = null;
      if (request.rememberCredential) {
        if (this.#settingsStore?.kind !== "file" || this.#credentialProtector.kind === "unavailable") throw new AgentHostError("invalid-input", "当前宿主不支持记住密钥，请取消该选项");
        if (!restored.key) throw new AgentHostError("invalid-input", "请填写密钥后再选择记住密钥");
        sealedCredential = sameTarget && old?.sealedCredential && !request.apiKey ? old.sealedCredential : await this.#credentialProtector.protect(restored.key, credentialContext(profile));
      }
      const next = parseStoredConnectionSettings({ schemaVersion: 1, selectedProfileId: id, profiles: old ? this.#settings.profiles.map((item) => item.id === id ? { ...profile, sealedCredential } : item) : [...this.#settings.profiles, { ...profile, sealedCredential }] });
      await this.#install(next, restored, id !== this.#settings.selectedProfileId || !matchesModelConnection(request.configuration, this.#configuration));
    });
  }

  async selectProfile(value: unknown): Promise<void> {
    await this.#change(async () => {
      const profile = isConnectionId(value) ? this.#settings.profiles.find((item) => item.id === value) : null;
      if (!profile) throw new AgentHostError("invalid-input", "连接不存在，请重新选择");
      if (profile.id === this.#settings.selectedProfileId) return;
      await this.#install({ ...this.#settings, selectedProfileId: profile.id }, await this.#restoreKey(profile), true);
    });
  }

  async deleteProfile(value: unknown): Promise<void> {
    await this.#change(async () => {
      if (!isConnectionId(value) || !this.#settings.profiles.some((item) => item.id === value)) throw new AgentHostError("invalid-input", "连接不存在，请重新选择");
      if (this.#settings.profiles.length === 1) throw new AgentHostError("invalid-input", "至少保留一个连接");
      const profiles = this.#settings.profiles.filter((item) => item.id !== value);
      const selected = value === this.#settings.selectedProfileId ? profiles[0]! : this.#selected();
      await this.#install({ schemaVersion: 1, selectedProfileId: selected.id, profiles }, await this.#restoreKey(selected), value === this.#settings.selectedProfileId);
      this.#keys.delete(value);
    });
  }

  async setEnabled(enabled: boolean): Promise<void> {
    this.#assertAvailable();
    if (this.#changing) throw new AgentHostError("busy", "配置正在保存，请稍后再启用Agent");
    if (enabled && !this.#apiKey) throw new AgentHostError("invalid-input", "请先保存模型配置和密钥");
    if (!enabled) this.#abortCatalogs();
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

  async discoverModels(value: unknown, signal?: AbortSignal): Promise<AgentModelCatalog> {
    this.#assertIdle();
    const request = parseModelCatalogRequest(value);
    const apiKey = request.apiKey ?? (matchesModelConnection(request.connection, this.#configuration) ? this.#apiKey : "");
    if (!apiKey) throw new AgentHostError("invalid-input", "请填写当前服务的 API Key，再获取模型。");
    const controller = new AbortController();
    this.#catalogRequests.add(controller);
    try {
      return await fetchModelCatalog(request.connection, apiKey, { signal: signal ? AbortSignal.any([controller.signal, signal]) : controller.signal });
    } finally { this.#catalogRequests.delete(controller); }
  }

  submit(message: string): void {
    this.#assertIdle();
    if (!this.session.getSnapshot().enabled) throw new AgentHostError("not-enabled", "请先启用 Agent");
    void this.session.submit(message).catch(() => undefined);
  }

  async cancel(): Promise<void> {
    this.#abortCatalogs();
    await Promise.all([this.session.cancel(), this.#testing?.cancel()]);
  }

  async reset(): Promise<void> {
    this.#assertAvailable();
    if (this.#changing) throw new AgentHostError("busy", "配置正在保存，请稍后再新建会话");
    this.#changing = true;
    try { await this.cancel(); await this.session.reset(); }
    finally { this.#changing = false; }
  }

  async dispose(): Promise<void> {
    this.#disposed = true;
    await this.#pendingChange?.catch(() => undefined);
    this.#abortCatalogs();
    await this.#testing?.dispose();
    await this.session.dispose();
    this.#apiKey = "";
    this.#keys.clear();
    await this.#settingsStore?.dispose?.();
    this.#unsubscribe();
    this.#listeners.clear();
  }

  #selected(): StoredConnectionProfile { return this.#settings.profiles.find((profile) => profile.id === this.#settings.selectedProfileId)!; }
  async #restoreKey(profile: StoredConnectionProfile): Promise<{ key: string; notice: string | null }> {
    const memory = this.#keys.get(profile.id);
    if (memory) return { key: memory, notice: null };
    if (!profile.sealedCredential) return { key: "", notice: null };
    try { return { key: await this.#credentialProtector.unprotect(profile.sealedCredential, credentialContext(profile)), notice: null }; }
    catch { return { key: "", notice: "已保存的密钥无法在当前用户下恢复，请重新填写或取消记住密钥。" }; }
  }
  async #install(next: StoredConnectionSettings, restored: { key: string; notice: string | null }, disable: boolean): Promise<void> {
    this.#assertAvailable();
    await this.#settingsStore?.save(next);
    this.#assertAvailable();
    if (disable) await this.session.setEnabled(false);
    this.#settings = next; this.#configuration = this.#selected().configuration; this.#apiKey = restored.key; this.#storageNotice = restored.notice;
    if (restored.key) this.#keys.set(next.selectedProfileId, restored.key); else this.#keys.delete(next.selectedProfileId);
    this.#publish();
  }
  async #change(operation: () => Promise<void>): Promise<void> {
    this.#assertIdle(); this.#changing = true; this.#abortCatalogs();
    const pending = Promise.resolve().then(operation); this.#pendingChange = pending;
    try { await pending; } finally { this.#pendingChange = null; this.#changing = false; }
  }

  #assertIdle(): void {
    this.#assertAvailable();
    if (this.#changing || ["running", "cancelling"].includes(this.session.getSnapshot().status) || this.#testing) throw new AgentHostError("busy", "请先停止当前任务，再修改配置或发送消息");
  }

  #abortCatalogs(): void {
    for (const controller of this.#catalogRequests) controller.abort();
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

function credentialContext(profile: StoredConnectionProfile): string {
  const target = profile.configuration;
  return `brilliant-agent-credential:v1:${profile.id}\n${target.providerId}\n${target.protocol}\n${target.baseUrl}`;
}
