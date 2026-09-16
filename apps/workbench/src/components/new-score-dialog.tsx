import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useRef, useState } from "react";
import type { FormEvent, RefObject } from "react";
import { NEW_SCORE_LIMITS, validateNewScoreInput } from "../contracts/new-score";
import type { NewScoreErrors, NewScoreInput } from "../contracts/new-score";

interface NewScoreDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onCreate: (input: NewScoreInput, requestId: string) => Promise<void>;
  readonly returnFocusRef: RefObject<HTMLButtonElement | null>;
  readonly completionFocusRef: RefObject<HTMLElement | null>;
}

export function NewScoreDialog({ open, onOpenChange, onCreate, returnFocusRef, completionFocusRef }: NewScoreDialogProps) {
  const [title, setTitle] = useState("");
  const [measureText, setMeasureText] = useState("1");
  const [errors, setErrors] = useState<NewScoreErrors>({});
  const [failure, setFailure] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const measuresRef = useRef<HTMLInputElement>(null);
  const submissionLock = useRef(false);
  const created = useRef(false);
  const attempt = useRef<{ key: string; id: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    setTitle(""); setMeasureText("1"); setErrors({}); setFailure("");
    created.current = false; attempt.current = null;
  }, [open]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submissionLock.current) return;
    const input = { title, measureCount: /^\d+$/.test(measureText) ? Number(measureText) : NaN };
    const nextErrors = validateNewScoreInput(input);
    setErrors(nextErrors); setFailure("");
    if (nextErrors.title) { titleRef.current?.focus(); return; }
    if (nextErrors.measureCount) { measuresRef.current?.focus(); return; }
    const key = JSON.stringify(input);
    if (attempt.current?.key !== key) attempt.current = { key, id: crypto.randomUUID() };
    submissionLock.current = true; setSubmitting(true);
    try {
      await onCreate(input, attempt.current.id);
      created.current = true;
      onOpenChange(false);
    } catch (error) {
      setFailure(error instanceof Error ? error.message : "暂时无法创建，请重试");
    } finally { submissionLock.current = false; setSubmitting(false); }
  }

  return (
    <Dialog.Root open={open} onOpenChange={(value) => { if (!submissionLock.current) onOpenChange(value); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          className="new-score-dialog"
          onOpenAutoFocus={(event) => { event.preventDefault(); titleRef.current?.focus(); }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            (created.current ? completionFocusRef : returnFocusRef).current?.focus();
          }}
          onEscapeKeyDown={(event) => { if (submissionLock.current) event.preventDefault(); }}
          onPointerDownOutside={(event) => { if (submissionLock.current) event.preventDefault(); }}
        >
          <Dialog.Title className="dialog-title">新建乐谱</Dialog.Title>
          <Dialog.Description className="dialog-description">设置作品名称和起始小节。</Dialog.Description>
          <form className="new-score-form" onSubmit={submit} noValidate aria-busy={submitting}>
            <div className="form-field">
              <label htmlFor="new-score-title">作品标题 <span className="field-optional">选填</span></label>
              <input ref={titleRef} id="new-score-title" className="text-field" value={title} disabled={submitting}
                placeholder="未命名乐谱" autoComplete="off" aria-invalid={!!errors.title}
                aria-describedby={errors.title ? "new-score-title-error" : undefined}
                onChange={(event) => setTitle(event.target.value)} />
              {errors.title && <p id="new-score-title-error" className="field-error">{errors.title}</p>}
            </div>
            <div className="form-field">
              <label htmlFor="new-score-measures">初始小节数</label>
              <div className="measure-field-row">
                <input ref={measuresRef} id="new-score-measures" className="text-field measure-field" type="text" inputMode="numeric"
                  value={measureText} disabled={submitting} aria-invalid={!!errors.measureCount}
                  aria-describedby={errors.measureCount ? "new-score-measures-error" : "new-score-measures-hint"}
                  onChange={(event) => setMeasureText(event.target.value)} />
                <span id="new-score-measures-hint" className="field-hint">{NEW_SCORE_LIMITS.minMeasures}–{NEW_SCORE_LIMITS.maxMeasures} 小节</span>
              </div>
              {errors.measureCount && <p id="new-score-measures-error" className="field-error">{errors.measureCount}</p>}
            </div>
            <div className="score-format" aria-label="基础格式">
              <span className="field-hint">基础格式</span>
              <p>五线谱 · 高音谱号 · 4/4 · 单声部</p>
            </div>
            {failure && <p className="form-error" role="alert">{failure}</p>}
            <div className="dialog-actions">
              <Dialog.Close className="button" disabled={submitting}>取消</Dialog.Close>
              <button type="submit" className="button button-primary" disabled={submitting}>
                {submitting ? "正在创建…" : failure ? "重试创建" : "创建乐谱"}
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
