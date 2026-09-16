import { useCallback, useEffect, useState } from "react";
import { DEFAULT_SHARED_DOCK_SELECTION, selectDockItem } from "./shared-dock-selection";
import type { SharedDockSelection, SharedDockSlot } from "./shared-dock-selection";

const STORAGE_KEY = "brilliant.workbench.shared-dock-selection.v1";

function readSelection(): SharedDockSelection {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    if (!parsed || typeof parsed !== "object") return DEFAULT_SHARED_DOCK_SELECTION;
    const record = parsed as Record<string, unknown>;
    for (const slot of ["top", "left", "right", "bottom"] as const) {
      if (record[slot] !== null && typeof record[slot] !== "string") return DEFAULT_SHARED_DOCK_SELECTION;
    }
    return record as SharedDockSelection;
  } catch { return DEFAULT_SHARED_DOCK_SELECTION; }
}

export function useSharedDockSelection() {
  const [selection, setSelection] = useState<SharedDockSelection>(readSelection);
  const select = useCallback((slot: SharedDockSlot, id: string, availableIds: readonly string[]) => {
    setSelection((current) => selectDockItem(current, slot, id, availableIds));
  }, []);
  const reset = useCallback(() => setSelection(DEFAULT_SHARED_DOCK_SELECTION), []);
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(selection)); } catch { /* Keeps this session's choice. */ }
  }, [selection]);
  return { selection, select, reset };
}
