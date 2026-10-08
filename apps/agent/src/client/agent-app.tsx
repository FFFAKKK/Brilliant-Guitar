import { useEffect, useRef, useState } from "react";
import { useAgent } from "./use-agent.ts";
import { SettingsDialog } from "./settings-dialog.tsx";
import { Icon } from "./icons.tsx";
import { ConversationSidebar } from "./conversation-sidebar.tsx";
import { ChatMessage } from "./chat-message.tsx";
import { WorkspaceInspector } from "./workspace-inspector.tsx";

export function AgentApp() {
  const { snapshot, connected, error, action, clearError } = useAgent();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [inspectorTab, setInspectorTab] = useState<"resources" | "activities">("resources");
  const inspectorTrigger = useRef<HTMLElement | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [changingSession, setChangingSession] = useState(false);
  const [resourceBusy, setResourceBusy] = useState(false);
  const messagesEnd = useRef<HTMLDivElement>(null);
  const scrollArea = useRef<HTMLDivElement>(null);
  const followOutput = useRef(true);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const navigationFocus = useRef(false);
  const session = snapshot?.session;
  const active = session?.status === "running" || session?.status === "cancelling" || snapshot?.testingConnection === true;
  const ready = connected && session?.enabled && !active && !sending && !changingSession && !resourceBusy;
  const selected = snapshot?.conversations.items.find((item) => item.sessionId === session?.sessionId);
  useEffect(() => { if (followOutput.current) messagesEnd.current?.scrollIntoView({ block: "end" }); }, [session?.sequence]);
  useEffect(() => { setInput(""); navigationFocus.current = true; followOutput.current = true; messagesEnd.current?.scrollIntoView({ block: "end" }); }, [session?.sessionId]);
  useEffect(() => {
    // Focus only after React has removed the navigation guard and the native dialog has closed.
    if (navigationFocus.current && !changingSession && !sessionsOpen && connected && session?.enabled) {
      navigationFocus.current = false; inputRef.current?.focus();
    }
  }, [changingSession, sessionsOpen, connected, session?.enabled, session?.sessionId]);

  function openInspector(trigger: HTMLElement) { inspectorTrigger.current = trigger; setInspectorOpen(true); }
  function closeInspector() { setInspectorOpen(false); inspectorTrigger.current?.focus(); }
  function toggleSidebar() {
    // An explicit request for sessions closes the inspector; closing the inspector alone restores the preference.
    if (inspectorOpen) { setInspectorOpen(false); setSidebarCollapsed(false); }
    else setSidebarCollapsed(!sidebarCollapsed);
  }

  async function changeConversation(path: string, body: unknown): Promise<unknown> {
    setChangingSession(true);
    try { return await action(path, body); }
    finally { setChangingSession(false); }
  }

  async function send() {
    if (!ready || !input.trim()) return;
    const message = input;
    setSending(true); followOutput.current = true;
    try { await action("session/messages", { message }); setInput(""); inputRef.current?.focus(); }
    catch { /* The shared request handler displays the error and retains the draft. */ }
    finally { setSending(false); }
  }

  async function cancel() {
    try { await action("session/cancel", {}); inputRef.current?.focus(); }
    catch { /* The shared request handler displays the error. */ }
  }

  return <div className="agent-app">
    {snapshot && <ConversationSidebar conversations={snapshot.conversations} disabled={!connected || Boolean(active) || sending || changingSession || resourceBusy} action={changeConversation} open={sessionsOpen} collapsed={sidebarCollapsed || inspectorOpen} onToggle={toggleSidebar} onClose={() => setSessionsOpen(false)} onNavigate={() => { setSessionsOpen(false); clearError(); inputRef.current?.focus(); }}/>}
    <main className="agent-main">
    <header className="app-header"><div className="app-identity"><button className="icon-button desktop-sessions-button" aria-label={sidebarCollapsed || inspectorOpen ? "展开会话栏" : "收起会话栏"} aria-expanded={!sidebarCollapsed && !inspectorOpen} disabled={!snapshot} onClick={toggleSidebar}><Icon name="sidebar"/></button><button className="icon-button mobile-sessions-button" aria-label="打开会话列表" aria-haspopup="dialog" disabled={!snapshot} onClick={() => setSessionsOpen(true)}><Icon name="sidebar"/></button><h1 title={selected?.title}>{selected?.title ?? "Agent"}</h1></div>
      <nav aria-label="Agent 操作"><button className="subtle-button" aria-label="新会话" disabled={!connected || sending || changingSession || resourceBusy} onClick={() => void changeConversation("session/reset", {}).then(() => { clearError(); inputRef.current?.focus(); }).catch(() => undefined)}><Icon name="plus"/><span>新会话</span></button>
        <button className="icon-button inspector-toggle" aria-label={inspectorOpen ? "收起资料与活动" : "打开资料与活动"} aria-expanded={inspectorOpen} aria-controls="workspace-inspector" disabled={!snapshot} onClick={(event) => inspectorOpen ? closeInspector() : openInspector(event.currentTarget)}><Icon name="file"/></button>
        <button className="icon-button" aria-label="打开 Agent 设置" disabled={!snapshot} onClick={() => setSettingsOpen(true)}><Icon name="settings"/></button></nav></header>
    <div className="conversation" ref={scrollArea} tabIndex={0} role="region" aria-label="聊天内容" onScroll={() => {
      const area = scrollArea.current;
      if (area) followOutput.current = area.scrollHeight - area.scrollTop - area.clientHeight < 80;
    }}>
      {session?.messages.length && snapshot ? <div className="message-list" aria-label="对话记录">{session.messages.map((message) =>
        <ChatMessage key={message.id} message={message} session={session} activities={snapshot.activities}/>
      )}</div> : <div className="empty-state"><span className="empty-symbol"><Icon name="agent"/></span><h2>想从哪里开始？</h2>
        <p>聊一个想法，或添加资料一起梳理。</p>{!snapshot?.credentialPresent && <button className="subtle-button" disabled={!snapshot} onClick={() => setSettingsOpen(true)}>配置模型<span aria-hidden="true">↗</span></button>}</div>}
      <div ref={messagesEnd}/>
    </div>
    <footer className="composer-area"><div className="composer-container">
      {!connected && <div className="feedback" role="status">正在连接 Agent 宿主…</div>}
      {error && <div className="feedback error" role="alert">{error}</div>}
      {snapshot?.conversations.notice && <div className="feedback error unsaved-feedback" role="alert"><span>{snapshot.conversations.notice}</span><button className="text-button" disabled={Boolean(active) || snapshot.conversations.saving || !connected} onClick={() => void action("conversations/save", {}).catch(() => undefined)}>重试保存</button></div>}
      {connected && session && !session.enabled && <div className="activation-bar"><span>{snapshot?.credentialPresent ? "模型已配置，启用后即可开始。" : "先配置模型，再手动启用 Agent。"}</span>
        <button disabled={sending} onClick={() => snapshot?.credentialPresent ? void action("session/enable", { enabled: true }).catch(() => undefined) : setSettingsOpen(true)}>{snapshot?.credentialPresent ? "启用 Agent" : "打开设置"}</button></div>}
      <form className="composer" onSubmit={(event) => { event.preventDefault(); void send(); }}>
        <textarea ref={inputRef} aria-label="发送给 Agent 的消息" placeholder={session?.enabled ? "发送消息，或描述你希望完成的任务…" : "启用 Agent 后开始对话"} value={input} rows={2} maxLength={30000} disabled={!connected || !session?.enabled || changingSession} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(); }
        }}/>
        <div className="composer-actions"><div className="composer-context"><button type="button" className="subtle-button attachment-button" aria-label="查看会话资料" aria-controls="workspace-inspector" aria-expanded={inspectorOpen} disabled={!snapshot} onClick={(event) => { setInspectorTab("resources"); openInspector(event.currentTarget); }}><Icon name="file"/><span>资料{snapshot?.resources.items.length ? ` · ${snapshot.resources.items.length}` : ""}</span></button><button type="button" className="subtle-button model-button" title={snapshot?.configuration.modelId} aria-label="查看模型设置" disabled={!snapshot} onClick={() => setSettingsOpen(true)}>{snapshot?.configuration.modelId ?? "正在连接"}</button></div>{active ? <button className="stop-button" type="button" disabled={session?.status === "cancelling"} onClick={() => void cancel()}><span className="stop-mark"/>{session?.status === "cancelling" ? "正在停止" : "停止"}</button>
          : <button className="primary-button send-button" type="submit" disabled={!ready || !input.trim()} aria-label="发送消息"><Icon name="send"/></button>}</div>
      </form>
      <div className="status-bar" role="status"><span className={`status-dot ${active ? "active" : session?.enabled ? "enabled" : ""}`}/><span>{snapshot?.testingConnection ? "正在测试连接" : session?.message ?? "等待宿主连接"}</span>
        {session && session.omittedHistoryTurns > 0 && <span className="history-notice">已省略 {session.omittedHistoryTurns} 轮较早上下文</span>}</div>
      <span className="keyboard-hint">Enter 发送 · Shift + Enter 换行</span>
    </div></footer>
    </main>
    {snapshot && <WorkspaceInspector snapshot={snapshot} open={inspectorOpen} tab={inspectorTab} onTabChange={setInspectorTab} disabled={!connected || Boolean(active) || sending || changingSession} action={action} onBusyChange={setResourceBusy} onClose={closeInspector}/>}
    {settingsOpen && snapshot && <SettingsDialog snapshot={snapshot} action={action} onClose={() => setSettingsOpen(false)}/>}
  </div>;
}
