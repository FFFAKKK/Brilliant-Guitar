import { PAPER_ZOOM } from "../notation/paper-zoom";

interface Props {
  readonly zoom: number;
  readonly enabled: boolean;
  readonly onZoomIn: () => void;
  readonly onZoomOut: () => void;
  readonly onFit: () => void;
}

export function PaperZoomDockIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true" focusable="false">
    <circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.4 15.4 4 4M8 10.5h5" />
  </svg>;
}

function FitPageIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true" focusable="false">
    <rect x="8" y="5" width="8" height="14" rx=".8" />
    <path d="M7 4H4v3m13-3h3v3M4 17v3h3m13-3v3h-3" />
  </svg>;
}

/** The feature owns its interface; the shared dock owns only its position and size. */
export function PaperZoomControl({ zoom, enabled, onZoomIn, onZoomOut, onFit }: Props) {
  return <div className="paper-zoom-control" role="group" aria-label="谱面缩放">
    <div className="paper-zoom-steps">
      <button type="button" className="paper-zoom-button" disabled={!enabled || zoom <= PAPER_ZOOM.min}
        onClick={onZoomOut} aria-label="缩小谱面" aria-keyshortcuts="Control+- Meta+-" title="缩小谱面 · Ctrl/⌘ + −">−</button>
      <output className="paper-zoom-value" aria-label={`谱面倍率 ${zoom}%，相对整页适配`} title="相对整页适配的倍率">
        {zoom}%
      </output>
      <button type="button" className="paper-zoom-button" disabled={!enabled || zoom >= PAPER_ZOOM.max}
        onClick={onZoomIn} aria-label="放大谱面" aria-keyshortcuts="Control++ Meta++" title="放大谱面 · Ctrl/⌘ + ＋">＋</button>
    </div>
    <button type="button" className="paper-zoom-fit" disabled={!enabled} aria-label="适配整页"
      aria-keyshortcuts="Control+0 Meta+0" title="适配整页 · Ctrl/⌘ + 0" onClick={onFit}><FitPageIcon /></button>
  </div>;
}
