export interface ToolActivity {
  readonly invocationId: string;
  readonly turnId: string;
  readonly label: string;
  readonly status: "running" | "completed" | "failed" | "cancelled";
  readonly startedAt: number;
  readonly finishedAt: number | null;
  readonly errorCode: string | null;
}
export interface ToolActivitiesSnapshot { readonly runId: string | null; readonly items: readonly ToolActivity[] }
export const MAX_TOOL_ACTIVITIES = 64;

export function isToolActivitiesSnapshot(value: unknown): value is ToolActivitiesSnapshot {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  if (Object.keys(item).length !== 2 || !Object.hasOwn(item, "runId") || !Object.hasOwn(item, "items")
    || (item.runId !== null && (typeof item.runId !== "string" || !item.runId.length))
    || !Array.isArray(item.items) || item.items.length > MAX_TOOL_ACTIVITIES || (item.runId === null && item.items.length > 0)) return false;
  const ids = new Set<string>();
  return item.items.every((value: unknown) => {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
    const activity = value as Record<string, unknown>;
    const expected = ["invocationId", "turnId", "label", "status", "startedAt", "finishedAt", "errorCode"];
    if (Object.keys(activity).length !== expected.length || !Object.keys(activity).every((key) => expected.includes(key))
      || typeof activity.invocationId !== "string" || !activity.invocationId.length || ids.has(activity.invocationId)
      || typeof activity.turnId !== "string" || !activity.turnId.length || typeof activity.label !== "string" || !activity.label.length
      || !["running", "completed", "failed", "cancelled"].includes(String(activity.status))
      || !Number.isSafeInteger(activity.startedAt) || Number(activity.startedAt) < 0
      || (activity.finishedAt !== null && (!Number.isSafeInteger(activity.finishedAt) || Number(activity.finishedAt) < Number(activity.startedAt)))
      || (activity.errorCode !== null && typeof activity.errorCode !== "string")
      || (activity.status === "running" ? activity.finishedAt !== null : activity.finishedAt === null)) return false;
    ids.add(activity.invocationId); return true;
  });
}
