import type { KernelIssueCode } from "../reports/contracts";

export type SeverityForCode<Code extends KernelIssueCode> =
  Code extends `unsupported.${string}`
    ? "warning"
    : Code extends
          | `${string}.internal-error`
          | `${string}.invariant-violation`
      ? "fatal"
      : "error";

export function severityForKernelIssueCode<Code extends KernelIssueCode>(
  code: Code,
): SeverityForCode<Code> {
  if (code.startsWith("unsupported.")) {
    return "warning" as SeverityForCode<Code>;
  }
  if (
    code.endsWith(".internal-error") ||
    code.endsWith(".invariant-violation")
  ) {
    return "fatal" as SeverityForCode<Code>;
  }
  return "error" as SeverityForCode<Code>;
}

export function messageKeyForKernelIssueCode<Code extends KernelIssueCode>(
  code: Code,
): `core.${Code}` {
  return `core.${code}`;
}
