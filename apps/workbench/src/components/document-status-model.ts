export type DocumentSaveState = "unsaved" | "saved" | "saving" | "error";

const LABELS: Readonly<Record<DocumentSaveState, string>> = {
  unsaved: "未保存",
  saved: "已保存",
  saving: "保存中…",
  error: "保存失败",
};

export function documentStatusModel(title: string | undefined, state: DocumentSaveState = "unsaved") {
  if (!title) return null;
  const label = LABELS[state];
  return {
    title,
    label,
    ariaLabel: `文档：${title}，${label}`,
    stateClassName: `document-state document-state-${state}`,
  } as const;
}
