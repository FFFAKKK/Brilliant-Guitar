import type { UiPluginCommandContribution } from "./plugin-manager.ts";
import { PAPER_ZOOM } from "../notation/paper-zoom.ts";

export interface FirstPartyPluginCommandBindings {
  readonly history: Readonly<{
    undoDepth: number;
    redoDepth: number;
    blocked: boolean;
    execute(kind: "undo" | "redo"): void;
  }>;
  readonly paperZoom: Readonly<{
    zoom: number;
    enabled: boolean;
    zoomIn(): void;
    zoomOut(): void;
    fit(): void;
  }>;
}

/** Compiled handlers stay outside the serializable manifest but are checked against its command IDs. */
export function firstPartyPluginCommands(bindings: FirstPartyPluginCommandBindings): readonly UiPluginCommandContribution[] {
  return [
    { pluginId: "brilliant.editing.history", command: {
      id: "edit.undo", label: "撤销", shortcut: "Mod+Z", shortcutLabel: "Ctrl/⌘ + Z", scope: "score",
      enabled: bindings.history.undoDepth > 0 && !bindings.history.blocked,
      run: () => bindings.history.execute("undo"),
    } },
    { pluginId: "brilliant.editing.history", command: {
      id: "edit.redo", label: "重做", shortcut: "Mod+Shift+Z", shortcutLabel: "Ctrl/⌘ + Shift + Z", scope: "score",
      enabled: bindings.history.redoDepth > 0 && !bindings.history.blocked,
      run: () => bindings.history.execute("redo"),
    } },
    { pluginId: "brilliant.view.paper-zoom", command: {
      id: "view.paper-zoom-in", label: "放大谱面", shortcut: "Mod+Plus", shortcutLabel: "Ctrl/⌘ + ＋", scope: "score",
      enabled: bindings.paperZoom.enabled && bindings.paperZoom.zoom < PAPER_ZOOM.max,
      run: bindings.paperZoom.zoomIn,
    } },
    { pluginId: "brilliant.view.paper-zoom", command: {
      id: "view.paper-zoom-out", label: "缩小谱面", shortcut: "Mod+Minus", shortcutLabel: "Ctrl/⌘ + −", scope: "score",
      enabled: bindings.paperZoom.enabled && bindings.paperZoom.zoom > PAPER_ZOOM.min,
      run: bindings.paperZoom.zoomOut,
    } },
    { pluginId: "brilliant.view.paper-zoom", command: {
      id: "view.paper-fit", label: "适配整页", shortcut: "Mod+0", shortcutLabel: "Ctrl/⌘ + 0", scope: "score",
      enabled: bindings.paperZoom.enabled,
      run: bindings.paperZoom.fit,
    } },
  ];
}
