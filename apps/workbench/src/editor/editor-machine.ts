export type EditTarget<Point> =
  | { readonly kind: "unavailable" }
  | { readonly kind: "caret"; readonly point: Point }
  | { readonly kind: "event"; readonly eventId: string; readonly point: Point };

export type EditComposition<Draft> =
  | { readonly kind: "idle" }
  | { readonly kind: "composing"; readonly methodId: string; readonly draft: Draft };

export type EditOperationKind = "insert" | "update" | "delete" | "history" | "document";

export type EditTransaction =
  | { readonly kind: "idle" }
  | { readonly kind: "applying"; readonly operation: EditOperationKind; readonly requestId: string }
  | { readonly kind: "failed"; readonly operation: EditOperationKind; readonly requestId: string;
      readonly retryable: boolean };

export interface EditorState<Point, Draft> {
  readonly target: EditTarget<Point>;
  readonly composition: EditComposition<Draft>;
  readonly transaction: EditTransaction;
}

export interface EventDraft<Duration, Content> {
  readonly duration: Duration;
  readonly content: Content;
}

export type EditIntent<Event, Properties> =
  | { readonly kind: "insert"; readonly event: Event }
  | { readonly kind: "update"; readonly eventId: string; readonly properties: Properties }
  | { readonly kind: "delete"; readonly eventId: string };

export type EditorEvent<Point, Draft> =
  | { readonly type: "reset"; readonly point: Point | null }
  | { readonly type: "locate"; readonly point: Point }
  | { readonly type: "select"; readonly eventId: string; readonly point: Point }
  | { readonly type: "point-updated"; readonly point: Point }
  | { readonly type: "compose"; readonly methodId: string; readonly draft: Draft }
  | { readonly type: "cancel-composition" }
  | { readonly type: "submit"; readonly operation: EditOperationKind; readonly requestId: string }
  | { readonly type: "commit"; readonly requestId: string; readonly target?: EditTarget<Point> }
  | { readonly type: "reject"; readonly requestId: string; readonly retryable: boolean }
  | { readonly type: "retry"; readonly requestId: string }
  | { readonly type: "dismiss-failure" };

export function initialEditorState<Point, Draft>(point: Point | null): EditorState<Point, Draft> {
  return { target: point ? { kind: "caret", point } : { kind: "unavailable" },
    composition: { kind: "idle" }, transaction: { kind: "idle" } };
}

/** The editor owns interaction state. The kernel remains the owner of score data. */
export function transitionEditor<Point, Draft>(state: EditorState<Point, Draft>, event: EditorEvent<Point, Draft>): EditorState<Point, Draft> {
  switch (event.type) {
    case "reset": return initialEditorState(event.point);
    case "locate": return state.transaction.kind === "applying" || (state.transaction.kind === "failed" && state.transaction.retryable)
      ? state : { ...state, target: { kind: "caret", point: event.point }, composition: { kind: "idle" },
      transaction: state.transaction.kind === "failed" && !state.transaction.retryable ? { kind: "idle" } : state.transaction };
    case "select": return state.transaction.kind === "applying" || (state.transaction.kind === "failed" && state.transaction.retryable)
      ? state : { ...state, target: { kind: "event", eventId: event.eventId, point: event.point },
      composition: { kind: "idle" },
      transaction: state.transaction.kind === "failed" && !state.transaction.retryable ? { kind: "idle" } : state.transaction };
    case "point-updated": return state.target.kind === "unavailable" || state.transaction.kind === "applying"
      || (state.transaction.kind === "failed" && state.transaction.retryable) ? state
      : { ...state, target: { ...state.target, point: event.point } };
    case "compose": return state.target.kind === "unavailable" || state.transaction.kind !== "idle" ? state
      : { ...state, composition: { kind: "composing", methodId: event.methodId, draft: event.draft } };
    case "cancel-composition": return { ...state, composition: { kind: "idle" } };
    case "submit": return (state.target.kind === "unavailable" && event.operation !== "history" && event.operation !== "document")
      || state.transaction.kind === "applying"
      || (state.transaction.kind === "failed" && state.transaction.retryable) ? state
      : { ...state, composition: { kind: "idle" },
        transaction: { kind: "applying", operation: event.operation, requestId: event.requestId } };
    case "commit": return state.transaction.kind === "applying" && state.transaction.requestId === event.requestId
      ? { ...state, target: event.target ?? state.target, transaction: { kind: "idle" } } : state;
    case "reject": return state.transaction.kind === "applying" && state.transaction.requestId === event.requestId
      ? { ...state, transaction: { kind: "failed", operation: state.transaction.operation,
        requestId: event.requestId, retryable: event.retryable } } : state;
    case "retry": return state.transaction.kind === "failed" && state.transaction.retryable
      && state.transaction.requestId === event.requestId
      ? { ...state, transaction: { kind: "applying", operation: state.transaction.operation,
        requestId: event.requestId } } : state;
    case "dismiss-failure": return state.transaction.kind === "failed" && !state.transaction.retryable
      ? { ...state, transaction: { kind: "idle" } } : state;
  }
}
