import { useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent, PointerEvent, ReactNode } from "react";
import { dockSizeBounds, dockTrackSize, keyboardResizeDock, resetDockSize, resizeDock } from "../workbench/dock-layout";
import { DOCK_VISIBILITY_DEFAULTS } from "../workbench/dock-layout";
import type { DockLayoutState, DockSide, DockVisibilityState } from "../workbench/dock-layout";

interface DockLayoutProps {
  readonly layout: DockLayoutState;
  readonly onLayoutChange: (layout: DockLayoutState) => void;
  readonly visibility?: DockVisibilityState;
  readonly onToggleDock?: (side: DockSide) => void;
  readonly top?: ReactNode;
  readonly left?: ReactNode;
  readonly right?: ReactNode;
  readonly bottom?: ReactNode;
  readonly showPlaceholders?: boolean;
  readonly children: ReactNode;
}

const REGION_LABELS: Record<DockSide | "workspace", string> = {
  top: "上方停靠区",
  left: "左侧停靠区",
  right: "右侧停靠区",
  bottom: "下方停靠区",
  workspace: "中央工作区",
};

function DockToggle({ side, visible, onToggle }: { readonly side: DockSide; readonly visible: boolean; readonly onToggle: (side: DockSide) => void }) {
  return <button
    type="button"
    className="dock-region-toggle"
    aria-label={`${visible ? "收起" : "展开"}${REGION_LABELS[side]}`}
    aria-expanded={visible}
    title={`${visible ? "收起" : "展开"}${REGION_LABELS[side]}`}
    data-side={side}
    data-collapsed={!visible || undefined}
    onClick={() => onToggle(side)}
  >
    <span className="dock-region-toggle-icon" aria-hidden="true" />
  </button>;
}

function DockRegion({ side, children, showPlaceholder, visible = true, onToggle }: {
  readonly side: DockSide | "workspace";
  readonly children?: ReactNode;
  readonly showPlaceholder: boolean;
  readonly visible?: boolean;
  readonly onToggle?: (side: DockSide) => void;
}) {
  const isWorkspace = side === "workspace";
  const isCollapsed = !isWorkspace && !visible;
  return <section
    id={`dock-region-${side}`}
    className={`dock-region dock-region-${side}`}
    aria-label={REGION_LABELS[side]}
    data-empty={children == null || undefined}
    data-collapsed={isCollapsed || undefined}
  >
    {!isCollapsed && <div className="dock-region-content">
      {children ?? (showPlaceholder && <span className="dock-region-placeholder" aria-hidden="true">{REGION_LABELS[side]}</span>)}
    </div>}
    {!isWorkspace && onToggle && <DockToggle side={side} visible={visible} onToggle={onToggle} />}
  </section>;
}

function DockSplitter({ side, layout, onLayoutChange }: { readonly side: DockSide; readonly layout: DockLayoutState; readonly onLayoutChange: (layout: DockLayoutState) => void }) {
  const [dragging, setDragging] = useState(false);
  const gesture = useRef<{ pointerId: number; x: number; y: number; layout: DockLayoutState } | null>(null);
  const viewport = () => ({ width: window.innerWidth, height: window.innerHeight - 48 });
  function begin(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || !event.isPrimary || gesture.current) return;
    event.preventDefault();
    document.body.style.userSelect = "none";
    event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, layout };
    setDragging(true);
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId) return;
    event.preventDefault();
    const delta = side === "left" || side === "right" ? event.clientX - current.x : event.clientY - current.y;
    current.x = event.clientX;
    current.y = event.clientY;
    current.layout = resizeDock(current.layout, side, delta, viewport());
    onLayoutChange(current.layout);
  }
  function finish(event: PointerEvent<HTMLDivElement>) {
    if (!gesture.current || gesture.current.pointerId !== event.pointerId) return;
    move(event);
    gesture.current = null;
    document.body.style.userSelect = "";
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    setDragging(false);
  }
  function keyboard(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Home") {
      event.preventDefault();
      onLayoutChange(resetDockSize(layout, side, viewport()));
      return;
    }
    const step = event.shiftKey ? 32 : 8;
    const next = keyboardResizeDock(layout, side, event.key, step, viewport());
    if (!next) return;
    event.preventDefault();
    onLayoutChange(next);
  }
  const orientation = side === "left" || side === "right" ? "vertical" : "horizontal";
  const bounds = dockSizeBounds(side, viewport());
  return <div className={`dock-splitter dock-splitter-${side} ${dragging ? "is-dragging" : ""}`} role="separator" tabIndex={0}
    aria-label={`调整${REGION_LABELS[side]}大小`} aria-orientation={orientation}
    aria-valuenow={layout[side]} aria-valuemin={bounds.min} aria-valuemax={bounds.max}
    title="拖动调整区域大小；方向键微调；Shift 加速；Home 恢复当前区域" onDoubleClick={() => onLayoutChange(resetDockSize(layout, side, viewport()))} onPointerDown={begin} onPointerMove={move} onPointerUp={finish}
    onPointerCancel={finish} onLostPointerCapture={() => { gesture.current = null; document.body.style.userSelect = ""; setDragging(false); }} onKeyDown={keyboard} />;
}

export function DockLayout({ layout, onLayoutChange, visibility = DOCK_VISIBILITY_DEFAULTS, onToggleDock, top, left, right, bottom, showPlaceholders = true, children }: DockLayoutProps) {
  const style = {
    "--dock-left": `${dockTrackSize(layout, visibility, "left")}px`,
    "--dock-right": `${dockTrackSize(layout, visibility, "right")}px`,
    "--dock-top": `${dockTrackSize(layout, visibility, "top")}px`,
    "--dock-bottom": `${dockTrackSize(layout, visibility, "bottom")}px`,
    "--dock-left-splitter": visibility.left ? "8px" : "0px",
    "--dock-right-splitter": visibility.right ? "8px" : "0px",
    "--dock-top-splitter": visibility.top ? "8px" : "0px",
    "--dock-bottom-splitter": visibility.bottom ? "8px" : "0px",
  } as CSSProperties;
  return <div className="dock-layout" style={style} data-layout-preview="true">
    <DockRegion side="top" showPlaceholder={showPlaceholders} visible={visibility.top} {...(onToggleDock === undefined ? {} : { onToggle: onToggleDock })}>{top}</DockRegion>
    {visibility.top && <DockSplitter side="top" layout={layout} onLayoutChange={onLayoutChange} />}
    <div className="dock-stage">
      <DockRegion side="workspace" showPlaceholder={showPlaceholders}>{children}</DockRegion>
      <DockRegion side="left" showPlaceholder={showPlaceholders} visible={visibility.left} {...(onToggleDock === undefined ? {} : { onToggle: onToggleDock })}>{left}</DockRegion>
      {visibility.left && <DockSplitter side="left" layout={layout} onLayoutChange={onLayoutChange} />}
      {visibility.right && <DockSplitter side="right" layout={layout} onLayoutChange={onLayoutChange} />}
      <DockRegion side="right" showPlaceholder={showPlaceholders} visible={visibility.right} {...(onToggleDock === undefined ? {} : { onToggle: onToggleDock })}>{right}</DockRegion>
    </div>
    {visibility.bottom && <DockSplitter side="bottom" layout={layout} onLayoutChange={onLayoutChange} />}
    <DockRegion side="bottom" showPlaceholder={showPlaceholders} visible={visibility.bottom} {...(onToggleDock === undefined ? {} : { onToggle: onToggleDock })}>{bottom}</DockRegion>
  </div>;
}
