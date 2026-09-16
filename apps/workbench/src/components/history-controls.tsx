interface HistoryControlsProps {
  readonly undoDepth: number;
  readonly redoDepth: number;
  readonly blocked: boolean;
  readonly onHistory: (kind: "undo" | "redo") => void;
}

/** History UI can be mounted independently; document history stays in Core. */
export function HistoryControls({ undoDepth, redoDepth, blocked, onHistory }: HistoryControlsProps) {
  return <>
    <button className="input-tool" disabled={!undoDepth || blocked} onClick={() => onHistory("undo")}>撤销</button>
    <button className="input-tool" disabled={!redoDepth || blocked} onClick={() => onHistory("redo")}>重做</button>
  </>;
}
