import { HistoryControlComponent, HistoryDockIcon } from "../components/history-control-component.tsx";
import { NoteControlDockIcon, NoteInputComponent } from "../components/note-input-component.tsx";
import { PaperZoomControl, PaperZoomDockIcon } from "../components/paper-zoom-control.tsx";
import { StaffView } from "../components/staff-view.tsx";
import { PlaybackTransport, PlaybackTransportDockIcon } from "../components/playback-transport.tsx";
import { PlaybackOutput, PlaybackOutputDockIcon } from "../components/playback-output.tsx";
import { AgentAssistantDockIcon, AgentAssistantPanel } from "../components/agent-recovery-panel.tsx";
import { useHostedUiComponent } from "../components/ui-component-host.tsx";
import { PAPER_ZOOM } from "../notation/paper-zoom.ts";
import { AGENT_ASSISTANT_PROJECTION, HISTORY_PROJECTION, NOTE_CONTROL_PROJECTION, PAPER_ZOOM_PROJECTION, PLAYBACK_OUTPUT_PROJECTION, PLAYBACK_PROJECTION, STAFF_PROJECTION } from "./first-party-plugin-projections.ts";
import { AGENT_RECOVERY_COMPONENT, HISTORY_COMPONENT, NOTE_CONTROL_COMPONENT, PAPER_ZOOM_COMPONENT, PLAYBACK_COMPONENT, PLAYBACK_OUTPUT_COMPONENT, STAFF_COMPONENT } from "./first-party-component-definitions.ts";
import { staffInteractionContribution } from "../editor/staff-interaction-contribution.ts";
import { NOTE_CONTROL_EXTENSION_POINT } from "./note-control-extension.ts";
import { definePlugin } from "../plugins/plugin-sdk.ts";
import type { PluginCommandContribution, PluginProjectionReader, UiPluginPackage } from "../plugins/plugin-sdk.ts";
import { BUILTIN_SYNTH_PLAYBACK_OUTPUT } from "../playback/playback-output.ts";

export const AGENT_ASSISTANT_PLUGIN_ID = "brilliant.agent.assistant";

function HistoryPluginView({ projections }: { readonly projections: PluginProjectionReader }) {
  const component = useHostedUiComponent();
  const projection = projections.get(HISTORY_PROJECTION);
  return createElement(HistoryControlComponent, { ...projection, onHistory: (kind) => {
    component.executeCommand(kind === "undo" ? "edit.undo" : "edit.redo");
  } });
}

function PaperZoomPluginView({ projections }: { readonly projections: PluginProjectionReader }) {
  const component = useHostedUiComponent();
  const projection = projections.get(PAPER_ZOOM_PROJECTION);
  return createElement("div", { className: "paper-zoom-dock" }, createElement(PaperZoomControl, {
    zoom: projection.zoom,
    enabled: projection.enabled,
    onZoomIn: () => { component.executeCommand("view.paper-zoom-in"); },
    onZoomOut: () => { component.executeCommand("view.paper-zoom-out"); },
    onFit: () => { component.executeCommand("view.paper-fit"); },
  }));
}

const historyCommands: readonly PluginCommandContribution[] = [
  { id: "edit.undo", create: (projections) => {
    const projection = projections.get(HISTORY_PROJECTION);
    return { id: "edit.undo", label: "撤销", shortcut: "Mod+Z", shortcutLabel: "Ctrl/⌘ + Z", scope: "score",
      enabled: projection.undoDepth > 0 && !projection.blocked, run: () => projection.execute("undo") };
  } },
  { id: "edit.redo", create: (projections) => {
    const projection = projections.get(HISTORY_PROJECTION);
    return { id: "edit.redo", label: "重做", shortcut: "Mod+Shift+Z", shortcutLabel: "Ctrl/⌘ + Shift + Z", scope: "score",
      enabled: projection.redoDepth > 0 && !projection.blocked, run: () => projection.execute("redo") };
  } },
];

const zoomCommands: readonly PluginCommandContribution[] = [
  { id: "view.paper-zoom-in", create: (projections) => {
    const projection = projections.get(PAPER_ZOOM_PROJECTION);
    return { id: "view.paper-zoom-in", label: "放大谱面", shortcut: "Mod+Plus", shortcutLabel: "Ctrl/⌘ + ＋", scope: "score",
      enabled: projection.enabled && projection.zoom < PAPER_ZOOM.max, run: projection.zoomIn };
  } },
  { id: "view.paper-zoom-out", create: (projections) => {
    const projection = projections.get(PAPER_ZOOM_PROJECTION);
    return { id: "view.paper-zoom-out", label: "缩小谱面", shortcut: "Mod+Minus", shortcutLabel: "Ctrl/⌘ + −", scope: "score",
      enabled: projection.enabled && projection.zoom > PAPER_ZOOM.min, run: projection.zoomOut };
  } },
  { id: "view.paper-fit", create: (projections) => {
    const projection = projections.get(PAPER_ZOOM_PROJECTION);
    return { id: "view.paper-fit", label: "适配整页", shortcut: "Mod+0", shortcutLabel: "Ctrl/⌘ + 0", scope: "score",
      enabled: projection.enabled, run: projection.fit };
  } },
];

const playbackCommands: readonly PluginCommandContribution[] = [
  { id: "playback.previous", create: (projections) => {
    const projection = projections.get(PLAYBACK_PROJECTION);
    return { id: "playback.previous", label: "上一个音符", scope: "score",
      enabled: projection.snapshot.state !== "unavailable" && !projection.snapshot.pending && projection.canPrevious,
      run: projection.previous };
  } },
  { id: "playback.toggle", create: (projections) => {
    const projection = projections.get(PLAYBACK_PROJECTION);
    return { id: "playback.toggle", label: projection.snapshot.state === "playing" ? "暂停" : "播放",
      shortcut: "Space", shortcutLabel: "Space", scope: "score",
      enabled: projection.snapshot.state !== "unavailable" && !projection.snapshot.pending,
      run: projection.toggle };
  } },
  { id: "playback.stop", create: (projections) => {
    const projection = projections.get(PLAYBACK_PROJECTION);
    return { id: "playback.stop", label: "停止", scope: "score",
      enabled: projection.snapshot.state !== "unavailable" && !projection.snapshot.pending
        && (projection.snapshot.state !== "stopped" || projection.snapshot.positionSeconds > 0),
      run: projection.stop };
  } },
  { id: "playback.next", create: (projections) => {
    const projection = projections.get(PLAYBACK_PROJECTION);
    return { id: "playback.next", label: "下一个音符", scope: "score",
      enabled: projection.snapshot.state !== "unavailable" && !projection.snapshot.pending && projection.canNext,
      run: projection.next };
  } },
];

const historyPlugin = definePlugin({
  id: "brilliant.editing.history",
  name: "编辑历史",
  version: "1.0.0",
  capabilities: ["workbench.layout", "workbench.commands", "score.history"],
  projections: [HISTORY_PROJECTION],
  commands: historyCommands,
  views: [{
    definition: HISTORY_COMPONENT,
    label: "编辑历史",
    icon: createElement(HistoryDockIcon),
    inlineZone: "leading",
    render: (projections) => createElement(HistoryPluginView, { projections }),
  }],
});

const paperZoomPlugin = definePlugin({
  id: "brilliant.view.paper-zoom",
  name: "谱面缩放",
  version: "1.0.0",
  capabilities: ["workbench.layout", "workbench.commands", "view.paper"],
  projections: [PAPER_ZOOM_PROJECTION],
  commands: zoomCommands,
  views: [{
    definition: PAPER_ZOOM_COMPONENT,
    label: "谱面缩放",
    icon: createElement(PaperZoomDockIcon),
    inlineZone: "trailing",
    render: (projections) => createElement(PaperZoomPluginView, { projections }),
  }],
});

const noteControlCommands: readonly PluginCommandContribution[] = [
  { id: "edit.insert-rest", create: (projections) => {
    const projection = projections.get(NOTE_CONTROL_PROJECTION);
    return { id: "edit.insert-rest", label: "在当前位置插入休止符", shortcut: "Insert", shortcutLabel: "Insert",
      scope: "score", enabled: projection.viewModel.canInsertRest, run: projection.actions.insertRest };
  } },
];

const noteControlPlugin = definePlugin({
  id: "brilliant.notation.note-control",
  name: "音符控制",
  version: "1.0.0",
  capabilities: ["workbench.layout", "workbench.commands", "score.document", "score.selection", "score.input"],
  projections: [NOTE_CONTROL_PROJECTION],
  commands: noteControlCommands,
  views: [{
    definition: NOTE_CONTROL_COMPONENT,
    label: "音符控制",
    icon: createElement(NoteControlDockIcon),
    render: (projections, host) => createElement(NoteInputComponent, {
      projection: projections.get(NOTE_CONTROL_PROJECTION),
      extensions: host.extensions(NOTE_CONTROL_EXTENSION_POINT),
    }),
  }],
});

const playbackPlugin = definePlugin({
  id: "brilliant.playback.transport",
  name: "播放控制",
  version: "1.0.0",
  capabilities: ["workbench.layout", "workbench.commands", "playback.transport"],
  projections: [PLAYBACK_PROJECTION],
  commands: playbackCommands,
  views: [{
    definition: PLAYBACK_COMPONENT,
    label: "播放控制",
    icon: createElement(PlaybackTransportDockIcon),
    inlineZone: "center",
    render: (projections) => createElement(PlaybackTransport, { projection: projections.get(PLAYBACK_PROJECTION) }),
  }],
});

const playbackOutputPlugin = definePlugin({
  id: "brilliant.playback.output",
  name: "播放输出",
  version: "1.0.0",
  capabilities: ["workbench.layout", "playback.output"],
  projections: [PLAYBACK_OUTPUT_PROJECTION],
  playbackOutputs: [BUILTIN_SYNTH_PLAYBACK_OUTPUT],
  views: [{
    definition: PLAYBACK_OUTPUT_COMPONENT,
    label: "播放输出",
    icon: createElement(PlaybackOutputDockIcon),
    render: (projections) => createElement(PlaybackOutput, { projection: projections.get(PLAYBACK_OUTPUT_PROJECTION) }),
  }],
});

const agentAssistantPlugin = definePlugin({
  id: AGENT_ASSISTANT_PLUGIN_ID,
  name: "Agent 助手",
  version: "1.0.0",
  activation: "user",
  capabilities: ["workbench.layout", "agent.assistant"],
  projections: [AGENT_ASSISTANT_PROJECTION],
  views: [{
    definition: AGENT_RECOVERY_COMPONENT,
    label: "Agent 助手",
    icon: createElement(AgentAssistantDockIcon),
    render: (projections) => createElement(AgentAssistantPanel, {
      projection: projections.get(AGENT_ASSISTANT_PROJECTION),
    }),
  }],
});

const staffPlugin = definePlugin({
  id: "brilliant.notation.staff",
  name: "五线谱",
  version: "1.0.0",
  capabilities: ["workbench.layout", "score.document", "score.selection"],
  projections: [STAFF_PROJECTION],
  interactions: [staffInteractionContribution],
  views: [{
    definition: STAFF_COMPONENT,
    label: "五线谱",
    render: (projections) => createElement(StaffView, projections.get(STAFF_PROJECTION)),
  }],
});

export const FIRST_PARTY_UI_PLUGINS: readonly UiPluginPackage[] = [
  staffPlugin,
  noteControlPlugin,
  historyPlugin,
  paperZoomPlugin,
  playbackPlugin,
  playbackOutputPlugin,
  agentAssistantPlugin,
];
import { createElement } from "react";
