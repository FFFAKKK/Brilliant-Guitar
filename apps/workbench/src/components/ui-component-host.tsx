import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { UiComponentDefinition, UiPresentation, UiSlot } from "../ui/plugin-contract";
import type { UiComponentPlacement } from "../ui/layout-state";
import type { WorkbenchIssue } from "../contracts/workbench-issue.ts";
import { UiComponentErrorBoundary } from "./ui-component-error-boundary.tsx";
import { useWorkbenchRuntime } from "../runtime/workbench-runtime.tsx";

export type UiLayoutMode = "normal" | "inspect";

export interface HostedUiComponentContext {
  readonly componentId: string;
  readonly kind: UiComponentDefinition["kind"];
  readonly domain: UiComponentDefinition["domain"];
  readonly slot: UiSlot;
  readonly presentation: UiPresentation;
  readonly size: Readonly<{ width: number; height: number }>;
  readonly layoutMode: UiLayoutMode;
  moveTo(slot: UiSlot, order?: number): void;
  hide(): void;
  setPresentation(presentation: UiPresentation): void;
  requestFocus(): void;
  executeCommand(commandId: string): boolean;
}

const ComponentHostContext = createContext<HostedUiComponentContext | null>(null);

function authorizeCommand(definition: UiComponentDefinition, commandId: string,
  report: (issue: WorkbenchIssue) => void): boolean {
  if (definition.permissions.commands.includes(commandId)) return true;
  report({ code: "component.command-permission-denied", message: `组件 ${definition.id} 没有执行 ${commandId} 的权限`,
    severity: "error", source: "host", target: { scope: "component", componentId: definition.id } });
  return false;
}

export function useHostedUiComponent(): HostedUiComponentContext {
  const context = useContext(ComponentHostContext);
  if (!context) throw new Error("useHostedUiComponent must be used inside UiComponentHost");
  return context;
}

interface UiComponentHostProps {
  readonly definition: UiComponentDefinition;
  readonly placement: UiComponentPlacement;
  readonly layoutMode?: UiLayoutMode;
  readonly onMove: (componentId: string, slot: UiSlot, order?: number) => void;
  readonly onHide: (componentId: string) => void;
  readonly onPresentationChange: (componentId: string, presentation: UiPresentation) => void;
  readonly children?: ReactNode;
}

/** A visual-neutral mount point. Components own their markup and appearance. */
export function UiComponentHost({ definition, placement, layoutMode = "normal", onMove, onHide, onPresentationChange, children }: UiComponentHostProps) {
  const runtime = useWorkbenchRuntime();
  const rootRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const update = (width: number, height: number) => setSize((current) =>
      current.width === width && current.height === height ? current : { width, height });
    const observer = new ResizeObserver(([entry]) => {
      if (entry) update(Math.round(entry.contentRect.width), Math.round(entry.contentRect.height));
    });
    observer.observe(root);
    const rect = root.getBoundingClientRect();
    update(Math.round(rect.width), Math.round(rect.height));
    return () => observer.disconnect();
  }, []);
  const context = useMemo<HostedUiComponentContext>(() => ({
    componentId: definition.id,
    kind: definition.kind,
    domain: definition.domain,
    slot: placement.slot,
    presentation: placement.presentation,
    size,
    layoutMode,
    moveTo: (slot, order) => onMove(definition.id, slot, order),
    hide: () => onHide(definition.id),
    setPresentation: (presentation) => onPresentationChange(definition.id, presentation),
    requestFocus: () => rootRef.current?.focus({ preventScroll: true }),
    executeCommand: (commandId) => authorizeCommand(definition, commandId, runtime.feedback.report)
      && runtime.commands.execute(commandId),
  }), [definition, layoutMode, onHide, onMove, onPresentationChange, placement.presentation, placement.slot,
    runtime.commands, runtime.feedback.report, size]);
  return <ComponentHostContext.Provider value={context}>
    <div
      ref={rootRef}
      className="ui-component-host"
      data-component-id={definition.id}
      data-component-kind={definition.kind}
      data-component-domain={definition.domain}
      data-component-slot={placement.slot}
      data-component-presentation={placement.presentation}
      data-layout-inspect={layoutMode === "inspect" || undefined}
      tabIndex={-1}
    >
      <UiComponentErrorBoundary componentId={definition.id}
        resetKey={`${definition.version}:${placement.slot}:${placement.presentation}`} onIssue={runtime.feedback.report}>
        {children}
      </UiComponentErrorBoundary>
      {layoutMode === "inspect" && <div className="ui-component-inspect" aria-hidden="true">
        <span className="ui-component-inspect-id">{definition.id}</span>
        <span className="ui-component-inspect-meta">{placement.slot} · {placement.presentation} · {size.width}×{size.height}</span>
      </div>}
    </div>
  </ComponentHostContext.Provider>;
}
