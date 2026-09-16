const WORKSPACE_ID = /^[a-f0-9-]{36}$/i;

export function isWorkspaceId(value: unknown): value is string {
  return typeof value === "string" && WORKSPACE_ID.test(value);
}
