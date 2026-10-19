import { isFrettedDimensions, isFrettedPosition } from "../tablature-model.ts";
import type { FrettedDimensions, FrettedPosition, FrettedPositionProperties } from "../tablature-model.ts";
import type { EditIntent } from "./edit-intent.ts";
import type { EditComposition } from "./editor-machine.ts";
import type { InputAdapterOutput } from "./input-adapter.ts";
import type { InputContext } from "./input-context.ts";
import type { KeyPressSignal } from "./input-signal.ts";
import type { NotationInteractionContribution } from "./notation-interaction-registry.ts";

export const TABLATURE_FRET_COMPOSITION = "notation.tablature.fret";
export interface FretDraft {
  readonly eventId: string;
  readonly stringNumber: number;
  readonly maxFret: number;
  readonly digits: string;
}
export type TablaturePositionIntent = Extract<EditIntent<never, FrettedPositionProperties>, { readonly kind: "update-event" }>;
export interface TablatureInputContext extends InputContext, FrettedDimensions {
  readonly eventId: string;
  readonly stringNumber: number;
  readonly currentPosition: FrettedPosition | null;
  readonly composition: EditComposition<FretDraft>;
}
export interface TablatureStringNavigation {
  readonly stringNumber: number;
  readonly cancelComposition: true;
}
type Output = InputAdapterOutput<FretDraft, TablaturePositionIntent>;

function readFretDraft(composition: unknown): FretDraft | null {
  if (typeof composition !== "object" || composition === null) return null;
  const source = composition as Record<string, unknown>;
  if (source.kind !== "composing" || source.methodId !== TABLATURE_FRET_COMPOSITION
    || typeof source.draft !== "object" || source.draft === null) return null;
  const draft = source.draft as Record<string, unknown>;
  return typeof draft.eventId === "string" && !!draft.eventId
    && typeof draft.stringNumber === "number" && Number.isSafeInteger(draft.stringNumber)
    && draft.stringNumber >= 1 && draft.stringNumber <= 32
    && typeof draft.maxFret === "number" && Number.isSafeInteger(draft.maxFret) && draft.maxFret >= 0
    && typeof draft.digits === "string" && draft.digits.length <= 16 && /^(0|[1-9][0-9]*)$/.test(draft.digits)
    && Number.isSafeInteger(Number(draft.digits)) && Number(draft.digits) <= draft.maxFret
    ? { eventId: draft.eventId, stringNumber: draft.stringNumber, maxFret: draft.maxFret, digits: draft.digits } : null;
}

function available(context: TablatureInputContext): boolean {
  return context.notationKind === "tablature" && context.focusScope === "score" && context.target === "event"
    && typeof context.eventId === "string" && !!context.eventId
    && isFrettedPosition({ stringNumber: context.stringNumber, fret: 0 }, context);
}
function positionIntent(eventId: string, position: FrettedPosition): TablaturePositionIntent {
  return { kind: "update-event", eventId, properties: { kind: "fretted-position", position } };
}

/** Shared numeric grammar. Pitch calculation and mutation are deliberately absent. */
export const tablatureInteractionContribution: NotationInteractionContribution<TablatureInputContext, FretDraft,
  TablaturePositionIntent, TablatureInputContext, TablatureStringNavigation, TablatureInputContext, TablaturePositionIntent> = {
  id: "notation.tablature.interaction",
  notationKind: "tablature",
  input: {
    id: "notation.tablature",
    canHandle: (signal, context) => signal.kind === "key-press" && !signal.modifiers.length
      && available(context) && context.capabilities.includes("update") && context.capabilities.includes("compose"),
    translate(signal, context): Output | null {
      if (signal.kind !== "key-press" || signal.modifiers.length || !available(context)
        || !context.capabilities.includes("update") || !context.capabilities.includes("compose")) return null;
      const digit = /^[0-9]$/.test(signal.key);
      const recognized = digit || ["Enter", "Escape", "Backspace"].includes(signal.key);
      if (!recognized) return { kind: "ignored" };
      if (signal.repeat) return { kind: "ignored", handled: true };
      const draft = readFretDraft(context.composition), maxFret = Number.MAX_SAFE_INTEGER - context.capoFret;
      if (context.composition.kind === "composing" && (!draft || draft.eventId !== context.eventId
        || draft.stringNumber !== context.stringNumber || draft.maxFret !== maxFret)) {
        return { kind: "cancel-composition", message: "弦品输入目标已改变" };
      }
      if (signal.key === "Escape") return draft ? { kind: "cancel-composition" } : { kind: "ignored" };
      if (signal.key === "Enter") return draft
        ? { kind: "intent", intent: positionIntent(context.eventId, { stringNumber: draft.stringNumber, fret: Number(draft.digits) }) }
        : { kind: "ignored" };
      if (signal.key === "Backspace" && !draft) return { kind: "ignored" };
      const digits = signal.key === "Backspace" ? draft!.digits.slice(0, -1)
        : draft?.digits === "0" ? signal.key : (draft?.digits ?? "") + signal.key;
      if (!digits) return { kind: "cancel-composition" };
      if (digits.length > 16 || !Number.isSafeInteger(Number(digits)) || Number(digits) > maxFret) {
        // Never let Enter after an invalid suffix silently commit the previous digit.
        return { kind: "cancel-composition", message: "品位超出当前范围" };
      }
      return { kind: "compose", methodId: TABLATURE_FRET_COMPOSITION,
        draft: { eventId: context.eventId, stringNumber: context.stringNumber, maxFret, digits } };
    },
  },
  readDraft: readFretDraft,
  startComposition(draft) {
    const checked = readFretDraft({ kind: "composing", methodId: TABLATURE_FRET_COMPOSITION, draft });
    if (!checked) throw new Error("Invalid tablature fret draft");
    return { methodId: TABLATURE_FRET_COMPOSITION, draft: checked };
  },
  navigate(signal: KeyPressSignal, context) {
    if (signal.modifiers.length || !available(context) || !context.capabilities.includes("navigate")
      || !isFrettedDimensions(context)) return null;
    const delta = signal.key === "ArrowUp" ? -1 : signal.key === "ArrowDown" ? 1 : 0;
    const stringNumber = context.stringNumber + delta;
    return delta && stringNumber >= 1 && stringNumber <= context.stringCount
      ? { stringNumber, cancelComposition: true } : null;
  },
  edit(signal, context) {
    const modifiersAllowed = !signal.modifiers.length
      || (signal.key === "+" && signal.modifiers.every(modifier => modifier === "shift"));
    if (signal.repeat || !modifiersAllowed || !available(context) || !context.capabilities.includes("update")
      || context.composition.kind !== "idle" || !isFrettedPosition(context.currentPosition, context)) return null;
    const delta = signal.key === "+" ? 1 : signal.key === "-" ? -1 : 0;
    const position = { ...context.currentPosition, fret: context.currentPosition.fret + delta };
    return delta && isFrettedPosition(position, context) ? positionIntent(context.eventId, position) : null;
  },
};
