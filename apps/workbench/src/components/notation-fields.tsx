import type { EventDuration, InputPitch } from "../contracts/note-input";

const DURATION_LABELS = { 1: "全音符", 2: "二分", 4: "四分", 8: "八分", 16: "十六分", 32: "三十二分" } as const;

/** Callers own the allowed values and whether a field edits a draft or input settings. */
export function DurationSelect<Base extends EventDuration["base"]>({ label, value, bases, onChange }: {
  readonly label: string;
  readonly value: Base;
  readonly bases: readonly Base[];
  readonly onChange: (base: Base) => void;
}) {
  return <select aria-label={label} value={value} onChange={(event) => {
    const base = bases.find((candidate) => candidate === Number(event.target.value));
    if (base !== undefined) onChange(base);
  }}>
    {bases.map((base) => <option key={base} value={base}>{DURATION_LABELS[base]}</option>)}
  </select>;
}

export function AlterationSelect({ label, value, onChange }: {
  readonly label: string;
  readonly value: InputPitch["alter"];
  readonly onChange: (alter: InputPitch["alter"]) => void;
}) {
  return <select aria-label={label} value={value} onChange={(event) => {
    const alter = Number(event.target.value);
    if (alter === -1 || alter === 0 || alter === 1) onChange(alter);
  }}>
    <option value="0">自然</option><option value="1">升 ♯</option><option value="-1">降 ♭</option>
  </select>;
}
