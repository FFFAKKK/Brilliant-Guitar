import type { ToolActivitiesSnapshot } from "../contracts/tool-activities.ts";

const labels = { running: "正在执行", completed: "已完成", failed: "失败", cancelled: "已停止" };
export function ToolActivities({ activities }: { readonly activities: ToolActivitiesSnapshot }) {
  if (!activities.items.length) return null;
  return <div className="tool-activities" aria-label="工具活动">{activities.items.map((item) => <details className={`tool-card ${item.status}`} key={item.invocationId}>
    <summary><span className={`tool-status-mark ${item.status}`} aria-hidden="true"/><span className="tool-label">{item.label}</span><span className="tool-state">{labels[item.status]}</span></summary>
    <div className="tool-card-detail"><span>调用：{item.invocationId}</span><span>开始：{new Date(item.startedAt).toLocaleTimeString()}</span>
      {item.finishedAt !== null && <span>结束：{new Date(item.finishedAt).toLocaleTimeString()}</span>}
      {item.status === "failed" && <span className="failed">工具未完成，请检查资料或重新发送任务。{item.errorCode && ` (${item.errorCode})`}</span>}
      {item.status === "cancelled" && <span>本次工具调用已停止。</span>}</div>
  </details>)}</div>;
}
