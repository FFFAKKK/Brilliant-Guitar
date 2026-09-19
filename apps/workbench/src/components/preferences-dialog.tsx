import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import type { AgentProviderDescriptor } from "../agent/provider-contract.ts";
import type { AgentCredentialControlSnapshot } from "../agent/use-agent-provider-credential.ts";
import type { AgentProviderSelection } from "../contracts/agent-provider-settings.ts";
import type { DeleteTimePolicy } from "../contracts/note-input.ts";
import type { InputDuration } from "../contracts/note-input.ts";
import type { NoteInputPreferencesV1, NoteInputRetention } from "../contracts/application-settings.ts";
import { NoteInputPreferenceFields } from "./note-input-preference-fields.tsx";
import { WORKSPACE_LAYOUT_PRESETS } from "../ui/workspace-layout-presets.ts";
import type { WorkspaceLayoutPresetId } from "../ui/workspace-layout-presets.ts";

interface Props {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly animationsEnabled: boolean;
  readonly onAnimationsChange: (enabled: boolean) => void;
  readonly ruleWarningsVisible: boolean;
  readonly onRuleWarningsVisibleChange: (visible: boolean) => void;
  readonly deleteTimePolicy: DeleteTimePolicy;
  readonly onDeleteTimePolicyChange: (policy: DeleteTimePolicy) => void;
  readonly noteInputPreferences: NoteInputPreferencesV1;
  readonly onNoteInputRetentionChange: (value: NoteInputRetention) => void;
  readonly onDefaultNoteInputDurationChange: (value: InputDuration) => void;
  readonly agentEnabled: boolean;
  readonly onAgentEnabledChange: (enabled: boolean) => void;
  readonly agentProviderDescriptors: readonly AgentProviderDescriptor[];
  readonly agentProviderSelection: AgentProviderSelection | null;
  readonly onAgentProviderSelectionChange: (selection: AgentProviderSelection | null) => void;
  readonly agentCredential: AgentCredentialControlSnapshot;
  readonly onSaveAgentCredential: (secret: string) => Promise<boolean>;
  readonly onDeleteAgentCredential: () => Promise<boolean>;
  readonly settingsReady: boolean;
  readonly settingsSaving: boolean;
  readonly settingsMessage: string;
  readonly onReset: () => void;
  readonly workspaceReady: boolean;
  readonly workspaceSaving: boolean;
  readonly workspaceMessage: string;
  readonly workspaceLayoutPreset: WorkspaceLayoutPresetId | "custom";
  readonly onWorkspaceLayoutPresetChange: (preset: WorkspaceLayoutPresetId) => void;
  readonly onResetWorkspaceLayout: () => void;
  readonly shortcutProfileName: string;
  readonly shortcutBindingCount: number;
  readonly onOpenShortcutSettings: () => void;
  readonly returnFocusRef: RefObject<HTMLButtonElement | null>;
}

/** Versioned application preferences never mutate the score document. */
export function PreferencesDialog({ open, onOpenChange, animationsEnabled, onAnimationsChange, ruleWarningsVisible,
  onRuleWarningsVisibleChange, deleteTimePolicy, onDeleteTimePolicyChange, settingsReady, settingsSaving,
  noteInputPreferences, onNoteInputRetentionChange, onDefaultNoteInputDurationChange,
  agentEnabled, onAgentEnabledChange, agentProviderDescriptors, agentProviderSelection,
  onAgentProviderSelectionChange, agentCredential, onSaveAgentCredential, onDeleteAgentCredential,
  settingsMessage, onReset, workspaceReady, workspaceSaving, workspaceMessage, workspaceLayoutPreset,
  onWorkspaceLayoutPresetChange, onResetWorkspaceLayout, shortcutProfileName, shortcutBindingCount,
  onOpenShortcutSettings, returnFocusRef }: Props) {
  const disabled = !settingsReady;
  const credentialInputRef = useRef<HTMLInputElement>(null);
  const [credentialDraftPresent, setCredentialDraftPresent] = useState(false);
  const selectedProvider = agentProviderDescriptors.find(
    (provider) => provider.id === agentProviderSelection?.providerId,
  );
  const selectedModel = selectedProvider?.models.find((model) => model.id === agentProviderSelection?.modelId);
  const providerUnavailable = agentProviderSelection !== null && selectedProvider === undefined;
  const modelUnavailable = selectedProvider !== undefined && agentProviderSelection !== null && selectedModel === undefined;
  const providerHint = agentProviderDescriptors.length === 0
    ? "尚未接入可用的模型 Provider；真实 Adapter 完成后会出现在这里。"
    : providerUnavailable ? "此前选择的 Provider 当前不可用，请改选已安装的 Provider。"
    : selectedProvider?.executionLocation === "remote"
      ? "远端处理：任务所需的上下文会发送给所选 Provider。"
      : selectedProvider?.executionLocation === "local"
        ? "本机处理：模型在本机运行，任务上下文不会发送给远端模型服务。"
        : "选择 Agent 使用的模型服务；这里只保存标识，不保存 API Key。";
  const modelHint = modelUnavailable
    ? "此前选择的模型当前不可用，请改选该 Provider 支持的模型。"
    : "模型能力按具体模型声明，不由 Provider 名称推断。";
  const credentialBusy = agentCredential.status === "checking" || agentCredential.status === "saving"
    || agentCredential.status === "deleting";
  useEffect(() => {
    if (credentialInputRef.current) credentialInputRef.current.value = "";
    setCredentialDraftPresent(false);
  }, [agentProviderSelection?.providerId, open]);
  return <Dialog.Root open={open} onOpenChange={onOpenChange}>
    <Dialog.Portal>
      <Dialog.Overlay className="dialog-overlay" />
      <Dialog.Content className="preferences-dialog" onCloseAutoFocus={(event) => { event.preventDefault(); returnFocusRef.current?.focus(); }}>
        <Dialog.Title className="dialog-title">应用设置</Dialog.Title>
        <Dialog.Description className="dialog-description">
          桌面版将这些选项写入独立的版本化 JSON 配置文件；配置不会进入乐谱或撤销历史。
        </Dialog.Description>
        <label className="preferences-setting-row" htmlFor="preferences-animations">
          <span className="preferences-setting-copy"><span>界面动画</span><span className="preferences-setting-hint" id="preferences-animation-hint">
            控制音符过渡和光标闪烁；系统减少动态效果始终优先。
          </span></span>
          <input id="preferences-animations" className="preferences-setting-switch" type="checkbox" role="switch"
            checked={animationsEnabled} onChange={(event) => onAnimationsChange(event.target.checked)}
            disabled={disabled}
            aria-describedby="preferences-animation-hint" />
        </label>
        <label className="preferences-setting-row" htmlFor="preferences-rule-warnings">
          <span className="preferences-setting-copy"><span>谱面规则提示</span><span className="preferences-setting-hint" id="preferences-rule-warning-hint">
            显示超拍等非阻断提示；关闭后内核仍会检查并保留诊断。
          </span></span>
          <input id="preferences-rule-warnings" className="preferences-setting-switch" type="checkbox" role="switch"
            checked={ruleWarningsVisible} onChange={(event) => onRuleWarningsVisibleChange(event.target.checked)}
            disabled={disabled}
            aria-describedby="preferences-rule-warning-hint" />
        </label>
        <label className="preferences-setting-row preferences-setting-row-stacked" htmlFor="preferences-delete-time-policy">
          <span className="preferences-setting-copy"><span>删除后的时间处理</span><span className="preferences-setting-hint" id="preferences-delete-time-hint">
            保持节奏会把音符替换为等时值休止符；收拢时间会移除时值并前移后续内容。
          </span></span>
          <select id="preferences-delete-time-policy" className="preferences-setting-select" value={deleteTimePolicy}
            onChange={(event) => onDeleteTimePolicyChange(event.target.value as DeleteTimePolicy)}
            disabled={disabled}
            aria-describedby="preferences-delete-time-hint">
            <option value="preserve">保持节奏</option>
            <option value="collapse">收拢时间</option>
          </select>
        </label>
        <div className="preferences-section-label">谱面输入</div>
        <div className="preferences-layout-block">
          <NoteInputPreferenceFields value={noteInputPreferences} disabled={disabled}
            onRetentionChange={onNoteInputRetentionChange}
            onDefaultDurationChange={onDefaultNoteInputDurationChange} />
          <span className="preferences-setting-hint">
            “保持时值与附点”会在提交后清除音高草稿、临时变音记号和休止符工具；两个入口使用同一份配置。
          </span>
        </div>
        <div className="preferences-section-label">工作台布局</div>
        <div className="preferences-layout-block">
          <div className="preferences-layout-presets" role="group" aria-label="工作台布局预设">
            {WORKSPACE_LAYOUT_PRESETS.map((preset) => <button key={preset.id} type="button"
              className="preferences-layout-preset" aria-pressed={workspaceLayoutPreset === preset.id}
              disabled={!workspaceReady || workspaceSaving}
              onClick={() => onWorkspaceLayoutPresetChange(preset.id)}>{preset.label}</button>)}
          </div>
          <span className="preferences-setting-hint" role="status">
            {workspaceLayoutPreset === "custom" ? "自定义布局：停靠区显隐与预设不同。"
              : WORKSPACE_LAYOUT_PRESETS.find((preset) => preset.id === workspaceLayoutPreset)?.description}
          </span>
          <div className="preferences-layout-actions">
            <button type="button" className="button" disabled={!workspaceReady || workspaceSaving}
              onClick={onResetWorkspaceLayout}>恢复默认布局</button>
            <span className="preferences-credential-status" role="status">
              {!workspaceReady ? "正在读取工作区配置…" : workspaceSaving ? "正在保存布局…" : workspaceMessage}
            </span>
          </div>
        </div>
        <div className="preferences-section-label">键盘与模板</div>
        <div className="preferences-layout-block">
          <span className="preferences-setting-hint">
            当前使用“{shortcutProfileName}”模板{shortcutBindingCount > 0 ? `，包含 ${shortcutBindingCount} 项覆盖` : ""}。
          </span>
          <div className="preferences-layout-actions">
            <button type="button" className="button" disabled={!settingsReady || settingsSaving}
              onClick={onOpenShortcutSettings}>配置、导入或导出快捷键…</button>
          </div>
        </div>
        <label className="preferences-setting-row" htmlFor="preferences-agent-enabled">
          <span className="preferences-setting-copy"><span>Agent 助手</span><span className="preferences-setting-hint" id="preferences-agent-hint">
            开启后加载 Agent 插件运行时；Provider 和模型配置会在 Agent 设置中单独管理。
          </span></span>
          <input id="preferences-agent-enabled" className="preferences-setting-switch" type="checkbox" role="switch"
            checked={agentEnabled} onChange={(event) => onAgentEnabledChange(event.target.checked)} disabled={disabled}
            aria-describedby="preferences-agent-hint" />
        </label>
        <div className="preferences-section-label">Agent 模型</div>
        <label className="preferences-setting-row preferences-setting-row-stacked" htmlFor="preferences-agent-provider">
          <span className="preferences-setting-copy"><span>Provider</span><span className="preferences-setting-hint" id="preferences-agent-provider-hint">
            {providerHint}
          </span></span>
          <select id="preferences-agent-provider" className="preferences-setting-select"
            value={agentProviderSelection?.providerId ?? ""}
            onChange={(event) => {
              const provider = agentProviderDescriptors.find((item) => item.id === event.target.value);
              const model = provider?.models[0];
              onAgentProviderSelectionChange(provider && model
                ? { providerId: provider.id, modelId: model.id } : null);
            }}
            disabled={disabled || agentProviderDescriptors.length === 0}
            aria-describedby="preferences-agent-provider-hint">
            {agentProviderDescriptors.length === 0 && agentProviderSelection === null
              ? <option value="">尚未接入可用 Provider</option>
              : <option value="">选择 Provider</option>}
            {providerUnavailable && <option value={agentProviderSelection.providerId}>
              {agentProviderSelection.providerId}（当前不可用）
            </option>}
            {agentProviderDescriptors.map((provider) => <option key={provider.id} value={provider.id}>
              {provider.label} · {provider.executionLocation === "local" ? "本机" : "远端"}
            </option>)}
          </select>
        </label>
        <label className="preferences-setting-row preferences-setting-row-stacked" htmlFor="preferences-agent-model">
          <span className="preferences-setting-copy"><span>模型</span><span className="preferences-setting-hint" id="preferences-agent-model-hint">
            {modelHint}
          </span></span>
          <select id="preferences-agent-model" className="preferences-setting-select"
            value={agentProviderSelection?.modelId ?? ""}
            onChange={(event) => {
              if (selectedProvider) onAgentProviderSelectionChange({
                providerId: selectedProvider.id,
                modelId: event.target.value,
              });
            }}
            disabled={disabled || selectedProvider === undefined}
            aria-describedby="preferences-agent-model-hint">
            {!selectedProvider && <option value={agentProviderSelection?.modelId ?? ""}>
              {providerUnavailable ? `${agentProviderSelection.modelId}（当前不可用）` : "请先选择 Provider"}
            </option>}
            {modelUnavailable && <option value={agentProviderSelection.modelId}>
              {agentProviderSelection.modelId}（当前不可用）
            </option>}
            {selectedProvider?.models.map((model) => <option key={model.id} value={model.id}>{model.label}</option>)}
          </select>
        </label>
        {selectedProvider?.credentialKind === "api-key" && <form className="preferences-setting-row preferences-setting-row-stacked"
          onSubmit={(event) => {
            event.preventDefault();
            const secret = credentialInputRef.current?.value ?? "";
            void onSaveAgentCredential(secret).then((saved) => {
              if (!saved) return;
              if (credentialInputRef.current) credentialInputRef.current.value = "";
              setCredentialDraftPresent(false);
            });
          }}>
          <label className="preferences-setting-copy" htmlFor="preferences-agent-credential">
            <span>API Key</span>
            <span className="preferences-setting-hint" id="preferences-agent-credential-hint">
              密钥只会发送到桌面宿主并保存在系统凭据库，不会写入应用配置或乐谱文件。
            </span>
          </label>
          <input id="preferences-agent-credential" className="preferences-credential-input" type="password"
            ref={credentialInputRef} onChange={(event) => setCredentialDraftPresent(event.target.value.length > 0)}
            autoComplete="new-password" spellCheck={false} disabled={disabled || credentialBusy}
            aria-describedby="preferences-agent-credential-hint preferences-agent-credential-status" />
          <div className="preferences-inline-actions">
            <button type="submit" className="button" disabled={disabled || credentialBusy || !credentialDraftPresent}>
              {agentCredential.present ? "替换密钥" : "保存密钥"}
            </button>
            <button type="button" className="button" disabled={disabled || credentialBusy || !agentCredential.present}
              onClick={() => { void onDeleteAgentCredential().then((removed) => {
                if (!removed) return;
                if (credentialInputRef.current) credentialInputRef.current.value = "";
                setCredentialDraftPresent(false);
              }); }}>
              删除密钥
            </button>
          </div>
          <span className="preferences-credential-status" id="preferences-agent-credential-status" role="status">
            {agentCredential.message}
          </span>
        </form>}
        <div className="preferences-config-status" role="status">
          {!settingsReady ? "正在读取配置…" : settingsSaving ? "正在保存配置…" : settingsMessage}
        </div>
        <div className="preferences-actions">
          <button className="button" type="button" onClick={onReset} disabled={disabled || settingsSaving}>恢复默认应用设置</button>
          <Dialog.Close className="button preferences-close">完成</Dialog.Close>
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
