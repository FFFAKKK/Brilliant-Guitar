import type { InputContext } from "./input-context.ts";
import type { InputSignal } from "./input-signal.ts";
import type { EditIntent } from "./edit-intent.ts";

export type InputAdapterOutput<Draft = unknown, Intent extends EditIntent = EditIntent> =
  | { readonly kind: "ignored"; readonly handled?: boolean }
  | { readonly kind: "compose"; readonly methodId: string; readonly draft: Draft; readonly message?: string }
  | { readonly kind: "cancel-composition"; readonly message?: string }
  | { readonly kind: "intent"; readonly intent: Intent };

/** A notation or external-input plugin translates signals into shared editing output. */
export interface InputAdapter<SignalContext extends InputContext = InputContext, Draft = unknown,
  Intent extends EditIntent = EditIntent> {
  readonly id: string;
  canHandle(signal: InputSignal, context: SignalContext): boolean;
  translate(signal: InputSignal, context: SignalContext): InputAdapterOutput<Draft, Intent> | null;
}
