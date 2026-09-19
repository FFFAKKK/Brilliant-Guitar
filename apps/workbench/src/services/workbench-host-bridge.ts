import { Channel, invoke, isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { Window as TauriWindow } from "@tauri-apps/api/window";
import type { ScoreEditRequest } from "../contracts/note-input";
import type { NewScoreInput } from "../contracts/new-score";
import type { CapabilityTransportRequest } from "../contracts/capability.ts";
import { DEFAULT_APPLICATION_SETTINGS, normalizeApplicationSettings } from "../contracts/application-settings.ts";
import type { ApplicationSettingsV1 } from "../contracts/application-settings.ts";
import { DEFAULT_WORKSPACE_CONFIGURATION, isWorkspaceConfigurationV1 } from "../contracts/workspace-configuration.ts";
import type { WorkspaceConfigurationV1 } from "../contracts/workspace-configuration.ts";
import { isWorkbenchIssue } from "../contracts/workbench-issue.ts";
import type { WorkbenchIssue } from "../contracts/workbench-issue.ts";
import type { AgentProviderDecideRequestV1 } from "../contracts/agent-provider-turn.ts";
import type { PluginActivationDocumentV1, PluginActivationStoragePort } from "../plugins/plugin-activation-persistence.ts";
import type { PluginSettingsDocument } from "../plugins/plugin-settings.ts";
import type { PluginSettingsStoragePort } from "../plugins/plugin-settings-persistence.ts";

export class WorkbenchRequestError extends Error {
  readonly status: number;
  readonly issue: WorkbenchIssue | undefined;

  constructor(message: string, status: number, issue?: WorkbenchIssue) {
    super(message);
    this.status = status;
    this.issue = issue;
  }
}

/**
 * Boundary between the reusable workbench UI and the process that owns the
 * editable score session. The browser adapter uses Vite HTTP for development;
 * the production Tauri adapter implements the same contract with Rust commands.
 */
export interface WorkbenchHostBridge {
  invokeCapability(request: CapabilityTransportRequest): Promise<unknown>;
  invokeAgentCapability(request: CapabilityTransportRequest): Promise<unknown>;
  read(workspaceId: string): Promise<unknown | null>;
  create(workspaceId: string, input: NewScoreInput, requestId: string, expectedDocumentId: string | null): Promise<unknown>;
  edit(workspaceId: string, input: ScoreEditRequest): Promise<unknown>;
  exportDocument(workspaceId: string): Promise<string>;
  importDocument(workspaceId: string, document: unknown): Promise<unknown>;
  readonly nativeFiles?: boolean;
  openNativeDocument?(workspaceId: string): Promise<NativeFileResult | null>;
  saveNativeDocument?(workspaceId: string, suggestedName: string, saveAs: boolean): Promise<NativeFileResult | null>;
  onNativeCloseRequested?(handler: () => boolean | Promise<boolean>): Promise<() => void>;
  closeNativeWindow?(workspaceId: string): Promise<void>;
  readApplicationSettings?(): Promise<unknown>;
  writeApplicationSettings?(settings: ApplicationSettingsV1): Promise<unknown>;
  resetApplicationSettings?(): Promise<unknown>;
  readAgentProviderCredentialStatus?(providerId: string): Promise<unknown>;
  setAgentProviderCredential?(providerId: string, secret: string): Promise<unknown>;
  deleteAgentProviderCredential?(providerId: string): Promise<unknown>;
  decideAgentProvider?(
    request: AgentProviderDecideRequestV1,
    signal?: AbortSignal | null,
    observer?: ((event: unknown) => void) | null,
  ): Promise<unknown>;
  readWorkspaceConfiguration?(workspaceId: string): Promise<unknown>;
  writeWorkspaceConfiguration?(workspaceId: string, configuration: WorkspaceConfigurationV1): Promise<unknown>;
  resetWorkspaceConfiguration?(workspaceId: string): Promise<unknown>;
}

export interface NativeFileResult {
  readonly session: unknown;
  readonly name: string;
  readonly savedVersion: number;
}

type Invoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;
type DesktopWindow = Pick<TauriWindow, "onCloseRequested" | "close">;
type CurrentWindow = () => DesktopWindow;
type SettingsStorage = Pick<Storage, "getItem" | "setItem">;
type HostChannel = { onmessage: (message: unknown) => void };
type CreateChannel = () => HostChannel;

function browserSettingsStorage(): SettingsStorage | undefined {
  try { return globalThis.localStorage; } catch { return undefined; }
}

function requestError(error: unknown, fallback: string): WorkbenchRequestError {
  if (typeof error === "object" && error !== null) {
    const record = error as Record<string, unknown>;
    const message = typeof record.message === "string" ? record.message : fallback;
    return new WorkbenchRequestError(
      message,
      typeof record.status === "number" ? record.status : 503,
      isWorkbenchIssue(record.issue) ? record.issue : undefined,
    );
  }
  return new WorkbenchRequestError(fallback, 503);
}

/** Production desktop adapter. All mutable score and file state stays in Rust. */
export class TauriWorkbenchHostBridge implements WorkbenchHostBridge {
  readonly nativeFiles = true;
  private readonly invoke: Invoke;
  private readonly currentWindow: CurrentWindow;
  private readonly createChannel: CreateChannel;
  private forceClosing = false;

  constructor(
    invokeCommand: Invoke = invoke,
    currentWindow: CurrentWindow = getCurrentWindow,
    createChannel: CreateChannel = () => new Channel<unknown>(),
  ) {
    this.invoke = invokeCommand;
    this.currentWindow = currentWindow;
    this.createChannel = createChannel;
  }

  private async call<T>(command: string, args: Record<string, unknown>, fallback: string): Promise<T> {
    try { return await this.invoke<T>(command, args); }
    catch (error) { throw requestError(error, fallback); }
  }

  invokeCapability(request: CapabilityTransportRequest) {
    return this.call<unknown>("workbench_invoke_capability_v1", { request }, "无法调用应用能力");
  }

  invokeAgentCapability(request: CapabilityTransportRequest) {
    return this.call<unknown>("workbench_agent_invoke_capability_v1", { request }, "无法调用 Agent 应用能力");
  }

  read(workspaceId: string) {
    return this.call<unknown | null>("workbench_read_v1", { workspaceId }, "无法读取当前乐谱");
  }

  create(workspaceId: string, input: NewScoreInput, requestId: string, expectedDocumentId: string | null) {
    return this.call<unknown>("workbench_create_v1", {
      request: { workspaceId, input, requestId, expectedDocumentId },
    }, "无法创建乐谱");
  }

  edit(workspaceId: string, input: ScoreEditRequest) {
    return this.call<unknown>("workbench_edit_v1", {
      request: { workspaceId, ...input },
    }, "无法完成编辑");
  }

  exportDocument(workspaceId: string) {
    return this.call<string>("workbench_export_v1", { workspaceId }, "无法导出当前乐谱");
  }

  importDocument(workspaceId: string, document: unknown) {
    return this.call<unknown>("workbench_import_v1", {
      workspaceId, documentJson: JSON.stringify(document),
    }, "无法打开乐谱文件");
  }

  openNativeDocument(workspaceId: string) {
    return this.call<NativeFileResult | null>("workbench_open_file_v1", { workspaceId }, "无法打开乐谱文件");
  }

  saveNativeDocument(workspaceId: string, suggestedName: string, saveAs: boolean) {
    return this.call<NativeFileResult | null>("workbench_save_file_v1",
      { workspaceId, suggestedName, saveAs }, "无法保存当前乐谱");
  }

  async onNativeCloseRequested(handler: () => boolean | Promise<boolean>): Promise<() => void> {
    return this.currentWindow().onCloseRequested(async (event) => {
      if (this.forceClosing) return;
      if (!await handler()) event.preventDefault();
    });
  }

  async closeNativeWindow(workspaceId: string): Promise<void> {
    await this.call<boolean>("workbench_close_v1", { workspaceId }, "无法关闭当前工作区");
    this.forceClosing = true;
    await this.currentWindow().close();
  }

  readApplicationSettings() {
    return this.call<unknown>("workbench_read_settings_v1", {}, "无法读取应用配置");
  }

  writeApplicationSettings(settings: ApplicationSettingsV1) {
    return this.call<unknown>("workbench_write_settings_v1", { settings }, "无法保存应用配置");
  }

  resetApplicationSettings() {
    return this.call<unknown>("workbench_reset_settings_v1", {}, "无法恢复默认应用配置");
  }

  readAgentProviderCredentialStatus(providerId: string) {
    return this.call<unknown>("workbench_agent_provider_credential_status_v1", { providerId }, "无法读取 Provider 凭据状态");
  }

  setAgentProviderCredential(providerId: string, secret: string) {
    return this.call<unknown>("workbench_agent_provider_set_credential_v1", { providerId, secret }, "无法保存 Provider 凭据");
  }

  deleteAgentProviderCredential(providerId: string) {
    return this.call<unknown>("workbench_agent_provider_delete_credential_v1", { providerId }, "无法删除 Provider 凭据");
  }

  async decideAgentProvider(
    request: AgentProviderDecideRequestV1,
    signal?: AbortSignal | null,
    observer?: ((event: unknown) => void) | null,
  ): Promise<unknown> {
    if (signal?.aborted) throw new DOMException("Agent Provider request cancelled", "AbortError");
    const cancel = (): void => {
      void this.invoke<boolean>("workbench_agent_provider_cancel_v1", {
        runId: request.runId,
        turnId: request.turnId,
      }).catch(() => undefined);
    };
    signal?.addEventListener("abort", cancel, { once: true });
    try {
      const progress = this.createChannel();
      progress.onmessage = observer ?? (() => undefined);
      return await this.call<unknown>(
        "workbench_agent_provider_decide_v1",
        { request, progress },
        "模型 Provider 暂时无法完成决策",
      );
    } finally {
      signal?.removeEventListener("abort", cancel);
    }
  }

  readWorkspaceConfiguration(workspaceId: string) {
    return this.call<unknown>("workbench_read_workspace_configuration_v1", { workspaceId }, "无法读取工作区配置");
  }

  writeWorkspaceConfiguration(workspaceId: string, configuration: WorkspaceConfigurationV1) {
    return this.call<unknown>("workbench_write_workspace_configuration_v1", { workspaceId, configuration }, "无法保存工作区配置");
  }

  resetWorkspaceConfiguration(workspaceId: string) {
    return this.call<unknown>("workbench_reset_workspace_configuration_v1", { workspaceId }, "无法恢复默认工作区配置");
  }
}

export function createWorkbenchHostBridge(): WorkbenchHostBridge {
  return import.meta.env.VITE_BRILLIANT_DESKTOP === "1" || isTauri()
    ? new TauriWorkbenchHostBridge() : new BrowserWorkbenchHostBridge();
}

export class BrowserWorkbenchHostBridge implements WorkbenchHostBridge {
  private static readonly SETTINGS_KEY = "brilliant.workbench.application-settings.v1";
  private static readonly INVALID_SETTINGS_KEY = "brilliant.workbench.application-settings.invalid.v1";
  private static readonly WORKSPACE_CONFIGURATION_PREFIX = "brilliant.workbench.workspace-configuration.v1.";
  private static readonly INVALID_WORKSPACE_CONFIGURATION_PREFIX = "brilliant.workbench.workspace-configuration.invalid.v1.";
  private readonly settingsStorage: SettingsStorage | undefined;

  constructor(settingsStorage: SettingsStorage | undefined = browserSettingsStorage()) {
    this.settingsStorage = settingsStorage;
  }

  async invokeCapability(request: CapabilityTransportRequest): Promise<unknown> {
    return {
      status: "unavailable",
      invocationId: request.invocationId,
      capabilityId: request.capabilityId,
      contractVersion: request.contractVersion,
      code: "capability.host-unsupported",
      message: "浏览器开发宿主尚未提供该应用能力",
    };
  }

  async invokeAgentCapability(request: CapabilityTransportRequest): Promise<unknown> {
    return {
      status: "unavailable",
      invocationId: request.invocationId,
      capabilityId: request.capabilityId,
      contractVersion: request.contractVersion,
      code: "capability.agent-host-unsupported",
      message: "浏览器开发宿主尚未提供 Agent 应用能力",
    };
  }

  private endpoint(workspaceId: string, resource: "session" | "document") {
    return `/api/workbench/${resource}?workspaceId=${encodeURIComponent(workspaceId)}`;
  }

  private async requestSession(workspaceId: string, init?: RequestInit): Promise<unknown | null> {
    let response: Response;
    try {
      response = await fetch(this.endpoint(workspaceId, "session"), {
        ...init,
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      const message = "工作台服务暂时不可用，请重新加载";
      throw new WorkbenchRequestError(message, 503,
        { code: "bridge.unavailable", message, severity: "error", source: "bridge", target: { scope: "workbench" }, retryable: true });
    }
    let result: unknown;
    try {
      result = await response.json();
    } catch {
      throw new Error("无法确认操作结果，请重试");
    }
    if (typeof result !== "object" || result === null) throw new Error("无法确认操作结果，请重试");
    const record = result as Record<string, unknown>;
    if (!response.ok) {
      throw new WorkbenchRequestError(
        typeof record.message === "string" ? record.message : "操作失败，请重试",
        response.status,
        isWorkbenchIssue(record.issue) ? record.issue : undefined,
      );
    }
    return record.session ?? null;
  }

  read(workspaceId: string) {
    return this.requestSession(workspaceId);
  }

  create(workspaceId: string, input: NewScoreInput, requestId: string, expectedDocumentId: string | null) {
    return this.requestSession(workspaceId, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...input, requestId, expectedDocumentId }),
    });
  }

  edit(workspaceId: string, input: ScoreEditRequest) {
    return this.requestSession(workspaceId, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
  }

  async exportDocument(workspaceId: string): Promise<string> {
    const response = await fetch(this.endpoint(workspaceId, "document"), {
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error("无法保存当前乐谱");
    return response.text();
  }

  async importDocument(workspaceId: string, document: unknown): Promise<unknown> {
    const response = await fetch(this.endpoint(workspaceId, "document"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(document),
      signal: AbortSignal.timeout(15000),
    });
    const result: unknown = await response.json();
    if (typeof result !== "object" || result === null) throw new Error("无法打开乐谱文件");
    const record = result as Record<string, unknown>;
    if (!response.ok) throw new Error(typeof record.message === "string" ? record.message : "无法打开乐谱文件");
    return record.session;
  }

  async readApplicationSettings(): Promise<unknown> {
    const value = this.settingsStorage?.getItem(BrowserWorkbenchHostBridge.SETTINGS_KEY);
    if (value === null || value === undefined) return {
      settings: DEFAULT_APPLICATION_SETTINGS, persisted: false, recoveredFromInvalid: false,
    };
    try {
      const settings = normalizeApplicationSettings(JSON.parse(value));
      if (settings === null) throw new Error("invalid application settings");
      return {
        settings,
        persisted: true,
        recoveredFromInvalid: false,
      };
    } catch {
      this.settingsStorage?.setItem(BrowserWorkbenchHostBridge.INVALID_SETTINGS_KEY, value);
      return { settings: DEFAULT_APPLICATION_SETTINGS, persisted: false, recoveredFromInvalid: true };
    }
  }

  async writeApplicationSettings(settings: ApplicationSettingsV1): Promise<unknown> {
    this.settingsStorage?.setItem(BrowserWorkbenchHostBridge.SETTINGS_KEY, JSON.stringify(settings));
    return settings;
  }

  async resetApplicationSettings(): Promise<unknown> {
    this.settingsStorage?.setItem(BrowserWorkbenchHostBridge.SETTINGS_KEY, JSON.stringify(DEFAULT_APPLICATION_SETTINGS));
    return DEFAULT_APPLICATION_SETTINGS;
  }

  async readAgentProviderCredentialStatus(providerId: string): Promise<unknown> {
    return {
      providerId,
      present: false,
      status: "unavailable",
      message: "系统凭据库仅在桌面宿主中可用",
    };
  }

  async setAgentProviderCredential(_providerId: string, _secret: string): Promise<unknown> {
    throw new WorkbenchRequestError("浏览器开发宿主不会保存 Provider 凭据", 501, {
      code: "agent-credential.host-unsupported",
      message: "浏览器开发宿主不会保存 Provider 凭据",
      severity: "error",
      source: "host",
      target: { scope: "workbench" },
      retryable: false,
    });
  }

  async deleteAgentProviderCredential(_providerId: string): Promise<unknown> {
    throw new WorkbenchRequestError("浏览器开发宿主没有可删除的 Provider 凭据", 501, {
      code: "agent-credential.host-unsupported",
      message: "浏览器开发宿主没有可删除的 Provider 凭据",
      severity: "error",
      source: "host",
      target: { scope: "workbench" },
      retryable: false,
    });
  }

  async decideAgentProvider(
    _request: AgentProviderDecideRequestV1,
    _signal?: AbortSignal | null,
    _observer?: ((event: unknown) => void) | null,
  ): Promise<unknown> {
    throw new WorkbenchRequestError("浏览器开发宿主不会转发模型请求", 501, {
      code: "agent-provider.host-unsupported",
      message: "浏览器开发宿主不会转发模型请求",
      severity: "error",
      source: "host",
      target: { scope: "workbench" },
      retryable: false,
    });
  }

  async readWorkspaceConfiguration(workspaceId: string): Promise<unknown> {
    const key = BrowserWorkbenchHostBridge.WORKSPACE_CONFIGURATION_PREFIX + workspaceId;
    const value = this.settingsStorage?.getItem(key);
    if (value === null || value === undefined) return {
      configuration: DEFAULT_WORKSPACE_CONFIGURATION, persisted: false, recoveredFromInvalid: false,
    };
    try {
      const configuration: unknown = JSON.parse(value);
      if (!isWorkspaceConfigurationV1(configuration)) throw new Error("invalid workspace configuration");
      return { configuration, persisted: true, recoveredFromInvalid: false };
    } catch {
      this.settingsStorage?.setItem(BrowserWorkbenchHostBridge.INVALID_WORKSPACE_CONFIGURATION_PREFIX + workspaceId, value);
      return { configuration: DEFAULT_WORKSPACE_CONFIGURATION, persisted: false, recoveredFromInvalid: true };
    }
  }

  async writeWorkspaceConfiguration(workspaceId: string, configuration: WorkspaceConfigurationV1): Promise<unknown> {
    this.settingsStorage?.setItem(BrowserWorkbenchHostBridge.WORKSPACE_CONFIGURATION_PREFIX + workspaceId, JSON.stringify(configuration));
    return configuration;
  }

  async resetWorkspaceConfiguration(workspaceId: string): Promise<unknown> {
    this.settingsStorage?.setItem(BrowserWorkbenchHostBridge.WORKSPACE_CONFIGURATION_PREFIX + workspaceId, JSON.stringify(DEFAULT_WORKSPACE_CONFIGURATION));
    return DEFAULT_WORKSPACE_CONFIGURATION;
  }
}

/** Browser-only development storage for plugin activation intent. Desktop storage remains a host concern. */
export class BrowserPluginActivationStorage implements PluginActivationStoragePort {
  private static readonly KEY = "brilliant.workbench.plugin-activation.v1";
  private static readonly INVALID_KEY = "brilliant.workbench.plugin-activation.invalid.v1";
  private readonly storage: SettingsStorage | undefined;

  constructor(storage: SettingsStorage | undefined = browserSettingsStorage()) {
    this.storage = storage;
  }

  async read(): Promise<unknown> {
    const value = this.storage?.getItem(BrowserPluginActivationStorage.KEY);
    if (value === null || value === undefined) return {};
    try { return JSON.parse(value); }
    catch {
      this.storage?.setItem(BrowserPluginActivationStorage.INVALID_KEY, value);
      return {};
    }
  }

  async write(document: PluginActivationDocumentV1): Promise<void> {
    this.storage?.setItem(BrowserPluginActivationStorage.KEY, JSON.stringify(document));
  }
}

/** Browser-only development storage for namespaced plugin settings. */
export class BrowserPluginSettingsStorage implements PluginSettingsStoragePort {
  private static readonly KEY = "brilliant.workbench.plugin-settings.v1";
  private static readonly INVALID_KEY = "brilliant.workbench.plugin-settings.invalid.v1";
  private readonly storage: SettingsStorage | undefined;

  constructor(storage: SettingsStorage | undefined = browserSettingsStorage()) {
    this.storage = storage;
  }

  async read(): Promise<unknown> {
    const value = this.storage?.getItem(BrowserPluginSettingsStorage.KEY);
    if (value === null || value === undefined) return {};
    try { return JSON.parse(value); }
    catch {
      this.storage?.setItem(BrowserPluginSettingsStorage.INVALID_KEY, value);
      return {};
    }
  }

  async write(document: PluginSettingsDocument): Promise<void> {
    this.storage?.setItem(BrowserPluginSettingsStorage.KEY, JSON.stringify(document));
  }
}
