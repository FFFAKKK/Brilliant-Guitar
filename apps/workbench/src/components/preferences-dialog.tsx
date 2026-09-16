import * as Dialog from "@radix-ui/react-dialog";
import type { RefObject } from "react";

interface Props {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly animationsEnabled: boolean;
  readonly onAnimationsChange: (enabled: boolean) => void;
  readonly returnFocusRef: RefObject<HTMLButtonElement | null>;
}

/** One setting now; this is the shared entry point for future workbench preferences. */
export function PreferencesDialog({ open, onOpenChange, animationsEnabled, onAnimationsChange, returnFocusRef }: Props) {
  return <Dialog.Root open={open} onOpenChange={onOpenChange}>
    <Dialog.Portal>
      <Dialog.Overlay className="dialog-overlay" />
      <Dialog.Content className="preferences-dialog" onCloseAutoFocus={(event) => { event.preventDefault(); returnFocusRef.current?.focus(); }}>
        <Dialog.Title className="dialog-title">界面设置</Dialog.Title>
        <Dialog.Description className="dialog-description">工作台的视觉动态效果。</Dialog.Description>
        <label className="preferences-motion-row" htmlFor="preferences-animations">
          <span className="preferences-motion-copy"><span>界面动画</span><span className="preferences-motion-hint" id="preferences-animation-hint">
            控制音符过渡和光标闪烁；系统减少动态效果始终优先。
          </span></span>
          <input id="preferences-animations" className="preferences-motion-switch" type="checkbox" role="switch"
            checked={animationsEnabled} onChange={(event) => onAnimationsChange(event.target.checked)}
            aria-describedby="preferences-animation-hint" />
        </label>
        <Dialog.Close className="button preferences-close">完成</Dialog.Close>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
