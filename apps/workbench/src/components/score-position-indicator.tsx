import type { ScorePosition } from "../editor/score-position";

interface Props {
  readonly position: ScorePosition | null;
}

/** Read-only editing context embedded in a feature surface, not a dock component. */
export function ScorePositionIndicator({ position }: Props) {
  const measure = position?.measureNumber ?? "—";
  const beat = position ? position.atMeasureEnd ? "末尾" : position.beat : "—";
  const label = position
    ? `谱面位置：第 ${position.measureNumber} 小节，${position.atMeasureEnd ? "小节末尾" : `第 ${position.beat} 拍`}`
    : "谱面位置不可用";

  return <div className="note-entry-location" aria-label={label} title={label}>
    <svg className="note-entry-location-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="5" />
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3" />
      <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
    </svg>
    <span className="note-entry-location-items" aria-hidden="true">
      <span className="note-entry-location-item">
        <span className="note-entry-location-key">小节</span>
        <span className="note-entry-location-value" key={`measure-${measure}`}>{measure}</span>
      </span>
      <span className="note-entry-location-divider" />
      <span className="note-entry-location-item">
        <span className="note-entry-location-key">拍位</span>
        <span className="note-entry-location-value" key={`beat-${beat}`}>{beat}</span>
      </span>
    </span>
  </div>;
}
