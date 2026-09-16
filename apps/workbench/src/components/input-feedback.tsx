import type { ReturnTypeOfScoreInput } from "../editor/score-input-types";
import type { StaffView } from "../contracts/notation";
import { capacityUnits, usedUnits } from "../notation/input-position";

interface Props {
  readonly input: ReturnTypeOfScoreInput;
  readonly view: StaffView;
  readonly showFeedback: boolean;
}

export function InputFeedback({ input, view, showFeedback }: Props) {
  const index = view.measures.findIndex((measure) => measure.id === input.measureId);
  const measure = view.measures[index];

  return (
    <>
      <div className="input-help">
        <span>
          {measure
            ? `第 ${index + 1} 小节 · ${usedUnits(measure) === capacityUnits(measure) ? "已写满" : `从第 ${usedUnits(measure) / (64 / measure.meter.denominator) + 1} 拍续写`}`
            : "请选择小节"}
        </span>
        <span>直接输入音名 + 组号，如 A4 · R 休止 · Esc 清除草稿</span>
        {input.pending > 0 && <span role="status">待处理 {input.pending}</span>}
      </div>
      <div className="input-draft-status" role="status">
        {input.draftMessage || (input.draft ? `${input.draft}_ 等待组号（2–6）` : "")}
      </div>
      {showFeedback && input.message && (
        <div className="input-error" role="alert">
          {input.message}
          {input.retryable && <button className="input-tool" onClick={input.retry}>重试操作</button>}
        </div>
      )}
    </>
  );
}
