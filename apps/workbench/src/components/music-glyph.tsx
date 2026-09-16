import { useEffect, useState } from "react";
import { loadEngravingEngine } from "../notation/engraving-engine";

interface Props { readonly symbol: string; readonly fallback: string; readonly fit?: "box" | "ink" }

/** Center actual glyph ink, rather than treating a music font's baseline as a box. */
export function MusicGlyph({ symbol, fallback, fit = "box" }: Props) {
  const [drawing, setDrawing] = useState<{ symbol: string; fit: Props["fit"]; x: number; y: number; width: number; height: number } | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    setFailed(false);
    void loadEngravingEngine().then(() => {
      const context = document.createElement("canvas").getContext("2d");
      if (!context) throw new Error("Font measurement unavailable");
      context.font = "32px Bravura";
      const metrics = context.measureText(symbol);
      const left = metrics.actualBoundingBoxLeft, right = metrics.actualBoundingBoxRight;
      const ascent = metrics.actualBoundingBoxAscent, descent = metrics.actualBoundingBoxDescent;
      if (active) setDrawing(fit === "ink"
        ? { symbol, fit, x: left + 1, y: ascent + 1, width: Math.max(1, left + right) + 2, height: Math.max(1, ascent + descent) + 2 }
        : { symbol, fit, x: (48 - left - right) / 2 + left, y: (48 - ascent - descent) / 2 + ascent, width: 48, height: 48 });
    }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [symbol, fit]);
  return <span className="music-glyph" aria-hidden="true">
    {failed ? <span className="music-glyph-fallback">{fallback}</span>
      : drawing?.symbol === symbol && drawing.fit === fit && <svg key={`${symbol}:${fit}`} viewBox={`0 0 ${drawing.width} ${drawing.height}`} focusable="false" aria-hidden="true">
        <text x={drawing.x} y={drawing.y} fontFamily="Bravura" fontSize="32" fill="currentColor">{symbol}</text>
      </svg>}
  </span>;
}
