import { createAgentSession, createAgentPluginProvider, DEFAULT_DEEPSEEK_CONFIGURATION, parseAgentModelConfiguration, AgentToolRegistry, STANDALONE_CONTEXT_POLICY, type AgentSession, type AgentModelConfiguration, type ContextSelectionReportV1 } from "@brilliant-guitar/agent-runtime";
import { createPiDecisionPlugin } from "@brilliant-guitar/agent-runtime/pi";
import { createHostPiStreamFn } from "@brilliant-guitar/agent-runtime/pi/openai-stream";
import { isAgentProviderCredentialSecret } from "@brilliant-guitar/agent-runtime/contracts/agent-provider-credential";
import type { AgentDecisionProviderPort } from "@brilliant-guitar/agent-runtime/runtime/provider";
import type { AgentModelInputDiagnosticV1 } from "@brilliant-guitar/agent-runtime/contracts/model-input";
import type { StandaloneAgentSnapshot } from "../contracts/host.ts";
import { createCompletionsModel, createCompletionsModelHost } from "./model-host.ts";
import { matchesModelConnection, parseModelCatalogRequest, type AgentModelCatalog } from "../contracts/model-catalog.ts";
import { fetchModelCatalog } from "./model-catalog.ts";
import { defaultConnectionSettings, isConnectionId, parseSaveConnectionRequest } from "../contracts/connection-settings.ts";
import { parseStoredConnectionSettings, publicConnectionSettings, type StoredConnectionSettings, type StoredConnectionProfile, type ConnectionSettingsStorePort } from "./connection-store.ts";
import { WindowsCredentialProtector, type CredentialProtectorPort } from "./credential-protector.ts";
import { MAX_SESSIONS, parseSessionLibrary, parseSessionTitle, isSessionId, type AgentSessionLibrary, type AgentSessionRecord, type SessionStorePort } from "@brilliant-guitar/agent-runtime";
import { SessionStoreError } from "./session-store.ts";
import type { AgentRunProgressEvent } from "@brilliant-guitar/agent-runtime/runtime/run-progress";
import { TextResourceStore, createTextResourceTool } from "./text-resources.ts";
import { parseAddTextResource, parseRemoveTextResource, TEXT_RESOURCE_CAPABILITY_ID } from "../contracts/resources.ts";
import { MAX_TOOL_ACTIVITIES, type ToolActivitiesSnapshot, type ToolActivity } from "../contracts/tool-activities.ts";

interface HostOptions { readonly tools?: AgentToolRegistry; readonly settingsStore?: ConnectionSettingsStorePort; readonly credentialProtector?: CredentialProtectorPort; readonly sessionStore?: SessionStorePort }

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
  #modelInput: AgentModelInputDiagnosticV1 | null = null;
  readonly #resources = new TextResourceStore();
  #activities: ToolActivitiesSnapshot = Object.freeze({ runId: null, items: Object.freeze([]) });
  #settings: StoredConnectionSettings = { ...defaultConnectionSettings(), profiles: defaultConnectionSettings().profiles.map(({ credentialRemembered: _remembered, ...profile }) => ({ ...profile, sealedCredential: null })) };
  #storageNotice: string | null = null;
  #pendingChange: Promise<void> | null = null;
  readonly #settingsStore: ConnectionSettingsStorePort | null;
  readonly #credentialProtector: CredentialProtectorPort;
  readonly #sessionStore: SessionStorePort | null;
  #library: AgentSessionLibrary;
  #sessionNotice: string | null = null;
  #saveTail: Promise<void> = Promise.resolve();
  #saveCount = 0;
  #checkpointTimer: ReturnType<typeof setTimeout> | null = null;
  #opening = false;
  readonly #keys = new Map<string, string>();
  readonly #catalogRequests = new Set<AbortController>();
  readonly session: AgentSession;
  readonly #listeners = new Set<(snapshot: StandaloneAgentSnapshot) => void>();
  readonly #provider: AgentDecisionProviderPort;
  readonly #unsubscribe: () => void;

  constructor(options: HostOptions = {}) {
    this.#settingsStore = options.settingsStore ?? null;
    this.#sessionStore = options.sessionStore ?? null;
    this.#credentialProtector = options.credentialProtector ?? new WindowsCredentialProtector();
    this.#provider = { decide: async (request, signal, observer) => {
      if (!this.#apiKey) throw new Error("模型凭据未配置");
      const configuration = this.#configuration;
      const host = createCompletionsModelHost(configuration, this.#apiKey);
      const model = createCompletionsModel(configuration);
      const plugin = createPiDecisionPlugin({ id: "brilliant.pi", version: "0.1.0", label: "Pi", model,
        streamFn: createHostPiStreamFn(host, request, { providerId: configuration.providerId, modelId: configuration.modelId }, model, {
          onSelection: (report) => { this.session.reportContextSelection(report); },
          onInput: (diagnostic) => {
            if (this.#disposed || this.session.getSnapshot().runId !== diagnostic.runId) return;
            const accepted = this.session.reportModelInput(diagnostic.runId, {
              omittedHistoryTurns: diagnostic.omittedHistory.length, budgetExceeded: diagnostic.status === "budget-exceeded",
            });
            if (accepted && !this.#disposed && this.session.getSnapshot().runId === diagnostic.runId) this.#modelInput = diagnostic;
          },
        }) });
      return createAgentPluginProvider(plugin).decide(request, signal, observer);
    } };
    const tools = (options.tools ?? new AgentToolRegistry()).withTools([createTextResourceTool(this.#resources, (sessionId) =>
      !this.#disposed && this.session.getSnapshot().sessionId === sessionId && this.session.getSnapshot().status === "running")]);
    this.session = createAgentSession({ provider: this.#provider, retainTranscript: true, tools,
      contextSelectionPolicy: STANDALONE_CONTEXT_POLICY,
      contextItems: (sessionId) => this.#resources.context(sessionId),
      allowedToolIds: () => tools.catalog.filter((tool) => tool.id !== TEXT_RESOURCE_CAPABILITY_ID || this.#resources.getSnapshot().items.length > 0).map((tool) => tool.id),
      onProgress: (event) => this.#toolProgress(event),
      checkpoint: async () => { this.#clearCheckpointTimer(); await this.#saveLibrary(this.#library); },
    });
    this.#resources.clear(this.session.getSnapshot().sessionId);
    const first = newConversation(this.session.getSnapshot().sessionId);
    this.#library = { schemaVersion: 1, selectedSessionId: first.sessionId, sessions: [first] };
    this.#unsubscribe = this.session.subscribe(() => {
      const session = this.session.getSnapshot();
      if (this.#resources.getSnapshot().sessionId !== session.sessionId) this.#resources.clear(session.sessionId);
      if (this.#activities.runId !== session.runId) this.#activities = Object.freeze({ runId: session.runId, items: Object.freeze([]) });
      if (["completed", "failed", "cancelled"].includes(session.status)) this.#finishActivities(session.status === "cancelled" ? "cancelled" : "failed");
      if (this.#modelInput?.runId !== session.runId) this.#modelInput = null;
      if (this.#captureTranscript() && this.session.hasActiveRun() && !this.#checkpointTimer) {
        this.#checkpointTimer = setTimeout(() => {
          this.#checkpointTimer = null;
          void this.#saveLibrary(this.#library).catch(() => undefined);
        }, 250);
      }
      this.#publish();
    });
  }

  static async open(options: HostOptions = {}): Promise<StandaloneAgentHost> {
    const host = new StandaloneAgentHost(options);
    host.#opening = true;
    try {
      const loaded = await options.settingsStore?.load();
      if (loaded) host.#settings = parseStoredConnectionSettings(loaded);
      const profile = host.#selected();
      const restored = await host.#restoreKey(profile);
      host.#configuration = profile.configuration; host.#apiKey = restored.key; host.#storageNotice = restored.notice;
      if (restored.key) host.#keys.set(profile.id, restored.key);
      const library = await options.sessionStore?.load();
      if (library) {
        const parsed = parseSessionLibrary(library);
        host.#library = parseSessionLibrary({ ...parsed, sessions: parsed.sessions.map((record) => ({ ...record, messages: record.messages.map((message) => message.status === "streaming" ? { ...message, status: "interrupted" } : message) })) });
        if (JSON.stringify(parsed) !== JSON.stringify(host.#library)) await host.#saveLibrary(host.#library);
      } else if (options.sessionStore) await host.#saveLibrary(host.#library);
      const selected = host.#currentConversation();
      await host.session.restoreTranscript(selected.sessionId, selected.messages);
      host.#opening = false;
      return host;
    } catch (error) { await host.dispose(); throw error; }
  }

  getSnapshot(): StandaloneAgentSnapshot {
    return Object.freeze({ schemaVersion: 4, sequence: this.#sequence, configuration: this.#configuration, credentialPresent: Boolean(this.#apiKey), testingConnection: this.#testing !== null, session: this.session.getSnapshot(),
      connections: publicConnectionSettings(this.#settings), storage: Object.freeze({ configuration: this.#settingsStore?.kind ?? "memory", credentialProtection: this.#settingsStore?.kind === "file" ? this.#credentialProtector.kind : "unavailable", notice: this.#storageNotice }),
      conversations: Object.freeze({ selectedSessionId: this.#library.selectedSessionId, items: Object.freeze(this.#library.sessions.map(({ messages, ...record }) => Object.freeze({ ...record, messageCount: messages.length }))), storage: this.#sessionStore?.kind ?? "memory", saving: this.#saveCount > 0, notice: this.#sessionNotice }),
      resources: this.#resources.getSnapshot(), activities: this.#activities });
  }

  getModelInput(): AgentModelInputDiagnosticV1 | null { return this.#modelInput; }
  getContextSelection(): ContextSelectionReportV1 | null { return this.session.getContextSelection(); }

  addResource(value: unknown): void {
    this.#assertIdle();
    const request = parseAddTextResource(value);
    this.#assertResourceSession(request.sessionId);
    this.#resources.add(request); this.#publish();
  }

  removeResource(value: unknown): void {
    this.#assertIdle();
    const request = parseRemoveTextResource(value);
    this.#assertResourceSession(request.sessionId);
    this.#resources.remove(request.sessionId, request.resourceId); this.#publish();
  }

  #assertResourceSession(sessionId: string): void {
    if (sessionId !== this.session.getSnapshot().sessionId) throw new AgentHostError("busy", "当前会话已变化，请在新会话重新添加资料");
  }

  #finishActivities(status: "failed" | "cancelled"): void {
    this.#activities = Object.freeze({ ...this.#activities, items: Object.freeze(this.#activities.items.map((item) =>
      item.status === "running" ? Object.freeze({ ...item, status, finishedAt: Math.max(item.startedAt, Date.now()), errorCode: status === "failed" ? "run-failed" : null }) : item)) });
  }

  #toolProgress(event: AgentRunProgressEvent): void {
    const session = this.session.getSnapshot();
    if (this.#disposed || event.runId !== session.runId || !("activityId" in event) || !event.activityId.startsWith("capability:")) return;
    const invocationId = event.activityId.slice("capability:".length);
    const items = [...this.#activities.items];
    const index = items.findIndex((item) => item.invocationId === invocationId);
    if (event.type === "activity.started") {
      if (session.status !== "running" || index >= 0 || items.length >= MAX_TOOL_ACTIVITIES) return;
      items.push(Object.freeze({ invocationId, turnId: event.turnId, label: event.label, status: "running", startedAt: Date.now(), finishedAt: null, errorCode: null }));
    } else {
      const previous = items[index];
      if (!previous || previous.status !== "running" || event.type === "activity.waiting") return;
      const status: ToolActivity["status"] = session.status === "cancelling" || event.type === "activity.cancelled" ? "cancelled"
        : event.type === "activity.completed" ? "completed" : "failed";
      items[index] = Object.freeze({ ...previous, status, finishedAt: Math.max(previous.startedAt, Date.now()), errorCode: event.type === "activity.failed" ? event.code : null });
    }
    this.#activities = Object.freeze({ runId: event.runId, items: Object.freeze(items) }); this.#publish();
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
    await this.#change(async () => {
      await this.cancel(); await this.#flushTranscript();
      const record = this.#newConversation();
      const next = { ...this.#library, selectedSessionId: record.sessionId, sessions: [...this.#library.sessions, record] };
      await this.#saveLibrary(next);
      this.#library = next;
      await this.session.restoreTranscript(record.sessionId, record.messages);
    }, true);
  }

  async selectConversation(value: unknown): Promise<void> {
    await this.#change(async () => {
      await this.#flushTranscript();
      const record = isSessionId(value) ? this.#library.sessions.find((item) => item.sessionId === value && !item.archived) : null;
      if (!record) throw new AgentHostError("invalid-input", "会话不存在或已归档，请重新选择");
      const next = { ...this.#library, selectedSessionId: record.sessionId };
      await this.#saveLibrary(next); this.#library = next;
      await this.session.restoreTranscript(record.sessionId, record.messages);
    });
  }

  async renameConversation(value: unknown, titleValue: unknown): Promise<void> {
    const title = parseSessionTitle(titleValue);
    await this.#change(async () => {
      await this.#flushTranscript();
      if (!isSessionId(value) || !this.#library.sessions.some((item) => item.sessionId === value)) throw new AgentHostError("invalid-input", "会话不存在");
      const next = { ...this.#library, sessions: this.#library.sessions.map((record) => record.sessionId === value ? { ...record, title, updatedAt: Date.now() } : record) };
      await this.#saveLibrary(next); this.#library = next; this.#publish();
    });
  }

  async archiveConversation(value: unknown, archived: unknown): Promise<void> {
    if (typeof archived !== "boolean") throw new AgentHostError("invalid-input", "归档状态无效");
    await this.#change(async () => {
      await this.#flushTranscript();
      if (!isSessionId(value) || !this.#library.sessions.some((item) => item.sessionId === value)) throw new AgentHostError("invalid-input", "会话不存在");
      const sessions = this.#library.sessions.map((record) => record.sessionId === value ? { ...record, archived, updatedAt: Date.now() } : record);
      let selectedSessionId = this.#library.selectedSessionId;
      if (archived && value === selectedSessionId) {
        const replacement = sessions.filter((record) => !record.archived).sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? this.#newConversation();
        if (!sessions.some((record) => record.sessionId === replacement.sessionId)) sessions.push(replacement);
        selectedSessionId = replacement.sessionId;
      }
      const next = { ...this.#library, selectedSessionId, sessions };
      await this.#saveLibrary(next); this.#library = next;
      const selected = this.#currentConversation();
      if (selected.sessionId !== this.session.getSnapshot().sessionId) await this.session.restoreTranscript(selected.sessionId, selected.messages);
      else this.#publish();
    });
  }

  async retrySessionSave(): Promise<void> { await this.#change(() => this.#flushTranscript()); }

  async dispose(): Promise<void> {
    this.#disposed = true;
    this.#modelInput = null;
    await this.#pendingChange?.catch(() => undefined);
    this.#abortCatalogs();
    await this.#testing?.dispose();
    await this.session.cancel();
    this.#clearCheckpointTimer();
    if (!this.#opening) await this.#flushTranscript().catch(() => undefined);
    await this.#saveTail;
    await this.session.dispose();
    this.#resources.clear(this.session.getSnapshot().sessionId);
    this.#activities = Object.freeze({ runId: this.session.getSnapshot().runId, items: Object.freeze([]) });
    this.#apiKey = "";
    this.#keys.clear();
    await this.#settingsStore?.dispose?.();
    await this.#sessionStore?.dispose?.();
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
  async #change(operation: () => Promise<void>, allowActive = false): Promise<void> {
    if (allowActive) {
      this.#assertAvailable();
      if (this.#changing) throw new AgentHostError("busy", "配置或会话正在保存，请稍后再试");
    } else this.#assertIdle();
    this.#changing = true; this.#abortCatalogs();
    const pending = Promise.resolve().then(operation); this.#pendingChange = pending;
    try { await pending; } finally { this.#pendingChange = null; this.#changing = false; }
  }

  #assertIdle(): void {
    this.#assertAvailable();
    if (this.#changing || this.session.hasActiveRun() || this.#testing) throw new AgentHostError("busy", "请先停止当前任务，再修改配置或发送消息");
  }

  #abortCatalogs(): void {
    for (const controller of this.#catalogRequests) controller.abort();
  }

  #assertAvailable(): void {
    if (this.#disposed) throw new AgentHostError("disposed", "Agent 宿主已退出");
  }

  #currentConversation(): AgentSessionRecord { return this.#library.sessions.find((record) => record.sessionId === this.#library.selectedSessionId)!; }
  #newConversation(): AgentSessionRecord {
    if (this.#library.sessions.length >= MAX_SESSIONS) throw new AgentHostError("invalid-input", "最多保存200个会话，已有记录仍保留");
    return newConversation(crypto.randomUUID());
  }
  #captureTranscript(): boolean {
    const snapshot = this.session.getSnapshot();
    const record = this.#currentConversation();
    if (snapshot.sessionId !== record.sessionId || (snapshot.messages.length === record.messages.length && snapshot.messages.every((message, index) => {
      const old = record.messages[index]!; return message.id === old.id && message.content === old.content && message.status === old.status;
    }))) return false;
    const first = snapshot.messages[0]?.content.replace(/\s+/g, " ").trim().slice(0, 80);
    const next = { ...record, title: record.title === "新会话" && first ? first : record.title, updatedAt: Date.now(), messages: snapshot.messages };
    this.#library = { ...this.#library, sessions: this.#library.sessions.map((item) => item.sessionId === record.sessionId ? next : item) };
    return true;
  }
  #clearCheckpointTimer(): void { if (this.#checkpointTimer) clearTimeout(this.#checkpointTimer); this.#checkpointTimer = null; }
  async #flushTranscript(): Promise<void> { this.#clearCheckpointTimer(); await this.#saveLibrary(this.#library); }
  async #saveLibrary(value: AgentSessionLibrary): Promise<void> {
    if (!this.#sessionStore) return;
    ++this.#saveCount; this.#publish();
    const pending = this.#saveTail.then(() => this.#sessionStore!.save(value));
    this.#saveTail = pending.catch(() => undefined);
    try { await pending; this.#sessionNotice = null; }
    catch { this.#sessionNotice = "聊天记录尚未保存。当前内容仍在内存中，请检查数据目录后重试保存。"; throw new SessionStoreError("sessions-unavailable", this.#sessionNotice); }
    finally { --this.#saveCount; this.#publish(); }
  }

  #publish(): void {
    ++this.#sequence;
    const snapshot = this.getSnapshot();
    for (const listener of this.#listeners) { try { listener(snapshot); } catch { /* Read-only observers. */ } }
  }
}

function newConversation(sessionId: string): AgentSessionRecord {
  const now = Date.now();
  return { sessionId, title: "新会话", createdAt: now, updatedAt: now, archived: false, messages: [] };
}

function credentialContext(profile: StoredConnectionProfile): string {
  const target = profile.configuration;
  return `brilliant-agent-credential:v1:${profile.id}\n${target.providerId}\n${target.protocol}\n${target.baseUrl}`;
}
