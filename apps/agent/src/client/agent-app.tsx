import { useEffect, useRef, useState } from "react";
import { useAgent } from "./use-agent.ts";
import { SettingsDialog } from "./settings-dialog.tsx";
import { Icon } from "./icons.tsx";
import { ConversationSidebar } from "./conversation-sidebar.tsx";
import { ChatMessage } from "./chat-message.tsx";
import { ResourcePanel } from "./resource-panel.tsx";

export function AgentApp() {
  const { snapshot, connected, error, action, clearError } = useAgent();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [changingSession, setChangingSession] = useState(false);
  const [resourceBusy, setResourceBusy] = useState(false);
  const messagesEnd = useRef<HTMLDivElement>(null);
  const scrollArea = useRef<HTMLDivElement>(null);
  const followOutput = useRef(true);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const session = snapshot?.session;
  const active = session?.status === "running" || session?.status === "cancelling" || snapshot?.testingConnection === true;
  const ready = connected && session?.enabled && !active && !sending && !changingSession && !resourceBusy;
  useEffect(() => { if (followOutput.current) messagesEnd.current?.scrollIntoView({ block: "end" }); }, [session?.sequence]);
  useEffect(() => { setInput(""); followOutput.current = true; messagesEnd.current?.scrollIntoView({ block: "end" }); }, [session?.sessionId]);

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

  return <div className="agent-app">
    {snapshot && <ConversationSidebar conversations={snapshot.conversations} disabled={!connected || Boolean(active) || sending || changingSession || resourceBusy} action={changeConversation} open={sessionsOpen} onClose={() => setSessionsOpen(false)} onNavigate={() => { setSessionsOpen(false); clearError(); inputRef.current?.focus(); }}/>}
    <main className="agent-main">
    <header className="app-header"><div className="app-identity"><button className="icon-button mobile-sessions-button" aria-label="打开会话列表" aria-haspopup="dialog" disabled={!snapshot} onClick={() => setSessionsOpen(true)}><Icon name="sidebar"/></button><span className="brand-mark"><Icon name="agent"/></span><h1>Agent</h1><span className="model-label">{snapshot?.configuration.modelId ?? "正在连接"}</span></div>
      <nav aria-label="Agent 操作"><button className="subtle-button" aria-label="新会话" disabled={!connected || sending || changingSession || resourceBusy} onClick={() => void changeConversation("session/reset", {}).then(() => { clearError(); inputRef.current?.focus(); }).catch(() => undefined)}><Icon name="plus"/><span>新会话</span></button>
        <button className="icon-button" aria-label="打开 Agent 设置" disabled={!snapshot} onClick={() => setSettingsOpen(true)}><Icon name="settings"/></button></nav></header>
    <div className="conversation" ref={scrollArea} onScroll={() => {
      const area = scrollArea.current;
      if (area) followOutput.current = area.scrollHeight - area.scrollTop - area.clientHeight < 80;
    }}>
      {session?.messages.length && snapshot ? <div className="message-list" aria-label="对话记录">{session.messages.map((message) =>
        <ChatMessage key={message.id} message={message} session={session} activities={snapshot.activities}/>
      )}</div> : <div className="empty-state"><span className="empty-symbol"><Icon name="agent"/></span><span className="eyebrow">你的独立 Agent</span><h2>从一句话开始。</h2>
        <p>连接你的模型，开始一段对话。</p><button className="subtle-button" disabled={!snapshot} onClick={() => setSettingsOpen(true)}>{snapshot?.credentialPresent ? "查看模型设置" : "配置模型"}<span aria-hidden="true">↗</span></button></div>}
      <div ref={messagesEnd}/>
    </div>
    <footer className="composer-area"><div className="composer-container">
      {snapshot && <ResourcePanel resources={snapshot.resources} disabled={!connected || Boolean(active) || sending || changingSession} action={action} onBusyChange={setResourceBusy}/>}
      {!connected && <div className="feedback" role="status">正在连接 Agent 宿主…</div>}
      {error && <div className="feedback error" role="alert">{error}</div>}
      {snapshot?.conversations.notice && <div className="feedback error unsaved-feedback" role="alert"><span>{snapshot.conversations.notice}</span><button className="text-button" disabled={Boolean(active) || snapshot.conversations.saving || !connected} onClick={() => void action("conversations/save", {}).catch(() => undefined)}>重试保存</button></div>}
      {connected && session && !session.enabled && <div className="activation-bar"><span>{snapshot?.credentialPresent ? "模型已配置，启用后即可开始。" : "先配置模型，再手动启用 Agent。"}</span>
        <button disabled={sending} onClick={() => snapshot?.credentialPresent ? void action("session/enable", { enabled: true }).catch(() => undefined) : setSettingsOpen(true)}>{snapshot?.credentialPresent ? "启用 Agent" : "打开设置"}</button></div>}
      <form className="composer" onSubmit={(event) => { event.preventDefault(); void send(); }}>
        <textarea ref={inputRef} aria-label="发送给 Agent 的消息" placeholder={session?.enabled ? "有什么想聊的？" : "启用 Agent 后开始对话"} value={input} rows={3} maxLength={30000} disabled={!connected || !session?.enabled || changingSession} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(); }
        }}/>
        <div className="composer-actions"><span className="keyboard-hint">Enter 发送 · Shift + Enter 换行</span>{active ? <button className="stop-button" type="button" disabled={session?.status === "cancelling"} onClick={() => void action("session/cancel", {}).catch(() => undefined)}><span className="stop-mark"/>{session?.status === "cancelling" ? "正在停止" : "停止"}</button>
          : <button className="primary-button send-button" type="submit" disabled={!ready || !input.trim()} aria-label="发送消息"><Icon name="send"/><span>发送</span></button>}</div>
      </form>
      <div className="status-bar" role="status"><span className={`status-dot ${active ? "active" : session?.enabled ? "enabled" : ""}`}/><span>{snapshot?.testingConnection ? "正在测试连接" : session?.message ?? "等待宿主连接"}</span>
        {session && session.omittedHistoryTurns > 0 && <span className="history-notice">已省略 {session.omittedHistoryTurns} 轮较早上下文</span>}</div>
    </div></footer>
    </main>
    {settingsOpen && snapshot && <SettingsDialog snapshot={snapshot} action={action} onClose={() => setSettingsOpen(false)}/>}
  </div>;
}
