import type {
  AgentApprovalPreview,
  AgentFieldChangeApprovalPreview,
  AgentRequiredApproval,
} from "../agent/agent-contracts.ts";

const RISK_LABELS = {
  low: "低风险",
  medium: "中风险",
  high: "高风险",
} as const;

const SCOPE_LABELS = {
  none: "应用",
  document: "当前乐谱",
  range: "乐谱范围",
  entity: "乐谱对象",
} as const;

const FIELD_LABELS: Readonly<Record<string, string>> = {
  "score.title": "作品标题",
  "score.tempo": "作品速度",
};

function FieldChangePreview({ preview }: Readonly<{ preview: AgentFieldChangeApprovalPreview }>) {
  return <div className="agent-approval-preview" data-preview-kind={preview.kind}>
    <span>{FIELD_LABELS[preview.field] ?? preview.field}</span>
    <div className="agent-approval-preview-values">
      {preview.before === null ? null : <>
        <small>原值</small>
        <strong>{preview.before || "空值"}</strong>
      </>}
      <small>修改后</small>
      <strong>{preview.after || "空值"}</strong>
    </div>
  </div>;
}

function ApprovalPreview({ preview }: Readonly<{ preview: AgentApprovalPreview }>) {
  if (preview.kind === "field-change") return <FieldChangePreview preview={preview} />;
  return <div className="agent-approval-change-list" data-preview-kind={preview.kind}>
    {preview.changes.map((change) => <FieldChangePreview key={change.field} preview={change} />)}
  </div>;
}

export function AgentRequiredApprovalSummary({ approval }: Readonly<{
  approval: AgentRequiredApproval;
}>) {
  return <section className="agent-approval-summary" aria-label="待批准操作">
    <strong>{approval.prompt}</strong>
    <div className="agent-approval-items">
      {approval.items.map((item) => <div key={item.invocationId} className="agent-approval-item"
        data-risk={item.riskLevel}>
        <div className="agent-approval-item-head">
          <span>{item.capabilityName}</span>
          <small>{RISK_LABELS[item.riskLevel]}</small>
        </div>
        <p>{item.summary}</p>
        {item.preview == null ? null : <ApprovalPreview preview={item.preview} />}
        <div className="agent-approval-meta">
          <span>{SCOPE_LABELS[item.scope.limit]}</span>
          {item.changeSetId == null
            ? null
            : <span title={item.changeSetId}>变更集 {item.changeSetId.slice(7, 19)}</span>}
          <span>{item.riskReasons.join(" · ")}</span>
        </div>
      </div>)}
    </div>
  </section>;
}
