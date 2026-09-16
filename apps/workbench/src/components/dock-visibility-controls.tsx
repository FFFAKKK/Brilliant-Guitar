import type { DockSide, DockVisibilityState } from "../workbench/dock-layout";

interface DockVisibilityControlsProps {
  readonly visibility: DockVisibilityState;
  readonly onToggle: (side: DockSide) => void;
}

const SIDES: readonly { readonly side: DockSide; readonly label: string }[] = [
  { side: "left", label: "左侧" },
  { side: "right", label: "右侧" },
  { side: "top", label: "上方" },
  { side: "bottom", label: "下方" },
];

export function DockVisibilityControls({ visibility, onToggle }: DockVisibilityControlsProps) {
  return (
    <div className="dock-visibility-controls" role="group" aria-label="停靠区域显示">
      <span className="dock-visibility-label">布局</span>
      {SIDES.map(({ side, label }) => {
        const open = visibility[side];
        return (
          <button
            className="dock-visibility-toggle"
            type="button"
            key={side}
            aria-pressed={open}
            aria-label={`${open ? "隐藏" : "显示"}${label}停靠区`}
            title={`${open ? "隐藏" : "显示"}${label}停靠区`}
            onClick={() => onToggle(side)}
          >
            <span className={`dock-visibility-icon dock-visibility-icon-${side}`} aria-hidden="true" />
            <span className="dock-visibility-text">{label.slice(0, 1)}</span>
          </button>
        );
      })}
    </div>
  );
}
