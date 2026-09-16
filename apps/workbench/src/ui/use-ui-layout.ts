import { useCallback, useEffect, useState } from "react";
import type { UiComponentDefinition, UiPresentation, UiSlot } from "./plugin-contract";
import { DEFAULT_COMPONENT_PLACEMENTS, moveUiComponent, reconcileUiLayout, restoreUiLayout, setUiComponentPresentation, setUiComponentVisibility, UI_LAYOUT_VERSION } from "./layout-state";
import type { UiLayoutRestoreResult, UiLayoutState } from "./layout-state";

const STORAGE_KEY = "brilliant.workbench.ui-layout.v2";
const PREVIOUS_STORAGE_KEY = "brilliant.workbench.ui-layout.v1";
const RECOVERY_KEY = "brilliant.workbench.ui-layout-recovery.v1";

function readLayout(definitions: readonly UiComponentDefinition[]): UiLayoutRestoreResult {
  try {
    return restoreUiLayout(definitions, JSON.parse(localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(PREVIOUS_STORAGE_KEY) ?? "null"));
  } catch {
    return { state: reconcileUiLayout(definitions, null), recovered: true, reason: "invalid-json" };
  }
}

export function useUiLayout(definitions: readonly UiComponentDefinition[]) {
  const [initial] = useState(() => readLayout(definitions));
  const [state, setState] = useState<UiLayoutState>(initial.state);
  const [recovery, setRecovery] = useState(initial.recovered ? initial.reason ?? "invalid-placement" : null);
  const move = useCallback((componentId: string, slot: UiSlot, order?: number) => {
    setState((current) => moveUiComponent(current, definitions, componentId, slot, order));
  }, [definitions]);
  const hide = useCallback((componentId: string) => setState((current) => setUiComponentVisibility(current, componentId, false)), []);
  const show = useCallback((componentId: string) => setState((current) => setUiComponentVisibility(current, componentId, true)), []);
  const setPresentation = useCallback((componentId: string, presentation: UiPresentation) => {
    setState((current) => setUiComponentPresentation(current, definitions, componentId, presentation));
  }, [definitions]);
  const reset = useCallback(() => setState(reconcileUiLayout(definitions, { version: UI_LAYOUT_VERSION, placements: DEFAULT_COMPONENT_PLACEMENTS })), [definitions]);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* The current layout remains usable in memory. */ }
  }, [state]);

  useEffect(() => {
    if (!recovery) return;
    try { sessionStorage.setItem(RECOVERY_KEY, JSON.stringify({ reason: recovery, occurredAt: Date.now() })); } catch { /* Diagnostics stay optional. */ }
  }, [recovery]);

  return { state, recovery, clearRecovery: () => setRecovery(null), move, hide, show, setPresentation, reset };
}
