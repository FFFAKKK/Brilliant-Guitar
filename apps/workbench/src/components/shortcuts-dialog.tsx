import * as Dialog from "@radix-ui/react-dialog";
import { useMemo, useRef, useState } from "react";
import type { KeyboardEvent, RefObject } from "react";
import { normalizedShortcut, shortcutLabel } from "../commands/workbench-command.ts";
import type { WorkbenchCommand } from "../commands/workbench-command.ts";
import { createShortcutTemplate, notationInputShortcutConflict, parseShortcutTemplate } from "../contracts/shortcut-settings.ts";
import { isNormalizedShortcut } from "../contracts/shortcut-settings.ts";
import type { ShortcutTemplateV1 } from "../contracts/shortcut-settings.ts";

interface Props {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly commands: readonly WorkbenchCommand[];
  readonly profileName: string;
  readonly storedBindings: Readonly<Record<string, string | null>>;
  readonly disabled: boolean;
  readonly onBindingChange: (commandId: string, shortcut: string | null | undefined) => void;
  readonly onImportTemplate: (template: ShortcutTemplateV1) => void;
  readonly onReset: () => void;
  readonly returnFocusRef: RefObject<HTMLButtonElement | null>;
}

const INPUT_SHORTCUTS = [
  ["A–G，然后 2–6", "输入音名与组号"],
  ["R", "输入休止符"],
  ["Esc", "清除草稿或取消选择"],
  ["← / →", "移动编辑位置或已选音符"],
  ["Shift + ← / →", "扩展或收缩连续选择"],
  ["Shift + 单击", "选择同一小节内的连续内容"],
] as const;

const GROUP_LABELS: Readonly<Record<string, string>> = {
  file: "文件", edit: "编辑", view: "视图", playback: "播放", help: "帮助",
};

function officialShortcut(command: WorkbenchCommand): string | undefined {
  return command.defaultShortcut;
}

function templateConflict(commands: readonly WorkbenchCommand[], template: ShortcutTemplateV1): string | null {
  const assigned = new Map<string, WorkbenchCommand>();
  for (const command of commands) {
    const shortcut = Object.prototype.hasOwnProperty.call(template.bindings, command.id)
      ? template.bindings[command.id] : officialShortcut(command);
    if (!shortcut) continue;
    const conflict = assigned.get(shortcut);
    if (conflict) return `“${conflict.label}”与“${command.label}”都使用 ${shortcutLabel(shortcut)}`;
    assigned.set(shortcut, command);
  }
  return null;
}

function templateInputConflictCount(commands: readonly WorkbenchCommand[], template: ShortcutTemplateV1): number {
  return commands.reduce((count, command) => {
    const shortcut = Object.prototype.hasOwnProperty.call(template.bindings, command.id)
      ? template.bindings[command.id] : officialShortcut(command);
    return count + (shortcut && notationInputShortcutConflict(shortcut) ? 1 : 0);
  }, 0);
}

function downloadTemplate(template: ShortcutTemplateV1): void {
  const blob = new Blob([`${JSON.stringify(template, null, 2)}\n`], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "brilliant-guitar-shortcuts.json";
  anchor.click();
  URL.revokeObjectURL(url);
}

export function ShortcutsDialog({ open, onOpenChange, commands, profileName, storedBindings, disabled,
  onBindingChange, onImportTemplate, onReset, returnFocusRef }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const grouped = useMemo(() => {
    const groups = new Map<string, WorkbenchCommand[]>();
    for (const command of commands) {
      const prefix = command.id.split(".")[0] ?? "other";
      const items = groups.get(prefix) ?? [];
      items.push(command);
      groups.set(prefix, items);
    }
    return [...groups].map(([id, items]) => ({ id, label: GROUP_LABELS[id] ?? "插件命令", items }));
  }, [commands]);

  const assign = (command: WorkbenchCommand, shortcut: string) => {
    if (!isNormalizedShortcut(shortcut)) {
      setMessage("这个按键不能作为快捷键，请使用字母、数字、功能键或常用导航键。");
      return;
    }
    const conflict = commands.find((candidate) => candidate.id !== command.id && candidate.shortcut === shortcut);
    if (conflict) {
      setMessage(`${shortcutLabel(shortcut)} 已用于“${conflict.label}”，请先修改或清除原映射。`);
      return;
    }
    onBindingChange(command.id, shortcut);
    const inputConflict = notationInputShortcutConflict(shortcut);
    setMessage(inputConflict
      ? `已将“${command.label}”设为 ${shortcutLabel(shortcut)}；${inputConflict}。`
      : `已将“${command.label}”设为 ${shortcutLabel(shortcut)}`);
    setRecordingId(null);
  };

  const capture = (event: KeyboardEvent<HTMLButtonElement>, command: WorkbenchCommand) => {
    event.preventDefault();
    event.stopPropagation();
    if (["Control", "Meta", "Alt", "Shift"].includes(event.key)) return;
    if (event.key === "Escape") {
      setRecordingId(null);
      setMessage("已取消录制");
      return;
    }
    assign(command, normalizedShortcut(event));
  };

  const exportCurrent = () => {
    const bindings: Record<string, string | null> = { ...storedBindings };
    for (const command of commands) bindings[command.id] = command.shortcut ?? null;
    try {
      downloadTemplate(createShortcutTemplate(profileName, bindings));
      setMessage("已导出快捷键模板");
    } catch {
      setMessage("无法导出：当前命令映射存在冲突");
    }
  };

  const importFile = async (file: File) => {
    if (file.size > 256 * 1024) {
      setMessage("模板文件过大，最大支持 256 KB");
      return;
    }
    try {
      const template = parseShortcutTemplate(JSON.parse(await file.text()));
      if (!template) {
        setMessage("无法导入：这不是受支持的快捷键模板");
        return;
      }
      const conflict = templateConflict(commands, template);
      if (conflict) {
        setMessage(`无法导入：${conflict}`);
        return;
      }
      onImportTemplate(template);
      const inputConflicts = templateInputConflictCount(commands, template);
      setMessage(inputConflicts > 0
        ? `已导入“${template.name}”模板；其中 ${inputConflicts} 项会占用谱面输入键。`
        : `已导入“${template.name}”模板`);
    } catch {
      setMessage("无法导入：模板文件不是有效的 JSON");
    }
  };

  return <Dialog.Root open={open} onOpenChange={(next) => {
    if (!next) { setRecordingId(null); setMessage(""); }
    onOpenChange(next);
  }}><Dialog.Portal><Dialog.Overlay className="dialog-overlay" />
    <Dialog.Content className="about-dialog shortcuts-dialog"
      onCloseAutoFocus={(event) => { event.preventDefault(); returnFocusRef.current?.focus(); }}>
      <div className="shortcuts-heading-row">
        <div><Dialog.Title className="dialog-title">快捷键设置</Dialog.Title>
          <Dialog.Description className="dialog-description">当前模板：{profileName}</Dialog.Description></div>
        <div className="shortcut-template-actions">
          <button type="button" className="button" disabled={disabled} onClick={() => fileInputRef.current?.click()}>导入</button>
          <button type="button" className="button" onClick={exportCurrent}>导出</button>
        </div>
      </div>
      <p className="shortcut-editor-hint">选择“录制”后按下新的组合键。A–G、R 与组号键的无修饰映射会优先于谱面输入，并在下方标记。</p>
      <div className="shortcut-editor" aria-label="可配置命令快捷键">
        {grouped.map((group) => <section className="shortcut-group" key={group.id}>
          <h3>{group.label}</h3>
          {group.items.map((command) => {
            const current = command.shortcut;
            const official = officialShortcut(command);
            const customized = Object.prototype.hasOwnProperty.call(storedBindings, command.id);
            const inputConflict = current ? notationInputShortcutConflict(current) : null;
            return <div className="shortcut-editor-row" key={command.id}>
              <div className="shortcut-command-copy"><span>{command.label}</span>
                <small>{customized ? "已自定义" : official ? `默认 ${shortcutLabel(official)}` : "默认未设置"}</small>
                {inputConflict && <small className="shortcut-input-conflict" title={inputConflict}>{inputConflict}</small>}
              </div>
              <kbd className={!current ? "shortcut-unassigned" : undefined}>{current ? shortcutLabel(current) : "未设置"}</kbd>
              <button type="button" className="button shortcut-record-button" disabled={disabled}
                data-recording={recordingId === command.id || undefined}
                onClick={() => { setRecordingId(command.id); setMessage(`请按下“${command.label}”的新快捷键，Esc 取消`); }}
                onKeyDown={(event) => { if (recordingId === command.id) capture(event, command); }}>
                {recordingId === command.id ? "请按键…" : "录制"}
              </button>
              <button type="button" className="shortcut-row-action" disabled={disabled || !current}
                onClick={() => { onBindingChange(command.id, null); setMessage(`已清除“${command.label}”的快捷键`); }}>清除</button>
              <button type="button" className="shortcut-row-action" disabled={disabled || !customized}
                onClick={() => { onBindingChange(command.id, undefined); setMessage(`已恢复“${command.label}”的官方映射`); }}>默认</button>
            </div>;
          })}
        </section>)}
      </div>
      <details className="shortcut-input-reference"><summary>谱面输入手势</summary>
        <dl className="shortcut-list">{INPUT_SHORTCUTS.map(([key, description]) => <div className="shortcut-row" key={key}>
          <dt><kbd>{key}</kbd></dt><dd>{description}</dd></div>)}</dl>
      </details>
      <div className="shortcut-dialog-footer">
        <span className="shortcut-editor-message" role="status">{disabled ? "正在读取或保存设置…" : message}</span>
        <button type="button" className="button" disabled={disabled} onClick={() => {
          onReset(); setMessage("已恢复官方快捷键模板");
        }}>恢复官方模板</button>
        <Dialog.Close className="button">完成</Dialog.Close>
      </div>
      <input ref={fileInputRef} className="visually-hidden" type="file" accept=".json,.bgkeys.json,application/json"
        aria-label="导入快捷键模板" onChange={(event) => {
          const file = event.target.files?.[0]; event.target.value = "";
          if (file) void importFile(file);
        }} />
    </Dialog.Content>
  </Dialog.Portal></Dialog.Root>;
}
