import { useEffect, useRef, useState } from "react";
import type { ConversationsSnapshot } from "../contracts/conversations.ts";
import { Icon } from "./icons.tsx";

interface Props {
  readonly conversations: ConversationsSnapshot;
  readonly disabled: boolean;
  readonly action: (path: string, body: unknown) => Promise<unknown>;
  readonly onNavigate: () => void;
}
function ConversationList({ conversations, disabled, action, onNavigate }: Props) {
  const [query, setQuery] = useState("");
  const [archived, setArchived] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const selected = conversations.items.find((item) => item.sessionId === conversations.selectedSessionId)!;
  const items = conversations.items.filter((item) => item.archived === archived && item.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())).sort((a, b) => b.updatedAt - a.updatedAt);
  const busy = disabled || pending;
  async function perform(path: string, body: unknown, navigate = false): Promise<void> {
    setPending(true);
    try { await action(path, body); setEditing(null); if (navigate) onNavigate(); }
    catch { /* Shared action reports a stable server error. */ }
    finally { setPending(false); }
  }
  useEffect(() => { setEditing(null); }, [conversations.selectedSessionId]);
  return <>
    <div className="sidebar-heading"><span className="eyebrow">会话</span><button className="icon-button" aria-label="创建新会话" disabled={busy} onClick={() => void perform("session/reset", {}, true)}><Icon name="plus"/></button></div>
    <input type="search" aria-label="搜索会话名称" placeholder="搜索会话" value={query} onChange={(event) => setQuery(event.target.value)}/>
    <div className="session-tabs" aria-label="会话筛选"><button aria-pressed={!archived} onClick={() => setArchived(false)}>最近</button><button aria-pressed={archived} onClick={() => setArchived(true)}>已归档</button></div>
    <div className="session-list" aria-label={archived ? "归档会话列表" : "会话列表"}>
      {items.length ? items.map((item) => <div className="session-row" key={item.sessionId}>
        <button className="session-select" aria-current={item.sessionId === conversations.selectedSessionId ? "true" : undefined} disabled={busy || item.archived} onClick={() => void perform("conversations/select", { sessionId: item.sessionId }, true)}>
          <span className="session-title">{item.title}</span><span className="session-detail">{item.messageCount / 2} 轮 · {new Date(item.updatedAt).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" })}</span>
        </button>
        {item.archived && <button className="text-button restore-session" aria-label={`恢复会话：${item.title}`} disabled={busy} onClick={() => void perform("conversations/archive", { sessionId: item.sessionId, archived: false })}>恢复</button>}
      </div>) : <p className="sidebar-empty">{query ? "没有匹配的会话" : "没有归档会话"}</p>}
    </div>
    {!archived && <div className="selected-session-actions">
      {editing === selected.sessionId ? <form className="rename-form" onSubmit={(event) => { event.preventDefault(); void perform("conversations/rename", { sessionId: selected.sessionId, title: name }); }}>
        <label>会话名称<input aria-label="会话名称" maxLength={80} value={name} autoFocus onChange={(event) => setName(event.target.value)}/></label>
        <div><button type="submit" disabled={busy || !name.trim()}>保存名称</button><button type="button" className="subtle-button" disabled={pending} onClick={() => setEditing(null)}>取消</button></div>
      </form> : <><span className="selected-title" title={selected.title}>{selected.title}</span><div><button className="text-button" disabled={busy} onClick={() => { setEditing(selected.sessionId); setName(selected.title); }}>重命名</button><button className="text-button" disabled={busy} onClick={() => void perform("conversations/archive", { sessionId: selected.sessionId, archived: true })}>归档</button></div></>}
    </div>}
    <div className="sidebar-storage" role="status">{conversations.notice ? "有记录尚未保存" : conversations.saving ? "正在保存…" : conversations.storage === "file" ? "聊天记录保存在本机" : "当前记录仅保留在内存"}</div>
  </>;
}

export function ConversationSidebar(props: Props & { open: boolean; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (props.open) dialog.current?.showModal(); else dialog.current?.close(); }, [props.open]);
  return <>
    <aside className="conversation-sidebar" aria-label="会话管理"><ConversationList {...props}/></aside>
    <dialog className="sessions-dialog" ref={dialog} aria-label="会话管理" onClose={props.onClose} onClick={(event) => { if (event.target === event.currentTarget) props.onClose(); }}>
      <button className="icon-button close-sessions" aria-label="关闭会话列表" onClick={props.onClose}><Icon name="close"/></button>
      <ConversationList {...props}/>
    </dialog>
  </>;
}
