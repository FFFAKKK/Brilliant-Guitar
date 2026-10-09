import type { ContextSelectionReportV1, ToolFeedbackAdmissionReportV1 } from "@brilliant-guitar/agent-runtime";
import type { DiagnosticsState } from "./diagnostics-coordinator.ts";

const number = (value: number) => value.toLocaleString("zh-CN");
const omissionLabels: Record<ContextSelectionReportV1["omitted"][number]["reason"], string> = {
  duplicate: "重复项", "item-count-budget": "项数限制", "token-budget": "上下文预算", "history-turn-budget": "历史轮数限制",
  expired: "已过期", "invalid-estimate": "无效估算", "out-of-scope": "超出作用域", "identity-conflict": "身份冲突",
  "invalid-content": "无效内容", "version-mismatch": "版本不匹配", "model-input-budget": "模型输入预算",
};
const admissionLabels: Record<ToolFeedbackAdmissionReportV1["status"], string> = {
  admitted: "本组通过预算检查", blocked: "空间不足，本组未执行", unsupported: "本组不支持预检，未执行", "contract-error": "读取检查发现数据不一致",
};
const admissionReasons: Record<ToolFeedbackAdmissionReportV1["reason"], string> = {
  fit: "这是执行前检查。实际完成情况请看“本次活动”。",
  "context-budget": "本组最小合法反馈超出上下文预算。此前完成的读取仍然保留。",
  "input-budget": "本组最小合法反馈超出模型输入预算。此前完成的读取仍然保留。",
  "input-limit": "本组最小合法反馈超出请求结构或大小限制。提高输入预算可能无法解决。",
  "unsupported-provider": "当前决策提供方不支持输入预检。", "unsupported-tool": "本组工具不支持不可变读取预检。",
  "invalid-context": "上下文验证没有通过，已停止后续处理。", "invalid-preview": "读取预览验证没有通过，已停止后续处理。",
  "preview-execution-mismatch": "预览与实际结果不一致，已停止后续处理。已完成项以活动为准。",
};

export function RunDiagnosticsPanel({ state, disconnected, onRefresh, onOpenBudget, onResources }: {
  readonly state: DiagnosticsState; readonly disconnected: boolean; readonly onRefresh: () => void;
  readonly onOpenBudget: ((trigger: HTMLElement) => void) | undefined; readonly onResources: () => void;
}) {
  if (disconnected) return <p className="inspector-description" role="status">宿主连接已断开。重新连接后读取本次运行说明。</p>;
  if (state.phase === "error") return <div className="diagnostics-empty" role="status"><h3>暂时无法读取运行说明</h3>
    <p className="diagnostics-caption">这只影响诊断面板，对话仍可继续。</p><button onClick={onRefresh}>刷新诊断</button></div>;
  if (!state.data) return <p className="inspector-description" role="status">正在读取运行说明…</p>;
  const data = state.data;
  if (data.availability !== "available") {
    const labels = { pending: "正在准备本次输入", "no-current-run": "当前没有运行诊断", disabled: "Agent 已停用",
      "configuration-changed": "设置已更新，发送新消息后生成新的诊断", unavailable: "当前运行诊断不可用" };
    return <div className="diagnostics-empty" role="status"><h3>{labels[data.availability]}</h3>
      <p className="diagnostics-caption">这里只显示当前运行的报告。恢复的历史记录不会补填估算。</p>
      {data.availability === "unavailable" && <button onClick={onRefresh}>刷新诊断</button>}</div>;
  }
  const input = data.modelInput, selection = data.contextSelection, admission = data.admission;
  const omissions = new Map<ContextSelectionReportV1["omitted"][number]["reason"], number>();
  for (const item of selection?.omitted ?? []) omissions.set(item.reason, (omissions.get(item.reason) ?? 0) + 1);
  const budgetBlocked = input?.status === "budget-exceeded" || admission?.status === "blocked";
  return <>
    <section className="diagnostics-section"><h3>模型输入<span>最后一次准备</span></h3>
      {input ? <><div className="diagnostics-number">≈ {number(input.estimatedInputTokens)}<span> / {number(input.inputTokenBudget)} tokens</span></div>
        <p className={`diagnostics-caption ${input.status === "budget-exceeded" ? "diagnostics-warning" : ""}`}>{input.status === "ready" ? "本地输入估算，预算检查已通过。" : "本地输入估算已超出当时预算。"}<br/>不表示远端请求已成功。</p>
        <dl className="diagnostics-facts"><div><dt>保留的完整历史</dt><dd>{input.retainedHistoryTurns} 轮</dd></div><div><dt>可用工具</dt><dd>{input.toolCount} 项</dd></div></dl></>
        : <p className="diagnostics-caption">本次尚无模型输入报告。</p>}
      <dl className="diagnostics-facts"><div><dt>供应商实际用量</dt><dd>未提供</dd></div></dl>
    </section>
    <section className="diagnostics-section"><h3>上下文选择<span>当前报告</span></h3>
      {selection ? <><p className="diagnostics-caption">{selection.status === "ready" ? "按当前任务与保留规则选择。" : selection.status === "invalid-context" ? "上下文验证没有通过。" : "上下文超过预算。"}</p>
        <dl className="diagnostics-facts"><div><dt>选中项 / 必须保留项</dt><dd>{selection.selected.length} / {selection.selected.filter((item) => item.protected).length}</dd></div>
          <div><dt>较早对话已省略</dt><dd>{data.omittedHistoryTurns} 轮</dd></div></dl>
        <details className="diagnostics-details"><summary>查看取舍原因</summary>
          <p className="diagnostics-caption">优先保留当前要求、最近完整对话和已执行工具反馈。以下计数按资料项统计，与对话轮数不同。</p>
          {omissions.size ? <dl className="diagnostics-facts">{[...omissions].map(([reason, count]) => <div key={reason}><dt>{omissionLabels[reason]}</dt><dd>{count} 项</dd></div>)}</dl> : <p className="diagnostics-caption">报告中没有省略项。</p>}</details></>
        : <p className="diagnostics-caption">本次暂无上下文选择报告。</p>}
    </section>
    <section className="diagnostics-section"><h3>下一次读取检查</h3>
      {admission ? <><p className={`diagnostics-state ${admission.status === "admitted" ? "" : "diagnostics-warning"}`}>{admissionLabels[admission.status]}</p>
        <p className="diagnostics-caption">{admissionReasons[admission.reason]}</p><details className="diagnostics-details"><summary>查看本组检查</summary>
          <p className="diagnostics-caption">本组 {admission.calls.length} 项候选调用。字节上限不是实际字符数，候选调用不是完成记录。</p>
          <dl className="diagnostics-facts">{admission.calls.map((call, index) => <div key={call.callId}><dt>调用 {index + 1} 结果上限</dt><dd>{call.resultJsonByteLimit === null ? "未分配" : `${number(call.resultJsonByteLimit)} bytes`}</dd></div>)}</dl></details></>
        : <p className="diagnostics-caption">本次暂无读取准入报告。</p>}
      {budgetBlocked && <div className="diagnostics-actions"><button disabled={!onOpenBudget} onClick={(event) => onOpenBudget?.(event.currentTarget)}>检查输入预算</button>
        <button className="subtle-button" onClick={onResources}>查看会话资料</button></div>}
    </section>
  </>;
}
