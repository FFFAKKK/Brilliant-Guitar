import { useCallback, useState } from "react";
import { PAPER_ZOOM, stepPaperZoom } from "./paper-zoom";

/** Workbench-level view state; no score document or musical content is changed. */
export function usePaperZoom() {
  const [zoom, setZoom] = useState<number>(PAPER_ZOOM.initial);
  const zoomIn = useCallback(() => setZoom((value) => stepPaperZoom(value, 1)), []);
  const zoomOut = useCallback(() => setZoom((value) => stepPaperZoom(value, -1)), []);
  const fit = useCallback(() => setZoom(PAPER_ZOOM.fit), []);

  return { zoom, zoomIn, zoomOut, fit };
}
