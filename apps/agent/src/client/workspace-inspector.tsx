import { useEffect, useRef, type Ref } from "react";
import type { StandaloneAgentSnapshot } from "../contracts/host.ts";
import { Icon } from "./icons.tsx";
import { ResourcePanel } from "./resource-panel.tsx";
import { ToolActivities } from "./tool-activities.tsx";
import { useRunDiagnostics } from "./use-run-diagnostics.ts";
import { RunDiagnosticsPanel } from "./run-diagnostics-panel.tsx";

export type InspectorTab = "resources" | "activities" | "context";

export function WorkspaceInspector({ snapshot, open, tab, onTabChange, disabled, action, onBusyChange, onClose, connected = false, connectionEpoch = 0, onOpenBudget, contextButtonRef }: {
  readonly snapshot: StandaloneAgentSnapshot;
  readonly open: boolean;
  readonly tab: InspectorTab;
  readonly onTabChange: (tab: InspectorTab) => void;
  readonly connected?: boolean;
  readonly connectionEpoch?: number;
  readonly onOpenBudget?: (trigger: HTMLElement) => void;
  readonly contextButtonRef?: Ref<HTMLButtonElement>;
  readonly disabled: boolean;
  readonly action: (path: string, body: unknown) => Promise<unknown>;
  readonly onBusyChange: (busy: boolean) => void;
  readonly onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const diagnostics = useRunDiagnostics(snapshot, open && tab === "context", connected, connectionEpoch);
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    const mobile = window.matchMedia("(max-width: 700px)");
    const present = () => {
      // One mounted resource controller survives layout changes and pending uploads.
      element.close();
      if (open) { if (mobile.matches) element.showModal(); else element.show(); }
    };
    present();
    mobile.addEventListener("change", present);
    return () => mobile.removeEventListener("change", present);
  }, [open]);
  return <dialog ref={dialog} id="workspace-inspector" className="workspace-inspector" aria-label="会话检查区"
    onClose={() => { if (!dialog.current?.open) onClose(); }}
    onCancel={(event) => { event.preventDefault(); onClose(); }}
    onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); onClose(); } }}
    onClick={(event) => {
      if (event.target !== event.currentTarget) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
    }}>
    <header className="inspector-heading"><h2>会话检查区</h2><button className="icon-button" aria-label="关闭检查区" onClick={onClose}><Icon name="close"/></button></header>
    <div className="inspector-tabs" aria-label="检查区内容">
      <button aria-pressed={tab === "resources"} onClick={() => onTabChange("resources")}>会话资料<span>{snapshot.resources.items.length}</span></button>
      <button aria-pressed={tab === "activities"} onClick={() => onTabChange("activities")}>本次活动<span>{snapshot.activities.items.length}</span></button>
      <button ref={contextButtonRef} aria-pressed={tab === "context"} onClick={() => onTabChange("context")}>上下文</button>
    </div>
    <div className="inspector-content">
      <section hidden={tab !== "resources"}>
        <p className="inspector-description">添加的资料可供 Agent 读取，正文会在工具读取成功后发送给模型。</p>
        <ResourcePanel resources={snapshot.resources} disabled={disabled} action={action} onBusyChange={onBusyChange}/>
        {!snapshot.resources.items.length && <div className="inspector-empty"><Icon name="file"/><p>还没有添加资料</p><span>选择 TXT 或 Markdown 文件，<br/>再在对话中告诉 Agent 你的任务。</span></div>}
      </section>
      <section hidden={tab !== "activities"}>
        <p className="inspector-description">这里只显示本次运行的工具活动。工具完成后，回答可能仍在继续。</p>
        <ToolActivities activities={snapshot.activities}/>
        {!snapshot.activities.items.length && <div className="inspector-empty"><Icon name="activity"/><p>暂无工具活动</p><span>Agent 调用工具后，<br/>可以在这里查看执行情况。</span></div>}
      </section>
      <section hidden={tab !== "context"} aria-label="当前运行上下文"><RunDiagnosticsPanel state={diagnostics} disconnected={diagnostics.disconnected}
        onRefresh={diagnostics.refresh} onOpenBudget={onOpenBudget} onResources={() => onTabChange("resources")}/></section>
    </div>
  </dialog>;
}
