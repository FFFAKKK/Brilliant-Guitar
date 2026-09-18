import type { PlaybackPlanItem } from "./playback-plan.ts";

export interface PlaybackEngine {
  activate(): Promise<void>;
  now(): number;
  start(items: readonly PlaybackPlanItem[], offsetSeconds: number): void;
  stop(): void;
}

type AudioContextConstructor = new () => AudioContext;

/** Small built-in synthesizer. A sampler or MIDI backend can replace this port later. */
export class WebAudioPlaybackEngine implements PlaybackEngine {
  readonly #contextFactory: () => AudioContext;
  #context: AudioContext | null = null;
  #nodes = new Set<{ oscillator: OscillatorNode; gain: GainNode }>();

  constructor(contextFactory: () => AudioContext = () => {
    const Constructor = globalThis.AudioContext as AudioContextConstructor | undefined;
    if (!Constructor) throw new Error("当前环境不支持音频播放");
    return new Constructor();
  }) { this.#contextFactory = contextFactory; }

  async activate(): Promise<void> {
    this.#context ??= this.#contextFactory();
    if (this.#context.state === "suspended") await this.#context.resume();
    if (this.#context.state !== "running") throw new Error("音频设备尚未就绪");
  }

  now(): number { return this.#context?.currentTime ?? performance.now() / 1000; }

  start(items: readonly PlaybackPlanItem[], offsetSeconds: number): void {
    const context = this.#context;
    if (!context || context.state !== "running") throw new Error("音频设备尚未激活");
    this.stop();
    const origin = context.currentTime - offsetSeconds;
    for (const item of items) {
      if (item.midi === null || item.startSeconds + item.durationSeconds <= offsetSeconds) continue;
      const start = Math.max(context.currentTime, origin + item.startSeconds);
      const end = Math.max(start + 0.02, origin + item.startSeconds + item.durationSeconds);
      const oscillator = context.createOscillator(), gain = context.createGain();
      oscillator.type = "triangle";
      oscillator.frequency.setValueAtTime(440 * 2 ** ((item.midi - 69) / 12), start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.12, Math.min(end, start + 0.012));
      gain.gain.setValueAtTime(0.12, Math.max(start + 0.012, end - 0.035));
      gain.gain.exponentialRampToValueAtTime(0.0001, end);
      oscillator.connect(gain).connect(context.destination);
      const entry = { oscillator, gain };
      this.#nodes.add(entry);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); this.#nodes.delete(entry); };
      oscillator.start(start); oscillator.stop(end);
    }
  }

  stop(): void {
    for (const entry of this.#nodes) {
      entry.oscillator.onended = null;
      try { entry.oscillator.stop(); } catch { /* already stopped */ }
      entry.oscillator.disconnect(); entry.gain.disconnect();
    }
    this.#nodes.clear();
  }
}
