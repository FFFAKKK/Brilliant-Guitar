import type { UiComponentDefinition } from "./plugin-contract.ts";
import { AGENT_ASSISTANT_PROJECTION, HISTORY_PROJECTION, NOTE_CONTROL_PROJECTION, PAPER_ZOOM_PROJECTION, PLAYBACK_OUTPUT_PROJECTION, PLAYBACK_PROJECTION, STAFF_PROJECTION } from "./first-party-plugin-projections.ts";
import { NOTE_CONTROL_EXTENSION_POINT } from "./note-control-extension.ts";

export const STAFF_COMPONENT: UiComponentDefinition = {
  id: "notation.staff-view", version: "1.0", kind: "view", domain: "notation.score", slots: ["workspace"],
  presentation: { allowed: ["inline", "panel"], default: "inline" },
  capabilities: { resizable: true, providesSelection: true, rendersPreview: true },
  permissions: { projections: [STAFF_PROJECTION.id], commands: [] },
};

export const NOTE_CONTROL_COMPONENT: UiComponentDefinition = {
  id: "notation.note-input", version: "1.0", kind: "tool", domain: "notation.editing", slots: ["bottom", "left", "right", "top"],
  presentation: { allowed: ["panel", "popover"], default: "panel" },
  capabilities: { movable: true, resizable: true, dockable: true, acceptsKeyboardInput: true,
    rendersPreview: true, mutatesDocument: true, selectionAware: true },
  permissions: { projections: [NOTE_CONTROL_PROJECTION.id], commands: [] },
  extensionPoints: [NOTE_CONTROL_EXTENSION_POINT],
};

export const HISTORY_COMPONENT: UiComponentDefinition = {
  id: "notation.history-control", version: "1.0", kind: "tool", domain: "editing.history", slots: ["top", "bottom", "left", "right"],
  presentation: { allowed: ["panel", "popover"], default: "panel" },
  capabilities: { movable: true, dockable: true, acceptsKeyboardInput: true, mutatesDocument: true },
  permissions: { projections: [HISTORY_PROJECTION.id], commands: ["edit.undo", "edit.redo"] },
};

export const PAPER_ZOOM_COMPONENT: UiComponentDefinition = {
  id: "notation.paper-zoom", version: "1.0", kind: "tool", domain: "view.navigation", slots: ["top", "bottom", "left", "right"],
  presentation: { allowed: ["panel", "popover"], default: "panel" },
  capabilities: { movable: true, dockable: true, acceptsKeyboardInput: true },
  permissions: { projections: [PAPER_ZOOM_PROJECTION.id], commands: ["view.paper-zoom-in", "view.paper-zoom-out", "view.paper-fit"] },
};

export const PLAYBACK_COMPONENT: UiComponentDefinition = {
  id: "playback.transport", version: "1.0", kind: "tool", domain: "playback.transport", slots: ["top", "bottom", "left", "right"],
  presentation: { allowed: ["panel", "popover"], default: "panel" },
  capabilities: { movable: true, dockable: true, acceptsKeyboardInput: true },
  permissions: { projections: [PLAYBACK_PROJECTION.id],
    commands: ["playback.previous", "playback.toggle", "playback.next", "playback.stop"] },
};

export const PLAYBACK_OUTPUT_COMPONENT: UiComponentDefinition = {
  id: "playback.output", version: "1.0", kind: "tool", domain: "playback.output", slots: ["right", "left", "bottom", "top"],
  presentation: { allowed: ["panel", "popover"], default: "panel" },
  capabilities: { movable: true, resizable: true, dockable: true, acceptsKeyboardInput: true },
  permissions: { projections: [PLAYBACK_OUTPUT_PROJECTION.id], commands: [] },
};

export const AGENT_RECOVERY_COMPONENT: UiComponentDefinition = {
  id: "agent.recovery-panel", version: "1.1", kind: "inspector", domain: "agent.assistant",
  slots: ["right", "left", "bottom", "top"],
  presentation: { allowed: ["panel", "popover"], default: "panel" },
  capabilities: { movable: true, resizable: true, dockable: true, acceptsKeyboardInput: true },
  permissions: { projections: [AGENT_ASSISTANT_PROJECTION.id], commands: [] },
};

export const FIRST_PARTY_UI_COMPONENTS = [
  STAFF_COMPONENT,
  NOTE_CONTROL_COMPONENT,
  HISTORY_COMPONENT,
  PAPER_ZOOM_COMPONENT,
  PLAYBACK_COMPONENT,
  PLAYBACK_OUTPUT_COMPONENT,
  AGENT_RECOVERY_COMPONENT,
] as const;
