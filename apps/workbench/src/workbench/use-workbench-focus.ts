import { useCallback, useMemo, useRef } from "react";
import type { RefObject } from "react";

export interface WorkbenchFocusController {
  capture(): void;
  restore(): void;
  around(mutation: () => void): void;
}

export function useWorkbenchFocus(fallback: RefObject<HTMLElement | null>): WorkbenchFocusController {
  const remembered = useRef<HTMLElement | null>(null);
  const capture = useCallback(() => {
    remembered.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }, []);
  const restore = useCallback(() => {
    queueMicrotask(() => {
      const target = remembered.current?.isConnected ? remembered.current : fallback.current;
      target?.focus({ preventScroll: true });
      remembered.current = null;
    });
  }, [fallback]);
  const around = useCallback((mutation: () => void) => { capture(); mutation(); restore(); }, [capture, restore]);
  return useMemo(() => ({ capture, restore, around }), [around, capture, restore]);
}
