import { useEffect, useState } from "react";

const STORAGE_KEY = "brilliant.workbench.animation-enabled.v1";

/** A global UI preference; Core music data remains independent of visual motion. */
export function useAnimationPreference() {
  const [enabled, setEnabled] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) !== "false"; } catch { return true; }
  });
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, String(enabled)); } catch { /* Remains active for this session. */ }
  }, [enabled]);
  return { enabled, setEnabled };
}
