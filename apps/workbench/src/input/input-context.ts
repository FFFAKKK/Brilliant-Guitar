export type InputFocusScope = "global" | "score" | "component" | "field";
export type InputTargetKind = "unavailable" | "caret" | "event" | "range";
export type InputNotationKind = "staff" | "tablature" | "numbered" | "unknown";
export type InputCapability = "locate" | "navigate" | "compose" | "insert" | "update" | "delete" | "paste" | "history";

/** Context shared by every input source before it becomes an edit intent. */
export interface InputContext {
  readonly focusScope: InputFocusScope;
  readonly target: InputTargetKind;
  readonly notationKind: InputNotationKind;
  readonly capabilities: readonly InputCapability[];
  readonly composing: boolean;
}

