import { deepFreezeValue } from "../read/deep-freeze";
import type {
  KernelIssue,
  KernelReport,
  KernelReportKind,
} from "./contracts";

export function buildKernelReport<Kind extends KernelReportKind>(
  kind: Kind,
  issues: readonly KernelIssue[],
): KernelReport<Kind> {
  const detachedIssues = deepFreezeValue(structuredClone(issues));
  let issueCount = 0;
  let warningCount = 0;
  let errorCount = 0;
  let fatalCount = 0;

  function increment(value: number): number {
    if (value >= Number.MAX_SAFE_INTEGER) {
      throw new RangeError("kernel report count overflow");
    }
    return value + 1;
  }

  for (const issue of detachedIssues) {
    issueCount = increment(issueCount);
    switch (issue.severity) {
      case "warning":
        warningCount = increment(warningCount);
        break;
      case "error":
        errorCount = increment(errorCount);
        break;
      case "fatal":
        fatalCount = increment(fatalCount);
        break;
    }
  }

  const status =
    fatalCount > 0 || errorCount > 0
      ? "rejected"
      : warningCount > 0
        ? "completed-with-warnings"
        : "completed";

  return deepFreezeValue({
    reportVersion: 1,
    kind,
    status,
    summary: {
      issueCount,
      warningCount,
      errorCount,
      fatalCount,
    },
    issues: detachedIssues,
  });
}
