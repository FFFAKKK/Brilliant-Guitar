import * as Dialog from "@radix-ui/react-dialog";
import type { RefObject } from "react";

interface AboutDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly returnFocusRef: RefObject<HTMLButtonElement | null>;
}

export function AboutDialog({ open, onOpenChange, returnFocusRef }: AboutDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          className="about-dialog"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            returnFocusRef.current?.focus();
          }}
        >
          <Dialog.Title className="dialog-title">Brilliant Guitar</Dialog.Title>
          <Dialog.Description className="dialog-description">乐谱创作工作台</Dialog.Description>
          <Dialog.Close className="button">关闭</Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
