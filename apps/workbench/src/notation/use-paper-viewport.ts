import { useLayoutEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, RefObject } from "react";
import { recenterPaperViewport } from "./paper-viewport.ts";
import type { PaperViewportGeometry } from "./paper-viewport.ts";

/** Viewport navigation has no document commands or musical state. */
export function usePaperViewport(geometry: PaperViewportGeometry, documentKey: string | null,
  focusRef?: RefObject<HTMLDivElement | null>) {
  const ownViewport = useRef<HTMLDivElement>(null);
  const viewport = focusRef ?? ownViewport;
  const previous = useRef<{ geometry: PaperViewportGeometry; documentKey: string | null } | null>(null);
  const pan = useRef<{ pointerId: number; x: number; y: number; left: number; top: number } | null>(null);
  const [panning, setPanning] = useState(false);

  useLayoutEffect(() => {
    const root = viewport.current;
    if (!root) return;
    const before = previous.current;
    const hostResized = before?.geometry.width !== geometry.width || before?.geometry.height !== geometry.height;
    const scaleChanged = before?.geometry.scale !== geometry.scale;
    // Start at the first system. Oversized paper must not hide the clef offscreen.
    const scroll = before && before.documentKey === documentKey
      ? recenterPaperViewport(before.geometry, geometry, { left: root.scrollLeft, top: root.scrollTop }, hostResized || scaleChanged)
      : { left: 0, top: 0 };
    root.scrollTo(scroll.left, scroll.top);
    previous.current = { geometry, documentKey };
  }, [documentKey, geometry.width, geometry.height, geometry.paperWidth, geometry.scale, geometry.gutter, viewport]);

  const endPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (pan.current?.pointerId !== event.pointerId) return;
    pan.current = null;
    setPanning(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  return {
    viewport,
    panning,
    onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 1) return;
      event.preventDefault();
      const root = event.currentTarget;
      root.focus({ preventScroll: true });
      root.setPointerCapture(event.pointerId);
      pan.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, left: root.scrollLeft, top: root.scrollTop };
      setPanning(true);
    },
    onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => {
      const start = pan.current;
      if (!start || start.pointerId !== event.pointerId) return;
      event.currentTarget.scrollTo(start.left + start.x - event.clientX, start.top + start.y - event.clientY);
    },
    onPointerUp: endPan,
    onPointerCancel: endPan,
    onLostPointerCapture: endPan,
  };
}
