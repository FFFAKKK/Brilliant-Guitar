import * as Dialog from "@radix-ui/react-dialog";

type PendingDocumentAction = { readonly kind: "new" } | { readonly kind: "open"; readonly file: File }
  | { readonly kind: "open-native" } | { readonly kind: "close-native" };

interface Props {
  readonly action: PendingDocumentAction | null;
  readonly saving: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onDiscard: () => void;
  readonly onSaveAndContinue: () => void;
}

export function UnsavedChangesDialog({ action, saving, onOpenChange, onDiscard, onSaveAndContinue }: Props) {
  const openingFile = action?.kind === "open" || action?.kind === "open-native";
  const closingWindow = action?.kind === "close-native";
  const title = closingWindow ? "关闭 Brilliant Guitar" : openingFile ? "打开乐谱" : "新建乐谱";
  const target = action?.kind === "open" ? `打开「${action.file.name}」`
    : openingFile ? "打开另一份乐谱" : closingWindow ? "关闭应用" : "创建一份新乐谱";
  return <Dialog.Root open={action !== null} onOpenChange={onOpenChange}>
    <Dialog.Portal><Dialog.Overlay className="dialog-overlay" />
      <Dialog.Content className="about-dialog unsaved-changes-dialog">
        <Dialog.Title className="dialog-title">{title}</Dialog.Title>
        <Dialog.Description className="dialog-description">当前作品还有未保存的修改。{target}前要如何处理？</Dialog.Description>
        <div className="dialog-actions">
          <Dialog.Close className="button" disabled={saving}>取消</Dialog.Close>
          <button className="button" onClick={onDiscard} disabled={saving}>放弃修改</button>
          <button className="button button-primary" onClick={onSaveAndContinue} disabled={saving}>{saving ? "正在保存…" : "保存并继续"}</button>
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
