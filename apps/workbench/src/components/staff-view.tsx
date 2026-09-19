import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, MouseEvent, PointerEvent, RefObject } from "react";
import type { EventDuration, InputPitch, KeySignatureChangeInput, MeterChangeScope, MeterInput } from "../contracts/note-input";
import type { NotationView, StaffView as StaffNotation } from "../contracts/notation";
import { rhythmCaretCenterY } from "../notation/notation-renderer";
import type { NotationInteractionGeometry, NotationRenderer } from "../notation/notation-renderer";
import { fitScorePaper, layoutScorePages, SCORE_PAPER } from "../notation/score-page-layout";
import { describeMeasureRuleWarnings } from "../notation/rule-warning-description.ts";
import { zoomFittedPaper } from "../notation/paper-zoom";
import { usePaperViewport } from "../notation/use-paper-viewport";
import type { StaffLayout } from "../notation/staff-layout";
import { yForPitch } from "../notation/input-position";
import { noteheadSymbol } from "../notation/music-symbols.ts";
import { useHostedUiComponent } from "./ui-component-host";
import type { ScoreEditPoint } from "../editor/score-navigation";
import type { StaffPointerSignal } from "../editor/staff-input-adapter.ts";
import { resolveStaffPointerTarget } from "../editor/staff-pointer-target.ts";
import { resolveStaffRangeGeometry } from "../editor/staff-range-geometry.ts";
import type { WorkbenchFeedback } from "../feedback/workbench-feedback";
import { LatestWorkbenchTask } from "../workbench/latest-task.ts";
import type { PlaybackSnapshot } from "../playback/playback-session.ts";
import { MeasureContextMenu } from "./measure-context-menu.tsx";
import { pointerLocateSignal, pointerSelectSignal } from "../input/input-signal.ts";
import { MeasureMeterDialog } from "./measure-meter-dialog.tsx";
import { KeySignatureDialog } from "./key-signature-dialog.tsx";
import { keySignatureFifthsAtMeasure } from "../notation/key-signature.ts";

export interface StaffEditing {
  readonly point: ScoreEditPoint | null;
  readonly draftStep: InputPitch["step"] | null;
  readonly previewDuration: EventDuration;
  readonly previewRest: boolean;
  readonly viewportRef: RefObject<HTMLDivElement | null>;
  readonly onInput: (signal: StaffPointerSignal) => void;
  readonly selectedEventId?: string | null;
  readonly selectedRange?: { readonly measureId: string; readonly eventIds: readonly string[] } | null;
  readonly measureCount: number;
  readonly onInsertMeasure?: (measureId: string, position: "before" | "after") => void;
  readonly onRemoveMeasure?: (measureId: string) => void;
  readonly onSetMeasureMeter?: (measureId: string, meter: MeterInput, scope: MeterChangeScope) => boolean;
  readonly onSetKeySignature?: (partId: string, measureId: string, change: KeySignatureChangeInput) => boolean;
  readonly busy?: boolean;
  readonly feedback?: WorkbenchFeedback | null;
}

function anchorForPoint(geometry: NotationInteractionGeometry | null, point: ScoreEditPoint | null) {
  if (!geometry || !point) return null;
  return geometry.anchors.find((candidate) => candidate.measureId === point.measureId
    && candidate.offsetUnits === point.offsetUnits) ?? null;
}

type StaffHover = { readonly kind: "caret"; readonly x: number; readonly y: number; readonly spacing: number;
  readonly pitch: InputPitch } | { readonly kind: "event"; readonly eventId: string; readonly x: number; readonly y: number;
  readonly width: number; readonly height: number };

const CLEF_LABELS: Readonly<Record<StaffNotation["clef"], string>> = {
  treble: "高音谱表", bass: "低音谱表", alto: "中音谱表", tenor: "次中音谱表",
};

function playbackHeadGeometry(geometry: NotationInteractionGeometry | null, layout: StaffLayout,
  playback: PlaybackSnapshot | undefined) {
  const location = playback?.location;
  if (!geometry || !location || (playback.state !== "playing" && playback.state !== "paused")) return null;
  const measure = geometry.measures.find((item) => item.measureId === location.measureId);
  if (!measure || !layout.measures.some((item) => item.measure.id === location.measureId)) return null;
  const event = location.eventId ? geometry.events.find((item) => item.eventId === location.eventId) : null;
  const measureEvents = layout.measures.find((item) => item.measure.id === location.measureId)?.measure.events ?? [];
  const index = location.eventId ? measureEvents.findIndex((item) => item.id === location.eventId) : -1;
  const nextId = index >= 0 ? measureEvents[index + 1]?.id : null;
  const next = nextId ? geometry.events.find((item) => item.eventId === nextId) : null;
  const left = measure.x + Math.min(measure.width * .12, 34);
  const right = measure.x + measure.width - Math.min(measure.width * .06, 12);
  const start = event ? event.x + event.width / 2 : left + (right - left) * location.measureProgress;
  const end = next ? next.x + next.width / 2 : right;
  return { x: event ? start + (end - start) * location.eventProgress : start,
    y1: measure.staffBottom - measure.lineSpacing * 4.85, y2: measure.staffBottom + measure.lineSpacing * .72 };
}

function EngravedPage({ layout, renderer, number, editing, view, showRuleWarnings, playback }: {
  readonly layout: StaffLayout; readonly renderer: NotationRenderer; readonly number: number;
  readonly editing: StaffEditing | undefined; readonly view: StaffNotation; readonly showRuleWarnings: boolean;
  readonly playback: PlaybackSnapshot | undefined;
}) {
  const engraving = useRef<HTMLDivElement>(null);
  const focusElement = useRef<SVGRectElement>(null);
  const playbackElement = useRef<SVGLineElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [interaction, setInteraction] = useState<NotationInteractionGeometry | null>(null);
  const [hover, setHover] = useState<StaffHover | null>(null);
  const [measureMenu, setMeasureMenu] = useState<Readonly<{ measureId: string; measureNumber: number;
    x: number; y: number }> | null>(null);
  const [meterDialog, setMeterDialog] = useState<Readonly<{ measureId: string; measureNumber: number }> | null>(null);
  const [keySignatureDialog, setKeySignatureDialog] = useState<Readonly<{
    measureId: string; measureNumber: number;
  }> | null>(null);
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
  const range = resolveStaffRangeGeometry(interaction, editing?.selectedRange?.measureId ?? null,
    editing?.selectedRange?.eventIds ?? []);
  const cursorMeasure = cursor && interaction?.measures.find((measure) => measure.measureId === cursor.measureId);
  const feedbackMeasureId = editing?.feedback?.target.scope === "measure" || editing?.feedback?.target.scope === "event"
    ? editing.feedback.target.measureId : null;
  const feedbackMeasure = feedbackMeasureId && interaction?.measures.find((measure) => measure.measureId === feedbackMeasureId);
  const ruleWarningCount = showRuleWarnings
    ? layout.measures.reduce((total, item) => total + item.measure.ruleWarnings.length, 0) : 0;
  const ruleWarningDescription = showRuleWarnings ? layout.measures
    .map((item) => describeMeasureRuleWarnings(item.number, item.measure)).filter(Boolean).join("，") : "";
  const feedbackEventId = editing?.feedback?.target.scope === "event" ? editing.feedback.target.eventId : null;
  const focusRejected = feedbackEventId ? feedbackEventId === selection?.eventId
    : feedbackMeasureId === (selection?.measureId ?? cursor?.measureId);
  const focusSize = cursorMeasure ? cursorMeasure.lineSpacing * 1.45 : 0;
  // The caret identifies a rhythmic insertion boundary. Pointer pitch belongs to
  // the ghost note preview and must not drag this focus marker above/below the staff.
  const focusCenterY = cursor ? rhythmCaretCenterY(cursor) : 0;
  const playbackHead = playbackHeadGeometry(interaction, layout, playback);
  const meterDialogMeasure = meterDialog ? view.measures.find((measure) => measure.id === meterDialog.measureId) : null;
  useEffect(() => {
    focusElement.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [cursor?.x, focusCenterY, range?.x, selection?.x, selection?.y]);
  useEffect(() => {
    playbackElement.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [playback?.location?.eventId, playback?.location?.measureId]);
  function pointerTarget(event: MouseEvent<HTMLDivElement> | PointerEvent<HTMLDivElement>, writeNow: boolean) {
    if (!editing || status !== "ready" || !interaction) return;
    const element = event.target as Element;
    const eventHit = element.closest<SVGRectElement>("[data-event-id]");
    const hit = eventHit ?? element.closest<SVGRectElement>("[data-measure-id]");
    const svg = hit?.ownerSVGElement, matrix = svg?.getScreenCTM();
    if (!hit || !matrix) return null;
    const measureId = eventHit
      ? layout.measures.find((item) => item.measure.events.some((item) => item.id === eventHit.dataset.eventId))?.measure.id
      : hit.dataset.measureId;
    if (!measureId) return null;
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    return resolveStaffPointerTarget({ view, interaction, measureId,
      eventId: eventHit?.dataset.eventId ?? null, x: point.x, y: point.y, writeNow });
  }
  function locate(event: MouseEvent<HTMLDivElement>, writeNow: boolean) {
    if (!editing) return;
    const target = pointerTarget(event, writeNow);
    if (target?.kind === "event") editing.onInput(pointerSelectSignal(target.eventId, event.shiftKey));
    if (target?.kind === "caret") editing.onInput(pointerLocateSignal({ point: target.point, pitch: target.pitch }, writeNow));
  }
  function openMeasureMenu(event: MouseEvent<HTMLDivElement>) {
    if (!editing || editing.busy) return;
    const element = event.target as Element;
    const eventHit = element.closest<SVGRectElement>("[data-event-id]");
    const measureHit = eventHit ?? element.closest<SVGRectElement>("[data-measure-id]");
    const measureId = eventHit
      ? layout.measures.find((item) => item.measure.events.some((item) => item.id === eventHit.dataset.eventId))?.measure.id
      : measureHit?.dataset.measureId;
    if (!measureId) return;
    const measureNumber = view.measures.findIndex((measure) => measure.id === measureId) + 1;
    if (measureNumber < 1) return;
    event.preventDefault();
    setHover(null);
    setMeasureMenu({ measureId, measureNumber, x: event.clientX, y: event.clientY });
  }
  function preview(event: PointerEvent<HTMLDivElement>) {
    if (editing?.busy) { setHover(null); return; }
    const target = pointerTarget(event, false);
    if (target?.kind === "event") {
      const geometry = interaction?.events.find((item) => item.eventId === target.eventId);
      if (!geometry || selection?.eventId === target.eventId) { setHover(null); return; }
      const next: StaffHover = { kind: "event", eventId: target.eventId, x: geometry.x, y: geometry.y,
        width: geometry.width, height: geometry.height };
      setHover((current) => current?.kind === "event" && current.eventId === next.eventId ? current : next);
      return;
    }
    if (target?.kind !== "caret" || editing?.previewRest) { setHover(null); return; }
    const anchor = anchorForPoint(interaction, target.point);
    const measure = interaction?.measures.find((item) => item.measureId === target.point.measureId);
    if (!anchor || !measure) { setHover(null); return; }
    const next: StaffHover = { kind: "caret", x: anchor.x,
      y: yForPitch(target.pitch, measure.staffBottom, measure.lineSpacing, view.clef), spacing: measure.lineSpacing, pitch: target.pitch };
    setHover((current) => current?.kind === "caret" && current.x === next.x && current.y === next.y
      && current.pitch.step === next.pitch.step && current.pitch.octave === next.pitch.octave ? current : next);
  }
  return <div className="staff-paper" data-page-format={SCORE_PAPER.format} data-orientation={SCORE_PAPER.orientation}
    data-render-state={status} data-show-rule-warnings={showRuleWarnings} aria-busy={status === "loading"}>
    <div ref={engraving} className="staff-paper-engraving" onPointerMove={preview} onPointerLeave={() => setHover(null)}
      onClick={(event) => locate(event, false)} onDoubleClick={(event) => locate(event, true)}
      onContextMenu={openMeasureMenu}
      role={status === "ready" ? "img" : undefined}
      aria-label={`第 ${number} 页，${CLEF_LABELS[view.clef]}，${layout.measures.length} 个小节${ruleWarningCount ? `，${ruleWarningCount} 个节拍提示，${ruleWarningDescription}` : ""}`} />
    {status === "ready" && interaction && <svg className="staff-interaction-overlay" viewBox={`0 0 ${layout.width} ${layout.height}`}
      preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">
      {range && <rect className="score-range-selection" x={range.x} y={range.y}
        width={range.width} height={range.height} rx={Math.max(3, range.height * .06)} />}
      {hover?.kind === "event" && <rect className="score-hover-event" x={hover.x} y={hover.y}
        width={hover.width} height={hover.height} rx={Math.min(4, hover.width / 4)} />}
      {hover?.kind === "caret" && editing && !editing.busy && !editing.previewRest && <text className="score-hover-notehead"
        x={hover.x} y={hover.y} fontSize={hover.spacing * 4}
        textAnchor="middle">{noteheadSymbol(editing.previewDuration)}</text>}
      {feedbackMeasure && <rect key={`feedback-${editing?.feedback?.sequence}`} className="score-edit-warning"
        x={feedbackMeasure.x + 2} y={feedbackMeasure.staffBottom - feedbackMeasure.lineSpacing * 5.2}
        width={Math.max(0, feedbackMeasure.width - 4)} height={feedbackMeasure.lineSpacing * 6.4}
        rx={Math.max(3, feedbackMeasure.lineSpacing * .55)} />}
      {playbackHead && <g className="score-playback-head" data-state={playback?.state}>
        <line ref={playbackElement} x1={playbackHead.x} y1={playbackHead.y1} x2={playbackHead.x} y2={playbackHead.y2} />
        <path d={`M ${playbackHead.x - 3.5} ${playbackHead.y1 - 5} L ${playbackHead.x + 3.5} ${playbackHead.y1 - 5} L ${playbackHead.x} ${playbackHead.y1} Z`} />
      </g>}
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
    {editing?.selectedRange && <span className="visually-hidden" role="status" aria-live="polite">
      已选择 {editing.selectedRange.eventIds.length} 个谱面事件
    </span>}
    {measureMenu && editing && <MeasureContextMenu x={measureMenu.x} y={measureMenu.y}
      measureNumber={measureMenu.measureNumber} canRemove={editing.measureCount > 1}
      onInsertBefore={() => editing.onInsertMeasure?.(measureMenu.measureId, "before")}
      onInsertAfter={() => editing.onInsertMeasure?.(measureMenu.measureId, "after")}
      onChangeMeter={() => setMeterDialog({ measureId: measureMenu.measureId, measureNumber: measureMenu.measureNumber })}
      onChangeKeySignature={() => setKeySignatureDialog({
        measureId: measureMenu.measureId, measureNumber: measureMenu.measureNumber,
      })}
      onRemove={() => editing.onRemoveMeasure?.(measureMenu.measureId)}
      onClose={() => setMeasureMenu(null)} />}
    {meterDialog && meterDialogMeasure && editing && <MeasureMeterDialog open onOpenChange={(open) => {
      if (!open) setMeterDialog(null);
    }} measureId={meterDialog.measureId} measureNumber={meterDialog.measureNumber}
      meter={{ numerator: meterDialogMeasure.meter.numerator,
        denominator: meterDialogMeasure.meter.denominator as MeterInput["denominator"] }}
      saving={Boolean(editing.busy)} failure={editing.feedback?.issue.message ?? ""}
      onSave={(meter, scope) => editing.onSetMeasureMeter?.(meterDialog.measureId, meter, scope) ?? false} />}
    {keySignatureDialog && editing && <KeySignatureDialog open onOpenChange={(open) => {
      if (!open) setKeySignatureDialog(null);
    }} measureId={keySignatureDialog.measureId} measureNumber={keySignatureDialog.measureNumber}
      effectiveFifths={keySignatureFifthsAtMeasure(view, keySignatureDialog.measureId)}
      hasChange={Boolean(view.keySignatureChanges?.some(change => change.measureId === keySignatureDialog.measureId))}
      saving={Boolean(editing.busy)} failure={editing.feedback?.issue.message ?? ""}
      onSave={(change) => editing.onSetKeySignature?.(view.partId, keySignatureDialog.measureId, change) ?? false} />}
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
  readonly playback?: PlaybackSnapshot;
  readonly showRuleWarnings?: boolean;
}

/** Paper is this view's own interface. The public host adds no visual chrome. */
export function StaffView({ notation, renderer, loading, error, onRetry, editing, zoom = 100,
  onZoomIn, onZoomOut, retryLabel = "重新加载", showRuleWarnings = true, playback }: StaffViewProps) {
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
    {...panEvents}
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
          view={staffNotation} showRuleWarnings={showRuleWarnings} playback={playback} />)}</div>
      : null}
  </div>;
}
