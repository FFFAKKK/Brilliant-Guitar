import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { RefObject } from "react";
import { NavigationBar } from "./components/navigation-bar";
import { PreferencesDialog } from "./components/preferences-dialog";
import { NewScoreDialog } from "./components/new-score-dialog";
import { SaveAsDialog } from "./components/save-as-dialog";
import { UnsavedChangesDialog } from "./components/unsaved-changes-dialog";
import type { NavigationAction, NavigationGroup } from "./components/navigation-bar";
import { UiComponentHost } from "./components/ui-component-host";
import { SharedDock } from "./components/shared-dock";
import { useScoreInput } from "./editor/use-score-input";
import { useNoteOverview } from "./editor/use-note-overview";
import { WorkbenchShell } from "./components/workbench-shell";
import { vexflowRenderer } from "./notation/vexflow-renderer";
import { usePaperZoom } from "./notation/use-paper-zoom";
import { listUiComponentsInSlot } from "./ui/layout-state";
import type { UiLayoutState } from "./ui/layout-state";
import type { UiComponentDefinition, UiPresentation, UiSlot } from "./ui/plugin-contract";
import type { SharedDockSlot } from "./ui/shared-dock-selection";
import { useApplicationSettings } from "./ui/use-application-settings.ts";
import { useWorkspaceConfiguration } from "./ui/use-workspace-configuration.ts";
import { workbenchPluginDiagnostics, workbenchPlugins } from "./ui/workbench-plugins";
import { useWorkbenchSession } from "./workbench/use-workbench-session";
import { useDocumentFiles } from "./workbench/use-document-files";
import { WorkbenchFeedbackAnnouncer } from "./components/workbench-feedback-announcer.tsx";
import { PluginDiagnosticDialog } from "./components/plugin-diagnostic-dialog.tsx";
import { WorkbenchRuntimeProvider, useWorkbenchRuntime } from "./runtime/workbench-runtime.tsx";
import { useWorkbenchCommands } from "./runtime/use-workbench-commands.ts";
import type { WorkbenchCommand } from "./commands/workbench-command.ts";
import { bindUiProjection } from "./ui/projection-registry.ts";
import { HISTORY_PROJECTION, NOTE_CONTROL_PROJECTION, PAPER_ZOOM_PROJECTION, STAFF_PROJECTION } from "./ui/first-party-plugin-projections.ts";

const INSTALLED_COMPONENTS = workbenchPlugins.components.list();
const SLOT_LABELS: Record<UiSlot, string> = {
  workspace: "中央工作区",
  top: "上方停靠区",
  right: "右侧停靠区",
  bottom: "下方停靠区",
  left: "左侧停靠区",
  overlay: "浮层挂载区",
};

interface InspectSlotProps {
  readonly slot: UiSlot;
  readonly state: UiLayoutState;
  readonly definitions: readonly UiComponentDefinition[];
  readonly onMove: (componentId: string, slot: UiSlot, order?: number) => void;
  readonly onHide: (componentId: string) => void;
  readonly onPresentationChange: (componentId: string, presentation: UiPresentation) => void;
}

function InspectSlot({ slot, state, definitions, onMove, onHide, onPresentationChange }: InspectSlotProps) {
  const byId = new Map(definitions.map((definition) => [definition.id, definition] as const));
  const placements = listUiComponentsInSlot(state, slot);
  if (placements.length === 0) return <div className="ui-slot-inspect ui-slot-inspect-empty" data-ui-slot={slot} aria-hidden="true">
    <div className="ui-component-inspect">
      <span className="ui-component-inspect-id">{SLOT_LABELS[slot]}</span>
      <span className="ui-component-inspect-meta">{slot} · 空挂载位，当前没有组件</span>
    </div>
  </div>;
  return <div className="ui-slot-inspect">
    {placements.map((placement) => {
      const definition = byId.get(placement.componentId);
      return definition && <UiComponentHost
        key={placement.componentId}
        definition={definition}
        placement={placement}
        layoutMode="inspect"
        onMove={onMove}
        onHide={onHide}
        onPresentationChange={onPresentationChange}
      />;
    })}
  </div>;
}

/**
 * The workbench assembles approved views and tools into visual-neutral mount points.
 * Unreviewed editing tools remain registered, but are not mounted here yet.
 */
export function WorkbenchApp() {
  const scoreViewport = useRef<HTMLDivElement>(null);
  return <WorkbenchRuntimeProvider focusFallback={scoreViewport}>
    <WorkbenchComposition scoreViewport={scoreViewport} />
  </WorkbenchRuntimeProvider>;
}

function WorkbenchComposition({ scoreViewport }: { readonly scoreViewport: RefObject<HTMLDivElement | null> }) {
  const runtime = useWorkbenchRuntime();
  const { around: aroundLayoutMutation } = runtime.focus;
  const [inspectLayout, setInspectLayout] = useState(false);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const pluginDiagnostics = useSyncExternalStore(workbenchPluginDiagnostics.subscribe,
    workbenchPluginDiagnostics.list, workbenchPluginDiagnostics.list);
  const [pluginDiagnosticsOpen, setPluginDiagnosticsOpen] = useState(pluginDiagnostics.length > 0);
  const previousPluginDiagnosticCount = useRef(pluginDiagnostics.length);
  useEffect(() => {
    if (pluginDiagnostics.length > previousPluginDiagnosticCount.current) setPluginDiagnosticsOpen(true);
    previousPluginDiagnosticCount.current = pluginDiagnostics.length;
  }, [pluginDiagnostics.length]);
  const editMenuRef = useRef<HTMLButtonElement>(null);
  const fileMenuRef = useRef<HTMLButtonElement>(null);
  const score = useWorkbenchSession(runtime);
  const workspaceConfiguration = useWorkspaceConfiguration(score.client, INSTALLED_COMPONENTS, runtime);
  const { layout, setLayout, visibility, toggleDock, uiLayout, move, hide, setPresentation,
    dockSelection, selectDockItem } = workspaceConfiguration;
  const applicationSettings = useApplicationSettings(score.client, runtime);
  const { animationsEnabled, ruleWarningsVisible } = applicationSettings.settings.ui;
  const { deleteTimePolicy } = applicationSettings.settings.editing;
  const input = useScoreInput(score.session, score.client, score.setSession, scoreViewport, score.loadEpoch, deleteTimePolicy, runtime);
  const files = useDocumentFiles(score.session, score.client, score.replaceSession, vexflowRenderer,
    score.loading || Boolean(score.error) || input.pending > 0 || input.retryable, runtime);
  const notation = score.session?.notation;
  const inputAvailable = !score.loading && !score.error && notation?.kind === "staff";
  const paperZoom = usePaperZoom();
  const blocked = !inputAvailable || input.retryable || files.working !== null;
  const historyBlocked = blocked || input.pending > 0;
  const historySequence = useRef(0);
  const [historyActivity, setHistoryActivity] = useState<Readonly<{ kind: "undo" | "redo"; sequence: number }>>();
  const dispatchHistory = useCallback((kind: "undo" | "redo") => {
    if (historyBlocked || !(kind === "undo" ? score.session?.undoDepth : score.session?.redoDepth)) return;
    historySequence.current += 1;
    setHistoryActivity({ kind, sequence: historySequence.current });
    input.history(kind);
  }, [historyBlocked, input, score.session?.redoDepth, score.session?.undoDepth]);
  const noteOverview = useNoteOverview(input, score.session, blocked, scoreViewport, score.loadEpoch);
  useEffect(() => { if (score.session) scoreViewport.current?.focus({ preventScroll: true }); }, [score.session?.documentId]);
  const staffDefinition = workbenchPlugins.components.get("notation.staff-view");
  const staffPlacement = listUiComponentsInSlot(uiLayout, "workspace").find((placement) => placement.componentId === staffDefinition?.id);
  const moveComponent = useCallback((componentId: string, slot: UiSlot, order?: number) =>
    aroundLayoutMutation(() => move(componentId, slot, order)), [aroundLayoutMutation, move]);
  const hideComponent = useCallback((componentId: string) =>
    aroundLayoutMutation(() => hide(componentId)), [aroundLayoutMutation, hide]);
  const presentComponent = useCallback((componentId: string, presentation: UiPresentation) =>
    aroundLayoutMutation(() => setPresentation(componentId, presentation)), [aroundLayoutMutation, setPresentation]);
  const toggleWorkbenchDock = useCallback((slot: Parameters<typeof toggleDock>[0]) =>
    aroundLayoutMutation(() => toggleDock(slot)), [aroundLayoutMutation, toggleDock]);
  const resetLayout = useCallback(() => {
    aroundLayoutMutation(workspaceConfiguration.reset);
  }, [aroundLayoutMutation, workspaceConfiguration.reset]);
  const hostCommandContributions = useMemo<readonly WorkbenchCommand[]>(() => [
    { id: "file.new", label: "新建乐谱…", shortcut: "Mod+N", shortcutLabel: "Ctrl/⌘ + N", scope: "global",
      enabled: files.available, run: files.requestNewScore },
    { id: "file.open", label: "打开…", shortcut: "Mod+O", shortcutLabel: "Ctrl/⌘ + O", scope: "global",
      enabled: files.available, run: files.requestOpenPicker },
    { id: "file.save", label: "保存", shortcut: "Mod+S", shortcutLabel: "Ctrl/⌘ + S", scope: "global",
      enabled: files.available && Boolean(score.session), run: async () => { await files.saveDocument(); } },
    { id: "file.save-as", label: "另存为…", shortcut: "Mod+Shift+S", shortcutLabel: "Ctrl/⌘ + Shift + S", scope: "global",
      enabled: files.available && Boolean(score.session), run: files.requestSaveAs },
    { id: "file.export-svg", label: "导出五线谱 SVG", scope: "global",
      enabled: files.available && score.session?.notation.kind === "staff", run: files.exportSvg },
    { id: "edit.preferences", label: "界面设置…", scope: "global", enabled: true, run: () => setPreferencesOpen(true) },
    { id: "view.reset-layout", label: "恢复默认布局", scope: "global", enabled: true, run: resetLayout },
    ...(["left", "right", "top", "bottom"] as const).map((side): WorkbenchCommand => ({
      id: `view.toggle-${side}`, label: `${visibility[side] ? "隐藏" : "显示"}${side === "left" ? "左侧" : side === "right" ? "右侧" : side === "top" ? "上方" : "下方"}停靠区`,
      scope: "global", enabled: true, run: () => toggleWorkbenchDock(side),
    })),
    { id: "view.inspect-layout", label: inspectLayout ? "关闭组件边界预览" : "显示组件边界预览",
      scope: "global", enabled: true, run: () => setInspectLayout((value) => !value) },
    ...(pluginDiagnostics.length > 0 ? [{ id: "help.plugin-diagnostics", label: `插件诊断 (${pluginDiagnostics.length})`,
      scope: "global" as const, enabled: true, run: () => setPluginDiagnosticsOpen(true) }] : []),
  ], [files, inspectLayout, pluginDiagnostics.length, resetLayout, score.session, toggleWorkbenchDock, visibility]);
  const pluginProjections = useMemo(() => workbenchPlugins.projections.snapshot([
    bindUiProjection(STAFF_PROJECTION, {
      notation: score.session?.notation ?? null,
      renderer: vexflowRenderer,
      loading: score.loading,
      error: score.error,
      retryLabel: score.retryLabel,
      onRetry: score.retry,
      zoom: paperZoom.zoom,
      onZoomIn: paperZoom.zoomIn,
      onZoomOut: paperZoom.zoomOut,
      showRuleWarnings: ruleWarningsVisible,
      editing: { point: inputAvailable && input.enabled ? input.point : null, draftStep: noteOverview.draftStep,
        busy: blocked || input.pending > 0, selectedEventId: noteOverview.selectedEventId,
        onSelectEvent: noteOverview.onSelectEvent, feedback: input.feedback, viewportRef: scoreViewport,
        onKeyDown: noteOverview.onKeyDown, onLocate: noteOverview.onLocate },
    }),
    bindUiProjection(NOTE_CONTROL_PROJECTION, {
      viewModel: { value: noteOverview.value, position: noteOverview.position, disabled: noteOverview.disabled,
        pending: noteOverview.pending > 0, message: noteOverview.message ?? "" },
      actions: { change: noteOverview.change },
    }),
    bindUiProjection(HISTORY_PROJECTION, { undoDepth: score.session?.undoDepth ?? 0, redoDepth: score.session?.redoDepth ?? 0,
      blocked: historyBlocked, activity: historyActivity, execute: dispatchHistory }),
    bindUiProjection(PAPER_ZOOM_PROJECTION, { zoom: paperZoom.zoom, enabled: inputAvailable,
      zoomIn: paperZoom.zoomIn, zoomOut: paperZoom.zoomOut, fit: paperZoom.fit }),
  ]), [blocked, dispatchHistory, historyActivity, historyBlocked, input.enabled, input.feedback, input.pending,
    input.point, inputAvailable, noteOverview.change, noteOverview.disabled, noteOverview.message, noteOverview.onKeyDown,
    noteOverview.draftStep, noteOverview.onLocate, noteOverview.onSelectEvent, noteOverview.pending, noteOverview.position, noteOverview.selectedEventId,
    noteOverview.value, paperZoom.fit, paperZoom.zoom, paperZoom.zoomIn, paperZoom.zoomOut, score.error, score.loading,
    ruleWarningsVisible, score.retry, score.session?.notation, score.session?.redoDepth, score.session?.undoDepth, scoreViewport]);
  const pluginCommandContributions = useMemo(() => workbenchPlugins.resolveCommands(pluginProjections), [pluginProjections]);
  const commandContributions = useMemo<readonly WorkbenchCommand[]>(() =>
    [...hostCommandContributions, ...pluginCommandContributions], [hostCommandContributions, pluginCommandContributions]);
  useWorkbenchCommands(commandContributions);
  const commandsById = useMemo(() => new Map(commandContributions.map((command) => [command.id, command] as const)), [commandContributions]);
  const navigationAction = useCallback((id: string, movesFocus = false): NavigationAction => {
    const command = commandsById.get(id);
    if (!command) throw new Error(`Unknown navigation command: ${id}`);
    return { id, label: command.label, ...(command.shortcutLabel ? { shortcut: command.shortcutLabel } : {}),
      ...(movesFocus ? { movesFocus: true } : {}),
      ...(command.enabled ? { onSelect: () => { runtime.commands.execute(id); } } : {}) };
  }, [commandsById, runtime.commands]);
  const componentViews = useMemo(() => workbenchPlugins.resolveViews(pluginProjections), [pluginProjections]);
  const renderSlot = (slot: SharedDockSlot) => {
    // Unreviewed renderers stay registered without appearing in the normal workbench.
    const items = listUiComponentsInSlot(uiLayout, slot).flatMap((placement) => {
      const definition = workbenchPlugins.components.get(placement.componentId);
      const contribution = componentViews.get(placement.componentId);
      if (!definition || (!contribution && !inspectLayout)) return [];
      return [{ id: placement.componentId, label: contribution?.label ?? definition.id,
        icon: contribution?.icon ?? <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="4" y="4" width="16" height="16" rx="3" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>,
        ...(contribution?.inlineZone ? { inlineZone: contribution.inlineZone } : {}),
        content: <UiComponentHost definition={definition} placement={placement} layoutMode={inspectLayout ? "inspect" : "normal"}
          onMove={moveComponent} onHide={hideComponent} onPresentationChange={presentComponent}>
          {contribution?.render()}
        </UiComponentHost> }];
    });
    if (items.length > 0) return <SharedDock slot={slot} items={items} preferredId={dockSelection[slot]}
      onSelect={(id, ids) => selectDockItem(slot, id, ids)} motionEnabled={animationsEnabled} />;
    return inspectLayout ? <InspectSlot slot={slot} state={uiLayout} definitions={INSTALLED_COMPONENTS}
      onMove={moveComponent} onHide={hideComponent} onPresentationChange={presentComponent} /> : undefined;
  };
  const groups = useMemo<readonly NavigationGroup[]>(() => [
    {
      id: "file",
      label: "文件",
      actions: [
        navigationAction("file.new", true),
        navigationAction("file.open", true),
        navigationAction("file.save", true),
        navigationAction("file.save-as", true),
        navigationAction("file.export-svg", true),
      ],
      description: files.working ? "正在处理文件…" : files.state === "saved"
        ? `项目文件：${files.name}.bgp.json · 已保存` : files.state === "error"
        ? "上次保存失败，请查看错误提示" : "当前乐谱未保存",
    },
    {
      id: "edit",
      label: "编辑",
      actions: [
        navigationAction("edit.undo", true),
        navigationAction("edit.redo", true),
        navigationAction("edit.preferences", true),
      ],
      description: "选中音符时修改当前音符；输入预览时设置接下来的音符",
    },
    {
      id: "view",
      label: "视图",
      actions: [
        navigationAction("view.paper-zoom-in"),
        navigationAction("view.paper-zoom-out"),
        navigationAction("view.paper-fit"),
        navigationAction("view.reset-layout", true),
        navigationAction("view.toggle-left"),
        navigationAction("view.toggle-right"),
        navigationAction("view.toggle-top"),
        navigationAction("view.toggle-bottom"),
        navigationAction("view.inspect-layout"),
      ],
      description: "边界预览只用于检查无样式组件挂载点",
    },
    {
      id: "help",
      label: "帮助",
      actions: pluginDiagnostics.length > 0
        ? [navigationAction("help.plugin-diagnostics", true), { id: "help.disabled", label: "框架操作：拖动分隔线，方向键微调" }]
        : [{ id: "help.disabled", label: "框架操作：拖动分隔线，方向键微调" }],
      description: "点击小节定位末尾；A–G 加组号落谱；选中音符后 A–G 加组号修改当前音符；＋／− 时值；. 附点；Backspace／Delete 删除；Esc 清除草稿或选择",
    },
  ], [files.name, files.state, files.working, navigationAction, pluginDiagnostics.length]);

  return <>
    <WorkbenchShell
    navigation={<NavigationBar groups={groups} triggerRefs={{ edit: editMenuRef, file: fileMenuRef }} />}
    motionEnabled={animationsEnabled}
    onKeyDownCapture={(event) => {
      if (event.nativeEvent.isComposing || (event.target instanceof Element &&
        event.target.closest("input, textarea, select, [contenteditable='true']"))) return;
      if (!runtime.commands.handle(event, "score")) noteOverview.onKeyDown(event);
    }}
    layout={layout}
    onLayoutChange={setLayout}
    visibility={visibility}
    onToggleDock={toggleWorkbenchDock}
    showPlaceholders={false}
    top={renderSlot("top")}
    left={renderSlot("left")}
    right={renderSlot("right")}
    bottom={renderSlot("bottom")}
  >
    {staffDefinition && staffPlacement && <UiComponentHost definition={staffDefinition} placement={staffPlacement}
      layoutMode={inspectLayout ? "inspect" : "normal"} onMove={moveComponent} onHide={hideComponent}
      onPresentationChange={presentComponent}>
      {componentViews.get(staffDefinition.id)?.render()}
    </UiComponentHost>}
    </WorkbenchShell>
    <PreferencesDialog open={preferencesOpen} onOpenChange={setPreferencesOpen}
      animationsEnabled={animationsEnabled} onAnimationsChange={applicationSettings.setAnimationsEnabled}
      ruleWarningsVisible={ruleWarningsVisible} onRuleWarningsVisibleChange={applicationSettings.setRuleWarningsVisible}
      deleteTimePolicy={deleteTimePolicy} onDeleteTimePolicyChange={applicationSettings.setDeleteTimePolicy}
      settingsReady={applicationSettings.ready} settingsSaving={applicationSettings.saving}
      settingsMessage={applicationSettings.message} onReset={applicationSettings.reset}
      returnFocusRef={editMenuRef} />
    <NewScoreDialog open={files.newScoreOpen} onOpenChange={files.setNewScoreOpen}
      onCreate={files.createScore} returnFocusRef={fileMenuRef} completionFocusRef={scoreViewport} />
    <SaveAsDialog open={files.saveAsOpen} onOpenChange={files.setSaveAsOpen}
      initialName={files.name} onSave={(name) => files.saveDocument(name)} returnFocusRef={fileMenuRef} />
    <UnsavedChangesDialog action={files.pendingAction} saving={files.working === "save"}
      onOpenChange={(open) => { if (!open && files.working !== "save") files.setPendingAction(null); }}
      onDiscard={files.discardPending} onSaveAndContinue={() => { void files.saveAndContinue(); }} />
    <input ref={files.fileInputRef} className="visually-hidden" type="file"
      accept=".bgp.json,.json,application/json" aria-label="打开乐谱文件"
      onChange={(event) => { const file = event.target.files?.[0]; event.target.value = "";
        if (file) files.requestOpenFile(file);
      }} />
    {files.fileError && <div className="connection-feedback" role="alert">{files.fileError}
      <button type="button" className="button" onClick={files.clearError}>关闭</button>
    </div>}
    <WorkbenchFeedbackAnnouncer feedback={runtime.feedback.latest} />
    <PluginDiagnosticDialog diagnostics={pluginDiagnostics} open={pluginDiagnosticsOpen}
      onOpenChange={setPluginDiagnosticsOpen} />
  </>;
}
