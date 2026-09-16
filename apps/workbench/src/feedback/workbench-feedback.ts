import type { WorkbenchIssue, WorkbenchIssueTarget } from "../contracts/workbench-issue.ts";

export type WorkbenchFeedbackEffect = "measure-pulse" | "event-reject" | "component-indicator" | "workbench-status";

export interface WorkbenchFeedbackContext {
  readonly measureId?: string;
  readonly eventId?: string;
  readonly componentId?: string;
}

export interface WorkbenchFeedback {
  readonly issue: WorkbenchIssue;
  readonly target: WorkbenchIssueTarget;
  readonly effect: WorkbenchFeedbackEffect;
  readonly sequence: number;
}

function fallbackTarget(context: WorkbenchFeedbackContext): WorkbenchIssueTarget {
  if (context.eventId && context.measureId) return { scope: "event", measureId: context.measureId, eventId: context.eventId };
  if (context.measureId) return { scope: "measure", measureId: context.measureId };
  if (context.componentId) return { scope: "component", componentId: context.componentId };
  return { scope: "workbench" };
}

/** The adapter owns visual semantics; transport and Core diagnostics never name CSS effects. */
export function adaptWorkbenchIssue(issue: WorkbenchIssue, context: WorkbenchFeedbackContext, sequence: number): WorkbenchFeedback {
  void context;
  const target = issue.target;
  const effect: WorkbenchFeedbackEffect = target.scope === "event" ? "event-reject"
    : target.scope === "measure" ? "measure-pulse"
    : target.scope === "component" ? "component-indicator" : "workbench-status";
  return { issue, target, effect, sequence };
}

export function localWorkbenchIssue(message: string, context: WorkbenchFeedbackContext,
  options: { readonly code?: string; readonly retryable?: boolean; readonly source?: WorkbenchIssue["source"] } = {}): WorkbenchIssue {
  return {
    code: options.code ?? "editor.operation-failed",
    message,
    severity: "error",
    source: options.source ?? "editor",
    target: fallbackTarget(context),
    ...(options.retryable === undefined ? {} : { retryable: options.retryable }),
  };
}
