import { useCallback, useMemo, useRef, useState } from "react";
import type { WorkbenchIssue } from "../contracts/workbench-issue.ts";

export type WorkbenchOperationStatus = "running" | "blocked" | "failed" | "recovering";

export interface WorkbenchOperation {
  readonly token: string;
  readonly id: string;
  readonly owner: string;
  readonly status: WorkbenchOperationStatus;
  readonly startedAt: number;
  readonly issue?: WorkbenchIssue;
}

export interface WorkbenchOperationController {
  readonly operations: readonly WorkbenchOperation[];
  readonly busy: boolean;
  readonly blocked: boolean;
  begin(id: string, owner: string): string;
  finish(token: string): void;
  fail(token: string, issue: WorkbenchIssue, blocked?: boolean): void;
  recover(token: string): void;
}

export type WorkbenchOperationAction =
  | { readonly type: "begin"; readonly operation: WorkbenchOperation }
  | { readonly type: "finish"; readonly token: string }
  | { readonly type: "fail"; readonly token: string; readonly issue: WorkbenchIssue; readonly blocked: boolean }
  | { readonly type: "recover"; readonly token: string };

/** Pure transition layer so every async workbench task follows the same lifecycle. */
export function reduceWorkbenchOperations(current: readonly WorkbenchOperation[], action: WorkbenchOperationAction): readonly WorkbenchOperation[] {
  if (action.type === "begin") return [...current.filter((item) =>
    item.id !== action.operation.id || item.owner !== action.operation.owner), action.operation];
  if (action.type === "finish") return current.filter((item) => item.token !== action.token);
  if (action.type === "recover") return current.map((item) => item.token === action.token
    ? { token: item.token, id: item.id, owner: item.owner, status: "recovering", startedAt: item.startedAt } : item);
  return current.map((item) => item.token === action.token
    ? { ...item, status: action.blocked ? "blocked" : "failed", issue: action.issue } : item);
}

export function useWorkbenchOperations(): WorkbenchOperationController {
  const [operations, setOperations] = useState<readonly WorkbenchOperation[]>([]);
  const sequence = useRef(0);
  const begin = useCallback((id: string, owner: string) => {
    sequence.current += 1;
    const token = `${id}:${sequence.current}`;
    setOperations((current) => reduceWorkbenchOperations(current,
      { type: "begin", operation: { token, id, owner, status: "running", startedAt: Date.now() } }));
    return token;
  }, []);
  const finish = useCallback((token: string) => setOperations((current) =>
    reduceWorkbenchOperations(current, { type: "finish", token })), []);
  const fail = useCallback((token: string, issue: WorkbenchIssue, blocked = false) => setOperations((current) =>
    reduceWorkbenchOperations(current, { type: "fail", token, issue, blocked })), []);
  const recover = useCallback((token: string) => setOperations((current) =>
    reduceWorkbenchOperations(current, { type: "recover", token })), []);
  return useMemo(() => ({ operations, busy: operations.some((item) => item.status === "running" || item.status === "recovering"),
    blocked: operations.some((item) => item.status === "blocked"), begin, finish, fail, recover }),
  [begin, fail, finish, operations, recover]);
}
