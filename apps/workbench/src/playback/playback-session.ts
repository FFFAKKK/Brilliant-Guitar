import type { PlaybackSourceProjection } from "../contracts/playback.ts";
import type { PlaybackEngine } from "./playback-engine.ts";
import { locatePlaybackPosition, playbackStartSeconds, projectPlaybackPlan } from "./playback-plan.ts";
import type { PlaybackLocation, PlaybackPlan, PlaybackStartPoint } from "./playback-plan.ts";

export type PlaybackState = "unavailable" | "stopped" | "playing" | "paused";
export interface PlaybackSnapshot {
  readonly state: PlaybackState;
  readonly pending: boolean;
  readonly positionSeconds: number;
  readonly durationSeconds: number;
  readonly location: PlaybackLocation | null;
  readonly diagnostic: Readonly<{ code: string; message: string }> | null;
}

export interface PlaybackScheduler {
  repeat(callback: () => void): () => void;
}

const DEFAULT_SCHEDULER: PlaybackScheduler = {
  repeat(callback) {
    const handle = globalThis.setInterval(callback, 32);
    return () => globalThis.clearInterval(handle);
  },
};

function activationDiagnostic(error: unknown): Readonly<{ code: string; message: string }> {
  const message = error instanceof Error ? error.message : "音频设备无法启动";
  const name = error instanceof Error ? error.name : "";
  if (name === "NotAllowedError") return { code: "audio.activation-required", message };
  if (name === "NotSupportedError" || message.includes("不支持音频播放")) {
    return { code: "audio.unavailable", message };
  }
  return { code: "audio.activation-failed", message };
}

export class PlaybackSession {
  #engine: PlaybackEngine;
  readonly #scheduler: PlaybackScheduler;
  readonly #listeners = new Set<() => void>();
  #plan: PlaybackPlan | null = null;
  #cancelTick: (() => void) | null = null;
  #generation = 0;
  #origin = 0;
  #snapshot: PlaybackSnapshot = { state: "unavailable", pending: false, positionSeconds: 0,
    durationSeconds: 0, location: null, diagnostic: { code: "playback.no-score", message: "没有可播放的乐谱" } };

  constructor(engine: PlaybackEngine, scheduler: PlaybackScheduler = DEFAULT_SCHEDULER) {
    this.#engine = engine; this.#scheduler = scheduler;
  }

  getSnapshot = (): PlaybackSnapshot => this.#snapshot;
  subscribe = (listener: () => void): (() => void) => { this.#listeners.add(listener); return () => this.#listeners.delete(listener); };

  #publish(next: PlaybackSnapshot): void {
    this.#snapshot = next;
    for (const listener of this.#listeners) listener();
  }

  replaceEngine(engine: PlaybackEngine): void {
    if (engine === this.#engine) return;
    this.#generation += 1; this.#stopClock(); this.#engine.stop(); this.#engine = engine;
    if (!this.#plan) return;
    this.#publish({ state: "stopped", pending: false, positionSeconds: 0, durationSeconds: this.#plan.durationSeconds,
      location: locatePlaybackPosition(this.#plan, 0), diagnostic: null });
  }

  setSource(source: PlaybackSourceProjection | null): void {
    this.#generation += 1; this.#stopClock(); this.#engine.stop(); this.#plan = null;
    if (!source) {
      this.#publish({ state: "unavailable", pending: false, positionSeconds: 0, durationSeconds: 0,
        location: null, diagnostic: { code: "playback.no-score", message: "没有可播放的乐谱" } });
      return;
    }
    const result = projectPlaybackPlan(source);
    if (result.kind === "unsupported") {
      this.#publish({ state: "unavailable", pending: false, positionSeconds: 0, durationSeconds: 0,
        location: null, diagnostic: { code: result.code, message: result.message } });
      return;
    }
    this.#plan = result.plan;
    this.#publish({ state: "stopped", pending: false, positionSeconds: 0, durationSeconds: result.plan.durationSeconds,
      location: locatePlaybackPosition(result.plan, 0), diagnostic: null });
  }

  async toggle(): Promise<void> {
    if (this.#snapshot.state === "playing") { this.pause(); return; }
    await this.play();
  }

  prepareStart(point: PlaybackStartPoint | null): void {
    if (!point || !this.#plan || this.#snapshot.state !== "stopped") return;
    const position = playbackStartSeconds(this.#plan, point);
    this.#publish({ ...this.#snapshot, positionSeconds: position, location: locatePlaybackPosition(this.#plan, position), diagnostic: null });
  }

  #eventTarget(direction: -1 | 1): number | null {
    const plan = this.#plan;
    if (!plan || plan.items.length === 0) return null;
    const position = this.#snapshot.positionSeconds;
    if (direction > 0) return plan.items.find((item) => item.startSeconds > position + 0.001)?.startSeconds ?? null;
    const current = [...plan.items].reverse().find((item) => item.startSeconds <= position + 0.001);
    if (!current) return null;
    if (position - current.startSeconds >= 0.35) return current.startSeconds;
    return [...plan.items].reverse().find((item) => item.startSeconds < current.startSeconds - 0.001)?.startSeconds ?? null;
  }

  canSeekEvent(direction: -1 | 1): boolean { return this.#eventTarget(direction) !== null; }

  seekEvent(direction: -1 | 1): void {
    const plan = this.#plan;
    const target = this.#eventTarget(direction);
    if (!plan || target === null || this.#snapshot.pending) return;
    const wasPlaying = this.#snapshot.state === "playing";
    this.#generation += 1; this.#stopClock(); this.#engine.stop();
    if (wasPlaying && target < plan.durationSeconds) {
      this.#engine.start(plan.items, target);
      this.#origin = this.#engine.now() - target;
      this.#publish({ ...this.#snapshot, state: "playing", pending: false, positionSeconds: target,
        location: locatePlaybackPosition(plan, target), diagnostic: null });
      this.#cancelTick = this.#scheduler.repeat(() => this.refresh());
      return;
    }
    this.#publish({ ...this.#snapshot, state: this.#snapshot.state === "paused" ? "paused" : "stopped",
      pending: false, positionSeconds: target, location: locatePlaybackPosition(plan, target), diagnostic: null });
  }

  async play(): Promise<void> {
    const plan = this.#plan;
    if (!plan || this.#snapshot.pending) return;
    const generation = ++this.#generation;
    const offset = this.#snapshot.positionSeconds >= plan.durationSeconds ? 0 : this.#snapshot.positionSeconds;
    this.#publish({ ...this.#snapshot, pending: true, diagnostic: null });
    try {
      await this.#engine.activate();
      if (generation !== this.#generation || this.#plan !== plan) return;
      this.#engine.start(plan.items, offset);
      this.#origin = this.#engine.now() - offset;
      this.#publish({ state: "playing", pending: false, positionSeconds: offset, durationSeconds: plan.durationSeconds,
        location: locatePlaybackPosition(plan, offset), diagnostic: null });
      this.#stopClock();
      this.#cancelTick = this.#scheduler.repeat(() => this.refresh());
    } catch (error) {
      if (generation !== this.#generation) return;
      this.#engine.stop();
      this.#publish({ ...this.#snapshot, state: "stopped", pending: false,
        diagnostic: activationDiagnostic(error) });
    }
  }

  pause(): void {
    if (this.#snapshot.state !== "playing" || !this.#plan) return;
    const position = Math.min(this.#plan.durationSeconds, Math.max(0, this.#engine.now() - this.#origin));
    this.#generation += 1; this.#stopClock(); this.#engine.stop();
    this.#publish({ ...this.#snapshot, state: "paused", pending: false, positionSeconds: position,
      location: locatePlaybackPosition(this.#plan, position) });
  }

  stop(): void {
    if (!this.#plan) return;
    this.#generation += 1; this.#stopClock(); this.#engine.stop();
    this.#publish({ state: "stopped", pending: false, positionSeconds: 0, durationSeconds: this.#plan.durationSeconds,
      location: locatePlaybackPosition(this.#plan, 0), diagnostic: null });
  }

  refresh(): void {
    if (this.#snapshot.state !== "playing" || !this.#plan) return;
    const position = Math.max(0, this.#engine.now() - this.#origin);
    if (position >= this.#plan.durationSeconds) { this.stop(); return; }
    this.#publish({ ...this.#snapshot, positionSeconds: position, location: locatePlaybackPosition(this.#plan, position) });
  }

  dispose(): void { this.#generation += 1; this.#stopClock(); this.#engine.stop(); this.#listeners.clear(); }
  #stopClock(): void { this.#cancelTick?.(); this.#cancelTick = null; }
}
