import type { PlaybackControlProjection } from "../ui/first-party-plugin-projections.ts";
import { useHostedUiComponent } from "./ui-component-host.tsx";
import { ComponentPlacementMenu } from "./component-placement-menu.tsx";

function PlayIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6.8 17 12l-8 5.2Z" fill="currentColor" /></svg>; }
function PauseIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 7.2h3v9.6H8zm5 0h3v9.6h-3z" fill="currentColor" /></svg>; }
function StopIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7.5" y="7.5" width="9" height="9" rx="1.5" fill="currentColor" /></svg>; }
function PreviousIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.5 7v10M17 7.5 10 12l7 4.5Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>; }
function NextIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16.5 7v10M7 7.5l7 4.5-7 4.5Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>; }
function formatTime(seconds: number): string {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  return `${Math.floor(safe / 60)}:${Math.floor(safe % 60).toString().padStart(2, "0")}`;
}

export function PlaybackTransport({ projection }: { readonly projection: PlaybackControlProjection }) {
  const component = useHostedUiComponent();
  const { snapshot } = projection;
  const playing = snapshot.state === "playing";
  const unavailable = snapshot.state === "unavailable";
  const stopEnabled = !unavailable && (snapshot.state !== "stopped" || snapshot.positionSeconds > 0);
  const diagnostic = snapshot.diagnostic?.message;

  return <div className="playback-transport-dock">
    <div className="playback-transport" data-state={snapshot.state} data-pending={snapshot.pending || undefined}
      title={diagnostic} aria-label="播放控制">
      <div className="playback-transport-controls">
        <button type="button" className="playback-transport-button playback-transport-stop" disabled={!stopEnabled || snapshot.pending}
          aria-label="停止并回到开头" title="停止并回到开头" onClick={() => { component.executeCommand("playback.stop"); }}><StopIcon /></button>
        <button type="button" className="playback-transport-button" disabled={unavailable || snapshot.pending || !projection.canPrevious}
          aria-label="上一个音符" title="上一个音符" onClick={() => { component.executeCommand("playback.previous"); }}><PreviousIcon /></button>
        <button type="button" className="playback-transport-primary" disabled={unavailable || snapshot.pending}
          aria-label={playing ? "暂停" : "播放"} title={playing ? "暂停" : "播放"}
          onClick={() => { component.executeCommand("playback.toggle"); }}>
          <span className="playback-transport-primary-glyph">{playing ? <PauseIcon /> : <PlayIcon />}</span>
        </button>
        <button type="button" className="playback-transport-button" disabled={unavailable || snapshot.pending || !projection.canNext}
          aria-label="下一个音符" title="下一个音符" onClick={() => { component.executeCommand("playback.next"); }}><NextIcon /></button>
      </div>
      <output className="playback-transport-time" aria-label={`播放位置 ${formatTime(snapshot.positionSeconds)}，总时长 ${formatTime(snapshot.durationSeconds)}`}>
        <span>{formatTime(snapshot.positionSeconds)}</span><i aria-hidden="true">/</i><span>{formatTime(snapshot.durationSeconds)}</span>
      </output>
      <ComponentPlacementMenu label="播放组件" />
      <span className="visually-hidden" aria-live="polite">{diagnostic ?? (playing ? "正在播放" : snapshot.state === "paused" ? "已暂停" : "已停止")}</span>
    </div>
  </div>;
}

export function PlaybackTransportDockIcon() { return <PlayIcon />; }
