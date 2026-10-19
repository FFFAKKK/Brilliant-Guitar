import type { ScoreEditRequest } from "../contracts/note-input";
import type { NewScoreInput } from "../contracts/new-score";
import { isDocumentReplacementPrecondition } from "../contracts/document-replacement.ts";
import type { DocumentReplacementPrecondition } from "../contracts/document-replacement.ts";
import { isRecentDocumentsSnapshotV1, isRecentRecordId } from "../contracts/recent-documents.ts";
import type { RecentDocumentsSnapshotV1 } from "../contracts/recent-documents.ts";
import { isWorkbenchIssue } from "../contracts/workbench-issue.ts";
import type { NativeFileResult } from "./workbench-host-bridge.ts";

import { DEFAULT_APPLICATION_SETTINGS, isApplicationSettingsV1, normalizeApplicationSettingsSnapshot } from "../contracts/application-settings.ts";
import type { ApplicationSettingsSnapshotV1, ApplicationSettingsV1 } from "../contracts/application-settings.ts";
import { DEFAULT_WORKSPACE_CONFIGURATION, isWorkspaceConfigurationSnapshotV1, isWorkspaceConfigurationV1 } from "../contracts/workspace-configuration.ts";
import type { WorkspaceConfigurationSnapshotV1, WorkspaceConfigurationV1 } from "../contracts/workspace-configuration.ts";
import { isScoreSessionRead } from "../contracts/score-session.ts";
import type { ScoreSessionRead } from "../contracts/score-session";
import { isWorkspaceId } from "../contracts/workspace-id.ts";
import { createWorkbenchHostBridge } from "./workbench-host-bridge.ts";
import type { WorkbenchHostBridge } from "./workbench-host-bridge.ts";
import { ScoreReadClient } from "./score-read-port.ts";
import type { ScoreReadPort, ScoreReadResult } from "./score-read-port.ts";
import { ScoreEditClient } from "./score-edit-port.ts";
import type { ScoreEditPort } from "./score-edit-port.ts";
import { ScoreChangeSetClient } from "./score-change-set-port.ts";
import type { ScoreChangeSetPort } from "./score-change-set-port.ts";
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
import {
  isAgentModelStreamEnvelopeV1,
  isAgentModelStreamEventV1,
} from "../contracts/agent-model-stream.ts";
import type {
  AgentModelStreamEnvelopeV1,
  AgentModelStreamEventV1,
  AgentModelStreamRequestV1,
} from "../contracts/agent-model-stream.ts";
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

export type WorkbenchNativeFileResult = Omit<NativeFileResult, "session"> & { readonly session: ScoreSessionRead };

/** Browser holds session identity and read metadata, never a second editable score. */
export class WorkbenchClient {
  private readonly bridge: WorkbenchHostBridge;
  private readonly workspaceId: string;
  private readonly scoreReads: ScoreReadClient;
  private readonly scoreEdits: ScoreEditClient;
  private readonly scoreChangeSets: ScoreChangeSetClient;
  private readonly agentCapabilityInvoker: ApplicationCapabilityInvoker;

  constructor(
    bridge: WorkbenchHostBridge = createWorkbenchHostBridge(),
    capabilities: ApplicationCapabilityDirectory = EMPTY_APPLICATION_CAPABILITIES,
  ) {
    this.bridge = bridge;
    this.workspaceId = resolveWorkbenchWorkspaceId(bridge.nativeFiles === true);
    const gateway = new ApplicationCapabilityGateway(capabilities, bridge);
    // Score reads use the typed host port directly. The generic application
    // gateway remains only for the not-yet-migrated Agent write adapters.
    this.scoreReads = new ScoreReadClient(this.bridge, this.workspaceId);
    this.scoreEdits = new ScoreEditClient(this.bridge, this.workspaceId);
    this.scoreChangeSets = new ScoreChangeSetClient(this.bridge, this.workspaceId);
    this.agentCapabilityInvoker = gateway.forCaller("agent");
  }

  readScoreSummary(): Promise<CapabilityResult<ScoreSummaryV1>> {
    return this.legacyScoreRead("score.read-summary", this.scoreReads.readSummary());
  }

  readScoreMetadata(): Promise<CapabilityResult<ScoreMetadataV1>> {
    return this.legacyScoreRead("score.read-metadata", this.scoreReads.readMetadata());
  }

  readScoreStructure(): Promise<CapabilityResult<ScoreStructureV1>> {
    return this.legacyScoreRead("score.read-structure", this.scoreReads.readStructure());
  }

  readScoreMeasureIndex(
    input: ScoreMeasureIndexInputV1,
  ): Promise<CapabilityResult<ScoreMeasureIndexV1>> {
    return this.legacyScoreRead("score.read-measure-index", this.scoreReads.readMeasureIndex(input));
  }

  readScoreMeasureRange(
    input: ScoreMeasureRangeInputV1,
  ): Promise<CapabilityResult<ScoreMeasureRangeV1>> {
    return this.legacyScoreRead("score.read-measure-range", this.scoreReads.readMeasureRange(input));
  }

  /** Typed score port for UI controllers and direct Agent adapters. */
  scoreReadPort(): ScoreReadPort {
    return this.scoreReads;
  }

  /** Typed score edit port for UI controllers and first-party UI plugins. */
  scoreEditPort(): ScoreEditPort {
    return this.scoreEdits;
  }

  /** Typed read-only preparation port for authoritative Agent ChangeSets. */
  scoreChangeSetPort(): ScoreChangeSetPort {
    return this.scoreChangeSets;
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

  private async legacyScoreRead<T>(
    capabilityId: string,
    resultPromise: Promise<ScoreReadResult<T>>,
  ): Promise<CapabilityResult<T>> {
    const identity = {
      invocationId: crypto.randomUUID(), capabilityId, contractVersion: 1,
    } as const;
    const result = await resultPromise;
    return result.status === "ready"
      ? Object.freeze({ ...identity, status: "completed" as const, data: result.data })
      : Object.freeze({ ...identity, status: "unavailable" as const, code: result.code, message: result.message });
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
    return this.scoreEdits.edit(input);
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

  async createGuarded(input: NewScoreInput, requestId: string, expected: DocumentReplacementPrecondition): Promise<ScoreSessionRead> {
    if (!isDocumentReplacementPrecondition(expected)) throw new Error("作品替换预条件无效");
    if (!this.bridge.createGuarded) throw new Error("当前宿主不支持受保护新建作品");
    return this.session(await this.bridge.createGuarded(this.workspaceId, input, requestId, expected), "无法确认创建结果，请重试")!;
  }

  async importDocument(document: unknown): Promise<ScoreSessionRead> {
    const session = await this.bridge.importDocument(this.workspaceId, document);
    if (!isScoreSessionRead(session)) throw new Error("文件打开结果无效");
    return session;
  }

  usesNativeFiles(): boolean {
    return this.bridge.nativeFiles === true;
  }

  async openNativeDocument(): Promise<WorkbenchNativeFileResult | null> {
    if (!this.bridge.openNativeDocument) throw new Error("当前宿主不支持原生打开文件");
    const result = await this.bridge.openNativeDocument(this.workspaceId);
    return this.nativeFileResult(result);
  }

  async openNativeDocumentGuarded(expected: DocumentReplacementPrecondition): Promise<WorkbenchNativeFileResult | null> {
    if (!isDocumentReplacementPrecondition(expected)) throw new Error("作品替换预条件无效");
    if (!this.bridge.openNativeDocumentGuarded) throw new Error("当前宿主不支持受保护打开作品");
    return this.nativeFileResult(await this.bridge.openNativeDocumentGuarded(this.workspaceId, expected));
  }

  private nativeFileResult(result: NativeFileResult | null): WorkbenchNativeFileResult | null {
    if (result === null) return null;
    const session = this.session(result.session, "文件打开结果无效")!;
    if (typeof result.name !== "string" || !result.name || !Number.isSafeInteger(result.savedVersion)
      || result.savedVersion < 0) throw new Error("文件打开结果无效");
    const warnings = result.warnings;
    if (warnings !== undefined && (!Array.isArray(warnings) || warnings.length > 4
      || warnings.some(warning => !isWorkbenchIssue(warning) || warning.severity !== "warning"))) throw new Error("文件打开警告结果无效");
    return { session, name: result.name, savedVersion: result.savedVersion, ...(warnings?.length ? {warnings: Object.freeze([...warnings])} : {}) };
  }

  private recentSnapshot(value: unknown): RecentDocumentsSnapshotV1 {
    if (!isRecentDocumentsSnapshotV1(value)) throw new Error("最近文件目录结果无效");
    return value;
  }

  async listRecentDocuments(): Promise<RecentDocumentsSnapshotV1> {
    if (!this.bridge.listRecentDocuments) throw new Error("当前宿主不支持最近文件目录");
    return this.recentSnapshot(await this.bridge.listRecentDocuments());
  }

  async removeRecentDocument(recordId: string): Promise<RecentDocumentsSnapshotV1> {
    if (!isRecentRecordId(recordId)) throw new Error("最近文件记录ID无效");
    if (!this.bridge.removeRecentDocument) throw new Error("当前宿主不支持移除最近文件记录");
    return this.recentSnapshot(await this.bridge.removeRecentDocument(recordId));
  }

  async openRecentDocumentGuarded(recordId: string, expected: DocumentReplacementPrecondition): Promise<WorkbenchNativeFileResult> {
    if (!isRecentRecordId(recordId) || !isDocumentReplacementPrecondition(expected)) throw new Error("最近文件打开参数无效");
    if (!this.bridge.openRecentDocumentGuarded) throw new Error("当前宿主不支持受保护打开最近文件");
    const result = this.nativeFileResult(await this.bridge.openRecentDocumentGuarded(this.workspaceId, recordId, expected));
    if (!result) throw new Error("最近文件打开结果无效");
    return result;
  }

  async recordCurrentFile(expected: DocumentReplacementPrecondition): Promise<RecentDocumentsSnapshotV1> {
    if (!isDocumentReplacementPrecondition(expected) || expected.kind !== "document") throw new Error("登记最近文件需要当前作品身份");
    if (!this.bridge.recordCurrentFile) throw new Error("当前宿主不支持登记最近文件");
    return this.recentSnapshot(await this.bridge.recordCurrentFile(this.workspaceId, expected));
  }

  async saveNativeDocument(suggestedName: string, saveAs: boolean): Promise<WorkbenchNativeFileResult | null> {
    if (!this.bridge.saveNativeDocument) throw new Error("当前宿主不支持原生保存文件");
    const result = await this.bridge.saveNativeDocument(this.workspaceId, suggestedName, saveAs);
    return this.nativeFileResult(result);
  }

  async saveNativeDocumentGuarded(suggestedName: string, saveAs: boolean, expected: DocumentReplacementPrecondition): Promise<WorkbenchNativeFileResult | null> {
    if (!isDocumentReplacementPrecondition(expected) || expected.kind !== "document" || typeof saveAs !== "boolean") {
      throw new Error("保存需要有效的作品身份和版本");
    }
    if (!this.bridge.saveNativeDocumentGuarded) throw new Error("当前宿主不支持受保护保存作品");
    return this.nativeFileResult(await this.bridge.saveNativeDocumentGuarded(this.workspaceId, suggestedName, saveAs, expected));
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

  async streamAgentModel(
    request: AgentModelStreamRequestV1,
    signal?: AbortSignal | null,
    observer?: ((event: AgentModelStreamEventV1) => void) | null,
  ): Promise<AgentModelStreamEnvelopeV1> {
    if (!isAgentProviderId(request.providerId)) throw new Error("模型 Provider 标识无效");
    if (!this.bridge.streamAgentModel) throw new Error("当前宿主不支持原始模型流");
    let streamError: Error | null = null;
    const value = await this.bridge.streamAgentModel(request, signal, (event) => {
      if (streamError !== null) return;
      if (!isAgentModelStreamEventV1(event)
        || event.runId !== request.runId
        || event.turnId !== request.turnId) {
        streamError = new Error("原始模型流事件无效");
        return;
      }
      try {
        observer?.(event);
      } catch {
        // Streaming progress is observational and cannot alter the result.
      }
    });
    if (streamError !== null) throw streamError;
    if (!isAgentModelStreamEnvelopeV1(value)
      || value.providerId !== request.providerId
      || value.modelId !== request.modelId) throw new Error("原始模型流结果无效");
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
