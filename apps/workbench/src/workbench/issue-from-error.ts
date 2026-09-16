import { isWorkbenchIssue } from "../contracts/workbench-issue.ts";
import type { WorkbenchIssue } from "../contracts/workbench-issue.ts";

export function issueFromError(error: unknown, fallback: WorkbenchIssue): WorkbenchIssue {
  if (error instanceof Error && "issue" in error && isWorkbenchIssue(error.issue)) return error.issue;
  return { ...fallback, message: error instanceof Error && error.message ? error.message : fallback.message };
}
