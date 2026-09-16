import { useEffect, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent, PointerEvent, ReactNode, RefObject } from "react";
import { resizePanel } from "../workbench/panel-layout";
import type { PanelDefinition, PanelDimensions, PanelSize, ResizeEdge } from "../workbench/panel-layout";

interface WorkbenchPanelProps {
  readonly definition: PanelDefinition;
  readonly size: PanelSize;
  readonly onSizeChange?: (size: PanelSize) => void;
  readonly resizeEnabled?: boolean;
  readonly viewportRef: RefObject<HTMLDivElement | null>;
  readonly contentKey: string;
  readonly children: ReactNode;
}
interface ResizeGesture {
  readonly pointerId: number;
  readonly target: HTMLElement;
  readonly edge: ResizeEdge;
  readonly x: number;
  readonly y: number;
  readonly start: PanelDimensions;
  readonly original: PanelSize;
}

/** One content surface with edge resizing; no mandatory title bar or nested card. */
export function WorkbenchPanel({ definition, size, onSizeChange, resizeEnabled = false, viewportRef, contentKey, children }: WorkbenchPanelProps) {
  const canResize = resizeEnabled && onSizeChange !== undefined;
  const panelRef = useRef<HTMLElement>(null);
  const previousContent = useRef(contentKey);
  const gesture = useRef<ResizeGesture | null>(null);
  const frame = useRef<number | null>(null);
  const pending = useRef<PanelSize | null>(null);
  const onChangeRef = useRef(onSizeChange);
  onChangeRef.current = onSizeChange;
  const [dragging, setDragging] = useState(false);
  const [bounds, setBounds] = useState<PanelDimensions>({ width: 1, height: 1 });
  useEffect(() => {
    if (previousContent.current !== contentKey) viewportRef.current?.scrollTo(0, 0);
    previousContent.current = contentKey;
  }, [contentKey, viewportRef]);
  useEffect(() => {
    if (!canResize) return;
    const parent = panelRef.current?.parentElement;
    if (!parent) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setBounds({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(parent);
    return () => observer.disconnect();
  }, [canResize]);

  function finish(cancel: boolean) {
    const current = gesture.current;
    if (!current) return;
    gesture.current = null;
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    if (cancel) onChangeRef.current?.(current.original);
    else if (pending.current) onChangeRef.current?.(pending.current);
    pending.current = null;
    if (current.target.hasPointerCapture(current.pointerId)) current.target.releasePointerCapture(current.pointerId);
    setDragging(false);
  }
  useEffect(() => {
    if (!canResize) return;
    const cancel = () => finish(true);
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape" && gesture.current) { event.preventDefault(); cancel(); }
    };
    window.addEventListener("blur", cancel);
    window.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("blur", cancel);
      window.removeEventListener("keydown", escape);
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      if (gesture.current) onChangeRef.current?.(gesture.current.original);
      gesture.current = null;
    };
  }, [canResize]);

  function begin(event: PointerEvent<HTMLElement>, edge: ResizeEdge) {
    if (!canResize || event.button !== 0 || !event.isPrimary || gesture.current) return;
    const rect = panelRef.current?.getBoundingClientRect();
    if (!rect) return;
    event.preventDefault();
    event.currentTarget.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current = { pointerId: event.pointerId, target: event.currentTarget, edge,
      x: event.clientX, y: event.clientY, start: { width: rect.width, height: rect.height }, original: size };
    setDragging(true);
  }
  function move(event: PointerEvent<HTMLElement>) {
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId) return;
    pending.current = resizePanel(current.start, { x: event.clientX - current.x, y: event.clientY - current.y }, current.edge, bounds, definition);
    if (frame.current === null) frame.current = requestAnimationFrame(() => {
      frame.current = null;
      if (gesture.current && pending.current) onChangeRef.current?.(pending.current);
    });
  }
  function keyboard(event: KeyboardEvent<HTMLElement>, edge: ResizeEdge) {
    if (gesture.current) return;
    const step = event.shiftKey ? 32 : 8;
    const delta = { x: event.key === "ArrowRight" ? step : event.key === "ArrowLeft" ? -step : 0,
      y: event.key === "ArrowDown" ? step : event.key === "ArrowUp" ? -step : 0 };
    if ((!delta.x && !delta.y) || (edge === "right" && !delta.x) || (edge === "bottom" && !delta.y)) return;
    event.preventDefault();
    const rect = panelRef.current?.getBoundingClientRect();
    if (rect) onSizeChange?.(resizePanel(rect, delta, edge, bounds, definition));
  }
  const style: CSSProperties = {
    width: size.mode === "fill" ? "100%" : size.width,
    height: size.mode === "fill" ? "100%" : size.height,
    minWidth: `min(100%, ${definition.minWidth}px)`, minHeight: `min(100%, ${definition.minHeight}px)`,
  };
  const actual = resizePanel(size.mode === "fill" ? bounds : size, { x: 0, y: 0 }, "corner", bounds, definition);
  const events = (edge: ResizeEdge) => ({
    onPointerDown: (event: PointerEvent<HTMLElement>) => begin(event, edge), onPointerMove: move,
    onPointerUp: (event: PointerEvent<HTMLElement>) => { if (gesture.current?.pointerId === event.pointerId) { move(event); finish(false); } },
    onPointerCancel: () => finish(true), onLostPointerCapture: () => finish(true),
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => keyboard(event, edge),
  });
  return (
    <section className="workbench-panel" style={style} ref={panelRef} data-resizing={dragging || undefined}
      data-panel-id={definition.id} aria-label={definition.title}>
      <div className="panel-viewport" ref={viewportRef} tabIndex={0} aria-label={`${definition.title}内容区`}>{children}</div>
      {canResize && <><div className="resize-handle resize-right" role="separator" tabIndex={0} aria-label={`调整${definition.title}宽度`} aria-orientation="vertical"
        aria-valuemin={Math.min(definition.minWidth, Math.floor(bounds.width))} aria-valuemax={Math.floor(bounds.width)} aria-valuenow={actual.width}
        title="拖动调整宽度" {...events("right")} />
      <div className="resize-handle resize-bottom" role="separator" tabIndex={0} aria-label={`调整${definition.title}高度`} aria-orientation="horizontal"
        aria-valuemin={Math.min(definition.minHeight, Math.floor(bounds.height))} aria-valuemax={Math.floor(bounds.height)} aria-valuenow={actual.height}
        title="拖动调整高度" {...events("bottom")} />
      <button className="resize-handle resize-corner" aria-label={`拖动调整${definition.title}大小`} title="拖动调整大小；方向键微调，Esc 取消拖动" {...events("corner")} /></>}
    </section>
  );
}
