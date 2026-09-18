import type { PlaybackEngine } from "./playback-engine.ts";
import { WebAudioPlaybackEngine } from "./playback-engine.ts";

export type PlaybackOutputKind = "builtin-synth" | "sample-bank" | "midi-out";
export type PlaybackSampleBankFormat = "sf2" | "sf3";

export interface PlaybackOutputDiagnostic {
  readonly code: string;
  readonly message: string;
}

export interface PlaybackOutputDescriptor {
  readonly id: string;
  readonly kind: PlaybackOutputKind;
  readonly label: string;
  readonly available: boolean;
  readonly diagnostic: PlaybackOutputDiagnostic | null;
  readonly resourceId: string | null;
}

export interface PlaybackSampleBankResource {
  readonly id: string;
  readonly name: string;
  readonly format: PlaybackSampleBankFormat;
  readonly sizeBytes: number;
  readonly outputId: string;
}

export interface PlaybackOutputSnapshot {
  readonly activeId: string;
  readonly outputs: readonly PlaybackOutputDescriptor[];
  readonly sampleBanks: readonly PlaybackSampleBankResource[];
  readonly pending: boolean;
  readonly diagnostic: PlaybackOutputDiagnostic | null;
}

export interface LocalSampleBankFile {
  readonly name: string;
  readonly size: number;
  readonly lastModified: number;
  slice(start?: number, end?: number): Blob;
}

interface PlaybackOutputRegistration {
  readonly descriptor: PlaybackOutputDescriptor;
  createEngine(): PlaybackEngine;
}

export interface PlaybackOutputSelectionResult {
  readonly ok: boolean;
  readonly diagnostic: PlaybackOutputDiagnostic | null;
}

const BUILTIN_OUTPUT_ID = "builtin-synth";
const MAX_SAMPLE_BANK_BYTES = 512 * 1024 * 1024;
const SOUNDFONT_ENGINE_PENDING: PlaybackOutputDiagnostic = {
  code: "playback.soundfont-engine-pending",
  message: "音源文件已识别，SoundFont 采样播放引擎将在下一阶段接入",
};

const builtinRegistration = (): PlaybackOutputRegistration => ({
  descriptor: {
    id: BUILTIN_OUTPUT_ID,
    kind: "builtin-synth",
    label: "内置合成器",
    available: true,
    diagnostic: null,
    resourceId: null,
  },
  createEngine: () => new WebAudioPlaybackEngine(),
});

function extension(name: string): string {
  const index = name.lastIndexOf(".");
  return index < 0 ? "" : name.slice(index + 1).toLowerCase();
}

function isSoundFontHeader(bytes: Uint8Array): boolean {
  return bytes.length >= 12
    && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF"
    && String.fromCharCode(...bytes.slice(8, 12)) === "sfbk";
}

function resourceId(file: LocalSampleBankFile): string {
  const normalizedName = file.name.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-");
  return `soundfont:${normalizedName}:${file.size}:${file.lastModified}`;
}

/** Host-owned output registry. UI components only consume its projection and actions. */
export class PlaybackOutputRegistry {
  readonly #listeners = new Set<() => void>();
  readonly #registrations = new Map<string, PlaybackOutputRegistration>();
  readonly #resources = new Map<string, PlaybackSampleBankResource>();
  #activeId = BUILTIN_OUTPUT_ID;
  #pending = false;
  #diagnostic: PlaybackOutputDiagnostic | null = null;
  #snapshot: PlaybackOutputSnapshot;

  constructor(registrations: readonly PlaybackOutputRegistration[] = [builtinRegistration()]) {
    for (const registration of registrations) this.#registrations.set(registration.descriptor.id, registration);
    if (!this.#registrations.has(BUILTIN_OUTPUT_ID)) throw new Error("Playback output registry requires the built-in synthesizer");
    this.#snapshot = this.#buildSnapshot();
  }

  getSnapshot = (): PlaybackOutputSnapshot => this.#snapshot;
  subscribe = (listener: () => void): (() => void) => { this.#listeners.add(listener); return () => this.#listeners.delete(listener); };

  #buildSnapshot(): PlaybackOutputSnapshot {
    return Object.freeze({
      activeId: this.#activeId,
      outputs: Object.freeze([...this.#registrations.values()].map((registration) => registration.descriptor)),
      sampleBanks: Object.freeze([...this.#resources.values()]),
      pending: this.#pending,
      diagnostic: this.#diagnostic,
    });
  }

  #publish(): void {
    this.#snapshot = this.#buildSnapshot();
    for (const listener of this.#listeners) listener();
  }

  createEngine(): PlaybackEngine {
    const registration = this.#registrations.get(this.#activeId);
    if (!registration || !registration.descriptor.available) throw new Error("当前播放输出不可用");
    return registration.createEngine();
  }

  async select(id: string): Promise<PlaybackOutputSelectionResult> {
    const registration = this.#registrations.get(id);
    if (!registration) {
      const diagnostic = { code: "playback.output-not-found", message: "找不到这个播放输出" } as const;
      this.#diagnostic = diagnostic; this.#publish();
      return { ok: false, diagnostic };
    }
    if (!registration.descriptor.available) {
      const diagnostic = registration.descriptor.diagnostic
        ?? { code: "playback.output-unavailable", message: "这个播放输出当前不可用" };
      this.#diagnostic = diagnostic; this.#publish();
      return { ok: false, diagnostic };
    }
    this.#activeId = id; this.#diagnostic = null; this.#publish();
    return { ok: true, diagnostic: null };
  }

  async importSoundFont(file: LocalSampleBankFile): Promise<PlaybackOutputSelectionResult> {
    if (this.#pending) return { ok: false, diagnostic: this.#diagnostic };
    this.#pending = true; this.#diagnostic = null; this.#publish();
    try {
      const fileExtension = extension(file.name);
      if (fileExtension !== "sf2" && fileExtension !== "sf3") {
        const diagnostic = { code: "playback.soundfont-format-unsupported", message: "第一版仅接收 SF2 / SF3 音源" } as const;
        this.#diagnostic = diagnostic;
        return { ok: false, diagnostic };
      }
      if (file.size < 12 || file.size > MAX_SAMPLE_BANK_BYTES) {
        const diagnostic = { code: "playback.soundfont-size-invalid", message: "音源文件大小无效或超过 512 MB" } as const;
        this.#diagnostic = diagnostic;
        return { ok: false, diagnostic };
      }
      const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
      if (!isSoundFontHeader(header)) {
        const diagnostic = { code: "playback.soundfont-invalid", message: "文件不是有效的 SoundFont 音源" } as const;
        this.#diagnostic = diagnostic;
        return { ok: false, diagnostic };
      }
      const id = resourceId(file);
      if (!this.#resources.has(id)) {
        const outputId = `sample-bank:${id}`;
        this.#resources.set(id, { id, name: file.name, format: fileExtension, sizeBytes: file.size, outputId });
        this.#registrations.set(outputId, {
          descriptor: { id: outputId, kind: "sample-bank", label: file.name, available: false,
            diagnostic: SOUNDFONT_ENGINE_PENDING, resourceId: id },
          createEngine: () => { throw new Error(SOUNDFONT_ENGINE_PENDING.message); },
        });
      }
      this.#diagnostic = null;
      return { ok: true, diagnostic: null };
    } catch (error) {
      const diagnostic = { code: "playback.soundfont-read-failed",
        message: error instanceof Error ? error.message : "无法读取 SoundFont 音源" } as const;
      this.#diagnostic = diagnostic;
      return { ok: false, diagnostic };
    } finally {
      this.#pending = false; this.#publish();
    }
  }

  removeSampleBank(id: string): void {
    const resource = this.#resources.get(id);
    if (!resource) return;
    if (this.#activeId === resource.outputId) this.#activeId = BUILTIN_OUTPUT_ID;
    this.#resources.delete(id); this.#registrations.delete(resource.outputId);
    this.#diagnostic = null; this.#publish();
  }
}

export function createPlaybackOutputRegistry(): PlaybackOutputRegistry {
  return new PlaybackOutputRegistry();
}
