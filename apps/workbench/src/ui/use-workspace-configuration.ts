import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_WORKSPACE_CONFIGURATION } from "../contracts/workspace-configuration.ts";
import type { WorkspaceConfigurationV1 } from "../contracts/workspace-configuration.ts";
import type { WorkbenchTaskRuntime } from "../runtime/workbench-runtime.tsx";
import type { WorkbenchClient } from "../services/workbench-client.ts";
import { issueFromError } from "../workbench/issue-from-error.ts";
import { clampDockLayout, dockViewport, mergeDockPreferences, toggleDockVisibility } from "../workbench/dock-layout.ts";
import type { DockLayoutState, DockSide } from "../workbench/dock-layout.ts";
import { clampInspectorWidth } from "../workbench/inspector-layout.ts";
import { moveUiComponent, reconcileUiLayout, restoreUiLayout, setUiComponentPresentation, setUiComponentVisibility } from "./layout-state.ts";
import type { UiComponentDefinition, UiPresentation, UiSlot } from "./plugin-contract.ts";
import { selectDockItem as chooseDockItem } from "./shared-dock-selection.ts";
import type { SharedDockSlot } from "./shared-dock-selection.ts";

const LEGACY_DOCK_LAYOUT_KEY = "brilliant.workbench.dock-layout.v2";
const LEGACY_DOCK_VISIBILITY_KEY = "brilliant.workbench.dock-visibility.v1";
const LEGACY_UI_LAYOUT_KEY = "brilliant.workbench.ui-layout.v2";
const LEGACY_UI_LAYOUT_V1_KEY = "brilliant.workbench.ui-layout.v1";
const LEGACY_SELECTION_KEY = "brilliant.workbench.shared-dock-selection.v1";
const LEGACY_INSPECTOR_WIDTH_KEY = "brilliant.workbench.inspector-width.v1";
const RECOVERY_KEY = "brilliant.workbench.workspace-configuration-recovery.v1";
const VALIDATION_VIEWPORT = { width: 1920, height: 1080 } as const;

function parse(storage: Storage, key: string): unknown {
  const value = storage.getItem(key);
  return value === null ? null : JSON.parse(value);
}

function legacyConfiguration(definitions: readonly UiComponentDefinition[]): WorkspaceConfigurationV1 {
  try {
    const layoutCandidate = parse(localStorage, LEGACY_DOCK_LAYOUT_KEY);
    const layoutRecord = typeof layoutCandidate === "object" && layoutCandidate !== null ? layoutCandidate as Record<string, unknown> : {};
    const layout = [layoutRecord.left, layoutRecord.right, layoutRecord.top, layoutRecord.bottom]
      .every((value) => typeof value === "number" && Number.isFinite(value))
      ? clampDockLayout(layoutCandidate as DockLayoutState, VALIDATION_VIEWPORT)
      : DEFAULT_WORKSPACE_CONFIGURATION.dock.layout;
    const visibilityCandidate = parse(localStorage, LEGACY_DOCK_VISIBILITY_KEY);
    const visibilityRecord = typeof visibilityCandidate === "object" && visibilityCandidate !== null
      ? visibilityCandidate as Record<string, unknown> : {};
    const visibility = ["top", "right", "bottom", "left"].every((side) => typeof visibilityRecord[side] === "boolean")
      ? visibilityCandidate as WorkspaceConfigurationV1["dock"]["visibility"]
      : DEFAULT_WORKSPACE_CONFIGURATION.dock.visibility;
    const selectionCandidate = parse(localStorage, LEGACY_SELECTION_KEY);
    const selectionRecord = typeof selectionCandidate === "object" && selectionCandidate !== null
      ? selectionCandidate as Record<string, unknown> : {};
    const selection = ["top", "right", "bottom", "left"].every((side) =>
      selectionRecord[side] === null || typeof selectionRecord[side] === "string")
      ? selectionCandidate as WorkspaceConfigurationV1["dock"]["selection"]
      : DEFAULT_WORKSPACE_CONFIGURATION.dock.selection;
    const rawUiLayout = parse(localStorage, LEGACY_UI_LAYOUT_KEY) ?? parse(localStorage, LEGACY_UI_LAYOUT_V1_KEY);
    const uiLayout = restoreUiLayout(definitions, rawUiLayout).state;
    const storedInspectorWidth = Number(localStorage.getItem(LEGACY_INSPECTOR_WIDTH_KEY));
    const inspectorWidth = Number.isFinite(storedInspectorWidth)
      ? clampInspectorWidth(storedInspectorWidth, VALIDATION_VIEWPORT.width)
      : DEFAULT_WORKSPACE_CONFIGURATION.inspectorWidth;
    return { schemaVersion: 1, dock: { layout, visibility, selection }, uiLayout, inspectorWidth };
  } catch {
    return normalizedConfiguration(definitions, DEFAULT_WORKSPACE_CONFIGURATION);
  }
}

function normalizedConfiguration(definitions: readonly UiComponentDefinition[], value: WorkspaceConfigurationV1): WorkspaceConfigurationV1 {
  return {
    schemaVersion: 1,
    dock: {
      layout: clampDockLayout(value.dock.layout, VALIDATION_VIEWPORT),
      visibility: value.dock.visibility,
      selection: value.dock.selection,
    },
    uiLayout: reconcileUiLayout(definitions, value.uiLayout),
    inspectorWidth: clampInspectorWidth(value.inspectorWidth, VALIDATION_VIEWPORT.width),
  };
}

export function useWorkspaceConfiguration(
  client: WorkbenchClient, definitions: readonly UiComponentDefinition[], runtime?: WorkbenchTaskRuntime,
) {
  const legacy = useRef<WorkspaceConfigurationV1 | undefined>(undefined);
  if (!legacy.current) legacy.current = legacyConfiguration(definitions);
  const [configuration, setConfiguration] = useState(legacy.current);
  const configurationRef = useRef(configuration);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [viewport, setViewport] = useState(dockViewport);
  const readyRef = useRef(false);
  const writeQueue = useRef<Promise<unknown>>(Promise.resolve());

  const reportFailure = useCallback((error: unknown, fallback: string) => {
    const issue = issueFromError(error, { code: "workspace-config.unavailable", message: fallback, severity: "warning",
      source: "host", target: { scope: "workbench" }, retryable: true });
    setMessage(issue.message);
    runtime?.feedback.report(issue);
  }, [runtime?.feedback]);

  const persist = useCallback((next: WorkspaceConfigurationV1) => {
    setSaving(true);
    const task = writeQueue.current.catch(() => undefined)
      .then(() => client.writeWorkspaceConfiguration(next))
      .catch((error: unknown) => reportFailure(error, "布局已在本次会话生效，但工作区配置保存失败"))
      .finally(() => { if (writeQueue.current === task) setSaving(false); });
    writeQueue.current = task;
  }, [client, reportFailure]);

  useEffect(() => {
    let active = true;
    void client.readWorkspaceConfiguration().then(async (snapshot) => {
      if (!active) return;
      const next = normalizedConfiguration(definitions, snapshot.persisted ? snapshot.configuration : legacy.current!);
      configurationRef.current = next;
      setConfiguration(next);
      if (!snapshot.persisted || JSON.stringify(next) !== JSON.stringify(snapshot.configuration)) {
        await client.writeWorkspaceConfiguration(next);
      }
      if (!active || !snapshot.recoveredFromInvalid) return;
      setMessage("原工作区配置格式无效，已保留隔离副本并恢复兼容布局");
      try { sessionStorage.setItem(RECOVERY_KEY, JSON.stringify({ occurredAt: Date.now() })); } catch { /* Optional diagnostic only. */ }
    }).catch((error: unknown) => {
      if (active) reportFailure(error, "无法读取工作区配置，当前使用兼容布局");
    }).finally(() => {
      if (!active) return;
      readyRef.current = true;
      setReady(true);
    });
    return () => { active = false; };
  }, [client, definitions, reportFailure]);

  useEffect(() => {
    const onResize = () => setViewport(dockViewport());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const update = useCallback((transform: (current: WorkspaceConfigurationV1) => WorkspaceConfigurationV1) => {
    if (!readyRef.current) return;
    setMessage("");
    const next = transform(configurationRef.current);
    configurationRef.current = next;
    setConfiguration(next);
    persist(next);
  }, [persist]);

  const layout = useMemo(() => clampDockLayout(configuration.dock.layout, viewport), [configuration.dock.layout, viewport]);
  const setLayout = useCallback((next: DockLayoutState) => update((current) => ({
    ...current, dock: { ...current.dock, layout: mergeDockPreferences(current.dock.layout,
      clampDockLayout(current.dock.layout, dockViewport()), next) },
  })), [update]);
  const toggleDock = useCallback((side: DockSide) => update((current) => ({
    ...current, dock: { ...current.dock, visibility: toggleDockVisibility(current.dock.visibility, side) },
  })), [update]);
  const move = useCallback((componentId: string, slot: UiSlot, order?: number) => update((current) => ({
    ...current, uiLayout: moveUiComponent(current.uiLayout, definitions, componentId, slot, order),
  })), [definitions, update]);
  const hide = useCallback((componentId: string) => update((current) => ({
    ...current, uiLayout: setUiComponentVisibility(current.uiLayout, componentId, false),
  })), [update]);
  const setPresentation = useCallback((componentId: string, presentation: UiPresentation) => update((current) => ({
    ...current, uiLayout: setUiComponentPresentation(current.uiLayout, definitions, componentId, presentation),
  })), [definitions, update]);
  const selectDockItem = useCallback((slot: SharedDockSlot, id: string, availableIds: readonly string[]) => update((current) => ({
    ...current, dock: { ...current.dock, selection: chooseDockItem(current.dock.selection, slot, id, availableIds) },
  })), [update]);
  const reset = useCallback(() => {
    if (!readyRef.current) return;
    setSaving(true);
    const task = writeQueue.current.catch(() => undefined).then(() => client.resetWorkspaceConfiguration())
      .then((value) => {
        const next = normalizedConfiguration(definitions, value);
        configurationRef.current = next;
        setConfiguration(next);
        setMessage("已恢复默认工作区布局");
      }).catch((error: unknown) => reportFailure(error, "无法恢复默认工作区布局"))
      .finally(() => { if (writeQueue.current === task) setSaving(false); });
    writeQueue.current = task;
  }, [client, definitions, reportFailure]);

  return { configuration, layout, visibility: configuration.dock.visibility, uiLayout: configuration.uiLayout,
    dockSelection: configuration.dock.selection, ready, saving, message, setLayout, toggleDock, move, hide, setPresentation,
    selectDockItem, setInspectorWidth: (width: number) => update((current) => ({
      ...current, inspectorWidth: clampInspectorWidth(width, window.innerWidth),
    })), reset };
}
