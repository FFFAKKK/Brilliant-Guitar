import type { EventDuration, InputPitch } from "../contracts/note-input";
import type { NoteOverview } from "../editor/note-overview";
import { stepNoteDuration, toggleNoteDot } from "../editor/note-overview";
import { DURATION_NAMES, durationSymbol, MUSIC_SYMBOLS } from "../notation/music-symbols";
import { MusicGlyph } from "./music-glyph";
import { NotePitchFields } from "./note-pitch-fields";
import type { ScorePosition } from "../editor/score-position";
import { ScorePositionIndicator } from "./score-position-indicator";
import type { AccidentalState } from "../editor/accidental-state";

export interface NoteInputPanelProps {
  readonly duration: EventDuration;
  readonly accidental: AccidentalState;
  readonly rest: boolean;
  readonly pitch?: NoteOverview["pitch"];
  readonly source?: NoteOverview["source"];
  readonly measureShare?: NoteOverview["measureShare"];
  readonly position?: ScorePosition | null;
  readonly pending?: boolean;
  readonly disabled?: boolean;
  readonly feedback?: string;
  readonly onDurationChange: (value: EventDuration) => void;
  readonly onAccidentalChange: (value: AccidentalState, completionFocus?: HTMLElement) => void;
  readonly onPitchChange?: (value: InputPitch, completionFocus: HTMLElement) => void;
  readonly onRestChange: (value: boolean) => void;
}

function SourceIcon({ source, pending }: { readonly source: NoteOverview["source"]; readonly pending: boolean }) {
  const label = pending ? "正在提交操作" : source === "selection" ? "当前选中：控件修改这枚音符" : "输入预览：控件设置接下来的音符";
  return <span className="note-entry-source" data-source={source} data-pending={pending} role="img" aria-label={label} title={label}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {pending ? <><circle cx="12" cy="12" r="8" opacity=".25" /><path d="M12 4a8 8 0 0 1 8 8" /></>
        : source === "selection" ? <path d="m5 3 14 10-7 1-3 7-4-18Z" />
          : <><path d="m5 15-1 5 5-1L20 8a2.8 2.8 0 0 0-4-4L5 15Z" /><path d="m14 6 4 4M5 15l4 4" /></>}
    </svg>
  </span>;
}

/** One compact surface; the common host only supplies placement and size. */
export function NoteInputPanel({ duration, accidental, rest, pitch = null, source = "input", measureShare = null, position = null, pending = false,
  disabled = false, feedback = "", onDurationChange, onAccidentalChange, onPitchChange, onRestChange }: NoteInputPanelProps) {
  const name = `${duration.dots ? "附点" : ""}${DURATION_NAMES[duration.base]}${rest ? "休止符" : "音符"}`;
  const pitchName = pitch && !rest ? `${pitch.step}${pitch.alter === 1 ? "♯" : pitch.alter === -1 ? "♭" : ""}${pitch.octave ?? "_"}` : rest ? "休止符" : "尚未输入音名";
  const allowShortRest = source === "selection" && rest;
  const shorter = stepNoteDuration(duration, 1, allowShortRest);
  const context = source === "selection" ? "当前选中音符" : "接下来的音符";
  return <div className="note-entry-panel" role="group" aria-label={source === "selection" ? "音符控制：当前选中音符" : "音符控制：输入设置"}>
    <SourceIcon source={source} pending={pending} />
    <div className="note-entry-duration" role="group" aria-label="时值">
      <button type="button" className="note-entry-button note-entry-step" aria-label="延长时值" title="延长一倍（−）"
        disabled={disabled || duration.base === 1} onClick={() => onDurationChange(stepNoteDuration(duration, -1, allowShortRest))}>−</button>
      <div className="note-entry-current" role="img" aria-label={name} title={name}>
        <span className="note-entry-symbol" key={`${duration.base}:${duration.dots}:${rest}`}>
          <MusicGlyph symbol={durationSymbol(duration, rest) + (duration.dots ? MUSIC_SYMBOLS.dot : "")} fallback={`1/${duration.base}${duration.dots ? " ·" : ""}`} />
        </span>
      </div>
      <button type="button" className="note-entry-button note-entry-step" aria-label="缩短时值" title="缩短一半（＋）"
        disabled={disabled || shorter.base === duration.base} onClick={() => onDurationChange(shorter)}>＋</button>
    </div>
    <div className="note-entry-properties">
      <NotePitchFields pitch={pitch} accidental={accidental} source={source} rest={rest} pending={pending} disabled={disabled} feedback={feedback}
        onAccidentalChange={onAccidentalChange} {...(onPitchChange === undefined ? {} : { onPitchChange })} />
      <span className="note-entry-share" aria-label={measureShare ? `占本小节的 ${measureShare}` : "暂无小节比例"}
        title={measureShare ? `${name}，占本小节的 ${measureShare}` : "等待小节拍号"}>
        <span className="note-entry-share-label" aria-hidden="true">占小节</span>
        <span className="note-entry-value">{measureShare ?? "—"}</span>
      </span>
    </div>
    <div className="note-entry-options">
      <div className="note-entry-rhythm" role="group" aria-label="附点和休止符">
        <button type="button" className="note-entry-button" aria-label="附点" title="附点（.）：增加原时值的一半"
          aria-pressed={duration.dots === 1} disabled={disabled || duration.base === 32} onClick={() => onDurationChange(toggleNoteDot(duration))}>
          <MusicGlyph symbol={MUSIC_SYMBOLS.dot} fallback="·" />
        </button>
        <button type="button" className="note-entry-button" aria-label={source === "selection" ? "改为等时值休止符" : "休止符工具"}
          title={source === "selection" ? "改为等时值休止符，保留后续音符的拍位" : "休止符工具：双击小节输入；R 直接输入"}
          aria-pressed={rest} disabled={disabled || (source === "selection" && rest)} onClick={() => onRestChange(!rest)}>
          <MusicGlyph symbol={durationSymbol({ base: 4, dots: 0 }, true)} fallback="休止" />
        </button>
      </div>
      <div className="note-entry-accidentals" role="group" aria-label="变音记号">
        {([{ value: "flat", symbol: MUSIC_SYMBOLS.flat, label: "降号", fallback: "♭" },
          { value: "natural", symbol: MUSIC_SYMBOLS.natural, label: "还原号", fallback: "♮" },
          { value: "sharp", symbol: MUSIC_SYMBOLS.sharp, label: "升号", fallback: "♯" }] as const).map((option) =>
          <button key={option.value} type="button" className="note-entry-button" aria-label={option.label} title={`${option.label}：用于${context}`}
            aria-pressed={!rest && accidental === option.value} disabled={disabled || rest}
            onClick={() => onAccidentalChange(accidental === option.value ? "none" : option.value)}>
            <MusicGlyph symbol={option.symbol} fallback={option.fallback} />
          </button>)}
      </div>
    </div>
    <ScorePositionIndicator position={position} />
    <span className="note-entry-live" role="status">{pending ? "正在提交操作" : `${source === "selection" ? "选中" : "输入预览"}：${pitchName}，${name}，占本小节 ${measureShare ?? "—"}`}</span>
  </div>;
}
