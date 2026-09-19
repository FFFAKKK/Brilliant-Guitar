import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { MeterChangeScope, MeterInput } from "../contracts/note-input.ts";
import { parseMeterInput, ScoreMeterFields } from "./score-meter-fields.tsx";

export interface MeasureMeterDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly measureId: string;
  readonly measureNumber: number;
  readonly meter: MeterInput;
  readonly saving: boolean;
  readonly failure: string;
  readonly onSave: (meter: MeterInput, scope: MeterChangeScope) => boolean;
}

const meterKey = (meter: MeterInput) => `${meter.numerator}/${meter.denominator}`;

export function MeasureMeterDialog({ open, onOpenChange, measureId, measureNumber, meter, saving, failure,
  onSave }: MeasureMeterDialogProps) {
  const [numerator, setNumerator] = useState(String(meter.numerator));
  const [denominator, setDenominator] = useState<MeterInput["denominator"]>(meter.denominator);
  const [scope, setScope] = useState<MeterChangeScope>("meter-run");
  const [error, setError] = useState("");
  const [localFailure, setLocalFailure] = useState("");
  const [submittedKey, setSubmittedKey] = useState<string | null>(null);
  const firstField = useRef<HTMLInputElement>(null);
  const currentKey = useMemo(() => meterKey(meter), [meter]);
  const waiting = submittedKey !== null;

  useEffect(() => {
    if (!open) return;
    setNumerator(String(meter.numerator)); setDenominator(meter.denominator); setScope("meter-run");
    setError(""); setLocalFailure(""); setSubmittedKey(null);
  }, [measureId, open]);
  useEffect(() => {
    if (open && submittedKey && currentKey === submittedKey) onOpenChange(false);
  }, [currentKey, onOpenChange, open, submittedKey]);
  useEffect(() => {
    if (!open || !submittedKey || !failure) return;
    setLocalFailure(failure); setSubmittedKey(null);
  }, [failure, open, submittedKey]);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (waiting || saving) return;
    const next = parseMeterInput(numerator, denominator);
    if (!next) { setError("拍数需要是 1 到 32 的整数"); return; }
    setError(""); setLocalFailure("");
    const key = meterKey(next);
    if (key === currentKey) { onOpenChange(false); return; }
    if (!onSave(next, scope)) { setLocalFailure("当前有其他编辑正在处理，请稍后再试"); return; }
    setSubmittedKey(key);
  }

  return <Dialog.Root open={open} onOpenChange={(value) => { if (!waiting && !saving) onOpenChange(value); }}>
    <Dialog.Portal>
      <Dialog.Overlay className="dialog-overlay" />
      <Dialog.Content className="new-score-dialog measure-meter-dialog"
        onOpenAutoFocus={(event) => { event.preventDefault(); firstField.current?.focus(); }}
        onEscapeKeyDown={(event) => { if (waiting || saving) event.preventDefault(); }}
        onPointerDownOutside={(event) => { if (waiting || saving) event.preventDefault(); }}>
        <Dialog.Title className="dialog-title">更改拍号</Dialog.Title>
        <Dialog.Description className="dialog-description">第 {measureNumber} 小节</Dialog.Description>
        <form className="score-properties-form" onSubmit={submit} noValidate aria-busy={waiting || saving}>
          <div ref={(element) => { firstField.current = element?.querySelector("input") ?? null; }}>
            <ScoreMeterFields idPrefix={`measure-${measureId}`} numerator={numerator} denominator={denominator}
              scope={scope} disabled={waiting || saving} error={error}
              onNumeratorChange={setNumerator} onDenominatorChange={setDenominator} onScopeChange={setScope} />
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
