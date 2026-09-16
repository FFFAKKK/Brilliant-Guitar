import { useState } from "react";
import type { FormEvent } from "react";
import type { StaffEvent, StaffMeasure } from "../contracts/notation";
import type { ScoreSessionRead } from "../contracts/score-session";
import { durationUnits, isEventProperties, NOTE_BASES, PITCH_STEPS } from "../contracts/note-input";
import type { EventProperties, InputPitch, ScoreEditAction } from "../contracts/note-input";
import { AlterationSelect, DurationSelect } from "./notation-fields";

type InspectorAction = Extract<ScoreEditAction, { kind: "set-event-properties" | "set-title" }>;
const REST_BASES = [...NOTE_BASES, 32] as const;
interface Props {
  readonly session: ScoreSessionRead;
  readonly event: StaffEvent | undefined;
  readonly measure: StaffMeasure | undefined;
  readonly measureIndex: number;
  readonly busy: boolean;
  readonly error: string;
  readonly retryable: boolean;
  readonly onRetry: () => void;
  readonly onApply: (action: InspectorAction) => void;
  readonly onClearFeedback: () => void;
  readonly onClose: () => void;
}

function EventForm({ event, busy, onApply, onClearFeedback }: {
  event: StaffEvent; busy: boolean; onApply: (action: InspectorAction) => void; onClearFeedback: () => void;
}) {
  const [value, setValue] = useState<EventProperties>({ duration: event.duration, content: event.content });
  const isNote = value.content.kind === "note";
  const pitch = value.content.kind === "note" ? value.content.pitch : null;
  const changed = JSON.stringify(value) !== JSON.stringify({ duration: event.duration, content: event.content });
  const setPitch = (patch: Partial<InputPitch>) => { if (pitch) setValue({ ...value, content: { kind: "note", pitch: { ...pitch, ...patch } } }); };
  function submit(eventForm: FormEvent) {
    eventForm.preventDefault();
    if (!busy && changed && isEventProperties(value)) onApply({ kind: "set-event-properties", eventId: event.id, properties: value });
  }
  return <form onSubmit={submit} onChange={onClearFeedback} className="property-form">
    <fieldset disabled={busy}>
      <legend>{isNote ? "音符" : "休止符"}</legend>
      {pitch && <div className="property-pitch-row">
        <label>音名<select aria-label="所选音名" value={pitch.step} onChange={(e) => setPitch({ step: e.target.value as InputPitch["step"] })}>
          {PITCH_STEPS.map((step) => <option key={step}>{step}</option>)}
        </select></label>
        <label>组号<select aria-label="所选组号" value={pitch.octave} onChange={(e) => setPitch({ octave: Number(e.target.value) })}>
          {[2, 3, 4, 5, 6].map((octave) => <option key={octave}>{octave}</option>)}
        </select></label>
        <label>变音<AlterationSelect label="所选变音" value={pitch.alter} onChange={(alter) => setPitch({ alter })} /></label>
      </div>}
      <div className="property-duration-row">
      <label>时值<DurationSelect label="所选时值" value={value.duration.base} bases={isNote ? NOTE_BASES : REST_BASES} onChange={(base) => {
        setValue({ ...value, duration: base === 32 ? { base, dots: 0 } : { base, dots: value.duration.dots } });
      }} /></label>
      <label className="property-checkbox"><input type="checkbox" aria-label="所选附点" checked={value.duration.dots === 1}
        disabled={value.duration.base === 32} onChange={(e) => {
          if (value.duration.base !== 32) setValue({ ...value, duration: { base: value.duration.base, dots: e.target.checked ? 1 : 0 } });
        }} />附点</label>
      </div>
      <p className="property-help">修改时值会调整相邻休止或尾部空白，后续音符保持原拍位。</p>
      <div className="property-actions">
        <button className="button button-primary" type="submit" disabled={!changed}>{busy ? "应用中…" : "应用"}</button>
        <button className="button" type="button" disabled={!changed} onClick={() => {
          setValue({ duration: event.duration, content: event.content }); onClearFeedback();
        }}>重置</button>
      </div>
    </fieldset>
  </form>;
}

function TitleForm({ title, busy, onApply }: { title: string; busy: boolean; onApply: (action: InspectorAction) => void }) {
  const [draft, setDraft] = useState(title);
  const normalized = draft.trim() || "未命名乐谱";
  return <form className="property-form property-document" onSubmit={(e) => {
    e.preventDefault();
    if (!busy && normalized.length <= 120 && normalized !== title) onApply({ kind: "set-title", title: draft });
  }}>
    <fieldset disabled={busy}>
      <legend>乐谱</legend>
      <label>作品标题<input className="text-field" aria-label="乐谱标题" value={draft} maxLength={120} onChange={(e) => setDraft(e.target.value)} /></label>
      <button type="submit" className="button" disabled={normalized === title}>应用标题</button>
    </fieldset>
  </form>;
}

/** Fixed-slot presentation. Draft fields are UI state; only explicit apply requests a command. */
export function ScoreInspector({ session, event, measure, measureIndex, busy, error, retryable, onRetry, onApply, onClearFeedback, onClose }: Props) {
  const preceding = event && measure ? measure.events.slice(0, measure.events.findIndex((item) => item.id === event.id)) : [];
  const beat = measure ? 1 + preceding.reduce((sum, item) => sum + durationUnits(item.duration), 0) / (64 / measure.meter.denominator) : 1;
  return <div className="score-inspector">
    <div className="inspector-heading"><h2>属性</h2><button className="input-tool" onClick={onClose} aria-label="收起属性">收起</button></div>
    {event ? <>
      <p className="property-location">第 {measureIndex + 1} 小节 · 第 {beat} 拍</p>
      <EventForm key={`${session.documentId}:${event.id}:${JSON.stringify([event.content, event.duration])}`} event={event}
        busy={busy} onApply={onApply} onClearFeedback={onClearFeedback} />
    </> : <p className="property-help">选择一个音符或休止符，查看和修改属性。</p>}
    {error && <div className="property-error" role="alert">{error}{retryable && <button className="button" onClick={onRetry}>重试修改</button>}</div>}
    <TitleForm key={`${session.documentId}:${session.title}`} title={session.title} busy={busy} onApply={onApply} />
    <p className="property-help">共 {session.measureCount} 小节</p>
  </div>;
}
