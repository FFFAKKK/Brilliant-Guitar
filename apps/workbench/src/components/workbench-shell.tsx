import type { ReactNode } from "react";
import type { KeyboardEventHandler } from "react";
import { DockLayout } from "./dock-layout";
import type { DockLayoutState, DockSide, DockVisibilityState } from "../workbench/dock-layout";

interface WorkbenchShellProps {
  readonly navigation: ReactNode;
  readonly children: ReactNode;
  readonly layout: DockLayoutState;
  readonly onLayoutChange: (layout: DockLayoutState) => void;
  readonly visibility?: DockVisibilityState;
  readonly onToggleDock?: (side: DockSide) => void;
  readonly top?: ReactNode;
  readonly left?: ReactNode;
  readonly right?: ReactNode;
  readonly bottom?: ReactNode;
  readonly showPlaceholders?: boolean;
  readonly motionEnabled?: boolean;
  readonly onKeyDownCapture?: KeyboardEventHandler<HTMLDivElement>;
}

/** Layout owns placement, never notation data or component-specific behavior. */
export function WorkbenchShell({ navigation, children, layout, onLayoutChange, visibility, onToggleDock, top, left, right, bottom,
  showPlaceholders, motionEnabled, onKeyDownCapture }: WorkbenchShellProps) {
  return (
    <div className="workbench-shell" data-motion={motionEnabled === false ? "off" : "on"} onKeyDownCapture={onKeyDownCapture}>
      <a className="skip-link" href="#workspace">跳转到工作区</a>
      {navigation}
      <div className="workbench-body">
        <DockLayout layout={layout} onLayoutChange={onLayoutChange} top={top} left={left} right={right} bottom={bottom}
          {...(onToggleDock === undefined ? {} : { onToggleDock })}
          {...(visibility === undefined ? {} : { visibility })}
          {...(showPlaceholders === undefined ? {} : { showPlaceholders })}>{children}</DockLayout>
      </div>
    </div>
  );
}
