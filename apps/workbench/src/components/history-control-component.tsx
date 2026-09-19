interface Props {
  readonly undoDepth: number;
  readonly redoDepth: number;
  readonly blocked: boolean;
  readonly activity: Readonly<{ kind: "undo" | "redo"; sequence: number }> | undefined;
  readonly onHistory: (kind: "undo" | "redo") => void;
}

function HistoryArrow({ reverse = false }: { readonly reverse?: boolean }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"
    style={reverse ? { transform: "scaleX(-1)" } : undefined}>
    <path d="M7 8H4l3-3" /><path d="M4 8h9a6 6 0 0 1 0 12H9" />
  </svg>;
}

export function HistoryDockIcon() {
  return <HistoryArrow />;
}

function HistoryButton({ kind, depth, blocked, activity, onHistory }: {
  readonly kind: "undo" | "redo";
  readonly depth: number;
  readonly blocked: boolean;
  readonly activity: Props["activity"];
  readonly onHistory: Props["onHistory"];
}) {
  const undo = kind === "undo";
  const label = undo ? "撤销" : "重做";
  const disabled = blocked || depth === 0;
  const activated = activity?.kind === kind;
  return <button type="button" className="history-control-button"
    aria-label={`${label}，可${label} ${depth} 步`} title={`${label}（${depth} 步）`}
    disabled={disabled} data-available={!disabled || undefined}
    onClick={() => onHistory(kind)}>
    <span className="history-control-glyph" data-activated={activated || undefined}
      key={activated ? `${kind}:${activity.sequence}` : kind}>
      <HistoryArrow reverse={!undo} />
    </span>
  </button>;
}

/** Only real Native history depth makes a control available. */
export function HistoryControlComponent({ undoDepth, redoDepth, blocked, activity, onHistory }: Props) {
  return <div className="history-control-dock">
    <div className="history-control" role="group" aria-label="编辑历史">
      <HistoryButton kind="undo" depth={undoDepth} blocked={blocked} activity={activity} onHistory={onHistory} />
      <HistoryButton kind="redo" depth={redoDepth} blocked={blocked} activity={activity} onHistory={onHistory} />
    </div>
  </div>;
}
