import { useEffect, useRef, useState } from "react";
import { Icon } from "./icons.tsx";
import { decodeTextResourceFile, MAX_TEXT_RESOURCE_BYTES, MAX_TEXT_RESOURCES, type TextResourcesSnapshot } from "../contracts/resources.ts";

export function ResourcePanel({ resources, disabled, action, onBusyChange }: {
  readonly resources: TextResourcesSnapshot;
  readonly disabled: boolean;
  readonly action: (path: string, body: unknown) => Promise<unknown>;
  readonly onBusyChange: (busy: boolean) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const currentSession = useRef(resources.sessionId);
  currentSession.current = resources.sessionId;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { setError(""); }, [resources.sessionId]);

  async function change(operation: () => Promise<void>): Promise<void> {
    if (busy || disabled) return;
    const sessionId = resources.sessionId;
    setBusy(true); onBusyChange(true); setError("");
    try { await operation(); }
    catch (failure) {
      if (currentSession.current === sessionId) setError(failure instanceof Error ? failure.message : "资料操作失败，请重试");
    }
    finally { setBusy(false); onBusyChange(false); }
  }

  return <section className="resource-panel" aria-label="本次会话资料">
    <div className="resource-toolbar"><button type="button" className="subtle-button resource-add" disabled={disabled || busy || resources.items.length >= MAX_TEXT_RESOURCES}
      onClick={() => input.current?.click()}><Icon name="plus"/><span>{busy ? "正在处理资料…" : "添加文本"}</span></button>
      <span className="resource-limits">TXT / MD · 最多 3 份 · 每份 32 KiB</span></div>
    <input ref={input} type="file" className="resource-file-input" accept=".txt,.md,text/plain,text/markdown" aria-label="选择文本资料"
      disabled={disabled || busy} onChange={(event) => {
        const file = event.target.files?.[0]; event.target.value = "";
        if (!file) return;
        const sessionId = resources.sessionId;
        void change(async () => {
          if (file.size > MAX_TEXT_RESOURCE_BYTES) throw new Error("每份文本最多 32KiB，请选择较小的文件");
          const text = decodeTextResourceFile(file.name, new Uint8Array(await file.arrayBuffer()));
          if (currentSession.current !== sessionId) throw new Error("会话已变化，请重新选择资料");
          await action("resources/add", { sessionId, name: file.name, text });
        });
      }}/>
    {resources.items.length > 0 && <><ul className="resource-list">{resources.items.map((resource) => <li key={resource.resourceId}>
      <span className="resource-name" title={resource.name}>{resource.name}</span><span className="resource-size">{resource.byteLength < 1024 ? `${resource.byteLength} B` : `${(resource.byteLength / 1024).toFixed(1)} KiB`}</span>
      <button type="button" className="icon-button resource-remove" aria-label={`移除 ${resource.name}`} disabled={disabled || busy}
        onClick={() => void change(async () => { await action("resources/remove", { sessionId: resources.sessionId, resourceId: resource.resourceId }); })}><Icon name="close"/></button>
    </li>)}</ul><p className="resource-notice">临时资料在切换会话或退出后移除。添加后，发送消息让 Agent 读取。</p></>}
    {error && <p className="feedback error" role="alert">{error}</p>}
  </section>;
}
