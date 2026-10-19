import type { EditIntent } from "./edit-intent.ts";
import type { InputAdapterOutput } from "./input-adapter.ts";
import type { InputContext } from "./input-context.ts";
import type { InputSignal, KeyPressSignal } from "./input-signal.ts";
import type { ConcreteNotationKind, NotationInteractionDirectory } from "./notation-interaction-registry.ts";
import { staffInteractionContribution } from "./staff-interaction-contribution.ts";

/** A view binds a kind; it never changes a process-global input mode. */
export function bindNotationInteraction(directory: NotationInteractionDirectory, kind: ConcreteNotationKind) {
  if (!directory.hasKind(kind)) throw new Error(`Notation interaction unavailable: ${kind}`);
  return Object.freeze({
    notationKind: kind,
    translate<Input extends InputContext, Draft = unknown, Intent extends EditIntent<unknown, unknown> = EditIntent>(
      signal: InputSignal, context: Input,
    ): InputAdapterOutput<Draft, Intent> | null {
      return context.notationKind === kind ? directory.translate<Input, Draft, Intent>(kind, signal, context) : null;
    },
    readDraft<Draft>(composition: unknown) { return directory.readDraft<Draft>(kind, composition); },
    startComposition<Draft>(draft: Draft) { return directory.startComposition<Draft>(kind, draft); },
    navigate<Context, Result>(signal: KeyPressSignal, context: Context) {
      return directory.navigate<Context, Result>(kind, signal, context);
    },
    edit<Context, Result>(signal: KeyPressSignal, context: Context) {
      return directory.edit<Context, Result>(kind, signal, context);
    },
  });
}

/** Read facade over the existing registry, scoped to captured package declarations. */
export function scopeNotationInteractions(directory: NotationInteractionDirectory,
  declarations: readonly Readonly<{ id: string; notationKind: ConcreteNotationKind }>[]): NotationInteractionDirectory {
  const allowed = new Map(declarations.map(({ id, notationKind }) => [notationKind, id]));
  const ids = new Set(allowed.values());
  const hasKind = (kind: ConcreteNotationKind) => {
    const id = allowed.get(kind);
    return id !== undefined && directory.hasId(id) && directory.hasKind(kind);
  };
  return Object.freeze({
    hasId: (id: string) => ids.has(id) && directory.hasId(id),
    hasKind,
    list: () => directory.list().filter(id => ids.has(id)),
    translate<Input extends InputContext, Draft = unknown, Intent extends EditIntent<unknown, unknown> = EditIntent>(
      kind: ConcreteNotationKind, signal: InputSignal, context: Input,
    ) {
      return hasKind(kind) && context.notationKind === kind
        ? directory.translate<Input, Draft, Intent>(kind, signal, context) : null;
    },
    readDraft<Draft>(kind: ConcreteNotationKind, composition: unknown) {
      return hasKind(kind) ? directory.readDraft<Draft>(kind, composition) : null;
    },
    startComposition<Draft>(kind: ConcreteNotationKind, draft: Draft) {
      return hasKind(kind) ? directory.startComposition<Draft>(kind, draft) : null;
    },
    navigate<Context, Result>(kind: ConcreteNotationKind, signal: KeyPressSignal, context: Context) {
      return hasKind(kind) ? directory.navigate<Context, Result>(kind, signal, context) : null;
    },
    edit<Context, Result>(kind: ConcreteNotationKind, signal: KeyPressSignal, context: Context) {
      return hasKind(kind) ? directory.edit<Context, Result>(kind, signal, context) : null;
    },
  });
}

/** Pure standalone compatibility preset, not another registry or editing session. */
export const staffInteractionBinding = Object.freeze({
  notationKind: staffInteractionContribution.notationKind,
  translate: staffInteractionContribution.input.translate.bind(staffInteractionContribution.input),
  readDraft: staffInteractionContribution.readDraft,
  startComposition: staffInteractionContribution.startComposition,
  navigate: staffInteractionContribution.navigate,
  edit: staffInteractionContribution.edit,
});
