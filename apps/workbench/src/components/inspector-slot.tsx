import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent, PointerEvent, ReactNode } from "react";
import { useCompactWorkbench } from "../workbench/use-compact-workbench";
import { clampInspectorWidth, INSPECTOR_WIDTH, nextInspectorWidth } from "../workbench/inspector-layout";

const STORAGE_KEY = "brilliant.workbench.inspector-width.v1";

function initialWidth() {
  try {
    const stored = Number(localStorage.getItem(STORAGE_KEY));
    return Number.isFinite(stored) ? clampInspectorWidth(stored, window.innerWidth) : INSPECTOR_WIDTH.default;
  } catch { return INSPECTOR_WIDTH.default; }
}

/** Responsive placement stays independent of the property editor's content. */
export function InspectorSlot({ children, onClose, onReturnFocus }: {
  readonly children: ReactNode;
  readonly onClose: () => void;
  readonly onReturnFocus: () => void;
}) {
  const compact = useCompactWorkbench();
  const [width, setWidth] = useState(initialWidth);
  const gesture = useRef<{ pointerId: number; startX: number; startWidth: number; moved: boolean } | null>(null);
  const widthRef = useRef(width); widthRef.current = width;
  function commit(next: number) {
    const clamped = clampInspectorWidth(next, window.innerWidth);
    widthRef.current = clamped; setWidth(clamped);
    try { localStorage.setItem(STORAGE_KEY, String(clamped)); } catch { /* Layout preference remains session-local. */ }
  }
  useEffect(() => {
    const resize = () => commit(widthRef.current);
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      document.body.style.userSelect = "";
    };
  }, []);
  function beginResize(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || !event.isPrimary || gesture.current) return;
    event.preventDefault();
    document.body.style.userSelect = "none";
    event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current = { pointerId: event.pointerId, startX: event.clientX, startWidth: widthRef.current, moved: false };
  }
  function moveResize(event: PointerEvent<HTMLDivElement>) {
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId) return;
    event.preventDefault();
    const delta = current.startX - event.clientX;
    if (Math.abs(delta) > 3) current.moved = true;
    widthRef.current = clampInspectorWidth(current.startWidth + delta, window.innerWidth);
    setWidth(widthRef.current);
  }
  function finishResize(event: PointerEvent<HTMLDivElement>) {
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId) return;
    moveResize(event); gesture.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    document.body.style.userSelect = "";
    if (current.moved) commit(widthRef.current);
    else commit(nextInspectorWidth(widthRef.current, window.innerWidth));
  }
  function resizeWithKeyboard(event: KeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? 32 : 8;
    if (event.key === "ArrowLeft") { event.preventDefault(); commit(widthRef.current + step); }
    else if (event.key === "ArrowRight") { event.preventDefault(); commit(widthRef.current - step); }
    else if (event.key === "Home") { event.preventDefault(); commit(INSPECTOR_WIDTH.default); }
  }
  if (!compact) return <aside className="inspector-slot" aria-label="属性" style={{ "--inspector-width": `${width}px` } as CSSProperties}>
    <div className="inspector-resizer" role="separator" tabIndex={0} aria-label="调整属性栏宽度" aria-orientation="vertical"
      aria-valuemin={INSPECTOR_WIDTH.min} aria-valuemax={clampInspectorWidth(INSPECTOR_WIDTH.max, window.innerWidth)} aria-valuenow={width}
      title="拖动调整宽度；单击切换预设；方向键微调"
      onPointerDown={beginResize} onPointerMove={moveResize} onPointerUp={finishResize}
      onPointerCancel={(event) => { gesture.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); document.body.style.userSelect = ""; commit(widthRef.current); }}
      onKeyDown={resizeWithKeyboard} />
    {children}
  </aside>;
  return <Dialog.Root open onOpenChange={(open) => { if (!open) onClose(); }}>
    <Dialog.Portal>
      <Dialog.Overlay className="dialog-overlay" />
      <Dialog.Content className="inspector-drawer" aria-describedby={undefined}
        onCloseAutoFocus={(event) => { event.preventDefault(); onReturnFocus(); }}>
        <Dialog.Title className="visually-hidden">编辑属性</Dialog.Title>
        {children}
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
