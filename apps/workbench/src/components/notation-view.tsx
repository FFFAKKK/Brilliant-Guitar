import type { MouseEvent } from "react";
import type { InputPitch } from "../contracts/note-input";
import { pitchAtY } from "../notation/input-position";
import { useEffect, useRef, useState } from "react";
import type { NotationView as NotationProjection } from "../contracts/notation";
import type { NotationRenderer } from "../notation/notation-renderer";
import { layoutNotationViewport } from "../notation/notation-viewport";

interface NotationViewProps {
  readonly notation: NotationProjection;
  readonly renderer: NotationRenderer;
  readonly zoom: number;
  readonly cursorMeasureId: string | null;
  readonly draftStep: InputPitch["step"] | null;
  readonly selectedEventId: string | null;
  readonly onSelectEvent: (eventId: string) => void;
  readonly onLocate: (measureId: string, pitch: InputPitch, writeNow: boolean) => void;
}

/** Owns viewport and drawing lifecycle; accepts data and a replaceable renderer, never a Core bus. */
export function NotationView({ notation, renderer, zoom, cursorMeasureId, draftStep, selectedEventId, onSelectEvent, onLocate }: NotationViewProps) {
  const widthRef = useRef<HTMLDivElement>(null);
  const drawingRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [retry, setRetry] = useState(0);
  const staffNotation = notation.kind === "staff" ? notation : null;
  const clefLabel = staffNotation ? { treble: "高音", bass: "低音", alto: "中音", tenor: "次中音" }[staffNotation.clef] : "";
  const description = staffNotation
    ? `五线谱，${clefLabel}谱号，共 ${staffNotation.measures.length} 小节，${staffNotation.measures.reduce((sum, measure) => sum + measure.events.length, 0)} 个音符或休止。拍号：${staffNotation.measures.flatMap((measure, index) => {
      const previous = staffNotation.measures[index - 1];
      return previous?.meter.numerator === measure.meter.numerator && previous.meter.denominator === measure.meter.denominator
        ? [] : [`第 ${index + 1} 小节起 ${measure.meter.numerator}/${measure.meter.denominator}`];
    }).join("，")}` : undefined;
  useEffect(() => {
    const element = widthRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.floor(entry.contentRect.width));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const target = drawingRef.current;
    if (!target || width === 0 || notation.kind !== "staff") return;
    let active = true;
    setStatus("loading");
    const style = getComputedStyle(target);
    const viewport = layoutNotationViewport(notation, width, zoom);
    void renderer.render(viewport.layout, {
      ink: style.getPropertyValue("--color-text").trim(), muted: style.getPropertyValue("--color-secondary").trim(), fontFamily: style.fontFamily,
    }).then((drawing) => {
      if (active) {
        const svg = drawing.svg;
        svg.setAttribute("viewBox", `0 0 ${viewport.layout.width} ${viewport.layout.height}`);
        svg.setAttribute("width", String(viewport.displayWidth));
        svg.setAttribute("height", String(viewport.displayHeight));
        // VexFlow also writes inline dimensions; keep them in sync with the viewport scale.
        svg.style.width = `${viewport.displayWidth}px`;
        svg.style.height = `${viewport.displayHeight}px`;
        target.replaceChildren(svg); setStatus("ready");
        svg.querySelector(".input-cursor")?.scrollIntoView({ block: "nearest", inline: "nearest" });
        svg.querySelector('[data-selected="true"]')?.scrollIntoView({ block: "nearest", inline: "nearest" });
      }
    }).catch(() => {
      if (active) { target.replaceChildren(); setStatus("error"); }
    });
    // Keep the current drawing until its replacement is ready, so a zoom or
    // resize does not collapse the scroll area while fonts/rendering resolve.
    return () => { active = false; };
  }, [notation, renderer, width, retry, zoom, cursorMeasureId, draftStep, selectedEventId]);

  function locate(event: MouseEvent<HTMLDivElement>, writeNow: boolean) {
    if (status !== "ready") return;
    const eventHit = (event.target as Element).closest<SVGRectElement>("[data-event-id]");
    if (eventHit) { onSelectEvent(eventHit.dataset.eventId!); return; }
    const hit = (event.target as Element).closest<SVGRectElement>("[data-measure-id]");
    const svg = hit?.ownerSVGElement, matrix = svg?.getScreenCTM();
    if (!hit || !matrix) return;
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    if (!staffNotation) return;
    onLocate(hit.dataset.measureId!, pitchAtY(point.y, Number(hit.dataset.staffBottom), Number(hit.dataset.lineSpacing), staffNotation.clef), writeNow);
  }

  return (
    <div className="notation-view">
      <div className="notation-width" ref={widthRef}>
        {notation.kind === "unsupported" ? <p className="notation-message" role="status">{notation.message}</p> : (
          <>
            {status === "loading" && <p className="notation-message" role="status">正在显示谱面…</p>}
            {status === "error" && <div className="notation-message" role="alert">暂时无法显示谱面，乐谱数据已保留。
              <button className="button" onClick={() => setRetry((value) => value + 1)}>重新显示</button>
            </div>}
            <div className="notation-engraving" ref={drawingRef} onClick={(event) => locate(event, false)} onDoubleClick={(event) => locate(event, true)} role={status === "ready" ? "img" : undefined}
              aria-busy={status === "loading"} aria-label={status === "ready" ? description : undefined} />
          </>
        )}
      </div>
    </div>
  );
}
