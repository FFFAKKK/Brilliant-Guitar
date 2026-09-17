import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useState } from "react";
import type { UiPluginDiagnostic } from "../ui/plugin-diagnostic.ts";
import { serializeUiPluginDiagnostic } from "../ui/plugin-diagnostic.ts";

const STAGE_LABELS = {
  manifest: "插件清单",
  requirements: "能力检查",
  contributions: "贡献检查",
  permissions: "权限检查",
  registration: "宿主注册",
  resolution: "运行装配",
} as const;

async function copyReport(diagnostic: UiPluginDiagnostic): Promise<void> {
  const text = serializeUiPluginDiagnostic(diagnostic);
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const area = document.createElement("textarea");
  area.value = text;
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.append(area);
  area.select();
  document.execCommand("copy");
  area.remove();
}

export function PluginDiagnosticDialog({ diagnostics, open, onOpenChange }: {
  readonly diagnostics: readonly UiPluginDiagnostic[];
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const [active, setActive] = useState(0);
  const [copied, setCopied] = useState(false);
  const diagnostic = diagnostics[Math.min(active, Math.max(0, diagnostics.length - 1))];
  useEffect(() => { setActive((value) => Math.min(value, Math.max(0, diagnostics.length - 1))); }, [diagnostics.length]);
  useEffect(() => { setCopied(false); }, [active, open]);
  if (!diagnostic) return null;
  return <Dialog.Root open={open} onOpenChange={onOpenChange}>
    <Dialog.Portal>
      <Dialog.Overlay className="plugin-diagnostic-backdrop" />
      <Dialog.Content className="plugin-diagnostic-dialog">
      <header className="plugin-diagnostic-header">
        <span className="plugin-diagnostic-mark" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M8 8V5.5a4 4 0 0 1 8 0V8m-9 3h10v8H7zM10 15h4" /></svg>
        </span>
        <div>
          <Dialog.Title id="plugin-diagnostic-title">界面插件未能装配</Dialog.Title>
          <Dialog.Description>故障插件或贡献已被隔离，其余已通过检查的界面插件仍可运行。</Dialog.Description>
        </div>
        <Dialog.Close type="button" className="plugin-diagnostic-close" aria-label="关闭插件报告"
          title="关闭插件报告">
          <svg viewBox="0 0 20 20"><path d="m6 6 8 8m0-8-8 8" /></svg>
        </Dialog.Close>
      </header>
      {diagnostics.length > 1 && <div className="plugin-diagnostic-tabs" role="tablist" aria-label="插件故障列表">
        {diagnostics.map((item, index) => <button key={item.reportId} type="button" role="tab"
          aria-selected={index === active} onClick={() => setActive(index)}>{item.plugin.name}</button>)}
      </div>}
      <div className="plugin-diagnostic-body">
        <div className="plugin-diagnostic-summary">
          <strong>{diagnostic.message}</strong>
          <span>{diagnostic.plugin.name} · {diagnostic.plugin.id}</span>
        </div>
        <dl className="plugin-diagnostic-grid">
          <div><dt>错误码</dt><dd>{diagnostic.code}</dd></div>
          <div><dt>报告 ID</dt><dd>{diagnostic.reportId}</dd></div>
          <div><dt>失败阶段</dt><dd>{STAGE_LABELS[diagnostic.stage]}</dd></div>
          <div><dt>插件版本</dt><dd>{diagnostic.plugin.version}</dd></div>
          {diagnostic.subject && <div className="plugin-diagnostic-wide"><dt>冲突对象</dt><dd>
            {diagnostic.subject.kind} · {diagnostic.subject.id}
            {diagnostic.subject.ownerPluginId ? ` · 当前归属 ${diagnostic.subject.ownerPluginId}` : ""}
          </dd></div>}
        </dl>
        <details className="plugin-diagnostic-detail">
          <summary>技术详情</summary>
          <pre>{diagnostic.detail}</pre>
        </details>
      </div>
      <footer className="plugin-diagnostic-actions">
        <button type="button" className="button" onClick={() => { void copyReport(diagnostic).then(() => setCopied(true)); }}>
          {copied ? "已复制报告" : "复制诊断报告"}
        </button>
        <button type="button" className="button" onClick={() => window.location.reload()}>重新加载</button>
        <Dialog.Close type="button" className="button button-primary">继续使用</Dialog.Close>
      </footer>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
