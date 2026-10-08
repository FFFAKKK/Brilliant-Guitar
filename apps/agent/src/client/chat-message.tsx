import type { AgentChatMessage, AgentSessionSnapshot } from "@brilliant-guitar/agent-runtime";
import type { ToolActivitiesSnapshot } from "../contracts/tool-activities.ts";
import { CopyButton, MessageContent } from "./message-content.tsx";
import { ToolActivities } from "./tool-activities.tsx";

export function ChatMessage({ message, session, activities }: {
  readonly message: AgentChatMessage;
  readonly session: AgentSessionSnapshot;
  readonly activities: ToolActivitiesSnapshot;
}) {
  const failed = message.role === "assistant" && message.status === "failed";
  // Chat file v1 stores status, not a per-message failure reason.
  const currentFailure = failed && session.status === "failed" && session.runId === message.runId;
  return <article className={`chat-message ${message.role}`}>
    <span className="message-author">{message.role === "user" ? "你" : "Agent"}</span>
    {failed && <aside className="reply-notice failed" aria-label="回复未完成" role={currentFailure ? "status" : undefined}>
      <strong>回复未完成</strong>
      <p>{message.content ? "以下仅为中断前的部分回复。" : "未收到回复正文。"}</p>
      <p>{currentFailure && session.message.trim() ? `原因：${session.message}` : "此回复的具体失败原因未保留。"}</p>
    </aside>}
    {message.role === "assistant" && activities.runId === message.runId && <ToolActivities activities={activities}/>}
    {(message.content || !failed) && <MessageContent role={message.role} content={message.content || (
      message.status === "streaming" ? "正在思考…" : message.status === "cancelled" ? "本次请求已停止。" :
      message.status === "interrupted" ? "宿主退出时回复尚未完成。" : "没有收到完整回复。"
    )}/>}
    {message.content && message.status !== "streaming" && <CopyButton text={message.content} label={failed ? "复制部分回复" : "复制消息"}/>}
    {message.status === "cancelled" && <span className="message-meta">已停止</span>}
    {message.status === "interrupted" && <span className="message-meta">回复在宿主退出时中断。你可以重新发送消息。</span>}
  </article>;
}
