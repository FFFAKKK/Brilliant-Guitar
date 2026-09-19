import type { ScoreEditRequest } from "../contracts/note-input";
import type { NewScoreInput } from "../contracts/new-score";
import { DEFAULT_APPLICATION_SETTINGS, isApplicationSettingsV1, normalizeApplicationSettingsSnapshot } from "../contracts/application-settings.ts";
import type { ApplicationSettingsSnapshotV1, ApplicationSettingsV1 } from "../contracts/application-settings.ts";
import { DEFAULT_WORKSPACE_CONFIGURATION, isWorkspaceConfigurationSnapshotV1, isWorkspaceConfigurationV1 } from "../contracts/workspace-configuration.ts";
import type { WorkspaceConfigurationSnapshotV1, WorkspaceConfigurationV1 } from "../contracts/workspace-configuration.ts";
import { isScoreSessionRead } from "../contracts/score-session.ts";
import type { ScoreSessionRead } from "../contracts/score-session";
import { isWorkspaceId } from "../contracts/workspace-id.ts";
import { createWorkbenchHostBridge } from "./workbench-host-bridge.ts";
import type { WorkbenchHostBridge } from "./workbench-host-bridge.ts";
import { ScoreCapabilityClient } from "./score-capability-client.ts";
import { ApplicationCapabilityGateway } from "./application-capability-gateway.ts";
import type {
  ApplicationCapabilityDirectory,
  ApplicationCapabilityInvoker,
} from "../contracts/application-capability.ts";
import type { CapabilityTransportRequest } from "../contracts/capability.ts";
import type {
  CapabilityResult,
  ScoreMeasureIndexInputV1,
  ScoreMeasureIndexV1,
  ScoreMeasureRangeInputV1,
  ScoreMeasureRangeV1,
  ScoreMetadataV1,
  ScoreStructureV1,
  ScoreSummaryV1,
} from "../contracts/capability.ts";
import { isAgentProviderId } from "../contracts/agent-provider-settings.ts";
import { isAgentProviderCredentialSecret, isAgentProviderCredentialSnapshot,
  unavailableAgentProviderCredential } from "../contracts/agent-provider-credential.ts";
import type { AgentProviderCredentialSnapshot } from "../contracts/agent-provider-credential.ts";
import {
  isAgentProviderDecisionEnvelopeV1,
  isAgentProviderStreamEventV1,
} from "../contracts/agent-provider-turn.ts";
import type {
  AgentProviderDecideRequestV1,
  AgentProviderDecisionEnvelopeV1,
  AgentProviderStreamEventV1,
} from "../contracts/agent-provider-turn.ts";
export { WorkbenchRequestError } from "./workbench-host-bridge.ts";

const SESSION_WORKSPACE_KEY = "brilliant.workbench.session.v1";
const DESKTOP_WORKSPACE_KEY = "brilliant.workbench.desktop.v1";
const EMPTY_APPLICATION_CAPABILITIES: ApplicationCapabilityDirectory = Object.freeze({
  get: () => undefined,
  list: () => Object.freeze([]),
});

interface WorkspaceIdentityStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * Desktop recovery files are keyed by workspace ID, so the desktop identity
 * must survive a crashed window. Browser previews remain isolated to one tab
 * session and therefore continue to use sessionStorage.
 */
export function resolveWorkbenchWorkspaceId(
  nativeFiles: boolean,
  sessionStore: WorkspaceIdentityStorage | undefined = globalThis.sessionStorage,
  persistentStore: WorkspaceIdentityStorage | undefined = globalThis.localStorage,
  createId: () => string = () => crypto.randomUUID(),
): string {
  try {
    if (!nativeFiles) {
      const stored = sessionStore?.getItem(SESSION_WORKSPACE_KEY);
      const workspaceId = isWorkspaceId(stored) ? stored : createId();
      sessionStore?.setItem(SESSION_WORKSPACE_KEY, workspaceId);
      return workspaceId;
    }

    const persisted = persistentStore?.getItem(DESKTOP_WORKSPACE_KEY);
    const legacySession = sessionStore?.getItem(SESSION_WORKSPACE_KEY);
    const workspaceId = isWorkspaceId(persisted)
      ? persisted
      : isWorkspaceId(legacySession) ? legacySession : createId();
    persistentStore?.setItem(DESKTOP_WORKSPACE_KEY, workspaceId);
    return workspaceId;
  } catch {
    return createId();
  }
}

/** Browser holds session identity and read metadata, never a second editable score. */
export class WorkbenchClient {
  private readonly bridge: WorkbenchHostBridge;
  private readonly workspaceId: string;
  private readonly scoreCapabilities: ScoreCapabilityClient;
  private readonly agentCapabilityInvoker: ApplicationCapabilityInvoker;

  constructor(
    bridge: WorkbenchHostBridge = createWorkbenchHostBridge(),
    capabilities: ApplicationCapabilityDirectory = EMPTY_APPLICATION_CAPABILITIES,
  ) {
    this.bridge = bridge;
    this.workspaceId = resolveWorkbenchWorkspaceId(bridge.nativeFiles === true);
    const gateway = new ApplicationCapabilityGateway(capabilities, bridge);
    this.scoreCapabilities = new ScoreCapabilityClient(gateway.forCaller("ui"), this.workspaceId);
    this.agentCapabilityInvoker = gateway.forCaller("agent");
  }

  readScoreSummary(): Promise<CapabilityResult<ScoreSummaryV1>> {
    return this.scoreCapabilities.readSummary();
  }

  readScoreMetadata(): Promise<CapabilityResult<ScoreMetadataV1>> {
    return this.scoreCapabilities.readMetadata();
  }

  readScoreStructure(): Promise<CapabilityResult<ScoreStructureV1>> {
    return this.scoreCapabilities.readStructure();
  }

  readScoreMeasureIndex(
    input: ScoreMeasureIndexInputV1,
  ): Promise<CapabilityResult<ScoreMeasureIndexV1>> {
    return this.scoreCapabilities.readMeasureIndex(input);
  }

  readScoreMeasureRange(
    input: ScoreMeasureRangeInputV1,
  ): Promise<CapabilityResult<ScoreMeasureRangeV1>> {
    return this.scoreCapabilities.readMeasureRange(input);
  }

  getWorkspaceId(): string {
    return this.workspaceId;
  }

  agentCapabilities(): ApplicationCapabilityInvoker {
    return Object.freeze({
      invokeCapability: (request: CapabilityTransportRequest) => {
        if (request.workspaceId !== this.workspaceId) throw new Error("Agent Capability 工作区不匹配");
        return this.agentCapabilityInvoker.invokeCapability(request);
      },
    });
  }

  private session(value: unknown | null, requiredMessage?: string): ScoreSessionRead | null {
    if (value === null) {
      if (requiredMessage) throw new Error(requiredMessage);
      return null;
    }
    if (!isScoreSessionRead(value)) throw new Error("无法确认操作结果，请重试");
    return value;
  }

  async edit(input: ScoreEditRequest): Promise<ScoreSessionRead> {
    return this.session(await this.bridge.edit(this.workspaceId, input), "无法确认输入结果，请重试")!;
  }

  async read(): Promise<ScoreSessionRead | null> {
    return this.session(await this.bridge.read(this.workspaceId));
  }

  async create(input: NewScoreInput, requestId: string, expectedDocumentId: string | null): Promise<ScoreSessionRead> {
    return this.session(
      await this.bridge.create(this.workspaceId, input, requestId, expectedDocumentId),
      "无法确认创建结果，请重试",
    )!;
  }

  async exportDocument(): Promise<string> {
    return this.bridge.exportDocument(this.workspaceId);
  }

  async importDocument(document: unknown): Promise<ScoreSessionRead> {
    const session = await this.bridge.importDocument(this.workspaceId, document);
    if (!isScoreSessionRead(session)) throw new Error("文件打开结果无效");
    return session;
  }

  usesNativeFiles(): boolean {
    return this.bridge.nativeFiles === true;
  }

  async openNativeDocument(): Promise<{ session: ScoreSessionRead; name: string; savedVersion: number } | null> {
    if (!this.bridge.openNativeDocument) throw new Error("当前宿主不支持原生打开文件");
    const result = await this.bridge.openNativeDocument(this.workspaceId);
    if (result === null) return null;
    const session = this.session(result.session, "文件打开结果无效")!;
    if (typeof result.name !== "string" || !result.name || !Number.isSafeInteger(result.savedVersion)
      || result.savedVersion < 0) throw new Error("文件打开结果无效");
    return { session, name: result.name, savedVersion: result.savedVersion };
  }

  async saveNativeDocument(suggestedName: string, saveAs: boolean): Promise<{
    session: ScoreSessionRead; name: string; savedVersion: number;
  } | null> {
    if (!this.bridge.saveNativeDocument) throw new Error("当前宿主不支持原生保存文件");
    const result = await this.bridge.saveNativeDocument(this.workspaceId, suggestedName, saveAs);
    if (result === null) return null;
    const session = this.session(result.session, "文件保存结果无效")!;
    if (typeof result.name !== "string" || !result.name || !Number.isSafeInteger(result.savedVersion)
      || result.savedVersion < 0) throw new Error("文件保存结果无效");
    return { session, name: result.name, savedVersion: result.savedVersion };
  }

  onNativeCloseRequested(handler: () => boolean | Promise<boolean>): Promise<() => void> {
    return this.bridge.onNativeCloseRequested?.(handler) ?? Promise.resolve(() => {});
  }

  async closeNativeWindow(): Promise<void> {
    if (!this.bridge.closeNativeWindow) return;
    await this.bridge.closeNativeWindow(this.workspaceId);
  }

  async readApplicationSettings(): Promise<ApplicationSettingsSnapshotV1> {
    if (!this.bridge.readApplicationSettings) return {
      settings: DEFAULT_APPLICATION_SETTINGS, persisted: false, recoveredFromInvalid: false,
    };
    const value = await this.bridge.readApplicationSettings();
    const snapshot = normalizeApplicationSettingsSnapshot(value);
    if (snapshot === null) throw new Error("应用配置读取结果无效");
    return snapshot;
  }

  async writeApplicationSettings(settings: ApplicationSettingsV1): Promise<ApplicationSettingsV1> {
    if (!isApplicationSettingsV1(settings)) throw new Error("应用配置格式无效");
    if (!this.bridge.writeApplicationSettings) return settings;
    const value = await this.bridge.writeApplicationSettings(settings);
    if (!isApplicationSettingsV1(value)) throw new Error("应用配置保存结果无效");
    return value;
  }

  async resetApplicationSettings(): Promise<ApplicationSettingsV1> {
    if (!this.bridge.resetApplicationSettings) return DEFAULT_APPLICATION_SETTINGS;
    const value = await this.bridge.resetApplicationSettings();
    if (!isApplicationSettingsV1(value)) throw new Error("默认应用配置结果无效");
    return value;
  }

  async readAgentProviderCredentialStatus(providerId: string): Promise<AgentProviderCredentialSnapshot> {
    if (!isAgentProviderId(providerId)) throw new Error("模型 Provider 标识无效");
    if (!this.bridge.readAgentProviderCredentialStatus) return unavailableAgentProviderCredential(providerId);
    const value = await this.bridge.readAgentProviderCredentialStatus(providerId);
    if (!isAgentProviderCredentialSnapshot(value) || value.providerId !== providerId) {
      throw new Error("Provider 凭据状态结果无效");
    }
    return value;
  }

  async setAgentProviderCredential(providerId: string, secret: string): Promise<AgentProviderCredentialSnapshot> {
    if (!isAgentProviderId(providerId)) throw new Error("模型 Provider 标识无效");
    if (!isAgentProviderCredentialSecret(secret)) throw new Error("Provider 凭据格式无效");
    if (!this.bridge.setAgentProviderCredential) throw new Error("当前宿主不支持系统凭据库");
    const value = await this.bridge.setAgentProviderCredential(providerId, secret);
    if (!isAgentProviderCredentialSnapshot(value) || value.providerId !== providerId || !value.present) {
      throw new Error("Provider 凭据保存结果无效");
    }
    return value;
  }

  async deleteAgentProviderCredential(providerId: string): Promise<AgentProviderCredentialSnapshot> {
    if (!isAgentProviderId(providerId)) throw new Error("模型 Provider 标识无效");
    if (!this.bridge.deleteAgentProviderCredential) throw new Error("当前宿主不支持系统凭据库");
    const value = await this.bridge.deleteAgentProviderCredential(providerId);
    if (!isAgentProviderCredentialSnapshot(value) || value.providerId !== providerId || value.present) {
      throw new Error("Provider 凭据删除结果无效");
    }
    return value;
  }

  async decideAgentProvider(
    request: AgentProviderDecideRequestV1,
    signal?: AbortSignal | null,
    observer?: ((event: AgentProviderStreamEventV1) => void) | null,
  ): Promise<AgentProviderDecisionEnvelopeV1> {
    if (!isAgentProviderId(request.providerId)) throw new Error("模型 Provider 标识无效");
    if (!this.bridge.decideAgentProvider) throw new Error("当前宿主不支持模型 Provider");
    let streamError: Error | null = null;
    const value = await this.bridge.decideAgentProvider(request, signal, (event) => {
      if (streamError !== null) return;
      if (!isAgentProviderStreamEventV1(event)
        || event.runId !== request.runId
        || event.turnId !== request.turnId) {
        streamError = new Error("模型 Provider 流式事件无效");
        return;
      }
      try {
        observer?.(event);
      } catch {
        // Streaming progress is non-authoritative and cannot fail the Provider turn.
      }
    });
    if (streamError !== null) throw streamError;
    if (!isAgentProviderDecisionEnvelopeV1(value)
      || value.providerId !== request.providerId
      || value.modelId !== request.modelId) throw new Error("模型 Provider 决策结果无效");
    return value;
  }

  async readWorkspaceConfiguration(): Promise<WorkspaceConfigurationSnapshotV1> {
    if (!this.bridge.readWorkspaceConfiguration) return {
      configuration: DEFAULT_WORKSPACE_CONFIGURATION, persisted: false, recoveredFromInvalid: false,
    };
    const value = await this.bridge.readWorkspaceConfiguration(this.workspaceId);
    if (!isWorkspaceConfigurationSnapshotV1(value)) throw new Error("工作区配置读取结果无效");
    return value;
  }

  async writeWorkspaceConfiguration(configuration: WorkspaceConfigurationV1): Promise<WorkspaceConfigurationV1> {
    if (!isWorkspaceConfigurationV1(configuration)) throw new Error("工作区配置格式无效");
    if (!this.bridge.writeWorkspaceConfiguration) return configuration;
    const value = await this.bridge.writeWorkspaceConfiguration(this.workspaceId, configuration);
    if (!isWorkspaceConfigurationV1(value)) throw new Error("工作区配置保存结果无效");
    return value;
  }

  async resetWorkspaceConfiguration(): Promise<WorkspaceConfigurationV1> {
    if (!this.bridge.resetWorkspaceConfiguration) return DEFAULT_WORKSPACE_CONFIGURATION;
    const value = await this.bridge.resetWorkspaceConfiguration(this.workspaceId);
    if (!isWorkspaceConfigurationV1(value)) throw new Error("默认工作区配置结果无效");
    return value;
  }
}
