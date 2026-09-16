import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import type { InputPitch } from "../contracts/note-input";
import type { NoteOverview } from "../editor/note-overview";
import { ACCIDENTAL_STATES } from "../editor/accidental-state";
import type { AccidentalState } from "../editor/accidental-state";

type PitchField = "step" | "alter" | "octave";
const STEPS = ["A", "B", "C", "D", "E", "F", "G"] as const;
const ALTER_SYMBOLS = { none: "", flat: "♭", natural: "♮", sharp: "♯" } as const;
const ALTER_NAMES = { none: "无变音记号", flat: "降", natural: "还原", sharp: "升" } as const;
const ALTER_KEYS: Readonly<Record<string, AccidentalState>> = {
  b: "flat", B: "flat", "♭": "flat", "-": "flat", n: "natural", N: "natural", "♮": "natural",
  "0": "none", "#": "sharp", "♯": "sharp", "+": "sharp",
};

interface Props {
  readonly pitch: NoteOverview["pitch"];
  readonly accidental: AccidentalState;
  readonly source: NoteOverview["source"];
  readonly rest: boolean;
  readonly pending: boolean;
  readonly disabled: boolean;
  readonly feedback: string;
  readonly onAccidentalChange: (value: AccidentalState, completionFocus?: HTMLElement) => void;
  readonly onPitchChange?: (value: InputPitch, completionFocus: HTMLElement) => void;
}

/** In-flight characters are UI feedback; confirmed pitch always comes from the session read. */
export function NotePitchFields({ pitch, accidental, source, rest, pending, disabled, feedback, onAccidentalChange, onPitchChange }: Props) {
  const complete = pitch?.octave !== null && pitch?.octave !== undefined && !rest;
  const editable = complete && onPitchChange !== undefined;
  const canonical = { step: pitch?.step ?? "", alter: accidental, octave: pitch?.octave ?? 4 };
  const [shown, setShown] = useState(canonical);
  const stepRef = useRef<HTMLInputElement>(null), alterRef = useRef<HTMLInputElement>(null), octaveRef = useRef<HTMLInputElement>(null);
  const wheelRef = useRef({ field: "" as PitchField | "", total: 0, lastAt: 0 });
  useEffect(() => { if (!pending) setShown(canonical); }, [canonical.step, canonical.alter, canonical.octave, source, pending, feedback]);

  function apply(field: PitchField, value: string | number, input: HTMLInputElement) {
    if (!editable || pending || disabled || !pitch || pitch.octave === null) return;
    if (field === "alter") {
      const alter = value as AccidentalState;
      if (alter === shown.alter) return;
      setShown((current) => ({ ...current, alter }));
      onAccidentalChange(alter, input);
    } else {
      if (value === shown[field]) return;
      setShown((current) => ({ ...current, [field]: value }));
      const next = { step: field === "step" ? value as InputPitch["step"] : shown.step as InputPitch["step"],
        octave: field === "octave" ? value as number : shown.octave, alter: pitch.alter };
      onPitchChange?.(next, input);
    }
    input.select();
  }
  function changeBy(field: PitchField, direction: -1 | 1 | 0, input: HTMLInputElement, endpoint?: "first" | "last") {
    const values: readonly (string | number)[] = field === "step" ? STEPS : field === "alter" ? ACCIDENTAL_STATES : [2, 3, 4, 5, 6];
    const current = values.indexOf(shown[field]);
    const index = endpoint === "first" ? 0 : endpoint === "last" ? values.length - 1 : Math.max(0, Math.min(values.length - 1, current + direction));
    apply(field, values[index]!, input);
  }
  useEffect(() => {
    const elements: readonly (readonly [PitchField, HTMLInputElement | null])[] = [
      ["step", stepRef.current], ["alter", alterRef.current], ["octave", octaveRef.current],
    ];
    const removers: Array<() => void> = [];
    for (const [field, element] of elements) {
      if (!element) continue;
      const onWheel = (event: WheelEvent) => {
        if (document.activeElement !== element || pending || disabled || event.ctrlKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
        event.preventDefault();
        const now = performance.now(), accumulator = wheelRef.current;
        if (accumulator.field !== field || now - accumulator.lastAt > 240 || Math.sign(accumulator.total) !== Math.sign(event.deltaY)) accumulator.total = 0;
        accumulator.field = field; accumulator.lastAt = now;
        accumulator.total += event.deltaY * (event.deltaMode === 1 ? 40 : event.deltaMode === 2 ? 240 : 1);
        if (Math.abs(accumulator.total) >= 80) { changeBy(field, accumulator.total < 0 ? 1 : -1, element); accumulator.total = 0; }
      };
      element.addEventListener("wheel", onWheel, { passive: false });
      removers.push(() => element.removeEventListener("wheel", onWheel));
    }
    return () => removers.forEach((remove) => remove());
  }, [editable, pending, disabled, shown.step, shown.alter, shown.octave, onAccidentalChange, onPitchChange]);

  if (!complete) return <span className="note-entry-pitch-static" role="img" aria-label={rest ? "休止符，无音高" : pitch ? `${pitch.step}，等待组号` : "尚未输入音名"}>
    {pitch && !rest ? `${pitch.step}${ALTER_SYMBOLS[accidental]}_` : "—"}
  </span>;
  function fieldInput(field: PitchField, ref: RefObject<HTMLInputElement | null>) {
    const value = field === "alter" ? ALTER_SYMBOLS[shown.alter] : String(shown[field]);
    const numeric = field === "step" ? STEPS.indexOf(shown.step as InputPitch["step"])
      : field === "alter" ? ACCIDENTAL_STATES.indexOf(shown.alter) : Number(shown[field]);
    const label = field === "step" ? "音名：点选后输入 A–G、方向键或滚轮"
      : field === "alter" ? "变音：点选后输入 b、0、#，方向键或滚轮" : "组号：点选后输入 2–6、方向键或滚轮";
    return <input ref={ref} key={field} className="note-entry-field" data-field={field} type="text" value={value}
      maxLength={1} autoComplete="off" spellCheck={false} inputMode={field === "octave" ? "numeric" : undefined}
      role="spinbutton" aria-label={label} aria-valuemin={field === "step" ? 0 : field === "alter" ? 0 : 2}
      aria-valuemax={field === "step" ? 6 : field === "alter" ? 3 : 6} aria-valuenow={numeric}
      aria-valuetext={field === "alter" ? ALTER_NAMES[shown.alter] : String(shown[field])}
      aria-readonly={pending || disabled} readOnly={pending || disabled} title={label}
      onFocus={(event) => { event.currentTarget.select(); wheelRef.current.total = 0; }}
      onClick={(event) => event.currentTarget.select()}
      onChange={(event) => {
        if ("isComposing" in event.nativeEvent && event.nativeEvent.isComposing) return;
        const raw = event.currentTarget.value.trim();
        if (field === "step" && /^[A-G]$/i.test(raw)) apply(field, raw.toUpperCase(), event.currentTarget);
        if (field === "octave" && /^[2-6]$/.test(raw)) apply(field, Number(raw), event.currentTarget);
        if (field === "alter" && Object.hasOwn(ALTER_KEYS, raw)) apply(field, ALTER_KEYS[raw]!, event.currentTarget);
      }}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.ctrlKey || event.metaKey || event.altKey) return;
        if (event.key === "ArrowUp" || event.key === "ArrowDown") {
          event.preventDefault(); if (!event.repeat) changeBy(field, event.key === "ArrowUp" ? 1 : -1, event.currentTarget);
        } else if (event.key === "Home" || event.key === "End") {
          event.preventDefault(); changeBy(field, 0, event.currentTarget, event.key === "Home" ? "first" : "last");
        } else if (event.key === "Escape" || event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); }
        else if (event.key === "Backspace" || event.key === "Delete") {
          event.preventDefault();
          if (field === "alter") apply(field, "none", event.currentTarget); else event.currentTarget.select();
        }
      }} />;
  }
  return <span className="note-entry-pitch-fields" role="group"
    aria-label={`${source === "selection" ? "选中音符" : "输入预览"}的音名、变音和组号`}>
    {fieldInput("step", stepRef)}{fieldInput("alter", alterRef)}{fieldInput("octave", octaveRef)}
  </span>;
}
