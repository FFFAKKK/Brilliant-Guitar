import type { WorkbenchFeedback } from "../feedback/workbench-feedback.ts";

export function WorkbenchFeedbackAnnouncer({ feedback }: { readonly feedback: WorkbenchFeedback | null }) {
  return <div className="visually-hidden" aria-live={feedback?.issue.severity === "error" ? "assertive" : "polite"}
    aria-atomic="true">{feedback?.issue.message ?? ""}</div>;
}
