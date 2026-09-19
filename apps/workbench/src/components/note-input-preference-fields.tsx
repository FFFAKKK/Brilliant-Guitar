import type { NoteInputPreferencesV1, NoteInputRetention } from "../contracts/application-settings.ts";
import { NOTE_BASES } from "../contracts/note-input.ts";
import type { InputDuration } from "../contracts/note-input.ts";
import { DURATION_NAMES } from "../notation/music-symbols.ts";

interface Props {
  readonly value: NoteInputPreferencesV1;
  readonly disabled?: boolean;
  readonly compact?: boolean;
  readonly onRetentionChange: (value: NoteInputRetention) => void;
  readonly onDefaultDurationChange: (value: InputDuration) => void;
}

const durationValue = (value: InputDuration) => `${value.base}:${value.dots}`;

function parseDuration(value: string): InputDuration | null {
  const [baseText, dotsText] = value.split(":");
  const base = Number(baseText), dots = Number(dotsText);
  if (!(NOTE_BASES as readonly number[]).includes(base) || (dots !== 0 && dots !== 1)) return null;
  return { base: base as InputDuration["base"], dots: dots as InputDuration["dots"] };
}

/** Shared fields keep the dock shortcut and application settings on one configuration source. */
export function NoteInputPreferenceFields({ value, disabled = false, compact = false,
  onRetentionChange, onDefaultDurationChange }: Props) {
  const className = compact ? "note-preference-fields note-preference-fields-compact" : "note-preference-fields";
  return <div className={className}>
    <label className="note-preference-field">
      <span>输入后</span>
      <select value={value.retention} disabled={disabled}
        aria-label="输入完成后的工具状态"
        onChange={(event) => onRetentionChange(event.target.value as NoteInputRetention)}>
        <option value="rhythm">保持时值与附点</option>
        <option value="all">保持全部工具</option>
        <option value="reset">恢复默认输入</option>
      </select>
    </label>
    <label className="note-preference-field">
      <span>默认时值</span>
      <select value={durationValue(value.defaultDuration)} disabled={disabled}
        aria-label="默认音符时值"
        onChange={(event) => { const next = parseDuration(event.target.value); if (next) onDefaultDurationChange(next); }}>
        {NOTE_BASES.flatMap((base) => ([0, 1] as const).map((dots) =>
          <option value={`${base}:${dots}`} key={`${base}:${dots}`}>{dots ? "附点" : ""}{DURATION_NAMES[base]}</option>))}
      </select>
    </label>
  </div>;
}
