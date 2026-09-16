import { useCallback, useEffect, useMemo, useState } from "react";
import { clampDockLayout, dockViewport, DOCK_LAYOUT_DEFAULTS, DOCK_VISIBILITY_DEFAULTS, mergeDockPreferences, toggleDockVisibility } from "./dock-layout";
import type { DockLayoutState, DockSide, DockVisibilityState } from "./dock-layout";

// v2 discards layouts saved by the earlier cumulative pointer-delta bug.
const STORAGE_KEY = "brilliant.workbench.dock-layout.v2";
const VISIBILITY_STORAGE_KEY = "brilliant.workbench.dock-visibility.v1";
const STORAGE_VALIDATION_VIEWPORT = { width: 1920, height: 1080 } as const;

function readStoredLayout(): DockLayoutState {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    if (typeof parsed !== "object" || parsed === null) return DOCK_LAYOUT_DEFAULTS;
    const record = parsed as Record<string, unknown>;
    const values = [record.left, record.right, record.top, record.bottom];
    if (!values.every((value) => typeof value === "number" && Number.isFinite(value))) return DOCK_LAYOUT_DEFAULTS;
    // Stored values describe the user's preferred desktop layout. Responsive
    // compression is derived at render time and must never overwrite it.
    return clampDockLayout(parsed as DockLayoutState, STORAGE_VALIDATION_VIEWPORT);
  } catch {
    return DOCK_LAYOUT_DEFAULTS;
  }
}

function readStoredVisibility(): DockVisibilityState {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(VISIBILITY_STORAGE_KEY) ?? "null");
    if (typeof parsed !== "object" || parsed === null) return DOCK_VISIBILITY_DEFAULTS;
    const record = parsed as Record<string, unknown>;
    if (!["top", "right", "bottom", "left"].every((side) => typeof record[side] === "boolean")) return DOCK_VISIBILITY_DEFAULTS;
    return parsed as DockVisibilityState;
  } catch {
    return DOCK_VISIBILITY_DEFAULTS;
  }
}

export function useDockLayout() {
  const [preferredLayout, setPreferredLayout] = useState<DockLayoutState>(readStoredLayout);
  const [viewport, setViewport] = useState(dockViewport);
  const [visibility, setVisibility] = useState<DockVisibilityState>(readStoredVisibility);
  const layout = useMemo(() => clampDockLayout(preferredLayout, viewport), [preferredLayout, viewport]);
  const setLayout = useCallback((next: DockLayoutState) => setPreferredLayout((current) =>
    mergeDockPreferences(current, clampDockLayout(current, dockViewport()), next)), []);
  const toggleDock = useCallback((side: DockSide) => setVisibility((current) => toggleDockVisibility(current, side)), []);
  const resetLayout = useCallback(() => {
    setPreferredLayout(DOCK_LAYOUT_DEFAULTS);
    setVisibility(DOCK_VISIBILITY_DEFAULTS);
  }, []);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(preferredLayout)); } catch { /* Layout remains in memory when storage is unavailable. */ }
  }, [preferredLayout]);

  useEffect(() => {
    try { localStorage.setItem(VISIBILITY_STORAGE_KEY, JSON.stringify(visibility)); } catch { /* Visibility remains in memory when storage is unavailable. */ }
  }, [visibility]);

  useEffect(() => {
    const onResize = () => setViewport(dockViewport());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return { layout, setLayout, visibility, toggleDock, resetLayout };
}
