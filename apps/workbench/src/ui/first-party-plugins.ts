import type { UiComponentDefinition, UiComponentInstance } from "./plugin-contract.ts";
import type { InternalUiPluginModule } from "./plugin-manager.ts";
import { WORKBENCH_PLUGIN_API_VERSION } from "./plugin-manifest.ts";

const emptyInstance = (): UiComponentInstance => ({ update() {}, dispose() {} });
const component = (input: Omit<UiComponentDefinition, "mount">): UiComponentDefinition => ({ ...input, mount: emptyInstance });

const staff = component({
  id: "notation.staff-view", version: "1.0", kind: "view", domain: "notation.score", slots: ["workspace"],
  presentation: { allowed: ["inline", "panel"], default: "inline" },
  capabilities: { resizable: true, providesSelection: true, rendersPreview: true },
  permissions: { reads: ["score.document"], commands: ["selection.set"] },
});

const noteControl = component({
  id: "notation.note-input", version: "1.0", kind: "tool", domain: "notation.editing", slots: ["bottom", "left", "right", "top"],
  presentation: { allowed: ["panel", "popover"], default: "panel" },
  capabilities: { movable: true, resizable: true, dockable: true, acceptsKeyboardInput: true,
    rendersPreview: true, mutatesDocument: true, selectionAware: true },
  permissions: { reads: ["score.selection", "input.state"], commands: ["score.append-event", "score.set-event-properties", "score.delete-event"] },
});

const history = component({
  id: "notation.history-control", version: "1.0", kind: "tool", domain: "editing.history", slots: ["top", "bottom", "left", "right"],
  presentation: { allowed: ["panel", "popover"], default: "panel" },
  capabilities: { movable: true, dockable: true, acceptsKeyboardInput: true, mutatesDocument: true },
  permissions: { reads: ["score.undo-depth", "score.redo-depth"], commands: ["edit.undo", "edit.redo"] },
});

const paperZoom = component({
  id: "notation.paper-zoom", version: "1.0", kind: "tool", domain: "view.navigation", slots: ["top", "bottom", "left", "right"],
  presentation: { allowed: ["panel", "popover"], default: "panel" },
  capabilities: { movable: true, dockable: true, acceptsKeyboardInput: true },
  permissions: { reads: ["view.paper-zoom"], commands: ["view.paper-zoom-in", "view.paper-zoom-out", "view.paper-fit"] },
});

function plugin(id: string, name: string, requires: readonly string[], definition: UiComponentDefinition,
  commands: readonly string[] = []): InternalUiPluginModule {
  return {
    manifest: { id, name, version: "1.0.0", apiVersion: WORKBENCH_PLUGIN_API_VERSION, runtime: "internal-module",
      requires, contributes: { components: [definition.id], views: [definition.id], commands } },
    components: [definition],
  };
}

export const FIRST_PARTY_UI_PLUGINS: readonly InternalUiPluginModule[] = [
  plugin("brilliant.notation.staff", "五线谱", ["workbench.layout", "score.document", "score.selection"], staff),
  plugin("brilliant.notation.note-control", "音符控制", ["workbench.layout", "workbench.commands", "score.document", "score.selection", "score.input"], noteControl),
  plugin("brilliant.editing.history", "编辑历史", ["workbench.layout", "workbench.commands", "score.history"], history,
    ["edit.undo", "edit.redo"]),
  plugin("brilliant.view.paper-zoom", "谱面缩放", ["workbench.layout", "workbench.commands", "view.paper"], paperZoom,
    ["view.paper-zoom-in", "view.paper-zoom-out", "view.paper-fit"]),
];
