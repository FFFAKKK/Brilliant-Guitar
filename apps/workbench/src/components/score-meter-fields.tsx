import { METER_DENOMINATORS } from "../contracts/note-input.ts";
import type { MeterChangeScope, MeterInput } from "../contracts/note-input.ts";

const COMMON_METERS: readonly MeterInput[] = [
  { numerator: 2, denominator: 4 },
  { numerator: 3, denominator: 4 },
  { numerator: 4, denominator: 4 },
  { numerator: 6, denominator: 8 },
  { numerator: 9, denominator: 8 },
  { numerator: 12, denominator: 8 },
];

export interface ScoreMeterFieldsProps {
  readonly idPrefix: string;
  readonly numerator: string;
  readonly denominator: MeterInput["denominator"];
  readonly scope?: MeterChangeScope;
  readonly disabled?: boolean;
  readonly error?: string;
  readonly onNumeratorChange: (value: string) => void;
  readonly onDenominatorChange: (value: MeterInput["denominator"]) => void;
  readonly onScopeChange?: (value: MeterChangeScope) => void;
}

export function parseMeterInput(numerator: string, denominator: MeterInput["denominator"]): MeterInput | null {
  const value = Number(numerator);
  return Number.isSafeInteger(value) && value >= 1 && value <= 32 ? { numerator: value, denominator } : null;
}

export function ScoreMeterFields({ idPrefix, numerator, denominator, scope, disabled = false, error,
  onNumeratorChange, onDenominatorChange, onScopeChange }: ScoreMeterFieldsProps) {
  const selected = `${numerator}/${denominator}`;
  return <div className="score-meter-fields">
    <div className="score-meter-presets" aria-label="常用拍号">
      {COMMON_METERS.map((meter) => {
        const label = `${meter.numerator}/${meter.denominator}`;
        return <button key={label} type="button" className="score-meter-preset"
          data-selected={selected === label} aria-pressed={selected === label} disabled={disabled}
          onClick={() => { onNumeratorChange(String(meter.numerator)); onDenominatorChange(meter.denominator); }}>
          {label}
        </button>;
      })}
    </div>
    <div className="score-meter-custom">
      <div className="form-field">
        <label htmlFor={`${idPrefix}-numerator`}>拍数</label>
        <input id={`${idPrefix}-numerator`} className="text-field measure-field" type="number" min="1" max="32"
          step="1" inputMode="numeric" value={numerator} disabled={disabled} aria-invalid={!!error}
          onChange={(event) => onNumeratorChange(event.target.value)} />
      </div>
      <span className="score-meter-divider" aria-hidden="true">/</span>
      <div className="form-field">
        <label htmlFor={`${idPrefix}-denominator`}>拍值</label>
        <select id={`${idPrefix}-denominator`} className="text-field measure-field" value={denominator}
          disabled={disabled} onChange={(event) => onDenominatorChange(Number(event.target.value) as MeterInput["denominator"])}>
          {METER_DENOMINATORS.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
      </div>
    </div>
    {error && <p className="field-error">{error}</p>}
    {scope && onScopeChange && <fieldset className="score-meter-scope" disabled={disabled}>
      <legend>应用范围</legend>
      <label><input type="radio" name={`${idPrefix}-scope`} value="meter-run" checked={scope === "meter-run"}
        onChange={() => onScopeChange("meter-run")} /> 后续同拍号小节</label>
      <label><input type="radio" name={`${idPrefix}-scope`} value="measure" checked={scope === "measure"}
        onChange={() => onScopeChange("measure")} /> 仅当前小节</label>
    </fieldset>}
  </div>;
}
