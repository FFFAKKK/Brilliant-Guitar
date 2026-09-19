import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { RefObject } from "react";
import { NavigationBar, NavigationSettingsIcon } from "./components/navigation-bar";
import { AboutDialog } from "./components/about-dialog";
import { PreferencesDialog } from "./components/preferences-dialog";
import { NewScoreDialog } from "./components/new-score-dialog";
import { SaveAsDialog } from "./components/save-as-dialog";
import { ScorePropertiesDialog } from "./components/score-properties-dialog";
import { ShortcutsDialog } from "./components/shortcuts-dialog";
import { UnsavedChangesDialog } from "./components/unsaved-changes-dialog";
import type { NavigationAction, NavigationGroup } from "./components/navigation-bar";
import { UiComponentHost } from "./components/ui-component-host";
import { SharedDock } from "./components/shared-dock";
import { useScoreInput } from "./editor/use-score-input";
import { useNoteOverview } from "./editor/use-note-overview";
import { WorkbenchShell } from "./components/workbench-shell";
import { vexflowRenderer } from "./notation/vexflow-renderer";
import { usePaperZoom } from "./notation/use-paper-zoom";
import { keySignatureFifthsAtMeasure } from "./notation/key-signature.ts";
import { listUiComponentsInSlot } from "./ui/layout-state";
import type { UiLayoutState } from "./ui/layout-state";
import type { UiComponentDefinition, UiPresentation, UiSlot } from "./ui/plugin-contract";
import type { SharedDockSlot } from "./ui/shared-dock-selection";
import { useApplicationSettings } from "./ui/use-application-settings.ts";
import { useWorkspaceConfiguration } from "./ui/use-workspace-configuration.ts";
import { setWorkbenchUserPluginEnabled, workbenchPluginDiagnostics, workbenchPluginPlatform } from "./ui/workbench-plugins";
import { AGENT_ASSISTANT_PLUGIN_ID } from "./ui/first-party-plugins.ts";
import { useWorkbenchSession } from "./workbench/use-workbench-session";
import { useDocumentFiles } from "./workbench/use-document-files";
import { WorkbenchFeedbackAnnouncer } from "./components/workbench-feedback-announcer.tsx";
import { PluginDiagnosticDialog } from "./components/plugin-diagnostic-dialog.tsx";
import { WorkbenchRuntimeProvider, useWorkbenchRuntime } from "./runtime/workbench-runtime.tsx";
import { useWorkbenchCommands } from "./runtime/use-workbench-commands.ts";
import { useDisposableResource } from "./runtime/use-disposable-resource.ts";
import { applyShortcutBindings } from "./commands/workbench-command.ts";
import type { WorkbenchCommand } from "./commands/workbench-command.ts";
import { bindUiProjection } from "./ui/projection-registry.ts";
import { AGENT_ASSISTANT_PROJECTION, HISTORY_PROJECTION, NOTE_CONTROL_PROJECTION, PAPER_ZOOM_PROJECTION, PLAYBACK_OUTPUT_PROJECTION, PLAYBACK_PROJECTION, STAFF_PROJECTION } from "./ui/first-party-plugin-projections.ts";
import { usePlaybackSession } from "./playback/use-playback-session.ts";
import { createAgentPluginRuntime } from "./agent/agent-plugin-runtime.ts";
import { createAgentAssistantSession } from "./agent/agent-assistant-session.ts";
import { AGENT_PROVIDER_DESCRIPTORS } from "./agent/agent-provider-catalog.ts";
import { useAgentProviderCredential } from "./agent/use-agent-provider-credential.ts";
import type { AgentWorkspaceScope } from "./agent/agent-contracts.ts";
import type { MeterInput } from "./contracts/note-input.ts";

const INSTALLED_COMPONENTS = workbenchPluginPlatform.components().list();
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
  const [scorePropertiesOpen, setScorePropertiesOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const pluginDiagnostics = useSyncExternalStore(workbenchPluginDiagnostics.subscribe,
    workbenchPluginDiagnostics.list, workbenchPluginDiagnostics.list);
  const pluginRuntimeSnapshot = useSyncExternalStore(workbenchPluginPlatform.subscribe,
    workbenchPluginPlatform.getSnapshot, workbenchPluginPlatform.getSnapshot);
  const [pluginDiagnosticsOpen, setPluginDiagnosticsOpen] = useState(pluginDiagnostics.length > 0);
  const previousPluginDiagnosticCount = useRef(pluginDiagnostics.length);
  useEffect(() => {
    if (pluginDiagnostics.length > previousPluginDiagnosticCount.current) setPluginDiagnosticsOpen(true);
    previousPluginDiagnosticCount.current = pluginDiagnostics.length;
  }, [pluginDiagnostics.length]);
  const editMenuRef = useRef<HTMLButtonElement>(null);
  const fileMenuRef = useRef<HTMLButtonElement>(null);
  const helpMenuRef = useRef<HTMLButtonElement>(null);
  const settingsButtonRef = useRef<HTMLButtonElement>(null);
  const score = useWorkbenchSession(runtime);
  const workspaceConfiguration = useWorkspaceConfiguration(score.client, INSTALLED_COMPONENTS, runtime);
  const { layout, setLayout, visibility, toggleDock, uiLayout, move, hide, setPresentation,
    dockSelection, selectDockItem } = workspaceConfiguration;
  const applicationSettings = useApplicationSettings(score.client, runtime);
  const { animationsEnabled, ruleWarningsVisible } = applicationSettings.settings.ui;
  const { deleteTimePolicy, noteInput: noteInputPreferences } = applicationSettings.settings.editing;
  const [agentComposition] = useState(() => {
    const plugin = createAgentPluginRuntime(score.client);
    const assistant = createAgentAssistantSession(plugin, score.client);
    return {
      plugin,
      assistant,
      dispose() {
        assistant.dispose();
        plugin.dispose();
      },
    };
  });
  const { plugin: agentPlugin, assistant: agentAssistant } = agentComposition;
  useDisposableResource(agentComposition);
  const selectedAgentProvider = useMemo(() => AGENT_PROVIDER_DESCRIPTORS.find(
    (provider) => provider.id === applicationSettings.settings.agent.providerSelection?.providerId,
  ), [applicationSettings.settings.agent.providerSelection?.providerId]);
  const agentCredential = useAgentProviderCredential(
    score.client,
    applicationSettings.settings.agent.providerSelection?.providerId ?? null,
    selectedAgentProvider?.credentialKind === "api-key",
    runtime,
  );
  const agentPluginSnapshot = useSyncExternalStore(
    agentPlugin.subscribe,
    agentPlugin.getSnapshot,
    agentPlugin.getSnapshot,
  );
  const agentAssistantSnapshot = useSyncExternalStore(
    agentAssistant.subscribe,
    agentAssistant.getSnapshot,
    agentAssistant.getSnapshot,
  );
  useEffect(() => {
    if (!applicationSettings.ready) return;
    let cancelled = false;
    void agentPlugin.setProviderSelection(applicationSettings.settings.agent.providerSelection)
      .then(() => cancelled ? undefined : agentPlugin.setEnabled(applicationSettings.settings.agent.enabled));
    return () => { cancelled = true; };
  }, [agentPlugin, applicationSettings.ready, applicationSettings.settings.agent.enabled,
    applicationSettings.settings.agent.providerSelection]);
  useEffect(() => {
    if (!applicationSettings.ready) return;
    void setWorkbenchUserPluginEnabled(AGENT_ASSISTANT_PLUGIN_ID, agentPluginSnapshot.enabled);
  }, [agentPluginSnapshot.enabled, applicationSettings.ready]);
  const saveAgentCredential = useCallback(async (secret: string) => {
    const saved = await agentCredential.save(secret);
    if (saved) await agentPlugin.refresh();
    return saved;
  }, [agentCredential.save, agentPlugin]);
  const deleteAgentCredential = useCallback(async () => {
    const removed = await agentCredential.remove();
    if (removed) await agentPlugin.refresh();
    return removed;
  }, [agentCredential.remove, agentPlugin]);
  const input = useScoreInput(score.session, score.client, score.setSession, scoreViewport, score.loadEpoch, deleteTimePolicy,
    noteInputPreferences, workbenchPluginPlatform.interactions(), runtime);
  const files = useDocumentFiles(score.session, score.client, score.replaceSession, vexflowRenderer,
    score.loading || Boolean(score.error) || input.pending > 0 || input.retryable, runtime);
  const notation = score.session?.notation;
  const staffNotation = notation?.kind === "staff" ? notation : null;
  const inputAvailable = !score.loading && !score.error && notation?.kind === "staff";
  const paperZoom = usePaperZoom();
  const playbackOutputContributions = useMemo(() => workbenchPluginPlatform.playbackOutputs(), [pluginRuntimeSnapshot]);
  const playback = usePlaybackSession(score.session?.playbackSource ?? null, playbackOutputContributions);
  const scoreMetadata = useMemo(() => score.session?.metadata ?? {
    title: score.session?.title ?? "未命名乐谱",
    authors: [] as readonly string[],
    tempoBpm: score.session?.playbackSource.kind === "ready" ? score.session.playbackSource.bpm : 96,
  }, [score.session?.metadata, score.session?.playbackSource, score.session?.title]);
  const blocked = !inputAvailable || input.retryable || files.working !== null;
  const staffMeasureCount = staffNotation?.measures.length ?? 0;
  const initialMeasure = staffNotation?.measures[0];
  const initialMeter = initialMeasure ? { numerator: initialMeasure.meter.numerator,
    denominator: initialMeasure.meter.denominator as MeterInput["denominator"] } : undefined;
  const initialKeySignature = staffNotation && initialMeasure
    ? keySignatureFifthsAtMeasure(staffNotation, initialMeasure.id) : 0;
  const activeMeasureId = input.point?.measureId ?? null;
  const measureStructureEnabled = !blocked && input.pending === 0 && activeMeasureId !== null;
  const historyBlocked = blocked || input.pending > 0;
  const historySequence = useRef(0);
  const [historyActivity, setHistoryActivity] = useState<Readonly<{ kind: "undo" | "redo"; sequence: number }>>();
  const dispatchHistory = useCallback((kind: "undo" | "redo") => {
    if (historyBlocked || !(kind === "undo" ? score.session?.undoDepth : score.session?.redoDepth)) return;
    historySequence.current += 1;
    setHistoryActivity({ kind, sequence: historySequence.current });
    input.history(kind);
  }, [historyBlocked, input, score.session?.redoDepth, score.session?.undoDepth]);
  const noteOverview = useNoteOverview(input, score.session, blocked, scoreViewport, workbenchPluginPlatform.interactions(), score.loadEpoch);
  const agentWorkspace = useMemo<AgentWorkspaceScope>(() => {
    const selectedMeasureId = noteOverview.selectedRange?.measureId ?? noteOverview.selectedMeasureId;
    return {
      workspaceId: score.client.getWorkspaceId(),
      documentId: score.session?.documentId ?? null,
      documentVersion: score.session?.documentVersion ?? null,
      selection: score.session && selectedMeasureId
        ? {
            kind: "measure-range",
            documentId: score.session.documentId,
            documentVersion: score.session.documentVersion,
            startMeasureId: selectedMeasureId,
            endMeasureId: selectedMeasureId,
          }
        : null,
    };
  }, [noteOverview.selectedMeasureId, noteOverview.selectedRange?.measureId, score.client, score.session]);
  useEffect(() => { if (score.session) scoreViewport.current?.focus({ preventScroll: true }); }, [score.session?.documentId]);
  const staffDefinition = workbenchPluginPlatform.components().get("notation.staff-view");
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
    { id: "file.score-properties", label: "乐谱属性…", scope: "global",
      enabled: Boolean(score.session) && input.pending === 0 && !input.retryable && files.working === null,
      run: () => { input.clearFeedback(); setScorePropertiesOpen(true); } },
    { id: "file.export-svg", label: "导出五线谱 SVG", scope: "global",
      enabled: files.available && score.session?.notation.kind === "staff", run: files.exportSvg },
    { id: "edit.insert-measure-before", label: "在当前小节前插入小节", scope: "score",
      enabled: measureStructureEnabled,
      run: () => { if (activeMeasureId) input.insertMeasure(activeMeasureId, "before"); } },
    { id: "edit.insert-measure-after", label: "在当前小节后插入小节", scope: "score",
      enabled: measureStructureEnabled,
      run: () => { if (activeMeasureId) input.insertMeasure(activeMeasureId, "after"); } },
    { id: "edit.remove-measure", label: "删除当前小节", scope: "score",
      enabled: measureStructureEnabled && staffMeasureCount > 1,
      run: () => { if (activeMeasureId) input.removeMeasure(activeMeasureId); } },
    { id: "edit.preferences", label: "界面设置…", scope: "global", enabled: true, run: () => setPreferencesOpen(true) },
    { id: "view.reset-layout", label: "恢复默认布局", scope: "global", enabled: true, run: resetLayout },
    ...(["left", "right", "top", "bottom"] as const).map((side): WorkbenchCommand => ({
      id: `view.toggle-${side}`, label: `${visibility[side] ? "隐藏" : "显示"}${side === "left" ? "左侧" : side === "right" ? "右侧" : side === "top" ? "上方" : "下方"}停靠区`,
      scope: "global", enabled: true, run: () => toggleWorkbenchDock(side),
    })),
    { id: "view.inspect-layout", label: inspectLayout ? "关闭组件边界预览" : "显示组件边界预览",
      scope: "global", enabled: true, run: () => setInspectLayout((value) => !value) },
    { id: "help.shortcuts", label: "键盘操作…", scope: "global", enabled: true, run: () => setShortcutsOpen(true) },
    { id: "help.about", label: "关于 Brilliant Guitar…", scope: "global", enabled: true, run: () => setAboutOpen(true) },
    ...(pluginDiagnostics.length > 0 ? [{ id: "help.plugin-diagnostics", label: `插件诊断 (${pluginDiagnostics.length})`,
      scope: "global" as const, enabled: true, run: () => setPluginDiagnosticsOpen(true) }] : []),
  ], [activeMeasureId, files, input, inspectLayout, measureStructureEnabled, pluginDiagnostics.length, resetLayout,
    score.session, staffMeasureCount, toggleWorkbenchDock, visibility]);
  const pluginProjections = useMemo(() => workbenchPluginPlatform.projections().snapshot([
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
      playback: playback.snapshot,
      editing: { point: inputAvailable && input.enabled ? input.point : null, draftStep: noteOverview.draftStep,
        previewDuration: input.duration, previewRest: input.rest,
        busy: blocked || input.pending > 0, selectedEventId: noteOverview.selectedEventId,
        selectedRange: noteOverview.selectedRange,
        measureCount: staffMeasureCount,
        onInput: noteOverview.onStaffInput, feedback: input.feedback, viewportRef: scoreViewport,
        onInsertMeasure: input.insertMeasure, onRemoveMeasure: input.removeMeasure,
        onSetMeasureMeter: (measureId, meter, scope) => input.applyProperties({
          kind: "set-measure-meter", measureId, meter, scope,
        }, scoreViewport.current ?? undefined),
        onSetKeySignature: (partId, measureId, change) => input.applyProperties({
          kind: "set-key-signature", partId, measureId, change,
        }, scoreViewport.current ?? undefined) },
    }),
    bindUiProjection(NOTE_CONTROL_PROJECTION, {
      viewModel: { value: noteOverview.value, position: noteOverview.position, disabled: noteOverview.disabled,
        pending: noteOverview.pending > 0, message: noteOverview.message ?? "", canInsertRest: noteOverview.canInsertRest,
        preferences: noteInputPreferences, preferencesReady: applicationSettings.ready },
      actions: { input: noteOverview.onControlInput, focusScore: noteOverview.focusScore,
        insertRest: noteOverview.insertRest, setRetention: applicationSettings.setNoteInputRetention,
        setDefaultDuration: applicationSettings.setDefaultNoteInputDuration,
        openApplicationSettings: () => setPreferencesOpen(true) },
    }),
    bindUiProjection(HISTORY_PROJECTION, { undoDepth: score.session?.undoDepth ?? 0, redoDepth: score.session?.redoDepth ?? 0,
      blocked: historyBlocked, activity: historyActivity, execute: dispatchHistory }),
    bindUiProjection(PAPER_ZOOM_PROJECTION, { zoom: paperZoom.zoom, enabled: inputAvailable,
      zoomIn: paperZoom.zoomIn, zoomOut: paperZoom.zoomOut, fit: paperZoom.fit }),
    bindUiProjection(PLAYBACK_PROJECTION, { snapshot: playback.snapshot,
      canPrevious: playback.session.canSeekEvent(-1), canNext: playback.session.canSeekEvent(1),
      toggle: () => {
        const point = input.point;
        playback.session.prepareStart(point ? noteOverview.selectedEventId
          ? { measureId: point.measureId, eventId: noteOverview.selectedEventId }
          : { measureId: point.measureId, offsetUnits: point.offsetUnits } : null);
        return playback.session.toggle();
      }, stop: () => playback.session.stop(), previous: () => playback.session.seekEvent(-1),
      next: () => playback.session.seekEvent(1) }),
    bindUiProjection(PLAYBACK_OUTPUT_PROJECTION, { snapshot: playback.outputSnapshot,
      select: async (id) => { await playback.outputs.select(id); },
      importSoundFont: async (file) => { await playback.outputs.importSoundFont(file); },
      removeSampleBank: (id) => playback.outputs.removeSampleBank(id) }),
    bindUiProjection(AGENT_ASSISTANT_PROJECTION, {
      runtime: agentPluginSnapshot,
      session: agentAssistantSnapshot,
      documentAvailable: score.session !== null,
      selectionAvailable: agentWorkspace.selection !== null,
      start: (goal) => agentAssistant.start(goal, agentWorkspace),
      provideRequiredInput: (runId, requestId) => agentAssistant.provideRequiredInput(
        runId,
        requestId,
        agentWorkspace,
      ),
      cancel: agentAssistant.cancel,
      refresh: agentPlugin.refresh,
      resume: agentPlugin.resume,
    }),
  ]), [blocked, dispatchHistory, historyActivity, historyBlocked, input.duration, input.enabled, input.feedback, input.pending,
    input.point, input.rest, inputAvailable, noteOverview.disabled, noteOverview.focusScore, noteOverview.message,
    noteOverview.canInsertRest, noteOverview.draftStep, noteOverview.insertRest, noteOverview.onControlInput,
    noteOverview.onStaffInput, noteOverview.pending, noteOverview.position,
    noteOverview.selectedEventId, noteOverview.selectedMeasureId, noteOverview.selectedRange,
    noteOverview.value, paperZoom.fit, paperZoom.zoom, paperZoom.zoomIn, paperZoom.zoomOut, playback.outputSnapshot, playback.outputs,
    playback.session, playback.snapshot, score.client, score.error, score.loading, score.session, staffMeasureCount,
    agentAssistant, agentAssistantSnapshot, agentPlugin, agentPluginSnapshot, agentWorkspace,
    ruleWarningsVisible, score.retry, score.session?.notation, score.session?.redoDepth, score.session?.undoDepth, scoreViewport,
    noteInputPreferences, applicationSettings.ready, applicationSettings.setDefaultNoteInputDuration,
    applicationSettings.setNoteInputRetention]);
  const pluginCommandContributions = useMemo(() => workbenchPluginPlatform.resolveCommands(pluginProjections),
    [pluginProjections, pluginRuntimeSnapshot]);
  const commandContributions = useMemo<readonly WorkbenchCommand[]>(() => applyShortcutBindings(
    [...hostCommandContributions, ...pluginCommandContributions], applicationSettings.settings.shortcuts.bindings,
  ), [applicationSettings.settings.shortcuts.bindings, hostCommandContributions, pluginCommandContributions]);
  useWorkbenchCommands(commandContributions);
  const commandsById = useMemo(() => new Map(commandContributions.map((command) => [command.id, command] as const)), [commandContributions]);
  const navigationAction = useCallback((id: string, movesFocus = false): NavigationAction => {
    const command = commandsById.get(id);
    if (!command) throw new Error(`Unknown navigation command: ${id}`);
    return { id, label: command.label, ...(command.shortcutLabel ? { shortcut: command.shortcutLabel } : {}),
      ...(movesFocus ? { movesFocus: true } : {}),
      ...(command.enabled ? { onSelect: () => { runtime.commands.execute(id); } } : {}) };
  }, [commandsById, runtime.commands]);
  const componentViews = useMemo(() => workbenchPluginPlatform.resolveViews(pluginProjections),
    [pluginProjections, pluginRuntimeSnapshot]);
  const renderSlot = (slot: SharedDockSlot) => {
    // Unreviewed renderers stay registered without appearing in the normal workbench.
    const items = listUiComponentsInSlot(uiLayout, slot).flatMap((placement) => {
      const definition = workbenchPluginPlatform.components().get(placement.componentId);
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
        navigationAction("file.score-properties", true),
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
        navigationAction("edit.insert-measure-before", true),
        navigationAction("edit.insert-measure-after", true),
        navigationAction("edit.remove-measure", true),
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
      actions: [navigationAction("help.shortcuts", true),
        ...(pluginDiagnostics.length > 0 ? [navigationAction("help.plugin-diagnostics", true)] : []),
        navigationAction("help.about", true)],
      description: "点击小节定位末尾；Shift 扩展连续选择；Ctrl/⌘ + C/X/V 剪贴；A–G 加组号输入或修改；＋／− 时值；Backspace／Delete 删除；Esc 清除草稿或选择",
    },
  ], [files.name, files.state, files.working, navigationAction, pluginDiagnostics.length]);

  return <>
    <WorkbenchShell
    navigation={<NavigationBar groups={groups} triggerRefs={{ edit: editMenuRef, file: fileMenuRef, help: helpMenuRef }}
      {...(score.session ? { documentTitle: files.name } : {})} documentState={files.state}
      tools={<button ref={settingsButtonRef} type="button" className="navigation-tool-button"
        aria-label="打开应用设置" title="应用设置" onClick={() => setPreferencesOpen(true)}><NavigationSettingsIcon /></button>} />}
    motionEnabled={animationsEnabled}
    onKeyDownCapture={(event) => {
      if (event.nativeEvent.isComposing || (event.target instanceof Element &&
        event.target.closest("button, input, textarea, select, [contenteditable='true'], [role='menu'], [role='dialog']"))) return;
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
      noteInputPreferences={noteInputPreferences} onNoteInputRetentionChange={applicationSettings.setNoteInputRetention}
      onDefaultNoteInputDurationChange={applicationSettings.setDefaultNoteInputDuration}
      agentEnabled={applicationSettings.settings.agent.enabled} onAgentEnabledChange={applicationSettings.setAgentEnabled}
      agentProviderDescriptors={AGENT_PROVIDER_DESCRIPTORS}
      agentProviderSelection={applicationSettings.settings.agent.providerSelection}
      onAgentProviderSelectionChange={applicationSettings.setAgentProviderSelection}
      agentCredential={agentCredential.snapshot} onSaveAgentCredential={saveAgentCredential}
      onDeleteAgentCredential={deleteAgentCredential}
      settingsReady={applicationSettings.ready} settingsSaving={applicationSettings.saving}
      settingsMessage={applicationSettings.message} onReset={applicationSettings.reset}
      workspaceReady={workspaceConfiguration.ready} workspaceSaving={workspaceConfiguration.saving}
      workspaceMessage={workspaceConfiguration.message} workspaceLayoutPreset={workspaceConfiguration.layoutPreset}
      onWorkspaceLayoutPresetChange={workspaceConfiguration.applyLayoutPreset}
      onResetWorkspaceLayout={resetLayout}
      shortcutProfileName={applicationSettings.settings.shortcuts.profileName}
      shortcutBindingCount={Object.keys(applicationSettings.settings.shortcuts.bindings).length}
      onOpenShortcutSettings={() => { setPreferencesOpen(false); setShortcutsOpen(true); }}
      returnFocusRef={settingsButtonRef} />
    <NewScoreDialog open={files.newScoreOpen} onOpenChange={files.setNewScoreOpen}
      onCreate={files.createScore} returnFocusRef={fileMenuRef} completionFocusRef={scoreViewport} />
    <SaveAsDialog open={files.saveAsOpen} onOpenChange={files.setSaveAsOpen}
      initialName={files.name} onSave={(name) => files.saveDocument(name)} returnFocusRef={fileMenuRef} />
    {score.session && initialMeasure && initialMeter && <ScorePropertiesDialog open={scorePropertiesOpen} onOpenChange={setScorePropertiesOpen}
      metadata={scoreMetadata} initialMeasureId={initialMeasure.id} initialMeter={initialMeter}
      initialKeySignature={initialKeySignature}
      initialStaffId={staffNotation?.staffId ?? ""} initialClef={staffNotation?.clef ?? "treble"}
      measureCount={score.session.measureCount} saving={input.pending > 0 && !input.retryable}
      failure={input.feedbackTarget === "properties" ? input.feedback?.issue.message ?? input.message : ""}
      onSave={(changes) => input.applyPropertyChanges([
        ...(changes.metadata ? [{ kind: "set-document-metadata" as const, metadata: changes.metadata }] : []),
        ...(changes.meter ? [{ kind: "set-measure-meter" as const, measureId: initialMeasure.id,
          meter: changes.meter, scope: "meter-run" as const }] : []),
        ...(changes.keySignature !== undefined && staffNotation ? [{ kind: "set-key-signature" as const,
          partId: staffNotation.partId, measureId: initialMeasure.id,
          change: { kind: "set" as const, fifths: changes.keySignature } }] : []),
        ...(changes.clef && staffNotation ? [{ kind: "set-staff-clef" as const,
          staffId: staffNotation.staffId, clef: changes.clef }] : []),
      ], scoreViewport.current ?? undefined)}
      returnFocusRef={fileMenuRef} completionFocusRef={scoreViewport} />}
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
    <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen}
      commands={commandContributions} profileName={applicationSettings.settings.shortcuts.profileName}
      storedBindings={applicationSettings.settings.shortcuts.bindings}
      disabled={!applicationSettings.ready || applicationSettings.saving}
      onBindingChange={applicationSettings.setShortcutBinding}
      onImportTemplate={applicationSettings.importShortcutTemplate}
      onReset={applicationSettings.resetShortcutBindings} returnFocusRef={settingsButtonRef} />
    <AboutDialog open={aboutOpen} onOpenChange={setAboutOpen} returnFocusRef={helpMenuRef} />
  </>;
}
