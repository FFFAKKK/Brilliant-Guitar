import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, RefObject } from "react";
import type { DocumentMetadataInput } from "../contracts/note-input.ts";

interface ScorePropertiesDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly metadata: DocumentMetadataInput;
  readonly measureCount: number;
  readonly saving: boolean;
  readonly failure: string;
  readonly onSave: (metadata: DocumentMetadataInput) => boolean;
  readonly returnFocusRef: RefObject<HTMLButtonElement | null>;
  readonly completionFocusRef: RefObject<HTMLElement | null>;
}

interface FieldErrors {
  readonly title?: string;
  readonly authors?: string;
  readonly tempo?: string;
}

const normalized = (value: DocumentMetadataInput): DocumentMetadataInput => ({
  title: value.title.trim() || "未命名乐谱",
  authors: value.authors.map((author) => author.trim()).filter(Boolean),
  tempoBpm: value.tempoBpm,
});

const metadataKey = (value: DocumentMetadataInput) => JSON.stringify(normalized(value));

function validate(title: string, authorText: string, tempoText: string): {
  readonly value?: DocumentMetadataInput;
  readonly errors: FieldErrors;
} {
  const cleanTitle = title.trim() || "未命名乐谱";
  const authors = authorText.split(/\r?\n/).map((author) => author.trim()).filter(Boolean);
  const tempoBpm = Number(tempoText);
  const errors: FieldErrors = {
    ...(cleanTitle.length > 120 ? { title: "标题不能超过 120 个字符" } : {}),
    ...(authors.length > 16 ? { authors: "作者最多填写 16 位" }
      : authors.some((author) => author.length > 120) ? { authors: "每位作者不能超过 120 个字符" } : {}),
    ...(!tempoText.trim() || !Number.isFinite(tempoBpm) || tempoBpm <= 0
      ? { tempo: "请输入大于 0 的速度" } : {}),
  };
  return Object.keys(errors).length ? { errors } : { errors, value: { title: cleanTitle, authors, tempoBpm } };
}

export function ScorePropertiesDialog({ open, onOpenChange, metadata, measureCount, saving, failure,
  onSave, returnFocusRef, completionFocusRef }: ScorePropertiesDialogProps) {
  const [title, setTitle] = useState(metadata.title);
  const [authorText, setAuthorText] = useState(metadata.authors.join("\n"));
  const [tempoText, setTempoText] = useState(String(metadata.tempoBpm));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [localFailure, setLocalFailure] = useState("");
  const [submittedKey, setSubmittedKey] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const saved = useRef(false);
  const currentKey = useMemo(() => metadataKey(metadata), [metadata]);
  const waiting = submittedKey !== null;

  useEffect(() => {
    if (!open) return;
    setTitle(metadata.title); setAuthorText(metadata.authors.join("\n")); setTempoText(String(metadata.tempoBpm));
    setErrors({}); setLocalFailure(""); setSubmittedKey(null); saved.current = false;
  }, [open, metadata.title, metadata.authors, metadata.tempoBpm]);

  useEffect(() => {
    if (!open || !submittedKey) return;
    if (currentKey === submittedKey) {
      saved.current = true;
      onOpenChange(false);
    }
  }, [currentKey, onOpenChange, open, submittedKey]);

  useEffect(() => {
    if (!open || !submittedKey || !failure) return;
    setLocalFailure(failure); setSubmittedKey(null);
  }, [failure, open, submittedKey]);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (waiting || saving) return;
    const checked = validate(title, authorText, tempoText);
    setErrors(checked.errors); setLocalFailure("");
    if (!checked.value) return;
    const key = metadataKey(checked.value);
    if (key === currentKey) { onOpenChange(false); return; }
    if (!onSave(checked.value)) {
      setLocalFailure("当前有其他编辑正在处理，请稍后再试");
      return;
    }
    setSubmittedKey(key);
  }

  return <Dialog.Root open={open} onOpenChange={(value) => { if (!waiting && !saving) onOpenChange(value); }}>
    <Dialog.Portal>
      <Dialog.Overlay className="dialog-overlay" />
      <Dialog.Content className="new-score-dialog score-properties-dialog"
        onOpenAutoFocus={(event) => { event.preventDefault(); titleRef.current?.focus(); }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          (saved.current ? completionFocusRef : returnFocusRef).current?.focus({ preventScroll: true });
        }}
        onEscapeKeyDown={(event) => { if (waiting || saving) event.preventDefault(); }}
        onPointerDownOutside={(event) => { if (waiting || saving) event.preventDefault(); }}>
        <Dialog.Title className="dialog-title">乐谱属性</Dialog.Title>
        <Dialog.Description className="dialog-description">整份乐谱的基础信息。</Dialog.Description>
        <form className="score-properties-form" onSubmit={submit} noValidate aria-busy={waiting || saving}>
          <div className="form-field">
            <label htmlFor="score-properties-title">作品标题</label>
            <input ref={titleRef} id="score-properties-title" className="text-field" value={title}
              disabled={waiting || saving} autoComplete="off" aria-invalid={!!errors.title}
              onChange={(event) => setTitle(event.target.value)} />
            {errors.title && <p className="field-error">{errors.title}</p>}
          </div>
          <div className="form-field">
            <label htmlFor="score-properties-authors">作者 <span className="field-optional">选填 · 每行一位</span></label>
            <textarea id="score-properties-authors" className="text-field score-properties-authors" value={authorText}
              disabled={waiting || saving} rows={3} aria-invalid={!!errors.authors}
              onChange={(event) => setAuthorText(event.target.value)} />
            {errors.authors && <p className="field-error">{errors.authors}</p>}
          </div>
          <div className="score-properties-summary">
            <div className="form-field">
              <label htmlFor="score-properties-tempo">基础速度</label>
              <div className="measure-field-row">
                <input id="score-properties-tempo" className="text-field measure-field" type="number" min="1" step="1"
                  inputMode="decimal" value={tempoText} disabled={waiting || saving} aria-invalid={!!errors.tempo}
                  onChange={(event) => setTempoText(event.target.value)} />
                <span className="field-hint">BPM</span>
              </div>
              {errors.tempo && <p className="field-error">{errors.tempo}</p>}
            </div>
            <div className="score-properties-readonly" aria-label={`当前共 ${measureCount} 小节`}>
              <span className="field-hint">当前结构</span>
              <strong>{measureCount}</strong><span>小节</span>
            </div>
          </div>
          {localFailure && <p className="form-error" role="alert">{localFailure}</p>}
          <div className="dialog-actions">
            <Dialog.Close className="button" disabled={waiting || saving}>取消</Dialog.Close>
            <button type="submit" className="button button-primary" disabled={waiting || saving}>
              {waiting || saving ? "正在保存…" : "保存"}
            </button>
          </div>
        </form>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
