export type WorkspaceUiSlot = "workspace" | "top" | "right" | "bottom" | "left" | "overlay";
export type WorkspaceUiPresentation = "inline" | "panel" | "popover" | "dialog";

export interface WorkspaceConfigurationV1 {
  readonly schemaVersion: 1;
  readonly dock: {
    readonly layout: Readonly<{ left: number; right: number; top: number; bottom: number }>;
    readonly visibility: Readonly<{ top: boolean; right: boolean; bottom: boolean; left: boolean }>;
    readonly selection: Readonly<{ top: string | null; right: string | null; bottom: string | null; left: string | null }>;
  };
  readonly uiLayout: {
    readonly version: 2;
    readonly placements: readonly {
      readonly componentId: string;
      readonly slot: WorkspaceUiSlot;
      readonly presentation: WorkspaceUiPresentation;
      readonly order: number;
      readonly visible: boolean;
    }[];
  };
  readonly inspectorWidth: number;
}

export interface WorkspaceConfigurationSnapshotV1 {
  readonly configuration: WorkspaceConfigurationV1;
  readonly persisted: boolean;
  readonly recoveredFromInvalid: boolean;
}

export const DEFAULT_WORKSPACE_CONFIGURATION: WorkspaceConfigurationV1 = {
  schemaVersion: 1,
  dock: {
    layout: { left: 208, right: 280, top: 56, bottom: 136 },
    visibility: { top: true, right: true, bottom: true, left: true },
    selection: { top: null, right: null, bottom: null, left: null },
  },
  uiLayout: {
    version: 2,
    placements: [
      { componentId: "notation.staff-view", slot: "workspace", presentation: "inline", order: 0, visible: true },
      { componentId: "notation.note-input", slot: "left", presentation: "panel", order: 0, visible: true },
      { componentId: "notation.history-control", slot: "top", presentation: "panel", order: 0, visible: true },
      { componentId: "playback.transport", slot: "top", presentation: "panel", order: 1, visible: true },
      { componentId: "notation.paper-zoom", slot: "top", presentation: "panel", order: 2, visible: true },
      { componentId: "playback.output", slot: "right", presentation: "panel", order: 0, visible: true },
      { componentId: "agent.recovery-panel", slot: "right", presentation: "panel", order: 1, visible: true },
    ],
  },
  inspectorWidth: 288,
};

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

function onlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === keys.length && actual.every((key) => keys.includes(key));
}

function boundedInteger(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= minimum && value <= maximum;
}

const UI_SLOTS: readonly WorkspaceUiSlot[] = ["workspace", "top", "right", "bottom", "left", "overlay"];
const UI_PRESENTATIONS: readonly WorkspaceUiPresentation[] = ["inline", "panel", "popover", "dialog"];

export function isWorkspaceConfigurationV1(value: unknown): value is WorkspaceConfigurationV1 {
  const root = record(value);
  const dock = record(root?.dock);
  const layout = record(dock?.layout);
  const visibility = record(dock?.visibility);
  const selection = record(dock?.selection);
  const uiLayout = record(root?.uiLayout);
  if (root === null || !onlyKeys(root, ["schemaVersion", "dock", "uiLayout", "inspectorWidth"])
    || root.schemaVersion !== 1 || !boundedInteger(root.inspectorWidth, 160, 2048)
    || dock === null || !onlyKeys(dock, ["layout", "visibility", "selection"])
    || layout === null || !onlyKeys(layout, ["left", "right", "top", "bottom"])
    || ![layout.left, layout.right, layout.top, layout.bottom].every((item) => boundedInteger(item, 0, 4096))
    || visibility === null || !onlyKeys(visibility, ["top", "right", "bottom", "left"])
    || ![visibility.top, visibility.right, visibility.bottom, visibility.left].every((item) => typeof item === "boolean")
    || selection === null || !onlyKeys(selection, ["top", "right", "bottom", "left"])
    || ![selection.top, selection.right, selection.bottom, selection.left]
      .every((item) => item === null || (typeof item === "string" && item.length > 0 && item.length <= 160))
    || uiLayout === null || !onlyKeys(uiLayout, ["version", "placements"]) || uiLayout.version !== 2
    || !Array.isArray(uiLayout.placements) || uiLayout.placements.length > 256) return false;
  const ids = new Set<string>();
  return uiLayout.placements.every((item) => {
    const placement = record(item);
    if (placement === null || !onlyKeys(placement, ["componentId", "slot", "presentation", "order", "visible"])
      || typeof placement.componentId !== "string" || !placement.componentId || placement.componentId.length > 160
      || ids.has(placement.componentId)
      || !UI_SLOTS.includes(placement.slot as WorkspaceUiSlot)
      || !UI_PRESENTATIONS.includes(placement.presentation as WorkspaceUiPresentation)
      || !boundedInteger(placement.order, 0, 4096) || typeof placement.visible !== "boolean") return false;
    ids.add(placement.componentId);
    return true;
  });
}

export function isWorkspaceConfigurationSnapshotV1(value: unknown): value is WorkspaceConfigurationSnapshotV1 {
  const snapshot = record(value);
  return snapshot !== null && onlyKeys(snapshot, ["configuration", "persisted", "recoveredFromInvalid"])
    && isWorkspaceConfigurationV1(snapshot.configuration)
    && typeof snapshot.persisted === "boolean" && typeof snapshot.recoveredFromInvalid === "boolean";
}
