import type { ReturnTypeOfScoreInput } from "../editor/score-input-types";
import type { ReactNode } from "react";
import type { StaffView } from "../contracts/notation";
import { NoteInputPanel } from "./note-input-panel";
import { InputFeedback } from "./input-feedback";
import { getMeasureShare } from "../editor/note-overview";
import { resolveScorePosition } from "../editor/score-position";
interface Props { readonly input: ReturnTypeOfScoreInput; readonly view: StaffView; readonly children?: ReactNode; readonly showFeedback?: boolean }
export function NoteInputTools({ input, view, children, showFeedback = true }: Props) {
  return <div className="note-input-tools" aria-label="音符输入工具">
    <NoteInputPanel duration={input.duration} accidental={input.accidental} rest={input.rest} disabled={input.retryable}
      pitch={input.draft ? { step: input.draft, octave: null, alter: input.alter } : input.previewPitch}
      measureShare={getMeasureShare(input.duration, view.measures.find((measure) => measure.id === input.measureId)?.meter)}
      position={resolveScorePosition(view, input.point)}
      onDurationChange={(value) => { if (value.base !== 32) input.setDuration(value); }} onAccidentalChange={input.setAccidental} onRestChange={input.setRest} />
    {children && <div className="note-input-extra">{children}</div>}
    <InputFeedback input={input} view={view} showFeedback={showFeedback} />
  </div>;
}
