import type { StaffEvent } from "../contracts/notation";
interface Props {
  readonly event: StaffEvent | undefined;
  readonly canDelete: boolean;
  readonly busy: boolean;
  readonly onDelete: () => void;
  readonly onClear: () => void;
}
export function SelectionControls({ event, canDelete, busy, onDelete, onClear }: Props) {
  const pitch = event?.content.kind === "note" ? event.content.pitch : null;
  const description = pitch ? `${pitch.step}${pitch.alter === 1 ? "♯" : pitch.alter === -1 ? "♭" : ""}${pitch.octave}` : "休止符";
  return <>
    <button className="input-tool" disabled={!canDelete || busy} onClick={onDelete}
      title={event?.content.kind === "note" ? "替换为等时值休止符，后续音符保持原位" : "仅可移除小节末尾的休止符"}>
      {event?.content.kind === "rest" ? "移除休止符" : "删除音符"}
    </button>
    {event && <span className="selection-summary" role="status">已选 {description}
      {event.content.kind === "note" && " · 删除保留时值"}
      {!canDelete && " · 中间休止符保留节拍"}
      <button className="input-tool" onClick={onClear}>取消选择</button>
    </span>}
  </>;
}
