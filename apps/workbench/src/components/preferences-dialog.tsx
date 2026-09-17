import * as Dialog from "@radix-ui/react-dialog";
import type { RefObject } from "react";
import type { DeleteTimePolicy } from "../contracts/note-input.ts";

interface Props {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly animationsEnabled: boolean;
  readonly onAnimationsChange: (enabled: boolean) => void;
  readonly ruleWarningsVisible: boolean;
  readonly onRuleWarningsVisibleChange: (visible: boolean) => void;
  readonly deleteTimePolicy: DeleteTimePolicy;
  readonly onDeleteTimePolicyChange: (policy: DeleteTimePolicy) => void;
  readonly settingsReady: boolean;
  readonly settingsSaving: boolean;
  readonly settingsMessage: string;
  readonly onReset: () => void;
  readonly returnFocusRef: RefObject<HTMLButtonElement | null>;
}

/** Versioned application preferences never mutate the score document. */
export function PreferencesDialog({ open, onOpenChange, animationsEnabled, onAnimationsChange, ruleWarningsVisible,
  onRuleWarningsVisibleChange, deleteTimePolicy, onDeleteTimePolicyChange, settingsReady, settingsSaving,
  settingsMessage, onReset, returnFocusRef }: Props) {
  const disabled = !settingsReady;
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
        <div className="preferences-config-status" role="status">
          {!settingsReady ? "正在读取配置…" : settingsSaving ? "正在保存配置…" : settingsMessage}
        </div>
        <div className="preferences-actions">
          <button className="button" type="button" onClick={onReset} disabled={disabled || settingsSaving}>恢复默认设置</button>
          <Dialog.Close className="button preferences-close">完成</Dialog.Close>
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
