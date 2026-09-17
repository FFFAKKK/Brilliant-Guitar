import { HistoryControlComponent, HistoryDockIcon } from "../components/history-control-component.tsx";
import { NoteControlDockIcon, NoteInputComponent } from "../components/note-input-component.tsx";
import { PaperZoomControl, PaperZoomDockIcon } from "../components/paper-zoom-control.tsx";
import { StaffView } from "../components/staff-view.tsx";
import { useHostedUiComponent } from "../components/ui-component-host.tsx";
import { PAPER_ZOOM } from "../notation/paper-zoom.ts";
import type { InternalUiPluginModule, UiCommandContribution } from "./plugin-manager.ts";
import { WORKBENCH_PLUGIN_API_VERSION } from "./plugin-manifest.ts";
import type { AnyUiProjection, UiProjectionReader } from "./projection-registry.ts";
import { HISTORY_PROJECTION, NOTE_CONTROL_PROJECTION, PAPER_ZOOM_PROJECTION, STAFF_PROJECTION } from "./first-party-plugin-projections.ts";
import { HISTORY_COMPONENT, NOTE_CONTROL_COMPONENT, PAPER_ZOOM_COMPONENT, STAFF_COMPONENT } from "./first-party-component-definitions.ts";

function HistoryPluginView({ projections }: { readonly projections: UiProjectionReader }) {
  const component = useHostedUiComponent();
  const projection = projections.get(HISTORY_PROJECTION);
  return createElement(HistoryControlComponent, { ...projection, onHistory: (kind) => {
    component.executeCommand(kind === "undo" ? "edit.undo" : "edit.redo");
  } });
}

function PaperZoomPluginView({ projections }: { readonly projections: UiProjectionReader }) {
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

const historyCommands: readonly UiCommandContribution[] = [
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

const zoomCommands: readonly UiCommandContribution[] = [
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

function plugin(input: Readonly<{
  id: string;
  name: string;
  capabilities: readonly string[];
  projections: readonly AnyUiProjection[];
  commands?: readonly UiCommandContribution[];
  views: InternalUiPluginModule["views"];
}>): InternalUiPluginModule {
  const commands = input.commands ?? [];
  return {
    manifest: { id: input.id, name: input.name, version: "1.0.0", apiVersion: WORKBENCH_PLUGIN_API_VERSION,
      runtime: "internal-module", requires: { capabilities: input.capabilities, projections: input.projections.map((item) => item.id) },
      contributes: { views: input.views.map((view) => view.definition.id), commands: commands.map((command) => command.id) } },
    projections: input.projections,
    commands,
    views: input.views,
  };
}

export const FIRST_PARTY_UI_PLUGINS: readonly InternalUiPluginModule[] = [
  plugin({ id: "brilliant.notation.staff", name: "五线谱", capabilities: ["workbench.layout", "score.document", "score.selection"],
    projections: [STAFF_PROJECTION], views: [{ definition: STAFF_COMPONENT, label: "五线谱",
      render: (projections) => createElement(StaffView, projections.get(STAFF_PROJECTION)) }] }),
  plugin({ id: "brilliant.notation.note-control", name: "音符控制",
    capabilities: ["workbench.layout", "workbench.commands", "score.document", "score.selection", "score.input"],
    projections: [NOTE_CONTROL_PROJECTION], views: [{ definition: NOTE_CONTROL_COMPONENT, label: "音符控制", icon: createElement(NoteControlDockIcon),
      render: (projections) => createElement(NoteInputComponent, { projection: projections.get(NOTE_CONTROL_PROJECTION) }) }] }),
  plugin({ id: "brilliant.editing.history", name: "编辑历史", capabilities: ["workbench.layout", "workbench.commands", "score.history"],
    projections: [HISTORY_PROJECTION], commands: historyCommands, views: [{ definition: HISTORY_COMPONENT, label: "编辑历史",
      icon: createElement(HistoryDockIcon), inlineZone: "leading",
      render: (projections) => createElement(HistoryPluginView, { projections }) }] }),
  plugin({ id: "brilliant.view.paper-zoom", name: "谱面缩放", capabilities: ["workbench.layout", "workbench.commands", "view.paper"],
    projections: [PAPER_ZOOM_PROJECTION], commands: zoomCommands, views: [{ definition: PAPER_ZOOM_COMPONENT, label: "谱面缩放",
      icon: createElement(PaperZoomDockIcon), inlineZone: "trailing",
      render: (projections) => createElement(PaperZoomPluginView, { projections }) }] }),
];
import { createElement } from "react";
