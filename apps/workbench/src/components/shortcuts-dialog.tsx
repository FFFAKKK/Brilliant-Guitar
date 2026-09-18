import * as Dialog from "@radix-ui/react-dialog";
import type { RefObject } from "react";

interface Props {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly returnFocusRef: RefObject<HTMLButtonElement | null>;
}

const SHORTCUTS = [
  ["Ctrl / ⌘ + N", "新建乐谱"],
  ["Ctrl / ⌘ + O", "打开乐谱文件"],
  ["Ctrl / ⌘ + S", "保存当前乐谱"],
  ["A–G，然后 2–6", "输入音名与组号"],
  ["R", "输入休止符"],
  ["Esc", "清除草稿或取消选择"],
  ["← / →", "在已选音符之间移动"],
  ["Shift + ← / →", "扩展或收缩连续选择"],
  ["Shift + 单击", "选择同一小节内的连续内容"],
  ["Ctrl / ⌘ + C / X / V", "复制、剪切或插入式粘贴"],
  ["Delete", "删除当前选中的音符或末尾休止符"],
  ["Ctrl / ⌘ + Z", "撤销"],
  ["Ctrl / ⌘ + Shift + Z", "重做"],
] as const;

export function ShortcutsDialog({ open, onOpenChange, returnFocusRef }: Props) {
  return <Dialog.Root open={open} onOpenChange={onOpenChange}><Dialog.Portal><Dialog.Overlay className="dialog-overlay" />
    <Dialog.Content className="about-dialog shortcuts-dialog" onCloseAutoFocus={(event) => { event.preventDefault(); returnFocusRef.current?.focus(); }}>
      <Dialog.Title className="dialog-title">键盘操作</Dialog.Title>
      <Dialog.Description className="dialog-description">当前工作台支持的快捷键</Dialog.Description>
      <dl className="shortcut-list">{SHORTCUTS.map(([key, description]) => <div className="shortcut-row" key={key}><dt><kbd>{key}</kbd></dt><dd>{description}</dd></div>)}</dl>
      <Dialog.Close className="button">关闭</Dialog.Close>
    </Dialog.Content>
  </Dialog.Portal></Dialog.Root>;
}
