import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export interface MeasureContextMenuProps {
  readonly x: number;
  readonly y: number;
  readonly measureNumber: number;
  readonly canRemove: boolean;
  readonly onInsertBefore: () => void;
  readonly onInsertAfter: () => void;
  readonly onRemove: () => void;
  readonly onClose: () => void;
}

/** A small score-specific context menu. It owns keyboard and focus behavior, not score mutations. */
export function MeasureContextMenu({ x, y, measureNumber, canRemove, onInsertBefore, onInsertAfter, onRemove,
  onClose }: MeasureContextMenuProps) {
  const menu = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x, y });
  useEffect(() => {
    const element = menu.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    setPosition({ x: Math.max(8, Math.min(x, window.innerWidth - rect.width - 8)),
      y: Math.max(8, Math.min(y, window.innerHeight - rect.height - 8)) });
    element.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus({ preventScroll: true });
    const dismiss = (event: PointerEvent) => { if (!element.contains(event.target as Node)) onClose(); };
    const close = () => onClose();
    window.addEventListener("pointerdown", dismiss, true);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("pointerdown", dismiss, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [onClose, x, y]);
  function run(action: () => void) { action(); onClose(); }
  function moveFocus(offset: -1 | 1) {
    const buttons = [...(menu.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [])];
    if (!buttons.length) return;
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    buttons[(current + offset + buttons.length) % buttons.length]?.focus();
  }
  return createPortal(<div ref={menu} className="measure-context-menu" role="menu"
    aria-label={`第 ${measureNumber} 小节操作`} style={{ left: position.x, top: position.y }}
    onContextMenu={(event) => event.preventDefault()}
    onKeyDown={(event) => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); }
      if (event.key === "ArrowDown") { event.preventDefault(); moveFocus(1); }
      if (event.key === "ArrowUp") { event.preventDefault(); moveFocus(-1); }
      if (event.key === "Home") { event.preventDefault(); menu.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus(); }
      if (event.key === "End") { event.preventDefault(); [...(menu.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [])].at(-1)?.focus(); }
    }}>
    <div className="measure-context-menu-label">第 {measureNumber} 小节</div>
    <button type="button" role="menuitem" onClick={() => run(onInsertBefore)}>在前面插入小节</button>
    <button type="button" role="menuitem" onClick={() => run(onInsertAfter)}>在后面插入小节</button>
    <div className="measure-context-menu-separator" role="separator" />
    <button type="button" role="menuitem" className="measure-context-menu-danger" disabled={!canRemove}
      onClick={() => run(onRemove)}>删除当前小节</button>
  </div>, document.body);
}
