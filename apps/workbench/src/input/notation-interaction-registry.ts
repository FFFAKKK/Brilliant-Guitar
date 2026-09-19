import type { EditIntent } from "./edit-intent.ts";
import type { InputAdapter, InputAdapterOutput } from "./input-adapter.ts";
import type { InputContext, InputNotationKind } from "./input-context.ts";
import type { InputSignal, KeyPressSignal } from "./input-signal.ts";

export type ConcreteNotationKind = Exclude<InputNotationKind, "unknown">;

export interface NotationCompositionStart<Draft> {
  readonly methodId: string;
  readonly draft: Draft;
}

/** One notation plugin owns its input grammar and local interaction policies as one contribution. */
export interface NotationInteractionContribution<Input extends InputContext = InputContext, Draft = unknown,
  Intent extends EditIntent = EditIntent, NavigationContext = unknown, NavigationResult = unknown,
  EditContext = unknown, EditResult = unknown> {
  readonly id: string;
  readonly notationKind: ConcreteNotationKind;
  readonly input: InputAdapter<Input, Draft, Intent>;
  readDraft(composition: unknown): Draft | null;
  startComposition(draft: Draft): NotationCompositionStart<Draft>;
  navigate(signal: KeyPressSignal, context: NavigationContext): NavigationResult | null;
  edit(signal: KeyPressSignal, context: EditContext): EditResult | null;
}

/** Runtime directory populated by installed UI plugins. */
export class NotationInteractionRegistry {
  readonly #byKind = new Map<ConcreteNotationKind, NotationInteractionContribution<any, any, any, any, any, any, any>>();
  readonly #byId = new Map<string, NotationInteractionContribution<any, any, any, any, any, any, any>>();

  register(contribution: NotationInteractionContribution<any, any, any, any, any, any, any>): void {
    if (this.#byId.has(contribution.id)) throw new Error(`Duplicate notation interaction: ${contribution.id}`);
    if (this.#byKind.has(contribution.notationKind)) {
      throw new Error(`Notation interaction already registered: ${contribution.notationKind}`);
    }
    this.#byId.set(contribution.id, contribution);
    this.#byKind.set(contribution.notationKind, contribution);
  }

  hasId(id: string): boolean { return this.#byId.has(id); }
  hasKind(kind: ConcreteNotationKind): boolean { return this.#byKind.has(kind); }
  list(): readonly string[] { return [...this.#byId.keys()]; }

  translate<Input extends InputContext, Draft = unknown, Intent extends EditIntent = EditIntent>(kind: ConcreteNotationKind,
    signal: InputSignal, context: Input): InputAdapterOutput<Draft, Intent> | null {
    const contribution = this.#byKind.get(kind);
    if (!contribution || !contribution.input.canHandle(signal, context)) return null;
    return contribution.input.translate(signal, context) as InputAdapterOutput<Draft, Intent> | null;
  }

  readDraft<Draft>(kind: ConcreteNotationKind, composition: unknown): Draft | null {
    const contribution = this.#byKind.get(kind);
    return contribution ? contribution.readDraft(composition) as Draft | null : null;
  }

  startComposition<Draft>(kind: ConcreteNotationKind, draft: Draft): NotationCompositionStart<Draft> | null {
    const contribution = this.#byKind.get(kind);
    return contribution ? contribution.startComposition(draft) as NotationCompositionStart<Draft> : null;
  }

  navigate<Context, Result>(kind: ConcreteNotationKind, signal: KeyPressSignal, context: Context): Result | null {
    const contribution = this.#byKind.get(kind);
    return contribution ? contribution.navigate(signal, context) as Result | null : null;
  }

  edit<Context, Result>(kind: ConcreteNotationKind, signal: KeyPressSignal, context: Context): Result | null {
    const contribution = this.#byKind.get(kind);
    return contribution ? contribution.edit(signal, context) as Result | null : null;
  }
}
