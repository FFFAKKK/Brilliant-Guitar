import { useEffect, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";

import type {
  AgentConversationActivity,
  AgentConversationMessage,
} from "../agent/agent-conversation.ts";
import type { AgentRecoveryProjection } from "../agent/recovery-projection.ts";
import type { AgentAssistantPanelProjection } from "../ui/first-party-plugin-projections.ts";
import { ComponentPlacementMenu } from "./component-placement-menu.tsx";

function AgentIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 7.5h8a3 3 0 0 1 3 3v5a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3v-5a3 3 0 0 1 3-3Z"
    fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="M12 4v3.5M9 12h.01M15 12h.01M9.5 15.2h5"
    fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>;
}

function RefreshIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18.4 8.2A7 7 0 1 0 19 14"
    fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /><path d="M18.4 4.8v3.8h-3.8"
    fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function SendIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 5 14 7-14 7 2.4-7L5 5Z"
    fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /><path d="M7.5 12H19"
    fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>;
}

function StopIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="1.5"
    fill="currentColor" /></svg>;
}

function RecoveryStateIcon({ kind }: { readonly kind: AgentRecoveryProjection["kind"] }) {
  if (kind === "ready-to-resume") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 12 3.1 3.1L17.5 8"
    fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;
  if (kind === "reconciliation-required") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4.5 20 19H4Z"
    fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /><path d="M12 9v4m0 2.8v.1"
    fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>;
  return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7.5" fill="none"
    stroke="currentColor" strokeWidth="1.5" /><path d="M12 8.5v4.2l2.5 1.6" fill="none"
    stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

const KIND_LABELS: Record<AgentRecoveryProjection["kind"], string> = {
  "awaiting-user": "等待用户",
  "ready-to-resume": "可以继续",
  "retry-available": "可以重试",
  "reconciliation-required": "需要核对",
  terminal: "已经结束",
  missing: "记录缺失",
};

const PHASE_LABELS = {
  preparing: "准备",
  planning: "规划",
  executing: "执行",
  verifying: "验证",
} as const;

function passiveActionLabel(action: AgentRecoveryProjection["action"]): string {
  if (action === "approve") return "等待批准入口接入";
  if (action === "provide-input") return "等待输入入口接入";
  if (action === "retry") return "等待重试执行器接入";
  return "无需继续操作";
}

function RecoveryAction({ item, projection }: Readonly<{
  item: AgentRecoveryProjection;
  projection: AgentAssistantPanelProjection;
}>) {
  if (item.action === "resume") return <button type="button" className="agent-recovery-action"
    disabled={projection.runtime.recovery.status === "loading"}
    onClick={() => { void projection.resume(item.runId); }}>准备继续</button>;
  const requiredInput = item.requiredInput;
  if (item.action === "provide-input") return <button type="button" className="agent-recovery-action"
    disabled={projection.runtime.recovery.status === "loading"
      || !projection.selectionAvailable
      || requiredInput?.kind !== "measure-selection"
      || projection.session.requiredInput?.requestId !== requiredInput.requestId
      || projection.session.runId !== item.runId}
    onClick={() => {
      if (requiredInput !== null) void projection.provideRequiredInput(item.runId, requiredInput.requestId);
    }}>
    {projection.selectionAvailable ? "继续任务" : "请先选择小节"}
  </button>;
  if (item.action === "reconcile") return <button type="button" className="agent-recovery-action"
    disabled={projection.runtime.recovery.status === "loading"}
    onClick={() => { void projection.refresh(); }}>重新核对</button>;
  return <span className="agent-recovery-passive-action">{passiveActionLabel(item.action)}</span>;
}

function RecoveryItem({ item, projection }: Readonly<{
  item: AgentRecoveryProjection;
  projection: AgentAssistantPanelProjection;
}>) {
  const phase = item.state?.phase;
  return <article className="agent-recovery-item" data-kind={item.kind}>
    <div className="agent-recovery-item-head">
      <span className="agent-recovery-state-icon"><RecoveryStateIcon kind={item.kind} /></span>
      <span className="agent-recovery-item-title">
        <strong>{item.goal ?? "未命名 Agent Run"}</strong>
        <small>{KIND_LABELS[item.kind]}{phase ? ` · ${PHASE_LABELS[phase]}阶段` : ""}</small>
      </span>
    </div>
    <p>{item.message}</p>
    <div className="agent-recovery-item-foot">
      <code title={item.runId}>{item.runId.slice(0, 12)}</code>
      <RecoveryAction item={item} projection={projection} />
    </div>
  </article>;
}

function providerLabel(projection: AgentAssistantPanelProjection): string {
  const provider = projection.runtime.provider;
  if (provider.providerId === null) return "未配置模型";
  return provider.model === null ? provider.providerId : `${provider.providerId} · ${provider.model}`;
}

const ACTIVITY_STATUS_LABELS: Record<AgentConversationActivity["status"], string> = {
  active: "进行中",
  waiting: "等待选择",
  completed: "已完成",
  failed: "失败",
  cancelled: "已取消",
};

function ConversationActivities({ activities }: Readonly<{
  activities: readonly AgentConversationActivity[];
}>) {
  if (activities.length === 0) return null;
  return <div className="agent-assistant-activities" aria-label="任务进度">
    {activities.map((activity) => <div key={activity.activityId} className="agent-assistant-activity"
      data-status={activity.status}>
      <span className="agent-assistant-activity-dot" aria-hidden="true" />
      <span>{activity.label}</span>
      <small>{ACTIVITY_STATUS_LABELS[activity.status]}</small>
    </div>)}
  </div>;
}

function ConversationMessage({ message, activities }: Readonly<{
  message: AgentConversationMessage;
  activities: readonly AgentConversationActivity[];
}>) {
  const emptyAssistant = message.role === "assistant" && message.content.length === 0;
  return <div className="agent-assistant-message-group">
    <div className="agent-assistant-turn" data-role={message.role} data-status={message.status}>
      <small>{message.role === "user" ? "你" : "Agent"}</small>
      {emptyAssistant
        ? <span className="agent-assistant-thinking" aria-label="Agent 正在处理"><i /><i /><i /></span>
        : <p>{message.content}</p>}
    </div>
    {message.role === "assistant" && <ConversationActivities activities={activities} />}
  </div>;
}

export function AgentAssistantPanel({ projection }: { readonly projection: AgentAssistantPanelProjection }) {
  const [goal, setGoal] = useState("");
  const threadRef = useRef<HTMLDivElement>(null);
  const { runtime, session } = projection;
  const running = session.status === "running" || session.status === "cancelling";
  const submissionActive = session.conversation.activeSubmissionId !== null;
  const canStart = runtime.canStartRun && projection.documentAvailable && !submissionActive && goal.trim().length > 0;
  const submit = (event?: FormEvent): void => {
    event?.preventDefault();
    if (!canStart) return;
    const submittedGoal = goal;
    setGoal("");
    void projection.start(submittedGoal);
  };
  const onComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key !== "Enter" || !(event.ctrlKey || event.metaKey)) return;
    event.preventDefault();
    submit();
  };
  const lastMessage = session.conversation.messages.at(-1);
  const lastActivity = session.conversation.activities.at(-1);
  useEffect(() => {
    const thread = threadRef.current;
    if (thread !== null) thread.scrollTop = thread.scrollHeight;
  }, [lastActivity?.status, lastMessage?.content, lastMessage?.status]);

  return <div className="agent-recovery-dock">
    <section className="agent-recovery agent-assistant" aria-label="Agent 助手" aria-busy={running}>
      <header className="agent-recovery-header">
        <span className="agent-recovery-mark"><AgentIcon /></span>
        <span className="agent-recovery-heading"><strong>Agent 助手</strong><small>{providerLabel(projection)}</small></span>
        <button type="button" className="agent-recovery-refresh" aria-label="刷新 Agent 状态"
          title="刷新状态" disabled={runtime.recovery.status === "loading" || runtime.status === "unavailable" || running}
          onClick={() => { void projection.refresh(); }}><RefreshIcon /></button>
        <ComponentPlacementMenu label="Agent 助手组件" />
      </header>

      <div className="agent-assistant-status" data-status={session.status}>
        <span className="agent-assistant-status-dot" aria-hidden="true" />
        <span>{submissionActive ? session.message : runtime.canStartRun ? session.message : runtime.message}</span>
      </div>

      <div ref={threadRef} className="agent-assistant-thread">
        {session.conversation.messages.length === 0
          ? <div className="agent-assistant-empty"><AgentIcon /><span>{runtime.message}</span></div>
          : session.conversation.messages.map((message) => <ConversationMessage key={message.messageId}
            message={message} activities={session.conversation.activities.filter(
              (activity) => activity.submissionId === message.submissionId,
            )} />)}
        {session.conversation.issue && <p className="agent-assistant-error" role="alert">
          {session.conversation.issue.message}
        </p>}
      </div>

      <form className="agent-assistant-composer" onSubmit={submit}>
        <textarea value={goal} rows={2} maxLength={1200} disabled={submissionActive}
          aria-label="Agent 任务" placeholder="例如：读取当前乐谱概要"
          onChange={(event) => setGoal(event.target.value)} onKeyDown={onComposerKeyDown} />
        {running ? <button type="button" className="agent-assistant-submit" aria-label="取消任务" title="取消任务"
          onClick={projection.cancel}><StopIcon /></button>
          : <button type="submit" className="agent-assistant-submit" aria-label="开始任务" title="开始任务"
            disabled={!canStart}><SendIcon /></button>}
      </form>

      {runtime.recovery.items.length > 0 && <section className="agent-recovery-section" aria-label="需要处理的 Agent 任务">
        <div className="agent-recovery-section-title"><span>需要处理</span><small>{runtime.recovery.items.length}</small></div>
        <div className="agent-recovery-list">
          {runtime.recovery.items.map((item) => <RecoveryItem key={item.runId} item={item} projection={projection} />)}
        </div>
      </section>}
      <span className="visually-hidden" aria-live="polite">{session.message}</span>
    </section>
  </div>;
}

export function AgentAssistantDockIcon() { return <AgentIcon />; }
