import { useSyncExternalStore } from "react";

const COMPACT_QUERY = "(max-width: 920px)";
export const isCompactWorkbench = () => window.matchMedia(COMPACT_QUERY).matches;
function subscribe(onChange: () => void) {
  const query = window.matchMedia(COMPACT_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}
export const useCompactWorkbench = () => useSyncExternalStore(subscribe, isCompactWorkbench, () => false);
