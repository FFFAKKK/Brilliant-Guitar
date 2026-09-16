interface Props {
  readonly title?: string | undefined;
  readonly state?: "unsaved" | "saved" | "saving" | "error" | undefined;
}

const LABELS = { unsaved: "未保存", saved: "已保存", saving: "保存中…", error: "保存失败" } as const;

export function DocumentStatus({ title, state = "unsaved" }: Props) {
  if (!title) return null;
  return (
    <div className="document-status" title={title} aria-label={`文档：${title}，${LABELS[state]}`}>
      <span className="document-title">{title}</span>
      <span className={`document-state document-state-${state}`}>{LABELS[state]}</span>
    </div>
  );
}
