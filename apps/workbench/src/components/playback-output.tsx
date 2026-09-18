import { useRef } from "react";
import type { ChangeEvent } from "react";
import type { PlaybackOutputProjection } from "../ui/first-party-plugin-projections.ts";
import { ComponentPlacementMenu } from "./component-placement-menu.tsx";

function OutputIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5.5 9.2h3.2l4-3.2v12l-4-3.2H5.5Z"
    fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /><path d="M15.5 9.1c1.5 1.6 1.5 4.2 0 5.8m2.4-8.1c2.8 2.9 2.8 7.5 0 10.4"
    fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>;
}

function SoundFontIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.8h7l3 3V19H7Z" fill="none"
    stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /><path d="M14 4.8V8h3M10 12h4m-4 3h3"
    fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>;
}

function RemoveIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 8 8 8m0-8-8 8" fill="none"
    stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>;
}

function PendingIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7" fill="none"
    stroke="currentColor" strokeWidth="1.5" /><path d="M12 8v4l2.7 1.8" fill="none" stroke="currentColor"
    strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

export function PlaybackOutput({ projection }: { readonly projection: PlaybackOutputProjection }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { snapshot } = projection;
  const active = snapshot.outputs.find((output) => output.id === snapshot.activeId);
  const importFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) void projection.importSoundFont(file);
  };

  return <div className="playback-output-dock">
    <section className="playback-output" aria-label="音乐播放输出">
      <header className="playback-output-header">
        <span className="playback-output-mark"><OutputIcon /></span>
        <span className="playback-output-heading"><strong>播放输出</strong><small>{active?.label ?? "未选择"}</small></span>
        <ComponentPlacementMenu label="播放输出组件" />
      </header>
      <div className="playback-output-list" role="radiogroup" aria-label="可用播放输出">
        {snapshot.outputs.map((output) => <button key={output.id} type="button" className="playback-output-option"
          data-active={output.id === snapshot.activeId || undefined} disabled={!output.available || snapshot.pending}
          role="radio" aria-checked={output.id === snapshot.activeId} title={output.diagnostic?.message ?? output.label}
          onClick={() => { void projection.select(output.id); }}>
          <span className="playback-output-option-icon">{output.kind === "builtin-synth" ? <OutputIcon /> : <SoundFontIcon />}</span>
          <span className="playback-output-option-copy"><strong>{output.label}</strong><small>{output.kind === "builtin-synth"
            ? "低延迟预览" : output.available ? "SoundFont" : "已识别 · 待采样引擎"}</small></span>
          <span className="playback-output-option-state" aria-hidden="true">{output.available
            ? <i className="playback-output-dot" /> : <PendingIcon />}</span>
        </button>)}
      </div>
      <div className="playback-output-resources">
        <div className="playback-output-resource-head">
          <span>音源库</span>
          <button type="button" className="playback-output-import" disabled={snapshot.pending}
            onClick={() => inputRef.current?.click()}><SoundFontIcon /><span>SF2 / SF3</span></button>
        </div>
        {snapshot.sampleBanks.length > 0 && <div className="playback-output-resource-list">
          {snapshot.sampleBanks.map((resource) => <div className="playback-output-resource" key={resource.id}>
            <span className="playback-output-resource-format">{resource.format.toUpperCase()}</span>
            <span className="playback-output-resource-name" title={resource.name}>{resource.name}</span>
            <span className="playback-output-resource-size">{formatBytes(resource.sizeBytes)}</span>
            <button type="button" className="playback-output-remove" aria-label={`移除音源 ${resource.name}`}
              title="移除音源" onClick={() => projection.removeSampleBank(resource.id)}><RemoveIcon /></button>
          </div>)}
        </div>}
      </div>
      <input ref={inputRef} className="visually-hidden" type="file" accept=".sf2,.sf3"
        aria-label="导入 SoundFont 音源" onChange={importFile} />
      <span className="visually-hidden" aria-live="polite">{snapshot.pending ? "正在读取音源"
        : snapshot.diagnostic?.message ?? `${active?.label ?? "播放输出"}正在使用`}</span>
    </section>
  </div>;
}

export function PlaybackOutputDockIcon() { return <OutputIcon />; }
