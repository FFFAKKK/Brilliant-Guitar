export interface PaperViewportGeometry {
  readonly width: number;
  readonly height: number;
  readonly paperWidth: number;
  readonly scale: number;
  readonly gutter: number;
}

const inset = (geometry: PaperViewportGeometry) =>
  (Math.max(geometry.width, geometry.paperWidth + geometry.gutter * 2) - geometry.paperWidth) / 2;

/** Preserve the center within the available scroll range; a fitted page has no horizontal offset. */
export function recenterPaperViewport(previous: PaperViewportGeometry, next: PaperViewportGeometry,
  scroll: Readonly<{ left: number; top: number }>, preserveLeadingEdges = false) {
  if (!(previous.scale > 0 && next.scale > 0)) return { left: 0, top: 0 };
  const centerX = (scroll.left + previous.width / 2 - inset(previous)) / previous.scale;
  const centerY = (scroll.top + previous.height / 2) / previous.scale;
  const maxLeft = Math.max(0, next.paperWidth + next.gutter * 2 - next.width);
  return {
    left: preserveLeadingEdges && scroll.left === 0 ? 0
      : Math.min(maxLeft, Math.max(0, inset(next) + centerX * next.scale - next.width / 2)),
    top: preserveLeadingEdges && scroll.top === 0 ? 0 : Math.max(0, centerY * next.scale - next.height / 2),
  };
}
