import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, KeyboardEventHandler, MouseEvent, RefObject } from "react";
import type { InputPitch } from "../contracts/note-input";
import type { NotationView, StaffView as StaffNotation } from "../contracts/notation";
import type { NotationInteractionGeometry, NotationRenderer } from "../notation/notation-renderer";
import { fitScorePaper, layoutScorePages, SCORE_PAPER } from "../notation/score-page-layout";
import { describeMeasureRuleWarnings } from "../notation/rule-warning-description.ts";
import { resolveOverfullHighlights } from "../notation/overfull-highlight.ts";
import { zoomFittedPaper } from "../notation/paper-zoom";
import { usePaperViewport } from "../notation/use-paper-viewport";
import type { StaffLayout } from "../notation/staff-layout";
import { yForPitch } from "../notation/input-position";
import { useHostedUiComponent } from "./ui-component-host";
import type { ScoreEditPoint } from "../editor/score-navigation";
import { resolveStaffPointerTarget } from "../editor/staff-pointer-target.ts";
import type { WorkbenchFeedback } from "../feedback/workbench-feedback";
import { LatestWorkbenchTask } from "../workbench/latest-task.ts";

export interface StaffEditing {
  readonly point: ScoreEditPoint | null;
  readonly draftStep: InputPitch["step"] | null;
  readonly viewportRef: RefObject<HTMLDivElement | null>;
  readonly onKeyDown: KeyboardEventHandler<HTMLDivElement>;
  readonly onLocate: (point: ScoreEditPoint, pitch: InputPitch, writeNow: boolean) => void;
  readonly selectedEventId?: string | null;
  readonly onSelectEvent?: (eventId: string) => void;
  readonly busy?: boolean;
  readonly feedback?: WorkbenchFeedback | null;
}

function anchorForPoint(geometry: NotationInteractionGeometry | null, point: ScoreEditPoint | null) {
  if (!geometry || !point) return null;
  return geometry.anchors.find((candidate) => candidate.measureId === point.measureId
    && candidate.offsetUnits === point.offsetUnits) ?? null;
}

function EngravedPage({ layout, renderer, number, editing, view, showRuleWarnings }: {
  readonly layout: StaffLayout; readonly renderer: NotationRenderer; readonly number: number;
  readonly editing: StaffEditing | undefined; readonly view: StaffNotation; readonly showRuleWarnings: boolean;
}) {
  const engraving = useRef<HTMLDivElement>(null);
  const focusElement = useRef<SVGRectElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [interaction, setInteraction] = useState<NotationInteractionGeometry | null>(null);
  const [attempt, setAttempt] = useState(0);
  const renderTask = useRef(new LatestWorkbenchTask());
  useEffect(() => {
    const root = engraving.current;
    if (!root) return;
    const signal = renderTask.current.start();
    if (!root.firstChild) setStatus("loading");
    const theme = getComputedStyle(root);
    void renderer.render(layout, {
      ink: theme.getPropertyValue("--color-score-ink").trim(),
      muted: theme.getPropertyValue("--color-score-muted").trim(), fontFamily: "Academico",
    }, signal).then((drawing) => {
      if (signal.aborted) return;
      const svg = drawing.svg;
      svg.setAttribute("viewBox", `0 0 ${layout.width} ${layout.height}`);
      svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
      svg.removeAttribute("width"); svg.removeAttribute("height");
      svg.style.removeProperty("width"); svg.style.removeProperty("height");
      root.replaceChildren(svg);
      setInteraction(drawing.interaction);
      setStatus("ready");
    }).catch((error: unknown) => {
      if (!signal.aborted && (!(error instanceof DOMException) || error.name !== "AbortError")) {
        setInteraction(null); setStatus("error");
      }
    }).finally(() => renderTask.current.finish(signal));
    return () => renderTask.current.cancel();
  }, [attempt, layout, renderer]);
  const cursor = anchorForPoint(interaction, editing?.point ?? null);
  const selection = interaction?.events.find((event) => event.eventId === editing?.selectedEventId) ?? null;
  const cursorMeasure = cursor && interaction?.measures.find((measure) => measure.measureId === cursor.measureId);
  const feedbackMeasureId = editing?.feedback?.target.scope === "measure" || editing?.feedback?.target.scope === "event"
    ? editing.feedback.target.measureId : null;
  const feedbackMeasure = feedbackMeasureId && interaction?.measures.find((measure) => measure.measureId === feedbackMeasureId);
  const overfullHighlights = showRuleWarnings && interaction ? resolveOverfullHighlights(layout, interaction) : [];
  const ruleWarningCount = showRuleWarnings
    ? layout.measures.reduce((total, item) => total + item.measure.ruleWarnings.length, 0) : 0;
  const ruleWarningDescription = showRuleWarnings ? layout.measures
    .map((item) => describeMeasureRuleWarnings(item.number, item.measure)).filter(Boolean).join("，") : "";
  const feedbackEventId = editing?.feedback?.target.scope === "event" ? editing.feedback.target.eventId : null;
  const focusRejected = feedbackEventId ? feedbackEventId === selection?.eventId
    : feedbackMeasureId === (selection?.measureId ?? cursor?.measureId);
  const focusSize = cursorMeasure ? cursorMeasure.lineSpacing * 1.45 : 0;
  const focusCenterY = cursorMeasure && editing?.point?.preferredPitch
    ? yForPitch(editing.point.preferredPitch, cursorMeasure.staffBottom, cursorMeasure.lineSpacing)
    : cursor?.y ?? 0;
  useEffect(() => {
    focusElement.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [cursor?.x, focusCenterY, selection?.x, selection?.y]);
  function locate(event: MouseEvent<HTMLDivElement>, writeNow: boolean) {
    if (!editing || status !== "ready" || !interaction) return;
    const element = event.target as Element;
    const eventHit = element.closest<SVGRectElement>("[data-event-id]");
    const hit = eventHit ?? element.closest<SVGRectElement>("[data-measure-id]");
    const svg = hit?.ownerSVGElement, matrix = svg?.getScreenCTM();
    if (!hit || !matrix) return;
    const measureId = eventHit
      ? layout.measures.find((item) => item.measure.events.some((item) => item.id === eventHit.dataset.eventId))?.measure.id
      : hit.dataset.measureId;
    if (!measureId) return;
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    const target = resolveStaffPointerTarget({ view, interaction, measureId,
      eventId: eventHit?.dataset.eventId ?? null, x: point.x, y: point.y, writeNow });
    if (target?.kind === "event") editing.onSelectEvent?.(target.eventId);
    if (target?.kind === "caret") editing.onLocate(target.point, target.pitch, writeNow);
  }
  return <div className="staff-paper" data-page-format={SCORE_PAPER.format} data-orientation={SCORE_PAPER.orientation}
    data-render-state={status} data-show-rule-warnings={showRuleWarnings} aria-busy={status === "loading"}>
    <div ref={engraving} className="staff-paper-engraving" onClick={(event) => locate(event, false)} onDoubleClick={(event) => locate(event, true)}
      role={status === "ready" ? "img" : undefined}
      aria-label={`第 ${number} 页，高音谱表，${layout.measures.length} 个小节${ruleWarningCount ? `，${ruleWarningCount} 个节拍提示，${ruleWarningDescription}` : ""}`} />
    {status === "ready" && interaction && <svg className="staff-interaction-overlay" viewBox={`0 0 ${layout.width} ${layout.height}`}
      preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">
      {overfullHighlights.map((highlight) => <line key={`rule-warning-${highlight.measureId}`}
        className="score-rule-warning-underline" x1={highlight.x} x2={highlight.x + highlight.width}
        y1={highlight.y} y2={highlight.y} />)}
      {feedbackMeasure && <rect key={`feedback-${editing?.feedback?.sequence}`} className="score-edit-warning"
        x={feedbackMeasure.x + 2} y={feedbackMeasure.staffBottom - feedbackMeasure.lineSpacing * 5.2}
        width={Math.max(0, feedbackMeasure.width - 4)} height={feedbackMeasure.lineSpacing * 6.4}
        rx={Math.max(3, feedbackMeasure.lineSpacing * .55)} />}
      {selection && <rect key={`selection-${selection.eventId}-${focusRejected ? editing?.feedback?.sequence : "idle"}`}
        ref={focusElement} className={`score-edit-focus${focusRejected ? " score-edit-focus-rejected" : ""}`} data-kind="event" x={selection.x} y={selection.y}
        width={selection.width} height={selection.height} rx={Math.min(4, selection.width / 4)} />}
      {!selection && cursor && <>
        <rect key={`cursor-${cursor.measureId}-${focusRejected ? editing?.feedback?.sequence : "idle"}`}
          ref={focusElement} className={`score-edit-focus${focusRejected ? " score-edit-focus-rejected" : ""}`} data-kind="empty"
          x={cursor.x - focusSize / 2} y={focusCenterY - focusSize / 2} width={focusSize} height={focusSize} rx={Math.min(4, focusSize / 4)} />
        {editing?.draftStep && <text className="pitch-draft" x={Math.min(cursor.x + focusSize / 2 + 3, layout.width - 24)}
          y={focusCenterY - focusSize / 2 - 4}>{editing.draftStep}·</text>}
      </>}
    </svg>}
    {status === "loading" && <div className="staff-paper-message" role="status">正在绘制谱面…</div>}
    {status === "error" && <div className="staff-paper-message" role="alert">谱面显示失败
      <button type="button" onClick={() => setAttempt((value) => value + 1)}>重新绘制</button>
    </div>}
  </div>;
}

export interface StaffViewProps {
  readonly notation: NotationView | null;
  readonly renderer: NotationRenderer;
  readonly loading: boolean;
  readonly error: string;
  readonly onRetry: () => void;
  readonly retryLabel?: string;
  readonly zoom?: number;
  readonly onZoomIn?: () => void;
  readonly onZoomOut?: () => void;
  readonly editing?: StaffEditing;
  readonly showRuleWarnings?: boolean;
}

/** Paper is this view's own interface. The public host adds no visual chrome. */
export function StaffView({ notation, renderer, loading, error, onRetry, editing, zoom = 100,
  onZoomIn, onZoomOut, retryLabel = "重新加载", showRuleWarnings = true }: StaffViewProps) {
  const staffNotation = notation?.kind === "staff" ? notation : null;
  const { size } = useHostedUiComponent();
  const fit = fitScorePaper(size);
  const paper = zoomFittedPaper(fit, zoom);
  const { viewport, panning, ...panEvents } = usePaperViewport({ ...size, paperWidth: paper.paperWidth, scale: paper.scale, gutter: paper.gutter },
    staffNotation?.staffId ?? null, editing?.viewportRef);
  const pages = useMemo(() => staffNotation ? layoutScorePages(staffNotation) : [], [staffNotation]);
  const activePoint = staffNotation ? editing?.point ?? null : null;
  return <div className="staff-view" ref={viewport} tabIndex={0} aria-label="五线谱视图"
    data-panning={panning} data-editable={Boolean(editing)} data-input-idle={Boolean(activePoint) && !editing?.busy}
    {...panEvents} onKeyDown={editing?.onKeyDown}
    onWheel={(event) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      if (event.deltaY < 0) onZoomIn?.(); else onZoomOut?.();
    }}
    onClick={(event) => {
      if (!(event.target as Element).closest("button")) viewport.current?.focus({ preventScroll: true });
    }}
    style={{ "--score-display-width": `${paper.paperWidth}px`, "--score-display-height": `${paper.height}px`,
      "--score-gutter": `${paper.gutter}px` } as CSSProperties}>
    {error ? <div className="staff-view-message" role="alert">{error}<button type="button" onClick={onRetry}>{retryLabel}</button></div>
      : loading ? <div className="staff-view-message" role="status">正在加载乐谱…</div>
      : notation?.kind === "unsupported" ? <div className="staff-view-message" role="status">{notation.message}</div>
      : staffNotation ? <div className="staff-page-stack">{pages.map((page, index) =>
        <EngravedPage key={index} layout={page} renderer={renderer} number={index + 1} editing={editing}
          view={staffNotation} showRuleWarnings={showRuleWarnings} />)}</div>
      : null}
  </div>;
}
