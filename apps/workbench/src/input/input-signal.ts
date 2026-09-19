export type InputModifier = "shift" | "ctrl" | "meta" | "alt";

export interface PointerLocateSignal<Position = unknown> {
  readonly kind: "pointer-locate";
  readonly position: Position;
  readonly writeNow: boolean;
}

export interface PointerSelectSignal<Target = unknown> {
  readonly kind: "pointer-select";
  readonly target: Target;
  readonly extend: boolean;
}

export interface KeyPressSignal {
  readonly kind: "key-press";
  readonly key: string;
  readonly modifiers: readonly InputModifier[];
  readonly repeat: boolean;
}

export interface ControlChangeSignal<Value = unknown> {
  readonly kind: "control-change";
  readonly control: string;
  readonly value: Value;
}

/** Normalized user input. It intentionally contains no kernel action names. */
export type InputSignal =
  | PointerLocateSignal
  | PointerSelectSignal
  | KeyPressSignal
  | ControlChangeSignal
  | { readonly kind: "navigate"; readonly direction: "left" | "right" | "up" | "down" }
  | { readonly kind: "jump"; readonly edge: "measure-start" | "measure-end" | "score-start" | "score-end" }
  | { readonly kind: "external-note"; readonly pitch: unknown; readonly velocity?: number };

export function keyPressSignal(source: Pick<KeyboardEvent, "key" | "shiftKey" | "ctrlKey" | "metaKey" | "altKey" | "repeat">): KeyPressSignal {
  const modifiers: InputModifier[] = [];
  if (source.shiftKey) modifiers.push("shift");
  if (source.ctrlKey) modifiers.push("ctrl");
  if (source.metaKey) modifiers.push("meta");
  if (source.altKey) modifiers.push("alt");
  return { kind: "key-press", key: source.key, modifiers, repeat: source.repeat };
}

export function pointerLocateSignal<Position>(position: Position, writeNow: boolean): PointerLocateSignal<Position> {
  return { kind: "pointer-locate", position, writeNow };
}

export function pointerSelectSignal<Target>(target: Target, extend = false): PointerSelectSignal<Target> {
  return { kind: "pointer-select", target, extend };
}

export function controlChangeSignal<Value extends { readonly kind: string }>(value: Value): ControlChangeSignal<Value> {
  return { kind: "control-change", control: value.kind, value };
}
