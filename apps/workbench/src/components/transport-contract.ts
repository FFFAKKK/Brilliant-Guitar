/**
 * Public boundary for playback UI.
 *
 * The workbench owns presentation and commands; an audio or MIDI plugin owns
 * clocking, synthesis, and transport execution.
 */
export type TransportState = "stopped" | "playing" | "paused" | "unavailable";

export interface TransportSnapshot {
  readonly state: TransportState;
  readonly position: number;
  readonly loopStart: number | null;
  readonly loopEnd: number | null;
}

export interface TransportCommands {
  readonly play: () => void;
  readonly pause: () => void;
  readonly stop: () => void;
  readonly setPosition: (position: number) => void;
  readonly setLoop: (start: number | null, end: number | null) => void;
}
