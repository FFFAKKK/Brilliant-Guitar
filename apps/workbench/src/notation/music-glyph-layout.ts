export interface MusicGlyphMetrics {
  readonly actualBoundingBoxLeft: number;
  readonly actualBoundingBoxRight: number;
  readonly actualBoundingBoxAscent: number;
  readonly actualBoundingBoxDescent: number;
}

/** Established tool glyph layout: center actual ink, independently of the font baseline. */
export function musicGlyphLayout(metrics: MusicGlyphMetrics, fit: "box" | "ink" = "box") {
  const left = metrics.actualBoundingBoxLeft, right = metrics.actualBoundingBoxRight;
  const ascent = metrics.actualBoundingBoxAscent, descent = metrics.actualBoundingBoxDescent;
  if (![left, right, ascent, descent].every(Number.isFinite)) throw new Error("Font measurement unavailable");
  return fit === "ink"
    ? { x: left + 1, y: ascent + 1, width: Math.max(1, left + right) + 2, height: Math.max(1, ascent + descent) + 2 }
    : { x: (48 - left - right) / 2 + left, y: (48 - ascent - descent) / 2 + ascent, width: 48, height: 48 };
}
