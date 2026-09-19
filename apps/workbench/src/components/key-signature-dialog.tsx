import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { KEY_SIGNATURE_FIFTHS } from "../contracts/note-input.ts";
import type { KeySignatureChangeInput, KeySignatureFifths } from "../contracts/note-input.ts";

export interface KeySignatureDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly measureId: string;
  readonly measureNumber: number;
  readonly effectiveFifths: number;
  readonly hasChange: boolean;
  readonly saving: boolean;
  readonly failure: string;
  readonly onSave: (change: KeySignatureChangeInput) => boolean;
}

function label(fifths: number) {
  if (fifths === 0) return "无升降号";
  return fifths > 0 ? `${fifths} 个升号` : `${Math.abs(fifths)} 个降号`;
}

function valueKey(value: "inherit" | KeySignatureFifths) {
  return value === "inherit" ? value : String(value);
}

export function KeySignatureDialog({ open, onOpenChange, measureId, measureNumber, effectiveFifths, hasChange,
  saving, failure, onSave }: KeySignatureDialogProps) {
  const initial = (KEY_SIGNATURE_FIFTHS as readonly number[]).includes(effectiveFifths)
    ? effectiveFifths as KeySignatureFifths : 0;
  const [value, setValue] = useState<"inherit" | KeySignatureFifths>(initial);
  const [localFailure, setLocalFailure] = useState("");
  const [submitted, setSubmitted] = useState<string | null>(null);
  const select = useRef<HTMLSelectElement>(null);
  const currentKey = useMemo(() => hasChange ? String(initial) : "inherit", [hasChange, initial]);
  const waiting = submitted !== null;

  useEffect(() => {
    if (!open) return;
    setValue(hasChange ? initial : "inherit");
    setLocalFailure(""); setSubmitted(null);
  }, [hasChange, initial, measureId, open]);
  useEffect(() => {
    if (open && submitted && currentKey === submitted) onOpenChange(false);
  }, [currentKey, onOpenChange, open, submitted]);
  useEffect(() => {
    if (!open || !submitted || !failure) return;
    setLocalFailure(failure); setSubmitted(null);
  }, [failure, open, submitted]);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (waiting || saving) return;
    const key = valueKey(value);
    if (key === currentKey || (!hasChange && value !== "inherit" && value === initial)) {
      onOpenChange(false); return;
    }
    const change: KeySignatureChangeInput = value === "inherit" ? { kind: "inherit" } : { kind: "set", fifths: value };
    setLocalFailure("");
    if (!onSave(change)) { setLocalFailure("当前有其他编辑正在处理，请稍后再试"); return; }
    setSubmitted(key);
  }

  return <Dialog.Root open={open} onOpenChange={(next) => { if (!waiting && !saving) onOpenChange(next); }}>
    <Dialog.Portal>
      <Dialog.Overlay className="dialog-overlay" />
      <Dialog.Content className="new-score-dialog measure-meter-dialog"
        onOpenAutoFocus={(event) => { event.preventDefault(); select.current?.focus(); }}
        onEscapeKeyDown={(event) => { if (waiting || saving) event.preventDefault(); }}
        onPointerDownOutside={(event) => { if (waiting || saving) event.preventDefault(); }}>
        <Dialog.Title className="dialog-title">更改调号</Dialog.Title>
        <Dialog.Description className="dialog-description">第 {measureNumber} 小节起生效，不改变已有音符或播放音高。</Dialog.Description>
        <form className="score-properties-form" onSubmit={submit} aria-busy={waiting || saving}>
          <div className="form-field">
            <label htmlFor={`key-signature-${measureId}`}>记谱调号</label>
            <select ref={select} id={`key-signature-${measureId}`} className="text-field" value={valueKey(value)}
              disabled={waiting || saving} onChange={(event) => {
                setValue(event.target.value === "inherit" ? "inherit" : Number(event.target.value) as KeySignatureFifths);
              }}>
              <option value="inherit">继承前一调号</option>
              {KEY_SIGNATURE_FIFTHS.map(fifths => <option key={fifths} value={fifths}>{label(fifths)}</option>)}
            </select>
          </div>
          {localFailure && <p className="form-error" role="alert">{localFailure}</p>}
          <div className="dialog-actions">
            <Dialog.Close className="button" disabled={waiting || saving}>取消</Dialog.Close>
            <button type="submit" className="button button-primary" disabled={waiting || saving}>
              {waiting || saving ? "正在应用…" : "应用"}
            </button>
          </div>
        </form>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
