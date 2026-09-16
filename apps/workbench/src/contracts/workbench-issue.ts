export type WorkbenchIssueSeverity = "info" | "warning" | "error";
export type WorkbenchIssueSource = "core" | "editor" | "host" | "bridge" | "file" | "renderer";

export type WorkbenchIssueTarget =
  | { readonly scope: "measure"; readonly measureId: string; readonly eventId?: string }
  | { readonly scope: "event"; readonly measureId: string; readonly eventId: string }
  | { readonly scope: "component"; readonly componentId: string }
  | { readonly scope: "workbench" };

/** Serializable diagnostic contract shared by the host bridge and the UI adapter. */
export interface WorkbenchIssue {
  readonly code: string;
  readonly message: string;
  readonly severity: WorkbenchIssueSeverity;
  readonly source: WorkbenchIssueSource;
  readonly target: WorkbenchIssueTarget;
  readonly retryable?: boolean;
}

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export function isWorkbenchIssue(value: unknown): value is WorkbenchIssue {
  if (!record(value) || typeof value.code !== "string" || !value.code
    || typeof value.message !== "string" || !value.message
    || !["info", "warning", "error"].includes(value.severity as string)
    || !["core", "editor", "host", "bridge", "file", "renderer"].includes(value.source as string)
    || !record(value.target)
    || (value.retryable !== undefined && typeof value.retryable !== "boolean")) return false;
  const target = value.target;
  if (target.scope === "workbench") return true;
  if (target.scope === "component") return typeof target.componentId === "string" && !!target.componentId;
  if (target.scope === "measure") return typeof target.measureId === "string" && !!target.measureId
    && (target.eventId === undefined || typeof target.eventId === "string");
  return target.scope === "event" && typeof target.measureId === "string" && !!target.measureId
    && typeof target.eventId === "string" && !!target.eventId;
}
