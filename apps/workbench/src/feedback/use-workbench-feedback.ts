import { useCallback, useMemo, useRef, useState } from "react";
import type { WorkbenchIssue } from "../contracts/workbench-issue.ts";
import { WorkbenchDiagnosticLog } from "./diagnostic-log.ts";
import { adaptWorkbenchIssue } from "./workbench-feedback.ts";
import type { WorkbenchFeedback, WorkbenchFeedbackContext } from "./workbench-feedback.ts";

export interface WorkbenchFeedbackCoordinator {
  readonly latest: WorkbenchFeedback | null;
  report(issue: WorkbenchIssue, context?: WorkbenchFeedbackContext): WorkbenchFeedback;
  clear(feedback?: WorkbenchFeedback | null): void;
  diagnostics(): readonly ReturnType<WorkbenchDiagnosticLog["list"]>[number][];
}

export function useWorkbenchFeedback(): WorkbenchFeedbackCoordinator {
  const [latest, setLatest] = useState<WorkbenchFeedback | null>(null);
  const sequence = useRef(0);
  const log = useRef(new WorkbenchDiagnosticLog());
  const report = useCallback((issue: WorkbenchIssue, context: WorkbenchFeedbackContext = {}) => {
    sequence.current += 1;
    const feedback = adaptWorkbenchIssue(issue, context, sequence.current);
    log.current.append({ sequence: feedback.sequence, occurredAt: Date.now(), issue });
    setLatest(feedback);
    return feedback;
  }, []);
  const clear = useCallback((feedback?: WorkbenchFeedback | null) => {
    setLatest((current) => !feedback || current?.sequence === feedback.sequence ? null : current);
  }, []);
  const diagnostics = useCallback(() => log.current.list(), []);
  return useMemo(() => ({ latest, report, clear, diagnostics }), [clear, diagnostics, latest, report]);
}
