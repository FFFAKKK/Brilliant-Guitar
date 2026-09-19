import type { EventProperties, InputContent, InputDuration, InputPitch } from "../contracts/note-input.ts";
import { advancePitchEntry } from "./pitch-entry.ts";
import type { PitchDraft } from "./pitch-entry.ts";
import type { EditIntent } from "../input/edit-intent.ts";
import type { InputAdapter, InputAdapterOutput } from "../input/input-adapter.ts";
import type { InputContext } from "../input/input-context.ts";
import type { InputSignal, PointerLocateSignal, PointerSelectSignal } from "../input/input-signal.ts";
import type { EditComposition } from "./editor-machine.ts";
import type { ScoreEditPoint } from "./score-navigation.ts";

export interface StaffEventDraft {
  readonly duration: InputDuration;
  readonly content: InputContent;
}

export type StaffEditIntent = EditIntent<StaffEventDraft, EventProperties>;
export type StaffInsertIntent = Extract<StaffEditIntent, { readonly kind: "insert-event" }>;

export interface StaffPointerPosition {
  readonly point: ScoreEditPoint;
  readonly pitch: InputPitch;
}

export type StaffPointerSignal = PointerLocateSignal<StaffPointerPosition> | PointerSelectSignal<string>;

export interface StaffInputContext extends InputContext {
  readonly composition: EditComposition<NonNullable<PitchDraft>>;
  readonly duration: InputDuration;
  readonly rest: boolean;
  resolveAlter(pitch: Pick<InputPitch, "step" | "octave">): InputPitch["alter"];
}

export type StaffInputOutput = InputAdapterOutput<NonNullable<PitchDraft>, StaffInsertIntent>;

export const STAFF_PITCH_COMPOSITION = "notation.staff.pitch";

/** Five-line staff grammar stays behind this adapter boundary. */
export const staffInputAdapter: InputAdapter<StaffInputContext, NonNullable<PitchDraft>, StaffInsertIntent> & {
  readonly compositionMethodId: typeof STAFF_PITCH_COMPOSITION;
  draft(composition: EditComposition<NonNullable<PitchDraft>>): PitchDraft;
  advance(draft: PitchDraft, key: string, repeat?: boolean): ReturnType<typeof advancePitchEntry>;
} = {
  id: "notation.staff",
  compositionMethodId: STAFF_PITCH_COMPOSITION,
  canHandle(signal, context) {
    return context.notationKind === "staff" && signal.kind === "key-press";
  },
  translate(signal: InputSignal, context: StaffInputContext): StaffInputOutput | null {
    if (!this.canHandle(signal, context) || signal.kind !== "key-press") return null;
    const result = advancePitchEntry(this.draft(context.composition), signal.key, signal.repeat);
    if (!result.handled) return { kind: "ignored" };
    if (signal.repeat) return { kind: "ignored", handled: true };
    if (result.draft) {
      return { kind: "compose", methodId: STAFF_PITCH_COMPOSITION, draft: result.draft,
        ...(result.message ? { message: result.message } : {}) };
    }
    if (result.pitch) {
      const pitch = { ...result.pitch, alter: context.resolveAlter(result.pitch) };
      return { kind: "intent", intent: { kind: "insert-event",
        event: { duration: context.duration, content: { kind: "note", pitch } } } };
    }
    if (result.rest) {
      return { kind: "intent", intent: { kind: "insert-event",
        event: { duration: context.duration, content: { kind: "rest" } } } };
    }
    return { kind: "cancel-composition", ...(result.message ? { message: result.message } : {}) };
  },
  draft(composition: EditComposition<NonNullable<PitchDraft>>): PitchDraft {
    return composition.kind === "composing" && composition.methodId === STAFF_PITCH_COMPOSITION
      ? composition.draft : null;
  },
  advance(draft: PitchDraft, key: string, repeat = false) {
    return advancePitchEntry(draft, key, repeat);
  },
};
