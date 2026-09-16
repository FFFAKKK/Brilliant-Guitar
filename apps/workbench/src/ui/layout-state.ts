import type { UiComponentDefinition, UiPresentation, UiSlot } from "./plugin-contract";

export const UI_LAYOUT_VERSION = 2 as const;

export interface UiComponentPlacement {
  readonly componentId: string;
  readonly slot: UiSlot;
  readonly presentation: UiPresentation;
  readonly order: number;
  readonly visible: boolean;
}

export interface UiLayoutState {
  readonly version: typeof UI_LAYOUT_VERSION;
  readonly placements: readonly UiComponentPlacement[];
}

export type UiLayoutRecoveryReason = "invalid-json" | "unsupported-version" | "invalid-placement" | "migrated";
export interface UiLayoutRestoreResult {
  readonly state: UiLayoutState;
  readonly recovered: boolean;
  readonly reason?: UiLayoutRecoveryReason;
}

export const DEFAULT_COMPONENT_PLACEMENTS: readonly UiComponentPlacement[] = [
  { componentId: "notation.staff-view", slot: "workspace", presentation: "inline", order: 0, visible: true },
  { componentId: "notation.note-input", slot: "left", presentation: "panel", order: 0, visible: true },
  { componentId: "notation.history-control", slot: "top", presentation: "panel", order: 0, visible: true },
  { componentId: "notation.paper-zoom", slot: "top", presentation: "panel", order: 1, visible: true },
];

const definitionMap = (definitions: readonly UiComponentDefinition[]) =>
  new Map(definitions.map((definition) => [definition.id, definition] as const));

function isPlacement(value: unknown): value is UiComponentPlacement {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<UiComponentPlacement>;
  return typeof candidate.componentId === "string"
    && typeof candidate.slot === "string"
    && typeof candidate.presentation === "string"
    && typeof candidate.order === "number"
    && Number.isFinite(candidate.order)
    && typeof candidate.visible === "boolean";
}

function normalizeOrders(placements: readonly UiComponentPlacement[]): readonly UiComponentPlacement[] {
  const result: UiComponentPlacement[] = [];
  const slots: readonly UiSlot[] = ["workspace", "top", "right", "bottom", "left", "overlay"];
  for (const slot of slots) {
    placements
      .filter((placement) => placement.slot === slot)
      .sort((left, right) => left.order - right.order)
      .forEach((placement, order) => result.push({ ...placement, order }));
  }
  return result;
}

/** Reconciles persisted layout data with the component definitions installed now. */
export function reconcileUiLayout(
  definitions: readonly UiComponentDefinition[],
  candidate: unknown,
  defaults: readonly UiComponentPlacement[] = DEFAULT_COMPONENT_PLACEMENTS,
): UiLayoutState {
  const definitionsById = definitionMap(definitions);
  const candidateVersion = typeof candidate === "object" && candidate !== null ? (candidate as { version?: unknown }).version : null;
  const candidatePlacements = typeof candidate === "object" && candidate !== null
    && (candidateVersion === 1 || candidateVersion === UI_LAYOUT_VERSION)
    && Array.isArray((candidate as Partial<UiLayoutState>).placements)
    ? (candidate as Partial<UiLayoutState>).placements as readonly unknown[]
    : [];
  const preferred = new Map<string, UiComponentPlacement>();
  for (const value of candidatePlacements) {
    if (!isPlacement(value) || preferred.has(value.componentId)) continue;
    const definition = definitionsById.get(value.componentId);
    if (!definition || !definition.slots.includes(value.slot) || !definition.presentation.allowed.includes(value.presentation)) continue;
    // V1 installed the note tool at the bottom. Its first approved left placement
    // is a one-time migration; V2 deliberately moved bottom placements remain there.
    preferred.set(value.componentId, candidateVersion === 1 && value.componentId === "notation.note-input" && value.slot === "bottom"
      ? { ...value, slot: "left" } : value);
  }
  for (const fallback of defaults) {
    if (preferred.has(fallback.componentId)) continue;
    const definition = definitionsById.get(fallback.componentId);
    if (!definition || !definition.slots.includes(fallback.slot) || !definition.presentation.allowed.includes(fallback.presentation)) continue;
    preferred.set(fallback.componentId, fallback);
  }
  return { version: UI_LAYOUT_VERSION, placements: normalizeOrders([...preferred.values()]) };
}

/** Validates persisted data before reconciliation and records whether recovery was needed. */
export function restoreUiLayout(definitions: readonly UiComponentDefinition[], candidate: unknown): UiLayoutRestoreResult {
  if (candidate === null || candidate === undefined) return { state: reconcileUiLayout(definitions, null), recovered: false };
  if (typeof candidate !== "object" || Array.isArray(candidate)) {
    return { state: reconcileUiLayout(definitions, null), recovered: true, reason: "invalid-json" };
  }
  const raw = candidate as { version?: unknown; placements?: unknown };
  if (raw.version !== 1 && raw.version !== UI_LAYOUT_VERSION) {
    return { state: reconcileUiLayout(definitions, null), recovered: true, reason: "unsupported-version" };
  }
  if (!Array.isArray(raw.placements)) {
    return { state: reconcileUiLayout(definitions, null), recovered: true, reason: "invalid-placement" };
  }
  const definitionsById = definitionMap(definitions);
  const valid = new Set<string>();
  let invalidPlacement = false;
  for (const value of raw.placements) {
    if (!isPlacement(value) || valid.has(value.componentId)) { invalidPlacement = true; continue; }
    const definition = definitionsById.get(value.componentId);
    if (!definition || !definition.slots.includes(value.slot) || !definition.presentation.allowed.includes(value.presentation)) {
      invalidPlacement = true; continue;
    }
    valid.add(value.componentId);
  }
  return {
    state: reconcileUiLayout(definitions, candidate),
    recovered: invalidPlacement || raw.version === 1,
    ...(invalidPlacement ? { reason: "invalid-placement" as const }
      : raw.version === 1 ? { reason: "migrated" as const } : {}),
  };
}

function replacePlacement(state: UiLayoutState, next: UiComponentPlacement): UiLayoutState {
  return { ...state, placements: normalizeOrders(state.placements.map((placement) =>
    placement.componentId === next.componentId ? next : placement)) };
}

export function moveUiComponent(
  state: UiLayoutState,
  definitions: readonly UiComponentDefinition[],
  componentId: string,
  slot: UiSlot,
  order = Number.MAX_SAFE_INTEGER,
): UiLayoutState {
  const definition = definitionMap(definitions).get(componentId);
  const current = state.placements.find((placement) => placement.componentId === componentId);
  if (!definition || !current || !definition.slots.includes(slot)) return state;
  if (slot !== current.slot && !definition.capabilities.dockable) return state;
  if (slot === current.slot && order !== current.order && !definition.capabilities.movable) return state;
  return replacePlacement(state, { ...current, slot, order });
}

export function setUiComponentVisibility(state: UiLayoutState, componentId: string, visible: boolean): UiLayoutState {
  const current = state.placements.find((placement) => placement.componentId === componentId);
  return current ? replacePlacement(state, { ...current, visible }) : state;
}

export function setUiComponentPresentation(
  state: UiLayoutState,
  definitions: readonly UiComponentDefinition[],
  componentId: string,
  presentation: UiPresentation,
): UiLayoutState {
  const definition = definitionMap(definitions).get(componentId);
  const current = state.placements.find((placement) => placement.componentId === componentId);
  if (!definition || !current || !definition.presentation.allowed.includes(presentation)) return state;
  return replacePlacement(state, { ...current, presentation });
}

export function listUiComponentsInSlot(state: UiLayoutState, slot: UiSlot): readonly UiComponentPlacement[] {
  return state.placements.filter((placement) => placement.slot === slot && placement.visible)
    .sort((left, right) => left.order - right.order);
}
