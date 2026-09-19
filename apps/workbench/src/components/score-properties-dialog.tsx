import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, RefObject } from "react";
import { KEY_SIGNATURE_FIFTHS } from "../contracts/note-input.ts";
import type { DocumentMetadataInput, KeySignatureFifths, MeterInput, StaffClef } from "../contracts/note-input.ts";
import { parseMeterInput, ScoreMeterFields } from "./score-meter-fields.tsx";

interface ScorePropertiesDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly metadata: DocumentMetadataInput;
  readonly initialMeasureId: string;
  readonly initialMeter: MeterInput;
  readonly initialKeySignature: number;
  readonly initialStaffId: string;
  readonly initialClef: StaffClef;
  readonly measureCount: number;
  readonly saving: boolean;
  readonly failure: string;
  readonly onSave: (changes: { readonly metadata?: DocumentMetadataInput; readonly meter?: MeterInput;
    readonly keySignature?: KeySignatureFifths; readonly clef?: StaffClef }) => boolean;
  readonly returnFocusRef: RefObject<HTMLButtonElement | null>;
  readonly completionFocusRef: RefObject<HTMLElement | null>;
}

interface FieldErrors {
  readonly title?: string;
  readonly authors?: string;
  readonly tempo?: string;
  readonly meter?: string;
}

const normalized = (value: DocumentMetadataInput): DocumentMetadataInput => ({
  title: value.title.trim() || "未命名乐谱",
  authors: value.authors.map((author) => author.trim()).filter(Boolean),
  tempoBpm: value.tempoBpm,
});

const metadataKey = (value: DocumentMetadataInput) => JSON.stringify(normalized(value));
const meterKey = (value: MeterInput) => `${value.numerator}/${value.denominator}`;
const keySignatureLabel = (fifths: number) => fifths === 0 ? "无升降号"
  : fifths > 0 ? `${fifths} 个升号` : `${Math.abs(fifths)} 个降号`;

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

export function ScorePropertiesDialog({ open, onOpenChange, metadata, initialMeasureId, initialMeter, initialKeySignature,
  initialStaffId, initialClef,
  measureCount, saving, failure,
  onSave, returnFocusRef, completionFocusRef }: ScorePropertiesDialogProps) {
  const [title, setTitle] = useState(metadata.title);
  const [authorText, setAuthorText] = useState(metadata.authors.join("\n"));
  const [tempoText, setTempoText] = useState(String(metadata.tempoBpm));
  const [meterNumerator, setMeterNumerator] = useState(String(initialMeter.numerator));
  const [meterDenominator, setMeterDenominator] = useState<MeterInput["denominator"]>(initialMeter.denominator);
  const normalizedInitialKeySignature = (KEY_SIGNATURE_FIFTHS as readonly number[]).includes(initialKeySignature)
    ? initialKeySignature as KeySignatureFifths : 0;
  const [keySignature, setKeySignature] = useState<KeySignatureFifths>(normalizedInitialKeySignature);
  const [clef, setClef] = useState<StaffClef>(initialClef);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [localFailure, setLocalFailure] = useState("");
  const [submitted, setSubmitted] = useState<Readonly<{
    metadata: string; meter: string; keySignature: KeySignatureFifths; clef: StaffClef;
  }> | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const saved = useRef(false);
  const currentKey = useMemo(() => metadataKey(metadata), [metadata]);
  const currentMeterKey = useMemo(() => meterKey(initialMeter), [initialMeter]);
  const waiting = submitted !== null;

  useEffect(() => {
    if (!open) return;
    setTitle(metadata.title); setAuthorText(metadata.authors.join("\n")); setTempoText(String(metadata.tempoBpm));
    setMeterNumerator(String(initialMeter.numerator)); setMeterDenominator(initialMeter.denominator);
    setKeySignature(normalizedInitialKeySignature);
    setClef(initialClef);
    setErrors({}); setLocalFailure(""); setSubmitted(null); saved.current = false;
  }, [initialClef, initialMeasureId, initialStaffId, normalizedInitialKeySignature, open]);

  useEffect(() => {
    if (!open || !submitted) return;
    if (currentKey === submitted.metadata && currentMeterKey === submitted.meter
      && normalizedInitialKeySignature === submitted.keySignature && initialClef === submitted.clef) {
      saved.current = true;
      onOpenChange(false);
    }
  }, [currentKey, currentMeterKey, initialClef, normalizedInitialKeySignature, onOpenChange, open, submitted]);

  useEffect(() => {
    if (!open || !submitted || !failure) return;
    setLocalFailure(failure); setSubmitted(null);
  }, [failure, open, submitted]);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (waiting || saving) return;
    const checked = validate(title, authorText, tempoText);
    const nextMeter = parseMeterInput(meterNumerator, meterDenominator);
    const nextErrors = { ...checked.errors, ...(!nextMeter ? { meter: "拍数需要是 1 到 32 的整数" } : {}) };
    setErrors(nextErrors); setLocalFailure("");
    if (!checked.value || !nextMeter) return;
    const key = metadataKey(checked.value), nextMeterKey = meterKey(nextMeter);
    const metadataChanged = key !== currentKey, meterChanged = nextMeterKey !== currentMeterKey;
    const keySignatureChanged = keySignature !== normalizedInitialKeySignature, clefChanged = clef !== initialClef;
    if (!metadataChanged && !meterChanged && !keySignatureChanged && !clefChanged) { onOpenChange(false); return; }
    if (!onSave({ ...(metadataChanged ? { metadata: checked.value } : {}), ...(meterChanged ? { meter: nextMeter } : {}),
      ...(keySignatureChanged ? { keySignature } : {}),
      ...(clefChanged ? { clef } : {}) })) {
      setLocalFailure("当前有其他编辑正在处理，请稍后再试");
      return;
    }
    setSubmitted({ metadata: key, meter: nextMeterKey, keySignature, clef });
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
        <Dialog.Description className="dialog-description">整份乐谱的信息与结构设置。</Dialog.Description>
        <form className="score-properties-form" onSubmit={submit} noValidate aria-busy={waiting || saving}>
          <section className="score-properties-section" aria-labelledby="score-properties-basic-heading">
            <h2 id="score-properties-basic-heading">基本信息</h2>
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
          </section>
          <section className="score-properties-section" aria-labelledby="score-properties-structure-heading">
            <div className="score-properties-section-heading">
              <h2 id="score-properties-structure-heading">音乐结构</h2>
              <span>{measureCount} 小节</span>
            </div>
            <div className="score-properties-structure-grid">
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
              <div className="form-field score-properties-meter">
                <span className="form-label">初始拍号</span>
                <ScoreMeterFields idPrefix="score-properties-meter" numerator={meterNumerator}
                  denominator={meterDenominator} disabled={waiting || saving} {...(errors.meter ? { error: errors.meter } : {})}
                  onNumeratorChange={setMeterNumerator} onDenominatorChange={setMeterDenominator} />
              </div>
              <div className="form-field score-properties-clef">
                <label htmlFor="score-properties-clef">初始谱号</label>
                <select id="score-properties-clef" className="text-field" value={clef} disabled={waiting || saving}
                  onChange={(event) => setClef(event.target.value as StaffClef)}>
                  <option value="treble">高音谱号</option>
                  <option value="bass">低音谱号</option>
                  <option value="alto">中音谱号</option>
                  <option value="tenor">次中音谱号</option>
                </select>
              </div>
              <div className="form-field score-properties-key-signature">
                <label htmlFor="score-properties-key-signature">初始调号</label>
                <select id="score-properties-key-signature" className="text-field" value={keySignature}
                  disabled={waiting || saving}
                  onChange={(event) => setKeySignature(Number(event.target.value) as KeySignatureFifths)}>
                  {KEY_SIGNATURE_FIFTHS.map(fifths => <option key={fifths} value={fifths}>
                    {keySignatureLabel(fifths)}
                  </option>)}
                </select>
              </div>
            </div>
          </section>
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
